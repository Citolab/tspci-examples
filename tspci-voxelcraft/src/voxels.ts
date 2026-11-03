// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/voxelcraft, © OpenPCI (Aarhus University and Aalborg
// University: Elias J.T. Hansen, Anna Rusmann, Jeppe Bundsgaard)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The voxels, as the original Voxelcraft stores them: { p: [x, y, z], c: 0xrrggbb }. A cube is 50 wide and its
// position is its centre, so on the ground x, y and z are 25 + 50·n (the grid is 20 × 20 cubes, x and z from -475 to
// 475; y from 25 up). The response is JSON.stringify({ data: voxels, score }), as in the original.

export type Vec3 = [number, number, number];
export type Voxel = { p: Vec3; c: number };

export const CUBE = 50;
/** Cubes per side of the ground grid (the original: a 1000-wide plane in steps of 50). */
export const GRID = 20;
/** How high a building may get, in cubes. */
export const MAX_HEIGHT = 20;
const HALF = (GRID * CUBE) / 2;

/** The original's 14 colours (pciCreator.js getDefaultProperties). */
export const DEFAULT_COLORS = [
  "#cc0000", "#cc6900", "#f7ef00", "#afe000", "#00b512", "#00bfa5", "#009bbf",
  "#008af4", "#ae00f4", "#f400e3", "#f40000", "#cccccc", "#ffffff", "#222222",
];

/** One colour per line (the original), or separated by commas, semicolons or spaces. Only #rgb / #rrggbb. */
export const parseColors = (value: string | undefined): string[] => {
  const colors = String(value ?? "")
    .split(/[\s,;]+/)
    .map((c) => c.trim().toLowerCase())
    .filter((c) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(c))
    .map((c) => (c.length === 4 ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c));
  return colors.length ? Array.from(new Set(colors)) : DEFAULT_COLORS;
};

export const hexToInt = (hex: string) => parseInt(hex.replace("#", ""), 16);
export const intToHex = (c: number) => `#${(c & 0xffffff).toString(16).padStart(6, "0")}`;

/** The centre of the cell a coordinate is in (the original: divideScalar(50).floor().multiplyScalar(50).addScalar(25)). */
export const snap = (n: number) => Math.floor(n / CUBE) * CUBE + CUBE / 2;
export const key = (p: Vec3) => `${p[0]},${p[1]},${p[2]}`;

export const inBounds = (p: Vec3) =>
  p[0] > -HALF && p[0] < HALF && p[2] > -HALF && p[2] < HALF && p[1] > 0 && p[1] < MAX_HEIGHT * CUBE;

/** The cell index (0 … GRID-1, 0 … MAX_HEIGHT-1) of a position, and back. */
export const toCell = (p: Vec3): Vec3 => [(p[0] - CUBE / 2 + HALF) / CUBE, (p[1] - CUBE / 2) / CUBE, (p[2] - CUBE / 2 + HALF) / CUBE];
export const fromCell = (x: number, y: number, z: number): Vec3 => [x * CUBE - HALF + CUBE / 2, y * CUBE + CUBE / 2, z * CUBE - HALF + CUBE / 2];

/** A colour as the original saved it: a number, or a THREE.Color as JSON ({ r, g, b } from 0 to 1), or "#rrggbb". */
const parseColor = (c: unknown): number | null => {
  if (typeof c === "number" && Number.isFinite(c)) return c & 0xffffff;
  if (typeof c === "string" && /^#?[0-9a-f]{6}$/i.test(c.trim())) return hexToInt(c.trim());
  if (c && typeof c === "object" && ["r", "g", "b"].every((k) => typeof c[k] === "number")) {
    const v = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255)));
    return (v(c["r"]) << 16) | (v(c["g"]) << 8) | v(c["b"]);
  }
  return null;
};

/**
 * Voxels from what the original accepted: an array of { p, c }, a { data: [...] } response, or its JSON. Positions are
 * snapped to the grid; doubles (the last wins) and voxels outside the grid are left out. `clip` false keeps voxels
 * outside the grid (a target shape is relative, it may be anywhere).
 */
export const parseVoxels = (value: unknown, clip = true): Voxel[] => {
  let data: unknown = value;
  if (typeof data === "string") {
    if (!data.trim()) return [];
    try {
      data = JSON.parse(data);
    } catch {
      return [];
    }
  }
  if (data && !Array.isArray(data) && Array.isArray((data as { data?: unknown }).data)) data = (data as { data: unknown }).data;
  if (!Array.isArray(data)) return [];
  const byKey = new Map<string, Voxel>();
  for (const v of data) {
    const p = v?.p;
    const c = parseColor(v?.c);
    if (!Array.isArray(p) || p.length !== 3 || !p.every((n) => typeof n === "number" && Number.isFinite(n)) || c === null) continue;
    const voxel: Voxel = { p: [snap(p[0]), snap(p[1]), snap(p[2])], c };
    if (clip && !inBounds(voxel.p)) continue;
    byKey.set(key(voxel.p), voxel);
  }
  return sortVoxels(Array.from(byKey.values()));
};

/** One building, one response: sorted bottom to top, then by x and z, whatever the order of building. */
export const sortVoxels = (voxels: Voxel[]) =>
  voxels.slice().sort((a, b) => a.p[1] - b.p[1] || a.p[0] - b.p[0] || a.p[2] - b.p[2]);

/**
 * The original's scoring API, Scoring.find(shape, useColor, wsColor) (game/scoringapi.js): every place where `shape`
 * stands in the building, turned a quarter, half or three quarters around the vertical axis or not. With `useColor`
 * the colours must match too. Voxels of the shape in `wsColor` mark space that must stay empty. Returns the positions
 * of the building's voxels where the shape's first (non-empty) voxel lands.
 */
export const findShape = (voxels: Voxel[], shape: Voxel[], useColor: boolean, wsColor = -1): Vec3[] => {
  if (!shape.length) return [];
  const s = shape.map((v) => ({ p: v.p.slice() as Vec3, c: v.c }));
  // don't start with an empty-space voxel: put them at the end
  for (let tries = 0; s[0].c === wsColor && tries < s.length; tries++) s.push(s.shift());
  const origin = s[0].p.slice();
  const relative = s.map((v) => ({ p: v.p.map((n, i) => n - origin[i]) as Vec3, c: v.c }));
  const building = new Map(voxels.map((v) => [key(v.p), v.c]));
  const found = new Map<string, Vec3>();
  for (let rotation = 0; rotation < 4; rotation++) {
    // a quarter turn around y, as THREE.Vector3.applyAxisAngle((0, 1, 0), rotation · π/2)
    const turned = relative.map(({ p, c }) => {
      let [x, , z] = p;
      for (let r = 0; r < rotation; r++) [x, z] = [z, -x];
      return { p: [x, p[1], z] as Vec3, c };
    });
    for (const anchor of voxels) {
      const fits = turned.every(({ p, c }) => {
        const at = key([anchor.p[0] + p[0], anchor.p[1] + p[1], anchor.p[2] + p[2]]);
        const there = building.get(at);
        if (c === wsColor) return there === undefined; // empty space must stay empty
        return there !== undefined && (!useColor || there === c);
      });
      if (fits) found.set(key(anchor.p), anchor.p);
    }
  }
  return Array.from(found.values());
};

export type Scoring = { target: Voxel[]; useColor: boolean; wsColor: number };

/** 1 when the target shape stands in the building, 0 when not; undefined without a target (no score in the response). */
export const scoreFor = (voxels: Voxel[], scoring: Scoring): number | undefined =>
  scoring.target.length ? (findShape(voxels, scoring.target, scoring.useColor, scoring.wsColor).length > 0 ? 1 : 0) : undefined;

/** The response string, the original's format: {"data":[{"p":[x,y,z],"c":rgb}],"score":…}. */
export const responseString = (voxels: Voxel[], scoring: Scoring) =>
  JSON.stringify({ data: sortVoxels(voxels), score: scoreFor(voxels, scoring) });
