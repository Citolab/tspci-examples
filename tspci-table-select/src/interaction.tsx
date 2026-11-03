import { IStore, useStore } from "@citolab/preact-store";
import { Actions, StateModel } from "./store";
import { Mode, Table, cellId, selectableColumn } from "./table";
import { Texts } from "./texts";

// Every row (or cell) the candidate can choose is a radio button, hidden behind a label that fills the cell: a click
// anywhere on it chooses, the arrow keys move between them, and a screen reader hears one choice out of many.
// Choosing the chosen one again takes the choice back.

const Interaction = ({ prompt, table, mode, store, texts }: {
  prompt: string;
  table: Table;
  mode: Mode;
  store: IStore<StateModel, Actions>;
  texts: Texts;
}) => {
  const { selected } = useStore(store);

  const radio = (id: string, label: string) => (
    <input type="radio" name="choice" id={`choice-${id}`} className="peer sr-only" checked={selected === id} aria-label={label}
      onChange={() => store.dispatch({ type: "SELECT", payload: { id } })}
      // the click comes before the change: a radio that was chosen already is chosen again
      onClick={() => selected === id && store.dispatch({ type: "CLEAR", payload: null })} />
  );
  const text = (t: string) => t || texts.empty;

  return (
    <div className="inline-flex max-w-full flex-col gap-3 font-sans text-slate-800">
      {prompt && <p className="m-0 text-[15px] text-slate-700">{prompt}</p>}
      <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_rgba(16,24,40,.06)]">
        <table className="border-collapse text-left text-sm tabular-nums" aria-label={prompt || texts.table} data-testid="table">
          <thead>
            <tr className="bg-slate-100">
              {table.columns.map((c) => (
                <th key={c.id} scope="col" className="border-b border-slate-300 px-4 py-2.5 font-semibold text-slate-700">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => {
              const rowChosen = mode === "row" && selected === row.id;
              return (
                <tr key={row.id} data-testid={row.id} data-selected={mode === "row" ? rowChosen : undefined}
                  className={`border-b border-slate-200 last:border-b-0 ${mode === "row"
                    ? `cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-sky-600 ${rowChosen ? "bg-sky-100" : "hover:bg-slate-50"}`
                    : ""}`}>
                  {row.cells.map((cell, i) => {
                    const column = table.columns[i];
                    const header = table.rowHeaders && i === 0;
                    const Tag = header ? "th" : "td";
                    const scope = header ? "row" : undefined;
                    if (mode === "row") {
                      const label = texts.row(table.columns.map((c, j) => `${c.label}: ${text(row.cells[j])}`));
                      return (
                        <Tag key={column.id} scope={scope}
                          className={`p-0 ${header ? "font-semibold" : ""} ${rowChosen && i === 0 ? "shadow-[inset_4px_0_0_var(--color-sky-600)]" : ""}`}>
                          {i === 0 && radio(row.id, label)}
                          <label htmlFor={`choice-${row.id}`} className="block cursor-pointer px-4 py-2.5">{cell || " "}</label>
                        </Tag>
                      );
                    }
                    if (!selectableColumn(table, i)) {
                      return <Tag key={column.id} scope={scope} className="bg-slate-50 px-4 py-2.5 font-semibold">{cell}</Tag>;
                    }
                    const id = cellId(row, column);
                    const where = [column.label, table.rowHeaders ? row.cells[0] : ""].filter(Boolean);
                    return (
                      <Tag key={column.id} scope={scope} data-testid={id} data-selected={selected === id}
                        className={`p-0 has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-sky-600 ${selected === id
                          ? "bg-sky-100 shadow-[inset_0_0_0_2px_var(--color-sky-600)]"
                          : "hover:bg-slate-50"}`}>
                        {radio(id, texts.cell(text(cell), where))}
                        <label htmlFor={`choice-${id}`} className="block cursor-pointer px-4 py-2.5">{cell || " "}</label>
                      </Tag>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Interaction;
