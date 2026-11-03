import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, fireEvent, userEvent, waitFor } from "storybook/test";
import {
  afterPaint, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci, type PciArgs,
} from "../../.storybook/tspci";
import pci from "./index";

// The 3D view is WebGL: these stories use the accessible controls (sliders, number fields, selects, radios) and the
// instance API, and check the cross-section in the 2D view, the measures, the status line and the response.

const meta = {
  title: "Cross-section",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Canvas = MountedPci["canvas"];
type Rec = { record: { name: string; base: Record<string, any> | null }[] } | undefined;

/** A field of the record response. */
const field = (response: unknown, name: string) => (response as Rec)?.record.find((f) => f.name === name)?.base;
/** Drags a range to a value and lets go (userEvent's arrow keys do not move a native range). */
const slide = async (slider: HTMLElement, value: number) => {
  (slider as HTMLInputElement).value = String(value);
  fireEvent.input(slider);
  fireEvent.change(slider);
  await afterPaint();
};
/** Types a number in a field and presses Enter. */
const enter = async (input: HTMLElement, value: string) => {
  await retype(input, `${value}{Enter}`);
  await afterPaint();
};
const shapeName = (canvas: Canvas) => canvas.getByTestId("shape-name").textContent;
const planeRecord = (plane: { offset: number; tilt: number; turn: number }) => ({ record: [{ name: "plane", base: { string: JSON.stringify(plane) } }] });
const HEX_TILT = "54.7356";

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByTestId("prompt")).toHaveTextContent("Cut the cube with a plane so that the cross-section is a regular hexagon.");
    expect(canvas.getByRole("application", { name: /^Cube cut by a plane\. The plane: moved 0 cm, tilted 0°, turned 0°\./ })).toBeInTheDocument();
    expect(canvas.getByRole("img", { name: "The cross-section in its true shape: square, sides 6 cm, 6 cm, 6 cm, 6 cm, area 36 cm²" })).toBeInTheDocument();
    expect(shapeName(canvas)).toBe("Square");
    expect(canvas.getByTestId("area")).toHaveTextContent("36 cm²");
    expect(canvas.getByRole("slider", { name: "Tilt" })).toHaveValue("0");
    expect(canvas.getByRole("radio", { name: "Sliders" })).toHaveAttribute("aria-checked", "true");
    expect(canvas.getByRole("radio", { name: "Whole solid" })).toHaveAttribute("aria-checked", "true");
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const SlidersAndNumbers: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("tilt 45°: a cut through two opposite edges, a rectangle of 6 by 8.49", async () => {
      await slide(canvas.getByRole("slider", { name: "Tilt" }), 45);
      expect(shapeName(canvas)).toBe("Rectangle");
      expect(canvas.getByTestId("lengths")).toHaveTextContent("6 · 8.49 · 6 · 8.49 cm");
      expect(canvas.getByRole("status")).toHaveTextContent("Cross-section: rectangle, sides 6 cm, 8.49 cm, 6 cm, 8.49 cm, area 50.91 cm².");
      const r = await lastChange(mounted);
      expect(field(r, "shape")).toEqual({ identifier: "rectangle" });
      expect(field(r, "shapeOk")).toEqual({ integer: 0 });
    });

    await step("type the angles of the regular hexagon", async () => {
      await enter(canvas.getByRole("textbox", { name: "Tilt (°)" }), HEX_TILT);
      await enter(canvas.getByRole("textbox", { name: "Turn (°)" }), "45");
      expect(shapeName(canvas)).toBe("Regular hexagon");
      expect(canvas.getAllByTestId("side-label")).toHaveLength(6);
      const r = pci.getResponse();
      expect(field(r, "score")).toEqual({ integer: 1 });
      expect(field(r, "maxscore")).toEqual({ integer: 1 });
      expect(field(r, "correct")).toEqual({ integer: 1 });
      expect(field(r, "sides")).toEqual({ integer: 6 });
      expect(field(r, "lengths")).toEqual({ string: "4.24 4.24 4.24 4.24 4.24 4.24" });
      expect(field(r, "area")).toEqual({ float: 46.77 });
      expect(field(r, "plane")).toEqual({ string: '{"offset":0,"tilt":54.74,"turn":45}' });
    });

    await step("move it along the diagonal: an equilateral triangle", async () => {
      await enter(canvas.getByRole("textbox", { name: "Move (cm)" }), "4");
      expect(shapeName(canvas)).toBe("Equilateral triangle");
      expect(field(pci.getResponse(), "correct")).toEqual({ integer: 0 });
    });

    await step("too far: no cross-section", async () => {
      await slide(canvas.getByRole("slider", { name: "Move" }), 5.2);
      expect(canvas.getByTestId("section-2d")).toHaveTextContent("The plane does not cut the solid.");
      expect(field(pci.getResponse(), "shape")).toEqual({ identifier: "none" });
    });

    await step("Start again", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Start again" }));
      expect(shapeName(canvas)).toBe("Square");
      expect(pci.getResponse()).toBeUndefined();
      expect(canvas.getByRole("status")).toHaveTextContent("The plane is back where it started.");
    });
  },
};

export const ThreePoints: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("switch to three points", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "Three points" }));
      expect(canvas.getByRole("radio", { name: "Three points" })).toHaveAttribute("aria-checked", "true");
      expect(canvas.getByRole("radio", { name: "P" })).toHaveAttribute("aria-checked", "true");
    });
    await step("the midpoints of AB, BF and GH: a regular hexagon", async () => {
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Point P on edge" }), "AB");
      expect(canvas.getByRole("textbox", { name: "Point P: cm from A" })).toHaveValue("3");
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Point Q on edge" }), "BF");
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Point R on edge" }), "GH");
      expect(canvas.getByRole("status")).toHaveTextContent("R on edge GH, 3 cm from G.");
      expect(shapeName(canvas)).toBe("Regular hexagon");
      expect(field(pci.getResponse(), "correct")).toEqual({ integer: 1 });
    });
    await step("R in G: a different cut", async () => {
      await enter(canvas.getByRole("textbox", { name: "Point R: cm from G" }), "0");
      expect(shapeName(canvas)).not.toBe("Regular hexagon");
      await userEvent.click(canvas.getAllByRole("button", { name: "Midpoint" })[2]);
      expect(shapeName(canvas)).toBe("Regular hexagon");
    });
    await step("three points on one line", async () => {
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Point Q on edge" }), "AB");
      await enter(canvas.getByRole("textbox", { name: "Point Q: cm from A" }), "1");
      // P and Q on AB, R on GH: the plane holds AB, a rectangle through the cube
      expect(shapeName(canvas)).toBe("Rectangle");
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Point R on edge" }), "AB");
      expect(canvas.getByRole("alert")).toHaveTextContent("The three points lie on one line: choose another point.");
      // the plane stays where the last good points put it
      expect(shapeName(canvas)).toBe("Rectangle");
    });
  },
};

export const HideAPart: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: "Part above the plane" }));
    expect(canvas.getByRole("radio", { name: "Part above the plane" })).toHaveAttribute("aria-checked", "true");
    expect(canvas.getByRole("radio", { name: "Whole solid" })).toHaveAttribute("aria-checked", "false");
    expect(canvas.getByRole("status")).toHaveTextContent("Shown: part above the plane.");
    expect(pci.store.getState().hide).toBe("below");
    // showing a part is no answer
    expect(pci.getResponse()).toBeUndefined();
  },
};

/** A box of 8 × 4 × 6: "make a cross-section that is a rectangle of 4 by 6", with the PCI's scoring. */
const BOX = { solid: "box", dimensions: "8 4 6", targetShape: "rectangle", targetLengths: "4 6", targetArea: "24", prompt: "Cut the box so that the cross-section is a rectangle of 4 by 6 cm." };

export const RectangleFourBySix: Story = {
  args: { properties: BOX },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("upright across the length: 4 by 6, three checks pass", async () => {
      await slide(canvas.getByRole("slider", { name: "Tilt" }), 90);
      expect(canvas.getByTestId("lengths")).toHaveTextContent("4 · 6 · 4 · 6 cm");
      const r = pci.getResponse();
      expect(["shapeOk", "lengthsOk", "areaOk", "score", "maxscore"].map((k) => field(r, k)?.integer)).toEqual([1, 1, 1, 3, 3]);
    });
    await step("turned: 8 by 6, only the shape", async () => {
      await slide(canvas.getByRole("slider", { name: "Turn" }), 90);
      expect(canvas.getByTestId("lengths")).toHaveTextContent("8 · 6 · 8 · 6 cm");
      const r = pci.getResponse();
      expect(["shapeOk", "lengthsOk", "areaOk", "score"].map((k) => field(r, k)?.integer)).toEqual([1, 0, 0, 1]);
    });
    await step("a little off, within the margin of 0.2 cm", async () => {
      await slide(canvas.getByRole("slider", { name: "Turn" }), 0);
      await enter(canvas.getByRole("textbox", { name: "Tilt (°)" }), "88");
      expect(field(pci.getResponse(), "lengthsOk")).toEqual({ integer: 1 });
    });
  },
};

export const RoundSolids: Story = {
  args: { properties: { solid: "cone", dimensions: "4 8", prompt: "Cut the cone." } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.queryByRole("radio", { name: "Three points" })).toBeNull();
    await step("flat: a circle with its diameter", async () => {
      expect(shapeName(canvas)).toBe("Circle");
      expect(canvas.getByTestId("axis-label")).toHaveTextContent("d = 4");
    });
    await step("tilted less than the side: an ellipse with two axes", async () => {
      await slide(canvas.getByRole("slider", { name: "Tilt" }), 30);
      expect(shapeName(canvas)).toBe("Ellipse");
      expect(canvas.getAllByTestId("axis-label")).toHaveLength(2);
      expect(field(pci.getResponse(), "sides")).toEqual({ integer: 0 });
    });
    await step("steeper than the side: a hyperbolic segment; upright through the top: a triangle", async () => {
      await slide(canvas.getByRole("slider", { name: "Tilt" }), 80);
      expect(shapeName(canvas)).toBe("Hyperbolic segment");
      await slide(canvas.getByRole("slider", { name: "Tilt" }), 90);
      expect(shapeName(canvas)).toBe("Isosceles triangle");
      expect(canvas.getByTestId("area")).toHaveTextContent("32 cm²");
    });
  },
};

export const ToolMode: Story = {
  args: { properties: { solid: "cylinder", dimensions: "3 8", mode: "tool", showName: "false", prompt: "Which shapes can you cut from a cylinder?" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.queryByTestId("shape-name")).toBeNull();
    await slide(canvas.getByRole("slider", { name: "Tilt" }), 30);
    await slide(canvas.getByRole("slider", { name: "Tilt" }), 90);
    const r = (await lastChange(mounted, 2)) as { base: { string: string } };
    const tool = JSON.parse(r.base.string);
    expect(tool.shape).toBe("rectangle");
    expect(tool.found).toEqual(["ellipse", "rectangle"]);
    expect(tool.lengths).toEqual([6, 8, 6, 8]);
    // without the name, the status gives the measures only
    expect(canvas.getByRole("status")).toHaveTextContent("Cross-section: cross-section, sides 6 cm, 8 cm, 6 cm, 8 cm, area 48 cm².");
  },
};

/** "Which shape is this cross-section?": the plane is fixed, the candidate can only look; no name, no measures. */
export const FixedPlane: Story = {
  args: { properties: { controls: "hide", plane: "0 45 45", showName: "false", showMeasures: "false", mode: "tool", prompt: "Which shape is this cross-section?" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    expect(canvas.getByText("The plane is fixed: turn the solid to look at the cross-section.")).toBeInTheDocument();
    expect(canvas.getByRole("slider", { name: "Tilt" })).toBeDisabled();
    expect(canvas.queryByTestId("measures")).toBeNull();
    expect(canvas.queryAllByTestId("side-label")).toHaveLength(0);
    expect(canvas.getByRole("img", { name: "The cross-section in its true shape: cross-section" })).toBeInTheDocument();
    expect(canvas.getByRole("radio", { name: "Part below the plane" })).toBeEnabled();
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", solid: "pyramid", dimensions: "6 6", prompt: "Snijd de piramide door." } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("application", { name: /^Vierzijdige piramide, doorgesneden door een vlak\./ })).toBeInTheDocument();
    expect(shapeName(canvas)).toBe("Vierkant");
    await enter(canvas.getByRole("textbox", { name: "Hellen (°)" }), "30,5");
    expect(canvas.getByRole("slider", { name: "Hellen" })).toHaveValue("30.5");
    expect(canvas.getByRole("textbox", { name: "Hellen (°)" })).toHaveValue("30,5");
    expect(shapeName(canvas)).toBe("Gelijkbenig trapezium");
    expect(canvas.getByRole("status")).toHaveTextContent(/^Doorsnede: gelijkbenig trapezium, zijden [0-9,]+ cm/);
    expect(canvas.getByTestId("lengths").textContent).toContain(",");
    // the response does not depend on the language
    expect(field(pci.getResponse(), "lengths")?.string).toMatch(/^[0-9. ]+$/);
    expect(field(pci.getResponse(), "plane")).toEqual({ string: '{"offset":0,"tilt":30.5,"turn":0}' });
    expect(canvas.getByRole("radio", { name: "Drie punten" })).toBeInTheDocument();
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await slide(first.canvas.getByRole("slider", { name: "Tilt" }), 45);
    await userEvent.click(first.canvas.getByRole("radio", { name: "Part below the plane" }));
    const state = first.pci.getState();
    expect(JSON.parse(state).state).toMatchObject({ plane: { offset: 0, tilt: 45, turn: 0 }, changed: true, hide: "above", found: ["rectangle"] });

    const second = await remountPci(canvasElement, pci, { state });
    expect(shapeName(second.canvas)).toBe("Rectangle");
    expect(second.canvas.getByRole("radio", { name: "Part below the plane" })).toHaveAttribute("aria-checked", "true");
    expect(second.pci.getResponse()).toEqual(first.pci.getResponse());
    expect(second.changes).toHaveLength(0);
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: planeRecord({ offset: 1, tilt: 90, turn: 0 }) } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("the bound response's plane is shown", async () => {
      await waitFor(() => expect(canvas.getByRole("slider", { name: "Move" })).toHaveValue("1"));
      expect(shapeName(canvas)).toBe("Square");
      expect(field(pci.getResponse(), "plane")).toEqual({ string: '{"offset":1,"tilt":90,"turn":0}' });
    });
    await step("setResponse with the plane as text", async () => {
      pci.setResponse({ base: { string: "0 45 0" } });
      await waitFor(() => expect(shapeName(canvas)).toBe("Rectangle"));
    });
    await step("resetResponse: the start plane", async () => {
      pci.resetResponse();
      await waitFor(() => expect(shapeName(canvas)).toBe("Square"));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: { status: "solution", state: JSON.stringify({ state: { plane: { offset: 0, tilt: 30, turn: 0 }, changed: true }, log: [] }) },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the author's solution plane replaces the candidate's; nothing to change
    await waitFor(() => expect(shapeName(canvas)).toBe("Regular hexagon"));
    expect(canvas.getByRole("slider", { name: "Tilt" })).toBeDisabled();
    expect(canvas.queryByRole("button", { name: "Start again" })).toBeNull();
    expect(canvas.queryByRole("radio", { name: "Three points" })).toBeNull();
    expect(field(pci.getResponse(), "correct")).toEqual({ integer: 1 });
  },
};

export const SolutionFromTheDeclaration: Story = {
  args: {
    status: "solution",
    responseDeclaration: { cardinality: "record", correctResponse: { value: [{ fieldIdentifier: "plane", value: '{"offset":4,"tilt":54.7356,"turn":45}' }] } },
  },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    await waitFor(() => expect(shapeName(canvas)).toBe("Equilateral triangle"));
  },
};

/** Two interactions of this type on one page: each has its own plane and response. */
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
    await slide(first.canvas.getByRole("slider", { name: "Tilt" }), 45);
    await slide(second.canvas.getByRole("slider", { name: "Move" }), 2);
    expect(shapeName(first.canvas)).toBe("Rectangle");
    expect(shapeName(second.canvas)).toBe("Square");
    expect(field(first.pci.getResponse(), "plane")).toEqual({ string: '{"offset":0,"tilt":45,"turn":0}' });
    expect(field(second.pci.getResponse(), "plane")).toEqual({ string: '{"offset":2,"tilt":0,"turn":0}' });
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

    await step("starts from the example: a cube, a regular hexagon, valid", async () => {
      expect(instance.getProperties()).toMatchObject({ solid: "cube", dimensions: "6", targetShape: "regularHexagon", solutionPlane: "0 54.7356 45" });
      expect(instance.validate()).toEqual([]);
      expect(canvas.getByRole("tab", { name: "Solid" })).toHaveAttribute("aria-selected", "true");
    });

    await step("a box of 8 by 4 by 6", async () => {
      await userEvent.selectOptions(canvas.getByTestId("solid"), "Box");
      expect(instance.getProperties().dimensions).toBe("8 4 6");
      await enter(canvas.getByRole("textbox", { name: "Length (cm)" }), "10");
      expect(instance.getProperties().dimensions).toBe("10 4 6");
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("a target that the solid cannot give is a problem", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Target" }));
      await userEvent.selectOptions(canvas.getByTestId("target-shape"), "Circle");
      expect(instance.validate()).toContain("No plane found that cuts a circle from this box: check the target.");
    });

    await step("set the plane in the preview and use its cross-section as the target", async () => {
      await slide(canvas.getByRole("slider", { name: "Tilt" }), 90);
      await userEvent.click(canvas.getByRole("button", { name: "Use this cross-section as the target" }));
      expect(instance.getProperties()).toMatchObject({ targetShape: "rectangle", targetLengths: "4 6", solutionPlane: "0 90 0" });
      expect(canvas.getByTestId("summary")).toHaveTextContent("This plane scores 2 of 2.");
      expect(instance.validate()).toEqual([]);
    });

    await step("the controls: without any, a problem", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Controls" }));
      for (const name of ["Move the plane (slider)", "Tilt the plane (slider)", "Turn the plane (slider)", "Handles in the 3D view", "Three points on edges"])
        await userEvent.click(canvas.getByRole("checkbox", { name }));
      expect(instance.getProperties().controls).toBe("hide");
      expect(instance.validate()).toContain("Answer mode, but the candidate cannot move the plane.");
    });
  },
};

export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { targetShape: "", solutionPlane: "" } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("tab", { name: "Figuur" })).toBeInTheDocument();
    expect(instance.validate()).toEqual(["Antwoordmodus zonder doel: er valt niets te scoren."]);
  },
};
