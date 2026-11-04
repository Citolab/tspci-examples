import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { Locale, Value, canonical, columnName, display, evaluateSheet, functionNames, localize, parseRef, refName, shift } from "./formula";
import { Sheet, WIDTH } from "./sheet";
import { Texts } from "./texts";

// The spreadsheet itself, for the candidate (interaction.tsx) and the author (authoring.tsx). Like Excel: select a cell
// and type to replace it, F2 or a double click to edit it, Enter, Tab and the arrow keys to move; while typing a formula
// a click on a cell inserts its name; the square at the corner fills down or to the right; Ctrl+C/V and Ctrl+Z/Y.
// The table has the focus and points at the selected cell (aria-activedescendant), so a screen reader follows it.

type Editing = {
  ref: string;
  text: string;
  /** Typing replaced the cell: the arrow keys finish it, as in Excel. */
  entered: boolean;
  /** In the formula bar, not in the cell. */
  inBar: boolean;
};
type Change = Record<string, string>;

const EXCEL = "#217346";
const ROW_HEADER = 44;
const ARROWS: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
/** While typing a formula, after = ( + - * / ^ & < > , ; : a click on a cell inserts its name. */
const pointable = (text: string, caret: number) => text.startsWith("=") && /[=(+\-*/^&<>,;:]\s*$/.test(text.slice(0, caret));

const Grid = ({ sheet, inputs, locale, texts, selected, onSelect, editable, onChange, answer, showFormulaBar, label, author }: {
  sheet: Sheet;
  /** Canonical inputs by A1 name. */
  inputs: Record<string, string>;
  locale: Locale;
  texts: Texts;
  selected: string;
  onSelect: (ref: string) => void;
  /** Can this cell be changed? Not a locked one for the candidate. */
  editable: (ref: string) => boolean;
  /** Canonical inputs; "" empties a cell. */
  onChange: (changes: Change) => void;
  /** The answer cell to mark, or null. */
  answer: string | null;
  showFormulaBar: boolean;
  label: string;
  /** The authoring mode: locked cells show it, and columns can be resized. */
  author?: { onResize: (col: number, width: number) => void };
}) => {
  const table = useRef<HTMLTableElement>();
  const scroller = useRef<HTMLDivElement>();
  const cellInput = useRef<HTMLInputElement>();
  const bar = useRef<HTMLInputElement>();
  const [editing, setEditingState] = useState<Editing | null>(null);
  const editingRef = useRef<Editing | null>(null); // the handlers of one event see what the one before did
  const setEditing = (e: Editing | null) => {
    editingRef.current = e;
    setEditingState(e);
  };
  const [fill, setFill] = useState<{ to: string } | null>(null);
  const [resize, setResize] = useState<{ col: number; x: number; from: number; width: number } | null>(null);
  const [message, setMessage] = useState("");
  const [help, setHelp] = useState(false);
  const history = useRef<{ undo: { before: Change; after: Change }[]; redo: { before: Change; after: Change }[] }>({ undo: [], redo: [] });
  const clip = useRef<{ ref: string; input: string; text: string } | null>(null);
  /** The name a click inserted in the formula: the next click replaces it. */
  const pointed = useRef<{ start: number; end: number } | null>(null);
  const caret = useRef<number | null>(null);

  const values = useMemo(() => evaluateSheet(inputs, sheet, locale), [inputs, sheet.columns, sheet.rows, locale]);
  const at = parseRef(selected) ?? { row: 0, col: 0 };
  const pos = { row: Math.min(at.row, sheet.rows - 1), col: Math.min(at.col, sheet.columns - 1) };
  const current = refName(pos.row, pos.col);
  const widths = sheet.widths.map((w, i) => (resize?.col === i ? resize.width : w));

  useEffect(() => {
    if (current !== selected) onSelect(current); // the sheet got smaller
  }, [current, selected]);
  // the selected cell in view: only the sheet scrolls (scrollIntoView would move the item's page too)
  useEffect(() => {
    const box = scroller.current;
    const cell = table.current?.querySelector<HTMLElement>(`#cell-${current}`);
    if (!box || !cell) return;
    const header = table.current.tHead?.offsetHeight ?? 0;
    if (cell.offsetTop - header < box.scrollTop) box.scrollTop = cell.offsetTop - header;
    else if (cell.offsetTop + cell.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = cell.offsetTop + cell.offsetHeight - box.clientHeight;
    if (cell.offsetLeft - ROW_HEADER < box.scrollLeft) box.scrollLeft = cell.offsetLeft - ROW_HEADER;
    else if (cell.offsetLeft + cell.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollLeft = cell.offsetLeft + cell.offsetWidth - box.clientWidth;
  }, [current]);
  // before the next key arrives, so that it goes to the input
  useLayoutEffect(() => {
    const input = editing?.inBar ? bar.current : cellInput.current;
    if (!editing || !input) return;
    if ((input.getRootNode() as Document | ShadowRoot).activeElement !== input) input.focus();
    if (caret.current !== null) {
      input.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [editing]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  const focusGrid = () => table.current?.focus({ preventScroll: true });

  /** Changes cells (only the ones that change), with an undo step. */
  const apply = (changes: Change) => {
    const after: Change = {};
    const before: Change = {};
    for (const [ref, input] of Object.entries(changes)) {
      if ((inputs[ref] ?? "") === input) continue;
      after[ref] = input;
      before[ref] = inputs[ref] ?? "";
    }
    if (!Object.keys(after).length) return;
    history.current.undo.push({ before, after });
    history.current.redo = [];
    onChange(after);
  };
  const undo = (redo = false) => {
    const step = (redo ? history.current.redo : history.current.undo).pop();
    if (!step) return;
    (redo ? history.current.undo : history.current.redo).push(step);
    onChange(redo ? step.after : step.before);
  };

  const select = (row: number, col: number) => {
    onSelect(refName(Math.min(sheet.rows - 1, Math.max(0, row)), Math.min(sheet.columns - 1, Math.max(0, col))));
  };
  const move = (dr: number, dc: number) => select(pos.row + dr, pos.col + dc);

  const startEdit = (ref: string, text: string, entered: boolean, inBar = false) => {
    if (!editable(ref)) {
      setMessage(texts.locked);
      return false;
    }
    pointed.current = null;
    if (!inBar) caret.current = text.length;
    setEditing({ ref, text, entered, inBar });
    return true;
  };
  const commit = () => {
    const edit = editingRef.current;
    if (!edit) return;
    setEditing(null);
    apply({ [edit.ref]: canonical(edit.text, locale) });
    focusGrid();
  };
  const cancel = () => {
    setEditing(null);
    focusGrid();
  };

  /** While typing a formula: insert (or replace) the name of the clicked cell. */
  const point = (ref: string) => {
    const edit = editingRef.current;
    const input = edit.inBar ? bar.current : cellInput.current;
    const c = input?.selectionStart ?? edit.text.length;
    const p = pointed.current;
    let start: number;
    let end: number;
    if (p && p.end === c) [start, end] = [p.start, p.end];
    else if (pointable(edit.text, c)) [start, end] = [c, c];
    else return false;
    pointed.current = { start, end: start + ref.length };
    caret.current = start + ref.length;
    setEditing({ ...edit, text: edit.text.slice(0, start) + ref + edit.text.slice(end) });
    return true;
  };

  const editKeys = (e: KeyboardEvent) => {
    const edit = editingRef.current;
    if (!edit) return;
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
      move(e.shiftKey ? -1 : 1, 0);
    } else if (e.key === "Tab") {
      e.preventDefault();
      commit();
      move(0, e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (edit.entered && !edit.inBar && ARROWS[e.key]) {
      e.preventDefault();
      commit();
      move(...ARROWS[e.key]);
    }
  };

  const gridKeys = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    const edit = editingRef.current;
    if (edit) {
      // typed before the cell's input has the focus: it is still for the cell
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        caret.current = edit.text.length + 1;
        setEditing({ ...edit, text: edit.text + e.key });
      } else editKeys(e);
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && (key === "z" || key === "y")) {
      e.preventDefault();
      undo(key === "y" || e.shiftKey);
    } else if (mod) {
      if (ARROWS[e.key]) {
        e.preventDefault();
        const [dr, dc] = ARROWS[e.key];
        select(dr ? (dr < 0 ? 0 : sheet.rows - 1) : pos.row, dc ? (dc < 0 ? 0 : sheet.columns - 1) : pos.col);
      } else if (e.key === "Home") {
        e.preventDefault();
        select(0, 0);
      }
      // Ctrl+C, X and V: the copy, cut and paste events
    } else if (ARROWS[e.key]) {
      e.preventDefault();
      move(...ARROWS[e.key]);
    } else if (e.key === "Tab") {
      // the last cell lets Tab leave the sheet
      const last = e.shiftKey ? pos.col === 0 : pos.col === sheet.columns - 1;
      if (!last) {
        e.preventDefault();
        move(0, e.shiftKey ? -1 : 1);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      move(e.shiftKey ? -1 : 1, 0);
    } else if (e.key === "Home") {
      e.preventDefault();
      select(pos.row, 0);
    } else if (e.key === "End") {
      e.preventDefault();
      select(pos.row, sheet.columns - 1);
    } else if (e.key === "F2") {
      e.preventDefault();
      startEdit(current, localize(inputs[current] ?? "", locale), false);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (editable(current)) apply({ [current]: "" });
      else setMessage(texts.locked);
    } else if (e.key.length === 1 && !e.altKey) {
      e.preventDefault();
      startEdit(current, e.key, true);
    }
  };

  // --- copy and paste: a cell copied here pastes as Excel does (its references move along); text from elsewhere,
  // also cells from a spreadsheet (tabs and new lines), is typed in from the selected cell on
  const onCopy = (e: ClipboardEvent, cut = false) => {
    if (editingRef.current) return;
    e.preventDefault();
    const input = inputs[current] ?? "";
    clip.current = { ref: current, input, text: localize(input, locale) };
    e.clipboardData?.setData("text/plain", clip.current.text);
    if (!cut) return;
    if (editable(current)) apply({ [current]: "" });
    else setMessage(texts.locked);
  };
  const onPaste = (e: ClipboardEvent) => {
    if (editingRef.current) return;
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") ?? "";
    const changes: Change = {};
    let skipped = false;
    const put = (row: number, col: number, input: string) => {
      if (row >= sheet.rows || col >= sheet.columns) return;
      const ref = refName(row, col);
      if (editable(ref)) changes[ref] = input;
      else skipped = true;
    };
    if (clip.current && text.replace(/\r?\n$/, "") === clip.current.text) {
      const from = parseRef(clip.current.ref);
      put(pos.row, pos.col, shift(clip.current.input, pos.row - from.row, pos.col - from.col));
    } else {
      const grid = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
      grid.forEach((line, i) => line.forEach((value, j) => put(pos.row + i, pos.col + j, canonical(value.trim(), locale))));
    }
    apply(changes);
    if (skipped) setMessage(Object.keys(changes).length ? texts.skipped : texts.locked);
  };

  // --- the fill handle: copies the selected cell down or to the right (one direction, the one dragged furthest)
  const fillRange = (to: string): string[] => {
    const t = parseRef(to);
    const vertical = Math.abs(t.row - pos.row) >= Math.abs(t.col - pos.col);
    const [a, b] = vertical ? [pos.row, t.row] : [pos.col, t.col];
    return Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => {
      const n = Math.min(a, b) + i;
      return vertical ? refName(n, pos.col) : refName(pos.row, n);
    });
  };
  useEffect(() => {
    if (!fill) return;
    const done = () => {
      setFill(null);
      const source = inputs[current] ?? "";
      const changes: Change = {};
      let skipped = false;
      for (const ref of fillRange(fill.to)) {
        if (ref === current) continue;
        const p = parseRef(ref);
        if (editable(ref)) changes[ref] = shift(source, p.row - pos.row, p.col - pos.col);
        else skipped = true;
      }
      apply(changes);
      if (skipped) setMessage(texts.skipped);
      focusGrid();
    };
    const cancel = () => setFill(null); // a touch that turned into a scroll: no fill
    window.addEventListener("pointerup", done);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointerup", done);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [fill, inputs, current]);
  const filling = useMemo(() => new Set(fill ? fillRange(fill.to) : []), [fill, current]);

  const cellDown = (ref: string, e: MouseEvent) => {
    if (e.button !== 0) return;
    const edit = editingRef.current;
    if (edit && ref !== edit.ref && point(ref)) {
      e.preventDefault(); // the formula keeps the focus
      return;
    }
    if (edit && ref === edit.ref && !edit.inBar) return; // a click in the cell being edited
    if (edit) commit();
    e.preventDefault();
    onSelect(ref);
    focusGrid();
  };

  const align = (v: Value) =>
    typeof v === "number" ? "text-right" : typeof v === "boolean" || (v !== null && typeof v === "object") ? "text-center" : "text-left";
  const barText = editing ? editing.text : localize(inputs[current] ?? "", locale);
  const shown = (ref: string) => display(values.get(ref) ?? null, locale);
  const describe = (ref: string) => {
    const input = inputs[ref] ?? "";
    return [
      `${ref}: ${shown(ref)}`,
      input.startsWith("=") && `${texts.formula} ${localize(input, locale)}`,
      ref === answer && texts.answerCell,
      sheet.cells[ref]?.locked && texts.lockedCell,
    ].filter(Boolean).join(", ");
  };
  const status = message || (current === answer && !author ? texts.answerHere : "");
  const iconButton = "grid size-7 place-items-center rounded text-slate-600 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="flex max-w-full flex-col overflow-hidden rounded-lg border border-slate-300 bg-white text-[13px] text-slate-900 shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_rgba(16,24,40,.06)]">
      {showFormulaBar && (
        <div className="flex items-center gap-1 border-b border-slate-300 bg-slate-50 px-1.5 py-1">
          <button type="button" className={iconButton} title={texts.undo} aria-label={texts.undo} onClick={() => undo()} data-testid="undo">↶</button>
          <button type="button" className={iconButton} title={texts.redo} aria-label={texts.redo} onClick={() => undo(true)} data-testid="redo">↷</button>
          <output className="ml-1 w-14 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-center font-medium" aria-label={texts.cell} data-testid="name-box">{current}</output>
          <span className="px-1.5 font-serif text-slate-500 italic" aria-hidden="true">fx</span>
          <input ref={bar} type="text" className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-0.5 font-mono text-[13px] outline-none focus:border-[#217346] read-only:bg-slate-50 read-only:text-slate-500"
            aria-label={`${texts.contents} ${current}`} value={barText} readOnly={!editable(current)} data-testid="formula-bar" spellcheck={false}
            onFocus={() => {
              const edit = editingRef.current;
              if (edit) setEditing({ ...edit, inBar: true });
              else if (editable(current)) startEdit(current, barText, false, true);
            }}
            onInput={(e) => {
              pointed.current = null;
              const edit = editingRef.current;
              if (edit) setEditing({ ...edit, text: (e.target as HTMLInputElement).value, inBar: true });
            }}
            onKeyDown={editKeys}
            onBlur={(e) => e.relatedTarget !== cellInput.current && editingRef.current?.inBar && commit()} />
          <button type="button" className={`${iconButton} ml-1 w-auto px-2 text-xs`} aria-expanded={help} onClick={() => setHelp(!help)} data-testid="help">{texts.showHelp}</button>
        </div>
      )}
      {help && <p className="m-0 border-b border-slate-200 bg-sky-50 px-3 py-2 text-xs text-slate-700">{texts.help(functionNames(locale))}</p>}

      <div ref={scroller} className="max-h-[32rem] overflow-auto">
        <table ref={table} role="grid" aria-label={label} tabIndex={0} aria-activedescendant={`cell-${current}`} data-testid="grid"
          className="table-fixed border-separate border-spacing-0 outline-none select-none"
          style={{ width: ROW_HEADER + widths.reduce((a, b) => a + b, 0) }}
          onKeyDown={gridKeys} onCopy={onCopy} onPaste={onPaste} onCut={(e) => onCopy(e, true)}>
          <colgroup>
            <col style={{ width: ROW_HEADER }} />
            {widths.map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 border-r border-b border-slate-300 bg-slate-100" aria-hidden="true" />
              {widths.map((_, c) => (
                <th key={c} scope="col" className={`relative sticky top-0 z-20 h-6 border-r border-b border-slate-300 font-normal ${c === pos.col ? "bg-emerald-100 text-emerald-900 shadow-[inset_0_-2px_0_#217346]" : "bg-slate-100 text-slate-600"}`}>
                  {columnName(c)}
                  {author && (
                    <span className="absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize" data-testid={`resize-${c}`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        setResize({ col: c, x: e.clientX, from: widths[c], width: widths[c] });
                      }}
                      onPointerMove={(e) => resize?.col === c &&
                        setResize({ ...resize, width: Math.min(WIDTH.max, Math.max(WIDTH.min, Math.round(resize.from + e.clientX - resize.x))) })}
                      onPointerUp={() => {
                        if (resize?.col === c && resize.width !== resize.from) author.onResize(c, resize.width);
                        setResize(null);
                      }}
                      onPointerCancel={() => setResize(null)} />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: sheet.rows }, (_, r) => (
              <tr key={r}>
                <th scope="row" className={`sticky left-0 z-10 h-7 border-r border-b border-slate-300 text-center font-normal ${r === pos.row ? "bg-emerald-100 text-emerald-900 shadow-[inset_-2px_0_0_#217346]" : "bg-slate-100 text-slate-600"}`}>
                  {r + 1}
                </th>
                {widths.map((_, c) => {
                  const ref = refName(r, c);
                  const def = sheet.cells[ref];
                  const value = values.get(ref) ?? null;
                  const isSelected = ref === current;
                  const isEditing = editing?.ref === ref;
                  const error = value !== null && typeof value === "object";
                  return (
                    <td key={ref} id={`cell-${ref}`} role="gridcell" aria-selected={isSelected} aria-readonly={def?.locked || undefined}
                      aria-label={describe(ref)} data-testid={ref}
                      className={`relative h-7 border-r border-b border-slate-200 p-0 ${ref === answer ? "bg-amber-50 shadow-[inset_0_0_0_2px_#f59e0b]" : def?.fill ? "" : def?.locked ? (author ? "bg-slate-100" : "bg-slate-50") : "bg-white"}`}
                      style={ref !== answer && def?.fill ? { background: def.fill } : undefined}
                      onMouseDown={(e) => cellDown(ref, e)}
                      onDblClick={() => startEdit(ref, localize(inputs[ref] ?? "", locale), false)}
                      onPointerEnter={() => fill && setFill({ to: ref })}>
                      {isEditing && !editing.inBar ? (
                        <input ref={cellInput} type="text" value={editing.text} spellcheck={false} data-testid="cell-input"
                          className="absolute inset-0 z-10 w-full min-w-full border-2 border-[#217346] bg-white px-1 font-mono text-[13px] outline-none select-text"
                          aria-label={`${texts.contents} ${ref}`}
                          onInput={(e) => {
                            pointed.current = null;
                            setEditing({ ...editingRef.current, text: (e.target as HTMLInputElement).value });
                          }}
                          onKeyDown={editKeys}
                          onBlur={(e) => e.relatedTarget !== bar.current && editingRef.current?.ref === ref && !editingRef.current.inBar && commit()} />
                      ) : (
                        <span className={`block overflow-hidden px-1.5 leading-7 text-ellipsis whitespace-nowrap ${align(value)} ${def?.bold ? "font-semibold" : ""} ${error ? "text-red-700" : ""}`}>
                          {isEditing ? editing.text : shown(ref)}
                        </span>
                      )}
                      {author && def?.locked && (
                        <span className="pointer-events-none absolute top-0 left-0 size-0 border-t-[7px] border-r-[7px] border-t-slate-400 border-r-transparent" aria-hidden="true" data-testid="locked-mark" />
                      )}
                      {filling.has(ref) && <span className="pointer-events-none absolute inset-0 z-[5] border-2 border-dashed border-slate-500" />}
                      {isSelected && !isEditing && (
                        <>
                          <span className="pointer-events-none absolute -inset-px z-[6] border-2" style={{ borderColor: EXCEL }} />
                          <span className="absolute -right-1 -bottom-1 z-[7] size-2 cursor-crosshair touch-none border border-white" style={{ background: EXCEL }}
                            data-testid="fill-handle"
                            onMouseDown={(e) => e.stopPropagation()}
                            onPointerDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setFill({ to: ref });
                            }} />
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 min-h-6 border-t border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600" aria-live="polite" data-testid="status">{status}</p>
    </div>
  );
};

export default Grid;
