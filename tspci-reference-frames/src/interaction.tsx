// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Trainpci and
// https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Relatempci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import {
  FrameId, GEOMETRY, PointId, STEP, Shape, TURN, Vec, bystanderX, duration, frameVelocity, groundPosition, pathOf,
  secondStart, shapeIcon, shapeOf, trajectory,
} from "./model";
import { RATES, Settings, formatNumber } from "./settings";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";

// The candidate's view: the instruction, the scene in SVG as one observer sees it, the controls of the animation, the
// point of view, the trajectories to trace and the questions.

const W = 960;
const H = 330;
/** the ground (y = 0) on the screen */
const GY = 236;
const MARGIN = 30;
const MAX_SCALE = 34;

export const COLORS: Record<PointId, string> = {
  rim: "#dc2626",
  hub: "#2563eb",
  passenger: "#7c3aed",
  bystander: "#b45309",
  second: "#0f766e",
};

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

/** One scale for every frame (so the vehicle keeps its size), and per frame the offset that keeps the run in view. */
export const layoutOf = (s: Settings) => {
  const g = GEOMETRY[s.scene];
  const end = duration(s);
  const extent: Record<string, [number, number]> = {};
  for (const frame of s.frames) {
    const vF = frameVelocity(frame, s);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * end;
      const xs = [t, t + g.length, bystanderX(s) - 2.6, bystanderX(s) + 0.8];
      if (s.hasSecond) xs.push(secondStart(s) + s.secondSpeed * t, secondStart(s) + s.secondSpeed * t + g.secondLength);
      for (const x of xs) {
        min = Math.min(min, x - vF * t);
        max = Math.max(max, x - vF * t);
      }
    }
    extent[frame] = [min, max];
  }
  const widest = Math.max(...Object.values(extent).map(([a, b]) => b - a));
  const k = Math.min(MAX_SCALE, (W - 2 * MARGIN) / widest);
  const offset = Object.fromEntries(Object.entries(extent).map(([f, [a, b]]) => [f, W / 2 - (k * (a + b)) / 2])) as Record<FrameId, number>;
  return { k, offset };
};

type Props = {
  prompt: string;
  settings: Settings;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  readOnly: boolean;
};

const Interaction = ({ prompt, settings: s, store, texts, readOnly }: Props) => {
  const state = useStore(store);
  const end = duration(s);
  const reducedMotion = usePrefersReducedMotion();
  const [t, setT] = useState(Math.min(end, state.time));
  const [playing, setPlaying] = useState(s.autoplay && !reducedMotion && !readOnly);
  const [announcement, setAnnouncement] = useState("");
  const scene = texts.scenes[s.scene];
  const n = (value: number, decimals = 1) => formatNumber(value, decimals, s.language);
  const frame = s.frames.includes(state.frame) ? state.frame : s.startFrame;
  const traced = state.traced.filter((p) => s.points.includes(p));

  // a restored state or response: its time
  useEffect(() => setT(Math.min(end, state.time)), [state.time]);

  // the animation: the time runs at the playback speed until the end of the run
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => {
    if (!playing) return;
    let frameId = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const next = Math.min(end, tRef.current + ((now - last) / 1000) * state.rate);
      last = now;
      setT(next);
      if (next >= end) {
        setPlaying(false);
        store.dispatch({ type: "TIME", payload: { time: end, how: "end" } });
        setAnnouncement(texts.announceEnd);
        return;
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [playing, state.rate, end]);

  // what the candidate saw move: the frame, and the traces in it
  useEffect(() => {
    if (readOnly || t <= 0) return;
    const entries = [`${frame}:`, ...traced.map((p) => `${frame}:${p}`)].filter((e) => !state.seen.includes(e));
    if (entries.length) store.dispatch({ type: "SEEN", payload: { entries } });
  }, [t > 0, frame, traced.join(","), state.seen.length]);

  const stopAt = (time: number, how: Actions["TIME"]["how"]) => {
    const clamped = Math.max(0, Math.min(end, time));
    setPlaying(false);
    setT(clamped);
    store.dispatch({ type: "TIME", payload: { time: clamped, how } });
  };
  const play = () => {
    if (t >= end) setT(0);
    setPlaying(true);
    store.dispatch({ type: "TIME", payload: { time: t >= end ? 0 : t, how: "play" } });
  };

  const turnsText = texts.turns(Math.round((t / TURN) * 100) / 100, n(t / TURN, 2));
  const hidden = new Set(s.questions.map((q) => `${q.point}@${q.frame}`));
  const generic = traced.filter((p) => hidden.has(`${p}@${frame}`));
  const described = [
    generic.length ? texts.traced(joinList(generic.map((p) => scene.points[p]), texts.and)) : "",
    ...traced.filter((p) => !generic.includes(p)).map((p) => texts.tracedShape(scene.points[p], texts.shapes[shapeOf(p, frame, s)])),
  ].filter(Boolean).join(" ");

  const base =
    "inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium shadow-sm " +
    "disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1";
  const button = `${base} border-slate-300 bg-white text-slate-800 hover:bg-slate-50`;
  const primary = `${base} min-w-[6.5rem] border-teal-700 bg-teal-700 text-white hover:bg-teal-800`;

  return (
    <div className="reference-frames flex w-full max-w-[960px] flex-col gap-3 font-sans text-slate-800" data-scene={s.scene}>
      {prompt && <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-slate-700">{prompt}</p>}
      <section aria-label={texts.simulation} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div role="img" aria-label={`${scene.picture} ${texts.describe(scene.observers[frame], turnsText, described)}`} data-testid="picture">
          <Stage s={s} frame={frame} traced={traced} t={t} />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
          {playing ? (
            <button type="button" className={primary} disabled={readOnly} onClick={() => stopAt(t, "pause")} data-testid="pause">
              <Icon d="M6 4h4v16H6zM14 4h4v16h-4z" /> {texts.pause}
            </button>
          ) : (
            <button type="button" className={primary} disabled={readOnly} onClick={play} data-testid="play">
              <Icon d="M7 4l13 8-13 8z" /> {texts.play}
            </button>
          )}
          <button type="button" className={button} aria-label={texts.stepBack} title={texts.stepBack} disabled={readOnly || t <= 0}
            onClick={() => stopAt(Math.ceil(t / STEP - 1e-6) * STEP - STEP, "step")} data-testid="step-back">
            <Icon d="M18 5v14l-9-7zM6 5h2v14H6z" />
          </button>
          <button type="button" className={button} aria-label={texts.stepForward} title={texts.stepForward} disabled={readOnly || t >= end}
            onClick={() => stopAt(Math.floor(t / STEP + 1e-6) * STEP + STEP, "step")} data-testid="step-forward">
            <Icon d="M6 5v14l9-7zM16 5h2v14h-2z" />
          </button>
          <button type="button" className={button} disabled={readOnly || (t <= 0 && !playing)} onClick={() => stopAt(0, "reset")} data-testid="reset">
            <Icon d="M12 5a7 7 0 1 1-6.6 4.7l1.9.6A5 5 0 1 0 12 7v3L7.5 6 12 2z" /> {texts.reset}
          </button>
          <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
            {texts.speed}
            <select className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              value={String(state.rate)} disabled={readOnly} data-testid="rate"
              onChange={(e) => store.dispatch({ type: "RATE", payload: { rate: Number((e.currentTarget as HTMLSelectElement).value) } })}>
              {RATES.map((r) => <option key={r} value={String(r)}>{n(r, r < 1 ? 2 : 0).replace(/([.,]\d)0$/, "$1")}×</option>)}
            </select>
          </label>
          <div className="flex w-full items-center gap-3">
            <input type="range" className="range min-w-0 flex-1" aria-label={texts.time} aria-valuetext={turnsText} data-testid="time"
              min={0} max={end} step={STEP / 4} value={t} disabled={readOnly} style={{ "--fill": `${(t / end) * 100}%` }}
              onInput={(e) => { setPlaying(false); setT(Number((e.currentTarget as HTMLInputElement).value)); }}
              onChange={(e) => stopAt(Number((e.currentTarget as HTMLInputElement).value), "seek")} />
            <span aria-hidden="true" className="w-44 shrink-0 text-right text-sm tabular-nums text-slate-600" data-testid="turns">{turnsText}</span>
          </div>
          {reducedMotion && <p className="m-0 w-full text-xs text-slate-500" data-testid="reduced-motion">{texts.reducedMotion}</p>}
        </div>

        <div className="grid gap-4 border-t border-slate-100 p-4 sm:grid-cols-2">
          <fieldset className="m-0 min-w-0 border-0 p-0" disabled={readOnly}>
            <legend className="mb-2 p-0 text-sm font-semibold text-slate-700">{texts.pointOfView}</legend>
            <div className="flex flex-col gap-1.5">
              {s.frames.map((f) => (
                <label key={f} className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ring-1 ${f === frame ? "bg-teal-50 ring-teal-600" : "ring-slate-200 hover:bg-slate-50"}`}>
                  <input type="radio" name="frame" value={f} checked={f === frame} className="h-4 w-4 accent-teal-700"
                    onChange={() => {
                      store.dispatch({ type: "FRAME", payload: { frame: f } });
                      setAnnouncement(texts.announceFrame(scene.frames[f]));
                    }} />
                  {scene.frames[f]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="m-0 min-w-0 border-0 p-0" disabled={readOnly}>
            <legend className="mb-2 p-0 text-sm font-semibold text-slate-700">{texts.trace}</legend>
            <div className="flex flex-col gap-1.5">
              {s.points.map((p) => (
                <label key={p} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={traced.includes(p)} className="h-4 w-4 accent-teal-700"
                    onChange={(e) => {
                      const on = (e.currentTarget as HTMLInputElement).checked;
                      store.dispatch({ type: "TRACE", payload: { traced: s.points.filter((x) => (x === p ? on : traced.includes(x))) } });
                    }} />
                  <span aria-hidden="true" className="inline-block h-1 w-5 rounded-full" style={{ background: COLORS[p] }} />
                  {scene.pointLabels[p]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {s.questions.length > 0 && (
          <div className="flex flex-col gap-4 border-t border-slate-100 bg-slate-50/60 p-4" data-testid="questions">
            <h3 className="m-0 text-sm font-semibold uppercase tracking-wide text-slate-500">{texts.questions}</h3>
            {s.questions.map((q) => (
              <fieldset key={q.id} className="m-0 min-w-0 border-0 p-0" disabled={readOnly} data-question={q.id}>
                <legend className="mb-2 p-0 text-[15px] font-medium text-slate-800">
                  {q.kind === "trajectory"
                    ? texts.trajectoryQuestion(scene.points[q.point], scene.observers[q.frame])
                    : texts.motionQuestion(scene.points[q.point], scene.observers[q.frame])}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {(q.kind === "trajectory" ? s.shapeOptions : (["moves", "rest"] as const)).map((option) => {
                    const checked = state.answers[q.id] === option;
                    return (
                      <label key={option}
                        className={`flex cursor-pointer items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ${checked ? "ring-2 ring-teal-700" : "ring-slate-300 hover:ring-slate-400"}`}>
                        <input type="radio" name={`q-${q.id}`} value={option} checked={checked} className="h-4 w-4 accent-teal-700"
                          onChange={() => store.dispatch({ type: "ANSWER", payload: { id: q.id, value: option } })} />
                        {q.kind === "trajectory" && <ShapeIcon shape={option as Shape} />}
                        {q.kind === "trajectory" ? texts.shapes[option as Shape] : texts[option as "moves" | "rest"]}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        )}
      </section>
      <div role="status" aria-live="polite" className="sr-only" data-testid="live">{announcement}</div>
    </div>
  );
};

const joinList = (items: string[], and: string) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`);

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path d={d} fill="currentColor" /></svg>
);

const ShapeIcon = ({ shape }: { shape: Shape }) => {
  const points = shapeIcon(shape);
  return (
    <svg viewBox="-4 -4 64 40" className="h-8 w-14" aria-hidden="true" data-shape={shape}>
      {shape === "circle"
        ? <circle cx="28" cy="16" r="13" fill="none" stroke="#0f172a" stroke-width="2.2" />
        : points.length === 1
        ? <circle cx={56 * points[0][0]} cy={32 * points[0][1]} r="4" fill="#0f172a" />
        : <path d={pathOf(points, [56, 32])} fill="none" stroke="#0f172a" stroke-width="2.2" stroke-linejoin="round" />}
    </svg>
  );
};

/** The scene as the observer of a frame sees it: everything drawn in ground coordinates, shifted by the frame's motion. */
const Stage = ({ s, frame, traced, t }: { s: Settings; frame: FrameId; traced: PointId[]; t: number }) => {
  const { k, offset } = useMemo(() => layoutOf(s), [s]);
  const ox = offset[frame] ?? W / 2;
  const shift = frameVelocity(frame, s) * t;
  // the stretch of ground in view, for the scenery
  const from = -ox / k + shift - 2;
  const to = (W - ox) / k + shift + 2;
  const g = GEOMETRY[s.scene];
  const train = s.scene === "train";
  const at = (p: PointId) => groundPosition(p, t, s);
  const secondX = secondStart(s) + s.secondSpeed * t;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" aria-hidden="true" data-frame={frame} data-time={t.toFixed(3)}>
      <defs>
        <linearGradient id="rf-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color={train ? "#bfdbfe" : "#fde68a"} />
          <stop offset="1" stop-color={train ? "#eff6ff" : "#fff7ed"} />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#rf-sky)" />
      <rect y={GY - 3.2 * k} width={W} height={H} fill={train ? "#bbf7d0" : "#fcd9a8"} />
      <g transform={`translate(${ox - k * shift} ${GY}) scale(${k})`}>
        <Scenery train={train} from={from} to={to} />
        {train ? <Cow x={bystanderX(s)} g={g} /> : <Marc x={bystanderX(s)} g={g} />}
        {train ? <Train x={t} t={t} /> : <Motorbike x={t} t={t} />}
        {train ? (
          <>
            <Ladybird at={at("hub")} color={COLORS.hub} />
            <Ladybird at={at("rim")} color={COLORS.rim} />
          </>
        ) : (
          <>
            <circle cx={at("hub")[0]} cy={at("hub")[1]} r="0.16" fill={COLORS.hub} stroke="#fff" stroke-width="0.05" />
            <circle cx={at("rim")[0]} cy={at("rim")[1]} r="0.16" fill={COLORS.rim} stroke="#fff" stroke-width="0.05" />
          </>
        )}
        {train && <rect x={from} y="0" width={to - from} height="0.08" fill="#475569" />}
        {s.hasSecond && <Second train={train} x={secondX} g={g} dir={s.secondSpeed < 0 ? -1 : 1} t={t} />}
      </g>
      {/* the trajectories, in the frame's coordinates */}
      <g transform={`translate(${ox} ${GY}) scale(${k})`} data-testid="traces">
        {traced.map((p) => {
          const points = trajectory(p, frame, t, s);
          const [x, y] = points[points.length - 1];
          return (
            <g key={p} data-trace={p}>
              <path d={pathOf(points)} fill="none" stroke={COLORS[p]} stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
                vector-effect="non-scaling-stroke" opacity="0.9" />
              <circle cx={x} cy={y} r={0.2} fill="none" stroke={COLORS[p]} stroke-width="2.5" vector-effect="non-scaling-stroke" />
            </g>
          );
        })}
      </g>
    </svg>
  );
};

/** Items every `period` along the ground, at their place in the ground frame. */
const every = (period: number, from: number, to: number) => {
  const xs: number[] = [];
  for (let i = Math.ceil(from / period); i * period <= to; i++) xs.push(i * period);
  return xs;
};

const Scenery = ({ train, from, to }: { train: boolean; from: number; to: number }) =>
  train ? (
    <g>
      {every(11, from - 3, to + 3).map((x) => (
        <g key={`t${x}`}>
          <rect x={x - 0.15} y={-2.6} width="0.3" height="1.4" fill="#78350f" />
          <circle cx={x} cy={-3.2} r="1" fill="#16a34a" />
          <circle cx={x - 0.5} cy={-2.8} r="0.7" fill="#15803d" />
        </g>
      ))}
      {every(2.5, from, to).map((x) => (
        <rect key={`f${x}`} x={x - 0.06} y={-1.6} width="0.12" height="0.8" fill="#a16207" />
      ))}
      <rect x={from} y={-1.4} width={to - from} height="0.08" fill="#a16207" />
      <rect x={from} y={0} width={to - from} height="3" fill="#86efac" />
      {every(0.8, from, to).map((x) => (
        <rect key={`s${x}`} x={x - 0.18} y={0.05} width="0.36" height="0.22" fill="#78716c" />
      ))}
    </g>
  ) : (
    <g>
      {every(9, from - 3, to + 3).map((x) => (
        <g key={`c${x}`} fill="#4d7c0f">
          <rect x={x - 0.2} y={-3.4} width="0.4" height="2.7" rx="0.2" />
          <rect x={x - 0.75} y={-2.6} width="0.3" height="1.1" rx="0.15" />
          <rect x={x - 0.75} y={-1.8} width="0.75" height="0.28" rx="0.14" />
          <rect x={x + 0.45} y={-3} width="0.3" height="1" rx="0.15" />
          <rect x={x} y={-2.3} width="0.75" height="0.28" rx="0.14" />
        </g>
      ))}
      {every(5, from - 1, to + 1).map((x) => (
        <ellipse key={`r${x}`} cx={x + 2.2} cy={-0.75} rx="0.35" ry="0.18" fill="#a8a29e" />
      ))}
      <rect x={from} y={-0.6} width={to - from} height="3.6" fill="#57534e" />
      <rect x={from} y={0.55} width={to - from} height="3" fill="#fcd9a8" />
      {every(2, from, to).map((x) => (
        <rect key={`d${x}`} x={x} y={-0.06} width="1" height="0.12" fill="#fde047" />
      ))}
    </g>
  );

const Wheel = ({ cx, r, t, train }: { cx: number; r: number; t: number; train: boolean }) => (
  <g transform={`translate(${cx} ${-r}) rotate(${(t * 180) / Math.PI})`}>
    <circle r={r} fill={train ? "#334155" : "#1f2937"} />
    <circle r={r * (train ? 0.86 : 0.72)} fill={train ? "#64748b" : "#9ca3af"} />
    {[0, 45, 90, 135].map((a) => (
      <rect key={a} x={-r * 0.82} y={-0.03} width={r * 1.64} height="0.06" fill={train ? "#334155" : "#4b5563"} transform={`rotate(${a})`} />
    ))}
    <circle r={r * 0.16} fill="#1e293b" />
  </g>
);

const Train = ({ x, t }: { x: number; t: number }) => (
  <g transform={`translate(${x} 0)`}>
    <rect x="0.2" y="-1.65" width="8.6" height="0.45" fill="#1e293b" />
    <rect x="0" y="-5.2" width="9" height="3.6" rx="0.35" fill="#166534" />
    <rect x="0" y="-2.4" width="9" height="0.35" fill="#fef3c7" />
    <rect x="-0.1" y="-5.45" width="9.2" height="0.4" rx="0.2" fill="#14532d" />
    {[0.7, 2.7, 3.8, 5.9].map((wx, i) =>
      i === 2 ? null : <rect key={wx} x={wx} y="-4.6" width="1.6" height="1.5" rx="0.2" fill="#dbeafe" stroke="#14532d" stroke-width="0.08" />
    )}
    {/* the passenger at the window */}
    <rect x="3.7" y="-4.6" width="1.6" height="1.5" rx="0.2" fill="#dbeafe" stroke="#14532d" stroke-width="0.08" />
    <path d="M3.95 -3.1 Q4.5 -3.55 5.05 -3.1 Z" fill="#7c3aed" />
    <circle cx="4.5" cy="-3.7" r="0.32" fill="#f1c27d" />
    <path d="M4.18 -3.8 Q4.5 -4.2 4.82 -3.8 Z" fill="#422006" />
    <rect x="7.8" y="-4.6" width="0.8" height="2.1" rx="0.1" fill="#14532d" />
    <Wheel cx={1.6} r={1} t={t} train />
    <Wheel cx={7.4} r={1} t={t} train />
  </g>
);

const Motorbike = ({ x, t }: { x: number; t: number }) => (
  <g transform={`translate(${x} 0)`}>
    <Wheel cx={1} r={1} t={t} train={false} />
    <Wheel cx={3.6} r={1} t={t} train={false} />
    <path d="M1 -1 L2.3 -1.6 L3.6 -1 M2.3 -1.6 L3.3 -2.7 M3.0 -2.9 L3.6 -2.7" fill="none" stroke="#334155" stroke-width="0.14" stroke-linecap="round" />
    <path d="M1.4 -2.05 Q2.3 -2.4 3.2 -2.1 L3.0 -1.6 L1.6 -1.6 Z" fill="#dc2626" />
    <rect x="1.2" y="-2.2" width="1.2" height="0.25" rx="0.12" fill="#111827" />
    {/* Zoé */}
    <path d="M1.9 -2.1 L2.1 -3.2 M2.1 -2.9 L3.1 -2.75 M1.9 -2.1 L2.7 -1.9 L2.6 -1.3" fill="none" stroke="#7c3aed" stroke-width="0.26" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="2.1" cy="-3.6" r="0.38" fill="#f59e0b" />
    <path d="M2.1 -3.6 L2.48 -3.6 A0.38 0.38 0 0 1 2.3 -3.27 Z" fill="#1e293b" />
  </g>
);

const Cow = ({ x, g }: { x: number; g: (typeof GEOMETRY)["train"] }) => {
  const base = g.bystanderBase;
  return (
    <g>
      {[-2.2, -1.8, -0.9, -0.5].map((lx) => <rect key={lx} x={x + lx} y={base - 0.9} width="0.18" height="0.9" fill="#44403c" />)}
      <ellipse cx={x - 1.35} cy={base - 1.2} rx="1.15" ry="0.55" fill="#fafaf9" stroke="#44403c" stroke-width="0.05" />
      <ellipse cx={x - 1.7} cy={base - 1.3} rx="0.35" ry="0.25" fill="#44403c" />
      <ellipse cx={x - 0.9} cy={base - 1.05} rx="0.25" ry="0.2" fill="#44403c" />
      <path d={`M${x - 0.35} ${base - 1.5} L${x - 0.1} ${g.bystanderHead + 0.1}`} stroke="#fafaf9" stroke-width="0.35" />
      <ellipse cx={x} cy={g.bystanderHead} rx="0.42" ry="0.3" fill="#fafaf9" stroke="#44403c" stroke-width="0.05" />
      <ellipse cx={x + 0.3} cy={g.bystanderHead + 0.08} rx="0.2" ry="0.17" fill="#fda4af" />
      <circle cx={x - 0.05} cy={g.bystanderHead - 0.08} r="0.06" fill="#0f172a" />
      <path d={`M${x - 0.3} ${g.bystanderHead - 0.25} l-0.2 -0.15`} stroke="#44403c" stroke-width="0.08" />
    </g>
  );
};

const Marc = ({ x, g }: { x: number; g: (typeof GEOMETRY)["train"] }) => {
  const base = g.bystanderBase;
  return (
    <g>
      <path d={`M${x - 1.2} ${base} Q${x - 1.1} ${base - 1.3} ${x} ${base - 1.3} Q${x + 1.1} ${base - 1.3} ${x + 1.2} ${base} Z`} fill="#a8a29e" stroke="#78716c" stroke-width="0.05" />
      <path d={`M${x} ${base - 1.3} L${x} ${g.bystanderHead + 0.4} M${x} ${base - 1.3} L${x + 0.6} ${base - 1.25} L${x + 0.7} ${base - 0.4} M${x} ${g.bystanderHead + 0.8} L${x + 0.5} ${base - 1.6}`}
        fill="none" stroke="#b45309" stroke-width="0.26" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx={x} cy={g.bystanderHead} r="0.36" fill="#d6a77a" />
      <path d={`M${x - 0.36} ${g.bystanderHead - 0.05} Q${x} ${g.bystanderHead - 0.6} ${x + 0.36} ${g.bystanderHead - 0.05} Z`} fill="#292524" />
    </g>
  );
};

/** The second observer: a car (train scene) or a cyclist (motorbike scene), facing where it goes. */
const Second = ({ train, x, g, dir, t }: { train: boolean; x: number; g: (typeof GEOMETRY)["train"]; dir: number; t: number }) => {
  const L = g.secondLength;
  const base = g.secondBase;
  return (
    <g transform={`translate(${x + L / 2} 0) scale(${dir} 1) translate(${-L / 2} 0)`}>
      {train ? (
        <g>
          <path d={`M0 ${base - 0.4} L0 ${base - 1.1} L0.9 ${base - 1.2} L1.4 ${base - 2.1} L3 ${base - 2.1} L3.6 ${base - 1.2} L4 ${base - 1.05} L4 ${base - 0.4} Z`} fill="#0f766e" />
          <path d={`M1.2 ${base - 1.25} L1.55 ${base - 1.95} L2.9 ${base - 1.95} L3.3 ${base - 1.25} Z`} fill="#ccfbf1" />
          <circle cx={L / 2} cy={g.secondHead} r="0.28" fill="#f1c27d" />
          {[0.9, 3.1].map((cx) => <circle key={cx} cx={cx} cy={base - 0.4} r="0.42" fill="#1f2937" />)}
        </g>
      ) : (
        <g fill="none" stroke-linecap="round">
          {[0.5, 1.9].map((cx) => (
            <g key={cx} transform={`translate(${cx} ${base - 0.55}) rotate(${(t * 180) / Math.PI / 0.55})`}>
              <circle r="0.55" stroke="#1f2937" stroke-width="0.1" />
              <path d="M-0.5 0 L0.5 0 M0 -0.5 L0 0.5" stroke="#6b7280" stroke-width="0.04" />
            </g>
          ))}
          <path d={`M0.5 ${base - 0.55} L1.1 ${base - 1.3} L1.9 ${base - 0.55} M1.1 ${base - 1.3} L1.75 ${base - 1.3} L1.9 ${base - 0.55} M1.75 ${base - 1.3} L1.7 ${base - 1.6}`} stroke="#0f766e" stroke-width="0.1" />
          <path d={`M1.0 ${base - 1.4} L1.2 ${g.secondHead + 0.35} L1.7 ${base - 1.6} M1.0 ${base - 1.4} L1.3 ${base - 0.8}`} stroke="#0f766e" stroke-width="0.22" stroke-linejoin="round" />
          <circle cx={L / 2} cy={g.secondHead} r="0.3" fill="#f1c27d" />
        </g>
      )}
    </g>
  );
};

const Ladybird = ({ at: [x, y], color }: { at: Vec; color: string }) => (
  <g transform={`translate(${x} ${y})`}>
    <circle r="0.27" fill={color} stroke="#0f172a" stroke-width="0.05" />
    <path d="M0 -0.27 L0 0.27" stroke="#0f172a" stroke-width="0.04" />
    <circle cx="-0.11" cy="-0.06" r="0.055" fill="#0f172a" />
    <circle cx="0.11" cy="0.08" r="0.055" fill="#0f172a" />
    <circle cx="0.1" cy="-0.1" r="0.045" fill="#0f172a" />
    <circle cx="0" cy="-0.3" r="0.1" fill="#0f172a" />
  </g>
);

export default Interaction;
