// The arithmetic of the chart: nice ticks for the value axis, stacking, numbers in English and Dutch, pie slices.
// No imports: `npm test` runs it in node.

/** A step of 1, 2, 2.5 or 5 × a power of ten, about (max - min) / count. */
export const niceStep = (span: number, count = 5) => {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const raw = span / Math.max(1, count);
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw * 0.999) ?? 10 * power;
  return round(step);
};

/** Rounds away the floating point dust: 0.1 + 0.2 → 0.3. */
export const round = (n: number) => Number(n.toPrecision(12));

export type Axis = { min: number; max: number; step: number; ticks: number[] };

/**
 * The value axis for data from `low` to `high`: rounded outwards to nice ticks. `min` and `max` the author set
 * (null: automatic) are kept as they are; ticks then start at the first multiple of the step.
 */
export const niceAxis = (low: number, high: number, min: number | null = null, max: number | null = null, count = 5): Axis => {
  let lo = min ?? low;
  let hi = max ?? high;
  if (!Number.isFinite(lo)) lo = 0;
  if (!Number.isFinite(hi)) hi = lo + 1;
  if (hi < lo) [lo, hi] = [hi, lo];
  if (hi === lo) {
    if (min === null && hi > 0) lo = 0;
    else if (max === null) hi = lo + (lo === 0 ? 1 : Math.abs(lo));
    else lo = hi - (hi === 0 ? 1 : Math.abs(hi));
  }
  let step = niceStep(hi - lo, count);
  if (min !== null && max !== null) {
    // the author's ends: a smaller nice step that fits between them exactly, so both ends get a tick
    const fits = (st: number) => Math.abs(round((hi - lo) / st) - Math.round((hi - lo) / st)) < 1e-9 && (hi - lo) / st <= count * 2;
    for (let c = count; c <= count * 2; c++) {
      if (fits(niceStep(hi - lo, c))) {
        step = niceStep(hi - lo, c);
        break;
      }
    }
  }
  if (min === null) lo = round(Math.floor(round(lo / step)) * step);
  if (max === null) hi = round(Math.ceil(round(hi / step)) * step);
  const ticks: number[] = [];
  for (let t = Math.ceil(round(lo / step)) * step; t <= hi + step * 1e-9; t += step) ticks.push(round(t));
  return { min: lo, max: hi, step, ticks };
};

/** A linear scale: a value in [d0, d1] → a position in [r0, r1]. */
export const linear = (d0: number, d1: number, r0: number, r1: number) => (v: number) =>
  d1 === d0 ? r0 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

export type Stacked = { start: number; end: number; value: number | null };

/**
 * One category's values stacked: positives up from 0, negatives down from 0, a missing value takes no room.
 * `percent`: as shares of the category's total (of the absolute values), 0–100.
 */
export const stack = (values: (number | null)[], percent = false): Stacked[] => {
  const total = values.reduce((sum, v) => sum + Math.abs(v ?? 0), 0);
  let up = 0;
  let down = 0;
  return values.map((v) => {
    if (v === null || v === undefined || !Number.isFinite(v)) return { start: up, end: up, value: null };
    const size = percent ? (total ? (v / total) * 100 : 0) : v;
    if (size >= 0) {
      const s = { start: round(up), end: round(up + size), value: v };
      up += size;
      return s;
    }
    const s = { start: round(down), end: round(down + size), value: v };
    down += size;
    return s;
  });
};

/** The lowest and highest a chart reaches: of every value, or of every stack. Bars always include 0. */
export const extent = (rows: (number | null)[][], stacked: boolean, includeZero: boolean) => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const values of rows) {
    if (stacked) {
      for (const s of stack(values)) {
        if (s.value === null) continue;
        lo = Math.min(lo, s.start, s.end);
        hi = Math.max(hi, s.start, s.end);
      }
    } else {
      for (const v of values) {
        if (v === null || v === undefined || !Number.isFinite(v)) continue;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
  }
  if (lo === Infinity) return { lo: 0, hi: 1 };
  if (includeZero) {
    lo = Math.min(0, lo);
    hi = Math.max(0, hi);
  }
  return { lo, hi };
};

/** The decimals a tick step needs: 0.25 → 2, 5 → 0. */
export const stepDecimals = (step: number) => {
  const m = String(round(step)).match(/\.(\d+)$/);
  return m ? Math.min(6, m[1].length) : 0;
};

export type NumberFormat = { language: string; decimals: number };

/**
 * A number as the language writes it: 1,234.5 in English, 1.234,5 in Dutch (no grouping below 10,000 in Dutch, as
 * the Taalunie advises for four digits). A minus is a real minus sign.
 */
export const formatNumber = (value: number, language: string, decimals: number) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const nl = String(language ?? "").slice(0, 2).toLowerCase() === "nl";
  const fixed = Math.abs(value).toFixed(Math.max(0, Math.min(6, decimals)));
  const [whole, fraction] = fixed.split(".");
  const group = nl ? "." : ",";
  const grouped = whole.length > (nl ? 4 : 3) ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, group) : whole;
  const negative = value < 0 && Number(fixed) !== 0;
  return `${negative ? "−" : ""}${grouped}${fraction ? (nl ? "," : ".") + fraction : ""}`;
};

const CURRENCY = ["€", "$", "£", "¥"];
/** A number with its unit: 45%, 12.5 kWh, € 12.50 (a currency comes first). Without a unit, the number. */
export const withUnit = (text: string, unit: string) => {
  const u = String(unit ?? "").trim();
  if (!u || !text) return text;
  if (CURRENCY.includes(u)) return text.startsWith("−") ? `−${u} ${text.slice(1)}` : `${u} ${text}`;
  if (u === "%" || u === "‰" || u === "°") return `${text}${u}`;
  return `${text} ${u}`;
};

/** The point at `angle` (radians, 0 at the top, clockwise) on a circle. */
export const polar = (cx: number, cy: number, r: number, angle: number) => ({
  x: Math.round((cx + r * Math.sin(angle)) * 100) / 100 + 0, // + 0: no -0
  y: Math.round((cy - r * Math.cos(angle)) * 100) / 100 + 0,
});

export type Slice = { start: number; end: number; share: number; value: number | null };

/** Pie slices from the top, clockwise, for the positive values; a missing, zero or negative value has none. */
export const slices = (values: (number | null)[]): Slice[] => {
  const total = values.reduce((sum, v) => sum + (v && v > 0 ? v : 0), 0);
  let at = 0;
  return values.map((v) => {
    const share = total && v && v > 0 ? v / total : 0;
    const s = { start: at, end: at + share * 2 * Math.PI, share, value: v ?? null };
    at = s.end;
    return s;
  });
};

/** The SVG path of a ring segment (a donut slice) between two angles; a whole ring when it goes all the way round. */
export const arcPath = (cx: number, cy: number, outer: number, inner: number, start: number, end: number) => {
  const full = end - start >= 2 * Math.PI - 1e-6;
  if (full) {
    // two halves: an arc cannot start and end in the same point
    const half = start + Math.PI;
    return `${arcPath(cx, cy, outer, inner, start, half)} ${arcPath(cx, cy, outer, inner, half, start + 2 * Math.PI)}`;
  }
  const large = end - start > Math.PI ? 1 : 0;
  const a = polar(cx, cy, outer, start);
  const b = polar(cx, cy, outer, end);
  if (inner <= 0) return `M${cx} ${cy}L${a.x} ${a.y}A${outer} ${outer} 0 ${large} 1 ${b.x} ${b.y}Z`;
  const c = polar(cx, cy, inner, end);
  const d = polar(cx, cy, inner, start);
  return `M${a.x} ${a.y}A${outer} ${outer} 0 ${large} 1 ${b.x} ${b.y}L${c.x} ${c.y}A${inner} ${inner} 0 ${large} 0 ${d.x} ${d.y}Z`;
};

/** About how wide text is at a font size, in px, without measuring it (labels are laid out before they are drawn). */
export const textWidth = (text: string, size = 13) =>
  Array.from(String(text ?? "")).reduce((w, ch) => w + (/[mwMW@]/.test(ch) ? 0.85 : /[A-Z0-9€%]/.test(ch) ? 0.64 : /[iljtf.,:;'| ()]/.test(ch) ? 0.3 : 0.53), 0) * size;

/** Black or white text on a background colour, whichever contrasts more (WCAG relative luminance). */
export const textOn = (hex: string) => {
  const m = String(hex ?? "").match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return "#0f172a";
  const lum = m.slice(1).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const l = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
  // contrast with near-black #0f172a (luminance ≈ 0.0089) against white
  return (l + 0.05) / (0.0089 + 0.05) >= 1.05 / (l + 0.05) ? "#0f172a" : "#ffffff";
};
