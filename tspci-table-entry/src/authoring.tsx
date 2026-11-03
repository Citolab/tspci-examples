import { useState } from "preact/hooks";
import {
  DEFAULT_TABLE, Rules, Table, addColumn, addRow, inputCells, isHeader, pasteGrid, removeColumn, removeRow, tableProblems, updateCell,
} from "./table";
import { textsFor } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance): build the table, and per cell a given text or an input with
// its expected value and margin. The result is data-table (table.ts).

/** What keeps the table from being used (getAuthoringInstance validate()). */
export const authoringProblems = (table: Table, rules: Rules, language: string) => tableProblems(table, rules).map(textsFor(language).problem);

const button = "rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-sky-600";
const icon = "grid size-7 place-items-center rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-sky-600";
const field = "rounded-md border border-slate-300 bg-white px-2 py-1 focus-visible:border-sky-600 focus-visible:outline-2 focus-visible:outline-sky-600/40";
const text = `${field} w-full`;

const Authoring = ({ initial, rules, language, onChange }: {
  initial: Table;
  rules: Rules;
  language: string;
  onChange: (table: Table) => void;
}) => {
  const t = textsFor(language);
  const [table, setTable] = useState<Table>(initial);
  const commit = (next: Table) => {
    setTable(next);
    onChange(next);
  };
  const problems = authoringProblems(table, rules, language);

  /** Cells copied from a spreadsheet are spread over the table; one value the field pastes itself. */
  const onPaste = (row: number, column: number) => (e: ClipboardEvent) => {
    const pasted = e.clipboardData?.getData("text/plain") ?? "";
    if (!/[\t\n]/.test(pasted.replace(/\r?\n$/, ""))) return;
    e.preventDefault();
    commit(pasteGrid(table, pasted, row, column));
  };

  const editor = (row: number, column: number) => {
    const cell = table.rows[row].cells[column];
    const r = row + 1;
    const c = column + 1;
    const testid = `${row}-${column}`;
    if (isHeader(table, row, column)) {
      return (
        <input type="text" value={cell.text} aria-label={t.givenLabel(r, c)} data-testid={`given-${testid}`}
          className={`${text} min-w-28 bg-slate-100 font-semibold`} onPaste={onPaste(row, column)}
          onInput={(e) => commit(updateCell(table, row, column, { text: (e.target as HTMLInputElement).value }))} />
      );
    }
    const isInput = cell.kind === "input";
    return (
      <div className={`flex min-w-40 flex-col gap-1 rounded-lg p-1 ${isInput ? "bg-sky-50 ring-1 ring-sky-200" : ""}`}>
        <div className="flex rounded-md bg-slate-200/70 p-0.5 text-xs" role="group">
          {(["given", "input"] as const).map((kind) => (
            <button key={kind} type="button" aria-pressed={cell.kind === kind} data-testid={`${kind}-toggle-${testid}`}
              title={kind === "input" ? t.makeInput : t.makeGiven}
              className={`flex-1 rounded px-2 py-0.5 focus-visible:outline-2 focus-visible:outline-sky-600 ${cell.kind === kind ? "bg-white font-semibold text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              onClick={() => commit(updateCell(table, row, column, { kind }))}>
              {kind === "input" ? t.input : t.given}
            </button>
          ))}
        </div>
        {isInput ? (
          <div className="flex items-center gap-1">
            <input type="text" value={cell.text} aria-label={t.expectedLabel(r, c)} placeholder={t.expected} data-testid={`expected-${testid}`}
              className={`${field} w-20 min-w-0 flex-1 border-sky-300 text-center tabular-nums`} onPaste={onPaste(row, column)}
              onInput={(e) => commit(updateCell(table, row, column, { text: (e.target as HTMLInputElement).value }))} />
            {rules.mode === "number" && (
              <>
                <span className="text-slate-500" aria-hidden="true">{t.tolerance}</span>
                <input type="text" value={cell.tolerance ?? ""} aria-label={t.toleranceLabel(r, c)} placeholder="0" inputMode="decimal"
                  data-testid={`tolerance-${testid}`} className={`${field} w-14 text-center tabular-nums`}
                  onInput={(e) => commit(updateCell(table, row, column, { tolerance: (e.target as HTMLInputElement).value }))} />
              </>
            )}
          </div>
        ) : (
          <input type="text" value={cell.text} aria-label={t.givenLabel(r, c)} data-testid={`given-${testid}`}
            className={`${text} text-center`} onPaste={onPaste(row, column)}
            onInput={(e) => commit(updateCell(table, row, column, { text: (e.target as HTMLInputElement).value }))} />
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3 font-sans text-sm text-slate-800">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={table.headerColumn} data-testid="header-column"
            onChange={(e) => commit({ ...table, headerColumn: (e.target as HTMLInputElement).checked })} />
          <span>{t.headerColumn}</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={table.headerRow} data-testid="header-row"
            onChange={(e) => commit({ ...table, headerRow: (e.target as HTMLInputElement).checked })} />
          <span>{t.headerRow}</span>
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className={button} onClick={() => commit(addRow(table))} data-testid="add-row">{t.addRow}</button>
          <button type="button" className={button} onClick={() => commit(addColumn(table))} data-testid="add-column">{t.addColumn}</button>
          <button type="button" className={button} onClick={() => commit(DEFAULT_TABLE)} data-testid="example">{t.example}</button>
        </div>
      </div>
      <p className="m-0 max-w-[90ch] text-xs text-slate-500">{t.authoringHint}</p>

      <div className="overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
        <table className="border-separate border-spacing-1">
          <thead>
            <tr>
              {table.columns.map((col, j) => (
                <th key={col.id} className="text-center font-normal">
                  <button type="button" className={`${icon} mx-auto`} disabled={table.columns.length < 2} title={t.removeColumn(j + 1)}
                    aria-label={t.removeColumn(j + 1)} onClick={() => commit(removeColumn(table, j))} data-testid={`remove-column-${j}`}>×</button>
                </th>
              ))}
              <td />
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={row.id}>
                {row.cells.map((_, j) => <td key={table.columns[j].id} className="align-top">{editor(i, j)}</td>)}
                <td className="align-middle">
                  <button type="button" className={icon} disabled={table.rows.length < 2} title={t.removeRow(i + 1)}
                    aria-label={t.removeRow(i + 1)} onClick={() => commit(removeRow(table, i))} data-testid={`remove-row-${i}`}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-slate-600" data-testid="summary" aria-live="polite">
        {t.summary(inputCells(table).length)}
        {problems.length > 0 && (
          <ul className="m-0 mt-1 list-none p-0 text-red-700" data-testid="problems">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Authoring;
