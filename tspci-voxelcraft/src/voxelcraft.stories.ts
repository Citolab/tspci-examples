import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { lastChange, mountPci, openPci, remountPci, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Voxelcraft",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Voxel = { p: number[]; c: number };
const RED = 0xcc0000; // colour 1 of the default palette, 13369344
const YELLOW = 0xf7ef00; // colour 3
const GREEN = 0x00b512; // colour 5

/** The response of a building, the original's format: the cubes bottom to top, and the score when there is a target. */
const response = (data: Voxel[], score?: number) => ({ base: { string: JSON.stringify({ data, score }) } });

/** The 3D view, the element that takes the keyboard. */
const scene = (mounted: MountedPci) => mounted.canvas.getByRole("application");

/** A key on the 3D view (its handler is on the element itself). */
const press = (mounted: MountedPci, key: string, options: KeyboardEventInit = {}) =>
  scene(mounted).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }));

const message = (mounted: MountedPci) => mounted.root.querySelector('[data-testid="announcer"]')!.textContent;
const count = (mounted: MountedPci) => mounted.root.querySelector('[data-testid="count"]')!.textContent;

/** The canvas three.js draws in (none when WebGL is missing). */
const sceneCanvas = (mounted: MountedPci) =>
  waitFor(() => {
    const canvas = mounted.root.querySelector<HTMLCanvasElement>('[data-testid="scene"] canvas');
    if (!canvas) throw new Error("no canvas");
    return canvas;
  });

/**
 * A click on the canvas at a fraction of its width and height, once the scene has drawn the last change: it gets the
 * cubes in an effect and draws them (and places them for the ray) in an animation frame. The camera always starts in the same place, so a point always hits the
 * same cell. The points below were found by clicking over the canvas of the default 900 pixels wide item: GROUND hits
 * the ground cell [25, 25, 25] (right of and in front of the middle), CUBE the front of a cube standing there, TOP its
 * top.
 */
const click = async (canvas: HTMLCanvasElement, fx: number, fy: number) => {
  await new Promise((resolve) => setTimeout(resolve, 30)); // Preact's effects (setVoxels) run after the paint
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const r = canvas.getBoundingClientRect();
  const init = { clientX: r.left + r.width * fx, clientY: r.top + r.height * fy, bubbles: true, composed: true, button: 0, pointerId: 1 };
  canvas.dispatchEvent(new PointerEvent("pointermove", init));
  canvas.dispatchEvent(new PointerEvent("pointerdown", init));
  canvas.dispatchEvent(new PointerEvent("pointerup", init));
};
const GROUND: [number, number] = [0.5, 0.585];
const CUBE: [number, number] = [0.5, 0.56];
const TOP: [number, number] = [0.505, 0.532];

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await sceneCanvas(mounted);
    expect(canvas.queryByText(/cannot show 3D graphics/)).not.toBeInTheDocument();
    // the tools: add is chosen, with the first of the original's 14 colours
    const tools = canvas.getByRole("radiogroup", { name: "Tools" });
    expect(within(tools).getAllByRole("radio")).toHaveLength(3);
    expect(canvas.getByTestId("tool-add")).toBeChecked();
    const colours = within(canvas.getByRole("radiogroup", { name: "Colour" })).getAllByRole("radio");
    expect(colours).toHaveLength(14);
    expect(canvas.getByRole("radio", { name: "Colour 1 (#cc0000)" })).toBeChecked();
    expect(canvas.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(canvas.getByRole("application", { name: "Building area" })).toBeInTheDocument();
    expect(count(mounted)).toBe("0 cubes");
    // no response before the candidate does something
    expect(pci.getResponse()).toBeUndefined();
    expect(mounted.changes).toEqual([]);
  },
};

export const KeyboardBuild: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    await sceneCanvas(mounted);

    await step("Enter shows the cursor in the middle of the ground", async () => {
      press(mounted, "Enter");
      await waitFor(() => expect(message(mounted)).toBe("Column 11, row 11, level 1: empty"));
      expect(mounted.pci.getResponse()).toBeUndefined();
    });

    await step("Enter places a cube there, and the cursor goes on top of it", async () => {
      press(mounted, "Enter");
      await waitFor(() => expect(message(mounted)).toBe("Cube added. 1 cube."));
      expect(count(mounted)).toBe("1 cube");
      const expected = response([{ p: [25, 25, 25], c: RED }]);
      expect(mounted.pci.getResponse()).toEqual(expected);
      expect(await lastChange(mounted, 1)).toEqual(expected);
      press(mounted, "Enter");
      await waitFor(() => expect(count(mounted)).toBe("2 cubes"));
    });

    await step("the arrow keys move the cursor over the ground; up is away from the viewer", async () => {
      press(mounted, "ArrowRight");
      await waitFor(() => expect(message(mounted)).toBe("Column 12, row 11, level 1: empty"));
      press(mounted, "ArrowUp");
      await waitFor(() => expect(message(mounted)).toBe("Column 12, row 10, level 1: empty"));
      press(mounted, "Enter");
      await waitFor(() => expect(count(mounted)).toBe("3 cubes"));
      // Page Up: a level higher (a cube may float)
      press(mounted, "ArrowLeft");
      await waitFor(() => expect(message(mounted)).toBe("Column 11, row 10, level 1: empty"));
      press(mounted, "PageUp");
      press(mounted, "PageUp");
      await waitFor(() => expect(message(mounted)).toBe("Column 11, row 10, level 3: empty"));
      press(mounted, "Enter");
      await waitFor(() => expect(count(mounted)).toBe("4 cubes"));
      // sorted bottom to top, then by x and z
      expect(mounted.pci.getResponse()).toEqual(
        response([
          { p: [25, 25, 25], c: RED },
          { p: [75, 25, -25], c: RED },
          { p: [25, 75, 25], c: RED },
          { p: [25, 125, -25], c: RED },
        ])
      );
    });

    await step("the cursor describes what is there", async () => {
      press(mounted, "PageDown");
      press(mounted, "PageDown");
      press(mounted, "ArrowDown");
      await waitFor(() => expect(message(mounted)).toBe("Column 11, row 11, level 3: empty"));
      press(mounted, "PageDown");
      await waitFor(() => expect(message(mounted)).toBe("Column 11, row 11, level 2: a cube, Colour 1 (#cc0000)"));
    });

    await step("Ctrl+Z undoes", async () => {
      press(mounted, "z", { ctrlKey: true });
      await waitFor(() => expect(count(mounted)).toBe("3 cubes"));
    });
  },
};

export const ColourRemoveAndPaint: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    await sceneCanvas(mounted);

    await step("a cube in another colour", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "Colour 3 (#f7ef00)" }));
      press(mounted, "Enter");
      press(mounted, "Enter");
      await waitFor(() => expect(count(mounted)).toBe("1 cube"));
      expect(mounted.pci.getResponse()).toEqual(response([{ p: [25, 25, 25], c: YELLOW }]));
    });

    await step("paint it", async () => {
      await userEvent.click(canvas.getByTestId("tool-paint"));
      await userEvent.click(canvas.getByRole("radio", { name: "Colour 5 (#00b512)" }));
      press(mounted, "ArrowRight");
      press(mounted, "ArrowLeft"); // back to the column: the cursor goes to its top cube
      await waitFor(() => expect(message(mounted)).toBe("Column 11, row 11, level 1: a cube, Colour 3 (#f7ef00)"));
      press(mounted, "Enter");
      await waitFor(() => expect(message(mounted)).toBe("Cube painted."));
      expect(mounted.pci.getResponse()).toEqual(response([{ p: [25, 25, 25], c: GREEN }]));
    });

    await step("remove it: the palette goes away for that tool", async () => {
      await userEvent.click(canvas.getByTestId("tool-remove"));
      expect(canvas.queryByRole("radiogroup", { name: "Colour" })).not.toBeInTheDocument();
      press(mounted, "Enter");
      await waitFor(() => expect(message(mounted)).toBe("Cube removed. 0 cubes."));
      // the candidate did build: the response is the empty building
      expect(mounted.pci.getResponse()).toEqual(response([]));
    });

    await step("undo twice: the yellow cube is back", async () => {
      const undo = canvas.getByRole("button", { name: "Undo" });
      await userEvent.click(undo);
      await userEvent.click(undo);
      expect(mounted.pci.getResponse()).toEqual(response([{ p: [25, 25, 25], c: YELLOW }]));
    });
  },
};

export const PointerBuild: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    const drawn = await sceneCanvas(mounted);

    await step("add: a click on the ground places a cube there", async () => {
      await click(drawn, ...GROUND);
      await waitFor(() => expect(count(mounted)).toBe("1 cube"));
      expect(mounted.pci.getResponse()).toEqual(response([{ p: [25, 25, 25], c: RED }]));
    });

    await step("add: a click on the top of the cube places one on it", async () => {
      await click(drawn, ...TOP);
      await waitFor(() => expect(count(mounted)).toBe("2 cubes"));
      expect(mounted.pci.getResponse()).toEqual(response([{ p: [25, 25, 25], c: RED }, { p: [25, 75, 25], c: RED }]));
      await userEvent.click(canvas.getByRole("button", { name: "Undo" }));
      await waitFor(() => expect(count(mounted)).toBe("1 cube"));
    });

    await step("paint: a click on the cube", async () => {
      await userEvent.click(canvas.getByTestId("tool-paint"));
      await userEvent.click(canvas.getByRole("radio", { name: "Colour 3 (#f7ef00)" }));
      await click(drawn, ...CUBE);
      await waitFor(() => expect(mounted.pci.getResponse()).toEqual(response([{ p: [25, 25, 25], c: YELLOW }])));
      // a click on the ground beside it paints nothing
      await click(drawn, 0.5, 0.65);
      expect(mounted.pci.getResponse()).toEqual(response([{ p: [25, 25, 25], c: YELLOW }]));
    });

    await step("remove: a click on the cube", async () => {
      await userEvent.click(canvas.getByTestId("tool-remove"));
      await click(drawn, ...CUBE);
      await waitFor(() => expect(count(mounted)).toBe("0 cubes"));
      expect(mounted.pci.getResponse()).toEqual(response([]));
    });
    // add, add, undo, paint, remove
    expect(mounted.changes).toHaveLength(5);
  },
};

const preset = [{ p: [25, 25, 25], c: GREEN }, { p: [75, 25, 25], c: GREEN }];

export const StartingFigureAndStartOver: Story = {
  args: { properties: { scene: JSON.stringify(preset) } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    await sceneCanvas(mounted);
    // the starting figure is there, but is not a response
    expect(count(mounted)).toBe("2 cubes");
    expect(mounted.pci.getResponse()).toBeUndefined();

    press(mounted, "Enter"); // the cursor, on the first cube of the starting figure
    await waitFor(() => expect(message(mounted)).toBe("Column 11, row 11, level 1: a cube, Colour 5 (#00b512)"));
    press(mounted, "Enter"); // the cell is taken: nothing happens
    press(mounted, "PageUp");
    press(mounted, "Enter"); // on top of it
    await waitFor(() => expect(count(mounted)).toBe("3 cubes"));
    expect(mounted.pci.getResponse()).toEqual(response([...preset, { p: [25, 75, 25], c: RED }]));

    // start over asks first; cancel keeps the building
    await userEvent.click(canvas.getByRole("button", { name: "Start over" }));
    let dialog = canvas.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Remove everything you built and start over?");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(canvas.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(count(mounted)).toBe("3 cubes");

    await userEvent.click(canvas.getByRole("button", { name: "Start over" }));
    dialog = canvas.getByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Start over" }));
    await waitFor(() => expect(count(mounted)).toBe("2 cubes"));
    // after start over the response is the starting figure
    expect(mounted.pci.getResponse()).toEqual(response(preset));
  },
};

/** Two cubes side by side along x. */
const pair = JSON.stringify([{ p: [25, 25, 25], c: RED }, { p: [75, 25, 25], c: RED }]);

export const TargetShape: Story = {
  args: { properties: { targetShape: pair } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    await sceneCanvas(mounted);
    press(mounted, "Enter");
    press(mounted, "Enter");
    await waitFor(() => expect(count(mounted)).toBe("1 cube"));
    // one cube: the pair is not there
    expect(mounted.pci.getResponse()).toEqual(response([{ p: [25, 25, 25], c: RED }], 0));
    // a second one in front of it (along z): the pair, turned a quarter
    press(mounted, "ArrowDown");
    press(mounted, "Enter");
    await waitFor(() => expect(count(mounted)).toBe("2 cubes"));
    expect(mounted.pci.getResponse()).toEqual(response([{ p: [25, 25, 25], c: RED }, { p: [25, 25, 75], c: RED }], 1));
  },
};

export const TargetShapeInColour: Story = {
  args: { properties: { targetShape: pair, matchColors: "true" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    await sceneCanvas(mounted);
    // a yellow pair does not count when the colours must match
    await userEvent.click(canvas.getByRole("radio", { name: "Colour 3 (#f7ef00)" }));
    press(mounted, "Enter");
    press(mounted, "Enter");
    press(mounted, "ArrowRight");
    press(mounted, "Enter");
    await waitFor(() => expect(count(mounted)).toBe("2 cubes"));
    expect(JSON.parse(mounted.pci.getResponse()!.base.string).score).toBe(0);
    // painted red, it does
    await userEvent.click(canvas.getByTestId("tool-paint"));
    await userEvent.click(canvas.getByRole("radio", { name: "Colour 1 (#cc0000)" }));
    press(mounted, "ArrowLeft"); // the cursor goes to the top cube of a column
    press(mounted, "Enter");
    press(mounted, "ArrowRight");
    press(mounted, "Enter");
    await waitFor(() => expect(mounted.pci.getResponse()).toEqual(response([{ p: [25, 25, 25], c: RED }, { p: [75, 25, 25], c: RED }], 1)));
  },
};

export const TargetShapeWithEmptySpace: Story = {
  // two cubes with a gap between them: white marks the cell that must stay empty
  args: {
    properties: {
      targetShape: JSON.stringify([{ p: [25, 25, 25], c: RED }, { p: [25, 75, 25], c: 0xffffff }, { p: [25, 125, 25], c: RED }]),
      emptyColor: "#FFFFFF",
    },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    await sceneCanvas(mounted);
    const score = () => JSON.parse(mounted.pci.getResponse()!.base.string).score;
    press(mounted, "Enter");
    press(mounted, "Enter"); // level 1
    press(mounted, "PageUp");
    press(mounted, "Enter"); // level 3, with level 2 empty
    await waitFor(() => expect(count(mounted)).toBe("2 cubes"));
    expect(score()).toBe(1);
    press(mounted, "PageDown");
    press(mounted, "PageDown");
    press(mounted, "Enter"); // level 2: the gap is filled
    await waitFor(() => expect(count(mounted)).toBe("3 cubes"));
    expect(score()).toBe(0);
  },
};

export const OwnColours: Story = {
  args: { properties: { colors: "#FF0000\n#00ff00, #abc; not-a-colour" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const colours = within(mounted.canvas.getByRole("radiogroup", { name: "Colour" })).getAllByRole("radio");
    expect(colours.map((c) => c.getAttribute("aria-label"))).toEqual(["Colour 1 (#ff0000)", "Colour 2 (#00ff00)", "Colour 3 (#aabbcc)"]);
    await userEvent.click(colours[2]);
    press(mounted, "Enter");
    press(mounted, "Enter");
    await waitFor(() => expect(mounted.pci.getResponse()).toEqual(response([{ p: [25, 25, 25], c: 0xaabbcc }])));
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByRole("radiogroup", { name: "Gereedschap" })).toBeInTheDocument();
    expect(canvas.getByRole("radio", { name: "Kubussen plaatsen" })).toBeChecked();
    expect(canvas.getByRole("radio", { name: "Kleur 1 (#cc0000)" })).toBeChecked();
    expect(canvas.getByRole("button", { name: "Ongedaan maken" })).toBeDisabled();
    expect(canvas.getByRole("application", { name: "Bouwvlak" })).toBeInTheDocument();
    expect(count(mounted)).toBe("0 kubussen");
    await sceneCanvas(mounted);
    press(mounted, "Enter");
    await waitFor(() => expect(message(mounted)).toBe("Kolom 11, rij 11, laag 1: leeg"));
    press(mounted, "Enter");
    await waitFor(() => expect(message(mounted)).toBe("Kubus geplaatst. 1 kubus."));
    expect(count(mounted)).toBe("1 kubus");
  },
};

const built = [{ p: [25, 25, 25], c: RED }, { p: [25, 75, 25], c: YELLOW }];

export const Review: Story = {
  args: { status: "review", boundTo: { RESPONSE: response(built) } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    await sceneCanvas(mounted);
    // the building can be viewed, not changed: no tools, no palette
    expect(canvas.getByText("View only")).toBeInTheDocument();
    expect(canvas.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(canvas.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Reset view" })).toBeEnabled();
    expect(count(mounted)).toBe("2 cubes");
    press(mounted, "Enter");
    press(mounted, "Enter");
    expect(count(mounted)).toBe("2 cubes");
    expect(mounted.pci.getResponse()).toEqual(response(built));
    expect(mounted.changes).toEqual([]);
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await sceneCanvas(first);
    await userEvent.click(first.canvas.getByRole("radio", { name: "Colour 3 (#f7ef00)" }));
    press(first, "Enter");
    press(first, "Enter");
    press(first, "Enter");
    await waitFor(() => expect(count(first)).toBe("2 cubes"));
    const before = first.pci.getResponse();
    expect(before).toEqual(response([{ p: [25, 25, 25], c: YELLOW }, { p: [25, 75, 25], c: YELLOW }]));

    const second = await remountPci(canvasElement, pci, { state: first.pci.getState() });
    await sceneCanvas(second);
    expect(count(second)).toBe("2 cubes");
    expect(second.pci.getResponse()).toEqual(before);
    expect(second.changes).toEqual([]);
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: response(built) }, properties: { scene: JSON.stringify(preset) } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    await sceneCanvas(mounted);
    // the response wins over the starting figure
    expect(count(mounted)).toBe("2 cubes");
    expect(mounted.pci.getResponse()).toEqual(response(built));
    expect(mounted.changes).toEqual([]);
    // setResponse with the original's response, cubes off the grid snap to it
    mounted.pci.setResponse({ base: { string: JSON.stringify({ data: [{ p: [30, 20, 70], c: GREEN }] }) } });
    await waitFor(() => expect(count(mounted)).toBe("1 cube"));
    expect(mounted.pci.getResponse()).toEqual(response([{ p: [25, 25, 75], c: GREEN }]));
    // resetResponse: back to the starting figure, no response
    mounted.pci.resetResponse();
    await waitFor(() => expect(count(mounted)).toBe("2 cubes"));
    expect(mounted.pci.getResponse()).toBeUndefined();
  },
};

export const Solution: Story = {
  args: {
    status: "solution",
    responseDeclaration: { cardinality: "single", baseType: "string", correctResponse: { value: response(built).base.string } },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.canvas.getByText("View only")).toBeInTheDocument();
    await waitFor(() => expect(count(mounted)).toBe("2 cubes"));
    expect(mounted.pci.getResponse()).toEqual(response(built));
  },
};

type AuthoringConfig = Parameters<typeof pci.getAuthoringInstance>[1];

export const Authoring: Story = {
  render: () => document.createElement("div"),
  play: async ({ canvasElement, step }) => {
    const host = document.createElement("div");
    host.style.width = "900px";
    canvasElement.appendChild(host);
    let changes = 0;
    let ready: ReturnType<typeof pci.getAuthoringInstance> | undefined;
    const instance = pci.getAuthoringInstance(host, {
      properties: { scene: JSON.stringify(preset), emptyColor: "#ffffff", colors: "#cc0000, #00b512" },
      onready: (i: ReturnType<typeof pci.getAuthoringInstance>) => (ready = i),
      onchange: () => changes++,
    } as unknown as AuthoringConfig);
    expect(ready).toBe(instance);
    const canvas = within(host.shadowRoot as unknown as HTMLElement);
    const sceneOf = () => canvas.getByRole("application");
    const key = (k: string) => sceneOf().dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

    await step("two tabs: the starting figure (with its cubes) and the target shape", async () => {
      expect(canvas.getByRole("tab", { name: /^Starting figure/ })).toHaveAttribute("aria-selected", "true");
      expect(canvas.getByRole("tab", { name: /^Starting figure/ })).toHaveTextContent("Starting figure2");
      expect(canvas.getByRole("tab", { name: /^Target shape/ })).toHaveAttribute("aria-selected", "false");
      expect(instance.getProperties()).toEqual({ scene: JSON.stringify(preset), targetShape: "" });
      // the starting figure gets no "empty space" colour
      expect(canvas.getAllByRole("radio", { name: /^Colour/ })).toHaveLength(2);
    });

    const drawn = () =>
      waitFor(() => {
        if (!host.shadowRoot!.querySelector('[data-testid="scene"] canvas')) throw new Error("no canvas");
      });

    await step("a cube built in the starting figure is in its setting", async () => {
      await drawn();
      key("Enter");
      key("PageUp"); // the first cube of the figure is under the cursor
      key("Enter");
      await waitFor(() => expect(changes).toBe(1));
      expect(instance.getProperties().scene).toBe(JSON.stringify([...preset, { p: [25, 75, 25], c: RED }]));
    });

    await step("the target shape, with the colour for empty space last in its palette", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: /^Target shape/ }));
      expect(canvas.getByRole("tab", { name: /^Target shape/ })).toHaveAttribute("aria-selected", "true");
      expect(canvas.getAllByRole("radio", { name: /^Colour/ }).map((r) => r.getAttribute("aria-label"))).toEqual([
        "Colour 1 (#cc0000)", "Colour 2 (#00b512)", "Colour 3 (#ffffff)",
      ]);
      await drawn();
      key("Enter");
      key("Enter");
      await waitFor(() => expect(changes).toBe(2));
      expect(instance.getProperties()).toEqual({
        scene: JSON.stringify([...preset, { p: [25, 75, 25], c: RED }]),
        targetShape: JSON.stringify([{ p: [25, 25, 25], c: RED }]),
      });
    });

    await step("JSON pasted in loads a figure", async () => {
      await userEvent.click(canvas.getByText("JSON", { selector: "summary" }));
      const json = canvas.getByRole("textbox", { name: "Paste JSON here to load a figure" }) as HTMLTextAreaElement;
      json.value = pair;
      json.dispatchEvent(new Event("change", { bubbles: true }));
      await waitFor(() => expect(instance.getProperties().targetShape).toBe(pair));
    });

    instance.oncompleted();
    expect(host.shadowRoot!.querySelector('[role="tablist"]')).toBeNull();
  },
};
