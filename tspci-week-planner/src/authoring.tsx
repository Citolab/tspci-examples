import { useMemo, useState } from "preact/hooks";
import Agenda from "./agenda";
import {
  CHECK_TYPES, Check, CheckType, DAY_CODES, Day, MAX_CHECKS, MAX_RESOURCES, MAX_TASKS, Planner, SLOTS, checkTasks, clock, evaluate,
  formatNumber, parseNumber, parsePlanner, serializePlanner, taskOf, toMinutes,
} from "./planner";
import { Texts, textsFor } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance): the agenda grid, the resources, the fixed blocks, the tasks,
// the checks with points, and an example solution that previews the checks. The result is data-planner (planner.ts).

/** What keeps the planner from being used (getAuthoringInstance validate()). */
export const authoringProblems = (p: Planner, language: string): string[] => {
  const t = textsFor(language);
  const problems: string[] = [];
  if (!p.tasks.length) problems.push(t.problemNoTasks);
  if (!p.checks.length) problems.push(t.problemNoChecks);
  if (p.open.start >= p.open.end) problems.push(t.problemOpen);
  p.checks.forEach((c, i) => {
    if (checkTasks(c).some((id) => !taskOf(p, id))) problems.push(t.problemTaskMissing(i + 1));
  });
  if (p.solution) evaluate(p, p.solution).results.forEach((r, i) => !r.passed && problems.push(t.problemCheck(i + 1)));
  return problems;
};

/** Through the JSON and back: everything fitted to the agenda (rows, lengths, resources). */
const tidy = (p: Planner) => parsePlanner(JSON.parse(serializePlanner(p)));
const nextId = (prefix: string, ids: string[]) => {
  let n = ids.length + 1;
  while (ids.includes(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};

const button = "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-sky-600";
const field = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-sky-600";
const small = "rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-rose-50 hover:text-rose-700";

type Tab = "agenda" | "resources" | "fixed" | "tasks" | "checks" | "solution";

const newCheck = (type: CheckType, p: Planner): Check => {
  const a = p.tasks[0]?.id ?? "", b = p.tasks[1]?.id ?? a;
  switch (type) {
    case "allPlanned": case "noOverlap": case "openingHours": return { type, points: 1 };
    case "before": case "sameDay": return { type, a, b, points: 1 };
    case "gap": return { type, a, b, hours: 24, points: 1 };
    case "notOnDay": return { type, task: a, day: p.days[2] ?? p.days[0], points: 1 };
    case "maxHours": return { type, hours: 8, points: 1 };
    case "break": return { type, hours: 4, minutes: 30, points: 1 };
  }
};

/** A number field that takes a decimal comma (Dutch) or point. */
const NumberField = ({ value, onChange, language, testid, label, width = "w-16" }: {
  value: number; onChange: (n: number) => void; language: string; testid?: string; label: string; width?: string;
}) => (
  <input type="text" inputMode="decimal" className={`${field} ${width}`} value={formatNumber(value, language)} data-testid={testid} aria-label={label}
    onChange={(e) => {
      const n = parseNumber((e.target as HTMLInputElement).value);
      if (n !== null && n >= 0) onChange(n);
      else (e.target as HTMLInputElement).value = formatNumber(value, language);
    }} />
);

const TimeField = ({ value, onChange, label, testid, step }: { value: number; onChange: (m: number) => void; label: string; testid?: string; step: number }) => (
  <input type="time" className={`${field} w-28`} value={clock(value)} step={step * 60} aria-label={label} data-testid={testid}
    onChange={(e) => {
      const m = toMinutes((e.target as HTMLInputElement).value);
      if (m !== null) onChange(m);
    }} />
);

const Authoring = ({ initial, language, onChange }: { initial: Planner; language: string; onChange: (p: Planner) => void }) => {
  const t: Texts = textsFor(language);
  const [planner, setPlanner] = useState<Planner>(initial);
  const [tab, setTab] = useState<Tab>("agenda");
  const commit = (next: Planner, fit = false) => {
    const value = fit ? tidy(next) : next;
    setPlanner(value);
    onChange(value);
  };
  const p = planner;
  const problems = authoringProblems(p, language);
  const evaluation = useMemo(() => (p.solution ? evaluate(p, p.solution) : null), [p]);
  const dayName = (d: Day) => t.days[DAY_CODES.indexOf(d)];
  const taskName = (id: string) => taskOf(p, id)?.label || id || "?";

  const resourceSelect = (value: string, onSelect: (v: string) => void, none: string, testid: string, label: string) => (
    <select className={field} value={value} data-testid={testid} aria-label={label} onChange={(e) => onSelect((e.target as HTMLSelectElement).value)}>
      <option value="">{none}</option>
      {p.resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
    </select>
  );
  const daySelect = (value: Day, onSelect: (d: Day) => void, testid: string, days: readonly Day[] = p.days) => (
    <select className={field} value={value} data-testid={testid} aria-label={t.day} onChange={(e) => onSelect((e.target as HTMLSelectElement).value as Day)}>
      {(days.includes(value) ? days : [value, ...days]).map((d) => <option key={d} value={d}>{dayName(d)}</option>)}
    </select>
  );
  const taskSelect = (value: string, onSelect: (id: string) => void, testid: string, all?: string) => (
    <select className={field} value={value} data-testid={testid} aria-label={t.task} onChange={(e) => onSelect((e.target as HTMLSelectElement).value)}>
      {all !== undefined && <option value="">{all}</option>}
      {!taskOf(p, value) && value && <option value={value}>{value} ?</option>}
      {p.tasks.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
    </select>
  );

  // --- tabs

  const agendaTab = (
    <div className="flex flex-col gap-3" role="tabpanel">
      <p className="m-0 text-xs text-slate-500">{t.agendaHint}</p>
      <fieldset className="m-0 flex flex-wrap gap-3 border-0 p-0">
        <legend className="mb-1 text-xs text-slate-500">{t.daysLabel}</legend>
        {DAY_CODES.map((d) => (
          <label key={d} className="inline-flex items-center gap-1">
            <input type="checkbox" checked={p.days.includes(d)} data-testid={`day-${d}`} disabled={p.days.length === 1 && p.days.includes(d)}
              onChange={(e) => {
                const on = (e.target as HTMLInputElement).checked;
                commit({ ...p, days: DAY_CODES.filter((x) => (x === d ? on : p.days.includes(x))) }, true);
              }} />
            {dayName(d)}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500">{t.startTime}
          <TimeField value={p.start} step={p.slot} label={t.startTime} testid="start" onChange={(m) => commit({ ...p, start: m, open: { ...p.open, start: Math.max(m, p.open.start) } }, true)} /></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">{t.endTime}
          <TimeField value={p.end} step={p.slot} label={t.endTime} testid="end" onChange={(m) => commit({ ...p, end: m, open: { ...p.open, end: Math.min(m, p.open.end) } }, true)} /></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">{t.slot}
          <select className={field} value={p.slot} data-testid="slot" onChange={(e) => commit({ ...p, slot: Number((e.target as HTMLSelectElement).value) }, true)}>
            {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">{t.openFrom}
          <TimeField value={p.open.start} step={p.slot} label={t.openFrom} testid="open-start" onChange={(m) => commit({ ...p, open: { ...p.open, start: m } }, true)} /></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">{t.openTo}
          <TimeField value={p.open.end} step={p.slot} label={t.openTo} testid="open-end" onChange={(m) => commit({ ...p, open: { ...p.open, end: m } }, true)} /></label>
      </div>
    </div>
  );

  const resourcesTab = (
    <div className="flex flex-col gap-2" role="tabpanel">
      <p className="m-0 text-xs text-slate-500">{t.resourcesHint}</p>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {p.resources.map((r, i) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2" data-testid={`resource-${i}`}>
            <input className={`${field} w-64`} value={r.name} aria-label={`${t.name} ${i + 1}`} data-testid={`resource-${i}-name`}
              onInput={(e) => commit({ ...p, resources: p.resources.map((x) => (x.id === r.id ? { ...x, name: (e.target as HTMLInputElement).value } : x)) })} />
            <code className="text-xs text-slate-500">{r.id}</code>
            <button type="button" className={small} disabled={p.resources.length < 2} data-testid={`resource-${i}-delete`}
              onClick={() => commit({
                ...p,
                resources: p.resources.filter((x) => x.id !== r.id),
                fixed: p.fixed.filter((f) => f.resource !== r.id),
                tasks: p.tasks.map((x) => (x.resource === r.id ? { ...x, resource: "" } : x)),
                solution: p.solution?.filter((x) => x.resource !== r.id) ?? null,
              }, true)}>{t.delete}</button>
          </li>
        ))}
      </ul>
      <div><button type="button" className={button} disabled={p.resources.length >= MAX_RESOURCES} data-testid="add-resource"
        onClick={() => {
          const id = nextId("r", p.resources.map((r) => r.id));
          commit({ ...p, resources: [...p.resources, { id, name: `${t.resource} ${p.resources.length + 1}` }] });
        }}>+ {t.add}</button></div>
    </div>
  );

  const fixedTab = (
    <div className="flex flex-col gap-2" role="tabpanel">
      <p className="m-0 text-xs text-slate-500">{t.fixedHint}</p>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {p.fixed.map((f, i) => {
          const set = (patch: Partial<typeof f>, fit = false) => commit({ ...p, fixed: p.fixed.map((x) => (x.id === f.id ? { ...x, ...patch } : x)) }, fit);
          return (
            <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2" data-testid={`fixed-${i}`}>
              <input className={`${field} w-44`} value={f.label} aria-label={t.label} data-testid={`fixed-${i}-label`} onInput={(e) => set({ label: (e.target as HTMLInputElement).value })} />
              {resourceSelect(f.resource, (v) => set({ resource: v }), t.everyone, `fixed-${i}-resource`, t.resource)}
              {daySelect(f.day, (d) => set({ day: d }), `fixed-${i}-day`)}
              <TimeField value={f.start} step={p.slot} label={t.start} testid={`fixed-${i}-start`} onChange={(m) => set({ start: m, end: Math.max(f.end, m + p.slot) }, true)} />
              <TimeField value={f.end} step={p.slot} label={t.end} testid={`fixed-${i}-end`} onChange={(m) => m > f.start && set({ end: m }, true)} />
              <label className="inline-flex items-center gap-1 text-xs">
                <input type="checkbox" checked={f.work} data-testid={`fixed-${i}-work`} onChange={(e) => set({ work: (e.target as HTMLInputElement).checked })} />{t.work}
              </label>
              <button type="button" className={`${small} ml-auto`} data-testid={`fixed-${i}-delete`} onClick={() => commit({ ...p, fixed: p.fixed.filter((x) => x.id !== f.id) })}>{t.delete}</button>
            </li>
          );
        })}
      </ul>
      <div><button type="button" className={button} data-testid="add-fixed"
        onClick={() => commit({ ...p, fixed: [...p.fixed, { id: nextId("f", p.fixed.map((f) => f.id)), label: "", resource: "", day: p.days[0], start: p.open.start, end: Math.min(p.end, p.open.start + 60), work: true }] }, true)}>
        + {t.add}</button></div>
    </div>
  );

  const tasksTab = (
    <div className="flex flex-col gap-2" role="tabpanel">
      <p className="m-0 text-xs text-slate-500">{t.tasksHint}</p>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {p.tasks.map((x, i) => {
          const set = (patch: Partial<typeof x>, fit = false) => commit({ ...p, tasks: p.tasks.map((y) => (y.id === x.id ? { ...y, ...patch } : y)) }, fit);
          return (
            <li key={x.id} className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-2" data-testid={`task-${i}`}>
              <div className="flex flex-wrap items-center gap-2">
                <code className="w-6 text-xs text-slate-500">{x.id}</code>
                <input className={`${field} min-w-48 flex-1`} value={x.label} aria-label={`${t.label}: ${x.id}`} data-testid={`task-${i}-label`}
                  onInput={(e) => set({ label: (e.target as HTMLInputElement).value })} />
                {resourceSelect(x.resource, (v) => set({ resource: v }, true), t.anyone, `task-${i}-resource`, t.resource)}
                <button type="button" className={small} data-testid={`task-${i}-delete`}
                  onClick={() => commit({ ...p, tasks: p.tasks.filter((y) => y.id !== x.id), solution: p.solution?.filter((y) => y.task !== x.id) ?? null })}>{t.delete}</button>
              </div>
              <div className="flex flex-wrap items-center gap-3 pl-8 text-xs text-slate-500">
                <label className="inline-flex items-center gap-1">{t.durationLabel}
                  <NumberField value={x.duration} language={language} label={t.durationLabel} testid={`task-${i}-duration`}
                    onChange={(n) => set({ duration: n, min: x.min === x.duration ? n : Math.min(x.min, n), max: x.max === x.duration ? n : Math.max(x.max, n) }, true)} /></label>
                <label className="inline-flex items-center gap-1">{t.minLabel}
                  <NumberField value={x.min} language={language} label={t.minLabel} testid={`task-${i}-min`} onChange={(n) => set({ min: n }, true)} /></label>
                <label className="inline-flex items-center gap-1">{t.maxLabel}
                  <NumberField value={x.max} language={language} label={t.maxLabel} testid={`task-${i}-max`} onChange={(n) => set({ max: n }, true)} /></label>
                <label className="inline-flex flex-1 items-center gap-1">{t.notes}
                  <input className={`${field} min-w-48 flex-1`} value={x.notes} data-testid={`task-${i}-notes`} onInput={(e) => set({ notes: (e.target as HTMLInputElement).value })} /></label>
              </div>
            </li>
          );
        })}
      </ul>
      <div><button type="button" className={button} disabled={p.tasks.length >= MAX_TASKS} data-testid="add-task"
        onClick={() => {
          const id = nextId("t", p.tasks.map((x) => x.id));
          commit({ ...p, tasks: [...p.tasks, { id, label: `${t.task} ${p.tasks.length + 1}`, duration: 60, min: 60, max: 60, resource: "", notes: "" }] }, true);
        }}>+ {t.add}</button></div>
    </div>
  );

  const setCheck = (i: number, check: Check | null) => {
    const checks = [...p.checks];
    if (check) checks[i] = check;
    else checks.splice(i, 1);
    commit({ ...p, checks });
  };
  const checkEditor = (c: Check, i: number) => {
    const passed = evaluation?.results[i]?.passed;
    const set = (patch: Partial<Check>) => setCheck(i, { ...c, ...patch } as Check);
    return (
      <li key={i} className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-2" data-testid={`check-${i}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`grid size-6 place-items-center rounded-full text-xs font-bold ${passed === undefined ? "bg-slate-100 text-slate-400" : passed ? "bg-sky-100 text-sky-800" : "bg-orange-100 text-orange-800"}`}
            aria-label={passed === undefined ? t.noSolution : passed ? "✓" : "✗"} data-testid={`check-${i}-mark`}>
            {passed === undefined ? i + 1 : passed ? "✓" : "✗"}
          </span>
          <span className="font-mono text-xs text-slate-500">check{i + 1}</span>
          <select className={field} value={c.type} data-testid={`check-${i}-type`} aria-label={`check${i + 1}`}
            onChange={(e) => setCheck(i, { ...newCheck((e.target as HTMLSelectElement).value as CheckType, p), points: c.points } as Check)}>
            {CHECK_TYPES.map((type) => <option key={type} value={type}>{t.checkName[type]}</option>)}
          </select>
          {(c.type === "before" || c.type === "sameDay" || c.type === "gap") && (
            <>
              {taskSelect(c.a, (a) => set({ a } as Partial<Check>), `check-${i}-a`)}
              {c.type === "gap" && <label className="inline-flex items-center gap-1 text-xs text-slate-500">
                <NumberField value={c.hours} language={language} label={t.hoursLabel} testid={`check-${i}-hours`} onChange={(hours) => set({ hours } as Partial<Check>)} />{t.hoursLabel}</label>}
              {taskSelect(c.b, (b) => set({ b } as Partial<Check>), `check-${i}-b`)}
            </>
          )}
          {c.type === "notOnDay" && (
            <>
              {taskSelect(c.task, (task) => set({ task } as Partial<Check>), `check-${i}-task`, t.allTasks)}
              {daySelect(c.day, (day) => set({ day } as Partial<Check>), `check-${i}-day`, DAY_CODES)}
            </>
          )}
          {(c.type === "maxHours" || c.type === "break") && (
            <label className="inline-flex items-center gap-1 text-xs text-slate-500">
              <NumberField value={c.hours} language={language} label={t.hoursLabel} testid={`check-${i}-hours`} onChange={(hours) => set({ hours } as Partial<Check>)} />{t.hoursLabel}</label>
          )}
          {c.type === "break" && (
            <label className="inline-flex items-center gap-1 text-xs text-slate-500">
              <NumberField value={c.minutes} language={language} label={t.minutesLabel} testid={`check-${i}-minutes`} onChange={(minutes) => set({ minutes: Math.round(minutes) } as Partial<Check>)} />{t.minutesLabel}</label>
          )}
          <span className="ml-auto inline-flex shrink-0 items-center gap-1">
          <label className="inline-flex items-center gap-1 text-xs text-slate-500">
            {t.points}
            <input type="number" min={0} max={10} className={`${field} w-14`} value={c.points} data-testid={`check-${i}-points`} aria-label={`${t.points}: check${i + 1}`}
              onInput={(e) => set({ points: Math.max(0, Math.round(Number((e.target as HTMLInputElement).value) || 0)) })} />
          </label>
          <button type="button" className={small} onClick={() => setCheck(i, null)} data-testid={`check-${i}-remove`}>{t.removeCheck}</button>
          </span>
        </div>
        <p className="m-0 pl-8 text-xs text-slate-600" data-testid={`check-${i}-text`}>{t.checkText(c, taskName, (d) => dayName(d as Day))}</p>
      </li>
    );
  };

  const checksTab = (
    <div className="flex flex-col gap-2" role="tabpanel">
      <p className="m-0 text-xs text-slate-500">{t.checksHint}</p>
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">{p.checks.map(checkEditor)}</ol>
      <div><button type="button" className={button} disabled={p.checks.length >= MAX_CHECKS} data-testid="add-check"
        onClick={() => commit({ ...p, checks: [...p.checks, newCheck("allPlanned", p)] })}>+ {t.addCheck}</button></div>
    </div>
  );

  const solutionTab = (
    <div className="flex flex-col gap-2" role="tabpanel">
      <p className="m-0 text-xs text-slate-500">{t.solutionHint}</p>
      <Agenda key="solution" planner={p} placements={p.solution ?? []} texts={t} testid="solution"
        onChange={(placements) => commit({ ...p, solution: placements.length ? placements : null })} />
      <div><button type="button" className={button} disabled={!p.solution} onClick={() => commit({ ...p, solution: null })} data-testid="clear-solution">{t.clearSolution}</button></div>
    </div>
  );

  const tabs: [Tab, string][] = [
    ["agenda", t.tabAgenda], ["resources", t.tabResources], ["fixed", t.tabFixed], ["tasks", t.tabTasks], ["checks", t.tabChecks], ["solution", t.tabSolution],
  ];
  return (
    <div className="flex flex-col gap-3 font-sans text-sm text-slate-800">
      <div role="tablist" className="inline-flex flex-wrap self-start rounded-lg bg-slate-100 p-1">
        {tabs.map(([id, name]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} data-testid={`tab-${id}`} onClick={() => setTab(id)}
            className="rounded-md px-3 py-1 text-sm text-slate-600 aria-selected:bg-white aria-selected:text-slate-900 aria-selected:shadow-sm">{name}</button>
        ))}
      </div>
      {tab === "agenda" && agendaTab}
      {tab === "resources" && resourcesTab}
      {tab === "fixed" && fixedTab}
      {tab === "tasks" && tasksTab}
      {tab === "checks" && checksTab}
      {tab === "solution" && solutionTab}
      <p className="m-0 text-slate-600" data-testid="summary">
        {evaluation ? t.summary(evaluation.score, evaluation.maxscore) : t.noSolution}
        {problems.map((x) => <span key={x} className="ml-2 text-orange-800"><span aria-hidden="true">⚠ </span>{x}</span>)}
      </p>
    </div>
  );
};

export default Authoring;
