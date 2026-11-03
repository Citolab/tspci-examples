// npm test: numbers (src/format.ts) and scoring (src/scoring.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptableNumberText, decimalsOf, formatNumber, languageOf, parseNumber, roundTo, rulerReading } from "../src/format.ts";
import { responseProcessingXml, scoreAnswer, withinMargin, xmlNumber } from "../src/scoring.ts";

test("formatNumber: a decimal comma in Dutch, a real minus, no −0", () => {
  assert.equal(formatNumber(3.4176, 2, "en"), "3.42");
  assert.equal(formatNumber(3.4176, 2, "nl"), "3,42");
  assert.equal(formatNumber(-3, 1, "en"), "−3.0");
  assert.equal(formatNumber(-0.001, 2, "en"), "0.00");
  assert.equal(formatNumber(NaN, 2, "en"), "–");
  assert.equal(languageOf("nl-NL"), "nl");
  assert.equal(languageOf(undefined), "en");
});

test("parseNumber: point or comma, nothing else", () => {
  assert.equal(parseNumber("3,42"), 3.42);
  assert.equal(parseNumber(" 3.42 "), 3.42);
  assert.equal(parseNumber("−2"), -2);
  assert.equal(parseNumber(".5"), 0.5);
  assert.equal(parseNumber("3,4,2"), null);
  assert.equal(parseNumber("1e3"), null);
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber("abc"), null);
});

test("acceptableNumberText: while typing", () => {
  assert.ok(acceptableNumberText("3,"));
  assert.ok(acceptableNumberText(""));
  assert.ok(!acceptableNumberText("3,4,"));
  assert.ok(!acceptableNumberText("3a"));
  assert.ok(!acceptableNumberText("-3"));
  assert.ok(acceptableNumberText("-3", true));
});

test("decimalsOf and roundTo", () => {
  assert.equal(decimalsOf(0.1), 1);
  assert.equal(decimalsOf(0.05), 2);
  assert.equal(decimalsOf(5), 0);
  assert.equal(roundTo(1.005, 2), 1.01);
  assert.equal(roundTo(3.41763, 4), 3.4176);
});

test("rulerReading: between two ticks, or on one", () => {
  assert.deepEqual(rulerReading(3.4176, 0.1), { low: 3.4000000000000004, high: 3.5 });
  const r = rulerReading(3.4176, 0.1);
  assert.equal(roundTo(r.low, 6), 3.4);
  assert.deepEqual(rulerReading(3.5, 0.1), { low: 3.5, high: 3.5 });
  assert.deepEqual(rulerReading(14.04, 5), { low: 10, high: 15 });
  assert.deepEqual(rulerReading(2, 0), { low: 2, high: 2 });
});

test("withinMargin: inclusive, both sides", () => {
  assert.ok(withinMargin(3.42, 3.4176, 0.05));
  assert.ok(withinMargin(3.37, 3.42, 0.05));
  assert.ok(withinMargin(3.47, 3.42, 0.05));
  assert.ok(!withinMargin(3.48, 3.42, 0.05));
  assert.ok(!withinMargin(null, 3.42, 0.05));
  assert.ok(!withinMargin(3.42, null, 0.05));
  assert.ok(withinMargin(3.42, 3.42, 0));
});

test("scoreAnswer: the value, and the measurement when it is required", () => {
  assert.deepEqual(scoreAnswer({ value: 3.42, correct: 3.4176, margin: 0.05, made: false, requireMeasurement: false }), { score: 1, maxscore: 1, correct: 1, measured: 0 });
  assert.deepEqual(scoreAnswer({ value: 3.42, correct: 3.4176, margin: 0.05, made: false, requireMeasurement: true }), { score: 0, maxscore: 1, correct: 1, measured: 0 });
  assert.deepEqual(scoreAnswer({ value: 3.42, correct: 3.4176, margin: 0.05, made: true, requireMeasurement: true }), { score: 1, maxscore: 1, correct: 1, measured: 1 });
  assert.deepEqual(scoreAnswer({ value: 3.6, correct: 3.4176, margin: 0.05, made: true, requireMeasurement: true }), { score: 0, maxscore: 1, correct: 0, measured: 1 });
});

test("responseProcessingXml: a margin on the float, or the record's score", () => {
  const xml = responseProcessingXml("margin", 3.4176, 0.05);
  assert.match(xml, /<qti-equal tolerance-mode="absolute" tolerance="0.05">/);
  assert.match(xml, /<qti-correct-response><qti-value>3.4176<\/qti-value><\/qti-correct-response>/);
  assert.match(xml, /base-type="float"/);
  const record = responseProcessingXml("pci", 3.4176, 0.05);
  assert.match(record, /cardinality="record"/);
  assert.match(record, /field-identifier="score"/);
  assert.equal(xmlNumber(0.1 + 0.2), "0.3");
});
