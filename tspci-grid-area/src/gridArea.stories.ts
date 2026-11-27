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

/** The picture in the README (example.png): a rectangle drawn on squared paper with a unit. */
export const Example: Story = {
  args: { properties: { unitLabel: "1 square = 1 cm²" }, boundTo: { RESPONSE: record({ shape: "/.####/.####/.####" }) }, width: 560 },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(fieldsOf(mounted.pci.getResponse())).toMatchObject({ area: 12, perimeter: 14, meetsRules: true });
  },
};
