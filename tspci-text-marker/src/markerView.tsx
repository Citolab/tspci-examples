import { Fragment } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Category, Doc, Limits, Mark, Snap, addMark, excerpt, markAt, removeMark, snapRange } from "./marker";
import { Texts, formatNumber } from "./texts";

// The marking surface, for the candidate (interaction.tsx) and for the author's correct marks (authoring.tsx): the
// markers, the text with its word cursor and selection, a live status line and the list of marks.

let ids = 0;

export const categoryName = (c: Category, t: Texts) => c.name || t.defaultCategory;

/** A small sample of a category's look: its colour, its pattern and its label. */
export const Swatch = ({ category, t, label = true }: { category: Category; t: Texts; label?: boolean }) => (
  <span className="inline-flex items-center gap-1" aria-hidden="true">
    {label && <span className={`tm-tag tm-c-${category.color}`}>{category.short || categoryName(category, t).slice(0, 1).toUpperCase()}</span>}
    <span className={`tm-m tm-${category.pattern} tm-c-${category.color} tm-first tm-last rounded-sm px-0.5 text-[13px]`}>Abc</span>
  </span>
);

type Props = {
  doc: Doc;
  categories: Category[];
  marks: Mark[];
  onChange: (marks: Mark[]) => void;
  t: Texts;
  limits: Limits;
  snap: Snap;
  readOnly?: boolean;
  /** "ltr" or "rtl": the arrow keys follow the reading direction */
  direction: "ltr" | "rtl";
  /** the language of the source text (lang attribute) */
  textLanguage: string;
  showLabels: boolean;
  /** the text scrolls beyond this height (px); 0: no limit */
  maxHeight?: number;
  /** the accessible name of the text */
  label: string;
  listHeading: string;
};

const button =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-700";

const MarkerView = (p: Props) => {
  const { doc, categories, marks, t, limits, snap, readOnly, direction } = p;
  const [uid] = useState(() => `tm${++ids}`);
  const [active, setActive] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [announce, setAnnounce] = useState("");
  const [help, setHelp] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; moved: boolean; start: number } | null>(null);
  const pendingTap = useRef(false);
  const lastPointer = useRef("mouse");
  const total = doc.words.length;
  const num = (n: number) => formatNumber(t, n);
  const category = categories[Math.min(active, categories.length - 1)];
  const nameOf = (id: string) => {
    const c = categories.find((x) => x.id === id);
    return c ? categoryName(c, t) : id;
  };

  // the mark per word, for painting
  const markIndex = useMemo(() => {
    const index = new Array<number>(total).fill(-1);
    marks.forEach((m, i) => {
      for (let w = m.start; w <= m.end && w < total; w++) index[w] = i;
    });
    return index;
  }, [marks, total]);

  const selection = cursor === null ? null : snapRange(doc, anchor ?? cursor, cursor, snap);
  const extended = anchor !== null && cursor !== null && anchor !== cursor;

  // keep the cursor in view
  useEffect(() => {
    if (cursor === null) return;
    const el = textRef.current?.querySelector<HTMLElement>(`[data-w="${cursor}"]`);
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [cursor]);

  const describeCursor = (w: number) => {
    const m = markAt(marks, w);
    return t.cursor(doc.words[w].text, num(w + 1), num(total), m ? nameOf(m.category) : null);
  };
  const moveTo = (w: number, extend: boolean) => {
    const next = Math.max(0, Math.min(total - 1, w));
    if (!extend) setAnchor(next);
    else if (anchor === null) setAnchor(cursor ?? next);
    setCursor(next);
    if (extend) {
      const r = snapRange(doc, anchor ?? cursor ?? next, next, snap);
      const n = r.end - r.start + 1;
      setAnnounce(t.selected(num(n), n !== 1, excerpt(doc, r)));
    } else setAnnounce(describeCursor(next));
  };

  const say = (message: string) => {
    setStatus(message);
    setAnnounce("");
  };

  const chooseCategory = (i: number) => {
    if (!categories[i]) return;
    setActive(i);
    say(t.chosen(categoryName(categories[i], t)));
  };

  /** Marks the words from a to b (snapped), or changes the category of the mark under a single word. */
  const markRange = (a: number, b: number) => {
    if (readOnly) return say(t.readOnly);
    const single = a === b ? markAt(marks, a) : undefined;
    if (single) {
      if (single.category === category.id) return say(t.already(categoryName(category, t)));
      onChangeMarks(marks.map((m) => (m === single ? { ...m, category: category.id } : m)));
      say(t.changed(categoryName(category, t), excerpt(doc, single)));
    } else {
      const range = snapRange(doc, a, b, snap);
      const result = addMark(marks, { ...range, category: category.id }, limits);
      if (result.error === "tooMany") return say(t.tooMany(num(limits.maxMarks)));
      if (result.error === "tooLong") return say(t.tooLong(num(limits.maxLength)));
      onChangeMarks(result.marks);
      say(t.marked(categoryName(category, t), excerpt(doc, range)));
    }
    setAnchor(b);
    setCursor(b);
    pendingTap.current = false;
  };
  const onChangeMarks = (next: Mark[]) => p.onChange(next);

  const removeAt = (w: number | null) => {
    if (readOnly) return say(t.readOnly);
    const m = w === null ? undefined : markAt(marks, w) ?? (selection ? marks.find((x) => x.start <= selection.end && selection.start <= x.end) : undefined);
    if (!m) return say(t.notMarked);
    onChangeMarks(removeMark(marks, m.start));
    say(t.removed(excerpt(doc, m)));
  };

  const markSelection = () => {
    if (cursor === null) return;
    markRange(anchor ?? cursor, cursor);
  };

  // --- pointer: drag to mark, click to place the cursor, Shift-click to select, double-click a word; touch: tap, tap, tap

  const wordAt = (x: number, y: number): number | null => {
    const root = textRef.current?.getRootNode() as Document | ShadowRoot | undefined;
    const el = (root as any)?.elementFromPoint?.(x, y) as Element | null;
    const w = el?.closest?.("[data-w]")?.getAttribute("data-w");
    return w === undefined || w === null ? null : Number(w);
  };
  const wordOf = (e: Event) => {
    const w = (e.target as Element)?.closest?.("[data-w]")?.getAttribute("data-w");
    return w === undefined || w === null ? null : Number(w);
  };

  const onPointerDown = (e: PointerEvent) => {
    lastPointer.current = e.pointerType;
    const w = wordOf(e);
    if (w === null || e.button > 0) return;
    e.preventDefault();
    textRef.current?.focus({ preventScroll: true });
    if (e.pointerType === "touch") {
      if (!readOnly && pendingTap.current && cursor !== null) {
        const r = snapRange(doc, anchor ?? cursor, cursor, snap);
        if (w >= r.start && w <= r.end) return markRange(anchor ?? cursor, cursor);
        return moveTo(w, true);
      }
      pendingTap.current = true;
      return moveTo(w, false);
    }
    if (e.shiftKey && cursor !== null) return moveTo(w, true);
    moveTo(w, false);
    if (readOnly) return;
    drag.current = { id: e.pointerId, moved: false, start: w };
    try {
      textRef.current?.setPointerCapture?.(e.pointerId);
    } catch {
      // a synthetic event without an active pointer
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    const w = wordAt(e.clientX, e.clientY) ?? wordOf(e);
    if (w === null || (w === drag.current.start && !drag.current.moved)) return;
    drag.current.moved = true;
    setCursor(w);
  };
  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    const w = wordAt(e.clientX, e.clientY) ?? wordOf(e) ?? cursor;
    if (d.moved && w !== null && w !== d.start) {
      setCursor(w);
      markRange(d.start, w);
    }
  };
  const onDblClick = (e: MouseEvent) => {
    if (lastPointer.current === "touch") return;
    const w = wordOf(e) ?? wordAt(e.clientX, e.clientY);
    if (w === null) return;
    e.preventDefault();
    setAnchor(w);
    setCursor(w);
    markRange(w, w);
  };

  // --- keyboard

  /** The word on the line above or below, nearest to the cursor's place on its line. */
  const lineMove = (from: number, down: boolean): number => {
    const els = textRef.current?.querySelectorAll<HTMLElement>("[data-w]");
    const rectOf = (w: number) => {
      const el = textRef.current?.querySelector<HTMLElement>(`[data-w="${w}"]`);
      return el?.getClientRects?.()[0];
    };
    const here = rectOf(from);
    if (!els || !here || !here.height) return from + (down ? 1 : -1);
    const x = here.left + here.width / 2;
    let line: number | null = null, best = from, bestDistance = Infinity;
    for (let w = from + (down ? 1 : -1); w >= 0 && w < total; w += down ? 1 : -1) {
      const r = rectOf(w);
      if (!r) continue;
      const otherLine = down ? r.top > here.top + here.height / 2 : r.bottom < here.bottom - here.height / 2;
      if (!otherLine) continue;
      if (line === null) line = r.top;
      if (Math.abs(r.top - line) > here.height / 2) break;
      const d = Math.abs(r.left + r.width / 2 - x);
      if (d < bestDistance) {
        bestDistance = d;
        best = w;
      }
    }
    return line === null ? (down ? total - 1 : 0) : best;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!total) return;
    const at = cursor ?? 0;
    const forward = direction === "rtl" ? "ArrowLeft" : "ArrowRight";
    const back = direction === "rtl" ? "ArrowRight" : "ArrowLeft";
    const paragraph = doc.paragraphs[doc.words[at].paragraph];
    const handled = () => e.preventDefault();
    if (cursor === null && ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
      handled();
      return moveTo(0, false);
    }
    switch (e.key) {
      case forward:
        handled();
        return moveTo(at + 1, e.shiftKey);
      case back:
        handled();
        return moveTo(at - 1, e.shiftKey);
      case "ArrowDown":
        handled();
        return moveTo(lineMove(at, true), e.shiftKey);
      case "ArrowUp":
        handled();
        return moveTo(lineMove(at, false), e.shiftKey);
      case "Home":
        handled();
        return moveTo(e.ctrlKey || e.metaKey ? 0 : paragraph.firstWord, e.shiftKey);
      case "End":
        handled();
        return moveTo(e.ctrlKey || e.metaKey ? total - 1 : paragraph.lastWord, e.shiftKey);
      case "Enter":
      case " ":
        handled();
        if (cursor === null) return moveTo(0, false);
        return markSelection();
      case "Delete":
      case "Backspace":
        handled();
        return removeAt(cursor);
      case "Escape":
        if (extended) {
          handled();
          setAnchor(cursor);
          setAnnounce(describeCursor(at));
        }
        return;
      default:
        if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && categories.length > 1) {
          handled();
          chooseCategory(Number(e.key) - 1);
        }
    }
  };

  const onFocus = () => {
    if (cursor === null && total) {
      setCursor(0);
      setAnchor(0);
      setAnnounce(describeCursor(0));
    }
  };

  // --- painting

  const pieceMark = (piece: Doc["paragraphs"][number]["pieces"][number]) => {
    if (piece.word >= 0) return markIndex[piece.word];
    if (piece.prev >= 0 && piece.next >= 0 && markIndex[piece.prev] >= 0 && markIndex[piece.prev] === markIndex[piece.next]) return markIndex[piece.prev];
    if (piece.attached && piece.prev >= 0) return markIndex[piece.prev];
    return -1;
  };
  const inSelection = (piece: Doc["paragraphs"][number]["pieces"][number]) => {
    if (!selection) return false;
    const inside = (w: number) => w >= selection.start && w <= selection.end;
    return piece.word >= 0 ? inside(piece.word) : piece.prev >= 0 && piece.next >= 0 && inside(piece.prev) && inside(piece.next);
  };

  // consecutive pieces with the same mark share one span, so fills and lines run on over the spaces
  const paragraphs = doc.paragraphs.map((para, pi) => {
    const marksHere = para.pieces.map(pieceMark);
    const selHere = para.pieces.map(inSelection);
    const groups: { k: number; from: number; to: number }[] = [];
    para.pieces.forEach((piece, i) => {
      const last = groups[groups.length - 1];
      const k = piece.br ? -2 : marksHere[i];
      if (last && last.k === k && k !== -2) last.to = i;
      else groups.push({ k, from: i, to: i });
    });
    return (
      <p key={pi} className="tm-p">
        {groups.map((g, gi) => {
          if (g.k === -2) return <br key={gi} />;
          const mark = g.k >= 0 ? marks[g.k] : undefined;
          const cat = mark ? categories.find((c) => c.id === mark.category) : undefined;
          const pieces = para.pieces.slice(g.from, g.to + 1);
          const first = !!mark && pieces.some((x) => x.word === mark.start);
          const last = !!mark && (groups[gi + 1]?.k ?? -1) !== g.k;
          const cls = [
            cat ? `tm-m tm-${cat.pattern} tm-c-${cat.color}` : "",
            first ? "tm-first" : "",
            last ? "tm-last" : "",
          ].filter(Boolean).join(" ");
          const inner = pieces.map((piece, j) => {
            const c = [
              piece.word >= 0 ? "tm-w" : "",
              piece.bold ? "font-semibold" : "",
              piece.italic ? "italic" : "",
              selHere[g.from + j] ? "tm-sel" : "",
              piece.word >= 0 && piece.word === cursor ? "tm-cursor" : "",
            ].filter(Boolean).join(" ");
            return (
              <span key={j} className={c || undefined} data-w={piece.word >= 0 ? piece.word : undefined}
                data-mark={piece.word >= 0 && mark ? mark.category : undefined}>
                {piece.text}
              </span>
            );
          });
          return (
            <Fragment key={gi}>
              {first && cat && p.showLabels && (
                <span className={`tm-tag tm-c-${cat.color}`} aria-hidden="true" data-testid="tag">{cat.short || categoryName(cat, t).slice(0, 1).toUpperCase()}</span>
              )}
              {first && cat && <span className="sr-only">[{t.startOf(categoryName(cat, t))}] </span>}
              {cls ? <span className={cls}>{inner}</span> : inner}
              {last && cat && <span className="sr-only"> [{t.endOf(categoryName(cat, t))}]</span>}
            </Fragment>
          );
        })}
      </p>
    );
  });

  const atCursor = cursor === null ? undefined : markAt(marks, cursor);
  const countText = t.count(num(marks.length), limits.maxMarks > 0 ? num(limits.maxMarks) : null, marks.length !== 1);

  return (
    <div className="flex flex-col gap-3">
      <div role="toolbar" aria-label={t.toolbar} className="flex flex-wrap items-center gap-2" data-testid="toolbar">
        {categories.length > 1 ? (
          <div role="radiogroup" aria-label={t.marker} className="flex flex-wrap gap-1.5">
            {categories.map((c, i) => (
              <button key={c.id} type="button" role="radio" aria-checked={i === active} disabled={readOnly}
                className={`${button} ${i === active ? "border-slate-800 bg-slate-100 font-semibold ring-1 ring-slate-800" : ""}`}
                onClick={() => chooseCategory(i)} data-testid={`category-${c.id}`}>
                <Swatch category={c} t={t} />
                <span>{categoryName(c, t)}</span>
                <kbd className="ms-1 hidden rounded border border-slate-300 px-1 text-[11px] text-slate-500 sm:inline" aria-hidden="true">{i + 1}</kbd>
              </button>
            ))}
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-700">
            <Swatch category={categories[0]} t={t} /> {categoryName(categories[0], t)}
          </span>
        )}
        {!readOnly && (
          <>
            <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />
            <button type="button" className={button} disabled={cursor === null} onClick={markSelection} data-testid="mark">{t.mark}</button>
            <button type="button" className={button} disabled={!atCursor} onClick={() => removeAt(cursor)} data-testid="remove">{t.remove}</button>
            <button type="button" className={button} disabled={!marks.length} data-testid="clear"
              onClick={() => {
                onChangeMarks([]);
                say(t.cleared);
              }}>
              {t.clear}
            </button>
          </>
        )}
        <button type="button" className={`${button} ms-auto`} aria-expanded={help} aria-controls={`${uid}-help`} onClick={() => setHelp(!help)}>{t.showHelp}</button>
      </div>
      <p id={`${uid}-help`} className={help ? "m-0 max-w-[75ch] rounded-lg bg-slate-50 p-3 text-sm text-slate-700" : "sr-only"}>
        {t.help}
        {snap === "sentence" ? ` ${t.helpSentence}` : ""}
      </p>

      <div ref={textRef} tabIndex={0} role="application" aria-roledescription={t.roleDescription} aria-label={p.label}
        aria-describedby={`${uid}-help ${uid}-limits`} lang={p.textLanguage || undefined} dir={direction}
        className={`tm-text ${readOnly ? "tm-readonly" : ""}`} data-testid="text"
        style={p.maxHeight ? { maxHeight: `${p.maxHeight}px`, overflowY: "auto" } : undefined}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => (drag.current = null)}
        onDblClick={onDblClick} onKeyDown={onKeyDown} onFocus={onFocus}>
        {paragraphs}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span id={`${uid}-limits`} className="text-slate-600" data-testid="count">
          {countText}
          {limits.maxLength > 0 ? ` · ${t.maxLength(num(limits.maxLength))}` : ""}
        </span>
        <span role="status" className="min-h-5 font-medium text-slate-800" data-testid="status">{status}</span>
      </div>
      <div className="sr-only" aria-live="polite" data-testid="announce">{announce}</div>

      <section aria-labelledby={`${uid}-list`} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <h3 id={`${uid}-list`} className="m-0 mb-2 text-sm font-semibold text-slate-700">{p.listHeading}</h3>
        {marks.length === 0 ? (
          <p className="m-0 text-sm text-slate-500">{t.noMarks}</p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="marks">
            {marks.map((m, i) => {
              const c = categories.find((x) => x.id === m.category)!;
              const words = m.end - m.start + 1;
              return (
                <li key={`${m.start}-${m.end}`} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-5 text-end tabular-nums text-slate-500" aria-hidden="true">{num(i + 1)}.</span>
                  {c && <Swatch category={c} t={t} />}
                  <button type="button" className="min-w-0 flex-1 truncate rounded px-1 text-start text-slate-800 hover:bg-white focus-visible:outline-2 focus-visible:outline-sky-700"
                    aria-label={t.goTo(num(i + 1), nameOf(m.category), excerpt(doc, m))} dir="auto"
                    onClick={() => {
                      textRef.current?.focus({ preventScroll: true });
                      setAnchor(m.start);
                      setCursor(m.end);
                      setAnnounce(t.selected(num(words), words !== 1, excerpt(doc, m)));
                    }}>
                    <span className="font-medium">{nameOf(m.category)}</span>
                    <span className="text-slate-600"> · “{excerpt(doc, m)}” · {t.words(num(words), words !== 1)}</span>
                  </button>
                  {!readOnly && (
                    <button type="button" className="rounded-md px-2 py-0.5 text-slate-500 hover:bg-white hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-sky-700"
                      aria-label={t.removeN(num(i + 1), excerpt(doc, m))}
                      onClick={() => {
                        onChangeMarks(marks.filter((x) => x !== m));
                        say(t.removed(excerpt(doc, m)));
                      }}>
                      ×
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
};

export default MarkerView;
