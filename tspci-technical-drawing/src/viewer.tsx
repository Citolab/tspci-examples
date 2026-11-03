import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { paintOrder, solidPolygons } from "./csg";
import { Feature, V3, ViewName, arrange, boundsOf, primitivesOf } from "./model";
import { Camera, DEFAULT_CAMERA, ModelScene } from "./scene3d";
import { Texts } from "./texts";

// The 3D model next to the drawing: turn it with the mouse, touch or keys, or the buttons; see it from the front, the
// top or the left. With several workpieces (the model task) a click on one chooses it (raycasting). Without WebGL the
// same model as an SVG picture, painted back to front.

const VIEW_CAMERA: Record<ViewName, Camera> = {
  front: { yaw: 0, pitch: 0, zoom: 1 },
  top: { yaw: 0, pitch: 90, zoom: 1 },
  left: { yaw: -90, pitch: 0, zoom: 1 },
};
const clampCamera = (c: Camera): Camera => ({
  yaw: ((((c.yaw + 180) % 360) + 360) % 360) - 180,
  pitch: Math.max(-30, Math.min(90, c.pitch)),
  zoom: Math.max(0.6, Math.min(3, c.zoom)),
});

export const usePrefersReducedMotion = () => {
  const query = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const [reduced, setReduced] = useState(query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const change = () => setReduced(query.matches);
    query.addEventListener?.("change", change);
    return () => query.removeEventListener?.("change", change);
  }, []);
  return reduced;
};

type Props = {
  workpieces: Feature[][];
  labels: string[];
  selected: number | null;
  onPick?: (index: number) => void;
  texts: Texts;
  announce: (message: string) => void;
  /** "3d" (2D without WebGL) or "2d": always the SVG picture */
  mode: "3d" | "2d";
  height?: number;
};

const button = "td-focus rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 hover:bg-slate-50";

export const ModelViewer = (p: Props) => {
  const t = p.texts;
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ModelScene | null>(null);
  const [webgl, setWebgl] = useState(p.mode === "3d");
  const [camera, setCameraState] = useState<Camera>(DEFAULT_CAMERA);
  const cameraRef = useRef(camera);
  const reduced = usePrefersReducedMotion();
  const animation = useRef(0);
  const key = JSON.stringify(p.workpieces);

  const setCamera = (c: Camera) => {
    cameraRef.current = clampCamera(c);
    setCameraState(cameraRef.current);
  };
  /** Turns to a camera: at once with reduced motion, else in a quarter of a second. */
  const goTo = (target: Camera, say = true) => {
    cancelAnimationFrame(animation.current);
    const from = cameraRef.current;
    const announce = () => say && p.announce(t.cameraAt(Math.round(target.yaw), Math.round(target.pitch)));
    if (reduced) { setCamera(target); announce(); return; }
    let dyaw = target.yaw - from.yaw;
    if (dyaw > 180) dyaw -= 360;
    if (dyaw < -180) dyaw += 360;
    const t0 = performance.now();
    const step = () => {
      const s = Math.min(1, (performance.now() - t0) / 250);
      const e = s * (2 - s);
      setCamera({ yaw: from.yaw + dyaw * e, pitch: from.pitch + (target.pitch - from.pitch) * e, zoom: from.zoom + (target.zoom - from.zoom) * e });
      if (s < 1) animation.current = requestAnimationFrame(step);
      else announce();
    };
    step();
  };

  useEffect(() => {
    if (!webgl || !host.current) return;
    try {
      scene.current = new ModelScene(host.current, p.workpieces, p.labels, t.frontArrow);
      scene.current.canvas.addEventListener("webglcontextlost", () => setWebgl(false));
      scene.current.setCamera(cameraRef.current);
      scene.current.setSelected(p.selected);
    } catch {
      setWebgl(false); // no WebGL: the SVG picture
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, [webgl, key]);
  useEffect(() => scene.current?.setCamera(camera), [camera]);
  useEffect(() => scene.current?.setSelected(p.selected), [p.selected]);
  useEffect(() => () => cancelAnimationFrame(animation.current), []);

  // pointers: one drags to turn, two pinch to zoom; a click without dragging picks a workpiece
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  const pinch = useRef(0);
  const onPointerDown = (e: PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = 0;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    const last = pointers.current.get(e.pointerId);
    if (!last) return;
    const dx = e.clientX - last.x, dy = e.clientY - last.y;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current += Math.abs(dx) + Math.abs(dy);
    const c = cameraRef.current;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current > 0) setCamera({ ...c, zoom: c.zoom * (d / pinch.current) });
      pinch.current = d;
      return;
    }
    setCamera({ ...c, yaw: c.yaw - dx * 0.5, pitch: c.pitch + dy * 0.5 });
  };
  const onPointerUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (moved.current < 5 && p.onPick) {
      const index = scene.current ? scene.current.pick(e.clientX, e.clientY) : pickFallback(e);
      if (index !== null && index !== undefined) p.onPick(index);
    }
  };
  const pickFallback = (e: PointerEvent): number | null => {
    const target = (e.target as Element).closest?.("[data-model]");
    return target ? Number(target.getAttribute("data-model")) : null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const c = cameraRef.current;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => goTo({ ...c, yaw: c.yaw + 15 }), ArrowRight: () => goTo({ ...c, yaw: c.yaw - 15 }),
      ArrowUp: () => goTo({ ...c, pitch: c.pitch + 15 }), ArrowDown: () => goTo({ ...c, pitch: c.pitch - 15 }),
      "+": () => goTo({ ...c, zoom: c.zoom * 1.2 }), "=": () => goTo({ ...c, zoom: c.zoom * 1.2 }), "-": () => goTo({ ...c, zoom: c.zoom / 1.2 }),
      "0": () => goTo(DEFAULT_CAMERA), Home: () => goTo(DEFAULT_CAMERA),
      "1": () => goTo(VIEW_CAMERA.front), "2": () => goTo(VIEW_CAMERA.top), "3": () => goTo(VIEW_CAMERA.left),
    };
    const action = keys[e.key];
    if (action) { e.preventDefault(); action(); }
  };

  const c = camera;
  return (
    <div className="flex w-full flex-col gap-2" data-testid="model">
      <div ref={host} tabIndex={0} role="application" aria-roledescription={t.model} aria-label={`${t.model}. ${t.modelHelp}`}
        data-testid="model-picture" data-view={webgl ? "3d" : "2d"} data-yaw={Math.round(c.yaw)} data-pitch={Math.round(c.pitch)}
        className="td-focus relative w-full overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100"
        style={{ height: `${p.height ?? 300}px`, touchAction: "none", cursor: "grab" }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={onKeyDown}>
        {!webgl && <Fallback workpieces={p.workpieces} labels={p.labels} selected={p.selected} camera={c} />}
        {!webgl && p.mode === "3d" && <p className="absolute bottom-1 left-2 right-2 m-0 text-xs text-slate-600">{t.noWebgl}</p>}
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label={t.model}>
        <button type="button" className={button} aria-label={t.rotateLeft} title={t.rotateLeft} onClick={() => goTo({ ...c, yaw: c.yaw + 15 })}>⟲</button>
        <button type="button" className={button} aria-label={t.rotateRight} title={t.rotateRight} onClick={() => goTo({ ...c, yaw: c.yaw - 15 })}>⟳</button>
        <button type="button" className={button} aria-label={t.rotateUp} title={t.rotateUp} onClick={() => goTo({ ...c, pitch: c.pitch + 15 })}>↑</button>
        <button type="button" className={button} aria-label={t.rotateDown} title={t.rotateDown} onClick={() => goTo({ ...c, pitch: c.pitch - 15 })}>↓</button>
        <button type="button" className={button} aria-label={t.zoomIn} title={t.zoomIn} onClick={() => goTo({ ...c, zoom: c.zoom * 1.2 })}>+</button>
        <button type="button" className={button} aria-label={t.zoomOut} title={t.zoomOut} onClick={() => goTo({ ...c, zoom: c.zoom / 1.2 })}>−</button>
        <button type="button" className={button} onClick={() => goTo(DEFAULT_CAMERA)}>{t.reset}</button>
        {(["front", "top", "left"] as ViewName[]).map((v) => (
          <button key={v} type="button" className={button} onClick={() => goTo(VIEW_CAMERA[v])}>{t.fromView[v]}</button>
        ))}
      </div>
    </div>
  );
};

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The workpieces in SVG: the faces turned to the viewer, back to front (a BSP tree), shaded by a light. */
const Fallback = ({ workpieces, labels, selected, camera }: { workpieces: Feature[][]; labels: string[]; selected: number | null; camera: Camera }) => {
  const models = useMemo(() => {
    const spans = workpieces.map((f) => boundsOf(f));
    const offsets = arrange(spans);
    return workpieces.map((f, i) => {
      const b = spans[i];
      const offset: V3 = [offsets[i][0] + b.min[0], offsets[i][1] + b.min[1], offsets[i][2] + b.min[2]];
      return { polygons: solidPolygons(primitivesOf(f), 24), offset: offsets[i], min: offset, size: [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]] };
    });
  }, [JSON.stringify(workpieces)]);
  const y = (camera.yaw * Math.PI) / 180, pt = (Math.min(89.9, camera.pitch) * Math.PI) / 180;
  const toCamera: V3 = [Math.sin(y) * Math.cos(pt), -Math.cos(y) * Math.cos(pt), Math.sin(pt)];
  const right: V3 = [Math.cos(y), Math.sin(y), 0];
  const up: V3 = [toCamera[1] * right[2] - toCamera[2] * right[1], toCamera[2] * right[0] - toCamera[0] * right[2], toCamera[0] * right[1] - toCamera[1] * right[0]];
  const light: V3 = [-0.45, -0.55, 0.7];
  const dir: V3 = [-toCamera[0], -toCamera[1], -toCamera[2]];
  const shapes: { d: string; fill: string; model: number }[] = [];
  let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  models.forEach((m, i) => {
    for (const poly of paintOrder(m.polygons, dir)) {
      const pts = poly.vertices.map((v) => {
        const q: V3 = [v[0] + m.offset[0], v[1] + m.offset[1], v[2] + m.offset[2]];
        const sx = dot(q, right), sy = -dot(q, up);
        lo = [Math.min(lo[0], sx), Math.min(lo[1], sy)];
        hi = [Math.max(hi[0], sx), Math.max(hi[1], sy)];
        return `${sx.toFixed(2)},${sy.toFixed(2)}`;
      });
      const shade = 0.55 + 0.45 * Math.max(0, dot(poly.normal, light) / Math.hypot(...light));
      const base = i === selected ? [150, 180, 230] : [200, 210, 222];
      shapes.push({ d: pts.join(" "), fill: `rgb(${base.map((c) => Math.round(c * shade)).join(",")})`, model: i });
    }
  });
  const pad = 0.12 * Math.max(hi[0] - lo[0], hi[1] - lo[1]);
  return (
    <svg viewBox={`${lo[0] - pad} ${lo[1] - pad} ${hi[0] - lo[0] + 2 * pad} ${hi[1] - lo[1] + 2 * pad}`} className="h-full w-full" aria-hidden="true">
      {shapes.map((s, i) => <polygon key={i} points={s.d} fill={s.fill} stroke={s.fill} stroke-width={0.3} stroke-linejoin="round" data-model={s.model} />)}
      {labels.map((l, i) => {
        const m = models[i];
        const c: V3 = [m.min[0] + m.size[0] / 2, m.min[1] + m.size[1] / 2, m.min[2] + m.size[2] * 1.35];
        return l ? <text key={l} x={dot(c, right)} y={-dot(c, up)} text-anchor="middle" font-size={pad * 0.9} className="fill-slate-900 font-sans font-semibold">{i === selected ? `✓ ${l}` : l}</text> : null;
      })}
    </svg>
  );
};
