// npm test: the geometry of light and shadow (src/optics.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SCENE, blocks, evaluate, fieldsOf, lampRange, lampSamples, lightMap, measure, moveLamp, moveObject, objectRange,
  ownPositions, parseScene, pointShadow, profileOf, responseProcessing, sceneProblems, serializeScene, startPositions, unionLength, viewShadow,
  type Scene,
} from "../src/optics.ts";

const near = (actual: number | null, expected: number, eps = 1e-6) =>
  assert.ok(actual !== null && Math.abs(actual - expected) <= eps, `${actual} is not ${expected}`);

const scene = (patch: any): Scene => parseScene(JSON.stringify({ ...JSON.parse(serializeScene(DEFAULT_SCENE)), ...patch }));

test("an empty or broken data-scene is the example", () => {
  assert.deepEqual(parseScene(""), DEFAULT_SCENE);
  assert.deepEqual(parseScene("{nope"), DEFAULT_SCENE);
  assert.deepEqual(parseScene(serializeScene(DEFAULT_SCENE)), DEFAULT_SCENE);
});

test("parsing keeps values in their limits and a ball round", () => {
  const s = parseScene({ object: { type: "ball", width: "30", height: 99, x: -4 }, lamps: [{ x: 250, size: 999, move: { y: [150, "20"] } }, {}, {}], targets: [{ field: "nonsense" }, { field: "shadowWidth", value: "60", margin: "2,5" }] });
  assert.equal(s.object.height, 30);
  assert.equal(s.object.depth, 30);
  assert.equal(s.object.x, 5);
  assert.equal(s.lamps.length, 2);
  assert.equal(s.lamps[0].size, 60);
  assert.deepEqual(s.lamps[0].move, { y: [20, 150] });
  assert.deepEqual(s.targets, [{ field: "shadowWidth", value: 60, margin: 2.5, points: 1 }]);
});

test("a flat figure and a point lamp: the shadow is the figure times L / (L − d)", () => {
  const s = DEFAULT_SCENE; // figure 20 × 40 at 100 cm, lamp at 300 cm, 90 cm high
  const m = measure(s, startPositions(s))!;
  near(m.values.shadowHeight, 60);
  near(m.values.shadowWidth, 30);
  near(m.values.magnification, 1.5);
  // a point lamp: everything is umbra
  near(m.values.umbraHeight, 60);
  near(m.values.penumbraHeight, 0);
  // the side view: the shadow from (300, 90) past (100, 70) and (100, 110) lands at 60 and 120
  near(m.side.shadow[0], 60);
  near(m.side.shadow[1], 120);
});

test("the example's solution doubles the figure", () => {
  const s = DEFAULT_SCENE;
  const e = evaluate(s, s.solution!);
  assert.equal(e.correct, true);
  assert.equal(e.score, 1);
  assert.equal(measure(s, s.solution!)!.values.magnification, 2);
  assert.deepEqual(sceneProblems(s, "answer"), []);
  assert.equal(evaluate(s, startPositions(s)).score, 0);
});

test("a ball and a point lamp on its axis: the tangent rays give d · L / sqrt((L − x)² − r²)", () => {
  const s = scene({ object: { type: "ball", x: 100, elevation: 80, width: 20 }, lamps: [{ x: 300, y: 90, z: 0, size: 0, move: { x: [150, 400] } }] });
  const m = measure(s, startPositions(s))!;
  // half angle asin(r / D) with D = 200: the shadow is 2 · 300 · tan(asin(10 / 200))
  const expected = 2 * 300 * Math.tan(Math.asin(10 / 200));
  near(m.values.shadowHeight, Math.round(expected * 10) / 10);
  near(m.values.shadowWidth, Math.round(expected * 10) / 10);
  // the tangent points lie on the ball
  const p = pointShadow([300, 90], profileOf(s.object, 100, "side"))!;
  for (const [x, y] of p.touch) near(Math.hypot(x - 100, y - 90), 10, 1e-9);
});

test("a round lamp gives an umbra and a penumbra (the classic construction)", () => {
  // a disc of 20 cm at 200 cm, a figure of 20 cm high at 100 cm: from the lamp's edges at 80 and 100 past 80 and 100
  const s = scene({ object: { type: "figure", x: 100, elevation: 80, width: 20, height: 20, move: [20, 150] }, lamps: [{ x: 200, y: 90, z: 0, size: 20, move: {} }] });
  const m = measure(s, startPositions(s))!;
  // from the top edge (100): past 80 → 60; past 100 → 100. from the bottom edge (80): past 80 → 80; past 100 → 120
  near(m.side.lamps[0].shadow[0], 60);
  near(m.side.lamps[0].shadow[1], 120);
  assert.equal(m.values.shadowHeight, 60);
  assert.equal(m.values.umbraHeight, 20);
  assert.equal(m.values.penumbraHeight, 40);
  // a lamp as big as the object: the umbra stays as big as the object, wherever it is
  assert.equal(measure(s, moveObject(s, startPositions(s), 150))!.values.umbraHeight, 20);
  // a lamp twice as big: halfway the umbra ends on the screen, nearer the lamp it is gone
  const big = scene({ object: { type: "figure", x: 100, elevation: 80, width: 20, height: 20, move: [20, 150] }, lamps: [{ x: 200, y: 90, z: 0, size: 40, move: {} }] });
  assert.equal(measure(big, startPositions(big))!.values.umbraHeight, 0);
  near(measure(big, moveObject(big, startPositions(big), 50))!.values.umbraHeight, 13.3); // from 110 past 80 and from 70 past 100: 83.3 to 96.7
  const far = measure(big, moveObject(big, startPositions(big), 150))!;
  assert.equal(far.values.umbraHeight, 0);
  assert.equal(far.values.umbraWidth, 0);
  assert.ok(far.values.penumbraHeight! > 0);
});

test("two point lamps side by side: two shadows, the umbra where they overlap", () => {
  const s = scene({
    object: { type: "block", x: 100, elevation: 60, width: 20, height: 30, depth: 10, move: [20, 200] },
    lamps: [{ x: 300, y: 75, z: -30, size: 0, move: {} }, { x: 300, y: 75, z: 30, size: 0, move: {} }],
  });
  const start = startPositions(s);
  const m = measure(s, start)!;
  // the lamp at z = 30: the face nearer the lamp (105 cm) casts the far edge, the face nearer the screen (95 cm) the other
  near(m.top.lamps[1].shadow[0], 30 + (300 * -40) / 195, 1e-9);
  near(m.top.lamps[1].shadow[1], 30 + (300 * -20) / 205, 1e-9);
  assert.ok(m.values.umbraWidth! > 0);
  // move the block towards the lamps: the two shadows part, no umbra
  const apart = measure(s, moveObject(s, start, 200))!;
  assert.equal(apart.values.umbraWidth, 0);
  assert.equal(apart.values.umbraHeight, 0);
  near(apart.values.penumbraWidth!, 2 * ((300 * -20) / 105 - (300 * -40) / 95), 0.051);
  assert.equal(fieldsOf(s).includes("lamp2Side"), true);
  assert.equal(fieldsOf(DEFAULT_SCENE).includes("lamp2Side"), false);
});

test("unionLength merges overlapping intervals", () => {
  assert.equal(unionLength([[0, 2], [1, 3], [5, 6]]), 4);
  assert.equal(unionLength([]), 0);
});

test("moving: snapped to the step, in range, never into the object", () => {
  const s = scene({ object: { type: "block", x: 100, elevation: 0, width: 20, height: 20, depth: 20, move: [40, 300] }, lamps: [{ x: 200, y: 90, z: 0, size: 0, move: { x: [50, 400], y: [10, 150] } }] });
  const p = startPositions(s);
  assert.equal(moveLamp(s, p, 0, "x", 263).lamps[0].x, 265);
  assert.equal(moveLamp(s, p, 0, "x", 10).lamps[0].x, 115); // the object reaches 110, plus the gap: 112 → 115 on the 5 grid… from 112
  assert.deepEqual(lampRange(s, p, 0, "x"), [112, 400]);
  assert.equal(moveLamp(s, p, 0, "z", 30), p); // z does not move
  assert.equal(moveObject(s, p, 999).objectX, 185); // up to 200 − 10 − 2 = 188, snapped down within range
  assert.deepEqual(objectRange(s, p), [40, 188]);
});

test("ownPositions keeps what is fixed and clamps what moves", () => {
  const s = DEFAULT_SCENE;
  assert.deepEqual(ownPositions(s, { lamps: [{ x: 9999, y: 5, z: 3 }], objectX: 50 }), { lamps: [{ x: 400, y: 90, z: 0 }], objectX: 100 });
  assert.deepEqual(ownPositions(s, null), startPositions(s));
});

test("the authoring problems", () => {
  assert.deepEqual(sceneProblems(scene({ targets: [] }), "answer").map((p) => p.code), ["noTargets"]);
  assert.deepEqual(sceneProblems(scene({ targets: [] }), "tool"), []);
  assert.deepEqual(sceneProblems(scene({ solution: null }), "answer").map((p) => p.code), ["noSolution"]);
  assert.deepEqual(sceneProblems(scene({ solution: { lamps: [{ x: 300 }] } }), "answer"), [{ code: "solutionFails", target: 1 }]);
  assert.deepEqual(sceneProblems(scene({ lamps: [{ x: 300, y: 90, move: { x: [90, 400] } }] }), "answer").map((p) => p.code), ["lampInObject"]);
  assert.deepEqual(sceneProblems(scene({ lamps: [{ x: 300, y: 90 }] }), "tool").map((p) => p.code), ["nothingMoves"]);
});

test("the light map: dark in the umbra, lit outside, half with one of two lamps", () => {
  const s = DEFAULT_SCENE; // screen 240 × 180, shadow 60..120 high, −15..15 wide
  const columns = 48, rows = 36; // 5 cm cells
  const light = lightMap(s, startPositions(s), columns, rows);
  const at = (y: number, z: number) => light[Math.floor((1 - y / 180) * rows) * columns + Math.floor(((z + 120) / 240) * columns)];
  assert.equal(at(90, 0), 0); // the body of the figure, in the middle of the shadow
  assert.equal(at(150, 0), 1);
  assert.equal(at(90, 60), 1);
  const two = scene({ lamps: [{ x: 300, y: 90, z: -60, size: 0 }, { x: 300, y: 90, z: 60, size: 0 }], object: { type: "block", x: 100, elevation: 60, width: 20, height: 60, depth: 2, move: [20, 200] } });
  const m = measure(two, startPositions(two))!;
  const map = lightMap(two, startPositions(two), 240, rows); // 1 cm wide cells
  const mid = (z: number) => map[Math.floor((1 - 90 / 180) * rows) * 240 + Math.floor(z + 120)];
  assert.equal(m.values.umbraWidth, 0); // the lamps are far apart: two shadows with light between them
  assert.equal(mid(m.top.lamps[0].shadow[0] + 3), 0.5); // only lamp 1's shadow
  assert.equal(mid(0), 1);
});

test("blocks: a ray through the middle of a ball, past it, and a figure's gap between the legs", () => {
  const ball = parseScene({ object: { type: "ball", x: 100, elevation: 80, width: 20 } }).object;
  assert.equal(blocks(ball, 100, 300, 90, 0, 90, 0), true);
  assert.equal(blocks(ball, 100, 300, 90, 0, 150, 0), false);
  const figure = DEFAULT_SCENE.object; // 20 wide, 40 high from 70
  assert.equal(blocks(figure, 100, 300, 90, 0, 90, 0), true); // the body
  // just above the feet, in the middle, between the legs: light gets through (v ≈ 0.1, u = 0)
  assert.equal(blocks(figure, 100, 300, 74, 0, 74 + (74 - 74), 0), false);
  assert.equal(lampSamples(0, 2).length, 1);
  assert.equal(lampSamples(10, 2).length, 19);
});

test("no shadow when a lamp is not behind the object", () => {
  const s = DEFAULT_SCENE;
  assert.equal(viewShadow(s, { lamps: [{ x: 50, y: 90, z: 0 }], objectX: 100 }, "side"), null);
  assert.equal(measure(s, { lamps: [{ x: 50, y: 90, z: 0 }], objectX: 100 }), null);
});

test("the response processing scores each target with its margin", () => {
  const xml = responseProcessing(scene({ targets: [{ field: "shadowWidth", value: 60, margin: 2, points: 1 }, { field: "umbraWidth", value: 0, margin: 0, points: 2 }] }));
  assert.match(xml, /<qti-equal tolerance-mode="absolute" tolerance="2 2">\s*<qti-field-value field-identifier="shadowWidth">/);
  assert.match(xml, /<qti-base-value base-type="float">60<\/qti-base-value>/);
  assert.match(xml, /MAXSCORE[\s\S]*<qti-value>3<\/qti-value>/);
  assert.equal(xml.match(/<qti-response-condition>/g)!.length, 2);
});
