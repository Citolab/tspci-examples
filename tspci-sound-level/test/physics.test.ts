// npm test: the physics (src/physics.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { correctValue, decimalsOf, distanceForLevel, intensity, levelOf, nearestDistance, powerForLevel, snap, soundLevel, visibility } from "../src/physics.ts";
import { parseSettings } from "../src/settings.ts";

const close = (actual: number, expected: number, margin = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= margin, `${actual} is not ${expected} ± ${margin}`);

test("intensity of a point source", () => {
  close(intensity(4 * Math.PI, 1), 1);
  close(intensity(100, 10), 100 / (400 * Math.PI));
});

test("sound level", () => {
  close(soundLevel(4 * Math.PI * 1e-12, 1), 0); // I = I0
  close(soundLevel(4 * Math.PI, 1), 120); // 1 W/m²
  // twice as far: 6 dB less; twice the power: 3 dB more
  close(soundLevel(25, 200) - soundLevel(25, 400), 20 * Math.log10(2));
  close(soundLevel(50, 400) - soundLevel(25, 400), 10 * Math.log10(2));
  close(soundLevel(25, 400), 70.94, 0.01);
  // the 2025 exam's simulation used I0 = 1.2e-12: 0.79 dB lower
  close(soundLevel(25, 400, 1.2e-12), 70.15, 0.01);
  assert.equal(soundLevel(0, 400), -Infinity);
});

test("58 dB at 400 m is a small power, well under 25 W", () => {
  close(powerForLevel(58, 400), 1.27, 0.01);
  close(powerForLevel(58, 400, 1.2e-12), 1.52, 0.01);
  assert.ok(soundLevel(25, 400) > 58 && soundLevel(25, 900) > 58); // 25 W is louder anywhere on the 10–900 m slider
});

test("distance and power for a level are the inverse of the level", () => {
  for (const [p, r] of [[25, 400], [100, 12], [0.5, 3]]) {
    const level = soundLevel(p, r);
    close(distanceForLevel(level, p), r, 1e-6);
    close(powerForLevel(level, r), p, 1e-9);
  }
});

test("steps and snapping", () => {
  assert.deepEqual([10, 1, 0.5, 0.25, 1e-3, 1.5e-7].map(decimalsOf), [0, 0, 1, 2, 3, 8]);
  assert.equal(snap(404, 10, 900, 10), 400);
  assert.equal(snap(0.30000000000000004, 0, 1, 0.1), 0.3);
  assert.equal(snap(1234, 10, 900, 10), 900);
  assert.equal(snap(-5, 10, 900, 10), 10);
  assert.equal(snap(7, 5, 100, 10), 5); // the grid starts at the minimum
  assert.equal(snap(14, 5, 100, 10), 15);
});

test("visibility of the waves", () => {
  assert.deepEqual([-10, 0, 65, 130, 200, Infinity, -Infinity].map(visibility), [0, 0, 0.5, 1, 1, 1, 0]);
});

test("the level with the item's units", () => {
  const s = parseSettings({ powerUnit: "kW", distanceUnit: "km" });
  close(levelOf(s, 1, 1), soundLevel(1000, 1000));
});

test("the correct response from a target level", () => {
  const s = parseSettings({ mode: "answer", answer: "distance", targetLevel: "70", power: "50", powers: "25;50;100", distanceMin: "10", distanceMax: "1000", distanceStep: "10" });
  const exact = distanceForLevel(70, 50);
  assert.equal(correctValue(s), nearestDistance(s, exact));
  assert.equal(correctValue(s), 630); // 630.8 m
  // tool mode or no target: no correct response
  assert.equal(correctValue({ ...s, mode: "tool" }), null);
  assert.equal(correctValue({ ...s, targetLevel: null }), null);
  // out of reach of the slider
  assert.equal(correctValue({ ...s, targetLevel: 20 }), null);
  // the power for 80 dB at 100 m, on a slider from 1 to 100 W by 0.5
  const power = parseSettings({ mode: "answer", answer: "power", targetLevel: "80", distance: "100", powerInput: "slider", powerMin: "1", powerMax: "100", powerStep: "0.5" });
  assert.equal(correctValue(power), 12.5); // 12.57 W
  // the 2025 exam's I0
  assert.equal(correctValue({ ...s, referenceIntensity: 1.2e-12 }), 580); // 575.8 m
});
