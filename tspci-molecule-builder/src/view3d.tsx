import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Molecule, geometryAtoms } from "./molecule";
import { Vec, layout3d } from "./geometry";
import { MoleculeScene, Pick } from "./scene3d";
import { Texts } from "./texts";

// The 3D model of the molecule (scene3d.ts) with its VSEPR layout (geometry.ts), and buttons to turn and zoom it.
// The model is an application for assistive tech: the arrow keys turn it, the builder's keys work as everywhere.

const STEP = Math.PI / 12;

export type View3DProps = {
  molecule: Molecule;
  selected: number | null;
  connectFrom: number | null;
  reducedMotion: boolean;
  texts: Texts;
  label: string;
  onPick: (pick: Pick) => void;
  /** the builder's keys (adding atoms, connecting, deleting …) */
  onKeyDown: (e: KeyboardEvent) => void;
  /** PageUp/PageDown: the previous or next atom */
  onStep: (by: number) => void;
  onNoWebgl: () => void;
  idPrefix: string;
};

const View3D = ({ molecule, selected, connectFrom, reducedMotion, texts: t, label, onPick, onKeyDown, onStep, onNoWebgl, idPrefix }: View3DProps) => {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<MoleculeScene | null>(null);
  const previous = useRef<Map<number, Vec> | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [turns, setTurns] = useState(0);
  const pick = useRef(onPick);
  pick.current = onPick;

  // the layout starts where the atoms were, so the model does not jump while the candidate builds
  const positions = useMemo(() => {
    const p = layout3d(geometryAtoms(molecule), molecule.bonds, previous.current);
    previous.current = p;
    return p;
  }, [molecule]);

  useEffect(() => {
    if (!host.current) return;
    // the browser took the context away (not dispose() below, which loses it on purpose)
    const lost = () => {
      setFailed(true);
      onNoWebgl();
    };
    try {
      scene.current = new MoleculeScene(host.current);
      scene.current.onPick = (p) => pick.current(p);
      scene.current.canvas.addEventListener("webglcontextlost", lost);
      (host.current as any).moleculeScene = scene.current; // for tests: picking and the turn of the model
    } catch {
      setFailed(true);
      onNoWebgl();
    }
    return () => {
      scene.current?.canvas.removeEventListener("webglcontextlost", lost);
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    scene.current?.update({ molecule, positions, selected, connectFrom, reducedMotion });
  }, [molecule, positions, selected, connectFrom, reducedMotion]);

  const turn = (dx: number, dy: number) => {
    scene.current?.rotate(dx, dy);
    setTurns((n) => n + 1);
  };
  const keyDown = (e: KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowLeft: () => turn(-STEP, 0), ArrowRight: () => turn(STEP, 0), ArrowUp: () => turn(0, -STEP), ArrowDown: () => turn(0, STEP),
      "+": () => scene.current?.zoomBy(1.2), "=": () => scene.current?.zoomBy(1.2), "-": () => scene.current?.zoomBy(1 / 1.2),
      Home: () => (scene.current?.resetView(), setTurns(0)), PageDown: () => onStep(1), PageUp: () => onStep(-1),
    };
    const action = !e.ctrlKey && !e.metaKey && !e.altKey ? keys[e.key] : undefined;
    if (action) {
      e.preventDefault();
      action();
    } else onKeyDown(e);
  };

  if (failed) {
    return (
      <div className="grid h-[340px] place-items-center rounded-xl border border-amber-300 bg-amber-50 p-4 text-center text-sm text-amber-900" data-testid="model" data-view="none" role="note">
        {t.noWebgl}
      </div>
    );
  }
  const button = "grid size-8 place-items-center rounded-lg border border-slate-200 bg-white/90 text-slate-700 shadow-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-sky-600";
  return (
    <div className="relative">
      <div ref={host} role="application" aria-roledescription={t.view3d} tabIndex={0} aria-label={label} aria-describedby={`${idPrefix}-keys`}
        data-testid="model" data-view="3d" data-turns={turns} onKeyDown={keyDown}
        className="h-[340px] w-full cursor-grab overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-sky-600 active:cursor-grabbing" />
      {!molecule.atoms.length && <p className="pointer-events-none absolute inset-0 m-0 grid place-items-center p-4 text-center text-sm text-slate-500">{t.empty}</p>}
      <div className="absolute bottom-2 right-2 flex gap-1">
        <button type="button" className={button} aria-label={t.rotateLeft} title={t.rotateLeft} onClick={() => turn(-STEP, 0)}>←</button>
        <button type="button" className={button} aria-label={t.rotateUp} title={t.rotateUp} onClick={() => turn(0, -STEP)}>↑</button>
        <button type="button" className={button} aria-label={t.rotateDown} title={t.rotateDown} onClick={() => turn(0, STEP)}>↓</button>
        <button type="button" className={button} aria-label={t.rotateRight} title={t.rotateRight} onClick={() => turn(STEP, 0)}>→</button>
        <button type="button" className={button} aria-label={t.zoomIn} title={t.zoomIn} onClick={() => scene.current?.zoomBy(1.2)}>+</button>
        <button type="button" className={button} aria-label={t.zoomOut} title={t.zoomOut} onClick={() => scene.current?.zoomBy(1 / 1.2)}>−</button>
        <button type="button" className={button} aria-label={t.resetView} title={t.resetView} onClick={() => (scene.current?.resetView(), setTurns(0))}>⟲</button>
      </div>
    </div>
  );
};

export default View3D;
