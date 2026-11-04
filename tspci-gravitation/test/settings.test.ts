// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/NouvelleTerrepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// npm test: the settings and the scoring of the question (src/settings.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { keyOf, languageOf, num, parseRange, parseSettings, parseVariables, scoreOf, snap } from "../src/settings.ts";

test("defaults: the sliders of the original", () => {
  const s = parseSettings({});
  assert.equal(s.starMass, 1e36);
  assert.deepEqual(s.ranges.distance, { min: 50, max: 550, step: 50 });
  assert.deepEqual(s.ranges.mass, { min: 1, max: 30, step: 1 });
  assert.deepEqual(s.ranges.radius, { min: 2500, max: 22500, step: 500 });
  assert.deepEqual(s.start, { distance: 100, mass: 10, radius: 10000 });
  assert.deepEqual(s.shown, ["distance", "mass", "radius"]);
  assert.equal(s.digits, 3);
  assert.equal(s.record, true);
  assert.equal(s.maxRecords, 20);
  assert.equal(s.question, "none"); // without the setting; config.json's default turns it on
  assert.deepEqual(s.key, ["distance", "mass"]);
  assert.equal(s.language, "en");
});

test("numbers in settings", () => {
  assert.equal(num("1e36"), 1e36);
  assert.equal(num("1,989e30"), 1.989e30);
  assert.equal(num("1.989 × 10^30"), 1.989e30);
  assert.equal(num("2x10^5"), 2e5);
  assert.equal(num("−3"), -3);
  assert.equal(num("abc"), null);
  assert.equal(parseSettings({ starMass: "-5" }).starMass, 1e36);
  assert.equal(parseSettings({ starMass: "1.989e30" }).starMass, 1.989e30);
});

test("ranges and start values", () => {
  const fallback = { min: 50, max: 550, step: 50 };
  assert.deepEqual(parseRange("10", "100", "5", fallback), { min: 10, max: 100, step: 5 });
  assert.deepEqual(parseRange("0", "400", "50", fallback), { min: 50, max: 400, step: 50 }); // no distance of 0
  assert.deepEqual(parseRange("600", "100", "50", fallback), { min: 600, max: 6000, step: 50 });
  assert.deepEqual(parseRange("1", "2", "5", fallback), { min: 1, max: 2, step: 0.01 });
  const s = parseSettings({ distance: "1000", mass: "2.4", massStep: "0.5", radius: "x" });
  assert.equal(s.start.distance, 550);
  assert.equal(s.start.mass, 2.5);
  assert.equal(s.start.radius, 10000);
  assert.equal(snap(0.1 + 0.2, { min: 0, max: 1, step: 0.1 }), 0.3);
  assert.equal(snap(549, { min: 50, max: 550, step: 50 }), 550);
});

test("shown variables, digits, table, language", () => {
  const s = parseSettings({ showRadius: "false", digits: "9", maxRecords: "0", record: "FALSE", language: "fr-FR" });
  assert.deepEqual(s.shown, ["distance", "mass"]);
  assert.equal(s.digits, 5);
  assert.equal(s.maxRecords, 1);
  assert.equal(s.record, false);
  assert.equal(s.language, "fr");
  assert.equal(languageOf("NL"), "nl");
  assert.equal(languageOf("de"), "en");
});

test("variables in the key, in three languages", () => {
  assert.deepEqual(parseVariables("mass;distance"), ["distance", "mass"]);
  assert.deepEqual(parseVariables("Afstand, massa"), ["distance", "mass"]);
  assert.deepEqual(parseVariables("rayon masse"), ["mass", "radius"]);
  assert.deepEqual(parseVariables("colour; mass; mass"), ["mass"]);
  assert.deepEqual(parseVariables(""), []);
  assert.deepEqual(parseSettings({ key: "" }).key, []);
});

test("scoring the question: exactly the key, of the variables shown", () => {
  const s = parseSettings({ question: "influence" });
  assert.equal(s.question, "influence");
  assert.equal(scoreOf(s, ["distance", "mass"]), 1);
  assert.equal(scoreOf(s, ["mass", "distance"]), 1);
  assert.equal(scoreOf(s, ["distance"]), 0);
  assert.equal(scoreOf(s, ["distance", "mass", "radius"]), 0); // the distractor
  assert.equal(scoreOf(s, []), 0);
  // only the mass and the radius shown: the key is the mass
  const two = parseSettings({ question: "influence", showDistance: "false" });
  assert.deepEqual(keyOf(two), ["mass"]);
  assert.equal(scoreOf(two, ["mass"]), 1);
  assert.equal(scoreOf(two, ["mass", "distance"]), 1); // a hidden variable cannot be ticked, so it does not count
  // an author who says nothing influences it
  assert.equal(scoreOf(parseSettings({ key: "" }), []), 1);
});
