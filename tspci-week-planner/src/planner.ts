// The week planner without a user interface: the agenda (days × time slots × resources), the fixed blocks, the tasks,
// placing, moving and resizing, conflicts, the author's checks and the response. No imports: tested in node (npm test).

export const DAY_CODES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAY_CODES)[number];

/** A person, room or vehicle: a column of every day. */
export type Resource = { id: string; name: string };
/** Busy time the author gives (a meeting, a day off); `resource` "" is everyone. `work` counts towards hours and breaks. */
export type Fixed = { id: string; label: string; resource: string; day: Day; start: number; end: number; work: boolean };
/**
 * A task card. Times are minutes since midnight. `duration` is the length it starts with; between `min` and `max` the
 * candidate can resize it (min = max: a fixed length). `resource` "" is anyone, else only that resource can do it.
 */
export type Task = { id: string; label: string; duration: number; min: number; max: number; resource: string; notes: string };
/** A task in the agenda. */
export type Placement = { task: string; resource: string; day: Day; start: number; end: number };

export const CHECK_TYPES = ["allPlanned", "noOverlap", "openingHours", "before", "notOnDay", "sameDay", "gap", "maxHours", "break"] as const;
export type CheckType = (typeof CHECK_TYPES)[number];
export type Check =
  | { type: "allPlanned"; points: number }
  | { type: "noOverlap"; points: number }
  | { type: "openingHours"; points: number }
  /** a ends before b starts */
  | { type: "before"; a: string; b: string; points: number }
  /** the task (or, with task "", every task) not on that day */
  | { type: "notOnDay"; task: string; day: Day; points: number }
  | { type: "sameDay"; a: string; b: string; points: number }
  /** at least `hours` between the end of the one and the start of the other */
  | { type: "gap"; a: string; b: string; hours: number; points: number }
  /** at most `hours` of work per resource per day (tasks and fixed work) */
  | { type: "maxHours"; hours: number; points: number }
  /** never more than `hours` of work without a break of at least `minutes` */
  | { type: "break"; hours: number; minutes: number; points: number };

export type Planner = {
  days: Day[];
  /** the agenda's first and last time, minutes since midnight */
  start: number;
  end: number;
  /** minutes per row */
  slot: number;
  /** opening hours, within start and end */
  open: { start: number; end: number };
  resources: Resource[];
  fixed: Fixed[];
  tasks: Task[];
  /** the author's example solution: the preview of the checks, and the solution status */
  solution: Placement[] | null;
  checks: Check[];
};

export const MAX_CHECKS = 12;
export const MAX_TASKS = 24;
export const MAX_RESOURCES = 6;
export const SLOTS = [5, 10, 15, 20, 30, 60];

// --- time

/** "9:30", "09:30" or a number of minutes → minutes since midnight; null when it is neither. */
export const toMinutes = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (m) {
    const h = Number(m[1]), min = Number(m[2]);
    return h <= 24 && min < 60 ? h * 60 + min : null;
  }
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
};
/** minutes → "09:30" */
export const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
/** A number in the candidate's language: 1.5 or 1,5 */
export const formatNumber = (n: number, language: string) => {
  const text = String(Math.round(n * 100) / 100);
  return language === "nl" ? text.replace(".", ",") : text;
};
/** 1,5 or 1.5 → 1.5; null when it is no number */
export const parseNumber = (text: string): number | null => {
  const t = String(text).trim().replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};

const dayCode = (value: unknown): Day | null => {
  const v = String(value ?? "").trim().toLowerCase().slice(0, 3);
  return (DAY_CODES as readonly string[]).includes(v) ? (v as Day) : null;
};
/** Minutes since Monday 00:00: the order of the week. */
export const weekMinute = (day: Day, minutes: number) => DAY_CODES.indexOf(day) * 1440 + minutes;

/** The start of every row. */
export const slotStarts = (p: Planner) => {
  const out: number[] = [];
  for (let m = p.start; m < p.end; m += p.slot) out.push(m);
  return out;
};
const snap = (p: Planner, minutes: number) => p.start + Math.round((minutes - p.start) / p.slot) * p.slot;

// --- the example

type Lang = "en" | "nl";
const exampleTexts = {
  en: {
    anna: "Anna", bas: "Bas", meeting: "Team meeting", dayOff: "Day off", training: "Training",
    t1: ["Intake Mrs. de Vries", "First visit: get to know the client and her wishes."],
    t2: ["Care plan Mrs. de Vries", "Write it after the intake."],
    t3: ["Wound care Mr. Bakker", "Only Bas has been trained for this wound."],
    t4: ["Wound check Mr. Bakker", "At least 48 hours after the wound care."],
    t5: ["Shopping with Mrs. Smit", "Mrs. Smit goes to day care on Wednesdays."],
    t6: ["Collect medicine at the pharmacy", "On the same day as the shopping with Mrs. Smit."],
    t7: ["Write reports", "1 to 2 hours; Anna writes them."],
  },
  nl: {
    anna: "Anna", bas: "Bas", meeting: "Teamoverleg", dayOff: "Vrije dag", training: "Cursus",
    t1: ["Intake mevrouw De Vries", "Eerste bezoek: kennismaken met de cliënt en haar wensen."],
    t2: ["Zorgplan mevrouw De Vries", "Schrijven na de intake."],
    t3: ["Wondverzorging meneer Bakker", "Alleen Bas is opgeleid voor deze wond."],
    t4: ["Wondcontrole meneer Bakker", "Minstens 48 uur na de wondverzorging."],
    t5: ["Boodschappen met mevrouw Smit", "Mevrouw Smit gaat op woensdag naar de dagbesteding."],
    t6: ["Medicijnen halen bij de apotheek", "Op dezelfde dag als de boodschappen met mevrouw Smit."],
    t7: ["Rapportages schrijven", "1 tot 2 uur; Anna schrijft ze."],
  },
};

/** Home care for vocational students: two carers, a week, seven tasks and nine rules. */
export const examplePlanner = (language: string = "en"): Planner => {
  const x = exampleTexts[(language === "nl" ? "nl" : "en") as Lang];
  const task = (id: "t1" | "t2" | "t3" | "t4" | "t5" | "t6" | "t7", duration: number, resource = "", max = duration): Task =>
    ({ id, label: x[id][0], notes: x[id][1], duration, min: duration, max, resource });
  return {
    days: ["mon", "tue", "wed", "thu", "fri"],
    start: 8 * 60, end: 18 * 60, slot: 30,
    open: { start: 8 * 60 + 30, end: 17 * 60 },
    resources: [{ id: "anna", name: x.anna }, { id: "bas", name: x.bas }],
    fixed: [
      { id: "f1", label: x.meeting, resource: "", day: "wed", start: 9 * 60, end: 10 * 60, work: true },
      { id: "f2", label: x.training, resource: "anna", day: "tue", start: 13 * 60, end: 17 * 60, work: true },
      { id: "f3", label: x.dayOff, resource: "bas", day: "fri", start: 8 * 60, end: 18 * 60, work: false },
    ],
    tasks: [task("t1", 90, "anna"), task("t2", 60), task("t3", 30, "bas"), task("t4", 30), task("t5", 120), task("t6", 30), task("t7", 60, "anna", 120)],
    solution: [
      { task: "t1", resource: "anna", day: "mon", start: 9 * 60, end: 10 * 60 + 30 },
      { task: "t2", resource: "anna", day: "mon", start: 11 * 60, end: 12 * 60 },
      { task: "t3", resource: "bas", day: "mon", start: 9 * 60, end: 9 * 60 + 30 },
      { task: "t4", resource: "bas", day: "wed", start: 10 * 60 + 30, end: 11 * 60 },
      { task: "t5", resource: "bas", day: "tue", start: 10 * 60, end: 12 * 60 },
      { task: "t6", resource: "bas", day: "tue", start: 13 * 60, end: 13 * 60 + 30 },
      { task: "t7", resource: "anna", day: "thu", start: 14 * 60, end: 15 * 60 },
    ],
    checks: [
      { type: "allPlanned", points: 1 },
      { type: "noOverlap", points: 1 },
      { type: "openingHours", points: 1 },
      { type: "before", a: "t1", b: "t2", points: 1 },
      { type: "notOnDay", task: "t5", day: "wed", points: 1 },
      { type: "sameDay", a: "t5", b: "t6", points: 1 },
      { type: "gap", a: "t3", b: "t4", hours: 48, points: 1 },
      { type: "maxHours", hours: 8, points: 1 },
      { type: "break", hours: 4, minutes: 30, points: 1 },
    ],
  };
};

// --- reading the author's JSON (data-planner)

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" ? String(v) : "");
const num = (v: unknown, fallback: number) => {
  const n = typeof v === "string" ? parseNumber(v) : typeof v === "number" ? v : null;
  return n === null || !Number.isFinite(n) ? fallback : n;
};
const points = (v: unknown) => Math.max(0, Math.min(100, Math.round(num(v, 1))));
const idOf = (v: unknown, fallback: string) => str(v, 40).trim().replace(/\s+/g, "-") || fallback;

export const parseCheck = (raw: any): Check | null => {
  if (!raw || typeof raw !== "object") return null;
  const type = CHECK_TYPES.find((t) => t.toLowerCase() === String(raw.type ?? "").toLowerCase());
  const p = points(raw.points);
  switch (type) {
    case "allPlanned": case "noOverlap": case "openingHours": return { type, points: p };
    case "before": case "sameDay": return { type, a: str(raw.a, 40), b: str(raw.b, 40), points: p };
    case "notOnDay": return { type, task: str(raw.task, 40), day: dayCode(raw.day) ?? "wed", points: p };
    case "gap": return { type, a: str(raw.a, 40), b: str(raw.b, 40), hours: Math.max(0, num(raw.hours, 24)), points: p };
    case "maxHours": return { type, hours: Math.max(0, num(raw.hours, 8)), points: p };
    case "break": return { type, hours: Math.max(0, num(raw.hours, 4)), minutes: Math.max(0, Math.round(num(raw.minutes, 30))), points: p };
    default: return null;
  }
};

/** The planner from data-planner (JSON, or an object); empty or broken: the example in that language. */
export const parsePlanner = (input: unknown, language = "en"): Planner => {
  let raw: any = input;
  if (typeof input === "string") {
    if (!input.trim()) return examplePlanner(language);
    try {
      raw = JSON.parse(input);
    } catch {
      return examplePlanner(language);
    }
  }
  if (!raw || typeof raw !== "object") return examplePlanner(language);

  const days = (Array.isArray(raw.days) ? raw.days.map(dayCode).filter(Boolean) : []) as Day[];
  const uniqueDays = DAY_CODES.filter((d) => days.includes(d));
  const slot = SLOTS.includes(num(raw.slot, 30)) ? num(raw.slot, 30) : 30;
  let start = toMinutes(raw.start) ?? 8 * 60;
  let end = toMinutes(raw.end) ?? 18 * 60;
  start = Math.max(0, Math.min(23 * 60, start));
  end = Math.max(start + slot, Math.min(24 * 60, end));
  end = start + Math.ceil((end - start) / slot) * slot; // whole rows
  if (end > 24 * 60) end -= slot;
  const openStart = Math.max(start, Math.min(end, toMinutes(raw.open?.start) ?? start));
  const openEnd = Math.max(openStart, Math.min(end, toMinutes(raw.open?.end) ?? end));
  const frame = { start, end, slot };
  const inFrame = (m: number) => Math.max(start, Math.min(end, frame.start + Math.round((m - start) / slot) * slot));

  const resources: Resource[] = [];
  for (const r of Array.isArray(raw.resources) ? raw.resources : []) {
    const id = idOf(r?.id, `r${resources.length + 1}`);
    if (!resources.some((x) => x.id === id) && resources.length < MAX_RESOURCES) resources.push({ id, name: str(r?.name, 80) || id });
  }
  if (!resources.length) resources.push({ id: "r1", name: "1" });
  const resourceIds = resources.map((r) => r.id);
  const resourceOrAll = (v: unknown) => (resourceIds.includes(str(v, 40)) ? str(v, 40) : "");

  const fixed: Fixed[] = [];
  for (const f of Array.isArray(raw.fixed) ? raw.fixed : []) {
    const day = dayCode(f?.day);
    const s = toMinutes(f?.start), e = toMinutes(f?.end);
    if (!day || s === null || e === null) continue;
    const fs = inFrame(s), fe = inFrame(e);
    if (fe <= fs) continue;
    fixed.push({ id: idOf(f?.id, `f${fixed.length + 1}`), label: str(f?.label, 80), resource: resourceOrAll(f?.resource), day, start: fs, end: fe, work: f?.work !== false });
  }

  const tasks: Task[] = [];
  for (const t of Array.isArray(raw.tasks) ? raw.tasks : []) {
    if (tasks.length >= MAX_TASKS) break;
    const id = idOf(t?.id, `t${tasks.length + 1}`);
    if (tasks.some((x) => x.id === id)) continue;
    const length = (v: unknown, fallback: number) => Math.max(slot, Math.min(end - start, Math.round(num(v, fallback) / slot) * slot));
    const duration = length(t?.duration, 60);
    const min = Math.min(duration, length(t?.min, duration));
    const max = Math.max(duration, length(t?.max, duration));
    tasks.push({ id, label: str(t?.label, 120) || id, duration, min, max, resource: resourceOrAll(t?.resource), notes: str(t?.notes, 300) });
  }

  const checks = (Array.isArray(raw.checks) ? raw.checks : []).map(parseCheck).filter(Boolean).slice(0, MAX_CHECKS) as Check[];
  const planner: Planner = {
    days: uniqueDays.length ? uniqueDays : ["mon", "tue", "wed", "thu", "fri"],
    start, end, slot, open: { start: openStart, end: openEnd },
    resources, fixed, tasks, solution: null, checks,
  };
  planner.solution = Array.isArray(raw.solution) ? ownPlacements(planner, raw.solution) : null;
  return planner;
};

/** data-planner as the authoring mode writes it: times as "09:30". */
export const serializePlanner = (p: Planner) =>
  JSON.stringify({
    days: p.days, start: clock(p.start), end: clock(p.end), slot: p.slot, open: { start: clock(p.open.start), end: clock(p.open.end) },
    resources: p.resources,
    fixed: p.fixed.map((f) => ({ ...f, start: clock(f.start), end: clock(f.end) })),
    tasks: p.tasks,
    solution: p.solution ? p.solution.map(toScheduleItem) : null,
    checks: p.checks,
  });

// --- placements

export const taskOf = (p: Planner, id: string) => p.tasks.find((t) => t.id === id);
export const placementOf = (placements: Placement[], task: string) => placements.find((x) => x.task === task);
/** The fixed blocks in a resource's column on a day. */
export const fixedIn = (p: Planner, resource: string, day: Day) => p.fixed.filter((f) => f.day === day && (f.resource === "" || f.resource === resource));
/** Why a task cannot go there: "resource" (someone else must do it), "day" (not in the agenda); null when it can. */
export const cannotPlace = (p: Planner, task: Task, resource: string, day: Day): "resource" | "day" | null => {
  if (!p.days.includes(day) || !p.resources.some((r) => r.id === resource)) return "day";
  if (task.resource && task.resource !== resource) return "resource";
  return null;
};

/** A placement that fits the agenda: snapped to the rows, within the day, with a length the task allows. */
const fit = (p: Planner, task: Task, resource: string, day: Day, start: number, length: number): Placement => {
  const len = Math.max(task.min, Math.min(task.max, Math.round(length / p.slot) * p.slot, p.end - p.start));
  let s = snap(p, start);
  s = Math.max(p.start, Math.min(p.end - len, s));
  return { task: task.id, resource, day, start: s, end: s + len };
};

/**
 * The task (new, or moved) at that day, resource and start; it keeps its length. null when it cannot go there
 * (cannotPlace). The order of the placements follows the tasks.
 */
export const place = (p: Planner, placements: Placement[], taskId: string, resource: string, day: Day, start: number): Placement[] | null => {
  const task = taskOf(p, taskId);
  if (!task || cannotPlace(p, task, resource, day)) return null;
  const before = placementOf(placements, taskId);
  const placed = fit(p, task, resource, day, start, before ? before.end - before.start : task.duration);
  return order(p, [...placements.filter((x) => x.task !== taskId), placed]);
};

/** A new end for a placed task, within the lengths the task allows; null when it does not change. */
export const resize = (p: Planner, placements: Placement[], taskId: string, end: number): Placement[] | null => {
  const task = taskOf(p, taskId);
  const before = placementOf(placements, taskId);
  if (!task || !before) return null;
  let e = snap(p, end);
  e = Math.max(before.start + task.min, Math.min(before.start + task.max, p.end, e));
  if (e === before.end) return null;
  return placements.map((x) => (x.task === taskId ? { ...x, end: e } : x));
};

export const remove = (placements: Placement[], taskId: string) => placements.filter((x) => x.task !== taskId);

const order = (p: Planner, placements: Placement[]) => {
  const index = (id: string) => p.tasks.findIndex((t) => t.id === id);
  return [...placements].sort((a, b) => index(a.task) - index(b.task));
};

/** Placements from a state, a response or the author: only known tasks, once each, where they are allowed. */
export const ownPlacements = (p: Planner, raw: unknown[]): Placement[] => {
  const out: Placement[] = [];
  for (const r of Array.isArray(raw) ? (raw as any[]) : []) {
    const task = taskOf(p, str(r?.task, 40));
    const day = dayCode(r?.day);
    const s = toMinutes(r?.start), e = toMinutes(r?.end);
    if (!task || !day || s === null || out.some((x) => x.task === task.id)) continue;
    const resource = str(r?.resource, 40) || task.resource || p.resources[0].id;
    if (cannotPlace(p, task, resource, day)) continue;
    out.push(fit(p, task, resource, day, s, e === null ? task.duration : e - s));
  }
  return order(p, out);
};

export const samePlacements = (a: Placement[], b: Placement[]) => JSON.stringify(a) === JSON.stringify(b);

// --- conflicts (live feedback)

export type Conflict = { overlaps: string[]; outside: boolean };
const overlap = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;

/** Per placed task: the tasks and fixed blocks it overlaps (in its column), and whether it is outside opening hours. */
export const conflicts = (p: Planner, placements: Placement[]): Record<string, Conflict> => {
  const out: Record<string, Conflict> = {};
  for (const x of placements) {
    const overlaps = [
      ...placements.filter((y) => y !== x && y.resource === x.resource && y.day === x.day && overlap(x, y)).map((y) => y.task),
      ...fixedIn(p, x.resource, x.day).filter((f) => overlap(x, f)).map((f) => f.id),
    ];
    out[x.task] = { overlaps, outside: x.start < p.open.start || x.end > p.open.end };
  }
  return out;
};

// --- the checks

/** The work of a resource on a day: tasks and fixed work, sorted. */
const workOf = (p: Planner, placements: Placement[], resource: string, day: Day) =>
  [
    ...placements.filter((x) => x.resource === resource && x.day === day),
    ...fixedIn(p, resource, day).filter((f) => f.work),
  ].map((x) => ({ start: x.start, end: x.end })).sort((a, b) => a.start - b.start);

/** Minutes worked, with overlapping time counted once. */
const workedMinutes = (intervals: { start: number; end: number }[]) => {
  let total = 0, until = -1;
  for (const i of intervals) {
    const s = Math.max(i.start, until);
    if (i.end > s) total += i.end - s;
    until = Math.max(until, i.end);
  }
  return total;
};

/** The longest work without a break of at least `breakMinutes` (shorter gaps are no break, but no work either). */
export const longestStretch = (intervals: { start: number; end: number }[], breakMinutes: number) => {
  let longest = 0, stretch: { start: number; end: number }[] = [], until = -Infinity;
  for (const i of intervals) {
    if (stretch.length && i.start - until >= breakMinutes) stretch = [];
    stretch.push(i);
    until = Math.max(until, i.end);
    longest = Math.max(longest, workedMinutes(stretch));
  }
  return longest;
};

export const passes = (p: Planner, check: Check, placements: Placement[]): boolean => {
  const at = (id: string) => placementOf(placements, id);
  const columns = () => p.resources.flatMap((r) => p.days.map((d) => [r.id, d] as const));
  switch (check.type) {
    case "allPlanned":
      return p.tasks.length > 0 && p.tasks.every((t) => at(t.id));
    case "noOverlap":
      return Object.values(conflicts(p, placements)).every((c) => c.overlaps.length === 0);
    case "openingHours":
      return placements.every((x) => x.start >= p.open.start && x.end <= p.open.end);
    case "before": {
      const a = at(check.a), b = at(check.b);
      return !!a && !!b && weekMinute(a.day, a.end) <= weekMinute(b.day, b.start);
    }
    case "notOnDay":
      if (!check.task) return placements.every((x) => x.day !== check.day);
      return !!at(check.task) && at(check.task).day !== check.day;
    case "sameDay": {
      const a = at(check.a), b = at(check.b);
      return !!a && !!b && a.day === b.day;
    }
    case "gap": {
      const a = at(check.a), b = at(check.b);
      if (!a || !b) return false;
      const [first, second] = weekMinute(a.day, a.start) <= weekMinute(b.day, b.start) ? [a, b] : [b, a];
      return weekMinute(second.day, second.start) - weekMinute(first.day, first.end) >= Math.round(check.hours * 60);
    }
    case "maxHours":
      return columns().every(([r, d]) => workedMinutes(workOf(p, placements, r, d)) <= Math.round(check.hours * 60));
    case "break":
      return columns().every(([r, d]) => longestStretch(workOf(p, placements, r, d), check.minutes) <= Math.round(check.hours * 60));
  }
};

export type Evaluation = { results: { check: Check; passed: boolean }[]; score: number; maxscore: number; correct: boolean };

export const evaluate = (p: Planner, placements: Placement[]): Evaluation => {
  const results = p.checks.map((check) => ({ check, passed: passes(p, check, placements) }));
  const score = results.reduce((s, r) => s + (r.passed ? r.check.points : 0), 0);
  const maxscore = results.reduce((s, r) => s + r.check.points, 0);
  return { results, score, maxscore, correct: results.length > 0 && results.every((r) => r.passed) };
};

/** The task ids a check is about (for the authoring mode's validation). */
export const checkTasks = (c: Check): string[] =>
  c.type === "before" || c.type === "sameDay" || c.type === "gap" ? [c.a, c.b] : c.type === "notOnDay" && c.task ? [c.task] : [];

// --- the response

export type ScheduleItem = { task: string; day: Day; start: string; end: string; resource: string };
const toScheduleItem = (x: Placement): ScheduleItem => ({ task: x.task, day: x.day, start: clock(x.start), end: clock(x.end), resource: x.resource });

/** The schedule field: every planned task, in the order of the tasks, language independent. */
export const scheduleJSON = (placements: Placement[]) => JSON.stringify(placements.map(toScheduleItem));

/** A schedule (JSON array, or an object with `schedule`) → raw placements for ownPlacements; null when it is none. */
export const parseSchedule = (text: string): unknown[] | null => {
  try {
    const v = JSON.parse(text);
    if (Array.isArray(v)) return v;
    if (Array.isArray(v?.schedule)) return v.schedule;
    return null;
  } catch {
    return null;
  }
};
