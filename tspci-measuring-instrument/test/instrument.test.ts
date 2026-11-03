// npm test: the logic of the measuring instruments (src/instrument.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KINDS, angleOf, bestRange, correctValue, decimalsOf, formatNumber, formatTime, geometryOf, isCorrect, meterTicks, parseNumber,
  parseRanges, parseReading, parseTime, positionOf, problemsOf, readModel, readingText, responseProcessingXml, settingsOf, snap,
  stepValue, ticksOf, typed, valueAt, vernierTicks, withUnit,
} from "../src/instrument.ts";

test("every instrument has sensible defaults: its value lies on its scale, on a reading step, without problems", () => {
  for (const kind of KINDS) {
    const m = readModel({ instrument: kind });
    assert.equal(m.kind, kind);
    assert.deepEqual(problemsOf({ instrument: kind }), [], kind);
    assert.ok(m.value >= m.low && m.value <= m.high, kind);
    if (kind !== "clock") assert.ok(ticksOf(m).length > 10, kind);
  }
});

test("readModel: empty settings are the instrument's, given ones win, nonsense falls back", () => {
  const m = readModel({ instrument: "cylinder", max: "100", value: "64", unit: "" });
  assert.deepEqual([m.min, m.max, m.major, m.minor, m.unit, m.value, m.precision], [0, 100, 10, 10, "mL", 64, 1]);
  assert.equal(readModel({ instrument: "submarine" }).kind, "thermometer");
  assert.equal(readModel({ instrument: "ruler", precision: "-1" }).precision, 0.1);
  assert.equal(readModel({ instrument: "ruler", min: "2,5" }).min, 2.5);
  assert.equal(readModel({ zoom: "FALSE" }).zoom, false);
  assert.equal(readModel({ language: "nl-NL" }).language, "nl");
  // range mode only for a meter; another instrument is read off
  assert.equal(readModel({ instrument: "scale", mode: "range" }).mode, "read");
  assert.deepEqual(problemsOf({ instrument: "scale", mode: "range" }), [{ code: "rangeOnlyMeter" }]);
});

test("a meter: the best range is plugged in, its scale and divisions follow from it", () => {
  assert.deepEqual(parseRanges("15 3;30 x 3"), [3, 15, 30]);
  assert.equal(bestRange(2.4, [3, 15]), 3);
  assert.equal(bestRange(3, [3, 15]), 3);
  assert.equal(bestRange(4.5, [3, 15, 30]), 15);
  assert.equal(bestRange(40, [3, 15, 30]), null);
  assert.deepEqual(meterTicks(3), { major: 0.5, minor: 5 });
  assert.deepEqual(meterTicks(15), { major: 5, minor: 10 });
  assert.deepEqual(meterTicks(30), { major: 5, minor: 5 });
  assert.deepEqual(meterTicks(10), { major: 2, minor: 4 });
  const m = readModel({ instrument: "meter", value: "7.5", ranges: "3 15 30" });
  assert.deepEqual([m.range, m.min, m.max, m.precision], [15, 0, 15, 0.5]);
  assert.equal(readModel({ instrument: "meter", value: "2", range: "30", ranges: "3 15 30" }).range, 30);
  assert.equal(readModel({ instrument: "meter", value: "2", range: "7", ranges: "3 15 30" }).range, 3); // not a range: the best
});

test("ticks: labelled every major, a middle tick, small ones; no floating point noise", () => {
  const ticks = ticksOf({ min: 0, max: 1, major: 0.5, minor: 10 });
  assert.equal(ticks.length, 21);
  assert.deepEqual(ticks.filter((t) => t.level === 0).map((t) => t.label), [0, 0.5, 1]);
  assert.deepEqual(ticks.filter((t) => t.level === 1).map((t) => t.value), [0.25, 0.75]);
  assert.ok(ticks.every((t) => String(t.value).length < 6));
  // the stopwatch: 0.2 s with a middle tick every second
  const sw = ticksOf(readModel({ instrument: "stopwatch" }));
  assert.equal(sw.length, 301);
  assert.equal(sw.filter((t) => t.level === 1).length, 48);
  assert.deepEqual(ticksOf({ min: 0, max: 1000, major: 1, minor: 10 }), []); // too many
  assert.deepEqual(problemsOf({ instrument: "ruler", max: "15", major: "4", precision: "0.1" }), [{ code: "majorDoesNotFit" }]);
  assert.deepEqual(problemsOf({ instrument: "ruler", min: "15", max: "0" }), [{ code: "maxNotAboveMin" }]);
});

test("the vernier: n divisions over n − 1 mm, numbered 0 to 10", () => {
  const v = vernierTicks(10);
  assert.equal(v.length, 11);
  assert.equal(v[10].offset, 9);
  assert.equal(v[3].offset, 2.7);
  assert.deepEqual(vernierTicks(20).filter((t) => t.label !== undefined).map((t) => t.label), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(readModel({ instrument: "caliper", vernier: "20" }).precision, 0.05);
  // 23.4 mm: vernier tick 4 lines up with 27 mm on the main scale
  assert.equal(23.4 + v[4].offset, 27);
});

test("snapping and the keyboard: to the precision, within the instrument; a clock goes round", () => {
  const t = readModel({ instrument: "thermometer" });
  assert.equal(snap(t, 18.4), 18);
  assert.equal(snap(t, 99), 50);
  assert.equal(snap(t, -40), -10);
  assert.equal(snap(readModel({ instrument: "stopwatch" }), 83.37), 83.4);
  assert.equal(stepValue(t, 18, "ArrowUp"), 19);
  assert.equal(stepValue(t, 18, "ArrowUp", true), 28);
  assert.equal(stepValue(t, 18, "PageDown"), 8);
  assert.equal(stepValue(t, 18, "Home"), -10);
  assert.equal(stepValue(t, 18, "End"), 50);
  assert.equal(stepValue(t, 18, "a"), null);
  const c = readModel({ instrument: "clock" });
  assert.equal(stepValue(c, 0, "ArrowLeft"), 719);
  assert.equal(stepValue(c, 719, "ArrowRight"), 0);
  assert.equal(stepValue(c, 30, "PageUp"), 90);
  assert.equal(stepValue(c, 0, "End"), 719);
});

test("numbers: a decimal comma in Dutch, a real minus sign, times as h:mm", () => {
  assert.equal(formatNumber(2.4, 1, "nl"), "2,4");
  assert.equal(formatNumber(-10, 0, "en"), "−10");
  assert.equal(decimalsOf(0.05), 2);
  assert.equal(decimalsOf(1e-7), 7);
  assert.equal(withUnit(readModel({ instrument: "meter", language: "nl" }), 2.4), "2,4 V");
  assert.equal(withUnit(readModel({ instrument: "clock" }), 635), "10:35");
  assert.equal(formatTime(0), "12:00");
  assert.equal(formatTime(5), "12:05");
  assert.equal(parseNumber("18,5"), 18.5);
  assert.equal(parseNumber(" −3.25 "), -3.25);
  assert.equal(parseNumber(".5"), 0.5);
  assert.equal(parseNumber("1.2.3"), null);
  assert.equal(parseNumber("-"), null);
  assert.equal(parseTime("10:35"), 635);
  assert.equal(parseTime("12.05"), 5);
  assert.equal(parseTime("3:7"), null);
  assert.equal(parseTime("13:00"), null);
  assert.equal(parseReading("clock", "3:45"), 225);
  assert.equal(parseReading("ruler", "7,3"), 7.3);
  assert.equal(readingText("thermometer", -2.5, "nl"), "-2,5");
  assert.equal(readingText("clock", 225, "nl"), "3:45");
});

test("typing: the language's separator, only what makes a number", () => {
  assert.equal(typed("ruler", "7.3", "nl", false), "7,3");
  assert.equal(typed("ruler", "7,3", "en", false), "7.3");
  assert.equal(typed("ruler", "-7", "en", false), null);
  assert.equal(typed("thermometer", "-7", "en", true), "-7");
  assert.equal(typed("ruler", "7,3,", "nl", false), null);
  assert.equal(typed("ruler", "7a", "en", false), null);
  assert.equal(typed("clock", "10.3", "en", false), "10:3");
  assert.equal(typed("clock", "10:355", "en", false), null);
});

test("the drawing: a value and the pointer that points at it are each other's inverse", () => {
  for (const kind of KINDS) {
    const m = readModel({ instrument: kind });
    const p = positionOf(m, m.value);
    const back = snap(m, valueAt(m, p.x, p.y, m.value));
    assert.equal(back, kind === "clock" ? m.value : snap(m, m.value), kind);
  }
  const meter = readModel({ instrument: "meter" });
  const g = geometryOf(meter) as any;
  assert.equal(angleOf(meter, g, 0), -45);
  assert.equal(angleOf(meter, g, 3), 45);
  assert.equal(angleOf(meter, g, 1.5), 0);
  // below the dial: the nearest end
  assert.equal(valueAt(meter, 20, 300, 0), 0);
  assert.equal(valueAt(meter, 340, 300, 0), 3);
  // a kitchen scale's gap between max and 0: the nearer end
  const scale = readModel({ instrument: "scale" });
  const left = { x: 180 - 50, y: 250 - 100 }; // about −27°: past 1000
  assert.equal(snap(scale, valueAt(scale, left.x, left.y, 0)), 1000);
});

test("a hand that goes round takes the turn closest to where it was", () => {
  const c = readModel({ instrument: "clock" });
  // the minute hand at 9 (45 minutes): from 10:50 that is 10:45, from 11:10 it is still 10:45, from 0:05 it is 11:45
  const at9 = { x: 30, y: 180 };
  assert.equal(snap(c, valueAt(c, at9.x, at9.y, 650)), 645);
  assert.equal(snap(c, valueAt(c, at9.x, at9.y, 670)), 645);
  assert.equal(snap(c, valueAt(c, at9.x, at9.y, 5)), 705);
  const s = readModel({ instrument: "stopwatch" });
  const at3 = { x: 320, y: 240 }; // 15 s
  assert.equal(snap(s, valueAt(s, at3.x, at3.y, 70)), 75);
  assert.equal(snap(s, valueAt(s, at3.x, at3.y, 0)), 15);
});

test("the correct response: the value, or the best range", () => {
  assert.equal(correctValue(readModel({ instrument: "caliper" })), 23.4);
  assert.equal(correctValue(readModel({ instrument: "clock", value: "780" })), 60);
  assert.equal(correctValue(readModel({ instrument: "meter", mode: "range", value: "4.5", ranges: "3 15 30" })), 15);
  assert.equal(correctValue(readModel({ instrument: "meter", mode: "range", value: "45", ranges: "3 15 30" })), null);
  assert.ok(isCorrect(18.5, 18, 0.5));
  assert.ok(!isCorrect(18.6, 18, 0.5));
  assert.ok(!isCorrect(null, 18, 0.5));
  assert.ok(isCorrect(37, 37, 0));
});

test("problems: a value off the scale or between reading steps", () => {
  assert.deepEqual(problemsOf({ instrument: "thermometer", value: "60" }), [{ code: "valueOutside", low: -10, high: 50 }]);
  assert.deepEqual(problemsOf({ instrument: "thermometer", value: "18.5" }), [{ code: "valueOffPrecision" }]);
  assert.deepEqual(problemsOf({ instrument: "thermometer", value: "18.5", precision: "0.5" }), []);
  assert.deepEqual(problemsOf({ instrument: "clock", value: "720" }), [{ code: "valueOutside", low: 0, high: 719 }]);
  assert.deepEqual(problemsOf({ instrument: "meter", mode: "range", ranges: "3", value: "40" }), [{ code: "fewRanges" }, { code: "noRangeFits" }]);
  assert.deepEqual(problemsOf({ instrument: "caliper", vernier: "1" }), [{ code: "vernier" }, { code: "valueOffPrecision" }]);
});

test("settingsOf writes what readModel reads", () => {
  for (const kind of KINDS) {
    const m = readModel({ instrument: kind, language: "en" });
    assert.deepEqual(readModel({ ...settingsOf(m), language: "en" }), m, kind);
  }
});

test("response processing: match_correct, or qti-equal with the margin", () => {
  assert.match(responseProcessingXml(0), /match_correct\.xml/);
  const xml = responseProcessingXml(0.5);
  assert.match(xml, /<qti-equal tolerance-mode="absolute" tolerance="0.5">/);
  assert.match(xml, /<qti-correct identifier="RESPONSE"\/>/);
});
