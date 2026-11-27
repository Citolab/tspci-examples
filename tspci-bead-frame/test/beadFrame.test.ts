// npm test: the settings, the grid, clicks, drags and keys, the checks and the response of the bead frame and the
// hundred field (src/beadFrame.ts), and the question (src/texts.ts), in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BEAD, FREE, GAP, ROD, beadX, clickCount, correctResponseOf, counts, countsOf, dragCount, emptyGrid, gridFromCounts, gridKey,
  isStructured, isViaTen, paintCell, parseLayout, parseSettings, pushRow, responseOf, rowCount, sameCounts, serializeLayout,
  sliderKey, startGrid, structuredGrid, target, toggleFill, wholeNumber, type Grid,
} from "../src/beadFrame.ts";
import { TEXTS, questionText, textsFor } from "../src/texts.ts";

const rows = (grid: Grid) => grid.map(rowCount);
const field = (response: unknown, name: string) => (response as { record: { name: string; base: Record<string, unknown> }[] }).record.find((f) => f.name === name)?.base;
const names = (response: unknown) => (response as { record: { name: string }[] }).record.map((f) => f.name);

test("settings: the model, its rows, the task and the numbers (they arrive as text)", () => {
  const s = parseSettings({ model: "rekenrek", size: "20", task: "set", number: "13" });
  assert.deepEqual([s.model, s.rows, s.task, s.number, s.look, s.layout], ["rekenrek", 2, "set", 13, "squares", null]);
  assert.equal(parseSettings({ size: "100" }).rows, 10);
  assert.equal(parseSettings({ model: "hundred", size: "20" }).rows, 10); // the hundred field is always 10 × 10
  assert.equal(parseSettings({ task: "whatever" }).task, "set");
  assert.equal(parseSettings({ cells: "dots" }).look, "dots");
  // a number that does not fit on the frame is no number; nor is a sum that does not fit
  assert.equal(parseSettings({ number: "21" }).number, null);
  assert.equal(parseSettings({ size: "100", number: "21" }).number, 21);
  assert.equal(parseSettings({ number: "15", add: "8" }).add, null);
  assert.equal(parseSettings({ number: "8", add: "5" }).add, 5);
  for (const bad of ["", "-1", "1.5", "abc", "1e2"]) assert.equal(wholeNumber(bad, 0, 100), null, bad);
  assert.equal(wholeNumber(" 7 ", 0, 100), 7);
});

test("the target: the number, or the sum, only when the settings give it", () => {
  assert.equal(target(parseSettings({ task: "set", number: "13" })), 13);
  assert.equal(target(parseSettings({ task: "set", number: "0" })), null);
  assert.equal(target(parseSettings({ task: "addition", number: "8", add: "5" })), 13);
  assert.equal(target(parseSettings({ task: "addition", number: "8", add: "" })), null);
  assert.equal(target(parseSettings({ task: "show", number: "8" })), null);
});

test("a structured grid: full rows first, from the top left; the second part after the first", () => {
  assert.deepEqual(rows(structuredGrid(2, 13)), [10, 3]);
  assert.deepEqual(structuredGrid(2, 8, 5)[0], [1, 1, 1, 1, 1, 1, 1, 1, 2, 2]);
  assert.deepEqual(structuredGrid(2, 8, 5)[1], [2, 2, 2, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(rows(structuredGrid(2, 30)), [10, 10]); // no more than fits
  assert.deepEqual(counts(structuredGrid(10, 47, 6)), { value: 53, first: 47, second: 6 });
});

test("the start: empty, or what a frame that only shows a number shows", () => {
  assert.deepEqual(rows(startGrid(parseSettings({ task: "set", number: "13" }))), [0, 0]);
  assert.deepEqual(rows(startGrid(parseSettings({ task: "show", number: "13" }))), [10, 3]);
  assert.deepEqual(rows(startGrid(parseSettings({ task: "show", number: "13", layout: "1111100000/1111111100" }))), [5, 8]);
  assert.equal(startGrid(parseSettings({ model: "hundred", task: "show", number: "37" })).flat().filter(Boolean).length, 37);
});

test("structured: the way the frame is read", () => {
  assert.equal(isStructured(structuredGrid(2, 13)), true);
  assert.equal(isStructured(emptyGrid(2)), true);
  // 13 as 5 and 8: the right number, not the way the frame is read
  let grid = pushRow(pushRow(emptyGrid(2), 0, 5, 1), 1, 8, 1);
  assert.equal(counts(grid).value, 13);
  assert.equal(isStructured(grid), false);
  // 3 on the bottom row only
  assert.equal(isStructured(pushRow(emptyGrid(2), 1, 3, 1)), false);
  // the hundred field: the first squares in reading order, or not
  grid = paintCell(paintCell(emptyGrid(10), 0, 0, 1), 0, 1, 1);
  assert.equal(isStructured(grid), true);
  assert.equal(isStructured(paintCell(grid, 0, 3, 1)), false);
  assert.equal(isStructured(paintCell(grid, 1, 0, 1)), false);
});

test("via ten: 8 + 5 as 8, 2 to fill the row, and 3 on the next", () => {
  assert.equal(isViaTen(structuredGrid(2, 8, 5)), true);
  // 8 on the top row, 5 on the next: both parts right, not via ten
  const below = pushRow(pushRow(emptyGrid(2), 0, 8, 1), 1, 5, 2);
  assert.deepEqual(counts(below), { value: 13, first: 8, second: 5 });
  assert.equal(isViaTen(below), false);
  // the colours the other way round
  assert.equal(isViaTen(structuredGrid(2, 5, 8).map((row) => row.map((f) => (f === 0 ? 0 : f === 1 ? 2 : 1)))), false);
  // only one part
  assert.equal(isViaTen(structuredGrid(2, 13)), false);
});

test("the rod: pushed beads stay, new ones get the part, beads go back from the right", () => {
  let grid = pushRow(emptyGrid(2), 0, 8, 1);
  grid = pushRow(grid, 0, 10, 2);
  assert.deepEqual(grid[0], [1, 1, 1, 1, 1, 1, 1, 1, 2, 2]);
  grid = pushRow(grid, 0, 9, 1);
  assert.deepEqual(grid[0], [1, 1, 1, 1, 1, 1, 1, 1, 2, 0]);
  assert.equal(pushRow(grid, 0, 9, 2), grid); // no change, the same grid
  assert.deepEqual(pushRow(grid, 0, 12, 1)[0], [1, 1, 1, 1, 1, 1, 1, 1, 2, 1]);
  assert.deepEqual(pushRow(grid, 0, -3, 1)[0], Array(10).fill(0));
  assert.equal(pushRow(grid, 5, 3, 1), grid);
});

test("the hundred field: colouring and uncolouring", () => {
  let grid = paintCell(emptyGrid(10), 2, 3, toggleFill(0, 1));
  assert.equal(grid[2][3], 1);
  grid = paintCell(grid, 2, 3, toggleFill(grid[2][3], 2)); // another colour: recoloured
  assert.equal(grid[2][3], 2);
  grid = paintCell(grid, 2, 3, toggleFill(grid[2][3], 2)); // the same colour: off
  assert.equal(grid[2][3], 0);
  assert.equal(paintCell(grid, 10, 0, 1), grid);
});

test("a click on a bead: it takes the beads to its left (going left) or right (going back) along", () => {
  assert.equal(clickCount(6, 0), 7);
  assert.equal(clickCount(6, 3), 7);
  assert.equal(clickCount(2, 7), 2);
  assert.equal(clickCount(0, 7), 0);
  assert.equal(clickCount(9, 9), 10);
});

test("a drag: half a bead to the left pushes, half a bead back to the right takes back", () => {
  assert.equal(dragCount(6, 3, -BEAD), 7);
  assert.equal(dragCount(6, 3, -BEAD / 4), 3);
  assert.equal(dragCount(6, 3, BEAD), 3); // a bead on the right cannot go further right
  assert.equal(dragCount(2, 7, BEAD), 2);
  assert.equal(dragCount(2, 7, BEAD / 4), 7);
  assert.equal(dragCount(2, 7, -BEAD), 7);
});

test("keys on a row: the beads move left", () => {
  assert.equal(sliderKey("ArrowLeft", 3), 4);
  assert.equal(sliderKey("ArrowUp", 3), 4);
  assert.equal(sliderKey("ArrowRight", 3), 2);
  assert.equal(sliderKey("ArrowDown", 0), 0);
  assert.equal(sliderKey("ArrowLeft", 10), 10);
  assert.equal(sliderKey("PageUp", 3), 8);
  assert.equal(sliderKey("PageUp", 8), 10);
  assert.equal(sliderKey("PageDown", 3), 0);
  assert.equal(sliderKey("Home", 7), 0);
  assert.equal(sliderKey("End", 7), 10);
  assert.equal(sliderKey("a", 7), null);
});

test("keys in the hundred field: move within the field", () => {
  assert.deepEqual(gridKey("ArrowRight", 0, 9, 10), [0, 9]);
  assert.deepEqual(gridKey("ArrowDown", 9, 4, 10), [9, 4]);
  assert.deepEqual(gridKey("ArrowUp", 3, 4, 10), [2, 4]);
  assert.deepEqual(gridKey("Home", 3, 4, 10), [3, 0]);
  assert.deepEqual(gridKey("End", 3, 4, 10), [3, 9]);
  assert.equal(gridKey(" ", 3, 4, 10), null);
});

test("the beads on the rod: a gap after five, room to move, pushed ones at the left", () => {
  assert.equal(beadX(5, 0) - beadX(4, 0), BEAD + GAP);
  assert.equal(beadX(3, 0) - beadX(3, 5), FREE);
  assert.ok(beadX(9, 0) + BEAD / 2 <= ROD);
  assert.ok(beadX(0, 10) - BEAD / 2 >= 0);
  // pushed and not pushed never overlap
  for (let pushed = 1; pushed < 10; pushed++) assert.ok(beadX(pushed, pushed) - beadX(pushed - 1, pushed) >= BEAD);
});

test("the layout of the authoring mode, and back", () => {
  const grid = structuredGrid(2, 8, 5);
  assert.equal(serializeLayout(grid), "1111111122/2220000000");
  assert.deepEqual(parseLayout(serializeLayout(grid), "rekenrek", 2), grid);
  assert.equal(serializeLayout(emptyGrid(2)), "");
  assert.equal(parseLayout("", "rekenrek", 2), null);
  assert.equal(parseLayout("0000/000", "rekenrek", 2), null);
  assert.equal(parseLayout("1x1", "rekenrek", 2), null);
  // on a rod the beads slide to the left; in the field a square stays where it is
  assert.deepEqual(parseLayout("0101", "rekenrek", 2)![0], [1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(parseLayout("0101", "hundred", 10)![0], [0, 1, 0, 1, 0, 0, 0, 0, 0, 0]);
  assert.equal(parseLayout("1/1/1/1", "rekenrek", 2)!.length, 2);
});

test("the response: nothing until answered, nothing for show", () => {
  const set = parseSettings({ task: "set", number: "13" });
  assert.equal(responseOf(emptyGrid(2), set), undefined);
  assert.equal(responseOf(structuredGrid(2, 13), parseSettings({ task: "show", number: "13" })), undefined);
  const response = responseOf(structuredGrid(2, 13), set);
  assert.deepEqual(response, {
    record: [
      { name: "value", base: { integer: 13 } },
      { name: "structured", base: { boolean: true } },
      { name: "correct", base: { boolean: true } },
    ],
  });
  const fiveAndEight = responseOf(pushRow(pushRow(emptyGrid(2), 0, 5, 1), 1, 8, 1), set);
  assert.deepEqual([field(fiveAndEight, "value"), field(fiveAndEight, "structured"), field(fiveAndEight, "correct")], [
    { integer: 13 }, { boolean: false }, { boolean: true },
  ]);
  assert.deepEqual(field(responseOf(structuredGrid(2, 12), set), "correct"), { boolean: false });
  // without a number to show there is no check of it
  assert.deepEqual(names(responseOf(structuredGrid(2, 12), parseSettings({ task: "set", number: "" }))), ["value", "structured"]);
});

test("the response of a sum: both parts, via ten, and correct per part", () => {
  const sum = parseSettings({ task: "addition", number: "8", add: "5" });
  const response = responseOf(structuredGrid(2, 8, 5), sum);
  assert.deepEqual(names(response), ["value", "first", "second", "structured", "viaTen", "correct"]);
  assert.deepEqual(response!.record.map((f) => Object.values(f.base)[0]), [13, 8, 5, true, true, true]);
  // 13 the other way round, 5 + 8, is not what was asked
  assert.deepEqual(field(responseOf(structuredGrid(2, 5, 8), sum), "correct"), { boolean: false });
});

test("the correct response from the settings, and back to a grid", () => {
  for (const properties of [
    { task: "set", number: "13" },
    { task: "set", size: "100", number: "47" },
    { model: "hundred", task: "set", number: "62" },
    { task: "addition", number: "8", add: "5" },
    { model: "hundred", task: "addition", number: "38", add: "7" },
  ]) {
    const s = parseSettings(properties);
    const correct = correctResponseOf(s)!;
    assert.deepEqual(field(correct, "correct"), { boolean: true }, JSON.stringify(properties));
    assert.deepEqual(field(correct, "structured"), { boolean: true });
    // setResponse(getCorrectResponse(p)) gives getResponse() === getCorrectResponse(p)
    assert.deepEqual(responseOf(gridFromCounts(s, countsOf(correct)!), s), correct, JSON.stringify(properties));
  }
  assert.equal(correctResponseOf(parseSettings({ task: "show", number: "13" })), undefined);
  assert.equal(correctResponseOf(parseSettings({ task: "set", number: "" })), undefined);
  assert.equal(correctResponseOf(parseSettings({ task: "addition", number: "8", add: "" })), undefined);
});

test("the numbers in a response, in any form a player hands it", () => {
  assert.deepEqual(countsOf({ record: [{ name: "value", base: { integer: 13 } }] }), { value: 13, first: 13, second: 0 });
  assert.deepEqual(countsOf({ record: [{ name: "value", base: { integer: 13 } }, { name: "first", base: { integer: 8 } }, { name: "second", base: { integer: 5 } }] }), {
    value: 13, first: 8, second: 5,
  });
  assert.deepEqual(countsOf({ base: { integer: 7 } }), { value: 7, first: 7, second: 0 });
  assert.deepEqual(countsOf([{ base: { integer: 7 } }]), { value: 7, first: 7, second: 0 });
  for (const bad of [null, undefined, "13", { record: [] }, { base: { integer: -1 } }, { base: { string: "7" } }]) assert.equal(countsOf(bad), null);
  // a sum without parts: the first number first
  assert.deepEqual(counts(gridFromCounts(parseSettings({ task: "addition", number: "8", add: "5" }), { value: 13, first: 13, second: 0 })), { value: 13, first: 8, second: 5 });
  assert.equal(sameCounts({ value: 13, first: 8, second: 5 }, { value: 13, first: 8, second: 5 }), true);
  assert.equal(sameCounts({ value: 13, first: 8, second: 5 }, { value: 13, first: 13, second: 0 }), false);
});

test("the question: the author's with the numbers filled in, or the PCI's own", () => {
  const en = textsFor("en");
  assert.equal(questionText("", en, "rekenrek", "set", 13, 5), "Show 13 on the bead frame.");
  assert.equal(questionText("", textsFor("nl"), "hundred", "set", 37, null), "Kleur 37 hokjes in het honderdveld.");
  assert.match(questionText("", en, "rekenrek", "addition", 8, 5), /^Show 8 \+ 5 on the bead frame: first 8, then 5 more/);
  assert.equal(questionText("Hoeveel is {number} + {add}? Samen {sum}.", en, "rekenrek", "addition", 8, 5), "Hoeveel is 8 + 5? Samen 13.");
  assert.equal(questionText("", en, "hundred", "show", 13, null), "");
  assert.equal(questionText("How many beads are pushed to the left?", en, "rekenrek", "show", 13, null), "How many beads are pushed to the left?");
  assert.equal(textsFor("fr"), TEXTS.en);
});

test("what a screen reader hears", () => {
  const en = textsFor("en");
  assert.equal(en.rowValue(7, 5, 2, 0, 13, false), "7 beads pushed (5 red, 2 white). Total 13.");
  assert.equal(en.rowValue(0, 0, 0, 0, 0, false), "0 beads pushed. Total 0.");
  assert.equal(en.rowValue(3, 3, 0, 3, 13, true), "3 beads pushed (3 red), 3 of them with the second colour. Total 13.");
  assert.equal(textsFor("nl").rowValue(1, 1, 0, 0, 1, false), "1 kraal geschoven (1 rood). Totaal 1.");
  assert.equal(en.shows("rekenrek", [10, 3]), "Bead frame with beads pushed to the left: row 1: 10, row 2: 3.");
  assert.equal(en.status("hundred", 13, 8, 5, true), "13 squares coloured: 8 first colour, 5 second colour.");
});
