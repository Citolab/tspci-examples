import { useState } from "preact/hooks";
import {
  DEFAULT_TABLE, Mode, Table, addColumn, addRow, choices, moveRow, pasteGrid, removeColumn, removeRow, setText,
} from "./table";
import { textsFor } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance): build the table and fill it. The result is data-table (table.ts).

/** What keeps the table from being used (getAuthoringInstance validate()). */
export const authoringProblems = (table: Table, mode: Mode, language: string) =>
  choices(table, mode).length < 1 ? [textsFor(language).nothingToChoose] : [];

const button = "rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50 disabled:opacity-40";
const icon = "grid size-7 place-items-center rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent";

const Authoring = ({ initial, mode, language, onChange }: {
  initial: Table;
  mode: Mode;
  language: string;
  onChange: (table: Table) => void;
}) => {
  const t = textsFor(language);
  const [table, setTable] = useState<Table>(initial);
  const commit = (next: Table) => {
    setTable(next);
    onChange(next);
  };
  const problems = authoringProblems(table, mode, language);

  /** A text field for row `row` (-1: the header row) and column `column`. */
  const field = (row: number, column: number) => {
    const value = row < 0 ? table.columns[column].label : table.rows[row].cells[column];
    return (
      <input type="text" value={value} data-testid={`input-${row}-${column}`}
        aria-label={row < 0 ? t.header(column + 1) : t.cellInput(row + 1, column + 1)}
        className={`w-full min-w-24 rounded-md border border-slate-300 px-2 py-1 ${row < 0 || (table.rowHeaders && column === 0) ? "font-semibold" : ""}`}
        onInput={(e) => commit(setText(table, row, column, (e.target as HTMLInputElement).value))}
        onPaste={(e) => {
          const text = e.clipboardData?.getData("text/plain") ?? "";
          if (!/[\t\n]/.test(text.replace(/\r?\n$/, ""))) return; // one value: the field pastes it itself
          e.preventDefault();
          commit(pasteGrid(table, text, row, column));
        }} />
    );
  };

  return (
    <div className="flex flex-col gap-3 font-sans text-sm text-slate-800">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={table.rowHeaders} data-testid="row-headers"
            onChange={(e) => commit({ ...table, rowHeaders: (e.target as HTMLInputElement).checked })} />
          <span>{t.rowHeaders}</span>
          <span className="text-xs text-slate-500">{t.rowHeadersHint}</span>
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className={button} onClick={() => commit(addRow(table))} data-testid="add-row">{t.addRow}</button>
          <button type="button" className={button} onClick={() => commit(addColumn(table))} data-testid="add-column">{t.addColumn}</button>
          <button type="button" className={button} onClick={() => commit(DEFAULT_TABLE)} data-testid="example">{t.example}</button>
        </div>
      </div>
      <p className="m-0 text-xs text-slate-500">{t.hint}</p>

      <div className="overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
        <table className="border-separate border-spacing-1">
          <thead>
            <tr>
              <td />
              {table.columns.map((c, i) => (
                <th key={c.id} className="text-left font-normal">
                  <div className="flex items-center gap-1">
                    {field(-1, i)}
                    <button type="button" className={icon} disabled={table.columns.length < 2} title={t.removeColumn(i + 1)}
                      aria-label={t.removeColumn(i + 1)} onClick={() => commit(removeColumn(table, i))} data-testid={`remove-column-${i}`}>×</button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">
                  <button type="button" className={`${icon} inline-grid`} disabled={i === 0} title={t.moveUp(i + 1)}
                    aria-label={t.moveUp(i + 1)} onClick={() => commit(moveRow(table, i, -1))}>↑</button>
                  <button type="button" className={`${icon} inline-grid`} disabled={i === table.rows.length - 1} title={t.moveDown(i + 1)}
                    aria-label={t.moveDown(i + 1)} onClick={() => commit(moveRow(table, i, 1))}>↓</button>
                </td>
                {r.cells.map((_, j) => <td key={table.columns[j].id}>{field(i, j)}</td>)}
                <td>
                  <button type="button" className={icon} disabled={table.rows.length < 2} title={t.removeRow(i + 1)}
                    aria-label={t.removeRow(i + 1)} onClick={() => commit(removeRow(table, i))} data-testid={`remove-row-${i}`}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="m-0 text-slate-600" data-testid="summary">
        {t.summary(table.rows.length, table.columns.length)}
        {problems.map((p) => <span key={p} className="ml-2 text-red-600">{p}</span>)}
      </p>
    </div>
  );
};

export default Authoring;
