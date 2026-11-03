// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/paint, © Jeppe Bundsgaard, openPCI (Aarhus University and Aalborg University)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// Drawing the strokes on a canvas: smooth (quadratic curves through the midpoints of the points), the width following
// the pressure of a pen. The same functions draw a stroke while it is made and replay the whole drawing, so both look
// the same.

import { Operation, StateModel, Stroke } from "./store";
import { Texts } from "./texts";

/** Pressure 0.5 (mouse, touch, a pen pressed normally) gives the brush size. */
export const widthAt = (size: number, pressure: number) => Math.max(0.5, size * (0.4 + 1.2 * pressure));

const point = (s: Stroke, i: number) => ({ x: s.points[i * 3], y: s.points[i * 3 + 1], p: s.points[i * 3 + 2] });
export const pointCount = (s: Stroke) => Math.floor(s.points.length / 3);

const begin = (ctx: CanvasRenderingContext2D, s: Stroke) => {
  ctx.globalCompositeOperation = s.color === null ? "destination-out" : "source-over";
  ctx.strokeStyle = s.color ?? "#000";
  ctx.fillStyle = s.color ?? "#000";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
};

/** The dot where the stroke starts (a stroke of one point is a dot). */
export const drawStart = (ctx: CanvasRenderingContext2D, s: Stroke) => {
  const a = point(s, 0);
  begin(ctx, s);
  ctx.beginPath();
  ctx.arc(a.x, a.y, widthAt(s.size, a.p) / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
};

/** The piece of the stroke around point i (1 ≤ i < count - 1): from the previous midpoint, bent by point i, to the next midpoint. */
export const drawSegment = (ctx: CanvasRenderingContext2D, s: Stroke, i: number) => {
  const prev = point(s, i - 1), cur = point(s, i), next = point(s, i + 1);
  const from = i === 1 ? prev : { x: (prev.x + cur.x) / 2, y: (prev.y + cur.y) / 2 };
  begin(ctx, s);
  ctx.lineWidth = widthAt(s.size, cur.p);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.quadraticCurveTo(cur.x, cur.y, (cur.x + next.x) / 2, (cur.y + next.y) / 2);
  ctx.stroke();
  ctx.globalCompositeOperation = "source-over";
};

/** The last piece: from the last midpoint to the last point. */
export const drawEnd = (ctx: CanvasRenderingContext2D, s: Stroke) => {
  const n = pointCount(s);
  if (n < 2) return;
  const prev = point(s, n - 2), last = point(s, n - 1);
  const from = n === 2 ? prev : { x: (prev.x + last.x) / 2, y: (prev.y + last.y) / 2 };
  begin(ctx, s);
  ctx.lineWidth = widthAt(s.size, last.p);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.globalCompositeOperation = "source-over";
};

export const drawStroke = (ctx: CanvasRenderingContext2D, s: Stroke) => {
  if (pointCount(s) === 0) return;
  drawStart(ctx, s);
  for (let i = 1; i < pointCount(s) - 1; i++) drawSegment(ctx, s, i);
  drawEnd(ctx, s);
};

// A drawing handed over as a response, decoded once.
const images = new Map<string, HTMLImageElement>();
/** The image of a data URL; onload is called once it is decoded (not when it was already). */
export const imageFor = (src: string, onload?: () => void): HTMLImageElement => {
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    images.set(src, img);
  }
  if (!(img.complete && img.naturalWidth > 0) && onload) img.addEventListener("load", onload, { once: true });
  return img;
};

/** What is visible: everything after the last clear, on top of the base when nothing was cleared. */
const visible = (state: StateModel): { base: string | null; operations: Operation[] } => {
  const lastClear = state.operations.map((o) => o.kind).lastIndexOf("clear");
  return lastClear < 0
    ? { base: state.base, operations: state.operations }
    : { base: null, operations: state.operations.slice(lastClear + 1) };
};

export const strokeCount = (state: StateModel) => visible(state).operations.filter((o) => o.kind === "stroke" && o.color !== null).length;

export const renderAll = (ctx: CanvasRenderingContext2D, state: StateModel, onBaseLoaded?: () => void) => {
  const { width, height } = ctx.canvas;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, width, height);
  const { base, operations } = visible(state);
  if (base) {
    const img = imageFor(base, onBaseLoaded);
    if (img.complete && img.naturalWidth > 0) ctx.drawImage(img, 0, 0, width, height);
  }
  operations.forEach((o) => o.kind === "stroke" && drawStroke(ctx, o));
};

/** A PNG data URL of the drawing at the size of the canvas: the response. */
export const toDataURL = (state: StateModel, width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  renderAll(canvas.getContext("2d"), state);
  return canvas.toDataURL("image/png");
};

/** A name for a colour, for screen readers: "dark grey", "blue". */
export const colorName = (hex: string, texts: Texts) => {
  const n = texts.colorNames;
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return hex;
  const h6 = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h6.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d < 0.1) return l < 0.12 ? n.black : l < 0.4 ? n.darkGrey : l < 0.7 ? n.grey : l < 0.95 ? n.lightGrey : n.white;
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  if (hue < 15 || hue >= 345) return n.red;
  if (hue < 45) return l < 0.35 ? n.brown : n.orange;
  if (hue < 70) return n.yellow;
  if (hue < 150) return n.green;
  if (hue < 190) return n.teal;
  if (hue < 250) return n.blue;
  if (hue < 290) return n.purple;
  return n.pink;
};
