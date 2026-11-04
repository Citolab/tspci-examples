// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/parcc/extension-parcc-tei/tree/master/views/js/pciCreator/dev/graphFunctionInteraction
// (and its shared library PARCC/graphFunction), © 2014-2017 Parcc, Inc., by Sam Sipasseuth (Open Assessment Technologies)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// npm test: the model of the function graph (src/functions.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FAMILIES, asymptotes, correctState, curve, equationText, evaluate, fit, fitOf, formatPoint, formatValue, initialState, isFit,
  languageOf, limits, origin, parseFamilies, parseNumber, parsePoints, parseSettings, pointsText, round2, sameFunction, sameState,
  snap, startPoints, validState, valueAt, type Fit, type Point,
} from "../src/functions.ts";

const P = (x: number, y: number): Point => ({ x, y });
const view = { min: -10, max: 10 };
const get = (family: Parameters<typeof fit>[0], p1: Point, p2: Point): Fit => {
  const f = fit(family, p1, p2);
  assert.ok(isFit(f), `${family} through (${p1.x}, ${p1.y}) and (${p2.x}, ${p2.y})`);
  return f;
};
const close = (actual: number | null, expected: number, message?: string) => {
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-9, `${message ?? ""} expected ${expected}, got ${actual}`);
};

test("numbers per language", () => {
  assert.equal(languageOf("nl-NL"), "nl");
  assert.equal(languageOf("FR"), "fr");
  assert.equal(languageOf("de"), "en");
  assert.equal(formatValue(0.5, "en"), "0.5");
  assert.equal(formatValue(0.5, "nl"), "0,5");
  assert.equal(formatValue(-3, "en"), "−3");
  assert.equal(formatValue(1 / 3, "en"), "0.33");
  assert.equal(formatPoint(P(2, 0.5), "en"), "(2, 0.5)");
  assert.equal(formatPoint(P(2, 0.5), "nl"), "(2; 0,5)");
  assert.equal(formatPoint(P(2, 0.5), "fr"), "(2 ; 0,5)");
  assert.equal(parseNumber("0,5"), 0.5);
  assert.equal(parseNumber("−3"), -3);
  assert.equal(parseNumber("a"), null);
  assert.equal(round2(-0.001), 0);
});

test("every family goes through its two points", () => {
  const p1 = P(1, 2), p2 = P(3, 6);
  for (const family of FAMILIES) {
    const f = get(family, p1, p2);
    close(valueAt(f, p1.x), p1.y, `${family} at point 1`);
    close(valueAt(f, p2.x), p2.y, `${family} at point 2`);
  }
});

test("the roles of the points: vertex, midline, extreme, centre", () => {
  // absolute value and parabola: point 1 is the vertex, the graph is symmetric about it
  const abs = get("absolute", P(1, -2), P(3, 2));
  close(valueAt(abs, -1), 2);
  assert.deepEqual(abs.params, [2, 1, -2]);
  const quad = get("quadratic", P(1, -2), P(3, 6));
  assert.deepEqual(quad.params, [2, 1, -2]);
  close(valueAt(quad, -1), 6);
  // cosine: point 1 on the midline, point 2 a highest point a quarter period away
  const cos = get("cosine", P(1, 0), P(0, 3));
  close(valueAt(cos, 0), 3);
  close(valueAt(cos, 2), -3); // half a period after the top: the bottom
  close(valueAt(cos, 4), 3); // the period is 4
  // tangent: point 1 the centre, point 2 a quarter period further, asymptotes at 2 from the centre
  const tan = get("tangent", P(0, 1), P(1, 3));
  close(valueAt(tan, -1), -1);
  assert.deepEqual(asymptotes(tan, view).vertical, [-10, -6, -2, 2, 6, 10]);
  assert.equal(valueAt(tan, 2), null);
});

test("points that do not determine a function", () => {
  for (const family of FAMILIES) assert.equal(fit(family, P(2, 1), P(2, 5)), "sameX");
  assert.equal(fit("exponential", P(0, 0), P(1, 1)), "exponentialSign");
  assert.equal(fit("exponential", P(0, -1), P(1, 1)), "exponentialSign");
  assert.ok(isFit(fit("exponential", P(0, -1), P(1, -2))), "below the asymptote is fine");
  assert.equal(fit("logarithmic", P(0, 0), P(1, 1)), "logarithmicSide");
  assert.equal(fit("logarithmic", P(-1, 0), P(1, 1)), "logarithmicSide");
  assert.equal(fit("logarithmic", P(1, 1), P(2, 1)), "logarithmicFlat");
  assert.equal(fitOf({ family: "linear", points: [P(0, 0)] }), null);
});

test("exponential and logarithmic: the original's formulas and asymptotes", () => {
  const exp = get("exponential", P(0, 1), P(1, 2));
  close(exp.params[0], 1);
  close(exp.params[1], Math.log(2));
  close(valueAt(exp, 3), 8);
  assert.deepEqual(asymptotes(exp, view), { vertical: [], horizontal: [0] });
  const log = get("logarithmic", P(1, 0), P(Math.E, 2));
  close(log.params[0], 2);
  close(log.params[1], 1);
  assert.equal(valueAt(log, -1), null);
  assert.deepEqual(asymptotes(log, view), { vertical: [0], horizontal: [] });
  assert.deepEqual(asymptotes(log, { min: 1, max: 5 }).vertical, []);
  // on the left of the y axis
  const left = get("logarithmic", P(-1, 0), P(-2, 1));
  assert.ok(valueAt(left, -5) !== null);
  assert.equal(valueAt(left, 1), null);
});

test("the curve: split at asymptotes and outside the domain", () => {
  const y = { min: -10, max: 10 };
  assert.equal(curve(get("linear", P(0, 0), P(1, 1)), view, y).length, 1);
  const tan = curve(get("tangent", P(0, 0), P(1, 1)), view, y);
  assert.equal(tan.length, 5); // between the asymptotes at -6, -2, 2, 6 (and the edges at ±10)
  const log = curve(get("logarithmic", P(1, 0), P(2, 1)), view, y);
  assert.equal(log.length, 1);
  assert.ok(log[0].every((p) => p.x > 0));
  assert.ok(log[0].every((p) => p.y >= -50 && p.y <= 50), "kept near the view");
  const abs = curve(get("absolute", P(0.123, 0), P(1, 1)), view, y);
  assert.ok(abs[0].some((p) => p.x === 0.123), "the corner is on the curve");
});

test("the same function, through other points", () => {
  const x = view, y = { min: -10, max: 10 };
  assert.ok(sameFunction(get("linear", P(0, 1), P(1, 3)), get("linear", P(-2, -3), P(2, 5)), x, y));
  assert.ok(!sameFunction(get("linear", P(0, 1), P(1, 3)), get("linear", P(0, 1), P(1, 4)), x, y));
  assert.ok(sameFunction(get("exponential", P(0, 1), P(1, 2)), get("exponential", P(2, 4), P(3, 8)), x, y));
  // a cosine through another top, or a quarter period the other way
  assert.ok(sameFunction(get("cosine", P(1, 0), P(0, 3)), get("cosine", P(5, 0), P(4, 3)), x, y));
  assert.ok(sameFunction(get("cosine", P(1, 0), P(0, 3)), get("cosine", P(-1, 0), P(0, 3)), x, y));
  assert.ok(!sameFunction(get("cosine", P(1, 0), P(0, 3)), get("cosine", P(1, 0), P(0, 2)), x, y));
  // a tangent from another centre, a period further
  assert.ok(sameFunction(get("tangent", P(0, 0), P(1, 1)), get("tangent", P(4, 0), P(5, 1)), x, y));
  assert.ok(!sameFunction(get("tangent", P(0, 0), P(1, 1)), get("tangent", P(0.5, 0), P(1.5, 1)), x, y));
  // another family is not the same
  assert.ok(!sameFunction(get("quadratic", P(0, 0), P(1, 1)), get("absolute", P(0, 0), P(1, 1)), x, y));
  // the tolerance, in units of y
  assert.ok(!sameFunction(get("linear", P(0, 0), P(1, 1)), get("linear", P(0, 0.1), P(1, 1.1)), x, y));
  assert.ok(sameFunction(get("linear", P(0, 0), P(1, 1)), get("linear", P(0, 0.1), P(1, 1.1)), x, y, 0.1));
});

test("the equation, for the candidate and for the response", () => {
  assert.equal(equationText(get("linear", P(0, 1), P(1, 3)), "en"), "y = 2x + 1");
  assert.equal(equationText(get("linear", P(0, -3), P(1, -4)), "en"), "y = −x − 3");
  assert.equal(equationText(get("linear", P(0, 4), P(1, 4)), "en"), "y = 4");
  assert.equal(equationText(get("linear", P(0, 0), P(2, 1)), "nl"), "y = 0,5x");
  assert.equal(equationText(get("linear", P(0, 1), P(1, 3)), "ascii"), "y = 2*x + 1");
  assert.equal(equationText(get("absolute", P(1, -2), P(3, 2)), "en"), "y = 2|x − 1| − 2");
  assert.equal(equationText(get("absolute", P(1, -2), P(3, 2)), "ascii"), "y = 2*abs(x - 1) - 2");
  assert.equal(equationText(get("quadratic", P(0, 0), P(1, 1)), "en"), "y = x²");
  assert.equal(equationText(get("quadratic", P(-1, 2), P(1, 0)), "fr"), "y = −0,5(x + 1)² + 2");
  assert.equal(equationText(get("quadratic", P(-1, 2), P(1, 0)), "ascii"), "y = -0.5*(x + 1)^2 + 2");
  assert.equal(equationText(get("exponential", P(0, 3), P(1, 6)), "en"), "y = 3 · 2ˣ");
  assert.equal(equationText(get("exponential", P(0, 3), P(1, 6)), "ascii"), "y = 3*2^x");
  assert.equal(equationText(get("logarithmic", P(1, 0), P(Math.E, 2)), "en"), "y = 2 ln(x)");
  assert.equal(equationText(get("logarithmic", P(1, 0), P(Math.E, 2)), "ascii"), "y = 2*ln(x)");
  assert.equal(equationText(get("cosine", P(1, 0), P(0, 3)), "en"), "y = 3 cos(1.57x)");
  assert.equal(equationText(get("cosine", P(2, 1), P(1, 3)), "ascii"), "y = 2*cos(1.57*(x - 1)) + 1");
  assert.equal(equationText(get("tangent", P(0, 1), P(1, 3)), "en"), "y = 2 tan(0.79x) + 1");
  assert.equal(equationText(get("tangent", P(0, 1), P(-1, 3)), "en"), "y = −2 tan(0.79x) + 1");
  // with the names of the axes
  assert.equal(equationText(get("quadratic", P(2, 20), P(0, 0)), "en", { x: "t", y: "h" }), "h = −5(t − 2)² + 20");
  assert.equal(equationText(get("exponential", P(0, 3), P(1, 6)), "en", { x: "t", y: "N" }), "N = 3 · 2^t");
});

test("the response's points, in the original's format", () => {
  assert.deepEqual(parsePoints("-2 -8,6 1"), [P(-2, -8), P(6, 1)]);
  assert.deepEqual(parsePoints(" 3 40 , 4.5 55 "), [P(3, 40), P(4.5, 55)]);
  assert.deepEqual(parsePoints("1 2,x"), [P(1, 2)]);
  assert.deepEqual(parsePoints(""), []);
  assert.equal(pointsText([P(-2, -8), P(6, 1)]), "-2 -8,6 1");
  assert.equal(pointsText([P(1 / 3, 0.1 + 0.2)]), "0.33 0.3");
});

test("settings: defaults as the original, and the author's choices", () => {
  const s = parseSettings({});
  assert.deepEqual(s.families, [...FAMILIES]);
  assert.deepEqual([s.x.start, s.x.end, s.x.step, s.x.subStep, s.x.allowOuter], [-10, 10, 1, 2, true]);
  assert.equal(s.correct, null);
  assert.equal(s.showEquation, false);
  assert.deepEqual(parseFamilies("quadratic, linear"), ["linear", "quadratic"]);
  assert.deepEqual(parseFamilies("nonsense"), [...FAMILIES]);
  const t = parseSettings({ xStart: "5", xEnd: "1", yStep: "0", graphs: "exponential", correctType: "Exponential", correctPoints: "0 1,1 2" });
  assert.deepEqual([t.x.start, t.x.end], [-10, 10]);
  assert.equal(t.y.step, 2);
  assert.deepEqual(t.correct, { family: "exponential", points: [P(0, 1), P(1, 2)] });
});

test("the grid: snapping, borders and the origin", () => {
  const s = parseSettings({});
  assert.equal(snap(1.2, s.x), 1);
  assert.equal(snap(1.3, s.x), 1.5);
  assert.equal(snap(12, s.x), 10);
  const inner = parseSettings({ xAllowOuter: "false", xSubStep: "1" });
  assert.deepEqual(limits(inner.x), { min: -9, max: 9 });
  assert.equal(snap(10, inner.x), 9);
  assert.deepEqual(origin(parseSettings({ xStart: "2", xEnd: "12", yStart: "-4", yEnd: "16" })), P(2, 0));
});

test("the start: two points to drag, or none", () => {
  const s = parseSettings({});
  assert.deepEqual(initialState(s), { family: "linear", points: [P(0, 0), P(1, 1)] });
  assert.deepEqual(startPoints(s, "exponential"), [P(1, 1), P(2, 2)]);
  assert.deepEqual(initialState(parseSettings({ graphs: "logarithmic" })).points, [P(1, 1), P(2, 2)]);
  assert.deepEqual(initialState(parseSettings({ startPoints: "empty" })).points, []);
  assert.ok(sameState(initialState(s), { family: "linear", points: [P(0, 0), P(1, 1)] }));
  assert.ok(!sameState(initialState(s), { family: "quadratic", points: [P(0, 0), P(1, 1)] }));
  assert.deepEqual(validState({ family: "cosine", points: [{ x: "1", y: 2 }] }), { family: "cosine", points: [P(1, 2)] });
  assert.equal(validState({ family: "circle", points: [] }), null);
  assert.equal(validState({ family: "linear", points: [{ x: "a", y: 1 }] }), null);
});

test("scoring: the candidate's function against the correct one", () => {
  const s = parseSettings({ correctType: "quadratic", correctPoints: "1 -2,3 6" });
  const correct = correctState(s);
  assert.deepEqual(evaluate(s, { family: "quadratic", points: [P(1, -2), P(0, 0)] }, correct), {
    scored: true, score: 1, maxscore: 1, correct: true, fit: get("quadratic", P(1, -2), P(0, 0)),
  });
  assert.equal(evaluate(s, { family: "quadratic", points: [P(1, -2), P(2, 1)] }, correct).score, 0);
  assert.equal(evaluate(s, { family: "absolute", points: [P(1, -2), P(3, 6)] }, correct).score, 0);
  assert.equal(evaluate(s, { family: "quadratic", points: [P(1, -2)] }, correct).score, 0);
  assert.equal(evaluate(parseSettings({}), { family: "linear", points: [P(0, 0), P(1, 1)] }, null).scored, false);
});
