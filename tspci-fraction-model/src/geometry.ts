// Where the parts of a model are drawn, in SVG user units. No imports: node tests this file (test/geometry.test.ts).

export const BAR = { width: 420, height: 64 };
export const CIRCLE = { r: 96, pad: 6 };
export const SET = { r: 17, gap: 44 };

export type Rect = { x: number; y: number; width: number; height: number };

/** Part i of a bar of n equal parts, left to right. */
export const barPart = (i: number, n: number, width = BAR.width, height = BAR.height): Rect => ({
  x: (i * width) / n, y: 0, width: width / n, height,
});

const round = (v: number) => Math.round(v * 1000) / 1000;

/** The point on a circle at a fraction of a turn, clockwise from the top. */
export const onCircle = (turn: number, cx: number, cy: number, r: number) => {
  const a = turn * 2 * Math.PI;
  return { x: round(cx + r * Math.sin(a)), y: round(cy - r * Math.cos(a)) };
};

/** Sector i of a circle of n equal sectors, clockwise from the top, as an SVG path. One sector: the whole disc. */
export const sectorPath = (i: number, n: number, cx: number, cy: number, r: number) => {
  if (n <= 1) return `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`;
  const a = onCircle(i / n, cx, cy, r);
  const b = onCircle((i + 1) / n, cx, cy, r);
  const large = 1 / n > 0.5 ? 1 : 0;
  return `M ${cx} ${cy} L ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y} Z`;
};

/** The size of a grid cell: at most 30, the whole grid at most 320 wide or high. */
export const gridCellSize = (rows: number, columns: number) => Math.max(14, Math.min(30, Math.floor(320 / Math.max(rows, columns))));

/** Cell i of a grid, in reading order. */
export const gridCell = (i: number, columns: number, size: number): Rect => ({
  x: (i % columns) * size, y: Math.floor(i / columns) * size, width: size, height: size,
});

/** Columns of a set of n objects: one row up to 8, then rows of at most 8 as even as possible. */
export const setColumns = (n: number) => (n <= 8 ? n : Math.ceil(n / Math.ceil(n / 8)));

/** The centre of object i of a set. */
export const setCentre = (i: number, columns: number) => ({
  x: SET.gap / 2 + (i % columns) * SET.gap, y: SET.gap / 2 + Math.floor(i / columns) * SET.gap,
});

/** The ticks of a percentage scale under a bar: every 10 %, labelled; 5 % in between without a label. */
export const scaleTicks = (width = BAR.width) =>
  Array.from({ length: 21 }, (_, k) => ({ percent: k * 5, x: round((k * width) / 20), major: k % 2 === 0 }));

/**
 * The part after `index` for an arrow key: in a grid Up and Down go a row, elsewhere every arrow goes along the parts
 * (a circle clockwise). Home and End go to the first and last part. Null for other keys.
 */
export const nextPart = (key: string, index: number, parts: number, columns = 0): number | null => {
  const last = parts - 1;
  const clamp = (v: number) => Math.min(last, Math.max(0, v));
  switch (key) {
    case "ArrowRight": return clamp(index + 1);
    case "ArrowLeft": return clamp(index - 1);
    case "ArrowDown": return columns ? (index + columns <= last ? index + columns : index) : clamp(index + 1);
    case "ArrowUp": return columns ? (index - columns >= 0 ? index - columns : index) : clamp(index - 1);
    case "Home": return 0;
    case "End": return last;
    default: return null;
  }
};
