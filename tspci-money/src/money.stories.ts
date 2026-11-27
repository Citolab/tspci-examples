import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import {
  afterPaint, focusedIn, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci,
  type PciArgs,
} from "../../.storybook/tspci";
import pci from "./index";
import { EUR, PRESET_CURRENCIES, defaultPieces, newPiece, serializeItems, serializePieces, type PieceDef } from "./money";
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

// ---- the cash register ----

/** A key of the till, an item on the counter, the display. */
const tillKey = (mounted: MountedPci, key: string) => $<HTMLButtonElement>(mounted, `[data-key="${key}"]`);
const shopItem = (mounted: MountedPci, code: string) => $<HTMLElement>(mounted, `[data-item="${code}"] .shop-item`);
const display = (mounted: MountedPci) => $(mounted, "[data-display]").textContent!.replace(/\s+/g, " ").trim();
const displayAmount = (mounted: MountedPci) => $(mounted, "[data-display-label]").textContent + " " + $(mounted, "[data-display-amount]").textContent;
const drawerState = (mounted: MountedPci) => $(mounted, "[data-drawer]").dataset.drawer;
const receipt = (mounted: MountedPci) => mounted.root.querySelector<HTMLElement>("[data-printed]");
/** Clicks keys of the till: "10.5" clicks 1, 0, the separator and 5; a word is a key ("times", "code", "total", "cash"). */
async function keys(mounted: MountedPci, ...names: string[]) {
  for (const name of names) {
    if (/^[\d.]+$/.test(name)) for (const c of name) await userEvent.click(tillKey(mounted, c === "." ? "sep" : c));
    else await userEvent.click(tillKey(mounted, name));
  }
}

/** The register to try yourself (no test runs on it): the default shopping, in euros. */
export const RegisterToTry: Story = {
  name: "Cash register, to try",
  args: { properties: { task: "register", title: "At the supermarket", question: "A customer is at your till." } },
};

/** The till calculates: ring up the shopping by a tap, × and a tap, and a code; Total; Cash; the change. */
export const Register: Story = {
  args: { properties: { task: "register", title: "At the supermarket", question: "A customer is at your till." } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;

    await step("the shopping, the customer's money and a closed drawer", async () => {
      expect(canvas.getByText(/^Ring up the shopping and press Total\./)).toBeInTheDocument();
      expect(canvas.getByRole("button", { name: "Ring up Milk" })).toHaveAccessibleDescription("€1.15 each, deal: 2 for €2.00, the customer buys 2, code 101, rung up: 0");
      expect(canvas.getByRole("button", { name: "Ring up Cheese" })).toHaveAccessibleDescription("€3.60 each, deal: 25% off, the customer buys 1, code 104, rung up: 0");
      expect(canvas.getByRole("listitem", { name: "note of €10" })).toBeInTheDocument();
      expect(drawerState(mounted)).toBe("closed");
      expect(supplyPiece(mounted, 100)).toBeDisabled();
      expect(canvas.getByRole("region", { name: "Till drawer" })).toHaveTextContent("The drawer opens when you have keyed in what the customer pays (Cash).");
      expect(receipt(mounted)).toBeNull();
      expect(mounted.pci.getResponse()).toBeUndefined();
    });

    await step("a tap rings up one; the second milk gets the deal", async () => {
      await userEvent.click(shopItem(mounted, "101"));
      expect(display(mounted)).toContain("Milk 1 × €1.15");
      expect(displayAmount(mounted)).toBe("Subtotal €1.15");
      await userEvent.click(shopItem(mounted, "101"));
      expect(displayAmount(mounted)).toBe("Subtotal €2.00");
      expect($(mounted, `[data-item="101"] [data-rung-up]`)).toHaveTextContent("rung up: 2");
      expect(fields(await lastChange(mounted))).toMatchObject({ itemsRungUp: 2, itemsTotal: 2 });
    });

    await step("3 × and a tap: three apples; a code: the bread; an unknown code", async () => {
      await keys(mounted, "3", "times");
      expect(displayAmount(mounted)).toBe("Typed 3 × ");
      await userEvent.click(shopItem(mounted, "103"));
      expect(display(mounted)).toContain("Apple 3 × €0.45");
      await keys(mounted, "102", "code");
      expect(displayAmount(mounted)).toBe("Subtotal €5.80");
      await keys(mounted, "999", "code");
      expect(display(mounted)).toContain("No item with code 999");
      await userEvent.click(shopItem(mounted, "104"));
      expect(displayAmount(mounted)).toBe("Subtotal €8.50");
      expect(fields(mounted.pci.getResponse())).toEqual({
        itemsRungUp: 7, itemsTotal: 8.5, total: 0, totalCorrect: false, paid: 0, change: 0, changeCorrect: false, fewest: true, correct: false,
      });
    });

    await step("Total, then what the customer pays: the drawer opens and the receipt prints", async () => {
      await keys(mounted, "10", "cash");
      expect(display(mounted)).toContain("Press Total first");
      await keys(mounted, "total");
      expect(displayAmount(mounted)).toBe("Total €8.50");
      await keys(mounted, "10", "cash");
      expect(displayAmount(mounted)).toBe("Change €1.50");
      expect(display(mounted)).toContain("Cash €10.00 · Drawer open");
      expect(drawerState(mounted)).toBe("open");
      expect(receipt(mounted)).toHaveTextContent("Milk€2.302 × €1.152 for €2.00deal: 2 for €2.00−€0.30");
      expect($(mounted, "[data-receipt-total]")).toHaveTextContent("Total€8.50");
      expect($(mounted, "[data-receipt-change]")).toHaveTextContent("Change€1.50");
    });

    await step("the change from the drawer", async () => {
      await pay(mounted, 100, 50);
      expect($(mounted, "[data-describe]")).toHaveTextContent("Change for the customer: 1 coin of €1, 1 coin of 50 cents.");
      expect(fields(mounted.pci.getResponse())).toEqual({
        itemsRungUp: 7, itemsTotal: 8.5, total: 8.5, totalCorrect: true, paid: 10, change: 1.5, changeCorrect: true, fewest: true, correct: true,
      });
      expect(mounted.pci.getResponse()).toEqual(pci.getCorrectResponse!({ task: "register" } as never));
    });

    await step("Correction undoes the payment: the drawer closes, the receipt is gone", async () => {
      await keys(mounted, "void");
      expect(drawerState(mounted)).toBe("closed");
      expect(receipt(mounted)).toBeNull();
      expect(display(mounted)).toContain("Payment undone");
      expect(fields(mounted.pci.getResponse())).toMatchObject({ paid: 0, change: 1.5, correct: false });
    });
  },
};

const britishShopping = serializeItems([
  { code: "11", name: "Tea", price: 185, quantity: 2, deal: null, look: "jar" },
  { code: "12", name: "Biscuits", price: 90, quantity: 3, deal: { kind: "multi", count: 3, price: 200 }, look: "bag" },
  { code: "13", name: "Jam", price: 240, quantity: 1, deal: { kind: "percent", percent: 50 }, look: "jar" },
]);
const pounds = { task: "register", currency: "gbp", items: britishShopping, given: "10", tillCalculates: "false", fewestChange: "true", title: "At the corner shop", question: "Serve the customer." };

/** Pounds, the pupil calculates: the till shows no total and no change, the change in the fewest coins. */
export const RegisterPounds: Story = {
  args: { properties: pounds },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.getByText(/Work out the total, type it and press Total\..*with as few coins and notes as possible\.$/)).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Ring up Biscuits" })).toHaveAccessibleDescription("90p each, deal: 3 for £2.00, the customer buys 3, code 12, rung up: 0");

    await step("rung up: the till shows each item, but no subtotal", async () => {
      await keys(mounted, "2", "times", "11", "code", "3", "times");
      await userEvent.click(shopItem(mounted, "12"));
      await userEvent.click(shopItem(mounted, "13"));
      expect(display(mounted)).toContain("Jam 1 × £2.40");
      expect(displayAmount(mounted).trim()).toBe("");
    });

    await step("the pupil's total and the customer's money", async () => {
      await keys(mounted, "total");
      expect(display(mounted)).toContain("Type the total first, then press Total");
      await keys(mounted, "6.90", "total");
      expect(displayAmount(mounted)).toBe("Total keyed in £6.90");
      await keys(mounted, "10", "cash");
      expect(displayAmount(mounted)).toBe("Cash £10.00");
      expect(display(mounted)).not.toContain("Change");
      // the receipt: no amounts of its own, only what was keyed in
      expect($(mounted, "[data-receipt-total]")).toHaveTextContent("Total keyed in£6.90");
      expect(mounted.root.querySelector("[data-receipt-change]")).toBeNull();
      expect(receipt(mounted)).toHaveTextContent("Biscuits3 × 90p3 for £2.00deal: 3 for £2.00");
    });

    await step("the change: right, then in the fewest coins", async () => {
      await pay(mounted, 100, 100, 100, 10);
      expect(fields(pci.getResponse())).toEqual({
        itemsRungUp: 6, itemsTotal: 6.9, total: 6.9, totalCorrect: true, paid: 10, change: 3.1, changeCorrect: true, fewest: false, correct: false,
      });
      await userEvent.click(minus(mounted, 100));
      await userEvent.click(minus(mounted, 100));
      await pay(mounted, 200);
      expect(fields(pci.getResponse())).toMatchObject({ change: 3.1, fewest: true, correct: true });
      expect(supplyPiece(mounted, 200).querySelector("svg")).toHaveTextContent("2POUNDS");
    });
  },
};

const dutchShopping = serializeItems([
  { code: "201", name: "Melk", price: 115, quantity: 2, deal: { kind: "multi", count: 2, price: 200 }, look: "carton" },
  { code: "202", name: "Brood", price: 249, quantity: 1, deal: null, look: "bread" },
  { code: "203", name: "Appel", price: 45, quantity: 3, deal: null, look: "fruit" },
  { code: "204", name: "Kaas", price: 360, quantity: 1, deal: { kind: "percent", percent: 25 }, look: "box" },
]);

/** Dutch, rounded to 5 cent for cash: € 8,54 is € 8,55. */
export const RegisterDutch: Story = {
  args: { properties: { task: "register", language: "nl", items: dutchShopping, cashRounding: "5", given: "20", title: "In de supermarkt", question: "Een klant staat bij jouw kassa." } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.getByText(/^Sla de boodschappen aan en druk op Totaal\./)).toBeInTheDocument();
    expect(canvas.getByRole("region", { name: "De boodschappen" })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Melk aanslaan" })).toHaveAccessibleDescription("€ 1,15 per stuk, actie: 2 voor € 2,00, de klant koopt er 2, code 201, aangeslagen: 0");
    expect(canvas.getByRole("button", { name: "Kaas aanslaan" })).toHaveAccessibleDescription(/actie: 25% korting/);
    expect(canvas.getByRole("button", { name: "Contant: waarmee de klant betaalt" })).toBeInTheDocument();
    expect(tillKey(mounted, "sep")).toHaveTextContent(",");
    expect(canvas.getByRole("region", { name: "Kassalade" })).toBeInTheDocument();
    for (const code of ["201", "201", "202", "204"]) await userEvent.click(shopItem(mounted, code));
    await keys(mounted, "3", "times", "203", "code");
    expect(displayAmount(mounted)).toBe("Subtotaal € 8,54");
    await keys(mounted, "total");
    expect(displayAmount(mounted)).toBe("Totaal € 8,55");
    expect(display(mounted)).toContain("voor afronding € 8,54");
    await keys(mounted, "20", "cash");
    expect(displayAmount(mounted)).toBe("Wisselgeld € 11,45");
    expect(canvas.getByRole("region", { name: "Kassabon" })).toHaveTextContent("De bon is geprint.");
    expect($(mounted, "[data-receipt-total]")).toHaveTextContent("Totaal€ 8,55");
    expect(receipt(mounted)).toHaveTextContent("Subtotaal€ 8,54");
    await pay(mounted, 1000, 100, 20, 20, 5);
    expect($(mounted, "[data-describe]")).toHaveTextContent("Wisselgeld voor de klant: 1 biljet van € 10, 1 munt van € 1, 2 munten van 20 cent, 1 munt van 5 cent.");
    expect(fields(pci.getResponse())).toEqual({
      itemsRungUp: 7, itemsTotal: 8.54, total: 8.55, totalCorrect: true, paid: 20, change: 11.45, changeCorrect: true, fewest: true, correct: true,
    });
  },
};

/** Keyboard: the items and the keys are buttons; the keyboard types on the till; Cash takes the focus to the drawer. */
export const RegisterKeyboard: Story = {
  args: { properties: { task: "register" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    const keypad = $(mounted, "[data-keypad]");
    for (const button of keypad.querySelectorAll("button")) {
      expect(button.tabIndex).toBe(0);
      expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
    expect(canvas.getByRole("group", { name: "Keys of the till" })).toBe(keypad);
    // the display is read out: a live region
    expect($(mounted, "[data-display]")).toHaveAttribute("aria-live", "polite");
    expect(canvas.getByRole("status", { name: "Display of the till" })).toBeInTheDocument();
    // Enter or Space on an item rings it up (userEvent.keyboard does not reach into the shadow root: click() is what they do)
    shopItem(mounted, "102").focus();
    shopItem(mounted, "102").click();
    await waitFor(() => expect(fields(pci.getResponse())).toMatchObject({ itemsRungUp: 1 }));
    // typing on the keyboard with the focus on a key: digits, the separator, Backspace, Escape and *
    tillKey(mounted, "5").focus();
    for (const key of ["2", "x", "Escape", "2", "*"]) await press(tillKey(mounted, "5"), key);
    expect(displayAmount(mounted)).toBe("Typed 2 × ");
    await press(tillKey(mounted, "5"), "1");
    await press(tillKey(mounted, "5"), "0");
    await press(tillKey(mounted, "5"), "9");
    await press(tillKey(mounted, "5"), "Backspace");
    await press(tillKey(mounted, "5"), "1");
    tillKey(mounted, "code").click();
    await waitFor(() => expect($(mounted, `[data-item="101"] [data-rung-up]`)).toHaveTextContent("rung up: 2"));
    for (const code of ["103", "103", "103", "104"]) shopItem(mounted, code).click();
    tillKey(mounted, "total").click();
    await waitFor(() => expect(displayAmount(mounted)).toBe("Total €8.50"));
    for (const key of ["1", "0", ".", "0", "0"]) await press(tillKey(mounted, "total"), key);
    expect(displayAmount(mounted)).toBe("Typed 10.00");
    // Cash by the keyboard (a click without a pointer): the focus goes to the drawer, where the change comes from
    tillKey(mounted, "cash").focus();
    tillKey(mounted, "cash").click();
    await waitFor(() => expect(focusedIn(mounted.root)).toBe(supplyPiece(mounted, 5000)));
    supplyPiece(mounted, 100).click();
    supplyPiece(mounted, 50).click();
    await waitFor(() => expect(fields(pci.getResponse())).toMatchObject({ change: 1.5, correct: true }));
  },
};

/** A tap of a finger on an item, a key and a coin; a coin dragged onto the counter. */
export const RegisterTouch: Story = {
  args: { properties: { task: "register" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const tap = async (el: Element) => {
      fireEvent.pointerDown(el, { pointerType: "touch", isPrimary: true });
      fireEvent.pointerUp(el, { pointerType: "touch", isPrimary: true });
      fireEvent.click(el);
      await afterPaint();
    };
    // no touch-action: none on the items and keys, so a finger can still scroll the page from them
    expect(getComputedStyle(shopItem(mounted, "101")).touchAction).not.toBe("none");
    expect(getComputedStyle(tillKey(mounted, "1")).touchAction).not.toBe("none");
    await tap(shopItem(mounted, "101"));
    await tap(shopItem(mounted, "101"));
    for (const key of ["3", "times"]) await tap(tillKey(mounted, key));
    await tap(shopItem(mounted, "103"));
    for (const code of ["102", "104"]) await tap(shopItem(mounted, code));
    for (const key of ["total", "1", "0", "cash"]) await tap(tillKey(mounted, key));
    expect(drawerState(mounted)).toBe("open");
    await tap(supplyPiece(mounted, 100));
    await dragTo(mounted, supplyPiece(mounted, 50), middleOf(counter(mounted)));
    await waitFor(() => expect(fields(mounted.pci.getResponse())).toMatchObject({ change: 1.5, correct: true }));
  },
};

/** The drawer is closed before Cash: a tap or a drag of a coin does nothing. */
export const RegisterDrawerClosed: Story = {
  args: { properties: { task: "register" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    await dragTo(mounted, supplyPiece(mounted, 200), middleOf(counter(mounted)));
    expect(onCounter(mounted)).toEqual([]);
    expect(mounted.pci.getResponse()).toBeUndefined();
  },
};

export const RegisterRestoreState: Story = {
  args: { properties: pounds },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.click(shopItem(first, "11"));
    await keys(first, "3", "times");
    const state = first.pci.getState();
    const second = await remountPci(canvasElement, pci, { properties: pounds, state });
    expect($(second, `[data-item="11"] [data-rung-up]`)).toHaveTextContent("rung up: 1");
    expect(displayAmount(second)).toBe("Typed 3 × ");
    expect(fields(second.pci.getResponse())).toMatchObject({ itemsRungUp: 1, itemsTotal: 1.85 });
    // a state of the register's first version, without a till: the till is empty
    const third = await remountPci(canvasElement, pci, { properties: pounds, state: JSON.stringify({ state: { tray: { 100: 1 }, answer: "" }, log: [] }) });
    expect(fields(third.pci.getResponse())).toMatchObject({ itemsRungUp: 0, change: 1 });
  },
};

/** Status "solution" without a correct response in the item: the sale from the settings, read-only. */
export const RegisterSolution: Story = {
  args: { status: "solution", properties: { task: "register" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(onCounter(mounted)).toEqual([100, 50]);
    expect($(mounted, `[data-item="103"] [data-rung-up]`)).toHaveTextContent("rung up: 3");
    expect(displayAmount(mounted)).toBe("Change €1.50");
    expect(receipt(mounted)).not.toBeNull();
    expect(mounted.root.querySelectorAll("button")).toHaveLength(0);
    expect(mounted.root.querySelector(".drawer")).toBeNull();
    expect(fields(mounted.pci.getResponse())).toMatchObject({ correct: true });
  },
};

/** A response handed back that is not the shopping: the till shows its numbers. */
export const RegisterBoundResponse: Story = {
  args: {
    properties: { task: "register" },
    boundTo: { RESPONSE: { record: [{ name: "itemsRungUp", base: { integer: 2 } }, { name: "itemsTotal", base: { float: 3.45 } }, { name: "total", base: { float: 3.45 } }, { name: "paid", base: { float: 0 } }, { name: "change", base: { float: 0 } }] } },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(fields(mounted.pci.getResponse())).toMatchObject({ itemsRungUp: 2, itemsTotal: 3.45, total: 3.45, paid: 0 });
    expect(displayAmount(mounted)).toBe("Total €3.45");
  },
};

/** The author sees what is wrong: the customer pays too little, a change that needs a 1 cent coin. */
export const RegisterProblems: Story = {
  args: { properties: { task: "register", given: "5" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.canvas.getByRole("alert")).toHaveTextContent("The customer pays with less than the price.");
    expect(pci.getCorrectResponse!({ task: "register", given: "5" } as never)).toBeUndefined();
    expect(pci.getCorrectResponse!({ task: "register", items: dutchShopping } as never)).toBeUndefined(); // 1,46 change: no 1 cent
    expect(fields(pci.getCorrectResponse!({ task: "register", items: dutchShopping, cashRounding: "5" } as never))).toMatchObject({ total: 8.55, change: 1.45 });
  },
};

/** The authoring mode for the register: the shopping, its deals and pictures, what it comes to. */
export const AuthoringRegister: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { task: "register", given: "10" } },
  play: async ({ canvasElement, step }) => {
    const m = await openAuthoring(canvasElement);
    const { canvas } = m;
    const items = () => JSON.parse(written(m).items) as Record<string, unknown>[];

    await step("the default shopping, and what it comes to", async () => {
      expect(canvas.getByRole("heading", { name: "The shopping" })).toBeInTheDocument();
      expect(canvas.getByRole("textbox", { name: "Name: Milk" })).toHaveValue("Milk");
      expect(canvas.getByRole("textbox", { name: "Price: Milk" })).toHaveValue("1.15");
      expect(within(canvas.getByRole("radiogroup", { name: "Deal: Milk" })).getByRole("radio", { name: "Several for a price" })).toHaveAttribute("aria-checked", "true");
      expect(canvas.getByRole("textbox", { name: "Price together: Milk" })).toHaveValue("2.00");
      expect(m.root.querySelector("[data-comes-to]")).toHaveTextContent("7 items, together €8.50. The customer pays with €10.00: the change is €1.50.");
      expect(m.instance.validate()).toEqual([]);
      expect(items()).toHaveLength(4);
    });

    await step("a price and a deal changed, a picture chosen with the arrow keys", async () => {
      await retype(canvas.getByRole("textbox", { name: "Price: Bread" }), "2,49");
      expect(items()[1]).toMatchObject({ name: "Bread", price: 249 });
      expect(m.instance.validate()).toEqual(["The change, €1.46, can not be given with the coins and notes the pupil can take."]);
      await retype(canvas.getByRole("textbox", { name: "Price: Bread" }), "2.45");
      await userEvent.click(within(canvas.getByRole("radiogroup", { name: "Deal: Bread" })).getByRole("radio", { name: "Discount" }));
      await retype(canvas.getByRole("textbox", { name: "Discount in %: Bread" }), "20");
      expect(items()[1]).toMatchObject({ deal: { kind: "percent", percent: 20 } });
      const pictures = canvas.getByRole("radiogroup", { name: "Picture: Bread" });
      await press(within(pictures).getByRole("radio", { name: "Bread" }), "ArrowRight");
      expect(items()[1]).toMatchObject({ look: "fruit" });
      expect(focusedIn(m.root)).toBe(within(pictures).getByRole("radio", { name: "Fruit" }));
    });

    await step("an item added: the focus goes to its name; what is missing keeps Done from finishing", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "+ Add an item" }));
      const name = canvas.getByRole("textbox", { name: "Name: item 5" });
      await waitFor(() => expect(focusedIn(m.root)).toBe(name));
      expect(canvas.getByRole("textbox", { name: "Code: item 5" })).toHaveValue("105");
      // the bread at −20% makes €8.01: a change of €1.99 needs 1 and 2 cent coins
      expect(m.instance.validate()).toEqual([
        "Item 5: it needs a name.",
        "Item 5: its price is not an amount of this currency.",
        "The change, €1.99, can not be given with the coins and notes the pupil can take.",
      ]);
      await userEvent.type(name, "Juice");
      await userEvent.type(canvas.getByRole("textbox", { name: "Price: Juice" }), "0,54");
      expect(m.instance.validate()).toEqual([]);
      expect(items()[4]).toEqual({ code: "105", name: "Juice", price: 54, quantity: 1, deal: null, look: "box" });
    });

    await step("removed: the focus goes to the next item", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Remove Apple" }));
      expect(items().map((i) => i.name)).toEqual(["Milk", "Bread", "Cheese", "Juice"]);
      await waitFor(() => expect(focusedIn(m.root)).toBe(canvas.getByRole("button", { name: "Remove Cheese" })));
    });
  },
};

/** The authoring mode for the register in Dutch, with dollars: the shopping in the item's language. */
export const AuthoringRegisterDutch: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { task: "register", currency: "usd", language: "nl", given: "10", cashRounding: "5" } },
  play: async ({ canvasElement }) => {
    const m = await openAuthoring(canvasElement);
    const { canvas } = m;
    expect(canvas.getByRole("heading", { name: "De boodschappen" })).toBeInTheDocument();
    expect(canvas.getByRole("textbox", { name: "Naam: Melk" })).toBeInTheDocument();
    expect(canvas.getByRole("textbox", { name: "Prijs: Kaas" })).toHaveValue("3,60");
    expect(m.root.querySelector("[data-comes-to]")).toHaveTextContent("7 artikelen, samen $ 8,50. De klant betaalt met $ 10,00: het wisselgeld is $ 1,50.");
    await retype(canvas.getByRole("textbox", { name: "Aantal: Brood" }), "0");
    expect(m.instance.validate()).toEqual(["Brood: het aantal moet 1 tot 99 zijn."]);
    await userEvent.click(canvas.getByRole("button", { name: "Brood verwijderen" }));
    for (const name of ["Melk", "Appel", "Kaas"]) await userEvent.click(canvas.getByRole("button", { name: `${name} verwijderen` }));
    expect(m.instance.validate()).toEqual(["Voeg de boodschappen toe: de artikelen die de klant koopt."]);
    await waitFor(() => expect(focusedIn(m.root)).toBe(canvas.getByRole("button", { name: "+ Een artikel toevoegen" })));
  },
};

/** The shopping section is only there for the register. */
export const AuthoringNotRegister: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { task: "pay", items: "[1]" } },
  play: async ({ canvasElement }) => {
    const m = await openAuthoring(canvasElement);
    expect(m.root.querySelector("[data-shopping-editor]")).toBeNull();
    expect(written(m).items).toBe("[1]");
  },
};
