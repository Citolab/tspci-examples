import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { focusedIn, lastChange, mountPci, openPci, remountPci, retype, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Written calculation",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

// The boxes by their id (interaction.tsx): rows count from 1
const $ = <T extends Element = HTMLInputElement>(mounted: MountedPci, selector: string) => {
  const found = mounted.root.querySelector<T>(selector);
  if (!found) throw new Error(`no ${selector} in the PCI`);
  return found;
};
const bite = (mounted: MountedPci, i: number) => $(mounted, `#bite-${i}`);
const factor = (mounted: MountedPci, i: number) => $(mounted, `#factor-${i}`);
const rest = (mounted: MountedPci, i: number) => $(mounted, `#rest-${i}`);
const partial = (mounted: MountedPci, i: number) => $(mounted, `#partial-${i}`);
const answer = (mounted: MountedPci) => $(mounted, "#answer");
const remainder = (mounted: MountedPci) => $(mounted, "#remainder");
const inputs = (mounted: MountedPci) => Array.from(mounted.root.querySelectorAll<HTMLInputElement>("input"));
const bites = (mounted: MountedPci) => mounted.root.querySelectorAll("input[id^='bite-']").length;

type Field = { name: string; base?: { float?: number; integer?: number; boolean?: boolean } };
const fields = (response: unknown) =>
  Object.fromEntries(((response as { record?: Field[] })?.record ?? []).map((f) => [f.name, f.base?.float ?? f.base?.integer ?? f.base?.boolean]));

/** Writes the bites of the hapmethode: [bite, factor, rest] per row (adds rows when needed). */
async function chunk(mounted: MountedPci, rows: [string, string, string][], factorTotal = "") {
  for (const [i, [b, f, r]] of rows.entries()) {
    while (bites(mounted) < i + 1) await userEvent.click(mounted.canvas.getByRole("button", { name: /Another bite|Nog een hap/ }));
    if (b) await userEvent.type(bite(mounted, i + 1), b);
    if (f) await userEvent.type(factor(mounted, i + 1), f);
    if (r) await userEvent.type(rest(mounted, i + 1), r);
  }
  if (factorTotal) await userEvent.type($(mounted, "#factor-total"), factorTotal);
}
async function columns(mounted: MountedPci, partials: string[], total = "") {
  for (const [i, p] of partials.entries()) if (p) await userEvent.type(partial(mounted, i + 1), p);
  if (total) await userEvent.type($(mounted, "#total"), total);
}

const ADD = { mode: "columns", operation: "add", first: "345", second: "278" };
const SUBTRACT = { mode: "columns", operation: "subtract", first: "432", second: "178" };

/** The written calculation to try out yourself (no test runs on it): with a mouse, a touchscreen or the keyboard. */
export const ToTry: Story = {
  name: "Written calculation, to try",
};

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    // 12 / 432 \ and three rows for bites, each with a bite, a factor and what is left
    expect(canvas.getByRole("group", { name: "Working: 432 divided by 12" })).toBeInTheDocument();
    expect(bites(mounted)).toBe(3);
    expect(canvas.getByRole("textbox", { name: "Bite 1" })).toBe(bite(mounted, 1));
    expect(canvas.getByRole("textbox", { name: "Bite 1: how many times 12" })).toBe(factor(mounted, 1));
    expect(canvas.getByRole("textbox", { name: "Left after bite 1" })).toBe(rest(mounted, 1));
    expect(canvas.getByRole("textbox", { name: "The numbers of times added up" })).toBeInTheDocument();
    expect(canvas.getByRole("textbox", { name: "Answer: 432 divided by 12" })).toBe(answer(mounted));
    expect(canvas.getByRole("textbox", { name: "Remainder" })).toBe(remainder(mounted));
    // every box has a name
    for (const input of inputs(mounted)) expect(input.getAttribute("aria-label")).toBeTruthy();
    // the boxes in the order a pupil writes them
    expect(inputs(mounted).map((input) => input.id)).toEqual([
      "bite-1", "factor-1", "rest-1", "bite-2", "factor-2", "rest-2", "bite-3", "factor-3", "rest-3", "factor-total", "answer", "remainder",
    ]);
    expect(pci.getResponse()).toBeUndefined();
    expect(mounted.changes).toEqual([]);
  },
};

/** The route of the example: 432 : 12 via 10×, 20× and 6×. */
export const Chunking: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { pci } = mounted;
    await step("the working is no answer yet, but every change is reported", async () => {
      await chunk(mounted, [["120", "10", "312"], ["240", "20", "72"], ["72", "6", "0"]], "36");
      expect(pci.getResponse()).toBeUndefined();
      expect(mounted.changes.length).toBeGreaterThan(0);
      expect(mounted.changes.every((value) => value === undefined)).toBe(true);
    });
    await step("the answer: a record with the remainder, the working and whether the answer is correct", async () => {
      await userEvent.type(answer(mounted), "36");
      expect(fields(pci.getResponse())).toEqual({ answer: 36, remainder: 0, working: true, answerCorrect: true });
      expect(fields(await lastChange(mounted))).toEqual({ answer: 36, remainder: 0, working: true, answerCorrect: true });
      await userEvent.type(remainder(mounted), "0");
      expect(fields(pci.getResponse())).toEqual({ answer: 36, remainder: 0, working: true, answerCorrect: true });
    });
    await step("a slip in a subtraction: the answer is still right, the working is not", async () => {
      await retype(rest(mounted, 1), "322");
      expect(fields(pci.getResponse())).toEqual({ answer: 36, remainder: 0, working: false, answerCorrect: true });
      await retype(rest(mounted, 1), "312");
      expect(fields(pci.getResponse())).toEqual({ answer: 36, remainder: 0, working: true, answerCorrect: true });
    });
  },
};

/** Any choice of bites is fine: one big bite and a small one. */
export const ChunkingOtherRoute: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    await chunk(mounted, [["360", "30", "72"], ["72", "6", "0"]]);
    await userEvent.type(answer(mounted), "36");
    expect(fields(mounted.pci.getResponse())).toEqual({ answer: 36, remainder: 0, working: true, answerCorrect: true });
  },
};

/** A bite that is not factor × divisor, and the pupil carries on with their own numbers. */
export const ChunkingWrong: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    await chunk(mounted, [["100", "10", "332"], ["240", "20", "92"], ["84", "7", "8"]], "37");
    await userEvent.type(answer(mounted), "37");
    await userEvent.type(remainder(mounted), "8");
    expect(fields(mounted.pci.getResponse())).toEqual({ answer: 37, remainder: 8, working: false, answerCorrect: false });
  },
};

/** 437 : 12 = 36 rest 5. */
export const ChunkingRemainder: Story = {
  args: { properties: { first: "437", second: "12", language: "nl", chunks: "2" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.canvas.getByRole("group", { name: "Uitwerking: 437 gedeeld door 12" })).toBeInTheDocument();
    expect(bites(mounted)).toBe(2);
    await chunk(mounted, [["360", "30", "77"], ["72", "6", "5"]], "36");
    await userEvent.type(answer(mounted), "36");
    // the remainder left empty is 0: not what is left
    expect(fields(mounted.pci.getResponse())).toEqual({ answer: 36, remainder: 0, working: false, answerCorrect: false });
    await userEvent.type(remainder(mounted), "5");
    expect(fields(mounted.pci.getResponse())).toEqual({ answer: 36, remainder: 5, working: true, answerCorrect: true });
  },
};

export const AddAndRemoveBites: Story = {
  args: { properties: { chunks: "1" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    const add = () => canvas.getByRole("button", { name: "Another bite" });
    const remove = () => canvas.getByRole("button", { name: "Remove the last bite" });
    expect(bites(mounted)).toBe(1);
    expect(remove()).toBeDisabled();
    await step("another bite: a new row, with the focus on its bite", async () => {
      await userEvent.click(add());
      expect(bites(mounted)).toBe(2);
      await waitFor(() => expect(focusedIn(mounted.root)).toBe(bite(mounted, 2)));
      // the factors added up move down with the last row
      expect(inputs(mounted).map((input) => input.id).slice(-3)).toEqual(["factor-total", "answer", "remainder"]);
    });
    await step("up to 12 bites", async () => {
      for (let i = 2; i < 12; i++) await userEvent.click(add());
      expect(bites(mounted)).toBe(12);
      expect(add()).toBeDisabled();
    });
    await step("the last bite goes, with what is in it", async () => {
      await userEvent.type(bite(mounted, 12), "12");
      await userEvent.click(remove());
      expect(bites(mounted)).toBe(11);
      await userEvent.click(add());
      expect(bite(mounted, 12)).toHaveValue("");
    });
    await step("down to one bite; then the focus goes to another bite", async () => {
      for (let i = 12; i > 2; i--) await userEvent.click(remove());
      expect(focusedIn(mounted.root)).toBe(remove());
      await userEvent.click(remove());
      expect(bites(mounted)).toBe(1);
      expect(remove()).toBeDisabled();
      await waitFor(() => expect(focusedIn(mounted.root)).toBe(add()));
    });
  },
};

/** Enter goes on to the next box, as on paper from the bite to the factor to what is left. */
export const EnterMovesOn: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    // userEvent's keyboard does not reach into the shadow root: the key as the input gets it
    bite(mounted, 1).focus();
    bite(mounted, 1).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(focusedIn(mounted.root)).toBe(factor(mounted, 1));
    factor(mounted, 1).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(focusedIn(mounted.root)).toBe(rest(mounted, 1));
  },
};

/** Kolomsgewijs adding: 345 + 278, a partial result per place value from the left. */
export const ColumnsAdd: Story = {
  args: { properties: ADD },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await step("the two numbers, a box per place value, the total and the answer", async () => {
      expect(canvas.getByRole("group", { name: "Working: 345 plus 278" })).toBeInTheDocument();
      expect(inputs(mounted).map((input) => input.id)).toEqual(["partial-1", "partial-2", "partial-3", "total", "answer"]);
      expect(canvas.getByRole("textbox", { name: "Partial result 1" })).toBe(partial(mounted, 1));
      expect(canvas.getByRole("textbox", { name: "Answer: 345 plus 278" })).toBe(answer(mounted));
      expect(canvas.queryByRole("button", { name: "Another bite" })).toBeNull();
    });
    await step("the working and the answer", async () => {
      await columns(mounted, ["500", "110", "13"], "623");
      expect(pci.getResponse()).toBeUndefined();
      await userEvent.type(answer(mounted), "623");
      expect(fields(pci.getResponse())).toEqual({ answer: 623, working: true, answerCorrect: true });
    });
    await step("a partial that is wrong: the rest follows from it, but the working is wrong", async () => {
      await retype(partial(mounted, 2), "100");
      await retype($(mounted, "#total"), "613");
      await retype(answer(mounted), "613");
      expect(fields(pci.getResponse())).toEqual({ answer: 613, working: false, answerCorrect: false });
    });
  },
};

/** Kolomsgewijs subtracting, with negative partials: 432 − 178 = 300 − 40 − 6. In Dutch. */
export const ColumnsSubtract: Story = {
  args: { properties: { ...SUBTRACT, language: "nl" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.canvas.getByRole("group", { name: "Uitwerking: 432 min 178" })).toBeInTheDocument();
    expect(mounted.canvas.getByRole("textbox", { name: "Tussenuitkomst 2" })).toBe(partial(mounted, 2));
    await columns(mounted, ["300", "-40", "−6"], "254");
    await userEvent.type(answer(mounted), "254");
    expect(fields(mounted.pci.getResponse())).toEqual({ answer: 254, working: true, answerCorrect: true });
    // the minus signs dropped
    await retype(partial(mounted, 2), "40");
    expect(fields(mounted.pci.getResponse())).toEqual({ answer: 254, working: false, answerCorrect: true });
  },
};

/** Dutch: the texts, and a decimal comma. */
export const Dutch: Story = {
  args: { properties: { language: "nl", first: "438", title: "Eerlijk delen", question: "438 knikkers, 12 kinderen. Hoeveel krijgt elk kind?" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.getByRole("heading", { name: "Eerlijk delen" })).toBeInTheDocument();
    expect(canvas.getByText("438 knikkers, 12 kinderen. Hoeveel krijgt elk kind?")).toBeInTheDocument();
    expect(canvas.getByRole("textbox", { name: "Hap 1" })).toBe(bite(mounted, 1));
    expect(canvas.getByRole("textbox", { name: "Hap 1: hoeveel keer 12" })).toBe(factor(mounted, 1));
    expect(canvas.getByRole("button", { name: "Nog een hap" })).toBeInTheDocument();
    expect(canvas.getByText(/Neem happen/)).toBeInTheDocument();
    await userEvent.type(answer(mounted), "36,5");
    expect(fields(pci.getResponse())).toEqual({ answer: 36.5, remainder: 0, working: false, answerCorrect: false });
  },
};

/** Text that is not a number: no response, invalid, and said under the working. */
export const NotANumber: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(pci.checkValidity()).toBe(true);
    await userEvent.type(answer(mounted), "36 r 0");
    expect(pci.getResponse()).toBeUndefined();
    expect(pci.checkValidity()).toBe(false);
    expect(answer(mounted)).toHaveAttribute("aria-invalid", "true");
    expect(canvas.getByRole("status")).toHaveTextContent("Write a number, such as 36 or −40.");
    await retype(answer(mounted), "36");
    expect(pci.checkValidity()).toBe(true);
    // a remainder that is not a whole number is no answer either
    await userEvent.type(remainder(mounted), "?");
    expect(pci.getResponse()).toBeUndefined();
    expect(pci.checkValidity()).toBe(false);
    // the player's own message
    await retype(remainder(mounted), "0");
    pci.setCustomValidity("Fill in an answer.");
    expect(pci.getCustomValidity()).toBe("Fill in an answer.");
    expect(pci.checkValidity()).toBe(false);
    pci.setCustomValidity("");
    expect(pci.checkValidity()).toBe(true);
  },
};

export const RestoreState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await chunk(first, [["120", "10", "312"], ["240", "20", "72"], ["72", "6", "0"], ["", "", ""]], "36");
    await userEvent.type(answer(first), "36");
    const state = first.pci.getState();

    // the pupil comes back to the item: everything is as they left it, also the fourth row
    const second = await remountPci(canvasElement, pci, { state });
    expect(bites(second)).toBe(4);
    expect([bite(second, 2), factor(second, 2), rest(second, 2)].map((input) => input.value)).toEqual(["240", "20", "72"]);
    expect($(second, "#factor-total")).toHaveValue("36");
    expect(fields(second.pci.getResponse())).toEqual({ answer: 36, remainder: 0, working: true, answerCorrect: true });
    expect(second.changes).toEqual([]);
  },
};

export const ForeignState: Story = {
  args: { state: "not a state of this PCI" },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(bites(mounted)).toBe(3);
    expect(mounted.pci.getResponse()).toBeUndefined();
  },
};

export const BoundResponse: Story = {
  args: {
    properties: { first: "437" },
    boundTo: { RESPONSE: { record: [{ name: "answer", base: { float: 36 } }, { name: "remainder", base: { integer: 5 } }] } },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(answer(mounted)).toHaveValue("36");
    expect(remainder(mounted)).toHaveValue("5");
    // the answer is right; the working is not there
    expect(fields(mounted.pci.getResponse())).toEqual({ answer: 36, remainder: 5, working: false, answerCorrect: true });
  },
};

/** Status "solution": a worked solution of the method, with the correct answer, read-only. */
export const Solution: Story = {
  args: { status: "solution", properties: { first: "437" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect([bite(mounted, 1), factor(mounted, 1), rest(mounted, 1)].map((input) => input.value)).toEqual(["360", "30", "77"]);
    expect([bite(mounted, 2), factor(mounted, 2), rest(mounted, 2)].map((input) => input.value)).toEqual(["72", "6", "5"]);
    expect(answer(mounted)).toHaveValue("36");
    expect(remainder(mounted)).toHaveValue("5");
    expect(fields(mounted.pci.getResponse())).toEqual({ answer: 36, remainder: 5, working: true, answerCorrect: true });
    for (const input of inputs(mounted)) expect(input).toBeDisabled();
    expect(mounted.canvas.queryByRole("button", { name: "Another bite" })).toBeNull();
  },
};

/** The item's own correct response wins for the answer; the working is the method's. */
export const SolutionDeclared: Story = {
  args: {
    status: "solution",
    properties: SUBTRACT,
    responseDeclaration: { correctResponse: { value: { record: [{ name: "answer", base: { float: 254 } }] } } },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect([1, 2, 3].map((i) => partial(mounted, i).value)).toEqual(["300", "−40", "−6"]);
    expect($(mounted, "#total")).toHaveValue("254");
    expect(answer(mounted)).toHaveValue("254");
    expect(fields(mounted.pci.getResponse())).toEqual({ answer: 254, working: true, answerCorrect: true });
  },
};

export const Review: Story = {
  args: { status: "review" },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    for (const input of inputs(mounted)) expect(input).toBeDisabled();
    expect(mounted.canvas.queryByRole("button", { name: "Another bite" })).toBeNull();
    expect(mounted.canvas.getByText("This working can not be changed.")).toBeInTheDocument();
    expect(mounted.pci.getResponse()).toBeUndefined();
  },
};

/** The correct response from the settings (getCorrectResponse). */
export const CorrectResponse: Story = {
  play: async () => {
    expect(fields(pci.getCorrectResponse!({ first: "437", second: "12" } as never))).toEqual({ answer: 36, remainder: 5, working: true, answerCorrect: true });
    expect(fields(pci.getCorrectResponse!(SUBTRACT as never))).toEqual({ answer: 254, working: true, answerCorrect: true });
    expect(fields(pci.getCorrectResponse!(ADD as never))).toEqual({ answer: 623, working: true, answerCorrect: true });
    // the defaults: 432 : 12
    expect(fields(pci.getCorrectResponse!({} as never))).toEqual({ answer: 36, remainder: 0, working: true, answerCorrect: true });
    expect(pci.getCorrectResponse!({ second: "0" } as never)).toBeUndefined();
  },
};

/** Settings that make no calculation: the author sees why. */
export const BrokenSettings: Story = {
  args: { properties: { second: "0" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.canvas.getByRole("alert")).toHaveTextContent("You can not divide by 0.");
    expect(inputs(mounted)).toHaveLength(0);
  },
};

/** The hint is a setting. */
export const NoHint: Story = {
  args: { properties: { ...ADD, hint: "false" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    expect(canvas.queryByText(/partial result for every column/)).toBeNull();
  },
};

/** Two on one page: each keeps its own working and answer. */
export const TwoInstances: Story = {
  render: (args) => {
    const page = document.createElement("div");
    for (const id of ["first", "second"]) {
      const slot = document.createElement("div");
      slot.dataset.slot = id;
      slot.appendChild(mountPci(pci, id === "first" ? args : { ...args, properties: ADD }));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=first]")!);
    const second = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=second]")!);
    expect(first.pci).not.toBe(second.pci);
    await userEvent.type(answer(first), "36");
    await userEvent.type(partial(second, 1), "500");
    expect(fields(first.pci.getResponse())).toEqual({ answer: 36, remainder: 0, working: false, answerCorrect: true });
    expect(second.pci.getResponse()).toBeUndefined();
    expect(partial(second, 1)).toHaveValue("500");
    expect(first.changes.length).toBeGreaterThan(0);
    expect(second.changes.every((value) => value === undefined)).toBe(true);
  },
};
