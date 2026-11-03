// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/wordrank, © OpenPCI, Aarhus University and Aalborg University
// (Elias J.T. Hansen, Anna Rusmann, Jeppe Bundsgaard)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { IStore, useStore } from "@citolab/preact-store";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { Actions, PILES, StateModel, UNSORTED } from "./store";
import { Layout, formatValue, slotIndex, slotPosition } from "./qsort";
import { Texts } from "./texts";

// The candidate places statement cards in a Q-sort grid: columns from the lowest value to the highest, each with a
// fixed number of places. Horizontal: columns left to right, the cards in a column top to bottom. Vertical: rows
// with the highest value on top, the cards in a row side by side. With a pre-sort it takes two steps, as in Brown's
// procedure: first the cards come one at a time from a stack, to be put on three piles (low, neutral, high); once
// every card is on a pile the grid appears, and the cards go from the piles into the grid.
// Three ways to move a card, all ending in the same store actions:
// - drag it with mouse, pen or finger (pointer events: the card follows the pointer, the place under it lights up);
// - click (or tap) a card to pick it up, then click a place, another card (they swap) or a pile;
// - keyboard: Space or Enter picks up the focused card, the arrow keys choose a place (beyond the grid: the piles),
//   Space or Enter puts it down, Escape cancels, Delete puts a placed card back on its pile. A live region says
//   where the card is.

/** A place for a card: a place in the grid (0…) or a pile (-1: unsorted, -2 … -4: the pre-sort piles). */
const pileTarget = (pile: number) => -(pile + 1);
const pileOfTarget = (target: number) => -target - 1;

type Drag = { statement: number; x: number; y: number; offsetX: number; offsetY: number; width: number; height: number };

/** Low values red, high values green, 0 grey: the same on the grid and on the piles. */
const tone = (value: number) =>
  value < 0 ? "bg-rose-100 text-rose-900" : value > 0 ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-800";
const pileTone = ["", "bg-rose-50", "bg-slate-100", "bg-emerald-50"];

const Interaction = ({ layout, store, texts }: { layout: Layout; store: IStore<StateModel, Actions>; texts: Texts }) => {
  const { presented, slots, piles } = useStore(store);
  const { columns, values, statements, orientation, lowLabel, highLabel, presort, presortLabels } = layout;
  const horizontal = orientation === "horizontal";
  const last = columns.length - 1;

  /** The card picked up by click or keyboard, and where it would go. */
  const [grabbed, setGrabbed] = useState<number | null>(null);
  const [target, setTarget] = useState<number>(pileTarget(UNSORTED));
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const root = useRef<HTMLDivElement>(null);
  /** A card that is put down, and where: focus it once it is there. */
  const focusAfterRender = useRef<{ statement: number; at: number } | null>(null);
  const press = useRef<{ statement: number; x: number; y: number; rect: DOMRect; started: boolean } | null>(null);
  const suppressClick = useRef(false);

  const placeOf = (statement: number) => {
    const slot = slots.indexOf(statement);
    return slot >= 0 ? slot : pileTarget(presort ? piles[statement] ?? UNSORTED : UNSORTED);
  };

  // a card that moved is a new button somewhere else: give it the focus back (before a next key can go elsewhere)
  useLayoutEffect(() => {
    const pending = focusAfterRender.current;
    if (!pending || placeOf(pending.statement) !== pending.at) return; // not rendered in its new place yet
    focusAfterRender.current = null;
    root.current?.querySelector<HTMLButtonElement>(`[data-statement="${pending.statement}"]`)?.focus();
  });

  const announce = (text: string) => setMessage((m) => (m === text ? `${text} ` : text)); // a change is read again

  const unsorted = presented.filter((s) => !slots.includes(s) && (!presort || (piles[s] ?? UNSORTED) === UNSORTED));
  /** The first step of a pre-sort: cards on the stack, the grid not shown yet. */
  const sorting = presort && unsorted.length > 0;
  const poolTargets = presort ? (sorting ? [UNSORTED, ...PILES] : PILES).map(pileTarget) : [pileTarget(UNSORTED)];
  const pileName = (pile: number) => (pile === UNSORTED ? texts.unsorted : presortLabels[pile - 1]);
  const columnName = (column: number) =>
    texts.column(formatValue(values[column]), column === 0 ? lowLabel : column === last ? highLabel : "");
  const describe = (place: number) => {
    if (place < 0) return presort ? texts.pile(pileName(pileOfTarget(place))) : texts.poolTarget;
    const { column, place: at } = slotPosition(columns, place);
    return texts.place(columnName(column), at + 1, columns[column]);
  };
  const describeTarget = (place: number) => {
    if (place < 0) return describe(place);
    const occupant = slots[place];
    return occupant === null || occupant === undefined
      ? texts.emptyPlace(describe(place))
      : texts.occupiedPlace(describe(place), statements[occupant].text);
  };

  const pickUp = (statement: number) => {
    const at = placeOf(statement);
    focusAfterRender.current = null; // a card the candidate moves on to: the last one does not take the focus back
    setGrabbed(statement);
    setTarget(at);
    announce(texts.pickedUp(statements[statement].text, describeTarget(at)));
  };
  const cancel = () => {
    if (grabbed !== null) announce(texts.cancelled(statements[grabbed].text));
    setGrabbed(null);
  };

  /** Put a card down: in the grid (a card there takes its old place) or on a pile. */
  const putDown = (statement: number, place: number) => {
    const from = placeOf(statement);
    setGrabbed(null);
    focusAfterRender.current = { statement, at: place };
    if (place === from) {
      announce(texts.cancelled(statements[statement].text));
      return;
    }
    if (place < 0) {
      const pile = pileOfTarget(place);
      store.dispatch({ type: "PILE", payload: { statement, pile } });
      // the last card off the stack: the grid appears
      const sorted = sorting && pile !== UNSORTED && unsorted.length === 1 && unsorted[0] === statement;
      const moved = from === pileTarget(UNSORTED) ? texts.dropped : texts.returned; // off the stack, or back from the grid
      announce(`${moved(statements[statement].text, describe(place))}${sorted ? ` ${texts.gridShown}` : ""}`);
      return;
    }
    const other = slots[place];
    store.dispatch({ type: "PLACE", payload: { statement, slot: place } });
    announce(
      other !== null && other !== undefined
        ? texts.swapped(statements[statement].text, statements[other].text, describe(place))
        : texts.dropped(statements[statement].text, describe(place))
    );
  };

  /** A place in another column: horizontal the same height (or the lowest there), vertical the same distance from the middle. */
  const across = (column: number, place: number, next: number) =>
    horizontal
      ? slotIndex(columns, next, Math.min(place, columns[next] - 1))
      : slotIndex(
          columns,
          next,
          Math.min(columns[next] - 1, Math.max(0, Math.round(place + 0.5 - columns[column] / 2 + columns[next] / 2 - 0.5)))
        );

  /**
   * The arrow keys. Horizontal: left and right through the columns, up and down in a column, down from its last place
   * to the piles. Vertical: up and down through the rows (the highest on top), left and right in a row, down from the
   * bottom row to the piles. On the piles: left and right, up back to the grid (not while pre-sorting: no grid yet).
   */
  const step = (from: number, key: string): number => {
    if (from < 0) {
      const i = Math.max(0, poolTargets.indexOf(from));
      if (key === "ArrowLeft") return poolTargets[Math.max(0, i - 1)];
      if (key === "ArrowRight") return poolTargets[Math.min(poolTargets.length - 1, i + 1)];
      if (key !== "ArrowUp" || sorting) return from;
      const middle = Math.floor(columns.length / 2);
      return horizontal ? slotIndex(columns, middle, columns[middle] - 1) : slotIndex(columns, 0, Math.floor(columns[0] / 2));
    }
    const { column, place } = slotPosition(columns, from);
    const [previous, next, up, down] = horizontal
      ? ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]
      : ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"];
    if (key === previous) return column > 0 ? across(column, place, column - 1) : horizontal ? from : poolTargets[0];
    if (key === next) return column < last ? across(column, place, column + 1) : from;
    if (key === up) return place > 0 ? from - 1 : from;
    if (key === down) return place < columns[column] - 1 ? from + 1 : horizontal ? poolTargets[0] : from;
    return from;
  };

  const onKeyDown = (statement: number) => (e: KeyboardEvent) => {
    if (grabbed === statement) {
      if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const next = step(target, e.key);
        setTarget(next);
        announce(texts.over(describeTarget(next)));
      } else if (e.key === "Escape" || e.key === "Tab") {
        if (e.key === "Escape") e.preventDefault();
        cancel();
      }
      return; // Space and Enter: the click
    }
    if ((e.key === "Delete" || e.key === "Backspace") && slots.includes(statement)) {
      e.preventDefault();
      setGrabbed(null);
      store.dispatch({ type: "REMOVE", payload: { statement } });
      const back = pileTarget(presort ? piles[statement] ?? UNSORTED : UNSORTED);
      focusAfterRender.current = { statement, at: back };
      announce(texts.returned(statements[statement].text, describe(back)));
    }
  };

  const onCardClick = (statement: number) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (grabbed === null) pickUp(statement);
    else if (grabbed === statement) putDown(statement, target);
    else putDown(grabbed, placeOf(statement)); // on another card: take its place (in the grid it takes ours)
  };
  const onPlaceClick = (place: number) => (e: MouseEvent) => {
    if (grabbed === null || (e.target as HTMLElement).closest("[data-statement]")) return;
    putDown(grabbed, place);
  };

  // dragging: the button keeps the pointer, the place under it is found by its position
  const placeAt = (x: number, y: number): number | null => {
    const host = root.current?.getRootNode() as Document | ShadowRoot | undefined;
    const el = (host?.elementFromPoint ? host.elementFromPoint(x, y) : document.elementFromPoint(x, y)) as HTMLElement | null;
    const place = el?.closest<HTMLElement>("[data-slot],[data-pile]");
    if (!place || !root.current?.contains(place)) return null;
    return place.hasAttribute("data-pile") ? pileTarget(Number(place.dataset.pile)) : Number(place.dataset.slot);
  };
  const onPointerDown = (statement: number) => (e: PointerEvent) => {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    press.current = { statement, x: e.clientX, y: e.clientY, rect: el.getBoundingClientRect(), started: false };
    el.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const p = press.current;
    if (!p) return;
    if (!p.started) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5) return;
      p.started = true;
      setGrabbed(null);
    }
    setDrag({
      statement: p.statement, x: e.clientX, y: e.clientY,
      offsetX: p.x - p.rect.left, offsetY: p.y - p.rect.top, width: p.rect.width, height: p.rect.height,
    });
    setDragOver(placeAt(e.clientX, e.clientY));
  };
  const onPointerUp = (e: PointerEvent) => {
    const p = press.current;
    press.current = null;
    if (!p?.started) return; // a click
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 0);
    const place = placeAt(e.clientX, e.clientY);
    setDrag(null);
    setDragOver(null);
    if (place !== null) putDown(p.statement, place);
  };
  const onPointerCancel = () => {
    press.current = null;
    setDrag(null);
    setDragOver(null);
  };

  const active = drag ? dragOver : grabbed !== null ? target : null; // the place that lights up
  const moving = drag?.statement ?? grabbed;

  const card = (statement: number, inGrid: boolean) => {
    const { text, title } = statements[statement];
    const label = texts.statementIn(text, describe(placeOf(statement)));
    return (
      <button key={statement} type="button" data-statement={statement} data-testid={`statement-${statement}`}
        title={title !== text ? title : undefined}
        aria-label={title !== text ? `${label}. ${title}` : label}
        aria-pressed={grabbed === statement}
        aria-describedby="q-sort-hint"
        onClick={() => onCardClick(statement)} onKeyDown={onKeyDown(statement)}
        onPointerDown={onPointerDown(statement)} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className={`touch-none select-none rounded-md border bg-white text-left leading-snug text-slate-800 [overflow-wrap:anywhere] [hyphens:auto]
          transition-[transform,box-shadow,opacity,border-color] duration-150 ease-out
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600
          ${inGrid ? "h-full w-full px-2 py-1.5 text-xs sm:text-[13px]" : "px-3 py-2 text-sm"}
          ${drag?.statement === statement ? "opacity-30" : ""}
          ${grabbed === statement
            ? "-translate-y-0.5 cursor-grabbing border-sky-600 shadow-lg ring-2 ring-sky-600"
            : "cursor-grab border-slate-300 shadow-sm hover:-translate-y-px hover:border-slate-400 hover:shadow-md"}`}>
        {text}
      </button>
    );
  };

  const preview = moving !== null && active !== null && active >= 0 && active !== placeOf(moving) ? active : null;

  const cell = (column: number, place: number) => {
    const slot = slotIndex(columns, column, place);
    const statement = slots[slot];
    const empty = statement === null || statement === undefined;
    return (
      <div key={place} data-slot={slot} data-testid={`slot-${slot}`} onClick={onPlaceClick(slot)}
        className={`flex min-h-16 items-stretch justify-stretch rounded-md border-2 transition-[background-color,border-color,box-shadow] duration-150
          ${horizontal ? "w-full" : "w-28 shrink-0 sm:w-32"}
          ${active === slot
            ? "border-sky-600 bg-sky-100 shadow-[0_0_0_3px_rgba(2,132,199,.2)]"
            : empty ? "border-dashed border-slate-300 bg-slate-50" : "border-transparent bg-slate-50"}
          ${grabbed !== null && empty ? "cursor-pointer" : ""}`}>
        {!empty
          ? card(statement, true)
          : preview === slot
            ? <span className="m-auto px-2 text-center text-xs text-sky-800/60" aria-hidden="true">{statements[moving].text}</span>
            : null}
      </div>
    );
  };

  const header = (column: number) => (
    <div className={`rounded-md px-2 py-1 text-center text-sm font-semibold tabular-nums ${tone(values[column])}`}
      aria-hidden="true" data-testid={`value-${column}`}>
      {formatValue(values[column])}
    </div>
  );

  /** The two ends of the scale, with an arrow from low to high. */
  const scale = (
    <div aria-hidden="true" data-testid="scale"
      className={`flex items-center gap-2 text-xs font-medium text-slate-600 sm:text-sm ${horizontal ? "" : "w-16 shrink-0 flex-col text-center sm:w-20"}`}>
      <span className={horizontal ? "text-rose-800" : "text-emerald-800"}>{horizontal ? lowLabel : highLabel}</span>
      <span className={`flex-1 from-rose-300 via-slate-300 to-emerald-300 ${horizontal ? "h-0.5 bg-linear-to-r" : "w-0.5 bg-linear-to-t"}`} />
      <span className={horizontal ? "text-emerald-800" : "text-rose-800"}>{horizontal ? highLabel : lowLabel}</span>
    </div>
  );

  const grid = horizontal ? (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max gap-1.5 sm:min-w-0">
        {columns.map((places, column) => (
          <div key={column} className="flex w-24 shrink-0 flex-col gap-1.5 sm:w-auto sm:min-w-0 sm:flex-1" data-testid={`column-${column}`}>
            {header(column)}
            {Array.from({ length: places }, (_, place) => cell(column, place))}
          </div>
        ))}
      </div>
    </div>
  ) : (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max flex-col gap-1.5">
        {columns.map((_, i) => last - i).map((column) => (
          <div key={column} className="flex items-stretch gap-1.5" data-testid={`column-${column}`}>
            <div className="flex w-12 shrink-0 flex-col justify-center">{header(column)}</div>
            <div className="flex flex-1 justify-center gap-1.5">
              {Array.from({ length: columns[column] }, (_, place) => cell(column, place))}
            </div>
            <div className="w-12 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );

  const placed = slots.filter((s) => s !== null && s !== undefined).length;
  const total = Math.min(presented.length, slots.length);

  const pileBox = (pile: number) => {
    const here = presented.filter((s) => !slots.includes(s) && (piles[s] ?? UNSORTED) === pile);
    const lit = active === pileTarget(pile);
    return (
      <div key={pile} role="group" aria-label={pileName(pile)} data-pile={pile} data-testid={`pile-${pile}`}
        onClick={onPlaceClick(pileTarget(pile))}
        className={`flex min-h-24 min-w-0 flex-col gap-1.5 rounded-xl border-2 p-2 transition-[background-color,border-color] duration-150
          ${lit ? "border-sky-600 bg-sky-50" : `border-transparent ${pileTone[pile]}`}
          ${grabbed !== null && placeOf(grabbed) !== pileTarget(pile) ? "cursor-pointer" : ""}`}>
        <div className="flex items-baseline justify-between gap-2 text-xs font-semibold text-slate-700 sm:text-sm">
          <span>{pileName(pile)}</span>
          <span className="tabular-nums text-slate-500">{here.length}</span>
        </div>
        {here.map((s) => card(s, false))}
      </div>
    );
  };

  return (
    <div ref={root} className="flex w-full max-w-5xl flex-col gap-4 font-sans text-slate-800">
      <p id="q-sort-hint" className="m-0 text-sm text-slate-600">
        {!presort ? texts.hint : sorting ? texts.hintPresort : texts.hintGrid(presortLabels[2], presortLabels[0])}
      </p>

      {sorting ? null : <div role="group" aria-label={texts.grid} data-testid="grid" data-orientation={orientation}
        className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_rgba(16,24,40,.06)] sm:p-4">
        {horizontal ? scale : null}
        {horizontal ? grid : (
          <div className="flex gap-3">
            {scale}
            <div className="min-w-0 flex-1">{grid}</div>
          </div>
        )}
        <p className="m-0 text-right text-xs tabular-nums text-slate-500" data-testid="progress">{texts.progress(placed, total)}</p>
      </div>}

      {presort && !sorting ? (
        <div className="grid grid-cols-3 gap-2">{PILES.map(pileBox)}</div>
      ) : presort ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <div role="group" aria-label={texts.unsorted} data-pile={UNSORTED} data-testid={`pile-${UNSORTED}`}
            onClick={onPlaceClick(pileTarget(UNSORTED))}
            className={`flex min-h-24 flex-col gap-2 rounded-xl border-2 p-3 transition-[background-color,border-color] duration-150 sm:w-56 sm:shrink-0
              ${active === pileTarget(UNSORTED) ? "border-sky-600 bg-sky-50" : "border-transparent bg-sky-50/70"}`}>
            <div className="flex items-baseline justify-between gap-2 text-sm font-semibold text-slate-700">
              <span>{texts.unsorted}</span>
              <span className="text-xs font-normal text-slate-500">{texts.unsortedCount(unsorted.length)}</span>
            </div>
            {/* one card at a time, the next on top of the stack */}
            {unsorted.length > 0
              ? <div className={unsorted.length > 1 ? "rounded-md shadow-[3px_3px_0_-1px_#fff,3px_3px_0_0_#cbd5e1]" : ""}>{card(unsorted[0], false)}</div>
              : <p className="m-0 text-sm text-slate-500">{texts.poolEmpty}</p>}
          </div>
          <div className="grid flex-1 grid-cols-3 gap-2">{PILES.map(pileBox)}</div>
        </div>
      ) : (
        <div role="group" aria-label={texts.pool} data-pile={UNSORTED} data-testid={`pile-${UNSORTED}`} onClick={onPlaceClick(pileTarget(UNSORTED))}
          className={`flex min-h-20 flex-wrap content-start items-start gap-2 rounded-xl border-2 p-3 transition-[background-color,border-color] duration-150
            ${active === pileTarget(UNSORTED) ? "border-sky-600 bg-sky-50" : "border-transparent bg-slate-100"}
            ${grabbed !== null && slots.includes(grabbed) ? "cursor-pointer" : ""}`}>
          {unsorted.length > 0 ? unsorted.map((s) => card(s, false)) : <p className="m-0 self-center text-sm text-slate-500">{texts.poolEmpty}</p>}
        </div>
      )}

      <div aria-live="assertive" aria-atomic="true" className="sr-only" data-testid="live">{message}</div>

      {drag && (
        <div aria-hidden="true"
          className="pointer-events-none fixed z-50 flex rotate-2 items-center rounded-md border border-sky-600 bg-white px-3 py-2 text-sm leading-snug text-slate-800 shadow-xl"
          style={{ left: `${drag.x - drag.offsetX}px`, top: `${drag.y - drag.offsetY}px`, width: `${drag.width}px`, minHeight: `${drag.height}px` }}>
          {statements[drag.statement].text}
        </div>
      )}
    </div>
  );
};

export default Interaction;
