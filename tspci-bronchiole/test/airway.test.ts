// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Broncopci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// npm test: the model (src/airway.ts), the settings and the number format in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  airwayAt, airwayOf, correctAnswer, crossSection, flowRatio, fractionOf, isCorrect, levelsText, narrowingAt, parseLevels, thresholdLevel, LUMEN,
} from "../src/airway.ts";
import { parseSettings } from "../src/settings.ts";
import { formatNumber, formatPercent, parseNumber } from "../src/format.ts";

const close = (actual: number, expected: number, margin = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= margin, `${actual} is not ${expected} ± ${margin}`);

const defaults = parseSettings({});

test("area goes with r², airflow with r⁴ (Poiseuille)", () => {
  const half = airwayOf(0.5);
  close(half.radius, 0.5);
  close(half.area, 25);
  close(half.flow, 6.25);
  const none = airwayOf(0);
  close(none.area, 100);
  close(none.flow, 100);
});

test("the default asthmatic airway is the original's: r = 40 − level on a scale of 1 to 20", () => {
  for (let level = 1; level <= 20; level++) {
    close(airwayAt(defaults, "asthmatic", level).radius * 40, 40 - level);
  }
});

test("the healthy airway narrows much less: 0 % to 10 %", () => {
  close(airwayAt(defaults, "healthy", 1).radius, 1);
  close(airwayAt(defaults, "healthy", 20).radius, 0.9);
  close(airwayAt(defaults, "healthy", 20).flow, 65.61);
});

test("fraction and narrowing stay on the scale", () => {
  assert.equal(fractionOf(0, 1, 20), 0);
  assert.equal(fractionOf(30, 1, 20), 1);
  assert.equal(fractionOf(5, 5, 5), 0);
  close(narrowingAt({ atMin: 10, atMax: 200 }, 1), 0.95); // never closed completely
});

test("threshold: from level 7 on the asthmatic airflow is below 50 %", () => {
  assert.equal(thresholdLevel(defaults, "asthmatic", "flow", 50), 7);
  assert.ok(airwayAt(defaults, "asthmatic", 6).flow >= 50);
  assert.ok(airwayAt(defaults, "asthmatic", 7).flow < 50);
  // the area: r² < 0.5, r < 0.707, narrowing > 29.3 %: level 12
  assert.equal(thresholdLevel(defaults, "asthmatic", "area", 50), 12);
  // the healthy airway never gets below 50 %
  assert.equal(thresholdLevel(defaults, "healthy", "flow", 50), null);
});

test("ratio: at level 20 the healthy airflow is 10.5 times the asthmatic one", () => {
  close(flowRatio(defaults, 20), 0.6561 / 0.0625);
  const ratio = parseSettings({ question: "ratio" });
  assert.equal(correctAnswer(ratio), 10.5);
  assert.ok(isCorrect(ratio, 10.5));
  assert.ok(isCorrect(ratio, 10));
  assert.ok(!isCorrect(ratio, 9.9));
  assert.ok(!isCorrect(ratio, null));
});

test("the threshold question scores with its tolerance", () => {
  const s = parseSettings({ question: "threshold" });
  assert.equal(correctAnswer(s), 7);
  assert.ok(isCorrect(s, 7));
  assert.ok(!isCorrect(s, 6));
  assert.ok(isCorrect(parseSettings({ question: "threshold", tolerance: "1" }), 6));
  // no level on the scale: nothing is correct
  assert.equal(correctAnswer(parseSettings({ question: "threshold", questionPerson: "healthy" })), null);
  assert.equal(correctAnswer(defaults), null);
});

test("the log of levels: the same level twice in a row once", () => {
  assert.equal(levelsText([1, 5, 5, 12, 20, 20, 12]), "1,5,12,20,12");
  assert.deepEqual(parseLevels("1,5, 12;20"), [1, 5, 12, 20]);
  assert.deepEqual(parseLevels(undefined), []);
});

test("the cross-section: the air passage shrinks, mucus and a swollen wall fill the rest", () => {
  const normal = crossSection(0, 0.4);
  assert.equal(normal.lumen, LUMEN);
  assert.equal(normal.inflammation, 0);
  const half = crossSection(0.5, 0.4);
  assert.equal(half.lumen, LUMEN / 2);
  assert.ok(half.mucus - half.lumen > normal.mucus - normal.lumen);
  assert.ok(half.muscleInner < normal.muscleInner);
  assert.ok(half.inflammation > 0.5);
});

test("settings: fallbacks and checks", () => {
  assert.deepEqual(defaults.persons, ["healthy", "asthmatic"]);
  assert.equal(defaults.min, 1);
  assert.equal(defaults.max, 20);
  assert.equal(defaults.start, 1);
  assert.equal(defaults.question, "none");
  assert.equal(defaults.language, "en");
  const s = parseSettings({ persons: "asthmatic", pollutionMin: "5", pollutionMax: "3", pollutionStart: "99", asthmaticAtMax: "120", language: "fr-FR", decimals: "7" });
  assert.deepEqual(s.persons, ["asthmatic"]);
  assert.equal(s.max, 24);
  assert.equal(s.start, 24);
  assert.equal(s.response.asthmatic.atMax, 95);
  assert.equal(s.language, "fr");
  assert.equal(s.decimals, 2);
  // a comparison needs both airways
  assert.deepEqual(parseSettings({ persons: "healthy", question: "ratio" }).persons, ["healthy", "asthmatic"]);
  assert.equal(parseSettings({ question: "ratio", questionLevel: "10" }).questionLevel, 10);
  assert.equal(parseSettings({ mucusShare: "2,5" }).mucusShare, 0.025);
});

test("numbers per language", () => {
  assert.equal(formatNumber(6.25, 1, "en"), "6.3");
  assert.equal(formatNumber(6.25, 1, "nl"), "6,3");
  assert.equal(formatPercent(25, 0, "en"), "25%");
  assert.equal(formatPercent(6.25, 2, "fr"), "6,25 %");
  assert.equal(parseNumber("10,5"), 10.5);
  assert.equal(parseNumber(" 7 "), 7);
  assert.equal(parseNumber("abc"), null);
  assert.equal(parseNumber(""), null);
});
