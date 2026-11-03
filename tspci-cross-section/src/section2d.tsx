import type { JSX } from "preact";
import type { Pt, Section } from "./geometry";
import { formatNumber } from "./settings";
import type { Texts } from "./texts";

// The cross-section flat, in its true shape (scaled to fit): hatched, with the side lengths, tick marks on equal sides
// and squares in right angles; a circle with its diameter, an ellipse with its axes.

const W = 320;
const H = 250;
const PAD = 40;

let ids = 0;

/** What a screen reader hears of the section, and what the status line says. */
export const describeSection = (s: Section, t: Texts, language: string, showName: boolean, showMeasures: boolean) => {
  if (s.shape === "none") return t.noSection;
  const n = (x: number) => formatNumber(x, language);
  const name = showName ? t.shape[s.shape] : t.nameHidden.toLowerCase();
  let measures = "";
  if (showMeasures) {
    if (s.shape === "circle") measures = `${t.diameter.toLowerCase()} ${n(s.measures[0])} cm`;
    else if (s.shape === "ellipse") measures = `${t.axes.toLowerCase()} ${s.measures.map(n).join(" cm, ")} cm`;
    else if (s.curved) measures = s.measures.length ? `${t.straight.toLowerCase()} ${s.measures.map(n).join(" cm, ")} cm, ${t.curvedSide}` : t.curvedSide;
    else measures = `${t.sides.toLowerCase()} ${s.measures.map(n).join(" cm, ")} cm`;
  }
  const area = showMeasures ? `${t.area.toLowerCase()} ${n(s.area)} cm²` : "";
  return t.describe(name, measures, area);
};

export const Section2D = ({ section: s, texts: t, language, showName, showMeasures, tolerance }: {
  section: Section;
  texts: Texts;
  language: string;
  showName: boolean;
  showMeasures: boolean;
  tolerance: number;
}) => {
  const id = `cs-hatch-${++ids}`;
  const n = (x: number) => formatNumber(x, language);
  const description = describeSection(s, t, language, showName, showMeasures);
  if (s.shape === "none" || s.points2d.length < 3)
    return (
      <div className="flex h-[250px] items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500" data-testid="section-2d" role="img" aria-label={t.sectionImage(description)}>
        {t.noSection}
      </div>
    );

  const us = s.points2d.map((p) => p[0]), vs = s.points2d.map((p) => p[1]);
  const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  const k = Math.min((W - 2 * PAD) / Math.max(1e-9, u1 - u0), (H - 2 * PAD) / Math.max(1e-9, v1 - v0));
  const ox = (W - (u1 - u0) * k) / 2, oy = (H - (v1 - v0) * k) / 2;
  const P = (p: Pt): Pt => [ox + (p[0] - u0) * k, H - oy - (p[1] - v0) * k];
  const pts = s.points2d.map(P);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("") + "Z";
  const c: Pt = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];

  // equal sides: groups of two or more get one, two, three ticks
  const longest = Math.max(...s.segments.map((x) => x.length), 1e-9);
  const groups: number[] = s.segments.map(() => 0);
  if (showName && !s.curved) {
    let g = 0;
    s.segments.forEach((seg, i) => {
      if (groups[i]) return;
      const same = s.segments.map((o, j) => (Math.abs(o.length - seg.length) <= tolerance * longest ? j : -1)).filter((j) => j >= 0 && !groups[j]);
      if (same.length >= 2 && g < 3) {
        g++;
        same.forEach((j) => (groups[j] = g));
      }
    });
  }

  const marks: JSX.Element[] = [];
  s.segments.forEach((seg, i) => {
    const a = pts[seg.from], b = pts[seg.to];
    const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len, ny = dx / len;
    if ((m[0] - c[0]) * nx + (m[1] - c[1]) * ny < 0) [nx, ny] = [-nx, -ny];
    for (let j = 0; j < groups[i]; j++) {
      const o = (j - (groups[i] - 1) / 2) * 5;
      const x = m[0] + (dx / len) * o, y = m[1] + (dy / len) * o;
      marks.push(<line key={`t${i}-${j}`} x1={x - nx * 6} y1={y - ny * 6} x2={x + nx * 6} y2={y + ny * 6} stroke="#7c2d12" stroke-width="1.6" />);
    }
    if (showMeasures)
      marks.push(
        <text key={`l${i}`} x={m[0] + nx * 17} y={m[1] + ny * 17 + 4} text-anchor="middle" className="fill-slate-800 text-[12px] font-medium tabular-nums" data-testid="side-label">
          {n(seg.length)}
        </text>,
      );
  });
  // right angles
  if (showName && !s.curved)
    s.angles.forEach((angle, i) => {
      if (Math.abs(angle - 90) > tolerance * 100) return;
      const p = pts[i], a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length];
      const ua = [(a[0] - p[0]) / Math.hypot(a[0] - p[0], a[1] - p[1]), (a[1] - p[1]) / Math.hypot(a[0] - p[0], a[1] - p[1])];
      const ub = [(b[0] - p[0]) / Math.hypot(b[0] - p[0], b[1] - p[1]), (b[1] - p[1]) / Math.hypot(b[0] - p[0], b[1] - p[1])];
      const q = 10;
      marks.push(
        <path key={`r${i}`} d={`M${p[0] + ua[0] * q},${p[1] + ua[1] * q}L${p[0] + (ua[0] + ub[0]) * q},${p[1] + (ua[1] + ub[1]) * q}L${p[0] + ub[0] * q},${p[1] + ub[1] * q}`} fill="none" stroke="#7c2d12" stroke-width="1.3" />,
      );
    });
  // a circle's diameter, an ellipse's axes
  if (s.conic && showMeasures) {
    const { center, a, b } = s.conic;
    const lines: [Pt, Pt, string][] = s.shape === "circle"
      ? [[[center[0] - a, center[1]], [center[0] + a, center[1]], `d = ${n(2 * a)}`]]
      : [[[center[0] - a, center[1]], [center[0] + a, center[1]], n(2 * a)], [[center[0], center[1] - b], [center[0], center[1] + b], n(2 * b)]];
    lines.forEach(([p, q, label], i) => {
      const A = P(p), B = P(q);
      marks.push(<line key={`a${i}`} x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke="#334155" stroke-width="1.3" stroke-dasharray="5 4" />);
      const horizontal = Math.abs(A[1] - B[1]) < 1;
      marks.push(
        <text key={`al${i}`} x={(A[0] + B[0]) / 2 + (horizontal ? 0 : 8)} y={(A[1] + B[1]) / 2 + (horizontal ? -7 : 4)} text-anchor={horizontal ? "middle" : "start"}
          className="fill-slate-900 text-[12px] font-medium tabular-nums" data-testid="axis-label" paint-order="stroke" stroke="white" stroke-width="3">
          {label}
        </text>,
      );
    });
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full max-w-[360px]" role="img" aria-label={t.sectionImage(description)} data-testid="section-2d" data-shape={s.shape}>
      <defs>
        <pattern id={id} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="#fde7b0" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#d99a1e" stroke-width="2.5" />
        </pattern>
      </defs>
      <path d={path} fill={`url(#${id})`} stroke="#7c2d12" stroke-width="2" stroke-linejoin="round" />
      {s.corners.length > 0 && s.curved && s.corners.map((i) => <circle key={i} cx={pts[i][0]} cy={pts[i][1]} r="2.5" fill="#7c2d12" />)}
      {marks}
    </svg>
  );
};
