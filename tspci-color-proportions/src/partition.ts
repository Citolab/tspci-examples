// The shape the candidate colours: a rectangle split into parts by straight lines. The author draws it in the PCI's
// authoring mode (authoring.tsx); the item keeps it as JSON in data-partition.
//
// Lines run along a grid of sixteenths of the rectangle's sides, whatever the snap (1/4, 1/8, 1/16): the snap only
// says where the author's next line may go, so changing it never moves a line. The parts are found by flood fill over
// the 16 × 16 cells, so a part is exactly a number of cells and its share of the whole is cells / 256: the
// percentages in the response stay exact.

export const GRID = 16;
export const SNAPS = [4, 8, 16] as const;
export type Snap = (typeof SNAPS)[number];

/** x1, y1, x2, y2 in sixteenths; horizontal or vertical. */
export type Line = [number, number, number, number];

export interface Partition {
  /** The rectangle, in drawing units (32 is one square of the paper behind it). */
  width: number;
  height: number;
  snap: Snap;
  lines: Line[];
}

export interface Region {
  id: string;
  /** Cells as [x, y]; the region's share of the whole is cells.length / 256. */
  cells: [number, number][];
}

export const SIZE = { min: 128, max: 1024, step: 32 };

/** The shape this PCI always had: halves, quarters, eighths and two sixteenths. */
export const DEFAULT_PARTITION: Partition = {
  width: 512,
  height: 768,
  snap: 8,
  lines: [
    [0, 8, 16, 8],
    [8, 8, 8, 16],
    [8, 12, 16, 12],
    [12, 12, 12, 16],
    [12, 14, 16, 14],
  ],
};

/** The ids of DEFAULT_PARTITION's parts before it was a partition (their size in squares), for a saved state. */
export const LEGACY_IDS: Record<string, string> = { "192": "r1", "96": "r2", "48": "r3", "24": "r4", "12A": "r5", "12B": "r6" };

const clampSize = (n: unknown, fallback: number) => {
  const v = Math.round(Number(n) / SIZE.step) * SIZE.step;
  return Number.isFinite(v) ? Math.min(SIZE.max, Math.max(SIZE.min, v)) : fallback;
};

/** A line with its ends in order, on the grid and straight; null when it is none. */
export function normalizeLine(line: number[]): Line | null {
  if (!Array.isArray(line) || line.length !== 4 || !line.every((n) => Number.isInteger(n) && n >= 0 && n <= GRID)) return null;
  const [x1, y1, x2, y2] = line;
  if (x1 !== x2 && y1 !== y2) return null;
  if (x1 === x2 && y1 === y2) return null;
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
}

/**
 * data-partition → a partition; empty or unreadable gives the default shape. Also takes the parsed object: some hosts
 * (TAO's item creator, after loading a saved item) hand a JSON property over as an object.
 */
export function parsePartition(value: string | object | undefined | null): Partition {
  if (!value || (typeof value === "string" && !value.trim())) return DEFAULT_PARTITION;
  try {
    const raw = typeof value === "string" ? JSON.parse(value) : value;
    const lines = (Array.isArray(raw.lines) ? raw.lines : []).map(normalizeLine).filter(Boolean) as Line[];
    return {
      width: clampSize(raw.width, DEFAULT_PARTITION.width),
      height: clampSize(raw.height, DEFAULT_PARTITION.height),
      snap: SNAPS.includes(raw.snap) ? raw.snap : 8,
      lines,
    };
  } catch {
    return DEFAULT_PARTITION;
  }
}

export const serializePartition = (p: Partition) => JSON.stringify({ width: p.width, height: p.height, snap: p.snap, lines: p.lines });

export const isDefaultPartition = (p: Partition) => serializePartition(p) === serializePartition(DEFAULT_PARTITION);

/** Is there a line on the edge between cell (x, y) and its right (dir "x") or lower (dir "y") neighbour? */
function wallAfter(lines: Line[], x: number, y: number, dir: "x" | "y") {
  return lines.some(([x1, y1, x2, y2]) =>
    dir === "x" ? x1 === x2 && x1 === x + 1 && y1 <= y && y2 >= y + 1 : y1 === y2 && y1 === y + 1 && x1 <= x && x2 >= x + 1,
  );
}

/** The parts, numbered r1, r2… in reading order of their first cell. */
export function regions(p: Partition): Region[] {
  const owner: number[][] = Array.from({ length: GRID }, () => Array(GRID).fill(-1));
  const result: Region[] = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (owner[y][x] !== -1) continue;
      const index = result.length;
      const region: Region = { id: `r${index + 1}`, cells: [] };
      const stack: [number, number][] = [[x, y]];
      owner[y][x] = index;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        region.cells.push([cx, cy]);
        const next: [number, number, boolean][] = [
          [cx + 1, cy, cx + 1 < GRID && !wallAfter(p.lines, cx, cy, "x")],
          [cx - 1, cy, cx > 0 && !wallAfter(p.lines, cx - 1, cy, "x")],
          [cx, cy + 1, cy + 1 < GRID && !wallAfter(p.lines, cx, cy, "y")],
          [cx, cy - 1, cy > 0 && !wallAfter(p.lines, cx, cy - 1, "y")],
        ];
        for (const [nx, ny, open] of next) {
          if (open && owner[ny][nx] === -1) {
            owner[ny][nx] = index;
            stack.push([nx, ny]);
          }
        }
      }
      result.push(region);
    }
  }
  return result;
}

/** The region of every cell, as regions() numbers them. */
export function ownerGrid(list: Region[]): string[][] {
  const grid: string[][] = Array.from({ length: GRID }, () => Array(GRID).fill(""));
  for (const r of list) for (const [x, y] of r.cells) grid[y][x] = r.id;
  return grid;
}

/** Share of the whole in percent (exact: n / 256). */
export const percentage = (r: Region) => (r.cells.length / (GRID * GRID)) * 100;

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** Share of the whole as a fraction, "1/8". */
export const fraction = (r: Region) => {
  const d = gcd(r.cells.length, GRID * GRID);
  return `${r.cells.length / d}/${(GRID * GRID) / d}`;
};

/** Rectangles that cover a region (a run of cells per row), for drawing it. */
export function regionRuns(r: Region): { x: number; y: number; w: number }[] {
  const sorted = [...r.cells].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const runs: { x: number; y: number; w: number }[] = [];
  for (const [x, y] of sorted) {
    const last = runs[runs.length - 1];
    if (last && last.y === y && last.x + last.w === x) last.w++;
    else runs.push({ x, y, w: 1 });
  }
  return runs;
}

/** The lines between different parts, merged into long lines: what the candidate sees (a line that splits nothing is not drawn). */
export function borders(list: Region[]): Line[] {
  const grid = ownerGrid(list);
  const lines: Line[] = [];
  // vertical: at x between columns x-1 and x
  for (let x = 1; x < GRID; x++) {
    let start = -1;
    for (let y = 0; y <= GRID; y++) {
      const wall = y < GRID && grid[y][x - 1] !== grid[y][x];
      if (wall && start < 0) start = y;
      if (!wall && start >= 0) {
        lines.push([x, start, x, y]);
        start = -1;
      }
    }
  }
  for (let y = 1; y < GRID; y++) {
    let start = -1;
    for (let x = 0; x <= GRID; x++) {
      const wall = x < GRID && grid[y - 1][x] !== grid[y][x];
      if (wall && start < 0) start = x;
      if (!wall && start >= 0) {
        lines.push([start, y, x, y]);
        start = -1;
      }
    }
  }
  return lines;
}

/** Lines that split nothing (both sides belong to the same part all along). */
export function danglingLines(p: Partition, list: Region[]): Line[] {
  const grid = ownerGrid(list);
  return p.lines.filter(([x1, y1, x2, y2]) => {
    if (x1 === x2) {
      if (x1 === 0 || x1 === GRID) return true;
      for (let y = y1; y < y2; y++) if (grid[y][x1 - 1] !== grid[y][x1]) return false;
      return true;
    }
    if (y1 === 0 || y1 === GRID) return true;
    for (let x = x1; x < x2; x++) if (grid[y1 - 1][x] !== grid[y1][x]) return false;
    return true;
  });
}

/**
 * Colours parts so every colour covers its share (percent), for setResponse: any assignment will do, as the response
 * only reports shares. Larger parts first; null when no assignment fits.
 */
export function assignColors(list: Region[], shares: { color: string; percentage: number }[]): { id: string; color: string }[] | null {
  const parts = [...list].sort((a, b) => b.cells.length - a.cells.length);
  const targets = shares.map((s) => ({ color: s.color, cells: Math.round((s.percentage / 100) * GRID * GRID) }));
  const assigned: { id: string; color: string }[] = [];
  let steps = 0;
  const fill = (t: number, from: number, left: number, used: Set<string>): boolean => {
    if (++steps > 200000) return false; // a shape no author draws; give up rather than hang
    if (t === targets.length) return true;
    if (left === 0) return fill(t + 1, 0, targets[t + 1]?.cells ?? 0, used);
    for (let i = from; i < parts.length; i++) {
      const part = parts[i];
      if (used.has(part.id) || part.cells.length > left) continue;
      used.add(part.id);
      assigned.push({ id: part.id, color: targets[t].color });
      if (fill(t, i + 1, left - part.cells.length, used)) return true;
      assigned.pop();
      used.delete(part.id);
    }
    return false;
  };
  return targets.length && fill(0, 0, targets[0].cells, new Set()) ? assigned : null;
}
