// npm test: the settings (src/settings.ts) and the numbers (src/format.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseList, parseRange, parseReferences, parseSettings } from "../src/settings.ts";
import { formatNumber, languageOf, parseNumber } from "../src/format.ts";

test("defaults", () => {
  const s = parseSettings({});
  assert.equal(s.mode, "tool");
  assert.equal(s.control, "both");
  assert.deepEqual(s.powers, [25, 50, 100]);
  assert.equal(s.power, 25);
  assert.deepEqual(s.distanceRange, { min: 10, max: 1000, step: 10 });
  assert.equal(s.distance, 10);
  assert.equal(s.referenceIntensity, 1e-12);
  assert.equal(s.references, null);
  assert.equal(s.showReferences, true);
  assert.equal(s.source, "speaker");
  assert.equal(s.view, "3d");
  assert.equal(s.language, "en");
  assert.ok(s.canChangePower && s.canChangeDistance);
});

test("what the candidate controls", () => {
  const can = (p: Record<string, string>) => {
    const s = parseSettings(p);
    return [s.canChangePower, s.canChangeDistance];
  };
  assert.deepEqual(can({ control: "distance" }), [false, true]);
  assert.deepEqual(can({ control: "power" }), [true, false]);
  assert.deepEqual(can({ mode: "answer" }), [false, true]);
  assert.deepEqual(can({ mode: "answer", answer: "power", control: "distance" }), [true, false]);
  assert.deepEqual(can({ mode: "ANSWER", answer: "Power" }), [true, false]);
});

test("lists of powers", () => {
  assert.deepEqual(parseList("25;50;100"), [25, 50, 100]);
  assert.deepEqual(parseList("100, 25, 50, 25"), [25, 50, 100]);
  assert.deepEqual(parseList("0,5; 1; 2"), [0.5, 1, 2]);
  assert.deepEqual(parseList("1\n2\nx\n-3\n0"), [1, 2]);
  assert.deepEqual(parseSettings({ powers: "nothing" }).powers, [25, 50, 100]);
  assert.equal(parseSettings({ powers: "10;20", power: "18" }).power, 20); // the nearest choice
});

test("ranges", () => {
  const fallback = { min: 10, max: 1000, step: 10 };
  assert.deepEqual(parseRange("1", "100", "0.5", fallback), { min: 1, max: 100, step: 0.5 });
  assert.deepEqual(parseRange("0", "900", "10", fallback), { min: 10, max: 900, step: 10 }); // no level at 0 m
  assert.deepEqual(parseRange("500", "100", "10", fallback), { min: 500, max: 1000, step: 10 });
  assert.deepEqual(parseRange("1", "2", "5", fallback), { min: 1, max: 2, step: 0.01 });
  assert.deepEqual(parseRange("x", "", "-1", fallback), { min: 10, max: 1000, step: 9.9 });
  const s = parseSettings({ distanceMin: "10", distanceMax: "900", distance: "2000", powerInput: "slider", power: "0" });
  assert.equal(s.distance, 900);
  assert.equal(s.power, 1);
});

test("references", () => {
  assert.deepEqual(parseReferences("Pain threshold = 120; Whisper = 30\nConversation: 60 dB"), [
    { label: "Whisper", level: 30 },
    { label: "Conversation", level: 60 },
    { label: "Pain threshold", level: 120 },
  ]);
  assert.deepEqual(parseReferences("Bladeren = 10,5; nonsense; = 40"), [{ label: "Bladeren", level: 10.5 }]);
  assert.deepEqual(parseSettings({ references: "" }).references, null);
  assert.equal(parseSettings({ showReferences: "FALSE" }).showReferences, false);
});

test("units, I0, source, view and language", () => {
  const s = parseSettings({ powerUnit: "kw", distanceUnit: "km", referenceIntensity: "1,2e-12", source: "Walrus", view: "2D", language: "nl-NL", decimals: "9" });
  assert.deepEqual([s.powerUnit, s.powerFactor, s.distanceUnit, s.distanceFactor], ["kW", 1000, "km", 1000]);
  assert.equal(s.referenceIntensity, 1.2e-12);
  assert.equal(s.source, "walrus");
  assert.equal(s.view, "2d");
  assert.equal(s.language, "nl");
  assert.equal(s.decimals, 4);
  const odd = parseSettings({ powerUnit: "hp", source: "dragon", referenceIntensity: "-1", targetLevel: "abc" });
  assert.deepEqual([odd.powerUnit, odd.source, odd.referenceIntensity, odd.targetLevel], ["W", "speaker", 1e-12, null]);
});

test("numbers in English and Dutch", () => {
  assert.equal(formatNumber(58.04, 1, "en"), "58.0");
  assert.equal(formatNumber(58.04, 1, "nl"), "58,0");
  assert.equal(formatNumber(-3, 0, "en"), "−3");
  assert.equal(formatNumber(-0.01, 1, "nl"), "0,0");
  assert.equal(formatNumber(1000, 0, "nl"), "1000");
  assert.equal(formatNumber(Infinity, 1, "en"), "∞");
  assert.equal(formatNumber(NaN, 1, "en"), "–");
  assert.deepEqual(["58,5", "58.5", " 1e-12 ", "1,2e-12", "−3", "", "5 dB", null].map(parseNumber), [58.5, 58.5, 1e-12, 1.2e-12, -3, null, null, null]);
  assert.deepEqual(["nl", "NL-be", "en", undefined, "de"].map(languageOf), ["nl", "nl", "en", "en", "en"]);
});
