// Money without a screen: the currency (euro, dollar, pound or the author's own), its coins and notes, amounts as text
// and back, the total of a pile of money, the fewest coins and notes for an amount (also with a limited supply), the
// task, the response and the correct response. Everything in hundredths of the main unit (cents, pence; integers),
// never in floating point. No imports: `npm test` runs it in node as it is.

// ---- the currency ----

export type CurrencyCode = "eur" | "usd" | "gbp" | "custom";
export const CURRENCIES: CurrencyCode[] = ["eur", "usd", "gbp", "custom"];
export type PresetCode = Exclude<CurrencyCode, "custom">;
export const isPreset = (code: CurrencyCode): code is PresetCode => code !== "custom";

export type Currency = {
  code: CurrencyCode;
  /** The sign of the main unit: "€", "$", "£", or the author's ("kr", "R$", "₣"). */
  sign: string;
  /** Where the sign goes: before the amount ("€ 7,35", "R$ 7,35") or after it ("7,35 kr"). */
  position: "before" | "after";
  /** The minor unit (a hundredth) as written after a number: "cent", "¢", "p", the author's ("øre"); "" for none. */
  minor: string;
};

export const PRESET_CURRENCIES: Record<PresetCode, Currency> = {
  eur: { code: "eur", sign: "€", position: "before", minor: "cent" },
  usd: { code: "usd", sign: "$", position: "before", minor: "¢" },
  gbp: { code: "gbp", sign: "£", position: "before", minor: "p" },
};
export const EUR = PRESET_CURRENCIES.eur;

/** The settings that make the currency. */
export type CurrencySettings = { currency?: string; currencySign?: string; currencyPosition?: string; minorUnit?: string };

export const parseCurrencyCode = (code: string | undefined): CurrencyCode => (CURRENCIES.includes(code as CurrencyCode) ? (code as CurrencyCode) : "eur");

/** The currency from the settings: a preset, or the author's sign, its place and the minor unit. */
export function currencyFrom(settings: CurrencySettings): Currency {
  const code = parseCurrencyCode(settings.currency);
  if (isPreset(code)) return PRESET_CURRENCIES[code];
  return {
    code,
    sign: String(settings.currencySign ?? "").trim(),
    position: settings.currencyPosition === "after" ? "after" : "before",
    minor: String(settings.minorUnit ?? "").trim(),
  };
}

export const hasMinor = (currency: Currency) => currency.minor !== "";

// ---- amounts as text ----

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const anyOf = (words: string[]) => words.filter((w) => w !== "").map(escape).sort((a, b) => b.length - a.length).join("|");

/** What may stand next to an amount in the main unit, and after one in the minor unit, as a candidate types it. */
function words(currency: Currency): { major: string[]; minor: string[] } {
  switch (currency.code) {
    case "eur":
      return { major: ["€", "eur", "euro", "euros"], minor: ["cent", "cents", "ct"] };
    case "usd":
      return { major: ["$", "us$", "usd", "dollar", "dollars"], minor: ["¢", "c", "cent", "cents"] };
    case "gbp":
      return { major: ["£", "gbp", "pound", "pounds"], minor: ["p", "pence", "penny"] };
    default:
      return { major: [currency.sign], minor: [currency.minor] };
  }
}

/**
 * An amount as an author or a candidate writes it, in hundredths: "7,35", "7.35", "€ 7,35", "€7.35", "7", "7,-", "0,5";
 * "$7.35", "35¢", "35c", "£7.35", "35p"; "7,35 kr", "R$ 7,35", "50 øre". Null for anything else ("", "7,355", "abc",
 * "-3"). A thousands separator is not accepted: "1.200" is not 1200. Without a minor unit only whole amounts: "7", "7,-".
 */
export function parseAmount(text: string | undefined | null, currency: Currency = EUR): number | null {
  if (text === undefined || text === null) return null;
  const { major, minor } = words(currency);
  const sign = anyOf(major);
  const s = sign ? `(?:${sign})?` : "";
  const majorMatch = new RegExp(`^\\s*${s}\\s*(\\d+)\\s*(?:[.,]\\s*(\\d{1,2}|-|–))?\\s*${s}\\s*$`, "iu").exec(String(text));
  if (majorMatch) {
    const whole = Number(majorMatch[1]);
    const fraction = majorMatch[2] && /\d/.test(majorMatch[2]) ? Number(majorMatch[2].padEnd(2, "0")) : 0;
    if (!hasMinor(currency) && fraction !== 0) return null;
    return whole * 100 + fraction;
  }
  const minorWords = anyOf(minor);
  if (!hasMinor(currency) || !minorWords) return null;
  const minorMatch = new RegExp(`^\\s*(\\d+)\\s*(?:${minorWords})\\s*$`, "iu").exec(String(text));
  return minorMatch ? Number(minorMatch[1]) : null;
}

/** Hundredths as the main unit: 735 → 7.35 (for the response; the float closest to the decimal). */
export const toMajor = (cents: number) => Number((cents / 100).toFixed(2));
/** The main unit (a response's float) as hundredths: 7.35 → 735. */
export const toCents = (major: number) => Math.round(major * 100);

/** The number of an amount, without the sign: "7,35" in Dutch, "7.35" in English; "7" without a minor unit. */
export function amountText(cents: number, language: string = "en", currency: Currency = EUR): string {
  const minus = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const rest = abs % 100;
  if (!hasMinor(currency) && rest === 0) return `${minus}${whole}`;
  return `${minus}${whole}${language === "nl" ? "," : "."}${String(rest).padStart(2, "0")}`;
}

/** The sign with a number: "€ 7,35" (Dutch) or "€7.35" (English), "CHF 7.35" (a sign ending in a letter), "7,35 kr". */
export function withSign(number: string, currency: Currency, language: string = "en"): string {
  if (currency.sign === "") return number;
  if (currency.position === "after") return `${number} ${currency.sign}`;
  const minus = number.startsWith("-") ? "-" : "";
  const space = language === "nl" || /\p{L}$/u.test(currency.sign) ? " " : "";
  return `${minus}${currency.sign}${space}${number.replace(/^-/, "")}`;
}

/** A number in the minor unit: "35¢", "35p", "50 øre", "35 cent". A one-character unit goes against the number. */
export const minorText = (cents: number, currency: Currency) =>
  [...currency.minor].length === 1 ? `${cents}${currency.minor}` : `${cents} ${currency.minor}`;

/** Amounts below one in the minor unit, as the dollar and the pound write them: "35¢", "35p" (not the euro: "€0.35"). */
const minorBelowOne = (currency: Currency) => currency.code === "usd" || currency.code === "gbp";

/**
 * An amount as it is written in the currency and the language: "€ 7,35" (nl) and "€7.35" (en); "$7.35", "35¢";
 * "£7.35", "35p"; the author's currency "7,35 kr" or "R$ 7,35".
 */
export function formatAmount(cents: number, language: string = "en", currency: Currency = EUR): string {
  if (cents > 0 && cents < 100 && minorBelowOne(currency)) return minorText(cents, currency);
  return withSign(amountText(cents, language, currency), currency, language);
}

/**
 * What is written on a coin or note, language neutral: the number, the unit in words and its sign. 50 cent → ["50",
 * "CENT", "c"], € 2 → ["2", "EURO", "€"], 25¢ → ["25", "CENTS", "¢"], £ 5 → ["5", "POUNDS", "£"], the author's 50 øre
 * → ["50", "øre", "øre"] and 10 kr → ["10", "kr", "kr"]. A value that is not whole in the main unit: "2.50".
 */
export function faceValue(cents: number, currency: Currency = EUR): [string, string, string] {
  const minor = hasMinor(currency) && cents < 100;
  const number = minor ? String(cents) : amountText(cents, "en", { ...currency, minor: cents % 100 ? "x" : "" });
  const one = number === "1";
  switch (currency.code) {
    case "eur":
      return minor ? [number, "CENT", "c"] : [number, "EURO", "€"];
    case "usd":
      return minor ? [number, one ? "CENT" : "CENTS", "¢"] : [number, one ? "DOLLAR" : "DOLLARS", "$"];
    case "gbp":
      return minor ? [number, one ? "PENNY" : "PENCE", "p"] : [number, one ? "POUND" : "POUNDS", "£"];
    default:
      return minor ? [number, currency.minor, currency.minor] : [number, currency.sign, currency.sign];
  }
}

// ---- the coins and notes of the currency ----

export type Kind = "coin" | "note";
/** The metals of a coin: one, or two (a ring and a centre: "silverInGold" is a silver centre in a gold ring). */
export type Metal = "copper" | "gold" | "silver" | "silverInGold" | "goldInSilver";
export const METALS: Metal[] = ["copper", "gold", "silver", "silverInGold", "goldInSilver"];
export const isMetal = (color: string): color is Metal => METALS.includes(color as Metal);
/** A colour as "#rrggbb" (or "#rgb"). */
export const isHexColor = (color: string) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color);

/**
 * A coin or note of the currency (the `pieces` setting, as JSON):
 * - value: in hundredths of the main unit (5 is 5 cent, 500 is € 5); also for a currency without a minor unit
 * - kind: a coin or a note
 * - color: a coin's metal (copper, gold, silver, silverInGold, goldInSilver) or any colour as "#rrggbb"; a note's colour
 * - offered: the candidate can take it from the supply (otherwise it is only for the customer's money or the counter)
 * - count: how many the supply has, or null for as many as needed
 */
export type PieceDef = { value: number; kind: Kind; color: string; offered: boolean; count: number | null };

const coin = (value: number, color: Metal, offered = true): PieceDef => ({ value, kind: "coin", color, offered, count: null });
const note = (value: number, color: string, offered = true): PieceDef => ({ value, kind: "note", color, offered, count: null });

/** The colours the notes of the presets have; also the named colours an author picks from. */
export const NOTE_COLORS = {
  grey: "#a3aab2",
  red: "#d9675e",
  blue: "#5b8fd0",
  orange: "#eea35a",
  green: "#62b07c",
  yellow: "#e0c35a",
  purple: "#a07cc5",
  teal: "#4aa9a4",
  pink: "#e08cb0",
  brown: "#a8825a",
  dollar: "#8fb592",
} as const;
export type NoteColorName = keyof typeof NOTE_COLORS;

/**
 * The coins and notes of each preset currency, small to large, with the colours close to the real ones (but plain
 * designs: pieces.tsx). Some are there but not offered by default: the author can switch them on.
 * - euro: no 1 and 2 cent (Dutch practice: amounts are rounded to 5 cent) and nothing above € 50 offered
 * - dollar: no 50 cent coin and no $2 note offered; $1 is a note (the author can make it a coin)
 * - pound: everything
 */
export const PRESET_PIECES: Record<PresetCode, PieceDef[]> = {
  eur: [
    coin(1, "copper", false), coin(2, "copper", false), coin(5, "copper"), coin(10, "gold"), coin(20, "gold"), coin(50, "gold"),
    coin(100, "silverInGold"), coin(200, "goldInSilver"),
    note(500, NOTE_COLORS.grey), note(1000, NOTE_COLORS.red), note(2000, NOTE_COLORS.blue), note(5000, NOTE_COLORS.orange),
    note(10000, NOTE_COLORS.green, false), note(20000, NOTE_COLORS.yellow, false),
  ],
  usd: [
    coin(1, "copper"), coin(5, "silver"), coin(10, "silver"), coin(25, "silver"), coin(50, "silver", false),
    note(100, NOTE_COLORS.dollar), note(200, NOTE_COLORS.dollar, false), note(500, NOTE_COLORS.dollar), note(1000, NOTE_COLORS.dollar),
    note(2000, NOTE_COLORS.dollar), note(5000, NOTE_COLORS.dollar), note(10000, NOTE_COLORS.dollar),
  ],
  gbp: [
    coin(1, "copper"), coin(2, "copper"), coin(5, "silver"), coin(10, "silver"), coin(20, "silver"), coin(50, "silver"),
    coin(100, "silverInGold"), coin(200, "silverInGold"),
    note(500, NOTE_COLORS.teal), note(1000, NOTE_COLORS.orange), note(2000, NOTE_COLORS.purple), note(5000, NOTE_COLORS.red),
  ],
};

/** The order in which a new note gets a colour of its own. */
const NOTE_ORDER: NoteColorName[] = ["grey", "red", "blue", "orange", "green", "yellow", "purple", "teal", "pink", "brown"];

/** The look of a preset's coin or note when the author makes it the other kind: a $1 coin is gold. */
const OTHER_KIND: Partial<Record<PresetCode, PieceDef[]>> = { usd: [coin(100, "gold")] };

/** The preset's coin or note of this value (of this kind), if the currency is a preset and has one. */
export function presetPiece(value: number, currency: Currency, kind?: Kind): PieceDef | undefined {
  if (!isPreset(currency.code)) return undefined;
  const all = [...PRESET_PIECES[currency.code], ...(OTHER_KIND[currency.code] ?? [])];
  return all.find((p) => p.value === value && (kind === undefined || p.kind === kind));
}

/** The look of a coin or note: the preset's, or a coin by its value (copper, gold, silver), a note a colour of its own. */
export function defaultLook(value: number, kind: Kind, currency: Currency): { kind: Kind; color: string } {
  const preset = presetPiece(value, currency, kind);
  if (preset) return { kind, color: preset.color };
  if (kind === "coin") return { kind, color: value < 10 ? "copper" : value < 100 ? "gold" : value < 200 ? "silver" : "silverInGold" };
  // notes: 1, 2, 5, 10, ... of the main unit each a colour of their own
  const step = Math.max(0, Math.round(Math.log10(Math.max(1, value / 100)) * 3));
  return { kind, color: NOTE_COLORS[NOTE_ORDER[step % NOTE_ORDER.length]] };
}

/** A new coin or note of `value`: the preset's kind, or a coin up to 2 of the main unit and a note from 5. */
export const newPiece = (value: number, currency: Currency, kind: Kind = presetPiece(value, currency)?.kind ?? (value <= 200 ? "coin" : "note")): PieceDef => ({
  value,
  ...defaultLook(value, kind, currency),
  offered: true,
  count: null,
});

/** The coins and notes of a currency of the author's own, before they change them: 1, 2, 5, … of the minor unit or not. */
export function customPieces(currency: Currency): PieceDef[] {
  const series = hasMinor(currency) ? [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000] : [100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  return series.map((value) => newPiece(value, currency, value <= (hasMinor(currency) ? 200 : 1000) ? "coin" : "note"));
}

/** The coins and notes a currency starts with. */
export const defaultPieces = (currency: Currency): PieceDef[] =>
  isPreset(currency.code) ? PRESET_PIECES[currency.code].map((p) => ({ ...p })) : customPieces(currency);

/**
 * The coins and notes from the `pieces` setting (JSON, as the authoring mode writes it), small to large. Empty, or
 * nothing usable in it: the currency's defaults. A field left out gets the default (a coin up to 2, a note from 5, the
 * preset's colour, offered, as many as needed). A value given twice: the first one counts.
 */
export function parsePieceDefs(text: string | undefined | null, currency: Currency): PieceDef[] {
  let raw: unknown;
  try {
    raw = JSON.parse(String(text ?? "").trim() || "null");
  } catch {
    raw = null;
  }
  const defs: PieceDef[] = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const def = pieceDefFrom(entry, currency);
      if (def && !defs.some((d) => d.value === def.value)) defs.push(def);
    }
  }
  return defs.length ? defs.sort((a, b) => a.value - b.value) : defaultPieces(currency);
}

function pieceDefFrom(entry: unknown, currency: Currency): PieceDef | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  const value = Number(e.value);
  if (!Number.isInteger(value) || value <= 0) return null;
  const base = newPiece(value, currency, e.kind === "coin" || e.kind === "note" ? e.kind : undefined);
  const color = typeof e.color === "string" ? e.color.trim() : "";
  const count = e.count === null || e.count === undefined || e.count === "" ? null : Number(e.count);
  return {
    value,
    kind: base.kind,
    color: isMetal(color) && base.kind === "coin" ? color : isHexColor(color) ? color.toLowerCase() : base.color,
    offered: e.offered !== false && e.offered !== "false",
    count: count !== null && Number.isInteger(count) && count >= 0 ? count : null,
  };
}

/** The `pieces` setting: the coins and notes as JSON, small to large, every field written. */
export const serializePieces = (defs: PieceDef[]) =>
  JSON.stringify([...defs].sort((a, b) => a.value - b.value).map(({ value, kind, color, offered, count }) => ({ value, kind, color, offered, count })));

/** The coin or note of this value (one that is not in the list: as a new one would look). */
export const defOf = (pieces: PieceDef[], value: number, currency: Currency): PieceDef => pieces.find((p) => p.value === value) ?? newPiece(value, currency);

/** A coin or note can have this value in the currency: above 0, and whole units without a minor unit. */
export const isPossibleValue = (value: number, currency: Currency) => Number.isInteger(value) && value > 0 && (hasMinor(currency) || value % 100 === 0);

// ---- piles of money ----

/** How many of each coin and note, by its value in hundredths: { "500": 1, "200": 1, "20": 1, "10": 1, "5": 1 }. */
export type Counts = Record<string, number>;
/** A coin or note the candidate can take, and how many there are (null: as many as needed). */
export type Stock = { value: number; limit: number | null };
/** The coins and notes the candidate can take, from large to small. */
export type Supply = Stock[];

/** The supply: the coins and notes that are offered, with their counts, large to small. */
export const supplyOf = (defs: PieceDef[]): Supply =>
  defs
    .filter((d) => d.offered && d.count !== 0)
    .map((d) => ({ value: d.value, limit: d.count }))
    .sort((a, b) => b.value - a.value);

/**
 * A list of coins and notes as an author writes it, separated by ";": "10; 2x 2; 0,50; 3x 0,20" (or "50p", "25¢"). A
 * count in front ("3x 0,20", "3 × 0,20", "3*0,20") is that many of them. What is not one of the coins and notes of the
 * currency (offered or not) is left out, in `invalid`.
 */
export function parsePieces(text: string | undefined | null, currency: Currency = EUR, defs: PieceDef[] = defaultPieces(currency)): { counts: Counts; invalid: string[] } {
  const counts: Counts = {};
  const invalid: string[] = [];
  for (const part of String(text ?? "").split(";")) {
    const entry = part.trim();
    if (!entry) continue;
    const match = /^(\d+)\s*[x×*]\s*(.+)$/i.exec(entry);
    const count = match ? Number(match[1]) : 1;
    const value = parseAmount(match ? match[2] : entry, currency);
    if (value === null || !defs.some((d) => d.value === value) || count === 0) {
      invalid.push(entry);
      continue;
    }
    counts[value] = (counts[value] ?? 0) + count;
  }
  return { counts, invalid };
}

/** The value of a pile of money, in hundredths. */
export const totalOf = (counts: Counts) => Object.entries(counts).reduce((sum, [value, count]) => sum + Number(value) * count, 0);
/** How many coins and notes a pile is. */
export const pieceCount = (counts: Counts) => Object.values(counts).reduce((sum, count) => sum + count, 0);
/** The coins and notes of a pile one by one, from large to small: { "200": 2, "5": 1 } → [200, 200, 5]. */
export const piecesOf = (counts: Counts) =>
  Object.entries(counts)
    .map(([value, count]) => [Number(value), count] as const)
    .sort((a, b) => b[0] - a[0])
    .flatMap(([value, count]) => Array<number>(Math.max(0, count)).fill(value));
/** The same pile without the zeros (and without what is not a value): for comparing and saving. */
export function clean(counts: Counts): Counts {
  const out: Counts = {};
  for (const [key, count] of Object.entries(counts)) {
    const value = Number(key);
    if (Number.isInteger(value) && value > 0 && Number.isInteger(count) && count > 0) out[value] = count;
  }
  return out;
}
/** How many of this coin or note are left in the supply when `counts` is on the counter (Infinity: as many as needed). */
export function left(supply: Supply, counts: Counts, value: number): number {
  const stock = supply.find((s) => s.value === value);
  if (!stock) return 0;
  return stock.limit === null ? Infinity : Math.max(0, stock.limit - (counts[value] ?? 0));
}

/**
 * The fewest coins and notes that make `amount` from the supply, respecting its limits. Null when it can not be made
 * (no 1 and 2 cent for € 7,33, or not enough of them). The euro is "canonical" (always the largest coin that fits gives
 * the fewest), but not every supply is: without 10 cent, 60 cent is 3 × 20, not 50 + ?; with only one € 2, € 4 is
 * 2 + 1 + 1; with 1, 10 and 25, 30 is 3 × 10. So this searches, largest first, and stops a branch that can no longer
 * beat the best so far.
 */
export function fewestPieces(amount: number, supply: Supply): Counts | null {
  if (!Number.isInteger(amount) || amount < 0) return null;
  if (amount === 0) return {};
  const stocks = [...supply].filter((s) => s.value > 0 && (s.limit === null || s.limit > 0)).sort((a, b) => b.value - a.value);
  const n = stocks.length;
  // what the rest of the supply can still pay at most, and the gcd of the rest: two cheap reasons to stop a branch
  const reach: number[] = Array(n + 1).fill(0);
  const divisor: number[] = Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    const { value, limit } = stocks[i];
    reach[i] = limit === null || reach[i + 1] === Infinity ? Infinity : reach[i + 1] + value * limit;
    divisor[i] = gcd(divisor[i + 1], value);
  }
  let best = Infinity;
  let bestCounts: number[] | null = null;
  const current: number[] = Array(n).fill(0);
  let steps = 0;
  const search = (i: number, rest: number, used: number) => {
    if (rest === 0) {
      if (used < best) {
        best = used;
        bestCounts = [...current];
      }
      return;
    }
    if (i >= n || rest > reach[i] || rest % divisor[i] !== 0) return;
    if (++steps > 200_000) return; // a safety net; the bounds below keep real searches far below it
    const { value, limit } = stocks[i];
    // at least ceil(rest / value) more pieces: the largest left is this one
    if (used + Math.ceil(rest / value) >= best) return;
    const most = Math.min(Math.floor(rest / value), limit ?? Infinity);
    for (let count = most; count >= 0; count--) {
      const after = rest - count * value;
      const next = stocks[i + 1]?.value;
      // fewer of this one only means more of the smaller ones: stop when even that bound can not beat the best
      if (after > 0 && next !== undefined && used + count + Math.ceil(after / next) >= best) break;
      if (after > 0 && next === undefined) break; // the smallest one must pay the rest exactly
      current[i] = count;
      search(i + 1, after, used + count);
      current[i] = 0;
    }
  };
  search(0, amount, 0);
  if (!bestCounts) return null;
  const counts: Counts = {};
  stocks.forEach((stock, i) => {
    if (bestCounts![i] > 0) counts[stock.value] = bestCounts![i];
  });
  return clean(counts);
}
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** The fewest coins and notes for `amount` from the supply, or null when it can not be made. */
export const minPieces = (amount: number, supply: Supply) => {
  const fewest = fewestPieces(amount, supply);
  return fewest ? pieceCount(fewest) : null;
};

/**
 * The pile is as few coins and notes as possible for its own value, with the coins and notes of the supply. (Not for
 * the asked amount: a wrong amount in the fewest pieces is still fewest; a score rule combines it with `exact`.)
 */
export function isFewest(counts: Counts, supply: Supply): boolean {
  const total = totalOf(counts);
  if (total === 0) return false;
  const min = minPieces(total, supply);
  return min !== null && pieceCount(counts) === min;
}

// ---- the shopping, for the cash register ----

/**
 * A deal on an item: "2 for € 3" (multi: `count` of them for `price` together, in hundredths) or "−25%" (percent off,
 * a whole number from 1 to 99).
 */
export type Deal = { kind: "multi"; count: number; price: number } | { kind: "percent"; percent: number };
/** How an item is drawn (shop.tsx): plain shapes, the name is always written next to it. */
export type Look = "box" | "carton" | "bottle" | "can" | "jar" | "bag" | "bread" | "fruit";
export const LOOKS: Look[] = ["box", "carton", "bottle", "can", "jar", "bag", "bread", "fruit"];

/**
 * An item the customer buys (the `items` setting, as JSON):
 * - code: the article code the pupil can type on the till (digits, at most 6)
 * - name: as written on the item and on the receipt
 * - price: of one, in hundredths of the main unit (115 is € 1,15)
 * - quantity: how many the customer buys
 * - deal: a deal on it, or null
 * - look: how it is drawn
 */
export type ShopItem = { code: string; name: string; price: number; quantity: number; deal: Deal | null; look: Look };

/** The most of one item, and the longest code. */
export const MAX_QUANTITY = 99;
export const isCode = (code: string) => /^\d{1,6}$/.test(code);

/** The shopping when the author has not set any: milk (2 for 2,00), bread, apples and cheese (−25%). */
export function defaultItems(language: string = "en"): ShopItem[] {
  const nl = language.slice(0, 2) === "nl";
  return [
    { code: "101", name: nl ? "Melk" : "Milk", price: 115, quantity: 2, deal: { kind: "multi", count: 2, price: 200 }, look: "carton" },
    { code: "102", name: nl ? "Brood" : "Bread", price: 245, quantity: 1, deal: null, look: "bread" },
    { code: "103", name: nl ? "Appel" : "Apple", price: 45, quantity: 3, deal: null, look: "fruit" },
    { code: "104", name: nl ? "Kaas" : "Cheese", price: 360, quantity: 1, deal: { kind: "percent", percent: 25 }, look: "box" },
  ];
}

/**
 * The shopping from the `items` setting (JSON, as the authoring mode writes it). Empty, or nothing usable in it: the
 * default shopping in the language of the item. An item without a price that is a whole number above 0 is left out and
 * counted in `invalid`; a code that is not 1 to 6 digits, a quantity that is not 1 to 99 or a deal that is not possible
 * gets the default (101, 102, …; 1; none).
 */
export function parseItems(text: string | undefined | null, language: string = "en"): { items: ShopItem[]; invalid: number } {
  let raw: unknown;
  try {
    raw = JSON.parse(String(text ?? "").trim() || "null");
  } catch {
    raw = null;
  }
  if (!Array.isArray(raw) || raw.length === 0) return { items: defaultItems(language), invalid: 0 };
  const items: ShopItem[] = [];
  let invalid = 0;
  raw.forEach((entry, i) => {
    const item = itemFrom(entry, i, language);
    if (item) items.push(item);
    else invalid++;
  });
  return { items, invalid };
}

function itemFrom(entry: unknown, index: number, language: string): ShopItem | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  const price = Number(e.price);
  if (!Number.isInteger(price) || price <= 0) return null;
  const code = String(e.code ?? "").trim();
  const quantity = Number(e.quantity ?? 1);
  const name = String(e.name ?? "").trim();
  return {
    code: isCode(code) ? code : String(101 + index),
    name: name || `${language.slice(0, 2) === "nl" ? "Artikel" : "Item"} ${index + 1}`,
    price,
    quantity: Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_QUANTITY ? quantity : 1,
    deal: dealFrom(e.deal),
    look: LOOKS.includes(e.look as Look) ? (e.look as Look) : "box",
  };
}

function dealFrom(raw: unknown): Deal | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (d.kind === "multi") {
    const count = Number(d.count);
    const price = Number(d.price);
    return Number.isInteger(count) && count >= 2 && count <= MAX_QUANTITY && Number.isInteger(price) && price > 0 ? { kind: "multi", count, price } : null;
  }
  if (d.kind === "percent") {
    const percent = Number(d.percent);
    return Number.isInteger(percent) && percent >= 1 && percent <= 99 ? { kind: "percent", percent } : null;
  }
  return null;
}

/** The `items` setting: the shopping as JSON, every field written. */
export const serializeItems = (items: ShopItem[]) =>
  JSON.stringify(items.map(({ code, name, price, quantity, deal, look }) => ({ code, name, price, quantity, deal, look })));

/**
 * What `quantity` of an item cost together, with its deal, in hundredths: 3 at 1,15 with "2 for 2,00" is 2,00 + 1,15;
 * 3 at 0,45 with −25% is 1,35 − 0,34 (1,0125 rounded half up to 1,01). The discount is taken off the line, not off
 * each one, as a till does.
 */
export function lineValue(price: number, quantity: number, deal: Deal | null): number {
  if (deal?.kind === "multi") return Math.floor(quantity / deal.count) * deal.price + (quantity % deal.count) * price;
  if (deal?.kind === "percent") return Math.floor((2 * quantity * price * (100 - deal.percent) + 100) / 200);
  return quantity * price;
}

/** The cash rounding of the `cashRounding` setting, in hundredths: 1 (none), 5, 10, 50 or 100. */
export const ROUNDINGS = [1, 5, 10, 50, 100];
export const parseRounding = (setting: string | undefined) => (ROUNDINGS.includes(Number(setting)) ? Number(setting) : 1);
/**
 * An amount rounded for cash to `step` hundredths, half up: to 5 cent (Dutch practice) 7,33 → 7,35, 7,32 → 7,30,
 * 7,38 → 7,40. Never below the step for an amount above 0.
 */
export function cashRound(cents: number, step: number): number {
  if (step <= 1) return cents;
  const rounded = Math.floor((2 * cents + step) / (2 * step)) * step;
  return cents > 0 && rounded === 0 ? step : rounded;
}

/** What the shopping costs: the number of items, their value with the deals, and what the customer pays (rounded for cash). */
export function shoppingTotals(items: ShopItem[], rounding: number) {
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const value = items.reduce((sum, item) => sum + lineValue(item.price, item.quantity, item.deal), 0);
  return { count, value, toPay: cashRound(value, rounding) };
}

// ---- the task, from the settings ----

export type Task = "pay" | "fewest" | "change" | "changeFewest" | "count" | "register";
export const TASKS: Task[] = ["pay", "fewest", "change", "changeFewest", "count", "register"];

export type Settings = CurrencySettings & {
  task?: string;
  amount?: string;
  given?: string;
  countPieces?: string;
  pieces?: string;
  items?: string;
  tillCalculates?: string;
  fewestChange?: string;
  cashRounding?: string;
  language?: string;
};

/**
 * The cash register: the shopping on the counter, whether the till calculates the total and the change (or the pupil
 * does), whether the change must be the fewest pieces, the cash rounding, and what the shopping comes to.
 */
export type Register = {
  items: ShopItem[];
  /** Items of the setting that could not be read (no price). */
  invalid: number;
  tillCalculates: boolean;
  fewestChange: boolean;
  /** Cash rounding in hundredths: 1 (none), 5, 10, 50, 100. */
  rounding: number;
  /** How many items the customer buys (all quantities together). */
  count: number;
  /** What they cost with the deals, before the cash rounding. */
  value: number;
  /** What the customer pays: the value rounded for cash. */
  toPay: number;
};

export function registerFrom(settings: Settings): Register {
  const { items, invalid } = parseItems(settings.items, settings.language);
  const rounding = parseRounding(settings.cashRounding);
  return { items, invalid, tillCalculates: settings.tillCalculates !== "false", fewestChange: settings.fewestChange === "true", rounding, ...shoppingTotals(items, rounding) };
}

export type TaskModel = {
  task: Task;
  currency: Currency;
  /** Every coin and note of the currency, offered or not, small to large. */
  pieces: PieceDef[];
  /** pay, fewest: the amount to pay; change: the price; count: the money on the counter. */
  price: number | null;
  /** change: what the customer gives (the author's coins and notes). */
  given: Counts;
  /** count: the money on the counter, given and fixed. */
  counter: Counts;
  /** What the author wrote in `given` (change) or `countPieces` (count) that is not a coin or note of the currency. */
  invalid: string[];
  /** The coins and notes the candidate can take. */
  supply: Supply;
  /**
   * What the candidate must put on the counter (pay, fewest), give back (change, register) or write (count); null: no
   * task.
   */
  asked: number | null;
  /** register: the shopping and the till; null for the other tasks. */
  register: Register | null;
};

export const parseTask = (task: string | undefined): Task => (TASKS.includes(task as Task) ? (task as Task) : "pay");
export const isChange = (task: Task) => task === "change" || task === "changeFewest";
export const asksFewest = (task: Task) => task === "fewest" || task === "changeFewest";
/** The customer pays with money of the author's (`given`): change and the register. */
export const customerPays = (task: Task) => isChange(task) || task === "register";

/** What the settings ask. */
export function taskFrom(settings: Settings): TaskModel {
  const task = parseTask(settings.task);
  const currency = currencyFrom(settings);
  const pieces = parsePieceDefs(settings.pieces, currency);
  const supply = supplyOf(pieces);
  const money = customerPays(task) ? parsePieces(settings.given, currency, pieces) : task === "count" ? parsePieces(settings.countPieces, currency, pieces) : null;
  const given = customerPays(task) ? clean(money!.counts) : {};
  const counter = task === "count" ? clean(money!.counts) : {};
  const register = task === "register" ? registerFrom(settings) : null;
  // the register: the price is what the shopping comes to (no items: no price)
  const price = task === "count" ? null : register ? (register.items.length ? register.toPay : null) : parseAmount(settings.amount, currency);
  let asked: number | null = null;
  if (task === "count") asked = pieceCount(counter) > 0 ? totalOf(counter) : null;
  else if (customerPays(task)) asked = price !== null && pieceCount(given) > 0 && totalOf(given) >= price ? totalOf(given) - price : null;
  else asked = price !== null && price > 0 ? price : null;
  return { task, currency, pieces, price, given, counter, invalid: money?.invalid ?? [], supply, asked, register };
}

/** What can be wrong with the settings: the keys of the problems in texts.ts. */
export type Problem =
  | "noSign"
  | "badValue"
  | "duplicate"
  | "noPieces"
  | "unknownPieces"
  | "noAmount"
  | "noGiven"
  | "givenTooLittle"
  | "noCounter"
  | "cannotPay"
  | "noItems"
  | "badItems"
  | "duplicateCode"
  | "cannotChange";

/**
 * What is wrong with the shopping of the register: no items, an item that can not be read (no price), two items with
 * the same code (the till would not know which one).
 */
export function itemsProblems(register: Pick<Register, "items" | "invalid">): Problem[] {
  const problems: Problem[] = [];
  if (register.invalid > 0) problems.push("badItems");
  if (register.items.length === 0 && register.invalid === 0) problems.push("noItems");
  if (new Set(register.items.map((i) => i.code)).size !== register.items.length) problems.push("duplicateCode");
  return problems;
}

/**
 * What is wrong with the coins and notes themselves (the authoring mode): a currency of the author's without a sign, a
 * value that is not possible (0, or not whole without a minor unit), a value twice, nothing to take from the supply.
 */
export function piecesProblems(defs: PieceDef[], currency: Currency, task: Task = "pay"): Problem[] {
  const problems: Problem[] = [];
  if (currency.code === "custom" && currency.sign === "") problems.push("noSign");
  if (defs.some((d) => !isPossibleValue(d.value, currency))) problems.push("badValue");
  if (new Set(defs.map((d) => d.value)).size !== defs.length) problems.push("duplicate");
  if (task !== "count" && supplyOf(defs).length === 0) problems.push("noPieces");
  return problems;
}

/**
 * What is wrong with the settings, for the author (an empty list: nothing). The keys of TEXTS (texts.ts), so the PCI
 * says it in the language of the item.
 */
export function settingsProblems(model: TaskModel): Problem[] {
  const { task, price, given, counter, supply, asked, invalid, currency, register } = model;
  const problems: Problem[] = currency.code === "custom" && currency.sign === "" ? ["noSign"] : [];
  if (invalid.length) problems.push("unknownPieces");
  if (task === "count") return pieceCount(counter) === 0 && !invalid.length ? [...problems, "noCounter"] : problems;
  if (register) problems.push(...itemsProblems(register));
  if (supply.length === 0) return [...problems, "noPieces"];
  if (register && register.items.length === 0) return problems;
  if (price === null || (price === 0 && !customerPays(task))) return [...problems, "noAmount"];
  if (customerPays(task) && pieceCount(given) === 0) return invalid.length ? problems : [...problems, "noGiven"];
  if (customerPays(task) && totalOf(given) < price) return [...problems, "givenTooLittle"];
  if (asked !== null && asked > 0 && fewestPieces(asked, supply) === null) return [...problems, register ? "cannotChange" : "cannotPay"];
  return problems;
}

/**
 * What keeps the authoring mode from finishing: the problems of the coins and notes, and those of the task that the
 * coins and notes cause (the amount can not be paid with what is offered; the customer's money or the money on the
 * counter is not a coin or note of the currency). The task's own settings (no amount yet) are not the pieces' problem.
 */
export function authoringProblems(settings: Settings, defs: PieceDef[]): Problem[] {
  const currency = currencyFrom(settings);
  const task = parseTask(settings.task);
  const own = piecesProblems(defs, currency, task);
  const possible = defs.filter((d) => isPossibleValue(d.value, currency));
  if (possible.length === 0) return own;
  const model = taskFrom({ ...settings, pieces: serializePieces(possible) });
  // the register: the shopping is set in the authoring mode too, so its problems and what the total causes are as well
  const caused = settingsProblems(model).filter((p) => CAUSED.includes(p) || (task === "register" && p === "givenTooLittle"));
  return [...own, ...caused.filter((p) => !own.includes(p))];
}
const CAUSED: Problem[] = ["unknownPieces", "cannotPay", "cannotChange", "noItems", "badItems", "duplicateCode"];

// ---- the response ----

/** A field of a QTI record, as the PCI API has it (QtiRecordItem of @citolab/tspci). */
export type RecordField = { name: string; base: { float?: number; integer?: number; boolean?: boolean } };
export type RecordResponse = { record: RecordField[] };

/** The answer typed in the answer box (count) as hundredths, or null when it is no amount. */
export const answerCents = (answer: string | undefined, currency: Currency = EUR) => parseAmount(answer ?? "", currency);

/**
 * The response: undefined while nothing is answered (an empty counter; an empty answer box, or one without an amount).
 * The fields depend on the task, always in this order, so that match_correct can compare it with correctResponse:
 * - pay, change: amount (in the main unit: euros, dollars, pounds; float), exact
 * - fewest, changeFewest: amount, exact, pieces, fewest
 * - count: answer (main unit, float), exact
 */
export function responseFor(model: TaskModel, tray: Counts, answer: string): RecordResponse | undefined {
  const { task, asked, supply, currency } = model;
  if (task === "count") {
    const cents = answerCents(answer, currency);
    if (cents === null) return undefined;
    return { record: [float("answer", cents), bool("exact", asked !== null && cents === asked)] };
  }
  const pile = clean(tray);
  if (pieceCount(pile) === 0) return undefined;
  const total = totalOf(pile);
  const record = [float("amount", total), bool("exact", asked !== null && total === asked)];
  if (asksFewest(task)) record.push({ name: "pieces", base: { integer: pieceCount(pile) } }, bool("fewest", isFewest(pile, supply)));
  return { record };
}

/**
 * The correct response for the settings (getCorrectResponse): the asked amount, exact, and in the fewest pieces where
 * the task asks for it. Undefined when the settings ask nothing that can be paid (no amount, or not with this supply).
 */
export function correctFor(model: TaskModel): RecordResponse | undefined {
  const { task, asked, supply, register } = model;
  if (asked === null) return undefined;
  if (task === "count") return { record: [float("answer", asked), bool("exact", true)] };
  if (register) {
    if (settingsProblems(model).length) return undefined;
    return registerRecord({
      itemsRungUp: register.count,
      itemsTotal: register.value,
      total: register.toPay,
      totalCorrect: true,
      paid: totalOf(model.given),
      change: asked,
      changeCorrect: true,
      fewest: true,
      correct: true,
    });
  }
  const fewest = fewestPieces(asked, supply);
  if (!fewest || asked === 0) return undefined;
  const record = [float("amount", asked), bool("exact", true)];
  if (asksFewest(task)) record.push({ name: "pieces", base: { integer: pieceCount(fewest) } }, bool("fewest", true));
  return { record };
}

const float = (name: string, cents: number): RecordField => ({ name, base: { float: toMajor(cents) } });
const bool = (name: string, value: boolean): RecordField => ({ name, base: { boolean: value } });

/** The fields of the register's response, amounts in hundredths. */
export type RegisterFields = {
  /** How many items were rung up (all quantities together). */
  itemsRungUp: number;
  /** What the items rung up cost, with their deals (before the cash rounding). */
  itemsTotal: number;
  /** The total on the till: the till's (calculated and rounded) or the one the pupil keyed in; 0 before Total. */
  total: number;
  totalCorrect: boolean;
  /** What the pupil keyed in as paid by the customer; 0 before Cash. */
  paid: number;
  /** The money the pupil gave back (on the counter). */
  change: number;
  changeCorrect: boolean;
  fewest: boolean;
  correct: boolean;
};

/** The register's record, always in this order, so that match_correct can compare it with the correct response. */
export const registerRecord = (f: RegisterFields): RecordResponse => ({
  record: [
    { name: "itemsRungUp", base: { integer: f.itemsRungUp } },
    float("itemsTotal", f.itemsTotal),
    float("total", f.total),
    bool("totalCorrect", f.totalCorrect),
    float("paid", f.paid),
    float("change", f.change),
    bool("changeCorrect", f.changeCorrect),
    bool("fewest", f.fewest),
    bool("correct", f.correct),
  ],
});

/**
 * A response read back (setResponse, boundTo, a correct response in status "solution"): the amount (amount, or answer
 * for count) in hundredths, and the number of pieces when it is there. A record, a plain float, or a list of either.
 */
export function readResponse(value: unknown, currency: Currency = EUR): { cents: number | null; pieces: number | null } {
  if (Array.isArray(value)) return readResponse(value[0], currency);
  if (value && typeof value === "object") {
    const { record, base } = value as { record?: unknown; base?: Record<string, unknown> };
    if (Array.isArray(record)) {
      const fields = record as { name?: string; base?: Record<string, unknown>; value?: unknown }[];
      const of = (name: string) => fields.find((f) => f?.name === name);
      const amount = of("amount") ?? of("answer");
      const pieces = of("pieces");
      const cents = amount ? readResponse(amount.base ?? amount.value, currency).cents : null;
      const count = pieces ? Number(pieces.base?.integer ?? pieces.value) : NaN;
      return { cents, pieces: Number.isInteger(count) ? count : null };
    }
    if (base) return readResponse(base, currency);
    const plain = value as Record<string, unknown>;
    return readResponse(plain.float ?? plain.integer ?? plain.string ?? plain.value, currency);
  }
  if (typeof value === "number" && Number.isFinite(value)) return { cents: toCents(value), pieces: null };
  if (typeof value === "string") {
    const n = Number(value);
    return { cents: value.trim() !== "" && Number.isFinite(n) ? toCents(n) : parseAmount(value, currency), pieces: null };
  }
  return { cents: null, pieces: null };
}

/**
 * The register's response read back (setResponse, boundTo, a correct response in status "solution"): its fields, the
 * amounts in hundredths. Null when it is not a record of the register.
 */
export function readRegister(value: unknown): Pick<RegisterFields, "itemsRungUp" | "itemsTotal" | "total" | "paid" | "change"> | null {
  if (Array.isArray(value)) return readRegister(value[0]);
  const record = (value as { record?: unknown })?.record;
  if (!Array.isArray(record)) return null;
  const fields = record as { name?: string; base?: Record<string, unknown>; value?: unknown }[];
  const number = (name: string) => {
    const field = fields.find((f) => f?.name === name);
    const raw = field ? Number(field.base?.float ?? field.base?.integer ?? field.value) : NaN;
    return Number.isFinite(raw) && raw >= 0 ? raw : 0;
  };
  if (!fields.some((f) => f?.name === "itemsRungUp" || f?.name === "change")) return null;
  return {
    itemsRungUp: Math.round(number("itemsRungUp")),
    itemsTotal: toCents(number("itemsTotal")),
    total: toCents(number("total")),
    paid: toCents(number("paid")),
    change: toCents(number("change")),
  };
}

/**
 * The money to put on the counter for a response read back: the response says how much (and how many pieces), not
 * which ones, so this is the fewest pieces for that amount from the supply. Null when the supply can not make it.
 */
export const pileFor = (cents: number, supply: Supply): Counts | null => (cents > 0 ? fewestPieces(cents, supply) : null);
