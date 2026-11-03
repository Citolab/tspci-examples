// Names and values as the candidate reads them: "midpoint of AB", "∠ABC = 14°", "between 3.40 and 3.50 m".
import { Built, Face, Measurement, Point, PointRef, Target, Tool, faceById, measure, pointById, scaled } from "./geometry";
import { decimalsOf, formatNumber, roundTo, rulerReading } from "./format";
import { Settings, toolFactor } from "./settings";
import { Texts } from "./texts";

export const COLOURS: Record<Tool | "solution" | "pending", string> = {
  // Okabe-Ito: safe for colour blindness; every measurement also has a number and a text
  tape: "#d55e00",
  protractor: "#0072b2",
  area: "#009e73",
  solution: "#cc79a7",
  pending: "#e69f00",
};

const objectName = (t: Texts, built: Built, id: string) => {
  const o = built.objects.find((x) => x.id === id);
  return o ? o.name || t.types[o.type] : id;
};

export const faceName = (t: Texts, built: Built, face: Face): string =>
  face.label || t.partOf(t.part[face.part], objectName(t, built, face.object));

export const pointName = (t: Texts, built: Built, p: Point): string => {
  if (p.kind === "vertex" || p.named) return p.label;
  if (p.kind === "mid") return t.midpoint(p.label);
  if (p.label) return t.centre(p.label);
  // the centre of a tank's top or bottom
  const part = p.id.endsWith(".top") ? "top" : "bottom";
  return t.centre(t.partOf(t.part[part], objectName(t, built, p.object)));
};

export const refName = (t: Texts, built: Built, ref: PointRef): string => {
  if ("id" in ref) {
    const p = pointById(built, ref.id);
    return p ? pointName(t, built, p) : "?";
  }
  const f = faceById(built, ref.face);
  return t.onFace(f ? faceName(t, built, f) : "?");
};

/** The unit the tools read: the item's unit, or "units" when the candidate converts with the scale. */
export const toolUnit = (s: Settings, t: Texts) => (s.toolScale ? s.unit : t.units);
const powerOf = (unit: string, tool: Tool | "volume") => (tool === "tape" ? unit : tool === "area" ? `${unit}²` : tool === "volume" ? `${unit}³` : "°");

/** The unit of the answer to the task. */
export const answerUnit = (s: Settings, target: Target | null) =>
  !target ? s.unit : powerOf(s.unit, target.kind === "length" ? "tape" : target.kind === "angle" ? "protractor" : target.kind === "area" ? "area" : "volume");

/** "3.42 m", but "14°". */
export const withUnit = (value: string, unit: string) => (unit === "°" ? `${value}°` : `${value} ${unit}`);

/** A value with its unit; in ruler mode lengths and angles as between two tick marks. */
export const valueText = (s: Settings, t: Texts, tool: Tool, value: number): string => {
  const unit = powerOf(toolUnit(s, t), tool);
  const n = (v: number, d: number) => formatNumber(v, d, s.language);
  const step = tool === "tape" ? s.tickStep : tool === "protractor" ? s.angleStep : 0;
  if (s.reading === "ruler" && step > 0) {
    const d = decimalsOf(step);
    const { low, high } = rulerReading(value, step);
    const join = tool === "protractor" ? "" : " ";
    if (low === high) return `${n(low, d)}${join}${unit}`;
    return t.between(n(low, d), n(high, d), unit).replace(` ${unit}`, `${join}${unit}`);
  }
  const decimals = tool === "protractor" ? Math.max(0, s.decimals - 1) : s.decimals;
  return tool === "protractor" ? `${n(value, decimals)}°` : `${n(value, decimals)} ${unit}`;
};

/** The value of a measurement in the tools' unit (scale applied when the tools apply it), or null. */
export const measuredValue = (s: Settings, m: Measurement): number | null => {
  const v = measure(s.built, m);
  return v === null ? null : scaled(v, m.tool, toolFactor(s));
};

const compact = (names: string[]) => names.every((n) => /^[A-Za-z]\w{0,2}$/.test(n));

/** "AD", "∠ABC", "area of EFGH": what was measured. */
export const measurementName = (s: Settings, t: Texts, m: Measurement): string => {
  if (m.tool === "area") {
    const f = faceById(s.built, m.face);
    return t.areaOf(f ? faceName(t, s.built, f) : "?");
  }
  const names = m.points.map((r) => refName(t, s.built, r));
  if (m.tool === "tape") return compact(names) ? names.join("") : `${names[0]} – ${names[1]}`;
  return compact(names) ? `∠${names.join("")}` : `${t.angle} ${names.join(" – ")}`;
};

/** "AD = 3.42 m" */
export const describe = (s: Settings, t: Texts, m: Measurement): string => {
  const v = measuredValue(s, m);
  const value = v === null ? "–" : valueText(s, t, m.tool, v);
  const step = m.tool === "tape" ? s.tickStep : m.tool === "protractor" ? s.angleStep : 0;
  const between = v !== null && s.reading === "ruler" && step > 0 && rulerReading(v, step).low !== rulerReading(v, step).high;
  return `${measurementName(s, t, m)}${between ? ": " : " = "}${value}`;
};

/** The measurements as the tool mode reports them, language independent: what, the ids, the names and the value. */
export const reportOf = (s: Settings, t: Texts, measurements: Measurement[]) => ({
  unit: s.toolScale ? s.unit : "units",
  scale: s.scale,
  measurements: measurements.map((m) => {
    const v = measuredValue(s, m);
    const value = v === null ? null : roundTo(v, 4);
    const base = m.tool === "area"
      ? { tool: m.tool, face: m.face, names: [faceName(t, s.built, faceById(s.built, m.face))] }
      : { tool: m.tool, points: m.points, names: m.points.map((r) => ("id" in r ? pointById(s.built, r.id)?.label ?? r.id : `@${r.face}`)) };
    const step = m.tool === "tape" ? s.tickStep : m.tool === "protractor" ? s.angleStep : 0;
    const reading = s.reading === "ruler" && step > 0 && v !== null ? rulerReading(v, step) : null;
    return { ...base, value, ...(reading ? { reading: [roundTo(reading.low, 6), roundTo(reading.high, 6)] } : {}) };
  }),
});
