// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Volcanismepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The model behind the simulation, without a UI: the settings, the rule table that decides the outcome of an
// experiment, the eruption type of an outcome, and the scoring of the matching task. No imports: `npm test` runs it in
// node.

export type Viscosity = "fluid" | "medium" | "compact";
export type Outcome = "flow" | "dome" | "explosion";
export type Eruption = "effusive" | "explosive";
export type Language = "en" | "nl" | "fr";
export type Task = "none" | "viscosity" | "eruption";

export const VISCOSITIES: Viscosity[] = ["fluid", "medium", "compact"];
export const OUTCOMES: Outcome[] = ["flow", "dome", "explosion"];
export const ERUPTIONS: Eruption[] = ["effusive", "explosive"];

/** One line of the rule table: a viscosity, optionally a number of tablets (exactly n, or n or more), an outcome. */
export type Rule = { viscosity: Viscosity; tablets: number | null; atLeast: boolean; outcome: Outcome };

/** An experiment the candidate ran. */
export type Experiment = { viscosity: Viscosity; tablets: number; outcome: Outcome; eruption: Eruption };

export const DEFAULT_RULES = "fluid = flow; medium = flow; medium 3+ = explosion; compact = dome; compact 2+ = explosion";
export const DEFAULT_ERUPTIONS = "flow = effusive; dome = explosive; explosion = explosive";

export type Settings = {
  /** the viscosities the candidate can choose, from fluid to compact */
  viscosities: Viscosity[];
  /** 1: always one tablet (as in the original); more: the candidate chooses 1 to maxTablets */
  maxTablets: number;
  rules: Rule[];
  eruptionOf: Record<Outcome, Eruption>;
  showEruption: boolean;
  task: Task;
  /** the accepted answers per outcome of the task */
  key: Partial<Record<Outcome, string[]>>;
  /** auto: smooth, or step by step when the candidate prefers reduced motion; steps: always step by step */
  animation: "auto" | "steps";
  language: Language;
};

const text = (value: unknown) => (value === undefined || value === null ? "" : String(value)).trim();
const bool = (value: unknown, fallback: boolean) => {
  const t = text(value).toLowerCase();
  if (t === "true" || t === "1" || t === "yes") return true;
  if (t === "false" || t === "0" || t === "no") return false;
  return fallback;
};

/** "nl", "nl-NL" → nl; "fr-FR" → fr; anything else en. */
export const languageOf = (value: unknown): Language => {
  const t = text(value).slice(0, 2).toLowerCase();
  return t === "nl" || t === "fr" ? t : "en";
};

/** The entries of a list "a = b; c = d" (or one per line). */
const entries = (value: string) =>
  value
    .split(/[;\n]/)
    .map((part) => part.split("="))
    .filter((pair) => pair.length === 2 && pair[0].trim() && pair[1].trim())
    .map(([left, right]) => [left.trim().toLowerCase(), right.trim().toLowerCase()] as const);

/**
 * The rule table: "fluid = flow; compact = dome; compact 2+ = explosion". A rule names a viscosity, optionally a number of
 * tablets ("2": exactly two, "2+": two or more), and an outcome. Unknown words are skipped.
 */
export const parseRules = (value: unknown): Rule[] =>
  entries(text(value) || DEFAULT_RULES).flatMap(([left, right]) => {
    const match = /^([a-z]+)(?:\s+(\d+)(\+?))?$/.exec(left.replace(/\s+/g, " "));
    const outcome = right as Outcome;
    if (!match || !VISCOSITIES.includes(match[1] as Viscosity) || !OUTCOMES.includes(outcome)) return [];
    return [{ viscosity: match[1] as Viscosity, tablets: match[2] ? Number(match[2]) : null, atLeast: match[3] === "+", outcome }];
  });

/**
 * The outcome of an experiment: of the rules for the viscosity that match the number of tablets, the most specific
 * one (an exact number before "n+" with the highest n, before a rule without a number; the later one on a tie).
 * Without a matching rule: a flow for a fluid purée, a dome otherwise.
 */
export const outcomeFor = (rules: Rule[], viscosity: Viscosity, tablets: number): Outcome => {
  let best: Rule | null = null;
  let bestRank = -1;
  for (const rule of rules) {
    if (rule.viscosity !== viscosity) continue;
    let rank: number;
    if (rule.tablets === null) rank = 0;
    else if (rule.atLeast) {
      if (tablets < rule.tablets) continue;
      rank = 1 + rule.tablets;
    } else {
      if (tablets !== rule.tablets) continue;
      rank = 1000;
    }
    if (rank >= bestRank) {
      best = rule;
      bestRank = rank;
    }
  }
  return best ? best.outcome : viscosity === "fluid" ? "flow" : "dome";
};

/** "flow = effusive; dome = explosive; explosion = explosive", every outcome with a default. */
export const parseEruptions = (value: unknown): Record<Outcome, Eruption> => {
  const result = { ...defaultEruptions };
  for (const [left, right] of entries(text(value))) {
    if (OUTCOMES.includes(left as Outcome) && ERUPTIONS.includes(right as Eruption)) result[left as Outcome] = right as Eruption;
  }
  return result;
};
const defaultEruptions: Record<Outcome, Eruption> = { flow: "effusive", dome: "explosive", explosion: "explosive" };

/** The outcomes the candidate can get with these settings, in the order flow, dome, explosion. */
export const reachableOutcomes = (s: Pick<Settings, "viscosities" | "maxTablets" | "rules">): Outcome[] => {
  const seen = new Set<Outcome>();
  for (const v of s.viscosities) for (let n = 1; n <= s.maxTablets; n++) seen.add(outcomeFor(s.rules, v, n));
  return OUTCOMES.filter((o) => seen.has(o));
};

/**
 * The key of the task: "flow = fluid; dome = compact; explosion = compact | medium" ("|" separates accepted answers).
 * Empty: derived from the settings, for a viscosity every viscosity that gives the outcome, for an eruption the type
 * of the outcome. Only the outcomes the candidate can get are in the task.
 */
export const parseKey = (value: unknown, s: Pick<Settings, "viscosities" | "maxTablets" | "rules" | "eruptionOf" | "task">) => {
  const key: Partial<Record<Outcome, string[]>> = {};
  if (s.task === "none") return key;
  const allowed: string[] = s.task === "viscosity" ? s.viscosities : ERUPTIONS;
  const outcomes = reachableOutcomes(s);
  for (const [left, right] of entries(text(value))) {
    const answers = right.split("|").map((a) => a.trim()).filter((a) => allowed.includes(a));
    if (outcomes.includes(left as Outcome) && answers.length) key[left as Outcome] = answers;
  }
  for (const outcome of outcomes) {
    if (key[outcome]) continue;
    key[outcome] =
      s.task === "eruption"
        ? [s.eruptionOf[outcome]]
        : s.viscosities.filter((v) => Array.from({ length: s.maxTablets }, (_, i) => outcomeFor(s.rules, v, i + 1)).includes(outcome));
  }
  return key;
};

export const parseSettings = (p: Record<string, unknown> = {}): Settings => {
  const levels = text(p.viscosityLevels);
  const viscosities: Viscosity[] = levels === "2" ? ["fluid", "compact"] : VISCOSITIES;
  // empty: the default of config.json (3); not a number: 1, as in the original
  const tabletsText = text(p.maxTablets);
  const maxTablets = tabletsText === "" ? 3 : Math.max(1, Math.min(3, Math.round(Number(tabletsText)) || 1));
  const rules = parseRules(p.rules);
  const eruptionOf = parseEruptions(p.eruptionTypes);
  const taskText = text(p.task);
  const task: Task = taskText === "viscosity" || taskText === "eruption" ? taskText : "none";
  const base = { viscosities, maxTablets, rules, eruptionOf, task };
  return {
    ...base,
    key: parseKey(p.key, base),
    showEruption: bool(p.showEruptionType, true),
    animation: text(p.animation) === "steps" ? "steps" : "auto",
    language: languageOf(p.language),
  };
};

/** The experiment with these choices. */
export const runExperiment = (s: Settings, viscosity: Viscosity, tablets: number): Experiment => {
  const outcome = outcomeFor(s.rules, viscosity, tablets);
  return { viscosity, tablets, outcome, eruption: s.eruptionOf[outcome] };
};

/** The score of the matching: one point per outcome whose answer is in the key. */
export const scoreAnswers = (s: Settings, answers: Partial<Record<Outcome, string>>) => {
  const outcomes = OUTCOMES.filter((o) => s.key[o]);
  const score = outcomes.filter((o) => answers[o] && s.key[o]!.includes(answers[o]!)).length;
  return { score, maxscore: outcomes.length, correct: outcomes.length > 0 && score === outcomes.length ? 1 : 0 };
};

/** "flow=fluid;dome=compact" ⇄ { flow: "fluid", dome: "compact" } */
export const answersText = (answers: Partial<Record<Outcome, string>>) =>
  OUTCOMES.filter((o) => answers[o]).map((o) => `${o}=${answers[o]}`).join(";");
export const parseAnswers = (value: unknown): Partial<Record<Outcome, string>> => {
  const result: Partial<Record<Outcome, string>> = {};
  for (const [left, right] of entries(text(value))) if (OUTCOMES.includes(left as Outcome)) result[left as Outcome] = right;
  return result;
};

/** An experiment from a response or a state, checked. */
export const validExperiment = (value: any): Experiment | null => {
  if (!value || typeof value !== "object") return null;
  const { viscosity, tablets, outcome, eruption } = value;
  if (!VISCOSITIES.includes(viscosity) || !OUTCOMES.includes(outcome) || !ERUPTIONS.includes(eruption)) return null;
  if (typeof tablets !== "number" || !Number.isInteger(tablets) || tablets < 1 || tablets > 9) return null;
  return { viscosity, tablets, outcome, eruption };
};

/**
 * The height of the purée above where it started, as a fraction of the room to the rim (1: at the rim), and how far
 * it gets past the rim, for a progress 0…1 of the eruption. The stages: the tablet drops (0–0.25), gas (0.25–0.5),
 * the purée rises (0.5–0.75), the outcome (0.75–1).
 */
export const STAGES = [0.25, 0.5, 0.75, 1] as const;
export const riseAt = (progress: number) => {
  const p = Math.max(0, Math.min(1, progress));
  if (p <= 0.25) return 0;
  if (p <= 0.5) return ((p - 0.25) / 0.25) * 0.3;
  if (p <= 0.75) return 0.3 + ((p - 0.5) / 0.25) * 0.7;
  return 1;
};
/** How far the outcome has gone, 0…1, for a progress of the eruption. */
export const outcomeAt = (progress: number) => Math.max(0, Math.min(1, (progress - 0.75) / 0.25));
