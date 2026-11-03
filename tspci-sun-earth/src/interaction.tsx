import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { IStore, useStore } from "@citolab/preact-store";
import { Setting, Setup, controlled, placeById } from "./setup";
import { DAYS, MINUTES, clock, dateOfDay, duration, localTime, utcOfLocal, wrap } from "./solar";
import { sunAt } from "./model";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";
import { formatNumber } from "./format";
import { DayLine, EarthDiagram, SkyDiagram } from "./diagrams";
import { Focus, SunEarthScene } from "./scene3d";

// The candidate's view: the instruction, the 3D Sun and Earth (or the Earth from the side), the sky of the chosen
// place, and the controls: the place, the date and the time. Everything the mouse can drag, the controls do with the
// keyboard.

export type Options = {
  mode: "answer" | "tool";
  view: "both" | "2d";
  timeBase: "utc" | "local";
  showInfo: boolean;
  language: "en" | "nl";
  readOnly: boolean;
  solution: boolean;
};

const Interaction = ({ prompt, setup, store, texts: t, options }: {
  prompt: string;
  setup: Setup;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  options: Options;
}) => {
  const state = useStore(store);
  // while the candidate drags or slides: the setting before it goes in the store
  const [live, setLive] = useState<Setting | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [webgl, setWebgl] = useState(true);
  const [focus, setFocus] = useState<Focus>("orbit");
  const setting = controlled(setup, live ?? state.setting);
  const place = placeById(setup, setting.place);
  const lang = options.language;
  const sun = useMemo(() => (place ? sunAt(setting, place.lat, place.lon) : null), [setting.day, setting.minutes, place?.id, place?.lat, place?.lon]);
  const deg = (v: number) => `${formatNumber(v, 1, lang)}°`;
  const span = (minutes: number) => duration(minutes).replace(" h ", lang === "nl" ? " u " : " h ");
  const lon = place?.lon ?? 0;
  const base = options.timeBase;
  /** UTC minutes → what the time slider shows (UTC or local by longitude). */
  const toShown = (utc: number) => (base === "utc" ? utc : localTime(utc, lon));
  const timeText = (utc: number) => `${clock(toShown(utc))} ${base === "utc" ? t.utc : t.local}`;
  const dateText = (day: number) => {
    const { month, date } = dateOfDay(day);
    return t.date(date, t.months[month]);
  };
  const placeName = (id: string) => placeById(setup, id)?.name[lang] ?? id;
  const canDay = setup.controls.day && !options.readOnly;
  const canTime = setup.controls.time && !options.readOnly;
  const canPlace = setup.controls.place && !options.readOnly && setup.places.length > 1;

  const liveRef = useRef<Setting | null>(null);
  liveRef.current = live;
  const current = () => liveRef.current ?? store.getState().setting;

  const commit = (next: Setting, what: string, value: string) => {
    liveRef.current = null;
    setLive(null);
    store.dispatch({ type: "SET", payload: { setting: next } });
    const s = controlled(setup, next);
    const p = placeById(setup, s.place);
    if (p) {
      const day = sunAt(s, p.lat, p.lon).day;
      setAnnouncement(t.announce(what, value, span(day.length), deg(day.noonElevation)));
    }
  };
  const preview = (next: Setting) => {
    liveRef.current = next;
    setLive(next);
  };

  const setDay = (day: number, done: boolean) => {
    const next = { ...current(), day: Math.max(1, Math.min(DAYS, Math.round(day))) };
    done ? commit(next, t.dateLabel, dateText(next.day)) : preview(next);
  };
  /** A time as the slider shows it → UTC minutes, on the step. */
  const setShownTime = (shown: number, done: boolean) => {
    const step = setup.timeStep;
    const v = Math.max(0, Math.min(MINUTES - step, Math.round(shown / step) * step));
    const utc = base === "utc" ? v : utcOfLocal(v, lon);
    const next = { ...current(), minutes: utc };
    done ? commit(next, t.timeLabel(base), timeText(utc)) : preview(next);
  };
  const setPlace = (id: string) => {
    const next = { ...current(), place: id };
    commit(next, t.place, placeName(id));
  };

  // the 3D view: made once, fed with every change, freed when the interaction goes
  const host = useRef<HTMLDivElement>(null);
  const three = useRef<SunEarthScene | null>(null);
  const handlers = useRef({ setDay, setPlace });
  handlers.current = { setDay, setPlace };
  const show3d = options.view !== "2d" && webgl;
  useEffect(() => {
    if (!show3d || !host.current) return;
    try {
      three.current = new SunEarthScene(host.current, {
        onDay: (day, done) => handlers.current.setDay(day, done),
        onPlace: (id) => handlers.current.setPlace(id),
      });
    } catch {
      setWebgl(false);
      return;
    }
    (host.current as any).__sunEarth = three.current; // for tests
    return () => {
      three.current?.dispose();
      three.current = null;
    };
  }, [show3d]);
  useEffect(() => {
    if (three.current && place) {
      three.current.update({
        places: setup.places, setting: { ...setting, place: place.id }, marks: t.marks(t.monthsShort), placeLabel: place.name[lang],
        canDrag: canDay, canPick: canPlace,
      });
    }
  });
  const changeFocus = (f: Focus) => {
    setFocus(f);
    three.current?.setFocus(f);
  };

  const onKey3d = (e: KeyboardEvent) => {
    const s = three.current;
    if (!s) return;
    const step = e.shiftKey ? 0.3 : 0.1;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => s.turn(step, 0), ArrowRight: () => s.turn(-step, 0), ArrowUp: () => s.turn(0, -step), ArrowDown: () => s.turn(0, step),
      "+": () => s.turn(0, 0, 0.88), "=": () => s.turn(0, 0, 0.88), "-": () => s.turn(0, 0, 1 / 0.88), "0": () => s.resetView(),
    };
    if (keys[e.key]) {
      keys[e.key]();
      e.preventDefault();
    }
  };

  // the place: a radio group, arrow keys move the choice (roving tab stop)
  const placeButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const onPlaceKey = (e: KeyboardEvent, i: number) => {
    const n = setup.places.length;
    const moves: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let k = -1;
    if (e.key in moves) k = wrap(i + moves[e.key], n);
    else if (e.key === "Home") k = 0;
    else if (e.key === "End") k = n - 1;
    if (k < 0) return;
    e.preventDefault();
    setPlace(setup.places[k].id);
    placeButtons.current[k]?.focus();
  };

  if (!place || !sun) return <p className="m-0 text-sm text-rose-700">{t.problem({ code: "noPlaces" })}</p>;

  const today = sun.day;
  const overhead = t.latLon(sun.declination, sun.subsolarLongitude, lang);
  const lit = sun.position.elevation >= -0.833;
  const skyLabel = t.skyLabel(place.name[lang], dateText(setting.day), deg(today.noonElevation),
    today.polar === "day" ? t.midnightSun : today.polar === "night" ? t.polarNight : `${t.sunrise} ${timeText(today.sunrise!)}.`,
    today.polar ? "" : `${t.sunset} ${timeText(today.sunset!)}.`);
  const diagramLabel = t.diagramLabel(dateText(setting.day), overhead, place.name[lang], lit ? t.daySide : t.nightSide);

  const rows: [string, string, string][] = [
    ["overhead", t.overhead, overhead],
    ["now", t.sunNow, sun.position.elevation >= 0
      ? t.sunNowValue(deg(sun.position.elevation), deg(sun.position.azimuth), t.directions[Math.round(sun.position.azimuth / 45) % 8])
      : t.sunDown(deg(sun.position.elevation))],
    ["noon", t.noon, t.noonValue(deg(today.noonElevation), timeText(today.noon))],
    ["sunrise", t.sunrise, today.sunrise === null ? t.none : timeText(today.sunrise)],
    ["sunset", t.sunset, today.sunset === null ? t.none : timeText(today.sunset)],
    ["length", t.dayLength, span(today.length)],
  ];

  const shownTime = toShown(setting.minutes);
  const legend3d: [string, JSX.Element][] = [
    [t.legendEquator, <line x1="0" y1="5" x2="22" y2="5" stroke="#334155" stroke-width="2" />],
    [t.legendTropics, <line x1="0" y1="5" x2="22" y2="5" stroke="#b45309" stroke-width="2" stroke-dasharray="5 3" />],
    [t.legendPolar, <line x1="0" y1="5" x2="22" y2="5" stroke="#0369a1" stroke-width="2.2" stroke-dasharray="1.5 3" />],
    [t.legendTerminator, <line x1="0" y1="5" x2="22" y2="5" stroke="#ea580c" stroke-width="3.5" />],
    [t.legendSubsolar, <circle cx="11" cy="5" r="4" fill="#fde047" stroke="#a16207" />],
    [t.legendPlace, <g><circle cx="11" cy="5" r="4.5" fill="none" stroke="#0f172a" stroke-width="1.5" /><circle cx="11" cy="5" r="2" fill="#be123c" /></g>],
  ];
  return (
    <div className="sun-earth flex w-full max-w-[980px] flex-col gap-3 font-sans text-slate-800">
      {prompt && <p className="m-0 max-w-[72ch] text-[15px] leading-relaxed text-slate-700" data-testid="prompt">{prompt}</p>}
      {options.solution && (
        <p className="m-0 inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200" data-testid="solution">
          <span aria-hidden="true">✓</span>{t.solution}
        </p>
      )}
      <section aria-label={t.simulation} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="border-b border-slate-100 md:border-b-0 md:border-r">
            {show3d ? (
              <div className="relative h-full min-h-[300px] bg-[radial-gradient(ellipse_at_center,#1e293b_0%,#0b1120_75%)]">
                <div ref={host} tabIndex={0} role="application" aria-label={t.view3d} aria-describedby="se-help" onKeyDown={onKey3d as any}
                  data-testid="view3d" className="se-view3d absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400" />
                <p className="pointer-events-none absolute left-3 top-2 m-0 max-w-[16rem] text-[11px] leading-tight text-slate-300" data-testid="not-to-scale">{t.notToScale}</p>
                <div role="radiogroup" aria-label={t.focus} className="absolute right-2 top-2 inline-flex rounded-lg bg-slate-900/70 p-0.5 text-xs">
                  {(["orbit", "earth"] as Focus[]).map((f) => (
                    <button key={f} type="button" role="radio" aria-checked={focus === f} onClick={() => changeFocus(f)} data-testid={`focus-${f}`}
                      className={`rounded-md px-2.5 py-1 font-medium focus-visible:outline-2 focus-visible:outline-sky-400 ${focus === f ? "bg-white text-slate-900" : "text-slate-200"}`}>
                      {f === "orbit" ? t.focusOrbit : t.focusEarth}
                    </button>
                  ))}
                </div>
                <p id="se-help" className="pointer-events-none absolute bottom-2 left-3 right-[11.5rem] m-0 text-[11px] leading-tight text-slate-300">{t.view3dHelp}</p>
                <div className="absolute bottom-2 right-2 flex gap-1">
                  {[["⟲", t.turnLeft, () => three.current?.turn(0.25, 0)], ["⟳", t.turnRight, () => three.current?.turn(-0.25, 0)], ["+", t.zoomIn, () => three.current?.turn(0, 0, 0.8)], ["−", t.zoomOut, () => three.current?.turn(0, 0, 1.25)], ["⌂", t.resetView, () => three.current?.resetView()]].map(([label, name, run]) => (
                    <button key={label as string} type="button" aria-label={name as string} onClick={run as () => void}
                      className="grid size-7 place-items-center rounded-md bg-white/90 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-white focus-visible:outline-2 focus-visible:outline-sky-400">{label}</button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1 p-3">
                {options.view !== "2d" && <p className="m-0 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900" role="note" data-testid="no-webgl">{t.noWebgl}</p>}
                <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.diagram}</h3>
                <EarthDiagram declination={sun.declination} hourAngle={sun.position.hourAngle} place={place} t={t} label={diagramLabel} />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 p-3">
            <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500" data-testid="sky-title">{t.sky(place.name[lang])}</h3>
            <SkyDiagram day={setting.day} minutes={setting.minutes} place={place} declination={sun.declination} sun={sun.position} today={today} t={t}
              label={skyLabel} timeText={timeText} onTime={canTime ? (m, done) => setShownTime(toShown(m), done) : undefined} />
            <DayLine today={today} minutes={setting.minutes} toShown={toShown} />
            {today.polar && <p className="m-0 text-sm font-medium text-slate-700" data-testid="polar">{today.polar === "day" ? t.midnightSun : t.polarNight}</p>}
            {options.showInfo && (
              <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm" data-testid="info">
                {rows.map(([key, label, value]) => (
                  <div key={key} className="contents" data-testid={`info-${key}`}>
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="m-0 font-medium tabular-nums text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 p-4">
          <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.controls}</h3>
          <div className="flex flex-col gap-1.5">
            <span id="se-place-label" className="text-sm font-medium text-slate-700">{t.place}</span>
            {canPlace ? (
              <div role="radiogroup" aria-labelledby="se-place-label" className="flex flex-wrap gap-1.5" data-testid="places">
                {setup.places.map((p, i) => {
                  const on = p.id === place.id;
                  return (
                    <button key={p.id} ref={(el) => { placeButtons.current[i] = el; }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
                      onClick={() => setPlace(p.id)} onKeyDown={(e) => onPlaceKey(e as unknown as KeyboardEvent, i)} data-testid={`place-${p.id}`}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-sky-600 ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
                      <span aria-hidden="true" className={`inline-block size-2.5 rounded-full ${on ? "bg-white" : "ring-1 ring-slate-400"}`} />
                      {p.name[lang]}
                      <span className={`text-xs ${on ? "text-slate-300" : "text-slate-500"}`}>{t.lat(p.lat, lang)}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="m-0 text-sm text-slate-900" data-testid="place-fixed">{place.name[lang]} <span className="text-slate-500">({t.latLon(place.lat, place.lon, lang)})</span></p>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Slider label={t.dateLabel} min={1} max={DAYS} step={1} big={7} value={setting.day} disabled={!canDay} testid="date" t={t}
              display={(d) => `${dateText(d)} (${t.dayOfYear(d)})`} onLive={(v) => setDay(v, false)} onCommit={(v) => setDay(v, true)} />
            <Slider label={t.timeLabel(base)} min={0} max={MINUTES - setup.timeStep} step={setup.timeStep} big={60} value={shownTime} disabled={!canTime} testid="time" t={t}
              display={(m) => `${clock(m)} ${base === "utc" ? t.utc : t.local}`} onLive={(v) => setShownTime(v, false)} onCommit={(v) => setShownTime(v, true)} />
          </div>
          <p className="m-0 text-xs text-slate-500" data-testid="times">
            {t.utcTime} {clock(setting.minutes)} · {t.localTimeOf} {clock(localTime(setting.minutes, place.lon))} · {t.latLon(place.lat, place.lon, lang)}
          </p>
          {options.readOnly && <p className="m-0 text-xs text-slate-500">{t.readOnly}</p>}
        </div>
        {show3d && (
          <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-600" aria-hidden="true" data-testid="legend">
            {legend3d.map(([label, mark]) => (
              <li key={label} className="inline-flex items-center gap-1.5"><svg width="22" height="10" viewBox="0 0 22 10">{mark}</svg>{label}</li>
            ))}
          </ul>
        )}
      </section>
      <div role="status" aria-live="polite" className="sr-only" data-testid="live">{announcement}</div>
    </div>
  );
};

/** A range input with − and + buttons; the value goes in the store when the candidate lets go (change). */
const Slider = ({ label, min, max, step, big, value, disabled, testid, t, display, onLive, onCommit }: {
  label: string; min: number; max: number; step: number; big: number; value: number; disabled: boolean; testid: string; t: Texts;
  display: (v: number) => string; onLive: (v: number) => void; onCommit: (v: number) => void;
}) => {
  const button = "grid size-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-lg leading-none text-slate-700 hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-sky-600";
  const shown = display(value);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <label htmlFor={`se-${testid}`} className="font-medium text-slate-700">{label}</label>
        <output htmlFor={`se-${testid}`} className="tabular-nums font-semibold text-slate-900" data-testid={`${testid}-value`}>{shown}</output>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className={button} aria-label={t.less(label)} disabled={disabled || value <= min + 1e-9} onClick={() => onCommit(value - step)}>−</button>
        <input id={`se-${testid}`} type="range" min={min} max={max} step="any" value={value} disabled={disabled} data-testid={testid}
          aria-valuetext={shown} className="h-2 w-full cursor-pointer accent-sky-700"
          onInput={(e) => onLive(Number((e.currentTarget as HTMLInputElement).value))}
          onChange={(e) => onCommit(Number((e.currentTarget as HTMLInputElement).value))}
          onKeyDown={(e) => {
            // the arrow keys move by the step (a native range with step="any" would move in tiny steps)
            const keys: Record<string, number> = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -big, PageUp: big };
            if (e.key in keys) {
              e.preventDefault();
              onCommit(Math.max(min, Math.min(max, value + keys[e.key])));
            } else if (e.key === "Home" || e.key === "End") {
              e.preventDefault();
              onCommit(e.key === "Home" ? min : max);
            }
          }} />
        <button type="button" className={button} aria-label={t.more(label)} disabled={disabled || value >= max - 1e-9} onClick={() => onCommit(value + step)}>+</button>
      </div>
    </div>
  );
};

export default Interaction;
