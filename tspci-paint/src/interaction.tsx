// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/paint, © Jeppe Bundsgaard, openPCI (Aarhus University and Aalborg University)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { IStore, useStore } from "@citolab/preact-store";
import { useEffect, useRef, useState } from "preact/hooks";
import { Actions, StateModel, Stroke, isEmpty } from "./store";
import { colorName, drawEnd, drawSegment, drawStart, fillCount, pointCount, renderAll, strokeCount } from "./drawing";
import { Texts } from "./texts";

// A toolbar (colours and brush sizes as radio groups, eraser, undo, redo, clear) above a canvas. The canvas draws with
// pointer events (mouse, pen with pressure, touch) and with the keyboard: it is focusable, the arrow keys move a pen
// cursor and Space puts the pen down or lifts it.

export type Settings = {
  prompt: string;
  colors: string[];
  defaultColor: string;
  strokes: number[];
  defaultStroke: number;
  width: number;
  height: number;
};

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
    stroke-linejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const icons = {
  undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  clear: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6",
  eraser: "m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L11 21M22 21H7M5 11l9 9",
  paintBucket: "M6.5 6.5 3 10a1.4 1.4 0 0 0 0 2l7 7a1.4 1.4 0 0 0 2 0l7-7a1.4 1.4 0 0 0 0-2l-8-8v4M6.5 1.5 11 6M2.5 11h17" +
    "M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z",
};

const Interaction = ({ settings, store, texts }: { settings: Settings; store: IStore<StateModel, Actions>; texts: Texts }) => {
  const state = useStore(store);
  const { prompt, colors, strokes, width, height } = settings;
  const [color, setColor] = useState(settings.defaultColor);
  const [size, setSize] = useState(settings.defaultStroke);
  const [eraser, setEraser] = useState(false);
  const [fill, setFill] = useState(false);
  const [cursor, setCursor] = useState({ x: Math.round(width / 2), y: Math.round(height / 2), down: false });
  const [focused, setFocused] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const current = useRef<Stroke | null>(null); // the stroke being drawn
  const pointerId = useRef<number | null>(null);

  const ctx = () => canvas.current?.getContext("2d");
  const repaint = () => ctx() && renderAll(ctx(), store.getState(), repaint);

  // replay the drawing when it changes (undo, redo, clear, restore); a new stroke is on the canvas already, but
  // replaying it gives exactly what the response will be
  useEffect(repaint, [state, width, height]);
  // the settings changed (authoring): back to the defaults
  useEffect(() => setColor(settings.defaultColor), [settings.defaultColor]);
  useEffect(() => setSize(settings.defaultStroke), [settings.defaultStroke]);

  const start = (x: number, y: number, p: number) => {
    current.current = { kind: "stroke", color: eraser ? null : color, size, points: [round(x), round(y), round(p, 2)] };
    drawStart(ctx(), current.current);
  };
  const extend = (x: number, y: number, p: number) => {
    const s = current.current;
    if (!s) return;
    const n = pointCount(s);
    if (Math.hypot(x - s.points[(n - 1) * 3], y - s.points[(n - 1) * 3 + 1]) < 0.75) return;
    s.points.push(round(x), round(y), round(p, 2));
    if (n >= 2) drawSegment(ctx(), s, n - 1);
  };
  const finish = () => {
    const s = current.current;
    if (!s) return;
    current.current = null;
    drawEnd(ctx(), s);
    store.dispatch({ type: "ADD", payload: { operation: s } });
  };
  // the paint bucket: the replay after ADD draws it
  const fillAt = (x: number, y: number) => {
    const fx = Math.min(width - 1, Math.floor(x)), fy = Math.min(height - 1, Math.floor(y));
    store.dispatch({ type: "ADD", payload: { operation: { kind: "fill", color, x: fx, y: fy } } });
    setAnnouncement(texts.filled(colorName(color, texts), fx, fy));
  };
  const toggleEraser = () => {
    setEraser(!eraser);
    setFill(false);
  };
  const toggleFill = () => {
    setFill(!fill);
    setEraser(false);
  };

  // pointer: mouse, pen, touch
  const position = (e: PointerEvent) => {
    const rect = canvas.current.getBoundingClientRect();
    return {
      x: Math.min(width, Math.max(0, ((e.clientX - rect.left) * width) / rect.width)),
      y: Math.min(height, Math.max(0, ((e.clientY - rect.top) * height) / rect.height)),
      p: e.pointerType === "pen" ? e.pressure || 0.5 : 0.5,
    };
  };
  const onPointerDown = (e: PointerEvent) => {
    if (pointerId.current !== null || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    const { x, y, p } = position(e);
    if (fill) {
      fillAt(x, y);
      return;
    }
    pointerId.current = e.pointerId;
    canvas.current.setPointerCapture?.(e.pointerId);
    start(x, y, p);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== pointerId.current) return;
    const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    (events.length ? events : [e]).forEach((ev) => {
      const { x, y, p } = position(ev);
      extend(x, y, p);
    });
  };
  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== pointerId.current) return;
    pointerId.current = null;
    finish();
  };

  // keyboard: a pen cursor
  const penUp = () => {
    if (!cursor.down) return;
    finish();
    setCursor((c) => ({ ...c, down: false }));
    setAnnouncement(texts.penUp);
  };
  const onCanvasKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 2 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      const x = Math.min(width, Math.max(0, cursor.x + moves[e.key][0]));
      const y = Math.min(height, Math.max(0, cursor.y + moves[e.key][1]));
      if (cursor.down) extend(x, y, 0.5);
      setCursor({ ...cursor, x, y });
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (cursor.down) {
        penUp();
      } else if (fill) {
        fillAt(cursor.x, cursor.y);
      } else {
        start(cursor.x, cursor.y, 0.5);
        setCursor({ ...cursor, down: true });
        setAnnouncement(texts.penDown(cursor.x, cursor.y) + (eraser ? ` (${texts.erasing})` : ""));
      }
    } else if (e.key === "Escape") {
      penUp();
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (key === "y" || (key === "z" && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  };
  const undo = () => {
    penUp();
    store.dispatch({ type: "UNDO", payload: null });
  };
  const redo = () => {
    penUp();
    store.dispatch({ type: "REDO", payload: null });
  };
  const clear = () => {
    penUp();
    store.dispatch({ type: "CLEAR", payload: null });
    setAnnouncement(texts.cleared);
  };

  const count = strokeCount(state);
  const fills = fillCount(state);
  const empty = isEmpty(state);
  const button =
    "inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-700 " +
    "hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 " +
    "disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex max-w-full flex-col gap-3 font-sans text-slate-800" style={{ width: `${width}px` }} onKeyDown={onKeyDown}>
      {prompt && <p className="m-0 text-[15px] text-slate-700" id="prompt">{prompt}</p>}
      <div role="toolbar" aria-label={texts.toolbar} aria-controls="canvas"
        className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
        <fieldset className="m-0 flex flex-wrap items-center gap-1 border-0 p-0">
          <legend className="sr-only">{texts.colors}</legend>
          {colors.map((c) => {
            const selected = !eraser && c === color;
            return (
              <label key={c} title={colorName(c, texts)} className="relative cursor-pointer">
                <input type="radio" name="color" className="peer sr-only" checked={selected} aria-label={colorName(c, texts)}
                  data-testid={`color-${c}`} onChange={() => { setColor(c); setEraser(false); }} />
                <span className={`block h-7 w-7 rounded-full border border-slate-300 shadow-inner transition-transform
                  peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky-600
                  ${selected ? "scale-110 ring-2 ring-sky-600 ring-offset-2" : "hover:scale-105"}`}
                  style={{ backgroundColor: c }} />
              </label>
            );
          })}
        </fieldset>
        <fieldset className="m-0 flex flex-wrap items-center gap-1 border-0 p-0">
          <legend className="sr-only">{texts.sizes}</legend>
          {strokes.map((s) => (
            <label key={s} title={texts.size(s)} className="cursor-pointer">
              <input type="radio" name="size" className="peer sr-only" checked={s === size} aria-label={texts.size(s)}
                data-testid={`size-${s}`} onChange={() => setSize(s)} />
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg border
                peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky-600
                ${s === size ? "border-sky-600 bg-sky-100" : "border-transparent hover:bg-white"}`}>
                <span className="block rounded-full bg-slate-700"
                  style={{ width: `${Math.max(2, Math.min(s, 26))}px`, height: `${Math.max(2, Math.min(s, 26))}px` }} />
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={`${button} ${eraser ? "border-sky-600 bg-sky-100 hover:bg-sky-100" : ""} focus:bg-sky-100 focus:border-sky-600`}
            aria-pressed={eraser} onClick={toggleEraser} data-testid="eraser">
            <Icon d={icons.eraser} />{texts.eraser}
          </button>
          <button type="button" className={`${button} ${fill ? "border-sky-600 bg-sky-100 hover:bg-sky-100" : ""} focus:bg-sky-100 focus:border-sky-600`}
            aria-pressed={fill} onClick={toggleFill} data-testid="paint-bucket">
            <Icon d={icons.paintBucket} />{texts.fill}
          </button>
          <button type="button" className={button} onClick={undo} disabled={state.operations.length === 0}
            aria-keyshortcuts="Control+Z" data-testid="undo">
            <Icon d={icons.undo} /><span className="sr-only sm:not-sr-only">{texts.undo}</span>
          </button>
          <button type="button" className={button} onClick={redo} disabled={state.undone.length === 0}
            aria-keyshortcuts="Control+Y" data-testid="redo">
            <Icon d={icons.redo} /><span className="sr-only sm:not-sr-only">{texts.redo}</span>
          </button>
          <button type="button" className={button} onClick={clear} disabled={empty} data-testid="clear">
            <Icon d={icons.clear} /><span className="sr-only sm:not-sr-only">{texts.clear}</span>
          </button>
        </div>
      </div>
      <div id="canvas" tabIndex={0} role="application"
        aria-roledescription={texts.canvas}
        aria-label={`${prompt || texts.canvas} (${empty ? texts.empty : texts.strokes(count) + (fills ? `, ${texts.fills(fills)}` : "")})`}
        aria-describedby="help"
        onKeyDown={onCanvasKey}
        onFocus={() => setFocused(true)}
        onBlur={() => { penUp(); setFocused(false); }}
        className="relative w-full overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_rgba(16,24,40,.06)]
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
        style={{ aspectRatio: `${width} / ${height}` }}>
        <canvas ref={canvas} width={width} height={height} data-testid="canvas"
          className={`block h-full w-full touch-none select-none ${eraser ? "cursor-cell" : fill ? "cursor-pointer" : "cursor-crosshair"}`}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          onContextMenu={(e) => e.preventDefault()} />
        {focused && (
          <span aria-hidden="true" className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-600"
            style={{
              left: `${(cursor.x / width) * 100}%`,
              top: `${(cursor.y / height) * 100}%`,
              width: "14px",
              height: "14px",
              backgroundColor: cursor.down ? (eraser ? "white" : color) : "transparent",
            }} />
        )}
      </div>
      <p id="help" className="m-0 text-xs text-slate-500">{texts.keyboardHelp}</p>
      <div aria-live="polite" className="sr-only">{announcement}</div>
    </div>
  );
};

export default Interaction;
