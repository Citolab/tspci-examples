// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/oat-sa/extension-tao-itemqti-pci/tree/develop/views/js/pciCreator/ims/mathEntryInteraction,
// © 2016-2022 Open Assessment Technologies SA (Christophe Noël)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useEffect, useRef, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import { Actions, StateModel } from "./store";
import { Settings, countGaps, gapExpressionToMathLive, gapId, normalizeLatex } from "./math";
import { MathfieldElement, createMathfield, keyboardLayouts } from "./mathlive";
import { Tool, ToolId, groups, tools } from "./tools";
import { Texts } from "./texts";

// The candidate types a formula in a MathLive field, or fills in the gaps of the author's expression. The toolbar
// holds the buttons the author enabled; the keyboard button opens MathLive's on-screen keyboard with the same tools.

/** The LaTeX of the field and of a gap ("latex": with braces around arguments, \frac{1}{2}, as MathQuill). */
export const latexOf = (mf: MathfieldElement) => normalizeLatex(mf.getValue("latex"));
export const gapValue = (mf: MathfieldElement, i: number) => normalizeLatex(mf.getPromptValue(gapId(i), "latex"));
export const gapValues = (mf: MathfieldElement, total: number) => Array.from({ length: total }, (_, i) => gapValue(mf, i));

/** The label of a toolbar button: text, or a drawing for the fraction and the matrices. */
export const ToolLabel = ({ tool }: { tool: Tool }) => {
  if (tool.id === "frac") {
    return (
      <span aria-hidden="true" className="inline-flex flex-col items-center text-[11px] leading-none">
        <span className="px-0.5">x</span>
        <span className="block h-px w-3 bg-current" />
        <span className="px-0.5">y</span>
      </span>
    );
  }
  if (tool.id === "matrix_2row" || tool.id === "matrix_2row_2col") {
    const columns = tool.id === "matrix_2row" ? 1 : 2;
    return (
      <span aria-hidden="true" className={`grid gap-0.5 ${columns === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
        {Array.from({ length: columns * 2 }, (_, i) => <span key={i} className="block size-1.5 rounded-[1px] bg-current opacity-70" />)}
      </span>
    );
  }
  return <span aria-hidden="true" className={tool.label.length > 2 ? "text-[13px]" : "text-base"}>{tool.label}</span>;
};

/**
 * The toolbar: one tab stop, the arrow keys (and Home, End) move between the buttons. A button does not take the
 * focus from the formula when clicked, so the cursor stays where it was.
 */
export const Toolbar = ({ enabled, texts, onTool, controls }: {
  enabled: ToolId[];
  texts: Texts;
  onTool: (tool: Tool) => void;
  controls?: string;
}) => {
  const [current, setCurrent] = useState(0);
  const refs = useRef<HTMLButtonElement[]>([]);
  if (!enabled.length) return null;
  const order = groups.flatMap((g) => g.tools.filter((id) => enabled.includes(id)));
  const focus = (i: number) => {
    const next = (i + order.length) % order.length;
    setCurrent(next);
    refs.current[next]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const index = order.indexOf((e.target as HTMLElement).dataset.tool as ToolId);
    if (index < 0) return;
    const move = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: order.length - 1 }[e.key];
    if (move === undefined) return;
    e.preventDefault();
    focus(move);
  };
  return (
    <div role="toolbar" aria-label={texts.toolbar} aria-controls={controls} onKeyDown={onKeyDown}
      className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1.5">
      {groups.map((group) => {
        const ids = group.tools.filter((id) => enabled.includes(id));
        if (!ids.length) return null;
        return (
          <div key={group.id} role="group" aria-label={texts.groups[group.id]} className="flex flex-wrap gap-1">
            {ids.map((id) => {
              const i = order.indexOf(id);
              return (
                <button key={id} type="button" data-tool={id} data-testid={`tool-${id}`}
                  ref={(el) => { refs.current[i] = el; }}
                  tabIndex={i === current ? 0 : -1}
                  aria-label={texts.tools[id]} title={texts.tools[id]}
                  onMouseDown={(e) => e.preventDefault()}
                  onFocus={() => setCurrent(i)}
                  onClick={() => onTool(tools[id])}
                  className="inline-flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-md border border-slate-300 bg-white px-2 font-serif text-slate-800 shadow-[0_1px_0_rgba(16,24,40,.05)] hover:border-sky-500 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 active:bg-sky-100">
                  <ToolLabel tool={tools[id]} />
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

/** The keyboard button: shows and hides MathLive's on-screen keyboard for the field. */
export const KeyboardButton = ({ texts, open, onToggle }: { texts: Texts; open: boolean; onToggle: () => void }) => (
  <button type="button" aria-pressed={open} title={open ? texts.hideKeyboard : texts.showKeyboard}
    aria-label={open ? texts.hideKeyboard : texts.showKeyboard} data-testid="keyboard"
    onMouseDown={(e) => e.preventDefault()} onClick={onToggle}
    className={`inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${open
      ? "border-sky-600 bg-sky-50 text-sky-800"
      : "border-slate-300 bg-white text-slate-700 hover:border-sky-500 hover:bg-sky-50"}`}>
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" stroke-width="1.6">
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 9.5h1M9.5 9.5h1M13 9.5h1M16.5 9.5h1M6 12.5h1M9.5 12.5h1M13 12.5h1M16.5 12.5h1M8 15.5h8" stroke-linecap="round" />
    </svg>
    <span>{texts.keyboard}</span>
  </button>
);

/** Insert a tool's LaTeX where the cursor is; in a gap when the field shows an expression with gaps. */
export const insertTool = (mf: MathfieldElement, tool: Tool, gapTotal = 0, activeGap = 0) => {
  if (gapTotal > 0) {
    const inGap = Array.from({ length: gapTotal }, (_, i) => mf.getPromptRange(gapId(i)))
      .some((range) => range && mf.position >= range[0] && mf.position <= range[1]);
    if (!inGap) {
      const range = mf.getPromptRange(gapId(activeGap));
      if (range) mf.position = range[1];
    }
  }
  mf.insert(tool.insert, { selectionMode: "placeholder", focus: true, feedback: false, format: "latex" });
  // MathLive selects the first empty slot, which shows no caret; put the caret in it instead (typing still fills it,
  // createMathfield draws the caret inside the slot)
  const [start, end] = mf.selection.ranges[0];
  if (end - start === 1 && mf.getValue(start, end, "latex") === "\\placeholder{}") mf.position = end;
  mf.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
};

/** Show the on-screen keyboard with the tools of this field; it belongs to whichever field has the focus. */
export const useKeyboard = (field: () => MathfieldElement | undefined, enabled: ToolId[], texts: Texts) => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const keyboard = window.mathVirtualKeyboard;
    if (!keyboard) return;
    const update = () => setOpen(!!keyboard.visible && document.activeElement !== null && field()?.hasFocus?.());
    keyboard.addEventListener("virtual-keyboard-toggle", update);
    return () => keyboard.removeEventListener("virtual-keyboard-toggle", update);
  }, []);
  const layouts = () => {
    if (window.mathVirtualKeyboard) window.mathVirtualKeyboard.layouts = keyboardLayouts(enabled, texts);
  };
  const toggle = () => {
    const mf = field();
    const keyboard = window.mathVirtualKeyboard;
    if (!mf || !keyboard) return;
    if (open) {
      keyboard.hide();
      setOpen(false);
    } else {
      mf.focus();
      layouts();
      keyboard.show({ animate: true });
      setOpen(true);
    }
  };
  return { open, toggle, layouts, close: () => setOpen(false) };
};

const Interaction = ({ settings, store, texts, readOnly, uid }: {
  settings: Settings;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  readOnly: boolean;
  uid: string;
}) => {
  const state = useStore(store);
  const host = useRef<HTMLDivElement>(null);
  const field = useRef<MathfieldElement>();
  const activeGap = useRef(0);
  const syncing = useRef(false);
  const gapMode = settings.gapMode;
  const gapTotal = gapMode ? countGaps(settings.gapExpression) : 0;
  const keyboard = useKeyboard(() => field.current, settings.tools, texts);
  const fieldId = `${uid}-field`;

  // the field itself, made again when the settings change (in an authoring system)
  useEffect(() => {
    const mf = createMathfield(host.current, { whiteSpace: settings.whiteSpace, label: gapMode ? texts.gapField : texts.field, id: fieldId });
    if (settings.prompt) mf.setAttribute("aria-describedby", `${uid}-prompt`);
    field.current = mf;
    const { latex, gaps } = store.getState();
    if (gapMode) {
      mf.readOnly = true; // only the gaps are editable
      mf.value = gapExpressionToMathLive(settings.gapExpression);
      for (let i = 0; i < gapTotal; i++) {
        if (gaps[i]) mf.setPromptValue(gapId(i), gaps[i], { silenceNotifications: true });
        if (readOnly) mf.setPromptState(gapId(i), "undefined", true);
      }
    } else {
      mf.setValue(latex ?? "", { silenceNotifications: true });
      mf.readOnly = readOnly;
    }
    const onInput = () => {
      if (syncing.current || readOnly) return;
      if (gapMode) store.dispatch({ type: "SET_GAPS", payload: { gaps: gapValues(mf, gapTotal) } });
      else store.dispatch({ type: "SET_LATEX", payload: { latex: latexOf(mf) } });
    };
    const onSelection = () => {
      if (!gapMode) return;
      for (let i = 0; i < gapTotal; i++) {
        const range = mf.getPromptRange(gapId(i));
        if (range && mf.position >= range[0] && mf.position <= range[1]) activeGap.current = i;
      }
    };
    mf.addEventListener("input", onInput);
    mf.addEventListener("selection-change", onSelection);
    mf.addEventListener("focusin", keyboard.layouts);
    return () => {
      mf.removeEventListener("input", onInput);
      mf.removeEventListener("selection-change", onSelection);
      mf.removeEventListener("focusin", keyboard.layouts);
      mf.remove();
      field.current = undefined;
    };
  }, [settings, readOnly, texts]);

  // a response set from outside (setResponse, resetResponse, the correct response): into the field
  useEffect(() => {
    const mf = field.current;
    if (!mf) return;
    syncing.current = true;
    try {
      if (gapMode) {
        for (let i = 0; i < gapTotal; i++) {
          const value = state.gaps[i] ?? "";
          if (gapValue(mf, i) !== value) {
            mf.setPromptValue(gapId(i), value, { silenceNotifications: true });
          }
        }
      } else if (latexOf(mf) !== (state.latex ?? "")) {
        mf.setValue(state.latex ?? "", { silenceNotifications: true });
      }
    } finally {
      syncing.current = false;
    }
  }, [state]);

  const onTool = (tool: Tool) => field.current && insertTool(field.current, tool, gapTotal, activeGap.current);
  const sizeClass = { "math-gap-small": "gap-small", "math-gap-medium": "gap-medium", "math-gap-large": "gap-large" }[settings.gapSize];

  return (
    <div className="flex max-w-full flex-col gap-3 font-sans text-slate-800" data-gap-size={gapMode ? sizeClass : undefined}>
      {settings.prompt && <p className="m-0 text-[15px] text-slate-700" id={`${uid}-prompt`}>{settings.prompt}</p>}
      <div className="flex max-w-full flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_rgba(16,24,40,.06)]">
        {!readOnly && (
          <div className="flex items-start justify-between gap-3">
            <Toolbar enabled={settings.tools} texts={texts} onTool={onTool} controls={fieldId} />
            <KeyboardButton texts={texts} open={keyboard.open} onToggle={keyboard.toggle} />
          </div>
        )}
        <div ref={host} className={`math-host ${readOnly ? "read-only" : ""}`} />
        {gapMode && gapTotal === 0 && <p className="m-0 text-sm text-amber-700" role="note">{texts.noGaps}</p>}
      </div>
    </div>
  );
};

export default Interaction;
