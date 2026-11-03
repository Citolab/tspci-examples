import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { afterPaint, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Contour map",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Canvas = MountedPci["canvas"];
type Rec = { record: { name: string; base: { integer?: number; float?: number; string?: string } | null }[] } | undefined;

/** A field of the record response. */
const field = (response: unknown, name: string) => (response as Rec)?.record.find((f) => f.name === name)?.base;
/** The example map is 2000 × 1500 m; the highest point lies at about (553, 1063). */
const W = 2000, D = 1500;

/** The screen point of a point on the map (metres east and north). */
const at = (el: Element, x: number, y: number, width = W, depth = D) => {
  const r = el.getBoundingClientRect();
  return { clientX: r.left + (x / width) * r.width, clientY: r.top + (1 - y / depth) * r.height };
};
const pointer = (type: string, p: { clientX: number; clientY: number }) =>
  new PointerEvent(type, { ...p, bubbles: true, composed: true, pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1, isPrimary: true });

/** The element under a screen point inside the PCI's shadow root (a handle, or the map itself). */
const under = (map: Element, p: { clientX: number; clientY: number }) =>
  ((map.getRootNode() as ShadowRoot).elementFromPoint?.(p.clientX, p.clientY) as Element | null) ?? map;

/** A click (or tap) on the map at a point in metres. */
const clickMap = async (canvas: Canvas, x: number, y: number) => {
  const map = canvas.getByTestId("map");
  under(map, at(map, x, y)).dispatchEvent(pointer("pointerdown", at(map, x, y)));
  map.dispatchEvent(pointer("pointerup", at(map, x, y)));
  await afterPaint();
};
/** A drag over the map through points in metres. */
const dragMap = async (canvas: Canvas, points: { x: number; y: number }[], testid = "map") => {
  const map = canvas.getByTestId(testid);
  under(map, at(map, points[0].x, points[0].y)).dispatchEvent(pointer("pointerdown", at(map, points[0].x, points[0].y)));
  for (const q of points.slice(1)) {
    map.dispatchEvent(pointer("pointermove", at(map, q.x, q.y)));
    await afterPaint();
  }
  const last = points[points.length - 1];
  map.dispatchEvent(pointer("pointerup", at(map, last.x, last.y)));
  await afterPaint();
};
const slider = (canvas: Canvas, n: number) => canvas.getByRole("slider", { name: new RegExp(`^Point ${n} of the cross-section`) });
/** The correct answers the PCI works out, per task. */
const correctAnswers = (properties: Record<string, string> = {}) =>
  JSON.parse(field((pci as any).getCorrectResponse(properties), "answers")!.string!);

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByTestId("prompt")).toHaveTextContent("This is a map of a hilly area with a river valley.");
    expect(canvas.getByRole("application", { name: /^Contour map: Task 1, Sketch the cross-section from A to B/ })).toBeInTheDocument();
    expect(canvas.getByRole("application", { name: "3D relief model" })).toBeInTheDocument();
    expect(canvas.getAllByRole("tab").map((t) => t.textContent)).toEqual(["1Cross-section", "2Highest point", "3Where the water flows"]);
    expect(canvas.getByRole("tab", { name: "Task 1: Cross-section, not answered yet" })).toHaveAttribute("aria-selected", "true");
    // the legend gives every tint its heights in words
    expect(canvas.getByRole("list", { name: "Heights" })).toHaveTextContent("0 to 30 m");
    expect(canvas.getAllByRole("slider", { name: /of the cross-section/ })).toHaveLength(9);
    expect(slider(canvas, 1)).toHaveAttribute("aria-valuetext", "not set");
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const CrossSectionKeyboard: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await step("the first key sets the point halfway up the graph, arrows move it by half an interval", async () => {
      slider(canvas, 1).focus();
      await userEvent.keyboard("{ArrowUp}");
      expect(slider(canvas, 1)).toHaveAttribute("aria-valuenow", "130");
      await userEvent.keyboard("{ArrowDown}{ArrowDown}{PageUp}");
      expect(slider(canvas, 1)).toHaveAttribute("aria-valuetext", "140 m");
      expect(canvas.getByTestId("status")).toHaveTextContent("Point 1: 140 m.");
      expect(field(await lastChange(mounted, 4), "task1value")).toEqual({ string: "140 - - - - - - - -" });
    });
    await step("Delete clears it, Home and End go to the bottom and the top", async () => {
      await userEvent.keyboard("{Delete}");
      expect(slider(canvas, 1)).toHaveAttribute("aria-valuetext", "not set");
      slider(canvas, 2).focus();
      await userEvent.keyboard("{End}");
      expect(slider(canvas, 2)).toHaveAttribute("aria-valuenow", "260");
      await userEvent.keyboard("{Home}");
      expect(slider(canvas, 2)).toHaveAttribute("aria-valuenow", "0");
    });
    await step("the true heights, typed point by point, score the task", async () => {
      const heights: number[] = correctAnswers()[0].heights;
      for (let i = 0; i < 9; i++) {
        slider(canvas, i + 1).focus();
        // from not set: halfway (130), then 5 m steps
        if (i !== 1) await userEvent.keyboard("{ArrowUp}");
        const now = Number(slider(canvas, i + 1).getAttribute("aria-valuenow"));
        const steps = Math.round((heights[i] - now) / 5);
        await userEvent.keyboard((steps > 0 ? "{ArrowUp}" : "{ArrowDown}").repeat(Math.abs(steps)));
      }
      const r = pci.getResponse();
      expect(field(r, "task1number")).toEqual({ float: 9 });
      expect(field(r, "task1")).toEqual({ integer: 1 });
      expect(field(r, "score")).toEqual({ integer: 1 });
      expect(canvas.getByRole("tab", { name: "Task 1: Cross-section, answered" })).toBeInTheDocument();
    });
  },
};

export const CrossSectionSketch: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    const graph = canvas.getByTestId("profile");
    const r = graph.getBoundingClientRect();
    // one drag from left to right, a little above the middle: every point gets a height
    const p = (fx: number) => ({ clientX: r.left + r.width * fx, clientY: r.top + r.height * 0.4 });
    graph.dispatchEvent(pointer("pointerdown", p(0.09)));
    for (let fx = 0.1; fx < 0.96; fx += 0.03) graph.dispatchEvent(pointer("pointermove", p(fx)));
    graph.dispatchEvent(pointer("pointerup", p(0.95)));
    await afterPaint();
    const value = field(await lastChange(mounted), "task1value")!.string!.split(" ");
    expect(value).toHaveLength(9);
    expect(value.every((v) => v !== "-")).toBe(true);
    // the drag is one step in the log
    expect(JSON.parse(pci.getState()).log).toHaveLength(1);
    await userEvent.click(canvas.getByRole("button", { name: "Clear the graph" }));
    expect(field(pci.getResponse(), "task1value")).toBeUndefined();
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const HighestPoint: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await userEvent.click(canvas.getByRole("tab", { name: /^Task 2/ }));
    expect(canvas.getByTestId("instruction")).toHaveTextContent("Click the highest point on the map.");
    await step("a click near the top: within the margin", async () => {
      await clickMap(canvas, 570, 1040);
      const r = await lastChange(mounted);
      expect(field(r, "task2")).toEqual({ integer: 1 });
      expect(field(r, "task2value")).toEqual({ string: "570 1040" });
      expect(field(r, "task2number")!.float!).toBeLessThan(60);
      expect(canvas.getByTestId("point-answer")).toHaveTextContent("Your point: 570 m east, 1040 m north");
      expect(canvas.getByTestId("status")).toHaveTextContent("Point placed at 570 m east, 1040 m north.");
    });
    await step("the top of the other hill: no point", async () => {
      await clickMap(canvas, 1460, 1130);
      expect(field(pci.getResponse(), "task2")).toEqual({ integer: 0 });
      await userEvent.click(canvas.getByRole("button", { name: "Remove the point" }));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const MapKeyboard: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: /^Task 2/ }));
    const map = canvas.getByTestId("map");
    map.focus();
    await afterPaint();
    // focus puts the cursor in the middle; a step is a fiftieth of the map, with Shift a tenth
    await userEvent.keyboard("{Shift>}{ArrowLeft}{ArrowLeft}{ArrowUp}{/Shift}{ArrowLeft}{ArrowUp}");
    expect(canvas.getByTestId("status")).toHaveTextContent("Pointer at 560 m east, 930 m north");
    expect(canvas.getByTestId("map-hover")).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    expect(field(pci.getResponse(), "task2value")).toEqual({ string: "560 930" });
    expect(field(pci.getResponse(), "task2")).toEqual({ integer: 0 });
    await userEvent.keyboard("{ArrowUp}{ArrowUp}{ArrowUp} ");
    expect(field(pci.getResponse(), "task2")).toEqual({ integer: 1 });
  },
};

export const WhereTheWaterFlows: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await userEvent.click(canvas.getByRole("tab", { name: /^Task 3/ }));
    expect(canvas.getByTestId("marker-s")).toBeInTheDocument();
    const truth: { x: number; y: number }[] = correctAnswers()[2].path;
    await step("a few clicks down the valley side, then a drag along the valley", async () => {
      await clickMap(canvas, truth[10].x, truth[10].y);
      expect(canvas.getByTestId("path-count")).toHaveTextContent("1 point");
      await dragMap(canvas, truth.slice(20).filter((_, i) => i % 3 === 0).concat([truth[truth.length - 1]]));
      const r = await lastChange(mounted);
      expect(field(r, "task3")).toEqual({ integer: 1 });
      expect(field(r, "task3number")!.float!).toBeLessThan(50);
      expect(field(r, "task3value")!.string!.startsWith("1330 900, ")).toBe(true);
    });
    await step("a stream straight to the north is wrong", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Start the stream again" }));
      expect(canvas.getByTestId("status")).toHaveTextContent("The stream starts at S again.");
      await clickMap(canvas, 1330, 1400);
      expect(field(pci.getResponse(), "task3")).toEqual({ integer: 0 });
      await userEvent.click(canvas.getByRole("button", { name: "Undo the last point" }));
      expect(canvas.getByTestId("path-count")).toHaveTextContent("0 points");
    });
  },
};

export const Relief3D: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas } = await openPci(canvasElement);
    const relief = canvas.getByTestId("relief") as HTMLElement & { __relief?: { view: { azimuth: number; elevation: number; radius: number } } };
    // a test browser without WebGL shows the message instead; the map does everything
    if (canvas.queryByTestId("no-webgl")) {
      expect(canvas.getByTestId("no-webgl")).toHaveTextContent("The 3D model needs WebGL");
      return;
    }
    const view = () => relief.__relief!.view;
    const start = view();
    await step("buttons turn, tilt and zoom; reset goes back", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Turn left" }));
      await userEvent.click(canvas.getByRole("button", { name: "Look from higher" }));
      await userEvent.click(canvas.getByRole("button", { name: "Zoom in" }));
      expect(view().azimuth).toBeGreaterThan(start.azimuth);
      expect(view().elevation).toBeGreaterThan(start.elevation);
      expect(view().radius).toBeLessThan(start.radius);
      await userEvent.click(canvas.getByRole("button", { name: "Reset the view" }));
      expect(view()).toEqual(start);
    });
    await step("the keyboard: arrows turn, + and − zoom, 0 resets", async () => {
      relief.focus();
      await userEvent.keyboard("{ArrowRight}{ArrowRight}-");
      expect(view().azimuth).toBeLessThan(start.azimuth);
      expect(view().radius).toBeGreaterThan(start.radius);
      await userEvent.keyboard("0");
      expect(view()).toEqual(start);
    });
    await step("the vertical exaggeration", async () => {
      const range = canvas.getByRole("slider", { name: /Vertical exaggeration/ }) as HTMLInputElement;
      expect(range).toHaveAttribute("aria-valuetext", "3×");
      range.value = "5.5";
      range.dispatchEvent(new Event("input", { bubbles: true }));
      await afterPaint();
      expect(range).toHaveAttribute("aria-valuetext", "5.5×");
    });
    await step("the pointer on the model shows on the map (raycasting)", async () => {
      const c = canvas.getByTestId("relief-canvas");
      const r = c.getBoundingClientRect();
      c.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + r.width / 2, clientY: r.top + r.height * 0.55, bubbles: true }));
      await waitFor(() => expect(canvas.getByTestId("map-hover")).toBeInTheDocument());
    });
  },
};

const HEIGHT_TASKS = JSON.stringify([
  { type: "height", marks: [{ x: 553, y: 1063, label: "P" }, { x: 1000, y: 400, label: "Q" }], margin: 3, points: 2 },
  { type: "point", target: "region", region: { x: 1460, y: 1130, r: 250 }, regionLabel: "Oak Hill", points: 1 },
]);

export const ReadTheHeight: Story = {
  args: { properties: { tasks: HEIGHT_TASKS, show3d: "false", tints: "false" } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const [heights] = correctAnswers({ tasks: HEIGHT_TASKS }).map((a: { values?: number[] }) => a.values);
    expect(canvas.queryByTestId("relief")).toBeNull();
    expect(canvas.queryByTestId("legend")).toBeNull();
    expect(canvas.getByTestId("marker-P")).toBeInTheDocument();
    await step("type the heights; letters are refused", async () => {
      await userEvent.type(canvas.getByLabelText("Height at P (m)"), String(heights[0]));
      await userEvent.type(canvas.getByLabelText("Height at Q (m)"), `${Math.round(heights[1])}x`);
      const r = pci.getResponse();
      expect(field(r, "task1number")).toEqual({ float: heights[0] });
      expect(field(r, "task1value")).toEqual({ string: `${heights[0]} ${Math.round(heights[1])}` });
      expect(field(r, "task1")).toEqual({ integer: 2 });
    });
    await step("a point in the named region", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: /^Task 2/ }));
      expect(canvas.getByTestId("instruction")).toHaveTextContent("Click a point in Oak Hill.");
      await clickMap(canvas, 1300, 1200);
      expect(field(pci.getResponse(), "task2")).toEqual({ integer: 1 });
      expect(field(pci.getResponse(), "score")).toEqual({ integer: 3 });
    });
  },
};

export const ShowHeight: Story = {
  args: { properties: { showHeight: "true" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    const map = canvas.getByTestId("map");
    map.dispatchEvent(pointer("pointermove", at(map, 553, 1063)));
    await waitFor(() => expect(canvas.getByTestId("map-hover-height")).toHaveTextContent("256 m"));
    expect(canvas.getByTestId("readout")).toHaveTextContent("553 m east, 1063 m north: 256 m");
  },
};

export const FreeLine: Story = {
  args: { properties: { tasks: JSON.stringify([{ type: "profile", samples: 5, margin: 10 }]), interval: "20" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByTestId("instruction")).toHaveTextContent("Draw a line A–B on the map");
    expect(canvas.queryByTestId("profile")).toBeNull();
    await clickMap(canvas, 200, 750);
    expect(canvas.getByTestId("line-hint")).toHaveTextContent("Now click B.");
    await clickMap(canvas, 300, 750);
    expect(canvas.getByTestId("line-hint")).toHaveTextContent("The line is very short");
    await userEvent.click(canvas.getByRole("button", { name: "Draw the line again" }));
    await clickMap(canvas, 200, 750);
    await clickMap(canvas, 1800, 750);
    expect(canvas.getByTestId("status")).toHaveTextContent("B placed at 1800 m east, 750 m north; the line is 1600 m long.");
    expect(canvas.getAllByRole("slider", { name: /of the cross-section/ })).toHaveLength(5);
    expect(field(pci.getResponse(), "task1value")).toEqual({ string: "A 200 750 B 1800 750: - - - - -" });
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", tasks: HEIGHT_TASKS } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByTestId("prompt")).toHaveTextContent("Dit is een kaart van een heuvelachtig gebied");
    expect(canvas.getByRole("tab", { name: "Opdracht 1: Hoogte aflezen, nog niet beantwoord" })).toBeInTheDocument();
    expect(canvas.getByRole("list", { name: "Hoogtes" })).toHaveTextContent("0 tot 30 m");
    expect(canvas.getByRole("button", { name: "Naar links draaien" })).toBeInTheDocument();
    // a decimal comma: the response has a point
    await userEvent.type(canvas.getByLabelText("Hoogte bij P (m)"), "87,5");
    expect(field(pci.getResponse(), "task1number")).toEqual({ float: 87.5 });
    expect(field(pci.getResponse(), "task1value")).toEqual({ string: "87.5 -" });
    canvas.getByLabelText("Hoogte bij P (m)").blur();
    await afterPaint();
    expect(canvas.getByLabelText("Hoogte bij P (m)")).toHaveValue("87,5");
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    slider(first.canvas, 3).focus();
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    await userEvent.click(first.canvas.getByRole("tab", { name: /^Task 2/ }));
    await clickMap(first.canvas, 600, 1000);
    const state = first.pci.getState();
    expect(JSON.parse(state).state.answers[1]).toEqual({ p: { x: 600, y: 1000 } });

    const second = await remountPci(canvasElement, pci, { state });
    expect(slider(second.canvas, 3)).toHaveAttribute("aria-valuenow", "135");
    expect(second.pci.getResponse()).toEqual(first.pci.getResponse());
    expect(second.changes).toHaveLength(0);
  },
};

const bound = () => ({ record: [{ name: "answers", base: { string: JSON.stringify([{}, { p: { x: 553, y: 1063 } }, {}]) } }] });

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: bound() } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("the bound response is in the tasks", async () => {
      expect(canvas.getByRole("tab", { name: "Task 2: Highest point, answered" })).toBeInTheDocument();
      expect(field(pci.getResponse(), "score")).toEqual({ integer: 1 });
    });
    await step("resetResponse: nothing answered", async () => {
      pci.resetResponse();
      await waitFor(() => expect(canvas.getByRole("tab", { name: "Task 2: Highest point, not answered yet" })).toBeInTheDocument());
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: { status: "solution", state: JSON.stringify({ state: { answers: [{}, { p: { x: 10, y: 10 } }, {}] }, log: [] }) },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the correct answers from the settings replace the candidate's; nothing to change
    expect(canvas.getByTestId("solution-note")).toHaveTextContent("The correct answers are shown.");
    expect(canvas.getByTestId("profile-truth")).toBeInTheDocument();
    expect(slider(canvas, 1)).toHaveAttribute("aria-readonly", "true");
    expect(field(pci.getResponse(), "correct")).toEqual({ integer: 1 });
    expect(field(pci.getResponse(), "score")).toEqual({ integer: 3 });
    await userEvent.click(canvas.getByRole("tab", { name: /^Task 2/ }));
    expect(canvas.getByTestId("marker-truth")).toBeInTheDocument();
    expect(canvas.queryByRole("button", { name: "Remove the point" })).toBeNull();
    await userEvent.click(canvas.getByRole("tab", { name: /^Task 3/ }));
    expect(canvas.getByTestId("river-truth")).toBeInTheDocument();
  },
};

export const SolutionFromTheDeclaration: Story = {
  args: {
    status: "solution",
    responseDeclaration: { cardinality: "record", correctResponse: { value: [{ fieldIdentifier: "answers", value: JSON.stringify([{}, { p: { x: 1460, y: 1130 } }, {}]) }] } },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: /^Task 2/ }));
    expect(canvas.getByTestId("point-answer")).toHaveTextContent("1460 m east, 1130 m north");
    expect(field(pci.getResponse(), "score")).toEqual({ integer: 0 });
  },
};

/** Two interactions of this type on one page: each has its own answers and response. */
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
    await userEvent.click(first.canvas.getByRole("tab", { name: /^Task 2/ }));
    await clickMap(first.canvas, 553, 1063);
    await userEvent.click(second.canvas.getByRole("tab", { name: /^Task 2/ }));
    await clickMap(second.canvas, 100, 100);
    expect(field(first.pci.getResponse(), "task2value")).toEqual({ string: "553 1063" });
    expect(field(second.pci.getResponse(), "task2value")).toEqual({ string: "100 100" });
    expect(first.changes).toHaveLength(1);
    expect(second.changes).toHaveLength(1);
  },
};

// --- Authoring mode: what an authoring system shows the item author (getAuthoringInstance)

export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);
    const terrain = () => JSON.parse(instance.getProperties().terrain!);
    const tasks = () => JSON.parse(instance.getProperties().tasks!);

    await step("starts from the example, which is valid", async () => {
      expect(instance.validate()).toEqual([]);
      expect(terrain().hills).toHaveLength(3);
      expect(canvas.getByTestId("summary")).toHaveTextContent("The terrain goes from 4 m to 256 m.");
    });

    await step("a click adds a hill; dragging its ring sizes it; the fields change it", async () => {
      await dragMap(canvas, [{ x: 1000, y: 300 }], "author-map");
      expect(terrain().hills[3]).toEqual({ x: 1000, y: 300, h: 60, r: 250 });
      await dragMap(canvas, [{ x: 1250, y: 300 }, { x: 1300, y: 300 }, { x: 1400, y: 300 }], "author-map");
      expect(Math.abs(terrain().hills[3].r - 400)).toBeLessThanOrEqual(3);
      await retype(canvas.getByTestId("hill-h"), "-40");
      expect(terrain().hills[3].h).toBe(-40);
      expect(changes.length).toBeGreaterThan(2);
    });

    await step("the map: interval and the height under the pointer (a problem with a cross-section)", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Map" }));
      await userEvent.click(canvas.getByRole("checkbox", { name: "Height under the pointer" }));
      expect(instance.validate()).toEqual(["The height under the pointer gives away the answers of the cross-section and the heights: turn it off."]);
      await userEvent.click(canvas.getByRole("checkbox", { name: "Height under the pointer" }));
      expect(instance.getProperties().showHeight).toBe("false");
    });

    await step("tasks: add a height task and place its points on the map", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Tasks" }));
      await userEvent.selectOptions(canvas.getByTestId("new-task-type"), "height");
      await userEvent.click(canvas.getByRole("button", { name: "+ Add a task" }));
      await dragMap(canvas, [{ x: 300, y: 300 }], "author-map");
      expect(tasks()[3].marks).toEqual([{ x: 1000, y: 750, label: "P1" }, { x: 300, y: 300, label: "P2" }]);
      expect(canvas.getByTestId("truth")).toHaveTextContent(/^Correct answer: P1: [\d.]+ m · P2: [\d.]+ m$/);
      await retype(canvas.getByTestId("task-margin"), "0");
      expect(instance.validate()).toEqual(["Task 4 needs a margin greater than 0."]);
    });

    await step("the river task shows the stream the PCI computes: it now ends in the new hollow", async () => {
      await userEvent.click(canvas.getByTestId("author-task-3"));
      expect(canvas.getByTestId("author-river")).toBeInTheDocument();
      expect(canvas.getByTestId("truth")).toHaveTextContent(/→ 10\d\d m east, [34]\d\d m north$/);
    });
  },
};

export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { tasks: "[]" } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("tab", { name: "Terrein" })).toBeInTheDocument();
    expect(instance.validate()).toEqual(["Er zijn geen opdrachten."]);
  },
};
