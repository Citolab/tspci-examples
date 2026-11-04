// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Lentillespci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { afterPaint, focusedIn, lastChange, mountPci, openPci, remountPci, retype, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import { PLOT, VIEW_W } from "./plot";
import pci from "./index";

const meta = {
  title: "Graph builder",
  render: (args) => mountPci(pci, args),
  args: { width: 1000 },
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Canvas = MountedPci["canvas"];
type Record = { record: { name: string; base: { integer?: number; string?: string } | null }[] } | undefined;

/** A field of the record response. */
const field = (response: unknown, name: string) => (response as Record)?.record.find((f) => f.name === name)?.base;
const integer = (response: unknown, name: string) => field(response, name)?.integer;
const graph = (response: unknown) => JSON.parse(field(response, "graph")!.string!);

const LENTILS: [number, number][] = [[0, 0], [2, 0.2], [3, 1], [4, 2], [5, 3.8], [6, 5.3], [7, 6.4], [8, 11.7]];

/** The screen position of a point of the graph, for a scale with these maxima. */
const at = (svg: Element, x: number, y: number, xMax: number, yMax: number) => {
  const r = svg.getBoundingClientRect();
  const k = r.width / VIEW_W;
  return { clientX: r.left + (PLOT.left + (x / xMax) * PLOT.width) * k, clientY: r.top + (PLOT.top + PLOT.height - (y / yMax) * PLOT.height) * k };
};
const pointer = (type: string, position: { clientX: number; clientY: number }) =>
  new PointerEvent(type, { ...position, bubbles: true, composed: true, pointerId: 1, button: 0, isPrimary: true });

/** Clicks on the graph where the point (x, y) is. */
const plot = async (canvas: Canvas, x: number, y: number, xMax = 10, yMax = 10) => {
  const svg = canvas.getByTestId("plot");
  const p = at(svg, x, y, xMax, yMax);
  svg.dispatchEvent(pointer("pointerdown", p));
  window.dispatchEvent(pointer("pointerup", p));
  await afterPaint();
};

/** Drags the point with this index to (x, y), or to a position on the screen. */
const dragPoint = async (canvas: Canvas, index: number, to: { clientX: number; clientY: number }) => {
  const mark = canvas.getByTestId("plot").querySelector(`[data-point="${index}"] path`)!;
  const r = mark.getBoundingClientRect();
  mark.dispatchEvent(pointer("pointerdown", { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  await afterPaint();
  window.dispatchEvent(pointer("pointermove", to));
  await afterPaint();
  window.dispatchEvent(pointer("pointerup", to));
  await afterPaint();
};

const axis = (canvas: Canvas, name: RegExp | string) => within(canvas.getByRole("group", { name }));

/** Chooses the quantity and unit of an axis and types its scale. */
const setAxis = async (canvas: Canvas, name: string, quantity: string, unit: string, max?: string, step?: string) => {
  const a = axis(canvas, name);
  await userEvent.selectOptions(a.getAllByRole("combobox")[0], quantity);
  await userEvent.selectOptions(a.getAllByRole("combobox")[1], unit);
  if (max !== undefined) await retype(a.getAllByRole("textbox")[0], max);
  if (step !== undefined) await retype(a.getAllByRole("textbox")[1], step);
};

const points = (canvas: Canvas) => canvas.queryAllByRole("button", { name: /^Delete point \(/ }).map((b) => b.getAttribute("aria-label")!.slice("Delete point ".length));

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);

    await step("the lentils: a picture per day with a ruler", async () => {
      expect(canvas.getByTestId("prompt")).toHaveTextContent(/^Lentils were put to sprout/);
      const pictures = within(canvas.getByTestId("pictures")).getAllByRole("img");
      expect(pictures).toHaveLength(8);
      expect(pictures[2]).toHaveAccessibleName("Day 3: 1 cm");
      expect(pictures[7]).toHaveAccessibleName("Day 8: 11.7 cm");
    });

    await step("step 1: an empty table with a row per measurement", async () => {
      expect(canvas.getByRole("heading", { name: "Step 1: table" })).toBeInTheDocument();
      expect(canvas.getByRole("textbox", { name: "Row 8, column 2" })).toHaveValue("");
      expect(canvas.queryByRole("textbox", { name: "Row 9, column 1" })).toBeNull();
    });

    await step("step 2: the graph, nothing chosen, a scale of 10 by 1", async () => {
      expect(canvas.getByRole("heading", { name: "Step 2: graph" })).toBeInTheDocument();
      expect(axis(canvas, "Horizontal axis").getAllByRole("combobox")[0]).toHaveValue("");
      expect(axis(canvas, "Vertical axis").getByRole("textbox", { name: "Largest value" })).toHaveValue("10");
      expect(canvas.getByTestId("x-label")).toHaveTextContent("?");
      expect(canvas.getByRole("application", { name: /^Graph/ })).toBeInTheDocument();
      expect(canvas.getByText("0 points")).toBeInTheDocument();
      expect(canvas.getByRole("button", { name: "Draw the line" })).toBeDisabled();
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const FillTheTable: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("type the headings and the measurements", async () => {
      await userEvent.type(canvas.getByRole("textbox", { name: "Heading of column 1" }), "Time (days)");
      await userEvent.type(canvas.getByRole("textbox", { name: "Heading of column 2" }), "Length (cm)");
      // in another order than the pictures
      const rows = [LENTILS[7], ...LENTILS.slice(0, 7)];
      for (const [r, [x, y]] of rows.entries()) {
        await userEvent.type(canvas.getByRole("textbox", { name: `Row ${r + 1}, column 1` }), String(x));
        await userEvent.type(canvas.getByRole("textbox", { name: `Row ${r + 1}, column 2` }), String(y));
      }
      const response = await lastChange(mounted);
      expect(integer(response, "checkTable")).toBe(1);
      expect(integer(response, "tableCells")).toBe(16);
      expect(integer(response, "score")).toBe(1);
      expect(integer(response, "maxscore")).toBe(6);
      expect(JSON.parse(field(response, "table")!.string!)).toEqual({
        headers: ["Time (days)", "Length (cm)"],
        rows: [["8", "11.7"], ["0", "0"], ["2", "0.2"], ["3", "1"], ["4", "2"], ["5", "3.8"], ["6", "5.3"], ["7", "6.4"]],
      });
    });

    await step("a wrong value: one cell less, the table check fails", async () => {
      await retype(canvas.getByRole("textbox", { name: "Row 1, column 2" }), "11");
      expect(integer(pci.getResponse(), "checkTable")).toBe(0);
      expect(integer(pci.getResponse(), "tableCells")).toBe(15);
    });
  },
};

export const BuildTheGraph: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("choose the quantities and units, and a vertical scale up to 12", async () => {
      await setAxis(canvas, "Horizontal axis", "Time", "days");
      await setAxis(canvas, "Vertical axis", "Length of the sprout", "cm", "12");
      expect(canvas.getByTestId("x-label")).toHaveTextContent("Time (days)");
      expect(canvas.getByTestId("y-label")).toHaveTextContent("Length of the sprout (cm)");
      const response = await lastChange(mounted);
      expect(integer(response, "checkAxes")).toBe(1);
      expect(integer(response, "checkScale")).toBe(1);
      expect(graph(response).y).toEqual({ quantity: "Length of the sprout", unit: "cm", max: 12, step: 1 });
    });

    await step("a scale that cannot be drawn is not taken", async () => {
      const y = axis(canvas, "Vertical axis");
      await retype(y.getByRole("textbox", { name: "Step" }), "0");
      expect(y.getByRole("textbox", { name: "Step" })).toHaveAttribute("aria-invalid", "true");
      expect(graph(pci.getResponse()).y.step).toBe(1);
      await retype(y.getByRole("textbox", { name: "Step" }), "1");
    });

    await step("click on the grid to plot the measurements", async () => {
      for (const [x, y] of LENTILS) await plot(canvas, x, y, 10, 12);
      expect(points(canvas)).toEqual(["(0, 0)", "(2, 0.2)", "(3, 1)", "(4, 2)", "(5, 3.8)", "(6, 5.3)", "(7, 6.4)", "(8, 11.7)"]);
      expect(canvas.getByRole("status")).toHaveTextContent("Point placed at (8, 11.7).");
      expect(integer(pci.getResponse(), "checkPoints")).toBe(1);
      expect(integer(pci.getResponse(), "pointsMatched")).toBe(8);
    });

    await step("draw the line", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Draw the line" }));
      expect(canvas.getByTestId("line")).toBeInTheDocument();
      expect(canvas.getByRole("button", { name: "Remove the line" })).toBeEnabled();
      const response = await lastChange(mounted);
      expect(integer(response, "checkLine")).toBe(1);
      expect(integer(response, "score")).toBe(5); // all but the table
      expect(integer(response, "correct")).toBe(0);
    });

    await step("drag a point to move it", async () => {
      const svg = canvas.getByTestId("plot");
      await dragPoint(canvas, 4, at(svg, 5, 5, 10, 12));
      expect(points(canvas)[4]).toBe("(5, 5)");
      expect(canvas.getByRole("status")).toHaveTextContent("Point moved to (5, 5).");
      expect(integer(pci.getResponse(), "checkPoints")).toBe(0);
    });

    await step("drag it off the graph to remove it; delete another with its button", async () => {
      const r = canvas.getByTestId("plot").getBoundingClientRect();
      await dragPoint(canvas, 4, { clientX: r.right + 40, clientY: r.top + 100 });
      expect(points(canvas)).toHaveLength(7);
      expect(canvas.getByRole("status")).toHaveTextContent("Point (5, 5) removed.");
      await userEvent.click(canvas.getByRole("button", { name: "Delete point (0, 0)" }));
      expect(points(canvas)).toHaveLength(6);
      expect(integer(pci.getResponse(), "pointsMatched")).toBe(6);
    });

    await step("remove all points", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Remove all points" }));
      expect(points(canvas)).toEqual([]);
      expect(canvas.queryByTestId("line")).toBeNull();
      expect(graph(pci.getResponse())).toMatchObject({ points: [], line: false });
    });
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, root, pci } = await openPci(canvasElement);
    const svg = canvas.getByRole("application", { name: /^Graph/ });

    await step("the arrow keys move the cursor, Shift a whole step, Enter places a point", async () => {
      svg.focus();
      expect(focusedIn(root)).toBe(svg);
      await userEvent.keyboard("{Shift>}{ArrowRight}{ArrowRight}{/Shift}{ArrowUp}{ArrowUp}");
      expect(canvas.getByRole("status")).toHaveTextContent("Cursor at (2, 0.2).");
      expect(canvas.getByTestId("cursor")).toBeInTheDocument();
      await userEvent.keyboard("{Enter}");
      expect(points(canvas)).toEqual(["(2, 0.2)"]);
      expect(canvas.getByRole("status")).toHaveTextContent("Point placed at (2, 0.2).");
    });

    await step("Enter on a point selects it; the arrows move it; Escape lets go", async () => {
      await userEvent.keyboard("{Enter}");
      expect(canvas.getByRole("status")).toHaveTextContent(/^Point \(2, 0.2\) selected/);
      expect(canvas.getByRole("button", { name: "Delete point" })).toBeEnabled();
      await userEvent.keyboard("{Shift>}{ArrowRight}{/Shift}{ArrowUp}");
      expect(points(canvas)).toEqual(["(3, 0.3)"]);
      await userEvent.keyboard("{Escape}");
      expect(canvas.getByRole("button", { name: "Delete point" })).toBeDisabled();
    });

    await step("Delete removes a selected point", async () => {
      await userEvent.keyboard("{Enter}{Delete}");
      expect(points(canvas)).toEqual([]);
      expect(canvas.getByRole("status")).toHaveTextContent("Point (3, 0.3) removed.");
      expect(pci.getResponse()).toBeUndefined(); // back where it started: no response
    });
  },
};

export const Settings: Story = {
  args: {
    properties: {
      prompt: "The table gives the temperature of a cup of tea as it cools. Draw a graph of the temperature against time.",
      data: "0;80\n5;62\n10;50\n15;41\n20;35",
      xQuantity: "Time", xUnit: "min", yQuantity: "Temperature", yUnit: "°C",
      quantityOptions: "Mass;Volume", unitOptions: "s;h;K",
      dataSource: "table", tableStep: "false", askTitle: "false", xScale: "20;5", yScale: "100;10",
      pointsAxes: "2", pointsLine: "0",
    },
  },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("the data in a table, no pictures, no table step, no title", async () => {
      expect(canvas.getByTestId("data-table")).toHaveTextContent("Temperature (°C)");
      expect(canvas.queryByTestId("pictures")).toBeNull();
      expect(canvas.queryByRole("heading", { name: "Step 1: table" })).toBeNull();
      expect(canvas.getByRole("heading", { name: "Graph" })).toBeInTheDocument();
      expect(canvas.queryByRole("textbox", { name: "Title of the graph" })).toBeNull();
      const options = axis(canvas, "Vertical axis").getAllByRole("combobox")[0].querySelectorAll("option");
      expect([...options].map((o) => o.textContent)).toEqual(["— choose —", "Mass", "Temperature", "Time", "Volume"]);
    });

    await step("the author's points per check: axes 2, scale 1, points 2, no line", async () => {
      await setAxis(canvas, "Horizontal axis", "Time", "min");
      await setAxis(canvas, "Vertical axis", "Temperature", "°C");
      for (const [x, y] of [[0, 80], [5, 62], [10, 50], [15, 41], [20, 35]]) await plot(canvas, x, y, 20, 100);
      const response = await lastChange(mounted);
      expect(integer(response, "maxscore")).toBe(5);
      expect(integer(response, "score")).toBe(5);
      expect(integer(response, "correct")).toBe(1);
      expect(integer(response, "checkLine")).toBe(0);
      expect(pci.evaluation().scored).toEqual(["axes", "scale", "points"]);
    });
  },
};

export const French: Story = {
  args: { properties: { language: "fr" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByTestId("prompt")).toHaveTextContent(/^Des lentilles ont été mises à germer/);
    expect(within(canvas.getByTestId("pictures")).getAllByRole("img")[1]).toHaveAccessibleName("Jour 2 : 0,2 cm");
    expect(canvas.getByRole("heading", { name: "Étape 1 : tableau" })).toBeInTheDocument();
    await setAxis(canvas, "Axe vertical", "Longueur de la pousse", "cm", "12");
    await plot(canvas, 2, 0.2, 10, 12);
    await plot(canvas, 5, 3.8, 10, 12);
    expect(canvas.queryAllByRole("button", { name: /^Supprimer le point \(/ }).map((b) => b.getAttribute("aria-label")))
      .toEqual(["Supprimer le point (2 ; 0,2)", "Supprimer le point (5 ; 3,8)"]);
    await userEvent.click(canvas.getByRole("button", { name: "Tracer la courbe" }));
    expect(canvas.getByRole("status")).toHaveTextContent("Les points sont reliés par une courbe.");
    expect(canvas.getByRole("button", { name: "Effacer la courbe" })).toBeInTheDocument();
    expect(graph(pci.getResponse())).toMatchObject({ points: [{ x: 2, y: 0.2 }, { x: 5, y: 3.8 }], line: true });
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", tableScoring: "cell" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(within(canvas.getByTestId("pictures")).getAllByRole("img")[4]).toHaveAccessibleName("Dag 5: 3,8 cm");
    expect(canvas.getByRole("heading", { name: "Stap 2: grafiek" })).toBeInTheDocument();
    // a decimal comma in the table counts; with scoring per cell a point for each right cell
    await userEvent.type(canvas.getByRole("textbox", { name: "Rij 1, kolom 1" }), "5");
    await userEvent.type(canvas.getByRole("textbox", { name: "Rij 1, kolom 2" }), "3,8");
    expect(integer(pci.getResponse(), "tableCells")).toBe(2);
    expect(integer(pci.getResponse(), "score")).toBe(2);
    expect(integer(pci.getResponse(), "maxscore")).toBe(16 + 5);
    await retype(axis(canvas, "Verticale as").getByRole("textbox", { name: "Grootste waarde" }), "12,5");
    expect(axis(canvas, "Verticale as").getByRole("textbox", { name: "Stap" })).not.toHaveAttribute("aria-invalid");
    expect(graph(pci.getResponse()).y.max).toBe(12.5);
    await plot(canvas, 2, 0.2, 10, 12.5);
    expect(canvas.getByRole("status")).toHaveTextContent("Punt gezet op (2; 0,2).");
  },
};

export const RestoreState: Story = {
  play: async ({ canvasElement, step }) => {
    const first = await openPci(canvasElement);

    await step("work in a first session", async () => {
      await userEvent.type(first.canvas.getByRole("textbox", { name: "Row 1, column 1" }), "0");
      await userEvent.type(first.canvas.getByRole("textbox", { name: "Title of the graph" }), "Lentils");
      await setAxis(first.canvas, "Vertical axis", "Length of the sprout", "cm", "12", "2");
      await plot(first.canvas, 3, 1, 10, 12);
      await userEvent.click(first.canvas.getByRole("button", { name: "Delete point (3, 1)" }));
      await plot(first.canvas, 4, 2, 10, 12);
    });

    const saved = first.pci.getState();
    const response = first.pci.getResponse();

    await step("the state brings everything back, with the log", async () => {
      const { canvas, pci: again } = await remountPci(canvasElement, pci, { state: saved });
      expect(canvas.getByRole("textbox", { name: "Row 1, column 1" })).toHaveValue("0");
      expect(canvas.getByRole("textbox", { name: "Title of the graph" })).toHaveValue("Lentils");
      expect(axis(canvas, "Vertical axis").getByRole("textbox", { name: "Step" })).toHaveValue("2");
      expect(points(canvas)).toEqual(["(4, 2)"]);
      expect(again.getResponse()).toEqual(response);
      const log = JSON.parse(again.getState()).log.map((a: { type: string }) => a.type);
      expect(log).toContain("REMOVE_POINT");
    });

    await step("a response handed back (boundTo) brings back the graph and the table", async () => {
      const { canvas, pci: again } = await remountPci(canvasElement, pci, { boundTo: { RESPONSE: response } });
      await waitFor(() => expect(points(canvas)).toEqual(["(4, 2)"]));
      expect(canvas.getByTestId("y-label")).toHaveTextContent("Length of the sprout (cm)");
      expect(again.getResponse()).toEqual(response);
    });
  },
};

export const Review: Story = {
  args: {
    status: "review",
    boundTo: {
      RESPONSE: { record: [{ name: "graph", base: { string: JSON.stringify({ x: { quantity: "Time", unit: "days", max: 10, step: 1 }, y: { quantity: "Mass", unit: "g", max: 12, step: 1 }, points: [{ x: 2, y: 0.2 }, { x: 3, y: 1 }], line: true }) } }] },
    },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(points(canvas)).toEqual(["(2, 0.2)", "(3, 1)"]);
    expect(canvas.getByTestId("line")).toBeInTheDocument();
    expect(canvas.getByRole("textbox", { name: "Row 1, column 1" })).toBeDisabled();
    expect(axis(canvas, "Vertical axis").getAllByRole("combobox")[0]).toBeDisabled();
    expect(canvas.getByRole("button", { name: "Remove the line" })).toBeDisabled();
    expect(canvas.getByRole("button", { name: "Delete point (2, 0.2)" })).toBeDisabled();
    await plot(canvas, 5, 5, 10, 12);
    expect(points(canvas)).toHaveLength(2);
    expect(integer(pci.getResponse(), "checkAxes")).toBe(0);
  },
};

export const Solution: Story = {
  args: { status: "solution" },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the finished graph of the data: a scale of 12 by 2, every measurement, the line, the table
    expect(points(canvas)).toHaveLength(8);
    expect(canvas.getByTestId("line")).toBeInTheDocument();
    expect(axis(canvas, "Vertical axis").getByRole("textbox", { name: "Largest value" })).toHaveValue("12");
    expect(canvas.getByRole("textbox", { name: "Row 8, column 2" })).toHaveValue("11.7");
    expect(integer(pci.getResponse(), "score")).toBe(6);
    expect(integer(pci.getResponse(), "correct")).toBe(1);
  },
};
