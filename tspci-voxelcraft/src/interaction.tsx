// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/voxelcraft, © OpenPCI (Aarhus University and Aalborg
// University: Elias J.T. Hansen, Anna Rusmann, Jeppe Bundsgaard)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { IStore, useStore } from "@citolab/preact-store";
import { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Tool, VoxelScene } from "./scene";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";
import { GRID, MAX_HEIGHT, Vec3, Voxel, fromCell, hexToInt, intToHex, key } from "./voxels";

// The building area with its tools. The tools are radio buttons and buttons; the 3D view itself takes the keyboard
// (role="application"): a cursor moves over the cells and Enter uses the tool there, and a live region says what
// happened. Undo and "start over" (back to the preset figure) work with the mouse and the keyboard alike.

const Icon = ({ d, title }: { d: string; title?: string }) => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
    stroke-linejoin="round" aria-hidden="true">
    {title && <title>{title}</title>}
    <path d={d} />
  </svg>
);

const ICONS = {
  add: "M12 3 4 7.5v9L12 21l8-4.5v-9L12 3zM12 12v9M12 12l8-4.5M12 12 4 7.5M16 3.5h5M18.5 1v5",
  remove: "M12 3 4 7.5v9L12 21l8-4.5v-9L12 3zM12 12v9M12 12l8-4.5M12 12 4 7.5M16 3.5h5",
  paint: "M19 11 9 21l-6-6L13 5M14 4l6 6M18 13s2 2.5 2 4a2 2 0 1 1-4 0c0-1.5 2-4 2-4z",
  undo: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  reset: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  left: "M3 12a9 9 0 0 1 15.5-6.2M21 4v5h-5M12 7v5l3 2",
  right: "M21 12a9 9 0 0 0-15.5-6.2M3 4v5h5M12 7v5l-3 2",
  zoomIn: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M11 8v6M8 11h6",
  zoomOut: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M8 11h6",
  view: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  fullscreen: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
};

const button =
  "inline-flex size-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600 disabled:opacity-35 disabled:hover:bg-transparent";

const ToolButton = ({ tool, current, label, onSelect, name }: { tool: Tool; current: Tool; label: string; onSelect: (t: Tool) => void; name: string }) => (
  <label title={label}
    className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-sky-600 ${current === tool ? "bg-sky-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
    <input type="radio" name={name} className="sr-only" checked={current === tool} onChange={() => onSelect(tool)} data-testid={`tool-${tool}`} />
    <Icon d={ICONS[tool]} />
    <span className="hidden sm:inline">{label}</span>
    <span className="sr-only sm:hidden">{label}</span>
  </label>
);

let instances = 0;

const Interaction = ({ store, colors, preset, texts, readOnly = false, emptyColor, children }: {
  store: IStore<StateModel, Actions>;
  /** The palette, "#rrggbb". */
  colors: string[];
  /** The preset figure: "start over" goes back to it. */
  preset: Voxel[];
  texts: Texts;
  readOnly?: boolean;
  /** Authoring a target shape: the colour that marks empty space, shown last in the palette. */
  emptyColor?: string;
  children?: ComponentChildren;
}) => {
  const { voxels, past } = useStore(store);
  const [id] = useState(() => `voxelcraft-${++instances}`);
  const [tool, setTool] = useState<Tool>("add");
  const palette = emptyColor && !colors.includes(emptyColor) ? [...colors, emptyColor] : colors;
  const [color, setColor] = useState(palette[0]);
  const [cursor, setCursorState] = useState<[number, number, number]>([GRID / 2, 0, GRID / 2]);
  const [cursorShown, setCursorShownState] = useState(false);
  // the key handlers read these refs: two keys pressed before a render still see each other's result
  const cursorRef = useRef(cursor);
  const cursorShownRef = useRef(cursorShown);
  const setCursor = (c: [number, number, number]) => { cursorRef.current = c; setCursorState(c); };
  const setCursorShown = (shown: boolean) => { cursorShownRef.current = shown; setCursorShownState(shown); };
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [noWebgl, setNoWebgl] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const sceneRef = useRef<VoxelScene | null>(null);
  const announceNext = useRef<"added" | "removed" | "painted" | null>(null);

  // the 3D view lives as long as the component
  useEffect(() => {
    let scene: VoxelScene;
    try {
      scene = new VoxelScene(host.current, {
        onAdd: (added) => {
          announceNext.current = "added";
          store.dispatch({ type: "ADD", payload: { voxels: added } });
        },
        onRemove: (k) => {
          announceNext.current = "removed";
          store.dispatch({ type: "REMOVE", payload: { key: k } });
        },
        onPaint: (k, c) => {
          announceNext.current = "painted";
          store.dispatch({ type: "PAINT", payload: { key: k, c } });
        },
      });
    } catch {
      setNoWebgl(true);
      return;
    }
    sceneRef.current = scene;
    const onFullscreen = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setVoxels(voxels);
    const what = announceNext.current;
    announceNext.current = null;
    if (what === "added") setMessage(texts.added(voxels.length));
    else if (what === "removed") setMessage(texts.removed(voxels.length));
    else if (what === "painted") setMessage(texts.painted);
  }, [voxels]);
  useEffect(() => sceneRef.current?.setTool(tool), [tool]);
  useEffect(() => sceneRef.current?.setColor(hexToInt(color)), [color]);
  useEffect(() => sceneRef.current?.setReadOnly(readOnly), [readOnly]);
  useEffect(() => sceneRef.current?.setCursor(cursorShown ? fromCell(...cursor) : null), [cursor, cursorShown]);
  useEffect(() => {
    if (!palette.includes(color)) setColor(palette[0]);
  }, [palette.join()]);
  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  /** The building as it is now (the store, not the last render). */
  const building = () => new Map(store.getState().voxels.map((v) => [key(v.p), v]));
  const colorName = (c: number) => {
    const i = palette.indexOf(intToHex(c));
    return i >= 0 ? texts.color(intToHex(c), i + 1) : intToHex(c);
  };
  /** The level the cursor goes to in a column: on top of it to add, the top cube to remove or paint. */
  const levelIn = (x: number, z: number, forTool: Tool) => {
    const byKey = building();
    let top = -1;
    for (let y = 0; y < MAX_HEIGHT; y++) if (byKey.has(key(fromCell(x, y, z)))) top = y;
    return forTool === "add" ? Math.min(top + 1, MAX_HEIGHT - 1) : Math.max(top, 0);
  };
  const describe = (c: [number, number, number]) => {
    const v = building().get(key(fromCell(...c)));
    return texts.cursor(c[0], c[1], c[2], v ? colorName(v.c) : null);
  };
  const moveCursor = (next: [number, number, number]) => {
    setCursor(next);
    setCursorShown(true);
    setMessage(describe(next));
  };

  const act = () => {
    if (readOnly) return;
    const cursor = cursorRef.current;
    const byKey = building();
    const p: Vec3 = fromCell(...cursor);
    const k = key(p);
    if (tool === "add") {
      if (byKey.has(k)) return setMessage(describe(cursor));
      announceNext.current = "added";
      store.dispatch({ type: "ADD", payload: { voxels: [{ p, c: hexToInt(color) }] } });
      if (cursor[1] < MAX_HEIGHT - 1) setCursor([cursor[0], cursor[1] + 1, cursor[2]]); // stack the next one on top
    } else if (byKey.has(k)) {
      announceNext.current = tool === "remove" ? "removed" : "painted";
      if (tool === "remove") {
        store.dispatch({ type: "REMOVE", payload: { key: k } });
        if (cursor[1] > 0) setCursor([cursor[0], cursor[1] - 1, cursor[2]]);
      } else store.dispatch({ type: "PAINT", payload: { key: k, c: hexToInt(color) } });
    } else setMessage(describe(cursor));
  };

  const undo = () => {
    announceNext.current = null;
    store.dispatch({ type: "UNDO", payload: null });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const scene = sceneRef.current;
    if (!scene) return;
    const cursor = cursorRef.current;
    const arrows: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (arrows[e.key] && e.shiftKey) {
      e.preventDefault();
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") scene.rotate((e.key === "ArrowLeft" ? -1 : 1) * (Math.PI / 12));
      else scene.zoom(e.key === "ArrowUp" ? 0.85 : 1 / 0.85);
      return;
    }
    if (arrows[e.key]) {
      e.preventDefault();
      // away from the camera is up, whichever side it looks from
      let [dx, dz] = arrows[e.key];
      for (let q = 0; q < scene.quarterTurns(); q++) [dx, dz] = [dz, -dx];
      const x = Math.max(0, Math.min(GRID - 1, cursor[0] + dx));
      const z = Math.max(0, Math.min(GRID - 1, cursor[2] + dz));
      moveCursor([x, levelIn(x, z, tool), z]);
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const y = Math.max(0, Math.min(MAX_HEIGHT - 1, cursor[1] + (e.key === "PageUp" ? 1 : -1)));
      moveCursor([cursor[0], y, cursor[2]]);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!cursorShownRef.current) return moveCursor(cursor);
      act();
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      scene.zoom(0.85);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      scene.zoom(1 / 0.85);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !readOnly) {
      e.preventDefault();
      undo();
    }
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else frame.current?.requestFullscreen?.().catch(() => undefined);
  };

  const fullscreenSupported = typeof document !== "undefined" && !!document.fullscreenEnabled;

  return (
    <div ref={frame} data-testid="voxelcraft"
      className={`relative flex w-full flex-col overflow-hidden border border-slate-200 bg-white font-sans text-slate-800 shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_rgba(16,24,40,.06)] ${fullscreen ? "h-full rounded-none" : "rounded-xl"}`}>
      {/* the tools */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-slate-50/80 px-2 py-2">
        {readOnly ? (
          <span className="rounded-md bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700">{texts.readOnly}</span>
        ) : (
          <>
            <div role="radiogroup" aria-label={texts.tools} className="flex items-center gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
              <ToolButton name={`${id}-tool`} tool="add" current={tool} label={texts.add} onSelect={setTool} />
              <ToolButton name={`${id}-tool`} tool="remove" current={tool} label={texts.remove} onSelect={setTool} />
              <ToolButton name={`${id}-tool`} tool="paint" current={tool} label={texts.paint} onSelect={setTool} />
            </div>
            <div className="flex items-center gap-1">
              <button type="button" className={button} onClick={undo} disabled={!past.length} title={texts.undo} aria-label={texts.undo} data-testid="undo">
                <Icon d={ICONS.undo} />
              </button>
              <button type="button" className={button} onClick={() => setConfirming(true)} title={texts.reset} aria-label={texts.reset} data-testid="reset">
                <Icon d={ICONS.reset} />
              </button>
            </div>
          </>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <button type="button" className={button} onClick={() => sceneRef.current?.rotate(-Math.PI / 4)} title={texts.rotateLeft} aria-label={texts.rotateLeft}>
            <Icon d={ICONS.left} />
          </button>
          <button type="button" className={button} onClick={() => sceneRef.current?.rotate(Math.PI / 4)} title={texts.rotateRight} aria-label={texts.rotateRight}>
            <Icon d={ICONS.right} />
          </button>
          <button type="button" className={button} onClick={() => sceneRef.current?.zoom(0.8)} title={texts.zoomIn} aria-label={texts.zoomIn}>
            <Icon d={ICONS.zoomIn} />
          </button>
          <button type="button" className={button} onClick={() => sceneRef.current?.zoom(1.25)} title={texts.zoomOut} aria-label={texts.zoomOut}>
            <Icon d={ICONS.zoomOut} />
          </button>
          <button type="button" className={button} onClick={() => sceneRef.current?.resetView()} title={texts.resetView} aria-label={texts.resetView} data-testid="reset-view">
            <Icon d={ICONS.view} />
          </button>
          {fullscreenSupported && (
            <button type="button" className={button} onClick={toggleFullscreen} aria-pressed={fullscreen}
              title={fullscreen ? texts.exitFullscreen : texts.fullscreen} aria-label={fullscreen ? texts.exitFullscreen : texts.fullscreen}>
              <Icon d={ICONS.fullscreen} />
            </button>
          )}
        </div>
      </div>

      {/* the palette (to add and to paint) */}
      {!readOnly && tool !== "remove" && (
        <div role="radiogroup" aria-label={texts.colors} className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 px-3 py-2" data-testid="palette">
          {palette.map((c, i) => (
            <label key={c} title={c === emptyColor ? `${texts.color(c, i + 1)} ∅` : texts.color(c, i + 1)}
              className={`relative size-7 cursor-pointer rounded-full ring-offset-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-sky-600 ${color === c ? "ring-2 ring-slate-800" : "ring-1 ring-black/15 hover:scale-110"} transition-transform`}
              style={{ backgroundColor: c }}>
              <input type="radio" name={`${id}-color`} className="sr-only" checked={color === c} onChange={() => setColor(c)}
                aria-label={texts.color(c, i + 1)} data-testid={`color-${i}`} />
              {c === emptyColor && <span aria-hidden="true" className="absolute inset-0 grid place-items-center text-xs font-bold text-white mix-blend-difference">∅</span>}
            </label>
          ))}
        </div>
      )}

      {/* the 3D view */}
      <div ref={host} tabIndex={0} role="application" aria-label={texts.scene} aria-describedby={`${id}-description`} data-testid="scene"
        onKeyDown={onKeyDown} onBlur={() => setCursorShown(false)} onPointerDown={() => setCursorShown(false)}
        className={`relative w-full bg-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-600 ${fullscreen ? "min-h-0 flex-1" : "aspect-[16/10] min-h-[280px] max-h-[75vh]"}`}>
        {noWebgl && <p className="m-0 p-6 text-sm text-slate-700">{texts.noWebgl}</p>}
      </div>
      <p id={`${id}-description`} className="sr-only">{texts.sceneDescription}</p>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-1.5 text-xs text-slate-500">
        <span data-testid="count">{texts.count(voxels.length)}</span>
        {!readOnly && <span className="hidden md:inline">{texts.help}</span>}
      </div>
      <div aria-live="polite" className="sr-only" data-testid="announcer">{message}</div>

      {children}

      {confirming && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-slate-900/30 p-4"
          onKeyDown={(e) => e.key === "Escape" && setConfirming(false)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby={`${id}-confirm`} className="max-w-sm rounded-xl bg-white p-4 shadow-xl">
            <p id={`${id}-confirm`} className="m-0 mb-3 text-sm">{texts.resetConfirm}</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-lg px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-sky-600"
                onClick={() => setConfirming(false)}>{texts.resetNo}</button>
              <button type="button" ref={confirmButton} data-testid="reset-confirm"
                className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
                onClick={() => {
                  setConfirming(false);
                  store.dispatch({ type: "RESET", payload: { voxels: preset } });
                  host.current?.focus();
                }}>{texts.resetYes}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Interaction;
