// npm test: the mesh of the workpiece (src/csg.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { creaseEdges, paintOrder, shapePolygons, solidPolygons, triangles, volumeOf } from "../src/csg.ts";
import { DEFAULT_FEATURES, inside, primitivesOf, type Feature } from "../src/model.ts";

const close = (a: number, b: number, eps: number) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

test("a box: six faces facing out, its volume", () => {
  const box = shapePolygons({ shape: "box", min: [0, 0, 0], max: [2, 3, 4] });
  assert.equal(box.length, 6);
  close(volumeOf(box), 24, 1e-9);
});

test("the example: block minus step, slot, hole and chamfer", () => {
  const prims = primitivesOf(DEFAULT_FEATURES);
  const polygons = solidPolygons(prims, 48);
  // 60·40·30 − step 20·40·15 − slot 10·40·10 − hole (a 48-gon of radius 5, 15 high) − chamfer ½·5·5·30
  const hole = 0.5 * 48 * 25 * Math.sin((2 * Math.PI) / 48) * 15;
  close(volumeOf(polygons), 72000 - 12000 - 4000 - hole - 375, 1e-6);
  const { positions, normals } = triangles(polygons);
  assert.equal(positions.length % 9, 0);
  assert.equal(positions.length, normals.length);
});

test("edges: the 12 of a block, not the seams where the BSP split a face", () => {
  const f: Feature[] = [{ type: "block", w: 10, d: 10, h: 10 }, { type: "box", op: "add", x: 0, y: 0, z: 10, w: 10, d: 10, h: 10 }];
  const prims = primitivesOf(f);
  const edges = creaseEdges(solidPolygons(prims), (p) => inside(prims, p));
  // a 10×10×20 column: 12 edges, 160 mm in all (the union's seam at z = 10 is not an edge)
  const length = edges.reduce((sum, [a, b]) => sum + Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), 0);
  assert.equal(Math.round(length), 160);
  assert.ok(edges.every(([a, b]) => !(a[2] === 10 && b[2] === 10)));
});

test("paint order: only faces towards the viewer", () => {
  const box = shapePolygons({ shape: "box", min: [0, 0, 0], max: [1, 1, 1] });
  assert.equal(paintOrder(box, [0, 1, 0]).length, 1);
  assert.equal(paintOrder(box, [0.5, 0.6, -0.6]).length, 3);
});
