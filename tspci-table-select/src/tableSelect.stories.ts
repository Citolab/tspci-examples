import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Table select",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

const PROMPT = "Select the train that arrives before 10:00.";
const rowA = "Train: A; Departs: 08:12; Arrives: 09:47; Platform: 3";

/** The ids (aria-labels) of the checked radio buttons. */
const checked = (canvas: MountedPci["canvas"]) =>
  canvas.getAllByRole("radio").filter((r) => (r as HTMLInputElement).checked).map((r) => r.getAttribute("aria-label"));

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText(PROMPT)).toBeInTheDocument();
    // the example timetable, named by the instruction
    const table = canvas.getByRole("table", { name: PROMPT });
    expect(within(table).getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Train", "Departs", "Arrives", "Platform"]);
    expect(within(table).getAllByRole("rowheader").map((th) => th.textContent)).toEqual(["A", "B", "C", "D"]);
    // one radio button per row, read with the column headers
    expect(canvas.getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual([
      rowA,
      "Train: B; Departs: 08:30; Arrives: 10:05; Platform: 5",
      "Train: C; Departs: 08:45; Arrives: 10:20; Platform: 3",
      "Train: D; Departs: 09:02; Arrives: 10:31; Platform: 7",
    ]);
    expect(checked(canvas)).toEqual([]);
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const SelectRow: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("a click anywhere in a row selects it", async () => {
      await userEvent.click(canvas.getByText("09:47"));
      expect(canvas.getByRole("radio", { name: rowA })).toBeChecked();
      expect(canvas.getByTestId("r1")).toHaveAttribute("data-selected", "true");
      expect(pci.getResponse()).toEqual({ base: { identifier: "r1" } });
      expect(await lastChange(mounted)).toEqual({ base: { identifier: "r1" } });
    });

    await step("another row replaces it", async () => {
      await userEvent.click(canvas.getByText("08:45"));
      expect(checked(canvas)).toEqual(["Train: C; Departs: 08:45; Arrives: 10:20; Platform: 3"]);
      expect(canvas.getByTestId("r1")).toHaveAttribute("data-selected", "false");
      expect(await lastChange(mounted, 2)).toEqual({ base: { identifier: "r3" } });
    });

    await step("clicking the selected row again takes the choice back", async () => {
      await userEvent.click(canvas.getByText("10:20"));
      expect(checked(canvas)).toEqual([]);
      expect(pci.getResponse()).toBeUndefined();
      expect(await lastChange(mounted, 3)).toBeUndefined();
    });
  },
};

export const SelectCell: Story = {
  args: { properties: { selectionMode: "cell" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    // the row headers cannot be selected: 4 rows of 3 cells
    expect(canvas.getAllByRole("radio")).toHaveLength(12);
    expect(canvas.queryByRole("radio", { name: /^A / })).toBeNull();
    // a cell is read with its column and row header
    await userEvent.click(canvas.getByRole("radio", { name: "09:47 (Arrives, A)" }));
    await waitFor(() => expect(canvas.getByTestId("r1-c3")).toHaveAttribute("data-selected", "true"));
    expect(pci.getResponse()).toEqual({ base: { identifier: "r1-c3" } });
    expect(await lastChange(mounted)).toEqual({ base: { identifier: "r1-c3" } });
    // the same text in another cell is another answer
    await userEvent.click(canvas.getAllByText("3")[1]);
    expect(pci.getResponse()).toEqual({ base: { identifier: "r3-c4" } });
  },
};

const ownTable = JSON.stringify({
  // the second column has no id, the second row the id of the first: both get the next free one
  columns: [{ id: "c1", label: "Name" }, { label: "Age" }],
  rows: [{ id: "r3", cells: ["Ann", "12"] }, { id: "r3", cells: ["Bob"] }],
  rowHeaders: false,
});

export const OwnTable: Story = {
  args: { properties: { table: ownTable, prompt: "Who is twelve?" } },
  play: async ({ canvasElement, step }) => {
    const first = await openPci(canvasElement);

    await step("a table of the author, with its ids repaired", async () => {
      expect(first.canvas.getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual([
        "Name: Ann; Age: 12",
        "Name: Bob; Age: empty",
      ]);
      await userEvent.click(first.canvas.getByText("Bob"));
      expect(first.pci.getResponse()).toEqual({ base: { identifier: "r4" } });
    });

    await step("in cell mode without row headers, every cell can be selected", async () => {
      const second = await remountPci(canvasElement, pci, { properties: { table: ownTable, selectionMode: "cell" } });
      expect(second.canvas.getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual([
        "Ann (Name)", "12 (Age)", "Bob (Name)", "empty (Age)",
      ]);
      await userEvent.click(second.canvas.getByRole("radio", { name: "empty (Age)" }));
      expect(second.pci.getResponse()).toEqual({ base: { identifier: "r4-c2" } });
    });
  },
};

export const BrokenTable: Story = {
  args: { properties: { table: "{not json" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    // the example timetable instead
    expect(canvas.getAllByRole("radio")).toHaveLength(4);
    expect(canvas.getByRole("radio", { name: rowA })).toBeInTheDocument();
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", prompt: "", selectionMode: "cell", table: ownTable } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // without an instruction the table is still named
    expect(canvas.getByRole("table", { name: "Tabel" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("radio", { name: "leeg (Age)" }));
    expect(pci.getResponse()).toEqual({ base: { identifier: "r4-c2" } });
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement, step }) => {
    const first = await openPci(canvasElement);
    await userEvent.click(first.canvas.getByText("08:30"));
    const state = first.pci.getState();
    expect(JSON.parse(state).state).toEqual({ selected: "r2" });

    await step("the choice comes back, without telling the player about a change", async () => {
      const second = await remountPci(canvasElement, pci, { state });
      expect(second.canvas.getByTestId("r2")).toHaveAttribute("data-selected", "true");
      expect(second.pci.getResponse()).toEqual({ base: { identifier: "r2" } });
      expect(second.changes).toHaveLength(0);
    });

    await step("a row is no answer in cell mode", async () => {
      const third = await remountPci(canvasElement, pci, { state, properties: { selectionMode: "cell" } });
      expect(third.pci.getResponse()).toBeUndefined();
    });
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: { base: { identifier: "r3" } } } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("the bound response is shown", async () => {
      await waitFor(() => expect(canvas.getByTestId("r3")).toHaveAttribute("data-selected", "true"));
      expect(pci.getResponse()).toEqual({ base: { identifier: "r3" } });
      expect(mounted.changes).toHaveLength(0);
    });

    await step("setResponse takes the id as a string too", async () => {
      pci.setResponse({ base: { string: "r4" } });
      await waitFor(() => expect(canvas.getByTestId("r4")).toHaveAttribute("data-selected", "true"));
      expect(await lastChange(mounted)).toEqual({ base: { identifier: "r4" } });
    });

    await step("an id that is not in the table clears the choice", async () => {
      pci.setResponse({ base: { identifier: "r9" } });
      await waitFor(() => expect(checked(canvas)).toEqual([]));
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("resetResponse clears it as well", async () => {
      pci.setResponse({ base: { identifier: "r1" } });
      await waitFor(() => expect(checked(canvas)).toEqual([rowA]));
      pci.resetResponse();
      await waitFor(() => expect(checked(canvas)).toEqual([]));
    });
  },
};

export const Solution: Story = {
  args: {
    status: "solution",
    state: JSON.stringify({ state: { selected: "r4" }, log: [] }),
    responseDeclaration: { baseType: "identifier", correctResponse: { value: "r1" } },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the correct response replaces the candidate's choice
    await waitFor(() => expect(checked(canvas)).toEqual([rowA]));
    expect(pci.getResponse()).toEqual({ base: { identifier: "r1" } });
  },
};

// --- Authoring mode: what an authoring system shows the item author (getAuthoringInstance)

/** The authoring mode, as an authoring system shows it after "Build the table…". */
export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { selectionMode: "cell" } },
  play: async ({ canvasElement, step }) => {
    const { canvas, instance, changes } = await openAuthoring(canvasElement);
    const table = () => JSON.parse(instance.getProperties().table!);

    await step("starts from the example timetable", async () => {
      expect(canvas.getByTestId("summary")).toHaveTextContent("4 rows, 4 columns");
      expect(instance.validate!()).toEqual([]);
    });

    await step("the author edits a header and adds a row", async () => {
      await retype(canvas.getByRole("textbox", { name: "Header of column 1" }), "Line");
      await userEvent.click(canvas.getByRole("button", { name: "Add row" }));
      await userEvent.type(canvas.getByRole("textbox", { name: "Row 5, column 1" }), "E");
      expect(canvas.getByTestId("summary")).toHaveTextContent("5 rows, 4 columns");
      expect(changes.length).toBeGreaterThan(0);
      const t = table();
      expect(t.columns[0]).toEqual({ id: "c1", label: "Line" });
      expect(t.rows[4]).toEqual({ id: "r5", cells: ["E", "", "", ""] });
    });

    await step("a moved row keeps its id", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Move row 5 up" }));
      expect(table().rows.map((r: { id: string }) => r.id)).toEqual(["r1", "r2", "r3", "r5", "r4"]);
    });

    await step("in cell mode, only row headers leave nothing to select", async () => {
      for (const n of [4, 3, 2]) await userEvent.click(canvas.getByRole("button", { name: `Remove column ${n}` }));
      const problem = "There is nothing to select: in cell mode, add a column next to the row headers.";
      expect(canvas.getByTestId("summary")).toHaveTextContent(`5 rows, 1 column${problem}`);
      expect(instance.validate!()).toEqual([problem]);
      // without row headers, the column can be selected
      await userEvent.click(canvas.getByRole("checkbox", { name: /First column holds row headers/ }));
      expect(instance.validate!()).toEqual([]);
      expect(table().rowHeaders).toBe(false);
    });
  },
};
