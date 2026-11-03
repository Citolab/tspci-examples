// npm test: the logic of the contour map (src/terrain.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TASKS, DEFAULT_TERRAIN, allContours, bandColor, bandsOf, bumpsOf, cleanAnswers, contoursAt, correctAnswer, descentPath,
  evaluate, evaluateTask, formatNumber, gradient, gridHeight, heightFunction, highestPoint, isEmpty, levelsOf, lowestPoint, modelOf,
  parseNumber, parseTasks, parseTerrain, pathDistance, pathLength, profile, resample, responseFields, sampleGrid, serializeTasks,
  serializeTerrain, steepestPoint, targetOf, type Task, type Terrain,
} from "../src/terrain.ts";

/** One round hill of 100 m in the middle of a flat square kilometre. */
const ONE_HILL: Terrain = { width: 1000, depth: 1000, base: 0, tiltX: 0, tiltY: 0, seed: 1, bumps: 0, hills: [{ x: 500, y: 500, h: 100, r: 400 }], ridges: [] };
/** A plane that rises 50 m per km to the east. */
const SLOPE: Terrain = { ...ONE_HILL, hills: [], tiltX: 50, base: 10 };

test("parseTerrain: empty or broken gives the example, a partial one is flat where it says nothing", () => {
  assert.deepEqual(parseTerrain(""), DEFAULT_TERRAIN);
  assert.deepEqual(parseTerrain("{nope"), DEFAULT_TERRAIN);
  const t = parseTerrain('{"width": 800, "hills": [{"x": 1, "y": 2, "h": 30, "r": 50}, {"x": "a"}]}');
  assert.equal(t.width, 800);
  assert.equal(t.depth, DEFAULT_TERRAIN.depth);
  assert.equal(t.tiltX, 0);
  assert.equal(t.bumps, 0);
  assert.deepEqual(t.hills, [{ x: 1, y: 2, h: 30, r: 50 }]);
  assert.deepEqual(t.ridges, []);
});

test("serializeTerrain round-trips", () => {
  assert.deepEqual(parseTerrain(serializeTerrain(DEFAULT_TERRAIN)), DEFAULT_TERRAIN);
});

test("the seed gives the same bumps every time, another seed others", () => {
  assert.deepEqual(bumpsOf(DEFAULT_TERRAIN), bumpsOf({ ...DEFAULT_TERRAIN }));
  assert.notDeepEqual(bumpsOf(DEFAULT_TERRAIN), bumpsOf({ ...DEFAULT_TERRAIN, seed: 8 }));
  assert.equal(bumpsOf(DEFAULT_TERRAIN).length, DEFAULT_TERRAIN.bumps);
  const h1 = heightFunction(DEFAULT_TERRAIN), h2 = heightFunction(parseTerrain(serializeTerrain(DEFAULT_TERRAIN)));
  assert.equal(h1(321, 654), h2(321, 654));
});

test("heights: a hill is h at the top and about 13% of h at its radius; tilt in metres per km", () => {
  const h = heightFunction(ONE_HILL);
  assert.equal(h(500, 500), 100);
  assert.ok(Math.abs(h(900, 500) - 100 * Math.exp(-2)) < 1e-9);
  const s = heightFunction(SLOPE);
  assert.equal(s(0, 0), 10);
  assert.ok(Math.abs(s(1000, 300) - 60) < 1e-9);
  const g = gradient(s, 400, 400);
  assert.ok(Math.abs(g.x - 0.05) < 1e-9 && Math.abs(g.y) < 1e-9);
});

test("a ridge raises the land along its line, a valley lowers it", () => {
  const t: Terrain = { ...ONE_HILL, hills: [], ridges: [{ points: [[0, 500], [1000, 500]], h: -20, w: 200 }] };
  const h = heightFunction(t);
  assert.equal(h(300, 500), -20);
  assert.ok(h(300, 900) > -0.01);
});

test("grid: linear between the grid points, the corners exact", () => {
  const g = sampleGrid(SLOPE, heightFunction(SLOPE), 11);
  assert.equal(g.rows, 11);
  assert.equal(g.min, 10);
  assert.equal(g.max, 60);
  assert.ok(Math.abs(gridHeight(g, 555, 123) - 37.75) < 1e-9);
});

test("contour levels: every multiple of the interval between the lowest and the highest point", () => {
  assert.deepEqual(levelsOf(3, 41, 10), [10, 20, 30, 40]);
  assert.deepEqual(levelsOf(0, 10, 5), [0, 5, 10]);
  assert.deepEqual(levelsOf(0, 10, 0), []);
});

test("marching squares: around a round hill a closed, round contour line", () => {
  const h = heightFunction(ONE_HILL);
  const g = sampleGrid(ONE_HILL, h, 101);
  const lines = contoursAt(g, 50);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].closed, true);
  // the 50 m line of a Gaussian with sigma 200: radius 200·√(2 ln 2) ≈ 235.5 m
  const expected = 200 * Math.sqrt(2 * Math.log(2));
  for (const p of lines[0].points) assert.ok(Math.abs(Math.hypot(p.x - 500, p.y - 500) - expected) < 2, `${p.x} ${p.y}`);
  assert.ok(Math.abs(pathLength(lines[0].points) - 2 * Math.PI * expected) < 10);
});

test("marching squares: on a slope straight open lines from edge to edge", () => {
  const g = sampleGrid(SLOPE, heightFunction(SLOPE), 21);
  const lines = allContours(g, 10);
  // a level at the lowest edge itself has no crossing
  assert.deepEqual(lines.map((l) => l.level), [20, 30, 40, 50, 60]);
  const at30 = lines.find((l) => l.level === 30)!;
  assert.equal(at30.closed, false);
  for (const p of at30.points) assert.ok(Math.abs(p.x - 400) < 1e-6);
  assert.deepEqual([at30.points[0].y, at30.points[at30.points.length - 1].y].sort((a, b) => a - b), [0, 1000]);
});

test("marching squares: two hills make one line around both above the saddle, two lines above it", () => {
  const t: Terrain = { ...ONE_HILL, hills: [{ x: 300, y: 500, h: 100, r: 300 }, { x: 700, y: 500, h: 100, r: 300 }] };
  const h = heightFunction(t);
  const g = sampleGrid(t, h, 101);
  const saddle = h(500, 500);
  assert.equal(contoursAt(g, saddle - 5).length, 1);
  assert.equal(contoursAt(g, saddle + 5).length, 2);
});

test("profile: the heights evenly from A to B", () => {
  const s = heightFunction(SLOPE);
  assert.deepEqual(profile(s, { x: 0, y: 0 }, { x: 1000, y: 0 }, 5).map((v) => Math.round(v * 1e6) / 1e6), [10, 22.5, 35, 47.5, 60]);
});

test("highest, lowest and steepest point, also within a region", () => {
  const m = modelOf(ONE_HILL);
  const top = highestPoint(ONE_HILL, m.height);
  assert.ok(Math.hypot(top.x - 500, top.y - 500) < 1);
  const low = lowestPoint(ONE_HILL, m.height);
  assert.ok([0, 1000].includes(Math.round(low.x)) && [0, 1000].includes(Math.round(low.y)));
  // the steepest slope of a Gaussian lies at sigma (200 m) from the top
  const steep = steepestPoint(ONE_HILL, m.height, { x: 800, y: 500, r: 150 });
  assert.ok(Math.abs(Math.hypot(steep.x - 500, steep.y - 500) - 200) < 3, JSON.stringify(steep));
  const inRegion = highestPoint(ONE_HILL, m.height, { x: 900, y: 500, r: 100 });
  assert.ok(Math.abs(inRegion.x - 800) < 1 && Math.abs(inRegion.y - 500) < 1);
});

test("descent: water runs down the steepest slope to the edge, and stops in a hollow", () => {
  const s = heightFunction(SLOPE);
  const path = descentPath(SLOPE, s, { x: 700, y: 400 });
  assert.ok(Math.abs(path[path.length - 1].x) < 1e-6);
  for (const p of path) assert.ok(Math.abs(p.y - 400) < 1e-6);
  const hollow: Terrain = { ...ONE_HILL, hills: [{ x: 500, y: 500, h: -50, r: 400 }] };
  const end = descentPath(hollow, heightFunction(hollow), { x: 650, y: 560 }).at(-1)!;
  assert.ok(Math.hypot(end.x - 500, end.y - 500) < 5, JSON.stringify(end));
  // the example: from S the stream goes down into the valley and out at its eastern end
  const m = modelOf(DEFAULT_TERRAIN);
  const river = descentPath(DEFAULT_TERRAIN, m.height, DEFAULT_TASKS[2].source!);
  assert.equal(Math.round(river.at(-1)!.x), DEFAULT_TERRAIN.width);
  for (let i = 1; i < river.length; i++) assert.ok(m.height(river[i].x, river[i].y) < m.height(river[i - 1].x, river[i - 1].y));
});

test("path distance: 0 for the same path, the offset for a parallel one, large for half the path", () => {
  const a = [{ x: 0, y: 0 }, { x: 1000, y: 0 }];
  assert.equal(pathDistance(a, a, 10), 0);
  assert.ok(Math.abs(pathDistance(a, [{ x: 0, y: 30 }, { x: 1000, y: 30 }], 10) - 30) < 1e-9);
  assert.ok(pathDistance(a, [{ x: 0, y: 0 }, { x: 500, y: 0 }], 10) > 100);
  assert.equal(resample(a, 100).length, 11);
});

test("parseTasks: the example when empty, only known types, at most 6, sensible defaults", () => {
  assert.deepEqual(parseTasks(""), DEFAULT_TASKS);
  const tasks = parseTasks(JSON.stringify([{ type: "nonsense" }, { type: "point" }, { type: "height", marks: [{ x: 1, y: 2 }, { x: "?" }] }, ...Array(10).fill({ type: "river", source: { x: 5, y: 5 } })]));
  assert.equal(tasks.length, 6);
  assert.deepEqual(tasks[0], { type: "point", target: "highest", points: 1, margin: 50 });
  assert.deepEqual(tasks[1].marks, [{ x: 1, y: 2, label: "P1" }]);
  assert.deepEqual(parseTasks(serializeTasks(DEFAULT_TASKS)), DEFAULT_TASKS);
});

test("scoring a cross-section: per point within the margin, all needed unless minCorrect says otherwise", () => {
  const m = modelOf(SLOPE);
  const task: Task = { type: "profile", a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, samples: 5, margin: 5, points: 2 };
  const right = evaluateTask(m, task, { heights: [12, 20, 35, 50, 59] });
  assert.deepEqual(right.within, [true, true, true, true, true]);
  assert.equal(right.points, 2);
  assert.equal(right.number, 5);
  assert.equal(right.value, "12 20 35 50 59");
  const oneOff = evaluateTask(m, task, { heights: [12, 20, 50, 50, null] });
  assert.equal(oneOff.number, 3);
  assert.equal(oneOff.points, 0);
  assert.equal(oneOff.value, "12 20 50 50 -");
  assert.equal(evaluateTask(m, { ...task, minCorrect: 3 }, { heights: [12, 20, 50, 50, null] }).points, 2);
});

test("scoring a cross-section along the candidate's own line, which must not be too short", () => {
  const m = modelOf(SLOPE);
  const task: Task = { type: "profile", samples: 3, margin: 2, points: 1 };
  const r = evaluateTask(m, task, { a: { x: 0, y: 500 }, b: { x: 600, y: 500 }, heights: [10, 25, 40] });
  assert.equal(r.passed, true);
  assert.equal(r.value, "A 0 500 B 600 500: 10 25 40");
  const short = evaluateTask(m, task, { a: { x: 0, y: 500 }, b: { x: 100, y: 500 }, heights: [10, 12.5, 15] });
  assert.equal(short.lineOk, false);
  assert.equal(short.passed, false);
  assert.equal(evaluateTask(m, task, {}).answered, false);
});

test("scoring a point: within the margin of the highest point, or in the region", () => {
  const m = modelOf(ONE_HILL);
  const task: Task = { type: "point", target: "highest", margin: 40, points: 1 };
  assert.equal(evaluateTask(m, task, { p: { x: 530, y: 480 } }).passed, true);
  const far = evaluateTask(m, task, { p: { x: 560, y: 500 } });
  assert.equal(far.passed, false);
  assert.ok(Math.abs(far.number! - 60) < 1);
  assert.equal(far.value, "560 500");
  const region: Task = { type: "point", target: "region", region: { x: 100, y: 100, r: 50 }, margin: 0, points: 1 };
  assert.equal(evaluateTask(m, region, { p: { x: 130, y: 130 } }).passed, true);
  assert.equal(evaluateTask(m, region, { p: { x: 140, y: 140 } }).passed, false);
  assert.equal(evaluateTask(m, task, {}).number, null);
  const flow: Task = { type: "point", target: "flowEnd", source: { x: 700, y: 400 }, margin: 20, points: 1 };
  assert.equal(Math.round(targetOf(modelOf(SLOPE), flow).x), 0);
});

test("scoring heights: each within the margin; the first value is the number", () => {
  const m = modelOf(SLOPE);
  const task: Task = { type: "height", marks: [{ x: 0, y: 0, label: "P" }, { x: 500, y: 0, label: "Q" }], margin: 2.5, points: 1 };
  const r = evaluateTask(m, task, { values: [11, 37] });
  assert.deepEqual(r.within, [true, true]);
  assert.equal(r.number, 11);
  assert.equal(evaluateTask(m, task, { values: [11, 38] }).passed, false);
  assert.equal(evaluateTask(m, { ...task, minCorrect: 1 }, { values: [11, null] }).passed, true);
});

test("scoring a stream: the mean distance to the steepest-descent path within the margin", () => {
  const m = modelOf(SLOPE);
  const task: Task = { type: "river", source: { x: 700, y: 400 }, margin: 30, points: 1 };
  const good = evaluateTask(m, task, { path: [{ x: 700, y: 400 }, { x: 350, y: 420 }, { x: 0, y: 400 }] });
  assert.equal(good.passed, true);
  assert.ok(good.number! < 10);
  assert.equal(good.value, "700 400, 350 420, 0 400");
  const wrong = evaluateTask(m, task, { path: [{ x: 700, y: 400 }, { x: 700, y: 900 }] });
  assert.equal(wrong.passed, false);
  assert.equal(evaluateTask(m, task, { path: [{ x: 700, y: 400 }] }).passed, false);
});

test("the correct answers score full marks; the response record has the fields of the README", () => {
  const m = modelOf(DEFAULT_TERRAIN);
  const answers = DEFAULT_TASKS.map((t) => correctAnswer(m, t));
  const e = evaluate(m, DEFAULT_TASKS, answers);
  assert.deepEqual([e.score, e.maxscore, e.correct], [3, 3, true]);
  const fields = responseFields(m, DEFAULT_TASKS, answers);
  assert.deepEqual(fields.map((f) => f.name), [
    "score", "maxscore", "correct", "task1", "task1number", "task1value", "task2", "task2number", "task2value", "task3", "task3number", "task3value", "answers",
  ]);
  assert.deepEqual(JSON.parse(fields.at(-1)!.string!), cleanAnswers(DEFAULT_TASKS, answers));
  const none = responseFields(m, DEFAULT_TASKS, []);
  assert.deepEqual(none.slice(0, 3), [{ name: "score", integer: 0 }, { name: "maxscore", integer: 3 }, { name: "correct", integer: 0 }]);
  assert.equal(none.find((f) => f.name === "task2number"), undefined);
});

test("cleanAnswers: rounded, only the fields of each type, the right lengths; isEmpty", () => {
  const clean = cleanAnswers(DEFAULT_TASKS, [{ heights: [1.234, "x"], a: { x: 1, y: 1 } }, { p: { x: 10.6, y: "3" } }, { path: [{ x: 1, y: 2 }, null] }]);
  assert.deepEqual(clean[0], { heights: [1.2, null, null, null, null, null, null, null, null] });
  assert.deepEqual(clean[1], { p: { x: 11, y: 3 } });
  assert.deepEqual(clean[2], { path: [{ x: 1, y: 2 }] });
  assert.equal(isEmpty(cleanAnswers(DEFAULT_TASKS, [])), true);
  assert.equal(isEmpty(clean), false);
});

test("tint bands: whole contour intervals, at most ten, lightness falling", () => {
  const bands = bandsOf(4, 256, 10);
  assert.equal(bands.length, 9);
  assert.deepEqual([bands[0].from, bands[0].to, bands.at(-1)!.to], [0, 30, 270]);
  assert.equal(bandColor(bands, 31), bands[1].color);
  assert.equal(bandColor(bands, 999), bands.at(-1)!.color);
  assert.equal(bandsOf(0, 30, 10).length, 3);
});

test("numbers in the candidate's language", () => {
  assert.equal(formatNumber(87.5, 1, "nl"), "87,5");
  assert.equal(formatNumber(87.5, 1, "en"), "87.5");
  assert.equal(formatNumber(-0.01, 0, "en"), "0");
  assert.equal(parseNumber("87,5"), 87.5);
  assert.equal(parseNumber(" 1 250 "), 1250);
  assert.equal(parseNumber("−12"), -12);
  assert.equal(parseNumber("12a"), null);
  assert.equal(parseNumber(""), null);
});
