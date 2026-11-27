import type { PciProperties } from "@citolab/tspci";
import type { JSX } from "preact";
import { useRef, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import configProps from "./config.json";
import { Counts, Currency, PieceDef, TaskModel, asksFewest, defOf, formatAmount, isChange, left, pieceCount, piecesOf, settingsProblems, totalOf } from "./money";
import { Piece } from "./pieces";
import { Actions, StateModel } from "./store";
import { Texts, describe, kindOf, problemText, textsFor } from "./texts";

type PropTypes = PciProperties<typeof configProps>;

type Props = {
  config: PropTypes;
  model: TaskModel;
  store: IStore<StateModel, Actions>;
  readOnly: boolean; // review, solution, closed: show the answer, but do not change it
};

/** A piece being dragged: from the supply onto the counter, or from the counter off it. */
type Drag = { value: number; from: "supply" | "counter"; pointerId: number; startX: number; startY: number; x: number; y: number; moving: boolean; over: boolean };
/** How far the pointer moves before a press becomes a drag (a shorter one is a click). */
const DRAG_THRESHOLD = 5;

/**
 * The shop: the task on a card (the price, what the customer pays with), the counter where the money goes, and the
 * supply of coins and notes below it. A piece goes onto the counter by dragging it there, by a click, or with Enter or
 * Space on its button; it comes off by dragging it away, a click on it on the counter, or the − button in the supply.
 * In the count task the counter holds the author's money, and the candidate writes the amount in the answer box.
 * Read-only (review, solution, closed): the counter (or the answer box) without the supply.
 */
const Interaction = ({ config, model, store, readOnly }: Props) => {
  const state = useStore(store); // re-renders when the store changes
  const t = textsFor(config.language, model);
  const language = config.language;
  const { task, supply, currency, pieces } = model;
  const pieceOf: PieceOf = (value, scale) => <Piece def={defOf(pieces, value, currency)} currency={currency} scale={scale} />;
  const counting = task === "count";
  const counter: Counts = counting ? model.counter : state.tray;
  const problems = settingsProblems(model);

  const add = (value: number) => !readOnly && store.dispatch({ type: "ADD", payload: { value } });
  const remove = (value: number) => !readOnly && store.dispatch({ type: "REMOVE", payload: { value } });

  // ---- dragging: pointer events on the whole PCI, captured once the press has become a drag ----
  const rootRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** After a drag, the click that may follow is not a click on the piece. */
  const afterDrag = useRef(false);

  const overCounter = (x: number, y: number) => {
    const box = counterRef.current?.getBoundingClientRect();
    return !!box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  };
  const press = (e: PointerEvent, value: number, from: Drag["from"]) => {
    if (readOnly || counting || e.button !== 0) return;
    dragRef.current = { value, from, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, moving: false, over: from === "counter" };
  };
  const move = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.moving) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
      d.moving = true;
      try {
        rootRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // a synthetic event without an active pointer: the events still bubble to the root
      }
    }
    e.preventDefault();
    const next = { ...d, x: e.clientX, y: e.clientY, over: overCounter(e.clientX, e.clientY) };
    dragRef.current = next;
    setDrag(next);
  };
  const drop = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    dragRef.current = null;
    if (!d.moving) return; // a click: the button's onClick does it
    setDrag(null);
    afterDrag.current = true;
    setTimeout(() => (afterDrag.current = false), 0);
    const over = overCounter(e.clientX, e.clientY);
    if (d.from === "supply" && over) add(d.value);
    if (d.from === "counter" && !over) remove(d.value);
  };
  const cancel = () => {
    dragRef.current = null;
    setDrag(null);
  };
  const click = (action: () => void) => () => {
    if (afterDrag.current) return;
    action();
  };

  const total = totalOf(counter);
  const showTotal = config.showTotal === "true" && !counting;

  return (
    <div
      ref={rootRef}
      className="money font-sans text-ink select-none"
      onPointerMove={(e) => move(e as unknown as PointerEvent)}
      onPointerUp={(e) => drop(e as unknown as PointerEvent)}
      onPointerCancel={cancel}
    >
      {config.title && <h2 className="text-[1.4em] leading-tight font-extrabold">{config.title}</h2>}
      {config.question && <p className="mt-1 leading-relaxed">{config.question}</p>}

      {problems.length > 0 && (
        <p role="alert" className="mt-3 rounded-lg border-2 border-amber-500 bg-amber-50 px-3 py-2 text-amber-900">
          {problems.map((p) => problemText(p, t, model)).join(" ")}
        </p>
      )}

      <TaskCard model={model} t={t} language={language} pieceOf={pieceOf} />

      {/* The counter: where the money goes (or lies, in the count task) */}
      <section
        ref={counterRef}
        aria-label={t.counter}
        data-counter
        className={`counter mt-4 rounded-2xl border-2 px-4 pt-2 pb-4 ${drag?.from === "supply" && drag.over ? "counter-over" : ""}`}
      >
        <div className="flex items-baseline justify-between">
          <h3 className="text-[0.85em] font-bold tracking-wide text-counter-ink uppercase">{t.counter}</h3>
          {showTotal && (
            <p className="font-bold" data-total>
              {t.total}: {formatAmount(total, language, currency)}
            </p>
          )}
        </div>
        <CounterPieces
          counts={counter}
          pieces={pieces}
          pieceOf={pieceOf}
          t={t}
          movable={!readOnly && !counting}
          onPress={(e, value) => press(e, value, "counter")}
          onClick={(value) => click(() => remove(value))()}
        />
        {pieceCount(counter) === 0 && !readOnly && <p className="py-6 text-center text-counter-ink">{t.counterEmpty}</p>}
        {/* what is on the counter, for a screen reader: said again after every change */}
        <p className="sr-only" aria-live="polite" data-describe>
          {t.counterHolds(describe(counter, t))}
        </p>
      </section>

      {counting ? (
        <AnswerBox state={state} store={store} t={t} readOnly={readOnly} currency={currency} />
      ) : (
        // read-only (review, solution): the counter is the answer, the supply is not needed
        !readOnly && <Drawer
          supply={supply}
          pieces={pieces}
          pieceOf={pieceOf}
          tray={state.tray}
          t={t}
          readOnly={readOnly}
          onPress={(e, value) => press(e, value, "supply")}
          onAdd={(value) => click(() => add(value))()}
          onRemove={remove}
        />
      )}

      {/* the piece under the pointer while dragging */}
      {drag?.moving && (
        <div className="drag-ghost" style={{ left: `${drag.x}px`, top: `${drag.y}px` }} aria-hidden="true">
          {pieceOf(drag.value)}
        </div>
      )}
    </div>
  );
};

/** The task: what to pay, or the price and what the customer pays with, or the question of the count task. */
/** A coin or note by its value, drawn as it looks in the currency. */
type PieceOf = (value: number, scale?: number) => JSX.Element;

function TaskCard({ model, t, language, pieceOf }: { model: TaskModel; t: Texts; language: string; pieceOf: PieceOf }) {
  const { task, price, given, asked, currency } = model;
  if (task === "count") return <p className="task mt-3 font-semibold">{t.count}</p>;
  if (isChange(task))
    return (
      <div className="task mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="price-tag" data-price>
          <span className="text-[0.8em] font-semibold uppercase">{t.price}</span>
          <span className="text-[1.5em] leading-none font-extrabold">{price === null ? "?" : formatAmount(price, language, currency)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-semibold">{t.customerGives}</span>
          <ul className="flex flex-wrap items-center gap-2" aria-label={t.customerGives}>
            {piecesOf(given).map((value, i) => (
              <li key={i} aria-label={t.piece(value)}>
                {pieceOf(value, 0.8)}
              </li>
            ))}
          </ul>
        </div>
        <p className="w-full font-semibold">{asksFewest(task) ? t.changeFewest : t.change}</p>
      </div>
    );
  const amount = asked === null ? "?" : formatAmount(asked, language, currency);
  return (
    <div className="task mt-3 flex flex-wrap items-center gap-4">
      <div className="price-tag" data-price>
        <span className="text-[1.5em] leading-none font-extrabold">{amount}</span>
      </div>
      <p className="font-semibold">{task === "fewest" ? t.fewest(amount) : t.pay(amount)}</p>
    </div>
  );
}

/** The money on the counter, notes first, then the coins, each kind together and large to small. */
function CounterPieces(props: {
  counts: Counts;
  pieces: PieceDef[];
  pieceOf: PieceOf;
  t: Texts;
  movable: boolean;
  onPress: (e: PointerEvent, value: number) => void;
  onClick: (value: number) => void;
}) {
  const { counts, t, movable, pieceOf } = props;
  const pieces = piecesOf(counts);
  if (pieces.length === 0) return null;
  const notes = pieces.filter((value) => kindOf(value, props.pieces) === "note");
  const coins = pieces.filter((value) => kindOf(value, props.pieces) === "coin");
  const row = (values: number[], kind: string) =>
    values.length > 0 && (
      <ul className={`flex flex-wrap items-center gap-x-2 gap-y-2 ${kind}`}>
        {values.map((value, i) => {
          const gap = i > 0 && values[i - 1] !== value; // a little more room between two kinds
          return (
            <li key={`${value}-${i}`} className={gap ? "ml-3" : ""}>
              {movable ? (
                <button
                  type="button"
                  tabIndex={-1}
                  className="counter-piece"
                  data-value={value}
                  aria-label={t.remove(t.piece(value))}
                  onPointerDown={(e) => props.onPress(e as unknown as PointerEvent, value)}
                  onClick={() => props.onClick(value)}
                >
                  {pieceOf(value)}
                </button>
              ) : (
                <span className="block" data-value={value} role="img" aria-label={t.piece(value)}>
                  {pieceOf(value)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    );
  return (
    <div className="mt-2 flex flex-col gap-3" data-pieces>
      {row(notes, "notes")}
      {row(coins, "coins")}
    </div>
  );
}

/**
 * A button that had the focus and is disabled by its own click (the last coin taken off, the last one of a limited
 * supply put on) would lose the focus: it goes to the other button of the compartment.
 */
function keepFocus(button: HTMLElement, other: string) {
  if ((button.getRootNode() as Document | ShadowRoot).activeElement !== button) return;
  setTimeout(() => {
    if ((button as HTMLButtonElement).disabled) button.closest("li")?.querySelector<HTMLElement>(other)?.focus();
  }, 0);
}

/** The supply: a compartment per coin or note with the piece (a button: add one), − (take one off) and the count. */
function Drawer(props: {
  supply: TaskModel["supply"];
  pieces: PieceDef[];
  pieceOf: PieceOf;
  tray: Counts;
  t: Texts;
  readOnly: boolean;
  onPress: (e: PointerEvent, value: number) => void;
  onAdd: (value: number) => void;
  onRemove: (value: number) => void;
}) {
  const { supply, tray, t, readOnly, pieceOf } = props;
  const notes = supply.filter((s) => kindOf(s.value, props.pieces) === "note");
  const coins = supply.filter((s) => kindOf(s.value, props.pieces) === "coin");
  const compartment = ({ value, limit }: { value: number; limit: number | null }) => {
    const onCounter = tray[value] ?? 0;
    const remaining = left(supply, tray, value);
    const piece = t.piece(value);
    return (
      <li key={value} className="compartment" data-supply={value}>
        <button
          type="button"
          className="supply-piece"
          aria-label={t.add(piece)}
          disabled={readOnly || remaining <= 0}
          onPointerDown={(e) => props.onPress(e as unknown as PointerEvent, value)}
          onClick={(e) => {
            keepFocus(e.currentTarget as HTMLElement, ".minus");
            props.onAdd(value);
          }}
        >
          {pieceOf(value)}
        </button>
        <div className="mt-1 flex items-center gap-1.5">
          <button type="button" className="minus" aria-label={t.remove(piece)} disabled={readOnly || onCounter === 0}
            onClick={(e) => {
              keepFocus(e.currentTarget as HTMLElement, ".supply-piece");
              props.onRemove(value);
            }}>
            −
          </button>
          <span className="count" aria-label={t.onCounter(onCounter)} data-count>
            {onCounter}
          </span>
        </div>
        {limit !== null && (
          <span className="text-[0.75em] text-slate-600" data-left>
            {t.left(remaining)}
          </span>
        )}
      </li>
    );
  };
  return (
    <section aria-label={t.drawer} className="drawer mt-4 rounded-2xl p-3">
      <h3 className="sr-only">{t.drawer}</h3>
      {notes.length > 0 && <ul className="flex flex-wrap items-stretch gap-3">{notes.map(compartment)}</ul>}
      {coins.length > 0 && <ul className={`flex flex-wrap items-stretch gap-3 ${notes.length ? "mt-3" : ""}`}>{coins.map(compartment)}</ul>}
    </section>
  );
}

/** The count task: the amount the candidate writes. */
function AnswerBox({ state, store, t, readOnly, currency }: { state: StateModel; store: IStore<StateModel, Actions>; t: Texts; readOnly: boolean; currency: Currency }) {
  // the sign of the currency where it goes: before (€, $, £, R$) or after (kr) the amount; the box checks the amount
  // itself (index.tsx: an amount the PCI can not read makes it invalid)
  const sign = (
    <span aria-hidden="true" className="font-bold" data-sign>
      {currency.sign}
    </span>
  );
  return (
    <div className="mt-4 flex items-center gap-3">
      <label htmlFor="answer" className="font-semibold">
        {t.answer}
      </label>
      <span className="answer-box">
        {currency.position === "before" && sign}
        <input
          id="answer"
          data-answer
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className="answer"
          title={t.notAnAmount}
          placeholder={t.answerHint}
          value={state.answer}
          disabled={readOnly}
          onInput={(e) => store.dispatch({ type: "SET_ANSWER", payload: { value: e.currentTarget.value } })}
        />
        {currency.position === "after" && sign}
      </span>
    </div>
  );
}

export default Interaction;
