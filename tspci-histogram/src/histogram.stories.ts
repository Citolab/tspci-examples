// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/parcc/extension-parcc-tei/tree/master/views/js/pciCreator/dev/histogramInteraction,
// © 2014-2017 Parcc, Inc. (Sam Sipasseuth, Open Assessment Technologies)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { afterPaint, focusedIn, lastChange, mountPci, openPci, remountPci, retype, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Histogram",
  render: (args) => mountPci(pci, args),
  args: { width: 900 },
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Canvas = MountedPci["canvas"];
type Record = { record: { name: string; base: { integer?: number; string?: string } | null }[] } | undefined;

const field = (response: unknown, name: string) => (response as Record)?.record.find((f) => f.name === name)?.base;
const heights = (response: unknown) => (response as { list: { float: number[] } })?.list.float;

const CLASSES = ["0–10", "10–20", "20–30", "30–40", "40–50"];
const slider = (canvas: Canvas, label: string) => canvas.getByRole("slider", { name: `Height of ${label}` });
const box = (canvas: Canvas, label: string) => canvas.getByRole("textbox", { name: `Height of ${label}` });
const values = (canvas: Canvas) => canvas.getAllByRole("slider").map((s) => Number(s.getAttribute("aria-valuenow")));

const pointer = (type: string, clientY: number, clientX: number) =>
  new PointerEvent(type, { clientX, clientY, bubbles: true, composed: true, pointerId: 1, button: 0, isPrimary: true });

/** Drags a bar's column from its baseline to the screen height of a value (the axis runs from 0 to max). */
const drag = async (canvas: Canvas, label: string, value: number, max = 10) => {
  const bar = slider(canvas, label);
  const column = bar.querySelector("rect")!.getBoundingClientRect(); // the hit area: top − 14 … baseline
  const top = column.top + 14;
  const plotH = column.bottom - top;
  const x = column.left + column.width / 2;
  bar.querySelector("rect")!.dispatchEvent(pointer("pointerdown", column.bottom - 1, x));
  await afterPaint();
  const y = column.bottom - (value / max) * plotH;
  window.dispatchEvent(pointer("pointermove", (column.bottom + y) / 2, x));
  await afterPaint();
  window.dispatchEvent(pointer("pointermove", y, x));
  await afterPaint();
  window.dispatchEvent(pointer("pointerup", y, x));
  await afterPaint();
};

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);

    await step("the travel time example: the prompt and the frequency table", async () => {
      expect(canvas.getByTestId("prompt")).toHaveTextContent(/^The table shows how long 30 students travel to school/);
      const table = within(canvas.getByTestId("data-table"));
      expect(table.getByRole("columnheader", { name: "Travel time (minutes)" })).toBeInTheDocument();
      expect(table.getByRole("rowheader", { name: "10–20" })).toBeInTheDocument();
      expect(table.getAllByRole("cell").map((c) => c.textContent)).toEqual(["4", "9", "8", "6", "3"]);
    });

    await step("a slider per class, all at 0, with the axis titles", async () => {
      expect(canvas.getByRole("group", { name: "Travel time to school" })).toBeInTheDocument();
      expect(canvas.getAllByRole("slider")).toHaveLength(5);
      const first = slider(canvas, "0–10");
      expect(first).toHaveAttribute("aria-valuemin", "0");
      expect(first).toHaveAttribute("aria-valuemax", "10");
      expect(first).toHaveAttribute("aria-valuenow", "0");
      expect(first).toHaveAttribute("tabindex", "0");
      expect(values(canvas)).toEqual([0, 0, 0, 0, 0]);
      expect(canvas.getByTestId("value-title")).toHaveTextContent("Number of students");
      expect(canvas.getByTestId("category-title")).toHaveTextContent("Travel time (minutes)");
      expect(box(canvas, "40–50")).toHaveValue("0");
      expect(canvas.getByRole("button", { name: "Back to the start" })).toBeDisabled();
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;

    await step("the arrow keys move a bar a snap, Page Up a step, End to the top, Home to 0", async () => {
      const bar = slider(canvas, "0–10");
      bar.focus();
      expect(focusedIn(root)).toBe(bar);
      await userEvent.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowDown}");
      expect(bar).toHaveAttribute("aria-valuenow", "4");
      expect(canvas.getByRole("status")).toHaveTextContent("0–10: 4.");
      const response = await lastChange(mounted);
      expect(heights(response)).toEqual([4, 0, 0, 0, 0]);
      expect(box(canvas, "0–10")).toHaveValue("4");

      await userEvent.keyboard("{End}");
      expect(bar).toHaveAttribute("aria-valuenow", "10");
      await userEvent.keyboard("{ArrowUp}");
      expect(bar).toHaveAttribute("aria-valuenow", "10"); // not above the axis
      await userEvent.keyboard("{Home}");
      expect(bar).toHaveAttribute("aria-valuenow", "0");
      await userEvent.keyboard("{ArrowDown}");
      expect(bar).toHaveAttribute("aria-valuenow", "0");
    });

    await step("every bar is a tab stop of its own", async () => {
      const second = slider(canvas, "10–20");
      expect(second).toHaveAttribute("tabindex", "0");
      second.focus();
      expect(focusedIn(root)).toBe(second);
      await userEvent.keyboard("{PageUp}{PageUp}");
      expect(second).toHaveAttribute("aria-valuenow", "2");
      expect(heights(pci.getResponse())).toEqual([0, 2, 0, 0, 0]);
    });

    await step("back to the start", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Back to the start" }));
      expect(values(canvas)).toEqual([0, 0, 0, 0, 0]);
      expect(canvas.getByRole("status")).toHaveTextContent("Every bar is back at its start height.");
      expect(heights(pci.getResponse())).toEqual([0, 0, 0, 0, 0]); // a response: the candidate did something
    });
  },
};

export const DragAndType: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("drag the bars to the heights of the table", async () => {
      const table = [4, 9, 8, 6, 3];
      for (const [i, label] of CLASSES.entries()) await drag(canvas, label, table[i]);
      expect(values(canvas)).toEqual(table);
      expect(canvas.getByRole("status")).toHaveTextContent("40–50: 3.");
      expect(heights(await lastChange(mounted))).toEqual(table);
      expect(pci.evaluation().correct).toBe(true);
    });

    await step("type a height: it is taken while typing, a value off the axis is not", async () => {
      await retype(box(canvas, "10–20"), "7");
      expect(slider(canvas, "10–20")).toHaveAttribute("aria-valuenow", "7");
      await retype(box(canvas, "10–20"), "-3");
      expect(box(canvas, "10–20")).toHaveAttribute("aria-invalid", "true");
      expect(canvas.getByText("A number from 0 to 10.")).toBeInTheDocument();
      expect(slider(canvas, "10–20")).toHaveAttribute("aria-valuenow", "7");
      await retype(box(canvas, "10–20"), "8,6"); // a decimal comma, rounded to the grid of 1
      await userEvent.tab();
      expect(slider(canvas, "10–20")).toHaveAttribute("aria-valuenow", "9");
      expect(box(canvas, "10–20")).toHaveValue("9");
      expect(canvas.getByRole("status")).toHaveTextContent("10–20: 9 (rounded to the grid).");
      expect(heights(pci.getResponse())).toEqual([4, 9, 8, 6, 3]);
    });
  },
};

export const ScoredByThePci: Story = {
  args: { properties: { scoring: "pci", pciScore: "bar", tolerance: "1" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("a record with the score per right bar, within the tolerance", async () => {
      for (const [label, value] of [["0–10", "5"], ["10–20", "9"], ["20–30", "6"]] as const) await retype(box(canvas, label), value);
      const response = await lastChange(mounted);
      expect(field(response, "score")?.integer).toBe(2); // 5 for 4 is within 1, 6 for 8 is not
      expect(field(response, "maxscore")?.integer).toBe(5);
      expect(field(response, "barsCorrect")?.integer).toBe(2);
      expect(field(response, "correct")?.integer).toBe(0);
      expect(JSON.parse(field(response, "heights")!.string!)).toEqual([5, 9, 6, 0, 0]);
    });

    await step("every bar right: the full score", async () => {
      for (const [label, value] of [["20–30", "8"], ["30–40", "6"], ["40–50", "3"]] as const) await retype(box(canvas, label), value);
      expect(field(pci.getResponse(), "score")?.integer).toBe(5);
      expect(field(pci.getResponse(), "correct")?.integer).toBe(1);
    });
  },
};

export const BarChartFromObservations: Story = {
  args: {
    properties: {
      prompt: "The list shows the favourite fruit of 12 students. Make the bar chart.",
      chartType: "bar",
      bars: "Apple\nBanana\nPear\nGrape",
      dataDisplay: "list",
      data: "apple, banana, apple, pear, grape, apple, banana, apple, pear, grape, apple, banana",
      max: "6",
      title: "Favourite fruit",
      valueTitle: "Students",
      colors: "#16a34a, #ca8a04, #65a30d, #7c3aed",
      locked: "4",
      startHeights: "0;0;0;2",
    },
  },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("the observations as a list, a labelled bar each", async () => {
      expect(canvas.getByTestId("prompt")).toHaveTextContent("favourite fruit of 12 students");
      expect(within(canvas.getByTestId("data-list")).getAllByRole("listitem")).toHaveLength(12);
      expect(canvas.getByText("(12 observations)")).toBeInTheDocument();
      expect(canvas.getAllByRole("slider")).toHaveLength(4);
      expect(slider(canvas, "Apple")).toHaveAttribute("aria-valuemax", "6");
      expect(canvas.queryByTestId("category-title")).toBeNull();
    });

    await step("a given bar cannot be changed", async () => {
      const grape = slider(canvas, "Grape");
      expect(grape).toHaveAttribute("aria-readonly", "true");
      expect(grape).toHaveAttribute("aria-valuetext", "2, given, cannot be changed");
      grape.focus();
      await userEvent.keyboard("{ArrowUp}");
      expect(grape).toHaveAttribute("aria-valuenow", "2");
      expect(canvas.getByRole("status")).toHaveTextContent("Grape is given and cannot be changed.");
      expect(box(canvas, "Grape")).toBeDisabled();
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("the tallied counts are the correct heights", async () => {
      for (const [label, value] of [["Apple", "5"], ["Banana", "3"], ["Pear", "2"]] as const) await retype(box(canvas, label), value);
      expect(heights(await lastChange(mounted))).toEqual([5, 3, 2, 2]);
      expect(pci.evaluation().correct).toBe(true);
      expect(pci.getCorrectResponse({ chartType: "bar", bars: "A\nB", data: "a, a, b", dataDisplay: "list" })).toEqual({ list: { float: [2, 1] } });
    });
  },
};

export const RestoreState: Story = {
  play: async ({ canvasElement, step }) => {
    const first = await openPci(canvasElement);

    await step("set two bars", async () => {
      await retype(box(first.canvas, "0–10"), "4");
      await retype(box(first.canvas, "30–40"), "6");
      await lastChange(first);
    });

    const saved = first.pci.getState();
    await step("the state has the heights and a log of every change", async () => {
      const parsed = JSON.parse(saved);
      expect(parsed.state).toEqual({ heights: [4, 0, 0, 6, 0], touched: true });
      expect(parsed.log.filter((a: { type: string }) => a.type === "SET_HEIGHT").map((a: { payload: unknown }) => a.payload))
        .toEqual([{ bar: 0, height: 4, how: "typed" }, { bar: 3, height: 6, how: "typed" }]);
    });

    await step("coming back: the same heights and response", async () => {
      const { canvas, pci: again } = await remountPci(canvasElement, pci, { state: saved });
      expect(values(canvas)).toEqual([4, 0, 0, 6, 0]);
      expect(heights(again.getResponse())).toEqual([4, 0, 0, 6, 0]);
    });

    await step("a response handed back (boundTo) without a state", async () => {
      const { canvas, pci: again } = await remountPci(canvasElement, pci, { boundTo: { RESPONSE: { list: { float: [1, 2, 3, 4, 5] } } } });
      expect(values(canvas)).toEqual([1, 2, 3, 4, 5]);
      expect(heights(again.getResponse())).toEqual([1, 2, 3, 4, 5]);
    });
  },
};

export const Review: Story = {
  args: { status: "review", boundTo: { RESPONSE: { list: { float: [4, 8, 8, 6, 2] } } } },
  play: async ({ canvasElement }) => {
    const { canvas, root } = await openPci(canvasElement);
    expect(values(canvas)).toEqual([4, 8, 8, 6, 2]);
    const bar = slider(canvas, "0–10");
    expect(bar).toHaveAttribute("aria-readonly", "true");
    expect(bar).toHaveAttribute("tabindex", "-1");
    bar.focus();
    expect(focusedIn(root)).toBe(bar);
    await userEvent.keyboard("{ArrowUp}");
    expect(bar).toHaveAttribute("aria-valuenow", "4");
    expect(box(canvas, "0–10")).toBeDisabled();
    expect(canvas.queryByRole("button", { name: "Back to the start" })).toBeNull();
  },
};

export const Solution: Story = {
  args: { status: "solution" },
  play: async ({ canvasElement, step }) => {
    const { canvas } = await openPci(canvasElement);
    await step("the correct heights from the data", async () => {
      expect(canvas.getByText("The correct heights.")).toBeInTheDocument();
      expect(values(canvas)).toEqual([4, 9, 8, 6, 3]);
    });
    await step("or the response declaration's correct response", async () => {
      const { canvas: again } = await remountPci(canvasElement, pci, {
        status: "solution", responseDeclaration: { correctResponse: { value: ["1", "2", "3", "4", "5"] } },
      });
      expect(values(again)).toEqual([1, 2, 3, 4, 5]);
    });
  },
};

export const HistogramFromObservationsInDutch: Story = {
  args: {
    width: 360,
    properties: {
      language: "nl",
      prompt: "Hieronder staan de lengtes (in cm) van 10 planten. Teken het histogram.",
      classes: "0;2,5;5;7,5",
      dataDisplay: "list",
      data: "1,2 3 4,9 5 6,1 7,5 2,4 0,3 5,5 3,3",
      max: "5",
      step: "1",
      snap: "0,5",
      valueTitle: "Aantal planten",
      categoryTitle: "Lengte (cm)",
    },
  },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("narrow, in Dutch, with class boundaries with a decimal comma", async () => {
      expect(canvas.getByText("(10 waarnemingen)")).toBeInTheDocument();
      expect(canvas.getByRole("slider", { name: "Hoogte van 2,5–5" })).toBeInTheDocument();
      const svg = canvas.getByTestId("chart");
      expect(svg.getBoundingClientRect().width).toBeLessThanOrEqual(360);
      expect(canvas.getByText("Terug naar het begin")).toBeInTheDocument();
    });

    await step("half steps with the keyboard", async () => {
      const bar = canvas.getByRole("slider", { name: "Hoogte van 0–2,5" });
      bar.focus();
      await userEvent.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
      expect(bar).toHaveAttribute("aria-valuenow", "1.5");
      expect(bar).toHaveAttribute("aria-valuetext", "1,5");
      expect(canvas.getByRole("status")).toHaveTextContent("0–2,5: 1,5.");
      await userEvent.keyboard("{PageUp}{ArrowUp}");
      expect(heights(await lastChange(mounted))).toEqual([3, 0, 0]);
    });

    await step("the tally: 3, 3 and 4 (7,5 is in the last class)", async () => {
      await retype(canvas.getByRole("textbox", { name: "Hoogte van 2,5–5" }), "3");
      await retype(canvas.getByRole("textbox", { name: "Hoogte van 5–7,5" }), "4");
      await waitFor(() => expect(pci.evaluation().correct).toBe(true));
    });
  },
};
