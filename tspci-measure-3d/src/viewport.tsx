import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { Built, Vec3 } from "./geometry";
import { Drawn, MeasureScene, Pick } from "./scene3d";
import { Texts } from "./texts";

// The 3D scene in the page: a focusable application the arrow keys turn, buttons to turn and zoom, the canvas of
// MeasureScene, and a message without WebGL. The scene object hangs on the element (measureScene) for tests.

const ICONS: Record<string, string> = {
  left: "M15 6l-6 6 6 6",
  right: "M9 6l6 6-6 6",
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  zoomIn: "M12 6v12M6 12h12",
  zoomOut: "M6 12h12",
  reset: "M4 12a8 8 0 1 0 3-6.2M4 4v4h4",
};

const ViewButton = ({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) => (
  <button type="button" aria-label={label} title={label} onClick={onClick}
    className="grid size-8 cursor-pointer place-items-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-700">
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={ICONS[icon]} />
    </svg>
  </button>
);

export const Viewport = ({ built, drawn, pending, picking, showPointLabels, height, texts: t, onPick, label, badge, reducedMotion }: {
  built: Built;
  drawn: Drawn[];
  pending: Vec3[];
  picking: "point" | "face" | "none";
  showPointLabels: boolean;
  height: number;
  texts: Texts;
  onPick: (pick: Pick) => void;
  label: string;
  badge?: string;
  reducedMotion: boolean;
}) => {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<MeasureScene | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const [webgl, setWebgl] = useState(true);

  useLayoutEffect(() => {
    if (!host.current) return;
    try {
      scene.current = new MeasureScene(host.current, (p) => pick.current(p));
      scene.current.canvas.addEventListener("webglcontextlost", () => setWebgl(false));
      (host.current as any).measureScene = scene.current;
    } catch {
      setWebgl(false); // no WebGL: the message, and the lists do the measuring
      return;
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
      if (host.current) (host.current as any).measureScene = null;
    };
  }, [webgl]);

  // layout effects: a click right after a change of tool already picks what the new tool needs
  useLayoutEffect(() => { scene.current?.setScene(built); }, [built, webgl]);
  useLayoutEffect(() => { scene.current?.setOptions({ showPointLabels, picking, reducedMotion }); }, [showPointLabels, picking, reducedMotion, webgl]);
  useLayoutEffect(() => { scene.current?.setMeasurements(drawn, pending); });

  const view = (f: (s: MeasureScene) => void) => () => scene.current && f(scene.current);
  const onKeyDown = (e: KeyboardEvent) => {
    const s = scene.current;
    if (!s) return;
    const step = e.shiftKey ? 45 : 15;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => s.turn(-step, 0),
      ArrowRight: () => s.turn(step, 0),
      ArrowUp: () => s.turn(0, step),
      ArrowDown: () => s.turn(0, -step),
      "+": () => s.zoom(0.8),
      "=": () => s.zoom(0.8),
      "-": () => s.zoom(1.25),
      Home: () => s.resetView(),
      "0": () => s.resetView(),
    };
    const action = actions[e.key];
    if (!action) return;
    e.preventDefault();
    action();
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-sky-50 to-white" style={{ height: `${height}px` }}>
      {webgl ? (
        <div ref={host} data-testid="viewport" role="application" tabIndex={0} aria-label={label} aria-roledescription={t.scene}
          onKeyDown={onKeyDown} className="m3d-viewport absolute inset-0 focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-sky-700" />
      ) : (
        <div data-testid="no-webgl" role="note" className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-slate-700">
          <p className="m-0 max-w-[46ch] rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">{t.noWebgl}</p>
        </div>
      )}
      {badge && (
        <div data-testid="scale" className="pointer-events-none absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">
          {badge}
        </div>
      )}
      {webgl && (
        <div role="group" aria-label={t.scene} className="absolute right-2 top-2 flex flex-col gap-0.5 rounded-xl bg-white/90 p-1 shadow-sm ring-1 ring-slate-200 backdrop-blur">
          <div className="flex">
            <ViewButton icon="left" label={t.view.left} onClick={view((s) => s.turn(-15, 0))} />
            <ViewButton icon="right" label={t.view.right} onClick={view((s) => s.turn(15, 0))} />
          </div>
          <div className="flex">
            <ViewButton icon="up" label={t.view.up} onClick={view((s) => s.turn(0, 15))} />
            <ViewButton icon="down" label={t.view.down} onClick={view((s) => s.turn(0, -15))} />
          </div>
          <div className="flex">
            <ViewButton icon="zoomIn" label={t.view.zoomIn} onClick={view((s) => s.zoom(0.8))} />
            <ViewButton icon="zoomOut" label={t.view.zoomOut} onClick={view((s) => s.zoom(1.25))} />
          </div>
          <div className="flex justify-center">
            <ViewButton icon="reset" label={t.view.reset} onClick={view((s) => s.resetView())} />
          </div>
        </div>
      )}
    </div>
  );
};

export const usePrefersReducedMotion = () => {
  const query = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const [reduced, setReduced] = useState(query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const listener = () => setReduced(query.matches);
    query.addEventListener?.("change", listener);
    return () => query.removeEventListener?.("change", listener);
  }, []);
  return reduced;
};
