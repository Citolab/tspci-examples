/*
 * The authoring mode (index.tsx getAuthoringInstance): the item author picks a document and a task, changes the
 * document's values in a form, and taps in the document (the same view the pupil gets) what the pupil has to find:
 * the right field (find), where the answer is (answer), or a computed field to make wrong on purpose (check). Below
 * the document every value is in a form, grouped as on the document; a computed field shows what it computes to and
 * can be given another value, which makes it a mistake. It writes the settings template, task, language, question,
 * document, targets, answer, tolerance, unit and markSource.
 */
import type { ComponentChildren } from "preact";
import type { PciProperties } from "@citolab/tspci";
import { useState } from "preact/hooks";
import configProps from "./config.json";
import {
  DocumentSpec, Language, TEMPLATES, Task, TemplateId, Values, buildDocument, canonical, exampleOf, inputText, modelFrom,
  parseDocumentSpec, problemsOf, serializeDocumentSpec, showValue, suggestWrong, templateName,
} from "./documents";
import { DocumentView } from "./documentView";
import { TEXTS } from "./texts";

type PropTypes = PciProperties<typeof configProps>;

/** What the author makes: the values and wrong values as they typed them, in the document's language. */
export type Authored = {
  template: TemplateId;
  task: Task;
  language: Language;
  question: string;
  values: Values;
  /** computed fields made wrong: the value the document shows instead */
  mistakes: Record<string, string>;
  /** find: the right field(s); answer: where the answer is */
  targets: string[];
  answer: string;
  tolerance: string;
  unit: string;
  markSource: boolean;
};

/** Values in their neutral form ("14.25") as the author types them in the language ("14,25"). */
function localValues(template: TemplateId, language: Language, values: Values, mistakes: Record<string, string> = {}) {
  const doc = buildDocument(template, language, { values, mistakes: {} });
  const kinds = Object.fromEntries(doc.inputs.map((input) => [input.key, input.kind]));
  const local = (kind: (typeof kinds)[string] | undefined, value: string) => (kind ? inputText(kind, canonical(kind, value, "en") ?? value, language) : value);
  return {
    values: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, local(kinds[key], value)])),
    mistakes: Object.fromEntries(Object.entries(mistakes).map(([id, value]) => [id, local(doc.byId[id]?.kind, value)])),
  };
}

/** The example of a template for a task: its values, its mistakes (check), its target and answer. */
function exampleAuthored(template: TemplateId, task: Task, language: Language, rest: Partial<Authored> = {}): Authored {
  const example = exampleOf(template, language);
  const { values, mistakes } = localValues(template, language, example.values, task === "check" ? example.check : {});
  return {
    template,
    task,
    language,
    question: "",
    values,
    mistakes,
    targets: task === "find" ? [example.find.target] : task === "answer" ? [example.answer.source] : [],
    answer: task === "answer" ? inputText("number", example.answer.answer, language) : "",
    tolerance: "0",
    unit: "",
    markSource: true,
    ...rest,
  };
}

/** The authoring mode starts from the settings; without a document of its own, from the example. */
export function authoredFrom(properties: Partial<PropTypes>): Authored {
  const model = modelFrom(properties);
  const own = parseDocumentSpec(properties.document);
  const start = exampleAuthored(model.template, model.task, model.language);
  const { values, mistakes } = own ? localValues(model.template, model.language, own.values, own.mistakes) : start;
  return {
    ...start,
    question: properties.question ?? "",
    values,
    mistakes,
    targets: model.task === "check" ? [] : model.targets,
    answer: (properties.answer ?? "").trim() || (model.task === "answer" && model.answer !== null ? inputText("number", String(model.answer), model.language) : ""),
    tolerance: (properties.tolerance ?? "").trim() || "0",
    unit: properties.unit ?? "",
    markSource: String(properties.markSource ?? "true") !== "false",
  };
}

/** The document as the settings keep it: values and wrong values in their neutral form. */
export function specOf(a: Authored): DocumentSpec {
  const raw = buildDocument(a.template, a.language, { values: a.values, mistakes: {} });
  const kinds = Object.fromEntries(raw.inputs.map((input) => [input.key, input.kind]));
  const values = Object.fromEntries(
    Object.entries(a.values).map(([key, value]) => [key, kinds[key] ? (canonical(kinds[key], value, a.language) ?? value) : value]),
  );
  const mistakes = Object.fromEntries(
    Object.entries(a.mistakes)
      .filter(([id, value]) => value.trim() !== "" && raw.byId[id]?.computed)
      .map(([id, value]) => [id, canonical(raw.byId[id].kind, value, a.language, raw.byId[id].decimals ?? 2) ?? value]),
  );
  return { values, mistakes };
}

/** The settings the authoring mode writes, as strings. */
export function authoredProperties(a: Authored): Record<string, string> {
  return {
    template: a.template,
    task: a.task,
    language: a.language,
    question: a.question,
    document: serializeDocumentSpec(specOf(a)),
    targets: a.task === "check" ? "" : a.targets.join(","),
    answer: a.task === "answer" ? (canonical("number", a.answer, a.language) ?? a.answer.trim()) : "",
    tolerance: canonical("number", a.tolerance, a.language) ?? "0",
    unit: a.unit.trim(),
    markSource: String(a.markSource),
  };
}

/** What keeps Done from finishing, in the author's language. */
export function authoredProblems(a: Authored, language: Language): string[] {
  const { problems } = TEXTS[language];
  const model = modelFrom(authoredProperties(a));
  const codes = problemsOf(model, { values: a.values, mistakes: a.mistakes });
  if (a.task === "find" && !a.targets.length && !codes.includes("noTarget")) codes.unshift("noTarget");
  if (a.task === "answer" && a.answer.trim() !== "" && canonical("number", a.answer, a.language) === null && !codes.includes("noAnswer")) codes.push("noAnswer");
  return codes.map((code) => problems[code]);
}

/** The values (and wrong values, targets) of a list with line `removed` taken out: the lines after it move up. */
function withoutRow<T>(entries: Record<string, T>, prefix: string, removed: number): Record<string, T> {
  const pattern = new RegExp(`^${prefix}(\\d+)([A-Z].*)$`);
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(entries)) {
    const m = pattern.exec(key);
    if (!m) out[key] = value;
    else if (Number(m[1]) < removed) out[key] = value;
    else if (Number(m[1]) > removed) out[`${prefix}${Number(m[1]) - 1}${m[2]}`] = value;
  }
  return out;
}

type Props = {
  initial: Authored;
  language: Language;
  currency: string;
  onChange: (authored: Authored) => void;
};

export function Authoring({ initial, language, currency, onChange }: Props) {
  const [a, setA] = useState(initial);
  const [many, setMany] = useState(initial.targets.length > 1);
  const t = TEXTS[language];
  const change = (next: Partial<Authored>) => {
    const value = { ...a, ...next };
    setA(value);
    onChange(value);
  };

  const properties = authoredProperties(a);
  const model = modelFrom({ ...properties, currency });
  const { doc } = model;
  const problems = authoredProblems(a, language);
  const show = (id: string) => {
    const field = doc.byId[id];
    return field ? showValue(field, field.natural, doc.language, currency) : id;
  };
  /** The values are the example's: switching task or language may start again from the example. */
  const untouched = JSON.stringify(specOf(a).values) === JSON.stringify(specOf(exampleAuthored(a.template, a.task, a.language)).values);

  const setTemplate = (template: TemplateId) => change(exampleAuthored(template, a.task, a.language, { markSource: a.markSource }));
  const setTask = (task: Task) => {
    if (untouched) return change(exampleAuthored(a.template, task, a.language, { values: a.values, markSource: a.markSource, ...(task === "check" ? {} : { mistakes: a.mistakes }) }));
    change({ task, question: "", targets: task === "check" ? [] : a.targets.slice(0, 1), answer: task === "answer" ? a.answer : "" });
  };
  const setLanguage = (next: Language) => {
    if (next === a.language) return;
    if (untouched) return change(exampleAuthored(a.template, a.task, next, { question: a.question, markSource: a.markSource, targets: a.targets }));
    const spec = specOf(a);
    const local = localValues(a.template, next, spec.values, spec.mistakes);
    const answer = canonical("number", a.answer, a.language);
    change({ language: next, ...local, answer: answer === null ? a.answer : inputText("number", answer, next) });
  };

  const onTap = (id: string) => {
    if (a.task === "check") {
      const field = doc.byId[id];
      const mistakes = { ...a.mistakes };
      if ((mistakes[id] ?? "").trim() !== "") delete mistakes[id];
      else mistakes[id] = inputText(field.kind, suggestWrong(field), a.language);
      return change({ mistakes });
    }
    if (a.targets.includes(id)) return change({ targets: a.targets.filter((target) => target !== id) });
    change({ targets: a.task === "find" && many ? [...a.targets, id] : [id] });
  };

  const rows = doc.rows;
  const removeRow = (row: number) => {
    if (!rows) return;
    const prefix = rows.prefix;
    const targets = Object.keys(withoutRow(Object.fromEntries(a.targets.map((id) => [id, true])), prefix, row));
    change({
      values: { ...withoutRow(a.values, prefix, row), [rows.key]: String(rows.count - 1) },
      mistakes: withoutRow(a.mistakes, prefix, row),
      targets,
    });
  };
  const addRow = () => {
    if (!rows) return;
    const n = rows.count + 1;
    const blank = Object.fromEntries(
      Object.entries(rows.blank).map(([suffix, value]) => [
        `${rows.prefix}${n}${suffix}`,
        suffix === "Name" ? t.newLine : inputText(suffix === "Price" ? "money" : "number", value, a.language),
      ]),
    );
    change({ values: { ...a.values, ...blank, [rows.key]: String(n) } });
  };

  const markOf = (id: string) =>
    a.task === "check" ? (doc.byId[id]?.wrong ? "mistake" : null) : a.targets.includes(id) ? (a.task === "find" ? "chosen" : "source") : null;

  const invalid = (kind: string, value: string | undefined) => kind !== "text" && value !== undefined && value.trim() !== "" && canonical(kind as never, value, a.language) === null;
  const autoAnswer = modelFrom({ ...properties, answer: "" }).answer;

  return (
    <div className="authoring p-5 font-sans text-ink">
      <h2 className="text-xl font-semibold tracking-tight">{t.authoringTitle}</h2>
      <p className="text-slate-600">{t.authoringIntro}</p>

      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <Options label={t.template}>
          {TEMPLATES.map((template) => (
            <Option key={template} label={templateName(template, language)} checked={a.template === template} onSelect={() => setTemplate(template)} />
          ))}
        </Options>
        <Options label={t.task}>
          {(["find", "check", "answer"] as Task[]).map((task) => (
            <Option key={task} label={t[task]} checked={a.task === task} onSelect={() => setTask(task)} />
          ))}
        </Options>
        <Options label={t.language}>
          <Option label={t.english} checked={a.language === "en"} onSelect={() => setLanguage("en")} />
          <Option label={t.dutch} checked={a.language === "nl"} onSelect={() => setLanguage("nl")} />
        </Options>
      </div>

      <label className="mt-4 block">
        <span className="text-sm font-semibold text-slate-600">{t.question}</span>
        <textarea
          className="author-input mt-1 block w-full"
          rows={2}
          value={a.question}
          placeholder={t.questionPlaceholder(modelFrom({ ...properties, question: "" }).question)}
          onInput={(e) => change({ question: e.currentTarget.value })}
        />
      </label>

      <TaskPanel a={a} t={t} many={many} setMany={setMany} change={change} show={show} doc={doc} autoAnswer={autoAnswer} model={model} />

      <h3 className="mt-5 text-sm font-semibold tracking-wide text-slate-500 uppercase">{t.preview}</h3>
      <p className="text-sm text-slate-600">{t.previewHint[a.task]}</p>
      <div className="mt-2">
        <DocumentView
          doc={doc}
          currency={currency}
          markOf={markOf}
          onTap={onTap}
          canTap={(field) => a.task !== "check" || field.computed}
          markText={{ chosen: t.stateTarget, mistake: t.stateMistake, source: t.stateSource }}
        />
      </div>

      <h3 className="mt-5 text-sm font-semibold tracking-wide text-slate-500 uppercase">{t.values}</h3>
      <p className="text-sm text-slate-600">
        {t.valuesHint} {t.computedHint}
      </p>
      <div className="mt-2 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(19rem,1fr))]">
        {doc.groups.map((group) => {
          const inputs = doc.inputs.filter((input) => input.group === group);
          const computed = doc.fields.filter((field) => field.computed && field.group === group);
          const row = inputs.find((input) => input.row > 0)?.row ?? 0;
          if (!inputs.length && !computed.length) return null;
          return (
            <fieldset key={group} className="rounded-lg border border-slate-200 p-2.5">
              <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
                {group}
                {rows && row > 0 && (
                  <button type="button" className="author-button" disabled={rows.count <= rows.min} onClick={() => removeRow(row)}>
                    {t.removeRow(row)}
                  </button>
                )}
              </legend>
              <div className="flex flex-col gap-1.5">
                {inputs.map((input) => {
                  const value = a.values[input.key] ?? "";
                  const bad = invalid(input.kind, value);
                  return (
                    <label key={input.key} className="author-row">
                      <span>
                        {input.label}
                        {input.unit ? ` (${input.unit})` : ""}
                      </span>
                      <input
                        className={`author-input${bad ? " invalid" : ""}`}
                        data-key={input.key}
                        value={value}
                        aria-invalid={bad}
                        inputMode={input.kind === "text" ? undefined : input.kind === "time" || input.kind === "shift" ? "text" : "decimal"}
                        onInput={(e) => change({ values: { ...a.values, [input.key]: e.currentTarget.value } })}
                      />
                    </label>
                  );
                })}
                {computed.map((field) => {
                  const value = a.mistakes[field.id] ?? "";
                  const bad = invalid(field.kind, value);
                  return (
                    <label key={field.id} className="author-row">
                      <span>
                        {field.label} <span className="computed-tag">{t.computed}</span>
                      </span>
                      <span className="flex flex-col">
                        <input
                          className={`author-input${bad ? " invalid" : ""}${field.wrong ? " wrong" : ""}`}
                          data-mistake={field.id}
                          value={value}
                          aria-invalid={bad}
                          aria-label={t.wrongValue(field.label)}
                          placeholder={showValue(field, field.natural, doc.language, currency)}
                          onInput={(e) => {
                            const mistakes = { ...a.mistakes, [field.id]: e.currentTarget.value };
                            if (e.currentTarget.value.trim() === "") delete mistakes[field.id];
                            change({ mistakes });
                          }}
                        />
                        <span className="text-xs text-slate-600">{t.shouldBe(showValue(field, field.natural, doc.language, currency))}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {rows && (
          <button type="button" className="author-button px-3" disabled={rows.count >= rows.max} onClick={addRow}>
            + {t.addRow}
          </button>
        )}
        <button type="button" className="author-button px-3" onClick={() => change(exampleAuthored(a.template, a.task, a.language, { markSource: a.markSource }))}>
          {t.restart}
        </button>
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 p-3 text-sm" role="status">
        {problems.length ? (
          <ul className="list-disc pl-5 text-red-700">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : (
          <p className="text-accent-strong">{t.ready}</p>
        )}
      </div>
    </div>
  );
}

type PanelProps = {
  a: Authored;
  t: (typeof TEXTS)["en"];
  many: boolean;
  setMany: (many: boolean) => void;
  change: (next: Partial<Authored>) => void;
  show: (id: string) => string;
  doc: ReturnType<typeof buildDocument>;
  model: ReturnType<typeof modelFrom>;
  autoAnswer: number | null;
};

/** What the task needs: the right field(s), the mistakes, or the answer and where it is. */
function TaskPanel({ a, t, many, setMany, change, show, doc, model, autoAnswer }: PanelProps) {
  const chips = (ids: string[]) =>
    ids.length ? (
      <ul className="flex flex-wrap gap-2">
        {ids.map((id) => (
          <li key={id} className="chip">
            <span>
              {doc.byId[id]?.label ?? id}: <strong>{show(id)}</strong> <code className="text-xs text-slate-500">{id}</code>
            </span>
            <button
              type="button"
              className="chip-remove"
              aria-label={t.removeTarget(doc.byId[id]?.label ?? id)}
              onClick={() => change({ targets: a.targets.filter((target) => target !== id) })}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-slate-600">{t.noTargets}</p>
    );

  if (a.task === "find") {
    return (
      <section className="task-panel" aria-label={t.targetsFind}>
        <h3 className="panel-title">{t.targetsFind}</h3>
        {chips(a.targets)}
        <Check label={t.many} checked={many} onChange={setMany} />
      </section>
    );
  }
  if (a.task === "check") {
    const wrong = doc.fields.filter((field) => field.wrong);
    return (
      <section className="task-panel" aria-label={t.mistakesTitle}>
        <h3 className="panel-title">{t.mistakesTitle}</h3>
        {wrong.length ? (
          <ol className="list-decimal pl-6">
            {wrong.map((field) => (
              <li key={field.id}>
                {t.mistakeLine(field.label, showValue(field, field.shown, doc.language, model.currency), showValue(field, field.natural, doc.language, model.currency))}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-slate-600">{t.noMistakesYet}</p>
        )}
      </section>
    );
  }
  const auto = autoAnswer === null ? "" : inputText("number", String(autoAnswer), a.language);
  return (
    <section className="task-panel" aria-label={t.targetsAnswer}>
      <h3 className="panel-title">{t.targetsAnswer}</h3>
      {chips(a.targets.slice(0, 1))}
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-sm">
          <span className="font-semibold">{t.correctAnswer}</span>
          <input
            className={`author-input w-32${a.answer.trim() !== "" && canonical("number", a.answer, a.language) === null ? " invalid" : ""}`}
            inputMode="decimal"
            value={a.answer}
            placeholder={auto}
            onInput={(e) => change({ answer: e.currentTarget.value })}
          />
        </label>
        {auto !== "" && a.answer.trim() !== auto && (
          <button type="button" className="author-button px-2" onClick={() => change({ answer: auto })}>
            {t.useValue(auto)}
          </button>
        )}
        <label className="flex flex-col text-sm">
          <span className="font-semibold">{t.unit}</span>
          <input className="author-input w-32" value={a.unit} placeholder={t.unitPlaceholder(modelFrom({ ...authoredProperties(a), unit: "" }).unit)} onInput={(e) => change({ unit: e.currentTarget.value })} />
        </label>
        <label className="flex flex-col text-sm">
          <span className="font-semibold">{t.tolerance}</span>
          <input className="author-input w-24" inputMode="decimal" value={a.tolerance} onInput={(e) => change({ tolerance: e.currentTarget.value })} />
        </label>
      </div>
      <Check label={t.markSource} checked={a.markSource} onChange={(markSource) => change({ markSource })} />
    </section>
  );
}

/** A row of options of which one is picked: a radio group with its name in front. */
function Options({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="w-[6.5em] shrink-0 text-sm font-semibold text-slate-600" aria-hidden="true">
        {label}
      </span>
      {children}
    </div>
  );
}

function Option({ label, checked, onSelect }: { label: string; checked: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={`min-h-9 cursor-pointer rounded-md border-2 bg-white px-2.5 py-1 text-sm transition-colors ${
        checked ? "border-accent-strong bg-tint font-semibold text-accent-strong" : "border-slate-300 text-slate-700 hover:border-slate-500"
      }`}
    >
      {label}
    </button>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="mt-2 flex min-h-6 cursor-pointer items-center gap-1.5 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-accent-strong" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      {label}
    </label>
  );
}
