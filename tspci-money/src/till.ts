// The cash register without a screen: what the till holds (the items rung up, what is being typed, the total, what
// the customer paid), what each key does to it, the receipt, and the register's response. Everything in hundredths
// (integers). Imports only money.ts: `npm test` runs it in node as it is.
import {
  type Counts, type Currency, type Deal, type RecordResponse, type ShopItem, type TaskModel, cashRound, fewestPieces, isFewest, lineValue,
  pieceCount, readRegister, registerRecord, totalOf,
} from "./money.ts";

/** An item rung up: by its code (`code`), or an amount typed with the Price key (`code` null). `price`: of one. */
export type Line = { code: string | null; price: number; quantity: number };

/** What the till says after a key, besides the amounts: a mistake, or what a correction undid. */
export type NoteKey =
  | "unknownCode"
  | "typeCode"
  | "notAnAmount"
  | "notAQuantity"
  | "noLines"
  | "totalFirst"
  | "typeTotal"
  | "typePaid"
  | "tooLittle"
  | "tooMany"
  | "nothingToVoid"
  | "voidLine"
  | "voidTotal"
  | "voidPaid";
/** `detail`: the code typed (unknownCode), the line taken off (voidLine), what is short in hundredths (tooLittle). */
export type Note = { key: NoteKey; detail?: string | number };

/**
 * The till:
 * - lines: the items rung up, in order
 * - entry: what is being typed on the keypad: digits and at most one "." ("12.5")
 * - times: a quantity given with the × key, for the next item
 * - total: after Total, the total on the till (calculated by the till, or keyed in by the pupil); null before
 * - paid: after Cash, what the pupil keyed in as paid by the customer; null before. The drawer is open.
 * - note: what the till says about the last key
 */
export type TillState = { lines: Line[]; entry: string; times: number | null; total: number | null; paid: number | null; note: Note | null };

export const emptyTill: TillState = { lines: [], entry: "", times: null, total: null, paid: null, note: null };

/** What the till needs to know: the shopping, whether it calculates, the cash rounding, the currency. */
export type TillContext = { items: ShopItem[]; tillCalculates: boolean; rounding: number; currency: Currency };

export const tillContext = (model: TaskModel): TillContext => ({
  items: model.register?.items ?? [],
  tillCalculates: model.register?.tillCalculates ?? true,
  rounding: model.register?.rounding ?? 1,
  currency: model.currency,
});

export type Key = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "sep" | "back" | "clear" | "times" | "code" | "price" | "void" | "total" | "cash";
export const DIGITS: Key[] = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** Where the sale is: ringing up, the total is on the till, or the customer has paid (the drawer is open). */
export const phaseOf = (till: TillState): "ringing" | "total" | "paid" => (till.paid !== null ? "paid" : till.total !== null ? "total" : "ringing");

/** The most lines a sale has, and the longest number on the keypad (before the decimal separator). */
const MAX_LINES = 60;
const MAX_DIGITS = 6;

/** The amount typed, in hundredths ("12.5" → 1250, "7" → 700), or null for nothing typed. */
export function entryAmount(entry: string): number | null {
  if (!/^\d*(\.\d{0,2})?$/.test(entry) || entry === "" || entry === ".") return null;
  const [whole, fraction = ""] = entry.split(".");
  return Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"));
}

/** The item with this code. */
export const itemByCode = (items: ShopItem[], code: string | null) => (code === null ? undefined : items.find((item) => item.code === code));

/** How many of the item with this code are rung up. */
export const rungUp = (till: TillState, code: string) => till.lines.reduce((sum, line) => sum + (line.code === code ? line.quantity : 0), 0);

/** How many items are rung up, all quantities together. */
export const itemsRungUp = (till: TillState) => till.lines.reduce((sum, line) => sum + line.quantity, 0);

/**
 * What the items rung up cost: per item all its lines together with its deal (two milk rung up one by one still get
 * "2 for 2,00"), and the amounts typed with the Price key as they are.
 */
export function linesValue(lines: Line[], items: ShopItem[]): number {
  return receiptRows(lines, items).reduce((sum, row) => sum + row.value, 0);
}

/** A row of the receipt: an item with all its lines together, or an amount typed. */
export type ReceiptRow = {
  code: string | null;
  name: string | null;
  quantity: number;
  price: number;
  /** quantity × price */
  amount: number;
  deal: Deal | null;
  /** what it costs with the deal */
  value: number;
};

/** The receipt's rows: the items in the order they were first rung up, an amount typed on a row of its own. */
export function receiptRows(lines: Line[], items: ShopItem[]): ReceiptRow[] {
  const rows: ReceiptRow[] = [];
  for (const line of lines) {
    const item = itemByCode(items, line.code);
    const row = item ? rows.find((r) => r.code === item.code) : undefined;
    if (row) row.quantity += line.quantity;
    else rows.push({ code: item?.code ?? null, name: item?.name ?? null, quantity: line.quantity, price: item?.price ?? line.price, amount: 0, deal: item?.deal ?? null, value: 0 });
  }
  for (const row of rows) {
    row.amount = row.quantity * row.price;
    row.value = lineValue(row.price, row.quantity, row.deal);
  }
  return rows;
}

/** The total the till calculates: what is rung up, rounded for cash. */
export const tillTotal = (till: TillState, ctx: TillContext) => cashRound(linesValue(till.lines, ctx.items), ctx.rounding);

/** An item (or an amount) rung up: the quantity from the × key, or one. Ringing up after Total opens the sale again. */
function addLine(till: TillState, line: Omit<Line, "quantity">): TillState {
  if (till.lines.length >= MAX_LINES) return { ...till, entry: "", times: null, note: { key: "tooMany" } };
  return { ...till, lines: [...till.lines, { ...line, quantity: till.times ?? 1 }], entry: "", times: null, total: null, paid: null, note: null };
}

/** A tap on an item on the counter: it is rung up. */
export function ring(till: TillState, code: string, ctx: TillContext): TillState {
  const item = itemByCode(ctx.items, code);
  return item ? addLine(till, { code: item.code, price: item.price }) : till;
}

/**
 * A key of the till:
 * - 0 to 9 and the decimal separator (sep) type a number; back takes the last one off; C (clear) clears it and ×
 * - × (times): the number typed is how many of the next item (1 to 99)
 * - Code: the number typed is an item's code: it is rung up
 * - Price: the amount typed is rung up as an item of its own
 * - Total: the till calculates the total (tillCalculates), or the amount typed is the total
 * - Cash: the amount typed is what the customer pays; the drawer opens. When the till calculates, not less than the total
 * - Correction (void): undoes the last step: the payment, the total, or the last item rung up
 */
export function pressKey(till: TillState, key: Key, ctx: TillContext): TillState {
  const t = { ...till, note: null };
  const typed = entryAmount(t.entry);
  const clean = { entry: "", times: null };
  switch (key) {
    case "sep": {
      if (t.entry.includes(".") || ctx.currency.minor === "") return t;
      return { ...t, entry: (t.entry || "0") + "." };
    }
    case "back":
      return { ...t, entry: t.entry.slice(0, -1) };
    case "clear":
      return { ...t, ...clean };
    case "times": {
      const n = /^\d+$/.test(t.entry) ? Number(t.entry) : NaN;
      if (!(n >= 1 && n <= 99)) return { ...t, ...clean, note: { key: "notAQuantity" } };
      return { ...t, entry: "", times: n };
    }
    case "code": {
      const item = /^\d+$/.test(t.entry) ? itemByCode(ctx.items, t.entry) : undefined;
      if (!t.entry) return { ...t, ...clean, note: { key: "typeCode" } };
      if (!item) return { ...t, ...clean, note: { key: "unknownCode", detail: t.entry } };
      return addLine(t, { code: item.code, price: item.price });
    }
    case "price":
      if (typed === null || typed === 0) return { ...t, ...clean, note: { key: "notAnAmount" } };
      return addLine(t, { code: null, price: typed });
    case "total": {
      if (t.lines.length === 0) return { ...t, ...clean, note: { key: "noLines" } };
      if (ctx.tillCalculates) return { ...t, ...clean, total: tillTotal(t, ctx), paid: null };
      if (typed === null) return { ...t, ...clean, note: { key: "typeTotal" } };
      return { ...t, ...clean, total: typed, paid: null };
    }
    case "cash": {
      if (t.total === null) return { ...t, ...clean, note: { key: "totalFirst" } };
      if (typed === null) return { ...t, ...clean, note: { key: "typePaid" } };
      if (ctx.tillCalculates && typed < t.total) return { ...t, ...clean, note: { key: "tooLittle", detail: t.total - typed } };
      return { ...t, ...clean, paid: typed };
    }
    case "void": {
      if (t.paid !== null) return { ...t, ...clean, paid: null, note: { key: "voidPaid" } };
      if (t.total !== null) return { ...t, ...clean, total: null, note: { key: "voidTotal" } };
      const last = t.lines[t.lines.length - 1];
      if (!last) return { ...t, ...clean, note: { key: "nothingToVoid" } };
      return { ...t, ...clean, lines: t.lines.slice(0, -1), note: { key: "voidLine", detail: itemByCode(ctx.items, last.code)?.name ?? "" } };
    }
    default: {
      // a digit
      if (!/^\d$/.test(key)) return t;
      const [whole, fraction] = t.entry.split(".");
      if (fraction !== undefined ? fraction.length >= 2 : whole.length >= MAX_DIGITS) return t;
      return { ...t, entry: (t.entry === "0" ? "" : t.entry) + key };
    }
  }
}

/** A till of a saved state (an older state has none). */
export function tillOf(value: unknown): TillState {
  const v = value as Partial<TillState> | undefined;
  if (!v || typeof v !== "object" || !Array.isArray(v.lines)) return emptyTill;
  return {
    lines: v.lines.filter((l) => l && Number.isInteger(l.quantity) && l.quantity > 0 && Number.isInteger(l.price)),
    entry: typeof v.entry === "string" ? v.entry : "",
    times: Number.isInteger(v.times) ? v.times! : null,
    total: Number.isInteger(v.total) ? v.total! : null,
    paid: Number.isInteger(v.paid) ? v.paid! : null,
    note: v.note && typeof v.note === "object" ? v.note : null,
  };
}

// ---- the response ----

/**
 * The register's response: undefined while nothing is done (nothing rung up, no total, no payment, no change); then
 * every field (money.ts registerRecord). `correct`: the items rung up are as many and cost as much as the shopping, the
 * total is what the customer has to pay, the payment keyed in is the customer's money, the change is right, and in the
 * fewest pieces when the settings ask for it (fewestChange).
 */
export function registerResponse(model: TaskModel, till: TillState, tray: Counts): RecordResponse | undefined {
  const register = model.register;
  if (!register) return undefined;
  if (till.lines.length === 0 && till.total === null && till.paid === null && pieceCount(tray) === 0) return undefined;
  const ctx = tillContext(model);
  const change = totalOf(tray);
  const fields = {
    itemsRungUp: itemsRungUp(till),
    itemsTotal: linesValue(till.lines, ctx.items),
    total: till.total ?? 0,
    totalCorrect: till.total !== null && model.price !== null && till.total === model.price,
    paid: till.paid ?? 0,
    change,
    changeCorrect: model.asked !== null && change === model.asked,
    // 0 pieces are the fewest for no change (the customer paid exactly)
    fewest: change === 0 ? pieceCount(tray) === 0 : isFewest(tray, model.supply),
  };
  const correct =
    fields.itemsRungUp === register.count &&
    fields.itemsTotal === register.value &&
    fields.totalCorrect &&
    till.paid !== null &&
    fields.paid === totalOf(model.given) &&
    fields.changeCorrect &&
    (!register.fewestChange || fields.fewest);
  return registerRecord({ ...fields, correct });
}

/**
 * The till and the counter for a response read back. The response says how many items and what they cost, not which:
 * when that is the shopping, the shopping is rung up; otherwise one amount for what they cost (and the rest of the
 * items at 0), so the response stays the same. The change: the fewest coins and notes for it from the supply.
 */
export function tillFor(value: unknown, model: TaskModel): { till: TillState; tray: Counts } | null {
  const fields = readRegister(value);
  const register = model.register;
  if (!fields || !register) return null;
  let lines: Line[] = [];
  if (fields.itemsRungUp === register.count && fields.itemsTotal === register.value) {
    lines = register.items.map((item) => ({ code: item.code, price: item.price, quantity: item.quantity }));
  } else if (fields.itemsRungUp > 0) {
    lines = [{ code: null, price: fields.itemsTotal, quantity: 1 }];
    if (fields.itemsRungUp > 1) lines.push({ code: null, price: 0, quantity: fields.itemsRungUp - 1 });
  }
  const paid = fields.paid > 0 ? fields.paid : null;
  const total = fields.total > 0 || paid !== null ? fields.total : null;
  const tray = fields.change > 0 ? (fewestPieces(fields.change, model.supply) ?? {}) : {};
  return { till: { ...emptyTill, lines, total, paid }, tray };
}
