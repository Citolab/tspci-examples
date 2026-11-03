import { useRef, useState } from "preact/hooks";
import { formatNumber } from "./terrain";
import { Texts } from "./texts";

// The graph for a cross-section: distance from A along the bottom, height up the side, and a point the candidate
// drags at every fixed distance. Each point is a slider for the keyboard and a screen reader; dragging across the
// graph sketches the whole line at once.

export type ProfileProps = {
  /** the heights the candidate gave (null: not set) */
  heights: (number | null)[];
  /** the length of the line A–B in metres */
  length: number;
  min: number;
  max: number;
  interval: number;
  language: string;
  texts: Texts;
  /** the true profile (review), as a dashed line */
  truth?: number[] | null;
  readOnly?: boolean;
  /** the heights after a drag or a key; `index` the point that changed (undefined: several) */
  onChange: (heights: (number | null)[], index?: number) => void;
  labelA?: string;
  labelB?: string;
};

const W = 600, H = 250;
const M = { left: 52, right: 30, top: 14, bottom: 38 };

export const ProfileGraph = (p: ProfileProps) => {
  const { heights, length, min, max, interval, language, texts } = p;
  const [live, setLive] = useState<(number | null)[] | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  // the heights while dragging, also between two paints (events can come faster than renders)
  const liveRef = useRef<(number | null)[] | null>(null);
  const setLiveBoth = (v: (number | null)[] | null) => {
    liveRef.current = v;
    setLive(v);
  };
  const shown = live ?? heights;
  const n = heights.length;
  const x = (i: number) => M.left + (n > 1 ? (i / (n - 1)) * (W - M.left - M.right) : 0);
  const y = (h: number) => M.top + (1 - (h - min) / (max - min)) * (H - M.top - M.bottom);
  const heightAt = (py: number) => Math.round(Math.max(min, Math.min(max, min + (1 - (py - M.top) / (H - M.top - M.bottom)) * (max - min))));
  const step = Math.max(1, Math.round(interval / 2));
  const fmt = (v: number) => formatNumber(v, 0, language);
  const distanceOf = (i: number) => (n > 1 ? (i / (n - 1)) * length : 0);
  // a line on the graph every interval, labelled every second one when they are close together
  const levels: number[] = [];
  for (let l = Math.ceil(min / interval) * interval; l <= max + 1e-9; l += interval) levels.push(l);
  const every = levels.length > 12 ? Math.ceil(levels.length / 8) : 1;
  const distanceTicks = n > 1 ? Array.from({ length: n }, (_, i) => i) : [0];

  const local = (e: PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return { px: ((e.clientX - r.left) / r.width) * W, py: ((e.clientY - r.top) / r.height) * H };
  };
  const columnAt = (px: number) => Math.max(0, Math.min(n - 1, Math.round(((px - M.left) / (W - M.left - M.right)) * (n - 1))));
  const setAt = (e: PointerEvent, from: (number | null)[]) => {
    const { px, py } = local(e);
    const next = from.slice();
    next[columnAt(px)] = heightAt(py);
    return next;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (p.readOnly || e.button !== 0) return;
    dragging.current = true;
    try {
      svg.current?.setPointerCapture?.(e.pointerId);
    } catch {
      // a synthetic event in a test
    }
    setLiveBoth(setAt(e, heights));
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging.current) return;
    setLiveBoth(setAt(e, liveRef.current ?? heights));
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const live = liveRef.current;
    if (live) {
      const changed = live.map((v, i) => v !== heights[i]);
      const index = changed.filter(Boolean).length === 1 ? changed.indexOf(true) : undefined;
      p.onChange(live, index);
    }
    setLiveBoth(null);
  };

  const onKey = (i: number) => (e: KeyboardEvent) => {
    if (p.readOnly) return;
    const current = heights[i];
    const start = current ?? heights.slice(0, i).reverse().find((v) => v !== null) ?? Math.round((min + max) / 2 / step) * step;
    const set = (v: number | null) => {
      const next = heights.slice();
      next[i] = v === null ? null : Math.max(min, Math.min(max, v));
      p.onChange(next, i);
      e.preventDefault();
    };
    switch (e.key) {
      case "ArrowUp": case "ArrowRight": return set(current === null ? start : current + step);
      case "ArrowDown": case "ArrowLeft": return set(current === null ? start : current - step);
      case "PageUp": return set((current ?? start) + interval * 2);
      case "PageDown": return set((current ?? start) - interval * 2);
      case "Home": return set(min);
      case "End": return set(max);
      case "Delete": case "Backspace": return set(null);
    }
  };

  const set = shown.map((h, i) => (h === null ? null : { x: x(i), y: y(h) }));
  const line = set.reduce((d, q, i) => (q ? `${d}${d && set[i - 1] ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}` : d), "");
  const truthLine = p.truth?.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(h).toFixed(1)}`).join("");

  return (
    <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full max-w-[680px] touch-none select-none" data-testid="profile"
      role="group" aria-label={texts.profile(p.labelA ?? texts.pointA, p.labelB ?? texts.pointB)}
      onPointerDown={onPointerDown as any} onPointerMove={onPointerMove as any} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <rect x={M.left} y={M.top} width={W - M.left - M.right} height={H - M.top - M.bottom} fill="#ffffff" stroke="#cbd5e1" />
      <g aria-hidden="true" font-size="11" fill="#475569">
        {levels.map((l, i) => (
          <g key={l}>
            <line x1={M.left} x2={W - M.right} y1={y(l)} y2={y(l)} stroke="#e2e8f0" stroke-width={i % every === 0 ? 1 : 0.5} />
            {i % every === 0 && <text x={M.left - 6} y={y(l)} text-anchor="end" dominant-baseline="central">{fmt(l)}</text>}
          </g>
        ))}
        {distanceTicks.map((i) => (
          <g key={i}>
            <line x1={x(i)} x2={x(i)} y1={M.top} y2={H - M.bottom} stroke="#eef2f6" />
            {(n <= 11 || i % 2 === 0 || i === n - 1) && <text x={x(i)} y={H - M.bottom + 14} text-anchor="middle">{fmt(distanceOf(i))}</text>}
          </g>
        ))}
        <text x={M.left} y={H - 4} font-weight="700" fill="#0f172a">{p.labelA ?? texts.pointA}</text>
        <text x={W - M.right} y={H - 4} text-anchor="end" font-weight="700" fill="#0f172a">{p.labelB ?? texts.pointB}</text>
        <text x={(M.left + W - M.right) / 2} y={H - 4} text-anchor="middle">{texts.distance}</text>
        <text transform={`translate(12 ${(M.top + H - M.bottom) / 2}) rotate(-90)`} text-anchor="middle">{texts.heightAxis}</text>
      </g>
      {truthLine && <path d={truthLine} fill="none" stroke="#0f766e" stroke-width="2.5" stroke-dasharray="7 5" aria-hidden="true" data-testid="profile-truth" />}
      <path d={line} fill="none" stroke="#1d4ed8" stroke-width="2.5" stroke-linejoin="round" aria-hidden="true" />
      {shown.map((h, i) => {
        const d = fmt(distanceOf(i));
        return (
          <g key={i} role="slider" tabindex={p.readOnly ? -1 : 0} aria-label={texts.profilePoint(i + 1, d)} aria-valuemin={min} aria-valuemax={max}
            aria-valuenow={h ?? undefined} aria-valuetext={h === null ? texts.notSet : texts.metres(fmt(h))} aria-readonly={p.readOnly || undefined}
            aria-orientation="vertical" onKeyDown={onKey(i) as any} className="outline-none [&:focus-visible>circle.ring]:stroke-sky-500" data-testid={`profile-point-${i + 1}`}>
            <line x1={x(i)} x2={x(i)} y1={M.top} y2={H - M.bottom} stroke="transparent" stroke-width="16" />
            {h === null ? (
              <circle cx={x(i)} cy={H - M.bottom} r="6" fill="#ffffff" stroke="#94a3b8" stroke-width="2" stroke-dasharray="3 2" />
            ) : (
              <>
                <circle cx={x(i)} cy={y(h)} r="7" fill="#1d4ed8" stroke="#ffffff" stroke-width="2" />
              </>
            )}
            <circle className="ring" cx={x(i)} cy={h === null ? H - M.bottom : y(h)} r="11" fill="none" stroke="transparent" stroke-width="3" />
          </g>
        );
      })}
    </svg>
  );
};
