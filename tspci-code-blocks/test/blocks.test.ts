// SPDX-License-Identifier: MIT
// Based on https://github.com/rdncuee/CBP (Code Block Programming Interaction),
// © 2022 The National Center for University Entrance Examinations
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// npm test: the model of the code blocks (src/blocks.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addBlock, cleanProgram, countNodes, evaluateTests, findNode, indent, initialState, listing, matchLine, moveBy, moveNode, newNode,
  operands, outdent, parseBlockLine, parseLabel, parseSettings, parseTests, positions, programFromCode, programFromResponse,
  programText, removeNode, responseOf, runProgram, sameState, setValue, solutionState, statements, usage, validState,
  type Node, type Settings,
} from "../src/blocks.ts";

const example = parseSettings({});

/** The example program solved: read n (locked), total ← 0, for i from 1 to n { total ← total + i }, print total. */
const solved = (s: Settings = example): Node[] => {
  let p = initialState(s).program;
  p = addBlock(s, p, "b1", { parent: null, branch: "body", index: 1 }, "n10")!;
  p = setValue(p, "n10", 1, "0");
  p = addBlock(s, p, "b2", { parent: null, branch: "body", index: 2 }, "n11")!;
  p = setValue(setValue(p, "n11", 1, "1"), "n11", 2, "n");
  p = addBlock(s, p, "b3", { parent: "n11", branch: "body", index: 0 }, "n12")!;
  p = setValue(p, "n12", 2, "+");
  p = addBlock(s, p, "b4", { parent: null, branch: "body", index: 3 }, "n13")!;
  return p;
};

test("a block line: kind, label, blanks", () => {
  assert.deepEqual(parseLabel("{total} ← {} {+|-| *}"), {
    parts: [{ slot: 0 }, " ← ", { slot: 1 }, " ", { slot: 2 }],
    slots: [{ type: "fixed", text: "total" }, { type: "text" }, { type: "choice", options: ["+", "-", "*"] }],
  });
  assert.equal(parseLabel("if {n"), null);
  const ifelse = parseBlockLine("ifelse: if {n mod 2 = 0} then | otherwise", "else");
  assert.ok(typeof ifelse !== "string");
  assert.equal(ifelse.kind, "ifelse");
  assert.equal(ifelse.elseLabel, "otherwise");
  assert.deepEqual(ifelse.parts, ["if ", { slot: 0 }, " then"]);
  assert.equal((parseBlockLine("if-else: als {}", "anders") as any).elseLabel, "anders");
  assert.match(parseBlockLine("loop: {x}", "else") as string, /no kind/);
  assert.match(parseBlockLine("for: for {i} to {n}", "else") as string, /needs 3/);
  assert.match(parseBlockLine("print: print", "else") as string, /needs 1/);
});

test("the example: its blocks, the locked first line, the solution and the tests, in the language of the texts", () => {
  assert.equal(example.language, "en");
  assert.match(example.prompt, /^Make a program/);
  assert.deepEqual(example.palette, ["b1", "b2", "b3", "b4", "b5", "b6", "b7"]);
  assert.equal(example.blocks.b2.kind, "for");
  assert.deepEqual(example.problems, []);
  assert.equal(example.start.length, 1);
  assert.equal(example.start[0].locked, true);
  assert.equal(example.blocks[example.start[0].block].palette, false);
  assert.equal(programText(example, example.solution!), "read n\ntotal ← 0\nfor i from 1 to n\n    total ← total + i\nprint total");
  assert.equal(example.tests.length, 3);
  assert.equal(example.reuse, false);
  assert.equal(example.scoring, "original");
  assert.equal(example.maxDepth, 5);
  const nl = parseSettings({ language: "nl-NL" });
  assert.equal(programText(nl, nl.solution!), "lees n\ntotaal ← 0\nvoor i van 1 tot en met n\n    totaal ← totaal + i\ntoon totaal");
  assert.deepEqual(nl.problems, []);
  const fr = parseSettings({ language: "fr" });
  assert.deepEqual(evaluateTests(fr, fr.solution!).score, 3);
});

test("operands: one blank per role, the last role takes the rest", () => {
  const p = solved();
  const lines = listing(example, p);
  assert.deepEqual(lines.map((l) => [l.number, l.depth, l.text]), [
    [1, 0, "read n"], [2, 0, "total ← 0"], [3, 0, "for i from 1 to n"], [4, 1, "total ← total + i"], [5, 0, "print total"],
  ]);
  assert.deepEqual(operands(example.blocks.b3, findNode(p, "n12")!.node), ["total", "total + i"]);
  assert.deepEqual(operands(example.blocks.b2, findNode(p, "n11")!.node), ["i", "1", "n"]);
  const empty = newNode(example.blocks.b3, "x");
  assert.deepEqual(operands(example.blocks.b3, empty), ["total", null]);
  assert.equal(listing(example, [empty])[0].text, "total ← total ___ i");
  assert.deepEqual(statements(example, p)[2], {
    kind: "for", line: 3, name: "i", from: "1", to: "n", body: [{ kind: "set", line: 4, name: "total", expr: "total + i" }],
  });
});

test("running the program", () => {
  assert.deepEqual(runProgram(example, solved(), "5"), { output: ["15"] });
  assert.deepEqual(runProgram(example, solved(), ""), { output: [], error: { code: "noInput", line: 1 } });
  const blank = setValue(solved(), "n10", 1, "");
  assert.deepEqual(runProgram(example, blank, "5"), { output: [], error: { code: "blank", line: 2 } });
  assert.deepEqual(runProgram(example, [], "5").error, { code: "empty", line: 0 });
});

test("adding blocks: reuse, the number of blocks, the depth", () => {
  let p = solved();
  assert.equal(addBlock(example, p, "b1", { parent: null, branch: "body", index: 0 }, "n20"), null); // used, no reuse
  assert.equal(usage(p).get("b1"), 1);
  const reuse = parseSettings({ reuse: "true", maxBlocks: "6" });
  p = addBlock(reuse, solved(reuse), "b1", { parent: null, branch: "body", index: 0 }, "n20")!;
  assert.equal(countNodes(p), 6);
  assert.equal(addBlock(reuse, p, "b5", { parent: null, branch: "body", index: 0 }, "n21"), null); // 6 at most
  assert.equal(addBlock(example, [], "p1", { parent: null, branch: "body", index: 0 }, "n21"), null); // not in the palette
  assert.equal(addBlock(example, solved(), "b5", { parent: "n10", branch: "body", index: 0 }, "n21"), null); // not a container
  // depth: maxDepth 2 → a loop in a loop holds blocks, a third level does not
  const shallow = parseSettings({ reuse: "true", maxDepth: "2" });
  let q = addBlock(shallow, [], "b2", { parent: null, branch: "body", index: 0 }, "n1")!;
  q = addBlock(shallow, q, "b6", { parent: "n1", branch: "body", index: 0 }, "n2")!;
  q = addBlock(shallow, q, "b5", { parent: "n2", branch: "body", index: 0 }, "n3")!;
  assert.equal(findNode(q, "n3")!.depth, 2);
  assert.equal(addBlock(shallow, q, "b6", { parent: "n2", branch: "body", index: 0 }, "n4")!.length, 1); // a loop at depth 2: empty
  assert.equal(addBlock(shallow, addBlock(shallow, q, "b6", { parent: "n2", branch: "body", index: 0 }, "n4")!, "b5", { parent: "n4", branch: "body", index: 0 }, "n5"), null);
});

test("moving blocks with the keyboard: up and down through the listing, into and out of blocks", () => {
  const s = parseSettings({ reuse: "true" });
  let p = solved(s); // read n | total ← 0 | for … { total ← total + i } | print total
  const order = (prog: Node[]) => listing(s, prog).map((l) => `${"  ".repeat(l.depth)}${l.node.id}`);
  assert.equal(moveBy(s, p, "n1", -1), null); // locked
  assert.equal(moveBy(s, p, "n1", 1), null);
  // print total up: into the for loop (at its end), then above its body, then out above the for
  p = moveBy(s, p, "n13", -1)!;
  assert.deepEqual(order(p), ["n1", "n10", "n11", "  n12", "  n13"]);
  p = moveBy(s, p, "n13", -1)!;
  assert.deepEqual(order(p), ["n1", "n10", "n11", "  n13", "  n12"]);
  p = moveBy(s, p, "n13", -1)!;
  assert.deepEqual(order(p), ["n1", "n10", "n13", "n11", "  n12"]);
  p = moveBy(s, p, "n13", -1)!;
  p = moveBy(s, p, "n13", -1)!;
  assert.deepEqual(order(p), ["n13", "n1", "n10", "n11", "  n12"]); // past the locked block
  assert.equal(moveBy(s, p, "n13", -1), null);
  // indent into the block above, outdent out of it
  p = solved(s);
  assert.equal(indent(s, p, "n10"), null); // the block above is not a container
  p = indent(s, p, "n13")!;
  assert.deepEqual(order(p), ["n1", "n10", "n11", "  n12", "  n13"]);
  p = outdent(s, p, "n12")!;
  assert.deepEqual(order(p), ["n1", "n10", "n11", "  n13", "n12"]);
  assert.equal(outdent(s, p, "n12"), null);
  // a whole loop moves with its body
  p = moveBy(s, p, "n11", -1)!;
  assert.deepEqual(order(p), ["n1", "n11", "  n13", "n10", "n12"]);
});

test("moving a block to a position (drag and drop), removing it", () => {
  const s = example;
  let p = solved();
  assert.equal(moveNode(s, p, "n11", { parent: "n12", branch: "body", index: 0 }), null); // not into itself
  assert.equal(moveNode(s, p, "n11", { parent: "n11", branch: "body", index: 0 }), null);
  assert.equal(moveNode(s, p, "n1", { parent: null, branch: "body", index: 3 }), null); // locked
  p = moveNode(s, p, "n10", { parent: null, branch: "body", index: 3 })!; // after the for, in the program before the move
  assert.deepEqual(p.map((n) => n.id), ["n1", "n11", "n10", "n13"]);
  p = moveNode(s, p, "n13", { parent: "n11", branch: "body", index: 0 })!;
  assert.deepEqual(findNode(p, "n11")!.node.body!.map((n) => n.id), ["n13", "n12"]);
  // removing a block that holds blocks: they take its place
  p = removeNode(p, "n11");
  assert.deepEqual(p.map((n) => n.id), ["n1", "n13", "n12", "n10"]);
  assert.equal(positions(s, []).length, 1);
});

test("if/else: two branches, the else line in the listing and the code", () => {
  const s = parseSettings({
    blocks: "input: read {n}\nifelse: if {n mod 2 = 0} | otherwise\nprint: print {\"even\"|\"odd\"}",
    reuse: "true",
    solution: "read n\nif n mod 2 = 0\n    print \"even\"\notherwise\n    print \"odd\"",
    tests: "4 => even\n7 => odd",
  });
  assert.deepEqual(s.problems, []);
  assert.equal(programText(s, s.solution!), "read n\nif n mod 2 = 0\n    print \"even\"\notherwise\n    print \"odd\"");
  assert.deepEqual(listing(s, s.solution!).map((l) => l.number + (l.isElse ? "e" : "")), ["1", "2", "3", "4e", "5"]);
  assert.deepEqual(evaluateTests(s, s.solution!), {
    score: 2, maxscore: 2, correct: true, results: [{ passed: true, output: ["even"] }, { passed: true, output: ["odd"] }],
  });
  // indent into an if/else: at the end of the else branch
  let p = addBlock(s, [], "b2", { parent: null, branch: "body", index: 0 }, "n1")!;
  p = addBlock(s, p, "b3", { parent: null, branch: "body", index: 1 }, "n2")!;
  p = indent(s, p, "n2")!;
  assert.deepEqual(findNode(p, "n2")!.branch, "other");
  p = moveBy(s, p, "n2", -1)!; // up: from the else branch into the if branch
  assert.deepEqual(findNode(p, "n2")!.branch, "body");
  // an error line counts the else line
  p = setValue(p, "n1", 0, "");
  const blankIf = parseSettings({ blocks: "ifelse: if {}\nprint: print {}" });
  let q = addBlock(blankIf, [], "b1", { parent: null, branch: "body", index: 0 }, "n1")!;
  q = setValue(q, "n1", 0, "false");
  q = addBlock(blankIf, q, "b2", { parent: "n1", branch: "other", index: 0 }, "n2")!;
  q = setValue(q, "n2", 0, "x");
  assert.deepEqual(runProgram(blankIf, q, "").error, { code: "undefined", line: 3, detail: "x" });
});

test("starting programs and solutions: typed lines, code lines, locks, problems", () => {
  const s = parseSettings({
    blocks: "set: {x} ← {}\nprint: print {x}\nrepeat: repeat {} times",
    program: "* set: {x} ← {1}\nrepeat: repeat {3} times\n  print: print {x}\n# a comment\nwhile: while {x < 3}\nnonsense line",
    solution: "x ← 1\nrepeat 3 times\n    print x",
  });
  assert.deepEqual(s.start.map((n) => [n.block, n.values, n.locked ?? false]), [
    ["b1", ["", "1"], true], ["b3", ["3"], false], ["p1", [""], false],
  ]);
  assert.equal(s.start[1].body![0].block, "b2");
  assert.equal(s.blocks.p1.kind, "while");
  assert.equal(s.blocks.p1.palette, false);
  assert.deepEqual(s.problems, ["no block matches: nonsense line"]);
  assert.equal(programText(s, s.solution!), "x ← 1\nrepeat 3 times\n    print x");
  assert.equal(evaluateTests({ ...s, tests: parseTests("=> 1;1;1") }, s.solution!).correct, true);
  // matching a line of code: the values of the blanks
  assert.deepEqual(matchLine(s.blocks.b1, "x ← y + 1"), ["", "y + 1"]);
  assert.deepEqual(matchLine(s.blocks.b1, "x ← ___"), ["", ""]);
  assert.equal(matchLine(s.blocks.b2, "print y"), null);
});

test("test cases", () => {
  const problems: string[] = [];
  assert.deepEqual(parseTests("5; 3 => 8\n# comment\n=> hello; world\nbad line", problems), [
    { inputs: ["5", "3"], expected: ["8"], source: "5; 3 => 8" },
    { inputs: [], expected: ["hello", "world"], source: "=> hello; world" },
  ]);
  assert.equal(problems.length, 1);
  assert.equal(parseTests(Array(12).fill("1 -> 1").join("\n")).length, 8);
  const wrong = setValue(solved(), "n12", 2, "*");
  const e = evaluateTests(example, wrong);
  assert.equal(e.score, 0);
  assert.equal(e.correct, false);
  assert.deepEqual(e.results[0], { passed: false, output: ["0"] });
  assert.deepEqual(evaluateTests(example, solved()), {
    score: 3, maxscore: 3, correct: true, results: [{ passed: true, output: ["15"] }, { passed: true, output: ["1"] }, { passed: true, output: ["55"] }],
  });
  assert.deepEqual(evaluateTests(example, [])["results"][0].error, { code: "empty", line: 0 });
});

test("state: initial, clean, unchanged", () => {
  const start = initialState(example);
  assert.equal(start.next, 2);
  assert.ok(sameState(start, initialState(example)));
  const p = solved();
  const state = { ...start, program: p };
  assert.ok(!sameState(state, start));
  assert.ok(!sameState({ ...start, run: { inputs: "5", output: [] } }, start));
  assert.ok(!sameState({ ...start, inputs: "6" }, start));
  const back = validState(JSON.parse(JSON.stringify(state)), example)!;
  assert.deepEqual(back.program, p);
  assert.equal(back.next, 14);
  assert.equal(validState({ program: "x" }, example), null);
  // unknown blocks are dropped, values made to fit, locks only from the starting program
  assert.deepEqual(cleanProgram(example, [{ id: "n1", block: "zz" }, { id: "n5", block: "b2", values: [1, 2], locked: true }]), [
    { id: "n5", block: "b2", values: ["", "2", ""], body: [] },
  ]);
});

test("the response: the original's JSON, and back", () => {
  const p = solved();
  const state = { ...initialState(example), program: p, run: { inputs: "5", output: ["15"] } };
  const r = responseOf(example, state);
  assert.deepEqual(r, {
    result: ["15"],
    code: "read n\ntotal ← 0\nfor i from 1 to n\n    total ← total + i\nprint total",
    codeblock: [
      { id: "p1", type: "input", locked: true },
      { id: "b1", type: "set" },
      { id: "b2", type: "for", nests: [[{ id: "b3", type: "set" }]] },
      { id: "b4", type: "print" },
    ],
    textbox: [{ "b1.2": "0" }, { "b2.2": "1" }, { "b2.3": "n" }],
    dropdown: [{ "b3.3": "+" }],
  });
  const back = programFromResponse(example, JSON.parse(JSON.stringify(r)))!;
  assert.equal(programText(example, back), r.code);
  assert.equal(back[0].locked, true);
  assert.equal(programFromResponse(example, { code: "x" } as any), null);
  // the code alone
  const fromCode = programFromCode(example, r.code)!;
  assert.equal(programText(example, fromCode), r.code);
  assert.deepEqual(runProgram(example, fromCode, "4").output, ["10"]);
  assert.equal(programFromCode(example, "nothing that matches"), null);
});

test("the solution as a state, with its output", () => {
  const sol = solutionState(example)!;
  assert.deepEqual(sol.run, { inputs: "5", output: ["15"] });
  assert.equal(solutionState(parseSettings({ blocks: "print: print {}" })), null);
});
