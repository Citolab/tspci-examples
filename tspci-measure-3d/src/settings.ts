// The data- attributes of the interaction, as text, into checked settings.
import { Built, DEFAULT_SCENE, Scene, TOOLS, Target, Tool, buildScene, correctValue, parseScene, parseTarget } from "./geometry";
import { Language, languageOf, parseNumber } from "./format";

export type Settings = {
  prompt: string;
  scene: Scene;
  built: Built;
  /** The scene is the example: an empty prompt gets the example's question, translated. */
  example: boolean;
  target: Target | null;
  mode: "answer" | "tool";
  tools: Tool[];
  reading: "exact" | "ruler";
  decimals: number;
  tickStep: number;
  angleStep: number;
  unit: string;
  scale: number;
  toolScale: boolean;
  showScale: boolean;
  margin: number;
  scoring: "margin" | "pci";
  requireMeasurement: boolean;
  showPointLabels: boolean;
  height: number;
  language: Language;
};

const isTrue = (v: unknown) => String(v).toLowerCase() === "true";
const numberOr = (v: unknown, fallback: number, min = -Infinity, max = Infinity) => {
  const n = parseNumber(v as string);
  return n === null ? fallback : Math.max(min, Math.min(max, n));
};

/** The tools in the order of TOOLS; none named (or an empty list): all of them. */
export const parseTools = (text: unknown): Tool[] => {
  const words = String(text ?? "").toLowerCase().split(/[\s,;]+/).filter(Boolean);
  const tools = TOOLS.filter((t) => words.includes(t));
  return tools.length ? tools : [...TOOLS];
};

export const parseSettings = (p: Record<string, unknown>): Settings => {
  const scene = parseScene(p.scene);
  const example = scene === DEFAULT_SCENE;
  const built = buildScene(scene);
  return {
    prompt: typeof p.prompt === "string" ? p.prompt : "",
    scene,
    built,
    example,
    target: parseTarget(p.target, example),
    mode: p.mode === "tool" ? "tool" : "answer",
    tools: parseTools(p.tools),
    reading: p.reading === "ruler" ? "ruler" : "exact",
    decimals: Math.round(numberOr(p.decimals, 2, 0, 4)),
    tickStep: numberOr(p.tickStep, 0.1, 0),
    angleStep: numberOr(p.angleStep, 5, 0, 90),
    unit: typeof p.unit === "string" && p.unit.trim() ? p.unit.trim() : "m",
    scale: numberOr(p.scale, 1, 1e-9) || 1,
    toolScale: p.toolScale === undefined ? true : isTrue(p.toolScale),
    showScale: isTrue(p.showScale),
    margin: numberOr(p.margin, 0.05, 0),
    scoring: p.scoring === "pci" ? "pci" : "margin",
    requireMeasurement: isTrue(p.requireMeasurement),
    showPointLabels: p.showPointLabels === undefined ? true : isTrue(p.showPointLabels),
    height: Math.round(numberOr(p.height, 420, 240, 900)),
    language: languageOf(p.language as string),
  };
};

/** The answer to the task in the candidate's unit, or null (no task, or a tool). */
export const correctOf = (s: Settings): number | null => (s.target ? correctValue(s.built, s.target, s.scale) : null);

/** What the tools multiply by: the scale, or 1 when they read the scene's units. */
export const toolFactor = (s: Settings) => (s.toolScale ? s.scale : 1);
