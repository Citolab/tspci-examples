// SPDX-License-Identifier: MIT
// Based on https://github.com/rdncuee/CBP (Code Block Programming Interaction),
// © 2022 The National Center for University Entrance Examinations
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// npm test: the authoring model (src/author.ts) in node: reading the settings, writing them back, the problems.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type AuthorModel, adaptProgram, authorProblems, blockOf, braces, distractors, expectedFromSolution, modelFromSettings, programDepth,
  serialize, settingsOf,
} from "../src/author.ts";
import { addBlock, parseSettings, programText, setValue, type Settings } from "../src/blocks.ts";

/** What a reader of the settings sees of them: the palette, the programs as code with their locks, the tests. */
const view = (s: Settings) => ({
  palette: s.palette.map((id) => [s.blocks[id].kind, s.blocks[id].parts, s.blocks[id].slots, s.blocks[id].elseLabel]),
  start: programText(s, s.start),
  locks: JSON.stringify(s.start, (k, v) => (k === "id" || k === "block" ? undefined : v)),
  solution: s.solution ? programText(s, s.solution) : null,
  inputs: s.inputs,
  tests: s.tests.map((t) => [t.inputs, t.expected]),
});

/** text → authoring model → text → settings: the same as reading the text directly. */
const roundTrip = (properties: Record<string, string>) => {
  const before = parseSettings(properties);
  const written = serialize(modelFromSettings(before), before);
  const after = parseSettings({ ...properties, ...written });
  assert.deepEqual(view(after), view(before));
  assert.deepEqual(after.problems, []);
  return written;
};

test("the example, written out as text, reads back the same (en, nl, fr)", () => {
  const written = roundTrip({});
  assert.deepEqual(written, {
    blocks: ["set: {total} ← {}", "for: for {i} from {} to {}", "set: {total} ← {total} {+|-|*} {i}", "print: print {total}", "print: print {i}",
      "while: while {total < n}", "set: {i} ← {i} + {1}"].join("\n"),
    program: "* input: read {n}",
    solution: "read n\ntotal ← 0\nfor i from 1 to n\n    total ← total + i\nprint total",
    inputs: "5",
    tests: "5 => 15\n1 => 1\n10 => 55",
  });
  roundTrip({ language: "nl" });
  roundTrip({ language: "fr" });
  // written twice: the same text
  const s = parseSettings(written);
  assert.deepEqual(serialize(modelFromSettings(s), s), written);
});

test("round trips: if/else with its own else line, locks inside blocks, blocks only in a program, typed values", () => {
  roundTrip({
    blocks: "input: read {n}\nifelse: if {n mod 2 = 0} | otherwise\nprint: print {\"even\"|\"odd\"}",
    solution: "read n\nif n mod 2 = 0\n    print \"even\"\notherwise\n    print \"odd\"",
    program: "* ifelse: if {n mod 2 = 0} | otherwise\n    * print: print {\"even\"|\"odd\"}\notherwise",
    tests: "4 => even\n7 => odd\n=> ",
  });
  roundTrip({
    blocks: "set: {k} ← {3}\nwhile: while {k} {>|<} {0}\nprint: print {k}\nset: {k} ← {k - 1}\nrepeat: repeat {} times",
    program: "set: {k} ← {3}\nwhile: while {k} {>|<} {0}\n    print: print {k}",
    solution: "k ← 3\nwhile k > 0\n    print k\n    k ← k - 1",
    tests: "=> 3; 2; 1",
  });
  // two blocks that look alike: the more specific one is meant, and that survives
  roundTrip({
    blocks: "set: {x} ← {}\nset: {x} ← {x} + {1}\nprint: print {x}\nfor: for {i} from {1} to {3}",
    solution: "x ← 0\nfor i from 1 to 3\n    x ← x + 1\nprint x",
  });
  // a block only in the solution, a block only in the starting program
  roundTrip({
    blocks: "print: print {}",
    program: "* set: {x} ← {2}",
    solution: "x ← 2\nprint: print {x * x}\nrepeat: repeat {2} times\n    print x",
  });
});

test("the model: blocks with keys, the palette flag, locks by node id", () => {
  const s = parseSettings({});
  const m = modelFromSettings(s);
  assert.deepEqual(m.blocks.map((b) => [b.key, b.kind, b.palette]), [
    ["b1", "set", true], ["b2", "for", true], ["b3", "set", true], ["b4", "print", true], ["b5", "print", true], ["b6", "while", true],
    ["b7", "set", true], ["p1", "input", false],
  ]);
  assert.equal(m.blocks[2].label, "{total} ← {total} {+|-|*} {i}");
  assert.deepEqual(m.locked, ["n1"]);
  assert.deepEqual(m.solution.map((n) => n.id), ["n2", "n3", "n4", "n6"]);
  assert.deepEqual(distractors(m), ["b5", "b6", "b7"]);
  assert.deepEqual(braces("if {n} {<|>} {}"), ["n", "<|>", ""]);
  assert.equal(programDepth(m.solution), 1);
  assert.equal(programDepth([]), 0);
  assert.deepEqual(blockOf({ key: "a1", kind: "for", label: "for {i} to", elseLabel: "", palette: true }, "en").slots, [{ type: "fixed", text: "i" }]);
});

test("editing blocks: a new block in the solution is written as plain code", () => {
  const base = parseSettings({});
  const m = modelFromSettings(base);
  m.blocks.push({ key: "a1", kind: "print", label: "print {\"done\"}", elseLabel: "", palette: true });
  const s = settingsOf(m, base);
  m.solution = setValue(addBlock({ ...s, reuse: true }, m.solution, "a1", { parent: null, branch: "body", index: 4 }, "n20")!, "n20", 0, "");
  const written = serialize(m, base);
  assert.match(written.blocks, /\nprint: print \{"done"\}$/);
  assert.match(written.solution, /\nprint "done"$/);
  assert.equal(distractors(m).includes("a1"), false);
});

test("adapting programs to changed blocks", () => {
  const base = parseSettings({ blocks: "for: for {i} from {} to {}\nprint: print {}\nifelse: if {}" });
  const program = [{ id: "n1", block: "b1", values: ["", "1", "3"], body: [{ id: "n2", block: "b2", values: ["i"] }] },
    { id: "n3", block: "b3", values: ["x"], body: [{ id: "n4", block: "b2", values: ["1"] }], other: [{ id: "n5", block: "b2", values: ["2"] }] }];
  // the for is now a print: its body takes its place; the if/else lost a blank and became an if: the else joins the body
  const blocks = { ...base.blocks, b1: { ...base.blocks.b2, id: "b1" }, b3: { ...base.blocks.b3, kind: "if" as const, slots: [{ type: "fixed" as const, text: "x" }] } };
  assert.deepEqual(adaptProgram(blocks, program), [
    { id: "n1", block: "b1", values: [""] }, { id: "n2", block: "b2", values: ["i"] },
    { id: "n3", block: "b3", values: ["x"], body: [{ id: "n4", block: "b2", values: ["1"] }, { id: "n5", block: "b2", values: ["2"] }] },
  ]);
  // a removed block: its blocks stay
  const { b1, ...rest } = base.blocks;
  void b1;
  assert.deepEqual(adaptProgram(rest, program.slice(0, 1)), [{ id: "n2", block: "b2", values: ["i"] }]);
});

test("problems, in plain codes the authoring mode turns into text", () => {
  const base = parseSettings({});
  const codes = (m: AuthorModel, b: Settings = base) => authorProblems(m, b).map((p) => `${p.level}:${p.code}${p.block ? `@b${p.block}` : ""}${p.part ? `.${p.part}` : ""}${p.line ? `@l${p.line}` : ""}${p.test ? `@t${p.test}` : ""}`);
  const m = modelFromSettings(base);
  assert.deepEqual(codes(m), []);
  m.blocks[0] = { ...m.blocks[0], label: "{total ← {}" };
  m.blocks[1] = { ...m.blocks[1], label: "for {i} from {}" };
  m.blocks[2] = { ...m.blocks[2], label: "{total} ← {total} {+|} {i}" };
  m.blocks[6] = { ...m.blocks[6], label: "{2i} ← {}" };
  assert.deepEqual(codes(m).slice(0, 4), ["error:unclosed@b1", "error:parts@b2", "error:fewChoices@b3.3", "error:notName@b7.1"]);

  const sol = modelFromSettings(base);
  sol.solution = setValue(sol.solution, "n3", 1, ""); // total ← (empty)
  assert.deepEqual(codes(sol), ["error:solutionBlank@l2", "error:testFails@t1", "error:testFails@t2", "error:testFails@t3"]);

  const wrongTest = modelFromSettings(base);
  wrongTest.tests[1] = { inputs: ["1"], expected: ["2"] };
  wrongTest.tests.push({ inputs: ["1;2"], expected: [] });
  assert.deepEqual(codes(wrongTest), ["error:testFails@t2", "error:testFails@t4", "error:semicolon@t4"]);
  assert.deepEqual(expectedFromSolution(wrongTest, base).map((t) => t.expected), [["15"], ["1"], ["55"], []]); // "1;2" is one text input: the solution stops, the test stays

  const empty = modelFromSettings(base);
  empty.solution = [];
  empty.blocks = empty.blocks.map((b) => ({ ...b, palette: false }));
  assert.deepEqual(codes(empty), ["error:noBlocks", "warning:noSolution"]);
  assert.deepEqual(codes(empty, { ...base, scoring: "pci" }).slice(1), ["warning:noSolution"]);
  empty.tests = [];
  assert.deepEqual(codes(empty, { ...base, scoring: "code" }), ["error:noBlocks", "error:noSolution"]);
  assert.deepEqual(codes(empty, { ...base, scoring: "pci" }), ["error:noBlocks", "warning:noSolution", "error:noTests"]);

  const limits = modelFromSettings(base);
  assert.deepEqual(codes(limits, { ...base, maxBlocks: 3, maxDepth: 0 }).slice(0, 2), ["error:tooManySolution", "error:tooDeepSolution"]);
  // the solution uses a block twice without reuse, and a block the candidate does not have
  const twice = modelFromSettings(base);
  twice.solution = [...twice.solution, { id: "n30", block: "b4", values: [] }, { id: "n31", block: "p1", values: [] }];
  assert.deepEqual(codes(twice).filter((c) => c.includes("notAvailable")), ["warning:notAvailable@b4", "warning:notAvailable@b8"]);
  assert.equal(authorProblems(twice, { ...base, reuse: true }).filter((p) => p.code === "notAvailable").length, 1);
});
