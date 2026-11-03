import { useEffect, useRef, useState } from "preact/hooks";
import type { Item, Setup, Trial } from "./chance";
import type { Texts } from "./texts";

// The tools as pictures (SVG): colour-blind safe colours (Okabe–Ito), each with its own pattern and the item's letter,
// so no information is carried by colour alone.

export const COLORS = ["#D55E00", "#0072B2", "#F0E442", "#009E73", "#E69F00", "#56B4E9", "#CC79A7", "#9CA3AF"];
/** marks in white on the dark colours, in dark slate on the light ones */
const DARK = [true, true, false, true, false, false, false, false];

/** The patterns, once per shadow root: fill="url(#cp-p3)" is colour 3 with its pattern. */
export const Patterns = () => (
  <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
    <defs>
      {COLORS.map((c, i) => {
        const ink = DARK[i] ? "rgba(255,255,255,.6)" : "rgba(30,41,59,.45)";
        const marks = [
          null,
          <path d="M-2 2l4-4M0 8l8-8M6 10l4-4" stroke={ink} stroke-width="1.6" />,
          <circle cx="4" cy="4" r="1.5" fill={ink} />,
          <path d="M0 0l8 8M8 0l-8 8" stroke={ink} stroke-width="1.1" />,
          <path d="M0 4h8" stroke={ink} stroke-width="1.8" />,
          <path d="M-2 6l4 4M0 0l8 8M6 -2l4 4" stroke={ink} stroke-width="1.6" />,
          <path d="M4 0v8" stroke={ink} stroke-width="1.8" />,
          <path d="M0 0h4v4h-4zM4 4h4v4h-4z" fill={ink} />,
        ][i];
        return (
          <pattern key={i} id={`cp-p${i}`} width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill={c} />
            {marks}
          </pattern>
        );
      })}
    </defs>
  </svg>
);

export const fillOf = (color: number) => (color >= 0 ? `url(#cp-p${color})` : "#f8fafc");

/** The text of a step for the candidate: heads and tails in their language, the author's labels as they are. */
export const stepName = (t: Texts) => (label: string) => (label === "H" ? t.heads : label === "T" ? t.tails : label);

/** The text of an outcome key: the steps with commas, or a sum or number of heads. */
export const keyName = (setup: Setup, t: Texts) => (key: string) => {
  if (setup.tool === "coins" && setup.coins.combine === "sum") return t.headsCount(key);
  if (setup.tool === "dice" && setup.dice.combine === "sum" && /^-?\d+$/.test(key)) return key;
  return key.split(",").map(stepName(t)).join(", ");
};

/** A letter that reads on every colour: white with a dark outline. */
const Letter = ({ x, y, text, size }: { x: number; y: number; text: string; size: number }) => (
  <text x={x} y={y} text-anchor="middle" dominant-baseline="central" font-size={size} font-weight="700" fill="#fff" stroke="#1e293b"
    stroke-width={size / 6} paint-order="stroke" style={{ pointerEvents: "none" }}>
    {text}
  </text>
);

export const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
export const useReducedMotion = () => {
  const [reduced, setReduced] = useState(reducedMotion);
  useEffect(() => {
    const q = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!q) return;
    const on = () => setReduced(q.matches);
    q.addEventListener?.("change", on);
    return () => q.removeEventListener?.("change", on);
  }, []);
  return reduced;
};

const point = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
};
export const sectorPath = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  if (a1 - a0 >= 359.999) return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
  const [x0, y0] = point(cx, cy, r, a0);
  const [x1, y1] = point(cx, cy, r, a1);
  return `M${cx} ${cy}L${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}z`;
};

/** The sectors with their start and end angles (clockwise from the top), sizes as weights. */
export const sectorAngles = (sectors: Item[]) => {
  const total = sectors.reduce((a, x) => a + x.count, 0) || 1;
  let at = 0;
  return sectors.filter((x) => x.count > 0).map((x) => {
    const a0 = at;
    at += (x.count / total) * 360;
    return { item: x, a0, a1: at };
  });
};

/**
 * A spinner: its sectors with pattern and letter, and the pointer. A new angle turns the pointer forward two full turns
 * and then to the angle (no turning with reduced motion).
 */
export const Spinner = ({ sectors, angle, label, animate, size = 220 }: {
  sectors: Item[]; angle: number | null; label: string; animate: boolean; size?: number;
}) => {
  const [turn, setTurn] = useState(angle ?? 0);
  const previous = useRef(angle);
  useEffect(() => {
    if (angle === null || angle === previous.current) return;
    previous.current = angle;
    setTurn((t) => (animate ? t - (t % 360) + 720 + angle : angle));
  }, [angle, animate]);
  const parts = sectorAngles(sectors);
  return (
    <svg viewBox="0 0 220 220" width={size} height={size} role="img" aria-label={label} className="max-w-full">
      <circle cx="110" cy="110" r="104" fill="#fff" stroke="#cbd5e1" stroke-width="2" />
      {parts.map(({ item, a0, a1 }, i) => {
        const [lx, ly] = point(110, 110, 64, (a0 + a1) / 2);
        return (
          <g key={i}>
            <path d={sectorPath(110, 110, 100, a0, a1)} fill={fillOf(item.color)} stroke="#fff" stroke-width="2" />
            {a1 - a0 >= 14 && <Letter x={lx} y={ly} text={item.letter} size={a1 - a0 >= 30 ? 18 : 12} />}
          </g>
        );
      })}
      <g className="cp-pointer" style={{
        transform: `rotate(${turn}deg)`, transformOrigin: "110px 110px",
        transition: animate ? "transform 900ms cubic-bezier(.15,.75,.25,1)" : "none",
      }}>
        <path d="M110 110L110 30" stroke="#0f172a" stroke-width="5" stroke-linecap="round" />
        <path d="M110 18l9 16h-18z" fill="#0f172a" />
      </g>
      <circle cx="110" cy="110" r="9" fill="#0f172a" />
      <circle cx="110" cy="110" r="3.5" fill="#fff" />
    </svg>
  );
};

/** A ball with its pattern and letter. */
export const Ball = ({ item, size = 34, className = "" }: { item: Item; size?: number; className?: string }) => (
  <svg viewBox="0 0 34 34" width={size} height={size} aria-hidden="true" className={className}>
    <circle cx="17" cy="17" r="15" fill={fillOf(item.color)} stroke="#1e293b" stroke-width="1.5" />
    <circle cx="12" cy="11" r="4" fill="#fff" opacity=".35" />
    <Letter x={17} y={17.5} text={item.letter} size={14} />
  </svg>
);

/** A bag with its balls (in the order of the items). */
export const Bag = ({ balls, label, size = 220 }: { balls: Item[]; label: string; size?: number }) => {
  const all: Item[] = balls.flatMap((b) => Array.from({ length: b.count }, () => b));
  const columns = all.length > 24 ? 8 : 6;
  const r = all.length > 24 ? 9 : 12;
  const step = r * 2 + 3;
  const rows = Math.ceil(all.length / columns);
  const top = 190 - rows * step;
  return (
    <svg viewBox="0 0 220 210" width={size} height={(size * 210) / 220} role="img" aria-label={label} className="max-w-full">
      <path d="M58 36C40 70 22 120 26 160c4 36 40 46 84 46s80-10 84-46c4-40-14-90-32-124z" fill="#fef3c7" stroke="#b45309" stroke-width="3" />
      <path d="M58 36c20-10 84-10 104 0" fill="none" stroke="#b45309" stroke-width="3" />
      <path d="M70 30c8-14 18-22 40-22s32 8 40 22" fill="none" stroke="#b45309" stroke-width="5" stroke-linecap="round" />
      {all.map((b, i) => {
        const row = Math.floor(i / columns);
        const inRow = Math.min(columns, all.length - row * columns);
        const x = 110 + (i % columns - (inRow - 1) / 2) * step;
        const y = Math.max(60, top) + row * step + r;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={r} fill={fillOf(b.color)} stroke="#1e293b" stroke-width="1.2" />
            <Letter x={x} y={y + 0.5} text={b.letter} size={r} />
          </g>
        );
      })}
    </svg>
  );
};

const PIPS: Record<string, [number, number][]> = {
  "1": [[2, 2]],
  "2": [[1, 1], [3, 3]],
  "3": [[1, 1], [2, 2], [3, 3]],
  "4": [[1, 1], [3, 1], [1, 3], [3, 3]],
  "5": [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]],
  "6": [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]],
};

/** A die showing a face: pips for 1 to 6, otherwise the label. */
export const Die = ({ face, label, roll }: { face: string; label: string; roll: boolean }) => (
  <svg viewBox="0 0 64 64" width="64" height="64" role="img" aria-label={label} className={roll ? "cp-roll" : ""}>
    <rect x="3" y="3" width="58" height="58" rx="12" fill="#fff" stroke="#334155" stroke-width="2.5" />
    {PIPS[face]
      ? PIPS[face].map(([x, y], i) => <circle key={i} cx={8 + x * 12} cy={8 + y * 12} r="5" fill="#0f172a" />)
      : <text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-size={face.length > 3 ? 13 : 22} font-weight="700" fill="#0f172a">{face}</text>}
  </svg>
);

/** A coin showing heads or tails, by its letter and a different look. */
export const Coin = ({ side, t, label, flip }: { side: string; t: Texts; label: string; flip: boolean }) => (
  <svg viewBox="0 0 64 64" width="64" height="64" role="img" aria-label={label} className={flip ? "cp-flip" : ""}>
    <circle cx="32" cy="32" r="29" fill={side === "H" ? "#fcd34d" : "#e2e8f0"} stroke={side === "H" ? "#b45309" : "#475569"} stroke-width="3" />
    <circle cx="32" cy="32" r="22" fill="none" stroke={side === "H" ? "#b45309" : "#475569"} stroke-width="1.5" stroke-dasharray={side === "H" ? "0" : "3 3"} />
    <text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-size="24" font-weight="800" fill="#0f172a">
      {side === "H" ? t.headsLetter : t.tailsLetter}
    </text>
  </svg>
);

/** What a trial shows: the dice, the coins, the spinner's pointer, or the balls drawn. */
export const ToolView = ({ setup, trial, trialIndex, t, animate }: {
  setup: Setup; trial: Trial | null; trialIndex: number; t: Texts; animate: boolean;
}) => {
  const name = stepName(t);
  if (setup.tool === "spinner") {
    const at = trial ? trial.angles[trial.angles.length - 1] : null;
    const labels = sectorAngles(setup.spinner.sectors).map((x) => x.item.label).join(", ");
    return (
      <div className="flex flex-col items-center gap-2">
        <Spinner sectors={setup.spinner.sectors} angle={at} animate={animate} label={t.spinnerImage(labels, trial ? trial.steps[trial.steps.length - 1] : "")} />
      </div>
    );
  }
  if (setup.tool === "bag") {
    const contents = setup.bag.balls.filter((b) => b.count).map((b) => `${b.count} × ${b.label}`).join(", ");
    const item = (label: string) => setup.bag.balls.find((b) => b.label === label)!;
    return (
      <div className="flex flex-col items-center gap-2">
        <Bag balls={setup.bag.balls} label={t.bagImage(contents)} size={200} />
        <div className="flex min-h-10 items-center gap-2 text-sm text-slate-600" data-testid="drawn">
          {trial && (
            <>
              <span>{t.drawn}:</span>
              {trial.steps.map((s, i) => (
                <span key={`${trialIndex}-${i}`} className="inline-flex items-center gap-1">
                  <Ball item={item(s)} size={30} className={animate ? "cp-pop" : ""} />
                  <span className="sr-only">{s}</span>
                </span>
              ))}
            </>
          )}
        </div>
      </div>
    );
  }
  const n = setup.tool === "dice" ? setup.dice.count : setup.coins.count;
  return (
    <div className="flex min-h-24 flex-wrap items-center justify-center gap-3 py-4" data-testid="thrown">
      {Array.from({ length: n }, (_, i) => {
        const face = trial?.steps[i] ?? (setup.tool === "dice" ? setup.dice.faces[0] : "H");
        const key = `${trialIndex}-${i}`;
        return setup.tool === "dice"
          ? <Die key={key} face={face} roll={animate && !!trial} label={t.die(i + 1, trial ? face : "–")} />
          : <Coin key={key} side={face} t={t} flip={animate && !!trial} label={t.coin(i + 1, trial ? name(face) : "–")} />;
      })}
    </div>
  );
};
