// Numbers as the candidate reads and types them: a decimal point in English, a decimal comma in Dutch, a real minus
// sign; and the reading of a ruler (between two tick marks). No imports: `npm test` runs it in node.

export type Language = "en" | "nl";

/** "nl", "nl-NL", "NL" → nl; anything else en. */
export const languageOf = (language: string | undefined): Language => ((language ?? "").slice(0, 2).toLowerCase() === "nl" ? "nl" : "en");

/** 3.4176 with 2 decimals → "3.42" (en) or "3,42" (nl); -3 → "−3". No thousands separators. */
export const formatNumber = (value: number, decimals: number, language: Language): string => {
  if (!isFinite(value)) return "–";
  let text = value.toFixed(Math.max(0, Math.min(10, Math.round(decimals))));
  if (/^-0(\.0*)?$/.test(text)) text = text.slice(1); // no "-0.0"
  text = text.replace("-", "−");
  return language === "nl" ? text.replace(".", ",") : text;
};

/** "3,42", "3.42", " 3 ", "−3", ".5" → a number; anything else (also "3,4,2", "1e3", "") null. */
export const parseNumber = (text: string | number | undefined | null): number | null => {
  if (typeof text === "number") return isFinite(text) ? text : null;
  if (text === undefined || text === null) return null;
  const clean = String(text).trim().replace(/−/g, "-").replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(clean)) return null;
  const value = Number(clean);
  return isFinite(value) ? value : null;
};

/** What a number field takes while the candidate types: digits, one decimal separator, a minus at the start. */
export const acceptableNumberText = (text: string, allowNegative = false): boolean =>
  (allowNegative ? /^[-−]?\d*([.,]\d*)?$/ : /^\d*([.,]\d*)?$/).test(text);

/** The decimals of a step: 0.1 → 1, 0.05 → 2, 5 → 0. */
export const decimalsOf = (step: number): number => {
  if (!isFinite(step) || step <= 0) return 0;
  for (let d = 0; d <= 6; d++) if (Math.abs(Math.round(step * 10 ** d) - step * 10 ** d) < 1e-9) return d;
  return 6;
};

/** Rounds to a number of decimals without 1.005 → 1.00 surprises. */
export const roundTo = (value: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round((value + Math.sign(value) * 1e-12) * f) / f;
};

/**
 * A ruler with a tick every `step`: the ticks just below and above the value (the same tick when the value is on
 * one). The candidate reads between them and rounds.
 */
export const rulerReading = (value: number, step: number): { low: number; high: number } => {
  if (!(step > 0)) return { low: value, high: value };
  const n = value / step;
  const nearest = Math.round(n);
  if (Math.abs(n - nearest) < 1e-6) return { low: nearest * step, high: nearest * step };
  return { low: Math.floor(n) * step, high: Math.ceil(n) * step };
};
