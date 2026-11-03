// npm test: the logic of the text marker (src/marker.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SCORING, EXAMPLE_CATEGORIES, EXAMPLE_KEY, EXAMPLE_TEXT, addMark, detectDirection, evaluate, excerpt, hitLevel,
  markAt, ownMarks, parseCategories, parseInline, parseMarks, parseScoring, parseText, remapMarks, removeMark,
  resolveSetup, serializeMarks, snapRange, type Mark, type Scoring,
} from "../src/marker.ts";

const words = (markup: string, segmenter = true, language = "en") => parseText(markup, language, segmenter).words.map((w) => w.text);
const s = (extra: Partial<Scoring> = {}): Scoring => ({ ...DEFAULT_SCORING, ...extra });
const m = (start: number, end: number, category = "a"): Mark => ({ start, end, category });

test("inline markup: bold, italic, escapes; a lone star stays a star", () => {
  assert.deepEqual(parseInline("a **bold** and *italic* word"), [
    { text: "a ", bold: false, italic: false }, { text: "bold", bold: true, italic: false }, { text: " and ", bold: false, italic: false },
    { text: "italic", bold: false, italic: true }, { text: " word", bold: false, italic: false },
  ]);
  assert.deepEqual(parseInline("5 * 3 = 15"), [{ text: "5 * 3 = 15", bold: false, italic: false }]);
  assert.deepEqual(parseInline("snake_case and \\*stars\\*"), [{ text: "snake_case and *stars*", bold: false, italic: false }]);
  assert.deepEqual(parseInline("_it_ ***both***").map((r) => [r.text, r.bold, r.italic]), [["it", false, true], [" ", false, false], ["both", true, true]]);
});

test("words are numbered through the whole text, across paragraphs and markup", () => {
  const doc = parseText("One **two** three.\n\nFour, *five*!\nSix", "en");
  assert.deepEqual(doc.words.map((w) => [w.text, w.paragraph]), [["One", 0], ["two", 0], ["three", 0], ["Four", 1], ["five", 1], ["Six", 1]]);
  assert.equal(doc.paragraphs.length, 2);
  assert.deepEqual([doc.paragraphs[1].firstWord, doc.paragraphs[1].lastWord], [3, 5]);
  const p = doc.paragraphs[1].pieces;
  assert.deepEqual(p.map((x) => x.text), ["Four", ",", " ", "five", "!", "\n", "Six"]);
  assert.equal(p[1].attached, true);
  assert.equal(p[2].attached, false);
  assert.equal(p[4].attached, true);
  assert.equal(p[5].br, true);
  assert.equal(p[3].italic, true);
  assert.deepEqual([p[2].prev, p[2].next], [3, 4]);
});

test("Intl.Segmenter and the fallback agree on hyphens, apostrophes and numbers", () => {
  const text = "The well-known café's hours: 8.30 to 17.00, l'école n'est pas loin.";
  assert.deepEqual(words(text, true), words(text, false));
  assert.deepEqual(words(text, true), ["The", "well-known", "café's", "hours", "8.30", "to", "17.00", "l'école", "n'est", "pas", "loin"]);
  assert.deepEqual(words(EXAMPLE_TEXT, true), words(EXAMPLE_TEXT, false));
});

test("right-to-left text: words and sentences, and the direction", () => {
  const hebrew = "שלום עולם. זה טקסט קצר.";
  assert.deepEqual(words(hebrew, true, "he"), ["שלום", "עולם", "זה", "טקסט", "קצר"]);
  assert.deepEqual(words(hebrew, false, "he"), words(hebrew, true, "he"));
  const arabic = "مرحبا بالعالم، هذا نص.";
  assert.deepEqual(words(arabic, true, "ar"), ["مرحبا", "بالعالم", "هذا", "نص"]);
  assert.equal(detectDirection(hebrew), "rtl");
  assert.equal(detectDirection("« " + arabic), "rtl");
  assert.equal(detectDirection("123 Hello שלום"), "ltr");
  const doc = parseText(hebrew, "he");
  assert.deepEqual(doc.sentences, [{ start: 0, end: 1 }, { start: 2, end: 4 }]);
});

test("sentences: with and without the segmenter", () => {
  for (const seg of [true, false]) {
    const doc = parseText("First one here. Second? Yes!\n\nNew paragraph", "en", seg);
    assert.deepEqual(doc.sentences, [{ start: 0, end: 2 }, { start: 3, end: 3 }, { start: 4, end: 4 }, { start: 5, end: 6 }], `segmenter ${seg}`);
    assert.deepEqual(snapRange(doc, 1, 1, "sentence"), { start: 0, end: 2 });
    assert.deepEqual(snapRange(doc, 4, 1, "sentence"), { start: 0, end: 4 });
    assert.deepEqual(snapRange(doc, 4, 1, "word"), { start: 1, end: 4 });
  }
});

test("the example: its words and key", () => {
  const setup = resolveSetup({});
  assert.equal(setup.doc.words.length, 131);
  assert.equal(serializeMarks(setup.key), EXAMPLE_KEY);
  assert.equal(excerpt(setup.doc, setup.key[1]), "I am convinced that schools … learn more");
  assert.equal(setup.doc.words[69].text, "However");
  assert.equal(setup.doc.words[125].text, "Nevertheless");
  assert.deepEqual(setup.categories, EXAMPLE_CATEGORIES);
  // an own text without a key or categories: no key, one category
  const own = resolveSetup({ text: "Just a text." });
  assert.deepEqual(own.key, []);
  assert.equal(own.categories.length, 1);
});

test("categories: JSON, names per line, ids, colours and patterns", () => {
  const c = parseCategories("Argument\nExample | dotted | green; Counter-argument");
  assert.deepEqual(c.map((x) => [x.id, x.name, x.short, x.color, x.pattern]), [
    ["a", "Argument", "A", "yellow", "highlight"], ["b", "Example", "E", "green", "dotted"], ["c", "Counter-argument", "C", "orange", "box"],
  ]);
  const j = parseCategories('[{"id":"arg","name":"Argument","color":"pink"},{"id":"arg","name":"Twice"}]');
  assert.deepEqual(j.map((x) => [x.id, x.color]), [["arg", "yellow"], ["b", "blue"]]);
  assert.deepEqual(parseCategories("[broken", EXAMPLE_CATEGORIES), EXAMPLE_CATEGORIES);
  assert.equal(parseCategories("1;2;3;4;5;6;7;8").length, 6);
});

test("the response string", () => {
  assert.deepEqual(parseMarks("40-44:b 12-18:a 3 7-5:c x 9-:a"), [m(3, 3), m(5, 7, "c"), m(12, 18), m(40, 44, "b")]);
  assert.equal(serializeMarks([m(40, 44, "b"), m(12, 18)]), "12-18:a 40-44:b");
  assert.deepEqual(ownMarks([m(0, 2), m(2, 3), m(5, 9), m(1, 1, "z"), { start: 1.5, end: 2, category: "a" }], 8, EXAMPLE_CATEGORIES), [m(0, 2)]);
});

test("adding marks: merge with the same category, cut out of others, limits", () => {
  const none = { maxMarks: 0, maxLength: 0 };
  let r = addMark([m(2, 4)], m(4, 6), none);
  assert.deepEqual(r.marks, [m(2, 6)]);
  r = addMark([m(2, 8)], m(4, 5, "b"), none);
  assert.deepEqual(r.marks, [m(2, 3), m(4, 5, "b"), m(6, 8)]);
  r = addMark([m(2, 4)], m(0, 9, "b"), none);
  assert.deepEqual(r.marks, [m(0, 9, "b")]);
  assert.deepEqual(addMark([m(2, 4)], m(5, 5), none).marks, [m(2, 4), m(5, 5)]); // adjacent stays separate
  assert.equal(addMark([m(0, 0), m(2, 2)], m(4, 4), { maxMarks: 2, maxLength: 0 }).error, "tooMany");
  assert.equal(addMark([m(0, 0), m(2, 2)], m(2, 3), { maxMarks: 2, maxLength: 0 }).error, null);
  const long = addMark([m(0, 3)], m(3, 6), { maxMarks: 0, maxLength: 6 });
  assert.equal(long.error, "tooLong");
  assert.deepEqual(long.marks, [m(0, 3)]);
  assert.deepEqual(removeMark([m(0, 3), m(5, 6)], 2), [m(5, 6)]);
  assert.deepEqual(markAt([m(0, 3), m(5, 6)], 6), m(5, 6));
});

test("hit levels per rule and tolerance", () => {
  const t = m(10, 19);
  // overlap 75 %, tolerance 1
  assert.equal(hitLevel(t, m(10, 19), s()), 2);
  assert.equal(hitLevel(t, m(12, 19), s()), 2); // 80 %
  assert.equal(hitLevel(t, m(13, 19), s()), 1); // 70 %
  assert.equal(hitLevel(t, m(9, 20), s()), 2); // one word extra each side
  assert.equal(hitLevel(t, m(8, 19), s()), 1); // two before
  assert.equal(hitLevel(t, m(10, 19, "b"), s()), 1); // another category
  assert.equal(hitLevel(t, m(20, 22), s()), 0);
  // all words
  assert.equal(hitLevel(t, m(10, 18), s({ rule: "all" })), 1);
  assert.equal(hitLevel(t, m(9, 20), s({ rule: "all" })), 2);
  assert.equal(hitLevel(t, m(9, 21), s({ rule: "all", tolerance: 2 })), 2);
  // exact boundaries, within the tolerance either way
  assert.equal(hitLevel(t, m(11, 18), s({ rule: "exact" })), 2);
  assert.equal(hitLevel(t, m(12, 19), s({ rule: "exact" })), 1);
  assert.equal(hitLevel(t, m(12, 19), s({ rule: "exact", tolerance: 2 })), 2);
  assert.equal(hitLevel(m(5, 5), m(5, 5), s({ rule: "exact", tolerance: 0 })), 2);
});

test("evaluate: one mark per target, extra marks, partial points and penalties", () => {
  const key = parseMarks(EXAMPLE_KEY);
  const all = evaluate(key, key, s());
  assert.deepEqual([all.score, all.maxscore, all.correct, all.extra, all.hits], [4, 4, true, 0, [2, 2, 2, 2]]);

  const marks = [m(69, 70, "b"), m(93, 104), m(111, 111, "a"), m(30, 31, "b")];
  const e = evaluate(key, marks, s({ partial: 1, penalty: 1 }));
  // However+not: one extra word ✓; the argument only 12 of 18 words: partly; Still in the wrong category: partly; one extra
  assert.deepEqual(e.hits, [2, 1, 1, 0]);
  assert.equal(e.extra, 1);
  assert.equal(e.score, 2 + 1 - 1);
  assert.equal(e.correct, false);
  assert.deepEqual(e.matched, [0, 1, 2, -1]);

  // one mark over two targets counts for one of them; the other is missed
  const wide = evaluate([m(0, 0), m(2, 2)], [m(0, 2)], s({ tolerance: 2 }));
  assert.deepEqual(wide.hits.slice().sort(), [0, 2]);
  assert.equal(wide.extra, 0);
  // the best pairs first: the exact mark gets the target, the sloppy one is extra
  const best = evaluate([m(5, 8)], [m(4, 8), m(5, 8)], s());
  assert.deepEqual([best.matched, best.extra], [[1], 1]);
  // no negative scores, no key: nothing to earn
  assert.equal(evaluate([m(0, 0)], [m(5, 5), m(7, 7)], s({ penalty: 3 })).score, 0);
  assert.deepEqual(evaluate([], [m(1, 1)], s()), { score: 0, maxscore: 0, correct: false, extra: 1, hits: [], matched: [] });
  // partial points never above the full points
  assert.equal(evaluate([m(0, 3)], [m(0, 0)], s({ points: 1, partial: 5 })).score, 1);
});

test("scoring settings: defaults for anything missing or wrong", () => {
  assert.deepEqual(parseScoring(""), DEFAULT_SCORING);
  assert.deepEqual(parseScoring("{broken"), DEFAULT_SCORING);
  assert.deepEqual(parseScoring('{"tolerance":"2","rule":"all","minOverlap":500,"points":2,"partial":1,"penalty":-1}'), {
    tolerance: 2, rule: "all", minOverlap: 100, points: 2, partial: 1, penalty: 0,
  });
});

test("an edited text keeps the key where the words did not change", () => {
  const before = words("The cat sat on the mat. It was happy.");
  const after = words("The black cat sat on the mat. It was very happy.");
  // the common head is "The", the tail "happy": the words between are a change, "happy" moves on by two
  assert.deepEqual(remapMarks(before, after, [m(0, 0), m(8, 8, "b"), m(1, 2)]), [m(0, 0), m(10, 10, "b")]);
  // a plain insertion in the middle
  const a = words("one two three four five six");
  const b = words("one two NEW three four five six");
  assert.deepEqual(remapMarks(a, b, [m(0, 1), m(2, 3, "b"), m(1, 4)]), [m(0, 1), m(3, 4, "b"), m(1, 5)]);
  // deleted words: a mark inside the deleted part goes, one around it shrinks
  const c = words("one two six");
  assert.deepEqual(remapMarks(a, c, [m(2, 3), m(1, 5, "b"), m(5, 5)]), [m(1, 2, "b"), m(2, 2)]);
});
