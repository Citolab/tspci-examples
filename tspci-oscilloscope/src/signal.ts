// The traces on the screen: a waveform as an SVG path, in screen pixels. No imports: `npm test` runs it in node.

export type Waveform = "sine" | "square" | "triangle";
export const WAVEFORMS: Waveform[] = ["sine", "square", "triangle"];

/** A trace on a screen of `columns` × `rows` divisions of `division` px; the time axis runs from the left edge. */
export type Trace = {
  waveform: Waveform;
  /** Vibrations (periods) on the whole screen. */
  cycles: number;
  /** Amplitude in divisions (centre line to top). */
  amplitude: number;
  columns: number;
  rows: number;
  /** Size of a division in px. */
  division: number;
};

/** The waveform at `phase` (in periods), from -1 to 1; every waveform starts on the centre line, going up. */
export const waveAt = (waveform: Waveform, phase: number): number => {
  const f = phase - Math.floor(phase);
  if (waveform === "square") return f < 0.5 ? 1 : -1;
  if (waveform === "triangle") return f < 0.25 ? 4 * f : f < 0.75 ? 2 - 4 * f : 4 * f - 4;
  return Math.sin(2 * Math.PI * phase);
};

/** The point of a trace at horizontal position x (px). */
export const pointAt = (trace: Trace, x: number): [number, number] => {
  const width = trace.columns * trace.division;
  const mid = (trace.rows * trace.division) / 2;
  const phase = (x / width) * trace.cycles;
  return [x, mid - trace.amplitude * trace.division * waveAt(trace.waveform, phase)];
};

const MAX_POINTS = 6000;

/** The points of a trace: samples for a sine, the corners for a triangle, the edges for a square wave. */
export const tracePoints = (trace: Trace): [number, number][] => {
  const width = trace.columns * trace.division;
  const mid = (trace.rows * trace.division) / 2;
  const cycles = Math.max(0, trace.cycles);
  const a = trace.amplitude * trace.division;
  if (!(width > 0)) return [];
  if (cycles === 0 || a === 0) return [[0, mid], [width, mid]];
  const xOf = (phase: number) => (phase / cycles) * width;
  if (trace.waveform === "sine") {
    const n = Math.min(MAX_POINTS, Math.max(96, Math.ceil(cycles * 72)));
    return Array.from({ length: n + 1 }, (_, i) => pointAt(trace, (i / n) * width));
  }
  const points: [number, number][] = [];
  if (trace.waveform === "triangle") {
    // the corners lie at every quarter period
    for (let k = 0; k / 4 < cycles && points.length < MAX_POINTS; k++) points.push(pointAt(trace, xOf(k / 4)));
    points.push(pointAt(trace, width));
    return points;
  }
  // square: up from the centre line at the start, then an edge every half period
  points.push([0, mid], [0, mid - a]);
  for (let k = 1; k / 2 < cycles && points.length < MAX_POINTS; k++) {
    const x = xOf(k / 2);
    const from = k % 2 === 1 ? mid - a : mid + a;
    points.push([x, from], [x, 2 * mid - from]);
  }
  points.push([width, mid - a * waveAt("square", cycles - 1e-9)]);
  return points;
};

const r = (n: number) => String(Math.round(n * 100) / 100);
/** The trace as the d of an SVG path. */
export const tracePath = (trace: Trace): string =>
  tracePoints(trace).map(([x, y], i) => `${i ? "L" : "M"}${r(x)} ${r(y)}`).join("");
