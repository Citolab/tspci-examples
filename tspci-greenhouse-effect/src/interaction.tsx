// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/EffetDeSerrepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import { Settings, Prediction } from "./settings";
import { Actions, StateModel } from "./store";
import { FlowKey, Texts } from "./texts";
import { Flows, KELVIN, flows, roundTo, snapLevel } from "./model";
import { formatNumber } from "./format";

// The candidate's view: the instruction, a question (optional), the energy flows of the Earth as arrows whose widths
// follow the flows, a thermometer with the surface temperature, a slider for the amount of greenhouse gas and a table
// of the flows.

/** The level the simulation shows: the candidate's, or the start level. */
export const effectiveLevel = (s: Settings, state: StateModel) => snapLevel(state.level ?? s.startLevel, s.levelStep);

/** Surface temperature in °C, rounded as shown. */
export const shownTemperature = (s: Settings, level: number) => roundTo(flows(s, level / 100).surfaceTemperature - KELVIN, s.decimals);

/** Pixels of arrow width per W/m². */
const SCALE = 0.1;
const W = 720;
const H = 400;
const SPACE = 70; // bottom of space, top of the atmosphere
const AIR = 170; // bottom of the atmosphere
const GROUND = 320; // top of the surface
/** Height over which a flow narrows where part of it is taken out. */
const TAPER = 24;
const COLUMNS = { a: 70, b: 220, c: 390, d: 560 };
const SUN = "#eab308";
const SUN_LIGHT = "#fcd34d";
const INFRARED = "#dc2626";
const BACK = "#ea580c";

/** Thermometer scale, °C. */
const T_MIN = -30;
const T_MAX = 40;

/** Molecules in the atmosphere at fixed, pseudo-random places; the level shows a share of them. */
const MOLECULES = (() => {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  return Array.from({ length: 36 }, () => ({ x: 12 + random() * (W - 24), y: SPACE + 12 + random() * (AIR - SPACE - 24), r: random() * 360 }));
})();

const Interaction = ({ prompt, settings: s, store, texts, readOnly }: {
  prompt: string;
  settings: Settings;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  readOnly: boolean;
}) => {
  const state = useStore(store);
  const committed = effectiveLevel(s, state);
  const [live, setLive] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const level = live ?? committed;
  const f = flows(s, level / 100);
  const celsius = f.surfaceTemperature - KELVIN;

  const n = (value: number, decimals: number) => formatNumber(value, decimals, s.language);
  const percent = (value: number) => `${n(value, 0)}${s.language === "fr" ? " " : ""}%`;
  const temperatureText = (c: number) => {
    const C = `${n(c, s.decimals)} °C`;
    const K = `${n(c + KELVIN, s.decimals)} K`;
    return s.temperatureUnit === "C" ? C : s.temperatureUnit === "K" ? K : `${C} (${K})`;
  };
  const toleranceText = s.temperatureUnit === "K" ? `${n(s.tolerance, s.decimals)} K` : `${n(s.tolerance, s.decimals)} °C`;

  const predicting = s.question === "direction";
  const waitingForPrediction = predicting && s.predictFirst && state.prediction === null;
  const predictionFixed = predicting && s.predictFirst && state.prediction !== null && state.tried.length > 0;
  const sliderDisabled = readOnly || waitingForPrediction;

  const commit = (value: number) => {
    const next = snapLevel(value, s.levelStep);
    setLive(null);
    store.dispatch({ type: "SET_LEVEL", payload: { level: next } });
    setAnnouncement(texts.announce(percent(next), s.showTemperature ? temperatureText(shownTemperature(s, next)) : ""));
  };

  return (
    <div className="greenhouse flex w-full max-w-[880px] flex-col gap-3 font-sans text-slate-800">
      {prompt && <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-slate-700">{prompt}</p>}

      {s.question === "target" && (
        <p className="m-0 rounded-lg bg-amber-50 px-3 py-2 text-[15px] text-amber-900 ring-1 ring-amber-200" data-testid="target">
          {texts.targetTask(temperatureText(s.targetTemperature), toleranceText)}
        </p>
      )}
      {predicting && (
        <fieldset className="m-0 rounded-lg border border-slate-200 bg-white px-3 pb-3 pt-1" disabled={readOnly || predictionFixed}>
          <legend className="px-1 text-[15px] font-medium text-slate-800">{texts.question(s.direction === "more")}</legend>
          <div className="flex flex-wrap gap-2">
            {(["up", "same", "down"] as Prediction[]).map((p) => (
              <label key={p} className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 ring-1 ${state.prediction === p ? "bg-teal-50 ring-teal-600" : "ring-slate-300"}`}>
                <input type="radio" name="prediction" value={p} checked={state.prediction === p} className="h-4 w-4 accent-teal-700"
                  onChange={() => store.dispatch({ type: "PREDICT", payload: { prediction: p } })} />
                <span>{texts.predictions[p]}</span>
              </label>
            ))}
          </div>
          {s.predictFirst && !readOnly && (
            <p className="m-0 mt-2 text-sm text-slate-500" data-testid="predict-hint">{predictionFixed ? texts.predictionFixed : texts.predictFirst}</p>
          )}
        </fieldset>
      )}

      <section aria-label={texts.simulation} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col sm:flex-row">
          <div className="min-w-0 flex-1">
            <Diagram settings={s} flows={f} level={level} texts={texts} percent={percent} n={n} />
          </div>
          <Thermometer settings={s} celsius={celsius} texts={texts} temperatureText={temperatureText} />
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-slate-700" id="gases-label">{texts.gases}</span>
            {s.showLevel && <span className="text-sm text-slate-600" data-testid="absorbed">{texts.absorbed(percent(level))}</span>}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" aria-label={texts.lessButton} disabled={sliderDisabled || committed <= 0}
              className="flex h-10 min-w-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-40"
              onClick={() => commit(committed - s.levelStep)}>
              − <span aria-hidden="true" className="ml-1 hidden sm:inline">{texts.less}</span>
            </button>
            <input type="range" className="range min-w-0 flex-1" aria-labelledby="gases-label" data-testid="slider"
              min={0} max={100} step={s.levelStep} value={level} disabled={sliderDisabled}
              aria-valuetext={s.showTemperature ? `${percent(level)}, ${temperatureText(shownTemperature(s, level))}` : percent(level)}
              style={{ "--fill": `${level}%` }}
              onInput={(e) => setLive(snapLevel(Number((e.currentTarget as HTMLInputElement).value), s.levelStep))}
              onChange={(e) => commit(Number((e.currentTarget as HTMLInputElement).value))} />
            <button type="button" aria-label={texts.moreButton} disabled={sliderDisabled || committed >= 100}
              className="flex h-10 min-w-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-40"
              onClick={() => commit(committed + s.levelStep)}>
              + <span aria-hidden="true" className="ml-1 hidden sm:inline">{texts.more}</span>
            </button>
          </div>
        </div>

        {s.showTable && <FlowTable flows={f} texts={texts} n={n} percent={percent} />}
      </section>
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>
    </div>
  );
};

/** A vertical arrow from y1 to y2 (down when y2 > y1), its shaft w wide. Nothing for a flow of (almost) nothing. */
const Arrow = ({ x, y1, y2, w, color, testid }: { x: number; y1: number; y2: number; w: number; color: string; testid: string }) => {
  if (w < 0.5) return null;
  const dir = Math.sign(y2 - y1);
  const head = Math.min(16, Math.abs(y2 - y1) / 2);
  const half = w / 2;
  const wing = half + Math.max(5, w * 0.25);
  const base = y2 - dir * head;
  const points = [
    [x - half, y1], [x - half, base], [x - wing, base], [x, y2], [x + wing, base], [x + half, base], [x + half, y1],
  ].map((p) => p.join(",")).join(" ");
  return <polygon points={points} fill={color} stroke="white" stroke-width="1.5" stroke-linejoin="round" data-testid={testid} data-width={w.toFixed(1)} />;
};

/**
 * A flow from y1 to y2, w1 wide, that narrows to w2 over the next TAPER pixels: what is left goes on as an Arrow,
 * the rest is taken out there (reflected, absorbed).
 */
const Band = ({ x, y1, y2, w1, w2, color, testid }: { x: number; y1: number; y2: number; w1: number; w2: number; color: string; testid: string }) => {
  if (w1 < 0.5) return null;
  const dir = Math.sign(y2 - y1);
  const end = y2 + dir * TAPER;
  const points = [
    [x - w1 / 2, y1], [x - w1 / 2, y2], [x - w2 / 2, end], [x + w2 / 2, end], [x + w1 / 2, y2], [x + w1 / 2, y1],
  ].map((p) => p.join(",")).join(" ");
  return <polygon points={points} fill={color} stroke="white" stroke-width="1.5" stroke-linejoin="round" data-testid={testid} data-width={w1.toFixed(1)} />;
};

/** Text broken into lines of at most `max` characters, at spaces. */
const wrap = (text: string, max: number) =>
  text.split(" ").reduce((lines, word) => {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + " " + word).length <= max) lines[lines.length - 1] = last + " " + word;
    else lines.push(word);
    return lines;
  }, [] as string[]);

const Label = ({ x, y, name, value, dark, extra, testid }: { x: number; y: number; name: string; value: string; dark?: boolean; extra?: string; testid: string }) => {
  const lines = wrap(name, 20);
  return (
    <text x={x} y={y} font-size="11.5" fill={dark ? "#f8fafc" : "#1e293b"} data-testid={testid}>
      {lines.map((line, i) => <tspan key={i} x={x} dy={i === 0 ? 0 : 13}>{line}</tspan>)}
      {extra && <tspan x={x} dy={13} font-style="italic" font-weight="600" fill={BACK}>{extra}</tspan>}
      {value && <tspan x={x} dy={13} font-weight="700">{value}</tspan>}
    </text>
  );
};

const Diagram = ({ settings: s, flows: f, level, texts, percent, n }: {
  settings: Settings;
  flows: Flows;
  level: number;
  texts: Texts;
  percent: (v: number) => string;
  n: (v: number, d: number) => string;
}) => {
  const width = (flow: number) => Math.min(64, flow * SCALE);
  const value = (flow: number) => {
    const wm2 = `${n(flow, 0)} W/m²`;
    const pct = percent((100 * flow) / f.incoming);
    return s.numbers === "wm2" ? wm2 : s.numbers === "percent" ? pct : s.numbers === "both" ? `${wm2} · ${pct}` : "";
  };
  const labelX = (column: number, ...ws: number[]) => column + Math.max(...ws.map((w) => w / 2 + 6), 6) + 6;
  const label = (key: FlowKey, x: number, y: number, dark = false, extra?: string) => (
    <Label testid={`label-${key}`} x={x} y={y} name={texts.flows[key]} value={value(f[key])} dark={dark} extra={extra} />
  );
  const molecules = Math.round((level / 100) * MOLECULES.length);
  const haze = 0.04 + 0.4 * (level / 100);
  const { a, b, c, d } = COLUMNS;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" data-testid="diagram"
      aria-label={texts.picture(`${n(f.incoming, 0)} W/m²`, `${n(f.surfaceInfrared, 0)} W/m²`, `${n(f.backRadiation, 0)} W/m²`)}>
      <defs>
        <linearGradient id="gh-air" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#bae6fd" />
          <stop offset="1" stop-color="#f0f9ff" />
        </linearGradient>
        <linearGradient id="gh-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#65a30d" />
          <stop offset="0.35" stop-color="#4d7c0f" />
          <stop offset="1" stop-color="#78716c" />
        </linearGradient>
      </defs>
      {/* space, atmosphere, lower air, ground */}
      <rect x="0" y="0" width={W} height={SPACE} fill="#0f172a" />
      {[[40, 12], [300, 40], [470, 18], [655, 50], [160, 55]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.2" fill="#e2e8f0" />)}
      <circle cx="22" cy="22" r="14" fill={SUN_LIGHT} />
      <rect x="0" y={SPACE} width={W} height={GROUND - SPACE} fill="url(#gh-air)" />
      <rect x="0" y={SPACE} width={W} height={AIR - SPACE} fill="#7dd3fc" opacity="0.55" />
      <rect x="0" y={SPACE} width={W} height={AIR - SPACE} fill="#475569" opacity={haze} data-testid="haze" />
      <g data-testid="molecules" data-count={molecules}>
        {MOLECULES.slice(0, molecules).map((m, i) => (
          <g key={i} transform={`translate(${m.x.toFixed(1)} ${m.y.toFixed(1)}) rotate(${m.r.toFixed(0)})`} opacity="0.7">
            <circle cx="-4.5" cy="0" r="2.4" fill="#334155" />
            <circle cx="0" cy="0" r="3" fill="#0f172a" />
            <circle cx="4.5" cy="0" r="2.4" fill="#334155" />
          </g>
        ))}
      </g>
      <rect x="0" y={GROUND} width={W} height={H - GROUND} fill="url(#gh-ground)" />
      <text x={W - 8} y={SPACE - 8} font-size="12" text-anchor="end" fill="#94a3b8" font-weight="600">{texts.space}</text>
      <text x={W - 8} y={AIR - 8} font-size="12" text-anchor="end" fill="#0c4a6e" font-weight="600">{texts.atmosphere}</text>
      <text x={W - 8} y={H - 10} font-size="12" text-anchor="end" fill="#f8fafc" font-weight="600">{texts.surface}</text>

      {/* sunlight: in, reflected, absorbed in the air and at the surface */}
      <Band testid="arrow-incoming" x={a} y1={4} y2={SPACE} w1={width(f.incoming)} w2={width(f.solarSurface)} color={SUN} />
      <Arrow testid="arrow-solarSurface" x={a} y1={SPACE + TAPER} y2={GROUND} w={width(f.solarSurface)} color={SUN} />
      <Arrow testid="arrow-reflected" x={b} y1={SPACE + 50} y2={4} w={width(f.reflected)} color={SUN_LIGHT} />
      {f.solarAtmosphere > 0.5 && <Arrow testid="arrow-solarAtmosphere" x={(a + b) / 2} y1={SPACE} y2={SPACE + 55} w={width(f.solarAtmosphere)} color={SUN} />}
      {/* infrared: from the surface, through the window, from the atmosphere up and back down */}
      <Band testid="arrow-surfaceInfrared" x={c} y1={GROUND} y2={AIR} w1={width(f.surfaceInfrared)} w2={width(f.window)} color={INFRARED} />
      <Arrow testid="arrow-window" x={c} y1={AIR - TAPER} y2={4} w={width(f.window)} color={INFRARED} />
      <Arrow testid="arrow-atmosphereUp" x={d} y1={SPACE + 20} y2={4} w={width(f.atmosphereUp)} color={BACK} />
      <Arrow testid="arrow-backRadiation" x={d} y1={AIR - 20} y2={GROUND} w={width(f.backRadiation)} color={BACK} />

      {label("incoming", labelX(a, width(f.incoming)), 18, true)}
      {label("reflected", labelX(b, width(f.reflected)), 18, true)}
      {label("window", labelX(c, width(f.window)), 18, true)}
      {label("atmosphereUp", labelX(d, width(f.atmosphereUp)), 18, true)}
      {label("solarSurface", labelX(a, width(f.solarSurface)), AIR + 22)}
      {f.solarAtmosphere > 0.5 && label("solarAtmosphere", labelX((a + b) / 2, width(f.solarAtmosphere)), SPACE + 18)}
      {label("surfaceInfrared", labelX(c, width(f.surfaceInfrared)), GROUND - 50)}
      {label("backRadiation", labelX(d, width(f.backRadiation)), AIR + 22, false, texts.greenhouseEffect)}
    </svg>
  );
};

const Thermometer = ({ settings: s, celsius, texts, temperatureText }: {
  settings: Settings;
  celsius: number;
  texts: Texts;
  temperatureText: (c: number) => string;
}) => {
  const top = 20;
  const bottom = 300;
  const y = (c: number) => bottom - ((Math.min(T_MAX, Math.max(T_MIN, c)) - T_MIN) / (T_MAX - T_MIN)) * (bottom - top);
  const ticks = [];
  for (let t = T_MIN; t <= T_MAX; t += 10) ticks.push(t);
  const tick = (t: number) => (s.temperatureUnit === "K" ? String(Math.round(t + KELVIN)) : formatNumber(t, 0, s.language));
  const shown = roundTo(celsius, s.decimals);
  return (
    <div className="flex flex-row items-center justify-center gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2 sm:w-[136px] sm:flex-col sm:border-l sm:border-t-0">
      <div className="text-center text-xs font-medium text-slate-500">{texts.thermometer}</div>
      <svg viewBox="0 0 90 350" className="h-[220px] w-auto sm:h-[300px]" role="img" data-testid="thermometer"
        aria-label={s.showTemperature ? texts.thermometerLabel(temperatureText(shown)) : texts.thermometer}>
        <rect x="36" y={top - 10} width="18" height={bottom - top + 30} rx="9" fill="white" stroke="#94a3b8" stroke-width="2" />
        <circle cx="45" cy="322" r="18" fill="#dc2626" stroke="#94a3b8" stroke-width="2" />
        <rect x="40" y={y(celsius)} width="10" height={322 - y(celsius)} fill="#dc2626" data-testid="mercury" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1="54" x2="62" y1={y(t)} y2={y(t)} stroke="#475569" stroke-width="1.5" />
            <text x="65" y={y(t) + 4} font-size="11" fill="#334155">{tick(t)}</text>
          </g>
        ))}
        <text x="65" y={top - 6} font-size="10" fill="#64748b">{s.temperatureUnit === "K" ? "K" : "°C"}</text>
        {s.question === "target" && (
          <g data-testid="target-mark">
            <line x1="26" x2="54" y1={y(s.targetTemperature)} y2={y(s.targetTemperature)} stroke="#d97706" stroke-width="2.5" />
            <polygon points={`18,${y(s.targetTemperature) - 6} 28,${y(s.targetTemperature)} 18,${y(s.targetTemperature) + 6}`} fill="#d97706" />
          </g>
        )}
      </svg>
      {s.showTemperature ? (
        <div className="text-center text-xl font-semibold tabular-nums text-slate-900" data-testid="temperature">{temperatureText(shown)}</div>
      ) : (
        <div className="sr-only">{texts.temperatureHidden}</div>
      )}
    </div>
  );
};

const FlowTable = ({ flows: f, texts, n, percent }: {
  flows: Flows;
  texts: Texts;
  n: (v: number, d: number) => string;
  percent: (v: number) => string;
}) => {
  const keys: FlowKey[] = ["incoming", "reflected", "solarAtmosphere", "solarSurface", "surfaceInfrared", "window", "atmosphereUp", "backRadiation"];
  return (
    <div className="overflow-x-auto border-t border-slate-100 px-4 pb-4 pt-3">
      <table className="w-full border-collapse text-sm" data-testid="table">
        <caption className="pb-1 text-left text-sm font-semibold text-slate-700">{texts.table}</caption>
        <thead>
          <tr className="text-left text-slate-500">
            <th scope="col" className="py-1 pr-2 font-medium">{texts.flow}</th>
            <th scope="col" className="py-1 pr-2 text-right font-medium">W/m²</th>
            <th scope="col" className="py-1 text-right font-medium">{texts.share}</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k} className={`border-t border-slate-100 ${k === "backRadiation" ? "font-semibold text-orange-800" : ""}`}>
              <th scope="row" className="py-1 pr-2 text-left font-normal">{texts.flowNames[k]}</th>
              <td className="py-1 pr-2 text-right tabular-nums">{n(f[k], 0)}</td>
              <td className="py-1 text-right tabular-nums">{percent((100 * f[k]) / f.incoming)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Interaction;
