// Protective equipment without a screen: the items, the body zones they go on, the hazards they protect against, the
// jobs (presets and the author's own), what the worker wears after a put-on or a take-off, the response, the correct
// response and the problems of the settings. No imports: `npm test` runs it in node as it is.

// ---- the body zones and the items ----

export type ZoneId = "head" | "eyes" | "ears" | "face" | "hands" | "feet" | "body" | "fallArrest";
/** The zones, in the order of the rack (top of the worker to bottom, the harness last). */
export const ZONES: ZoneId[] = ["head", "eyes", "ears", "face", "hands", "feet", "body", "fallArrest"];

export type HazardId =
  | "particles" | "splashes" | "noise" | "dust" | "vapours" | "falling" | "bumping" | "cuts" | "rough" | "crushing" | "wet"
  | "traffic" | "cold" | "height" | "hygiene";
/** Every hazard an item can protect against, in the order of a choice list. */
export const HAZARDS: HazardId[] = [
  "particles", "splashes", "noise", "dust", "vapours", "falling", "bumping", "cuts", "rough", "crushing", "wet", "traffic", "cold",
  "height", "hygiene",
];

export type ItemId =
  | "helmet" | "bumpCap" | "hairnet" | "goggles" | "earPlugs" | "earMuffs" | "faceShield" | "dustMask" | "respirator" | "workGloves"
  | "chemicalGloves" | "cutGloves" | "safetyShoes" | "rubberBoots" | "hiVis" | "coverall" | "chemicalApron" | "coldClothing" | "harness";

export type Item = {
  id: ItemId;
  zone: ZoneId;
  /**
   * Items of one slot can not be worn together (one hat, one mask, one pair of gloves, one pair of shoes, one suit):
   * putting one on takes the other off. Required items of one slot are alternatives: one of them is enough.
   */
  slot: string;
  /** The hazards it protects against. */
  protects: HazardId[];
  /** Hazards it does not protect against, offered next to them when the pupil says why (explain). */
  distractors: HazardId[];
};

/** The items, in the order of the rack: by zone, as the worker is dressed from head to toe. */
export const ITEMS: Item[] = [
  { id: "helmet", zone: "head", slot: "hat", protects: ["falling", "bumping"], distractors: ["noise", "dust"] },
  { id: "bumpCap", zone: "head", slot: "hat", protects: ["bumping"], distractors: ["falling", "noise"] },
  { id: "hairnet", zone: "head", slot: "hairnet", protects: ["hygiene"], distractors: ["bumping", "dust", "falling"] },
  { id: "goggles", zone: "eyes", slot: "goggles", protects: ["particles", "splashes"], distractors: ["noise", "vapours", "cold"] },
  // ear plugs and ear muffs may be worn together (double protection), but either is enough
  { id: "earPlugs", zone: "ears", slot: "hearing", protects: ["noise"], distractors: ["dust", "particles", "cold"] },
  { id: "earMuffs", zone: "ears", slot: "hearing", protects: ["noise"], distractors: ["cold", "falling", "particles"] },
  { id: "faceShield", zone: "face", slot: "faceShield", protects: ["particles", "splashes"], distractors: ["dust", "vapours", "noise"] },
  { id: "dustMask", zone: "face", slot: "mask", protects: ["dust"], distractors: ["vapours", "splashes", "noise"] },
  { id: "respirator", zone: "face", slot: "mask", protects: ["vapours", "dust"], distractors: ["splashes", "noise", "cold"] },
  { id: "workGloves", zone: "hands", slot: "gloves", protects: ["rough"], distractors: ["splashes", "vapours", "noise"] },
  { id: "chemicalGloves", zone: "hands", slot: "gloves", protects: ["splashes"], distractors: ["cuts", "particles", "cold"] },
  { id: "cutGloves", zone: "hands", slot: "gloves", protects: ["cuts", "rough"], distractors: ["splashes", "vapours", "noise"] },
  { id: "safetyShoes", zone: "feet", slot: "footwear", protects: ["crushing"], distractors: ["noise", "traffic", "height"] },
  { id: "rubberBoots", zone: "feet", slot: "footwear", protects: ["wet", "splashes"], distractors: ["noise", "traffic", "bumping"] },
  { id: "hiVis", zone: "body", slot: "hiVis", protects: ["traffic"], distractors: ["cold", "rough", "falling"] },
  { id: "coverall", zone: "body", slot: "suit", protects: ["rough"], distractors: ["splashes", "cold", "traffic"] },
  { id: "chemicalApron", zone: "body", slot: "apron", protects: ["splashes"], distractors: ["cold", "cuts", "noise"] },
  { id: "coldClothing", zone: "body", slot: "suit", protects: ["cold"], distractors: ["splashes", "traffic", "noise"] },
  { id: "harness", zone: "fallArrest", slot: "harness", protects: ["height"], distractors: ["falling", "bumping", "traffic"] },
];
export const ITEM_IDS: ItemId[] = ITEMS.map((item) => item.id);
export const isItemId = (id: unknown): id is ItemId => typeof id === "string" && (ITEM_IDS as string[]).includes(id);
export const isHazardId = (id: unknown): id is HazardId => typeof id === "string" && (HAZARDS as string[]).includes(id);
export const itemOf = (id: ItemId): Item => ITEMS.find((item) => item.id === id)!;
/** Items, sorted as in the rack, without doubles or unknown ids. */
export const inRackOrder = (ids: readonly string[]): ItemId[] => ITEM_IDS.filter((id) => ids.includes(id));
export const itemsOfZone = (zone: ZoneId): ItemId[] => ITEMS.filter((item) => item.zone === zone).map((item) => item.id);
/** Slots of which only one item can be worn at a time. */
const EXCLUSIVE_SLOTS = new Set(["hat", "mask", "gloves", "footwear", "suit"]);
export const isExclusive = (slot: string) => EXCLUSIVE_SLOTS.has(slot);

/** The choice list for "why": the hazards the item protects against and its distractors, in the order of HAZARDS. */
export const reasonOptions = (id: ItemId): HazardId[] => {
  const { protects, distractors } = itemOf(id);
  return HAZARDS.filter((hazard) => protects.includes(hazard) || distractors.includes(hazard));
};

// ---- the jobs ----

export type Status = "required" | "allowed" | "wrong";
/** A job: what it requires, what is allowed but not needed (everything else is wrong), and its hazards. */
export type JobSpec = { required: ItemId[]; allowed: ItemId[]; hazards: HazardId[] };

export type PresetId = "grinding" | "cleaning" | "roof" | "coldStore" | "circularSaw" | "kitchen" | "roadside";
export const PRESET_IDS: PresetId[] = ["grinding", "cleaning", "roof", "coldStore", "circularSaw", "kitchen", "roadside"];
export const isPresetId = (id: unknown): id is PresetId => typeof id === "string" && (PRESET_IDS as string[]).includes(id);

/**
 * The built-in jobs (their texts, in English and Dutch, are in texts.ts). Required items of one slot are alternatives
 * (ear plugs or ear muffs). A choice to check with a VCA teacher: these follow common practice, not one rule book.
 */
export const PRESETS: Record<PresetId, JobSpec> = {
  // an angle grinder: sparks and particles, noise, metal dust; a heavy beam with sharp edges
  grinding: {
    required: ["goggles", "earPlugs", "earMuffs", "workGloves", "cutGloves", "safetyShoes"],
    allowed: ["faceShield", "dustMask", "respirator", "coverall"],
    hazards: ["particles", "noise", "dust", "rough", "cuts", "crushing"],
  },
  // a corrosive cleaning agent: splashes on the eyes, the hands, the body and the feet; a wet floor; vapours
  cleaning: {
    required: ["goggles", "chemicalGloves", "chemicalApron", "rubberBoots"],
    allowed: ["faceShield", "respirator"],
    hazards: ["splashes", "vapours", "wet"],
  },
  // a sloping roof without a guard rail: falling from height, things falling from the roof work, heavy tiles
  roof: {
    required: ["harness", "helmet", "safetyShoes"],
    allowed: ["workGloves", "cutGloves", "coverall", "goggles"],
    hazards: ["height", "falling", "bumping", "crushing", "rough", "cuts", "particles"],
  },
  // a forklift in a freezer: the cold, pallets and other traffic in the aisles
  coldStore: {
    required: ["coldClothing", "safetyShoes", "hiVis"],
    allowed: ["workGloves", "bumpCap", "helmet"],
    hazards: ["cold", "crushing", "traffic", "rough", "bumping", "falling"],
  },
  // a circular saw: chips, noise, wood dust, splinters. No gloves near a turning blade: they can be caught.
  circularSaw: {
    required: ["goggles", "earPlugs", "earMuffs", "dustMask", "safetyShoes"],
    allowed: ["faceShield", "respirator", "coverall"],
    hazards: ["particles", "noise", "dust", "rough", "crushing"],
  },
  // a professional kitchen: hair in the food, sharp knives
  kitchen: {
    required: ["hairnet"],
    allowed: ["cutGloves", "safetyShoes"],
    hazards: ["hygiene", "cuts", "rough", "crushing"],
  },
  // repairing a pavement next to a busy road: traffic, heavy paving stones, a plate compactor
  roadside: {
    required: ["hiVis", "safetyShoes", "workGloves", "cutGloves"],
    allowed: ["helmet", "earPlugs", "earMuffs", "goggles", "coverall", "dustMask"],
    hazards: ["traffic", "crushing", "rough", "cuts", "noise", "dust", "particles", "falling"],
  },
};

/** The job of an item: a preset, or the author's own with its text. */
export type Job = JobSpec & {
  /** The preset, or "custom" for the author's own job. */
  preset: PresetId | "custom";
  /** The author's text of an own job; null for a preset (its text is in texts.ts, in the PCI's language). */
  text: string | null;
};

/** The settings that make the job. */
export type JobSettings = { job?: string; customJob?: string };

const ids = <T>(value: unknown, isId: (id: unknown) => id is T): T[] => (Array.isArray(value) ? value.filter(isId) : []);

/**
 * The author's own job from the `customJob` setting: JSON as the authoring mode writes it,
 * { "text": "…", "required": [ids], "allowed": [ids], "hazards": [ids] }. Unknown ids are left out, an item both
 * required and allowed is required. null when it can not be read.
 */
export function parseCustomJob(text: string | undefined | null): (JobSpec & { text: string }) | null {
  if (!text || !text.trim()) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const raw = json as Record<string, unknown>;
  const required = inRackOrder(ids(raw.required, isItemId));
  return {
    text: typeof raw.text === "string" ? raw.text : "",
    required,
    allowed: inRackOrder(ids(raw.allowed, isItemId).filter((id) => !required.includes(id))),
    hazards: HAZARDS.filter((hazard) => ids(raw.hazards, isHazardId).includes(hazard)),
  };
}

/** The customJob setting for an own job: the JSON the authoring mode writes. */
export const serializeCustomJob = (job: JobSpec & { text: string }) =>
  JSON.stringify({ text: job.text, required: inRackOrder(job.required), allowed: inRackOrder(job.allowed), hazards: HAZARDS.filter((h) => job.hazards.includes(h)) });

export const DEFAULT_PRESET: PresetId = "grinding";

/**
 * The job from the settings: a preset, or with `job` "custom" the author's own (customJob). An unknown preset is the
 * default one; an own job that can not be read too (and settingsProblems says so).
 */
export function jobFrom(settings: JobSettings): Job {
  if (settings.job === "custom") {
    const custom = parseCustomJob(settings.customJob);
    if (custom) return { preset: "custom", ...custom };
  }
  const preset = isPresetId(settings.job) ? settings.job : DEFAULT_PRESET;
  const spec = PRESETS[preset];
  return { preset, text: null, required: [...spec.required], allowed: [...spec.allowed], hazards: [...spec.hazards] };
}

export const statusOf = (job: JobSpec, id: ItemId): Status => (job.required.includes(id) ? "required" : job.allowed.includes(id) ? "allowed" : "wrong");

/** What the job requires, one group per slot: the items of a group are alternatives, one of them is enough. */
export function requirements(job: JobSpec): ItemId[][] {
  const groups = new Map<string, ItemId[]>();
  for (const id of inRackOrder(job.required)) {
    const slot = itemOf(id).slot;
    groups.set(slot, [...(groups.get(slot) ?? []), id]);
  }
  return [...groups.values()];
}

/** The hazards of the item that this job has: a reason that fits. */
export const fittingReasons = (job: JobSpec, id: ItemId): HazardId[] =>
  statusOf(job, id) === "wrong" ? [] : itemOf(id).protects.filter((hazard) => job.hazards.includes(hazard));

/** A reason the pupil gives for an item fits when the item protects against it, the job has it and the item is needed or allowed. */
export const reasonFits = (job: JobSpec, id: ItemId, hazard: string | undefined) => !!hazard && fittingReasons(job, id).includes(hazard as HazardId);

// ---- dressing the worker ----

/** What the worker wears: item ids in rack order. */
export type Worn = ItemId[];
/** The reason the pupil gave per item worn (explain). */
export type Reasons = Partial<Record<ItemId, HazardId>>;

/** The items that putting this one on takes off: the others of its slot, when only one of the slot can be worn. */
export const replacedBy = (worn: Worn, id: ItemId): ItemId[] => {
  const { slot } = itemOf(id);
  return isExclusive(slot) ? worn.filter((other) => other !== id && itemOf(other).slot === slot) : [];
};

export const putOn = (worn: Worn, id: ItemId): Worn => {
  if (!isItemId(id)) return worn;
  const replaced = replacedBy(worn, id);
  return inRackOrder([...worn.filter((other) => !replaced.includes(other)), id]);
};
export const takeOff = (worn: Worn, id: ItemId): Worn => worn.filter((other) => other !== id);
export const toggle = (worn: Worn, id: ItemId): Worn => (worn.includes(id) ? takeOff(worn, id) : putOn(worn, id));

/** Worn items as one wears them: in rack order, without doubles, one of each exclusive slot (the last one given wins). */
export function wearable(ids: readonly string[]): Worn {
  let worn: Worn = [];
  for (const id of ids) if (isItemId(id)) worn = putOn(worn, id);
  return worn;
}

/** Only the reasons of items worn, and only reasons from the item's choice list. */
export const cleanReasons = (worn: Worn, reasons: Reasons): Reasons =>
  Object.fromEntries(worn.filter((id) => reasons[id] && reasonOptions(id).includes(reasons[id]!)).map((id) => [id, reasons[id]!])) as Reasons;

// ---- the response ----

export type Evaluation = {
  /** Requirements met: groups of which an item is worn. */
  required: number;
  requiredTotal: number;
  /** Items worn that the job does not allow. */
  wrong: number;
  correct: boolean;
  /** Worn items whose reason fits the job. */
  reasonsRight: number;
  /** Every worn item has a reason that fits. */
  reasonsCorrect: boolean;
};

export function evaluate(job: JobSpec, worn: Worn, reasons: Reasons = {}): Evaluation {
  const groups = requirements(job);
  const required = groups.filter((group) => group.some((id) => worn.includes(id))).length;
  const wrong = worn.filter((id) => statusOf(job, id) === "wrong").length;
  const reasonsRight = worn.filter((id) => reasonFits(job, id, reasons[id])).length;
  return {
    required,
    requiredTotal: groups.length,
    wrong,
    correct: required === groups.length && wrong === 0,
    reasonsRight,
    reasonsCorrect: worn.length > 0 && reasonsRight === worn.length,
  };
}

export type RecordField = { name: string; base: { integer?: number; boolean?: boolean; string?: string } };
export type RecordResponse = { record: RecordField[] };

/** The items worn as the response writes them: "goggles,earMuffs,workGloves". */
export const itemsText = (worn: Worn) => inRackOrder(worn).join(",");
/** The reasons as the response writes them: "goggles:particles,earMuffs:noise", only for items with a reason. */
export const reasonsText = (worn: Worn, reasons: Reasons) =>
  inRackOrder(worn)
    .filter((id) => reasons[id])
    .map((id) => `${id}:${reasons[id]}`)
    .join(",");

/**
 * The response: a record with required, requiredTotal, wrong, correct and items; with explain also reasons,
 * reasonsRight and reasonsCorrect. Nothing while the worker wears nothing.
 */
export function responseFor(job: JobSpec, worn: Worn, reasons: Reasons, explain: boolean): RecordResponse | undefined {
  if (worn.length === 0) return undefined;
  const e = evaluate(job, worn, reasons);
  const record: RecordField[] = [
    { name: "required", base: { integer: e.required } },
    { name: "requiredTotal", base: { integer: e.requiredTotal } },
    { name: "wrong", base: { integer: e.wrong } },
    { name: "correct", base: { boolean: e.correct } },
    { name: "items", base: { string: itemsText(worn) } },
  ];
  if (explain) {
    record.push(
      { name: "reasons", base: { string: reasonsText(worn, reasons) } },
      { name: "reasonsRight", base: { integer: e.reasonsRight } },
      { name: "reasonsCorrect", base: { boolean: e.reasonsCorrect } }
    );
  }
  return { record };
}

/** A correct dressing: the first item of every requirement, nothing else, each with the first reason that fits. */
export function correctDressing(job: JobSpec): { worn: Worn; reasons: Reasons } {
  const worn = wearable(requirements(job).map((group) => group[0]));
  const reasons = Object.fromEntries(worn.filter((id) => fittingReasons(job, id).length).map((id) => [id, fittingReasons(job, id)[0]])) as Reasons;
  return { worn, reasons };
}

/**
 * Whether the job has one correct response: no alternatives, nothing allowed, and (explain) one fitting reason per
 * item. Only then can match_correct score it; otherwise a rule on `correct` does.
 */
export function hasOneAnswer(job: JobSpec, explain: boolean): boolean {
  const groups = requirements(job);
  if (groups.length === 0 || groups.some((group) => group.length > 1) || job.allowed.length > 0) return false;
  return !explain || groups.every(([id]) => fittingReasons(job, id).length === 1);
}

/** The correct response from the settings, when there is only one (hasOneAnswer); undefined otherwise. */
export function correctFor(job: JobSpec, explain: boolean): RecordResponse | undefined {
  if (!hasOneAnswer(job, explain)) return undefined;
  const { worn, reasons } = correctDressing(job);
  return responseFor(job, worn, reasons, explain);
}

/** The value of a record field, from a response as a player hands it back (a record, or the record list itself). */
function field(value: unknown, name: string): unknown {
  const record = (value as { record?: unknown })?.record ?? value;
  if (!Array.isArray(record)) return undefined;
  const found = record.find((f) => (f as RecordField)?.name === name) as RecordField | undefined;
  const base = found?.base as Record<string, unknown> | undefined;
  return base ? (base.string ?? base.identifier ?? Object.values(base)[0]) : undefined;
}

/** What the worker wears and why, from a response (setResponse, boundTo, a correct response); null without items. */
export function readResponse(value: unknown): { worn: Worn; reasons: Reasons } | null {
  const items = field(value, "items");
  if (typeof items !== "string") return null;
  const worn = wearable(items.split(/[\s,;]+/));
  const reasons: Reasons = {};
  const text = field(value, "reasons");
  if (typeof text === "string") {
    for (const pair of text.split(/[\s,;]+/)) {
      const [id, hazard] = pair.split(":");
      if (isItemId(id) && isHazardId(hazard)) reasons[id] = hazard;
    }
  }
  return { worn, reasons: cleanReasons(worn, reasons) };
}

// ---- problems of the settings ----

export type Problem = "unreadableJob" | "noText" | "noRequired" | "noReason";

/** What is wrong with the job, for the author: an own job without text or required items, a needed item without a reason (explain). */
export function jobProblems(job: Job, explain: boolean, settings: JobSettings = {}): { problem: Problem; items?: ItemId[] }[] {
  const problems: { problem: Problem; items?: ItemId[] }[] = [];
  if (settings.job === "custom" && job.preset !== "custom") problems.push({ problem: "unreadableJob" });
  if (job.preset === "custom" && !(job.text ?? "").trim()) problems.push({ problem: "noText" });
  if (job.required.length === 0) problems.push({ problem: "noRequired" });
  if (explain) {
    const noReason = inRackOrder([...job.required, ...job.allowed]).filter((id) => fittingReasons(job, id).length === 0);
    if (noReason.length) problems.push({ problem: "noReason", items: noReason });
  }
  return problems;
}

// ---- the worker ----

export type WorkerId = 1 | 2 | 3;
export const WORKERS: WorkerId[] = [1, 2, 3];
/** The worker setting: 1, 2 or 3, or "choice" (the pupil picks one; worker 1 at the start). */
export const workerSetting = (value: string | undefined): WorkerId | "choice" =>
  value === "choice" ? "choice" : WORKERS.includes(Number(value) as WorkerId) ? (Number(value) as WorkerId) : "choice";
export const isWorkerId = (value: unknown): value is WorkerId => WORKERS.includes(value as WorkerId);
