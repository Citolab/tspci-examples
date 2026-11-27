import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { focusedIn, lastChange, mountPci, openPci, remountPci, retype, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Ratio table",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

const TITLE = "Going to school";
const QUESTION =
  "Linus rides with his bicycle to school. He rides 3 km in 6 minutes. He is 7 kilometers away from school. How many minutes does he take to get to school?";

// The inputs of the table by their id (interaction.tsx): rows and columns count from 1
const $ = <T extends Element = HTMLInputElement>(mounted: MountedPci, selector: string) => {
  const found = mounted.root.querySelector<T>(selector);
  if (!found) throw new Error(`no ${selector} in the PCI`);
  return found;
};
const cell = (mounted: MountedPci, row: number, column: number) => $(mounted, `#cell-${row}-${column}`);
const label = (mounted: MountedPci, row: number) => $(mounted, `#label-${row}`);
/** The number on the arrow from value column i to i + 1, above (top) or below (bottom) the table. */
const arrow = (mounted: MountedPci, side: "top" | "bottom", i: number) => $(mounted, `#arrow-${side}-${i}`);
/** The × or : button of that arrow (en texts: "times", "divided by"), while nothing is chosen. */
const operator = (mounted: MountedPci, side: "top" | "bottom", i: number, name: "times" | "divided by") =>
  arrow(mounted, side, i).parentElement!.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
/** The operator chosen on that arrow, as shown ("×" or ":"), or null. */
const chosen = (mounted: MountedPci, side: "top" | "bottom", i: number) =>
  arrow(mounted, side, i).parentElement!.querySelector(".chosen-operator [aria-hidden]")?.textContent ?? null;
const chooseAgain = (mounted: MountedPci, side: "top" | "bottom", i: number) =>
  arrow(mounted, side, i).parentElement!.querySelector<HTMLButtonElement>(".choose-again");
const valueCells = (mounted: MountedPci) => Array.from(mounted.root.querySelectorAll<HTMLInputElement>("input[id^='cell-']"));
const arrowInputs = (mounted: MountedPci) => Array.from(mounted.root.querySelectorAll<HTMLInputElement>("input[id^='arrow-']"));
/** The answer cell (bottom right, or the author's "?"), and the read-only answer below the table that shows it. */
const answerInput = (mounted: MountedPci) => $(mounted, "input[data-answer]");
const answerShown = (mounted: MountedPci) => $<HTMLOutputElement>(mounted, "output");
const values = (mounted: MountedPci) => valueCells(mounted).map((input) => input.value);

const insertAfter = (mounted: MountedPci, column: number) => mounted.canvas.getByRole("button", { name: `Insert a column after column ${column}` });
const addAtEnd = (mounted: MountedPci) => mounted.canvas.getByRole("button", { name: "Add a column at the end" });
const removeButton = (mounted: MountedPci, column: number) => mounted.canvas.queryByRole("button", { name: `Remove column ${column}` });

type Field = { name: string; base?: { float?: number; boolean?: boolean } };
/** A field of the record response, by name. */
const field = (response: unknown, name: string) => ((response as { record?: Field[] })?.record ?? []).find((f) => f.name === name)?.base;
const answerIn = (response: unknown) => field(response, "answer")?.float;
const fieldNames = (response: unknown) => ((response as { record?: Field[] })?.record ?? []).map((f) => f.name);
const recordWith = (answer: number) => ({ record: [{ name: "answer", base: { float: answer } }] });

/** Sets the text of an input as typing does underneath: the value, then an input event. */
const fill = (input: HTMLInputElement, text: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

/** The element a click at the middle of `element` lands on: another element on top of it would take the click. */
const hit = (mounted: MountedPci, element: Element) => {
  const box = element.getBoundingClientRect();
  return (mounted.root as ShadowRoot).elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
};

/** The ratio table to try out yourself (no test runs on it): with a mouse, a touchscreen or the keyboard. */
export const ToTry: Story = {
  name: "Ratio table, to try",
};

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.getByRole("heading", { name: TITLE })).toBeInTheDocument();
    expect(canvas.getByText(QUESTION)).toBeInTheDocument();
    // two rows with an empty label, two value columns, one arrow above and one below, none of them chosen
    expect(values(mounted)).toEqual(["", "", "", ""]);
    expect(arrowInputs(mounted)).toHaveLength(2);
    for (const side of ["top", "bottom"] as const) {
      for (const name of ["times", "divided by"] as const) expect(operator(mounted, side, 1, name)).toBeInTheDocument();
      expect(chosen(mounted, side, 1)).toBeNull();
    }
    // the answer cell is the bottom-right one; nothing answered yet
    expect(answerInput(mounted)).toBe(cell(mounted, 2, 2));
    expect(answerInput(mounted)).toHaveAttribute("placeholder", "?");
    expect(canvas.getByText("Answer")).toBeInTheDocument();
    expect(answerShown(mounted)).toHaveTextContent("");
    expect(pci.getResponse()).toBeUndefined();
    // a column can be added (between and at the end); at the minimum of two, none can be removed
    expect(insertAfter(mounted, 1)).toBeInTheDocument();
    expect(addAtEnd(mounted)).toBeInTheDocument();
    expect(removeButton(mounted, 1)).toBeNull();
  },
};

/** The worked example with decimals from the explanation: € 1,20 for 0,5 kilo, so 3,5 kilo costs € 8,40. */
export const Answering: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { pci } = mounted;

    await step("the table is working, not the answer", async () => {
      await userEvent.type(label(mounted, 1), "kilo");
      await userEvent.type(cell(mounted, 1, 1), "0,5");
      await userEvent.type(cell(mounted, 2, 1), "1,20");
      await userEvent.type(cell(mounted, 1, 2), "3,5");
      expect(pci.getResponse()).toBeUndefined();
      // but every change is reported, so the player saves the state
      expect(mounted.changes.length).toBeGreaterThan(0);
    });

    await step("the answer cell is the response, with a decimal comma or point, shown below the table", async () => {
      await userEvent.type(answerInput(mounted), "8,40");
      expect(answerShown(mounted)).toHaveTextContent("8,40");
      expect(answerIn(pci.getResponse())).toBe(8.4);
      expect(answerIn(await lastChange(mounted))).toBe(8.4);
      await retype(answerInput(mounted), "8.4");
      expect(answerIn(pci.getResponse())).toBe(8.4);
      await retype(answerInput(mounted), "14");
      expect(answerIn(pci.getResponse())).toBe(14);
    });

    await step("no number is no answer, and the cell says so", async () => {
      await retype(answerInput(mounted), "14 min");
      expect(pci.getResponse()).toBeUndefined();
      expect(pci.checkValidity()).toBe(false);
      await retype(answerInput(mounted), "{Backspace}");
      expect(pci.getResponse()).toBeUndefined();
      expect(pci.checkValidity()).toBe(true);
    });
  },
};

/** The explanation's tip: leave room for a step in between (20 km → 4 km → 12 km). */
export const Columns: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    await userEvent.type(cell(mounted, 1, 1), "20");
    await userEvent.type(cell(mounted, 1, 2), "12");
    await userEvent.type(arrow(mounted, "top", 1), "9");

    await step("a column inserted between two columns", async () => {
      await userEvent.click(insertAfter(mounted, 1));
      expect(values(mounted)).toEqual(["20", "", "12", "", "", ""]);
      // the arrow that ran from 20 to 12 now ends on the new column: it starts again, as does the new one
      expect(arrowInputs(mounted).map((input) => input.value)).toEqual(["", "", "", ""]);
      // not userEvent: it remembers the "12" it typed in this input element, which now shows the new column
      fill(cell(mounted, 1, 2), "4");
      expect(values(mounted)).toEqual(["20", "4", "12", "", "", ""]);
    });

    await step("up to five columns", async () => {
      await userEvent.click(addAtEnd(mounted));
      await userEvent.click(addAtEnd(mounted));
      expect(valueCells(mounted)).toHaveLength(10);
      expect(mounted.canvas.queryByRole("button", { name: "Add a column at the end" })).toBeNull();
    });

    await step("any column can be removed, down to two", async () => {
      await userEvent.click(removeButton(mounted, 2)!);
      expect(values(mounted)).toEqual(["20", "12", "", "", "", "", "", ""]);
      await userEvent.click(removeButton(mounted, 4)!);
      await userEvent.click(removeButton(mounted, 3)!);
      expect(values(mounted)).toEqual(["20", "12", "", ""]);
      expect(removeButton(mounted, 1)).toBeNull();
    });

    await step("after adding or removing a column the focus goes to a box, not lost with the button", async () => {
      await userEvent.click(addAtEnd(mounted));
      await waitFor(() => expect(focusedIn(mounted.root)).toBe(cell(mounted, 1, 3)));
      await userEvent.click(removeButton(mounted, 3)!);
      await waitFor(() => expect(focusedIn(mounted.root)).toBe(cell(mounted, 1, 2)));
    });
  },
};

export const Arrows: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    await userEvent.click(addAtEnd(mounted));

    await step("every arrow input takes the click, also next to the following arrow", async () => {
      for (const input of arrowInputs(mounted)) expect(hit(mounted, input)).toBe(input);
    });

    await step("× or :, both visible; once chosen, only that one shows, and the focus goes to the number", async () => {
      await userEvent.click(operator(mounted, "top", 1, "divided by")!);
      expect(chosen(mounted, "top", 1)).toBe(":");
      expect(operator(mounted, "top", 1, "times")).toBeNull();
      expect(operator(mounted, "top", 1, "divided by")).toBeNull();
      await waitFor(() => expect(focusedIn(mounted.root)).toBe(arrow(mounted, "top", 1)));
      // each arrow has its own
      expect(chosen(mounted, "bottom", 1)).toBeNull();
    });

    await step("choose again: both are back, with the focus on the first", async () => {
      await userEvent.click(chooseAgain(mounted, "top", 1)!);
      expect(chosen(mounted, "top", 1)).toBeNull();
      await waitFor(() => expect(focusedIn(mounted.root)).toBe(operator(mounted, "top", 1, "times")));
      await userEvent.click(operator(mounted, "top", 1, "times")!);
      expect(chosen(mounted, "top", 1)).toBe("×");
      await userEvent.click(chooseAgain(mounted, "top", 1)!);
      await userEvent.click(operator(mounted, "top", 1, "divided by")!);
    });

    await step("a number on each arrow", async () => {
      await userEvent.type(arrow(mounted, "top", 1), "5");
      await userEvent.type(arrow(mounted, "bottom", 1), "5");
      await userEvent.type(arrow(mounted, "top", 2), "3");
      expect(arrowInputs(mounted).map((input) => input.value)).toEqual(["5", "3", "5", ""]);
      expect(mounted.pci.getResponse()).toBeUndefined();
    });
  },
};

/** What the author gives is in the table and locked; "?" is the answer cell. Their columns stay. */
export const Givens: Story = {
  args: { properties: { labelTop: "km", labelBottom: "minuten", valuesTop: "20; 12", valuesBottom: "50; ?" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(label(mounted, 1)).toHaveValue("km");
    expect(label(mounted, 1)).toHaveAttribute("readonly");
    expect(values(mounted)).toEqual(["20", "12", "50", ""]);
    for (const input of valueCells(mounted).slice(0, 3)) expect(input).toHaveAttribute("readonly");
    expect(answerInput(mounted)).toBe(cell(mounted, 2, 2));
    expect(answerInput(mounted)).not.toHaveAttribute("readonly");

    // the answer cell moves with its column, also when a column is added after it
    await userEvent.click(insertAfter(mounted, 1));
    await userEvent.click(addAtEnd(mounted));
    expect(values(mounted)).toEqual(["20", "", "12", "", "50", "", "", ""]);
    expect(answerInput(mounted)).toBe(cell(mounted, 2, 3));
    await userEvent.type(answerInput(mounted), "30");
    expect(answerIn(mounted.pci.getResponse())).toBe(30);
    // only the new columns can go
    expect(removeButton(mounted, 1)).toBeNull();
    expect(removeButton(mounted, 2)).toBeInTheDocument();
    expect(removeButton(mounted, 3)).toBeNull();
    expect(removeButton(mounted, 4)).toBeInTheDocument();
  },
};

export const RestoreState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.type(label(first, 1), "km");
    await userEvent.type(cell(first, 1, 1), "20");
    await userEvent.type(cell(first, 1, 2), "12");
    await userEvent.click(insertAfter(first, 1));
    await userEvent.type(arrow(first, "top", 1), "5");
    await userEvent.click(operator(first, "top", 1, "divided by")!);
    await userEvent.type(answerInput(first), "30");
    expect(answerInput(first)).toBe(cell(first, 2, 3));
    const state = first.pci.getState();

    // the candidate comes back to the item: everything is as they left it
    const second = await remountPci(canvasElement, pci, { state });
    expect(label(second, 1)).toHaveValue("km");
    expect(values(second)).toEqual(["20", "", "12", "", "", "30"]);
    expect(arrow(second, "top", 1)).toHaveValue("5");
    expect(chosen(second, "top", 1)).toBe(":");
    expect(answerIn(second.pci.getResponse())).toBe(30);
  },
};

export const ForeignState: Story = {
  args: { state: "not a state of this PCI" },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(valueCells(mounted)).toHaveLength(4);
    expect(mounted.pci.getResponse()).toBeUndefined();
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: recordWith(8.4) } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(answerInput(mounted)).toHaveValue("8.4");
    expect(answerIn(mounted.pci.getResponse())).toBe(8.4);
  },
};

export const Solution: Story = {
  args: { status: "solution", responseDeclaration: { correctResponse: { value: recordWith(14) } } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(answerInput(mounted)).toHaveValue("14");
    expect(answerIn(mounted.pci.getResponse())).toBe(14);
    for (const input of [...valueCells(mounted), label(mounted, 1), answerInput(mounted)]) expect(input).toBeDisabled();
    expect(mounted.canvas.queryByRole("button", { name: "Add a column at the end" })).toBeNull();
  },
};

export const Review: Story = {
  args: { status: "review" },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    for (const input of [...valueCells(mounted), ...arrowInputs(mounted), label(mounted, 1), label(mounted, 2)]) expect(input).toBeDisabled();
    expect(operator(mounted, "top", 1, "times")).toBeDisabled();
    expect(mounted.canvas.queryByRole("button", { name: "Add a column at the end" })).toBeNull();
  },
};

export const Settings: Story = {
  args: { properties: { title: "Naar school", question: "Hoeveel minuten fietst Linus naar school?", language: "nl", columns: "3" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByRole("heading", { name: "Naar school" })).toBeInTheDocument();
    expect(canvas.getByText("Hoeveel minuten fietst Linus naar school?")).toBeInTheDocument();
    expect(valueCells(mounted)).toHaveLength(6);
    // the table's own texts in Dutch
    expect(canvas.getByText("Antwoord")).toBeInTheDocument();
    expect(answerInput(mounted)).toBe(cell(mounted, 2, 3));
    expect(canvas.getAllByRole("button", { name: "gedeeld door" })).toHaveLength(4);
    expect(canvas.getByRole("button", { name: "Kolom toevoegen aan het eind" })).toBeInTheDocument();
  },
};

/** The response: the answer and whether the working is correct (answer mode, the default). */
export const Response: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    await userEvent.type(cell(mounted, 1, 1), "3");
    await userEvent.type(cell(mounted, 2, 1), "6");
    await userEvent.type(cell(mounted, 1, 2), "7");
    await userEvent.type(cell(mounted, 2, 2), "14");
    expect(fieldNames(mounted.pci.getResponse())).toEqual(["answer", "working"]);
    expect(answerIn(mounted.pci.getResponse())).toBe(14);
    // the arrows are missing: the answer is right, the working is not complete
    expect(field(mounted.pci.getResponse(), "working")?.boolean).toBe(false);
    await userEvent.click(operator(mounted, "top", 1, "times")!);
    await userEvent.type(arrow(mounted, "top", 1), "7/3");
    expect(field(mounted.pci.getResponse(), "working")?.boolean).toBe(false); // 7/3 is no number on an arrow
  },
};

/** Fill in a table: labels are not needed for the checks. */
async function fillTable(mounted: MountedPci, top: string[], bottom: string[], stepsTop: [string, string][], stepsBottom = stepsTop) {
  for (let i = 2; i < top.length; i++) await userEvent.click(addAtEnd(mounted));
  for (const [row, values] of [top, bottom].entries())
    for (const [column, value] of values.entries()) if (value) await userEvent.type(cell(mounted, row + 1, column + 1), value);
  for (const [side, steps] of [["top", stepsTop], ["bottom", stepsBottom]] as const)
    for (const [i, [op, n]] of steps.entries()) {
      if (op) await userEvent.click(operator(mounted, side, i + 1, op === "×" ? "times" : "divided by")!);
      if (n) await userEvent.type(arrow(mounted, side, i + 1), n);
    }
}
const checks = (mounted: MountedPci) =>
  Object.fromEntries(["answerCorrect", "working", "ratio", "steps", "stepsMatch"].map((name) => [name, field(mounted.pci.getResponse(), name)?.boolean]));
const WORKING = { mode: "working", correctAnswer: "30" };

/** Daan: 20 km in 50 minutes, how long for 12 km? Via 4 km, as in the explanation. */
export const WorkingCorrect: Story = {
  args: { properties: WORKING },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    await fillTable(mounted, ["20", "4", "12"], ["50", "10", "30"], [[":", "5"], ["×", "3"]]);
    expect(answerIn(mounted.pci.getResponse())).toBe(30);
    expect(checks(mounted)).toEqual({ answerCorrect: true, working: true, ratio: true, steps: true, stepsMatch: true });
  },
};

/** Another route is just as good: via 1 km, as the explanation allows. */
export const WorkingOtherRoute: Story = {
  args: { properties: WORKING },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    await fillTable(mounted, ["20", "1", "12"], ["50", "2,5", "30"], [[":", "20"], ["×", "12"]]);
    expect(checks(mounted)).toEqual({ answerCorrect: true, working: true, ratio: true, steps: true, stepsMatch: true });
  },
};

/** The decimals of the cat food: € 1,20 for 0,5 kilo, × 7 for 3,5 kilo. */
export const WorkingDecimals: Story = {
  args: { properties: { mode: "working", correctAnswer: "8,40" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    await fillTable(mounted, ["0,5", "3,5"], ["1,20", "8,40"], [["×", "7"]]);
    expect(checks(mounted)).toEqual({ answerCorrect: true, working: true, ratio: true, steps: true, stepsMatch: true });
  },
};

/** A miscalculation: the steps are right and the same, but 50 : 5 is not 12. */
export const WorkingWrong: Story = {
  args: { properties: WORKING },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    await fillTable(mounted, ["20", "4", "12"], ["50", "12", "36"], [[":", "5"], ["×", "3"]]);
    expect(checks(mounted)).toEqual({ answerCorrect: false, working: false, ratio: false, steps: false, stepsMatch: true });
  },
};

/** Below something else than above: right numbers, but the step below is not the one above. */
export const WorkingStepsDiffer: Story = {
  args: { properties: WORKING },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    await fillTable(mounted, ["20", "4", "12"], ["50", "10", "30"], [[":", "5"], ["×", "3"]], [[":", "5"], ["", "3"]]);
    expect(checks(mounted)).toEqual({ answerCorrect: true, working: false, ratio: true, steps: false, stepsMatch: false });
  },
};

/** The correct response from the settings, in working mode only. */
export const CorrectResponse: Story = {
  play: async () => {
    const correct = pci.getCorrectResponse!({ mode: "working", correctAnswer: "8,40" } as never);
    expect(answerIn(correct)).toBe(8.4);
    expect(fieldNames(correct)).toEqual(["answer", "working", "answerCorrect", "ratio", "steps", "stepsMatch"]);
    expect(pci.getCorrectResponse!({ mode: "answer" } as never)).toBeUndefined();
    expect(pci.getCorrectResponse!({ mode: "working", correctAnswer: "" } as never)).toBeUndefined();
  },
};

/** A tool: scratch paper, no answer, no response. */
export const Tool: Story = {
  args: { properties: { mode: "tool" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    await userEvent.type(cell(mounted, 2, 2), "14");
    expect(mounted.root.querySelector("output")).toBeNull();
    expect(mounted.root.querySelector("input[data-answer]")).toBeNull();
    expect(mounted.pci.getResponse()).toBeUndefined();
  },
};

/** The label of the answer is a setting. */
export const AnswerLabel: Story = {
  args: { properties: { language: "nl", answerLabel: "Aantal minuten" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    expect(canvas.getByText("Aantal minuten")).toBeInTheDocument();
    expect(canvas.queryByText("Antwoord")).toBeNull();
  },
};

/** Validity of the answer cell, as a player asks before it moves on. */
export const Validity: Story = {
  play: async ({ canvasElement }) => {
    const { pci } = await openPci(canvasElement);
    expect(pci.checkValidity()).toBe(true);
    pci.setCustomValidity("Vul een antwoord in.");
    expect(pci.getCustomValidity()).toBe("Vul een antwoord in.");
    expect(pci.checkValidity()).toBe(false);
    pci.setCustomValidity("");
    expect(pci.checkValidity()).toBe(true);
  },
};

/** Two ratio tables on one page: each keeps its own table and answer. */
export const TwoInstances: Story = {
  render: (args) => {
    const page = document.createElement("div");
    for (const id of ["first", "second"]) {
      const slot = document.createElement("div");
      slot.dataset.slot = id;
      slot.appendChild(mountPci(pci, id === "first" ? args : { ...args, properties: { title: "Second table" } }));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=first]")!);
    const second = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=second]")!);
    expect(first.pci).not.toBe(second.pci);
    expect(second.canvas.getByRole("heading", { name: "Second table" })).toBeInTheDocument();
    await userEvent.type(answerInput(first), "14");
    await userEvent.click(addAtEnd(second));
    expect(answerIn(first.pci.getResponse())).toBe(14);
    expect(second.pci.getResponse()).toBeUndefined();
    expect(valueCells(first)).toHaveLength(4);
    await waitFor(() => expect(valueCells(second)).toHaveLength(6));
  },
};
