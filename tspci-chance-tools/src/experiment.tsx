import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Experiment, MAX_ROWS, MAX_TRIALS, RUNS, Row, Setup, formatNumber, formatRat, frequencies, trialCount, trialsOf } from "./chance";
import type { Texts } from "./texts";
import { ToolView, fillOf, keyName, reducedMotion, useReducedMotion } from "./view";

// Doing the experiment: the tool with the last trial, the buttons for 1, 10 and 100 trials, and the frequency table
// and bar chart. A run animates its last trial once (not with reduced motion); the table follows when it stops.

export const button = "inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium " +
  "text-slate-800 hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";
const primary = "inline-flex items-center justify-center rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-800 " +
  "disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";
const ANIMATION_MS = 950;

/** The colour of a bar: the item's when an outcome is a single sector or ball, else neutral. */
const colorOf = (setup: Setup, key: string) => {
  if (setup.tool !== "spinner" && setup.tool !== "bag") return -1;
  const items = setup.tool === "spinner" ? setup.spinner.sectors : setup.bag.balls;
  return items.find((x) => x.label === key)?.color ?? -1;
};

const Chart = ({ rows, setup, t, language, total, showTheory }: {
  rows: Row[]; setup: Setup; t: Texts; language: string; total: number; showTheory: boolean;
}) => {
  const shown = rows.slice(0, MAX_ROWS);
  const name = keyName(setup, t);
  const peak = Math.max(0.1, ...shown.map((r) => r.relative), ...(showTheory ? shown.map((r) => (r.p ? r.p.n / r.p.d : 0)) : []));
  const top = Math.min(1, Math.ceil(peak * 10 - 1e-9) / 10);
  const step = top > 0.5 ? 0.2 : 0.1;
  const slot = Math.max(22, Math.min(56, 420 / shown.length));
  const left = 38, plotTop = 12, plotH = 150;
  const width = left + slot * shown.length + 8;
  const y = (v: number) => plotTop + plotH - (v / top) * plotH;
  const short = (key: string) => {
    const item = (setup.tool === "spinner" ? setup.spinner.sectors : setup.tool === "bag" ? setup.bag.balls : []).find((x) => x.label === key);
    const text = item ? item.letter : name(key);
    return text.length > 7 ? `${text.slice(0, 6)}…` : text;
  };
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => Math.round(i * step * 10) / 10);
  return (
    <svg viewBox={`0 0 ${width} ${plotTop + plotH + 34}`} width={width} className="max-w-full overflow-visible" role="img" aria-label={t.chart(total)}
      data-testid="chart">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={left} x2={width - 4} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#64748b" : "#e2e8f0"} stroke-width="1" />
          <text x={left - 6} y={y(v)} text-anchor="end" dominant-baseline="central" font-size="10" fill="#64748b">{formatNumber(v, language, 1)}</text>
        </g>
      ))}
      {shown.map((r, i) => {
        const x = left + i * slot + slot * 0.18;
        const w = slot * 0.64;
        const h = Math.max(0, y(0) - y(r.relative));
        const theory = r.p ? r.p.n / r.p.d : null;
        return (
          <g key={r.key}>
            <title>{`${name(r.key)}: ${r.count} (${formatNumber(r.relative, language)})`}</title>
            {h > 0 && <path d={`M${x} ${y(0)}v${-Math.max(0, h - 4)}q0 -4 4 -4h${w - 8}q4 0 4 4v${Math.max(0, h - 4)}z`}
              fill={colorOf(setup, r.key) >= 0 ? fillOf(colorOf(setup, r.key)) : "#0369a1"} stroke="#1e293b" stroke-width=".75" />}
            {showTheory && theory !== null && (
              <line x1={x - 3} x2={x + w + 3} y1={y(theory)} y2={y(theory)} stroke="#0f172a" stroke-width="2" stroke-dasharray="4 3" />
            )}
            {slot >= 34 && total > 0 && (
              <text x={x + w / 2} y={y(r.relative) - 5} text-anchor="middle" font-size="10" fill="#334155">{formatNumber(r.relative, language)}</text>
            )}
            <text x={x + w / 2} y={y(0) + 14} text-anchor="middle" font-size="11" fill="#334155">{short(r.key)}</text>
          </g>
        );
      })}
    </svg>
  );
};

export const ExperimentPanel = ({ setup, experiment, t, language, showTheory, readOnly, onRun, onNew, say, title, testid = "experiment" }: {
  setup: Setup;
  experiment: Experiment;
  t: Texts;
  language: string;
  showTheory: boolean;
  readOnly: boolean;
  onRun: (n: number) => void;
  onNew: () => void;
  say: (message: string) => void;
  title?: string;
  testid?: string;
}) => {
  const reduced = useReducedMotion();
  const total = trialCount(experiment);
  const trials = useMemo(() => trialsOf(setup, experiment), [setup, experiment]);
  // what the table shows: behind the trials while the last one is animated
  const [shown, setShown] = useState(total);
  const [animating, setAnimating] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const runRef = useRef<number | null>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    clearTimeout(timer.current);
    const run = runRef.current;
    runRef.current = null;
    const announce = () => {
      if (run && trials.length) say(t.ranStatus(run, trials.length, keyName(setup, t)(trials[trials.length - 1].key)));
    };
    if (run && !reduced && !reducedMotion() && total > shown) { // asked again: the setting may have changed
      setAnimating(true);
      timer.current = setTimeout(() => { setShown(total); setAnimating(false); announce(); }, ANIMATION_MS);
    } else {
      setShown(total);
      setAnimating(false);
      announce();
    }
  }, [total, experiment.start]);

  const visible = trials.slice(0, Math.min(shown, trials.length));
  const rows = frequencies(setup, visible);
  const name = keyName(setup, t);
  const last = trials[trials.length - 1] ?? null;
  const recent = visible.slice(-10);
  const sum = (setup.tool === "dice" && setup.dice.combine === "sum") ? t.sum : setup.tool === "coins" && setup.coins.combine === "sum" ? t.heads_ : t.outcome;
  const full = total >= MAX_TRIALS;
  const run = (n: number) => {
    if (full) return say(t.maxTrials(MAX_TRIALS));
    runRef.current = Math.min(n, MAX_TRIALS - total);
    onRun(n);
  };

  return (
    <section className="flex flex-wrap items-start gap-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label={title ?? t.run} data-testid={testid}>
      <div className="flex w-60 max-w-full flex-col items-center gap-3">
        {title && <h3 className="self-start text-sm font-semibold text-slate-700">{title}</h3>}
        <ToolView setup={setup} trial={last} trialIndex={total} t={t} animate={animating} />
        <div role="group" aria-label={t.run} className="flex flex-wrap justify-center gap-2">
          {RUNS.map((n) => (
            <button key={n} type="button" className={primary} aria-label={t.timesLabel(n)} disabled={readOnly || full} onClick={() => run(n)}>
              {t.times(n)}
            </button>
          ))}
        </div>
        <button type="button" className={button} disabled={readOnly || total === 0} onClick={() => { onNew(); say(t.resetStatus); }}>{t.again}</button>
        <p className="text-sm font-medium text-slate-700 tabular-nums" data-testid="trials">{t.trials(visible.length)}</p>
        {recent.length > 0 && (
          <p className="text-center text-xs text-slate-500" data-testid="recent">
            {t.last}: {recent.map((x) => name(x.key)).join(" · ")}
          </p>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-sm tabular-nums" data-testid="table">
            <caption className="sr-only">{t.results}</caption>
            <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">{sum}</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">{t.frequency}</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">{t.relative}</th>
                {showTheory && <th scope="col" className="px-3 py-2 text-right font-semibold">{t.probability}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const color = colorOf(setup, r.key);
                return (
                  <tr key={r.key} className="border-t border-slate-100" data-key={r.key}>
                    <th scope="row" className="px-3 py-1.5 text-left font-medium text-slate-800">
                      <span className="inline-flex items-center gap-2">
                        {color >= 0 && <svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" rx="3" fill={fillOf(color)} stroke="#1e293b" stroke-width="1" /></svg>}
                        {name(r.key)}
                      </span>
                    </th>
                    <td className="px-3 py-1.5 text-right">{r.count}</td>
                    <td className="px-3 py-1.5 text-right">{visible.length ? formatNumber(r.relative, language) : "–"}</td>
                    {showTheory && <td className="px-3 py-1.5 text-right">{r.p ? `${formatRat(r.p)} ≈ ${formatNumber(r.p.n / r.p.d, language)}` : "–"}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visible.length === 0 ? (
          <p className="text-sm text-slate-500">{t.noTrials}</p>
        ) : (
          <figure className="overflow-x-auto">
            <Chart rows={rows} setup={setup} t={t} language={language} total={visible.length} showTheory={showTheory} />
            {showTheory && <figcaption className="text-xs text-slate-500">{t.dashed}</figcaption>}
          </figure>
        )}
      </div>
    </section>
  );
};
