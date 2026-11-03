// npm test: the fractions, models and scoring of the fraction model (src/fraction.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXAMPLE, correctValues, equivalent, evaluate, format, formatNumber, matchValues, normalizeModel, ownStates, parseFraction, parseSetup,
  partsFor, percentOf, problems, resize, serializeSetup, shadingJson, simplest, solutionStates, startState, startStates, statesFor, toggle,
  typedFraction, valueOf,
} from "../src/fraction.ts";
import type { ModelState, Setup } from "../src/fraction.ts";

const shade = (state: ModelState, ...parts: number[]) => parts.reduce((s, p) => toggle(s, p, true), state);
const setup = (...models: object[]): Setup => ({ models: models.map(normalizeModel) });

test("parseFraction reads fractions, percentages and decimals without simplifying", () => {
  assert.deepEqual(parseFraction("3/8"), { n: 3, d: 8 });
  assert.deepEqual(parseFraction(" 6 / 16 "), { n: 6, d: 16 });
  assert.deepEqual(parseFraction("35%"), { n: 35, d: 100 });
  assert.deepEqual(parseFraction("37,5%"), { n: 375, d: 1000 });
  assert.deepEqual(parseFraction("0.375"), { n: 375, d: 1000 });
  assert.deepEqual(parseFraction("1"), { n: 1, d: 1 });
  assert.deepEqual(parseFraction(1), { n: 1, d: 1 });
  for (const bad of ["", "3/0", "-1/2", "a/b", "3/8/2", "1e3", null, undefined, {}]) assert.equal(parseFraction(bad), null, String(bad));
});

test("simplest, equivalent, percentOf and formatNumber", () => {
  assert.equal(simplest({ n: 6, d: 16 }), "3/8");
  assert.equal(simplest({ n: 0, d: 5 }), "0/1");
  assert.equal(simplest({ n: 4, d: 4 }), "1/1");
  assert.equal(simplest({ n: 35, d: 100 }), "7/20");
  assert.equal(simplest(null), "");
  assert.equal(format({ n: 6, d: 16 }), "6/16");
  assert.ok(equivalent({ n: 2, d: 3 }, { n: 8, d: 12 }));
  assert.ok(!equivalent({ n: 2, d: 3 }, { n: 3, d: 4 }));
  assert.ok(!equivalent(null, { n: 1, d: 2 }));
  assert.equal(percentOf({ n: 3, d: 8 }), 37.5);
  assert.equal(percentOf({ n: 1, d: 3 }), 33.33);
  assert.equal(formatNumber(37.5, "nl"), "37,5");
  assert.equal(formatNumber(37.5, "en"), "37.5");
});

test("normalizeModel keeps every field in range", () => {
  const m = normalizeModel({ type: "grid", rows: 99, columns: 0, shaded: [0, 5, 5, -1, 200] });
  assert.equal(m.rows, 12);
  assert.equal(m.columns, 1);
  assert.equal(m.parts, 12);
  assert.deepEqual(m.shaded, [0, 5]);
  const d = normalizeModel({ type: "bar", parts: 3, divide: true, min: 4, max: 2 });
  assert.equal(d.min, 4);
  assert.equal(d.max, 4);
  assert.equal(d.parts, 4);
  assert.equal(normalizeModel({ type: "set", divide: true }).divide, false, "a set is not divided");
  assert.equal(normalizeModel({ type: "bar", task: "name", divide: true }).divide, false);
  assert.equal(normalizeModel({ type: "circle", scale: true }).scale, false, "only a bar has a scale");
  assert.equal(normalizeModel({ type: "nonsense" }).type, "bar");
});

test("parseSetup: empty or broken gives the example; serializeSetup round-trips", () => {
  assert.equal(parseSetup(""), EXAMPLE);
  assert.equal(parseSetup("{oops"), EXAMPLE);
  assert.equal(parseSetup('{"models":[]}'), EXAMPLE);
  const s = parseSetup(JSON.stringify([{ type: "grid", rows: 10, columns: 10, target: "35%" }, { type: "bar", parts: 4, divide: true, min: 2, max: 24, scale: true }]));
  assert.equal(s.models.length, 2);
  const text = serializeSetup(s);
  assert.deepEqual(parseSetup(text), s);
  assert.ok(!text.includes('"simplest"'), "defaults are left out");
  assert.equal(parseSetup(JSON.stringify({ models: Array(6).fill({ type: "bar" }) })).models.length, 4);
});

test("toggle shades and unshades one part", () => {
  const s = startState(normalizeModel({ type: "bar", parts: 8 }));
  const a = shade(s, 3, 1, 3);
  assert.deepEqual(a.shaded, [1, 3]);
  assert.deepEqual(toggle(a, 1).shaded, [3]);
  assert.equal(toggle(a, 9), a, "outside the model: nothing");
  assert.equal(toggle(a, 1, true), a, "already shaded: the same state");
});

test("resize keeps the shading when the parts split or merge evenly, else clears it", () => {
  const s = shade(startState(normalizeModel({ type: "bar", parts: 3 })), 0, 2);
  const six = resize(s, 6);
  assert.ok(six.kept);
  assert.deepEqual(six.state.shaded, [0, 1, 4, 5]);
  const back = resize(six.state, 3);
  assert.ok(back.kept);
  assert.deepEqual(back.state.shaded, [0, 2]);
  const half = resize(shade(startState(normalizeModel({ type: "bar", parts: 6 })), 0), 3);
  assert.ok(!half.kept, "half a group shaded");
  assert.deepEqual(half.state.shaded, []);
  const odd = resize(s, 4);
  assert.ok(!odd.kept);
  assert.equal(odd.state.parts, 4);
  assert.ok(resize(startState(normalizeModel({ type: "bar", parts: 3 })), 5).kept, "nothing shaded: nothing lost");
});

test("valueOf: shaded over parts, or what the candidate typed", () => {
  const bar = normalizeModel({ type: "bar", parts: 8 });
  assert.deepEqual(valueOf(bar, shade(startState(bar), 0, 1, 2)), { n: 3, d: 8 });
  const name = normalizeModel({ type: "circle", parts: 4, shaded: [0], task: "name" });
  const typed = { ...startState(name), numerator: "2", denominator: "8" };
  assert.deepEqual(valueOf(name, typed), { n: 2, d: 8 });
  assert.equal(typedFraction(name, { ...typed, denominator: "0" }), null);
  assert.equal(typedFraction(name, { ...typed, numerator: "" }), null);
  const pct = normalizeModel({ type: "grid", task: "name", entry: "percent" });
  assert.deepEqual(typedFraction(pct, { ...startState(pct), percent: "37,5" }), { n: 375, d: 1000 });
  assert.equal(typedFraction(pct, { ...startState(pct), percent: "3x" }), null);
});

test("evaluate: shade 3/8, scored on the proportion whichever parts", () => {
  const s = setup({ type: "bar", parts: 8, target: "3/8" });
  const st = startStates(s);
  assert.equal(evaluate(s, st).score, 0);
  const e = evaluate(s, [shade(st[0], 7, 2, 5)]);
  assert.equal(e.score, 1);
  assert.equal(e.maxscore, 1);
  assert.ok(e.correct);
  assert.equal(evaluate(s, [shade(st[0], 0, 1)]).correct, false);
});

test("evaluate: 35% on a 10 × 10 grid", () => {
  const s = setup({ type: "grid", rows: 10, columns: 10, target: "35%" });
  const state = { ...startStates(s)[0], shaded: Array.from({ length: 35 }, (_, i) => i * 2) };
  assert.ok(evaluate(s, [state]).correct);
  assert.deepEqual(matchValues(s, [state]), ["7/20"]);
  assert.deepEqual(correctValues(s), ["7/20"]);
});

test("evaluate: what fraction is shaded? equivalent fractions count unless lowest terms is asked", () => {
  const s = setup({ type: "circle", parts: 8, shaded: [0, 1, 2, 3, 4, 5], task: "name", target: "3/4" });
  const typed = (n: string, d: string) => [{ ...startStates(s)[0], numerator: n, denominator: d }];
  assert.ok(evaluate(s, typed("6", "8")).correct);
  assert.ok(evaluate(s, typed("3", "4")).correct);
  assert.ok(!evaluate(s, typed("6", "9")).correct);
  assert.deepEqual(matchValues(s, typed("6", "8")), ["3/4"]);
  assert.deepEqual(matchValues(s, typed("", "8")), [""]);
  const lowest = setup({ ...s.models[0], simplest: true });
  assert.ok(!evaluate(lowest, typed("6", "8")).correct);
  const r = evaluate(lowest, typed("6", "8")).results[0];
  assert.ok(r.fraction && !r.lowest);
  assert.ok(evaluate(lowest, typed("3", "4")).correct);
});

test("evaluate: divide the bar to shade 5/12, with or without a required number of parts", () => {
  const s = setup({ type: "bar", parts: 4, divide: true, min: 1, max: 24, target: "5/12" });
  const twelve = shade(resize(startStates(s)[0], 12).state, 0, 1, 2, 3, 4);
  assert.ok(evaluate(s, [twelve]).correct);
  const twentyFour = { ...resize(startStates(s)[0], 24).state, shaded: [...Array(10).keys()] };
  assert.ok(evaluate(s, [twentyFour]).correct, "10/24 is 5/12");
  const exact = setup({ ...s.models[0], requireParts: 12 });
  assert.ok(evaluate(exact, [twelve]).correct);
  const r = evaluate(exact, [twentyFour]).results[0];
  assert.ok(r.fraction && !r.parts && !r.passed);
});

test("evaluate: compare models, =1 follows what the candidate did in model 1", () => {
  const s = setup({ type: "bar", parts: 3, target: "2/3" }, { type: "bar", parts: 6, target: "=1" });
  const [a, b] = startStates(s);
  const e = evaluate(s, [shade(a, 0, 1), shade(b, 0, 1, 2, 3)]);
  assert.equal(e.score, 2);
  const wrongFirst = evaluate(s, [shade(a, 0), shade(b, 0, 1)]);
  assert.equal(wrongFirst.results[0].passed, false);
  assert.equal(wrongFirst.results[1].passed, true, "the same as model 1, even when model 1 is wrong");
  assert.deepEqual(correctValues(s), ["2/3", "2/3"]);
  const noTarget = setup({ type: "bar", parts: 3 }, { type: "bar", parts: 6, target: "1/2" });
  assert.equal(correctValues(noTarget), null);
  assert.equal(evaluate(noTarget, startStates(noTarget)).maxscore, 1);
});

test("partsFor and statesFor: a value back in the models", () => {
  const fixed = normalizeModel({ type: "bar", parts: 8 });
  assert.equal(partsFor(fixed, { n: 3, d: 4 }), 8);
  assert.equal(partsFor(fixed, { n: 1, d: 3 }), null);
  const divide = normalizeModel({ type: "circle", parts: 4, divide: true, min: 2, max: 12 });
  assert.equal(partsFor(divide, { n: 5, d: 12 }), 12);
  assert.equal(partsFor(divide, { n: 1, d: 2 }), 4, "its own parts when they fit");
  assert.equal(partsFor(divide, { n: 3, d: 2 }), null, "more than the whole");
  const s: Setup = { models: [fixed, divide, normalizeModel({ type: "grid", task: "name", entry: "percent" }), normalizeModel({ type: "set", task: "name" })] };
  const states = statesFor(s, ["3/4", "5/12", "7/20", "2/5"]);
  assert.deepEqual(states[0].shaded, [0, 1, 2, 3, 4, 5]);
  assert.equal(states[1].parts, 12);
  assert.equal(states[1].shaded.length, 5);
  assert.equal(states[2].percent, "35");
  assert.deepEqual([states[3].numerator, states[3].denominator], ["2", "5"]);
  assert.deepEqual(statesFor(s, ["1/3"])[0], startState(fixed), "does not fit: unchanged");
});

test("solutionStates shades every answer of the settings", () => {
  const s = setup({ type: "circle", parts: 3, target: "2/3" }, { type: "bar", parts: 6, target: "=1" });
  const states = solutionStates(s);
  assert.deepEqual(states[0].shaded, [0, 1]);
  assert.deepEqual(states[1].shaded, [0, 1, 2, 3]);
  assert.deepEqual(matchValues(s, states), correctValues(s));
});

test("ownStates fits a saved state to the models; shadingJson round-trips", () => {
  const s = setup({ type: "bar", parts: 4, divide: true, min: 2, max: 10 }, { type: "circle", parts: 5, task: "name" });
  assert.deepEqual(ownStates(s, [{ parts: 99, shaded: [0, 20] }, { numerator: "1", denominator: "5", shaded: [1] }]), [
    { parts: 10, shaded: [0], numerator: "", denominator: "", percent: "" },
    { parts: 5, shaded: [], numerator: "1", denominator: "5", percent: "" },
  ]);
  assert.deepEqual(ownStates(s, "nonsense"), startStates(s));
  const states: ModelState[] = [{ ...startStates(s)[0], parts: 6, shaded: [1, 2] }, { ...startStates(s)[1], numerator: "3", denominator: "5" }];
  assert.deepEqual(ownStates(s, JSON.parse(shadingJson(s, states))), states);
});

test("problems: what the author has to fix", () => {
  const codes = (...models: object[]) => problems(setup(...models)).map((p) => p.code);
  assert.deepEqual(codes({ type: "bar", parts: 8, target: "3/8" }), []);
  assert.deepEqual(codes({ type: "bar", parts: 8, target: "drie" }), ["badTarget"]);
  assert.deepEqual(codes({ type: "bar", parts: 8, target: "1/3" }), ["notShadable"]);
  assert.deepEqual(codes({ type: "bar", parts: 4, divide: true, max: 24, target: "1/3" }), []);
  assert.deepEqual(codes({ type: "bar", parts: 8, target: "=1" }), ["badRef"]);
  assert.deepEqual(codes({ type: "bar", parts: 8, target: "=2" }), ["badRef"]);
  assert.deepEqual(codes({ type: "circle", parts: 4, shaded: [0], task: "name" }), ["nameNoTarget"]);
  assert.deepEqual(codes({ type: "circle", parts: 4, shaded: [0], task: "name", target: "2/4" }), ["nameMismatch"]);
  assert.deepEqual(codes({ type: "circle", parts: 4, shaded: [0], task: "name", target: "25%" }), []);
  assert.deepEqual(codes({ type: "bar", parts: 4, divide: true, max: 10, requireParts: 12 }), ["partsRange"]);
  assert.deepEqual(codes({ type: "bar", parts: 4, divide: true, max: 24, requireParts: 10, target: "5/12" }), ["partsTarget"]);
  assert.deepEqual(problems({ models: [] }).map((p) => p.code), ["noModels"]);
  assert.deepEqual(problems(EXAMPLE), []);
});
