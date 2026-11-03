import { useEffect, useRef, useState } from "preact/hooks";
import { Part } from "./assembly";
import { AssemblyScene } from "./scene3d";
import { Texts } from "./texts";

/** Whether the candidate asked for less motion (the parts then jump to their place). */
export const useReducedMotion = () => {
  const query = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const [reduced, setReduced] = useState(!!query?.matches);
  useEffect(() => {
    if (!query) return;
    const change = () => setReduced(query.matches);
    query.addEventListener?.("change", change);
    return () => query.removeEventListener?.("change", change);
  }, []);
  return reduced;
};

const STEP = Math.PI / 12; // 15° per arrow key

const iconButton =
  "grid size-8 place-items-center rounded-md border border-slate-200 bg-white/90 text-slate-700 shadow-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600";

/**
 * The 3D view (scene3d.ts) with its own buttons to turn and zoom. The view itself is focusable: the arrow keys turn
 * it, + and − zoom, 0 resets. Without WebGL a message: the parts list does everything the view does.
 */
const View3D = ({ parts, assembled, highlight, gltf, interactive, texts: t, onPick, onHover, testid = "view" }: {
  parts: Part[];
  assembled: Set<string>;
  highlight: string | null;
  gltf: string;
  interactive: boolean;
  texts: Texts;
  onPick: (id: string) => void;
  onHover: (id: string | null) => void;
  testid?: string;
}) => {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<AssemblyScene | null>(null);
  const [webgl, setWebgl] = useState(true);
  const [gltfFailed, setGltfFailed] = useState(false);
  const reducedMotion = useReducedMotion();
  // the scene calls back into the latest handlers
  const handlers = useRef({ onPick, onHover });
  handlers.current = { onPick, onHover };

  useEffect(() => {
    if (!host.current) return;
    try {
      scene.current = new AssemblyScene(host.current, {
        onPick: (id) => handlers.current.onPick(id),
        onHover: (id) => handlers.current.onHover(id),
        onGltfFailed: () => setGltfFailed(true),
      });
      (host.current as any).__assemblyScene = scene.current; // for tests
    } catch {
      setWebgl(false);
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    setGltfFailed(false);
  }, [gltf]);

  useEffect(() => {
    scene.current?.update({ parts, assembled, highlight, reducedMotion, gltf, interactive });
  });

  const onKey = (e: KeyboardEvent) => {
    const s = scene.current;
    if (!s) return;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => s.turn(-STEP, 0),
      ArrowRight: () => s.turn(STEP, 0),
      ArrowUp: () => s.turn(0, -STEP),
      ArrowDown: () => s.turn(0, STEP),
      "+": () => s.turn(0, 0, 0.85),
      "=": () => s.turn(0, 0, 0.85),
      "-": () => s.turn(0, 0, 1 / 0.85),
      "0": () => s.resetView(),
      Home: () => s.resetView(),
    };
    const run = keys[e.key];
    if (run) {
      e.preventDefault();
      run();
    }
  };

  if (!webgl) {
    return (
      <p className="m-0 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="note" data-testid="no-webgl">
        {t.noWebgl}
      </p>
    );
  }
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-stone-100">
      <div ref={host} tabIndex={0} role="application" aria-roledescription="3D" aria-label={t.view3d} aria-describedby={`${testid}-help`}
        onKeyDown={onKey as any} data-testid={testid}
        className="asm-view aspect-[16/11] min-h-[280px] w-full focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-sky-600" />
      <p id={`${testid}-help`} className="sr-only">{t.viewHelp}</p>
      <div className="absolute right-2 top-2 flex gap-1">
        <button type="button" className={iconButton} aria-label={t.turnLeft} title={t.turnLeft} onClick={() => scene.current?.turn(-STEP * 2, 0)}>
          <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true"><path d="M7 5H3v4M3.5 8.5A7 7 0 1 1 5 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
        </button>
        <button type="button" className={iconButton} aria-label={t.turnRight} title={t.turnRight} onClick={() => scene.current?.turn(STEP * 2, 0)}>
          <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true"><path d="M13 5h4v4M16.5 8.5A7 7 0 1 0 15 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
        </button>
        <button type="button" className={iconButton} aria-label={t.zoomIn} title={t.zoomIn} onClick={() => scene.current?.turn(0, 0, 0.8)}>
          <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true"><path d="M10 4v12M4 10h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
        </button>
        <button type="button" className={iconButton} aria-label={t.zoomOut} title={t.zoomOut} onClick={() => scene.current?.turn(0, 0, 1.25)}>
          <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true"><path d="M4 10h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
        </button>
        <button type="button" className={iconButton} aria-label={t.resetView} title={t.resetView} onClick={() => scene.current?.resetView()} data-testid={`${testid}-reset`}>
          <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true"><circle cx="10" cy="10" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8" /><circle cx="10" cy="10" r="1.6" fill="currentColor" /></svg>
        </button>
      </div>
      {gltfFailed && (
        <p className="absolute inset-x-2 bottom-2 m-0 rounded-md bg-amber-50/95 px-3 py-1.5 text-xs text-amber-900" role="note" data-testid="gltf-failed">{t.gltfFailed}</p>
      )}
    </div>
  );
};

export default View3D;
