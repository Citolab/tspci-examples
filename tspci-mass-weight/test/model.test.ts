// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/ForceGravitepci and
// https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Delorpci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026
// npm test: the bench (src/model.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cylinderLevel, expectedAnswers, formatNumber, initialBench, move, newReadings, parseMass, parseObjects, parseSettings, parseVolume,
  readingsOf, scoreAnswers, usedOf, validBench, type Bench,
} from "../src/model.ts";

const close = (actual: number, expected: number, margin = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= margin, `${actual} is not ${expected} ± ${margin}`);

const defaults = parseSettings({ objects: "statuette\nmeteorite" });
const statuette = defaults.objects[0];

test("the default settings: three places, three instruments, the statuette and the meteorite", () => {
  assert.deepEqual(defaults.places, [{ id: "earth", g: 9.8 }, { id: "moon", g: 1.6 }, { id: "mars", g: 3.6 }]);
  assert.deepEqual(defaults.instruments, ["scale", "dynamometer", "cylinder"]);
  assert.deepEqual(defaults.objects.map((o) => [o.id, o.mass, o.volume, o.fits]), [["statuette", 190, 10, true], ["meteorite", 40000, 5000, false]]);
  assert.equal(defaults.language, "en");
});

test("places, instruments and g from the settings", () => {
  const s = parseSettings({ places: "Maan, mars", gMoon: "1,62", showScale: "false", showCylinder: "false" });
  assert.deepEqual(s.places, [{ id: "moon", g: 1.62 }, { id: "mars", g: 3.6 }]);
  assert.deepEqual(s.instruments, ["dynamometer"]);
  assert.deepEqual(parseSettings({ places: "venus" }).places.map((p) => p.id), ["earth", "moon", "mars"]);
});

test("objects: built-in names, changed values and custom lines in three languages", () => {
  const objects = parseObjects("stone, cube\nstatuette; 250 g\nGold ring | Gouden ring | Bague en or; 12 g; 0,6 mL\nBrick; 2 kg;\nnonsense", 100);
  assert.deepEqual(objects.map((o) => o.id), ["stone", "cube", "statuette", "object3", "object4"]);
  assert.equal(objects[2].mass, 250);
  assert.equal(objects[2].volume, 10);
  assert.deepEqual(objects[3].names, { en: "Gold ring", nl: "Gouden ring", fr: "Bague en or" });
  close(objects[3].volume!, 0.6);
  assert.equal(objects[4].mass, 2000);
  assert.equal(objects[4].volume, null);
  assert.equal(objects[4].fits, false);
  assert.deepEqual(parseObjects("", 100).map((o) => o.id), ["statuette"]);
  assert.equal(parseMass("0,5 kg"), 500);
  assert.equal(parseVolume("1,5 L"), 1500);
  assert.equal(parseVolume("12 cm³"), 12);
});

test("the cylinder: Delor's statuette is partly under water below 50 mL, then adds its 10 mL", () => {
  assert.deepEqual(cylinderLevel(70, null), { level: 70, submerged: 0, partly: false });
  close(cylinderLevel(25, statuette).level, 30); // 25 · 1.2, as the original
  assert.equal(cylinderLevel(25, statuette).partly, true);
  assert.deepEqual(cylinderLevel(50, statuette), { level: 60, submerged: 10, partly: false });
  assert.deepEqual(cylinderLevel(70, statuette), { level: 80, submerged: 10, partly: false });
  assert.equal(cylinderLevel(0, statuette).level, 0);
});

test("readings: the scale shows the mass everywhere, the dynamometer m·g", () => {
  let b: Bench = { ...initialBench(defaults), scaleOn: true };
  b = move(defaults, b, "meteorite", "scale");
  assert.equal(readingsOf(defaults, b).scale.value, 40000);
  b = move(defaults, b, "meteorite", "dynamometer");
  assert.equal(readingsOf(defaults, b).scale.value, 0);
  assert.equal(readingsOf(defaults, b).dynamometer.value, 392);
  assert.equal(readingsOf(defaults, { ...b, place: "moon" }).dynamometer.value, 64);
  assert.equal(readingsOf(defaults, { ...b, place: "mars" }).dynamometer.value, 144);
  assert.equal(readingsOf(defaults, { ...b, place: "moon", placements: { meteorite: "scale" } }).scale.value, 40000);
  // a scale calibrated on Earth shows less on the Moon
  const earth = parseSettings({ objects: "meteorite", scaleType: "earth" });
  close(readingsOf(earth, { ...b, place: "moon", placements: { meteorite: "scale" } }).scale.value!, 6531, 1);
});

test("readings: off, tare, overload, over range", () => {
  const b = initialBench(defaults);
  assert.equal(b.scaleOn, false);
  assert.deepEqual(readingsOf(defaults, b).scale, { place: "earth", instrument: "scale", object: null, value: null, unit: "g", note: "off" });
  const on = { ...b, scaleOn: true, placements: { statuette: "scale" as const }, tare: 190 };
  assert.equal(readingsOf(defaults, on).scale.value, 0);
  assert.equal(readingsOf(defaults, { ...on, placements: {} }).scale.value, -190);
  const small = parseSettings({ objects: "meteorite", scaleCapacity: "10", dynamometerMax: "100" });
  const heavy = { ...on, tare: 0, placements: { meteorite: "scale" as const } };
  assert.equal(readingsOf(small, heavy).scale.note, "overload");
  assert.equal(readingsOf(small, { ...heavy, placements: { meteorite: "dynamometer" } }).dynamometer.note, "overRange");
});

test("readings: above the scale and overflow", () => {
  const b: Bench = { ...initialBench(defaults), placements: { statuette: "cylinder" } };
  assert.equal(readingsOf(defaults, { ...b, water: 80 }).cylinder.value, 90);
  assert.equal(readingsOf(defaults, { ...b, water: 85 }).cylinder.note, "aboveScale");
  assert.equal(readingsOf(defaults, { ...b, water: 95 }).cylinder.note, "overflow");
  assert.equal(readingsOf(defaults, { ...b, water: 95 }).cylinder.value, null);
  assert.equal(readingsOf(defaults, { ...b, water: 20 }).cylinder.note, "partly");
});

test("moving: one object per instrument, the meteorite does not fit in the cylinder", () => {
  let b = initialBench(defaults);
  b = move(defaults, b, "statuette", "scale");
  b = move(defaults, b, "meteorite", "scale");
  assert.deepEqual(b.placements, { meteorite: "scale" });
  assert.deepEqual(move(defaults, b, "meteorite", "cylinder"), b);
  b = move(defaults, b, "meteorite", "table");
  assert.deepEqual(b.placements, {});
});

test("the log: only readings that change, and what was used where", () => {
  const b0: Bench = { ...initialBench(defaults), scaleOn: true };
  const b1 = move(defaults, b0, "meteorite", "dynamometer");
  const added = newReadings(defaults, b0, b1);
  assert.deepEqual(added, [{ place: "earth", instrument: "dynamometer", object: "meteorite", value: 392, unit: "N" }]);
  const b2 = { ...b1, place: "moon" as const };
  const more = newReadings(defaults, b1, b2);
  assert.deepEqual(more.map((r) => [r.instrument, r.value]), [["scale", 0], ["dynamometer", 64]]);
  assert.equal(usedOf([...added, ...more]), "earth:dynamometer moon:dynamometer");
});

test("answers: expected values, units and the tolerance", () => {
  const s = parseSettings({ objects: "statuette", answers: "mass, weight, volume, density", answerPlace: "moon", tolerance: "5" });
  const e = expectedAnswers(s);
  assert.equal(e.mass, 190);
  close(e.weight!, 0.304);
  assert.equal(e.volume, 10);
  assert.equal(e.density, 19);
  const score = scoreAnswers(s, { mass: "190", weight: "0,30", volume: "11", density: "abc" });
  assert.deepEqual(score.right, { mass: true, weight: true, volume: false });
  assert.equal(score.score, 2);
  assert.equal(score.maxscore, 4);
  const kg = parseSettings({ objects: "statuette", answers: "mass density", massUnit: "kg", densityUnit: "kg/m3" });
  assert.equal(expectedAnswers(kg).mass, 0.19);
  assert.equal(expectedAnswers(kg).density, 19000);
});

test("validBench drops what does not fit the settings", () => {
  const b = validBench(defaults, { place: "pluto", placements: { meteorite: "cylinder", statuette: "scale", ghost: "scale" }, water: 999, scaleOn: true, tare: "x" });
  assert.deepEqual(b, { place: "earth", placements: { statuette: "scale" }, water: 140, scaleOn: true, tare: 0 });
});

test("numbers per language", () => {
  assert.equal(formatNumber(1.86, "en"), "1.86");
  assert.equal(formatNumber(1.86, "nl"), "1,86");
  assert.equal(formatNumber(1.86, "fr"), "1,86");
  assert.equal(formatNumber(-190, "en", 0, true), "−190");
});
