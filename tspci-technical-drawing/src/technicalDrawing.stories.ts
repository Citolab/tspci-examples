import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, fireEvent, userEvent, waitFor } from "storybook/test";
import { afterPaint, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Technical drawing",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Rec = { record: { name: string; base: { integer?: number; string?: string; float?: number } | null }[] } | undefined;
/** A field of a record response. */
const field = (response: unknown, name: string) => (response as Rec)?.record.find((f) => f.name === name)?.base;

/** The asked dimension fields, by their accessible names. */
const dimField = (m: MountedPci, name: string) => m.canvas.getByRole("textbox", { name: `${name}, in mm` });

/** Keys on an element inside the shadow root (userEvent.keyboard types into document.activeElement, the host). */
const press = async (el: Element, ...keys: string[]) => {
  for (const key of keys) fireEvent.keyDown(el, { key });
  await afterPaint();
};

/** A click on the grid at a point of the view (mm from its bottom left corner), with pointer events. */
const clickGrid = async (m: MountedPci, view: string, u: number, v: number) => {
  const root = m.root as ShadowRoot;
  const svg = root.querySelector<SVGSVGElement>("[data-testid=drawing]")!;
  const corner = root.querySelector(`[data-view=${view}] [data-seg="visible:0,0,60,0"]`)!;
  const pt = svg.createSVGPoint();
  pt.x = Number(corner.getAttribute("x1")) + u;
  pt.y = Number(corner.getAttribute("y1")) - v;
  const s = pt.matrixTransform(svg.getScreenCTM()!);
  const grid = root.querySelector("[data-testid=grid]")!;
  const at = { clientX: s.x, clientY: s.y, bubbles: true, composed: true, pointerId: 1, button: 0, isPrimary: true };
  grid.dispatchEvent(new PointerEvent("pointerdown", at));
  grid.dispatchEvent(new PointerEvent("pointerup", at));
  await afterPaint();
};

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    const { canvas, pci } = m;
    expect(canvas.getByText(/^The drawing shows a workpiece in European projection/)).toBeInTheDocument();
    expect(canvas.getByRole("group", { name: /^Technical drawing in European projection with front view, top view, left side view/ })).toBeInTheDocument();
    for (const name of ["Front view", "Top view", "Left side view"]) expect(canvas.getByText(name)).toBeInTheDocument();
    // the three asked dimensions are fields, the others text on the drawing
    expect(canvas.getAllByRole("textbox")).toHaveLength(3);
    expect(dimField(m, "Step: width")).toBeInTheDocument();
    expect(canvas.getByText("Ø10")).toBeInTheDocument();
    expect(canvas.getByText("5×45°")).toBeInTheDocument();
    // the 3D model, with buttons for every way of turning it
    expect(canvas.getByRole("application", { name: /^3D model of the workpiece/ })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "From the front" })).toBeInTheDocument();
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const FillInDimensions: Story = {
  play: async ({ canvasElement, step }) => {
    const m = await openPci(canvasElement);
    await step("a letter is refused, with a message", async () => {
      await userEvent.type(dimField(m, "Step: width"), "2x0");
      expect(dimField(m, "Step: width")).toHaveValue("20");
      expect(m.canvas.getByRole("status")).toHaveTextContent("Type a number");
      expect(m.pci.getResponse()).toBeUndefined();
    });
    await step("every field filled: an ordered list of floats", async () => {
      await userEvent.type(dimField(m, "Slot: depth"), "10");
      await userEvent.type(dimField(m, "Hole: distance from the side"), "50.5");
      expect(await lastChange(m)).toEqual({ list: { float: [20, 10, 50.5] } });
    });
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl" } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(m.canvas.getByText("Bovenaanzicht")).toBeInTheDocument();
    expect(m.canvas.getByText(/^De werktekening toont een werkstuk/)).toBeInTheDocument();
    await userEvent.type(dimField(m, "Trap: breedte"), "19,5");
    await userEvent.type(dimField(m, "Sleuf: diepte"), "10");
    await userEvent.type(dimField(m, "Gat: afstand tot de zijkant"), "50");
    // the response does not depend on the language
    expect(m.pci.getResponse()).toEqual({ list: { float: [19.5, 10, 50] } });
  },
};

export const ReadTheDrawing: Story = {
  args: { properties: { task: "read" } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(m.canvas.getByRole("group", { name: "Questions" })).toBeInTheDocument();
    // the slot's depth is hidden; its rest (20) is shown: 30 − 20
    expect(m.canvas.queryAllByRole("textbox", { name: /in mm$/ })).toHaveLength(0);
    await userEvent.type(m.canvas.getByRole("textbox", { name: "Slot: depth = (mm)" }), "10");
    await userEvent.type(m.canvas.getByRole("textbox", { name: "Hole: distance from the other side = (mm)" }), "10");
    expect(m.pci.getResponse()).toEqual({ list: { float: [10, 10] } });
  },
};

export const PciScoring: Story = {
  args: { properties: { scoring: "pci", tolerance: "0.5" } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    await userEvent.type(dimField(m, "Step: width"), "20.4");
    const r = await lastChange(m);
    expect(field(r, "score")).toEqual({ integer: 1 });
    expect(field(r, "maxscore")).toEqual({ integer: 3 });
    expect(field(r, "value1")).toEqual({ float: 20.4 });
    expect(field(r, "values")).toEqual({ string: "20.4;;" });
  },
};

export const CompleteAView: Story = {
  args: { properties: { task: "complete" } },
  play: async ({ canvasElement, step }) => {
    const m = await openPci(canvasElement);
    const grid = m.canvas.getByRole("application", { name: /^Grid of the front view/ });
    await step("the step's three visible lines with the mouse (click, click)", async () => {
      await clickGrid(m, "front", 40, 15);
      await clickGrid(m, "front", 40, 30);
      await clickGrid(m, "front", 40, 15);
      await clickGrid(m, "front", 60, 15);
      await clickGrid(m, "front", 60, 0);
      await clickGrid(m, "front", 60, 15);
      const r = await lastChange(m);
      expect(field(r, "visibleOk")).toEqual({ integer: 1 });
      expect(field(r, "hiddenOk")).toEqual({ integer: 0 });
      expect(field(r, "score")).toEqual({ integer: 2 });
    });
    await step("the hidden lines with the keyboard", async () => {
      await userEvent.click(m.canvas.getByRole("radio", { name: "Hidden line" }));
      grid.focus();
      await press(grid, "Home", "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp", "Enter");
      expect(m.canvas.getByRole("status")).toHaveTextContent("Line starts at (0, 20)");
      await press(grid, ...Array(8).fill("ArrowRight"), "Enter");
      expect(m.canvas.getByRole("status")).toHaveTextContent("Added: hidden line from (0, 20) to (40, 20).");
      await press(grid, "ArrowRight", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "Enter", "ArrowUp", "ArrowUp", "ArrowUp", "Enter");
      await press(grid, "ArrowRight", "ArrowRight", "Enter", "ArrowDown", "ArrowDown", "ArrowDown", "Enter");
      const r = m.pci.getResponse();
      expect(field(r, "correct")).toEqual({ integer: 1 });
      expect(field(r, "score")).toEqual({ integer: 3 });
      expect(field(r, "lines")).toEqual({ string: "H0,20,40,20;H45,0,45,15;H55,0,55,15;V40,15,40,30;V40,15,60,15;V60,0,60,15" });
    });
    await step("an extra line costs the point for no extra lines; Delete removes it", async () => {
      await press(grid, "Home", "ArrowUp", "Enter", "ArrowRight", "Enter");
      expect(field(m.pci.getResponse(), "noExtra")).toEqual({ integer: 0 });
      await press(grid, "Delete");
      expect(m.canvas.getByRole("status")).toHaveTextContent("Removed: hidden line from (0, 5) to (5, 5).");
      expect(field(m.pci.getResponse(), "score")).toEqual({ integer: 3 });
    });
    await step("undo and the list of lines", async () => {
      await userEvent.click(m.canvas.getByRole("button", { name: "Undo" }));
      await userEvent.click(m.canvas.getByText(/^Your lines/));
      expect(m.canvas.getAllByRole("button", { name: /^Remove (visible|hidden) line/ })).toHaveLength(5);
    });
  },
};

export const WhichView: Story = {
  args: { properties: { task: "view", modelView: "2d" } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(m.canvas.queryByText("Left side view", { selector: "text" })).toBeNull();
    await userEvent.click(m.canvas.getByRole("radio", { name: "Left side view" }));
    expect(await lastChange(m)).toEqual({ base: { identifier: "left" } });
    expect(m.canvas.getByRole("status")).toHaveTextContent("Chosen: Left side view.");
  },
};

export const WhichWorkpiece: Story = {
  args: { properties: { task: "model", modelView: "2d" } },
  play: async ({ canvasElement, step }) => {
    const m = await openPci(canvasElement);
    const picture = m.canvas.getByRole("application", { name: /^3D model/ });
    await step("four workpieces; choose one", async () => {
      expect(m.canvas.getAllByRole("radio")).toHaveLength(4);
      await userEvent.click(m.canvas.getByRole("radio", { name: "Workpiece B" }));
      expect(await lastChange(m)).toEqual({ base: { identifier: "B" } });
    });
    await step("turn them with the keys and the buttons", async () => {
      const yaw = picture.getAttribute("data-yaw");
      await press(picture, "ArrowLeft");
      await waitFor(() => expect(picture.getAttribute("data-yaw")).not.toBe(yaw));
      await userEvent.click(m.canvas.getByRole("button", { name: "From the top" }));
      await waitFor(() => expect(picture.getAttribute("data-pitch")).toBe("90"));
      await press(picture, "0");
      await waitFor(() => expect(picture.getAttribute("data-pitch")).toBe("25"));
    });
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.type(dimField(first, "Step: width"), "20");
    const state = first.pci.getState();
    expect(JSON.parse(state).state.values).toEqual(["20"]);
    const second = await remountPci(canvasElement, pci, { state });
    expect(dimField(second, "Step: width")).toHaveValue("20");
    expect(second.changes).toHaveLength(0);
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: { list: { float: [20, 10, 50] } } }, properties: { language: "nl" } },
  play: async ({ canvasElement, step }) => {
    const m = await openPci(canvasElement);
    await step("the bound response is in the fields", async () => {
      await waitFor(() => expect(dimField(m, "Trap: breedte")).toHaveValue("20"));
      expect(m.pci.getResponse()).toEqual({ list: { float: [20, 10, 50] } });
    });
    await step("resetResponse empties them", async () => {
      m.pci.resetResponse();
      await waitFor(() => expect(dimField(m, "Trap: breedte")).toHaveValue(""));
      expect(m.pci.getResponse()).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: { status: "solution", properties: { task: "complete" } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    // the lines left out, from the settings
    await waitFor(() => expect(field(m.pci.getResponse(), "correct")).toEqual({ integer: 1 }));
    expect(m.canvas.getByRole("radio", { name: "Visible line" })).toBeDisabled();
  },
};

export const SolutionFromTheDeclaration: Story = {
  args: { status: "solution", responseDeclaration: { cardinality: "ordered", baseType: "float", correctResponse: { value: ["20", "10", "50"] } } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    await waitFor(() => expect(dimField(m, "Step: width")).toHaveValue("20"));
    expect(dimField(m, "Hole: distance from the side")).toHaveAttribute("readonly");
  },
};

/** Two interactions of this type on one page: each has its own fields and response. */
export const TwoInstances: Story = {
  render: (args) => {
    const page = document.createElement("div");
    for (const id of ["first", "second"]) {
      const slot = document.createElement("div");
      slot.dataset.slot = id;
      slot.appendChild(mountPci(pci, { ...args, properties: { task: id === "first" ? "dimensions" : "view", modelView: "2d" } }));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=first]")!);
    const second = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=second]")!);
    expect(first.pci).not.toBe(second.pci);
    await userEvent.type(dimField(first, "Step: width"), "20");
    await userEvent.click(second.canvas.getByRole("radio", { name: "Top view" }));
    expect(JSON.parse(first.pci.getState()).state.values).toEqual(["20"]);
    expect(second.pci.getResponse()).toEqual({ base: { identifier: "top" } });
    expect(JSON.parse(first.pci.getState()).state.choice).toBeNull();
    expect(second.changes).toHaveLength(1);
  },
};

// --- Authoring mode: what an authoring system shows the item author (getAuthoringInstance)

export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);
    const drawing = () => JSON.parse(instance.getProperties().drawing!);

    await step("starts from the example, without problems", async () => {
      expect(instance.validate!()).toEqual([]);
      expect(drawing().features).toHaveLength(5);
      expect(canvas.getByRole("tab", { name: "Workpiece" })).toHaveAttribute("aria-selected", "true");
    });

    await step("a feature: add a hole that sticks out, then fix it", async () => {
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Add" }), "Hole");
      await userEvent.click(canvas.getByRole("button", { name: "Add" }));
      expect(drawing().features[5]).toMatchObject({ type: "hole", face: "front" });
      await retype(canvas.getByTestId("f5-a"), "2");
      expect(instance.validate!()).toEqual(["Feature 6 is (partly) outside the workpiece."]);
      await retype(canvas.getByTestId("f5-a"), "15");
      expect(instance.validate!()).toEqual([]);
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("the task: which dimensions are asked", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Task" }));
      for (const name of ["Step: width", "Slot: depth", "Hole 1: distance from the side"]) {
        await userEvent.selectOptions(canvas.getByRole("combobox", { name: `${name}: on the drawing` }), "show");
      }
      expect(instance.validate!()).toEqual(["No dimension is asked: set at least one to “ask”."]);
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Height: on the drawing" }), "ask");
      expect(drawing().dims["0.h"]).toBe("ask");
      expect(instance.validate!()).toEqual([]);
    });

    await step("complete a view: click lines to leave them out", async () => {
      await userEvent.selectOptions(canvas.getByTestId("task"), "complete");
      await userEvent.selectOptions(canvas.getByTestId("complete-view"), "top");
      expect(instance.validate!()).toEqual(["No line is left out of the view to complete."]);
      canvas.getByTestId("seg-top-visible:0,15,40,15").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await afterPaint();
      expect(drawing().complete.remove).toEqual(["visible:0,15,40,15"]);
      expect(instance.getProperties().task).toBe("complete");
      expect(instance.validate!()).toEqual([]);
    });

    await step("which workpiece: distractors that look different", async () => {
      await userEvent.selectOptions(canvas.getByTestId("task"), "model");
      expect(instance.validate!()).toEqual(["The question needs at least one other workpiece."]);
      await userEvent.selectOptions(canvas.getByTestId("option-count"), "4");
      expect(drawing().options).toHaveLength(3);
      expect(instance.validate!()).toEqual([]);
    });
  },
};
