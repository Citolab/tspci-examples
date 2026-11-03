import type { Shape } from "./flowchart";
import { SIZE, TEXT_FIT, wrapText } from "./layout";

// The flowchart shapes (ISO 5807 style): start/end rounded, step a rectangle, decision a diamond, input/output a
// parallelogram. Drawn around (cx, cy) in px.

export const outlinePath = (shape: Shape, cx: number, cy: number, scale = 1): string => {
  const [w, h] = SIZE[shape].map((v) => v * scale);
  const l = cx - w / 2, r = cx + w / 2, t = cy - h / 2, b = cy + h / 2;
  switch (shape) {
    case "start":
    case "end": {
      const rr = h / 2;
      return `M${l + rr} ${t}H${r - rr}A${rr} ${rr} 0 0 1 ${r - rr} ${b}H${l + rr}A${rr} ${rr} 0 0 1 ${l + rr} ${t}Z`;
    }
    case "decision":
      return `M${cx} ${t}L${r} ${cy}L${cx} ${b}L${l} ${cy}Z`;
    case "io": {
      const k = 14 * scale;
      return `M${l + k} ${t}H${r}L${r - k} ${b}H${l}Z`;
    }
    default: {
      const rr = 7 * scale;
      return `M${l + rr} ${t}H${r - rr}Q${r} ${t} ${r} ${t + rr}V${b - rr}Q${r} ${b} ${r - rr} ${b}H${l + rr}Q${l} ${b} ${l} ${b - rr}V${t + rr}Q${l} ${t} ${l + rr} ${t}Z`;
    }
  }
};

/** The lines of a text, centred around (cx, cy). */
export const BlockText = ({ text, shape, cx, cy, className }: { text: string; shape: Shape; cx: number; cy: number; className?: string }) => {
  const [width, lines] = TEXT_FIT[shape];
  const rows = wrapText(text, width, lines);
  const lh = 15;
  const top = cy - ((rows.length - 1) * lh) / 2;
  return (
    <text x={cx} y={top} text-anchor="middle" dominant-baseline="central" className={className} style={{ fontSize: "12.5px" }}>
      {rows.map((row, i) => <tspan key={i} x={cx} y={top + i * lh}>{row}</tspan>)}
    </text>
  );
};

/** A small icon of a shape, for the palette. */
export const ShapeIcon = ({ shape, className }: { shape: Shape; className?: string }) => (
  <svg viewBox="0 0 100 52" className={className} aria-hidden="true">
    <path d={outlinePath(shape, 50, 26, shape === "decision" ? 0.6 : 0.62)} fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2.5" />
  </svg>
);
