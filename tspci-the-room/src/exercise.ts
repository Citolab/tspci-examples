// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/theroom, © openPCI: Elias J.T. Hansen, Anna Rusmann and
// Jeppe Bundsgaard (Aarhus University and Aalborg University)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import type { ScoringRule } from "./scoring";

/**
 * The exercise: the room, the furniture the candidate may place (and how many of each), what is in the room at the
 * start and the scoring rules. Two kinds:
 *
 * - **built in / inline JSON** (this file): the room and the furniture are drawn from simple shapes, so the PCI needs
 *   nothing outside its own bundle. `data-exercise` is the name of a built-in exercise or the JSON itself.
 * - **the original's glTF exercises**: with `data-gameurl` set, `data-exercise` is a file in `<gameurl>/exercises/`
 *   in the format of openPCI's The Room (`scene`, `assets`, `objects`; `rules` instead of `scoringFunction`), see model.ts.
 */

export type Vec3 = [number, number, number];
/** A text in one language, or one per language. */
export type Label = string | Record<string, string>;

/** A piece of furniture in the room. `id` is the asset (the original's model path), `uid` this one piece. */
export type Placed = {
  uid: string;
  id: string;
  pos: Vec3;
  /** Euler angles (XYZ); the candidate only turns around y. */
  rot: Vec3;
  /** Placed by the author; the candidate cannot move it. */
  static?: boolean;
};

export type ShapeKind =
  | "box"
  | "table"
  | "chair"
  | "sofa"
  | "shelf"
  | "counter"
  | "rug"
  | "playcorner"
  | "plant"
  | "person"
  | "showcase"
  | "bed";

export type Side = "front" | "back" | "left" | "right";

export type AssetDef = {
  id: string;
  label?: Label;
  shape?: ShapeKind;
  /** metres, before turning: width along x, depth along z (the front faces +z) */
  width?: number;
  depth?: number;
  height?: number;
  color?: string;
  /** How many the candidate can have in the room (including those there at the start). */
  count?: number;
  /** Chairs around a table: 2 (left and right) or 4 (front and back); 0 none. */
  seats?: number;
  /** Snaps its back against a wall within 40 cm (the original's `snap` plane). */
  wallSnap?: boolean;
  /** Sides that snap to the same sides of other furniture (the original's `obj_snap` planes). */
  objectSnap?: Side[];
  /** Object zones for the scoring rules (`zoneClear`): a box of `depth` metres on one side. */
  zones?: { name: string; side: Side; depth: number }[];
};

export type Wall = "north" | "south" | "east" | "west";

export type FixtureDef = {
  kind: "door" | "window" | "block";
  /** door and window: the wall, and where along it (metres from the middle; west to east, north to south) */
  wall?: Wall;
  at?: number;
  width?: number;
  height?: number;
  label?: Label;
  /** block: a fixed box on the floor (a pillar, a bar) */
  x?: number;
  z?: number;
  depth?: number;
  color?: string;
  /** a name for the scoring rules (it is part of the room) */
  name?: string;
};

/** An invisible box on the floor for the scoring rules: `{ "inZone": "<name>" }`. */
export type ZoneDef = { name: string; x: number; z: number; width: number; depth: number; label?: Label };

export type RoomDef = {
  /** metres: x from -width/2 to width/2, z from -depth/2 (north) to depth/2 (south) */
  width: number;
  depth: number;
  height?: number;
  floorColor?: string;
  wallColor?: string;
  fixtures?: FixtureDef[];
  zones?: ZoneDef[];
};

export type ProceduralExercise = {
  id?: string;
  /** Shown above the room when the item has no instruction of its own (data-prompt). */
  prompt?: Label;
  room: RoomDef;
  assets: AssetDef[];
  objects?: { id: string; pos: Vec3 | number[]; rot?: (number | string)[]; static?: boolean }[];
  /** declarative scoring (scoring.ts); the original's JavaScript `scoringFunction` is not supported */
  rules?: ScoringRule[];
};

export type ExerciseSource =
  | { kind: "procedural"; name: string; exercise: ProceduralExercise }
  | { kind: "gltf"; name: string; baseUrl: string };

/**
 * The restaurant of the original, drawn from shapes. The task and the checks of the scoring are those of
 * openPCI's restaurant.json (its scoring function, as rules); the zones have the same names.
 */
const restaurant: ProceduralExercise = {
  id: "restaurant",
  prompt: {
    en:
      "Furnish the restaurant. Put the play corner in the corner by the windows and the buffet against the wall " +
      "next to the kitchen. Tables for two go against a wall, family tables close to the play corner. " +
      "Keep the doors to the kitchen and the toilets and the entrance free, and do not let furniture overlap.",
    nl:
      "Richt het restaurant in. Zet de speelhoek in de hoek bij de ramen en het buffet tegen de muur naast de " +
      "keuken. Tafels voor twee staan tegen een muur, gezinstafels dicht bij de speelhoek. " +
      "Houd de deuren naar de keuken en de toiletten en de ingang vrij, en laat meubels elkaar niet overlappen.",
  },
  room: {
    width: 14,
    depth: 10,
    height: 2.8,
    floorColor: "#c9a77c",
    wallColor: "#f1ece4",
    fixtures: [
      { kind: "door", wall: "north", at: -4, width: 1.2, label: { en: "Kitchen", nl: "Keuken" } },
      { kind: "door", wall: "east", at: -3, width: 1.0, label: { en: "Toilets", nl: "Toiletten" } },
      { kind: "door", wall: "south", at: 3, width: 1.8, label: { en: "Entrance", nl: "Ingang" } },
      { kind: "window", wall: "west", at: 0.5, width: 2.2 },
      { kind: "window", wall: "west", at: 3.4, width: 1.6 },
      { kind: "window", wall: "south", at: -4.5, width: 2.2 },
    ],
    zones: [
      { name: "playarea_zone", x: -5.5, z: 3.5, width: 3, depth: 3, label: { en: "play area", nl: "speelhoek" } },
      { name: "buffetzone", x: -0.4, z: -4.4, width: 4.4, depth: 1.2, label: { en: "buffet", nl: "buffet" } },
      { name: "doortable_zone", x: -4, z: -4.1, width: 2, depth: 1.8, label: { en: "kitchen door", nl: "keukendeur" } },
      { name: "toilet_zone", x: 6.1, z: -3, width: 1.8, depth: 2, label: { en: "toilets", nl: "toiletten" } },
      { name: "entrance_zone", x: 3, z: 4, width: 2.8, depth: 2, label: { en: "entrance", nl: "ingang" } },
    ],
  },
  assets: [
    { id: "table", label: { en: "Family table", nl: "Gezinstafel" }, shape: "table", seats: 4, width: 1.4, depth: 0.9, height: 0.75, color: "#9a6b43", count: 4 },
    { id: "tablefortwo", label: { en: "Table for two", nl: "Tafel voor twee" }, shape: "table", seats: 2, width: 0.8, depth: 0.8, height: 0.75, color: "#6f4a2e", count: 2, wallSnap: true },
    { id: "playcorner", label: { en: "Play corner", nl: "Speelhoek" }, shape: "playcorner", width: 2.4, depth: 2.4, color: "#4f8fd6", count: 1 },
    { id: "buffet", label: { en: "Buffet", nl: "Buffet" }, shape: "counter", width: 2.6, depth: 0.8, height: 0.9, color: "#5b6b7a", count: 1, wallSnap: true },
  ],
  objects: [
    { id: "table", pos: [-1.8, 0, -1.2], rot: [0, 0, 0, "XYZ"] },
    { id: "table", pos: [-1.8, 0, 1.4], rot: [0, 0, 0, "XYZ"] },
    { id: "table", pos: [1.0, 0, -1.2], rot: [0, 0, 0, "XYZ"] },
    { id: "table", pos: [1.0, 0, 1.4], rot: [0, 0, 0, "XYZ"] },
    { id: "tablefortwo", pos: [3.8, 0, -1.2], rot: [0, 0, 0, "XYZ"] },
    { id: "tablefortwo", pos: [3.8, 0, 1.0], rot: [0, 0, 0, "XYZ"] },
    { id: "playcorner", pos: [-4.6, 0, -1.0], rot: [0, 0, 0, "XYZ"] },
    { id: "buffet", pos: [3.5, 0, 3.4], rot: [0, 0, 0, "XYZ"] },
  ],
  // the checks of the original restaurant.json's scoring function, as rules
  rules: [
    { name: "playcorner_in_corner", object: "playcorner", inZone: "playarea" },
    { name: "no_collisions", noOverlap: true },
    { name: "tables_for_two_at_wall", object: "tablefortwo", nearWall: true, value: "count" },
    { name: "family_tables_near_playcorner", object: "^table$", closerTo: "playcorner", than: "tablefortwo" },
    { name: "buffet_in_zone", object: "buffet", inZone: "buffetzone", value: "count" },
    { name: "toilet_free", object: "table", inZone: "toilet", count: "==0" },
    { name: "kitchen_free", object: "table", inZone: "doortable", count: "==0" },
    { name: "entrance_free", object: "table", inZone: "entrance", count: "==0" },
  ],
};

export const builtInExercises: Record<string, ProceduralExercise> = { restaurant };

/**
 * data-exercise and data-gameurl → the exercise. Empty: the restaurant. With a game url: a file of the original
 * (`museum.json`). JSON: an exercise of its own. Otherwise the name of a built-in exercise.
 */
export const exerciseSource = (exercise: string, gameurl: string): ExerciseSource => {
  const text = (exercise ?? "").trim();
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as ProceduralExercise;
      if (parsed?.room && Array.isArray(parsed.assets)) {
        return { kind: "procedural", name: parsed.id || "exercise", exercise: parsed };
      }
    } catch {
      // not JSON: the restaurant below
    }
    return { kind: "procedural", name: "restaurant", exercise: restaurant };
  }
  const url = (gameurl ?? "").trim();
  const name = text || "restaurant";
  if (url && (/\.json$/i.test(name) || !builtInExercises[name])) {
    return { kind: "gltf", name, baseUrl: url.endsWith("/") ? url : `${url}/` };
  }
  const builtIn = builtInExercises[name.replace(/\.json$/i, "")] ?? restaurant;
  return { kind: "procedural", name: builtIn.id ?? name, exercise: builtIn };
};

/** A label in the given language, else English, else the first one, else the fallback. */
export const labelIn = (label: Label | undefined, language: string, fallback: string): string => {
  if (!label) return fallback;
  if (typeof label === "string") return label;
  return label[language] ?? label.en ?? Object.values(label)[0] ?? fallback;
};

/** "museum/montre_svaerd.gltf" → "montre svaerd" */
export const labelFromPath = (path: string) =>
  path.replace(/^.*\//, "").replace(/\.(gltf|glb)$/i, "").replace(/[_-]+/g, " ");

let counter = 0;
export const newUid = () => `o${Date.now().toString(36)}${(counter++).toString(36)}`;

const num = (v: unknown, fallback = 0) => (typeof v === "number" && isFinite(v) ? v : fallback);

/** An object of an exercise or a response ({ id, pos, rot }) → a Placed. */
export const toPlaced = (o: { id: string; pos?: unknown; rot?: unknown; static?: boolean }): Placed | null => {
  if (!o || typeof o.id !== "string") return null;
  const pos = Array.isArray(o.pos) ? o.pos : [];
  const rot = Array.isArray(o.rot) ? o.rot : [];
  return {
    uid: newUid(),
    id: o.id,
    pos: [num(pos[0]), num(pos[1]), num(pos[2])],
    rot: [num(rot[0]), num(rot[1]), num(rot[2])],
    ...(o.static ? { static: true } : {}),
  };
};
