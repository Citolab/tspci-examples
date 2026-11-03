// The geometry, scale, response and scoring of the force arrows. No imports: `npm test` runs it in node.
//
// Units: everything is in centimetres on the drawing ("1 cm" is data-pixels-per-cm pixels on screen), with the
// origin at the top left of the drawing and y downwards, as on paper. Angles are in degrees, counter-clockwise from
// the positive x-axis, as in physics: 0 is to the right, 90 up, 180 to the left, 270 down; always in [0, 360).

export type Point = { x: number; y: number };
/** An arrow: its start (point of application), direction and length, in cm and degrees. */
export type Vector = { x: number; y: number; angle: number; length: number };
/** An arrow the candidate draws: its name and, when the point of application is given, that point. */
export type ArrowDef = {
  /** "F_z": F with a subscript z. */
  label: string;
  /** The given point of application; null: the candidate chooses where the arrow starts. */
  start: Point | null;
  /** The name shown next to the given point ("P"); empty: none. */
  point: string;
};
/** What counts as correct: half the width of the margin around the correct start, angle and length. */
export type Tolerance = { start: number; angle: number; length: number };
/** data-answer: the correct arrows (one per ArrowDef, null: not set yet) and the tolerances. */
export type Answer = { vectors: (Vector | null)[]; tolerance: Tolerance };
export type Bounds = { width: number; height: number };
export type DrawOptions = { bounds: Bounds; angleSnap: number; lengthStep: number };

export const MAX_ARROWS = 6;
/** Shorter than this (cm), a drag is a click: it draws nothing. */
export const MIN_LENGTH = 0.15;
export const DEFAULT_TOLERANCE: Tolerance = { start: 0.3, angle: 5, length: 0.2 };

// The example: a lamp of 30 N hanging from the ceiling, P at its centre of gravity, 1 cm ≙ 10 N (example.ts).
export const EXAMPLE_START: Point = { x: 7, y: 4.75 };
export const defaultArrows = (language = "en"): ArrowDef[] => [
  { label: (language ?? "").slice(0, 2).toLowerCase() === "nl" ? "F_z" : "F_g", start: { ...EXAMPLE_START }, point: "P" },
];
export const DEFAULT_ANSWER: Answer = {
  vectors: [{ ...EXAMPLE_START, angle: 270, length: 3 }],
  tolerance: { ...DEFAULT_TOLERANCE },
};

// --- numbers

export const round = (n: number, decimals: number) => {
  const f = 10 ** decimals;
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? 0 : r;
};
/** In [0, 360), rounded to 0.1°. */
export const normalizeAngle = (angle: number) => {
  const a = round(((angle % 360) + 360) % 360, 1);
  return a >= 360 ? 0 : a;
};
/** The smallest difference between two directions, in [0, 180]. */
export const angleDiff = (a: number, b: number) => {
  const d = Math.abs(normalizeAngle(a) - normalizeAngle(b)) % 360;
  return d > 180 ? 360 - d : d;
};
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const num = (v: unknown, fallback: number) => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
  return finite(n) ? n : fallback;
};
/** A setting as a number: "40", "2,5"; anything else the fallback. */
export const numberSetting = (value: unknown, fallback: number, min = -Infinity, max = Infinity) =>
  Math.min(max, Math.max(min, num(value, fallback)));

/** 1.5 → "1.5" or "1,5" (Dutch), with a fixed number of decimals. */
export const formatNumber = (n: number, decimals: number, language = "en") => {
  const text = round(n, decimals).toFixed(Math.max(0, decimals));
  return (language ?? "").slice(0, 2).toLowerCase() === "nl" ? text.replace(".", ",") : text;
};
/** "F_z" → { main: "F", sub: "z" }; "F_{res}" → { main: "F", sub: "res" }. */
export const labelParts = (label: string) => {
  const [main, ...rest] = (label ?? "").split("_");
  return { main, sub: rest.join("_").replace(/^\{(.*)\}$/, "$1") };
};

// --- geometry

export const endPoint = (v: Vector): Point => {
  const rad = (v.angle * Math.PI) / 180;
  return { x: v.x + v.length * Math.cos(rad), y: v.y - v.length * Math.sin(rad) };
};
export const clampPoint = (p: Point, b: Bounds): Point => ({
  x: Math.min(b.width, Math.max(0, p.x)),
  y: Math.min(b.height, Math.max(0, p.y)),
});
/** How long an arrow from start in this direction can be and still end on the drawing. */
export const maxLength = (start: Point, angle: number, b: Bounds) => {
  const rad = (angle * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = -Math.sin(rad);
  let t = Infinity;
  if (ux > 1e-9) t = Math.min(t, (b.width - start.x) / ux);
  if (ux < -1e-9) t = Math.min(t, -start.x / ux);
  if (uy > 1e-9) t = Math.min(t, (b.height - start.y) / uy);
  if (uy < -1e-9) t = Math.min(t, -start.y / uy);
  return Math.max(0, t);
};
const snapTo = (value: number, step: number) => (step > 0 ? Math.round(value / step) * step : value);

/** A length that fits: on the step grid (rounded down when it has to be shorter), and within the drawing. */
const fitLength = (start: Point, angle: number, length: number, o: DrawOptions) => {
  let l = o.lengthStep > 0 ? snapTo(length, o.lengthStep) : length;
  const max = maxLength(start, angle, o.bounds);
  if (l > max + 1e-9) l = o.lengthStep > 0 ? Math.floor((max + 1e-9) / o.lengthStep) * o.lengthStep : max;
  return Math.max(0, l);
};

/** A start the candidate chooses: on the drawing, on a 0.1 cm (mm) grid, as on paper. */
export const snapStart = (p: Point, b: Bounds): Point => {
  const c = clampPoint(p, b);
  return { x: round(Math.round(c.x * 10) / 10, 1), y: round(Math.round(c.y * 10) / 10, 1) };
};

/** The arrow from start to the pointer: the angle snapped, the length on its step and within the drawing, rounded. */
export const makeVector = (start: Point, end: Point, o: DrawOptions): Vector => {
  const s = clampPoint(start, o.bounds);
  const dx = end.x - s.x;
  const dy = end.y - s.y;
  let angle = normalizeAngle((Math.atan2(-dy, dx) * 180) / Math.PI);
  if (o.angleSnap > 0) angle = normalizeAngle(snapTo(angle, o.angleSnap));
  return tidy({ x: s.x, y: s.y, angle, length: fitLength(s, angle, Math.hypot(dx, dy), o) });
};

/** Rounded as the response reports it: 0.01 cm, 0.1°. */
export const tidy = (v: Vector): Vector => ({
  x: round(v.x, 2),
  y: round(v.y, 2),
  angle: normalizeAngle(v.angle),
  length: round(v.length, 2),
});

/** The steps of the keyboard: the angle snap (or 1°), and the length step (or 0.1 cm); shift for bigger ones. */
export const keySteps = (o: DrawOptions, big: boolean) => {
  const angle = o.angleSnap > 0 ? o.angleSnap : 1;
  const length = o.lengthStep > 0 ? o.lengthStep : 0.1;
  return { angle: big ? Math.max(15, angle) : angle, length: big ? Math.max(1, length) : length, move: big ? 1 : 0.1 };
};

export type Nudge =
  | { kind: "rotate"; direction: 1 | -1 } // 1: counter-clockwise
  | { kind: "length"; direction: 1 | -1 }
  | { kind: "move"; dx: number; dy: number }; // in steps, screen directions

/** One key press on an arrow: a step (shift: a big step), on the grid of the small step. */
export const nudge = (v: Vector, n: Nudge, o: DrawOptions, big = false): Vector => {
  const small = keySteps(o, false);
  const s = keySteps(o, big);
  if (n.kind === "rotate") {
    const angle = normalizeAngle(snapTo(v.angle + n.direction * s.angle, small.angle));
    return tidy({ ...v, angle, length: fitLength(v, angle, v.length, { ...o, lengthStep: 0 }) });
  }
  if (n.kind === "length") {
    const length = Math.max(small.length, snapTo(v.length + n.direction * s.length, small.length));
    return tidy({ ...v, length: Math.min(length, maxLength(v, v.angle, o.bounds)) });
  }
  const start = clampPoint({ x: v.x + n.dx * s.move, y: v.y + n.dy * s.move }, o.bounds);
  return tidy({ ...start, angle: v.angle, length: fitLength(start, v.angle, v.length, { ...o, lengthStep: 0 }) });
};

/** The first arrow key on an arrow that is not drawn yet: 1 cm in that direction (or as far as fits). */
export const firstVector = (start: Point, angle: number, o: DrawOptions): Vector => {
  const s = clampPoint(start, o.bounds);
  const a = normalizeAngle(angle);
  return tidy({ ...s, angle: a, length: Math.min(1, maxLength(s, a, o.bounds)) });
};

// --- settings

const point = (v: unknown): Point | null => {
  if (Array.isArray(v) && v.length >= 2 && finite(v[0]) && finite(v[1])) return { x: v[0], y: v[1] };
  if (v && typeof v === "object" && finite((v as Point).x) && finite((v as Point).y)) return { x: (v as Point).x, y: (v as Point).y };
  return null;
};

/** data-arrows: `[{ "label": "F_z", "start": [7, 4.75], "point": "P" }]`, start null for a free start. Empty or not readable: the example. */
export const parseArrows = (text: string, language = "en"): ArrowDef[] => {
  try {
    const raw = text?.trim() ? JSON.parse(text) : null;
    if (Array.isArray(raw) && raw.length) {
      return raw.slice(0, MAX_ARROWS).map((a, i) => ({
        label: typeof a?.label === "string" ? a.label : `F_${i + 1}`,
        start: point(a?.start),
        point: typeof a?.point === "string" ? a.point : a?.start ? "P" : "",
      }));
    }
  } catch {
    // not JSON: the example
  }
  return defaultArrows(language);
};
export const serializeArrows = (defs: ArrowDef[]) =>
  JSON.stringify(defs.map((d) => ({ label: d.label, start: d.start ? [round(d.start.x, 2), round(d.start.y, 2)] : null, point: d.point })));

/** A vector from a setting or a saved state: [x, y, angle, length] or { x, y, angle, length }; null when it is not one. */
export const readVector = (v: unknown): Vector | null => {
  if (Array.isArray(v) && v.length >= 4 && v.slice(0, 4).every(finite)) return tidy({ x: v[0], y: v[1], angle: v[2], length: v[3] });
  const o = v as Vector;
  if (o && typeof o === "object" && [o.x, o.y, o.angle, o.length].every(finite)) return tidy(o);
  return null;
};

/**
 * data-answer: `{ "vectors": [[7, 4.75, 270, 3]], "tolerance": { "start": 0.3, "angle": 5, "length": 0.2 } }`, one
 * vector per arrow as [x, y, angle, length]. Empty, with the example's arrows: the example's answer.
 */
export const parseAnswer = (text: string, arrowsText: string, count: number): Answer => {
  let raw: any = null;
  try {
    raw = text?.trim() ? JSON.parse(text) : null;
  } catch {
    raw = null;
  }
  if (!raw && !arrowsText?.trim()) return { vectors: DEFAULT_ANSWER.vectors.map((v) => ({ ...v })), tolerance: { ...DEFAULT_TOLERANCE } };
  const vectors = Array.from({ length: count }, (_, i) => readVector(raw?.vectors?.[i]));
  const t = raw?.tolerance ?? {};
  return {
    vectors,
    tolerance: {
      start: numberSetting(t.start, DEFAULT_TOLERANCE.start, 0),
      angle: numberSetting(t.angle, DEFAULT_TOLERANCE.angle, 0, 180),
      length: numberSetting(t.length, DEFAULT_TOLERANCE.length, 0),
    },
  };
};
export const serializeAnswer = (a: Answer) =>
  JSON.stringify({ vectors: a.vectors.map((v) => (v ? [v.x, v.y, v.angle, v.length] : null)), tolerance: a.tolerance });

// --- the response: ordered float, [x, y, angle, length] per arrow

/** The response values, four per arrow; an arrow not drawn is [x, y, 0, 0] at its given start (or 0, 0). Nothing drawn: null. */
export const toResponse = (arrows: (Vector | null)[], defs: ArrowDef[]): number[] | null => {
  if (!arrows.some(Boolean)) return null;
  return defs.flatMap((d, i) => {
    const v = arrows[i];
    if (v) return [v.x, v.y, v.angle, v.length];
    return [round(d.start?.x ?? 0, 2), round(d.start?.y ?? 0, 2), 0, 0];
  });
};
/** Back from the response: four values per arrow, length 0 is not drawn. */
export const fromResponse = (values: unknown, count: number): (Vector | null)[] => {
  const list = Array.isArray(values) ? values.map((v) => num(v, NaN)) : [];
  return Array.from({ length: count }, (_, i) => {
    const v = readVector(list.slice(i * 4, i * 4 + 4));
    return v && v.length > 0 ? v : null;
  });
};
/** The correct response for these settings (getCorrectResponse); undefined while an arrow has no correct one. */
export const correctValues = (defs: ArrowDef[], answer: Answer): number[] | undefined => {
  const vectors = defs.map((d, i) => {
    const v = answer.vectors[i];
    return v && d.start ? tidy({ ...v, x: d.start.x, y: d.start.y }) : v;
  });
  return vectors.every((v) => v && v.length > 0) ? toResponse(vectors, defs) : undefined;
};

// --- scoring, as the response processing of the README does it

export type ArrowScore = { pointAndDirection: boolean; length: boolean };
const EPS = 1e-9;

/** The rubric per arrow: the right point of application and direction (1 point), the right length (1 point). */
export const scoreVector = (v: Vector | null, correct: Vector, t: Tolerance): ArrowScore => {
  if (!v || v.length <= 0) return { pointAndDirection: false, length: false };
  const dx = v.x - correct.x;
  const dy = v.y - correct.y;
  const start = dx * dx + dy * dy <= t.start * t.start + EPS;
  return {
    pointAndDirection: start && angleDiff(v.angle, correct.angle) <= t.angle + EPS,
    length: Math.abs(v.length - correct.length) <= t.length + EPS,
  };
};
/** The score of all arrows: 2 points per arrow. */
export const score = (arrows: (Vector | null)[], answer: Answer) =>
  answer.vectors.reduce(
    (acc, correct, i) => {
      if (!correct) return acc;
      const s = scoreVector(arrows[i] ?? null, correct, answer.tolerance);
      return { score: acc.score + Number(s.pointAndDirection) + Number(s.length), max: acc.max + 2 };
    },
    { score: 0, max: 0 }
  );

// --- the response processing for an item, from the answer (the authoring mode shows it)

const f = (n: number) => String(round(n, 4));
/**
 * The QTI 3 outcome declarations and response processing that score like the rubric: per arrow 1 point for the point
 * of application and the direction, 1 for the length, within the tolerances.
 */
export const responseProcessingXml = (answer: Answer, responseIdentifier = "RESPONSE") => {
  const r = `<qti-variable identifier="${responseIdentifier}"/>`;
  const idx = (n: number) => `<qti-index n="${n}">${r}</qti-index>`;
  const val = (n: number) => `<qti-base-value base-type="float">${f(n)}</qti-base-value>`;
  const addOne = [
    `      <qti-set-outcome-value identifier="SCORE">`,
    `        <qti-sum><qti-variable identifier="SCORE"/><qti-base-value base-type="float">1</qti-base-value></qti-sum>`,
    `      </qti-set-outcome-value>`,
  ];
  const rules: string[] = [];
  let max = 0;
  answer.vectors.forEach((v, i) => {
    if (!v) return;
    max += 2;
    const b = i * 4;
    const t = answer.tolerance;
    const square = (n: number, c: number) =>
      `<qti-power><qti-subtract>${idx(b + n)}${val(c)}</qti-subtract><qti-base-value base-type="integer">2</qti-base-value></qti-power>`;
    const angle = (c: number) => `<qti-equal tolerance-mode="absolute" tolerance="${f(t.angle)}">${idx(b + 3)}${val(c)}</qti-equal>`;
    rules.push(
      `  <!-- arrow ${i + 1}: the point of application (within ${f(t.start)} cm) and the direction (within ${f(t.angle)}°) -->`,
      `  <qti-response-condition>`,
      `    <qti-response-if>`,
      `      <qti-and>`,
      `        <qti-gt>${idx(b + 4)}<qti-base-value base-type="float">0</qti-base-value></qti-gt>`,
      `        <qti-lte><qti-sum>${square(1, v.x)}${square(2, v.y)}</qti-sum>${val(t.start * t.start)}</qti-lte>`,
      `        <qti-or>${angle(v.angle)}${angle(v.angle - 360)}${angle(v.angle + 360)}</qti-or>`,
      `      </qti-and>`,
      ...addOne,
      `    </qti-response-if>`,
      `  </qti-response-condition>`,
      `  <!-- arrow ${i + 1}: the length (${f(v.length - t.length)} cm to ${f(v.length + t.length)} cm) -->`,
      `  <qti-response-condition>`,
      `    <qti-response-if>`,
      `      <qti-equal tolerance-mode="absolute" tolerance="${f(t.length)}">${idx(b + 4)}${val(v.length)}</qti-equal>`,
      ...addOne,
      `    </qti-response-if>`,
      `  </qti-response-condition>`
    );
  });
  return [
    `<qti-outcome-declaration identifier="SCORE" cardinality="single" base-type="float">`,
    `  <qti-default-value><qti-value>0</qti-value></qti-default-value>`,
    `</qti-outcome-declaration>`,
    `<qti-outcome-declaration identifier="MAXSCORE" cardinality="single" base-type="float">`,
    `  <qti-default-value><qti-value>${max}</qti-value></qti-default-value>`,
    `</qti-outcome-declaration>`,
    `…`,
    `<qti-response-processing>`,
    ...rules,
    `</qti-response-processing>`,
  ].join("\n");
};
