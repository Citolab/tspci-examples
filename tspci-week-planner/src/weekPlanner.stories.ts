import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { afterPaint, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Week planner",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Canvas = MountedPci["canvas"];
type Record = { record: { name: string; base: { integer?: number; string?: string } | null }[] } | undefined;

/** A field of the record response. */
const field = (response: unknown, name: string) => (response as Record)?.record.find((f) => f.name === name)?.base;
const schedule = (response: unknown) => JSON.parse(field(response, "schedule")?.string ?? "[]");
/** The cell of a day, resource and time, as a screen reader names it. */
const cell = (canvas: Canvas, day: string, resource: string, time: string) =>
  canvas.getByRole("gridcell", { name: new RegExp(`^${day}, ${resource}, ${time}:`) });
const card = (canvas: Canvas, label: string) => canvas.getByRole("button", { name: new RegExp(`^${label},`) });
const block = (root: MountedPci["root"], task: string) => root.querySelector<HTMLElement>(`[data-testid="block-${task}"]`);

/**
 * Drags from one element to another with pointer events, as a mouse or a finger does (user-event has no drag that
 * moves over the page with coordinates).
 */
const drag = async (from: Element, to: Element, dy = 0) => {
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const at = (x: number, y: number) => ({ clientX: x, clientY: y, bubbles: true, composed: true, pointerId: 1, button: 0, isPrimary: true });
  from.dispatchEvent(new PointerEvent("pointerdown", at(a.left + a.width / 2, a.top + Math.min(8, a.height / 2))));
  from.dispatchEvent(new PointerEvent("pointermove", at(a.left + a.width / 2 + 20, a.top + 20)));
  to.dispatchEvent(new PointerEvent("pointermove", at(b.left + b.width / 2, b.top + b.height / 2 + dy)));
  to.dispatchEvent(new PointerEvent("pointerup", at(b.left + b.width / 2, b.top + b.height / 2 + dy)));
  await afterPaint();
};

/** The example's solution as a response, with times as the response has them. */
const SOLUTION = [
  { task: "t1", day: "mon", start: "09:00", end: "10:30", resource: "anna" },
  { task: "t2", day: "mon", start: "11:00", end: "12:00", resource: "anna" },
  { task: "t3", day: "mon", start: "09:00", end: "09:30", resource: "bas" },
  { task: "t4", day: "wed", start: "10:30", end: "11:00", resource: "bas" },
  { task: "t5", day: "tue", start: "10:00", end: "12:00", resource: "bas" },
  { task: "t6", day: "tue", start: "13:00", end: "13:30", resource: "bas" },
  { task: "t7", day: "thu", start: "14:00", end: "15:00", resource: "anna" },
];
const scheduleResponse = (items: unknown[]) => ({ record: [{ name: "schedule", base: { string: JSON.stringify(items) } }] });

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText(/^You work for a home care team/)).toBeInTheDocument();
    expect(canvas.getByRole("grid", { name: /^Week agenda: You work for a home care team/ })).toBeInTheDocument();
    // 5 days × 2 people × 20 rows of half an hour
    expect(canvas.getAllByRole("gridcell")).toHaveLength(200);
    expect(cell(canvas, "Monday", "Anna", "08:00")).toHaveAccessibleName("Monday, Anna, 08:00: closed");
    expect(cell(canvas, "Wednesday", "Bas", "09:30")).toHaveAccessibleName("Wednesday, Bas, 09:30: Team meeting (fixed) 09:00–10:00");
    expect(card(canvas, "Intake Mrs. de Vries")).toHaveAccessibleName("Intake Mrs. de Vries, 1 h 30 min, only Anna, not planned");
    expect(card(canvas, "Write reports")).toHaveAccessibleName("Write reports, 1 h to 2 h, only Anna, not planned");
    expect(canvas.getByText("0 of 7 planned")).toBeInTheDocument();
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const PlanWithTheMouse: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;

    await step("drag a card into the agenda", async () => {
      await drag(card(canvas, "Intake Mrs. de Vries"), cell(canvas, "Monday", "Anna", "09:00"));
      expect(canvas.getByRole("status")).toHaveTextContent("Intake Mrs. de Vries planned: Monday 09:00–10:30, Anna.");
      expect(card(canvas, "Intake Mrs. de Vries")).toHaveAccessibleName(/planned: Monday 09:00–10:30, Anna$/);
      expect(schedule(await lastChange(mounted))).toEqual([{ task: "t1", day: "mon", start: "09:00", end: "10:30", resource: "anna" }]);
    });

    await step("a task for Bas only does not go in Anna's column", async () => {
      await drag(card(canvas, "Wound care Mr. Bakker"), cell(canvas, "Monday", "Anna", "11:00"));
      expect(canvas.getByRole("status")).toHaveTextContent("Wound care Mr. Bakker can only be planned for Bas.");
      expect(schedule(pci.getResponse())).toHaveLength(1);
    });

    await step("pick a card, click a cell; the overlap shows in text and pattern", async () => {
      await userEvent.click(card(canvas, "Care plan Mrs. de Vries"));
      expect(card(canvas, "Care plan Mrs. de Vries")).toHaveAttribute("aria-pressed", "true");
      await userEvent.click(cell(canvas, "Wednesday", "Anna", "09:30"));
      expect(block(root, "t2")).toHaveAttribute("data-conflict", "true");
      expect(canvas.getByRole("region", { name: "Conflicts" })).toHaveTextContent("Care plan Mrs. de Vries (Wed 09:30–10:30, Anna): Overlaps with Team meeting");
      expect(cell(canvas, "Wednesday", "Anna", "10:00")).toHaveAccessibleName(/Care plan Mrs\. de Vries 09:30–10:30, Overlaps with Team meeting/);
    });

    await step("drag the block to move it: the conflict is gone", async () => {
      await drag(block(root, "t2")!, cell(canvas, "Monday", "Anna", "11:00"));
      expect(schedule(pci.getResponse())[1]).toEqual({ task: "t2", day: "mon", start: "11:00", end: "12:00", resource: "anna" });
      expect(canvas.queryByRole("region", { name: "Conflicts" })).toBeNull();
    });

    await step("drag the lower edge: longer, up to the task's maximum", async () => {
      await drag(card(canvas, "Write reports"), cell(canvas, "Thursday", "Anna", "14:00"));
      const handle = root.querySelector('[data-testid="resize-t7"]')!;
      await drag(handle, cell(canvas, "Thursday", "Anna", "15:00"), 13);
      expect(schedule(pci.getResponse()).find((x: any) => x.task === "t7").end).toBe("15:30");
      await drag(root.querySelector('[data-testid="resize-t7"]')!, cell(canvas, "Thursday", "Anna", "17:00"), 13);
      expect(schedule(pci.getResponse()).find((x: any) => x.task === "t7").end).toBe("16:00");
    });

    await step("drag out of the agenda removes; undo brings it back; start again", async () => {
      await drag(block(root, "t2")!, canvas.getByText(/^You work for a home care team/));
      expect(canvas.getByRole("status")).toHaveTextContent("Care plan Mrs. de Vries removed from the agenda.");
      await userEvent.click(canvas.getByRole("button", { name: "Undo" }));
      expect(block(root, "t2")).not.toBeNull();
      await userEvent.click(canvas.getByRole("button", { name: "Start again" }));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci, root } = await openPci(canvasElement);
    const grid = canvas.getByRole("grid");
    const at = (task: string) => schedule(pci.getResponse()).find((x: any) => x.task === task);

    await step("pick a card, go there with the arrow keys, Enter places it", async () => {
      await userEvent.click(card(canvas, "Shopping with Mrs. Smit"));
      expect(canvas.getByRole("status")).toHaveTextContent("Shopping with Mrs. Smit picked: choose a place with the arrow keys and press Enter, or click a cell.");
      expect(grid).toHaveAttribute("aria-activedescendant", "agenda-cell-0-1"); // Monday, Anna, 08:30: the opening time
      expect(root.querySelector('[data-testid="preview"]')).not.toBeNull();
      await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");
      expect(at("t5")).toEqual({ task: "t5", day: "tue", start: "10:00", end: "12:00", resource: "bas" });
      expect(canvas.getByRole("status")).toHaveTextContent("Shopping with Mrs. Smit planned: Tuesday 10:00–12:00, Bas.");
    });

    await step("Enter picks up a planned task; arrows and Enter move it", async () => {
      await userEvent.keyboard("{Enter}{ArrowRight}{ArrowRight}{ArrowUp}{ArrowUp}{Enter}");
      expect(at("t5")).toEqual({ task: "t5", day: "wed", start: "09:00", end: "11:00", resource: "bas" });
      expect(canvas.getByRole("status")).toHaveTextContent("Shopping with Mrs. Smit planned: Wednesday 09:00–11:00, Bas. Overlaps with Team meeting.");
    });

    await step("Shift + arrow resizes (when the task allows it), Delete removes, Ctrl+Z undoes", async () => {
      // only Anna writes reports: the cursor goes to her first column, Monday, at the same time
      await userEvent.click(card(canvas, "Write reports"));
      expect(grid).toHaveAttribute("aria-activedescendant", "agenda-cell-0-2");
      await userEvent.keyboard("{Enter}{Shift>}{ArrowDown}{ArrowDown}{ArrowDown}{/Shift}");
      expect(at("t7")).toEqual({ task: "t7", day: "mon", start: "09:00", end: "11:00", resource: "anna" }); // at most 2 hours
      await userEvent.keyboard("{Shift>}{ArrowUp}{/Shift}");
      expect(at("t7").end).toBe("10:30");
      expect(canvas.getByRole("status")).toHaveTextContent("Write reports: Monday 09:00–10:30, Anna.");
      await userEvent.keyboard("{Delete}");
      expect(at("t7")).toBeUndefined();
      await userEvent.keyboard("{Control>}z{/Control}");
      expect(at("t7")).toBeDefined();
    });

    await step("Escape drops a picked card; help", async () => {
      await userEvent.click(card(canvas, "Care plan Mrs. de Vries"));
      await userEvent.keyboard("{Escape}");
      expect(root.querySelector('[data-testid="preview"]')).toBeNull();
      expect(canvas.getByRole("status")).toHaveTextContent("Nothing picked.");
      await userEvent.click(canvas.getByRole("button", { name: "Help" }));
      expect(canvas.getByText(/choose a place with the arrow keys and press Enter\. In the agenda/)).toBeInTheDocument();
    });
  },
};

export const Scoring: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci, root } = await openPci(canvasElement);

    await step("the example solution: every check passes", async () => {
      pci.setResponse(scheduleResponse(SOLUTION));
      await waitFor(() => expect(canvas.getByText("7 of 7 planned")).toBeInTheDocument());
      const r = pci.getResponse();
      expect(field(r, "score")).toEqual({ integer: 9 });
      expect(field(r, "maxscore")).toEqual({ integer: 9 });
      expect(field(r, "correct")).toEqual({ integer: 1 });
      expect(field(r, "planned")).toEqual({ integer: 7 });
      expect(schedule(r)).toEqual(SOLUTION);
    });

    await step("the shopping on Wednesday: not on Wednesday and same day fail", async () => {
      await drag(block(root, "t5")!, cell(canvas, "Wednesday", "Bas", "13:00"));
      const r = pci.getResponse();
      expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => field(r, `check${i}`)?.integer)).toEqual([1, 1, 1, 1, 0, 0, 1, 1, 1]);
      expect(field(r, "score")).toEqual({ integer: 7 });
    });

    await step("the wound check too soon, the care plan before the intake", async () => {
      pci.setResponse(scheduleResponse([
        ...SOLUTION.filter((x) => x.task !== "t4" && x.task !== "t2"),
        { task: "t4", day: "tue", start: "15:00", end: "15:30", resource: "bas" },
        { task: "t2", day: "mon", start: "08:30", end: "09:30", resource: "bas" },
      ]));
      await afterPaint();
      const r = pci.getResponse();
      expect(field(r, "check4")).toEqual({ integer: 0 });
      expect(field(r, "check7")).toEqual({ integer: 0 });
      expect(field(r, "check2")).toEqual({ integer: 0 }); // the care plan overlaps the wound care
    });
  },
};

export const WithoutFeedback: Story = {
  args: { properties: { feedback: "false" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci, root } = await openPci(canvasElement);
    pci.setResponse(scheduleResponse([{ task: "t2", day: "wed", start: "09:00", end: "10:00", resource: "anna" }]));
    await waitFor(() => expect(block(root, "t2")).not.toBeNull());
    expect(block(root, "t2")).not.toHaveAttribute("data-conflict");
    expect(canvas.queryByRole("region", { name: "Conflicts" })).toBeNull();
    expect(canvas.queryByText("Conflict")).toBeNull();
    expect(field(pci.getResponse(), "check2")).toEqual({ integer: 0 }); // still scored
  },
};

/** A restaurant: one week end, three people, 15-minute rows, two rules. */
const restaurant = JSON.stringify({
  days: ["fri", "sat", "sun"], start: "16:00", end: "23:00", slot: 15, open: { start: "17:00", end: "22:00" },
  resources: [{ id: "kim", name: "Kim" }, { id: "joe", name: "Joe" }, { id: "sam", name: "Sam" }],
  tasks: [{ id: "bar", label: "Bar shift", duration: 240, min: 120, max: 300 }, { id: "prep", label: "Prep the kitchen", duration: 60, resource: "sam" }],
  checks: [{ type: "allPlanned", points: 1 }, { type: "before", a: "prep", b: "bar", points: 2 }],
});

export const OwnAgenda: Story = {
  args: { properties: { planner: restaurant, prompt: "Plan the weekend shifts." } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getAllByRole("gridcell")).toHaveLength(3 * 3 * 28);
    expect(canvas.getAllByRole("columnheader", { name: "Saturday" })).toHaveLength(1);
    expect(card(canvas, "Bar shift")).toHaveAccessibleName("Bar shift, 2 h to 5 h, not planned");
    await drag(card(canvas, "Prep the kitchen"), cell(canvas, "Saturday", "Sam", "16:30"));
    await drag(card(canvas, "Bar shift"), cell(canvas, "Saturday", "Kim", "17:30"));
    const r = pci.getResponse();
    expect(schedule(r)).toEqual([
      { task: "bar", day: "sat", start: "17:30", end: "21:30", resource: "kim" },
      { task: "prep", day: "sat", start: "16:30", end: "17:30", resource: "sam" },
    ]);
    expect(field(r, "score")).toEqual({ integer: 3 });
    expect(canvas.getByRole("region", { name: "Conflicts" })).toHaveTextContent("Prep the kitchen (Sat 16:30–17:30, Sam): Outside opening hours");
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", prompt: "Plan de taken van Anna en Bas." } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(cell(canvas, "woensdag", "Bas", "09:30")).toHaveAccessibleName("woensdag, Bas, 09:30: Teamoverleg (vast) 09:00–10:00");
    expect(card(canvas, "Rapportages schrijven")).toHaveAccessibleName("Rapportages schrijven, 1 uur tot 2 uur, alleen Anna, niet gepland");
    await userEvent.click(card(canvas, "Boodschappen met mevrouw Smit"));
    expect(canvas.getByRole("status")).toHaveTextContent("Boodschappen met mevrouw Smit gekozen");
    await userEvent.click(cell(canvas, "woensdag", "Anna", "09:00"));
    expect(canvas.getByRole("status")).toHaveTextContent("Boodschappen met mevrouw Smit gepland: woensdag 09:00–11:00, Anna. Overlapt met Teamoverleg.");
    expect(canvas.getByRole("button", { name: "Opnieuw beginnen" })).toBeEnabled();
    // the response does not depend on the language
    expect(schedule(pci.getResponse())).toEqual([{ task: "t5", day: "wed", start: "09:00", end: "11:00", resource: "anna" }]);
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await drag(card(first.canvas, "Intake Mrs. de Vries"), cell(first.canvas, "Tuesday", "Anna", "09:00"));
    const state = first.pci.getState();
    expect(JSON.parse(state).state).toEqual({ placements: [{ task: "t1", resource: "anna", day: "tue", start: 540, end: 630 }] });

    const second = await remountPci(canvasElement, pci, { state });
    expect(card(second.canvas, "Intake Mrs. de Vries")).toHaveAccessibleName(/planned: Tuesday 09:00–10:30, Anna$/);
    expect(second.pci.getResponse()).toEqual(first.pci.getResponse());
    expect(second.changes).toHaveLength(0);
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: scheduleResponse(SOLUTION.slice(0, 3)) } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("the bound response is in the agenda", async () => {
      await waitFor(() => expect(canvas.getByText("3 of 7 planned")).toBeInTheDocument());
      expect(field(pci.getResponse(), "check1")).toEqual({ integer: 0 });
    });
    await step("resetResponse: an empty agenda", async () => {
      pci.resetResponse();
      await waitFor(() => expect(canvas.getByText("0 of 7 planned")).toBeInTheDocument());
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: { status: "solution", state: JSON.stringify({ state: { placements: [{ task: "t6", resource: "anna", day: "fri", start: 600, end: 630 }] }, log: [] }) },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the author's example solution replaces the candidate's work; nothing to change
    await waitFor(() => expect(canvas.getByText("7 of 7 planned")).toBeInTheDocument());
    expect(card(canvas, "Collect medicine at the pharmacy")).toHaveAccessibleName(/planned: Tuesday 13:00–13:30, Bas$/);
    expect(card(canvas, "Collect medicine at the pharmacy")).toBeDisabled();
    expect(canvas.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(canvas.getByRole("grid")).toHaveAttribute("aria-readonly", "true");
    expect(field(pci.getResponse(), "correct")).toEqual({ integer: 1 });
  },
};

export const SolutionFromTheDeclaration: Story = {
  args: {
    status: "solution",
    responseDeclaration: { cardinality: "record", correctResponse: { value: [{ fieldIdentifier: "schedule", value: JSON.stringify(SOLUTION.slice(0, 2)) }] } },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await waitFor(() => expect(canvas.getByText("2 of 7 planned")).toBeInTheDocument());
    expect(schedule(pci.getResponse())).toEqual(SOLUTION.slice(0, 2));
  },
};

/** Two interactions of this type on one page: each has its own agenda and response. */
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
    await userEvent.click(card(first.canvas, "Intake Mrs. de Vries"));
    await userEvent.click(cell(first.canvas, "Monday", "Anna", "09:00"));
    await userEvent.click(card(second.canvas, "Care plan Mrs. de Vries"));
    await userEvent.click(cell(second.canvas, "Friday", "Anna", "09:00"));
    expect(schedule(first.pci.getResponse()).map((x: any) => x.task)).toEqual(["t1"]);
    expect(schedule(second.pci.getResponse()).map((x: any) => x.task)).toEqual(["t2"]);
    expect(first.changes).toHaveLength(1);
    expect(second.changes).toHaveLength(1);
  },
};

// --- Authoring mode: what an authoring system shows the item author (getAuthoringInstance)

/** The authoring mode, as an authoring system shows it after "Make the agenda…". */
export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);
    const planner = () => JSON.parse(instance.getProperties().planner!);

    await step("starts from the example; its solution scores 9 of 9", async () => {
      expect(canvas.getByTestId("summary")).toHaveTextContent("The example solution scores 9 of 9.");
      expect(instance.validate!()).toEqual([]);
      expect(planner().tasks).toHaveLength(7);
    });

    await step("the agenda: Saturday as well", async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: "Saturday" }));
      expect(planner().days).toEqual(["mon", "tue", "wed", "thu", "fri", "sat"]);
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("a resource and a task", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Resources" }));
      await userEvent.click(canvas.getByRole("button", { name: "+ Add" }));
      expect(planner().resources[2]).toEqual({ id: "r3", name: "Resource 3" });
      await userEvent.click(canvas.getByRole("tab", { name: "Tasks" }));
      await userEvent.click(canvas.getByRole("button", { name: "+ Add" }));
      await retype(canvas.getByRole("textbox", { name: "Text: t8" }), "Evening round");
      expect(planner().tasks[7]).toMatchObject({ id: "t8", label: "Evening round", duration: 60 });
      expect(instance.validate!()).toEqual(["The example solution does not pass check 1."]); // the new task is not planned
    });

    await step("the example solution plans it", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Example solution" }));
      await userEvent.click(canvas.getByRole("button", { name: /^Evening round,/ }));
      await userEvent.click(cell(canvas, "Saturday", "Resource 3", "10:00"));
      expect(instance.validate!()).toEqual([]);
      expect(planner().solution).toContainEqual({ task: "t8", day: "sat", start: "10:00", end: "11:00", resource: "r3" });
    });

    await step("the checks: one more, with points, previewed", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Checks" }));
      await userEvent.click(canvas.getByRole("button", { name: "+ Add a check" }));
      await userEvent.selectOptions(canvas.getByTestId("check-9-type"), "Not on a day");
      await userEvent.selectOptions(canvas.getByTestId("check-9-task"), "Evening round");
      await userEvent.selectOptions(canvas.getByTestId("check-9-day"), "Saturday");
      expect(planner().checks[9]).toEqual({ type: "notOnDay", task: "t8", day: "sat", points: 1 });
      expect(canvas.getByTestId("check-9-text")).toHaveTextContent("Evening round not on Saturday");
      expect(canvas.getByTestId("check-9-mark")).toHaveTextContent("✗");
      expect(instance.validate!()).toEqual(["The example solution does not pass check 10."]);
      await retype(canvas.getByRole("spinbutton", { name: "Points: check10" }), "3");
      expect(canvas.getByTestId("summary")).toHaveTextContent("The example solution scores 9 of 12.");
    });
  },
};

export const AuthoringInDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl" },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(canvas.getByTestId("summary")).toHaveTextContent("De voorbeeldoplossing haalt 9 van 9 punten.");
    await userEvent.click(canvas.getByRole("tab", { name: "Checks" }));
    await retype(canvas.getByTestId("check-7-hours"), "7,5");
    canvas.getByTestId("check-7-hours").dispatchEvent(new Event("change", { bubbles: true }));
    await afterPaint();
    expect(JSON.parse(instance.getProperties().planner!).checks[7].hours).toBe(7.5);
    expect(canvas.getByTestId("check-7-text")).toHaveTextContent("Hoogstens 7,5 uur werk per uitvoerder per dag");
    expect(JSON.parse(instance.getProperties().planner!).fixed[0].label).toBe("Teamoverleg");
  },
};
