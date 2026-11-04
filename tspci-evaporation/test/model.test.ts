// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/MaraisSalantpci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// npm test: the evaporation model (src/model.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type Container, crystalTime, crystalsAt, dryTime, isFairTest, rateOf, resultAt, temperatureFactor, variedVariables, volumeAt,
} from "../src/model.ts";

const base: Container = { temperature: 20, width: 10, wind: false, salt: 35, volume: 200 };
const close = (actual: number, expected: number, margin = 0.05) =>
  assert.ok(Math.abs(actual - expected) <= margin, `${actual} is not ${expected} ± ${margin}`);

test("the default container: 5 mL per hour, dry after 40 h", () => {
  close(rateOf(base), 5, 1e-9);
  close(dryTime(base), 40, 1e-9);
  close(volumeAt(base, 10), 150, 1e-9);
  assert.equal(volumeAt(base, 100), 0);
});

test("twice the surface evaporates twice as fast", () => {
  close(rateOf({ ...base, width: 20 }) / rateOf(base), 2, 1e-9);
  close(dryTime({ ...base, width: 20 }), 20, 1e-9);
});

test("warm water evaporates much faster (vapour pressure)", () => {
  close(temperatureFactor(20), 1, 1e-9);
  close(temperatureFactor(60), 8.5, 0.1);
  close(temperatureFactor(10), 0.53, 0.01);
  assert.ok(dryTime({ ...base, temperature: 60 }) < 5);
});

test("wind doubles the rate; salt and volume do not change it", () => {
  close(rateOf({ ...base, wind: true }), 10, 1e-9);
  close(rateOf({ ...base, salt: 200 }), 5, 1e-9);
  close(rateOf({ ...base, volume: 400 }), 5, 1e-9);
  close(dryTime({ ...base, volume: 400 }), 80, 1e-9);
});

test("salt crystallizes when the water left is saturated", () => {
  // 7 g of salt; 360 g/L → saturated at 19.4 mL, after (200 − 19.4) / 5 = 36.1 h
  close(crystalTime(base)!, 36.1, 0.05);
  assert.equal(crystalsAt(base, 30), 0);
  close(crystalsAt(base, 40), 7, 1e-9);
  assert.equal(crystalTime({ ...base, salt: 0 }), null);
  // more salt than the water can hold: crystals at once
  assert.equal(crystalTime({ ...base, salt: 400 }), 0);
});

test("the result of a run", () => {
  assert.deepEqual(resultAt(base, 48), { dryAfter: 40, crystalsFrom: 36.1, volumeLeft: 0, crystals: 7 });
  assert.deepEqual(resultAt({ ...base, width: 5 }, 48), { dryAfter: null, crystalsFrom: null, volumeLeft: 80, crystals: 0 });
});

test("a fair test: only one variable differs, and it is the target", () => {
  const wide = { ...base, width: 20 };
  assert.deepEqual(variedVariables([base, wide]), ["area"]);
  assert.equal(isFairTest([base, wide], "area"), true);
  assert.equal(isFairTest([base, wide], "temperature"), false);
  assert.equal(isFairTest([base, wide], null), true);
  // two things differ: not fair
  const wideAndWarm = { ...wide, temperature: 40 };
  assert.deepEqual(variedVariables([base, wideAndWarm]), ["temperature", "area"]);
  assert.equal(isFairTest([base, wideAndWarm], "area"), false);
  // nothing differs: not a test
  assert.equal(isFairTest([base, { ...base }], "area"), false);
  // three containers, the third one wider still
  assert.equal(isFairTest([base, wide, { ...base, width: 30 }], "area"), true);
  assert.equal(isFairTest([base, wide, { ...base, wind: true }], "area"), false);
});
