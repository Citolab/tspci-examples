// The settings of the interaction (the data- attributes, as text) and the PCI's own scoring, without imports at run
// time (tested in node: npm test).
import type { PlaneParams, Section, ShapeCode, SolidType } from "./geometry";

export type Control = "move" | "tilt" | "turn" | "handles" | "points" | "hide";
export const CONTROLS: Control[] = ["move", "tilt", "turn", "handles", "points", "hide"];
const SOLIDS: SolidType[] = ["cube", "box", "prism", "pyramid", "cylinder", "cone", "sphere"];

export type Target = {
  /** the shape asked for; null: no target (nothing to score) */
  shape: ShapeCode | null;
  /** only this name counts (a square is then no rectangle) */
  exact: boolean;
  /** side lengths (or diameter, axes) in cm; empty: any size */
  lengths: number[];
  area: number | null;
  /** how far a length (cm) or the area (cm²) may be off */
  margin: number;
  areaMargin: number;
};

export type Settings = {
  solid: SolidType;
  dims: number[];
  baseSides: number;
  mode: "answer" | "tool";
  controls: Set<Control>;
  start: PlaneParams;
  solution: PlaneParams | null;
  target: Target;
  /** "equal" for the shape names, as a share of the longest side, and degrees */
  tolerance: { length: number; angle: number };
  showName: boolean;
  showMeasures: boolean;
  showLabels: boolean;
  language: "en" | "nl";
};

/** A number in text with a point or a comma; null when it is none. */
export const parseNumber = (text: unknown): number | null => {
  if (typeof text === "number") return isFinite(text) ? text : null;
  if (typeof text !== "string" || !text.trim()) return null;
  const n = Number(text.trim().replace(",", "."));
  return isFinite(n) ? n : null;
};

/** Numbers separated by spaces, semicolons or "x"/"by"/"bij" ("4 x 6", "4;6", "4,5 6"). */
export const parseNumbers = (text: unknown): number[] => {
  if (Array.isArray(text)) return text.map(parseNumber).filter((n): n is number => n !== null);
  if (typeof text !== "string") return [];
  return text
    .split(/\s+|;|\s*(?:x|×|by|bij|en|and)\s*/i)
    .map(parseNumber)
    .filter((n): n is number => n !== null);
};

/** A plane as text: "offset tilt turn"; null when it is not three numbers. */
export const parsePlane = (text: unknown): PlaneParams | null => {
  if (typeof text === "string" && text.trim().startsWith("{")) {
    try {
      const o = JSON.parse(text);
      return parsePlane([o.offset, o.tilt, o.turn].join(" "));
    } catch {
      return null;
    }
  }
  const n = parseNumbers(text);
  if (n.length !== 3) return null;
  return { offset: n[0], tilt: Math.max(0, Math.min(90, n[1])), turn: ((n[2] % 360) + 360) % 360 };
};
export const planeText = (p: PlaneParams) => [p.offset, p.tilt, p.turn].map((x) => String(Math.round(x * 1e4) / 1e4)).join(" ");

const isTrue = (v: unknown, fallback: boolean) => (v === undefined || v === null || v === "" ? fallback : String(v).toLowerCase() === "true");

export const TARGETS: ShapeCode[] = [
  "triangle", "equilateralTriangle", "isoscelesTriangle", "rightTriangle",
  "quadrilateral", "trapezium", "isoscelesTrapezium", "kite", "parallelogram", "rhombus", "rectangle", "square",
  "pentagon", "regularPentagon", "hexagon", "regularHexagon", "heptagon", "octagon",
  "circle", "ellipse", "ellipseSegment", "parabolaSegment", "hyperbolaSegment", "curved",
];

export const parseSettings = (p: Record<string, unknown>): Settings => {
  const solid = SOLIDS.includes(String(p.solid ?? "").toLowerCase() as SolidType) ? (String(p.solid).toLowerCase() as SolidType) : "cube";
  const controlsText = String(p.controls ?? CONTROLS.join(" ")).toLowerCase();
  const controls = new Set(CONTROLS.filter((c) => controlsText.split(/[\s,]+/).includes(c)));
  const shape = TARGETS.find((t) => t.toLowerCase() === String(p.targetShape ?? "").trim().toLowerCase()) ?? null;
  const n = Math.round(parseNumber(p.baseSides) ?? 4);
  const tol = parseNumber(p.tolerance);
  return {
    solid,
    dims: parseNumbers(p.dimensions).filter((d) => d > 0),
    baseSides: n >= 3 && n <= 8 ? n : 4,
    mode: String(p.mode ?? "").toLowerCase() === "tool" ? "tool" : "answer",
    controls,
    start: parsePlane(p.plane) ?? { offset: 0, tilt: 0, turn: 0 },
    solution: parsePlane(p.solutionPlane),
    target: {
      shape,
      exact: isTrue(p.exactShape, false),
      lengths: parseNumbers(p.targetLengths).filter((x) => x > 0),
      area: parseNumber(p.targetArea),
      margin: Math.max(0, parseNumber(p.margin) ?? 0.2),
      areaMargin: Math.max(0, parseNumber(p.areaMargin) ?? 0.5),
    },
    tolerance: { length: Math.max(0, Math.min(20, tol ?? 2)) / 100, angle: Math.max(0, Math.min(20, tol ?? 2)) },
    showName: isTrue(p.showName, true),
    showMeasures: isTrue(p.showMeasures, true),
    showLabels: isTrue(p.showLabels, true),
    language: String(p.language ?? "").toLowerCase().startsWith("nl") ? "nl" : "en",
  };
};

/** Every measure near a target length and every target length near a measure. */
export const lengthsMatch = (measures: number[], target: number[], margin: number) =>
  measures.length > 0 && target.length > 0 &&
  measures.every((x) => target.some((t) => Math.abs(x - t) <= margin + 1e-9)) &&
  target.every((t) => measures.some((x) => Math.abs(x - t) <= margin + 1e-9));

export const shapeMatches = (section: Pick<Section, "shape" | "kinds">, target: Target) =>
  target.shape !== null && (target.exact ? section.shape === target.shape : section.kinds.includes(target.shape));

export type CheckName = "shape" | "lengths" | "area";
export type Evaluation = { checks: { name: CheckName; passed: boolean }[]; score: number; maxscore: number; correct: boolean };

/** The author's target against a section: a point for the shape, for the lengths and for the area, when they are set. */
export const evaluate = (target: Target, section: Pick<Section, "shape" | "kinds" | "measures" | "area">): Evaluation => {
  const checks: Evaluation["checks"] = [];
  if (target.shape) checks.push({ name: "shape", passed: shapeMatches(section, target) });
  if (target.lengths.length) checks.push({ name: "lengths", passed: lengthsMatch(section.measures, target.lengths, target.margin) });
  if (target.area !== null) checks.push({ name: "area", passed: section.area > 0 && Math.abs(section.area - target.area) <= target.areaMargin + 1e-9 });
  const score = checks.filter((c) => c.passed).length;
  return { checks, score, maxscore: checks.length, correct: checks.length > 0 && score === checks.length };
};

/** A number for the response: rounded to 2 decimals, language independent. */
export const r2 = (x: number) => Math.round(x * 100) / 100;

/** A number for the candidate: at most `decimals` decimals, a comma in Dutch. */
export const formatNumber = (x: number, language: string, decimals = 2) => {
  const f = Math.pow(10, decimals);
  const v = Math.round(x * f) / f;
  const text = String(Object.is(v, -0) ? 0 : v);
  return language === "nl" ? text.replace(".", ",") : text;
};
