// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Lentillespci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// npm test: the model of the graph builder (src/graph.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LENTILS, evaluate, formatPoint, formatValue, initialState, languageOf, linePoints, niceScale, parseData, parseList, parseNumber,
  parseScale, parseSettings, sameState, serializeGraph, snap, solutionState, suitableScale, validState, type GraphState,
} from "../src/graph.ts";

const lentils = parseSettings({});
const done = (): GraphState => solutionState(lentils);

test("numbers per language", () => {
  assert.equal(languageOf("nl-NL"), "nl");
  assert.equal(languageOf("FR"), "fr");
  assert.equal(languageOf("de"), "en");
  assert.equal(formatValue(0.2, "en"), "0.2");
  assert.equal(formatValue(0.2, "fr"), "0,2");
  assert.equal(formatValue(0.1 + 0.2, "nl"), "0,3");
  assert.equal(formatValue(-3, "en"), "−3");
  assert.equal(formatPoint(2, 0.2, "en"), "(2, 0.2)");
  assert.equal(formatPoint(2, 0.2, "nl"), "(2; 0,2)");
  assert.equal(formatPoint(2, 0.2, "fr"), "(2 ; 0,2)");
  assert.equal(parseNumber("0,2"), 0.2);
  assert.equal(parseNumber(" 11.7 "), 11.7);
  assert.equal(parseNumber("−3"), -3);
  assert.equal(parseNumber("2 cm"), null);
  assert.equal(parseNumber(""), null);
});

test("the defaults are the lentils, in the candidate's language", () => {
  assert.deepEqual(lentils.data, LENTILS);
  assert.equal(lentils.xQuantity, "Time");
  assert.equal(lentils.yUnit, "cm");
  assert.ok(lentils.quantityOptions.includes("Length of the sprout") && lentils.quantityOptions.includes("Mass"));
  assert.deepEqual(lentils.points, { table: 1, axes: 1, scale: 1, points: 2, line: 1 });
  assert.equal(lentils.tableRows, 8);
  assert.deepEqual(lentils.start, { x: { max: 10, step: 1 }, y: { max: 10, step: 1 } });
  const fr = parseSettings({ language: "fr" });
  assert.equal(fr.yQuantity, "Longueur de la pousse");
  assert.equal(fr.caption, "Jour {x}");
  assert.equal(parseSettings({ language: "nl", xUnit: "uur" }).xUnit, "uur");
});

test("settings: data, lists, scales", () => {
  assert.deepEqual(parseData("0;0\n1;0,5\nx;y\n2\t1,5"), [{ x: 0, y: 0 }, { x: 1, y: 0.5 }, { x: 2, y: 1.5 }]);
  assert.deepEqual(parseData("0 0|1 2.5"), [{ x: 0, y: 0 }, { x: 1, y: 2.5 }]);
  assert.deepEqual(parseList("a; b\nc;a"), ["a", "b", "c"]);
  assert.deepEqual(parseScale("12;2", { max: 1, step: 1 }), { max: 12, step: 2 });
  assert.deepEqual(parseScale("12;0,1", { max: 1, step: 1 }), { max: 1, step: 1 }); // 120 steps
  assert.deepEqual(parseScale("x", { max: 1, step: 1 }), { max: 1, step: 1 });
  const s = parseSettings({ data: "1;10\n2;20", tableStep: "false", pointsLine: "0", tolerance: "5" });
  assert.equal(s.data.length, 2);
  assert.equal(s.tableStep, false);
  assert.equal(s.points.line, 0);
  assert.equal(s.tolerance, 5);
});

test("a nice scale and snapping", () => {
  assert.deepEqual(niceScale(11.7), { max: 12, step: 2 });
  assert.deepEqual(niceScale(8), { max: 8, step: 1 });
  assert.deepEqual(niceScale(0.37), { max: 0.4, step: 0.05 });
  assert.deepEqual(niceScale(430), { max: 450, step: 50 });
  assert.equal(snap(3.83, { max: 12, step: 1 }), 3.8);
  assert.equal(snap(3.83, { max: 12, step: 2 }), 3.8);
  assert.equal(snap(3.83, { max: 50, step: 5 }), 4);
});

test("the finished graph scores everything", () => {
  const e = evaluate(lentils, done());
  assert.deepEqual(e.results, { table: true, axes: true, scale: true, points: true, line: true });
  assert.equal(e.score, 6);
  assert.equal(e.maxscore, 6);
  assert.equal(e.correct, true);
  assert.equal(e.tableCells, 16);
  assert.equal(e.pointsMatched, 8);
});

test("nothing done scores nothing", () => {
  const e = evaluate(lentils, initialState(lentils));
  assert.equal(e.score, 0);
  assert.equal(e.maxscore, 6);
  assert.equal(e.results.scale, false); // the vertical axis stops at 10: 11.7 does not fit
});

test("the table: any order, per cell", () => {
  const state = done();
  state.table.rows = [["8", "11,7"], ["0", "0"], ["2", "0.2"], ["3", "1"], ["4", "2"], ["5", "3.8"], ["6", "5.3"], ["7", "6.4"]];
  assert.equal(evaluate(lentils, state).results.table, true);
  state.table.rows[0] = ["8", "11"];
  let e = evaluate(lentils, state);
  assert.equal(e.results.table, false);
  assert.equal(e.tableCells, 15);
  state.table.rows[0] = ["9", "11.7"]; // not a day that was measured
  e = evaluate(lentils, state);
  assert.equal(e.tableCells, 14);
  const perCell = parseSettings({ tableScoring: "cell" });
  e = evaluate(perCell, state);
  assert.equal(e.maxscore, 16 + 5);
  assert.equal(e.score, 14 + 5);
  // an extra row that is not a measurement fails the table
  const extra = done();
  extra.table.rows = [...extra.table.rows, ["1", "0.1"]];
  assert.equal(evaluate(lentils, extra).results.table, false);
  assert.equal(evaluate(lentils, extra).tableCells, 16);
});

test("the axes: quantity and unit, not case sensitive", () => {
  const state = done();
  state.y.quantity = "length of the sprout ";
  assert.equal(evaluate(lentils, state).results.axes, true);
  state.y.unit = "mm";
  assert.equal(evaluate(lentils, state).results.axes, false);
  const swapped = done();
  [swapped.x, swapped.y] = [{ ...swapped.x, quantity: swapped.y.quantity, unit: swapped.y.unit }, { ...swapped.y, quantity: swapped.x.quantity, unit: swapped.x.unit }];
  assert.equal(evaluate(lentils, swapped).results.axes, false);
});

test("a suitable scale", () => {
  assert.equal(suitableScale(lentils, "y", { max: 12, step: 1 }), true);
  assert.equal(suitableScale(lentils, "y", { max: 11, step: 1 }), false); // 11.7 does not fit
  assert.equal(suitableScale(lentils, "y", { max: 30, step: 5 }), false); // the data fill less than half
  assert.equal(suitableScale(lentils, "y", { max: 20, step: 2 }), true);
  assert.equal(suitableScale(lentils, "y", { max: 12, step: 12 }), false); // one step
  assert.equal(suitableScale(lentils, "y", { max: 12, step: 0.2 }), false); // 60 steps
  assert.equal(suitableScale(lentils, "x", { max: 10, step: 1 }), true);
  assert.equal(suitableScale(parseSettings({ scaleUse: "90" }), "x", { max: 10, step: 1 }), false);
});

test("the points: within the tolerance, each its own, no extras", () => {
  const state = done();
  state.points[5] = { x: 6.1, y: 5.5 }; // 2 % of 10 and 12: 0.2 and 0.24
  assert.equal(evaluate(lentils, state).results.points, true);
  state.points[5] = { x: 6, y: 5.6 };
  let e = evaluate(lentils, state);
  assert.equal(e.results.points, false);
  assert.equal(e.pointsMatched, 7);
  const extra = done();
  extra.points.push({ x: 1, y: 0.1 });
  e = evaluate(lentils, extra);
  assert.equal(e.pointsMatched, 8);
  assert.equal(e.results.points, false);
  const twice = done();
  twice.points[1] = { ...twice.points[0] }; // two points on day 0, none on day 2
  assert.equal(evaluate(lentils, twice).pointsMatched, 7);
});

test("the line", () => {
  const state = done();
  state.line = false;
  assert.equal(evaluate(lentils, state).results.line, false);
  assert.equal(evaluate(lentils, state).score, 5);
  state.line = true;
  state.points = [{ x: 1, y: 1 }];
  assert.equal(evaluate(lentils, state).results.line, false);
  assert.deepEqual(linePoints([{ x: 3, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 0 }]), [{ x: 1, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 1 }]);
});

test("without a table step the table does not count", () => {
  const s = parseSettings({ tableStep: "false" });
  const e = evaluate(s, solutionState(s));
  assert.equal(e.maxscore, 5);
  assert.equal(e.score, 5);
  assert.equal(e.results.table, false);
  assert.equal(e.scored.includes("table"), false);
  assert.deepEqual(initialState(s).table.rows, []);
});

test("a state from outside is checked", () => {
  assert.equal(validState(null, lentils), null);
  const state = validState({ x: { quantity: "Time", unit: "days", max: "12", step: 0 }, points: [{ x: 1, y: 2 }, { x: "a" }, [3, 4]], line: true }, lentils)!;
  assert.deepEqual(state.x, { quantity: "Time", unit: "days", max: 10, step: 1 }); // step 0: the start scale
  assert.deepEqual(state.points, [{ x: 1, y: 2 }, { x: 3, y: 4 }]);
  assert.equal(state.table.rows.length, 8);
  assert.equal(state.line, true);
  const roundTrip = validState(JSON.parse(serializeGraph(done())), lentils)!;
  assert.deepEqual(roundTrip.points, LENTILS);
  assert.ok(sameState(initialState(lentils), validState(initialState(lentils), lentils)!));
});
