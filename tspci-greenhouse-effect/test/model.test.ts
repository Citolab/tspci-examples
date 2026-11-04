// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/EffetDeSerrepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// npm test: the model (src/model.ts), the settings and the numbers in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { KELVIN, SIGMA, flows, levelFor, levels, onTarget, roundTo, snapLevel, temperatureAt } from "../src/model.ts";
import { correctPrediction, parseSettings } from "../src/settings.ts";
import { formatNumber } from "../src/format.ts";

const close = (actual: number, expected: number, margin = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= margin, `${actual} is not ${expected} ± ${margin}`);

const EARTH = { solarConstant: 1361, albedo: 0.3, atmosphereSolar: 0 };

test("the classic one-layer model", () => {
  // no greenhouse gas: the effective temperature of the Earth, −18.6 °C
  close(temperatureAt(EARTH, 0), 254.6 - KELVIN, 0.1);
  // the default 78 % gives about 15 °C
  close(temperatureAt(EARTH, 78), 15, 0.2);
  // a perfect absorber: 2^¼ times the effective temperature
  close(flows(EARTH, 1).surfaceTemperature, flows(EARTH, 0).surfaceTemperature * Math.pow(2, 0.25), 1e-9);
  // Ts = [S(1−a)/4 / (σ(1−ε/2))]^¼
  const e = 0.6;
  close(flows(EARTH, e).surfaceTemperature, Math.pow((1361 * 0.7) / 4 / (SIGMA * (1 - e / 2)), 0.25), 1e-9);
});

test("energy is conserved at the top, in the atmosphere and at the surface", () => {
  for (const atmosphereSolar of [0, 0.2]) {
    for (const e of [0, 0.3, 0.78, 1]) {
      const f = flows({ ...EARTH, atmosphereSolar }, e);
      close(f.reflected + f.window + f.atmosphereUp, f.incoming, 1e-9);
      close(f.solarSurface + f.backRadiation, f.surfaceInfrared, 1e-9);
      close(f.solarAtmosphere + f.absorbedInfrared, f.atmosphereUp + f.backRadiation, 1e-9);
      close(f.reflected + f.solarAtmosphere + f.solarSurface, f.incoming, 1e-9);
    }
  }
});

test("more greenhouse gas: warmer, more back radiation", () => {
  let previous = -Infinity;
  let back = -Infinity;
  for (const l of levels(5)) {
    const t = temperatureAt(EARTH, l);
    assert.ok(t > previous);
    assert.ok(flows(EARTH, l / 100).backRadiation > back);
    previous = t;
    back = flows(EARTH, l / 100).backRadiation;
  }
});

test("sunlight absorbed in the air cools the surface", () => {
  assert.ok(temperatureAt({ ...EARTH, atmosphereSolar: 0.2 }, 78) < temperatureAt(EARTH, 78));
  // without greenhouse gas the atmosphere sends half of what it absorbs down
  const f = flows({ ...EARTH, atmosphereSolar: 0.2 }, 0);
  close(f.backRadiation, f.solarAtmosphere / 2, 1e-9);
});

test("levels, snapping, targets", () => {
  assert.equal(levels(25).join(), "0,25,50,75,100");
  assert.equal(levels(1).length, 101);
  assert.equal(snapLevel(77.6, 1), 78);
  assert.equal(snapLevel(-3, 1), 0);
  assert.equal(snapLevel(130, 1), 100);
  assert.equal(snapLevel(99, 7), 98);
  const level = levelFor(EARTH, 20, 1, 1);
  assert.ok(onTarget(roundTo(temperatureAt(EARTH, level), 1), 20, 0.5));
  assert.ok(!onTarget(roundTo(temperatureAt(EARTH, level - 3), 1), 20, 0.5));
  assert.ok(onTarget(20.5, 20, 0.5));
  assert.ok(!onTarget(20.6, 20, 0.5));
});

test("settings: defaults and checks", () => {
  const s = parseSettings({});
  assert.equal(s.solarConstant, 1361);
  assert.equal(s.albedo, 0.3);
  assert.equal(s.atmosphereSolar, 0);
  assert.equal(s.startLevel, 78);
  assert.equal(s.levelStep, 1);
  assert.equal(s.numbers, "wm2");
  assert.equal(s.question, "none");
  assert.equal(s.language, "en");
  assert.equal(s.temperatureUnit, "C");
  const t = parseSettings({ albedo: "30", atmosphereSolar: "20 ", startLevel: "77", levelStep: "5", decimals: "9", language: "fr-FR", tolerance: "-1", question: "TARGET" });
  assert.equal(t.albedo, 0.3);
  assert.equal(t.atmosphereSolar, 0.2);
  assert.equal(t.startLevel, 75);
  assert.equal(t.decimals, 3);
  assert.equal(t.language, "fr");
  assert.equal(t.tolerance, 0.5);
  assert.equal(t.question, "target");
  close(parseSettings({ albedo: "0,8", atmosphereSolar: "0.5" }).atmosphereSolar, 0.2, 1e-9);
  assert.equal(correctPrediction(parseSettings({ direction: "less" })), "down");
  assert.equal(correctPrediction(parseSettings({})), "up");
});

test("numbers per language", () => {
  assert.equal(formatNumber(14.96, 1, "en"), "15.0");
  assert.equal(formatNumber(14.96, 1, "nl"), "15,0");
  assert.equal(formatNumber(-18.55, 1, "fr"), "−18,6");
  assert.equal(formatNumber(-0.01, 1, "en"), "0.0");
});
