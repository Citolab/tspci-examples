import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { afterPaint, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Light and shadow",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Record = { record: { name: string; base: { integer?: number; float?: number; string?: string } | null }[] } | undefined;
/** A field of the record response. */
const field = (response: unknown, name: string) => (response as Record)?.record.find((f) => f.name === name)?.base;

/**
 * Sets a range input as the candidate does when they let go (user-event's arrow keys do not move a native range):
 * the value, an input and a change event.
 */
const slide = async (input: HTMLElement, value: number) => {
  (input as HTMLInputElement).value = String(value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await afterPaint();
};

/** The example's lamp slider: "Lamp: distance to the screen". */
const lampSlider = (canvas: MountedPci["canvas"]) => canvas.getByRole("slider", { name: "Lamp: distance to the screen" });

/** Two point lamps side by side and a block that can move: the umbra disappears when the shadows part. */
const TWO_LAMPS = JSON.stringify({
  screen: { width: 240, height: 180 }, step: 5,
  lamps: [{ x: 300, y: 75, z: -30, size: 0, move: {} }, { x: 300, y: 75, z: 30, size: 0, move: {} }],
  object: { type: "block", x: 100, elevation: 60, width: 20, height: 30, depth: 10, move: [20, 250] },
  targets: [{ field: "umbraWidth", value: 0, margin: 0, points: 1 }],
  solution: { lamps: [{ x: 300, y: 75, z: -30 }, { x: 300, y: 75, z: 30 }], objectX: 200 },
});
/** A round lamp and a ball: umbra and penumbra; the target a shadow 60 cm wide. */
const ROUND_LAMP = JSON.stringify({
  screen: { width: 240, height: 180 }, step: 5,
  lamps: [{ x: 320, y: 90, z: 0, size: 30, move: { x: [150, 400] } }],
  object: { type: "ball", x: 110, elevation: 70, width: 40, move: [40, 140] },
  targets: [{ field: "shadowWidth", value: 60, margin: 1.5, points: 1 }],
  solution: null,
});

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText(/^Move the lamp so that the shadow/)).toBeInTheDocument();
    expect(canvas.getByRole("region", { name: "Light and shadow" })).toBeInTheDocument();
    expect(canvas.getByRole("application", { name: "3D view of the room" })).toBeInTheDocument();
    expect(canvas.getByRole("img", { name: /^Side view/ })).toBeInTheDocument();
    expect(lampSlider(canvas)).toHaveAttribute("aria-valuetext", "300.0 cm");
    expect(canvas.getByTestId("fixed")).toHaveTextContent("Figure (20.0 cm wide, 40.0 cm high): distance to the screen 100.0 cm");
    expect(canvas.getByRole("rowheader", { name: "Whole shadow" }).parentElement).toHaveTextContent("60.0 cm30.0 cm");
    expect(canvas.getByTestId("magnification")).toHaveTextContent("1.50");
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const MoveWithTheSlider: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await step("the lamp at 200 cm: the shadow is twice as tall", async () => {
      await slide(lampSlider(canvas), 200);
      expect(canvas.getByTestId("magnification")).toHaveTextContent("2.00");
      expect(canvas.getByTestId("live")).toHaveTextContent("Shadow 80.0 cm high, 40.0 cm wide, umbra 80.0 cm high.");
      const r = await lastChange(mounted);
      expect(field(r, "lamp1Distance")).toEqual({ float: 200 });
      expect(field(r, "correct")).toEqual({ integer: 1 });
    });
    await step("a value between the steps snaps to the step", async () => {
      await slide(lampSlider(canvas), 233);
      expect(field(pci.getResponse(), "lamp1Distance")).toEqual({ float: 235 });
      expect(field(pci.getResponse(), "score")).toEqual({ integer: 0 });
    });
  },
};

export const MoveWithTheButtonsAndKeys: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("− and + move by one step", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Lamp: distance to the screen: less" }));
      expect(field(pci.getResponse(), "lamp1Distance")).toEqual({ float: 295 });
      await userEvent.click(canvas.getByRole("button", { name: "Lamp: distance to the screen: more" }));
      expect(field(pci.getResponse(), "lamp1Distance")).toEqual({ float: 300 });
    });
    await step("the slider's own keys: arrows a step, Page Down five, Home and End the ends", async () => {
      lampSlider(canvas).focus();
      await userEvent.keyboard("{ArrowLeft}{PageDown}");
      expect(field(pci.getResponse(), "lamp1Distance")).toEqual({ float: 270 });
      await userEvent.keyboard("{Home}");
      expect(field(pci.getResponse(), "lamp1Distance")).toEqual({ float: 120 });
      expect(canvas.getByRole("button", { name: "Lamp: distance to the screen: less" })).toBeDisabled();
      await userEvent.keyboard("{End}");
      expect(field(pci.getResponse(), "lamp1Distance")).toEqual({ float: 400 });
    });
    await step("the 3D view turns with the keyboard and its buttons", async () => {
      const view = canvas.getByRole("application", { name: "3D view of the room" });
      const scene = (view as any).__lightScene;
      const start = scene.view.theta;
      view.focus();
      await userEvent.keyboard("{ArrowLeft}");
      expect(scene.view.theta).toBeGreaterThan(start);
      await userEvent.click(canvas.getByRole("button", { name: "Back to the start view" }));
      expect(scene.view.theta).toBe(start);
      const radius = scene.view.radius;
      await userEvent.click(canvas.getByRole("button", { name: "Zoom in" }));
      expect(scene.view.radius).toBeCloseTo(radius * 0.8, 6);
    });
  },
};

export const DragInTheDrawing: Story = {
  args: { properties: { view: "2d" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.queryByRole("application")).toBeNull();
    const lamp = canvas.getByTestId("drawing-lamp-0");
    const svg = canvas.getByRole("img", { name: /^Side view/ }) as unknown as SVGSVGElement;
    const r = lamp.getBoundingClientRect();
    const perCm = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    const at = (dx: number) => ({ clientX: r.left + r.width / 2 + dx, clientY: r.top + r.height / 2, bubbles: true, composed: true, pointerId: 1, button: 0 });
    lamp.dispatchEvent(new PointerEvent("pointerdown", at(0)));
    svg.dispatchEvent(new PointerEvent("pointermove", at(100 * perCm)));
    svg.dispatchEvent(new PointerEvent("pointerup", at(100 * perCm)));
    await afterPaint();
    // 100 cm to the right is 100 cm nearer the screen
    expect(field(pci.getResponse(), "lamp1Distance")).toEqual({ float: 200 });
    expect(field(pci.getResponse(), "correct")).toEqual({ integer: 1 });
  },
};

export const TopView: Story = {
  args: { properties: { view: "2d", scene: TWO_LAMPS } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: "Top view" }));
    expect(canvas.getByRole("radio", { name: "Top view" })).toHaveAttribute("aria-checked", "true");
    expect(canvas.getByRole("img", { name: /^Top view/ })).toBeInTheDocument();
    // two shadows that overlap: an umbra in the middle, a penumbra per lamp
    expect(canvas.getByTestId("umbra-top")).toBeInTheDocument();
    expect(canvas.getByTestId("penumbra-top-0")).toBeInTheDocument();
    expect(canvas.getByTestId("penumbra-top-1")).toBeInTheDocument();
  },
};

export const TwoLampsUmbraDisappears: Story = {
  args: { properties: { scene: TWO_LAMPS, prompt: "Move the block so that the umbra disappears." } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const slider = canvas.getByRole("slider", { name: "Block: distance to the screen" });
    await step("near the screen the shadows overlap: an umbra", async () => {
      await slide(slider, 100);
      expect(Number(field(pci.getResponse(), "umbraWidth")?.float)).toBeGreaterThan(0);
      expect(field(pci.getResponse(), "correct")).toEqual({ integer: 0 });
    });
    await step("nearer the lamps the shadows part: no umbra", async () => {
      await slide(slider, 200);
      expect(field(pci.getResponse(), "umbraWidth")).toEqual({ float: 0 });
      expect(field(pci.getResponse(), "umbraHeight")).toEqual({ float: 0 });
      expect(field(pci.getResponse(), "correct")).toEqual({ integer: 1 });
      expect(canvas.getByRole("rowheader", { name: "Umbra" }).parentElement).toHaveTextContent("0.0 cm0.0 cm");
    });
    await step("the block cannot come into the lamps", async () => {
      await slide(slider, 999);
      expect(field(pci.getResponse(), "objectDistance")).toEqual({ float: 250 });
      expect(field(pci.getResponse(), "lamp2Side")).toEqual({ float: 30 });
    });
  },
};

export const RoundLampPenumbra: Story = {
  args: { properties: { scene: ROUND_LAMP, prompt: "Make the shadow on the screen 60 cm wide." } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByTestId("fixed")).toHaveTextContent("Lamp (round lamp, 30.0 cm across): height 90.0 cm");
    expect(canvas.getByRole("rowheader", { name: "Penumbra" }).parentElement).toHaveTextContent("32.3 cm32.3 cm");
    await slide(canvas.getByRole("slider", { name: "Ball: distance to the screen" }), 70);
    const r = pci.getResponse();
    expect(field(r, "shadowWidth")?.float).toBeCloseTo(60, 0);
    expect(field(r, "correct")).toEqual({ integer: 1 });
    expect(Number(field(r, "penumbraWidth")?.float)).toBeGreaterThan(0);
  },
};

export const WithoutMeasurementsOrRays: Story = {
  args: { properties: { showMeasurements: "false", showRays: "false", view: "2d" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    // the candidate reads the shadow off the ruler on the screen
    expect(canvas.queryByTestId("measurements")).toBeNull();
    expect(canvas.queryByTestId("dimension-side")).toBeNull();
    expect(canvas.queryByText("Light rays")).toBeNull();
    expect(canvas.getByTestId("umbra-side")).toBeInTheDocument();
  },
};

export const ToolMode: Story = {
  args: { properties: { mode: "tool", prompt: "Explore light and shadow." } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await slide(lampSlider(canvas), 250);
    await slide(lampSlider(canvas), 150);
    const r = pci.getResponse();
    expect(field(r, "score")).toBeUndefined();
    expect(JSON.parse(field(r, "tried")!.string!)).toEqual([
      { lamps: [{ x: 250, y: 90, z: 0 }], objectX: 100 },
      { lamps: [{ x: 150, y: 90, z: 0 }], objectX: 100 },
    ]);
    expect(field(r, "shadowHeight")).toEqual({ float: 120 });
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", prompt: "Zet de lamp zo dat de schaduw twee keer zo groot is als het poppetje." } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const slider = canvas.getByRole("slider", { name: "Lamp: afstand tot het scherm" });
    expect(slider).toHaveAttribute("aria-valuetext", "300,0 cm");
    expect(canvas.getByRole("rowheader", { name: "Kernschaduw" })).toBeInTheDocument();
    expect(canvas.getByRole("rowheader", { name: "Halfschaduw" })).toBeInTheDocument();
    expect(canvas.getByTestId("magnification")).toHaveTextContent("Schaduwhoogte ÷ voorwerphoogte1,50");
    await slide(slider, 250);
    expect(canvas.getByTestId("live")).toHaveTextContent("Lamp: afstand tot het scherm 250,0 cm. Schaduw 66,7 cm hoog");
    // the response stays language independent
    expect(field(pci.getResponse(), "magnification")).toEqual({ float: 1.67 });
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await slide(lampSlider(first.canvas), 200);
    const state = first.pci.getState();
    expect(JSON.parse(state).state.positions).toEqual({ lamps: [{ x: 200, y: 90, z: 0 }], objectX: 100 });

    const second = await remountPci(canvasElement, pci, { state });
    expect(lampSlider(second.canvas)).toHaveAttribute("aria-valuetext", "200.0 cm");
    expect(second.pci.getResponse()).toEqual(first.pci.getResponse());
    expect(second.changes).toHaveLength(0);
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: { record: [{ name: "lamp1Distance", base: { float: 160 } }, { name: "shadowHeight", base: { float: 1 } }] } } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("the bound positions are shown; the shadow follows from them", async () => {
      await waitFor(() => expect(lampSlider(canvas)).toHaveAttribute("aria-valuetext", "160.0 cm"));
      expect(field(pci.getResponse(), "shadowHeight")).toEqual({ float: 106.7 }); // 40 cm · 160 / 60
    });
    await step("resetResponse: the scene as the item starts", async () => {
      pci.resetResponse();
      await waitFor(() => expect(lampSlider(canvas)).toHaveAttribute("aria-valuetext", "300.0 cm"));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: { status: "solution", state: JSON.stringify({ state: { positions: { lamps: [{ x: 350, y: 90, z: 0 }], objectX: 100 }, moved: true, tried: [] }, log: [] }) },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the author's solution replaces the candidate's positions; nothing to change
    await waitFor(() => expect(lampSlider(canvas)).toHaveAttribute("aria-valuetext", "200.0 cm"));
    expect(canvas.getByText("Correct answer")).toBeInTheDocument();
    expect(lampSlider(canvas)).toBeDisabled();
    expect(field(pci.getResponse(), "correct")).toEqual({ integer: 1 });
  },
};

export const SolutionFromTheDeclaration: Story = {
  args: {
    status: "solution",
    responseDeclaration: { cardinality: "record", correctResponse: { value: [{ fieldIdentifier: "lamp1Distance", value: "210" }] } },
  },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    await waitFor(() => expect(lampSlider(canvas)).toHaveAttribute("aria-valuetext", "210.0 cm"));
  },
};

/** Two interactions of this type on one page: each has its own scene and response. */
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
    await slide(lampSlider(first.canvas), 200);
    await slide(lampSlider(second.canvas), 400);
    expect(field(first.pci.getResponse(), "lamp1Distance")).toEqual({ float: 200 });
    expect(field(second.pci.getResponse(), "lamp1Distance")).toEqual({ float: 400 });
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
    const scene = () => JSON.parse(instance.getProperties().scene!);

    await step("starts from the example, without problems", async () => {
      expect(instance.validate!()).toEqual([]);
      expect(canvas.getByText("No problems.")).toBeInTheDocument();
    });

    await step("a ball, and two lamps", async () => {
      await userEvent.selectOptions(canvas.getByTestId("object-type"), "Ball");
      expect(scene().object).toMatchObject({ type: "ball", width: 20, height: 20 });
      await userEvent.click(canvas.getByRole("radio", { name: "Two lamps" }));
      expect(scene().lamps.map((l: { z: number }) => l.z)).toEqual([-40, 40]);
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("the object may not reach the lamps", async () => {
      await userEvent.click(canvas.getByTestId("object-x-movable"));
      await retype(canvas.getByTestId("object-x-to"), "290");
      expect(instance.validate!()).toContain("Lamp 1 can come closer to the screen than the object: keep the lamps farther away than the object can go.");
      await retype(canvas.getByTestId("object-x-to"), "100");
      expect(instance.validate!().some((p) => p.startsWith("Lamp 1"))).toBe(false);
    });

    await step("a target: the umbra gone, and the solution must meet it", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Targets" }));
      await userEvent.selectOptions(canvas.getByTestId("target-0-field"), "Width of the umbra");
      await retype(canvas.getByTestId("target-0-value"), "0");
      await retype(canvas.getByTestId("target-0-margin"), "0");
      expect(scene().targets[0]).toEqual({ field: "umbraWidth", value: 0, margin: 0, points: 1 });
      expect(canvas.getByTestId("response-processing")).toHaveTextContent('field-identifier="umbraWidth"');
    });

    await step("the solution tab: place the ball as a candidate would", async () => {
      expect(scene().object.move).toEqual([50, 100]);
      await userEvent.click(canvas.getByRole("tab", { name: "Solution" }));
      await slide(canvas.getByRole("slider", { name: "Ball: distance to the screen" }), 60);
      expect(scene().solution.objectX).toBe(60);
      expect(canvas.getAllByTestId("summary")[0]).toHaveTextContent(/The solution scores [01] of 1\./);
    });
  },
};

export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { mode: "answer", scene: JSON.stringify({ lamps: [{ x: 300, y: 90 }], object: { type: "figure", x: 100, elevation: 70, width: 20, height: 40 }, targets: [] }) } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("tab", { name: "Opstelling" })).toHaveAttribute("aria-selected", "true");
    expect(instance.validate!()).toEqual([
      "Niets kan bewegen: laat de kandidaat een lamp of het voorwerp verplaatsen.",
      "Er zijn geen doelen: voeg er een toe, of gebruik de PCI als gereedschap.",
    ]);
  },
};
