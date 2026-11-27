/*
 * The floor covering task (een kamer stofferen), as the pupil sees it: the floor plan, and by the `coverParts` setting
 * 1. a box for the floor area, 2. the strips to lay, 3. the bill. The tab order is the order of the work: the area, the
 * strips (Add a strip, the strips, the controls of the chosen one), the bill.
 *
 * The strips are moved with a finger or the mouse on the plan (planView.tsx), and with the keyboard in the list of strips:
 * each strip is a button there, and with the focus on it the arrow keys move it, + and − change its length, R turns it
 * and Delete removes it. The buttons under the chosen strip do the same for a pointer. Every change is said in a live
 * region, in metres.
 */
import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef, useState } from "preact/hooks";
import {
  asksArea, asksBill, asksStrips, billFields, eurosText, fitStrip, fitsWay, givenPlan, resizeStrip, turnStrip, type BillField, type CoverSettings,
  type Strip,
} from "./cover.ts";
import { coverTextsFor, type CoverTexts } from "./coverTexts.ts";
import { PlanView } from "./planView.tsx";
import type { AnswerField, StateModel } from "./store.ts";

/** What a pupil may type (the browser marks the box invalid otherwise; cover.ts reads them). */
export const AREA_PATTERN = "\\s*\\d+([.,]\\d+)?\\s*(m²|m2)?\\s*";
export const METRES_PATTERN = "\\s*\\d+([.,]\\d+)?\\s*(m|meter|meters|metre|metres)?\\s*";
export const EURO_PATTERN = "\\s*(€\\s*)?(\\d{1,3}([., ]\\d{3})+|\\d+)([.,](\\d{1,2}|-))?\\s*";

/** The most strips on a plan. */
export const MAX_STRIPS = 12;

/** A new strip: at the first square of the floor not yet covered, the same way round as the last one, as long as the roll is wide. */
export function newStrip(s: CoverSettings, strips: Strip[]): Strip | null {
  const under = coveredCells(s, strips);
  const first = s.room.cells.findIndex((v, i) => v !== 0 && !under[i]);
  const start = first >= 0 ? first : Math.max(0, s.room.cells.findIndex((v) => v !== 0));
  const way = strips.length ? strips[strips.length - 1].vertical : false;
  for (const vertical of [way, !way]) {
    if (!fitsWay(vertical, s.width, s.columns, s.rows)) continue;
    return fitStrip({ x: start % s.columns, y: Math.floor(start / s.columns), length: s.width, vertical }, s.width, s.columns, s.rows);
  }
  return null;
}

/** Which squares of the paper lie under a strip. */
function coveredCells(s: CoverSettings, strips: Strip[]): boolean[] {
  const under = Array<boolean>(s.columns * s.rows).fill(false);
  for (const strip of strips) {
    const w = strip.vertical ? s.width : strip.length, h = strip.vertical ? strip.length : s.width;
    for (let y = strip.y; y < strip.y + h; y++) for (let x = strip.x; x < strip.x + w; x++) if (x < s.columns && y < s.rows) under[y * s.columns + x] = true;
  }
  return under;
}

type StripsProps = {
  s: CoverSettings;
  t: CoverTexts;
  strips: Strip[];
  selected: number | null;
  onSelect: (index: number | null) => void;
  readOnly: boolean;
  /** a strip laid (index = the number of strips), changed or removed (null) */
  onChange: (index: number, strip: Strip | null) => void;
  announce: (message: string) => void;
  /** the element the strips' buttons are in, to move the focus */
  root: { current: HTMLElement | null };
};

/** The list of strips: Add a strip, a button per strip (the keyboard's handle on it), and the controls of the chosen one. */
export function StripList({ s, t, strips, selected, onSelect, readOnly, onChange, announce, root }: StripsProps) {
  const ts = t.strips;
  const hintId = `${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-hint`;
  const describe = (index: number, strip: Strip) =>
    ts.describe(index + 1, strip.vertical, strip.length * s.scale, s.rollWidth, strip.x * s.scale, strip.y * s.scale);
  const focusLater = (selector: string) =>
    setTimeout(() => root.current?.querySelector<HTMLElement>(selector)?.focus(), 0); // after the key event

  const change = (index: number, strip: Strip | null) => {
    if (!strip) return announce(ts.cannotTurn);
    onChange(index, strip);
    announce(describe(index, strip));
  };
  const add = () => {
    const strip = newStrip(s, strips);
    if (!strip) return;
    onChange(strips.length, strip);
    onSelect(strips.length);
    announce(describe(strips.length, strip));
    focusLater(`[data-strip-row="${strips.length}"]`);
  };
  const remove = (index: number) => {
    // the focus first, to the next strip, or Add a strip when there is none
    const next = strips.length > 1 ? Math.min(index, strips.length - 2) : null;
    onChange(index, null);
    onSelect(next);
    announce(ts.removed(index + 1));
    focusLater(next === null ? "[data-add-strip]" : `[data-strip-row="${next}"]`);
  };
  const longer = (index: number, by: number) => change(index, resizeStrip(strips[index], strips[index].length + by, s.columns, s.rows));
  const moveBy = (index: number, dx: number, dy: number) =>
    change(index, fitStrip({ ...strips[index], x: strips[index].x + dx, y: strips[index].y + dy }, s.width, s.columns, s.rows));
  const turn = (index: number) => change(index, turnStrip(strips[index], s.width, s.columns, s.rows));

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    if (readOnly) return;
    switch (event.key) {
      case "ArrowLeft": moveBy(index, -1, 0); break;
      case "ArrowRight": moveBy(index, 1, 0); break;
      case "ArrowUp": moveBy(index, 0, -1); break;
      case "ArrowDown": moveBy(index, 0, 1); break;
      case "+": case "=": longer(index, 1); break;
      case "-": case "_": case "−": longer(index, -1); break;
      case "r": case "R": turn(index); break;
      case "Delete": case "Backspace": event.preventDefault(); remove(index); return; // remove() chooses the next strip
      default: return;
    }
    event.preventDefault();
    onSelect(index);
  };

  return (
    <div className="flex flex-col gap-2" data-strips>
      {!readOnly && (
        <div>
          <button type="button" className="button main" data-add-strip disabled={strips.length >= MAX_STRIPS} onClick={add}>
            + {ts.add}
          </button>
        </div>
      )}
      {strips.length === 0 ? (
        <p className="text-sm text-slate-600">{ts.none}</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {strips.map((strip, index) => (
            <li key={index} className="flex flex-col gap-2">
              <button
                type="button"
                className={`choice strip-row ${index === selected ? "chosen" : ""}`}
                data-strip-row={index}
                aria-current={index === selected ? "true" : undefined}
                aria-label={describe(index, strip)}
                aria-describedby={readOnly ? undefined : hintId}
                onClick={() => onSelect(index)}
                onFocus={() => onSelect(index)}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                <span aria-hidden="true" className="strip-swatch">{index + 1}</span>
                {ts.summary(index + 1, strip.vertical, strip.length * s.scale)}
              </button>
              {index === selected && !readOnly && (
                <div className="flex flex-wrap items-center gap-2 pl-2" data-strip-controls>
                  <span className="text-sm font-semibold">{ts.length}</span>
                  <button type="button" className="button square" aria-label={ts.shorter(index + 1)} onClick={() => longer(index, -1)}>
                    −
                  </button>
                  <button type="button" className="button square" aria-label={ts.longer(index + 1)} onClick={() => longer(index, 1)}>
                    +
                  </button>
                  <button type="button" className="button" aria-label={ts.turnLabel(index + 1)} onClick={() => turn(index)}>
                    ↻ {ts.turn}
                  </button>
                  <button type="button" className="button" aria-label={ts.removeLabel(index + 1)} onClick={() => remove(index)}>
                    ✕ {ts.remove}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {!readOnly && (
        <p id={hintId} className="max-w-[40em] text-sm text-slate-600">
          {ts.hint}
        </p>
      )}
    </div>
  );
}

type Props = {
  s: CoverSettings;
  language: string;
  state: StateModel;
  readOnly: boolean;
  setAnswer: (field: AnswerField, value: string) => void;
  setStrip: (index: number, strip: Strip | null) => void;
};

/** The whole task: the plan, the area, the strips and the bill, by `coverParts`. */
export function CoverTask({ s, language, state, readOnly, setAnswer, setStrip }: Props) {
  const t = coverTextsFor(language);
  const root = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const strips = asksStrips(s) ? state.strips : asksBill(s) ? givenPlan(s) : [];
  const parts = [asksArea(s), asksStrips(s), asksBill(s)].filter(Boolean).length;
  let step = 0;
  const heading = (text: string) => <h3 className="text-lg font-bold">{parts > 1 ? `${++step}. ${text}` : text}</h3>;
  const material = t.material[s.material];

  // a strip chosen that is gone (a response handed back, Remove)
  useEffect(() => {
    if (selected !== null && selected >= strips.length) setSelected(strips.length ? strips.length - 1 : null);
  }, [strips.length]);

  const choose = (index: number | null, fromPointer = false) => {
    setSelected(index);
    if (fromPointer && index !== null) root.current?.querySelector<HTMLElement>(`[data-strip-row="${index}"]`)?.focus({ preventScroll: true });
  };

  return (
    <div ref={root} className="mt-4 flex max-w-full flex-col gap-4" data-cover>
      <figure className="m-0 flex max-w-full flex-col gap-2">
        <PlanView
          s={s}
          t={t}
          language={language}
          strips={strips}
          selected={asksStrips(s) ? selected : null}
          editable={asksStrips(s) && !readOnly}
          cellSize={s.columns > 16 ? 28 : 36}
          onSelect={(index) => choose(index, true)}
          onStrip={(index, strip, done) => {
            setStrip(index, strip);
            if (done) setMessage(t.strips.describe(index + 1, strip.vertical, strip.length * s.scale, s.rollWidth, strip.x * s.scale, strip.y * s.scale));
          }}
        />
        <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-700">
          <span className="inline-flex items-center gap-2" data-scale>
            <span aria-hidden="true" className="inline-block h-4 w-4 border border-slate-400 bg-white" />
            {t.scale(s.scale)}
          </span>
          {(asksStrips(s) || asksBill(s)) && <span data-roll>{t.roll(material, s.rollWidth)}</span>}
        </figcaption>
      </figure>

      {asksArea(s) && (
        <section className="flex flex-col gap-2" data-part="area">
          {heading(t.area.heading)}
          <label className="flex flex-wrap items-center gap-3">
            <span className="font-semibold">{t.area.label}</span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className="answer"
              data-answer="floorArea"
              pattern={AREA_PATTERN}
              title={t.area.invalid}
              value={state.floorArea}
              disabled={readOnly}
              onInput={(e) => setAnswer("floorArea", e.currentTarget.value)}
            />
            <span className="text-slate-600">m²</span>
          </label>
        </section>
      )}

      {asksStrips(s) && (
        <section className="flex flex-col gap-2" data-part="strips">
          {heading(t.strips.heading)}
          <StripList
            s={s}
            t={t}
            strips={state.strips}
            selected={selected}
            onSelect={(index) => choose(index)}
            readOnly={readOnly}
            onChange={setStrip}
            announce={setMessage}
            root={root}
          />
        </section>
      )}

      {asksBill(s) && (
        <section className="flex flex-col gap-2" data-part="bill">
          {heading(t.bill.heading)}
          {!asksStrips(s) && <p className="text-sm text-slate-600">{t.strips.given}</p>}
          <Bill s={s} t={t} language={language} state={state} readOnly={readOnly} setAnswer={setAnswer} />
        </section>
      )}

      <p className="sr-only" aria-live="polite" data-live>
        {message}
      </p>
    </div>
  );
}

type BillProps = { s: CoverSettings; t: CoverTexts; language: string; state: StateModel; readOnly: boolean; setAnswer: (field: AnswerField, value: string) => void };

/** The bill: per line the metres and the amount (a threshold strip: one piece), and the total. */
function Bill({ s, t, language, state, readOnly, setAnswer }: BillProps) {
  const tb = t.bill;
  const fields = billFields(s);
  const box = (field: BillField, label: string) => {
    const metres = field.endsWith("Metres");
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        {!metres && <span aria-hidden="true">€</span>}
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className="answer bill-box"
          data-answer={field}
          aria-label={label}
          pattern={metres ? METRES_PATTERN : EURO_PATTERN}
          title={metres ? tb.invalidMetres : tb.invalidAmount}
          value={state[field]}
          disabled={readOnly}
          onInput={(e) => setAnswer(field, e.currentTarget.value)}
        />
        {metres && <span aria-hidden="true">m</span>}
      </span>
    );
  };
  const covering = tb.covering(t.material[s.material]);
  const rows: { item: string; quantity: ComponentChildren; price: string; amount: BillField }[] = [
    { item: covering, quantity: box("coveringMetres", tb.metresLabel(covering)), price: tb.perMetre(s.price ?? 0), amount: "coveringAmount" },
  ];
  if (fields.includes("skirtingMetres")) {
    rows.push({ item: tb.skirting, quantity: box("skirtingMetres", tb.metresLabel(tb.skirting)), price: tb.perMetre(s.skirtingPrice ?? 0), amount: "skirtingAmount" });
  }
  if (fields.includes("thresholdAmount")) {
    rows.push({ item: tb.threshold, quantity: tb.piece, price: eurosText(s.thresholdPrice ?? 0, language), amount: "thresholdAmount" });
  }
  return (
    <div className="max-w-full overflow-x-auto">
      <table className="bill" data-bill>
        <caption className="sr-only">{tb.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{tb.item}</th>
            <th scope="col">{tb.quantity}</th>
            <th scope="col">{tb.price}</th>
            <th scope="col">{tb.amount}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.amount}>
              <th scope="row">{row.item}</th>
              <td>{row.quantity}</td>
              <td className="whitespace-nowrap">{row.price}</td>
              <td>{box(row.amount, tb.amountLabel(row.item))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{tb.total}</th>
            <td />
            <td />
            <td>{box("total", tb.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
