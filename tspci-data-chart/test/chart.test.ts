// npm test: the data model (src/chart.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DATA, PALETTE, addCategory, addSeries, findSegment, moveCategory, nextChoice, parseData, parseMaxChoices,
  parseMode, parseNumber, parseShowValues, parseTSV, pasteGrid, removeCategory, removeSeries, segmentIds, serializeData,
  setValue, toTSV, toggleCorrect, dataDecimals, parseBoolean,
} from "../src/chart.ts";

test("numbers in English and Dutch", () => {
  assert.equal(parseNumber("1.5"), 1.5);
  assert.equal(parseNumber("1,5"), 1.5);
  assert.equal(parseNumber(" -3 "), -3);
  assert.equal(parseNumber("−3,25"), -3.25);
  assert.equal(parseNumber("45%"), 45);
  assert.equal(parseNumber("€ 12,50"), 12.5);
  assert.equal(parseNumber("1.234,5"), 1234.5);
  assert.equal(parseNumber("1,234.5"), 1234.5);
  assert.equal(parseNumber("1 234,5"), 1234.5);
  assert.equal(parseNumber("1.234.567"), 1234567);
  // one separator: the decimal sign, unless the language groups with it
  assert.equal(parseNumber("1,234"), 1.234);
  assert.equal(parseNumber("1,234", "."), 1234);
  assert.equal(parseNumber("1.234", ","), 1234);
  assert.equal(parseNumber("1.5", ","), 1.5);
  assert.equal(parseNumber(".5"), 0.5);
  for (const bad of ["", "  ", "abc", "1,2,3", "1..2", "--1", "1e5x"]) assert.equal(parseNumber(bad), null, bad);
});

test("settings: unknown values fall back", () => {
  assert.equal(parseMode("TOOL"), "tool");
  assert.equal(parseMode("whatever"), "select");
  assert.equal(parseShowValues("always"), "always");
  assert.equal(parseShowValues(undefined), "focus");
  assert.equal(parseMaxChoices(""), 1);
  assert.equal(parseMaxChoices("3"), 3);
  assert.equal(parseMaxChoices("0"), 0);
  assert.equal(parseMaxChoices("-2"), 1);
  assert.equal(parseBoolean("false", true), false);
  assert.equal(parseBoolean("", true), true);
});

test("parse and serialize: the example, broken data, ids", () => {
  assert.deepEqual(parseData(""), DEFAULT_DATA);
  assert.deepEqual(parseData("{not json"), DEFAULT_DATA);
  assert.deepEqual(parseData(JSON.stringify({ series: [], categories: [] })), DEFAULT_DATA);
  assert.deepEqual(parseData(serializeData(DEFAULT_DATA)), DEFAULT_DATA);
  const d = parseData(JSON.stringify({
    series: [{ id: "s1", name: "A", color: "red" }, { id: "s1", name: "B" }],
    categories: [{ label: "x", values: [1, "2,5"] }, { id: "c9", label: "y", values: [null] }],
    correct: ["c1-s2", "c9-s2", "c1-s2", "nope"],
  }));
  assert.deepEqual(d.series.map((s) => s.id), ["s1", "s2"]);
  assert.equal(d.series[0].color, PALETTE[0].color); // not a hex colour: one from the palette
  assert.equal(d.series[1].color, PALETTE[1].color);
  assert.deepEqual(d.categories.map((c) => [c.id, c.values]), [["c1", [1, 2.5]], ["c9", [null, null]]]);
  assert.deepEqual(d.correct, ["c1-s2"]); // c9-s2 has no value; duplicates and unknown ids go
});

test("segments: ids, lookup, only with a value", () => {
  assert.equal(segmentIds(DEFAULT_DATA).length, 16);
  assert.deepEqual(segmentIds(DEFAULT_DATA).slice(0, 5), ["c1-s1", "c1-s2", "c1-s3", "c1-s4", "c2-s1"]);
  const seg = findSegment(DEFAULT_DATA, "c3-s2");
  assert.equal(seg.category.label, "16–17");
  assert.equal(seg.series.name, "Bus, tram or train");
  assert.equal(seg.value, 29);
  assert.equal(findSegment(DEFAULT_DATA, "c9-s1"), null);
  assert.equal(findSegment(DEFAULT_DATA, ""), null);
});

test("editing keeps ids and the correct answer", () => {
  let d = addCategory(DEFAULT_DATA, "19+");
  assert.equal(d.categories[4].id, "c5");
  assert.deepEqual(d.categories[4].values, [null, null, null, null]);
  d = addSeries(d, "Scooter");
  assert.equal(d.series[4].id, "s5");
  assert.equal(d.series[4].color, PALETTE[4].color); // the first colour not used yet
  assert.equal(d.categories[0].values.length, 5);
  d = removeCategory(d, 0);
  assert.equal(addCategory(d).categories.at(-1).id, "c6");
  assert.deepEqual(d.correct, ["c3-s2"]);
  d = removeSeries(d, 1); // the bus goes, and with it the correct answer
  assert.deepEqual(d.correct, []);
  assert.equal(d.categories[0].values.length, 4);
  assert.equal(removeSeries({ ...d, series: d.series.slice(0, 1), categories: d.categories.map((c) => ({ ...c, values: [1] })) }, 0).series.length, 1);
  assert.deepEqual(moveCategory(DEFAULT_DATA, 0, -1), DEFAULT_DATA);
  assert.deepEqual(moveCategory(DEFAULT_DATA, 0, 1).categories.map((c) => c.id), ["c2", "c1", "c3", "c4"]);
  assert.deepEqual(setValue(DEFAULT_DATA, 2, 1, null).correct, []); // emptied: no longer a segment
});

test("correct segments: one replaces, more toggle", () => {
  let d = toggleCorrect(DEFAULT_DATA, "c1-s1", 1);
  assert.deepEqual(d.correct, ["c1-s1"]);
  d = toggleCorrect(d, "c2-s1", 2);
  assert.deepEqual(d.correct, ["c1-s1", "c2-s1"]);
  d = toggleCorrect(d, "c1-s1", 2);
  assert.deepEqual(d.correct, ["c2-s1"]);
  assert.deepEqual(toggleCorrect(d, "c9-s9", 2), d);
});

test("the candidate's choice", () => {
  assert.deepEqual(nextChoice([], "a", 1), ["a"]);
  assert.deepEqual(nextChoice(["a"], "b", 1), ["b"]);
  assert.deepEqual(nextChoice(["a"], "a", 1), ["a"]);
  assert.deepEqual(nextChoice(["a"], "b", 2), ["a", "b"]);
  assert.equal(nextChoice(["a", "b"], "c", 2), null);
  assert.deepEqual(nextChoice(["a", "b"], "a", 2), ["b"]);
  assert.deepEqual(nextChoice(["a", "b", "c"], "d", 0), ["a", "b", "c", "d"]);
});

test("paste from a spreadsheet", () => {
  assert.deepEqual(parseTSV("a\tb\r\n1\t2\r\n"), [["a", "b"], ["1", "2"]]);
  // a whole table in the corner: headers, labels and numbers; the table grows and shrinks nothing
  const base = { series: [{ id: "s1", name: "", color: "#0072B2" }], categories: [{ id: "c1", label: "", values: [null] }], correct: [] };
  const d = pasteGrid(base, "Appliance\tWinter\tSummer\nFridge\t1,2\t1.4\nWasher\t0.8\t\n", -1, -1);
  assert.deepEqual(d.series.map((s) => s.name), ["Winter", "Summer"]);
  assert.deepEqual(d.categories.map((c) => [c.label, c.values]), [["Fridge", [1.2, 1.4]], ["Washer", [0.8, null]]]);
  assert.notEqual(d.series[0].color, d.series[1].color);
  // a block of numbers from a cell on
  const e = pasteGrid(DEFAULT_DATA, "1\t2\n3\t4", 3, 2);
  assert.deepEqual(e.categories[3].values, [38, 47, 1, 2]);
  assert.deepEqual(e.categories[4].values, [null, null, 3, 4]);
  assert.equal(toTSV(d, "Appliance"), "Appliance\tWinter\tSummer\nFridge\t1.2\t1.4\nWasher\t0.8\t");
});

test("decimals of the data", () => {
  assert.equal(dataDecimals(DEFAULT_DATA), 0);
  assert.equal(dataDecimals(setValue(DEFAULT_DATA, 0, 0, 1.25)), 2);
  assert.equal(dataDecimals(setValue(DEFAULT_DATA, 0, 0, 1 / 3)), 3);
});
