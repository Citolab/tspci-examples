// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Abeillepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The picture, drawn in SVG: a meadow with a straw hive, flowers in four groups, the bees that fly around it, the
// pesticide haze, hornets and varroa mites. Bees and flowers that go fade out; the animations stop with
// prefers-reduced-motion (style.css and the reducedMotion prop).
import { FLOWER_GROUPS } from "./model";

/** A small seeded random generator (mulberry32): the same meadow every time. */
const random = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const FLOWER_COLORS = [
  { petal: "#60a5fa", edge: "#1d4ed8" },
  { petal: "#f87171", edge: "#b91c1c" },
  { petal: "#fde047", edge: "#ca8a04" },
];

type FlowerSpot = { x: number; y: number; size: number; group: number; color: number };
const FLOWERS: FlowerSpot[] = (() => {
  const rnd = random(11);
  const spots: FlowerSpot[] = [];
  for (let i = 0; i < 72; i++) {
    const back = i % 6 === 5;
    let x = 10 + rnd() * 780;
    const y = back ? 222 + rnd() * 30 : 262 + rnd() * 160;
    if (!back && x > 110 && x < 250 && y < 330) x += 160; // not in front of the hive's stand
    const size = back ? 3 + rnd() * 1.5 : 5 + ((y - 260) / 160) * 6 + rnd() * 2;
    spots.push({ x, y, size, group: i % FLOWER_GROUPS, color: i % 3 });
  }
  return spots.sort((a, b) => a.y - b.y);
})();

type BeeSpot = { x: number; y: number; delay: number; duration: number; flip: boolean };
export const BEE_SPOTS: BeeSpot[] = (() => {
  const rnd = random(5);
  return Array.from({ length: 40 }, (_, i) => {
    // the first ones close to the hive, the later ones further out over the meadow
    const near = i < 10;
    return {
      x: near ? 120 + rnd() * 300 : 40 + rnd() * 700,
      y: near ? 110 + rnd() * 160 : 70 + rnd() * 280,
      delay: -rnd() * 4,
      duration: 2.6 + rnd() * 2,
      flip: rnd() < 0.35,
    };
  });
})();

const HORNET_SPOTS = [
  { x: 320, y: 170 },
  { x: 92, y: 150 },
  { x: 300, y: 250 },
  { x: 250, y: 105 },
  { x: 70, y: 235 },
  { x: 360, y: 120 },
];

const MITE_SPOTS = [
  { x: 150, y: 250, r: 20 },
  { x: 196, y: 228, r: -10 },
  { x: 230, y: 262, r: 35 },
  { x: 168, y: 205, r: 0 },
  { x: 214, y: 196, r: -30 },
  { x: 140, y: 280, r: 10 },
  { x: 236, y: 232, r: 60 },
  { x: 182, y: 268, r: -45 },
];

export const Bee = () => (
  <g>
    <ellipse className="wing" cx="-3" cy="-8" rx="6" ry="4.5" fill="#e0f2fe" stroke="#64748b" stroke-width="0.6" opacity="0.9" />
    <ellipse className="wing" cx="3" cy="-8.5" rx="5" ry="3.8" fill="#f0f9ff" stroke="#64748b" stroke-width="0.6" opacity="0.9" />
    <path d="M-11 0 L-15 1 L-11 2 Z" fill="#292524" />
    <ellipse cx="0" cy="0" rx="11" ry="7" fill="#facc15" stroke="#422006" stroke-width="1" />
    <ellipse cx="-4" cy="0" rx="1.8" ry="6.6" fill="#292524" />
    <ellipse cx="2" cy="0" rx="1.8" ry="6.9" fill="#292524" />
    <circle cx="11" cy="-1" r="4.6" fill="#292524" />
    <circle cx="12.5" cy="-2.2" r="1" fill="#fafaf9" />
    <path d="M13 -5 q2 -4 5 -4" fill="none" stroke="#292524" stroke-width="0.9" />
  </g>
);

export const Hornet = () => (
  <g>
    <ellipse className="wing" cx="-6" cy="-12" rx="11" ry="6" fill="#fef3c7" stroke="#78716c" stroke-width="0.7" opacity="0.85" />
    <ellipse className="wing" cx="3" cy="-12" rx="9" ry="5" fill="#fffbeb" stroke="#78716c" stroke-width="0.7" opacity="0.85" />
    <path d="M-6 6 l-4 8 M0 7 l-1 9 M6 6 l3 8" stroke="#eab308" stroke-width="1.6" stroke-linecap="round" />
    <ellipse cx="-12" cy="1" rx="12" ry="8" fill="#1c1917" />
    <path d="M-20 -3 a12 8 0 0 0 0 9 l-3 -4.5 z" fill="#f59e0b" />
    <ellipse cx="-17" cy="1" rx="2" ry="6.5" fill="#f59e0b" />
    <ellipse cx="4" cy="0" rx="8" ry="6" fill="#292524" />
    <circle cx="15" cy="-1" r="6.5" fill="#f59e0b" stroke="#78350f" stroke-width="0.8" />
    <circle cx="18" cy="-3" r="2" fill="#1c1917" />
    <path d="M17 -7 q3 -6 8 -6" fill="none" stroke="#1c1917" stroke-width="1.1" />
  </g>
);

const Flower = ({ size, color }: { size: number; color: number }) => {
  const c = FLOWER_COLORS[color];
  const r = size * 0.55;
  return (
    <g>
      <path d={`M0 ${size * 0.4} V${size * 2.2}`} stroke="#3f7d20" stroke-width={Math.max(1, size / 5)} />
      {[0, 72, 144, 216, 288].map((a) => (
        <circle key={a} cx={Math.cos((a * Math.PI) / 180) * r} cy={Math.sin((a * Math.PI) / 180) * r} r={size * 0.5} fill={c.petal} stroke={c.edge} stroke-width="0.5" />
      ))}
      <circle r={size * 0.38} fill={color === 2 ? "#b45309" : "#fde68a"} />
    </g>
  );
};

const Mite = () => (
  <g>
    <path d="M-3 -1 l-2.5 -2 M-3 1 l-2.5 2 M3 -1 l2.5 -2 M3 1 l2.5 2 M0 -2 v-2.5 M0 2 v2.5" stroke="#451a03" stroke-width="0.8" />
    <ellipse rx="3.6" ry="2.8" fill="#9a3412" stroke="#451a03" stroke-width="0.6" />
  </g>
);

/** A straw skep on a wooden stand, the entrance to the front. */
const Hive = () => (
  <g>
    <rect x="128" y="300" width="8" height="58" fill="#7c4a1e" />
    <rect x="232" y="300" width="8" height="58" fill="#7c4a1e" />
    <rect x="112" y="290" width="144" height="14" rx="3" fill="#a16207" stroke="#713f12" />
    <path d="M124 290 C118 220 150 168 184 166 C218 168 250 220 244 290 Z" fill="#e0a83a" stroke="#92400e" stroke-width="2" />
    {[278, 262, 246, 230, 214, 198, 184].map((y, i) => {
      const half = [58, 57, 54, 49, 42, 33, 22][i];
      return <path key={y} d={`M${184 - half} ${y} Q184 ${y + 6} ${184 + half} ${y}`} fill="none" stroke="#b45309" stroke-width="2" opacity="0.8" />;
    })}
    <path d="M166 290 a18 16 0 0 1 36 0 Z" fill="#3b2106" />
    <ellipse cx="184" cy="168" rx="9" ry="5" fill="#ca8a04" />
  </g>
);

export type SceneProps = {
  /** A prefix for the ids in this picture (two interactions in one item). */
  uid: string;
  /** Bees drawn now; `slots` bees are in the picture, the others faded out. */
  bees: number;
  slots: number;
  /** Groups of flowers left, 0 to 4. */
  flowerGroups: number;
  /** 0 to 1: the pesticide slider. */
  pesticide: number;
  /** Hornets at the hive (the hornet level). */
  hornets: number;
  /** Counts up each time the hornet goes up: a hornet flies across. 0: none. */
  hornetFlight: number;
  /** 0 to 1: the varroa slider. */
  varroa: number;
  reducedMotion: boolean;
  label: string;
};

export const Scene = ({ uid, bees, slots, flowerGroups, pesticide, hornets, hornetFlight, varroa, reducedMotion, label }: SceneProps) => {
  const droplets = Math.round(pesticide * 28);
  const mites = Math.round(varroa * MITE_SPOTS.length);
  const rnd = random(3);
  const drops = Array.from({ length: 28 }, () => ({ x: 20 + rnd() * 760, y: 120 + rnd() * 260, r: 2 + rnd() * 2.5 }));
  return (
    <svg viewBox="0 0 800 440" className="block h-auto w-full" role="img" aria-label={label} data-testid="scene"
      data-bees={bees} data-flowers={flowerGroups} data-hornets={hornets} data-motion={reducedMotion ? "reduced" : "full"}>
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#7dd3fc" />
          <stop offset="1" stop-color="#e0f2fe" />
        </linearGradient>
        <linearGradient id={`${uid}-grass`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#86c34a" />
          <stop offset="1" stop-color="#4d8a24" />
        </linearGradient>
      </defs>
      <rect width="800" height="440" fill={`url(#${uid}-sky)`} />
      <circle cx="700" cy="66" r="34" fill="#fde047" opacity="0.9" />
      <g fill="#ffffff" opacity="0.9">
        <ellipse cx="140" cy="60" rx="46" ry="16" />
        <ellipse cx="176" cy="50" rx="30" ry="16" />
        <ellipse cx="470" cy="84" rx="40" ry="13" />
        <ellipse cx="500" cy="76" rx="24" ry="12" />
      </g>
      <path d="M0 220 C120 170 230 196 340 190 C470 182 560 150 800 196 V440 H0 Z" fill="#a3d977" />
      <path d="M0 250 C160 226 330 236 470 226 C620 216 700 232 800 226 V440 H0 Z" fill={`url(#${uid}-grass)`} />
      {/* a tree on the right */}
      <rect x="652" y="150" width="16" height="92" fill="#78350f" />
      <circle cx="660" cy="140" r="44" fill="#3f8f2a" />
      <circle cx="628" cy="160" r="28" fill="#4fa336" />
      <circle cx="694" cy="158" r="30" fill="#367d23" />

      <g className="pesticide fade" data-testid="pesticide" opacity={pesticide > 0 ? 1 : 0}>
        <rect y="130" width="800" height="310" fill="#d9e36b" opacity={0.4 * pesticide} />
        {drops.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#a3a635" opacity={i < droplets ? 0.7 : 0} className="fade" />
        ))}
      </g>

      <Hive />
      <g data-testid="mites">
        {MITE_SPOTS.map((m, i) => (
          <g key={i} transform={`translate(${m.x} ${m.y}) rotate(${m.r})`} opacity={i < mites ? 1 : 0} className="fade">
            <Mite />
          </g>
        ))}
      </g>

      <g data-testid="flowers">
        {FLOWERS.map((f, i) => (
          <g key={i} transform={`translate(${f.x.toFixed(1)} ${f.y.toFixed(1)})`} className="fade" opacity={f.group < FLOWER_GROUPS - flowerGroups ? 0 : 1}
            data-group={f.group}>
            <Flower size={f.size} color={f.color} />
          </g>
        ))}
      </g>

      <g data-testid="bees">
        {BEE_SPOTS.slice(0, slots).map((b, i) => (
          <g key={i} transform={`translate(${b.x.toFixed(1)} ${b.y.toFixed(1)})${b.flip ? " scale(-1 1)" : ""}`} className="fade" opacity={i < bees ? 1 : 0}
            data-visible={i < bees ? "true" : "false"}>
            <g className="bee-fly" style={{ animationDelay: `${b.delay.toFixed(2)}s`, animationDuration: `${b.duration.toFixed(2)}s` }}>
              <Bee />
            </g>
          </g>
        ))}
      </g>

      <g data-testid="hornets">
        {HORNET_SPOTS.slice(0, Math.min(hornets, HORNET_SPOTS.length)).map((h, i) => (
          <g key={i} transform={`translate(${h.x} ${h.y})${i % 2 ? " scale(-1 1)" : ""}`}>
            <g className="hornet-hover" style={{ animationDelay: `${-i * 0.7}s` }}>
              <Hornet />
            </g>
          </g>
        ))}
      </g>
      {hornetFlight > 0 && !reducedMotion && (
        <g key={hornetFlight} className="hornet-flight" data-testid="hornet-flight">
          <Hornet />
        </g>
      )}
    </svg>
  );
};
