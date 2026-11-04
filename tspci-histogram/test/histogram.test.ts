// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/parcc/extension-parcc-tei/tree/master/views/js/pciCreator/dev/histogramInteraction,
// © 2014-2017 Parcc, Inc. (Sam Sipasseuth, Open Assessment Technologies)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// npm test: the model of the histogram (src/histogram.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXAMPLE_TABLE, classLabel, evaluate, formatValue, heightFor, initialState, languageOf, parseClasses, parseList, parseNumber,
  parseNumberList, parseObservations, parseSettings, sameHeights, snapValue, tally, ticks, validHeights, validState,
} from "../src/histogram.ts";

test("numbers per language", () => {
  assert.equal(languageOf("nl-NL"), "nl");
  assert.equal(languageOf("FR"), "fr");
  assert.equal(languageOf("de"), "en");
  assert.equal(formatValue(2.5, "en"), "2.5");
  assert.equal(formatValue(2.5, "nl"), "2,5");
  assert.equal(formatValue(0.1 + 0.2, "fr"), "0,3");
  assert.equal(parseNumber("2,5"), 2.5);
  assert.equal(parseNumber(" 7 "), 7);
  assert.equal(parseNumber("−3"), -3);
  assert.equal(parseNumber("7 students"), null);
  assert.equal(parseNumber(""), null);
  assert.deepEqual(parseList("a; b\nc|d"), ["a", "b", "c", "d"]);
  assert.deepEqual(parseNumberList("4; 9;;8"), [4, 9, null, 8]);
  assert.deepEqual(parseNumberList(""), []);
});

test("the default is the travel time histogram, in the candidate's language", () => {
  const s = parseSettings({});
  assert.equal(s.chartType, "histogram");
  assert.deepEqual(s.classes, [0, 10, 20, 30, 40, 50]);
  assert.deepEqual(s.bars.map((b) => b.label), ["0–10", "10–20", "20–30", "30–40", "40–50"]);
  assert.deepEqual(s.table, EXAMPLE_TABLE);
  assert.deepEqual(s.correct, EXAMPLE_TABLE);
  assert.equal(s.dataDisplay, "table");
  assert.equal(s.max, 10);
  assert.equal(s.step, 1);
  assert.equal(s.snap, 1);
  assert.equal(s.valueTitle, "Number of students");
  assert.match(s.prompt, /^The table shows how long 30 students/);
  const nl = parseSettings({ language: "nl" });
  assert.equal(nl.categoryTitle, "Reistijd (minuten)");
  assert.equal(parseSettings({ language: "fr" }).valueTitle, "Nombre d'élèves");
  assert.equal(parseSettings({ classes: "0;2,5;5", language: "nl" }).bars[0].label, "0–2,5");
});

test("classes and bars", () => {
  assert.deepEqual(parseClasses("0;10;20"), [0, 10, 20]);
  assert.equal(parseClasses("0;20;10"), null);
  assert.equal(parseClasses("0"), null);
  assert.equal(parseClasses("0;x;3"), null);
  assert.equal(classLabel(10, 20, "en"), "10–20");

  const bar = parseSettings({ chartType: "bar", bars: "Apple\nBanana\nPear", colors: "#ff0000, #00ff00", locked: "2", startHeights: "1;5;2,4" });
  assert.equal(bar.chartType, "bar");
  assert.equal(bar.classes, null);
  assert.deepEqual(bar.bars.map((b) => b.label), ["Apple", "Banana", "Pear"]);
  assert.deepEqual(bar.bars.map((b) => b.color), ["#ff0000", "#00ff00", "#ff0000"]);
  assert.deepEqual(bar.bars.map((b) => b.locked), [false, true, false]);
  assert.deepEqual(bar.bars.map((b) => b.start), [1, 5, 2]);
  assert.equal(bar.prompt, "");
  assert.equal(bar.correct, null); // no data, no correct heights

  // a histogram always takes the classes; a bar chart without labels too
  assert.deepEqual(parseSettings({ chartType: "histogram", classes: "0;5;10", bars: "a\nb" }).bars.map((b) => b.label), ["0–5", "5–10"]);
  assert.deepEqual(parseSettings({ chartType: "bar", classes: "0;5;10" }).bars.map((b) => b.label), ["0–5", "5–10"]);
  // unreadable: the example's bars
  assert.equal(parseSettings({ classes: "nonsense" }).bars.length, 5);
});

test("the value axis: max, step and snap", () => {
  const s = parseSettings({ max: "20", step: "5", snap: "0,5" });
  assert.equal(s.max, 20);
  assert.equal(s.step, 5);
  assert.equal(s.snap, 0.5);
  assert.deepEqual(ticks(s), [0, 5, 10, 15, 20]);
  assert.deepEqual(ticks({ max: 7, step: 2 }), [0, 2, 4, 6, 7]);
  assert.equal(parseSettings({ max: "100", step: "1" }).step, 10); // more than 50 gridlines
  assert.equal(parseSettings({ max: "10", step: "1", snap: "0.001" }).snap, 1); // more than 1000 positions
  assert.equal(parseSettings({ max: "-3" }).max, 10);
  assert.equal(snapValue(3.26, s), 3.5);
  assert.equal(snapValue(3.2, s), 3);
  assert.equal(snapValue(-2, s), 0);
  assert.equal(snapValue(25, s), 20);
  assert.equal(snapValue(9.9, { snap: 3, max: 10 }), 9); // the largest multiple of snap under max
  assert.equal(snapValue(0.1 + 0.2, { snap: 0.1, max: 1 }), 0.3);
  assert.equal(snapValue(NaN, s), 0);
});

test("observations are tallied per class or per label", () => {
  assert.deepEqual(parseObservations("12, 15, 7\n3; 12,5 40", true), ["12", "15", "7", "3", "12,5", "40"]);
  assert.deepEqual(parseObservations("apple, banana\nice cream", false), ["apple", "banana", "ice cream"]);
  const s = parseSettings({ classes: "0;10;20;30", dataDisplay: "list", data: "0 5 9.9 10 12 30 31 x" });
  assert.deepEqual(tally(s.observations, s), [3, 2, 1]); // 30 is in the last class, 31 and x in none
  assert.deepEqual(s.correct, [3, 2, 1]);
  const fruit = parseSettings({ chartType: "bar", bars: "Apple\nBanana", dataDisplay: "list", data: "apple, Banana, APPLE, kiwi" });
  assert.deepEqual(fruit.correct, [2, 1]);
});

test("correct heights: the author's list, else the data; locked bars keep their start", () => {
  assert.deepEqual(parseSettings({ classes: "0;1;2", correct: "3;4", data: "1;1" }).correct, [3, 4]);
  assert.deepEqual(parseSettings({ classes: "0;1;2", data: "1;2" }).correct, [1, 2]);
  assert.equal(parseSettings({ classes: "0;1;2", data: "1" }).correct, null); // not a value for every bar
  assert.deepEqual(parseSettings({ classes: "0;1;2", data: "1;2", locked: "1", startHeights: "5" }).correct, [5, 2]);
  assert.deepEqual(parseSettings({ classes: "0;1;2", correct: "2,6;30", snap: "0.5" }).correct, [2.5, 10]); // on the grid
});

test("the candidate's heights: snapped, locked bars fixed, restored from a state", () => {
  const s = parseSettings({ classes: "0;1;2;3", locked: "3", startHeights: "0;0;4" });
  assert.deepEqual(initialState(s), { heights: [0, 0, 4], touched: false });
  assert.equal(heightFor(s, 0, 2.4), 2);
  assert.equal(heightFor(s, 2, 7), 4);
  assert.deepEqual(validHeights([1, "2,4", 9], s), [1, 2, 4]);
  assert.deepEqual(validHeights([1], s), [1, 0, 4]);
  assert.equal(validHeights([1, "x"], s), null);
  assert.equal(validHeights("1;2", s), null);
  assert.deepEqual(validState({ heights: [3, 3, 3], touched: true }, s), { heights: [3, 3, 4], touched: true });
  assert.equal(validState({}, s), null);
  assert.ok(sameHeights([1, 2], [1, 2]));
  assert.ok(!sameHeights([1, 2], [1, 3]));
});

test("evaluation: within the tolerance, all or per bar", () => {
  const s = parseSettings({ classes: "0;1;2;3", correct: "4;9;8", tolerance: "1" });
  assert.deepEqual(evaluate(s, [4, 9, 8]), { bars: [true, true, true], barsCorrect: 3, barsOpen: 3, correct: true, score: 1, maxscore: 1 });
  assert.deepEqual(evaluate(s, [5, 8, 6]).bars, [true, true, false]);
  assert.equal(evaluate(s, [5, 8, 6]).score, 0);
  const perBar = parseSettings({ classes: "0;1;2;3", correct: "4;9;8", pciScore: "bar", locked: "1", startHeights: "4" });
  const e = evaluate(perBar, [4, 9, 7]);
  assert.equal(e.barsOpen, 2);
  assert.equal(e.barsCorrect, 1);
  assert.equal(e.score, 1);
  assert.equal(e.maxscore, 2);
  assert.equal(e.correct, false);
  const none = parseSettings({ chartType: "bar", bars: "a\nb" });
  assert.equal(evaluate(none, [0, 0]).correct, false);
});
