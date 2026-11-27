import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { focusedIn, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Bead frame",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Root = MountedPci["root"];
const $ = <T extends Element = HTMLElement>(root: Root, selector: string) => {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`no ${selector} in the PCI`);
  return found;
};

// ---- the rekenrek: a slider per rod (data-row), a bead per data-bead ----
const rods = (m: MountedPci) => Array.from(m.root.querySelectorAll<HTMLElement>("[role=slider]"));
const rod = (m: MountedPci, r: number) => $(m.root, `[data-row="${r}"]`);
const bead = (m: MountedPci, r: number, i: number) => $<SVGGElement>(m.root, `[data-row="${r}"] [data-bead="${i}"]`);
/** The beads pushed per row, as the slider says. */
const pushed = (m: MountedPci) => rods(m).map((slider) => Number(slider.getAttribute("aria-valuenow")));
/** The beads with the dot of the second part. */
const secondBeads = (m: MountedPci) => m.root.querySelectorAll("[data-bead] circle + circle").length;

/** A key on the focused element, as the browser sends it (userEvent.keyboard does not reach into the shadow root). */
const press = (element: HTMLElement, key: string) => {
  element.focus();
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, composed: true }));
};
/** A pointer event at a point on screen. */
const pointer = (target: Element, type: string, x: number, y: number) =>
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true }));
const middle = (element: Element) => {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
};
/** Drag bead i of row r by `beads` bead widths (negative: to the left). */
async function dragBead(m: MountedPci, r: number, i: number, beads: number) {
  const from = middle(bead(m, r, i).querySelector("circle")!);
  const width = bead(m, r, i).querySelector("circle")!.getBoundingClientRect().width;
  pointer(bead(m, r, i), "pointerdown", from.x, from.y);
  for (let step = 1; step <= 4; step++) pointer(rod(m, r), "pointermove", from.x + (beads * width * step) / 4, from.y);
  pointer(rod(m, r), "pointerup", from.x + beads * width, from.y);
  await waitFor(() => expect(true).toBe(true));
}

// ---- the hundred field: a checkbox per square, data-cell="row-column" ----
const cell = (m: MountedPci, r: number, c: number) => $(m.root, `[data-cell="${r}-${c}"]`);
const coloured = (m: MountedPci) => m.root.querySelectorAll("[data-cell][aria-checked=true]").length;

// ---- the response ----
type Field = { name: string; base?: { integer?: number; boolean?: boolean } };
const fields = (response: unknown) =>
  Object.fromEntries(((response as { record?: Field[] })?.record ?? []).map((f) => [f.name, f.base?.integer ?? f.base?.boolean]));
const record = (values: Record<string, number | boolean>) => ({
  record: Object.entries(values).map(([name, value]) => ({ name, base: typeof value === "number" ? { integer: value } : { boolean: value } })),
});

const resetButton = (m: MountedPci, name = "Push all beads back") => m.canvas.getByRole("button", { name });

/** The bead frame to try out yourself (no test runs on it): with a mouse, a touchscreen or the keyboard. */
export const ToTry: Story = {
  name: "Bead frame, to try",
};

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(m.canvas.getByText("Show 13 on the bead frame.")).toBeInTheDocument();
    // a rekenrek of 20: two rods of ten beads, five red and five white, none pushed
    expect(rods(m)).toHaveLength(2);
    expect(m.root.querySelectorAll("[data-bead]")).toHaveLength(20);
    expect(pushed(m)).toEqual([0, 0]);
    expect(rod(m, 0)).toHaveAccessibleName("Row 1");
    expect(rod(m, 0)).toHaveAttribute("aria-valuetext", "0 beads pushed. Total 0.");
    // nothing answered, nothing reported; no total under the frame
    expect(m.pci.getResponse()).toBeUndefined();
    expect(resetButton(m)).toBeDisabled();
    expect(m.root.querySelector("[data-total]")).toBeNull();
  },
};

/** A click on a bead moves it to the other side, with the beads it pushes along. */
export const ClickBeads: Story = {
  play: async ({ canvasElement, step }) => {
    const m = await openPci(canvasElement);
    await step("a bead on the right goes left and takes the beads to its left along", async () => {
      await userEvent.click(bead(m, 0, 9));
      expect(pushed(m)).toEqual([10, 0]);
      await userEvent.click(bead(m, 1, 2));
      expect(pushed(m)).toEqual([10, 3]);
      expect(fields(m.pci.getResponse())).toEqual({ value: 13, structured: true, correct: true });
      expect(fields(await lastChange(m))).toEqual({ value: 13, structured: true, correct: true });
    });
    await step("a bead on the left goes back and takes the beads to its right along", async () => {
      await userEvent.click(bead(m, 1, 1));
      expect(pushed(m)).toEqual([10, 1]);
      expect(fields(m.pci.getResponse())).toEqual({ value: 11, structured: true, correct: false });
      await userEvent.click(bead(m, 1, 0));
      expect(fields(m.pci.getResponse())).toEqual({ value: 10, structured: true, correct: false });
    });
    await step("push all back: nothing answered again", async () => {
      await userEvent.click(resetButton(m));
      expect(pushed(m)).toEqual([0, 0]);
      expect(m.pci.getResponse()).toBeUndefined();
    });
  },
};

export const DragBeads: Story = {
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    await dragBead(m, 0, 6, -1);
    expect(pushed(m)).toEqual([7, 0]);
    // a little is not enough
    await dragBead(m, 0, 8, -0.2);
    expect(pushed(m)).toEqual([7, 0]);
    await dragBead(m, 0, 3, 1);
    expect(pushed(m)).toEqual([3, 0]);
  },
};

/** A rod is a slider: the beads move left, so ← pushes one more; Page Up five at a time. */
export const Keyboard: Story = {
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    const top = rod(m, 0);
    press(top, "ArrowLeft");
    press(top, "ArrowLeft");
    await waitFor(() => expect(pushed(m)).toEqual([2, 0]));
    press(top, "PageUp");
    await waitFor(() => expect(pushed(m)).toEqual([7, 0]));
    expect(top).toHaveAttribute("aria-valuetext", "7 beads pushed (5 red, 2 white). Total 7.");
    press(top, "ArrowRight");
    await waitFor(() => expect(pushed(m)).toEqual([6, 0]));
    press(top, "End");
    press(rod(m, 1), "ArrowUp");
    press(rod(m, 1), "ArrowUp");
    press(rod(m, 1), "ArrowUp");
    await waitFor(() => expect(pushed(m)).toEqual([10, 3]));
    expect(rod(m, 1)).toHaveAttribute("aria-valuetext", "3 beads pushed (3 red). Total 13.");
    expect(fields(m.pci.getResponse()).correct).toBe(true);
    press(top, "Home");
    await waitFor(() => expect(pushed(m)).toEqual([0, 3]));
    expect(focusedIn(m.root)).toBe(top);
  },
};

/** 13 as 5 and 8: the right number, not the way the frame is read. */
export const NotStructured: Story = {
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    await userEvent.click(bead(m, 0, 4));
    await userEvent.click(bead(m, 1, 7));
    expect(fields(m.pci.getResponse())).toEqual({ value: 13, structured: false, correct: true });
  },
};

const SUM = { task: "addition", number: "8", add: "5" };

/** 8 + 5 via ten: 8 on the top row, then 2 to make it ten and 3 on the next, with the second colour. */
export const AdditionViaTen: Story = {
  args: { properties: { ...SUM, showTotal: "true" } },
  play: async ({ canvasElement, step }) => {
    const m = await openPci(canvasElement);
    expect(m.canvas.getByText("Show 8 + 5 on the bead frame: first 8, then 5 more with the other colour.")).toBeInTheDocument();
    const first = m.canvas.getByRole("radio", { name: "first number (8)" });
    const second = m.canvas.getByRole("radio", { name: "second number (5)" });
    expect(first).toHaveAttribute("aria-checked", "true");

    await step("first 8 with the first colour", async () => {
      await userEvent.click(bead(m, 0, 7));
      expect(fields(m.pci.getResponse())).toEqual({ value: 8, first: 8, second: 0, structured: true, viaTen: false, correct: false });
    });
    await step("then 5 with the second: 2 to fill the row, 3 on the next", async () => {
      await userEvent.click(second);
      expect(second).toHaveAttribute("aria-checked", "true");
      await userEvent.click(bead(m, 0, 9));
      await userEvent.click(bead(m, 1, 2));
      expect(secondBeads(m)).toBe(5);
      expect(fields(m.pci.getResponse())).toEqual({ value: 13, first: 8, second: 5, structured: true, viaTen: true, correct: true });
      expect(rod(m, 1)).toHaveAttribute("aria-valuetext", "3 beads pushed (3 red), 3 of them with the second colour. Total 13.");
      expect($(m.root, "[data-total]")).toHaveTextContent("Total: 13 (8 + 5)");
    });
    await step("the arrow keys move between the colours", async () => {
      press(second, "ArrowLeft");
      await waitFor(() => expect(first).toHaveAttribute("aria-checked", "true"));
      expect(focusedIn(m.root)).toBe(first);
    });
  },
};

/** 8 on the top row and 5 on the next: both parts right, not via ten. */
export const AdditionNotViaTen: Story = {
  args: { properties: SUM },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    await userEvent.click(bead(m, 0, 7));
    await userEvent.click(m.canvas.getByRole("radio", { name: "second number (5)" }));
    await userEvent.click(bead(m, 1, 4));
    expect(fields(m.pci.getResponse())).toEqual({ value: 13, first: 8, second: 5, structured: false, viaTen: false, correct: true });
  },
};

export const Rekenrek100: Story = {
  args: { properties: { size: "100", number: "47" } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(rods(m)).toHaveLength(10);
    expect(m.canvas.getByText("Show 47 on the bead frame.")).toBeInTheDocument();
    for (let r = 0; r < 4; r++) press(rod(m, r), "End");
    press(rod(m, 4), "PageUp");
    press(rod(m, 4), "ArrowLeft");
    press(rod(m, 4), "ArrowLeft");
    await waitFor(() => expect(fields(m.pci.getResponse())).toEqual({ value: 47, structured: true, correct: true }));
    // the 5-structure down: a wider gap after five rows
    expect(rod(m, 5).getBoundingClientRect().top - rod(m, 4).getBoundingClientRect().bottom).toBeGreaterThan(
      rod(m, 4).getBoundingClientRect().top - rod(m, 3).getBoundingClientRect().bottom
    );
  },
};

const HUNDRED = { model: "hundred", number: "7" };

export const HundredField: Story = {
  args: { properties: HUNDRED },
  play: async ({ canvasElement, step }) => {
    const m = await openPci(canvasElement);
    expect(m.canvas.getByText("Colour 7 squares in the hundred field.")).toBeInTheDocument();
    expect(m.root.querySelectorAll("[role=checkbox]")).toHaveLength(100);
    expect(cell(m, 2, 3)).toHaveAccessibleName("Row 3, square 4");
    await step("colour the first seven squares", async () => {
      for (let c = 0; c < 7; c++) await userEvent.click(cell(m, 0, c));
      expect(coloured(m)).toBe(7);
      expect(fields(m.pci.getResponse())).toEqual({ value: 7, structured: true, correct: true });
      expect(m.root.querySelector("[aria-live]")).toHaveTextContent("7 squares coloured.");
    });
    await step("a click on a coloured square takes its colour off", async () => {
      await userEvent.click(cell(m, 0, 6));
      expect(cell(m, 0, 6)).toHaveAttribute("aria-checked", "false");
      await userEvent.click(cell(m, 1, 0));
      expect(fields(m.pci.getResponse())).toEqual({ value: 7, structured: false, correct: true });
    });
    await step("the 5-structure: a gap after five squares", async () => {
      const gap = (a: HTMLElement, b: HTMLElement) => b.getBoundingClientRect().left - a.getBoundingClientRect().right;
      expect(gap(cell(m, 0, 4), cell(m, 0, 5))).toBeGreaterThan(gap(cell(m, 0, 3), cell(m, 0, 4)) + 4);
    });
  },
};

export const HundredDrag: Story = {
  args: { properties: { model: "hundred", number: "10" } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    const field = $(m.root, ".field");
    const start = middle(cell(m, 0, 0));
    pointer(cell(m, 0, 0), "pointerdown", start.x, start.y);
    for (let c = 1; c < 10; c++) {
      const at = middle(cell(m, 0, c));
      pointer(field, "pointermove", at.x, at.y);
    }
    pointer(field, "pointerup", start.x, start.y);
    await waitFor(() => expect(coloured(m)).toBe(10));
    expect(fields(m.pci.getResponse())).toEqual({ value: 10, structured: true, correct: true });
    // a drag that starts on a coloured square takes the colour off
    pointer(cell(m, 0, 9), "pointerdown", middle(cell(m, 0, 9)).x, middle(cell(m, 0, 9)).y);
    pointer(field, "pointermove", middle(cell(m, 0, 8)).x, middle(cell(m, 0, 8)).y);
    pointer(field, "pointerup", 0, 0);
    await waitFor(() => expect(coloured(m)).toBe(8));
  },
};

/** One tab stop: the arrow keys move within the field, space or Enter colours. */
export const HundredKeyboard: Story = {
  args: { properties: HUNDRED },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(m.root.querySelectorAll("[data-cell][tabindex='0']")).toHaveLength(1);
    press(cell(m, 0, 0), " ");
    await waitFor(() => expect(cell(m, 0, 0)).toHaveAttribute("aria-checked", "true"));
    press(cell(m, 0, 0), "ArrowRight");
    await waitFor(() => expect(focusedIn(m.root)).toBe(cell(m, 0, 1)));
    press(cell(m, 0, 1), "Enter");
    press(cell(m, 0, 1), "ArrowDown");
    await waitFor(() => expect(focusedIn(m.root)).toBe(cell(m, 1, 1)));
    expect(cell(m, 1, 1)).toHaveAttribute("tabindex", "0");
    await waitFor(() => expect(coloured(m)).toBe(2));
    press(cell(m, 1, 1), "End");
    await waitFor(() => expect(focusedIn(m.root)).toBe(cell(m, 1, 9)));
  },
};

/** A sum in the hundred field, with dots: the second colour is striped too. */
export const HundredAddition: Story = {
  args: { properties: { model: "hundred", cells: "dots", ...SUM, language: "nl" } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(m.canvas.getByText("Laat 8 + 5 zien in het honderdveld: eerst 8 in de eerste kleur, dan 5 in de andere kleur.")).toBeInTheDocument();
    expect(m.root.querySelectorAll(".dot")).toHaveLength(100);
    for (let c = 0; c < 8; c++) await userEvent.click(cell(m, 0, c));
    await userEvent.click(m.canvas.getByRole("radio", { name: "tweede getal (5)" }));
    for (const [r, c] of [[0, 8], [0, 9], [1, 0], [1, 1], [1, 2]]) await userEvent.click(cell(m, r, c));
    expect(cell(m, 1, 0)).toHaveAccessibleName("Rij 2, hokje 1: tweede kleur");
    expect(fields(m.pci.getResponse())).toEqual({ value: 13, first: 8, second: 5, structured: true, viaTen: true, correct: true });
    expect(m.root.querySelector("[aria-live]")).toHaveTextContent("13 hokjes gekleurd: 8 eerste kleur, 5 tweede kleur.");
    // a square of the other colour gets this colour
    await userEvent.click(cell(m, 0, 0));
    expect(fields(m.pci.getResponse())).toMatchObject({ first: 7, second: 6, viaTen: false, correct: false });
  },
};

/** Only show a number: an image of 13, the item asks for the number. Nothing to change, no response. */
export const ShowNumber: Story = {
  args: { properties: { task: "show", number: "13" } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(m.canvas.getByRole("img")).toHaveAccessibleName("Bead frame with beads pushed to the left: row 1: 10, row 2: 3.");
    expect(m.root.querySelectorAll("[role=slider]")).toHaveLength(0);
    expect(m.canvas.queryByRole("button")).toBeNull();
    // the beads are where they show 13
    const box = (i: number) => bead(m, 1, i).getBoundingClientRect();
    expect(box(3).left - box(2).right).toBeGreaterThan(2 * box(2).width);
    await userEvent.click(bead(m, 1, 5));
    expect(m.pci.getResponse()).toBeUndefined();
    expect(m.changes).toHaveLength(0);
    // no question of its own: the item asks it
    expect(m.root.querySelector("p:not(.sr-only)")).toBeNull();
  },
};

/** What the author arranged (layout) in the hundred field: squares to count, not in rows. */
export const ShowLayout: Story = {
  args: {
    properties: { model: "hundred", task: "show", layout: "1100000000/0110000000/0011000000/0001100000", question: "How many squares are coloured?" },
  },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(m.canvas.getByText("How many squares are coloured?")).toBeInTheDocument();
    expect(m.canvas.getByRole("img")).toHaveAccessibleName("Hundred field with squares coloured: row 1: 2, row 2: 2, row 3: 2, row 4: 2.");
    expect(m.root.querySelectorAll(".place.fill-1")).toHaveLength(8);
    expect(cell(m, 1, 1)).toHaveClass("fill-1");
    expect(m.pci.getResponse()).toBeUndefined();
  },
};

export const RestoreState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.click(bead(first, 0, 4));
    await userEvent.click(bead(first, 1, 7));
    const state = first.pci.getState();
    // the candidate comes back: the beads are where they left them, 5 and 8, not 10 and 3
    const second = await remountPci(canvasElement, pci, { state });
    expect(pushed(second)).toEqual([5, 8]);
    expect(fields(second.pci.getResponse())).toEqual({ value: 13, structured: false, correct: true });
  },
};

export const RestoreHundred: Story = {
  args: { properties: HUNDRED },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.click(cell(first, 3, 4));
    await userEvent.click(cell(first, 7, 7));
    const second = await remountPci(canvasElement, pci, { properties: HUNDRED, state: first.pci.getState() });
    expect(cell(second, 3, 4)).toHaveAttribute("aria-checked", "true");
    expect(cell(second, 7, 7)).toHaveAttribute("aria-checked", "true");
    expect(coloured(second)).toBe(2);
  },
};

export const ForeignState: Story = {
  args: { state: "not a state of this PCI" },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(pushed(m)).toEqual([0, 0]);
    expect(m.pci.getResponse()).toBeUndefined();
  },
};

/** A response the player binds: shown the way the frame is read. */
export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: record({ value: 13, structured: true, correct: true }) } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(pushed(m)).toEqual([10, 3]);
    expect(fields(m.pci.getResponse())).toEqual({ value: 13, structured: true, correct: true });
  },
};

/** A bound response that says what the saved state shows keeps the beads of the state. */
export const BoundResponseAndState: Story = {
  args: {
    state: JSON.stringify({ state: { grid: [[1, 1, 1, 1, 1, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1, 1, 1, 0, 0]] }, log: [] }),
    boundTo: { RESPONSE: record({ value: 13, structured: false, correct: true }) },
  },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(pushed(m)).toEqual([5, 8]);
  },
};

export const Solution: Story = {
  args: { status: "solution", properties: SUM, responseDeclaration: { correctResponse: { value: record({ value: 13, first: 8, second: 5, structured: true, viaTen: true, correct: true }) } } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(pushed(m)).toEqual([10, 3]);
    expect(secondBeads(m)).toBe(5);
    expect(fields(m.pci.getResponse())).toMatchObject({ value: 13, viaTen: true, correct: true });
    // read-only: no colours to pick, no button, keys do nothing
    expect(rod(m, 0)).toHaveAttribute("aria-disabled", "true");
    expect(m.canvas.queryByRole("radio")).toBeNull();
    expect(m.canvas.queryByRole("button")).toBeNull();
    press(rod(m, 1), "ArrowLeft");
    await userEvent.click(bead(m, 1, 0));
    expect(pushed(m)).toEqual([10, 3]);
  },
};

/** Without a correct response in the item, the solution is the one of the settings. */
export const SolutionFromSettings: Story = {
  args: { status: "solution", properties: { model: "hundred", number: "24" } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(coloured(m)).toBe(24);
    expect(cell(m, 2, 3)).toHaveAttribute("aria-checked", "true");
    expect(cell(m, 2, 4)).toHaveAttribute("aria-checked", "false");
  },
};

export const Review: Story = {
  args: { status: "review", properties: { model: "hundred", number: "7" } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    await userEvent.click(cell(m, 0, 0));
    press(cell(m, 0, 0), " ");
    expect(coloured(m)).toBe(0);
    expect(cell(m, 0, 0)).toHaveAttribute("aria-disabled", "true");
    expect(m.pci.getResponse()).toBeUndefined();
  },
};

export const Settings: Story = {
  args: { properties: { title: "Het rekenrek", language: "nl", number: "16", showTotal: "true" } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(m.canvas.getByRole("heading", { name: "Het rekenrek" })).toBeInTheDocument();
    expect(m.canvas.getByText("Laat 16 zien op het rekenrek.")).toBeInTheDocument();
    expect(rod(m, 1)).toHaveAccessibleName("Rij 2");
    expect(resetButton(m, "Alle kralen terugschuiven")).toBeInTheDocument();
    await userEvent.click(bead(m, 0, 6));
    expect($(m.root, "[data-total]")).toHaveTextContent("Totaal: 7");
    expect(rod(m, 0)).toHaveAttribute("aria-valuetext", "7 kralen geschoven (5 rood, 2 wit). Totaal 7.");
  },
};

/** The author's question, with the numbers of the settings in it. */
export const OwnQuestion: Story = {
  args: { properties: { ...SUM, question: "Sanne has {number} marbles and gets {add} more. Show it with two colours." } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(m.canvas.getByText("Sanne has 8 marbles and gets 5 more. Show it with two colours.")).toBeInTheDocument();
  },
};

/** The correct response from the settings: the number the way the frame is read, a sum via ten. */
export const CorrectResponse: Story = {
  play: async () => {
    expect(fields(pci.getCorrectResponse!({ task: "set", number: "13" } as never))).toEqual({ value: 13, structured: true, correct: true });
    expect(fields(pci.getCorrectResponse!({ task: "addition", number: "8", add: "5" } as never))).toEqual({
      value: 13, first: 8, second: 5, structured: true, viaTen: true, correct: true,
    });
    expect(fields(pci.getCorrectResponse!({ model: "hundred", number: "64" } as never))).toEqual({ value: 64, structured: true, correct: true });
    expect(pci.getCorrectResponse!({ task: "show", number: "13" } as never)).toBeUndefined();
    // 30 does not fit on a rekenrek of 20
    expect(pci.getCorrectResponse!({ number: "30" } as never)).toBeUndefined();
  },
};

export const Validity: Story = {
  play: async ({ canvasElement }) => {
    const { pci: instance } = await openPci(canvasElement);
    expect(instance.checkValidity()).toBe(true);
    instance.setCustomValidity("Schuif eerst kralen.");
    expect(instance.getCustomValidity()).toBe("Schuif eerst kralen.");
    expect(instance.checkValidity()).toBe(false);
    instance.setCustomValidity("");
    expect(instance.checkValidity()).toBe(true);
  },
};

/** A rekenrek and a hundred field on one page: each keeps its own beads and squares. */
export const TwoInstances: Story = {
  render: (args) => {
    const page = document.createElement("div");
    for (const id of ["first", "second"]) {
      const slot = document.createElement("div");
      slot.dataset.slot = id;
      slot.appendChild(mountPci(pci, id === "first" ? args : { ...args, properties: HUNDRED }));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=first]")!);
    const second = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=second]")!);
    expect(first.pci).not.toBe(second.pci);
    await userEvent.click(bead(first, 0, 2));
    await userEvent.click(cell(second, 0, 0));
    expect(fields(first.pci.getResponse()).value).toBe(3);
    expect(fields(second.pci.getResponse()).value).toBe(1);
    expect(first.changes).toHaveLength(1);
    expect(second.changes).toHaveLength(1);
  },
};

/** The authoring mode: the author arranges what a frame that only shows a number shows (the layout setting). */
export const Authoring: StoryObj<{ properties?: Record<string, string>; language?: string }> = {
  render: (args) => mountAuthoring(pci, args),
  args: { properties: { task: "show", number: "10" }, language: "en" },
  play: async ({ canvasElement }) => {
    const a = await openAuthoring(canvasElement);
    expect(a.canvas.getByRole("heading", { name: "Arrange what the frame shows" })).toBeInTheDocument();
    // it starts from what the frame shows now: 10, which needs no layout
    expect(a.root.querySelectorAll("[role=slider]")).toHaveLength(2);
    expect(a.instance.getProperties()).toEqual({ layout: "" });
    // 5 and 5 instead of 10
    press(a.root.querySelector<HTMLElement>("[data-row='0']")!, "PageDown");
    press(a.root.querySelector<HTMLElement>("[data-row='1']")!, "PageUp");
    await waitFor(() => expect(a.instance.getProperties()).toEqual({ layout: "1111100000/1111100000" }));
    expect(a.changes.length).toBeGreaterThan(0);
    // and a second colour
    await userEvent.click(a.canvas.getByRole("radio", { name: "second number" }));
    press(a.root.querySelector<HTMLElement>("[data-row='1']")!, "ArrowLeft");
    await waitFor(() => expect(a.instance.getProperties()).toEqual({ layout: "1111100000/1111120000" }));
  },
};

/** The picture for the readme: 8 + 5 via ten on a rekenrek of 20, next to 26 in a hundred field. */
export const Example: Story = {
  render: () => {
    const page = document.createElement("div");
    page.dataset.example = "";
    page.style.cssText = "display:flex;gap:40px;align-items:flex-start;padding:16px;background:#fff;width:max-content";
    const slots: [string, PciArgs][] = [
      ["rekenrek", { properties: { title: "8 + 5", ...SUM, showTotal: "true" }, width: 560 }],
      ["hundred", { properties: { title: "26", model: "hundred", number: "26" }, boundTo: { RESPONSE: record({ value: 26 }) }, width: 400 }],
    ];
    for (const [id, args] of slots) {
      const slot = document.createElement("div");
      slot.dataset.slot = id;
      slot.appendChild(mountPci(pci, args));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=rekenrek]")!);
    const field = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=hundred]")!);
    await userEvent.click(bead(m, 0, 7));
    await userEvent.click(m.canvas.getByRole("radio", { name: "second number (5)" }));
    await userEvent.click(bead(m, 0, 9));
    await userEvent.click(bead(m, 1, 2));
    expect(fields(m.pci.getResponse()).viaTen).toBe(true);
    expect(fields(field.pci.getResponse())).toEqual({ value: 26, structured: true, correct: true });
    (focusedIn(m.root) as HTMLElement | null)?.blur();
  },
};
