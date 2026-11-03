import { useRef, useState } from "preact/hooks";
import View from "./view";
import { figureLabel, withRange } from "./interaction";
import {
  KINDS, Kind, MODES, Mode, Model, correctValue, formatTime, formatValue, parseNumber, parseTime, problemsOf, readModel,
  responseProcessingXml, settingsOf, snap, withUnit,
} from "./instrument";
import { Texts, nameOf, textsFor } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance): the author picks the instrument and the task, sets up the
// scale and drags the value on a live preview. getProperties() gives the settings as data- attributes.

export type Settings = Record<string, string>;
/** The settings the authoring mode writes (editor "pci" in config.json). */
export const AUTHORED = ["instrument", "mode", "min", "max", "major", "minor", "unit", "value", "precision", "ranges", "range", "vernier", "tolerance"];

/** What keeps the settings from making a good item (validate()), in the author's language. */
export const authoringProblems = (settings: Settings, language: string): string[] => {
  const t = textsFor(language);
  const m = readModel({ ...settings, language });
  return problemsOf(settings).map((p) => t.problem(p, (v) => (m.kind === "clock" ? formatTime(v) : formatValue(v, m.language))));
};

/** getProperties(): every authored setting, resolved (an empty one becomes the instrument's default). */
export const authoredConfig = (settings: Settings): Settings => {
  const resolved = settingsOf(readModel(settings));
  // a range task the meter cannot do stays as the author chose it, so validate() can say so
  const mode = MODES.includes(settings.mode as Mode) ? settings.mode : resolved.mode;
  return Object.fromEntries(AUTHORED.map((k) => [k, k === "mode" ? mode : resolved[k] ?? ""]));
};

const field = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-sky-600";

const Authoring = ({ initial, language, onChange }: { initial: Settings; language: string; onChange: (s: Settings) => void }) => {
  const t: Texts = textsFor(language);
  const [settings, setSettings] = useState<Settings>(() => authoredConfig(initial));
  const lang = (initial.language ?? "en") as string;
  const m: Model = readModel({ ...settings, language: lang, zoom: initial.zoom });
  // the latest settings, also for two changes before the next render
  const latest = useRef(settings);
  const commit = (next: Settings) => {
    latest.current = next;
    setSettings(next);
    onChange(next);
  };
  const set = (key: string, value: string) => commit({ ...latest.current, [key]: value });
  const problems = authoringProblems(settings, language);
  const correct = correctValue(m);

  const chooseKind = (kind: Kind) => {
    const fresh = authoredConfig({ instrument: kind, mode: latest.current.mode === "range" && kind !== "meter" ? "read" : latest.current.mode, tolerance: latest.current.tolerance });
    commit(fresh);
  };

  const text = (key: string, labelText: string, testid = key, width = "w-24") => (
    <label className="flex items-center justify-between gap-2">
      <span className="text-sm text-slate-600">{labelText}</span>
      <input type="text" inputMode="decimal" className={`${field} ${width} text-right`} value={settings[key] ?? ""} data-testid={`field-${testid}`}
        onChange={(e) => set(key, (e.target as HTMLInputElement).value.replace(",", "."))} />
    </label>
  );

  const valueLabel = m.mode === "set" ? t.valueSet : m.mode === "range" ? t.valueRange : t.valueRead;
  const previewModel = m.mode === "range" ? withRange(m, correct) : m;
  const valueInput = m.kind === "clock" ? formatTime(m.value) : String(m.value);

  return (
    <div className="grid max-w-full grid-cols-[minmax(260px,340px)_1fr] gap-6 p-4 font-sans text-slate-800">
      <div className="flex flex-col gap-3">
        <label className="flex items-center justify-between gap-2">
          <span className="text-sm text-slate-600">{t.instrument}</span>
          <select className={field} value={m.kind} data-testid="field-instrument" onChange={(e) => chooseKind((e.target as HTMLSelectElement).value as Kind)}>
            {KINDS.map((k) => <option key={k} value={k}>{k === "meter" ? `${t.voltmeter} / ${t.ammeter}` : t.name[k]}</option>)}
          </select>
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-sm text-slate-600">{t.modeLabel}</span>
          <select className={field} value={settings.mode} data-testid="field-mode" onChange={(e) => set("mode", (e.target as HTMLSelectElement).value)}>
            {MODES.map((k) => <option key={k} value={k} disabled={k === "range" && m.kind !== "meter"}>{t.mode[k]}</option>)}
          </select>
        </label>
        <fieldset className="m-0 flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{nameOf(t, m.kind, m.unit)}</legend>
          {m.kind !== "meter" && m.kind !== "clock" && m.kind !== "stopwatch" && text("min", t.min)}
          {m.kind !== "meter" && m.kind !== "clock" && m.kind !== "stopwatch" && text("max", t.max)}
          {m.kind !== "meter" && m.kind !== "clock" && text("major", t.major)}
          {m.kind !== "meter" && m.kind !== "clock" && text("minor", t.minor)}
          {m.kind !== "clock" && (
            <label className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-600">{t.unit}</span>
              <input type="text" className={`${field} w-24`} value={settings.unit} data-testid="field-unit" onChange={(e) => set("unit", (e.target as HTMLInputElement).value)} />
            </label>
          )}
          {m.kind === "meter" && text("ranges", t.ranges, "ranges", "w-28")}
          {m.kind === "meter" && m.mode !== "range" && text("range", t.range)}
          {m.kind === "caliper" && (
            <label className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-600">{t.vernier}</span>
              <select className={field} value={settings.vernier} data-testid="field-vernier"
                onChange={(e) => commit({ ...latest.current, vernier: (e.target as HTMLSelectElement).value, precision: String(1 / Number((e.target as HTMLSelectElement).value)) })}>
                {["10", "20", "50"].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          )}
          {m.mode !== "range" && text("precision", t.precision)}
        </fieldset>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">{valueLabel}</span>
          <input type="text" inputMode="decimal" className={`${field} w-32 text-right`} value={valueInput} data-testid="field-value"
            onChange={(e) => {
              const typedValue = (e.target as HTMLInputElement).value;
              const v = m.kind === "clock" ? parseTime(typedValue) : parseNumber(typedValue);
              if (v !== null) set("value", String(v));
            }} />
          <span className="text-xs text-slate-500">{t.dragHint}</span>
        </label>
        {text("tolerance", t.tolerance)}
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div><span className="text-slate-500">{t.correctResponse}: </span>
            <strong data-testid="correct">{correct === null ? t.none : m.mode === "range" ? `${formatValue(correct, m.language)} ${m.unit}` : withUnit(m, correct)}</strong>
            {correct !== null && <span className="text-slate-500"> ({String(correct)})</span>}
          </div>
        </div>
        {problems.length > 0 && (
          <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="problems">
            <strong>{t.problems}</strong>
            <ul className="m-0 mt-1 pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
        <details>
          <summary className="cursor-pointer text-sm text-slate-600">{t.responseProcessing}</summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100" data-testid="xml">{responseProcessingXml(m.tolerance)}</pre>
        </details>
      </div>
      <div className="flex flex-col items-start gap-2">
        <div className="max-w-full rounded-2xl border border-slate-200 bg-white p-3 shadow-sm focus-within:ring-2 focus-within:ring-sky-600">
          <View m={{ ...previewModel, zoom: false }} value={m.value} editable={true} plugged={m.kind === "meter" ? (m.mode === "range" ? correct : m.range) : null}
            label={figureLabel(previewModel, t)} sliderLabel={valueLabel} valueText={withUnit(m, m.value)} magnifierLabel={t.magnifier}
            onChange={(v) => set("value", String(snap(m, v)))} testid="preview" />
        </div>
      </div>
    </div>
  );
};

export default Authoring;
