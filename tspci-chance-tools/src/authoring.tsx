import { useState } from "preact/hooks";
import {
  COLOR_COUNT, Combine, Item, MAX_BALLS, MAX_DICE, MAX_FACES, MAX_ITEMS, MAX_TARGETS, MODES, Mode, Setup, TOOL_TYPES, ToolType, cleanLabel,
  colorItem, colorName, evaluateDesign, evaluateTree, formatRat, mul, paletteOf, problems, solutionDesign, solutionTree, stepDistribution,
  treePaths, treeSetup,
} from "./chance";
import { button } from "./experiment";
import { Texts, textsFor } from "./texts";
import { Bag, Patterns, Spinner, ToolView, fillOf, stepName } from "./view";

// The authoring mode (index.tsx getAuthoringInstance): the tool and its set-up, the task (mode), the targets of a
// design or the options of a tree, and the margin. The result is data-mode and data-setup (chance.ts).

/** What keeps the setup from working (getAuthoringInstance validate()), in the author's language. */
export const authoringProblems = (s: Setup, mode: Mode, language: string): string[] => problems(s, mode).map(textsFor(language).problem);

const field = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-sky-700";
const tabClass = (on: boolean) =>
  `rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-sky-700 ${on ? "border-sky-700 text-sky-800" : "border-transparent text-slate-600 hover:text-slate-900"}`;
type Tab = "tool" | "task";

const Num = ({ label, value, min, max, step = 1, onChange, testid }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void; testid?: string;
}) => (
  <label className="flex items-center gap-2 text-sm">
    <span className="text-slate-600">{label}</span>
    <input type="number" className={`${field} w-20`} min={min} max={max} step={step} value={value} data-testid={testid}
      onChange={(e) => { const n = Number((e.target as HTMLInputElement).value); if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n))); }} />
  </label>
);

const Check = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="flex items-center gap-2 text-sm text-slate-700">
    <input type="checkbox" checked={checked} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} className="size-4 accent-sky-700" />
    {label}
  </label>
);

const Items = ({ items, onChange, t, language, sizeLabel, add }: {
  items: Item[]; onChange: (items: Item[]) => void; t: Texts; language: string; sizeLabel: string; add: string;
}) => {
  const set = (i: number, patch: Partial<Item>) => onChange(items.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  return (
    <div className="flex flex-col gap-2">
      <table className="text-sm">
        <thead className="text-left text-xs text-slate-500">
          <tr><th className="pr-2 font-medium">{t.label}</th><th className="pr-2 font-medium">{t.letter}</th><th className="pr-2 font-medium">{t.color}</th><th className="pr-2 font-medium">{sizeLabel}</th><th /></tr>
        </thead>
        <tbody>
          {items.map((x, i) => (
            <tr key={i}>
              <td className="py-1 pr-2"><input className={`${field} w-32`} value={x.label} aria-label={`${t.label} ${i + 1}`} data-testid={`item-label-${i}`}
                onChange={(e) => { const label = cleanLabel((e.target as HTMLInputElement).value); if (label) set(i, { label }); }} /></td>
              <td className="py-1 pr-2"><input className={`${field} w-12 text-center`} maxLength={2} value={x.letter} aria-label={`${t.letter} ${i + 1}`}
                onInput={(e) => set(i, { letter: (e.target as HTMLInputElement).value.slice(0, 2) })} /></td>
              <td className="py-1 pr-2">
                <span className="flex items-center gap-1">
                  <svg width="18" height="18" aria-hidden="true"><rect width="18" height="18" rx="4" fill={fillOf(x.color)} stroke="#1e293b" /></svg>
                  <select className={field} value={x.color} aria-label={`${t.color} ${i + 1}`} onChange={(e) => set(i, { color: Number((e.target as HTMLSelectElement).value) })}>
                    {Array.from({ length: COLOR_COUNT }, (_, c) => <option key={c} value={c}>{colorName(c, language)}</option>)}
                  </select>
                </span>
              </td>
              <td className="py-1 pr-2"><input type="number" className={`${field} w-16`} min={0} max={MAX_BALLS} value={x.count} aria-label={`${sizeLabel} ${i + 1}`}
                data-testid={`item-count-${i}`} onChange={(e) => set(i, { count: Math.max(0, Math.min(MAX_BALLS, Math.round(Number((e.target as HTMLInputElement).value) || 0))) })} /></td>
              <td className="py-1"><button type="button" className={button} disabled={items.length <= 1} aria-label={`${t.remove} ${x.label}`}
                onClick={() => onChange(items.filter((_, k) => k !== i))}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className={`${button} self-start`} disabled={items.length >= MAX_ITEMS}
        onClick={() => { const used = new Set(items.map((x) => x.color)); const c = [...Array(COLOR_COUNT).keys()].find((k) => !used.has(k)) ?? 0; onChange([...items, colorItem(c, 1, language)]); }}>
        {add}
      </button>
      <p className="text-xs text-slate-500">{t.sizeHint}</p>
    </div>
  );
};

const Authoring = ({ initial, initialMode, language, itemLanguage, onChange }: {
  initial: Setup; initialMode: Mode; language: string; itemLanguage: string; onChange: (s: Setup, mode: Mode) => void;
}) => {
  const t = textsFor(language);
  const [setup, setSetup] = useState<Setup>(initial);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [tab, setTab] = useState<Tab>("tool");
  const commit = (next: Setup, nextMode = mode) => {
    setSetup(next);
    setMode(nextMode);
    onChange(next, nextMode);
  };
  const problemList = authoringProblems(setup, mode, language);
  const name = stepName(t);
  const palette = paletteOf(setup);

  const toolTab = (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-2 text-sm font-semibold text-slate-700">{t.tabTool}</legend>
        {TOOL_TYPES.map((tool) => (
          <label key={tool} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm has-[:checked]:border-sky-700 has-[:checked]:bg-sky-50">
            <input type="radio" name="cp-tool" value={tool} checked={setup.tool === tool} onChange={() => commit({ ...setup, tool: tool as ToolType })} className="accent-sky-700" />
            {t.tool[tool]}
          </label>
        ))}
      </fieldset>
      {setup.tool === "dice" && (
        <div className="flex flex-col gap-3">
          <Num label={t.diceCount} value={setup.dice.count} min={1} max={MAX_DICE} onChange={(count) => commit({ ...setup, dice: { ...setup.dice, count } })} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">{t.faces}</span>
            <input className={field} value={setup.dice.faces.join(" ")} data-testid="faces"
              onChange={(e) => { const faces = (e.target as HTMLInputElement).value.split(/\s+/).map(cleanLabel).filter(Boolean).slice(0, MAX_FACES); commit({ ...setup, dice: { ...setup.dice, faces } }); }} />
            <span className="text-xs text-slate-500">{t.facesHint}</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {[4, 6, 8, 10, 12, 20].map((n) => (
              <button key={n} type="button" className={button} onClick={() => commit({ ...setup, dice: { ...setup.dice, faces: Array.from({ length: n }, (_, i) => String(i + 1)) } })}>D{n}</button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">{t.combine}</span>
            <select className={field} value={setup.dice.combine} onChange={(e) => commit({ ...setup, dice: { ...setup.dice, combine: (e.target as HTMLSelectElement).value as Combine } })}>
              {Object.entries(t.combineDice).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
      )}
      {setup.tool === "coins" && (
        <div className="flex flex-col gap-3">
          <Num label={t.coinCount} value={setup.coins.count} min={1} max={MAX_DICE} onChange={(count) => commit({ ...setup, coins: { ...setup.coins, count } })} />
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">{t.combine}</span>
            <select className={field} value={setup.coins.combine} onChange={(e) => commit({ ...setup, coins: { ...setup.coins, combine: (e.target as HTMLSelectElement).value as Combine } })}>
              {Object.entries(t.combineCoins).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
      )}
      {setup.tool === "spinner" && (
        <div className="flex flex-col gap-3">
          <Items items={setup.spinner.sectors} t={t} language={itemLanguage} sizeLabel={t.size} add={t.addSector}
            onChange={(sectors) => commit({ ...setup, spinner: { ...setup.spinner, sectors } })} />
          <Num label={t.spins} value={setup.spinner.spins} min={1} max={MAX_DICE} onChange={(spins) => commit({ ...setup, spinner: { ...setup.spinner, spins } })} />
        </div>
      )}
      {setup.tool === "bag" && (
        <div className="flex flex-col gap-3">
          <Items items={setup.bag.balls} t={t} language={itemLanguage} sizeLabel={t.count} add={t.addBall}
            onChange={(balls) => commit({ ...setup, bag: { ...setup.bag, balls } })} />
          <Num label={t.draws} value={setup.bag.draws} min={1} max={MAX_DICE} onChange={(draws) => commit({ ...setup, bag: { ...setup.bag, draws } })} />
          <Check label={t.replace} checked={setup.bag.replace} onChange={(replace) => commit({ ...setup, bag: { ...setup.bag, replace } })} />
        </div>
      )}
    </div>
  );

  const event = setup.tree.event ?? { text: "", paths: [] };
  const setEvent = (e: { text: string; paths: string[] }) =>
    commit({ ...setup, tree: { ...setup.tree, event: e.paths.length || e.text ? e : null } });
  const taskTab = (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold text-slate-700">{t.mode}</legend>
        {MODES.map((m) => (
          <label key={m} className="flex items-center gap-2 text-sm">
            <input type="radio" name="cp-mode" value={m} checked={mode === m} onChange={() => commit(setup, m)} className="accent-sky-700" />
            {t.modes[m]}
          </label>
        ))}
      </fieldset>
      {mode === "design" && (
        <div className="flex flex-col gap-3" data-testid="targets">
          <h3 className="text-sm font-semibold text-slate-700">{t.targets}</h3>
          {setup.targets.map((target, i) => {
            const set = (patch: object) => commit({ ...setup, targets: setup.targets.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-16 text-slate-600">{t.target(i + 1)}</span>
                <select className={field} value={target.outcome} aria-label={`${t.target(i + 1)}: ${t.targetOutcome}`} onChange={(e) => set({ outcome: (e.target as HTMLSelectElement).value })}>
                  {!palette.some((p) => p.label === target.outcome) && <option value={target.outcome}>{target.outcome || "–"}</option>}
                  {palette.map((p) => <option key={p.label} value={p.label}>{p.label}</option>)}
                </select>
                <input className={`${field} w-20`} value={target.probability} aria-label={`${t.target(i + 1)}: ${t.targetProbability}`} data-testid={`target-p-${i}`}
                  onInput={(e) => set({ probability: (e.target as HTMLInputElement).value.trim() })} />
                <input type="number" className={`${field} w-16`} min={0} max={10} value={target.points} aria-label={`${t.target(i + 1)}: ${t.points}`}
                  onChange={(e) => set({ points: Math.max(0, Math.min(10, Math.round(Number((e.target as HTMLInputElement).value) || 0))) })} />
                <button type="button" className={button} aria-label={`${t.remove} ${t.target(i + 1)}`} onClick={() => commit({ ...setup, targets: setup.targets.filter((_, k) => k !== i) })}>×</button>
              </div>
            );
          })}
          <button type="button" className={`${button} self-start`} disabled={setup.targets.length >= MAX_TARGETS}
            onClick={() => commit({ ...setup, targets: [...setup.targets, { outcome: palette.find((p) => !setup.targets.some((x) => x.outcome === p.label))?.label ?? palette[0]?.label ?? "", probability: "1/2", points: 1 }] })}>
            {t.addTarget}
          </button>
          <Num label={t.exactSize} value={setup.size} min={0} max={MAX_BALLS} onChange={(size) => commit({ ...setup, size })} />
        </div>
      )}
      {mode === "tree" && (
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">{t.labels}</span>
            <select className={field} value={setup.tree.labels} onChange={(e) => commit({ ...setup, tree: { ...setup.tree, labels: (e.target as HTMLSelectElement).value as "given" | "choose" } })}>
              {Object.entries(t.labelOptions).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <Check label={t.askPaths} checked={setup.tree.paths} onChange={(paths) => commit({ ...setup, tree: { ...setup.tree, paths } })} />
          <fieldset className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-sm font-semibold text-slate-700">{t.event}</legend>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">{t.eventText}</span>
              <input className={field} value={event.text} data-testid="event-text" onInput={(e) => setEvent({ ...event, text: (e.target as HTMLInputElement).value })} />
            </label>
            <span className="text-sm text-slate-600">{t.eventPaths}</span>
            <div className="flex flex-wrap gap-3">
              {treePaths(setup).map((p) => (
                <Check key={p} label={p.split(",").map(name).join(", ")} checked={event.paths.includes(p)}
                  onChange={(on) => setEvent({ ...event, paths: on ? [...event.paths, p] : event.paths.filter((x) => x !== p) })} />
              ))}
            </div>
          </fieldset>
          <Num label={t.margin} value={setup.margin} min={0} max={0.5} step={0.001} testid="margin" onChange={(margin) => commit({ ...setup, margin })} />
        </div>
      )}
      {mode !== "tool" && <Check label={t.experiments} checked={setup.experiments} onChange={(experiments) => commit({ ...setup, experiments })} />}
    </div>
  );

  // the preview: the tool, and what follows from the task
  const solution = mode === "design" && !problemList.length ? solutionDesign(setup) : null;
  const designEval = solution ? evaluateDesign(setup, solution) : null;
  const tree = mode === "tree" ? treeSetup(setup) : null;
  const treeEval = tree && !problemList.length ? evaluateTree(setup, solutionTree(setup)) : null;
  return (
    <div className="flex flex-wrap gap-6 p-4 font-sans text-slate-900" data-testid="authoring">
      <Patterns />
      <div className="min-w-0 flex-1 basis-[460px]">
        <div role="tablist" className="mb-4 flex gap-1 border-b border-slate-200">
          {(["tool", "task"] as Tab[]).map((x) => (
            <button key={x} type="button" role="tab" aria-selected={tab === x} className={tabClass(tab === x)} onClick={() => setTab(x)}>
              {x === "tool" ? t.tabTool : t.tabTask}
            </button>
          ))}
        </div>
        <div role="tabpanel">{tab === "tool" ? toolTab : taskTab}</div>
      </div>
      <aside className="flex w-72 max-w-full flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate-700">{t.preview}</h3>
        <div className="flex justify-center rounded-xl border border-slate-200 bg-white p-2">
          {setup.tool === "spinner" ? <Spinner sectors={setup.spinner.sectors} angle={null} animate={false} label={t.tool.spinner} size={200} />
            : setup.tool === "bag" ? <Bag balls={setup.bag.balls} label={t.tool.bag} size={180} />
              : <ToolView setup={setup} trial={null} trialIndex={0} t={t} animate={false} />}
        </div>
        {designEval && solution && (
          <p className="text-sm text-slate-700" data-testid="summary">
            {t.solutionPreview(designEval.score, designEval.maxscore)}{" "}
            {setup.tool === "bag" ? palette.map((p, i) => `${solution.counts[i]} × ${p.label}`).join(", ") : t.sectors(solution.sectors.length)}
          </p>
        )}
        {tree && treeEval && (
          <div className="text-sm text-slate-700" data-testid="summary">
            <p className="font-medium">{t.trueTree}</p>
            <ul className="text-xs tabular-nums">
              {stepDistribution(tree).map((o) => (
                <li key={o.label}>
                  {name(o.label)} {formatRat(o.p)}: {stepDistribution(tree, [o.label]).map((o2) => `${name(o2.label)} ${formatRat(o2.p)} (${formatRat(mul(o.p, o2.p))})`).join(", ")}
                </li>
              ))}
            </ul>
            <p>{t.solutionPreview(treeEval.score, treeEval.maxscore)}</p>
          </div>
        )}
        <div role="status" aria-live="polite" data-testid="problems">
          {problemList.length
            ? <ul className="list-disc pl-5 text-sm text-rose-700">{problemList.map((p) => <li key={p}>{p}</li>)}</ul>
            : <p className="text-sm text-emerald-700">{t.noProblems}</p>}
        </div>
      </aside>
    </div>
  );
};

export default Authoring;
