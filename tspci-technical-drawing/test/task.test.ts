// npm test: the task settings, numbers, lines on the grid and the PCI's checks (src/task.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DIMS, allowedInput, askedOf, canonicalLines, checkDrawing, completeProblems, dimState, formatNumber, missingSegs, onGrid, optionsOf,
  parseDrawing, parseLines, parseNumber, parseTaskType, scoreValues, stepsOf, type Line,
} from "../src/task.ts";
import { DEFAULT_FEATURES, computeView, dimensionsOf, parseFeatures, segKey, type Seg } from "../src/model.ts";

const L = (kind: "visible" | "hidden", a: [number, number], b: [number, number]): Line => ({ kind, a, b });

test("numbers with a point or a comma; formatting per language", () => {
  assert.equal(parseNumber("12,5"), 12.5);
  assert.equal(parseNumber(" 8 mm"), 8);
  assert.equal(parseNumber("1.000,5"), null);
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber("abc"), null);
  assert.equal(formatNumber(12.5, "nl"), "12,5");
  assert.equal(formatNumber(1 / 3, "en"), "0.33");
  assert.equal(allowedInput("12,"), true);
  assert.equal(allowedInput("1a"), false);
});

test("the settings: empty gives the example per task, JSON gives the author's", () => {
  const d = parseDrawing("", parseFeatures, "dimensions");
  assert.deepEqual(d.features, DEFAULT_FEATURES);
  assert.deepEqual(d.dims, DEFAULT_DIMS.dimensions);
  assert.equal(parseDrawing("", parseFeatures, "read").questions.length, 2);
  const own = parseDrawing(JSON.stringify({ features: [{ type: "block", w: 10, d: 10, h: 10 }], dims: { "0.w": "ask", x: "nonsense" }, complete: { view: "left", grid: "2", remove: "all" } }), parseFeatures);
  assert.equal(own.features.length, 1);
  assert.deepEqual(own.dims, { "0.w": "ask" });
  assert.deepEqual([own.complete.view, own.complete.grid, own.complete.remove], ["left", 2, "all"]);
  assert.deepEqual(parseDrawing("{not json", parseFeatures).features, DEFAULT_FEATURES);
  assert.equal(parseTaskType("model"), "model");
  assert.equal(parseTaskType("x"), "dimensions");
});

test("asked dimensions in drawing order; questions with their dimension", () => {
  const dims = dimensionsOf(DEFAULT_FEATURES);
  const d = parseDrawing("", parseFeatures, "dimensions");
  assert.deepEqual(askedOf("dimensions", d, dims).map((a) => [a.dim.id, a.dim.value]), [["1.width", 20], ["2.depth", 10], ["3.a", 50]]);
  const r = parseDrawing("", parseFeatures, "read");
  assert.deepEqual(askedOf("read", r, dims).map((a) => a.dim.value), [10, 10]);
  assert.equal(dimState(r, dims.find((x) => x.id === "2.rest")!), "show");
  assert.equal(dimState(r, dims.find((x) => x.id === "2.offsetOther")!), "hide");
});

test("lines on the grid: steps, the same drawing however it was drawn", () => {
  assert.deepEqual(stepsOf(L("visible", [10, 0], [0, 0]), 5), ["visible:0,0,1,0", "visible:1,0,1,0"]);
  assert.deepEqual(stepsOf(L("visible", [0, 0], [10, 5]), 5), ["visible:0,0,2,1"]);
  assert.equal(stepsOf(L("visible", [0, 0], [3, 0]), 5), null);
  assert.equal(onGrid([45, 15], 5), true);
  const a = canonicalLines([L("visible", [0, 0], [10, 0]), L("visible", [10, 0], [20, 0]), L("hidden", [5, 0], [5, 10])], 5);
  const b = canonicalLines([L("visible", [20, 0], [0, 0]), L("hidden", [5, 10], [5, 5]), L("hidden", [5, 0], [5, 5]), L("visible", [5, 0], [15, 0])], 5);
  assert.equal(a, "H5,0,5,10;V0,0,20,0");
  assert.equal(a, b);
  assert.deepEqual(parseLines(a), [L("hidden", [5, 0], [5, 10]), L("visible", [0, 0], [20, 0])]);
});

test("the checks of a drawing: visible, hidden, nothing extra", () => {
  const view = computeView(DEFAULT_FEATURES, "front");
  const d = parseDrawing("", parseFeatures, "complete");
  const missing = missingSegs(view.segs, d.complete.remove, segKey);
  assert.equal(missing.length, 6);
  const points = d.complete.points;
  const right = missing.map((s: Seg) => ({ kind: s.kind, a: s.a, b: s.b }) as Line);
  const all = checkDrawing(view.segs, missing, right, 5, points);
  assert.deepEqual([all.visibleOk, all.hiddenOk, all.noExtra, all.score, all.maxscore, all.correct], [true, true, true, 3, 3, true]);
  // the hidden lines drawn as visible ones: hidden missing, and extra
  const wrong = right.map((l) => ({ ...l, kind: "visible" as const }));
  const w = checkDrawing(view.segs, missing, wrong, 5, points);
  assert.deepEqual([w.visibleOk, w.hiddenOk, w.noExtra, w.score], [true, false, false, 1]);
  // only the visible ones, plus a line along a given line (not extra)
  const part = checkDrawing(view.segs, missing, [...right.filter((l) => l.kind === "visible"), L("visible", [0, 0], [10, 0])], 5, points);
  assert.deepEqual([part.visibleOk, part.hiddenOk, part.noExtra, part.score], [true, false, true, 2]);
  // nothing drawn: no point for "nothing extra"
  assert.equal(checkDrawing(view.segs, missing, [], 5, points).score, 0);
});

test("problems of the view to complete", () => {
  const view = computeView(DEFAULT_FEATURES, "front");
  assert.deepEqual(completeProblems([], false, 5), ["none"]);
  assert.deepEqual(completeProblems(view.segs, false, 5), []);
  assert.deepEqual(completeProblems(view.segs, false, 4), ["offGrid"]);
});

test("options: the drawn workpiece at its place", () => {
  const d = parseDrawing(JSON.stringify({ features: [{ type: "block", w: 1, d: 1, h: 1 }], options: [[{ type: "block", w: 2, d: 2, h: 2 }], [{ type: "block", w: 3, d: 3, h: 3 }]], correct: 1 }), parseFeatures);
  assert.deepEqual(optionsOf(d).map((o) => (o[0] as any).w), [2, 1, 3]);
});

test("the PCI's scoring of values, with a margin", () => {
  assert.deepEqual(scoreValues([20, 10.4, null], [20, 10, 50], 0.5), { results: [true, true, false], score: 2, maxscore: 3, correct: false });
  assert.equal(scoreValues([20, 10, 50], [20, 10, 50], 0).correct, true);
});
