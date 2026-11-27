// npm test: the logic of the staff rota (src/rota.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkBox, clock, correctAnswer, correctState, coverageGaps, evaluateRules, exampleRota, fitShift, ownShifts, parseAmount, parseRota,
  parseRule, passesRule, payOf, putShift, readAnswer, removeShift, resizeShift, restProblems, rotaJSON, rotaResponse, sameAnswer,
  serializeRota, setBreak, shiftIssues, stateFromFields, toMinutes, weekMinutes, type Rota, type RotaState, type Shift,
} from "../src/rota.ts";

const ex = exampleRota();
const solution = ex.shifts!;
const s = (employee: string, day: Shift["day"], start: string, end: string, brk = 0): Shift =>
  ({ employee, day, start: toMinutes(start)!, end: toMinutes(end)!, break: brk });
const rule = (raw: object, shifts: Shift[], r: Rota = ex) => passesRule(r, parseRule(raw)!, shifts);
const state = (patch: Partial<RotaState>): RotaState => ({ shifts: [], answers: [], hours: [], pay: [], ...patch });
const field = (fields: { name: string; base: object }[] | undefined, name: string) => fields?.find((f) => f.name === name)?.base;

test("times and amounts as a candidate types them", () => {
  assert.equal(toMinutes("7:30"), 450);
  assert.equal(toMinutes("07.30"), 450);
  assert.equal(toMinutes("0730"), 450);
  assert.equal(toMinutes("13"), 780);
  assert.equal(toMinutes("13 uur"), 780);
  assert.equal(toMinutes("25:00"), null);
  assert.equal(toMinutes("half acht"), null);
  assert.equal(parseAmount("16,5"), 16.5);
  assert.equal(parseAmount("16.5 uur"), 16.5);
  assert.equal(parseAmount("€ 215,60"), 215.6);
  assert.equal(parseAmount("€1.215,60"), 1215.6);
  assert.equal(parseAmount("1,215.60"), 1215.6);
  assert.equal(parseAmount("110,-"), 110);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("veel"), null);
});

test("the example: its rota passes every rule, in both languages the same", () => {
  const e = evaluateRules(ex, solution);
  assert.deepEqual(e.results.map((x) => x.passed), Array(7).fill(true));
  assert.deepEqual([e.score, e.maxscore, e.correct], [7, 7, true]);
  const nl = exampleRota("nl");
  assert.deepEqual(nl.shifts, solution);
  assert.equal(nl.templates[0].label, "Openen");
  assert.deepEqual(ex.employees.map((x) => weekMinutes(solution, x.id) / 60), [22, 16.5, 13.5, 14, 11]);
});

test("parse: empty or broken is the example; serialize and parse again is the same", () => {
  assert.deepEqual(parseRota(""), ex);
  assert.deepEqual(parseRota("{oops"), ex);
  assert.deepEqual(parseRota(serializeRota(ex)), ex);
});

test("parse: cleans up what an author (or a hand) wrote", () => {
  const r = parseRota(JSON.stringify({
    days: ["sat", { day: "Friday", open: "9:00", close: "8:00" }, "sat"], slot: 45,
    employees: [{ id: "a b", name: "Ann", min: "16", max: 8, wage: "12,345", unavailable: ["Saturday", "xyz"] }, { id: "a b" }],
    templates: [{ label: "Early", start: "7:10", end: "12:00", break: 20 }, { label: "No times" }],
    shifts: [{ employee: "a-b", day: "sat", start: "9:00", end: "17:00", break: 30 }, { employee: "a-b", day: "sat", start: "10:00", end: "11:00" },
      { employee: "nobody", day: "fri", start: "9:00", end: "10:00" }, { employee: "a-b", day: "mon", start: "9:00", end: "10:00" }],
    rules: [{ type: "COVERAGE", staff: "3" }, { type: "nonsense" }, { type: "break", hours: "5,5" }],
    questions: [{ kind: "shift", employee: "nobody", day: "sun" }, { kind: "what" }],
  }));
  assert.deepEqual(r.days.map((d) => [d.day, clock(d.open), clock(d.close)]), [["fri", "09:00", "09:00"], ["sat", "09:00", "17:00"]]);
  assert.equal(r.slot, 30);
  assert.deepEqual([clock(r.start), clock(r.end)], ["08:00", "18:00"]); // an hour around the opening hours
  assert.deepEqual(r.employees, [{ id: "a-b", name: "Ann", min: 16, max: 16, wage: 12.35, unavailable: ["sat"] }]);
  assert.deepEqual(r.templates, [{ id: "s1", label: "Early", start: 480, end: 780, break: 15 }]); // snapped, from 08:00
  assert.deepEqual(r.shifts, [s("a-b", "sat", "09:00", "17:00", 30)]);
  assert.deepEqual(r.rules, [{ type: "coverage", staff: 3, points: 1 }, { type: "break", hours: 5.5, minutes: 30, points: 1 }]);
  assert.equal(r.questions.length, 1);
  assert.deepEqual([r.questions[0].employee, r.questions[0].day], ["a-b", "fri"]); // known ones
  assert.equal(r.own, false);
  assert.deepEqual(r.pay, { sunday: 0, evening: 0, eveningFrom: 1200, askPay: true });
});

test("shifts: one per employee and day; snapped, within the time axis; replace, move, resize, break", () => {
  let p = putShift(ex, [], s("sam", "thu", "07:40", "13:10"))!;
  assert.deepEqual(p.shifts, [s("sam", "thu", "08:00", "13:30")]); // 08:00 is the first column
  assert.equal(p.replaced, null);
  p = putShift(ex, p.shifts, s("sam", "thu", "13:00", "21:30", 30))!;
  assert.deepEqual(p.replaced, s("sam", "thu", "08:00", "13:30"));
  assert.equal(p.shifts.length, 1);
  // moved to Friday: Thursday is free again
  p = putShift(ex, p.shifts, { employee: "sam", day: "fri", start: 1080, end: 1080 + 510, break: 30 }, { employee: "sam", day: "thu" })!;
  assert.deepEqual(p.shifts, [s("sam", "fri", "13:30", "22:00", 30)]); // it keeps its length, the axis ends at 22:00
  assert.equal(putShift(ex, [], s("nobody", "thu", "08:00", "12:00")), null);
  assert.equal(putShift(ex, [], s("sam", "mon", "08:00", "12:00")), null); // the shop is closed on Monday
  let shifts = resizeShift(ex, p.shifts, "sam", "fri", toMinutes("20:10")!)!;
  assert.equal(clock(shifts[0].end), "20:00");
  assert.equal(resizeShift(ex, shifts, "sam", "fri", toMinutes("20:00")!), null);
  assert.equal(clock(resizeShift(ex, shifts, "sam", "fri", 0)![0].end), "14:00"); // at least one column
  shifts = setBreak(ex, shifts, "sam", "fri", 45)!;
  assert.equal(shifts[0].break, 45);
  assert.equal(setBreak(ex, shifts, "sam", "fri", 45), null);
  assert.equal(fitShift(ex, s("sam", "fri", "09:00", "09:30", 60)).break, 15); // a break fits in the shift
  assert.deepEqual(removeShift(shifts, "sam", "fri"), []);
  // in the order of the days, then of the employees
  const two = putShift(ex, putShift(ex, [], s("lisa", "fri", "08:00", "12:00"))!.shifts, s("sam", "fri", "08:00", "12:00"))!.shifts;
  assert.deepEqual(two.map((x) => x.employee), ["sam", "lisa"]);
});

test("coverage: the times with too few people, per day", () => {
  assert.deepEqual(coverageGaps(ex, solution, 2), []);
  const less = solution.filter((x) => !(x.employee === "daan" && x.day === "thu"));
  assert.deepEqual(coverageGaps(ex, less, 2).map((g) => [g.day, clock(g.start), clock(g.end), g.staff]), [["thu", "13:30", "21:00", 1]]);
  assert.deepEqual(coverageGaps(ex, [], 1).map((g) => [g.day, clock(g.start), clock(g.end), g.staff]),
    [["thu", "09:00", "21:00", 0], ["fri", "08:30", "18:00", 0], ["sat", "09:00", "17:00", 0], ["sun", "12:00", "17:00", 0]]);
  assert.equal(rule({ type: "coverage", staff: 3 }, solution), false);
});

test("rules: contract hours, days off, shift length, breaks, rest, weekend", () => {
  const without = (employee: string, day: string) => solution.filter((x) => !(x.employee === employee && x.day === day));
  assert.equal(rule({ type: "contractHours" }, without("ayoub", "sun")), false); // 5.5 hours, at least 8
  assert.equal(rule({ type: "available" }, [...without("noor", "fri"), s("ayoub", "fri", "08:00", "13:30")]), false);
  assert.equal(rule({ type: "maxShift", hours: 9 }, [s("sam", "thu", "08:00", "17:00", 30)]), true);
  assert.equal(rule({ type: "maxShift", hours: 9 }, [s("sam", "thu", "08:00", "17:30", 30)]), false);
  assert.equal(rule({ type: "break", hours: 5.5, minutes: 30 }, [s("sam", "thu", "08:00", "13:30")]), true); // 5.5 hours exactly
  assert.equal(rule({ type: "break", hours: 5.5, minutes: 30 }, [s("sam", "thu", "08:00", "14:00", 15)]), false);
  // Thursday until 21:30, Friday from 08:00: 10.5 hours of rest
  const closeThenOpen = [s("sam", "thu", "13:00", "21:30", 30), s("sam", "fri", "08:00", "13:30")];
  assert.equal(rule({ type: "rest", hours: 11 }, closeThenOpen), false);
  assert.deepEqual(restProblems(closeThenOpen, 11).map((x) => [x.shift.day, x.rest, x.after]), [["fri", 630, "thu"]]);
  assert.equal(rule({ type: "rest", hours: 10.5 }, closeThenOpen), true);
  assert.equal(rule({ type: "weekend", days: 1 }, [...solution, s("sam", "sun", "11:30", "17:30", 30)]), false);
  assert.equal(rule({ type: "weekend", days: 2 }, [...solution, s("sam", "sun", "11:30", "17:30", 30)]), true);
});

test("issues per shift, only for the author's rules", () => {
  const bad = [s("ayoub", "fri", "08:00", "18:00"), s("ayoub", "sat", "08:30", "17:30", 30), s("ayoub", "sun", "11:30", "17:30", 30)];
  const issues = shiftIssues(ex, bad);
  assert.deepEqual(issues.get(bad[0])!.map((x) => x.kind), ["unavailable", "tooLong", "noBreak"]);
  assert.deepEqual(issues.get(bad[2])!.map((x) => x.kind), ["weekend"]);
  assert.deepEqual(shiftIssues({ ...ex, rules: [] }, bad).get(bad[0]), []);
});

test("pay: hours times wage, Sunday and evening surcharges, rounded to cents once", () => {
  const pay = (id: string, r: Rota = ex, shifts = solution) => payOf(r, shifts, id);
  assert.deepEqual([pay("sam").minutes, pay("sam").cents], [1320, 31680]); // 22 h × € 14,40
  assert.deepEqual([pay("noor").cents, pay("noor").sundayMinutes, pay("noor").surchargeCents], [21560, 330, 3080]); // 5,5 h on Sunday × 1,5
  assert.equal(pay("ayoub").cents, 11000);
  // 25 % in the evening from 20:00: Sam works 1.5 hours of it on Thursday (the break is before)
  const evening = { ...ex, pay: { ...ex.pay, evening: 25 } };
  assert.equal(pay("sam", evening).eveningMinutes, 90);
  assert.equal(pay("sam", evening).cents, 31680 + 540);
  // a shift only in the evening: the break comes off the evening
  assert.equal(pay("sam", evening, [s("sam", "thu", "20:00", "22:00", 30)]).eveningMinutes, 90);
  assert.equal(pay("noor", { ...ex, pay: { ...ex.pay, sunday: 0 } }).cents, 18480);
});

test("the boxes: hours against the rota, pay against the candidate's own hours", () => {
  assert.deepEqual(checkBox(ex, solution, "noor", "16,5", "215,60"), { hours: true, pay: true, payFollows: true });
  // 17 hours is wrong, but 17 × 11,20 + the Sunday surcharge of 30,80 = 221,20 follows from it
  assert.deepEqual(checkBox(ex, solution, "noor", "17", "221,20"), { hours: false, pay: false, payFollows: true });
  assert.deepEqual(checkBox(ex, solution, "noor", "17", "215,60"), { hours: false, pay: true, payFollows: false });
  assert.deepEqual(checkBox(ex, solution, "noor", "", "215,6"), { hours: false, pay: true, payFollows: true });
  assert.deepEqual(checkBox(ex, solution, "noor", "", ""), { hours: false, pay: false, payFollows: false });
});

test("questions: the answers follow from the rota", () => {
  const [when, hours, closes, free, staff, opens] = ex.questions;
  assert.deepEqual(correctAnswer(ex, solution, when), { start: 780, end: 1110 });
  assert.equal(correctAnswer(ex, solution, hours), 16.5);
  assert.deepEqual(correctAnswer(ex, solution, closes), ["sam", "lisa"]);
  assert.equal(correctAnswer(ex, solution, free), "free");
  assert.equal(correctAnswer(ex, solution, staff), 4);
  assert.deepEqual(correctAnswer(ex, solution, opens), ["noor", "ayoub"]);
  assert.deepEqual(readAnswer(ex, when, { start: "13.00", end: "1830", free: false }), { start: 780, end: 1110 });
  assert.equal(readAnswer(ex, when, { start: "13:00", end: "", free: false }), null);
  assert.equal(readAnswer(ex, free, { start: "", end: "", free: true }), "free");
  assert.deepEqual(readAnswer(ex, closes, ["lisa", "sam"]), ["sam", "lisa"]);
  assert.equal(readAnswer(ex, closes, []), null);
  assert.equal(readAnswer(ex, hours, "16,5 uur"), 16.5);
  assert.equal(sameAnswer(["sam"], ["sam", "lisa"]), false);
  assert.equal(sameAnswer("free", { start: 1, end: 2 }), false);
});

test("the response of readRota: a point per question, the answers as JSON, and back", () => {
  assert.equal(rotaResponse(ex, "readRota", state({ answers: [null, ""] })), undefined); // nothing answered
  const answers = [{ start: "13:00", end: "18:30", free: false }, "16,5", ["lisa"], { start: "", end: "", free: true }, "4", ["noor", "ayoub"]];
  const r = rotaResponse(ex, "readRota", state({ answers }));
  assert.deepEqual([field(r, "score"), field(r, "maxscore"), field(r, "correct")], [{ integer: 5 }, { integer: 6 }, { integer: 0 }]);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((i) => (field(r, `question${i}`) as any).integer), [1, 1, 0, 1, 1, 1]);
  assert.deepEqual(JSON.parse((field(r, "answers") as any).string), [{ start: "13:00", end: "18:30" }, 16.5, ["lisa"], "free", 4, ["noor", "ayoub"]]);
  const back = stateFromFields(ex, "readRota", { answers: (field(r, "answers") as any).string }, "nl")!;
  assert.deepEqual(back.answers[1], "16,5");
  assert.deepEqual(rotaResponse(ex, "readRota", back), r);
  // the correct response: every question right
  const correct = rotaResponse(ex, "readRota", correctState(ex, "readRota")!);
  assert.deepEqual(field(correct, "score"), { integer: 6 });
  assert.deepEqual(field(correct, "correct"), { integer: 1 });
});

test("the response of makeRota: a check per rule and the rota as JSON", () => {
  assert.equal(rotaResponse(ex, "makeRota", state({})), undefined);
  const r = rotaResponse(ex, "makeRota", state({ shifts: solution.slice(0, 4) }))!;
  assert.deepEqual(r.map((f) => f.name), ["score", "maxscore", "correct", "check1", "check2", "check3", "check4", "check5", "check6", "check7", "rota"]);
  assert.deepEqual([field(r, "check1"), field(r, "check2"), field(r, "check3")], [{ integer: 0 }, { integer: 0 }, { integer: 1 }]);
  assert.deepEqual(JSON.parse((field(r, "rota") as any).string)[0], { employee: "sam", day: "thu", start: "13:00", end: "21:30", break: 30 });
  assert.deepEqual(stateFromFields(ex, "makeRota", { rota: rotaJSON(solution) })!.shifts, solution);
  assert.equal(correctState(ex, "makeRota"), null); // many rotas are right
  assert.deepEqual(ownShifts(ex, JSON.parse(rotaJSON(solution))), solution);
});

test("the response of hoursAndPay: the boxes per employee, checked against the rota", () => {
  assert.equal(rotaResponse(ex, "hoursAndPay", state({ hours: ["", " "] })), undefined);
  const right = correctState(ex, "hoursAndPay", "nl")!;
  assert.deepEqual(right.hours, ["22", "16,5", "13,5", "14", "11"]);
  assert.deepEqual(right.pay, ["316,80", "215,60", "129,60", "168,00", "110,00"]);
  const all = rotaResponse(ex, "hoursAndPay", right)!;
  assert.deepEqual([field(all, "score"), field(all, "maxscore"), field(all, "correct")], [{ integer: 10 }, { integer: 10 }, { integer: 1 }]);
  assert.deepEqual([field(all, "hours2"), field(all, "pay2")], [{ float: 16.5 }, { float: 215.6 }]);
  assert.deepEqual(stateFromFields(ex, "hoursAndPay", Object.fromEntries(all.map((f) => [f.name, Object.values(f.base)[0]])), "nl")!.pay, right.pay);
  // Noor's hours wrong, her pay follows from them
  const some = rotaResponse(ex, "hoursAndPay", state({ hours: ["22", "17"], pay: ["316,80", "221,20"] }))!;
  assert.deepEqual([field(some, "score"), field(some, "hoursCorrect"), field(some, "payCorrect"), field(some, "payFollows")],
    [{ integer: 3 }, { boolean: false }, { boolean: false }, { boolean: false }]); // the other three are blank
  assert.equal(field(some, "hours3"), undefined);
  // only hours
  const hoursOnly = { ...ex, pay: { ...ex.pay, askPay: false } };
  const h = rotaResponse(hoursOnly, "hoursAndPay", correctState(hoursOnly, "hoursAndPay")!)!;
  assert.deepEqual(h.map((f) => f.name), ["score", "maxscore", "correct", "hours1", "hours2", "hours3", "hours4", "hours5", "hoursCorrect", "rota"]);
  // an own rota: its hours, nothing given
  const own = { ...ex, own: true };
  assert.equal(correctState(own, "hoursAndPay"), null);
  const mine = rotaResponse(own, "hoursAndPay", state({ shifts: [s("sam", "thu", "08:00", "12:00")], hours: ["4"] }))!;
  assert.deepEqual(field(mine, "hours1"), { float: 4 });
  assert.equal(field(mine, "score")!.hasOwnProperty("integer"), true);
  assert.deepEqual(field(mine, "score"), { integer: 1 });
});
