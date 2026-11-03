// npm test: the solids, the plane and the cross-section (src/geometry.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildModel, classifyPolygon, edgeName, edgeOrder, normalOf, paramsOf, planeOf, planeThrough, pointOnEdge, reachableKinds, sectionOf,
  dot, type EdgePoint, type Model,
} from "../src/geometry.ts";

const close = (a: number, b: number, eps = 1e-6, what = "") => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} ≠ ${b}`);
const HEX_TILT = (Math.atan(Math.SQRT2) * 180) / Math.PI; // the plane perpendicular to a space diagonal of a cube
const edge = (m: Model, name: string) => m.edges.findIndex((_, i) => edgeName(m, i) === name);
const mid = (m: Model, name: string): EdgePoint => {
  const i = edge(m, name);
  assert.ok(i >= 0, `no edge ${name}`);
  const [a, b] = m.edges[i];
  const d = m.vertices[a].map((x, k) => x - m.vertices[b][k]);
  return { edge: i, at: Math.hypot(...d) / 2 };
};

test("a cube: 8 corners ABCD EFGH, 12 edges, 6 faces", () => {
  const cube = buildModel({ type: "cube", dims: [6] });
  assert.equal(cube.vertices.length, 8);
  assert.equal(cube.edges.length, 12);
  assert.equal(cube.faces.length, 6);
  assert.deepEqual(cube.labels, ["A", "B", "C", "D", "E", "F", "G", "H"]);
  assert.deepEqual(cube.vertices[0], [-3, 0, 3]);
  assert.deepEqual(cube.vertices[6], [3, 6, -3]);
  assert.deepEqual(edgeOrder(cube).map((i) => edgeName(cube, i)), ["AB", "AD", "AE", "BC", "BF", "CD", "CG", "DH", "EF", "EH", "FG", "GH"]);
  close(cube.radius, 3 * Math.sqrt(3));
});

test("prisms and pyramids: regular bases with the side as given", () => {
  for (const n of [3, 5, 6, 8]) {
    const prism = buildModel({ type: "prism", dims: [4, 7], baseSides: n });
    assert.equal(prism.vertices.length, 2 * n);
    assert.equal(prism.edges.length, 3 * n);
    for (const [a, b] of prism.edges) {
      const d = Math.hypot(...prism.vertices[a].map((x, k) => x - prism.vertices[b][k]));
      assert.ok(Math.abs(d - 4) < 1e-9 || Math.abs(d - 7) < 1e-9, `edge ${d}`);
    }
    const pyramid = buildModel({ type: "pyramid", dims: [4, 7], baseSides: n });
    assert.equal(pyramid.labels[n], "T");
    assert.equal(pyramid.edges.length, 2 * n);
  }
  // defaults: unknown type, bad dimensions
  const m = buildModel({ type: "nonsense" as any, dims: [-1] });
  assert.equal(m.spec.type, "cube");
  assert.deepEqual(m.spec.dims, [6]);
  assert.deepEqual(buildModel({ type: "box", dims: [8] }).spec.dims, [8, 4, 6]);
});

test("a horizontal cut of a cube is a square of the cube's edge", () => {
  const cube = buildModel({ type: "cube", dims: [6] });
  const s = sectionOf(cube, { offset: 1.5, tilt: 0, turn: 0 });
  assert.equal(s.shape, "square");
  assert.ok(s.kinds.includes("rectangle") && s.kinds.includes("rhombus") && s.kinds.includes("quadrilateral"));
  assert.equal(s.sides, 4);
  close(s.area, 36);
  s.measures.forEach((x) => close(x, 6));
  s.angles.forEach((a) => close(a, 90));
  // the section lies in the plane
  const pl = planeOf(cube, { offset: 1.5, tilt: 0, turn: 0 });
  s.points3d.forEach((p) => close(dot(pl.n, p), pl.c));
  // above the cube: nothing
  assert.equal(sectionOf(cube, { offset: 3.01, tilt: 0, turn: 0 }).shape, "none");
  // exactly the top face counts as a cut through the face (it is the face)
  assert.equal(sectionOf(cube, { offset: 3, tilt: 0, turn: 0 }).shape, "square");
});

test("a tilted cut through two opposite edges of a cube: a rectangle 6 by 6√2", () => {
  const cube = buildModel({ type: "cube", dims: [6] });
  const s = sectionOf(cube, { offset: 0, tilt: 45, turn: 0 });
  assert.equal(s.shape, "rectangle");
  const sorted = [...s.measures].sort((a, b) => a - b);
  close(sorted[0], 6);
  close(sorted[3], 6 * Math.SQRT2);
  close(s.area, 36 * Math.SQRT2);
});

test("the plane perpendicular to a space diagonal through the centre: a regular hexagon", () => {
  const cube = buildModel({ type: "cube", dims: [6] });
  const s = sectionOf(cube, { offset: 0, tilt: HEX_TILT, turn: 45 });
  assert.equal(s.shape, "regularHexagon");
  assert.equal(s.sides, 6);
  s.measures.forEach((x) => close(x, 3 * Math.SQRT2));
  close(s.area, ((3 * Math.sqrt(3)) / 2) * 18);
  // close to it, with the default tolerance (2 %), still regular; strict, not
  assert.equal(sectionOf(cube, { offset: 0, tilt: 55, turn: 45 }).shape, "regularHexagon");
  assert.equal(sectionOf(cube, { offset: 0, tilt: 55, turn: 45 }, { length: 0.005, angle: 0.5 }).shape, "hexagon");
  // further along the diagonal: an equilateral triangle
  const t = sectionOf(cube, { offset: 4, tilt: HEX_TILT, turn: 45 });
  assert.equal(t.shape, "equilateralTriangle");
});

test("three points on edges: the midpoints of six edges give the regular hexagon exactly", () => {
  const cube = buildModel({ type: "cube", dims: [6] });
  const p = planeThrough(cube, [mid(cube, "AB"), mid(cube, "BF"), mid(cube, "GH")]);
  assert.ok(p);
  const s = sectionOf(cube, p, { length: 1e-6, angle: 1e-4 });
  assert.equal(s.shape, "regularHexagon");
  // the plane really goes through the three points
  const pl = planeOf(cube, p);
  for (const q of [mid(cube, "AB"), mid(cube, "BF"), mid(cube, "GH")]) close(dot(pl.n, pointOnEdge(cube, q)!), pl.c, 1e-5);
  // three points on one line: no plane
  assert.equal(planeThrough(cube, [{ edge: edge(cube, "AB"), at: 0 }, { edge: edge(cube, "AB"), at: 3 }, { edge: edge(cube, "AB"), at: 6 }]), null);
  // a corner cut off: a triangle; through B, D and E: equilateral
  const corner = planeThrough(cube, [{ edge: edge(cube, "AB"), at: 6 }, { edge: edge(cube, "AD"), at: 6 }, { edge: edge(cube, "AE"), at: 6 }])!;
  const tri = sectionOf(cube, corner);
  assert.equal(tri.shape, "equilateralTriangle");
  tri.measures.forEach((x) => close(x, 6 * Math.SQRT2, 1e-5));
});

test("paramsOf and normalOf go back and forth", () => {
  const cube = buildModel({ type: "cube", dims: [6] });
  for (const [tilt, turn] of [[10, 20], [45, 135], [80, 300], [90, 10]]) {
    const n = normalOf(tilt, turn);
    const point: [number, number, number] = [0.5, 3.2, -1];
    const p = paramsOf(cube, n, point);
    close(p.tilt, tilt, 1e-5);
    close(p.turn, turn, 1e-5);
    // a normal pointing down is the same plane
    const q = paramsOf(cube, n.map((x) => -x) as any, point);
    assert.deepEqual(q, p);
  }
  // a flat plane keeps the turn it had
  assert.equal(paramsOf(cube, [0, 1, 0], [0, 2, 0], 77).turn, 77);
});

test("the classification of quadrilaterals and triangles", () => {
  const cls = (pts: [number, number][]) => classifyPolygon(pts).shape;
  assert.equal(cls([[0, 0], [4, 0], [4, 6], [0, 6]]), "rectangle");
  assert.equal(cls([[0, 0], [4, 0], [6, 3], [2, 3]]), "parallelogram");
  assert.equal(cls([[0, 0], [5, 0], [8, 4], [3, 4]]), "rhombus");
  assert.equal(cls([[0, 0], [6, 0], [4, 3], [2, 3]]), "isoscelesTrapezium");
  assert.equal(cls([[0, 0], [6, 0], [5, 3], [2, 3]]), "trapezium");
  assert.equal(cls([[0, 0], [2, -2], [6, 0], [2, 2]]), "kite");
  assert.equal(cls([[0, 0], [5, 0], [6, 3], [1, 5]]), "quadrilateral");
  assert.equal(cls([[0, 0], [3, 0], [0, 4]]), "rightTriangle");
  assert.equal(cls([[0, 0], [3, 0], [0, 3]]), "rightIsoscelesTriangle");
  assert.equal(cls([[0, 0], [4, 0], [2, 5]]), "isoscelesTriangle");
  assert.equal(cls([[0, 0], [4, 0], [1, 5]]), "triangle");
  assert.equal(classifyPolygon([[0, 0], [3, 0], [0, 4]]).kinds.includes("triangle"), true);
});

test("a box: a vertical cut along the length is a rectangle of 8 by 6", () => {
  const box = buildModel({ type: "box", dims: [8, 4, 6] });
  const s = sectionOf(box, { offset: 1, tilt: 90, turn: 90 });
  assert.equal(s.shape, "rectangle");
  assert.deepEqual([...s.measures].map((x) => Math.round(x * 1e6) / 1e6).sort(), [6, 6, 8, 8]);
});

test("a square pyramid: horizontal cuts are squares, a vertical cut through the top a triangle", () => {
  const p = buildModel({ type: "pyramid", dims: [6, 6], baseSides: 4 });
  const s = sectionOf(p, { offset: 0, tilt: 0, turn: 0 });
  assert.equal(s.shape, "square");
  close(s.measures[0], 3);
  const t = sectionOf(p, { offset: 0, tilt: 90, turn: 0 });
  assert.equal(t.shape, "isoscelesTriangle");
  close(t.area, 18);
  // cutting off a corner of the base and the side edges: a pentagon
  assert.ok(reachableKinds(p).has("pentagon"));
  assert.ok(!reachableKinds(p).has("hexagon"));
});

test("a cylinder: circle, ellipse, part of an ellipse, rectangle", () => {
  const c = buildModel({ type: "cylinder", dims: [3, 8] });
  const circle = sectionOf(c, { offset: 0, tilt: 0, turn: 0 });
  assert.equal(circle.shape, "circle");
  close(circle.area, 9 * Math.PI);
  assert.deepEqual(circle.measures, [6]);
  const ellipse = sectionOf(c, { offset: 0, tilt: 30, turn: 0 });
  assert.equal(ellipse.shape, "ellipse");
  close(ellipse.measures[0], 6 / Math.cos(Math.PI / 6));
  close(ellipse.measures[1], 6);
  close(ellipse.area, Math.PI * 3 * (3 / Math.cos(Math.PI / 6)));
  const part = sectionOf(c, { offset: 0, tilt: 70, turn: 0 });
  assert.equal(part.shape, "ellipseSegment");
  assert.equal(part.sides, 2);
  assert.ok(part.curved);
  // the area of the dense boundary: close to the exact value (the strip of the ellipse between the base and the top)
  const t = (70 * Math.PI) / 180;
  const A = 3, B = 3 / Math.cos(t); // half axes; v from −4/sin t to 4/sin t
  const vmax = 4 / Math.sin(t);
  const strip = (v: number) => A * (v * Math.sqrt(1 - (v * v) / (B * B)) + B * Math.asin(v / B));
  close(part.area, strip(vmax) - strip(-vmax), 0.01);
  const rect = sectionOf(c, { offset: 1, tilt: 90, turn: 0 });
  assert.equal(rect.shape, "rectangle");
  close(rect.area, 2 * Math.sqrt(8) * 8);
  assert.equal(sectionOf(c, { offset: 3.5, tilt: 90, turn: 0 }).shape, "none");
});

test("a cone: circle, ellipse, parabola, hyperbola and a triangle through the top", () => {
  const cone = buildModel({ type: "cone", dims: [4, 8] });
  const slope = (Math.atan(2) * 180) / Math.PI;
  assert.equal(sectionOf(cone, { offset: -1, tilt: 0, turn: 0 }).shape, "circle");
  close(sectionOf(cone, { offset: 0, tilt: 0, turn: 0 }).measures[0], 4);
  assert.equal(sectionOf(cone, { offset: 0, tilt: 30, turn: 0 }).shape, "ellipse");
  assert.equal(sectionOf(cone, { offset: -1, tilt: slope, turn: 0 }).shape, "parabolaSegment");
  assert.equal(sectionOf(cone, { offset: 0, tilt: 80, turn: 0 }).shape, "hyperbolaSegment");
  const through = sectionOf(cone, { offset: 0, tilt: 90, turn: 0 });
  assert.equal(through.shape, "isoscelesTriangle");
  close(through.area, 32);
  // an ellipse low in the cone reaches the base: part of an ellipse with one straight side
  const low = sectionOf(cone, { offset: -3, tilt: 40, turn: 0 });
  assert.equal(low.shape, "ellipseSegment");
  assert.equal(low.sides, 1);
});

test("a sphere: always a circle, radius √(r² − d²)", () => {
  const s = buildModel({ type: "sphere", dims: [5] });
  const c = sectionOf(s, { offset: 3, tilt: 37, turn: 120 });
  assert.equal(c.shape, "circle");
  close(c.measures[0], 8);
  close(c.area, 16 * Math.PI);
  assert.equal(sectionOf(s, { offset: 5, tilt: 0, turn: 0 }).shape, "none");
  assert.deepEqual([...reachableKinds(s)].sort(), ["circle", "curved"]);
});

test("what a solid can give: a cube up to a hexagon, a triangular prism up to a pentagon", () => {
  const cube = reachableKinds(buildModel({ type: "cube", dims: [6] }));
  for (const k of ["equilateralTriangle", "square", "rectangle", "rhombus", "trapezium", "pentagon", "regularHexagon"] as const) assert.ok(cube.has(k), k);
  assert.ok(!cube.has("heptagon") && !cube.has("circle"));
  const prism = reachableKinds(buildModel({ type: "prism", dims: [6, 8], baseSides: 3 }));
  assert.ok(prism.has("pentagon") && !prism.has("hexagon"));
  const cyl = reachableKinds(buildModel({ type: "cylinder", dims: [3, 8] }));
  assert.ok(cyl.has("ellipse") && cyl.has("rectangle") && !cyl.has("triangle"));
});
