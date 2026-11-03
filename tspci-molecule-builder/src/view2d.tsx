import { useRef, useState } from "preact/hooks";
import { ELEMENTS, Molecule, atomById, freeValence } from "./molecule";
import { Texts } from "./texts";

// The structural formula: the atoms on a grid with their bonds as lines (two or three for double and triple bonds).
// A listbox with the selected atom as its active descendant, so a screen reader hears every atom with its bonds; the
// atoms are HTML options laid over the drawing (clicks and drags), the drawing itself is hidden from assistive tech.

export const CELL = 64;
const R = 17;

export type View2DProps = {
  molecule: Molecule;
  selected: number | null;
  connectFrom: number | null;
  showValence: boolean;
  texts: Texts;
  label: string;
  describe: (id: number) => string;
  readOnly: boolean;
  onPickAtom: (id: number) => void;
  onPickBond: (a: number, b: number) => void;
  onMove: (id: number, x: number, y: number) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  idPrefix: string;
};

const View2D = ({ molecule: m, selected, connectFrom, showValence, texts: t, label, describe, readOnly, onPickAtom, onPickBond, onMove, onKeyDown, idPrefix }: View2DProps) => {
  const [drag, setDrag] = useState<{ id: number; dx: number; dy: number; startX: number; startY: number; moved: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const xs = m.atoms.map((a) => a.x), ys = m.atoms.map((a) => a.y);
  const minX = Math.min(0, ...xs) - 1, maxX = Math.max(0, ...xs) + 1, minY = Math.min(0, ...ys) - 1, maxY = Math.max(0, ...ys) + 1;
  const width = (maxX - minX) * CELL + CELL, height = (maxY - minY) * CELL + CELL;
  const cx = (x: number) => (x - minX) * CELL + CELL / 2, cy = (y: number) => (y - minY) * CELL + CELL / 2;
  const at = (id: number) => {
    const a = atomById(m, id)!;
    const d = drag && drag.id === id ? drag : null;
    return { x: cx(a.x) + (d?.dx ?? 0), y: cy(a.y) + (d?.dy ?? 0) };
  };

  const pointerDown = (e: PointerEvent, id: number) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ id, dx: 0, dy: 0, startX: e.clientX, startY: e.clientY, moved: false });
  };
  const pointerMove = (e: PointerEvent) => {
    if (!drag || readOnly) return;
    const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    setDrag({ ...drag, dx, dy, moved: true });
  };
  const pointerUp = (e: PointerEvent) => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (!d.moved) return onPickAtom(d.id);
    const a = atomById(m, d.id)!;
    onMove(d.id, a.x + Math.round((e.clientX - d.startX) / CELL), a.y + Math.round((e.clientY - d.startY) / CELL));
  };

  return (
    <div ref={box} role="listbox" tabIndex={0} aria-label={label} aria-activedescendant={selected !== null ? `${idPrefix}-atom-${selected}` : undefined}
      aria-describedby={`${idPrefix}-keys`} aria-readonly={readOnly ? "true" : undefined} data-testid="structure" data-view="2d" onKeyDown={onKeyDown}
      className="relative h-[340px] w-full overflow-auto rounded-xl border border-slate-200 bg-[radial-gradient(circle,#e2e8f0_1px,transparent_1px)] bg-[length:16px_16px] outline-none focus-visible:ring-2 focus-visible:ring-sky-600">
      {!m.atoms.length && <p className="absolute inset-0 m-0 grid place-items-center p-4 text-center text-sm text-slate-500">{t.empty}</p>}
      <div className="relative mx-auto my-auto" style={{ width: `${width}px`, height: `${height}px`, minHeight: "100%" }}>
        <svg width={width} height={height} aria-hidden="true" className="absolute left-0 top-0 overflow-visible">
          {m.bonds.map((b) => {
            const p = at(b.a), q = at(b.b);
            const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
            const nx = -(q.y - p.y) / len, ny = (q.x - p.x) / len;
            const offsets = b.order === 1 ? [0] : b.order === 2 ? [-3.5, 3.5] : [-6, 0, 6];
            return (
              <g key={`${b.a}-${b.b}`} data-bond={`${b.a}-${b.b}`} data-order={b.order} className={readOnly ? "" : "cursor-pointer"}
                onClick={() => !readOnly && onPickBond(b.a, b.b)}>
                <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="transparent" stroke-width={18} />
                {offsets.map((o) => (
                  <line key={o} x1={p.x + nx * o} y1={p.y + ny * o} x2={q.x + nx * o} y2={q.y + ny * o} stroke="#334155" stroke-width={2.2} stroke-linecap="round" />
                ))}
              </g>
            );
          })}
          {m.atoms.map((a) => {
            const p = at(a.id);
            const e = ELEMENTS[a.el];
            const free = freeValence(m, a.id);
            const isSel = a.id === selected, isFrom = a.id === connectFrom;
            return (
              <g key={a.id}>
                {(isSel || isFrom) && (
                  <circle cx={p.x} cy={p.y} r={R + 6} fill="none" stroke={isFrom ? "#b45309" : "#0369a1"} stroke-width={3} stroke-dasharray={isFrom ? "5 4" : undefined} />
                )}
                <circle cx={p.x} cy={p.y} r={R} fill={e.color} stroke="#1e293b" stroke-width={1.5} />
                <text x={p.x} y={p.y + 1} text-anchor="middle" dominant-baseline="middle" fill={e.text} font-weight="700" font-size={a.el.length > 1 ? 13 : 15}
                  font-family="system-ui, sans-serif">{a.el}</text>
                {showValence && free !== 0 && (
                  <g>
                    <circle cx={p.x + R - 1} cy={p.y - R + 1} r={8} fill={free < 0 ? "#be123c" : "#ffffff"} stroke={free < 0 ? "#be123c" : "#64748b"} stroke-width={1.2} />
                    <text x={p.x + R - 1} y={p.y - R + 1.5} text-anchor="middle" dominant-baseline="middle" font-size={10} font-weight="700"
                      fill={free < 0 ? "#ffffff" : "#334155"} font-family="system-ui, sans-serif">{free < 0 ? "!" : free}</text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
        {m.atoms.map((a) => {
          const p = at(a.id);
          return (
            <div key={a.id} id={`${idPrefix}-atom-${a.id}`} role="option" aria-selected={a.id === selected ? "true" : "false"} aria-label={describe(a.id)}
              data-atom={a.id} data-el={a.el} data-testid={`atom-${a.id}`}
              className={`absolute rounded-full ${readOnly ? "cursor-default" : "cursor-grab touch-none"}`}
              style={{ left: `${p.x - R - 2}px`, top: `${p.y - R - 2}px`, width: `${2 * R + 4}px`, height: `${2 * R + 4}px` }}
              onPointerDown={(e) => pointerDown(e as PointerEvent, a.id)} onPointerMove={(e) => pointerMove(e as PointerEvent)}
              onPointerUp={(e) => pointerUp(e as PointerEvent)} onPointerCancel={() => setDrag(null)} />
          );
        })}
      </div>
    </div>
  );
};

export default View2D;
