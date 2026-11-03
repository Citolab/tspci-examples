// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/textgapmatch, © OpenPCI (Aarhus University and Aalborg
// University: Elias J.T. Hansen, Anna Rusmann, Jeppe Bundsgaard)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The settings as the PCI uses them, the rules for placing a label, and the response, all without a UI.

/** A drop zone on the image, in percentages of the image: data-dropzones holds [x, y, width, height, id] per zone. */
export type Zone = { id: string; x: number; y: number; w: number; h: number };

/** Which labels (their index in the list of labels) lie in which zone, in order. */
export type Placed = Record<string, number[]>;

export type Rules = {
  /** data-infinite-texts: a label stays in the list when it is dropped, so it can be used in more zones. */
  infinite: boolean;
  /** data-max-dropped: the most labels a zone takes; 0: no maximum. */
  max: number;
};

/** The example: a plant (example.svg) with four zones. */
export const EXAMPLE_ZONES: Zone[] = [
  { id: "dropzone_1", x: 6.25, y: 17.5, w: 23.4375, h: 11 },
  { id: "dropzone_2", x: 6.25, y: 47.5, w: 23.4375, h: 11 },
  { id: "dropzone_3", x: 70.3125, y: 37.5, w: 23.4375, h: 11 },
  { id: "dropzone_4", x: 70.3125, y: 82.5, w: 23.4375, h: 11 },
];

/** Object.fromEntries, for the es2017 lib of the tsconfig. */
const fromEntries = <T>(entries: [string, T][]): Record<string, T> =>
  entries.reduce((acc, [k, v]) => ((acc[k] = v), acc), {} as Record<string, T>);

const round = (n: number) => Math.round(n * 100) / 100;

/** data-dropzones, as the original wrote it: a JSON array of [x, y, w, h, id]; a zone without an id is dropzone_<i>. */
export const parseZones = (value: unknown): Zone[] => {
  let list: unknown = value;
  if (typeof value === "string") {
    if (!value.trim()) return EXAMPLE_ZONES;
    try {
      list = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const zones: Zone[] = [];
  list.forEach((z, i) => {
    if (!Array.isArray(z) || z.length < 4) return;
    const [x, y, w, h] = z.slice(0, 4).map(Number);
    if ([x, y, w, h].some((n) => !Number.isFinite(n))) return;
    const id = z[4] !== undefined && z[4] !== null && String(z[4]) !== "" ? String(z[4]) : `dropzone_${i}`;
    if (zones.some((other) => other.id === id)) return; // the response is keyed by id: one zone per id
    zones.push({ id, x, y, w, h });
  });
  return zones;
};

export const serializeZones = (zones: Zone[]) =>
  JSON.stringify(zones.map((z) => [round(z.x), round(z.y), round(z.w), round(z.h), z.id]));

/** The next free dropzone_<n>. */
export const nextZoneId = (zones: Zone[]) => {
  let n = 1;
  while (zones.some((z) => z.id === `dropzone_${n}`)) n++;
  return `dropzone_${n}`;
};

/** data-strings: one label per line; empty lines are skipped. */
export const parseLabels = (value: string): string[] =>
  String(value ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

export const isTrue = (value: unknown) => String(value).toLowerCase() === "true";

export const parseMax = (value: unknown) => {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Every zone, empty or not, so the response always has the same keys. */
export const emptyPlaced = (zones: Zone[]): Placed => fromEntries(zones.map((z) => [z.id, []]));

/** Labels in the list: all of them with infinite texts, otherwise the ones not in a zone. */
export const inList = (labels: string[], placed: Placed, rules: Rules) =>
  labels.map((_, i) => i).filter((i) => rules.infinite || !Object.values(placed).some((l) => l.includes(i)));

export type Source = { label: number; zone: string | null };
export type Target = { zone: string | null; /** insert before this position */ index?: number; /** a label lying there */ onto?: number };

/** Whether a zone takes the label (the original: not when full, not twice the same label). */
export const accepts = (placed: Placed, rules: Rules, from: Source, zone: string) => {
  const here = placed[zone] ?? [];
  if (from.zone === zone) return true;
  if (here.includes(from.label)) return false;
  return !(rules.max && here.length >= rules.max);
};

/**
 * Moves a label: from the list (zone null) or a zone, to a zone or back to the list (zone null). Returns the new
 * placement, or the same object when the move is not allowed.
 */
export const move = (placed: Placed, rules: Rules, from: Source, to: Target): Placed => {
  const next: Placed = fromEntries(Object.entries(placed).map(([k, v]) => [k, [...v]]));
  const take = () => {
    if (from.zone === null) return;
    next[from.zone] = next[from.zone].filter((l) => l !== from.label);
  };
  if (to.zone === null) {
    if (from.zone === null) return placed;
    take();
    return next;
  }
  if (!(to.zone in next)) return placed;
  const target = next[to.zone];

  // a label from one zone dropped onto a label in another: they change places (as in the original)
  if (from.zone !== null && from.zone !== to.zone && to.onto !== undefined && target.includes(to.onto)) {
    const source = next[from.zone];
    if (target.includes(from.label) || source.includes(to.onto)) return placed;
    source[source.indexOf(from.label)] = to.onto;
    target[target.indexOf(to.onto)] = from.label;
    return next;
  }
  if (!accepts(placed, rules, from, to.zone)) return placed;
  if (from.zone === null && !rules.infinite && Object.values(placed).some((l) => l.includes(from.label))) return placed;

  let index = to.index ?? target.length;
  if (from.zone === to.zone) {
    const old = target.indexOf(from.label);
    if (old < 0) return placed;
    if (old < index) index--;
  }
  take();
  const list = next[to.zone];
  list.splice(Math.max(0, Math.min(index, list.length)), 0, from.label);
  return next;
};

/** The response the original gave: per zone id, the texts of the labels in it, in order. */
export const toResult = (zones: Zone[], labels: string[], placed: Placed) =>
  fromEntries(zones.map((z) => [z.id, (placed[z.id] ?? []).map((l) => labels[l]).filter((t) => t !== undefined)]));

/** Back from texts to labels: a response, or the state the original saved ({ response: { zone: [texts] } }). */
export const fromResult = (result: unknown, zones: Zone[], labels: string[], rules: Rules): Placed => {
  const placed = emptyPlaced(zones);
  if (!result || typeof result !== "object") return placed;
  const used = new Set<number>();
  for (const zone of zones) {
    const texts = (result as Record<string, unknown>)[zone.id];
    if (!Array.isArray(texts)) continue;
    for (const text of texts) {
      // the same text twice in the list: the first one not used yet
      const label = labels.findIndex((l, i) => l === String(text) && (rules.infinite || !used.has(i)));
      if (label < 0 || placed[zone.id].includes(label)) continue;
      if (rules.max && placed[zone.id].length >= rules.max) continue;
      used.add(label);
      placed[zone.id].push(label);
    }
  }
  return placed;
};

/** Keeps a saved placement within the zones and labels there are now. */
export const clean = (saved: unknown, zones: Zone[], labels: string[], rules: Rules): Placed => {
  const placed = emptyPlaced(zones);
  if (!saved || typeof saved !== "object") return placed;
  const used = new Set<number>();
  for (const zone of zones) {
    const list = (saved as Record<string, unknown>)[zone.id];
    if (!Array.isArray(list)) continue;
    for (const l of list) {
      const label = Number(l);
      if (!Number.isInteger(label) || label < 0 || label >= labels.length || placed[zone.id].includes(label)) continue;
      if ((!rules.infinite && used.has(label)) || (rules.max && placed[zone.id].length >= rules.max)) continue;
      used.add(label);
      placed[zone.id].push(label);
    }
  }
  return placed;
};

export const isEmpty = (placed: Placed) => Object.values(placed).every((l) => l.length === 0);

/** data-dropped-style ("color: red; font-size: 18px") as a style object for Preact. */
export const parseStyle = (css: string): Record<string, string> => {
  const style: Record<string, string> = {};
  String(css ?? "")
    .split(";")
    .forEach((rule) => {
      const at = rule.indexOf(":");
      if (at < 1) return;
      const name = rule.slice(0, at).trim();
      const value = rule.slice(at + 1).trim();
      if (!/^-?-?[a-zA-Z][a-zA-Z0-9-]*$/.test(name) || !value || /url\s*\(|expression\s*\(/i.test(value)) return;
      const key = name.startsWith("--") ? name : name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      style[key] = value;
    });
  return style;
};
