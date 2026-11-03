// npm test: settings, answer and response of the model hotspot (src/hotspot.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_ANSWER, correctAnswer, correctResponse, declarationXml, isCorrect, labelOn, labelPoints, letterOf, nameOf, ownAnswer, parseCardinality,
  parseMaxChoices, parseMode, parseSetup, place, problemsOf, readAnswer, resolveSettings, responseOf, serializeSetup, toggle, type BasePart, type Settings,
} from "../src/hotspot.ts";

const BASE: BasePart[] = [
  { id: "cornea", name: { en: "Cornea", nl: "Hoornvlies" } },
  { id: "iris", name: { en: "Iris", nl: "Regenboogvlies" } },
  { id: "lens", name: { en: "Lens", nl: "Ooglens" } },
  { id: "retina", name: { en: "Retina", nl: "Netvlies" } },
];

const settings = (extra: Partial<Parameters<typeof resolveSettings>[0]> = {}): Settings =>
  resolveSettings({ base: BASE, setup: {}, mode: "click", cardinality: "single", maxChoices: 0, defaultCorrect: ["lens"], ...extra });

test("parsing the simple settings", () => {
  assert.equal(parseMode("LABEL"), "label");
  assert.equal(parseMode("anything"), "click");
  assert.equal(parseCardinality("Multiple"), "multiple");
  assert.equal(parseCardinality(""), "single");
  assert.equal(parseMaxChoices("3"), 3);
  assert.equal(parseMaxChoices("-1"), 0);
  assert.equal(parseMaxChoices("x"), 0);
  assert.equal(parseMaxChoices(""), 0);
});

test("letters: A … Z, then A2", () => {
  assert.equal(letterOf(0), "A");
  assert.equal(letterOf(25), "Z");
  assert.equal(letterOf(26), "A2");
});

test("without a setup: every part can be chosen, with the model's names and example answer", () => {
  const s = settings();
  assert.deepEqual(s.parts.map((p) => `${p.letter}:${p.id}`), ["A:cornea", "B:iris", "C:lens", "D:retina"]);
  assert.deepEqual(s.correct, ["lens"]);
  assert.equal(s.maxChoices, 1);
  // labels: one per part, on its own part
  assert.deepEqual(s.labels.map((l) => `${l.id}>${l.part}`), ["cornea>cornea", "iris>iris", "lens>lens", "retina>retina"]);
});

test("the setup: names, parts that cannot be chosen (no letter), the correct parts, unknown parts dropped", () => {
  const setup = parseSetup(JSON.stringify({ parts: [{ id: "cornea", selectable: false }, { id: "lens", en: "Eye lens", nl: "Lens" }, { id: "heart" }, { id: "1bad" }], correct: ["cornea", "lens", "retina"] }));
  const s = settings({ setup, cardinality: "multiple" });
  assert.deepEqual(s.parts.map((p) => `${p.letter}:${p.id}`), [":cornea", "A:iris", "B:lens", "C:retina"]);
  assert.deepEqual(s.parts[2].name, { en: "Eye lens", nl: "Lens" });
  assert.deepEqual(s.correct, ["lens", "retina"], "the cornea cannot be chosen");
  assert.equal(nameOf(s.parts[2].name, "nl"), "Lens");
  assert.equal(nameOf({ en: "Iris", nl: "" }, "nl"), "Iris", "no Dutch name: the English one");
});

test("a glTF: the parts come from the setup", () => {
  const setup = parseSetup(JSON.stringify({ parts: [{ id: "Left_ventricle", en: "Left ventricle", nl: "Linkerkamer" }, { id: "Aorta" }], correct: ["Aorta"] }));
  const s = resolveSettings({ base: [], setup, mode: "click", cardinality: "single", maxChoices: 0, open: true });
  assert.deepEqual(s.parts.map((p) => p.id), ["Left_ventricle", "Aorta"]);
  assert.equal(s.parts[1].name.en, "Aorta");
  assert.deepEqual(s.correct, ["Aorta"]);
});

test("broken setups are no setup", () => {
  assert.deepEqual(parseSetup(""), {});
  assert.deepEqual(parseSetup("{oops"), {});
  assert.deepEqual(parseSetup("[1,2]"), {});
  const round = { parts: [{ id: "lens", en: "Lens" }], labels: [{ id: "L1", en: "Focuses light", nl: "Breekt licht", part: "lens" }], correct: ["lens"] };
  assert.deepEqual(parseSetup(serializeSetup(round)), round);
});

test("click mode, one choice: a click chooses, another replaces, the same one again takes it back", () => {
  const s = settings();
  let r = toggle(s, [], "lens");
  assert.deepEqual(r.selected, ["lens"]);
  r = toggle(s, r.selected, "iris");
  assert.deepEqual(r.selected, ["iris"]);
  r = toggle(s, r.selected, "iris");
  assert.deepEqual(r.selected, []);
  assert.deepEqual(toggle(s, [], "heart").selected, [], "not a part");
});

test("click mode, more choices: toggles, in the order of the parts, up to the maximum", () => {
  const s = settings({ cardinality: "multiple", maxChoices: 2 });
  let r = toggle(s, [], "retina");
  r = toggle(s, r.selected, "cornea");
  assert.deepEqual(r.selected, ["cornea", "retina"]);
  const refused = toggle(s, r.selected, "lens");
  assert.equal(refused.refused, "max");
  assert.deepEqual(refused.selected, ["cornea", "retina"]);
  assert.deepEqual(toggle(s, r.selected, "cornea").selected, ["retina"]);
});

test("click responses: an identifier, or a list; nothing before a choice", () => {
  const single = settings();
  assert.equal(responseOf(single, EMPTY_ANSWER), undefined);
  assert.deepEqual(responseOf(single, { selected: ["lens"], placed: {} }), { base: { identifier: "lens" } });
  const multi = settings({ cardinality: "multiple", setup: { correct: ["retina", "lens"] } });
  assert.deepEqual(responseOf(multi, { selected: ["retina", "iris"], placed: {} }), { list: { identifier: ["iris", "retina"] } });
  assert.deepEqual(correctResponse(multi), { list: { identifier: ["lens", "retina"] } });
  assert.equal(isCorrect(multi, { selected: ["retina", "lens"], placed: {} }), true);
  assert.equal(isCorrect(multi, { selected: ["lens"], placed: {} }), false);
});

test("label mode: a label moves, one label per part, a label pushed off goes back", () => {
  let placed = place({}, "lens", "lens");
  placed = place(placed, "iris", "retina");
  assert.deepEqual(placed, { lens: "lens", iris: "retina" });
  placed = place(placed, "lens", "retina"); // the iris label goes back
  assert.deepEqual(placed, { lens: "retina" });
  assert.equal(labelOn(placed, "retina"), "lens");
  assert.deepEqual(place(placed, "lens", null), {});
});

test("label responses: directed pairs label → part in the order of the labels; MAP_RESPONSE points", () => {
  const s = settings({ mode: "label" });
  assert.equal(responseOf(s, EMPTY_ANSWER), undefined);
  const answer = { selected: [], placed: { retina: "retina", cornea: "iris", lens: "lens" } };
  assert.deepEqual(responseOf(s, answer), { list: { directedPair: [["cornea", "iris"], ["lens", "lens"], ["retina", "retina"]] } });
  assert.equal(labelPoints(s, answer), 2);
  assert.equal(isCorrect(s, answer), false);
  assert.deepEqual(correctAnswer(s).placed, { cornea: "cornea", iris: "iris", lens: "lens", retina: "retina" });
  assert.equal(isCorrect(s, correctAnswer(s)), true);
});

test("label mode with the author's labels and a distractor: the distractor stays off", () => {
  const setup = parseSetup(JSON.stringify({ labels: [{ id: "L1", en: "Focuses light", nl: "Stelt scherp", part: "lens" }, { id: "L2", en: "Makes tears", nl: "Maakt tranen", part: null }] }));
  const s = settings({ mode: "label", setup });
  assert.deepEqual(correctResponse(s), { list: { directedPair: [["L1", "lens"]] } });
  assert.equal(isCorrect(s, { selected: [], placed: { L1: "lens" } }), true);
  assert.equal(isCorrect(s, { selected: [], placed: { L1: "lens", L2: "iris" } }), false, "a distractor placed");
});

test("ownAnswer keeps only what fits", () => {
  const s = settings({ mode: "label", setup: { parts: [{ id: "cornea", selectable: false }] } });
  assert.deepEqual(ownAnswer(s, { selected: ["x"], placed: { lens: "lens", iris: "lens", retina: "cornea", nope: "iris" } }), { selected: [], placed: { lens: "lens" } });
  assert.deepEqual(ownAnswer(s, null), EMPTY_ANSWER);
});

test("readAnswer: responses, declared correct responses and plain text", () => {
  const single = settings();
  assert.deepEqual(readAnswer(single, { base: { identifier: "lens" } })?.selected, ["lens"]);
  assert.deepEqual(readAnswer(single, "lens")?.selected, ["lens"]);
  const multi = settings({ cardinality: "multiple" });
  assert.deepEqual(readAnswer(multi, { list: { identifier: ["retina", "iris"] } })?.selected, ["iris", "retina"]);
  assert.deepEqual(readAnswer(multi, ["retina", "lens"])?.selected, ["lens", "retina"]);
  assert.deepEqual(readAnswer(multi, "retina lens")?.selected, ["lens", "retina"]);
  const label = settings({ mode: "label" });
  assert.deepEqual(readAnswer(label, { list: { directedPair: [["lens", "lens"], ["iris", "retina"]] } })?.placed, { lens: "lens", iris: "retina" });
  assert.deepEqual(readAnswer(label, ["lens lens", "iris retina"])?.placed, { lens: "lens", iris: "retina" }, "values of a declaration");
  assert.deepEqual(readAnswer(label, { base: { directedPair: ["lens", "lens"] } })?.placed, { lens: "lens" });
  assert.deepEqual(readAnswer(label, "lens lens, iris iris")?.placed, { lens: "lens", iris: "iris" });
  assert.equal(readAnswer(label, null), null);
  // round trips
  for (const s of [single, multi, label]) assert.deepEqual(responseOf(s, readAnswer(s, correctResponse(s))!), correctResponse(s));
});

test("the response declaration for the item", () => {
  assert.equal(
    declarationXml(settings()),
    `<qti-response-declaration identifier="RESPONSE" cardinality="single" base-type="identifier">
  <qti-correct-response>
    <qti-value>lens</qti-value>
  </qti-correct-response>
</qti-response-declaration>`
  );
  const xml = declarationXml(settings({ mode: "label", setup: { labels: [{ id: "L1", en: "a", nl: "b", part: "lens" }, { id: "L2", en: "c", nl: "d", part: "iris" }] } }));
  assert.match(xml, /cardinality="multiple" base-type="directedPair"/);
  assert.match(xml, /<qti-value>L1 lens<\/qti-value>\n {4}<qti-value>L2 iris<\/qti-value>/);
  assert.match(xml, /<qti-map-entry map-key="L2 iris" mapped-value="1"\/>/);
});

test("problems for the author", () => {
  assert.deepEqual(problemsOf(settings()), []);
  assert.deepEqual(problemsOf(settings({ setup: { correct: [] } })), [{ code: "noCorrect" }]);
  assert.deepEqual(problemsOf(settings({ cardinality: "multiple", maxChoices: 1, setup: { correct: ["lens", "iris"] } })), [{ code: "tooManyCorrect", count: 2, max: 1 }]);
  const none = settings({ setup: { parts: BASE.map((p) => ({ id: p.id, selectable: false })) } });
  assert.deepEqual(problemsOf(none).map((p) => p.code), ["noParts", "noCorrect"]);
  const labels = settings({
    mode: "label",
    setup: { parts: [{ id: "cornea", selectable: false }], labels: [{ id: "L1", en: "", nl: "", part: "lens" }, { id: "L2", en: "x", nl: "", part: "lens" }, { id: "L3", en: "y", nl: "", part: "cornea" }] },
  });
  assert.deepEqual(problemsOf(labels), [{ code: "labelText", label: "L1" }, { code: "labelPart", label: "L3" }, { code: "samePart", part: "lens" }]);
  assert.deepEqual(problemsOf(settings({ mode: "label", setup: { labels: [] } })), [{ code: "noLabels" }]);
  assert.deepEqual(problemsOf(settings(), { gltf: true, url: "" }), [{ code: "noUrl" }]);
});
