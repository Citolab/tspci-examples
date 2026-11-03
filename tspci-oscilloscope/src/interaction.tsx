import { ComponentChildren } from "preact";
import { IStore, useStore } from "@citolab/preact-store";
import Screen, { ScreenTrace, describeScreen } from "./screen";
import Knob from "./knob";
import { Settings, Signal } from "./settings";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";

// The candidate's view: the instruction, the screen with the reference and their own signal, and the two knobs.

/** The screen in its housing, with a legend under it. */
export const Scope = ({ settings, traces, texts, label, legend }: {
  settings: Settings;
  traces: ScreenTrace[];
  texts: Texts;
  label: string;
  legend: { kind: ScreenTrace["kind"]; text: string }[];
}) => (
  <div className="w-[460px] max-w-full shrink-0 rounded-2xl bg-gradient-to-b from-slate-200 to-slate-300 p-3 shadow-inner ring-1 ring-slate-300">
    <Screen settings={settings} traces={traces} texts={texts} label={label} />
    <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 px-1 text-xs text-slate-700" aria-hidden="true">
      {legend.map(({ kind, text }) => (
        <li key={text} className="flex items-center gap-1.5">
          <svg width="28" height="8" viewBox="0 0 28 8">
            <rect width="28" height="8" rx="2" fill="#0b1f1b" />
            <path d="M3 4H25" fill="none" stroke-linecap="round"
              {...(kind === "candidate" ? { stroke: "#4ade80", "stroke-width": 2.6 }
                : kind === "reference" ? { stroke: "#a3b1c2", "stroke-width": 2.2, "stroke-dasharray": "5 3" }
                  : { stroke: "#e2e8f0", "stroke-opacity": 0.6, "stroke-width": 1.5, "stroke-dasharray": "1 4" })} />
          </svg>
          {text}
        </li>
      ))}
    </ul>
  </div>
);

/** The two knobs for a signal. */
export const Knobs = ({ settings, texts, signal, onChange, disabled, children }: {
  settings: Settings;
  texts: Texts;
  signal: Signal;
  onChange: (change: Partial<Signal>) => void;
  disabled?: boolean;
  children?: ComponentChildren;
}) => (
  <div className="flex w-[460px] max-w-full flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:w-72">
    <Knob id="frequency" label={settings.frequencyUnit === "vibrations" ? texts.vibrations : texts.frequency}
      unit={texts.units[settings.frequencyUnit]} value={signal.frequency} range={settings.frequency} showValue={settings.showValues}
      language={settings.language} texts={texts} disabled={disabled} onChange={(frequency) => onChange({ frequency })} />
    <Knob id="amplitude" label={texts.amplitude} unit={texts.units[settings.amplitudeUnit]} value={signal.amplitude}
      range={settings.amplitude} showValue={settings.showValues} language={settings.language} texts={texts} disabled={disabled}
      onChange={(amplitude) => onChange({ amplitude })} />
    {children}
  </div>
);

const Interaction = ({ prompt, settings, store, texts, disabled }: {
  prompt: string;
  settings: Settings;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  disabled: boolean;
}) => {
  const { frequency, amplitude, touched } = useStore(store);
  const signal = { frequency, amplitude };
  const traces: ScreenTrace[] = [
    ...(settings.showReference ? [{ key: "reference", signal: settings.reference, kind: "reference" as const }] : []),
    { key: "candidate", signal, kind: "candidate" },
  ];
  const legend = [
    ...(settings.showReference ? [{ kind: "reference" as const, text: texts.reference }] : []),
    { kind: "candidate" as const, text: texts.yours },
  ];

  return (
    <div className="flex max-w-full flex-col gap-3 font-sans text-slate-800">
      {prompt && <p className="m-0 max-w-[70ch] text-[15px] text-slate-700">{prompt}</p>}
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start">
        <Scope settings={settings} traces={traces} texts={texts} legend={legend}
          label={`${texts.screen}. ${describeScreen(settings, texts, signal, settings.showReference)}`} />
        <Knobs settings={settings} texts={texts} signal={signal} disabled={disabled}
          onChange={(change) => store.dispatch({ type: "SET_SIGNAL", payload: change })}>
          <button type="button" disabled={disabled || !touched} onClick={() => store.reset()} title={texts.resetHint} data-testid="reset"
            className="self-start rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
            ↺ {texts.reset}
          </button>
        </Knobs>
      </div>
    </div>
  );
};

export default Interaction;
