import { useEffect, useRef, useState } from "preact/hooks";
import { Settings, Signal, amplitudeInDivisions, cyclesOnScreen, formatNumber } from "./settings";
import { Trace, pointAt, tracePath } from "./signal";
import { Texts } from "./texts";

// The screen: a dark grid with the traces. The reference is grey and dashed, the candidate's signal green and solid
// (told apart by line style and brightness too, not by colour alone). A beam runs along the candidate's trace, unless
// the setting or the system (prefers-reduced-motion) says no.

export const DIVISION = 40;
const PAD = 14;
const SWEEP_MS = 2400;
const TRAIL = 70; // px of the trace behind the beam that lights up

export type ScreenTrace = { key: string; signal: Signal; kind: "reference" | "candidate" | "ghost" };

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const Screen = ({ settings, traces, texts, label }: { settings: Settings; traces: ScreenTrace[]; texts: Texts; label: string }) => {
  const { columns, rows } = settings;
  const width = columns * DIVISION;
  const height = rows * DIVISION;
  const toTrace = (signal: Signal): Trace => ({
    waveform: settings.waveform,
    cycles: cyclesOnScreen(settings, signal.frequency),
    amplitude: amplitudeInDivisions(settings, signal.amplitude),
    columns,
    rows,
    division: DIVISION,
  });
  const candidate = traces.find((t) => t.kind === "candidate");
  const beamTrace = candidate ? toTrace(candidate.signal) : null;

  // the running beam: moved by hand in an animation frame, without rendering
  const [still, setStill] = useState(reducedMotion);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const change = () => setStill(query.matches);
    query.addEventListener?.("change", change);
    return () => query.removeEventListener?.("change", change);
  }, []);
  const beam = useRef<SVGCircleElement>(null);
  const trail = useRef<SVGPathElement>(null);
  const traceRef = useRef<Trace | null>(beamTrace);
  traceRef.current = beamTrace;
  const running = settings.animate && !still && !!beamTrace;
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = traceRef.current;
      if (t && beam.current && trail.current) {
        const x = (((now - t0) % SWEEP_MS) / SWEEP_MS) * width;
        const [, y] = pointAt(t, x);
        beam.current.setAttribute("cx", x.toFixed(1));
        beam.current.setAttribute("cy", y.toFixed(1));
        const from = Math.max(0, x - TRAIL);
        const n = TRAIL; // a point per px: square edges stay upright
        const d = Array.from({ length: n + 1 }, (_, i) => pointAt(t, from + ((x - from) * i) / n))
          .map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join("");
        trail.current.setAttribute("d", d);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, width]);

  // grid lines, with small ticks on the centre lines as on a real scope
  const lines: string[] = [];
  for (let c = 1; c < columns; c++) lines.push(`M${c * DIVISION} 0V${height}`);
  for (let r = 1; r < rows; r++) lines.push(`M0 ${r * DIVISION}H${width}`);
  const ticks: string[] = [];
  const midX = (Math.round(columns / 2) * DIVISION);
  const midY = height / 2;
  for (let i = 1; i < columns * 5; i++) if (i % 5) ticks.push(`M${(i * DIVISION) / 5} ${midY - 3}v6`);
  for (let i = 1; i < rows * 5; i++) if (i % 5) ticks.push(`M${midX - 3} ${(i * DIVISION) / 5}h6`);

  const lang = settings.language;
  const fmt = (n: number, d: number) => formatNumber(n, d, lang);

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`${-PAD} ${-PAD} ${width + 2 * PAD} ${height + 2 * PAD}`} className="block h-auto w-full rounded-xl"
        role="img" aria-label={label} data-testid="screen">
        <defs>
          <radialGradient id="osc-glass" cx="50%" cy="45%" r="75%">
            <stop offset="0%" stop-color="#0d2a24" />
            <stop offset="100%" stop-color="#061412" />
          </radialGradient>
          <clipPath id="osc-clip"><rect x="0" y="0" width={width} height={height} /></clipPath>
          <filter id="osc-glow" x="-10%" y="-30%" width="120%" height="160%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect x={-PAD} y={-PAD} width={width + 2 * PAD} height={height + 2 * PAD} rx="14" fill="url(#osc-glass)" />
        <path d={lines.join("")} stroke="#b8d8cf" stroke-opacity="0.16" stroke-width="1" fill="none" />
        <path d={`M0 ${midY}H${width}M${midX} 0V${height}`} stroke="#b8d8cf" stroke-opacity="0.34" stroke-width="1" fill="none" />
        <path d={ticks.join("")} stroke="#b8d8cf" stroke-opacity="0.34" stroke-width="1" fill="none" />
        <rect x="0" y="0" width={width} height={height} fill="none" stroke="#b8d8cf" stroke-opacity="0.4" stroke-width="1.2" />
        <g clip-path="url(#osc-clip)" fill="none" stroke-linejoin="round" stroke-linecap="round">
          {traces.filter((t) => t.kind === "ghost").map((t) => (
            <path key={t.key} d={tracePath(toTrace(t.signal))} stroke="#e2e8f0" stroke-opacity="0.35" stroke-width="1.5"
              stroke-dasharray="1 5" data-testid={`trace-${t.key}`} />
          ))}
          {candidate && (
            <path d={tracePath(beamTrace)} stroke="#4ade80" stroke-width="2.6" filter="url(#osc-glow)" data-testid={`trace-${candidate.key}`} />
          )}
          {/* the reference over the candidate's trace: dashed, so a match still shows both */}
          {traces.filter((t) => t.kind === "reference").map((t) => (
            <path key={t.key} d={tracePath(toTrace(t.signal))} stroke="#a3b1c2" stroke-width="2.2" stroke-dasharray="7 5"
              data-testid={`trace-${t.key}`} />
          ))}
          {running && <path ref={trail} stroke="#dcfce7" stroke-width="3" stroke-opacity="0.85" />}
          {running && <circle ref={beam} r="4" fill="#f0fdf4" filter="url(#osc-glow)" cx="0" cy={midY} data-testid="beam" />}
        </g>
      </svg>
      {settings.showScale && (
        <div className="flex flex-wrap justify-between gap-x-4 px-1 font-mono text-xs text-slate-600" data-testid="scale">
          <span>{texts.timeBase} {fmt(settings.timePerDiv, Math.min(3, decimalsShown(settings.timePerDiv)))} ms{texts.perDiv}</span>
          <span>{texts.voltsPerDiv} {fmt(settings.voltsPerDiv, Math.min(3, decimalsShown(settings.voltsPerDiv)))} V{texts.perDiv}</span>
        </div>
      )}
    </div>
  );
};

const decimalsShown = (n: number) => (String(n).split(".")[1] ?? "").length;

/**
 * What a screen reader hears about the screen: the grid, that the reference is there (never its numbers: those the
 * candidate reads from the screen) and the candidate's own setting when the knobs show it.
 */
export const describeScreen = (settings: Settings, texts: Texts, candidate: Signal | null, showReference: boolean) => {
  const parts = [texts.grid(settings.columns, settings.rows) + (showReference ? ` ${texts.shown(texts.reference)}` : "")];
  if (candidate && settings.showValues) {
    const f = `${formatNumber(candidate.frequency, settings.frequency.decimals, settings.language)} ${texts.units[settings.frequencyUnit]}`;
    const a = `${formatNumber(candidate.amplitude, settings.amplitude.decimals, settings.language)} ${texts.units[settings.amplitudeUnit]}`;
    parts.push(texts.describe(texts.yours, f, a));
  }
  return parts.join(". ") + ".";
};

export default Screen;
