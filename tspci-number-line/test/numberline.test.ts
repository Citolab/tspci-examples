// npm test: numbers, the line, intervals, jumps, the response and the scoring of the number line (src/numberline.ts)
// in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answerFrom, answerText, candidateValues, canonical, clean, correctAnswer, correctValue, emptyAnswer, evaluate, exampleTask,
  formatNumber, inequality, jumpText, keySteps, lineProblems, middle, normalizeInterval, numberParts, parseInterval, parseLine,
  parseList, parseNumber, parseTask, positionsOf, qtiValue, responseProcessingXml, serializeInterval, serializeTask, snapStep,
  snapTo, sumText, taskProblems, ticks, toFraction, touched, type Answer, type Line,
} from "../src/numberline.ts";

const line: Line = parseLine({ min: "-3", max: "8", tickStep: "1/4", labelStep: "1", numberFormat: "mixed", hiddenLabels: "" });

test("parseNumber: integers, decimals with a comma or a point, fractions, mixed numbers, negatives", () => {
  assert.equal(parseNumber("3"), 3);
  assert.equal(parseNumber(" -2 "), -2);
  assert.equal(parseNumber("2,75"), 2.75);
  assert.equal(parseNumber("2.75"), 2.75);
  assert.equal(parseNumber("−1¼"), -1.25);
  assert.equal(parseNumber("-1 1/4"), -1.25);
  assert.equal(parseNumber("11/4"), 2.75);
  assert.equal(parseNumber("½"), 0.5);
  assert.equal(parseNumber("2 ½"), 2.5);
  assert.equal(parseNumber(",5"), 0.5);
  assert.equal(parseNumber("+4"), 4);
  assert.equal(parseNumber("1/3"), 1 / 3);
  for (const bad of ["", "-", "abc", "1/0", "2,5,5", "1 2", "x2", "2-3"]) assert.equal(parseNumber(bad), null, bad);
});

test("fractions and formatting per format and language", () => {
  assert.deepEqual(toFraction(2.75), { negative: false, num: 11, den: 4 });
  assert.deepEqual(toFraction(-1 / 3), { negative: true, num: 1, den: 3 });
  assert.equal(toFraction(Math.PI, 100), null);
  assert.equal(formatNumber(2.75, "decimal", "en"), "2.75");
  assert.equal(formatNumber(2.75, "decimal", "nl"), "2,75");
  assert.equal(formatNumber(-1.25, "decimal", "nl"), "−1,25");
  assert.equal(formatNumber(2.75, "fraction"), "11/4");
  assert.equal(formatNumber(2.75, "mixed"), "2 3/4");
  assert.equal(formatNumber(-0.75, "mixed"), "−3/4");
  assert.equal(formatNumber(-3, "mixed"), "−3");
  assert.equal(formatNumber(0.1 + 0.2, "decimal"), "0.3");
  assert.deepEqual(numberParts(-1.25, "mixed"), { negative: true, decimal: null, whole: 1, num: 1, den: 4 });
  assert.deepEqual(numberParts(4, "fraction"), { negative: false, decimal: "4", whole: null, num: 0, den: 1 });
  assert.equal(canonical(-1.25), "-1.25");
  assert.equal(canonical(1 / 3), "0.333333333");
  assert.equal(clean(-0.0000000001), 0);
});

test("the line: limits, ticks, labelled and hidden ticks", () => {
  assert.deepEqual(line, { min: -3, max: 8, tickStep: 0.25, labelStep: 1, format: "mixed", hidden: [] });
  const t = ticks(line);
  assert.equal(t.length, 45);
  assert.equal(t.filter((x) => x.labelled).length, 12);
  const hidden = ticks(parseLine({ min: "0", max: "10", tickStep: "1", labelStep: "5", hiddenLabels: "5" }));
  assert.deepEqual(hidden.filter((x) => x.labelled).map((x) => [x.value, x.hidden]), [[0, false], [5, true], [10, false]]);
  // only the ends with label step 0; a broken range gets a range
  assert.deepEqual(ticks(parseLine({ min: "0", max: "1", tickStep: "0.1", labelStep: "0" })).filter((x) => x.labelled).map((x) => x.value), [0, 1]);
  assert.deepEqual(parseLine({ min: "5", max: "2" }).max, 15);
  assert.ok((parseLine({ min: "0", max: "1000", tickStep: "0.01" }).max - 0) / parseLine({ min: "0", max: "1000", tickStep: "0.01" }).tickStep <= 400);
  assert.deepEqual(parseList("2; 5 1/2; 7"), [2, 5.5, 7]);
  assert.deepEqual(parseList("2,5 3"), [2.5, 3]);
  assert.deepEqual(parseList(""), []);
});

test("snapping and keyboard steps", () => {
  assert.equal(snapStep(line, "half"), 0.125);
  assert.equal(snapTo(2.8, line, 0.25), 2.75);
  assert.equal(snapTo(-9, line, 0.25), -3);
  assert.equal(snapTo(99, line, 0.25), 8);
  assert.equal(snapTo(0.31, line, 0.025), 0.3);
  const thirds = parseLine({ min: "0", max: "2", tickStep: "1/3" });
  assert.equal(snapTo(0.7, thirds, thirds.tickStep), 0.666666667);
  assert.equal(formatNumber(snapTo(0.7, thirds, thirds.tickStep), "fraction"), "2/3");
  assert.deepEqual(keySteps(line, "tick"), { fine: 0.25, coarse: 1 });
  assert.deepEqual(keySteps(parseLine({ min: "0", max: "10", tickStep: "1", labelStep: "1" }), "tick"), { fine: 1, coarse: 5 });
  assert.equal(middle(line, 0.25), 2.5);
});

test("intervals: text, parse, normalize, inequality", () => {
  const i = { from: -2, to: 8, fromEnd: "closed", toEnd: "none" } as const;
  assert.equal(serializeInterval(i), "[-2,inf)");
  assert.equal(serializeInterval({ from: 3, to: 5, fromEnd: "open", toEnd: "closed" }), "(3,5]");
  assert.equal(serializeInterval({ from: 0, to: 4, fromEnd: "none", toEnd: "open" }), "(-inf,4)");
  assert.deepEqual(parseInterval("[-2,inf)"), { from: -2, to: 0, fromEnd: "closed", toEnd: "none" });
  assert.deepEqual(parseInterval("(3, 5]"), { from: 3, to: 5, fromEnd: "open", toEnd: "closed" });
  assert.equal(parseInterval("3,5"), null);
  assert.deepEqual(normalizeInterval({ from: 5, to: 3, fromEnd: "open", toEnd: "closed" }, line), { from: 3, to: 5, fromEnd: "closed", toEnd: "open" });
  assert.deepEqual(normalizeInterval(parseInterval("[-2,inf)")!, line), { from: -2, to: 8, fromEnd: "closed", toEnd: "none" });
  assert.equal(inequality(i, "decimal", "nl"), "x ≥ −2");
  assert.equal(inequality({ from: 3, to: 5.5, fromEnd: "open", toEnd: "closed" }, "decimal", "nl"), "3 < x ≤ 5,5");
  assert.equal(inequality({ from: 0, to: 4, fromEnd: "none", toEnd: "open" }, "decimal"), "x < 4");
  assert.equal(inequality({ from: 0, to: 4, fromEnd: "none", toEnd: "none" }, "decimal"), null);
});

test("jumps: texts and the route", () => {
  assert.equal(jumpText(2, 6, "decimal"), "+4");
  assert.equal(jumpText(6, 3, "decimal"), "−3");
  assert.equal(jumpText(1, 1.5, "mixed"), "+1/2");
  assert.equal(sumText([2, 6, 3], "decimal"), "2 + 4 − 3 = 3");
  const task = exampleTask();
  const a: Answer = { ...emptyAnswer(task), landings: [6, 3] };
  assert.deepEqual(positionsOf(task, a), [2, 6, 3]);
  assert.deepEqual(positionsOf({ ...task, jumps: { givenStart: false, answer: [2, 6, 3] } }, { ...a, start: 1 }), [1, 6, 3]);
});

test("the task: the example when empty, defaults, round trip", () => {
  assert.deepEqual(parseTask(""), exampleTask());
  assert.deepEqual(parseTask("not json"), exampleTask());
  const t = parseTask('{"points":[{"label":"P","answer":"2,5"},{}],"interval":"(3,5]","jumps":{"givenStart":false,"answer":[1,"4",2]},"read":[{"kind":"tick","value":5}],"tolerance":0.1}');
  assert.deepEqual(t.points, [{ label: "P", answer: 2.5 }, { label: "B", answer: null }]);
  assert.deepEqual(t.interval, { from: 3, to: 5, fromEnd: "open", toEnd: "closed" });
  assert.deepEqual(t.jumps, { givenStart: false, answer: [1, 4, 2] });
  assert.deepEqual(t.read, [{ kind: "tick", label: "", value: 5 }]);
  assert.equal(t.tolerance, 0.1);
  assert.deepEqual(parseTask(serializeTask(t)), t);
});

test("the response: complete or nothing, the interval as text, language independent", () => {
  const task = exampleTask();
  const a = emptyAnswer(task);
  assert.equal(qtiValue("points", task, a), null);
  assert.equal(touched("points", task, a), false);
  const half = { ...a, points: [2.75, null] };
  assert.equal(qtiValue("points", task, half), null);
  assert.equal(touched("points", task, half), true);
  assert.equal(answerText("points", task, half), "2.75 ?");
  assert.deepEqual(qtiValue("points", task, { ...a, points: [2.75, -1.25] }), [2.75, -1.25]);
  assert.deepEqual(qtiValue("read", task, { ...a, read: ["4½", "-1,75", "6"] }), [4.5, -1.75, 6]);
  assert.equal(qtiValue("read", task, { ...a, read: ["4½", "", "6"] }), null);
  assert.deepEqual(candidateValues("read", task, { ...a, read: ["4½", "abc", "6"] }), [4.5, null, 6]);
  assert.equal(qtiValue("interval", task, { ...a, interval: { from: -2, to: 8, fromEnd: "closed", toEnd: "none" } }), "[-2,inf)");
  assert.equal(qtiValue("jumps", task, a), null);
  assert.deepEqual(qtiValue("jumps", task, { ...a, landings: [6] }), [2, 6]);
  assert.deepEqual(correctValue("points", task), [2.75, -1.25]);
  assert.deepEqual(correctValue("jumps", task), [2, 6, 3]);
  assert.equal(correctValue("interval", task), "[-2,inf)");
  assert.equal(correctValue("points", { ...task, points: [{ label: "A", answer: null }] }), null);
});

test("answerFrom: a response back into the candidate's answer", () => {
  const task = exampleTask();
  assert.deepEqual(answerFrom("points", task, [2.75, 99], line).points, [2.75, 8]);
  assert.deepEqual(answerFrom("points", task, "2.75 ?", line).points, [2.75, null]);
  assert.deepEqual(answerFrom("read", task, [4.5, -1.75, 6], line, "nl").read, ["4 1/2", "−1 3/4", "6"]);
  assert.deepEqual(answerFrom("interval", task, "[-2,inf)", line).interval, { from: -2, to: 8, fromEnd: "closed", toEnd: "none" });
  assert.deepEqual(answerFrom("jumps", task, [2, 6, 3], line).landings, [6, 3]);
  const free = { ...task, jumps: { givenStart: false, answer: [2, 6, 3] } };
  const j = answerFrom("jumps", free, "1 5", line);
  assert.equal(j.start, 1);
  assert.deepEqual(j.landings, [5]);
  assert.deepEqual(correctAnswer("jumps", task, line)!.landings, [6, 3]);
});

test("evaluate: one check per item, margins, the interval's ends, the route", () => {
  const task = exampleTask();
  const a = emptyAnswer(task);
  assert.deepEqual(evaluate("points", task, { ...a, points: [2.75, -1] }), { checks: [true, false], score: 1, maxscore: 2, correct: false });
  assert.deepEqual(evaluate("points", { ...task, tolerance: 0.25 }, { ...a, points: [2.5, -1] }), { checks: [true, true], score: 2, maxscore: 2, correct: true });
  assert.deepEqual(evaluate("read", task, { ...a, read: ["4 1/2", "−1,75", "7"] }).checks, [true, true, false]);
  const i = (fromEnd: any, from: number, toEnd: any = "none") => ({ ...a, interval: { from, to: 8, fromEnd, toEnd } });
  assert.deepEqual(evaluate("interval", task, i("closed", -2)), { checks: [true, true], score: 2, maxscore: 2, correct: true });
  assert.deepEqual(evaluate("interval", task, i("open", -2)).checks, [false, true]);
  assert.deepEqual(evaluate("interval", task, i("closed", -2, "closed")).checks, [true, false]);
  assert.deepEqual(evaluate("interval", task, a).checks, [false, false]);
  // the given start is no check; a jump too many is not correct
  assert.deepEqual(evaluate("jumps", task, { ...a, landings: [6, 3] }), { checks: [true, true], score: 2, maxscore: 2, correct: true });
  assert.deepEqual(evaluate("jumps", task, { ...a, landings: [6, 3, 4] }), { checks: [true, true], score: 2, maxscore: 2, correct: false });
  assert.deepEqual(evaluate("jumps", task, { ...a, landings: [5, 3] }).checks, [false, true]);
  const free = { ...task, jumps: { givenStart: false, answer: [2, 6, 3] } };
  assert.deepEqual(evaluate("jumps", free, { ...a, start: 2, landings: [6] }), { checks: [true, true, false], score: 2, maxscore: 3, correct: false });
});

test("the authoring checks", () => {
  assert.deepEqual(lineProblems({ min: "-3", max: "8", tickStep: "1/4", labelStep: "1" }), []);
  assert.deepEqual(lineProblems({ min: "5", max: "2", tickStep: "0", labelStep: "1" }).map((p) => p.code), ["range", "tickStep"]);
  assert.deepEqual(lineProblems({ min: "0", max: "2", tickStep: "0,25", labelStep: "0,3" }).map((p) => p.code), ["labelStep"]);
  assert.deepEqual(lineProblems({ min: "0", max: "1000", tickStep: "0.1", labelStep: "" }).map((p) => p.code), ["tooManyTicks"]);
  const task = exampleTask();
  for (const mode of ["points", "interval", "jumps", "read"] as const) assert.deepEqual(taskProblems(mode, line, task, "tick"), [], mode);
  const bad = { ...task, points: [{ label: "A", answer: null }, { label: "A", answer: 9 }, { label: "", answer: 0.1 }], read: [{ kind: "tick", label: "", value: 2.1 }] as any };
  assert.deepEqual(taskProblems("points", line, bad, "tick"), [
    { code: "noAnswer", label: "A" }, { code: "outOfRange", label: "A" }, { code: "noLabel", label: "3" }, { code: "outsideGrid", label: "3" },
    { code: "duplicateLabels" },
  ]);
  assert.deepEqual(taskProblems("read", line, bad, "tick"), [{ code: "notOnTick", label: "1" }]);
  assert.deepEqual(taskProblems("interval", line, { ...task, interval: null }, "tick"), [{ code: "noInterval" }]);
  assert.deepEqual(taskProblems("jumps", line, { ...task, jumps: { givenStart: true, answer: [2] } }, "tick"), [{ code: "noJumps" }]);
});

test("the response processing scores like evaluate", () => {
  const task = exampleTask();
  const points = responseProcessingXml("points", task);
  assert.match(points, /cardinality="ordered" base-type="float"/);
  assert.equal((points.match(/<qti-response-condition>/g) ?? []).length, 2);
  assert.match(points, /<qti-index n="2"><qti-variable identifier="RESPONSE"\/><\/qti-index><qti-base-value base-type="float">-1.25<\/qti-base-value>/);
  assert.match(points, /<qti-value>2<\/qti-value>/);
  const jumps = responseProcessingXml("jumps", { ...task, tolerance: 0.5 });
  assert.equal((jumps.match(/<qti-response-condition>/g) ?? []).length, 2);
  assert.match(jumps, /tolerance="0.5"><qti-index n="2">/);
  assert.doesNotMatch(jumps, /qti-index n="1"/);
  const interval = responseProcessingXml("interval", task);
  assert.match(interval, /cardinality="single" base-type="string"/);
  assert.match(interval, /<qti-match><qti-variable identifier="RESPONSE"\/><qti-base-value base-type="string">\[-2,inf\)<\/qti-base-value><\/qti-match>/);
});
