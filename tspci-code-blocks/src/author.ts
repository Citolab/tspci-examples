// SPDX-License-Identifier: MIT
// Based on https://github.com/rdncuee/CBP (Code Block Programming Interaction),
// © 2022 The National Center for University Entrance Examinations
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The model of the authoring mode (the original's creator): the blocks as the author edits them, the solution, the
// starting program with its locks, the input and the test cases; read from the settings and written back as the same
// text settings (blocks, program, solution, inputs, tests), so delivery, the response and the scoring do not change.
// Imports only the model: `npm test` runs it in node.

import {
  type Block, type Kind, type Language, type Node, type Settings, type Test, ELSE_WORD, INDENT, MAX_TESTS, ROLES, blockLabel, countNodes,
  isContainer, lineText, matchCode, parseBlockLine, parseLabel, runProgram, evaluateTests, usage,
} from "./blocks.ts";
import { isName, type RunError } from "./interpreter.ts";

/** A block as the author edits it: its kind and its label with the parts in braces ({} {a|b} {fixed}). */
export type AuthorBlock = {
  /** b1 … as read from the settings, a1 … for new blocks; written out by position, so it never shows up in the text. */
  key: string;
  kind: Kind;
  label: string;
  /** The else line of an if/else ("" for the language's own word). */
  elseLabel: string;
  /** The candidate can add it; a block that is not in the palette is only in the starting program or the solution. */
  palette: boolean;
};

export type AuthorTest = { inputs: string[]; expected: string[] };

export type AuthorModel = {
  language: Language;
  blocks: AuthorBlock[];
  /** The starting program; the nodes refer to the blocks by key. */
  start: Node[];
  /** The ids of the nodes of the starting program that are locked. */
  locked: string[];
  solution: Node[];
  inputs: string;
  tests: AuthorTest[];
};

/** The text settings the authoring mode writes (config.json: editor "pci"). */
export const MANAGED = ["blocks", "program", "solution", "inputs", "tests"] as const;
export type Managed = Record<(typeof MANAGED)[number], string>;

// ─── from the settings ───────────────────────────────────────────────────────────────────────────────────────────────

/** New ids n1, n2 … in the order of the tree; ids keeps the old id → new id. */
const renumber = (program: Node[], counter: { n: number }, ids?: Map<string, string>): Node[] =>
  program.map((node) => {
    const id = `n${++counter.n}`;
    ids?.set(node.id, id);
    const next: Node = { id, block: node.block, values: [...node.values] };
    if (node.body) next.body = renumber(node.body, counter, ids);
    if (node.other) next.other = renumber(node.other, counter, ids);
    return next;
  });

const lockedOf = (program: Node[], ids: Map<string, string>): string[] => {
  const out: string[] = [];
  const walk = (list: Node[]) => list.forEach((n) => {
    if (n.locked) out.push(ids.get(n.id)!);
    walk(n.body ?? []);
    walk(n.other ?? []);
  });
  walk(program);
  return out;
};

export const modelFromSettings = (s: Settings): AuthorModel => {
  const order = [...s.palette, ...Object.keys(s.blocks).filter((id) => !s.palette.includes(id))];
  const blocks = order.map((id): AuthorBlock => {
    const b = s.blocks[id];
    const own = b.kind === "ifelse" && b.elseLabel && b.elseLabel !== ELSE_WORD[s.language] ? b.elseLabel : "";
    return { key: id, kind: b.kind, label: blockLabel(b), elseLabel: own, palette: b.palette };
  });
  const counter = { n: 0 };
  const ids = new Map<string, string>();
  const start = renumber(s.start, counter, ids);
  return {
    language: s.language,
    blocks,
    start,
    locked: lockedOf(s.start, ids),
    solution: renumber(s.solution ?? [], counter),
    inputs: s.inputs,
    tests: s.tests.map((t) => ({ inputs: [...t.inputs], expected: [...t.expected] })),
  };
};

// ─── the settings of a model ─────────────────────────────────────────────────────────────────────────────────────────

const lineOfBlock = (b: AuthorBlock) => `${b.kind}: ${b.label}${b.kind === "ifelse" && b.elseLabel.trim() ? ` | ${b.elseLabel.trim()}` : ""}`;

/** The block of an author's block; a label that cannot be read still gives a block (validation says what is wrong). */
export const blockOf = (b: AuthorBlock, language: Language): Block => {
  const parsed = parseBlockLine(lineOfBlock(b), ELSE_WORD[language]);
  if (typeof parsed !== "string") return { ...parsed, id: b.key, palette: b.palette };
  const label = parseLabel(b.label.trim()) ?? { parts: [b.label], slots: [] };
  return { kind: b.kind, ...label, ...(b.kind === "ifelse" ? { elseLabel: b.elseLabel.trim() || ELSE_WORD[language] } : {}), id: b.key, palette: b.palette };
};

/** Settings to show and run the model with: the item's own settings with the author's blocks, programs and tests. */
export const settingsOf = (m: AuthorModel, base: Settings): Settings => {
  const blocks: Record<string, Block> = {};
  for (const b of m.blocks) blocks[b.key] = blockOf(b, m.language);
  const locked = new Set(m.locked);
  const lock = (list: Node[]): Node[] => list.map((n) => ({
    ...n, ...(locked.has(n.id) ? { locked: true } : {}), ...(n.body ? { body: lock(n.body) } : {}), ...(n.other ? { other: lock(n.other) } : {}),
  }));
  return {
    ...base,
    language: m.language,
    blocks,
    palette: m.blocks.filter((b) => b.palette).map((b) => b.key),
    start: lock(m.start),
    solution: m.solution.length ? m.solution : null,
    inputs: m.inputs,
    tests: m.tests.map((t): Test => ({ inputs: t.inputs, expected: t.expected, source: testLine(t) })),
  };
};

/**
 * A program after its blocks changed: nodes of blocks that are gone or no longer hold blocks leave their blocks in
 * their place, and the values fit the blanks again.
 */
export const adaptProgram = (blocks: Record<string, Block>, program: Node[]): Node[] =>
  program.flatMap((node): Node[] => {
    const block = blocks[node.block];
    const inside = [...adaptProgram(blocks, node.body ?? []), ...adaptProgram(blocks, node.other ?? [])];
    if (!block) return inside;
    // values are kept for fixed parts too: a part that is fixed for a moment while the author types keeps its value
    const next: Node = { id: node.id, block: node.block, values: block.slots.map((_, i) => node.values[i] ?? "") };
    if (!isContainer(block.kind)) return [next, ...inside];
    next.body = adaptProgram(blocks, node.body ?? []);
    if (block.kind === "ifelse") next.other = adaptProgram(blocks, node.other ?? []);
    else next.body.push(...adaptProgram(blocks, node.other ?? []));
    return [next];
  });

// ─── writing the text settings ───────────────────────────────────────────────────────────────────────────────────────

/** A typed line for a node: "set: {total} ← {0}", the label with the filled blanks in braces. */
const typedLine = (block: Block, node: Node, language: Language): string => {
  const label = block.parts
    .map((p) => {
      if (typeof p === "string") return p;
      const slot = block.slots[p.slot];
      const value = (node.values[p.slot] ?? "").trim();
      if (slot.type === "fixed") return `{${slot.text}}`;
      if (value) return `{${value}}`;
      return slot.type === "choice" ? `{${slot.options.join("|")}}` : "{}";
    })
    .join("");
  const other = block.kind === "ifelse" && block.elseLabel && block.elseLabel !== ELSE_WORD[language] ? ` | ${block.elseLabel}` : "";
  return `${block.kind}: ${label}${other}`;
};

/**
 * A program as text, a line per block, indented with four spaces: plain code when reading it back gives the same block
 * and values, else a typed line. known: the blocks that reading it back knows (the palette, and blocks that typed lines
 * made before).
 */
export const programSource = (s: Settings, program: Node[], locked: Set<string>, known: Block[]): string => {
  const lines: string[] = [];
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v.trim() === (b[i] ?? "").trim());
  const walk = (list: Node[], depth: number) => {
    for (const node of list) {
      const block = s.blocks[node.block];
      if (!block) continue;
      const text = lineText(block, node);
      const found = matchCode(known, text);
      let line: string;
      if (found && found.block.id === block.id && same(found.values, node.values)) line = text;
      else {
        line = typedLine(block, node, s.language);
        if (!known.some((k) => k.id === block.id)) known.push(block);
      }
      lines.push(`${INDENT.repeat(depth)}${locked.has(node.id) ? "* " : ""}${line}`);
      if (isContainer(block.kind)) walk(node.body ?? [], depth + 1);
      if (block.kind === "ifelse") {
        lines.push(`${INDENT.repeat(depth)}${block.elseLabel ?? ELSE_WORD[s.language]}`);
        walk(node.other ?? [], depth + 1);
      }
    }
  };
  walk(program, 0);
  return lines.join("\n");
};

/** "5; 3 => 8" */
export const testLine = (t: AuthorTest): string =>
  `${t.inputs.map((v) => v.trim()).join("; ")} => ${t.expected.map((v) => v.trim()).join("; ")}`.trim();

/** The model as the text settings. */
export const serialize = (m: AuthorModel, base: Settings): Managed => {
  const s = settingsOf(m, base);
  const known = m.blocks.filter((b) => b.palette).map((b) => s.blocks[b.key]);
  const locked = new Set(m.locked);
  const program = programSource(s, m.start, locked, known);
  const solution = programSource(s, m.solution, new Set(), known);
  return {
    blocks: m.blocks.filter((b) => b.palette).map(lineOfBlock).join("\n"),
    program,
    solution,
    inputs: m.inputs,
    tests: m.tests.slice(0, MAX_TESTS).map(testLine).join("\n"),
  };
};

// ─── what the author sees about the model ────────────────────────────────────────────────────────────────────────────

/** The blocks of the palette the solution does not use: the distractors. Empty without a solution. */
export const distractors = (m: AuthorModel): string[] => {
  if (!m.solution.length) return [];
  const used = usage(m.solution);
  return m.blocks.filter((b) => b.palette && !used.get(b.key)).map((b) => b.key);
};

/** The deepest level of blocks inside blocks in a program (0: none inside another). */
export const programDepth = (program: Node[], depth = 0): number =>
  program.reduce((m, n) => Math.max(m, depth, programDepth(n.body ?? [], depth + 1), programDepth(n.other ?? [], depth + 1)), 0);

export type Problem = {
  /** An error keeps the author from finishing (Done); a warning does not. */
  level: "error" | "warning";
  code:
    | "noBlocks" | "unclosed" | "parts" | "fewChoices" | "notName" | "tooManyStart" | "tooManySolution" | "tooDeepStart"
    | "tooDeepSolution" | "noSolution" | "solutionBlank" | "notAvailable" | "solutionError" | "testFails" | "noTests"
    | "semicolon";
  /** 1-based: the block in the author's list, the part in braces, the line of the solution, the test. */
  block?: number;
  part?: number;
  line?: number;
  test?: number;
  /** A number (a limit, a count of parts), or the text of a block. */
  detail?: string;
  error?: RunError;
};

/** The braces of a label, as the author wrote them (the text inside). */
export const braces = (label: string): string[] => [...label.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]);

/** What is wrong with the model, in the order the author meets it. */
export const authorProblems = (m: AuthorModel, base: Settings): Problem[] => {
  const s = settingsOf(m, base);
  const problems: Problem[] = [];
  if (!m.blocks.some((b) => b.palette)) problems.push({ level: "error", code: "noBlocks" });
  m.blocks.forEach((b, i) => {
    const block = i + 1;
    if ((b.label.match(/\{/g) ?? []).length !== braces(b.label).length) {
      problems.push({ level: "error", code: "unclosed", block });
      return;
    }
    const inner = braces(b.label);
    if (inner.length < ROLES[b.kind].length) problems.push({ level: "error", code: "parts", block, detail: String(ROLES[b.kind].length) });
    inner.forEach((text, j) => {
      if (text.includes("|") && text.split("|").filter((o) => o.trim()).length < 2) problems.push({ level: "error", code: "fewChoices", block, part: j + 1 });
    });
    // a part that is a variable, written as fixed text, must be a name
    ROLES[b.kind].forEach((role, j) => {
      const text = inner[j];
      if (role === "name" && text !== undefined && text.trim() && !text.includes("|") && !isName(text.trim(), m.language)) {
        problems.push({ level: "error", code: "notName", block, part: j + 1, detail: text.trim() });
      }
    });
  });
  if (countNodes(m.start) > s.maxBlocks) problems.push({ level: "error", code: "tooManyStart", detail: String(s.maxBlocks) });
  if (countNodes(m.solution) > s.maxBlocks) problems.push({ level: "error", code: "tooManySolution", detail: String(s.maxBlocks) });
  if (programDepth(m.start) > s.maxDepth) problems.push({ level: "error", code: "tooDeepStart", detail: String(s.maxDepth) });
  if (programDepth(m.solution) > s.maxDepth) problems.push({ level: "error", code: "tooDeepSolution", detail: String(s.maxDepth) });

  if (!m.solution.length) problems.push({ level: base.scoring === "code" ? "error" : "warning", code: "noSolution" });
  else {
    // empty blanks in the solution
    const lines: { node: Node; number: number }[] = [];
    let number = 0;
    const walk = (list: Node[]) => list.forEach((n) => {
      const b = s.blocks[n.block];
      if (!b) return;
      lines.push({ node: n, number: ++number });
      walk(n.body ?? []);
      if (b.kind === "ifelse") {
        number++;
        walk(n.other ?? []);
      }
    });
    walk(m.solution);
    for (const { node, number: line } of lines) {
      const b = s.blocks[node.block];
      if (b.slots.some((slot, i) => slot.type !== "fixed" && !(node.values[i] ?? "").trim())) problems.push({ level: "error", code: "solutionBlank", line });
    }
    // blocks the candidate cannot get as often as the solution uses them
    const inSolution = usage(m.solution);
    const inStart = usage(m.start);
    m.blocks.forEach((b, i) => {
      const need = inSolution.get(b.key) ?? 0;
      const have = b.palette ? (base.reuse ? Infinity : Math.max(1, inStart.get(b.key) ?? 0)) : inStart.get(b.key) ?? 0;
      if (need > have) problems.push({ level: "warning", code: "notAvailable", block: i + 1, detail: lineText(s.blocks[b.key], { id: "", block: b.key, values: [] }) });
    });
    const run = runProgram(s, m.solution, m.inputs);
    if (run.error && !problems.some((p) => p.code === "solutionBlank")) problems.push({ level: "warning", code: "solutionError", error: run.error });
    if (m.tests.length) {
      evaluateTests(s, m.solution).results.forEach((r, i) => {
        if (!r.passed) problems.push({ level: "error", code: "testFails", test: i + 1 });
      });
    }
  }
  m.tests.forEach((t, i) => {
    if ([...t.inputs, ...t.expected].some((v) => v.includes(";"))) problems.push({ level: "error", code: "semicolon", test: i + 1 });
  });
  if (base.scoring === "pci" && !m.tests.length) problems.push({ level: "error", code: "noTests" });
  return problems;
};

/** The output of the solution for every test's input: what "Fill in from the solution" puts in the tests. */
export const expectedFromSolution = (m: AuthorModel, base: Settings): AuthorTest[] => {
  const s = settingsOf(m, base);
  return m.tests.map((t) => {
    const r = runProgram(s, m.solution, t.inputs.join("\n"));
    return r.error ? t : { inputs: t.inputs, expected: r.output };
  });
};
