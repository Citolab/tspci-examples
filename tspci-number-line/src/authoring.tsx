import { useState } from "preact/hooks";
import { NumberLine, View, colorOf } from "./board";
import {
  Answer, Format, MAX_ITEMS, Settings, Task, emptyAnswer, formatNumber, lineProblems, parseLine, parseNumber, responseProcessingXml,
  snapTo, snapStep, taskProblems,
} from "./numberline";
import { textsFor } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance): the author sets up the line (range, ticks, numbers, which
// numbers are hidden: click them on the line) and places the correct answer on the same line the candidate gets. The
// result is the line's data- attributes and data-task (numberline.ts); it also shows the response processing.

export type Authored = {
  /** The line as the author typed it ("1/4", "-3"). */
  raw: { min: string; max: string; tickStep: string; labelStep: string };
  format: Format;
  hidden: number[];
  task: Task;
};

const lineOf = (a: Authored) => parseLine({ ...a.raw, numberFormat: a.format, hiddenLabels: a.hidden.join(";") });

/** What keeps the configuration from being used (getAuthoringInstance validate()), in the author's language. */
export const authoringProblems = (a: Authored, s: Settings, language: string) => {
  const t = textsFor(language);
  const line = lineProblems(a.raw);
  const problems = line.length ? line : taskProblems(s.mode, lineOf(a), a.task, s.snap);
  return problems.map(t.problem);
};

/** The correct answer as the line shows it: the author places the start of the jumps too. */
const answerOf = (task: Task): Answer => ({
  ...emptyAnswer(task),
  points: task.points.map((p) => p.answer),
  interval: task.interval,
  start: task.jumps.answer[0] ?? null,
  landings: task.jumps.answer.slice(1),
  read: task.read.map(() => ""),
});

const field = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-amber-500";
const button =
  "rounded-md border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-amber-500";
const box = "m-0 flex flex-col gap-2 rounded-xl border border-slate-200 p-3";
const legend = "px-1 text-xs font-semibold uppercase tracking-wide text-slate-500";

const Authoring = ({ initial, settings, language, onChange }: {
  initial: Authored;
  settings: Settings;
  /** The author's language, for the texts. */
  language: string;
  onChange: (authored: Authored) => void;
}) => {
  const t = textsFor(language);
  const [a, setA] = useState<Authored>(initial);
  const [copied, setCopied] = useState(false);
  const mode = settings.mode;
  const commit = (next: Partial<Authored>) => {
    const merged = { ...a, ...next };
    setA(merged);
    setCopied(false);
    onChange(merged);
  };
  const setTask = (change: Partial<Task>) => commit({ task: { ...a.task, ...change } });
  const line = lineOf(a);
  const problems = authoringProblems(a, settings, language);
  const view: View = {
    line, mode, task: mode === "jumps" ? { ...a.task, jumps: { ...a.task.jumps, givenStart: false } } : a.task,
    snap: settings.snap, orientation: settings.orientation, length: Math.min(settings.length, 640), showValues: true,
    language: settings.language, texts: textsFor(language), readOnly: mode === "read", label: `${t.line}: ${t.tabAnswer}`,
    onToggleHidden: (v) => commit({ hidden: a.hidden.some((h) => Math.abs(h - v) < 1e-7) ? a.hidden.filter((h) => Math.abs(h - v) >= 1e-7) : [...a.hidden, v] }),
  };
  const onAnswer = (next: Answer) => {
    if (mode === "points") setTask({ points: a.task.points.map((p, i) => ({ ...p, answer: next.points[i] ?? null })) });
    else if (mode === "interval") setTask({ interval: next.interval });
    else if (mode === "jumps") setTask({ jumps: { ...a.task.jumps, answer: next.start === null ? [] : [next.start, ...next.landings].slice(0, 8) } });
  };
  const raw = (key: keyof Authored["raw"], text: string, hint?: string) => (
    <label class="flex items-center justify-between gap-3 text-sm">
      <span class="text-slate-600">{text}{hint && <span class="block text-xs text-slate-400">{hint}</span>}</span>
      <input value={a.raw[key]} class={`${field} w-24 text-right`} data-testid={`raw-${key}`}
        onInput={(e) => commit({ raw: { ...a.raw, [key]: (e.target as HTMLInputElement).value } })} />
    </label>
  );
  const xml = responseProcessingXml(mode, a.task);
  const fmt = (v: number) => formatNumber(v, line.format, language);
  const nextLabel = () => {
    for (let c = 65; c < 91; c++) if (!a.task.points.some((p) => p.label === String.fromCharCode(c)) && !a.task.read.some((r) => r.label === String.fromCharCode(c))) return String.fromCharCode(c);
    return "";
  };

  return (
    <div class="flex flex-col gap-3 font-sans text-sm text-slate-800">
      <p class="m-0 text-xs text-slate-500">
        <strong class="text-slate-700">{t.mode(mode)}</strong> · {t.modeHint}
      </p>
      <div class="flex flex-wrap items-start gap-4">
        <div class="flex min-w-0 flex-col gap-2">
          <p class="m-0 max-w-[80ch] text-xs text-slate-500">{t.answerHint[mode]} {t.hiddenHint}</p>
          <NumberLine view={view} answer={answerOf(a.task)} onChange={onAnswer} />
        </div>

        <div class="flex min-w-[300px] flex-1 flex-col gap-3">
          <fieldset class={box}>
            <legend class={legend}>{t.tabLine}</legend>
            {raw("min", t.min)}
            {raw("max", t.max)}
            {raw("tickStep", t.tickStep)}
            {raw("labelStep", t.labelStep, t.labelStepHint)}
            <label class="flex items-center justify-between gap-3 text-sm">
              <span class="text-slate-600">{t.format}</span>
              <select class={field} value={a.format} data-testid="format" onChange={(e) => commit({ format: (e.target as HTMLSelectElement).value as Format })}>
                {(["decimal", "fraction", "mixed"] as Format[]).map((f) => <option value={f}>{t.formats[f]}</option>)}
              </select>
            </label>
            <p class="m-0 text-xs text-slate-500" data-testid="hidden">{t.hidden}: {a.hidden.length ? a.hidden.map(fmt).join("; ") : "–"}</p>
          </fieldset>

          <fieldset class={box}>
            <legend class={legend}>{t.tabAnswer}</legend>
            {mode === "points" && (
              <>
                {a.task.points.map((p, i) => (
                  <div class="flex items-center gap-2" data-testid={`def-${i}`}>
                    <span class="h-3 w-3 rounded-full" style={{ background: colorOf(i) }} aria-hidden="true" />
                    <label class="flex items-center gap-1">
                      <span class="text-xs text-slate-500">{t.label}</span>
                      <input value={p.label} class={`${field} w-20`} aria-label={`${t.label} ${i + 1}`}
                        onInput={(e) => setTask({ points: a.task.points.map((q, j) => (j === i ? { ...q, label: (e.target as HTMLInputElement).value } : q)) })} />
                    </label>
                    <span class="tabular-nums text-slate-600">{p.answer === null ? "–" : fmt(p.answer)}</span>
                    <button type="button" class={`${button} ml-auto`} onClick={() => setTask({ points: a.task.points.filter((_, j) => j !== i) })}>{t.removeItem}</button>
                  </div>
                ))}
                <button type="button" class={`${button} self-start`} disabled={a.task.points.length >= MAX_ITEMS}
                  onClick={() => setTask({ points: [...a.task.points, { label: nextLabel(), answer: null }] })}>+ {t.addPoint}</button>
              </>
            )}
            {mode === "jumps" && (
              <label class="flex items-center gap-2">
                <input type="checkbox" checked={a.task.jumps.givenStart} class="accent-amber-600"
                  onChange={() => setTask({ jumps: { ...a.task.jumps, givenStart: !a.task.jumps.givenStart } })} />
                {t.givenStart}
              </label>
            )}
            {mode === "read" && (
              <>
                {a.task.read.map((r, i) => (
                  <div key={`${i}:${r.kind}:${r.value}`} class="flex flex-wrap items-center gap-2" data-testid={`read-def-${i}`}>
                    <select class={field} value={r.kind} aria-label={`${t.readPoint} / ${t.readTick} ${i + 1}`}
                      onChange={(e) => setTask({ read: a.task.read.map((q, j) => (j === i ? { ...q, kind: (e.target as HTMLSelectElement).value as "point" | "tick" } : q)) })}>
                      <option value="point">{t.readPoint}</option>
                      <option value="tick">{t.readTick}</option>
                    </select>
                    {r.kind === "point" && (
                      <input value={r.label} class={`${field} w-14`} aria-label={`${t.label} ${i + 1}`}
                        onInput={(e) => setTask({ read: a.task.read.map((q, j) => (j === i ? { ...q, label: (e.target as HTMLInputElement).value } : q)) })} />
                    )}
                    <input defaultValue={fmt(r.value)} class={`${field} w-20 text-right`} aria-label={`${t.value} ${i + 1}`}
                      onChange={(e) => {
                        const v = parseNumber((e.target as HTMLInputElement).value);
                        if (v !== null) setTask({ read: a.task.read.map((q, j) => (j === i ? { ...q, value: v } : q)) });
                      }} />
                    <button type="button" class={`${button} ml-auto`} onClick={() => setTask({ read: a.task.read.filter((_, j) => j !== i) })}>{t.removeItem}</button>
                  </div>
                ))}
                <div class="flex gap-2">
                  <button type="button" class={button} disabled={a.task.read.length >= MAX_ITEMS}
                    onClick={() => setTask({ read: [...a.task.read, { kind: "point", label: nextLabel(), value: snapTo((line.min + line.max) / 2, line, snapStep(line, settings.snap)) }] })}>+ {t.addReadPoint}</button>
                  <button type="button" class={button} disabled={a.task.read.length >= MAX_ITEMS}
                    onClick={() => setTask({ read: [...a.task.read, { kind: "tick", label: "", value: snapTo((line.min + line.max) / 2, line, line.tickStep) }] })}>+ {t.addReadTick}</button>
                </div>
              </>
            )}
            {mode === "interval" && <p class="m-0 text-xs text-slate-500">{t.answerHint.interval}</p>}
          </fieldset>

          <fieldset class={box}>
            <legend class={legend}>{t.tabScoring}</legend>
            <label class="flex items-center justify-between gap-3 text-sm" title={t.toleranceHint}>
              <span class="text-slate-600">{t.tolerance}</span>
              <input type="number" min={0} step="any" value={a.task.tolerance} class={`${field} w-24 text-right`} data-testid="tolerance"
                onChange={(e) => {
                  const n = Number((e.target as HTMLInputElement).value);
                  if (Number.isFinite(n) && n >= 0) setTask({ tolerance: n });
                }} />
            </label>
            <p class="m-0 text-xs text-slate-500">{t.toleranceHint}</p>
          </fieldset>

          {problems.length > 0 && (
            <ul class="m-0 list-none rounded-lg bg-red-50 p-2 pl-3 text-red-800" data-testid="problems">
              {problems.map((p) => <li key={p}>⚠ {p}</li>)}
            </ul>
          )}
        </div>
      </div>

      <details class="rounded-xl border border-slate-200 p-3">
        <summary class="cursor-pointer select-none font-medium">{t.responseProcessing}</summary>
        <div class="mt-2 flex flex-col gap-2">
          <button type="button" class={`${button} self-start`} data-testid="copy"
            onClick={() => navigator.clipboard?.writeText(xml).then(() => setCopied(true), () => setCopied(false))}>
            {copied ? t.copied : t.copy}
          </button>
          <pre class="m-0 max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100" data-testid="xml">{xml}</pre>
        </div>
      </details>
    </div>
  );
};

export default Authoring;
