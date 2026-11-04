// SPDX-License-Identifier: MIT
// Based on https://github.com/rdncuee/CBP (Code Block Programming Interaction),
// © 2022 The National Center for University Entrance Examinations
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { IStore, useStore } from "@citolab/preact-store";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import {
  type Block, type Node, type Position, type Settings, countNodes, findNode, isContainer, lineText, listing, newNode, usage,
} from "./blocks";
import { type Category, CATEGORY, BlockShape, Grip, ICON, Icon, Label, Lock, categoryOf, colours } from "./look";
import { Actions, StateModel } from "./store";
import { Texts, errorMessage } from "./texts";

// The candidate's view: the blocks (a flyout, by category), the program as a stack of puzzle pieces on a canvas under a
// "when Run is pressed" hat, the input, Run and the output. Every block is a row (a list item): a C-shaped block is a
// top row, the rows inside with an arm on the left, an else bar and a bottom bar.

/** The arm of a C-shaped block on a line inside it. */
type Arm = { category: Category; locked: boolean };

/** A row of the editor: a block, the else bar of an if/else, the empty mouth of a block, or the bottom bar of a C. */
type Row =
  | { type: "line"; key: string; node: Node; block: Block; number: number; pos: Position; depth: number; arms: Arm[] }
  | { type: "else"; key: string; node: Node; block: Block; number: number; depth: number; arms: Arm[] }
  | { type: "empty"; key: string; pos: Position; depth: number; arms: Arm[] }
  | { type: "end"; key: string; node: Node; block: Block; pos: Position; depth: number; arms: Arm[] };

const rowsOf = (s: Settings, program: Node[]): Row[] => {
  const rows: Row[] = [];
  let number = 0;
  const walk = (list: Node[], parent: string | null, branch: "body" | "other", depth: number, arms: Arm[]) => {
    if (!list.length && parent !== null) rows.push({ type: "empty", key: `${parent}:${branch}:empty`, pos: { parent, branch, index: 0 }, depth, arms });
    list.forEach((node, index) => {
      const block = s.blocks[node.block];
      if (!block) return;
      const pos = { parent, branch, index };
      rows.push({ type: "line", key: node.id, node, block, number: ++number, pos, depth, arms });
      if (!isContainer(block.kind)) return;
      const inner = [...arms, { category: categoryOf(block.kind), locked: !!node.locked }];
      walk(node.body ?? [], node.id, "body", depth + 1, inner);
      if (block.kind === "ifelse") {
        rows.push({ type: "else", key: `${node.id}:else`, node, block, number: ++number, depth, arms });
        walk(node.other ?? [], node.id, "other", depth + 1, inner);
      }
      rows.push({ type: "end", key: `${node.id}:end`, node, block, pos, depth, arms });
    });
  };
  walk(program, null, "body", 0, []);
  return rows;
};

const button = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50";
/** A button on a piece: white on the block colour. */
const pieceButton = "cb-focus inline-flex size-9 shrink-0 items-center justify-center rounded-md text-white hover:bg-black/20 disabled:opacity-40";

/** What the candidate hears for a block: its text with the blanks as they are. */
const spoken = (block: Block, node?: Node) => lineText(block, node ?? newNode(block, "x"));

// ─── the interaction ─────────────────────────────────────────────────────────────────────────────────────────────────

type Source = { block: string } | { id: string };
type Target = { pos: Position; key: string; edge: "top" | "bottom"; depth: number } | { remove: true } | null;

/** The authoring mode uses the same editor for the solution and the starting program, without input and output. */
export type AuthorEditor = {
  /** The heading of the program ("Solution", "Starting program"). */
  title: string;
  /** More controls on a line of the program (the lock of a block in the starting program). */
  lineExtra?: (node: Node, number: number, text: string) => ComponentChildren;
};

const Interaction = ({ s, store, texts: t, readOnly, author }: {
  s: Settings;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  readOnly: boolean;
  author?: AuthorEditor;
}) => {
  const state = useStore(store);
  const { program, run } = state;
  const rows = rowsOf(s, program);
  const used = usage(program);
  const count = countNodes(program);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [ghost, setGhost] = useState<{ x: number; y: number; text: string; category: Category } | null>(null);
  const [target, setTarget] = useState<Target>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const drag = useRef<{ source: Source; x0: number; y0: number; active: boolean; text: string; category: Category } | null>(null);
  const suppressClick = useRef(false);
  const programRef = useRef<HTMLDivElement>(null);
  const selectedNode = selected ? findNode(program, selected) : null;
  const errorLine = run?.error?.line ?? 0;

  // after a move the focus goes back to the handle of the block (or of the block that took its place), before the next key
  useLayoutEffect(() => {
    if (!focusId) return;
    const root = rootRef.current?.getRootNode() as ShadowRoot | Document | undefined;
    const handle = root?.querySelector<HTMLElement>(`[data-handle="${focusId}"]`);
    (handle ?? programRef.current)?.focus();
    setFocusId(null);
  }, [focusId, program]);

  const lineOf = (id: string, prog = store.getState().program) => listing(s, prog).find((l) => l.node.id === id && !l.isElse);
  const announce = (text: string) => setMessage(text);

  /** Dispatches a change of the program and tells the candidate what happened to the block. */
  const change = (action: Parameters<typeof store.dispatch>[0], id: string, focus = true) => {
    const before = store.getState().program;
    store.dispatch(action);
    const after = store.getState().program;
    if (after === before) {
      announce(action.type === "ADD" && countNodes(before) >= s.maxBlocks ? t.full(s.maxBlocks) : t.cannotMove);
      return false;
    }
    const line = lineOf(id, after);
    if (line) {
      announce(action.type === "ADD" ? t.added(line.text, line.number) : t.moved(line.text, line.number, line.depth));
      setSelected(id);
      if (focus) setFocusId(id);
    }
    return true;
  };

  /** The place a new block goes: below the selected block, or at the end of the program. */
  const insertPosition = (): Position => {
    if (selectedNode) return { parent: selectedNode.parent?.id ?? null, branch: selectedNode.branch, index: selectedNode.index + 1 };
    return { parent: null, branch: "body", index: program.length };
  };

  const add = (block: string, position = insertPosition()) =>
    change({ type: "ADD", payload: { block, position } }, `n${store.getState().next}`);

  const remove = (id: string) => {
    const before = listing(s, store.getState().program);
    const index = before.findIndex((l) => l.node.id === id && !l.isElse);
    const text = before[index]?.text ?? "";
    store.dispatch({ type: "REMOVE", payload: { id } });
    const after = listing(s, store.getState().program).filter((l) => !l.isElse && !l.node.locked);
    announce(t.removed(text));
    const next = after.find((l) => l.number >= index + 1) ?? after[after.length - 1];
    setSelected(next?.node.id ?? null);
    setFocusId(next?.node.id ?? "none");
  };

  const onHandleKey = (e: KeyboardEvent, id: string) => {
    const actions: Record<string, () => void> = {
      ArrowUp: () => change({ type: "MOVE_BY", payload: { id, delta: -1 } }, id),
      ArrowDown: () => change({ type: "MOVE_BY", payload: { id, delta: 1 } }, id),
      ArrowRight: () => change({ type: "INDENT", payload: { id } }, id),
      ArrowLeft: () => change({ type: "OUTDENT", payload: { id } }, id),
      Delete: () => remove(id),
      Backspace: () => remove(id),
      Escape: () => setSelected(null),
    };
    const act = actions[e.key];
    if (!act) return;
    e.preventDefault();
    act();
  };

  // ─── drag and drop (pointer events: mouse, pen and touch) ──────────────────────────────────────────────────────────

  const depthOf = (pos: Position): number => {
    if (pos.parent === null) return 0;
    const row = rowsRef.current.find((r) => r.type === "line" && r.node.id === pos.parent);
    return row ? row.depth + 1 : 0;
  };

  /** Where a block dropped at this point of the screen goes. */
  const targetAt = (x: number, y: number, source: Source): Target => {
    const root = rootRef.current?.getRootNode() as ShadowRoot | Document | undefined;
    const el = (root as any)?.elementFromPoint?.(x, y) as Element | null;
    if (!el) return null;
    if ("id" in source && el.closest("[data-palette]")) return { remove: true };
    const rowEl = el.closest<HTMLElement>("[data-row]");
    if (!rowEl) return null;
    const key = rowEl.dataset.row!;
    if (key === "tail") return { pos: { parent: null, branch: "body", index: program.length }, key, edge: "top", depth: 0 };
    if (key === "head") return { pos: { parent: null, branch: "body", index: 0 }, key, edge: "bottom", depth: 0 };
    const row = rowsRef.current.find((r) => r.key === key);
    if (!row) return null;
    const r = rowEl.getBoundingClientRect();
    const edge = y < r.top + r.height / 2 ? "top" : "bottom";
    let pos: Position;
    if (row.type === "empty") pos = row.pos;
    else if (row.type === "end") {
      const branch = row.block.kind === "ifelse" ? "other" : "body";
      pos = edge === "top" ? { parent: row.node.id, branch, index: (row.node[branch] ?? []).length } : { ...row.pos, index: row.pos.index + 1 };
    }
    else if (row.type === "else") pos = edge === "top" ? { parent: row.node.id, branch: "body", index: (row.node.body ?? []).length } : { parent: row.node.id, branch: "other", index: 0 };
    else if (edge === "top") pos = row.pos;
    else pos = isContainer(row.block.kind) ? { parent: row.node.id, branch: "body", index: 0 } : { ...row.pos, index: row.pos.index + 1 };
    return { pos, key, edge: row.type === "empty" ? "top" : edge, depth: depthOf(pos) };
  };

  const startDrag = (e: PointerEvent, source: Source, text: string, category: Category) => {
    if (readOnly || e.button !== 0) return;
    drag.current = { source, x0: e.clientX, y0: e.clientY, active: false, text, category };
    let last: Target = null;
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.active && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 6) return;
      d.active = true;
      ev.preventDefault();
      // relative to the root: the ghost is absolute in it, so it follows the pointer also in a player with a transform
      const box = rootRef.current?.getBoundingClientRect();
      setGhost({ x: ev.clientX - (box?.left ?? 0), y: ev.clientY - (box?.top ?? 0), text: d.text, category: d.category });
      last = targetAt(ev.clientX, ev.clientY, d.source);
      setTarget(last);
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      const d = drag.current;
      drag.current = null;
      setGhost(null);
      setTarget(null);
      if (!d?.active || ev.type === "pointercancel") return;
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      const to = targetAt(ev.clientX, ev.clientY, d.source) ?? last;
      if (!to) return;
      if ("remove" in to) {
        if ("id" in d.source) remove(d.source.id);
        return;
      }
      if ("block" in d.source) add(d.source.block, to.pos);
      else change({ type: "MOVE", payload: { id: d.source.id, position: to.pos } }, d.source.id, false);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  // ─── parts of the view ─────────────────────────────────────────────────────────────────────────────────────────────

  const dragging = ghost ? CATEGORY[ghost.category] : null;
  /** Where the dragged block will snap: a piece-shaped gap at the top or bottom of the row. */
  const indicator = (key: string) => {
    if (!target || "remove" in target || target.key !== key || !ghost) return null;
    return (
      <span aria-hidden="true" data-testid="drop-indicator" className={`cb-drop pointer-events-none absolute z-10 h-2.5 w-36 max-w-[60%] ${target.edge === "top" ? "-top-1.5" : "-bottom-1.5"}`}
        style={{ ...colours(ghost.category), left: `calc(1.75rem + ${target.depth} * var(--arm))` }} />
    );
  };

  const armsOf = (arms: Arm[]) => arms.map((a, i) => <span key={i} data-arm aria-hidden="true" className={`cb-arm ${a.locked ? "cb-locked" : ""}`} style={colours(a.category)} />);

  const gutter = (number?: number) => (
    <span aria-hidden="true" className={`w-7 shrink-0 select-none pt-3 pr-1.5 text-right text-[11px] tabular-nums ${number && number === errorLine ? "font-bold text-red-700" : "text-slate-400"}`}>
      {number ?? ""}
    </span>
  );

  const lineRow = (row: Extract<Row, { type: "line" }>) => {
    const { node, block, number } = row;
    const category = categoryOf(block.kind);
    const isSelected = selected === node.id && !readOnly;
    const hasError = number === errorLine;
    const text = spoken(block, node);
    const c = isContainer(block.kind);
    return (
      <div key={row.key} role="listitem" data-row={row.key} data-testid={`line-${number}`} className="relative flex items-stretch">
        {gutter(number)}
        {armsOf(row.arms)}
        <div className="flex min-w-0 flex-1 items-start">
          <div data-piece data-error={hasError || undefined} style={colours(category)}
            className={`cb-piece flex min-h-11 w-fit max-w-full flex-wrap items-center gap-1 py-1 pr-1.5 pl-1.5 ${c ? "cb-c-top" : ""} ${node.locked ? "cb-locked" : ""} ${isSelected ? "cb-selected" : ""} ${hasError ? "cb-error" : ""}`}>
            {readOnly ? <span className="w-1" /> : node.locked ? (
              <span className="inline-flex size-9 shrink-0 items-center justify-center text-white" title={t.locked}><Lock /></span>
            ) : (
              <button type="button" data-handle={node.id} aria-label={t.handle(number, text)} aria-describedby="cb-keys" aria-pressed={isSelected}
                className={`${pieceButton} cursor-grab touch-none text-white/90 active:cursor-grabbing`}
                onPointerDown={(e) => startDrag(e as unknown as PointerEvent, { id: node.id }, text, category)}
                onClick={() => !suppressClick.current && setSelected(isSelected ? null : node.id)}
                onFocus={() => setSelected(node.id)}
                onKeyDown={(e) => onHandleKey(e as unknown as KeyboardEvent, node.id)}>
                <Grip />
              </button>
            )}
            <Label block={block} node={node} number={number} texts={t} disabled={readOnly}
              onValue={(slot, value) => store.dispatch({ type: "SET_VALUE", payload: { id: node.id, slot, value } })} />
            {node.locked && <span className="sr-only">({t.locked})</span>}
            {author?.lineExtra?.(node, number, text)}
            {isSelected && !node.locked && (
              <span className="ml-1 flex shrink-0 items-center rounded-lg bg-black/15" role="group" aria-label={t.handle(number, text)} data-testid="toolbar">
                <button type="button" className={pieceButton} aria-label={t.moveUp} title={t.moveUp} onClick={() => change({ type: "MOVE_BY", payload: { id: node.id, delta: -1 } }, node.id, false)}><Icon d={ICON.up} /></button>
                <button type="button" className={pieceButton} aria-label={t.moveDown} title={t.moveDown} onClick={() => change({ type: "MOVE_BY", payload: { id: node.id, delta: 1 } }, node.id, false)}><Icon d={ICON.down} /></button>
                <button type="button" className={pieceButton} aria-label={t.outdent} title={t.outdent} onClick={() => change({ type: "OUTDENT", payload: { id: node.id } }, node.id, false)}><Icon d={ICON.outdent} /></button>
                <button type="button" className={pieceButton} aria-label={t.indent} title={t.indent} onClick={() => change({ type: "INDENT", payload: { id: node.id } }, node.id, false)}><Icon d={ICON.indent} /></button>
                <button type="button" className={pieceButton} aria-label={t.remove} title={t.remove} onClick={() => remove(node.id)}><Icon d={ICON.remove} /></button>
              </span>
            )}
          </div>
        </div>
        {indicator(row.key)}
      </div>
    );
  };

  const elseRow = (row: Extract<Row, { type: "else" }>) => (
    <div key={row.key} role="listitem" data-row={row.key} data-testid={`line-${row.number}`} className="relative flex items-stretch">
      {gutter(row.number)}
      {armsOf(row.arms)}
      <div className="flex min-w-0 flex-1 items-start">
        <div data-piece className={`cb-piece cb-c-mid flex min-h-9 items-center py-1 pr-3 pl-[calc(var(--arm)+0.5rem)] ${row.node.locked ? "cb-locked" : ""}`} style={colours(categoryOf(row.block.kind))}>
          <span data-label className="text-[14px] font-semibold text-white">{row.block.elseLabel}</span>
        </div>
      </div>
      {indicator(row.key)}
    </div>
  );

  const endRow = (row: Extract<Row, { type: "end" }>) => (
    <div key={row.key} data-row={row.key} aria-hidden="true" className="relative flex items-stretch">
      {gutter()}
      {armsOf(row.arms)}
      <div className="flex min-w-0 flex-1 items-start">
        <div data-end className={`cb-piece cb-c-end ${row.node.locked ? "cb-locked" : ""}`} style={colours(categoryOf(row.block.kind))} />
      </div>
      {indicator(row.key)}
    </div>
  );

  const emptyRow = (row: Extract<Row, { type: "empty" }>) => {
    const over = target && !("remove" in target) && target.key === row.key;
    return (
      <div key={row.key} data-row={row.key} aria-hidden="true" className="relative flex items-stretch">
        {gutter()}
        {armsOf(row.arms)}
        <div className="flex min-w-0 flex-1 items-center pt-2.5 pb-1.5 pl-1">
          <div className={`flex min-h-9 w-44 max-w-full items-center rounded-[7px] border-2 border-dashed px-2.5 text-xs ${over ? "border-slate-900 bg-white text-slate-900" : "border-slate-300 bg-white/70 text-slate-600"}`}>
            {readOnly ? "" : t.emptyBranch}
          </div>
        </div>
      </div>
    );
  };

  const paletteBlocks = s.palette.map((id) => s.blocks[id]).filter(Boolean);
  const groups = (["variables", "control", "io"] as Category[])
    .map((category) => ({ category, blocks: paletteBlocks.filter((b) => categoryOf(b.kind) === category) }))
    .filter((g) => g.blocks.length);
  const full = count >= s.maxBlocks;
  const overTail = target && !("remove" in target) && target.key === "tail";

  return (
    <div ref={rootRef} className="cb-root @container relative flex max-w-full flex-col gap-4 font-sans text-slate-800">
      {!author && s.prompt && <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-slate-700" data-testid="prompt">{s.prompt}</p>}

      <div className={`grid gap-4 ${readOnly ? "" : "@2xl:grid-cols-[minmax(13rem,17rem)_minmax(0,1fr)]"}`}>
        {!readOnly && (
          <section aria-labelledby="cb-blocks" data-palette className="cb-flyout flex flex-col gap-2 rounded-2xl border border-slate-200 p-3">
            <h3 id="cb-blocks" className="m-0 text-xs font-semibold tracking-wide text-slate-600 uppercase">{t.blocks}</h3>
            <p className="m-0 text-xs text-slate-600">{t.blocksHelp}</p>
            <div className="flex flex-col gap-3" data-testid="palette">
              {groups.map(({ category, blocks }) => (
                <div key={category} role="group" aria-labelledby={`cb-cat-${category}`} className="flex flex-col gap-2">
                  <h4 id={`cb-cat-${category}`} className="m-0 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <span aria-hidden="true" className="size-3 rounded-full" style={{ backgroundColor: CATEGORY[category].c }} />
                    {t.categories[category]}
                  </h4>
                  <ul className="m-0 flex list-none flex-col items-start gap-2.5 p-0">
                    {blocks.map((block) => {
                      const isUsed = !s.reuse && (used.get(block.id) ?? 0) > 0;
                      const text = spoken(block);
                      return (
                        <li key={block.id} className="relative flex max-w-full">
                          <button type="button" disabled={isUsed || full} aria-label={t.addBlock(text)} data-block={block.id} style={colours(category)}
                            className="cb-focus flex max-w-full cursor-grab touch-none rounded-[7px] bg-transparent p-0 pb-1 text-left disabled:cursor-not-allowed disabled:opacity-40"
                            onPointerDown={(e) => !isUsed && !full && startDrag(e as unknown as PointerEvent, { block: block.id }, text, category)}
                            onClick={() => !suppressClick.current && add(block.id)}>
                            <BlockShape block={block} texts={t} />
                          </button>
                          {isUsed && <span className="pointer-events-none absolute -top-2 -right-2 z-10 rounded-full border border-slate-300 bg-white px-1.5 text-[11px] font-semibold text-slate-800">{t.used}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="cb-program" className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="cb-program" className="m-0 text-xs font-semibold tracking-wide text-slate-600 uppercase">{author?.title ?? t.program}</h3>
            <span className="text-xs text-slate-600" data-testid="count">{t.count(count, s.maxBlocks)}</span>
          </div>
          <div ref={programRef} tabIndex={-1} data-program className="cb-canvas overflow-x-auto rounded-2xl border border-slate-200 py-3 pr-3 shadow-inner focus:outline-none">
            <div data-row="head" aria-hidden="true" className="relative flex items-stretch pb-0">
              <span className="w-7 shrink-0" />
              <div className="cb-piece cb-hat flex min-h-11 w-fit items-center gap-2 px-3 pb-1.5 text-[14px] font-semibold" style={colours("events")} data-testid="hat">
                <Icon d={ICON.play} className="size-4 fill-current" />{t.hat}
              </div>
              {target && !("remove" in target) && target.key === "head" && indicator("head")}
            </div>
            <div role="list" aria-labelledby="cb-program" data-testid="program">
              {rows.map((row) => (row.type === "line" ? lineRow(row) : row.type === "else" ? elseRow(row) : row.type === "end" ? endRow(row) : emptyRow(row)))}
            </div>
            {!readOnly && (
              <div data-row="tail" className={`relative ml-7 flex items-center rounded-lg text-sm ${program.length ? "min-h-10" : `mt-2 min-h-20 justify-center border-2 border-dashed px-4 text-center ${overTail ? "border-slate-900 bg-white text-slate-900" : "border-slate-300 bg-white/70 text-slate-600"}`}`}>
                {!program.length && t.emptyProgram}
                {overTail && program.length > 0 && dragging && (
                  <span aria-hidden="true" data-testid="drop-indicator" className="cb-drop pointer-events-none absolute top-1 left-0 h-2.5 w-36" style={colours(ghost!.category)} />
                )}
              </div>
            )}
          </div>
          {!readOnly && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p id="cb-keys" className="m-0 max-w-[60ch] text-xs text-slate-600">{t.keyboardHelp}</p>
              {author ? null : confirmReset ? (
                <span className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label={t.startOverSure}>
                  <span>{t.startOverSure}</span>
                  <button type="button" className={button} onClick={() => {
                    store.dispatch({ type: "RESET", payload: {} });
                    setConfirmReset(false);
                    setSelected(null);
                    announce(t.cleared);
                  }}>{t.yes}</button>
                  <button type="button" className={button} onClick={() => setConfirmReset(false)}>{t.no}</button>
                </span>
              ) : (
                <button type="button" className={button} onClick={() => setConfirmReset(true)}>{t.startOver}</button>
              )}
            </div>
          )}
        </section>
      </div>

      {!author && <div className="grid gap-4 @xl:grid-cols-[minmax(10rem,16rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-1">
          <label htmlFor="cb-input" className="text-xs font-semibold tracking-wide text-slate-600 uppercase">{t.input}</label>
          <textarea id="cb-input" rows={4} aria-describedby="cb-input-help" value={state.inputs} readOnly={readOnly || !s.editInputs}
            spellcheck={false} placeholder={readOnly || !s.editInputs ? t.noInput : ""}
            className="min-h-24 resize-y rounded-xl border border-slate-300 bg-white p-2 font-mono text-sm text-slate-900 read-only:bg-slate-50 read-only:text-slate-600 focus:border-sky-500 focus:outline-2 focus:outline-sky-200"
            onInput={(e) => store.dispatch({ type: "SET_INPUTS", payload: { value: (e.target as HTMLTextAreaElement).value } })} />
          <p id="cb-input-help" className="m-0 text-xs text-slate-600">{t.inputHelp}</p>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <h3 id="cb-output" className="m-0 text-xs font-semibold tracking-wide text-slate-600 uppercase">{t.output}</h3>
            {!readOnly && (
              <button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-emerald-700 px-5 text-sm font-bold text-white shadow-[inset_0_-2px_0_rgba(0,0,0,0.2)] hover:bg-emerald-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                onClick={() => {
                  store.dispatch({ type: "RUN", payload: {} });
                  const r = store.getState().run;
                  if (r) announce(r.error ? t.ranWithError(errorMessage(t, r.error)) : t.ran(r.output.length));
                }}>
                <Icon d={ICON.play} className="size-4 fill-current" />{t.run}
              </button>
            )}
          </div>
          <div role="region" aria-labelledby="cb-output" data-testid="output"
            className="max-h-72 min-h-24 overflow-auto rounded-2xl border border-slate-800 bg-slate-900 p-3 font-mono text-sm leading-6 text-slate-100 shadow-sm">
            {!run && <p className="m-0 font-sans text-slate-400">{t.notRun}</p>}
            {run && run.output.map((line, i) => <div key={i} className="whitespace-pre-wrap" data-testid="output-line">{line}</div>)}
            {run && !run.error && !run.output.length && <p className="m-0 font-sans text-slate-400">{t.nothingPrinted}</p>}
            {run && !run.error && <p className="m-0 mt-1 font-sans text-xs text-emerald-300">{t.finished}</p>}
            {run?.error && <p className="m-0 mt-1 font-sans text-red-300" data-testid="error">⚠ {errorMessage(t, run.error)}</p>}
          </div>
        </div>
      </div>}

      <p role="status" className="sr-only">{message}</p>

      {ghost && dragging && (
        <div aria-hidden="true" data-testid="drag-ghost" className="cb-piece cb-ghost pointer-events-none z-50 flex items-center px-3 py-2 text-[14px] font-semibold text-white"
          style={{ ...colours(ghost.category), position: "absolute", left: `${ghost.x + 8}px`, top: `${ghost.y + 8}px` }}>
          {ghost.text.split("___").join("▢")}
        </div>
      )}
    </div>
  );
};

export default Interaction;
