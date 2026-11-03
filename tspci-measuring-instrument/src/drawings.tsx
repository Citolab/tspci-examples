import { Fragment } from "preact";
import {
  CLOCK_HIGH, Geometry, Model, Tick, angleOf, clean, decimalsOf, formatNumber, formatValue, fractionOf, geometryOf, polar, ticksOf, vernierTicks,
} from "./instrument";

// The instruments, drawn in SVG in the coordinates of geometryOf (instrument.ts): realistic but clean. A drawing only
// shows a value; dragging, the keyboard and the magnifier are in view.tsx. The magnifier draws it a second time.

const INK = "#1e293b";
type Dial = Extract<Geometry, { type: "dial" }>;
type DrawProps = {
  m: Model;
  /** The value the instrument shows. */
  value: number;
  /** Ids of the gradients (Defs), one set per drawing on the page. */
  uid: string;
  /** Meter: the range plugged in (null: no lead plugged in). */
  plugged?: number | null;
};

/** The gradients and patterns the drawings use; once per SVG, outside the magnifier's copy. */
export const Defs = ({ uid }: { uid: string }) => (
  <defs>
    <linearGradient id={`${uid}-glass`} x1="0" x2="1">
      <stop offset="0" stop-color="#e2e8f0" stop-opacity="0.9" />
      <stop offset="0.3" stop-color="#ffffff" stop-opacity="0.6" />
      <stop offset="1" stop-color="#cbd5e1" stop-opacity="0.9" />
    </linearGradient>
    <linearGradient id={`${uid}-liquid`} x1="0" x2="1">
      <stop offset="0" stop-color="#7dd3fc" />
      <stop offset="0.5" stop-color="#bae6fd" />
      <stop offset="1" stop-color="#38bdf8" />
    </linearGradient>
    <linearGradient id={`${uid}-metal`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f1f5f9" />
      <stop offset="0.5" stop-color="#cbd5e1" />
      <stop offset="1" stop-color="#94a3b8" />
    </linearGradient>
    <linearGradient id={`${uid}-mirror`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e2e8f0" />
      <stop offset="0.45" stop-color="#ffffff" />
      <stop offset="0.55" stop-color="#cbd5e1" />
      <stop offset="1" stop-color="#f8fafc" />
    </linearGradient>
    <radialGradient id={`${uid}-brass`}>
      <stop offset="0.85" stop-color="#fbbf24" />
      <stop offset="1" stop-color="#92400e" />
    </radialGradient>
    <linearGradient id={`${uid}-case`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#475569" />
      <stop offset="1" stop-color="#1e293b" />
    </linearGradient>
    <pattern id={`${uid}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="#cbd5e1" />
      <line x1="0" y1="0" x2="0" y2="6" stroke="#64748b" stroke-width="1.5" />
    </pattern>
  </defs>
);

const label = (m: Model, v: number) => formatValue(v, m.language);
const tickLength = (t: Tick, lengths: [number, number, number]) => lengths[t.level];

/** Ticks and numbers along a dial, inwards from r. */
const DialScale = ({ m, g, labelRadius, lengths = [16, 11, 7], text = (t: Tick) => label(m, t.label!), fontSize = 15 }: {
  m: Model; g: Dial; labelRadius: number; lengths?: [number, number, number]; text?: (t: Tick) => string; fontSize?: number;
}) => {
  const ticks = ticksOf(m).filter((t) => !(g.turn && t.value === m.max)); // a full turn: max lies on min
  return (
    <g aria-hidden="true">
      <g stroke={INK} stroke-linecap="round">
        {ticks.map((t) => {
          const a = angleOf(m, g, t.value);
          const p = polar(g.cx, g.cy, g.r, a);
          const q = polar(g.cx, g.cy, g.r - tickLength(t, lengths), a);
          return <line key={t.value} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke-width={t.level === 0 ? 2 : t.level === 1 ? 1.4 : 0.9} />;
        })}
      </g>
      <g fill={INK} font-size={fontSize} font-weight="600" text-anchor="middle" dominant-baseline="central">
        {ticks.filter((t) => t.level === 0).map((t) => {
          const p = polar(g.cx, g.cy, labelRadius, angleOf(m, g, t.value));
          return <text key={t.value} x={p.x} y={p.y}>{text(t)}</text>;
        })}
      </g>
    </g>
  );
};

const Needle = ({ g, angle, length, tail = 18, color = INK, width = 2.2 }: { g: Dial; angle: number; length: number; tail?: number; color?: string; width?: number }) => {
  const tip = polar(g.cx, g.cy, length, angle);
  const back = polar(g.cx, g.cy, -tail, angle);
  return (
    <g data-testid="needle" data-angle={clean(angle)}>
      <line x1={back.x} y1={back.y} x2={tip.x} y2={tip.y} stroke={color} stroke-width={width} stroke-linecap="round" />
    </g>
  );
};

const Thermometer = ({ m, value, uid }: DrawProps) => {
  const g = geometryOf(m) as Extract<Geometry, { type: "linear" }>;
  const y = (v: number) => g.from.y + Math.max(-0.03, Math.min(1.03, fractionOf(m, v))) * (g.to.y - g.from.y);
  const ticks = ticksOf(m);
  return (
    <g>
      <rect x={36} y={20} width={150} height={505} rx={14} fill="#f8fafc" stroke="#cbd5e1" stroke-width={1.5} />
      <text x={150} y={46} font-size={15} font-weight="700" fill={INK} text-anchor="middle">{m.unit}</text>
      <rect x={72} y={36} width={16} height={460} rx={8} fill={`url(#${uid}-glass)`} stroke="#94a3b8" stroke-width={1.2} />
      <circle cx={80} cy={500} r={17} fill="#dc2626" stroke="#991b1b" stroke-width={1.5} />
      <rect x={77.5} y={y(value)} width={5} height={Math.max(0, 500 - y(value))} fill="#dc2626" data-testid="liquid" />
      <circle cx={75} cy={494} r={4} fill="#fff" fill-opacity="0.55" />
      <line x1={75} y1={44} x2={75} y2={480} stroke="#fff" stroke-opacity="0.7" stroke-width={1.5} />
      <g stroke={INK} stroke-linecap="round" aria-hidden="true">
        {ticks.map((t) => <line key={t.value} x1={92} y1={y(t.value)} x2={92 + tickLength(t, [24, 16, 10])} y2={y(t.value)} stroke-width={t.level === 0 ? 1.8 : 1} />)}
      </g>
      <g fill={INK} font-size={14} font-weight="600" text-anchor="end" dominant-baseline="central" aria-hidden="true">
        {ticks.filter((t) => t.level === 0).map((t) => <text key={t.value} x={170} y={y(t.value)}>{label(m, t.value)}</text>)}
      </g>
    </g>
  );
};

const Cylinder = ({ m, value, uid }: DrawProps) => {
  const g = geometryOf(m) as Extract<Geometry, { type: "linear" }>;
  const y = (v: number) => g.from.y + Math.max(0, Math.min(1.06, fractionOf(m, v))) * (g.to.y - g.from.y);
  const level = y(value);
  const left = 82;
  const right = 178;
  const bottom = 478;
  const ticks = ticksOf(m);
  return (
    <g>
      {/* the foot and the glass */}
      <path d="M 40 498 L 220 498 L 206 480 L 54 480 Z" fill="#cbd5e1" stroke="#64748b" stroke-width={1.2} />
      <path d={`M ${left - 2} 40 L ${left - 2} ${bottom + 2} L ${right + 2} ${bottom + 2} L ${right + 2} 40 L ${right + 14} 30`} fill="none" stroke="#64748b" stroke-width={2} />
      <rect x={left} y={40} width={right - left} height={bottom - 40} fill={`url(#${uid}-glass)`} fill-opacity="0.5" />
      {/* the liquid, with a meniscus that bends up at the glass: read at its bottom */}
      {value > m.min || level < g.from.y ? (
        <path data-testid="liquid"
          d={`M ${left} ${level - 8} C ${left + 3} ${level}, ${left + 18} ${level}, ${(left + right) / 2} ${level} C ${right - 18} ${level}, ${right - 3} ${level}, ${right} ${level - 8} L ${right} ${bottom} L ${left} ${bottom} Z`}
          fill={`url(#${uid}-liquid)`} fill-opacity="0.85" stroke="#0369a1" stroke-width={1.4} />
      ) : null}
      <g stroke={INK} stroke-linecap="round" aria-hidden="true">
        {ticks.map((t) => <line key={t.value} x1={left + 4} y1={y(t.value)} x2={left + 4 + tickLength(t, [44, 30, 18])} y2={y(t.value)} stroke-width={t.level === 0 ? 1.6 : 1} />)}
      </g>
      <g fill={INK} font-size={14} font-weight="600" dominant-baseline="central" aria-hidden="true">
        {ticks.filter((t) => t.level === 0).map((t) => <text key={t.value} x={left + 54} y={y(t.value)}>{label(m, t.value)}</text>)}
      </g>
      <text x={right - 8} y={60} font-size={14} font-weight="700" fill={INK} text-anchor="end">{m.unit}</text>
      <line x1={right - 8} y1={50} x2={right - 8} y2={bottom - 10} stroke="#fff" stroke-opacity="0.6" stroke-width={3} />
    </g>
  );
};

const Meter = ({ m, value, uid, plugged }: DrawProps) => {
  const g = geometryOf(m) as Dial;
  const sockets = [{ label: "COM", range: null as number | null }, ...m.ranges.map((r) => ({ label: `${formatNumber(r, decimalsOf(r), m.language)} ${m.unit}`, range: r }))];
  const gap = 300 / sockets.length;
  return (
    <g>
      <rect x={6} y={6} width={348} height={348} rx={22} fill={`url(#${uid}-case)`} />
      <rect x={24} y={24} width={312} height={214} rx={10} fill="#fffdf6" stroke="#0f172a" stroke-width={1.5} />
      {/* the mirror under the scale: the needle covers its reflection when you look straight at it */}
      <path d={arc(g, g.r - 36, g.r - 26)} fill={`url(#${uid}-mirror)`} stroke="#94a3b8" stroke-width={0.8} />
      <DialScale m={m} g={g} labelRadius={g.r + 14} />
      <text x={180} y={190} font-size={34} font-weight="700" fill={INK} text-anchor="middle" font-family="Georgia, serif">{m.unit}</text>
      <Needle g={g} angle={angleOf(m, g, value)} length={g.r + 4} tail={0} width={1.8} />
      {/* the lower panel hides the pivot; the terminals with the leads */}
      <path d="M 6 238 H 354 V 332 Q 354 354 332 354 H 28 Q 6 354 6 332 Z" fill={`url(#${uid}-case)`} />
      <circle cx={180} cy={252} r={9} fill="#0f172a" stroke="#64748b" />
      {sockets.map((s, i) => {
        const x = 30 + gap * (i + 0.5);
        const lead = s.range === null || s.range === plugged;
        const com = s.range === null;
        return (
          <g key={s.label} data-testid={com ? "socket-com" : `socket-${s.range}`} data-plugged={lead && !com ? "true" : undefined}>
            <text x={x} y={282} font-size={13} font-weight={lead ? "800" : "500"} fill="#f8fafc" text-anchor="middle">{com ? "COM −" : `+ ${s.label}`}</text>
            <circle cx={x} cy={310} r={13} fill={com ? "#0f172a" : "#b91c1c"} stroke="#e2e8f0" stroke-width={1.5} />
            <circle cx={x} cy={310} r={5} fill="#0f172a" />
            {lead && (
              <g aria-hidden="true">
                <rect x={x - 7} y={302} width={14} height={30} rx={4} fill={com ? "#111827" : "#dc2626"} stroke="#fff" stroke-width={1.5} />
                <line x1={x} y1={332} x2={x} y2={354} stroke={com ? "#111827" : "#dc2626"} stroke-width={5} />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
};

/** A ring segment from r1 to r2 along the dial, for the mirror of a meter. */
const arc = (g: Dial, r1: number, r2: number) => {
  const a = polar(g.cx, g.cy, r2, g.start);
  const b = polar(g.cx, g.cy, r2, g.end);
  const c = polar(g.cx, g.cy, r1, g.end);
  const d = polar(g.cx, g.cy, r1, g.start);
  return `M ${a.x} ${a.y} A ${r2} ${r2} 0 0 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${r1} ${r1} 0 0 0 ${d.x} ${d.y} Z`;
};

const KitchenScale = ({ m, value, uid }: DrawProps) => {
  const g = geometryOf(m) as Dial;
  return (
    <g>
      <rect x={160} y={40} width={40} height={50} fill="#94a3b8" />
      <ellipse cx={180} cy={42} rx={150} ry={18} fill={`url(#${uid}-metal)`} stroke="#64748b" stroke-width={1.5} />
      <path d="M 40 100 Q 40 80 70 80 L 290 80 Q 320 80 320 100 L 340 390 Q 342 410 320 410 L 40 410 Q 18 410 20 390 Z" fill="#f1f5f9" stroke="#94a3b8" stroke-width={1.5} />
      <circle cx={g.cx} cy={g.cy} r={146} fill="#fff" stroke="#475569" stroke-width={6} />
      <DialScale m={m} g={g} labelRadius={g.r - 30} fontSize={14} />
      <text x={180} y={g.cy + 52} font-size={22} font-weight="700" fill={INK} text-anchor="middle">{m.unit}</text>
      <text x={180} y={g.cy + 72} font-size={11} fill="#475569" text-anchor="middle">max {label(m, m.max)} {m.unit}</text>
      <Needle g={g} angle={angleOf(m, g, value)} length={g.r - 2} color="#b91c1c" width={3} />
      <circle cx={g.cx} cy={g.cy} r={9} fill="#334155" />
    </g>
  );
};

const Manometer = ({ m, value, uid }: DrawProps) => {
  const g = geometryOf(m) as Dial;
  return (
    <g>
      <path d="M 158 330 L 202 330 L 202 360 L 214 370 L 214 400 L 146 400 L 146 370 L 158 360 Z" fill="#d97706" stroke="#92400e" stroke-width={1.5} />
      <rect x={170} y={400} width={20} height={26} fill="#334155" />
      <circle cx={g.cx} cy={g.cy} r={156} fill={`url(#${uid}-brass)`} stroke="#92400e" stroke-width={2} />
      <circle cx={g.cx} cy={g.cy} r={142} fill="#fff" stroke="#78350f" stroke-width={1.5} />
      <DialScale m={m} g={g} labelRadius={g.r - 30} />
      <text x={180} y={g.cy + 58} font-size={20} font-weight="700" fill={INK} text-anchor="middle">{m.unit}</text>
      <Needle g={g} angle={angleOf(m, g, value)} length={g.r - 2} width={3} />
      <circle cx={g.cx} cy={g.cy} r={10} fill="#0f172a" />
    </g>
  );
};

const Clock = ({ m, value }: DrawProps) => {
  const g = geometryOf(m) as Dial;
  const v = ((value % CLOCK_HIGH) + CLOCK_HIGH) % CLOCK_HIGH;
  const hour = polar(g.cx, g.cy, 82, (v / CLOCK_HIGH) * 360);
  return (
    <g>
      <circle cx={g.cx} cy={g.cy} r={170} fill="#334155" />
      <circle cx={g.cx} cy={g.cy} r={160} fill="#fff" />
      <DialScale m={m} g={g} labelRadius={118} lengths={[18, 10, 8]} fontSize={26} text={(t) => String(t.value === 0 ? 12 : t.value / 5)} />
      <g data-testid="hour-hand">
        <line x1={g.cx} y1={g.cy} x2={hour.x} y2={hour.y} stroke={INK} stroke-width={8} stroke-linecap="round" />
      </g>
      <Needle g={g} angle={angleOf(m, g, v)} length={140} tail={14} width={4.5} />
      <circle cx={g.cx} cy={g.cy} r={8} fill={INK} />
    </g>
  );
};

const Stopwatch = ({ m, value, uid }: DrawProps) => {
  const g = geometryOf(m) as Dial;
  const sub = { ...g, cx: g.cx, cy: g.cy + 50, r: 32, start: 0, end: 360, turn: 30 } as Dial;
  const subModel = { ...m, min: 0, max: 30, major: 5, minor: 5 };
  const minutes = value / 60;
  return (
    <g>
      <rect x={164} y={14} width={32} height={22} rx={4} fill={`url(#${uid}-metal)`} stroke="#64748b" />
      <rect x={172} y={34} width={16} height={32} fill="#94a3b8" stroke="#64748b" />
      <circle cx={g.cx} cy={g.cy} r={172} fill={`url(#${uid}-metal)`} stroke="#64748b" stroke-width={2} />
      <circle cx={g.cx} cy={g.cy} r={156} fill="#fff" stroke="#475569" stroke-width={1.5} />
      <DialScale m={m} g={g} labelRadius={g.r - 30} lengths={[16, 10, 5]} text={(t) => String(t.value === 0 ? 60 : t.value)} />
      <circle cx={sub.cx} cy={sub.cy} r={sub.r + 4} fill="#f8fafc" stroke="#94a3b8" />
      <g stroke={INK} aria-hidden="true">
        {Array.from({ length: 30 }, (_, i) => {
          const a = (i / 30) * 360;
          const p = polar(sub.cx, sub.cy, sub.r, a);
          const q = polar(sub.cx, sub.cy, sub.r - (i % 5 === 0 ? 7 : 4), a);
          return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke-width={i % 5 === 0 ? 1.4 : 0.8} />;
        })}
      </g>
      <g font-size={9} fill={INK} text-anchor="middle" dominant-baseline="central" aria-hidden="true">
        {[0, 10, 20].map((n) => {
          const p = polar(sub.cx, sub.cy, sub.r - 14, (n / 30) * 360);
          return <text key={n} x={p.x} y={p.y}>{n === 0 ? 30 : n}</text>;
        })}
      </g>
      <text x={sub.cx} y={sub.cy + 16} font-size={8} fill="#475569" text-anchor="middle">min</text>
      <g data-testid="minute-hand">
        <Needle g={sub} angle={angleOf(subModel, sub, minutes)} length={sub.r - 2} tail={4} width={2} />
      </g>
      <text x={180} y={g.cy - 50} font-size={16} font-weight="700" fill={INK} text-anchor="middle">{m.unit}</text>
      <Needle g={g} angle={angleOf(m, g, value)} length={g.r} tail={24} width={2} color="#b91c1c" />
      <circle cx={g.cx} cy={g.cy} r={7} fill="#b91c1c" />
    </g>
  );
};

const Ruler = ({ m, value }: DrawProps) => {
  const g = geometryOf(m) as Extract<Geometry, { type: "linear" }>;
  const x = (v: number) => g.from.x + Math.max(0, Math.min(1, fractionOf(m, v))) * (g.to.x - g.from.x);
  const tip = x(value);
  const start = x(m.min);
  const ticks = ticksOf(m);
  const length = tip - start;
  return (
    <g>
      {/* the pencil, its end on the 0 of the ruler; its point at the value */}
      <g data-testid="pencil">
        {length > 30 && <rect x={start} y={78} width={Math.max(0, length - 30)} height={28} fill="#facc15" stroke="#a16207" stroke-width={1.2} />}
        {length > 30 && <rect x={start} y={78} width={10} height={28} fill="#f472b6" stroke="#be185d" stroke-width={1.2} />}
        {length > 30 && <line x1={start} y1={92} x2={tip - 30} y2={92} stroke="#a16207" stroke-width={0.8} />}
        <path d={`M ${Math.max(start, tip - 30)} 78 L ${tip} 92 L ${Math.max(start, tip - 30)} 106 Z`} fill="#fde68a" stroke="#a16207" stroke-width={1.2} />
        <path d={`M ${tip - 9} 88 L ${tip} 92 L ${tip - 9} 96 Z`} fill="#334155" />
      </g>
      <rect x={g.from.x - 22} y={g.from.y} width={g.to.x - g.from.x + 44} height={70} rx={4} fill="#fef9c3" fill-opacity="0.92" stroke="#a16207" stroke-width={1.5} />
      <g stroke={INK} aria-hidden="true">
        {ticks.map((t) => <line key={t.value} x1={x(t.value)} y1={g.from.y} x2={x(t.value)} y2={g.from.y + tickLength(t, [22, 15, 9])} stroke-width={t.level === 0 ? 1.4 : 0.9} />)}
      </g>
      <g fill={INK} font-size={14} font-weight="600" text-anchor="middle" aria-hidden="true">
        {ticks.filter((t) => t.level === 0).map((t) => <text key={t.value} x={x(t.value)} y={g.from.y + 42}>{label(m, t.value)}</text>)}
      </g>
      <text x={g.to.x + 8} y={g.from.y + 62} font-size={12} fill="#713f12" text-anchor="end">{m.unit}</text>
    </g>
  );
};

const Caliper = ({ m, value, uid }: DrawProps) => {
  const g = geometryOf(m) as Extract<Geometry, { type: "linear" }>;
  const ppu = (g.to.x - g.from.x) / (m.max - m.min);
  const x = (v: number) => g.from.x + (v - m.min) * ppu;
  const zero = x(Math.max(m.min, Math.min(m.max, value)));
  const ticks = ticksOf(m);
  const vernier = vernierTicks(m.vernier);
  const vernierEnd = zero + vernier[vernier.length - 1].offset * ppu;
  // a caliper in mm has its main scale numbered in cm
  const mainLabel = (v: number) => (m.unit === "mm" && m.major === 10 ? formatNumber(v / 10, decimalsOf(v / 10), m.language) : label(m, v));
  return (
    <g>
      {/* the block between the jaws */}
      <rect x={g.from.x} y={214} width={Math.max(0, zero - g.from.x)} height={52} fill={`url(#${uid}-hatch)`} stroke="#475569" stroke-width={1.2} data-testid="block" />
      {/* the beam with the main scale, and the fixed jaw */}
      <rect x={g.from.x - 50} y={100} width={g.to.x - g.from.x + 110} height={50} fill={`url(#${uid}-metal)`} stroke="#64748b" stroke-width={1.2} />
      <path d={`M ${g.from.x - 50} 150 L ${g.from.x} 150 L ${g.from.x} 290 L ${g.from.x - 14} 300 L ${g.from.x - 50} 300 Z`} fill={`url(#${uid}-metal)`} stroke="#64748b" stroke-width={1.2} />
      <g stroke={INK} aria-hidden="true">
        {ticks.map((t) => <line key={t.value} x1={x(t.value)} y1={150} x2={x(t.value)} y2={150 - tickLength(t, [18, 12, 8])} stroke-width={t.level === 0 ? 1.3 : 0.8} />)}
      </g>
      <g fill={INK} font-size={13} font-weight="600" text-anchor="middle" aria-hidden="true">
        {ticks.filter((t) => t.level === 0).map((t) => <text key={t.value} x={x(t.value)} y={122}>{mainLabel(t.value)}</text>)}
      </g>
      <text x={g.to.x + 40} y={122} font-size={11} fill="#334155" text-anchor="middle">{m.unit === "mm" && m.major === 10 ? "cm" : m.unit}</text>
      {/* the slider with the vernier and the sliding jaw */}
      <g data-testid="slider-jaw">
        <path d={`M ${zero - 26} 150 L ${vernierEnd + 26} 150 L ${vernierEnd + 26} 200 L ${zero + 34} 200 L ${zero + 34} 300 L ${zero + 14} 300 L ${zero} 290 L ${zero} 200 L ${zero - 26} 200 Z`}
          fill="#e2e8f0" fill-opacity="0.95" stroke="#475569" stroke-width={1.4} />
        <g stroke={INK} aria-hidden="true">
          {vernier.map((v) => <line key={v.k} x1={zero + v.offset * ppu} y1={151} x2={zero + v.offset * ppu} y2={151 + (v.label !== undefined && v.label % 2 === 0 ? 14 : v.label !== undefined ? 11 : 7)} stroke-width={v.label !== undefined && v.label % 2 === 0 ? 1.2 : 0.8} />)}
        </g>
        <g fill={INK} font-size={10} text-anchor="middle" aria-hidden="true">
          {vernier.filter((v) => v.label !== undefined && v.label % 2 === 0).map((v) => <text key={v.k} x={zero + v.offset * ppu} y={180}>{v.label}</text>)}
        </g>
        <text x={(zero + vernierEnd) / 2} y={194} font-size={8} fill="#475569" text-anchor="middle">{formatNumber(1 / m.vernier, decimalsOf(1 / m.vernier), m.language)} mm</text>
      </g>
    </g>
  );
};

const DRAWINGS = { thermometer: Thermometer, cylinder: Cylinder, meter: Meter, scale: KitchenScale, ruler: Ruler, caliper: Caliper, clock: Clock, stopwatch: Stopwatch, manometer: Manometer };

export const Drawing = (props: DrawProps) => {
  const D = DRAWINGS[props.m.kind];
  return <Fragment><D {...props} /></Fragment>;
};
