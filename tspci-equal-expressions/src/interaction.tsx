import { useMemo, useRef, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import type { PciProperties } from "@citolab/tspci";
import configProps from "./config.json";
import { Actions, StateModel } from "./store";
import { Expression, ExpressionError, Token, clean, parseExpression, parseNumber } from "./expression";
import { ImageChoice } from "./images";
import { Texts } from "./texts";
type PropTypes = PciProperties<typeof configProps>;

/** "?" is the unknown (and "$1", as in the PCI this one replaces); "x" is a times sign here. */
export const SYMBOLS = { unknown: ["?", "$1", "□", "…"], times: ["x", "X"] };

type Parsed = { expression: Expression; error?: undefined } | { expression?: undefined; error: string };

export const parse = (source: string): Parsed => {
  try {
    return { expression: parseExpression(source, SYMBOLS) };
  } catch (e) {
    return { error: e instanceof ExpressionError ? e.message : String(e) };
  }
};

export const Interaction = ({ config, store, image, t, readOnly }: {
  config: PropTypes;
  store: IStore<StateModel, Actions>;
  image: ImageChoice;
  t: Texts;
  readOnly: boolean;
}) => {
  const state = useStore(store);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const language = config.language === "nl" ? "nl" : "en";
  const format = useMemo(() => new Intl.NumberFormat(language, { maximumFractionDigits: 3, useGrouping: false }), [language]);
  const expressions = useMemo(() => [config.expression1, config.expression2].map(parse), [config.expression1, config.expression2]);

  const columns = Math.max(1, Math.min(10, parseInt(config.columns, 10) || 4));
  const tries = [...state.tries].reverse(); // the newest first, next to the expressions
  const cells: (number | null)[] = [...tries, ...Array(Math.max(0, columns - tries.length)).fill(null)];
  const highlight = String(config.highlightEqual) === "true";

  const results = (value: number) =>
    expressions.map(({ expression }) => {
      const result = expression ? clean(expression.evaluate(value)) : NaN;
      return Number.isFinite(result) ? result : null;
    });
  const isEqual = (value: number) => {
    const [a, b] = results(value);
    return a !== null && b !== null && Math.abs(a - b) < 1e-9;
  };

  const calculate = (e: Event) => {
    e.preventDefault();
    const value = parseNumber(input.current?.value ?? "");
    if (Number.isNaN(value)) {
      setError(t.notANumber);
      input.current?.focus();
      return;
    }
    setError("");
    store.dispatch({ type: "TRY", payload: { value } });
    input.current.value = "";
    input.current.focus();
  };

  return (
    <div className="inline-flex max-w-full flex-col gap-4 rounded-2xl border border-slate-200 bg-linear-to-b from-white to-slate-50 p-5 font-sans text-slate-800 shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_rgba(16,24,40,.06)]" lang={language}>
      <form className="flex flex-wrap items-center gap-3" onSubmit={calculate} noValidate>
        <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white py-1.5 pr-2 pl-2.5 shadow-inner transition focus-within:border-sky-500 focus-within:ring-4 focus-within:ring-sky-100">
          <Unknown image={image} size="h-10 w-10" />
          <span className="text-2xl text-slate-400" aria-hidden="true">=</span>
          <input
            ref={input}
            className="w-28 bg-transparent text-3xl font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-300 disabled:cursor-not-allowed"
            inputMode="decimal"
            autoComplete="off"
            maxLength={9}
            placeholder="…"
            aria-label={t.input(image.name)}
            aria-invalid={!!error}
            aria-describedby={error ? "error" : undefined}
            disabled={readOnly}
            onInput={() => error && setError("")}
          />
        </label>
        <button
          type="submit"
          disabled={readOnly}
          className="cursor-pointer rounded-xl bg-sky-600 px-5 py-3 text-lg font-semibold text-white shadow-sm transition hover:bg-sky-700 focus-visible:ring-4 focus-visible:ring-sky-200 focus-visible:outline-none active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t.calculate}
        </button>
        <p id="error" role="alert" className={`m-0 basis-full text-sm text-rose-600 ${error ? "" : "hidden"}`}>{error}</p>
      </form>

      <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="border-separate border-spacing-0 text-2xl tabular-nums">
          <caption className="sr-only">{t.tries}</caption>
          <tbody>
            <tr>
              <th scope="row" className="sticky left-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-2 text-right font-normal">
                <span className="sr-only">{t.tried}</span>
                <span className="inline-flex justify-end" aria-hidden="true"><Unknown image={image} size="h-10 w-10" /></span>
              </th>
              {cells.map((value, i) => (
                <td key={value ?? `empty${i}`} className={cellClass(value, i, highlight && value !== null && isEqual(value), "border-b border-slate-200 font-bold text-slate-900")}>
                  {value !== null && (
                    <span className="inline-flex items-center gap-1">
                      {format.format(value)}
                      {highlight && isEqual(value) && <Check label={t.equal} />}
                    </span>
                  )}
                </td>
              ))}
            </tr>
            {expressions.map((parsed, row) => (
              <tr key={row}>
                <th scope="row" className={`sticky left-0 z-10 bg-slate-50 px-4 py-2 text-right font-normal whitespace-nowrap ${row === 0 ? "border-b border-slate-200" : ""}`}>
                  {parsed.expression ? (
                    <span className="inline-flex items-center justify-end gap-1.5">
                      <span className="sr-only">{t.expression(row + 1)}: </span>
                      <Tokens tokens={parsed.expression.tokens} image={image} format={format} t={t} />
                      <span className="text-slate-400" aria-hidden="true">=</span>
                    </span>
                  ) : (
                    <span className="text-sm text-rose-600">{t.invalidExpression(row + 1, parsed.error)}</span>
                  )}
                </th>
                {cells.map((value, i) => {
                  const result = value === null ? null : results(value)[row];
                  return (
                    <td key={value ?? `empty${i}`} className={cellClass(value, i, highlight && value !== null && isEqual(value), row === 0 ? "border-b border-slate-200" : "")}>
                      {value === null ? "" : result === null ? <span className="text-slate-400" title={t.noResult}>–</span> : format.format(result)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/** A cell of a try: the newest gets a tint (and appears with a pop), an equal one green. */
const cellClass = (value: number | null, index: number, equal: boolean, extra: string) =>
  [
    "h-16 min-w-20 border-l border-slate-200 px-3 text-center",
    equal ? "bg-emerald-50 text-emerald-800" : value !== null && index === 0 ? "bg-sky-50 animate-pop" : "",
    extra,
  ].join(" ");

export const Unknown = ({ image, size }: { image: ImageChoice; size: string }) => (
  <img src={image.src} alt={image.name} className={`${size} shrink-0 object-contain`} draggable={false} />
);

/** An expression as the candidate reads it: × and ÷ (or : in Dutch), a real minus sign, the image for the unknown. */
export const Tokens = ({ tokens, image, format, t }: { tokens: Token[]; image: ImageChoice; format: Intl.NumberFormat; t: Texts }) => (
  <>
    {tokens.map((token, i) => {
      const previous = tokens[i - 1];
      if (token.kind === "op" && token.op === "^") return null;
      if (previous?.kind === "op" && previous.op === "^" && token.kind === "number") {
        return <sup key={i} className="text-base">{format.format(token.value)}</sup>;
      }
      if (token.kind === "number") return <span key={i}>{format.format(token.value)}</span>;
      if (token.kind === "unknown") return <Unknown key={i} image={image} size="h-9 w-9" />;
      if (token.kind === "paren") return <span key={i} className="text-slate-500">{token.paren}</span>;
      const sign = { "+": "+", "-": "−", "*": "×", "/": t.divide }[token.op];
      return <span key={i} className="px-0.5 text-slate-400">{sign}</span>;
    })}
  </>
);

const Check = ({ label }: { label: string }) => (
  <svg className="h-5 w-5 text-emerald-600" viewBox="0 0 20 20" fill="currentColor" role="img" aria-label={label}>
    <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0z" clipRule="evenodd" />
  </svg>
);
