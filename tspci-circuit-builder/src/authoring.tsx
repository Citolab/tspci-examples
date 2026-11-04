import { useMemo, useState } from "preact/hooks";
import Board from "./board";
import {
  CHECK_TYPES, COMPONENT_TYPES, Check, CheckType, Circuit, MAX_CHECKS, MAX_SIZE, MIN_SIZE, PART_TYPES, PartRef, PartType,
  MATERIAL_TYPES, Placed, WIRE_TYPES, def, evaluate, inBounds, lockedParts, parsePalette, partAt, startParts, topology, boardOf,
} from "./circuit";
import { PartSymbol } from "./symbols";
import { Texts, refName, textsFor } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance): the board as the candidate finds it (with locked parts), the
// author's solution, the palette and the checks. The result is data-circuit (circuit.ts).

/** What keeps the circuit from being used (getAuthoringInstance validate()). */
export const authoringProblems = (c: Circuit, language: string): string[] => {
  const t = textsFor(language);
  const problems: string[] = [];
  if (!c.palette.length || c.palette.every((p) => p.count === 0)) problems.push(t.problemPalette);
  if (c.checks.some((k) => k.type === "solution") && !c.solution) problems.push(t.problemNoSolution);
  if (c.solution) {
    const start = startParts(c);
    for (const type of new Set(c.solution.map((p) => p.type))) {
      const item = c.palette.find((p) => p.type === type);
      const used = c.solution.filter((p) => p.type === type).length;
      const given = start.filter((p) => p.type === type).length; // parts the candidate starts with need no palette
      if (!item && used > given) problems.push(t.problemNotInPalette(t.part[type]));
      else if (item && item.count !== null && used > item.count + given) problems.push(t.problemPaletteShort(t.part[type]));
    }
    // a check that needs a broken lamp cannot pass on the solution (it has none): not a problem
    evaluate(c, c.solution).results.forEach((r, i) => !r.passed && !brokenOnly(r.check) && problems.push(t.problemCheck(i + 1)));
  }
  return problems;
};

const brokenOnly = (check: Check) => check.type === "lit" && !!check.broken;

const button = "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-sky-600";
const field = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm";
type Tab = "board" | "solution" | "palette" | "checks";

/** A part type, or any source, to choose in a check. */
const RefSelect = ({ value, options, onChange, t, testid }: { value: PartRef; options: PartRef[]; onChange: (r: PartRef) => void; t: Texts; testid?: string }) => (
  <select className={field} value={value} data-testid={testid} onChange={(e) => onChange((e.target as HTMLSelectElement).value as PartRef)}>
    {options.map((r) => <option key={r} value={r}>{refName(t)(r)}</option>)}
  </select>
);

const newCheck = (type: CheckType, components: PartType[]): Check => {
  const first = components[0] ?? "lamp";
  switch (type) {
    case "parts": return { type, count: { [first]: 1 }, points: 1 };
    case "closed": return { type, points: 1 };
    case "series": return { type, parts: [first, "source"], points: 1 };
    case "parallel": return { type, parts: [first, components[1] ?? first], points: 1 };
    case "forward": return { type, parts: [components.find((p) => def(p).polar && def(p).kind !== "source") ?? "led"], points: 1 };
    case "solution": return { type, points: 1 };
    case "lit": return { type, parts: [components.includes("lamp") ? "lamp" : first], points: 1 };
  }
};

const Authoring = ({ initial, language, onChange }: { initial: Circuit; language: string; onChange: (c: Circuit) => void }) => {
  const t = textsFor(language);
  const [circuit, setCircuit] = useState<Circuit>(initial);
  const [tab, setTab] = useState<Tab>("board");
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const commit = (next: Circuit) => {
    setCircuit(next);
    onChange(next);
  };
  const problems = authoringProblems(circuit, language);
  const evaluation = useMemo(() => (circuit.solution ? evaluate(circuit, circuit.solution) : null), [circuit]);
  const allPalette = useMemo(() => parsePalette(PART_TYPES), []);

  // the components a check can be about: what the candidate can place and what is on the board already
  const components = [...new Set([...circuit.palette.map((p) => p.type), ...circuit.preset.map((p) => p.type)])].filter((p) => COMPONENT_TYPES.includes(p));
  const refs: PartRef[] = ["source", ...(components.length ? components : COMPONENT_TYPES)];

  const setSize = (columns: number, rows: number) => {
    const keep = (p: Placed) => inBounds({ columns, rows }, p.x, p.y);
    commit({ ...circuit, columns, rows, preset: circuit.preset.filter(keep), solution: circuit.solution?.filter(keep) ?? null });
  };
  const sizeField = (side: "columns" | "rows") => (
    <label className="flex items-center gap-2">
      <span className="text-xs text-slate-500">{t[side]}</span>
      <input type="number" min={MIN_SIZE} max={MAX_SIZE} value={circuit[side]} data-testid={side} className={`${field} w-16`}
        onChange={(e) => {
          const n = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(Number((e.target as HTMLInputElement).value))));
          if (Number.isFinite(n) && n !== circuit[side]) setSize(side === "columns" ? n : circuit.columns, side === "rows" ? n : circuit.rows);
        }} />
    </label>
  );

  /** The preset changed on the board: new parts are locked; the solution loses what is now under a locked part. */
  const setPreset = (parts: Placed[]) => {
    const preset = parts.map((p): Placed => {
      const before = partAt(circuit.preset, p.x, p.y);
      const locked = before && before.type === p.type ? p.locked : before ? before.locked : true;
      const { locked: _, ...rest } = p;
      return locked ? { ...rest, locked: true } : rest;
    });
    const lockedCells = new Set(preset.filter((p) => p.locked).map((p) => `${p.x},${p.y}`));
    commit({ ...circuit, preset, solution: circuit.solution?.filter((p) => !lockedCells.has(`${p.x},${p.y}`)) ?? null });
  };
  const selectedPreset = selected ? partAt(circuit.preset, selected.x, selected.y) : undefined;

  const setCheck = (i: number, check: Check | null) => {
    const checks = [...circuit.checks];
    if (check) checks[i] = check;
    else checks.splice(i, 1);
    commit({ ...circuit, checks });
  };

  const checkEditor = (check: Check, i: number) => {
    const passed = brokenOnly(check) ? undefined : evaluation?.results[i]?.passed;
    const refList = (list: PartRef[], options: PartRef[], min: number) => (
      <div className="flex flex-wrap items-center gap-1.5">
        {list.map((r, j) => (
          <span key={j} className="inline-flex items-center gap-0.5">
            <RefSelect value={r} options={options.includes(r) ? options : [r, ...options]} t={t} testid={`check-${i}-part-${j}`}
              onChange={(v) => setCheck(i, { ...check, parts: list.map((x, k) => (k === j ? v : x)) } as Check)} />
            {list.length > min && (
              <button type="button" className="px-1 text-slate-400 hover:text-rose-600" aria-label={t.removeCheck}
                onClick={() => setCheck(i, { ...check, parts: list.filter((_, k) => k !== j) } as Check)}>×</button>
            )}
          </span>
        ))}
        <button type="button" className="rounded-md px-1.5 text-sky-700 hover:bg-sky-50" aria-label="+" data-testid={`check-${i}-add`}
          onClick={() => setCheck(i, { ...check, parts: [...list, options[0]] } as Check)}>+</button>
      </div>
    );
    return (
      <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2" data-testid={`check-${i}`}>
        <span className={`grid size-6 place-items-center rounded-full text-xs font-bold ${passed === undefined ? "bg-slate-100 text-slate-400" : passed ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
          title={passed === undefined ? t.noSolution : undefined} aria-label={passed === undefined ? t.noSolution : passed ? "✓" : "✗"}>
          {passed === undefined ? i + 1 : passed ? "✓" : "✗"}
        </span>
        <span className="font-mono text-xs text-slate-500">check{i + 1}</span>
        <select className={field} value={check.type} data-testid={`check-${i}-type`}
          onChange={(e) => setCheck(i, newCheck((e.target as HTMLSelectElement).value as CheckType, components))}>
          {CHECK_TYPES.map((type) => <option key={type} value={type}>{t.checkName[type]}</option>)}
        </select>
        {check.type === "parts" && (
          <div className="flex flex-wrap items-center gap-2">
            {refs.map((r) => (
              <label key={r} className="inline-flex items-center gap-1 text-xs">
                <input type="number" min={0} max={20} className={`${field} w-12`} value={check.count[r] ?? 0} data-testid={`check-${i}-count-${r}`}
                  onInput={(e) => {
                    const n = Math.max(0, Math.round(Number((e.target as HTMLInputElement).value) || 0));
                    const count = { ...check.count };
                    if (n) count[r] = n;
                    else delete count[r];
                    setCheck(i, { ...check, count });
                  }} />
                {refName(t)(r)}
              </label>
            ))}
            <label className="inline-flex items-center gap-1 text-xs">
              <input type="checkbox" checked={!!check.exact} onChange={(e) => setCheck(i, { ...check, exact: (e.target as HTMLInputElement).checked || undefined })} />
              {t.exact}
            </label>
          </div>
        )}
        {(check.type === "series" || check.type === "parallel") && refList(check.parts, refs, 2)}
        {check.type === "forward" && refList(check.parts, refs.filter((r) => r === "source" ? false : !!def(r as PartType).polar), 1)}
        {check.type === "lit" && (
          <div className="flex flex-wrap items-center gap-2">
            {refList(check.parts, refs.filter((r) => r !== "source"), 1)}
            <label className="inline-flex items-center gap-1 text-xs">
              {t.withMaterial}
              <select className={field} value={check.material ?? ""} data-testid={`check-${i}-material`}
                onChange={(e) => {
                  const v = (e.target as HTMLSelectElement).value as PartType | "";
                  const { material: _, ...rest } = check;
                  setCheck(i, v ? { ...rest, material: v } : rest);
                }}>
                <option value="">{t.noMaterial}</option>
                {MATERIAL_TYPES.map((m) => <option key={m} value={m}>{t.part[m]}</option>)}
              </select>
            </label>
            <label className="inline-flex items-center gap-1 text-xs">
              <input type="checkbox" checked={!!check.off} data-testid={`check-${i}-off`} onChange={(e) => setCheck(i, { ...check, off: (e.target as HTMLInputElement).checked || undefined })} />
              {t.off}
            </label>
            <label className="inline-flex items-center gap-1 text-xs" title={t.brokenHint}>
              <input type="checkbox" checked={!!check.broken} data-testid={`check-${i}-broken`} onChange={(e) => setCheck(i, { ...check, broken: (e.target as HTMLInputElement).checked || undefined })} />
              {t.brokenOnly}
            </label>
          </div>
        )}
        {check.type === "closed" && (
          <label className="inline-flex items-center gap-1 text-xs">
            <input type="checkbox" checked={!!check.allowOpenEnds} onChange={(e) => setCheck(i, { ...check, allowOpenEnds: (e.target as HTMLInputElement).checked || undefined })} />
            {t.allowOpenEnds}
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

  const tabs: [Tab, string][] = [["board", t.tabBoard], ["solution", t.tabSolution], ["palette", t.tabPalette], ["checks", t.tabChecks]];
  return (
    <div className="flex flex-col gap-3 font-sans text-sm text-slate-800">
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="inline-flex rounded-lg bg-slate-100 p-1">
          {tabs.map(([id, name]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} data-testid={`tab-${id}`} onClick={() => setTab(id)}
              className="rounded-md px-3 py-1 text-sm text-slate-600 aria-selected:bg-white aria-selected:text-slate-900 aria-selected:shadow-sm">{name}</button>
          ))}
        </div>
        {sizeField("columns")}
        {sizeField("rows")}
      </div>

      {tab === "board" && (
        <div className="flex flex-col gap-2" role="tabpanel">
          <p className="m-0 text-xs text-slate-500">{t.boardHint}</p>
          <Board key="preset" circuit={{ ...circuit, palette: allPalette }} locked={[]} parts={circuit.preset} start={[]} texts={t} ignoreLimits
            onChange={setPreset} onSelect={setSelected} testid="preset-board" />
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" disabled={!selectedPreset} checked={!!selectedPreset?.locked} data-testid="lock"
              onChange={(e) => selected && setPreset(circuit.preset.map((p) => (p.x === selected.x && p.y === selected.y ? { ...p, locked: (e.target as HTMLInputElement).checked } : p)))} />
            {t.lock}
            <span className="text-xs text-slate-500">{t.lockHint}</span>
          </label>
        </div>
      )}

      {tab === "solution" && (
        <div className="flex flex-col gap-2" role="tabpanel">
          <p className="m-0 text-xs text-slate-500">{t.solutionHint}</p>
          <Board key="solution" circuit={circuit} locked={lockedParts(circuit)} parts={circuit.solution ?? startParts(circuit)} start={startParts(circuit)} texts={t} ignoreLimits
            onChange={(parts) => commit({ ...circuit, solution: parts })} testid="solution-board" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={button} disabled={!circuit.solution} onClick={() => commit({ ...circuit, solution: null })} data-testid="clear-solution">{t.clearSolution}</button>
          </div>
        </div>
      )}

      {tab === "palette" && (
        <div className="flex flex-col gap-2" role="tabpanel">
          <div className="flex flex-wrap items-center gap-2">
            <p className="m-0 mr-auto text-xs text-slate-500">{t.paletteHint}</p>
            <button type="button" className={button} onClick={() => commit({ ...circuit, palette: parsePalette(PART_TYPES) })} data-testid="palette-all">{t.all}</button>
            <button type="button" className={button} onClick={() => commit({ ...circuit, palette: parsePalette(WIRE_TYPES) })} data-testid="palette-wires">{t.wiresOnly}</button>
          </div>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-1.5 p-0">
            {PART_TYPES.map((type) => {
              const item = circuit.palette.find((p) => p.type === type);
              const setItem = (on: boolean, count: number | null) => {
                const palette = on
                  ? item ? circuit.palette.map((p) => (p.type === type ? { type, count } : p)) : [...circuit.palette, { type, count }]
                  : circuit.palette.filter((p) => p.type !== type);
                commit({ ...circuit, palette: PART_TYPES.flatMap((ty) => palette.filter((p) => p.type === ty)) });
              };
              return (
                <li key={type} className={`flex items-center gap-2 rounded-lg border p-1.5 ${item ? "border-sky-300 bg-sky-50/50" : "border-slate-200 bg-white"}`}>
                  <input type="checkbox" checked={!!item} aria-label={`${t.inPalette}: ${t.part[type]}`} data-testid={`palette-on-${type}`}
                    onChange={(e) => setItem((e.target as HTMLInputElement).checked, item?.count ?? null)} />
                  <PartSymbol type={type} rotation={0} className="size-8 shrink-0 text-slate-800" />
                  <span className="mr-auto">{t.part[type]}</span>
                  <input type="number" min={0} max={50} placeholder={t.unlimited} disabled={!item} aria-label={`${t.count}: ${t.part[type]}`}
                    className={`${field} w-16`} value={item?.count ?? ""} data-testid={`palette-count-${type}`}
                    onInput={(e) => {
                      const v = (e.target as HTMLInputElement).value;
                      setItem(true, v === "" ? null : Math.max(0, Math.round(Number(v) || 0)));
                    }} />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {tab === "checks" && (
        <div className="flex flex-col gap-2" role="tabpanel">
          <p className="m-0 text-xs text-slate-500">{t.checksHint}</p>
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">{circuit.checks.map(checkEditor)}</ol>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={button} disabled={circuit.checks.length >= MAX_CHECKS} data-testid="add-check"
              onClick={() => commit({ ...circuit, checks: [...circuit.checks, newCheck("closed", components)] })}>+ {t.addCheck}</button>
          </div>
          {circuit.solution && (
            <p className="m-0 text-xs text-slate-500">
              {t.topology}: <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-700" data-testid="topology">{topology(boardOf(circuit, circuit.solution)) || "—"}</code>
            </p>
          )}
        </div>
      )}

      <p className="m-0 text-slate-600" data-testid="summary">
        {evaluation ? t.summary(evaluation.score, evaluation.maxscore) : t.noSolution}
        {problems.map((p) => <span key={p} className="ml-2 text-rose-600">{p}</span>)}
      </p>
    </div>
  );
};

export default Authoring;
