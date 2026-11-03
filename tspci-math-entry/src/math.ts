// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/oat-sa/extension-tao-itemqti-pci/tree/develop/views/js/pciCreator/ims/mathEntryInteraction,
// © 2016-2022 Open Assessment Technologies SA (Christophe Noël)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { ToolId, groups } from "./tools";

// The settings of the original, parsed from the data- attributes (text), and the helpers for its response format.

export type GapSize = "math-gap-small" | "math-gap-medium" | "math-gap-large";

export type Settings = {
  prompt: string;
  language: string;
  /** authorizeWhiteSpace: the space bar types a space (otherwise it is ignored in math). */
  whiteSpace: boolean;
  /** useGapExpression: the candidate fills in the gaps of gapExpression instead of typing a formula. */
  gapMode: boolean;
  /** gapExpression: LaTeX with \taoGap for every gap (and \taoBr for a line break). */
  gapExpression: string;
  gapSize: GapSize;
  /** gapResponseIsJson: the gaps as a JSON array (since the original's v3.0.0), otherwise separated by commas. */
  gapResponseIsJson: boolean;
  /** isReviewMode: show the response, read only. */
  reviewMode: boolean;
  /** The enabled toolbar buttons, in toolbar order. */
  tools: ToolId[];
};

export const allTools: ToolId[] = groups.flatMap((g) => g.tools);

/** "true", true → true; "false", false, "" → false; missing → the default. */
export const toBoolean = (value: unknown, fallback = false) =>
  value === undefined || value === null ? fallback : value === true || value === "true";

export const parseSettings = (p: Record<string, any>): Settings => ({
  prompt: p.prompt ?? "",
  language: p.language ?? "en",
  whiteSpace: toBoolean(p.authorizeWhiteSpace),
  gapMode: toBoolean(p.useGapExpression),
  gapExpression: p.gapExpression ?? "",
  gapSize: (["math-gap-small", "math-gap-medium", "math-gap-large"].includes(p.gapStyle) ? p.gapStyle : "math-gap-small") as GapSize,
  gapResponseIsJson: toBoolean(p.gapResponseIsJson, true),
  reviewMode: toBoolean(p.isReviewMode),
  tools: allTools.filter((id) => toBoolean(p[`tool_${id}`])),
});

/** The original's gap marker in gapExpression, and its line break. */
export const GAP = "\\taoGap";
export const BR = "\\taoBr";

export const gapId = (i: number) => `gap${i}`;

/** The number of gaps in a gap expression. */
export const countGaps = (expression: string) => (expression.match(/\\taoGap(?![a-zA-Z])/g) ?? []).length;

/**
 * gapExpression → what MathLive shows read only: every \taoGap an editable prompt (\placeholder[gap0]{}), and lines
 * broken at \taoBr in a left-aligned array.
 */
export const gapExpressionToMathLive = (expression: string) => {
  let i = 0;
  const withGaps = expression.replace(/\\taoGap(?![a-zA-Z])/g, () => `\\placeholder[${gapId(i++)}]{}`);
  const lines = withGaps.split(/\\taoBr(?![a-zA-Z])/);
  return lines.length > 1 ? `\\begin{array}{l}${lines.map((l) => `\\displaystyle ${l}`).join("\\\\")}\\end{array}` : withGaps;
};

/**
 * MathLive's LaTeX, written the way MathQuill wrote it where they differ, so correct responses written for the
 * original keep matching more often: no \placeholder{} for an empty slot (\frac{1}{}), braces around a root
 * (\sqrt{3}, not \sqrt3), no braces around one character in a super- or subscript (e^x, not e^{x}).
 */
export const normalizeLatex = (latex: string) =>
  (latex ?? "")
    .replace(/\\placeholder(\[[^\]]*\])?\{\}/g, "")
    .replace(/\\sqrt(\[[^\]]*\])?\s*(\\[a-zA-Z]+|[^\s{\\[])/g, "\\sqrt$1{$2}")
    .replace(/([\^_])\{([a-zA-Z0-9])\}/g, "$1$2");

/** Full-width digits and the dashes that look like a minus, as ASCII (the original's ambiguousSymbols helper). */
const ambiguous: Record<string, string> = {
  "０": "0", "１": "1", "２": "2", "３": "3", "４": "4", "５": "5", "６": "6", "７": "7", "８": "8", "９": "9",
  "−": "-", "‐": "-", "―": "-", "-": "-",
};
export const convertAmbiguousSymbols = (text: string) => Array.from(text ?? "").map((c) => ambiguous[c] ?? c).join("");

/** The gaps as the response string: a JSON array, or separated by commas; "" when every gap is empty. */
export const gapsToString = (gaps: string[], json = true) => {
  if (!gaps?.length || !gaps.some((g) => !!g)) return "";
  return json ? JSON.stringify(gaps) : gaps.join(",");
};

/** The response string → the gaps; accepts both formats, like the original. */
export const stringToGaps = (response: string, json = true): string[] => {
  if (!response) return [];
  if (!json) return response.split(",");
  try {
    const parsed = JSON.parse(response);
    return Array.isArray(parsed) ? parsed.map((v) => String(v ?? "")) : response.split(",");
  } catch {
    return response.split(",");
  }
};
