import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { afterPaint, focusedIn, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

// The staff rota (data-mode readRota, makeRota, hoursAndPay): the week planner's second task. The example is a corner
// shop from Thursday to Sunday with five employees (rota.ts exampleRota).

const meta = {
  title: "Week planner/Staff rota",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Canvas = MountedPci["canvas"];
type Root = MountedPci["root"];
type Rec = { record: { name: string; base: Record<string, unknown> }[] } | undefined;

const field = (response: unknown, name: string) => (response as Rec)?.record.find((f) => f.name === name)?.base;
const names = (response: unknown) => (response as Rec)?.record.map((f) => f.name);
const rotaOf = (response: unknown) => JSON.parse(String(field(response, "rota")?.string ?? "[]"));
/** The cell of a day, employee and time, as a screen reader names it. */
const cell = (canvas: Canvas, day: string, employee: string, time: string) =>
  canvas.getByRole("gridcell", { name: new RegExp(`^${day}, ${employee}, ${time}:`) });
const card = (canvas: Canvas, label: string) => canvas.getByRole("button", { name: new RegExp(`^${label},`) });
const shift = (root: Root, employee: string, day: string) => root.querySelector<HTMLElement>(`[data-testid="shift-${employee}-${day}"]`);

const at = (x: number, y: number, pointerType = "mouse", isPrimary = true) =>
  ({ clientX: x, clientY: y, bubbles: true, composed: true, pointerId: isPrimary ? 1 : 2, button: 0, isPrimary, pointerType });
/** Presses at a point of `from` and lets go at a point of `to`, as a mouse or a finger does. */
const drag = async (from: Element, to: Element, { fx = 0.5, tx = 0.5, pointerType = "mouse" } = {}) => {
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const start = [a.left + a.width * fx, a.top + a.height / 2], end = [b.left + b.width * tx, b.top + b.height / 2];
  from.dispatchEvent(new PointerEvent("pointerdown", at(start[0], start[1], pointerType)));
  window.dispatchEvent(new PointerEvent("pointermove", at(start[0] + 20, start[1] + 15, pointerType)));
  await afterPaint();
  window.dispatchEvent(new PointerEvent("pointermove", at(end[0], end[1], pointerType)));
  await afterPaint();
  window.dispatchEvent(new PointerEvent("pointerup", at(end[0], end[1], pointerType)));
  await afterPaint();
};
/** A key on the element itself (userEvent.keyboard does not reach inside the shadow root). */
const key = async (el: Element, k: string, opts: KeyboardEventInit = {}) => {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, composed: true, cancelable: true, ...opts }));
  await afterPaint();
};
const keys = async (el: Element, list: string[]) => {
  for (const k of list) await key(el, k);
};

/** The example's rota as the response has it. */
const EXAMPLE = [
  { employee: "sam", day: "thu", start: "13:00", end: "21:30", break: 30 }, { employee: "noor", day: "thu", start: "08:00", end: "13:30", break: 0 },
  { employee: "daan", day: "thu", start: "13:00", end: "21:30", break: 30 }, { employee: "ayoub", day: "thu", start: "08:00", end: "13:30", break: 0 },
  { employee: "sam", day: "fri", start: "13:00", end: "18:30", break: 0 }, { employee: "noor", day: "fri", start: "08:00", end: "13:30", break: 0 },
  { employee: "daan", day: "fri", start: "13:00", end: "18:30", break: 0 }, { employee: "lisa", day: "fri", start: "08:00", end: "13:30", break: 0 },
  { employee: "sam", day: "sat", start: "08:30", end: "17:30", break: 30 }, { employee: "lisa", day: "sat", start: "08:30", end: "17:30", break: 30 },
  { employee: "noor", day: "sun", start: "11:30", end: "17:30", break: 30 }, { employee: "ayoub", day: "sun", start: "11:30", end: "17:30", break: 30 },
];
const rotaResponse = (items: unknown[]) => ({ record: [{ name: "rota", base: { string: JSON.stringify(items) } }] });

// --- readRota

export const ReadRota: Story = {
  args: { properties: { mode: "readRota" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("the rota as a table, the questions with boxes and names to tap", async () => {
      expect(canvas.getByTestId("prompt")).toHaveTextContent("This is the rota of the corner shop from Thursday to Sunday. Answer the questions.");
      expect(canvas.getByRole("columnheader", { name: /^Thursday ?open 09:00–21:00/ })).toBeInTheDocument();
      expect(canvas.getByTestId("table-sam-fri")).toHaveTextContent("13:00–18:30no break");
      expect(canvas.getByTestId("table-sam-sat")).toHaveTextContent("08:30–17:30break 30 min");
      expect(canvas.getByTestId("table-daan-sun")).toHaveTextContent("free");
      expect(canvas.getAllByRole("listitem").filter((li) => li.dataset.testid?.startsWith("question-"))).toHaveLength(6);
      expect(canvas.getByText("When does Sam work on Friday?")).toBeInTheDocument();
      expect(canvas.getByText("How many hours does Noor work this week, without breaks?")).toBeInTheDocument();
      expect(canvas.getByText("Who closes on Saturday? (Who works until the end?)")).toBeInTheDocument();
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("the answers, typed as a pupil would", async () => {
      await userEvent.type(canvas.getByRole("textbox", { name: "Question 1: When does Sam work on Friday? from" }), "13");
      expect(pci.getResponse()).toBeUndefined(); // half a time is no answer yet
      await userEvent.type(canvas.getByRole("textbox", { name: "Question 1: When does Sam work on Friday? to" }), "18.30");
      expect(field(await lastChange(mounted), "question1")).toEqual({ integer: 1 }); // "13" and "18.30" are 13:00 and 18:30
      await userEvent.type(canvas.getByRole("textbox", { name: /^Question 2:/ }), "16.5 hours");
      const closes = canvas.getByRole("group", { name: /^Question 3:/ });
      await userEvent.click(canvas.getAllByRole("button", { name: "Sam" }).find((b) => closes.contains(b))!);
      await userEvent.click(canvas.getAllByRole("button", { name: "Lisa" }).find((b) => closes.contains(b))!);
      expect(canvas.getAllByRole("button", { name: "Lisa" }).find((b) => closes.contains(b))).toHaveAttribute("aria-pressed", "true");
      await userEvent.click(canvas.getByTestId("q4-free"));
      expect(canvas.getByTestId("q4-start")).toBeDisabled();
      await userEvent.type(canvas.getByRole("textbox", { name: /^Question 5:/ }), "4");
      const opens = canvas.getByRole("group", { name: /^Question 6:/ });
      await userEvent.click(canvas.getAllByRole("button", { name: "Noor" }).find((b) => opens.contains(b))!);
    });

    await step("scored per question: Ayoub also opens", async () => {
      const opens = canvas.getByRole("group", { name: /^Question 6:/ });
      const r = pci.getResponse();
      expect([1, 2, 3, 4, 5, 6].map((i) => (field(r, `question${i}`) as any).integer)).toEqual([1, 1, 1, 1, 1, 0]);
      expect([field(r, "score"), field(r, "maxscore"), field(r, "correct")]).toEqual([{ integer: 5 }, { integer: 6 }, { integer: 0 }]);
      expect(JSON.parse(String(field(r, "answers")!.string))).toEqual([{ start: "13:00", end: "18:30" }, 16.5, ["sam", "lisa"], "free", 4, ["noor"]]);
      await userEvent.click(canvas.getAllByRole("button", { name: "Ayoub" }).find((b) => opens.contains(b))!);
      expect(field(pci.getResponse(), "correct")).toEqual({ integer: 1 });
    });
  },
};

// --- makeRota

export const MakeRotaWithTheMouse: Story = {
  args: { properties: { mode: "makeRota" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;

    await step("the employees, the rules and the shift cards", async () => {
      expect(canvas.getByTestId("employees")).toHaveTextContent("Lisa · 12 to 16 h a week · cannot work on Thursday");
      expect(canvas.getByTestId("rules")).toHaveTextContent("At least 2 people at work whenever the shop is open");
      expect(card(canvas, "Opening")).toHaveAccessibleName("Opening, 08:00–13:30, no break");
      expect(cell(canvas, "Thursday", "Lisa", "10:00")).toHaveAccessibleName("Thursday, Lisa, 10:00: not at work, cannot work");
      expect(cell(canvas, "Sunday", "Sam", "10:00")).toHaveAccessibleName("Sunday, Sam, 10:00: not at work, closed");
      expect(root.querySelector('[data-testid="rota-low-thu-09:00"]')).toHaveTextContent("0!"); // nobody yet
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("drag a card onto a day of an employee: it keeps its times", async () => {
      await drag(card(canvas, "Opening"), cell(canvas, "Thursday", "Noor", "15:00"));
      expect(canvas.getByRole("status")).toHaveTextContent("Noor, Thursday: 08:00–13:30, no break.");
      expect(rotaOf(await lastChange(mounted))).toEqual([{ employee: "noor", day: "thu", start: "08:00", end: "13:30", break: 0 }]);
      expect(cell(canvas, "Thursday", "Noor", "10:00")).toHaveAccessibleName("Thursday, Noor, 10:00: 08:00–13:30, no break");
      expect(root.querySelector('[data-testid="rota-low-thu-09:00"]')).toHaveTextContent("1!");
    });

    await step("a shift on a day someone cannot work is marked, in text and pattern", async () => {
      await drag(card(canvas, "Late evening"), cell(canvas, "Thursday", "Lisa", "10:00"));
      expect(shift(root, "lisa", "thu")).toHaveAttribute("data-problem", "true");
      expect(canvas.getByRole("region", { name: "Problems" })).toHaveTextContent("Lisa, Thu 13:00–21:30: Lisa cannot work on Thursday");
      expect(canvas.getByRole("status")).toHaveTextContent("Lisa, Thursday: 13:00–21:30, break 30 min. Lisa cannot work on Thursday.");
    });

    await step("drag the shift to Daan's row: it moves, with its times", async () => {
      await drag(shift(root, "lisa", "thu")!, cell(canvas, "Thursday", "Daan", "13:00"), { fx: 0.02 });
      expect(rotaOf(pci.getResponse())).toEqual([
        { employee: "noor", day: "thu", start: "08:00", end: "13:30", break: 0 },
        { employee: "daan", day: "thu", start: "13:00", end: "21:30", break: 30 },
      ]);
      expect(shift(root, "lisa", "thu")).toBeNull();
    });

    await step("drag the right edge: longer or shorter; the break with the toolbar", async () => {
      await drag(card(canvas, "Opening"), cell(canvas, "Friday", "Sam", "08:00"));
      await drag(root.querySelector('[data-testid="resize-sam-fri"]')!, cell(canvas, "Friday", "Sam", "15:00"), { fx: 0.5, tx: 0.02 });
      expect(rotaOf(pci.getResponse()).find((x: any) => x.employee === "sam")).toEqual({ employee: "sam", day: "fri", start: "08:00", end: "15:00", break: 0 });
      expect(canvas.getByRole("region", { name: "Problems" })).toHaveTextContent("Sam, Fri 08:00–15:00: Needs a break of 30 min (longer than 5.5 h)");
      await userEvent.click(canvas.getByRole("button", { name: "Longer break" }));
      await userEvent.click(canvas.getByRole("button", { name: "Longer break" }));
      expect(rotaOf(pci.getResponse()).find((x: any) => x.employee === "sam").break).toBe(30);
      expect(canvas.getByTestId("break-sam-fri")).toHaveTextContent("30 min break");
      expect(shift(root, "sam", "fri")).not.toHaveAttribute("data-problem");
    });

    await step("the hours per employee against the contract", async () => {
      expect(canvas.getByRole("region", { name: "Hours this week" })).toHaveTextContent("Sam 6.5 h (contract 20–24 h)");
      expect(canvas.getByRole("region", { name: "Problems" })).toHaveTextContent("Sam: 6.5 h (contract 20–24 h), outside the contract hours");
    });

    await step("drag out of the rota removes; undo; start again", async () => {
      await drag(shift(root, "noor", "thu")!, canvas.getByTestId("prompt"));
      expect(canvas.getByRole("status")).toHaveTextContent("The shift of Noor on Thursday removed.");
      await userEvent.click(canvas.getByRole("button", { name: "Undo" }));
      expect(shift(root, "noor", "thu")).not.toBeNull();
      await userEvent.click(canvas.getByRole("button", { name: "Start again" }));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const MakeRotaWithTheKeyboard: Story = {
  args: { properties: { mode: "makeRota" } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci, root } = await openPci(canvasElement);
    const grid = canvas.getByRole("grid");
    const of = (employee: string, day: string) => rotaOf(pci.getResponse()).find((x: any) => x.employee === employee && x.day === day);

    await step("Enter on a card picks it; the arrow keys choose the row; Enter places it", async () => {
      await userEvent.click(card(canvas, "Closing")); // a button: Enter is a click
      expect(canvas.getByRole("status")).toHaveTextContent("Closing picked: choose the employee and the day with the arrow keys and press Enter, or click a row.");
      expect(focusedIn(root)).toBe(grid);
      expect(root.querySelector('[data-testid="preview"]')).toHaveTextContent("13:00–18:30");
      await keys(grid, ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "Enter"]); // Friday, Sam
      expect(of("sam", "fri")).toEqual({ employee: "sam", day: "fri", start: "13:00", end: "18:30", break: 0 });
      expect(canvas.getByRole("status")).toHaveTextContent("Sam, Friday: 13:00–18:30, no break.");
    });

    await step("Shift + arrow right makes it longer, B gives it a break, Shift + B a shorter one", async () => {
      await key(grid, "ArrowRight", { shiftKey: true });
      await key(grid, "ArrowRight", { shiftKey: true });
      expect(of("sam", "fri").end).toBe("19:30");
      await key(grid, "b");
      await key(grid, "b");
      await key(grid, "b");
      expect(of("sam", "fri").break).toBe(45);
      await key(grid, "B", { shiftKey: true });
      expect(of("sam", "fri").break).toBe(30);
      expect(canvas.getByRole("status")).toHaveTextContent("Sam, Friday: 13:00–19:30, break 30 min.");
    });

    await step("Enter picks up the shift; the arrow keys and Enter move it", async () => {
      await key(grid, "Enter");
      expect(canvas.getByRole("status")).toHaveTextContent("The shift of Sam on Friday picked up");
      await keys(grid, ["ArrowUp", "ArrowLeft", "ArrowLeft", "Enter"]); // Thursday, Ayoub, an hour earlier
      expect(of("sam", "fri")).toBeUndefined();
      expect(of("ayoub", "thu")).toEqual({ employee: "ayoub", day: "thu", start: "12:00", end: "18:30", break: 30 });
    });

    await step("Delete removes, Ctrl+Z undoes, Escape drops a picked card", async () => {
      await key(grid, "Delete");
      expect(pci.getResponse()).toBeUndefined();
      await key(grid, "z", { ctrlKey: true });
      expect(of("ayoub", "thu")).toBeDefined();
      await userEvent.click(card(canvas, "Whole day"));
      await key(grid, "Escape");
      expect(root.querySelector('[data-testid="preview"]')).toBeNull();
      expect(canvas.getByRole("status")).toHaveTextContent("Nothing picked.");
    });

    await step("the cell names say where the cursor is and what is there", async () => {
      const active = root.getElementById?.(grid.getAttribute("aria-activedescendant")!) ?? null;
      expect(active).toHaveAccessibleName("Thursday, Ayoub, 08:30: not at work, closed"); // picking the card went to its start
    });
  },
};

export const MakeRotaWithAFinger: Story = {
  args: { properties: { mode: "makeRota" } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci, root } = await openPci(canvasElement);

    await step("a finger drags a card onto a row", async () => {
      await drag(card(canvas, "Whole day"), cell(canvas, "Saturday", "Lisa", "12:00"), { pointerType: "touch" });
      expect(rotaOf(pci.getResponse())).toEqual([{ employee: "lisa", day: "sat", start: "08:30", end: "17:30", break: 30 }]);
    });

    await step("a tap that moves a little is still a tap: it chooses the shift, it does not move it", async () => {
      const block = shift(root, "lisa", "sat")!;
      const b = block.getBoundingClientRect();
      const [x, y] = [b.left + b.width / 2, b.top + b.height / 2];
      block.dispatchEvent(new PointerEvent("pointerdown", at(x, y, "touch")));
      window.dispatchEvent(new PointerEvent("pointermove", at(x + 6, y + 3, "touch")));
      window.dispatchEvent(new PointerEvent("pointerup", at(x + 6, y + 3, "touch")));
      await afterPaint();
      expect(rotaOf(pci.getResponse())[0].start).toBe("08:30");
      expect(canvas.getByRole("button", { name: "Remove" })).toBeEnabled();
      expect(block.className).toContain("ring-2");
    });

    await step("a second finger (a pinch) does nothing", async () => {
      const block = shift(root, "lisa", "sat")!;
      const b = block.getBoundingClientRect();
      block.dispatchEvent(new PointerEvent("pointerdown", at(b.left + 5, b.top + 5, "touch", false)));
      window.dispatchEvent(new PointerEvent("pointermove", at(b.left + 200, b.top + 80, "touch", false)));
      window.dispatchEvent(new PointerEvent("pointerup", at(b.left + 200, b.top + 80, "touch", false)));
      await afterPaint();
      expect(rotaOf(pci.getResponse())).toEqual([{ employee: "lisa", day: "sat", start: "08:30", end: "17:30", break: 30 }]);
    });

    await step("a cancelled touch (the browser scrolls) does nothing", async () => {
      const block = shift(root, "lisa", "sat")!;
      const b = block.getBoundingClientRect();
      block.dispatchEvent(new PointerEvent("pointerdown", at(b.left + 5, b.top + 5, "touch")));
      window.dispatchEvent(new PointerEvent("pointermove", at(b.left + 5, b.top + 90, "touch")));
      window.dispatchEvent(new PointerEvent("pointercancel", at(b.left + 5, b.top + 90, "touch")));
      await afterPaint();
      expect(rotaOf(pci.getResponse())[0].employee).toBe("lisa");
    });

    await step("the toolbar does the rest: shorter, and remove", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Shorter" }));
      expect(rotaOf(pci.getResponse())[0].end).toBe("17:00");
      await userEvent.click(canvas.getByRole("button", { name: "Remove" }));
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("only what is dragged takes the finger: the cells let the page scroll", async () => {
      expect(getComputedStyle(card(canvas, "Opening")).touchAction).toBe("none");
      expect(getComputedStyle(cell(canvas, "Friday", "Sam", "10:00")).touchAction).toBe("auto");
    });
  },
};

export const MakeRotaScoring: Story = {
  args: { properties: { mode: "makeRota" } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci, root } = await openPci(canvasElement);

    await step("the example's rota: every rule passes", async () => {
      pci.setResponse(rotaResponse(EXAMPLE));
      await waitFor(() => expect(shift(root, "ayoub", "sun")).not.toBeNull());
      const r = pci.getResponse();
      expect(names(r)).toEqual(["score", "maxscore", "correct", "check1", "check2", "check3", "check4", "check5", "check6", "check7", "rota"]);
      expect([field(r, "score"), field(r, "maxscore"), field(r, "correct")]).toEqual([{ integer: 7 }, { integer: 7 }, { integer: 1 }]);
      expect(rotaOf(r)).toEqual(EXAMPLE);
      expect(canvas.queryByRole("region", { name: "Problems" })).toBeNull();
    });

    await step("Sam closes on Thursday and opens on Friday: too little rest, and Friday afternoon is short of people", async () => {
      pci.setResponse(rotaResponse([...EXAMPLE.filter((x) => !(x.employee === "sam" && x.day === "fri")), { employee: "sam", day: "fri", start: "08:00", end: "13:30", break: 0 }]));
      await afterPaint();
      const r = pci.getResponse();
      expect([1, 2, 3, 4, 5, 6, 7].map((i) => (field(r, `check${i}`) as any).integer)).toEqual([0, 1, 1, 1, 1, 0, 1]);
      expect(canvas.getByRole("region", { name: "Problems" })).toHaveTextContent("Friday 13:30–18:00: 1 person, at least 2 needed");
      expect(canvas.getByRole("region", { name: "Problems" })).toHaveTextContent("Sam, Fri 08:00–13:30: Only 10 h 30 min rest after Thursday");
    });
  },
};

export const MakeRotaWithoutFeedback: Story = {
  args: { properties: { mode: "makeRota", feedback: "false" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci, root } = await openPci(canvasElement);
    pci.setResponse(rotaResponse([{ employee: "lisa", day: "thu", start: "08:00", end: "18:00", break: 0 }]));
    await waitFor(() => expect(shift(root, "lisa", "thu")).not.toBeNull());
    expect(shift(root, "lisa", "thu")).not.toHaveAttribute("data-problem");
    expect(canvas.queryByRole("region", { name: "Problems" })).toBeNull();
    expect(canvas.queryByRole("region", { name: "Hours this week" })).toBeNull();
    expect(root.querySelector('[data-testid^="rota-low-"]')).toBeNull();
    expect(field(pci.getResponse(), "check3")).toEqual({ integer: 0 }); // still scored
  },
};

// --- hoursAndPay

export const HoursAndPay: Story = {
  args: { properties: { mode: "hoursAndPay" } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);

    await step("the rota, the pay rules and a box per employee", async () => {
      expect(canvas.getByTestId("pay-rules")).toHaveTextContent("Breaks are not paid.On Sunday you earn 50% extra per hour.");
      expect(canvas.getByTestId("wage-noor")).toHaveTextContent("€ 11.20");
      expect(canvas.getByRole("textbox", { name: "Hours worked by Noor" })).toBeInTheDocument();
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("Noor's hours wrong, her pay worked out from them; Sam right", async () => {
      await userEvent.type(canvas.getByRole("textbox", { name: "Hours worked by Sam" }), "22");
      await userEvent.type(canvas.getByRole("textbox", { name: "Pay of Sam in euros" }), "316.80");
      await userEvent.type(canvas.getByRole("textbox", { name: "Hours worked by Noor" }), "17");
      await userEvent.type(canvas.getByRole("textbox", { name: "Pay of Noor in euros" }), "221.20");
      const r = pci.getResponse();
      expect([field(r, "hours1"), field(r, "pay1"), field(r, "hours2"), field(r, "pay2")]).toEqual([{ float: 22 }, { float: 316.8 }, { float: 17 }, { float: 221.2 }]);
      expect([field(r, "score"), field(r, "maxscore"), field(r, "correct")]).toEqual([{ integer: 3 }, { integer: 10 }, { integer: 0 }]);
      expect([field(r, "hoursCorrect"), field(r, "payCorrect"), field(r, "payFollows")]).toEqual([{ boolean: false }, { boolean: false }, { boolean: false }]);
    });

    await step("everything right", async () => {
      await retype(canvas.getByRole("textbox", { name: "Hours worked by Noor" }), "16.5");
      await retype(canvas.getByRole("textbox", { name: "Pay of Noor in euros" }), "€ 215.60");
      for (const [who, h, p] of [["Daan", "13.5", "129.60"], ["Lisa", "14", "168"], ["Ayoub", "11", "110,-"]]) {
        await userEvent.type(canvas.getByRole("textbox", { name: `Hours worked by ${who}` }), h);
        await userEvent.type(canvas.getByRole("textbox", { name: `Pay of ${who} in euros` }), p);
      }
      const r = pci.getResponse();
      expect([field(r, "score"), field(r, "correct"), field(r, "payFollows")]).toEqual([{ integer: 10 }, { integer: 1 }, { boolean: true }]);
    });
  },
};

const ownRota = JSON.stringify({
  days: [{ day: "sat", open: "10:00", close: "17:00" }, { day: "sun", open: "12:00", close: "17:00" }],
  employees: [{ id: "you", name: "You", min: 0, max: 16, wage: 10 }],
  templates: [{ id: "s1", label: "Saturday", start: "09:30", end: "17:30", break: 30 }],
  own: true, pay: { sunday: 100, askPay: true },
});

export const HoursAndPayOfAnOwnRota: Story = {
  args: { properties: { mode: "hoursAndPay", rota: ownRota } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByTestId("prompt")).toHaveTextContent("Make a rota, then work out how many hours everyone works this week");
    expect(canvas.queryByRole("region", { name: "Hours this week" })).toBeNull(); // that is the question
    await drag(card(canvas, "Saturday"), cell(canvas, "Saturday", "You", "12:00"));
    await drag(card(canvas, "Saturday"), cell(canvas, "Sunday", "You", "12:00"));
    expect(canvas.getByTestId("pay-rules")).toHaveTextContent("On Sunday you earn 100% extra per hour.");
    await userEvent.type(canvas.getByRole("textbox", { name: "Hours worked by You" }), "15");
    await userEvent.type(canvas.getByRole("textbox", { name: "Pay of You in euros" }), "225");
    const r = pci.getResponse();
    expect(rotaOf(r)).toHaveLength(2);
    expect([field(r, "score"), field(r, "correct")]).toEqual([{ integer: 2 }, { integer: 1 }]); // 7.5 h + 7.5 h × 2 at € 10
    expect(pci.getCorrectResponse({ mode: "hoursAndPay", rota: ownRota })).toBeUndefined();
  },
};

// --- languages, state, solution, the correct response

export const Dutch: Story = {
  args: { properties: { mode: "readRota", language: "nl" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByTestId("prompt")).toHaveTextContent("Dit is het rooster van de buurtsuper");
    expect(canvas.getByTestId("table-sam-sat")).toHaveTextContent("08:30–17:30pauze 30 min");
    expect(canvas.getByTestId("table-daan-sun")).toHaveTextContent("vrij");
    await userEvent.type(canvas.getByRole("textbox", { name: "Vraag 2: Hoeveel uur werkt Noor deze week, zonder pauzes?" }), "16,5");
    await userEvent.click(canvas.getByTestId("q4-free"));
    expect(canvas.getByTestId("q4-free")).toHaveAccessibleName("Werkt niet");
    expect(field(pci.getResponse(), "question2")).toEqual({ integer: 1 });
    expect(JSON.parse(String(field(pci.getResponse(), "answers")!.string))[1]).toBe(16.5); // the response does not depend on the language
  },
};

export const DutchHoursAndPay: Story = {
  args: { properties: { mode: "hoursAndPay", language: "nl" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByTestId("wage-noor")).toHaveTextContent("€ 11,20");
    expect(canvas.getByTestId("pay-rules")).toHaveTextContent("Op zondag verdien je 50% extra per uur.");
    await userEvent.type(canvas.getByRole("textbox", { name: "Gewerkte uren van Noor" }), "16,5");
    await userEvent.type(canvas.getByRole("textbox", { name: "Loon van Noor in euro" }), "215,60");
    expect([field(pci.getResponse(), "hours2"), field(pci.getResponse(), "pay2")]).toEqual([{ float: 16.5 }, { float: 215.6 }]);
  },
};

export const DutchMakeRota: Story = {
  args: { properties: { mode: "makeRota", language: "nl" } },
  play: async ({ canvasElement }) => {
    const { canvas, root } = await openPci(canvasElement);
    expect(card(canvas, "Openen")).toHaveAccessibleName("Openen, 08:00–13:30, geen pauze");
    await drag(card(canvas, "Koopavond"), cell(canvas, "donderdag", "Lisa", "10:00"));
    expect(canvas.getByRole("status")).toHaveTextContent("Lisa, donderdag: 13:00–21:30, pauze 30 min. Lisa kan niet op donderdag.");
    expect(canvas.getByRole("region", { name: "Uren deze week" })).toHaveTextContent("Lisa 8 uur (contract 12–16 uur)");
    expect(root.querySelector('[data-testid="rota-low-do-09:00"], [data-testid="rota-low-thu-09:00"]')).toHaveTextContent("0!");
  },
};

export const RestoresState: Story = {
  args: { properties: { mode: "makeRota" } },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await drag(card(first.canvas, "Opening"), cell(first.canvas, "Friday", "Noor", "09:00"));
    const state = first.pci.getState();
    expect(JSON.parse(state).state.shifts).toEqual([{ employee: "noor", day: "fri", start: 480, end: 810, break: 0 }]);
    const second = await remountPci(canvasElement, pci, { state, properties: { mode: "makeRota" } });
    expect(shift(second.root, "noor", "fri")).not.toBeNull();
    expect(second.pci.getResponse()).toEqual(first.pci.getResponse());
    expect(second.changes).toHaveLength(0);
  },
};

export const RestoresAnswers: Story = {
  args: { properties: { mode: "readRota" } },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.type(first.canvas.getByRole("textbox", { name: /^Question 2:/ }), "16,");
    const second = await remountPci(canvasElement, pci, { state: first.pci.getState(), properties: { mode: "readRota" } });
    expect(second.canvas.getByRole("textbox", { name: /^Question 2:/ })).toHaveValue("16,"); // what was typed, also half
  },
};

export const BoundResponse: Story = {
  args: {
    properties: { mode: "hoursAndPay" },
    boundTo: { RESPONSE: { record: [{ name: "hours2", base: { float: 16.5 } }, { name: "pay2", base: { float: 215.6 } }] } },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await waitFor(() => expect(canvas.getByRole("textbox", { name: "Hours worked by Noor" })).toHaveValue("16.5"));
    expect(canvas.getByRole("textbox", { name: "Pay of Noor in euros" })).toHaveValue("215.60");
    expect(field(pci.getResponse(), "score")).toEqual({ integer: 2 });
  },
};

export const SolutionReadRota: Story = {
  args: { properties: { mode: "readRota" }, status: "solution" },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await waitFor(() => expect(canvas.getByTestId("q1-start")).toHaveValue("13:00"));
    expect(canvas.getByTestId("q1-start")).toBeDisabled();
    expect(canvas.getByTestId("q4-free")).toHaveAttribute("aria-pressed", "true");
    expect(canvas.getByRole("textbox", { name: /^Question 2:/ })).toHaveValue("16.5");
    expect(field(pci.getResponse(), "correct")).toEqual({ integer: 1 });
  },
};

export const SolutionMakeRota: Story = {
  args: { properties: { mode: "makeRota" }, status: "solution" },
  play: async ({ canvasElement }) => {
    const { canvas, pci, root } = await openPci(canvasElement);
    await waitFor(() => expect(shift(root, "ayoub", "sun")).not.toBeNull());
    expect(canvas.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(canvas.getByRole("grid")).toHaveAttribute("aria-readonly", "true");
    expect(rotaOf(pci.getResponse())).toEqual(EXAMPLE);
  },
};

export const SolutionHoursAndPay: Story = {
  args: {
    properties: { mode: "hoursAndPay" }, status: "solution",
    responseDeclaration: { cardinality: "record", correctResponse: { value: [{ fieldIdentifier: "hours1", value: "22" }, { fieldIdentifier: "pay1", value: "316.8" }] } },
  },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    await waitFor(() => expect(canvas.getByRole("textbox", { name: "Pay of Sam in euros" })).toHaveValue("316.80"));
    expect(canvas.getByRole("textbox", { name: "Pay of Sam in euros" })).toBeDisabled();
  },
};

export const CorrectResponse: Story = {
  args: { properties: { mode: "readRota" } },
  play: async ({ canvasElement }) => {
    const { pci } = await openPci(canvasElement);
    const correct = pci.getCorrectResponse({ mode: "readRota" });
    expect([field(correct, "score"), field(correct, "correct")]).toEqual([{ integer: 6 }, { integer: 1 }]);
    pci.setResponse(correct);
    await afterPaint();
    expect(pci.getResponse()).toEqual(correct); // setResponse(getCorrectResponse(p)) gives the same response
    expect(field(pci.getCorrectResponse({ mode: "hoursAndPay", language: "nl" }), "pay2")).toEqual({ float: 215.6 });
    expect(pci.getCorrectResponse({ mode: "makeRota" })).toBeUndefined(); // many rotas are right
    expect(pci.getCorrectResponse({})).toBeUndefined(); // the week planner
  },
};

// --- Authoring mode

export const AuthoringReadRota: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { mode: "readRota" } },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);
    const rota = () => JSON.parse(instance.getProperties().rota!);

    await step("starts from the example: the rota, its questions with their answers", async () => {
      expect(canvas.getByTestId("summary")).toHaveTextContent("12 shifts in the rota.");
      expect(instance.validate!()).toEqual([]);
      expect(canvas.getAllByRole("tab").map((x) => x.textContent)).toEqual(["Shop", "Employees", "Questions", "Rota"]);
      await userEvent.click(canvas.getByRole("tab", { name: "Questions" }));
      expect(canvas.getByTestId("question-2-answer-text")).toHaveTextContent("Answer: Sam, Lisa");
      expect(canvas.getByTestId("question-1-answer-text")).toHaveTextContent("Answer: 16.5 h");
    });

    await step("a question of its own kind, and one with the author's text", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "+ Add a question" }));
      await userEvent.selectOptions(canvas.getByTestId("question-6-kind"), "Who works at");
      await userEvent.selectOptions(canvas.getByTestId("question-6-day"), "Friday");
      expect(canvas.getByTestId("question-6-answer-text")).toHaveTextContent("Answer: Noor, Lisa"); // 12:00
      expect(canvas.getByTestId("question-6-text")).toHaveAttribute("placeholder", "Who works on Friday at 12:00?");
      await retype(canvas.getByTestId("question-6-text"), "Who is in the shop at lunch on Friday?");
      expect(rota().questions[6]).toMatchObject({ kind: "whoAt", day: "fri", time: "12:00", text: "Who is in the shop at lunch on Friday?" });
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("an empty rota cannot be read", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Rota" }));
      await userEvent.click(canvas.getByRole("button", { name: "Clear the rota" }));
      expect(instance.validate!()).toContain("The rota is empty.");
    });
  },
};

export const AuthoringMakeRota: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { mode: "makeRota" } },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    const rota = () => JSON.parse(instance.getProperties().rota!);

    await step("the example solution passes every rule", async () => {
      expect(canvas.getByTestId("summary")).toHaveTextContent("The example solution scores 7 of 7.");
      expect(canvas.getAllByRole("tab").map((x) => x.textContent)).toEqual(["Shop", "Employees", "Shift cards", "Rules", "Example solution"]);
    });

    await step("a rule asks for 3 people: the example solution fails it", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Rules" }));
      await retype(canvas.getByTestId("rule-0-staff"), "3");
      canvas.getByTestId("rule-0-staff").dispatchEvent(new Event("change", { bubbles: true }));
      await afterPaint();
      expect(rota().rules[0]).toEqual({ type: "coverage", staff: 3, points: 1 });
      expect(canvas.getByTestId("rule-0-mark")).toHaveTextContent("✗");
      expect(canvas.getByTestId("rule-0-text")).toHaveTextContent("At least 3 people at work whenever the shop is open");
      expect(instance.validate!()).toEqual(["The example solution does not pass rule 1."]);
    });

    await step("an employee who cannot work on Saturday", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Employees" }));
      await userEvent.click(canvas.getByTestId("employee-0-off-sat"));
      expect(rota().employees[0].unavailable).toEqual(["sat"]);
      expect(instance.validate!()).toContain("The example solution does not pass rule 3.");
    });

    await step("a shift card, and the example solution made with the editor", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Shift cards" }));
      await userEvent.click(canvas.getByRole("button", { name: "+ Add" }));
      await retype(canvas.getByTestId("template-4-label"), "Short");
      expect(rota().templates[4]).toMatchObject({ id: "s5", label: "Short", start: "09:00", end: "13:00", break: 0 });
      await userEvent.click(canvas.getByRole("tab", { name: "Example solution" }));
      await drag(card(canvas, "Short"), cell(canvas, "Saturday", "Sam", "10:00"));
      expect(rota().shifts).toContainEqual({ employee: "sam", day: "sat", start: "09:00", end: "13:00", break: 0 });
    });
  },
};

export const AuthoringHoursAndPay: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { mode: "hoursAndPay" } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    const rota = () => JSON.parse(instance.getProperties().rota!);
    await userEvent.click(canvas.getByRole("tab", { name: "Pay" }));
    expect(canvas.getByTestId("pay-preview")).toHaveTextContent("Noor16.5 h€ 215.60");
    await retype(canvas.getByTestId("pay-evening"), "25");
    canvas.getByTestId("pay-evening").dispatchEvent(new Event("change", { bubbles: true }));
    await afterPaint();
    expect(canvas.getByTestId("pay-preview")).toHaveTextContent("Sam22 h€ 322.20"); // 1.5 h after 20:00 on Thursday
    expect(rota().pay).toEqual({ sunday: 50, evening: 25, eveningFrom: "20:00", askPay: true });
    await userEvent.click(canvas.getByRole("tab", { name: "Rota" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "The candidate makes the rota (own rota)" }));
    expect(rota().own).toBe(true);
    expect(canvas.getByRole("tab", { name: "Shift cards" })).toBeInTheDocument();
  },
};

export const AuthoringInDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { mode: "makeRota" } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(canvas.getByTestId("summary")).toHaveTextContent("De voorbeeldoplossing haalt 7 van 7 punten.");
    await userEvent.click(canvas.getByRole("tab", { name: "Regels" }));
    await retype(canvas.getByTestId("rule-4-hours"), "4,5");
    canvas.getByTestId("rule-4-hours").dispatchEvent(new Event("change", { bubbles: true }));
    await afterPaint();
    expect(JSON.parse(instance.getProperties().rota!).rules[4].hours).toBe(4.5);
    expect(canvas.getByTestId("rule-4-text")).toHaveTextContent("Een pauze van minstens 30 min bij een dienst langer dan 4,5 uur");
    expect(JSON.parse(instance.getProperties().rota!).templates[0].label).toBe("Openen");
  },
};

/** Without a test, to try by hand (also with a finger on a tablet). */
export const ToTryReadRota: Story = { name: "Read a rota, to try", args: { properties: { mode: "readRota" } } };
export const ToTryMakeRota: Story = { name: "Make a rota, to try", args: { properties: { mode: "makeRota" } } };
export const ToTryHoursAndPay: Story = { name: "Hours and pay, to try", args: { properties: { mode: "hoursAndPay" } } };
