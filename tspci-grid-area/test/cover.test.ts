// npm test: the floor covering task (src/cover.ts) in node: the room and its walls, strips, the least plan, the bill and
// the response.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  billFor, coverCorrectFields, coverProblems, coverResponseFields, coverSettingsFrom, doorOf, emptyCoverWork, eurosText, fitStrip, leastPlan,
  measurePlan, parseEuros, parseMetres, parseSquareMetres, parseStrips, perimeterSquares, resizeStrip, serializeStrips, skirtingMetres,
  solutionPlan, solutionWork, turnStrip, walls, workFromFields, type CoverWork, type Strip,
} from "../src/cover.ts";
import { parseShape } from "../src/grid.ts";

// the default room: an L of 6 m by 5 m without a corner of 2 m by 2 m, at 1 m a square, on 12 × 8
const L_ROOM = "/.######/.######/.######/.####/.####";
const settings = (properties: Record<string, string> = {}) =>
  coverSettingsFrom({
    task: "cover", columns: "12", rows: "8", room: L_ROOM, scale: "1", rollWidth: "4", price: "39.95", skirtingPrice: "2.50", thresholdPrice: "12.95",
    doorWidth: "0.8", door: "5", ...properties,
  });
const fields = (list: { name: string; base: Record<string, unknown> }[] | undefined) =>
  list && Object.fromEntries(list.map((f) => [f.name, Object.values(f.base)[0]]));
const work = (extra: Partial<CoverWork> = {}): CoverWork => ({ ...emptyCoverWork(), ...extra });
const down = (x: number, y: number, length: number): Strip => ({ x, y, length, vertical: true });
const across = (x: number, y: number, length: number): Strip => ({ x, y, length, vertical: false });

test("numbers, lengths, areas and amounts as a pupil writes them", () => {
  assert.equal(parseMetres("8"), 8);
  assert.equal(parseMetres("21,2 m"), 21.2);
  assert.equal(parseMetres(" 8.5m "), 8.5);
  assert.equal(parseMetres("acht"), undefined);
  assert.equal(parseSquareMetres("26 m²"), 26);
  assert.equal(parseSquareMetres("17,25m2"), 17.25);
  assert.equal(parseSquareMetres("26 m"), undefined);
  assert.equal(parseEuros("319,60"), 31960);
  assert.equal(parseEuros("€ 319,6"), 31960);
  assert.equal(parseEuros("€319.60"), 31960);
  assert.equal(parseEuros("319,-"), 31900);
  assert.equal(parseEuros("1.234,50"), 123450);
  assert.equal(parseEuros("1,234.50"), 123450);
  assert.equal(parseEuros("12"), 1200);
  assert.equal(parseEuros("3,195"), 319500); // a thousands separator: 3195 euros
  for (const bad of ["", "abc", "3,1955", "-3", "12 m"]) assert.equal(parseEuros(bad), undefined, bad);
  // as tspci-money writes them
  assert.equal(eurosText(735, "en"), "€7.35");
  assert.equal(eurosText(735, "nl"), "€ 7,35");
  assert.equal(eurosText(31960, "nl"), "€ 319,60");
});

test("the settings: defaults, scale, the roll in squares", () => {
  const s = coverSettingsFrom({ task: "cover" });
  assert.equal(s.scale, 1);
  assert.equal(s.rollWidth, 4);
  assert.equal(s.width, 4);
  assert.equal(s.parts, "all");
  assert.equal(s.material, "carpet");
  assert.equal(s.price, null);
  const half = settings({ scale: "0,5", rollWidth: "4" });
  assert.equal(half.scale, 0.5);
  assert.equal(half.width, 8);
  // a roll that is not a whole number of squares
  assert.equal(settings({ rollWidth: "3,5" }).width, 0);
  assert.equal(settings({ scale: "0.5", rollWidth: "3,5" }).width, 7);
  assert.equal(settings({ price: "€ 39,95" }).price, 3995);
});

test("the walls of the room, clockwise from the top left", () => {
  const s = settings();
  const w = walls(s.room);
  assert.deepEqual(w.map((wall) => [wall.side, wall.length]), [["top", 6], ["right", 3], ["bottom", 2], ["right", 2], ["bottom", 4], ["left", 5]]);
  assert.deepEqual(w[0], { x1: 1, y1: 1, x2: 7, y2: 1, length: 6, side: "top" });
  assert.equal(perimeterSquares(s.room), 22);
  // a rectangle, and a room with a chimney breast (a notch in a wall)
  assert.deepEqual(walls(parseShape("###/###", 5, 5)).map((wall) => wall.length), [3, 2, 3, 2]);
  // a chimney breast: a notch in the top wall, 1 m wide and 1 m deep
  const chimney = walls(parseShape("#..#/####/####", 6, 6));
  assert.deepEqual(chimney.map((wall) => [wall.side, wall.length]), [["top", 1], ["right", 1], ["top", 2], ["left", 1], ["top", 1], ["right", 3], ["bottom", 4], ["left", 3]]);
  assert.equal(perimeterSquares(parseShape("#..#/####/####", 6, 6)), 16);
  // the door: in the middle of wall 5 (4 m), 0.8 m wide
  assert.deepEqual(doorOf(s), { wall: 5, from: 1.6, to: 2.4 });
  assert.equal(skirtingMetres(s), 21.2);
  assert.equal(doorOf(settings({ door: "" })), null);
  assert.equal(skirtingMetres(settings({ door: "" })), 22);
  assert.equal(doorOf(settings({ door: "9" })), null); // no wall 9
  assert.equal(doorOf(settings({ door: "3", doorWidth: "2.5" })), null); // wider than its wall
});

test("strips on the grid: fitted, longer and shorter, turned, as text", () => {
  assert.deepEqual(fitStrip(across(10, 7, 6), 4, 12, 8), { x: 6, y: 4, length: 6, vertical: false });
  assert.deepEqual(fitStrip(across(0, 0, 30), 4, 12, 8), { x: 0, y: 0, length: 12, vertical: false });
  assert.equal(fitStrip(across(0, 0, 3), 9, 12, 8), null); // a roll of 9 squares does not fit across 8 rows
  assert.deepEqual(resizeStrip(across(8, 0, 2), 9, 12, 8), { x: 8, y: 0, length: 4, vertical: false });
  assert.deepEqual(resizeStrip(across(8, 0, 2), 0, 12, 8), { x: 8, y: 0, length: 1, vertical: false });
  assert.deepEqual(turnStrip(across(1, 1, 6), 4, 12, 8), { x: 1, y: 1, length: 6, vertical: true });
  assert.deepEqual(turnStrip(across(9, 6, 2), 4, 12, 8), { x: 8, y: 6, length: 2, vertical: true });
  const s = settings({ scale: "0.5", columns: "20", rows: "14" });
  assert.equal(serializeStrips([down(10, 2, 10), across(2, 2, 12)], 0.5), "across 1 1 6; down 5 1 5");
  assert.deepEqual(parseStrips("across 1 1 6; down 5 1 5; nonsense; up 1 1 1", s), [across(2, 2, 12), down(10, 2, 10)]);
  assert.deepEqual(parseStrips("down 2,5 0 1", s), [down(5, 0, 2)]);
});

test("what a plan covers and wastes", () => {
  const s = settings();
  // two strips top to bottom: 5 m and 3 m, 32 m² for 26 m² of floor
  const best = measurePlan(s.room, [down(1, 1, 5), down(5, 1, 3)], 4);
  assert.deepEqual(best, { stripSquares: 32, runningSquares: 8, coveredSquares: 26, covered: true, wasteSquares: 6 });
  // left to right: 6 m and 6 m: 48 m², waste 22
  const across2 = measurePlan(s.room, [across(1, 1, 6), across(1, 4, 6)], 4);
  assert.equal(across2.covered, true);
  assert.equal(across2.wasteSquares, 22);
  // overlapping strips: the floor under both counts once, the rest is waste
  const twice = measurePlan(s.room, [down(1, 1, 5), down(1, 1, 5)], 4);
  assert.equal(twice.covered, false);
  assert.equal(twice.coveredSquares, 20);
  assert.equal(twice.wasteSquares, 20);
});

test("the least plan: per column, the same way round", () => {
  const s = settings();
  const least = leastPlan(s.room, 4)!;
  assert.equal(least.runningSquares, 8);
  assert.equal(least.vertical, true);
  assert.deepEqual(least.strips, [down(1, 1, 5), down(5, 1, 3)]);
  // a rectangle of 6 by 3 with a roll of 4: one strip left to right of 6 m
  assert.deepEqual(leastPlan(parseShape("/.######/.######/.######", 12, 8), 4)!.strips, [across(1, 1, 6)]);
  // a staircase: strips that do not line up in bands (4 + 4, not 8 + 4)
  const stairs = leastPlan(parseShape("####/####/####/####/....####/....####/....####/....####", 8, 8), 4)!;
  assert.equal(stairs.runningSquares, 8);
  const staggered = leastPlan(parseShape("##/##/####/####/..##/..##", 4, 6), 4)!;
  assert.deepEqual(staggered.strips, [across(0, 0, 2), across(2, 2, 2)]); // not a band of 4 and one of 2
  // a bay window: top to bottom, two bands of the roll's width (6 m over the bay, and 5 m), not three pieces
  const bay = leastPlan(parseShape("/...##/.######/.######/.######/.######/.######", 12, 10), 4)!;
  assert.equal(bay.runningSquares, 11);
  assert.deepEqual(bay.strips, [down(1, 1, 6), down(5, 2, 5)]);
  // at 0.5 m a square a roll of 4 m is 8 squares: the L at 0.5 m
  const half = settings({ scale: "0.5", columns: "16", rows: "14", room: "/.############/.############/.############/.############/.############/.############/.########/.########/.########/.########" });
  assert.equal(leastPlan(half.room, half.width)!.runningSquares, 16); // 8 m
  // nothing fits: a roll wider than the grid both ways
  assert.equal(leastPlan(s.room, 13), null);
});

test("the solution plan: the author's when it is as good, else the least", () => {
  assert.deepEqual(solutionPlan(settings()), [down(1, 1, 5), down(5, 1, 3)]);
  // the author's plan has more waste: the pupil lays strips, so the least plan
  assert.deepEqual(solutionPlan(settings({ strips: "across 1 1 6; across 1 4 6" })), [down(1, 1, 5), down(5, 1, 3)]);
  // the pupil only does the bill: the author's plan stays
  assert.deepEqual(solutionPlan(settings({ coverParts: "bill", strips: "across 1 1 6; across 1 4 6" })), [across(1, 1, 6), across(1, 4, 6)]);
});

test("the bill", () => {
  const s = settings();
  const bill = billFor(s, [down(1, 1, 5), down(5, 1, 3)])!;
  assert.deepEqual(bill.lines, [
    { id: "covering", metres: 8, price: 3995, amount: 31960 },
    { id: "skirting", metres: 21.2, price: 250, amount: 5300 },
    { id: "threshold", metres: null, price: 1295, amount: 1295 },
  ]);
  assert.equal(bill.total, 38555);
  // without skirting and threshold: one line
  assert.deepEqual(billFor(settings({ skirtingPrice: "", thresholdPrice: "" }), [down(1, 1, 5)])!.lines.map((l) => l.id), ["covering"]);
  assert.equal(billFor(settings({ price: "" }), []), null);
  // rounded to the cent
  assert.equal(billFor(settings({ price: "12.99", scale: "0.5", columns: "16", rows: "14" }), [down(0, 0, 3)])!.lines[0].amount, 1949); // 1.5 m × 12.99 = 19.485
});

test("the response: nothing until something is answered", () => {
  const s = settings();
  assert.equal(coverResponseFields(s, work()), undefined);
  assert.equal(coverResponseFields(s, work({ floorArea: "zesentwintig" })), undefined);
  assert.deepEqual(fields(coverResponseFields(s, work({ floorArea: "26" }))), {
    area: 26, areaCorrect: true, covered: false, leastWaste: false, billCorrect: false, totalCorrect: false, correct: false,
  });
});

test("the response of a whole task, right", () => {
  const s = settings();
  const right = work({
    floorArea: "26", strips: [down(5, 1, 3), down(1, 1, 5)], coveringMetres: "8", coveringAmount: "319,60", skirtingMetres: "21,2", skirtingAmount: "53",
    thresholdAmount: "12,95", total: "€ 385,55",
  });
  assert.deepEqual(fields(coverResponseFields(s, right)), {
    area: 26, areaCorrect: true, covered: true, waste: 6, runningMetres: 8, leastWaste: true, strips: "down 1 1 5; down 5 1 3",
    billCorrect: true, total: 385.55, totalCorrect: true,
    bill: "coveringMetres=8; coveringAmount=319.6; skirtingMetres=21.2; skirtingAmount=53; thresholdAmount=12.95", correct: true,
  });
  // the field order is the order of the response declaration
  assert.deepEqual(coverResponseFields(s, right)!.map((f) => f.name), [
    "area", "areaCorrect", "covered", "waste", "runningMetres", "leastWaste", "strips", "billCorrect", "total", "totalCorrect", "bill", "correct",
  ]);
});

test("the response follows the pupil's own plan and numbers", () => {
  const s = settings();
  // strips left to right: covered, but 12 m; the bill for 12 m is right, the plan does not have the least waste
  const own = work({
    floorArea: "26", strips: [across(1, 1, 6), across(1, 4, 6)], coveringMetres: "12", coveringAmount: "479,40", skirtingMetres: "21,2", skirtingAmount: "53,00",
    thresholdAmount: "12,95", total: "545,35",
  });
  assert.deepEqual(fields(coverResponseFields(s, own)), {
    area: 26, areaCorrect: true, covered: true, waste: 22, runningMetres: 12, leastWaste: false, strips: "across 1 1 6; across 1 4 6",
    billCorrect: true, total: 545.35, totalCorrect: true,
    bill: "coveringMetres=12; coveringAmount=479.4; skirtingMetres=21.2; skirtingAmount=53; thresholdAmount=12.95", correct: false,
  });
  // a wrong amount: the bill is not right, but a total that adds up the pupil's own amounts is
  const wrongLine = { ...own, coveringAmount: "480", total: "545,95" };
  assert.deepEqual(fields(coverResponseFields(s, wrongLine)), { ...fields(coverResponseFields(s, own)), billCorrect: false, total: 545.95, bill: "coveringMetres=12; coveringAmount=480; skirtingMetres=21.2; skirtingAmount=53; thresholdAmount=12.95" });
  // the skirting with the door not taken off
  assert.equal(fields(coverResponseFields(s, { ...own, skirtingMetres: "22", skirtingAmount: "55", total: "547,35" }))!.billCorrect, false);
  // a total that does not add up
  assert.equal(fields(coverResponseFields(s, { ...own, total: "545" }))!.totalCorrect, false);
  // the plan does not cover the floor
  assert.equal(fields(coverResponseFields(s, { ...own, strips: [down(1, 1, 5)] }))!.covered, false);
});

test("only the parts the pupil does", () => {
  const area = settings({ coverParts: "area" });
  assert.deepEqual(fields(coverResponseFields(area, work({ floorArea: "25", strips: [down(1, 1, 5)] }))), { area: 25, areaCorrect: false, correct: false });
  // at 0.5 m a square: a square is 0.25 m²
  const half = settings({ coverParts: "area", scale: "0.5", room: "###/###/#" });
  assert.deepEqual(fields(coverResponseFields(half, work({ floorArea: "1,75" }))), { area: 1.75, areaCorrect: true, correct: true });
  const strips = settings({ coverParts: "strips" });
  assert.deepEqual(fields(coverResponseFields(strips, work({ floorArea: "26", strips: [down(1, 1, 5), down(5, 1, 3)] }))), {
    covered: true, waste: 6, runningMetres: 8, leastWaste: true, strips: "down 1 1 5; down 5 1 3", correct: true,
  });
  // the bill only: of the author's plan (or the least one)
  const bill = settings({ coverParts: "bill", strips: "across 1 1 6; across 1 4 6", skirtingPrice: "", thresholdPrice: "" });
  assert.deepEqual(fields(coverResponseFields(bill, work({ coveringMetres: "12", coveringAmount: "479,40", total: "479,40" }))), {
    billCorrect: true, total: 479.4, totalCorrect: true, bill: "coveringMetres=12; coveringAmount=479.4", correct: true,
  });
});

test("the correct response from the settings, and showing it again", () => {
  const s = settings();
  assert.deepEqual(fields(coverCorrectFields(s)), {
    area: 26, areaCorrect: true, covered: true, waste: 6, runningMetres: 8, leastWaste: true, strips: "down 1 1 5; down 5 1 3",
    billCorrect: true, total: 385.55, totalCorrect: true,
    bill: "coveringMetres=8; coveringAmount=319.6; skirtingMetres=21.2; skirtingAmount=53; thresholdAmount=12.95", correct: true,
  });
  // read back from the response, in Dutch: the same response
  const shown = { ...emptyCoverWork(), ...workFromFields(fields(coverCorrectFields(s))!, s, "nl") };
  assert.equal(shown.floorArea, "26");
  assert.equal(shown.coveringAmount, "319,60");
  assert.equal(shown.skirtingMetres, "21,2");
  assert.equal(shown.total, "385,55");
  assert.deepEqual(coverResponseFields(s, shown), coverCorrectFields(s));
  assert.deepEqual(solutionWork(s, "en")!.strips, [down(1, 1, 5), down(5, 1, 3)]);
  // no answer: no room, no price for a bill
  assert.equal(coverCorrectFields(settings({ room: "" })), undefined);
  assert.equal(coverCorrectFields(settings({ price: "" })), undefined);
  assert.deepEqual(fields(coverCorrectFields(settings({ price: "", coverParts: "area" }))), { area: 26, areaCorrect: true, correct: true });
});

test("what the author must fix", () => {
  assert.deepEqual(coverProblems(settings()), []);
  assert.deepEqual(coverProblems(settings({ room: "" })), ["noRoom"]);
  assert.deepEqual(coverProblems(settings({ room: "##/../##" })), ["roomPieces"]);
  assert.deepEqual(coverProblems(settings({ room: "###/#.#/###" })), ["roomHoles"]);
  assert.deepEqual(coverProblems(settings({ rollWidth: "3,5" })), ["rollWidth"]);
  assert.deepEqual(coverProblems(settings({ rollWidth: "13" })), ["noPlan"]);
  assert.deepEqual(coverProblems(settings({ door: "9" })), ["noDoorWall"]);
  assert.deepEqual(coverProblems(settings({ door: "3", doorWidth: "2,5" })), ["doorTooWide"]);
  assert.deepEqual(coverProblems(settings({ price: "" })), ["noPrice"]);
  assert.deepEqual(coverProblems(settings({ price: "", coverParts: "strips" })), []);
  assert.deepEqual(coverProblems(settings({ strips: "down 1 1 5" })), ["planNotCovering"]);
  assert.deepEqual(coverProblems(settings({ strips: "across 1 1 6; across 1 4 6" })), ["planNotLeast"]);
  assert.deepEqual(coverProblems(settings({ strips: "across 1 1 6; across 1 4 6", coverParts: "bill" })), []);
});
