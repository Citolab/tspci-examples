// The documents, their fields, the mistakes and the response: no imports, so node runs it in the tests (npm test).
//
// A document is one of the templates (a payslip, a till receipt, a packing slip next to a delivery, a staff rota, a bus
// timetable, an energy bill, a dosage table) filled with values. Every value the document shows is a field: something
// the pupil can tap. A field is an input (a value the author gives: the hours, the hourly wage, the price of the milk)
// or computed from the fields before it (the wage = hours × hourly wage, the total, the change). The author can make a
// computed field wrong on purpose: it then shows another value, and that field is a mistake. Fields after it are
// computed from what the document shows, so one wrong number carries on as it would on a real document, and every
// mistake can be found by checking a field against the fields it comes from.
//
// Values are kept language neutral ("14.25", "08:15", "09:00-13:00"); the document shows them by the language
// ("€ 14,25" or "€14.25").

export type Language = "en" | "nl";
export const languageOf = (language?: string): Language => ((language ?? "").slice(0, 2).toLowerCase() === "nl" ? "nl" : "en");

export type TemplateId = "payslip" | "receipt" | "packingSlip" | "rota" | "timetable" | "energyBill" | "dosage";
export const TEMPLATES: TemplateId[] = ["payslip", "receipt", "packingSlip", "rota", "timetable", "energyBill", "dosage"];
export const templateOf = (value?: string): TemplateId => (TEMPLATES.includes(value as TemplateId) ? (value as TemplateId) : "payslip");

export type Task = "find" | "check" | "answer";
export const TASKS: Task[] = ["find", "check", "answer"];
export const taskOf = (value?: string): Task => (TASKS.includes(value as Task) ? (value as Task) : "find");

/** At most this many mistakes: the response declares mistake1 … mistake8. */
export const MAX_MISTAKES = 8;

/**
 * money: an amount ("14.25"); number: a count or a quantity ("64", "0.5"); percent: "8"; time: "08:15"; shift: a time
 * from and to ("09:00-13:00", or "" for a day off); text: as it is.
 */
export type Kind = "money" | "number" | "percent" | "time" | "shift" | "text";

export type Values = Record<string, string>;

export type Field = {
  /** unique in the document: what the response reports (`field`, `source`) */
  id: string;
  kind: Kind;
  /** what it is in the document, for a screen reader and the author: "Net wage", "Noor, Friday" */
  label: string;
  /** the value it should have: an input as given, a computed field from the fields it comes from (canonical) */
  natural: string;
  /** what the document shows (canonical): the natural value, or the author's wrong one */
  shown: string;
  computed: boolean;
  /** shows another value than it should: a mistake */
  wrong: boolean;
  /** a money amount that is taken off: shown with a minus */
  minus?: boolean;
  /** after a number: "kWh", "mg" */
  unit?: string;
  /** decimals of a computed number (2 by default) */
  decimals?: number;
  /** the part of the document it is in, for the authoring form ("Earnings") */
  group: string;
  /** the line of a list it is on (receipt items, packing slip lines), from 1; 0 for none */
  row: number;
};

/** A value the author gives, for the authoring form. */
export type InputDef = { key: string; label: string; kind: Kind; group: string; row: number; unit?: string };

export type Cell = { field: string } | { text: string } | null;
export type Row = { cells: Cell[]; total?: boolean };
export type Block =
  | { type: "letterhead"; logo: Logo; name: Cell; lines: Cell[] }
  | { type: "title"; text: string; badge?: Cell; cells?: Cell[] }
  | { type: "pairs"; caption: string; rows: { label: string; cell: Cell }[] }
  /** a table: the first cell of a row is its header (th scope="row"); `end` aligns a column right (amounts) */
  | { type: "table"; caption: string; head: Cell[]; rows: Row[]; end?: boolean[] }
  | { type: "big"; label: string; cell: Cell }
  | { type: "note"; cells: Cell[] };
export type Logo = "leaf" | "basket" | "tools" | "cup" | "bolt" | "cross";
export type Panel = { kind: "paper" | "box"; title?: string; blocks: Block[] };

export type Doc = {
  template: TemplateId;
  language: Language;
  /** the document's name: "Payslip" */
  name: string;
  panels: Panel[];
  /** the fields in the order of the document (reading order) */
  fields: Field[];
  byId: Record<string, Field>;
  inputs: InputDef[];
  /** the parts of the document, in order (the groups of the inputs and fields) */
  groups: string[];
  /** the rows of a list the author can add and remove (receipt items, packing slip lines) */
  rows?: { key: string; prefix: string; count: number; min: number; max: number; blank: Values };
};

// ---------------------------------------------------------------------------------------------------------------------
// Numbers, times and their texts

const round = (n: number, decimals = 2) => {
  const f = 10 ** decimals;
  return Math.round((n + Math.sign(n) * Number.EPSILON) * f) / f;
};

/**
 * A number as an author or a pupil types it: "14,25" and "1.234,50" (Dutch), "14.25" and "1,234.50" (English), with or
 * without € and a unit ("17,5 uur", "29 min", "€ 4,76", "7,-"). A separator followed by exactly three digits that is
 * not the language's decimal sign is a thousands separator; otherwise either sign is a decimal sign. Null for anything
 * else.
 */
export function parseNumber(raw: string | undefined | null, language: Language = "en"): number | null {
  const trimmed = String(raw ?? "").trim();
  // a space between digits only as a thousands separator: "23 512"
  if (/\d[\s\u00a0]+\d/.test(trimmed) && !/^\D*\d{1,3}(?:[\s\u00a0]\d{3})+(?!\d)/.test(trimmed)) return null;
  let s = trimmed.replace(/[\s\u00a0]/g, "").replace(/−/g, "-");
  s = s.replace(/^-?(€|eur|euro)/i, (m) => (m.startsWith("-") ? "-" : "")).replace(/^(€|eur)/i, "");
  s = s.replace(/[,.]-$/, "").replace(/(€|[a-z]+)\.?$/i, "");
  if (!s || !/^-?[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const decimal = language === "nl" ? "," : ".";
  const other = decimal === "," ? "." : ",";
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    const last = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
    const dec = s[last];
    const groups = s.slice(0, last).split(dec === "," ? "." : ",");
    if (groups.slice(1).some((g) => g.length !== 3)) return null;
    const intPart = groups.join("");
    if (intPart.includes(dec) || !/^-?\d+$/.test(intPart)) return null;
    s = `${intPart}.${s.slice(last + 1)}`;
  } else if (hasComma || hasDot) {
    const sep = hasComma ? "," : ".";
    const parts = s.split(sep);
    if (sep === other && parts.length > 1 && parts.slice(1).every((p) => p.length === 3) && /\d/.test(parts[0])) s = parts.join("");
    else if (parts.length === 2) s = `${parts[0] || "0"}.${parts[1]}`;
    else return null;
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** A time of day as minutes since midnight: "8:15", "08.15", "8u15", "8" (whole hours). Null for anything else. */
export function parseTime(raw: string | undefined | null): number | null {
  const s = String(raw ?? "").trim().toLowerCase();
  const m = /^(\d{1,2})(?:\s*[:.hu]\s*(\d{2}))?$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

const OFF = ["", "-", "–", "—", "off", "free", "vrij", "x"];
/** A shift: "09:00-13:00", "9 - 13", "9:00 tot 13:30"; a day off: "", "-", "off", "vrij". Undefined when it cannot be read. */
export function parseShift(raw: string | undefined | null): { start: number; end: number } | null | undefined {
  const s = String(raw ?? "").trim().toLowerCase();
  if (OFF.includes(s)) return null;
  const parts = s.split(/\s*(?:-|–|—|\bto\b|\btot\b)\s*/).filter((p) => p !== "");
  if (parts.length !== 2) return undefined;
  const start = parseTime(parts[0]);
  const end = parseTime(parts[1]);
  return start !== null && end !== null && end > start ? { start, end } : undefined;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const timeText = (minutes: number) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};

/** A value in its language-neutral form ("14.25", "08:15", "09:00-13:00"), or null when it cannot be read. */
export function canonical(kind: Kind, raw: string | undefined | null, language: Language = "en", decimals = 2): string | null {
  const text = String(raw ?? "").trim();
  switch (kind) {
    case "text":
      return text;
    case "time": {
      const t = parseTime(text);
      return t === null ? null : timeText(t);
    }
    case "shift": {
      const shift = parseShift(text);
      return shift === undefined ? null : shift === null ? "" : `${timeText(shift.start)}-${timeText(shift.end)}`;
    }
    default: {
      // canonical text first (a "." is always the decimal sign), then as typed in the language
      const n = /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : parseNumber(text, language);
      if (n === null) return null;
      return kind === "money" ? round(n, 2).toFixed(2) : String(round(n, kind === "percent" ? 2 : decimals));
    }
  }
}

/** The number of a value: an amount, a count, a time in minutes, the hours of a shift (0 for a day off); NaN for text. */
export function numberOf(kind: Kind, value: string): number {
  if (kind === "text") return NaN;
  if (kind === "time") return parseTime(value) ?? NaN;
  if (kind === "shift") {
    const shift = parseShift(value);
    return shift === undefined ? NaN : shift === null ? 0 : (shift.end - shift.start) / 60;
  }
  return value.trim() === "" ? NaN : Number(value);
}

const group = (digits: string, sep: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);

/** A number in the language: 2390 → "2390", 23512 → "23.512" (nl) or "23,512" (en), 17.5 → "17,5" or "17.5". */
export function numberText(n: number, language: Language, fixed?: number, groupFrom = 10000): string {
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n);
  const [whole, fraction] = (fixed === undefined ? String(round(abs, 3)) : abs.toFixed(fixed)).split(".");
  const int = abs >= groupFrom ? group(whole, language === "nl" ? "." : ",") : whole;
  return `${n < 0 ? "−" : ""}${int}${fraction ? (language === "nl" ? "," : ".") + fraction : ""}`;
}

/** An amount: "€ 1.360,28" (nl) or "€1,360.28" (en); a sign that ends in a letter gets a space ("CHF 12.50"). */
export function moneyText(n: number, language: Language, sign = "€"): string {
  if (!Number.isFinite(n)) return "";
  const space = language === "nl" || /\p{L}$/u.test(sign) ? " " : "";
  return `${n < 0 ? "−" : ""}${sign}${space}${numberText(Math.abs(n), language, 2, 1000)}`;
}

/** What the document shows for a field, in the language: "€ 912,00", "− € 61,20", "2.390 kWh", "8%", "09:00–13:00". */
export function showValue(field: Pick<Field, "kind" | "minus" | "unit">, value: string, language: Language, sign = "€"): string {
  const n = numberOf(field.kind, value);
  switch (field.kind) {
    case "text":
      return value;
    case "money":
      return Number.isFinite(n) ? `${field.minus && n !== 0 ? "− " : ""}${moneyText(n, language, sign)}` : value;
    case "percent":
      return Number.isFinite(n) ? `${numberText(n, language)}%` : value;
    case "time":
      return value;
    case "shift":
      return value === "" ? (language === "nl" ? "vrij" : "off") : value.replace("-", "–");
    default:
      return Number.isFinite(n) ? `${numberText(n, language)}${field.unit ? ` ${field.unit}` : ""}` : value;
  }
}

/** A value as the author types it in the form: "14,25" in Dutch, "14.25" in English, without a sign or grouping. */
export function inputText(kind: Kind, value: string, language: Language): string {
  if (kind === "money" || kind === "number" || kind === "percent") return language === "nl" ? value.replace(".", ",") : value;
  return value;
}

// ---------------------------------------------------------------------------------------------------------------------
// Building a document

type Tr = (en: string, nl: string) => string;

class Builder {
  fields: Field[] = [];
  byId: Record<string, Field> = {};
  inputs: InputDef[] = [];
  group = "";
  row = 0;
  /** the parts of the document in the order they come, for the authoring form */
  groups: string[] = [];
  private seen() {
    if (!this.groups.includes(this.group)) this.groups.push(this.group);
  }
  private values: Values;
  private preset: Values;
  private mistakes: Record<string, string>;
  readonly language: Language;
  constructor(values: Values, preset: Values, mistakes: Record<string, string>, language: Language) {
    this.values = values;
    this.preset = preset;
    this.mistakes = mistakes;
    this.language = language;
  }

  /** An input value (canonical), registered for the authoring form; an unreadable one falls back to the example's. */
  read(key: string, label: string, kind: Kind, unit?: string): string {
    this.seen();
    if (!this.inputs.some((input) => input.key === key)) this.inputs.push({ key, label, kind, group: this.group, row: this.row, unit });
    const own = this.values[key] === undefined ? null : canonical(kind, this.values[key], this.language);
    return own ?? canonical(kind, this.preset[key], this.language) ?? "";
  }

  /** A field the author gives. */
  input(key: string, label: string, kind: Kind, options: { minus?: boolean; unit?: string } = {}): Cell {
    const value = this.read(key, label, kind, options.unit);
    return this.add({ id: key, kind, label, natural: value, shown: value, computed: false, wrong: false, group: this.group, row: this.row, ...options });
  }

  /** A field computed from the fields before it, as they are shown; the author may make it wrong on purpose. */
  calc(id: string, label: string, kind: Kind, value: number | string, options: { minus?: boolean; unit?: string; decimals?: number } = {}): Cell {
    const natural = typeof value === "string" ? value : Number.isFinite(value) ? (canonical(kind, kind === "time" ? timeText(value) : String(value), "en", options.decimals ?? 2) ?? "") : "";
    const given = this.mistakes[id];
    const shown = given === undefined ? natural : (canonical(kind, given, this.language, options.decimals ?? 2) ?? natural);
    return this.add({ id, kind, label, natural, shown, computed: true, wrong: shown !== natural, group: this.group, row: this.row, ...options });
  }

  private add(field: Field): Cell {
    this.seen();
    this.fields.push(field);
    this.byId[field.id] = field;
    return { field: field.id };
  }

  /** The number a field shows (an amount, a count, minutes, hours of a shift). */
  num(id: string): number {
    const field = this.byId[id];
    return field ? numberOf(field.kind, field.shown) : NaN;
  }
  text(id: string): string {
    return this.byId[id]?.shown ?? "";
  }
}

const text = (value: string): Cell => ({ text: value });
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

type Example = {
  values: Values;
  find: { target: string; question: { en: string; nl: string } };
  answer: { source: string; answer: string; unit?: { en: string; nl: string }; question: { en: string; nl: string } };
  check: Record<string, string>;
};

type Template = {
  name: { en: string; nl: string };
  /** "this payslip", "deze loonstrook", for the question of the check task */
  thisDoc: { en: string; nl: string };
  /** rows the author can add and remove */
  rows?: { key: string; min: number; max: number; prefix: string; blank: Values };
  example: (language: Language) => Example;
  build: (b: Builder, t: Tr, rows: number) => Panel[];
};

const by = (language: Language): Tr => (en, nl) => (language === "nl" ? nl : en);

const TEMPLATE_DEFS: Record<TemplateId, Template> = {
  // ---- a payslip (loonstrook): hours × hourly wage, holiday allowance, gross, deductions, net
  payslip: {
    name: { en: "Payslip", nl: "Loonstrook" },
    thisDoc: { en: "this payslip", nl: "deze loonstrook" },
    example: (language) => {
      const t = by(language);
      return {
        values: {
          employer: "Tuincentrum De Groene Hoek",
          address: t("12 Kweekweg, Ommerdam", "Kweekweg 12, Ommerdam"),
          employee: "Sam Bakker",
          staffNo: "1042",
          job: t("Shop assistant", "Verkoopmedewerker"),
          period: t("November 2026", "november 2026"),
          payDate: t("25/11/2026", "25-11-2026"),
          hours: "64",
          rate: "14.25",
          holidayPct: "8",
          tax: "61.20",
          pension: "23.15",
        },
        find: { target: "net", question: { en: "Tap your net wage: the money you get in your bank account.", nl: "Tik op je nettoloon: het geld dat je op je rekening krijgt." } },
        answer: { source: "rate", answer: "14.25", question: { en: "How much do you earn per hour?", nl: "Hoeveel verdien je per uur?" } },
        check: { wage: "921.00", deductions: "74.35" },
      };
    },
    build: (b, t) => {
      b.group = t("Employer", "Werkgever");
      const letterhead: Block = { type: "letterhead", logo: "leaf", name: b.input("employer", t("Employer", "Werkgever"), "text"), lines: [b.input("address", t("Address of the employer", "Adres van de werkgever"), "text")] };
      b.group = t("Employee", "Werknemer");
      const pairs: Block = {
        type: "pairs",
        caption: t("Employee", "Werknemer"),
        rows: [
          { label: t("Name", "Naam"), cell: b.input("employee", t("Name", "Naam"), "text") },
          { label: t("Staff number", "Personeelsnummer"), cell: b.input("staffNo", t("Staff number", "Personeelsnummer"), "text") },
          { label: t("Job", "Functie"), cell: b.input("job", t("Job", "Functie"), "text") },
          { label: t("Period", "Periode"), cell: b.input("period", t("Period", "Periode"), "text") },
          { label: t("Pay date", "Betaaldatum"), cell: b.input("payDate", t("Pay date", "Betaaldatum"), "text") },
        ],
      };
      b.group = t("Earnings", "Inkomsten");
      const hours = b.input("hours", t("Hours worked", "Gewerkte uren"), "number");
      const rate = b.input("rate", t("Hourly wage", "Uurloon"), "money");
      const wage = b.calc("wage", t("Wage for the hours worked", "Loon voor de gewerkte uren"), "money", b.num("hours") * b.num("rate"));
      const pct = b.input("holidayPct", t("Holiday allowance, percentage", "Vakantiegeld, percentage"), "percent");
      const holiday = b.calc("holiday", t("Holiday allowance", "Vakantiegeld"), "money", (b.num("wage") * b.num("holidayPct")) / 100);
      const gross = b.calc("gross", t("Total gross", "Totaal bruto"), "money", b.num("wage") + b.num("holiday"));
      b.group = t("Deductions", "Inhoudingen");
      const tax = b.input("tax", t("Wage tax", "Loonheffing"), "money", { minus: true });
      const pension = b.input("pension", t("Pension", "Pensioen"), "money", { minus: true });
      const deductions = b.calc("deductions", t("Total deductions", "Totaal inhoudingen"), "money", b.num("tax") + b.num("pension"), { minus: true });
      const net = b.calc("net", t("Net wage", "Nettoloon"), "money", b.num("gross") - b.num("deductions"));
      return [
        {
          kind: "paper",
          blocks: [
            letterhead,
            { type: "title", text: t("Payslip", "Loonstrook") },
            pairs,
            {
              type: "table",
              caption: t("Earnings", "Inkomsten"),
              head: [text(t("Description", "Omschrijving")), text(t("Number", "Aantal")), text(t("Rate", "Tarief")), text(t("Amount", "Bedrag"))],
              end: [false, true, true, true],
              rows: [
                { cells: [text(t("Hours worked", "Gewerkte uren")), hours, rate, wage] },
                { cells: [text(t("Holiday allowance", "Vakantiegeld")), null, pct, holiday] },
                { cells: [text(t("Total gross", "Totaal bruto")), null, null, gross], total: true },
              ],
            },
            {
              type: "table",
              caption: t("Deductions", "Inhoudingen"),
              head: [text(t("Description", "Omschrijving")), text(t("Amount", "Bedrag"))],
              end: [false, true],
              rows: [
                { cells: [text(t("Wage tax", "Loonheffing")), tax] },
                { cells: [text(t("Pension", "Pensioen")), pension] },
                { cells: [text(t("Total deductions", "Totaal inhoudingen")), deductions], total: true },
              ],
            },
            { type: "big", label: t("Net wage", "Nettoloon"), cell: net },
          ],
        },
      ];
    },
  },

  // ---- a till receipt (kassabon): items × price, discount, total, VAT included, paid, change
  receipt: {
    name: { en: "Till receipt", nl: "Kassabon" },
    thisDoc: { en: "this receipt", nl: "deze kassabon" },
    rows: { key: "items", min: 1, max: 8, prefix: "item", blank: { Name: "", Qty: "1", Price: "1.00" } },
    example: (language) => {
      const t = by(language);
      return {
        values: {
          shop: "Supermarkt De Korenbloem",
          address: t("3 Marktstraat, Ommerdam", "Marktstraat 3, Ommerdam"),
          date: t("27/11/2026", "27-11-2026"),
          time: "16:42",
          receiptNo: "3-2817",
          items: "5",
          item1Name: t("Brown bread", "Bruin brood"), item1Qty: "1", item1Price: "2.49",
          item2Name: t("Milk 1 litre", "Melk 1 liter"), item2Qty: "2", item2Price: "1.15",
          item3Name: t("Apples, bag", "Appels, zak"), item3Qty: "1", item3Price: "2.99",
          item4Name: t("Cheese slices", "Kaas plakken"), item4Qty: "1", item4Price: "5.79",
          item5Name: "Pasta 500 g", item5Qty: "3", item5Price: "0.89",
          discount: "1.00",
          vatPct: "9",
          paid: "20.00",
        },
        find: { target: "change", question: { en: "Tap the change: the money you get back.", nl: "Tik op het wisselgeld: het geld dat je terugkrijgt." } },
        answer: { source: "item2Amount", answer: "2.30", question: { en: "How much did you pay for the milk?", nl: "Hoeveel betaalde je voor de melk?" } },
        check: { item5Amount: "2.76", change: "5.67" },
      };
    },
    build: (b, t, rows) => {
      b.group = t("Shop", "Winkel");
      const letterhead: Block = { type: "letterhead", logo: "basket", name: b.input("shop", t("Shop", "Winkel"), "text"), lines: [b.input("address", t("Address of the shop", "Adres van de winkel"), "text")] };
      const info: Block = {
        type: "pairs",
        caption: t("Receipt", "Bon"),
        rows: [
          { label: t("Date", "Datum"), cell: b.input("date", t("Date", "Datum"), "text") },
          { label: t("Time", "Tijd"), cell: b.input("time", t("Time", "Tijd"), "time") },
          { label: t("Till and receipt", "Kassa en bon"), cell: b.input("receiptNo", t("Till and receipt number", "Kassa- en bonnummer"), "text") },
        ],
      };
      const lines: Row[] = [];
      for (const i of range(rows)) {
        b.group = t(`Item ${i}`, `Artikel ${i}`);
        b.row = i;
        const name = b.read(`item${i}Name`, t(`Item ${i}`, `Artikel ${i}`), "text") || t(`Item ${i}`, `Artikel ${i}`);
        lines.push({
          cells: [
            b.input(`item${i}Name`, t(`Item ${i}`, `Artikel ${i}`), "text"),
            b.input(`item${i}Qty`, t(`${name}, number`, `${name}, aantal`), "number"),
            b.input(`item${i}Price`, t(`${name}, price each`, `${name}, prijs per stuk`), "money"),
            b.calc(`item${i}Amount`, t(`${name}, amount`, `${name}, bedrag`), "money", b.num(`item${i}Qty`) * b.num(`item${i}Price`)),
          ],
        });
      }
      b.row = 0;
      b.group = t("Totals", "Totalen");
      const count = b.calc("count", t("Number of items", "Aantal artikelen"), "number", sum(range(rows).map((i) => b.num(`item${i}Qty`))));
      const discount = b.input("discount", t("Discount", "Korting"), "money", { minus: true });
      const total = b.calc("total", t("Total", "Totaal"), "money", sum(range(rows).map((i) => b.num(`item${i}Amount`))) - b.num("discount"));
      const paid = b.input("paid", t("Paid in cash", "Contant betaald"), "money");
      const change = b.calc("change", t("Change", "Wisselgeld"), "money", b.num("paid") - b.num("total"));
      const vatPct = b.input("vatPct", t("VAT, percentage", "Btw, percentage"), "percent");
      const vat = b.calc("vat", t("VAT included", "Btw inbegrepen"), "money", (b.num("total") * b.num("vatPct")) / (100 + b.num("vatPct")));
      return [
        {
          kind: "paper",
          blocks: [
            letterhead,
            info,
            {
              type: "table",
              caption: t("Purchases", "Aankopen"),
              head: [text(t("Item", "Artikel")), text(t("Number", "Aantal")), text(t("Price", "Prijs")), text(t("Amount", "Bedrag"))],
              end: [false, true, true, true],
              rows: [
                ...lines,
                { cells: [text(t("Number of items", "Aantal artikelen")), count, null, null] },
                { cells: [text(t("Discount", "Korting")), null, null, discount] },
              ],
            },
            { type: "big", label: t("Total", "Totaal"), cell: total },
            {
              type: "table",
              caption: t("Payment", "Betaling"),
              head: [text(t("Payment", "Betaling")), text(t("Amount", "Bedrag"))],
              end: [false, true],
              rows: [
                { cells: [text(t("Paid in cash", "Contant betaald")), paid] },
                { cells: [text(t("Change", "Wisselgeld")), change], total: true },
              ],
            },
            { type: "note", cells: [text(t("VAT included", "Btw inbegrepen")), vatPct, vat] },
            { type: "note", cells: [text(t("Thank you and see you soon!", "Bedankt en tot ziens!"))] },
          ],
        },
      ];
    },
  },

  // ---- a packing slip (pakbon) next to what is in the box: ordered, delivered, still to come
  packingSlip: {
    name: { en: "Packing slip", nl: "Pakbon" },
    thisDoc: { en: "this packing slip", nl: "deze pakbon" },
    rows: { key: "lines", min: 1, max: 6, prefix: "line", blank: { Code: "", Name: "", Ordered: "1", Received: "1" } },
    example: (language) => {
      const t = by(language);
      return {
        values: {
          shop: "Klusshop Hamerslag",
          address: t("40 Werfkade, Ommerdam", "Werfkade 40, Ommerdam"),
          orderNo: "KH-20817",
          orderDate: t("23/11/2026", "23-11-2026"),
          customer: "Noor Visser",
          lines: "5",
          line1Code: "10-442", line1Name: t("Screws 4 × 40 mm, box", "Schroeven 4 × 40 mm, doosje"), line1Ordered: "2", line1Received: "2",
          line2Code: "10-618", line2Name: t("Wall plugs 6 mm, box", "Pluggen 6 mm, doosje"), line2Ordered: "2", line2Received: "1",
          line3Code: "22-105", line3Name: t("Hammer", "Hamer"), line3Ordered: "1", line3Received: "1",
          line4Code: "31-260", line4Name: t("Spirit level 60 cm", "Waterpas 60 cm"), line4Ordered: "1", line4Received: "0",
          line5Code: "45-012", line5Name: t("Paint brushes, set of 3", "Kwasten, set van 3"), line5Ordered: "1", line5Received: "1",
        },
        find: { target: "orderNo", question: { en: "Tap the order number.", nl: "Tik op het bestelnummer." } },
        answer: { source: "line1Ordered", answer: "2", unit: { en: "boxes", nl: "doosjes" }, question: { en: "How many boxes of screws did you order?", nl: "Hoeveel doosjes schroeven heb je besteld?" } },
        check: { line2Delivered: "2", line4Delivered: "1" },
      };
    },
    build: (b, t, rows) => {
      b.group = t("Shop", "Winkel");
      const letterhead: Block = { type: "letterhead", logo: "tools", name: b.input("shop", t("Shop", "Winkel"), "text"), lines: [b.input("address", t("Address of the shop", "Adres van de winkel"), "text")] };
      b.group = t("Order", "Bestelling");
      const pairs: Block = {
        type: "pairs",
        caption: t("Order", "Bestelling"),
        rows: [
          { label: t("Order number", "Bestelnummer"), cell: b.input("orderNo", t("Order number", "Bestelnummer"), "text") },
          { label: t("Order date", "Besteldatum"), cell: b.input("orderDate", t("Order date", "Besteldatum"), "text") },
          { label: t("Customer", "Klant"), cell: b.input("customer", t("Customer", "Klant"), "text") },
        ],
      };
      const names: string[] = [];
      const lines: Row[] = [];
      for (const i of range(rows)) {
        b.group = t(`Line ${i}`, `Regel ${i}`);
        b.row = i;
        const name = b.read(`line${i}Name`, t(`Line ${i}, article`, `Regel ${i}, artikel`), "text") || t(`Article ${i}`, `Artikel ${i}`);
        names.push(name);
        const code = b.input(`line${i}Code`, t(`${name}, article number`, `${name}, artikelnummer`), "text");
        const nameCell = b.input(`line${i}Name`, t(`Line ${i}, article`, `Regel ${i}, artikel`), "text");
        const ordered = b.input(`line${i}Ordered`, t(`${name}, ordered`, `${name}, besteld`), "number");
        // what is in the box: the truth the packing slip should tell
        const received = numberOf("number", b.read(`line${i}Received`, t(`${name}, in the box`, `${name}, in de doos`), "number")) || 0;
        const delivered = b.calc(`line${i}Delivered`, t(`${name}, delivered`, `${name}, geleverd`), "number", received);
        const open = b.calc(`line${i}Open`, t(`${name}, still to come`, `${name}, komt nog`), "number", b.num(`line${i}Ordered`) - b.num(`line${i}Delivered`));
        lines.push({ cells: [nameCell, code, ordered, delivered, open] });
      }
      b.row = 0;
      b.group = t("Totals", "Totalen");
      const totalOrdered = b.calc("totalOrdered", t("Total ordered", "Totaal besteld"), "number", sum(range(rows).map((i) => b.num(`line${i}Ordered`))));
      const totalDelivered = b.calc("totalDelivered", t("Total delivered", "Totaal geleverd"), "number", sum(range(rows).map((i) => b.num(`line${i}Delivered`))));
      const totalOpen = b.calc("totalOpen", t("Total still to come", "Totaal komt nog"), "number", sum(range(rows).map((i) => b.num(`line${i}Open`))));
      // the box: only what is in it
      const box: Row[] = [];
      for (const i of range(rows)) {
        const received = numberOf("number", b.read(`line${i}Received`, "", "number")) || 0;
        if (received > 0) box.push({ cells: [text(names[i - 1]), b.input(`line${i}Received`, t(`${names[i - 1]}, in the box`, `${names[i - 1]}, in de doos`), "number")] });
      }
      return [
        {
          kind: "paper",
          blocks: [
            letterhead,
            { type: "title", text: t("Packing slip", "Pakbon") },
            pairs,
            {
              type: "table",
              caption: t("Your order", "Je bestelling"),
              head: [text(t("Article", "Artikel")), text(t("Article no.", "Art.nr.")), text(t("Ordered", "Besteld")), text(t("Delivered", "Geleverd")), text(t("Still to come", "Komt nog"))],
              end: [false, false, true, true, true],
              rows: [...lines, { cells: [text(t("Total", "Totaal")), null, totalOrdered, totalDelivered, totalOpen], total: true }],
            },
            { type: "note", cells: [text(t("Something missing? Let us know within 14 days.", "Mis je iets? Laat het ons binnen 14 dagen weten."))] },
          ],
        },
        {
          kind: "box",
          title: t("What is in the box", "Wat zit er in de doos"),
          blocks: [
            {
              type: "table",
              caption: t("You counted", "Je hebt geteld"),
              head: [text(t("Article", "Artikel")), text(t("Number", "Aantal"))],
              end: [false, true],
              rows: box,
            },
          ],
        },
      ];
    },
  },

  // ---- a staff rota (dienstrooster): shifts per day and person, hours this week
  rota: {
    name: { en: "Staff rota", nl: "Dienstrooster" },
    thisDoc: { en: "this rota", nl: "dit rooster" },
    example: (language) => {
      const t = by(language);
      return {
        values: {
          business: "Lunchroom Het Zonnetje",
          week: t("Week 48", "Week 48"),
          person1: "Sam", person2: "Noor", person3: "Daan",
          day1: t("Mon 23 Nov", "ma 23 nov"), day2: t("Tue 24 Nov", "di 24 nov"), day3: t("Wed 25 Nov", "wo 25 nov"),
          day4: t("Thu 26 Nov", "do 26 nov"), day5: t("Fri 27 Nov", "vr 27 nov"), day6: t("Sat 28 Nov", "za 28 nov"),
          day1Person1: "09:00-13:00", day1Person2: "12:00-18:00", day1Person3: "",
          day2Person1: "", day2Person2: "09:00-17:00", day2Person3: "12:00-18:00",
          day3Person1: "12:00-17:30", day3Person2: "", day3Person3: "09:00-13:00",
          day4Person1: "", day4Person2: "09:00-13:00", day4Person3: "",
          day5Person1: "", day5Person2: "13:00-18:00", day5Person3: "09:00-17:00",
          day6Person1: "09:00-17:00", day6Person2: "", day6Person3: "12:00-17:00",
        },
        find: { target: "day5Person2", question: { en: "Tap Noor's shift on Friday.", nl: "Tik op de dienst van Noor op vrijdag." } },
        answer: { source: "total1", answer: "17.5", unit: { en: "hours", nl: "uur" }, question: { en: "How many hours does Sam work this week?", nl: "Hoeveel uur werkt Sam deze week?" } },
        check: { total2: "21", total3: "25" },
      };
    },
    build: (b, t) => {
      b.group = t("Rota", "Rooster");
      const letterhead: Block = { type: "letterhead", logo: "cup", name: b.input("business", t("Business", "Bedrijf"), "text"), lines: [] };
      const week = b.input("week", t("Week", "Week"), "text");
      b.group = t("Team", "Team");
      const people = [1, 2, 3].map((p) => b.read(`person${p}`, t(`Person ${p}`, `Persoon ${p}`), "text") || t(`Person ${p}`, `Persoon ${p}`));
      const head = [text(t("Day", "Dag")), ...[1, 2, 3].map((p) => b.input(`person${p}`, t(`Person ${p}`, `Persoon ${p}`), "text"))];
      const rows: Row[] = [];
      for (const d of range(6)) {
        b.group = t(`Day ${d}`, `Dag ${d}`);
        const day = b.read(`day${d}`, t(`Day ${d}`, `Dag ${d}`), "text") || t(`Day ${d}`, `Dag ${d}`);
        rows.push({
          cells: [b.input(`day${d}`, t(`Day ${d}`, `Dag ${d}`), "text"), ...[1, 2, 3].map((p) => b.input(`day${d}Person${p}`, `${people[p - 1]}, ${day}`, "shift"))],
        });
      }
      b.group = t("Hours this week", "Uren deze week");
      const totals = [1, 2, 3].map((p) =>
        b.calc(`total${p}`, t(`${people[p - 1]}, hours this week`, `${people[p - 1]}, uren deze week`), "number", sum(range(6).map((d) => b.num(`day${d}Person${p}`)))),
      );
      return [
        {
          kind: "paper",
          blocks: [
            letterhead,
            { type: "title", text: t("Rota", "Rooster"), cells: [week] },
            {
              type: "table",
              caption: t("Who works when?", "Wie werkt wanneer?"),
              head,
              end: [false, false, false, false],
              rows: [...rows, { cells: [text(t("Hours this week", "Uren deze week")), ...totals], total: true }],
            },
            { type: "note", cells: [text(t("Want to swap a shift? Ask the manager first.", "Wil je een dienst ruilen? Vraag het eerst aan de leidinggevende."))] },
          ],
        },
      ];
    },
  },

  // ---- a bus timetable (dienstregeling): departures from the first stop, minutes to the next stops
  timetable: {
    name: { en: "Bus timetable", nl: "Dienstregeling" },
    thisDoc: { en: "this timetable", nl: "deze dienstregeling" },
    example: (language) => {
      const t = by(language);
      return {
        values: {
          line: "12",
          route: t("Station – Hospital", "Station – Ziekenhuis"),
          days: t("Monday to Friday", "Maandag tot en met vrijdag"),
          stop1: "Station", stop2: "Marktplein", stop3: "Sportpark", stop4: t("Library", "Bibliotheek"), stop5: t("Hospital", "Ziekenhuis"),
          offset2: "4", offset3: "9", offset4: "13", offset5: "18",
          bus1Stop1: "07:45", bus2Stop1: "08:15", bus3Stop1: "08:45", bus4Stop1: "09:15", bus5Stop1: "09:45",
          note: t("The bus runs every 30 minutes.", "De bus rijdt elk half uur."),
        },
        find: { target: "bus1Stop1", question: { en: "When does the first bus leave from the Station? Tap the time.", nl: "Hoe laat vertrekt de eerste bus van het Station? Tik op de tijd." } },
        answer: {
          source: "bus4Stop2",
          answer: "29",
          unit: { en: "minutes", nl: "minuten" },
          question: { en: "It is 08:50. You are at the stop Marktplein. How many minutes until the next bus?", nl: "Het is 08:50. Je staat bij de halte Marktplein. Hoeveel minuten duurt het tot de volgende bus?" },
        },
        check: { bus3Stop4: "09:01" },
      };
    },
    build: (b, t) => {
      b.group = t("Bus line", "Buslijn");
      const badge = b.input("line", t("Line number", "Lijnnummer"), "text");
      const route = b.input("route", t("Route", "Route"), "text");
      const days = b.input("days", t("Days", "Dagen"), "text");
      b.group = t("Stops", "Haltes");
      const stops = range(5).map((s) => b.input(`stop${s}`, t(`Stop ${s}`, `Halte ${s}`), "text"));
      const stopNames = range(5).map((s) => b.text(`stop${s}`));
      b.group = t("Minutes from the first stop", "Minuten vanaf de eerste halte");
      const offsets = [0, ...range(4).map((s) => numberOf("number", b.read(`offset${s + 1}`, t(`Minutes to ${stopNames[s]}`, `Minuten tot ${stopNames[s]}`), "number")))];
      b.group = t("Departures from the first stop", "Vertrek van de eerste halte");
      const rows: Row[] = range(5).map((s) => ({
        cells: [
          stops[s - 1],
          ...range(5).map((c) =>
            s === 1
              ? b.input(`bus${c}Stop1`, t(`${stopNames[0]}, bus ${c}`, `${stopNames[0]}, bus ${c}`), "time")
              : b.calc(`bus${c}Stop${s}`, `${stopNames[s - 1]}, bus ${c}`, "time", b.num(`bus${c}Stop1`) + offsets[s - 1]),
          ),
        ],
      }));
      b.group = t("Bus line", "Buslijn");
      const note = b.input("note", t("Note", "Opmerking"), "text");
      return [
        {
          kind: "paper",
          blocks: [
            { type: "title", text: t("Bus line", "Buslijn"), badge, cells: [route] },
            { type: "note", cells: [days] },
            {
              type: "table",
              caption: t("Departure times", "Vertrektijden"),
              head: [text(t("Stop", "Halte")), ...range(5).map((c) => text(`Bus ${c}`))],
              end: [false, true, true, true, true, true],
              rows,
            },
            { type: "note", cells: [note] },
          ],
        },
      ];
    },
  },

  // ---- an energy bill (jaarafrekening): meter readings, usage, costs, VAT, paid in advance, to pay or to get back
  energyBill: {
    name: { en: "Energy bill", nl: "Energierekening" },
    thisDoc: { en: "this energy bill", nl: "deze energierekening" },
    example: (language) => {
      const t = by(language);
      return {
        values: {
          company: "Polderstroom Energie",
          address: t("1 Dijkweg, Ommerdam", "Dijkweg 1, Ommerdam"),
          customer: "Fam. de Wit",
          customerNo: "880 214 57",
          period: t("1/11/2025 to 31/10/2026", "1-11-2025 tot en met 31-10-2026"),
          meterStart: "23512",
          meterEnd: "25902",
          price: "0.28",
          fixed: "75.00",
          grid: "380.00",
          vatPct: "21",
          advance: "110.00",
          months: "12",
        },
        find: { target: "usage", question: { en: "Tap how many kWh you used this year.", nl: "Tik op hoeveel kWh je dit jaar hebt verbruikt." } },
        answer: { source: "paidTotal", answer: "1320", question: { en: "How much did you pay in advance this year?", nl: "Hoeveel heb je dit jaar al vooruit betaald?" } },
        check: { usage: "2490", vat: "214.96" },
      };
    },
    build: (b, t) => {
      b.group = t("Energy company", "Energiebedrijf");
      const letterhead: Block = { type: "letterhead", logo: "bolt", name: b.input("company", t("Energy company", "Energiebedrijf"), "text"), lines: [b.input("address", t("Address of the company", "Adres van het bedrijf"), "text")] };
      b.group = t("Customer", "Klant");
      const pairs: Block = {
        type: "pairs",
        caption: t("Customer", "Klant"),
        rows: [
          { label: t("Name", "Naam"), cell: b.input("customer", t("Name", "Naam"), "text") },
          { label: t("Customer number", "Klantnummer"), cell: b.input("customerNo", t("Customer number", "Klantnummer"), "text") },
          { label: t("Period", "Periode"), cell: b.input("period", t("Period", "Periode"), "text") },
        ],
      };
      b.group = t("Meter", "Meter");
      const start = b.input("meterStart", t("Meter reading at the start", "Meterstand aan het begin"), "number", { unit: "kWh" });
      const end = b.input("meterEnd", t("Meter reading at the end", "Meterstand aan het eind"), "number", { unit: "kWh" });
      const usage = b.calc("usage", t("Usage", "Verbruik"), "number", b.num("meterEnd") - b.num("meterStart"), { unit: "kWh" });
      b.group = t("Costs", "Kosten");
      const costUsage = b.calc("costUsage", t("Electricity, kWh", "Stroom, kWh"), "number", b.num("usage"), { unit: "kWh" });
      const price = b.input("price", t("Price per kWh", "Prijs per kWh"), "money");
      const energy = b.calc("energy", t("Electricity, amount", "Stroom, bedrag"), "money", b.num("costUsage") * b.num("price"));
      const fixed = b.input("fixed", t("Fixed delivery costs", "Vaste leveringskosten"), "money");
      const grid = b.input("grid", t("Grid costs", "Netbeheerkosten"), "money");
      const subtotal = b.calc("subtotal", t("Subtotal", "Subtotaal"), "money", b.num("energy") + b.num("fixed") + b.num("grid"));
      const vatPct = b.input("vatPct", t("VAT, percentage", "Btw, percentage"), "percent");
      const vat = b.calc("vat", t("VAT", "Btw"), "money", (b.num("subtotal") * b.num("vatPct")) / 100);
      const total = b.calc("total", t("Total costs", "Totale kosten"), "money", b.num("subtotal") + b.num("vat"));
      b.group = t("Paid in advance", "Vooruit betaald");
      const advance = b.input("advance", t("Advance per month", "Voorschot per maand"), "money");
      const months = b.input("months", t("Months", "Maanden"), "number");
      const paidTotal = b.calc("paidTotal", t("Paid in advance", "Vooruit betaald"), "money", b.num("advance") * b.num("months"));
      const rest = b.num("total") - b.num("paidTotal");
      const balanceLabel = rest >= 0 ? t("You still have to pay", "Je moet nog betalen") : t("You get back", "Je krijgt terug");
      const balance = b.calc("balance", balanceLabel, "money", Math.abs(rest));
      return [
        {
          kind: "paper",
          blocks: [
            letterhead,
            { type: "title", text: t("Annual statement: electricity", "Jaarafrekening stroom") },
            pairs,
            {
              type: "table",
              caption: t("Your meter", "Je meter"),
              head: [text(t("Meter", "Meter")), text(t("Reading", "Stand"))],
              end: [false, true],
              rows: [
                { cells: [text(t("Reading at the start", "Stand aan het begin")), start] },
                { cells: [text(t("Reading at the end", "Stand aan het eind")), end] },
                { cells: [text(t("Usage", "Verbruik")), usage], total: true },
              ],
            },
            {
              type: "table",
              caption: t("Costs", "Kosten"),
              head: [text(t("Description", "Omschrijving")), text(t("Number", "Aantal")), text(t("Price", "Prijs")), text(t("Amount", "Bedrag"))],
              end: [false, true, true, true],
              rows: [
                { cells: [text(t("Electricity", "Stroom")), costUsage, price, energy] },
                { cells: [text(t("Fixed delivery costs", "Vaste leveringskosten")), null, null, fixed] },
                { cells: [text(t("Grid costs", "Netbeheerkosten")), null, null, grid] },
                { cells: [text(t("Subtotal", "Subtotaal")), null, null, subtotal], total: true },
                { cells: [text(t("VAT", "Btw")), null, vatPct, vat] },
                { cells: [text(t("Total costs", "Totale kosten")), null, null, total], total: true },
              ],
            },
            {
              type: "table",
              caption: t("Paid in advance", "Vooruit betaald"),
              head: [text(t("Description", "Omschrijving")), text(t("Number", "Aantal")), text(t("Amount", "Bedrag"))],
              end: [false, true, true],
              rows: [
                { cells: [text(t("Advance per month", "Voorschot per maand")), null, advance] },
                { cells: [text(t("Months", "Maanden")), months, null] },
                { cells: [text(t("Paid in advance", "Vooruit betaald")), null, paidTotal], total: true },
              ],
            },
            { type: "big", label: balanceLabel, cell: balance },
          ],
        },
      ];
    },
  },

  // ---- a dosage table of a medicine leaflet (bijsluiter): tablets each time × times a day, milligrams a day
  dosage: {
    name: { en: "Medicine leaflet", nl: "Bijsluiter" },
    thisDoc: { en: "this leaflet", nl: "deze bijsluiter" },
    example: (language) => {
      const t = by(language);
      return {
        values: {
          medicine: t("Pain relief tablets 500 mg", "Pijnstillende tabletten 500 mg"),
          strength: "500",
          wait: "4",
          age1: t("6 to 9 years", "6 tot 9 jaar"), weight1: "20–30 kg", dose1: "0.5", times1: "4",
          age2: t("9 to 12 years", "9 tot 12 jaar"), weight2: "30–40 kg", dose2: "1", times2: "3",
          age3: t("12 to 15 years", "12 tot 15 jaar"), weight3: "40–50 kg", dose3: "1", times3: "4",
          age4: t("15 years and older", "15 jaar en ouder"), weight4: t("over 50 kg", "meer dan 50 kg"), dose4: "2", times4: "3",
          note: t("Practice leaflet for school. This is not a real medicine.", "Oefenbijsluiter voor school. Dit is geen echt medicijn."),
        },
        find: { target: "dose2", question: { en: "A child of 10 has a headache. Tap how many tablets the child may take each time.", nl: "Een kind van 10 heeft hoofdpijn. Tik op hoeveel tabletten het kind per keer mag nemen." } },
        answer: { source: "perDay2", answer: "3", unit: { en: "tablets", nl: "tabletten" }, question: { en: "How many tablets may a child of 10 take in one day at most?", nl: "Hoeveel tabletten mag een kind van 10 op één dag hoogstens nemen?" } },
        check: { perDay4: "5", mg3: "2500" },
      };
    },
    build: (b, t) => {
      b.group = t("Medicine", "Medicijn");
      const medicine = b.input("medicine", t("Medicine", "Medicijn"), "text");
      const strength = b.input("strength", t("Milligrams in one tablet", "Milligram in één tablet"), "number", { unit: "mg" });
      const wait = b.input("wait", t("Hours between two doses at least", "Uren tussen twee keer innemen minstens"), "number", { unit: t("hours", "uur") });
      const rows: Row[] = [];
      for (const r of range(4)) {
        b.group = t(`Row ${r}`, `Rij ${r}`);
        const age = b.read(`age${r}`, t(`Row ${r}, age`, `Rij ${r}, leeftijd`), "text") || t(`Row ${r}`, `Rij ${r}`);
        rows.push({
          cells: [
            b.input(`age${r}`, t(`Row ${r}, age`, `Rij ${r}, leeftijd`), "text"),
            b.input(`weight${r}`, t(`${age}, weight`, `${age}, gewicht`), "text"),
            b.input(`dose${r}`, t(`${age}, tablets each time`, `${age}, tabletten per keer`), "number"),
            b.input(`times${r}`, t(`${age}, times a day at most`, `${age}, keer per dag hoogstens`), "number"),
            b.calc(`perDay${r}`, t(`${age}, tablets a day at most`, `${age}, tabletten per dag hoogstens`), "number", b.num(`dose${r}`) * b.num(`times${r}`)),
            b.calc(`mg${r}`, t(`${age}, milligrams a day at most`, `${age}, milligram per dag hoogstens`), "number", b.num(`perDay${r}`) * b.num("strength"), { unit: "mg" }),
          ],
        });
      }
      b.group = t("Medicine", "Medicijn");
      const note = b.input("note", t("Note", "Opmerking"), "text");
      return [
        {
          kind: "paper",
          blocks: [
            { type: "letterhead", logo: "cross", name: medicine, lines: [] },
            { type: "pairs", caption: t("About the tablets", "Over de tabletten"), rows: [
              { label: t("One tablet contains", "Eén tablet bevat"), cell: strength },
              { label: t("Wait between two doses at least", "Wacht tussen twee keer innemen minstens"), cell: wait },
            ] },
            { type: "title", text: t("How much may you take?", "Hoeveel mag je innemen?") },
            {
              type: "table",
              caption: t("Dosage", "Dosering"),
              head: [
                text(t("Age", "Leeftijd")), text(t("Weight", "Gewicht")), text(t("Tablets each time", "Tabletten per keer")),
                text(t("Times a day at most", "Keer per dag hoogstens")), text(t("Tablets a day at most", "Tabletten per dag hoogstens")),
                text(t("Milligrams a day at most", "Milligram per dag hoogstens")),
              ],
              end: [false, false, true, true, true, true],
              rows,
            },
            { type: "note", cells: [text(t("Younger than 6 years: ask your doctor first.", "Jonger dan 6 jaar: vraag het eerst aan je huisarts."))] },
            { type: "note", cells: [note] },
          ],
        },
      ];
    },
  },
};

/** The name of a template in a language: "Payslip", "Loonstrook". */
export const templateName = (template: TemplateId, language: Language) => TEMPLATE_DEFS[template].name[language];
export const rowsOf = (template: TemplateId) => TEMPLATE_DEFS[template].rows;

/** The example of a template in a language: its values, and the targets, answer and mistakes of each task. */
export const exampleOf = (template: TemplateId, language: Language): Example => TEMPLATE_DEFS[template].example(language);

/** What the author makes (the `document` setting): the values of the template, and the fields made wrong on purpose. */
export type DocumentSpec = { values: Values; mistakes: Record<string, string> };

/** The `document` setting: JSON { values, mistakes }. Null when it is empty or cannot be read. */
export function parseDocumentSpec(json: string | undefined | null): DocumentSpec | null {
  if (!json || !String(json).trim()) return null;
  try {
    const data = JSON.parse(String(json));
    if (!data || typeof data !== "object" || typeof data.values !== "object" || data.values === null) return null;
    const strings = (o: unknown) =>
      Object.fromEntries(Object.entries((o && typeof o === "object" ? o : {}) as Record<string, unknown>).filter(([, v]) => typeof v === "string" || typeof v === "number").map(([k, v]) => [k, String(v)]));
    return { values: strings(data.values), mistakes: strings(data.mistakes) };
  } catch {
    return null;
  }
}

export const serializeDocumentSpec = (spec: DocumentSpec) => JSON.stringify({ values: spec.values, mistakes: spec.mistakes });

/** The document of a template with the author's values (or the example's) and the fields made wrong. */
export function buildDocument(template: TemplateId, language: Language, spec: DocumentSpec): Doc {
  const def = TEMPLATE_DEFS[template];
  const preset = def.example(language).values;
  const b = new Builder(spec.values, preset, spec.mistakes, language);
  const t = by(language);
  let rows: Doc["rows"];
  let count = 0;
  if (def.rows) {
    const n = Math.round(Number(spec.values[def.rows.key] ?? preset[def.rows.key]));
    count = Number.isFinite(n) ? Math.min(def.rows.max, Math.max(def.rows.min, n)) : Number(preset[def.rows.key]);
    rows = { key: def.rows.key, prefix: def.rows.prefix, count, min: def.rows.min, max: def.rows.max, blank: def.rows.blank };
  }
  const panels = def.build(b, t, count);
  // the fields in the order the document shows them
  const order: string[] = [];
  const visit = (cell: Cell | undefined) => {
    if (cell && "field" in cell && !order.includes(cell.field)) order.push(cell.field);
  };
  for (const panel of panels) {
    for (const block of panel.blocks) {
      if (block.type === "letterhead") [block.name, ...block.lines].forEach(visit);
      else if (block.type === "title") [block.badge, ...(block.cells ?? [])].forEach(visit);
      else if (block.type === "pairs") block.rows.forEach((row) => visit(row.cell));
      else if (block.type === "table") [...block.head, ...block.rows.flatMap((row) => row.cells)].forEach(visit);
      else if (block.type === "big") visit(block.cell);
      else block.cells.forEach(visit);
    }
  }
  return {
    template,
    language,
    name: def.name[language],
    panels,
    fields: order.map((id) => b.byId[id]),
    byId: b.byId,
    inputs: b.inputs,
    groups: b.groups,
    rows,
  };
}

/** The fields that show another value than they should, in the order of the document. */
export const mistakesOf = (doc: Doc) => doc.fields.filter((field) => field.wrong).map((field) => field.id);

/**
 * A wrong value the author can start from when they make a field wrong: a little off, as a real slip would be (an
 * amount 10 more, a count 2 more, a time 5 minutes later, a shift an hour longer).
 */
export function suggestWrong(field: Field): string {
  const n = numberOf(field.kind, field.natural);
  switch (field.kind) {
    case "money":
      return (Number.isFinite(n) ? round(n + (Math.abs(n) >= 50 ? 10 : 1), 2) : 1).toFixed(2);
    case "time":
      return timeText((Number.isFinite(n) ? n : 0) + 5);
    case "shift": {
      const shift = parseShift(field.natural);
      return shift ? `${timeText(shift.start)}-${timeText(shift.end + 60)}` : "09:00-13:00";
    }
    case "text":
      return `${field.natural}?`;
    default:
      return String(round((Number.isFinite(n) ? n : 0) + (Number.isInteger(n) ? 2 : 1), 2));
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The item: the settings, the question, the response

export type Settings = Partial<{
  title: string;
  question: string;
  language: string;
  template: string;
  task: string;
  document: string;
  targets: string;
  answer: string;
  tolerance: string;
  unit: string;
  markSource: string;
  currency: string;
}>;

export type Model = {
  template: TemplateId;
  task: Task;
  language: Language;
  doc: Doc;
  /** find: the right field(s); answer: where the answer is */
  targets: string[];
  /** answer: the correct number */
  answer: number | null;
  tolerance: number;
  /** the unit after the answer box ("minutes"), or the currency sign before it */
  unit: string;
  unitBefore: boolean;
  markSource: boolean;
  currency: string;
  question: string;
  /** the (first) target is the example's: the example's question and unit fit it */
  exampleTargets: boolean;
};

const splitIds = (text: string | undefined) =>
  String(text ?? "")
    .split(/[\s,;]+/)
    .map((id) => id.trim())
    .filter(Boolean);

/** The item from its settings: a setting that is empty or cannot be read gives the example's. */
export function modelFrom(settings: Settings): Model {
  const template = templateOf(settings.template);
  const task = taskOf(settings.task);
  const language = languageOf(settings.language);
  const example = exampleOf(template, language);
  const own = parseDocumentSpec(settings.document);
  const spec = own ?? { values: example.values, mistakes: task === "check" ? example.check : {} };
  const doc = buildDocument(template, language, spec);
  const given = splitIds(settings.targets).filter((id) => doc.byId[id]);
  const exampleTarget = task === "find" ? example.find.target : task === "answer" ? example.answer.source : "";
  const targets = given.length ? given : exampleTarget && doc.byId[exampleTarget] ? [exampleTarget] : [];
  const exampleTargets = targets.length > 0 && targets[0] === exampleTarget;
  const currency = String(settings.currency ?? "").trim() || "€";
  // the answer: the setting, else the example's (its own document and targets), else the value of the first target
  let answer = parseNumber(settings.answer ?? "", language);
  if (answer === null && task === "answer") {
    if (exampleTargets && !own) answer = Number(example.answer.answer);
    else {
      const source = doc.byId[targets[0]];
      const n = source ? numberOf(source.kind, source.shown) : NaN;
      answer = source && source.kind !== "time" && Number.isFinite(n) ? n : null;
    }
  }
  const source = doc.byId[targets[0]];
  const unitSetting = String(settings.unit ?? "").trim();
  const unit =
    unitSetting ||
    (task !== "answer" ? "" : exampleTargets && example.answer.unit ? example.answer.unit[language] : source?.kind === "money" ? currency : (source?.unit ?? ""));
  const unitBefore = unit === currency;
  const tolerance = Math.abs(parseNumber(settings.tolerance ?? "", language) ?? 0);
  const model: Model = {
    template, task, language, doc, targets, answer, tolerance, unit, unitBefore,
    markSource: String(settings.markSource ?? "true") !== "false",
    currency,
    question: "",
    exampleTargets,
  };
  model.question = String(settings.question ?? "").trim() || defaultQuestion(model);
  return model;
}

/** The question when the item has none: the example's for its own targets, else one made from the field's name. */
export function defaultQuestion(model: Pick<Model, "template" | "task" | "language" | "doc" | "targets" | "exampleTargets">): string {
  const { template, task, language, doc, targets } = model;
  const example = exampleOf(template, language);
  const t = by(language);
  if (task === "check") {
    const n = mistakesOf(doc).length;
    const thisDoc = TEMPLATE_DEFS[template].thisDoc[language];
    const This = thisDoc.charAt(0).toUpperCase() + thisDoc.slice(1);
    if (n === 0) return t(`Tap every mistake in ${thisDoc}.`, `Tik op elke fout in ${thisDoc}.`);
    if (n === 1) return t(`${This} has a mistake. Tap the mistake.`, `In ${thisDoc} staat een fout. Tik op de fout.`);
    return t(`${This} has ${n} mistakes. Tap every mistake.`, `In ${thisDoc} staan ${n} fouten. Tik op elke fout.`);
  }
  if (model.exampleTargets) return (task === "find" ? example.find.question : example.answer.question)[language];
  const label = doc.byId[targets[0]]?.label ?? "";
  return task === "find" ? t(`Tap: ${label}.`, `Tik op: ${label}.`) : t(`Find in the document: ${label}.`, `Zoek in het document: ${label}.`);
}

/** What the pupil did: the fields they tapped (find: one; check: every mistake they saw; answer: where they found it). */
export type Answer = { marked: string[]; typed: string };

export const answered = (model: Model, answer: Answer) =>
  answer.marked.length > 0 || (model.task === "answer" && answer.typed.trim() !== "");

export type ResponseField = { name: string; type: "boolean" | "integer" | "float" | "identifier"; value: boolean | number | string };

/** The response record for what the pupil did; null when they did nothing yet (nothing is reported). */
export function responseFields(model: Model, answer: Answer): ResponseField[] | null {
  if (!answered(model, answer)) return null;
  const marked = answer.marked.filter((id) => model.doc.byId[id]);
  if (model.task === "find") {
    const field = marked[0];
    return [
      { name: "correct", type: "boolean", value: field !== undefined && model.targets.includes(field) },
      ...(field !== undefined ? [{ name: "field", type: "identifier" as const, value: field }] : []),
    ];
  }
  if (model.task === "check") {
    const mistakes = mistakesOf(model.doc).slice(0, MAX_MISTAKES);
    const found = mistakes.filter((id) => marked.includes(id)).length;
    const wrong = marked.filter((id) => !mistakes.includes(id)).length;
    return [
      { name: "correct", type: "boolean", value: mistakes.length > 0 && found === mistakes.length && wrong === 0 },
      { name: "found", type: "integer", value: found },
      { name: "total", type: "integer", value: mistakes.length },
      { name: "wrong", type: "integer", value: wrong },
      ...mistakes.map((id, i) => ({ name: `mistake${i + 1}`, type: "boolean" as const, value: marked.includes(id) })),
    ];
  }
  const number = parseNumber(answer.typed, model.language);
  const source = marked[0];
  const correct = number !== null && model.answer !== null && Math.abs(number - model.answer) <= model.tolerance + 1e-9;
  return [
    { name: "correct", type: "boolean", value: correct },
    ...(number !== null ? [{ name: "answer", type: "float" as const, value: number }] : []),
    ...(model.markSource && source !== undefined
      ? [
          { name: "source", type: "identifier" as const, value: source },
          { name: "sourceCorrect", type: "boolean" as const, value: model.targets.includes(source) },
        ]
      : []),
  ];
}

/** What the pupil does for a full score: the first target, every mistake, the answer (and where it is). */
export function correctAnswer(model: Model): Answer | null {
  if (model.task === "find") return model.targets.length ? { marked: [model.targets[0]], typed: "" } : null;
  if (model.task === "check") {
    const mistakes = mistakesOf(model.doc);
    return mistakes.length && mistakes.length <= MAX_MISTAKES ? { marked: mistakes, typed: "" } : null;
  }
  if (model.answer === null) return null;
  return { marked: model.markSource && model.targets.length ? [model.targets[0]] : [], typed: numberText(model.answer, model.language).replace("−", "-") };
}

/** What the pupil did, from a response record (setResponse, boundTo, a correct response): null when it is not one. */
export function answerFromRecord(model: Model, fields: { name: string; value: unknown }[]): Answer | null {
  const get = (name: string) => fields.find((field) => field.name === name)?.value;
  if (model.task === "find") {
    const field = get("field");
    return typeof field === "string" && model.doc.byId[field] ? { marked: [field], typed: "" } : null;
  }
  if (model.task === "check") {
    const mistakes = mistakesOf(model.doc);
    const marked = mistakes.filter((_, i) => get(`mistake${i + 1}`) === true);
    // the wrong taps are counted, not named: they cannot come back
    return marked.length || fields.length ? { marked, typed: "" } : null;
  }
  const number = get("answer");
  const source = get("source");
  return {
    typed: typeof number === "number" && Number.isFinite(number) ? numberText(number, model.language).replace("−", "-") : "",
    marked: typeof source === "string" && model.doc.byId[source] ? [source] : [],
  };
}

/** What keeps the item from working, as codes (the authoring mode words them). */
export type Problem = "noTarget" | "noMistakes" | "tooManyMistakes" | "noAnswer" | "badValue" | "badMistake";

export function problemsOf(model: Model, spec?: DocumentSpec): Problem[] {
  const problems: Problem[] = [];
  if (spec) {
    const inputs = model.doc.inputs;
    if (inputs.some((input) => input.kind !== "text" && spec.values[input.key] !== undefined && canonical(input.kind, spec.values[input.key], model.language) === null)) problems.push("badValue");
    if (Object.entries(spec.mistakes).some(([id, value]) => value.trim() !== "" && model.doc.byId[id] && canonical(model.doc.byId[id].kind, value, model.language) === null)) problems.push("badMistake");
  }
  if (model.task === "find" && !model.targets.length) problems.push("noTarget");
  if (model.task === "answer" && model.answer === null) problems.push("noAnswer");
  if (model.task === "check") {
    const n = mistakesOf(model.doc).length;
    if (n === 0) problems.push("noMistakes");
    if (n > MAX_MISTAKES) problems.push("tooManyMistakes");
  }
  return problems;
}
