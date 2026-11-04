// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Broncopci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// Numbers as the candidate reads them: a decimal point in English, a decimal comma in Dutch and French.
// Only a type import: `npm test` runs it in node.

import type { Language } from "./settings";

/** 6.25 with 1 decimal → "6.3" (en) or "6,3" (nl, fr). */
export const formatNumber = (value: number, decimals: number, language: Language): string => {
  if (!isFinite(value)) return "–";
  let text = value.toFixed(Math.max(0, Math.min(20, decimals)));
  if (/^-0(\.0*)?$/.test(text)) text = text.slice(1);
  text = text.replace("-", "−");
  return language === "en" ? text : text.replace(".", ",");
};

/** A percentage: "25%" (en, nl), "25 %" with a narrow no-break space (fr). */
export const formatPercent = (value: number, decimals: number, language: Language): string =>
  formatNumber(value, decimals, language) + (language === "fr" ? " %" : "%");

/** "10,5", "10.5", " 7 ", "−3" → a number; anything else null. */
export const parseNumber = (text: string | number | undefined | null): number | null => {
  if (typeof text === "number") return isFinite(text) ? text : null;
  if (text === undefined || text === null) return null;
  const clean = String(text).trim().replace(/−/g, "-").replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(clean)) return null;
  const value = Number(clean);
  return isFinite(value) ? value : null;
};
