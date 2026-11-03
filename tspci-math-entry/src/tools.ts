// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/oat-sa/extension-tao-itemqti-pci/tree/develop/views/js/pciCreator/ims/mathEntryInteraction,
// © 2016-2022 Open Assessment Technologies SA (Christophe Noël)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The toolbar buttons of the original mathEntryInteraction, in its groups and order. Every tool is a setting
// (data-tool_frac="true", ...) under the original's name, so items made for the original keep their toolbar.
// `insert` is what MathLive inserts: #@ is the selection (or what is left of the cursor), #? an empty slot.

export type ToolId =
  | "sqrt" | "frac" | "exp" | "subscript" | "log" | "ln" | "limit" | "sum" | "nthroot"
  | "e" | "infinity" | "lparen" | "rparen" | "lbrace" | "rbrace" | "lbrack" | "rbrack" | "integral" | "colon" | "to" | "degree" | "percent"
  | "angle" | "triangle" | "similar" | "paral" | "perp" | "vline"
  | "pi" | "sin" | "cos" | "tan"
  | "lower" | "greater" | "lte" | "gte" | "approx"
  | "equal" | "plus" | "minus" | "times" | "timesdot" | "divide" | "plusminus" | "inmem" | "ninmem" | "union" | "intersec" | "congruent" | "subset" | "superset" | "contains"
  | "matrix_2row" | "matrix_2row_2col";

export type GroupId = "functions" | "symbols" | "geometry" | "trigo" | "comparison" | "operands" | "matrix";

export type Tool = {
  id: ToolId;
  /** The text on the button; the special ones (fraction, matrices) are drawn in interaction.tsx. */
  label: string;
  /** The LaTeX on the virtual keyboard's keycap. */
  keycap: string;
  /** The LaTeX MathLive inserts. */
  insert: string;
};

const t = (id: ToolId, label: string, insert: string, keycap = insert): Tool => ({ id, label, insert, keycap });

export const tools: Record<ToolId, Tool> = Object.fromEntries([
  t("sqrt", "√x", "\\sqrt{#@}", "\\sqrt{\\square}"),
  t("frac", "x/y", "\\frac{#@}{#?}", "\\frac{\\square}{\\square}"),
  t("exp", "xⁿ", "#@^{#?}", "\\square^{n}"),
  t("subscript", "xₙ", "#@_{#?}", "\\square_{n}"),
  t("log", "log", "\\log", "\\log"),
  t("ln", "ln", "\\ln", "\\ln"),
  t("limit", "lim", "\\lim_{#?}", "\\lim"),
  t("sum", "∑", "\\sum_{#?}^{#?}", "\\sum"),
  t("nthroot", "ⁿ√x", "\\sqrt[#?]{#@}", "\\sqrt[n]{\\square}"),
  t("e", "e", "\\mathrm{e}"),
  t("infinity", "∞", "\\infty"),
  t("lparen", "(", "("),
  t("rparen", ")", ")"),
  t("lbrace", "{", "\\lbrace", "\\lbrace"),
  t("rbrace", "}", "\\rbrace", "\\rbrace"),
  t("lbrack", "[", "\\lbrack", "\\lbrack"),
  t("rbrack", "]", "\\rbrack", "\\rbrack"),
  t("integral", "∫", "\\int", "\\int"),
  t("colon", ":", ":"),
  t("to", "→", "\\to"),
  t("degree", "°", "\\degree"),
  t("percent", "%", "\\%"),
  t("angle", "∠", "\\angle"),
  t("triangle", "△", "\\triangle"),
  t("similar", "∼", "\\sim"),
  t("paral", "∥", "\\parallel"),
  t("perp", "⊥", "\\perp"),
  t("vline", "|", "\\mid"),
  t("pi", "π", "\\pi"),
  t("sin", "sin", "\\sin"),
  t("cos", "cos", "\\cos"),
  t("tan", "tan", "\\tan"),
  t("lower", "<", "<"),
  t("greater", ">", ">"),
  t("lte", "≤", "\\le"),
  t("gte", "≥", "\\ge"),
  t("approx", "≈", "\\approx"),
  t("equal", "=", "="),
  t("plus", "+", "+"),
  t("minus", "–", "-"),
  t("times", "×", "\\times"),
  t("timesdot", "·", "\\cdot"),
  t("divide", "÷", "\\div"),
  t("plusminus", "±", "\\pm"),
  t("inmem", "∈", "\\in"),
  t("ninmem", "∉", "\\notin"),
  t("union", "∪", "\\cup"),
  t("intersec", "∩", "\\cap"),
  t("congruent", "≅", "\\cong"),
  t("subset", "⊂", "\\subset"),
  t("superset", "⊃", "\\supset"),
  t("contains", "∋", "\\ni"),
  t("matrix_2row", "2×1", "\\begin{matrix}#?\\\\#?\\end{matrix}", "\\begin{matrix}\\square\\\\\\square\\end{matrix}"),
  t("matrix_2row_2col", "2×2", "\\begin{matrix}#?&#?\\\\#?&#?\\end{matrix}", "\\begin{matrix}\\square&\\square\\\\\\square&\\square\\end{matrix}"),
].map((tool) => [tool.id, tool])) as Record<ToolId, Tool>;

/** The groups of the toolbar, in the original's order. */
export const groups: { id: GroupId; tools: ToolId[] }[] = [
  { id: "functions", tools: ["sqrt", "frac", "exp", "subscript", "log", "ln", "limit", "sum", "nthroot"] },
  { id: "symbols", tools: ["e", "infinity", "lparen", "rparen", "lbrace", "rbrace", "lbrack", "rbrack", "integral", "colon", "to", "degree", "percent"] },
  { id: "geometry", tools: ["angle", "triangle", "similar", "paral", "perp", "vline"] },
  { id: "trigo", tools: ["pi", "sin", "cos", "tan"] },
  { id: "comparison", tools: ["lower", "greater", "lte", "gte", "approx"] },
  { id: "operands", tools: ["equal", "plus", "minus", "times", "timesdot", "divide", "plusminus", "inmem", "ninmem", "union", "intersec", "congruent", "subset", "superset", "contains"] },
  { id: "matrix", tools: ["matrix_2row", "matrix_2row_2col"] },
];
