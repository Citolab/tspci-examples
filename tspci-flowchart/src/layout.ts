// The layout of a flowchart on its grid: the size of the blocks, the orthogonal routes of the arrows through the
// gaps between the cells, an automatic layered layout and the wrapping of the texts in a block.
// No imports (only types): `npm test` runs this file in node as it is.
import type { Chart, Edge, FNode, Label, Shape } from "./flowchart";

/** A cell of the grid, in px. Blocks sit in the middle; arrows run along the lines between the cells. */
export const CW = 176;
export const CH = 100;
/** Width and height of each shape, in px. */
export const SIZE: Record<Shape, [number, number]> = {
  start: [132, 46],
  end: [132, 46],
  step: [140, 56],
  io: [148, 56],
  decision: [158, 78],
};

export type Side = "top" | "bottom" | "left" | "right";
export type Point = [number, number];

export const center = (x: number, y: number): Point => [x * CW + CW / 2, y * CH + CH / 2];

/** Where an arrow leaves or enters a block. */
export const port = (n: { x: number; y: number; shape: Shape }, side: Side): Point => {
  const [cx, cy] = center(n.x, n.y);
  const [w, h] = SIZE[n.shape];
  // the slanted sides of an input/output block: the middle of the side is a little in
  const inset = n.shape === "io" ? 7 : 0;
  switch (side) {
    case "top": return [cx, cy - h / 2];
    case "bottom": return [cx, cy + h / 2];
    case "left": return [cx - w / 2 + inset, cy];
    case "right": return [cx + w / 2 - inset, cy];
  }
};

/**
 * The side an arrow leaves its block: a decision's yes exit at the bottom and its no exit on the right (or left when
 * the target lies left of it); an arrow to the next cell in the same row from the side; any other at the bottom.
 */
export const exitSide = (from: { x: number; y: number; shape: Shape }, to: { x: number; y: number }, label?: Label): Side => {
  if (from.shape === "decision" && label === "no") return to.x < from.x ? "left" : "right";
  if (from.shape === "decision" && label === "yes") return to.y === from.y && Math.abs(to.x - from.x) === 1 ? (to.x > from.x ? "right" : "left") : "bottom";
  if (to.y === from.y && Math.abs(to.x - from.x) === 1) return to.x > from.x ? "right" : "left";
  return "bottom";
};

const clean = (points: Point[]): Point[] => {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) continue;
    const prev = out[out.length - 2];
    // drop the middle one of three points on one line
    if (prev && last && ((prev[0] === last[0] && last[0] === p[0]) || (prev[1] === last[1] && last[1] === p[1]))) out.pop();
    out.push(p);
  }
  return out;
};

/**
 * The orthogonal route of an arrow from block `a` to block `b`: through the free cells when a straight line or one bend
 * is free, else along the lines between the cells (where no block is). `occupied(x, y)` tells whether a cell has a
 * block; `lane` shifts the vertical run a few px, so arrows in the same gap stay apart.
 */
export const route = (
  a: { x: number; y: number; shape: Shape },
  b: { x: number; y: number; shape: Shape },
  side: Side,
  occupied: (x: number, y: number) => boolean,
  lane = 0,
): Point[] => {
  const start = port(a, side);
  const [bx] = center(b.x, b.y);
  const free = (cells: [number, number][]) => cells.every(([x, y]) => !occupied(x, y));
  const range = (from: number, to: number) => {
    const out: number[] = [];
    for (let i = from; i <= to; i++) out.push(i);
    return out;
  };
  // the next cell in the same row, from the side
  if ((side === "right" || side === "left") && b.y === a.y && Math.abs(b.x - a.x) === 1) {
    return [start, port(b, side === "right" ? "left" : "right")];
  }
  if (side === "bottom") {
    // straight down when nothing is in between
    if (b.x === a.x && b.y > a.y && free(range(a.y + 1, b.y - 1).map((y) => [a.x, y]))) {
      return [start, port(b, "top")];
    }
    const gA = (a.y + 1) * CH; // the line under a
    if (b.y === a.y + 1) return clean([start, [start[0], gA], [bx, gA], port(b, "top")]);
    if (b.y > a.y + 1) {
      // down in the gap next to b's column, unless b's own column is free all the way
      if (free(range(a.y + 1, b.y - 1).map((y) => [b.x, y]))) return clean([start, [start[0], gA], [bx, gA], port(b, "top")]);
    }
    const gB = b.y * CH; // the line above b
    const vx = (b.x > a.x ? b.x : b.x < a.x ? b.x + 1 : a.x + 1) * CW + lane;
    return clean([start, [start[0], gA], [vx, gA], [vx, gB], [bx, gB], port(b, "top")]);
  }
  // from the side: one bend down into b when the row and the column are free
  const dir = side === "right" ? 1 : -1;
  if (b.y > a.y && Math.sign(b.x - a.x) === dir) {
    const row = range(Math.min(a.x + dir, b.x), Math.max(a.x + dir, b.x)).map((x): [number, number] => [x, a.y]);
    const column = range(a.y + 1, b.y - 1).map((y): [number, number] => [b.x, y]);
    if (free([...row, ...column])) return [start, [bx, start[1]], port(b, "top")];
  }
  const vx = (side === "right" ? a.x + 1 : a.x) * CW + lane;
  const gB = b.y * CH;
  return clean([start, [vx, start[1]], [vx, gB], [bx, gB], port(b, "top")]);
};

/** An SVG path along the points, with rounded bends. */
export const pathOf = (points: Point[], radius = 8): string => {
  if (points.length < 2) return "";
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1], [x, y] = points[i], [nx, ny] = points[i + 1];
    const r = Math.min(radius, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2);
    const ax = x - Math.sign(x - px) * r, ay = y - Math.sign(y - py) * r;
    const bx = x + Math.sign(nx - x) * r, by = y + Math.sign(ny - y) * r;
    d += ` L${ax} ${ay} Q${x} ${y} ${bx} ${by}`;
  }
  const [lx, ly] = points[points.length - 1];
  return `${d} L${lx} ${ly}`;
};

/** Where the yes/no of an exit goes: just past the start of the arrow. */
export const labelPoint = (points: Point[], side: Side): Point => {
  const [x, y] = points[0];
  if (side === "bottom") return [x + 8, y + 15];
  if (side === "right") return [x + 8, y - 6];
  if (side === "left") return [x - 8, y - 6];
  return [x + 8, y - 6];
};

/**
 * A layered layout: rows by the longest path from a start (arrows back up do not count), the yes exit under its
 * decision and the no exit a column to the right; blocks that are not connected follow below. Locked blocks stay where
 * they are; the others avoid them.
 */
export const autoLayout = (chart: Chart): Chart => {
  const { nodes, edges } = chart;
  if (!nodes.length) return chart;
  const ids = nodes.map((n) => n.id);
  const out = (id: string) => edges.filter((e) => e.from === id);
  // back edges: arrows to a block that is still being visited
  const state = new Map<string, number>();
  const back = new Set<Edge>();
  const roots = [
    ...nodes.filter((n) => n.shape === "start"),
    ...nodes.filter((n) => n.shape !== "start" && !edges.some((e) => e.to === n.id)),
    ...nodes,
  ].map((n) => n.id);
  const dfs = (id: string) => {
    state.set(id, 1);
    for (const e of out(id)) {
      const s = state.get(e.to);
      if (s === 1) back.add(e);
      else if (!s) dfs(e.to);
    }
    state.set(id, 2);
  };
  const order: string[] = [];
  for (const r of roots) if (!state.has(r)) {
    order.push(r);
    dfs(r);
  }
  const forward = edges.filter((e) => !back.has(e));
  // the longest path from a start, over the forward arrows (topological order by repeated relaxation)
  const layer = new Map<string, number>(ids.map((id) => [id, 0]));
  for (let i = 0; i < ids.length; i++) {
    let changed = false;
    for (const e of forward) {
      const next = layer.get(e.from)! + 1;
      if (next > layer.get(e.to)!) {
        layer.set(e.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  // a chain of its own (not reached from the first start) goes below what is there
  const component = new Map<string, number>();
  order.forEach((r, i) => {
    const queue = [r];
    while (queue.length) {
      const id = queue.shift()!;
      if (component.has(id)) continue;
      component.set(id, i);
      for (const e of edges) {
        if (e.from === id && !component.has(e.to)) queue.push(e.to);
        if (e.to === id && !component.has(e.from)) queue.push(e.from);
      }
    }
  });
  const comps = [...new Set(ids.map((id) => component.get(id)!))].sort((a, b) => a - b);
  let offset = 0;
  const row = new Map<string, number>();
  for (const c of comps) {
    const members = ids.filter((id) => component.get(id) === c);
    const min = Math.min(...members.map((id) => layer.get(id)!));
    for (const id of members) row.set(id, layer.get(id)! - min + offset);
    offset = Math.max(...members.map((id) => row.get(id)!)) + 1;
  }
  // columns: under the first parent already placed, the no exit (or a second exit) to the right
  const col = new Map<string, number>();
  const locked = nodes.filter((n) => n.locked);
  const taken = new Set(locked.map((n) => `${n.x},${n.y}`));
  for (const n of locked) col.set(n.id, n.x);
  const byRow = [...ids].sort((a, b) => row.get(a)! - row.get(b)! || ids.indexOf(a) - ids.indexOf(b));
  const placed = new Map<string, [number, number]>(locked.map((n) => [n.id, [n.x, n.y]]));
  for (const id of byRow) {
    if (placed.has(id)) continue;
    const parents = forward.filter((e) => e.to === id && placed.has(e.from));
    let want = 0;
    if (parents.length) {
      const e = parents[0];
      const siblings = forward.filter((x) => x.from === e.from);
      const index = siblings.indexOf(e);
      want = placed.get(e.from)![0] + (e.label === "no" || (!e.label && index > 0) ? 1 : 0);
    }
    let y = row.get(id)!;
    // below the parents, also when a locked block made them lower
    for (const p of parents) y = Math.max(y, placed.get(p.from)![1] + 1);
    let x = want;
    while (taken.has(`${x},${y}`)) x++;
    taken.add(`${x},${y}`);
    placed.set(id, [x, y]);
  }
  return { nodes: nodes.map((n) => ({ ...n, x: placed.get(n.id)![0], y: placed.get(n.id)![1] })), edges };
};

/** The grid a chart needs: at least the settings' size, and room for every block. */
export const gridOf = (chart: Chart, columns: number, rows: number) => ({
  columns: Math.max(columns, ...chart.nodes.map((n) => n.x + 1)),
  rows: Math.max(rows, ...chart.nodes.map((n) => n.y + 1)),
});

/** Characters per line and lines per shape. */
export const TEXT_FIT: Record<Shape, [number, number]> = { start: [17, 2], end: [17, 2], step: [20, 3], io: [18, 3], decision: [16, 3] };

/** A text in lines of at most `width` characters, at most `lines` lines; an ellipsis when it does not fit. */
export const wrapText = (text: string, width: number, lines: number): string[] => {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    let word = words[i];
    while (word.length > width) {
      if (line) {
        out.push(line);
        line = "";
      }
      out.push(word.slice(0, width - 1) + "-");
      word = word.slice(width - 1);
    }
    const next = line ? `${line} ${word}` : word;
    if (next.length <= width) line = next;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  if (out.length <= lines) return out;
  const kept = out.slice(0, lines);
  const last = kept[lines - 1];
  kept[lines - 1] = (last.length >= width ? last.slice(0, width - 1) : last) + "…";
  return kept;
};

/** The node in a cell. */
export const nodeAt = (nodes: FNode[], x: number, y: number) => nodes.find((n) => n.x === x && n.y === y);
