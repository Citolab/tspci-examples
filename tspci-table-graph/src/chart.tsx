import { clean } from "./expression";

// The graph, in plain SVG: axes with round ticks, a light grid, a marker per value and formula. The selected value
// gets a guide line and its results as labels.

/** Colour-blind safe (IBM palette), and the shapes differ as well. */
export const SERIES = [
  { color: "#3d6fe8", shape: "circle" },
  { color: "#dc267f", shape: "diamond" },
] as const;

export type Series = { label: string; points: { x: number; y: number | null }[] };

const W = 520;
const H = 380;
const M = { left: 60, right: 20, top: 24, bottom: 58 };

/** About `target` ticks at round steps (1, 2, 2.5 or 5 times a power of ten) from min to max. */
export function niceTicks(min: number, max: number, target = 5): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / target;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw * 0.999);
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) ticks.push(clean(v));
  return ticks;
}

export const Marker = ({ series, x = 0, y = 0, size = 6, selected = false }: { series: number; x?: number; y?: number; size?: number; selected?: boolean }) => {
  const { color, shape } = SERIES[series];
  const s = selected ? size * 1.45 : size;
  const common = { fill: color, stroke: "#fff", "stroke-width": selected ? 2.5 : 1.5 };
  // the circle fits inside the diamond: where the formulas meet, a circle in a diamond
  return shape === "circle"
    ? <circle cx={x} cy={y} r={s * 0.8} {...common} />
    : <rect x={x - s} y={y - s} width={s * 2} height={s * 2} transform={`rotate(45 ${x} ${y})`} {...common} />;
};

export const Chart = ({ series, selected, onSelect, xMin, xMax, yMin, yMax, xLabel, yLabel, connect, axisFormat, valueFormat, title }: {
  series: Series[];
  selected: number | null;
  onSelect: (x: number) => void;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xLabel: string;
  yLabel: string;
  connect: boolean;
  axisFormat: Intl.NumberFormat;
  valueFormat: Intl.NumberFormat;
  title: string;
}) => {
  const width = W - M.left - M.right;
  const height = H - M.top - M.bottom;
  const sx = (x: number) => M.left + ((x - xMin) / (xMax - xMin || 1)) * width;
  const sy = (y: number) => M.top + height - ((y - yMin) / (yMax - yMin || 1)) * height;
  const xTicks = niceTicks(xMin, xMax, 6);
  const yTicks = niceTicks(yMin, yMax, 6);
  const minor = (ticks: number[]) => ticks.slice(1).map((t, i) => (t + ticks[i]) / 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full font-sans" role="img" aria-label={title}>
      <defs>
        <clipPath id="plot"><rect x={M.left - 8} y={M.top - 8} width={width + 16} height={height + 16} /></clipPath>
      </defs>
      <rect x={M.left} y={M.top} width={width} height={height} fill="#fff" />
      <g stroke="#e2e8f0" stroke-width="1">
        {minor(xTicks).map((t) => <line key={`mx${t}`} x1={sx(t)} x2={sx(t)} y1={M.top} y2={M.top + height} stroke="#f1f5f9" />)}
        {minor(yTicks).map((t) => <line key={`my${t}`} y1={sy(t)} y2={sy(t)} x1={M.left} x2={M.left + width} stroke="#f1f5f9" />)}
        {xTicks.map((t) => <line key={`x${t}`} x1={sx(t)} x2={sx(t)} y1={M.top} y2={M.top + height} />)}
        {yTicks.map((t) => <line key={`y${t}`} y1={sy(t)} y2={sy(t)} x1={M.left} x2={M.left + width} />)}
      </g>
      <g stroke="#64748b" stroke-width="1.5">
        <line x1={M.left} x2={M.left + width} y1={M.top + height} y2={M.top + height} />
        <line x1={M.left} x2={M.left} y1={M.top} y2={M.top + height} />
      </g>
      <g fill="#475569" font-size="13" className="tabular-nums">
        {xTicks.map((t) => <text key={t} x={sx(t)} y={M.top + height + 20} text-anchor="middle">{axisFormat.format(t)}</text>)}
        {yTicks.map((t) => <text key={t} x={M.left - 10} y={sy(t) + 4.5} text-anchor="end">{axisFormat.format(t)}</text>)}
      </g>
      <text x={M.left + width / 2} y={H - 10} text-anchor="middle" font-size="14" fill="#334155">{xLabel}</text>
      <text transform={`translate(16 ${M.top + height / 2}) rotate(-90)`} text-anchor="middle" font-size="14" fill="#334155">{yLabel}</text>

      {selected !== null && selected >= xMin && selected <= xMax && (
        <g className="pointer-events-none">
          <line x1={sx(selected)} x2={sx(selected)} y1={M.top} y2={M.top + height} stroke="#0f172a" stroke-opacity=".45" stroke-width="1.5" stroke-dasharray="5 4" />
        </g>
      )}

      <g clip-path="url(#plot)">
        {connect && series.map((s, i) => {
          const points = s.points.filter((p) => p.y !== null).sort((a, b) => a.x - b.x);
          return points.length > 1 && (
            <polyline key={`line${i}`} points={points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")} fill="none"
              stroke={SERIES[i].color} stroke-opacity=".55" stroke-width="2" stroke-linejoin="round" />
          );
        })}
        {/* the circles last: where the formulas meet, a circle shows inside the diamond */}
        {series.map((s, i) => ({ s, i })).reverse().map(({ s, i }) =>
          s.points.map((p) => p.y !== null && (
            <g key={`${i}-${p.x}`} className="cursor-pointer" onClick={() => onSelect(p.x)}>
              <title>{`${s.label}: ${valueFormat.format(p.y)} (x = ${axisFormat.format(p.x)})`}</title>
              <Marker series={i} x={sx(p.x)} y={sy(p.y)} selected={p.x === selected} />
            </g>
          ))
        )}
      </g>

      {/* the results of the selected value: the first formula left of the guide line, the second right of it */}
      {selected !== null && series.map((s, i) => {
        const point = s.points.find((p) => p.x === selected);
        if (!point || point.y === null || point.y < yMin || point.y > yMax) return null;
        return (
          <text key={`label${i}`} x={sx(selected) + (i === 0 ? -12 : 12)} y={sy(point.y) - 10} text-anchor={i === 0 ? "end" : "start"}
            font-size="13" font-weight="600" fill={SERIES[i].color} stroke="#fff" stroke-width="4" paint-order="stroke"
            className="pointer-events-none tabular-nums">
            {valueFormat.format(point.y)}
          </text>
        );
      })}
    </svg>
  );
};
