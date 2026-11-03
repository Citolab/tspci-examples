import { useState } from "preact/hooks";
import { Knobs, Scope } from "./interaction";
import { ScreenTrace } from "./screen";
import { Settings, Signal } from "./settings";
import { textsFor } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance): the same screen and knobs; the author chooses which signal the
// knobs set: the reference, the candidate's start, or the correct setting. The result is six data- attributes.

export type Signals = { reference: Signal; start: Signal; correct: Signal | null };
type Which = keyof Signals;

const within = (s: Settings, signal: Signal) =>
  signal.frequency >= s.frequency.min && signal.frequency <= s.frequency.max && signal.amplitude >= s.amplitude.min && signal.amplitude <= s.amplitude.max;

/** What the author should know (getAuthoringInstance validate()). */
export const authoringProblems = (settings: Settings, signals: Signals, language: string) => {
  const t = textsFor(language);
  return signals.correct && !within(settings, signals.correct) ? [t.correctOutOfRange] : [];
};

const tab = "rounded-lg border px-3 py-1.5 text-sm aria-selected:border-emerald-700 aria-selected:bg-emerald-50 aria-selected:text-emerald-900 border-slate-300 bg-white hover:bg-slate-50";

const Authoring = ({ settings, initial, language, onChange }: {
  settings: Settings;
  initial: Signals;
  /** The author's language, for the texts. */
  language: string;
  onChange: (signals: Signals) => void;
}) => {
  const t = textsFor(language);
  const [signals, setSignals] = useState<Signals>(initial);
  const [which, setWhich] = useState<Which>("correct");
  const commit = (next: Signals) => {
    setSignals(next);
    onChange(next);
  };
  const editing: Which = which === "correct" && !signals.correct ? "start" : which;
  const current = signals[editing] as Signal;
  const names: Record<Which, string> = { reference: t.reference, start: t.start, correct: t.correct };
  const kindOf = (w: Which): ScreenTrace["kind"] => (w === editing ? "candidate" : w === "reference" ? "reference" : "ghost");
  const order: Which[] = ["reference", "start", "correct"];
  const traces: ScreenTrace[] = order.filter((w) => signals[w]).map((w) => ({ key: w, signal: signals[w] as Signal, kind: kindOf(w) }));
  // the one being set is green; the reference grey and dashed; the other one dotted
  const legend = order.filter((w) => signals[w]).map((w) => ({ kind: kindOf(w), text: names[w] }))
    .sort((a, b) => ["reference", "ghost", "candidate"].indexOf(a.kind) - ["reference", "ghost", "candidate"].indexOf(b.kind));
  const problems = authoringProblems(settings, signals, language);
  // the author sees the values, whatever the candidate sees
  const shown: Settings = { ...settings, showValues: true };

  return (
    <div className="flex flex-col gap-3 font-sans text-sm text-slate-800">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label={t.setUp}>
        {order.map((w) => (
          <button key={w} type="button" role="tab" className={tab} aria-selected={editing === w} data-testid={`set-${w}`}
            onClick={() => {
              if (w === "correct" && !signals.correct) commit({ ...signals, correct: { ...signals.start } });
              setWhich(w);
            }}>
            {w === "correct" && !signals.correct ? t.addCorrect : names[w]}
          </button>
        ))}
        {signals.correct && (
          <button type="button" className="ml-auto rounded-lg px-3 py-1.5 text-sm text-slate-600 underline hover:text-slate-900"
            data-testid="no-correct" onClick={() => { commit({ ...signals, correct: null }); setWhich("start"); }}>{t.noCorrect}</button>
        )}
      </div>
      <p className="m-0 max-w-[80ch] text-xs text-slate-500">{t.authoringHint}</p>
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start">
        <Scope settings={settings} traces={traces} texts={t} legend={legend} label={t.screen} />
        <Knobs settings={shown} texts={t} signal={current} onChange={(change) => commit({ ...signals, [editing]: { ...current, ...change } })}>
          <p className="m-0 text-xs text-slate-500" data-testid="editing">{t.setUp}: <strong>{names[editing]}</strong></p>
        </Knobs>
      </div>
      {!settings.showReference && <p className="m-0 text-xs text-amber-800">{t.hiddenReference}</p>}
      {problems.map((p) => <p key={p} className="m-0 text-red-700" data-testid="problem">{p}</p>)}
    </div>
  );
};

export default Authoring;
