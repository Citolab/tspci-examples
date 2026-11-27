import { useMemo, useState } from "preact/hooks";
import { NumberField, TimeField } from "./authoring";
import RotaEditor from "./rotaEditor";
import {
  DAY_CODES, Day, MAX_EMPLOYEES, MAX_QUESTIONS, MAX_RULES, MAX_TEMPLATES, MAX_BREAK, BREAK_STEP, QUESTION_KINDS, Question, QuestionKind, ROTA_SLOTS,
  RULE_TYPES, Rota, RotaMode, Rule, RuleType, clock, correctAnswer, evaluateRules, formatNumber, isWhoQuestion, parseRota, payOf, serializeRota,
} from "./rota";
import { RotaTexts, rotaTextsFor } from "./rotaTexts";
import { questionText } from "./rotaViews";

// The authoring mode of the rota modes (index.tsx getAuthoringInstance with data-mode readRota, makeRota or
// hoursAndPay): the shop's days and opening hours, the employees, the shift cards, the rules, the questions, the pay,
// and the rota itself, made with the candidate's editor. The result is data-rota (rota.ts).

/** What keeps the rota from being used (getAuthoringInstance validate()). */
export const rotaProblems = (r: Rota, mode: RotaMode, language: string): string[] => {
  const t = rotaTextsFor(language);
  const problems: string[] = [];
  for (const d of r.days) if (d.close <= d.open) problems.push(t.problemOpen(t.days[DAY_CODES.indexOf(d.day)]));
  const shifts = r.shifts ?? [];
  if (mode === "readRota") {
    if (!r.questions.length) problems.push(t.problemNoQuestions);
    if (!shifts.length) problems.push(t.problemNoRota);
    r.questions.forEach((q, i) => {
      if (q.kind === "number" && !q.text.trim()) problems.push(t.problemNumber(i + 1));
      const a = correctAnswer(r, shifts, q);
      if (shifts.length && isWhoQuestion(q) && Array.isArray(a) && !a.length) problems.push(t.problemNobody(i + 1));
    });
  } else if (mode === "makeRota") {
    if (!r.rules.length) problems.push(t.problemNoRules);
    if (!r.templates.length) problems.push(t.problemNoTemplates);
    if (r.shifts) evaluateRules(r, r.shifts).results.forEach((x, i) => !x.passed && problems.push(t.problemRule(i + 1)));
  } else if (r.own) {
    if (!r.templates.length) problems.push(t.problemNoTemplates);
  } else if (!shifts.length) problems.push(t.problemNoRota);
  return problems;
};

/** Through the JSON and back: everything fitted to the rota (columns, days, employees). */
const tidy = (r: Rota) => parseRota(serializeRota(r));
const nextId = (prefix: string, ids: string[]) => {
  let n = ids.length + 1;
  while (ids.includes(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};

const button = "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-sky-600";
const field = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-sky-600";
const small = "rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-rose-50 hover:text-rose-700";
const hint = "m-0 text-xs text-slate-500";

type Tab = "shop" | "employees" | "templates" | "rules" | "questions" | "pay" | "rota";

const newRule = (type: RuleType): Rule => {
  switch (type) {
    case "coverage": return { type, staff: 2, points: 1 };
    case "contractHours": case "available": return { type, points: 1 };
    case "maxShift": return { type, hours: 9, points: 1 };
    case "break": return { type, hours: 5.5, minutes: 30, points: 1 };
    case "rest": return { type, hours: 11, points: 1 };
    case "weekend": return { type, days: 1, points: 1 };
  }
};

const RotaAuthoring = ({ initial, mode, language, onChange }: { initial: Rota; mode: RotaMode; language: string; onChange: (r: Rota) => void }) => {
  const t: RotaTexts = rotaTextsFor(language);
  const [rota, setRota] = useState<Rota>(initial);
  const tabs: [Tab, string][] = [
    ["shop", t.tabShop], ["employees", t.tabEmployees],
    ...(mode === "makeRota" || (mode === "hoursAndPay" && rota.own) ? [["templates", t.tabTemplates] as [Tab, string]] : []),
    ...(mode === "makeRota" ? [["rules", t.tabRules] as [Tab, string]] : []),
    ...(mode === "readRota" ? [["questions", t.tabQuestions] as [Tab, string]] : []),
    ...(mode === "hoursAndPay" ? [["pay", t.tabPay] as [Tab, string]] : []),
    ["rota", t.tabRota(mode)],
  ];
  const [chosen, setTab] = useState<Tab>("shop");
  const tab: Tab = tabs.some(([id]) => id === chosen) ? chosen : "shop"; // a tab that is gone (own rota unticked)
  const commit = (next: Rota, fit = false) => {
    const value = fit ? tidy(next) : next;
    setRota(value);
    onChange(value);
  };
  const r = rota;
  const problems = rotaProblems(r, mode, language);
  const evaluation = useMemo(() => (mode === "makeRota" && r.shifts ? evaluateRules(r, r.shifts) : null), [r, mode]);
  const dayName = (d: Day) => t.days[DAY_CODES.indexOf(d)];
  const name = (id: string) => r.employees.find((e) => e.id === id)?.name ?? id;
  const num = (n: number) => formatNumber(n, language);

  const daySelect = (value: Day, onSelect: (d: Day) => void, testid: string) => (
    <select className={field} value={value} data-testid={testid} aria-label={t.day} onChange={(e) => onSelect((e.target as HTMLSelectElement).value as Day)}>
      {r.days.map((d) => <option key={d.day} value={d.day}>{dayName(d.day)}</option>)}
    </select>
  );
  const employeeSelect = (value: string, onSelect: (id: string) => void, testid: string) => (
    <select className={field} value={value} data-testid={testid} aria-label={t.employeeLabel} onChange={(e) => onSelect((e.target as HTMLSelectElement).value)}>
      {r.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
    </select>
  );
  const breakSelect = (value: number, onSelect: (m: number) => void, testid: string) => (
    <select className={field} value={value} data-testid={testid} aria-label={t.breakMinutes} onChange={(e) => onSelect(Number((e.target as HTMLSelectElement).value))}>
      {Array.from({ length: MAX_BREAK / BREAK_STEP + 1 }, (_, i) => i * BREAK_STEP).map((m) => <option key={m} value={m}>{m}</option>)}
    </select>
  );

  // --- tabs

  const shopTab = (
    <div className="flex flex-col gap-3" role="tabpanel">
      <p className={hint}>{t.shopHint}</p>
      <table className="border-collapse text-sm">
        <thead><tr className="text-left text-xs text-slate-500"><th className="pr-3 font-normal">{t.dayOpen}</th><th className="pr-3 font-normal">{t.openFrom}</th><th className="font-normal">{t.openTo}</th></tr></thead>
        <tbody>
          {DAY_CODES.map((d) => {
            const day = r.days.find((x) => x.day === d);
            const set = (patch: Partial<{ open: number; close: number }>) => commit({ ...r, days: r.days.map((x) => (x.day === d ? { ...x, ...patch } : x)) }, true);
            return (
              <tr key={d}>
                <td className="py-0.5 pr-3">
                  <label className="inline-flex items-center gap-1.5">
                    <input type="checkbox" checked={!!day} data-testid={`day-${d}`} disabled={!!day && r.days.length === 1}
                      onChange={(e) => {
                        const on = (e.target as HTMLInputElement).checked;
                        const days = on ? [...r.days, { day: d, open: r.days[0]?.open ?? 9 * 60, close: r.days[0]?.close ?? 17 * 60 }] : r.days.filter((x) => x.day !== d);
                        commit({ ...r, days }, true);
                      }} />
                    {dayName(d)}
                  </label>
                </td>
                <td className="py-0.5 pr-3">{day && <TimeField value={day.open} step={15} label={`${dayName(d)}: ${t.openFrom}`} testid={`open-${d}`} onChange={(m) => set({ open: m })} />}</td>
                <td className="py-0.5">{day && <TimeField value={day.close} step={15} label={`${dayName(d)}: ${t.openTo}`} testid={`close-${d}`} onChange={(m) => set({ close: m })} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500">{t.axisFrom}
          <TimeField value={r.start} step={r.slot} label={t.axisFrom} testid="axis-start" onChange={(m) => commit({ ...r, start: m }, true)} /></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">{t.axisTo}
          <TimeField value={r.end} step={r.slot} label={t.axisTo} testid="axis-end" onChange={(m) => commit({ ...r, end: m }, true)} /></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">{t.slot}
          <select className={field} value={r.slot} data-testid="slot" onChange={(e) => commit({ ...r, slot: Number((e.target as HTMLSelectElement).value) }, true)}>
            {ROTA_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select></label>
      </div>
    </div>
  );

  const employeesTab = (
    <div className="flex flex-col gap-2" role="tabpanel">
      <p className={hint}>{t.employeesHint}</p>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {r.employees.map((e, i) => {
          const set = (patch: Partial<typeof e>, fit = false) => commit({ ...r, employees: r.employees.map((x) => (x.id === e.id ? { ...x, ...patch } : x)) }, fit);
          return (
            <li key={e.id} className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-2" data-testid={`employee-${i}`}>
              <div className="flex flex-wrap items-center gap-2">
                <input className={`${field} w-40`} value={e.name} aria-label={`${t.name} ${i + 1}`} data-testid={`employee-${i}-name`}
                  onInput={(ev) => set({ name: (ev.target as HTMLInputElement).value })} />
                <code className="text-xs text-slate-500">{e.id}</code>
                <label className="inline-flex items-center gap-1 text-xs text-slate-500">{t.minHours}
                  <NumberField value={e.min} language={language} label={`${e.name}: ${t.minHours}`} testid={`employee-${i}-min`} onChange={(n) => set({ min: n, max: Math.max(n, e.max) }, true)} /></label>
                <label className="inline-flex items-center gap-1 text-xs text-slate-500">{t.maxHours}
                  <NumberField value={e.max} language={language} label={`${e.name}: ${t.maxHours}`} testid={`employee-${i}-max`} onChange={(n) => set({ max: n, min: Math.min(n, e.min) }, true)} /></label>
                <label className="inline-flex items-center gap-1 text-xs text-slate-500">{t.wage}
                  <NumberField value={e.wage} language={language} label={`${e.name}: ${t.wage}`} testid={`employee-${i}-wage`} onChange={(n) => set({ wage: n }, true)} /></label>
                <button type="button" className={`${small} ml-auto`} disabled={r.employees.length < 2} data-testid={`employee-${i}-delete`}
                  onClick={() => commit({ ...r, employees: r.employees.filter((x) => x.id !== e.id), shifts: r.shifts?.filter((s) => s.employee !== e.id) ?? null }, true)}>{t.delete}</button>
              </div>
              <fieldset className="m-0 flex flex-wrap items-center gap-3 border-0 p-0 text-xs text-slate-600">
                <legend className="float-left mr-2 text-slate-500">{t.cannotWork}</legend>
                {r.days.map((d) => (
                  <label key={d.day} className="inline-flex items-center gap-1">
                    <input type="checkbox" checked={e.unavailable.includes(d.day)} data-testid={`employee-${i}-off-${d.day}`}
                      onChange={(ev) => {
                        const on = (ev.target as HTMLInputElement).checked;
                        set({ unavailable: DAY_CODES.filter((x) => (x === d.day ? on : e.unavailable.includes(x))) });
                      }} />
                    {dayName(d.day)}
                  </label>
                ))}
              </fieldset>
            </li>
          );
        })}
      </ul>
      <div><button type="button" className={button} disabled={r.employees.length >= MAX_EMPLOYEES} data-testid="add-employee"
        onClick={() => {
          const id = nextId("e", r.employees.map((e) => e.id));
          commit({ ...r, employees: [...r.employees, { id, name: `${t.employee} ${r.employees.length + 1}`, min: 8, max: 16, wage: 12, unavailable: [] }] }, true);
        }}>+ {t.add}</button></div>
    </div>
  );

  const templatesTab = (
    <div className="flex flex-col gap-2" role="tabpanel">
      <p className={hint}>{t.templatesHint}</p>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {r.templates.map((x, i) => {
          const set = (patch: Partial<typeof x>, fit = false) => commit({ ...r, templates: r.templates.map((y) => (y.id === x.id ? { ...y, ...patch } : y)) }, fit);
          return (
            <li key={x.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2" data-testid={`template-${i}`}>
              <input className={`${field} w-40`} value={x.label} aria-label={`${t.label} ${i + 1}`} data-testid={`template-${i}-label`} onInput={(e) => set({ label: (e.target as HTMLInputElement).value })} />
              <TimeField value={x.start} step={r.slot} label={`${x.label}: ${t.start}`} testid={`template-${i}-start`} onChange={(m) => set({ start: m, end: Math.max(x.end, m + r.slot) }, true)} />
              <TimeField value={x.end} step={r.slot} label={`${x.label}: ${t.end}`} testid={`template-${i}-end`} onChange={(m) => m > x.start && set({ end: m }, true)} />
              <label className="inline-flex items-center gap-1 text-xs text-slate-500">{t.breakMinutes}{breakSelect(x.break, (m) => set({ break: m }, true), `template-${i}-break`)}</label>
              <button type="button" className={`${small} ml-auto`} data-testid={`template-${i}-delete`} onClick={() => commit({ ...r, templates: r.templates.filter((y) => y.id !== x.id) })}>{t.delete}</button>
            </li>
          );
        })}
      </ul>
      <div><button type="button" className={button} disabled={r.templates.length >= MAX_TEMPLATES} data-testid="add-template"
        onClick={() => commit({ ...r, templates: [...r.templates, { id: nextId("s", r.templates.map((x) => x.id)), label: "", start: r.days[0].open, end: Math.min(r.end, r.days[0].open + 240), break: 0 }] }, true)}>
        + {t.add}</button></div>
    </div>
  );

  const setRule = (i: number, rule: Rule | null) => {
    const rules = [...r.rules];
    if (rule) rules[i] = rule;
    else rules.splice(i, 1);
    commit({ ...r, rules });
  };
  const ruleEditor = (c: Rule, i: number) => {
    const passed = evaluation?.results[i]?.passed;
    const set = (patch: Partial<Rule>) => setRule(i, { ...c, ...patch } as Rule);
    const number = (value: number, key: string, label: string) => (
      <label className="inline-flex items-center gap-1 text-xs text-slate-500">
        <NumberField value={value} language={language} label={`${label}: ${t.ruleName[c.type]}`} testid={`rule-${i}-${key}`} onChange={(n) => set({ [key]: n } as Partial<Rule>)} />{label}</label>
    );
    return (
      <li key={i} className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-2" data-testid={`rule-${i}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`grid size-6 place-items-center rounded-full text-xs font-bold ${passed === undefined ? "bg-slate-100 text-slate-400" : passed ? "bg-sky-100 text-sky-800" : "bg-orange-100 text-orange-800"}`}
            aria-label={passed === undefined ? t.noSolution : passed ? "✓" : "✗"} data-testid={`rule-${i}-mark`}>
            {passed === undefined ? i + 1 : passed ? "✓" : "✗"}
          </span>
          <span className="font-mono text-xs text-slate-500">check{i + 1}</span>
          <select className={field} value={c.type} data-testid={`rule-${i}-type`} aria-label={`check${i + 1}`}
            onChange={(e) => setRule(i, { ...newRule((e.target as HTMLSelectElement).value as RuleType), points: c.points })}>
            {RULE_TYPES.map((type) => <option key={type} value={type}>{t.ruleName[type]}</option>)}
          </select>
          {c.type === "coverage" && number(c.staff, "staff", t.staff)}
          {(c.type === "maxShift" || c.type === "break" || c.type === "rest") && number(c.hours, "hours", t.hoursLabel)}
          {c.type === "break" && number(c.minutes, "minutes", t.minutesLabel)}
          {c.type === "weekend" && number(c.days, "days", t.daysLabel)}
          <span className="ml-auto inline-flex shrink-0 items-center gap-1">
            <label className="inline-flex items-center gap-1 text-xs text-slate-500">
              {t.points}
              <input type="number" min={0} max={10} className={`${field} w-14`} value={c.points} data-testid={`rule-${i}-points`} aria-label={`${t.points}: check${i + 1}`}
                onInput={(e) => set({ points: Math.max(0, Math.round(Number((e.target as HTMLInputElement).value) || 0)) })} />
            </label>
            <button type="button" className={small} onClick={() => setRule(i, null)} data-testid={`rule-${i}-remove`}>{t.removeRule}</button>
          </span>
        </div>
        <p className="m-0 pl-8 text-xs text-slate-600" data-testid={`rule-${i}-text`}>{t.ruleText(c)}</p>
      </li>
    );
  };
  const rulesTab = (
    <div className="flex flex-col gap-2" role="tabpanel">
      <p className={hint}>{t.rulesHint}</p>
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">{r.rules.map(ruleEditor)}</ol>
      <div><button type="button" className={button} disabled={r.rules.length >= MAX_RULES} data-testid="add-rule"
        onClick={() => commit({ ...r, rules: [...r.rules, newRule("coverage")] }, true)}>+ {t.addRule}</button></div>
    </div>
  );

  const answerText = (q: Question) => {
    const a = correctAnswer(r, r.shifts ?? [], q);
    if (a === "free") return t.doesNotWork;
    if (typeof a === "number") return q.kind === "hours" ? t.hours(a) : num(a);
    if (Array.isArray(a)) return a.length ? a.map(name).join(", ") : t.nobody;
    return `${clock(a.start)}–${clock(a.end)}`;
  };
  const questionEditor = (q: Question, i: number) => {
    const set = (patch: Partial<Question>) => commit({ ...r, questions: r.questions.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
    const generated = q.kind === "number" ? t.questionPlaceholder : questionText(r, { ...q, text: "" }, t);
    return (
      <li key={i} className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-2" data-testid={`question-${i}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-slate-500">question{i + 1}</span>
          <select className={field} value={q.kind} data-testid={`question-${i}-kind`} aria-label={`${t.kind}: question${i + 1}`}
            onChange={(e) => set({ kind: (e.target as HTMLSelectElement).value as QuestionKind })}>
            {QUESTION_KINDS.map((k) => <option key={k} value={k}>{t.kindName[k]}</option>)}
          </select>
          {(q.kind === "shift" || q.kind === "hours") && employeeSelect(q.employee, (employee) => set({ employee }), `question-${i}-employee`)}
          {q.kind !== "hours" && q.kind !== "number" && daySelect(q.day, (day) => set({ day }), `question-${i}-day`)}
          {(q.kind === "whoAt" || q.kind === "staffAt") && <TimeField value={q.time} step={15} label={t.time} testid={`question-${i}-time`} onChange={(time) => set({ time })} />}
          {q.kind === "number" && (
            <label className="inline-flex items-center gap-1 text-xs text-slate-500">{t.answerLabel}
              <NumberField value={q.answer} language={language} label={t.answerLabel} testid={`question-${i}-answer`} onChange={(answer) => set({ answer })} /></label>
          )}
          <span className="ml-auto inline-flex shrink-0 items-center gap-1">
            <label className="inline-flex items-center gap-1 text-xs text-slate-500">
              {t.points}
              <input type="number" min={0} max={10} className={`${field} w-14`} value={q.points} data-testid={`question-${i}-points`} aria-label={`${t.points}: question${i + 1}`}
                onInput={(e) => set({ points: Math.max(0, Math.round(Number((e.target as HTMLInputElement).value) || 0)) })} />
            </label>
            <button type="button" className={small} onClick={() => commit({ ...r, questions: r.questions.filter((_, j) => j !== i) })} data-testid={`question-${i}-remove`}>{t.removeRule}</button>
          </span>
        </div>
        <input className={`${field} w-full`} value={q.text} placeholder={generated} aria-label={`${t.label}: question${i + 1}`} data-testid={`question-${i}-text`}
          onInput={(e) => set({ text: (e.target as HTMLInputElement).value })} />
        <p className="m-0 text-xs text-slate-600" data-testid={`question-${i}-answer-text`}>{t.answerIs(answerText(q))}</p>
      </li>
    );
  };
  const questionsTab = (
    <div className="flex flex-col gap-2" role="tabpanel">
      <p className={hint}>{t.questionsHint}</p>
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">{r.questions.map(questionEditor)}</ol>
      <div><button type="button" className={button} disabled={r.questions.length >= MAX_QUESTIONS} data-testid="add-question"
        onClick={() => commit({ ...r, questions: [...r.questions, { kind: "shift", text: "", employee: r.employees[0].id, day: r.days[0].day, time: 12 * 60, answer: 0, points: 1 }] })}>
        + {t.addQuestion}</button></div>
    </div>
  );

  const payTab = (
    <div className="flex flex-col gap-3" role="tabpanel">
      <p className={hint}>{t.payHint}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500">{t.sunday}
          <NumberField value={r.pay.sunday} language={language} label={t.sunday} testid="pay-sunday" onChange={(n) => commit({ ...r, pay: { ...r.pay, sunday: n } }, true)} /></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">{t.evening}
          <NumberField value={r.pay.evening} language={language} label={t.evening} testid="pay-evening" onChange={(n) => commit({ ...r, pay: { ...r.pay, evening: n } }, true)} /></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">{t.eveningFrom}
          <TimeField value={r.pay.eveningFrom} step={15} label={t.eveningFrom} testid="pay-evening-from" onChange={(m) => commit({ ...r, pay: { ...r.pay, eveningFrom: m } })} /></label>
      </div>
      <label className="inline-flex items-center gap-1.5 text-sm">
        <input type="checkbox" checked={r.pay.askPay} data-testid="ask-pay" onChange={(e) => commit({ ...r, pay: { ...r.pay, askPay: (e.target as HTMLInputElement).checked } })} />{t.askPay}
      </label>
      <table className="border-collapse text-sm" data-testid="pay-preview">
        <thead><tr className="text-left text-xs text-slate-500"><th className="pr-4 font-normal">{t.employee}</th><th className="pr-4 font-normal">{t.hoursWorked}</th><th className="font-normal">{t.pay}</th></tr></thead>
        <tbody>
          {r.employees.map((e) => {
            const p = payOf(r, r.shifts ?? [], e.id);
            return <tr key={e.id}><td className="pr-4">{e.name}</td><td className="pr-4 tabular-nums">{t.hours(p.minutes / 60)}</td><td className="tabular-nums">{t.money(p.cents / 100)}</td></tr>;
          })}
        </tbody>
      </table>
    </div>
  );

  const rotaTab = (
    <div className="flex flex-col gap-2" role="tabpanel">
      {mode === "hoursAndPay" && (
        <label className="inline-flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={r.own} data-testid="own-rota" onChange={(e) => commit({ ...r, own: (e.target as HTMLInputElement).checked })} />{t.ownRota}
        </label>
      )}
      <p className={hint}>{t.rotaHint(mode, r.own)}</p>
      <RotaEditor key="rota" rota={mode === "makeRota" ? r : { ...r, rules: [] }} shifts={r.shifts ?? []} texts={t} testid="rota-solution" showHours={mode === "makeRota"}
        feedback={mode === "makeRota"} onChange={(shifts) => commit({ ...r, shifts: shifts.length ? shifts : null })} />
      <div><button type="button" className={button} disabled={!r.shifts} onClick={() => commit({ ...r, shifts: null })} data-testid="clear-rota">{t.clearRota(mode)}</button></div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 font-sans text-sm text-slate-800">
      <p className="m-0 text-slate-600" data-testid="mode-hint">{t.modeHint(mode, r.own)}</p>
      <div role="tablist" className="inline-flex flex-wrap self-start rounded-lg bg-slate-100 p-1">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} data-testid={`tab-${id}`} onClick={() => setTab(id)}
            className="rounded-md px-3 py-1 text-sm text-slate-600 aria-selected:bg-white aria-selected:text-slate-900 aria-selected:shadow-sm">{label}</button>
        ))}
      </div>
      {tab === "shop" && shopTab}
      {tab === "employees" && employeesTab}
      {tab === "templates" && templatesTab}
      {tab === "rules" && rulesTab}
      {tab === "questions" && questionsTab}
      {tab === "pay" && payTab}
      {tab === "rota" && rotaTab}
      <p className="m-0 text-slate-600" data-testid="summary">
        {evaluation ? t.summary(evaluation.score, evaluation.maxscore) : r.shifts ? t.shiftsInRota(r.shifts.length) : mode === "makeRota" ? t.noSolution : t.noRota}
        {problems.map((x) => <span key={x} className="ml-2 text-orange-800"><span aria-hidden="true">⚠ </span>{x}</span>)}
      </p>
    </div>
  );
};

export default RotaAuthoring;
