// npm test: the arithmetic of the chart (src/scale.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { arcPath, extent, formatNumber, linear, niceAxis, niceStep, polar, slices, stack, stepDecimals, textOn, withUnit } from "../src/scale.ts";

test("nice steps", () => {
  assert.equal(niceStep(100, 5), 20);
  assert.equal(niceStep(10, 5), 2);
  assert.equal(niceStep(1, 4), 0.25);
  assert.equal(niceStep(7, 5), 2);
  assert.equal(niceStep(0.3, 5), 0.1);
  assert.equal(niceStep(0), 1);
});

test("nice axes", () => {
  assert.deepEqual(niceAxis(0, 100), { min: 0, max: 100, step: 20, ticks: [0, 20, 40, 60, 80, 100] });
  assert.deepEqual(niceAxis(0, 61).ticks, [0, 20, 40, 60, 80]);
  assert.deepEqual(niceAxis(-12, 47).ticks, [-20, 0, 20, 40, 60]);
  assert.deepEqual(niceAxis(0.1, 0.27).ticks, [0.1, 0.15, 0.2, 0.25, 0.3]);
  // the author's min and max stay, ticks on multiples of the step
  const a = niceAxis(0, 61, 0, 70);
  assert.equal(a.max, 70);
  assert.deepEqual(a.ticks, [0, 10, 20, 30, 40, 50, 60, 70]);
  const b = niceAxis(0, 61, 5, null);
  assert.equal(b.min, 5);
  assert.equal(b.ticks[0], 20);
  // one value, or none
  assert.deepEqual(niceAxis(5, 5).ticks, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(niceAxis(0, 0).ticks, [0, 0.2, 0.4, 0.6, 0.8, 1]);
  // min > max: turned round
  assert.equal(niceAxis(0, 1, 10, 0).min, 0);
});

test("stacking", () => {
  assert.deepEqual(stack([58, 9, 14, 19]).map((s) => [s.start, s.end]), [[0, 58], [58, 67], [67, 81], [81, 100]]);
  assert.deepEqual(stack([5, -3, null, 2, -1]).map((s) => [s.start, s.end, s.value]), [[0, 5, 5], [0, -3, -3], [5, 5, null], [5, 7, 2], [-3, -4, -1]]);
  const p = stack([1, 1, 2], true);
  assert.deepEqual(p.map((s) => [s.start, s.end]), [[0, 25], [25, 50], [50, 100]]);
  assert.deepEqual(stack([0, 0], true).map((s) => s.end), [0, 0]);
});

test("extent", () => {
  assert.deepEqual(extent([[58, 9], [61, 15]], false, true), { lo: 0, hi: 61 });
  assert.deepEqual(extent([[58, 9], [61, 15]], true, true), { lo: 0, hi: 76 });
  assert.deepEqual(extent([[5, 8], [7, null]], false, false), { lo: 5, hi: 8 });
  assert.deepEqual(extent([[5, -3]], true, true), { lo: -3, hi: 5 });
  assert.deepEqual(extent([[null]], false, true), { lo: 0, hi: 1 });
});

test("linear scale", () => {
  const x = linear(0, 100, 50, 550);
  assert.equal(x(0), 50);
  assert.equal(x(50), 300);
  assert.equal(linear(0, 0, 10, 20)(5), 10);
});

test("numbers in English and Dutch", () => {
  assert.equal(formatNumber(1234.5, "en", 1), "1,234.5");
  assert.equal(formatNumber(1234.5, "nl", 1), "1234,5"); // four digits: no grouping in Dutch
  assert.equal(formatNumber(12345.678, "nl", 2), "12.345,68");
  assert.equal(formatNumber(1234567, "en", 0), "1,234,567");
  assert.equal(formatNumber(-3.5, "nl", 1), "−3,5");
  assert.equal(formatNumber(-0.001, "en", 1), "0.0");
  assert.equal(formatNumber(29, "nl-NL", 0), "29");
  assert.equal(formatNumber(NaN, "en", 0), "");
  assert.equal(stepDecimals(0.25), 2);
  assert.equal(stepDecimals(20), 0);
});

test("units", () => {
  assert.equal(withUnit("29", "%"), "29%");
  assert.equal(withUnit("12,50", "€"), "€ 12,50");
  assert.equal(withUnit("−5", "€"), "−€ 5");
  assert.equal(withUnit("1.4", "kWh"), "1.4 kWh");
  assert.equal(withUnit("3", ""), "3");
  assert.equal(withUnit("", "kWh"), "");
});

test("pie slices", () => {
  const s = slices([1, null, 3, -2, 0]);
  assert.deepEqual(s.map((x) => x.share), [0.25, 0, 0.75, 0, 0]);
  assert.ok(Math.abs(s[2].end - 2 * Math.PI) < 1e-9);
  assert.deepEqual(polar(0, 0, 10, 0), { x: 0, y: -10 });
  assert.deepEqual(polar(0, 0, 10, Math.PI / 2), { x: 10, y: 0 });
  assert.match(arcPath(50, 50, 40, 20, 0, Math.PI / 2), /^M50 10A40 40 0 0 1 90 50L70 50A20 20 0 0 0 50 30Z$/);
  assert.match(arcPath(50, 50, 40, 0, 0, Math.PI / 2), /^M50 50L50 10A40 40 0 0 1 90 50Z$/);
  assert.equal((arcPath(50, 50, 40, 20, 0, 2 * Math.PI).match(/M/g) ?? []).length, 2); // a whole ring: two halves
});

test("text on a colour", () => {
  assert.equal(textOn("#F0E442"), "#0f172a"); // yellow: dark text
  assert.equal(textOn("#0072B2"), "#ffffff"); // blue: white text
  assert.equal(textOn("nonsense"), "#0f172a");
});
