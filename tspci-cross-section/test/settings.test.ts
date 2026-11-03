// npm test: the settings and the PCI's scoring (src/settings.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, formatNumber, lengthsMatch, parseNumbers, parsePlane, parseSettings, planeText, r2 } from "../src/settings.ts";

test("numbers with a point or a comma, lists with spaces or 'by'", () => {
  assert.deepEqual(parseNumbers("4 6"), [4, 6]);
  assert.deepEqual(parseNumbers("4,5 x 6"), [4.5, 6]);
  assert.deepEqual(parseNumbers("4 by 6"), [4, 6]);
  assert.deepEqual(parseNumbers("4 bij 6"), [4, 6]);
  assert.deepEqual(parseNumbers("4x6"), [4, 6]);
  assert.deepEqual(parseNumbers("4;6;"), [4, 6]);
  assert.deepEqual(parseNumbers(""), []);
});

test("a plane as text or JSON", () => {
  assert.deepEqual(parsePlane("1 30 400"), { offset: 1, tilt: 30, turn: 40 });
  assert.deepEqual(parsePlane("-1,5 120 -90"), { offset: -1.5, tilt: 90, turn: 270 });
  assert.deepEqual(parsePlane('{"offset":2,"tilt":10,"turn":5}'), { offset: 2, tilt: 10, turn: 5 });
  assert.equal(parsePlane("1 2"), null);
  assert.equal(planeText({ offset: 0, tilt: 54.735610317, turn: 45 }), "0 54.7356 45");
});

test("the settings: defaults and the item's values", () => {
  const d = parseSettings({});
  assert.equal(d.solid, "cube");
  assert.equal(d.mode, "answer");
  assert.deepEqual([...d.controls], ["move", "tilt", "turn", "handles", "points", "hide"]);
  assert.deepEqual(d.start, { offset: 0, tilt: 0, turn: 0 });
  assert.equal(d.target.shape, null);
  assert.equal(d.target.margin, 0.2);
  assert.deepEqual(d.tolerance, { length: 0.02, angle: 2 });
  const s = parseSettings({
    solid: "Cylinder", dimensions: "3 8", controls: "move tilt", targetShape: "RECTANGLE", targetLengths: "4 by 6", targetArea: "24",
    margin: "0,1", exactShape: "true", language: "nl-NL", mode: "tool", showName: "false", plane: "1 0 0",
  });
  assert.equal(s.solid, "cylinder");
  assert.deepEqual(s.dims, [3, 8]);
  assert.deepEqual([...s.controls], ["move", "tilt"]);
  assert.equal(s.target.shape, "rectangle");
  assert.deepEqual(s.target.lengths, [4, 6]);
  assert.equal(s.target.area, 24);
  assert.equal(s.target.margin, 0.1);
  assert.equal(s.target.exact, true);
  assert.equal(s.language, "nl");
  assert.equal(s.mode, "tool");
  assert.equal(s.showName, false);
  assert.deepEqual(s.start, { offset: 1, tilt: 0, turn: 0 });
  assert.equal(parseSettings({ controls: "" }).controls.size, 0);
});

test("lengths match within the margin, both ways", () => {
  assert.ok(lengthsMatch([4, 6, 4, 6], [4, 6], 0.2));
  assert.ok(lengthsMatch([4.15, 5.9, 4.15, 5.9], [6, 4], 0.2));
  assert.ok(!lengthsMatch([4, 6, 4, 6], [4, 7], 0.2));
  assert.ok(!lengthsMatch([4, 4, 4, 4], [4, 6], 0.2), "a square of 4 is not 4 by 6");
  assert.ok(!lengthsMatch([4, 6, 5, 6], [4, 6], 0.2), "a side of 5 is none of the target lengths");
  assert.ok(!lengthsMatch([], [4], 1));
});

test("the score: a point for the shape, the lengths and the area", () => {
  const target = { shape: "rectangle" as const, exact: false, lengths: [4, 6], area: 24, margin: 0.2, areaMargin: 0.5 };
  const rect = { shape: "rectangle" as const, kinds: ["rectangle", "parallelogram", "quadrilateral"] as any, measures: [4, 6, 4, 6], area: 24 };
  assert.deepEqual(evaluate(target, rect), {
    checks: [{ name: "shape", passed: true }, { name: "lengths", passed: true }, { name: "area", passed: true }], score: 3, maxscore: 3, correct: true,
  });
  const square = { shape: "square" as const, kinds: ["square", "rectangle", "rhombus"] as any, measures: [5, 5, 5, 5], area: 25 };
  const e = evaluate(target, square);
  assert.deepEqual(e.checks.map((c) => c.passed), [true, false, false]);
  assert.equal(e.score, 1);
  assert.equal(evaluate({ ...target, exact: true }, square).checks[0].passed, false);
  // no target: nothing to score
  assert.deepEqual(evaluate({ ...target, shape: null, lengths: [], area: null }, rect), { checks: [], score: 0, maxscore: 0, correct: false });
});

test("numbers for the candidate and for the response", () => {
  assert.equal(formatNumber(4.2426, "nl"), "4,24");
  assert.equal(formatNumber(4.2426, "en", 1), "4.2");
  assert.equal(formatNumber(6, "nl"), "6");
  assert.equal(formatNumber(-0.001, "en"), "0");
  assert.equal(r2(46.76537), 46.77);
});
