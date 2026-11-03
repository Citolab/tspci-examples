import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { afterPaint, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Force vector",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

const PROMPT = "A lamp that weighs 30 N hangs from the ceiling. Draw the force of gravity on the lamp, starting at point P.";
/** P of the example, in pixels of the drawing (7, 4.75 cm at 40 px per cm). */
const P: [number, number] = [280, 190];

type Root = ShadowRoot | HTMLElement;
const values = (m: { pci: MountedPci["pci"] }) => m.pci.getResponse()?.list?.float;
const board = (root: Root) => root.querySelector<SVGSVGElement>('[data-testid="board"]')!;

/** A drag on the drawing, from and to a point in pixels of the drawing (its viewBox), as pointer events. */
const drag = async (root: Root, from: [number, number], to: [number, number], target?: Element, width = 560) => {
  const svg = board(root);
  const r = svg.getBoundingClientRect();
  const at = ([x, y]: [number, number]) => ({ clientX: r.left + (x * r.width) / width, clientY: r.top + (y * r.width) / width });
  const pointer = { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0 };
  fireEvent.pointerDown(target ?? svg, { ...pointer, ...at(from) });
  await afterPaint();
  for (let i = 1; i <= 4; i++) {
    fireEvent.pointerMove(svg, { ...pointer, buttons: 1, ...at([from[0] + ((to[0] - from[0]) * i) / 4, from[1] + ((to[1] - from[1]) * i) / 4]) });
    await afterPaint();
  }
  fireEvent.pointerUp(svg, { ...pointer, ...at(to) });
  await afterPaint();
};
/** Keys on a focused element of the drawing (an arrow or the ruler). */
const press = async (element: HTMLElement | SVGElement, ...keys: string[]) => {
  (element as HTMLElement).focus();
  for (const key of keys) await userEvent.keyboard(key);
  await afterPaint();
};

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText(PROMPT)).toBeInTheDocument();
    expect(canvas.getByRole("group", { name: PROMPT })).toBeInTheDocument();
    // one arrow, from P, not drawn yet
    const arrow = canvas.getByRole("slider", { name: "Arrow Fg" });
    expect(arrow).toHaveAttribute("aria-valuetext", "Fg: not drawn yet");
    expect(arrow).toHaveAttribute("aria-roledescription", "force arrow");
    expect(canvas.getByText("Scale: 1 cm ≙ 10 N")).toBeInTheDocument();
    expect(canvas.getByRole("slider", { name: "Ruler" })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(canvas.getByRole("button", { name: "Start again" })).toBeDisabled();
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const DrawWithPointer: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root } = mounted;

    await step("drag from P down 3 cm", async () => {
      await drag(root, P, [280, 310]);
      expect(values(mounted)).toEqual([7, 4.75, 270, 3]);
      expect(await lastChange(mounted)).toEqual({ list: { float: [7, 4.75, 270, 3] } });
      expect(canvas.getByTestId("readout-0")).toHaveTextContent("30 N · 3.0 cm");
      expect(canvas.getByRole("slider", { name: "Arrow Fg" })).toHaveAttribute("aria-valuetext", "Fg: 30 N (3.0 cm), direction 270°, point P");
    });

    await step("drag the head to change it", async () => {
      await drag(root, [280, 310], [280, 330], canvas.getByTestId("head-0"));
      expect(values(mounted)).toEqual([7, 4.75, 270, 3.5]);
      expect(canvas.getByTestId("readout-0")).toHaveTextContent("35 N · 3.5 cm");
    });

    await step("a stray drag away from P keeps the arrow", async () => {
      await drag(root, [460, 100], [500, 120]);
      expect(values(mounted)).toEqual([7, 4.75, 270, 3.5]);
    });
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const arrow = mounted.canvas.getByRole("slider", { name: "Arrow Fg" });

    await step("the first arrow key draws 1 cm that way", async () => {
      await press(arrow, "{ArrowDown}");
      expect(values(mounted)).toEqual([7, 4.75, 270, 1]);
    });
    await step("↑ and ↓ change the length, shift for 1 cm", async () => {
      await press(arrow, "{Shift>}{ArrowUp}{ArrowUp}{/Shift}", "{ArrowDown}");
      expect(values(mounted)).toEqual([7, 4.75, 270, 2.9]);
    });
    await step("← and → turn it, shift for 15°", async () => {
      await press(arrow, "{ArrowLeft}", "{Shift>}{ArrowRight}{/Shift}");
      expect(values(mounted)).toEqual([7, 4.75, 256, 2.9]);
      expect(mounted.canvas.getByTestId("announce")).toHaveTextContent("Fg: 29 N (2.9 cm), direction 256°, point P");
    });
    await step("Delete removes it", async () => {
      await press(arrow, "{Delete}");
      expect(mounted.pci.getResponse()).toBeUndefined();
      expect(mounted.canvas.getByTestId("announce")).toHaveTextContent("Fg removed");
    });
  },
};

export const UndoAndStartAgain: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root } = mounted;
    await drag(root, P, [280, 310]);
    await drag(root, [280, 310], [400, 190], canvas.getByTestId("head-0"));
    expect(values(mounted)).toEqual([7, 4.75, 0, 3]);
    await userEvent.click(canvas.getByRole("button", { name: "Undo" }));
    expect(values(mounted)).toEqual([7, 4.75, 270, 3]);
    await userEvent.click(canvas.getByRole("button", { name: "Start again" }));
    expect(mounted.pci.getResponse()).toBeUndefined();
    expect(canvas.getByTestId("readout-0")).toHaveTextContent("not drawn yet");
    await userEvent.click(canvas.getByRole("button", { name: "Undo" }));
    expect(values(mounted)).toEqual([7, 4.75, 270, 3]);
  },
};

export const Ruler: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const ruler = () => canvas.getByRole("slider", { name: "Ruler" });

    await step("Page Up and Page Down turn it, the arrow keys move it", async () => {
      const before = ruler().getAttribute("transform");
      await press(ruler(), "{PageDown}", "{Shift>}{PageDown}{/Shift}");
      expect(ruler()).toHaveAttribute("aria-valuetext", "Ruler, at an angle of 16°");
      await press(ruler(), "{ArrowUp}");
      expect(ruler().getAttribute("transform")).not.toBe(before);
    });
    await step("the ruler is a tool: no response", async () => {
      expect(pci.getResponse()).toBeUndefined();
    });
    await step("the candidate can put it away", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Ruler" }));
      expect(canvas.queryByRole("slider", { name: "Ruler" })).toBeNull();
      expect(canvas.getByRole("button", { name: "Ruler" })).toHaveAttribute("aria-pressed", "false");
    });
  },
};

export const WithoutRulerAndLabel: Story = {
  args: { properties: { ruler: "false", showLabel: "none", showScale: "false" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root } = mounted;
    expect(canvas.queryByRole("slider", { name: "Ruler" })).toBeNull();
    expect(canvas.queryByText(/Scale/)).toBeNull();
    await drag(root, P, [280, 310]);
    expect(values(mounted)).toEqual([7, 4.75, 270, 3]);
    // the candidate measures: the size is nowhere, not for a screen reader either
    expect(canvas.queryByTestId("readout")).toBeNull();
    expect(canvas.getByRole("slider", { name: "Arrow Fg" })).toHaveAttribute("aria-valuetext", "Fg: direction 270°, point P");
  },
};

export const TwoArrows: Story = {
  args: {
    properties: {
      arrows: JSON.stringify([{ label: "F_z", start: [7, 4.75], point: "P" }, { label: "F_n", start: null }]),
      angleSnap: "15",
      lengthStep: "0.5",
    },
  },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root } = mounted;

    await step("choose the arrow to draw", async () => {
      const chooser = canvas.getByRole("radiogroup", { name: "Arrow to draw" });
      expect(within(chooser as HTMLElement).getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual(["Arrow Fz", "Arrow Fn"]);
      await userEvent.click(canvas.getByRole("radio", { name: "Arrow Fn" }));
      expect(canvas.getByRole("radio", { name: "Arrow Fn" })).toHaveAttribute("aria-checked", "true");
    });
    await step("a free start: the arrow starts where the candidate presses, snapped to 15° and 0.5 cm", async () => {
      await drag(root, [100, 300], [104, 182]);
      // the first arrow, not drawn: at P, length 0
      expect(values(mounted)).toEqual([7, 4.75, 0, 0, 2.5, 7.5, 90, 3]);
    });
    await step("alt with the arrow keys moves a free arrow", async () => {
      await press(canvas.getByRole("slider", { name: "Arrow Fn" }), "{Alt>}{ArrowRight}{/Alt}");
      expect(values(mounted)!.slice(4)).toEqual([2.6, 7.5, 90, 3]);
    });
    await step("a press on P draws that arrow", async () => {
      await drag(root, P, [280, 110]);
      expect(values(mounted)!.slice(0, 4)).toEqual([7, 4.75, 90, 2]);
    });
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root } = mounted;
    expect(canvas.getByText(/Aan het plafond hangt een lamp van 30 N/)).toBeInTheDocument();
    expect(canvas.getByText("Schaal: 1 cm ≙ 10 N")).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Opnieuw" })).toBeInTheDocument();
    expect(canvas.getByRole("slider", { name: "Meetlat" })).toBeInTheDocument();
    await drag(root, P, [280, 290]);
    expect(canvas.getByTestId("readout-0")).toHaveTextContent("Fz25 N · 2,5 cm");
    expect(canvas.getByRole("slider", { name: "Pijl Fz" })).toHaveAttribute("aria-valuetext", "Fz: 25 N (2,5 cm), richting 270°, punt P");
    // the response is the same in every language
    expect(values(mounted)).toEqual([7, 4.75, 270, 2.5]);
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await drag(first.root, P, [280, 310]);
    await press(first.canvas.getByRole("slider", { name: "Arrow Fg" }), "{ArrowUp}");
    const state = first.pci.getState();
    expect(JSON.parse(state).state.arrows).toEqual([{ x: 7, y: 4.75, angle: 270, length: 3.1 }]);

    const second = await remountPci(canvasElement, pci, { state });
    expect(values(second)).toEqual([7, 4.75, 270, 3.1]);
    expect(second.canvas.getByTestId("readout-0")).toHaveTextContent("31 N · 3.1 cm");
    expect(second.changes).toHaveLength(0);
    // the undo history came along
    await userEvent.click(second.canvas.getByRole("button", { name: "Undo" }));
    expect(values(second)).toEqual([7, 4.75, 270, 3]);
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: { list: { float: [7, 4.75, 90, 2] } } } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(values(mounted)).toEqual([7, 4.75, 90, 2]);
    expect(mounted.canvas.getByTestId("readout-0")).toHaveTextContent("20 N · 2.0 cm");
    expect(mounted.changes).toHaveLength(0);
    // setResponse later, as a player does
    mounted.pci.setResponse({ list: { float: [7, 4.75, 270, 3] } });
    await waitFor(() => expect(mounted.canvas.getByTestId("readout-0")).toHaveTextContent("30 N · 3.0 cm"));
  },
};

export const Solution: Story = {
  args: {
    status: "solution",
    state: JSON.stringify({ state: { arrows: [{ x: 7, y: 4.75, angle: 260, length: 2 }], past: [] }, log: [] }),
    responseDeclaration: { cardinality: "ordered", baseType: "float", correctResponse: { value: ["7", "4.75", "270", "3"] } },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the correct arrow, dashed, next to the candidate's, which stays as it was
    const correct = canvas.getByRole("img", { name: "correct answer: Fg: 30 N (3.0 cm), direction 270°, point P" });
    expect(correct.querySelector("line")).toHaveAttribute("stroke-dasharray", "7 5");
    expect(pci.getResponse()).toEqual({ list: { float: [7, 4.75, 260, 2] } });
  },
};

/** Two interactions of this type in one item: the registered object hands each its own instance. */
export const TwoInstances: Story = {
  render: () => {
    const page = document.createElement("div");
    page.innerHTML = `<div data-testid="first" style="width:600px"></div><div data-testid="second" style="width:600px"></div>`;
    return page;
  },
  play: async ({ canvasElement }) => {
    const hosts = ["first", "second"].map((id) => canvasElement.querySelector<HTMLElement>(`[data-testid="${id}"]`)!);
    const changes: unknown[][] = [[], []];
    const instances = hosts.map((host, i) => {
      host.addEventListener("qti-interaction-changed", (e) => changes[i].push((e as CustomEvent).detail.value));
      const properties = i === 0 ? {} : { language: "nl", newtonPerCm: "20" };
      return pci.getInstance(host, { properties, responseIdentifier: `RESPONSE${i + 1}`, boundTo: {}, onready: () => {} } as any, undefined) as any;
    });
    await afterPaint();
    expect(instances[0]).not.toBe(instances[1]);
    const [one, two] = hosts.map((h) => h.shadowRoot!);

    await drag(one, P, [280, 310]);
    await drag(two, P, [400, 190]);
    expect(instances[0].getResponse()).toEqual({ list: { float: [7, 4.75, 270, 3] } });
    expect(instances[1].getResponse()).toEqual({ list: { float: [7, 4.75, 0, 3] } });
    // each with its own settings and its own events
    expect(within(one as unknown as HTMLElement).getByTestId("readout-0")).toHaveTextContent("30 N · 3.0 cm");
    expect(within(two as unknown as HTMLElement).getByTestId("readout-0")).toHaveTextContent("60 N · 3,0 cm");
    expect(changes).toEqual([[{ list: { float: [7, 4.75, 270, 3] } }], [{ list: { float: [7, 4.75, 0, 3] } }]]);
    instances[0].resetResponse();
    expect(instances[0].getResponse()).toBeUndefined();
    expect(instances[1].getResponse()).toEqual({ list: { float: [7, 4.75, 0, 3] } });
    instances.forEach((x) => x.oncompleted());
  },
};

export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, root, changes } = await openAuthoring(canvasElement);
    const answer = () => JSON.parse(instance.getProperties().answer);
    const arrows = () => JSON.parse(instance.getProperties().arrows);

    await step("starts from the example: the arrow from P, with what is scored as correct shaded", async () => {
      expect(arrows()).toEqual([{ label: "F_g", start: [7, 4.75], point: "P" }]);
      expect(answer()).toEqual({ vectors: [[7, 4.75, 270, 3]], tolerance: { start: 0.3, angle: 5, length: 0.2 } });
      expect(instance.validate!()).toEqual([]);
      expect(canvas.getByTestId("tolerance-0")).toBeInTheDocument();
    });

    await step("a new arrow needs its correct arrow", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "+ Add arrow" }));
      expect(instance.validate!()).toEqual(["Draw the correct arrow for F2."]);
    });

    await step("the author draws it, names it and gives it a free start", async () => {
      await drag(root, [100, 120], [100, 20]);
      expect(instance.validate!()).toEqual([]);
      await retype(canvas.getAllByRole("textbox", { name: "Name" })[1], "F_s");
      await userEvent.click(canvas.getAllByRole("checkbox", { name: "Give the point of application" })[1]);
      expect(arrows()[1]).toEqual({ label: "F_s", start: null, point: "" });
      expect(answer().vectors[1]).toEqual([2.5, 3, 90, 2.5]);
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("tolerances and the response processing", async () => {
      const angle = canvas.getByRole("spinbutton", { name: "Direction, within (°)" });
      (angle as HTMLInputElement).value = "10";
      fireEvent.change(angle);
      await afterPaint();
      expect(answer().tolerance.angle).toBe(10);
      expect(canvas.getByTestId("xml")).toHaveTextContent('<qti-equal tolerance-mode="absolute" tolerance="10">');
      expect(canvas.getByText("4 points")).toBeInTheDocument();
    });

    await step("the correct response follows from the settings", async () => {
      expect(pci.getCorrectResponse!(instance.getProperties() as any)).toEqual({ list: { float: [7, 4.75, 270, 3, 2.5, 3, 90, 2.5] } });
    });
  },
};

export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { arrows: JSON.stringify([{ label: "F_w", start: null }]) } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(instance.validate!()).toEqual(["Teken de goede pijl voor Fw."]);
    expect(canvas.getByRole("button", { name: "+ Pijl toevoegen" })).toBeInTheDocument();
    expect(canvas.getByText("Marges (wat nog goed gerekend wordt)")).toBeInTheDocument();
  },
};
