import { useRef } from "preact/hooks";
import { TILT, sunPath, wrap } from "./solar";
import type { Place, Setting } from "./setup";
import type { Day, SunPosition } from "./solar";
import { Texts } from "./texts";
import { formatNumber } from "./format";

// The 2D pictures: the Earth seen from the side (the 3D view's fallback, and the authoring mode's), the sun's path in
// the sky of the place (a horizon diagram) and the day in 24 hours. Lines differ in dash as well as colour.

const RAD = Math.PI / 180;

/**
 * The Earth seen from the side, the sunlight from the left: the axis leans towards the sun by the declination, the
 * circles of latitude are seen edge on (straight lines), the border of day and night is the vertical through the
 * middle. The place is on its circle of latitude, by its hour angle (filled on the near side, open on the far side).
 */
export const EarthDiagram = ({ declination, hourAngle, place, t, label }: {
  declination: number; hourAngle: number; place: Place | null; t: Texts; label: string;
}) => {
  const cx = 200, cy = 118, R = 84;
  const d = declination * RAD;
  // screen vectors: the axis n and e1 (on the equator, towards the sun); towards the sun is −x, up is −y
  const n = [-Math.sin(d), -Math.cos(d)], e1 = [-Math.cos(d), Math.sin(d)];
  const at = (lat: number, h: number) => {
    const p = Math.sin(lat * RAD), q = Math.cos(lat * RAD) * Math.cos(h * RAD);
    return { x: cx + R * (p * n[0] + q * e1[0]), y: cy + R * (p * n[1] + q * e1[1]), near: Math.sin(h * RAD) >= 0 };
  };
  const circle = (lat: number) => {
    const a = at(lat, 0), b = at(lat, 180);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  };
  const lines: { lat: number; dash?: string; stroke: string; width: number; key: string }[] = [
    { lat: 0, stroke: "#0f172a", width: 1.6, key: "equator" },
    { lat: TILT, dash: "6 4", stroke: "#b45309", width: 1.4, key: "tropic-n" },
    { lat: -TILT, dash: "6 4", stroke: "#b45309", width: 1.4, key: "tropic-s" },
    { lat: 90 - TILT, dash: "1.5 3", stroke: "#0369a1", width: 1.6, key: "polar-n" },
    { lat: -(90 - TILT), dash: "1.5 3", stroke: "#0369a1", width: 1.6, key: "polar-s" },
  ];
  const pole = [cx + n[0] * (R + 20), cy + n[1] * (R + 20)], south = [cx - n[0] * (R + 20), cy - n[1] * (R + 20)];
  const p = place ? at(place.lat, hourAngle) : null;
  return (
    <svg viewBox="0 0 330 236" role="img" aria-label={label} className="block w-full" data-testid="earth-diagram">
      <defs>
        <pattern id="se-dots" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="0.9" fill="#94a3b8" /></pattern>
      </defs>
      {/* the sunlight from the left */}
      {[-60, -30, 0, 30, 60].map((dy) => (
        <g key={dy}>
          <line x1={14} y1={cy + dy} x2={cx - Math.sqrt(Math.max(0, R * R - dy * dy)) - 6} y2={cy + dy} stroke="#d97706" stroke-width="1.4" />
          <path d={`M ${cx - Math.sqrt(Math.max(0, R * R - dy * dy)) - 6} ${cy + dy} l -7 -3.5 v 7 z`} fill="#d97706" />
        </g>
      ))}
      <text x={14} y={cy - 70} font-size="11" fill="#92400e" font-weight="600">{t.sunlight}</text>
      <circle cx={cx} cy={cy} r={R} fill="#dbeafe" stroke="#334155" stroke-width="1.2" />
      {/* the night half: dark and dotted */}
      <path d={`M ${cx} ${cy - R} A ${R} ${R} 0 0 1 ${cx} ${cy + R} Z`} fill="#1e293b" opacity="0.85" />
      <path d={`M ${cx} ${cy - R} A ${R} ${R} 0 0 1 ${cx} ${cy + R} Z`} fill="url(#se-dots)" />
      <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} stroke="#ea580c" stroke-width="2" data-testid="terminator" />
      <text x={cx - R + 10} y={cy + R + 16} font-size="11" fill="#334155">{t.day}</text>
      <text x={cx + R - 10} y={cy + R + 16} font-size="11" fill="#334155" text-anchor="end">{t.night}</text>
      {lines.map((l) => {
        const c = circle(l.lat);
        return <line key={l.key} {...c} stroke={l.stroke} stroke-width={l.width} stroke-dasharray={l.dash} data-testid={`line-${l.key}`} />;
      })}
      <line x1={south[0]} y1={south[1]} x2={pole[0]} y2={pole[1]} stroke="#0f172a" stroke-width="1.4" />
      <text x={pole[0]} y={pole[1] - 4} font-size="12" font-weight="700" text-anchor="middle" fill="#0f172a">N</text>
      {/* where the sun is overhead: the point nearest the sun */}
      <circle cx={cx - R} cy={cy} r={5} fill="#fde047" stroke="#a16207" stroke-width="1.2" data-testid="subsolar" />
      {p && place && (
        <g data-testid="diagram-place">
          <line {...circle(place.lat)} stroke="#be123c" stroke-width="1" opacity="0.7" />
          {p.near ? <circle cx={p.x} cy={p.y} r={5.5} fill="#be123c" stroke="#fff" stroke-width="1.5" /> : <circle cx={p.x} cy={p.y} r={5} fill="#fff" stroke="#be123c" stroke-width="2" stroke-dasharray="2 1.5" />}
          {(() => {
            // the name outside the Earth, away from the middle
            const dx = p.x - cx, dy = p.y - cy, len = Math.max(1, Math.hypot(dx, dy));
            const lx = cx + (dx / len) * (R + 10), ly = cy + (dy / len) * (R + 10);
            return <text x={lx} y={ly + 4} font-size="11" font-weight="600" text-anchor={dx >= 0 ? "start" : "end"} fill="#881337">{place.name[t.language]}</text>;
          })()}
        </g>
      )}
    </svg>
  );
};

/**
 * The sun's path in the sky of the place: the direction (azimuth) along, the height (elevation) up, the horizon at
 * 0°. The highest point of the path in the middle (south, or north when the sun passes north of the place).
 * Dragging along the path sets the time (onTime) when `onTime` is given.
 */
export const SkyDiagram = ({ day, minutes, place, declination, sun, today, t, label, timeText, onTime }: {
  day: number; minutes: number; place: Place; declination: number; sun: SunPosition; today: Day; t: Texts; label: string;
  timeText: (utcMinutes: number) => string;
  onTime?: (minutes: number, done: boolean) => void;
}) => {
  const W = 380, H = 210, left = 34, right = 16, top = 14, bottom = 34;
  const plotW = W - left - right, plotH = H - top - bottom;
  const minEl = -30, maxEl = 90;
  const centre = place.lat >= declination ? 180 : 0;
  const x = (az: number) => left + (wrap(az - centre + 180, 360) / 360) * plotW;
  const y = (el: number) => top + ((maxEl - Math.max(minEl, el)) / (maxEl - minEl)) * plotH;
  const path = sunPath(day, place.lat, place.lon, 5);
  // the path in pieces: above and below the horizon, broken where the direction jumps round
  const pieces: { up: boolean; points: [number, number][] }[] = [];
  let prev: [number, number] | null = null;
  for (const s of path) {
    const pt: [number, number] = [x(s.azimuth), y(s.elevation)];
    const up = s.elevation >= 0;
    const last = pieces[pieces.length - 1];
    if (!last || last.up !== up || (prev && Math.abs(pt[0] - prev[0]) > plotW / 2)) {
      const piece = { up, points: prev && Math.abs(pt[0] - prev[0]) <= plotW / 2 ? [prev, pt] : [pt] };
      pieces.push(piece as { up: boolean; points: [number, number][] });
    } else last.points.push(pt);
    prev = pt;
  }
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const timeAt = (e: PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W, py = ((e.clientY - r.top) / r.height) * H;
    let best = path[0], bestD = Infinity;
    for (const s of path) {
      const d = Math.hypot(x(s.azimuth) - px, y(s.elevation) - py);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best.minutes % 1440;
  };
  const noonPos = path.reduce((a, b) => (b.elevation > a.elevation ? b : a));
  const n = (v: number) => `${formatNumber(v, 1, t.language)}°`;
  const sunX = x(sun.azimuth), sunY = y(sun.elevation);
  const ticks = [0, 45, 90, 135, 180, 225, 270, 315, 360].map((az) => az - 180 + centre);
  return (
    <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block w-full touch-none select-none" data-testid="sky"
      onPointerDown={onTime ? (e) => { dragging.current = true; (e.currentTarget as Element).setPointerCapture?.(e.pointerId); onTime(timeAt(e as unknown as PointerEvent), false); } : undefined}
      onPointerMove={onTime ? (e) => dragging.current && onTime(timeAt(e as unknown as PointerEvent), false) : undefined}
      onPointerUp={onTime ? (e) => { if (!dragging.current) return; dragging.current = false; onTime(timeAt(e as unknown as PointerEvent), true); } : undefined}
      style={{ cursor: onTime ? "pointer" : "default" }}>
      <defs>
        <pattern id="se-ground" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="7" height="7" fill="#e7e5e4" /><line x1="0" y1="0" x2="0" y2="7" stroke="#a8a29e" stroke-width="1.2" />
        </pattern>
      </defs>
      <rect x={left} y={top} width={plotW} height={y(0) - top} fill="#e0f2fe" />
      <rect x={left} y={y(0)} width={plotW} height={top + plotH - y(0)} fill="url(#se-ground)" />
      {[30, 60, 90].map((el) => (
        <g key={el}>
          <line x1={left} x2={left + plotW} y1={y(el)} y2={y(el)} stroke="#94a3b8" stroke-width="0.6" stroke-dasharray="2 3" />
          <text x={left - 4} y={y(el) + 3.5} font-size="10" text-anchor="end" fill="#475569">{el}°</text>
        </g>
      ))}
      <line x1={left} x2={left + plotW} y1={y(0)} y2={y(0)} stroke="#44403c" stroke-width="1.6" />
      <text x={left - 4} y={y(0) + 3.5} font-size="10" text-anchor="end" fill="#475569">0°</text>
      {ticks.map((az, i) => (
        <g key={i}>
          <line x1={left + (i / 8) * plotW} x2={left + (i / 8) * plotW} y1={y(0)} y2={y(0) + 4} stroke="#44403c" />
          <text x={left + (i / 8) * plotW} y={top + plotH + 14} font-size="10.5" font-weight={i % 2 ? 400 : 700} text-anchor="middle" fill="#334155">
            {t.directions[Math.round(wrap(az, 360) / 45) % 8]}
          </text>
        </g>
      ))}
      {pieces.map((p, i) => (
        <polyline key={i} points={p.points.map((q) => q.join(",")).join(" ")} fill="none"
          stroke={p.up ? "#d97706" : "#64748b"} stroke-width={p.up ? 2.6 : 1.4} stroke-dasharray={p.up ? undefined : "3 3"} data-testid={p.up ? "path-day" : "path-night"} />
      ))}
      {today.polar !== "night" && (
        <g data-testid="noon-mark">
          <circle cx={x(noonPos.azimuth)} cy={y(noonPos.elevation)} r={3} fill="#92400e" />
          <text x={x(noonPos.azimuth)} y={Math.max(top + 10, y(noonPos.elevation) - 8)} font-size="10.5" text-anchor="middle" fill="#78350f" font-weight="600">
            {n(today.noonElevation)}
          </text>
        </g>
      )}
      {today.sunrise !== null && today.sunset !== null && [["rise", today.sunrise], ["set", today.sunset]].map(([k, m]) => {
        const pos = path.reduce((a, b) => (Math.abs(b.minutes - (m as number)) < Math.abs(a.minutes - (m as number)) ? b : a));
        return (
          <g key={k as string}>
            <path d={`M ${x(pos.azimuth)} ${y(0) - 2} l -4 6 h 8 z`} fill="#44403c" transform={k === "set" ? `rotate(180 ${x(pos.azimuth)} ${y(0) + 2})` : undefined} />
            <text x={x(pos.azimuth)} y={y(0) + 18} font-size="10" text-anchor="middle" fill="#1c1917">{timeText(m as number)}</text>
          </g>
        );
      })}
      {/* the sun now: filled above the horizon, open and dashed below it */}
      <g data-testid="sky-sun" data-above={sun.elevation >= 0 ? "true" : "false"}>
        {sun.elevation >= 0 ? (
          <>
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
              <line key={a} x1={sunX + 9 * Math.cos(a * RAD)} y1={sunY + 9 * Math.sin(a * RAD)} x2={sunX + 13 * Math.cos(a * RAD)} y2={sunY + 13 * Math.sin(a * RAD)} stroke="#b45309" stroke-width="1.5" />
            ))}
            <circle cx={sunX} cy={sunY} r={6.5} fill="#fbbf24" stroke="#b45309" stroke-width="1.5" />
          </>
        ) : (
          <circle cx={sunX} cy={sunY} r={6} fill="#fff" stroke="#475569" stroke-width="1.5" stroke-dasharray="2 2" />
        )}
      </g>
      <text x={left + plotW - 4} y={top + 12} font-size="10.5" font-weight="600" text-anchor="end" fill="#0c4a6e" data-testid="sky-time">{timeText(minutes)}</text>
    </svg>
  );
};

/** The day in 24 hours (in the time shown to the candidate): night dotted, day light, a mark at the time now. */
export const DayLine = ({ today, minutes, toShown }: { today: Day; minutes: number; toShown: (utc: number) => number }) => {
  const W = 380, left = 34, right = 16, w = W - left - right;
  const x = (m: number) => left + (wrap(m, 1440) / 1440) * w;
  const segments: [number, number][] = [];
  if (today.polar === "day") segments.push([0, 1440]);
  else if (today.sunrise !== null && today.sunset !== null) {
    const a = wrap(toShown(today.sunrise), 1440), b = wrap(toShown(today.sunset), 1440);
    if (a < b) segments.push([a, b]);
    else segments.push([0, b], [a, 1440]);
  }
  return (
    <svg viewBox={`0 0 ${W} 30`} className="block w-full" aria-hidden="true" data-testid="day-line">
      <defs>
        <pattern id="se-night-dots" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#334155" /><circle cx="2.5" cy="2.5" r="0.8" fill="#94a3b8" /></pattern>
      </defs>
      <rect x={left} y={4} width={w} height={12} rx={3} fill="url(#se-night-dots)" />
      {segments.map(([a, b], i) => <rect key={i} x={left + (a / 1440) * w} y={4} width={((b - a) / 1440) * w} height={12} fill="#fde68a" />)}
      {[0, 6, 12, 18, 24].map((h) => (
        <text key={h} x={left + (h / 24) * w} y={28} font-size="9.5" text-anchor="middle" fill="#475569">{`${String(h).padStart(2, "0")}:00`}</text>
      ))}
      <line x1={x(toShown(minutes))} x2={x(toShown(minutes))} y1={1} y2={19} stroke="#be123c" stroke-width="2.2" />
    </svg>
  );
};
