// Numbers as the candidate reads them: a decimal point in English, a decimal comma in Dutch, and a real minus sign.
// No imports: `npm test` runs it in node.

export type Language = "en" | "nl";

/** "nl", "nl-NL", "NL" → nl; anything else en. */
export const languageOf = (language: string | undefined): Language => ((language ?? "").slice(0, 2).toLowerCase() === "nl" ? "nl" : "en");

/** 58.04 with 1 decimal → "58.0" (en) or "58,0" (nl); -3 → "−3". No thousands separators: 1000 stays 1000. */
export const formatNumber = (value: number, decimals: number, language: Language): string => {
  if (value === Infinity) return "∞";
  if (value === -Infinity) return "−∞";
  if (!isFinite(value)) return "–";
  let text = value.toFixed(Math.max(0, Math.min(20, decimals)));
  if (/^-0(\.0*)?$/.test(text)) text = text.slice(1); // no "-0.0"
  text = text.replace("-", "−");
  return language === "nl" ? text.replace(".", ",") : text;
};

/** "58,5", "58.5", " 1e-12 ", "1,2e-12", "−3" → a number; anything else null. */
export const parseNumber = (text: string | number | undefined | null): number | null => {
  if (typeof text === "number") return isFinite(text) ? text : null;
  if (text === undefined || text === null) return null;
  const clean = String(text).trim().replace(/−/g, "-").replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(clean)) return null;
  const value = Number(clean);
  return isFinite(value) ? value : null;
};
