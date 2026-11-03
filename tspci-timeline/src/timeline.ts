// The timeline without the page: years BC/AD, snapping, periods (the ten Dutch tijdvakken), parsing the author's
// settings, the evaluation of the candidate's placements and the response processing. No imports: tested in node
// (npm test).
//
// Years are historical: 1648 is AD 1648, -44 is 44 BC, and there is no year 0 (1 BC is followed by AD 1). For the
// axis and for distances they become astronomical years (1 BC = 0, 2 BC = -1), so that 1 BC and AD 1 lie one apart.

export const MAX_EVENTS = 12;
export const MODES = ["date", "period", "order"] as const;
export const UNITS = ["year", "decade", "century"] as const;
export type Mode = (typeof MODES)[number];
export type Unit = (typeof UNITS)[number];
export type Scoring = "each" | "all";

/** A named period, from start up to end (historical years; end is where the next period begins). */
export type Period = { id: string; label: string; start: number; end: number };
export type TimelineEvent = {
  id: string;
  text: string;
  /** an optional picture on the card (URL), with its alternative text */
  image?: string;
  alt?: string;
  /** the correct year (date and order mode, and the period when there is no period) */
  year?: number;
  /** the correct period (period mode) */
  period?: string;
};
export type Timeline = {
  /** the axis, in historical years */
  start: number;
  end: number;
  unit: Unit;
  /** in years, for unit "year": 1, 5, 10, … */
  snap: number;
  mode: Mode;
  /** date mode: how many years off still counts */
  margin: number;
  scoring: Scoring;
  /** "tijdvakken" when the periods are the preset */
  preset: "" | "tijdvakken";
  periods: Period[];
  events: TimelineEvent[];
};
/** What the candidate did: per event id a year (date, order) or a period id (period). */
export type Placed = Record<string, number | string>;

// ---------------------------------------------------------------- years

/** Historical year (no 0) → astronomical (1 BC = 0). */
export const toAstro = (year: number) => (year > 0 ? year : year + 1);
/** Astronomical → historical; a fraction between 0 and 1 counts as AD. */
export const fromAstro = (a: number) => (a > 0 ? a : a - 1);

const sign = (n: number) => (n < 0 ? -1 : 1);

/** The value a position on the axis (astronomical, continuous) snaps to: a year, the start of a decade or a century. */
export const snapAt = (position: number, unit: Unit, snap = 1): number => {
  if (unit === "year") {
    const step = Math.max(1, Math.round(snap) || 1);
    const h = fromAstro(position);
    const r = Math.round(h / step) * step;
    return r === 0 ? (position >= 0.5 ? 1 : -1) : r;
  }
  const h = fromAstro(Math.floor(position)) || 1; // the year the position lies in
  if (unit === "decade") return sign(h) * (Math.floor(Math.abs(h) / 10) * 10 || 1);
  if (h > 0) return Math.floor(h / 100) * 100 || 1; // 17th century: 1600 (1600–1699)
  return -Math.ceil(-h / 100) * 100; // 5th century BC: -500 (500–401 BC)
};

/** A historical year snapped as the axis does: what the candidate can reach. */
export const snapYear = (year: number, unit: Unit, snap = 1) => snapAt(toAstro(year), unit, snap);

/** The years a snapped value stands for, astronomical, first and last. */
export const binOf = (value: number, unit: Unit): [number, number] => {
  const a = toAstro(value);
  if (unit === "year") return [a, a];
  const size = unit === "decade" ? 10 : 100;
  if (value > 0) return [a, (value === 1 ? 0 : value) + size - 1];
  if (unit === "century") return [a, a + size - 1]; // -500: 500–401 BC
  // a decade BC: -40 is 49–40 BC, -1 is 9–1 BC
  const oldest = value === -1 ? -(size - 1) : value - (size - 1);
  return [toAstro(oldest), a];
};

/** Where a snapped value sits on the axis (astronomical): the year itself, or the middle of its decade or century. */
export const positionOf = (value: number, unit: Unit) => {
  if (unit === "year") return toAstro(value);
  const [lo, hi] = binOf(value, unit);
  return (lo + hi + 1) / 2;
};

/** The distance in years between two historical years (1 BC and AD 1 are one year apart). */
export const yearsBetween = (a: number, b: number) => Math.abs(toAstro(a) - toAstro(b));

const ordinal = (n: number, language: string) => {
  if (language === "nl") return `${n}e`;
  const t = n % 100;
  const s = t >= 11 && t <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
};

const era = (year: number, language: string, withEra: boolean, text: string) => {
  if (year < 0) return language === "nl" ? `${text} v.Chr.` : `${text} BC`;
  if (!withEra) return text;
  return language === "nl" ? `${text} n.Chr.` : `AD ${text}`;
};

/** A year as people write it: "1648", "44 v.Chr.", "AD 800" (withEra: the axis has years BC). */
export const formatYear = (year: number, language = "en", withEra = false) => era(year, language, withEra, String(Math.abs(Math.round(year))));

/** A snapped value in the unit of the axis: "1648", "the 1640s" / "jaren 1640", "17th century" / "17e eeuw". */
export const formatValue = (value: number, unit: Unit, language = "en", withEra = false) => {
  const nl = language === "nl";
  if (unit === "year") return formatYear(value, language, withEra);
  if (unit === "decade") {
    const d = Math.abs(value) < 10 ? 0 : Math.abs(value);
    const text = nl ? `jaren ${d}` : `${d}s`;
    if (value < 0) return nl ? `${text} v.Chr.` : `${text} BC`;
    return withEra ? (nl ? `${text} n.Chr.` : `${text} AD`) : nl ? text : `the ${text}`;
  }
  const c = value > 0 ? Math.floor(value / 100) + 1 : Math.ceil(-value / 100);
  const text = nl ? `${ordinal(c, language)} eeuw` : `${ordinal(c, language)} century`;
  if (value < 0) return nl ? `${text} v.Chr.` : `${text} BC`;
  return withEra ? (nl ? `${text} n.Chr.` : `${text} AD`) : text;
};

/**
 * A year the author types: "1648", "-44", "44 v.Chr.", "44 BC", "800 n.Chr.", "AD 800", "500 BCE". Null for
 * anything else, and for 0 (there is no year 0).
 */
export const parseYear = (input: unknown): number | null => {
  if (typeof input === "number") return Number.isFinite(input) && input !== 0 ? input : null;
  if (typeof input !== "string") return null;
  let s = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  let negative = false;
  const bc = /(v\.? ?chr\.?|voor christus|b\.?c\.?e?\.?)$/;
  const ad = /(n\.? ?chr\.?|na christus|a\.?d\.?|c\.?e\.?)$/;
  if (bc.test(s)) { negative = true; s = s.replace(bc, "").trim(); }
  else if (ad.test(s)) s = s.replace(ad, "").trim();
  else if (/^a\.?d\.? /.test(s)) s = s.replace(/^a\.?d\.? /, "").trim();
  if (!/^[-−]?\d+([.,]\d+)?$/.test(s)) return null;
  let n = Number(s.replace("−", "-").replace(",", "."));
  if (negative) n = -Math.abs(n);
  return Number.isFinite(n) && n !== 0 ? n : null;
};

// ---------------------------------------------------------------- periods

const TIJDVAKKEN: { start: number; end: number; nl: string; en: string }[] = [
  { start: -12000, end: -3000, nl: "Tijd van jagers en boeren", en: "Hunters and farmers" },
  { start: -3000, end: 500, nl: "Tijd van Grieken en Romeinen", en: "Greeks and Romans" },
  { start: 500, end: 1000, nl: "Tijd van monniken en ridders", en: "Monks and knights" },
  { start: 1000, end: 1500, nl: "Tijd van steden en staten", en: "Cities and states" },
  { start: 1500, end: 1600, nl: "Tijd van ontdekkers en hervormers", en: "Discoverers and reformers" },
  { start: 1600, end: 1700, nl: "Tijd van regenten en vorsten", en: "Regents and monarchs" },
  { start: 1700, end: 1800, nl: "Tijd van pruiken en revoluties", en: "Wigs and revolutions" },
  { start: 1800, end: 1900, nl: "Tijd van burgers en stoommachines", en: "Citizens and steam engines" },
  { start: 1900, end: 1950, nl: "Tijd van de wereldoorlogen", en: "The world wars" },
  { start: 1950, end: 3000, nl: "Tijd van televisie en computer", en: "Television and computers" },
];

/** The ten Dutch tijdvakken, ids t1 … t10, named in the language. */
export const tijdvakken = (language = "en"): Period[] =>
  TIJDVAKKEN.map((p, i) => ({ id: `t${i + 1}`, label: language === "nl" ? p.nl : p.en, start: p.start, end: p.end }));

/** The part of a period on the axis, astronomical [from, to); null when it falls outside. */
export const visiblePart = (p: Period, t: Pick<Timeline, "start" | "end">): [number, number] | null => {
  const from = Math.max(toAstro(p.start), toAstro(t.start));
  const to = Math.min(toAstro(p.end), toAstro(t.end));
  return to > from ? [from, to] : null;
};

/** The periods with a part on the axis. */
export const visiblePeriods = (t: Timeline) => t.periods.filter((p) => visiblePart(p, t));

/** The period an (astronomical) position lies in. */
export const periodAt = (periods: Period[], position: number): Period | null =>
  periods.find((p) => toAstro(p.start) <= position && position < toAstro(p.end)) ?? null;

/** The period of a historical year. */
export const periodOfYear = (periods: Period[], year: number) => periodAt(periods, toAstro(year));

/** Where a card in a period sits: the middle of the period's part on the axis. */
export const periodPosition = (t: Timeline, id: string) => {
  const p = t.periods.find((q) => q.id === id);
  const part = p && visiblePart(p, t);
  return part ? (part[0] + part[1]) / 2 : null;
};

// ---------------------------------------------------------------- the author's settings

const EXAMPLE_EVENTS: { year: number; en: string; nl: string }[] = [
  { year: 1566, en: "The Iconoclastic Fury in the Low Countries", nl: "De Beeldenstorm in de Nederlanden" },
  { year: 1648, en: "Peace of Münster: Spain recognises the Dutch Republic", nl: "Vrede van Münster: Spanje erkent de Republiek" },
  { year: 1789, en: "The storming of the Bastille in Paris", nl: "De bestorming van de Bastille in Parijs" },
  { year: 1839, en: "The first railway in the Netherlands, Amsterdam–Haarlem", nl: "De eerste spoorlijn in Nederland, Amsterdam–Haarlem" },
  { year: 1945, en: "The end of the Second World War", nl: "Het einde van de Tweede Wereldoorlog" },
  { year: 1969, en: "The first people walk on the Moon", nl: "De eerste mensen lopen op de maan" },
];

/** The example: six events from 1500 to 2000 on the tijdvakken, to place within 10 years. */
export const exampleTimeline = (language = "en"): Timeline => ({
  start: 1500, end: 2000, unit: "year", snap: 1, mode: "date", margin: 10, scoring: "each",
  preset: "tijdvakken", periods: tijdvakken(language),
  events: EXAMPLE_EVENTS.map((e, i) => ({ id: `e${i + 1}`, text: language === "nl" ? e.nl : e.en, year: e.year })),
});

const ID = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const num = (v: unknown, fallback: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const year = (v: unknown, fallback: number) => {
  const y = parseYear(v);
  return y === null ? fallback : Math.round(y);
};
const uniqueId = (wanted: unknown, used: Set<string>, prefix: string, i: number) => {
  let id = typeof wanted === "string" && ID.test(wanted.trim()) ? wanted.trim() : `${prefix}${i + 1}`;
  let n = i;
  while (used.has(id)) id = `${prefix}${++n}`;
  used.add(id);
  return id;
};

/** data-timeline (JSON, written by the authoring mode) → the timeline; empty or unreadable: the example. */
export const parseTimeline = (text: unknown, language = "en"): Timeline => {
  let raw: any = null;
  if (typeof text === "string" && text.trim()) {
    try { raw = JSON.parse(text); } catch { raw = null; }
  } else if (text && typeof text === "object") raw = text;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return exampleTimeline(language);

  let start = year(raw.start, 1500);
  let end = year(raw.end, 2000);
  if (toAstro(end) <= toAstro(start)) end = fromAstro(toAstro(start) + 100);
  const unit: Unit = (UNITS as readonly string[]).includes(raw.unit) ? raw.unit : "year";
  const snap = Math.max(1, Math.round(num(raw.snap, 1)));
  const mode: Mode = (MODES as readonly string[]).includes(raw.mode) ? raw.mode : "date";
  const margin = Math.max(0, num(raw.margin, 0));
  const scoring: Scoring = raw.scoring === "all" ? "all" : "each";

  let preset: Timeline["preset"] = "";
  let periods: Period[] = [];
  if (raw.periods === "tijdvakken") {
    preset = "tijdvakken";
    periods = tijdvakken(language);
  } else if (Array.isArray(raw.periods)) {
    const used = new Set<string>();
    periods = raw.periods
      .filter((p: any) => p && typeof p === "object")
      .map((p: any, i: number) => ({
        id: uniqueId(p.id, used, "p", i),
        label: typeof p.label === "string" ? p.label : "",
        start: year(p.start, start),
        end: year(p.end, end),
      }));
  }
  if (mode === "period" && !periods.length) {
    preset = "tijdvakken";
    periods = tijdvakken(language);
  }

  const used = new Set<string>();
  const events: TimelineEvent[] = (Array.isArray(raw.events) ? raw.events : [])
    .filter((e: any) => e && typeof e === "object")
    .slice(0, MAX_EVENTS)
    .map((e: any, i: number) => {
      const ev: TimelineEvent = { id: uniqueId(e.id, used, "e", i), text: typeof e.text === "string" ? e.text : "" };
      if (typeof e.image === "string" && e.image.trim()) ev.image = e.image.trim();
      if (typeof e.alt === "string" && e.alt.trim()) ev.alt = e.alt.trim();
      const y = parseYear(e.year);
      if (y !== null) ev.year = Math.round(y);
      if (typeof e.period === "string" && e.period.trim()) ev.period = e.period.trim();
      return ev;
    });
  return { start, end, unit, snap, mode, margin, scoring, preset, periods, events };
};

/** The timeline as data-timeline. */
export const serializeTimeline = (t: Timeline) =>
  JSON.stringify({
    start: t.start, end: t.end, unit: t.unit, ...(t.unit === "year" && t.snap > 1 ? { snap: t.snap } : {}),
    mode: t.mode, ...(t.mode === "date" ? { margin: t.margin } : {}), scoring: t.scoring,
    periods: t.preset === "tijdvakken" ? "tijdvakken" : t.periods.map(({ id, label, start, end }) => ({ id, label, start, end })),
    events: t.events.map((e) => {
      const out: Record<string, unknown> = { id: e.id, text: e.text };
      if (e.image) out.image = e.image;
      if (e.alt) out.alt = e.alt;
      if (e.year !== undefined) out.year = e.year;
      if (e.period) out.period = e.period;
      return out;
    }),
  });

/** The period that is correct for an event: its own, or the one its year lies in. */
export const correctPeriod = (t: Timeline, e: TimelineEvent): string | null => {
  if (e.period && t.periods.some((p) => p.id === e.period)) return e.period;
  if (e.year !== undefined) return periodOfYear(t.periods, e.year)?.id ?? null;
  return null;
};

/** The correct value of an event, snapped as the candidate can place it: a year or a period id. */
export const correctValue = (t: Timeline, e: TimelineEvent): number | string | null => {
  if (t.mode === "period") return correctPeriod(t, e);
  if (e.year === undefined) return null;
  return t.mode === "order" ? e.year : snapYear(e.year, t.unit, t.snap);
};

/** The placements that answer the question: what the solution shows and getCorrectResponse reports. */
export const correctPlacements = (t: Timeline): Placed | null => {
  const placed: Placed = {};
  for (const e of t.events) {
    const v = correctValue(t, e);
    if (v === null) return null;
    placed[e.id] = t.mode === "order" ? snapYear(v as number, "year", t.snap) : v;
  }
  return t.events.length ? placed : null;
};

/** Only the candidate's placements of events that exist, of the right kind; years on the axis. */
export const ownPlacements = (t: Timeline, raw: unknown): Placed => {
  const placed: Placed = {};
  if (!raw || typeof raw !== "object") return placed;
  for (const e of t.events) {
    const v = (raw as Record<string, unknown>)[e.id];
    if (t.mode === "period") {
      if (typeof v === "string" && t.periods.some((p) => p.id === v)) placed[e.id] = v;
    } else {
      const y = parseYear(v);
      if (y !== null) {
        const a = Math.min(Math.max(toAstro(y), toAstro(t.start)), toAstro(t.end));
        placed[e.id] = snapAt(a, t.mode === "order" ? "year" : t.unit, t.snap);
      }
    }
  }
  return placed;
};

/** Where a placed value sits on the axis (astronomical). */
export const placedPosition = (t: Timeline, value: number | string) =>
  typeof value === "string" ? periodPosition(t, value) : positionOf(value, t.mode === "order" ? "year" : t.unit);

// ---------------------------------------------------------------- evaluation

export type Evaluation = {
  score: number;
  maxscore: number;
  correct: boolean;
  /** per event, in the author's order: right or not */
  checks: boolean[];
  /** order mode: the pairs in the right order, and the pairs that count */
  pairs: number;
  pairsMax: number;
  /** the placed event ids from early to late */
  order: string[];
};

/** The placed events from early to late (ties in the author's order). */
export const orderOf = (t: Timeline, placed: Placed) => {
  const index = (id: string) => t.events.findIndex((e) => e.id === id);
  const key = (id: string) => {
    const v = placed[id];
    return typeof v === "string" ? t.periods.findIndex((p) => p.id === v) : toAstro(v);
  };
  return t.events.filter((e) => placed[e.id] !== undefined).map((e) => e.id).sort((a, b) => key(a) - key(b) || index(a) - index(b));
};

/** The candidate's placements against the author's answers. */
export const evaluate = (t: Timeline, placed: Placed): Evaluation => {
  const n = t.events.length;
  let checks: boolean[];
  let pairs = 0;
  let pairsMax = 0;
  if (t.mode === "order") {
    const ok = t.events.map(() => true);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = t.events[i], b = t.events[j];
        if (a.year === undefined || b.year === undefined || a.year === b.year) continue; // a tie in the answer: either order
        pairsMax++;
        const pa = placed[a.id], pb = placed[b.id];
        const right = typeof pa === "number" && typeof pb === "number" && Math.sign(toAstro(pa) - toAstro(pb)) === Math.sign(toAstro(a.year) - toAstro(b.year));
        if (right) pairs++;
        else ok[i] = ok[j] = false;
      }
    }
    checks = t.events.map((e, i) => ok[i] && placed[e.id] !== undefined);
  } else if (t.mode === "period") {
    checks = t.events.map((e) => {
      const want = correctPeriod(t, e);
      return want !== null && placed[e.id] === want;
    });
  } else {
    checks = t.events.map((e) => {
      const v = placed[e.id];
      const want = correctValue(t, e);
      return typeof v === "number" && typeof want === "number" && yearsBetween(v, want) <= t.margin + 1e-9;
    });
  }
  const correct = n > 0 && checks.every(Boolean);
  const all = t.scoring === "all";
  const score = all ? (correct ? 1 : 0) : t.mode === "order" ? pairs : checks.filter(Boolean).length;
  const maxscore = all ? 1 : t.mode === "order" ? pairsMax : n;
  return { score, maxscore, correct, checks, pairs, pairsMax, order: orderOf(t, placed) };
};

/** The placements as a canonical JSON text, in the author's order. */
export const placementsText = (t: Timeline, placed: Placed) => {
  const out: Record<string, number | string> = {};
  for (const e of t.events) if (placed[e.id] !== undefined) out[e.id] = placed[e.id];
  return JSON.stringify(out);
};

export const samePlacements = (a: Placed, b: Placed) => {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
};

/** The fields of the response record, as [name, baseType, value]; only what there is. */
export const responseFields = (t: Timeline, placed: Placed): [string, "integer" | "float" | "identifier" | "string", number | string][] => {
  const e = evaluate(t, placed);
  const fields: [string, "integer" | "float" | "identifier" | "string", number | string][] = [
    ["score", "integer", e.score],
    ["maxscore", "integer", e.maxscore],
    ["correct", "integer", e.correct ? 1 : 0],
  ];
  t.events.forEach((_, i) => fields.push([`check${i + 1}`, "integer", e.checks[i] ? 1 : 0]));
  t.events.forEach((ev, i) => {
    const v = placed[ev.id];
    if (typeof v === "number" && t.mode === "date") fields.push([`year${i + 1}`, "float", v]);
  });
  t.events.forEach((ev, i) => {
    const v = placed[ev.id];
    const p = typeof v === "string" ? v : typeof v === "number" && t.mode === "date" ? periodOfYear(t.periods, v)?.id : undefined;
    if (p) fields.push([`period${i + 1}`, "identifier", p]);
  });
  if (t.mode !== "period") fields.push(["order", "string", e.order.join(" ")]);
  if (t.mode === "order") fields.push(["pairs", "integer", e.pairs]);
  fields.push(["placements", "string", placementsText(t, placed)]);
  return fields;
};

// ---------------------------------------------------------------- response processing

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The tolerance of qti-equal for a year with a margin: two values (below, above) when the margin reaches over the
 * start of the era, because the response has no year 0.
 */
export const toleranceFor = (value: number, margin: number) => {
  const a = toAstro(value);
  const below = value - fromAstro(a - margin);
  const above = fromAstro(a + margin) - value;
  return below === above ? fmt(below) : `${fmt(below)} ${fmt(above)}`;
};

/**
 * Response processing for the item, as the authoring mode shows it: in date mode a qti-equal with the margin on
 * every year field, in period mode a qti-match on every period field; in order mode the PCI's own score.
 */
export const responseProcessingXml = (t: Timeline, responseIdentifier = "RESPONSE") => {
  const r = `<qti-variable identifier="${responseIdentifier}"/>`;
  const fv = (name: string) => `<qti-field-value field-identifier="${name}">${r}</qti-field-value>`;
  const conditions: { comment: string; xml: string }[] = [];
  if (t.mode !== "order") {
    t.events.forEach((e, i) => {
      const want = correctValue(t, e);
      if (want === null) return;
      if (t.mode === "date") {
        conditions.push({
          comment: `event ${i + 1}: ${esc(e.text)} (${want}, ± ${fmt(t.margin)})`,
          xml: `<qti-equal tolerance-mode="absolute" tolerance="${toleranceFor(want as number, t.margin)}">${fv(`year${i + 1}`)}<qti-base-value base-type="float">${fmt(want as number)}</qti-base-value></qti-equal>`,
        });
      } else {
        conditions.push({
          comment: `event ${i + 1}: ${esc(e.text)} (${want})`,
          xml: `<qti-match>${fv(`period${i + 1}`)}<qti-base-value base-type="identifier">${want}</qti-base-value></qti-match>`,
        });
      }
    });
  }
  const max = t.mode === "order" ? evaluate(t, {}).maxscore : t.scoring === "all" ? 1 : conditions.length;
  const lines = [
    `<qti-outcome-declaration identifier="SCORE" cardinality="single" base-type="float">`,
    `  <qti-default-value><qti-value>0</qti-value></qti-default-value>`,
    `</qti-outcome-declaration>`,
    `<qti-outcome-declaration identifier="MAXSCORE" cardinality="single" base-type="float">`,
    `  <qti-default-value><qti-value>${max}</qti-value></qti-default-value>`,
    `</qti-outcome-declaration>`,
    `…`,
    `<qti-response-processing>`,
  ];
  const set = (value: string) => [`      <qti-set-outcome-value identifier="SCORE">`, `        ${value}`, `      </qti-set-outcome-value>`];
  if (t.mode === "order") {
    lines.push(
      `  <!-- the PCI counts the pairs in the right order (score) -->`,
      `  <qti-response-condition>`,
      `    <qti-response-if>`,
      `      <qti-not><qti-is-null>${fv("score")}</qti-is-null></qti-not>`,
      ...set(fv("score")),
      `    </qti-response-if>`,
      `  </qti-response-condition>`
    );
  } else if (t.scoring === "all") {
    lines.push(
      `  <!-- 1 point when every event is right -->`,
      `  <qti-response-condition>`,
      `    <qti-response-if>`,
      `      <qti-and>`,
      ...conditions.map((c) => `        <!-- ${c.comment} -->\n        ${c.xml}`),
      `      </qti-and>`,
      ...set(`<qti-base-value base-type="float">1</qti-base-value>`),
      `    </qti-response-if>`,
      `  </qti-response-condition>`
    );
  } else {
    for (const c of conditions) {
      lines.push(
        `  <!-- ${c.comment} -->`,
        `  <qti-response-condition>`,
        `    <qti-response-if>`,
        `      ${c.xml}`,
        ...set(`<qti-sum><qti-variable identifier="SCORE"/><qti-base-value base-type="float">1</qti-base-value></qti-sum>`),
        `    </qti-response-if>`,
        `  </qti-response-condition>`
      );
    }
  }
  lines.push(`</qti-response-processing>`);
  return lines.join("\n");
};

// ---------------------------------------------------------------- what the author has to fix

export type Problem =
  | { code: "noEvents" }
  | { code: "tooMany" }
  | { code: "range" }
  | { code: "noText"; event: number }
  | { code: "noYear"; event: number }
  | { code: "outside"; event: number }
  | { code: "noPeriod"; event: number }
  | { code: "noPeriods" }
  | { code: "periodLabel"; period: number }
  | { code: "periodRange"; period: number }
  | { code: "periodOutside"; period: number }
  | { code: "fewEvents" }
  | { code: "allSameYear" };

/** What keeps the timeline from being used; event and period numbers count from 1. */
export const problemsOf = (t: Timeline, rawEventCount = t.events.length): Problem[] => {
  const problems: Problem[] = [];
  if (toAstro(t.end) <= toAstro(t.start)) problems.push({ code: "range" });
  if (!t.events.length) problems.push({ code: "noEvents" });
  if (rawEventCount > MAX_EVENTS) problems.push({ code: "tooMany" });
  if (t.mode === "order" && t.events.length === 1) problems.push({ code: "fewEvents" });
  t.periods.forEach((p, i) => {
    if (!p.label.trim()) problems.push({ code: "periodLabel", period: i + 1 });
    if (toAstro(p.end) <= toAstro(p.start)) problems.push({ code: "periodRange", period: i + 1 });
    else if (!t.preset && !visiblePart(p, t)) problems.push({ code: "periodOutside", period: i + 1 });
  });
  if (t.mode === "period" && !visiblePeriods(t).length) problems.push({ code: "noPeriods" });
  t.events.forEach((e, i) => {
    if (!e.text.trim() && !e.image) problems.push({ code: "noText", event: i + 1 });
    if (t.mode === "period") {
      const p = correctPeriod(t, e);
      if (!p || !visiblePart(t.periods.find((q) => q.id === p)!, t)) problems.push({ code: "noPeriod", event: i + 1 });
    } else if (e.year === undefined) problems.push({ code: "noYear", event: i + 1 });
    else if (toAstro(e.year) < toAstro(t.start) || toAstro(e.year) > toAstro(t.end)) problems.push({ code: "outside", event: i + 1 });
  });
  if (t.mode === "order" && t.events.length > 1 && t.events.every((e) => e.year !== undefined) && evaluate(t, {}).pairsMax === 0)
    problems.push({ code: "allSameYear" });
  return problems;
};

// ---------------------------------------------------------------- the axis on screen

/** The ticks of the axis between two positions (astronomical) for a width in pixels: historical years with labels. */
export const ticks = (from: number, to: number, width: number, unit: Unit, minLabelPx = 80): { position: number; year: number }[] => {
  const span = Math.max(1e-6, to - from);
  const perYear = width / span;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000];
  const least = unit === "century" ? 100 : unit === "decade" ? 10 : 1;
  const step = steps.find((s) => s >= least && s * perYear >= minLabelPx) ?? steps[steps.length - 1];
  const out: { position: number; year: number }[] = [];
  const first = Math.ceil(fromAstro(from) / step) * step;
  for (let y = first; toAstro(y) <= to + 1e-9 && out.length < 500; y += step) {
    if (y === 0) {
      if (step >= 10 && 1 >= from) out.push({ position: 1, year: 1 }); // no year 0: the tick marks AD 1
      continue;
    }
    if (toAstro(y) >= from - 1e-9) out.push({ position: toAstro(y), year: y });
  }
  return out;
};

/** Lanes for cards of a width on a line, so that they do not overlap: per id the lane, 0 nearest the axis. */
export const assignLanes = (items: { id: string; x: number }[], cardWidth: number, gap = 6) => {
  const rights: number[] = [];
  const lanes: Record<string, number> = {};
  for (const it of [...items].sort((a, b) => a.x - b.x || (a.id < b.id ? -1 : 1))) {
    const left = it.x - cardWidth / 2;
    let lane = rights.findIndex((r) => r + gap <= left);
    if (lane < 0) { lane = rights.length; rights.push(0); }
    rights[lane] = left + cardWidth;
    lanes[it.id] = lane;
  }
  return lanes;
};

/** The view after zooming by a factor around a position, kept within the axis and above a smallest span. */
export const zoomView = (view: [number, number], factor: number, around: number, full: [number, number], minSpan: number): [number, number] => {
  const fullSpan = full[1] - full[0];
  const span = Math.min(fullSpan, Math.max(Math.min(minSpan, fullSpan), (view[1] - view[0]) / factor));
  const ratio = (around - view[0]) / (view[1] - view[0] || 1);
  return clampView([around - ratio * span, around - ratio * span + span], full);
};

/** A view moved back within the axis. */
export const clampView = (view: [number, number], full: [number, number]): [number, number] => {
  const span = Math.min(view[1] - view[0], full[1] - full[0]);
  let from = Math.max(full[0], Math.min(view[0], full[1] - span));
  return [from, from + span];
};
