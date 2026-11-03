import { useState } from "preact/hooks";
import { Field, Form, Problem, Section, Values, say, validationProblem } from "./form";
import { Texts } from "./texts";

// The form as the candidate sees it: a paper form or an online form, with sections and fields. Used by the
// interaction and by the authoring mode's preview (with the check results under the fields).

export type Theme = "paper" | "web";
export type FieldResult = { text: string; passed: boolean; points: number };

type Props = {
  form: Form;
  values: Values;
  language: string;
  texts: Texts;
  theme: Theme;
  columns: 1 | 2;
  validation: boolean;
  readOnly?: boolean;
  onChange: (id: string, value: string) => void;
  announce?: (message: string) => void;
  /** authoring preview: the checks per field */
  results?: Record<string, FieldResult[]>;
  prefix?: string;
};

const ErrorIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className="mt-0.5 shrink-0">
    <path d="M8 1.5 15 14H1z" fill="currentColor" />
    <path d="M8 6v3.6" stroke="#fff" stroke-width="1.6" stroke-linecap="round" />
    <circle cx="8" cy="11.6" r=".95" fill="#fff" />
  </svg>
);
const PassIcon = ({ passed }: { passed: boolean }) =>
  passed ? (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className="mt-0.5 shrink-0"><circle cx="8" cy="8" r="7" fill="currentColor" /><path d="m4.6 8.2 2.2 2.2 4.6-4.8" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
  ) : (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className="mt-0.5 shrink-0"><rect x="1" y="1" width="14" height="14" rx="2" fill="currentColor" /><path d="m5 5 6 6M11 5l-6 6" stroke="#fff" stroke-width="1.8" stroke-linecap="round" /></svg>
  );

/** A scribble of a signature, drawn once (no animation, so reduced motion needs nothing). */
const Scribble = () => (
  <svg viewBox="0 0 160 44" className="h-10 w-40 text-blue-900" aria-hidden="true">
    <path d="M6 32c8-14 14-24 18-22s-6 22-2 22 10-18 14-18-2 14 2 14 8-10 12-10 0 8 4 8 6-6 10-6 2 6 6 6c6 0 12-12 18-12s-2 14 4 14 10-8 16-8 8 4 14 2 12-6 22-8"
      fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M30 38c30-3 70-4 110-4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".6" />
  </svg>
);

const inputMode = (type: Field["type"]) =>
  type === "number" || type === "amount" ? "decimal" : type === "phone" ? "tel" : type === "email" ? "email" : type === "postcode" || type === "iban" ? "text" : undefined;

const FormView = ({ form, values, language, texts: t, theme, columns, validation, readOnly, onChange, announce, results, prefix = "ff-" }: Props) => {
  const paper = theme === "paper";
  const validating = !paper && validation;
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [summary, setSummary] = useState<string>("");
  const problemOf = (f: Field): Problem | null => (validating && touched[f.id] ? validationProblem(f, values[f.id], language) : null);
  const id = (f: Field) => `${prefix}${f.id}`;

  const touch = (f: Field) => {
    if (!validating) return;
    setTouched((x) => ({ ...x, [f.id]: true }));
    const p = validationProblem(f, values[f.id], language);
    if (p) announce?.(t.problemStatus(say(f.label, language), t.problem[p]));
  };

  const checkAll = () => {
    const all: Record<string, boolean> = {};
    const fields = form.sections.flatMap((s) => s.fields);
    fields.forEach((f) => (all[f.id] = true));
    setTouched(all);
    const n = fields.filter((f) => validationProblem(f, values[f.id], language)).length;
    const message = n ? t.formProblems(n) : t.formOk;
    setSummary(message);
    announce?.(message);
  };

  // --- styles per theme
  const s = paper
    ? {
      root: "relative bg-[#fbf8ef] text-stone-900 border border-stone-300 shadow-[0_1px_0_#e7e1d1,0_6px_18px_-8px_rgb(0_0_0/0.35)] px-6 pt-5 pb-6",
      title: "m-0 font-serif text-xl font-bold tracking-tight uppercase",
      code: "border border-stone-700 px-2 py-0.5 font-mono text-xs uppercase tracking-wider",
      section: "border border-stone-400",
      sectionAddress: "border-2 border-stone-800",
      heading: "m-0 bg-stone-800 px-2 py-1 font-sans text-xs font-bold uppercase tracking-[0.14em] text-stone-50",
      body: "p-3",
      label: "block font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-600",
      input: "w-full border-0 border-b border-dashed border-stone-500 bg-transparent px-1 py-1 font-mono text-[15px] text-blue-900 outline-none focus-visible:border-solid focus-visible:border-blue-800 focus-visible:bg-blue-50/60 read-only:text-blue-900",
      select: "w-full border-0 border-b border-dashed border-stone-500 bg-transparent px-1 py-1 font-mono text-[15px] text-blue-900 focus-visible:outline-2 focus-visible:outline-blue-800",
      choice: "accent-blue-900",
      sign: "flex h-16 w-full max-w-sm items-center justify-center border border-dashed border-stone-600 bg-white/40 text-stone-500 hover:bg-white/80 focus-visible:outline-2 focus-visible:outline-blue-800",
      hint: "mt-0.5 font-sans text-[11px] italic text-stone-500",
    }
    : {
      root: "relative rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-sm",
      title: "m-0 text-lg font-semibold",
      code: "rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-800",
      section: "rounded-xl border border-slate-200 bg-slate-50/50",
      sectionAddress: "rounded-xl border border-slate-200 bg-slate-50/50",
      heading: "m-0 px-4 pt-3 text-sm font-semibold text-slate-700",
      body: "px-4 pb-4 pt-2",
      label: "block text-sm font-medium text-slate-700",
      input: "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[15px] outline-none focus-visible:border-sky-600 focus-visible:ring-2 focus-visible:ring-sky-500/40 read-only:bg-slate-50",
      select: "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[15px] focus-visible:outline-2 focus-visible:outline-sky-600",
      choice: "accent-sky-700",
      sign: "flex h-16 w-full max-w-sm items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-white text-slate-500 hover:border-sky-500 hover:text-sky-700 focus-visible:outline-2 focus-visible:outline-sky-600",
      hint: "mt-1 text-xs text-slate-500",
    };
  const invalid = paper ? "" : "!border-red-700 border-2";

  const describedBy = (f: Field, problem: Problem | null) =>
    [f.hint ? `${id(f)}-hint` : "", f.type === "date" ? `${id(f)}-format` : "", problem ? `${id(f)}-error` : "", results?.[f.id] ? `${id(f)}-checks` : ""].filter(Boolean).join(" ") || undefined;

  const renderLabel = (f: Field, as: "label" | "legend" = "label") => {
    const content = (
      <>
        {say(f.label, language)}
        {f.required && <span aria-hidden="true" className={paper ? "ml-0.5 text-stone-900" : "ml-0.5 text-red-700"}>*</span>}
      </>
    );
    return as === "legend" ? <legend className={`${s.label} mb-1 p-0`}>{content}</legend> : <label className={`${s.label} mb-1`} htmlFor={id(f)}>{content}</label>;
  };

  const renderBelow = (f: Field, problem: Problem | null) => (
    <>
      {f.hint && <p className={`${s.hint} m-0`} id={`${id(f)}-hint`}>{say(f.hint, language)}</p>}
      {f.type === "date" && <p className="sr-only" id={`${id(f)}-format`}>{t.dateHint}</p>}
      {problem && (
        <p className="m-0 mt-1 flex items-start gap-1 text-sm font-medium text-red-700" id={`${id(f)}-error`} data-testid={`error-${f.id}`}>
          <ErrorIcon />
          <span>{t.problem[problem]}</span>
        </p>
      )}
      {results?.[f.id] && (
        <ul className="m-0 mt-1.5 list-none space-y-0.5 p-0 font-sans" id={`${id(f)}-checks`} data-testid={`checks-${f.id}`}>
          {results[f.id].map((r, i) => (
            <li key={i} className={`flex items-start gap-1 text-xs ${r.passed ? "text-emerald-800" : "text-amber-800"}`}>
              <PassIcon passed={r.passed} />
              <span>{`${r.passed ? t.passed : t.failed}: ${r.text} (${r.points} pt)`}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  const renderControl = (f: Field, inAmounts?: boolean) => {
    const problem = problemOf(f);
    const value = values[f.id] ?? "";
    const label = say(f.label, language);
    const common = {
      id: id(f),
      "aria-required": f.required ? true : undefined,
      "aria-invalid": problem ? true : undefined,
      "aria-describedby": describedBy(f, problem),
      "data-field": f.id,
    };
    switch (f.type) {
      case "select":
        return (
          <div>
            {renderLabel(f)}
            <select {...common} className={`${s.select} ${problem ? invalid : ""}`} value={value} disabled={readOnly}
              onChange={(e) => onChange(f.id, (e.target as HTMLSelectElement).value)} onBlur={() => touch(f)}>
              <option value="">{t.choose}</option>
              {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{say(o.label, language)}</option>)}
            </select>
            {renderBelow(f, problem)}
          </div>
        );
      case "radio":
        return (
          <fieldset className="m-0 min-w-0 border-0 p-0" aria-required={f.required ? true : undefined} aria-describedby={describedBy(f, problem)} data-field={f.id}>
            {renderLabel(f, "legend")}
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {(f.options ?? []).map((o) => (
                <label key={o.value} className={`inline-flex cursor-pointer items-center gap-2 ${paper ? "font-sans text-sm" : "text-[15px]"}`}>
                  <input type="radio" className={`${s.choice} h-4 w-4`} name={id(f)} value={o.value} checked={value === o.value} disabled={readOnly}
                    onChange={() => onChange(f.id, o.value)} onBlur={() => touch(f)} />
                  {say(o.label, language)}
                </label>
              ))}
            </div>
            {renderBelow(f, problem)}
          </fieldset>
        );
      case "checkbox": {
        if (f.options?.length) {
          const chosen = value.split(",").filter(Boolean);
          return (
            <fieldset className="m-0 min-w-0 border-0 p-0" aria-describedby={describedBy(f, problem)} data-field={f.id}>
              {renderLabel(f, "legend")}
              <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                {f.options.map((o) => (
                  <label key={o.value} className={`inline-flex cursor-pointer items-center gap-2 ${paper ? "font-sans text-sm" : "text-[15px]"}`}>
                    <input type="checkbox" className={`${s.choice} h-4 w-4`} checked={chosen.includes(o.value)} disabled={readOnly}
                      onChange={(e) => {
                        const on = (e.target as HTMLInputElement).checked;
                        const next = (f.options ?? []).map((x) => x.value).filter((v) => (v === o.value ? on : chosen.includes(v)));
                        onChange(f.id, next.join(","));
                        announce?.(t.checkedStatus(say(o.label, language), on));
                      }} />
                    {say(o.label, language)}
                  </label>
                ))}
              </div>
              {renderBelow(f, problem)}
            </fieldset>
          );
        }
        return (
          <div>
            <label className={`inline-flex cursor-pointer items-center gap-2 ${paper ? "font-sans text-sm" : "text-[15px]"}`}>
              <input type="checkbox" {...common} className={`${s.choice} h-4 w-4`} checked={value === "true"} disabled={readOnly}
                onChange={(e) => {
                  const on = (e.target as HTMLInputElement).checked;
                  onChange(f.id, on ? "true" : "");
                  announce?.(t.checkedStatus(label, on));
                }} onBlur={() => touch(f)} />
              {label}
              {f.required && <span aria-hidden="true">*</span>}
            </label>
            {renderBelow(f, problem)}
          </div>
        );
      }
      case "signature": {
        const signed = value === "signed";
        return (
          <div>
            <span className={`${s.label} mb-1`} id={`${id(f)}-label`}>
              {label}
              {f.required && <span aria-hidden="true" className={paper ? "ml-0.5" : "ml-0.5 text-red-700"}>*</span>}
            </span>
            <button type="button" {...common} className={`${s.sign} ${problem ? invalid : ""} ${signed ? "!border-solid" : ""} cursor-pointer disabled:cursor-default`}
              aria-pressed={signed} aria-label={t.signatureState(label, signed)} disabled={readOnly}
              onClick={() => {
                onChange(f.id, signed ? "" : "signed");
                announce?.(signed ? t.unsignedStatus(label) : t.signedStatus(label));
                if (validating) setTouched((x) => ({ ...x, [f.id]: true }));
              }}>
              {signed ? (
                <span className="flex items-center gap-3"><Scribble /><span className="font-sans text-xs text-stone-600">{t.signed}</span></span>
              ) : (
                <span className="flex items-center gap-2 font-sans text-sm">
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 12.5 11 3.5l1.5 1.5-9 9H2zM10 4.5 11.5 6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" /></svg>
                  {t.sign}
                </span>
              )}
            </button>
            {renderBelow(f, problem)}
          </div>
        );
      }
      default: {
        const amount = f.type === "amount";
        const props = {
          ...common,
          value,
          readOnly,
          autoComplete: "off",
          spellcheck: !(["postcode", "iban", "email", "phone", "amount", "number", "date"] as string[]).includes(f.type),
          inputMode: inputMode(f.type),
          placeholder: f.type === "date" ? t.datePlaceholder : undefined,
          onInput: (e: Event) => onChange(f.id, (e.target as HTMLInputElement).value),
          onBlur: () => touch(f),
          className: `${s.input} ${amount ? "text-right tabular-nums" : ""} ${["postcode", "iban"].includes(f.type) ? "uppercase" : ""} ${problem ? invalid : ""} ${amount ? (paper ? "pl-6" : "pl-8") : ""}`,
        };
        const control = f.type === "textarea" ? <textarea {...(props as any)} rows={3} /> : <input type="text" {...(props as any)} aria-label={amount ? `${label} (${t.inEuros})` : undefined} />;
        if (inAmounts) {
          return (
            <div className={`grid grid-cols-[1fr_minmax(7rem,11rem)] items-start gap-3 ${f.total ? (paper ? "mt-1 border-t-[3px] border-double border-stone-800 pt-2" : "mt-1 border-t border-slate-300 pt-3") : ""}`}>
              <label htmlFor={id(f)} className={`${paper ? "font-sans text-sm" : "text-[15px]"} pt-2 ${f.total ? "font-bold" : ""}`}>
                {label}
                {f.required && <span aria-hidden="true" className={paper ? "ml-0.5" : "ml-0.5 text-red-700"}>*</span>}
              </label>
              <div>
                <div className="relative">
                  <span aria-hidden="true" className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${paper ? "left-1 font-mono text-stone-600" : "left-3 text-slate-500"}`}>€</span>
                  {control}
                </div>
                {renderBelow(f, problem)}
              </div>
            </div>
          );
        }
        return (
          <div>
            {renderLabel(f)}
            {amount ? (
              <div className="relative max-w-[12rem]">
                <span aria-hidden="true" className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${paper ? "left-1 font-mono text-stone-600" : "left-3 text-slate-500"}`}>€</span>
                {control}
              </div>
            ) : (
              <div className={f.type === "postcode" ? "max-w-[9rem]" : f.type === "date" ? "max-w-[11rem]" : f.type === "number" ? "max-w-[10rem]" : ""}>{control}</div>
            )}
            {renderBelow(f, problem)}
          </div>
        );
      }
    }
  };

  const renderSection = (section: Section, index: number) => {
    const wide = columns === 2 && section.span !== 1;
    const kind = section.kind ?? "fields";
    const headingId = `${prefix}section-${index}`;
    return (
      <section key={section.id} aria-labelledby={headingId} className={`${kind === "address" ? s.sectionAddress : s.section} ${wide ? "@xl:col-span-2" : ""} min-w-0`} data-section={section.id}>
        <h3 id={headingId} className={s.heading}>{say(section.title, language)}</h3>
        <div className={`${s.body} ${kind === "amounts" ? "flex flex-col gap-2" : `grid gap-x-5 gap-y-3 ${wide ? "@xl:grid-cols-2" : ""}`}`}>
          {section.fields.map((f) => (
            <div key={f.id} className={wide && (f.span === 2 || f.type === "textarea") ? "@xl:col-span-2" : ""}>
              {renderControl(f, kind === "amounts")}
            </div>
          ))}
        </div>
      </section>
    );
  };

  const anyRequired = form.sections.some((x) => x.fields.some((f) => f.required));
  return (
    <div className={`@container ${s.root}`} role="form" aria-label={say(form.title, language) || t.form} data-theme={theme}>
      <div className={paper ? "mb-4 flex items-start justify-between gap-4 border-b-2 border-stone-800 pb-2" : "flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3"}>
        <h2 className={s.title}>{say(form.title, language)}</h2>
        {form.code && <span className={s.code}>{say(form.code, language)}</span>}
      </div>
      <div className={paper ? "" : "p-5"}>
        {anyRequired && <p className={paper ? "m-0 mb-3 font-sans text-[11px] text-stone-600" : "m-0 mb-3 text-xs text-slate-500"}>{t.requiredNote}</p>}
        <div className={`grid gap-4 ${columns === 2 ? "@xl:grid-cols-2" : ""}`}>
          {form.sections.map((section, i) => renderSection(section, i))}
        </div>
        {validating && !readOnly && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={checkAll}
              className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">
              {t.checkForm}
            </button>
            {summary && <span className="text-sm text-slate-700" data-testid="summary">{summary}</span>}
          </div>
        )}
      </div>
    </div>
  );
};

export default FormView;
