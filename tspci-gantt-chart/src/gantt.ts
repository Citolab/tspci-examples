// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/ganttchart, © OpenPCI (Aarhus University and Aalborg
// University: Elias J.T. Hansen, Anna Rusmann, Jeppe Bundsgaard)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The timeline and the response of the original ganttjs (runtime/ganttjs/gantt.js), without the DOM: the time slots
// the settings give, the header rows above them and the response string the original reports.

export type Settings = {
  /** Number of days on the timeline. */
  period: number;
  /** The first day; mm/dd/yyyy like the original, anything else: today. */
  startDate: Date;
  weekDays: boolean;
  months: boolean;
  disableWeekends: boolean;
  useHours: boolean;
  useHalfHours: boolean;
  showTimeRange: boolean;
  weekNumHack: boolean;
  dayStart: number;
  dayEnd: number;
  tasks: Task[];
};

export type Task = { name: string; color: string };
export type Slot = { date: Date; disabled: boolean };
export type HeaderCell = { label: string; span: number; disabled?: boolean; date: Date };
export type Timeline = { slots: Slot[]; months?: HeaderCell[]; days?: HeaderCell[]; weekDays?: HeaderCell[]; times?: HeaderCell[] };

/** Per task the selected slots, 0-based and sorted. */
export type Selection = number[][];

const MAX_SLOTS = 2000;
const bool = (v: unknown) => v === true || ["true", "1", "on", "yes"].includes(String(v ?? "").trim().toLowerCase());
const int = (v: unknown, fallback: number, min: number, max: number) => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** "03/02/2026" (month/day/year, as the original's form asks) → a date; otherwise today, like the original. */
export const parseStartDate = (value: string): Date => {
  const m = /^\s*([0-9]{1,2})[-/]([0-9]{1,2})[-/]([0-9]{4})\s*$/.exec(value ?? "");
  if (m) {
    const d = new Date(+m[3], +m[1] - 1, +m[2]);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
};

/** One task per line, "Task name;#colour" (the original's format). */
export const parseTasks = (value: string): Task[] =>
  String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, color] = line.split(";");
      return { name: name.trim(), color: (color ?? "").trim() || "#0284c7" };
    });

export const parseSettings = (p: Record<string, unknown>): Settings => {
  const useHalfHours = bool(p.useHalfHours);
  return {
    period: int(p.period, 30, 1, 366),
    startDate: parseStartDate(String(p.startDate ?? "")),
    weekDays: bool(p.weekDays),
    months: bool(p.months),
    disableWeekends: bool(p.disableWeekends),
    useHours: bool(p.useHours) || useHalfHours, // the original: half hours imply hours
    useHalfHours,
    showTimeRange: bool(p.showTimeRange),
    weekNumHack: bool(p.weekNumHack),
    dayStart: int(p.dayStart, 0, 0, 23),
    dayEnd: int(p.dayEnd, 23, 0, 23),
    tasks: parseTasks(String(p.tasks ?? "")),
  };
};

const weekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
const pad = (n: number) => String(n).padStart(2, "0");
export const time = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** The time slots, walked like the original's appendTimeSlots: a slot per day, or per (half) hour from dayStart to dayEnd. */
const slotsOf = (s: Settings): Slot[] => {
  const minutes = s.useHours ? (s.useHalfHours ? 30 : 60) : 0;
  const step = (d: Date) => {
    const n = new Date(d);
    if (minutes) n.setMinutes(n.getMinutes() + minutes);
    else n.setDate(n.getDate() + 1); // the original adds 24 hours; this keeps the time over a DST change
    return n;
  };
  const slots: Slot[] = [];
  let d = new Date(s.startDate);
  d.setHours(s.dayStart, 0, 0, 0);
  let ld = new Date(d);
  let days = 0;
  while (days < s.period && slots.length <= MAX_SLOTS) {
    if (d.getHours() > s.dayEnd) {
      d = new Date(d);
      d.setHours(s.dayStart);
      d.setDate(d.getDate() + 1);
    }
    const off = s.disableWeekends && weekend(d);
    slots.push({ date: new Date(d), disabled: off });
    if (!sameDay(d, ld)) days++;
    if (s.useHours && off) {
      // a weekend day is a single (disabled) column in hours mode
      d = new Date(d);
      d.setHours(s.dayEnd + 1);
    }
    ld = d;
    d = step(d);
  }
  slots.pop(); // the first slot of the day after the period
  return slots;
};

/** Consecutive slots with the same key → one header cell. */
const group = (slots: Slot[], key: (d: Date) => string, label: (d: Date) => string, disabled?: (d: Date) => boolean) =>
  slots.reduce((cells, slot) => {
    const last = cells[cells.length - 1];
    if (last && key(last.date) === key(slot.date)) last.span++;
    else cells.push({ label: label(slot.date), span: 1, date: slot.date, disabled: disabled?.(slot.date) });
    return cells;
  }, [] as HeaderCell[]);

export const timeline = (s: Settings, locale: string, weekWord: string): Timeline => {
  const slots = slotsOf(s);
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const monthName = new Intl.DateTimeFormat(locale, { month: "long" });
  const weekdayName = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const days = group(slots, dayKey, (d) => (s.weekNumHack ? `${weekWord} ` : "") + d.getDate());
  const minutes = s.useHalfHours ? 30 : 60;
  return {
    slots,
    months: s.months ? group(slots, (d) => `${d.getFullYear()}-${d.getMonth()}`, (d) => monthName.format(d)) : undefined,
    days: days.length > 1 ? days : undefined, // the original leaves out the date row for a single day
    weekDays: s.weekDays ? group(slots, dayKey, (d) => weekdayName.format(d), (d) => s.disableWeekends && weekend(d)) : undefined,
    times: s.useHours
      ? slots.map((slot) => ({
          label: slot.disabled ? "-" : time(slot.date) + (s.showTimeRange ? "-" + time(new Date(slot.date.getTime() + minutes * 60000)) : ""),
          span: 1,
          date: slot.date,
          disabled: slot.disabled,
        }))
      : undefined,
  };
};

/** Runs of consecutive selected slots: [first, last]. */
export const runs = (selected: number[]): [number, number][] => {
  const out: [number, number][] = [];
  [...selected].sort((a, b) => a - b).forEach((i) => {
    const last = out[out.length - 1];
    if (last && i === last[1] + 1) last[1] = i;
    else if (!last || i > last[1]) out.push([i, i]);
  });
  return out;
};

export const runAt = (selected: number[], slot: number) => runs(selected).find(([a, b]) => slot >= a && slot <= b);

/** Only slots that exist and are not disabled, sorted, once. */
export const clean = (selected: number[], slots: Slot[]) =>
  [...new Set(selected)].filter((i) => Number.isInteger(i) && i >= 0 && i < slots.length && !slots[i].disabled).sort((a, b) => a - b);

/** The original's resultDate: "2/3", or "2/3 08:00" with hours. */
const resultDate = (d: Date, s: Settings) => `${d.getDate()}/${d.getMonth() + 1}` + (s.useHours ? " " + time(d) : "");

/**
 * The response string of the original (gantt.amd.js getResponse): JSON with single quotes,
 * {'response':'2/3 - 6/3, 9/3;;','state':[[1,2,3,4,5,8],[],[]]}. "response" has per task the runs ("start - last slot",
 * or one date) joined by ", ", tasks joined by ";"; "state" per task the selected columns, counted as the original
 * counted its table cells (the task label is 0, so the first slot is 1).
 */
export const responseString = (selection: Selection, s: Settings, slots: Slot[]) => {
  const response = s.tasks
    .map((_, t) =>
      runs(selection[t] ?? [])
        .map(([a, b]) => (a === b ? resultDate(slots[a].date, s) : `${resultDate(slots[a].date, s)} - ${resultDate(slots[b].date, s)}`))
        .join(", ")
    )
    .join(";");
  const state = s.tasks.map((_, t) => (selection[t] ?? []).map((i) => i + 1));
  return JSON.stringify({ response, state }).replace(/"/g, "'");
};

/** The selection in a response string of this PCI or the original; null if it is not one. */
export const parseResponseString = (value: string, s: Settings, slots: Slot[]): Selection | null => {
  try {
    const data = JSON.parse(String(value).replace(/'/g, '"'));
    if (!Array.isArray(data?.state)) return null;
    return s.tasks.map((_, t) => clean((Array.isArray(data.state[t]) ? data.state[t] : []).map((i: number) => i - 1), slots));
  } catch {
    return null;
  }
};
