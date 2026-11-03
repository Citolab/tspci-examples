// npm test: where the parts of the models are drawn and how the arrow keys move (src/geometry.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { barPart, gridCell, gridCellSize, nextPart, onCircle, scaleTicks, sectorPath, setCentre, setColumns } from "../src/geometry.ts";

test("bar parts are equal and fill the bar", () => {
  const parts = Array.from({ length: 8 }, (_, i) => barPart(i, 8, 400, 60));
  assert.equal(parts[0].x, 0);
  assert.equal(parts[7].x + parts[7].width, 400);
  assert.ok(parts.every((p) => p.width === 50 && p.height === 60));
});

test("circle sectors go clockwise from the top", () => {
  assert.deepEqual(onCircle(0, 100, 100, 50), { x: 100, y: 50 });
  assert.deepEqual(onCircle(0.25, 100, 100, 50), { x: 150, y: 100 });
  assert.equal(sectorPath(0, 4, 100, 100, 50), "M 100 100 L 100 50 A 50 50 0 0 1 150 100 Z");
  assert.ok(sectorPath(0, 1, 100, 100, 50).startsWith("M 50 100 A"), "one part: the whole disc");
  assert.ok(sectorPath(0, 2, 0, 0, 10).includes("A 10 10 0 0 1"), "a half is not a large arc");
});

test("grid cells in reading order; the grid stays at most 320 wide", () => {
  assert.equal(gridCellSize(10, 10), 30);
  assert.equal(gridCellSize(12, 12), 26);
  assert.equal(gridCellSize(1, 2), 30);
  assert.deepEqual(gridCell(13, 10, 30), { x: 90, y: 30, width: 30, height: 30 });
});

test("a set in rows of at most 8, as even as possible", () => {
  assert.equal(setColumns(5), 5);
  assert.equal(setColumns(12), 6);
  assert.equal(setColumns(24), 8);
  assert.equal(setColumns(20), 7);
  assert.deepEqual(setCentre(7, 6), { x: 66, y: 66 });
});

test("the percentage scale: every 5 %, a label every 10 %", () => {
  const ticks = scaleTicks(400);
  assert.equal(ticks.length, 21);
  assert.deepEqual(ticks[7], { percent: 35, x: 140, major: false });
  assert.equal(ticks.filter((t) => t.major).length, 11);
});

test("nextPart: arrows along the parts, up and down a row in a grid", () => {
  assert.equal(nextPart("ArrowRight", 7, 8), 7);
  assert.equal(nextPart("ArrowDown", 2, 8), 3);
  assert.equal(nextPart("ArrowLeft", 0, 8), 0);
  assert.equal(nextPart("ArrowDown", 5, 100, 10), 15);
  assert.equal(nextPart("ArrowDown", 95, 100, 10), 95);
  assert.equal(nextPart("ArrowUp", 15, 100, 10), 5);
  assert.equal(nextPart("End", 0, 100, 10), 99);
  assert.equal(nextPart("Home", 50, 100, 10), 0);
  assert.equal(nextPart("a", 0, 8), null);
});
