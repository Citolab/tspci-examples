// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/multiplematch, © Jeppe Bundsgaard, Aarhus University (openPCI)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useEffect, useRef, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import { Actions, StateModel } from "./store";
import { Category, Item, Settings, Topic, descriptionLines, key, visible } from "./matrix";
import { Texts } from "./texts";

// The matrix of the original: topics are column groups, under every topic the same categories, the items are rows.
// Each topic × item is one choice: radio buttons (one category) or checkboxes (several). Wide enough, it is a table;
// narrow, every item becomes a card with a row of answer buttons per topic (the layout setting can fix one of the two).
// Either way every option is a real radio button or checkbox (hidden behind its label): Tab goes from choice to
// choice, the arrow keys move within one, and a screen reader hears the item, the topic and the category.

/** Alternating tints per topic, after the original's green and blue column groups. */
const TINTS = [
  { head: "bg-emerald-100 text-emerald-900", sub: "bg-emerald-50", cell: "bg-emerald-50/40", on: "bg-emerald-600 border-emerald-600", pill: "bg-emerald-600 border-emerald-600 text-white", ring: "outline-emerald-700" },
  { head: "bg-sky-100 text-sky-900", sub: "bg-sky-50", cell: "bg-sky-50/40", on: "bg-sky-600 border-sky-600", pill: "bg-sky-600 border-sky-600 text-white", ring: "outline-sky-700" },
];

/** Below this width (px) the table does not fit: cards. */
const CARD_BREAKPOINT = 640;

const Description = ({ text, className = "" }: { text: string; className?: string }) => (
  <span className={className}>
    {descriptionLines(text).map((l, i) => (
      <span key={i} className="block">{l}</span>
    ))}
  </span>
);

const Interaction = ({ settings, store, texts, disabled }: {
  settings: Settings;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  disabled?: boolean;
}) => {
  const { answers, order } = useStore(store);
  const { topics, categories, items } = visible(settings, order);
  const multiple = settings.multiple;

  // the layout follows the width the PCI gets, not the window
  const ref = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      // the table's own width decides: a wide matrix switches to cards earlier
      const needed = Math.max(CARD_BREAKPOINT, 160 + topics.length * categories.length * 64);
      setNarrow(entry.contentRect.width < Math.min(needed, 1100));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [topics.length, categories.length]);

  if (!topics.length || !categories.length || !items.length) {
    return <p className="m-0 rounded-lg border border-amber-300 bg-amber-50 p-3 font-sans text-sm text-amber-900">{texts.nothing}</p>;
  }

  const total = topics.length * items.length;
  const done = topics.reduce((n, t) => n + items.filter((i) => (answers[key(t, i)] ?? []).length > 0).length, 0);
  const hasDescriptions = topics.some((t) => t.description);

  /** One option: a hidden radio or checkbox, and what it looks like comes from its label. */
  const input = (topic: Topic, item: Item, category: Category) => {
    const k = key(topic, item);
    const checked = (answers[k] ?? []).includes(category.value);
    const id = `mm-${k}-${category.value}`;
    return {
      id,
      checked,
      element: (
        <input type={multiple ? "checkbox" : "radio"} name={`mm-${k}`} id={id} value={category.value} className="peer sr-only"
          checked={checked} disabled={disabled} data-testid={id}
          aria-label={texts.option(category.label, item.label, topic.label)}
          onChange={() => store.dispatch({ type: multiple ? "TOGGLE" : "CHOOSE", payload: { key: k, value: category.value } })}
          // the click comes before the change: a radio that was chosen already is chosen again → take it back
          onClick={() => !multiple && checked && store.dispatch({ type: "CHOOSE", payload: { key: k, value: category.value } })} />
      ),
    };
  };

  const marker = (checked: boolean, tint: (typeof TINTS)[number]) => (
    <span aria-hidden="true"
      className={`grid size-5 place-items-center border-2 ${multiple ? "rounded-md" : "rounded-full"} ${checked ? tint.on : "border-slate-400 bg-white"}`}>
      {checked && (multiple
        ? <svg viewBox="0 0 16 16" className="size-3.5 text-white"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        : <span className="size-2 rounded-full bg-white" />)}
    </span>
  );

  const table = (
    <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_rgba(16,24,40,.06)]">
      <table className="border-collapse text-sm" aria-label={texts.table} data-testid="matrix">
        <thead>
          <tr>
            <td className="sticky left-0 z-10 bg-white" />
            {topics.map((t, ti) => (
              <th key={t.name} id={`mm-topic-${t.name}`} scope="colgroup" colSpan={categories.length}
                className={`border-l-2 border-white px-3 py-2.5 text-center font-semibold ${TINTS[ti % 2].head}`}>{t.label}</th>
            ))}
          </tr>
          {hasDescriptions && (
            <tr>
              <td className="sticky left-0 z-10 bg-white" />
              {topics.map((t, ti) => (
                <td key={t.name} colSpan={categories.length}
                  className={`border-l-2 border-white px-3 py-2 text-center text-[13px] text-slate-700 ${TINTS[ti % 2].sub}`}>
                  <Description text={t.description} />
                </td>
              ))}
            </tr>
          )}
          <tr className="border-b border-slate-300">
            <th scope="col" className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-semibold text-slate-500">{texts.item}</th>
            {topics.map((t, ti) =>
              categories.map((c, ci) => (
                <th key={`${t.name}-${c.value}`} scope="col"
                  className={`min-w-[4.5rem] px-2 py-2 text-center align-bottom text-xs font-medium leading-tight text-slate-700 ${ci === 0 ? "border-l-2 border-white" : ""} ${TINTS[ti % 2].sub}`}>
                  {c.label}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const rowDone = topics.every((t) => (answers[key(t, item)] ?? []).length > 0);
            return (
              <tr key={item.name} data-testid={`row-${item.name}`} className="group border-b border-slate-200 last:border-b-0">
                <th scope="row"
                  className="sticky left-0 z-10 min-w-[9rem] max-w-[18rem] bg-white px-3 py-2.5 text-left font-medium text-slate-800 group-hover:bg-slate-50">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${rowDone ? "bg-emerald-500" : "bg-slate-300"}`} />
                    {item.label}
                  </span>
                </th>
                {topics.map((t, ti) => {
                  const tint = TINTS[ti % 2];
                  const groupChecked = (answers[key(t, item)] ?? []).length > 0;
                  return categories.map((c, ci) => {
                    const { id, checked, element } = input(t, item, c);
                    return (
                      <td key={`${t.name}-${c.value}`}
                        className={`p-0 text-center ${ci === 0 ? "border-l-2 border-white" : ""} ${groupChecked ? tint.sub : tint.cell} group-hover:brightness-[.97] has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 ${tint.ring}`}>
                        {element}
                        <label htmlFor={id} className={`flex min-h-11 items-center justify-center px-2 py-2 ${disabled ? "" : "cursor-pointer"}`}>
                          {marker(checked, tint)}
                        </label>
                      </td>
                    );
                  });
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const cards = (
    <ol className="m-0 flex list-none flex-col gap-3 p-0" aria-label={texts.table} data-testid="cards">
      {items.map((item) => (
        <li key={item.name} className="min-w-0 break-words rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,.04)]">
          <p className="m-0 mb-2 font-semibold text-slate-800">{item.label}</p>
          <div className="flex flex-col gap-2.5">
            {topics.map((t, ti) => {
              const tint = TINTS[ti % 2];
              return (
                <fieldset key={t.name} className={`m-0 min-w-0 rounded-lg border-0 p-2 ${tint.cell}`}
                  role={multiple ? "group" : "radiogroup"} aria-label={texts.group(item.label, t.label)}>
                  <legend className="contents">
                    <span className={`mb-1.5 inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${tint.head}`}>{t.label}</span>
                  </legend>
                  {t.description && <Description text={t.description} className="mb-1.5 block text-xs text-slate-600" />}
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map((c) => {
                      const { id, checked, element } = input(t, item, c);
                      return (
                        <span key={c.value} className="contents">
                          {element}
                          <label htmlFor={id}
                            className={`inline-flex min-h-10 items-center rounded-full border px-3 text-sm transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 ${tint.ring} ${disabled ? "" : "cursor-pointer"} ${checked ? tint.pill : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"}`}>
                            {c.label}
                          </label>
                        </span>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </li>
      ))}
    </ol>
  );

  return (
    <div ref={ref} className="flex w-full max-w-full flex-col gap-2 font-sans text-slate-800">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[13px] text-slate-600">
        <p className="m-0">{multiple ? texts.chooseMany : texts.chooseOne}</p>
        <p className="m-0 tabular-nums" data-testid="progress">{texts.answered(done, total)}</p>
      </div>
      {settings.layout === "cards" || (settings.layout === "auto" && narrow) ? cards : table}
    </div>
  );
};

export default Interaction;
