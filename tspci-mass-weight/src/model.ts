// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/ForceGravitepci and
// https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Delorpci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The bench without a picture: the settings, the objects, what every instrument reads, the log of readings and the
// scoring. No imports: `npm test` runs it in node.
//
//   scale          shows the mass m (a balance: the same everywhere), minus the tare
//   dynamometer    shows the weight F = m · g of the place
//   cylinder       level = water + the part of the object under water
//
// The object in the cylinder is a column of height H (in mL of the cylinder) that takes a fraction f = V / H of its
// cross-section. With W mL of water it is under water once W ≥ (1 − f) · H, and the level is W + V; with less water
// the level is W / (1 − f) and only part of it is under water. Above the top graduation the level cannot be read;
// above the brim the water overflows.

export type Language = "en" | "nl" | "fr";
export const PLACES = ["earth", "moon", "mars"] as const;
export type PlaceId = (typeof PLACES)[number];
export const INSTRUMENTS = ["scale", "dynamometer", "cylinder"] as const;
export type InstrumentId = (typeof INSTRUMENTS)[number];
export type Location = "table" | InstrumentId;
export const ANSWER_FIELDS = ["mass", "weight", "volume", "density"] as const;
export type AnswerField = (typeof ANSWER_FIELDS)[number];
export const BUILT_IN = ["statuette", "meteorite", "stone", "cube"] as const;
export type Kind = (typeof BUILT_IN)[number] | "custom";
export type Names = { en: string; nl: string; fr: string };

export type Thing = {
  /** "statuette", … for a built-in object, "object2" for the second line of the list otherwise. */
  id: string;
  kind: Kind;
  /** The names of a custom object; a built-in object takes its name from the texts. */
  names: Names | null;
  /** g */
  mass: number;
  /** mL; null: unknown, it does not go in the cylinder. */
  volume: number | null;
  /** The height in the cylinder, in mL of the cylinder (see the top of this file). */
  height: number;
  /** Fits in the cylinder. */
  fits: boolean;
};

export type Place = { id: PlaceId; g: number };

export type Settings = {
  language: Language;
  places: Place[];
  instruments: InstrumentId[];
  objects: Thing[];
  scaleOnOff: boolean;
  /** "mass": a balance, the same mass everywhere; "earth": a scale calibrated on Earth (shows m · g / g of Earth). */
  scaleType: "mass" | "earth";
  /** g */
  scaleCapacity: number;
  /** g */
  scaleResolution: number;
  /** N */
  dynamometerMax: number;
  /** N between two ticks */
  dynamometerStep: number;
  /** mL at the brim: more overflows. */
  cylinderCapacity: number;
  /** mL at the top graduation: higher cannot be read. */
  cylinderMax: number;
  /** mL between two graduations. */
  cylinderStep: number;
  waterMax: number;
  waterStep: number;
  gEarth: number;
  showG: boolean;
  showReadings: boolean;
  answers: AnswerField[];
  answerObject: string;
  answerPlace: PlaceId;
  massUnit: "g" | "kg";
  densityUnit: "g/mL" | "g/cm3" | "kg/m3";
  /** percent */
  tolerance: number;
};

/** The built-in objects: the statuette of Delor (gold: 19 g/mL) and the meteorite of ForceGravite (iron, too big for the cylinder). */
export const BUILT_IN_OBJECTS: Record<Exclude<Kind, "custom">, { mass: number; volume: number; height?: number }> = {
  statuette: { mass: 190, volume: 10, height: 60 },
  meteorite: { mass: 40000, volume: 5000 },
  stone: { mass: 81, volume: 30, height: 60 },
  cube: { mass: 27, volume: 10, height: 22 },
};

export const DEFAULT_G: Record<PlaceId, number> = { earth: 9.8, moon: 1.6, mars: 3.6 };

// ---- numbers -------------------------------------------------------------------------------------------------------

export const num = (text: unknown): number | null => {
  if (typeof text === "number") return isFinite(text) ? text : null;
  if (typeof text !== "string") return null;
  const clean = text.trim().replace(/−/g, "-").replace(/\s/g, "").replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(clean)) return null;
  const value = Number(clean);
  return isFinite(value) ? value : null;
};

export const round = (value: number, decimals = 2) => {
  const f = Math.pow(10, decimals);
  const r = Math.round(value * f) / f;
  return Object.is(r, -0) ? 0 : r;
};

/** 54.5 → "54.5" (en), "54,5" (nl, fr); up to `decimals` decimals, no trailing zeros unless fixed. */
export const formatNumber = (value: number, language: Language, decimals = 2, fixed = false): string => {
  if (!isFinite(value)) return "–";
  let text = fixed ? value.toFixed(decimals) : String(round(value, decimals));
  if (/^-0(\.0*)?$/.test(text)) text = text.slice(1);
  text = text.replace("-", "−");
  return language === "en" ? text : text.replace(".", ",");
};

// ---- settings ------------------------------------------------------------------------------------------------------

const bool = (value: unknown, fallback: boolean) => {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "true" || text === "1" || text === "yes") return true;
  if (text === "false" || text === "0" || text === "no") return false;
  return fallback;
};

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => {
  const text = String(value ?? "").trim().toLowerCase();
  return options.find((o) => o.toLowerCase() === text) ?? fallback;
};

const positive = (value: unknown, fallback: number) => {
  const n = num(value);
  return n !== null && n > 0 ? n : fallback;
};

/** "earth, moon; mars" → the known words in that order, once each. */
export const parseList = <T extends string>(text: unknown, options: readonly T[], aliases: Record<string, T> = {}): T[] => {
  const found: T[] = [];
  for (const part of String(text ?? "").split(/[,;\s]+/)) {
    const word = part.trim().toLowerCase();
    const id = options.find((o) => o === word) ?? aliases[word];
    if (id && !found.includes(id)) found.push(id);
  }
  return found;
};

const PLACE_ALIASES: Record<string, PlaceId> = { aarde: "earth", terre: "earth", maan: "moon", lune: "moon" };

/** "190 g", "40 kg", "0,5 kg", "190" (g) → g. */
export const parseMass = (text: unknown): number | null => {
  const match = /^\s*([-+]?[\d.,]+(?:e[-+]?\d+)?)\s*(mg|g|kg)?\s*$/i.exec(String(text ?? ""));
  const value = match ? num(match[1]) : null;
  if (value === null || value <= 0) return null;
  const unit = (match![2] ?? "g").toLowerCase();
  return unit === "kg" ? value * 1000 : unit === "mg" ? value / 1000 : value;
};

/** "10 mL", "10 cm3", "10 cm³", "1,5 L", "10" (mL) → mL; empty or anything else null. */
export const parseVolume = (text: unknown): number | null => {
  const match = /^\s*([-+]?[\d.,]+(?:e[-+]?\d+)?)\s*(ml|cm3|cm³|l|dm3|dm³)?\s*$/i.exec(String(text ?? ""));
  const value = match ? num(match[1]) : null;
  if (value === null || value <= 0) return null;
  const unit = (match![2] ?? "ml").toLowerCase();
  return unit === "l" || unit.startsWith("dm") ? value * 1000 : value;
};

/** The height of an object in the cylinder: the author's, else its own, else six times its volume, at most 60% of the cylinder. */
const heightOf = (volume: number, capacity: number, wanted: number | null) =>
  wanted !== null && wanted > volume * 1.05 ? wanted : Math.max(volume * 1.2, Math.min(volume * 6, capacity * 0.6));

/**
 * The objects, one per line: a built-in name ("statuette", "meteorite", "stone", "cube"; several on a line with commas),
 * or "names; mass; volume; height" with the names as "English | Nederlands | Français", the mass in g or kg, the volume
 * in mL (empty: it does not fit in the cylinder) and optionally its height in the cylinder in mL. A built-in name
 * with a mass or a volume changes those. At most 6 objects; none: the statuette.
 */
export const parseObjects = (text: unknown, capacity: number): Thing[] => {
  const objects: Thing[] = [];
  const lines = String(text ?? "").split(/\r?\n/);
  lines.forEach((line, index) => {
    const raw = line.trim();
    if (!raw) return;
    const parts = raw.split(";").map((p) => p.trim());
    const kind = BUILT_IN.find((b) => b === parts[0].toLowerCase());
    if (parts.length === 1) {
      for (const word of raw.split(",")) {
        const id = BUILT_IN.find((b) => b === word.trim().toLowerCase());
        if (id) add(id, id, null, null, null, null);
      }
      return;
    }
    if (kind) {
      add(kind, kind, null, parseMass(parts[1]), parts.length > 2 ? parseVolume(parts[2]) ?? -1 : null, num(parts[3]));
      return;
    }
    const mass = parseMass(parts[1]);
    if (mass === null) return;
    const [en, nl, fr] = parts[0].split("|").map((n) => n.trim());
    if (!en) return;
    add(`object${index + 1}`, "custom", { en, nl: nl || en, fr: fr || en }, mass, parseVolume(parts[2]) ?? -1, num(parts[3]));
  });
  if (!objects.length) add("statuette", "statuette", null, null, null, null);
  return objects.slice(0, 6);

  /** volume -1: none (does not fit). */
  function add(id: string, kind: Kind, names: Names | null, mass: number | null, volume: number | null, height: number | null) {
    if (objects.some((o) => o.id === id)) return;
    const own = kind === "custom" ? null : BUILT_IN_OBJECTS[kind];
    const v = volume === -1 ? null : volume ?? own?.volume ?? null;
    const m = mass ?? own?.mass ?? 100;
    const fits = v !== null && v <= capacity / 2;
    objects.push({
      id, kind, names, mass: m, volume: v,
      height: v === null ? 0 : heightOf(v, capacity, height ?? (volume === null ? own?.height ?? null : null)),
      fits,
    });
  }
};

/** A tick distance that gives about `count` labels between 0 and max: 1, 2, 5, 10, 20, … */
export const niceStep = (max: number, count = 5) => {
  const raw = max / count;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 5, 10].map((k) => k * p).find((s) => s >= raw * 0.999) ?? 10 * p;
};

export const parseSettings = (p: Record<string, unknown>): Settings => {
  const language = oneOf(p.language, ["en", "nl", "fr"] as const, "en");
  const gOf: Record<PlaceId, number> = {
    earth: positive(p.gEarth, DEFAULT_G.earth),
    moon: positive(p.gMoon, DEFAULT_G.moon),
    mars: positive(p.gMars, DEFAULT_G.mars),
  };
  let placeIds = parseList(p.places, PLACES, PLACE_ALIASES);
  if (!placeIds.length) placeIds = [...PLACES];
  const instruments = INSTRUMENTS.filter((i) => bool(p[`show${i[0].toUpperCase()}${i.slice(1)}`], true));
  if (!instruments.length) instruments.push("scale");

  const cylinderCapacity = positive(p.cylinderCapacity, 100);
  const cylinderMax = Math.min(cylinderCapacity, positive(p.cylinderMax, Math.min(90, cylinderCapacity)));
  const cylinderStep = Math.min(cylinderMax, positive(p.cylinderStep, 5));
  const waterMax = positive(p.waterMax, 140);
  const waterStep = Math.min(waterMax, positive(p.waterStep, 5));
  const dynamometerMax = positive(p.dynamometerMax, 500);
  const dynamometerStep = Math.min(dynamometerMax, positive(p.dynamometerStep, 10));
  const objects = parseObjects(p.objects, cylinderCapacity);

  const answers = parseList(p.answers, ANSWER_FIELDS, { massa: "mass", masse: "mass", gewicht: "weight", poids: "weight", dichtheid: "density" });
  const wantedObject = String(p.answerObject ?? "").trim().toLowerCase();
  const byNumber = num(wantedObject);
  const answerObject =
    objects.find((o) => o.id === wantedObject)?.id ??
    (byNumber !== null ? objects.find((o) => o.id === `object${byNumber}`)?.id ?? objects[byNumber - 1]?.id : undefined) ??
    objects[0].id;
  const answerPlace = parseList(p.answerPlace, PLACES, PLACE_ALIASES).find((id) => placeIds.includes(id)) ?? placeIds[0];

  return {
    language,
    places: placeIds.map((id) => ({ id, g: gOf[id] })),
    instruments,
    objects,
    scaleOnOff: bool(p.scaleOnOff, true),
    scaleType: oneOf(p.scaleType, ["mass", "earth"] as const, "mass"),
    scaleCapacity: positive(p.scaleCapacity, 50) * 1000,
    scaleResolution: positive(p.scaleResolution, 1),
    dynamometerMax,
    dynamometerStep,
    cylinderCapacity,
    cylinderMax,
    cylinderStep,
    waterMax,
    waterStep,
    gEarth: gOf.earth,
    showG: bool(p.showG, false),
    showReadings: bool(p.showReadings, true),
    answers,
    answerObject,
    answerPlace,
    massUnit: oneOf(p.massUnit, ["g", "kg"] as const, "g"),
    densityUnit: oneOf(p.densityUnit, ["g/mL", "g/cm3", "kg/m3"] as const, "g/mL"),
    tolerance: Math.max(0, num(p.tolerance) ?? 2),
  };
};

// ---- the bench -----------------------------------------------------------------------------------------------------

export type Reading = {
  place: PlaceId;
  instrument: InstrumentId;
  /** The object on the instrument; null: none (the scale with nothing on it, the cylinder with only water). */
  object: string | null;
  /** What the instrument shows; null: nothing can be read (see note). */
  value: number | null;
  unit: "g" | "N" | "mL";
  /** off, overload (scale); overRange (dynamometer); partly, aboveScale, overflow (cylinder). */
  note?: "off" | "overload" | "overRange" | "partly" | "aboveScale" | "overflow";
};

export type Bench = {
  place: PlaceId;
  /** Where each object is, by id; an object that is missing is on the table. */
  placements: Record<string, Location>;
  /** mL of water poured in the cylinder. */
  water: number;
  scaleOn: boolean;
  /** g */
  tare: number;
};

export const placeOf = (s: Settings, id: PlaceId) => s.places.find((p) => p.id === id) ?? s.places[0];
export const objectOf = (s: Settings, id: string) => s.objects.find((o) => o.id === id);
export const locationOf = (b: Bench, id: string): Location => b.placements[id] ?? "table";
/** The object on an instrument, if any. */
export const objectOn = (s: Settings, b: Bench, at: InstrumentId) => s.objects.find((o) => locationOf(b, o.id) === at) ?? null;

export const initialBench = (s: Settings): Bench => ({ place: s.places[0].id, placements: {}, water: 0, scaleOn: !s.scaleOnOff, tare: 0 });

/** The level in the cylinder and how much of the object is under water. */
export const cylinderLevel = (water: number, thing: Thing | null) => {
  if (!thing || thing.volume === null) return { level: water, submerged: 0, partly: false };
  const f = thing.volume / thing.height;
  if (water >= (1 - f) * thing.height) return { level: water + thing.volume, submerged: thing.volume, partly: false };
  const level = water / (1 - f);
  return { level, submerged: f * level, partly: true };
};

/** What the scale weighs (gross, g) before the tare. */
export const scaleLoad = (s: Settings, b: Bench) => {
  const thing = objectOn(s, b, "scale");
  if (!thing) return 0;
  return s.scaleType === "earth" ? (thing.mass * placeOf(s, b.place).g) / s.gEarth : thing.mass;
};

const snap = (value: number, step: number) => round(Math.round(value / step) * step, 6);

/** What each instrument on the bench shows now. */
export const readingsOf = (s: Settings, b: Bench): Record<InstrumentId, Reading> => {
  const place = placeOf(s, b.place);
  const onScale = objectOn(s, b, "scale");
  const load = scaleLoad(s, b);
  const scale: Reading = { place: place.id, instrument: "scale", object: onScale?.id ?? null, value: null, unit: "g" };
  if (!b.scaleOn) scale.note = "off";
  else if (load > s.scaleCapacity) scale.note = "overload";
  else scale.value = snap(load - b.tare, s.scaleResolution);

  const hanging = objectOn(s, b, "dynamometer");
  const force = hanging ? (hanging.mass / 1000) * place.g : 0;
  const dynamometer: Reading = { place: place.id, instrument: "dynamometer", object: hanging?.id ?? null, value: round(force, 2), unit: "N" };
  if (force > s.dynamometerMax) {
    dynamometer.value = null;
    dynamometer.note = "overRange";
  }

  const sunk = objectOn(s, b, "cylinder");
  const { level, partly } = cylinderLevel(b.water, sunk);
  const cylinder: Reading = { place: place.id, instrument: "cylinder", object: sunk?.id ?? null, value: round(level, 1), unit: "mL" };
  if (level > s.cylinderCapacity + 1e-9) cylinder.note = "overflow";
  else if (level > s.cylinderMax + 1e-9) cylinder.note = "aboveScale";
  else if (partly) cylinder.note = "partly";
  if (cylinder.note === "overflow" || cylinder.note === "aboveScale") cylinder.value = null;
  return { scale, dynamometer, cylinder };
};

/** The level the cylinder shows (at most the brim) and whether it overflows. */
export const shownLevel = (s: Settings, b: Bench) => {
  const { level, partly } = cylinderLevel(b.water, objectOn(s, b, "cylinder"));
  return { level: Math.min(level, s.cylinderCapacity), overflow: level > s.cylinderCapacity + 1e-9, partly };
};

/** A reading worth logging: the scale when it is on, the dynamometer with something on it, the cylinder with water or an object. */
const loggable = (r: Reading, b: Bench) =>
  r.instrument === "scale" ? b.scaleOn : r.instrument === "dynamometer" ? r.object !== null : r.object !== null || b.water > 0;

const same = (a: Reading, b: Reading) => a.place === b.place && a.object === b.object && a.value === b.value && a.note === b.note;

/** At most this many readings in the log. */
export const MAX_READINGS = 300;

/** The readings that changed between two benches (on the instruments the item shows), to add to the log. */
export const newReadings = (s: Settings, before: Bench, after: Bench): Reading[] => {
  const old = readingsOf(s, before);
  const now = readingsOf(s, after);
  return s.instruments
    .filter((i) => loggable(now[i], after) && (!loggable(old[i], before) || !same(old[i], now[i])))
    .map((i) => now[i]);
};

/** Whether an object can go to a location: the instrument is on the bench, and only what fits goes in the cylinder. */
export const canMove = (s: Settings, id: string, to: Location) => {
  const thing = objectOf(s, id);
  if (!thing) return false;
  if (to === "table") return true;
  if (!s.instruments.includes(to)) return false;
  return to !== "cylinder" || thing.fits;
};

/** Moves an object; what was on that instrument goes back to the table. */
export const move = (s: Settings, b: Bench, id: string, to: Location): Bench => {
  if (!canMove(s, id, to)) return b;
  const placements: Record<string, Location> = {};
  for (const o of s.objects) {
    const at = o.id === id ? to : locationOf(b, o.id);
    if (o.id !== id && to !== "table" && at === to) continue; // pushed off
    if (at !== "table") placements[o.id] = at;
  }
  return { ...b, placements };
};

/** "earth:scale moon:dynamometer": every instrument that had an object on it, per place, in the order of first use. */
export const usedOf = (readings: Reading[]) => {
  const used: string[] = [];
  for (const r of readings) {
    const key = `${r.place}:${r.instrument}`;
    if (r.object !== null && !used.includes(key)) used.push(key);
  }
  return used.join(" ");
};

// ---- answers and scoring -------------------------------------------------------------------------------------------

/** The answers the item expects, in the units of the item; null: cannot be known (an object without a volume). */
export const expectedAnswers = (s: Settings): Record<AnswerField, number | null> => {
  const thing = objectOf(s, s.answerObject)!;
  const g = placeOf(s, s.answerPlace).g;
  const density = thing.volume ? thing.mass / thing.volume : null;
  return {
    mass: s.massUnit === "kg" ? thing.mass / 1000 : thing.mass,
    weight: (thing.mass / 1000) * g,
    volume: thing.volume,
    density: density === null ? null : s.densityUnit === "kg/m3" ? density * 1000 : density,
  };
};

export const within = (value: number, expected: number, tolerancePercent: number) =>
  Math.abs(value - expected) <= Math.max(Math.abs(expected) * (tolerancePercent / 100), 1e-9);

export type Score = { values: Partial<Record<AnswerField, number>>; right: Partial<Record<AnswerField, boolean>>; score: number; maxscore: number };

/** The candidate's answers (text) checked against the expected values, one point per field. */
export const scoreAnswers = (s: Settings, answers: Partial<Record<AnswerField, string>>): Score => {
  const expected = expectedAnswers(s);
  const values: Score["values"] = {};
  const right: Score["right"] = {};
  let score = 0;
  for (const field of s.answers) {
    const value = num(answers[field] ?? "");
    if (value === null) continue;
    values[field] = value;
    const e = expected[field];
    right[field] = e !== null && within(value, e, s.tolerance);
    if (right[field]) score++;
  }
  return { values, right, score, maxscore: s.answers.length };
};

/** The unit of an answer field, as the candidate sees it. */
export const unitOf = (s: Settings, field: AnswerField) =>
  field === "mass" ? s.massUnit : field === "weight" ? "N" : field === "volume" ? "mL" : s.densityUnit === "g/cm3" ? "g/cm³" : s.densityUnit === "kg/m3" ? "kg/m³" : "g/mL";

/** A bench from a saved state or a response, checked against the settings. */
export const validBench = (s: Settings, value: any): Bench | null => {
  if (!value || typeof value !== "object") return null;
  const place = s.places.find((p) => p.id === value.place)?.id ?? s.places[0].id;
  const placements: Record<string, Location> = {};
  const taken = new Set<string>();
  for (const [id, at] of Object.entries(value.placements ?? {})) {
    if (typeof at !== "string" || at === "table" || taken.has(at) || !canMove(s, id, at as Location)) continue;
    placements[id] = at as Location;
    taken.add(at);
  }
  const water = num(value.water);
  const tare = num(value.tare);
  return {
    place,
    placements,
    water: water === null ? 0 : Math.max(0, Math.min(s.waterMax, water)),
    scaleOn: !s.scaleOnOff || value.scaleOn === true,
    tare: tare ?? 0,
  };
};

/** Readings from a saved state or a response, checked. */
export const validReadings = (value: unknown): Reading[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((r: any) => r && PLACES.includes(r.place) && INSTRUMENTS.includes(r.instrument) && ["g", "N", "mL"].includes(r.unit))
    .map((r: any) => {
      const reading: Reading = {
        place: r.place, instrument: r.instrument, object: typeof r.object === "string" ? r.object : null,
        value: typeof r.value === "number" && isFinite(r.value) ? r.value : null, unit: r.unit,
      };
      if (typeof r.note === "string") reading.note = r.note;
      return reading;
    })
    .slice(-MAX_READINGS);
};
