import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { afterPaint, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Circuit builder",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Canvas = MountedPci["canvas"];
type Record = { record: { name: string; base: { integer?: number; string?: string } | null }[] } | undefined;

/** A field of the record response. */
const field = (response: unknown, name: string) => (response as Record)?.record.find((f) => f.name === name)?.base;
/** The cell in row and column (1-based), as a screen reader names it. */
const cell = (canvas: Canvas, row: number, column: number) => canvas.getByRole("gridcell", { name: new RegExp(`^Row ${row}, column ${column}:`) });
const part = (canvas: Canvas, row: number, column: number) => cell(canvas, row, column).getAttribute("data-part");

/**
 * Drags from one element to another with pointer events, as a mouse or a finger does (user-event has no drag that
 * moves over the page with coordinates).
 */
const drag = async (from: Element, to: Element) => {
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const at = (r: DOMRect, dx = 0) => ({ clientX: r.left + r.width / 2 + dx, clientY: r.top + r.height / 2, bubbles: true, composed: true, pointerId: 1, button: 0, isPrimary: true });
  from.dispatchEvent(new PointerEvent("pointerdown", at(a)));
  from.dispatchEvent(new PointerEvent("pointermove", at(a, 20)));
  to.dispatchEvent(new PointerEvent("pointermove", at(b)));
  to.dispatchEvent(new PointerEvent("pointerup", at(b)));
  await afterPaint();
};

/** The example's solution without the buzzer and its two wires: the candidate is nearly done. */
const NEARLY = [
  { type: "wire", x: 1, y: 1, rotation: 90 }, { type: "wire", x: 1, y: 3, rotation: 90 }, { type: "switch", x: 3, y: 0, rotation: 0 },
  { type: "tee", x: 4, y: 0, rotation: 180 }, { type: "corner", x: 5, y: 0, rotation: 270 }, { type: "led", x: 4, y: 2, rotation: 90 },
  { type: "wire", x: 4, y: 1, rotation: 90 }, { type: "wire", x: 4, y: 3, rotation: 90 }, { type: "wire", x: 3, y: 4, rotation: 0 },
  { type: "tee", x: 4, y: 4, rotation: 0 }, { type: "corner", x: 5, y: 4, rotation: 0 },
];
const boardResponse = (parts: unknown[]) => ({ record: [{ name: "board", base: { string: JSON.stringify({ parts }) } }] });
const TOPOLOGY = "buzzer(1-2) dcSource(1>3) led(2>1) switch(2-3)";

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText(/^Complete the circuit diagram/)).toBeInTheDocument();
    expect(canvas.getByRole("grid", { name: /^Circuit board: Complete the circuit/ })).toBeInTheDocument();
    expect(canvas.getAllByRole("gridcell")).toHaveLength(35);
    // the preset: a DC source with wires, locked
    expect(cell(canvas, 3, 2)).toHaveAccessibleName("Row 3, column 2: DC source, turned 90°, locked, 2 open ends");
    expect(cell(canvas, 3, 2)).toHaveAttribute("aria-readonly", "true");
    expect(canvas.getByText("6 open ends")).toBeInTheDocument();
    // the palette, with how many are left
    expect(canvas.getByRole("button", { name: "Switch, 1 left" })).toBeEnabled();
    expect(canvas.getByRole("button", { name: "Wire" })).toBeEnabled();
    // the lamp tool is off by default; the test materials are not in the palette
    expect(canvas.queryByRole("button", { name: "Break lamp" })).toBeNull();
    expect(canvas.queryByRole("button", { name: /^Aluminium foil/ })).toBeNull();
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const PlaceWithTheMouse: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("drag a switch from the palette onto the board", async () => {
      await drag(canvas.getByRole("button", { name: "Switch, 1 left" }), cell(canvas, 1, 4));
      expect(part(canvas, 1, 4)).toBe("switch@0");
      expect(canvas.getByRole("status")).toHaveTextContent("Switch placed in row 1, column 4.");
      expect(canvas.getByRole("button", { name: "Switch, none left" })).toBeDisabled();
      expect(field(await lastChange(mounted), "board")?.string).toContain('"switch"');
    });

    await step("choose the LED, then a cell; rotate it with the button", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "LED, 1 left" }));
      expect(canvas.getByRole("button", { name: "LED, 1 left" })).toHaveAttribute("aria-pressed", "true");
      await userEvent.click(cell(canvas, 3, 5));
      expect(part(canvas, 3, 5)).toBe("led@0");
      await userEvent.click(canvas.getByRole("button", { name: "Rotate" }));
      expect(part(canvas, 3, 5)).toBe("led@90");
    });

    await step("a double click rotates", async () => {
      await userEvent.dblClick(cell(canvas, 1, 4));
      expect(part(canvas, 1, 4)).toBe("switch@90");
    });

    await step("drag a part to move it; drag it off the board to remove it", async () => {
      await drag(cell(canvas, 3, 5), cell(canvas, 3, 6));
      expect(part(canvas, 3, 6)).toBe("led@90");
      expect(part(canvas, 3, 5)).toBeNull();
      await drag(cell(canvas, 3, 6), canvas.getByText(/^Complete the circuit diagram/));
      expect(part(canvas, 3, 6)).toBeNull();
      expect(canvas.getByRole("status")).toHaveTextContent("LED removed.");
    });

    await step("undo brings it back; a locked part does not move", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Undo" }));
      expect(part(canvas, 3, 6)).toBe("led@90");
      await drag(cell(canvas, 3, 2), cell(canvas, 3, 1));
      expect(part(canvas, 3, 2)).toBe("dcSource@90");
      expect(part(canvas, 3, 1)).toBeNull();
    });

    await step("delete with the button, start again", async () => {
      await userEvent.click(cell(canvas, 3, 6));
      await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
      expect(part(canvas, 3, 6)).toBeNull();
      await userEvent.click(canvas.getByRole("button", { name: "Start again" }));
      expect(part(canvas, 1, 4)).toBeNull();
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas } = await openPci(canvasElement);
    const grid = canvas.getByRole("grid");

    await step("choose a part, go to a cell with the arrow keys, Enter places it", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Lamp, 1 left" }));
      grid.focus();
      expect(grid).toHaveAttribute("aria-activedescendant", "board-cell-0-0");
      await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{ArrowDown}{Enter}");
      expect(grid).toHaveAttribute("aria-activedescendant", "board-cell-3-1");
      expect(part(canvas, 2, 4)).toBe("lamp@0");
      expect(canvas.getByRole("status")).toHaveTextContent("Lamp placed in row 2, column 4.");
    });

    await step("R rotates, Shift + arrow moves, Delete removes, Ctrl+Z undoes", async () => {
      await userEvent.keyboard("r");
      expect(cell(canvas, 2, 4)).toHaveAccessibleName("Row 2, column 4: Lamp, turned 90°, 2 open ends");
      await userEvent.keyboard("{Shift>}{ArrowRight}{/Shift}");
      expect(part(canvas, 2, 5)).toBe("lamp@90");
      expect(part(canvas, 2, 4)).toBeNull();
      await userEvent.keyboard("{Delete}");
      expect(part(canvas, 2, 5)).toBeNull();
      await userEvent.keyboard("{Control>}z{/Control}");
      expect(part(canvas, 2, 5)).toBe("lamp@90");
    });

    await step("a locked part stays", async () => {
      await userEvent.click(cell(canvas, 3, 2));
      await userEvent.keyboard("{Delete}r");
      expect(part(canvas, 3, 2)).toBe("dcSource@90");
      expect(canvas.getByRole("status")).toHaveTextContent("This part is part of the question: you cannot change it.");
    });

    await step("help", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Help" }));
      expect(canvas.getByText(/the arrow keys move over the board/)).toBeInTheDocument();
    });
  },
};

export const Scoring: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("nearly done: the buzzer and two wires are missing", async () => {
      pci.setResponse(boardResponse(NEARLY));
      await waitFor(() => expect(part(canvas, 3, 5)).toBe("led@90"));
      const r = pci.getResponse();
      // contains the parts ✗, switch in series ✓, LED ∥ buzzer ✗, LED forward ✓, closed ✗
      expect([1, 2, 3, 4, 5].map((i) => field(r, `check${i}`)?.integer)).toEqual([0, 1, 0, 1, 0]);
      expect(field(r, "score")).toEqual({ integer: 2 });
      expect(field(r, "maxscore")).toEqual({ integer: 5 });
      expect(canvas.getByText("2 open ends")).toBeInTheDocument();
    });

    await step("the buzzer and the wires complete it", async () => {
      const grid = canvas.getByRole("grid");
      await userEvent.click(canvas.getByRole("button", { name: "Wire" }));
      await userEvent.click(cell(canvas, 2, 6));
      await userEvent.click(cell(canvas, 4, 6));
      await userEvent.keyboard("r");
      await userEvent.click(cell(canvas, 2, 6));
      await userEvent.keyboard("r");
      await userEvent.click(canvas.getByRole("button", { name: "Buzzer, 1 left" }));
      grid.focus();
      await userEvent.keyboard("{ArrowDown}{Enter}r");
      expect(part(canvas, 3, 6)).toBe("buzzer@90");
      expect(canvas.queryByText(/open ends?$/)).toBeNull();
      const r = await lastChange(mounted);
      expect(field(r, "score")).toEqual({ integer: 5 });
      expect(field(r, "correct")).toEqual({ integer: 1 });
      expect(field(r, "topology")).toEqual({ string: TOPOLOGY });
      expect(JSON.parse(field(r, "board")!.string!).parts).toHaveLength(19);
    });

    await step("the LED the wrong way round: only the polarity check fails", async () => {
      await userEvent.click(cell(canvas, 3, 5));
      await userEvent.keyboard("rr");
      const r = pci.getResponse();
      expect(field(r, "check4")).toEqual({ integer: 0 });
      expect(field(r, "score")).toEqual({ integer: 4 });
      expect(field(r, "correct")).toEqual({ integer: 0 });
    });
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", prompt: "Maak de schakeling af." } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("gridcell", { name: "Rij 3, kolom 2: Gelijkspanningsbron, 90° gedraaid, vast, 2 losse einden" })).toHaveAttribute("aria-readonly", "true");
    expect(canvas.getByText("6 losse einden")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Zoemer, nog 1" }));
    expect(canvas.getByRole("status")).toHaveTextContent("Zoemer gekozen");
    await userEvent.click(canvas.getByRole("gridcell", { name: /^Rij 1, kolom 5:/ }));
    expect(canvas.getByRole("status")).toHaveTextContent("Zoemer geplaatst in rij 1, kolom 5.");
    expect(canvas.getByRole("button", { name: "Draaien" })).toBeEnabled();
    // the response does not depend on the language
    expect(field(pci.getResponse(), "board")?.string).toContain('"buzzer"');
  },
};

/** The preset in the original exam interaction's format, limits in the palette, two checks, the current shown. */
const ownCircuit = JSON.stringify({
  columns: 4, rows: 3,
  preset: [{ gridx: 0, gridy: 1, id: "gelijkspanningsbron", rotation: 90 }],
  palette: "lamp:1 wire corner",
  checks: [{ type: "parts", count: { lamp: 1 } }, { type: "closed", points: 2 }],
});
const loop = [
  { type: "corner", x: 0, y: 0, rotation: 180 }, { type: "wire", x: 1, y: 0 }, { type: "corner", x: 2, y: 0, rotation: 270 },
  { type: "lamp", x: 2, y: 1, rotation: 90 }, { type: "corner", x: 0, y: 2, rotation: 90 }, { type: "wire", x: 1, y: 2 }, { type: "corner", x: 2, y: 2, rotation: 0 },
];

export const OwnCircuit: Story = {
  args: { properties: { circuit: ownCircuit, prompt: "Make the lamp burn.", showcurrent: "true", showopenends: "false" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getAllByRole("gridcell")).toHaveLength(12);
    expect(cell(canvas, 2, 1)).toHaveAccessibleName("Row 2, column 1: DC source, turned 90°, locked");
    expect(canvas.queryByText(/open ends/)).toBeNull();
    expect(canvas.queryByRole("button", { name: /^Switch/ })).toBeNull();
    await drag(canvas.getByRole("button", { name: "Lamp, 1 left" }), cell(canvas, 1, 4));
    expect(part(canvas, 1, 4)).toBe("lamp@0");
    expect(canvas.getByRole("button", { name: "Lamp, none left" })).toBeDisabled();
    pci.setResponse(boardResponse(loop));
    await waitFor(() => expect(canvas.getByText("Closed circuit")).toBeInTheDocument());
    const r = pci.getResponse();
    expect(field(r, "score")).toEqual({ integer: 3 });
    expect(field(r, "maxscore")).toEqual({ integer: 3 });
    expect(field(r, "topology")).toEqual({ string: "dcSource(1>2) lamp(1-2)" });
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.click(first.canvas.getByRole("button", { name: "LED, 1 left" }));
    await userEvent.click(cell(first.canvas, 3, 5));
    await userEvent.keyboard("r");
    const state = first.pci.getState();
    expect(JSON.parse(state).state).toEqual({ parts: [{ type: "led", x: 4, y: 2, rotation: 90 }] });

    const second = await remountPci(canvasElement, pci, { state });
    expect(part(second.canvas, 3, 5)).toBe("led@90");
    expect(second.pci.getResponse()).toEqual(first.pci.getResponse());
    expect(second.changes).toHaveLength(0);
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: boardResponse(NEARLY) } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("the bound response is on the board", async () => {
      await waitFor(() => expect(part(canvas, 3, 5)).toBe("led@90"));
      expect(field(pci.getResponse(), "score")).toEqual({ integer: 2 });
    });
    await step("resetResponse: the board as the item starts", async () => {
      pci.resetResponse();
      await waitFor(() => expect(part(canvas, 3, 5)).toBeNull());
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: { status: "solution", state: JSON.stringify({ state: { parts: [{ type: "lamp", x: 3, y: 2, rotation: 0 }] }, log: [] }) },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the author's solution replaces the candidate's work; nothing to change
    await waitFor(() => expect(part(canvas, 3, 6)).toBe("buzzer@90"));
    expect(part(canvas, 3, 4)).toBeNull();
    expect(canvas.queryByRole("button", { name: /^LED/ })).toBeNull();
    expect(canvas.getByRole("grid")).toHaveAttribute("aria-readonly", "true");
    expect(field(pci.getResponse(), "correct")).toEqual({ integer: 1 });
  },
};

export const SolutionFromTheDeclaration: Story = {
  args: {
    status: "solution",
    responseDeclaration: { cardinality: "record", correctResponse: { value: [{ fieldIdentifier: "board", value: JSON.stringify({ parts: NEARLY }) }] } },
  },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    await waitFor(() => expect(part(canvas, 3, 5)).toBe("led@90"));
    expect(part(canvas, 3, 6)).toBeNull();
  },
};

/** Two interactions of this type on one page: each has its own board and response. */
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
    await userEvent.click(first.canvas.getByRole("button", { name: "Lamp, 1 left" }));
    await userEvent.click(cell(first.canvas, 1, 5));
    await userEvent.click(second.canvas.getByRole("button", { name: "Resistor, 1 left" }));
    await userEvent.click(cell(second.canvas, 2, 5));
    expect(part(first.canvas, 1, 5)).toBe("lamp@0");
    expect(part(first.canvas, 2, 5)).toBeNull();
    expect(part(second.canvas, 2, 5)).toBe("resistor@0");
    expect(field(first.pci.getResponse(), "topology")?.string).toContain("lamp");
    expect(field(second.pci.getResponse(), "topology")?.string).not.toContain("lamp");
    expect(first.changes).toHaveLength(1);
    expect(second.changes).toHaveLength(1);
  },
};

// --- Test materials (inspired by the DEPP Circuit PCI): which materials conduct?

/** A board as text, every part locked: a token per cell, "." empty, type@rotation (c corner, - wire, t tee, V DC source, L lamp). */
const lockedBoard = (text: string) => {
  const short: { [k: string]: string } = { c: "corner", "-": "wire", t: "tee", V: "dcSource", L: "lamp" };
  return text.trim().split("\n").flatMap((line, y) => line.trim().split(/\s+/).flatMap((token, x) => {
    if (token === ".") return [];
    const [name, rotation = "0"] = token.split("@");
    return [{ type: short[name] ?? name, x, y, rotation: Number(rotation), locked: true }];
  }));
};

/** A loop with a lamp and a gap in the top wire: the candidate puts a material in the gap. */
const materialsCircuit = JSON.stringify({
  columns: 4, rows: 3,
  preset: lockedBoard(`
c@180 -    .    c@270
V@90  .    .    L@90
c@90  -    -    c@0`),
  palette: "aluminiumFoil:1 copper:1 ironNail:1 graphite:1 cotton:1 wood:1 plastic:1 glass:1 rubber:1",
  checks: [
    { type: "lit", parts: ["lamp"], material: "aluminiumFoil" },
    { type: "lit", parts: ["lamp"], material: "cotton", off: true },
  ],
});

export const TestMaterials: Story = {
  args: { properties: { circuit: materialsCircuit, prompt: "Which materials conduct? Put a material between the clips.", showCurrent: "true" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    const lamp = () => cell(canvas, 2, 4);

    await step("the materials in the palette", async () => {
      for (const name of ["Aluminium foil", "Copper", "Iron nail", "Pencil lead (graphite)", "Cotton", "Wood", "Plastic", "Glass", "Rubber"]) {
        expect(canvas.getByRole("button", { name: `${name}, 1 left` })).toBeEnabled();
      }
      expect(lamp()).toHaveAccessibleName("Row 2, column 4: Lamp, turned 90°, locked");
    });

    await step("cotton: the lamp stays off", async () => {
      // a small board under a wider toolbar: the drop lands on the right cell
      await drag(canvas.getByRole("button", { name: "Cotton, 1 left" }), cell(canvas, 1, 3));
      expect(part(canvas, 1, 3)).toBe("cotton@0");
      expect(lamp()).toHaveAccessibleName("Row 2, column 4: Lamp, turned 90°, locked");
      expect(canvas.queryByText("Closed circuit")).toBeNull();
      const r = await lastChange(mounted);
      expect([field(r, "check1")?.integer, field(r, "check2")?.integer]).toEqual([0, 1]);
      expect(field(r, "topology")).toEqual({ string: "cotton(1-2) dcSource(3>1) lamp(2-3)" });
    });

    await step("aluminium foil in its place: the lamp lights", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Aluminium foil, 1 left" }));
      await userEvent.click(cell(canvas, 1, 3));
      expect(part(canvas, 1, 3)).toBe("cotton@0"); // a cell with a part: choose it, nothing placed
      await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
      await userEvent.click(cell(canvas, 1, 3));
      expect(part(canvas, 1, 3)).toBe("aluminiumFoil@0");
      expect(lamp()).toHaveAccessibleName("Row 2, column 4: Lamp, turned 90°, locked, lit");
      expect(canvas.getByText("Closed circuit")).toBeInTheDocument();
      const r = pci.getResponse();
      expect([field(r, "check1")?.integer, field(r, "check2")?.integer]).toEqual([1, 0]);
      expect(field(r, "score")).toEqual({ integer: 1 });
    });
  },
};

export const TestMaterialsDutch: Story = {
  args: { properties: { circuit: materialsCircuit, prompt: "Welke materialen geleiden?", showCurrent: "true", language: "nl" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    for (const name of ["Aluminiumfolie", "Koper", "IJzeren spijker", "Potloodstift (grafiet)", "Katoen", "Hout", "Plastic", "Glas", "Rubber"]) {
      expect(canvas.getByRole("button", { name: `${name}, nog 1` })).toBeEnabled();
    }
    await userEvent.click(canvas.getByRole("button", { name: "Potloodstift (grafiet), nog 1" }));
    await userEvent.click(canvas.getByRole("gridcell", { name: /^Rij 1, kolom 3:/ }));
    expect(canvas.getByRole("gridcell", { name: /^Rij 2, kolom 4:/ })).toHaveAccessibleName("Rij 2, kolom 4: Lampje, 90° gedraaid, vast, brandt");
    expect(canvas.getByText("Gesloten stroomkring")).toBeInTheDocument();
  },
};

// --- The lamp tool (inspired by the DEPP LampeDouble PCI): break a lamp, see what the others do

const seriesLamps = JSON.stringify({
  columns: 4, rows: 3,
  preset: lockedBoard(`
c@180 L    L    c@270
V@90  .    .    -@90
c@90  -    -    c@0`),
  palette: "wire",
  checks: [{ type: "lit", parts: ["lamp"], broken: true, off: true }, { type: "closed" }],
});
const parallelLamps = JSON.stringify({
  columns: 4, rows: 3,
  preset: lockedBoard(`
c@180 -    t@180 c@270
V@90  .    L@90  L@90
c@90  -    t@0   c@0`),
  palette: "wire",
  checks: [{ type: "lit", parts: ["lamp"], broken: true }],
});
const lampProperties = (circuit: string, extra: Record<string, string> = {}) =>
  ({ circuit, prompt: "Break a lamp. What happens to the other lamp?", showCurrent: "true", lampTool: "true", ...extra });

export const BreakALampInSeries: Story = {
  args: { properties: lampProperties(seriesLamps) },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    const breakButton = () => canvas.getByTestId("break-lamp");

    await step("both lamps burn; the tool needs a lamp", async () => {
      expect(cell(canvas, 1, 2)).toHaveAccessibleName("Row 1, column 2: Lamp, locked, lit");
      expect(cell(canvas, 1, 3)).toHaveAccessibleName("Row 1, column 3: Lamp, locked, lit");
      expect(breakButton()).toBeDisabled();
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("break the first lamp: the second goes out too", async () => {
      await userEvent.click(cell(canvas, 1, 2));
      await userEvent.click(canvas.getByRole("button", { name: "Break lamp" }));
      expect(canvas.getByRole("status")).toHaveTextContent("Lamp in row 1, column 2 is broken: no current goes through it.");
      expect(cell(canvas, 1, 2)).toHaveAccessibleName("Row 1, column 2: Lamp, locked, broken");
      expect(cell(canvas, 1, 2)).toHaveAttribute("data-broken", "true");
      expect(cell(canvas, 1, 3)).toHaveAccessibleName("Row 1, column 3: Lamp, locked");
      expect(canvas.queryByText("Closed circuit")).toBeNull();
      const r = await lastChange(mounted);
      // the other lamp off with one broken ✓; closed (as built: a broken lamp counts as whole) ✓
      expect([field(r, "check1")?.integer, field(r, "check2")?.integer]).toEqual([1, 1]);
      expect(JSON.parse(field(r, "board")!.string!).parts).toContainEqual({ type: "lamp", x: 1, y: 0, rotation: 0, locked: true, broken: true });
    });

    await step("the state keeps the broken lamp", async () => {
      const state = pci.getState();
      expect(JSON.parse(state).state.broken).toEqual(["1,0"]);
      const second = await remountPci(canvasElement, pci, { state, properties: lampProperties(seriesLamps) });
      expect(cell(second.canvas, 1, 2)).toHaveAccessibleName("Row 1, column 2: Lamp, locked, broken");
      expect(second.pci.getResponse()).toEqual(pci.getResponse());

      await step("repair it with the keyboard (B)", async () => {
        await userEvent.click(cell(second.canvas, 1, 2));
        await userEvent.keyboard("b");
        expect(second.canvas.getByRole("status")).toHaveTextContent("Lamp in row 1, column 2 works again.");
        expect(cell(second.canvas, 1, 3)).toHaveAccessibleName("Row 1, column 3: Lamp, locked, lit");
        expect(second.pci.getResponse()).toBeUndefined();
      });
    });
  },
};

export const BreakALampInParallelDutch: Story = {
  args: { properties: lampProperties(parallelLamps, { language: "nl", prompt: "Maak een lampje kapot." }) },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const ncell = (row: number, column: number) => canvas.getByRole("gridcell", { name: new RegExp(`^Rij ${row}, kolom ${column}:`) });
    await userEvent.click(ncell(2, 3));
    await userEvent.click(canvas.getByRole("button", { name: "Lampje kapot" }));
    expect(ncell(2, 3)).toHaveAccessibleName("Rij 2, kolom 3: Lampje, 90° gedraaid, vast, kapot");
    expect(ncell(2, 4)).toHaveAccessibleName("Rij 2, kolom 4: Lampje, 90° gedraaid, vast, brandt");
    expect(canvas.getByText("Gesloten stroomkring")).toBeInTheDocument();
    expect(field(pci.getResponse(), "check1")).toEqual({ integer: 1 });
    expect(canvas.getByRole("button", { name: "Lampje heel maken" })).toBeEnabled();
  },
};

/** Review: the broken lamp of the declared correct response shows; the tool is not there. */
export const BrokenLampInReview: Story = {
  args: {
    status: "solution",
    properties: lampProperties(parallelLamps),
    responseDeclaration: { cardinality: "record", correctResponse: { value: [{ fieldIdentifier: "board", value: JSON.stringify({ parts: [{ type: "lamp", x: 3, y: 1, rotation: 90, broken: true }] }) }] } },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await waitFor(() => expect(cell(canvas, 2, 4)).toHaveAttribute("data-broken", "true"));
    expect(cell(canvas, 2, 3)).toHaveAccessibleName("Row 2, column 3: Lamp, turned 90°, locked, lit");
    expect(canvas.queryByTestId("break-lamp")).toBeNull();
    expect(field(pci.getResponse(), "correct")).toEqual({ integer: 1 });
  },
};

// --- Authoring mode: what an authoring system shows the item author (getAuthoringInstance)

/** The authoring mode, as an authoring system shows it after "Build the circuit…". */
export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);
    const circuit = () => JSON.parse(instance.getProperties().circuit!);

    await step("starts from the example; its solution scores 5 of 5", async () => {
      expect(canvas.getByTestId("summary")).toHaveTextContent("The solution scores 5 of 5.");
      expect(instance.validate!()).toEqual([]);
      expect(circuit().preset).toHaveLength(5);
    });

    await step("a part placed on the board is locked; the author can unlock it", async () => {
      await drag(canvas.getByRole("button", { name: "Lamp" }), cell(canvas, 3, 7));
      expect(circuit().preset).toContainEqual({ type: "lamp", x: 6, y: 2, rotation: 0, locked: true });
      await userEvent.click(cell(canvas, 3, 7));
      await userEvent.click(canvas.getByRole("checkbox", { name: /^Locked/ }));
      expect(circuit().preset).toContainEqual({ type: "lamp", x: 6, y: 2, rotation: 0 });
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("the solution the wrong way round is a problem", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Solution" }));
      await userEvent.click(cell(canvas, 3, 5));
      await userEvent.keyboard("rr");
      expect(instance.validate!()).toEqual(["The solution does not pass check 4."]);
      await userEvent.keyboard("rr");
      expect(instance.validate!()).toEqual([]);
    });

    await step("the palette: a number per part, or as many as the candidate likes", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Palette" }));
      await userEvent.click(canvas.getByRole("checkbox", { name: "In the palette: Diode" }));
      await userEvent.type(canvas.getByRole("spinbutton", { name: "How many: Diode" }), "2");
      expect(circuit().palette).toContain("diode:2");
      await userEvent.click(canvas.getByRole("button", { name: "Wires only" }));
      expect(instance.validate!()).toContain("The solution uses LED, which is not in the palette.");
      await userEvent.click(canvas.getByRole("button", { name: "All parts" }));
    });

    await step("the checks: add one that compares with the solution", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Checks" }));
      await userEvent.click(canvas.getByRole("button", { name: "+ Add a check" }));
      await userEvent.selectOptions(canvas.getByTestId("check-5-type"), "Same circuit as the solution");
      expect(circuit().checks[5]).toEqual({ type: "solution", points: 1 });
      expect(canvas.getByTestId("topology")).toHaveTextContent(TOPOLOGY);
      expect(canvas.getByTestId("summary")).toHaveTextContent("The solution scores 6 of 6.");
    });
  },
};

/** The checks tab: a "has current" check with a test material. */
export const AuthoringLitCheck: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { circuit: materialsCircuit } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    const circuit = () => JSON.parse(instance.getProperties().circuit!);
    await userEvent.click(canvas.getByRole("tab", { name: "Checks" }));
    expect(canvas.getByTestId("check-0-material")).toHaveValue("aluminiumFoil");
    expect(canvas.getByTestId("check-1-off")).toBeChecked();
    await userEvent.click(canvas.getByRole("button", { name: "+ Add a check" }));
    await userEvent.selectOptions(canvas.getByTestId("check-2-type"), "Has current (lamp lit)");
    await userEvent.selectOptions(canvas.getByTestId("check-2-material"), "Copper");
    await userEvent.click(canvas.getByTestId("check-2-broken"));
    expect(circuit().checks[2]).toEqual({ type: "lit", parts: ["lamp"], material: "copper", broken: true, points: 1 });
    await userEvent.click(canvas.getByRole("tab", { name: "Palette" }));
    expect(canvas.getByRole("checkbox", { name: "In the palette: Glass" })).toBeChecked();
  },
};
