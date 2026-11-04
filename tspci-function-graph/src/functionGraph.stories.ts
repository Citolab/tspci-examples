// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/parcc/extension-parcc-tei/tree/master/views/js/pciCreator/dev/graphFunctionInteraction,
// © 2014-2017 Parcc, Inc., by Sam Sipasseuth (Open Assessment Technologies)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { focusedIn, lastChange, mountPci, openPci, remountPci, retype, afterPaint, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import { layout } from "./plot";
import { parseSettings } from "./functions";
import pci from "./index";

const meta = {
  title: "Function graph",
  render: (args) => mountPci(pci, args),
  args: { width: 900 },
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Canvas = MountedPci["canvas"];
type Record = { record: { name: string; base: { integer?: number; string?: string } | null }[] } | undefined;

/** A field of the record response. */
const field = (response: unknown, name: string) => {
  const base = (response as Record)?.record.find((f) => f.name === name)?.base;
  return base?.string ?? base?.integer;
};
/** The original's two fields. */
const original = (response: unknown) => [field(response, "functionGraphType"), field(response, "points")];

/** The screen position of (x, y) on the grid, for these settings. */
const at = (svg: Element, x: number, y: number, properties: PciArgs["properties"] = {}) => {
  const s = parseSettings(properties);
  const L = layout(s);
  const r = svg.getBoundingClientRect();
  const k = r.width / L.viewW;
  return {
    clientX: r.left + (L.left + ((x - s.x.start) / (s.x.end - s.x.start)) * L.width) * k,
    clientY: r.top + (L.top + L.height - ((y - s.y.start) / (s.y.end - s.y.start)) * L.height) * k,
  };
};
const pointer = (type: string, position: { clientX: number; clientY: number }) =>
  new PointerEvent(type, { ...position, bubbles: true, composed: true, pointerId: 1, button: 0, isPrimary: true });

/** Clicks on the grid where (x, y) is. */
const click = async (canvas: Canvas, x: number, y: number, properties?: PciArgs["properties"]) => {
  const svg = canvas.getByTestId("plot");
  const p = at(svg, x, y, properties);
  svg.dispatchEvent(pointer("pointerdown", p));
  window.dispatchEvent(pointer("pointerup", p));
  await afterPaint();
};

/** Drags point 1 or 2 to (x, y). */
const drag = async (canvas: Canvas, n: 1 | 2, x: number, y: number, properties?: PciArgs["properties"]) => {
  const svg = canvas.getByTestId("plot");
  const mark = svg.querySelector(`[data-point="${n - 1}"] circle:last-of-type`)!;
  const r = mark.getBoundingClientRect();
  mark.dispatchEvent(pointer("pointerdown", { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  await afterPaint();
  const to = at(svg, x, y, properties);
  window.dispatchEvent(pointer("pointermove", to));
  await afterPaint();
  window.dispatchEvent(pointer("pointerup", to));
  await afterPaint();
};

/** The coordinates of a point as its inputs show them. */
const coordinates = (canvas: Canvas, name: RegExp | string) =>
  within(canvas.getByRole("group", { name })).queryAllByRole("textbox").map((i) => (i as HTMLInputElement).value);

const family = (canvas: Canvas, name: string) => canvas.getByRole("button", { name });

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);

    await step("the instruction and the seven families of the original, linear chosen", async () => {
      expect(canvas.getByTestId("prompt")).toHaveTextContent(/^Choose the type of function/);
      const buttons = within(canvas.getByRole("group", { name: "Type of function" })).getAllByRole("button");
      expect(buttons.map((b) => b.textContent)).toEqual(["Linear", "Absolute value", "Quadratic", "Exponential", "Logarithmic", "Sine/cosine", "Tangent"]);
      expect(family(canvas, "Linear")).toHaveAttribute("aria-pressed", "true");
      expect(canvas.getByTestId("hint")).toHaveTextContent("A straight line through the two points.");
    });

    await step("two points to drag at (0, 0) and (1, 1), the line through them", async () => {
      expect(coordinates(canvas, "Point 1")).toEqual(["0", "0"]);
      expect(coordinates(canvas, "Point 2")).toEqual(["1", "1"]);
      expect(canvas.getAllByTestId("curve")).toHaveLength(1);
      expect(canvas.queryByTestId("asymptote")).toBeNull();
      expect(canvas.queryByTestId("equation")).toBeNull();
      expect(canvas.getByRole("application", { name: "Graph: Linear; Point 1 (0, 0); Point 2 (1, 1)" })).toBeInTheDocument();
      expect(canvas.getByRole("button", { name: "Start again" })).toBeDisabled();
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const DragAndClick: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("drag point 2: the response in the original's format, with the equation", async () => {
      await drag(canvas, 2, 2, 4);
      expect(coordinates(canvas, "Point 2")).toEqual(["2", "4"]);
      expect(canvas.getByRole("status")).toHaveTextContent("Point 2 moved to (2, 4).");
      const response = await lastChange(mounted);
      expect(original(response)).toEqual(["linear", "0 0,2 4"]);
      expect(field(response, "equation")).toBe("y = 2*x");
      expect(field(response, "score")).toBeUndefined(); // no correct function: no score
    });

    await step("a click on the grid moves the selected point there; points snap to half a step", async () => {
      await click(canvas, 3.1, -1.9);
      expect(original(pci.getResponse())).toEqual(["linear", "0 0,3 -2"]);
      await drag(canvas, 1, 0, 0); // selects point 1 without moving it
      expect(canvas.getByRole("status")).toHaveTextContent("Point 1 at (0, 0) selected.");
      await click(canvas, -2.4, 1.6);
      expect(original(pci.getResponse())).toEqual(["linear", "-2.5 1.5,3 -2"]);
    });

    await step("type a coordinate", async () => {
      await retype(within(canvas.getByRole("group", { name: "Point 1" })).getByRole("textbox", { name: "y" }), "-4{Enter}");
      expect(original(pci.getResponse())).toEqual(["linear", "-2.5 -4,3 -2"]);
      await retype(within(canvas.getByRole("group", { name: "Point 1" })).getByRole("textbox", { name: "x" }), "12{Enter}");
      expect(within(canvas.getByRole("group", { name: "Point 1" })).getByRole("textbox", { name: "x" })).toHaveAttribute("aria-invalid", "true");
      expect(original(pci.getResponse())).toEqual(["linear", "-2.5 -4,3 -2"]);
    });

    await step("the same x: no line, and the candidate is told why", async () => {
      await drag(canvas, 1, 3, 5);
      expect(canvas.queryByTestId("curve")).toBeNull();
      expect(canvas.getByTestId("problem")).toHaveTextContent("The two points need different x values.");
      expect(canvas.getByRole("status")).toHaveTextContent("Point 1 moved to (3, 5). The two points need different x values.");
      expect(field(pci.getResponse(), "equation")).toBe("");
    });

    await step("start again", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Start again" }));
      expect(coordinates(canvas, "Point 1")).toEqual(["0", "0"]);
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Families: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("quadratic: point 1 is the vertex", async () => {
      await userEvent.click(family(canvas, "Quadratic"));
      expect(family(canvas, "Quadratic")).toHaveAttribute("aria-pressed", "true");
      expect(family(canvas, "Linear")).toHaveAttribute("aria-pressed", "false");
      expect(canvas.getByRole("group", { name: "Point 1 (vertex)" })).toBeInTheDocument();
      expect(canvas.getByRole("status")).toHaveTextContent("Quadratic chosen.");
      const response = await lastChange(mounted);
      expect(original(response)).toEqual(["quadratic", "0 0,1 1"]);
      expect(field(response, "equation")).toBe("y = x^2");
    });

    await step("exponential: not through the asymptote", async () => {
      await userEvent.click(family(canvas, "Exponential"));
      expect(canvas.getByTestId("problem")).toHaveTextContent(/both points must be on the same side of the x axis/);
      expect(canvas.queryByTestId("curve")).toBeNull();
      await drag(canvas, 1, 0, 1);
      await drag(canvas, 2, 1, 2);
      expect(canvas.queryByTestId("problem")).toBeNull();
      expect(canvas.getAllByTestId("curve")).toHaveLength(1);
      expect(canvas.getAllByTestId("asymptote")).toHaveLength(1);
      expect(field(pci.getResponse(), "equation")).toBe("y = 2^x");
    });

    await step("logarithmic: not on the y axis, which is its asymptote", async () => {
      await userEvent.click(family(canvas, "Logarithmic"));
      expect(original(pci.getResponse())).toEqual(["logarithmic", "0 1,1 2"]);
      expect(canvas.getByTestId("problem")).toHaveTextContent(/same side of the y axis/);
      expect(canvas.queryByTestId("asymptote")).toBeNull();
      await drag(canvas, 1, 0.5, 1);
      expect(canvas.getAllByTestId("asymptote")).toHaveLength(1);
      expect(canvas.getAllByTestId("curve")).toHaveLength(1);
      await drag(canvas, 1, 0, 1);
    });

    await step("tangent: a branch between each two asymptotes", async () => {
      await userEvent.click(family(canvas, "Tangent"));
      expect(canvas.getByRole("group", { name: "Point 1 (centre)" })).toBeInTheDocument();
      // centre (0, 1), a quarter period 1 further: asymptotes every 4 from x = 2
      expect(canvas.getAllByTestId("asymptote")).toHaveLength(6);
      expect(canvas.getAllByTestId("curve")).toHaveLength(5);
      expect(field(pci.getResponse(), "equation")).toBe("y = tan(0.79*x) + 1");
    });

    await step("sine/cosine and absolute value", async () => {
      await userEvent.click(family(canvas, "Sine/cosine"));
      expect(canvas.queryByTestId("asymptote")).toBeNull();
      expect(field(pci.getResponse(), "equation")).toBe("y = cos(1.57*(x - 1)) + 1");
      await userEvent.click(family(canvas, "Absolute value"));
      expect(field(pci.getResponse(), "equation")).toBe("y = abs(x) + 1");
    });
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, root, pci } = await openPci(canvasElement);
    const svg = canvas.getByRole("application", { name: /^Graph/ });

    await step("the arrow keys move point 1 by half a step, with Shift a whole step", async () => {
      svg.focus();
      expect(focusedIn(root)).toBe(svg);
      await userEvent.keyboard("{ArrowLeft}{Shift>}{ArrowUp}{ArrowUp}{/Shift}");
      expect(coordinates(canvas, "Point 1")).toEqual(["−0.5", "2"]);
      expect(canvas.getByRole("status")).toHaveTextContent("Point 1 moved to (−0.5, 2).");
    });

    await step("Enter switches to point 2", async () => {
      await userEvent.keyboard("{Enter}");
      expect(canvas.getByRole("status")).toHaveTextContent("Point 2 at (1, 1) selected.");
      await userEvent.keyboard("{ArrowRight}{ArrowRight}");
      expect(original(pci.getResponse())).toEqual(["linear", "-0.5 2,2 1"]);
      expect(svg).toHaveAccessibleName("Graph: Linear; Point 1 (−0.5, 2); Point 2 (2, 1)");
    });
  },
};

export const EmptyStart: Story = {
  args: { properties: { startPoints: "empty", graphs: "quadratic" } },
  play: async ({ canvasElement, step }) => {
    const { canvas, root, pci } = await openPci(canvasElement);

    await step("one family, no points: the candidate places both", async () => {
      expect(canvas.queryByRole("group", { name: "Type of function" })).toBeNull();
      expect(canvas.getByTestId("hint")).toHaveTextContent("Quadratic: Point 1 is the vertex of the parabola");
      expect(canvas.getByTestId("prompt")).toHaveTextContent(/click on the grid to place the two points/);
      expect(within(canvas.getByRole("group", { name: "Point 1 (vertex)" })).getByText("not placed yet")).toBeInTheDocument();
      expect(canvas.queryByTestId("curve")).toBeNull();
    });

    await step("a click places the vertex; no response with one point", async () => {
      await click(canvas, 2, -3);
      expect(canvas.getByRole("status")).toHaveTextContent("Point 1 (vertex) placed at (2, −3).");
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("the keyboard places the second point at the cursor", async () => {
      canvas.getByRole("application", { name: /^Graph/ }).focus();
      await afterPaint();
      expect(focusedIn(root)).toBe(canvas.getByTestId("plot"));
      expect(canvas.getByTestId("cursor")).toBeInTheDocument();
      await userEvent.keyboard("{Shift>}{ArrowRight}{ArrowRight}{ArrowUp}{ArrowUp}{ArrowUp}{/Shift}{Enter}");
      expect(canvas.getByRole("status")).toHaveTextContent("Point 2 placed at (4, 0).");
      expect(original(pci.getResponse())).toEqual(["quadratic", "2 -3,4 0"]);
      expect(field(pci.getResponse(), "equation")).toBe("y = 0.75*(x - 2)^2 - 3");
      await click(canvas, 0, 0); // with two points a click moves point 2 (the selected one)
      expect(original(pci.getResponse())).toEqual(["quadratic", "2 -3,0 0"]);
    });
  },
};

const SETTINGS = {
  prompt: "A ball is thrown. Its height h in metres after t seconds is a parabola with its top at t = 2, h = 20; at t = 0 it is 0. Draw the graph.",
  graphs: "linear,quadratic,exponential",
  showEquation: "true",
  graphTitle: "Height of the ball",
  xStart: "0", xEnd: "5", xStep: "1", xSubStep: "4", xLabel: "t", xTitle: "time (s)",
  yStart: "-5", yEnd: "25", yStep: "5", ySubStep: "5", yLabel: "h", yTitle: "height (m)",
  correctType: "quadratic", correctPoints: "2 20,4 0",
};

export const Settings: Story = {
  args: { properties: SETTINGS },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("the author's families, axes, title and the equation", async () => {
      expect(canvas.getByTestId("prompt")).toHaveTextContent(/^A ball is thrown/);
      expect(within(canvas.getByRole("group", { name: "Type of function" })).getAllByRole("button")).toHaveLength(3);
      expect(canvas.getByTestId("title")).toHaveTextContent("Height of the ball");
      expect(canvas.getByTestId("x-label")).toHaveTextContent("t");
      expect(within(canvas.getByRole("group", { name: "Point 1" })).getByRole("textbox", { name: "h" })).toHaveValue("0");
      // the origin and a step further: (0, 0) and (1, 5)
      expect(coordinates(canvas, "Point 2")).toEqual(["1", "5"]);
      expect(canvas.getByTestId("equation")).toHaveTextContent("h = 5t");
    });

    await step("the correct function through other points scores", async () => {
      await userEvent.click(family(canvas, "Quadratic"));
      expect(field(pci.getResponse(), "score")).toBe(0);
      await drag(canvas, 1, 2, 20, SETTINGS);
      await drag(canvas, 2, 0, 0, SETTINGS);
      expect(canvas.getByTestId("equation")).toHaveTextContent("h = −5(t − 2)² + 20");
      const response = await lastChange(mounted);
      expect(original(response)).toEqual(["quadratic", "2 20,0 0"]);
      expect([field(response, "score"), field(response, "maxscore"), field(response, "correct")]).toEqual([1, 1, 1]);
    });

    await step("another vertex does not", async () => {
      await drag(canvas, 1, 2.25, 20, SETTINGS);
      expect(field(pci.getResponse(), "correct")).toBe(0);
      expect(pci.evaluation().scored).toBe(true);
    });
  },
};

export const CorrectResponseDeclared: Story = {
  args: {
    properties: { graphs: "exponential", tolerance: "0.05" },
    // as the original's creator stores it: functionGraphType and samplePoints (and vertex, equation, numberPointsRequired)
    responseDeclaration: {
      correctResponse: {
        value: [
          { fieldIdentifier: "functionGraphType", baseType: "string", value: "exponential" },
          { fieldIdentifier: "samplePoints", baseType: "string", value: "0 1,2 4" },
          { fieldIdentifier: "numberPointsRequired", baseType: "integer", value: 2 },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(coordinates(canvas, "Point 1")).toEqual(["1", "1"]);
    await drag(canvas, 1, 1, 2);
    await drag(canvas, 2, 3, 8);
    expect(original(pci.getResponse())).toEqual(["exponential", "1 2,3 8"]);
    expect(field(pci.getResponse(), "correct")).toBe(1);
  },
};

export const French: Story = {
  args: { properties: { language: "fr", showEquation: "true" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByTestId("prompt")).toHaveTextContent(/^Choisis le type de fonction/);
    await userEvent.click(family(canvas, "Du second degré"));
    expect(canvas.getByRole("group", { name: "Point 1 (sommet)" })).toBeInTheDocument();
    await drag(canvas, 2, 2, 2);
    expect(canvas.getByTestId("equation")).toHaveTextContent("y = 0,5x²");
    expect(canvas.getByRole("status")).toHaveTextContent("Point 2 déplacé en (2 ; 2).");
    expect(original(pci.getResponse())).toEqual(["quadratic", "0 0,2 2"]);
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await userEvent.click(family(canvas, "Exponentieel"));
    expect(canvas.getByTestId("problem")).toHaveTextContent("Bij een exponentiële functie liggen beide punten aan dezelfde kant van de x-as");
    await retype(within(canvas.getByRole("group", { name: "Punt 1" })).getByRole("textbox", { name: "y" }), "0,5{Enter}");
    expect(original(pci.getResponse())).toEqual(["exponential", "0 0.5,1 1"]);
    expect(coordinates(canvas, "Punt 1")).toEqual(["0", "0,5"]);
    expect(canvas.getByRole("button", { name: "Opnieuw beginnen" })).toBeEnabled();
  },
};

export const RestoreState: Story = {
  play: async ({ canvasElement, step }) => {
    const first = await openPci(canvasElement);

    await step("work in a first session", async () => {
      await userEvent.click(family(first.canvas, "Quadratic"));
      await drag(first.canvas, 1, 1, -2);
      await drag(first.canvas, 2, 3, 6);
    });

    const saved = first.pci.getState();
    const response = first.pci.getResponse();

    await step("the state brings it back, with the log", async () => {
      const { canvas, pci: again } = await remountPci(canvasElement, pci, { state: saved });
      expect(family(canvas, "Quadratic")).toHaveAttribute("aria-pressed", "true");
      expect(coordinates(canvas, "Point 1 (vertex)")).toEqual(["1", "−2"]);
      expect(again.getResponse()).toEqual(response);
      expect(JSON.parse(again.getState()).log.map((a: { type: string }) => a.type)).toEqual(["SET_FAMILY", "MOVE_POINT", "MOVE_POINT"]);
    });

    await step("a response of the original handed back (boundTo) brings back the graph", async () => {
      const theirs = { record: [{ name: "functionGraphType", base: { string: "linear" } }, { name: "points", base: { string: "-2 -8,6 1" } }] };
      const { canvas, pci: again } = await remountPci(canvasElement, pci, { boundTo: { RESPONSE: theirs } });
      await waitFor(() => expect(coordinates(canvas, "Point 1")).toEqual(["−2", "−8"]));
      expect(original(again.getResponse())).toEqual(["linear", "-2 -8,6 1"]);
      expect(field(again.getResponse(), "equation")).toBe("y = 1.13*x - 5.75");
    });
  },
};

export const Review: Story = {
  args: {
    status: "review",
    boundTo: { RESPONSE: { record: [{ name: "functionGraphType", base: { string: "cosine" } }, { name: "points", base: { string: "0 0,1 3" } }] } },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(family(canvas, "Sine/cosine")).toHaveAttribute("aria-pressed", "true");
    expect(family(canvas, "Linear")).toBeDisabled();
    expect(canvas.getAllByTestId("curve")).toHaveLength(1);
    expect(within(canvas.getByRole("group", { name: /^Point 2/ })).getByRole("textbox", { name: "y" })).toBeDisabled();
    expect(canvas.getByRole("application", { name: /^Graph/ })).toHaveAttribute("aria-disabled", "true");
    await click(canvas, 5, 5);
    expect(original(pci.getResponse())).toEqual(["cosine", "0 0,1 3"]);
  },
};

export const Solution: Story = {
  args: { status: "solution", properties: SETTINGS },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the author's correct function
    expect(family(canvas, "Quadratic")).toHaveAttribute("aria-pressed", "true");
    expect(coordinates(canvas, "Point 1 (vertex)")).toEqual(["2", "20"]);
    expect(canvas.getByTestId("equation")).toHaveTextContent("h = −5(t − 2)² + 20");
    expect(field(pci.getResponse(), "equation")).toBe("y = -5*(x - 2)^2 + 20");
    expect(field(pci.getResponse(), "correct")).toBe(1);
  },
};
