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

/** The number line to try out yourself (no test runs on it): with a mouse, a touchscreen or the keyboard. */
/** Placing points (the default is the empty number line, so the other modes give it in their settings). */
const POINTS = { mode: "points" };

export const ToTry: Story = {
  name: "Place points, to try",
  args: { properties: POINTS },
};

/** The picture in the README (example.png): the empty number line of the example, worked out via 50. */
export const Example: Story = {
  name: "Example (example.png)",
  args: {
    state: JSON.stringify({
      state: {
        answer: {
          points: [], interval: null, start: null, landings: [], read: [],
          empty: { start: "", jumps: [{ sign: "+", size: "3", landing: "50" }, { sign: "+", size: "30", landing: "80" }, { sign: "+", size: "5", landing: "85" }], answer: "85" },
        },
      },
      log: [],
    }),
  },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    expect(canvas.getByRole("textbox", { name: "Jump 2: how big" })).toHaveValue("30");
    expect(canvas.getByRole("textbox", { name: "Answer" })).toHaveValue("85");
  },
};

/** Without settings: the empty number line of the example, 47 + 38 starting at 47. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText("Work out 47 + 38 on the empty number line. Start at 47.")).toBeInTheDocument();
    expect(canvas.getByRole("textbox", { name: "Start number" })).toHaveValue("47");
    expect(canvas.getByRole("button", { name: /^Make a jump/ })).toBeInTheDocument();
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const PointsExample: Story = {
  args: { properties: POINTS },
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
  args: { properties: POINTS },
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
  args: { properties: POINTS },
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
  args: { properties: { ...POINTS, scoring: "pci", task: JSON.stringify({ points: [{ label: "P", answer: 0.5 }, { label: "Q", answer: 3 }], tolerance: 0.25 }), prompt: "Place P at ½ and Q at 3." } },
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
  args: { properties: { ...POINTS, min: "0", max: "2", tickStep: "0.1", labelStep: "0.5", numberFormat: "decimal", hiddenLabels: "1", snap: "half", prompt: "Place A at 1.35.", task: JSON.stringify({ points: [{ label: "A", answer: 1.35 }] }) } },
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
  args: { properties: { ...POINTS, language: "nl", numberFormat: "decimal" } },
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
  args: { properties: POINTS, boundTo: { RESPONSE: { list: { float: [2.75, -1.25] } } } },
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
  args: { status: "solution", properties: POINTS, responseDeclaration: { cardinality: "ordered", baseType: "float", correctResponse: { value: ["-2", "5"] } } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    await waitFor(() => expect(slider(canvas, "Point A")).toHaveAttribute("aria-valuenow", "-2"));
    expect(slider(canvas, "Point B")).toHaveAttribute("aria-valuenow", "5");
  },
};

/** Two interactions of this type on one page: each has its own line and response. */
export const TwoInstances: Story = {
  args: { properties: POINTS },
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
  args: { language: "en", properties: POINTS },
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

// --- The empty number line (data-mode="empty"): the candidate's own jumps and numbers, checked as a working

const EMPTY = { mode: "empty" };
/** The record of the empty line as { answer, working, answerCorrect }. */
const emptyRecord = (response: unknown) => {
  const record = (response as { record?: { name: string; base: Record<string, unknown> }[] })?.record;
  return record ? Object.fromEntries(record.map((f) => [f.name, Object.values(f.base)[0]])) : undefined;
};
/** The line of the empty number line: a button that opens the choice forward or back. */
const emptyLineButton = (canvas: Canvas) => canvas.getByRole("button", { name: /^(Make a jump|Een sprong maken)/ });
/**
 * Makes a jump on the empty line: a click on the line, the choice forward or back, then its size and where it lands.
 * (Typed into the boxes themselves: userEvent.keyboard types at document.activeElement, which is the host of the
 * shadow root.)
 */
const jump = async (canvas: Canvas, sign: "+" | "-", size: string, landing: string) => {
  const n = canvas.queryAllByRole("textbox", { name: /: (how big|hoe groot)$/ }).length + 1;
  await userEvent.click(emptyLineButton(canvas));
  await userEvent.click(canvas.getByRole("button", { name: sign === "+" ? /Jump forward|Sprong vooruit/ : /Jump back|Sprong terug/ }));
  await userEvent.type(canvas.getByRole("textbox", { name: new RegExp(`^(Jump|Sprong) ${n}: (how big|hoe groot)$`) }), size);
  await userEvent.type(canvas.getByRole("textbox", { name: new RegExp(`^(Jump|Sprong) ${n}: (lands on|kom je uit op)$`) }), landing);
};

/** The empty number line to try out yourself (no test runs on it): with a mouse, a touchscreen or the keyboard. */
export const EmptyNumberLineToTry: Story = {
  name: "Empty number line, to try",
  args: { properties: EMPTY },
};

export const EmptyNumberLine: Story = {
  args: { properties: EMPTY },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("the example: 47 + 38, starting at 47 (given), no ticks and no numbers", async () => {
      expect(canvas.getByText("Work out 47 + 38 on the empty number line. Start at 47.")).toBeInTheDocument();
      expect(canvas.getByRole("textbox", { name: "Start number" })).toHaveValue("47");
      expect(canvas.getByRole("textbox", { name: "Start number" })).toHaveAttribute("readonly");
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("a click on the line opens the choice forward or back", async () => {
      // no buttons under the line: the line itself is the button
      expect(canvas.queryByRole("button", { name: "Jump forward" })).toBeNull();
      // the pointer over the line shows a faint jump from where you are
      const line = emptyLineButton(canvas);
      line.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, composed: true, clientX: line.getBoundingClientRect().left + 400, clientY: line.getBoundingClientRect().top + 10 }));
      await waitFor(() => expect(mounted.root.querySelector("[data-testid=empty-ghost]")).not.toBeNull());
      line.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false, composed: true }));
      await waitFor(() => expect(mounted.root.querySelector("[data-testid=empty-ghost]")).toBeNull());
      // the choice opens with the focus on "Jump forward"; Escape closes it and gives the focus back to the line
      await userEvent.click(line);
      expect(line).toHaveAttribute("aria-expanded", "true");
      await waitFor(() => expect(focusedIn(mounted.root)).toBe(canvas.getByRole("button", { name: "Jump forward" })));
      canvas.getByRole("button", { name: "Jump forward" }).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }));
      await waitFor(() => expect(canvas.queryByRole("group", { name: "Which way?" })).toBeNull());
      await waitFor(() => expect(focusedIn(mounted.root)).toBe(emptyLineButton(canvas)));
      // a tap or click anywhere else closes it too
      await userEvent.click(line);
      expect(canvas.getByRole("group", { name: "Which way?" })).toBeInTheDocument();
      await userEvent.click(canvas.getByText("Work out 47 + 38 on the empty number line. Start at 47."));
      await waitFor(() => expect(canvas.queryByRole("group", { name: "Which way?" })).toBeNull());
      // a choice makes the jump, and the focus goes to its size
      await userEvent.click(line);
      await userEvent.click(canvas.getByRole("button", { name: "Jump forward" }));
      await waitFor(() => expect(focusedIn(mounted.root)).toBe(canvas.getByRole("textbox", { name: "Jump 1: how big" })));
      expect(mounted.root.querySelector("[data-testid=empty-arc-0]")).toHaveAttribute("data-direction", "forward");
      await userEvent.click(canvas.getByRole("button", { name: "Remove jump 1" }));
      expect(mounted.root.querySelector("[data-testid=empty-arc-0]")).toBeNull();
    });

    await step("jumps via the next ten, written as on paper", async () => {
      await jump(canvas, "+", "3", "50");
      expect(canvas.getByRole("textbox", { name: "Jump 1: how big" })).toHaveValue("3");
      expect(canvas.getByRole("textbox", { name: "Jump 1: lands on" })).toHaveValue("50");
      await jump(canvas, "+", "30", "80");
      await jump(canvas, "+", "5", "85");
      expect(mounted.root.querySelectorAll("[data-testid^=empty-arc-][data-direction=forward]")).toHaveLength(3);
      // no answer yet: nothing to report
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("the answer: right, with a correct working", async () => {
      await userEvent.type(canvas.getByRole("textbox", { name: "Answer" }), "85");
      expect(emptyRecord(pci.getResponse())).toEqual({ answer: 85, working: true, answerCorrect: true });
      expect(emptyRecord(await lastChange(mounted))).toEqual({ answer: 85, working: true, answerCorrect: true });
    });

    await step("a jump that does not land where it says: the working is wrong", async () => {
      await retype(canvas.getByRole("textbox", { name: "Jump 2: lands on" }), "70");
      expect(emptyRecord(pci.getResponse())).toEqual({ answer: 85, working: false, answerCorrect: true });
      await retype(canvas.getByRole("textbox", { name: "Jump 2: lands on" }), "80");
    });

    await step("a jump turned around, and taken away", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Jump 3: forward (+). Turn it around" }));
      expect(mounted.root.querySelector("[data-testid=empty-arc-2]")).toHaveAttribute("data-direction", "back");
      expect(emptyRecord(pci.getResponse())?.working).toBe(false); // 80 − 5 is not 85
      await userEvent.click(canvas.getByRole("button", { name: "Remove jump 3" }));
      expect(canvas.queryByRole("textbox", { name: "Jump 3: how big" })).toBeNull();
      await waitFor(() => expect(focusedIn(mounted.root)).toBe(emptyLineButton(canvas)));
      // 47 +3 50 +30 80, and the answer 85 does not follow from it
      expect(emptyRecord(pci.getResponse())).toEqual({ answer: 85, working: false, answerCorrect: true });
    });
  },
};

/** Subtraction by filling up (aanvullen): from 48 to 63; the answer is all the jumps together. */
export const EmptyNumberLineFillingUp: Story = {
  args: {
    properties: { ...EMPTY, language: "nl", prompt: "Hoeveel is 63 − 48? Vul aan vanaf 48.", task: JSON.stringify({ empty: { givenStart: true, start: 48, answer: 15 } }) },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.getByRole("textbox", { name: "Begingetal" })).toHaveValue("48");
    await jump(canvas, "+", "2", "50");
    await jump(canvas, "+", "10", "60");
    await jump(canvas, "+", "3", "63");
    await userEvent.type(canvas.getByRole("textbox", { name: "Antwoord" }), "15");
    expect(emptyRecord(pci.getResponse())).toEqual({ answer: 15, working: true, answerCorrect: true });
  },
};

/** Jumping too far and back (83 − 29 as −30 +1), with the candidate's own start. */
export const EmptyNumberLineJumpBack: Story = {
  args: { properties: { ...EMPTY, prompt: "Work out 83 − 29 on the empty number line.", task: JSON.stringify({ empty: { givenStart: false, answer: 54 } }) } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    const start = canvas.getByRole("textbox", { name: "Start number" });
    expect(start).not.toHaveAttribute("readonly");
    await userEvent.type(start, "83");
    await jump(canvas, "-", "30", "53");
    await jump(canvas, "+", "1", "54");
    expect(mounted.root.querySelector("[data-testid=empty-arc-0]")).toHaveAttribute("data-direction", "back");
    await userEvent.type(canvas.getByRole("textbox", { name: "Answer" }), "54");
    expect(emptyRecord(pci.getResponse())).toEqual({ answer: 54, working: true, answerCorrect: true });
    // letters cannot be typed; a number that is not one is a warning
    await userEvent.type(canvas.getByRole("textbox", { name: "Answer" }), "x");
    expect(canvas.getByRole("textbox", { name: "Answer" })).toHaveValue("54");
    await retype(canvas.getByRole("textbox", { name: "Jump 1: how big" }), "3,0,");
    expect(canvas.getByTestId("invalid")).toBeInTheDocument();
  },
};

export const EmptyNumberLineRestores: Story = {
  args: { properties: EMPTY },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await jump(first.canvas, "+", "38", "85");
    await userEvent.type(first.canvas.getByRole("textbox", { name: "Answer" }), "85");
    const state = first.pci.getState();
    const second = await remountPci(canvasElement, pci, { properties: EMPTY, state });
    expect(second.canvas.getByRole("textbox", { name: "Jump 1: how big" })).toHaveValue("38");
    expect(second.canvas.getByRole("textbox", { name: "Jump 1: lands on" })).toHaveValue("85");
    expect(emptyRecord(second.pci.getResponse())).toEqual({ answer: 85, working: true, answerCorrect: true });
  },
};

/** Review: the author's own working and the correct answer, read-only. */
export const EmptyNumberLineSolution: Story = {
  args: { properties: EMPTY, status: "solution" },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("textbox", { name: "Jump 2: how big" })).toHaveValue("30");
    expect(canvas.getByRole("textbox", { name: "Jump 3: lands on" })).toHaveValue("85");
    expect(canvas.getByRole("textbox", { name: "Answer" })).toHaveValue("85");
    expect(canvas.getByRole("textbox", { name: "Answer" })).toHaveAttribute("readonly");
    expect(canvas.queryByRole("button", { name: /^Make a jump/ })).toBeNull();
    expect(canvas.queryByRole("button", { name: "Remove jump 1" })).toBeNull();
    expect(pci.getCorrectResponse!({ mode: "empty" } as never)).toEqual({
      record: [{ name: "answer", base: { float: 85 } }, { name: "working", base: { boolean: true } }, { name: "answerCorrect", base: { boolean: true } }],
    });
  },
};

/** A response handed back (boundTo): the answer goes in the answer box. */
export const EmptyNumberLineBoundResponse: Story = {
  args: { properties: EMPTY, boundTo: { RESPONSE: { record: [{ name: "answer", base: { float: 85 } }, { name: "working", base: { boolean: false } }] } } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    expect(canvas.getByRole("textbox", { name: "Answer" })).toHaveValue("85");
  },
};

export const AuthoringEmptyNumberLine: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { mode: "empty", task: JSON.stringify({ empty: { givenStart: true } }) } },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    const task = () => JSON.parse(instance.getProperties().task).empty;

    await step("no line settings; the author works out the sum", async () => {
      expect(canvas.queryByTestId("raw-min")).toBeNull();
      expect(instance.validate()).toEqual(["Write the start number on the line, or let the candidate write it.", "Write the correct answer under the line."]);
      await userEvent.type(canvas.getByRole("textbox", { name: "Start number" }), "63");
      await jump(canvas, "-", "40", "23");
      await jump(canvas, "-", "8", "15");
      await userEvent.type(canvas.getByRole("textbox", { name: "Answer" }), "15");
      expect(task()).toEqual({ givenStart: true, start: 63, jumps: [{ size: -40, landing: 23 }, { size: -8, landing: 15 }], answer: 15 });
      expect(instance.validate()).toEqual([]);
      expect(canvas.getByTestId("empty-correct").textContent).toBe("Correct answer: 15");
      expect(canvas.getByTestId("xml").textContent).toContain('<qti-field-value field-identifier="working">');
    });

    await step("the start can be the candidate's", async () => {
      await userEvent.click(canvas.getByTestId("empty-given-start"));
      expect(task().givenStart).toBe(false);
    });
  },
};

// --- The double number line (data-mode="double"): two scales on one strip, the candidate's own marks, checked as a working

const DOUBLE = { mode: "double" };
/** A click on the strip at a place (0: the left end, 1: the right end). */
const clickStrip = async (root: Root, at: number) => {
  const hit = root.querySelector<HTMLElement>("[data-testid=double-hit]")!;
  const r = hit.getBoundingClientRect();
  hit.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, clientX: r.left + at * r.width, clientY: r.top + r.height / 2 }));
  await afterPaint();
};
/** A key on an element in the shadow root (userEvent.keyboard types at the host). */
const press = async (el: HTMLElement, key: string, shiftKey = false) => {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, composed: true, cancelable: true }));
  await afterPaint();
};
/** The numbers above and below mark n, typed into its boxes. */
const pair = async (canvas: Canvas, n: number, top: string, bottom: string) => {
  await userEvent.type(canvas.getByRole("textbox", { name: new RegExp(`^(Mark|Streepje) ${n}: (number above|getal boven)`) }), top);
  await userEvent.type(canvas.getByRole("textbox", { name: new RegExp(`^(Mark|Streepje) ${n}: (number below|getal onder)`) }), bottom);
};

export const DoubleNumberLine: Story = {
  args: { properties: DOUBLE },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;

    await step("the example: a percentage strip from 0 % ↔ € 0 to 100 % ↔ € 80, given and locked", async () => {
      expect(canvas.getByText(/^A coat costs €80\. You get 25% off\./)).toBeInTheDocument();
      expect(root.querySelector("[data-testid=double-line]")).toHaveAttribute("data-look", "strip");
      expect(canvas.getByRole("textbox", { name: "Given 2: number above (%)" })).toHaveValue("100");
      expect(canvas.getByRole("textbox", { name: "Given 2: number below (€)" })).toHaveValue("80");
      expect(canvas.getByRole("textbox", { name: "Given 2: number below (€)" })).toHaveAttribute("readonly");
      expect(canvas.queryAllByRole("slider")).toHaveLength(0);
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("halve, and halve again: a mark in the middle of the free stretch, the focus on its number above", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Add a mark" }));
      await waitFor(() => expect(focusedIn(root)).toBe(canvas.getByRole("textbox", { name: "Mark 1: number above (%)" })));
      expect(slider(canvas, "Mark 1: place on the strip")).toHaveAttribute("aria-valuenow", "50");
      expect(canvas.getByRole("status")).toHaveTextContent("Mark 1 added");
      await pair(canvas, 1, "50", "40");
      await userEvent.click(canvas.getByRole("button", { name: "Add a mark" }));
      expect(slider(canvas, "Mark 2: place on the strip")).toHaveAttribute("aria-valuenow", "25");
      expect(root.querySelector("[data-testid=double-shade]")).toBeNull();
      await pair(canvas, 2, "25%", "€ 20");
      // shaded up to the question's 25 %
      expect(root.querySelector("[data-testid=double-shade]")).not.toBeNull();
      expect(slider(canvas, "Mark 2: place on the strip")).toHaveAttribute("aria-valuetext", "25 of 100, between 0 % / 0 € and 50 % / 40 €");
      // no answer yet: nothing to report
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("the answer: right, with a correct working", async () => {
      await userEvent.type(canvas.getByRole("textbox", { name: "Answer" }), "20");
      expect(emptyRecord(pci.getResponse())).toEqual({ answer: 20, working: true, answerCorrect: true });
      expect(emptyRecord(await lastChange(mounted))).toEqual({ answer: 20, working: true, answerCorrect: true });
    });

    await step("a pair out of proportion: the working is wrong", async () => {
      await retype(canvas.getByRole("textbox", { name: "Mark 2: number below (€)" }), "25");
      expect(emptyRecord(pci.getResponse())).toEqual({ answer: 20, working: false, answerCorrect: true });
      await retype(canvas.getByRole("textbox", { name: "Mark 2: number below (€)" }), "20");
      expect(emptyRecord(pci.getResponse())?.working).toBe(true);
    });

    await step("a mark out of order, with the keyboard; and back", async () => {
      const mark = slider(canvas, "Mark 2: place on the strip");
      await press(mark, "End");
      expect(mark).toHaveAttribute("aria-valuenow", "100");
      expect(emptyRecord(pci.getResponse())?.working).toBe(false); // 25 % to the right of 50 %
      await press(mark, "Home");
      await press(mark, "ArrowRight", true);
      await press(mark, "ArrowRight", true);
      await press(mark, "ArrowRight");
      expect(mark).toHaveAttribute("aria-valuenow", "21");
      expect(emptyRecord(pci.getResponse())?.working).toBe(true);
    });

    await step("Delete takes a mark away; the answer no longer follows", async () => {
      await press(slider(canvas, "Mark 2: place on the strip"), "Delete");
      expect(canvas.queryByRole("slider", { name: "Mark 2: place on the strip" })).toBeNull();
      await waitFor(() => expect(focusedIn(root)).toBe(canvas.getByRole("button", { name: "Add a mark" })));
      expect(emptyRecord(pci.getResponse())).toEqual({ answer: 20, working: false, answerCorrect: true });
    });
  },
};

/** Two quantities in proportion on a plain double number line, with the pointer and the candidate's own route; in Dutch. */
export const DoubleNumberLineOwnRoute: Story = {
  args: {
    properties: {
      ...DOUBLE, language: "nl", prompt: "Een fietser rijdt 12 km in 40 minuten. Hoeveel km rijdt hij in een uur?",
      task: JSON.stringify({ double: { topLabel: "km", bottomLabel: "min", look: "line", given: [{ top: 0, bottom: 0 }, { top: 12, bottom: 40 }], question: { bottom: 60 }, answer: 18 } }),
    },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;
    expect(root.querySelector("[data-testid=double-line]")).toHaveAttribute("data-look", "line");
    expect(canvas.getByTestId("double-top-label")).toHaveTextContent("km");
    // a click on the line puts a mark there
    await clickStrip(root, 0.33);
    expect(slider(canvas, "Streepje 1: plaats op de strook")).toHaveAttribute("aria-valuenow", "33");
    await pair(canvas, 1, "6", "20");
    await clickStrip(root, 0.97);
    await pair(canvas, 2, "18", "60");
    await userEvent.type(canvas.getByRole("textbox", { name: "Antwoord" }), "18");
    expect(emptyRecord(pci.getResponse())).toEqual({ answer: 18, working: true, answerCorrect: true });
    // the minutes are not the answer: the question asks for the km above the 60
    await retype(canvas.getByRole("textbox", { name: "Antwoord" }), "60");
    expect(emptyRecord(pci.getResponse())).toEqual({ answer: 60, working: false, answerCorrect: false });
    // letters cannot be typed; a number that is not one is a warning
    await userEvent.type(canvas.getByRole("textbox", { name: "Antwoord" }), "x");
    expect(canvas.getByRole("textbox", { name: "Antwoord" })).toHaveValue("60");
    await retype(canvas.getByRole("textbox", { name: "Streepje 1: getal boven (km)" }), "6,,");
    expect(canvas.getByTestId("invalid")).toBeInTheDocument();
  },
};

export const DoubleNumberLineRestores: Story = {
  args: { properties: DOUBLE },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await clickStrip(first.root, 0.3);
    await pair(first.canvas, 1, "25", "20");
    await userEvent.type(first.canvas.getByRole("textbox", { name: "Answer" }), "20");
    const state = first.pci.getState();
    const second = await remountPci(canvasElement, pci, { properties: DOUBLE, state });
    expect(second.canvas.getByRole("textbox", { name: "Mark 1: number below (€)" })).toHaveValue("20");
    expect(slider(second.canvas, "Mark 1: place on the strip")).toHaveAttribute("aria-valuenow", "30");
    expect(emptyRecord(second.pci.getResponse())).toEqual({ answer: 20, working: true, answerCorrect: true });
    expect(second.changes).toHaveLength(0);
  },
};

/** Review: the author's own working and the correct answer, read-only. */
export const DoubleNumberLineSolution: Story = {
  args: { properties: DOUBLE, status: "solution" },
  play: async ({ canvasElement }) => {
    const { canvas, pci, root } = await openPci(canvasElement);
    expect(canvas.getByRole("textbox", { name: "Mark 1: number below (€)" })).toHaveValue("40");
    expect(canvas.getByRole("textbox", { name: "Mark 2: number above (%)" })).toHaveValue("25");
    expect(canvas.getByRole("textbox", { name: "Answer" })).toHaveValue("20");
    expect(canvas.getByRole("textbox", { name: "Answer" })).toHaveAttribute("readonly");
    expect(slider(canvas, "Mark 1: place on the strip")).toHaveAttribute("aria-readonly", "true");
    expect(canvas.queryByRole("button", { name: "Add a mark" })).toBeNull();
    expect(root.querySelector("[data-testid=double-shade]")).not.toBeNull();
    expect(pci.getCorrectResponse!({ mode: "double" } as never)).toEqual({
      record: [{ name: "answer", base: { float: 20 } }, { name: "working", base: { boolean: true } }, { name: "answerCorrect", base: { boolean: true } }],
    });
  },
};

/** A response handed back (boundTo): the answer goes in the answer box. */
export const DoubleNumberLineBoundResponse: Story = {
  args: { properties: DOUBLE, boundTo: { RESPONSE: { record: [{ name: "answer", base: { float: 20 } }, { name: "working", base: { boolean: false } }] } } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("textbox", { name: "Answer" })).toHaveValue("20");
    pci.setResponse({ record: [{ name: "answer", base: { float: 12.5 } }] } as never);
    await waitFor(() => expect(canvas.getByRole("textbox", { name: "Answer" })).toHaveValue("12.5"));
  },
};

export const AuthoringDoubleNumberLine: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { mode: "double", task: JSON.stringify({ double: {} }) } },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    const task = () => JSON.parse(instance.getProperties().task).double;
    const handle = (n: number) => canvas.getByRole("slider", { name: `Mark ${n}: place on the strip` });

    await step("no line settings; nothing given yet", async () => {
      expect(canvas.queryByTestId("raw-min")).toBeNull();
      expect(instance.validate()).toEqual([
        'Give at least two pairs: tick "given" at two marks with both numbers written.',
        "Write the question's number, above or below.",
        "Write the correct answer under the strip.",
      ]);
    });

    await step("the scales and the given pairs at the ends", async () => {
      await userEvent.type(canvas.getByTestId("double-topLabel"), "%");
      await userEvent.type(canvas.getByTestId("double-bottomLabel"), "€");
      await userEvent.click(canvas.getByRole("button", { name: "Add a mark" }));
      await press(handle(1), "Home");
      await pair(canvas, 1, "0", "0");
      await userEvent.click(canvas.getByRole("button", { name: "Add a mark" }));
      await press(handle(2), "End");
      await pair(canvas, 2, "100", "80");
      await userEvent.click(canvas.getByRole("checkbox", { name: "0 % ↔ 0 €: given (the candidate sees it)" }));
      await userEvent.click(canvas.getByRole("checkbox", { name: "100 % ↔ 80 €: given (the candidate sees it)" }));
      expect(task().given).toEqual([{ top: 0, bottom: 0, at: 0 }, { top: 100, bottom: 80, at: 1 }]);
    });

    await step("the question, the working on the strip and the answer", async () => {
      await userEvent.type(canvas.getByTestId("double-question"), "25");
      expect(task().question).toEqual({ top: 25, bottom: null });
      await userEvent.click(canvas.getByRole("button", { name: "Add a mark" }));
      await pair(canvas, 3, "50", "40");
      await userEvent.click(canvas.getByRole("button", { name: "Add a mark" }));
      await pair(canvas, 4, "25", "20");
      await userEvent.type(canvas.getByRole("textbox", { name: "Answer" }), "20");
      expect(task()).toEqual({
        topLabel: "%", bottomLabel: "€", look: "strip", given: [{ top: 0, bottom: 0, at: 0 }, { top: 100, bottom: 80, at: 1 }],
        question: { top: 25, bottom: null }, marks: [{ top: 50, bottom: 40, at: 0.5 }, { top: 25, bottom: 20, at: 0.25 }], answer: 20,
      });
      expect(instance.validate()).toEqual([]);
      expect(canvas.getByTestId("double-correct").textContent).toBe("Correct answer: 20");
      expect(canvas.getByTestId("xml").textContent).toContain("every pair in proportion");
    });

    await step("an answer that does not fit, the other look, the question below", async () => {
      await retype(canvas.getByRole("textbox", { name: "Answer" }), "25");
      expect(instance.validate()).toEqual(["The answer does not fit the given pairs: that would be 20."]);
      await retype(canvas.getByRole("textbox", { name: "Answer" }), "20");
      await userEvent.selectOptions(canvas.getByTestId("double-look"), "line");
      expect(task().look).toBe("line");
      await userEvent.selectOptions(canvas.getByTestId("double-ask"), "top");
      expect(task().question).toEqual({ top: null, bottom: 25 });
    });
  },
};
