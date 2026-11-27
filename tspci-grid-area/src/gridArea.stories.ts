import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, waitFor } from "storybook/test";
import {
  afterPaint, focusedIn, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, type AuthoringArgs, type MountedPci, type PciArgs,
} from "../../.storybook/tspci";
import pci from "./index";

/** The registered factory: getCorrectResponse is on it, not on an instance. */
const factory = pci;

const meta = {
  title: "Grid area",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

// the defaults of config.json: a 12 × 8 grid, draw a rectangle with area 12 and perimeter 14
const TITLE = "Area and perimeter";
const QUESTION = "Draw a rectangle with an area of 12 squares and a perimeter of 14.";
const COLUMNS = 12;
const EXAMPLE = "//..####/..####/..####"; // the default `shape` setting: the example answer, 4 × 3

// ---- the grid: squares by row and column (from 1), as the pupil sees them

type Root = MountedPci["root"] | HTMLElement | ShadowRoot;
const grids = (root: Root) => Array.from(root.querySelectorAll<SVGSVGElement>("svg[role=grid]"));
/** A square of the (first) grid, by its row and column, counting from 1. */
const square = (root: Root, row: number, column: number, grid = 0, columns = COLUMNS) => {
  const found = grids(root)[grid]?.querySelector<SVGRectElement>(`[data-cell="${(row - 1) * columns + column - 1}"]`);
  if (!found) throw new Error(`no square ${row}, ${column} in grid ${grid}`);
  return found;
};
/** What a square holds, as its accessible name says: "empty", "coloured" or "half coloured, …". */
const holds = (cell: Element) => /: (.*)$/.exec(cell.getAttribute("aria-label") ?? "")?.[1];

/** A pointer event in the middle of a square (or at a point of it, as a fraction from its top left). */
const pointer = (type: string, cell: Element, fx = 0.5, fy = 0.5) => {
  const box = cell.getBoundingClientRect();
  return new PointerEvent(type, {
    clientX: box.left + box.width * fx,
    clientY: box.top + box.height * fy,
    bubbles: true,
    composed: true,
    pointerId: 1,
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
    isPrimary: true,
  });
};
/** A click on a square: down and up, as a pupil's mouse or finger. */
async function click(cell: Element) {
  const svg = cell.closest("svg")!;
  cell.dispatchEvent(pointer("pointerdown", cell));
  svg.dispatchEvent(pointer("pointerup", cell));
  await afterPaint();
}
/** A drag from the first square over the others (one move per square), and let go on the last. */
async function drag(...cells: Element[]) {
  const svg = cells[0].closest("svg")!;
  cells[0].dispatchEvent(pointer("pointerdown", cells[0]));
  for (const cell of cells.slice(1)) {
    svg.dispatchEvent(pointer("pointermove", cell));
    await afterPaint();
  }
  svg.dispatchEvent(pointer("pointerup", cells[cells.length - 1]));
  await afterPaint();
}
/** Colours a rectangle of squares, one click each. */
async function colour(mounted: MountedPci, rows: number[], columns: number[]) {
  for (const row of rows) for (const column of columns) await click(square(mounted.root, row, column));
}
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
/** A key on the square with the focus (userEvent.keyboard does not reach into the shadow root). */
async function press(mounted: MountedPci, key: string) {
  const target = focusedIn(mounted.root) ?? mounted.root;
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, composed: true, cancelable: true }));
  await afterPaint();
}

// ---- the response: a record

type Field = { name: string; base?: Record<string, unknown> };
const fieldsOf = (response: unknown) =>
  Object.fromEntries(((response as { record?: Field[] })?.record ?? []).map((f) => [f.name, Object.values(f.base ?? {})[0]]));
const record = (fields: Record<string, unknown>) => ({
  record: Object.entries(fields).map(([name, value]) => ({
    name,
    base: { [typeof value === "boolean" ? "boolean" : typeof value === "number" ? "float" : name === "choice" ? "identifier" : "string"]: value },
  })),
});

const inputs = (mounted: MountedPci) => Array.from(mounted.root.querySelectorAll<HTMLInputElement>("input[data-answer]"));
const answerBox = (mounted: MountedPci, field: "areaAnswer" | "perimeterAnswer") => mounted.root.querySelector<HTMLInputElement>(`input[data-answer=${field}]`)!;
/** Sets the text of an input as typing does underneath: the value, then an input event. */
const fill = async (input: HTMLInputElement, text: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await afterPaint();
};

// ---- draw

/** The grid area to try out yourself (no test runs on it): with a mouse, a touchscreen or the keyboard. */
export const ToTry: Story = {
  name: "Grid area, to try",
};

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.getByRole("heading", { name: TITLE })).toBeInTheDocument();
    expect(canvas.getByText(QUESTION)).toBeInTheDocument();
    // squared paper of 12 × 8, an ARIA grid, everything empty
    const grid = canvas.getByRole("grid", { name: "Squared paper, 12 by 8 squares" });
    expect(canvas.getAllByRole("row")).toHaveLength(8);
    expect(canvas.getAllByRole("gridcell")).toHaveLength(96);
    expect(holds(square(mounted.root, 1, 1))).toBe("empty");
    expect(grid.querySelectorAll("polygon")).toHaveLength(0);
    // one square in the tab order: the keyboard's cursor
    expect(grid.querySelectorAll("[tabindex='0']")).toHaveLength(1);
    expect(canvas.getByRole("button", { name: "Clear" })).toBeInTheDocument();
    expect(canvas.getByText(/Click or drag over the squares/)).toBeInTheDocument();
    // nothing drawn, nothing reported
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const DrawARectangle: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { pci } = mounted;

    await step("a click colours a square, and the response says what it is", async () => {
      await click(square(mounted.root, 3, 3));
      expect(holds(square(mounted.root, 3, 3))).toBe("coloured");
      expect(square(mounted.root, 3, 3)).toHaveAttribute("aria-selected", "true");
      expect(fieldsOf(await lastChange(mounted))).toMatchObject({ area: 1, perimeter: 4, rectangle: true, meetsRules: false });
    });

    await step("a rectangle of 4 × 3: area 12, perimeter 14, meets the rules", async () => {
      await colour(mounted, [3, 4, 5], range(3, 6));
      // (3, 3) was coloured already: the click above removed it again
      expect(holds(square(mounted.root, 3, 3))).toBe("empty");
      await click(square(mounted.root, 3, 3));
      expect(fieldsOf(pci.getResponse())).toEqual({
        area: 12, perimeter: 14, connected: true, noHoles: true, rectangle: true, meetsRules: true, shape: "//..####/..####/..####",
      });
      expect(fieldsOf(await lastChange(mounted))).toMatchObject({ meetsRules: true });
      // coloured squares are hatched and the shape has an outline: not only a colour
      const grid = grids(mounted.root)[0];
      expect(grid.querySelectorAll("polygon")).toHaveLength(12);
      expect(grid.querySelector("pattern line")).not.toBeNull();
      expect(grid.querySelectorAll("[data-outline] line")).toHaveLength(14);
    });

    await step("one square more: no rectangle, and the rules are not met", async () => {
      await click(square(mounted.root, 6, 3));
      expect(fieldsOf(pci.getResponse())).toMatchObject({ area: 13, perimeter: 16, rectangle: false, connected: true, meetsRules: false });
    });

    await step("Clear empties the grid: no response", async () => {
      mounted.canvas.getByRole("button", { name: "Clear" }).click();
      await afterPaint();
      expect(pci.getResponse()).toBeUndefined();
      expect(await lastChange(mounted)).toBeUndefined();
    });
  },
};

export const DragToColourAndErase: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { pci } = mounted;
    const row2 = range(2, 7).map((column) => square(mounted.root, 2, column));
    // a drag from an empty square colours every square it passes
    await drag(...row2);
    expect(row2.map(holds)).toEqual(Array(6).fill("coloured"));
    expect(fieldsOf(pci.getResponse())).toMatchObject({ area: 6, perimeter: 14, rectangle: true });
    // a drag from a coloured square erases
    await drag(row2[3], row2[4], row2[5]);
    expect(row2.map(holds)).toEqual(["coloured", "coloured", "coloured", "empty", "empty", "empty"]);
    expect(fieldsOf(pci.getResponse())).toMatchObject({ area: 3, perimeter: 8 });
    // down a column too
    await drag(square(mounted.root, 3, 2), square(mounted.root, 4, 2), square(mounted.root, 5, 2));
    expect(fieldsOf(pci.getResponse())).toMatchObject({ area: 6, perimeter: 14, rectangle: false, connected: true });
  },
};

export const OnePieceAndNoHoles: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { pci } = mounted;
    await step("squares that only touch at a corner are two pieces", async () => {
      await click(square(mounted.root, 2, 2));
      await click(square(mounted.root, 3, 3));
      expect(fieldsOf(pci.getResponse())).toMatchObject({ area: 2, perimeter: 8, connected: false, noHoles: true, meetsRules: false });
    });
    await step("a ring has a hole: its perimeter counts the inside too", async () => {
      mounted.canvas.getByRole("button", { name: "Clear" }).click();
      await afterPaint();
      await drag(...[1, 2, 3].map((c) => square(mounted.root, 1, c)));
      await drag(...[1, 2, 3].map((c) => square(mounted.root, 3, c)));
      await click(square(mounted.root, 2, 1));
      await click(square(mounted.root, 2, 3));
      expect(fieldsOf(pci.getResponse())).toMatchObject({ area: 8, perimeter: 16, connected: true, noHoles: false, rectangle: false });
    });
  },
};

/** Any shape with area 10: no target perimeter, no rectangle asked. */
export const AnyShapeWithArea10: Story = {
  args: { properties: { question: "Draw a shape with an area of 10 squares.", targetArea: "10", targetPerimeter: "", mustBeRectangle: "false", shape: "" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    await drag(...range(1, 5).map((c) => square(mounted.root, 2, c)));
    await drag(...range(3, 7).map((c) => square(mounted.root, 3, c)));
    expect(fieldsOf(mounted.pci.getResponse())).toMatchObject({ area: 10, perimeter: 18, connected: true, rectangle: false, meetsRules: true });
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { pci } = mounted;
    square(mounted.root, 1, 1).focus();
    expect(focusedIn(mounted.root)).toBe(square(mounted.root, 1, 1));
    // the cursor shows where the keyboard is
    await afterPaint();
    expect(grids(mounted.root)[0].querySelector("[data-cursor]")).not.toBeNull();
    await press(mounted, "ArrowRight");
    await press(mounted, "ArrowDown");
    expect(focusedIn(mounted.root)).toBe(square(mounted.root, 2, 2));
    expect(square(mounted.root, 2, 2)).toHaveAttribute("tabindex", "0");
    expect(square(mounted.root, 1, 1)).toHaveAttribute("tabindex", "-1");
    await press(mounted, " ");
    expect(holds(square(mounted.root, 2, 2))).toBe("coloured");
    await press(mounted, "ArrowRight");
    await press(mounted, "Enter");
    expect(fieldsOf(pci.getResponse())).toMatchObject({ area: 2, perimeter: 6 });
    // Delete empties a square, Space again too
    await press(mounted, "Delete");
    await press(mounted, "ArrowLeft");
    await press(mounted, " ");
    expect(pci.getResponse()).toBeUndefined();
    // the cursor stops at the edge; End and Home go to the end and start of the row
    await press(mounted, "End");
    expect(focusedIn(mounted.root)).toBe(square(mounted.root, 2, 12));
    await press(mounted, "ArrowRight");
    expect(focusedIn(mounted.root)).toBe(square(mounted.root, 2, 12));
    await press(mounted, "Home");
    expect(focusedIn(mounted.root)).toBe(square(mounted.root, 2, 1));
  },
};

export const HalfSquares: Story = {
  args: { properties: { halves: "true", targetArea: "", targetPerimeter: "", mustBeRectangle: "false", columns: "6", rows: "4", shape: "" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { pci, canvas } = mounted;
    const cell = () => square(mounted.root, 2, 2, 0, 6);
    expect(canvas.getByText(/for a half square/)).toBeInTheDocument();
    // a click colours the square, the next ones turn it into the four halves, clockwise, and then empty it
    const seen: (string | undefined)[] = [];
    for (let i = 0; i < 6; i++) {
      await click(cell());
      seen.push(holds(cell()));
    }
    expect(seen).toEqual([
      "coloured",
      "half coloured, top-left half",
      "half coloured, top-right half",
      "half coloured, bottom-right half",
      "half coloured, bottom-left half",
      "empty",
    ]);
    // a square and a half: area 1.5; a slanting side, so no perimeter in the response
    await click(square(mounted.root, 2, 1, 0, 6));
    for (let i = 0; i < 2; i++) await click(cell()); // the top-left half: it covers the side it shares with the square
    const response = fieldsOf(pci.getResponse());
    expect(response).toMatchObject({ area: 1.5, connected: true, rectangle: false, shape: "/#a" });
    expect(response).not.toHaveProperty("perimeter");
    expect(grids(mounted.root)[0].querySelectorAll("polygon")).toHaveLength(2);
    expect(grids(mounted.root)[0].querySelector("polygon[data-value='2']")!.getAttribute("points")!.split(" ")).toHaveLength(3);
  },
};

export const RestoreTheState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await drag(square(first.root, 2, 2), square(first.root, 2, 3), square(first.root, 2, 4));
    const response = first.pci.getResponse();
    expect(fieldsOf(response)).toMatchObject({ area: 3 });
    // the pupil comes back to the item: the player hands the state of the first session
    const second = await remountPci(canvasElement, pci, { state: first.pci.getState() });
    expect(second.pci.getResponse()).toEqual(response);
    expect(holds(square(second.root, 2, 3))).toBe("coloured");
    // nothing changed, nothing reported
    expect(second.changes).toHaveLength(0);
    // a state of another grid size is ignored: the grid starts empty
    const other = await remountPci(canvasElement, pci, { state: first.pci.getState(), properties: { columns: "10" } });
    expect(other.pci.getResponse()).toBeUndefined();
  },
};

export const RestoreAResponse: Story = {
  args: { boundTo: { RESPONSE: record({ area: 4, shape: "/.##/.##" }) } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(holds(square(mounted.root, 2, 2))).toBe("coloured");
    expect(holds(square(mounted.root, 3, 3))).toBe("coloured");
    expect(fieldsOf(mounted.pci.getResponse())).toMatchObject({ area: 4, perimeter: 8, rectangle: true, shape: "/.##/.##" });
    // setResponse too
    mounted.pci.setResponse(record({ shape: "#" }));
    await afterPaint();
    expect(fieldsOf(mounted.pci.getResponse())).toMatchObject({ area: 1, shape: "#" });
  },
};

export const Review: Story = {
  args: { status: "review", boundTo: { RESPONSE: record({ shape: "/.##/.##" }) } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const before = mounted.pci.getResponse();
    // read-only: a click changes nothing, Clear is disabled, the hint is gone
    await click(square(mounted.root, 5, 5));
    expect(mounted.pci.getResponse()).toEqual(before);
    expect(mounted.canvas.getByRole("button", { name: "Clear" })).toBeDisabled();
    expect(mounted.canvas.queryByText(/Click or drag/)).toBeNull();
    expect(mounted.canvas.getByRole("grid")).toHaveAttribute("aria-readonly", "true");
  },
};

/** The solution of a drawing: the author's example shape (the `shape` setting), read-only. */
export const Solution: Story = {
  args: { status: "solution" },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(fieldsOf(mounted.pci.getResponse())).toMatchObject({ shape: EXAMPLE, meetsRules: true });
    await click(square(mounted.root, 1, 1));
    expect(holds(square(mounted.root, 1, 1))).toBe("empty");
    // the correct response from the settings: the fields that must be true
    expect(factory.getCorrectResponse!({})).toEqual(record({ connected: true, noHoles: true, rectangle: true, meetsRules: true }));
    expect(factory.getCorrectResponse!({ mustBeRectangle: "false" })).toEqual(record({ connected: true, noHoles: true, meetsRules: true }));
  },
};

// ---- measure

const MEASURE = { task: "measure", question: "What are the area and the perimeter of this shape?", shape: "/.#/.##/.###", columns: "8", rows: "5", unitLabel: "1 square = 1 cm²" };

export const Measure: Story = {
  args: { properties: MEASURE },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { pci, canvas } = mounted;
    await step("the author's shape, read-only, and two boxes", async () => {
      expect(canvas.getByText("1 square = 1 cm²")).toBeInTheDocument();
      expect(canvas.getByRole("grid")).toHaveAttribute("aria-readonly", "true");
      expect(holds(square(mounted.root, 2, 2, 0, 8))).toBe("coloured");
      await click(square(mounted.root, 1, 1, 0, 8));
      expect(holds(square(mounted.root, 1, 1, 0, 8))).toBe("empty");
      expect(canvas.queryByRole("button", { name: "Clear" })).toBeNull();
      expect(canvas.getByRole("textbox", { name: /Area/ })).toBe(answerBox(mounted, "areaAnswer"));
      expect(canvas.getByRole("textbox", { name: /Perimeter/ })).toBe(answerBox(mounted, "perimeterAnswer"));
      expect(pci.getResponse()).toBeUndefined();
    });
    await step("the typed numbers are the response", async () => {
      await fill(answerBox(mounted, "areaAnswer"), "6");
      expect(fieldsOf(await lastChange(mounted))).toEqual({ areaAnswer: 6 });
      await fill(answerBox(mounted, "perimeterAnswer"), "12");
      expect(pci.getResponse()).toEqual(record({ areaAnswer: 6, perimeterAnswer: 12 }));
      await fill(answerBox(mounted, "areaAnswer"), "5½");
      expect(fieldsOf(pci.getResponse())).toMatchObject({ areaAnswer: 5.5 });
    });
    await step("no number: no answer, and the box is invalid", async () => {
      await fill(answerBox(mounted, "areaAnswer"), "zes");
      expect(pci.getResponse()).toEqual(record({ perimeterAnswer: 12 }));
      expect(answerBox(mounted, "areaAnswer").checkValidity()).toBe(false);
      expect(pci.checkValidity()).toBe(false);
    });
    // the correct response follows from the shape
    expect(factory.getCorrectResponse!(MEASURE)).toEqual(record({ areaAnswer: 6, perimeterAnswer: 12 }));
  },
};

export const MeasureOnlyTheArea: Story = {
  args: { properties: { ...MEASURE, ask: "area", halves: "true", shape: "/.#a/.##" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(inputs(mounted)).toHaveLength(1);
    await fill(answerBox(mounted, "areaAnswer"), "3,5");
    expect(mounted.pci.getResponse()).toEqual(record({ areaAnswer: 3.5 }));
    expect(factory.getCorrectResponse!({ ...MEASURE, ask: "area", shape: "/.#a/.##" })).toEqual(record({ areaAnswer: 3.5 }));
    // a perimeter cannot be asked of a shape with a slanting side
    expect(factory.getCorrectResponse!({ ...MEASURE, ask: "both", shape: "/.#a/.##" })).toBeUndefined();
  },
};

export const MeasureSolution: Story = {
  args: { properties: { ...MEASURE, language: "nl" }, status: "solution" },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    // no declared correct response: the one from the settings, in Dutch
    expect(mounted.canvas.getByRole("textbox", { name: /Oppervlakte/ })).toHaveValue("6");
    expect(mounted.canvas.getByRole("textbox", { name: /Omtrek/ })).toHaveValue("12");
    expect(mounted.canvas.getByRole("textbox", { name: /Omtrek/ })).toBeDisabled();
    expect(mounted.canvas.getByRole("grid", { name: "Ruitjespapier, 8 bij 5 hokjes" })).toBeInTheDocument();
    expect(holds(square(mounted.root, 2, 2, 0, 8))).toBe("gekleurd");
  },
};

export const MeasureDeclaredSolution: Story = {
  args: { properties: MEASURE, status: "solution", responseDeclaration: { correctResponse: { value: record({ areaAnswer: 6.5, perimeterAnswer: 12 }) } } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(answerBox(mounted, "areaAnswer")).toHaveValue("6.5");
    expect(mounted.pci.getResponse()).toEqual(record({ areaAnswer: 6.5, perimeterAnswer: 12 }));
  },
};

// ---- compare

const COMPARE = { task: "compare", question: "Look at the shapes.", columns: "6", rows: "5", shape: "/.####/.####", shapeB: "/.#/.#/.#/.####", compareBy: "perimeter" };

export const Compare: Story = {
  args: { properties: COMPARE },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    // two grids, A hatched and B dotted
    expect(grids(mounted.root)).toHaveLength(2);
    expect(canvas.getByRole("grid", { name: "Shape A: Squared paper, 6 by 5 squares" })).toBeInTheDocument();
    expect(grids(mounted.root)[1].querySelector("pattern circle")).not.toBeNull();
    expect(canvas.getByText("Which shape has the larger perimeter?")).toBeInTheDocument();
    expect(pci.getResponse()).toBeUndefined();
    canvas.getByRole("radio", { name: "Shape B" }).click();
    await afterPaint();
    expect(await lastChange(mounted)).toEqual(record({ choice: "B" }));
    canvas.getByRole("radio", { name: "Both the same" }).click();
    await afterPaint();
    expect(pci.getResponse()).toEqual(record({ choice: "same" }));
    // A: 8 squares, perimeter 12; B: 7 squares, perimeter 16
    expect(factory.getCorrectResponse!(COMPARE)).toEqual(record({ choice: "B" }));
    expect(factory.getCorrectResponse!({ ...COMPARE, compareBy: "area" })).toEqual(record({ choice: "A" }));
  },
};

export const CompareSolution: Story = {
  args: { properties: COMPARE, status: "solution" },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.canvas.getByRole("radio", { name: "Shape B" })).toBeChecked();
    expect(mounted.canvas.getByRole("radio", { name: "Shape A" })).toBeDisabled();
  },
};

// ---- two on one page

export const TwoOnOnePage: Story = {
  render: () => {
    const page = document.createElement("div");
    for (const properties of [{ columns: "6", rows: "3", title: "One" }, { columns: "5", rows: "3", title: "Two" }]) {
      const part = document.createElement("div");
      part.className = "part";
      part.appendChild(mountPci(pci, { properties }));
      page.appendChild(part);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const [one, two] = Array.from(canvasElement.querySelectorAll<HTMLElement>(".part"));
    const a = await openPci(one);
    const b = await openPci(two);
    await click(square(a.root, 1, 1, 0, 6));
    expect(fieldsOf(a.pci.getResponse())).toMatchObject({ area: 1 });
    expect(b.pci.getResponse()).toBeUndefined();
    expect(b.changes).toHaveLength(0);
    await drag(square(b.root, 2, 1, 0, 5), square(b.root, 2, 2, 0, 5));
    expect(fieldsOf(b.pci.getResponse())).toMatchObject({ area: 2, shape: "/##" });
    expect(fieldsOf(a.pci.getResponse())).toMatchObject({ area: 1, shape: "#" });
  },
};

// ---- the authoring mode: the author draws the shapes

export const AuthoringMeasure: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { properties: { task: "measure", columns: "8", rows: "5", shape: "" } },
  play: async ({ canvasElement }) => {
    const { instance, canvas, root, changes } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("heading", { name: "Draw the shape to measure" })).toBeInTheDocument();
    // nothing drawn: Done is held back
    expect(instance.validate()).toEqual(["Draw the shape the pupil measures."]);
    await drag(square(root, 2, 2, 0, 8), square(root, 2, 3, 0, 8), square(root, 2, 4, 0, 8));
    await click(square(root, 3, 2, 0, 8));
    expect(changes.length).toBeGreaterThan(0);
    expect(instance.getProperties()).toEqual({ shape: "/.###/.#", shapeB: "" });
    expect(instance.validate()).toEqual([]);
    // what the PCI computes of it
    await waitFor(() => expect(root.querySelector("[data-measures]")).toHaveTextContent(/Area\s*4 squares/));
    expect(root.querySelector("[data-measures]")).toHaveTextContent(/Perimeter\s*10/);
  },
};

export const AuthoringHalvesAndPerimeter: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { properties: { task: "measure", columns: "6", rows: "4", halves: "true", shape: "#a" }, language: "nl" },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("heading", { name: "De figuur om te meten tekenen" })).toBeInTheDocument();
    expect(instance.validate()).toEqual([
      "Een figuur met halve hokjes heeft schuine zijden en geen omtrek in roostereenheden: vraag alleen de oppervlakte, of gebruik hele hokjes.",
    ]);
  },
};

export const AuthoringDraw: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  play: async ({ canvasElement }) => {
    const { instance, root } = await openAuthoring(canvasElement);
    // the default example meets the default rules
    expect(instance.validate()).toEqual([]);
    expect(root.querySelector("[data-measures]")).toHaveTextContent(/Meets the rules\s*yes/);
    await click(square(root, 1, 1));
    expect(instance.validate()).toEqual(["The example shape does not meet the rules."]);
    // the example is optional
    root.querySelector<HTMLButtonElement>("button")!.click();
    await afterPaint();
    expect(instance.getProperties()).toEqual({ shape: "", shapeB: "" });
    expect(instance.validate()).toEqual([]);
  },
};

export const AuthoringImpossibleRules: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { properties: { targetArea: "12", targetPerimeter: "15", shape: "" } },
  play: async ({ canvasElement }) => {
    const { instance } = await openAuthoring(canvasElement);
    expect(instance.validate()).toEqual(["No shape on this grid can meet the rules (area, perimeter, rectangle)."]);
  },
};

export const AuthoringCompare: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { properties: { task: "compare", columns: "6", rows: "5", shape: "##/##", shapeB: "" } },
  play: async ({ canvasElement }) => {
    const { instance, root, canvas } = await openAuthoring(canvasElement);
    expect(grids(root)).toHaveLength(2);
    expect(instance.validate()).toEqual(["Draw both shapes."]);
    await drag(...[1, 2, 3, 4, 5].map((c) => square(root, 1, c, 1, 6)));
    expect(instance.getProperties()).toEqual({ shape: "##/##", shapeB: "#####" });
    expect(instance.validate()).toEqual([]);
    // area 4 against 5
    expect(canvas.getByText(/Correct answer: Shape B/)).toBeInTheDocument();
  },
};

// ---- cover: a floor plan, strips of carpet off a roll, and the bill

// the defaults of config.json: an L of 6 m by 5 m without a corner of 2 m by 2 m, 1 m a square, a roll of 4 m, the door
// (0.8 m) in the bottom wall of 4 m; the least plan is two strips top to bottom of 5 m and 3 m (waste 6 m²)
const COVER = { task: "cover", title: "Carpeting my room", question: "Make a plan and a price for new carpet in this room." };
const COVER_COLUMNS = 12;

const $ = (root: Root, selector: string) => root.querySelector<HTMLElement>(selector);
const $$ = (root: Root, selector: string) => Array.from(root.querySelectorAll<HTMLElement>(selector));
const planStrip = (root: Root, index: number) => $(root, `[data-strip="${index}"]`)!;
const stripRow = (root: Root, index: number) => $(root, `[data-strip-row="${index}"]`)!;
const box = (root: Root, field: string) => $(root, `input[data-answer=${field}]`) as HTMLInputElement;
/** The width of a square of the plan on screen (the plan has margins of 1.6 squares left and right). */
const squarePx = (root: Root, columns = COVER_COLUMNS) => $(root, "[data-plan]")!.getBoundingClientRect().width / (columns + 3.2);

/** A finger on an element: down in its middle (or at a point of it), moved by dx, dy pixels in a few steps, and lifted. */
async function fingerDrag(element: Element, dx: number, dy: number, { fx = 0.5, fy = 0.5, lift = true } = {}) {
  const b = element.getBoundingClientRect();
  const x = b.left + b.width * fx, y = b.top + b.height * fy;
  const event = (type: string, px: number, py: number) =>
    new PointerEvent(type, { clientX: px, clientY: py, bubbles: true, composed: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1 });
  element.dispatchEvent(event("pointerdown", x, y));
  for (let i = 1; i <= 4; i++) {
    element.dispatchEvent(event("pointermove", x + (dx * i) / 4, y + (dy * i) / 4));
    await afterPaint();
  }
  if (lift) element.dispatchEvent(event("pointerup", x + dx, y + dy));
  await afterPaint();
}
/** A key on an element of the PCI (userEvent.keyboard does not reach into the shadow root). */
async function key(element: Element, k: string) {
  element.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, composed: true, cancelable: true }));
  await afterPaint();
}
const button = (mounted: { canvas: MountedPci["canvas"] }, name: string | RegExp) => mounted.canvas.getByRole("button", { name });

/** The floor covering to try yourself (no test runs on it): with a mouse, a finger or the keyboard. */
export const CoverToTry: Story = {
  name: "Floor covering, to try",
  args: { properties: COVER },
};

export const CoverAnLShapedRoom: Story = {
  args: { properties: COVER },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;
    expect(canvas.getByRole("heading", { name: "Carpeting my room" })).toBeInTheDocument();
    // the plan, in words for a screen reader: the walls clockwise, and the door
    const plan = canvas.getByRole("img", { name: /^Floor plan on squared paper of 12 by 8 squares, 1 square = 1 m\./ });
    expect(plan.getAttribute("aria-label")).toContain("6 m, 3 m, 2 m, 2 m, 4 m with the door (0.8 m), 5 m");
    // the lengths of the walls in metres, the door, the scale and the roll
    expect(Array.from(root.querySelectorAll("[data-lengths] text")).map((t) => t.textContent)).toEqual(["6 m", "3 m", "2 m", "2 m", "4 m", "5 m"]);
    expect($(root, "[data-door] text")).toHaveTextContent("door 0.8 m");
    expect($(root, "[data-scale]")).toHaveTextContent("1 square = 1 m");
    expect($(root, "[data-roll]")).toHaveTextContent("Carpet comes on a roll 4 m wide and is sold per running metre.");
    // the three parts, in the order of the work
    expect(canvas.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["1. The floor area", "2. Lay the strips", "3. The bill"]);
    expect(canvas.getByRole("textbox", { name: /Floor area/ })).toBe(box(root, "floorArea"));
    expect(canvas.getByText("No strips yet.")).toBeInTheDocument();
    expect(canvas.getByRole("textbox", { name: "Carpet: metres" })).toBe(box(root, "coveringMetres"));
    expect(canvas.getByRole("textbox", { name: "Skirting: amount in euros" })).toBe(box(root, "skirtingAmount"));
    expect(canvas.getByText("€39.95 per m")).toBeInTheDocument();
    expect(canvas.getByText("€12.95")).toBeInTheDocument();
    // nothing done, nothing reported
    expect(pci.getResponse()).toBeUndefined();
    await fill(box(root, "floorArea"), "26");
    expect(fieldsOf(await lastChange(mounted))).toMatchObject({ area: 26, areaCorrect: true, covered: false, correct: false });
    await fill(box(root, "floorArea"), "25 m²");
    expect(fieldsOf(pci.getResponse())).toMatchObject({ area: 25, areaCorrect: false });
    await fill(box(root, "floorArea"), "zes");
    expect(box(root, "floorArea").checkValidity()).toBe(false);
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const CoverStripsByFinger: Story = {
  args: { properties: { ...COVER, coverParts: "strips" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { root, pci } = mounted;
    const u = squarePx(root);
    await step("a tap on Add a strip lays one at the floor's first square, left to right, as wide as the roll", async () => {
      button(mounted, "+ Add a strip").click();
      await afterPaint();
      expect(fieldsOf(await lastChange(mounted))).toMatchObject({ strips: "across 1 1 4", runningMetres: 4, covered: false });
      expect(stripRow(root, 0)).toHaveTextContent("Strip 1: left to right, 4 m");
      expect(focusedIn(root)).toBe(stripRow(root, 0)); // the focus on the new strip
      expect(planStrip(root, 0).classList.contains("selected")).toBe(true);
    });
    await step("Turn, and drag the handle down a square: 5 m top to bottom", async () => {
      button(mounted, "Turn strip 1").click();
      await afterPaint();
      expect(fieldsOf(pci.getResponse())).toMatchObject({ strips: "down 1 1 4" });
      await fingerDrag($(root, "[data-handle]")!, 0, u);
      expect(fieldsOf(pci.getResponse())).toMatchObject({ strips: "down 1 1 5", runningMetres: 5 });
      expect($(root, "[data-live]")).toHaveTextContent("Strip 1: top to bottom, 5 m long and 4 m wide, 1 m from the left and 1 m from the top of the paper");
    });
    await step("a second strip, moved with a finger and made shorter: covered with the least waste", async () => {
      button(mounted, "+ Add a strip").click();
      await afterPaint();
      // at the first square not covered (column 6, row 2), the same way round as the last one
      expect(fieldsOf(pci.getResponse())).toMatchObject({ strips: "down 1 1 5; down 5 1 4", covered: true, leastWaste: false });
      await fingerDrag(planStrip(root, 1), 2 * u, u); // two squares right, one down
      expect(fieldsOf(pci.getResponse())).toMatchObject({ strips: "down 1 1 5; down 7 2 4", covered: false });
      await fingerDrag(planStrip(root, 1), -2 * u, -u);
      await fingerDrag($(root, "[data-handle]")!, 0, -u);
      expect(fieldsOf(pci.getResponse())).toEqual({
        covered: true, waste: 6, runningMetres: 8, leastWaste: true, strips: "down 1 1 5; down 5 1 3", correct: true,
      });
    });
    await step("a tap does not move a strip, and a cancelled drag (a scroll) puts it back", async () => {
      const before = pci.getResponse();
      await fingerDrag(planStrip(root, 0), 4, 3); // a finger moves a little
      expect(pci.getResponse()).toEqual(before);
      expect(focusedIn(root)).toBe(stripRow(root, 0)); // the tap chose strip 1
      const s = planStrip(root, 0);
      await fingerDrag(s, 3 * u, 0, { lift: false });
      expect(fieldsOf(pci.getResponse())).toMatchObject({ covered: false });
      s.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 7, pointerType: "touch", bubbles: true, composed: true }));
      await afterPaint();
      expect(pci.getResponse()).toEqual(before);
    });
    // only what is dragged ignores the browser's touch gestures
    expect(getComputedStyle(planStrip(root, 0)).touchAction).toBe("none");
    expect(getComputedStyle($(root, "[data-plan]")!).touchAction).not.toBe("none");
    // the handle is at least 24 px
    expect($(root, "[data-handle]")!.getBoundingClientRect().width).toBeGreaterThanOrEqual(24);
  },
};

export const CoverStripsByKeyboard: Story = {
  args: { properties: { ...COVER, coverParts: "strips" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { root, pci } = mounted;
    const add = button(mounted, "+ Add a strip");
    add.focus();
    add.click();
    await afterPaint();
    await waitFor(() => expect(focusedIn(root)).toBe(stripRow(root, 0)));
    const row = () => focusedIn(root)!;
    // the strip's button says where it is, and how to move it
    expect(row().getAttribute("aria-label")).toBe("Strip 1: left to right, 4 m long and 4 m wide, 1 m from the left and 1 m from the top of the paper");
    expect(root.getElementById?.(row().getAttribute("aria-describedby")!) ?? null).toHaveTextContent(/R turns it/);
    await key(row(), "r");
    await key(row(), "+");
    expect(fieldsOf(pci.getResponse())).toMatchObject({ strips: "down 1 1 5" });
    expect($(root, "[data-live]")).toHaveTextContent("Strip 1: top to bottom, 5 m long");
    // arrows move it a square, and it stops at the edge of the paper
    await key(row(), "ArrowRight");
    await key(row(), "ArrowUp");
    await key(row(), "ArrowUp");
    expect(fieldsOf(pci.getResponse())).toMatchObject({ strips: "down 2 0 5" });
    await key(row(), "ArrowLeft");
    await key(row(), "ArrowDown");
    // a second strip: Add a strip, and on with its keys
    add.click();
    await afterPaint();
    await waitFor(() => expect(focusedIn(root)).toBe(stripRow(root, 1)));
    await key(row(), "-");
    expect(fieldsOf(pci.getResponse())).toMatchObject({ strips: "down 1 1 5; down 5 1 3", covered: true, leastWaste: true, correct: true });
    // Delete removes it, and the focus goes to the strip before it; the last one: to Add a strip
    await key(row(), "Delete");
    await waitFor(() => expect(focusedIn(root)).toBe(stripRow(root, 0)));
    expect($(root, "[data-live]")).toHaveTextContent("Strip 2 removed.");
    await key(row(), "Backspace");
    await waitFor(() => expect(focusedIn(root)).toBe(add));
    expect(pci.getResponse()).toBeUndefined();
  },
};

const BILL = { ...COVER, coverParts: "bill", strips: "across 1 1 6; across 1 4 6" };

export const CoverTheBill: Story = {
  args: { properties: BILL },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { root, pci, canvas } = mounted;
    await step("the author's strips are on the plan, and cannot be moved", async () => {
      expect(canvas.getByText("The strips are laid already.")).toBeInTheDocument();
      expect($$(root, "[data-strip]")).toHaveLength(2);
      expect(canvas.queryByRole("button", { name: /Add a strip/ })).toBeNull();
      expect(getComputedStyle(planStrip(root, 0)).touchAction).not.toBe("none");
      expect(canvas.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["The bill"]);
    });
    await step("the bill for 12 m, filled in line by line", async () => {
      await fill(box(root, "coveringMetres"), "12");
      await fill(box(root, "coveringAmount"), "479,40");
      await fill(box(root, "skirtingMetres"), "21,2 m");
      await fill(box(root, "skirtingAmount"), "53");
      await fill(box(root, "thresholdAmount"), "€ 12,95");
      expect(fieldsOf(pci.getResponse())).toMatchObject({ billCorrect: true, totalCorrect: false });
      await fill(box(root, "total"), "545.35");
      expect(fieldsOf(await lastChange(mounted))).toEqual({
        billCorrect: true, total: 545.35, totalCorrect: true,
        bill: "coveringMetres=12; coveringAmount=479.4; skirtingMetres=21.2; skirtingAmount=53; thresholdAmount=12.95", correct: true,
      });
    });
    await step("the skirting without the door taken off: the line is wrong, the total of the pupil's own amounts is right", async () => {
      await fill(box(root, "skirtingMetres"), "22");
      await fill(box(root, "skirtingAmount"), "55");
      await fill(box(root, "total"), "547,35");
      expect(fieldsOf(pci.getResponse())).toMatchObject({ billCorrect: false, total: 547.35, totalCorrect: true, correct: false });
      await fill(box(root, "total"), "550");
      expect(fieldsOf(pci.getResponse())).toMatchObject({ totalCorrect: false });
      await fill(box(root, "total"), "veel");
      expect(box(root, "total").checkValidity()).toBe(false);
      expect(pci.checkValidity()).toBe(false);
    });
    // the correct response: for the author's plan
    expect(fieldsOf(factory.getCorrectResponse!(BILL))).toMatchObject({ billCorrect: true, total: 545.35, totalCorrect: true, correct: true });
  },
};

export const CoverInDutch: Story = {
  args: {
    properties: {
      ...COVER, language: "nl", title: "", question: "Bereken de oppervlakte van de vloer.", coverParts: "area", scale: "0.5", columns: "16", rows: "12",
      room: "/.##########/.##########/.##########/.##########/.##########/.##########/.##########/.##########/.##.#######", door: "", material: "vinyl",
    },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { root, canvas, pci } = mounted;
    // 5 m by 4.5 m, without a chimney breast of 0.5 by 0.5 m in the bottom wall: 22.25 m²
    expect($(root, "[data-scale]")).toHaveTextContent("1 hokje = 0,5 m");
    expect(Array.from(root.querySelectorAll("[data-lengths] text")).map((t) => t.textContent)).toContain("4,5 m");
    expect(canvas.getByRole("img", { name: /^Plattegrond op ruitjespapier van 16 bij 12 hokjes, 1 hokje = 0,5 m\./ })).toBeInTheDocument();
    expect($(root, "[data-door]")).toBeNull();
    expect($(root, "[data-roll]")).toBeNull(); // only the area: no roll
    expect(canvas.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["De oppervlakte van de vloer"]);
    await fill(canvas.getByRole("textbox", { name: /Oppervlakte vloer/ }) as HTMLInputElement, "22,25");
    expect(pci.getResponse()).toEqual(record({ area: 22.25, areaCorrect: true, correct: true }));
  },
};

export const CoverBillInDutch: Story = {
  args: { properties: { ...BILL, language: "nl" }, status: "solution" },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { root, canvas } = mounted;
    // euros as in tspci-money: "€ 39,95"; the solution filled in, read-only
    expect(canvas.getByText("€ 39,95 per m")).toBeInTheDocument();
    expect(canvas.getByRole("textbox", { name: "Tapijt: bedrag in euro" })).toHaveValue("479,40");
    expect(canvas.getByRole("textbox", { name: "Plinten: meters" })).toHaveValue("21,2");
    expect(box(root, "total")).toHaveValue("545,35");
    expect(box(root, "total")).toBeDisabled();
    expect(fieldsOf(mounted.pci.getResponse())).toMatchObject({ billCorrect: true, total: 545.35, correct: true });
  },
};

export const CoverSolution: Story = {
  args: { properties: COVER, status: "solution" },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { root, canvas, pci } = mounted;
    // the plan with the least waste, the area and the bill; nothing can be changed
    expect($$(root, "[data-strip]")).toHaveLength(2);
    expect(box(root, "floorArea")).toHaveValue("26");
    expect(box(root, "coveringMetres")).toHaveValue("8");
    expect(box(root, "total")).toHaveValue("385.55");
    expect(canvas.queryByRole("button", { name: /Add a strip/ })).toBeNull();
    expect(canvas.queryByRole("button", { name: /Turn/ })).toBeNull();
    expect(pci.getResponse()).toEqual(factory.getCorrectResponse!(COVER));
    expect(fieldsOf(pci.getResponse())).toEqual({
      area: 26, areaCorrect: true, covered: true, waste: 6, runningMetres: 8, leastWaste: true, strips: "down 1 1 5; down 5 1 3",
      billCorrect: true, total: 385.55, totalCorrect: true,
      bill: "coveringMetres=8; coveringAmount=319.6; skirtingMetres=21.2; skirtingAmount=53; thresholdAmount=12.95", correct: true,
    });
    const before = pci.getResponse();
    await fingerDrag(planStrip(root, 0), 3 * squarePx(root), 0);
    expect(pci.getResponse()).toEqual(before);
  },
};

export const CoverRestore: Story = {
  args: { properties: COVER },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await fill(box(first.root, "floorArea"), "26");
    button(first, "+ Add a strip").click();
    await afterPaint();
    await fill(box(first.root, "coveringMetres"), "4");
    const response = first.pci.getResponse();
    // the state of the first session
    const second = await remountPci(canvasElement, pci, { properties: COVER, state: first.pci.getState() });
    expect(second.pci.getResponse()).toEqual(response);
    expect(second.changes).toHaveLength(0);
    // a response handed back (boundTo): the area, the plan and the bill
    const third = await remountPci(canvasElement, pci, { properties: COVER, boundTo: { RESPONSE: factory.getCorrectResponse!(COVER)! } });
    expect(third.pci.getResponse()).toEqual(factory.getCorrectResponse!(COVER));
    expect($$(third.root, "[data-strip]")).toHaveLength(2);
    expect(box(third.root, "skirtingAmount")).toHaveValue("53.00");
    // a state of an earlier version (no floor covering in it) still restores a drawing
    const old = JSON.stringify({ state: { cells: Array(96).fill(0).map((_, i) => (i === 0 ? 1 : 0)), areaAnswer: "", perimeterAnswer: "", choice: "" }, log: [] });
    const fourth = await remountPci(canvasElement, pci, { state: old });
    expect(fieldsOf(fourth.pci.getResponse())).toMatchObject({ area: 1, shape: "#" });
  },
};

export const CoverTwoOnOnePage: Story = {
  render: () => {
    const page = document.createElement("div");
    for (const properties of [{ ...COVER, title: "One", coverParts: "strips" }, { ...COVER, title: "Two", coverParts: "strips" }]) {
      const part = document.createElement("div");
      part.className = "part";
      part.appendChild(mountPci(pci, { properties }));
      page.appendChild(part);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const [one, two] = Array.from(canvasElement.querySelectorAll<HTMLElement>(".part"));
    const a = await openPci(one);
    const b = await openPci(two);
    button(a, "+ Add a strip").click();
    await afterPaint();
    expect(fieldsOf(a.pci.getResponse())).toMatchObject({ strips: "across 1 1 4" });
    expect(b.pci.getResponse()).toBeUndefined();
    expect(b.changes).toHaveLength(0);
  },
};

export const AuthoringCover: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { properties: { task: "cover", room: "", door: "" } },
  play: async ({ canvasElement, step }) => {
    const { instance, root, canvas } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("heading", { name: "Draw the room" })).toBeInTheDocument();
    expect(instance.validate()).toEqual(["Draw the room."]);
    await step("a room of 5 m by 3 m with a bay window of 2 m by 1 m", async () => {
      for (const row of [2, 3, 4]) await drag(...range(2, 6).map((c) => square(root, row, c)));
      await drag(square(root, 1, 3), square(root, 1, 4));
      expect(instance.getProperties()).toEqual({ room: "..##/.#####/.#####/.#####", door: "", strips: "" });
      expect(instance.validate()).toEqual([]);
      expect(root.querySelector("[data-measures]")).toHaveTextContent(/Floor area\s*17 m²/);
      expect(root.querySelector("[data-measures]")).toHaveTextContent(/Perimeter\s*18 m/);
    });
    await step("the door, in a wall chosen from the list", async () => {
      const select = root.querySelector<HTMLSelectElement>("[data-door-select]")!;
      expect(Array.from(select.options).map((o) => o.text)).toEqual([
        "No door", "Wall 1: top, 2 m", "Wall 2: right, 1 m", "Wall 3: top, 2 m", "Wall 4: right, 3 m", "Wall 5: bottom, 5 m", "Wall 6: left, 3 m", "Wall 7: top, 1 m", "Wall 8: left, 1 m",
      ]);
      select.value = "5";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await afterPaint();
      expect(instance.getProperties()).toMatchObject({ door: "5" });
      expect(root.querySelector("[data-door]")).not.toBeNull();
      expect(root.querySelector("[data-measures]")).toHaveTextContent(/Skirting \(without the door\)\s*17.2 m/);
    });
    await step("the plan with the least waste, and a plan that is not", async () => {
      button({ canvas }, "Lay the plan with the least waste").click();
      await afterPaint();
      // left to right, one band of 5 m over the bay window: waste 3 m²
      expect(instance.getProperties()).toMatchObject({ strips: "across 1 0 5" });
      expect(instance.validate()).toEqual([]);
      expect(root.querySelector("[data-measures]")).toHaveTextContent(/Least running length\s*5 m \(left to right\), waste 3 m²/);
      expect(root.querySelector("[data-bill-preview]")).toHaveTextContent("5 m × €39.95 = €199.75");
      // one square shorter: the floor is not covered
      const row = root.querySelector<HTMLElement>('[data-strip-row="0"]')!;
      row.focus();
      await key(row, "-");
      expect(instance.validate()).toEqual(["The plan does not cover the whole floor."]);
    });
  },
};

export const AuthoringCoverInDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { properties: { task: "cover", rollWidth: "3,5", door: "3", doorWidth: "2,5" }, language: "nl" },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("heading", { name: "De kamer tekenen" })).toBeInTheDocument();
    expect(instance.validate()).toEqual([
      "De rolbreedte moet een heel aantal hokjes zijn (een veelvoud van de schaal).",
      "De deur is breder dan de muur.",
    ]);
  },
};

/** The picture in the README (example.png): a rectangle drawn on squared paper with a unit. */
export const Example: Story = {
  args: { properties: { unitLabel: "1 square = 1 cm²" }, boundTo: { RESPONSE: record({ shape: "/.####/.####/.####" }) }, width: 560 },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(fieldsOf(mounted.pci.getResponse())).toMatchObject({ area: 12, perimeter: 14, meetsRules: true });
  },
};
