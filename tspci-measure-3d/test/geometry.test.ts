// npm test: the geometry of the scene (src/geometry.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SCENE, DEFAULT_TARGET, angleAt, cycleLabel, buildScene, correctValue, distance, letter, madeTarget, measure, nearestOnScreen,
  parseScene, parseTarget, polygonArea, serializeScene, validMeasurement, volumeOf, type Scene,
} from "../src/geometry.ts";

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const one = (o: object): Scene => parseScene(JSON.stringify({ objects: [o] }));

test("letters: A to Z, then A1", () => {
  assert.equal(letter(0), "A");
  assert.equal(letter(25), "Z");
  assert.equal(letter(26), "A1");
  assert.equal(letter(53), "B2");
});

test("cycleLabel: around the face from its first letter", () => {
  assert.equal(cycleLabel(["D", "C", "B", "A"]), "ABCD");
  assert.equal(cycleLabel(["H", "E", "A", "D"]), "ADHE");
  assert.equal(cycleLabel(["B", "C", "A"]), "ABC");
});

test("vectors: distance, angle, the area of a polygon", () => {
  near(distance([0, 0, 0], [1, 2, 2]), 3);
  near(angleAt([1, 0, 0], [0, 0, 0], [0, 1, 0]), 90);
  near(angleAt([1, 0, 0], [0, 0, 0], [1, 1, 0]), 45);
  near(angleAt([0, 0, 0], [0, 0, 0], [1, 1, 0]), 0);
  near(polygonArea([[0, 0, 0], [2, 0, 0], [2, 0, 3], [0, 0, 3]]), 6);
});

test("the example: a wall that is not measurable, a ladder A–D and a crate E–L", () => {
  const b = buildScene(DEFAULT_SCENE);
  const vertices = b.points.filter((p) => p.kind === "vertex");
  assert.equal(vertices.length, 4 + 8);
  assert.deepEqual(vertices.map((p) => p.label).join(""), "ABCDEFGHIJKL");
  assert.ok(!b.points.some((p) => p.object === "wall"));
  assert.ok(!b.faces.some((f) => f.object === "wall"));
  // the wall is drawn
  assert.ok(b.meshes.find((m) => m.object === "wall")!.positions.length > 0);
  // how long is the ladder: √(1.2² + 3.2²)
  near(correctValue(b, DEFAULT_TARGET, 1)!, Math.sqrt(1.2 ** 2 + 3.2 ** 2));
  near(correctValue(b, DEFAULT_TARGET, 1)!, 3.4176, 1e-4);
  // with a scale of 1 unit = 100 cm
  near(correctValue(b, DEFAULT_TARGET, 100)!, 341.76, 1e-2);
});

test("a box: 8 vertices, 12 midpoints, 6 centres, the space diagonal and the faces", () => {
  const b = buildScene(one({ id: "b", type: "box", size: { width: 3, depth: 4, height: 12 }, position: [1, 0, 2] }));
  assert.equal(b.points.filter((p) => p.kind === "vertex").length, 8);
  assert.equal(b.points.filter((p) => p.kind === "mid").length, 12);
  assert.equal(b.points.filter((p) => p.kind === "centre").length, 6);
  assert.equal(b.faces.length, 6);
  near(b.faces.reduce((s, f) => s + f.area, 0), 2 * (3 * 4 + 3 * 12 + 4 * 12));
  // the bottom ABCD, the top EFGH; the space diagonal from A (0,0,d) to G (w,h,0) is 13
  assert.equal(b.faces[0].label, "ABCD");
  assert.equal(b.faces[1].label, "EFGH");
  const target = { kind: "length", points: ["b.v0", "b.v6"] } as const;
  near(correctValue(b, target as any, 1)!, 13);
  // the normals point outwards
  assert.deepEqual(b.faces[0].normal.map(Math.round), [0, -1, 0]);
  assert.deepEqual(b.faces[1].normal.map(Math.round), [0, 1, 0]);
  // a midpoint is named after its edge
  assert.equal(b.points.find((p) => p.id === "b.e0-1")!.label, "AB");
  assert.equal(volumeOf(parseScene(JSON.stringify({ objects: [{ type: "box", size: { width: 3, depth: 4, height: 12 } }] })).objects[0]), 144);
});

test("a ramp: the slope angle at the foot, the area of the slope", () => {
  const b = buildScene(one({ id: "r", type: "ramp", size: { length: 4, width: 1, height: 1 } }));
  // v3 the foot at the back, v2 under the top, v5 the top at the back
  near(correctValue(b, { kind: "angle", points: ["r.v2", "r.v3", "r.v5"] }, 1)!, (Math.atan(1 / 4) * 180) / Math.PI);
  near(correctValue(b, { kind: "area", face: "r.f4" }, 1)!, Math.sqrt(17));
  near(correctValue(b, { kind: "volume", object: "r" }, 1)!, 2);
  near(correctValue(b, { kind: "volume", object: "r" }, 2)!, 16); // the scale cubed
  near(correctValue(b, { kind: "area", face: "r.f4" }, 2)!, 4 * Math.sqrt(17)); // squared
});

test("a roof: the slopes and the gables", () => {
  const b = buildScene(one({ id: "p", type: "prism", size: { length: 5, width: 6, height: 4 } }));
  near(b.faces.find((f) => f.id === "p.f1")!.area, 5 * 5); // slope 5 wide (3-4-5)
  near(b.faces.find((f) => f.id === "p.f3")!.area, 12);
  near(volumeOf(b.objects[0])!, 60);
});

test("a tank: rim points, the faces exact, the volume", () => {
  const b = buildScene(one({ id: "t", type: "cylinder", size: { radius: 1, height: 2 } }));
  assert.equal(b.points.filter((p) => p.kind === "vertex").length, 8);
  near(b.faces.find((f) => f.part === "top")!.area, Math.PI);
  near(b.faces.find((f) => f.part === "side")!.area, 4 * Math.PI);
  // from a rim point at the bottom to the opposite one at the top: √(2² + 2²)
  near(correctValue(b, { kind: "length", points: ["t.b0", "t.t2"] }, 1)!, Math.sqrt(8), 1e-9);
  near(correctValue(b, { kind: "volume", object: "t" }, 1)!, 2 * Math.PI);
  // every triangle belongs to a face
  assert.ok(b.meshes[0].faceOf.every((f) => f >= 0));
});

test("stairs: the profile, the faces add up, the volume", () => {
  const b = buildScene(one({ id: "s", type: "stairs", size: { steps: 3, run: 0.3, rise: 0.2, width: 1 } }));
  const side = b.faces[0];
  near(side.area, 0.3 * 0.2 * (1 + 2 + 3));
  near(volumeOf(b.objects[0])!, 0.3 * 0.2 * 6);
  // the triangles of the side cover its area
  const m = b.meshes[0];
  let covered = 0;
  m.faceOf.forEach((f, t) => {
    if (f !== 0) return;
    const p = m.positions.slice(t * 9, t * 9 + 9);
    covered += polygonArea([[p[0], p[1], p[2]], [p[3], p[4], p[5]], [p[6], p[7], p[8]]]);
  });
  near(covered, side.area, 1e-9);
  // the flight from the bottom of the first step to the top of the last
  const bottom = b.points.find((p) => p.kind === "vertex" && p.pos[0] === 0 && p.pos[1] === 0 && p.pos[2] === 1)!;
  const top = b.points.find((p) => p.kind === "vertex" && Math.abs(p.pos[0] - 0.6) < 1e-9 && Math.abs(p.pos[1] - 0.6) < 1e-9 && p.pos[2] === 1)!;
  near(distance(bottom.pos, top.pos), Math.sqrt(0.36 + 0.36));
});

test("rotation about the vertical axis keeps the sizes", () => {
  const a = buildScene(one({ id: "b", type: "box", size: { width: 2, depth: 1, height: 1 }, rotation: 0 }));
  const b = buildScene(one({ id: "b", type: "box", size: { width: 2, depth: 1, height: 1 }, rotation: 37, position: [3, 1, -2] }));
  near(correctValue(a, { kind: "length", points: ["b.v0", "b.v6"] }, 1)!, correctValue(b, { kind: "length", points: ["b.v0", "b.v6"] }, 1)!);
  // 90°: x goes to −z
  const c = buildScene(one({ id: "b", type: "box", size: { width: 2, depth: 1, height: 1 }, rotation: 90 }));
  const v2 = c.points.find((p) => p.id === "b.v2")!; // (w, 0, 0)
  near(v2.pos[0], 0);
  near(v2.pos[2], -2);
});

test("the author's names replace the letters; the others keep counting", () => {
  const b = buildScene(parseScene(JSON.stringify({ objects: [{ id: "b", type: "box" }], names: { "b.v0": "P", "b.f1": "roof" } })));
  const labels = b.points.filter((p) => p.kind === "vertex").map((p) => p.label);
  assert.deepEqual(labels, ["P", "A", "B", "C", "D", "E", "F", "G"]);
  assert.equal(b.faces[1].label, "roof");
});

test("parseScene: broken or empty is the example, unknown types are skipped, sizes are positive", () => {
  assert.equal(parseScene(""), DEFAULT_SCENE);
  assert.equal(parseScene("{nope"), DEFAULT_SCENE);
  const s = parseScene(JSON.stringify({ objects: [{ type: "sphere" }, { type: "box", size: { width: -1, height: "2,5" } }, { type: "box", id: "box2" }] }));
  assert.equal(s.objects.length, 2);
  assert.equal(s.objects[0].size.width, 1.2);
  assert.equal(s.objects[0].size.height, 2.5);
  // unique ids
  assert.notEqual(s.objects[0].id, s.objects[1].id);
  // round trip
  assert.deepEqual(parseScene(serializeScene(DEFAULT_SCENE)), DEFAULT_SCENE);
});

test("parseTarget", () => {
  assert.equal(parseTarget("", true), DEFAULT_TARGET);
  assert.equal(parseTarget("", false), null);
  assert.equal(parseTarget("{", true), null);
  assert.deepEqual(parseTarget('{"kind":"area","face":"b.f0"}', false), { kind: "area", face: "b.f0" });
  assert.equal(parseTarget('{"kind":"angle","points":["a","b"]}', false), null);
});

test("measuring: tape, protractor, area, and points on faces", () => {
  const b = buildScene(one({ id: "b", type: "box", size: { width: 3, depth: 4, height: 12 } }));
  near(measure(b, { tool: "tape", points: [{ id: "b.v0" }, { id: "b.v1" }] })!, 3);
  near(measure(b, { tool: "protractor", points: [{ id: "b.v1" }, { id: "b.v0" }, { id: "b.v4" }] })!, 90);
  near(measure(b, { tool: "area", face: "b.f1" })!, 12);
  near(measure(b, { tool: "tape", points: [{ face: "b.f1", pos: [0, 12, 0] }, { id: "b.v0" }] })!, Math.sqrt(144 + 16));
  assert.equal(measure(b, { tool: "tape", points: [{ id: "x" }, { id: "b.v0" }] }), null);
  assert.equal(validMeasurement(b, { tool: "tape", points: [{ id: "b.v0" }] }), null);
  assert.equal(validMeasurement(b, { tool: "area", face: "nope" }), null);
  assert.deepEqual(validMeasurement(b, { tool: "tape", points: [{ id: "b.v0" }, { face: "b.f1", pos: [1, 12, 1] }] }), { tool: "tape", points: [{ id: "b.v0" }, { face: "b.f1", pos: [1, 12, 1] }] });
});

test("madeTarget: the right measurement, in either direction", () => {
  const b = buildScene(DEFAULT_SCENE);
  const tape = (x: string, y: string) => ({ tool: "tape" as const, points: [{ id: x }, { id: y }] as any });
  assert.ok(madeTarget(b, DEFAULT_TARGET, [tape("ladder.v3", "ladder.v0")]));
  assert.ok(!madeTarget(b, DEFAULT_TARGET, [tape("ladder.v0", "ladder.v2")]));
  assert.ok(!madeTarget(b, DEFAULT_TARGET, []));
  // a click on a face exactly at the vertex counts
  const v3 = b.points.find((p) => p.id === "ladder.v3")!.pos;
  const crate = b.faces.find((f) => f.object === "crate")!.id;
  assert.ok(madeTarget(b, DEFAULT_TARGET, [{ tool: "tape", points: [{ id: "ladder.v0" }, { face: crate, pos: v3 }] }]));
  const angle = { kind: "angle", points: ["crate.v1", "crate.v0", "crate.v4"] } as const;
  assert.ok(madeTarget(b, angle as any, [{ tool: "protractor", points: [{ id: "crate.v4" }, { id: "crate.v0" }, { id: "crate.v1" }] }]));
  assert.ok(!madeTarget(b, angle as any, [{ tool: "protractor", points: [{ id: "crate.v0" }, { id: "crate.v4" }, { id: "crate.v1" }] }]));
  assert.ok(madeTarget(b, { kind: "volume", object: "crate" }, [tape("crate.v0", "crate.v1")]));
  assert.ok(!madeTarget(b, { kind: "volume", object: "crate" }, [tape("crate.v0", "ladder.v1")]));
});

test("nearestOnScreen: within the distance, the closest", () => {
  const ps = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 30, y: 0 }];
  assert.equal(nearestOnScreen(ps, 8, 0, 14), 1);
  assert.equal(nearestOnScreen(ps, 50, 0, 14), -1);
  assert.equal(nearestOnScreen(ps, 50, 0, Infinity), 2);
});
