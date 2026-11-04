// SPDX-License-Identifier: MIT
// Based on https://github.com/rdncuee/CBP (Code Block Programming Interaction),
// © 2022 The National Center for University Entrance Examinations
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  type AuthorBlock, type AuthorModel, type AuthorTest, type Problem, adaptProgram, authorProblems, braces, distractors, expectedFromSolution,
  settingsOf,
} from "./author";
import { type Kind, type Node, type Settings, KINDS, MAX_BLOCKS, MAX_TESTS, ROLES, evaluateTests, runProgram, usage } from "./blocks";
import { BlockShape, CATEGORY, categoryOf, colours } from "./look";
import Interaction from "./interaction";
import { initStore } from "./store";
import { type AuthorTexts, authorTextsFor, errorMessage, textsFor } from "./texts";

// The authoring mode (the original's creator): the item author edits the blocks, builds the solution and the starting
// program in the candidate's own editor, and writes the input and the test cases. index.tsx turns the model into the
// text settings (author.ts serialize).

/** A problem in the author's language. */
export const problemText = (a: AuthorTexts, language: string, p: Problem, m: AuthorModel): string => {
  const kind = p.block ? m.blocks[p.block - 1]?.kind : undefined;
  const roles = kind ? ROLES[kind].map((r) => a.roles[r]).join(", ") : "";
  const message = p.error ? errorMessage(textsFor(language), p.error) : undefined;
  return a.problem[p.code]({ ...p, roles, message });
};

const field = "min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-2 focus:outline-sky-200";
const button = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50";
const small = "inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-transparent text-slate-600 hover:border-slate-200 hover:bg-white focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-40";

/** The label with part j's braces replaced (inner) or removed (null). */
const withBrace = (label: string, j: number, inner: string | null): string => {
  let k = -1;
  const next = label.replace(/\{[^}]*\}/g, (m) => (++k === j ? (inner === null ? "" : `{${inner}}`) : m));
  return inner === null ? next.replace(/ {2,}/g, " ").trim() : next;
};
type PartType = "text" | "choice" | "fixed";
const typeOf = (inner: string): PartType => (inner.trim() === "" ? "text" : inner.includes("|") ? "choice" : "fixed");
const clean = (text: string) => text.replace(/[{}]/g, "");

const maxId = (program: Node[]): number =>
  program.reduce((m, n) => Math.max(m, parseInt(n.id.slice(1), 10) || 0, maxId(n.body ?? []), maxId(n.other ?? [])), 0);
const renumber = (program: Node[], counter: { n: number }): Node[] =>
  program.map((n) => ({ ...n, id: `n${++counter.n}`, ...(n.body ? { body: renumber(n.body, counter) } : {}), ...(n.other ? { other: renumber(n.other, counter) } : {}) }));

const Authoring = ({ initial, base, language, onChange }: {
  initial: AuthorModel;
  /** The item's other settings (limits, scoring, language of the pseudocode). */
  base: Settings;
  /** The author's language. */
  language: string;
  onChange: (model: AuthorModel) => void;
}) => {
  const a = authorTextsFor(language);
  const t = textsFor(language);
  const newLabels = authorTextsFor(base.language).newLabels;
  const [model, setModel] = useState(initial);
  const [tab, setTab] = useState(0);
  const [newKind, setNewKind] = useState<Kind>("set");
  const [message, setMessage] = useState("");
  const keys = useRef(0);
  const modelRef = useRef(model);
  modelRef.current = model;

  /** The settings of the editors: every block can be added, as often as needed. */
  const editorOf = (m: AuthorModel): Settings => ({ ...settingsOf(m, base), palette: m.blocks.map((b) => b.key), reuse: true, maxBlocks: MAX_BLOCKS });
  const editor = editorOf(model);
  const editorRef = useRef(editor);
  editorRef.current = editor;

  const stores = useMemo(() => ({
    solution: initStore({ program: initial.solution, inputs: "", next: maxId([...initial.solution, ...initial.start]) + 1, run: null }, () => editorRef.current),
    start: initStore({ program: initial.start, inputs: "", next: maxId([...initial.solution, ...initial.start]) + 1, run: null }, () => editorRef.current),
  }), []);

  useEffect(() => {
    const off = [
      stores.solution.subscribe((st) => setModel((m) => (m.solution === st.program ? m : { ...m, solution: st.program })), { immediate: false }),
      stores.start.subscribe((st) => setModel((m) => {
        if (m.start === st.program) return m;
        const ids = new Set<string>();
        const walk = (list: Node[]) => list.forEach((n) => { ids.add(n.id); walk(n.body ?? []); walk(n.other ?? []); });
        walk(st.program);
        return { ...m, start: st.program, locked: m.locked.filter((id) => ids.has(id)) };
      }), { immediate: false }),
    ];
    return () => off.forEach((u) => u());
  }, []);

  // right after the render, so that getProperties() and validate() see every change at once
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    onChange(model);
  }, [model]);

  /** New blocks: the programs follow (nodes of a removed block leave their blocks in place, values fit again). */
  const setBlocks = (blocks: AuthorBlock[]) => {
    const next = { ...modelRef.current, blocks };
    const s = settingsOf(next, base);
    const solution = adaptProgram(s.blocks, stores.solution.getState().program);
    const start = adaptProgram(s.blocks, stores.start.getState().program);
    editorRef.current = editorOf(next);
    stores.solution.dispatch({ type: "RESTORE", payload: { ...stores.solution.getState(), program: solution, run: null } });
    stores.start.dispatch({ type: "RESTORE", payload: { ...stores.start.getState(), program: start, run: null } });
    setModel({ ...next, solution, start, locked: next.locked });
  };
  const editBlock = (i: number, change: Partial<AuthorBlock>) => setBlocks(model.blocks.map((b, j) => (j === i ? { ...b, ...change } : b)));
  const moveBlock = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= model.blocks.length) return;
    const blocks = [...model.blocks];
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    setBlocks(blocks);
    setMessage(a.blockMoved(j + 1));
  };
  const addBlock = () => {
    let key = `a${++keys.current}`;
    while (model.blocks.some((b) => b.key === key)) key = `a${++keys.current}`;
    setBlocks([...model.blocks, { key, kind: newKind, label: newLabels[newKind], elseLabel: "", palette: true }]);
    setMessage(a.blockAdded(model.blocks.length + 1));
  };

  const setTests = (tests: AuthorTest[]) => setModel((m) => ({ ...m, tests }));
  const problems = authorProblems(model, base);
  const errors = problems.filter((p) => p.level === "error");
  const warnings = problems.filter((p) => p.level === "warning");
  const usedInSolution = usage(model.solution);
  const unused = new Set(distractors(model));
  const s = settingsOf(model, base);
  const evaluation = model.solution.length ? evaluateTests(s, model.solution) : null;
  const solutionRun = model.solution.length ? runProgram(s, model.solution, model.inputs) : null;

  const tabs = [a.tabBlocks, a.tabSolution, a.tabStart, a.tabTests];
  const onTabKey = (e: KeyboardEvent) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (tab + delta + tabs.length) % tabs.length;
    setTab(next);
    const root = (e.currentTarget as HTMLElement).getRootNode() as ShadowRoot;
    requestAnimationFrame(() => root.querySelector<HTMLElement>(`#cb-tab-${next}`)?.focus());
  };

  // ─── the blocks ────────────────────────────────────────────────────────────────────────────────────────────────────

  const blockCard = (b: AuthorBlock, i: number) => {
    const n = i + 1;
    const inner = braces(b.label);
    const roles = ROLES[b.kind];
    const block = editor.blocks[b.key];
    const badge = b.palette
      ? (usedInSolution.get(b.key) ? { text: a.inSolution, cls: "bg-emerald-100 text-emerald-800" } : unused.has(b.key) ? { text: a.distractor, cls: "bg-amber-100 text-amber-800" } : null)
      : { text: a.notInPalette, cls: "bg-slate-200 text-slate-700" };
    return (
      <li key={b.key} data-testid={`block-${n}`} className="cb-root relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3 pl-4 shadow-sm">
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: CATEGORY[categoryOf(b.kind)].c }} />
        <div role="group" aria-labelledby={`cb-block-${b.key}`} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span id={`cb-block-${b.key}`} className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{a.block(n)}</span>
            <span className="min-w-0 max-w-full pb-1" data-testid="preview">
              {block ? <span className="inline-flex max-w-full" style={colours(categoryOf(b.kind))}><BlockShape block={block} texts={t} /></span> : <span className="font-mono text-sm">{b.label}</span>}
            </span>
            {badge && <span className={`rounded px-1.5 text-[11px] font-medium ${badge.cls}`} data-testid="badge">{badge.text}</span>}
            <span className="ml-auto flex gap-0.5">
              <button type="button" className={small} aria-label={a.moveBlockUp(n)} disabled={i === 0} onClick={() => moveBlock(i, -1)}>↑</button>
              <button type="button" className={small} aria-label={a.moveBlockDown(n)} disabled={i === model.blocks.length - 1} onClick={() => moveBlock(i, 1)}>↓</button>
              <button type="button" className={`${small} hover:text-red-700`} aria-label={a.removeBlock(n)} onClick={() => {
                setBlocks(model.blocks.filter((_, j) => j !== i));
                setMessage(a.blockRemoved(n));
              }}>✕</button>
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-col gap-1 text-xs text-slate-500">{a.kind}
              <select className={field} value={b.kind} onChange={(e) => editBlock(i, { kind: (e.target as HTMLSelectElement).value as Kind })}>
                {KINDS.map((k) => <option key={k} value={k}>{a.kinds[k]}</option>)}
              </select>
            </label>
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-slate-500">{a.label}
              <input type="text" className={`${field} font-mono`} value={b.label} spellcheck={false} maxLength={200}
                onInput={(e) => editBlock(i, { label: (e.target as HTMLInputElement).value })} />
            </label>
            {b.kind === "ifelse" && (
              <label className="flex w-32 flex-col gap-1 text-xs text-slate-500">{a.elseLabel}
                <input type="text" className={`${field} font-mono`} value={b.elseLabel} placeholder={block?.elseLabel} maxLength={60}
                  onInput={(e) => editBlock(i, { elseLabel: clean((e.target as HTMLInputElement).value).replace(/\|/g, "") })} />
              </label>
            )}
          </div>
          <div className="flex flex-col gap-1.5" role="group" aria-label={`${a.block(n)}: ${a.parts}`}>
            {inner.map((text, j) => {
              const type = typeOf(text);
              const role = j < roles.length - 1 ? a.roles[roles[j]] : j >= roles.length - 1 && roles.length ? a.roles[roles[roles.length - 1]] : "";
              return (
                <div key={j} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-36 shrink-0 text-xs text-slate-600">{a.part(j + 1, role)}</span>
                  <select className={field} aria-label={a.partType(j + 1)} value={type} onChange={(e) => {
                    const next = (e.target as HTMLSelectElement).value as PartType;
                    editBlock(i, { label: withBrace(b.label, j, next === "text" ? "" : next === "choice" ? (type === "fixed" ? `${text}|` : "|") : roles[j] === "name" ? "x" : "0") });
                  }}>
                    <option value="text">{a.textBox}</option>
                    <option value="choice">{a.dropdown}</option>
                    <option value="fixed">{a.fixed}</option>
                  </select>
                  {type !== "text" && (
                    <PartField key={`${b.key}-${j}-${type}`} inner={text} label={type === "choice" ? a.choices(j + 1) : a.fixedText(j + 1)}
                      // a dropdown stays a dropdown while the author types its first choice; fixed text is never empty
                      norm={type === "choice" ? (v) => (v.includes("|") ? v : `${v}|`) : (v) => (v.trim() ? v : "?")}
                      onValue={(value) => editBlock(i, { label: withBrace(b.label, j, value) })} />
                  )}
                  <button type="button" className={small} aria-label={a.removePart(j + 1)} onClick={() => editBlock(i, { label: withBrace(b.label, j, null) })}>✕</button>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" className={button} onClick={() => editBlock(i, { label: `${b.label.trimEnd()} {}` })}>+ {a.addPart}</button>
              <label className="flex min-h-9 items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="size-4 accent-sky-600" checked={b.palette} onChange={(e) => editBlock(i, { palette: (e.target as HTMLInputElement).checked })} />
                {a.inPalette}
              </label>
            </div>
          </div>
        </div>
      </li>
    );
  };

  const blocksPanel = (
    <div className="flex flex-col gap-3">
      <p className="m-0 max-w-[75ch] text-sm text-slate-600">{a.blocksIntro}</p>
      <ol className="m-0 flex list-none flex-col gap-2 p-0" data-testid="author-blocks">{model.blocks.map(blockCard)}</ol>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-slate-500">{a.newBlockKind}
          <select className={field} value={newKind} onChange={(e) => setNewKind((e.target as HTMLSelectElement).value as Kind)}>
            {KINDS.map((k) => <option key={k} value={k}>{a.kinds[k]}</option>)}
          </select>
        </label>
        <button type="button" className={button} onClick={addBlock}>+ {a.addBlock}</button>
      </div>
    </div>
  );

  // ─── the programs ──────────────────────────────────────────────────────────────────────────────────────────────────

  const solutionPanel = (
    <div className="flex flex-col gap-3">
      <p className="m-0 max-w-[75ch] text-sm text-slate-600">{a.solutionIntro}</p>
      <Interaction s={editor} store={stores.solution} texts={t} readOnly={false} author={{ title: a.tabSolution }} />
      <OutputBox title={a.solutionOutput} run={solutionRun} empty={a.noSolution} t={t} />
    </div>
  );

  const locked = new Set(model.locked);
  const startPanel = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="m-0 max-w-[65ch] text-sm text-slate-600">{a.startIntro}</p>
        <button type="button" className={button} disabled={!model.solution.length} onClick={() => {
          const counter = { n: stores.start.getState().next };
          const program = renumber(model.solution, counter);
          stores.start.dispatch({ type: "RESTORE", payload: { program, inputs: "", next: counter.n + 1, run: null } });
          setModel((m) => ({ ...m, locked: [] }));
          setMessage(a.copied);
        }}>{a.copySolution}</button>
      </div>
      <Interaction s={editor} store={stores.start} texts={t} readOnly={false} author={{
        title: a.tabStart,
        lineExtra: (node, _n, text) => (
          <label className={`ml-auto flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs ${locked.has(node.id) ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-white"}`}>
            <input type="checkbox" className="size-4 accent-slate-800" aria-label={a.lock(text)} checked={locked.has(node.id)}
              onChange={(e) => {
                const on = (e.target as HTMLInputElement).checked;
                setModel((m) => ({ ...m, locked: on ? [...m.locked, node.id] : m.locked.filter((id) => id !== node.id) }));
              }} />
            <span aria-hidden="true">{a.locked}</span>
          </label>
        ),
      }} />
    </div>
  );

  // ─── input and tests ───────────────────────────────────────────────────────────────────────────────────────────────

  const lines = (text: string) => text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
  const testsPanel = (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 @xl:grid-cols-[minmax(10rem,16rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-1">
          <label htmlFor="cb-author-inputs" className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{a.inputs}</label>
          <textarea id="cb-author-inputs" rows={3} aria-describedby="cb-author-inputs-help" value={model.inputs} spellcheck={false}
            className={`${field} min-h-20 py-1.5 font-mono`} onInput={(e) => setModel((m) => ({ ...m, inputs: (e.target as HTMLTextAreaElement).value }))} />
          <p id="cb-author-inputs-help" className="m-0 text-xs text-slate-500">{a.inputsHelp}</p>
        </div>
        <OutputBox title={a.solutionOutput} run={solutionRun} empty={a.noSolution} t={t} />
      </div>
      <section aria-labelledby="cb-tests" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="cb-tests" className="m-0 text-xs font-semibold tracking-wide text-slate-500 uppercase">{a.testsHeading}</h3>
          <button type="button" className={button} disabled={!model.solution.length || !model.tests.length} onClick={() => {
            setTests(expectedFromSolution(modelRef.current, base));
            setMessage(a.filled);
          }}>{a.fill}</button>
        </div>
        <p className="m-0 text-sm text-slate-600">{a.testsIntro}</p>
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {model.tests.map((test, i) => {
            const r = evaluation?.results[i];
            return (
              <li key={i} data-testid={`test-${i + 1}`} className="flex flex-wrap items-start gap-2 rounded-xl border border-slate-200 bg-white p-3">
                <span className="w-16 shrink-0 pt-2 text-xs font-semibold text-slate-600">{a.test(i + 1)}</span>
                <textarea rows={2} className={`${field} min-w-[8rem] flex-1 py-1.5 font-mono`} aria-label={a.testInputs(i + 1)} value={test.inputs.join("\n")} spellcheck={false}
                  onInput={(e) => setTests(model.tests.map((x, j) => (j === i ? { ...x, inputs: lines((e.target as HTMLTextAreaElement).value) } : x)))} />
                <span aria-hidden="true" className="pt-2 text-slate-400">→</span>
                <textarea rows={2} className={`${field} min-w-[8rem] flex-1 py-1.5 font-mono`} aria-label={a.testExpected(i + 1)} value={test.expected.join("\n")} spellcheck={false}
                  onInput={(e) => setTests(model.tests.map((x, j) => (j === i ? { ...x, expected: lines((e.target as HTMLTextAreaElement).value) } : x)))} />
                <span className="flex min-w-[7rem] flex-col gap-0.5 pt-1.5 text-xs" data-testid="test-status">
                  {r ? (
                    <span className={`w-fit rounded px-1.5 py-0.5 font-semibold ${r.passed ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{r.passed ? `✓ ${a.passes}` : `✗ ${a.fails}`}</span>
                  ) : <span className="text-slate-500">{a.notChecked}</span>}
                  {r && !r.passed && <span className="text-slate-600">{r.error ? errorMessage(t, r.error) : a.solutionPrinted(r.output.join("; "))}</span>}
                </span>
                <button type="button" className={small} aria-label={a.removeTest(i + 1)} onClick={() => setTests(model.tests.filter((_, j) => j !== i))}>✕</button>
              </li>
            );
          })}
        </ol>
        <div>
          <button type="button" className={button} disabled={model.tests.length >= MAX_TESTS}
            onClick={() => setTests([...model.tests, { inputs: lines(model.inputs), expected: [] }])}>+ {a.addTest}</button>
        </div>
      </section>
    </div>
  );

  const panels = [blocksPanel, solutionPanel, startPanel, testsPanel];

  return (
    <div className="@container flex max-w-full flex-col gap-3 p-1 font-sans text-slate-800">
      <section aria-labelledby="cb-checks" data-testid="checks"
        className={`rounded-xl border p-3 text-sm ${errors.length ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
        <h3 id="cb-checks" className="m-0 text-xs font-semibold tracking-wide text-slate-600 uppercase">
          {a.checks}: <span aria-live="polite">{errors.length ? a.errorsHeading(errors.length) : a.allGood}</span>
        </h3>
        {errors.length > 0 && (
          <ul className="m-0 mt-1 list-disc pl-5 text-red-800" data-testid="errors">
            {errors.map((p, i) => <li key={i}>{problemText(a, language, p, model)}</li>)}
          </ul>
        )}
        {warnings.length > 0 && (
          <div className="mt-1">
            <span className="text-xs font-semibold text-amber-800">{a.warningsHeading}</span>
            <ul className="m-0 list-disc pl-5 text-amber-900" data-testid="warnings">
              {warnings.map((p, i) => <li key={i}>{problemText(a, language, p, model)}</li>)}
            </ul>
          </div>
        )}
      </section>

      <div role="tablist" aria-label={a.tabs} className="flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((name, i) => (
          <button key={i} type="button" role="tab" id={`cb-tab-${i}`} aria-selected={tab === i} aria-controls="cb-panel" tabIndex={tab === i ? 0 : -1}
            className={`-mb-px min-h-10 rounded-t-lg border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-sky-600 ${tab === i ? "border-slate-200 border-b-white bg-white text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            onClick={() => setTab(i)} onKeyDown={(e) => onTabKey(e as unknown as KeyboardEvent)}>
            {name}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="cb-panel" aria-labelledby={`cb-tab-${tab}`}>{panels[tab]}</div>
      <p role="status" className="sr-only" data-testid="author-status">{message}</p>
    </div>
  );
};

/** The text of a part: what the author types, written to the label as norm makes it. */
const PartField = ({ inner, label, norm, onValue }: { inner: string; label: string; norm: (v: string) => string; onValue: (v: string) => void }) => {
  const [text, setText] = useState(inner);
  useEffect(() => {
    if (norm(text) !== inner) setText(inner);
  }, [inner]);
  return (
    <input type="text" className={`${field} min-w-[8rem] flex-1 font-mono`} value={text} spellcheck={false} aria-label={label}
      onInput={(e) => {
        const value = clean((e.target as HTMLInputElement).value);
        setText(value);
        onValue(norm(value));
      }} />
  );
};

const OutputBox = ({ title, run, empty, t }: { title: string; run: ReturnType<typeof runProgram> | null; empty: string; t: ReturnType<typeof textsFor> }) => (
  <div className="flex min-w-0 flex-col gap-1">
    <h4 className="m-0 text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h4>
    <div data-testid="solution-output" className="max-h-48 min-h-16 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-sm leading-6 text-slate-100">
      {!run && <p className="m-0 font-sans text-slate-400">{empty}</p>}
      {run?.output.map((line, i) => <div key={i} className="whitespace-pre-wrap">{line}</div>)}
      {run?.error && <p className="m-0 font-sans text-red-300">⚠ {errorMessage(t, run.error)}</p>}
    </div>
  </div>
);

export default Authoring;
