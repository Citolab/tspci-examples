import { useMemo, useRef, useState } from "preact/hooks";
import MarkerView, { Swatch, categoryName } from "./markerView";
import {
  COLORS, Category, Color, EXAMPLE_CATEGORIES, EXAMPLE_KEY, EXAMPLE_TEXT, MAX_CATEGORIES, MAX_TARGETS, Mark, PATTERNS, Pattern, RULES, Rule,
  Scoring, Snap, detectDirection, ownMarks, parseMarks, parseText, remapMarks,
} from "./marker";
import { Texts, formatNumber, textsFor } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance): the source text, the categories, the correct marks (the key)
// and the scoring rules. The result is data-text, data-categories, data-key and data-scoring (marker.ts).

export type AuthoringConfig = { text: string; categories: Category[]; key: Mark[]; scoring: Scoring };
/** The item's other settings, which the authoring mode follows but does not change. */
export type ItemSettings = { snap: Snap; maxMarks: number; maxLength: number; textLanguage: string; direction: string; showLabels: boolean };

/** What keeps the item from working as intended (getAuthoringInstance validate()), in the author's language. */
export const authoringProblems = (c: AuthoringConfig, item: ItemSettings, language: string): string[] => {
  const t = textsFor(language);
  const num = (n: number) => formatNumber(t, n);
  const doc = parseText(c.text, item.textLanguage);
  const problems: string[] = [];
  if (!doc.words.length) problems.push(t.problemText);
  if (!c.categories.length) problems.push(t.problemCategories);
  if (!c.key.length) problems.push(t.problemKey);
  if (c.key.length > MAX_TARGETS) problems.push(t.problemTooManyTargets(num(MAX_TARGETS)));
  const ids = new Set(c.categories.map((x) => x.id));
  c.key.forEach((m, i) => {
    if (m.end >= doc.words.length) problems.push(t.problemKeyRange(num(i + 1)));
    if (!ids.has(m.category)) problems.push(t.problemKeyCategory(num(i + 1)));
    if (item.maxLength > 0 && m.end - m.start + 1 > item.maxLength) problems.push(t.problemMaxLength(num(i + 1), num(item.maxLength)));
  });
  if (item.maxMarks > 0 && c.key.length > item.maxMarks) problems.push(t.problemMaxMarks(num(c.key.length), num(item.maxMarks)));
  if (c.scoring.partial > c.scoring.points) problems.push(t.problemPartial);
  return problems;
};

/** HTML from the clipboard (a word processor, a web page) as the text's markup: paragraphs, **bold**, *italic*. */
export const htmlToMarkup = (html: string): string => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const BLOCK = /^(P|DIV|H[1-6]|LI|BLOCKQUOTE|TR|SECTION|ARTICLE|UL|OL|TABLE)$/;
  let out = "";
  const walk = (node: Node, bold: boolean, italic: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").replace(/\s+/g, " ");
      if (!text.trim()) {
        if (text && !/\s$/.test(out)) out += " ";
        return;
      }
      const lead = /^\s/.test(text) ? " " : "", trail = /\s$/.test(text) ? " " : "";
      const core = text.trim().replace(/([*_\\])/g, "\\$1");
      const mark = (bold ? "**" : "") + (italic ? "*" : "");
      out += lead + mark + core + [...mark].reverse().join("") + trail;
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName;
    if (tag === "STYLE" || tag === "SCRIPT" || tag === "HEAD") return;
    if (tag === "BR") {
      out = out.replace(/ +$/, "") + "\n";
      return;
    }
    const weight = node.style?.fontWeight;
    const b = bold || tag === "B" || tag === "STRONG" || /^(bold|[6-9]00)$/.test(weight ?? "") || /^H[1-6]$/.test(tag);
    const i = italic || tag === "I" || tag === "EM" || node.style?.fontStyle === "italic";
    const block = BLOCK.test(tag);
    if (block) out = out.replace(/[ \n]+$/, "") + "\n\n";
    node.childNodes.forEach((child) => walk(child, b, i));
    if (block) out = out.replace(/[ \n]+$/, "") + "\n\n";
  };
  walk(doc.body, false, false);
  return out
    .replace(/\*\*\*\*|\*\*(\s*)\*\*/g, "$1") // **a****b** → **ab**
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const button =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-sky-700";
const field = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm";
type Tab = "text" | "categories" | "key" | "rules";

const Authoring = ({ initial, item, language, onChange }: { initial: AuthoringConfig; item: ItemSettings; language: string; onChange: (c: AuthoringConfig) => void }) => {
  const t = textsFor(language);
  const num = (n: number) => formatNumber(t, n);
  const [config, setConfig] = useState<AuthoringConfig>(initial);
  const [tab, setTab] = useState<Tab>("text");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const doc = useMemo(() => parseText(config.text, item.textLanguage), [config.text, item.textLanguage]);
  const commit = (next: AuthoringConfig) => {
    setConfig(next);
    onChange(next);
  };
  const problems = authoringProblems(config, item, language);
  const direction = item.direction === "rtl" || item.direction === "ltr" ? item.direction : detectDirection(config.text);

  /** A new text: the key follows the words that stayed. */
  const setText = (text: string) => {
    const before = doc.words.map((w) => w.text);
    const after = parseText(text, item.textLanguage).words.map((w) => w.text);
    commit({ ...config, text, key: remapMarks(before, after, config.key) });
  };
  const wrap = (marker: string) => {
    const el = textarea.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    if (a === b) return;
    const inner = value.slice(a, b);
    const lead = inner.match(/^\s*/)![0], trail = inner.match(/\s*$/)![0];
    const next = value.slice(0, a) + lead + marker + inner.trim() + marker + trail + value.slice(b);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + lead.length, b + 2 * marker.length - trail.length);
    });
  };
  const onPaste = (e: ClipboardEvent) => {
    const html = e.clipboardData?.getData("text/html");
    if (!html) return;
    e.preventDefault();
    const el = e.target as HTMLTextAreaElement;
    const markup = htmlToMarkup(html);
    setText(el.value.slice(0, el.selectionStart) + markup + el.value.slice(el.selectionEnd));
  };

  const setCategory = (i: number, patch: Partial<Category>) =>
    commit({ ...config, categories: config.categories.map((c, k) => (k === i ? { ...c, ...patch } : c)) });
  const addCategory = () => {
    const used = new Set(config.categories.map((c) => c.id));
    const id = "abcdefghijklmnopqrstuvwxyz".split("").find((x) => !used.has(x))!;
    const i = config.categories.length;
    const name = `${t.categoryName} ${i + 1}`;
    commit({ ...config, categories: [...config.categories, { id, name, short: String(i + 1), color: COLORS[i % COLORS.length], pattern: PATTERNS[i % PATTERNS.length] }] });
  };
  const removeCategory = (i: number) => {
    const gone = config.categories[i].id;
    commit({ ...config, categories: config.categories.filter((_, k) => k !== i), key: config.key.filter((m) => m.category !== gone) });
  };
  const setScoring = (patch: Partial<Scoring>) => commit({ ...config, scoring: { ...config.scoring, ...patch } });

  const numberField = (label: string, key: keyof Scoring, min: number, max: number, help?: string) => (
    <label className="flex max-w-[20rem] flex-col gap-1">
      <span className="text-sm text-slate-700">{label}</span>
      <input type="number" min={min} max={max} value={config.scoring[key] as number} className={`${field} w-24`} data-testid={`scoring-${key}`}
        onInput={(e) => {
          const n = Math.round(Number((e.target as HTMLInputElement).value));
          if (Number.isFinite(n)) setScoring({ [key]: Math.min(max, Math.max(min, n)) } as Partial<Scoring>);
        }} />
      {help && <span className="text-xs text-slate-500">{help}</span>}
    </label>
  );

  const tabs: [Tab, string][] = [["text", t.tabText], ["categories", t.tabCategories], ["key", t.tabKey], ["rules", t.tabRules]];
  const categoriesValid = config.categories.length ? config.categories : [];

  return (
    <div className="flex flex-col gap-4 p-4 font-sans text-slate-800">
      <div role="tablist" className="flex gap-1 border-b border-slate-200">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} id={`tab-${id}`}
            className={`-mb-px rounded-t-lg border px-4 py-2 text-sm ${tab === id ? "border-slate-200 border-b-white bg-white font-semibold" : "border-transparent text-slate-600 hover:text-slate-900"}`}
            onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="flex flex-col gap-3">
        {tab === "text" && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={`${button} font-bold`} onMouseDown={(e) => e.preventDefault()} onClick={() => wrap("**")}>{t.bold}</button>
              <button type="button" className={`${button} italic`} onMouseDown={(e) => e.preventDefault()} onClick={() => wrap("*")}>{t.italic}</button>
              <span className="text-sm text-slate-600" data-testid="word-count">{t.wordCount(num(doc.words.length))}</span>
              <button type="button" className={`${button} ms-auto`}
                onClick={() => commit({ text: EXAMPLE_TEXT, categories: EXAMPLE_CATEGORIES, key: parseMarks(EXAMPLE_KEY), scoring: config.scoring })}>
                {t.useExample}
              </button>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">{t.sourceText}</span>
              <textarea ref={textarea} value={config.text} rows={16} dir="auto" lang={item.textLanguage || undefined} data-testid="source"
                className={`${field} font-mono text-[13px] leading-relaxed`} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} onPaste={onPaste} />
            </label>
            <p className="m-0 text-xs text-slate-500">{t.textHelp}</p>
          </>
        )}

        {tab === "categories" && (
          <>
            <p className="m-0 max-w-[75ch] text-sm text-slate-600">{t.categoriesHelp}</p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {config.categories.map((c, i) => (
                <li key={c.id} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-2" data-testid={`category-row-${i}`}>
                  <span className="pb-1"><Swatch category={c} t={t} /></span>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-xs text-slate-500">{t.categoryName}</span>
                    <input className={`${field} w-48`} value={c.name} aria-label={`${t.categoryName} ${i + 1}`} onInput={(e) => setCategory(i, { name: (e.target as HTMLInputElement).value })} />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-xs text-slate-500">{t.categoryShort}</span>
                    <input className={`${field} w-14`} maxLength={3} value={c.short} aria-label={`${t.categoryShort} ${i + 1}`} onInput={(e) => setCategory(i, { short: (e.target as HTMLInputElement).value })} />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-xs text-slate-500">{t.categoryColor}</span>
                    <select className={field} value={c.color} aria-label={`${t.categoryColor} ${i + 1}`} onChange={(e) => setCategory(i, { color: (e.target as HTMLSelectElement).value as Color })}>
                      {COLORS.map((x) => <option key={x} value={x}>{t.color[x]}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-xs text-slate-500">{t.categoryPattern}</span>
                    <select className={field} value={c.pattern} aria-label={`${t.categoryPattern} ${i + 1}`} onChange={(e) => setCategory(i, { pattern: (e.target as HTMLSelectElement).value as Pattern })}>
                      {PATTERNS.map((x) => <option key={x} value={x}>{t.pattern[x]}</option>)}
                    </select>
                  </label>
                  <span className="pb-1 font-mono text-xs text-slate-400" title="id">{c.id}</span>
                  <button type="button" className={`${button} ms-auto`} disabled={config.categories.length < 2}
                    aria-label={t.removeCategory(categoryName(c, t))} onClick={() => removeCategory(i)}>×</button>
                </li>
              ))}
            </ul>
            <div>
              <button type="button" className={button} disabled={config.categories.length >= MAX_CATEGORIES} onClick={addCategory}>{t.addCategory}</button>
            </div>
          </>
        )}

        {tab === "key" && categoriesValid.length > 0 && (
          <>
            <p className="m-0 text-sm text-slate-600">{t.keyHelp}</p>
            <MarkerView doc={doc} categories={categoriesValid} marks={ownMarks(config.key, doc.words.length, categoriesValid)} t={t}
              limits={{ maxMarks: MAX_TARGETS, maxLength: 0 }} snap={item.snap} direction={direction} textLanguage={item.textLanguage}
              showLabels={item.showLabels} maxHeight={460} label={t.tabKey} listHeading={t.correctMarks}
              onChange={(key) => commit({ ...config, key })} />
          </>
        )}

        {tab === "rules" && (
          <div className="flex flex-col gap-4">
            <fieldset className="m-0 flex flex-col gap-1.5 rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-sm font-medium">{t.rule}</legend>
              {RULES.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="rule" value={r} checked={config.scoring.rule === r} onChange={() => setScoring({ rule: r as Rule })} />
                  {t.rules[r]}
                </label>
              ))}
            </fieldset>
            <div className="flex flex-wrap gap-6">
              {numberField(config.scoring.rule === "exact" ? t.toleranceExact : t.tolerance, "tolerance", 0, 50)}
              {config.scoring.rule === "overlap" && numberField(t.minOverlap, "minOverlap", 1, 100)}
            </div>
            <div className="flex flex-wrap gap-6">
              {numberField(t.points, "points", 0, 100)}
              {numberField(t.partial, "partial", 0, 100, t.partialHelp)}
              {numberField(t.penalty, "penalty", 0, 100)}
            </div>
            <p className="m-0 text-sm text-slate-600">
              {t.limitsNote(item.snap === "sentence" ? t.snapSentence : t.snapWord,
                item.maxMarks ? t.maxMarksIs(num(item.maxMarks)) : t.noMaxMarks,
                item.maxLength ? t.maxLength(num(item.maxLength)) : t.noMaxLength)}
            </p>
          </div>
        )}
      </div>

      <p className="m-0 text-sm font-medium text-slate-700" data-testid="summary">
        {t.summary(num(config.key.length), num(config.key.length * config.scoring.points))}
      </p>
      {problems.length > 0 && (
        <ul className="m-0 list-disc rounded-lg border border-amber-300 bg-amber-50 py-2 ps-6 text-sm text-amber-900" data-testid="problems">
          {problems.map((x) => <li key={x}>{x}</li>)}
        </ul>
      )}
    </div>
  );
};

export default Authoring;
