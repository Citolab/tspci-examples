// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Trainpci and
// https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Relatempci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The item's settings (data- attributes, all text) → what the simulation works with, every value checked and with a
// sensible fallback; the questions and their key; scoring. No imports but the model: `npm test` runs it in node.

import { FRAMES, POINTS, SCENES, SHAPES, shapeOf } from "./model.ts";
import type { FrameId, Motion, PointId, Scene, Shape } from "./model.ts";

export type Language = "en" | "nl" | "fr";
export type Kind = "trajectory" | "motion";
/** A question: the trajectory of a point in a frame (a shape), or whether it moves relative to the frame's observer. */
export type Question = { id: string; kind: Kind; point: PointId; frame: FrameId; key: string };

export const RATES = [0.25, 0.5, 1, 2] as const;

export type Settings = Motion & {
  /** the frames the candidate can choose, in this order */
  frames: FrameId[];
  /** the points whose trajectory the candidate can trace */
  points: PointId[];
  startFrame: FrameId;
  /** the points traced at the start */
  traced: PointId[];
  /** whether the second observer is in the scene (one of the frames, points or questions needs it) */
  hasSecond: boolean;
  autoplay: boolean;
  rate: number;
  questions: Question[];
  /** the shapes the candidate chooses from, in the order of SHAPES (every key is among them) */
  shapeOptions: Shape[];
  language: Language;
};

const num = (text: unknown): number | null => {
  if (typeof text === "number") return isFinite(text) ? text : null;
  if (typeof text !== "string") return null;
  const clean = text.trim().replace(/−/g, "-").replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(clean)) return null;
  return Number(clean);
};

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => {
  const text = String(value ?? "").trim().toLowerCase();
  return options.find((o) => o.toLowerCase() === text) ?? fallback;
};

/** "ground; vehicle", "ground,vehicle", one per line → the known ids, in the given order, without doubles. */
export const parseIds = <T extends string>(value: unknown, known: readonly T[]): T[] => {
  const parts = String(value ?? "").split(/[;,\s]+/).map((p) => p.trim().toLowerCase()).filter(Boolean);
  return [...new Set(parts.map((p) => known.find((k) => k === p)).filter((p): p is T => !!p))];
};

const MOTION_ANSWERS = ["moves", "rest"] as const;

/**
 * "rim@ground; rim@vehicle=circle" (or one per line) → questions. Without "=answer" the key is what the motion gives;
 * with it, the author's key (a shape for a trajectory question, moves or rest for a motion question). Unknown points,
 * frames or answers are left out.
 */
export const parseQuestions = (value: unknown, kind: Kind, motion: Motion): Question[] => {
  const questions: Question[] = [];
  for (const part of String(value ?? "").split(/[;\n]/)) {
    const match = /^\s*([a-z]+)\s*@\s*([a-z]+)\s*(?:=\s*([a-z]+)\s*)?$/i.exec(part);
    if (!match) continue;
    const point = POINTS.find((p) => p === match[1].toLowerCase());
    const frame = FRAMES.find((f) => f === match[2].toLowerCase());
    if (!point || !frame) continue;
    const shape = shapeOf(point, frame, motion);
    const computed = kind === "trajectory" ? shape : shape === "rest" ? "rest" : "moves";
    const given = match[3]?.toLowerCase();
    const allowed: readonly string[] = kind === "trajectory" ? SHAPES : MOTION_ANSWERS;
    if (given && !allowed.includes(given)) continue;
    const id = `${point}@${frame}`;
    if (questions.some((q) => q.id === id)) continue;
    questions.push({ id, kind, point, frame, key: given ?? computed });
  }
  return questions;
};

const bool = (value: unknown, fallback: boolean) => {
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" ? true : text === "false" ? false : fallback;
};

export const languageOf = (value: unknown): Language => {
  const code = String(value ?? "").slice(0, 2).toLowerCase();
  return code === "nl" || code === "fr" ? code : "en";
};

export const parseSettings = (p: Record<string, unknown>): Settings => {
  const scene: Scene = oneOf(p.scene, SCENES, "train");
  const turns = Math.min(4, Math.max(1, Math.round(num(p.turns) ?? 2)));
  const speed = num(p.secondSpeed);
  const secondSpeed = speed === null ? 0.5 : Math.min(2, Math.max(-1, speed));
  const motion: Motion = { scene, turns, secondSpeed };

  let frames = parseIds(p.frames, FRAMES);
  if (!frames.length) frames = ["ground", "vehicle"];
  let points = parseIds(p.points, POINTS);
  if (!points.length) points = ["rim", "hub", "passenger", "bystander"];
  const questions = [
    ...parseQuestions(p.trajectoryQuestions, "trajectory", motion),
    ...parseQuestions(p.motionQuestions, "motion", motion),
  ];
  // the same point@frame as a trajectory and as a motion question: two questions with their own id
  const seen = new Set<string>();
  for (const q of questions) {
    if (seen.has(q.id)) q.id = `${q.id}:${q.kind}`;
    seen.add(q.id);
  }
  const hasSecond =
    frames.includes("second") || points.includes("second") || questions.some((q) => q.point === "second" || q.frame === "second");

  const wanted = parseIds(p.shapeOptions, SHAPES);
  const options = new Set<Shape>(wanted.length ? wanted : ["rest", "line", "circle", "cycloid"]);
  questions.filter((q) => q.kind === "trajectory").forEach((q) => options.add(q.key as Shape));
  const rate = num(p.rate);

  return {
    ...motion,
    frames,
    points,
    startFrame: oneOf(p.startFrame, frames, frames[0]),
    traced: parseIds(p.traced, POINTS).filter((t) => points.includes(t)),
    hasSecond,
    autoplay: bool(p.autoplay, false),
    rate: RATES.find((r) => r === rate) ?? 1,
    questions,
    shapeOptions: SHAPES.filter((s) => options.has(s)),
    language: languageOf(p.language),
  };
};

/** The answers as "rim@ground=cycloid;rim@vehicle=circle", in the order of the questions; unanswered ones left out. */
export const answersText = (s: Settings, answers: Record<string, string>) =>
  s.questions.filter((q) => answers[q.id]).map((q) => `${q.id}=${answers[q.id]}`).join(";");

/** Back from answersText: only the questions of these settings, with an answer they allow. */
export const parseAnswers = (s: Settings, text: unknown): Record<string, string> => {
  const answers: Record<string, string> = {};
  for (const part of String(text ?? "").split(";")) {
    const at = part.lastIndexOf("=");
    if (at < 0) continue;
    const id = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim().toLowerCase();
    const q = s.questions.find((x) => x.id === id);
    const allowed: readonly string[] = q?.kind === "trajectory" ? s.shapeOptions : MOTION_ANSWERS;
    if (q && allowed.includes(value)) answers[id] = value;
  }
  return answers;
};

export const scoreOf = (s: Settings, answers: Record<string, string>) => {
  const score = s.questions.filter((q) => answers[q.id] === q.key).length;
  return { score, maxscore: s.questions.length, correct: s.questions.length > 0 && score === s.questions.length };
};

/** The key as answers: for the solution status. */
export const keyAnswers = (s: Settings) => Object.fromEntries(s.questions.map((q) => [q.id, q.key]));

/** "frame:point" pairs → "ground:rim,hub;vehicle" (frames and points in their fixed order; a frame played without traces has no colon). */
export const viewedText = (seen: string[]) =>
  FRAMES.filter((f) => seen.some((e) => e.split(":")[0] === f))
    .map((f) => {
      const points = POINTS.filter((p) => seen.includes(`${f}:${p}`));
      return points.length ? `${f}:${points.join(",")}` : f;
    })
    .join(";");

/** Back from viewedText. */
export const parseViewed = (text: unknown): string[] => {
  const seen: string[] = [];
  for (const part of String(text ?? "").split(";")) {
    const [frame, points] = part.split(":");
    const f = FRAMES.find((x) => x === frame?.trim());
    if (!f) continue;
    seen.push(`${f}:`);
    for (const p of String(points ?? "").split(",")) {
      const id = POINTS.find((x) => x === p.trim());
      if (id) seen.push(`${f}:${id}`);
    }
  }
  return seen;
};

/** 0.5 → "0.5" (en) or "0,5" (nl, fr); a real minus sign. */
export const formatNumber = (value: number, decimals: number, language: Language) => {
  let text = value.toFixed(decimals);
  if (/^-0(\.0*)?$/.test(text)) text = text.slice(1);
  text = text.replace("-", "−");
  return language === "en" ? text : text.replace(".", ",");
};
