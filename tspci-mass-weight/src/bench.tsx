// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/ForceGravitepci and
// https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Delorpci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useRef, useState } from "preact/hooks";
import {
  Bench, InstrumentId, Kind, Language, Location, PlaceId, Settings, Thing, formatNumber, locationOf, niceStep, objectOn, placeOf,
  readingsOf, round, shownLevel,
} from "./model";

// The bench in SVG: a shelf with the objects on the left, then the instruments the item shows, each in a column of
// its own. A drawing only shows the bench; the buttons, the slider and the texts are in interaction.tsx. Objects can
// be dragged with a mouse, a pen or a finger onto a column (the buttons do the same from the keyboard).

export const WIDTH = 900;
export const HEIGHT = 440;
const FLOOR = 390;
const TABLE_W = 210;
const INK = "#1e293b";

/** The size of each object as it is drawn on the bench (w × h). */
const SIZE: Record<Kind, { w: number; h: number }> = {
  statuette: { w: 34, h: 58 },
  meteorite: { w: 84, h: 62 },
  stone: { w: 54, h: 36 },
  cube: { w: 36, h: 36 },
  custom: { w: 46, h: 42 },
};
const CUSTOM_COLORS = ["#7c3aed", "#db2777", "#0891b2", "#65a30d", "#ea580c", "#4f46e5"];

/** The column of each instrument: its centre. */
export const columnsOf = (s: Settings) => {
  const w = (WIDTH - TABLE_W) / s.instruments.length;
  return s.instruments.map((id, i) => ({ id, x0: TABLE_W + i * w, x1: TABLE_W + (i + 1) * w, cx: TABLE_W + (i + 0.5) * w }));
};

/** Where a point of the bench is: the table or an instrument's column. */
export const locationAt = (s: Settings, x: number): Location | null => {
  if (x < 0 || x > WIDTH) return null;
  if (x < TABLE_W) return "table";
  return columnsOf(s).find((c) => x >= c.x0 && x < c.x1)?.id ?? null;
};

/** The places of the objects on the shelf: two per shelf, from the bottom up. */
const SLOTS = [
  { x: 58, y: FLOOR - 5 }, { x: 152, y: FLOOR - 5 }, { x: 58, y: 280 }, { x: 152, y: 280 }, { x: 58, y: 170 }, { x: 152, y: 170 },
];

/** Grams on the display of the scale: "190 g", or "40.000 kg" from 1 kg. */
export const scaleText = (value: number, resolution: number, language: Language) => {
  const power = Math.floor(Math.log10(resolution) + 1e-9);
  if (Math.abs(value) < 1000) return `${formatNumber(value, language, Math.max(0, -power), true)} g`;
  return `${formatNumber(value / 1000, language, Math.min(6, Math.max(0, 3 - power)), true)} kg`;
};

// ---- objects -------------------------------------------------------------------------------------------------------

/** An object, centred on x with its bottom on y, scaled by k. */
export const ObjectShape = ({ thing, index, x, y, k = 1, uid }: { thing: Thing; index: number; x: number; y: number; k?: number; uid: string }) => {
  const { w, h } = SIZE[thing.kind];
  const t = `translate(${round(x - (w * k) / 2, 2)} ${round(y - h * k, 2)}) scale(${k})`;
  switch (thing.kind) {
    case "statuette":
      // a seated falcon on a plinth, in gold
      return (
        <g transform={t}>
          <rect x={2} y={50} width={30} height={8} rx={1.5} fill={`url(#${uid}-gold)`} stroke="#92400e" stroke-width={1} />
          <path d="M8 50 C6 38 8 26 14 20 C12 14 15 8 20 7 C25 6 28 10 27 14 L31 16 L27 18 C28 26 29 38 26 50 Z"
            fill={`url(#${uid}-gold)`} stroke="#92400e" stroke-width={1} />
          <path d="M12 46 C14 36 16 30 22 26" fill="none" stroke="#92400e" stroke-width={1} />
          <circle cx={22} cy={12} r={1.6} fill="#451a03" />
        </g>
      );
    case "meteorite":
      return (
        <g transform={t}>
          <path d="M6 44 C0 30 8 14 22 10 C30 2 46 0 56 6 C70 6 82 18 82 32 C86 46 76 58 62 60 C48 64 30 62 18 58 C10 56 6 52 6 44 Z"
            fill={`url(#${uid}-rock)`} stroke="#292524" stroke-width={1.2} />
          <ellipse cx={30} cy={28} rx={7} ry={5} fill="#44403c" />
          <ellipse cx={56} cy={22} rx={5} ry={4} fill="#44403c" />
          <ellipse cx={60} cy={44} rx={8} ry={5} fill="#44403c" />
          <ellipse cx={34} cy={48} rx={4} ry={3} fill="#44403c" />
          <path d="M18 18 C26 12 34 10 40 10" fill="none" stroke="#d6d3d1" stroke-width={1.4} stroke-linecap="round" opacity={0.6} />
        </g>
      );
    case "stone":
      return (
        <g transform={t}>
          <path d="M4 30 C0 18 10 6 24 4 C38 2 52 10 53 22 C54 32 46 36 28 36 C14 36 6 35 4 30 Z" fill="#a8a29e" stroke="#57534e" stroke-width={1.2} />
          <path d="M14 14 C20 9 28 8 34 9" fill="none" stroke="#e7e5e4" stroke-width={1.5} stroke-linecap="round" />
        </g>
      );
    case "cube":
      return (
        <g transform={t} stroke="#475569" stroke-width={1} stroke-linejoin="round">
          <path d="M2 10 L20 2 L34 8 L16 16 Z" fill="#f1f5f9" />
          <path d="M2 10 L16 16 L16 36 L2 30 Z" fill="#cbd5e1" />
          <path d="M16 16 L34 8 L34 28 L16 36 Z" fill="#94a3b8" />
        </g>
      );
    default: {
      const color = CUSTOM_COLORS[index % CUSTOM_COLORS.length];
      return (
        <g transform={t}>
          <rect x={2} y={2} width={42} height={40} rx={10} fill={color} stroke={INK} stroke-width={1.2} />
          <rect x={8} y={7} width={14} height={6} rx={3} fill="#fff" opacity={0.45} />
        </g>
      );
    }
  }
};

// ---- instruments ---------------------------------------------------------------------------------------------------

const Shelf = ({ rows }: { rows: number }) => (
  <g aria-hidden="true">
    <rect x={8} y={FLOOR - 5} width={196} height={6} rx={2} fill="#d6b98c" stroke="#a16207" />
    {rows > 2 && <rect x={12} y={170} width={188} height={8} rx={2} fill="#b45309" stroke="#78350f" />}
    {rows > 1 && <rect x={12} y={280} width={188} height={8} rx={2} fill="#b45309" stroke="#78350f" />}
    {rows > 1 && <rect x={14} y={rows > 2 ? 178 : 288} width={6} height={FLOOR - (rows > 2 ? 178 : 288)} fill="#92400e" />}
    {rows > 1 && <rect x={192} y={rows > 2 ? 178 : 288} width={6} height={FLOOR - (rows > 2 ? 178 : 288)} fill="#92400e" />}
  </g>
);

/** The digital scale; the object stands on the pan. */
const Scale = ({ cx, text, on, onPower, onTare, uid, showButtons, tareLabel }: {
  cx: number; text: string; on: boolean; tareLabel: string; onPower?: () => void; onTare?: () => void; uid: string; showButtons: boolean;
}) => (
  <g aria-hidden="true">
    <rect x={cx - 60} y={FLOOR - 64} width={120} height={8} rx={3} fill={`url(#${uid}-metal)`} stroke="#64748b" />
    <rect x={cx - 8} y={FLOOR - 56} width={16} height={8} fill="#64748b" />
    <rect x={cx - 85} y={FLOOR - 50} width={170} height={50} rx={8} fill={`url(#${uid}-case)`} />
    <rect x={cx - 76} y={FLOOR - 42} width={92} height={30} rx={4} fill={on ? "#d9f99d" : "#0f172a"} stroke="#020617" stroke-width={1.5} />
    <text x={cx + 10} y={FLOOR - 21} font-size={17} font-family="ui-monospace, Menlo, Consolas, monospace" font-weight="700"
      text-anchor="end" fill="#1a2e05" data-testid="scale-display">{on ? text : ""}</text>
    {showButtons && (
      <g style={{ cursor: onPower ? "pointer" : "default" }} onClick={onPower}>
        <circle cx={cx + 36} cy={FLOOR - 27} r={10} fill="#1e293b" stroke="#94a3b8" stroke-width={1.5} />
        <circle cx={cx + 36} cy={FLOOR - 27} r={4} fill={on ? "#22c55e" : "#ef4444"} />
      </g>
    )}
    <g style={{ cursor: onTare ? "pointer" : "default" }} onClick={onTare}>
      <rect x={cx + 52} y={FLOOR - 37} width={28} height={18} rx={4} fill="#e2e8f0" stroke="#94a3b8" />
      <text x={cx + 66} y={FLOOR - 24.5} font-size={7} font-weight="700" text-anchor="middle" fill={INK}>{tareLabel}</text>
    </g>
  </g>
);

const TUBE_TOP = 62;
const TUBE_LEN = 170;

/** The dynamometer on its stand: the spring pulls the marker and the hook down by F / max. */
const Dynamometer = ({ cx, s, force, language }: { cx: number; s: Settings; force: number; language: Language }) => {
  const frac = Math.min(1.04, force / s.dynamometerMax);
  const marker = TUBE_TOP + TUBE_LEN * frac;
  const hookY = 262 + 50 * frac;
  const major = niceStep(s.dynamometerMax, 5);
  const minor = s.dynamometerStep;
  const ticks: { v: number; major: boolean }[] = [];
  const count = Math.round(s.dynamometerMax / minor);
  if (count <= 200) for (let i = 0; i <= count; i++) ticks.push({ v: round(i * minor, 6), major: false });
  for (let v = 0; v <= s.dynamometerMax + 1e-9; v += major) ticks.push({ v: round(v, 6), major: true });
  const y = (v: number) => TUBE_TOP + (TUBE_LEN * v) / s.dynamometerMax;
  const coils = 12;
  const spring = Array.from({ length: coils + 1 }, (_, i) => `${i === 0 ? "M" : "L"}${cx + (i % 2 ? 4 : -4)} ${round(54 + ((marker - 54) * i) / coils, 2)}`).join(" ");
  return (
    <g aria-hidden="true">
      {/* the stand */}
      <rect x={cx + 30} y={FLOOR - 8} width={70} height={8} rx={2} fill="#475569" />
      <rect x={cx + 62} y={28} width={6} height={FLOOR - 36} fill="#64748b" />
      <rect x={cx - 8} y={26} width={76} height={6} rx={2} fill="#64748b" />
      <circle cx={cx} cy={39} r={6} fill="none" stroke="#475569" stroke-width={2.5} />
      {/* the tube with its scale */}
      <rect x={cx - 16} y={45} width={32} height={TUBE_LEN + 34} rx={6} fill="#f8fafc" stroke="#64748b" stroke-width={1.5} />
      <rect x={cx - 5} y={52} width={10} height={TUBE_LEN + 20} rx={3} fill="#e2e8f0" />
      <path d={spring} fill="none" stroke="#64748b" stroke-width={1.4} />
      <g stroke={INK} stroke-linecap="round">
        {ticks.map((tk) => <line key={`${tk.major}-${tk.v}`} x1={cx - 16} y1={y(tk.v)} x2={cx - (tk.major ? 6 : 11)} y2={y(tk.v)} stroke-width={tk.major ? 1.5 : 0.8} />)}
      </g>
      <g fill={INK} font-size={11} font-weight="600" text-anchor="end" dominant-baseline="central">
        {ticks.filter((tk) => tk.major).map((tk) => <text key={tk.v} x={cx - 21} y={y(tk.v)}>{formatNumber(tk.v, language, 3)}</text>)}
        <text x={cx - 21} y={TUBE_TOP - 24}>N</text>
      </g>
      <rect x={cx - 9} y={marker - 2} width={18} height={4} rx={1} fill="#dc2626" data-testid="dynamometer-marker" data-frac={round(frac, 4)} />
      {/* the rod and the hook */}
      <line x1={cx} y1={TUBE_LEN + 79} x2={cx} y2={hookY} stroke="#475569" stroke-width={3} />
      <path d={`M${cx} ${hookY} q0 9 -6 9 q-6 0 -6 -6`} fill="none" stroke="#475569" stroke-width={2.5} stroke-linecap="round" />
    </g>
  );
};

/** The graduated cylinder: the level from shownLevel, graduations up to cylinderMax, the brim at the capacity. */
const Cylinder = ({ cx, s, level, overflow, uid, language, object, objectIndex }: {
  cx: number; s: Settings; level: number; overflow: boolean; uid: string; language: Language; object: Thing | null; objectIndex: number;
}) => {
  const bottom = FLOOR - 12;
  const rim = 46;
  const px = (bottom - rim) / s.cylinderCapacity;
  const y = (v: number) => bottom - v * px;
  const major = niceStep(s.cylinderMax, 5) < s.cylinderStep ? s.cylinderStep : Math.max(s.cylinderStep * 2, niceStep(s.cylinderMax, 5));
  const marks: { v: number; major: boolean }[] = [];
  const count = Math.floor(s.cylinderMax / s.cylinderStep + 1e-9);
  if (count <= 300) for (let i = 0; i <= count; i++) {
    const v = round(i * s.cylinderStep, 6);
    marks.push({ v, major: Math.abs(v / major - Math.round(v / major)) < 1e-6 });
  }
  const top = y(level);
  const inner = 60;
  let shape = null;
  if (object) {
    const size = SIZE[object.kind];
    const k = Math.min((inner - 6) / size.w, (object.height * px) / size.h);
    shape = <ObjectShape thing={object} index={objectIndex} x={cx} y={bottom} k={k} uid={uid} />;
  }
  return (
    <g aria-hidden="true">
      <ellipse cx={cx} cy={FLOOR - 5} rx={46} ry={6} fill="#64748b" />
      <rect x={cx - 44} y={FLOOR - 12} width={88} height={8} rx={3} fill="#94a3b8" />
      {shape}
      {level > 0 && (
        <g data-testid="water" data-level={round(level, 2)}>
          <rect x={cx - inner / 2} y={top} width={inner} height={bottom - top} fill={`url(#${uid}-water)`} opacity={0.72} />
          <path d={`M${cx - inner / 2} ${top - 3} Q${cx} ${top + 4} ${cx + inner / 2} ${top - 3}`} fill="none" stroke="#0284c7" stroke-width={1.5} />
        </g>
      )}
      {overflow && (
        <g data-testid="overflow">
          <path d={`M${cx + inner / 2} ${rim} q 10 -2 10 12 L ${cx + inner / 2 + 10} ${FLOOR - 4}`} fill="none" stroke="#38bdf8" stroke-width={4} stroke-linecap="round" opacity={0.8} />
          <path d={`M${cx - inner / 2} ${rim} q -10 -2 -10 12 L ${cx - inner / 2 - 10} ${FLOOR - 14}`} fill="none" stroke="#38bdf8" stroke-width={3} stroke-linecap="round" opacity={0.7} />
          <ellipse cx={cx + 52} cy={FLOOR - 1} rx={26} ry={4} fill="#7dd3fc" opacity={0.8} />
        </g>
      )}
      {/* the glass, with a lip at the brim */}
      <path d={`M${cx - inner / 2} ${rim} L${cx - inner / 2} ${bottom} L${cx + inner / 2} ${bottom} L${cx + inner / 2} ${rim}`}
        fill={`url(#${uid}-glass)`} fill-opacity={0.25} stroke="#64748b" stroke-width={2} />
      <path d={`M${cx - inner / 2 - 6} ${rim - 2} L${cx - inner / 2} ${rim + 2} M${cx + inner / 2} ${rim + 2} L${cx + inner / 2 + 8} ${rim - 4}`}
        stroke="#64748b" stroke-width={2} stroke-linecap="round" />
      <g stroke={INK} stroke-linecap="round">
        {marks.map((m) => <line key={m.v} x1={cx + inner / 2 - (m.major ? 22 : 12)} y1={y(m.v)} x2={cx + inner / 2} y2={y(m.v)} stroke-width={m.major ? 1.4 : 0.8} />)}
      </g>
      <g fill={INK} font-size={10} font-weight="600" dominant-baseline="central">
        {marks.filter((m) => m.major && m.v > 0).map((m) => <text key={m.v} x={cx + inner / 2 + 5} y={y(m.v)}>{formatNumber(m.v, language, 3)}</text>)}
        <text x={cx - inner / 2 + 4} y={rim + 10} font-size={10}>mL</text>
      </g>
    </g>
  );
};

/** The planet in the corner: what the place is, also without the label. */
const Emblem = ({ place }: { place: PlaceId }) => (
  <g aria-hidden="true" transform={`translate(${WIDTH - 40} 40)`}>
    {place === "earth" && (
      <g>
        <circle r={24} fill="#2563eb" />
        <path d="M-14 -12 C-6 -18 4 -14 2 -6 C0 2 -10 0 -12 8 C-14 14 -20 6 -20 0 C-20 -6 -18 -9 -14 -12 Z M8 6 C14 2 20 6 18 12 C14 18 6 16 8 6 Z" fill="#22c55e" />
      </g>
    )}
    {place === "moon" && (
      <g>
        <circle r={24} fill="#d1d5db" stroke="#9ca3af" />
        <circle cx={-8} cy={-6} r={6} fill="#9ca3af" />
        <circle cx={9} cy={8} r={4} fill="#9ca3af" />
        <circle cx={6} cy={-12} r={2.5} fill="#9ca3af" />
      </g>
    )}
    {place === "mars" && (
      <g>
        <circle r={24} fill="#c2410c" />
        <ellipse cx={-6} cy={-4} rx={10} ry={5} fill="#9a3412" />
        <ellipse cx={8} cy={10} rx={6} ry={3} fill="#9a3412" />
        <ellipse cx={0} cy={-20} rx={8} ry={3} fill="#fff7ed" />
      </g>
    )}
  </g>
);

const SKY: Record<PlaceId, [string, string]> = {
  earth: ["#bfdbfe", "#eff6ff"],
  moon: ["#cbd5e1", "#f1f5f9"],
  mars: ["#fdba74", "#fff7ed"],
};

// ---- the bench -----------------------------------------------------------------------------------------------------

export type BenchProps = {
  s: Settings;
  bench: Bench;
  /** The water to draw while the slider moves. */
  water: number;
  uid: string;
  label: string;
  /** The text on the tare button of the scale. */
  tareLabel: string;
  readOnly: boolean;
  /** The candidate dropped an object on a location. */
  onDrop: (object: string, to: Location) => void;
  onPower: () => void;
  onTare: () => void;
};

export const BenchView = ({ s, bench, water, uid, label, tareLabel, readOnly, onDrop, onPower, onTare }: BenchProps) => {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; dx: number; dy: number; pointer: number } | null>(null);
  const shown = { ...bench, water };
  const readings = readingsOf(s, shown);
  const place = placeOf(s, bench.place);
  const columns = columnsOf(s);

  const toSvg = (e: PointerEvent) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };

  /** Where each object is drawn: its bottom centre and its scale. */
  const positionOf = (thing: Thing, index: number): { x: number; y: number; k: number } | null => {
    const at = locationOf(shown, thing.id);
    if (at === "table") return { ...SLOTS[index], k: 1 };
    const col = columns.find((c) => c.id === at);
    if (!col) return { ...SLOTS[index], k: 1 };
    if (at === "scale") return { x: col.cx, y: FLOOR - 64, k: 1 };
    if (at === "dynamometer") {
      const frac = Math.min(1.04, (readings.dynamometer.value ?? s.dynamometerMax * 1.04) / s.dynamometerMax);
      return { x: col.cx, y: 262 + 50 * frac + 16 + SIZE[thing.kind].h, k: 1 };
    }
    return null; // in the cylinder: drawn by the cylinder
  };

  const start = (id: string, e: PointerEvent) => {
    if (readOnly || e.button > 0) return;
    e.preventDefault();
    const index = s.objects.findIndex((o) => o.id === id);
    const pos = positionOf(s.objects[index], index);
    const p = toSvg(e);
    const base = pos ?? { x: columns.find((c) => c.id === "cylinder")?.cx ?? p.x, y: FLOOR - 12 };
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // a pointer the browser does not know (a synthetic event): the moves still come to this object
    }
    setDrag({ id, x: p.x, y: p.y, dx: base.x - p.x, dy: base.y - p.y, pointer: e.pointerId });
  };
  const moveTo = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const p = toSvg(e);
    setDrag({ ...drag, x: p.x, y: p.y });
  };
  const end = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const p = toSvg(e);
    const to = p.y >= 0 && p.y <= HEIGHT ? locationAt(s, p.x) : null;
    setDrag(null);
    if (to && to !== locationOf(bench, drag.id)) onDrop(drag.id, to);
  };
  const target = drag ? locationAt(s, drag.x) : null;

  const sunk = objectOn(s, shown, "cylinder");
  const level = shownLevel(s, shown);
  const scaleDisplay = readings.scale.note === "overload" ? "- OL -" : readings.scale.value === null ? "" : scaleText(readings.scale.value, s.scaleResolution, s.language);
  const [skyTop, skyBottom] = SKY[place.id];

  return (
    <svg ref={svg} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label} data-testid="bench" data-place={place.id}
      class="block w-full h-auto select-none" style={{ touchAction: drag ? "none" : "pan-y" }}>
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color={skyTop} />
          <stop offset="1" stop-color={skyBottom} />
        </linearGradient>
        <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fde68a" />
          <stop offset="0.5" stop-color="#f59e0b" />
          <stop offset="1" stop-color="#b45309" />
        </linearGradient>
        <radialGradient id={`${uid}-rock`} cx="0.35" cy="0.3">
          <stop offset="0" stop-color="#a8a29e" />
          <stop offset="1" stop-color="#44403c" />
        </radialGradient>
        <linearGradient id={`${uid}-metal`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#f1f5f9" />
          <stop offset="1" stop-color="#94a3b8" />
        </linearGradient>
        <linearGradient id={`${uid}-case`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#475569" />
          <stop offset="1" stop-color="#1e293b" />
        </linearGradient>
        <linearGradient id={`${uid}-water`} x1="0" x2="1">
          <stop offset="0" stop-color="#7dd3fc" />
          <stop offset="0.5" stop-color="#bae6fd" />
          <stop offset="1" stop-color="#38bdf8" />
        </linearGradient>
        <linearGradient id={`${uid}-glass`} x1="0" x2="1">
          <stop offset="0" stop-color="#e2e8f0" />
          <stop offset="0.3" stop-color="#ffffff" />
          <stop offset="1" stop-color="#cbd5e1" />
        </linearGradient>
      </defs>
      <rect width={WIDTH} height={FLOOR} fill={`url(#${uid}-sky)`} />
      <Emblem place={place.id} />
      <rect y={FLOOR} width={WIDTH} height={HEIGHT - FLOOR} fill="#a16207" />
      <rect y={FLOOR} width={WIDTH} height={5} fill="#ca8a04" />
      <Shelf rows={Math.ceil(s.objects.length / 2)} />

      {drag && (
        <g aria-hidden="true">
          {[{ id: "table" as Location, x0: 0, x1: TABLE_W }, ...columns].map((c) => {
            const ok = c.id === "table" || c.id !== "cylinder" || s.objects.find((o) => o.id === drag.id)?.fits;
            return (
              <rect key={c.id} x={c.x0 + 4} y={6} width={c.x1 - c.x0 - 8} height={FLOOR - 10} rx={10} fill={ok ? "#0ea5e9" : "#ef4444"}
                fill-opacity={target === c.id ? 0.16 : 0.05} stroke={ok ? "#0284c7" : "#dc2626"} stroke-dasharray="6 5" stroke-width={target === c.id ? 2.5 : 1.2} />
            );
          })}
        </g>
      )}

      {columns.map((c) => (
        <g key={c.id} data-testid={`instrument-${c.id}`}>
          {c.id === "scale" && (
            <Scale cx={c.cx} text={scaleDisplay} on={bench.scaleOn} uid={uid} showButtons={s.scaleOnOff} tareLabel={tareLabel}
              onPower={readOnly ? undefined : onPower} onTare={readOnly ? undefined : onTare} />
          )}
          {c.id === "dynamometer" && (
            <Dynamometer cx={c.cx} s={s} language={s.language}
              force={readings.dynamometer.value ?? (readings.dynamometer.note === "overRange" ? s.dynamometerMax * 1.04 : 0)} />
          )}
          {c.id === "cylinder" && (
            <Cylinder cx={c.cx} s={s} level={level.level} overflow={level.overflow} uid={uid} language={s.language}
              object={sunk} objectIndex={sunk ? s.objects.indexOf(sunk) : 0} />
          )}
        </g>
      ))}

      {s.objects.map((thing, index) => {
        const pos = positionOf(thing, index);
        const dragging = drag?.id === thing.id;
        const at = locationOf(shown, thing.id);
        const size = SIZE[thing.kind];
        // in the cylinder: an invisible handle over the drawing of the cylinder, to drag it out
        const handle = !pos && at === "cylinder" ? columns.find((c) => c.id === "cylinder") : null;
        return (
          <g key={thing.id} data-testid={`object-${thing.id}`} data-at={at} aria-hidden="true"
            style={{ cursor: readOnly ? "default" : dragging ? "grabbing" : "grab", touchAction: "none" }}
            opacity={dragging ? 0.35 : 1}
            onPointerDown={(e) => start(thing.id, e as unknown as PointerEvent)}
            onPointerMove={(e) => moveTo(e as unknown as PointerEvent)}
            onPointerUp={(e) => end(e as unknown as PointerEvent)}
            onPointerCancel={() => setDrag(null)}>
            {pos && at === "dynamometer" && (
              <line x1={pos.x} y1={pos.y - size.h - 16} x2={pos.x} y2={pos.y - size.h + 2} stroke="#475569" stroke-width={1.5} />
            )}
            {pos && <ObjectShape thing={thing} index={index} x={pos.x} y={pos.y} uid={uid} />}
            {handle && <rect x={handle.cx - 30} y={FLOOR - 12 - 60} width={60} height={60} fill="transparent" />}
          </g>
        );
      })}

      {drag && (() => {
        const index = s.objects.findIndex((o) => o.id === drag.id);
        return (
          <g aria-hidden="true" pointer-events="none" opacity={0.9}>
            <ObjectShape thing={s.objects[index]} index={index} x={drag.x + drag.dx} y={drag.y + drag.dy} uid={uid} />
          </g>
        );
      })()}
    </svg>
  );
};
