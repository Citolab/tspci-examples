// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Abeillepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// npm test: the settings, the model and the numbers in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCombination, parseLosses, parseSettings, num } from "../src/settings.ts";
import { answerKeyOf, beesDrawn, effectChoices, flowerGroupsOf, isCorrect, largestEffect, levelsFor, populationOf } from "../src/model.ts";
import { formatNumber, parseAnswer } from "../src/format.ts";

test("defaults: pesticide and hornet, 0 to 2, 20000 bees per level, from 80000", () => {
  const s = parseSettings({});
  assert.deepEqual(s.factors.map((f) => f.id), ["pesticide", "hornet"]);
  assert.deepEqual(s.factors.map((f) => f.losses), [[20000, 20000], [20000, 20000]]);
  assert.equal(s.startPopulation, 80000);
  assert.equal(s.question, "none");
  assert.equal(s.showTable, true);
  assert.equal(s.maxTrials, 12);
  assert.equal(s.language, "en");
});

test("the original's rule: 80000 − 20000·(pesticide + hornet), its bees and its flower groups", () => {
  const s = parseSettings({});
  const expected: Record<number, [number, number, number]> = {
    0: [80000, 8, 4],
    1: [60000, 6, 3],
    2: [40000, 4, 1],
    3: [20000, 2, 1],
    4: [0, 0, 0],
  };
  for (let p = 0; p <= 2; p++) {
    for (let h = 0; h <= 2; h++) {
      const population = populationOf(s, { pesticide: p, hornet: h });
      assert.deepEqual([population, beesDrawn(s, population), flowerGroupsOf(s, population)], expected[p + h], `${p} ${h}`);
    }
  }
});

test("levels stay on the slider; a factor that is off does not count", () => {
  const s = parseSettings({});
  assert.deepEqual(levelsFor(s, { pesticide: 5, hornet: -1, varroa: 2 }), { pesticide: 2, hornet: 0 });
  assert.equal(populationOf(s, { varroa: 2 }), 80000);
  const v = parseSettings({ varroa: "true" });
  assert.equal(populationOf(v, { varroa: 2 }), 60000); // 10000 per level by default
  assert.equal(populationOf(v, { pesticide: 2, hornet: 2, varroa: 2 }), 0); // never below 0
});

test("effects per level, a start population and bees per icon", () => {
  assert.deepEqual(parseLosses("10000; 30000", 3, 1), [10000, 30000, 30000]);
  assert.deepEqual(parseLosses("", 2, 500), [500, 500]);
  assert.deepEqual(parseLosses("5000", 1, 1), [5000]);
  const s = parseSettings({ startPopulation: "50000", pesticideEffect: "5000;15000", hornetLevels: "3", hornetEffect: "8000", beesPerIcon: "2500" });
  assert.equal(populationOf(s, { pesticide: 1 }), 45000);
  assert.equal(populationOf(s, { pesticide: 2, hornet: 3 }), 6000);
  assert.equal(beesDrawn(s, 50000), 20);
  assert.equal(beesDrawn(parseSettings({ beesPerIcon: "100" }), 80000), 40); // at most 40 drawn
});

test("settings: nonsense falls back, levels 1 to 6, not every factor off", () => {
  const s = parseSettings({ pesticideLevels: "9", hornetLevels: "0", startPopulation: "-3", maxTrials: "500", language: "fr-FR" });
  assert.equal(s.factors[0].levels, 6);
  assert.equal(s.factors[1].levels, 1);
  assert.equal(s.startPopulation, 80000);
  assert.equal(s.maxTrials, 50);
  assert.equal(s.language, "fr");
  assert.deepEqual(parseSettings({ pesticide: "false", hornet: "false" }).factors.map((f) => f.id), ["pesticide"]);
  assert.deepEqual(parseCombination("1; 2"), { pesticide: 1, hornet: 2, varroa: 0 });
  assert.equal(num("80 000"), 80000);
  assert.equal(num("80.000"), 80000);
  assert.equal(num("1,5"), 1.5);
});

test("the question about the largest effect", () => {
  const s = parseSettings({ question: "largestEffect" });
  assert.equal(largestEffect(s), "equal"); // the original's 20000 and 20000
  assert.deepEqual(effectChoices(s), ["pesticide", "hornet", "equal"]);
  assert.ok(isCorrect(s, "equal"));
  assert.ok(!isCorrect(s, "hornet"));
  const h = parseSettings({ question: "largestEffect", hornetEffect: "25000", varroa: "true" });
  assert.equal(answerKeyOf(h), "hornet");
  assert.deepEqual(effectChoices(h), ["pesticide", "hornet", "varroa", "equal"]);
  // the author's key wins, when it is one of the choices
  assert.equal(answerKeyOf(parseSettings({ question: "largestEffect", answerKey: "Pesticide" })), "pesticide");
  assert.equal(answerKeyOf(parseSettings({ question: "largestEffect", answerKey: "varroa" })), "equal"); // varroa is off
  assert.equal(answerKeyOf(parseSettings({})), null);
});

test("the prediction question", () => {
  const s = parseSettings({ question: "predict", predictLevels: "1;2;0" });
  assert.equal(answerKeyOf(s), "20000");
  assert.ok(isCorrect(s, "20000"));
  assert.ok(!isCorrect(s, "20500"));
  assert.ok(!isCorrect(s, ""));
  const t = parseSettings({ question: "predict", predictLevels: "1;2", tolerance: "1000" });
  assert.ok(isCorrect(t, "20500"));
  assert.equal(answerKeyOf(parseSettings({ question: "predict", answerKey: "45 000" })), "45000");
  // levels beyond the slider are its highest level
  assert.equal(answerKeyOf(parseSettings({ question: "predict", predictLevels: "5;0" })), "40000");
});

test("numbers per language", () => {
  assert.equal(formatNumber(80000, "en"), "80,000");
  assert.equal(formatNumber(80000, "nl"), "80.000");
  assert.equal(formatNumber(80000, "fr"), "80 000");
  assert.equal(formatNumber(0, "en"), "0");
  assert.equal(formatNumber(1234567.5, "nl", 1), "1.234.567,5");
  assert.equal(formatNumber(-1500, "en"), "−1,500");
  assert.equal(parseAnswer("60 000", "fr"), 60000);
  assert.equal(parseAnswer("60.000", "nl"), 60000);
  assert.equal(parseAnswer("60,000", "en"), 60000);
  assert.equal(parseAnswer("60000,5", "nl"), 60000.5);
  assert.equal(parseAnswer("60000.5", "en"), 60000.5);
  assert.equal(parseAnswer("veel", "nl"), null);
  assert.equal(parseAnswer("", "en"), null);
});
