import { useMemo, useState } from "preact/hooks";
import Canvas, { Outline, Perms, namer } from "./canvas";
import {
  CHECK_TYPES, Card, Check, CheckType, Chart, LABELS, Label, MAX_CARDS, MAX_CHECKS, MAX_SIZE, MIN_SIZE, MODES, Mode, SHAPES, Settings, Shape,
  TEXT_SOURCES, TextSource, alignSolution, baseChart, canonical, effectiveChecks, evaluate, nodeRef, solutionChart,
} from "./flowchart";
import { candidatePerms } from "./interaction";
import { Texts, textsFor } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance): the task, the cards, the chart as the candidate finds it, the
// solution and the checks. The result is data-flowchart (flowchart.ts).

/** The names a check can be about: the cards and the locked blocks with a text. */
const refsOf = (s: Settings, t: Texts) => {
  const { spoken } = namer(s, t);
  const blocks = baseChart(s).nodes.filter((n) => n.locked && !n.slot).map((n) => ({ ref: n.id, name: spoken(n) }));
  return [...s.cards.map((c) => ({ ref: c.id, name: c.text })), ...blocks];
};

/** What keeps the flowchart from being used (getAuthoringInstance validate()). */
export const authoringProblems = (s: Settings, scoring: "match" | "pci", language: string): string[] => {
  const t = textsFor(language);
  const problems: string[] = [];
  if (s.text !== "typed" && !s.cards.length) problems.push(t.problemNoCards);
  if (s.mode === "complete" && !s.chart.nodes.some((n) => n.slot)) problems.push(t.problemNoSlots);
  const solution = solutionChart(s);
  const checks = scoring === "pci" ? effectiveChecks(s) : [];
  if (!solution && (scoring === "match" || checks.some((c) => c.type === "same"))) problems.push(t.problemNoSolution);
  if (scoring === "pci") {
    const refs = new Set(refsOf(s, t).map((r) => r.ref));
    s.checks.forEach((c, i) => {
      const used = c.type === "before" ? [c.a, c.b] : c.type === "branch" ? [c.decision, c.target] : c.type === "cards" ? c.cards ?? [] : [];
      for (const r of used) if (!refs.has(r)) problems.push(t.problemUnknown(i + 1, r));
    });
    if (solution) evaluate(s, solution).results.forEach((r, i) => !r.passed && problems.push(t.problemCheck(i + 1)));
  }
  return problems;
};

const button = "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-sky-600";
const field = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-sky-600";
const iconBtn = "rounded-md px-1.5 py-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-sky-600";
type Tab = "setup" | "cards" | "chart" | "solution" | "checks";
const EMPTY: Chart = { nodes: [], edges: [] };

const newCheck = (type: CheckType, s: Settings): Check => {
  const cards = s.cards.filter((c) => !c.distractor);
  const decision = baseChart(s).nodes.find((n) => n.shape === "decision" && n.locked && !n.slot);
  switch (type) {
    case "before": return { type, a: cards[0]?.id ?? "start", b: cards[1]?.id ?? "end", points: 1 };
    case "branch": return { type, decision: decision?.id ?? cards[0]?.id ?? "", label: "yes", target: cards[0]?.id ?? "end", points: 1 };
    case "cards": return { type, points: 1 };
    default: return { type, points: 1 };
  }
};

const Authoring = ({ initial, language, scoring, onChange }: { initial: Settings; language: string; scoring: "match" | "pci"; onChange: (s: Settings) => void }) => {
  const t = textsFor(language);
  const [settings, setSettings] = useState<Settings>(initial);
  const [tab, setTab] = useState<Tab>("setup");
  const commit = (next: Settings) => {
    setSettings(next);
    onChange(next);
  };
  const s = settings;
  const problems = authoringProblems(s, scoring, language);
  const solution = solutionChart(s);
  const evaluation = useMemo(() => (solution ? evaluate(s, solution) : null), [s]);
  const refs = refsOf(s, t);

  const setChart = (chart: Chart) => commit({ ...s, chart, solution: s.solution ? alignSolution(chart, s.solution) : null });
  const setMode = (mode: Mode) => commit({ ...s, mode, arrows: mode === "free" ? true : mode === "order" ? false : s.arrows });

  // --- cards
  const setCard = (i: number, card: Card) => commit({ ...s, cards: s.cards.map((c, k) => (k === i ? card : c)) });
  const addCard = () => {
    let n = s.cards.length + 1;
    while (s.cards.some((c) => c.id === `c${n}`)) n++;
    commit({ ...s, cards: [...s.cards, { id: `c${n}`, text: "" }] });
  };
  const removeCard = (i: number) => {
    const id = s.cards[i].id;
    const strip = (c: Chart | null): Chart | null => c && { ...c, nodes: c.nodes.map((n) => (n.card === id ? (({ card: _, ...rest }) => rest)(n) : n)) };
    commit({ ...s, cards: s.cards.filter((_, k) => k !== i), chart: strip(s.chart)!, solution: strip(s.solution) });
  };
  const moveCard = (i: number, d: number) => {
    const cards = [...s.cards];
    [cards[i], cards[i + d]] = [cards[i + d], cards[i]];
    commit({ ...s, cards });
  };

  // --- checks
  const setCheck = (i: number, check: Check | null) => {
    const checks = [...s.checks];
    if (check) checks[i] = check;
    else checks.splice(i, 1);
    commit({ ...s, checks });
  };
  const RefSelect = ({ value, onChange: change, testid, decisions }: { value: string; onChange: (v: string) => void; testid: string; decisions?: boolean }) => {
    const list = decisions ? refs.filter((r) => baseChart(s).nodes.some((n) => nodeRef(n) === r.ref && n.shape === "decision") || s.cards.some((c) => c.id === r.ref && c.shape === "decision")) : refs;
    const options = list.some((r) => r.ref === value) ? list : [{ ref: value, name: value }, ...list];
    return (
      <select className={`${field} max-w-[220px]`} value={value} data-testid={testid} onChange={(e) => change((e.target as HTMLSelectElement).value)}>
        {options.map((r) => <option key={r.ref} value={r.ref}>{r.name}</option>)}
      </select>
    );
  };
  const checkEditor = (check: Check, i: number) => {
    const passed = evaluation?.results[i]?.passed;
    return (
      <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2" data-testid={`check-${i}`}>
        <span className={`grid size-6 place-items-center rounded-full text-xs font-bold ${passed === undefined ? "bg-slate-100 text-slate-400" : passed ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
          aria-label={passed === undefined ? t.noSolution : passed ? "✓" : "✗"}>{passed === undefined ? i + 1 : passed ? "✓" : "✗"}</span>
        <span className="font-mono text-xs text-slate-500">check{i + 1}</span>
        <select className={field} value={check.type} data-testid={`check-${i}-type`} aria-label={`check${i + 1}`}
          onChange={(e) => setCheck(i, newCheck((e.target as HTMLSelectElement).value as CheckType, s))}>
          {CHECK_TYPES.map((type) => <option key={type} value={type}>{t.checkName[type]}</option>)}
        </select>
        {check.type === "before" && (
          <>
            <RefSelect value={check.a} testid={`check-${i}-a`} onChange={(a) => setCheck(i, { ...check, a })} />
            <span aria-hidden="true" className="text-slate-400">→</span>
            <RefSelect value={check.b} testid={`check-${i}-b`} onChange={(b) => setCheck(i, { ...check, b })} />
          </>
        )}
        {check.type === "branch" && (
          <>
            <RefSelect value={check.decision} decisions testid={`check-${i}-decision`} onChange={(decision) => setCheck(i, { ...check, decision })} />
            <select className={field} value={check.label} data-testid={`check-${i}-label`} onChange={(e) => setCheck(i, { ...check, label: (e.target as HTMLSelectElement).value as Label })}>
              {LABELS.map((l) => <option key={l} value={l}>{t.label[l]}</option>)}
            </select>
            <span aria-hidden="true" className="text-slate-400">→</span>
            <RefSelect value={check.target} testid={`check-${i}-target`} onChange={(target) => setCheck(i, { ...check, target })} />
            <label className="inline-flex items-center gap-1 text-xs">
              <input type="checkbox" checked={check.direct !== false} onChange={(e) => setCheck(i, { ...check, direct: (e.target as HTMLInputElement).checked ? undefined : false })} />
              {t.direct}
            </label>
          </>
        )}
        {check.type === "cards" && (
          <label className="inline-flex items-center gap-1 text-xs">
            <input type="checkbox" checked={!!check.exact} onChange={(e) => setCheck(i, { ...check, exact: (e.target as HTMLInputElement).checked || undefined })} />
            {t.anyCard}, {t.exact}
          </label>
        )}
        <label className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500">
          {t.points}
          <input type="number" min={0} max={10} className={`${field} w-14`} value={check.points ?? 1} data-testid={`check-${i}-points`}
            onInput={(e) => setCheck(i, { ...check, points: Math.max(0, Math.round(Number((e.target as HTMLInputElement).value) || 0)) })} />
        </label>
        <button type="button" className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-rose-50 hover:text-rose-700" onClick={() => setCheck(i, null)}
          data-testid={`check-${i}-remove`}>{t.removeCheck}</button>
      </li>
    );
  };

  const sizeField = (side: "columns" | "rows") => (
    <label className="flex items-center gap-2">
      <span className="text-xs text-slate-500">{side === "rows" && s.mode === "order" ? t.rowsOrder : t[side]}</span>
      <input type="number" min={side === "rows" ? 2 : MIN_SIZE} max={MAX_SIZE} value={s[side]} data-testid={side} className={`${field} w-16`}
        onChange={(e) => {
          const n = Math.min(MAX_SIZE, Math.max(side === "rows" ? 2 : MIN_SIZE, Math.round(Number((e.target as HTMLInputElement).value))));
          if (Number.isFinite(n) && n !== s[side]) commit({ ...s, [side]: n });
        }} />
    </label>
  );

  const tabs: [Tab, string][] = [["setup", t.tabSetup], ["cards", t.tabCards], ...(s.mode === "order" ? [] : [["chart", t.tabChart] as [Tab, string]]), ["solution", t.tabSolution], ["checks", t.tabChecks]];
  const authorPerms: Perms = { addBlocks: true, arrows: true, cards: false, typed: true, author: true };
  const solutionSettings = { ...s, shuffle: false };

  return (
    <div className="flex flex-col gap-3 font-sans text-sm text-slate-800">
      <div role="tablist" className="inline-flex self-start rounded-lg bg-slate-100 p-1">
        {tabs.map(([id, name]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} data-testid={`tab-${id}`} onClick={() => setTab(id)}
            className="rounded-md px-3 py-1 text-sm text-slate-600 aria-selected:bg-white aria-selected:text-slate-900 aria-selected:shadow-sm">{name}</button>
        ))}
      </div>

      {tab === "setup" && (
        <div className="flex max-w-[640px] flex-col gap-3" role="tabpanel">
          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{t.mode}</legend>
            {MODES.map((m) => (
              <label key={m} className="inline-flex items-center gap-2">
                <input type="radio" name="mode" value={m} checked={s.mode === m} data-testid={`mode-${m}`} onChange={() => setMode(m)} />
                {t.modeName[m]}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{t.textSource}</span>
            <select className={`${field} self-start`} value={s.text} data-testid="text-source" disabled={s.mode === "order"}
              onChange={(e) => commit({ ...s, text: (e.target as HTMLSelectElement).value as TextSource })}>
              {TEXT_SOURCES.map((x) => <option key={x} value={x}>{t.textSourceName[x]}</option>)}
            </select>
          </label>
          {s.mode === "complete" && (
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={s.arrows} data-testid="arrows" onChange={(e) => commit({ ...s, arrows: (e.target as HTMLInputElement).checked })} />
              {t.arrowsOption}
            </label>
          )}
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={s.shuffle} data-testid="shuffle" onChange={(e) => commit({ ...s, shuffle: (e.target as HTMLInputElement).checked })} />
            {t.shuffleOption}
          </label>
          <div className="flex flex-wrap items-center gap-3">
            {s.mode !== "order" && sizeField("columns")}
            {sizeField("rows")}
          </div>
          <p className="m-0 text-xs text-slate-500">{scoring === "pci" ? t.scoringPci : t.scoringMatch}</p>
        </div>
      )}

      {tab === "cards" && (
        <div className="flex max-w-[720px] flex-col gap-2" role="tabpanel">
          <p className="m-0 text-xs text-slate-500">{t.cardsHint}</p>
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {s.cards.map((c, i) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-1.5" data-testid={`card-row-${i}`}>
                <span className="w-7 text-right font-mono text-xs text-slate-400">{c.id}</span>
                <input className={`${field} min-w-[200px] flex-1`} value={c.text} aria-label={t.cardText(i + 1)} maxLength={120} data-testid={`card-text-${i}`}
                  onInput={(e) => setCard(i, { ...c, text: (e.target as HTMLInputElement).value })} />
                <select className={field} value={c.shape ?? "step"} aria-label={t.cardShape(i + 1)} data-testid={`card-shape-${i}`}
                  onChange={(e) => {
                    const shape = (e.target as HTMLSelectElement).value as Shape;
                    const { shape: _, ...rest } = c;
                    setCard(i, shape === "step" ? rest : { ...rest, shape });
                  }}>
                  {SHAPES.map((x) => <option key={x} value={x}>{t.shape[x]}</option>)}
                </select>
                <label className="inline-flex items-center gap-1 text-xs" title={t.distractorHint}>
                  <input type="checkbox" checked={!!c.distractor} data-testid={`card-distractor-${i}`}
                    onChange={(e) => {
                      const { distractor: _, ...rest } = c;
                      setCard(i, (e.target as HTMLInputElement).checked ? { ...rest, distractor: true } : rest);
                    }} />
                  {t.distractor}
                </label>
                <button type="button" className={iconBtn} aria-label={`${t.moveUp}: ${c.text}`} disabled={i === 0} onClick={() => moveCard(i, -1)}>↑</button>
                <button type="button" className={iconBtn} aria-label={`${t.moveDown}: ${c.text}`} disabled={i === s.cards.length - 1} onClick={() => moveCard(i, 1)}>↓</button>
                <button type="button" className={iconBtn} aria-label={`${t.remove}: ${c.text}`} onClick={() => removeCard(i)}>✕</button>
              </li>
            ))}
          </ol>
          <button type="button" className={`${button} self-start`} disabled={s.cards.length >= MAX_CARDS} data-testid="add-card" onClick={addCard}>+ {t.addCard}</button>
        </div>
      )}

      {tab === "chart" && (
        <div className="flex flex-col gap-2" role="tabpanel">
          <p className="m-0 max-w-[80ch] text-xs text-slate-500">{t.chartHint}</p>
          <Canvas key="chart" settings={s} chart={s.chart} start={EMPTY} texts={t} perms={authorPerms} onChange={setChart} testid="chart-editor" label={t.tabChart} />
        </div>
      )}

      {tab === "solution" && (
        <div className="flex flex-col gap-2" role="tabpanel">
          {s.mode === "order" ? (
            <>
              <p className="m-0 text-xs text-slate-500">{t.solutionOrder}</p>
              <ol className="m-0 pl-5" data-testid="order-solution">{s.cards.filter((c) => !c.distractor).map((c) => <li key={c.id}>{c.text}</li>)}</ol>
              {solution && <Outline chart={solution} settings={s} texts={t} testid="solution-outline" />}
            </>
          ) : (
            <>
              <p className="m-0 max-w-[80ch] text-xs text-slate-500">{t.solutionHint}</p>
              <Canvas key="solution" settings={solutionSettings} chart={s.solution ?? baseChart(s)} start={baseChart(s)} texts={t} perms={candidatePerms(s)}
                onChange={(chart) => commit({ ...s, solution: chart })} testid="solution-editor" label={t.tabSolution} />
              <button type="button" className={`${button} self-start`} disabled={!s.solution} onClick={() => commit({ ...s, solution: null })} data-testid="clear-solution">{t.clearSolution}</button>
            </>
          )}
        </div>
      )}

      {tab === "checks" && (
        <div className="flex flex-col gap-2" role="tabpanel">
          <p className="m-0 max-w-[80ch] text-xs text-slate-500">{t.checksHint}</p>
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">{s.checks.map(checkEditor)}</ol>
          <button type="button" className={`${button} self-start`} disabled={s.checks.length >= MAX_CHECKS} data-testid="add-check"
            onClick={() => commit({ ...s, checks: [...s.checks, newCheck("same", s)] })}>+ {t.addCheck}</button>
        </div>
      )}

      {solution && (
        <p className="m-0 text-xs text-slate-500">
          {t.graph}: <code className="rounded bg-slate-100 px-1 py-0.5 break-all text-slate-700" data-testid="graph">{canonical(s, solution)}</code>
        </p>
      )}
      <p className="m-0 text-slate-600" data-testid="summary">
        {evaluation ? t.summary(evaluation.score, evaluation.maxscore) : t.noSolution}
        {problems.map((p) => <span key={p} className="ml-2 text-rose-600">{p}</span>)}
      </p>
    </div>
  );
};

export default Authoring;
