// npm test: area, perimeter, one piece, holes, rectangles and halves of a shape on squared paper, the rules, and the
// response (src/grid.ts), in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY, FULL, NE, NW, SE, SW, checkRules, compareShapes, correctFields, fieldsOf, measureShape, nextValue, outline, parseNumber,
  parseShape, responseFields, rulesPossible, serializeShape, settingsFrom, type Shape,
} from "../src/grid.ts";

const shape = (text: string, columns = 8, rows = 6): Shape => parseShape(text, columns, rows);
const measure = (text: string, columns = 8, rows = 6) => measureShape(shape(text, columns, rows));

test("a shape as text and back", () => {
  const s = shape("//..####/..####/..####");
  assert.equal(s.cells.filter((v) => v === FULL).length, 12);
  assert.equal(s.cells[2 * 8 + 2], FULL);
  assert.equal(s.cells[2 * 8 + 1], EMPTY);
  assert.equal(serializeShape(s), "//..####/..####/..####");
  // halves a b c d: NW, NE, SE, SW
  assert.deepEqual(shape("abcd#.").cells.slice(0, 6), [NW, NE, SE, SW, FULL, EMPTY]);
  // what does not fit the grid is left out, unknown characters are empty
  assert.equal(serializeShape(shape("#########/#?#", 4, 1)), "####");
  assert.equal(serializeShape(shape("", 4, 4)), "");
  assert.equal(serializeShape(shape("x..\n.X", 4, 4)), "#/.#");
});

test("a click: empty, coloured, and with halves the four half squares clockwise", () => {
  assert.equal(nextValue(EMPTY, false), FULL);
  assert.equal(nextValue(FULL, false), EMPTY);
  const seen = [EMPTY];
  for (let i = 0; i < 6; i++) seen.push(nextValue(seen[seen.length - 1], true));
  assert.deepEqual(seen, [EMPTY, FULL, NW, NE, SE, SW, EMPTY]);
});

test("area: whole squares count 1, halves 0.5", () => {
  assert.equal(measure("").area, 0);
  assert.equal(measure("").empty, true);
  assert.equal(measure("####/####/####").area, 12);
  assert.equal(measure("#a/#c").area, 3);
  assert.equal(measure("abcd").area, 2);
});

test("perimeter in grid units, along the grid lines", () => {
  assert.equal(measure("#").perimeter, 4);
  assert.equal(measure("####/####/####").perimeter, 14); // 4 × 3
  assert.equal(measure("##/##").perimeter, 8);
  assert.equal(measure("#/##").perimeter, 8); // an L of 3
  assert.equal(measure("###/#.#/###").perimeter, 16); // a ring: 12 outside, 4 around the hole
  assert.equal(measure("#.#").perimeter, 8); // two pieces: both outlines
  assert.equal(measure("#/.#").perimeter, 8); // touching at a corner: both outlines
  // against the edge of the grid it counts the same
  assert.equal(measure("##", 2, 1).perimeter, 6);
  assert.equal(measure("##", 2, 1).gridEdges, 6);
});

test("halves: slanting sides, and no perimeter in grid units then", () => {
  const triangle = measure("a");
  assert.equal(triangle.area, 0.5);
  assert.equal(triangle.gridEdges, 2);
  assert.equal(triangle.diagonalEdges, 1);
  assert.equal(triangle.perimeter, null);
  // a whole square with a half on its right, the half covering the shared side: 3 + 1 grid edges... and one diagonal
  const house = measure("#a");
  assert.equal(house.area, 1.5);
  assert.equal(house.gridEdges, 4); // left, top and bottom of the square, top of the half
  assert.equal(house.diagonalEdges, 1);
  assert.equal(house.connected, true);
  // two halves that make a square across the diagonal are not possible in one square, but two halves side by side
  // that each cover the side between them join: NE (covers east) next to NW (covers west)
  assert.equal(measure("ba").connected, true);
  assert.equal(measure("ba").gridEdges, 2); // only the two tops
  assert.equal(measure("ba").diagonalEdges, 2);
  // a half that does not cover the shared side only touches it at a corner: two pieces
  assert.equal(measure("#c").connected, false); // SE covers east and south, not west
  // a diamond of four halves around a grid point: one piece, area 2, only slanting sides
  const diamond = measure("cd/ba");
  assert.equal(diamond.area, 2);
  assert.equal(diamond.connected, true);
  assert.equal(diamond.gridEdges, 0);
  assert.equal(diamond.diagonalEdges, 4);
  assert.equal(diamond.rectangle, false); // a tilted square is not an upright rectangle of whole squares
  assert.equal(diamond.holes, 0);
});

test("one piece: sides shared, not only corners", () => {
  assert.equal(measure("#").connected, true);
  assert.equal(measure("##/.#").connected, true);
  assert.equal(measure("#/.#").connected, false);
  assert.equal(measure("#/.#").pieces, 2);
  assert.equal(measure("#.#").pieces, 2);
  assert.equal(measure("").pieces, 0);
  assert.equal(measure("").connected, false);
});

test("holes: empty areas inside the shape", () => {
  assert.equal(measure("###/#.#/###").holes, 1);
  assert.equal(measure("###/#.#/#.#").holes, 0); // open at a side
  assert.equal(measure("###/#.#/##.").holes, 1); // only a corner open: still closed
  assert.equal(measure("####/#..#/####").holes, 1); // one hole of two squares
  assert.equal(measure("#####/#.#.#/#####").holes, 2);
  // closed by squares that only touch at a corner: still a hole (a corner point is part of the shape)
  assert.equal(measure(".#/#.#/.#").holes, 1);
  assert.equal(measure(".#/#.#/.#").connected, false);
  // against the edge of the grid, the outside goes on beyond it: no hole
  assert.equal(measure(".#/##", 2, 2).holes, 0);
  assert.equal(measure("#.#/###", 3, 2).holes, 0);
  // halves: the empty half of a half square inside a ring is a hole; a ring of halves around a square is none
  assert.equal(measure("###/#a#/###").holes, 1);
  assert.equal(measure("###/#.#/###").perimeter, 16);
  assert.equal(measure("cd/ba").holes, 0);
  // four halves around an empty grid point that close it, with the empty triangles inside: a diamond-shaped hole
  assert.equal(measure("ab/dc").holes, 1);
});

test("rectangle: an upright rectangle of whole squares", () => {
  assert.equal(measure("//..####/..####/..####").rectangle, true);
  assert.equal(measure("#").rectangle, true);
  assert.equal(measure("#######").rectangle, true);
  assert.equal(measure("##/#").rectangle, false);
  assert.equal(measure("###/#.#/###").rectangle, false);
  assert.equal(measure("#.#").rectangle, false);
  assert.equal(measure("#b/##").rectangle, false);
  assert.equal(measure("").rectangle, false);
});

test("outline: the segments a drawing shows", () => {
  const segments = outline(shape("#a"));
  assert.equal(segments.length, 5);
  assert.deepEqual(segments.filter((s) => s.diagonal), [{ x1: 2, y1: 0, x2: 1, y2: 1, diagonal: true }]);
});

test("numbers as a pupil writes them", () => {
  assert.equal(parseNumber("12"), 12);
  assert.equal(parseNumber(" 7,5 "), 7.5);
  assert.equal(parseNumber("7.5"), 7.5);
  assert.equal(parseNumber("7½"), 7.5);
  assert.equal(parseNumber("7 ½"), 7.5);
  assert.equal(parseNumber("7 1/2"), 7.5);
  assert.equal(parseNumber("½"), 0.5);
  assert.equal(parseNumber("1/2"), 0.5);
  for (const bad of ["", "12 cm", "-3", "7,5,5", "abc", "71/2"]) assert.equal(parseNumber(bad), undefined, bad);
});

test("the rules: one shape, target area and perimeter, rectangle", () => {
  const rules = { targetArea: 12, targetPerimeter: 14, mustBeRectangle: true };
  assert.equal(checkRules(measure("####/####/####"), rules).meetsRules, true);
  assert.equal(checkRules(measure("###/###/###/###"), rules).meetsRules, true); // 3 × 4 too
  assert.equal(checkRules(measure("######/######"), rules).meetsRules, false); // area 12, perimeter 16
  assert.equal(checkRules(measure("######/######"), rules).perimeter, false);
  // area 12 and perimeter 14, but not a rectangle
  const notRectangle = measure("#####/#####/##");
  assert.equal(notRectangle.area, 12);
  assert.equal(notRectangle.perimeter, 16);
  const l = measure("####/####/###./#");
  assert.equal(l.area, 12);
  assert.equal(l.perimeter, 16);
  // any shape with area 10: one piece, no holes
  const any = { targetArea: 10, targetPerimeter: null, mustBeRectangle: false };
  assert.equal(checkRules(measure("#####/#####"), any).meetsRules, true);
  assert.equal(checkRules(measure("###/#.#/####/##"), any).meetsRules, false); // a hole
  assert.equal(checkRules(measure("#####/#####/"), any).meetsRules, true);
  assert.equal(checkRules(measure("#####/...../#####"), any).meetsRules, false); // two pieces
  // halves count for the area, but a shape with slanting sides never meets a perimeter
  assert.equal(checkRules(measure("##a"), { targetArea: 2.5, targetPerimeter: null, mustBeRectangle: false }).meetsRules, true);
  assert.equal(checkRules(measure("##a"), { targetArea: 2.5, targetPerimeter: 8, mustBeRectangle: false }).meetsRules, false);
  // nothing drawn meets nothing
  assert.equal(checkRules(measure(""), { targetArea: null, targetPerimeter: null, mustBeRectangle: false }).meetsRules, false);
});

test("whether the rules can be met on the grid", () => {
  assert.equal(rulesPossible({ targetArea: 12, targetPerimeter: 14, mustBeRectangle: true }, 12, 8, false), true);
  assert.equal(rulesPossible({ targetArea: 12, targetPerimeter: 15, mustBeRectangle: true }, 12, 8, false), false);
  assert.equal(rulesPossible({ targetArea: 12, targetPerimeter: 26, mustBeRectangle: true }, 12, 8, false), true); // 12 × 1
  assert.equal(rulesPossible({ targetArea: 12, targetPerimeter: 26, mustBeRectangle: true }, 10, 8, false), false); // does not fit
  assert.equal(rulesPossible({ targetArea: 10, targetPerimeter: null, mustBeRectangle: false }, 12, 8, false), true);
  assert.equal(rulesPossible({ targetArea: 7.5, targetPerimeter: null, mustBeRectangle: false }, 12, 8, false), false);
  assert.equal(rulesPossible({ targetArea: 7.5, targetPerimeter: null, mustBeRectangle: false }, 12, 8, true), true);
  assert.equal(rulesPossible({ targetArea: 12, targetPerimeter: 13, mustBeRectangle: false }, 12, 8, false), false); // odd
  assert.equal(rulesPossible({ targetArea: 12, targetPerimeter: 12, mustBeRectangle: false }, 12, 8, false), false); // too short
  assert.equal(rulesPossible({ targetArea: 12, targetPerimeter: 26, mustBeRectangle: false }, 12, 8, false), true); // a strip
  assert.equal(rulesPossible({ targetArea: 12, targetPerimeter: 28, mustBeRectangle: false }, 12, 8, false), false);
});

test("compare two shapes by area or perimeter", () => {
  const a = shape("####/####"); // area 8, perimeter 12
  const b = shape("#######"); // area 7, perimeter 16
  assert.equal(compareShapes(a, b, "area"), "A");
  assert.equal(compareShapes(a, b, "perimeter"), "B");
  assert.equal(compareShapes(a, shape("##/##/##/##"), "area"), "same");
  assert.equal(compareShapes(a, shape(""), "area"), null);
  assert.equal(compareShapes(a, shape("#a"), "perimeter"), null); // no perimeter in grid units
});

const settings = (properties: Record<string, string>) => settingsFrom({ columns: "8", rows: "6", ...properties });
const work = (cells = shape("").cells, extra: Partial<{ areaAnswer: string; perimeterAnswer: string; choice: string }> = {}) => ({
  cells, areaAnswer: "", perimeterAnswer: "", choice: "", ...extra,
});

test("the settings: defaults, bounds, unknown values", () => {
  const s = settingsFrom({});
  assert.equal(s.task, "draw");
  assert.equal(s.columns, 12);
  assert.equal(s.rows, 8);
  assert.equal(s.halves, false);
  assert.deepEqual(s.rules, { targetArea: null, targetPerimeter: null, mustBeRectangle: false });
  const t = settingsFrom({ task: "measure", columns: "100", rows: "1", halves: "true", ask: "nonsense", targetArea: "7,5", mustBeRectangle: "true" });
  assert.equal(t.task, "measure");
  assert.equal(t.columns, 24);
  assert.equal(t.rows, 2);
  assert.equal(t.halves, true);
  assert.equal(t.ask, "both");
  assert.equal(t.rules.targetArea, 7.5);
  assert.equal(t.rules.mustBeRectangle, true);
});

test("the response of a drawing", () => {
  const s = settings({ task: "draw", targetArea: "12", targetPerimeter: "14", mustBeRectangle: "true" });
  assert.equal(responseFields(s, work()), undefined); // nothing drawn, nothing reported
  const drawn = shape("//..####/..####/..####");
  assert.deepEqual(responseFields(s, work(drawn.cells)), [
    { name: "area", base: { float: 12 } },
    { name: "perimeter", base: { float: 14 } },
    { name: "connected", base: { boolean: true } },
    { name: "noHoles", base: { boolean: true } },
    { name: "rectangle", base: { boolean: true } },
    { name: "meetsRules", base: { boolean: true } },
    { name: "shape", base: { string: "//..####/..####/..####" } },
  ]);
  // with a slanting side: no perimeter field
  const half = responseFields(settings({ task: "draw", halves: "true" }), work(shape("#a").cells))!;
  assert.deepEqual(half.map((f) => f.name), ["area", "connected", "noHoles", "rectangle", "meetsRules", "shape"]);
  assert.deepEqual(half[0], { name: "area", base: { float: 1.5 } });
});

test("the correct response of a drawing: only the fields that must be true", () => {
  assert.deepEqual(correctFields(settings({ task: "draw", mustBeRectangle: "true" })), [
    { name: "connected", base: { boolean: true } },
    { name: "noHoles", base: { boolean: true } },
    { name: "rectangle", base: { boolean: true } },
    { name: "meetsRules", base: { boolean: true } },
  ]);
  assert.deepEqual(correctFields(settings({ task: "draw" }))!.map((f) => f.name), ["connected", "noHoles", "meetsRules"]);
});

test("measure: the typed answers, and the correct ones from the shape", () => {
  const s = settings({ task: "measure", shape: "#/##/###" }); // area 6, perimeter 12
  assert.equal(responseFields(s, work()), undefined);
  assert.equal(responseFields(s, work(undefined, { areaAnswer: "zes" })), undefined);
  assert.deepEqual(responseFields(s, work(undefined, { areaAnswer: "6" })), [{ name: "areaAnswer", base: { float: 6 } }]);
  assert.deepEqual(responseFields(s, work(undefined, { areaAnswer: "6", perimeterAnswer: "12" })), [
    { name: "areaAnswer", base: { float: 6 } },
    { name: "perimeterAnswer", base: { float: 12 } },
  ]);
  assert.deepEqual(correctFields(s), [
    { name: "areaAnswer", base: { float: 6 } },
    { name: "perimeterAnswer", base: { float: 12 } },
  ]);
  // only what is asked
  const areaOnly = settings({ task: "measure", shape: "#/##/###", ask: "area" });
  assert.deepEqual(responseFields(areaOnly, work(undefined, { areaAnswer: "6", perimeterAnswer: "12" })), [{ name: "areaAnswer", base: { float: 6 } }]);
  assert.deepEqual(correctFields(areaOnly), [{ name: "areaAnswer", base: { float: 6 } }]);
  // halves: the area is fine, a perimeter cannot be asked; no shape, no correct response
  assert.deepEqual(correctFields(settings({ task: "measure", shape: "##a", ask: "area" })), [{ name: "areaAnswer", base: { float: 2.5 } }]);
  assert.equal(correctFields(settings({ task: "measure", shape: "##a" })), undefined);
  assert.equal(correctFields(settings({ task: "measure", shape: "" })), undefined);
});

test("compare: the choice, and the correct one", () => {
  const s = settings({ task: "compare", shape: "####/####", shapeB: "#######", compareBy: "perimeter" });
  assert.equal(responseFields(s, work()), undefined);
  assert.deepEqual(responseFields(s, work(undefined, { choice: "B" })), [{ name: "choice", base: { identifier: "B" } }]);
  assert.deepEqual(correctFields(s), [{ name: "choice", base: { identifier: "B" } }]);
  assert.deepEqual(correctFields({ ...s, compareBy: "area" }), [{ name: "choice", base: { identifier: "A" } }]);
});

test("reading a response back", () => {
  assert.deepEqual(fieldsOf({ record: [{ name: "shape", base: { string: "##" } }, { name: "area", base: { float: 2 } }] }), { shape: "##", area: 2 });
  assert.deepEqual(fieldsOf([{ name: "choice", base: { identifier: "A" } }]), { choice: "A" });
  assert.deepEqual(fieldsOf({ areaAnswer: 6 }), { areaAnswer: 6 });
  assert.equal(fieldsOf(undefined), undefined);
  assert.equal(fieldsOf("##"), undefined);
});
