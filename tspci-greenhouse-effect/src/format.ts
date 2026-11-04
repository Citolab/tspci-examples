// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/EffetDeSerrepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// Numbers as the candidate reads them: a decimal point in English, a decimal comma in Dutch and French, and a real
// minus sign. No imports: `npm test` runs it in node.

/** 14.96 with 1 decimal → "15.0" (en) or "15,0" (nl, fr); -3 → "−3". */
export const formatNumber = (value: number, decimals: number, language: string): string => {
  if (!isFinite(value)) return "–";
  let text = value.toFixed(Math.max(0, Math.min(20, decimals)));
  if (/^-0(\.0*)?$/.test(text)) text = text.slice(1); // no "-0.0"
  text = text.replace("-", "−");
  return language === "en" ? text : text.replace(".", ",");
};
