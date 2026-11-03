// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/oat-sa/extension-tao-itemqti-pci/tree/develop/views/js/pciCreator/ims/mathEntryInteraction,
// © 2016-2022 Open Assessment Technologies SA (Christophe Noël)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useEffect, useRef, useState } from "preact/hooks";
import { Settings, countGaps } from "./math";
import { MathfieldElement, createMathfield } from "./mathlive";
import { KeyboardButton, Toolbar, insertTool, latexOf, useKeyboard } from "./interaction";
import { textsFor } from "./texts";

// Authoring mode, like the original's "Question" state in TAO: the author types the expression the candidate completes
// and inserts gaps with a button. getProperties() gives data-gap-expression, with \taoGap for every gap, as the original.

/** \taoGap and \taoBr are shown as a box and a return sign, and stay \taoGap and \taoBr in the LaTeX. */
const macros = {
  taoGap: { def: "\\boxed{\\phantom{0}\\,?\\,\\phantom{0}}", args: 0, captureSelection: true, expand: false },
  taoBr: { def: "\\textcolor{#94a3b8}{\\hookleftarrow}", args: 0, captureSelection: true, expand: false },
};

export const authoringProblems = (expression: string, language: string) =>
  countGaps(expression) > 0 ? [] : [textsFor(language).needsGap];

const Authoring = ({ initial, settings, language, onChange }: {
  initial: string;
  settings: Settings;
  language: string;
  onChange: (expression: string) => void;
}) => {
  const texts = textsFor(language);
  const host = useRef<HTMLDivElement>(null);
  const field = useRef<MathfieldElement>();
  const [expression, setExpression] = useState(initial);
  const keyboard = useKeyboard(() => field.current, settings.tools, texts);

  useEffect(() => {
    const mf = createMathfield(host.current, { whiteSpace: settings.whiteSpace, label: texts.authoringTitle, id: "gap-expression" });
    mf.macros = { ...mf.macros, ...macros } as any;
    mf.setAttribute("aria-describedby", "authoring-hint");
    mf.setValue(initial, { silenceNotifications: true });
    field.current = mf;
    const onInput = () => {
      const next = latexOf(mf);
      setExpression(next);
      onChange(next);
    };
    mf.addEventListener("input", onInput);
    mf.addEventListener("focusin", keyboard.layouts);
    return () => {
      mf.removeEventListener("input", onInput);
      mf.removeEventListener("focusin", keyboard.layouts);
      mf.remove();
    };
  }, []);

  const insertGap = () => {
    const mf = field.current;
    if (!mf) return;
    mf.insert("\\taoGap", { focus: true, format: "latex" });
    mf.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  };
  const gaps = countGaps(expression);

  return (
    <div className="flex flex-col gap-3 p-4 font-sans text-slate-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-base font-semibold">{texts.authoringTitle}</h2>
        <span className="text-sm text-slate-600" aria-live="polite" data-testid="gap-count">{texts.gapCount(gaps)}</span>
      </div>
      <p id="authoring-hint" className="m-0 text-sm text-slate-600">{texts.authoringHint}</p>
      {!settings.gapMode && <p className="m-0 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800" role="note">{texts.gapModeOff}</p>}
      <div className="flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_rgba(16,24,40,.06)]">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-start gap-3">
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={insertGap} data-testid="insert-gap"
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-sky-700 bg-sky-700 px-3 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
              <span aria-hidden="true" className="inline-block h-4 w-5 rounded-sm border-2 border-current" />
              {texts.insertGap}
            </button>
            <Toolbar enabled={settings.tools} texts={texts} controls="gap-expression"
              onTool={(tool) => field.current && insertTool(field.current, tool)} />
          </div>
          <KeyboardButton texts={texts} open={keyboard.open} onToggle={keyboard.toggle} />
        </div>
        <div ref={host} className="math-host" />
      </div>
    </div>
  );
};

export default Authoring;
