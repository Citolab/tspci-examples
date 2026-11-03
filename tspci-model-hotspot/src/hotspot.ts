// The settings, the answer and the response of the model hotspot, without imports (tested in node:
// test/hotspot.test.ts). The model (built in, or a glTF) gives the parts; data-setup (written by the authoring mode)
// says which parts the candidate can choose, their names, the labels and the correct answer.
//
// Click mode: the response is the identifier of the part (cardinality single) or a list of them (multiple), in the
// order of the parts. Label mode: a list of directed pairs "label part", in the order of the labels. Both are scored
// with MATCH_CORRECT; label mode also with MAP_RESPONSE (a point per correct pair; README).
import type { Text2 } from "./models";

export type Mode = "click" | "label";
export type Cardinality = "single" | "multiple";
export type Lang = "en" | "nl";

/** A part as the model has it: the identifier and the built-in name (a glTF: the mesh name). */
export type BasePart = { id: string; name: Text2 };
/** What the author set for a part. Leaving out `selectable` means it can be chosen. */
export type SetupPart = { id: string; en?: string; nl?: string; selectable?: boolean };
/** A label the candidate puts on a part; `part` the part it belongs on, null for a distractor. */
export type Label = { id: string; en: string; nl: string; part: string | null };
export type Setup = { parts?: SetupPart[]; labels?: Label[]; correct?: string[] };

/** A part as the candidate sees it: `letter` names it in the list and in the model ("Part C"). */
export type Part = { id: string; name: Text2; selectable: boolean; letter: string };

export type Settings = {
  mode: Mode;
  cardinality: Cardinality;
  /** the most parts the candidate may choose in click mode; 0: no limit */
  maxChoices: number;
  /** every part of the model, in the model's order */
  parts: Part[];
  labels: Label[];
  /** click mode: the correct parts */
  correct: string[];
};

/** The candidate's answer: the chosen parts (click mode), or which label is on which part (label mode). */
export type Answer = { selected: string[]; placed: Record<string, string> };

export const EMPTY_ANSWER: Answer = { selected: [], placed: {} };
export const MAX_PARTS = 40;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
export const isIdentifier = (id: unknown): id is string => typeof id === "string" && IDENTIFIER.test(id) && id.length <= 64;

/** A, B, … Z, then A2, B2 … */
export const letterOf = (index: number) => String.fromCharCode(65 + (index % 26)) + (index >= 26 ? String(Math.floor(index / 26) + 1) : "");

export const nameOf = (name: Text2, lang: Lang | string) => (lang === "nl" ? name.nl || name.en : name.en || name.nl);

export const parseMode = (value: unknown): Mode => (String(value ?? "").trim().toLowerCase() === "label" ? "label" : "click");
export const parseCardinality = (value: unknown): Cardinality => (String(value ?? "").trim().toLowerCase() === "multiple" ? "multiple" : "single");
export const parseMaxChoices = (value: unknown) => {
  const n = Math.round(Number(String(value ?? "").trim() || 0));
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_PARTS) : 0;
};

const text = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, 120) : "");

/** data-setup as JSON; anything else (empty, broken) is no setup: the model's own parts and example answer. */
export const parseSetup = (value: unknown): Setup => {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const raw = JSON.parse(value);
    if (!raw || typeof raw !== "object") return {};
    const setup: Setup = {};
    if (Array.isArray(raw.parts)) {
      setup.parts = raw.parts
        .filter((p: any) => p && isIdentifier(p.id))
        .slice(0, MAX_PARTS)
        .map((p: any) => ({ id: p.id, ...(text(p.en) ? { en: text(p.en) } : {}), ...(text(p.nl) ? { nl: text(p.nl) } : {}), ...(p.selectable === false ? { selectable: false } : {}) }));
    }
    if (Array.isArray(raw.labels)) {
      setup.labels = raw.labels
        .filter((l: any) => l && isIdentifier(l.id))
        .slice(0, MAX_PARTS)
        .map((l: any) => ({ id: l.id, en: text(l.en), nl: text(l.nl), part: isIdentifier(l.part) ? l.part : null }));
    }
    if (Array.isArray(raw.correct)) setup.correct = raw.correct.filter(isIdentifier);
    return setup;
  } catch {
    return {};
  }
};

export const serializeSetup = (setup: Setup) => JSON.stringify(setup);

const unique = <T>(items: T[], key: (item: T) => string) => {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(key(item)) ? false : (seen.add(key(item)), true)));
};

export type SettingsInput = {
  /** the parts of the model; for a glTF the ones of the setup (the file is not loaded yet) */
  base: BasePart[];
  setup: Setup;
  mode: Mode;
  cardinality: Cardinality;
  maxChoices: number;
  /** the model's example answer, when the setup has none */
  defaultCorrect?: string[];
  /** a glTF: parts in the setup that are not in `base` are parts too */
  open?: boolean;
};

export const resolveSettings = ({ base, setup, mode, cardinality, maxChoices, defaultCorrect = [], open = false }: SettingsInput): Settings => {
  const own = new Map((setup.parts ?? []).map((p) => [p.id, p]));
  const all: BasePart[] = unique([...base, ...(open ? (setup.parts ?? []).map((p) => ({ id: p.id, name: { en: p.en ?? p.id, nl: p.nl ?? "" } })) : [])], (p) => p.id).slice(0, MAX_PARTS);
  let letter = 0;
  const parts: Part[] = all.map((p) => {
    const s = own.get(p.id);
    const selectable = s?.selectable !== false;
    return { id: p.id, name: { en: s?.en || p.name.en, nl: s?.nl || p.name.nl }, selectable, letter: selectable ? letterOf(letter++) : "" };
  });
  const selectable = new Set(parts.filter((p) => p.selectable).map((p) => p.id));
  const labels = setup.labels
    ? unique(setup.labels, (l) => l.id).map((l) => ({ ...l, part: l.part && parts.some((p) => p.id === l.part) ? l.part : null }))
    : parts.filter((p) => p.selectable).map((p) => ({ id: p.id, en: p.name.en, nl: p.name.nl, part: p.id }));
  let correct = unique(setup.correct ?? defaultCorrect, (id) => id).filter((id) => selectable.has(id));
  if (cardinality === "single") correct = correct.slice(0, 1);
  return { mode, cardinality, maxChoices: cardinality === "single" ? 1 : maxChoices, parts, labels, correct };
};

export const choosable = (settings: Settings) => settings.parts.filter((p) => p.selectable);
export const partById = (settings: Settings, id: string) => settings.parts.find((p) => p.id === id);
const byPartOrder = (settings: Settings) => (a: string, b: string) => settings.parts.findIndex((p) => p.id === a) - settings.parts.findIndex((p) => p.id === b);

/** Only what fits the settings: chosen parts that can be chosen, labels that exist on parts that can be chosen. */
export const ownAnswer = (settings: Settings, answer: Partial<Answer> | null | undefined): Answer => {
  const ok = new Set(choosable(settings).map((p) => p.id));
  const labels = new Set(settings.labels.map((l) => l.id));
  let selected = unique((Array.isArray(answer?.selected) ? answer.selected : []).filter((id) => ok.has(id)), (id) => id).sort(byPartOrder(settings));
  if (settings.maxChoices) selected = selected.slice(0, settings.maxChoices);
  const placed: Record<string, string> = {};
  const taken = new Set<string>();
  for (const [label, part] of Object.entries(answer?.placed && typeof answer.placed === "object" ? answer.placed : {})) {
    if (labels.has(label) && ok.has(part) && !taken.has(part)) {
      placed[label] = part;
      taken.add(part);
    }
  }
  return { selected, placed };
};

export type ToggleResult = { selected: string[]; refused?: "max" };

/** A click on a part in click mode: one choice replaces, more choices toggle (up to maxChoices). */
export const toggle = (settings: Settings, selected: string[], id: string): ToggleResult => {
  if (!partById(settings, id)?.selectable) return { selected };
  if (selected.includes(id)) return { selected: selected.filter((s) => s !== id) };
  if (settings.cardinality === "single") return { selected: [id] };
  if (settings.maxChoices && selected.length >= settings.maxChoices) return { selected, refused: "max" };
  return { selected: [...selected, id].sort(byPartOrder(settings)) };
};

/**
 * A label on a part: the label leaves the part it was on, and a label that was on the part goes back to the bank.
 * `part` null takes the label off.
 */
export const place = (placed: Record<string, string>, label: string, part: string | null): Record<string, string> => {
  const next: Record<string, string> = {};
  for (const [l, p] of Object.entries(placed)) if (l !== label && p !== part) next[l] = p;
  if (part) next[label] = part;
  return next;
};

export const labelOn = (placed: Record<string, string>, part: string) => Object.keys(placed).find((l) => placed[l] === part) ?? null;

// ------------------------------------------------------------------------------------------------------- responses

export type Response =
  | { base: { identifier: string } }
  | { list: { identifier: string[] } }
  | { list: { directedPair: [string, string][] } };

/** What getResponse() reports; undefined while the candidate has not chosen or placed anything. */
export const responseOf = (settings: Settings, answer: Answer): Response | undefined => {
  const own = ownAnswer(settings, answer);
  if (settings.mode === "label") {
    const pairs = settings.labels.filter((l) => own.placed[l.id]).map((l): [string, string] => [l.id, own.placed[l.id]]);
    return pairs.length ? { list: { directedPair: pairs } } : undefined;
  }
  if (!own.selected.length) return undefined;
  return settings.cardinality === "single" ? { base: { identifier: own.selected[0] } } : { list: { identifier: own.selected } };
};

/** The answer that is correct by the settings. */
export const correctAnswer = (settings: Settings): Answer => {
  const placed: Record<string, string> = {};
  for (const l of settings.labels) if (l.part && partById(settings, l.part)?.selectable && !Object.values(placed).includes(l.part)) placed[l.id] = l.part;
  return { selected: settings.mode === "click" ? settings.correct : [], placed: settings.mode === "label" ? placed : {} };
};

export const correctResponse = (settings: Settings): Response | undefined => responseOf(settings, correctAnswer(settings));

/** A pair from a response or a declaration: ["a", "b"], "a b" (QTI XML), { directedPair: […] }. */
const pairOf = (value: any): [string, string] | null => {
  if (Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === "string")) return [value[0], value[1]];
  if (typeof value === "string") {
    const bits = value.trim().split(/\s+/);
    return bits.length === 2 ? [bits[0], bits[1]] : null;
  }
  if (value && typeof value === "object") return pairOf(value.directedPair ?? value.pair ?? value.value ?? value.base?.directedPair ?? null);
  return null;
};

/**
 * The answer in a response, a declared correct response or a saved value: { base: { identifier } },
 * { list: { identifier } }, { list: { directedPair } }, an identifier, identifiers separated by spaces, or a list of
 * pairs ("label part" strings, as in QTI XML).
 */
export const readAnswer = (settings: Settings, value: any): Answer | null => {
  if (value === undefined || value === null) return null;
  const v = value?.base ?? value?.list ?? value;
  const fromIds = (ids: unknown[]) => ownAnswer(settings, { selected: ids.filter((id): id is string => typeof id === "string") });
  const fromPairs = (pairs: unknown[]) => {
    const placed: Record<string, string> = {};
    for (const p of pairs.map(pairOf)) if (p) placed[p[0]] = p[1];
    return ownAnswer(settings, { placed });
  };
  if (settings.mode === "label") {
    let pairs: unknown = v?.directedPair ?? v?.pair ?? v;
    if (typeof pairs === "string") pairs = pairs.split(/[,;\n]/);
    if (!Array.isArray(pairs)) return null;
    // one pair (a single directedPair) or a list of them
    if (pairs.length === 2 && pairs.every((p) => typeof p === "string" && !/\s/.test(p.trim()))) pairs = [pairs];
    return fromPairs(pairs as unknown[]);
  }
  if (typeof v?.identifier === "string") return fromIds([v.identifier]);
  if (Array.isArray(v?.identifier)) return fromIds(v.identifier);
  if (Array.isArray(v)) return fromIds(v.map((x) => (typeof x === "string" ? x : x?.base?.identifier ?? x?.value)));
  if (typeof v === "string") return fromIds(v.split(/[\s,]+/));
  return null;
};

/** Click mode: the same parts. Label mode: every label that belongs on a part is on it, and no distractor is placed. */
export const isCorrect = (settings: Settings, answer: Answer) => {
  const a = responseOf(settings, answer), c = correctResponse(settings);
  return !!a && !!c && JSON.stringify(a) === JSON.stringify(c);
};

/** Label mode: how many labels are on the right part (the points of MAP_RESPONSE with a point per pair). */
export const labelPoints = (settings: Settings, answer: Answer) => {
  const own = ownAnswer(settings, answer);
  return settings.labels.filter((l) => l.part && own.placed[l.id] === l.part).length;
};

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The response declaration for the item, with the correct response (and a mapping in label mode). */
export const declarationXml = (settings: Settings, identifier = "RESPONSE") => {
  const c = correctResponse(settings);
  const values = !c ? [] : "base" in c ? [c.base.identifier] : "identifier" in c.list ? c.list.identifier : c.list.directedPair.map((p) => p.join(" "));
  const label = settings.mode === "label";
  const cardinality = label || settings.cardinality === "multiple" ? "multiple" : "single";
  const lines = [`<qti-response-declaration identifier="${xml(identifier)}" cardinality="${cardinality}" base-type="${label ? "directedPair" : "identifier"}">`];
  if (values.length) {
    lines.push("  <qti-correct-response>", ...values.map((v) => `    <qti-value>${xml(v)}</qti-value>`), "  </qti-correct-response>");
  }
  if (label && values.length) {
    lines.push(`  <qti-mapping default-value="0" lower-bound="0">`, ...values.map((v) => `    <qti-map-entry map-key="${xml(v)}" mapped-value="1"/>`), "  </qti-mapping>");
  }
  lines.push("</qti-response-declaration>");
  return lines.join("\n");
};

// --------------------------------------------------------------------------------------------------- authoring checks

export type Problem =
  | { code: "noParts" }
  | { code: "noCorrect" }
  | { code: "tooManyCorrect"; count: number; max: number }
  | { code: "noLabels" }
  | { code: "labelText"; label: string }
  | { code: "labelPart"; label: string }
  | { code: "samePart"; part: string }
  | { code: "noUrl" };

export const problemsOf = (settings: Settings, opts: { gltf?: boolean; url?: string } = {}): Problem[] => {
  const problems: Problem[] = [];
  if (opts.gltf && !String(opts.url ?? "").trim()) problems.push({ code: "noUrl" });
  if (!choosable(settings).length) problems.push({ code: "noParts" });
  if (settings.mode === "click") {
    if (!settings.correct.length) problems.push({ code: "noCorrect" });
    else if (settings.maxChoices && settings.correct.length > settings.maxChoices) problems.push({ code: "tooManyCorrect", count: settings.correct.length, max: settings.maxChoices });
    return problems;
  }
  if (!settings.labels.some((l) => l.part)) problems.push({ code: "noLabels" });
  const on = new Map<string, number>();
  for (const l of settings.labels) {
    if (!l.en && !l.nl) problems.push({ code: "labelText", label: l.id });
    if (l.part && !partById(settings, l.part)?.selectable) problems.push({ code: "labelPart", label: l.id });
    if (l.part) on.set(l.part, (on.get(l.part) ?? 0) + 1);
  }
  for (const [part, n] of on) if (n > 1) problems.push({ code: "samePart", part });
  return problems;
};
