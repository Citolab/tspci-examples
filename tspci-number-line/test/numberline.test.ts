// npm test: numbers, the line, intervals, jumps, the response and the scoring of the number line (src/numberline.ts)
// in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answerFrom, answerText, candidateValues, canonical, clean, correctAnswer, correctValue, emptyAnswer, evaluate, exampleTask,
  formatNumber, inequality, jumpText, keySteps, lineProblems, middle, normalizeInterval, numberParts, parseInterval, parseLine,
  parseList, parseNumber, parseTask, positionsOf, qtiValue, responseProcessingXml, serializeInterval, serializeTask, snapStep,
  snapTo, sumText, taskProblems, ticks, toFraction, touched, type Answer, type Line,
  checkEmpty, emptyLayout, emptySolution, emptyTaskFrom, emptyText, type EmptyWork,
  checkDouble, doubleAuthorWork, doubleFreeSpot, doubleRelation, doubleRows, doubleShadeAt, doubleSolution, doubleTaskFrom, doubleText,
  parseAmount, readSettings, type DoubleWork,
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

// --- the empty number line

const emptyTask = (empty: Record<string, unknown>, tolerance = 0) => parseTask(JSON.stringify({ empty, tolerance }));
const work = (start: string, route: [string, string, string][], answer: string): EmptyWork => ({
  start,
  jumps: route.map(([sign, size, landing]) => ({ sign: sign as "+" | "-", size, landing })),
  answer,
});

test("the empty line: any correct route is a correct working", () => {
  const task = emptyTask({ givenStart: true, start: 47, answer: 85 });
  // 47 + 38 via the next ten, via 77, and in one jump
  for (const w of [
    work("", [["+", "3", "50"], ["+", "30", "80"], ["+", "5", "85"]], "85"),
    work("", [["+", "30", "77"], ["+", "8", "85"]], "85"),
    work("", [["+", "40", "87"], ["-", "2", "85"]], "85,0"),
    work("", [["+", "38", "85"]], "85"),
  ]) {
    const e = checkEmpty(task, w);
    assert.deepEqual(e, { answer: 85, jumps: w.jumps.map(() => true), follows: true, working: true, answerCorrect: true }, emptyText(task, w));
  }
});

test("the empty line: what makes the working wrong", () => {
  const task = emptyTask({ givenStart: true, start: 47, answer: 85 });
  // a jump that does not land where it says
  let e = checkEmpty(task, work("", [["+", "3", "50"], ["+", "30", "70"], ["+", "5", "75"]], "75"));
  assert.deepEqual(e.jumps, [true, false, true]);
  assert.equal(e.working, false);
  assert.equal(e.answerCorrect, false);
  // a correct line, but the answer does not follow from it
  e = checkEmpty(task, work("", [["+", "3", "50"], ["+", "35", "85"]], "86"));
  assert.deepEqual(e.jumps, [true, true]);
  assert.equal(e.follows, false);
  assert.equal(e.working, false);
  // a jump without a size or landing, a jump of 0, no jumps at all
  assert.equal(checkEmpty(task, work("", [["+", "", "85"]], "85")).working, false);
  assert.equal(checkEmpty(task, work("", [["+", "0", "47"], ["+", "38", "85"]], "85")).working, false);
  assert.equal(checkEmpty(task, work("", [], "85")).working, false);
  // the right answer without any working is still the right answer
  assert.equal(checkEmpty(task, work("", [], "85")).answerCorrect, true);
  // the sign of a jump counts: forward 3 from 47 is not 44
  assert.equal(checkEmpty(task, work("", [["+", "3", "44"]], "44")).jumps[0], false);
});

test("the empty line: filling up (aanvullen), the answer is all the jumps together", () => {
  // 63 − 48: from 48 to 63
  const task = emptyTask({ givenStart: true, start: 48, answer: 15 });
  const e = checkEmpty(task, work("", [["+", "2", "50"], ["+", "10", "60"], ["+", "3", "63"]], "15"));
  assert.equal(e.follows, true);
  assert.equal(e.working, true);
  assert.equal(e.answerCorrect, true);
  // backwards, from 63 to 48, is 15 too
  const back = emptyTask({ givenStart: false, answer: 15 });
  assert.equal(checkEmpty(back, work("63", [["-", "3", "60"], ["-", "12", "48"]], "15")).working, true);
});

test("the empty line: the candidate's own start, decimals with a comma, the margin", () => {
  // 38 + 47 is the same sum: without a given start, starting at 38 is fine too
  const task = emptyTask({ givenStart: false, start: 47, answer: 85 });
  assert.equal(checkEmpty(task, work("38", [["+", "2", "40"], ["+", "45", "85"]], "85")).working, true);
  assert.equal(checkEmpty(task, work("", [["+", "38", "85"]], "85")).working, false); // no start
  const decimals = emptyTask({ givenStart: true, start: 2.7, answer: 4.5 });
  assert.equal(checkEmpty(decimals, work("", [["+", "0,3", "3"], ["+", "1,5", "4,5"]], "4,5")).working, true);
  assert.equal(checkEmpty(emptyTask({ start: 47, answer: 85 }, 1), work("", [["+", "39", "86"]], "86")).answerCorrect, true);
  // no correct answer in the task: only the working
  assert.equal(checkEmpty(emptyTask({ start: 47 }), work("", [["+", "38", "85"]], "85")).answerCorrect, null);
});

test("the empty line: the layout is not to scale, but in order and readable", () => {
  const task = emptyTask({ givenStart: true, start: 47 });
  const w = work("", [["+", "3", ""], ["+", "30", ""], ["+", "5", ""]], "");
  const { values, x, width } = emptyLayout(task, w, 640);
  assert.deepEqual(values, [47, 50, 80, 85]);
  // in the order of the values, at least 92 px apart, and the +30 jump is the widest
  for (let i = 1; i < x.length; i++) assert.ok(x[i] - x[i - 1] >= 92 - 1e-9, `gap ${i}`);
  assert.ok(x[2] - x[1] > x[1] - x[0] && x[2] - x[1] > x[3] - x[2]);
  assert.equal(width, 640);
  // typing a landing does not move anything: the positions follow the jumps
  const typed = emptyLayout(task, { ...w, jumps: w.jumps.map((j, i) => ({ ...j, landing: ["50", "8", "85"][i] })) }, 640);
  assert.deepEqual(typed.x, x);
  // back to where you were: the same place
  const back = emptyLayout(task, work("", [["+", "10", ""], ["-", "10", ""]], ""), 640);
  assert.equal(back.x[0], back.x[2]);
  // a jump back goes to the left; one without a size yet still gets room
  const left = emptyLayout(task, work("", [["-", "7", ""], ["+", "", ""]], ""), 640);
  assert.ok(left.x[1] < left.x[0] && left.x[2] > left.x[1]);
  // many small jumps: the line gets wider instead of the boxes overlapping
  const many = emptyLayout(task, work("", Array.from({ length: 8 }, () => ["+", "1", ""] as [string, string, string]), ""), 480);
  assert.ok(many.width > 480);
  // only the start: in the middle
  assert.deepEqual(emptyLayout(task, work("", [], ""), 640).x, [320]);
});

test("the empty line: the task, the author's working, the solution and the response processing", () => {
  const example = parseTask("");
  assert.deepEqual(example.empty, { givenStart: true, start: 47, jumps: [{ size: 3, landing: 50 }, { size: 30, landing: 80 }, { size: 5, landing: 85 }], answer: 85 });
  // a task without "empty" (an older item): nothing given
  assert.deepEqual(parseTask(JSON.stringify({ points: [] })).empty, { givenStart: true, start: null, jumps: [], answer: null });
  const solution = emptySolution(example, 85, "nl");
  assert.deepEqual(solution, work("47", [["+", "3", "50"], ["+", "30", "80"], ["+", "5", "85"]], "85"));
  assert.equal(checkEmpty(example, solution).working, true);
  // the author's line back into data-task: only complete jumps, sizes with their sign
  assert.deepEqual(emptyTaskFrom(work("83", [["-", "30", "53"], ["+", "1", "54"], ["+", "", ""]], "54"), false), {
    givenStart: false, start: 83, jumps: [{ size: -30, landing: 53 }, { size: 1, landing: 54 }], answer: 54,
  });
  assert.equal(emptyText(example, work("", [["+", "3", "50"], ["-", "", ""]], "")), "47 +3 50 -? ?");
  assert.deepEqual(correctValue("empty", example), [85]);
  assert.deepEqual(answerFrom("empty", example, [85], line, "en").empty, emptySolution(example, 85, "en"));
  assert.deepEqual(taskProblems("empty", line, emptyTask({ givenStart: true }), "tick").map((p) => p.code), ["noEmptyStart", "noEmptyAnswer"]);
  assert.deepEqual(taskProblems("empty", line, example, "tick"), []);
  const xml = responseProcessingXml("empty", example);
  assert.match(xml, /cardinality="record"/);
  assert.match(xml, /<qti-field-value field-identifier="answer">/);
  assert.match(xml, /<qti-field-value field-identifier="working">/);
  assert.match(xml, /<qti-value>2<\/qti-value>/);
  const a = { ...emptyAnswer(example), empty: work("", [["+", "38", "85"]], "") };
  assert.equal(touched("empty", example, a), true);
  assert.equal(touched("empty", example, emptyAnswer(example)), false);
  assert.deepEqual(evaluate("empty", example, { ...a, empty: work("", [["+", "38", "85"]], "85") }).checks, [true, true]);
});

// --- the double number line (procentenstrook)

const doubleTask = (double: Record<string, unknown>, tolerance = 0) => parseTask(JSON.stringify({ double, tolerance }));
/** Marks as [at, top, bottom], and the answer. */
const strip = (marks: [number, string, string][], answer: string): DoubleWork => ({ marks: marks.map(([at, top, bottom]) => ({ at, top, bottom })), answer });
const percent = doubleTask({
  topLabel: "%", bottomLabel: "€", given: [{ top: 0, bottom: 0, at: 0 }, { top: 100, bottom: 80, at: 1 }], question: { top: 25 }, answer: 20,
});

test("the double line: numbers with a unit, the relation of the two scales", () => {
  assert.equal(parseAmount("25%"), 25);
  assert.equal(parseAmount("€ 20"), 20);
  assert.equal(parseAmount("€20,50"), 20.5);
  assert.equal(parseAmount("12 1/2"), 12.5);
  assert.equal(parseAmount("%"), null);
  const r = doubleRelation([{ top: 0, bottom: 0 }, { top: 100, bottom: 80 }])!;
  assert.equal(r.bottomOf(25), 20);
  assert.equal(r.topOf(60), 75);
  assert.ok(r.fits(12.5, 10) && !r.fits(25, 25) && r.rising);
  // not through 0: Celsius and Fahrenheit, both linear
  const c = doubleRelation([{ top: 0, bottom: 32 }, { top: 100, bottom: 212 }])!;
  assert.equal(c.bottomOf(40), 104);
  // one pair: through 0 ↔ 0 as well
  assert.equal(doubleRelation([{ top: 12, bottom: 40 }])!.bottomOf(18), 60);
  // a third pair: still on the line, or not
  assert.ok(doubleRelation([{ top: 0, bottom: 0 }, { top: 100, bottom: 80 }, { top: 50, bottom: 40 }]));
  assert.equal(doubleRelation([{ top: 0, bottom: 0 }, { top: 100, bottom: 80 }, { top: 50, bottom: 50 }]), null);
  // two with the same number above, or the same below: no relation
  assert.equal(doubleRelation([{ top: 5, bottom: 1 }, { top: 5, bottom: 2 }]), null);
  assert.equal(doubleRelation([{ top: 1, bottom: 5 }, { top: 2, bottom: 5 }]), null);
  // falling: the distance still to go
  assert.equal(doubleRelation([{ top: 0, bottom: 60 }, { top: 60, bottom: 0 }])!.rising, false);
});

test("the double line: any correct route is a correct working", () => {
  for (const w of [
    // halve, halve again
    strip([[0.5, "50", "40"], [0.25, "25", "20"]], "20"),
    // via 10 %: 10 % ↔ 8, 20 % ↔ 16, 5 % ↔ 4, 25 % ↔ 20, in any order of writing
    strip([[0.1, "10%", "€ 8"], [0.05, "5", "4"], [0.2, "20", "16"], [0.25, "25", "20"]], "20"),
    // via a quarter at once, with the unit typed
    strip([[0.25, "25%", "€20"]], "€ 20"),
    // a mark too many, the same as a given pair, and a blank one: they do not spoil it
    strip([[0.5, "50", "40"], [0.25, "25", "20"], [0.99, "100", "80"], [0.7, "", ""]], "20,00"),
  ]) {
    const e = checkDouble(percent, w);
    assert.equal(e.working, true, doubleText(percent, w));
    assert.equal(e.answerCorrect, true, doubleText(percent, w));
  }
});

test("the double line: what makes the working wrong", () => {
  // a pair out of proportion (25 % of 80 is not 25)
  let e = checkDouble(percent, strip([[0.5, "50", "40"], [0.25, "25", "25"]], "25"));
  assert.deepEqual(e.marks, [true, false]);
  assert.equal(e.working, false);
  assert.equal(e.answerCorrect, false);
  // right numbers, but out of order on the strip: 25 % to the right of 50 %
  e = checkDouble(percent, strip([[0.5, "50", "40"], [0.75, "25", "20"]], "20"));
  assert.deepEqual(e.marks, [true, true]);
  assert.equal(e.inOrder, false);
  assert.equal(e.working, false);
  assert.equal(e.answerCorrect, true);
  // a mark with only one number
  e = checkDouble(percent, strip([[0.5, "50", ""], [0.25, "25", "20"]], "20"));
  assert.deepEqual(e.marks, [false, true]);
  assert.equal(e.working, false);
  // the answer is not one of the pairs: the 25 % mark says 20, the answer box 40
  e = checkDouble(percent, strip([[0.5, "50", "40"], [0.25, "25", "20"]], "40"));
  assert.equal(e.follows, false);
  assert.equal(e.working, false);
  // the answer is a pair, but not the question's: 50 % ↔ 40
  assert.equal(checkDouble(percent, strip([[0.5, "50", "40"]], "40")).follows, false);
  // the right answer without any marks: right, but no working
  e = checkDouble(percent, strip([], "20"));
  assert.equal(e.working, false);
  assert.equal(e.answerCorrect, true);
  // only blank marks: no working either
  assert.equal(checkDouble(percent, strip([[0.5, "", ""]], "20")).working, false);
  // not a number
  assert.equal(checkDouble(percent, strip([[0.25, "25", "twenty"]], "20")).marks[0], false);
  assert.equal(checkDouble(percent, strip([[0.25, "25", "20"]], "")).answer, null);
});

test("the double line: two quantities in proportion, the question below, the candidate's own route", () => {
  // 12 km in 40 minutes; how far in 60 minutes? (? ↔ 60)
  const ride = doubleTask({ topLabel: "km", bottomLabel: "min", look: "line", given: [{ top: 0, bottom: 0 }, { top: 12, bottom: 40 }], question: { bottom: 60 }, answer: 18 });
  // without a place, the given pairs are to scale, with room for 18 km
  assert.deepEqual(ride.double.given.map((g) => g.at), [0, 0.6667]);
  assert.equal(ride.double.look, "line");
  // via 6 km ↔ 20 min
  assert.equal(checkDouble(ride, strip([[0.33, "6", "20"], [1, "18", "60"]], "18")).working, true);
  // via 3 km ↔ 10 min, then 18 km ↔ 60 min (×6)
  assert.equal(checkDouble(ride, strip([[0.15, "3", "10"], [0.95, "18", "60"]], "18")).working, true);
  // 18 km, but at 50 minutes
  assert.equal(checkDouble(ride, strip([[0.95, "18", "50"]], "18")).working, false);
  // the answer is the number above the mark with 60 below, not below
  assert.equal(checkDouble(ride, strip([[0.95, "18", "60"]], "60")).follows, false);
});

test("the double line: scales that do not start at 0, falling scales, the margin", () => {
  const temperature = doubleTask({ given: [{ top: 0, bottom: 32 }, { top: 100, bottom: 212 }], question: { top: 40 }, answer: 104 });
  assert.equal(checkDouble(temperature, strip([[0.5, "50", "122"], [0.4, "40", "104"]], "104")).working, true);
  assert.equal(checkDouble(temperature, strip([[0.4, "40", "72"]], "72")).working, false); // 40 × 1,8 without + 32
  // the distance still to go: below goes down as above goes up
  const toGo = doubleTask({ given: [{ top: 0, bottom: 60, at: 0 }, { top: 60, bottom: 0, at: 1 }], question: { top: 15 }, answer: 45 });
  assert.equal(checkDouble(toGo, strip([[0.5, "30", "30"], [0.25, "15", "45"]], "45")).working, true);
  assert.equal(checkDouble(toGo, strip([[0.25, "30", "30"], [0.75, "15", "45"]], "45")).inOrder, false);
  // the margin is for the answer, not for the working
  const margin = doubleTask({ given: [{ top: 0, bottom: 0 }, { top: 100, bottom: 80 }], question: { top: 25 }, answer: 20 }, 1);
  const e = checkDouble(margin, strip([[0.25, "25", "21"]], "21"));
  assert.equal(e.answerCorrect, true);
  assert.equal(e.working, false);
  // no answer in the task: only the working
  assert.equal(checkDouble(doubleTask({ given: [{ top: 0, bottom: 0 }, { top: 100, bottom: 80 }], question: { top: 25 } }), strip([[0.25, "25", "20"]], "20")).answerCorrect, null);
});

test("the double line: where a new mark goes, the rows of the boxes, the shading", () => {
  assert.equal(doubleFreeSpot([0, 1]), 0.5);
  assert.equal(doubleFreeSpot([0, 1, 0.5]), 0.25);
  assert.equal(doubleFreeSpot([0, 1, 0.5, 0.25]), 0.75);
  assert.equal(doubleFreeSpot([]), 0.5);
  assert.equal(doubleFreeSpot([0, 0.6667]), 0.3334);
  // boxes 70 px wide: neighbours closer than that go a row further out, and back when there is room
  assert.deepEqual(doubleRows([0, 400, 200, 240, 260, 330], 70), [0, 0, 0, 1, 2, 0]);
  assert.deepEqual(doubleRows([100, 100], 70), [0, 1]);
  assert.deepEqual(doubleRows([], 70), []);
  // the given pairs keep their row next to the strip: the candidate's mark close to one goes out
  assert.deepEqual(doubleRows([0, 500, 470], 70, 2), [0, 0, 1]);
  assert.deepEqual(doubleRows([0, 500, 470], 70), [0, 1, 0]);
  // shaded up to the mark with the question's number, once it is written
  assert.equal(doubleShadeAt(percent, strip([[0.5, "50", "40"], [0.3, "25", ""]], "")), 0.3);
  assert.equal(doubleShadeAt(percent, strip([[0.5, "50", "40"]], "")), null);
});

test("the double line: the task, the author's strip, the solution, the response and its processing", () => {
  const example = parseTask("");
  assert.deepEqual(example.double.question, { top: 25, bottom: null });
  assert.deepEqual(parseTask(serializeTask(example)), example);
  // an older item without "double": nothing given
  assert.deepEqual(parseTask(JSON.stringify({ points: [] })).double, {
    topLabel: "", bottomLabel: "", look: "strip", given: [], question: { top: null, bottom: null }, marks: [], answer: null,
  });
  // the author's working is a correct working
  const solution = doubleSolution(example, 20, "nl");
  assert.deepEqual(solution, strip([[0.5, "50", "40"], [0.25, "25", "20"]], "20"));
  assert.equal(checkDouble(example, solution).working, true);
  assert.equal(doubleText(example, solution), "0|0 25|20 50|40 100|80 = 20");
  // the author's strip: the given pairs flagged, and back into data-task (only complete marks)
  const authored = doubleAuthorWork(example, "nl");
  assert.deepEqual(authored.marks.map((m) => !!m.given), [true, true, false, false]);
  const back = doubleTaskFrom({ ...authored, marks: [...authored.marks, { at: 0.9, top: "90", bottom: "" }] }, example.double);
  assert.deepEqual(back, example.double);
  assert.deepEqual(doubleTaskFrom({ marks: [{ at: 0.123456, top: "12,5", bottom: "10", given: true }], answer: "" }, example.double).given, [{ top: 12.5, bottom: 10, at: 0.1235 }]);
  // the response
  assert.deepEqual(correctValue("double", example), [20]);
  assert.deepEqual(answerFrom("double", example, [20], line, "en").double, doubleSolution(example, 20, "en"));
  const a = { ...emptyAnswer(example), double: strip([[0.5, "", ""]], "") };
  assert.equal(touched("double", example, a), true);
  assert.equal(touched("double", example, emptyAnswer(example)), false);
  assert.deepEqual(evaluate("double", example, { ...a, double: solution }).checks, [true, true]);
  assert.equal(answerText("double", example, { ...a, double: solution }), "0|0 25|20 50|40 100|80 = 20");
  assert.equal(readSettings({ mode: "double" }).mode, "double");
  const xml = responseProcessingXml("double", example);
  assert.match(xml, /cardinality="record"/);
  assert.match(xml, /<qti-base-value base-type="float">20<\/qti-base-value>/);
  assert.match(xml, /every pair in proportion/);
  assert.match(xml, /<qti-value>2<\/qti-value>/);
});

test("the double line: the authoring checks", () => {
  assert.deepEqual(taskProblems("double", line, parseTask(""), "tick"), []);
  const codes = (double: Record<string, unknown>) => taskProblems("double", line, doubleTask(double), "tick").map((p) => p.code);
  assert.deepEqual(codes({}), ["noDoublePairs", "noDoubleQuestion", "noDoubleAnswer"]);
  const given = [{ top: 0, bottom: 0 }, { top: 100, bottom: 80 }];
  assert.deepEqual(codes({ given: [...given, { top: 50, bottom: 50 }], question: { top: 25 }, answer: 20 }), ["doubleNotLinear"]);
  // given pairs out of order on the strip
  assert.deepEqual(codes({ given: [{ top: 0, bottom: 0, at: 0 }, { top: 100, bottom: 80, at: 0.5 }, { top: 50, bottom: 40, at: 1 }], question: { top: 25 }, answer: 20 }), ["doubleNotLinear"]);
  assert.deepEqual(codes({ given, question: { top: 25, bottom: 20 }, answer: 20 }), ["noDoubleQuestion"]);
  const off = taskProblems("double", line, doubleTask({ given, question: { top: 25 }, answer: 25 }), "tick");
  assert.deepEqual(off, [{ code: "doubleAnswerOff", label: "20" }]);
  // the author's working has to be a correct working
  assert.deepEqual(codes({ given, question: { top: 25 }, marks: [{ top: 50, bottom: 40 }], answer: 20 }), ["doubleWorking"]);
  assert.deepEqual(codes({ given, question: { bottom: 60 }, marks: [{ top: 75, bottom: 60 }], answer: 75 }), []);
});
