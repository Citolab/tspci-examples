// npm test: the workpiece, its views and its dimensions (src/model.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FEATURES, arrange, boundsOf, computeView, computeViews, crossings, dimensionsOf, featureProblems, firstDifference, inside,
  parseFeatures, placeDims, primitivesOf, segKey, variantsOf, viewSignature, type Feature,
} from "../src/model.ts";

const keys = (features: Feature[], view: "front" | "top" | "left") => computeView(features, view).segs.map(segKey).sort();
const block: Feature = { type: "block", w: 40, d: 20, h: 10 };

test("a plain block: a rectangle in every view, no hidden lines", () => {
  const v = computeViews([block]);
  assert.deepEqual(keys([block], "front"), ["visible:0,0,0,10", "visible:0,0,40,0", "visible:0,10,40,10", "visible:40,0,40,10"]);
  assert.deepEqual([v.top.width, v.top.height], [40, 20]);
  assert.deepEqual([v.left.width, v.left.height], [20, 10]);
  assert.equal(v.front.arcs.length, 0);
});

test("parsing: the block comes first, unknown features are dropped, numbers are clamped", () => {
  const f = parseFeatures([{ type: "hole", diameter: "6,5" }, { type: "nonsense" }, { type: "block", w: -3, d: 10, h: 10 }]);
  assert.equal(f[0].type, "block");
  assert.equal((f[0] as any).w, 1);
  assert.equal(f.length, 2);
  assert.equal((f[1] as any).diameter, 6.5);
  assert.deepEqual(parseFeatures(undefined), DEFAULT_FEATURES);
});

test("a step on the right is visible in front, hidden from the left", () => {
  const f: Feature[] = [block, { type: "step", edge: "right", width: 10, depth: 4 }];
  assert.deepEqual(keys(f, "front"), ["visible:0,0,0,10", "visible:0,0,40,0", "visible:0,10,30,10", "visible:30,6,30,10", "visible:30,6,40,6", "visible:40,0,40,6"]);
  assert.ok(keys(f, "left").includes("hidden:0,6,20,6"));
  assert.ok(keys(f, "top").includes("visible:30,0,30,20"));
});

test("a step at the back is a hidden line in the front view", () => {
  const f: Feature[] = [block, { type: "step", edge: "back", width: 5, depth: 4 }];
  assert.ok(keys(f, "front").includes("hidden:0,6,40,6"));
  // left view: the back is on the left
  assert.ok(keys(f, "left").includes("visible:0,6,5,6"));
});

test("a hole through from the top: a circle on top, hidden lines and centre lines in front and side", () => {
  const f: Feature[] = [block, { type: "hole", face: "top", a: 10, b: 10, diameter: 6, depth: 0 }];
  const v = computeViews(f);
  assert.equal(v.top.arcs.length, 1);
  assert.equal(v.top.arcs[0].kind, "visible");
  assert.ok(Math.abs(v.top.arcs[0].to - v.top.arcs[0].from - 2 * Math.PI) < 1e-2);
  assert.ok(keys(f, "front").includes("hidden:7,0,7,10") && keys(f, "front").includes("hidden:13,0,13,10"));
  assert.ok(keys(f, "left").includes("hidden:7,0,7,10"));
  assert.equal(v.top.centres.length, 2);
  assert.equal(v.front.centres.length, 1);
  // no false lines at the tangents of the circle
  assert.equal(v.top.segs.length, 4);
});

test("a blind hole has a hidden bottom; from the front its circle is hidden behind nothing", () => {
  const f: Feature[] = [block, { type: "hole", face: "top", a: 10, b: 10, diameter: 6, depth: 4 }];
  assert.ok(keys(f, "front").includes("hidden:7,6,13,6"));
  assert.ok(keys(f, "front").includes("hidden:7,6,7,10"));
  const front: Feature[] = [block, { type: "hole", face: "front", a: 20, b: 5, diameter: 4, depth: 8 }];
  const v = computeViews(front);
  assert.equal(v.front.arcs[0].kind, "visible");
  assert.ok(keys(front, "top").includes("hidden:18,0,18,8"));
});

test("a chamfer: a slanted line in the view along its edge, a straight one in the others", () => {
  const f: Feature[] = [block, { type: "chamfer", edge: "top-front", size: 2 }];
  assert.ok(keys(f, "left").includes("visible:18,10,20,8"));
  assert.ok(keys(f, "front").includes("visible:0,8,40,8"));
  assert.ok(keys(f, "top").includes("visible:0,2,40,2"));
});

test("a slot along y shows its profile in front", () => {
  const f: Feature[] = [block, { type: "slot", along: "y", offset: 15, width: 10, depth: 3 }];
  const front = keys(f, "front");
  for (const k of ["visible:15,7,15,10", "visible:15,7,25,7", "visible:25,7,25,10", "visible:0,10,15,10", "visible:25,10,40,10"]) assert.ok(front.includes(k), k);
  // from the left the slot's floor lies behind the material: hidden
  assert.ok(keys(f, "left").includes("hidden:0,7,20,7"));
});

test("an added box on top and a box cut out", () => {
  const f: Feature[] = [block, { type: "box", op: "add", x: 0, y: 0, z: 10, w: 10, d: 20, h: 5 }, { type: "box", op: "cut", x: 30, y: 5, z: 0, w: 5, d: 10, h: 10 }];
  assert.deepEqual(boundsOf(f).max, [40, 20, 15]);
  assert.ok(keys(f, "front").includes("visible:10,10,10,15"));
  assert.ok(keys(f, "front").includes("hidden:30,0,30,10"));
  assert.ok(keys(f, "top").includes("visible:30,5,35,5"));
});

test("material, rays and their surfaces", () => {
  const prims = primitivesOf(DEFAULT_FEATURES);
  assert.equal(inside(prims, [10, 20, 10]), true);
  assert.equal(inside(prims, [50, 20, 10]), false); // in the hole
  assert.equal(inside(prims, [50, 5, 20]), false); // above the step
  const c = crossings(prims, 1, 1, [10, 0, 10]);
  assert.deepEqual(c.map((x) => [x.t, x.enter]), [[0, true], [40, false]]);
  assert.equal(firstDifference(c, c), -1);
  assert.equal(firstDifference(c, []), 0);
});

test("the example's views", () => {
  const v = computeViews(DEFAULT_FEATURES);
  assert.deepEqual(v.front.segs.map(segKey), [
    "hidden:0,20,40,20", "hidden:45,0,45,15", "hidden:55,0,55,15", "visible:0,0,0,30", "visible:0,0,60,0", "visible:0,30,40,30",
    "visible:40,15,40,30", "visible:40,15,60,15", "visible:5,0,5,30", "visible:60,0,60,15",
  ]);
  assert.ok(v.top.segs.map(segKey).includes("visible:0,5,5,0"));
});

test("dimensions: standard and extra, in their views, stacked without overlap", () => {
  const dims = dimensionsOf(DEFAULT_FEATURES);
  const byId = Object.fromEntries(dims.map((d) => [d.id, d]));
  assert.equal(byId["0.w"].value, 60);
  assert.equal(byId["1.width"].value, 20);
  assert.equal(byId["1.width"].from, 40);
  assert.equal(byId["2.depth"].view, "left");
  assert.equal(byId["2.rest"].standard, false);
  assert.equal(byId["3.diameter"].kind, "dia");
  assert.equal(byId["4.size"].view, "top");
  const placed = placeDims(dims.filter((d) => d.standard));
  const top = placed.filter((d) => d.view === "front" && d.side === "top");
  assert.equal(top.find((d) => d.id === "1.width")!.level, 0);
  assert.equal(top.find((d) => d.id === "0.w")!.level, 1);
  // the slot's offset and width form a chain on one level
  const left = placed.filter((d) => d.view === "left" && d.side === "top");
  assert.equal(left.find((d) => d.id === "2.offset")!.level, left.find((d) => d.id === "2.width")!.level);
});

test("problems of features", () => {
  assert.deepEqual(featureProblems([block, { type: "step", edge: "left", width: 5, depth: 10 }]).map((p) => p.code), ["tooDeep"]);
  assert.deepEqual(featureProblems([block, { type: "hole", face: "top", a: 1, b: 10, diameter: 6, depth: 0 }]).map((p) => p.code), ["outside"]);
  assert.deepEqual(featureProblems(DEFAULT_FEATURES), []);
});

test("variants look different from the workpiece and from each other", () => {
  const variants = variantsOf(DEFAULT_FEATURES, 4);
  assert.equal(variants.length, 4);
  const signatures = new Set([viewSignature(DEFAULT_FEATURES), ...variants.map(viewSignature)]);
  assert.equal(signatures.size, 5);
});

test("arrange: two to a row, the first row at the back", () => {
  const b = boundsOf([block]);
  const o = arrange([b, b, b]);
  assert.equal(o[0][1] > o[2][1], true);
  assert.equal(o[0][0] < o[1][0], true);
});
