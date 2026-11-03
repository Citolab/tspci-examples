// The 3D panel: the folded net (scene3d.ts), a slider to fold it step by step, Fold up / Unfold (animated unless
// the candidate prefers reduced motion) and a front view. The view itself takes the arrow keys (turn) and + / −
// (zoom). Without WebGL it says so, and the slider and the description still work.
import { useEffect, useRef, useState } from "preact/hooks";
import { Face, Solid } from "./net";
import { FaceLook, FoldScene } from "./scene3d";
import { Texts } from "./texts";

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

const button = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600";

export const FoldView = ({ faces, solid, looks, t, language, description, onPick, initial = 0, height = 300 }: {
  faces: Face[]; solid: Solid; looks: FaceLook[]; t: Texts; language: string;
  /** what the folded net is like, for the screen reader (and the result when the item shows it) */
  description: (progress: number) => string;
  onPick?: (face: number) => void;
  initial?: number;
  height?: number;
}) => {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<FoldScene | null>(null);
  const [webgl, setWebgl] = useState(true);
  const [progress, setProgress] = useState(initial);
  const animation = useRef(0);
  const reduced = usePrefersReducedMotion();
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    if (!host.current) return;
    try {
      scene.current = new FoldScene(host.current, (i) => pick.current?.(i));
      scene.current.canvas.addEventListener("webglcontextlost", () => setWebgl(false));
      (host.current as any).__scene = scene.current; // for tests and screenshots
    } catch {
      setWebgl(false);
      return;
    }
    return () => {
      cancelAnimationFrame(animation.current);
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    scene.current?.setFaces(faces, solid, looks);
  }, [JSON.stringify(faces), solid, JSON.stringify(looks)]);

  useEffect(() => {
    scene.current?.setProgress(progress / 100);
  }, [progress]);

  const animateTo = (target: number) => {
    cancelAnimationFrame(animation.current);
    if (reduced) return setProgress(target);
    const from = progress, start = performance.now(), duration = 1100 * Math.abs(target - from) / 100;
    const step = (now: number) => {
      const k = duration ? Math.min(1, (now - start) / duration) : 1;
      const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      setProgress(Math.round((from + (target - from) * eased) * 10) / 10);
      if (k < 1) animation.current = requestAnimationFrame(step);
    };
    animation.current = requestAnimationFrame(step);
  };

  const keydown = (e: KeyboardEvent) => {
    const s = scene.current;
    if (!s) return;
    const turn = Math.PI / 12;
    if (e.key === "ArrowLeft") s.rotate(-turn, 0);
    else if (e.key === "ArrowRight") s.rotate(turn, 0);
    else if (e.key === "ArrowUp") s.rotate(0, turn);
    else if (e.key === "ArrowDown") s.rotate(0, -turn);
    else if (e.key === "+" || e.key === "=") s.zoom(1 / 1.15);
    else if (e.key === "-" || e.key === "_") s.zoom(1.15);
    else if (e.key === "Home") s.resetView();
    else return;
    e.preventDefault();
  };

  const rounded = Math.round(progress);
  return (
    <div className="flex w-full flex-col gap-2" data-testid="fold-view" data-progress={rounded}>
      <div role="application" aria-roledescription={t.view3d} aria-label={`${t.view3d}: ${description(rounded)}`} aria-describedby="nf-help" tabIndex={0}
        onKeyDown={keydown} data-view={webgl ? "3d" : "none"}
        className="nf-view relative w-full overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-sky-50 to-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
        style={{ height }}>
        <div ref={host} className="h-full w-full" data-testid="scene" />
        {!webgl && <p className="absolute inset-0 m-0 flex items-center justify-center p-6 text-center text-sm text-slate-600" data-testid="no-webgl">{t.noWebgl}</p>}
        <span id="nf-help" className="sr-only">{t.view3dHelp}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex w-full items-center gap-2 text-sm text-slate-700">
          <span>{t.foldSlider}</span>
          <input type="range" min={0} max={100} step={1} value={rounded} className="nf-range flex-1 accent-sky-700" aria-valuetext={t.foldValue(rounded, language)}
            onInput={(e) => { cancelAnimationFrame(animation.current); setProgress(Number((e.target as HTMLInputElement).value)); }} />
          <span className="w-12 text-right tabular-nums text-slate-500" aria-hidden="true">{rounded}%</span>
        </label>
        <button type="button" className={button} onClick={() => animateTo(100)} disabled={rounded >= 100}>{t.foldAll}</button>
        <button type="button" className={button} onClick={() => animateTo(0)} disabled={rounded <= 0}>{t.unfold}</button>
        <button type="button" className={button} onClick={() => scene.current?.resetView()} disabled={!webgl}>{t.resetView}</button>
      </div>
    </div>
  );
};
