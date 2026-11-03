import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  afterPaint, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci, type PciArgs,
} from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Measure in 3D",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

// The 3D view is WebGL: the stories measure through the lists and the instance API, not through pixels.

/** The texts of the measurements, in order. */
const measurements = (canvas: MountedPci["canvas"]) => canvas.queryAllByTestId("measurement").map((e) => e.textContent);
/** Measures with the lists: the names of the points (or the face) as the options show them. */
const measure = async (canvas: MountedPci["canvas"], names: string[], button = "Measure") => {
  for (let i = 0; i < names.length; i++) await userEvent.selectOptions(canvas.getByTestId(`select-${i}`), names[i]);
  await userEvent.click(canvas.getByRole("button", { name: button, exact: true } as any));
  await afterPaint();
};
const addTape = (mounted: MountedPci, a: string, b: string) =>
  mounted.pci.store.dispatch({ type: "ADD", payload: { measurement: { tool: "tape", points: [{ id: a }, { id: b }] } } });

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("the ladder, the tools, the scene, the answer field", async () => {
      expect(canvas.getByText(/How long is the ladder\?/)).toBeInTheDocument();
      expect(canvas.getByRole("region", { name: "Measuring in 3D" })).toBeInTheDocument();
      expect(canvas.getByRole("radio", { name: "Measuring tape" })).toBeChecked();
      expect(canvas.getByRole("radio", { name: "Protractor" })).toBeInTheDocument();
      expect(canvas.getByRole("radio", { name: "Area" })).toBeInTheDocument();
      // the scene, or a clear message without WebGL
      expect(canvas.queryByRole("application", { name: /^3D scene/ }) ?? canvas.getByTestId("no-webgl")).toBeInTheDocument();
      expect(canvas.getByText("No measurements yet.")).toBeInTheDocument();
      expect(canvas.getByRole("textbox", { name: "Your answer" })).toHaveValue("");
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("the measurable points are listed: vertices, midpoints, centres", async () => {
      const from = canvas.getByTestId("select-0") as HTMLSelectElement;
      const groups = [...from.querySelectorAll("optgroup")].map((g) => g.label);
      expect(groups).toEqual(["Vertices", "Midpoints of edges", "Centres of faces"]);
      expect([...from.querySelectorAll("optgroup")[0].querySelectorAll("option")].map((o) => o.textContent).join("")).toBe("ABCDEFGHIJKL");
    });

    await step("the tape from A to D: the ladder, 3.42 m, announced", async () => {
      await measure(canvas, ["A", "D"]);
      expect(measurements(canvas)).toEqual(["AD = 3.42 m"]);
      expect(canvas.getByRole("status")).toHaveTextContent("Measured: AD = 3.42 m.");
      // in answer mode, measuring is not answering
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("the typed answer is the response, a float", async () => {
      await userEvent.type(canvas.getByRole("textbox", { name: "Your answer" }), "3.42");
      expect(pci.getResponse()).toEqual({ base: { float: 3.42 } });
      expect(await lastChange(mounted)).toEqual({ base: { float: 3.42 } });
    });
  },
};

export const TapeAndSpaceDiagonal: Story = {
  args: { properties: { prompt: "Measure the space diagonal of the crate." } },
  play: async ({ canvasElement, step }) => {
    const { canvas } = await openPci(canvasElement);
    await step("from E to K, through the crate: √(1.2² + 0.8² + 0.6²)", async () => {
      await measure(canvas, ["E", "K"]);
      expect(measurements(canvas)).toEqual(["EK = 1.56 m"]);
    });
    await step("to a midpoint of an edge", async () => {
      await measure(canvas, ["E", "midpoint of EF"]);
      expect(measurements(canvas)[1]).toBe("E – midpoint of EF = 0.60 m");
    });
    await step("the same point twice is refused, an empty list too", async () => {
      await measure(canvas, ["E", "E"]);
      expect(canvas.getByTestId("list-message")).toHaveTextContent("Choose two different points.");
      await userEvent.selectOptions(canvas.getByTestId("select-1"), "");
      await userEvent.click(canvas.getByRole("button", { name: "Measure" }));
      expect(canvas.getByTestId("list-message")).toHaveTextContent("Choose every point first.");
      expect(measurements(canvas)).toHaveLength(2);
    });
    await step("remove one, then all", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Remove EK = 1.56 m" }));
      expect(measurements(canvas)).toEqual(["E – midpoint of EF = 0.60 m"]);
      await userEvent.click(canvas.getByRole("button", { name: "Remove all measurements" }));
      expect(canvas.getByText("No measurements yet.")).toBeInTheDocument();
      expect(canvas.getByRole("status")).toHaveTextContent("All measurements removed.");
    });
  },
};

const RAMP = JSON.stringify({
  objects: [{ id: "ramp", type: "ramp", name: "Ramp", size: { length: 4, width: 1.2, height: 1 }, position: [0, 0, 0] }],
});
const SLOPE = JSON.stringify({ kind: "angle", points: ["ramp.v2", "ramp.v3", "ramp.v5"] });

export const ProtractorRamp: Story = {
  args: { properties: { scene: RAMP, target: SLOPE, prompt: "What is the slope angle of the ramp?", margin: "0.5", decimals: "1" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await step("the protractor asks for three points; the vertex in the middle", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "Protractor" }));
      expect(canvas.getByTestId("step")).toHaveTextContent("Click a point on the first arm.");
      expect(canvas.getByText("First arm")).toBeInTheDocument();
      expect(canvas.getByText("Vertex")).toBeInTheDocument();
    });
    await step("∠CDF: the slope, 14°, with 1 decimal less than the lengths", async () => {
      await measure(canvas, ["C", "D", "F"]);
      expect(measurements(canvas)).toEqual(["∠CDF = 14°"]);
    });
    await step("the answer has degrees; the correct answer is computed from the geometry", async () => {
      expect(canvas.getByText("°")).toBeInTheDocument();
      expect(pci.getCorrectResponse({ scene: RAMP, target: SLOPE })).toEqual({ base: { float: 14.0362 } });
      await userEvent.type(canvas.getByRole("textbox", { name: "Your answer" }), "14");
      expect(pci.getResponse()).toEqual({ base: { float: 14 } });
    });
  },
};

export const AreaTool: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas } = await openPci(canvasElement);
    await step("the area tool lists the faces", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "Area" }));
      expect(canvas.getByTestId("step")).toHaveTextContent("Click a face.");
      await measure(canvas, ["IJKL"]);
      expect(measurements(canvas)).toEqual(["area of IJKL = 0.96 m²"]);
    });
  },
};

export const RulerReading: Story = {
  args: { properties: { reading: "ruler", tickStep: "0.1", angleStep: "5" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    addTape(mounted, "ladder.v0", "ladder.v3");
    await afterPaint();
    // the candidate reads between two tick marks and rounds
    expect(measurements(mounted.canvas)).toEqual(["AD: between 3.4 and 3.5 m"]);
  },
};

export const ScaleToConvert: Story = {
  args: { properties: { scale: "50", unit: "cm", toolScale: "false", prompt: "The model is drawn to scale. How long is the real ladder in cm?", margin: "3" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.canvas.getByTestId("scale")).toHaveTextContent("Scale: 1 unit = 50 cm");
    addTape(mounted, "ladder.v0", "ladder.v3");
    await afterPaint();
    expect(measurements(mounted.canvas)).toEqual(["AD = 3.42 units"]);
    expect(mounted.pci.getCorrectResponse({ scale: "50", unit: "cm", toolScale: "false" })).toEqual({ base: { float: 170.8801 } });
  },
};

export const AnswerInput: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const field = canvas.getByRole("textbox", { name: "Your answer" });
    await step("letters are not typed", async () => {
      await userEvent.type(field, "3a,4b2");
      expect(field).toHaveValue("3,42");
      expect(pci.getResponse()).toEqual({ base: { float: 3.42 } });
    });
    await step("half a number is no response", async () => {
      await retype(field, ",");
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(canvas.getByText("That is not a number.")).toBeInTheDocument();
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const ToolMode: Story = {
  args: { properties: { mode: "tool", prompt: "Measure what you need; answer the questions below." } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await step("no answer field: the answer goes elsewhere", async () => {
      expect(canvas.queryByRole("textbox", { name: "Your answer" })).toBeNull();
      expect(pci.getResponse()).toBeUndefined();
    });
    await step("the measurements are the response, as JSON", async () => {
      await measure(canvas, ["E", "K"]);
      const report = JSON.parse(pci.getResponse()!.base.string);
      expect(report).toEqual({
        unit: "m",
        scale: 1,
        measurements: [{ tool: "tape", points: [{ id: "crate.v0" }, { id: "crate.v6" }], names: ["E", "K"], value: 1.562 }],
      });
      expect(await lastChange(mounted)).toEqual(pci.getResponse());
    });
    await step("a tool has no correct response", async () => {
      expect(pci.getCorrectResponse({ mode: "tool" })).toBeUndefined();
    });
  },
};

export const PciScoring: Story = {
  args: { properties: { scoring: "pci", requireMeasurement: "true" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    const field = (name: string) => pci.getResponse()!.record.find((f: any) => f.name === name).base;
    await step("the right value without the measurement: 0 points", async () => {
      await userEvent.type(canvas.getByRole("textbox", { name: "Your answer" }), "3.4");
      expect(field("correct")).toEqual({ integer: 1 });
      expect(field("measured")).toEqual({ integer: 0 });
      expect(field("score")).toEqual({ integer: 0 });
      expect(field("maxscore")).toEqual({ integer: 1 });
    });
    await step("after measuring the ladder (either way): 1 point", async () => {
      await measure(canvas, ["D", "A"]);
      expect(field("measured")).toEqual({ integer: 1 });
      expect(field("score")).toEqual({ integer: 1 });
      expect(field("value")).toEqual({ float: 3.4 });
    });
    await step("off by more than the margin: 0", async () => {
      await retype(canvas.getByRole("textbox", { name: "Your answer" }), "3.5");
      expect(field("score")).toEqual({ integer: 0 });
    });
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText(/Hoe lang is de ladder\?/)).toBeInTheDocument();
    expect(canvas.getByRole("radio", { name: "Meetlint" })).toBeChecked();
    await measure(canvas, ["A", "D"], "Meten");
    expect(measurements(canvas)).toEqual(["AD = 3,42 m"]);
    expect(canvas.getByRole("status")).toHaveTextContent("Gemeten: AD = 3,42 m.");
    await userEvent.type(canvas.getByRole("textbox", { name: "Jouw antwoord" }), "3,42");
    // the response does not depend on the language
    expect(pci.getResponse()).toEqual({ base: { float: 3.42 } });
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement, step }) => {
    const first = await openPci(canvasElement);
    await measure(first.canvas, ["A", "D"]);
    await userEvent.type(first.canvas.getByRole("textbox", { name: "Your answer" }), "3.42");
    const state = first.pci.getState();
    await step("a new session gets the measurements and the answer back", async () => {
      const second = await remountPci(canvasElement, pci, { state });
      expect(measurements(second.canvas)).toEqual(["AD = 3.42 m"]);
      expect(second.canvas.getByRole("textbox", { name: "Your answer" })).toHaveValue("3.42");
      expect(second.pci.getResponse()).toEqual({ base: { float: 3.42 } });
      expect(JSON.parse(second.pci.getState()).log.length).toBeGreaterThan(1);
    });
    await step("a broken state starts empty", async () => {
      const third = await remountPci(canvasElement, pci, { state: "{nope" });
      expect(third.canvas.getByText("No measurements yet.")).toBeInTheDocument();
    });
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: { base: { float: 3.4 } } }, properties: { language: "nl" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci, changes } = await openPci(canvasElement);
    expect(canvas.getByRole("textbox", { name: "Jouw antwoord" })).toHaveValue("3,4");
    expect(pci.getResponse()).toEqual({ base: { float: 3.4 } });
    expect(changes).toHaveLength(0); // what the player handed over is no change
  },
};

export const Solution: Story = {
  args: { status: "solution", responseDeclaration: { baseType: "float", cardinality: "single", correctResponse: { value: ["3.4176"] } } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    expect(canvas.getByTestId("correct")).toHaveTextContent("Correct answer: 3.42 m");
    expect(canvas.getByRole("textbox", { name: "Your answer" })).toHaveValue("3.4176");
    expect(canvas.getByRole("textbox", { name: "Your answer" })).toHaveAttribute("readonly");
    expect(canvas.getByRole("button", { name: "Measure" })).toBeDisabled();
    expect(canvas.getByTestId("step")).toHaveTextContent("Review");
  },
};

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
    await measure(first.canvas, ["A", "D"]);
    await userEvent.type(second.canvas.getByRole("textbox", { name: "Your answer" }), "1.5");
    expect(measurements(first.canvas)).toEqual(["AD = 3.42 m"]);
    expect(measurements(second.canvas)).toEqual([]);
    expect(first.pci.getResponse()).toBeUndefined();
    expect(second.pci.getResponse()).toEqual({ base: { float: 1.5 } });
  },
};

export const ViewControls: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const scene = pci.scene3d();
    if (!scene) {
      // no WebGL here: the message, and the lists still measure
      expect(canvas.getByTestId("no-webgl")).toBeInTheDocument();
      return;
    }
    const start = scene.view();
    await userEvent.click(canvas.getByRole("button", { name: "Turn right" }));
    expect(scene.view().azimuth).not.toBe(start.azimuth);
    await userEvent.click(canvas.getByRole("button", { name: "Zoom out" }));
    expect(scene.view().distance).toBeGreaterThan(start.distance);
    await userEvent.click(canvas.getByRole("button", { name: "Back to the start view" }));
    expect(scene.view().azimuth).toBe(start.azimuth);
    // the keyboard turns it too
    const app = canvas.getByRole("application");
    // (userEvent.keyboard does not reach into a shadow root: the key goes to the scene as the browser sends it)
    app.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    await waitFor(() => expect(scene.view().azimuth).not.toBe(start.azimuth));
  },
};

export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", width: 1100 },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);
    await step("starts from the example: the ladder, no problems", async () => {
      expect(JSON.parse(instance.getProperties().target)).toEqual({ kind: "length", points: ["ladder.v0", "ladder.v3"] });
      expect(instance.validate()).toEqual([]);
      expect(JSON.parse(instance.getProperties().scene).objects).toHaveLength(3);
    });
    await step("add a tank", async () => {
      await userEvent.selectOptions(canvas.getByTestId("new-type"), "Tank");
      await userEvent.click(canvas.getByRole("button", { name: "Add" }));
      const objects = JSON.parse(instance.getProperties().scene).objects;
      expect(objects[3]).toMatchObject({ id: "cylinder1", type: "cylinder", size: { radius: 0.4, height: 1 } });
      expect(changes.length).toBeGreaterThan(0);
    });
    await step("the task: the volume of the tank, computed", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Task" }));
      await userEvent.selectOptions(canvas.getByTestId("target-kind"), "The volume of an object");
      await userEvent.selectOptions(canvas.getByTestId("target-object"), "Tank (cylinder1)");
      expect(JSON.parse(instance.getProperties().target)).toEqual({ kind: "volume", object: "cylinder1" });
      expect(canvas.getByTestId("authoring-correct")).toHaveTextContent("Correct answer: 0.50 m³");
      expect(canvas.getByTestId("response-processing").textContent).toContain('tolerance="0.05"');
    });
    await step("mode, tools and margin", async () => {
      await userEvent.click(canvas.getByTestId("tool-area"));
      expect(instance.getProperties().tools).toBe("tape,protractor");
      await retype(canvas.getByTestId("margin"), "0,02");
      canvas.getByTestId("margin").dispatchEvent(new Event("change", { bubbles: true }));
      expect(instance.getProperties().margin).toBe("0.02");
      await userEvent.click(canvas.getByTestId("mode-tool"));
      expect(instance.getProperties().mode).toBe("tool");
    });
    await step("validate: two points with the same name", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Point names" }));
      await userEvent.type(canvas.getByTestId("name-ladder.v1"), "A");
      expect(instance.validate()).toEqual(["Two points are called A."]);
      expect(JSON.parse(instance.getProperties().scene).names).toEqual({ "ladder.v1": "A" });
    });
  },
};

export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { scene: RAMP } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    // a scene of its own without a task: the problem in the author's language
    expect(instance.validate()).toEqual(["Kies wat de kandidaat meet (Opdracht), of maak de PCI een hulpmiddel."]);
    await userEvent.click(canvas.getByRole("tab", { name: "Opdracht" }));
    await userEvent.selectOptions(canvas.getByTestId("target-kind"), "Een hoek (bij het middelste punt)");
    await userEvent.selectOptions(canvas.getByTestId("target-0"), "C");
    await userEvent.selectOptions(canvas.getByTestId("target-1"), "D");
    await userEvent.selectOptions(canvas.getByTestId("target-2"), "F");
    expect(canvas.getByTestId("authoring-correct")).toHaveTextContent("Goed antwoord: 14,04°");
    expect(instance.validate()).toEqual([]);
  },
};
