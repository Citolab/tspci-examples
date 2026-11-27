/*
 * The kitchen and cleaning tools, drawn in SVG: a kitchen scale with a digital display (and a bowl), a measuring jug and
 * a dosing cup with their lines, spoons, pieces (eggs, onions, …), a bucket, a bottle, and the GHS hazard pictograms
 * (drawn here: a red diamond with a black symbol, as the GHS prescribes; the pictograms are free to use). A drawing only
 * shows a value: the slider and the buttons are in tools.tsx. Every drawing is aria-hidden: its value is in text.
 */
import type { JSX } from "preact";
import { Hazard, Icon, ToolSpec, clean } from "./kitchen";

const INK = "#1e293b";
const LINE = "#475569";

// ---- the kitchen scale ----

/**
 * A kitchen scale: a platform, a bowl on it (or none), the ingredient as a heap that grows with its weight, and a
 * digital display. `display` is what the display shows (the text, in grams).
 */
export function Scale({ content, max, display, bowl, color, uid }: { content: number; max: number; display: string; bowl: boolean; color: string; uid: string }) {
  const f = Math.sqrt(Math.min(1, Math.max(0, content) / max));
  const base = bowl ? 102 : 106;
  const w = bowl ? 26 + 38 * f : 22 + 64 * f;
  const h = bowl ? 4 + 44 * f : 6 + 52 * f;
  const heap = `M${140 - w} ${base} Q${140 - w * 0.55} ${base - h * 1.05} 140 ${base - h} Q${140 + w * 0.55} ${base - h * 1.05} ${140 + w} ${base} Z`;
  return (
    <svg viewBox="0 0 280 212" class="block h-auto w-full" aria-hidden="true" data-drawing="scale">
      <defs>
        <clipPath id={`${uid}-bowl`}>
          <path d="M66 0 L214 0 L214 48 Q210 104 140 104 Q70 104 66 48 Z" />
        </clipPath>
        <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#f8fafc" />
          <stop offset="1" stop-color="#dbe3ea" />
        </linearGradient>
      </defs>
      <ellipse cx="140" cy="204" rx="122" ry="6" fill="#0f172a" fill-opacity="0.12" />
      <path d="M30 120 H250 A14 14 0 0 1 264 134 V186 A14 14 0 0 1 250 200 H30 A14 14 0 0 1 16 186 V134 A14 14 0 0 1 30 120 Z" fill={`url(#${uid}-body)`} stroke={LINE} stroke-width="2" />
      <rect x="76" y="134" width="128" height="52" rx="8" fill="#26332a" />
      <rect x="83" y="140" width="114" height="40" rx="4" fill="#cfe9c0" />
      <text x="176" y="170" text-anchor="end" font-size="26" font-weight="700" font-family="ui-monospace, 'SF Mono', Menlo, Consolas, monospace" fill="#10220c" data-display>
        {display}
      </text>
      <text x="181" y="170" font-size="15" font-weight="700" font-family="system-ui, sans-serif" fill="#10220c">
        g
      </text>
      <rect x="122" y="112" width="36" height="10" fill="#94a3b8" />
      <rect x="40" y="104" width="200" height="11" rx="5" fill="#cbd5e1" stroke={LINE} stroke-width="1.5" />
      {bowl && <path d="M66 48 Q70 104 140 104 Q210 104 214 48 Z" fill="#ffffff" stroke={LINE} stroke-width="2" />}
      {content > 0 && (
        <path d={heap} fill={color} stroke={shade(color)} stroke-width="1.5" clip-path={bowl ? `url(#${uid}-bowl)` : undefined} data-heap />
      )}
      {bowl && (
        <>
          <ellipse cx="140" cy="48" rx="74" ry="9" fill="none" stroke={LINE} stroke-width="2" />
          <path d="M80 62 Q86 92 118 98" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-opacity="0.8" />
        </>
      )}
    </svg>
  );
}

// ---- the measuring jug and the dosing cup ----

type Beaker = { left: number; right: number; top: number; zero: number; full: number; bottom: number };
/** Where a level lies on a beaker: 0 at `zero`, the capacity at `full`. */
export const levelY = (b: Beaker, level: number, capacity: number) => b.zero - (Math.max(0, Math.min(level, capacity * 1.04)) / capacity) * (b.zero - b.full);
/** The level at a height on a beaker (dragging). */
export const levelAt = (b: Beaker, y: number, capacity: number) => ((b.zero - y) / (b.zero - b.full)) * capacity;

export const JUG: Beaker = { left: 62, right: 172, top: 36, zero: 268, full: 62, bottom: 280 };
export const CUP: Beaker = { left: 36, right: 140, top: 26, zero: 178, full: 46, bottom: 188 };

/** The lines of a beaker: a short one every `minor`, a long one with a number every `major`; "ml" after the top number. */
function Lines({ b, spec, fontSize }: { b: Beaker; spec: ToolSpec; fontSize: number }) {
  const lines: JSX.Element[] = [];
  const minor = spec.minor ?? spec.max / 10;
  const major = spec.major ?? spec.max / 5;
  for (let v = minor; v <= spec.max + 1e-9; v = clean(v + minor)) {
    const y = levelY(b, v, spec.max);
    const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    lines.push(<line key={`l${v}`} x1={b.left + 3} x2={b.left + (isMajor ? 30 : 17)} y1={y} y2={y} stroke={INK} stroke-width={isMajor ? 2 : 1.3} />);
    if (isMajor)
      lines.push(
        <text key={`t${v}`} x={b.left + 35} y={y + fontSize * 0.36} font-size={fontSize} font-weight="700" fill={INK} stroke="#ffffff" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round">
          {v}
          {v + major > spec.max + 1e-9 && <tspan font-size={fontSize * 0.85}> ml</tspan>}
        </text>
      );
  }
  return <g>{lines}</g>;
}

/** A measuring jug with a handle, its lines in ml, and the liquid up to `level`. */
export function Jug({ level, spec, color, uid }: { level: number; spec: ToolSpec; color: string; uid: string }) {
  const b = JUG;
  const y = levelY(b, level, spec.max);
  return (
    <g data-drawing="jug" data-level={level}>
      <defs>
        <linearGradient id={`${uid}-glass`} x1="0" x2="1">
          <stop offset="0" stop-color="#e2edf5" />
          <stop offset="0.35" stop-color="#ffffff" />
          <stop offset="1" stop-color="#d6e2ec" />
        </linearGradient>
      </defs>
      <path d={`M${b.right} 84 C ${b.right + 52} 84, ${b.right + 52} 206, ${b.right} 206`} fill="none" stroke={LINE} stroke-width="13" stroke-linecap="round" />
      <path d={`M${b.right} 84 C ${b.right + 52} 84, ${b.right + 52} 206, ${b.right} 206`} fill="none" stroke="#e2e8f0" stroke-width="7" stroke-linecap="round" />
      <path d={`M${b.left} ${b.top} L${b.left - 16} ${b.top - 10} L${b.left} ${b.top + 16} Z`} fill={`url(#${uid}-glass)`} stroke={LINE} stroke-width="2" stroke-linejoin="round" />
      <rect x={b.left} y={b.top} width={b.right - b.left} height={b.bottom - b.top} rx="10" fill={`url(#${uid}-glass)`} stroke={LINE} stroke-width="2.5" />
      {level > 0 && (
        <>
          <rect x={b.left + 2.5} y={y} width={b.right - b.left - 5} height={b.zero - y + 9} rx="2" fill={color} fill-opacity="0.95" stroke={shade(color)} stroke-width="1.5" />
          <line x1={b.left + 2.5} x2={b.right - 2.5} y1={y} y2={y} stroke="#1e3a5f" stroke-width="2.5" />
        </>
      )}
      <Lines b={b} spec={spec} fontSize={14} />
      <line x1={b.right - 16} x2={b.right - 16} y1={b.top + 34} y2={b.zero - 20} stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-opacity="0.7" />
    </g>
  );
}

/** A dosing cup (or cap): small, with its lines in ml, and the product up to `level`. */
export function Cup({ level, spec, color }: { level: number; spec: ToolSpec; color: string }) {
  const b = CUP;
  const y = levelY(b, level, spec.max);
  return (
    <g data-drawing="cup" data-level={level}>
      <path d={`M${b.left - 6} ${b.top} H${b.right + 6}`} stroke={LINE} stroke-width="4" stroke-linecap="round" />
      <rect x={b.left} y={b.top} width={b.right - b.left} height={b.bottom - b.top} rx="8" fill="#f8fafc" fill-opacity="0.9" stroke={LINE} stroke-width="2.5" />
      {level > 0 && (
        <>
          <rect x={b.left + 2.5} y={y} width={b.right - b.left - 5} height={b.zero - y + 7} rx="2" fill={color} fill-opacity="0.75" stroke={shade(color)} stroke-width="1.5" />
          <line x1={b.left + 2.5} x2={b.right - 2.5} y1={y} y2={y} stroke={INK} stroke-width="2.5" />
        </>
      )}
      <Lines b={b} spec={spec} fontSize={13} />
    </g>
  );
}

// ---- the bucket ----

/** A bucket of water; product poured in tints it and makes foam. `pours`: how many times product went in. */
export function Bucket({ volume, pours, color, uid }: { volume: number; pours: number; color: string; uid: string }) {
  const tint = Math.min(0.55, pours ? 0.18 + 0.12 * pours : 0);
  return (
    <svg viewBox="0 0 220 196" class="block h-auto w-full" aria-hidden="true" data-drawing="bucket" data-pours={pours}>
      <defs>
        <clipPath id={`${uid}-bucket`}>
          <path d="M33 44 L187 44 L170 182 L50 182 Z" />
        </clipPath>
      </defs>
      <path d="M28 44 C 28 -4, 192 -4, 192 44" fill="none" stroke={LINE} stroke-width="3.5" />
      <path d="M28 40 L192 40 L174 186 L46 186 Z" fill="#e8eef3" stroke={LINE} stroke-width="2.5" stroke-linejoin="round" />
      <g clip-path={`url(#${uid}-bucket)`}>
        <rect x="20" y="78" width="180" height="120" fill="#bfe1f3" />
        {pours > 0 && <rect x="20" y="78" width="180" height="120" fill={color} fill-opacity={tint} data-tint />}
        <line x1="20" x2="200" y1="78" y2="78" stroke="#2a6f97" stroke-width="2" />
        {pours > 0 &&
          [46, 66, 84, 104, 126, 146, 166].map((x, i) => (
            <circle key={x} cx={x} cy={76 - (i % 2) * 3} r={5 + (i % 3)} fill="#ffffff" stroke="#94a3b8" stroke-width="1" />
          ))}
      </g>
      <path d="M28 40 L192 40" stroke={LINE} stroke-width="4" stroke-linecap="round" />
      <text x="110" y="150" text-anchor="middle" font-size="22" font-weight="800" fill="#1e3a5f">
        {`${String(volume).replace(".", ",")} l`}
      </text>
    </svg>
  );
}

// ---- spoons and pieces ----

const CELL = 54;
const PER_ROW = 6;

/** Spoons in a row: whole ones full, the last one half full for a half; an empty spoon (dashed) for none. */
export function Spoons({ count, size, color, uid }: { count: number; size: "tbsp" | "tsp"; color: string; uid: string }) {
  const n = Math.ceil(count - 1e-9);
  const cells = Math.max(1, n);
  const cols = Math.min(cells, PER_ROW);
  const rows = Math.ceil(cells / PER_ROW);
  const rx = size === "tbsp" ? 17 : 12;
  const ry = size === "tbsp" ? 22 : 16;
  return (
    <svg viewBox={`0 0 ${cols * CELL + 8} ${rows * 92 + 6}`} class="block h-auto" style={{ width: `${(cols * CELL + 8) * 1.1}px`, maxWidth: "100%" }} aria-hidden="true" data-drawing="spoons" data-count={count}>
      {Array.from({ length: cells }, (_, i) => {
        const x = 4 + (i % PER_ROW) * CELL + CELL / 2;
        const y = 6 + Math.floor(i / PER_ROW) * 92 + 26;
        const fill = n === 0 ? 0 : i < Math.floor(count + 1e-9) ? 1 : 0.5;
        const id = `${uid}-spoon-${i}`;
        return (
          <g key={i} data-spoon={fill}>
            <rect x={x - 3.5} y={y + ry - 2} width="7" height={size === "tbsp" ? 42 : 36} rx="3.5" fill="#aab6c3" stroke={LINE} stroke-width="1.5" />
            <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={n === 0 ? "#f1f5f9" : "#aab6c3"} stroke={LINE} stroke-width="2" stroke-dasharray={n === 0 ? "4 3" : undefined} />
            {fill > 0 && (
              <>
                <clipPath id={id}>
                  <rect x={x - rx} y={fill === 1 ? y - ry : y} width={rx * 2} height={fill === 1 ? ry * 2 : ry} />
                </clipPath>
                <ellipse cx={x} cy={y} rx={rx - 3} ry={ry - 3} fill={color} stroke={shade(color)} stroke-width="1.5" clip-path={`url(#${id})`} />
                {fill === 0.5 && <line x1={x - rx + 3} x2={x + rx - 3} y1={y} y2={y} stroke={shade(color)} stroke-width="2" />}
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Pieces in rows (eggs, onions, …); a dashed circle for none. */
export function Pieces({ count, icon }: { count: number; icon: Icon }) {
  const cells = Math.max(1, count);
  const cols = Math.min(cells, PER_ROW);
  const rows = Math.ceil(cells / PER_ROW);
  return (
    <svg viewBox={`0 0 ${cols * CELL} ${rows * CELL}`} class="block h-auto" style={{ width: `${cols * CELL * 1.1}px`, maxWidth: "100%" }} aria-hidden="true" data-drawing="pieces" data-count={count}>
      {count === 0 ? (
        <circle cx={CELL / 2} cy={CELL / 2} r="20" fill="none" stroke={LINE} stroke-width="2" stroke-dasharray="5 4" />
      ) : (
        Array.from({ length: count }, (_, i) => (
          <g key={i} transform={`translate(${(i % PER_ROW) * CELL + 3} ${Math.floor(i / PER_ROW) * CELL + 3})`}>
            <PieceIcon icon={icon} />
          </g>
        ))
      )}
    </svg>
  );
}

/** One piece, in a 48 × 48 box. */
export function PieceIcon({ icon }: { icon: Icon }) {
  switch (icon) {
    case "egg":
      return (
        <g>
          <path d="M24 4 C 34 4, 41 20, 41 30 C 41 40, 33 46, 24 46 C 15 46, 7 40, 7 30 C 7 20, 14 4, 24 4 Z" fill="#f3e0c2" stroke="#8a6a3f" stroke-width="2" />
          <ellipse cx="18" cy="20" rx="3.5" ry="6" fill="#ffffff" fill-opacity="0.7" />
        </g>
      );
    case "onion":
      return (
        <g>
          <path d="M24 4 C 27 12, 41 18, 41 31 C 41 41, 33 46, 24 46 C 15 46, 7 41, 7 31 C 7 18, 21 12, 24 4 Z" fill="#c98a4b" stroke="#6b3d14" stroke-width="2" />
          <path d="M24 10 C 20 20, 18 32, 22 45 M24 10 C 29 20, 31 32, 27 45" fill="none" stroke="#6b3d14" stroke-width="1.3" />
        </g>
      );
    case "apple":
      return (
        <g>
          <path d="M24 14 C 18 9, 6 11, 6 26 C 6 38, 15 46, 20 46 C 22 46, 23 45, 24 45 C 25 45, 26 46, 28 46 C 33 46, 42 38, 42 26 C 42 11, 30 9, 24 14 Z" fill="#d64545" stroke="#7f1d1d" stroke-width="2" />
          <path d="M24 14 C 24 9, 25 6, 27 3" fill="none" stroke="#5b3a1a" stroke-width="2.5" stroke-linecap="round" />
          <path d="M27 8 C 31 3, 37 4, 38 6 C 35 10, 30 10, 27 8 Z" fill="#3f8f3a" />
        </g>
      );
    case "orange":
      return (
        <g>
          <circle cx="24" cy="26" r="19" fill="#f39a1e" stroke="#9a4d06" stroke-width="2" />
          {[[17, 20], [29, 19], [22, 31], [32, 30], [15, 32]].map(([x, y]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r="1.3" fill="#b45f06" />
          ))}
          <path d="M24 7 C 26 4, 30 4, 31 5" fill="none" stroke="#3f8f3a" stroke-width="2.5" stroke-linecap="round" />
        </g>
      );
    case "banana":
      return (
        <g>
          <path d="M8 14 C 10 34, 26 44, 44 38 C 44 34, 41 33, 38 34 C 26 36, 16 28, 14 12 Z" fill="#f4d03f" stroke="#8a6d0b" stroke-width="2" stroke-linejoin="round" />
          <path d="M8 14 L10 9 L14 12" fill="#5b4a1a" stroke="#5b4a1a" stroke-width="2" stroke-linejoin="round" />
        </g>
      );
    case "cube":
      return (
        <g>
          <path d="M8 18 L24 10 L40 18 L24 26 Z" fill="#f0c35a" stroke="#7a5a10" stroke-width="2" stroke-linejoin="round" />
          <path d="M8 18 L24 26 L24 44 L8 36 Z" fill="#d9a441" stroke="#7a5a10" stroke-width="2" stroke-linejoin="round" />
          <path d="M40 18 L24 26 L24 44 L40 36 Z" fill="#c38d2c" stroke="#7a5a10" stroke-width="2" stroke-linejoin="round" />
        </g>
      );
    case "sausage":
      return (
        <g>
          <path d="M8 36 C 6 14, 42 14, 40 36" fill="none" stroke="#5a2410" stroke-width="13" stroke-linecap="round" />
          <path d="M8 36 C 6 14, 42 14, 40 36" fill="none" stroke="#a0472a" stroke-width="9" stroke-linecap="round" />
          <path d="M14 22 C 18 18, 24 17, 28 18" fill="none" stroke="#e7a08a" stroke-width="2" stroke-linecap="round" />
        </g>
      );
    default:
      return <circle cx="24" cy="26" r="18" fill="#b6bec8" stroke={LINE} stroke-width="2" />;
  }
}

// ---- cleaning: a bottle, the hazard pictograms ----

/** A bottle of a cleaning product in its colour, with a blank label. */
export function Bottle({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 40 66" class="block h-14 w-auto shrink-0" aria-hidden="true">
      <rect x="14" y="1" width="12" height="9" rx="2" fill={INK} />
      <path d="M11 15 Q11 10 16 10 H24 Q29 10 29 15 L34 23 V59 Q34 64 29 64 H11 Q6 64 6 59 V23 Z" fill={color} stroke={INK} stroke-width="1.8" />
      <rect x="10" y="30" width="20" height="20" rx="2" fill="#ffffff" stroke={INK} stroke-width="1" />
    </svg>
  );
}

/** A GHS hazard pictogram: a red diamond on white, a black symbol. */
export function Pictogram({ hazard, size = 48 }: { hazard: Hazard; size?: number }) {
  return (
    <svg viewBox="-5 -5 110 110" width={size} height={size} aria-hidden="true" data-hazard={hazard}>
      <polygon points="50,3 97,50 50,97 3,50" fill="#ffffff" stroke="#d7191c" stroke-width="8" stroke-linejoin="round" />
      <g fill="#000000" stroke="none">{SYMBOLS[hazard]}</g>
    </svg>
  );
}

const SYMBOLS: Record<Hazard, JSX.Element> = {
  exclamation: (
    <>
      <path d="M44 24 H56 L54 62 H46 Z" />
      <circle cx="50" cy="72" r="6.5" />
    </>
  ),
  flame: (
    <>
      <path d="M50 18 C 57 30, 70 38, 68 54 C 67 64, 60 71, 50 71 C 40 71, 32 64, 32 55 C 32 46, 38 41, 41 33 C 44 41, 46 44, 49 46 C 52 38, 53 28, 50 18 Z" />
      <path d="M50 50 C 54 56, 58 60, 56 65 C 54 69, 46 69, 44 65 C 42 60, 47 56, 50 50 Z" fill="#ffffff" />
      <rect x="29" y="74" width="42" height="5" />
    </>
  ),
  corrosive: (
    <>
      <path d="M22 17 L37 37 M78 17 L63 37" stroke="#000000" stroke-width="11" stroke-linecap="round" />
      <path d="M40 43 C 44 49, 44 53, 40 54 C 36 53, 36 49, 40 43 Z M40 57 C 43 61, 43 63, 40 64 C 37 63, 37 61, 40 57 Z" />
      <path d="M60 43 C 64 49, 64 53, 60 54 C 56 53, 56 49, 60 43 Z M60 57 C 63 61, 63 63, 60 64 C 57 63, 57 61, 60 57 Z" />
      <path d="M17 67 H35 L38 63 L42 67 H46 V77 H17 Z" />
      <path d="M53 77 V70 Q53 67 56 67 H57 L60 63 L63 67 H81 Q84 67 84 70 V72 H72 L69 77 Z" />
      <rect x="15" y="79" width="71" height="4" />
    </>
  ),
  environment: (
    <>
      <path d="M31 80 V38" stroke="#000000" stroke-width="5" />
      <path d="M31 52 L19 39 M31 46 L42 32 M31 61 L43 51 M31 66 L20 57" stroke="#000000" stroke-width="4" stroke-linecap="round" />
      <ellipse cx="61" cy="71" rx="15" ry="6.5" />
      <path d="M74 71 L85 63 L85 79 Z" />
      <path d="M52 68 L56 72 M56 68 L52 72" stroke="#ffffff" stroke-width="1.6" />
      <rect x="16" y="80" width="70" height="4" />
    </>
  ),
};

/** A darker shade of a colour, for an outline: #rrggbb × 0.6. */
export function shade(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return LINE;
  const n = parseInt(m[1], 16);
  const part = (shift: number) => Math.round(((n >> shift) & 255) * 0.6).toString(16).padStart(2, "0");
  return `#${part(16)}${part(8)}${part(0)}`;
}
