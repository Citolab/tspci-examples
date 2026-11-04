import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  Placed, Timeline, TimelineEvent, assignLanes, clampView, formatValue, formatYear, orderOf, periodAt, placedPosition, positionOf,
  snapAt, ticks, toAstro, visiblePart, visiblePeriods, zoomView,
} from "./timeline";
import { Texts } from "./texts";

// The timeline the candidate works on (and the authoring mode's preview): the cards still to place, the axis with
// its periods as coloured bands, the placed cards above it, zoom and pan. The parent keeps the placements.

const CARD_W = 150;
const LANE_H = 64;
const CARD_H = 50;
const AXIS_H = 40;
const BAND_H = 26;
const TOP = 10;
/** Okabe–Ito: colours that stay apart with every kind of colour blindness; the bands also carry a number and a name. */
export const BAND_COLORS = ["#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7", "#999999"];

type View = [number, number];
type Drag = { id: string; from: "tray" | "line"; pointerId: number; startX: number; startY: number; x: number; y: number; moved: boolean };

export type BoardProps = {
  timeline: Timeline;
  placed: Placed;
  texts: Texts;
  language: "en" | "nl";
  label: string;
  readOnly?: boolean;
  showValue?: boolean;
  minHeight?: number;
  onPlace?: (id: string, value: number | string) => void;
  onSetPlaced?: (placed: Placed) => void;
  onRemove?: (id: string) => void;
  onClear?: () => void;
  /** a prefix for ids, so that two timelines on a page (and in a shadow root) keep theirs apart */
  idPrefix?: string;
};

const button =
  "inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-50 " +
  "disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";

const fullView = (t: Timeline): View => {
  const a = toAstro(t.start), b = toAstro(t.end);
  const pad = Math.max(0.5, (b - a) * 0.03);
  return [a - pad, b + pad];
};

const minSpanOf = (t: Timeline) => (t.mode === "order" ? 20 : t.unit === "century" ? 400 : t.unit === "decade" ? 60 : Math.max(12, t.snap * 12));

const CardFace = ({ event, value, compact = false }: { event: TimelineEvent; value?: string; compact?: boolean }) => (
  <span className="flex min-w-0 items-center gap-2">
    {event.image && <img src={event.image} alt={event.alt ?? ""} className="h-9 w-9 shrink-0 rounded object-cover" draggable={false} />}
    <span className="flex min-w-0 flex-col">
      <span className={`${compact ? "line-clamp-2" : ""} text-[12.5px] leading-tight text-slate-800`}>{event.text}</span>
      {value && <span className="mt-0.5 text-[11.5px] font-semibold tabular-nums text-sky-800">{value}</span>}
    </span>
  </span>
);

const Board = ({
  timeline: t, placed, texts, language, label, readOnly = false, showValue = true, minHeight = 0, onPlace, onSetPlaced, onRemove, onClear,
  idPrefix = "tl",
}: BoardProps) => {
  const full = useMemo(() => fullView(t), [t]);
  const [view, setView] = useState<View>(full);
  const [width, setWidth] = useState(800);
  const [chosen, setChosen] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [status, setStatus] = useState("");
  const [help, setHelp] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const panRef = useRef<{ x: number; view: View; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const sliders = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => setView(full), [full[0], full[1]]);

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(200, el.clientWidth || 800));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!focusId) return;
    sliders.current[focusId]?.focus();
    setFocusId(null);
  }, [focusId, placed]);

  const unit = t.mode === "order" ? "year" : t.unit;
  const withEra = t.start < 0;
  const periods = visiblePeriods(t);
  const span = view[1] - view[0];
  const xOf = (position: number) => ((position - view[0]) / span) * width;
  const positionAtX = (x: number) => view[0] + (x / width) * span;
  const axisFrom = toAstro(t.start), axisTo = toAstro(t.end);
  const clampPos = (p: number) => Math.min(axisTo, Math.max(axisFrom, p));
  const eventOf = (id: string) => t.events.find((e) => e.id === id)!;
  const order = orderOf(t, placed);

  /** What a position on the axis means in this mode: a year (date, order) or a period id. */
  const valueAt = (position: number): number | string | null => {
    if (t.mode === "period") return periodAt(periods, clampPos(position))?.id ?? null;
    return snapAt(clampPos(position), unit, t.snap);
  };
  const describe = (id: string, value: number | string, after: Placed): string => {
    if (typeof value === "string") return periods.find((p) => p.id === value)?.label ?? value;
    if (t.mode === "order") {
      const o = orderOf(t, after);
      return texts.orderValue(o.indexOf(id) + 1, o.length);
    }
    return formatValue(value, unit, language, withEra);
  };
  const announce = (id: string, value: number | string, after: Placed) => {
    const text = eventOf(id).text || eventOf(id).alt || id;
    setStatus(texts.placedAt(text, describe(id, value, after)));
  };
  const place = (id: string, value: number | string) => {
    const after = { ...placed, [id]: value };
    onPlace?.(id, value);
    announce(id, value, after);
  };
  const remove = (id: string) => {
    onRemove?.(id);
    setStatus(texts.returned(eventOf(id).text || id));
  };
  const keepInView = (position: number) => {
    if (position >= view[0] && position <= view[1]) return;
    setView((v) => clampView([position - (v[1] - v[0]) / 2, position + (v[1] - v[0]) / 2], full));
  };

  // ------------------------------------------------------------ zoom and pan
  const zoom = (factor: number, around = (view[0] + view[1]) / 2) => {
    const next = zoomView(view, factor, around, full, minSpanOf(t));
    setView(next);
    setStatus(texts.showing(formatYear(snapAt(next[0], "year"), language, withEra), formatYear(snapAt(next[1], "year"), language, withEra)));
  };
  const pan = (fraction: number) => {
    const next = clampView([view[0] + fraction * span, view[1] + fraction * span], full);
    setView(next);
    setStatus(texts.showing(formatYear(snapAt(next[0], "year"), language, withEra), formatYear(snapAt(next[1], "year"), language, withEra)));
  };
  const zoomedIn = span < full[1] - full[0] - 1e-6;
  const canZoomIn = span > Math.min(minSpanOf(t), full[1] - full[0]) + 1e-6;

  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const v = viewRef.current;
      const rect = el.getBoundingClientRect();
      const s = v[1] - v[0];
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const around = v[0] + ((e.clientX - rect.left) / rect.width) * s;
        setView(zoomView(v, Math.exp(-e.deltaY * 0.004), around, full, minSpanOf(t)));
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
        e.preventDefault();
        const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / rect.width * s;
        setView(clampView([v[0] + d, v[1] + d], full));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [full[0], full[1], t]);

  // ------------------------------------------------------------ the keyboard
  const stepYears = t.mode === "order" ? Math.max(t.snap, Math.round((axisTo - axisFrom) / 100)) : unit === "century" ? 100 : unit === "decade" ? 10 : t.snap;
  const moveBy = (value: number, steps: number) => snapAt(clampPos(positionOf(value, unit) + steps * stepYears), unit, t.snap);

  /** Where a card goes when the candidate puts it on the timeline with the keyboard. */
  const keyboardValue = (id: string): number | string | null => {
    const middle = (view[0] + view[1]) / 2;
    if (t.mode === "period") return (periodAt(periods, clampPos(middle)) ?? periods[0])?.id ?? null;
    if (t.mode === "order") {
      const others = Object.keys(placed).filter((k) => k !== id).map((k) => placedPosition(t, placed[k]) as number);
      if (!others.length) return snapAt(clampPos(middle), unit, t.snap);
      const last = Math.max(...others);
      return snapAt(clampPos(last + Math.max(stepYears, (axisTo - last) / 2)), unit, t.snap);
    }
    return snapAt(clampPos(middle), unit, t.snap);
  };
  const placeByKeyboard = (id: string) => {
    if (readOnly) return;
    const value = keyboardValue(id);
    if (value === null) return;
    setChosen(null);
    place(id, value);
    const p = placedPosition(t, value);
    if (p !== null) keepInView(p);
    setFocusId(id);
  };

  const onSliderKey = (e: KeyboardEvent, id: string) => {
    if (readOnly) return;
    const value = placed[id];
    let next: number | string | null = null;
    const key = e.key;
    if (key === "Delete" || key === "Backspace") {
      e.preventDefault();
      remove(id);
      return;
    }
    const dir = key === "ArrowLeft" || key === "ArrowDown" ? -1 : key === "ArrowRight" || key === "ArrowUp" ? 1 : 0;
    const big = key === "PageDown" ? -1 : key === "PageUp" ? 1 : 0;
    if (!dir && !big && key !== "Home" && key !== "End") return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof value === "string") {
      const i = periods.findIndex((p) => p.id === value);
      const j = key === "Home" ? 0 : key === "End" ? periods.length - 1 : Math.min(periods.length - 1, Math.max(0, i + dir + big * 3));
      next = periods[j]?.id ?? value;
    } else if (key === "Home" || key === "End") {
      next = snapAt(key === "Home" ? axisFrom : axisTo, unit, t.snap);
    } else if (big) {
      next = moveBy(value, big * 10);
    } else if (t.mode === "order") {
      // past the neighbour: swap with it; a tie or no neighbour: one step
      const mine = toAstro(value);
      const others = Object.keys(placed).filter((k) => k !== id && typeof placed[k] === "number");
      const tie = others.some((k) => toAstro(placed[k] as number) === mine);
      const beyond = others
        .filter((k) => (dir < 0 ? toAstro(placed[k] as number) < mine : toAstro(placed[k] as number) > mine))
        .sort((a, b) => (toAstro(placed[a] as number) - toAstro(placed[b] as number)) * dir)[0];
      if (!tie && beyond !== undefined) {
        const after = { ...placed, [id]: placed[beyond], [beyond]: value };
        onSetPlaced?.(after);
        announce(id, after[id], after);
        keepInView(placedPosition(t, after[id]) as number);
        return;
      }
      next = moveBy(value, dir);
    } else {
      next = moveBy(value, dir);
    }
    if (next === null || next === value) return;
    place(id, next);
    const p = placedPosition(t, next);
    if (p !== null) keepInView(p);
  };

  const onTrackKey = (e: KeyboardEvent) => {
    if (e.key === "+" || e.key === "=") { e.preventDefault(); zoom(2); }
    else if (e.key === "-" || e.key === "_") { e.preventDefault(); zoom(0.5); }
  };

  // ------------------------------------------------------------ the mouse and touch
  const overTrack = (x: number, y: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    return !!r && x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 24 && y <= r.bottom + 24;
  };
  const positionAtClient = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    return positionAtX(clientX - r.left);
  };
  // The drag follows the pointer on the window, not on the card: a card dragged along the line is not rendered there
  // while it moves, and a card that leaves the DOM loses its pointer capture (and with it the move and the drop).
  const dragHandlers = useRef({ move: (_e: PointerEvent) => {}, end: (_e: PointerEvent) => {}, cancel: () => {} });
  const stopListening = useRef<(() => void) | null>(null);
  useEffect(() => () => stopListening.current?.(), []);
  const startDrag = (e: PointerEvent, id: string, from: Drag["from"]) => {
    if (readOnly || e.button !== 0) return;
    e.stopPropagation();
    stopListening.current?.();
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
    dragRef.current = { id, from, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, moved: false };
    const win = (e.currentTarget as Element).ownerDocument?.defaultView ?? window;
    const move = (ev: PointerEvent) => dragHandlers.current.move(ev);
    const up = (ev: PointerEvent) => { stopListening.current?.(); dragHandlers.current.end(ev); };
    const cancel = () => { stopListening.current?.(); dragHandlers.current.cancel(); };
    win.addEventListener("pointermove", move);
    win.addEventListener("pointerup", up);
    win.addEventListener("pointercancel", cancel);
    stopListening.current = () => {
      win.removeEventListener("pointermove", move);
      win.removeEventListener("pointerup", up);
      win.removeEventListener("pointercancel", cancel);
      stopListening.current = null;
    };
  };
  const moveDrag = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    d.x = e.clientX;
    d.y = e.clientY;
    if (!d.moved && Math.hypot(d.x - d.startX, d.y - d.startY) > 4) d.moved = true;
    if (d.moved) setDrag({ ...d });
  };
  const endDrag = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    if (!d.moved) return; // a click: onClick handles it
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 0);
    if (overTrack(e.clientX, e.clientY)) {
      const value = valueAt(positionAtClient(e.clientX));
      if (value !== null) {
        setChosen(null);
        place(d.id, value);
        return;
      }
    }
    if (d.from === "line") remove(d.id);
  };
  const cancelDrag = () => {
    dragRef.current = null;
    setDrag(null);
  };
  dragHandlers.current = { move: moveDrag, end: endDrag, cancel: cancelDrag };

  const startPan = (e: PointerEvent) => {
    if (e.button !== 0) return;
    panRef.current = { x: e.clientX, view, moved: false };
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
  };
  const movePan = (e: PointerEvent) => {
    const p = panRef.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    if (Math.abs(dx) > 4) p.moved = true;
    if (!p.moved || !zoomedIn) return;
    const d = (-dx / width) * (p.view[1] - p.view[0]);
    setView(clampView([p.view[0] + d, p.view[1] + d], full));
  };
  const endPan = (e: PointerEvent) => {
    const p = panRef.current;
    panRef.current = null;
    if (!p || p.moved || readOnly || !chosen) return;
    const value = valueAt(positionAtClient(e.clientX));
    if (value !== null) {
      const id = chosen;
      setChosen(null);
      place(id, value);
    }
  };

  // ------------------------------------------------------------ layout
  const placedIds = t.events.filter((e) => placed[e.id] !== undefined && !(drag?.moved && drag.id === e.id && drag.from === "line")).map((e) => e.id);
  const items = placedIds.map((id) => {
    const p = placedPosition(t, placed[id]);
    const x = p === null ? -1 : xOf(p);
    return { id, x, cx: Math.min(width - CARD_W / 2, Math.max(CARD_W / 2, x)), out: p === null ? 0 : x < 0 ? -1 : x > width ? 1 : 0 };
  });
  const lanes = assignLanes(items.map((i) => ({ id: i.id, x: i.cx })), CARD_W);
  const laneCount = Math.max(2, ...Object.values(lanes).map((l) => l + 1));
  const axisY = Math.max(TOP + laneCount * LANE_H, minHeight - AXIS_H - (periods.length ? BAND_H : 0));
  const height = axisY + AXIS_H + (periods.length ? BAND_H : 0);
  const tray = t.events.filter((e) => placed[e.id] === undefined);

  const dragValue = drag?.moved && overTrack(drag.x, drag.y) ? valueAt(positionAtClient(drag.x)) : null;
  const rootRect = rootRef.current?.getBoundingClientRect();

  const tickList = t.mode === "order" ? [] : ticks(view[0], view[1], width, unit, withEra ? 96 : 64);
  const valueText = (id: string) => describe(id, placed[id], placed);

  return (
    <div ref={rootRef} className="relative flex w-full flex-col gap-3" data-testid="board">
      {!readOnly && (
        <section aria-labelledby={`${idPrefix}-tray`} className="flex flex-col gap-1.5">
          <h3 id={`${idPrefix}-tray`} className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">{texts.tray}</h3>
          <p id={`${idPrefix}-hint`} className="sr-only">{texts.hint}</p>
          {tray.length ? (
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0" data-testid="tray">
              {tray.map((e) => (
                <li key={e.id}>
                  <button type="button" data-event={e.id} aria-pressed={chosen === e.id} aria-describedby={`${idPrefix}-hint`}
                    className={`touch-none select-none rounded-lg border bg-white px-2.5 py-1.5 text-left shadow-sm hover:border-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 ${chosen === e.id ? "border-sky-600 ring-2 ring-sky-600" : "border-slate-300"} ${drag?.moved && drag.id === e.id ? "opacity-40" : ""}`}
                    style={{ width: `${CARD_W + 20}px` }}
                    onPointerDown={(ev) => startDrag(ev as PointerEvent, e.id, "tray")}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); placeByKeyboard(e.id); }
                    }}
                    onClick={(ev) => {
                      if (suppressClick.current) return;
                      if ((ev as MouseEvent).detail === 0) return placeByKeyboard(e.id);
                      const next = chosen === e.id ? null : e.id;
                      setChosen(next);
                      if (next) setStatus(texts.chosen(e.text || e.id));
                    }}>
                    <CardFace event={e} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-sm text-slate-500" data-testid="tray-empty">{texts.trayEmpty}</p>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={button} onClick={() => zoom(2)} disabled={!canZoomIn} aria-label={texts.zoomIn} title={texts.zoomIn}>
          <span aria-hidden="true" className="w-4 text-center font-semibold">+</span><span className="hidden sm:inline">{texts.zoomIn}</span>
        </button>
        <button type="button" className={button} onClick={() => zoom(0.5)} disabled={!zoomedIn} aria-label={texts.zoomOut} title={texts.zoomOut}>
          <span aria-hidden="true" className="w-4 text-center font-semibold">−</span><span className="hidden sm:inline">{texts.zoomOut}</span>
        </button>
        <button type="button" className={button} onClick={() => { setView(full); setStatus(texts.showing(formatYear(t.start, language, withEra), formatYear(t.end, language, withEra))); }} disabled={!zoomedIn}>
          {texts.fit}
        </button>
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        <button type="button" className={button} onClick={() => pan(-1 / 3)} disabled={!zoomedIn || view[0] <= full[0] + 1e-6} aria-label={texts.earlier}>
          <span aria-hidden="true">◀</span><span className="hidden sm:inline">{texts.earlier}</span>
        </button>
        <button type="button" className={button} onClick={() => pan(1 / 3)} disabled={!zoomedIn || view[1] >= full[1] - 1e-6} aria-label={texts.later}>
          <span className="hidden sm:inline">{texts.later}</span><span aria-hidden="true">▶</span>
        </button>
        <span className="ml-auto flex items-center gap-1.5">
          {!readOnly && (
            <button type="button" className={button} onClick={() => { onClear?.(); setStatus(texts.cleared); }} disabled={!Object.keys(placed).length}>
              {texts.clear}
            </button>
          )}
          <button type="button" className={button} aria-expanded={help} onClick={() => setHelp(!help)}>{texts.help}</button>
        </span>
      </div>
      {help && <p className="m-0 max-w-[75ch] rounded-lg bg-slate-50 p-2 text-sm text-slate-600">{texts.helpText}{t.mode === "order" ? texts.helpOrder : ""}</p>}

      <div ref={trackRef} role="group" aria-label={label} data-testid="track" onKeyDown={onTrackKey}
        className={`relative w-full touch-pan-y select-none overflow-hidden rounded-xl border border-slate-300 bg-white ${chosen ? "cursor-copy" : zoomedIn ? "cursor-grab" : ""}`}
        style={{ height: `${height}px` }}
        onPointerDown={(e) => startPan(e as PointerEvent)} onPointerMove={(e) => movePan(e as PointerEvent)} onPointerUp={(e) => endPan(e as PointerEvent)}
        onPointerCancel={() => (panRef.current = null)}>
        {/* the periods: coloured, hatched every other one, numbered and named (not by colour only) */}
        {periods.map((p, i) => {
          const part = visiblePart(p, t)!;
          const left = Math.max(-2, xOf(part[0])), right = Math.min(width + 2, xOf(part[1]));
          if (right <= left) return null;
          const color = BAND_COLORS[t.periods.indexOf(p) % BAND_COLORS.length];
          const hot = t.mode === "period" && dragValue === p.id;
          const name = `${t.periods.indexOf(p) + 1} · ${p.label}`;
          return (
            <div key={p.id} aria-hidden="true" data-period={p.id} className="absolute top-0 border-l border-slate-400/60"
              style={{
                left: `${left}px`, width: `${right - left}px`, height: `${height}px`,
                backgroundColor: `${color}${hot ? "55" : "22"}`,
                backgroundImage: i % 2 ? `repeating-linear-gradient(135deg, ${color}33 0 2px, transparent 2px 9px)` : undefined,
                outline: hot ? `2px solid ${color}` : undefined, outlineOffset: "-2px",
              }}>
              <span className="absolute bottom-0 left-0 right-0 truncate px-1.5 py-1 text-[11.5px] font-medium text-slate-800" title={name}
                style={{ height: `${BAND_H}px`, borderTop: `3px solid ${color}` }}>
                {right - left > 70 ? name : right - left > 18 ? String(t.periods.indexOf(p) + 1) : ""}
              </span>
            </div>
          );
        })}

        {/* the axis */}
        <svg aria-hidden="true" className="pointer-events-none absolute left-0 top-0" width={width} height={height}>
          <line x1={0} x2={width} y1={axisY} y2={axisY} stroke="#334155" stroke-width="2" />
          {tickList.map((k) => (
            <g key={k.position}>
              <line x1={xOf(k.position)} x2={xOf(k.position)} y1={axisY - 5} y2={axisY + 6} stroke="#334155" stroke-width="1.5" />
              <text x={Math.min(width - 4, Math.max(4, xOf(k.position)))} y={axisY + 21} text-anchor={xOf(k.position) < 44 ? "start" : xOf(k.position) > width - 44 ? "end" : "middle"} font-size="12" fill="#334155" class="tabular-nums">
                {formatYear(k.year, language, withEra)}
              </text>
            </g>
          ))}
          {t.mode === "order" && (
            <>
              <text x={8} y={axisY + 21} font-size="12" fill="#475569">← {texts.earlierLater[0]}</text>
              <text x={width - 8} y={axisY + 21} font-size="12" fill="#475569" text-anchor="end">{texts.earlierLater[1]} →</text>
            </>
          )}
          {/* stems from the cards to their place on the axis */}
          {items.map((it) => {
            if (it.out) return null;
            const top = axisY - (lanes[it.id] + 1) * LANE_H + (LANE_H - CARD_H) / 2 + CARD_H;
            return (
              <g key={it.id}>
                <line x1={it.x} x2={it.x} y1={top} y2={axisY} stroke="#0369a1" stroke-width="1.5" />
                <circle cx={it.x} cy={axisY} r="4.5" fill="#0369a1" stroke="white" stroke-width="1.5" />
              </g>
            );
          })}
          {dragValue !== null && (() => {
            const p = placedPosition(t, dragValue);
            if (p === null) return null;
            return <line x1={xOf(p)} x2={xOf(p)} y1={TOP} y2={axisY} stroke="#0369a1" stroke-width="2" stroke-dasharray="4 4" data-testid="drop-guide" />;
          })()}
        </svg>

        {/* the placed cards: sliders */}
        {items.map((it) => {
          const e = eventOf(it.id);
          const v = placed[it.id];
          const top = axisY - (lanes[it.id] + 1) * LANE_H + (LANE_H - CARD_H) / 2;
          const shown = t.mode === "date" && showValue && typeof v === "number" ? formatValue(v, unit, language, withEra) : undefined;
          const periodIndex = typeof v === "string" ? periods.findIndex((p) => p.id === v) : -1;
          const valueProps = typeof v === "string"
            ? { "aria-valuemin": 1, "aria-valuemax": periods.length, "aria-valuenow": periodIndex + 1 }
            : t.mode === "order"
              ? { "aria-valuemin": 1, "aria-valuemax": order.length, "aria-valuenow": order.indexOf(it.id) + 1 }
              : { "aria-valuemin": t.start, "aria-valuemax": t.end, "aria-valuenow": v };
          const vt = valueText(it.id) + (it.out ? `, ${texts.outOfView}` : "");
          return (
            <div key={it.id} ref={(el) => { sliders.current[it.id] = el; }} role="slider" tabIndex={0} aria-label={e.text || e.alt || e.id}
              aria-valuetext={vt} title={e.text} aria-readonly={readOnly ? "true" : undefined} {...valueProps} data-event={it.id} data-value={String(v)}
              className={`group absolute flex touch-none items-center rounded-lg border bg-white px-2 py-1 shadow-sm motion-safe:transition-[left,top] motion-safe:duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 ${readOnly ? "border-emerald-600" : "cursor-grab border-sky-700"} ${it.out ? "opacity-60" : ""}`}
              style={{ left: `${it.cx - CARD_W / 2}px`, top: `${top}px`, width: `${CARD_W}px`, height: `${CARD_H}px` }}
              onKeyDown={(ev) => onSliderKey(ev as KeyboardEvent, it.id)}
              onPointerDown={(ev) => startDrag(ev as PointerEvent, it.id, "line")}
              onPointerUp={(ev) => (ev.currentTarget as HTMLElement).focus()}>
              {it.out < 0 && <span aria-hidden="true" className="mr-1 text-sky-800">◀</span>}
              <CardFace event={e} value={shown} compact />
              {it.out > 0 && <span aria-hidden="true" className="ml-auto pl-1 text-sky-800">▶</span>}
              {!readOnly && (
                <button type="button" tabIndex={-1} aria-label={`${texts.remove}: ${e.text || e.id}`} title={texts.remove}
                  className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-xs leading-none text-slate-600 hover:bg-rose-50 group-hover:flex group-focus-visible:flex"
                  onPointerDown={(ev) => ev.stopPropagation()} onClick={(ev) => { ev.stopPropagation(); remove(it.id); }}>
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p role="status" aria-live="polite" className="m-0 min-h-5 text-sm text-slate-600" data-testid="status">{status}</p>

      {/* the card being dragged, under the pointer */}
      {drag?.moved && rootRect && (
        <div aria-hidden="true" className="pointer-events-none absolute z-10 rounded-lg border border-sky-700 bg-white px-2 py-1 shadow-lg"
          style={{ left: `${drag.x - rootRect.left - CARD_W / 2}px`, top: `${drag.y - rootRect.top - CARD_H / 2}px`, width: `${CARD_W}px` }}>
          <CardFace event={eventOf(drag.id)} compact
            value={dragValue === null ? undefined : typeof dragValue === "string" ? periods.find((p) => p.id === dragValue)?.label : t.mode === "date" ? formatValue(dragValue, unit, language, withEra) : undefined} />
        </div>
      )}
    </div>
  );
};

export default Board;
