// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/parcc/extension-parcc-tei/tree/master/views/js/pciCreator/dev/graphLineAndPointInteraction,
// © 2014-2017 Parcc, Inc. (Open Assessment Technologies, for Parcc, Inc.)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  afterPaint, focusedIn, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, type AuthoringArgs, type MountedPci,
  type PciArgs,
} from "../../.storybook/tspci";
import { layout } from "./board";
import { parseGrid } from "./model";
import pci from "./index";

const meta = {
  title: "Coordinate graph",
  render: (args) => mountPci(pci, args),
  args: { width: 1000 },
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Canvas = MountedPci["canvas"];
type Field = { name: string; base?: { integer?: number; string?: string } | null; list?: { point?: number[][]; string?: string[] } | null };

/** A field of the record response. */
const field = (response: unknown, name: string) => (response as { record: Field[] } | undefined)?.record.find((f) => f.name === name);
const integer = (response: unknown, name: string) => field(response, name)?.base?.integer;
const points = (response: unknown, name: string) => field(response, name)?.list?.point;

/** The screen position of a point of the grid (the grid of these properties). */
const at = (svg: Element, x: number, y: number, properties: Record<string, string> = {}) => {
  const L = layout(parseGrid(properties));
  const r = svg.getBoundingClientRect();
  const k = r.width / L.w;
  return { clientX: r.left + L.px(x) * k, clientY: r.top + L.py(y) * k };
};
const pointer = (type: string, position: { clientX: number; clientY: number }) =>
  new PointerEvent(type, { ...position, bubbles: true, composed: true, pointerId: 1, button: 0, isPrimary: true });

/** Clicks on the grid where the point (x, y) is. */
const click = async (canvas: Canvas, x: number, y: number, properties?: Record<string, string>, testId = "board") => {
  const svg = canvas.getByTestId(testId);
  const p = at(svg, x, y, properties);
  svg.dispatchEvent(pointer("pointerdown", p));
  window.dispatchEvent(pointer("pointerup", p));
  await afterPaint();
};

/** Drags a point of an element to (x, y), or to a position on the screen. */
const dragPoint = async (canvas: Canvas, id: string, index: number, to: { clientX: number; clientY: number }) => {
  const mark = canvas.getByTestId("board").querySelector(`[data-element="${id}"][data-point="${index}"] circle`)!;
  const r = mark.getBoundingClientRect();
  mark.dispatchEvent(pointer("pointerdown", { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  await afterPaint();
  window.dispatchEvent(pointer("pointermove", to));
  await afterPaint();
  window.dispatchEvent(pointer("pointerup", to));
  await afterPaint();
};

const tool = (canvas: Canvas, name: RegExp) => within(canvas.getByTestId("tools")).getByRole("button", { name });
const status = (canvas: Canvas) => canvas.getByRole("status");

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);

    await step("the example: an inequality, a button per element", async () => {
      expect(canvas.getByTestId("prompt")).toHaveTextContent(/^Graph the inequality y > ½x \+ 1/);
      expect(tool(canvas, /^Boundary line/)).toHaveAttribute("aria-pressed", "true");
      expect(tool(canvas, /^Solution set/)).toBeDisabled(); // no line yet
      expect(tool(canvas, /^y-intercept/)).toBeEnabled();
      expect(canvas.getByRole("radiogroup", { name: "Line style of Boundary line" })).toBeInTheDocument();
      expect(canvas.getByRole("application", { name: /^Coordinate grid/ })).toBeInTheDocument();
      expect(canvas.getByTestId("tool-hint")).toHaveTextContent("Click two points the line goes through.");
      expect(canvas.getByTestId("x-label")).toHaveTextContent("x");
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

/** A finished drawing, from a saved state (the screenshot of the README). */
const finished = JSON.stringify({
  state: {
    values: {
      lines_1: { points: [{ x: -2, y: 0 }, { x: 4, y: 3 }], dashed: true },
      solutionSet_2: { points: [], regions: [{ x: -5, y: 5 }] },
      points_3: { points: [{ x: 0, y: 1 }] },
    },
  },
  log: [],
});

export const Finished: Story = {
  args: { state: finished },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByTestId("describe-lines_1")).toHaveTextContent("through (−2, 0) and (4, 3): y = 0.5x + 1");
    expect(canvas.getByTestId("describe-solutionSet_2")).toHaveTextContent("1 area shaded");
    expect(integer(pci.getResponse(), "score")).toBe(3);
  },
};

export const DrawTheExample: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("click two points: the line, with its equation", async () => {
      await click(canvas, 0, 1);
      expect(status(canvas)).toHaveTextContent("Boundary line: point placed at (0, 1).");
      await click(canvas, 2, 2);
      expect(status(canvas)).toHaveTextContent("Boundary line: point placed at (2, 2). Boundary line: y = 0.5x + 1.");
      expect(canvas.getByTestId("drawn-line")).toHaveAttribute("data-dashed", "false");
      expect(canvas.getByTestId("describe-lines_1")).toHaveTextContent("through (0, 1) and (2, 2): y = 0.5x + 1");
      const response = await lastChange(mounted);
      expect(points(response, "lines_1")).toEqual([[0, 1], [2, 2]]);
      expect(integer(response, "check1")).toBe(0); // solid
    });

    await step("a third click moves the last point, as in the original", async () => {
      await click(canvas, 4, 3);
      expect(status(canvas)).toHaveTextContent("Boundary line has all its points: the last one moved to (4, 3).");
      expect(points(pci.getResponse(), "lines_1")).toEqual([[0, 1], [4, 3]]);
    });

    await step("make it dashed: the inequality is strict", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: /Dashed/ }));
      expect(canvas.getByRole("radio", { name: /Dashed/ })).toHaveAttribute("aria-checked", "true");
      expect(canvas.getByTestId("drawn-line")).toHaveAttribute("data-dashed", "true");
      expect(integer(pci.getResponse(), "check1")).toBe(1);
    });

    await step("shade the area above the line", async () => {
      await userEvent.click(tool(canvas, /^Solution set/));
      expect(canvas.getByTestId("tool-hint")).toHaveTextContent(/^Click an area between the lines/);
      await click(canvas, -6, 6);
      expect(status(canvas)).toHaveTextContent("Area 1 shaded.");
      expect(canvas.getAllByTestId("shaded-area")).toHaveLength(1);
      expect(canvas.getByRole("checkbox", { name: /^Area 1/ })).toBeChecked();
      expect(field(pci.getResponse(), "solutionSet_2")?.list?.string).toEqual(["-10 -4, 10 6, 10 10, -10 10"]);
      expect(integer(pci.getResponse(), "check2")).toBe(1);
    });

    await step("the point where the line crosses the y-axis", async () => {
      await userEvent.click(tool(canvas, /^y-intercept/));
      await click(canvas, 0.2, 0.8); // snaps to (0, 1)
      const response = pci.getResponse();
      expect(points(response, "points_3")).toEqual([[0, 1]]);
      expect(integer(response, "score")).toBe(3);
      expect(integer(response, "maxscore")).toBe(3);
      expect(integer(response, "correct")).toBe(1);
      expect(JSON.parse(field(response, "graph")!.base!.string!).values.lines_1.dashed).toBe(true);
    });

    await step("moving the line clears the shading (other areas)", async () => {
      await userEvent.click(tool(canvas, /^Boundary line/));
      await dragPoint(canvas, "lines_1", 1, at(canvas.getByTestId("board"), 4, 4));
      expect(status(canvas)).toHaveTextContent("Boundary line: point moved to (4, 4). Boundary line: y = 0.75x + 1.");
      expect(canvas.queryAllByTestId("shaded-area")).toHaveLength(0);
      expect(integer(pci.getResponse(), "score")).toBe(1);
    });
  },
};

export const KeyboardAndScreenReader: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, root, pci } = await openPci(canvasElement);
    const board = canvas.getByRole("application", { name: /^Coordinate grid/ });

    await step("arrow keys move the cursor, Shift a whole step, Enter places a point", async () => {
      board.focus();
      expect(focusedIn(root)).toBe(board);
      await userEvent.keyboard("{ArrowUp}");
      expect(status(canvas)).toHaveTextContent("Cursor at (0, 1).");
      expect(canvas.getByTestId("cursor")).toBeInTheDocument();
      await userEvent.keyboard("{Enter}{ArrowRight}{ArrowRight}{ArrowUp}{Enter}");
      expect(points(pci.getResponse(), "lines_1")).toEqual([[0, 1], [2, 2]]);
    });

    await step("Enter on a point selects it, the arrows move it, Delete removes it", async () => {
      await userEvent.keyboard("{Enter}");
      expect(status(canvas)).toHaveTextContent(/^Boundary line: point \(2, 2\) selected/);
      expect(canvas.getByTestId("selected-point")).toBeInTheDocument();
      await userEvent.keyboard("{ArrowUp}");
      expect(points(pci.getResponse(), "lines_1")).toEqual([[0, 1], [2, 3]]);
      await userEvent.keyboard("{Delete}");
      expect(points(pci.getResponse(), "lines_1")).toEqual([[0, 1]]);
      expect(status(canvas)).toHaveTextContent("Boundary line: point (2, 3) removed.");
      await userEvent.keyboard("{ArrowDown}{Enter}");
      expect(points(pci.getResponse(), "lines_1")).toEqual([[0, 1], [2, 2]]);
    });

    await step("the areas as checkboxes; the delete buttons of the points", async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: /^Area 2/ }));
      expect(status(canvas)).toHaveTextContent("Area 2 shaded.");
      expect(integer(pci.getResponse(), "check2")).toBe(0); // the wrong side
      await userEvent.click(canvas.getByRole("button", { name: "Delete point (0, 1) of Boundary line" }));
      expect(points(pci.getResponse(), "lines_1")).toEqual([[2, 2]]);
      expect(canvas.queryByRole("checkbox", { name: /^Area/ })).toBeNull();
      await userEvent.click(canvas.getByRole("button", { name: "Clear Boundary line" }));
      expect(pci.getResponse()).toBeUndefined(); // back where it started
    });
  },
};

const pointGraph = {
  prompt: "Plot the points of y = x² − 2 for x = −2, −1, 0, 1 and 2, and draw the graph through them.",
  xMin: "-3", xMax: "3", yMin: "-3", yMax: "3", snap: "half", allowEdge: "false",
  given: "A;-2;2\n0;-2",
  elements: JSON.stringify([
    { id: "setPoints_1", type: "points", label: "Graph", color: "#9333ea", max: 5, connect: true, equation: "x^2 - 2", minPoints: 5 },
  ]),
};

export const PointGraph: Story = {
  args: { properties: pointGraph },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("given points, a set of 5 points, half steps, not on the edge", async () => {
      expect(canvas.getAllByTestId("given")).toHaveLength(2);
      expect(canvas.getByTestId("given-list")).toHaveTextContent("Given points: A (−2, 2), (0, −2)");
      expect(tool(canvas, /^Graph/)).toHaveTextContent("0 of 5");
      await click(canvas, 3, 0.4, pointGraph); // the edge: x snaps to 2.5, y to 0.5
      expect(points(pci.getResponse(), "setPoints_1")).toEqual([[2.5, 0.5]]);
      await userEvent.click(canvas.getByRole("button", { name: "Delete point (2.5, 0.5) of Graph" }));
    });

    await step("plot the points: connected from left to right, scored with the equation", async () => {
      for (const [x, y] of [[0, -2], [-2, 2], [1, -1], [-1, -1]]) await click(canvas, x, y, pointGraph);
      expect(canvas.getByTestId("connect-line")).toBeInTheDocument();
      expect(integer(pci.getResponse(), "check1")).toBe(0); // 4 of the 5 points
      await click(canvas, 2, 2, pointGraph);
      const response = await lastChange(mounted);
      expect(points(response, "setPoints_1")).toEqual([[0, -2], [-2, 2], [1, -1], [-1, -1], [2, 2]]);
      expect(integer(response, "check1")).toBe(1);
      expect(tool(canvas, /^Graph/)).toHaveTextContent("5 of 5");
    });

    await step("a sixth point moves the last one: off the curve", async () => {
      await click(canvas, 2, 1.5, pointGraph);
      expect(points(pci.getResponse(), "setPoints_1")!.at(-1)).toEqual([2, 1.5]);
      expect(integer(pci.getResponse(), "correct")).toBe(0);
    });
  },
};

const shapes = {
  prompt: "Draw the segment AB from (−4, −2) to (2, 4) and the ray from (0, 0) through (3, −3).",
  tolerance: "0.5",
  elements: JSON.stringify([
    { id: "segments_1", type: "segment", label: "AB", color: "#ea580c", correct: { points: [[-4, -2], [2, 4]] } },
    { id: "rays_2", type: "ray", label: "Ray", color: "#0891b2", correct: { points: [[0, 0], [3, -3]] } },
  ]),
};

export const SegmentAndRay: Story = {
  args: { properties: shapes },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("the segment, its end points in any order", async () => {
      await click(canvas, 2, 4, shapes);
      await click(canvas, -4, -2, shapes);
      expect(canvas.getByTestId("describe-segments_1")).toHaveTextContent("from (2, 4) to (−4, −2)");
      expect(integer(pci.getResponse(), "check1")).toBe(1);
      expect(canvas.queryByRole("radiogroup")).toBeNull(); // no style toggle
    });
    await step("the ray: the start and the direction count, not how far the second point is", async () => {
      await userEvent.click(tool(canvas, /^Ray/));
      await click(canvas, 0, 0, shapes);
      await click(canvas, 1, -1, shapes);
      expect(canvas.getByTestId("describe-rays_2")).toHaveTextContent("from (0, 0) through (1, −1)");
      expect(canvas.getAllByTestId("drawn-line")).toHaveLength(2);
      expect(integer(pci.getResponse(), "correct")).toBe(1);
      await click(canvas, -1, 1, shapes); // the other way
      expect(integer(pci.getResponse(), "check2")).toBe(0);
    });
  },
};

export const RestoreTheState: Story = {
  play: async ({ canvasElement, step }) => {
    const first = await openPci(canvasElement);
    await click(first.canvas, 0, 1);
    await click(first.canvas, 2, 2);
    await userEvent.click(first.canvas.getByRole("radio", { name: /Dashed/ }));
    await userEvent.click(first.canvas.getByRole("checkbox", { name: /^Area 1/ }));
    const saved = first.pci.getState();
    expect(JSON.parse(saved).log.map((a: { type: string }) => a.type)).toEqual(["ADD_POINT", "ADD_POINT", "SET_DASHED", "TOGGLE_REGION"]);

    await step("the candidate comes back: the drawing is there, no change reported", async () => {
      const second = await remountPci(canvasElement, pci, { state: saved });
      expect(second.canvas.getByTestId("drawn-line")).toHaveAttribute("data-dashed", "true");
      expect(second.canvas.getAllByTestId("shaded-area")).toHaveLength(1);
      expect(integer(second.pci.getResponse(), "score")).toBe(2);
      expect(second.changes).toHaveLength(0);
    });
  },
};

export const ResponseOfTheOriginal: Story = {
  args: {
    boundTo: {
      RESPONSE: {
        record: [
          { name: "lines_1", base: { list: { point: [[0, 1], [2, 2]] } } },
          { name: "solutionSet_2", base: { list: { point: [[-10, 10], [-10, -4], [10, 6], [10, 10]] } } },
          { name: "points_3", base: { list: { point: [[0, 1]] } } },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the original's record (base.list.point, an entry per shaded area) is drawn again
    expect(canvas.getByTestId("describe-lines_1")).toHaveTextContent("y = 0.5x + 1");
    expect(canvas.getAllByTestId("shaded-area")).toHaveLength(1);
    expect(points(pci.getResponse(), "points_3")).toEqual([[0, 1]]);
    expect(integer(pci.getResponse(), "score")).toBe(2); // the style was never in the original's response: solid
  },
};

export const Solution: Story = {
  args: { status: "solution" },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    // the correct answer, read-only: no buttons to draw with
    expect(canvas.queryByTestId("tools")).toBeNull();
    expect(canvas.getByTestId("drawn-line")).toHaveAttribute("data-dashed", "true");
    expect(canvas.getAllByTestId("shaded-area")).toHaveLength(1);
    expect(canvas.getByTestId("describe-points_3")).toHaveTextContent("(0, 1)");
    expect(canvas.getByRole("application")).toHaveAttribute("tabindex", "-1");
    expect(canvas.queryByRole("button", { name: /^Delete point/ })).toBeNull();
  },
};

export const Review: Story = {
  args: {
    status: "review",
    boundTo: { RESPONSE: { record: [{ name: "points_3", list: { point: [[3, 2]] } }] } },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByTestId("describe-points_3")).toHaveTextContent("(3, 2)");
    const before = pci.getResponse();
    await click(canvas, 5, 5);
    expect(pci.getResponse()).toEqual(before);
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    expect(canvas.getByTestId("prompt")).toHaveTextContent(/^Teken de ongelijkheid/);
    expect(tool(canvas, /^Grenslijn/)).toHaveTextContent("lijn");
    await click(canvas, 0, 0.5); // snaps to (0, 1)
    await click(canvas, 1, 1.5);
    expect(status(canvas)).toHaveTextContent("Grenslijn: punt gezet op (1; 2). Grenslijn: y = x + 1.");
    expect(canvas.getByRole("radio", { name: /Gestippeld/ })).toBeInTheDocument();
  },
};

export const NarrowScreen: Story = {
  args: { width: 360 },
  play: async ({ canvasElement }) => {
    const { canvas, host } = await openPci(canvasElement);
    const board = canvas.getByTestId("board");
    // the grid fits the width; the targets stay large enough for a finger
    expect(board.getBoundingClientRect().width).toBeLessThanOrEqual(host.getBoundingClientRect().width + 1);
    expect(tool(canvas, /^Boundary line/).getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await click(canvas, 0, 1);
    await waitFor(() => expect(canvas.getByTestId("describe-lines_1")).toHaveTextContent("one point: (0, 1)"));
  },
};

// --- Authoring mode: what an authoring system shows the item author (getAuthoringInstance)

export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", width: 1000 },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);
    const elements = () => JSON.parse(instance.getProperties().elements);

    await step("starts from the example, which is valid", async () => {
      expect(instance.validate()).toEqual([]);
      expect(elements().map((e: { id: string }) => e.id)).toEqual(["lines_1", "solutionSet_2", "points_3"]);
      expect(canvas.getByTestId("drawing")).toHaveTextContent("Correct answer of Boundary line");
    });

    await step("add a segment and draw its correct answer", async () => {
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Type of the new element" }), "segment");
      await userEvent.click(canvas.getByRole("button", { name: "+ Add" }));
      expect(elements()[3]).toMatchObject({ id: "segments_4", type: "segment", label: "Line segment 1" });
      expect(canvas.getByTestId("drawing")).toHaveTextContent("Correct answer of Line segment 1");
      await click(canvas, 1, 1, {}, "authoring-board");
      expect(instance.validate()).toEqual(["Line segment 1: the correct answer needs two points."]);
      await click(canvas, 3, -2, {}, "authoring-board");
      expect(elements()[3].correct).toEqual({ points: [{ x: 1, y: 1 }, { x: 3, y: -2 }] });
      expect(instance.validate()).toEqual([]);
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("a solution set without a line is a problem", async () => {
      await userEvent.click(within(canvas.getByTestId("element-0")).getByRole("button", { name: "Remove" }));
      expect(instance.validate()).toEqual(["Solution set: a solution set needs a line to divide the grid."]);
    });
  },
};
