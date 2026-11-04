// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Volcanismepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The picture: a U-tube with water, the purée in the right branch, the tablet and the stopper in the left branch, and
// the outcome above the right branch. Everything is a function of a few numbers, so an animation only changes those.
import { Outcome, Viscosity, outcomeAt, riseAt } from "./model";

/** The centre lines of the branches, the rim, the bottom of the straight parts and the width inside. */
const XL = 110;
const XR = 250;
const TOP = 60;
const BEND = 220;
const INNER = 36;
const HALF = INNER / 2;
const WATER = 160; // both water levels without purée
const PUREE = 60; // height of the purée column
const SHIFT = 15; // the purée pushes the right water down and the left water up by this much

export const PUREE_COLORS: Record<Viscosity, { fill: string; edge: string }> = {
  fluid: { fill: "#fde68a", edge: "#d6a514" },
  medium: { fill: "#fcd172", edge: "#c08a0a" },
  compact: { fill: "#f2bf5a", edge: "#9a6a06" },
};

export type SceneProps = {
  /** the purée in the tube, null: water only */
  viscosity: Viscosity | null;
  /** 0…1: how full the right branch is while pouring (1: poured) */
  pour: number;
  /** 0…1: the eruption (0: not started) */
  progress: number;
  tablets: number;
  outcome: Outcome | null;
  label: string;
};

/** A pseudo-random number 0…1 per index, the same on every render. */
const rand = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const U_PATH = (yl: number, yr: number) => `M${XL} ${yl} V${BEND} A${(XR - XL) / 2} ${(XR - XL) / 2} 0 0 0 ${XR} ${BEND} V${yr}`;

export const Scene = ({ viscosity, pour, progress, tablets, outcome, label }: SceneProps) => {
  const colors = viscosity ? PUREE_COLORS[viscosity] : PUREE_COLORS.fluid;
  const height = viscosity ? PUREE * pour : 0;
  const shift = viscosity ? SHIFT * pour : 0;
  const started = progress > 0 && viscosity !== null && outcome !== null;
  const pureeTop0 = WATER + shift - height;
  // the gas pushes everything up on the right by `lift` (to the rim at most)
  const lift = started ? riseAt(progress) * (pureeTop0 - TOP) : 0;
  const leftWater = WATER - shift + lift;
  const rightWater = WATER + shift - lift;
  const pureeTop = rightWater - height;
  const e = started ? outcomeAt(progress) : 0;

  // the tablet drops in the first quarter, the stopper closes behind it
  const drop = started ? Math.min(1, progress / 0.2) : 0;
  const stopperY = started ? TOP - 34 + Math.min(1, Math.max(0, (progress - 0.12) / 0.12)) * 26 : 0;
  const fizz = started ? Math.max(0, Math.min(1, (progress - 0.2) / 0.8)) : 0;

  const bubbles = [];
  if (started && progress > 0.22) {
    const n = 5 + tablets * 4;
    const span = BEND - leftWater;
    for (let i = 0; i < n; i++) {
      const t = (progress * (6 + rand(i) * 4) + rand(i + 50)) % 1;
      const y = BEND + 10 - t * (span + 10);
      if (y < leftWater + 2) continue;
      bubbles.push(<circle key={i} cx={XL - HALF + 6 + rand(i + 100) * (INNER - 12)} cy={y} r={1.6 + rand(i + 200) * 2.4}
        fill="#ffffff" fill-opacity="0.85" stroke="#60a5fa" stroke-width="0.8" />);
    }
  }

  // the outcome above the right branch
  let outcomeShapes = null;
  if (started && outcome && e > 0) {
    const fill = colors.fill;
    const edge = colors.edge;
    if (outcome === "flow") {
      const down = e * 150;
      outcomeShapes = (
        <g>
          <ellipse cx={XR} cy={TOP} rx={HALF + 6} ry={4 + 6 * Math.min(1, e * 3)} fill={fill} stroke={edge} stroke-width="1.5" />
          <path d={`M${XR + HALF + 4} ${TOP + 2} V${TOP + down}`} stroke={fill} stroke-width="9" stroke-linecap="round" fill="none" />
          <path d={`M${XR - HALF - 4} ${TOP + 2} V${TOP + down * 0.7}`} stroke={fill} stroke-width="8" stroke-linecap="round" fill="none" />
          <path d={`M${XR + HALF + 8.5} ${TOP + 2} V${TOP + down}`} stroke={edge} stroke-width="1" fill="none" />
        </g>
      );
    } else if (outcome === "dome") {
      const h = 8 + 42 * e;
      const w = HALF + 4 + 8 * e;
      outcomeShapes = (
        <g>
          <path d={`M${XR - w} ${TOP + 3} C${XR - w} ${TOP - h * 1.25} ${XR + w} ${TOP - h * 1.25} ${XR + w} ${TOP + 3} Z`}
            fill={fill} stroke={edge} stroke-width="1.5" />
          <path d={`M${XR - 8} ${TOP - h * 0.55} q6 -6 14 -2 M${XR - 12} ${TOP - h * 0.2} q8 -4 18 0`} stroke={edge} stroke-width="1" fill="none" />
        </g>
      );
    } else {
      // a short dome, then it bursts: blobs fly out in arcs and the dome is torn open
      const burst = Math.max(0, (e - 0.25) / 0.75);
      const h = burst > 0 ? 18 * (1 - burst * 0.6) : 8 + 40 * e;
      const blobs = [];
      if (burst > 0) {
        for (let i = 0; i < 9; i++) {
          const angle = -Math.PI / 2 + (rand(i + 300) - 0.5) * 1.9;
          const speed = 90 + rand(i + 400) * 70;
          const x = XR + Math.cos(angle) * speed * burst;
          const y = Math.max(-34, TOP - 10 + Math.sin(angle) * speed * burst + 150 * burst * burst);
          blobs.push(<circle key={i} cx={x} cy={y} r={3 + rand(i + 500) * 4} fill={fill} stroke={edge} stroke-width="1" />);
        }
        for (let i = 0; i < 4; i++) {
          const r = 10 + 22 * burst * (0.6 + rand(i + 600) * 0.4);
          blobs.push(<circle key={`p${i}`} cx={XR + (rand(i + 700) - 0.5) * 50} cy={Math.max(-20, TOP - 20 - 50 * burst * (0.5 + rand(i + 800)))} r={r}
            fill="#94a3b8" fill-opacity={0.35 * (1 - burst * 0.5)} />);
        }
      }
      outcomeShapes = (
        <g>
          <path d={`M${XR - HALF - 4} ${TOP + 3} C${XR - HALF - 4} ${TOP - h * 1.25} ${XR + HALF + 4} ${TOP - h * 1.25} ${XR + HALF + 4} ${TOP + 3} Z`}
            fill={fill} stroke={edge} stroke-width="1.5" />
          {blobs}
        </g>
      );
    }
  }

  // the jar while pouring
  const jar = viscosity && pour < 1 ? (
    <g transform={`translate(${XR + 34} ${TOP - 40}) rotate(${-20 - 70 * Math.min(1, pour * 2.5)})`}>
      <rect x="-16" y="-22" width="32" height="44" rx="6" fill="#e0f2fe" stroke="#64748b" stroke-width="2" />
      <rect x="-12" y={-18 + 36 * pour} width="24" height={36 * (1 - pour)} fill={colors.fill} />
      <rect x="-18" y="-26" width="36" height="6" rx="2" fill="#cbd5e1" stroke="#64748b" stroke-width="1.5" />
    </g>
  ) : null;
  const stream = viscosity && pour > 0.15 && pour < 0.95 ? (
    <path d={`M${XR + 6} ${TOP - 42} V${pureeTop}`} stroke={colors.fill} stroke-width={viscosity === "fluid" ? 6 : 9} stroke-linecap="round" />
  ) : null;

  return (
    <svg viewBox="0 -40 360 360" role="img" aria-label={label} class="w-full h-auto" data-testid="scene">
      {/* the bench */}
      <rect x="20" y="306" width="320" height="8" rx="2" fill="#cbd5e1" />
      {/* the stand */}
      <rect x="177" y="70" width="6" height="236" fill="#cbd5e1" />
      <rect x="150" y="300" width="60" height="8" rx="2" fill="#94a3b8" />
      {/* the glass: a thick light stroke, its inside white */}
      <path d={U_PATH(TOP, TOP)} fill="none" stroke="#94a3b8" stroke-width={INNER + 8} />
      <path d={U_PATH(TOP, TOP)} fill="none" stroke="#f8fafc" stroke-width={INNER} />
      {/* gas under the stopper */}
      {started && <rect x={XL - HALF} y={TOP} width={INNER} height={Math.max(0, leftWater - TOP)} fill="#e2e8f0" />}
      {/* water */}
      <path d={U_PATH(leftWater, rightWater)} fill="none" stroke="#93c5fd" stroke-width={INNER} />
      <path d={`M${XL - HALF} ${leftWater} h${INNER} M${XR - HALF} ${rightWater} h${INNER}`} stroke="#3b82f6" stroke-width="1.5" />
      {/* the purée column */}
      {viscosity && height > 0 && (
        <g>
          <path d={`M${XR - HALF} ${rightWater} V${Math.max(TOP, pureeTop) + 4} q${HALF} -8 ${INNER} 0 V${rightWater} Z`}
            fill={colors.fill} stroke={colors.edge} stroke-width="1.2" />
          {viscosity !== "fluid" &&
            Array.from({ length: viscosity === "compact" ? 14 : 7 }, (_, i) => (
              <circle key={i} cx={XR - HALF + 4 + rand(i + 900) * (INNER - 8)} cy={Math.max(TOP, pureeTop) + 8 + rand(i + 950) * Math.max(0, height - 12)}
                r="1.6" fill={colors.edge} fill-opacity="0.5" />
            ))}
        </g>
      )}
      {bubbles}
      {/* the tablet(s) */}
      {started &&
        Array.from({ length: tablets }, (_, i) => {
          const y = TOP - 30 + drop * (BEND - TOP + 34) - i * 9;
          const size = 1 - fizz * 0.75;
          return <rect key={i} x={XL - 10 * size + (i - (tablets - 1) / 2) * 6} y={y - 4 * size} width={20 * size} height={8 * size} rx={3 * size}
            fill="#ffffff" stroke="#64748b" stroke-width="1.2" />;
        })}
      {/* the stopper */}
      {started && (
        <path d={`M${XL - HALF - 3} ${stopperY} h${INNER + 6} l-3 30 h-${INNER} Z`} fill="#92400e" stroke="#78350f" stroke-width="1.5" />
      )}
      {/* the rims of the glass */}
      <path d={`M${XL - HALF - 6} ${TOP} h${INNER + 12} M${XR - HALF - 6} ${TOP} h${INNER + 12}`} stroke="#64748b" stroke-width="3" stroke-linecap="round" />
      {stream}
      {jar}
      {outcomeShapes}
    </svg>
  );
};
