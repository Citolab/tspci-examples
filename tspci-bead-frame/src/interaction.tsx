import type { PciProperties } from "@citolab/tspci";
import { useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import configProps from "./config.json";
import { Fill, Settings, counts, rowCount } from "./beadFrame";
import { Frame, Pens } from "./frame";
import { Actions, StateModel } from "./store";
import { questionText, textsFor } from "./texts";

type PropTypes = PciProperties<typeof configProps>;

type Props = {
  config: PropTypes;
  settings: Settings;
  store: IStore<StateModel, Actions>;
  readOnly: boolean; // review, solution, closed: show the answer, but do not change it
};

/**
 * The question, the frame, and under it a button to start over (and the total, when the author gives it as a help).
 * For a sum, the two colours to pick from are above the frame. A frame that only shows a number (task "show") is an
 * image: nothing to pick, nothing to change.
 */
const Interaction = ({ config, settings, store, readOnly }: Props) => {
  const { grid } = useStore(store); // re-renders when the store changes
  const [pen, setPen] = useState<1 | 2>(1);
  const t = textsFor(config.language);
  const { model, task } = settings;
  const display = task === "show";
  const sum = task === "addition";
  const interactive = !readOnly && !display;
  const showTotal = String(config.showTotal) === "true";
  const { value, first, second } = counts(grid);
  const question = questionText(config.question, t, model, task, settings.number, settings.add);

  // Only a change is an action: keeps the log (and a replay) clean while a drag passes the same bead or square again
  const onPush = (row: number, count: number) => {
    const current = store.getState().grid[row];
    if (current && rowCount(current) !== count) store.dispatch({ type: "PUSH", payload: { row, count, part: sum ? pen : 1 } });
  };
  const onPaint = (row: number, column: number, fill: Fill) => {
    const current = store.getState().grid[row]?.[column];
    if (current !== undefined && current !== fill) store.dispatch({ type: "PAINT", payload: { row, column, fill: sum || fill === 0 ? fill : 1 } });
  };

  return (
    <div className="font-sans text-ink">
      {config.title?.trim() && <h2 className="text-[1.4em] leading-tight font-bold">{config.title}</h2>}
      {question && <p className="mt-2 leading-[1.6]">{question}</p>}

      {sum && interactive && (
        <Pens
          model={model}
          pen={pen}
          onPen={setPen}
          t={t}
          labels={[t.pen(1, settings.number === null ? "" : String(settings.number)), t.pen(2, settings.add === null ? "" : String(settings.add))]}
        />
      )}

      <div className="frame-box mt-4">
        <Frame model={model} look={settings.look} grid={grid} interactive={interactive} display={display} sum={sum} pen={pen} t={t} onPush={onPush} onPaint={onPaint} current={() => store.getState().grid} />
      </div>

      {(interactive || showTotal) && (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {interactive && (
            <button type="button" className="reset" disabled={value === 0} onClick={() => store.dispatch({ type: "CLEAR", payload: {} })}>
              <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
                <path d="M4 10a6 6 0 1 0 2-4.5M4 3v3h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              {t.reset(model)}
            </button>
          )}
          {showTotal && (
            <p className="total" data-total>
              {t.total}: <strong>{value}</strong>
              {sum && value > 0 && <span className="text-slate-500"> ({first} + {second})</span>}
            </p>
          )}
        </div>
      )}

      {/* The hundred field's squares are checkboxes: this tells a screen reader how many are coloured (a rod says it itself) */}
      {model === "hundred" && !display && (
        <p className="sr-only" aria-live="polite">
          {t.status(model, value, first, second, sum)}
        </p>
      )}
    </div>
  );
};

export default Interaction;
