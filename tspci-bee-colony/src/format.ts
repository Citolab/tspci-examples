// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Abeillepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// Numbers as the candidate reads and types them: 80,000 (en), 80.000 (nl), 80 000 (fr, a narrow no-break space);
// a decimal point in English, a decimal comma in Dutch and French. Only type imports: `npm test` runs it in node.
import type { Language } from "./settings";

const GROUP: Record<Language, string> = { en: ",", nl: ".", fr: " " };
const DECIMAL: Record<Language, string> = { en: ".", nl: ",", fr: "," };

/** 80000 → "80,000" (en), "80.000" (nl), "80 000" (fr); −1500.5 with 1 decimal → "−1,500.5". */
export const formatNumber = (value: number, language: Language, decimals = 0): string => {
  if (!isFinite(value)) return "–";
  const fixed = Math.abs(value).toFixed(Math.max(0, Math.min(6, decimals)));
  const [whole, fraction] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP[language]);
  const sign = value < 0 && Number(fixed) !== 0 ? "−" : "";
  return sign + grouped + (fraction ? DECIMAL[language] + fraction : "");
};

/**
 * What the candidate typed → a number, read the way their language writes it: "60 000", "60.000" and "60000,5" in
 * Dutch and French, "60,000" and "60000.5" in English; a lone separator followed by exactly three digits is a thousands
 * separator in every language ("60.000" and "60,000" are 60000). Anything else: null.
 */
export const parseAnswer = (text: string, language: Language): number | null => {
  let clean = String(text ?? "").trim().replace(/[\s  ']/g, "").replace(/−/g, "-");
  if (!clean) return null;
  if (/^[-+]?\d{1,3}([.,]\d{3})+$/.test(clean) && !/^[-+]?0[.,]/.test(clean)) {
    clean = clean.replace(/[.,]/g, "");
  } else if (language === "en") {
    clean = clean.replace(/,/g, "");
  } else {
    clean = clean.replace(/\./g, "").replace(",", ".");
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(clean)) return null;
  const value = Number(clean);
  return isFinite(value) ? value : null;
};
