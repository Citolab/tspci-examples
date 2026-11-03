import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ModelDef } from "./models";
import { HotspotScene, ScenePart } from "./scene3d";
import { Texts } from "./texts";

// The 3D model (scene3d.ts) with markers (a letter, a check mark or a label at every part that needs one) and buttons
// to turn and zoom it. The model is an application for assistive tech: the arrow keys turn it, Page Up/Down go from
// part to part and Enter chooses; the list of parts next to it is the same thing without a 3D view.

const STEP = Math.PI / 12;

export type Marker = { text: string; kind: "letter" | "pointed" | "chosen" | "label" };

export type View3DProps = {
  model: ModelDef | null;
  gltf: string;
  /** a glTF: the parts the setup lists (the names of the meshes or nodes) */
  known: string[];
  selectable: string[];
  chosen: string[];
  hover: string | null;
  focus: string | null;
  hidden: string[];
  explode: number;
  cut: number;
  markers: Record<string, Marker>;
  texts: Texts;
  label: string;
  keysHelp: string;
  idPrefix: string;
  /** a click in the model; `previous`: the part the click before on the same spot chose (the candidate meant the one behind) */
  onPick: (id: string | null, previous: string | null) => void;
  /** the part a click would choose; `behind`: another click there chooses a part behind it */
  onHover: (id: string | null, behind: boolean) => void;
  /** Page Down / Page Up: the next or previous part */
  onStep: (by: number) => void;
  /** Enter or space on the model: choose the part that has the focus */
  onActivate: () => void;
  /** a glTF loaded: the parts in it */
  onParts?: (parts: ScenePart[]) => void;
  /** the scene, for dropping a label on the model; null without WebGL */
  sceneRef?: { current: HotspotScene | null };
  height?: number;
};

const MARKER_STYLE: Record<Marker["kind"], string> = {
  letter: "border-slate-400 bg-white/95 text-slate-900",
  pointed: "border-slate-900 bg-slate-900 text-white",
  chosen: "border-[#0b4f8a] bg-[#0b4f8a] text-white",
  label: "border-amber-700 bg-amber-50 text-amber-950",
};

const View3D = (props: View3DProps) => {
  const { model, gltf, known, selectable, chosen, hover, focus, hidden, explode, cut, markers, texts: t, label, keysHelp, idPrefix } = props;
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const scene = useRef<HotspotScene | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState<"" | "loading" | "failed">("");
  const [turns, setTurns] = useState(0);
  const latest = useRef(props);
  latest.current = props;

  /**
   * The markers follow their parts after every frame. A marker is a dot on the part and a tag next to it; tags that
   * would cover each other move aside (the important ones first), with a line from the dot to the tag.
   */
  const positionMarkers = () => {
    const s = scene.current, o = overlay.current;
    if (!s || !o) return;
    const rank: Record<string, number> = { pointed: 0, chosen: 1, label: 2, letter: 3 };
    const items = (Array.from(o.children) as HTMLElement[])
      .map((el) => ({ el, at: s.markerOf(el.dataset.part ?? ""), rank: rank[el.dataset.kind ?? "letter"] ?? 3 }))
      .sort((a, b) => a.rank - b.rank);
    const taken: { x: number; y: number; w: number; h: number }[] = [];
    const overlaps = (r: { x: number; y: number; w: number; h: number }) => taken.some((q) => r.x < q.x + q.w + 2 && q.x < r.x + r.w + 2 && r.y < q.y + q.h + 2 && q.y < r.y + r.h + 2);
    for (const { el, at } of items) {
      el.style.display = at ? "" : "none";
      if (!at) continue;
      el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
      const tag = el.querySelector<HTMLElement>("[data-tag]"), line = el.querySelector<HTMLElement>("[data-line]");
      if (!tag || !line) continue;
      const w = tag.offsetWidth, h = tag.offsetHeight;
      const right = 8, left = -w - 8;
      const tries = [[right, -h - 6], [left, -h - 6], [right, 6], [left, 6], [right, -2 * h - 10], [left, -2 * h - 10], [right, h + 10], [left, h + 10], [right, -3 * h - 14], [left, -3 * h - 14]];
      let [dx, dy] = tries[0];
      for (const [tx, ty] of tries) {
        if (!overlaps({ x: at.x + tx, y: at.y + ty, w, h })) {
          [dx, dy] = [tx, ty];
          break;
        }
      }
      taken.push({ x: at.x + dx, y: at.y + dy, w, h });
      tag.style.left = `${dx}px`;
      tag.style.top = `${dy}px`;
      // the line to the nearest point of the tag
      const nx = Math.max(dx, Math.min(0, dx + w)), ny = Math.max(dy, Math.min(0, dy + h));
      const length = Math.hypot(nx, ny);
      line.style.width = `${Math.max(0, length - 4)}px`;
      line.style.transform = `rotate(${Math.atan2(ny, nx)}rad)`;
    }
  };

  useEffect(() => {
    if (!host.current) return;
    // the browser took the context away (not dispose() below, which loses it on purpose)
    const lost = () => setFailed(true);
    try {
      const s = new HotspotScene(host.current);
      scene.current = s;
      if (props.sceneRef) props.sceneRef.current = s;
      s.onPick = (id, previous) => latest.current.onPick(id, previous);
      s.onHover = (id, behind) => latest.current.onHover(id, behind);
      s.onDraw = positionMarkers;
      s.canvas.addEventListener("webglcontextlost", lost);
      (host.current as any).hotspotScene = s; // for tests: picking and the pose of the model
    } catch {
      setFailed(true);
    }
    return () => {
      scene.current?.canvas.removeEventListener("webglcontextlost", lost);
      scene.current?.dispose();
      scene.current = null;
      if (props.sceneRef) props.sceneRef.current = null;
    };
  }, []);

  // the model: built in, or the author's file
  useEffect(() => {
    const s = scene.current;
    if (!s) return;
    // what was set before the model came in
    const applyAll = () => {
      const p = latest.current;
      s.setSelectable(p.selectable);
      s.setHidden(p.hidden);
      s.setExplode(p.explode);
      s.setCut(p.cut);
      s.setHighlight(p.hover, p.focus, p.chosen);
    };
    if (!gltf && model) {
      s.setModel(model);
      applyAll();
      setLoading("");
      return;
    }
    if (!gltf) return;
    let gone = false;
    setLoading("loading");
    s.loadGltf(gltf, known)
      .then((parts) => {
        if (gone) return;
        setLoading("");
        applyAll();
        latest.current.onParts?.(parts);
      })
      .catch(() => !gone && setLoading("failed"));
    return () => {
      gone = true;
    };
  }, [model, gltf, known.join(" ")]);

  useEffect(() => scene.current?.setSelectable(selectable), [selectable.join(" ")]);
  useEffect(() => scene.current?.setHighlight(hover, focus, chosen), [hover, focus, chosen.join(" ")]);
  useEffect(() => scene.current?.setHidden(hidden), [hidden.join(" ")]);
  useEffect(() => scene.current?.setExplode(explode), [explode]);
  useEffect(() => scene.current?.setCut(cut), [cut]);
  useLayoutEffect(positionMarkers);

  const turn = (dx: number, dy: number) => {
    scene.current?.rotate(dx, dy);
    setTurns((n) => n + 1);
  };
  const reset = () => {
    scene.current?.resetView();
    setTurns(0);
  };
  const keyDown = (e: KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowLeft: () => turn(-STEP, 0), ArrowRight: () => turn(STEP, 0), ArrowUp: () => turn(0, -STEP), ArrowDown: () => turn(0, STEP),
      "+": () => scene.current?.zoomBy(1.2), "=": () => scene.current?.zoomBy(1.2), "-": () => scene.current?.zoomBy(1 / 1.2),
      Home: reset, PageDown: () => props.onStep(1), PageUp: () => props.onStep(-1), Enter: props.onActivate, " ": props.onActivate,
    };
    const action = !e.ctrlKey && !e.metaKey && !e.altKey ? keys[e.key] : undefined;
    if (action) {
      e.preventDefault();
      action();
    }
  };

  const height = props.height ?? 380;
  if (failed) {
    return (
      <div style={{ height: `${Math.round(height / 2)}px` }} className="grid place-items-center rounded-xl border border-amber-300 bg-amber-50 p-4 text-center text-sm text-amber-900" data-testid="model" data-view="none" role="note">
        {t.noWebgl}
      </div>
    );
  }
  const button = "grid size-8 place-items-center rounded-lg border border-slate-300 bg-white/95 text-slate-700 shadow-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-700";
  return (
    <div className="relative">
      <div ref={host} role="application" aria-roledescription={t.model3d} tabIndex={0} aria-label={label} aria-describedby={`${idPrefix}-keys`}
        data-testid="model" data-view="3d" data-turns={turns} data-loading={loading} onKeyDown={keyDown}
        onBlur={() => props.onHover(null, false)}
        style={{ height: `${height}px` }}
        className="w-full cursor-grab overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-200/70 outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2 active:cursor-grabbing" />
      <div ref={overlay} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
        {Object.entries(markers).map(([id, m]) => (
          <div key={id} data-part={id} data-kind={m.kind} className="absolute left-0 top-0" style={{ display: "none" }}>
            <span data-line className="absolute left-0 top-0 h-[1.5px] origin-left bg-slate-700/80" />
            <span className="absolute -left-[5px] -top-[5px] size-[10px] rounded-full border-2 border-white bg-slate-900 shadow" />
            <span data-tag className={`absolute left-[8px] top-[-28px] whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-semibold shadow-sm ${MARKER_STYLE[m.kind]} ${m.kind === "pointed" ? "outline-2 outline-dashed outline-offset-1 outline-slate-900" : ""}`}>
              {m.text}
            </span>
          </div>
        ))}
      </div>
      <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-white/85 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-600" data-testid="schematic">
        {t.schematic}
      </span>
      {loading && (
        <p className={`absolute inset-x-4 top-1/2 m-0 -translate-y-1/2 rounded-lg p-3 text-center text-sm ${loading === "failed" ? "bg-amber-50 text-amber-900" : "text-slate-600"}`} role={loading === "failed" ? "alert" : undefined} data-testid="loading">
          {loading === "failed" ? t.loadFailed : t.loading}
        </p>
      )}
      <div className="absolute bottom-2 right-2 flex gap-1">
        <button type="button" className={button} aria-label={t.rotateLeft} title={t.rotateLeft} onClick={() => turn(-STEP, 0)}>←</button>
        <button type="button" className={button} aria-label={t.rotateUp} title={t.rotateUp} onClick={() => turn(0, -STEP)}>↑</button>
        <button type="button" className={button} aria-label={t.rotateDown} title={t.rotateDown} onClick={() => turn(0, STEP)}>↓</button>
        <button type="button" className={button} aria-label={t.rotateRight} title={t.rotateRight} onClick={() => turn(STEP, 0)}>→</button>
        <button type="button" className={button} aria-label={t.zoomIn} title={t.zoomIn} onClick={() => scene.current?.zoomBy(1.2)}>+</button>
        <button type="button" className={button} aria-label={t.zoomOut} title={t.zoomOut} onClick={() => scene.current?.zoomBy(1 / 1.2)}>−</button>
        <button type="button" className={button} aria-label={t.resetView} title={t.resetView} onClick={reset}>⟲</button>
      </div>
      <p id={`${idPrefix}-keys`} className="sr-only">{keysHelp}</p>
    </div>
  );
};

export default View3D;
