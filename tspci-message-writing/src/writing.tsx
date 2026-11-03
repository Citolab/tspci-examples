import { useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { Block, Limits, Run, blocks, countChars, countWords, format } from "./message";
import { Texts } from "./texts";

// What every environment shares: the text box with its formatting toolbar, the word and character count, the
// spellcheck switch, and formatted text (a mail, a post) rendered without innerHTML.

export const btn =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600";
export const primary =
  "inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600";
export const input =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-2 focus:outline-sky-600/30 read-only:bg-slate-50";

const RunView = ({ run }: { run: Run }) => (run.bold ? <strong>{run.text}</strong> : run.italic ? <em>{run.text}</em> : <>{run.text}</>);
const Line = ({ runs }: { runs: Run[] }) => <>{runs.map((r, i) => <RunView key={i} run={r} />)}</>;

/** Text with **bold**, *italic* and "- " lists, as paragraphs and lists. */
export const Rich = ({ text, className = "", lang }: { text: string; className?: string; lang?: string }) => (
  <div lang={lang} className={`flex flex-col gap-2 text-[15px] leading-relaxed text-slate-800 ${className}`}>
    {blocks(text).map((b: Block, i) =>
      b.type === "p" ? (
        <p key={i} className="m-0">
          {b.lines.map((l, j) => (
            <span key={j}>
              {j > 0 && <br />}
              <Line runs={l} />
            </span>
          ))}
        </p>
      ) : (
        <ul key={i} className="m-0 list-disc pl-6">
          {b.items.map((l, j) => <li key={j}><Line runs={l} /></li>)}
        </ul>
      )
    )}
  </div>
);

/** The word and character count, with the limits; over a limit it says so in words (and a sign), not in colour only. */
export const Counter = ({ text, limits, t, id, show }: { text: string; limits: Limits; t: Texts; id: string; show: boolean }) => {
  const words = countWords(text);
  const chars = countChars(text);
  const { minWords, maxWords, maxChars } = limits;
  const range = t.wordRange(minWords, maxWords);
  const over = maxChars !== undefined && chars > maxChars;
  const notes: { text: string; warn: boolean }[] = [];
  if (words && minWords && words < minWords) notes.push({ text: t.tooFew(minWords - words), warn: true });
  if (maxWords && words > maxWords) notes.push({ text: t.tooMany(words - maxWords), warn: true });
  if (over) notes.push({ text: t.charsOver(chars - maxChars!), warn: true });
  if (!show && !range && maxChars === undefined) return <span id={id} hidden />;
  return (
    <div id={id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-600" data-testid="counter">
      {range && <span>{range}</span>}
      {show && <span data-testid="words">{t.words(words)}</span>}
      {(show || maxChars !== undefined) && (
        <span data-testid="chars" className={over ? "font-semibold text-orange-800" : ""}>
          {maxChars !== undefined ? t.charsOf(chars, maxChars) : t.chars(chars)}
        </span>
      )}
      {maxChars !== undefined && (
        <span aria-hidden="true" className="relative h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
          <span className={`absolute inset-y-0 left-0 rounded-full ${over ? "bg-orange-600" : "bg-sky-600"}`} style={{ width: `${Math.min(100, (chars / maxChars) * 100)}%` }} />
        </span>
      )}
      {show && notes.map((n) => (
        <span key={n.text} className="inline-flex items-center gap-1 font-semibold text-orange-800" data-testid="limit-note">
          <span aria-hidden="true">▲</span>
          {n.text}
        </span>
      ))}
    </div>
  );
};

/** The spellcheck switch (data-spellcheck="toggle"). */
export const SpellToggle = ({ on, onChange, t, disabled }: { on: boolean; onChange: (on: boolean) => void; t: Texts; disabled?: boolean }) => (
  <button type="button" className={`${btn} px-2 py-1 text-[13px]`} aria-pressed={on} disabled={disabled} onClick={() => onChange(!on)}>
    <span aria-hidden="true" className={`inline-block h-3.5 w-6 rounded-full p-0.5 transition-colors motion-reduce:transition-none ${on ? "bg-sky-700" : "bg-slate-300"}`}>
      <span className={`block h-2.5 w-2.5 rounded-full bg-white transition-transform motion-reduce:transition-none ${on ? "translate-x-2.5" : ""}`} />
    </span>
    {t.spellcheck}
    <span className="sr-only">{on ? "✓" : ""}</span>
  </button>
);

type Kind = "bold" | "italic" | "list";

/**
 * The text box. With `formatting`, a toolbar (bold, italic, list, preview; the arrow keys move in it) and Ctrl+B /
 * Ctrl+I. The text keeps the marks (**bold**, *italic*, "- "); the preview and the response's html show them.
 */
export const Editor = ({
  id, label, value, onChange, t, lang, spellcheck, readOnly, rows = 8, formatting, describedBy, onKeyDown, placeholder, labelHidden,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (text: string) => void;
  t: Texts;
  lang: string;
  spellcheck: boolean;
  readOnly?: boolean;
  rows?: number;
  formatting?: boolean;
  describedBy?: string;
  onKeyDown?: (e: JSX.TargetedKeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  labelHidden?: boolean;
}) => {
  const area = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const [focus, setFocus] = useState(0);
  const tools: { kind: Kind | "preview"; label: string; icon: string; keys?: string }[] = [
    { kind: "bold", label: t.bold, icon: "B", keys: "Control+B" },
    { kind: "italic", label: t.italic, icon: "I", keys: "Control+I" },
    { kind: "list", label: t.list, icon: "•≡" },
    { kind: "preview", label: t.preview, icon: "👁" },
  ];
  const apply = (kind: Kind) => {
    const el = area.current;
    if (!el || readOnly) return;
    const r = format(value, el.selectionStart ?? value.length, el.selectionEnd ?? value.length, kind);
    onChange(r.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.start, r.end);
    });
  };
  const keys = (e: JSX.TargetedKeyboardEvent<HTMLTextAreaElement>) => {
    if (formatting && (e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "b" || e.key === "i" || e.key === "B" || e.key === "I")) {
      e.preventDefault();
      apply(e.key.toLowerCase() === "b" ? "bold" : "italic");
      return;
    }
    onKeyDown?.(e);
  };
  const toolbarKeys = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(e.currentTarget.querySelectorAll("button"));
    const at = Math.max(0, buttons.indexOf(e.target as HTMLButtonElement));
    const move = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const to = e.key === "Home" ? 0 : e.key === "End" ? tools.length - 1 : move ? (at + move + tools.length) % tools.length : -1;
    if (to < 0) return;
    e.preventDefault();
    setFocus(to);
    buttons[to]?.focus();
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelHidden ? "sr-only" : "text-[13px] font-medium text-slate-600"}>{label}</label>
      {formatting && !readOnly && (
        <div role="toolbar" aria-label={t.formatting} aria-controls={id} className="flex gap-1" onKeyDown={toolbarKeys}>
          {tools.map((tool, i) => (
            <button
              key={tool.kind}
              type="button"
              tabIndex={i === focus ? 0 : -1}
              aria-keyshortcuts={tool.keys}
              aria-pressed={tool.kind === "preview" ? preview : undefined}
              title={tool.keys ? `${tool.label} (${tool.keys.replace("Control", "Ctrl")})` : tool.label}
              className={`${btn} min-w-9 justify-center px-2 py-1 ${tool.kind === "bold" ? "font-bold" : tool.kind === "italic" ? "italic font-serif" : ""}`}
              onFocus={() => setFocus(i)}
              onMouseDown={(e) => tool.kind !== "preview" && e.preventDefault()}
              onClick={() => (tool.kind === "preview" ? setPreview(!preview) : apply(tool.kind))}
            >
              <span aria-hidden="true">{tool.icon}</span>
              <span className="sr-only">{tool.label}</span>
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={area}
        id={id}
        value={value}
        rows={rows}
        lang={lang}
        spellcheck={spellcheck}
        readOnly={readOnly}
        placeholder={placeholder}
        aria-describedby={describedBy}
        className={`${input} min-h-16 resize-y font-sans leading-relaxed`}
        onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
        onKeyDown={keys}
      />
      {formatting && preview && (
        <section aria-label={t.previewOf} className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3" data-testid="preview">
          {value.trim() ? <Rich text={value} /> : <p className="m-0 text-sm text-slate-500">{t.nothingYet}</p>}
        </section>
      )}
    </div>
  );
};

/** The aids under a text box: the count and, with data-spellcheck="toggle", the switch. */
export const Aids = ({ text, limits, t, id, showCount, spell }: {
  text: string; limits: Limits; t: Texts; id: string; showCount: boolean; spell?: { on: boolean; onChange: (on: boolean) => void };
}) => (
  <div className="flex flex-wrap items-center justify-between gap-2" role="group" aria-label={t.writingAids}>
    <Counter text={text} limits={limits} t={t} id={id} show={showCount} />
    {spell && <SpellToggle on={spell.on} onChange={spell.onChange} t={t} />}
  </div>
);

/** A file name with an icon by its extension. */
export const FileIcon = ({ name }: { name: string }) => {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  const kind = ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext) ? "🖼" : ext === "pdf" ? "📕" : ["doc", "docx", "odt", "txt"].includes(ext) ? "📄" : ["xls", "xlsx", "csv"].includes(ext) ? "📊" : "📎";
  return <span aria-hidden="true">{kind}</span>;
};

/** An avatar: initials in a circle of the person's colour (the name is always next to it). */
export const Avatar = ({ name, color, size = 9 }: { name: string; color?: string; size?: number }) => {
  const initials = name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white`}
      style={{ background: color || "#475569", width: `${size * 4}px`, height: `${size * 4}px` }}>
      {initials || "?"}
    </span>
  );
};
