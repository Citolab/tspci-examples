import { useRef, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import { Actions, StateModel } from "./store";
import { Direction, Refusal, Rules, Separator, Table, cellContext, cellId, inputCells, isHeader, localizeTyping, move, refusal } from "./table";
import { Texts } from "./texts";

// The candidate's view: the instruction and the table. Input cells are text fields that only take what the rules
// allow (a number: digits and one decimal separator, up to a number of characters); anything else is refused with a
// message next to the field, which a screen reader hears too. Tab, Enter and the arrow keys move between the fields.

const Interaction = ({ prompt, table, rules, separator, store, texts, readOnly, solution }: {
  prompt: string;
  table: Table;
  rules: Rules;
  separator: Separator;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  /** Review, closed or solution: the fields show their values but cannot be changed. */
  readOnly: boolean;
  /** Showing the correct response. */
  solution: boolean;
}) => {
  const { values } = useStore(store);
  const [message, setMessage] = useState<{ id: string; text: string; left: number; top: number } | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const fields = useRef(new Map<string, HTMLInputElement>());
  const inputs = inputCells(table);
  const order = new Map(inputs.map((c, i) => [c.id, i + 1]));
  const width = `${Math.max(3, rules.maxCharacters || 8) + 1.5}ch`;

  const go = (from: string, direction: Direction) => {
    const to = move(table, from, direction);
    const field = to && fields.current.get(to);
    if (!field) return false;
    field.focus();
    field.select();
    return true;
  };

  /** The message under the field, outside the table (its scroll box would cut it off). */
  const refuse = (id: string, field: HTMLInputElement, why: Refusal) => {
    const box = wrapper.current?.getBoundingClientRect();
    const at = field.getBoundingClientRect();
    setMessage({
      id, text: texts.refusal(why, rules.maxCharacters, rules.decimals),
      left: at.left - (box?.left ?? 0) + at.width / 2, top: at.bottom - (box?.top ?? 0),
    });
  };

  /** Typed or pasted text that would make the value wrong does not go in at all. */
  const onBeforeInput = (id: string, e: InputEvent) => {
    const field = e.target as HTMLInputElement;
    if (!e.inputType?.startsWith("insert") || e.data === null || e.data === undefined) return;
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    const why = refusal(localizeTyping(field.value.slice(0, start) + e.data + field.value.slice(end), rules, separator), rules);
    if (why) {
      e.preventDefault();
      refuse(id, field, why);
    }
  };

  const onInput = (id: string, field: HTMLInputElement) => {
    const before = values[id] ?? "";
    const typed = field.value;
    const value = localizeTyping(typed, rules, separator);
    const why = refusal(value, rules);
    if (why) {
      // what beforeinput did not catch (a drop, autocorrect): put back what was there, with the caret where it was
      const caret = Math.max(0, (field.selectionStart ?? typed.length) - (typed.length - before.length));
      field.value = before;
      field.setSelectionRange(caret, caret);
      refuse(id, field, why);
      return;
    }
    if (value !== typed) {
      const caret = field.selectionStart;
      field.value = value;
      field.setSelectionRange(caret, caret);
    }
    setMessage(null);
    if (value !== before) store.dispatch({ type: "SET_VALUE", payload: { id, value } });
  };

  const onKeyDown = (id: string, e: KeyboardEvent) => {
    const field = e.target as HTMLInputElement;
    const start = field.selectionStart ?? 0;
    const end = field.selectionEnd ?? 0;
    let direction: Direction | null = null;
    if (e.key === "Enter") direction = e.shiftKey ? "previous" : "next";
    else if (e.key === "ArrowUp") direction = "up";
    else if (e.key === "ArrowDown") direction = "down";
    else if (e.key === "ArrowLeft" && start === 0 && end === 0) direction = "left";
    else if (e.key === "ArrowRight" && start === field.value.length && end === field.value.length) direction = "right";
    else if (e.key === "Escape") setMessage(null);
    if (direction && go(id, direction)) e.preventDefault();
    else if (e.key === "Enter") e.preventDefault(); // no form to submit
  };

  const field = (id: string, row: number, column: number) => {
    const context = cellContext(table, row, column);
    const refused = message?.id === id;
    return (
      <input
          ref={(el) => { if (el) fields.current.set(id, el); else fields.current.delete(id); }}
          type="text"
          value={values[id] ?? ""}
          data-testid={id}
          inputMode={rules.mode === "number" ? (rules.decimals === 0 ? "numeric" : "decimal") : "text"}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellcheck={false}
          readOnly={readOnly}
          aria-label={texts.cell(context.row, context.column, order.get(id), inputs.length)}
          aria-describedby={refused ? "te-message" : "te-help"}
          aria-invalid={refused || undefined}
          style={{ width }}
          className={`block rounded-md border bg-white px-2 py-1.5 text-center text-[15px] tabular-nums text-slate-900 shadow-[inset_0_1px_2px_rgba(16,24,40,.06)] outline-none transition-colors
            focus-visible:border-sky-600 focus-visible:ring-3 focus-visible:ring-sky-600/30
            ${refused ? "border-amber-500 ring-3 ring-amber-400/30" : "border-slate-300 hover:border-slate-400"}
            ${solution ? "border-emerald-500 bg-emerald-50 text-emerald-900" : ""}
            ${readOnly ? "cursor-default" : ""}`}
          onBeforeInput={(e) => onBeforeInput(id, e as unknown as InputEvent)}
          onInput={(e) => onInput(id, e.target as HTMLInputElement)}
          onKeyDown={(e) => onKeyDown(id, e as unknown as KeyboardEvent)}
          onBlur={() => refused && setMessage(null)}
        />
    );
  };

  const cell = (rowIndex: number, columnIndex: number) => {
    const row = table.rows[rowIndex];
    const c = row.cells[columnIndex];
    const key = table.columns[columnIndex].id;
    if (isHeader(table, rowIndex, columnIndex)) {
      const top = table.headerRow && rowIndex === 0;
      return (
        <th key={key} scope={top ? "col" : "row"}
          className={`border border-slate-200 bg-slate-100 px-3 py-2 font-semibold text-slate-700 ${top ? "text-center" : "text-left whitespace-nowrap"}`}>
          {c.text}
        </th>
      );
    }
    if (c.kind === "input") {
      return (
        <td key={key} className="border border-slate-200 bg-sky-50/40 px-2 py-1.5">
          <div className="flex justify-center">{field(cellId(row, table.columns[columnIndex]), rowIndex, columnIndex)}</div>
        </td>
      );
    }
    return <td key={key} className="border border-slate-200 px-3 py-2 text-center tabular-nums">{c.text}</td>;
  };

  const head = table.headerRow ? table.rows.slice(0, 1) : [];
  const body = table.headerRow ? table.rows.slice(1) : table.rows;
  const offset = head.length;

  return (
    <div ref={wrapper} className="relative inline-flex max-w-full flex-col gap-3 font-sans text-slate-800">
      {prompt && <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-slate-700">{prompt}</p>}
      <div className="w-fit max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white p-0 shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_rgba(16,24,40,.06)]">
        <table className="-m-px border-collapse text-sm text-slate-800" aria-label={prompt || texts.table} data-testid="table">
          {head.length > 0 && (
            <thead>
              <tr>{head[0].cells.map((_, j) => cell(0, j))}</tr>
            </thead>
          )}
          <tbody>
            {body.map((row, i) => <tr key={row.id}>{row.cells.map((_, j) => cell(i + offset, j))}</tr>)}
          </tbody>
        </table>
      </div>
      {message && (
        <div aria-hidden="true" data-testid="message" style={{ left: `${message.left}px`, top: `${message.top}px` }}
          className="pointer-events-none absolute z-10 mt-2 w-max max-w-60 -translate-x-1/2 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg
            before:absolute before:-top-1 before:left-1/2 before:size-2 before:-translate-x-1/2 before:rotate-45 before:bg-slate-900">
          {message.text}
        </div>
      )}
      <p id="te-help" className="sr-only">{rules.mode === "number" ? texts.help : texts.helpText}</p>
      <p id="te-message" role="status" aria-live="polite" className="sr-only" data-testid="live">{message?.text ?? ""}</p>
    </div>
  );
};

export default Interaction;
