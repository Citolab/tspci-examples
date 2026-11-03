// npm test: the logic of the timeline (src/timeline.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assignLanes, binOf, clampView, correctPlacements, evaluate, exampleTimeline, formatValue, formatYear, fromAstro, orderOf,
  ownPlacements, parseTimeline, parseYear, periodOfYear, placedPosition, positionOf, problemsOf, responseFields,
  responseProcessingXml, serializeTimeline, snapAt, snapYear, ticks, tijdvakken, toAstro, toleranceFor, yearsBetween, zoomView,
} from "../src/timeline.ts";

const timeline = (extra: Record<string, unknown>) => parseTimeline(JSON.stringify(extra));

test("years: no year 0, BC and AD one apart", () => {
  assert.equal(toAstro(1), 1);
  assert.equal(toAstro(-1), 0);
  assert.equal(toAstro(-44), -43);
  assert.equal(fromAstro(0), -1);
  assert.equal(fromAstro(-43), -44);
  assert.equal(fromAstro(1648), 1648);
  assert.equal(yearsBetween(-1, 1), 1);
  assert.equal(yearsBetween(-44, 14), 57);
});

test("snapping to years, steps, decades and centuries", () => {
  assert.equal(snapAt(1648.4, "year"), 1648);
  assert.equal(snapAt(0.4, "year"), -1);
  assert.equal(snapAt(0.6, "year"), 1);
  assert.equal(snapAt(-42.6, "year"), -44); // astronomical -43 is 44 BC
  assert.equal(snapAt(1647, "year", 5), 1645);
  assert.equal(snapAt(1, "year", 10), 1); // no year 0
  assert.equal(snapAt(-2, "year", 10), -1);
  assert.equal(snapAt(1647.9, "decade"), 1640);
  assert.equal(snapAt(5, "decade"), 1);
  assert.equal(snapYear(-45, "decade"), -40);
  assert.equal(snapAt(1648, "century"), 1600);
  assert.equal(snapAt(50, "century"), 1);
  assert.equal(snapYear(-450, "century"), -500);
  assert.equal(snapYear(-401, "century"), -500);
  assert.equal(snapYear(-501, "century"), -600);
  assert.equal(snapYear(-1, "century"), -100);
});

test("bins and positions", () => {
  assert.deepEqual(binOf(1600, "century"), [1600, 1699]);
  assert.deepEqual(binOf(1, "century"), [1, 99]);
  assert.deepEqual(binOf(-500, "century"), [-499, -400]);
  assert.deepEqual(binOf(-40, "decade"), [-48, -39]);
  assert.deepEqual(binOf(-1, "decade"), [-8, 0]);
  assert.deepEqual(binOf(1640, "decade"), [1640, 1649]);
  assert.equal(positionOf(1600, "century"), 1650);
  assert.equal(positionOf(1648, "year"), 1648);
  // snapping the middle of a bin gives the bin back
  for (const v of [-500, -100, 1, 1600]) assert.equal(snapAt(positionOf(v, "century"), "century"), v);
  for (const v of [-40, -1, 1, 1640]) assert.equal(snapAt(positionOf(v, "decade"), "decade"), v);
});

test("formatting in English and Dutch", () => {
  assert.equal(formatYear(1648), "1648");
  assert.equal(formatYear(-44, "nl"), "44 v.Chr.");
  assert.equal(formatYear(-44, "en"), "44 BC");
  assert.equal(formatYear(800, "nl", true), "800 n.Chr.");
  assert.equal(formatYear(800, "en", true), "AD 800");
  assert.equal(formatValue(1640, "decade", "en"), "the 1640s");
  assert.equal(formatValue(1640, "decade", "nl"), "jaren 1640");
  assert.equal(formatValue(1600, "century", "en"), "17th century");
  assert.equal(formatValue(1600, "century", "nl"), "17e eeuw");
  assert.equal(formatValue(-500, "century", "nl"), "5e eeuw v.Chr.");
  assert.equal(formatValue(1, "century", "en"), "1st century");
  assert.equal(formatValue(1000, "century", "en"), "11th century");
  assert.equal(formatValue(-100, "century", "en", true), "1st century BC");
});

test("parsing years the author types", () => {
  assert.equal(parseYear("1648"), 1648);
  assert.equal(parseYear("-44"), -44);
  assert.equal(parseYear("44 v.Chr."), -44);
  assert.equal(parseYear("44 vChr"), -44);
  assert.equal(parseYear("44 BC"), -44);
  assert.equal(parseYear("500 BCE"), -500);
  assert.equal(parseYear("800 n.Chr."), 800);
  assert.equal(parseYear("AD 800"), 800);
  assert.equal(parseYear("0"), null);
  assert.equal(parseYear("soon"), null);
  assert.equal(parseYear(""), null);
});

test("the tijdvakken", () => {
  const t = tijdvakken("nl");
  assert.equal(t.length, 10);
  assert.equal(t[0].label, "Tijd van jagers en boeren");
  assert.equal(t[9].label, "Tijd van televisie en computer");
  assert.equal(periodOfYear(t, 1648)?.id, "t6");
  assert.equal(periodOfYear(t, 1600)?.id, "t6"); // a boundary belongs to the later period
  assert.equal(periodOfYear(t, -44)?.id, "t2");
  assert.equal(periodOfYear(t, 1969)?.id, "t10");
  assert.equal(periodOfYear(t, -5000)?.id, "t1");
  assert.equal(tijdvakken("en")[3].label, "Cities and states");
});

test("parsing and serializing the timeline", () => {
  const ex = parseTimeline("");
  assert.equal(ex.events.length, 6);
  assert.equal(ex.mode, "date");
  assert.equal(ex.preset, "tijdvakken");
  assert.equal(parseTimeline("not json", "nl").events[0].text, "De Beeldenstorm in de Nederlanden");
  const t = timeline({
    start: "500 v.Chr.", end: 1500, mode: "period", periods: [{ id: "a", label: "A", start: -500, end: 500 }, { label: "B", start: 500, end: 1500 }],
    events: [{ text: "x", year: "44 v.Chr." }, { id: "e1", text: "y", period: "p2" }, ...Array.from({ length: 20 }, () => ({ text: "z" }))],
  });
  assert.equal(t.start, -500);
  assert.equal(t.events.length, 12);
  assert.equal(t.events[0].year, -44);
  assert.equal(t.events[1].id, "e2"); // ids stay unique
  assert.deepEqual(t.periods.map((p) => p.id), ["a", "p2"]);
  const again = parseTimeline(serializeTimeline(t));
  assert.deepEqual(again, t);
  // period mode without periods gets the tijdvakken
  assert.equal(timeline({ mode: "period", events: [] }).periods.length, 10);
  // an end before the start
  const bad = timeline({ start: 2000, end: 1000 });
  assert.ok(toAstro(bad.end) > toAstro(bad.start));
  assert.equal(JSON.parse(serializeTimeline(ex)).periods, "tijdvakken");
});

test("date mode: within the margin, over the start of the era", () => {
  const t = timeline({ start: -100, end: 100, mode: "date", margin: 5, events: [{ text: "a", year: -3 }, { text: "b", year: 50 }] });
  const e = evaluate(t, { e1: 2, e2: 56 });
  assert.deepEqual(e.checks, [true, false]); // 3 BC to AD 2 is 4 years
  assert.equal(e.score, 1);
  assert.equal(e.maxscore, 2);
  assert.equal(e.correct, false);
  assert.equal(evaluate(t, { e1: 2, e2: 55 }).correct, true);
  assert.equal(evaluate({ ...t, scoring: "all" }, { e1: 2, e2: 56 }).score, 0);
  assert.equal(evaluate({ ...t, scoring: "all" }, { e1: 2, e2: 55 }).maxscore, 1);
  assert.equal(evaluate(t, {}).score, 0);
});

test("date mode with centuries: the correct value is the century", () => {
  const t = timeline({ start: -800, end: 2000, unit: "century", margin: 0, events: [{ text: "a", year: 1648 }, { text: "b", year: -450 }] });
  assert.deepEqual(correctPlacements(t), { e1: 1600, e2: -500 });
  assert.equal(evaluate(t, { e1: 1600, e2: -500 }).correct, true);
  assert.equal(evaluate(t, { e1: 1700, e2: -500 }).score, 1);
});

test("period mode", () => {
  const t = timeline({ start: -3000, end: 2000, mode: "period", periods: "tijdvakken", events: [{ text: "a", year: 1648 }, { text: "b", period: "t2" }, { text: "c", year: 1950 }] });
  assert.deepEqual(correctPlacements(t), { e1: "t6", e2: "t2", e3: "t10" });
  const e = evaluate(t, { e1: "t6", e2: "t3" });
  assert.deepEqual(e.checks, [true, false, false]);
  assert.equal(e.score, 1);
  assert.equal(e.maxscore, 3);
  assert.deepEqual(orderOf(t, { e1: "t6", e2: "t3" }), ["e2", "e1"]);
});

test("order mode: pairs in the right order (Kendall)", () => {
  const t = timeline({ start: 0, end: 2000, mode: "order", events: [{ text: "a", year: 800 }, { text: "b", year: 1200 }, { text: "c", year: 1600 }, { text: "d", year: 1900 }] });
  const all = evaluate(t, { e1: 10, e2: 20, e3: 30, e4: 40 });
  assert.equal(all.score, 6);
  assert.equal(all.maxscore, 6);
  assert.equal(all.correct, true);
  // b and c swapped: one pair wrong
  const swap = evaluate(t, { e1: 10, e2: 30, e3: 20, e4: 40 });
  assert.equal(swap.pairs, 5);
  assert.deepEqual(swap.checks, [true, false, false, true]);
  assert.deepEqual(swap.order, ["e1", "e3", "e2", "e4"]);
  // reversed: none
  assert.equal(evaluate(t, { e1: 40, e2: 30, e3: 20, e4: 10 }).score, 0);
  // a tie is not an order; one missing
  assert.equal(evaluate(t, { e1: 10, e2: 10, e3: 30 }).pairs, 2);
  assert.equal(evaluate({ ...t, scoring: "all" }, { e1: 10, e2: 20, e3: 30, e4: 40 }).score, 1);
  // a tie in the answer counts either way
  const tie = timeline({ mode: "order", start: 1, end: 2000, events: [{ text: "a", year: 1000 }, { text: "b", year: 1000 }, { text: "c", year: 1500 }] });
  assert.equal(evaluate(tie, { e1: 20, e2: 10, e3: 30 }).maxscore, 2);
  assert.equal(evaluate(tie, { e1: 20, e2: 10, e3: 30 }).correct, true);
});

test("the response fields", () => {
  const t = exampleTimeline();
  const f = responseFields(t, { e1: 1570, e2: 1700 });
  const get = (name: string) => f.find((x) => x[0] === name)?.[2];
  assert.equal(get("score"), 1);
  assert.equal(get("maxscore"), 6);
  assert.equal(get("check1"), 1);
  assert.equal(get("check2"), 0);
  assert.equal(get("year1"), 1570);
  assert.equal(get("year3"), undefined);
  assert.equal(get("period1"), "t5");
  assert.equal(get("period2"), "t7");
  assert.equal(get("order"), "e1 e2");
  assert.equal(get("placements"), '{"e1":1570,"e2":1700}');
  const o = timeline({ mode: "order", events: [{ text: "a", year: 1600 }, { text: "b", year: 1700 }] });
  const fo = responseFields(o, { e2: 1550, e1: 1520 });
  assert.equal(fo.find((x) => x[0] === "pairs")?.[2], 1);
  assert.equal(fo.find((x) => x[0] === "year1"), undefined);
});

test("own placements: only events that exist, snapped, on the axis", () => {
  const t = exampleTimeline();
  assert.deepEqual(ownPlacements(t, { e1: 1648.3, e9: 1700, e2: "x", e3: 3000 }), { e1: 1648, e3: 2000 });
  const p = timeline({ mode: "period", events: [{ text: "a" }] });
  assert.deepEqual(ownPlacements(p, { e1: "t4" }), { e1: "t4" });
  assert.deepEqual(ownPlacements(p, { e1: "t99" }), {});
  assert.equal(placedPosition(t, 1648), 1648);
  assert.equal(placedPosition(p, "t1"), null); // outside the axis
  assert.equal(placedPosition(p, "t6"), 1650);
});

test("the tolerance over the start of the era, and the response processing", () => {
  assert.equal(toleranceFor(1648, 10), "10");
  assert.equal(toleranceFor(-5, 10), "10 11"); // up to AD 6, no year 0 in between
  assert.equal(toleranceFor(3, 10), "11 10");
  const xml = responseProcessingXml(exampleTimeline());
  assert.match(xml, /<qti-equal tolerance-mode="absolute" tolerance="10"><qti-field-value field-identifier="year2">/);
  assert.match(xml, /<qti-value>6<\/qti-value>/);
  const p = timeline({ mode: "period", scoring: "all", events: [{ text: "a", year: 1648 }] });
  assert.match(responseProcessingXml(p), /<qti-and>[\s\S]*<qti-match><qti-field-value field-identifier="period1">.*identifier">t6</);
  const o = timeline({ mode: "order", events: [{ text: "a", year: 1600 }, { text: "b", year: 1700 }, { text: "c", year: 1800 }] });
  assert.match(responseProcessingXml(o), /field-identifier="score"/);
  assert.match(responseProcessingXml(o), /<qti-value>3<\/qti-value>/);
});

test("problems for the author", () => {
  assert.deepEqual(problemsOf(exampleTimeline()), []);
  const codes = (t: Record<string, unknown>) => problemsOf(timeline(t)).map((p) => p.code);
  assert.deepEqual(codes({ events: [] }), ["noEvents"]);
  assert.deepEqual(codes({ start: 1500, end: 2000, events: [{ text: "" , year: 1600 }, { text: "b" }, { text: "c", year: 1200 }] }), ["noText", "noYear", "outside"]);
  assert.deepEqual(codes({ mode: "order", events: [{ text: "a", year: 1600 }] }), ["fewEvents"]);
  assert.deepEqual(codes({ mode: "order", events: [{ text: "a", year: 1600 }, { text: "b", year: 1600 }] }), ["allSameYear"]);
  assert.deepEqual(codes({ start: 1500, end: 2000, mode: "period", periods: "tijdvakken", events: [{ text: "a", year: 1000 }] }), ["noPeriod"]);
  assert.deepEqual(codes({ periods: [{ id: "x", label: "", start: 1600, end: 1500 }], events: [{ text: "a", year: 1600 }] }), ["periodLabel", "periodRange"]);
});

test("ticks, lanes and the view", () => {
  const tk = ticks(toAstro(-500), toAstro(500), 800, "year");
  assert.ok(tk.every((t) => t.year !== 0));
  assert.ok(tk.some((t) => t.year === 1 && t.position === 1));
  assert.ok(tk.some((t) => t.year === -100 && t.position === -99));
  assert.equal(new Set(tk.map((t) => t.position)).size, tk.length);
  const c = ticks(1500, 2000, 1000, "century");
  assert.deepEqual(c.map((t) => t.year), [1500, 1600, 1700, 1800, 1900, 2000]);
  const lanes = assignLanes([{ id: "a", x: 100 }, { id: "b", x: 150 }, { id: "c", x: 300 }, { id: "d", x: 160 }], 120);
  assert.deepEqual(lanes, { a: 0, b: 1, d: 2, c: 0 });
  assert.deepEqual(zoomView([0, 1000], 2, 500, [0, 1000], 10), [250, 750]);
  assert.deepEqual(zoomView([0, 1000], 1000, 0, [0, 1000], 10), [0, 10]);
  assert.deepEqual(zoomView([250, 750], 0.1, 500, [0, 1000], 10), [0, 1000]);
  assert.deepEqual(clampView([900, 1100], [0, 1000]), [800, 1000]);
});
