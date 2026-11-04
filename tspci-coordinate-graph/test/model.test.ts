// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/parcc/extension-parcc-tei/tree/master/views/js/pciCreator/dev/graphLineAndPointInteraction,
// © 2014-2017 Parcc, Inc. Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// npm test: the model of the coordinate graph (src/model.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addPoint, clipToGrid, elementProblems, labelPoint, equationText, evaluate, formatPoint, initialState, lineThrough, matchAll, movePoint,
  parseElements, parseEquation, parseGiven, parseGrid, parseSettings, polygonText, regionsOf, removePoint, responseRecord,
  sameLine, sameRay, sameState, serializeElements, setDashed, snapPoint, solutionState, stateFromResponse, toggleRegion,
  validState, type GraphState, type Settings,
} from "../src/model.ts";

const example = parseSettings({});
const field = (record: any[], name: string) => record.find((f) => f.name === name);

/** The example done right: the dashed line y = ½x + 1, the area above it, the point (0, 1). */
const solved = (s: Settings = example): GraphState => {
  let st = initialState(s);
  st = addPoint(s, st, "lines_1", { x: -2, y: 0 })!.state;
  st = addPoint(s, st, "lines_1", { x: 4, y: 3 })!.state;
  st = setDashed(s, st, "lines_1", true);
  st = toggleRegion(s, st, "solutionSet_2", { x: -8, y: 8 })!.state;
  st = addPoint(s, st, "points_3", { x: 0, y: 1 })!.state;
  return st;
};

test("the settings: the example without elements, a grid that can be drawn", () => {
  assert.equal(example.example, true);
  assert.deepEqual(example.elements.map((e) => e.id), ["lines_1", "solutionSet_2", "points_3"]);
  assert.match(example.prompt, /^Graph the inequality/);
  assert.match(parseSettings({ language: "nl" }).prompt, /^Teken de ongelijkheid/);
  assert.deepEqual(parseGrid({ xMin: "0", xMax: "5", yMin: "-2,5", yMax: "2.5", xStep: "0.5", yStep: "0.5", snap: "half", allowEdge: "false" }),
    { xMin: 0, xMax: 5, yMin: -2.5, yMax: 2.5, xStep: 0.5, yStep: 0.5, snap: 0.5, allowEdge: false });
  const broken = parseGrid({ xMin: "5", xMax: "1", xStep: "0" });
  assert.equal(broken.xMin, -10);
  assert.equal(broken.xStep, 1);
  assert.deepEqual(parseGiven("A;1;2\n3;4\nnonsense"), [{ label: "A", x: 1, y: 2 }, { label: "", x: 3, y: 4 }]);
});

test("the elements: JSON, with defaults; original uid's are taken over", () => {
  const els = parseElements(JSON.stringify([
    { uid: "points_1", type: "point", label: "Point A", color: "#05516d" },
    { type: "points", label: "Set", max: 50, connect: true },
    { id: "lines_9", type: "line", label: "Line A", dashed: true, styleToggle: true, correct: { points: [[0, 0], [1, 1]], dashed: false } },
    { type: "nonsense" },
  ]))!;
  assert.equal(els.length, 3);
  assert.deepEqual(els.map((e) => e.id), ["points_1", "setPoints_2", "lines_9"]);
  assert.equal(els[1].max, 20);
  assert.equal(els[1].connect, true);
  assert.deepEqual(els[2].correct, { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], dashed: false });
  assert.equal(parseElements("not json"), null);
  assert.equal(parseElements("[]"), null);
  // and back
  const again = parseElements(serializeElements(els))!;
  assert.deepEqual(again, els);
});

test("snapping to the grid, within the edge", () => {
  const g = parseGrid({});
  assert.deepEqual(snapPoint({ x: 2.4, y: -3.6 }, g), { x: 2, y: -4 });
  assert.deepEqual(snapPoint({ x: 12, y: -30 }, g), { x: 10, y: -10 });
  const half = parseGrid({ snap: "half", allowEdge: "false" });
  assert.deepEqual(snapPoint({ x: 2.3, y: 10 }, half), { x: 2.5, y: 9.5 });
  const tenth = parseGrid({ xMin: "0", xMax: "1", yMin: "0", yMax: "1", xStep: "0.1", yStep: "0.1", snap: "tenth" });
  assert.deepEqual(snapPoint({ x: 0.123, y: 0.456 }, tenth), { x: 0.12, y: 0.46 });
});

test("lines: one canonical form, the equation, clipped to the grid", () => {
  assert.deepEqual(lineThrough({ x: 0, y: 1 }, { x: 2, y: 2 }), lineThrough({ x: 4, y: 3 }, { x: -2, y: 0 }));
  assert.equal(lineThrough({ x: 1, y: 1 }, { x: 1, y: 1 }), null);
  assert.equal(equationText({ x: 0, y: 1 }, { x: 2, y: 2 }, "en"), "y = 0.5x + 1");
  assert.equal(equationText({ x: 0, y: 1 }, { x: 2, y: 2 }, "nl"), "y = 0,5x + 1");
  assert.equal(equationText({ x: 0, y: 0 }, { x: 1, y: -1 }, "en"), "y = −x");
  assert.equal(equationText({ x: 3, y: 0 }, { x: 3, y: 5 }, "en"), "x = 3");
  assert.equal(equationText({ x: 0, y: -2 }, { x: 5, y: -2 }, "en"), "y = −2");
  assert.equal(equationText({ x: 0, y: -3 }, { x: 1, y: -1 }, "en"), "y = 2x − 3");
  const g = parseGrid({});
  assert.deepEqual(clipToGrid({ x: 0, y: 0 }, { x: 1, y: 1 }, "line", g), [{ x: -10, y: -10 }, { x: 10, y: 10 }]);
  assert.deepEqual(clipToGrid({ x: 0, y: 0 }, { x: 1, y: 1 }, "ray", g), [{ x: 0, y: 0 }, { x: 10, y: 10 }]);
  assert.deepEqual(clipToGrid({ x: 0, y: 0 }, { x: 1, y: 1 }, "segment", g), [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  assert.equal(clipToGrid({ x: 0, y: 20 }, { x: 1, y: 20 }, "line", g), null);
  assert.equal(sameLine([{ x: 0, y: 1 }, { x: 2, y: 2 }], [{ x: -4, y: -1 }, { x: 6, y: 4 }], g, 0), true);
  assert.equal(sameLine([{ x: 0, y: 1 }, { x: 2, y: 2 }], [{ x: 0, y: 1 }, { x: 2, y: 3 }], g, 0), false);
  assert.equal(sameLine([{ x: 0, y: 1.1 }, { x: 2, y: 2.1 }], [{ x: 0, y: 1 }, { x: 2, y: 2 }], g, 0.2), true);
  assert.equal(sameLine([{ x: 0, y: 1.1 }, { x: 2, y: 2 }], [{ x: 0, y: 1 }, { x: 2, y: 2 }], g, 0.2), false); // far off at the edge of the grid
  assert.equal(sameRay([{ x: 0, y: 0 }, { x: 1, y: 1 }], [{ x: 0, y: 0 }, { x: 3, y: 3 }], g, 0), true);
  assert.equal(sameRay([{ x: 0, y: 0 }, { x: 1, y: 1 }], [{ x: 0, y: 0 }, { x: -3, y: -3 }], g, 0), false);
  assert.equal(matchAll([{ x: 1, y: 1 }, { x: 2, y: 2 }], [{ x: 2, y: 2 }, { x: 1, y: 1 }], 0), true);
  assert.equal(matchAll([{ x: 1, y: 1 }, { x: 1, y: 1 }], [{ x: 1, y: 1 }, { x: 2, y: 2 }], 0), false);
});

test("the areas between the lines", () => {
  const g = parseGrid({});
  assert.equal(regionsOf([], g).length, 1);
  const one = regionsOf([lineThrough({ x: 0, y: 1 }, { x: 2, y: 2 })!], g);
  assert.equal(one.length, 2);
  assert.ok(one[0].inside.y > one[1].inside.y, "the upper area first");
  assert.equal(polygonText(one[0].polygon), "-10 -4, 10 6, 10 10, -10 10");
  const two = regionsOf([lineThrough({ x: 0, y: 0 }, { x: 1, y: 0 })!, lineThrough({ x: 0, y: 0 }, { x: 0, y: 1 })!], g);
  assert.equal(two.length, 4);
  // a line outside the grid cuts nothing
  assert.equal(regionsOf([lineThrough({ x: 0, y: 20 }, { x: 1, y: 20 })!], g).length, 1);
});

test("drawing: a line's second point, a full element moves its last point, lines clear the shading", () => {
  const s = example;
  let st = initialState(s);
  assert.equal(addPoint(s, st, "lines_1", { x: 0, y: 1 })!.index, 0);
  st = addPoint(s, st, "lines_1", { x: 0, y: 1 })!.state;
  assert.equal(addPoint(s, st, "lines_1", { x: 0.2, y: 1.1 }), null, "the same point twice is no line");
  st = addPoint(s, st, "lines_1", { x: 2, y: 2 })!.state;
  const third = addPoint(s, st, "lines_1", { x: 2, y: 3 })!;
  assert.equal(third.replaced, true);
  assert.deepEqual(third.state.values.lines_1.points, [{ x: 0, y: 1 }, { x: 2, y: 3 }]);
  st = toggleRegion(s, st, "solutionSet_2", { x: -5, y: 5 })!.state;
  assert.equal(st.values.solutionSet_2.regions!.length, 1);
  const off = toggleRegion(s, st, "solutionSet_2", { x: -6, y: 6 })!;
  assert.equal(off.shaded, false);
  assert.equal(off.state.values.solutionSet_2.regions!.length, 0);
  // the style keeps the shading, moving the line does not
  assert.equal(setDashed(s, st, "lines_1", true).values.solutionSet_2.regions!.length, 1);
  assert.equal(movePoint(s, st, "lines_1", 1, { x: 3, y: 2 })!.values.solutionSet_2.regions!.length, 0);
  assert.equal(removePoint(s, st, "lines_1", 0).values.solutionSet_2.regions!.length, 0);
  // a point moves elsewhere; the point on a point of its own line is refused
  assert.equal(movePoint(s, st, "lines_1", 1, { x: 0, y: 1 }), null);
});

test("scoring the example", () => {
  const st = solved();
  let e = evaluate(example, st);
  assert.deepEqual(e, { checks: [true, true, true], score: 3, maxscore: 3, correct: true });
  // a solid line: wrong, as the inequality is strict
  e = evaluate(example, setDashed(example, st, "lines_1", false));
  assert.deepEqual(e.checks, [false, true, true]);
  // the other side shaded
  const other = toggleRegion(example, toggleRegion(example, st, "solutionSet_2", { x: 8, y: -8 })!.state, "solutionSet_2", { x: -8, y: 8 })!.state;
  assert.deepEqual(evaluate(example, other).checks, [true, false, true]);
  // nothing drawn
  assert.deepEqual(evaluate(example, initialState(example)), { checks: [false, false, false], score: 0, maxscore: 3, correct: false });
  // the solution state is right
  assert.equal(evaluate(example, solutionState(example)!).correct, true);
});

test("a solution set with two lines; the tolerance", () => {
  const s = parseSettings({
    tolerance: "0.5",
    elements: JSON.stringify([
      { id: "lines_1", type: "line", label: "A", correct: { points: [[0, 0], [1, 0]] } },
      { id: "lines_2", type: "line", label: "B", correct: { points: [[0, 0], [0, 1]] } },
      { id: "solutionSet_3", type: "solutionSet", label: "S", correct: { regions: [[5, 5]] } },
      { id: "setPoints_4", type: "points", label: "P", max: 3, correct: { points: [[1, 1], [2, 2]] } },
    ]),
  });
  let st = initialState(s);
  for (const [id, x, y] of [["lines_1", -3, 0.4], ["lines_1", 3, 0.4], ["lines_2", 0, 2], ["lines_2", 0, 3]] as const) st = addPoint(s, st, id, { x, y })!.state;
  st = toggleRegion(s, st, "solutionSet_3", { x: 5, y: 5 })!.state;
  st = addPoint(s, st, "setPoints_4", { x: 2, y: 2 })!.state;
  st = addPoint(s, st, "setPoints_4", { x: 1, y: 1 })!.state;
  // whole numbers: 0.4 snaps to 0
  assert.deepEqual(evaluate(s, st).checks, [true, true, true, true]);
  st = addPoint(s, st, "setPoints_4", { x: 3, y: 3 })!.state;
  assert.deepEqual(evaluate(s, st).checks, [true, true, true, false]);
});

test("equations: a set of points on y = f(x)", () => {
  const f = parseEquation("y = 2x^2 - 3")!;
  assert.equal(f(2), 5);
  assert.equal(parseEquation("-x^2")!(3), -9);
  assert.equal(parseEquation("2(x+1)")!(1), 4);
  assert.equal(parseEquation("sqrt(x)+1/2")!(4), 2.5);
  assert.equal(parseEquation("f(x) = 0,5x − 1")!(4), 1);
  assert.equal(parseEquation("2 +"), null);
  assert.equal(parseEquation("y = z"), null);
  const s = parseSettings({ elements: JSON.stringify([{ type: "points", label: "P", max: 4, equation: "y = x + 1", minPoints: 3 }]) });
  let st = initialState(s);
  const id = s.elements[0].id;
  for (const x of [0, 1]) st = addPoint(s, st, id, { x, y: x + 1 })!.state;
  assert.equal(evaluate(s, st).checks[0], false, "too few");
  st = addPoint(s, st, id, { x: 3, y: 4 })!.state;
  assert.equal(evaluate(s, st).checks[0], true);
  st = addPoint(s, st, id, { x: 4, y: 4 })!.state;
  assert.equal(evaluate(s, st).checks[0], false, "one off the line");
});

test("the response: a record as the original's, and back", () => {
  const st = solved();
  const record = responseRecord(example, st);
  assert.deepEqual(record.slice(0, 6).map((f) => f.name), ["score", "maxscore", "correct", "check1", "check2", "check3"]);
  assert.deepEqual(field(record, "lines_1").list, { point: [[-2, 0], [4, 3]] });
  assert.deepEqual(field(record, "points_3").list, { point: [[0, 1]] });
  assert.deepEqual(field(record, "solutionSet_2").list, { string: ["-10 -4, 10 6, 10 10, -10 10"] });
  assert.ok(sameState(stateFromResponse({ record }, example)!, st));
  // without the graph field: the element fields (the line style is lost)
  const bare = stateFromResponse({ record: record.filter((f) => f.name !== "graph") }, example)!;
  assert.deepEqual(bare.values.lines_1.points, st.values.lines_1.points);
  assert.equal(evaluate(example, bare).checks[1], true);
  // the original's record: base.list.point, a solution set as an entry per area
  const original = {
    record: [
      { name: "lines_1", base: { list: { point: [[0, 1], [2, 2]] } } },
      { name: "points_3", base: { list: { point: [[0, 1]] } } },
      { name: "solutionSet_2", base: { list: { point: [[-10, 10], [-10, -4], [10, 6], [10, 10]] } } },
    ],
  };
  const fromOriginal = stateFromResponse(original, example)!;
  assert.deepEqual(fromOriginal.values.points_3.points, [{ x: 0, y: 1 }]);
  assert.deepEqual(evaluate(example, fromOriginal).checks, [false, true, true]); // its line is solid: the style was never in the response
  // Point Graph: a list of "x y" strings for the first set of points
  const pg = parseSettings({ elements: JSON.stringify([{ type: "points", label: "P", max: 5 }]) });
  assert.deepEqual(stateFromResponse({ list: { string: ["1 2", "3 4"] } }, pg)!.values.setPoints_1.points, [{ x: 1, y: 2 }, { x: 3, y: 4 }]);
  assert.equal(stateFromResponse({ base: { integer: 3 } }, example), null);
});

test("states from elsewhere are cleaned", () => {
  const st = validState({ values: { lines_1: { points: [[0, 0], [0, 0], [5, 5]] }, points_3: { points: [{ x: 50, y: 0 }] }, other: {} } }, example)!;
  assert.deepEqual(st.values.lines_1, { points: [{ x: 0, y: 0 }], dashed: false });
  assert.deepEqual(st.values.points_3.points, []);
  assert.equal(st.values.other, undefined);
  assert.equal(validState("nonsense", example), null);
});

test("formatting and the authoring problems", () => {
  assert.equal(formatPoint({ x: -2.5, y: 3 }, "en"), "(−2.5, 3)");
  assert.equal(formatPoint({ x: -2.5, y: 3 }, "nl"), "(−2,5; 3)");
  assert.deepEqual(elementProblems(example, example.elements), []);
  const els = parseElements(JSON.stringify([
    { type: "solutionSet", label: "S" },
    { type: "points", label: "", equation: "y = = 2" },
    { type: "segment", label: "AB", correct: { points: [[1, 1]] } },
  ]))!;
  assert.deepEqual(elementProblems(example, els).map((p) => p.kind), ["noLine", "noLabel", "equation", "incomplete"]);
});

test("an area is named by a grid point well inside it", () => {
  const g = parseGrid({});
  const [above, below] = regionsOf([lineThrough({ x: 0, y: 1 }, { x: 2, y: 2 })!], g);
  assert.deepEqual(labelPoint(above, g), { x: -2, y: 5 });
  assert.deepEqual(labelPoint(below, g), { x: 2, y: -4 });
});
