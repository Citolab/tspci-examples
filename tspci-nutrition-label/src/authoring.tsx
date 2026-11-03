import { useEffect, useRef, useState } from "preact/hooks";
import {
  AmountUnit, Check, CheckType, MAX_CHECKS, Mode, NUTRIENTS, Nutrient, Plan, Product, REFERENCES, TARGET_GROUPS, TargetGroup, UNIT,
  evaluate, examplePlan, extremeProduct, formatNumber, parseNumber, parseProducts, toTSV, withEnergy,
} from "./nutrition";
import { textsFor } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance), in four tabs: the products (a table pasted from a spreadsheet),
// the reference intakes (a target group or own values), the task (data-mode, the select answer or the model meal) and
// the checks that score a meal. The result is data-plan and data-mode.

/** What keeps the item from working (getAuthoringInstance validate()), in the author's language. */
export const authoringProblems = (plan: Plan, mode: Mode, amountUnit: AmountUnit, lines: number, language: string) => {
  const t = textsFor(language);
  const problems: string[] = [];
  const ids = plan.products.map((p) => p.id);
  if (!plan.products.length) problems.push(t.problemNoProducts);
  if (lines > 0) problems.push(t.problemLines(lines));
  if (plan.reference.group === "custom" && !plan.reference.values.energyKj) problems.push(t.problemReference);
  if (amountUnit === "portions" && mode !== "select" && plan.products.some((p) => !p.portion)) problems.push(t.problemNoPortion);
  if (mode === "select" && (!plan.answer || !ids.includes(plan.answer))) problems.push(t.problemNoAnswer);
  if (mode === "compose") {
    if (!plan.checks.length) problems.push(t.problemNoChecks);
    plan.checks.forEach((c, i) => {
      if ((c.type === "nutrient" || c.type === "count" || c.type === "groups") && (c.min ?? null) === null && (c.max ?? null) === null) problems.push(t.problemBounds(i + 1));
      if ((c.type === "required" || c.type === "forbidden") && (!c.products?.length || c.products.some((id) => !ids.includes(id)))) problems.push(t.problemProducts(i + 1));
    });
    if (plan.solution) {
      evaluate(plan, plan.solution).results.forEach((r, i) => !r.passed && problems.push(t.problemSolution(i + 1)));
    }
  }
  return problems;
};

const button = "rounded-md border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-40";
const field = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus:border-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-700/30 disabled:bg-slate-100 disabled:text-slate-500";

/** A number field that lets the author type (1, → 1,5) with a point or a comma; empty is null. */
const NumberField = ({ value, label, testid, onValue, disabled, width = "w-20" }: {
  value: number | null | undefined;
  label: string;
  testid: string;
  onValue: (v: number | null) => void;
  disabled?: boolean;
  width?: string;
}) => {
  const shown = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
  const [text, setText] = useState(shown(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(shown(value));
  }, [value]);
  const bad = text.trim() !== "" && parseNumber(text) === null;
  return (
    <input type="text" inputMode="decimal" value={text} aria-label={label} data-testid={testid} aria-invalid={bad} disabled={disabled}
      className={`${field} ${width} text-right tabular-nums ${bad ? "border-rose-600 bg-rose-50" : ""}`}
      onFocus={() => (editing.current = true)}
      onBlur={() => { editing.current = false; setText(shown(value)); }}
      onInput={(e) => {
        const v = (e.target as HTMLInputElement).value;
        setText(v);
        const n = parseNumber(v);
        if (v.trim() === "") onValue(null);
        else if (n !== null) onValue(n);
      }} />
  );
};

type Tab = "products" | "reference" | "task" | "checks";

const Authoring = ({ initial, mode: initialMode, settings, language, onChange }: {
  initial: Plan;
  mode: Mode;
  settings: { language: string; amountUnit: AmountUnit };
  /** The author's language, for the texts. */
  language: string;
  onChange: (plan: Plan, mode: Mode, problemLines: number) => void;
}) => {
  const t = textsFor(language);
  const [plan, setPlan] = useState<Plan>(initial);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [tab, setTab] = useState<Tab>("products");
  const [tsv, setTsv] = useState(() => toTSV(initial.products));
  const [lineProblems, setLineProblems] = useState<ReturnType<typeof parseProducts>["problems"]>([]);
  const [note, setNote] = useState("");
  const [helper, setHelper] = useState<{ nutrient: Nutrient; basis: "portion" | "100g"; which: "max" | "min" }>({ nutrient: "salt", basis: "portion", which: "max" });
  const lang = settings.language;
  const commit = (next: Plan, nextMode = mode, lines = lineProblems.filter((p) => p.what !== "duplicateId").length) => {
    setPlan(next);
    setMode(nextMode);
    onChange(next, nextMode, lines);
  };
  const problems = authoringProblems(plan, mode, settings.amountUnit, lineProblems.filter((p) => p.what !== "duplicateId").length, language);
  const ids = plan.products.map((p) => p.id);

  /** New products: the answer, the model meal and the checks keep only the products there still are. */
  const setProducts = (text: string) => {
    setTsv(text);
    const parsed = parseProducts(text);
    setLineProblems(parsed.problems);
    const known = (id: string) => parsed.products.some((p) => p.id === id);
    const solution = plan.solution ? Object.fromEntries(Object.entries(plan.solution).filter(([id]) => known(id))) : null;
    commit({
      ...plan,
      products: parsed.products,
      answer: plan.answer && known(plan.answer) ? plan.answer : null,
      solution: solution && Object.keys(solution).length ? solution : null,
      checks: plan.checks.map((c) => (c.products ? { ...c, products: c.products.filter(known) } : c)),
    }, mode, parsed.problems.filter((p) => p.what !== "duplicateId").length);
  };

  const setReference = (group: TargetGroup) =>
    commit({ ...plan, reference: { group, values: group === "custom" ? { ...plan.reference.values } : { ...REFERENCES[group] } } });

  const setCheck = (i: number, check: Check | null) =>
    commit({ ...plan, checks: check ? plan.checks.map((c, k) => (k === i ? check : c)) : plan.checks.filter((_, k) => k !== i) });

  const evaluation = plan.solution ? evaluate(plan, plan.solution) : null;

  const productChecks = (check: Check, i: number) => (
    <fieldset className="m-0 flex basis-full flex-wrap gap-x-3 gap-y-1 border-0 p-0">
      <legend className="sr-only">{t.checkTypes[check.type]}</legend>
      {plan.products.map((p) => (
        <label key={p.id} className="inline-flex items-center gap-1 text-xs">
          <input type="checkbox" checked={!!check.products?.includes(p.id)} data-testid={`check-${i}-product-${p.id}`}
            onChange={(e) => {
              const on = (e.target as HTMLInputElement).checked;
              const list = on ? [...(check.products ?? []), p.id] : (check.products ?? []).filter((x) => x !== p.id);
              setCheck(i, { ...check, products: ids.filter((id) => list.includes(id)) });
            }} />
          {p.name}
        </label>
      ))}
    </fieldset>
  );

  const checkEditor = (check: Check, i: number) => {
    const result = evaluation?.results[i];
    const bounded = check.type === "nutrient" || check.type === "count" || check.type === "groups";
    const unit = check.type === "nutrient" ? (check.ri ? "%" : UNIT[check.nutrient!]) : "";
    return (
      <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2" data-testid={`check-${i}`}>
        <span className="w-16 text-xs font-semibold text-slate-500">{t.checkName(i + 1)}</span>
        <select className={field} value={check.type} aria-label={`${t.checkName(i + 1)}: ${t.checkType}`} data-testid={`check-${i}-type`}
          onChange={(e) => {
            const type = (e.target as HTMLSelectElement).value as CheckType;
            setCheck(i, type === "nutrient" ? { type, nutrient: "energyKj", max: 2500, points: check.points ?? 1 }
              : type === "required" || type === "forbidden" ? { type, products: [], points: check.points ?? 1 }
              : { type, min: type === "groups" ? 3 : 2, points: check.points ?? 1 });
          }}>
          {(["nutrient", "count", "groups", "required", "forbidden"] as CheckType[]).map((ty) => <option key={ty} value={ty}>{t.checkTypes[ty]}</option>)}
        </select>
        {check.type === "nutrient" && (
          <select className={field} value={check.nutrient} aria-label={`${t.checkName(i + 1)}: ${t.checkTypes.nutrient}`} data-testid={`check-${i}-nutrient`}
            onChange={(e) => setCheck(i, { ...check, nutrient: (e.target as HTMLSelectElement).value as Nutrient })}>
            {NUTRIENTS.map((n) => <option key={n} value={n}>{t.nutrientShort[n]}</option>)}
          </select>
        )}
        {bounded && (
          <>
            <label className="inline-flex items-center gap-1 text-xs">{t.min}
              <NumberField value={check.min} label={`${t.checkName(i + 1)}: ${t.min}`} testid={`check-${i}-min`} onValue={(v) => setCheck(i, { ...check, min: v })} />{unit}
            </label>
            <label className="inline-flex items-center gap-1 text-xs">{t.max}
              <NumberField value={check.max} label={`${t.checkName(i + 1)}: ${t.max}`} testid={`check-${i}-max`} onValue={(v) => setCheck(i, { ...check, max: v })} />{unit}
            </label>
          </>
        )}
        {check.type === "nutrient" && (
          <label className="inline-flex items-center gap-1 text-xs">
            <input type="checkbox" checked={!!check.ri} data-testid={`check-${i}-ri`}
              onChange={(e) => setCheck(i, { ...check, ri: (e.target as HTMLInputElement).checked || undefined })} />
            {t.asRi}
          </label>
        )}
        <label className="ml-auto inline-flex items-center gap-1 text-xs text-slate-600">
          {t.points}
          <input type="number" min={0} max={10} className={`${field} w-14`} value={check.points ?? 1} data-testid={`check-${i}-points`}
            onInput={(e) => setCheck(i, { ...check, points: Math.max(0, Math.round(Number((e.target as HTMLInputElement).value) || 0)) })} />
        </label>
        {result && (
          <span className={`text-xs font-medium ${result.passed ? "text-emerald-800" : "text-rose-800"}`} data-testid={`check-${i}-result`}>
            <span aria-hidden="true">{result.passed ? "✓ " : "✗ "}</span>{result.passed ? t.passes : t.fails}
          </span>
        )}
        <button type="button" className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-rose-50 hover:text-rose-800" onClick={() => setCheck(i, null)}
          data-testid={`check-${i}-remove`}>{t.removeCheck}</button>
        {(check.type === "required" || check.type === "forbidden") && productChecks(check, i)}
      </li>
    );
  };

  const tabs: [Tab, string][] = [["products", t.tabProducts], ["reference", t.tabReference], ["task", t.tabTask], ["checks", t.tabChecks]];
  const solutionRows = Object.entries(plan.solution ?? {});
  const setSolution = (rows: [string, number][]) => {
    const solution = Object.fromEntries(rows.filter(([id, g]) => ids.includes(id) && g > 0));
    commit({ ...plan, solution: Object.keys(solution).length ? solution : null });
  };
  const helperAnswer = extremeProduct(plan.products, helper.nutrient, helper.basis, helper.which);

  return (
    <div className="flex flex-col gap-3 font-sans text-sm text-slate-800">
      <div role="tablist" className="inline-flex self-start rounded-lg bg-slate-100 p-1" aria-label="Nutrition label">
        {tabs.map(([id, name]) => (
          <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} data-testid={`tab-${id}`} onClick={() => setTab(id)}
            className="rounded-md px-3 py-1 text-sm text-slate-600 aria-selected:bg-white aria-selected:text-slate-900 aria-selected:shadow-sm">{name}</button>
        ))}
      </div>

      {tab === "products" && (
        <div className="flex flex-col gap-2" role="tabpanel" id="panel-products" aria-labelledby="tab-products">
          <p className="m-0 max-w-[90ch] text-xs text-slate-600">{t.productsHint}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={button} data-testid="example" onClick={() => setProducts(toTSV(examplePlan(lang).products))}>{t.example}</button>
            <button type="button" className={button} data-testid="copy"
              onClick={() => navigator.clipboard?.writeText(toTSV(plan.products)).then(() => setNote(t.copied), () => setNote(""))}>{t.copy}</button>
            <span className="text-xs text-emerald-800">{note}</span>
            <span className="ml-auto text-xs text-slate-600" data-testid="parsed">{t.parsed(plan.products.length)}</span>
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            {t.productsTable}
            <textarea className={`${field} h-40 font-mono text-xs whitespace-pre`} value={tsv} spellcheck={false} data-testid="tsv" wrap="off"
              onInput={(e) => setProducts((e.target as HTMLTextAreaElement).value)} />
          </label>
          {lineProblems.length > 0 && (
            <ul className="m-0 list-none p-0 text-xs text-rose-800" data-testid="line-problems">
              {lineProblems.map((p, k) => <li key={k}>{t.line(p.line)}: {t.parseProblem[p.what](p.detail ?? "")}</li>)}
            </ul>
          )}
          <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-xs tabular-nums" data-testid="products-preview">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th scope="col" className="px-2 py-1 text-left">id</th>
                  <th scope="col" className="px-2 py-1 text-left">{t.product}</th>
                  <th scope="col" className="px-2 py-1 text-left">Schijf van Vijf</th>
                  <th scope="col" className="px-2 py-1 text-right">g</th>
                  {NUTRIENTS.map((n) => <th key={n} scope="col" className="px-2 py-1 text-right">{t.nutrientShort[n]}</th>)}
                </tr>
              </thead>
              <tbody>
                {plan.products.map((p: Product) => {
                  const v = withEnergy(p.per100);
                  return (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="px-2 py-0.5 font-mono">{p.id}</td>
                      <th scope="row" className="px-2 py-0.5 text-left font-normal">{p.name}</th>
                      <td className="px-2 py-0.5">{p.group ? t.groupShort[p.group] : "–"}</td>
                      <td className="px-2 py-0.5 text-right">{p.portion ? `${formatNumber(p.portion, lang)} ${p.portionLabel}` : "–"}</td>
                      {NUTRIENTS.map((n) => <td key={n} className="px-2 py-0.5 text-right">{v[n] === undefined ? "" : formatNumber(v[n]!, lang, 2)}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "reference" && (
        <div className="flex flex-col gap-2" role="tabpanel" id="panel-reference" aria-labelledby="tab-reference">
          <p className="m-0 max-w-[90ch] text-xs text-slate-600">{t.referenceHint}</p>
          <label className="inline-flex items-center gap-2">
            {t.targetGroup}
            <select className={field} value={plan.reference.group} data-testid="target-group" onChange={(e) => setReference((e.target as HTMLSelectElement).value as TargetGroup)}>
              {TARGET_GROUPS.map((g) => <option key={g} value={g}>{t.targetGroups[g]}</option>)}
            </select>
          </label>
          <table className="border-collapse text-sm">
            <tbody>
              {NUTRIENTS.map((n) => (
                <tr key={n}>
                  <th scope="row" className="py-0.5 pr-3 text-left font-normal">{t.nutrientShort[n]}</th>
                  <td className="py-0.5">
                    <NumberField value={plan.reference.values[n]} label={`${t.reference}: ${t.nutrientShort[n]}`} testid={`ri-${n}`} disabled={plan.reference.group !== "custom"}
                      onValue={(v) => {
                        const values = { ...plan.reference.values };
                        if (v === null || v <= 0) delete values[n];
                        else values[n] = v;
                        commit({ ...plan, reference: { group: "custom", values } });
                      }} />
                  </td>
                  <td className="py-0.5 pl-1 text-xs text-slate-600">{UNIT[n]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "task" && (
        <div className="flex flex-col gap-3" role="tabpanel" id="panel-task" aria-labelledby="tab-task">
          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1 font-semibold">{t.mode}</legend>
            {(["compose", "select", "tool"] as Mode[]).map((m) => (
              <label key={m} className="inline-flex items-center gap-2">
                <input type="radio" name="nl-authoring-mode" value={m} checked={mode === m} data-testid={`mode-${m}`} onChange={() => commit(plan, m)} />
                {t.modes[m]}
              </label>
            ))}
            <p className="m-0 text-xs text-slate-600">{t.modeHint}</p>
          </fieldset>

          {mode === "select" && (
            <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
              <label className="inline-flex items-center gap-2 font-medium">
                {t.answer}
                <select className={field} value={plan.answer ?? ""} data-testid="answer" onChange={(e) => commit({ ...plan, answer: (e.target as HTMLSelectElement).value || null })}>
                  <option value="">{t.answerNone}</option>
                  {plan.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {t.answerHelper}
                <select className={field} value={helper.which} aria-label={t.answerHelper} onChange={(e) => setHelper({ ...helper, which: (e.target as HTMLSelectElement).value as "max" | "min" })}>
                  <option value="max">{t.most}</option>
                  <option value="min">{t.least}</option>
                </select>
                <select className={field} value={helper.nutrient} aria-label={t.checkTypes.nutrient} data-testid="helper-nutrient"
                  onChange={(e) => setHelper({ ...helper, nutrient: (e.target as HTMLSelectElement).value as Nutrient })}>
                  {NUTRIENTS.map((n) => <option key={n} value={n}>{t.nutrientShort[n]}</option>)}
                </select>
                <select className={field} value={helper.basis} aria-label={t.perBasis.portion} data-testid="helper-basis"
                  onChange={(e) => setHelper({ ...helper, basis: (e.target as HTMLSelectElement).value as "portion" | "100g" })}>
                  <option value="portion">{t.perBasis.portion}</option>
                  <option value="100g">{t.perBasis["100g"]}</option>
                </select>
                <button type="button" className={button} disabled={!helperAnswer} data-testid="helper-fill" onClick={() => commit({ ...plan, answer: helperAnswer })}>{t.fill}</button>
                {!helperAnswer && <span className="text-rose-800">{t.tie}</span>}
              </div>
            </div>
          )}

          {mode !== "select" && (
            <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
              <h3 className="m-0 text-sm font-semibold">{t.solution}</h3>
              <p className="m-0 text-xs text-slate-600">{t.solutionHint}</p>
              <ul className="m-0 flex list-none flex-col gap-1 p-0" data-testid="solution">
                {solutionRows.map(([id, grams], k) => (
                  <li key={k} className="flex flex-wrap items-center gap-2">
                    <select className={field} value={id} aria-label={`${t.solution}: ${t.product} ${k + 1}`} data-testid={`solution-${k}-product`}
                      onChange={(e) => setSolution(solutionRows.map((r, j) => (j === k ? [(e.target as HTMLSelectElement).value, r[1]] : r)))}>
                      {plan.products.map((p) => <option key={p.id} value={p.id} disabled={p.id !== id && solutionRows.some(([x]) => x === p.id)}>{p.name}</option>)}
                    </select>
                    <NumberField value={grams} label={`${t.solution}: ${t.gramsLong} ${k + 1}`} testid={`solution-${k}-grams`}
                      onValue={(v) => v !== null && v > 0 && setSolution(solutionRows.map((r, j) => (j === k ? [r[0], v] : r)))} />
                    <span className="text-xs">g</span>
                    <button type="button" className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-rose-50" data-testid={`solution-${k}-remove`}
                      onClick={() => setSolution(solutionRows.filter((_, j) => j !== k))}>{t.removeCheck}</button>
                  </li>
                ))}
              </ul>
              <button type="button" className={`${button} self-start`} data-testid="solution-add" disabled={solutionRows.length >= plan.products.length}
                onClick={() => {
                  const free = plan.products.find((p) => !solutionRows.some(([x]) => x === p.id));
                  if (free) setSolution([...solutionRows, [free.id, free.portion || 100]]);
                }}>{t.addRow}</button>
              {mode === "compose" && <p className="m-0 text-xs text-slate-600" data-testid="solution-score">{evaluation ? t.solutionScore(evaluation.score, evaluation.maxscore) : t.noSolution}</p>}
            </div>
          )}
        </div>
      )}

      {tab === "checks" && (
        <div className="flex flex-col gap-2" role="tabpanel" id="panel-checks" aria-labelledby="tab-checks">
          <p className="m-0 text-xs text-slate-600">{t.checksHint}</p>
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">{plan.checks.map(checkEditor)}</ol>
          <button type="button" className={`${button} self-start`} disabled={plan.checks.length >= MAX_CHECKS} data-testid="add-check"
            onClick={() => commit({ ...plan, checks: [...plan.checks, { type: "nutrient", nutrient: "energyKj", max: 2500, points: 1 }] })}>{t.addCheck}</button>
          <p className="m-0 text-xs text-slate-600" data-testid="checks-score">{evaluation ? t.solutionScore(evaluation.score, evaluation.maxscore) : t.noSolution}</p>
        </div>
      )}

      <div className="text-slate-700" data-testid="problems" role="status">
        {problems.map((p) => <p key={p} className="m-0 text-rose-800"><span aria-hidden="true">⚠ </span>{p}</p>)}
      </div>
    </div>
  );
};

export default Authoring;
