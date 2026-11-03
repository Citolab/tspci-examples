// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/oat-sa/extension-tao-itemqti-pci/tree/develop/views/js/pciCreator/ims/likertScoreInteraction,
// © 2016-2024 Open Assessment Technologies SA
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import { Actions, StateModel } from "./store";
import { Settings, Style } from "./likert";
import { Texts } from "./texts";

// A fieldset of real radio buttons: the question is the legend, Tab enters the group, the arrow keys move between the
// levels, and a screen reader hears "3 of 5". Each radio hides behind a label that fills its part of the scale, so the
// touch target is at least 44 px high and as wide as the scale allows.

const Thumb = ({ down, title }: { down?: boolean; title: string }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" role="img" aria-label={title}
    className={`shrink-0 text-slate-500 ${down ? "rotate-180" : ""}`} fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3Z" />
    <path d="M7 10l4-7a2.5 2.5 0 0 1 3 2.6L13.5 9H19a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 17.6 21H7" />
  </svg>
);

// What a level looks like in each style. It follows the radio (peer) for the focus ring; all of it is aria-hidden.
const focusRing = "peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky-600";

const Star = ({ filled, preview }: { filled: boolean; preview: boolean }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" stroke-width="1.6" stroke-linejoin="round"
    className={`size-8 rounded-md transition-colors sm:size-10 ${focusRing}
      ${filled ? "fill-amber-400 stroke-amber-500" : preview ? "fill-amber-200 stroke-amber-400" : "fill-white stroke-slate-400 group-hover:stroke-amber-400"}`}>
    <path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9Z" />
  </svg>
);

/** A face from a frown (level 1) to a smile (the last level), red to green when chosen. */
const Smiley = ({ level, levels, checked }: { level: number; levels: number; checked: boolean }) => {
  const t = levels > 1 ? (level - 1) / (levels - 1) : 1;
  const color = `hsl(${Math.round(t * 130)} 70% 45%)`;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke-width="1.8" stroke-linecap="round"
      style={checked ? { color } : undefined}
      className={`size-8 rounded-full transition-colors sm:size-10 ${focusRing}
        ${checked ? "" : "text-slate-400 group-hover:text-slate-600"}`}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" fill={checked ? "currentColor" : "white"} fill-opacity={checked ? 0.15 : 1} />
      <circle cx="8.5" cy="9.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="9.5" r="1.2" fill="currentColor" stroke="none" />
      <path d={`M7.5 15.5Q12 ${(12.5 + 6 * t).toFixed(1)} 16.5 15.5`} stroke="currentColor" />
    </svg>
  );
};

const Mark = ({ style, level, levels, checked, chosen, hovered }: {
  style: Style; level: number; levels: number; checked: boolean; chosen: number | null; hovered: number | null;
}) => {
  switch (style) {
    case "stars":
      // a rating: every star up to the chosen one is filled; under the pointer, up to that one as a preview instead
      return hovered === null
        ? <Star filled={chosen !== null && level <= chosen} preview={false} />
        : <Star filled={false} preview={level <= hovered} />;
    case "smileys":
      return <Smiley level={level} levels={levels} checked={checked} />;
    case "buttons":
      return (
        <span aria-hidden="true"
          className={`flex size-8 items-center justify-center rounded-lg border-2 text-sm font-semibold tabular-nums transition-colors sm:size-10 ${focusRing}
            ${checked ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 bg-white text-slate-700 group-hover:border-sky-500 group-hover:bg-sky-50"}`}>
          {level}
        </span>
      );
    default:
      return (
        <span aria-hidden="true"
          className={`flex size-7 items-center justify-center rounded-full border-2 transition-colors sm:size-9 ${focusRing}
            ${checked ? "border-sky-600 bg-sky-600" : "border-slate-400 bg-white group-hover:border-sky-500 group-hover:bg-sky-50"}`}>
          <span className={`size-2.5 rounded-full bg-white sm:size-3 ${checked ? "" : "hidden"}`} />
        </span>
      );
  }
};

const Interaction = ({ id, prompt, settings, store, texts }: {
  id: string;
  prompt: string;
  settings: Settings;
  store: IStore<StateModel, Actions>;
  texts: Texts;
}) => {
  const { chosen } = useStore(store);
  const { levels, labelMin, labelMax, icons, numbers, style } = settings;
  const [hovered, setHovered] = useState<number | null>(null);
  const range = Array.from({ length: levels }, (_, i) => i + 1);

  const describe = (level: number) =>
    [texts.choice(level, levels), level === 1 && labelMin && texts.low(labelMin), level === levels && labelMax && texts.high(labelMax)]
      .filter(Boolean).join(", ");

  return (
    <fieldset className="m-0 inline-flex w-full max-w-2xl min-w-0 flex-col gap-3 border-0 p-0 font-sans text-slate-800" data-testid="likert">
      <legend className={prompt ? "mb-3 p-0 text-[15px] text-slate-700" : "sr-only"}>{prompt || texts.scale}</legend>
      <div className="grid grid-cols-2 items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_rgba(16,24,40,.06)] sm:flex sm:px-4">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:order-1 sm:max-w-[9rem] sm:shrink-0" aria-hidden="true">
          {labelMin && <span data-testid="label-min">{labelMin}</span>}
          {icons && <Thumb down title={texts.thumbDown} />}
        </div>
        <div className="flex items-center justify-end gap-2 text-right text-sm font-medium text-slate-700 sm:order-3 sm:max-w-[9rem] sm:shrink-0" aria-hidden="true">
          {icons && <Thumb title={texts.thumbUp} />}
          {labelMax && <span data-testid="label-max">{labelMax}</span>}
        </div>
        <ul onMouseLeave={() => setHovered(null)} className="col-span-2 m-0 flex min-w-0 flex-1 list-none items-end justify-between p-0 sm:order-2">
          {range.map((level) => {
            const checked = chosen === level;
            return (
              <li key={level} className="flex min-w-0 flex-1 justify-center">
                <label className="group flex min-h-11 w-full cursor-pointer flex-col items-center justify-end gap-1 rounded-lg py-1"
                  data-testid={`level-${level}`} data-selected={checked} onMouseEnter={() => setHovered(level)}>
                  {numbers && style !== "buttons" && <span className={`text-xs tabular-nums ${checked ? "font-semibold text-sky-700" : "text-slate-500"}`} aria-hidden="true">{level}</span>}
                  <input type="radio" name={`likert-${id}`} value={String(level)} className="peer sr-only" checked={checked}
                    aria-label={describe(level)}
                    onChange={() => store.dispatch({ type: "CHOOSE", payload: { level } })} />
                  <Mark style={style} level={level} levels={levels} checked={checked} chosen={chosen} hovered={hovered} />
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </fieldset>
  );
};

export default Interaction;
