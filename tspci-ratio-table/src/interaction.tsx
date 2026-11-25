import type { PciProperties } from "@citolab/tspci";
import { Fragment } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import configProps from "./config.json";
import { Actions, ArrowSide, MAX_COLUMNS, MIN_COLUMNS, Operator, ROWS, StateModel, answerCell, answerOf, columnIsFixed } from "./store";
import { Texts, textsFor } from "./texts";

type PropTypes = PciProperties<typeof configProps>;

type Props = {
  config: PropTypes;
  store: IStore<StateModel, Actions>;
  readOnly: boolean; // review, solution, closed: show the answer, but do not change it
};

/** A number as a student may write it: a whole number or a decimal, with a comma or a point (store.ts parseNumber). */
export const NUMBER_PATTERN = "\\s*-?\\d+([.,]\\d+)?\\s*";

/**
 * The ratio table, drawn as on paper: a label in front of each row, a line under the top row and between the columns,
 * and an arrow from one column to the next, above and below, with × or : and a number.
 *
 * Laid out as a CSS grid: column 1 the labels, then one equal column per value. An arrow spans the two columns it
 * connects and runs from the middle of the one to the middle of the other, so nothing has to be measured.
 */
const Interaction = ({ config, store, readOnly }: Props) => {
  const state = useStore(store); // re-renders when the store changes
  const { columns, cells, given, labels, labelsGiven, arrowsTop, arrowsBottom, operatorsTop, operatorsBottom } = state;
  const t = textsFor(config.language);
  // In tool mode the table is scratch paper: no answer cell, no answer below it
  const tool = config.mode === "tool";
  const answer = answerCell(state);
  const isAnswer = (row: number, column: number) => !tool && row === answer.row && column === answer.column;
  const canInsert = !readOnly && columns < MAX_COLUMNS;
  const canRemove = (column: number) => !readOnly && columns > MIN_COLUMNS && !columnIsFixed(state, column);

  const arrow = (side: ArrowSide, index: number) => ({
    side,
    index,
    t,
    disabled: readOnly,
    value: (side === "top" ? arrowsTop : arrowsBottom)[index] ?? "",
    operator: (side === "top" ? operatorsTop : operatorsBottom)[index] ?? "",
    onValue: (value: string) => store.dispatch({ type: "SET_ARROW", payload: { side, index, value } }),
    onOperator: (operator: Operator) => store.dispatch({ type: "SET_OPERATOR", payload: { side, index, operator } }),
  });
  const insert = (at: number) => store.dispatch({ type: "INSERT_COLUMN", payload: { at } });

  return (
    <div className="font-sans text-ink">
      <h2 className="text-[1.5em] leading-tight font-black">{config.title}</h2>
      <p className="mt-2 leading-[1.7]">{config.question}</p>

      <div className="mt-6 overflow-x-auto rounded-xl bg-paper px-6 py-4">
        <div className="mx-auto grid w-max" style={{ gridTemplateColumns: `auto repeat(${columns}, var(--column))` }}>
          {/* Above the table: an arrow from every column to the next */}
          {Array.from({ length: columns - 1 }, (_, i) => (
            <Arrow key={`top-${i}`} {...arrow("top", i)} />
          ))}

          {Array.from({ length: ROWS }, (_, row) => (
            <Fragment key={`row-${row}`}>
              <div
                className={`flex items-center justify-end border-r-2 border-ink py-2 pr-3 ${row === 0 ? "border-b-2" : ""}`}
                style={{ gridColumn: 1, gridRow: row + 2 }}
              >
                <input
                  id={`label-${row + 1}`}
                  type="text"
                  className={`label ${labelsGiven[row] ? "given" : ""}`}
                  placeholder={labelsGiven[row] ? undefined : t.labelPlaceholder}
                  aria-label={t.labelOfRow(row + 1)}
                  value={labels[row]}
                  readOnly={labelsGiven[row]}
                  disabled={readOnly}
                  onInput={(e) => store.dispatch({ type: "SET_LABEL", payload: { row, value: e.currentTarget.value } })}
                />
              </div>
              {Array.from({ length: columns }, (_, column) => (
                <div
                  key={`cell-${row}-${column}`}
                  className={`relative flex items-center px-2 py-2 ${column > 0 ? "border-l-2 border-ink" : ""} ${row === 0 ? "border-b-2 border-ink" : ""}`}
                  style={{ gridColumn: column + 2, gridRow: row + 2 }}
                >
                  {/* The answer cell: marked, "?" until filled in, and only a number is valid (data-answer: index.tsx) */}
                  <input
                    id={`cell-${row + 1}-${column + 1}`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    className={`cell ${given[row][column] ? "given" : ""} ${isAnswer(row, column) ? "answer-cell" : ""}`}
                    aria-label={isAnswer(row, column) ? `${t.cell(row + 1, column + 1)}: ${t.answerCell}` : t.cell(row + 1, column + 1)}
                    placeholder={isAnswer(row, column) || (state.answerAt?.row === row && state.answerAt?.column === column) ? "?" : undefined}
                    data-answer={isAnswer(row, column) ? "" : undefined}
                    pattern={isAnswer(row, column) ? NUMBER_PATTERN : undefined}
                    title={isAnswer(row, column) ? t.notANumber : undefined}
                    value={cells[row][column]}
                    readOnly={given[row][column]}
                    disabled={readOnly}
                    onInput={(e) => store.dispatch({ type: "SET_CELL", payload: { row, column, value: e.currentTarget.value } })}
                  />
                  {/* On the crossing of the lines: insert a column here, between this column and the previous one */}
                  {row === 0 && column > 0 && canInsert && <InsertButton label={t.insertBetween(column)} className="left-0" onClick={() => insert(column)} />}
                  {row === 0 && column === columns - 1 && canInsert && (
                    <InsertButton label={t.insertEnd} className="left-full" onClick={() => insert(columns)} />
                  )}
                </div>
              ))}
            </Fragment>
          ))}

          {/* Below the table: the same arrows, to do below what you did above */}
          {Array.from({ length: columns - 1 }, (_, i) => (
            <Arrow key={`bottom-${i}`} {...arrow("bottom", i)} />
          ))}

          {/* A remove button under every column the student may remove */}
          {Array.from({ length: columns }, (_, column) =>
            canRemove(column) ? (
              <div key={`remove-${column}`} className="flex justify-center pt-1" style={{ gridColumn: column + 2, gridRow: 5 }}>
                <button
                  type="button"
                  className="remove"
                  title={t.remove(column + 1)}
                  aria-label={t.remove(column + 1)}
                  onClick={() => store.dispatch({ type: "REMOVE_COLUMN", payload: { at: column } })}
                >
                  <TrashIcon />
                </button>
              </div>
            ) : null,
          )}
        </div>
      </div>

      {/* The answer, read-only: what the student wrote in the answer cell (the label is a setting) */}
      {!tool && (
        <div className="mt-5 flex items-center gap-3">
          <span id="answer-label" className="font-black">
            {config.answerLabel?.trim() || t.answer}
          </span>
          <output aria-labelledby="answer-label" aria-live="polite" className="answer">
            {answerOf(state)}
          </output>
        </div>
      )}
    </div>
  );
};

type ArrowProps = {
  side: ArrowSide;
  index: number;
  t: Texts;
  disabled: boolean;
  value: string;
  operator: Operator;
  onValue: (value: string) => void;
  onOperator: (operator: Operator) => void;
};

/**
 * The arrow from value column `index` to the next, above (top) or below (bottom) the table: an arc from the middle of
 * the one column to the middle of the other, and the step on it (× or :, and a number).
 */
function Arrow({ side, index, t, disabled, value, operator, onValue, onOperator }: ArrowProps) {
  const top = side === "top";
  const number = useRef<HTMLInputElement>(null);
  const choices = useRef<HTMLDivElement>(null);
  // After a choice the focus goes on to the number; after "choose again" back to the choice
  const focusNext = useRef<"number" | "choices" | null>(null);
  useEffect(() => {
    if (focusNext.current === "number") number.current?.focus();
    if (focusNext.current === "choices") choices.current?.querySelector("button")?.focus();
    focusNext.current = null;
  }, [operator]);
  const choose = (option: Operator) => {
    focusNext.current = option ? "number" : "choices";
    onOperator(option);
  };

  const step = (
    // pointer-events-auto: only the step itself takes clicks (the strip around it overlaps the next arrow's step)
    <div className="pointer-events-auto flex items-center gap-1">
      {operator ? (
        // Chosen: the step reads as on paper (":5", "×3"); the small button next to it undoes the choice
        <span className="chosen-operator">
          <span aria-hidden="true">{operator === "multiply" ? "×" : ":"}</span>
          <span className="sr-only">{t[operator]}</span>
        </span>
      ) : (
        // Not chosen yet: both, side by side
        <div ref={choices} role="group" aria-label={t.operator} className="flex overflow-hidden rounded-md border-2 border-accent">
          {(["multiply", "divide"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-label={t[option]}
              title={t[option]}
              disabled={disabled}
              className="operator"
              onClick={() => choose(option)}
            >
              {option === "multiply" ? "×" : ":"}
            </button>
          ))}
        </div>
      )}
      <input
        ref={number}
        id={`arrow-${side}-${index + 1}`}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className="step"
        placeholder=" " // for :placeholder-shown in styles.css: a filled-in number reads as text
        aria-label={t.arrowNumber(top ? t.above : t.below, index + 1)}
        value={value}
        disabled={disabled}
        onInput={(e) => onValue(e.currentTarget.value)}
      />
      {operator && !disabled && (
        <button type="button" className="choose-again" title={t.chooseAgain} aria-label={t.chooseAgain} onClick={() => choose("")}>
          <UndoIcon />
        </button>
      )}
    </div>
  );
  return (
    <div
      className={`pointer-events-none flex flex-col items-center ${top ? "justify-end pb-1" : "justify-start pt-1"}`}
      style={{ gridColumn: `${index + 2} / span 2`, gridRow: top ? 1 : 4 }}
    >
      {top && step}
      <ArcSvg top={top} />
      {!top && step}
    </div>
  );
}

/** An arc one column wide (the span from middle to middle), with its arrowhead on the right. */
function ArcSvg({ top }: { top: boolean }) {
  // viewBox in px of a 16px em: the column is 8.5em wide (--column in styles.css), the arc 2em high
  const [w, h] = [136, 32];
  const [x1, x2] = [8, w - 8];
  const [base, control] = top ? [h - 4, -10] : [4, h + 10];
  // The arrowhead follows the direction the arc ends in: from the control point to the end
  const dx = x2 - w / 2;
  const dy = base - control;
  const length = Math.hypot(dx, dy);
  const [ux, uy] = [dx / length, dy / length];
  const head = (angle: number) => {
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    return `${(x2 - 10 * (ux * cos - uy * sin)).toFixed(1)} ${(base - 10 * (ux * sin + uy * cos)).toFixed(1)}`;
  };
  return (
    <svg
      className="w-[var(--column)] text-ink"
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d={`M ${x1} ${base} Q ${w / 2} ${control} ${x2} ${base}`} />
      <path d={`M ${head(0.5)} L ${x2} ${base} L ${head(-0.5)}`} />
    </svg>
  );
}

/** A small round + on a line of the table: a new, empty column there. */
function InsertButton({ label, className, onClick }: { label: string; className: string; onClick: () => void }) {
  return (
    <button type="button" className={`insert ${className}`} title={label} aria-label={label} onClick={onClick}>
      +
    </button>
  );
}

const UndoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
);

const TrashIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M6 6l1 14h10l1-14" />
  </svg>
);

export default Interaction;
