// SPDX-License-Identifier: MIT
// Based on https://github.com/rdncuee/CBP (Code Block Programming Interaction),
// © 2022 The National Center for University Entrance Examinations
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The model of the code blocks: the author's blocks (a line of text per block, with blanks in braces), the program the
// candidate builds from them (a tree), the edits (insert, move, indent, remove), the program as text, the statements
// for the interpreter, the author's test cases and the response. Imports only the interpreter: `npm test` runs it in
// node.

import {
  DEFAULT_MAX_DEPTH, DEFAULT_MAX_STEPS, type Language, type RunError, type Stmt, languageOf, parseInputs, run,
} from "./interpreter.ts";

export { languageOf };
export type { Language };

// ─── blocks ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** What a block does. if/else, while, repeat and for hold other blocks. */
export type Kind = "set" | "input" | "print" | "if" | "ifelse" | "while" | "repeat" | "for";
export const KINDS: Kind[] = ["set", "input", "print", "if", "ifelse", "while", "repeat", "for"];

/** The words an author may write before the colon: "set: {x} ← {0}". */
export const KIND_WORDS: Record<string, Kind> = {
  set: "set", assign: "set", input: "input", read: "input", print: "print", output: "print", write: "print",
  if: "if", ifelse: "ifelse", "if-else": "ifelse", "if/else": "ifelse", while: "while", repeat: "repeat", for: "for",
};

/** The operands of a kind, in the order of the blanks; the last one takes the rest of the blanks (see operands). */
export const ROLES: Record<Kind, string[]> = {
  set: ["name", "expr"], input: ["name"], print: ["expr"], if: ["cond"], ifelse: ["cond"], while: ["cond"], repeat: ["count"],
  for: ["name", "from", "to"],
};

export const isContainer = (kind: Kind) => kind === "if" || kind === "ifelse" || kind === "while" || kind === "repeat" || kind === "for";

/** A blank, or a fixed part of a block: {} a text box, {a|b|c} a dropdown, {x + 1} fixed text. */
export type Slot = { type: "fixed"; text: string } | { type: "text" } | { type: "choice"; options: string[] };
/** The label of a block: text, and the index of a slot where a blank (or a fixed part) is. */
export type Part = string | { slot: number };

export type Block = {
  /** b1, b2 … the author's blocks in order; p1 … blocks only in the starting program; s1 … only in the solution. */
  id: string;
  kind: Kind;
  parts: Part[];
  slots: Slot[];
  /** The line between the two branches of an if/else ("else", "anders", or the author's after |). */
  elseLabel?: string;
  /** In the palette: the candidate can add it. */
  palette: boolean;
};

export const MAX_CHOICES = 10;

/** "if {n} {<|>} {0}" → the parts and the slots; null when a brace is not closed. */
export const parseLabel = (label: string): { parts: Part[]; slots: Slot[] } | null => {
  const parts: Part[] = [];
  const slots: Slot[] = [];
  let i = 0;
  let text = "";
  while (i < label.length) {
    const c = label[i];
    if (c === "{") {
      const end = label.indexOf("}", i + 1);
      if (end < 0) return null;
      if (text) parts.push(text);
      text = "";
      const inner = label.slice(i + 1, end);
      if (inner.trim() === "") slots.push({ type: "text" });
      else if (inner.includes("|")) {
        const options = inner.split("|").map((o) => o.trim()).filter((o) => o !== "").slice(0, MAX_CHOICES);
        slots.push(options.length ? { type: "choice", options } : { type: "text" });
      } else slots.push({ type: "fixed", text: inner.trim() });
      parts.push({ slot: slots.length - 1 });
      i = end + 1;
    } else {
      text += c;
      i++;
    }
  }
  if (text) parts.push(text);
  return { parts, slots };
};

/** The index of the first | outside braces, or -1. */
const topLevelBar = (text: string): number => {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth = Math.max(0, depth - 1);
    else if (text[i] === "|" && depth === 0) return i;
  }
  return -1;
};

const KIND_LINE = /^([a-z/-]+)\s*:\s*(.*)$/i;

/** "set: {total} ← {}" → a block (without its id), or a problem. */
export const parseBlockLine = (line: string, elseWord: string): Omit<Block, "id" | "palette"> | string => {
  const m = KIND_LINE.exec(line.trim());
  const kind = m ? KIND_WORDS[m[1].toLowerCase()] : undefined;
  if (!m || !kind) return `no kind (set, input, print, if, ifelse, while, repeat, for) before a colon: ${line.trim()}`;
  let label = m[2];
  let elseLabel: string | undefined;
  if (kind === "ifelse") {
    const bar = topLevelBar(label);
    elseLabel = elseWord;
    if (bar >= 0) {
      elseLabel = label.slice(bar + 1).trim() || elseWord;
      label = label.slice(0, bar);
    }
  }
  const parsed = parseLabel(label.trim());
  if (!parsed) return `a { without } in: ${line.trim()}`;
  if (parsed.slots.length < ROLES[kind].length) return `${kind} needs ${ROLES[kind].length} part(s) in braces: ${line.trim()}`;
  return { kind, ...parsed, ...(elseLabel !== undefined ? { elseLabel } : {}) };
};

// ─── the program ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** A block in the program: which block, the text of its blanks (one per slot; "" for fixed parts and empty blanks). */
export type Node = {
  id: string;
  block: string;
  values: string[];
  body?: Node[];
  /** The else branch of an if/else. */
  other?: Node[];
  /** In the starting program and locked: the candidate cannot move or remove it (but fills its blanks). */
  locked?: boolean;
};

export type Branch = "body" | "other";
/** Where a block can go: a list (the program, or a branch of a block) and an index in it. */
export type Position = { parent: string | null; branch: Branch; index: number };

export type Test = { inputs: string[]; expected: string[]; source: string };
export type Scoring = "original" | "code" | "pci";

export type Settings = {
  language: Language;
  prompt: string;
  blocks: Record<string, Block>;
  /** The ids of the candidate's blocks, in the author's order. */
  palette: string[];
  start: Node[];
  solution: Node[] | null;
  inputs: string;
  editInputs: boolean;
  reuse: boolean;
  tests: Test[];
  scoring: Scoring;
  maxBlocks: number;
  maxDepth: number;
  maxSteps: number;
  /** What the PCI could not read of the settings, for the author (console). */
  problems: string[];
};

export const MAX_TESTS = 8;
export const MAX_BLOCKS = 60;
export const INDENT = "    ";
export const EMPTY_BLANK = "___";

export const ELSE_WORD: Record<Language, string> = { en: "else", nl: "anders", fr: "sinon" };

// ─── the example ─────────────────────────────────────────────────────────────────────────────────────────────────────

type Example = { prompt: string; blocks: string; program: string; solution: string; inputs: string; tests: string };

export const EXAMPLES: Record<Language, Example> = {
  en: {
    prompt: "Make a program that reads a whole number n and prints the sum 1 + 2 + … + n. Put the blocks in order, fill in the blanks, and try your program with Run.",
    blocks: ["set: {total} ← {}", "for: for {i} from {} to {}", "set: {total} ← {total} {+|-|*} {i}", "print: print {total}", "print: print {i}",
      "while: while {total < n}", "set: {i} ← {i} + {1}"].join("\n"),
    program: "* input: read {n}",
    solution: ["read n", "total ← 0", "for i from 1 to n", "    total ← total + i", "print total"].join("\n"),
    inputs: "5",
    tests: ["5 => 15", "1 => 1", "10 => 55"].join("\n"),
  },
  nl: {
    prompt: "Maak een programma dat een geheel getal n leest en de som 1 + 2 + … + n toont. Zet de blokken in de goede volgorde, vul de open plekken in en probeer je programma met Uitvoeren.",
    blocks: ["set: {totaal} ← {}", "for: voor {i} van {} tot en met {}", "set: {totaal} ← {totaal} {+|-|*} {i}", "print: toon {totaal}",
      "print: toon {i}", "while: zolang {totaal < n}", "set: {i} ← {i} + {1}"].join("\n"),
    program: "* input: lees {n}",
    solution: ["lees n", "totaal ← 0", "voor i van 1 tot en met n", "    totaal ← totaal + i", "toon totaal"].join("\n"),
    inputs: "5",
    tests: ["5 => 15", "1 => 1", "10 => 55"].join("\n"),
  },
  fr: {
    prompt: "Écris un programme qui lit un nombre entier n et affiche la somme 1 + 2 + … + n. Mets les blocs dans l'ordre, remplis les trous et essaie ton programme avec Exécuter.",
    blocks: ["set: {total} ← {}", "for: pour {i} de {} à {}", "set: {total} ← {total} {+|-|*} {i}", "print: afficher {total}",
      "print: afficher {i}", "while: tant que {total < n}", "set: {i} ← {i} + {1}"].join("\n"),
    program: "* input: lire {n}",
    solution: ["lire n", "total ← 0", "pour i de 1 à n", "    total ← total + i", "afficher total"].join("\n"),
    inputs: "5",
    tests: ["5 => 15", "1 => 1", "10 => 55"].join("\n"),
  },
};

// ─── the program as text ─────────────────────────────────────────────────────────────────────────────────────────────

/** The text of a slot in a node: the fixed text, or what the candidate typed or chose ("" when empty). */
export const slotText = (block: Block, node: Node, slot: number): string => {
  const s = block.slots[slot];
  if (!s) return ""; // a block with fewer parts than its kind needs (the authoring mode shows it as a problem)
  return s.type === "fixed" ? s.text : (node.values[slot] ?? "").trim();
};

/** A block line as text: "total ← total + i", with ___ for an empty blank. */
export const lineText = (block: Block, node: Node): string =>
  block.parts
    .map((p) => (typeof p === "string" ? p : slotText(block, node, p.slot) || EMPTY_BLANK))
    .join("")
    .replace(/\s+/g, " ")
    .trim();

/** A line of the listing: a block, or the else of an if/else. Numbered from 1 in the order they are shown. */
export type Line = { node: Node; block: Block; depth: number; isElse: boolean; number: number; text: string };

export const listing = (s: Settings, program: Node[]): Line[] => {
  const lines: Line[] = [];
  const walk = (list: Node[], depth: number) => {
    for (const node of list) {
      const block = s.blocks[node.block];
      if (!block) continue;
      lines.push({ node, block, depth, isElse: false, number: lines.length + 1, text: lineText(block, node) });
      if (isContainer(block.kind)) walk(node.body ?? [], depth + 1);
      if (block.kind === "ifelse") {
        lines.push({ node, block, depth, isElse: true, number: lines.length + 1, text: block.elseLabel ?? ELSE_WORD[s.language] });
        walk(node.other ?? [], depth + 1);
      }
    }
  };
  walk(program, 0);
  return lines;
};

/** The program as readable pseudocode, indented with four spaces per level (the response's code). */
export const programText = (s: Settings, program: Node[]): string =>
  listing(s, program).map((l) => INDENT.repeat(l.depth) + l.text).join("\n");

// ─── statements ──────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The operands of a node, in the order of its kind's roles. Each role takes one blank, the last role takes the rest:
 * "{total} ← {total} {+|-|*} {i}" gives the name "total" and the expression "total + i" (with the text between those
 * blanks). null when one of its blanks is empty.
 */
export const operands = (block: Block, node: Node): (string | null)[] => {
  const roles = ROLES[block.kind];
  const result: (string | null)[] = [];
  for (let r = 0; r < roles.length - 1; r++) result.push(slotText(block, node, r) || null);
  const first = roles.length - 1;
  let text = "";
  let empty = false;
  let inside = false;
  for (const p of block.parts) {
    if (typeof p === "string") {
      if (inside) text += p;
      continue;
    }
    if (p.slot < first) continue;
    inside = true;
    const t = slotText(block, node, p.slot);
    if (!t) empty = true;
    text += t;
    if (p.slot === block.slots.length - 1) break;
  }
  result.push(empty ? null : text.replace(/\s+/g, " ").trim());
  return result;
};

/** The program as statements for the interpreter, each with its line in the listing. */
export const statements = (s: Settings, program: Node[]): Stmt[] => {
  let line = 0;
  const walk = (list: Node[]): Stmt[] => {
    const out: Stmt[] = [];
    for (const node of list) {
      const block = s.blocks[node.block];
      if (!block) continue;
      const at = ++line;
      const o = operands(block, node);
      switch (block.kind) {
        case "set":
          out.push({ kind: "set", line: at, name: o[0], expr: o[1] });
          break;
        case "input":
          out.push({ kind: "input", line: at, name: o[0] });
          break;
        case "print":
          out.push({ kind: "print", line: at, expr: o[0] });
          break;
        case "if":
          out.push({ kind: "if", line: at, cond: o[0], body: walk(node.body ?? []) });
          break;
        case "ifelse": {
          const body = walk(node.body ?? []);
          line++; // the else line
          out.push({ kind: "if", line: at, cond: o[0], body, other: walk(node.other ?? []) });
          break;
        }
        case "while":
          out.push({ kind: "while", line: at, cond: o[0], body: walk(node.body ?? []) });
          break;
        case "repeat":
          out.push({ kind: "repeat", line: at, count: o[0], body: walk(node.body ?? []) });
          break;
        case "for":
          out.push({ kind: "for", line: at, name: o[0], from: o[1], to: o[2], body: walk(node.body ?? []) });
          break;
      }
    }
    return out;
  };
  return walk(program);
};

export type RunOutcome = { output: string[]; error?: RunError };

/** Runs the program with these input values (one per line), as the Run button does. */
export const runProgram = (s: Settings, program: Node[], inputs: string): RunOutcome => {
  const r = run(statements(s, program), parseInputs(inputs), { language: s.language, maxSteps: s.maxSteps, maxDepth: s.maxDepth });
  return r.error ? { output: r.output, error: r.error } : { output: r.output };
};

// ─── the tree ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type Found = { node: Node; list: Node[]; index: number; parent: Node | null; branch: Branch; depth: number };

export const findNode = (program: Node[], id: string): Found | null => {
  const walk = (list: Node[], parent: Node | null, branch: Branch, depth: number): Found | null => {
    for (let i = 0; i < list.length; i++) {
      const node = list[i];
      if (node.id === id) return { node, list, index: i, parent, branch, depth };
      const inBody = node.body && walk(node.body, node, "body", depth + 1);
      if (inBody) return inBody;
      const inOther = node.other && walk(node.other, node, "other", depth + 1);
      if (inOther) return inOther;
    }
    return null;
  };
  return walk(program, null, "body", 0);
};

export const countNodes = (program: Node[]): number =>
  program.reduce((n, node) => n + 1 + countNodes(node.body ?? []) + countNodes(node.other ?? []), 0);

/** How many levels of blocks a node holds below itself: 0 for a block without blocks inside. */
export const innerDepth = (node: Node): number =>
  Math.max(0, ...[...(node.body ?? []), ...(node.other ?? [])].map((c) => 1 + innerDepth(c)));

/** How often each block is in the program. */
export const usage = (program: Node[]): Map<string, number> => {
  const used = new Map<string, number>();
  const walk = (list: Node[]) => list.forEach((n) => {
    used.set(n.block, (used.get(n.block) ?? 0) + 1);
    walk(n.body ?? []);
    walk(n.other ?? []);
  });
  walk(program);
  return used;
};

/** A copy of the tree with fn applied to the list at (parent, branch). */
const mapList = (program: Node[], parent: string | null, branch: Branch, fn: (list: Node[]) => Node[]): Node[] => {
  if (parent === null) return fn(program);
  const walk = (list: Node[]): Node[] =>
    list.map((n) => {
      if (n.id === parent) return { ...n, [branch]: fn(n[branch] ?? []) };
      const next = { ...n };
      if (n.body) next.body = walk(n.body);
      if (n.other) next.other = walk(n.other);
      return next;
    });
  return walk(program);
};

/** The depth of the blocks in a list: 0 for the program, 1 inside a block of the program, … */
const listDepth = (program: Node[], parent: string | null): number => (parent === null ? 0 : (findNode(program, parent)?.depth ?? 0) + 1);

/** Can a block go into the list at (parent, branch): a list that exists, and not too deep. */
const fits = (s: Settings, program: Node[], node: Node, pos: Position): boolean => {
  if (pos.parent !== null) {
    const p = findNode(program, pos.parent);
    if (!p) return false;
    const kind = s.blocks[p.node.block]?.kind;
    if (!kind || !isContainer(kind) || (pos.branch === "other" && kind !== "ifelse")) return false;
  }
  return listDepth(program, pos.parent) + innerDepth(node) <= s.maxDepth;
};

/** The program with node put at the position (the index is clamped). */
export const insertAt = (program: Node[], pos: Position, node: Node): Node[] =>
  mapList(program, pos.parent, pos.branch, (list) => {
    const index = Math.max(0, Math.min(list.length, pos.index));
    return [...list.slice(0, index), node, ...list.slice(index)];
  });

/** The program without the node; with spill, the blocks it held take its place (as in the original). */
export const removeNode = (program: Node[], id: string, spill = true): Node[] => {
  const f = findNode(program, id);
  if (!f) return program;
  const inside = spill ? [...(f.node.body ?? []), ...(f.node.other ?? [])] : [];
  return mapList(program, f.parent?.id ?? null, f.branch, (list) => [...list.slice(0, f.index), ...inside, ...list.slice(f.index + 1)]);
};

/** A new node of a block, with empty blanks (and empty branches when it holds blocks). */
export const newNode = (block: Block, id: string): Node => {
  const node: Node = { id, block: block.id, values: block.slots.map(() => "") };
  if (isContainer(block.kind)) node.body = [];
  if (block.kind === "ifelse") node.other = [];
  return node;
};

/** Adds a block of the palette at a position, if it may be added (the number of blocks, reuse, depth). */
export const addBlock = (s: Settings, program: Node[], blockId: string, pos: Position, id: string): Node[] | null => {
  const block = s.blocks[blockId];
  if (!block || !block.palette) return null;
  if (countNodes(program) >= s.maxBlocks) return null;
  if (!s.reuse && usage(program).get(blockId)) return null;
  const node = newNode(block, id);
  if (!fits(s, program, node, pos)) return null;
  return insertAt(program, pos, node);
};

/** Moves a block to a position (in the program as it is before the move); null when it cannot go there. */
export const moveNode = (s: Settings, program: Node[], id: string, pos: Position): Node[] | null => {
  const f = findNode(program, id);
  if (!f || f.node.locked) return null;
  // not into itself
  if (pos.parent !== null && (pos.parent === id || findNode([f.node], pos.parent))) return null;
  let index = pos.index;
  if ((pos.parent ?? null) === (f.parent?.id ?? null) && pos.branch === f.branch && index > f.index) index--;
  const without = removeNode(program, id, false);
  const target = { ...pos, index };
  if (!fits(s, without, f.node, target)) return null;
  return insertAt(without, target, f.node);
};

/** Every position a block can go, in the order they are shown (top to bottom), with its depth. */
export const positions = (s: Settings, program: Node[], node?: Node): Position[] => {
  const result: Position[] = [];
  const walk = (list: Node[], parent: string | null, branch: Branch, depth: number) => {
    for (let i = 0; i <= list.length; i++) {
      if (!node || depth + innerDepth(node) <= s.maxDepth) result.push({ parent, branch, index: i });
      const n = list[i];
      if (!n) break;
      const kind = s.blocks[n.block]?.kind;
      if (kind && isContainer(kind)) walk(n.body ?? [], n.id, "body", depth + 1);
      if (kind === "ifelse") walk(n.other ?? [], n.id, "other", depth + 1);
    }
  };
  walk(program, null, "body", 0);
  return result;
};

const samePosition = (a: Position, b: Position) => a.parent === b.parent && a.branch === b.branch && a.index === b.index;

/**
 * Moves a block one place up (-1) or down (+1) in the listing, as the arrow keys do: past the block before or after it,
 * into a block that holds blocks and out of it again. null when it cannot move.
 */
export const moveBy = (s: Settings, program: Node[], id: string, delta: -1 | 1): Node[] | null => {
  const f = findNode(program, id);
  if (!f || f.node.locked) return null;
  const without = removeNode(program, id, false);
  const here: Position = { parent: f.parent?.id ?? null, branch: f.branch, index: f.index };
  const all = positions(s, without, f.node);
  const at = all.findIndex((p) => samePosition(p, here));
  const next = all[at + delta];
  if (at < 0 || !next) return null;
  return insertAt(without, next, f.node);
};

/** Moves a block into the block above it (at the end of its last branch), as Tab or → does. */
export const indent = (s: Settings, program: Node[], id: string): Node[] | null => {
  const f = findNode(program, id);
  if (!f || f.node.locked || f.index === 0) return null;
  const above = f.list[f.index - 1];
  const kind = s.blocks[above.block]?.kind;
  if (!kind || !isContainer(kind)) return null;
  const branch: Branch = kind === "ifelse" ? "other" : "body";
  return moveNode(s, program, id, { parent: above.id, branch, index: (above[branch] ?? []).length });
};

/** Moves a block out of the block that holds it, to just after that block, as Shift+Tab or ← does. */
export const outdent = (s: Settings, program: Node[], id: string): Node[] | null => {
  const f = findNode(program, id);
  if (!f || f.node.locked || !f.parent) return null;
  const p = findNode(program, f.parent.id)!;
  return moveNode(s, program, id, { parent: p.parent?.id ?? null, branch: p.branch, index: p.index + 1 });
};

export const setValue = (program: Node[], id: string, slot: number, value: string): Node[] => {
  const walk = (list: Node[]): Node[] =>
    list.map((n) => {
      if (n.id === id) {
        const values = [...n.values];
        values[slot] = value;
        return { ...n, values };
      }
      const next = { ...n };
      if (n.body) next.body = walk(n.body);
      if (n.other) next.other = walk(n.other);
      return next;
    });
  return walk(program);
};

// ─── reading programs the author wrote ───────────────────────────────────────────────────────────────────────────────

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const flexible = (text: string) => text.split(/\s+/).map(escape).join("\\s*");

/** A regular expression for a line of code of this block: its text, with a group for every blank. */
const blockPattern = (block: Block): RegExp => {
  const source = block.parts
    .map((p) => {
      if (typeof p === "string") return flexible(p);
      const slot = block.slots[p.slot];
      if (slot.type === "fixed") return flexible(slot.text);
      if (slot.type === "choice") return `(${[...slot.options, EMPTY_BLANK].map(escape).join("|")})`;
      return "(.*?)";
    })
    .join("");
  return new RegExp(`^\\s*${source}\\s*$`, "u");
};

/** The values of the blanks when a line of code is this block; null when it is not. */
export const matchLine = (block: Block, text: string): string[] | null => {
  const m = blockPattern(block).exec(text.trim());
  if (!m) return null;
  const values = block.slots.map(() => "");
  let g = 1;
  block.parts.forEach((p) => {
    if (typeof p === "string") return;
    const slot = block.slots[p.slot];
    if (slot.type === "fixed") return;
    const v = (m[g++] ?? "").trim();
    values[p.slot] = v === EMPTY_BLANK ? "" : v;
  });
  return values;
};

/** The values of the blanks when a typed line ("set: {total} ← {0}") is this block of the palette; null when not. */
const matchTyped = (block: Block, typed: Omit<Block, "id" | "palette">): string[] | null => {
  if (block.kind !== typed.kind || block.slots.length !== typed.slots.length || block.parts.length !== typed.parts.length) return null;
  const norm = (t: string) => t.replace(/\s+/g, " ").trim();
  for (let i = 0; i < block.parts.length; i++) {
    const a = block.parts[i];
    const b = typed.parts[i];
    if (typeof a === "string" ? typeof b !== "string" || norm(a) !== norm(b) : typeof b === "string" || a.slot !== b.slot) return null;
  }
  if ((block.elseLabel ?? "") !== (typed.elseLabel ?? "")) return null;
  const values: string[] = [];
  for (let i = 0; i < block.slots.length; i++) {
    const a = block.slots[i];
    const b = typed.slots[i];
    if (a.type === "fixed") {
      if (b.type !== "fixed" || norm(a.text) !== norm(b.text)) return null;
      values.push("");
    } else if (b.type === "fixed") {
      if (a.type === "choice" && !a.options.includes(b.text)) return null;
      values.push(b.text);
    } else if (a.type === "choice" && b.type === "choice" && a.options.join("|") === b.options.join("|")) values.push("");
    else if (a.type === "text" && b.type === "text") values.push("");
    else return null;
  }
  return values;
};

const editableCount = (b: Block) => b.slots.filter((s) => s.type !== "fixed").length;
/** How much fixed text a block has: of two blocks that match a line, the one with more is the one meant. */
const fixedLength = (b: Block) =>
  b.parts.reduce((n, p) => n + (typeof p === "string" ? p.trim().length : b.slots[p.slot].type === "fixed" ? (b.slots[p.slot] as { text: string }).text.length : 0), 0);

/** The block a line of code is (of two that match, the one with fewer blanks and more fixed text), with its values. */
export const matchCode = (blocks: Block[], text: string): { block: Block; values: string[] } | null => {
  const found = blocks
    .map((b) => ({ block: b, values: matchLine(b, text) }))
    .filter((m) => m.values)
    .sort((x, y) => editableCount(x.block) - editableCount(y.block) || fixedLength(y.block) - fixedLength(x.block) || Number(y.block.palette) - Number(x.block.palette));
  return found.length ? { block: found[0].block, values: found[0].values! } : null;
};

/** The label of a block as the author writes it: "{total} ← {total} {+|-|*} {i}". */
export const blockLabel = (block: Pick<Block, "parts" | "slots">): string =>
  block.parts
    .map((p) => {
      if (typeof p === "string") return p;
      const slot = block.slots[p.slot];
      return slot.type === "fixed" ? `{${slot.text}}` : slot.type === "choice" ? `{${slot.options.join("|")}}` : "{}";
    })
    .join("");

/**
 * A program the author wrote (the starting program or the solution), a block per line, indented for the blocks inside
 * another. A line is "kind: label" (any block, with {} for blanks) or plain code that one of the known blocks matches
 * ("total ← 0"). A line that is only "else" (or the block's else label) starts the else branch of an if/else; * in
 * front locks a block; # starts a comment. New blocks get ids with the prefix.
 */
export const parseProgram = (
  text: string, blocks: Record<string, Block>, language: Language, prefix: string, nextId: () => string, problems: string[],
): Node[] => {
  const root: Node[] = [];
  const elseWord = ELSE_WORD[language];
  type Frame = { indent: number; list: Node[] };
  const stack: Frame[] = [];
  let pending: { list: Node[]; indent: number } | null = null;
  const indents = new Map<Node, number>();
  let own = 0;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const width = raw.replace(/\t/g, INDENT).search(/\S/);
    if (!stack.length) stack.push({ indent: width, list: root });
    if (pending && width > pending.indent) {
      stack.push({ indent: width, list: pending.list });
    } else {
      while (stack.length > 1 && width < stack[stack.length - 1].indent) stack.pop();
    }
    pending = null;
    let line = raw.trim();
    const top = stack[stack.length - 1];

    // the else of an if/else at this level
    const last = top.list[top.list.length - 1];
    const lastBlock = last && blocks[last.block];
    if (lastBlock?.kind === "ifelse" && indents.get(last) === width) {
      const word = line.toLowerCase();
      if (word === (lastBlock.elseLabel ?? elseWord).toLowerCase() || word === "else" || word === elseWord) {
        pending = { list: (last.other = last.other ?? []), indent: width };
        continue;
      }
    }

    let locked = false;
    if (line.startsWith("*")) {
      locked = true;
      line = line.slice(1).trim();
    }
    let node: Node | null = null;
    if (KIND_LINE.test(line) && KIND_WORDS[KIND_LINE.exec(line)![1].toLowerCase()]) {
      const typed = parseBlockLine(line, elseWord);
      if (typeof typed === "string") {
        problems.push(typed);
        continue;
      }
      const known = Object.values(blocks).map((b) => ({ b, values: matchTyped(b, typed) })).find((m) => m.values);
      if (known) node = { ...newNode(known.b, nextId()), values: known.values! };
      else {
        const block: Block = { ...typed, id: `${prefix}${++own}`, palette: false };
        blocks[block.id] = block;
        node = newNode(block, nextId());
        node.values = block.slots.map(() => "");
      }
    } else {
      const found = matchCode(Object.values(blocks), line);
      if (!found) {
        problems.push(`no block matches: ${line}`);
        continue;
      }
      node = { ...newNode(found.block, nextId()), values: found.values };
    }
    if (locked) node.locked = true;
    indents.set(node, width);
    top.list.push(node);
    const kind = blocks[node.block].kind;
    if (isContainer(kind)) pending = { list: node.body!, indent: width };
  }
  return root;
};

// ─── tests ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** "5; 3 => 8" → inputs 5 and 3, expected output 8. A line per test, at most 8; # starts a comment. */
export const parseTests = (text: string, problems: string[] = []): Test[] => {
  const tests: Test[] = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(.*?)(=>|->|→)(.*)$/.exec(line);
    if (!m) {
      problems.push(`a test needs => between the input and the output: ${line}`);
      continue;
    }
    const list = (t: string) => (t.trim() === "" ? [] : t.split(";").map((v) => v.trim()));
    if (tests.length < MAX_TESTS) tests.push({ inputs: list(m[1]), expected: list(m[3]), source: line });
  }
  return tests;
};

export type TestResult = { passed: boolean; output: string[]; error?: RunError };
export type Evaluation = { score: number; maxscore: number; correct: boolean; results: TestResult[] };

/** Runs the program for every test case: it passes when it prints exactly the expected lines (spaces around trimmed). */
export const evaluateTests = (s: Settings, program: Node[]): Evaluation => {
  const stmts = statements(s, program);
  const results = s.tests.map((t): TestResult => {
    const r = run(stmts, parseInputs(t.inputs.join("\n")), { language: s.language, maxSteps: s.maxSteps, maxDepth: s.maxDepth });
    const output = r.output.map((l) => l.trim());
    const passed = !r.error && output.length === t.expected.length && output.every((l, i) => l === t.expected[i]);
    return r.error ? { passed, output, error: r.error } : { passed, output };
  });
  const score = results.filter((r) => r.passed).length;
  return { score, maxscore: results.length, correct: results.length > 0 && score === results.length, results };
};

// ─── settings ────────────────────────────────────────────────────────────────────────────────────────────────────────

const text = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const isTrue = (v: unknown, fallback: boolean) => (text(v).trim() === "" ? fallback : text(v).trim().toLowerCase() !== "false");
const integer = (v: unknown, fallback: number, min: number, max: number) => {
  const n = parseInt(text(v), 10);
  return isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

/** The settings from the data- attributes (all text). Without blocks: the example, in the language of the texts. */
export const parseSettings = (p: Record<string, unknown>): Settings => {
  const language = languageOf(p.language);
  const example = text(p.blocks).trim() === "" ? EXAMPLES[language] : null;
  const pick = (key: keyof Example) => (text(p[key]).trim() === "" && example ? example[key] : text(p[key]));
  const problems: string[] = [];
  const elseWord = ELSE_WORD[language];

  const blocks: Record<string, Block> = {};
  const palette: string[] = [];
  for (const line of pick("blocks").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const parsed = parseBlockLine(line, elseWord);
    if (typeof parsed === "string") {
      problems.push(parsed);
      continue;
    }
    const id = `b${palette.length + 1}`;
    blocks[id] = { ...parsed, id, palette: true };
    palette.push(id);
  }

  let n = 0;
  const nextId = () => `n${++n}`;
  const start = parseProgram(pick("program"), blocks, language, "p", nextId, problems);
  let s = 0;
  const solutionText = pick("solution");
  const solution = solutionText.trim() ? parseProgram(solutionText, blocks, language, "s", () => `s${++s}`, problems) : null;
  const scoring = text(p.scoring).trim().toLowerCase();
  return {
    language,
    prompt: pick("prompt"),
    blocks,
    palette,
    start,
    solution,
    inputs: pick("inputs"),
    editInputs: isTrue(p.editInputs, true),
    reuse: isTrue(p.reuse, false),
    tests: parseTests(pick("tests"), problems),
    scoring: scoring === "code" || scoring === "pci" ? scoring : "original",
    maxBlocks: integer(p.maxBlocks, 30, 1, MAX_BLOCKS),
    maxDepth: integer(p.maxDepth, DEFAULT_MAX_DEPTH, 1, 10),
    maxSteps: integer(p.maxSteps, DEFAULT_MAX_STEPS, 100, 1000000),
    problems,
  };
};

// ─── state ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The last run: the input it had, what it printed and the error that stopped it. */
export type LastRun = { inputs: string; output: string[]; error?: RunError };

export type CodeState = { program: Node[]; inputs: string; next: number; run: LastRun | null };

const maxId = (program: Node[]): number =>
  program.reduce((m, n) => Math.max(m, parseInt(n.id.slice(1), 10) || 0, maxId(n.body ?? []), maxId(n.other ?? [])), 0);

export const initialState = (s: Settings): CodeState => ({ program: s.start, inputs: s.inputs, next: maxId(s.start) + 1, run: null });

const lockedIds = (s: Settings): Set<string> => {
  const ids = new Set<string>();
  const walk = (list: Node[]) => list.forEach((n) => {
    if (n.locked) ids.add(n.id);
    walk(n.body ?? []);
    walk(n.other ?? []);
  });
  walk(s.start);
  return ids;
};

/** A program from outside (a saved state, a response) as a program of these settings: known blocks, clean values. */
export const cleanProgram = (s: Settings, program: unknown): Node[] | null => {
  if (!Array.isArray(program)) return null;
  const locked = lockedIds(s);
  const seen = new Set<string>();
  let count = 0;
  const walk = (list: unknown[], depth: number): Node[] => {
    const out: Node[] = [];
    for (const raw of list) {
      const n = raw as Partial<Node>;
      const block = n && typeof n.block === "string" ? s.blocks[n.block] : undefined;
      if (!block || count >= MAX_BLOCKS) continue;
      count++;
      let id = typeof n.id === "string" && /^n\d+$/.test(n.id) && !seen.has(n.id) ? n.id : "";
      if (!id) id = `n${1000 + count}`;
      seen.add(id);
      const node: Node = {
        id, block: block.id,
        values: block.slots.map((slot, i) => (slot.type === "fixed" ? "" : String(Array.isArray(n.values) ? n.values[i] ?? "" : "").slice(0, 200))),
      };
      if (isContainer(block.kind)) node.body = depth < 10 ? walk(Array.isArray(n.body) ? n.body : [], depth + 1) : [];
      if (block.kind === "ifelse") node.other = depth < 10 ? walk(Array.isArray(n.other) ? n.other : [], depth + 1) : [];
      if (locked.has(id)) node.locked = true;
      out.push(node);
    }
    return out;
  };
  return walk(program, 0);
};

export const validState = (saved: unknown, s: Settings): CodeState | null => {
  const st = saved as Partial<CodeState> | null;
  const program = cleanProgram(s, st?.program);
  if (!program) return null;
  const r = st?.run;
  const lastRun: LastRun | null = r && Array.isArray(r.output)
    ? { inputs: text(r.inputs), output: r.output.map(text), ...(r.error && typeof r.error.code === "string" ? { error: r.error } : {}) }
    : null;
  return { program, inputs: typeof st?.inputs === "string" ? st.inputs : s.inputs, next: Math.max(Number(st?.next) || 0, maxId(program) + 1), run: lastRun };
};

const programKey = (program: Node[]): string =>
  JSON.stringify(program, (k, v) => (k === "id" || k === "locked" ? undefined : v));

/** Nothing changed: the same program (ids aside), the same input, and not run. */
export const sameState = (a: CodeState, b: CodeState): boolean =>
  programKey(a.program) === programKey(b.program) && a.inputs === b.inputs && !a.run === !b.run;

// ─── the response ────────────────────────────────────────────────────────────────────────────────────────────────────

/** A block in the response's codeblock, as in the original: id, type and, for blocks that hold blocks, a list per branch. */
export type CodeBlockJson = { id: string; type: string; nests?: CodeBlockJson[][]; locked?: true };
/** The response of the original PCI (a JSON string): see the README for the mapping. */
export type OriginalResponse = {
  result: string[];
  code: string;
  codeblock: CodeBlockJson[];
  textbox: Record<string, string>[];
  dropdown: Record<string, string>[];
};

const TYPE_NAME: Record<Kind, string> = {
  set: "set", input: "input", print: "print", if: "if", ifelse: "ifElse", while: "while", repeat: "repeat", for: "for",
};

export const responseOf = (s: Settings, state: CodeState): OriginalResponse => {
  const textbox: Record<string, string>[] = [];
  const dropdown: Record<string, string>[] = [];
  const blocksOf = (list: Node[]): CodeBlockJson[] =>
    list.flatMap((n): CodeBlockJson[] => {
      const block = s.blocks[n.block];
      if (!block) return [];
      block.slots.forEach((slot, i) => {
        if (slot.type === "text") textbox.push({ [`${block.id}.${i + 1}`]: n.values[i] ?? "" });
        if (slot.type === "choice") dropdown.push({ [`${block.id}.${i + 1}`]: n.values[i] ?? "" });
      });
      const item: CodeBlockJson = { id: block.id, type: TYPE_NAME[block.kind] };
      if (isContainer(block.kind)) item.nests = [blocksOf(n.body ?? [])];
      if (block.kind === "ifelse") item.nests!.push(blocksOf(n.other ?? []));
      if (n.locked) item.locked = true;
      return [item];
    });
  const codeblock = blocksOf(state.program);
  return { result: state.run ? state.run.output : [], code: programText(s, state.program), codeblock, textbox, dropdown };
};

/** The program in a response of the original's form (codeblock with textbox and dropdown); null when there is none. */
export const programFromResponse = (s: Settings, json: Partial<OriginalResponse>): Node[] | null => {
  if (!Array.isArray(json?.codeblock)) return null;
  const queue = (list: unknown) => (Array.isArray(list) ? list.filter((e) => e && typeof e === "object") as Record<string, string>[] : []);
  const textbox = queue(json.textbox);
  const dropdown = queue(json.dropdown);
  let n = 0;
  // a locked block keeps the id it has in the starting program: that is how it stays locked
  const lockedOf = new Map<string, string[]>();
  const collect = (list: Node[]) => list.forEach((node) => {
    if (node.locked) lockedOf.set(node.block, [...(lockedOf.get(node.block) ?? []), node.id]);
    collect(node.body ?? []);
    collect(node.other ?? []);
  });
  collect(s.start);
  const used = new Set<string>();
  const walk = (list: CodeBlockJson[]): unknown[] =>
    list.flatMap((item) => {
      const block = item && s.blocks[item.id];
      if (!block) return [];
      const values = block.slots.map((slot, i) => {
        if (slot.type === "fixed") return "";
        const q = slot.type === "text" ? textbox : dropdown;
        const key = `${block.id}.${i + 1}`;
        if (q.length && key in q[0]) return String(q.shift()![key] ?? "");
        return "";
      });
      const nests = Array.isArray(item.nests) ? item.nests : [];
      const lockedId = item.locked ? (lockedOf.get(block.id) ?? []).find((id) => !used.has(id)) : undefined;
      if (lockedId) used.add(lockedId);
      return [{ id: lockedId ?? `n${1000 + ++n}`, block: block.id, values, body: walk(nests[0] ?? []), other: walk(nests[1] ?? []) }];
    });
  return cleanProgram(s, walk(json.codeblock));
};

/** The program in plain code (the response with data-scoring="code", or a correct response); null when no line matches. */
export const programFromCode = (s: Settings, code: string): Node[] | null => {
  const blocks = { ...s.blocks };
  let n = 0;
  const problems: string[] = [];
  // only the known blocks: a "kind:" line would make a new one
  const program = parseProgram(code, blocks, s.language, "x", () => `n${++n}`, problems);
  return program.length ? cleanProgram(s, program) : null;
};

/** The author's solution as a state, with the output of a run with the author's input. */
export const solutionState = (s: Settings): CodeState | null => {
  if (!s.solution) return null;
  const program = cleanProgram(s, s.solution)!;
  const r = runProgram(s, program, s.inputs);
  return { program, inputs: s.inputs, next: maxId(program) + 1, run: { inputs: s.inputs, ...r } };
};
