import { useEffect, useRef, useState } from "preact/hooks";
import Chart, { ChartSettings } from "./view";
import {
  ChartData, DEFAULT_DATA, EMPTY_DATA, Mode, PALETTE, addCategory, addSeries, findSegment, moveCategory, parseNumber,
  pasteGrid, removeCategory, removeSeries, segmentIds, setCategoryLabel, setSeries, setValue, toTSV, toggleCorrect,
} from "./chart";
import { formatNumber } from "./scale";
import { textsFor } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance): the data as a table (categories × series, the series' names
// and colours), pasted from a spreadsheet or typed, with the chart next to it; in select mode a click in the chart
// marks the correct answer. The result is data-data (chart.ts).

/** What keeps the chart from being used (getAuthoringInstance validate()). */
export const authoringProblems = (data: ChartData, mode: Mode, maxChoices: number, chartType: string, language: string) => {
  const t = textsFor(language);
  const problems: string[] = [];
  const values = data.categories.flatMap((c) => c.values).filter((v) => v !== null);
  if (!values.length) problems.push(t.noValues);
  if (data.series.length > 1 && data.series.some((s) => !s.name.trim())) problems.push(t.noName);
  if (chartType === "pie" && values.some((v) => v < 0)) problems.push(t.pieNegative);
  if (mode === "select") {
    const correct = data.correct.filter((id) => segmentIds(data).includes(id));
    if (!correct.length) problems.push(t.noCorrect);
    else if (maxChoices > 0 && correct.length > maxChoices) problems.push(t.tooManyCorrect(maxChoices));
  }
  return problems;
};

const button = "rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50 disabled:opacity-40";
const icon = "grid size-7 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent";
const field = "w-full rounded-md border border-slate-300 bg-white px-2 py-1 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/30";

/** A number field that lets the author type (1, → 1,5) and shows the number the item's way when they leave it. */
const NumberField = ({ value, decimal, language, label, testid, onValue, onPaste }: {
  value: number | null;
  decimal: "." | ",";
  language: string;
  label: string;
  testid: string;
  onValue: (v: number | null) => void;
  onPaste: (e: ClipboardEvent) => void;
}) => {
  const shown = (v: number | null) => (v === null ? "" : formatNumber(v, language, (String(v).split(".")[1] ?? "").length).replace(/−/, "-"));
  const [text, setText] = useState(shown(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(shown(value));
  }, [value, language]);
  const bad = text.trim() !== "" && parseNumber(text, decimal) === null;
  return (
    <input type="text" inputMode="decimal" value={text} aria-label={label} data-testid={testid} aria-invalid={bad}
      className={`${field} w-24 text-right tabular-nums ${bad ? "border-red-500 bg-red-50" : ""}`}
      onFocus={() => (editing.current = true)}
      onBlur={() => {
        editing.current = false;
        setText(shown(value));
      }}
      onInput={(e) => {
        const t = (e.target as HTMLInputElement).value;
        setText(t);
        const n = parseNumber(t, decimal);
        if (t.trim() === "") onValue(null);
        else if (n !== null) onValue(n);
      }}
      onPaste={onPaste} />
  );
};

const Authoring = ({ initial, settings, mode, maxChoices, language, onChange }: {
  initial: ChartData;
  /** The item's chart settings: the preview shows the chart as the candidate will see it. */
  settings: ChartSettings;
  mode: Mode;
  maxChoices: number;
  /** The author's language, for the texts. */
  language: string;
  onChange: (data: ChartData) => void;
}) => {
  const t = textsFor(language);
  const [data, setData] = useState<ChartData>(initial);
  /** The series whose colours are open, and where (fixed: the table scrolls, the choice should not be cut off). */
  const [palette, setPaletteState] = useState<{ index: number; x: number; y: number } | null>(null);
  const setPalette = (index: number | null, button?: Element) => {
    if (index === null || !button) return setPaletteState(null);
    const r = button.getBoundingClientRect();
    setPaletteState({ index, x: r.left, y: r.bottom + 4 });
  };
  const [note, setNote] = useState("");
  const commit = (next: ChartData) => {
    setData(next);
    onChange(next);
  };
  const decimal = settings.language.slice(0, 2).toLowerCase() === "nl" ? "," : ".";
  const problems = authoringProblems(data, mode, maxChoices, settings.chartType, language);
  const correct = data.correct.map((id) => findSegment(data, id)).filter(Boolean);

  /** A paste of more than one cell fills the table from (row, column); one value the field pastes itself. */
  const paste = (row: number, column: number) => (e: ClipboardEvent) => {
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (!/[\t\n]/.test(text.replace(/\r?\n$/, ""))) return;
    e.preventDefault();
    commit(pasteGrid(data, text, row, column));
  };

  return (
    <div className="flex flex-col gap-3 font-sans text-sm text-slate-800" onKeyDown={(e) => e.key === "Escape" && setPalette(null)}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={button} onClick={() => commit(addCategory(data))} data-testid="add-category">{t.addCategory}</button>
        <button type="button" className={button} onClick={() => commit(addSeries(data))} data-testid="add-series">{t.addSeries}</button>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className={button} data-testid="copy"
            onClick={() => navigator.clipboard?.writeText(toTSV(data, t.category)).then(() => setNote(t.copied), () => setNote(""))}>{t.copy}</button>
          <button type="button" className={button} onClick={() => commit(EMPTY_DATA)} data-testid="empty">{t.empty}</button>
          <button type="button" className={button} onClick={() => commit(DEFAULT_DATA)} data-testid="example">{t.example}</button>
        </div>
      </div>
      <p className="m-0 text-xs text-slate-500">{t.hint} {note && <span className="text-emerald-700">{note}</span>}</p>

      <div className="flex flex-col gap-4">
        <div onScroll={() => palette && setPalette(null)} className="max-h-80 min-w-0 self-start overflow-auto max-w-full rounded-lg border border-slate-200 bg-slate-50 p-2">
          <table className="border-separate border-spacing-1">
            <thead>
              <tr>
                <td />
                <th className="text-left align-bottom font-normal">
                  <input type="text" className={`${field} min-w-28 font-semibold text-slate-500`} value={t.category} readOnly
                    aria-label={t.category} data-testid="corner" onPaste={paste(-1, -1)} />
                </th>
                {data.series.map((s, i) => (
                  <th key={s.id} className="relative text-left align-bottom font-normal">
                    <div className="flex items-center gap-1">
                      <button type="button" className="size-6 shrink-0 rounded-md border border-slate-300 shadow-inner" style={{ background: s.color }}
                        aria-label={t.color(s.name || `${t.series} ${i + 1}`)} aria-expanded={palette?.index === i} title={t.color(s.name || `${t.series} ${i + 1}`)}
                        data-testid={`color-${i}`} onClick={(e) => setPalette(palette?.index === i ? null : i, e.currentTarget as Element)} />
                      <input type="text" className={`${field} min-w-28 font-semibold`} value={s.name} aria-label={t.seriesName(i + 1)}
                        data-testid={`series-${i}`} onInput={(e) => commit(setSeries(data, i, { name: (e.target as HTMLInputElement).value }))}
                        onPaste={paste(-1, i)} />
                      <button type="button" className={icon} disabled={data.series.length < 2} title={t.removeSeries(i + 1)}
                        aria-label={t.removeSeries(i + 1)} onClick={() => commit(removeSeries(data, i))} data-testid={`remove-series-${i}`}>×</button>
                    </div>
                    {palette?.index === i && (
                      <div className="fixed z-20 flex w-max flex-col" style={{ left: `${palette.x}px`, top: `${palette.y}px` }} data-testid="palette"><div className="flex w-max flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-lg" role="group" aria-label={t.color(s.name)}>
                        <div className="grid grid-cols-4 gap-1.5">
                          {PALETTE.map((p, k) => (
                            <button key={p.color} type="button" className={`size-7 rounded-md border-2 ${s.color.toLowerCase() === p.color.toLowerCase() ? "border-slate-900" : "border-transparent"}`}
                              style={{ background: p.color }} aria-label={p.name[language === "nl" ? "nl" : "en"]} title={p.name[language === "nl" ? "nl" : "en"]}
                              aria-pressed={s.color.toLowerCase() === p.color.toLowerCase()} data-testid={`swatch-${i}-${k}`}
                              onClick={() => { commit(setSeries(data, i, { color: p.color })); setPalette(null); }} />
                          ))}
                        </div>
                        <label className="flex items-center gap-2 text-xs text-slate-600">
                          <input type="color" value={s.color} className="h-7 w-10 cursor-pointer rounded border border-slate-300"
                            onInput={(e) => commit(setSeries(data, i, { color: (e.target as HTMLInputElement).value }))} />
                          {t.customColor}
                        </label>
                      </div></div>
                    )}
                  </th>
                ))}
                <td />
              </tr>
            </thead>
            <tbody>
              {data.categories.map((c, ci) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap">
                    <button type="button" className={`${icon} inline-grid`} disabled={ci === 0} title={t.moveUp(ci + 1)}
                      aria-label={t.moveUp(ci + 1)} onClick={() => commit(moveCategory(data, ci, -1))}>↑</button>
                    <button type="button" className={`${icon} inline-grid`} disabled={ci === data.categories.length - 1} title={t.moveDown(ci + 1)}
                      aria-label={t.moveDown(ci + 1)} onClick={() => commit(moveCategory(data, ci, 1))}>↓</button>
                  </td>
                  <td>
                    <input type="text" className={field} value={c.label} aria-label={t.categoryLabel(ci + 1)} data-testid={`category-${ci}`}
                      onInput={(e) => commit(setCategoryLabel(data, ci, (e.target as HTMLInputElement).value))} onPaste={paste(ci, -1)} />
                  </td>
                  {data.series.map((s, si) => (
                    <td key={s.id}>
                      <NumberField value={c.values[si]} decimal={decimal} language={settings.language} label={t.value(ci + 1, si + 1)}
                        testid={`value-${ci}-${si}`} onValue={(v) => commit(setValue(data, ci, si, v))} onPaste={paste(ci, si)} />
                    </td>
                  ))}
                  <td>
                    <button type="button" className={icon} disabled={data.categories.length < 2} title={t.removeCategory(ci + 1)}
                      aria-label={t.removeCategory(ci + 1)} onClick={() => commit(removeCategory(data, ci))} data-testid={`remove-category-${ci}`}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="flex min-w-0 flex-col gap-2" aria-label={t.preview}>
          <h2 className="m-0 text-xs font-semibold tracking-wide text-slate-500 uppercase">{t.preview}</h2>
          <div className="max-w-full self-start overflow-auto rounded-lg border border-slate-200 bg-white p-3" data-testid="preview"
            style={{ width: `${settings.width + 26}px` }}>
            <Chart data={data} settings={settings} texts={textsFor(settings.language)}
              label={settings.title || t.preview} selected={mode === "select" ? data.correct : []} selectable={mode === "select"}
              single={maxChoices === 1} onChoose={(id) => commit(toggleCorrect(data, id, maxChoices))} />
          </div>
          {mode === "select" && (
            <p className="m-0 text-xs text-slate-600" data-testid="correct">
              {t.correctHint(maxChoices)}{" "}
              <strong className="font-semibold text-slate-800">
                {correct.length ? t.correctList(correct.map((c) => `${c.category.label}, ${c.series.name}`)) : t.correctNone}
              </strong>
            </p>
          )}
        </section>
      </div>

      <p className="m-0 text-slate-600" data-testid="summary">
        {t.summary(data.categories.length, data.series.length)}
        {problems.map((p) => <span key={p} className="ml-2 text-red-600">{p}</span>)}
      </p>
    </div>
  );
};

export default Authoring;
