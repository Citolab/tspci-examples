import { useState } from "preact/hooks";
import Board, { Label, Settings, cmOf, colorOf, newtonOf } from "./board";
import { textsFor } from "./texts";
import { Answer, ArrowDef, MAX_ARROWS, Tolerance, Vector, formatNumber, numberSetting, responseProcessingXml } from "./vector";

// The authoring mode (index.tsx getAuthoringInstance): the author names the arrows, draws the correct ones on the
// picture (which also places the point of application P) and sets the tolerances. The result is data-arrows and
// data-answer (vector.ts); the authoring mode also shows the response processing that scores like the rubric.

export type Authored = { defs: ArrowDef[]; answer: Answer };

/** What keeps the configuration from being used (getAuthoringInstance validate()). */
export const authoringProblems = ({ defs, answer }: Authored, language: string) => {
  const t = textsFor(language);
  const problems: string[] = [];
  if (defs.some((d) => !d.label.trim())) problems.push(t.noLabel);
  defs.forEach((d, i) => {
    const v = answer.vectors[i];
    if (!v || v.length <= 0) problems.push(t.noCorrect(d.label.trim() ? d.label.replace("_", "") : `${i + 1}`));
  });
  return problems;
};

/** The arrows as delivery reads them: a fixed start is where the correct arrow starts. */
export const authoredDefs = (defs: ArrowDef[], fixed: boolean[], vectors: (Vector | null)[]): ArrowDef[] =>
  defs.map((d, i) => ({
    label: d.label,
    point: fixed[i] ? d.point : "",
    start: fixed[i] ? (vectors[i] ? { x: vectors[i].x, y: vectors[i].y } : d.start) : null,
  }));

const field = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-amber-500";
const button =
  "rounded-md border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-amber-500";

const Authoring = ({ initial, settings: s, language, onChange }: {
  initial: Authored;
  settings: Settings;
  /** The author's language, for the texts. */
  language: string;
  onChange: (authored: Authored) => void;
}) => {
  const t = textsFor(language);
  const [defs, setDefs] = useState<ArrowDef[]>(initial.defs);
  const [fixed, setFixed] = useState<boolean[]>(initial.defs.map((d) => !!d.start));
  const [vectors, setVectors] = useState<(Vector | null)[]>(initial.defs.map((_, i) => initial.answer.vectors[i] ?? null));
  const [tolerance, setTolerance] = useState<Tolerance>(initial.answer.tolerance);
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);

  const commit = (next: { defs?: ArrowDef[]; fixed?: boolean[]; vectors?: (Vector | null)[]; tolerance?: Tolerance }) => {
    const d = next.defs ?? defs;
    const f = next.fixed ?? fixed;
    const v = next.vectors ?? vectors;
    const tol = next.tolerance ?? tolerance;
    setDefs(d);
    setFixed(f);
    setVectors(v);
    setTolerance(tol);
    setCopied(false);
    onChange({ defs: authoredDefs(d, f, v), answer: { vectors: v, tolerance: tol } });
  };
  const answer: Answer = { vectors, tolerance };
  const problems = authoringProblems({ defs, answer }, language);
  const setDef = (i: number, change: Partial<ArrowDef>) => commit({ defs: defs.map((d, j) => (j === i ? { ...d, ...change } : d)) });
  const add = () => {
    commit({
      defs: [...defs, { label: `F_${defs.length + 1}`, start: null, point: "P" }],
      fixed: [...fixed, true],
      vectors: [...vectors, null],
    });
    setActive(defs.length);
  };
  const remove = (i: number) => {
    commit({ defs: defs.filter((_, j) => j !== i), fixed: fixed.filter((_, j) => j !== i), vectors: vectors.filter((_, j) => j !== i) });
    setActive(Math.max(0, Math.min(active, defs.length - 2)));
  };
  const tolField = (key: keyof Tolerance, text: string, step: number, max: number) => (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-600">{text}</span>
      <input type="number" min={0} max={max} step={step} value={tolerance[key]} className={`${field} w-20 text-right`} data-testid={`tol-${key}`}
        onChange={(e) => {
          const n = numberSetting((e.target as HTMLInputElement).value, tolerance[key], 0, max);
          if (n !== tolerance[key]) commit({ tolerance: { ...tolerance, [key]: n } });
        }} />
    </label>
  );
  const xml = responseProcessingXml(answer);
  const shownDefs = authoredDefs(defs, fixed, vectors);

  return (
    <div className="flex flex-col gap-3 font-sans text-sm text-slate-800">
      <p className="m-0 max-w-[90ch] text-xs text-slate-500">{t.authoringHint}</p>
      <div className="flex flex-wrap items-start gap-4">
        <Board settings={s} defs={shownDefs} arrows={vectors} fixed={defs.map(() => false)} marks={fixed} active={active}
          onActive={setActive} onCommit={(i, v) => commit({ vectors: vectors.map((x, j) => (j === i ? v : x)) })}
          tolerance={tolerance} texts={textsFor(s.language)} label={t.drawing} />

        <div className="flex min-w-[300px] flex-1 flex-col gap-4">
          <fieldset className="m-0 flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.arrows}</legend>
            {defs.map((d, i) => {
              const v = vectors[i];
              return (
                <div key={i} className={`flex flex-col gap-2 rounded-lg border p-2 ${active === i ? "border-amber-400 bg-amber-50/60" : "border-slate-200"}`}
                  data-testid={`def-${i}`} onClick={() => setActive(i)}>
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="radio" name="fv-active" checked={active === i} onChange={() => setActive(i)} aria-label={t.arrowName(d.label)}
                      className="accent-amber-600" />
                    <span className="h-3 w-3 rounded-full" style={{ background: colorOf(i) }} aria-hidden="true" />
                    <label className="flex items-center gap-1">
                      <span className="text-xs text-slate-500">{t.label}</span>
                      <input value={d.label} className={`${field} w-20`} data-testid={`label-${i}`}
                        onInput={(e) => setDef(i, { label: (e.target as HTMLInputElement).value })} />
                    </label>
                    <span className="font-semibold italic"><Label label={d.label} /></span>
                    <button type="button" className={`${button} ml-auto`} disabled={defs.length <= 1} data-testid={`remove-${i}`}
                      onClick={(e) => { e.stopPropagation(); remove(i); }}>{t.removeArrow}</button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1.5" title={t.fixedHint}>
                      <input type="checkbox" checked={fixed[i]} className="accent-amber-600" data-testid={`fixed-${i}`}
                        onChange={() => commit({ fixed: fixed.map((f, j) => (j === i ? !f : f)) })} />
                      <span>{t.fixed}</span>
                    </label>
                    {fixed[i] && (
                      <label className="flex items-center gap-1">
                        <span className="text-xs text-slate-500">{t.pointName}</span>
                        <input value={d.point} className={`${field} w-12`} data-testid={`point-${i}`}
                          onInput={(e) => setDef(i, { point: (e.target as HTMLInputElement).value })} />
                      </label>
                    )}
                  </div>
                  <div className="tabular-nums text-slate-600" data-testid={`summary-${i}`}>
                    {v
                      ? `${newtonOf(v, s)} N · ${cmOf(v, s)} cm · ${formatNumber(v.angle, 1, s.language)}° · (${formatNumber(v.x, 2, s.language)}; ${formatNumber(v.y, 2, s.language)}) cm`
                      : <span className="text-red-600">{t.noCorrect(d.label)}</span>}
                  </div>
                </div>
              );
            })}
            <button type="button" className={`${button} self-start`} disabled={defs.length >= MAX_ARROWS} onClick={add} data-testid="add">
              + {t.addArrow}
            </button>
          </fieldset>

          <fieldset className="m-0 flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.tolerances}</legend>
            {tolField("start", t.tolStart, 0.1, 10)}
            {tolField("angle", t.tolAngle, 1, 90)}
            {tolField("length", t.tolLength, 0.1, 10)}
            <p className="m-0 text-xs text-slate-500">{t.points(vectors.filter(Boolean).length * 2)}</p>
          </fieldset>

          {problems.length > 0 && (
            <ul className="m-0 list-none rounded-lg bg-red-50 p-2 pl-3 text-red-700" data-testid="problems">
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
        </div>
      </div>

      <details className="rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer select-none font-medium">{t.responseProcessing}</summary>
        <div className="mt-2 flex flex-col gap-2">
          <button type="button" className={`${button} self-start`} data-testid="copy"
            onClick={() => navigator.clipboard?.writeText(xml).then(() => setCopied(true), () => setCopied(false))}>
            {copied ? t.copied : t.copy}
          </button>
          <pre className="m-0 max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100" data-testid="xml">{xml}</pre>
        </div>
      </details>
    </div>
  );
};

export default Authoring;
