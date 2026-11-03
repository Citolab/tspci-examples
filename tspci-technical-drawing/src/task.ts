// The task around the drawing, without the DOM (tested in node: test/task.test.ts): the author's settings (data-drawing),
// numbers in English and Dutch, the candidate's lines on the grid and the PCI's checks of them. It gets what it needs
// of the workpiece (dimensions, the lines of a view) as arguments, so it imports nothing.
import type { Dim, Feature, LineKind, Seg, ViewName } from "./model";

export type TaskType = "dimensions" | "read" | "complete" | "view" | "model";
export const TASK_TYPES: TaskType[] = ["dimensions", "read", "complete", "view", "model"];
export type DimState = "show" | "hide" | "ask";
export type Question = { text: string; dim: string };
export type Points = { visible: number; hidden: number; extra: number };

/** data-drawing: the workpiece and everything about the task. */
export type Drawing = {
  features: Feature[];
  /** what the author changed about the dimensions: shown, hidden or asked (an empty field on the drawing) */
  dims: Record<string, DimState>;
  /** read: questions about the drawing, each answered with the value of a dimension */
  questions: Question[];
  /** complete: the view the candidate completes, the grid and which lines are left out ("all", or segment keys) */
  complete: { view: ViewName; grid: number; remove: "all" | string[]; points: Points };
  /** view: the view the candidate names */
  identify: { view: ViewName };
  /** model: the other workpieces to choose from, and where the drawn one is among them (0 = A) */
  options: Feature[][];
  correct: number;
};

/** The example's dimensions per task: asked, or hidden so that they have to be worked out from the others. */
export const DEFAULT_DIMS: Record<TaskType, Record<string, DimState>> = {
  dimensions: { "1.width": "ask", "2.depth": "ask", "3.a": "ask" },
  read: { "2.depth": "hide", "2.rest": "show", "3.aOther": "hide" },
  complete: {},
  view: {},
  model: {},
};
/** The example's questions (read): an empty text asks for the dimension by its name. */
export const DEFAULT_QUESTIONS: Question[] = [{ text: "", dim: "2.depth" }, { text: "", dim: "3.aOther" }];

export const DEFAULT_DRAWING_TASK: Omit<Drawing, "features"> = {
  dims: DEFAULT_DIMS.dimensions,
  questions: [],
  complete: {
    view: "front", grid: 5,
    remove: ["hidden:0,20,40,20", "hidden:45,0,45,15", "hidden:55,0,55,15", "visible:40,15,40,30", "visible:40,15,60,15", "visible:60,0,60,15"],
    points: { visible: 1, hidden: 1, extra: 1 },
  },
  identify: { view: "left" },
  options: [],
  correct: 1,
};

const VIEWS: ViewName[] = ["front", "top", "left"];
const positive = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const count = (v: unknown, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 10) : fallback;
};

/**
 * The task part of data-drawing. `parseFeatures` (model.ts) turns raw features into features; the PCI passes it in.
 */
export const parseTask = (raw: any, parseFeatures: (raw: unknown) => Feature[], task: TaskType = "dimensions"): Drawing => {
  const d = DEFAULT_DRAWING_TASK;
  const hasTask = !!raw && typeof raw === "object";
  const dims: Record<string, DimState> = {};
  const rawDims = hasTask && raw.dims && typeof raw.dims === "object" ? raw.dims : hasTask ? {} : DEFAULT_DIMS[task];
  for (const [id, state] of Object.entries(rawDims)) if (state === "show" || state === "hide" || state === "ask") dims[id] = state;
  const c = hasTask && raw.complete && typeof raw.complete === "object" ? raw.complete : {};
  const points = c.points && typeof c.points === "object" ? c.points : {};
  return {
    features: parseFeatures(hasTask ? raw.features : undefined),
    dims,
    questions: Array.isArray(raw?.questions)
      ? raw.questions.filter((q: any) => q && typeof q === "object").map((q: any) => ({ text: String(q.text ?? ""), dim: String(q.dim ?? "") }))
      : hasTask ? [] : DEFAULT_QUESTIONS.map((q) => ({ ...q })),
    complete: {
      view: VIEWS.includes(c.view) ? c.view : d.complete.view,
      grid: positive(c.grid, d.complete.grid),
      remove: c.remove === "all" ? "all" : Array.isArray(c.remove) ? c.remove.map(String) : hasTask ? [] : [...(d.complete.remove as string[])],
      points: { visible: count(points.visible, 1), hidden: count(points.hidden, 1), extra: count(points.extra, 1) },
    },
    identify: { view: VIEWS.includes(raw?.identify?.view) ? raw.identify.view : d.identify.view },
    options: Array.isArray(raw?.options) ? raw.options.filter(Array.isArray).map((o: unknown[]) => parseFeatures(o)) : [],
    correct: count(raw?.correct, hasTask ? 0 : d.correct),
  };
};

export const parseDrawing = (text: string | undefined, parseFeatures: (raw: unknown) => Feature[], task: TaskType = "dimensions"): Drawing => {
  let raw: any = null;
  if (text && text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      raw = null;
    }
  }
  return parseTask(raw, parseFeatures, task);
};

export const parseTaskType = (value: unknown): TaskType => (TASK_TYPES.includes(value as TaskType) ? (value as TaskType) : "dimensions");

/** Shown, hidden or asked: the author's choice, else shown for a standard dimension and hidden for an extra one. */
export const dimState = (drawing: Drawing, dim: Dim): DimState => drawing.dims[dim.id] ?? (dim.standard ? "show" : "hide");

/**
 * What the candidate answers with numbers, in order: the dimensions asked on the drawing (dimensions task) or the
 * questions (read task), each with the dimension that holds the answer.
 */
export const askedOf = (task: TaskType, drawing: Drawing, dims: Dim[]): { dim: Dim; question?: string }[] => {
  if (task === "dimensions") return dims.filter((d) => dimState(drawing, d) === "ask").map((dim) => ({ dim }));
  if (task === "read") {
    return drawing.questions.flatMap((q) => {
      const dim = dims.find((d) => d.id === q.dim);
      return dim ? [{ dim, question: q.text }] : [];
    });
  }
  return [];
};

// ---------------------------------------------------------------------------------------------------------------------
// Numbers

/** A number as the candidate types it: 12.5 or 12,5 (no thousands separators); null when it is not one. */
export const parseNumber = (text: string): number | null => {
  const t = text.trim().replace(/\s+/g, "").replace(/mm$/i, "").replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** A number for the candidate: at most two decimals, a decimal comma in Dutch. */
export const formatNumber = (value: number, language: string) => {
  const s = String(Math.round(value * 100) / 100);
  return language === "nl" ? s.replace(".", ",") : s;
};

/** Whether typed text could become a number (for beforeinput): digits and one decimal separator. */
export const allowedInput = (text: string) => /^[-+]?\d*[.,]?\d*$/.test(text.trim());

// ---------------------------------------------------------------------------------------------------------------------
// Lines on the grid

export type Line = { kind: LineKind; a: [number, number]; b: [number, number] };

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** A line with its endpoints in a fixed order: left to right, then bottom to top. */
export const normalized = (l: Line): Line => {
  const swap = l.a[0] > l.b[0] || (l.a[0] === l.b[0] && l.a[1] > l.b[1]);
  return swap ? { kind: l.kind, a: l.b, b: l.a } : l;
};

/** Whether a point lies on the grid (within a hundredth of a mm). */
export const onGrid = (p: [number, number], grid: number) =>
  p.every((v) => Math.abs(v / grid - Math.round(v / grid)) * grid < 0.01);

/**
 * A line on the grid as its smallest steps from grid point to grid point ("visible:2,0,0,1" is a step from grid point
 * (2, 0) one up). Two drawings with the same steps are the same drawing, however they were drawn. Null: not on the grid.
 */
export const stepsOf = (line: Line, grid: number): string[] | null => {
  if (!onGrid(line.a, grid) || !onGrid(line.b, grid)) return null;
  const l = normalized(line);
  const [ax, ay] = l.a.map((v) => Math.round(v / grid));
  const [bx, by] = l.b.map((v) => Math.round(v / grid));
  const dx = bx - ax, dy = by - ay;
  const n = gcd(dx, dy);
  if (n === 0) return [];
  const sx = dx / n, sy = dy / n;
  return Array.from({ length: n }, (_, i) => `${l.kind}:${ax + i * sx},${ay + i * sy},${sx},${sy}`);
};

/** The steps of a step key, back as a line in mm. */
const stepLine = (key: string, grid: number): Line => {
  const [kind, rest] = key.split(":");
  const [x, y, sx, sy] = rest.split(",").map(Number);
  return { kind: kind as LineKind, a: [x * grid, y * grid], b: [(x + sx) * grid, (y + sy) * grid] };
};

/**
 * Lines as text, the same for the same drawing: every line merged with the lines that continue it, sorted.
 * "V0,0,60,0;H5,0,5,20": V a visible line, H a hidden one, coordinates in mm from the view's bottom left corner.
 */
export const canonicalLines = (lines: Line[], grid: number): string => {
  const steps = new Set(lines.flatMap((l) => stepsOf(l, grid) ?? []));
  // group the steps by the line they lie on, and join the ones that touch
  const groups = new Map<string, { kind: string; sx: number; sy: number; starts: { x: number; y: number }[] }>();
  for (const key of steps) {
    const [kind, rest] = key.split(":");
    const [x, y, sx, sy] = rest.split(",").map(Number);
    // the line through (x, y) in direction (sx, sy): its offset sy·x − sx·y is the same for every point on it
    const g = `${kind}|${sx},${sy}|${sy * x - sx * y}`;
    if (!groups.has(g)) groups.set(g, { kind, sx, sy, starts: [] });
    groups.get(g)!.starts.push({ x, y });
  }
  const parts: string[] = [];
  for (const { kind, sx, sy, starts } of groups.values()) {
    const along = (p: { x: number; y: number }) => (sx !== 0 ? p.x / sx : p.y / sy);
    starts.sort((p, q) => along(p) - along(q));
    let first = starts[0], last = starts[0];
    const flush = () => parts.push(`${kind === "visible" ? "V" : "H"}${r2(first.x * grid)},${r2(first.y * grid)},${r2((last.x + sx) * grid)},${r2((last.y + sy) * grid)}`);
    for (let i = 1; i < starts.length; i++) {
      if (Math.abs(along(starts[i]) - along(last) - 1) < 1e-9) last = starts[i];
      else { flush(); first = last = starts[i]; }
    }
    flush();
  }
  return parts.sort().join(";");
};

/** "V0,0,60,0;H5,0,5,20" back as lines. */
export const parseLines = (text: string): Line[] =>
  String(text ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => /^[VH]-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+$/.test(part))
    .map((part) => {
      const [x1, y1, x2, y2] = part.slice(1).split(",").map(Number);
      return { kind: part[0] === "V" ? "visible" : "hidden", a: [x1, y1], b: [x2, y2] } as Line;
    });

/** Whether line `l` lies on segment `s` (same kind, within a hundredth of a mm). */
const liesOn = (l: Line, s: Seg | Line) => {
  if (l.kind !== s.kind) return false;
  const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return false;
  const at = (p: [number, number]) => {
    const distance = Math.abs((p[0] - s.a[0]) * dy - (p[1] - s.a[1]) * dx) / len;
    const t = ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / (len * len);
    return distance < 0.01 && t > -0.01 / len && t < 1 + 0.01 / len;
  };
  return at(l.a) && at(l.b);
};

/** The lines of the view the candidate has to draw: every line, or the ones the author left out. */
export const missingSegs = (segs: Seg[], remove: "all" | string[], segKey: (s: Seg) => string): Seg[] =>
  remove === "all" ? segs : segs.filter((s) => remove.includes(segKey(s)));

export type DrawingCheck = {
  /** every visible line that was left out is drawn, as a visible line (null: no visible line was left out) */
  visibleOk: boolean | null;
  hiddenOk: boolean | null;
  /** every line the candidate drew is a line of the view, of the same kind (and there is at least one) */
  noExtra: boolean;
  /** the steps drawn that are not part of the view */
  extra: Line[];
  score: number;
  maxscore: number;
  correct: boolean;
};

/**
 * The PCI's checks of a drawing: `view` the lines of the full view, `missing` the ones the candidate has to draw (all
 * on the grid), `drawn` the candidate's lines.
 */
export const checkDrawing = (view: Seg[], missing: Seg[], drawn: Line[], grid: number, points: Points): DrawingCheck => {
  const drawnSteps = new Set(drawn.flatMap((l) => stepsOf(l, grid) ?? []));
  const covered = (kind: LineKind): boolean | null => {
    const wanted = missing.filter((s) => s.kind === kind).flatMap((s) => stepsOf(s as Line, grid) ?? []);
    return wanted.length ? wanted.every((k) => drawnSteps.has(k)) : null;
  };
  const visibleOk = covered("visible");
  const hiddenOk = covered("hidden");
  const extra = [...drawnSteps].map((k) => stepLine(k, grid)).filter((l) => !view.some((s) => liesOn(l, s)));
  const noExtra = drawnSteps.size > 0 && extra.length === 0;
  let score = 0, maxscore = 0;
  if (visibleOk !== null) { maxscore += points.visible; if (visibleOk) score += points.visible; }
  if (hiddenOk !== null) { maxscore += points.hidden; if (hiddenOk) score += points.hidden; }
  maxscore += points.extra;
  if (noExtra) score += points.extra;
  return { visibleOk, hiddenOk, noExtra, extra, score, maxscore, correct: visibleOk !== false && hiddenOk !== false && noExtra };
};

/** What is wrong with the lines to complete: none left out, or one that is not on the grid. */
export const completeProblems = (missing: Seg[], arcsLeftOut: boolean, grid: number): ("none" | "offGrid" | "arcs")[] => {
  const problems: ("none" | "offGrid" | "arcs")[] = [];
  if (!missing.length) problems.push("none");
  if (missing.some((s) => !onGrid(s.a, grid) || !onGrid(s.b, grid))) problems.push("offGrid");
  if (arcsLeftOut) problems.push("arcs");
  return problems;
};

/** The options of the model task in order (A, B, …): the distractors with the drawn workpiece at its place. */
export const optionsOf = (drawing: Drawing): Feature[][] => {
  const list = [...drawing.options];
  const at = Math.min(drawing.correct, list.length);
  list.splice(at, 0, drawing.features);
  return list;
};
export const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** Answers in the PCI's scoring (data-scoring="pci"): each value right within the margin. */
export const scoreValues = (values: (number | null)[], correct: number[], tolerance: number) => {
  const results = correct.map((c, i) => values[i] !== null && values[i] !== undefined && Math.abs((values[i] as number) - c) <= tolerance + 1e-9);
  const score = results.filter(Boolean).length;
  return { results, score, maxscore: correct.length, correct: correct.length > 0 && score === correct.length };
};
