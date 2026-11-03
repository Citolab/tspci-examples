import { useMemo, useState } from "preact/hooks";
import FormView, { FieldResult, Theme } from "./formView";
import { Situation } from "./interaction";
import {
  CHECK_TYPES, Check, CheckType, EXAMPLES, FIELD_TYPES, FORMATS, Field, FieldType, Form, MAX_FIELDS, OPTION_TYPES, Option, RELATIONS,
  SECTION_KINDS, Section, SectionKind, Text, Values, allChecks, allFields, authoringProblemCodes, clone, displayValue, evaluate,
  formatNumber, normalize, ownValues, parseNumber, pointsOf, rawFromNormalized, say,
} from "./form";
import { Texts, langOf, textsFor } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance): the form (title, situation, look), its sections and fields
// with their checks, and a preview in which the author fills in the solution and sees every check on it.

export type AuthoringSettings = { form: Form; theme: Theme; columns: 1 | 2; validation: boolean };

/** What keeps the form from being used (getAuthoringInstance validate()), in the author's language. */
export const authoringProblems = (form: Form, language: string): string[] => {
  const t = textsFor(language);
  return authoringProblemCodes(form).map(t.problemText);
};

const button = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-sky-600 cursor-pointer";
const small = "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-sky-600 cursor-pointer";
const input = "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-sky-600";
const lab = "flex flex-col gap-0.5 text-xs font-medium text-slate-600";
type Tab = "form" | "fields" | "solution";

const asPair = (t: Text | undefined): { en: string; nl: string } => (typeof t === "string" ? { en: t, nl: "" } : { en: t?.en ?? "", nl: t?.nl ?? "" });
const fromPair = (p: { en: string; nl: string }): Text => (p.nl ? { en: p.en, nl: p.nl } : p.en);

/** A text in English and Dutch: two inputs side by side. */
const TextPair = ({ label, value, onChange, t, multiline, testid }: { label: string; value: Text | undefined; onChange: (t: Text) => void; t: Texts; multiline?: boolean; testid?: string }) => {
  const p = asPair(value);
  const one = (lang: "en" | "nl") => {
    const props = {
      className: input, value: p[lang], "aria-label": `${label} (${lang === "en" ? t.english : t.dutch})`, "data-testid": testid ? `${testid}-${lang}` : undefined,
      onInput: (e: Event) => onChange(fromPair({ ...p, [lang]: (e.target as HTMLInputElement).value })),
    };
    return multiline ? <textarea {...(props as any)} rows={3} /> : <input type="text" {...(props as any)} />;
  };
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-start gap-1"><span className="mt-1 w-5 shrink-0 text-[10px] font-semibold text-slate-400" aria-hidden="true">EN</span>{one("en")}</div>
        <div className="flex items-start gap-1"><span className="mt-1 w-5 shrink-0 text-[10px] font-semibold text-slate-400" aria-hidden="true">NL</span>{one("nl")}</div>
      </div>
    </div>
  );
};

/** A number in the author's language (a decimal comma in Dutch); committed when it parses. */
const NumberInput = ({ label, value, onChange, language, testid, width = "w-24" }: { label: string; value: number | undefined; onChange: (n: number) => void; language: string; testid?: string; width?: string }) => {
  const [text, setText] = useState(value === undefined ? "" : formatNumber(value, language));
  return (
    <label className={lab}>
      {label}
      <input type="text" inputMode="decimal" className={`${input.replace("w-full", "")} ${width}`} value={text} data-testid={testid}
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value;
          setText(v);
          const n = parseNumber(v, language);
          if (n !== null) onChange(n);
        }} />
    </label>
  );
};

/** The id of a field: committed on blur or Enter, so typing does not rename at every key. */
const IdInput = ({ value, onCommit, label, testid }: { value: string; onCommit: (v: string) => void; label: string; testid?: string }) => {
  const [text, setText] = useState(value);
  const commit = () => text.trim() && text.trim() !== value && onCommit(text.trim());
  return (
    <label className={lab}>
      {label}
      <input type="text" className={`${input.replace("w-full", "")} w-36 font-mono`} value={text} spellcheck={false} data-testid={testid}
        onInput={(e) => setText((e.target as HTMLInputElement).value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
    </label>
  );
};

const optionsText = (options: Option[] | undefined) =>
  (options ?? []).map((o) => { const p = asPair(o.label); return `${o.value} = ${p.en}${p.nl ? ` | ${p.nl}` : ""}`; }).join("\n");
const parseOptions = (text: string): Option[] =>
  text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [value, rest = ""] = line.includes("=") ? [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()] : [line, line];
    const [en, nl = ""] = rest.split("|").map((x) => x.trim());
    return { value: value || en, label: fromPair({ en: en || value, nl }) };
  });

const OptionsInput = ({ value, onChange, t, testid }: { value: Option[] | undefined; onChange: (o: Option[]) => void; t: Texts; testid?: string }) => {
  const [text, setText] = useState(optionsText(value));
  return (
    <label className={lab}>
      {t.options}
      <textarea className={`${input} font-mono`} rows={3} value={text} data-testid={testid}
        onInput={(e) => { const v = (e.target as HTMLTextAreaElement).value; setText(v); onChange(parseOptions(v)); }} />
      <span className="text-[11px] font-normal text-slate-500">{t.optionsHelp}</span>
    </label>
  );
};

const newCheck = (type: CheckType, field: Field, others: Field[]): Check => {
  switch (type) {
    case "exact": return { type, value: field.options?.[0]?.value ?? "" };
    case "oneOf": return { type, values: [""] };
    case "number": return { type, value: 0, margin: 0 };
    case "format": return { type, format: field.type === "iban" ? "iban" : field.type === "postcode" ? "postcode" : field.type === "email" ? "email" : field.type === "phone" ? "phone" : field.type === "date" ? "date" : "regex", ...(["iban", "postcode", "email", "phone", "date"].includes(field.type) ? {} : { pattern: "" }) } as Check;
    case "required": return { type };
    case "relation": return { type, relation: field.type === "date" ? "after" : field.type === "amount" || field.type === "number" ? "sum" : "same", fields: others[0] ? [others[0].id] : [] };
  }
};

const CheckEditor = ({ check, field, others, onChange, onRemove, t, language, result, testid }: {
  check: Check; field: Field; others: Field[]; onChange: (c: Check) => void; onRemove: () => void; t: Texts; language: string; result?: boolean; testid: string;
}) => {
  const set = (patch: Partial<Check>) => onChange({ ...check, ...patch } as Check);
  return (
    <li className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-2" data-testid={testid}>
      <label className={lab}>
        {t.checkType}
        <select className={input} value={check.type} data-testid={`${testid}-type`} onChange={(e) => onChange({ ...newCheck((e.target as HTMLSelectElement).value as CheckType, field, others), points: check.points } as Check)}>
          {CHECK_TYPES.map((c) => <option key={c} value={c}>{t.checkTypes[c]}</option>)}
        </select>
      </label>
      {check.type === "exact" && (
        <>
          {field.options?.length ? (
            <label className={lab}>{t.value}
              <select className={input} value={check.value} data-testid={`${testid}-value`} onChange={(e) => set({ value: (e.target as HTMLSelectElement).value })}>
                {field.options.map((o) => <option key={o.value} value={o.value}>{say(o.label, language)}</option>)}
              </select>
            </label>
          ) : (
            <label className={lab}>{t.value}
              <input type="text" className={`${input.replace("w-full", "")} w-48`} value={check.value} data-testid={`${testid}-value`} onInput={(e) => set({ value: (e.target as HTMLInputElement).value })} />
            </label>
          )}
          <label className="flex items-center gap-1 pb-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={!!check.caseSensitive} onChange={(e) => set({ caseSensitive: (e.target as HTMLInputElement).checked || undefined })} />
            {t.caseSensitive}
          </label>
        </>
      )}
      {check.type === "oneOf" && (
        <label className={lab}>{t.valuesSep}
          <input type="text" className={`${input.replace("w-full", "")} w-64`} value={check.values.join("|")} data-testid={`${testid}-values`} onInput={(e) => set({ values: (e.target as HTMLInputElement).value.split("|") })} />
        </label>
      )}
      {check.type === "number" && (
        <>
          <NumberInput label={t.value} value={check.value} language={language} testid={`${testid}-value`} onChange={(n) => set({ value: n })} />
          <NumberInput label={t.margin} value={check.margin ?? 0} language={language} testid={`${testid}-margin`} onChange={(n) => set({ margin: Math.abs(n) })} />
        </>
      )}
      {check.type === "format" && (
        <>
          <label className={lab}>{t.format}
            <select className={input} value={check.format} data-testid={`${testid}-format`} onChange={(e) => { const format = (e.target as HTMLSelectElement).value as any; onChange({ type: "format", format, ...(format === "regex" ? { pattern: check.pattern ?? "" } : {}), points: check.points } as Check); }}>
              {FORMATS.map((f) => <option key={f} value={f}>{t.formats[f]}</option>)}
            </select>
          </label>
          {check.format === "regex" && (
            <label className={lab}>{t.pattern}
              <input type="text" className={`${input.replace("w-full", "")} w-64 font-mono`} value={check.pattern ?? ""} spellcheck={false} data-testid={`${testid}-pattern`} onInput={(e) => set({ pattern: (e.target as HTMLInputElement).value })} />
            </label>
          )}
        </>
      )}
      {check.type === "relation" && (
        <>
          <label className={lab}>{t.relation}
            <select className={input} value={check.relation} data-testid={`${testid}-relation`} onChange={(e) => set({ relation: (e.target as HTMLSelectElement).value as any })}>
              {RELATIONS.map((r) => <option key={r} value={r}>{t.relations[r]}</option>)}
            </select>
          </label>
          <fieldset className="m-0 flex max-w-md flex-wrap gap-x-3 gap-y-1 rounded-md border border-slate-200 px-2 pb-1.5 pt-0">
            <legend className="px-1 text-xs font-medium text-slate-600">{t.otherFields}</legend>
            {others.map((o) => (
              <label key={o.id} className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={check.fields.includes(o.id)}
                  onChange={(e) => set({ fields: (e.target as HTMLInputElement).checked ? [...check.fields, o.id] : check.fields.filter((x) => x !== o.id) })} />
                <span className="font-mono">{o.id}</span>
              </label>
            ))}
          </fieldset>
          {(check.relation === "sum" || check.relation === "product") && (
            <NumberInput label={t.margin} value={check.margin ?? 0.005} language={language} onChange={(n) => set({ margin: Math.abs(n) })} />
          )}
        </>
      )}
      <NumberInput label={t.points} value={pointsOf(check)} language={language} width="w-14" testid={`${testid}-points`} onChange={(n) => set({ points: Math.max(0, Math.round(n)) })} />
      {result !== undefined && (
        <span className={`pb-1.5 text-xs font-semibold ${result ? "text-emerald-800" : "text-amber-800"}`}>{result ? `✓ ${t.passed}` : `✗ ${t.failed}`}</span>
      )}
      <button type="button" className={`${small} ml-auto`} onClick={onRemove}>{t.removeCheck}</button>
    </li>
  );
};

const uniqueId = (form: Form, base: string) => {
  const ids = new Set(allFields(form).map((f) => f.id));
  let n = ids.size + 1;
  while (ids.has(`${base}${n}`)) n++;
  return `${base}${n}`;
};
const move = <T,>(list: T[], i: number, d: number): T[] => {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

const Authoring = ({ initial, language, onChange }: { initial: AuthoringSettings; language: string; onChange: (s: AuthoringSettings) => void }) => {
  const t = textsFor(language);
  const lang = langOf(language);
  const [settings, setSettings] = useState<AuthoringSettings>(initial);
  const [tab, setTab] = useState<Tab>("form");
  const [example, setExample] = useState("waybill");
  const [raw, setRaw] = useState<Values>(() => rawFromNormalized(initial.form, initial.form.solution ?? {}, lang));
  const [opened, setOpened] = useState<string | null>(null); // a field just added: open
  const [version, setVersion] = useState(0); // a new form (an example loaded): editors with local text start again
  const { form } = settings;

  const update = (next: AuthoringSettings) => {
    setSettings(next);
    onChange(next);
  };
  const setForm = (f: Form) => update({ ...settings, form: f });
  const setSection = (i: number, s: Section) => setForm({ ...form, sections: form.sections.map((x, j) => (j === i ? s : x)) });
  const setField = (si: number, fi: number, f: Field) => setSection(si, { ...form.sections[si], fields: form.sections[si].fields.map((x, j) => (j === fi ? f : x)) });

  const renameField = (oldId: string, newId: string) => {
    const next = clone(form);
    for (const s of next.sections)
      for (const f of s.fields) {
        if (f.id === oldId) f.id = newId;
        for (const c of f.checks ?? []) if (c.type === "relation") c.fields = c.fields.map((x) => (x === oldId ? newId : x));
      }
    if (next.solution && oldId in next.solution) {
      next.solution[newId] = next.solution[oldId];
      delete next.solution[oldId];
    }
    if (oldId in raw) { const r = { ...raw, [newId]: raw[oldId] }; delete r[oldId]; setRaw(r); }
    setForm(next);
  };

  const evaluation = useMemo(() => evaluate(form, ownValues(form, form.solution ?? {})), [form]);
  const hasSolution = !!form.solution && Object.keys(form.solution).length > 0;
  const fields = allFields(form);
  const nameOf = (id: string) => say(fields.find((f) => f.id === id)?.label, lang) || id;
  const showValue = (id: string, v: string) => { const f = fields.find((x) => x.id === id); return f ? displayValue(f, normalize(f, v, "en"), lang) : v; };
  const checks = allChecks(form);
  const resultsByField: Record<string, FieldResult[]> = {};
  evaluation.results.forEach((r, i) => {
    (resultsByField[r.field] ??= []).push({ text: `${i + 1}. ${t.describe(checks[i].check, nameOf, showValue, r.field)}`, passed: r.passed, points: r.points });
  });
  const firstCheck: Record<string, number> = {};
  let counted = 0;
  for (const f of fields) { firstCheck[f.id] ??= counted; counted += (f.checks ?? []).length; }
  /** Whether the solution passes check k of a field (undefined without a solution). */
  const resultOf = (fieldId: string, k: number): boolean | undefined => (hasSolution ? evaluation.results[firstCheck[fieldId] + k]?.passed : undefined);

  const loadExample = () => {
    const f = example === "empty" ? { title: { en: "Form", nl: "Formulier" }, sections: [{ id: "section1", title: { en: "Details", nl: "Gegevens" }, fields: [] }] } : clone(EXAMPLES[example]);
    setRaw(rawFromNormalized(f, f.solution ?? {}, lang));
    setVersion((v) => v + 1);
    update({ ...settings, form: f, theme: example === "transfer" ? "web" : example === "waybill" ? "paper" : settings.theme });
  };

  const tabs: [Tab, string][] = [["form", t.tabForm], ["fields", t.tabFields], ["solution", t.tabSolution]];
  const problems = authoringProblems(form, language);

  return (
    <div className="flex flex-col gap-3 font-sans text-slate-800" lang={lang}>
      <div role="tablist" aria-label={t.form} className="flex gap-1 border-b border-slate-200"
        onKeyDown={(e) => {
          const i = tabs.findIndex(([k]) => k === tab);
          const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          if (!d) return;
          const next = tabs[(i + d + tabs.length) % tabs.length][0];
          setTab(next);
          requestAnimationFrame(() => ((e.currentTarget as HTMLElement)?.querySelector(`[data-tab=${next}]`) as HTMLElement)?.focus());
        }}>
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" id={`tab-${key}`} data-tab={key} aria-selected={tab === key} aria-controls={`panel-${key}`} tabIndex={tab === key ? 0 : -1}
            className={`-mb-px cursor-pointer rounded-t-lg border border-b-0 px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-sky-600 ${tab === key ? "border-slate-200 bg-white font-semibold text-sky-800" : "border-transparent text-slate-600 hover:text-slate-900"}`}
            onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-slate-600" data-testid="score-summary">{hasSolution ? t.summary(evaluation.score, evaluation.maxscore) : ""}</span>
      </div>

      {tab === "form" && (
        <div role="tabpanel" id="panel-form" aria-labelledby="tab-form" className="flex max-w-3xl flex-col gap-4" key={`form-${version}`}>
          <div className="flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3">
            <label className={lab}>{t.example}
              <select className={input} value={example} onChange={(e) => setExample((e.target as HTMLSelectElement).value)} data-testid="example">
                <option value="waybill">{t.exampleWaybill}</option>
                <option value="transfer">{t.exampleTransfer}</option>
                <option value="empty">{t.exampleEmpty}</option>
              </select>
            </label>
            <button type="button" className={button} onClick={loadExample}>{t.load}</button>
          </div>
          <TextPair label={t.title} value={form.title} t={t} testid="title" onChange={(v) => setForm({ ...form, title: v })} />
          <TextPair label={t.code} value={form.code} t={t} onChange={(v) => setForm({ ...form, code: v || undefined })} />
          <div>
            <TextPair label={t.situation} value={form.situation} t={t} multiline testid="situation" onChange={(v) => setForm({ ...form, situation: v || undefined })} />
            <p className="m-0 mt-0.5 text-[11px] text-slate-500">{t.situationHelp}</p>
          </div>
          <div className="flex flex-wrap gap-6">
            <fieldset className="m-0 flex gap-3 border-0 p-0">
              <legend className="mb-1 p-0 text-xs font-medium text-slate-600">{t.theme}</legend>
              {(["paper", "web"] as Theme[]).map((th) => (
                <label key={th} className="flex items-center gap-1.5 text-sm">
                  <input type="radio" name="theme" checked={settings.theme === th} onChange={() => update({ ...settings, theme: th })} />
                  {th === "paper" ? t.themePaper : t.themeWeb}
                </label>
              ))}
            </fieldset>
            <fieldset className="m-0 flex gap-3 border-0 p-0">
              <legend className="mb-1 p-0 text-xs font-medium text-slate-600">{t.columns}</legend>
              {([1, 2] as const).map((c) => (
                <label key={c} className="flex items-center gap-1.5 text-sm">
                  <input type="radio" name="columns" checked={settings.columns === c} onChange={() => update({ ...settings, columns: c })} />
                  {c === 1 ? t.oneColumn : t.twoColumns}
                </label>
              ))}
            </fieldset>
            <label className="flex items-center gap-1.5 self-end text-sm">
              <input type="checkbox" checked={settings.validation} disabled={settings.theme === "paper"} onChange={(e) => update({ ...settings, validation: (e.target as HTMLInputElement).checked })} />
              {t.validation}
            </label>
          </div>
        </div>
      )}

      {tab === "fields" && (
        <div role="tabpanel" id="panel-fields" aria-labelledby="tab-fields" className="flex flex-col gap-4" key={`fields-${version}`}>
          {form.sections.map((section, si) => (
            <section key={si} className="rounded-xl border border-slate-200 bg-slate-50 p-3" aria-label={`${t.section} ${si + 1}: ${say(section.title, lang)}`} data-testid={`section-${si}`}>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[18rem] flex-1">
                  <TextPair label={`${t.section} ${si + 1}: ${t.sectionTitle}`} value={section.title} t={t} onChange={(v) => setSection(si, { ...section, title: v })} />
                </div>
                <label className={lab}>{t.kind}
                  <select className={input} value={section.kind ?? "fields"} onChange={(e) => { const k = (e.target as HTMLSelectElement).value as SectionKind; const next = { ...section, kind: k }; if (k === "fields") delete next.kind; setSection(si, next); }}>
                    {SECTION_KINDS.map((k) => <option key={k} value={k}>{t.kinds[k]}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-1 pb-1.5 text-xs text-slate-600">
                  <input type="checkbox" checked={section.span === 1} onChange={(e) => { const next = { ...section }; if ((e.target as HTMLInputElement).checked) next.span = 1; else delete next.span; setSection(si, next); }} />
                  {t.halfWidth}
                </label>
                <div className="flex gap-1 pb-0.5">
                  <button type="button" className={small} disabled={si === 0} onClick={() => setForm({ ...form, sections: move(form.sections, si, -1) })} aria-label={`${t.moveUp}: ${t.section} ${si + 1}`}>↑</button>
                  <button type="button" className={small} disabled={si === form.sections.length - 1} onClick={() => setForm({ ...form, sections: move(form.sections, si, 1) })} aria-label={`${t.moveDown}: ${t.section} ${si + 1}`}>↓</button>
                  <button type="button" className={small} onClick={() => setForm({ ...form, sections: form.sections.filter((_, j) => j !== si) })}>{t.removeSection}</button>
                </div>
              </div>
              <ol className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
                {section.fields.map((field, fi) => {
                  const others = fields.filter((o) => o.id !== field.id);
                  const tid = `field-${field.id}`;
                  return (
                    <li key={`${field.id}-${fi}`} className="rounded-lg border border-slate-200 bg-white">
                      <details open={section.fields.length <= 2 || opened === field.id}>
                        <summary className="cursor-pointer px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-sky-600" data-testid={`${tid}-summary`}>
                          <span className="font-mono text-xs text-slate-500">{field.id}</span> · <strong className="font-semibold">{say(field.label, lang)}</strong>{" "}
                          <span className="text-slate-500">({t.types[field.type]}, {t.checkCount((field.checks ?? []).length)})</span>
                        </summary>
                        <div className="flex flex-col gap-3 border-t border-slate-100 px-3 py-3">
                          <div className="flex flex-wrap items-end gap-3">
                            <IdInput key={field.id} label={t.fieldId} value={field.id} testid={`${tid}-id`} onCommit={(v) => renameField(field.id, v)} />
                            <label className={lab}>{t.type}
                              <select className={input} value={field.type} data-testid={`${tid}-type`} onChange={(e) => {
                                const type = (e.target as HTMLSelectElement).value as FieldType;
                                const next: Field = { ...field, type };
                                if (OPTION_TYPES.includes(type) && type !== "checkbox" && !next.options?.length) next.options = [{ value: "a", label: "A" }, { value: "b", label: "B" }];
                                if (!OPTION_TYPES.includes(type)) delete next.options;
                                if (type !== "amount") delete next.total;
                                setField(si, fi, next);
                              }}>
                                {FIELD_TYPES.map((ft) => <option key={ft} value={ft}>{t.types[ft]}</option>)}
                              </select>
                            </label>
                            <label className="flex items-center gap-1 pb-1.5 text-xs text-slate-600">
                              <input type="checkbox" checked={!!field.required} onChange={(e) => { const next = { ...field }; if ((e.target as HTMLInputElement).checked) next.required = true; else delete next.required; setField(si, fi, next); }} />
                              {t.requiredField}
                            </label>
                            <label className="flex items-center gap-1 pb-1.5 text-xs text-slate-600">
                              <input type="checkbox" checked={field.span === 2} onChange={(e) => { const next = { ...field }; if ((e.target as HTMLInputElement).checked) next.span = 2; else delete next.span; setField(si, fi, next); }} />
                              {t.fullWidth}
                            </label>
                            {field.type === "amount" && (
                              <label className="flex items-center gap-1 pb-1.5 text-xs text-slate-600">
                                <input type="checkbox" checked={!!field.total} onChange={(e) => { const next = { ...field }; if ((e.target as HTMLInputElement).checked) next.total = true; else delete next.total; setField(si, fi, next); }} />
                                {t.total}
                              </label>
                            )}
                            <div className="ml-auto flex gap-1 pb-0.5">
                              <button type="button" className={small} disabled={fi === 0} aria-label={`${t.moveUp}: ${field.id}`} onClick={() => setSection(si, { ...section, fields: move(section.fields, fi, -1) })}>↑</button>
                              <button type="button" className={small} disabled={fi === section.fields.length - 1} aria-label={`${t.moveDown}: ${field.id}`} onClick={() => setSection(si, { ...section, fields: move(section.fields, fi, 1) })}>↓</button>
                              <button type="button" className={small} onClick={() => setSection(si, { ...section, fields: section.fields.filter((_, j) => j !== fi) })}>{t.removeField}</button>
                            </div>
                          </div>
                          <TextPair label={t.label} value={field.label} t={t} testid={`${tid}-label`} onChange={(v) => setField(si, fi, { ...field, label: v })} />
                          <TextPair label={t.hint} value={field.hint} t={t} onChange={(v) => { const next = { ...field, hint: v }; if (!say(v, "en") && !say(v, "nl")) delete next.hint; setField(si, fi, next); }} />
                          {OPTION_TYPES.includes(field.type) && (
                            <OptionsInput key={`${field.id}-${version}`} value={field.options} t={t} testid={`${tid}-options`} onChange={(o) => { const next = { ...field, options: o }; if (!o.length) delete next.options; setField(si, fi, next); }} />
                          )}
                          <div>
                            <span className="text-xs font-semibold text-slate-700">{t.checks}</span>
                            <ul className="m-0 mt-1 flex list-none flex-col gap-1.5 p-0">
                              {(field.checks ?? []).map((check, ci) => (
                                <CheckEditor key={`${ci}-${check.type}-${version}`} check={check} field={field} others={others} t={t} language={lang} testid={`${tid}-check-${ci}`}
                                  result={resultOf(field.id, ci)}
                                  onChange={(c) => setField(si, fi, { ...field, checks: (field.checks ?? []).map((x, j) => (j === ci ? c : x)) })}
                                  onRemove={() => { const next = { ...field, checks: (field.checks ?? []).filter((_, j) => j !== ci) }; if (!next.checks.length) delete next.checks; setField(si, fi, next); }} />
                              ))}
                            </ul>
                            <button type="button" className={`${small} mt-1.5`} data-testid={`${tid}-add-check`}
                              onClick={() => setField(si, fi, { ...field, checks: [...(field.checks ?? []), newCheck(field.type === "signature" || field.type === "checkbox" ? "required" : "exact", field, others)] })}>
                              {t.addCheck}
                            </button>
                          </div>
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ol>
              <button type="button" className={`${small} mt-2`} data-testid={`section-${si}-add-field`} disabled={fields.length >= MAX_FIELDS}
                onClick={() => {
                  const id = uniqueId(form, "field");
                  setOpened(id);
                  setSection(si, { ...section, fields: [...section.fields, { id, type: "text", label: { en: "New field", nl: "Nieuw veld" } }] });
                }}>
                {t.addField}
              </button>
            </section>
          ))}
          <div>
            <button type="button" className={button} onClick={() => setForm({ ...form, sections: [...form.sections, { id: `section${form.sections.length + 1}`, title: { en: "New section", nl: "Nieuw onderdeel" }, fields: [] }] })}>
              {t.addSection}
            </button>
          </div>
        </div>
      )}

      {tab === "solution" && (
        <div role="tabpanel" id="panel-solution" aria-labelledby="tab-solution" className="flex flex-col gap-3">
          <p className="m-0 text-sm text-slate-600">{t.solutionHelp}</p>
          <Situation text={say(form.situation, lang)} texts={t} paper={settings.theme === "paper"} />
          <FormView form={form} values={raw} language={lang} texts={t} theme={settings.theme} columns={settings.columns} validation={settings.validation} prefix="solution-"
            results={resultsByField}
            onChange={(id, value) => {
              const nextRaw = { ...raw, [id]: value };
              if (!value) delete nextRaw[id];
              setRaw(nextRaw);
              const field = fields.find((f) => f.id === id);
              const solution = { ...(form.solution ?? {}) };
              const v = field ? normalize(field, value, lang) : value;
              if (v) solution[id] = v;
              else delete solution[id];
              setForm({ ...form, solution: Object.keys(solution).length ? solution : undefined });
            }} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={button} onClick={() => { setRaw({}); const next = { ...form }; delete next.solution; setForm(next); }}>{t.clearSolution}</button>
            <span className="text-sm font-semibold" data-testid="solution-summary">{t.summary(evaluation.score, evaluation.maxscore)}</span>
          </div>
          <details className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <summary className="cursor-pointer text-slate-700">{t.responseFields}</summary>
            <table className="mt-2 border-collapse text-xs">
              <tbody>
                {checks.map((c, i) => (
                  <tr key={`c${i}`}><td className="pr-3 font-mono">check{i + 1}</td><td>{t.describe(c.check, nameOf, showValue, c.field.id)}</td></tr>
                ))}
                {fields.map((f, i) => (
                  <tr key={`v${i}`}><td className="pr-3 font-mono">value{i + 1}</td><td className="font-mono">{f.id}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}

      {problems.length > 0 && (
        <ul className="m-0 list-none space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="problems" aria-live="polite">
          {problems.map((p, i) => <li key={i} className="flex gap-1.5"><span aria-hidden="true">⚠</span>{p}</li>)}
        </ul>
      )}
    </div>
  );
};

export default Authoring;
