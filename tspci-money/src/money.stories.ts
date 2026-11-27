import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  afterPaint, focusedIn, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci,
  type PciArgs,
} from "../../.storybook/tspci";
import pci from "./index";
import { EUR, PRESET_CURRENCIES, defaultPieces, newPiece, serializePieces, type PieceDef } from "./money";
import { contrast } from "./look";

const meta = {
  title: "Money",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

// ---- what the stories look at, inside the PCI's shadow root ----

const $ = <T extends Element = HTMLElement>(mounted: MountedPci, selector: string) => {
  const found = mounted.root.querySelector<T>(selector);
  if (!found) throw new Error(`no ${selector} in the PCI`);
  return found;
};
/** The button of a coin or note in the supply (a click or Enter adds one), by its value in cents. */
const supplyPiece = (mounted: MountedPci, cents: number) => $<HTMLButtonElement>(mounted, `[data-supply="${cents}"] .supply-piece`);
const minus = (mounted: MountedPci, cents: number) => $<HTMLButtonElement>(mounted, `[data-supply="${cents}"] .minus`);
const countOf = (mounted: MountedPci, cents: number) => $(mounted, `[data-supply="${cents}"] [data-count]`).textContent;
const leftOf = (mounted: MountedPci, cents: number) => $(mounted, `[data-supply="${cents}"] [data-left]`).textContent;
const supplyValues = (mounted: MountedPci) => Array.from(mounted.root.querySelectorAll<HTMLElement>("[data-supply]")).map((li) => Number(li.dataset.supply));
const counter = (mounted: MountedPci) => $(mounted, "[data-counter]");
/** The coins and notes on the counter, by value in cents, in the order they lie. */
const onCounter = (mounted: MountedPci) => Array.from(counter(mounted).querySelectorAll<HTMLElement>("[data-pieces] [data-value]")).map((el) => Number(el.dataset.value));
const counterPiece = (mounted: MountedPci, cents: number) => $<HTMLButtonElement>(mounted, `[data-counter] .counter-piece[data-value="${cents}"]`);
const answerInput = (mounted: MountedPci) => $<HTMLInputElement>(mounted, "input[data-answer]");

/** Adds coins and notes by a click on them in the supply. */
async function pay(mounted: MountedPci, ...cents: number[]) {
  for (const value of cents) await userEvent.click(supplyPiece(mounted, value));
}

type Field = { name: string; base?: { float?: number; integer?: number; boolean?: boolean } };
/** The record as { field: value }, for comparing. */
const fields = (response: unknown) =>
  Object.fromEntries(((response as { record?: Field[] })?.record ?? []).map((f) => [f.name, f.base?.float ?? f.base?.integer ?? f.base?.boolean]));
const amountRecord = (euros: number) => ({ record: [{ name: "amount", base: { float: euros } }] });

/** A drag with the pointer, as a candidate does it: press on `from`, move a few steps to the middle of `to`, release. */
async function dragTo(mounted: MountedPci, from: Element, to: { x: number; y: number }) {
  const start = from.getBoundingClientRect();
  const x0 = start.left + start.width / 2;
  const y0 = start.top + start.height / 2;
  const fire = (target: Element, type: string, x: number, y: number) =>
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, cancelable: true, pointerId: 7, button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: y, isPrimary: true }));
  fire(from, "pointerdown", x0, y0);
  for (let i = 1; i <= 5; i++) {
    fire(from, "pointermove", x0 + ((to.x - x0) * i) / 5, y0 + ((to.y - y0) * i) / 5);
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  fire(from, "pointerup", to.x, to.y);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}
const middleOf = (element: Element) => {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
};

/** The pieces setting: these coins and notes offered, with a count where one is given (the rest of the euro is left out). */
const piecesOf = (...entries: [number, number | null][]) => serializePieces(entries.map(([value, count]) => ({ ...newPiece(value, EUR), count })));
/** Only coins, and only three of € 2 and one of € 1. */
const onlyCoins = piecesOf([200, 3], [100, 1], [50, null], [20, null], [10, null]);

// ---- the stories ----

/** The money to try out yourself (no test runs on it): with a mouse, a touchscreen or the keyboard. */
export const ToTry: Story = {
  name: "Money, to try",
};

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.getByRole("heading", { name: "At the bookshop" })).toBeInTheDocument();
    expect(canvas.getByText("You buy a book. Put the money on the counter.")).toBeInTheDocument();
    // the amount on a price tag, and the task
    expect($(mounted, "[data-price]")).toHaveTextContent("€7.35");
    expect(canvas.getByText("Pay exactly €7.35.")).toBeInTheDocument();
    // the default supply: no 1 and 2 cent, nothing above € 50
    expect(supplyValues(mounted)).toEqual([5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5]);
    expect(canvas.getByRole("button", { name: "Add a note of €10" })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Add a coin of 50 cents" })).toBeInTheDocument();
    // an empty counter, nothing answered
    expect(onCounter(mounted)).toEqual([]);
    expect(canvas.getByRole("region", { name: "Counter" })).toBeInTheDocument();
    expect(pci.getResponse()).toBeUndefined();
    // no total: counting is the task
    expect(mounted.root.querySelector("[data-total]")).toBeNull();
  },
};

/** € 7,35 by clicks: the response follows every coin and note. */
export const Paying: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { pci } = mounted;

    await step("a click on a coin or note puts one on the counter", async () => {
      await pay(mounted, 500);
      expect(onCounter(mounted)).toEqual([500]);
      expect(countOf(mounted, 500)).toBe("1");
      expect(fields(pci.getResponse())).toEqual({ amount: 5, exact: false });
      expect(fields(await lastChange(mounted))).toEqual({ amount: 5, exact: false });
    });

    await step("the exact amount", async () => {
      await pay(mounted, 200, 20, 10, 5);
      expect(onCounter(mounted)).toEqual([500, 200, 20, 10, 5]);
      expect(fields(pci.getResponse())).toEqual({ amount: 7.35, exact: true });
      // a screen reader hears what is on the counter
      expect($(mounted, "[data-describe]")).toHaveTextContent("On the counter: 1 note of €5, 1 coin of €2, 1 coin of 20 cents, 1 coin of 10 cents, 1 coin of 5 cents.");
    });

    await step("any coins that make it are exact: two coins of € 1 for the € 2", async () => {
      await userEvent.click(minus(mounted, 200));
      await pay(mounted, 100, 100);
      expect(onCounter(mounted)).toEqual([500, 100, 100, 20, 10, 5]);
      expect(fields(pci.getResponse())).toEqual({ amount: 7.35, exact: true });
    });

    await step("a click on a piece on the counter takes it off; an empty counter is no answer", async () => {
      await userEvent.click(counterPiece(mounted, 500));
      expect(fields(pci.getResponse())).toEqual({ amount: 2.35, exact: false });
      for (const value of [100, 100, 20, 10, 5]) await userEvent.click(minus(mounted, value));
      expect(onCounter(mounted)).toEqual([]);
      expect(pci.getResponse()).toBeUndefined();
      expect(minus(mounted, 100)).toBeDisabled();
    });
  },
};

/** Dragging: from the supply onto the counter, and from the counter away. */
export const Dragging: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);

    await step("a coin dragged onto the counter lies there", async () => {
      await dragTo(mounted, supplyPiece(mounted, 200), middleOf(counter(mounted)));
      await waitFor(() => expect(onCounter(mounted)).toEqual([200]));
    });

    await step("dropped next to the counter, nothing happens", async () => {
      const drawer = mounted.root.querySelector(".drawer")!;
      await dragTo(mounted, supplyPiece(mounted, 1000), middleOf(drawer));
      expect(onCounter(mounted)).toEqual([200]);
    });

    await step("dragged off the counter, it goes back", async () => {
      await dragTo(mounted, counterPiece(mounted, 200), middleOf(supplyPiece(mounted, 50)));
      await waitFor(() => expect(onCounter(mounted)).toEqual([]));
      expect(mounted.pci.getResponse()).toBeUndefined();
    });
  },
};

/** Keyboard: every coin and note in the supply is a button (Enter or Space adds one), with − next to it. */
export const Keyboard: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    for (const value of supplyValues(mounted)) {
      expect(supplyPiece(mounted, value).tagName).toBe("BUTTON");
      expect(supplyPiece(mounted, value).tabIndex).toBe(0);
      expect(minus(mounted, value).tagName).toBe("BUTTON");
    }
    // Enter on a button is a click (userEvent.keyboard does not reach into the shadow root)
    supplyPiece(mounted, 50).focus();
    supplyPiece(mounted, 50).click();
    supplyPiece(mounted, 50).click();
    await waitFor(() => expect(countOf(mounted, 50)).toBe("2"));
    expect($(mounted, `[data-supply="50"] [data-count]`)).toHaveAttribute("aria-label", "2 on the counter");
    minus(mounted, 50).click();
    await waitFor(() => expect(countOf(mounted, 50)).toBe("1"));
    // the last one off: the − is disabled, and the focus goes to the coin in the supply instead of being lost
    minus(mounted, 50).focus();
    minus(mounted, 50).click();
    await waitFor(() => expect(countOf(mounted, 50)).toBe("0"));
    await waitFor(() => expect(focusedIn(mounted.root)).toBe(supplyPiece(mounted, 50)));
  },
};

/** As few coins and notes as possible: € 7,35 is € 5, € 2, 20, 10 and 5 cent. */
export const Fewest: Story = {
  args: { properties: { task: "fewest" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.canvas.getByText("Pay exactly €7.35, with as few coins and notes as possible.")).toBeInTheDocument();
    await pay(mounted, 200, 200, 200, 100, 20, 10, 5);
    expect(fields(mounted.pci.getResponse())).toEqual({ amount: 7.35, exact: true, pieces: 7, fewest: false });
    await userEvent.click(minus(mounted, 200));
    await userEvent.click(minus(mounted, 200));
    await userEvent.click(minus(mounted, 100));
    await pay(mounted, 500);
    expect(fields(mounted.pci.getResponse())).toEqual({ amount: 7.35, exact: true, pieces: 5, fewest: true });
    expect(mounted.pci.getResponse()).toEqual(pci.getCorrectResponse!({ task: "fewest" } as never));
  },
};

/** Only coins, and only three of € 2 and one of € 1: the fewest is computed with that supply. */
export const LimitedSupply: Story = {
  args: { properties: { task: "fewest", amount: "8,70", pieces: onlyCoins } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(supplyValues(mounted)).toEqual([200, 100, 50, 20, 10]);
    expect(leftOf(mounted, 200)).toBe("3 left");
    await pay(mounted, 200, 200, 200);
    expect(leftOf(mounted, 200)).toBe("0 left");
    expect(supplyPiece(mounted, 200)).toBeDisabled();
    await userEvent.click(supplyPiece(mounted, 200)); // nothing left: nothing happens
    expect(countOf(mounted, 200)).toBe("3");
    // with this supply the fewest for € 8,70 is 3 × € 2, € 1, 3 × 50 and 20 cent: 8 coins
    await pay(mounted, 100, 50, 50, 50, 20);
    expect(fields(mounted.pci.getResponse())).toEqual({ amount: 8.7, exact: true, pieces: 8, fewest: true });
    expect(fields(pci.getCorrectResponse!({ task: "fewest", amount: "8,70", pieces: onlyCoins } as never))).toEqual({
      amount: 8.7,
      exact: true,
      pieces: 8,
      fewest: true,
    });
  },
};

/** Change: a book of € 7,35, the customer pays with € 10; the change is € 2,65. */
export const Change: Story = {
  args: { properties: { task: "change", question: "A customer buys a book." } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect($(mounted, "[data-price]")).toHaveTextContent("Price€7.35");
    expect(canvas.getByRole("list", { name: "The customer pays with" })).toBeInTheDocument();
    expect(canvas.getByRole("listitem", { name: "note of €10" })).toBeInTheDocument();
    expect(canvas.getByText("Give the change.")).toBeInTheDocument();
    await pay(mounted, 100, 100, 50, 10, 5);
    // the change, in any coins
    expect(fields(mounted.pci.getResponse())).toEqual({ amount: 2.65, exact: true });
    expect(mounted.pci.getResponse()).toEqual(pci.getCorrectResponse!({ task: "change" } as never));
  },
};

export const ChangeFewest: Story = {
  args: { properties: { task: "changeFewest", amount: "3,65", given: "5; 2x 0,50", title: "At the market", question: "A customer buys a bag of apples." } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.root.querySelectorAll("[aria-label='The customer pays with'] li")).toHaveLength(3);
    expect(mounted.canvas.getByText("Give the change, with as few coins and notes as possible.")).toBeInTheDocument();
    // 6,00 − 3,65 = 2,35: € 2, 20, 10 and 5 cent
    await pay(mounted, 100, 100, 20, 10, 5);
    expect(fields(mounted.pci.getResponse())).toEqual({ amount: 2.35, exact: true, pieces: 5, fewest: false });
    await userEvent.click(minus(mounted, 100));
    await userEvent.click(minus(mounted, 100));
    await pay(mounted, 200);
    expect(fields(mounted.pci.getResponse())).toEqual({ amount: 2.35, exact: true, pieces: 4, fewest: true });
  },
};

/** Count: the counter holds € 15,15; the candidate writes it. */
export const Count: Story = {
  args: { properties: { task: "count", question: "Sanne empties her piggy bank." } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.getByText("How much money is on the counter?")).toBeInTheDocument();
    expect(onCounter(mounted)).toEqual([1000, 200, 200, 50, 20, 20, 20, 5]);
    // the money is the author's: no supply, and it does not come off
    expect(mounted.root.querySelector(".drawer")).toBeNull();
    expect(mounted.root.querySelector(".counter-piece")).toBeNull();
    expect(canvas.getAllByRole("img", { name: "coin of 20 cents" })).toHaveLength(3);
    expect(pci.getResponse()).toBeUndefined();

    await step("the amount, with a comma or a point, with or without €", async () => {
      await userEvent.type(answerInput(mounted), "15,15");
      expect(fields(pci.getResponse())).toEqual({ answer: 15.15, exact: true });
      expect(fields(await lastChange(mounted))).toEqual({ answer: 15.15, exact: true });
      await retype(answerInput(mounted), "€ 15.10");
      expect(fields(pci.getResponse())).toEqual({ answer: 15.1, exact: false });
      await retype(answerInput(mounted), "15");
      expect(fields(pci.getResponse())).toEqual({ answer: 15, exact: false });
    });

    await step("no amount is no answer, and the box says so", async () => {
      await retype(answerInput(mounted), "veel");
      expect(pci.getResponse()).toBeUndefined();
      expect(pci.checkValidity()).toBe(false);
      await retype(answerInput(mounted), "{Backspace}");
      expect(pci.getResponse()).toBeUndefined();
      expect(pci.checkValidity()).toBe(true);
    });
  },
};

/** Dutch: the PCI's texts, and amounts as € 7,35. */
export const Dutch: Story = {
  args: { properties: { language: "nl", title: "In de boekwinkel", question: "Je koopt een boek.", task: "fewest", showTotal: "true" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect($(mounted, "[data-price]")).toHaveTextContent("€ 7,35");
    expect(canvas.getByText("Betaal precies € 7,35, met zo weinig mogelijk munten en biljetten.")).toBeInTheDocument();
    expect(canvas.getByRole("region", { name: "Toonbank" })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Een biljet van € 5 erbij" })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Een munt van 50 cent erbij" })).toBeInTheDocument();
    await pay(mounted, 500, 200);
    expect($(mounted, "[data-total]")).toHaveTextContent("Totaal: € 7,00");
    // the coin on the counter and − in the supply
    expect(canvas.getAllByRole("button", { name: "Een munt van € 2 van de toonbank halen" })).toHaveLength(2);
    expect($(mounted, "[data-describe]")).toHaveTextContent("Op de toonbank: 1 biljet van € 5, 1 munt van € 2.");
  },
};

/** The author sees what is wrong with the settings: € 7,33 can not be paid without 1 and 2 cent. */
export const SettingsProblem: Story = {
  args: { properties: { amount: "7,33" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.canvas.getByRole("alert")).toHaveTextContent("This amount can not be made with these coins and notes.");
    expect(pci.getCorrectResponse!({ amount: "7,33" } as never)).toBeUndefined();
  },
};

export const RestoreState: Story = {
  args: { properties: { task: "fewest" } },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await pay(first, 500, 100, 100, 20, 10);
    const state = first.pci.getState();

    // the candidate comes back to the item: everything is as they left it
    const second = await remountPci(canvasElement, pci, { properties: { task: "fewest" }, state });
    expect(onCounter(second)).toEqual([500, 100, 100, 20, 10]);
    expect(fields(second.pci.getResponse())).toEqual({ amount: 7.3, exact: false, pieces: 5, fewest: false });
    await pay(second, 5);
    expect(countOf(second, 5)).toBe("1");
  },
};

export const RestoreStateCount: Story = {
  args: { properties: { task: "count" } },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.type(answerInput(first), "15,15");
    const second = await remountPci(canvasElement, pci, { properties: { task: "count" }, state: first.pci.getState() });
    expect(answerInput(second)).toHaveValue("15,15");
    expect(fields(second.pci.getResponse())).toEqual({ answer: 15.15, exact: true });
  },
};

export const ForeignState: Story = {
  args: { state: "not a state of this PCI" },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(onCounter(mounted)).toEqual([]);
    expect(mounted.pci.getResponse()).toBeUndefined();
  },
};

/** A response handed back: the response says how much, so the counter gets the fewest coins and notes for it. */
export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: amountRecord(7.35) } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(onCounter(mounted)).toEqual([500, 200, 20, 10, 5]);
    expect(fields(mounted.pci.getResponse())).toEqual({ amount: 7.35, exact: true });
    // setResponse does the same
    mounted.pci.setResponse(amountRecord(2.5));
    await waitFor(() => expect(onCounter(mounted)).toEqual([200, 50]));
  },
};

export const BoundResponseCount: Story = {
  args: { properties: { task: "count", language: "nl" }, boundTo: { RESPONSE: { record: [{ name: "answer", base: { float: 15.1 } }] } } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(answerInput(mounted)).toHaveValue("15,10");
    expect(fields(mounted.pci.getResponse())).toEqual({ answer: 15.1, exact: false });
  },
};

/** Status "solution": the correct response of the item, read-only. */
export const Solution: Story = {
  args: { status: "solution", properties: { task: "changeFewest" }, responseDeclaration: { correctResponse: { value: pci.getCorrectResponse!({ task: "changeFewest" } as never) } } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(onCounter(mounted)).toEqual([200, 50, 10, 5]);
    expect(fields(mounted.pci.getResponse())).toEqual({ amount: 2.65, exact: true, pieces: 4, fewest: true });
    // read-only: no supply, and nothing comes off the counter
    expect(mounted.root.querySelector(".drawer")).toBeNull();
    expect(mounted.root.querySelectorAll("button")).toHaveLength(0);
  },
};

/** Status "solution" without a correct response in the item: the one from the settings. */
export const SolutionFromSettings: Story = {
  args: { status: "solution", properties: { task: "count" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(answerInput(mounted)).toHaveValue("15.15");
    expect(answerInput(mounted)).toBeDisabled();
  },
};

export const Review: Story = {
  args: { status: "review", state: JSON.stringify({ state: { tray: { 500: 1, 200: 1 }, answer: "" }, log: [] }) },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(onCounter(mounted)).toEqual([500, 200]);
    // read-only: no supply, and the pieces on the counter can not be taken off (a click does nothing)
    expect(mounted.root.querySelector(".drawer")).toBeNull();
    expect(mounted.root.querySelector(".counter-piece")).toBeNull();
    await userEvent.click(mounted.root.querySelector<HTMLElement>("[data-pieces] [data-value]")!);
    expect(onCounter(mounted)).toEqual([500, 200]);
    expect(mounted.canvas.getAllByRole("img", { name: "note of €5" })).toHaveLength(1);
  },
};

/** The correct response from the settings, per task: the fields match what the PCI reports for a right answer. */
export const CorrectResponse: Story = {
  play: async () => {
    const correct = (properties: Record<string, string>) => fields(pci.getCorrectResponse!(properties as never));
    expect(correct({ task: "pay" })).toEqual({ amount: 7.35, exact: true });
    expect(correct({ task: "fewest" })).toEqual({ amount: 7.35, exact: true, pieces: 5, fewest: true });
    expect(correct({ task: "change" })).toEqual({ amount: 2.65, exact: true });
    expect(correct({ task: "changeFewest", amount: "3,65", given: "5; 2x 0,50" })).toEqual({ amount: 2.35, exact: true, pieces: 4, fewest: true });
    expect(correct({ task: "count" })).toEqual({ answer: 15.15, exact: true });
    expect(pci.getCorrectResponse!({ task: "pay", amount: "" } as never)).toBeUndefined();
  },
};

export const Validity: Story = {
  play: async ({ canvasElement }) => {
    const { pci } = await openPci(canvasElement);
    expect(pci.checkValidity()).toBe(true);
    pci.setCustomValidity("Leg geld op de toonbank.");
    expect(pci.getCustomValidity()).toBe("Leg geld op de toonbank.");
    expect(pci.checkValidity()).toBe(false);
    pci.setCustomValidity("");
    expect(pci.checkValidity()).toBe(true);
  },
};

/** Two on one page: each has its own counter. */
export const TwoInstances: Story = {
  render: (args) => {
    const page = document.createElement("div");
    for (const id of ["first", "second"]) {
      const slot = document.createElement("div");
      slot.dataset.slot = id;
      slot.appendChild(mountPci(pci, id === "first" ? args : { ...args, properties: { task: "count", title: "Second" } }));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=first]")!);
    const second = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=second]")!);
    expect(first.pci).not.toBe(second.pci);
    await pay(first, 200);
    await userEvent.type(answerInput(second), "3");
    expect(fields(first.pci.getResponse())).toEqual({ amount: 2, exact: false });
    expect(fields(second.pci.getResponse())).toEqual({ answer: 3, exact: false });
    expect(first.changes.length).toBeGreaterThan(0);
    expect(second.changes.length).toBeGreaterThan(0);
  },
};

// ---- other currencies ----

/** Dollars: $7.35 in as few as possible is $5, two $1 notes, a quarter and a dime. */
export const Dollars: Story = {
  args: { properties: { currency: "usd", task: "fewest", amount: "7,35" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;

    await step("the amount and the coins and notes of the dollar", async () => {
      expect($(mounted, "[data-price]")).toHaveTextContent("$7.35");
      expect(canvas.getByText("Pay exactly $7.35, with as few coins and notes as possible.")).toBeInTheDocument();
      // no 50 cent coin and no $2 note offered; the $1 is a note, in the row of notes
      expect(supplyValues(mounted)).toEqual([10000, 5000, 2000, 1000, 500, 100, 25, 10, 5, 1]);
      expect(canvas.getByRole("button", { name: "Add a note of $1" })).toBeInTheDocument();
      expect(canvas.getByRole("button", { name: "Add a coin of 25 cents" })).toBeInTheDocument();
      expect(canvas.getByRole("button", { name: "Add a coin of 1 cent" })).toBeInTheDocument();
      expect(supplyPiece(mounted, 100).closest("ul")).toBe(supplyPiece(mounted, 500).closest("ul"));
      expect(supplyPiece(mounted, 25).querySelector("svg")).toHaveTextContent("25CENTS");
      expect(supplyPiece(mounted, 2000).querySelector("svg")).toHaveTextContent("20DOLLARS$");
    });

    await step("paid in the fewest pieces", async () => {
      await pay(mounted, 500, 100, 100, 25, 10);
      expect(fields(mounted.pci.getResponse())).toEqual({ amount: 7.35, exact: true, pieces: 5, fewest: true });
      expect($(mounted, "[data-describe]")).toHaveTextContent("On the counter: 1 note of $5, 2 notes of $1, 1 coin of 25 cents, 1 coin of 10 cents.");
      expect(mounted.pci.getResponse()).toEqual(pci.getCorrectResponse!({ currency: "usd", task: "fewest", amount: "7,35" } as never));
    });

    await step("an amount below a dollar is written in cents", async () => {
      expect(fields(pci.getCorrectResponse!({ currency: "usd", task: "pay", amount: "35¢" } as never))).toEqual({ amount: 0.35, exact: true });
    });
  },
};

/** Dollars in Dutch: count the money and write it, with a decimal comma. */
export const DollarsCountDutch: Story = {
  args: { properties: { currency: "usd", task: "count", countPieces: "5; 2x 25¢; 10¢", language: "nl", title: "Spaarpot", question: "Tom telt zijn geld." } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.getByRole("img", { name: "biljet van $ 5" })).toBeInTheDocument();
    expect(canvas.getAllByRole("img", { name: "munt van 25 cent" })).toHaveLength(2);
    expect($(mounted, "[data-sign]")).toHaveTextContent("$");
    expect(answerInput(mounted)).toHaveAttribute("placeholder", "bijv. 7,35");
    await userEvent.type(answerInput(mounted), "5,60");
    expect(fields(pci.getResponse())).toEqual({ answer: 5.6, exact: true });
    await retype(answerInput(mounted), "$5.60");
    expect(fields(pci.getResponse())).toEqual({ answer: 5.6, exact: true });
    // euros are not an amount in dollars: no answer, and the box says so
    await retype(answerInput(mounted), "€ 5,60");
    expect(pci.getResponse()).toBeUndefined();
    expect(pci.checkValidity()).toBe(false);
    expect(answerInput(mounted).validationMessage).toBe("Schrijf een bedrag, zoals 7,35");
  },
};

/** Pounds: change from £10 for £6.45, in as few coins as possible: £2, £1, 50p and 5p. */
export const Pounds: Story = {
  args: { properties: { currency: "gbp", task: "changeFewest", amount: "6,45", given: "10", showTotal: "true", title: "At the market", question: "A customer buys a bag of apples." } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect($(mounted, "[data-price]")).toHaveTextContent("Price£6.45");
    expect(canvas.getByRole("listitem", { name: "note of £10" })).toBeInTheDocument();
    expect(supplyValues(mounted)).toEqual([5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1]);
    expect(canvas.getByRole("button", { name: "Add a coin of 50 pence" })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Add a coin of 1 penny" })).toBeInTheDocument();
    await pay(mounted, 50);
    expect($(mounted, "[data-total]")).toHaveTextContent("Total: 50p");
    await pay(mounted, 200, 100, 5);
    expect($(mounted, "[data-total]")).toHaveTextContent("Total: £3.55");
    expect(fields(pci.getResponse())).toEqual({ amount: 3.55, exact: true, pieces: 4, fewest: true });
    expect(supplyPiece(mounted, 2).querySelector("svg")).toHaveTextContent("2PENCE");
  },
};

/** Pounds in Dutch: the counter holds £21.02, written as 21,02. */
export const PoundsCountDutch: Story = {
  args: { properties: { currency: "gbp", task: "count", countPieces: "20; 2x 50p; 2p", language: "nl", title: "In Londen", question: "Hoeveel geld heeft Sam?" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.getByRole("img", { name: "biljet van £ 20" })).toBeInTheDocument();
    expect(canvas.getAllByRole("img", { name: "munt van 50 pence" })).toHaveLength(2);
    expect(canvas.getByRole("img", { name: "munt van 2 pence" })).toBeInTheDocument();
    await userEvent.type(answerInput(mounted), "21,02");
    expect(fields(pci.getResponse())).toEqual({ answer: 21.02, exact: true });
    expect(pci.checkValidity()).toBe(true);
  },
};

const krone = {
  currency: "custom",
  currencySign: "kr",
  currencyPosition: "after",
  minorUnit: "øre",
  pieces: serializePieces([
    { value: 50, kind: "coin", color: "copper", offered: true, count: null },
    { value: 100, kind: "coin", color: "silver", offered: true, count: null },
    { value: 500, kind: "coin", color: "silver", offered: true, count: null },
    { value: 2000, kind: "coin", color: "goldInSilver", offered: true, count: null },
    { value: 5000, kind: "note", color: "#c2410c", offered: true, count: null },
    { value: 10000, kind: "note", color: "#1d4ed8", offered: true, count: null },
  ]),
};

/** A currency of the author's own, in Dutch: kr after the amount, øre as the minor unit. */
export const CustomCurrency: Story = {
  args: { properties: { ...krone, language: "nl", task: "pay", amount: "27,50", showTotal: "true", title: "In Kopenhagen", question: "Je koopt een ijsje en een kaart." } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect($(mounted, "[data-price]")).toHaveTextContent("27,50 kr");
    expect(canvas.getByText("Betaal precies 27,50 kr.")).toBeInTheDocument();
    expect(supplyValues(mounted)).toEqual([10000, 5000, 2000, 500, 100, 50]);
    expect(canvas.getByRole("button", { name: "Een munt van 50 øre erbij" })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Een biljet van 50 kr erbij" })).toBeInTheDocument();
    expect(supplyPiece(mounted, 2000).querySelector("svg")).toHaveTextContent("20kr");
    await pay(mounted, 2000, 500, 100, 100, 50);
    expect($(mounted, "[data-total]")).toHaveTextContent("Totaal: 27,50 kr");
    expect(fields(pci.getResponse())).toEqual({ amount: 27.5, exact: true });
  },
};

/** A currency of the author's own without a minor unit, its sign before the amount: only whole amounts. */
export const CustomCurrencyWhole: Story = {
  args: { properties: { currency: "custom", currencySign: "₣", task: "count", countPieces: "20; 2x 5; 1", title: "Francs", question: "Count the money." } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    // the default coins and notes of a currency of one's own: coins up to 10, notes from 20
    expect(canvas.getByRole("img", { name: "note of ₣20" })).toBeInTheDocument();
    expect(canvas.getAllByRole("img", { name: "coin of ₣5" })).toHaveLength(2);
    expect(answerInput(mounted)).toHaveAttribute("placeholder", "e.g. 7");
    await userEvent.type(answerInput(mounted), "31");
    expect(fields(pci.getResponse())).toEqual({ answer: 31, exact: true });
    await retype(answerInput(mounted), "31.50");
    expect(pci.getResponse()).toBeUndefined();
    expect(pci.checkValidity()).toBe(false);
  },
};

/** Coins and notes in colours of the author's: the value stays readable on each (at least 4.5:1). */
export const ColouredPieces: Story = {
  args: {
    properties: {
      title: "Play money",
      question: "Pay the toy.",
      amount: "8,60",
      showTotal: "true",
      pieces: serializePieces([
        { value: 10, kind: "coin", color: "#7c3aed", offered: true, count: null },
        { value: 50, kind: "coin", color: "#fde047", offered: true, count: null },
        { value: 100, kind: "coin", color: "#0080c0", offered: true, count: null },
        { value: 200, kind: "coin", color: "silver", offered: true, count: null },
        { value: 500, kind: "note", color: "#111827", offered: true, count: null },
        { value: 1000, kind: "note", color: "#f472b6", offered: true, count: null },
        { value: 2000, kind: "note", color: "#22c55e", offered: true, count: null },
      ]),
    },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(supplyValues(mounted)).toEqual([2000, 1000, 500, 200, 100, 50, 10]);
    for (const value of supplyValues(mounted)) {
      const svg = supplyPiece(mounted, value).querySelector("svg")!;
      const texts = Array.from(svg.querySelectorAll("text"));
      if (value >= 500) {
        // the value and its unit in the panel, the sign on the colour of the note
        const panel = svg.querySelectorAll("rect")[1].getAttribute("fill")!;
        expect(texts.map((t) => t.textContent)).toEqual([String(value / 100), "EURO", "€"]);
        expect(contrast(texts[0].getAttribute("fill")!, panel)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(texts[1].getAttribute("fill")!, panel)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(texts[2].getAttribute("fill")!, svg.querySelector("rect")!.getAttribute("fill")!)).toBeGreaterThanOrEqual(4.5);
      } else {
        const face = svg.querySelectorAll("circle")[2].getAttribute("fill")!;
        for (const text of texts) expect(contrast(text.getAttribute("fill")!, face)).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(supplyPiece(mounted, 500).querySelector("svg")).toHaveAttribute("data-color", "#111827");
    // white on the dark note's colour, dark on the yellow coin
    expect(supplyPiece(mounted, 500).querySelectorAll("text")[2]).toHaveAttribute("fill", "#ffffff");
    expect(supplyPiece(mounted, 50).querySelector("text")).toHaveAttribute("fill", "#14181d");
    await pay(mounted, 500, 200, 100, 50, 10);
    expect(fields(mounted.pci.getResponse())).toEqual({ amount: 8.6, exact: true });
  },
};

// ---- the authoring mode ----

type Authoring = StoryObj<AuthoringArgs>;
type MountedAuthoring = Awaited<ReturnType<typeof openAuthoring>>;
const authorRow = (m: MountedAuthoring, value: number) => {
  const row = m.root.querySelector<HTMLElement>(`li[data-value="${value}"]`);
  if (!row) throw new Error(`no row of ${value}`);
  return row;
};
const authorRows = (m: MountedAuthoring) => Array.from(m.root.querySelectorAll<HTMLElement>("li[data-value]")).map((li) => Number(li.dataset.value));
const written = (m: MountedAuthoring) => m.instance.getProperties() as Record<string, string>;
const writtenPieces = (m: MountedAuthoring) => JSON.parse(written(m).pieces) as PieceDef[];
const writtenPiece = (m: MountedAuthoring, value: number) => writtenPieces(m).find((p) => p.value === value);
/** Sets the value of an input (a number or a colour) as the browser does, and fires input. */
async function setInput(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await afterPaint();
}
/** A key on an element, as the keyboard does it (userEvent.keyboard does not reach into the shadow root). */
async function press(element: HTMLElement, key: string) {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  await afterPaint();
}
const radio = (m: MountedAuthoring, name: string) => m.canvas.getByRole("radio", { name }) as HTMLButtonElement;

/** Choosing a currency: its usual coins and notes; choosing the one before again gives back what the author set up. */
export const AuthoringPreset: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const m = await openAuthoring(canvasElement);
    const { canvas } = m;

    await step("starts from the settings: the euro, every coin and note drawn", async () => {
      expect(canvas.getByRole("heading", { name: "Coins and notes" })).toBeInTheDocument();
      expect(radio(m, "Euro (€)")).toHaveAttribute("aria-checked", "true");
      expect(authorRows(m)).toEqual([1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]);
      expect(authorRow(m, 200).querySelector("svg")).toHaveAttribute("data-color", "goldInSilver");
      expect(canvas.getByRole("checkbox", { name: "The pupil can take it: coin of 1 cent" })).not.toBeChecked();
      expect(canvas.getByRole("checkbox", { name: "The pupil can take it: note of €50" })).toBeChecked();
      expect(canvas.getByText(/^A currency starts with its usual coins and notes/)).toBeInTheDocument();
      expect(m.instance.validate()).toEqual([]);
      expect(written(m)).toMatchObject({ currency: "eur" });
      expect(writtenPieces(m)).toEqual(defaultPieces(EUR));
    });

    await step("the dollar: its coins and notes", async () => {
      await userEvent.click(radio(m, "US dollar ($)"));
      expect(authorRows(m)).toEqual([1, 5, 10, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000]);
      expect(written(m).currency).toBe("usd");
      expect(writtenPieces(m)).toEqual(defaultPieces(PRESET_CURRENCIES.usd));
      expect(m.changes.length).toBeGreaterThan(0);
      // the half dollar offered
      await userEvent.click(canvas.getByRole("checkbox", { name: "The pupil can take it: coin of 50 cents" }));
      expect(writtenPiece(m, 50)!.offered).toBe(true);
    });

    await step("back to the euro and to the dollar again: the half dollar is still offered", async () => {
      await userEvent.click(radio(m, "Euro (€)"));
      expect(authorRows(m)).toHaveLength(14);
      await userEvent.click(radio(m, "US dollar ($)"));
      expect(writtenPiece(m, 50)!.offered).toBe(true);
      // back to the usual coins and notes
      await userEvent.click(canvas.getByRole("button", { name: "Back to the usual coins and notes" }));
      expect(writtenPiece(m, 50)!.offered).toBe(false);
    });

    await step("the pound, chosen with the arrow keys", async () => {
      const usd = radio(m, "US dollar ($)");
      expect(usd.tabIndex).toBe(0);
      expect(radio(m, "British pound (£)").tabIndex).toBe(-1);
      await press(usd, "ArrowRight");
      expect(radio(m, "British pound (£)")).toHaveAttribute("aria-checked", "true");
      expect(focusedIn(m.root)).toBe(radio(m, "British pound (£)"));
      expect(authorRows(m)).toEqual([1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]);
      expect(written(m).currency).toBe("gbp");
    });
  },
};

/** Per coin or note: coin or note, its colour, how many; adding and removing one. */
export const AuthoringEdit: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const m = await openAuthoring(canvasElement);
    const { canvas } = m;

    await step("€2 made a note: a note's colour", async () => {
      await userEvent.click(within(authorRow(m, 200)).getByRole("radio", { name: "Note" }));
      expect(writtenPiece(m, 200)).toMatchObject({ kind: "note", color: expect.stringMatching(/^#/) });
      expect(canvas.getByRole("checkbox", { name: "The pupil can take it: note of €2" })).toBeInTheDocument();
      // and back with the arrow keys: a coin again, in its own metals
      await press(within(authorRow(m, 200)).getByRole("radio", { name: "Note" }), "ArrowLeft");
      expect(writtenPiece(m, 200)).toMatchObject({ kind: "coin", color: "goldInSilver" });
    });

    await step("a colour: a metal, a named colour, or any colour", async () => {
      await userEvent.click(within(authorRow(m, 50)).getByRole("radio", { name: "Silver" }));
      expect(writtenPiece(m, 50)!.color).toBe("silver");
      expect(authorRow(m, 50).querySelector("svg")).toHaveAttribute("data-color", "silver");
      await userEvent.click(within(authorRow(m, 1000)).getByRole("radio", { name: "Purple" }));
      expect(writtenPiece(m, 1000)!.color).toBe("#a07cc5");
      await setInput(within(authorRow(m, 20)).getByLabelText("Colour: coin of 20 cents: Other colour") as HTMLInputElement, "#1d4ed8");
      expect(writtenPiece(m, 20)!.color).toBe("#1d4ed8");
      // no named colour picked: the first swatch is in the tab order
      expect(within(authorRow(m, 20)).getByRole("radio", { name: "Copper" }).tabIndex).toBe(0);
    });

    await step("how many: a number, or empty for as many as needed", async () => {
      const number = canvas.getByRole("spinbutton", { name: "Number: coin of €2 (empty: as many as needed)" }) as HTMLInputElement;
      expect(number).toHaveValue(null);
      await setInput(number, "3");
      expect(writtenPiece(m, 200)!.count).toBe(3);
      await setInput(number, "");
      expect(writtenPiece(m, 200)!.count).toBeNull();
    });

    await step("a coin added and removed", async () => {
      const value = canvas.getByRole("textbox", { name: "Value" }) as HTMLInputElement;
      await userEvent.type(value, "abc");
      expect(canvas.getByText("Not an amount of this currency.")).toBeInTheDocument();
      expect(canvas.getByRole("button", { name: "+ Add" })).toBeDisabled();
      await retype(value, "0,25");
      await userEvent.click(canvas.getByRole("button", { name: "+ Add" }));
      expect(authorRows(m)).toEqual([1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]);
      expect(writtenPiece(m, 25)).toEqual({ value: 25, kind: "coin", color: "gold", offered: true, count: null });
      expect(value).toHaveValue("");
      // a note of € 25 (setInput: user-event does not see that the PCI emptied the box)
      await setInput(value, "25");
      await userEvent.click(canvas.getByRole("button", { name: "+ Add" }));
      expect(writtenPiece(m, 2500)!.kind).toBe("note");
      // removed: the focus goes to the remove button of the next one
      await userEvent.click(canvas.getByRole("button", { name: "Remove the coin of 25 cents" }));
      expect(authorRows(m)).not.toContain(25);
      expect(writtenPiece(m, 25)).toBeUndefined();
      await waitFor(() => expect(focusedIn(m.root)).toBe(canvas.getByRole("button", { name: "Remove the coin of 50 cents" })));
      expect(m.instance.validate()).toEqual([]);
    });
  },
};

/** What keeps Done from finishing: an amount that can not be paid, a value twice, nothing offered. */
export const AuthoringValidate: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { task: "pay", amount: "7,33" } },
  play: async ({ canvasElement }) => {
    const m = await openAuthoring(canvasElement);
    const { canvas } = m;
    const status = () => m.root.querySelector("[data-problems]")!;
    expect(m.instance.validate()).toEqual(["The amount of the task, €7.33, can not be paid with the coins and notes the pupil can take."]);
    expect(status()).toHaveTextContent("€7.33");
    // 1 and 2 cent offered: it can
    await userEvent.click(canvas.getByRole("checkbox", { name: "The pupil can take it: coin of 1 cent" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "The pupil can take it: coin of 2 cents" }));
    expect(m.instance.validate()).toEqual([]);
    expect(status()).toHaveTextContent("Ready: the pupil can take 12 of the 14 coins and notes.");
    // € 2 twice
    await userEvent.type(canvas.getByRole("textbox", { name: "Value" }), "2");
    await userEvent.click(canvas.getByRole("button", { name: "+ Add" }));
    expect(m.instance.validate()).toEqual(["Two coins or notes have the same value."]);
    expect(canvas.getAllByText("Same value as another one")).toHaveLength(2);
    await userEvent.click(canvas.getAllByRole("button", { name: "Remove the coin of €2" })[1]);
    expect(m.instance.validate()).toEqual([]);
    // nothing offered
    for (const box of canvas.getAllByRole("checkbox") as HTMLInputElement[]) if (box.checked) await userEvent.click(box);
    expect(m.instance.validate()).toEqual(["Offer at least one coin or note to the pupil."]);
  },
};

/** A currency of the author's own: its sign, where it goes, a minor unit, and its coins and notes. */
export const AuthoringCustom: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const m = await openAuthoring(canvasElement);
    const { canvas } = m;

    await step("another currency needs a sign", async () => {
      await userEvent.click(radio(m, "Other currency"));
      expect(written(m)).toMatchObject({ currency: "custom", currencySign: "", minorUnit: "" });
      expect(m.instance.validate()).toContain("Give the sign of the currency (e.g. kr).");
      // without a minor unit: from 1 up
      expect(authorRows(m)).toEqual([100, 200, 500, 1000, 2000, 5000, 10000, 20000]);
    });

    await step("kr after the amount, with øre", async () => {
      await userEvent.type(canvas.getByRole("textbox", { name: "Sign" }), "kr");
      await userEvent.click(radio(m, "After the amount: 7 kr"));
      expect(m.root.querySelector("[data-examples]")).toHaveTextContent("Amounts look like 7 kr.");
      await userEvent.type(canvas.getByRole("textbox", { name: "Minor unit" }), "øre");
      expect(m.root.querySelector("[data-examples]")).toHaveTextContent("Amounts look like 7.35 kr and 50 øre.");
      expect(written(m)).toMatchObject({ currency: "custom", currencySign: "kr", currencyPosition: "after", minorUnit: "øre" });
      expect(authorRow(m, 1000).querySelector("[data-name]")).toHaveTextContent("10 kr");
      // € 7,35 of the task can not be paid in whole kroner
      expect(m.instance.validate()).toEqual(["The amount of the task, 7.35 kr, can not be paid with the coins and notes the pupil can take."]);
    });

    await step("coins in øre added; a value in øre without a minor unit is not possible", async () => {
      for (const value of ["50 øre", "25 øre", "0,10"]) {
        await setInput(canvas.getByRole("textbox", { name: "Value" }) as HTMLInputElement, value);
        await userEvent.click(canvas.getByRole("button", { name: "+ Add" }));
      }
      expect(authorRows(m)).toEqual([10, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]);
      expect(authorRow(m, 50).querySelector("[data-name]")).toHaveTextContent("50 øre");
      expect(m.instance.validate()).toEqual([]);
      await retype(canvas.getByRole("textbox", { name: "Minor unit" }), "{Backspace}");
      expect(m.instance.validate()).toEqual(["Every coin and note needs a value of whole kr: this currency has no minor unit."]);
      expect(canvas.getAllByText("Not a possible value")).toHaveLength(3);
    });
  },
};

/** The authoring mode in Dutch. */
export const AuthoringDutch: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { currency: "gbp", task: "count", countPieces: "20; 0,25" } },
  play: async ({ canvasElement }) => {
    const m = await openAuthoring(canvasElement);
    const { canvas } = m;
    expect(canvas.getByRole("heading", { name: "Munten en biljetten" })).toBeInTheDocument();
    expect(radio(m, "Britse pond (£)")).toHaveAttribute("aria-checked", "true");
    expect(canvas.getByRole("checkbox", { name: "De leerling kan het pakken: biljet van £ 20" })).toBeChecked();
    expect(authorRow(m, 2000).querySelector("[data-name]")).toHaveTextContent("£ 20");
    expect(within(authorRow(m, 50)).getByRole("radio", { name: "Zilver" })).toHaveAttribute("aria-checked", "true");
    // 25p is no coin of the pound
    expect(m.instance.validate()).toEqual(["In het geld van de opdracht staat iets dat geen van de munten en biljetten is: 0,25."]);
    await userEvent.type(canvas.getByRole("textbox", { name: "Waarde" }), "25p");
    await userEvent.click(canvas.getByRole("button", { name: "+ Toevoegen" }));
    expect(m.instance.validate()).toEqual([]);
    expect(canvas.getByRole("button", { name: "De munt van 25 pence verwijderen" })).toBeInTheDocument();
  },
};
