import { useMemo, useRef, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import type { PciProperties } from "@citolab/tspci";
import configProps from "./config.json";
import { Actions, StateModel } from "./store";
import { ExpressionError, clean, parseExpression, parseNumber } from "./expression";
import { Chart, Marker } from "./chart";
import { Texts } from "./texts";
type PropTypes = PciProperties<typeof configProps>;

/** x is the number the candidate types (and "$1", as in the PCI this one replaces). */
export const SYMBOLS = { unknown: ["x", "X", "$1"] };

const number = (value: string, fallback: number) => {
  const n = parseNumber(String(value ?? ""));
  return Number.isNaN(n) ? fallback : n;
};

export const Interaction = ({ config, store, t, readOnly }: {
  config: PropTypes;
  store: IStore<StateModel, Actions>;
  t: Texts;
  readOnly: boolean;
}) => {
  const state = useStore(store);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const language = config.language === "nl" ? "nl" : "en";
  const decimals = Math.max(0, Math.min(6, parseInt(config.decimals, 10) || 0));
  const valueFormat = useMemo(() => new Intl.NumberFormat(language, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: false }), [language, decimals]);
  const xFormat = useMemo(() => new Intl.NumberFormat(language, { maximumFractionDigits: 3, useGrouping: false }), [language]);
  const xMin = number(config.xMin, 0);
  const xMax = Math.max(number(config.xMax, 100), xMin + 1e-9);
  const yMin = number(config.yMin, 0);
  const yMax = Math.max(number(config.yMax, 10), yMin + 1e-9);

  const formulas = useMemo(
    () =>
      [
        { label: config.formula1Label, source: config.formula1 },
        { label: config.formula2Label, source: config.formula2 },
      ].map(({ label, source }) => {
        try {
          const expression = parseExpression(source, SYMBOLS);
          return { label, at: (x: number) => { const y = clean(expression.evaluate(x)); return Number.isFinite(y) ? y : null; }, error: "" };
        } catch (e) {
          return { label, at: () => null as number | null, error: e instanceof ExpressionError ? e.message : String(e) };
        }
      }),
    [config.formula1, config.formula2, config.formula1Label, config.formula2Label]
  );

  const rows = [...state.values].reverse(); // the newest first
  const series = formulas.map((f) => ({ label: f.label, points: state.values.map((x) => ({ x, y: f.at(x) })) }));

  const add = (e: Event) => {
    e.preventDefault();
    const x = parseNumber(input.current?.value ?? "");
    if (Number.isNaN(x)) return fail(t.notANumber);
    if (x < xMin || x > xMax) return fail(t.outOfRange(xFormat.format(xMin), xFormat.format(xMax)));
    if (state.values.includes(x)) {
      setSelected(x);
      return fail(t.already(xFormat.format(x)));
    }
    setError("");
    store.dispatch({ type: "ADD", payload: { x } });
    setSelected(x);
    input.current.value = "";
    input.current.focus();
  };
  const fail = (message: string) => {
    setError(message);
    input.current?.focus();
  };
  const remove = (x: number) => {
    if (selected === x) setSelected(null);
    store.dispatch({ type: "REMOVE", payload: { x } });
  };
  const select = (x: number) => setSelected(selected === x ? null : x);

  return (
    <div className="@container w-full max-w-5xl font-sans text-slate-800" lang={language}>
      <div className="grid gap-5 rounded-2xl border border-slate-200 bg-linear-to-b from-white to-slate-50 p-5 shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_rgba(16,24,40,.06)] @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <form className="flex flex-wrap items-center gap-2" onSubmit={add} noValidate>
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-300 bg-white py-1 pr-1 pl-3 shadow-inner transition focus-within:border-sky-500 focus-within:ring-4 focus-within:ring-sky-100">
              <span className="text-sm whitespace-nowrap text-slate-500">{config.xUnit}</span>
              <input
                ref={input}
                className="w-full min-w-16 bg-transparent py-1.5 text-xl font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-300 disabled:cursor-not-allowed"
                inputMode="decimal"
                autoComplete="off"
                maxLength={9}
                placeholder="…"
                aria-invalid={!!error}
                aria-describedby={error ? "error" : undefined}
                disabled={readOnly}
                onInput={() => error && setError("")}
              />
            </label>
            <button
              type="submit"
              disabled={readOnly}
              className="cursor-pointer rounded-xl bg-sky-600 px-5 py-2.5 font-semibold text-white shadow-sm transition hover:bg-sky-700 focus-visible:ring-4 focus-visible:ring-sky-200 focus-visible:outline-none active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t.add}
            </button>
            <p id="error" role="alert" className={`m-0 basis-full text-sm text-rose-600 ${error ? "" : "hidden"}`}>{error}</p>
          </form>
          {formulas.filter((f) => f.error).map((f) => (
            <p key={f.label} className="m-0 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{t.invalidFormula(f.label, f.error)}</p>
          ))}

          <div className="max-h-96 overflow-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full border-separate border-spacing-0 text-left tabular-nums">
              <caption className="sr-only">{t.table}</caption>
              <thead className="sticky top-0 z-10 bg-slate-50 text-sm text-slate-600">
                <tr>
                  <th scope="col" className="border-b border-slate-200 px-3 py-2 font-semibold">{config.xUnit}</th>
                  {formulas.map((f, i) => (
                    <th key={i} scope="col" className="border-b border-slate-200 px-3 py-2 font-semibold">
                      <span className="flex items-start gap-2">
                        <svg className="mt-1 h-3.5 w-3.5 shrink-0 overflow-visible" viewBox="-8 -8 16 16" aria-hidden="true"><Marker series={i} size={5} /></svg>
                        <span>{t.inUnit(f.label, config.yUnit)}</span>
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="w-10 border-b border-slate-200"><span className="sr-only">{t.remove("")}</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500">{t.empty}</td></tr>
                )}
                {rows.map((x, index) => {
                  const isSelected = x === selected;
                  return (
                    <tr key={x} className={`group cursor-pointer transition-colors ${isSelected ? "bg-sky-50" : index === 0 ? "animate-pop" : "hover:bg-slate-50"}`} onClick={() => select(x)}>
                      <td className={`border-b border-slate-100 px-3 py-2 font-semibold ${isSelected ? "shadow-[inset_3px_0_0_var(--color-sky-600)]" : ""}`}>
                        <button type="button" className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-slate-900 tabular-nums focus-visible:underline focus-visible:outline-none"
                          aria-pressed={isSelected} aria-label={t.select(xFormat.format(x))}
                          onClick={(e) => { e.stopPropagation(); select(x); }}>
                          {xFormat.format(x)}
                        </button>
                      </td>
                      {formulas.map((f, i) => {
                        const y = f.at(x);
                        return (
                          <td key={i} className={`border-b border-slate-100 px-3 py-2 ${isSelected ? "font-semibold" : "text-slate-600"}`} style={isSelected ? { color: ["#2c5bc9", "#b81d68"][i] } : undefined}>
                            {y === null ? <span className="text-slate-400" title={t.noResult}>–</span> : valueFormat.format(y)}
                          </td>
                        );
                      })}
                      <td className="border-b border-slate-100 px-1 text-right">
                        <button type="button" disabled={readOnly} aria-label={t.remove(xFormat.format(x))} title={t.remove(xFormat.format(x))}
                          className="grid h-8 w-8 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-slate-400 opacity-60 transition group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 focus-visible:opacity-100 disabled:hidden"
                          onClick={(e) => { e.stopPropagation(); remove(x); }}>
                          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path d="M6.3 5 10 8.6 13.7 5 15 6.3 11.4 10l3.6 3.7-1.3 1.3-3.7-3.6L6.3 15 5 13.7 8.6 10 5 6.3z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-2 pt-1 text-sm text-slate-600" aria-hidden="true">
            {formulas.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 overflow-visible" viewBox="-8 -8 16 16"><Marker series={i} size={5} /></svg>
                {f.label}
              </span>
            ))}
          </div>
          <Chart series={series} selected={selected} onSelect={select} xMin={xMin} xMax={xMax} yMin={yMin} yMax={yMax}
            xLabel={config.xLabel} yLabel={config.yLabel} connect={String(config.connectPoints) === "true"}
            axisFormat={xFormat} valueFormat={valueFormat} title={t.graph} />
        </div>
      </div>
    </div>
  );
};
