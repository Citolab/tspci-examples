import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { afterPaint, focusedIn, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Number line",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Canvas = MountedPci["canvas"];
type Root = MountedPci["root"];
const floats = (response: unknown) => (response as { list?: { float: number[] } })?.list?.float;
const text = (response: unknown) => (response as { base?: { string: string } })?.base?.string;
const field = (response: unknown, name: string) =>
  (response as { record: { name: string; base: Record<string, unknown> }[] })?.record.find((f) => f.name === name)?.base;

/** Where a value lies on the screen, on a horizontal line from min to max (the line has 34 px at both ends). */
const at = (root: Root, value: number, min = -3, max = 8) => {
  const svg = root.querySelector<SVGSVGElement>("svg[data-testid=line]")!;
  const r = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  const s = r.width / vb.width;
  const hit = root.querySelector("[data-testid=line-hit]")!.getBoundingClientRect();
  return { clientX: r.left + (34 + ((value - min) / (max - min)) * (vb.width - 68)) * s, clientY: hit.top + hit.height / 2 };
};
const pointer = (type: string, p: { clientX: number; clientY: number }) =>
  new PointerEvent(type, { ...p, bubbles: true, composed: true, pointerId: 1, button: 0, isPrimary: true });

/** A click on the line at a value, with pointer events (as a mouse or a finger). */
const clickLine = async (root: Root, value: number, min?: number, max?: number) => {
  const p = at(root, value, min, max);
  root.querySelector("[data-testid=line-hit]")!.dispatchEvent(pointer("pointerdown", p));
  await afterPaint();
  root.querySelector("svg[data-testid=line]")!.dispatchEvent(pointer("pointerup", p));
  await afterPaint();
};
/** A drag along the line from one value to another. */
const dragLine = async (root: Root, from: number, to: number) => {
  const svg = root.querySelector("svg[data-testid=line]")!;
  root.querySelector("[data-testid=line-hit]")!.dispatchEvent(pointer("pointerdown", at(root, from)));
  await afterPaint();
  for (const v of [from + (to - from) / 2, to]) {
    svg.dispatchEvent(pointer("pointermove", at(root, v)));
    await afterPaint();
  }
  svg.dispatchEvent(pointer("pointerup", at(root, to)));
  await afterPaint();
};
const slider = (canvas: Canvas, name: string | RegExp) => canvas.getByRole("slider", { name });

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText("Place point A at 2.75 and point B at −1¼ on the number line.")).toBeInTheDocument();
    expect(canvas.getByRole("group", { name: /^Number line: Place point A/ })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Point A, not on the line" })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Point B, not on the line" })).toBeInTheDocument();
    expect(canvas.queryAllByRole("slider")).toHaveLength(0);
    expect(canvas.getByRole("button", { name: "Start again" })).toBeDisabled();
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const PlacePoints: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;

    await step("a click on the line places the first point, snapped to a tick", async () => {
      await clickLine(root, 2.8);
      expect(slider(canvas, "Point A")).toHaveAttribute("aria-valuetext", "A: 2 3/4");
      expect(canvas.getByRole("status")).toHaveTextContent("A at 2 3/4.");
      // not complete yet: nothing to score
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("choose B, then click the line", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Point B, not on the line" }));
      expect(canvas.getByRole("button", { name: "Point B, not on the line" })).toHaveAttribute("aria-pressed", "true");
      expect(canvas.getByRole("status")).toHaveTextContent("B chosen: click the line to place it.");
      await clickLine(root, -1.25);
      expect(floats(await lastChange(mounted))).toEqual([2.75, -1.25]);
      expect(canvas.getByText("All points are on the line.")).toBeInTheDocument();
    });

    await step("start again", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Start again" }));
      expect(canvas.queryAllByRole("slider")).toHaveLength(0);
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci, root } = await openPci(canvasElement);

    await step("Enter on a point puts it in the middle and focuses it", async () => {
      canvas.getByRole("button", { name: "Point A, not on the line" }).focus();
      await userEvent.keyboard("{Enter}");
      await afterPaint();
      const a = slider(canvas, "Point A");
      expect(a).toHaveAttribute("aria-valuenow", "2.5");
      await waitFor(() => expect(focusedIn(root)).toBe(a));
    });

    await step("arrows: a tick; Shift + arrow: a labelled step; Home and End", async () => {
      await userEvent.keyboard("{ArrowRight}");
      expect(slider(canvas, "Point A")).toHaveAttribute("aria-valuenow", "2.75");
      await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}");
      expect(slider(canvas, "Point A")).toHaveAttribute("aria-valuetext", "A: 1 3/4");
      await userEvent.keyboard("{PageUp}{PageUp}");
      expect(slider(canvas, "Point A")).toHaveAttribute("aria-valuenow", "3.75");
      await userEvent.keyboard("{Home}");
      expect(slider(canvas, "Point A")).toHaveAttribute("aria-valuetext", "A: −3");
      await userEvent.keyboard("{End}");
      expect(slider(canvas, "Point A")).toHaveAttribute("aria-valuenow", "8");
    });

    await step("Delete takes it off the line, back in the tray", async () => {
      await userEvent.keyboard("{Delete}");
      expect(canvas.queryByRole("slider", { name: "Point A" })).toBeNull();
      expect(canvas.getByRole("status")).toHaveTextContent("A is off the line.");
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("help", async () => {
      await userEvent.click(canvas.getByText("Help"));
      expect(canvas.getByText(/Arrow keys move the chosen point one step/)).toBeVisible();
    });
  },
};

export const MarkAnInterval: Story = {
  args: { properties: { mode: "interval", showValues: "true" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;

    await step("drag along the line: a closed interval", async () => {
      expect(canvas.getByText("Mark all numbers x with x ≥ −2 on the number line.")).toBeInTheDocument();
      await dragLine(root, -2, 5);
      expect(text(await lastChange(mounted))).toBe("[-2,5]");
      expect(canvas.getByTestId("inequality")).toHaveTextContent("−2 ≤ x ≤ 5");
    });

    await step("the right end runs on; the left end open with Enter, then closed again", async () => {
      await userEvent.click(canvas.getAllByRole("radio", { name: "No end (runs on)" })[1]);
      expect(text(pci.getResponse())).toBe("[-2,inf)");
      expect(canvas.queryByRole("slider", { name: /Right end/ })).toBeNull();
      slider(canvas, "Left end of the interval").focus();
      await userEvent.keyboard("{Enter}");
      expect(text(pci.getResponse())).toBe("(-2,inf)");
      expect(slider(canvas, "Left end of the interval")).toHaveAttribute("aria-valuetext", "−2, Open ○ (not included)");
      await userEvent.click(canvas.getAllByRole("radio", { name: "Closed ● (included)" })[0]);
      expect(canvas.getByTestId("inequality")).toHaveTextContent("x ≥ −2");
    });

    await step("remove it and mark one with the keyboard", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Remove the interval" }));
      expect(pci.getResponse()).toBeUndefined();
      await userEvent.click(canvas.getByRole("button", { name: "Mark an interval" }));
      // the new interval's slider gets the focus after the next paint
      await afterPaint();
      await userEvent.keyboard("{ArrowLeft}");
      expect(text(pci.getResponse())).toBe("[0.5,4.25]");
    });
  },
};

export const Jumps: Story = {
  args: { properties: { mode: "jumps", showValues: "true" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;

    await step("the start is given: click where the jumps land", async () => {
      expect(canvas.getByText(/^Start at 2\. Draw the jumps/)).toBeInTheDocument();
      expect(pci.getResponse()).toBeUndefined();
      await clickLine(root, 6);
      expect(canvas.getByRole("status")).toHaveTextContent("Jump 1: +4, from 2 to 6.");
      await clickLine(root, 3);
      expect(floats(await lastChange(mounted))).toEqual([2, 6, 3]);
      expect(canvas.getByTestId("sum")).toHaveTextContent("2 + 4 − 3 = 3");
      expect(canvas.getByTestId("arc-2")).toBeInTheDocument();
    });

    await step("add a jump with the keyboard, change it, remove it", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "+ Add a jump" }));
      await afterPaint();
      const jump = slider(canvas, "Jump 3: landing point");
      await waitFor(() => expect(focusedIn(root)).toBe(jump));
      await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}");
      expect(floats(pci.getResponse())).toEqual([2, 6, 3, 2.25]);
      expect(jump).toHaveAttribute("aria-valuetext", "2 1/4 (−3/4)");
      await userEvent.click(canvas.getByRole("button", { name: "Remove the last jump" }));
      expect(floats(pci.getResponse())).toEqual([2, 6, 3]);
    });
  },
};

export const OwnStart: Story = {
  args: { properties: { mode: "jumps", task: JSON.stringify({ jumps: { givenStart: false, answer: [1, 5] } }), prompt: "Show 1 + 4." } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Place the start" }));
    await afterPaint();
    expect(slider(canvas, "Start")).toHaveAttribute("aria-valuenow", "2.5");
    // the start alone is an answer already
    expect(floats(pci.getResponse())).toEqual([2.5]);
    await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}{ArrowLeft}{ArrowLeft}");
    await userEvent.click(canvas.getByRole("button", { name: "+ Add a jump" }));
    expect(floats(pci.getResponse())).toEqual([1, 1.25]);
  },
};

export const ReadOff: Story = {
  args: { properties: { mode: "read", language: "nl" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await step("two points and a box in place of the 6", async () => {
      expect(canvas.getByText(/^Bij welke getallen staan de punten A en B/)).toBeInTheDocument();
      expect(canvas.getByRole("textbox", { name: "Getal in hokje 1" })).toBeInTheDocument();
    });
    await step("type the values: a fraction, a decimal comma; letters are refused", async () => {
      await userEvent.type(canvas.getByRole("textbox", { name: "Getal bij punt A" }), "4½");
      await userEvent.type(canvas.getByRole("textbox", { name: "Getal bij punt B" }), "-1,75");
      expect(pci.getResponse()).toBeUndefined();
      await userEvent.type(canvas.getByRole("textbox", { name: "Getal in hokje 1" }), "x6");
      expect(canvas.getByRole("textbox", { name: "Getal in hokje 1" })).toHaveValue("6");
      expect(floats(await lastChange(mounted))).toEqual([4.5, -1.75, 6]);
    });
    await step("not a number: marked, and no response", async () => {
      await retype(canvas.getByRole("textbox", { name: "Getal in hokje 1" }), "6/0");
      expect(canvas.getByRole("textbox", { name: "Getal in hokje 1" })).toHaveAttribute("aria-invalid", "true");
      expect(canvas.getByTestId("invalid")).toHaveTextContent("Geen getal");
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const ScoredByThePci: Story = {
  args: { properties: { scoring: "pci", task: JSON.stringify({ points: [{ label: "P", answer: 0.5 }, { label: "Q", answer: 3 }], tolerance: 0.25 }), prompt: "Place P at ½ and Q at 3." } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root } = mounted;
    await clickLine(root, 0.75);
    const r = await lastChange(mounted);
    // within the margin; Q not placed yet: a record anyway, for partial credit
    expect(field(r, "check1")).toEqual({ integer: 1 });
    expect(field(r, "check2")).toEqual({ integer: 0 });
    expect(field(r, "score")).toEqual({ integer: 1 });
    expect(field(r, "maxscore")).toEqual({ integer: 2 });
    expect(field(r, "correct")).toEqual({ integer: 0 });
    expect(field(r, "answer")).toEqual({ string: "0.75 ?" });
    expect(slider(canvas, "Point P")).toBeInTheDocument();
  },
};

export const DecimalsAndHiddenNumbers: Story = {
  args: { properties: { min: "0", max: "2", tickStep: "0.1", labelStep: "0.5", numberFormat: "decimal", hiddenLabels: "1", snap: "half", prompt: "Place A at 1.35.", task: JSON.stringify({ points: [{ label: "A", answer: 1.35 }] }) } },
  play: async ({ canvasElement }) => {
    const { canvas, pci, root } = await openPci(canvasElement);
    // 0, 0.5, 1.5 and 2 are labelled; 1 is hidden
    const labels = [...root.querySelectorAll("svg[data-testid=line] text")].map((t) => t.textContent);
    expect(labels).toEqual(["0", "0.5", "1.5", "2"]);
    await clickLine(root, 1.35, 0, 2);
    expect(floats(pci.getResponse())).toEqual([1.35]);
    // half ticks: the arrow keys move 0.05
    slider(canvas, "Point A").focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(floats(pci.getResponse())).toEqual([1.4]);
  },
};

export const Vertical: Story = {
  args: {
    properties: {
      mode: "points", orientation: "vertical", length: "360", min: "-10", max: "10", tickStep: "1", labelStep: "5", numberFormat: "decimal",
      prompt: "The thermometer: it is −4 °C. Place T there.", task: JSON.stringify({ points: [{ label: "T", answer: -4 }] }),
    },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci, root } = await openPci(canvasElement);
    const svg = root.querySelector("svg[data-testid=line]")!.getBoundingClientRect();
    expect(svg.height).toBeGreaterThan(svg.width);
    canvas.getByRole("button", { name: "Point T, not on the line" }).focus();
    await userEvent.keyboard("{Enter}");
    await afterPaint();
    const t = slider(canvas, "Point T");
    expect(t).toHaveAttribute("aria-orientation", "vertical");
    t.focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(floats(pci.getResponse())).toEqual([-4]);
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", numberFormat: "decimal" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci, root } = await openPci(canvasElement);
    expect(canvas.getByText("Zet punt A bij 2,75 en punt B bij −1¼ op de getallenlijn.")).toBeInTheDocument();
    await clickLine(root, 2.75);
    expect(slider(canvas, "Punt A")).toHaveAttribute("aria-valuetext", "A: 2,75");
    expect(canvas.getByRole("status")).toHaveTextContent("A bij 2,75.");
    expect(canvas.getByRole("button", { name: "Opnieuw" })).toBeEnabled();
    await userEvent.click(canvas.getByRole("button", { name: "Punt B, niet op de lijn" }));
    await clickLine(root, -1.5);
    // the response does not depend on the language
    expect(floats(pci.getResponse())).toEqual([2.75, -1.5]);
  },
};

export const RestoresState: Story = {
  args: { properties: { mode: "jumps" } },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await clickLine(first.root, 7);
    await clickLine(first.root, 1);
    const state = first.pci.getState();
    expect(JSON.parse(state).state.answer.landings).toEqual([7, 1]);

    const second = await remountPci(canvasElement, pci, { properties: { mode: "jumps" }, state });
    expect(floats(second.pci.getResponse())).toEqual([2, 7, 1]);
    expect(second.canvas.getByTestId("arc-2")).toBeInTheDocument();
    expect(second.changes).toHaveLength(0);
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: { list: { float: [2.75, -1.25] } } } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("the bound response is on the line", async () => {
      await waitFor(() => expect(slider(canvas, "Point B")).toHaveAttribute("aria-valuenow", "-1.25"));
      expect(floats(pci.getResponse())).toEqual([2.75, -1.25]);
    });
    await step("setResponse, resetResponse", async () => {
      pci.setResponse({ list: { float: [0, 1] } });
      await waitFor(() => expect(slider(canvas, "Point A")).toHaveAttribute("aria-valuenow", "0"));
      pci.resetResponse();
      await waitFor(() => expect(canvas.queryAllByRole("slider")).toHaveLength(0));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: { status: "solution", properties: { mode: "interval" }, state: JSON.stringify({ state: { answer: { points: [], interval: { from: 0, to: 1, fromEnd: "open", toEnd: "open" }, start: null, landings: [], read: [] } }, log: [] }) },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the correct interval from the settings replaces the candidate's; nothing to change
    await waitFor(() => expect(text(pci.getResponse())).toBe("[-2,inf)"));
    expect(slider(canvas, "Left end of the interval")).toHaveAttribute("aria-readonly", "true");
    expect(canvas.queryByRole("button", { name: "Start again" })).toBeNull();
    expect(canvas.getByRole("status")).toHaveTextContent("The correct answer.");
  },
};

export const SolutionFromTheDeclaration: Story = {
  args: { status: "solution", responseDeclaration: { cardinality: "ordered", baseType: "float", correctResponse: { value: ["-2", "5"] } } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    await waitFor(() => expect(slider(canvas, "Point A")).toHaveAttribute("aria-valuenow", "-2"));
    expect(slider(canvas, "Point B")).toHaveAttribute("aria-valuenow", "5");
  },
};

/** Two interactions of this type on one page: each has its own line and response. */
export const TwoInstances: Story = {
  render: (args) => {
    const page = document.createElement("div");
    for (const id of ["first", "second"]) {
      const slot = document.createElement("div");
      slot.dataset.slot = id;
      slot.appendChild(mountPci(pci, args));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=first]")!);
    const second = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=second]")!);
    expect(first.pci).not.toBe(second.pci);
    await clickLine(first.root, 1);
    await clickLine(first.root, 2);
    await clickLine(second.root, 5);
    expect(floats(first.pci.getResponse())).toEqual([1, 2]);
    expect(second.pci.getResponse()).toBeUndefined();
    expect(second.canvas.getByRole("slider", { name: "Point A" })).toHaveAttribute("aria-valuenow", "5");
    expect(first.changes).toHaveLength(2);
    expect(second.changes).toHaveLength(1);
  },
};

// --- Authoring mode: what an authoring system shows the item author (getAuthoringInstance)

/** The authoring mode, as an authoring system shows it after "Set up the number line…". */
export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, root, changes } = await openAuthoring(canvasElement);
    const task = () => JSON.parse(instance.getProperties().task);

    await step("starts from the example, which is valid", async () => {
      expect(instance.validate()).toEqual([]);
      expect(instance.getProperties()).toMatchObject({ min: "-3", max: "8", tickStep: "1/4", labelStep: "1", numberFormat: "mixed", hiddenLabels: "" });
      expect(task().points).toEqual([{ label: "A", answer: 2.75 }, { label: "B", answer: -1.25 }]);
    });

    await step("click a number on the line to hide it", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "5" }));
      expect(instance.getProperties().hiddenLabels).toBe("5");
      expect(canvas.getByRole("button", { name: "5" })).toHaveAttribute("aria-pressed", "true");
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("a line that ends too soon is a problem", async () => {
      await retype(canvas.getByTestId("raw-max"), "2");
      expect(instance.validate()).toEqual(["A is not on the line."]);
      await retype(canvas.getByTestId("raw-max"), "8");
      expect(instance.validate()).toEqual([]);
    });

    await step("add a point and place it on the line", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "+ Add a point" }));
      expect(instance.validate()).toEqual(["Place point C on the line."]);
      await clickLine(root, 7);
      expect(task().points[2]).toEqual({ label: "C", answer: 7 });
      expect(instance.validate()).toEqual([]);
    });

    await step("a margin, in the task and the response processing", async () => {
      await retype(canvas.getByTestId("tolerance"), "0.25");
      canvas.getByTestId("tolerance").dispatchEvent(new Event("change", { bubbles: true }));
      await waitFor(() => expect(task().tolerance).toBe(0.25));
      expect(canvas.getByTestId("xml").textContent).toContain('tolerance="0.25"');
      expect(canvas.getByTestId("xml").textContent).toContain('<qti-value>3</qti-value>');
    });
  },
};

export const AuthoringJumpsInDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { mode: "jumps", task: JSON.stringify({ jumps: { givenStart: true, answer: [] } }) } },
  play: async ({ canvasElement }) => {
    const { instance, canvas, root } = await openAuthoring(canvasElement);
    expect(instance.validate()).toEqual(["Teken de goede sprongen: een begin en minstens één sprong."]);
    await clickLine(root, 1);
    await clickLine(root, 4);
    expect(JSON.parse(instance.getProperties().task).jumps).toEqual({ givenStart: true, answer: [1, 4] });
    expect(instance.validate()).toEqual([]);
    await userEvent.click(canvas.getByRole("checkbox", { name: /Het begin is gegeven/ }));
    expect(JSON.parse(instance.getProperties().task).jumps.givenStart).toBe(false);
  },
};
