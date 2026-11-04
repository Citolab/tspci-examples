// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Volcanismepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// npm test: the model (src/model.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answersText, outcomeFor, parseAnswers, parseEruptions, parseRules, parseSettings, reachableOutcomes, riseAt, runExperiment,
  scoreAnswers, validExperiment,
} from "../src/model.ts";

test("defaults: three thicknesses, up to three tablets, no task", () => {
  const s = parseSettings({});
  assert.deepEqual(s.viscosities, ["fluid", "medium", "compact"]);
  assert.equal(s.maxTablets, 3);
  assert.equal(s.task, "none");
  assert.deepEqual(s.key, {});
  assert.equal(s.showEruption, true);
  assert.equal(s.animation, "auto");
  assert.equal(s.language, "en");
});

test("settings as TAO passes them: text, odd values", () => {
  const s = parseSettings({ viscosityLevels: "2", maxTablets: "7", showEruptionType: "false", language: "fr-FR", animation: "steps" });
  assert.deepEqual(s.viscosities, ["fluid", "compact"]);
  assert.equal(s.maxTablets, 3);
  assert.equal(s.showEruption, false);
  assert.equal(s.language, "fr");
  assert.equal(s.animation, "steps");
  assert.equal(parseSettings({ maxTablets: "0" }).maxTablets, 1);
  assert.equal(parseSettings({ maxTablets: "abc" }).maxTablets, 1);
  assert.equal(parseSettings({ language: "NL" }).language, "nl");
});

test("the default rule table", () => {
  const rules = parseRules("");
  assert.equal(outcomeFor(rules, "fluid", 1), "flow");
  assert.equal(outcomeFor(rules, "fluid", 3), "flow");
  assert.equal(outcomeFor(rules, "medium", 1), "flow");
  assert.equal(outcomeFor(rules, "medium", 2), "flow");
  assert.equal(outcomeFor(rules, "medium", 3), "explosion");
  assert.equal(outcomeFor(rules, "compact", 1), "dome");
  assert.equal(outcomeFor(rules, "compact", 2), "explosion");
  assert.equal(outcomeFor(rules, "compact", 3), "explosion");
});

test("rules: an exact number before n+, a higher n+ before a lower one, unknown words skipped", () => {
  const rules = parseRules("compact = dome\ncompact 1+ = flow; compact 2+ = explosion; compact 3 = dome; lava = flow; fluid = boom; medium 2 = dome");
  assert.equal(rules.length, 5);
  assert.equal(outcomeFor(rules, "compact", 1), "flow");
  assert.equal(outcomeFor(rules, "compact", 2), "explosion");
  assert.equal(outcomeFor(rules, "compact", 3), "dome");
  // no rule for a fluid purée: a flow; medium with 1 tablet: no matching rule, so a dome
  assert.equal(outcomeFor(rules, "fluid", 2), "flow");
  assert.equal(outcomeFor(rules, "medium", 1), "dome");
  assert.equal(outcomeFor(rules, "medium", 2), "dome");
});

test("eruption types: defaults, overridden per outcome", () => {
  assert.deepEqual(parseEruptions(""), { flow: "effusive", dome: "explosive", explosion: "explosive" });
  assert.deepEqual(parseEruptions("dome = effusive; flow = boom"), { flow: "effusive", dome: "effusive", explosion: "explosive" });
});

test("the original: two thicknesses and one tablet give a flow and a dome", () => {
  const s = parseSettings({ viscosityLevels: "2", maxTablets: "1" });
  assert.deepEqual(reachableOutcomes(s), ["flow", "dome"]);
  assert.deepEqual(runExperiment(s, "fluid", 1), { viscosity: "fluid", tablets: 1, outcome: "flow", eruption: "effusive" });
  assert.deepEqual(runExperiment(s, "compact", 1), { viscosity: "compact", tablets: 1, outcome: "dome", eruption: "explosive" });
});

test("the key derived from the settings", () => {
  const v = parseSettings({ task: "viscosity" });
  assert.deepEqual(v.key, { flow: ["fluid", "medium"], dome: ["compact"], explosion: ["medium", "compact"] });
  const e = parseSettings({ task: "eruption", viscosityLevels: "2", maxTablets: "1" });
  assert.deepEqual(e.key, { flow: ["effusive"], dome: ["explosive"] });
});

test("the author's key wins; answers that are not options are dropped", () => {
  const s = parseSettings({ task: "viscosity", key: "flow = fluid; explosion = compact | lava; dome = medium" });
  assert.deepEqual(s.key, { flow: ["fluid"], dome: ["medium"], explosion: ["compact"] });
  // a key for an outcome the candidate cannot get is not in the task
  const two = parseSettings({ task: "viscosity", viscosityLevels: "2", maxTablets: "1", key: "explosion = compact" });
  assert.deepEqual(Object.keys(two.key), ["flow", "dome"]);
});

test("scoring the matching", () => {
  const s = parseSettings({ task: "viscosity" });
  assert.deepEqual(scoreAnswers(s, {}), { score: 0, maxscore: 3, correct: 0 });
  assert.deepEqual(scoreAnswers(s, { flow: "fluid", dome: "compact", explosion: "fluid" }), { score: 2, maxscore: 3, correct: 0 });
  assert.deepEqual(scoreAnswers(s, { flow: "medium", dome: "compact", explosion: "compact" }), { score: 3, maxscore: 3, correct: 1 });
  assert.deepEqual(scoreAnswers(parseSettings({}), { flow: "fluid" }), { score: 0, maxscore: 0, correct: 0 });
});

test("answers as text and back", () => {
  const answers = { explosion: "explosive", flow: "effusive" };
  assert.equal(answersText(answers), "flow=effusive;explosion=explosive");
  assert.deepEqual(parseAnswers("flow=effusive;explosion=explosive;lava=x"), { flow: "effusive", explosion: "explosive" });
});

test("experiments from a response are checked", () => {
  assert.deepEqual(validExperiment({ viscosity: "fluid", tablets: 2, outcome: "flow", eruption: "effusive" }),
    { viscosity: "fluid", tablets: 2, outcome: "flow", eruption: "effusive" });
  assert.equal(validExperiment({ viscosity: "lava", tablets: 2, outcome: "flow", eruption: "effusive" }), null);
  assert.equal(validExperiment({ viscosity: "fluid", tablets: 0, outcome: "flow", eruption: "effusive" }), null);
  assert.equal(validExperiment(null), null);
});

test("the purée rises in the second and third stage", () => {
  assert.equal(riseAt(0), 0);
  assert.equal(riseAt(0.25), 0);
  assert.ok(Math.abs(riseAt(0.5) - 0.3) < 1e-9);
  assert.equal(riseAt(0.75), 1);
  assert.equal(riseAt(1), 1);
});
