import RotaEditor from "./rotaEditor";
import {
  DAY_CODES, Day, Question, RawAnswer, Rota, RotaMode, Shift, clock, employeeOf, formatNumber, isWhoQuestion, shiftOf,
} from "./rota";
import { RotaTexts } from "./rotaTexts";

// The candidate's views of the three rota modes: the rota as a table (readRota, hoursAndPay), the rules and the
// employees (makeRota), the questions with their boxes and names to tap, and the boxes of hours and pay.

const box =
  "h-11 rounded-md border border-slate-300 bg-white px-2 text-sm tabular-nums text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-600 " +
  "disabled:bg-slate-50 disabled:text-slate-500";
const toggle =
  "inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 " +
  "aria-pressed:border-sky-700 aria-pressed:bg-sky-100 aria-pressed:text-sky-900 aria-pressed:font-medium focus-visible:outline-2 focus-visible:outline-sky-600 " +
  "disabled:cursor-default disabled:hover:bg-white";

/** The rota as a table: an employee per row, a day per column, the times and the break in every cell. */
export const RotaTable = ({ rota: r, shifts, texts: t, caption }: { rota: Rota; shifts: Shift[]; texts: RotaTexts; caption?: string }) => {
  const dayName = (d: Day) => t.days[DAY_CODES.indexOf(d)];
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-sm" data-testid="rota-table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="bg-slate-50">
            <th scope="col" className="px-2 py-1.5 text-left text-xs font-semibold text-slate-600">{t.employee}</th>
            {r.days.map((d) => (
              <th scope="col" key={d.day} className="border-l border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-800">
                {dayName(d.day)}
                <span className="block text-[11px] font-normal text-slate-500 tabular-nums">{d.close > d.open ? t.open(clock(d.open), clock(d.close)) : t.closed}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {r.employees.map((e) => (
            <tr key={e.id} className="border-t border-slate-200">
              <th scope="row" className="px-2 py-1.5 text-left font-medium text-slate-800">{e.name}</th>
              {r.days.map((d) => {
                const s = shiftOf(shifts, e.id, d.day);
                return (
                  <td key={d.day} className={`border-l border-slate-200 px-2 py-1.5 align-top ${s ? "bg-sky-50" : ""}`} data-testid={`table-${e.id}-${d.day}`}>
                    {s ? (
                      <>
                        <span className="block font-semibold tabular-nums text-slate-900">{clock(s.start)}–{clock(s.end)}</span>
                        <span className="block text-xs text-slate-600">{t.breakOf(s.break)}</span>
                      </>
                    ) : <span className="text-slate-400">{t.free}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** The rules of the task and what the employees can do (makeRota). */
export const RotaInfo = ({ rota: r, texts: t }: { rota: Rota; texts: RotaTexts }) => {
  const dayName = (d: Day) => t.days[DAY_CODES.indexOf(d)];
  const h = (n: number) => formatNumber(n, t.locale);
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      <section aria-labelledby="rota-employees" className="min-w-56 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <h3 id="rota-employees" className="m-0 mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{t.employees}</h3>
        <ul className="m-0 list-none p-0" data-testid="employees">
          {r.employees.map((e) => (
            <li key={e.id} className="py-0.5">
              <strong className="font-medium text-slate-900">{e.name}</strong>
              <span className="text-slate-600"> · {t.contract(h(e.min), t.hours(e.max))}</span>
              {e.unavailable.length > 0 && <span className="text-slate-600"> · {t.cannotWorkOn(e.unavailable.map(dayName))}</span>}
            </li>
          ))}
        </ul>
      </section>
      {r.rules.length > 0 && (
        <section aria-labelledby="rota-rules" className="min-w-56 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <h3 id="rota-rules" className="m-0 mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{t.rules}</h3>
          <ol className="m-0 list-decimal pl-5 text-slate-700" data-testid="rules">{r.rules.map((x, i) => <li key={i} className="py-0.5">{t.ruleText(x)}</li>)}</ol>
        </section>
      )}
    </div>
  );
};

/** The question's text: the author's, or the one the PCI makes of it. */
export const questionText = (r: Rota, q: Question, t: RotaTexts) =>
  q.text.trim() || t.questionText(q, employeeOf(r, q.employee)?.name ?? q.employee, t.days[DAY_CODES.indexOf(q.day)], clock(q.time));

/** One question with its boxes or names to tap. */
const QuestionField = ({ rota: r, q, n, raw, onChange, texts: t, readOnly }: {
  rota: Rota; q: Question; n: number; raw: RawAnswer | null | undefined; onChange: (a: RawAnswer | null) => void; texts: RotaTexts; readOnly: boolean;
}) => {
  const text = questionText(r, q, t);
  const id = `rota-q${n}`;
  let field;
  if (q.kind === "shift") {
    const a = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : { start: "", end: "", free: false };
    const set = (patch: Partial<typeof a>) => {
      const next = { ...a, ...patch };
      onChange(!next.free && !next.start.trim() && !next.end.trim() ? null : next);
    };
    field = (
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 text-sm text-slate-600">{t.from}
          <input type="text" inputMode="text" autoComplete="off" placeholder={t.timePlaceholder} className={`${box} w-20`} value={a.start} disabled={readOnly || a.free}
            aria-label={`${t.question(n)}: ${text} ${t.from}`} data-testid={`q${n}-start`} onInput={(e) => set({ start: (e.target as HTMLInputElement).value })} />
        </label>
        <label className="inline-flex items-center gap-1.5 text-sm text-slate-600">{t.to}
          <input type="text" inputMode="text" autoComplete="off" placeholder={t.timePlaceholder} className={`${box} w-20`} value={a.end} disabled={readOnly || a.free}
            aria-label={`${t.question(n)}: ${text} ${t.to}`} data-testid={`q${n}-end`} onInput={(e) => set({ end: (e.target as HTMLInputElement).value })} />
        </label>
        <button type="button" className={toggle} aria-pressed={a.free} disabled={readOnly} data-testid={`q${n}-free`}
          onClick={() => set({ free: !a.free })}><span aria-hidden="true">{a.free ? "✓" : "○"}</span>{t.doesNotWork}</button>
      </div>
    );
  } else if (isWhoQuestion(q)) {
    const chosen = Array.isArray(raw) ? raw : [];
    field = (
      <div role="group" aria-label={`${t.question(n)}: ${text}`} className="flex flex-wrap gap-1.5" data-testid={`q${n}-names`}>
        {r.employees.map((e) => {
          const on = chosen.includes(e.id);
          return (
            <button key={e.id} type="button" className={toggle} aria-pressed={on} disabled={readOnly}
              onClick={() => {
                const next = on ? chosen.filter((x) => x !== e.id) : [...chosen, e.id];
                onChange(next.length ? r.employees.map((x) => x.id).filter((x) => next.includes(x)) : null);
              }}>
              <span aria-hidden="true">{on ? "✓" : "○"}</span>{e.name}
            </button>
          );
        })}
      </div>
    );
  } else {
    const unit = q.kind === "hours" ? t.hoursUnit : q.kind === "staffAt" ? t.peopleUnit : "";
    field = (
      <label className="inline-flex items-center gap-1.5 text-sm text-slate-600">
        <input type="text" inputMode="decimal" autoComplete="off" className={`${box} w-24`} value={typeof raw === "string" ? raw : ""} disabled={readOnly}
          aria-label={`${t.question(n)}: ${text}`} data-testid={`q${n}-number`}
          onInput={(e) => {
            const v = (e.target as HTMLInputElement).value;
            onChange(v.trim() ? v : null);
          }} />
        {unit}
      </label>
    );
  }
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2" data-testid={`question-${n}`}>
      <p className="m-0 text-[15px] text-slate-800" id={id}><span className="mr-1.5 font-semibold text-slate-500">{n}.</span>{text}</p>
      {isWhoQuestion(q) && <p className="m-0 text-xs text-slate-500">{t.tapNames}</p>}
      {field}
    </li>
  );
};

export type RotaViewProps = {
  rota: Rota;
  mode: RotaMode;
  shifts: Shift[];
  answers: (RawAnswer | null)[];
  hours: string[];
  pay: string[];
  texts: RotaTexts;
  feedback: boolean;
  readOnly: boolean;
  label: string;
  onShifts: (shifts: Shift[]) => void;
  onAnswer: (index: number, answer: RawAnswer | null) => void;
  onBox: (kind: "hours" | "pay", index: number, text: string) => void;
};

/** The three rota modes: read a rota, make one, work out the hours and pay of one. */
export const RotaView = (p: RotaViewProps) => {
  const { rota: r, mode, texts: t, readOnly } = p;
  if (mode === "makeRota") {
    return (
      <div className="flex flex-col gap-3">
        <RotaInfo rota={r} texts={t} />
        <RotaEditor rota={r} shifts={p.shifts} onChange={p.onShifts} texts={t} feedback={p.feedback} readOnly={readOnly} showHours label={p.label} />
      </div>
    );
  }
  if (mode === "readRota") {
    return (
      <div className="flex flex-col gap-3">
        <RotaTable rota={r} shifts={r.shifts ?? []} texts={t} caption={p.label} />
        <section aria-label={t.questions}>
          <h3 className="m-0 mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">{t.questions}</h3>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {r.questions.map((q, i) => (
              <QuestionField key={i} rota={r} q={q} n={i + 1} raw={p.answers[i]} texts={t} readOnly={readOnly} onChange={(a) => p.onAnswer(i, a)} />
            ))}
          </ol>
        </section>
      </div>
    );
  }
  // hoursAndPay
  const shifts = r.own ? p.shifts : r.shifts ?? [];
  const money = (n: number) => t.money(n);
  const pct = (n: number) => formatNumber(n, t.locale);
  return (
    <div className="flex flex-col gap-3">
      {r.own
        ? <RotaEditor rota={{ ...r, rules: [] }} shifts={p.shifts} onChange={p.onShifts} texts={t} feedback={false} readOnly={readOnly} label={p.label} />
        : <RotaTable rota={r} shifts={shifts} texts={t} caption={p.label} />}
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-sm text-slate-700" data-testid="pay-rules">
        <li>{t.breaksUnpaid}</li>
        {r.pay.askPay && r.pay.sunday > 0 && r.days.some((d) => d.day === "sun") && <li>{t.sundayRule(pct(r.pay.sunday))}</li>}
        {r.pay.askPay && r.pay.evening > 0 && <li>{t.eveningRule(pct(r.pay.evening), clock(r.pay.eveningFrom))}</li>}
      </ul>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-sm" data-testid="boxes">
          <thead>
            <tr className="bg-slate-50 text-left text-xs text-slate-600">
              <th scope="col" className="px-2 py-1.5 font-semibold">{t.employee}</th>
              {r.pay.askPay && <th scope="col" className="px-2 py-1.5 font-semibold">{t.hourlyWage}</th>}
              <th scope="col" className="px-2 py-1.5 font-semibold">{t.hoursWorked}</th>
              {r.pay.askPay && <th scope="col" className="px-2 py-1.5 font-semibold">{t.pay}</th>}
            </tr>
          </thead>
          <tbody>
            {r.employees.map((e, i) => (
              <tr key={e.id} className="border-t border-slate-200">
                <th scope="row" className="px-2 py-1 text-left font-medium text-slate-800">{e.name}</th>
                {r.pay.askPay && <td className="px-2 py-1 tabular-nums text-slate-700" data-testid={`wage-${e.id}`}>{money(e.wage)}</td>}
                <td className="px-2 py-1">
                  <span className="inline-flex items-center gap-1.5 text-slate-600">
                    <input type="text" inputMode="decimal" autoComplete="off" className={`${box} w-24`} value={p.hours[i] ?? ""} disabled={readOnly}
                      aria-label={t.hoursBox(e.name)} data-testid={`hours-${e.id}`} onInput={(ev) => p.onBox("hours", i, (ev.target as HTMLInputElement).value)} />
                    {t.hoursUnit}
                  </span>
                </td>
                {r.pay.askPay && (
                  <td className="px-2 py-1">
                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                      €
                      <input type="text" inputMode="decimal" autoComplete="off" className={`${box} w-28`} value={p.pay[i] ?? ""} disabled={readOnly}
                        aria-label={t.payBox(e.name)} data-testid={`pay-${e.id}`} onInput={(ev) => p.onBox("pay", i, (ev.target as HTMLInputElement).value)} />
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
