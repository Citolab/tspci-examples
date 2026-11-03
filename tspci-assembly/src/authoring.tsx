import { useMemo, useState } from "preact/hooks";
import { useStore } from "@citolab/preact-store";
import {
  Assembly, COLOR_NAMES, ColorName, EXAMPLE_IDS, FEEDBACKS, ID, MAX_PARTS, Part, SCORINGS, SHAPES, SIZE_FIELDS, Shape, TASKS, Vec, assemblyOrder,
  correctSequence, countOrders, evaluate, exampleAssembly, findCycle, firstValidOrder, nameOf, parsePart, textIn,
} from "./assembly";
import Interaction from "./interaction";
import { initStore } from "./store";
import { formatNumber, textsFor } from "./texts";
import View3D from "./view";

// The authoring mode (index.tsx getAuthoringInstance): the product (an example, or parts made of the built-in
// shapes), the order rules, the task, the feedback and the scoring, and a run through the task to set the correct
// order. The result is data-assembly (assembly.ts).

/** What keeps the assembly from being used (getAuthoringInstance validate()), in the author's language. */
export const authoringProblems = (a: Assembly, language: string): string[] => {
  const t = textsFor(language);
  const problems: string[] = [];
  if (a.parts.length < 2) problems.push(t.problemNoParts);
  const seen = new Set<string>();
  for (const x of a.parts) {
    if (!ID.test(x.id)) problems.push(t.problemId(x.id));
    else if (seen.has(x.id)) problems.push(t.problemDuplicate(x.id));
    seen.add(x.id);
    if (!textIn(x.name, "en").trim() && !textIn(x.name, "nl").trim()) problems.push(t.problemNoName(x.id));
  }
  const cycle = findCycle(a.parts);
  if (cycle) problems.push(t.problemCycle(cycle.map((id) => nameOfId(a, id, language)).join(" → ")));
  if (a.scoring === "pci" && evaluate(a, []).maxscore === 0) problems.push(t.problemNoPoints);
  return [...new Set(problems)];
};

const nameOfId = (a: Assembly, id: string, language: string) => {
  const part = a.parts.find((x) => x.id === id);
  return part ? nameOf(part, language) : id;
};

const button =
  "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-sky-600";
const field = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-sky-600";
type Tab = "product" | "rules" | "task" | "try";

/** A number field in the author's language (a decimal comma in Dutch); it commits on change. */
const NumberField = ({ value, onChange, label, language, testid, width = "w-16" }: {
  value: number; onChange: (n: number) => void; label: string; language: string; testid?: string; width?: string;
}) => (
  <input type="text" inputMode="decimal" className={`${field} ${width} tabular-nums`} aria-label={label} title={label} data-testid={testid}
    value={formatNumber(value, language)}
    onChange={(e) => {
      const n = Number((e.target as HTMLInputElement).value.trim().replace(",", "."));
      if (Number.isFinite(n)) onChange(n);
      else (e.target as HTMLInputElement).value = formatNumber(value, language);
    }} />
);

/** Three numbers (x, y, z). */
const VecField = ({ value, onChange, label, language, testid }: { value: Vec; onChange: (v: Vec) => void; label: string; language: string; testid?: string }) => (
  <span className="inline-flex gap-1">
    {(["x", "y", "z"] as const).map((axis, k) => (
      <NumberField key={axis} value={value[k]} language={language} label={`${label}: ${axis}`} width="w-14" testid={testid && `${testid}-${axis}`}
        onChange={(n) => onChange(value.map((v, j) => (j === k ? n : v)) as Vec)} />
    ))}
  </span>
);

const vecsText = (vs: Vec[] | undefined, language: string) => (vs ?? []).map((v) => v.map((n) => formatNumber(n, language)).join(" ")).join("; ");
const parseVecs = (s: string): Vec[] =>
  s.split(";").map((chunk) => chunk.trim().split(/\s+/).map((n) => Number(n.replace(",", ".")))).filter((v) => v.length === 3 && v.every(Number.isFinite)) as Vec[];

/** The rules as a graph: a column per depth, an arrow from a part to the parts that come after it. */
const Graph = ({ a, language, picked, onPick }: { a: Assembly; language: string; picked: string | null; onPick: (id: string) => void }) => {
  const t = textsFor(language);
  const depth = new Map<string, number>();
  const depthOf = (id: string, seen: Set<string> = new Set()): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0; // a cycle: validate() reports it
    seen.add(id);
    const part = a.parts.find((x) => x.id === id);
    const d = part && part.after.length ? 1 + Math.max(...part.after.map((p) => depthOf(p, seen))) : 0;
    depth.set(id, d);
    return d;
  };
  a.parts.forEach((x) => depthOf(x.id));
  const deepest = Math.max(0, ...a.parts.map((x) => depth.get(x.id)!));
  const columns: string[][] = Array.from({ length: deepest + 1 }, () => []);
  a.parts.forEach((x) => columns[depth.get(x.id)!].push(x.id));
  while (columns.length > 1 && !columns[columns.length - 1].length) columns.pop();
  const W = 150, H = 34, GX = 46, GY = 12;
  const pos = new Map<string, { x: number; y: number }>();
  columns.forEach((col, c) => col.forEach((id, r) => pos.set(id, { x: 8 + c * (W + GX), y: 8 + r * (H + GY) })));
  const width = 16 + columns.length * (W + GX) - GX;
  const height = 16 + Math.max(1, ...columns.map((c) => c.length)) * (H + GY) - GY;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="max-w-none" role="group" aria-label={t.graph} data-testid="graph">
      <defs>
        <marker id="asm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" fill="#475569" />
        </marker>
      </defs>
      {a.parts.flatMap((x) =>
        x.after.filter((p) => pos.has(p)).map((p) => {
          const from = pos.get(p)!, to = pos.get(x.id)!;
          const x1 = from.x + W, y1 = from.y + H / 2, x2 = to.x - 2, y2 = to.y + H / 2;
          const mid = (x1 + x2) / 2;
          return <path key={`${p}-${x.id}`} d={`M${x1} ${y1}C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`} fill="none" stroke="#64748b" stroke-width="1.4" marker-end="url(#asm-arrow)" />;
        })
      )}
      {a.parts.map((x) => {
        const p = pos.get(x.id)!;
        const on = picked === x.id;
        const label = nameOf(x, language);
        return (
          <g key={x.id} transform={`translate(${p.x} ${p.y})`} role="button" tabIndex={0} aria-pressed={on} data-testid={`node-${x.id}`}
            aria-label={t.graphNode(label, t.list(x.after.map((id) => nameOfId(a, id, language))))} className="cursor-pointer focus:outline-none"
            onClick={() => onPick(x.id)} onKeyDown={(e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick(x.id))}>
            <rect width={W} height={H} rx="8" fill={on ? "#e0f2fe" : "#fff"} stroke={on ? "#0369a1" : "#cbd5e1"} stroke-width={on ? 2.5 : 1.2}
              stroke-dasharray={on ? "5 3" : undefined} />
            <text x={W / 2} y={H / 2 + 4.5} text-anchor="middle" font-size="12.5" fill="#0f172a">{label.length > 21 ? `${label.slice(0, 20)}…` : label}</text>
          </g>
        );
      })}
    </svg>
  );
};

/** The "Try it" tab: the candidate's view with its own store, and the order made the correct one. */
const TryIt = ({ a, language, candidateLanguage, onUseOrder }: { a: Assembly; language: string; candidateLanguage: string; onUseOrder: (order: string[]) => void }) => {
  const t = textsFor(language);
  const store = useMemo(() => initStore({ sequence: [], blocked: 0 }), []);
  const { sequence } = useStore(store);
  const e = evaluate(a, sequence);
  return (
    <div className="flex flex-col gap-2" role="tabpanel">
      <p className="m-0 text-xs text-slate-500">{t.tryHint}</p>
      <Interaction prompt="" assembly={a} store={store} texts={textsFor(candidateLanguage)} language={candidateLanguage} readOnly={false} testid="try" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={button} disabled={!e.valid} data-testid="use-order"
          onClick={() => onUseOrder(a.task === "assemble" ? sequence : [...sequence].reverse())}>{t.useOrder}</button>
        {sequence.length > 0 && !e.valid && <span className="text-xs text-slate-500">{t.tryInvalid}</span>}
      </div>
    </div>
  );
};

const Authoring = ({ initial, language, candidateLanguage, onChange }: { initial: Assembly; language: string; candidateLanguage: string; onChange: (a: Assembly) => void }) => {
  const t = textsFor(language);
  const [a, setA] = useState<Assembly>(initial);
  const [tab, setTab] = useState<Tab>("product");
  const [exploded, setExploded] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [graphStatus, setGraphStatus] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const commit = (next: Assembly) => {
    setA(next);
    onChange(next);
  };
  const problems = authoringProblems(a, language);
  const cyclic = !!findCycle(a.parts);
  const orders = useMemo(() => (cyclic ? 0 : countOrders(a.parts, 100000)), [a.parts]);
  const order = cyclic ? null : assemblyOrder(a);
  const correct = cyclic ? null : correctSequence(a);
  const evaluation = correct ? evaluate(a, correct) : null;
  const name = (id: string) => nameOfId(a, id, language);

  const setPart = (i: number, part: Part) => {
    const before = a.parts[i];
    let parts = a.parts.map((x, j) => (j === i ? part : x));
    let { order, first } = a;
    if (before.id !== part.id) {
      // a new id: the rules, the order and the first part follow
      parts = parts.map((x) => ({ ...x, after: x.after.map((p) => (p === before.id ? part.id : p)) }));
      order = order.map((p) => (p === before.id ? part.id : p));
      if (first === before.id) first = part.id;
    }
    commit({ ...a, parts, order, first, example: "" });
  };
  const removePart = (i: number) => {
    const id = a.parts[i].id;
    commit({
      ...a, example: "",
      parts: a.parts.filter((_, j) => j !== i).map((x) => ({ ...x, after: x.after.filter((p) => p !== id) })),
      order: a.order.filter((p) => p !== id), first: a.first === id ? "" : a.first,
    });
  };
  const movePart = (i: number, d: number) => {
    const parts = [...a.parts];
    const j = i + d;
    if (j < 0 || j >= parts.length) return;
    [parts[i], parts[j]] = [parts[j], parts[i]];
    commit({ ...a, parts });
  };
  const addPart = () => {
    let n = a.parts.length + 1;
    while (a.parts.some((x) => x.id === `part${n}`)) n++;
    const part = parsePart({ id: `part${n}`, name: { en: t.partN(n), nl: textsFor("nl").partN(n) }, shape: "box", at: [0, 0, 0] }, n)!;
    commit({ ...a, example: "", parts: [...a.parts, part] });
  };
  const toggleAfter = (id: string, before: string) => {
    commit({
      ...a, example: "",
      parts: a.parts.map((x) => (x.id === id ? { ...x, after: x.after.includes(before) ? x.after.filter((p) => p !== before) : [...x.after, before] } : x)),
    });
  };
  const pickNode = (id: string) => {
    if (!picked) {
      setPicked(id);
      setGraphStatus(t.graphPicked(name(id)));
    } else {
      if (picked !== id) toggleAfter(picked, id);
      setPicked(null);
      setGraphStatus(picked !== id ? t.needs(name(picked)) + " " + (t.list((a.parts.find((x) => x.id === picked)?.after ?? []).map(name)) || "—") : "");
    }
  };

  const partEditor = (part: Part, i: number) => {
    const fields = SIZE_FIELDS[part.shape];
    const set = (changes: Partial<Part>) => setPart(i, { ...part, ...changes });
    const nameText = (lang: "en" | "nl") => (typeof part.name === "string" ? (lang === "en" ? part.name : "") : part.name[lang] ?? "");
    const setName = (lang: "en" | "nl", value: string) => {
      const current = typeof part.name === "string" ? { en: part.name } : { ...part.name };
      set({ name: { ...current, [lang]: value } });
    };
    return (
      <li key={i} className={`flex flex-col gap-1.5 rounded-lg border bg-white p-2 ${hover === part.id ? "border-sky-400" : "border-slate-200"}`}
        onMouseEnter={() => setHover(part.id)} onMouseLeave={() => setHover(null)} data-testid={`part-${i}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-5 text-right text-xs text-slate-400">{i + 1}</span>
          <input className={`${field} w-28 font-mono text-xs`} value={part.id} aria-label={`${t.id} ${i + 1}`} data-testid={`part-${i}-id`}
            aria-invalid={!ID.test(part.id) || a.parts.some((x, j) => j !== i && x.id === part.id)}
            onChange={(e) => set({ id: (e.target as HTMLInputElement).value.trim() })} />
          <input className={`${field} w-40`} value={nameText("en")} aria-label={`${t.nameEn} ${i + 1}`} placeholder={t.nameEn} data-testid={`part-${i}-en`}
            onChange={(e) => setName("en", (e.target as HTMLInputElement).value)} />
          <input className={`${field} w-40`} value={nameText("nl")} aria-label={`${t.nameNl} ${i + 1}`} placeholder={t.nameNl} data-testid={`part-${i}-nl`}
            onChange={(e) => setName("nl", (e.target as HTMLInputElement).value)} />
          <select className={field} value={part.shape} aria-label={`${t.shape} ${i + 1}`} data-testid={`part-${i}-shape`}
            onChange={(e) => setPart(i, parsePart({ ...part, shape: (e.target as HTMLSelectElement).value as Shape, size: [] }, i)!)}>
            {SHAPES.map((s) => <option key={s} value={s}>{t.shapeName[s]}</option>)}
          </select>
          <select className={field} value={part.color} aria-label={`${t.color} ${i + 1}`} onChange={(e) => set({ color: (e.target as HTMLSelectElement).value as ColorName })}>
            {COLOR_NAMES.map((c) => <option key={c} value={c}>{t.colorName[c]}</option>)}
          </select>
          <span className="ml-auto inline-flex gap-1">
            <button type="button" className={`${button} px-2 py-1 text-xs`} aria-label={`${t.moveUp}: ${nameOf(part, language)}`} disabled={i === 0} onClick={() => movePart(i, -1)}>↑</button>
            <button type="button" className={`${button} px-2 py-1 text-xs`} aria-label={`${t.moveDown}: ${nameOf(part, language)}`} disabled={i === a.parts.length - 1} onClick={() => movePart(i, 1)}>↓</button>
            <button type="button" className={`${button} px-2 py-1 text-xs hover:bg-rose-50 hover:text-rose-700`} aria-label={`${t.removePart}: ${nameOf(part, language)}`}
              data-testid={`part-${i}-remove`} onClick={() => removePart(i)}>{t.removePart}</button>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">{t.size}
            {fields.map((f, k) => (
              <NumberField key={f} value={part.size[k]} language={language} label={`${t.sizeField[f]} ${i + 1}`} width="w-14" testid={`part-${i}-size-${k}`}
                onChange={(n) => set({ size: part.size.map((v, j) => (j === k ? Math.max(0.01, n) : v)) })} />
            ))}
          </span>
          <span className="inline-flex items-center gap-1">{t.at} <VecField value={part.at} language={language} label={`${t.at} ${i + 1}`} testid={`part-${i}-at`} onChange={(at) => set({ at })} /></span>
          <span className="inline-flex items-center gap-1">{t.start}
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={!part.start} onChange={(e) => {
                const { start, ...rest } = part;
                setPart(i, (e.target as HTMLInputElement).checked ? rest : { ...rest, start: [part.at[0], part.at[1] + 3, part.at[2]] });
              }} />
              {t.autoStart}
            </label>
            {part.start && <VecField value={part.start} language={language} label={`${t.start} ${i + 1}`} onChange={(start) => set({ start })} />}
          </span>
          <span className="inline-flex items-center gap-1">{t.turn} <VecField value={part.turn ?? [0, 0, 0]} language={language} label={`${t.turn} ${i + 1}`}
            onChange={(turn) => {
              const { turn: _, ...rest } = part;
              setPart(i, turn.some((v) => v !== 0) ? { ...rest, turn } : rest);
            }} /></span>
          <label className="inline-flex items-center gap-1">{t.copies}
            <input className={`${field} w-44 text-xs`} value={vecsText(part.copies, language)} onChange={(e) => {
              const copies = parseVecs((e.target as HTMLInputElement).value);
              const { copies: _, ...rest } = part;
              setPart(i, copies.length ? { ...rest, copies } : rest);
            }} />
          </label>
        </div>
      </li>
    );
  };

  const tabs: [Tab, string][] = [["product", t.tabProduct], ["rules", t.tabRules], ["task", t.tabTask], ["try", t.tabTry]];
  const allIds = new Set(a.parts.map((x) => x.id));
  const textField = (value: string, onInput: (v: string) => void, label: string, testid: string, width = "w-56") => (
    <label className="inline-flex items-center gap-2">
      <span className="text-xs text-slate-500">{label}</span>
      <input className={`${field} ${width}`} value={value} data-testid={testid} onChange={(e) => onInput((e.target as HTMLInputElement).value)} />
    </label>
  );
  const titleOf = (lang: "en" | "nl") => (typeof a.title === "string" ? (lang === "en" ? a.title : "") : a.title[lang] ?? "");
  const setTitle = (lang: "en" | "nl", v: string) => commit({ ...a, title: { ...(typeof a.title === "string" ? { en: a.title } : a.title), [lang]: v } });

  return (
    <div className="flex flex-col gap-3 font-sans text-sm text-slate-800">
      <div role="tablist" className="inline-flex self-start rounded-lg bg-slate-100 p-1">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} data-testid={`tab-${id}`} onClick={() => setTab(id)}
            className="rounded-md px-3 py-1 text-sm text-slate-600 aria-selected:bg-white aria-selected:text-slate-900 aria-selected:shadow-sm">{label}</button>
        ))}
      </div>

      {tab === "product" && (
        <div className="flex flex-col gap-2" role="tabpanel">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">{t.example}</span>
            {EXAMPLE_IDS.map((id) => (
              <button key={id} type="button" className={button} aria-pressed={a.example === id} data-testid={`example-${id}`}
                onClick={() => commit({ ...exampleAssembly(id), task: a.task, feedback: a.feedback, scoring: a.scoring, points: a.points })}>{t.exampleName[id]}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {textField(titleOf("en"), (v) => setTitle("en", v), `${t.title} (EN)`, "title-en", "w-44")}
            {textField(titleOf("nl"), (v) => setTitle("nl", v), `${t.title} (NL)`, "title-nl", "w-44")}
            {textField(a.gltf, (v) => commit({ ...a, gltf: v.trim() }), t.gltf, "gltf", "w-72")}
          </div>
          <p className="m-0 text-xs text-slate-500">{t.gltfHint}</p>
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-[300px] flex-[1_1_380px]">
              <View3D parts={a.parts} assembled={exploded ? new Set() : allIds} highlight={hover} gltf={a.gltf} interactive={false}
                texts={t} onPick={() => { }} onHover={setHover} testid="preview" />
              <div role="radiogroup" className="mt-1.5 inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
                {[false, true].map((v) => (
                  <button key={String(v)} type="button" role="radio" aria-checked={exploded === v} onClick={() => setExploded(v)}
                    className="rounded-md px-2.5 py-1 text-slate-600 aria-checked:bg-white aria-checked:text-slate-900 aria-checked:shadow-sm">
                    {v ? t.start.replace(/ \(.*/, "") : t.at.replace(/ \(.*/, "")}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">{a.parts.map(partEditor)}</ol>
          <div>
            <button type="button" className={button} onClick={addPart} disabled={a.parts.length >= MAX_PARTS} data-testid="add-part">+ {t.addPart}</button>
          </div>
        </div>
      )}

      {tab === "rules" && (
        <div className="flex flex-col gap-3" role="tabpanel">
          <p className="m-0 text-xs text-slate-500">{t.rulesHint}</p>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {a.parts.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2" data-testid={`rules-${x.id}`}>
                <span className="mr-1 min-w-40 font-medium" id={`asm-rule-${x.id}`}>{t.needs(nameOf(x, language))}</span>
                <span role="group" aria-labelledby={`asm-rule-${x.id}`} className="flex flex-wrap gap-1">
                  {a.parts.filter((y) => y.id !== x.id).map((y) => {
                    const on = x.after.includes(y.id);
                    return (
                      <button key={y.id} type="button" aria-pressed={on} onClick={() => toggleAfter(x.id, y.id)}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${on ? "border-sky-700 bg-sky-700 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}>
                        <span aria-hidden="true">{on ? "✓" : "+"}</span>{nameOf(y, language)}
                      </button>
                    );
                  })}
                </span>
              </li>
            ))}
          </ul>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
            <Graph a={a} language={language} picked={picked} onPick={pickNode} />
          </div>
          <p className="m-0 min-h-5 text-xs text-slate-600" role="status" aria-live="polite">{graphStatus}</p>
        </div>
      )}

      {tab === "task" && (
        <div className="flex flex-col gap-3" role="tabpanel">
          {([
            ["task", t.task, TASKS, t.taskName],
            ["feedback", t.feedback, FEEDBACKS, t.feedbackName],
            ["scoring", t.scoring, SCORINGS, t.scoringName],
          ] as const).map(([key, legend, options, names]) => (
            <fieldset key={key} className="m-0 flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-2">
              <legend className="px-1 text-xs font-medium text-slate-500">{legend}</legend>
              {(options as readonly string[]).map((o) => (
                <label key={o} className="inline-flex items-center gap-2">
                  <input type="radio" name={`asm-${key}`} value={o} checked={a[key] === o} data-testid={`${key}-${o}`}
                    onChange={() => commit({ ...a, [key]: o })} />
                  {(names as Record<string, string>)[o]}
                </label>
              ))}
            </fieldset>
          ))}
          <fieldset className="m-0 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-white p-2" disabled={a.scoring !== "pci"}>
            <legend className="px-1 text-xs font-medium text-slate-500">{t.scoringName.pci.replace(/ \(.*/, "")}</legend>
            {(["valid", "complete", "first", "penalty"] as const).map((k) => (
              <label key={k} className="inline-flex items-center gap-2 text-xs">
                <input type="number" min={0} max={20} className={`${field} w-16`} value={a.points[k]} data-testid={`points-${k}`}
                  onInput={(e) => commit({ ...a, points: { ...a.points, [k]: Math.max(0, Math.round(Number((e.target as HTMLInputElement).value) || 0)) } })} />
                {{ valid: t.pointsValid, complete: t.pointsComplete, first: t.pointsFirst, penalty: t.penalty }[k]}
              </label>
            ))}
            <label className="inline-flex items-center gap-2 text-xs">
              {t.firstPart}
              <select className={field} value={a.first} data-testid="first" onChange={(e) => commit({ ...a, first: (e.target as HTMLSelectElement).value })}>
                <option value="">{t.noFirst}</option>
                {a.parts.map((x) => <option key={x.id} value={x.id}>{nameOf(x, language)}</option>)}
              </select>
            </label>
          </fieldset>
          <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-2">
            <p className="m-0" data-testid="orders">{t.orders(orders, orders >= 100000)}</p>
            {orders > 1 && a.scoring !== "pci" && (
              <p className="m-0 flex items-start gap-1.5 text-amber-800" role="note" data-testid="many-orders"><span aria-hidden="true">⚠</span>{t.manyOrders}</p>
            )}
            {correct && (
              <p className="m-0 text-xs text-slate-600">
                {t.correctOrder}: <span data-testid="correct-order">{correct.map((id, i) => `${i + 1}. ${name(id)}`).join("  ")}</span>
              </p>
            )}
            <div>
              <button type="button" className={button} disabled={cyclic} data-testid="auto-order"
                onClick={() => commit({ ...a, order: firstValidOrder(a.parts) ?? [] })}>{t.autoOrder}</button>
            </div>
          </div>
        </div>
      )}

      {tab === "try" && (
        <TryIt key={JSON.stringify([a.parts, a.task, a.feedback, a.gltf])} a={a} language={language} candidateLanguage={candidateLanguage}
          onUseOrder={(o) => commit({ ...a, order: o })} />
      )}

      <p className="m-0 text-slate-600" data-testid="summary">
        {evaluation && a.scoring === "pci" ? t.summary(evaluation.score, evaluation.maxscore) : t.orders(orders, orders >= 100000)}
        {problems.map((p) => <span key={p} className="ml-2 text-rose-600">{p}</span>)}
      </p>
    </div>
  );
};

export default Authoring;
