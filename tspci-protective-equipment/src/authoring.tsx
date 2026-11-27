/*
 * The authoring mode (index.tsx getAuthoringInstance): the item author starts from a preset job or writes an own one,
 * and sets per item whether it is required, allowed (not needed, not wrong) or not needed (wrong), and which hazards the
 * job has (for the explain question). Below it: what the pupil must wear, whether there is one correct answer (then
 * match_correct can score it) and what keeps Done from finishing. It writes the settings job and customJob.
 */
import type { ComponentChildren } from "preact";
import type { PciProperties } from "@citolab/tspci";
import { useState } from "preact/hooks";
import configProps from "./config.json";
import {
  HAZARDS, HazardId, ITEM_IDS, ItemId, JobSpec, PRESETS, PRESET_IDS, PresetId, Status, ZONES, hasOneAnswer, itemsOfZone, jobFrom,
  jobProblems, requirements, serializeCustomJob, statusOf,
} from "./equipment";
import { ItemIcon, Sign } from "./drawings";
import { Language, Texts, jobText, listOf, problemText, textsFor } from "./texts";

type PropTypes = PciProperties<typeof configProps>;

/** What the author makes: the job's text, a status per item, the hazards; own: written as an own job, also when it equals a preset. */
export type Authored = { text: string; statuses: Record<ItemId, Status>; hazards: HazardId[]; own: boolean };

const STATUSES: Status[] = ["required", "allowed", "wrong"];

export const specOf = (a: Authored): JobSpec => ({
  required: ITEM_IDS.filter((id) => a.statuses[id] === "required"),
  allowed: ITEM_IDS.filter((id) => a.statuses[id] === "allowed"),
  hazards: HAZARDS.filter((hazard) => a.hazards.includes(hazard)),
});

const statusesOf = (spec: JobSpec) => Object.fromEntries(ITEM_IDS.map((id) => [id, statusOf(spec, id)])) as Record<ItemId, Status>;
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The preset the author's job is, in the language of the item (its text, items and hazards); null for an own job. */
export function presetOf(a: Authored, language: string | undefined): PresetId | null {
  const spec = specOf(a);
  const t = textsFor(language);
  return (
    PRESET_IDS.find((id) => {
      const p = PRESETS[id];
      return (
        t.jobs[id].text === a.text.trim() &&
        same(spec.required, ITEM_IDS.filter((x) => p.required.includes(x))) &&
        same(spec.allowed, ITEM_IDS.filter((x) => p.allowed.includes(x))) &&
        same(spec.hazards, HAZARDS.filter((x) => p.hazards.includes(x)))
      );
    }) ?? null
  );
}

/** The authoring mode starts from the settings: the preset in the item's language, or the own job. */
export function authoredFrom(properties: Partial<PropTypes>): Authored {
  const job = jobFrom(properties);
  return { text: jobText(job, textsFor(properties.language)), statuses: statusesOf(job), hazards: [...job.hazards], own: job.preset === "custom" };
}

export const fromPreset = (id: PresetId, language: string | undefined): Authored => ({
  text: textsFor(language).jobs[id].text,
  statuses: statusesOf(PRESETS[id]),
  hazards: [...PRESETS[id].hazards],
  own: false,
});

/** The settings the authoring mode writes: a preset by its id, an own job as JSON. */
export function authoredProperties(a: Authored, language: string | undefined): Record<string, string> {
  const preset = a.own ? null : presetOf(a, language);
  return preset ? { job: preset, customJob: "" } : { job: "custom", customJob: serializeCustomJob({ ...specOf(a), text: a.text.trim() }) };
}

/** What keeps Done from finishing, in the author's language. */
export function authoredProblems(a: Authored, properties: Partial<PropTypes>, language: Language): string[] {
  const t = textsFor(language);
  const job = { ...specOf(a), preset: "custom" as const, text: a.text };
  return jobProblems(job, properties.explain === "true").map((p) => problemText(p, t));
}

const AUTHOR_TEXTS = {
  en: {
    heading: "Job and equipment",
    startFrom: "Start from",
    own: "Own job",
    jobText: "The job, as the pupil reads it",
    equipment: "Equipment",
    equipmentHint:
      "Required: the pupil must wear it. Allowed: not needed, but not wrong. Not needed: wearing it counts as wrong. Required items that can not be worn together (gloves, shoes, a hat, a mask, a suit) or of the same kind (ear plugs, ear muffs) are alternatives: one of them is enough.",
    status: { required: "Required", allowed: "Allowed", wrong: "Not needed" } satisfies Record<Status, string>,
    mustWear: "The pupil must wear",
    or: "or",
    nothing: "nothing yet",
    oneAnswer: "One correct answer: match_correct can score it.",
    moreAnswers: "More than one correct answer (alternatives or allowed items): score with a rule on the field correct.",
    hazards: "Hazards of this job",
    hazardsHint: "For the question why (the explain setting): a reason is right when the item protects against a hazard that is ticked here.",
    problems: "To do before Done",
  },
  nl: {
    heading: "Werk en beschermingsmiddelen",
    startFrom: "Begin met",
    own: "Eigen werk",
    jobText: "Het werk, zoals de leerling het leest",
    equipment: "Beschermingsmiddelen",
    equipmentHint:
      "Verplicht: de leerling moet het dragen. Toegestaan: niet nodig, maar niet fout. Niet nodig: dragen telt als fout. Verplichte middelen die niet samen gedragen kunnen worden (handschoenen, schoenen, een helm of pet, een masker, een pak) of van dezelfde soort zijn (oordoppen, gehoorkappen) zijn alternatieven: één ervan is genoeg.",
    status: { required: "Verplicht", allowed: "Toegestaan", wrong: "Niet nodig" },
    mustWear: "De leerling moet dragen",
    or: "of",
    nothing: "nog niets",
    oneAnswer: "Eén goed antwoord: match_correct kan het scoren.",
    moreAnswers: "Meer dan één goed antwoord (alternatieven of toegestane middelen): scoor met een regel op het veld correct.",
    hazards: "Gevaren van dit werk",
    hazardsHint: "Voor de vraag waarom (de instelling explain): een reden is goed als het middel beschermt tegen een gevaar dat hier is aangevinkt.",
    problems: "Nog te doen voor Klaar",
  },
};

export function Authoring({ initial, properties, language, onChange }: {
  initial: Authored;
  properties: Partial<PropTypes>;
  language: Language;
  onChange: (next: Authored) => void;
}) {
  const [a, setA] = useState(initial);
  const at = AUTHOR_TEXTS[language];
  const t = textsFor(language); // names of items, zones and hazards, in the author's language
  const explain = properties.explain === "true";
  const update = (next: Authored) => {
    setA(next);
    onChange(next);
  };
  const preset = a.own ? null : presetOf(a, properties.language);
  const spec = specOf(a);
  const groups = requirements(spec);
  const problems = authoredProblems(a, properties, language);

  return (
    <div className="authoring font-sans text-ink" lang={language}>
      <h2 className="text-[1.3em] font-extrabold">{at.heading}</h2>

      <div className="mt-3 grid gap-3">
        <label className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{at.startFrom}</span>
          <select
            className="author-input"
            value={preset ?? "custom"}
            data-start
            onChange={(e) => {
              const value = e.currentTarget.value;
              update(value === "custom" ? { ...a, own: true } : fromPreset(value as PresetId, properties.language));
            }}
          >
            {PRESET_IDS.map((id) => (
              <option key={id} value={id}>
                {t.jobs[id].title}
              </option>
            ))}
            <option value="custom">{at.own}</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="font-semibold">{at.jobText}</span>
          <textarea className="author-input" rows={2} value={a.text} data-job-text onInput={(e) => update({ ...a, text: e.currentTarget.value })} />
        </label>
      </div>

      <h3 className="mt-5 text-[1.1em] font-bold">{at.equipment}</h3>
      <p className="mt-1 text-sm text-slate-600">{at.equipmentHint}</p>
      <div className="mt-2 grid gap-3">
        {ZONES.map((zone) => (
          <div key={zone}>
            <h4 className="zone-name">{t.zones[zone]}</h4>
            <ul className="grid gap-1.5">
              {itemsOfZone(zone).map((id) => (
                <li key={id} className={`author-row author-row-${a.statuses[id]}`} data-item={id}>
                  <span className="flex items-center gap-2">
                    <ItemIcon id={id} size={40} />
                    <Sign id={id} size={28} />
                    <span className="font-semibold">{t.items[id]}</span>
                  </span>
                  <RadioGroup label={t.items[id]} value={a.statuses[id]} options={STATUSES} names={at.status} onChange={(status) => update({ ...a, statuses: { ...a.statuses, [id]: status } })} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border-2 border-slate-200 bg-white px-3 py-2" data-summary>
        <p>
          <span className="font-semibold">{at.mustWear}:</span>{" "}
          {groups.length ? groups.map((group) => listOf(group.map((id) => t.itemsLower[id]), at.or)).join("; ") : at.nothing}
        </p>
        <p className="mt-1 text-sm text-slate-600" data-one-answer={hasOneAnswer(spec, explain)}>
          {hasOneAnswer(spec, explain) ? at.oneAnswer : at.moreAnswers}
        </p>
      </div>

      <fieldset className="mt-5">
        <legend className="text-[1.1em] font-bold">{at.hazards}</legend>
        <p className="mt-1 text-sm text-slate-600">{at.hazardsHint}</p>
        <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(16em,1fr))] gap-x-4 gap-y-1">
          {HAZARDS.map((hazard) => (
            <label key={hazard} className="flex min-h-8 items-center gap-2">
              <input
                type="checkbox"
                className="h-5 w-5 accent-accent"
                checked={a.hazards.includes(hazard)}
                data-hazard={hazard}
                onChange={(e) =>
                  update({ ...a, hazards: e.currentTarget.checked ? HAZARDS.filter((h) => h === hazard || a.hazards.includes(h)) : a.hazards.filter((h) => h !== hazard) })
                }
              />
              {t.hazards[hazard]}
            </label>
          ))}
        </div>
      </fieldset>

      {problems.length > 0 && (
        <div role="status" className="mt-4 rounded-lg border-2 border-red-600 bg-red-50 px-3 py-2 text-red-900" data-problems>
          <p className="font-semibold">{at.problems}</p>
          <ul className="list-disc pl-5">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** A row of options as a radio group: a click or tap picks one; the arrow keys, Home and End move the choice. */
function RadioGroup<T extends string>({ label, value, options, names, onChange }: { label: string; value: T; options: T[]; names: Record<T, string>; onChange: (value: T) => void }) {
  const onKeyDown = (e: KeyboardEvent) => {
    const index = options.indexOf(value);
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? options[(index + 1) % options.length]
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? options[(index + options.length - 1) % options.length]
          : e.key === "Home"
            ? options[0]
            : e.key === "End"
              ? options[options.length - 1]
              : null;
    if (next === null) return;
    e.preventDefault();
    onChange(next);
    const group = e.currentTarget as HTMLElement;
    setTimeout(() => group.querySelector<HTMLElement>(`[data-value="${next}"]`)?.focus(), 0);
  };
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-1.5" onKeyDown={(e) => onKeyDown(e as unknown as KeyboardEvent)}>
      {options.map((option) => (
        <Option key={option} checked={option === value} value={option} onSelect={() => onChange(option)}>
          {names[option]}
        </Option>
      ))}
    </div>
  );
}

function Option({ checked, value, onSelect, children }: { checked: boolean; value: string; onSelect: () => void; children: ComponentChildren }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      tabIndex={checked ? 0 : -1}
      data-value={value}
      onClick={onSelect}
      className={`status-option status-${value} ${checked ? "status-on" : ""}`}
    >
      {checked && <span aria-hidden="true">{value === "required" ? "✓ " : value === "wrong" ? "✕ " : "○ "}</span>}
      {children}
    </button>
  );
}
