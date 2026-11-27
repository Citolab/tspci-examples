import type { PciProperties } from "@citolab/tspci";
import { IStore, useStore } from "@citolab/preact-store";
import configProps from "./config.json";
import { asksArea, asksPerimeter, settingsFrom, type Settings } from "./grid";
import { coverSettingsFrom } from "./cover.ts";
import { CoverTask } from "./coverView.tsx";
import { GridView } from "./gridView";
import { Actions, StateModel } from "./store";
import { textsFor, type Texts } from "./texts";

type PropTypes = PciProperties<typeof configProps>;

type Props = {
  config: PropTypes;
  store: IStore<StateModel, Actions>;
  readOnly: boolean; // review, solution, closed: show the answer, but do not change it
};

/** A number as a pupil may write it (grid.ts parseNumber): 12, 7,5, 7.5, 7½, 7 1/2 or ½. */
export const NUMBER_PATTERN = "\\s*(\\d+([.,]\\d+)?|\\d*\\s*½|(\\d+\\s+)?1/2)\\s*";

/**
 * The task on squared paper, by the `task` setting:
 * - draw: an empty grid the pupil colours squares on, with a button to clear it;
 * - measure: the author's shape, and a box for its area and/or perimeter;
 * - compare: the author's shapes A and B side by side, and a choice: A, B or both the same;
 * - cover: the floor plan of a room, its area, strips of carpet or vinyl to lay and the bill (coverView.tsx).
 */
const Interaction = ({ config, store, readOnly }: Props) => {
  const state = useStore(store); // re-renders when the store changes
  const settings = settingsFrom(config);
  const t = textsFor(config.language);
  const { columns, rows, halves } = settings;

  return (
    <div className="font-sans text-ink">
      {config.title && <h2 className="text-[1.4em] leading-tight font-bold">{config.title}</h2>}
      {config.question && <p className="mt-2 leading-relaxed">{config.question}</p>}

      {settings.task === "cover" ? (
        <CoverTask
          s={coverSettingsFrom(config)}
          language={config.language}
          state={state}
          readOnly={readOnly}
          setAnswer={(field, value) => store.dispatch({ type: "SET_ANSWER", payload: { field, value } })}
          setStrip={(index, strip) =>
            store.dispatch(strip ? { type: "SET_STRIP", payload: { index, strip } } : { type: "REMOVE_STRIP", payload: { index } })
          }
        />
      ) : settings.task === "compare" ? (
        <Compare settings={settings} state={state} store={store} readOnly={readOnly} t={t} />
      ) : (
        <div className="mt-4 inline-flex max-w-full flex-col gap-2">
          <GridView
            shape={settings.task === "draw" ? { columns, rows, cells: state.cells } : settings.shape}
            editable={settings.task === "draw" && !readOnly}
            halves={halves}
            t={t}
            label={t.grid(columns, rows)}
            onCell={(index, value) => store.dispatch({ type: "SET_CELL", payload: { index, value } })}
          />
          {(config.unitLabel || settings.task === "draw") && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {settings.task === "draw" && (
                <button type="button" className="button" disabled={readOnly} onClick={() => store.dispatch({ type: "CLEAR", payload: undefined })}>
                  {t.clear}
                </button>
              )}
              {config.unitLabel && <Unit label={config.unitLabel} />}
            </div>
          )}
          {settings.task === "draw" && !readOnly && <p className="max-w-[36em] text-sm text-slate-600">{halves ? t.hintHalves : t.hint}</p>}
          {settings.task === "measure" && <Answers settings={settings} state={state} store={store} readOnly={readOnly} t={t} />}
        </div>
      )}
    </div>
  );
};

/** The unit under the grid: one square and the author's text, "1 hokje = 1 cm²". */
const Unit = ({ label }: { label: string }) => (
  <span className="inline-flex items-center gap-2 text-sm text-slate-700">
    <span aria-hidden="true" className="inline-block h-4 w-4 border border-slate-400 bg-white" />
    {label}
  </span>
);

type Part = { settings: Settings; state: StateModel; store: IStore<StateModel, Actions>; readOnly: boolean; t: Texts };

/** The answer boxes of a measuring task: area and/or perimeter, as asked. */
function Answers({ settings, state, store, readOnly, t }: Part) {
  const box = (field: "areaAnswer" | "perimeterAnswer", label: string) => (
    <label className="flex items-center gap-3">
      <span className="w-[6.5em] font-semibold">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className="answer"
        data-answer={field}
        pattern={NUMBER_PATTERN}
        title={t.notANumber}
        value={state[field]}
        disabled={readOnly}
        onInput={(e) => store.dispatch({ type: "SET_ANSWER", payload: { field, value: e.currentTarget.value } })}
      />
      {field === "areaAnswer" && <span className="text-slate-600">{t.squares}</span>}
    </label>
  );
  return (
    <div className="mt-2 flex flex-col gap-2">
      {asksArea(settings.ask) && box("areaAnswer", t.area)}
      {asksPerimeter(settings.ask) && box("perimeterAnswer", t.perimeter)}
    </div>
  );
}

/** Two shapes side by side, and the question which one is larger: A, B or both the same. */
function Compare({ settings, state, store, readOnly, t }: Part) {
  const { columns, rows, halves } = settings;
  const choose = (choice: string) => store.dispatch({ type: "CHOOSE", payload: { choice } });
  const legend = settings.compareBy === "area" ? t.compareArea : t.comparePerimeter;
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-6">
        {(["A", "B"] as const).map((name) => (
          <figure key={name} className="m-0 flex min-w-0 flex-col gap-1">
            <figcaption className="text-lg font-bold">{t.shapeName(name)}</figcaption>
            <GridView
              shape={name === "A" ? settings.shape : settings.shapeB}
              editable={false}
              halves={halves}
              t={t}
              look={name === "A" ? "a" : "b"}
              cellSize={columns > 8 ? 26 : 32}
              label={`${t.shapeGrid(name)}: ${t.grid(columns, rows)}`}
            />
          </figure>
        ))}
      </div>
      <fieldset className="mt-4 border-0 p-0">
        <legend className="mb-2 font-semibold">{legend}</legend>
        <div className="flex flex-wrap gap-2">
          {[
            { value: "A", label: t.shapeName("A") },
            { value: "B", label: t.shapeName("B") },
            { value: "same", label: t.same },
          ].map((option) => (
            <label key={option.value} className={`choice ${state.choice === option.value ? "chosen" : ""}`}>
              <input type="radio" name="choice" value={option.value} checked={state.choice === option.value} disabled={readOnly} onChange={() => choose(option.value)} />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export default Interaction;
