// npm test: the logic of the week planner (src/planner.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clock, conflicts, evaluate, examplePlanner, formatNumber, longestStretch, ownPlacements, parseCheck, parseNumber, parsePlanner,
  parseSchedule, passes, place, remove, resize, scheduleJSON, serializePlanner, slotStarts, toMinutes, type Check, type Placement, type Planner,
} from "../src/planner.ts";

const ex = examplePlanner();
const solution = ex.solution!;
const at = (task: string, resource: string, day: Placement["day"], start: string, end: string): Placement =>
  ({ task, resource, day, start: toMinutes(start)!, end: toMinutes(end)! });
const check = (c: Partial<Check> & { type: Check["type"] }, placements: Placement[], p: Planner = ex) => passes(p, parseCheck(c)!, placements);

test("time: minutes and clock times", () => {
  assert.equal(toMinutes("9:30"), 570);
  assert.equal(toMinutes("09.30"), 570);
  assert.equal(toMinutes(600), 600);
  assert.equal(toMinutes("25:00"), null);
  assert.equal(toMinutes("noon"), null);
  assert.equal(clock(570), "09:30");
  assert.equal(formatNumber(7.5, "nl"), "7,5");
  assert.equal(formatNumber(7.5, "en"), "7.5");
  assert.equal(parseNumber("7,5"), 7.5);
  assert.equal(parseNumber("x"), null);
});

test("the example: its solution passes every check", () => {
  const e = evaluate(ex, solution);
  assert.deepEqual(e.results.map((r) => r.passed), Array(9).fill(true));
  assert.equal(e.score, 9);
  assert.equal(e.maxscore, 9);
  assert.equal(e.correct, true);
  assert.equal(slotStarts(ex).length, 20);
});

test("the example in Dutch has the same ids", () => {
  const nl = examplePlanner("nl");
  assert.deepEqual(nl.tasks.map((t) => t.id), ex.tasks.map((t) => t.id));
  assert.equal(nl.fixed[0].label, "Teamoverleg");
});

test("parse: empty or broken is the example; serialize and parse again is the same", () => {
  assert.deepEqual(parsePlanner(""), ex);
  assert.deepEqual(parsePlanner("{oops"), ex);
  assert.deepEqual(parsePlanner(serializePlanner(ex)), ex);
});

test("parse: cleans up what an author (or a hand) wrote", () => {
  const p = parsePlanner(JSON.stringify({
    days: ["Monday", "wed", "xyz", "mon"], start: "7:00", end: "12:10", slot: 15, open: { start: "6:00", end: "11:00" },
    resources: [{ id: "van 1", name: "Van 1" }, { id: "van 1" }],
    fixed: [{ day: "wed", start: "8:00", end: "8:00" }, { day: "mon", start: "8:00", end: "9:00", resource: "nobody" }],
    tasks: [{ label: "Load", duration: 50 }, { id: "t1", label: "dup" }, { id: "x", duration: "1000", min: 15, max: 30 }],
    checks: [{ type: "GAP", a: "t1", b: "x", hours: "2,5" }, { type: "nonsense" }],
  }));
  assert.deepEqual(p.days, ["mon", "wed"]);
  assert.equal(clock(p.end), "12:15"); // whole rows
  assert.deepEqual(p.open, { start: 420, end: 660 });
  assert.deepEqual(p.resources, [{ id: "van-1", name: "Van 1" }]);
  assert.equal(p.fixed.length, 1);
  assert.equal(p.fixed[0].resource, ""); // an unknown resource: everyone
  assert.equal(p.tasks.length, 2);
  assert.equal(p.tasks[0].duration, 45);
  assert.deepEqual([p.tasks[1].min, p.tasks[1].duration, p.tasks[1].max], [15, 315, 315]); // the whole day at most
  assert.deepEqual(p.checks, [{ type: "gap", a: "t1", b: "x", hours: 2.5, points: 1 }]);
});

test("place: snaps to the rows, stays in the day, keeps its length when moved", () => {
  let ps = place(ex, [], "t5", "anna", "mon", 8 * 60 + 40)!;
  assert.deepEqual(ps, [at("t5", "anna", "mon", "08:30", "10:30")]);
  ps = place(ex, ps, "t5", "bas", "thu", 17 * 60)!; // 2 hours do not fit after 17:00
  assert.deepEqual(ps, [at("t5", "bas", "thu", "16:00", "18:00")]);
  ps = place(ex, ps, "t1", "anna", "mon", 9 * 60)!;
  assert.deepEqual(ps.map((x) => x.task), ["t1", "t5"]); // in the order of the tasks
  assert.equal(place(ex, ps, "t1", "bas", "mon", 9 * 60), null); // only Anna does the intake
  assert.equal(place(ex, ps, "t1", "anna", "sat", 9 * 60), null); // no Saturday
  assert.equal(place(ex, ps, "zz", "anna", "mon", 9 * 60), null);
  assert.deepEqual(remove(ps, "t1").map((x) => x.task), ["t5"]);
});

test("resize: only between the task's min and max", () => {
  const ps = place(ex, [], "t7", "anna", "thu", 14 * 60)!;
  assert.deepEqual(resize(ex, ps, "t7", 16 * 60), [at("t7", "anna", "thu", "14:00", "16:00")]);
  assert.deepEqual(resize(ex, ps, "t7", 18 * 60), [at("t7", "anna", "thu", "14:00", "16:00")]); // max 2 hours
  assert.equal(resize(ex, ps, "t7", 14 * 60 + 30), null); // min 1 hour: no change
  assert.equal(resize(ex, place(ex, [], "t1", "anna", "mon", 540)!, "t1", 700), null); // a fixed length
  // a moved task keeps its new length
  const longer = resize(ex, ps, "t7", 15 * 60 + 30)!;
  assert.deepEqual(place(ex, longer, "t7", "anna", "fri", 9 * 60), [at("t7", "anna", "fri", "09:00", "10:30")]);
});

test("conflicts: overlaps with tasks and fixed blocks, outside opening hours", () => {
  const ps = [at("t2", "anna", "wed", "09:30", "10:30"), at("t5", "anna", "wed", "10:00", "12:00"), at("t6", "bas", "wed", "08:00", "08:30")];
  const c = conflicts(ex, ps);
  assert.deepEqual(c.t2, { overlaps: ["t5", "f1"], outside: false }); // the team meeting is everyone's
  assert.deepEqual(c.t5, { overlaps: ["t2"], outside: false });
  assert.deepEqual(c.t6, { overlaps: [], outside: true });
  assert.deepEqual(conflicts(ex, [at("t6", "bas", "fri", "10:00", "10:30")]).t6.overlaps, ["f3"]); // Bas's day off
});

test("checks: everything planned, no overlaps, opening hours", () => {
  assert.equal(check({ type: "allPlanned" }, solution), true);
  assert.equal(check({ type: "allPlanned" }, solution.slice(1)), false);
  assert.equal(check({ type: "noOverlap" }, [...solution.filter((x) => x.task !== "t4"), at("t4", "bas", "wed", "09:30", "10:00")]), false);
  assert.equal(check({ type: "noOverlap" }, [at("t2", "anna", "mon", "09:00", "10:00"), at("t6", "bas", "mon", "09:00", "09:30")]), true); // other columns
  assert.equal(check({ type: "openingHours" }, [at("t6", "bas", "mon", "17:00", "17:30")]), false);
  assert.equal(check({ type: "openingHours" }, [at("t6", "bas", "mon", "16:30", "17:00")]), true);
});

test("checks: before, same day, not on a day, hours between", () => {
  const a = at("t1", "anna", "mon", "09:00", "10:30");
  assert.equal(check({ type: "before", a: "t1", b: "t2" }, [a, at("t2", "bas", "mon", "10:30", "11:30")]), true); // right after
  assert.equal(check({ type: "before", a: "t1", b: "t2" }, [a, at("t2", "bas", "mon", "10:00", "11:00")]), false);
  assert.equal(check({ type: "before", a: "t1", b: "t2" }, [at("t1", "anna", "tue", "09:00", "10:30"), at("t2", "bas", "mon", "16:00", "17:00")]), false);
  assert.equal(check({ type: "before", a: "t1", b: "t2" }, [a]), false); // not planned
  assert.equal(check({ type: "sameDay", a: "t5", b: "t6" }, [at("t5", "bas", "tue", "10:00", "12:00"), at("t6", "anna", "tue", "16:00", "16:30")]), true);
  assert.equal(check({ type: "sameDay", a: "t5", b: "t6" }, [at("t5", "bas", "tue", "10:00", "12:00"), at("t6", "anna", "thu", "16:00", "16:30")]), false);
  assert.equal(check({ type: "notOnDay", task: "t5", day: "wed" }, [at("t5", "bas", "wed", "10:00", "12:00")]), false);
  assert.equal(check({ type: "notOnDay", task: "t5", day: "wed" }, []), false); // not planned
  assert.equal(check({ type: "notOnDay", task: "", day: "fri" }, solution), true); // no task at all on Friday
  assert.equal(check({ type: "notOnDay", task: "", day: "mon" }, solution), false);
  // Monday 9:30 → Wednesday 9:30 is 48 hours exactly; in either order
  const gap = { type: "gap" as const, a: "t3", b: "t4", hours: 48 };
  assert.equal(check(gap, [at("t3", "bas", "mon", "09:00", "09:30"), at("t4", "bas", "wed", "09:30", "10:00")]), true);
  assert.equal(check(gap, [at("t3", "bas", "mon", "09:00", "09:30"), at("t4", "bas", "wed", "09:00", "09:30")]), false);
  assert.equal(check(gap, [at("t4", "bas", "mon", "09:00", "09:30"), at("t3", "bas", "wed", "09:30", "10:00")]), true);
});

test("checks: hours per day and breaks count fixed work", () => {
  // Anna on Tuesday: a 4-hour training; 4 more hours make 8, 4.5 make too many
  const morning = [at("t5", "anna", "tue", "08:30", "10:30"), at("t1", "anna", "tue", "10:30", "12:00"), at("t2", "anna", "tue", "12:00", "13:00")];
  assert.equal(check({ type: "maxHours", hours: 8 }, morning.slice(0, 2)), true);
  assert.equal(check({ type: "maxHours", hours: 8 }, morning), false);
  assert.equal(check({ type: "maxHours", hours: 7.5 }, morning.slice(0, 2)), true);
  // 08:30–13:00 without a break, then the training from 13:00: far over 4 hours
  assert.equal(check({ type: "break", hours: 4, minutes: 30 }, morning), false);
  // 08:30–12:00 is 3.5 hours, an hour's break, then the 4-hour training
  assert.equal(check({ type: "break", hours: 4, minutes: 30 }, morning.slice(0, 2)), true);
  // a day off is no work: Bas has half an hour on Friday, Anna's training is the longest day
  assert.equal(check({ type: "maxHours", hours: 4 }, [at("t6", "bas", "fri", "09:00", "09:30")]), true);
  assert.equal(check({ type: "maxHours", hours: 3.5 }, []), false);
  assert.equal(longestStretch([{ start: 0, end: 120 }, { start: 135, end: 255 }], 30), 240); // a 15-minute gap is no break
  assert.equal(longestStretch([{ start: 0, end: 120 }, { start: 150, end: 300 }], 30), 150);
  assert.equal(longestStretch([{ start: 0, end: 120 }, { start: 60, end: 120 }], 30), 120); // overlaps once
});

test("evaluate: points per check", () => {
  const p = { ...ex, checks: [parseCheck({ type: "allPlanned", points: 3 })!, parseCheck({ type: "noOverlap", points: 2 })!] };
  const e = evaluate(p, solution.slice(1));
  assert.deepEqual([e.score, e.maxscore, e.correct], [2, 5, false]);
  assert.equal(evaluate({ ...ex, checks: [] }, solution).correct, false); // no checks: nothing correct
});

test("the response: schedule as JSON, back into placements", () => {
  const json = scheduleJSON(solution);
  assert.deepEqual(JSON.parse(json)[0], { task: "t1", day: "mon", start: "09:00", end: "10:30", resource: "anna" });
  assert.deepEqual(ownPlacements(ex, parseSchedule(json)!), solution);
  assert.equal(parseSchedule("nope"), null);
  // unknown tasks, a task twice, a wrong resource and days outside the agenda are left out
  const raw = [{ task: "t1", day: "mon", start: "9:00", end: "10:30", resource: "bas" }, { task: "t6", day: "Tuesday", start: "13:00" },
    { task: "t6", day: "wed", start: "13:00" }, { task: "zz", day: "mon", start: "9:00" }, { task: "t2", day: "sun", start: "9:00" }];
  assert.deepEqual(ownPlacements(ex, raw), [at("t6", "anna", "tue", "13:00", "13:30")]);
});
