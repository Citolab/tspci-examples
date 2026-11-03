import { useMemo, useState } from "preact/hooks";
import Grid from "./grid";
import { Locale, MAX_COLUMNS, MAX_ROWS } from "./formula";
import { CellDef, DEFAULT_SHEET, FILLS, FillName, Mode, Sheet, WIDTH, inBounds, inputsOf } from "./sheet";
import { textsFor } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance): the same sheet, every cell editable, with a toolbar to size it,
// lock, bolden and colour cells and choose the answer cell. The result is data-sheet (sheet.ts).

/** What keeps the sheet from being used (getAuthoringInstance validate()). */
export const authoringProblems = (sheet: Sheet, mode: Mode, language: string) => {
  const t = textsFor(language);
  if (mode !== "answer") return [];
  if (!sheet.answer || !inBounds(sheet, sheet.answer)) return [t.noAnswer];
  if (sheet.cells[sheet.answer]?.locked) return [t.answerLocked];
  return [];
};

const swatch = "size-6 rounded border border-slate-300 hover:border-slate-500 aria-pressed:outline-2 aria-pressed:outline-offset-1 aria-pressed:outline-emerald-700";
const button = "rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50 disabled:opacity-40 aria-pressed:border-emerald-700 aria-pressed:bg-emerald-50 aria-pressed:text-emerald-900";

const Authoring = ({ initial, mode, locale, language, onChange }: {
  initial: Sheet;
  mode: Mode;
  /** The candidate's language: how numbers and formulas are typed. */
  locale: Locale;
  /** The author's language, for the texts. */
  language: string;
  onChange: (sheet: Sheet) => void;
}) => {
  const t = textsFor(language);
  const [sheet, setSheet] = useState<Sheet>(initial);
  const [selected, setSelected] = useState("A1");
  const inputs = useMemo(() => inputsOf(sheet), [sheet]);
  const commit = (next: Sheet) => {
    setSheet(next);
    onChange(next);
  };
  const problems = authoringProblems(sheet, mode, language);
  const def = sheet.cells[selected];
  const cells = Object.entries(sheet.cells).filter(([ref]) => inBounds(sheet, ref));

  /** A cell with something changed; a cell with nothing left goes. */
  const withCell = (ref: string, change: Partial<CellDef>, base = sheet.cells) => {
    const next = { ...base };
    const c: CellDef = { input: "", ...next[ref], ...change };
    if (!c.locked) delete c.locked;
    if (!c.bold) delete c.bold;
    if (!c.fill) delete c.fill;
    if (!c.input && !c.locked && !c.bold && !c.fill) delete next[ref];
    else next[ref] = c;
    return next;
  };
  const setCells = (changes: Record<string, string>) => {
    let cells = sheet.cells;
    for (const [ref, input] of Object.entries(changes)) cells = withCell(ref, { input }, cells);
    commit({ ...sheet, cells });
  };
  const setSize = (columns: number, rows: number) => {
    const widths = Array.from({ length: columns }, (_, i) => sheet.widths[i] ?? WIDTH.standard);
    commit({ ...sheet, columns, rows, widths });
  };
  const sizeField = (side: "columns" | "rows", max: number) => (
    <label className="flex items-center gap-2">
      <span className="text-xs text-slate-500">{t[side]}</span>
      <input type="number" min={1} max={max} value={sheet[side]} data-testid={side}
        className="w-16 rounded-md border border-slate-300 px-2 py-1"
        onChange={(e) => {
          const n = Math.min(max, Math.max(1, Math.round(Number((e.target as HTMLInputElement).value))));
          if (Number.isFinite(n) && n !== sheet[side]) setSize(side === "columns" ? n : sheet.columns, side === "rows" ? n : sheet.rows);
        }} />
    </label>
  );

  return (
    <div className="flex flex-col gap-3 font-sans text-sm text-slate-800">
      <div className="flex flex-wrap items-center gap-3">
        {sizeField("columns", MAX_COLUMNS)}
        {sizeField("rows", MAX_ROWS)}
        <span className="mx-1 h-6 w-px bg-slate-200" />
        <button type="button" className={button} aria-pressed={!!def?.locked} data-testid="lock"
          onClick={() => commit({ ...sheet, cells: withCell(selected, { locked: !def?.locked }) })}>{t.lock} {selected}</button>
        <button type="button" className={`${button} font-semibold`} aria-pressed={!!def?.bold} data-testid="bold"
          onClick={() => commit({ ...sheet, cells: withCell(selected, { bold: !def?.bold }) })}>{t.bold}</button>
        <div className="flex items-center gap-1" role="group" aria-label={t.fill} data-testid="fill">
          <button type="button" className={`${swatch} bg-white text-xs leading-none text-slate-400`} aria-pressed={!def?.fill}
            title={t.noFill} aria-label={t.noFill} data-testid="fill-none"
            onClick={() => commit({ ...sheet, cells: withCell(selected, { fill: undefined }) })}>∅</button>
          {(Object.entries(FILLS) as [FillName, string][]).map(([name, color]) => (
            <button key={name} type="button" className={swatch} style={{ background: color }} aria-pressed={def?.fill === color}
              title={`${t.fill}: ${t.fills[name]}`} aria-label={`${t.fill}: ${t.fills[name]}`} data-testid={`fill-${name}`}
              onClick={() => commit({ ...sheet, cells: withCell(selected, { fill: color }) })} />
          ))}
        </div>
        <button type="button" className={button} aria-pressed={sheet.answer === selected} disabled={mode !== "answer"}
          title={mode !== "answer" ? t.answerOnlyInAnswerMode : undefined} data-testid="answer"
          onClick={() => commit({ ...sheet, answer: sheet.answer === selected ? null : selected, cells: withCell(selected, { locked: false }) })}>{t.answer}</button>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className={button} data-testid="lock-filled"
            onClick={() => commit({ ...sheet, cells: Object.fromEntries(Object.entries(sheet.cells).map(([ref, c]) => [ref, c.input && ref !== sheet.answer ? { ...c, locked: true } : c])) })}>{t.lockFilled}</button>
          <button type="button" className={button} data-testid="unlock-all"
            onClick={() => commit({ ...sheet, cells: Object.fromEntries(Object.entries(sheet.cells).map(([ref, { locked, ...c }]) => [ref, c])) })}>{t.unlockAll}</button>
          <button type="button" className={button} onClick={() => commit({ ...sheet, cells: {}, answer: null })} data-testid="empty">{t.empty}</button>
          <button type="button" className={button} onClick={() => commit(DEFAULT_SHEET)} data-testid="example">{t.example}</button>
        </div>
      </div>
      <p className="m-0 text-xs text-slate-500">{t.authoringHint}</p>

      <Grid sheet={sheet} inputs={inputs} locale={locale} texts={t} selected={selected} onSelect={setSelected}
        editable={() => true} onChange={setCells} answer={mode === "answer" ? sheet.answer : null} showFormulaBar
        label={t.sheet}
        author={{ onResize: (col, width) => commit({ ...sheet, widths: sheet.widths.map((w, i) => (i === col ? width : w)) }) }} />

      <p className="m-0 text-slate-600" data-testid="summary">
        {t.summary(cells.filter(([, c]) => c.input).length, cells.filter(([, c]) => c.locked).length)}
        {problems.map((p) => <span key={p} className="ml-2 text-red-600">{p}</span>)}
      </p>
    </div>
  );
};

export default Authoring;
