import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { afterPaint, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Load planner",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Canvas = MountedPci["canvas"];
type Rec = { record: { name: string; base: { integer?: number; float?: number; string?: string } | null }[] } | undefined;

/** A field of the record response. */
const field = (response: unknown, name: string) => (response as Rec)?.record.find((f) => f.name === name)?.base;
/** The loaded boxes of a response. */
const boxes = (response: unknown): { id: string; x: number; y: number; z: number; o: string }[] => JSON.parse(field(response, "placement")?.string ?? '{"boxes":[]}').boxes;
const boxOf = (response: unknown, id: string) => boxes(response).find((b) => b.id === id);
const boxButton = (canvas: Canvas, name: RegExp) => canvas.getByRole("button", { name });
const topView = (canvas: Canvas) => canvas.getByRole("application", { name: /^Top view|^Bovenaanzicht/ });
const sideView = (canvas: Canvas) => canvas.getByRole("application", { name: /^Side view|^Zijaanzicht/ });

/** The example's solution: everything passes. */
const SOLUTION = [
  { id: "A", x: 0, y: 0, z: 0, o: "lwh" }, { id: "B", x: 0, y: 60, z: 0, o: "lwh" }, { id: "C", x: 0, y: 150, z: 0, o: "lwh" },
  { id: "E", x: 60, y: 0, z: 0, o: "lwh" }, { id: "D", x: 180, y: 130, z: 0, o: "lwh" }, { id: "F", x: 260, y: 0, z: 0, o: "lwh" },
  { id: "G", x: 260, y: 0, z: 30, o: "lwh" }, { id: "H", x: 250, y: 120, z: 0, o: "lwh" },
];
const placementResponse = (placed: unknown[]) => ({ record: [{ name: "placement", base: { string: JSON.stringify({ boxes: placed }) } }] });

/** A click at a point of the floor in the top view (cm), as a mouse does. */
const clickFloor = async (svg: Element, x: number, y: number, width = 170) => {
  const r = svg.getBoundingClientRect();
  const viewBox = (svg as SVGSVGElement).viewBox.baseVal;
  const at = { clientX: r.left + ((x - viewBox.x) / viewBox.width) * r.width, clientY: r.top + ((width - y - viewBox.y) / viewBox.height) * r.height, bubbles: true, composed: true, pointerId: 1, button: 0, isPrimary: true };
  svg.dispatchEvent(new PointerEvent("pointerdown", at));
  svg.dispatchEvent(new PointerEvent("pointerup", at));
  await afterPaint();
};

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText(/^Load the van for the delivery round/)).toBeInTheDocument();
    expect(canvas.getAllByRole("button", { name: /not loaded$/ })).toHaveLength(8);
    expect(boxButton(canvas, /^Washing machine \(A\)/)).toHaveAccessibleName("Washing machine (A), 60 × 60 × 90 cm, 70 kg, this side up, stop 3, not loaded");
    expect(canvas.getByText("8 boxes to load")).toBeInTheDocument();
    expect(topView(canvas)).toHaveAttribute("tabindex", "0");
    expect(sideView(canvas)).toBeInTheDocument();
    expect(canvas.getByTestId("view-3d")).toBeInTheDocument();
    expect(canvas.getByRole("meter", { name: "Weight" })).toHaveAttribute("aria-valuetext", "0 of 800 kg");
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const LoadWithTheMouse: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await step("choose the tiles, click the floor in the top view", async () => {
      await userEvent.click(boxButton(canvas, /^Garden tiles/));
      expect(canvas.getByRole("status")).toHaveTextContent("Garden tiles (D) chosen: click a spot in the top view, or press Load.");
      await clickFloor(topView(canvas), 150, 80);
      expect(boxOf(await lastChange(mounted), "D")).toEqual({ id: "D", x: 120, y: 60, z: 0, o: "lwh", dx: 60, dy: 40, dz: 30 });
      expect(canvas.getByRole("status")).toHaveTextContent("Garden tiles (D) loaded at 120 cm from the front, 60 cm from the left, 0 cm up.");
      expect(canvas.getByText("7 boxes to load")).toBeInTheDocument();
    });
    await step("Load puts a box at the first free spot; books on the tiles", async () => {
      await userEvent.click(boxButton(canvas, /^Washing machine/));
      await userEvent.click(canvas.getByRole("button", { name: "Load" }));
      expect(boxOf(pci.getResponse(), "A")).toMatchObject({ x: 0, y: 0, z: 0 });
      await userEvent.click(boxButton(canvas, /^Books \(F\)/));
      await clickFloor(topView(canvas), 150, 75);
      expect(boxOf(pci.getResponse(), "F")).toMatchObject({ z: 30 });
    });
    await step("the buttons: turn, layer down, unload, undo, start again", async () => {
      await userEvent.click(canvas.getByRole("button", { name: /Turn/ }));
      expect(boxOf(pci.getResponse(), "F")?.o).toBe("wlh");
      await userEvent.click(canvas.getByRole("button", { name: /Layer down/ }));
      expect(boxOf(pci.getResponse(), "F")?.z).toBe(0);
      expect(boxOf(pci.getResponse(), "D")?.z).toBe(30);
      await userEvent.click(canvas.getByRole("button", { name: "Unload" }));
      expect(boxOf(pci.getResponse(), "F")).toBeUndefined();
      await userEvent.click(canvas.getByRole("button", { name: /Undo/ }));
      expect(boxOf(pci.getResponse(), "F")).toBeDefined();
      await userEvent.click(canvas.getByRole("button", { name: "Start again" }));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("Enter on a box in the list chooses it, Enter again loads it", async () => {
      boxButton(canvas, /^Paint/).focus();
      await userEvent.keyboard("{Enter}");
      await userEvent.keyboard("{Enter}");
      expect(boxOf(pci.getResponse(), "E")).toMatchObject({ x: 0, y: 0, z: 0, o: "lwh" });
    });
    await step("the top view: arrow keys move, R turns, T does not tip a this-side-up box", async () => {
      topView(canvas).focus();
      await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowUp}");
      expect(boxOf(pci.getResponse(), "E")).toMatchObject({ x: 20, y: 10 });
      await userEvent.keyboard("r");
      expect(boxOf(pci.getResponse(), "E")?.o).toBe("wlh");
      await userEvent.keyboard("t");
      expect(canvas.getByRole("status")).toHaveTextContent("Paint (E) must stay this side up.");
      expect(topView(canvas)).toHaveAccessibleName(/^Top view\. Paint \(E\), 40 × 60 × 40 cm, at 20 cm from the front/);
    });
    await step("books on the paint; PgDn puts them under it, PgUp back on top", async () => {
      await userEvent.click(boxButton(canvas, /^Books \(F\)/));
      await userEvent.click(canvas.getByRole("button", { name: "Load" }));
      pci.setResponse(placementResponse([{ id: "E", x: 20, y: 10, z: 0, o: "wlh" }, { id: "F", x: 20, y: 10, z: 40, o: "lwh" }]));
      await waitFor(() => expect(boxOf(pci.getResponse(), "F")?.z).toBe(40));
      await userEvent.click(boxButton(canvas, /^Books \(F\)/));
      topView(canvas).focus();
      await userEvent.keyboard("{PageDown}");
      expect(boxOf(pci.getResponse(), "F")?.z).toBe(0);
      expect(boxOf(pci.getResponse(), "E")?.z).toBe(30);
      await userEvent.keyboard("{PageUp}");
      expect(boxOf(pci.getResponse(), "F")?.z).toBe(40);
      await userEvent.keyboard("t");
      expect(boxOf(pci.getResponse(), "F")?.o).toBe("hwl");
    });
    await step("the side view: up and down are layers, Delete unloads, Ctrl+Z undoes", async () => {
      sideView(canvas).focus();
      await userEvent.keyboard("{ArrowDown}");
      expect(boxOf(pci.getResponse(), "F")?.z).toBe(0);
      await userEvent.keyboard("{Delete}");
      expect(boxOf(pci.getResponse(), "F")).toBeUndefined();
      expect(canvas.getByRole("status")).toHaveTextContent("Books (F) unloaded.");
      await userEvent.keyboard("{Control>}z{/Control}");
      expect(boxOf(pci.getResponse(), "F")).toBeDefined();
    });
  },
};

export const Scoring: Story = {
  play: async ({ canvasElement, step }) => {
    const { pci } = await openPci(canvasElement);
    await step("the solution scores 9 of 9", async () => {
      pci.setResponse(placementResponse(SOLUTION));
      await waitFor(() => expect(field(pci.getResponse(), "score")).toEqual({ integer: 9 }));
      const r = pci.getResponse();
      expect(field(r, "maxscore")).toEqual({ integer: 9 });
      expect(field(r, "correct")).toEqual({ integer: 1 });
      expect(field(r, "loaded")).toEqual({ integer: 8 });
      expect(field(r, "weight")).toEqual({ float: 366 });
      expect(field(r, "volume")).toEqual({ float: 15.3 });
    });
    await step("tiles on the lamps: fragile, unloading order and heavy at the bottom fail", async () => {
      pci.setResponse(placementResponse([...SOLUTION.filter((b) => b.id !== "D"), { id: "D", x: 250, y: 120, z: 60, o: "lwh" }]));
      await waitFor(() => expect(field(pci.getResponse(), "check4")).toEqual({ integer: 0 }));
      const r = pci.getResponse();
      // allLoaded, stable, upright, fragile, unloadOrder (2), heavyBottom, cog, axles
      expect([1, 2, 3, 4, 5, 6, 7, 8].map((i) => field(r, `check${i}`)?.integer)).toEqual([1, 1, 1, 0, 0, 0, 1, 1]);
    });
    await step("half a load scores nothing (the checks need every box)", async () => {
      pci.setResponse(placementResponse(SOLUTION.slice(0, 4)));
      await waitFor(() => expect(field(pci.getResponse(), "loaded")).toEqual({ integer: 4 }));
      expect(field(pci.getResponse(), "score")).toEqual({ integer: 0 });
    });
  },
};

export const ChecksShown: Story = {
  args: { properties: { showChecks: "true", view: "2d" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.queryByTestId("view-3d")).toBeNull();
    expect(canvas.getAllByTestId(/^check-\d+$/)).toHaveLength(8);
    pci.setResponse(placementResponse(SOLUTION));
    await waitFor(() => expect(canvas.getByTestId("check-8")).toHaveAttribute("data-passed", "true"));
    expect(canvas.getByText(/^Centre of gravity at most 40 cm/)).toBeInTheDocument();
  },
};

/** A pallet without metrics, with one check. */
const palletPlan = JSON.stringify({
  space: { kind: "pallet", length: 120, width: 80, height: 100, maxPayload: 500 },
  boxes: [{ id: "K", label: "Crate", length: 60, width: 40, height: 30, weight: 20 }, { id: "V", label: "Vase", length: 40, width: 40, height: 50, weight: 3, fragile: true, upright: true }],
  checks: [{ type: "fragile", points: 2 }, { type: "allLoaded" }],
});

export const Pallet: Story = {
  args: { properties: { plan: palletPlan, showmetrics: "false", prompt: "Stack the pallet." } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getAllByRole("button", { name: /not loaded$/ })).toHaveLength(2);
    expect(canvas.queryByTestId("metrics")).toBeNull();
    await userEvent.click(boxButton(canvas, /^Vase/));
    await userEvent.click(canvas.getByRole("button", { name: "Load" }));
    await userEvent.click(boxButton(canvas, /^Crate/));
    await clickFloor(topView(canvas), 20, 20, 80);
    expect(boxOf(pci.getResponse(), "K")?.z).toBe(50); // on the vase
    expect(field(pci.getResponse(), "score")).toEqual({ integer: 1 });
    topView(canvas).focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(boxOf(pci.getResponse(), "K")?.z).toBe(0);
    expect(field(pci.getResponse(), "score")).toEqual({ integer: 3 });
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", prompt: "Laad de bus." } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(boxButton(canvas, /^Wasmachine|^Washing machine/)).toHaveAccessibleName("Washing machine (A), 60 × 60 × 90 cm, 70 kg, deze kant boven, adres 3, niet geladen");
    await userEvent.click(boxButton(canvas, /^Books \(F\)/));
    expect(canvas.getByRole("status")).toHaveTextContent("Books (F) gekozen");
    await userEvent.click(canvas.getByRole("button", { name: "Laden" }));
    expect(canvas.getByRole("status")).toHaveTextContent("Books (F) geladen op 0 cm van de voorkant, 0 cm van links, 0 cm hoog.");
    expect(canvas.getByRole("meter", { name: "Benut volume" })).toHaveAttribute("aria-valuetext", "0,4 %");
    // the response does not depend on the language
    expect(field(pci.getResponse(), "volume")).toEqual({ float: 0.4 });
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.click(boxButton(first.canvas, /^Lamps/));
    await userEvent.click(first.canvas.getByRole("button", { name: "Load" }));
    await userEvent.click(first.canvas.getByRole("button", { name: /Turn/ }));
    const state = first.pci.getState();
    expect(JSON.parse(state).state).toEqual({ placed: [{ id: "H", x: 0, y: 0, z: 0, o: "wlh" }] });

    const second = await remountPci(canvasElement, pci, { state });
    expect(second.pci.getResponse()).toEqual(first.pci.getResponse());
    expect(second.canvas.getByRole("button", { name: /^Lamps \(H\).*, loaded$/ })).toBeInTheDocument();
    expect(second.changes).toHaveLength(0);
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: placementResponse(SOLUTION) } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("the bound response is loaded", async () => {
      await waitFor(() => expect(field(pci.getResponse(), "score")).toEqual({ integer: 9 }));
      expect(canvas.getByText("Every box is loaded.")).toBeInTheDocument();
    });
    await step("resetResponse: an empty van", async () => {
      pci.resetResponse();
      await waitFor(() => expect(pci.getResponse()).toBeUndefined());
    });
  },
};

export const Solution: Story = {
  args: { status: "solution", state: JSON.stringify({ state: { placed: [{ id: "A", x: 200, y: 0, z: 0, o: "lwh" }] }, log: [] }) },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await waitFor(() => expect(field(pci.getResponse(), "correct")).toEqual({ integer: 1 }));
    expect(boxOf(pci.getResponse(), "A")).toMatchObject({ x: 0 });
    expect(boxButton(canvas, /^Washing machine/)).toBeDisabled();
    expect(canvas.queryByRole("button", { name: "Start again" })).toBeNull();
  },
};

export const SolutionFromTheDeclaration: Story = {
  args: {
    status: "solution",
    responseDeclaration: { cardinality: "record", correctResponse: { value: [{ fieldIdentifier: "placement", value: JSON.stringify({ boxes: SOLUTION.slice(0, 2) }) }] } },
  },
  play: async ({ canvasElement }) => {
    const { pci } = await openPci(canvasElement);
    await waitFor(() => expect(field(pci.getResponse(), "loaded")).toEqual({ integer: 2 }));
  },
};

/** Two interactions of this type on one page: each has its own load and response. */
export const TwoInstances: Story = {
  render: (args) => {
    const page = document.createElement("div");
    for (const id of ["first", "second"]) {
      const slot = document.createElement("div");
      slot.dataset.slot = id;
      slot.appendChild(mountPci(pci, { ...args, properties: { view: "2d" } }));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=first]")!);
    const second = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=second]")!);
    expect(first.pci).not.toBe(second.pci);
    await userEvent.click(boxButton(first.canvas, /^Dryer/));
    await userEvent.click(first.canvas.getByRole("button", { name: "Load" }));
    await userEvent.click(boxButton(second.canvas, /^Television/));
    await userEvent.click(second.canvas.getByRole("button", { name: "Load" }));
    expect(boxes(first.pci.getResponse()).map((b) => b.id)).toEqual(["B"]);
    expect(boxes(second.pci.getResponse()).map((b) => b.id)).toEqual(["C"]);
    expect(first.changes).toHaveLength(1);
    expect(second.changes).toHaveLength(1);
  },
};

// --- Authoring mode

export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);
    const plan = () => JSON.parse(instance.getProperties().plan!);

    await step("starts from the example; its solution scores 9 of 9", async () => {
      expect(canvas.getByTestId("summary")).toHaveTextContent("The solution scores 9 of 9.");
      expect(instance.validate()).toEqual([]);
    });

    await step("the space: a smaller payload makes the axle check fail", async () => {
      const rear = canvas.getByTestId("axle-rear-max") as HTMLInputElement;
      rear.value = "200";
      rear.dispatchEvent(new Event("change", { bubbles: true }));
      await afterPaint();
      expect(plan().space.axles.maxRear).toBe(200);
      expect(instance.validate()).toEqual(["The solution does not pass check 8."]);
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("the boxes: paste a table", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Boxes" }));
      const tsv = canvas.getByTestId("tsv") as HTMLTextAreaElement;
      tsv.value = "Crate\t60\t40\t30\t12,5\tyes\t\t1\t2\nCrane\t900\t10\t10\t5";
      tsv.dispatchEvent(new Event("input", { bubbles: true }));
      await userEvent.click(canvas.getByRole("button", { name: "Replace the boxes" }));
      expect(plan().boxes.map((b: { id: string }) => b.id)).toEqual(["A", "B", "C"]);
      expect(plan().boxes[0]).toMatchObject({ label: "Crate", weight: 12.5, upright: true, stop: 1 });
      expect(instance.validate()).toContain("Crane (C) does not fit in the cargo space in any way.");
      await userEvent.click(canvas.getByRole("button", { name: "Remove: Crane" }));
      expect(plan().boxes).toHaveLength(2);
    });

    await step("the checks: add one, change the type", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Checks" }));
      await userEvent.click(canvas.getByRole("button", { name: "+ Add a check" }));
      expect(plan().checks).toHaveLength(9);
      await userEvent.selectOptions(canvas.getByTestId("check-8-type"), "Heavy boxes at the bottom");
      expect(plan().checks[8]).toEqual({ type: "heavyBottom", points: 1 });
    });

    await step("the solution: load both crates", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Solution" }));
      await userEvent.click(canvas.getByRole("button", { name: "Remove the solution" }));
      expect(plan().solution).toBeNull();
      expect(instance.validate()).toContain("There is no solution yet.");
      for (const id of ["A", "B"]) {
        await userEvent.click(canvas.getByTestId(`box-${id}`));
        await userEvent.click(canvas.getByRole("button", { name: "Load" }));
      }
      expect(plan().solution).toHaveLength(2);
    });
  },
};

export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { plan: palletPlan } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("tab", { name: "Laadruimte" })).toHaveAttribute("aria-selected", "true");
    expect(canvas.getByTestId("space-kind")).toHaveValue("pallet");
    expect(instance.validate()).toEqual(["Er is nog geen oplossing."]);
  },
};
