import { useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import Board, { Label, Settings, colorOf, cmOf, newtonOf, plainLabel } from "./board";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";
import { ArrowDef, Vector, formatNumber } from "./vector";

// The candidate's view: the instruction, a toolbar (which arrow, undo, start again, ruler, the scale), the drawing and
// what each arrow measures.

const button =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 " +
  "shadow-xs hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 " +
  "disabled:cursor-not-allowed disabled:opacity-40";

const Interaction = ({ prompt, settings: s, defs, showScale, ruler, store, correct, texts: t }: {
  prompt: string;
  settings: Settings;
  defs: ArrowDef[];
  showScale: boolean;
  ruler: boolean;
  store: IStore<StateModel, Actions>;
  /** Solution status: the correct arrows, dashed. */
  correct: (Vector | null)[] | null;
  texts: Texts;
}) => {
  const { arrows, past } = useStore(store);
  const [active, setActive] = useState(0);
  const [showRuler, setShowRuler] = useState(true);
  const [message, setMessage] = useState("");
  const fixed = defs.map((d) => !!d.start);

  return (
    <div className="inline-flex max-w-full flex-col gap-3 font-sans text-slate-800">
      {prompt && <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-slate-700" data-testid="prompt">{prompt}</p>}

      <div className="flex flex-wrap items-center gap-2" style={{ maxWidth: `${s.width}px` }}>
        {defs.length > 1 && (
          <div role="radiogroup" aria-label={t.choose} className="flex gap-1 rounded-lg bg-slate-100 p-1" data-testid="choose">
            {defs.map((d, i) => (
              <button key={i} type="button" role="radio" aria-checked={active === i} aria-label={t.arrowName(plainLabel(d.label))}
                className="flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-semibold italic text-slate-600 aria-checked:bg-white aria-checked:text-slate-900 aria-checked:shadow-sm focus-visible:outline-2 focus-visible:outline-amber-500"
                onClick={() => setActive(i)} data-testid={`choose-${i}`}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(i) }} aria-hidden="true" />
                <Label label={d.label} />
              </button>
            ))}
          </div>
        )}
        <button type="button" className={button} disabled={!past.length} data-testid="undo"
          onClick={() => store.dispatch({ type: "UNDO", payload: null })}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>
          {t.undo}
        </button>
        <button type="button" className={button} disabled={!arrows.some(Boolean)} data-testid="clear"
          onClick={() => { store.dispatch({ type: "CLEAR", payload: null }); setMessage(t.cleared); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
          {t.clear}
        </button>
        {ruler && (
          <button type="button" className={button} aria-pressed={showRuler} data-testid="toggle-ruler"
            onClick={() => setShowRuler(!showRuler)} title={t.showRuler}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="7" width="20" height="10" rx="1.5" /><path d="M6 7v4M10 7v3M14 7v4M18 7v3" /></svg>
            {t.ruler}
          </button>
        )}
        {showScale && s.newtonPerCm > 0 && (
          <div className="ml-auto flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700" data-testid="scale">
            <svg width={s.pixelsPerCm + 2} height="10" aria-hidden="true">
              <path d={`M1 1v8M${s.pixelsPerCm + 1} 1v8M1 5h${s.pixelsPerCm}`} stroke="#334155" stroke-width="2" fill="none" />
            </svg>
            <span>{t.scale("1", formatNumber(s.newtonPerCm, s.newtonPerCm % 1 ? 1 : 0, s.language))}</span>
          </div>
        )}
      </div>

      <Board settings={s} defs={defs} arrows={arrows} fixed={fixed} active={active} onActive={setActive}
        onCommit={(index, vector) => store.dispatch({ type: "SET_ARROW", payload: { index, vector } })}
        correct={correct} ruler={ruler && showRuler} texts={t} label={prompt || t.drawing} onAnnounce={setMessage} helpId="fv-help" />

      {s.showLabel !== "none" && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0" data-testid="readout" style={{ maxWidth: `${s.width}px` }}>
          {defs.map((d, i) => {
            const v = arrows[i];
            return (
              <li key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm" data-testid={`readout-${i}`}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(i) }} aria-hidden="true" />
                <span className="font-semibold italic"><Label label={d.label} /></span>
                {v ? (
                  <span className="tabular-nums text-slate-700">
                    {(s.showLabel === "both" || s.showLabel === "newton") && <strong className="font-semibold">{newtonOf(v, s)} N</strong>}
                    {s.showLabel === "both" && <span className="text-slate-400"> · </span>}
                    {(s.showLabel === "both" || s.showLabel === "cm") && <span>{cmOf(v, s)} cm</span>}
                  </span>
                ) : (
                  <span className="text-slate-400">{t.notDrawn}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <details className="max-w-[70ch] text-sm text-slate-600">
        <summary className="cursor-pointer select-none font-medium text-slate-700">{t.showHelp}</summary>
        <p id="fv-help" className="mb-0 mt-1">
          {t.help} {fixed.some((f) => !f) ? t.helpFree : ""} {ruler ? t.helpRuler : ""}
        </p>
      </details>
      <p className="sr-only" aria-live="polite" data-testid="announce">{message}</p>
    </div>
  );
};

export default Interaction;
