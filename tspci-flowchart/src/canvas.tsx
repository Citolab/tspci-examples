import { useMemo, useRef, useState } from "preact/hooks";
import { Chart, Edge, FNode, Label, SHAPES, Settings, Shape, mixed, outline } from "./flowchart";
import { CH, CW, SIZE, autoLayout, exitSide, gridOf, labelPoint, nodeAt, pathOf, port, route } from "./layout";
import { BlockText, ShapeIcon, outlinePath } from "./shapes";
import { Texts } from "./texts";

// The chart editor: the candidate's (interaction.tsx) and the author's (authoring.tsx). Cards and blocks are placed by
// dragging or by choosing one and then a cell; arrows are drawn from the handle of a block or with "Connect to…" in
// the panel; the keyboard does everything too. The chart is a grid: one block per cell, arrows between the cells.

/** What may change here. */
export type Perms = {
  /** add, move and delete blocks of one's own */
  addBlocks: boolean;
  /** draw and remove arrows (not the locked ones) */
  arrows: boolean;
  /** put cards in blocks */
  cards: boolean;
  /** type the text of a block */
  typed: boolean;
  /** the author: everything changes; new blocks and arrows are locked (part of the question) */
  author?: boolean;
};

type Drag = { kind: "card"; id: string } | { kind: "shape"; shape: Shape } | { kind: "block"; id: string } | { kind: "connect"; id: string };
type Pending = { drag: Drag; startX: number; startY: number; moved: boolean; pointerX: number; pointerY: number };
type Armed = { kind: "card"; id: string } | { kind: "shape"; shape: Shape } | null;

const button =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 shadow-xs " +
  "hover:bg-slate-50 hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600 disabled:opacity-40 disabled:hover:bg-white";
const field = "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-sky-600";
const small = "rounded-md px-1.5 py-0.5 text-xs text-slate-500 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-sky-600";

const edgeId = (e: Edge) => `${e.from}>${e.to}`;
const freshId = (nodes: FNode[], prefix = "n") => {
  let i = 1;
  while (nodes.some((n) => n.id === `${prefix}${i}`)) i++;
  return `${prefix}${i}`;
};

/** The name of a block as the candidate sees and hears it. */
export const namer = (settings: Settings, t: Texts) => {
  const shown = (n: FNode) => (n.card ? settings.cards.find((c) => c.id === n.card)?.text ?? "" : n.text ?? (n.shape === "start" || n.shape === "end" ? t.shape[n.shape] : ""));
  const spoken = (n: FNode) => {
    const text = shown(n) || (n.slot ? t.emptySlot : t.emptyBlock);
    return text === t.shape[n.shape] ? text : `${t.shape[n.shape]}: ${text}`;
  };
  return { shown, spoken };
};

/** The flow read as a nested list (outline() in flowchart.ts). */
export const Outline = ({ chart, settings, texts: t, testid = "outline" }: { chart: Chart; settings: Settings; texts: Texts; testid?: string }) => {
  const { spoken } = namer(settings, t);
  const items = outline(chart);
  const byId = new Map(chart.nodes.map((n) => [n.id, n]));
  const render = (list: ReturnType<typeof outline>) => (
    <ul className="m-0 list-none border-l border-slate-200 pl-3">
      {list.map((i, k) => {
        const n = byId.get(i.id)!;
        const label = i.label ? <span className="mr-1 rounded bg-slate-100 px-1 text-[11px] font-semibold text-slate-600 uppercase">{t.label[i.label]}</span> : null;
        return (
          <li key={k} className="py-0.5">
            {label}
            {i.ref ? <span className="text-slate-500">→ {t.continuesAt(i.n, spoken(n))}</span> : <span>{t.numbered(i.n, spoken(n))}</span>}
            {i.children.length > 0 && render(i.children)}
          </li>
        );
      })}
    </ul>
  );
  return (
    <details className="max-w-[70ch] rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-700" data-testid={testid}>
      <summary className="cursor-pointer text-xs font-semibold tracking-wide text-slate-500 uppercase">{t.outline}</summary>
      <div className="mt-1.5" aria-label={t.outline} role="region">
        {items.length ? render(items) : <p className="m-0 text-slate-500">{t.noBlocksYet}</p>}
      </div>
    </details>
  );
};

const Canvas = ({ settings, chart, start, onChange, texts, perms, readOnly = false, label, testid = "chart" }: {
  settings: Settings;
  chart: Chart;
  /** What "Start again" goes back to. */
  start: Chart;
  onChange: (chart: Chart) => void;
  texts: Texts;
  perms: Perms;
  readOnly?: boolean;
  label?: string;
  testid?: string;
}) => {
  const t = texts;
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [armed, setArmed] = useState<Armed>(null);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [exit, setExit] = useState<Label | "">("");
  const [newShape, setNewShape] = useState<Shape>("step");
  const history = useRef<Chart[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const connectRef = useRef<HTMLSelectElement>(null);
  const editRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const chartRef = useRef(chart);
  chartRef.current = chart;
  const typing = useRef<string | null>(null);

  const { nodes, edges } = chart;
  const { shown, spoken } = namer(settings, t);
  const grid = gridOf(chart, settings.columns, settings.rows);
  const columns = grid.columns;
  const rows = grid.rows + (perms.addBlocks && !readOnly ? 1 : 0);
  const byId = (id: string) => nodes.find((n) => n.id === id);
  const at = (x: number, y: number) => nodeAt(nodes, x, y);
  const where = (n: FNode) => spoken(n);
  const cardName = (id: string) => settings.cards.find((c) => c.id === id)?.text ?? id;
  const usedCards = new Set(nodes.map((n) => n.card).filter(Boolean));

  /** A card or typed text goes in: a slot or a block of the candidate's own. */
  const canFill = (n: FNode) => !readOnly && !perms.author && (!!n.slot || !n.locked);
  const canMove = (n: FNode) => !readOnly && (!!perms.author || (!n.locked && perms.addBlocks));
  const canEditEdge = (e: Edge) => !readOnly && perms.arrows && (!!perms.author || !e.locked);

  const commit = (next: Chart | null, message: string) => {
    if (!next) return false;
    history.current.push(chartRef.current);
    if (history.current.length > 200) history.current.shift();
    onChange(next);
    setStatus(message);
    return true;
  };
  const update = (id: string, change: (n: FNode) => FNode, from = chartRef.current): Chart => ({
    ...from, nodes: from.nodes.map((n) => (n.id === id ? change(n) : n)),
  });

  // --- the operations

  /** A card in a block: from the cards, or from where it was (it moves). */
  const putCard = (cardId: string, n: FNode) => {
    if (!canFill(n)) return setStatus(t.isLocked);
    let next: Chart = { ...chart, nodes: nodes.map((m) => (m.card === cardId && m.id !== n.id ? withoutFill(m) : m)) };
    next = update(n.id, (m) => ({ ...withoutFill(m), card: cardId }), next);
    commit(next, t.placedIn(cardName(cardId), where({ ...n, card: cardId, text: undefined })));
    setArmed(null);
  };
  const addBlock = (shape: Shape, x: number, y: number, fill: { card?: string } = {}) => {
    if (readOnly) return;
    if (!perms.addBlocks) return setStatus(t.noBlocks);
    if (at(x, y)) return setStatus(t.taken);
    const node: FNode = { id: freshId(nodes), shape, x, y, ...fill, ...(perms.author ? { locked: true } : {}) };
    const others = fill.card ? nodes.map((m) => (m.card === fill.card ? withoutFill(m) : m)) : nodes;
    commit({ ...chart, nodes: [...others, node] }, fill.card ? t.placedIn(cardName(fill.card), t.cell(y + 1, x + 1).toLowerCase()) : t.added(t.shape[shape], y + 1, x + 1));
    setCursor({ x, y });
  };
  const placeCardAt = (cardId: string, x: number, y: number) => {
    const n = at(x, y);
    if (n) return putCard(cardId, n);
    const card = settings.cards.find((c) => c.id === cardId);
    if (!perms.addBlocks) return setStatus(t.noBlocks);
    addBlock(card?.shape ?? "step", x, y, { card: cardId });
    setArmed(null);
  };
  const moveTo = (n: FNode, x: number, y: number) => {
    if (!canMove(n)) return setStatus(t.isLocked);
    if (x < 0 || y < 0 || x >= columns || y >= rows) return;
    const other = at(x, y);
    if (other && other.id !== n.id) {
      if (!canMove(other)) return setStatus(t.taken);
      // two blocks of one's own swap places
      const next = { ...chart, nodes: nodes.map((m) => (m.id === n.id ? { ...m, x, y } : m.id === other.id ? { ...m, x: n.x, y: n.y } : m)) };
      commit(next, t.swapped(spoken(n), spoken(other)));
    } else commit(update(n.id, (m) => ({ ...m, x, y })), t.moved(spoken(n), y + 1, x + 1));
    setCursor({ x, y });
  };
  /** The fills of two blocks (slots) swap. */
  const swapFills = (a: FNode, b: FNode) => {
    if (!canFill(a) || !canFill(b)) return setStatus(t.isLocked);
    const fa = fillOf(a), fb = fillOf(b);
    let next = update(a.id, (m) => ({ ...withoutFill(m), ...fb }));
    next = update(b.id, (m) => ({ ...withoutFill(m), ...fa }), next);
    commit(next, t.swapped(spoken(a), spoken(b)));
    setCursor({ x: b.x, y: b.y });
  };
  const removeBlock = (n: FNode) => {
    if (canMove(n) && (perms.author || perms.addBlocks)) {
      commit({ nodes: nodes.filter((m) => m.id !== n.id), edges: edges.filter((e) => e.from !== n.id && e.to !== n.id) }, t.removed(spoken(n)));
    } else if (canFill(n) && (n.card || n.text)) {
      commit(update(n.id, withoutFill), t.emptied(shown(n)));
    } else setStatus(t.isLocked);
  };
  const setText = (n: FNode, text: string, announce: boolean) => {
    if (!canFill(n) && !(perms.author && !n.slot)) return;
    const next = update(n.id, (m) => {
      const { card: _c, text: _t, ...rest } = m;
      return text.trim() ? { ...rest, text } : rest;
    });
    if (typing.current !== n.id) {
      history.current.push(chartRef.current);
      typing.current = n.id;
    }
    onChange(next);
    if (announce) setStatus(t.textSet(text.trim() || t.emptyBlock));
  };
  const setShape = (n: FNode, shape: Shape) => {
    if (!canMove(n)) return setStatus(t.isLocked);
    const next = update(n.id, (m) => ({ ...m, shape }));
    // only a decision has yes and no
    commit(shape === "decision" ? next : { ...next, edges: next.edges.map((e) => (e.from === n.id && e.label ? strip(e) : e)) }, t.shapeSet(t.shape[shape]));
  };
  const setKind = (n: FNode, slot: boolean) => {
    const next = update(n.id, (m) => {
      const { slot: _s, card: _c, text: _t, ...rest } = m;
      return slot ? { ...rest, slot: true, locked: true } : { ...rest, locked: true, ...(m.text ? { text: m.text } : {}) };
    });
    commit(next, slot ? t.kindSlot : t.kindLocked);
  };
  const connect = (from: FNode, to: FNode, label?: Label) => {
    if (readOnly) return;
    if (!perms.arrows) return setStatus(t.noArrows2);
    if (from.id === to.id) return setStatus(t.noSelf);
    if (edges.some((e) => (e.from === from.id && e.to === to.id))) return setStatus(t.exists);
    let l: Label | undefined = undefined;
    if (from.shape === "decision") {
      const has = (x: Label) => edges.some((e) => e.from === from.id && e.label === x);
      l = label ?? (!has("yes") ? "yes" : !has("no") ? "no" : undefined);
    }
    const edge: Edge = { from: from.id, to: to.id, ...(l ? { label: l } : {}), ...(perms.author ? { locked: true } : {}) };
    commit({ ...chart, edges: [...edges, edge] }, t.connected(spoken(from), spoken(to), l ? t.label[l] : undefined));
    setSelectedEdge(null);
  };
  const disconnect = (e: Edge) => {
    if (!canEditEdge(e)) return setStatus(t.isLocked);
    commit({ ...chart, edges: edges.filter((x) => edgeId(x) !== edgeId(e)) }, t.disconnected(spoken(byId(e.from)!), spoken(byId(e.to)!)));
    setSelectedEdge(null);
  };
  const relabel = (e: Edge, label: Label | "") => {
    if (!canEditEdge(e)) return setStatus(t.isLocked);
    commit({ ...chart, edges: edges.map((x) => (edgeId(x) === edgeId(e) ? (label ? { ...x, label } : strip(x)) : x)) }, t.relabelled(label ? t.label[label] : t.noLabel));
  };
  const undo = () => {
    const previous = history.current.pop();
    if (!previous) return;
    typing.current = null;
    onChange(previous);
    setStatus(t.undone);
  };
  const clear = () => commit(start, t.cleared);
  const tidy = (layout: (c: Chart) => Chart) => commit(layout(chart), t.laidOut);
  const arm = (next: Armed) => {
    setArmed(next);
    if (next) setStatus(t.chosen(next.kind === "card" ? cardName(next.id) : t.shape[next.shape]));
  };
  const placeArmed = (x: number, y: number) => {
    if (!armed || readOnly) return;
    if (armed.kind === "card") placeCardAt(armed.id, x, y);
    else {
      const n = at(x, y);
      if (n) setShape(n, armed.shape);
      else addBlock(armed.shape, x, y);
    }
  };

  // --- pointer

  const cellFromPoint = (clientX: number, clientY: number) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = Math.floor(((clientX - rect.left) / rect.width) * columns);
    const y = Math.floor(((clientY - rect.top) / rect.height) * rows);
    return x >= 0 && y >= 0 && x < columns && y < rows ? { x, y } : null;
  };
  const drop = useRef<(drag: Drag, clientX: number, clientY: number) => void>();
  drop.current = (drag, clientX, clientY) => {
    const cell = cellFromPoint(clientX, clientY);
    const target = cell ? at(cell.x, cell.y) : undefined;
    if (drag.kind === "card") {
      if (cell) placeCardAt(drag.id, cell.x, cell.y);
    } else if (drag.kind === "shape") {
      if (cell && !target) addBlock(drag.shape, cell.x, cell.y);
      else if (target) setShape(target, drag.shape);
    } else if (drag.kind === "connect") {
      const from = byId(drag.id);
      if (from && target) connect(from, target);
    } else {
      const n = byId(drag.id);
      if (!n) return;
      if (!cell) return removeBlock(n); // dragged off the chart
      if (target?.id === n.id) return;
      if (canMove(n)) moveTo(n, cell.x, cell.y);
      else if (target && (n.card || n.text)) swapFills(n, target);
    }
  };
  const suppressClick = useRef(false);
  const startDrag = (e: PointerEvent, drag: Drag) => {
    if (readOnly || e.button > 0) return;
    e.stopPropagation();
    let state: Pending = { drag, startX: e.clientX, startY: e.clientY, moved: false, pointerX: e.clientX, pointerY: e.clientY };
    const onMove = (ev: PointerEvent) => {
      const moved = state.moved || Math.hypot(ev.clientX - state.startX, ev.clientY - state.startY) > 5;
      state = { ...state, moved, pointerX: ev.clientX, pointerY: ev.clientY };
      if (moved) setPending(state);
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setPending(null);
      if (!state.moved || ev.type === "pointercancel") return; // a click: the click handlers do it
      drop.current(state.drag, ev.clientX, ev.clientY);
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    if (drag.kind === "connect") {
      const from = byId(drag.id);
      if (from) setStatus(t.connecting(spoken(from)));
    }
  };
  const clickCell = (x: number, y: number) => {
    if (suppressClick.current) return;
    setCursor({ x, y });
    setSelectedEdge(null);
    gridRef.current?.focus();
    if (armed) placeArmed(x, y);
  };

  // --- keyboard

  const slotsInOrder = () => nodes.filter((n) => n.slot && canFill(n)).sort((a, b) => a.x - b.x || a.y - b.y);
  const onKeyDown = (e: KeyboardEvent) => {
    const { x, y } = cursor;
    const n = at(x, y);
    const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const key = e.key;
    if (steps[key]) {
      e.preventDefault();
      const [dx, dy] = steps[key];
      if (e.shiftKey && n) {
        if (canMove(n)) moveTo(n, x + dx, y + dy);
        else if (n.slot && canFill(n)) {
          const slots = slotsInOrder();
          const other = slots[slots.findIndex((s) => s.id === n.id) + (dx + dy > 0 ? 1 : -1)];
          if (other) swapFills(n, other);
        } else setStatus(t.isLocked);
        return;
      }
      setSelectedEdge(null);
      setCursor({ x: Math.min(columns - 1, Math.max(0, x + dx)), y: Math.min(rows - 1, Math.max(0, y + dy)) });
    } else if (key === "Enter" || key === " ") {
      e.preventDefault();
      if (armed) placeArmed(x, y);
      else if (n) editRef.current?.focus();
    } else if ((key === "c" || key === "C") && !e.ctrlKey && !e.metaKey) {
      if (n && perms.arrows && !readOnly) {
        e.preventDefault();
        connectRef.current?.focus();
      }
    } else if (key === "Delete" || key === "Backspace") {
      e.preventDefault();
      const edge = edges.find((x) => edgeId(x) === selectedEdge);
      if (edge) disconnect(edge);
      else if (n) removeBlock(n);
    } else if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
    } else if (key === "Escape") {
      arm(null);
      setSelectedEdge(null);
    }
  };

  // --- what the chart shows

  const routes = useMemo(() => {
    const occupied = (x: number, y: number) => !!nodeAt(nodes, x, y);
    return edges.flatMap((e, i) => {
      const a = byId(e.from), b = byId(e.to);
      if (!a || !b) return [];
      const side = exitSide(a, b, e.label);
      const others = (x: number, y: number) => occupied(x, y) && !(x === a.x && y === a.y) && !(x === b.x && y === b.y);
      const points = route(a, b, side, others, ((i % 3) - 1) * 6);
      return [{ edge: e, points, side }];
    });
  }, [JSON.stringify(chart)]);

  const cellLabel = (x: number, y: number) => {
    const n = at(x, y);
    if (!n) return `${t.cell(y + 1, x + 1)}: ${t.empty}`;
    const to = edges.filter((e) => e.from === n.id).map((e) => `${byId(e.to) ? shown(byId(e.to)!) || spoken(byId(e.to)!) : ""}${e.label ? ` (${t.label[e.label]})` : ""}`);
    const from = edges.filter((e) => e.to === n.id).map((e) => (byId(e.from) ? shown(byId(e.from)!) || spoken(byId(e.from)!) : ""));
    const parts = [spoken(n), n.slot ? t.slot : n.locked ? t.locked : "", to.length ? t.arrowsTo(to.join(", ")) : "", from.length ? t.arrowsFrom(from.join(", ")) : ""];
    return `${t.cell(y + 1, x + 1)}: ${parts.filter(Boolean).join("; ")}`;
  };
  const cellId = (x: number, y: number) => `${testid}-cell-${x}-${y}`;
  const selected = at(cursor.x, cursor.y);
  const edgeSel = edges.find((e) => edgeId(e) === selectedEdge);
  const dragging = pending?.moved ? pending : null;
  const dropCell = dragging ? cellFromPoint(dragging.pointerX, dragging.pointerY) : null;
  const gridRect = gridRef.current?.getBoundingClientRect();
  const marker = `${testid}-arrow`;

  const cardList = useMemo(() => (settings.shuffle && !perms.author ? mixed(settings.cards) : settings.cards), [settings.cards, settings.shuffle]);

  const blockSvg = (n: FNode, x: number, y: number) => {
    const cx = CW / 2, cy = CH / 2;
    const text = shown(n);
    const filled = !!(n.card || n.text);
    const fixed = n.locked && !n.slot;
    const cls = fixed ? "fill-slate-100 stroke-slate-500" : n.slot ? (filled ? "fill-sky-50 stroke-sky-700" : "fill-white stroke-slate-400") : "fill-sky-50 stroke-sky-700";
    const beingDragged = dragging?.drag.kind === "block" && dragging.drag.id === n.id;
    return (
      <svg aria-hidden="true" viewBox={`0 0 ${CW} ${CH}`} className={`absolute inset-0 size-full overflow-visible ${beingDragged ? "opacity-30" : ""}`}>
        <path d={outlinePath(n.shape, cx, cy)} className={cls} stroke-width={fixed ? 1.5 : 2} stroke-dasharray={n.slot && !filled ? "6 4" : undefined} />
        {text ? <BlockText text={text} shape={n.shape} cx={cx} cy={cy} className={fixed ? "fill-slate-700" : "fill-slate-900"} />
          : <text x={cx} y={cy} text-anchor="middle" dominant-baseline="central" className="fill-slate-400" style={{ fontSize: "12px" }}>{n.slot ? "…" : t.shape[n.shape]}</text>}
        {fixed && !perms.author && <path transform={`translate(${lockAt(n)[0]} ${lockAt(n)[1]})`} d="M2.5 5V3.5a2.5 2.5 0 0 1 5 0V5H9v7H1V5zm1.2 0h2.6V3.5a1.3 1.3 0 0 0-2.6 0z" className="fill-slate-400" />}
      </svg>
    );
  };

  const panel = () => {
    const n = selected;
    if (edgeSel) {
      const a = byId(edgeSel.from)!, b = byId(edgeSel.to)!;
      return (
        <div className="flex flex-col gap-2" data-testid="edge-panel">
          <p className="m-0 font-medium">{t.arrowSelected(spoken(a), spoken(b))}</p>
          {a.shape === "decision" && (
            <label className="flex flex-col gap-1 text-xs text-slate-500">{t.exit}
              <select className={field} value={edgeSel.label ?? ""} disabled={!canEditEdge(edgeSel)} onChange={(e) => relabel(edgeSel, (e.target as HTMLSelectElement).value as Label | "")}>
                <option value="">{t.noLabel}</option>
                <option value="yes">{t.label.yes}</option>
                <option value="no">{t.label.no}</option>
              </select>
            </label>
          )}
          <button type="button" className={button} disabled={!canEditEdge(edgeSel)} onClick={() => disconnect(edgeSel)}>{t.removeArrow(shown(b) || spoken(b))}</button>
        </div>
      );
    }
    if (!n) {
      return (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-slate-500">{t.emptyCell} ({t.cell(cursor.y + 1, cursor.x + 1).toLowerCase()})</p>
          {perms.addBlocks && !readOnly && (
            <div className="flex items-end gap-1.5">
              <label className="flex flex-1 flex-col gap-1 text-xs text-slate-500">{t.addBlock}
                <select className={field} ref={editRef as any} data-testid="add-shape" value={newShape} onChange={(e) => setNewShape((e.target as HTMLSelectElement).value as Shape)}>
                  {SHAPES.map((s) => <option key={s} value={s}>{t.shape[s]}</option>)}
                </select>
              </label>
              <button type="button" className={button} data-testid="add-block"
                onClick={() => addBlock(newShape, cursor.x, cursor.y)}>{t.add}</button>
            </div>
          )}
          {!perms.addBlocks && !readOnly && <p className="m-0 text-xs text-slate-500">{t.nothingSelected}</p>}
        </div>
      );
    }
    const out = edges.filter((e) => e.from === n.id);
    const others = nodes.filter((m) => m.id !== n.id && !edges.some((e) => e.from === n.id && e.to === m.id)).sort((a, b) => a.y - b.y || a.x - b.x);
    const fillable = canFill(n) && !perms.author;
    const authorText = perms.author && !n.slot && !readOnly;
    const available = settings.cards.filter((c) => !usedCards.has(c.id) || c.id === n.card);
    const targetValue = others.some((m) => m.id === target) ? target : others[0]?.id ?? "";
    return (
      <div className="flex flex-col gap-2.5" data-testid="block-panel">
        <p className="m-0 font-medium text-slate-800" data-testid="selected-name">{spoken(n)}</p>
        {perms.author && !readOnly && (
          <label className="flex flex-col gap-1 text-xs text-slate-500">{t.kind}
            <select className={field} value={n.slot ? "slot" : "locked"} data-testid="kind" onChange={(e) => setKind(n, (e.target as HTMLSelectElement).value === "slot")}>
              <option value="locked">{t.kindLocked}</option>
              <option value="slot">{t.kindSlot}</option>
            </select>
          </label>
        )}
        {fillable && perms.cards && (
          <label className="flex flex-col gap-1 text-xs text-slate-500">{t.card}
            <select className={field} ref={editRef as any} value={n.card ?? ""} data-testid="card-select"
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                if (v) putCard(v, n);
                else if (n.card) commit(update(n.id, withoutFill), t.emptied(shown(n)));
              }}>
              <option value="">{t.noCard}</option>
              {available.map((c) => <option key={c.id} value={c.id}>{c.text}</option>)}
            </select>
          </label>
        )}
        {((fillable && perms.typed && !n.card) || authorText) && (
          <label className="flex flex-col gap-1 text-xs text-slate-500">{t.text}
            <input className={field} ref={!(fillable && perms.cards) ? (editRef as any) : undefined} value={n.text ?? ""} maxLength={120} data-testid="text-input"
              onFocus={() => (typing.current = null)}
              onInput={(e) => setText(n, (e.target as HTMLInputElement).value, false)}
              onChange={(e) => setText(n, (e.target as HTMLInputElement).value, true)} />
          </label>
        )}
        {canMove(n) && (perms.addBlocks || perms.author) && (
          <label className="flex flex-col gap-1 text-xs text-slate-500">{t.shapeOf}
            <select className={field} value={n.shape} data-testid="shape-select" onChange={(e) => setShape(n, (e.target as HTMLSelectElement).value as Shape)}>
              {SHAPES.map((s) => <option key={s} value={s}>{t.shape[s]}</option>)}
            </select>
          </label>
        )}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">{t.arrowsOut}</span>
          {out.length === 0 && <span className="text-xs text-slate-400">{t.noArrows}</span>}
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {out.map((e) => {
              const to = byId(e.to)!;
              const name = shown(to) || spoken(to);
              return (
                <li key={edgeId(e)} className="flex items-center gap-1 text-sm" data-testid={`out-${e.to}`}>
                  <span aria-hidden="true" className="text-slate-400">→</span>
                  <span className="min-w-0 flex-1 truncate" title={name}>{name}</span>
                  {n.shape === "decision" && (
                    <select className="rounded-md border border-slate-300 bg-white px-1 py-0.5 text-xs" aria-label={t.labelOf(name)} value={e.label ?? ""} disabled={!canEditEdge(e)}
                      onChange={(ev) => relabel(e, (ev.target as HTMLSelectElement).value as Label | "")}>
                      <option value="">–</option>
                      <option value="yes">{t.label.yes}</option>
                      <option value="no">{t.label.no}</option>
                    </select>
                  )}
                  {n.shape !== "decision" && e.label && <span className="rounded bg-slate-100 px-1 text-[11px] text-slate-600">{t.label[e.label]}</span>}
                  {canEditEdge(e) && <button type="button" className={small} aria-label={t.removeArrow(name)} onClick={() => disconnect(e)}>✕</button>}
                </li>
              );
            })}
          </ul>
        </div>
        {perms.arrows && !readOnly && others.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="flex flex-col gap-1 text-xs text-slate-500">{t.connectTo}
              <select className={field} ref={connectRef} value={targetValue} data-testid="connect-select" onChange={(e) => setTarget((e.target as HTMLSelectElement).value)}>
                {others.map((m) => <option key={m.id} value={m.id}>{spoken(m)}</option>)}
              </select>
            </label>
            <div className="flex items-end gap-1.5">
              {n.shape === "decision" && (
                <label className="flex flex-1 flex-col gap-1 text-xs text-slate-500">{t.exit}
                  <select className={field} value={exit} data-testid="exit-select" onChange={(e) => setExit((e.target as HTMLSelectElement).value as Label | "")}>
                    <option value="">{t.autoLabel}</option>
                    <option value="yes">{t.label.yes}</option>
                    <option value="no">{t.label.no}</option>
                  </select>
                </label>
              )}
              <button type="button" className={button} data-testid="add-arrow"
                onClick={() => { const to = byId(targetValue); if (to) connect(n, to, exit || undefined); setExit(""); }}>{t.addArrow}</button>
            </div>
          </div>
        )}
        {!readOnly && (canMove(n) || (canFill(n) && (n.card || n.text))) && (
          <button type="button" className={button} data-testid="delete-block" onClick={() => removeBlock(n)}>
            <span aria-hidden="true">✕</span>{canMove(n) && (perms.author || perms.addBlocks) ? t.deleteBlock : t.emptySlotButton}
          </button>
        )}
      </div>
    );
  };

  const showCards = perms.cards && settings.cards.length > 0 && !readOnly;
  const showShapes = (perms.addBlocks || perms.author) && !readOnly;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-4">
        {!readOnly && <div className="flex w-full flex-col gap-3 sm:w-[236px]">
          {showShapes && (
            <section aria-label={t.blocks}>
              <h3 className="m-0 mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">{t.blocks}</h3>
              <ul className="m-0 grid list-none grid-cols-3 gap-1 p-0">
                {SHAPES.map((s) => (
                  <li key={s}>
                    <button type="button" data-testid={`shape-${s}`} aria-pressed={armed?.kind === "shape" && armed.shape === s}
                      className="flex w-full touch-none select-none flex-col items-center rounded-lg border border-slate-200 bg-white px-1 py-1 text-[11px] leading-tight text-slate-700 hover:border-sky-400 hover:bg-sky-50 aria-pressed:border-sky-600 aria-pressed:bg-sky-50 aria-pressed:ring-2 aria-pressed:ring-sky-200 focus-visible:outline-2 focus-visible:outline-sky-600 cursor-grab"
                      onPointerDown={(e) => startDrag(e, { kind: "shape", shape: s })}
                      onClick={() => !suppressClick.current && arm(armed?.kind === "shape" && armed.shape === s ? null : { kind: "shape", shape: s })}>
                      <ShapeIcon shape={s} className="h-6 w-12 text-slate-700" />
                      <span className="text-center">{t.shape[s]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {showCards && (
            <section aria-label={t.cards}>
              <h3 className="m-0 mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">{t.cards}</h3>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {cardList.map((c) => {
                  const used = usedCards.has(c.id);
                  return (
                    <li key={c.id}>
                      <button type="button" data-testid={`card-${c.id}`} aria-pressed={armed?.kind === "card" && armed.id === c.id} disabled={used}
                        aria-label={used ? `${c.text}, ${t.used}` : c.text}
                        className={"flex w-full touch-none select-none items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[13px] leading-snug " +
                          "border-slate-200 bg-white text-slate-800 shadow-xs hover:border-sky-400 hover:bg-sky-50 cursor-grab " +
                          "aria-pressed:border-sky-600 aria-pressed:bg-sky-50 aria-pressed:ring-2 aria-pressed:ring-sky-200 focus-visible:outline-2 focus-visible:outline-sky-600 " +
                          "disabled:cursor-default disabled:border-dashed disabled:bg-slate-50 disabled:text-slate-400 disabled:shadow-none disabled:hover:border-slate-200"}
                        onPointerDown={(e) => !used && startDrag(e, { kind: "card", id: c.id })}
                        onClick={() => !suppressClick.current && arm(armed?.kind === "card" && armed.id === c.id ? null : { kind: "card", id: c.id })}>
                        <span aria-hidden="true" className={`grid size-4 shrink-0 place-items-center rounded-sm border text-[10px] ${used ? "border-slate-300 text-slate-400" : "border-slate-300 text-transparent"}`}>✓</span>
                        <span>{c.text}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {!readOnly && (
            <section aria-label={t.selected} className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 text-sm" data-testid="panel">
              <h3 className="m-0 mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">{t.selected}</h3>
              {panel()}
            </section>
          )}
        </div>}

        <div className="flex min-w-0 flex-col gap-2">
          {!readOnly && (
            <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label={label ?? t.chart}>
              <button type="button" className={button} onClick={undo} data-testid="undo"><span aria-hidden="true">↶</span>{t.undo}</button>
              {perms.addBlocks && <AutoLayoutButton onClick={tidy} label={t.autoLayout} />}
              <button type="button" className={button} onClick={clear} data-testid="clear">{t.clear}</button>
              <button type="button" className={`${button} ml-auto`} aria-expanded={helpOpen} aria-label={t.showHelp} title={t.showHelp} onClick={() => setHelpOpen(!helpOpen)} data-testid="help"><span aria-hidden="true">?</span></button>
            </div>
          )}
          {helpOpen && <p className="m-0 max-w-[64ch] rounded-lg bg-sky-50 p-2.5 text-xs text-sky-900">{t.help}</p>}
          <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div ref={gridRef} role="grid" tabIndex={0} aria-label={label ?? t.chart} aria-activedescendant={cellId(cursor.x, cursor.y)} data-testid={testid}
              aria-readonly={readOnly ? "true" : undefined} onKeyDown={onKeyDown}
              className="group relative grid touch-none select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sky-200 focus-visible:ring-offset-4"
              style={{
                gridTemplateColumns: `repeat(${columns}, ${CW}px)`, gridTemplateRows: `repeat(${rows}, ${CH}px)`,
                backgroundImage: "radial-gradient(circle, #dbe3ec 1.2px, transparent 1.3px)", backgroundSize: `${CW / 2}px ${CH / 2}px`, backgroundPosition: `${CW / 4}px ${CH / 4}px`,
              }}>
              {Array.from({ length: rows }, (_, y) => (
                <div role="row" key={y} className="contents">
                  {Array.from({ length: columns }, (_, x) => {
                    const n = at(x, y);
                    const isCursor = cursor.x === x && cursor.y === y;
                    const isTarget = dropCell && dropCell.x === x && dropCell.y === y;
                    const grabbable = n && !readOnly && (canMove(n) || (canFill(n) && (n.card || n.text)));
                    return (
                      <div role="gridcell" id={cellId(x, y)} key={x} aria-label={cellLabel(x, y)} aria-selected={isCursor}
                        aria-readonly={n && !canFill(n) && !canMove(n) ? "true" : undefined}
                        data-testid={`cell-${x}-${y}`} data-node={n ? n.id : undefined} data-fill={n ? n.card ?? (n.text ? `"${n.text}"` : "") : undefined}
                        className={"relative " + (isTarget ? "rounded-lg bg-sky-100/70 " : "") + (isCursor ? "z-10 " : "") + (grabbable ? "cursor-grab " : "")}
                        onClick={() => clickCell(x, y)}
                        onDblClick={() => n && editRef.current?.focus()}
                        onPointerDown={(e) => grabbable && startDrag(e, { kind: "block", id: n!.id })}>
                        {n && blockSvg(n, x, y)}
                        {isCursor && <span aria-hidden="true" className="pointer-events-none absolute inset-1 hidden rounded-lg ring-2 ring-sky-500 group-focus:block" />}
                        {isCursor && !readOnly && <span aria-hidden="true" className="pointer-events-none absolute inset-1 rounded-lg ring-1 ring-sky-300 group-focus:hidden" />}
                        {n && isCursor && perms.arrows && !readOnly && (
                          <span aria-hidden="true" data-testid="handle" title={t.connectTo}
                            className="absolute left-1/2 z-20 size-4 -translate-x-1/2 cursor-crosshair rounded-full border-2 border-white bg-sky-600 shadow ring-1 ring-sky-700"
                            style={{ top: `${CH / 2 + 34}px` }}
                            onPointerDown={(e) => startDrag(e, { kind: "connect", id: n.id })} />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full overflow-visible" viewBox={`0 0 ${columns * CW} ${rows * CH}`}>
                <defs>
                  <marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0 0L10 5L0 10z" className="fill-slate-600" />
                  </marker>
                  <marker id={`${marker}-sel`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0 0L10 5L0 10z" className="fill-sky-600" />
                  </marker>
                </defs>
                {routes.map(({ edge, points, side }) => {
                  const sel = edgeId(edge) === selectedEdge;
                  const d = pathOf(points);
                  const [lx, ly] = labelPoint(points, side);
                  return (
                    <g key={edgeId(edge)} data-testid={`edge-${edge.from}-${edge.to}`} data-label={edge.label ?? ""}>
                      <path d={d} fill="none" className={sel ? "stroke-sky-600" : edge.locked ? "stroke-slate-500" : "stroke-slate-700"} stroke-width={sel ? 2.5 : 1.75}
                        marker-end={`url(#${sel ? `${marker}-sel` : marker})`} />
                      {!readOnly && (
                        <path d={d} fill="none" stroke="transparent" stroke-width={14} style={{ pointerEvents: "stroke", cursor: "pointer" }}
                          onClick={(e) => { e.stopPropagation(); setSelectedEdge(edgeId(edge)); setStatus(t.arrowSelected(spoken(byId(edge.from)!), spoken(byId(edge.to)!))); }} />
                      )}
                      {edge.label && (
                        <g transform={`translate(${lx} ${ly})`}>
                          <rect x={side === "left" ? -30 : -2} y={-9} width={30} height={16} rx={4} className="fill-white stroke-slate-300" />
                          <text x={side === "left" ? -15 : 13} y={0} text-anchor="middle" dominant-baseline="central" className="fill-slate-700 font-semibold" style={{ fontSize: "11px" }}>{t.label[edge.label]}</text>
                        </g>
                      )}
                    </g>
                  );
                })}
                {dragging?.drag.kind === "connect" && gridRect && (() => {
                  const from = byId(dragging.drag.id);
                  if (!from) return null;
                  const [sx, sy] = port(from, "bottom");
                  const scale = (columns * CW) / gridRect.width;
                  const px = (dragging.pointerX - gridRect.left) * scale, py = (dragging.pointerY - gridRect.top) * scale;
                  return <path d={`M${sx} ${sy}L${px} ${py}`} className="stroke-sky-600" stroke-width={2} stroke-dasharray="5 4" marker-end={`url(#${marker}-sel)`} />;
                })()}
              </svg>
            </div>
          </div>
          <div className="flex min-h-5 flex-wrap items-center gap-3 text-xs text-slate-500">
            <span role="status" aria-live="polite" className="text-slate-600" data-testid="status">{status}</span>
          </div>
        </div>
      </div>
      {dragging && (dragging.drag.kind === "card" || dragging.drag.kind === "shape" || dragging.drag.kind === "block") && (
        <Ghost drag={dragging} chart={chart} settings={settings} shown={shown} />
      )}
    </div>
  );
};

/** Where the lock of a locked block goes (top left inside the shape), in the cell's px. */
const lockAt = (n: FNode): [number, number] => {
  const [w, h] = SIZE[n.shape];
  if (n.shape === "decision") return [CW / 2 - w / 2 + 14, CH / 2 - 6];
  return [CW / 2 - w / 2 + (n.shape === "io" ? 16 : n.shape === "step" ? 6 : 14), CH / 2 - h / 2 + 5];
};

/** What follows the pointer while dragging. */
const Ghost = ({ drag, chart, settings, shown }: { drag: Pending; chart: Chart; settings: Settings; shown: (n: FNode) => string }) => {
  const d = drag.drag;
  let shape: Shape = "step", text = "";
  if (d.kind === "card") {
    const card = settings.cards.find((c) => c.id === d.id);
    shape = card?.shape ?? "step";
    text = card?.text ?? "";
  } else if (d.kind === "shape") shape = d.shape;
  else if (d.kind === "block") {
    const n = chart.nodes.find((m) => m.id === d.id);
    if (n) {
      shape = n.shape;
      text = shown(n);
    }
  }
  return (
    <div aria-hidden="true" className="pointer-events-none fixed z-50 opacity-85" style={{ left: `${drag.pointerX - CW / 2}px`, top: `${drag.pointerY - CH / 2}px`, width: `${CW}px`, height: `${CH}px` }}>
      <svg viewBox={`0 0 ${CW} ${CH}`} className="size-full overflow-visible drop-shadow-md">
        <path d={outlinePath(shape, CW / 2, CH / 2)} className="fill-white stroke-sky-600" stroke-width={2} />
        {text && <BlockText text={text} shape={shape} cx={CW / 2} cy={CH / 2} className="fill-slate-900" />}
      </svg>
    </div>
  );
};

const AutoLayoutButton = ({ onClick, label }: { onClick: (layout: (c: Chart) => Chart) => void; label: string }) => (
  <button type="button" className={button} onClick={() => onClick(autoLayout)} data-testid="auto-layout"><span aria-hidden="true">⊞</span>{label}</button>
);

const withoutFill = (n: FNode): FNode => {
  const { card: _c, text: _t, ...rest } = n;
  return rest;
};
const fillOf = (n: FNode): { card?: string; text?: string } => (n.card ? { card: n.card } : n.text ? { text: n.text } : {});
const strip = (e: Edge): Edge => {
  const { label: _, ...rest } = e;
  return rest;
};

export default Canvas;
