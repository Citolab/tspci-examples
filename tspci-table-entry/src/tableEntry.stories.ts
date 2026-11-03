import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { focusedIn, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Table entry",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

const PROMPT = "A ball is dropped from a height of 20 m. After t seconds its height is h = 20 − 4.9 × t² metres. Fill in the table; round to one decimal.";
// the three input cells of the example, named by their row and column header
const AT_05 = "height (m), time (s) 0.5 (field 1 of 3)";
const AT_15 = "height (m), time (s) 1.5 (field 2 of 3)";
const AT_2 = "height (m), time (s) 2 (field 3 of 3)";

const field = (canvas: MountedPci["canvas"], name: string) => canvas.getByRole("textbox", { name }) as HTMLInputElement;
const values = (canvas: MountedPci["canvas"]) => canvas.getAllByRole("textbox").map((t) => (t as HTMLInputElement).value);
const list = (...values: string[]) => ({ list: { string: values } });
/** The field that has the focus, in the PCI's shadow root. */
const focused = (mounted: MountedPci) => focusedIn(mounted.root)?.getAttribute("aria-label");

/** A table of the author: a header row on top, no row headers. */
const costTable = JSON.stringify({
  columns: [{ id: "c1" }, { id: "c2" }, { id: "c3" }],
  rows: [
    { id: "r1", cells: ["Item", "Price (€)", "City"] },
    { id: "r2", cells: ["Pen", { kind: "input", text: "1.50" }, { kind: "input", text: "Den Haag" }] },
  ],
  headerColumn: false,
  headerRow: true,
});

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText(PROMPT)).toBeInTheDocument();
    // the example: the height of a falling ball, named by the instruction
    const table = canvas.getByRole("table", { name: PROMPT });
    expect(within(table).getAllByRole("rowheader").map((th) => th.textContent)).toEqual(["time (s)", "height (m)"]);
    expect(within(table).getAllByRole("cell").map((td) => td.textContent).filter(Boolean)).toEqual(["0", "0.5", "1", "1.5", "2", "20", "15.1"]);
    // three empty fields, for numbers, read with their headers
    expect(canvas.getAllByRole("textbox").map((t) => t.getAttribute("aria-label"))).toEqual([AT_05, AT_15, AT_2]);
    expect(values(canvas)).toEqual(["", "", ""]);
    expect(field(canvas, AT_05)).toHaveAttribute("inputmode", "decimal");
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const Typing: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("a number goes in, a comma becomes the point of English", async () => {
      await userEvent.type(field(canvas, AT_05), "18,8");
      expect(field(canvas, AT_05)).toHaveValue("18.8");
      expect(pci.getResponse()).toEqual(list("18.8", "", ""));
      expect(await lastChange(mounted)).toEqual(list("18.8", "", ""));
    });

    await step("a letter is refused, with a message a screen reader hears", async () => {
      await userEvent.type(field(canvas, AT_05), "x");
      expect(field(canvas, AT_05)).toHaveValue("18.8");
      expect(canvas.getByRole("status")).toHaveTextContent("Only digits and one decimal point are allowed.");
      expect(field(canvas, AT_05)).toHaveAttribute("aria-invalid", "true");
      expect(canvas.getByTestId("message")).toBeVisible();
    });

    await step("a second decimal point is refused", async () => {
      await userEvent.type(field(canvas, AT_05), ".");
      expect(field(canvas, AT_05)).toHaveValue("18.8");
      expect(canvas.getByRole("status")).toHaveTextContent("Only one decimal point is allowed.");
    });

    await step("a valid key takes the message away", async () => {
      await userEvent.type(field(canvas, AT_05), "{Backspace}");
      expect(field(canvas, AT_05)).toHaveValue("18.");
      expect(canvas.getByRole("status")).toHaveTextContent("");
      expect(canvas.queryByTestId("message")).toBeNull();
      expect(field(canvas, AT_05)).not.toHaveAttribute("aria-invalid");
    });

    await step("at most 6 characters, no minus sign", async () => {
      await userEvent.type(field(canvas, AT_15), "1234567");
      expect(field(canvas, AT_15)).toHaveValue("123456");
      expect(canvas.getByRole("status")).toHaveTextContent("At most 6 characters.");
      await retype(field(canvas, AT_2), "-1");
      expect(field(canvas, AT_2)).toHaveValue("1");
      expect(pci.getResponse()).toEqual(list("18", "123456", "1"));
    });
  },
};

export const KeyboardNavigation: Story = {
  args: {
    // a second row of inputs under the first
    properties: {
      table: JSON.stringify({
        columns: [{ id: "c1" }, { id: "c2" }, { id: "c3" }, { id: "c4" }],
        rows: [
          { id: "r1", cells: ["x", "1", "2", "3"] },
          { id: "r2", cells: ["2x", { kind: "input", text: "2" }, "4", { kind: "input", text: "6" }] },
          { id: "r3", cells: ["3x", { kind: "input", text: "3" }, { kind: "input", text: "6" }, { kind: "input", text: "9" }] },
        ],
        headerColumn: true,
        headerRow: false,
      }),
    },
  },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    const name = (row: string, x: string, n: number) => `${row}, x ${x} (field ${n} of 5)`;

    await step("Enter goes to the next field in reading order, Shift+Enter back", async () => {
      await userEvent.click(field(canvas, name("2x", "1", 1)));
      await userEvent.keyboard("2{Enter}");
      expect(focused(mounted)).toBe(name("2x", "3", 2));
      await userEvent.keyboard("6{Enter}");
      expect(focused(mounted)).toBe(name("3x", "1", 3));
      await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
      expect(focused(mounted)).toBe(name("2x", "3", 2));
    });

    await step("the arrow keys go to the nearest field in that direction", async () => {
      await userEvent.keyboard("{ArrowDown}");
      expect(focused(mounted)).toBe(name("3x", "3", 5));
      await userEvent.keyboard("{ArrowLeft}");
      expect(focused(mounted)).toBe(name("3x", "2", 4));
      await userEvent.keyboard("{ArrowUp}");
      // nothing above x 2: stays
      expect(focused(mounted)).toBe(name("3x", "2", 4));
      await userEvent.keyboard("7{ArrowRight}");
      expect(focused(mounted)).toBe(name("3x", "3", 5));
    });

    await step("left and right move on only at the edge of the text", async () => {
      await userEvent.keyboard("12{ArrowLeft}");
      expect(focused(mounted)).toBe(name("3x", "3", 5));
      await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
      expect(focused(mounted)).toBe(name("3x", "2", 4));
    });

    // Tab is the browser's own: the fields are ordinary inputs in reading order
    expect(values(canvas)).toEqual(["2", "6", "", "7", "12"]);
  },
};

export const ResponseValues: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    // what the candidate sees stays; the response is the number, written one way
    await userEvent.type(field(canvas, AT_05), "018,80");
    await userEvent.type(field(canvas, AT_15), ",5");
    await userEvent.type(field(canvas, AT_2), "0,");
    expect(values(canvas)).toEqual(["018.80", ".5", "0."]);
    expect(pci.getResponse()).toEqual(list("18.8", "0.5", "0"));
    // an emptied field is "" at its place; all empty is no response
    await retype(field(canvas, AT_05), "{Backspace}");
    await retype(field(canvas, AT_2), "{Backspace}");
    await waitFor(() => expect(pci.getResponse()).toEqual(list("", "0.5", "")));
    await retype(field(canvas, AT_15), "{Backspace}");
    await waitFor(() => expect(pci.getResponse()).toBeUndefined());
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", prompt: "" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // without an instruction the table is still named
    expect(canvas.getByRole("table", { name: "Tabel" })).toBeInTheDocument();
    const first = field(canvas, "height (m), time (s) 0.5 (invulveld 1 van 3)");
    // a point becomes the Dutch decimal comma; the response has a point
    await userEvent.type(first, "18.8");
    expect(first).toHaveValue("18,8");
    expect(pci.getResponse()).toEqual(list("18.8", "", ""));
    await userEvent.type(first, "a");
    expect(canvas.getByRole("status")).toHaveTextContent("Je mag alleen cijfers en één komma invoeren.");
    await userEvent.type(first, ",");
    expect(canvas.getByRole("status")).toHaveTextContent("Je mag maar één komma invoeren.");
  },
};

export const WholeNumbers: Story = {
  args: { properties: { decimals: "0", maxcharacters: "3" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // a number pad without a decimal key; settings in lower case work too
    expect(field(canvas, AT_05)).toHaveAttribute("inputmode", "numeric");
    await userEvent.type(field(canvas, AT_05), "19,");
    expect(field(canvas, AT_05)).toHaveValue("19");
    expect(canvas.getByRole("status")).toHaveTextContent("Only whole numbers are allowed.");
    await userEvent.type(field(canvas, AT_05), "99");
    expect(field(canvas, AT_05)).toHaveValue("199");
    expect(canvas.getByRole("status")).toHaveTextContent("At most 3 characters.");
    expect(pci.getResponse()).toEqual(list("199", "", ""));
  },
};

export const OneDecimalNegative: Story = {
  args: { properties: { decimals: "1", allowNegative: "true" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await userEvent.type(field(canvas, AT_05), "-4,25");
    expect(field(canvas, AT_05)).toHaveValue("-4.2");
    expect(canvas.getByRole("status")).toHaveTextContent("At most 1 decimal.");
    // a minus sign only in front
    await userEvent.type(field(canvas, AT_15), "3-");
    expect(field(canvas, AT_15)).toHaveValue("3");
    expect(pci.getResponse()).toEqual(list("-4.2", "3", ""));
  },
};

export const TextWithHeaderRow: Story = {
  args: { properties: { table: costTable, inputMode: "text", maxCharacters: "0", prompt: "Fill in the price and the city." } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const table = canvas.getByRole("table", { name: "Fill in the price and the city." });
    expect(within(table).getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Item", "Price (€)", "City"]);
    const city = field(canvas, "City (field 2 of 2)");
    expect(city).toHaveAttribute("inputmode", "text");
    // any text, trimmed and with single spaces in the response
    await userEvent.type(city, "  Den   Haag ");
    expect(city).toHaveValue("  Den   Haag ");
    expect(pci.getResponse()).toEqual(list("", "Den Haag"));
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement, step }) => {
    const first = await openPci(canvasElement);
    await userEvent.type(field(first.canvas, AT_05), "18,8");
    await userEvent.type(field(first.canvas, AT_2), "0.4");
    const state = first.pci.getState();
    expect(JSON.parse(state).state).toEqual({ values: { "r2-c3": "18.8", "r2-c6": "0.4" } });

    await step("the values come back, without telling the player about a change", async () => {
      const second = await remountPci(canvasElement, pci, { state });
      expect(values(second.canvas)).toEqual(["18.8", "", "0.4"]);
      expect(second.pci.getResponse()).toEqual(list("18.8", "", "0.4"));
      expect(JSON.parse(second.pci.getState()).log.length).toBe(JSON.parse(state).log.length);
      expect(second.changes).toHaveLength(0);
    });

    await step("a state that is not of this PCI: an empty table", async () => {
      const third = await remountPci(canvasElement, pci, { state: "{not json" });
      expect(values(third.canvas)).toEqual(["", "", ""]);
      expect(third.pci.getResponse()).toBeUndefined();
    });
  },
};

export const BoundResponse: Story = {
  args: { properties: { language: "nl" }, boundTo: { RESPONSE: list("18.8", "9", "") } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("the bound response is shown, in Dutch", async () => {
      await waitFor(() => expect(values(canvas)).toEqual(["18,8", "9", ""]));
      expect(pci.getResponse()).toEqual(list("18.8", "9", ""));
      expect(mounted.changes).toHaveLength(0);
    });

    await step("setResponse", async () => {
      pci.setResponse(list("1", "2.5", "3"));
      await waitFor(() => expect(values(canvas)).toEqual(["1", "2,5", "3"]));
      expect(await lastChange(mounted)).toEqual(list("1", "2.5", "3"));
    });

    await step("resetResponse empties the table", async () => {
      pci.resetResponse();
      await waitFor(() => expect(values(canvas)).toEqual(["", "", ""]));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: {
    status: "solution",
    properties: { language: "nl" },
    state: JSON.stringify({ state: { values: { "r2-c3": "17" } }, log: [] }),
    responseDeclaration: { baseType: "string", cardinality: "ordered", correctResponse: { value: ["18.8", "9", "0.4"] } },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the correct response replaces the candidate's values, read-only
    await waitFor(() => expect(values(canvas)).toEqual(["18,8", "9", "0,4"]));
    for (const t of canvas.getAllByRole("textbox")) expect(t).toHaveAttribute("readonly");
    expect(pci.getResponse()).toEqual(list("18.8", "9", "0.4"));
  },
};

export const PciScoring: Story = {
  args: { properties: { scoring: "pci", maxScore: "2", penalty: "1" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    const record = (vals: string[], correct: number, errors: number, score: number) => ({
      record: [
        { name: "values", base: { string: JSON.stringify(vals) } },
        { name: "correct", base: { integer: correct } },
        { name: "errors", base: { integer: errors } },
        { name: "score", base: { integer: score } },
        { name: "maxscore", base: { integer: 2 } },
      ],
    });

    await step("within the margin of ±0.1 counts as right; one missing: 1 point off", async () => {
      await userEvent.type(field(canvas, AT_05), "18,7");
      await userEvent.type(field(canvas, AT_15), "9");
      expect(pci.getResponse()).toEqual(record(["18.7", "9", ""], 2, 1, 1));
      expect(await lastChange(mounted, 2)).toEqual(record(["18.7", "9", ""], 2, 1, 1));
    });

    await step("all right: 2 points", async () => {
      await userEvent.type(field(canvas, AT_2), "0,45");
      expect(pci.getResponse()).toEqual(record(["18.7", "9", "0.45"], 3, 0, 2));
    });

    await step("outside the margin: wrong; never below 0", async () => {
      await retype(field(canvas, AT_05), "18,95");
      await retype(field(canvas, AT_15), "8");
      await retype(field(canvas, AT_2), "1");
      expect(pci.getResponse()).toEqual(record(["18.95", "8", "1"], 0, 3, 0));
    });

    await step("a record comes back as a bound response", async () => {
      const again = await remountPci(canvasElement, pci, { properties: { scoring: "pci" }, boundTo: { RESPONSE: record(["18.7", "9", ""], 2, 1, 1) } });
      await waitFor(() => expect(values(again.canvas)).toEqual(["18.7", "9", ""]));
    });

    await step("solution status without a correct response: the expected values of the table", async () => {
      const solution = await remountPci(canvasElement, pci, { status: "solution", properties: { scoring: "pci" } });
      await waitFor(() => expect(values(solution.canvas)).toEqual(["18.8", "9", "0.4"]));
    });
  },
};

/** Two interactions in one item: the registered PCI gets getInstance twice, as a player calls it. */
export const TwoInstances: Story = {
  render: () => {
    const page = document.createElement("div");
    page.style.display = "grid";
    page.style.gap = "24px";
    for (const id of ["first", "second"]) {
      const host = document.createElement("div");
      host.dataset.instance = id;
      page.appendChild(host);
    }
    return page;
  },
  play: async ({ canvasElement, step }) => {
    const [a, b] = ["first", "second"].map((id) => canvasElement.querySelector<HTMLElement>(`[data-instance="${id}"]`)!);
    const start = (host: HTMLElement, properties: Record<string, string>) =>
      new Promise<any>((resolve) =>
        pci.getInstance(host, { properties, responseIdentifier: "RESPONSE", boundTo: {}, onready: resolve } as any, undefined)
      );
    const first = await start(a, {});
    const second = await start(b, { table: costTable, inputMode: "text", maxCharacters: "0", language: "nl", prompt: "Vul in." });
    const one = within(a.shadowRoot as unknown as HTMLElement);
    const two = within(b.shadowRoot as unknown as HTMLElement);

    await step("each has its own object, settings and table", async () => {
      expect(first).not.toBe(second);
      expect(first).not.toBe(pci);
      expect(first.store).not.toBe(second.store);
      expect(one.getAllByRole("textbox")).toHaveLength(3);
      expect(two.getAllByRole("textbox")).toHaveLength(2);
    });

    await step("and its own response and state", async () => {
      await userEvent.type(one.getByRole("textbox", { name: AT_05 }), "18,8");
      await userEvent.type(two.getByRole("textbox", { name: "City (invulveld 2 van 2)" }), "Utrecht");
      expect(first.getResponse()).toEqual(list("18.8", "", ""));
      expect(second.getResponse()).toEqual(list("", "Utrecht"));
      expect(JSON.parse(first.getState()).state).toEqual({ values: { "r2-c3": "18.8" } });
      expect(JSON.parse(second.getState()).state).toEqual({ values: { "r2-c3": "Utrecht" } });
    });

    await step("the first still works after the second", async () => {
      first.setResponse(list("1", "2", "3"));
      await waitFor(() => expect(one.getAllByRole("textbox").map((t) => (t as HTMLInputElement).value)).toEqual(["1", "2", "3"]));
      expect(second.getResponse()).toEqual(list("", "Utrecht"));
      first.oncompleted();
      second.oncompleted();
    });
  },
};

// --- Authoring mode: what an authoring system shows the item author (getAuthoringInstance)

/** The authoring mode, as an authoring system shows it after "Build the table…". */
export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { decimals: "1" }, width: 1000 },
  play: async ({ canvasElement, step }) => {
    const { canvas, instance, changes, root } = await openAuthoring(canvasElement);
    const table = () => JSON.parse(instance.getProperties().table!);

    await step("starts from the example table", async () => {
      expect(canvas.getByTestId("summary")).toHaveTextContent("3 input cells");
      expect(instance.validate!()).toEqual([]);
      expect(Object.keys(instance.getProperties())).toEqual(["table"]);
      expect(canvas.getByRole("textbox", { name: "Expected value of row 2, column 3" })).toHaveValue("18.8");
      expect(canvas.getByRole("textbox", { name: "Tolerance (±) of row 2, column 3" })).toHaveValue("0.1");
    });

    await step("a given cell becomes an input; its text is the expected value", async () => {
      // the switch of row 1, column 4
      const toggle = root.querySelector<HTMLElement>('[data-testid="input-toggle-0-3"]')!;
      expect(toggle).toHaveAccessibleName("Input");
      await userEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-pressed", "true");
      expect(canvas.getByRole("textbox", { name: "Expected value of row 1, column 4" })).toHaveValue("1");
      expect(canvas.getByTestId("summary")).toHaveTextContent("4 input cells");
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("what is wrong is shown, and validate() keeps it from being used", async () => {
      const expected = canvas.getByRole("textbox", { name: "Expected value of row 1, column 4" });
      await retype(expected, "{Backspace}");
      await waitFor(() => expect(instance.validate!()).toEqual(["No expected value: row 1 column 4."]));
      await userEvent.type(expected, "1,25");
      await waitFor(() => expect(instance.validate!()).toEqual(["The expected value has more decimals than allowed: row 1 column 4."]));
      expect(canvas.getByText("The expected value has more decimals than allowed: row 1 column 4.")).toBeInTheDocument();
      await retype(expected, "1,2");
      await userEvent.type(canvas.getByRole("textbox", { name: "Tolerance (±) of row 1, column 4" }), "0,05");
      await waitFor(() => expect(instance.validate!()).toEqual([]));
      expect(table().rows[0].cells[3]).toEqual({ kind: "input", text: "1,2", tolerance: "0,05" });
    });

    await step("cells pasted from a spreadsheet, [value ± margin] an input", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Add row" }));
      const header = canvas.getByRole("textbox", { name: "Text of row 3, column 1" });
      header.focus();
      const data = new DataTransfer();
      data.setData("text/plain", "speed (m/s)\t0\t[4,9]\t[9,8 ± 0,1]\n");
      header.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      await waitFor(() => expect(canvas.getByTestId("summary")).toHaveTextContent("6 input cells"));
      expect(table().rows[2].cells.slice(0, 4)).toEqual(["speed (m/s)", "0", { kind: "input", text: "4,9" }, { kind: "input", text: "9,8", tolerance: "0,1" }]);
      expect(pci.getCorrectResponse({ table: instance.getProperties().table })).toEqual(list("1.2", "18.8", "9", "0.4", "4.9", "9.8"));
    });

    await step("headers and removing rows and columns", async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: "Header row on top" }));
      expect(table().headerRow).toBe(true);
      // the first row is now headers: its input does not count
      expect(canvas.getByTestId("summary")).toHaveTextContent("5 input cells");
      await userEvent.click(canvas.getByRole("button", { name: "Remove column 6" }));
      await userEvent.click(canvas.getByRole("button", { name: "Remove row 3" }));
      expect(table().columns.map((c: { id: string }) => c.id)).toEqual(["c1", "c2", "c3", "c4", "c5"]);
      expect(table().rows.map((r: { id: string }) => r.id)).toEqual(["r1", "r2"]);
      expect(canvas.getByTestId("summary")).toHaveTextContent("2 input cells");
    });

    await step("no inputs left: a problem", async () => {
      for (const column of [2, 4]) {
        await userEvent.click(root.querySelector<HTMLElement>(`[data-testid="given-toggle-1-${column}"]`)!);
      }
      await waitFor(() => expect(instance.validate!()).toEqual(["Make at least one cell an input."]));
    });
  },
};

/** The authoring mode in Dutch, for a Dutch authoring system. */
export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { inputMode: "text" } },
  play: async ({ canvasElement }) => {
    const { canvas, instance } = await openAuthoring(canvasElement);
    expect(canvas.getByTestId("summary")).toHaveTextContent("3 invulvakjes");
    expect(canvas.getByRole("button", { name: "Rij toevoegen" })).toBeInTheDocument();
    // text mode: no margins
    expect(canvas.queryByRole("textbox", { name: /Marge/ })).toBeNull();
    await retype(canvas.getByRole("textbox", { name: "Verwachte waarde van rij 2, kolom 3" }), "{Backspace}");
    await waitFor(() => expect(instance.validate!()).toEqual(["Geen verwachte waarde: rij 2 kolom 3."]));
  },
};
