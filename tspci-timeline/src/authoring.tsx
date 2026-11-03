import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import Board from "./board";
import {
  MAX_EVENTS, MODES, Mode, Period, Placed, Scoring, Timeline, TimelineEvent, UNITS, Unit, correctValue, evaluate, formatYear, parseYear,
  problemsOf, responseProcessingXml, snapYear, tijdvakken,
} from "./timeline";
import { textsFor } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance): the axis, the periods, the events with their answers, the
// mode, the margin and the scoring, with the answer on the timeline as a preview. The result is data-timeline.

/** What keeps the timeline from being used (getAuthoringInstance validate()), in the author's language. */
export const authoringProblems = (t: Timeline, language: string): string[] => problemsOf(t).map(textsFor(language).problem);

const button = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-sky-700";
const small = "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-sky-700";
const field = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm";
type Tab = "axis" | "periods" | "events" | "scoring";

/** The answers there are, for the preview. */
const answers = (t: Timeline): Placed => {
  const placed: Placed = {};
  for (const e of t.events) {
    const v = correctValue(t, e);
    if (v !== null) placed[e.id] = t.mode === "order" ? snapYear(v as number, "year", t.snap) : v;
  }
  return placed;
};

const YearInput = ({ value, onYear, label, testid }: { value: number | undefined; onYear: (y: number | undefined) => void; label: string; testid: string }) => {
  const [bad, setBad] = useState(false);
  return (
    <input type="text" inputMode="text" defaultValue={value === undefined ? "" : String(value)} aria-label={label} data-testid={testid} aria-invalid={bad}
      className={`${field} w-28 tabular-nums ${bad ? "border-rose-600" : ""}`}
      onInput={(e) => {
        const text = (e.target as HTMLInputElement).value;
        const y = parseYear(text);
        setBad(!!text.trim() && y === null);
        onYear(y === null ? undefined : Math.round(y));
      }} />
  );
};

const Authoring = ({ initial, language, candidateLanguage, onChange }: {
  initial: Timeline; language: string; candidateLanguage: "en" | "nl"; onChange: (t: Timeline) => void;
}) => {
  const t = textsFor(language);
  const [tl, setTl] = useState<Timeline>(initial);
  const [tab, setTab] = useState<Tab>("events");
  const [version, setVersion] = useState(0); // remounts the uncontrolled inputs after a structural change
  const commit = (next: Timeline, remount = false) => {
    setTl(next);
    onChange(next);
    if (remount) setVersion((v) => v + 1);
  };
  const setEvent = (i: number, patch: Partial<TimelineEvent>) =>
    commit({ ...tl, events: tl.events.map((e, j) => (j === i ? clean({ ...e, ...patch }) : e)) });
  const clean = (e: TimelineEvent): TimelineEvent => {
    const out = { ...e };
    (Object.keys(out) as (keyof TimelineEvent)[]).forEach((k) => (out[k] === undefined || out[k] === "") && k !== "text" && delete out[k]);
    return out;
  };
  const setPeriod = (i: number, patch: Partial<Period>) => commit({ ...tl, preset: "", periods: tl.periods.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const newId = (prefix: string, used: string[]) => {
    let n = used.length + 1;
    while (used.includes(`${prefix}${n}`)) n++;
    return `${prefix}${n}`;
  };
  const moveEvent = (i: number, d: number) => {
    const events = [...tl.events];
    [events[i], events[i + d]] = [events[i + d], events[i]];
    commit({ ...tl, events }, true);
  };

  const problems = authoringProblems(tl, language);
  const evaluation = evaluate(tl, answers(tl));
  const xml = responseProcessingXml(tl);
  const presetValue = tl.preset === "tijdvakken" ? "tijdvakken" : tl.periods.length ? "own" : "none";

  const tabButton = (id: Tab, label: string) => (
    <button type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`}
      className={`rounded-t-lg border-b-2 px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-sky-700 ${tab === id ? "border-sky-700 text-sky-800" : "border-transparent text-slate-600 hover:text-slate-900"}`}
      onClick={() => setTab(id)}>
      {label}
    </button>
  );
  const labelled = (label: string, control: ComponentChildren, hint?: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {control}
      {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
    </label>
  );

  return (
    <div className="flex flex-col gap-3 p-3 font-sans text-slate-800" lang={language} data-testid="authoring">
      <div role="tablist" className="flex gap-1 border-b border-slate-200">
        {tabButton("events", t.tabEvents)}
        {tabButton("axis", t.tabAxis)}
        {tabButton("periods", t.tabPeriods)}
        {tabButton("scoring", t.tabScoring)}
      </div>

      {tab === "axis" && (
        <div role="tabpanel" id="panel-axis" aria-labelledby="tab-axis" className="flex flex-wrap items-start gap-4" key={`axis${version}`}>
          {labelled(t.start, <YearInput value={tl.start} label={t.start} testid="axis-start" onYear={(y) => y !== undefined && commit({ ...tl, start: y })} />, t.yearHint)}
          {labelled(t.end, <YearInput value={tl.end} label={t.end} testid="axis-end" onYear={(y) => y !== undefined && commit({ ...tl, end: y })} />)}
          {labelled(t.unit, (
            <select className={field} value={tl.unit} data-testid="unit" onChange={(e) => commit({ ...tl, unit: (e.target as HTMLSelectElement).value as Unit })}>
              {UNITS.map((u) => <option key={u} value={u}>{t.units[u]}</option>)}
            </select>
          ))}
          {tl.unit === "year" && labelled(t.snap, (
            <input type="number" min={1} step={1} className={`${field} w-20`} defaultValue={String(tl.snap)} data-testid="snap"
              onInput={(e) => { const n = Math.round(Number((e.target as HTMLInputElement).value)); if (n >= 1) commit({ ...tl, snap: n }); }} />
          ))}
        </div>
      )}

      {tab === "periods" && (
        <div role="tabpanel" id="panel-periods" aria-labelledby="tab-periods" className="flex flex-col gap-3" key={`periods${version}`}>
          <fieldset className="m-0 flex flex-wrap gap-4 border-0 p-0">
            <legend className="sr-only">{t.periods}</legend>
            {([["none", t.presetNone], ["tijdvakken", t.presetTijdvakken], ["own", t.presetOwn]] as const).map(([value, label]) => (
              <label key={value} className="flex items-center gap-1.5 text-sm">
                <input type="radio" name="preset" value={value} checked={presetValue === value} data-testid={`preset-${value}`}
                  onChange={() => {
                    if (value === "none") commit({ ...tl, preset: "", periods: [] }, true);
                    else if (value === "tijdvakken") commit({ ...tl, preset: "tijdvakken", periods: tijdvakken(candidateLanguage) }, true);
                    else commit({ ...tl, preset: "", periods: tl.periods.length ? tl.periods : [{ id: "p1", label: "", start: tl.start, end: tl.end }] }, true);
                  }} />
                {label}
              </label>
            ))}
          </fieldset>
          {tl.periods.length > 0 && (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-1 font-medium">#</th><th className="py-1 font-medium">{t.label}</th>
                  <th className="py-1 font-medium">{t.start}</th><th className="py-1 font-medium">{t.end}</th><th />
                </tr>
              </thead>
              <tbody>
                {tl.periods.map((p, i) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="py-1 pr-2 text-slate-500">{i + 1}</td>
                    <td className="py-1 pr-2">
                      <input type="text" className={`${field} w-full`} defaultValue={p.label} aria-label={`${t.label} ${i + 1}`} data-testid={`period-label-${i}`}
                        onInput={(e) => setPeriod(i, { label: (e.target as HTMLInputElement).value })} />
                    </td>
                    <td className="py-1 pr-2"><YearInput value={p.start} label={`${t.start} ${i + 1}`} testid={`period-start-${i}`} onYear={(y) => y !== undefined && setPeriod(i, { start: y })} /></td>
                    <td className="py-1 pr-2"><YearInput value={p.end} label={`${t.end} ${i + 1}`} testid={`period-end-${i}`} onYear={(y) => y !== undefined && setPeriod(i, { end: y })} /></td>
                    <td className="py-1 text-right">
                      <button type="button" className={small} onClick={() => commit({ ...tl, preset: "", periods: tl.periods.filter((_, j) => j !== i) }, true)}>{t.remove}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {presetValue !== "none" && (
            <div>
              <button type="button" className={button} data-testid="add-period"
                onClick={() => {
                  const last = tl.periods[tl.periods.length - 1];
                  const start = last ? last.end : tl.start;
                  commit({ ...tl, preset: "", periods: [...tl.periods, { id: newId("p", tl.periods.map((p) => p.id)), label: "", start, end: tl.end }] }, true);
                }}>
                {t.addPeriod}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "events" && (
        <div role="tabpanel" id="panel-events" aria-labelledby="tab-events" className="flex flex-col gap-2" key={`events${version}`}>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {tl.events.map((e, i) => (
              <li key={e.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-2" data-testid={`event-${i}`}>
                <span className="w-6 pb-1.5 text-sm font-semibold text-slate-500" aria-hidden="true">{i + 1}</span>
                {labelled(t.text, <input type="text" className={`${field} w-72`} defaultValue={e.text} aria-label={`${t.text} ${i + 1}`} data-testid={`event-text-${i}`}
                  onInput={(ev) => setEvent(i, { text: (ev.target as HTMLInputElement).value })} />)}
                {tl.mode !== "period" || !tl.periods.length
                  ? labelled(t.year, <YearInput value={e.year} label={`${t.year} ${i + 1}`} testid={`event-year-${i}`} onYear={(y) => setEvent(i, { year: y })} />)
                  : labelled(t.correctPeriod, (
                    <select className={`${field} w-56`} value={e.period ?? ""} aria-label={`${t.correctPeriod} ${i + 1}`} data-testid={`event-period-${i}`}
                      onChange={(ev) => setEvent(i, { period: (ev.target as HTMLSelectElement).value || undefined })}>
                      <option value="">{t.byYear}{e.year !== undefined ? ` (${formatYear(e.year, language, tl.start < 0)})` : ""}</option>
                      {tl.periods.map((p, j) => <option key={p.id} value={p.id}>{j + 1} · {p.label}</option>)}
                    </select>
                  ))}
                {tl.mode === "period" && tl.periods.length > 0 &&
                  labelled(t.year, <YearInput value={e.year} label={`${t.year} ${i + 1}`} testid={`event-year-${i}`} onYear={(y) => setEvent(i, { year: y })} />)}
                <details className="text-sm">
                  <summary className="cursor-pointer pb-1.5 text-xs text-slate-600">{t.image}</summary>
                  <div className="flex flex-wrap gap-2">
                    <input type="url" className={`${field} w-64`} defaultValue={e.image ?? ""} aria-label={`${t.image} ${i + 1}`} placeholder="https://…"
                      onInput={(ev) => setEvent(i, { image: (ev.target as HTMLInputElement).value.trim() || undefined })} />
                    <input type="text" className={`${field} w-48`} defaultValue={e.alt ?? ""} aria-label={`${t.alt} ${i + 1}`} placeholder={t.alt}
                      onInput={(ev) => setEvent(i, { alt: (ev.target as HTMLInputElement).value.trim() || undefined })} />
                  </div>
                </details>
                <span className="ml-auto flex gap-1 pb-0.5">
                  <button type="button" className={small} disabled={i === 0} onClick={() => moveEvent(i, -1)} aria-label={`${t.up}: ${i + 1}`}>↑</button>
                  <button type="button" className={small} disabled={i === tl.events.length - 1} onClick={() => moveEvent(i, 1)} aria-label={`${t.down}: ${i + 1}`}>↓</button>
                  <button type="button" className={small} onClick={() => commit({ ...tl, events: tl.events.filter((_, j) => j !== i) }, true)} aria-label={`${t.remove}: ${i + 1}`}>{t.remove}</button>
                </span>
              </li>
            ))}
          </ol>
          <div>
            <button type="button" className={button} disabled={tl.events.length >= MAX_EVENTS} data-testid="add-event"
              onClick={() => commit({ ...tl, events: [...tl.events, { id: newId("e", tl.events.map((e) => e.id)), text: "" }] }, true)}>
              {t.addEvent}
            </button>
          </div>
        </div>
      )}

      {tab === "scoring" && (
        <div role="tabpanel" id="panel-scoring" aria-labelledby="tab-scoring" className="flex flex-wrap items-start gap-4" key={`scoring${version}`}>
          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1 text-xs font-medium text-slate-600">{t.mode}</legend>
            {MODES.map((m) => (
              <label key={m} className="flex items-center gap-1.5 text-sm">
                <input type="radio" name="mode" value={m} checked={tl.mode === m} data-testid={`mode-${m}`}
                  onChange={() => commit({ ...tl, mode: m as Mode, ...(m === "period" && !tl.periods.length ? { preset: "tijdvakken", periods: tijdvakken(candidateLanguage) } : {}) }, true)} />
                {t.modes[m]}
              </label>
            ))}
          </fieldset>
          {tl.mode === "date" && labelled(t.margin, (
            <input type="number" min={0} step={1} className={`${field} w-24`} defaultValue={String(tl.margin)} data-testid="margin"
              onInput={(e) => { const n = Number((e.target as HTMLInputElement).value.replace(",", ".")); if (Number.isFinite(n) && n >= 0) commit({ ...tl, margin: n }); }} />
          ))}
          {labelled(t.scoring, (
            <select className={field} value={tl.scoring} data-testid="scoring" onChange={(e) => commit({ ...tl, scoring: (e.target as HTMLSelectElement).value as Scoring })}>
              <option value="each">{t.scorings.each}</option>
              <option value="all">{t.scorings.all}</option>
            </select>
          ))}
          <p className="m-0 self-end text-sm text-slate-600" data-testid="maxscore">{t.maxScore(evaluation.maxscore)}</p>
        </div>
      )}

      <section aria-label={t.problemsTitle} className={`rounded-lg p-2 text-sm ${problems.length ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`} data-testid="problems">
        {problems.length ? (
          <ul className="m-0 list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        ) : (
          <p className="m-0">{t.noProblems}</p>
        )}
      </section>

      <section className="flex flex-col gap-1.5">
        <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.preview}</h3>
        <Board key={`${tl.start}:${tl.end}:${tl.unit}:${tl.mode}`} timeline={tl} placed={answers(tl)} texts={textsFor(language)}
          language={language === "nl" ? "nl" : "en"} label={t.preview} readOnly idPrefix="authoring" />
      </section>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">{t.responseProcessing}</summary>
        <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-[11.5px] leading-snug text-slate-100" data-testid="response-processing">{xml}</pre>
      </details>
    </div>
  );
};

export default Authoring;
