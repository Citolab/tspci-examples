// The staff rota (dienstrooster) without a user interface: the shop's days and opening hours, the employees (contract
// hours, hourly wage, days they cannot work), shift cards, the rota itself (one shift per employee per day), the
// author's rules, the reading questions, hours and pay, and the response of the three rota modes (readRota, makeRota,
// hoursAndPay). No imports: tested in node (npm test). The week planner's own logic is in planner.ts.

export const DAY_CODES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAY_CODES)[number];
export const ROTA_MODES = ["readRota", "makeRota", "hoursAndPay"] as const;
export type RotaMode = (typeof ROTA_MODES)[number];

/** A day the shop is open, with its opening hours (minutes since midnight). */
export type RotaDay = { day: Day; open: number; close: number };
/** Contract hours per week (min to max), the hourly wage, and the days the employee cannot work. */
export type Employee = { id: string; name: string; min: number; max: number; wage: number; unavailable: Day[] };
/** A shift card: a starting point for a shift, with its break in minutes. */
export type Template = { id: string; label: string; start: number; end: number; break: number };
/** A shift in the rota: at most one per employee per day. Times in minutes since midnight; `break` in minutes. */
export type Shift = { employee: string; day: Day; start: number; end: number; break: number };

export const RULE_TYPES = ["coverage", "contractHours", "available", "maxShift", "break", "rest", "weekend"] as const;
export type RuleType = (typeof RULE_TYPES)[number];
export type Rule =
  /** at every moment of the opening hours at least `staff` people work */
  | { type: "coverage"; staff: number; points: number }
  /** every employee works (without breaks) between their contract's min and max hours */
  | { type: "contractHours"; points: number }
  /** nobody works on a day they cannot */
  | { type: "available"; points: number }
  /** no shift lasts longer than `hours`, from start to end */
  | { type: "maxShift"; hours: number; points: number }
  /** a shift longer than `hours` has a break of at least `minutes` */
  | { type: "break"; hours: number; minutes: number; points: number }
  /** at least `hours` between the end of a shift and the start of the same employee's next one */
  | { type: "rest"; hours: number; points: number }
  /** nobody works more than `days` of Saturday and Sunday */
  | { type: "weekend"; days: number; points: number };

export const QUESTION_KINDS = ["shift", "hours", "opens", "closes", "whoAt", "staffAt", "number"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];
/**
 * A question about the rota. Its answer follows from the rota (`number` excepted: the author gives it). `text` "" is
 * the question the PCI makes of it ("When does Sam work on Friday?").
 *   shift: when does `employee` work on `day` (a start and an end, or free)
 *   hours: how many hours does `employee` work this week, without breaks
 *   opens / closes: who starts first / finishes last on `day` (taps)
 *   whoAt: who works on `day` at `time` (taps); staffAt: how many people
 *   number: the author's own question with the number `answer`
 */
export type Question = { kind: QuestionKind; text: string; employee: string; day: Day; time: number; answer: number; points: number };

/** Surcharges in percent: on Sunday (all hours), and in the evening from `eveningFrom` (not on Sunday). */
export type Pay = { sunday: number; evening: number; eveningFrom: number; askPay: boolean };

export type Rota = {
  days: RotaDay[];
  /** the editor's time axis, minutes since midnight */
  start: number;
  end: number;
  /** minutes per column */
  slot: number;
  employees: Employee[];
  templates: Template[];
  /** the rota: given (readRota, hoursAndPay) or the example solution (makeRota, hoursAndPay with `own`) */
  shifts: Shift[] | null;
  /** hoursAndPay: the candidate makes the rota and computes its hours and pay */
  own: boolean;
  rules: Rule[];
  questions: Question[];
  pay: Pay;
};

export const MAX_EMPLOYEES = 8;
export const MAX_RULES = 12;
export const MAX_QUESTIONS = 10;
export const MAX_TEMPLATES = 8;
export const ROTA_SLOTS = [15, 30, 60];
export const BREAK_STEP = 15;
export const MAX_BREAK = 120;

// --- time and numbers

/** "9:30", "09.30", "0930", "9", "9 uur" or a number of minutes → minutes since midnight; null when it is none. */
export const toMinutes = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
  if (typeof value !== "string") return null;
  const m = value.trim().toLowerCase().match(/^(\d{1,2})(?:[:.h]?(\d{2}))?\s*(?:u|uur|h|o'clock)?$/);
  if (!m) return null;
  const h = Number(m[1]), min = m[2] === undefined ? 0 : Number(m[2]);
  return h <= 24 && min < 60 && h * 60 + min <= 24 * 60 ? h * 60 + min : null;
};
/** minutes → "09:30" */
export const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
/** A number in the candidate's language: 16.5 or 16,5; `decimals` fixes them (money). */
export const formatNumber = (n: number, language: string, decimals?: number) => {
  const text = decimals === undefined ? String(Math.round(n * 100) / 100) : n.toFixed(decimals);
  return language === "nl" ? text.replace(".", ",") : text;
};
/**
 * What a candidate types as a number or an amount → the number; null when it is none. A comma or a point is the
 * decimal sign; with both, the last one is ("1.234,50", "1,234.50"). A € sign and a unit (uur, hours, h, euro) may
 * be around it.
 */
export const parseAmount = (text: unknown): number | null => {
  let t = String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  t = t.replace(/^€\s*/, "").replace(/\s*(€|euro|eur|uur|u|hours?|h|people|persons?|mensen|personen)$/, "").replace(/^€\s*/, "").trim();
  t = t.replace(/,-$/, "").replace(/\.-$/, "");
  if (!t) return null;
  const lastComma = t.lastIndexOf(","), lastPoint = t.lastIndexOf(".");
  if (lastComma >= 0 && lastPoint >= 0) {
    const decimal = lastComma > lastPoint ? "," : ".";
    t = t.split(decimal === "," ? "." : ",").join("").replace(decimal, ".");
  } else t = t.replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};

const dayCode = (value: unknown): Day | null => {
  const v = String(value ?? "").trim().toLowerCase().slice(0, 3);
  return (DAY_CODES as readonly string[]).includes(v) ? (v as Day) : null;
};
/** Minutes since Monday 00:00: the order of the week. */
export const weekMinute = (day: Day, minutes: number) => DAY_CODES.indexOf(day) * 1440 + minutes;
const isWeekend = (day: Day) => day === "sat" || day === "sun";

// --- the example

type Lang = "en" | "nl";
const exampleTexts = {
  en: { opening: "Opening", closing: "Closing", evening: "Late evening", day: "Whole day" },
  nl: { opening: "Openen", closing: "Sluiten", evening: "Koopavond", day: "Hele dag" },
};
const m = (text: string) => toMinutes(text)!;
const shift = (employee: string, day: Day, start: string, end: string, brk = 0): Shift => ({ employee, day, start: m(start), end: m(end), break: brk });

/**
 * A corner shop, Thursday (late-night shopping) to Sunday, five employees. Its rota is the example's given rota and
 * example solution: it passes every rule (at least 2 people during opening hours, contract hours, days off, at most
 * 9 hours a shift, a break after 5.5 hours, 11 hours of rest, at most one weekend day).
 */
export const exampleRota = (language: string = "en"): Rota => {
  const x = exampleTexts[(language === "nl" ? "nl" : "en") as Lang];
  return {
    days: [
      { day: "thu", open: m("09:00"), close: m("21:00") },
      { day: "fri", open: m("08:30"), close: m("18:00") },
      { day: "sat", open: m("09:00"), close: m("17:00") },
      { day: "sun", open: m("12:00"), close: m("17:00") },
    ],
    start: m("08:00"), end: m("22:00"), slot: 30,
    employees: [
      { id: "sam", name: "Sam", min: 20, max: 24, wage: 14.4, unavailable: [] },
      { id: "noor", name: "Noor", min: 12, max: 18, wage: 11.2, unavailable: [] },
      { id: "daan", name: "Daan", min: 12, max: 16, wage: 9.6, unavailable: ["sun"] },
      { id: "lisa", name: "Lisa", min: 12, max: 16, wage: 12, unavailable: ["thu"] },
      { id: "ayoub", name: "Ayoub", min: 8, max: 12, wage: 8, unavailable: ["fri"] },
    ],
    templates: [
      { id: "s1", label: x.opening, start: m("08:00"), end: m("13:30"), break: 0 },
      { id: "s2", label: x.closing, start: m("13:00"), end: m("18:30"), break: 0 },
      { id: "s3", label: x.evening, start: m("13:00"), end: m("21:30"), break: 30 },
      { id: "s4", label: x.day, start: m("08:30"), end: m("17:30"), break: 30 },
    ],
    shifts: [
      shift("sam", "thu", "13:00", "21:30", 30), shift("noor", "thu", "08:00", "13:30"),
      shift("daan", "thu", "13:00", "21:30", 30), shift("ayoub", "thu", "08:00", "13:30"),
      shift("sam", "fri", "13:00", "18:30"), shift("noor", "fri", "08:00", "13:30"),
      shift("daan", "fri", "13:00", "18:30"), shift("lisa", "fri", "08:00", "13:30"),
      shift("sam", "sat", "08:30", "17:30", 30), shift("lisa", "sat", "08:30", "17:30", 30),
      shift("noor", "sun", "11:30", "17:30", 30), shift("ayoub", "sun", "11:30", "17:30", 30),
    ],
    own: false,
    rules: [
      { type: "coverage", staff: 2, points: 1 },
      { type: "contractHours", points: 1 },
      { type: "available", points: 1 },
      { type: "maxShift", hours: 9, points: 1 },
      { type: "break", hours: 5.5, minutes: 30, points: 1 },
      { type: "rest", hours: 11, points: 1 },
      { type: "weekend", days: 1, points: 1 },
    ],
    questions: [
      { kind: "shift", text: "", employee: "sam", day: "fri", time: m("12:00"), answer: 0, points: 1 },
      { kind: "hours", text: "", employee: "noor", day: "thu", time: m("12:00"), answer: 0, points: 1 },
      { kind: "closes", text: "", employee: "sam", day: "sat", time: m("12:00"), answer: 0, points: 1 },
      { kind: "shift", text: "", employee: "daan", day: "sun", time: m("12:00"), answer: 0, points: 1 },
      { kind: "staffAt", text: "", employee: "sam", day: "thu", time: m("13:00"), answer: 0, points: 1 },
      { kind: "opens", text: "", employee: "sam", day: "thu", time: m("12:00"), answer: 0, points: 1 },
    ],
    pay: { sunday: 50, evening: 0, eveningFrom: m("20:00"), askPay: true },
  };
};

// --- reading the author's JSON (data-rota)

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" ? String(v) : "");
const num = (v: unknown, fallback: number) => {
  const n = typeof v === "string" ? parseAmount(v) : typeof v === "number" ? v : null;
  return n === null || !Number.isFinite(n) ? fallback : n;
};
const points = (v: unknown) => Math.max(0, Math.min(100, Math.round(num(v, 1))));
const idOf = (v: unknown, fallback: string) => str(v, 40).trim().replace(/\s+/g, "-") || fallback;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const breakOf = (v: unknown) => clamp(Math.round(num(v, 0) / BREAK_STEP) * BREAK_STEP, 0, MAX_BREAK);

export const parseRule = (raw: any): Rule | null => {
  if (!raw || typeof raw !== "object") return null;
  const type = RULE_TYPES.find((t) => t.toLowerCase() === String(raw.type ?? "").toLowerCase());
  const p = points(raw.points);
  switch (type) {
    case "coverage": return { type, staff: clamp(Math.round(num(raw.staff, 2)), 1, MAX_EMPLOYEES), points: p };
    case "contractHours": case "available": return { type, points: p };
    case "maxShift": return { type, hours: clamp(num(raw.hours, 9), 0, 24), points: p };
    case "break": return { type, hours: clamp(num(raw.hours, 5.5), 0, 24), minutes: clamp(Math.round(num(raw.minutes, 30)), 0, MAX_BREAK), points: p };
    case "rest": return { type, hours: clamp(num(raw.hours, 11), 0, 48), points: p };
    case "weekend": return { type, days: clamp(Math.round(num(raw.days, 1)), 0, 2), points: p };
    default: return null;
  }
};

const parseQuestion = (raw: any, r: { employees: Employee[]; days: RotaDay[] }): Question | null => {
  if (!raw || typeof raw !== "object") return null;
  const kind = QUESTION_KINDS.find((k) => k.toLowerCase() === String(raw.kind ?? "").toLowerCase());
  if (!kind) return null;
  const ids = r.employees.map((e) => e.id);
  const employee = ids.includes(str(raw.employee, 40)) ? str(raw.employee, 40) : ids[0];
  const days = r.days.map((d) => d.day);
  const day = days.includes(dayCode(raw.day) as Day) ? (dayCode(raw.day) as Day) : days[0];
  const time = toMinutes(raw.time) ?? 12 * 60;
  return { kind, text: str(raw.text, 300), employee, day, time, answer: num(raw.answer, 0), points: points(raw.points) };
};

/** The rota from data-rota (JSON, or an object); empty or broken: the example in that language. */
export const parseRota = (input: unknown, language = "en"): Rota => {
  let raw: any = input;
  if (typeof input === "string") {
    if (!input.trim()) return exampleRota(language);
    try {
      raw = JSON.parse(input);
    } catch {
      return exampleRota(language);
    }
  }
  if (!raw || typeof raw !== "object") return exampleRota(language);

  const days: RotaDay[] = [];
  for (const d of Array.isArray(raw.days) ? raw.days : []) {
    const day = dayCode(typeof d === "string" ? d : d?.day);
    if (!day || days.some((x) => x.day === day)) continue;
    const open = toMinutes(d?.open) ?? 9 * 60;
    const close = Math.max(open, toMinutes(d?.close) ?? 17 * 60);
    days.push({ day, open, close });
  }
  if (!days.length) days.push({ day: "mon", open: 9 * 60, close: 17 * 60 });
  days.sort((a, b) => DAY_CODES.indexOf(a.day) - DAY_CODES.indexOf(b.day));

  const slot = ROTA_SLOTS.includes(num(raw.slot, 30)) ? num(raw.slot, 30) : 30;
  const earliest = Math.min(...days.map((d) => d.open)), latest = Math.max(...days.map((d) => d.close));
  let start = toMinutes(raw.start) ?? Math.max(0, earliest - 60);
  let end = toMinutes(raw.end) ?? Math.min(24 * 60, latest + 60);
  start = clamp(Math.floor(start / slot) * slot, 0, 24 * 60 - slot);
  end = clamp(Math.ceil(end / slot) * slot, start + slot, 24 * 60);

  const employees: Employee[] = [];
  for (const e of Array.isArray(raw.employees) ? raw.employees : []) {
    const id = idOf(e?.id, `e${employees.length + 1}`);
    if (employees.some((x) => x.id === id) || employees.length >= MAX_EMPLOYEES) continue;
    const min = clamp(num(e?.min, 0), 0, 80);
    const max = clamp(Math.max(min, num(e?.max, 40)), 0, 80);
    const unavailable = DAY_CODES.filter((d) => (Array.isArray(e?.unavailable) ? e.unavailable.map(dayCode) : []).includes(d));
    employees.push({ id, name: str(e?.name, 60) || id, min, max, wage: clamp(Math.round(num(e?.wage, 0) * 100) / 100, 0, 1000), unavailable });
  }
  if (!employees.length) employees.push({ id: "e1", name: "1", min: 0, max: 40, wage: 0, unavailable: [] });

  const rota: Rota = {
    days, start, end, slot, employees, templates: [], shifts: null, own: raw.own === true || raw.own === "true", rules: [], questions: [],
    pay: {
      sunday: clamp(num(raw.pay?.sunday, 0), 0, 200), evening: clamp(num(raw.pay?.evening, 0), 0, 200),
      eveningFrom: toMinutes(raw.pay?.eveningFrom) ?? 20 * 60, askPay: raw.pay?.askPay !== false,
    },
  };
  for (const t of Array.isArray(raw.templates) ? raw.templates : []) {
    if (rota.templates.length >= MAX_TEMPLATES) break;
    const id = idOf(t?.id, `s${rota.templates.length + 1}`);
    const s = toMinutes(t?.start), e = toMinutes(t?.end);
    if (rota.templates.some((x) => x.id === id) || s === null || e === null) continue;
    const fitted = fitShift(rota, { employee: "", day: days[0].day, start: s, end: e, break: breakOf(t?.break) });
    rota.templates.push({ id, label: str(t?.label, 60), start: fitted.start, end: fitted.end, break: fitted.break });
  }
  rota.rules = (Array.isArray(raw.rules) ? raw.rules : []).map(parseRule).filter(Boolean).slice(0, MAX_RULES) as Rule[];
  rota.questions = (Array.isArray(raw.questions) ? raw.questions : []).map((q: unknown) => parseQuestion(q, rota)).filter(Boolean).slice(0, MAX_QUESTIONS) as Question[];
  rota.shifts = Array.isArray(raw.shifts) ? ownShifts(rota, raw.shifts) : null;
  return rota;
};

/** A shift as the response and data-rota have it: times as "08:00". */
export type ShiftItem = { employee: string; day: Day; start: string; end: string; break: number };
const toItem = (s: Shift): ShiftItem => ({ employee: s.employee, day: s.day, start: clock(s.start), end: clock(s.end), break: s.break });

/** data-rota as the authoring mode writes it: times as "09:30". */
export const serializeRota = (r: Rota) =>
  JSON.stringify({
    days: r.days.map((d) => ({ day: d.day, open: clock(d.open), close: clock(d.close) })),
    start: clock(r.start), end: clock(r.end), slot: r.slot,
    employees: r.employees,
    templates: r.templates.map((t) => ({ ...t, start: clock(t.start), end: clock(t.end) })),
    shifts: r.shifts ? r.shifts.map(toItem) : null,
    own: r.own,
    rules: r.rules,
    questions: r.questions.map((q) => ({ ...q, time: clock(q.time) })),
    pay: { ...r.pay, eveningFrom: clock(r.pay.eveningFrom) },
  });

// --- the shifts

export const dayOf = (r: Rota, day: Day) => r.days.find((d) => d.day === day);
export const employeeOf = (r: Rota, id: string) => r.employees.find((e) => e.id === id);
export const shiftOf = (shifts: Shift[], employee: string, day: Day) => shifts.find((s) => s.employee === employee && s.day === day);
const same = (a: { employee: string; day: Day }, b: { employee: string; day: Day }) => a.employee === b.employee && a.day === b.day;
const snap = (r: Rota, minutes: number) => r.start + Math.round((minutes - r.start) / r.slot) * r.slot;

/** A shift that fits the time axis: snapped to the columns, at least one column long, with a break that fits. */
export const fitShift = (r: Rota, s: Shift): Shift => {
  const len = clamp(Math.round((s.end - s.start) / r.slot) * r.slot, r.slot, r.end - r.start);
  const start = clamp(snap(r, s.start), r.start, r.end - len);
  const brk = clamp(Math.round(s.break / BREAK_STEP) * BREAK_STEP, 0, Math.min(MAX_BREAK, Math.floor((len - 1) / BREAK_STEP) * BREAK_STEP));
  return { employee: s.employee, day: s.day, start, end: start + len, break: brk };
};

const orderShifts = (r: Rota, shifts: Shift[]) => {
  const d = (x: Shift) => DAY_CODES.indexOf(x.day), e = (x: Shift) => r.employees.findIndex((y) => y.id === x.employee);
  return [...shifts].sort((a, b) => d(a) - d(b) || e(a) - e(b));
};

/**
 * Puts a shift in the rota (a new one, or `from` moved there). A shift already on that day of that employee is
 * replaced: `replaced`. null when the employee or the day is not in the rota.
 */
export const putShift = (r: Rota, shifts: Shift[], s: Shift, from?: { employee: string; day: Day }): { shifts: Shift[]; replaced: Shift | null } | null => {
  if (!employeeOf(r, s.employee) || !dayOf(r, s.day)) return null;
  const fitted = fitShift(r, s);
  const replaced = shifts.find((x) => same(x, fitted) && !(from && same(x, from))) ?? null;
  const rest = shifts.filter((x) => !same(x, fitted) && !(from && same(x, from)));
  return { shifts: orderShifts(r, [...rest, fitted]), replaced };
};

/** A new end for a shift (at least one column, within the time axis); null when it does not change. */
export const resizeShift = (r: Rota, shifts: Shift[], employee: string, day: Day, end: number): Shift[] | null => {
  const s = shiftOf(shifts, employee, day);
  if (!s) return null;
  const e = clamp(snap(r, end), s.start + r.slot, r.end);
  if (e === s.end) return null;
  const fitted = fitShift(r, { ...s, end: e });
  return shifts.map((x) => (x === s ? fitted : x));
};

/** A new break for a shift, in steps of 15 minutes; null when it does not change. */
export const setBreak = (r: Rota, shifts: Shift[], employee: string, day: Day, minutes: number): Shift[] | null => {
  const s = shiftOf(shifts, employee, day);
  if (!s) return null;
  const fitted = fitShift(r, { ...s, break: Math.max(0, minutes) });
  if (fitted.break === s.break) return null;
  return shifts.map((x) => (x === s ? fitted : x));
};

export const removeShift = (shifts: Shift[], employee: string, day: Day) => shifts.filter((x) => !(x.employee === employee && x.day === day));

/** Shifts from a state, a response or the author: known employees and days, once per employee and day, fitted. */
export const ownShifts = (r: Rota, raw: unknown[]): Shift[] => {
  const out: Shift[] = [];
  for (const x of Array.isArray(raw) ? (raw as any[]) : []) {
    const day = dayCode(x?.day);
    const s = toMinutes(x?.start), e = toMinutes(x?.end);
    const employee = str(x?.employee, 40);
    if (!day || s === null || e === null || e <= s || !employeeOf(r, employee) || !dayOf(r, day) || out.some((y) => y.employee === employee && y.day === day)) continue;
    out.push(fitShift(r, { employee, day, start: s, end: e, break: breakOf(x?.break) }));
  }
  return orderShifts(r, out);
};

/** The rota field: every shift, language independent. */
export const rotaJSON = (shifts: Shift[]) => JSON.stringify(shifts.map(toItem));
/** A rota (JSON array, or an object with `rota` or `shifts`) → raw shifts for ownShifts; null when it is none. */
export const parseRotaShifts = (text: string): unknown[] | null => {
  try {
    const v = JSON.parse(text);
    if (Array.isArray(v)) return v;
    if (Array.isArray(v?.rota)) return v.rota;
    if (Array.isArray(v?.shifts)) return v.shifts;
    return null;
  } catch {
    return null;
  }
};

// --- hours, coverage and the rules

/** Minutes worked in a shift: from start to end, without the break. */
export const worked = (s: Shift) => Math.max(0, s.end - s.start - s.break);
/** Minutes an employee works in the week, without breaks. */
export const weekMinutes = (shifts: Shift[], employee: string) => shifts.filter((s) => s.employee === employee).reduce((n, s) => n + worked(s), 0);
/** How many people work on a day at a minute (a shift covers its start up to its end; breaks are taken in turn). */
export const staffAt = (shifts: Shift[], day: Day, minute: number) => shifts.filter((s) => s.day === day && s.start <= minute && minute < s.end).length;

export type Gap = { day: Day; start: number; end: number; staff: number };
/** The times within opening hours with fewer than `staff` people, per day, with the fewest people in each. */
export const coverageGaps = (r: Rota, shifts: Shift[], staff: number): Gap[] => {
  const gaps: Gap[] = [];
  for (const d of r.days) {
    if (d.close <= d.open) continue;
    const points = [d.open, d.close, ...shifts.filter((s) => s.day === d.day).flatMap((s) => [s.start, s.end])]
      .filter((x) => x >= d.open && x <= d.close);
    const cuts = [...new Set(points)].sort((a, b) => a - b);
    let open: Gap | null = null;
    for (let i = 0; i < cuts.length - 1; i++) {
      const n = staffAt(shifts, d.day, cuts[i]);
      if (n < staff) {
        if (open && open.end === cuts[i]) {
          open.end = cuts[i + 1];
          open.staff = Math.min(open.staff, n);
        } else {
          open = { day: d.day, start: cuts[i], end: cuts[i + 1], staff: n };
          gaps.push(open);
        }
      }
    }
  }
  return gaps;
};

/** Per employee: the shifts after which there was too little rest (the later shift, and the rest in minutes). */
export const restProblems = (shifts: Shift[], hours: number): { shift: Shift; rest: number; after: Day }[] => {
  const out: { shift: Shift; rest: number; after: Day }[] = [];
  const byEmployee = new Map<string, Shift[]>();
  for (const s of shifts) byEmployee.set(s.employee, [...(byEmployee.get(s.employee) ?? []), s]);
  for (const list of byEmployee.values()) {
    const sorted = [...list].sort((a, b) => weekMinute(a.day, a.start) - weekMinute(b.day, b.start));
    for (let i = 1; i < sorted.length; i++) {
      const rest = weekMinute(sorted[i].day, sorted[i].start) - weekMinute(sorted[i - 1].day, sorted[i - 1].end);
      if (rest < Math.round(hours * 60)) out.push({ shift: sorted[i], rest, after: sorted[i - 1].day });
    }
  }
  return out;
};

export const weekendDays = (shifts: Shift[], employee: string) => shifts.filter((s) => s.employee === employee && isWeekend(s.day)).length;
export const outsideContract = (r: Rota, shifts: Shift[], e: Employee) => {
  const h = weekMinutes(shifts, e.id) / 60;
  return h < e.min - 1e-9 || h > e.max + 1e-9;
};

export const passesRule = (r: Rota, rule: Rule, shifts: Shift[]): boolean => {
  switch (rule.type) {
    case "coverage": return coverageGaps(r, shifts, rule.staff).length === 0;
    case "contractHours": return r.employees.every((e) => !outsideContract(r, shifts, e));
    case "available": return shifts.every((s) => !employeeOf(r, s.employee)?.unavailable.includes(s.day));
    case "maxShift": return shifts.every((s) => s.end - s.start <= Math.round(rule.hours * 60));
    case "break": return shifts.every((s) => s.end - s.start <= Math.round(rule.hours * 60) || s.break >= rule.minutes);
    case "rest": return restProblems(shifts, rule.hours).length === 0;
    case "weekend": return r.employees.every((e) => weekendDays(shifts, e.id) <= rule.days);
  }
};

export type RuleEvaluation = { results: { rule: Rule; passed: boolean }[]; score: number; maxscore: number; correct: boolean };
export const evaluateRules = (r: Rota, shifts: Shift[]): RuleEvaluation => {
  const results = r.rules.map((rule) => ({ rule, passed: passesRule(r, rule, shifts) }));
  const score = results.reduce((s, x) => s + (x.passed ? x.rule.points : 0), 0);
  const maxscore = results.reduce((s, x) => s + x.rule.points, 0);
  return { results, score, maxscore, correct: results.length > 0 && results.every((x) => x.passed) };
};

/** What is wrong with a shift, for the live feedback: only for the rules the author set. */
export type ShiftIssue =
  | { kind: "unavailable" }
  | { kind: "tooLong"; hours: number }
  | { kind: "noBreak"; hours: number; minutes: number }
  | { kind: "rest"; rest: number; after: Day; hours: number }
  | { kind: "weekend"; days: number };
export const shiftIssues = (r: Rota, shifts: Shift[]): Map<Shift, ShiftIssue[]> => {
  const out = new Map<Shift, ShiftIssue[]>(shifts.map((s) => [s, []]));
  for (const rule of r.rules) {
    if (rule.type === "available") {
      for (const s of shifts) if (employeeOf(r, s.employee)?.unavailable.includes(s.day)) out.get(s)!.push({ kind: "unavailable" });
    } else if (rule.type === "maxShift") {
      for (const s of shifts) if (s.end - s.start > Math.round(rule.hours * 60)) out.get(s)!.push({ kind: "tooLong", hours: rule.hours });
    } else if (rule.type === "break") {
      for (const s of shifts) if (s.end - s.start > Math.round(rule.hours * 60) && s.break < rule.minutes) out.get(s)!.push({ kind: "noBreak", hours: rule.hours, minutes: rule.minutes });
    } else if (rule.type === "rest") {
      for (const p of restProblems(shifts, rule.hours)) out.get(p.shift)!.push({ kind: "rest", rest: p.rest, after: p.after, hours: rule.hours });
    } else if (rule.type === "weekend") {
      for (const s of shifts) if (isWeekend(s.day) && weekendDays(shifts, s.employee) > rule.days) out.get(s)!.push({ kind: "weekend", days: rule.days });
    }
  }
  return out;
};
/** The most people the coverage rules ask for (0: no coverage rule). */
export const coverageStaff = (r: Rota) => Math.max(0, ...r.rules.filter((x) => x.type === "coverage").map((x) => (x as { staff: number }).staff));

// --- pay

export type PayResult = { minutes: number; cents: number; surchargeCents: number; sundayMinutes: number; eveningMinutes: number };
/**
 * Hours and pay of an employee: the minutes worked (without breaks) times the hourly wage, with the Sunday surcharge
 * on every minute worked on Sunday and the evening surcharge on the minutes after `eveningFrom` on other days. A break
 * is taken before the evening (only the part of a break that does not fit before it comes off the evening minutes).
 * Rounded to whole cents once, for the week.
 */
export const payOf = (r: Rota, shifts: Shift[], employee: string): PayResult => {
  const e = employeeOf(r, employee);
  let minutes = 0, sundayMinutes = 0, eveningMinutes = 0;
  for (const s of shifts.filter((x) => x.employee === employee)) {
    const w = worked(s);
    minutes += w;
    if (s.day === "sun" && r.pay.sunday > 0) sundayMinutes += w;
    else if (r.pay.evening > 0) {
      const evening = Math.max(0, s.end - Math.max(s.start, r.pay.eveningFrom));
      const before = s.end - s.start - evening;
      eveningMinutes += Math.max(0, evening - Math.max(0, s.break - before));
    }
  }
  const wageCents = Math.round((e?.wage ?? 0) * 100);
  const base = (wageCents * minutes) / 60;
  const total = (wageCents * (minutes * 100 + sundayMinutes * r.pay.sunday + eveningMinutes * r.pay.evening)) / 6000;
  const cents = Math.round(total);
  return { minutes, cents, surchargeCents: cents - Math.round(base), sundayMinutes, eveningMinutes };
};

// --- the questions

/** An answer: a shift (start and end), "free", a number, or employee ids (in the order of the employees). */
export type Answer = { start: number; end: number } | "free" | number | string[];
/** What a candidate typed or tapped: times as text, a number as text, employees. */
export type RawAnswer = { start: string; end: string; free: boolean } | string | string[];

export const isWhoQuestion = (q: Question) => q.kind === "opens" || q.kind === "closes" || q.kind === "whoAt";
export const isNumberQuestion = (q: Question) => q.kind === "hours" || q.kind === "staffAt" || q.kind === "number";

/** The answer that follows from the rota. */
export const correctAnswer = (r: Rota, shifts: Shift[], q: Question): Answer => {
  const ids = (list: Shift[]) => r.employees.map((e) => e.id).filter((id) => list.some((s) => s.employee === id));
  const ofDay = shifts.filter((s) => s.day === q.day);
  switch (q.kind) {
    case "shift": {
      const s = shiftOf(shifts, q.employee, q.day);
      return s ? { start: s.start, end: s.end } : "free";
    }
    case "hours": return weekMinutes(shifts, q.employee) / 60;
    case "opens": {
      const first = Math.min(...ofDay.map((s) => s.start));
      return ids(ofDay.filter((s) => s.start === first));
    }
    case "closes": {
      const last = Math.max(...ofDay.map((s) => s.end));
      return ids(ofDay.filter((s) => s.end === last));
    }
    case "whoAt": return ids(ofDay.filter((s) => s.start <= q.time && q.time < s.end));
    case "staffAt": return staffAt(shifts, q.day, q.time);
    case "number": return q.answer;
  }
};

/** A raw answer as the answer it means; null when it is blank or unreadable. */
export const readAnswer = (r: Rota, q: Question, raw: RawAnswer | undefined | null): Answer | null => {
  if (raw === undefined || raw === null) return null;
  if (q.kind === "shift") {
    if (typeof raw !== "object" || Array.isArray(raw)) return null;
    if (raw.free) return "free";
    const s = toMinutes(raw.start), e = toMinutes(raw.end);
    return s === null || e === null ? null : { start: s, end: e };
  }
  if (isWhoQuestion(q)) {
    if (!Array.isArray(raw) || !raw.length) return null;
    return r.employees.map((e) => e.id).filter((id) => raw.includes(id));
  }
  return typeof raw === "string" ? parseAmount(raw) : null;
};

export const sameAnswer = (a: Answer | null, b: Answer | null): boolean => {
  if (a === null || b === null) return false;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.001;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x) => b.includes(x));
  if (a === "free" || b === "free") return a === b;
  if (typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) return a.start === b.start && a.end === b.end;
  return false;
};

/** An answer as the response has it: times as "13:00". */
const answerItem = (a: Answer | null) => (a === null || typeof a !== "object" || Array.isArray(a) ? a : { start: clock(a.start), end: clock(a.end) });
/** An answer from the response (or the correct answer) back as what the candidate typed or tapped. */
export const rawFromAnswer = (q: Question, a: unknown, language: string): RawAnswer | null => {
  if (a === null || a === undefined) return null;
  if (q.kind === "shift") {
    if (a === "free") return { start: "", end: "", free: true };
    const s = toMinutes((a as any)?.start), e = toMinutes((a as any)?.end);
    return s === null || e === null ? null : { start: clock(s), end: clock(e), free: false };
  }
  if (isWhoQuestion(q)) return Array.isArray(a) ? a.map(String) : null;
  const n = typeof a === "number" ? a : parseAmount(a);
  return n === null ? null : formatNumber(n, language);
};
const rawFromCorrect = (q: Question, a: Answer, language: string) => rawFromAnswer(q, answerItem(a), language)!;

// --- hours and pay boxes

export type Box = { hours: boolean; pay: boolean; payFollows: boolean };
/**
 * The boxes of an employee against the rota: the hours equal the rota's; the pay equals the rota's (to the cent); the
 * pay follows from the candidate's own hours (those hours times the wage, plus the rota's surcharges): an error in the
 * hours does not count twice. Without hours the pay follows when it is right.
 */
export const checkBox = (r: Rota, shifts: Shift[], employee: string, hoursText: string, payText: string): Box => {
  const p = payOf(r, shifts, employee);
  const h = parseAmount(hoursText), pay = parseAmount(payText);
  const wageCents = Math.round((employeeOf(r, employee)?.wage ?? 0) * 100);
  const hours = h !== null && Math.abs(h * 60 - p.minutes) < 0.01;
  const payRight = pay !== null && Math.abs(pay * 100 - p.cents) <= 1.0001;
  const follows = pay !== null && (h === null ? payRight : Math.abs(pay * 100 - Math.round(wageCents * h + p.surchargeCents)) <= 1.0001);
  return { hours, pay: payRight, payFollows: follows };
};

// --- the response

export type RotaState = { shifts: Shift[]; answers: (RawAnswer | null)[]; hours: string[]; pay: string[] };
export type Field = { name: string; base: { integer?: number; float?: number; boolean?: boolean; string?: string } };

/** The rota the candidate's answers are about: the given one, or their own. */
export const rotaShown = (r: Rota, mode: RotaMode, state: RotaState): Shift[] => (mode === "makeRota" || (mode === "hoursAndPay" && r.own) ? state.shifts : r.shifts ?? []);

/** Did the candidate do anything that counts? (Nothing is reported until they did.) */
export const answered = (r: Rota, mode: RotaMode, state: RotaState) => {
  if (mode === "makeRota") return state.shifts.length > 0;
  if (mode === "readRota") return state.answers.some((a, i) => r.questions[i] && readAnswer(r, r.questions[i], a) !== null);
  return (r.own && state.shifts.length > 0) || state.hours.some((x) => (x ?? "").trim()) || state.pay.some((x) => (x ?? "").trim());
};

/**
 * The record of a rota mode: score, maxscore and correct in every mode, then
 *   readRota: question1 … (1 or 0) and answers (JSON);
 *   makeRota: check1 … (1 or 0 per rule) and rota (JSON);
 *   hoursAndPay: hours1 …, pay1 … (the candidate's numbers, per employee), hoursCorrect, payCorrect, payFollows and rota.
 * undefined while nothing is answered.
 */
export const rotaResponse = (r: Rota, mode: RotaMode, state: RotaState): Field[] | undefined => {
  if (!answered(r, mode, state)) return undefined;
  const shifts = rotaShown(r, mode, state);
  const fields: Field[] = [];
  const head = (score: number, maxscore: number, correct: boolean) =>
    fields.push({ name: "score", base: { integer: score } }, { name: "maxscore", base: { integer: maxscore } }, { name: "correct", base: { integer: correct ? 1 : 0 } });
  if (mode === "makeRota") {
    const e = evaluateRules(r, shifts);
    head(e.score, e.maxscore, e.correct);
    e.results.forEach((x, i) => fields.push({ name: `check${i + 1}`, base: { integer: x.passed ? 1 : 0 } }));
    fields.push({ name: "rota", base: { string: rotaJSON(shifts) } });
  } else if (mode === "readRota") {
    const answers = r.questions.map((q, i) => readAnswer(r, q, state.answers[i]));
    const right = r.questions.map((q, i) => sameAnswer(answers[i], correctAnswer(r, shifts, q)));
    const maxscore = r.questions.reduce((s, q) => s + q.points, 0);
    head(r.questions.reduce((s, q, i) => s + (right[i] ? q.points : 0), 0), maxscore, right.length > 0 && right.every(Boolean));
    right.forEach((ok, i) => fields.push({ name: `question${i + 1}`, base: { integer: ok ? 1 : 0 } }));
    fields.push({ name: "answers", base: { string: JSON.stringify(answers.map(answerItem)) } });
  } else {
    const boxes = r.employees.map((e, i) => checkBox(r, shifts, e.id, state.hours[i] ?? "", state.pay[i] ?? ""));
    const ask = r.pay.askPay;
    const score = boxes.reduce((s, b) => s + (b.hours ? 1 : 0) + (ask && b.payFollows ? 1 : 0), 0);
    const hoursCorrect = boxes.every((b) => b.hours), payCorrect = boxes.every((b) => b.pay), payFollows = boxes.every((b) => b.payFollows);
    head(score, boxes.length * (ask ? 2 : 1), hoursCorrect && (!ask || payCorrect));
    r.employees.forEach((_, i) => {
      const h = parseAmount(state.hours[i] ?? "");
      if (h !== null) fields.push({ name: `hours${i + 1}`, base: { float: h } });
    });
    if (ask) r.employees.forEach((_, i) => {
      const p = parseAmount(state.pay[i] ?? "");
      if (p !== null) fields.push({ name: `pay${i + 1}`, base: { float: p } });
    });
    fields.push({ name: "hoursCorrect", base: { boolean: hoursCorrect } });
    if (ask) fields.push({ name: "payCorrect", base: { boolean: payCorrect } }, { name: "payFollows", base: { boolean: payFollows } });
    fields.push({ name: "rota", base: { string: rotaJSON(shifts) } });
  }
  return fields;
};

/**
 * The state that answers every question or box right (getCorrectResponse, the solution status): readRota and
 * hoursAndPay with a given rota; makeRota and an own rota have many right answers: null.
 */
export const correctState = (r: Rota, mode: RotaMode, language = "en"): RotaState | null => {
  const shifts = r.shifts ?? [];
  if (mode === "readRota") {
    if (!r.questions.length) return null;
    return { shifts: [], answers: r.questions.map((q) => rawFromCorrect(q, correctAnswer(r, shifts, q), language)), hours: [], pay: [] };
  }
  if (mode === "hoursAndPay" && !r.own) {
    const pays = r.employees.map((e) => payOf(r, shifts, e.id));
    return {
      shifts: [], answers: [],
      hours: pays.map((p) => formatNumber(p.minutes / 60, language)),
      pay: r.pay.askPay ? pays.map((p) => formatNumber(p.cents / 100, language, 2)) : [],
    };
  }
  return null;
};

/** A response (its fields) back as a state: the rota, the answers or the boxes. */
export const stateFromFields = (r: Rota, mode: RotaMode, fields: Record<string, unknown>, language = "en"): RotaState | null => {
  const state: RotaState = { shifts: [], answers: [], hours: [], pay: [] };
  let found = false;
  if (typeof fields.rota === "string") {
    const raw = parseRotaShifts(fields.rota);
    if (raw) {
      state.shifts = ownShifts(r, raw);
      found = true;
    }
  }
  if (mode === "readRota" && typeof fields.answers === "string") {
    try {
      const list = JSON.parse(fields.answers);
      if (Array.isArray(list)) {
        state.answers = r.questions.map((q, i) => rawFromAnswer(q, list[i], language));
        found = true;
      }
    } catch {
      // not answers of this PCI
    }
  }
  if (mode === "hoursAndPay") {
    const number = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null);
    r.employees.forEach((_, i) => {
      const h = number(fields[`hours${i + 1}`]), p = number(fields[`pay${i + 1}`]);
      state.hours[i] = h === null ? "" : formatNumber(h, language);
      state.pay[i] = p === null ? "" : formatNumber(p, language, 2);
      if (h !== null || p !== null) found = true;
    });
  }
  return found ? state : null;
};

/**
 * What the solution status shows without a correct response in the item: the correct state (correctState), or the
 * author's example solution (makeRota), with its own hours and pay (hoursAndPay with an own rota). null without one.
 */
export const exampleState = (r: Rota, mode: RotaMode, language = "en"): RotaState | null => {
  const right = correctState(r, mode, language);
  if (right) return right;
  if (!r.shifts?.length) return null;
  if (mode === "makeRota") return { shifts: r.shifts, answers: [], hours: [], pay: [] };
  if (mode === "hoursAndPay") {
    const pays = r.employees.map((e) => payOf(r, r.shifts!, e.id));
    return {
      shifts: r.shifts, answers: [],
      hours: pays.map((p) => formatNumber(p.minutes / 60, language)),
      pay: r.pay.askPay ? pays.map((p) => formatNumber(p.cents / 100, language, 2)) : [],
    };
  }
  return null;
};
