import { useEffect, useRef, useState } from "preact/hooks";
import {
  ELEMENTS, ElementSymbol, Molecule, addAtom, atomById, atomInDirection, bondsOf, elementCounts, freeValence, FormulaOrder, displayParts,
  lonePairs, moveAtom, neighbours, nextOrder, other, removeAtom, setBond, shapeOf,
} from "./molecule";
import { idealAngle } from "./geometry";
import { Texts, formatNumber } from "./texts";
import View2D from "./view2d";
import View3D from "./view3d";
import type { Pick } from "./scene3d";

// The builder, for the candidate and for the author's correct molecule: the palette, the actions, the 3D model and
// the structural formula (tabs), the formula and free bonds, and a live status line for every step.

let instances = 0;

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

export type View = "3d" | "2d";

export type BuilderProps = {
  molecule: Molecule;
  onChange: (next: Molecule) => void;
  elements: ElementSymbol[];
  texts: Texts;
  showFormula: boolean;
  showValence: boolean;
  readOnly: boolean;
  view: View;
  maxAtoms: number;
  /** the item's prompt, for the accessible names of the views */
  prompt?: string;
  /** how the formula is shown: as pupils learn it (NH3, HCl) or in Hill order (H3N, ClH) */
  formulaOrder?: FormulaOrder;
};

/** The formula with subscripts. */
export const Formula = ({ molecule, order }: { molecule: Molecule; order: FormulaOrder }) => (
  <span>{displayParts(elementCounts(molecule), order).map((p) => <span key={p.el}>{p.el}{p.count > 1 && <sub>{p.count}</sub>}</span>)}</span>
);

const Builder = ({ molecule: m, onChange, elements, texts: t, showFormula, showValence, readOnly, view: startView, maxAtoms, prompt, formulaOrder = "common" }: BuilderProps) => {
  const [idPrefix] = useState(() => `mb${++instances}`);
  const [view, setView] = useState<View>(startView);
  const [noWebgl, setNoWebgl] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [connectFrom, setConnectFrom] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [help, setHelp] = useState(false);
  const history = useRef<Molecule[]>([]);
  const reducedMotion = usePrefersReducedMotion();

  // a molecule from outside (setResponse, reset): the selection may point at an atom that is gone
  useEffect(() => {
    if (selected !== null && !atomById(m, selected)) setSelected(null);
    if (connectFrom !== null && !atomById(m, connectFrom)) setConnectFrom(null);
  }, [m]);

  const name = (id: number) => {
    const a = atomById(m, id);
    return a ? t.atom(a.el, id) : "";
  };
  const describeIn = (mol: Molecule, id: number) => {
    const a = atomById(mol, id)!;
    const bonds = bondsOf(mol, id).map((b) => t.bondTo(t.bondName[b.order], t.atom(atomById(mol, other(b, id))!.el, other(b, id))));
    const free = freeValence(mol, id);
    const parts = [`${t.atom(a.el, id)}, ${t.name[a.el]}: ${t.bondedTo(bonds)}`];
    if (showValence && free > 0) parts.push(t.free(free));
    if (showValence && free < 0) parts.push(t.tooMany(-free));
    if (id === connectFrom) parts.push(t.connectFrom);
    return parts.join("; ");
  };
  const describe = (id: number) => describeIn(m, id);

  const commit = (next: Molecule | null, message: string) => {
    if (!next) return setStatus(message);
    history.current.push(m);
    onChange(next);
    setStatus(message);
  };

  const addElement = (el: ElementSymbol) => {
    if (readOnly) return;
    const parent = selected !== null && atomById(m, selected) ? selected : null;
    const result = addAtom(m, el, parent, maxAtoms);
    if (!result) return setStatus(t.full(maxAtoms));
    const atom = t.atom(el, result.id);
    if (result.bonded) commit(result.molecule, t.added(atom, name(parent!)));
    else {
      commit(result.molecule, parent !== null ? t.addedFull(atom, name(parent)) : t.added(atom, null));
      setSelected(result.id);
    }
    setConnectFrom(null);
  };

  const bond = (a: number, b: number) => {
    const order = nextOrder(m, a, b);
    commit(setBond(m, a, b, order), t.bondSet(name(a), name(b), order));
  };

  const connect = () => {
    if (readOnly) return;
    if (selected === null) return setStatus(t.selectFirst);
    if (connectFrom === null) {
      setConnectFrom(selected);
      return setStatus(t.connectStart(name(selected)));
    }
    if (connectFrom === selected) return setStatus(t.connectSame);
    bond(connectFrom, selected);
    setConnectFrom(null);
  };

  const pickAtom = (id: number) => {
    if (!readOnly && connectFrom !== null && id !== connectFrom) {
      setSelected(id);
      bond(connectFrom, id);
      setConnectFrom(null);
      return;
    }
    setSelected(id);
    setStatus(describe(id));
  };

  const pickBond = (a: number, b: number) => {
    if (readOnly) return;
    bond(a, b);
  };

  const removeSelected = () => {
    if (readOnly) return;
    if (selected === null) return setStatus(t.selectFirst);
    const next = neighbours(m, selected)[0] ?? null;
    commit(removeAtom(m, selected), t.removedAtom(name(selected)));
    setSelected(next);
    setConnectFrom(null);
  };

  const undo = () => {
    const previous = history.current.pop();
    if (!previous) return;
    onChange(previous);
    setConnectFrom(null);
    setStatus(t.undone);
  };

  const clear = () => {
    commit({ atoms: [], bonds: [] }, t.cleared);
    setSelected(null);
    setConnectFrom(null);
  };

  const select = (id: number | null) => {
    if (id === null) return;
    setSelected(id);
    setStatus(describe(id));
  };

  const step = (by: number) => {
    if (!m.atoms.length) return;
    const i = m.atoms.findIndex((a) => a.id === selected);
    const next = i < 0 ? (by > 0 ? 0 : m.atoms.length - 1) : (i + by + m.atoms.length) % m.atoms.length;
    select(m.atoms[next].id);
  };

  /** The keys of the builder, in both views. */
  const keyDown = (e: KeyboardEvent) => {
    if (e.altKey) return;
    const mod = e.ctrlKey || e.metaKey;
    const done = () => e.preventDefault();
    if (mod && e.key.toLowerCase() === "z") return done(), undo();
    if (mod) return;
    if (e.key === " " || e.key === "Enter") return done(), connect();
    if (e.key === "Delete" || e.key === "Backspace") return done(), removeSelected();
    if (e.key === "Escape") {
      if (connectFrom !== null) (setConnectFrom(null), setStatus(t.cancelled));
      else setSelected(null);
      return done();
    }
    const el = elements.find((x) => ELEMENTS[x].key === e.key.toLowerCase());
    if (el && e.key.length === 1) return done(), addElement(el);
  };

  /** The structural formula's own keys: arrows go from atom to atom, Shift + arrow moves the atom. */
  const keyDown2d = (e: KeyboardEvent) => {
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const dir = dirs[e.key];
    if (dir && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (selected === null) return select(m.atoms[0]?.id ?? null);
      if (e.shiftKey) {
        if (readOnly) return;
        const a = atomById(m, selected)!;
        const next = moveAtom(m, selected, a.x + dir[0], a.y + dir[1]);
        return next ? commit(next, t.moved(name(selected), a.x + dir[0], a.y + dir[1])) : undefined;
      }
      const next = atomInDirection(m, selected, dir[0], dir[1]);
      if (next !== null) select(next);
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      return select(m.atoms[e.key === "Home" ? 0 : m.atoms.length - 1]?.id ?? null);
    }
    keyDown(e);
  };

  const onPick3d = (p: Pick) => {
    if (!p) return;
    if ("atom" in p) pickAtom(p.atom);
    else pickBond(p.bond[0], p.bond[1]);
  };

  const formulaText = displayParts(elementCounts(m), formulaOrder).map((p) => `${p.el}${p.count > 1 ? p.count : ""}`).join("");
  const free = m.atoms.map((a) => ({ id: a.id, free: freeValence(m, a.id) })).filter((x) => x.free !== 0);
  const sel = selected !== null ? atomById(m, selected) : undefined;
  const shape = sel ? shapeOf(m, sel.id) : "none";
  const shapeName = t.shape[shape];
  const shapeAngle = sel && shapeName ? idealAngle(neighbours(m, sel.id).length, lonePairs(m, sel.id)) : null;
  const effectiveView: View = noWebgl ? "2d" : view;
  const labelSuffix = prompt ? `: ${prompt}` : "";

  const button = "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-sky-600 aria-pressed:border-amber-500 aria-pressed:bg-amber-50 aria-pressed:text-amber-900";

  return (
    <div className="flex flex-col gap-2.5" data-testid="builder">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t.palette} className="flex flex-wrap gap-1.5" data-testid="palette">
            {elements.map((el) => {
              const e = ELEMENTS[el];
              const label = t.add(t.name[el], el, e.valence);
              return (
                <button key={el} type="button" aria-label={label} title={`${label} [${e.key.toUpperCase()}]`} aria-keyshortcuts={e.key.toUpperCase()}
                  data-testid={`add-${el}`} onClick={() => addElement(el)}
                  className="group relative grid size-11 place-items-center rounded-full border-2 border-slate-700 text-base font-bold shadow-sm transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 motion-reduce:transition-none motion-reduce:hover:scale-100"
                  style={{ background: e.color, color: e.text }}>
                  {el}
                  <span aria-hidden="true" className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border border-slate-300 bg-white text-[10px] font-semibold text-slate-600">{e.valence}</span>
                </button>
              );
            })}
          </div>
          <span className="mx-1 h-8 w-px bg-slate-200" aria-hidden="true" />
          <button type="button" className={button} aria-pressed={connectFrom !== null} disabled={!m.atoms.length} onClick={connect} data-testid="connect">
            <span aria-hidden="true">⌁</span>{t.connect}
          </button>
          <button type="button" className={button} disabled={selected === null} onClick={removeSelected} data-testid="remove">{t.remove}</button>
          <button type="button" className={button} disabled={!history.current.length} onClick={undo} data-testid="undo">{t.undo}</button>
          <button type="button" className={button} disabled={!m.atoms.length} onClick={clear} data-testid="clear">{t.clear}</button>
          <button type="button" className={button} aria-expanded={help} onClick={() => setHelp(!help)} data-testid="help">{t.help}</button>
        </div>
      )}
      {help && <p className="m-0 max-w-[75ch] rounded-lg bg-sky-50 p-2.5 text-sm text-sky-950" data-testid="help-text">{t.helpText}</p>}
      <p id={`${idPrefix}-keys`} className={help ? "m-0 max-w-[75ch] rounded-lg bg-sky-50 p-2.5 text-sm text-sky-950" : "sr-only"}>{t.keysText}</p>

      <div role="tablist" aria-label={t.views} className="inline-flex self-start rounded-lg bg-slate-100 p-1">
        {(["3d", "2d"] as View[]).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={effectiveView === v} aria-controls={`${idPrefix}-panel`} data-testid={`tab-${v}`}
            disabled={v === "3d" && noWebgl} onClick={() => setView(v)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                setView(effectiveView === "3d" ? "2d" : "3d");
              }
            }}
            className="rounded-md px-3 py-1 text-sm text-slate-600 disabled:opacity-40 aria-selected:bg-white aria-selected:font-medium aria-selected:text-slate-900 aria-selected:shadow-sm focus-visible:outline-2 focus-visible:outline-sky-600">
            {v === "3d" ? t.view3d : t.view2d}
          </button>
        ))}
      </div>

      <div id={`${idPrefix}-panel`} role="tabpanel">
        {effectiveView === "3d" ? (
          <View3D molecule={m} selected={selected} connectFrom={connectFrom} reducedMotion={reducedMotion} texts={t} idPrefix={idPrefix}
            label={`${t.model3d(formulaText)}${labelSuffix}`} onPick={onPick3d} onKeyDown={keyDown} onStep={step}
            onNoWebgl={() => (setNoWebgl(true), setStatus(t.noWebgl))} />
        ) : (
          <View2D molecule={m} selected={selected} connectFrom={connectFrom} showValence={showValence} texts={t} idPrefix={idPrefix}
            label={`${t.structure(formulaText)}${labelSuffix}`} describe={describe} readOnly={readOnly}
            onPickAtom={pickAtom} onPickBond={pickBond} onKeyDown={keyDown2d}
            onMove={(id, x, y) => commit(moveAtom(m, id, x, y), t.moved(name(id), x, y))} />
        )}
      </div>

      <div className="flex flex-wrap items-start gap-x-6 gap-y-1.5 text-sm text-slate-700">
        {showFormula && (
          <p className="m-0" data-testid="formula" aria-label={`${t.formula}: ${formulaText || "—"}`}>
            <span className="text-slate-500">{t.formula}: </span>
            <span className="text-base font-semibold text-slate-900">{m.atoms.length ? <Formula molecule={m} order={formulaOrder} /> : "—"}</span>
          </p>
        )}
        {showValence && m.atoms.length > 0 && (
          <p className="m-0" data-testid="valence">
            {free.length === 0 ? (
              <span className="text-emerald-800"><span aria-hidden="true">✓ </span>{t.allBonded}</span>
            ) : (
              <>
                <span className="text-slate-500">{t.freeBonds}: </span>
                {free.map((x, i) => (
                  <span key={x.id} className={x.free < 0 ? "font-semibold text-rose-700" : ""}>
                    {i > 0 && ", "}
                    {name(x.id)} ({x.free < 0 ? `! ${t.tooMany(-x.free)}` : x.free})
                  </span>
                ))}
              </>
            )}
          </p>
        )}
        {sel && shapeName && (
          <p className="m-0 text-slate-600" data-testid="shape">
            {name(sel.id)}: {shapeName}, {formatNumber(t, shapeAngle!)}°
          </p>
        )}
      </div>
      <p role="status" aria-live="polite" className="m-0 min-h-5 text-sm text-slate-600" data-testid="status">{status}</p>
    </div>
  );
};

export default Builder;
