// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/MaraisSalantpci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useEffect, useRef, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import { Container, DEPTH, allDryTime, area, crystalTime, crystalsAt, dryTime, levelAt, rateOf, resultAt, saltMass, volumeAt } from "./model";
import { NumericKey, Range, Settings, decimalsOf, formatNumber, snap } from "./settings";
import { Actions, SPEEDS, StateModel } from "./store";
import { Texts } from "./texts";

// The candidate's view: the instruction and the research question, a clock with start, pause, reset and the speed,
// a card per container (a picture of the tray with its water and salt, and its settings), the results and earlier runs.

/** The clock outside the store: the hours while running, so getState() can save a run halfway. */
export type Clock = { elapsed: number };

export const LETTERS = ["A", "B", "C"];

/** When the run ends: at the duration, or earlier when every container is dry. */
export const endOf = (s: Settings, containers: Container[]) => Math.min(s.duration, allDryTime(containers));

const usePrefersReducedMotion = () => {
  const query = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const [reduced, setReduced] = useState(query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const listener = () => setReduced(query.matches);
    query.addEventListener?.("change", listener);
    return () => query.removeEventListener?.("change", listener);
  }, []);
  return reduced;
};

const Interaction = ({ prompt, settings: s, store, texts, clock, readOnly }: {
  prompt: string;
  settings: Settings;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  clock: Clock;
  readOnly: boolean;
}) => {
  const state = useStore(store);
  const [hours, setHours] = useState(state.elapsed);
  const live = useRef(state.elapsed);
  const [announcement, setAnnouncement] = useState("");
  const reducedMotion = usePrefersReducedMotion();
  const n = (value: number, decimals = 1) => formatNumber(value, decimals, s.language);
  const name = (i: number) => texts.container(LETTERS[i]);
  const end = endOf(s, state.containers);

  const setLive = (t: number) => {
    live.current = t;
    clock.elapsed = t;
    setHours(t);
  };

  // a reset, a restore or a pause puts the store's hours on the clock
  useEffect(() => {
    if (state.phase !== "running") setLive(state.elapsed);
  }, [state.phase, state.elapsed]);

  // the clock runs: duration / runSeconds hours per second at speed ×1
  useEffect(() => {
    if (state.phase !== "running") return;
    const containers = state.containers;
    const stop = endOf(s, containers);
    const perMs = (s.duration / s.runSeconds / 1000) * state.speed;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const from = live.current;
      const to = Math.min(stop, from + (now - last) * perMs);
      last = now;
      const events: string[] = [];
      containers.forEach((c, i) => {
        const crystals = crystalTime(c);
        if (crystals !== null && crystals > from && crystals <= to && crystals < dryTime(c)) events.push(texts.crystalsAppear(name(i), n(crystals)));
        const dry = dryTime(c);
        if (dry > from && dry <= to) events.push(texts.becameDry(name(i), n(dry)));
      });
      setLive(to);
      if (to >= stop) {
        events.push(texts.finished(n(to)));
        store.dispatch({ type: "FINISH", payload: { elapsed: to, results: containers.map((c) => resultAt(c, to)) } });
      } else {
        frame = requestAnimationFrame(tick);
      }
      if (events.length) setAnnouncement(events.join(" "));
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state.phase, state.speed, state.containers]);

  const start = () => {
    store.dispatch({ type: "START", payload: {} });
    setAnnouncement(texts.started);
  };
  const pause = () => {
    store.dispatch({ type: "PAUSE", payload: { elapsed: live.current } });
    setAnnouncement(texts.paused(n(live.current)));
  };
  const resume = () => {
    store.dispatch({ type: "RESUME", payload: {} });
    setAnnouncement(texts.resumed);
  };
  const reset = () => {
    const t = live.current;
    store.dispatch({ type: "RESET", payload: { elapsed: t, results: t > 0 ? state.containers.map((c) => resultAt(c, t)) : null } });
    setLive(0);
    setAnnouncement(texts.wasReset);
  };

  const editable = !readOnly && state.phase === "setup";
  const button =
    "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-[15px] font-semibold shadow-sm focus:outline-none " +
    "focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40";
  const primary = `${button} bg-teal-700 text-white hover:bg-teal-800`;
  const secondary = `${button} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;

  // one scale for every picture: the widest tray fits, and the highest water any setting can give
  const wallCm = Math.max(4, ((s.ranges.volume.max / (s.ranges.width.min * DEPTH)) * 1.15));
  const scale = Math.min(180 / s.ranges.width.max, 92 / wallCm);
  const showSalt = s.canChange.salt || state.containers.some((c) => c.salt > 0);
  const showWind = s.canChange.wind || state.containers.some((c) => c.wind);
  const cols = s.count === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";

  return (
    <div className="evaporation flex w-full max-w-[900px] flex-col gap-3 font-sans text-slate-800">
      {prompt && <p className="m-0 max-w-[75ch] text-[15px] leading-relaxed text-slate-700">{prompt}</p>}
      {s.question && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3" data-testid="question">
          <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-amber-800">{texts.researchQuestion}</h3>
          <p className="m-0 mt-1 text-[15px] font-medium text-slate-900">{s.question}</p>
        </div>
      )}
      <section aria-label={texts.simulation} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
          <ClockFace hours={hours} />
          <div className="flex min-w-[8rem] flex-col">
            <span className="text-xs font-medium text-slate-500">{texts.clock}</span>
            <span className="text-lg font-semibold tabular-nums text-slate-900" data-testid="time">{texts.time(n(hours), n(s.duration, decimalsOf(s.duration)))}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {state.phase === "setup" && (
              <button type="button" className={primary} disabled={readOnly} onClick={start}><span aria-hidden="true">▶</span> {texts.start}</button>
            )}
            {state.phase === "running" && (
              <button type="button" className={primary} disabled={readOnly} onClick={pause}><span aria-hidden="true">❚❚</span> {texts.pause}</button>
            )}
            {state.phase === "paused" && (
              <button type="button" className={primary} disabled={readOnly} onClick={resume}><span aria-hidden="true">▶</span> {texts.resume}</button>
            )}
            {state.phase !== "setup" && (
              <button type="button" className={secondary} disabled={readOnly} onClick={reset}><span aria-hidden="true">↺</span> {texts.reset}</button>
            )}
          </div>
          <fieldset className="m-0 ml-auto flex items-center gap-2 border-0 p-0" disabled={readOnly}>
            <legend className="float-left mr-2 text-sm font-medium text-slate-600">{texts.speed}</legend>
            <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-white">
              {SPEEDS.map((speed) => (
                <label key={speed} className="relative cursor-pointer">
                  <input type="radio" name="speed" value={String(speed)} checked={state.speed === speed} className="peer absolute opacity-0"
                    aria-label={`×${speed}`} onChange={() => store.dispatch({ type: "SPEED", payload: { speed } })} />
                  <span aria-hidden="true" className="block px-3 py-2 text-sm font-semibold tabular-nums text-slate-700 peer-checked:bg-teal-700 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-inset peer-focus-visible:ring-teal-500">
                    ×{speed}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <p className="m-0 px-4 pt-3 text-sm text-slate-500" data-testid="hint">{editable ? texts.setupHint : readOnly ? "" : texts.lockedHint}</p>

        <div className={`grid gap-3 p-4 ${cols}`}>
          {state.containers.map((c, i) => (
            <ContainerCard key={i} index={i} container={c} hours={hours} settings={s} texts={texts} n={n} name={name(i)}
              editable={editable} scale={scale} wallCm={wallCm} reducedMotion={reducedMotion} showSalt={showSalt} showWind={showWind}
              running={state.phase !== "setup"}
              onSet={(key, value) => store.dispatch({ type: "SET", payload: { index: i, key, value } })} />
          ))}
        </div>

        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
          <h3 className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{texts.results}</h3>
          <table className="w-full border-collapse text-sm" data-testid="results">
            <thead>
              <tr className="text-left text-slate-500">
                <th scope="col" className="py-1 pr-3 font-medium"></th>
                <th scope="col" className="py-1 pr-3 font-medium">{texts.dryColumn}</th>
                {showSalt && <th scope="col" className="py-1 pr-3 font-medium">{texts.crystalsColumn}</th>}
                <th scope="col" className="py-1 font-medium">{texts.leftColumn}</th>
              </tr>
            </thead>
            <tbody>
              {state.containers.map((c, i) => {
                const r = resultAt(c, hours);
                const started = state.phase !== "setup";
                return (
                  <tr key={i} className="border-t border-slate-100 tabular-nums">
                    <th scope="row" className="py-1.5 pr-3 text-left font-semibold text-slate-700">{name(i)}</th>
                    <td className="py-1.5 pr-3">{!started ? "–" : r.dryAfter !== null ? `${n(r.dryAfter)} h` : texts.notDry}</td>
                    {showSalt && <td className="py-1.5 pr-3">{!started ? "–" : r.crystalsFrom !== null ? `${n(r.crystalsFrom)} h` : texts.none}</td>}
                    <td className="py-1.5">{`${n(r.volumeLeft)} mL`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {state.runs.length > 0 && (
            <details className="mt-3 text-sm" data-testid="runs">
              <summary className="cursor-pointer font-medium text-slate-600">{texts.runs(state.runs.length)}</summary>
              <ol className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
                {state.runs.map((run, k) => (
                  <li key={k} className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="font-semibold text-slate-700">
                      {texts.run(k + 1)} · {run.completed ? texts.ranTo(n(run.hours)) : texts.stopped(n(run.hours))}
                    </div>
                    <ul className="m-0 list-none p-0 text-slate-600">
                      {run.containers.map((c, i) => {
                        const r = run.results[i];
                        return (
                          <li key={i} className="tabular-nums">
                            {LETTERS[i]}: {summary(c, texts, n, showSalt, showWind)}
                            {r && ` → ${r.dryAfter !== null ? texts.dryAfter(n(r.dryAfter)) : `${n(r.volumeLeft)} mL`}`}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      </section>
      <div role="status" aria-live="polite" className="sr-only" data-testid="live">{announcement}</div>
    </div>
  );
};

const summary = (c: Container, texts: Texts, n: (v: number, d?: number) => string, salt: boolean, wind: boolean) =>
  [
    `${n(c.temperature, decimalsOf(c.temperature))} °C`,
    `${n(c.width, decimalsOf(c.width))} cm`,
    wind ? `${texts.wind.toLowerCase()} ${c.wind ? texts.on : texts.off}` : null,
    salt ? `${n(c.salt, decimalsOf(c.salt))} g/L` : null,
    `${n(c.volume, decimalsOf(c.volume))} mL`,
  ].filter(Boolean).join(" · ");

const ContainerCard = ({ index, container: c, hours, settings: s, texts, n, name, editable, scale, wallCm, reducedMotion, showSalt, showWind, running, onSet }: {
  index: number;
  container: Container;
  hours: number;
  settings: Settings;
  texts: Texts;
  n: (value: number, decimals?: number) => string;
  name: string;
  editable: boolean;
  scale: number;
  wallCm: number;
  reducedMotion: boolean;
  showSalt: boolean;
  showWind: boolean;
  running: boolean;
  onSet: (key: keyof Container, value: number | boolean) => void;
}) => {
  const volume = volumeAt(c, hours);
  const r = resultAt(c, hours);
  const percent = c.volume > 0 ? (volume / c.volume) * 100 : 0;
  const unit: Record<NumericKey, string> = { temperature: "°C", width: "cm", salt: "g/L", volume: "mL" };
  const numeric = (key: NumericKey, label: string, variable: "temperature" | "area" | "salt" | "volume", extra?: string) => {
    const range = s.ranges[key];
    const d = Math.max(decimalsOf(range.step), decimalsOf(range.min));
    const text = (v: number) => `${n(v, d)} ${unit[key]}`;
    return (
      <Field label={label} extra={extra}>
        {s.canChange[variable] ? (
          <Slider testid={`${key}-${index}`} label={`${label}, ${name}`} shortLabel={label} range={range} value={c[key] as number}
            disabled={!editable} texts={texts} display={text} onCommit={(v) => onSet(key, v)} />
        ) : (
          <Fixed text={text(c[key] as number)} texts={texts} testid={`${key}-${index}-fixed`} />
        )}
      </Field>
    );
  };
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-slate-200 p-3" data-testid={`container-${index}`}>
      <h3 className="m-0 text-base font-semibold text-slate-900">{name}</h3>
      <Tray container={c} hours={hours} scale={scale} wallCm={wallCm} reducedMotion={reducedMotion} running={running}
        label={texts.picture(name, n(c.temperature, decimalsOf(c.temperature)), n(c.width, decimalsOf(c.width)), c.wind, n(volume))} />
      <div className="flex min-h-[3.9rem] flex-col gap-0.5 text-sm tabular-nums" data-testid={`status-${index}`}>
        <span className="font-medium text-slate-800">{texts.water(n(volume), n(percent, 0))}</span>
        {r.dryAfter !== null && <span className="font-semibold text-orange-700">{texts.dryAfter(n(r.dryAfter))}</span>}
        {r.crystalsFrom !== null && <span className="text-slate-600">{texts.crystalsFrom(n(r.crystalsFrom))}</span>}
      </div>
      <div className="flex flex-col gap-2 border-t border-slate-100 pt-2">
        {numeric("temperature", texts.temperature, "temperature")}
        {numeric("width", texts.width, "area", texts.surface(n(area(c), 0)))}
        {showWind && (
          <Field label={texts.wind}>
            {s.canChange.wind ? (
              <label className="flex h-9 cursor-pointer items-center gap-2 text-[15px] text-slate-800">
                <input type="checkbox" className="h-5 w-5 accent-teal-700" checked={c.wind} disabled={!editable} data-testid={`wind-${index}`}
                  aria-label={`${texts.windOn}, ${name}`} onChange={(e) => onSet("wind", (e.currentTarget as HTMLInputElement).checked)} />
                <span aria-hidden="true">{texts.windOn}</span>
              </label>
            ) : (
              <Fixed text={c.wind ? texts.on : texts.off} texts={texts} testid={`wind-${index}-fixed`} />
            )}
          </Field>
        )}
        {showSalt && numeric("salt", texts.salt, "salt")}
        {numeric("volume", texts.volume, "volume")}
      </div>
    </div>
  );
};

const Field = ({ label, extra, children }: { label: string; extra?: string; children: any }) => (
  <div className="flex min-w-0 flex-col">
    <div className="flex items-baseline justify-between gap-2 text-sm font-semibold text-slate-700">
      <span>{label}</span>
      {extra && <span className="text-xs font-normal tabular-nums text-slate-500">{extra}</span>}
    </div>
    {children}
  </div>
);

const Fixed = ({ text, texts, testid }: { text: string; texts: Texts; testid: string }) => (
  <div className="flex h-9 items-center gap-2 text-[15px] tabular-nums text-slate-900" data-testid={testid}>
    {text} <span className="text-xs text-slate-500">({texts.fixed})</span>
  </div>
);

/**
 * A native range input: arrow keys move one step, Page Up/Down ten percent, Home/End to the ends; the − and + buttons
 * one step. While dragging only the number follows; letting go (or a key) puts the value in.
 */
const Slider = ({ testid, label, shortLabel, range, value, disabled, texts, display, onCommit }: {
  testid: string;
  label: string;
  shortLabel: string;
  range: Range;
  value: number;
  disabled: boolean;
  texts: Texts;
  display: (v: number) => string;
  onCommit: (v: number) => void;
}) => {
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging ?? value;
  const read = (e: Event) => snap(Number((e.currentTarget as HTMLInputElement).value), range);
  const commit = (v: number) => {
    setDragging(null);
    if (v !== value) onCommit(v);
  };
  const percent = ((shown - range.min) / (range.max - range.min)) * 100;
  const button =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-lg leading-none text-slate-700 shadow-sm " +
    "hover:bg-slate-50 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <button type="button" className={button} aria-label={texts.decrease(label)} data-testid={`${testid}-minus`}
        disabled={disabled || shown <= range.min} onClick={() => commit(snap(shown - range.step, range))}>−</button>
      <input type="range" data-testid={testid} aria-label={label} aria-valuetext={display(shown)} disabled={disabled}
        className="range min-w-0 flex-1" style={{ "--fill": `${percent}%` }}
        min={range.min} max={range.max} step={range.step} value={shown}
        onInput={(e) => setDragging(read(e))} onChange={(e) => commit(read(e))} />
      <button type="button" className={button} aria-label={texts.increase(label)} data-testid={`${testid}-plus`}
        disabled={disabled || shown >= range.max} onClick={() => commit(snap(shown + range.step, range))}>+</button>
      <span aria-hidden="true" className="w-[4.75rem] shrink-0 text-right text-[15px] font-medium tabular-nums text-slate-900" data-testid={`${testid}-value`}
        title={shortLabel}>{display(shown)}</span>
    </div>
  );
};

/** Colour of the plate under the tray: blue when cold, grey at room temperature, red when hot. */
export const plateColor = (t: number) => {
  const mix = (a: number[], b: number[], f: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(",")})`;
  const cold = [96, 165, 250], room = [148, 163, 184], hot = [239, 68, 68];
  if (t <= 20) return mix(cold, room, Math.min(1, Math.max(0, (t - 5) / 15)));
  return mix(room, hot, Math.min(1, (t - 20) / 50));
};

/** The tray in SVG: the plate (its colour the temperature), the water, salt crystals, vapour and a fan for wind. */
const Tray = ({ container: c, hours, scale, wallCm, reducedMotion, running, label }: {
  container: Container;
  hours: number;
  scale: number;
  wallCm: number;
  reducedMotion: boolean;
  running: boolean;
  label: string;
}) => {
  const W = 240, BOTTOM = 124;
  const w = c.width * scale;
  const x0 = (W - w) / 2;
  const wall = wallCm * scale;
  const level = levelAt(c, hours) * scale;
  const startLevel = (c.volume / area(c)) * scale;
  const mass = saltMass(c);
  const crystals = mass > 0 ? Math.round(Math.min(1, crystalsAt(c, hours) / mass) * 28) : 0;
  const volume = volumeAt(c, hours);
  const wisps = running && volume > 0 ? Math.max(1, Math.min(6, Math.round(rateOf(c) / 3))) : 0;
  // the water darkens a little with salt
  const water = `rgba(${Math.round(56 - Math.min(1, c.salt / 300) * 20)}, ${Math.round(189 - Math.min(1, c.salt / 300) * 40)}, 248, 0.75)`;
  const phase = reducedMotion ? 0.4 : (hours * 1.7) % 1;
  return (
    <svg viewBox={`0 16 ${W} 134`} role="img" aria-label={label} className="h-auto w-full rounded-lg bg-gradient-to-b from-sky-50 to-white" data-testid="tray">
      {/* plate */}
      <rect x="14" y={BOTTOM + 2} width={W - 28} height="9" rx="3" fill={plateColor(c.temperature)} />
      <rect x="22" y={BOTTOM + 11} width="8" height="12" fill="#94a3b8" />
      <rect x={W - 30} y={BOTTOM + 11} width="8" height="12" fill="#94a3b8" />
      {/* water and salt */}
      {level > 0 && <rect x={x0 + 1.5} y={BOTTOM - level} width={w - 3} height={level} fill={water} data-testid="water" />}
      {level > 0.6 && <line x1={x0 + 1.5} x2={x0 + w - 1.5} y1={BOTTOM - level} y2={BOTTOM - level} stroke="#0284c7" stroke-width="1.2" />}
      <line x1={x0 - 3} x2={x0 + w + 3} y1={BOTTOM - startLevel} y2={BOTTOM - startLevel} stroke="#64748b" stroke-width="1" stroke-dasharray="3 3" />
      {Array.from({ length: crystals }, (_, k) => {
        const perRow = Math.max(4, Math.floor((w - 8) / 7));
        const row = Math.floor(k / perRow);
        const col = k % perRow;
        const cx = x0 + 6 + ((col + (row % 2) * 0.5) * (w - 12)) / perRow;
        const cy = BOTTOM - 3.5 - row * 4.5;
        return <rect key={k} x={cx - 2.5} y={cy - 2.5} width="5" height="5" fill="#fff" stroke="#64748b" stroke-width="0.8"
          transform={`rotate(${(k * 37) % 90} ${cx} ${cy})`} data-testid="crystal" />;
      })}
      {/* the tray: open at the top */}
      <path d={`M${x0} ${BOTTOM - wall} V${BOTTOM} H${x0 + w} V${BOTTOM - wall}`} fill="none" stroke="#334155" stroke-width="3" stroke-linejoin="round" />
      {/* vapour */}
      {Array.from({ length: wisps }, (_, k) => {
        const x = x0 + ((k + 0.5) / wisps) * w;
        const p = (phase + k * 0.37) % 1;
        const y = BOTTOM - level - 8 - p * 26;
        return <path key={k} d={`M${x} ${y} c-4 -4 4 -6 0 -10 c-4 -4 4 -6 0 -10`} fill="none" stroke="#94a3b8" stroke-width="1.6"
          stroke-linecap="round" opacity={0.85 * (1 - p)} />;
      })}
      {/* fan and wind */}
      {c.wind && (
        <g data-testid="fan">
          <rect x="4" y={BOTTOM - wall - 22} width="4" height={wall + 24} fill="#64748b" />
          <circle cx="6" cy={BOTTOM - wall - 24} r="9" fill="#e2e8f0" stroke="#475569" stroke-width="1.5" />
          <path d={`M6 ${BOTTOM - wall - 24} l6 -3 M6 ${BOTTOM - wall - 24} l-3 6 M6 ${BOTTOM - wall - 24} l-3 -5`} stroke="#475569" stroke-width="2" stroke-linecap="round" />
          {[0, 1, 2].map((k) => {
            const y = BOTTOM - wall - 30 + k * 8;
            const shift = reducedMotion ? 0 : ((hours * 5 + k * 0.3) % 1) * 14;
            return <path key={k} d={`M${20 + shift} ${y} h${44 + k * 14} q8 0 8 6`} fill="none" stroke="#38bdf8" stroke-width="1.6" stroke-linecap="round" opacity="0.8" />;
          })}
        </g>
      )}
    </svg>
  );
};

/** The clock face: the long hand goes round once an hour, the short one once in twelve hours. */
const ClockFace = ({ hours }: { hours: number }) => {
  const hand = (angle: number, length: number) => {
    const a = ((angle - 90) * Math.PI) / 180;
    return { x2: 28 + length * Math.cos(a), y2: 28 + length * Math.sin(a) };
  };
  return (
    <svg viewBox="0 0 56 56" width="52" height="52" aria-hidden="true" className="shrink-0">
      <circle cx="28" cy="28" r="25" fill="#fff" stroke="#334155" stroke-width="3" />
      {Array.from({ length: 12 }, (_, k) => {
        const a = (k * 30 * Math.PI) / 180;
        return <line key={k} x1={28 + 19 * Math.sin(a)} y1={28 - 19 * Math.cos(a)} x2={28 + 22 * Math.sin(a)} y2={28 - 22 * Math.cos(a)} stroke="#64748b" stroke-width={k % 3 === 0 ? 2 : 1} />;
      })}
      <line x1="28" y1="28" {...hand((hours % 12) * 30, 12)} stroke="#0f172a" stroke-width="3" stroke-linecap="round" />
      <line x1="28" y1="28" {...hand((hours % 1) * 360, 18)} stroke="#0f766e" stroke-width="2" stroke-linecap="round" />
      <circle cx="28" cy="28" r="2.5" fill="#0f172a" />
    </svg>
  );
};

export default Interaction;
