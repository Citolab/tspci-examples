// npm test: the table model, typing rules, normalizing and scoring (src/table.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TABLE, addColumn, addRow, canonicalNumber, cellContext, displayValue, expectedValues, inputCells, isCorrect,
  localizeTyping, move, normalizeValue, parsePasted, parseRules, parseTable, pasteGrid, refusal, removeColumn, removeRow, scoreValues,
  separatorFor, serializeTable, tableProblems, updateCell,
} from "../src/table.ts";
import type { Rules, Table } from "../src/table.ts";

const number: Rules = { mode: "number", maxCharacters: 6, decimals: null, negative: false };
const text: Rules = { mode: "text", maxCharacters: 0, decimals: null, negative: false };

test("settings", () => {
  assert.deepEqual(parseRules({ inputMode: "number", maxCharacters: "6", decimals: "", allowNegative: "false" }), number);
  assert.deepEqual(parseRules({ inputMode: "TEXT", maxCharacters: "x", decimals: "2", allowNegative: "true" }),
    { mode: "text", maxCharacters: 0, decimals: 2, negative: true });
  assert.equal(parseRules({ decimals: "0" }).decimals, 0);
  assert.equal(parseRules({ decimals: "-1" }).decimals, null);
  assert.equal(separatorFor("nl-NL"), ",");
  assert.equal(separatorFor("en"), ".");
});

test("canonical numbers", () => {
  const cases: [string, string | null][] = [
    ["3,5", "3.5"], ["3.50", "3.5"], ["007", "7"], [",5", "0.5"], ["3,", "3"], ["-0", "0"], ["-0,0", "0"], ["-2,10", "-2.1"],
    [" 12 ", "12"], ["0", "0"], ["100", "100"], ["10.0", "10"], ["", null], ["-", null], [",", null], ["1,2,3", null], ["abc", null],
  ];
  for (const [input, out] of cases) assert.equal(canonicalNumber(input), out, input);
});

test("normalizing for the response", () => {
  assert.equal(normalizeValue(" 18,80 ", number), "18.8");
  assert.equal(normalizeValue("", number), "");
  assert.equal(normalizeValue("-", number), "-");
  assert.equal(normalizeValue("  Den   Haag ", text), "Den Haag");
  assert.equal(normalizeValue("3,5", text), "3,5");
  assert.equal(displayValue("18.8", number, ","), "18,8");
  assert.equal(displayValue("18.8", number, "."), "18.8");
  assert.equal(displayValue("a.b", text, ","), "a.b");
});

test("what the candidate may type", () => {
  for (const ok of ["", "3", "3,", "3,5", ",5", "3.5", "123456"]) assert.equal(refusal(ok, number), null, ok);
  assert.equal(refusal("1234567", number), "length");
  assert.equal(refusal("3a", number), "character");
  assert.equal(refusal("3,5,", number), "separator");
  assert.equal(refusal("3.5,", number), "separator");
  assert.equal(refusal("-3", number), "negative");
  assert.equal(refusal("-3", { ...number, negative: true }), null);
  assert.equal(refusal("3-", { ...number, negative: true }), "character");
  assert.equal(refusal("3,55", { ...number, decimals: 1 }), "decimals");
  assert.equal(refusal("3,", { ...number, decimals: 0 }), "decimals");
  assert.equal(refusal("3,5", { ...number, decimals: 1 }), null);
  assert.equal(refusal("anything at all", text), null);
  assert.equal(refusal("abcdefg", { ...text, maxCharacters: 6 }), "length");
  assert.equal(localizeTyping("3.5", number, ","), "3,5");
  assert.equal(localizeTyping("3,5", number, "."), "3.5");
  assert.equal(localizeTyping("a.b", text, ","), "a.b");
});

test("checking values, with a tolerance", () => {
  const cell = { kind: "input" as const, text: "18,8", tolerance: "0,1" };
  assert.equal(isCorrect("18.8", cell, number), true);
  assert.equal(isCorrect("18,7", cell, number), true);
  assert.equal(isCorrect("18,9", cell, number), true);
  assert.equal(isCorrect("18,95", cell, number), false);
  assert.equal(isCorrect("", cell, number), false);
  assert.equal(isCorrect("18.80", { kind: "input", text: "18.8" }, number), true);
  assert.equal(isCorrect("18.81", { kind: "input", text: "18.8" }, number), false);
  assert.equal(isCorrect("Den  Haag ", { kind: "input", text: "Den Haag" }, text), true);
  assert.equal(isCorrect("den haag", { kind: "input", text: "Den Haag" }, text), false);
});

test("the example: input cells in reading order, expected values, context", () => {
  const cells = inputCells(DEFAULT_TABLE);
  assert.deepEqual(cells.map((c) => c.id), ["r2-c3", "r2-c5", "r2-c6"]);
  assert.deepEqual(expectedValues(DEFAULT_TABLE, number), ["18.8", "9", "0.4"]);
  assert.deepEqual(cellContext(DEFAULT_TABLE, 1, 2), { row: "height (m)", column: "time (s) 0.5" });
  const top: Table = { ...DEFAULT_TABLE, headerColumn: false, headerRow: true };
  assert.deepEqual(cellContext(top, 1, 2), { row: "", column: "0.5" });
});

test("scoring: points off per missing or wrong value", () => {
  assert.deepEqual(scoreValues(["18.8", "9", "0.4"], DEFAULT_TABLE, number, 2, 1), { correct: 3, errors: 0, score: 2, maxscore: 2 });
  assert.deepEqual(scoreValues(["18.7", "", "0.4"], DEFAULT_TABLE, number, 2, 1), { correct: 2, errors: 1, score: 1, maxscore: 2 });
  assert.deepEqual(scoreValues(["1", "", ""], DEFAULT_TABLE, number, 2, 1), { correct: 0, errors: 3, score: 0, maxscore: 2 });
  assert.deepEqual(scoreValues([], DEFAULT_TABLE, number, 3, 1).score, 0);
});

test("headers are never inputs", () => {
  const t = updateCell(DEFAULT_TABLE, 0, 0, { kind: "input", text: "5" });
  assert.equal(inputCells(t).length, 3);
  const top = updateCell({ ...DEFAULT_TABLE, headerRow: true }, 0, 3, { kind: "input", text: "5" });
  assert.equal(inputCells(top).length, 3);
});

test("moving between input cells", () => {
  // two rows of inputs under each other
  let t: Table = addRow(DEFAULT_TABLE);
  t = updateCell(t, 2, 0, { text: "speed" });
  t = updateCell(t, 2, 2, { kind: "input", text: "4.9" });
  t = updateCell(t, 2, 4, { kind: "input", text: "14.7" });
  assert.equal(move(t, "r2-c3", "next"), "r2-c5");
  assert.equal(move(t, "r2-c6", "next"), "r3-c3");
  assert.equal(move(t, "r2-c3", "previous"), null);
  assert.equal(move(t, "r2-c3", "right"), "r2-c5");
  assert.equal(move(t, "r2-c6", "right"), "r3-c3");
  assert.equal(move(t, "r3-c3", "left"), "r2-c6");
  assert.equal(move(t, "r2-c3", "down"), "r3-c3");
  assert.equal(move(t, "r3-c5", "up"), "r2-c5");
  assert.equal(move(t, "r2-c6", "down"), null);
  assert.equal(move(t, "nope", "next"), null);
});

test("editing the table keeps ids", () => {
  let t = addColumn(addRow(DEFAULT_TABLE));
  assert.deepEqual(t.rows.map((r) => r.id), ["r1", "r2", "r3"]);
  assert.equal(t.columns.at(-1)?.id, "c7");
  t = removeRow(t, 0);
  t = removeColumn(t, 1);
  assert.deepEqual(t.rows.map((r) => r.id), ["r2", "r3"]);
  assert.deepEqual(t.columns.map((c) => c.id), ["c1", "c3", "c4", "c5", "c6", "c7"]);
  assert.ok(t.rows.every((r) => r.cells.length === 6));
  assert.equal(removeRow(removeRow(t, 0), 0).rows.length, 1);
});

test("serialize and parse round trip, broken input", () => {
  const json = serializeTable(DEFAULT_TABLE);
  assert.deepEqual(parseTable(json), {
    ...DEFAULT_TABLE,
    rows: DEFAULT_TABLE.rows.map((r) => ({ ...r, cells: r.cells.map((c) => (c.kind === "given" ? { kind: "given", text: c.text } : { ...c })) })),
  });
  assert.equal(parseTable(""), DEFAULT_TABLE);
  assert.equal(parseTable("{nope"), DEFAULT_TABLE);
  assert.equal(parseTable('{"columns":[],"rows":[]}'), DEFAULT_TABLE);
  const fixed = parseTable('{"columns":[{"id":"c1"},{"id":"c1"}],"rows":[{"cells":["a",{"kind":"input","text":"1"}]}]}');
  assert.deepEqual(fixed.columns.map((c) => c.id), ["c1", "c2"]);
  assert.equal(fixed.rows[0].id, "r1");
  assert.deepEqual(fixed.rows[0].cells[1], { kind: "input", text: "1", tolerance: "" });
});

test("pasting cells, with [expected ± tolerance]", () => {
  assert.deepEqual(parsePasted("[18,8 ± 0,1]"), { kind: "input", text: "18,8", tolerance: "0,1" });
  assert.deepEqual(parsePasted("[7+-1]"), { kind: "input", text: "7", tolerance: "1" });
  assert.deepEqual(parsePasted("[]"), { kind: "input", text: "", tolerance: "" });
  assert.deepEqual(parsePasted(" hello "), { kind: "given", text: "hello" });
  const t = pasteGrid(DEFAULT_TABLE, "cost (€)\t2\t[4]\n\tx\t[6 ± 0,5]\n", 2, 0);
  assert.equal(t.rows.length, 4);
  assert.equal(t.rows[2].cells[0].text, "cost (€)");
  assert.deepEqual(t.rows[3].cells[2], { kind: "input", text: "6", tolerance: "0,5" });
  assert.equal(inputCells(t).length, 5);
});

test("authoring problems", () => {
  assert.deepEqual(tableProblems(DEFAULT_TABLE, number), []);
  assert.deepEqual(tableProblems(DEFAULT_TABLE, { ...number, decimals: 1 }), []);
  assert.deepEqual(tableProblems(DEFAULT_TABLE, { ...number, decimals: 0 }), [{ code: "tooManyDecimals", cells: ["2:3", "2:6"] }]);
  const none = updateCell(updateCell(updateCell(DEFAULT_TABLE, 1, 2, { kind: "given" }), 1, 4, { kind: "given" }), 1, 5, { kind: "given" });
  assert.deepEqual(tableProblems(none, number), [{ code: "noInputs" }]);
  let bad = updateCell(DEFAULT_TABLE, 1, 2, { text: "" });
  bad = updateCell(bad, 1, 4, { text: "abc", tolerance: "x" });
  bad = updateCell(bad, 1, 5, { text: "-1234567" });
  assert.deepEqual(tableProblems(bad, number).map((p) => p.code), ["noExpected", "notNumber", "negative", "tooLong", "badTolerance"]);
  assert.deepEqual(tableProblems(bad, text).map((p) => p.code), ["noExpected"]);
});
