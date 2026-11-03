import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { afterPaint, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import { EXAMPLES, type Mode, type Puzzle } from "./net";
import pci from "./index";

const meta = {
  title: "Net folding",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Canvas = MountedPci["canvas"];
type Rec = { record: { name: string; base: { integer?: number; string?: string } | null }[] } | undefined;

/** A field of the build record. */
const field = (response: unknown, name: string) => (response as Rec)?.record.find((f) => f.name === name)?.base;
/** The identifiers of a list response. */
const ids = (response: unknown) => (response as { list?: { identifier: string[] } } | undefined)?.list?.identifier;
const puzzle = (mode: Mode, extra: Partial<Puzzle> = {}) => JSON.stringify({ ...EXAMPLES[mode], ...extra });
const cell = (canvas: Canvas, row: number, column: number) => canvas.getByRole("gridcell", { name: new RegExp(`^Row ${row}, column ${column}:`) });
/** Clicks cells (row, column), 1-based. */
const clickCells = async (canvas: Canvas, cells: [number, number][]) => {
  for (const [r, c] of cells) await userEvent.click(cell(canvas, r, c));
};
const CROSS: [number, number][] = [[2, 3], [3, 2], [3, 3], [3, 4], [3, 5], [4, 3]];
/** Sets the fold slider, as the candidate dragging it (userEvent's arrow keys do not move a native range). */
const slide = async (canvas: Canvas, value: number, name = "Fold") => {
  const range = canvas.getByRole("slider", { name }) as HTMLInputElement;
  range.value = String(value);
  range.dispatchEvent(new Event("input", { bubbles: true }));
  await afterPaint();
  return range;
};

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByTestId("prompt")).toHaveTextContent("Make a net of a cube on the grid.");
    expect(canvas.getByRole("grid", { name: "Grid for the net: Make a net of a cube on the grid." })).toBeInTheDocument();
    expect(canvas.getAllByRole("gridcell")).toHaveLength(30);
    expect(cell(canvas, 1, 1)).toHaveAccessibleName("Row 1, column 1: empty");
    expect(canvas.getByRole("slider", { name: "Fold" })).toHaveValue("0");
    expect(canvas.getByRole("application", { name: /^3D view of the folded net/ })).toBeInTheDocument();
    expect(canvas.getByRole("status")).toBeInTheDocument();
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const BuildWithTheKeyboard: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    const grid = canvas.getByRole("grid");
    grid.focus();
    await step("arrows move over the grid, Enter places a square", async () => {
      await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowDown}{Enter}");
      expect(canvas.getByRole("status")).toHaveTextContent("square placed in row 2, column 3.");
      expect(grid).toHaveAttribute("aria-activedescendant", expect.stringMatching(/-c-2-1$/));
      expect(field(await lastChange(mounted), "faces")).toEqual({ integer: 1 });
    });
    await step("a cross of six squares folds into the cube", async () => {
      await userEvent.keyboard("{ArrowDown}{ArrowLeft}{Enter}{ArrowRight}{Enter}{ArrowRight}{Enter}{ArrowRight}{Enter}{ArrowDown}{ArrowLeft}{ArrowLeft}{Enter}");
      const r = pci.getResponse();
      expect(field(r, "correct")).toEqual({ integer: 1 });
      expect(field(r, "score")).toEqual({ integer: 1 });
      expect(field(r, "maxscore")).toEqual({ integer: 1 });
      expect(field(r, "gaps")).toEqual({ integer: 0 });
      expect(JSON.parse(field(r, "net")!.string!)).toHaveLength(6);
    });
    await step("Delete takes a square away: the net opens up", async () => {
      await userEvent.keyboard("{Delete}");
      expect(canvas.getByRole("status")).toHaveTextContent("square removed.");
      expect(field(pci.getResponse(), "correct")).toEqual({ integer: 0 });
      expect(field(pci.getResponse(), "gaps")!.integer).toBeGreaterThan(0);
    });
  },
};

export const BuildWithTheMouse: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("click cells to place squares", async () => {
      await clickCells(canvas, CROSS);
      expect(cell(canvas, 3, 3)).toHaveAccessibleName("Row 3, column 3: square");
      expect(canvas.getByTestId("count")).toHaveTextContent("6 faces");
      expect(field(pci.getResponse(), "correct")).toEqual({ integer: 1 });
    });
    await step("both flaps on one side: they overlap", async () => {
      await clickCells(canvas, [[4, 3], [2, 4]]);
      const r = pci.getResponse();
      expect(field(r, "overlap")).toEqual({ integer: 1 });
      expect(field(r, "correct")).toEqual({ integer: 0 });
    });
    await step("Start again", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Start again" }));
      expect(canvas.getByRole("status")).toHaveTextContent("The grid is empty again.");
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const FoldInThreeD: Story = {
  args: { properties: { showResult: "true" } },
  play: async ({ canvasElement, step }) => {
    const { canvas } = await openPci(canvasElement);
    await clickCells(canvas, CROSS);
    const view = canvas.getByRole("application");
    await step("the slider folds the net step by step", async () => {
      const range = await slide(canvas, 40);
      expect(range).toHaveAttribute("aria-valuetext", "40% folded");
      expect(view).toHaveAccessibleName("3D view of the folded net: 40% folded.");
    });
    await step("Fold up: all the way, and the view says it closes", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Fold up" }));
      await waitFor(() => expect(canvas.getByTestId("fold-view")).toHaveAttribute("data-progress", "100"), { timeout: 3000 });
      expect(view).toHaveAccessibleName("3D view of the folded net: 100% folded. It folds into a closed cube.");
      expect(canvas.getByTestId("verdict")).toHaveTextContent("It folds into a closed cube.");
      expect(canvas.getByRole("button", { name: "Fold up" })).toBeDisabled();
    });
    await step("the view turns with the keys", async () => {
      view.focus();
      await userEvent.keyboard("{ArrowLeft}{ArrowUp}+");
      await userEvent.click(canvas.getByRole("button", { name: "Front view" }));
    });
    await step("a net with a gap says so", async () => {
      await userEvent.click(cell(canvas, 4, 3));
      expect(canvas.getByTestId("verdict")).toHaveTextContent(/^It does not close: \d+ open edges\.$/);
    });
  },
};

export const BuildABox: Story = {
  args: { properties: { puzzle: puzzle("build", { solid: "box", box: [2, 1, 1], columns: 8, rows: 5, nets: [] }), showResult: "true" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByTestId("prompt")).toHaveTextContent("Make a net of a box on the grid.");
    const long = canvas.getByRole("button", { name: "Rectangle 2 × 1" });
    const square = canvas.getByRole("button", { name: "Square" });
    // the strip: four 2 × 1 rectangles turned upright side by side, with a square at each end of the second one
    await userEvent.click(long);
    await userEvent.click(canvas.getByRole("button", { name: "Turn" }));
    expect(canvas.getByRole("button", { name: "Rectangle 1 × 2" })).toHaveAttribute("aria-pressed", "true");
    await clickCells(canvas, [[2, 1], [2, 2], [2, 3], [2, 4]]);
    expect(cell(canvas, 3, 1)).toHaveAccessibleName("Row 3, column 1: rectangle 1 by 2 (row 2, column 1)");
    await userEvent.click(square);
    await clickCells(canvas, [[1, 2], [4, 2]]);
    const r = pci.getResponse();
    expect(field(r, "correct")).toEqual({ integer: 1 });
    expect(canvas.getByTestId("verdict")).toHaveTextContent("It folds into a closed box.");
    // a piece that does not fit
    await userEvent.click(long);
    await userEvent.click(cell(canvas, 5, 8));
    expect(canvas.getByRole("status")).toHaveTextContent("That piece does not fit there.");
  },
};

export const BuildAPrism: Story = {
  args: { properties: { puzzle: puzzle("build", { solid: "prism", nets: [] }), showResult: "true" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await clickCells(canvas, [[3, 2], [3, 3], [3, 4]]);
    await userEvent.click(canvas.getByRole("button", { name: "Triangle" }));
    await userEvent.click(cell(canvas, 1, 1));
    expect(canvas.getByRole("status")).toHaveTextContent("A triangle goes against the edge of a square.");
    await clickCells(canvas, [[2, 2], [2, 4]]);
    expect(canvas.getByTestId("verdict")).toHaveTextContent("Faces end up on top of each other.");
    // move the second triangle to the other side of the strip
    await userEvent.click(cell(canvas, 2, 4));
    await userEvent.click(cell(canvas, 4, 4));
    expect(cell(canvas, 4, 4)).toHaveAccessibleName("Row 4, column 4: triangle on the top side");
    expect(field(pci.getResponse(), "correct")).toEqual({ integer: 1 });
    expect(canvas.getByTestId("verdict")).toHaveTextContent("It folds into a closed triangular prism.");
  },
};

export const OppositeFace: Story = {
  args: { properties: { puzzle: puzzle("opposite") } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.getByTestId("prompt")).toHaveTextContent("Which face ends up opposite P? Choose one face.");
    expect(canvas.getByRole("radiogroup", { name: /^Net: Which face/ })).toBeInTheDocument();
    expect(canvas.getAllByRole("radio")).toHaveLength(5);
    expect(canvas.getByRole("img", { name: "Face 1, P (the face in the question)" })).toBeInTheDocument();
    await step("click a face", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "Face 2, Q" }));
      expect(canvas.getByRole("radio", { name: "Face 2, Q" })).toHaveAttribute("aria-checked", "true");
      expect(await lastChange(mounted)).toEqual({ list: { identifier: ["f2"] } });
    });
    await step("the arrow keys move, Space chooses: one face at a time", async () => {
      canvas.getByRole("radio", { name: "Face 2, Q" }).focus();
      await userEvent.keyboard("{ArrowRight}{ArrowRight} ");
      expect(pci.getResponse()).toEqual({ list: { identifier: ["f4"] } });
      expect(canvas.getByRole("radio", { name: "Face 2, Q" })).toHaveAttribute("aria-checked", "false");
      expect(canvas.getByRole("status")).toHaveTextContent("Face 4, S chosen.");
    });
  },
};

export const AdjacentFaces: Story = {
  args: { properties: { puzzle: puzzle("adjacent") } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByTestId("prompt")).toHaveTextContent("Which faces touch orange along an edge? Choose all of them.");
    for (const name of ["Face 6, red", "Face 1, blue", "Face 3, green", "Face 5, sky blue"]) await userEvent.click(canvas.getByRole("checkbox", { name }));
    expect(pci.getResponse()).toEqual({ list: { identifier: ["f1", "f3", "f5", "f6"] } });
    await userEvent.click(canvas.getByRole("checkbox", { name: "Face 3, green" }));
    expect(canvas.getByRole("checkbox", { name: "Face 3, green" })).toHaveAttribute("aria-checked", "false");
    expect(pci.getResponse()).toEqual({ list: { identifier: ["f1", "f5", "f6"] } });
  },
};

export const CompleteTheNet: Story = {
  args: { properties: { puzzle: puzzle("complete") } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("img", { name: "The solid seen from a corner: 1 dot on top, 4 dots at the front left, 2 dots at the front right." })).toBeInTheDocument();
    await step("choose a label, then an empty face", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "4 dots" }));
      expect(canvas.getByRole("status")).toHaveTextContent("4 dots chosen: now choose an empty face.");
      await userEvent.click(canvas.getByRole("button", { name: "Face 2, empty" }));
      expect(canvas.getByRole("button", { name: "Face 2, 4 dots" })).toBeInTheDocument();
    });
    await step("or type the number on a face", async () => {
      canvas.getByRole("button", { name: "Face 3, empty" }).focus();
      await userEvent.keyboard("2");
      expect(pci.getResponse()).toEqual({ list: { identifier: ["f2-4", "f3-2"] } });
    });
    await step("Delete empties a face", async () => {
      await userEvent.keyboard("{Delete}");
      expect(pci.getResponse()).toEqual({ list: { identifier: ["f2-4"] } });
    });
  },
};

export const DoesItFold: Story = {
  args: { properties: { puzzle: puzzle("folds") } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByTestId("prompt")).toHaveTextContent("Which nets fold into a cube? Choose all of them.");
    expect(canvas.getAllByRole("checkbox")).toHaveLength(4);
    await userEvent.click(canvas.getByRole("checkbox", { name: "Net 2 folds into a cube" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "Net 1 folds into a cube" }));
    expect(pci.getResponse()).toEqual({ list: { identifier: ["n1", "n2"] } });
    await userEvent.click(canvas.getByRole("button", { name: "Fold net 3 in 3D" }));
    expect(canvas.getByRole("button", { name: "Fold net 3 in 3D" })).toHaveAttribute("aria-pressed", "true");
    await slide(canvas, 100);
    expect(canvas.getByRole("application")).toHaveAccessibleName(/^3D view of the folded net: 100% folded\. (It does not close|Faces end up)/);
  },
};

export const WithoutTheFold: Story = {
  args: { properties: { puzzle: puzzle("opposite"), showFold: "false" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    expect(canvas.queryByRole("application")).toBeNull();
    expect(canvas.queryByRole("slider")).toBeNull();
    expect(canvas.getAllByRole("radio")).toHaveLength(5);
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", puzzle: puzzle("adjacent"), showresult: "true" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByTestId("prompt")).toHaveTextContent("Welke vlakken grenzen met een ribbe aan oranje? Kies ze allemaal.");
    await userEvent.click(canvas.getByRole("checkbox", { name: "Vlak 1, blauw" }));
    expect(canvas.getByRole("status")).toHaveTextContent("Vlak 1, blauw gekozen.");
    const range = await slide(canvas, 100, "Vouwen");
    expect(range).toHaveAttribute("aria-valuetext", "100% gevouwen");
    expect(canvas.getByTestId("verdict")).toHaveTextContent("Hij vouwt tot een gesloten kubus.");
    expect(canvas.getByRole("button", { name: "Openvouwen" })).toBeEnabled();
    // the response does not depend on the language
    expect(pci.getResponse()).toEqual({ list: { identifier: ["f1"] } });
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await clickCells(first.canvas, CROSS);
    const state = first.pci.getState();
    expect(JSON.parse(state).state.faces).toHaveLength(6);
    const second = await remountPci(canvasElement, pci, { state });
    expect(cell(second.canvas, 3, 3)).toHaveAccessibleName("Row 3, column 3: square");
    expect(second.pci.getResponse()).toEqual(first.pci.getResponse());
    expect(second.changes).toHaveLength(0);
  },
};

export const BoundResponse: Story = {
  args: { properties: { puzzle: puzzle("folds") }, boundTo: { RESPONSE: { list: { identifier: ["n2", "n3"] } } } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("the bound response is checked", async () => {
      expect(canvas.getByRole("checkbox", { name: "Net 2 folds into a cube" })).toBeChecked();
      expect(canvas.getByRole("checkbox", { name: "Net 3 folds into a cube" })).toBeChecked();
      expect(pci.getResponse()).toEqual({ list: { identifier: ["n2", "n3"] } });
    });
    await step("resetResponse: nothing chosen", async () => {
      pci.resetResponse();
      await waitFor(() => expect(canvas.getByRole("checkbox", { name: "Net 2 folds into a cube" })).not.toBeChecked());
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: { status: "solution", properties: { puzzle: puzzle("opposite") }, state: JSON.stringify({ state: { faces: [], chosen: ["f2"], labels: {} }, log: [] }) },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the answer that follows from folding replaces the candidate's
    await waitFor(() => expect(canvas.getByRole("radio", { name: "Face 4, S" })).toHaveAttribute("aria-checked", "true"));
    expect(canvas.getByRole("radio", { name: "Face 2, Q" })).toHaveAttribute("aria-checked", "false");
    expect(canvas.getByRole("radio", { name: "Face 2, Q" })).toHaveAttribute("aria-disabled", "true");
    expect(pci.getResponse()).toEqual({ list: { identifier: ["f4"] } });
  },
};

export const SolutionOfABuild: Story = {
  args: { status: "solution" },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("grid")).toHaveAttribute("aria-readonly", "true");
    expect(canvas.queryByRole("button", { name: "Start again" })).toBeNull();
    expect(field(pci.getResponse(), "correct")).toEqual({ integer: 1 });
  },
};

export const SolutionFromTheDeclaration: Story = {
  args: {
    status: "solution",
    properties: { puzzle: puzzle("complete") },
    responseDeclaration: { cardinality: "multiple", baseType: "identifier", correctResponse: { value: ["f2-4", "f3-2"] } },
  },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    await waitFor(() => expect(canvas.getByRole("button", { name: "Face 2, 4 dots" })).toBeInTheDocument());
    expect(canvas.getByRole("button", { name: "Face 3, 2 dots" })).toHaveAttribute("aria-disabled", "true");
  },
};

/** Two interactions of this type on one page: each has its own net and response. */
export const TwoInstances: Story = {
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
    await userEvent.click(cell(first.canvas, 1, 1));
    await userEvent.click(cell(second.canvas, 2, 2));
    await userEvent.click(cell(second.canvas, 2, 3));
    expect(cell(first.canvas, 2, 2)).toHaveAccessibleName("Row 2, column 2: empty");
    expect(field(first.pci.getResponse(), "faces")).toEqual({ integer: 1 });
    expect(field(second.pci.getResponse(), "faces")).toEqual({ integer: 2 });
    expect(first.changes).toHaveLength(1);
    expect(second.changes).toHaveLength(2);
  },
};

// --- Authoring mode: what an authoring system shows the item author (getAuthoringInstance)

/** The authoring mode, as an authoring system shows it after "Draw the nets…". */
export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);
    const config = () => JSON.parse(instance.getProperties().puzzle!);

    await step("starts from building a cube net; that is ready", async () => {
      expect(canvas.getByRole("radio", { name: /^Build a net/ })).toBeChecked();
      expect(instance.validate!()).toEqual([]);
      expect(canvas.getByTestId("summary")).toHaveTextContent("Everything is ready.");
    });

    await step("the question type: opposite face, with its example", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: /^Opposite face/ }));
      expect(config().mode).toBe("opposite");
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("the net: draw and label the faces", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Net" }));
      await userEvent.click(canvas.getByRole("button", { name: "Standard net" }));
      expect(config().nets[0]).toHaveLength(6);
      const label = canvas.getByRole("textbox", { name: "Label of face 1" }) as HTMLInputElement;
      label.value = "Z";
      label.dispatchEvent(new Event("input", { bubbles: true }));
      expect(config().nets[0][0].label).toBe("Z");
      expect(instance.validate!()).toEqual(["Choose the face the question is about."]);
    });

    await step("the answer: the face asked about; the answer follows from folding", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Answer" }));
      await userEvent.selectOptions(canvas.getByTestId("ask"), "f1");
      expect(config().ask).toBe("f1");
      expect(canvas.getByTestId("correct")).toHaveTextContent("f6");
      expect(instance.validate!()).toEqual([]);
    });

    await step("a net that does not close is a problem", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Net" }));
      await userEvent.click(canvas.getByRole("gridcell", { name: /^Row 3, column 2:/ }));
      expect(instance.validate!()).toContain("The net does not fold into the solid.");
    });
  },
};

export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { puzzle: JSON.stringify({ ...EXAMPLES.complete, blanks: ["f2", "f3", "f6"] }) } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(instance.validate!()).toEqual(["Meer dan één invulling past bij het lichaam: laat andere vlakken zien, of laat minder vlakken leeg."]);
    await userEvent.click(canvas.getByRole("tab", { name: "Antwoord" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "Vlak 6, 6 stippen" }));
    expect(instance.validate!()).toEqual([]);
    expect(canvas.getByTestId("correct")).toHaveTextContent("f2-4 f3-2");
  },
};
