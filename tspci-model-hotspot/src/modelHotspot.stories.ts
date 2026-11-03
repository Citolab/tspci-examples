import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, fireEvent, userEvent, waitFor } from "storybook/test";
import { afterPaint, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "3D model hotspot",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Canvas = MountedPci["canvas"];
const part = (canvas: Canvas, name: string) => canvas.getByRole("button", { name });
const status = (canvas: Canvas) => canvas.getByTestId("status");
/** A native range input: set the value and fire input (userEvent arrow keys do not move it). */
const slide = async (input: HTMLElement, value: number) => {
  (input as HTMLInputElement).value = String(value);
  await fireEvent.input(input);
  await afterPaint();
};
/** The 3D scene, when the browser has WebGL (for picking by raycasting); null without. */
const sceneOf = (canvas: Canvas) => (canvas.getByTestId("model") as any).hotspotScene ?? null;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByTestId("prompt")).toHaveTextContent(/changes shape to focus/);
    expect(canvas.getByTestId("model")).toBeInTheDocument();
    expect(canvas.getByTestId("schematic")).toHaveTextContent("Schematic model");
    // the accessible alternative: every part, by letter, without the names (they would give the answer away)
    expect(canvas.getAllByRole("button", { name: /^Part [A-H]$/ })).toHaveLength(8);
    expect(canvas.queryByText("Lens")).toBeNull();
    expect(canvas.getByRole("slider", { name: /Pull apart/ })).toBeInTheDocument();
    expect(canvas.getByRole("slider", { name: /Cut open/ })).toBeInTheDocument();
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const ClickFromTheList: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await step("a part from the list: the identifier as response", async () => {
      await userEvent.click(part(canvas, "Part D"));
      expect(part(canvas, "Part D")).toHaveAttribute("aria-pressed", "true");
      expect(status(canvas)).toHaveTextContent("Part D chosen.");
      expect(await lastChange(mounted)).toEqual({ base: { identifier: "lens" } });
    });
    await step("one choice: another part replaces it, the same one takes it back", async () => {
      await userEvent.click(part(canvas, "Part B"));
      expect(pci.getResponse()).toEqual({ base: { identifier: "iris" } });
      expect(part(canvas, "Part D")).toHaveAttribute("aria-pressed", "false");
      await userEvent.click(part(canvas, "Part B"));
      expect(pci.getResponse()).toBeUndefined();
      expect(status(canvas)).toHaveTextContent("Part B no longer chosen.");
    });
  },
};

export const ClickInTheModel: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const scene = sceneOf(canvas);
    if (!scene) return; // no WebGL here: the list (above) is the way
    await waitFor(() => expect(scene.pointOn("cornea")).not.toBeNull());
    const at = scene.pointOn("cornea");
    const target = scene.canvas as HTMLCanvasElement;
    const event = { clientX: at.x, clientY: at.y, bubbles: true, pointerId: 1, button: 0, isPrimary: true };
    target.dispatchEvent(new PointerEvent("pointerdown", event));
    target.dispatchEvent(new PointerEvent("pointerup", event));
    await afterPaint();
    expect(pci.getResponse()).toEqual({ base: { identifier: "cornea" } });
    expect(part(canvas, "Part A")).toHaveAttribute("aria-pressed", "true");
  },
};

/** A click on the canvas as the candidate makes it (pointer down and up on one spot). */
const clickAt = async (scene: any, at: { x: number; y: number }) => {
  const target = scene.canvas as HTMLCanvasElement;
  const event = { clientX: at.x, clientY: at.y, bubbles: true, pointerId: 1, button: 0, isPrimary: true };
  target.dispatchEvent(new PointerEvent("pointerdown", event));
  target.dispatchEvent(new PointerEvent("pointerup", event));
  await afterPaint();
};

export const ClickThroughSeeThroughParts: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const scene = sceneOf(canvas);
    if (!scene) return; // no WebGL here: the list is the way
    await step("the iris behind the cornea: the first click the cornea, the second the iris", async () => {
      const spot = await waitFor(() => {
        const found = scene.pointBehind("iris");
        if (!found) throw new Error("the iris is not on the canvas yet");
        return found;
      });
      expect(spot.clicks).toBe(2);
      await clickAt(scene, spot);
      expect(pci.getResponse()).toEqual({ base: { identifier: "cornea" } });
      // the tag of the part the next click chooses
      expect(canvas.getByTestId("model").parentElement!.querySelector("[data-kind=pointed]")).toHaveAttribute("data-part", "iris");
      await clickAt(scene, spot);
      expect(pci.getResponse()).toEqual({ base: { identifier: "iris" } });
      expect(status(canvas)).toHaveTextContent("Part B chosen.");
    });
    await step("the lens through the cornea and the pupil: three clicks", async () => {
      const spot = scene.pointBehind("lens");
      expect(spot.clicks).toBe(3);
      for (let i = 0; i < 3; i++) await clickAt(scene, spot);
      expect(pci.getResponse()).toEqual({ base: { identifier: "lens" } });
    });
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const model = canvas.getByTestId("model");
    await step("Page Down goes from part to part, Enter chooses", async () => {
      model.focus();
      await userEvent.keyboard("{PageDown}");
      expect(status(canvas)).toHaveTextContent("Part A.");
      await userEvent.keyboard("{PageDown}{PageDown}{PageDown}{Enter}");
      expect(pci.getResponse()).toEqual({ base: { identifier: "lens" } });
      await userEvent.keyboard("{PageUp} ");
      expect(pci.getResponse()).toEqual({ base: { identifier: "pupil" } });
    });
    await step("the arrow keys turn the model, + zooms, Home goes back", async () => {
      if (model.dataset.view !== "3d") return;
      await userEvent.keyboard("{ArrowLeft}{ArrowUp}");
      expect(model).toHaveAttribute("data-turns", "2");
      const scene = sceneOf(canvas);
      await userEvent.keyboard("+");
      expect(scene.pose.zoom).toBeGreaterThan(1);
      await userEvent.keyboard("{Home}");
      expect(model).toHaveAttribute("data-turns", "0");
      expect(scene.pose.zoom).toBe(1);
    });
  },
};

export const ViewingAids: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas } = await openPci(canvasElement);
    const scene = sceneOf(canvas);
    await step("pull apart and cut open: sliders with a value text", async () => {
      await slide(canvas.getByRole("slider", { name: /Pull apart/ }), 60);
      expect(canvas.getByRole("slider", { name: /Pull apart/ })).toHaveAttribute("aria-valuetext", "60%");
      await slide(canvas.getByRole("slider", { name: /Cut open/ }), 100);
      expect(canvas.getByRole("slider", { name: /Cut open/ })).toHaveAttribute("aria-valuetext", "100%");
      if (scene) expect(scene.pointOn("retina")).not.toBeNull(); // cut open, the inside can be clicked
    });
    await step("hide a part; show all", async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: "Show Part A" }));
      expect(canvas.getByRole("checkbox", { name: "Show Part A" })).not.toBeChecked();
      expect(canvas.getByTestId("parts").querySelector("li[data-part=cornea]")).toHaveTextContent("(hidden)");
      await userEvent.click(canvas.getByRole("button", { name: "Show all" }));
      expect(canvas.getByRole("checkbox", { name: "Show Part A" })).toBeChecked();
    });
  },
};

export const MoreParts: Story = {
  args: { properties: { model: "cell", cardinality: "multiple", maxChoices: "2", showNames: "true" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByTestId("prompt")).toHaveTextContent(/photosynthesis/);
    await userEvent.click(part(canvas, "Part F: Chloroplast"));
    await userEvent.click(part(canvas, "Part E: Nucleus"));
    expect(pci.getResponse()).toEqual({ list: { identifier: ["nucleus", "chloroplast"] } });
    expect(canvas.getByTestId("count")).toHaveTextContent("2 parts chosen");
    await userEvent.click(part(canvas, "Part D: Vacuole"));
    expect(status(canvas)).toHaveTextContent("You can choose at most 2 parts.");
    expect(pci.getResponse()).toEqual({ list: { identifier: ["nucleus", "chloroplast"] } });
  },
};

export const LabelMode: Story = {
  args: { properties: { model: "flower", mode: "label" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await step("a label per part name, a list per part", async () => {
      expect(canvas.getByRole("group", { name: "Labels" })).toBeInTheDocument();
      expect(canvas.getAllByRole("combobox")).toHaveLength(9);
    });
    await step("pick a label, then the part in the list", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Petal" }));
      expect(canvas.getByRole("button", { name: "Petal" })).toHaveAttribute("aria-pressed", "true");
      await userEvent.click(canvas.getByTestId("parts").querySelector<HTMLElement>("li[data-part=petal] button")!);
      expect(await lastChange(mounted)).toEqual({ list: { directedPair: [["petal", "petal"]] } });
      expect(canvas.getByRole("button", { name: "Petal, on A" })).toBeInTheDocument();
    });
    await step("the list next to a part; one label per part", async () => {
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Label on Part B" }), "anther");
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Label on Part B" }), "sepal");
      expect(pci.getResponse()).toEqual({ list: { directedPair: [["petal", "petal"], ["sepal", "sepal"]] } });
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Label on Part A" }), "");
      expect(status(canvas)).toHaveTextContent("“Petal” taken off.");
      expect(pci.getResponse()).toEqual({ list: { directedPair: [["sepal", "sepal"]] } });
    });
  },
};

export const Dutch: Story = {
  args: { properties: { model: "bike", language: "nl", showNames: "true" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByTestId("prompt")).toHaveTextContent(/trappers/);
    expect(canvas.getByTestId("schematic")).toHaveTextContent("Schematisch model");
    await userEvent.click(part(canvas, "Deel I: Ketting"));
    expect(status(canvas)).toHaveTextContent("Deel I: Ketting gekozen.");
    expect(canvas.getByRole("slider", { name: /Uit elkaar halen/ })).toBeInTheDocument();
    expect(pci.getResponse()).toEqual({ base: { identifier: "chain" } });
  },
};

export const RestoresState: Story = {
  args: { properties: { mode: "label" } },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.selectOptions(first.canvas.getByRole("combobox", { name: "Label on Part D" }), "lens");
    const state = first.pci.getState();
    const second = await remountPci(canvasElement, pci, { properties: { mode: "label" }, state });
    expect(second.pci.getResponse()).toEqual({ list: { directedPair: [["lens", "lens"]] } });
    expect(second.canvas.getByRole("combobox", { name: "Label on Part D" })).toHaveValue("lens");
  },
};

export const BoundResponse: Story = {
  args: { properties: { cardinality: "multiple" }, boundTo: { RESPONSE: { list: { identifier: ["retina", "cornea"] } } } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(pci.getResponse()).toEqual({ list: { identifier: ["cornea", "retina"] } });
    expect(part(canvas, "Part A")).toHaveAttribute("aria-pressed", "true");
    expect(part(canvas, "Part F")).toHaveAttribute("aria-pressed", "true");
  },
};

export const Solution: Story = {
  args: { status: "solution", properties: { model: "flower" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // no declaration: the correct answer of the settings (the anther), read-only
    expect(pci.getResponse()).toEqual({ base: { identifier: "anther" } });
    expect(part(canvas, "Part D")).toHaveAttribute("aria-pressed", "true");
    expect(part(canvas, "Part A")).toBeDisabled();
  },
};

export const SolutionFromTheDeclaration: Story = {
  args: {
    status: "solution",
    properties: { mode: "label" },
    responseDeclaration: { cardinality: "multiple", baseType: "directedPair", correctResponse: { value: ["lens lens", "retina retina"] } },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(pci.getResponse()).toEqual({ list: { directedPair: [["lens", "lens"], ["retina", "retina"]] } });
    expect(canvas.getByRole("combobox", { name: "Label on Part F" })).toHaveValue("retina");
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
    await userEvent.click(part(first.canvas, "Part D"));
    await userEvent.click(part(second.canvas, "Part H"));
    expect(first.pci.getResponse()).toEqual({ base: { identifier: "lens" } });
    expect(second.pci.getResponse()).toEqual({ base: { identifier: "opticNerve" } });
    expect(first.changes).toHaveLength(1);
    expect(second.changes).toHaveLength(1);
    expect(first.root.querySelector("[id$=-keys]")!.id).not.toBe(second.root.querySelector("[id$=-keys]")!.id);
  },
};

export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);
    const setup = () => JSON.parse(instance.getProperties().setup || "{}");
    await step("the example is ready", async () => {
      expect(instance.validate()).toEqual([]);
      expect(canvas.getByTestId("declaration")).toHaveTextContent("<qti-value>lens</qti-value>");
    });
    await step("more parts, the correct ones, a maximum that is too low", async () => {
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "How many parts" }), "multiple");
      await userEvent.click(canvas.getByRole("checkbox", { name: "Correct: retina" }));
      expect(setup().correct).toEqual(["lens", "retina"]);
      await userEvent.type(canvas.getByRole("spinbutton", { name: /At most/ }), "{Backspace}1");
      expect(instance.validate()).toEqual(["2 parts are correct, but the candidate can choose at most 1."]);
      expect(changes.length).toBeGreaterThan(0);
    });
    await step("a part that cannot be chosen, and a name", async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: "Can be chosen: sclera" }));
      expect(setup().parts.find((p: { id: string }) => p.id === "sclera").selectable).toBe(false);
    });
    await step("label mode with a distractor", async () => {
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "What the candidate does" }), "label");
      await userEvent.click(canvas.getByRole("button", { name: "Add a label" }));
      expect(instance.validate().some((p) => /has no text/.test(p))).toBe(true);
      await userEvent.type(canvas.getByRole("textbox", { name: /^Text \(English\): L\d+$/ }), "Tear gland");
      expect(instance.validate()).toEqual([]);
      expect(instance.getProperties().mode).toBe("label");
      expect(setup().labels.at(-1)).toMatchObject({ en: "Tear gland", part: null });
      expect(canvas.getByTestId("declaration")).toHaveTextContent('qti-map-entry map-key="lens lens"');
    });
  },
};

export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { model: "bike", setup: JSON.stringify({ correct: [] }) } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(instance.validate()).toEqual(["Reken minstens één deel goed."]);
    await userEvent.click(canvas.getByRole("radio", { name: "Goed: chain" }));
    expect(instance.validate()).toEqual([]);
  },
};
