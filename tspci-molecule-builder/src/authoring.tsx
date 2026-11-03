import { useState } from "preact/hooks";
import Builder from "./builder";
import {
  BondOrder, CHECK_TYPES, Check, CheckType, ELEMENTS, ELEMENT_SYMBOLS, ElementSymbol, MAX_CHECKS, Molecule, Settings, canonicalKey, canonicalSmiles,
  elementCounts, evaluate, FormulaOrder, normalizeFormula, parseSmiles,
} from "./molecule";
import { textsFor } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance): the correct molecule, built in the same builder as the
// candidate's; the elements of the palette; the checks for PCI scoring. The result is data-molecule (molecule.ts).

/** What keeps the settings from being used (getAuthoringInstance validate()), in the author's language. */
export const authoringProblems = (s: Settings, scoring: string, language: string): string[] => {
  const t = textsFor(language);
  const problems: string[] = [];
  if (!s.elements.length) problems.push(t.problemElements);
  if (!s.solution) problems.push(t.problemNoSolution);
  const solution = settingsMolecule(s);
  if (solution) {
    for (const el of Object.keys(elementCounts(solution))) if (!s.elements.includes(el as ElementSymbol)) problems.push(t.problemNotInPalette(el));
  }
  if (scoring === "pci") {
    if (!s.checks.length) problems.push(t.problemChecks);
    if (solution)
      evaluate(s, solution).results.forEach((r, i) => {
        // "an isomer, not the correct molecule itself" fails for the correct molecule by design
        if (!r.passed && !(r.check.type === "isomer" && r.check.different)) problems.push(t.problemCheck(i + 1));
      });
  }
  return problems;
};

const settingsMolecule = (s: Settings): Molecule | null => (s.solution ? parseSmiles(s.solution) : null);

const field = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm";
const button = "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-sky-600";
type Tab = "molecule" | "elements" | "checks";

const newCheck = (type: CheckType): Check => (type === "bond" ? { type, order: 2, count: 1, points: 1 } : ({ type, points: 1 } as Check));

const Authoring = ({ initial, language, scoring, formulaOrder = "common", onChange }: { initial: Settings; language: string; scoring: string; formulaOrder?: FormulaOrder; onChange: (s: Settings) => void }) => {
  const t = textsFor(language);
  const [settings, setSettings] = useState<Settings>(initial);
  const [molecule, setMolecule] = useState<Molecule>(() => settingsMolecule(initial) ?? { atoms: [], bonds: [] });
  const [tab, setTab] = useState<Tab>("molecule");
  const commit = (next: Settings) => {
    setSettings(next);
    onChange(next);
  };
  const setDrawn = (m: Molecule) => {
    setMolecule(m);
    const smiles = m.atoms.length ? canonicalSmiles(m) : "";
    commit({ ...settings, solution: smiles });
  };
  const problems = authoringProblems(settings, scoring, language);
  const evaluation = molecule.atoms.length ? evaluate(settings, molecule) : null;

  const setCheck = (i: number, check: Check | null) => {
    const checks = [...settings.checks];
    if (check) checks[i] = check;
    else checks.splice(i, 1);
    commit({ ...settings, checks });
  };
  const elementSelect = (value: ElementSymbol | undefined, onSet: (el: ElementSymbol | undefined) => void, testid: string) => (
    <select className={field} value={value ?? ""} data-testid={testid} onChange={(e) => onSet(((e.target as HTMLSelectElement).value || undefined) as ElementSymbol | undefined)}>
      <option value="">{t.anyElement}</option>
      {ELEMENT_SYMBOLS.map((el) => <option key={el} value={el}>{el}</option>)}
    </select>
  );

  const checkEditor = (check: Check, i: number) => {
    const passed = evaluation?.results[i]?.passed;
    return (
      <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2" data-testid={`check-${i}`}>
        <span className={`grid size-6 place-items-center rounded-full text-xs font-bold ${passed === undefined ? "bg-slate-100 text-slate-500" : passed ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}
          aria-label={passed === undefined ? t.noSolution : passed ? "✓" : "✗"}>{passed === undefined ? i + 1 : passed ? "✓" : "✗"}</span>
        <span className="font-mono text-xs text-slate-500">check{i + 1}</span>
        <select className={field} value={check.type} data-testid={`check-${i}-type`} aria-label={`check${i + 1}`}
          onChange={(e) => setCheck(i, newCheck((e.target as HTMLSelectElement).value as CheckType))}>
          {CHECK_TYPES.map((type) => <option key={type} value={type}>{t.checkName[type]}</option>)}
        </select>
        {(check.type === "formula" || check.type === "isomer") && (
          <input className={`${field} w-52`} value={check.formula ?? ""} placeholder={t.formulaOptional} aria-label={t.formulaOptional} title={t.formulaOptional}
            data-testid={`check-${i}-formula`}
            onChange={(e) => {
              const v = (e.target as HTMLInputElement).value.trim();
              const formula = v ? normalizeFormula(v) : null;
              const { formula: _, ...rest } = check;
              setCheck(i, (formula ? { ...rest, formula } : rest) as Check);
            }} />
        )}
        {check.type === "isomer" && (
          <label className="inline-flex items-center gap-1 text-xs">
            <input type="checkbox" checked={!!check.different} data-testid={`check-${i}-different`}
              onChange={(e) => setCheck(i, { ...check, different: (e.target as HTMLInputElement).checked || undefined })} />
            {t.different}
          </label>
        )}
        {check.type === "bond" && (
          <span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
            {t.count}
            <input type="number" min={1} max={20} className={`${field} w-14`} value={check.count ?? 1} data-testid={`check-${i}-count`} aria-label={t.count}
              onInput={(e) => setCheck(i, { ...check, count: Math.max(1, Math.round(Number((e.target as HTMLInputElement).value) || 1)) })} />
            <select className={field} value={check.order} data-testid={`check-${i}-order`}
              onChange={(e) => setCheck(i, { ...check, order: Number((e.target as HTMLSelectElement).value) as BondOrder })}>
              {[1, 2, 3].map((o) => <option key={o} value={o}>{t.bondName[o as BondOrder]}</option>)}
            </select>
            {t.between}
            {elementSelect(check.a, (a) => setCheck(i, { ...check, a }), `check-${i}-a`)}
            {elementSelect(check.b, (b) => setCheck(i, { ...check, b }), `check-${i}-b`)}
          </span>
        )}
        <label className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500">
          {t.points}
          <input type="number" min={0} max={10} className={`${field} w-14`} value={check.points ?? 1} data-testid={`check-${i}-points`}
            onInput={(e) => setCheck(i, { ...check, points: Math.max(0, Math.round(Number((e.target as HTMLInputElement).value) || 0)) })} />
        </label>
        <button type="button" className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-rose-50 hover:text-rose-800" onClick={() => setCheck(i, null)}
          data-testid={`check-${i}-remove`}>{t.removeCheck}</button>
      </li>
    );
  };

  const tabs: [Tab, string][] = [["molecule", t.tabMolecule], ["elements", t.tabElements], ["checks", t.tabChecks]];
  return (
    <div className="flex flex-col gap-3 font-sans text-sm text-slate-800">
      <div role="tablist" className="inline-flex self-start rounded-lg bg-slate-100 p-1">
        {tabs.map(([id, name]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} data-testid={`authoring-tab-${id}`} onClick={() => setTab(id)}
            className="rounded-md px-3 py-1 text-sm text-slate-600 aria-selected:bg-white aria-selected:text-slate-900 aria-selected:shadow-sm">{name}</button>
        ))}
      </div>

      {tab === "molecule" && (
        <div className="flex flex-col gap-2" role="tabpanel">
          <p className="m-0 text-xs text-slate-500">{t.moleculeHint}</p>
          <Builder molecule={molecule} onChange={setDrawn} elements={ELEMENT_SYMBOLS} texts={t} showFormula showValence readOnly={false} view="2d" maxAtoms={60} formulaOrder={formulaOrder} />
        </div>
      )}

      {tab === "elements" && (
        <div className="flex flex-col gap-2" role="tabpanel">
          <p className="m-0 text-xs text-slate-500">{t.elementsHint}</p>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-1.5 p-0">
            {ELEMENT_SYMBOLS.map((el) => {
              const on = settings.elements.includes(el);
              return (
                <li key={el}>
                  <label className={`flex items-center gap-2 rounded-lg border p-1.5 ${on ? "border-sky-300 bg-sky-50/60" : "border-slate-200 bg-white"}`}>
                    <input type="checkbox" checked={on} data-testid={`element-${el}`}
                      onChange={(e) => {
                        const checked = (e.target as HTMLInputElement).checked;
                        commit({ ...settings, elements: ELEMENT_SYMBOLS.filter((x) => (x === el ? checked : settings.elements.includes(x))) });
                      }} />
                    <span className="grid size-7 place-items-center rounded-full border border-slate-700 text-xs font-bold" style={{ background: ELEMENTS[el].color, color: ELEMENTS[el].text }} aria-hidden="true">{el}</span>
                    <span>{t.name[el]} ({el}, {ELEMENTS[el].valence})</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {tab === "checks" && (
        <div className="flex flex-col gap-2" role="tabpanel">
          <p className="m-0 text-xs text-slate-500">{scoring === "pci" ? t.checksHint : t.checksOff}</p>
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">{settings.checks.map(checkEditor)}</ol>
          <div>
            <button type="button" className={button} disabled={settings.checks.length >= MAX_CHECKS} data-testid="add-check"
              onClick={() => commit({ ...settings, checks: [...settings.checks, newCheck("valence")] })}>+ {t.addCheck}</button>
          </div>
        </div>
      )}

      <p className="m-0 text-slate-600" data-testid="correct-response">
        {t.correctResponse}: <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-800">{molecule.atoms.length ? canonicalKey(molecule) : "—"}</code>
      </p>
      <p className="m-0 text-slate-600" data-testid="summary">
        {evaluation ? t.summary(evaluation.score, evaluation.maxscore) : t.noSolution}
        {problems.map((p) => <span key={p} className="ml-2 text-rose-700">{p}</span>)}
      </p>
    </div>
  );
};

export default Authoring;
