import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { afterPaint, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Flowchart",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Canvas = MountedPci["canvas"];
type Rec = { record: { name: string; base: { integer?: number; string?: string } | null }[] } | undefined;

const field = (response: unknown, name: string) => (response as Rec)?.record.find((f) => f.name === name)?.base;
const graph = (response: unknown) => (response as { base?: { string?: string } })?.base?.string;
/** The cell in row and column (1-based), as a screen reader names it. */
const cell = (canvas: Canvas, row: number, column: number) => canvas.getByRole("gridcell", { name: new RegExp(`^(Row|Rij) ${row}, (column|kolom) ${column}:`) });
const fill = (canvas: Canvas, row: number, column: number) => cell(canvas, row, column).getAttribute("data-fill");

/** Drags with pointer events, as a mouse or a finger does. */
const drag = async (from: Element, to: Element) => {
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const at = (r: DOMRect, dx = 0) => ({ clientX: r.left + r.width / 2 + dx, clientY: r.top + r.height / 2, bubbles: true, composed: true, pointerId: 1, button: 0, isPrimary: true });
  from.dispatchEvent(new PointerEvent("pointerdown", at(a)));
  from.dispatchEvent(new PointerEvent("pointermove", at(a, 20)));
  to.dispatchEvent(new PointerEvent("pointermove", at(b)));
  to.dispatchEvent(new PointerEvent("pointerup", at(b)));
  await afterPaint();
};

const SOLUTION = "c1,c2,c3,care,contact,end,start|c1>contact;c2>care;c3>end;care>c3;contact>c2:yes;contact>care:no;start>c1";
const WRONG = "c1,c2,c3,care,contact,end,start|c1>care;c2>contact;c3>end;care>c3;contact>c1:yes;contact>care:no;start>c2";
const ORDER = JSON.stringify({ mode: "order", rows: 4, cards: ["Measure and mark the wood", "Saw the parts", "Sand the edges", "Glue and nail the parts", "Paint the birdhouse"] });
const FREE = JSON.stringify({
  mode: "free", text: "both", columns: 3, rows: 5,
  cards: [{ id: "k1", text: "Fill the kettle" }, { id: "k2", text: "Water boiling?", shape: "decision" }, { id: "k3", text: "Wait a minute" }, { id: "k4", text: "Pour the water on the tea" }],
  chart: { nodes: [{ id: "start", shape: "start", x: 0, y: 0, text: "Start" }, { id: "end", shape: "end", x: 0, y: 4, text: "End" }], edges: [] },
  checks: [{ type: "startEnd" }, { type: "deadEnds" }, { type: "decisions" }, { type: "before", a: "k1", b: "k4" }, { type: "branch", decision: "k2", label: "no", target: "k3" }],
});

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText(/^Complete the hand hygiene procedure/)).toBeInTheDocument();
    expect(canvas.getByRole("grid", { name: /^Flowchart: Complete the hand hygiene/ })).toBeInTheDocument();
    expect(cell(canvas, 3, 1)).toHaveAccessibleName(/^Row 3, column 1: Decision: Contact with body fluids possible\?; part of the question; arrows to Step: empty slot \(yes\), Give the care \(no\)/);
    expect(cell(canvas, 2, 1)).toHaveAccessibleName(/Step: empty slot; slot/);
    expect(canvas.getAllByRole("button", { name: /^(Clean|Put|Write)/ })).toHaveLength(4);
    // no arrows to draw in this task
    expect(canvas.queryByRole("combobox", { name: "Connect to…" })).toBeNull();
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const FillWithTheMouse: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await step("drag a card onto a slot", async () => {
      await drag(canvas.getByRole("button", { name: "Clean your hands with hand alcohol" }), cell(canvas, 2, 1));
      expect(fill(canvas, 2, 1)).toBe("c1");
      expect(canvas.getByRole("button", { name: "Clean your hands with hand alcohol, used" })).toBeDisabled();
      expect(canvas.getByRole("status")).toHaveTextContent("Clean your hands with hand alcohol placed in Step");
      expect(graph(await lastChange(mounted))).toContain("start>c1");
    });
    await step("choose a card, then a slot", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Put on disposable gloves" }));
      expect(canvas.getByRole("button", { name: "Put on disposable gloves" })).toHaveAttribute("aria-pressed", "true");
      await userEvent.click(cell(canvas, 4, 1));
      expect(fill(canvas, 4, 1)).toBe("c2");
    });
    await step("a locked block takes no card", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Put on your coat" }));
      await userEvent.click(cell(canvas, 5, 1));
      expect(canvas.getByRole("status")).toHaveTextContent("This block is part of the question");
      await userEvent.click(canvas.getByRole("button", { name: "Put on your coat" }));
    });
    await step("drag a card from one slot to another: they swap", async () => {
      await drag(cell(canvas, 4, 1), cell(canvas, 2, 1));
      expect(fill(canvas, 2, 1)).toBe("c2");
      expect(fill(canvas, 4, 1)).toBe("c1");
    });
    await step("drag a card off the chart; undo; start again", async () => {
      await drag(cell(canvas, 2, 1), canvas.getByText(/^Complete the hand hygiene/));
      expect(fill(canvas, 2, 1)).toBe("");
      await userEvent.click(canvas.getByRole("button", { name: "Undo" }));
      expect(fill(canvas, 2, 1)).toBe("c2");
      await userEvent.click(canvas.getByRole("button", { name: "Start again" }));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const grid = canvas.getByRole("grid");
    await step("choose a card, arrow keys to the slot, Enter", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Clean your hands with hand alcohol" }));
      grid.focus();
      expect(grid).toHaveAttribute("aria-activedescendant", "chart-cell-0-0");
      await userEvent.keyboard("{ArrowDown}{Enter}");
      expect(fill(canvas, 2, 1)).toBe("c1");
    });
    await step("Shift + arrow swaps the card with the next slot; Delete empties; Ctrl+Z undoes", async () => {
      await userEvent.keyboard("{Shift>}{ArrowDown}{/Shift}");
      expect(fill(canvas, 4, 1)).toBe("c1");
      expect(grid).toHaveAttribute("aria-activedescendant", "chart-cell-0-3");
      await userEvent.keyboard("{Delete}");
      expect(fill(canvas, 4, 1)).toBe("");
      await userEvent.keyboard("{Control>}z{/Control}");
      expect(fill(canvas, 4, 1)).toBe("c1");
    });
    await step("the panel: a card for the selected slot", async () => {
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Card" }), "Put on disposable gloves");
      expect(fill(canvas, 4, 1)).toBe("c2");
      await userEvent.click(cell(canvas, 2, 1));
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Card" }), "Clean your hands with hand alcohol");
      await userEvent.click(cell(canvas, 6, 1));
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Card" }), "Write down what you did in the care file");
      expect(graph(pci.getResponse())).toBe(SOLUTION);
    });
    await step("the flow as text", async () => {
      const outline = canvas.getByRole("region", { name: "The flow as text" });
      expect(outline).toHaveTextContent("2. Step: Clean your hands with hand alcohol");
      expect(outline).toHaveTextContent("no→ continues at 5: Step: Give the care");
    });
    await step("help", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Help" }));
      expect(canvas.getByText(/the arrow keys move over the chart/)).toBeInTheDocument();
    });
  },
};

export const PciScoring: Story = {
  args: { properties: { scoring: "pci" } },
  play: async ({ canvasElement }) => {
    const { pci } = await openPci(canvasElement);
    pci.setResponse({ base: { string: WRONG } });
    await afterPaint();
    const r = pci.getResponse();
    // c1 before the care ✗ (the no exit skips it), the yes exit to the gloves ✗ (c1 is there), the care before c3 ✓
    expect([1, 2, 3].map((i) => field(r, `check${i}`)?.integer)).toEqual([0, 0, 1]);
    expect(field(r, "score")).toEqual({ integer: 1 });
    expect(field(r, "maxscore")).toEqual({ integer: 3 });
    expect(field(r, "graph")).toEqual({ string: WRONG });
    expect(JSON.parse(field(r, "chart")!.string!).nodes).toHaveLength(7);
  },
};

export const OrderMode: Story = {
  args: { properties: { flowchart: ORDER, prompt: "Put the steps of making a birdhouse in order." } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the cards in a mixed order
    const names = canvas.getAllByRole("button").filter((b) => b.dataset.testid?.startsWith("card-")).map((b) => b.textContent);
    expect(names).not.toEqual(["✓Measure and mark the wood", "✓Saw the parts", "✓Sand the edges", "✓Glue and nail the parts", "✓Paint the birdhouse"]);
    const order: [string, number, number][] = [["Measure and mark the wood", 2, 1], ["Saw the parts", 3, 1], ["Sand the edges", 4, 1], ["Glue and nail the parts", 1, 2], ["Paint the birdhouse", 2, 2]];
    for (const [name, row, column] of order) {
      await userEvent.click(canvas.getByRole("button", { name }));
      await userEvent.click(cell(canvas, row, column));
    }
    expect(graph(pci.getResponse())).toBe("c1,c2,c3,c4,c5,end,start|c1>c2;c2>c3;c3>c4;c4>c5;c5>end;start>c1");
    // Shift + Down at the bottom of a column: the next slot is in the next column
    await userEvent.click(cell(canvas, 4, 1));
    await userEvent.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(fill(canvas, 1, 2)).toBe("c3");
    expect(fill(canvas, 4, 1)).toBe("c4");
  },
};

export const FreeBuild: Story = {
  args: { properties: { flowchart: FREE, scoring: "pci", prompt: "Make a flowchart for making tea." } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const connect = async (row: number, column: number, to: string, exit?: string) => {
      await userEvent.click(cell(canvas, row, column));
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Connect to…" }), to);
      if (exit) await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Exit" }), exit);
      await userEvent.click(canvas.getByRole("button", { name: "Add arrow" }));
    };
    await step("cards on empty cells make blocks; a decision card a diamond", async () => {
      await drag(canvas.getByRole("button", { name: "Fill the kettle" }), cell(canvas, 2, 1));
      await drag(canvas.getByRole("button", { name: "Water boiling?" }), cell(canvas, 3, 1));
      expect(cell(canvas, 3, 1)).toHaveAccessibleName(/Decision: Water boiling\?/);
      await userEvent.click(canvas.getByRole("button", { name: "Pour the water on the tea" }));
      await userEvent.click(cell(canvas, 4, 1));
    });
    await step("a block from the palette, with typed text", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Step" }));
      await userEvent.click(cell(canvas, 3, 2));
      await userEvent.click(canvas.getByRole("button", { name: "Step" }));
      await userEvent.type(canvas.getByRole("textbox", { name: "Text" }), "Wait a minute");
      expect(fill(canvas, 3, 2)).toBe('"Wait a minute"');
    });
    await step("arrows: from the handle, and with Connect to…", async () => {
      await userEvent.click(cell(canvas, 1, 1));
      await drag(canvas.getByTestId("handle"), cell(canvas, 2, 1));
      expect(canvas.getByTestId("edge-start-n1")).toBeInTheDocument();
      await connect(2, 1, "Decision: Water boiling?");
      await connect(3, 1, "Step: Wait a minute", "no");
      await connect(3, 1, "Step: Pour the water on the tea", "yes");
      await connect(4, 1, "End");
      await connect(3, 2, "Decision: Water boiling?");
    });
    await step("typed text scores as text; the card k3 makes the branch check pass", async () => {
      expect(field(pci.getResponse(), "score")).toEqual({ integer: 4 });
      await userEvent.click(cell(canvas, 3, 2));
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Card" }), "Wait a minute");
      const r = pci.getResponse();
      expect(field(r, "score")).toEqual({ integer: 5 });
      expect(field(r, "graph")).toEqual({ string: "end,k1,k2,k3,k4,start|k1>k2;k2>k3:no;k2>k4:yes;k3>k2;k4>end;start>k1" });
    });
    await step("moving and tidying up keep the graph", async () => {
      const before = field(pci.getResponse(), "graph");
      canvas.getByRole("grid").focus();
      await userEvent.keyboard("{Shift>}{ArrowRight}{/Shift}");
      expect(fill(canvas, 3, 3)).toBe("k3");
      await userEvent.click(canvas.getByRole("button", { name: "Tidy up" }));
      expect(field(pci.getResponse(), "graph")).toEqual(before);
    });
    await step("remove an arrow in the panel: a check fails", async () => {
      await userEvent.click(cell(canvas, 1, 1));
      await userEvent.click(canvas.getByRole("button", { name: "Remove the arrow to Fill the kettle" }));
      expect(field(pci.getResponse(), "correct")).toEqual({ integer: 0 });
    });
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", prompt: "Maak de handhygiëne af." } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(cell(canvas, 3, 1)).toHaveAccessibleName(/^Rij 3, kolom 1: Beslissing: Contact with body fluids possible\?; hoort bij de vraag; pijlen naar Stap: leeg vak \(ja\)/);
    await userEvent.click(canvas.getByRole("button", { name: "Put on disposable gloves" }));
    expect(canvas.getByRole("status")).toHaveTextContent("Put on disposable gloves gekozen");
    await userEvent.click(cell(canvas, 4, 1));
    expect(canvas.getByRole("status")).toHaveTextContent("geplaatst in Stap");
    expect(canvas.getByRole("button", { name: "Ongedaan maken" })).toBeEnabled();
    expect(canvas.getByTestId("edge-contact-s2")).toHaveTextContent("ja");
    // the response does not depend on the language
    expect(graph(pci.getResponse())).toContain("contact>c2:yes");
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.click(first.canvas.getByRole("button", { name: "Put on disposable gloves" }));
    await userEvent.click(cell(first.canvas, 2, 1));
    const state = first.pci.getState();
    expect(JSON.parse(state).state.chart.nodes.find((n: { id: string }) => n.id === "s1").card).toBe("c2");
    const second = await remountPci(canvasElement, pci, { state });
    expect(fill(second.canvas, 2, 1)).toBe("c2");
    expect(second.pci.getResponse()).toEqual(first.pci.getResponse());
    expect(second.changes).toHaveLength(0);
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: { base: { string: WRONG } } } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("the bound graph is on the slots", async () => {
      await waitFor(() => expect(fill(canvas, 2, 1)).toBe("c2"));
      expect(fill(canvas, 4, 1)).toBe("c1");
      expect(graph(pci.getResponse())).toBe(WRONG);
    });
    await step("resetResponse: the chart as the item starts", async () => {
      pci.resetResponse();
      await waitFor(() => expect(fill(canvas, 2, 1)).toBe(""));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: { status: "solution", state: JSON.stringify({ state: { chart: { nodes: [{ id: "s1", card: "c4" }], edges: [] } }, log: [] }) },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await waitFor(() => expect(fill(canvas, 2, 1)).toBe("c1"));
    expect(fill(canvas, 4, 1)).toBe("c2");
    expect(canvas.queryByRole("button", { name: /^Put on/ })).toBeNull();
    expect(canvas.getByRole("grid")).toHaveAttribute("aria-readonly", "true");
    expect(graph(pci.getResponse())).toBe(SOLUTION);
  },
};

export const SolutionFromTheDeclaration: Story = {
  args: { status: "solution", responseDeclaration: { baseType: "string", cardinality: "single", correctResponse: { value: WRONG } } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    await waitFor(() => expect(fill(canvas, 2, 1)).toBe("c2"));
  },
};

/** Two interactions of this type on one page: each has its own chart and response. */
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
    await userEvent.click(first.canvas.getByRole("button", { name: "Clean your hands with hand alcohol" }));
    await userEvent.click(cell(first.canvas, 2, 1));
    await userEvent.click(second.canvas.getByRole("button", { name: "Put on your coat" }));
    await userEvent.click(cell(second.canvas, 2, 1));
    expect(fill(first.canvas, 2, 1)).toBe("c1");
    expect(fill(second.canvas, 2, 1)).toBe("c4");
    expect(graph(first.pci.getResponse())).toContain("start>c1");
    expect(graph(second.pci.getResponse())).toContain("start>c4");
    expect(first.changes).toHaveLength(1);
    expect(second.changes).toHaveLength(1);
  },
};

// --- Authoring mode

export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", width: 1100 },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);
    const config = () => JSON.parse(instance.getProperties().flowchart!);

    await step("starts from the example; its solution scores 3 of 3", async () => {
      expect(canvas.getByTestId("summary")).toHaveTextContent("The solution scores 3 of 3.");
      expect(instance.validate!()).toEqual([]);
      expect(canvas.getByTestId("graph")).toHaveTextContent(SOLUTION);
    });

    await step("cards: add one, mark it a distractor", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Cards" }));
      await userEvent.click(canvas.getByRole("button", { name: "+ Add a card" }));
      await userEvent.type(canvas.getByRole("textbox", { name: "Text of card 5" }), "Wash your hands with soap");
      await userEvent.click(canvas.getByTestId("card-distractor-4"));
      expect(config().cards[4]).toEqual({ id: "c5", text: "Wash your hands with soap", distractor: true });
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("chart: a new block is part of the question; make it a slot and connect it", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Chart" }));
      await userEvent.click(canvas.getByRole("button", { name: "Step" }));
      await userEvent.click(cell(canvas, 5, 2));
      await userEvent.click(canvas.getByRole("button", { name: "Step" }));
      await userEvent.type(canvas.getByRole("textbox", { name: "Text" }), "Tidy the room");
      expect(config().chart.nodes).toContainEqual({ id: "n1", shape: "step", x: 1, y: 4, locked: true, text: "Tidy the room" });
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Kind" }), "Slot for a card");
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Connect to…" }), "End");
      await userEvent.click(canvas.getByRole("button", { name: "Add arrow" }));
      expect(config().chart.edges).toContainEqual({ from: "n1", to: "end", locked: true });
    });

    await step("solution: fill the new slot", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Solution" }));
      await userEvent.click(cell(canvas, 5, 2));
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Card" }), "Wash your hands with soap");
      expect(config().solution.nodes.find((n: { id: string }) => n.id === "n1").card).toBe("c5");
    });

    await step("checks: add a check that the yes exit leads to the gloves", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Checks" }));
      await userEvent.click(canvas.getByRole("button", { name: "+ Add a check" }));
      expect(config().checks[3]).toEqual({ type: "same", points: 1 });
      await userEvent.selectOptions(canvas.getByTestId("check-3-type"), "One start and one end");
      expect(config().checks[3]).toEqual({ type: "startEnd", points: 1 });
      expect(canvas.getByTestId("summary")).toHaveTextContent("The solution scores 4 of 4.");
    });

    await step("order mode: no chart tab, the solution is the card order", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Setup" }));
      await userEvent.click(canvas.getByRole("radio", { name: /^Put the cards in order/ }));
      expect(config().mode).toBe("order");
      expect(canvas.queryByRole("tab", { name: "Chart" })).toBeNull();
    });
  },
};

export const AuthoringDutchPciScoring: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: {
    language: "nl",
    properties: { scoring: "pci", flowchart: JSON.stringify({ mode: "complete", cards: [{ id: "a", text: "A" }], chart: { nodes: [{ id: "s", shape: "start", x: 0, y: 0 }], edges: [] }, checks: [{ type: "before", a: "a", b: "zz" }] }) },
  },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(instance.validate!()).toEqual([
      "Het schema heeft geen vakken: de kandidaat heeft niets te vullen.",
      'Check 1 gaat over "zz", maar dat is geen kaartje of blok.',
    ]);
    expect(canvas.getByRole("tab", { name: "Schema" })).toBeInTheDocument();
  },
};
