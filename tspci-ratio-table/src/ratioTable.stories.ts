import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { lastChange, mountPci, openPci, remountPci, retype, type MountedPci, type PciArgs } from "../../.storybook/tspci";
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
const cell = (mounted: MountedPci, row: number, column: number) => $(mounted, `#number-${row}-${column}`);
const label = (mounted: MountedPci, row: number) => $(mounted, `#label-input-${row}`);
/** The input on the arrow between value columns i and i + 1, above (top) or below (bottom) the table. */
const arrow = (mounted: MountedPci, side: "top" | "bottom", i: number) => $(mounted, `#input-a${side === "top" ? 1 : 2}-2-${i}`);
const operator = (mounted: MountedPci, side: "top" | "bottom", i: number) => $<HTMLButtonElement>(mounted, `#operator-a${side === "top" ? 1 : 2}-${i}`);
const valueCells = (mounted: MountedPci) => Array.from(mounted.root.querySelectorAll<HTMLInputElement>("input[id^='number-']"));
const arrowInputs = (mounted: MountedPci) => Array.from(mounted.root.querySelectorAll<HTMLInputElement>("input[id^='input-a']"));
const answerInput = (mounted: MountedPci) => $(mounted, "input[data-answer]");

const addColumn = (mounted: MountedPci) => mounted.canvas.getByRole("button", { name: "Kolom toevoegen" });
const removeColumn = (mounted: MountedPci) => mounted.canvas.getByRole("button", { name: "Kolom verwijderen" });

const integer = (n: number) => ({ base: { integer: n } });

/** The worked example: km on top, minutes below; 3 km in 6 min, so 7 km in 14 min. */
async function fillExample(mounted: MountedPci) {
  await userEvent.type(label(mounted, 1), "km");
  await userEvent.type(label(mounted, 2), "minuten");
  await userEvent.type(cell(mounted, 1, 1), "3");
  await userEvent.type(cell(mounted, 2, 1), "6");
  await userEvent.type(cell(mounted, 1, 2), "7");
  await userEvent.type(cell(mounted, 2, 2), "14");
}

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.getByRole("heading", { name: TITLE })).toBeInTheDocument();
    expect(canvas.getByText(QUESTION)).toBeInTheDocument();
    // two rows with an empty label, two value columns, one arrow above and one below
    expect(canvas.getAllByRole("rowheader")).toHaveLength(2);
    expect(valueCells(mounted).map((input) => input.value)).toEqual(["", "", "", ""]);
    await waitFor(() => expect(arrowInputs(mounted)).toHaveLength(2));
    // the answer is the bottom-right cell; nothing answered yet
    expect(answerInput(mounted)).toBe(cell(mounted, 2, 2));
    expect(pci.getResponse()).toBeUndefined();
    // at the minimum of two columns: only adding is possible
    expect(addColumn(mounted)).toBeEnabled();
    expect(removeColumn(mounted)).toBeDisabled();
  },
};

export const Answering: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { pci } = mounted;

    await step("the working (labels, other cells) is no answer", async () => {
      await userEvent.type(label(mounted, 1), "km");
      await userEvent.type(cell(mounted, 1, 1), "3");
      await userEvent.type(cell(mounted, 2, 1), "6");
      expect(pci.getResponse()).toBeUndefined();
      // but every change is reported, so the player saves the state
      expect(mounted.changes.length).toBeGreaterThan(0);
      expect(mounted.changes.every((value) => value === undefined)).toBe(true);
    });

    await step("the bottom-right cell is the answer, a whole number", async () => {
      await userEvent.type(cell(mounted, 2, 2), "14");
      expect(pci.getResponse()).toEqual(integer(14));
      expect(await lastChange(mounted)).toEqual(integer(14));
    });

    await step("a decimal is rounded, an empty cell is no answer", async () => {
      await retype(cell(mounted, 2, 2), "14.6");
      expect(pci.getResponse()).toEqual(integer(15));
      await retype(cell(mounted, 2, 2), "{Backspace}");
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Columns: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { pci } = mounted;
    await userEvent.type(cell(mounted, 2, 2), "14");
    expect(pci.getResponse()).toEqual(integer(14));

    await step("a new column moves the answer to its bottom cell", async () => {
      await userEvent.click(addColumn(mounted));
      expect(valueCells(mounted)).toHaveLength(6);
      await waitFor(() => expect(arrowInputs(mounted)).toHaveLength(4));
      expect(answerInput(mounted)).toBe(cell(mounted, 2, 3));
      expect(pci.getResponse()).toBeUndefined();
      expect(removeColumn(mounted)).toBeEnabled();
    });

    await step("up to five columns", async () => {
      await userEvent.click(addColumn(mounted));
      await userEvent.click(addColumn(mounted));
      expect(valueCells(mounted)).toHaveLength(10);
      await waitFor(() => expect(arrowInputs(mounted)).toHaveLength(8));
      expect(addColumn(mounted)).toBeDisabled();
    });

    await step("removing columns brings the earlier answer back", async () => {
      await userEvent.click(removeColumn(mounted));
      await userEvent.click(removeColumn(mounted));
      await userEvent.click(removeColumn(mounted));
      expect(valueCells(mounted)).toHaveLength(4);
      await waitFor(() => expect(arrowInputs(mounted)).toHaveLength(2));
      expect(cell(mounted, 2, 2)).toHaveValue(14);
      expect(pci.getResponse()).toEqual(integer(14));
      expect(removeColumn(mounted)).toBeDisabled();
    });
  },
};

export const Arrows: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    await waitFor(() => expect(arrowInputs(mounted)).toHaveLength(2));
    // a number on each arrow; they multiply until toggled
    await userEvent.type(arrow(mounted, "top", 1), "2");
    await userEvent.type(arrow(mounted, "bottom", 1), "3");
    expect(arrow(mounted, "top", 1)).toHaveValue(2);
    expect(arrow(mounted, "bottom", 1)).toHaveValue(3);
    expect(operator(mounted, "top", 1)).toHaveTextContent("×");

    await userEvent.click(operator(mounted, "top", 1));
    expect(operator(mounted, "top", 1)).toHaveTextContent(":");
    expect(operator(mounted, "top", 1)).toHaveAccessibleName("Gedeeld door. Klik om te wisselen naar keer");
    // each arrow has its own operator
    expect(operator(mounted, "bottom", 1)).toHaveTextContent("×");
    await userEvent.click(operator(mounted, "top", 1));
    expect(operator(mounted, "top", 1)).toHaveTextContent("×");
    // the arrows are working, not the answer
    expect(mounted.pci.getResponse()).toBeUndefined();
  },
};

export const RestoreState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.click(addColumn(first));
    await fillExample(first);
    await waitFor(() => expect(arrowInputs(first)).toHaveLength(4));
    await userEvent.type(arrow(first, "top", 1), "7");
    await userEvent.click(operator(first, "top", 1));
    await userEvent.type(cell(first, 2, 3), "28");
    const state = first.pci.getState();

    // the candidate comes back to the item: everything is as they left it
    const second = await remountPci(canvasElement, pci, { state });
    expect(label(second, 1)).toHaveValue("km");
    expect(label(second, 2)).toHaveValue("minuten");
    expect(valueCells(second).map((input) => input.value)).toEqual(["3", "7", "", "6", "14", "28"]);
    await waitFor(() => expect(arrowInputs(second)).toHaveLength(4));
    expect(arrow(second, "top", 1)).toHaveValue(7);
    expect(operator(second, "top", 1)).toHaveTextContent(":");
    expect(second.pci.getResponse()).toEqual(integer(28));
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
  args: { boundTo: { RESPONSE: integer(14) } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(answerInput(mounted)).toHaveValue(14);
    expect(mounted.pci.getResponse()).toEqual(integer(14));
  },
};

export const Solution: Story = {
  args: { status: "solution", responseDeclaration: { correctResponse: { value: "14" } } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(answerInput(mounted)).toHaveValue(14);
    expect(mounted.pci.getResponse()).toEqual(integer(14));
    for (const input of [...valueCells(mounted), label(mounted, 1)]) expect(input).toBeDisabled();
    expect(addColumn(mounted)).toBeDisabled();
  },
};

export const Review: Story = {
  args: { status: "review" },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    for (const input of [...valueCells(mounted), label(mounted, 1), label(mounted, 2)]) expect(input).toBeDisabled();
    await waitFor(() => expect(arrowInputs(mounted)).toHaveLength(2));
    for (const input of arrowInputs(mounted)) expect(input).toBeDisabled();
    expect(operator(mounted, "top", 1)).toBeDisabled();
    expect(addColumn(mounted)).toBeDisabled();
    expect(removeColumn(mounted)).toBeDisabled();
  },
};

export const Settings: Story = {
  args: { properties: { title: "Naar school", question: "Hoeveel minuten fietst Linus naar school?" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    expect(canvas.getByRole("heading", { name: "Naar school" })).toBeInTheDocument();
    expect(canvas.getByText("Hoeveel minuten fietst Linus naar school?")).toBeInTheDocument();
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
    await userEvent.type(cell(first, 2, 2), "14");
    await userEvent.click(addColumn(second));
    expect(first.pci.getResponse()).toEqual(integer(14));
    expect(second.pci.getResponse()).toBeUndefined();
    expect(valueCells(first)).toHaveLength(4);
    expect(valueCells(second)).toHaveLength(6);
  },
};
