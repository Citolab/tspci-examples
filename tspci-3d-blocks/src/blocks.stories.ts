import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, waitFor } from "storybook/test";
import { lastChange, mountPci, openPci, remountPci, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "3d blocks",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Cell = { x: number; y: number; z: number };

/**
 * The response of a build, as the README documents it: per view every cell of the grid, found when a brick is seen
 * there. xPlane runs over y then z, yPlane over x then z, zPlane over x then y.
 */
const views = (cubes: Cell[], grid = 5) => {
  const plane = (a: "x" | "y" | "z", b: "x" | "y" | "z") => {
    const cells: Record<string, number | boolean>[] = [];
    for (let i = 0; i < grid; i++)
      for (let j = 0; j < grid; j++) cells.push({ [a]: i, [b]: j, found: cubes.some((c) => c[a] === i && c[b] === j) });
    return cells;
  };
  return { base: { string: JSON.stringify({ xPlane: plane("y", "z"), yPlane: plane("x", "z"), zPlane: plane("x", "y") }) } };
};

/** The bricks in the build (from the saved state), in a fixed order. */
const bricks = (mounted: MountedPci): Cell[] =>
  (JSON.parse(mounted.pci.getState()).state.cubes as Cell[])
    .map(({ x, y, z }) => ({ x, y, z }))
    .sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z);

/** The canvas three.js draws in, once the scene has subscribed to the store (10 ms after the first render). */
const sceneCanvas = async (mounted: MountedPci) => {
  const canvas = await waitFor(() => {
    const found = mounted.root.querySelector<HTMLCanvasElement>("canvas#voxelPainterCanvas");
    if (!found) throw new Error("no canvas yet");
    return found;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  return canvas;
};

/**
 * A click on the canvas at a fraction of its width and height. The camera always starts in the same place, so a point
 * always hits the same cell; the points below were found by clicking over the canvas (5 × 5 grid, 400 × 400 pixels):
 * (0.5, 0.7) is the front middle cell (x 2, z 4), (0.5, 0.655) the top of a brick standing there.
 */
const click = (canvas: HTMLCanvasElement, fx: number, fy: number) => {
  const r = canvas.getBoundingClientRect();
  const init = { clientX: r.left + r.width * fx, clientY: r.top + r.height * fy, bubbles: true, composed: true };
  canvas.dispatchEvent(new MouseEvent("mousemove", init));
  canvas.dispatchEvent(new MouseEvent("mousedown", init));
  canvas.dispatchEvent(new MouseEvent("mouseup", init));
};
const FRONT_MIDDLE: [number, number] = [0.5, 0.7];
const ON_TOP_OF_FRONT_MIDDLE: [number, number] = [0.5, 0.655];

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const canvas = await sceneCanvas(mounted);
    // the configured size (data-width, data-height: 400)
    expect(canvas.getBoundingClientRect().width).toBe(400);
    expect(canvas.getBoundingClientRect().height).toBe(400);
    // an empty baseplate: no bricks, no response, nothing reported
    expect(bricks(mounted)).toEqual([]);
    expect(mounted.pci.getResponse()).toBeUndefined();
    expect(mounted.changes).toEqual([]);
  },
};

export const PlaceAndStack: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const canvas = await sceneCanvas(mounted);

    await step("a click on the plate places a brick there", async () => {
      click(canvas, ...FRONT_MIDDLE);
      expect(bricks(mounted)).toEqual([{ x: 2, y: 0, z: 4 }]);
      const expected = views([{ x: 2, y: 0, z: 4 }]);
      expect(mounted.pci.getResponse()).toEqual(expected);
      expect(await lastChange(mounted, 1)).toEqual(expected);
    });

    await step("a click on the top of a brick stacks one on it", async () => {
      click(canvas, ...ON_TOP_OF_FRONT_MIDDLE);
      const build = [{ x: 2, y: 0, z: 4 }, { x: 2, y: 1, z: 4 }];
      expect(bricks(mounted)).toEqual(build);
      expect(mounted.pci.getResponse()).toEqual(views(build));
      expect(await lastChange(mounted, 2)).toEqual(views(build));
      // seen from the front and the side the stack is two high; from the top it is one cell
      const { xPlane, yPlane, zPlane } = JSON.parse(mounted.pci.getResponse()!.base.string);
      const found = (plane: { found: boolean }[]) => plane.filter((c) => c.found);
      expect(found(xPlane)).toEqual([{ y: 0, z: 4, found: true }, { y: 1, z: 4, found: true }]);
      expect(found(yPlane)).toEqual([{ x: 2, z: 4, found: true }]);
      expect(found(zPlane)).toEqual([{ x: 2, y: 0, found: true }, { x: 2, y: 1, found: true }]);
    });
  },
};

export const RemoveBrick: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const canvas = await sceneCanvas(mounted);
    click(canvas, ...FRONT_MIDDLE);
    expect(bricks(mounted)).toEqual([{ x: 2, y: 0, z: 4 }]);
    // the same point now hits the side of the brick: it is taken away
    click(canvas, ...FRONT_MIDDLE);
    expect(bricks(mounted)).toEqual([]);
    // the candidate did build, so there is a response: three empty views
    expect(mounted.pci.getResponse()).toEqual(views([]));
    expect(await lastChange(mounted, 2)).toEqual(views([]));
  },
};

export const ClickBesideThePlate: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const canvas = await sceneCanvas(mounted);
    // above the plate and below the label: nothing is hit
    click(canvas, 0.5, 0.2);
    click(canvas, 0.5, 0.95);
    expect(bricks(mounted)).toEqual([]);
    expect(mounted.pci.getResponse()).toBeUndefined();
    expect(mounted.changes).toEqual([]);
  },
};

export const SmallGrid: Story = {
  args: { properties: { gridDivisions: "3" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const canvas = await sceneCanvas(mounted);
    // a 3 × 3 plate fills the same frame: the front middle cell is x 1, z 2
    click(canvas, 0.5, 0.7);
    expect(bricks(mounted)).toEqual([{ x: 1, y: 0, z: 2 }]);
    const response = mounted.pci.getResponse()!;
    expect(response).toEqual(views([{ x: 1, y: 0, z: 2 }], 3));
    expect(JSON.parse(response.base.string).xPlane).toHaveLength(9);
  },
};

export const EvenGrid: Story = {
  args: { properties: { griddivisions: "4" } }, // lower case, as some delivery systems hand attributes over
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const canvas = await sceneCanvas(mounted);
    click(canvas, 0.5, 0.7);
    expect(bricks(mounted)).toEqual([{ x: 2, y: 0, z: 3 }]);
    expect(mounted.pci.getResponse()).toEqual(views([{ x: 2, y: 0, z: 3 }], 4));
  },
};

export const Size: Story = {
  args: { properties: { width: "300", height: "250" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const canvas = await sceneCanvas(mounted);
    expect(canvas.getBoundingClientRect().width).toBe(300);
    expect(canvas.getBoundingClientRect().height).toBe(250);
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    const canvas = await sceneCanvas(first);
    click(canvas, ...FRONT_MIDDLE);
    click(canvas, ...ON_TOP_OF_FRONT_MIDDLE);
    const build = [{ x: 2, y: 0, z: 4 }, { x: 2, y: 1, z: 4 }];
    expect(bricks(first)).toEqual(build);
    const state = first.pci.getState();

    const second = await remountPci(canvasElement, pci, { state });
    await sceneCanvas(second);
    expect(bricks(second)).toEqual(build);
    expect(second.pci.getResponse()).toEqual(views(build));
    expect(second.changes).toEqual([]);
  },
};

const twoInARow = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }];

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: views(twoInARow) } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    // the build is made from the three views
    expect(bricks(mounted)).toEqual(twoInARow);
    expect(mounted.pci.getResponse()).toEqual(views(twoInARow));
    // nothing reported for what the player handed over
    expect(mounted.changes).toEqual([]);

    mounted.pci.resetResponse();
    expect(bricks(mounted)).toEqual([]);
    expect(mounted.pci.getResponse()).toBeUndefined();
  },
};

export const SetResponse: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    // an L of three bricks: the views give back exactly these bricks
    const ell = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 }];
    mounted.pci.setResponse(views(ell));
    expect(bricks(mounted)).toEqual(ell);
    expect(mounted.pci.getResponse()).toEqual(views(ell));
    // a response that is not JSON starts over
    mounted.pci.setResponse({ base: { string: "not json" } });
    expect(bricks(mounted)).toEqual([]);
    expect(mounted.pci.getResponse()).toBeUndefined();
  },
};

const correct = views([{ x: 2, y: 0, z: 2 }, { x: 2, y: 1, z: 2 }]);
const declaration = { cardinality: "single", baseType: "string", correctResponse: { value: correct.base.string } };

export const Solution: Story = {
  args: { status: "solution", responseDeclaration: declaration },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    // the correct response is built on the plate
    expect(bricks(mounted)).toEqual([{ x: 2, y: 0, z: 2 }, { x: 2, y: 1, z: 2 }]);
    expect(mounted.pci.getResponse()).toEqual(correct);
  },
};

export const CorrectResponseNotWhileInteracting: Story = {
  args: { responseDeclaration: declaration },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    // the candidate does not get the correct response handed to them
    expect(bricks(mounted)).toEqual([]);
    expect(mounted.pci.getResponse()).toBeUndefined();
  },
};
