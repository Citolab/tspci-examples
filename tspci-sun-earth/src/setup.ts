// The task as the author sets it up (data-setup): the places, what the candidate controls, where it starts, the
// targets with their margins and a solution. Also the record's values for a setting and the scoring of the targets.
// No imports at run time (only types): `npm test` runs it in node, and solar.ts computes what goes into `valuesFor`.
import type { Day, SunPosition } from "./solar";

export type Place = {
  /** a QTI identifier: the response's `place` */
  id: string;
  name: { en: string; nl: string };
  /** ° north (negative: south) and ° east (negative: west) */
  lat: number;
  lon: number;
};

/** Places an author can pick by id ("oslo") without typing coordinates. */
export const PRESETS: Place[] = [
  { id: "amsterdam", name: { en: "Amsterdam", nl: "Amsterdam" }, lat: 52.37, lon: 4.9 },
  { id: "quito", name: { en: "Quito", nl: "Quito" }, lat: -0.18, lon: -78.47 },
  { id: "oslo", name: { en: "Oslo", nl: "Oslo" }, lat: 59.91, lon: 10.75 },
  { id: "sydney", name: { en: "Sydney", nl: "Sydney" }, lat: -33.87, lon: 151.21 },
  { id: "jakarta", name: { en: "Jakarta", nl: "Jakarta" }, lat: -6.2, lon: 106.85 },
  { id: "reykjavik", name: { en: "Reykjavík", nl: "Reykjavik" }, lat: 64.15, lon: -21.94 },
  { id: "longyearbyen", name: { en: "Longyearbyen", nl: "Longyearbyen" }, lat: 78.22, lon: 15.65 },
  { id: "cairo", name: { en: "Cairo", nl: "Caïro" }, lat: 30.04, lon: 31.24 },
  { id: "nairobi", name: { en: "Nairobi", nl: "Nairobi" }, lat: -1.29, lon: 36.82 },
  { id: "capetown", name: { en: "Cape Town", nl: "Kaapstad" }, lat: -33.92, lon: 18.42 },
  { id: "newyork", name: { en: "New York", nl: "New York" }, lat: 40.71, lon: -74.01 },
  { id: "paramaribo", name: { en: "Paramaribo", nl: "Paramaribo" }, lat: 5.85, lon: -55.2 },
  { id: "willemstad", name: { en: "Willemstad", nl: "Willemstad" }, lat: 12.11, lon: -68.93 },
  { id: "riodejaneiro", name: { en: "Rio de Janeiro", nl: "Rio de Janeiro" }, lat: -22.91, lon: -43.17 },
  { id: "tokyo", name: { en: "Tokyo", nl: "Tokio" }, lat: 35.68, lon: 139.69 },
  { id: "singapore", name: { en: "Singapore", nl: "Singapore" }, lat: 1.35, lon: 103.82 },
];

/** What the candidate can change. */
export type Controls = { day: boolean; time: boolean; place: boolean };

/** The fields of the response a target can test. */
export const NUMBER_FIELDS = [
  "day", "time", "localTime", "solarTime", "declination", "subsolarLongitude", "sunElevation", "sunAzimuth", "noonElevation",
  "dayLength", "sunrise", "sunset",
] as const;
export type NumberField = (typeof NUMBER_FIELDS)[number];
export type Field = NumberField | "place";
/** Fields on a circle: a margin goes round the end of the year or the day. */
export const CIRCULAR: Partial<Record<Field, number>> = { day: 365, time: 24, localTime: 24, solarTime: 24, sunrise: 24, sunset: 24, subsolarLongitude: 360, sunAzimuth: 360 };

export type Target = { field: Field; value: number | string; margin: number; points: number };
export const MAX_TARGETS = 4;

/** A setting of the interaction: the day of the year, the time (minutes UTC) and the place's id. */
export type Setting = { day: number; minutes: number; place: string };

export type Setup = {
  places: Place[];
  controls: Controls;
  start: Setting;
  /** minutes per step of the time slider */
  timeStep: number;
  targets: Target[];
  solution: Setting | null;
};

const preset = (id: string) => PRESETS.find((p) => p.id === id)!;

/** The example: set the date when the sun is overhead at the Tropic of Capricorn. */
export const DEFAULT_SETUP: Setup = {
  places: ["amsterdam", "quito", "oslo", "sydney", "jakarta"].map(preset),
  controls: { day: true, time: true, place: true },
  start: { day: 80, minutes: 720, place: "amsterdam" },
  timeStep: 10,
  targets: [{ field: "day", value: 355, margin: 3, points: 1 }],
  solution: { day: 355, minutes: 720, place: "amsterdam" },
};

const num = (v: unknown, fallback: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : NaN;
  return isFinite(n) ? n : fallback;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const wrapDay = (d: number) => ((((Math.round(d) - 1) % 365) + 365) % 365) + 1;
const wrapMinutes = (m: number) => ((m % 1440) + 1440) % 1440;
/** A QTI identifier from a name: "Den Haag" → "denhaag". */
export const identifierOf = (text: string) => {
  const id = String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return /^[a-z_]/.test(id) ? id : `p${id}`;
};

const placeOf = (v: any): Place | null => {
  if (typeof v === "string") return PRESETS.find((p) => p.id === v.toLowerCase()) ?? null;
  if (!v || typeof v !== "object") return null;
  const known = typeof v.id === "string" ? PRESETS.find((p) => p.id === v.id) : undefined;
  const name = typeof v.name === "string" ? { en: v.name, nl: v.name } : { en: String(v.name?.en ?? v.name?.nl ?? known?.name.en ?? v.id ?? ""), nl: String(v.name?.nl ?? v.name?.en ?? known?.name.nl ?? v.id ?? "") };
  if (!name.en && !v.id) return null;
  return {
    id: typeof v.id === "string" && v.id ? identifierOf(v.id) : identifierOf(name.en),
    name,
    lat: clamp(num(v.lat, known?.lat ?? 0), -90, 90),
    lon: clamp(num(v.lon, known?.lon ?? 0), -180, 180),
  };
};

export const ownSetting = (setup: Pick<Setup, "places" | "timeStep">, v: any, fallback: Setting): Setting => ({
  day: wrapDay(num(v?.day, fallback.day)),
  minutes: wrapMinutes(num(v?.minutes, fallback.minutes)),
  place: setup.places.some((p) => p.id === v?.place) ? v.place : setup.places.some((p) => p.id === fallback.place) ? fallback.place : setup.places[0]?.id ?? "",
});

/** data-setup → a setup; empty or broken: the example. Missing parts take the example's. */
export const parseSetup = (text: string | undefined | null): Setup => {
  if (!text || !String(text).trim()) return DEFAULT_SETUP;
  let raw: any;
  try {
    raw = JSON.parse(String(text));
  } catch {
    return DEFAULT_SETUP;
  }
  if (!raw || typeof raw !== "object") return DEFAULT_SETUP;
  const places: Place[] = [];
  for (const p of Array.isArray(raw.places) ? raw.places : DEFAULT_SETUP.places) {
    const place = placeOf(p);
    if (place && !places.some((q) => q.id === place.id)) places.push(place);
  }
  const c = raw.controls ?? {};
  const controls: Controls = {
    day: c.day === undefined ? DEFAULT_SETUP.controls.day : !!c.day,
    time: c.time === undefined ? DEFAULT_SETUP.controls.time : !!c.time,
    place: c.place === undefined ? DEFAULT_SETUP.controls.place : !!c.place,
  };
  const timeStep = clamp(Math.round(num(raw.timeStep, DEFAULT_SETUP.timeStep)), 1, 120);
  const base = { places, timeStep };
  const start = ownSetting(base, raw.start, { ...DEFAULT_SETUP.start, place: places[0]?.id ?? "" });
  const targets: Target[] = [];
  for (const t of Array.isArray(raw.targets) ? raw.targets : []) {
    if (!t || (t.field !== "place" && !NUMBER_FIELDS.includes(t.field))) continue;
    const field = t.field as Field;
    targets.push({
      field,
      value: field === "place" ? String(t.value ?? "") : num(t.value, 0),
      margin: field === "place" ? 0 : Math.max(0, num(t.margin, 0)),
      points: Math.max(0, Math.round(num(t.points, 1))),
    });
    if (targets.length === MAX_TARGETS) break;
  }
  const solution = raw.solution && typeof raw.solution === "object" ? ownSetting(base, raw.solution, start) : null;
  return { places, controls, start, timeStep, targets, solution };
};

/** The setup as data-setup: presets as their id, other places in full. */
export const serializeSetup = (setup: Setup) =>
  JSON.stringify({
    places: setup.places.map((p) => {
      const known = PRESETS.find((q) => q.id === p.id);
      return known && known.lat === p.lat && known.lon === p.lon && known.name.en === p.name.en && known.name.nl === p.name.nl ? p.id : p;
    }),
    controls: setup.controls,
    start: setup.start,
    timeStep: setup.timeStep,
    targets: setup.targets,
    solution: setup.solution,
  });

/**
 * What the candidate cannot change comes from the start: a setting the candidate made (or a response) only keeps
 * what they control.
 */
export const controlled = (setup: Setup, s: Setting): Setting => ({
  day: setup.controls.day ? s.day : setup.start.day,
  minutes: setup.controls.time ? s.minutes : setup.start.minutes,
  place: setup.controls.place ? s.place : setup.start.place,
});

export const placeById = (setup: Setup, id: string) => setup.places.find((p) => p.id === id) ?? setup.places[0] ?? null;

/** The response's values for a setting (rounded as the response has them); solar.ts computes the sun for them. */
export type Values = Record<NumberField, number | null> & { place: string; latitude: number; longitude: number };

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const hours = (minutes: number) => round(minutes / 60, 3);

export const valuesFor = (
  setting: Setting,
  place: Place,
  sun: { declination: number; subsolarLongitude: number; solarTime: number; localTime: number; position: SunPosition; day: Day }
): Values => ({
  day: setting.day,
  time: hours(setting.minutes),
  localTime: hours(sun.localTime),
  solarTime: hours(sun.solarTime),
  place: place.id,
  latitude: place.lat,
  longitude: place.lon,
  declination: round(sun.declination, 2),
  subsolarLongitude: round(sun.subsolarLongitude, 2),
  sunElevation: round(sun.position.elevation, 2),
  sunAzimuth: round(sun.position.azimuth, 1),
  noonElevation: round(sun.day.noonElevation, 2),
  dayLength: hours(sun.day.length),
  sunrise: sun.day.sunrise === null ? null : hours(sun.day.sunrise),
  sunset: sun.day.sunset === null ? null : hours(sun.day.sunset),
});

export type Result = { target: Target; value: number | string | null; passed: boolean };
export type Evaluation = { results: Result[]; score: number; maxscore: number; correct: boolean };

/** Whether a value meets a target: within the margin (round the circle for days and times), or the same place. */
export const meets = (target: Target, value: number | string | null) => {
  if (value === null || value === undefined) return false;
  if (target.field === "place") return String(value) === String(target.value);
  const m = CIRCULAR[target.field];
  const a = Number(value), b = Number(target.value);
  let d = Math.abs(a - b);
  if (m) {
    const w = (((a - b) % m) + m) % m;
    d = Math.min(w, m - w);
  }
  return d <= target.margin + 1e-9;
};

export const evaluate = (setup: Setup, values: Values): Evaluation => {
  const results = setup.targets.map((target) => {
    const value = target.field === "place" ? values.place : values[target.field];
    return { target, value, passed: meets(target, value) };
  });
  const score = results.reduce((s, r) => s + (r.passed ? r.target.points : 0), 0);
  const maxscore = setup.targets.reduce((s, t) => s + t.points, 0);
  return { results, score, maxscore, correct: results.length > 0 && results.every((r) => r.passed) };
};

// ---------------------------------------------------------------- authoring checks

export type Problem =
  | { code: "noPlaces" }
  | { code: "badPlace"; place: string }
  | { code: "duplicatePlace"; place: string }
  | { code: "nothingControls" }
  | { code: "onePlace" }
  | { code: "noTargets" }
  | { code: "targetPlaceUnknown"; target: number }
  | { code: "targetNotControlled"; target: number }
  | { code: "noSolution" }
  | { code: "solutionFails"; target: number };

/** Which controls a target depends on: a target on `day` can only be met when the candidate controls the day. */
const DEPENDS: Record<Field, (keyof Controls)[]> = {
  day: ["day"], time: ["time"], localTime: ["time", "place"], solarTime: ["day", "time", "place"], place: ["place"],
  declination: ["day", "time"], subsolarLongitude: ["day", "time"], sunElevation: ["day", "time", "place"], sunAzimuth: ["day", "time", "place"],
  noonElevation: ["day", "place"], dayLength: ["day", "place"], sunrise: ["day", "place"], sunset: ["day", "place"],
};

export const setupProblems = (setup: Setup, mode: string, valuesOf: (s: Setting) => Values | null): Problem[] => {
  const problems: Problem[] = [];
  if (!setup.places.length) problems.push({ code: "noPlaces" });
  const seen = new Set<string>();
  for (const p of setup.places) {
    if (!p.name.en.trim() || !/^[a-z_][a-z0-9_-]*$/i.test(p.id)) problems.push({ code: "badPlace", place: p.name.en || p.id });
    if (seen.has(p.id)) problems.push({ code: "duplicatePlace", place: p.id });
    seen.add(p.id);
  }
  const c = setup.controls;
  if (!c.day && !c.time && !c.place) problems.push({ code: "nothingControls" });
  if (c.place && setup.places.length < 2) problems.push({ code: "onePlace" });
  if (mode !== "tool") {
    if (!setup.targets.length) problems.push({ code: "noTargets" });
    setup.targets.forEach((t, i) => {
      if (t.field === "place" && !setup.places.some((p) => p.id === t.value)) problems.push({ code: "targetPlaceUnknown", target: i + 1 });
      if (!DEPENDS[t.field].some((k) => c[k])) problems.push({ code: "targetNotControlled", target: i + 1 });
    });
    if (setup.targets.length) {
      const values = setup.solution ? valuesOf(controlled(setup, setup.solution)) : null;
      if (!values) problems.push({ code: "noSolution" });
      else evaluate(setup, values).results.forEach((r, i) => !r.passed && problems.push({ code: "solutionFails", target: i + 1 }));
    }
  }
  return problems;
};

// ---------------------------------------------------------------- response processing for the item

/**
 * QTI response processing that scores the targets in the item itself: qti-equal with an absolute tolerance on a
 * number field, qti-match on the place. QTI cannot go round the end of the year or the day: a margin that crosses
 * it needs the PCI's score (README).
 */
export const responseProcessing = (setup: Setup, identifier = "RESPONSE"): string => {
  const max = setup.targets.reduce((s, t) => s + t.points, 0);
  const field = (name: string) => `<qti-field-value field-identifier="${name}"><qti-variable identifier="${identifier}"/></qti-field-value>`;
  const rules = setup.targets.map((t, i) => {
    const test = t.field === "place"
      ? [`      <qti-match>`, `        ${field("place")}`, `        <qti-base-value base-type="identifier">${t.value}</qti-base-value>`, `      </qti-match>`]
      : [
        `      <qti-equal tolerance-mode="absolute" tolerance="${t.margin} ${t.margin}">`,
        `        ${field(t.field)}`,
        `        <qti-base-value base-type="float">${t.value}</qti-base-value>`,
        `      </qti-equal>`,
      ];
    return [
      `  <!-- target ${i + 1}: ${t.field} ${t.field === "place" ? `= ${t.value}` : `= ${t.value} ± ${t.margin}`} -->`,
      `  <qti-response-condition>`,
      `    <qti-response-if>`,
      ...test,
      `      <qti-set-outcome-value identifier="SCORE">`,
      `        <qti-sum><qti-variable identifier="SCORE"/><qti-base-value base-type="float">${t.points}</qti-base-value></qti-sum>`,
      `      </qti-set-outcome-value>`,
      `    </qti-response-if>`,
      `  </qti-response-condition>`,
    ].join("\n");
  });
  return [
    `<qti-outcome-declaration identifier="SCORE" cardinality="single" base-type="float">`,
    `  <qti-default-value><qti-value>0</qti-value></qti-default-value>`,
    `</qti-outcome-declaration>`,
    `<qti-outcome-declaration identifier="MAXSCORE" cardinality="single" base-type="float">`,
    `  <qti-default-value><qti-value>${max}</qti-value></qti-default-value>`,
    `</qti-outcome-declaration>`,
    `<qti-response-processing>`,
    ...rules,
    `</qti-response-processing>`,
  ].join("\n");
};
