// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Broncopci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import { Person, Settings } from "./settings";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";
import { Airway, MUSCLE_OUTER, OUTER, airwayAt, crossSection, foldedCircle, fractionOf } from "./airway";
import { formatNumber, formatPercent } from "./format";

// The candidate's view: the instruction, a cross-section of a bronchiole per person with its air passage and airflow,
// the pollution slider, and the question when there is one.

const COLORS = {
  tissue: "#fdf2f4",
  alveolus: "#fff",
  alveolusEdge: "#f2b8c6",
  outer: "#f6d5c8",
  outerEdge: "#d9a08f",
  muscle: "#b45a46",
  muscleFibre: "#8c3b2c",
  wallCalm: [244, 175, 189],
  wallInflamed: [214, 64, 82],
  mucus: "#dde27f",
  mucusEdge: "#b5bb4a",
  air: "#e8f4fd",
  airEdge: "#7fb3d8",
  particle: "#475569",
};

const mix = (a: number[], b: number[], t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;

/** The level the simulation shows: the candidate's, or the start level. */
export const levelOf = (s: Settings, state: StateModel) =>
  state.level === null ? s.start : Math.min(s.max, Math.max(s.min, state.level));

const Interaction = ({ prompt, settings: s, store, texts, disabled }: {
  prompt: string;
  settings: Settings;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  disabled: boolean;
}) => {
  const state = useStore(store);
  // while the candidate drags: the level, before it goes in the store
  const [live, setLive] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const level = live ?? levelOf(s, state);
  const lang = s.language;
  const pct = (v: number) => formatPercent(v, s.decimals, lang);
  const levelText = (l: number) => texts.level(formatNumber(l, 0, lang), formatNumber(s.max, 0, lang));
  const less = s.labelLess || texts.less;
  const more = s.labelMore || texts.more;

  const summary = (l: number) =>
    s.persons.map((p) => {
      const a = airwayAt(s, p, l);
      return texts.announcePerson(texts.persons[p], s.showArea ? pct(a.area) : null, s.showFlow ? pct(a.flow) : null);
    });

  const commit = (l: number) => {
    const next = Math.min(s.max, Math.max(s.min, Math.round(l)));
    setLive(null);
    store.dispatch({ type: "LEVEL", payload: { level: next, start: s.start } });
    setAnnouncement(texts.announce(levelText(next), summary(next)));
  };

  const read = (e: Event) => Math.round(Number((e.currentTarget as HTMLInputElement).value));
  const percent = ((level - s.min) / (s.max - s.min)) * 100;
  const button =
    "flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white px-2 text-lg leading-none text-slate-700 shadow-sm " +
    "hover:bg-slate-50 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";

  const questionText = s.question === "none" ? "" : s.questionText || (s.question === "threshold"
    ? texts.thresholdQuestion(texts.quantities[s.questionQuantity], texts.whose[s.questionPerson], formatPercent(s.questionPercent, 2, lang).replace(/[.,]?0+(?=\D*%)/, ""))
    : texts.ratioQuestion(formatNumber(s.questionLevel, 0, lang)));

  return (
    <div className="bronchiole flex w-full max-w-[760px] flex-col gap-3 font-sans text-slate-800" lang={lang}>
      {prompt && <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-slate-700">{prompt}</p>}
      <section aria-label={texts.simulation} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className={`grid gap-3 p-3 ${s.persons.length > 1 ? "sm:grid-cols-2" : "mx-auto w-full max-w-[380px]"}`}>
          {s.persons.map((p) => (
            <AirwayCard key={p} person={p} airway={airwayAt(s, p, level)} settings={s} texts={texts} pct={pct} fraction={fractionOf(level, s.min, s.max)} />
          ))}
        </div>

        <div className="flex flex-col gap-1.5 border-t border-slate-100 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <span id="pollution-label" className="text-sm font-semibold text-slate-700">{texts.pollution}</span>
            <span className="text-sm tabular-nums text-slate-600" data-testid="level" aria-hidden="true">{levelText(level)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={button} aria-label={less} data-testid="less" disabled={disabled || level <= s.min}
              onClick={() => commit(level - 1)}>−</button>
            <input type="range" data-testid="pollution" aria-labelledby="pollution-label" aria-valuetext={levelText(level)}
              className="range min-w-0 flex-1" style={{ "--fill": `${percent}%` }} disabled={disabled}
              min={s.min} max={s.max} step={1} value={level}
              onInput={(e) => setLive(read(e))} onChange={(e) => commit(read(e))} />
            <button type="button" className={button} aria-label={more} data-testid="more" disabled={disabled || level >= s.max}
              onClick={() => commit(level + 1)}>+</button>
          </div>
          <div className="flex justify-between gap-4 px-11 text-xs text-slate-500" aria-hidden="true">
            <span>− {less}</span>
            <span className="text-right">+ {more}</span>
          </div>
          <p className="m-0 text-xs text-slate-500">{texts.instruction}</p>
        </div>

        <Legend texts={texts} showFlow={s.showFlow} />
      </section>

      {questionText && (
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4" data-testid="question">
          <label htmlFor="answer" className="text-[15px] leading-relaxed text-slate-800">{questionText}</label>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-amber-900">{texts.answer}</span>
            <input id="answer" type="text" inputMode="decimal" autoComplete="off" data-testid="answer" disabled={disabled}
              aria-describedby="answer-hint"
              className="h-10 w-28 rounded-lg border border-slate-300 bg-white px-3 text-[15px] tabular-nums text-slate-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:bg-slate-100"
              value={state.answer} onInput={(e) => store.dispatch({ type: "ANSWER", payload: { text: (e.currentTarget as HTMLInputElement).value } })} />
          </div>
          <span id="answer-hint" className="text-xs text-amber-900">{texts.answerHint}</span>
        </div>
      )}
      <div role="status" aria-live="polite" className="sr-only" data-testid="live">{announcement}</div>
    </div>
  );
};

const AirwayCard = ({ person, airway, settings: s, texts, pct, fraction }: {
  person: Person;
  fraction: number;
  airway: Airway;
  settings: Settings;
  texts: Texts;
  pct: (v: number) => string;
}) => (
  <figure className="m-0 flex min-w-0 flex-col gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200" data-testid={`airway-${person}`}>
    <figcaption className="text-sm font-semibold text-slate-800">{texts.persons[person]}</figcaption>
    <CrossSection airway={airway} settings={s} fraction={fraction} label={texts.picture(texts.whose[person], pct(airway.area), pct(airway.flow))} />
    {s.showArea && <Bar label={texts.area} value={airway.area} text={pct(airway.area)} suffix={texts.ofNormal} color="#7fb3d8" testid={`area-${person}`} />}
    {s.showFlow && <Bar label={texts.flow} value={airway.flow} text={pct(airway.flow)} suffix={texts.ofNormal} color="#0f766e" testid={`flow-${person}`} />}
  </figure>
);

const Bar = ({ label, value, text, suffix, color, testid }: { label: string; value: number; text: string; suffix: string; color: string; testid: string }) => (
  <div className="flex flex-col gap-0.5">
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="font-medium text-slate-600">{label}</span>
      <span className="tabular-nums text-slate-900" data-testid={testid}><strong className="text-sm">{text}</strong> {suffix}</span>
    </div>
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 10) / 10}
      aria-valuetext={`${text} ${suffix}`} className="h-2.5 overflow-hidden rounded-full bg-slate-200">
      <div className="h-full rounded-full transition-[width] duration-150 motion-reduce:transition-none" style={{ width: `${Math.min(100, value)}%`, background: color }} />
    </div>
  </div>
);

/** Fixed spots for the particles of pollution, inside a unit circle. */
const PARTICLES = Array.from({ length: 16 }, (_, i) => {
  const angle = i * 2.399963; // the golden angle: spread evenly
  const r = Math.sqrt((i + 0.5) / 16) * 0.8;
  return [r * Math.cos(angle), r * Math.sin(angle)];
});

const ALVEOLI = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2 + 0.3;
  const r = i % 2 ? 105 : 109; // inside the picture: at most 120 from the centre
  return { x: r * Math.cos(angle), y: r * Math.sin(angle), r: i % 3 ? 11 : 9 };
});

const CrossSection = ({ airway, settings: s, fraction, label }: { airway: Airway; settings: Settings; fraction: number; label: string }) => {
  const c = crossSection(airway.narrowing, s.mucusShare);
  const folds = 0.03 + 0.09 * c.inflammation;
  const pollution = Math.round(PARTICLES.length * fraction); // particles in the air: more pollution, more particles
  return (
    <svg viewBox="-125 -125 250 250" role="img" aria-label={label} className="mx-auto block aspect-square w-full max-w-[260px]" data-testid="cross-section">
      <rect x="-125" y="-125" width="250" height="250" rx="16" fill={COLORS.tissue} />
      {ALVEOLI.map((a, i) => (
        <circle key={i} cx={a.x} cy={a.y} r={a.r} fill={COLORS.alveolus} stroke={COLORS.alveolusEdge} stroke-width="3" />
      ))}
      <circle r={OUTER} fill={COLORS.outer} stroke={COLORS.outerEdge} stroke-width="1.5" />
      <circle r={MUSCLE_OUTER} fill={COLORS.muscle} />
      <circle r={(MUSCLE_OUTER + c.muscleInner) / 2} fill="none" stroke={COLORS.muscleFibre} stroke-width={(MUSCLE_OUTER - c.muscleInner) * 0.45}
        stroke-dasharray="9 4" stroke-linecap="round" />
      <path d={foldedCircle(c.muscleInner, 14, 0.012)} fill={mix(COLORS.wallCalm, COLORS.wallInflamed, c.inflammation)} data-part="wall" />
      <path d={foldedCircle(c.mucus, 9, folds * 0.8, 0.6)} fill={COLORS.mucus} stroke={COLORS.mucusEdge} stroke-width="1" data-part="mucus" />
      <path d={foldedCircle(c.lumen, 9, folds, 0.6)} fill={COLORS.air} stroke={COLORS.airEdge} stroke-width="1.2" data-part="lumen" data-radius={c.lumen.toFixed(2)} />
      {PARTICLES.slice(0, pollution).map(([x, y], i) => (
        <circle key={i} cx={x * c.lumen} cy={y * c.lumen} r={1.8} fill={COLORS.particle} opacity="0.7" />
      ))}
    </svg>
  );
};

const Legend = ({ texts, showFlow }: { texts: Texts; showFlow: boolean }) => {
  const items: [string, string][] = [
    [texts.parts.air, COLORS.air],
    [texts.parts.mucus, COLORS.mucus],
    [texts.parts.wall, mix(COLORS.wallCalm, COLORS.wallInflamed, 0.4)],
    [texts.parts.muscle, COLORS.muscle],
    [texts.parts.alveoli, COLORS.alveolus],
  ];
  return (
    <div className="flex flex-col gap-2 border-t border-slate-100 px-4 pb-4 pt-3">
      <h3 className="sr-only">{texts.legend}</h3>
      <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0 text-xs text-slate-600" data-testid="legend">
        {items.map(([name, color]) => (
          <li key={name} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full ring-1 ring-slate-400" style={{ background: color }} />
            {name}
          </li>
        ))}
      </ul>
      {showFlow && <p className="m-0 text-xs text-slate-500" data-testid="flow-note">{texts.flowNote}</p>}
    </div>
  );
};

export default Interaction;
