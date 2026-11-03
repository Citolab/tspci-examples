import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Spreadsheet",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

const PROMPT = "What do the groceries cost in total? Calculate it in the sheet and put the total in cell D6.";

/** What a cell shows. */
const shown = (canvas: MountedPci["canvas"], ref: string) => canvas.getByTestId(ref).textContent;
/** Selects a cell and types in it, as the candidate: typing replaces the cell, Enter puts it in. */
const typeIn = async (canvas: MountedPci["canvas"], ref: string, text: string) => {
  await userEvent.click(canvas.getByTestId(ref));
  await userEvent.keyboard(`${text}{Enter}`);
};

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText(PROMPT)).toBeInTheDocument();
    expect(canvas.getByRole("grid", { name: PROMPT })).toBeInTheDocument();
    // the example sheet: headers and groceries, locked; the answer cell empty
    expect(["A1", "B1", "C1", "D1"].map((ref) => shown(canvas, ref))).toEqual(["Item", "Price (€)", "Quantity", "Total"]);
    expect(["A2", "B2", "C2", "D2"].map((ref) => shown(canvas, ref))).toEqual(["Apples", "0.45", "6", ""]);
    expect(canvas.getByRole("gridcell", { name: "B2: 0.45, locked" })).toHaveAttribute("aria-readonly", "true");
    expect(canvas.getByRole("gridcell", { name: "D6: , answer cell" })).toBeInTheDocument();
    expect(canvas.getByTestId("name-box")).toHaveTextContent("A1");
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const Answering: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("a formula in another cell is calculated, but is not the answer", async () => {
      await typeIn(canvas, "D2", "=B2*C2");
      expect(shown(canvas, "D2")).toBe("2.7");
      expect(canvas.getByRole("gridcell", { name: "D2: 2.7, formula =B2*C2" })).toBeInTheDocument();
      expect(pci.getResponse()).toBeUndefined();
      expect(await lastChange(mounted)).toBeUndefined();
    });

    await step("the answer cell says it is the answer cell", async () => {
      await userEvent.click(canvas.getByTestId("D6"));
      expect(canvas.getByTestId("status")).toHaveTextContent("Your answer goes in this cell.");
    });

    await step("the value of the answer cell is the response", async () => {
      await typeIn(canvas, "D6", "=D2+B3*C3+B4*C4+B5*C5");
      expect(shown(canvas, "D6")).toBe("15.1");
      expect(pci.getResponse()).toEqual({ base: { string: "15.1" } });
      expect(await lastChange(mounted, 2)).toEqual({ base: { string: "15.1" } });
    });

    await step("a change elsewhere changes the answer", async () => {
      await typeIn(canvas, "D2", "0");
      expect(pci.getResponse()).toEqual({ base: { string: "12.4" } });
    });
  },
};

export const ResponseValues: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("a number is written with at most ten significant digits", async () => {
      await typeIn(canvas, "D6", "15.10");
      expect(pci.getResponse()).toEqual({ base: { string: "15.1" } });
      await typeIn(canvas, "D6", "=0.1+0.2");
      expect(pci.getResponse()).toEqual({ base: { string: "0.3" } });
    });
    await step("text as it is, a comparison in English", async () => {
      await typeIn(canvas, "D6", "about 15");
      expect(pci.getResponse()).toEqual({ base: { string: "about 15" } });
      await typeIn(canvas, "D6", "=B2<B3");
      expect(pci.getResponse()).toEqual({ base: { string: "TRUE" } });
    });
    await step("an error as its code", async () => {
      await typeIn(canvas, "D6", "=1/0");
      expect(shown(canvas, "D6")).toBe("#DIV/0!");
      expect(pci.getResponse()).toEqual({ base: { string: "#DIV/0!" } });
      await typeIn(canvas, "D6", "=NOPE(1)");
      expect(pci.getResponse()).toEqual({ base: { string: "#NAME?" } });
      await typeIn(canvas, "D6", "=D6+1");
      expect(pci.getResponse()).toEqual({ base: { string: "#CIRC!" } });
    });
  },
};

export const LockedCells: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await userEvent.click(canvas.getByTestId("B2"));
    await userEvent.keyboard("9");
    expect(canvas.getByTestId("status")).toHaveTextContent("This cell is locked: you cannot change it.");
    expect(shown(canvas, "B2")).toBe("0.45");
    // the formula bar shows what is in it, but cannot change it
    expect(canvas.getByRole("textbox", { name: "Contents of the cell B2" })).toHaveAttribute("readonly");
    await userEvent.keyboard("{Delete}");
    expect(shown(canvas, "B2")).toBe("0.45");
    expect(mounted.changes).toHaveLength(0);
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const DeleteUndoRedo: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await typeIn(canvas, "D6", "15.1");
    expect(pci.getResponse()).toEqual({ base: { string: "15.1" } });

    await userEvent.click(canvas.getByTestId("D6"));
    await userEvent.keyboard("{Delete}");
    expect(shown(canvas, "D6")).toBe("");
    expect(pci.getResponse()).toBeUndefined();

    await userEvent.click(canvas.getByRole("button", { name: "Undo" }));
    expect(shown(canvas, "D6")).toBe("15.1");
    expect(pci.getResponse()).toEqual({ base: { string: "15.1" } });

    await userEvent.click(canvas.getByRole("button", { name: "Redo" }));
    expect(pci.getResponse()).toBeUndefined();
    expect(await lastChange(mounted, 4)).toBeUndefined();
  },
};

export const FormulaBar: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("the formula bar shows the formula, the cell its value", async () => {
      await typeIn(canvas, "D2", "=B2*C2");
      await userEvent.click(canvas.getByTestId("D2"));
      expect(canvas.getByTestId("name-box")).toHaveTextContent("D2");
      expect(canvas.getByRole("textbox", { name: "Contents of the cell D2" })).toHaveValue("=B2*C2");
    });
    await step("the answer can be typed in the formula bar", async () => {
      await userEvent.click(canvas.getByTestId("D6"));
      await userEvent.type(canvas.getByRole("textbox", { name: "Contents of the cell D6" }), "=SUM(D2:D5){Enter}");
      expect(shown(canvas, "D6")).toBe("2.7");
      expect(pci.getResponse()).toEqual({ base: { string: "2.7" } });
    });
  },
};

export const WithoutFormulaBar: Story = {
  args: { properties: { showFormulaBar: "false" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.queryByTestId("formula-bar")).toBeNull();
    expect(canvas.queryByRole("button", { name: "Undo" })).toBeNull();
    // the candidate still types in the cells
    await typeIn(canvas, "D6", "=4*5");
    expect(pci.getResponse()).toEqual({ base: { string: "20" } });
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // numbers with a decimal comma, formulas with Dutch names and ;
    expect(shown(canvas, "B2")).toBe("0,45");
    await typeIn(canvas, "D2", "=SOM(B2;C2)");
    expect(shown(canvas, "D2")).toBe("6,45");
    await typeIn(canvas, "D6", "=ALS(D2>6;15,10;0)");
    expect(shown(canvas, "D6")).toBe("15,1");
    // the response does not depend on the language
    expect(pci.getResponse()).toEqual({ base: { string: "15.1" } });
    await userEvent.click(canvas.getByRole("button", { name: "Uitleg" }));
    expect(canvas.getByText(/Functies: .*SOM/)).toBeInTheDocument();
  },
};

export const ToolMode: Story = {
  args: { properties: { mode: "tool" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    // no answer cell
    expect(canvas.getByRole("gridcell", { name: "D6:" })).toBeInTheDocument();
    await typeIn(canvas, "D6", "=SUM(D2:D5)");
    await typeIn(canvas, "D2", "=B2*C2");
    // the changed cells in reading order, with their input and value
    const response = { base: { string: JSON.stringify({ D2: { input: "=B2*C2", value: "2.7" }, D6: { input: "=SUM(D2:D5)", value: "2.7" } }) } };
    expect(pci.getResponse()).toEqual(response);
    expect(await lastChange(mounted, 2)).toEqual(response);
  },
};

const ownSheet = JSON.stringify({
  columns: 2,
  rows: 2,
  widths: [80, 80],
  cells: { A1: { input: "2", locked: true }, B1: { input: "=A1^3", locked: true }, C9: { input: "outside the sheet" } },
  answer: "B2",
});

export const OwnSheet: Story = {
  args: { properties: { sheet: ownSheet, prompt: "What is 2 to the third power, plus one?" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getAllByRole("gridcell")).toHaveLength(4);
    expect(shown(canvas, "B1")).toBe("8");
    expect(canvas.getByRole("gridcell", { name: "B2: , answer cell" })).toBeInTheDocument();
    await typeIn(canvas, "B2", "=B1+1");
    expect(pci.getResponse()).toEqual({ base: { string: "9" } });
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await typeIn(first.canvas, "D2", "=B2*C2");
    await typeIn(first.canvas, "D6", "=D2*2");
    const state = first.pci.getState();
    expect(JSON.parse(state).state).toEqual({ cells: { D2: "=B2*C2", D6: "=D2*2" } });

    const second = await remountPci(canvasElement, pci, { state });
    expect(shown(second.canvas, "D2")).toBe("2.7");
    expect(shown(second.canvas, "D6")).toBe("5.4");
    expect(second.pci.getResponse()).toEqual({ base: { string: "5.4" } });
    expect(second.changes).toHaveLength(0);
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: { base: { string: "12" } } } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("the bound response goes in the answer cell", async () => {
      await waitFor(() => expect(shown(canvas, "D6")).toBe("12"));
      expect(pci.getResponse()).toEqual({ base: { string: "12" } });
    });

    await step("a response that looks like a formula stays text", async () => {
      pci.setResponse({ base: { string: "=1+1" } });
      await waitFor(() => expect(shown(canvas, "D6")).toBe("=1+1"));
      expect(pci.getResponse()).toEqual({ base: { string: "=1+1" } });
    });

    await step("resetResponse empties it", async () => {
      pci.resetResponse();
      await waitFor(() => expect(shown(canvas, "D6")).toBe(""));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: {
    status: "solution",
    state: JSON.stringify({ state: { cells: { D6: "3" } }, log: [] }),
    responseDeclaration: { correctResponse: { value: "15.1" } },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the correct response replaces the candidate's answer
    await waitFor(() => expect(shown(canvas, "D6")).toBe("15.1"));
    expect(pci.getResponse()).toEqual({ base: { string: "15.1" } });
  },
};

// --- Authoring mode: what an authoring system shows the item author (getAuthoringInstance)

/** The authoring mode, as an authoring system shows it after "Set up the sheet…". */
export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);
    const sheet = () => JSON.parse(instance.getProperties().sheet!);

    await step("starts from the example sheet", async () => {
      expect(canvas.getByTestId("summary")).toHaveTextContent("17 filled cells, 17 locked");
      expect(instance.validate!()).toEqual([]);
    });

    await step("an empty sheet has no answer cell", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Empty sheet" }));
      expect(instance.validate!()).toEqual(['Choose the answer cell: select a cell and press "Answer cell".']);
      expect(sheet().cells).toEqual({});
    });

    await step("the author fills, locks and chooses the answer cell", async () => {
      await typeIn(canvas, "A1", "=6*7");
      // Enter moved down to A2
      expect(canvas.getByTestId("name-box")).toHaveTextContent("A2");
      await userEvent.click(canvas.getByTestId("A1"));
      await userEvent.click(canvas.getByRole("button", { name: "Lock cell A1" }));
      await userEvent.click(canvas.getByTestId("B1"));
      await userEvent.click(canvas.getByRole("button", { name: "Answer cell" }));
      expect(instance.validate!()).toEqual([]);
      expect(sheet()).toMatchObject({ cells: { A1: { input: "=6*7", locked: true } }, answer: "B1" });
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("a locked answer cell is a problem", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Lock cell B1" }));
      expect(instance.validate!()).toEqual(["The answer cell is locked: unlock it, or the candidate cannot answer."]);
    });
  },
};
