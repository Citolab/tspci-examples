import type { PciProperties } from "@citolab/tspci";
import { Fragment, type ComponentChildren } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import configProps from "./config.json";
import { ChunkRow, MAX_CHUNKS, MIN_CHUNKS, Problem, Task, notANumber } from "./calculation";
import { Actions, Field, StateModel } from "./store";
import { textsFor } from "./texts";

type PropTypes = PciProperties<typeof configProps>;

type Props = {
  config: PropTypes;
  store: IStore<StateModel, Actions>;
  task: Task;
  problems: Problem[];
  readOnly: boolean; // review, solution, closed: show the working, but do not change it
};

/**
 * The written method, laid out as on squared paper: every number the pupil writes is a text box in its place, right
 * aligned so the digits line up in columns. The boxes are in the order a pupil writes them, so Tab (and Enter) go
 * through the working from the top down.
 *
 * - Hapmethode: "12 / 432 \", then per bite the bite with a line under it and − in front of the factor column, the
 *   factor (× on the right) and below the line what is left; the factors added up at the bottom of their column.
 * - Kolomsgewijs: the two numbers under each other, a line, a partial result per place value, a line, the total.
 *
 * Under the working the sum with the answer box (and the remainder for the hapmethode).
 */
const Interaction = ({ config, store, task, problems, readOnly }: Props) => {
  const { work } = useStore(store); // re-renders when the store changes
  const t = textsFor(config.language);
  const language = config.language === "nl" ? "nl" : "en";
  const root = useRef<HTMLDivElement>(null);
  // after a bite is added or removed, the focus goes to where the pupil writes next: right after the render (a layout
  // effect), so nothing typed in between ends up in the wrong box, and only once that box is there
  const focusNext = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!focusNext.current) return;
    const target = root.current?.querySelector<HTMLElement>(`#${focusNext.current}`);
    if (!target) return;
    target.focus();
    focusNext.current = null;
  });

  if (problems.length) {
    return (
      <div className="font-sans text-ink">
        <Header config={config} />
        <ul role="alert" className="problems">
          {problems.map((problem) => (
            <li key={problem}>{t.problems[problem]}</li>
          ))}
        </ul>
      </div>
    );
  }

  const chunking = task.mode === "chunking";
  const sign = chunking ? ":" : task.operation === "subtract" ? "−" : "+";
  const spoken = `${task.first} ${chunking ? t.divided : task.operation === "subtract" ? t.minus : t.plus} ${task.second}`;
  // the column of numbers is as wide as the longest number, and a digit more for a minus sign or a carry
  const digits = Math.max(String(task.first).length, String(task.second).length) + 1;
  const boxes = [...work.chunks.flatMap((c) => [c.bite, c.factor, c.rest]), work.factorTotal, ...work.partials, work.total, work.answer, work.remainder];
  const invalid = boxes.some((text) => notANumber(text, language));

  const setField = (field: Field) => (value: string) => store.dispatch({ type: "SET_FIELD", payload: { field, value } });
  const setChunk = (index: number, field: keyof ChunkRow) => (value: string) =>
    store.dispatch({ type: "SET_CHUNK", payload: { index, field, value } });

  /** Enter goes on to the next box, as Tab does. */
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement)) return;
    const inputs = [...(root.current?.querySelectorAll<HTMLInputElement>("input:not(:disabled)") ?? [])];
    const next = inputs[inputs.indexOf(e.target) + 1];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  const box = (props: { id: string; label: string; value: string; onInput: (value: string) => void; className?: string; signed?: boolean }) => {
    const bad = notANumber(props.value, language);
    return (
      <input
        id={props.id}
        type="text"
        inputMode={props.signed ? "text" : "decimal"}
        autoComplete="off"
        spellcheck={false}
        className={`box ${props.className ?? ""}`}
        aria-label={props.label}
        aria-invalid={bad ? "true" : undefined}
        value={props.value}
        disabled={readOnly}
        onInput={(e) => props.onInput(e.currentTarget.value)}
      />
    );
  };

  return (
    <div ref={root} className="font-sans text-ink" onKeyDown={onKeyDown} style={{ "--digits": digits }}>
      <Header config={config} />

      <div className="paper mt-4" role="group" aria-label={`${t.working}: ${spoken}`}>
        {chunking ? (
          <div className="working" style={{ gridTemplateColumns: "auto var(--number) 1.6em auto" }}>
            {/* 12 / 432 \ */}
            <Cell column={1} row={1} className="given pr-1" hidden>
              {task.second} /
            </Cell>
            <Cell column={2} row={1} className="given number">
              <span aria-hidden="true">{task.first}</span>
            </Cell>
            <Cell column={3} row={1} className="given pl-1" hidden>
              {"\\"}
            </Cell>
            {work.chunks.map((chunk, i) => (
              <Fragment key={`chunk-${i}`}>
                {/* the bite, with the line under it to subtract it */}
                <Cell column={2} row={2 + 2 * i} className="line-under">
                  {box({ id: `bite-${i + 1}`, label: t.bite(i + 1), value: chunk.bite, onInput: setChunk(i, "bite") })}
                </Cell>
                <Cell column={3} row={2 + 2 * i} className="operator text-center" hidden>
                  −
                </Cell>
                {/* how many times the divisor: the factor column */}
                <Cell column={4} row={2 + 2 * i} className="flex items-center gap-1 pl-2">
                  {box({
                    id: `factor-${i + 1}`,
                    label: t.factor(i + 1, String(task.second)),
                    value: chunk.factor,
                    onInput: setChunk(i, "factor"),
                    className: "factor",
                  })}
                  <span aria-hidden="true" className="operator">
                    ×
                  </span>
                </Cell>
                {/* what is left */}
                <Cell column={2} row={3 + 2 * i}>
                  {box({ id: `rest-${i + 1}`, label: t.rest(i + 1), value: chunk.rest, onInput: setChunk(i, "rest") })}
                </Cell>
              </Fragment>
            ))}
            {/* the factors added up, under a line at the bottom of their column */}
            <Cell column={4} row={1 + 2 * work.chunks.length} className="flex items-center gap-1 pl-2">
              <div className="line-over">
                {box({ id: "factor-total", label: t.factorTotal, value: work.factorTotal, onInput: setField("factorTotal"), className: "factor" })}
              </div>
              <span aria-hidden="true" className="operator">
                ×
              </span>
            </Cell>
          </div>
        ) : (
          <div className="working" style={{ gridTemplateColumns: "var(--number) 1.6em" }}>
            <Cell column={1} row={1} className="given number" hidden>
              {task.first}
            </Cell>
            <Cell column={1} row={2} className="given number line-under" hidden>
              {task.second}
            </Cell>
            <Cell column={2} row={2} className="operator text-center" hidden>
              {sign}
            </Cell>
            {work.partials.map((partial, i) => (
              <Cell key={`partial-${i}`} column={1} row={3 + i} className={i === work.partials.length - 1 ? "line-under" : ""}>
                {box({ id: `partial-${i + 1}`, label: t.partial(i + 1), value: partial, onInput: (value) => store.dispatch({ type: "SET_PARTIAL", payload: { index: i, value } }), signed: true })}
              </Cell>
            ))}
            {task.operation === "add" && (
              <Cell column={2} row={2 + work.partials.length} className="operator text-center" hidden>
                +
              </Cell>
            )}
            <Cell column={1} row={3 + work.partials.length}>
              {box({ id: "total", label: t.total, value: work.total, onInput: setField("total"), signed: true })}
            </Cell>
          </div>
        )}

        {chunking && !readOnly && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              id="add-chunk"
              className="button"
              disabled={work.chunks.length >= MAX_CHUNKS}
              onClick={() => {
                focusNext.current = `bite-${work.chunks.length + 1}`;
                store.dispatch({ type: "ADD_CHUNK", payload: {} });
              }}
            >
              <span aria-hidden="true">+ </span>
              {t.addChunk}
            </button>
            <button
              type="button"
              className="button"
              disabled={work.chunks.length <= MIN_CHUNKS}
              onClick={() => {
                // the focus stays here, unless this button is disabled now: then on to "another bite"
                if (work.chunks.length - 1 <= MIN_CHUNKS) focusNext.current = "add-chunk";
                store.dispatch({ type: "REMOVE_CHUNK", payload: {} });
              }}
            >
              {t.removeChunk}
            </button>
          </div>
        )}
      </div>

      {/* the sum and the answer */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[1.5em]">
        <span aria-hidden="true" className="tabular-nums">
          {task.first} {sign} {task.second} =
        </span>
        {box({ id: "answer", label: t.answer(spoken), value: work.answer, onInput: setField("answer"), className: "answer", signed: !chunking })}
        {chunking && (
          <>
            <span aria-hidden="true">{t.remainderShort}</span>
            {box({ id: "remainder", label: t.remainder, value: work.remainder, onInput: setField("remainder"), className: "remainder" })}
          </>
        )}
      </div>

      {invalid && (
        <p className="mt-2 text-sm text-red-800" role="status">
          <span aria-hidden="true">⚠ </span>
          {t.notANumber}
        </p>
      )}
      {config.hint !== "false" && !readOnly && <p className="mt-3 text-sm text-slate-600">{chunking ? t.hintChunking : t.hintColumns}</p>}
      {readOnly && <p className="mt-3 text-sm text-slate-600">{t.readOnly}</p>}
    </div>
  );
};

const Header = ({ config }: { config: PropTypes }) => (
  <>
    {config.title?.trim() && <h2 className="text-[1.5em] leading-tight font-bold">{config.title}</h2>}
    {config.question?.trim() && <p className="mt-2 leading-[1.7]">{config.question}</p>}
  </>
);

/** A cell of the grid of the working; `hidden`: only for the eye (the boxes' labels and the group say it). */
const Cell = ({ column, row, className = "", hidden, children }: { column: number; row: number; className?: string; hidden?: boolean; children: ComponentChildren }) => (
  <div className={`cell ${className}`} style={{ gridColumn: column, gridRow: row }} aria-hidden={hidden ? "true" : undefined}>
    {children}
  </div>
);

export default Interaction;
