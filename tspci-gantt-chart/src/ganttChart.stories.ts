import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, fireEvent, userEvent, waitFor } from "storybook/test";
import { focusedIn, lastChange, mountPci, openPci, remountPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

// The defaults: 30 days from Monday 2 March 2026, weekends unavailable, three tasks
const meta = {
  title: "Gantt chart",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

/** The response string of the original, with single quotes. */
const response = (text: string, state: number[][]) => ({
  base: { string: JSON.stringify({ response: text, state }).replace(/"/g, "'") },
});

const cell = (root: ShadowRoot | HTMLElement, task: number, slot: number) =>
  root.querySelector<HTMLElement>(`td[data-task="${task}"][data-slot="${slot}"]`)!;

/** The selected slots of a task, as the grid shows them. */
const selectedSlots = (root: ShadowRoot | HTMLElement, task: number) =>
  [...root.querySelectorAll<HTMLElement>(`td[data-task="${task}"][aria-selected="true"]`)].map((td) => Number(td.dataset.slot));

const middle = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
};

/**
 * A drag with the mouse, as the grid listens to it: pointerdown on a slot (or a handle), pointermove and pointerup on
 * the row, with the x of the slot to end on. (pointerId 1 is the mouse: setPointerCapture accepts it.)
 */
const drag = async (root: ShadowRoot | HTMLElement, from: Element, task: number, toSlot: number) => {
  const pointer = { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0 };
  const tbody = root.querySelector("tbody")!;
  fireEvent.pointerDown(from, { ...pointer, ...middle(from) });
  const to = middle(cell(root, task, toSlot));
  fireEvent.pointerMove(tbody, { ...pointer, ...to, buttons: 1 });
  fireEvent.pointerUp(tbody, { ...pointer, ...to });
};

/** A click on a slot: down and up without moving. */
const click = async (root: ShadowRoot | HTMLElement, task: number, slot: number) => {
  const pointer = { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0 };
  const target = cell(root, task, slot);
  fireEvent.pointerDown(target, { ...pointer, ...middle(target) });
  fireEvent.pointerUp(root.querySelector("tbody")!, { ...pointer, ...middle(target) });
};

const summary = (root: ShadowRoot | HTMLElement) => [...root.querySelectorAll('[data-testid="summary"] li')].map((li) => li.textContent);

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci, root } = await openPci(canvasElement);

    await step("a grid with a row per task and a slot per day, and no response", async () => {
      expect(canvas.getByText("Plan the project: drag on a row to mark when each task takes place.")).toBeInTheDocument();
      const grid = canvas.getByRole("grid", { name: "Plan the project: drag on a row to mark when each task takes place." });
      expect(grid).toBeInTheDocument();
      expect(canvas.getAllByRole("rowheader").map((th) => th.textContent)).toEqual(["Task #1", "Task #2", "Task #3"]);
      expect(root.querySelectorAll('td[data-task="0"]')).toHaveLength(30);
      expect(canvas.getByRole("gridcell", { name: "Task #1, Mon 2 Mar" })).toBeInTheDocument();
      // the month and week-day header rows
      expect(canvas.getByRole("columnheader", { name: "March" })).toBeInTheDocument();
      expect(canvas.getAllByRole("columnheader", { name: "Sat" })).toHaveLength(4);
      expect(summary(root)).toEqual(["Task #1: not planned", "Task #2: not planned", "Task #3: not planned"]);
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("weekends are unavailable", async () => {
      const saturday = canvas.getByRole("gridcell", { name: "Task #1, Sat 7 Mar, unavailable" });
      expect(saturday).toHaveAttribute("aria-disabled", "true");
      await click(root, 0, 5);
      expect(selectedSlots(root, 0)).toEqual([]);
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const DragAndClick: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { pci, root } = mounted;

    await step("dragging over empty slots paints a bar", async () => {
      await drag(root, cell(root, 0, 0), 0, 2);
      await waitFor(() => expect(selectedSlots(root, 0)).toEqual([0, 1, 2]));
      expect(pci.getResponse()).toEqual(response("2/3 - 4/3;;", [[1, 2, 3], [], []]));
      expect(await lastChange(mounted)).toEqual(response("2/3 - 4/3;;", [[1, 2, 3], [], []]));
      expect(summary(root)[0]).toBe("Task #1: Mon 2 Mar to Wed 4 Mar");
    });

    await step("dragging the bar moves it, keeping its length", async () => {
      await drag(root, cell(root, 0, 1), 0, 3);
      await waitFor(() => expect(selectedSlots(root, 0)).toEqual([2, 3, 4]));
      expect(pci.getResponse()).toEqual(response("4/3 - 6/3;;", [[3, 4, 5], [], []]));
    });

    await step("dragging the end of the bar makes it longer, over the weekend", async () => {
      const end = cell(root, 0, 4).querySelector('[data-handle="end"]')!;
      await drag(root, end, 0, 8);
      await waitFor(() => expect(selectedSlots(root, 0)).toEqual([2, 3, 4, 7, 8]));
      expect(pci.getResponse()).toEqual(response("4/3 - 6/3, 9/3 - 10/3;;", [[3, 4, 5, 8, 9], [], []]));
    });

    await step("dragging the start makes it shorter", async () => {
      const start = cell(root, 0, 2).querySelector('[data-handle="start"]')!;
      await drag(root, start, 0, 3);
      await waitFor(() => expect(selectedSlots(root, 0)).toEqual([3, 4, 7, 8]));
    });

    await step("a click switches a single slot, on another task as well", async () => {
      await click(root, 0, 7);
      await click(root, 2, 10);
      await waitFor(() => expect(selectedSlots(root, 2)).toEqual([10]));
      expect(selectedSlots(root, 0)).toEqual([3, 4, 8]);
      expect(pci.getResponse()).toEqual(response("5/3 - 6/3, 10/3;;12/3", [[4, 5, 9], [], [11]]));
    });
  },
};

export const MoveOverWeekend: Story = {
  args: { boundTo: { RESPONSE: response("", [[1, 2, 3, 4, 5], [], []]) } },
  play: async ({ canvasElement }) => {
    const { pci, root } = await openPci(canvasElement);
    await waitFor(() => expect(selectedSlots(root, 0)).toEqual([0, 1, 2, 3, 4]));
    // a bar of five working days moved a day stays five working days: the weekend is skipped
    await drag(root, cell(root, 0, 2), 0, 3);
    await waitFor(() => expect(selectedSlots(root, 0)).toEqual([1, 2, 3, 4, 7]));
    expect(pci.getResponse()).toEqual(response("3/3 - 6/3, 9/3;;", [[2, 3, 4, 5, 8], [], []]));
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;
    const first = canvas.getByRole("gridcell", { name: "Task #1, Mon 2 Mar" });
    // a roving tabindex: only the cursor is in the tab order
    expect(first).toHaveAttribute("tabindex", "0");
    expect(root.querySelectorAll('td[tabindex="0"]')).toHaveLength(1);
    first.focus();

    await step("arrows move the cursor, Space switches a slot", async () => {
      await userEvent.keyboard("{ArrowDown}{ArrowRight}");
      const cursor = canvas.getByRole("gridcell", { name: "Task #2, Tue 3 Mar" });
      // toHaveFocus looks at document.activeElement, which is the host: the focus within the shadow root
      await waitFor(() => expect(focusedIn(root)).toBe(cursor));
      await userEvent.keyboard(" ");
      await waitFor(() => expect(selectedSlots(root, 1)).toEqual([1]));
      expect(pci.getResponse()).toEqual(response(";3/3;", [[], [2], []]));
      expect(await lastChange(mounted)).toEqual(response(";3/3;", [[], [2], []]));
    });

    await step("Shift+→ makes the bar longer, Shift+← shorter", async () => {
      await userEvent.keyboard("{Shift>}{ArrowRight}{ArrowRight}{ArrowRight}{/Shift}");
      await waitFor(() => expect(selectedSlots(root, 1)).toEqual([1, 2, 3, 4]));
      await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}");
      await waitFor(() => expect(selectedSlots(root, 1)).toEqual([1, 2, 3]));
      expect(pci.getResponse()).toEqual(response(";3/3 - 5/3;", [[], [2, 3, 4], []]));
    });

    await step("Alt+→ moves the bar, Delete removes it", async () => {
      await userEvent.keyboard("{Alt>}{ArrowRight}{/Alt}");
      await waitFor(() => expect(selectedSlots(root, 1)).toEqual([2, 3, 4]));
      expect(summary(root)[1]).toBe("Task #2: Wed 4 Mar to Fri 6 Mar");
      // the announcement for a screen reader
      expect(root.querySelector('[aria-live="polite"]')).toHaveTextContent("Task #2: Wed 4 Mar to Fri 6 Mar");
      await userEvent.keyboard("{Delete}");
      await waitFor(() => expect(selectedSlots(root, 1)).toEqual([]));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Hours: Story = {
  args: { properties: { useHours: "true", showTimeRange: "true", period: "1", dayStart: "8", dayEnd: "10", months: "false" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci, root } = await openPci(canvasElement);
    // a single day: the slots are the hours, from 8:00 to the last one starting at 10:00
    expect(root.querySelectorAll('td[data-task="0"]')).toHaveLength(3);
    expect(canvas.getByRole("columnheader", { name: "08:00-09:00" })).toBeInTheDocument();
    expect(canvas.getByRole("columnheader", { name: "10:00-11:00" })).toBeInTheDocument();
    expect(canvas.queryByRole("columnheader", { name: "March" })).toBeNull();
    await drag(root, cell(root, 1, 1), 1, 2);
    await waitFor(() => expect(selectedSlots(root, 1)).toEqual([1, 2]));
    expect(pci.getResponse()).toEqual(response(";2/3 09:00 - 2/3 10:00;", [[], [2, 3], []]));
    expect(canvas.getByRole("gridcell", { name: "Task #2, Mon 2 Mar 09:00" })).toHaveAttribute("aria-selected", "true");
  },
};

export const OwnTasksAndWeekends: Story = {
  args: {
    properties: {
      tasks: "Design;#ffaa00\nBuild",
      prompt: "Plan the build.",
      period: "7",
      startDate: "01/05/2026",
      disableWeekends: "false",
      weekNumHack: "true",
    },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci, root } = await openPci(canvasElement);
    expect(canvas.getByRole("grid", { name: "Plan the build." })).toBeInTheDocument();
    expect(canvas.getAllByRole("rowheader").map((th) => th.textContent)).toEqual(["Design", "Build"]);
    // days labelled as weeks (the original's hack)
    expect(canvas.getByRole("columnheader", { name: "Week 5" })).toBeInTheDocument();
    // Monday 5 January to Sunday 11 January, the weekend can be used
    expect(root.querySelectorAll('td[data-task="1"]')).toHaveLength(7);
    const saturday = canvas.getByRole("gridcell", { name: "Build, Sat 10 Jan" });
    expect(saturday).not.toHaveAttribute("aria-disabled");
    await click(root, 1, 5);
    await waitFor(() => expect(selectedSlots(root, 1)).toEqual([5]));
    expect(pci.getResponse()).toEqual(response(";10/1", [[], [6]]));
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl" } },
  play: async ({ canvasElement }) => {
    const { canvas, root } = await openPci(canvasElement);
    expect(canvas.getByRole("gridcell", { name: "Task #1, ma 2 mrt" })).toBeInTheDocument();
    expect(canvas.getByRole("gridcell", { name: "Task #1, za 7 mrt, niet beschikbaar" })).toBeInTheDocument();
    expect(canvas.getByRole("columnheader", { name: "maart" })).toBeInTheDocument();
    expect(canvas.getByText(/^Sleep over een rij om een taak te plannen/)).toBeInTheDocument();
    await drag(root, cell(root, 0, 0), 0, 1);
    await waitFor(() => expect(root.querySelector('[data-testid="summary"] li')).toHaveTextContent("Task #1: ma 2 mrt tot en met di 3 mrt"));
  },
};

export const NoTasks: Story = {
  args: { properties: { tasks: "" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText("There are no tasks: add them in the settings, one per line.")).toBeInTheDocument();
    expect(canvas.queryByRole("grid")).toBeNull();
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await drag(first.root, cell(first.root, 0, 7), 0, 9);
    await click(first.root, 1, 0);
    await waitFor(() => expect(selectedSlots(first.root, 1)).toEqual([0]));
    const state = first.pci.getState();

    const second = await remountPci(canvasElement, pci, { state });
    expect(selectedSlots(second.root, 0)).toEqual([7, 8, 9]);
    expect(selectedSlots(second.root, 1)).toEqual([0]);
    expect(second.pci.getResponse()).toEqual(response("9/3 - 11/3;2/3;", [[8, 9, 10], [1], []]));
  },
};

export const BoundResponse: Story = {
  // a response of the original: slots that do not exist or fall in the weekend are dropped
  args: { boundTo: { RESPONSE: response("whatever", [[1, 2, 6, 7], [], [30, 31]]) } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { pci, root } = mounted;

    await step("the response the player hands back is shown, cleaned", async () => {
      await waitFor(() => expect(selectedSlots(root, 0)).toEqual([0, 1]));
      expect(selectedSlots(root, 2)).toEqual([29]);
      expect(pci.getResponse()).toEqual(response("2/3 - 3/3;;31/3", [[1, 2], [], [30]]));
    });

    await step("setResponse replaces it; something that is no response empties the chart", async () => {
      pci.setResponse(response("", [[], [10, 11], []]));
      await waitFor(() => expect(selectedSlots(root, 1)).toEqual([9, 10]));
      expect(selectedSlots(root, 0)).toEqual([]);
      pci.setResponse({ base: { string: "not a response" } });
      await waitFor(() => expect(selectedSlots(root, 1)).toEqual([]));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const ResetResponse: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { pci, root } = mounted;
    await drag(root, cell(root, 2, 0), 2, 1);
    await waitFor(() => expect(selectedSlots(root, 2)).toEqual([0, 1]));
    pci.resetResponse();
    await waitFor(() => expect(selectedSlots(root, 2)).toEqual([]));
    expect(pci.getResponse()).toBeUndefined();
    expect(await lastChange(mounted, 2)).toBeUndefined();
  },
};

export const Solution: Story = {
  args: {
    status: "solution",
    responseDeclaration: { baseType: "string", correctResponse: { value: response("", [[1, 2, 3], [4, 5], [8]]).base.string } },
  },
  play: async ({ canvasElement }) => {
    const { pci, root } = await openPci(canvasElement);
    await waitFor(() => expect(selectedSlots(root, 0)).toEqual([0, 1, 2]));
    expect(selectedSlots(root, 1)).toEqual([3, 4]);
    expect(selectedSlots(root, 2)).toEqual([7]);
    expect(pci.getResponse()).toEqual(response("2/3 - 4/3;5/3 - 6/3;9/3", [[1, 2, 3], [4, 5], [8]]));
  },
};
