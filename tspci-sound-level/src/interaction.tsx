import { useEffect, useRef, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import { Settings, Range } from "./settings";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";
import { decimalsOf, levelOf, nearestDistance, nearestPower, visibility } from "./physics";
import { formatNumber } from "./format";
import { LEVEL_BANDS, METER_MAX, METER_MIN, levelColor } from "./colors";
import { LISTENER_SVG, SOURCE_SVG, svgDataUrl } from "./sources";
import { SoundScene } from "./scene3d";

// The candidate's view: the instruction, a picture of the source and the listener with the sound waves, the sound
// level at the listener, the controls for power and distance, a meter and levels for comparison.

/** The power and distance the candidate set, as the simulation uses them (a setting they cannot change stays fixed). */
export const effective = (s: Settings, state: StateModel) => ({
  power: nearestPower(s, s.canChangePower && state.power !== null ? state.power : s.power),
  distance: nearestDistance(s, s.canChangeDistance && state.distance !== null ? state.distance : s.distance),
});

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

const Interaction = ({ prompt, settings: s, store, texts }: {
  prompt: string;
  settings: Settings;
  store: IStore<StateModel, Actions>;
  texts: Texts;
}) => {
  const state = useStore(store);
  const committed = effective(s, state);
  // while the candidate drags a slider: its value, before it goes in the store
  const [live, setLive] = useState<{ power?: number; distance?: number }>({});
  const [announcement, setAnnouncement] = useState("");
  const reducedMotion = usePrefersReducedMotion();
  const power = live.power ?? committed.power;
  const distance = live.distance ?? committed.distance;
  const level = levelOf(s, power, distance);

  const n = (value: number, decimals: number) => formatNumber(value, decimals, s.language);
  const powerDecimals = s.powerInput === "select" ? Math.max(0, ...s.powers.map(decimalsOf)) : Math.max(decimalsOf(s.powerRange.step), decimalsOf(s.powerRange.min));
  const distanceDecimals = Math.max(decimalsOf(s.distanceRange.step), decimalsOf(s.distanceRange.min));
  const powerText = (p: number) => `${n(p, powerDecimals)} ${s.powerUnit}`;
  const distanceText = (d: number) => `${n(d, distanceDecimals)} ${s.distanceUnit}`;
  const levelText = (l: number) => `${n(l, s.decimals)} dB`;
  const sourceName = s.sourceName || texts.sources[s.source] || texts.sources.speaker;

  const commit = (change: { power?: number; distance?: number }) => {
    const next = { ...committed, ...change };
    setLive({});
    store.dispatch({ type: "TRY", payload: { ...change, tried: next } });
    setAnnouncement(texts.announce(levelText(levelOf(s, next.power, next.distance)), powerText(next.power), distanceText(next.distance)));
  };

  const references = s.showReferences ? s.references ?? parseStandard(texts.standardReferences) : [];
  const below = [...references].reverse().find((r) => r.level <= level);
  const comparison = !references.length ? "" : below ? texts.louderThan(below.label) : texts.softerThanAll(references[0].label);
  const answerMode = s.mode === "answer";

  return (
    <div className="sound-level flex w-full max-w-[680px] flex-col gap-3 font-sans text-slate-800">
      {prompt && <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-slate-700">{prompt}</p>}
      <section aria-label={texts.simulation} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="relative bg-gradient-to-b from-sky-50 to-white">
          <Picture settings={s} fraction={distance / s.distanceRange.max} reducedMotion={reducedMotion}
            levelAt={(fraction) => levelOf(s, power, fraction * s.distanceRange.max)}
            label={texts.picture(sourceName, distanceText(distance))} />
          <div className="pointer-events-none absolute left-3 top-3 rounded-xl bg-white/90 px-3 py-2 shadow-sm ring-1 ring-slate-200 backdrop-blur">
            <div className="text-xs font-medium text-slate-500">{texts.soundLevelAt(distanceText(distance))}</div>
            <div className="flex items-baseline gap-1.5" data-testid="readout">
              <span className="text-3xl font-semibold tabular-nums text-slate-900">{n(level, s.decimals)}</span>
              <span className="text-base font-medium text-slate-500">dB</span>
              <span aria-hidden="true" className="ml-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: levelColor(level) }} />
            </div>
            {comparison && <div className="text-xs text-slate-500" data-testid="comparison">{comparison}</div>}
          </div>
          <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
            {sourceName} · {powerText(power)}
          </div>
        </div>

        <div className={`grid gap-4 border-t border-slate-100 p-4 ${s.canChangePower && s.powerInput === "slider" ? "" : "sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]"}`}>
          <Control label={texts.power} answer={answerMode && s.answer === "power"} texts={texts}>
            {!s.canChangePower ? (
              <Fixed text={powerText(power)} texts={texts} testid="power-fixed" />
            ) : s.powerInput === "select" ? (
              <select data-testid="power" aria-label={texts.power}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-[15px] text-slate-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                value={String(power)} onChange={(e) => commit({ power: Number((e.currentTarget as HTMLSelectElement).value) })}>
                {s.powers.map((p) => <option key={p} value={String(p)}>{powerText(p)}</option>)}
              </select>
            ) : (
              <Slider testid="power" label={texts.power} range={s.powerRange} value={power} texts={texts}
                valueText={(p) => `${powerText(p)}, ${levelText(levelOf(s, p, distance))}`} display={powerText}
                snap={(p) => nearestPower(s, p)} onLive={(p) => setLive({ power: p })} onCommit={(p) => commit({ power: p })} />
            )}
          </Control>
          <Control label={texts.distance} answer={answerMode && s.answer === "distance"} texts={texts}>
            {!s.canChangeDistance ? (
              <Fixed text={distanceText(distance)} texts={texts} testid="distance-fixed" />
            ) : (
              <Slider testid="distance" label={texts.distance} range={s.distanceRange} value={distance} texts={texts}
                valueText={(d) => `${distanceText(d)}, ${levelText(levelOf(s, power, d))}`} display={distanceText}
                snap={(d) => nearestDistance(s, d)} onLive={(d) => setLive({ distance: d })} onCommit={(d) => commit({ distance: d })} />
            )}
          </Control>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 pb-4 pt-3">
          <Meter level={level} target={s.targetLevel} references={references} texts={texts} levelText={levelText} />
          {references.length > 0 && (
            <div>
              <h3 className="m-0 mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{texts.references}</h3>
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" data-testid="references">
                {references.map((r, i) => (
                  <li key={i}
                    className={`rounded-full px-2.5 py-1 text-xs ring-1 ${r === below ? "bg-slate-900 text-white ring-slate-900" : "bg-slate-50 text-slate-700 ring-slate-200"}`}>
                    {r.label} <span className="tabular-nums opacity-80">{n(r.level, decimalsOf(r.level))} dB</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
      <div role="status" aria-live="polite" className="sr-only" data-testid="live">{announcement}</div>
    </div>
  );
};

const parseStandard = (text: string) =>
  text.split(";").map((part) => {
    const [label, level] = part.split("=");
    return { label: label.trim(), level: Number(level) };
  });

const Control = ({ label, answer, texts, children }: { label: string; answer: boolean; texts: Texts; children: any }) => (
  <div className={`flex min-w-0 flex-col gap-1.5 ${answer ? "rounded-xl bg-amber-50 p-2.5 ring-1 ring-amber-300" : ""}`}>
    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
      {label}
      {answer && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">{texts.yourAnswer}</span>}
    </div>
    {children}
    {answer && <div className="text-xs text-amber-900">{texts.answerHint(label)}</div>}
  </div>
);

const Fixed = ({ text, texts, testid }: { text: string; texts: Texts; testid: string }) => (
  <div className="flex h-10 items-center gap-2 text-[15px] tabular-nums text-slate-900" data-testid={testid}>
    {text} <span className="text-xs text-slate-500">({texts.fixed})</span>
  </div>
);

/**
 * A native range input: arrow keys move one step, Page Up/Down ten percent, Home/End to the ends; the − and + buttons
 * one step. While dragging only the picture follows (onLive); letting go or a key puts the value in (onCommit).
 */
const Slider = ({ testid, label, range, value, texts, valueText, display, snap, onLive, onCommit }: {
  testid: string;
  label: string;
  range: Range;
  value: number;
  texts: Texts;
  valueText: (v: number) => string;
  display: (v: number) => string;
  snap: (v: number) => number;
  onLive: (v: number) => void;
  onCommit: (v: number) => void;
}) => {
  const read = (e: Event) => snap(Number((e.currentTarget as HTMLInputElement).value));
  const percent = ((value - range.min) / (range.max - range.min)) * 100;
  const button =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-lg leading-none text-slate-700 shadow-sm " +
    "hover:bg-slate-50 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-2">
        <button type="button" className={button} aria-label={texts.decrease(label)} data-testid={`${testid}-minus`}
          disabled={value <= range.min} onClick={() => onCommit(snap(value - range.step))}>−</button>
        <input type="range" data-testid={testid} aria-label={label} aria-valuetext={valueText(value)}
          className="range min-w-0 flex-1" style={{ "--fill": `${percent}%` }}
          min={range.min} max={range.max} step={range.step} value={value}
          onInput={(e) => onLive(read(e))} onChange={(e) => onCommit(read(e))} />
        <button type="button" className={button} aria-label={texts.increase(label)} data-testid={`${testid}-plus`}
          disabled={value >= range.max} onClick={() => onCommit(snap(value + range.step))}>+</button>
        {/* not an <output>: that is a second live region, and the slider's value text already says it */}
        <span aria-hidden="true" className="w-[4.5rem] shrink-0 sm:w-24 text-right text-[15px] font-medium tabular-nums text-slate-900" data-testid={`${testid}-value`}>{display(value)}</span>
      </div>
      <div className="flex justify-between px-11 text-[11px] tabular-nums text-slate-400" aria-hidden="true">
        <span>{display(range.min)}</span>
        <span>{display(range.max)}</span>
      </div>
    </div>
  );
};

const Meter = ({ level, target, references, texts, levelText }: {
  level: number;
  target: number | null;
  references: { label: string; level: number }[];
  texts: Texts;
  levelText: (l: number) => string;
}) => {
  const at = (l: number) => `${Math.min(100, Math.max(0, ((l - METER_MIN) / (METER_MAX - METER_MIN)) * 100))}%`;
  let from = METER_MIN;
  const stops = LEVEL_BANDS.map((band) => {
    const to = Math.min(band.below, METER_MAX);
    const stop = `${band.color} ${at(from)} ${at(to)}`;
    from = to;
    return stop;
  }).join(", ");
  const ticks = [0, 20, 40, 60, 80, 100, 120, 140];
  // the coloured part is the start of the full scale, not the whole scale squeezed
  const fill = Math.min(1, Math.max(0.001, isFinite(level) ? (level - METER_MIN) / (METER_MAX - METER_MIN) : level > 0 ? 1 : 0.001));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>{texts.meter}</span>
        {target !== null && <span className="normal-case tracking-normal text-slate-600" data-testid="target">{texts.targetLevel(levelText(target))}</span>}
      </div>
      <div role="meter" aria-label={texts.meter} aria-valuemin={METER_MIN} aria-valuemax={METER_MAX}
        aria-valuenow={isFinite(level) ? Math.min(METER_MAX, Math.max(METER_MIN, level)) : METER_MIN} aria-valuetext={levelText(level)}
        className="relative h-7" data-testid="meter">
        <div className="absolute inset-x-0 top-2 h-3 rounded-full opacity-30" style={{ background: `linear-gradient(to right, ${stops})` }} />
        <div className="absolute left-0 top-2 h-3 rounded-full transition-[width] duration-150 motion-reduce:transition-none"
          style={{ width: at(level), background: `linear-gradient(to right, ${stops})`, backgroundSize: `${100 / fill}% 100%` }} />
        {references.map((r, i) => (
          <div key={i} title={`${r.label} ${levelText(r.level)}`} className="absolute top-1 h-5 w-px bg-slate-400" style={{ left: at(r.level) }} />
        ))}
        {target !== null && (
          <div className="absolute -top-1 flex -translate-x-1/2 flex-col items-center" style={{ left: at(target) }} data-testid="target-mark">
            <div className="h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-amber-500" />
            <div className="h-6 w-0.5 bg-amber-500" />
          </div>
        )}
        <div className="absolute top-0 h-7 w-1.5 -translate-x-1/2 rounded-full bg-slate-900 ring-2 ring-white transition-[left] duration-150 motion-reduce:transition-none" style={{ left: at(level) }} />
      </div>
      <div className="relative h-4 text-[11px] tabular-nums text-slate-400" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2" style={{ left: at(t) }}>{t}</span>
        ))}
      </div>
    </div>
  );
};

/** The 3D picture, or the 2D one when the item asks for it or WebGL is missing. */
const Picture = ({ settings: s, fraction, levelAt, reducedMotion, label }: {
  settings: Settings;
  fraction: number;
  levelAt: (fraction: number) => number;
  reducedMotion: boolean;
  label: string;
}) => {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<SoundScene | null>(null);
  const [webgl, setWebgl] = useState(s.view === "3d");

  useEffect(() => {
    if (!webgl || !host.current) return;
    try {
      scene.current = new SoundScene(host.current, svgDataUrl(SOURCE_SVG[s.source]), svgDataUrl(LISTENER_SVG));
      scene.current.canvas.addEventListener("webglcontextlost", () => setWebgl(false));
    } catch {
      setWebgl(false); // no WebGL: the 2D picture
      return;
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, [webgl, s.source]);

  useEffect(() => {
    scene.current?.update({ fraction, levelAt, reducedMotion });
  });

  return (
    <div role="img" aria-label={label} data-testid="picture" data-view={webgl ? "3d" : "2d"} className="h-[260px] w-full">
      {webgl ? <div ref={host} className="h-full w-full" /> : <Picture2D source={s.source} fraction={fraction} levelAt={levelAt} reducedMotion={reducedMotion} />}
    </div>
  );
};

/** The waves as circles around the source, in SVG; they fade and change colour as the level drops. */
const Picture2D = ({ source, fraction, levelAt, reducedMotion }: {
  source: string;
  fraction: number;
  levelAt: (fraction: number) => number;
  reducedMotion: boolean;
}) => {
  const [t, setT] = useState(0.5);
  useEffect(() => {
    if (reducedMotion) {
      setT(0.5);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = () => {
      setT((performance.now() - start) / 6000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion]);

  const X0 = 52, X1 = 620, GROUND = 214, CY = 170;
  const length = X1 - X0;
  const x = Math.max(X0 + 40, X0 + fraction * length);
  const waves = 7;
  return (
    <svg viewBox="0 0 660 260" className="h-full w-full" aria-hidden="true">
      <defs>
        <clipPath id="sky"><rect x="0" y="0" width="660" height={GROUND} /></clipPath>
      </defs>
      <rect x="0" y={GROUND} width="660" height={260 - GROUND} fill="#e2e8f0" />
      <g clip-path="url(#sky)">
        {Array.from({ length: waves }, (_, i) => {
          const phase = (((t + i / waves) % 1) + 1) % 1;
          const radius = 12 + phase * (length + 30);
          const level = levelAt(radius / length);
          const edge = Math.min(1, phase * 8, (1 - phase) * 6);
          return <circle key={i} cx={X0} cy={CY} r={radius} fill="none" stroke={levelColor(level)} stroke-width={3} opacity={Math.min(1, 1.2 * visibility(level)) * edge} />;
        })}
      </g>
      {Array.from({ length: 11 }, (_, i) => (
        <line key={i} x1={X0 + (i / 10) * length} x2={X0 + (i / 10) * length} y1={GROUND + 10} y2={GROUND + (i % 5 === 0 ? 22 : 16)} stroke="#94a3b8" />
      ))}
      <line x1={X0} x2={X1} y1={GROUND + 10} y2={GROUND + 10} stroke="#94a3b8" />
      <line x1={X0} x2={x} y1={GROUND + 4} y2={GROUND + 4} stroke="#0f766e" stroke-width="2" stroke-dasharray="6 4" />
      <image href={svgDataUrl(SOURCE_SVG[source])} x={X0 - 44} y={GROUND - 88} width="88" height="88" />
      <ellipse cx={x} cy={GROUND} rx="24" ry="6" fill={levelColor(levelAt(fraction))} opacity="0.85" />
      <image href={svgDataUrl(LISTENER_SVG)} x={x - 32} y={GROUND - 64} width="64" height="64" />
    </svg>
  );
};

export default Interaction;
