// The logic of the text marker, without imports (node runs test/marker.test.ts on this file as it is): the source text
// and its words, the categories, the marks and their limits, the response string and the scoring against the key.

/** Snap a mark to whole words (always) or to whole sentences. */
export type Snap = "word" | "sentence";
/** A marked span: word indexes (from 0, both included) and the id of its category. */
export type Mark = { start: number; end: number; category: string };

/** A piece of a paragraph as it is shown: part of a word (word ≥ 0) or of the text between words (word -1). */
export type Piece = {
  text: string;
  bold: boolean;
  italic: boolean;
  /** the index of the word, or -1 between words */
  word: number;
  /** between words: the word before and after (-1 at the edges of the text) */
  prev: number;
  next: number;
  /** punctuation stuck to the word before it ("word," "word."): marked with that word */
  attached: boolean;
  /** a line break inside a paragraph */
  br: boolean;
};
export type Paragraph = { pieces: Piece[]; text: string; firstWord: number; lastWord: number };
export type Word = { text: string; paragraph: number; sentence: number };
export type Doc = { paragraphs: Paragraph[]; words: Word[]; sentences: { start: number; end: number }[] };

// ---------------------------------------------------------------------------------------------------------------------
// The source text: paragraphs (an empty line between them), a line break as a line break, **bold** and *italic*.

type Run = { text: string; bold: boolean; italic: boolean };

/** The runs of a paragraph: `**bold**`, `*italic*` or `_italic_`, `\*` for a star. A marker that opens must touch a word. */
export const parseInline = (source: string): Run[] => {
  const runs: Run[] = [];
  let bold = false, italic = false, text = "";
  const flush = () => {
    if (text) runs.push({ text, bold, italic });
    text = "";
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === "\\" && (source[i + 1] === "*" || source[i + 1] === "_" || source[i + 1] === "\\")) {
      text += source[++i];
      continue;
    }
    if (c === "*" || c === "_") {
      const double = c === "*" && source[i + 1] === "*";
      const width = double ? 2 : 1;
      const before = source[i - 1] ?? " ", after = source[i + width] ?? " ";
      const on = double ? bold : italic;
      // opens before a non-space, closes after a non-space; an underscore inside a word stays (snake_case)
      const opens = !on && /\S/.test(after) && (c === "*" || /[\s([{"'“‘]|^$/.test(before));
      const closes = on && /\S/.test(before) && (c === "*" || /[\s)\]}.,;:!?"'”’]/.test(after));
      if (opens || closes) {
        // only open when the marker closes somewhere in this paragraph
        if (opens && source.indexOf(double ? "**" : c, i + width) < 0) {
          text += source.slice(i, i + width);
          i += width - 1;
          continue;
        }
        flush();
        if (double) bold = !bold;
        else italic = !italic;
        i += width - 1;
        continue;
      }
    }
    text += c;
  }
  flush();
  return runs;
};

/** The text without markup: paragraphs split on empty lines. */
export const paragraphsOf = (markup: string): string[] =>
  (markup ?? "").replace(/\r\n?/g, "\n").split(/\n[ \t]*\n+/).map((p) => p.replace(/^\n+|\n+$/g, "")).filter((p) => p.trim() !== "");

type Segment = { start: number; end: number; word: boolean };

const WORD = /[\p{L}\p{M}\p{N}]+(?:['’\-.][\p{L}\p{M}\p{N}]+)*/gu;
/** Word segments with Intl.Segmenter, or a regular expression (letters, marks and digits) without it. */
export const wordSegments = (text: string, language = "", useSegmenter = true): Segment[] => {
  const Seg = useSegmenter ? (Intl as any).Segmenter : undefined;
  let found: Segment[] = [];
  if (Seg) {
    let seg: any;
    try {
      seg = new Seg(language || undefined, { granularity: "word" });
    } catch {
      seg = new Seg(undefined, { granularity: "word" });
    }
    for (const s of seg.segment(text)) {
      if (s.isWordLike) found.push({ start: s.index, end: s.index + s.segment.length, word: true });
    }
    // one word for "well-known", "l'école", "don't" and "8.30", as without the segmenter
    const merged: Segment[] = [];
    for (const s of found) {
      const last = merged[merged.length - 1];
      if (last && s.start - last.end === 1 && /['’\-.]/.test(text[last.end])) last.end = s.end;
      else merged.push({ ...s });
    }
    found = merged;
  } else {
    for (const m of text.matchAll(WORD)) found.push({ start: m.index!, end: m.index! + m[0].length, word: true });
  }
  return found;
};

/** The offsets where a sentence starts, with Intl.Segmenter or after . ! ? … and a space. */
export const sentenceStarts = (text: string, language = "", useSegmenter = true): number[] => {
  const Seg = useSegmenter ? (Intl as any).Segmenter : undefined;
  if (Seg) {
    let seg: any;
    try {
      seg = new Seg(language || undefined, { granularity: "sentence" });
    } catch {
      seg = new Seg(undefined, { granularity: "sentence" });
    }
    return [...seg.segment(text)].map((s: any) => s.index);
  }
  const starts = [0];
  const end = /[.!?…]+["'”’)\]]*\s+|\n/g;
  for (const m of text.matchAll(end)) starts.push(m.index! + m[0].length);
  return starts;
};

/** The source text as paragraphs of pieces, with every word numbered from 0 through the whole text. */
export const parseText = (markup: string, language = "", useSegmenter = true): Doc => {
  const paragraphs: Paragraph[] = [];
  const words: Word[] = [];
  const sentences: { start: number; end: number }[] = [];
  paragraphsOf(markup).forEach((source, p) => {
    const runs = parseInline(source);
    const text = runs.map((r) => r.text).join("");
    const segments = wordSegments(text, language, useSegmenter);
    const starts = sentenceStarts(text, language, useSegmenter);
    const firstWord = words.length;
    let sentence = -1, lastStart = -1;
    for (const s of segments) {
      // the sentence the word starts in
      let k = 0;
      while (k + 1 < starts.length && starts[k + 1] <= s.start) k++;
      if (k !== lastStart) {
        lastStart = k;
        sentence = sentences.length;
        sentences.push({ start: words.length, end: words.length });
      }
      sentences[sentence].end = words.length;
      words.push({ text: text.slice(s.start, s.end), paragraph: p, sentence });
    }
    // the pieces: split at run boundaries, word boundaries, and between punctuation and spaces
    const cuts = new Set<number>([0, text.length]);
    let at = 0;
    for (const r of runs) cuts.add((at += r.text.length));
    for (const s of segments) {
      cuts.add(s.start);
      cuts.add(s.end);
    }
    for (let i = 1; i < text.length; i++) {
      if (/\s/.test(text[i]) !== /\s/.test(text[i - 1]) || text[i] === "\n" || text[i - 1] === "\n") cuts.add(i);
    }
    const sorted = [...cuts].sort((a, b) => a - b);
    const pieces: Piece[] = [];
    const runAt = (offset: number) => {
      let pos = 0;
      for (const r of runs) {
        if (offset < pos + r.text.length) return r;
        pos += r.text.length;
      }
      return runs[runs.length - 1];
    };
    let w = 0;
    for (let i = 0; i + 1 < sorted.length; i++) {
      const a = sorted[i], b = sorted[i + 1];
      if (a === b) continue;
      while (w < segments.length && segments[w].end <= a) w++;
      const inWord = w < segments.length && segments[w].start <= a && a < segments[w].end;
      const run = runAt(a);
      const piece = text.slice(a, b);
      const index = inWord ? firstWord + w : -1;
      // between words: the words on either side within this paragraph
      const prev = inWord || w === 0 ? -1 : firstWord + w - 1;
      const next = inWord || w >= segments.length ? -1 : firstWord + w;
      const before = pieces[pieces.length - 1];
      pieces.push({
        text: piece, bold: run?.bold ?? false, italic: run?.italic ?? false, word: index, prev, next,
        attached: !inWord && !/\s/.test(piece) && !!before && (before.word >= 0 || before.attached), br: piece === "\n",
      });
    }
    paragraphs.push({ pieces, text, firstWord, lastWord: words.length - 1 });
  });
  return { paragraphs, words, sentences };
};

/** "rtl" when the first letter with a direction is Hebrew, Arabic, Syriac, Thaana or N'Ko; else "ltr". */
export const detectDirection = (text: string): "ltr" | "rtl" => {
  const m = /[֐-ࣿיִ-﷿ﹰ-﻿]|[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/.exec(text ?? "");
  return m && /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(m[0]) ? "rtl" : "ltr";
};

/**
 * Where words moved when the author edited the text: the words before and after the change keep their place, a mark
 * inside the changed part is dropped (or shortened to what is left of it).
 */
export const remapMarks = (before: string[], after: string[], marks: Mark[]): Mark[] => {
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let s = 0;
  while (s < before.length - p && s < after.length - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  const shift = after.length - before.length;
  const tail = before.length - s; // the first old index of the common tail
  const map = (i: number) => (i < p ? i : i >= tail ? i + shift : -1);
  const out: Mark[] = [];
  for (const m of marks) {
    let start = m.start, end = m.end;
    while (start <= m.end && map(start) < 0) start++;
    while (end >= start && map(end) < 0) end--;
    if (start > end || m.end >= before.length) continue;
    out.push({ start: map(start), end: map(end), category: m.category });
  }
  return out;
};

// ---------------------------------------------------------------------------------------------------------------------
// Categories

export const COLORS = ["yellow", "blue", "orange", "purple", "green", "red"] as const;
export const PATTERNS = ["highlight", "underline", "box", "double", "stripes", "dotted"] as const;
export type Color = (typeof COLORS)[number];
export type Pattern = (typeof PATTERNS)[number];
export type Category = { id: string; name: string; short: string; color: Color; pattern: Pattern };
export const MAX_CATEGORIES = 6;

const shortOf = (name: string, i: number) => {
  const letters = (name ?? "").trim().match(/[\p{L}\p{N}]/u);
  return letters ? letters[0].toUpperCase() : String.fromCharCode(65 + i);
};
const ID = /^[a-z][a-z0-9]{0,7}$/;

/**
 * The categories: JSON from the authoring mode (`[{ "id": "a", "name": "Argument", "short": "A", "color": "yellow",
 * "pattern": "highlight" }]`), or names, one per line or separated by `;`, optionally `name | pattern | color`.
 * Ids are a, b, c… unless given; colours and patterns follow the order unless given.
 */
export const parseCategories = (value: string, fallback: Category[] = []): Category[] => {
  const text = (value ?? "").trim();
  if (!text) return fallback;
  let raw: Partial<Category>[] = [];
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) raw = parsed.filter((c) => c && typeof c === "object");
    } catch {
      return fallback;
    }
  } else {
    raw = text.split(/\n|;/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [name, a, b] = line.split("|").map((x) => x.trim().toLowerCase());
      const original = line.split("|")[0].trim();
      const pattern = [a, b].find((x) => (PATTERNS as readonly string[]).includes(x)) as Pattern | undefined;
      const color = [a, b].find((x) => (COLORS as readonly string[]).includes(x)) as Color | undefined;
      return { name: original || name, pattern, color };
    });
  }
  const used = new Set<string>();
  const out: Category[] = [];
  raw.slice(0, MAX_CATEGORIES).forEach((c, i) => {
    let id = typeof c.id === "string" && ID.test(c.id) && !used.has(c.id) ? c.id : "";
    for (let k = 0; !id; k++) {
      const candidate = String.fromCharCode(97 + ((i + k) % 26));
      if (!used.has(candidate)) id = candidate;
    }
    used.add(id);
    const name = typeof c.name === "string" && c.name.trim() ? c.name.trim() : `${String.fromCharCode(65 + i)}`;
    out.push({
      id, name,
      short: typeof c.short === "string" && c.short.trim() ? c.short.trim().slice(0, 3) : shortOf(name, i),
      color: (COLORS as readonly string[]).includes(c.color as string) ? (c.color as Color) : COLORS[i % COLORS.length],
      pattern: (PATTERNS as readonly string[]).includes(c.pattern as string) ? (c.pattern as Pattern) : PATTERNS[i % PATTERNS.length],
    });
  });
  return out.length ? out : fallback;
};

export const serializeCategories = (categories: Category[]) => JSON.stringify(categories);

// ---------------------------------------------------------------------------------------------------------------------
// Marks and the response string "12-18:a 40-44:b"

/** "12-18:a 40:b 3-5" → marks; a range without a category gets the first category. Word indexes count from 0. */
export const parseMarks = (value: string, firstCategory = "a"): Mark[] => {
  const marks: Mark[] = [];
  for (const token of String(value ?? "").trim().split(/[\s,]+/)) {
    const m = /^(\d+)(?:-(\d+))?(?::([a-z][a-z0-9]*))?$/.exec(token);
    if (!m) continue;
    const a = Number(m[1]), b = m[2] === undefined ? a : Number(m[2]);
    marks.push({ start: Math.min(a, b), end: Math.max(a, b), category: m[3] ?? firstCategory });
  }
  return sortMarks(marks);
};

export const sortMarks = (marks: Mark[]) => [...marks].sort((x, y) => x.start - y.start || x.end - y.end);

export const serializeMarks = (marks: Mark[]) => sortMarks(marks).map((m) => `${m.start}-${m.end}:${m.category}`).join(" ");

/** Only marks inside the text with a known category, without overlaps (the later of two overlapping marks goes). */
export const ownMarks = (marks: unknown, wordCount: number, categories: Category[]): Mark[] => {
  if (!Array.isArray(marks)) return [];
  const ids = new Set(categories.map((c) => c.id));
  const out: Mark[] = [];
  for (const m of marks as Mark[]) {
    if (!m || !Number.isInteger(m.start) || !Number.isInteger(m.end) || !ids.has(m.category)) continue;
    if (m.start < 0 || m.end >= wordCount || m.start > m.end) continue;
    if (out.some((o) => o.start <= m.end && m.start <= o.end)) continue;
    out.push({ start: m.start, end: m.end, category: m.category });
  }
  return sortMarks(out);
};

export const markAt = (marks: Mark[], word: number) => marks.find((m) => m.start <= word && word <= m.end);

/** A range from two words in any order, snapped to the sentences around them when the snap is "sentence". */
export const snapRange = (doc: Doc, a: number, b: number, snap: Snap): { start: number; end: number } => {
  let start = Math.max(0, Math.min(a, b)), end = Math.min(doc.words.length - 1, Math.max(a, b));
  if (snap === "sentence" && doc.words.length) {
    start = doc.sentences[doc.words[start].sentence].start;
    end = doc.sentences[doc.words[end].sentence].end;
  }
  return { start, end };
};

export type Limits = { maxMarks: number; maxLength: number };
export type MarkError = "tooMany" | "tooLong" | null;

/**
 * Adds a mark: it joins the marks of its own category that it overlaps, and cuts the words it covers out of marks of
 * other categories. Beyond the limits (0: none) nothing changes and the error says why.
 */
export const addMark = (marks: Mark[], mark: Mark, limits: Limits): { marks: Mark[]; error: MarkError } => {
  let { start, end } = mark;
  const rest: Mark[] = [];
  for (const m of marks) {
    const overlaps = m.start <= end && start <= m.end;
    if (!overlaps) rest.push(m);
    else if (m.category === mark.category) {
      start = Math.min(start, m.start);
      end = Math.max(end, m.end);
    } else {
      if (m.start < start) rest.push({ ...m, end: start - 1 });
      if (m.end > end) rest.push({ ...m, start: end + 1 });
    }
  }
  if (limits.maxLength > 0 && end - start + 1 > limits.maxLength) return { marks, error: "tooLong" };
  const next = sortMarks([...rest, { start, end, category: mark.category }]);
  if (limits.maxMarks > 0 && next.length > limits.maxMarks) return { marks, error: "tooMany" };
  return { marks: next, error: null };
};

export const removeMark = (marks: Mark[], word: number) => marks.filter((m) => !(m.start <= word && word <= m.end));

/** The words of a mark, for a list or a screen reader; long marks shortened in the middle. */
export const excerpt = (doc: Doc, m: { start: number; end: number }, max = 8) => {
  const words = doc.words.slice(m.start, m.end + 1).map((w) => w.text);
  return words.length <= max ? words.join(" ") : `${words.slice(0, max - 3).join(" ")} … ${words.slice(-2).join(" ")}`;
};

// ---------------------------------------------------------------------------------------------------------------------
// Scoring: per correct span (target) of the key

export type Rule = "overlap" | "all" | "exact";
export const RULES: Rule[] = ["overlap", "all", "exact"];
export type Scoring = {
  /** words a mark may stick out on each side of a target (and, for "exact", fall short) */
  tolerance: number;
  rule: Rule;
  /** "overlap": the part of the target's words the mark must cover, in percent */
  minOverlap: number;
  /** points for a target marked correctly */
  points: number;
  /** points for a target marked partly (overlapping, but not by the rule, or with another category) */
  partial: number;
  /** points off per extra mark: a mark that belongs to no target */
  penalty: number;
};
export const DEFAULT_SCORING: Scoring = { tolerance: 1, rule: "overlap", minOverlap: 75, points: 1, partial: 0, penalty: 0 };
export const MAX_TARGETS = 10;

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return v === "" || v === null || v === undefined || !Number.isFinite(n) ? fallback : Math.min(max, Math.max(min, n));
};

/** The scoring rules as JSON (the authoring mode writes them); missing or wrong values get the default. */
export const parseScoring = (value: string): Scoring => {
  let raw: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(value || "{}");
    if (parsed && typeof parsed === "object") raw = parsed;
  } catch {
    // the defaults
  }
  const d = DEFAULT_SCORING;
  return {
    tolerance: int(raw.tolerance, 0, 50, d.tolerance),
    rule: RULES.includes(raw.rule as Rule) ? (raw.rule as Rule) : d.rule,
    minOverlap: int(raw.minOverlap, 1, 100, d.minOverlap),
    points: int(raw.points, 0, 100, d.points),
    partial: int(raw.partial, 0, 100, d.partial),
    penalty: int(raw.penalty, 0, 100, d.penalty),
  };
};
export const serializeScoring = (s: Scoring) => JSON.stringify(s);

/** 2: the mark meets the rule with the right category; 1: it overlaps the target; 0: it does not touch it. */
export const hitLevel = (target: Mark, mark: Mark, s: Scoring): 0 | 1 | 2 => {
  const overlap = Math.min(target.end, mark.end) - Math.max(target.start, mark.start) + 1;
  if (overlap <= 0) return 0;
  const extraBefore = Math.max(0, target.start - mark.start), extraAfter = Math.max(0, mark.end - target.end);
  const length = target.end - target.start + 1;
  let ok: boolean;
  if (s.rule === "exact") ok = Math.abs(mark.start - target.start) <= s.tolerance && Math.abs(mark.end - target.end) <= s.tolerance;
  else if (s.rule === "all") ok = overlap === length && extraBefore <= s.tolerance && extraAfter <= s.tolerance;
  else ok = (overlap / length) * 100 >= s.minOverlap - 1e-9 && extraBefore <= s.tolerance && extraAfter <= s.tolerance;
  return ok && mark.category === target.category ? 2 : 1;
};

export type Evaluation = {
  score: number;
  maxscore: number;
  correct: boolean;
  /** marks that belong to no target */
  extra: number;
  /** per target: 2 correct, 1 partly, 0 missed */
  hits: (0 | 1 | 2)[];
  /** per target: the index of the mark that counts for it, or -1 */
  matched: number[];
};

/**
 * Every target gets at most one mark and every mark counts for at most one target: the best pairs first (correct
 * before partly, then the most overlap). Marks left over are extra.
 */
export const evaluate = (key: Mark[], marks: Mark[], s: Scoring): Evaluation => {
  const pairs: { t: number; m: number; level: number; overlap: number; distance: number }[] = [];
  key.forEach((t, ti) =>
    marks.forEach((m, mi) => {
      const level = hitLevel(t, m, s);
      const overlap = Math.min(t.end, m.end) - Math.max(t.start, m.start) + 1;
      if (level) pairs.push({ t: ti, m: mi, level, overlap, distance: Math.abs(m.start - t.start) + Math.abs(m.end - t.end) });
    })
  );
  pairs.sort((a, b) => b.level - a.level || b.overlap - a.overlap || a.distance - b.distance || a.t - b.t || a.m - b.m);
  const hits = key.map(() => 0 as 0 | 1 | 2);
  const matched = key.map(() => -1);
  const used = new Set<number>();
  for (const p of pairs) {
    if (matched[p.t] >= 0 || used.has(p.m)) continue;
    matched[p.t] = p.m;
    hits[p.t] = p.level as 1 | 2;
    used.add(p.m);
  }
  const extra = marks.length - used.size;
  const earned = hits.reduce((sum, h) => sum + (h === 2 ? s.points : h === 1 ? Math.min(s.partial, s.points) : 0), 0);
  return {
    score: Math.max(0, earned - extra * s.penalty),
    maxscore: key.length * s.points,
    correct: key.length > 0 && hits.every((h) => h === 2) && extra === 0,
    extra,
    hits,
    matched,
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// The example: an opinion text with a main argument and signal words of contrast

export const EXAMPLE_TEXT = `**Should school start later?**

Most secondary schools start at half past eight. Many teenagers find that far too early, and sleep researchers agree with them. During puberty the body clock shifts: teenagers get sleepy later in the evening and wake up later in the morning.

A few schools have tried a later start. Their pupils slept longer, were late less often and felt *more alert* in the first lessons. However, not every result was positive. Sports clubs and part-time jobs did not move with the timetable, so some pupils lost their free afternoons.

I am convinced that schools should start at ten o'clock, because pupils who have slept well learn more. Still, a later start only works when clubs and employers change their hours too. Nevertheless, it is worth a try.`;

export const EXAMPLE_CATEGORIES: Category[] = [
  { id: "a", name: "Main argument", short: "A", color: "yellow", pattern: "highlight" },
  { id: "b", name: "Contrast word", short: "C", color: "blue", pattern: "underline" },
];

/** The key of the example: the sentence with the main argument, and the three words that signal a contrast. */
export const EXAMPLE_KEY = "69-69:b 93-110:a 111-111:b 125-125:b";

/** The one category of a text without categories; the PCI shows its name in the candidate's language. */
export const DEFAULT_CATEGORY: Category = { id: "a", name: "", short: "", color: "yellow", pattern: "highlight" };

export type Setup = { text: string; categories: Category[]; key: Mark[]; doc: Doc; scoring: Scoring };

/**
 * The text, categories, key and scoring from the settings. Without a text: the example, with its categories and key.
 * Without categories: one category. Key marks outside the text or with an unknown category are left out.
 */
export const resolveSetup = (
  p: { text?: string; categories?: string; key?: string; scoring?: string },
  language = "",
  useSegmenter = true
): Setup => {
  const example = !(p.text ?? "").trim();
  const text = example ? EXAMPLE_TEXT : p.text!;
  const categories = parseCategories(p.categories ?? "", example ? EXAMPLE_CATEGORIES : [DEFAULT_CATEGORY]);
  const doc = parseText(text, language, useSegmenter);
  const keyText = (p.key ?? "").trim() ? p.key! : example ? EXAMPLE_KEY : "";
  const key = ownMarks(parseMarks(keyText, categories[0].id), doc.words.length, categories).slice(0, MAX_TARGETS);
  return { text, categories, key, doc, scoring: parseScoring(p.scoring ?? "") };
};
