// npm test: the task, the checks of the working and the response of the written methods (src/calculation.ts) in node,
// without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkChunking, checkColumns, correctAnswer, correctFields, formatNumber, fromResponse, notANumber, ownWork, parseNumber,
  parseTask, parseWhole, partialsOf, placesOf, responseFields, solutionWork, startWork, taskProblems, toRecord,
  type ChunkRow, type Task, type Work,
} from "../src/calculation.ts";

const division = (first: number, second: number): Task => ({ mode: "chunking", operation: "add", first, second });
const columns = (first: number, second: number, operation: "add" | "subtract" = "add"): Task => ({ mode: "columns", operation, first, second });

/** A hapmethode working from rows [bite, factor, rest]. */
const chunked = (rows: [string, string, string][], answer: string, remainder = "", factorTotal = ""): Work => ({
  ...startWork(division(1, 1)),
  chunks: rows.map(([bite, factor, rest]): ChunkRow => ({ bite, factor, rest })),
  factorTotal,
  answer,
  remainder,
});
/** A kolomsgewijs working. */
const columnWork = (partials: string[], total: string, answer: string): Work => ({ ...startWork(columns(1, 1)), partials, total, answer });

test("parseNumber: whole numbers, minus signs, spaces, decimal comma in Dutch and point in English", () => {
  assert.equal(parseNumber("36"), 36);
  assert.equal(parseNumber(" 36 "), 36);
  assert.equal(parseNumber("-40"), -40);
  assert.equal(parseNumber("−40"), -40);
  assert.equal(parseNumber("1 200"), 1200);
  assert.equal(parseNumber("0"), 0);
  assert.equal(parseNumber("-0"), 0);
  // Dutch: a decimal comma, a point between groups of three
  assert.equal(parseNumber("36,5", "nl"), 36.5);
  assert.equal(parseNumber("1.200", "nl"), 1200);
  assert.equal(parseNumber("12.345.678", "nl"), 12345678);
  assert.equal(parseNumber("8.4", "nl"), 8.4);
  // English: the other way around
  assert.equal(parseNumber("36.5", "en"), 36.5);
  assert.equal(parseNumber("1,200", "en"), 1200);
  assert.equal(parseNumber("8,4", "en"), 8.4);
  for (const bad of ["", " ", "?", "36 r 0", "3x", "--4", "1,2,3", "1.2.3", "12 x 10"]) assert.equal(parseNumber(bad, "nl"), null, bad);
  assert.equal(notANumber("36 r 0"), true);
  assert.equal(notANumber(""), false);
  assert.equal(notANumber("36"), false);
});

test("the task from the settings, and what is wrong with it", () => {
  assert.deepEqual(parseTask({ mode: "chunking", first: "432", second: "12" }), division(432, 12));
  assert.deepEqual(parseTask({ mode: "columns", operation: "subtract", first: "432", second: "178" }), columns(432, 178, "subtract"));
  // unknown values: the defaults
  assert.deepEqual(parseTask({ mode: "other", operation: "times", first: "1", second: "2" }), division(1, 2));
  assert.equal(parseWhole(" 12 "), 12);
  assert.equal(parseWhole("1,5"), null);
  assert.equal(parseWhole("-3"), null);
  assert.deepEqual(taskProblems(division(432, 12)), []);
  assert.deepEqual(taskProblems(division(432, 0)), ["divisorZero"]);
  assert.deepEqual(taskProblems(columns(432, 0)), []);
  assert.deepEqual(taskProblems(parseTask({ mode: "chunking", first: "", second: "x" })), ["first", "second"]);
  assert.deepEqual(taskProblems(columns(123456789, 1)), ["tooLong"]);
});

test("the correct answer and the partials per place value", () => {
  assert.deepEqual(correctAnswer(division(432, 12)), { answer: 36, remainder: 0 });
  assert.deepEqual(correctAnswer(division(437, 12)), { answer: 36, remainder: 5 });
  assert.deepEqual(correctAnswer(division(5, 12)), { answer: 0, remainder: 5 });
  assert.deepEqual(correctAnswer(columns(345, 278)), { answer: 623 });
  assert.deepEqual(correctAnswer(columns(432, 178, "subtract")), { answer: 254 });
  assert.equal(correctAnswer(division(4, 0)), null);
  assert.deepEqual(partialsOf(columns(345, 278)), [500, 110, 13]);
  assert.deepEqual(partialsOf(columns(432, 178, "subtract")), [300, -40, -6]);
  assert.deepEqual(partialsOf(columns(1345, 78)), [1000, 300, 110, 13]);
  assert.deepEqual(partialsOf(columns(340, 250)), [500, 90, 0]);
  assert.equal(placesOf(columns(1345, 78)), 4);
});

test("an empty working: bites for the hapmethode, a partial per place value for kolomsgewijs", () => {
  assert.equal(startWork(division(432, 12)).chunks.length, 3);
  assert.equal(startWork(division(432, 12), 5).chunks.length, 5);
  assert.equal(startWork(division(432, 12), 0).chunks.length, 1);
  assert.equal(startWork(division(432, 12), 99).chunks.length, 12);
  assert.equal(startWork(columns(345, 278)).partials.length, 3);
  assert.equal(startWork(columns(2345, 8)).partials.length, 4);
});

// ---- the hapmethode

test("hapmethode: the route of the explanation, 432 : 12 via 10×, 20× and 6×", () => {
  const work = chunked([["120", "10", "312"], ["240", "20", "72"], ["72", "6", "0"]], "36", "0", "36");
  const check = checkChunking(division(432, 12), work);
  assert.deepEqual(check.rows.map((r) => [r.bite, r.rest]), [[true, true], [true, true], [true, true]]);
  assert.equal(check.sum, 36);
  assert.equal(check.left, 0);
  assert.equal(check.working, true);
  assert.deepEqual(responseFields(division(432, 12), work), { answer: 36, remainder: 0, working: true, answerCorrect: true });
});

test("hapmethode: any choice of bites is fine, big or small, and the factor total may be left out", () => {
  const task = division(432, 12);
  // one big bite and a small one
  assert.equal(checkChunking(task, chunked([["360", "30", "72"], ["72", "6", "0"]], "36")).working, true);
  // many small bites, in an order a pupil might take them
  const small = chunked([["120", "10", "312"], ["120", "10", "192"], ["120", "10", "72"], ["60", "5", "12"], ["12", "1", "0"]], "36", "", "36");
  assert.equal(checkChunking(task, small).working, true);
  // a bite of 2 × 12, then 34 more
  assert.equal(checkChunking(task, chunked([["24", "2", "408"], ["408", "34", "0"]], "36", "0")).working, true);
  // empty rows in between and at the end are skipped
  const gaps = chunked([["360", "30", "72"], ["", "", ""], ["72", "6", "0"], ["", "", ""]], "36");
  assert.equal(checkChunking(task, gaps).working, true);
  assert.deepEqual(checkChunking(task, gaps).rows.map((r) => r.row), [0, 2]);
});

test("hapmethode: a remainder", () => {
  const task = division(437, 12);
  const work = chunked([["360", "30", "77"], ["72", "6", "5"]], "36", "5", "36");
  assert.equal(checkChunking(task, work).working, true);
  assert.deepEqual(responseFields(task, work), { answer: 36, remainder: 5, working: true, answerCorrect: true });
  // the remainder left empty is 0: not what is left, so the answer does not follow, and is not correct
  const noRemainder = { ...work, remainder: "" };
  assert.equal(checkChunking(task, noRemainder).follows, false);
  assert.deepEqual(responseFields(task, noRemainder), { answer: 36, remainder: 0, working: false, answerCorrect: false });
});

test("hapmethode: stopping too early, what is left is not less than the divisor", () => {
  const task = division(432, 12);
  const work = chunked([["360", "30", "72"], ["60", "5", "12"]], "35", "12");
  const check = checkChunking(task, work);
  assert.equal(check.done, false);
  assert.equal(check.follows, true); // the answer does follow from the rows, but the division is not done
  assert.equal(check.working, false);
  assert.deepEqual(responseFields(task, work), { answer: 35, remainder: 12, working: false, answerCorrect: false });
});

test("hapmethode: wrong workings", () => {
  const task = division(432, 12);
  // a bite that is not factor × divisor (10 × 12 is not 100)
  const wrongBite = checkChunking(task, chunked([["100", "10", "332"], ["332", "26", "0"]], "36"));
  assert.deepEqual(wrongBite.rows.map((r) => r.bite), [false, false]);
  assert.equal(wrongBite.working, false);
  // a subtraction that is wrong (432 − 120 is not 322), then carried on correctly from the pupil's own number
  const wrongRest = checkChunking(task, chunked([["120", "10", "322"], ["240", "20", "82"], ["72", "6", "10"]], "36", "10"));
  assert.deepEqual(wrongRest.rows.map((r) => r.rest), [false, true, true]);
  assert.equal(wrongRest.working, false);
  // a bite too big: below zero
  const tooBig = checkChunking(task, chunked([["480", "40", "-48"]], "40", "-48"));
  assert.equal(tooBig.rows[0].rest, false);
  assert.equal(tooBig.working, false);
  // the answer is not the sum of the factors
  const wrongSum = checkChunking(task, chunked([["360", "30", "72"], ["72", "6", "0"]], "37"));
  assert.equal(wrongSum.follows, false);
  assert.equal(wrongSum.working, false);
  // the factor total is not the sum
  assert.equal(checkChunking(task, chunked([["360", "30", "72"], ["72", "6", "0"]], "36", "0", "35")).working, false);
  // a factor missing, a factor of 0, a factor that is not whole
  assert.equal(checkChunking(task, chunked([["360", "", "72"], ["72", "6", "0"]], "36")).working, false);
  assert.equal(checkChunking(task, chunked([["0", "0", "432"], ["432", "36", "0"]], "36")).rows[0].bite, false);
  assert.equal(checkChunking(task, chunked([["6", "0,5", "426"]], "0,5"), "nl").rows[0].bite, false);
  // a rest missing in the middle: the next row cannot be checked either
  const missing = checkChunking(task, chunked([["360", "30", ""], ["72", "6", "0"]], "36"));
  assert.deepEqual(missing.rows.map((r) => r.rest), [false, false]);
  // no bites at all
  assert.equal(checkChunking(task, chunked([["", "", ""]], "36")).working, false);
});

test("hapmethode: a right answer with a wrong working, and a wrong answer with a right working", () => {
  const task = division(432, 12);
  // the answer is right, but the working is a mess
  const lucky = chunked([["100", "10", "300"]], "36", "0");
  assert.deepEqual(responseFields(task, lucky), { answer: 36, remainder: 0, working: false, answerCorrect: true });
  // misread the question as 423 : 12: a correct working of its own (the first rest is wrong against 432)
  const misread = chunked([["360", "30", "63"], ["60", "5", "3"]], "35", "3");
  assert.equal(checkChunking(task, misread).working, false);
  // a correct working of 432 : 12 with a slip in the answer box
  const slip = chunked([["360", "30", "72"], ["72", "6", "0"]], "63", "0");
  assert.deepEqual(responseFields(task, slip), { answer: 63, remainder: 0, working: false, answerCorrect: false });
});

test("hapmethode: when the divisor does not fit at all, no bite is needed", () => {
  const task = division(5, 12);
  assert.equal(checkChunking(task, chunked([["", "", ""]], "0", "5")).working, true);
  assert.deepEqual(responseFields(task, chunked([["", "", ""]], "0", "5")), { answer: 0, remainder: 5, working: true, answerCorrect: true });
});

test("hapmethode: Dutch numbers", () => {
  const task = division(4320, 12);
  const work = chunked([["3.600", "300", "720"], ["720", "60", "0"]], "360", "0", "360");
  assert.equal(checkChunking(task, work, "nl").working, true);
  // a remainder that is not a whole number: no response
  assert.equal(responseFields(task, { ...work, remainder: "2,5" }, "nl"), null);
  assert.equal(responseFields(task, { ...work, remainder: "rest" }, "nl"), null);
});

// ---- kolomsgewijs

test("kolomsgewijs: adding from the left, 345 + 278", () => {
  const task = columns(345, 278);
  const work = columnWork(["500", "110", "13"], "623", "623");
  const check = checkColumns(task, work);
  assert.deepEqual(check.partials, [true, true, true]);
  assert.equal(check.sum, 623);
  assert.equal(check.working, true);
  assert.deepEqual(responseFields(task, work), { answer: 623, working: true, answerCorrect: true });
  // the total may be left out: the answer then follows from the partials
  assert.equal(checkColumns(task, columnWork(["500", "110", "13"], "", "623")).working, true);
});

test("kolomsgewijs: subtracting with negative partials, 432 − 178", () => {
  const task = columns(432, 178, "subtract");
  const work = columnWork(["300", "−40", "-6"], "254", "254");
  assert.equal(checkColumns(task, work).working, true);
  assert.deepEqual(responseFields(task, work), { answer: 254, working: true, answerCorrect: true });
  // the signs dropped: 300, 40, 6 is not the working (and 346 not the answer)
  const unsigned = columnWork(["300", "40", "6"], "346", "346");
  assert.deepEqual(checkColumns(task, unsigned).partials, [true, false, false]);
  assert.deepEqual(responseFields(task, unsigned), { answer: 346, working: false, answerCorrect: false });
});

test("kolomsgewijs: from the right is fine too, and a zero partial may be left empty", () => {
  const task = columns(345, 278);
  const right = checkColumns(task, columnWork(["13", "110", "500"], "623", "623"));
  assert.equal(right.fromRight, true);
  assert.equal(right.working, true);
  // mixed up: neither from the left nor from the right
  assert.equal(checkColumns(task, columnWork(["110", "500", "13"], "623", "623")).working, false);
  // 340 + 250: no ones; 0 or nothing
  const noOnes = columns(340, 250);
  assert.equal(checkColumns(noOnes, columnWork(["500", "90", "0"], "590", "590")).working, true);
  assert.equal(checkColumns(noOnes, columnWork(["500", "90", ""], "590", "590")).working, true);
  // numbers of different lengths: 1345 + 78
  assert.equal(checkColumns(columns(1345, 78), columnWork(["1000", "300", "110", "13"], "1423", "1423")).working, true);
});

test("kolomsgewijs: wrong workings, checked against the pupil's own numbers", () => {
  const task = columns(345, 278);
  // a wrong partial (40 + 70 is not 100): the total and answer follow from it, but the working is wrong
  const wrongPartial = checkColumns(task, columnWork(["500", "100", "13"], "613", "613"));
  assert.deepEqual(wrongPartial.partials, [true, false, true]);
  assert.equal(wrongPartial.total, true);
  assert.equal(wrongPartial.follows, true);
  assert.equal(wrongPartial.working, false);
  // the partials are right but the adding up is not
  const wrongTotal = checkColumns(task, columnWork(["500", "110", "13"], "613", "613"));
  assert.equal(wrongTotal.total, false);
  assert.equal(wrongTotal.follows, false);
  assert.equal(wrongTotal.working, false);
  // the total is right, the answer box is not
  assert.equal(checkColumns(task, columnWork(["500", "110", "13"], "623", "633")).working, false);
  // a partial is not a number
  assert.equal(checkColumns(task, columnWork(["500", "11o", "13"], "623", "623")).sum, null);
  // the digits added as single digits (5 + 8 = 3, carried nowhere)
  assert.equal(checkColumns(task, columnWork(["500", "110", "3"], "613", "613")).working, false);
  // nothing written but the answer
  const answerOnly = columnWork(["", "", ""], "", "623");
  assert.equal(checkColumns(task, answerOnly).working, false);
  assert.deepEqual(responseFields(task, answerOnly), { answer: 623, working: false, answerCorrect: true });
});

// ---- the response

test("the response: nothing until the answer is a number", () => {
  assert.equal(responseFields(division(432, 12), startWork(division(432, 12))), null);
  assert.equal(responseFields(columns(345, 278), columnWork(["500", "110", "13"], "623", "")), null);
  assert.equal(responseFields(columns(345, 278), columnWork(["500", "110", "13"], "623", "?")), null);
  // a decimal answer is an answer (not the right one)
  assert.deepEqual(responseFields(division(438, 12), chunked([["", "", ""]], "36,5"), "nl"), {
    answer: 36.5, remainder: 0, working: false, answerCorrect: false,
  });
});

test("the response as a QTI record, and back", () => {
  const record = toRecord({ answer: 36, remainder: 0, working: true, answerCorrect: true });
  assert.deepEqual(record, {
    record: [
      { name: "answer", base: { float: 36 } },
      { name: "remainder", base: { integer: 0 } },
      { name: "working", base: { boolean: true } },
      { name: "answerCorrect", base: { boolean: true } },
    ],
  });
  assert.deepEqual(fromResponse(record), { answer: 36, remainder: 0 });
  assert.deepEqual(toRecord({ answer: 623, working: false }).record.map((f) => f.name), ["answer", "working"]);
  assert.deepEqual(fromResponse({ base: { float: 623 } }), { answer: 623 });
  assert.deepEqual(fromResponse({ base: { integer: 5 } }), { answer: 5 });
  assert.deepEqual(fromResponse({ base: { string: "36" } }), { answer: 36 });
  assert.deepEqual(fromResponse(["254"]), { answer: 254 });
  assert.deepEqual(fromResponse(12), { answer: 12 });
  assert.deepEqual(fromResponse({ record: [{ name: "answer", value: 12 }, { name: "remainder", value: "3" }] }), { answer: 12, remainder: 3 });
  for (const nothing of [undefined, null, "", "x", {}, { record: [] }, { base: {} }]) assert.equal(fromResponse(nothing), null);
});

test("the correct response from the settings", () => {
  assert.deepEqual(correctFields(division(437, 12)), { answer: 36, remainder: 5, working: true, answerCorrect: true });
  assert.deepEqual(correctFields(columns(432, 178, "subtract")), { answer: 254, working: true, answerCorrect: true });
  assert.equal(correctFields(division(432, 0)), null);
});

test("a worked solution is a correct working, and reports the correct response", () => {
  for (const task of [division(432, 12), division(437, 12), division(5, 12), division(1000, 7), division(98765, 43), columns(345, 278),
    columns(432, 178, "subtract"), columns(1345, 78), columns(340, 250), columns(1000, 1, "subtract")]) {
    const work = solutionWork(task);
    const fields = responseFields(task, work);
    assert.deepEqual(fields, correctFields(task), `${task.mode} ${task.first} ${task.second}`);
  }
  // the route of the solution: a bite per digit of the quotient
  assert.deepEqual(solutionWork(division(432, 12)).chunks, [{ bite: "360", factor: "30", rest: "72" }, { bite: "72", factor: "6", rest: "0" }]);
  assert.deepEqual(solutionWork(columns(432, 178, "subtract")).partials, ["300", "−40", "−6"]);
  // another declared answer goes in the answer boxes; the working stays the method's
  const declared = solutionWork(division(432, 12), { answer: 35.5 }, "nl");
  assert.equal(declared.answer, "35,5");
  assert.equal(declared.remainder, "0");
  assert.equal(formatNumber(-3.5, "nl"), "−3,5");
});

test("a saved working: only strings, the rows of the task", () => {
  const task = columns(345, 278);
  const saved = ownWork(task, { partials: ["500", 110, "13", "extra"], total: "623", answer: "623", chunks: "no" });
  assert.deepEqual(saved.partials, ["500", "", "13"]);
  assert.equal(saved.total, "623");
  assert.equal(saved.chunks.length, 3);
  assert.deepEqual(ownWork(task, null), startWork(task));
  const chunks = ownWork(division(432, 12), { chunks: [{ bite: "120", factor: 10, rest: "312" }] }).chunks;
  assert.deepEqual(chunks, [{ bite: "120", factor: "", rest: "312" }]);
});
