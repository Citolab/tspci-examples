// npm test: the geometry, response and scoring of the force arrows (src/vector.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ANSWER, angleDiff, correctValues, defaultArrows, endPoint, firstVector, formatNumber, fromResponse, keySteps,
  labelParts, makeVector, maxLength, normalizeAngle, nudge, numberSetting, parseAnswer, parseArrows, responseProcessingXml,
  score, scoreVector, serializeAnswer, serializeArrows, toResponse, type DrawOptions, type Vector,
} from "../src/vector.ts";

const free: DrawOptions = { bounds: { width: 14, height: 10 }, angleSnap: 0, lengthStep: 0 };
const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("angles: counter-clockwise from the x-axis, y down on screen", () => {
  assert.equal(makeVector({ x: 5, y: 5 }, { x: 8, y: 5 }, free).angle, 0);
  assert.equal(makeVector({ x: 5, y: 5 }, { x: 5, y: 2 }, free).angle, 90);
  assert.equal(makeVector({ x: 5, y: 5 }, { x: 2, y: 5 }, free).angle, 180);
  assert.equal(makeVector({ x: 5, y: 5 }, { x: 5, y: 8 }, free).angle, 270);
  assert.equal(makeVector({ x: 5, y: 5 }, { x: 6, y: 4 }, free).angle, 45);
  assert.equal(normalizeAngle(-90), 270);
  assert.equal(normalizeAngle(360), 0);
  assert.equal(normalizeAngle(359.99), 0);
  assert.equal(angleDiff(359, 2), 3);
  assert.equal(angleDiff(10, 190), 180);
});

test("makeVector: length, rounding, snapping and the edge of the drawing", () => {
  const v = makeVector({ x: 1, y: 1 }, { x: 4, y: 5 }, free);
  assert.deepEqual(v, { x: 1, y: 1, angle: 306.9, length: 5 });
  const snapped = makeVector({ x: 5, y: 5 }, { x: 8, y: 4.8 }, { ...free, angleSnap: 15, lengthStep: 0.5 });
  assert.equal(snapped.angle, 0);
  assert.equal(snapped.length, 3);
  // stops at the edge: from x = 12 to the right, at most 2 cm; on a 0.5 grid, rounded down
  assert.equal(makeVector({ x: 12, y: 5 }, { x: 20, y: 5 }, free).length, 2);
  assert.equal(makeVector({ x: 12.3, y: 5 }, { x: 20, y: 5 }, { ...free, lengthStep: 0.5 }).length, 1.5);
  // a start outside the drawing is moved onto it
  assert.deepEqual(makeVector({ x: -1, y: 11 }, { x: 0, y: 9 }, free), { x: 0, y: 10, angle: 90, length: 1 });
  const e = endPoint({ x: 7, y: 4.75, angle: 270, length: 3 });
  close(e.x, 7);
  close(e.y, 7.75);
  close(maxLength({ x: 7, y: 5 }, 45, free.bounds), Math.SQRT2 * 5);
});

test("keyboard: rotate, lengthen, move; shift for big steps", () => {
  const v: Vector = { x: 7, y: 4.75, angle: 270, length: 3 };
  assert.equal(nudge(v, { kind: "rotate", direction: 1 }, free).angle, 271);
  assert.equal(nudge(v, { kind: "rotate", direction: -1 }, free, true).angle, 255);
  assert.equal(nudge({ ...v, angle: 0 }, { kind: "rotate", direction: -1 }, free).angle, 359);
  assert.equal(nudge(v, { kind: "rotate", direction: 1 }, { ...free, angleSnap: 5 }).angle, 275);
  assert.equal(nudge(v, { kind: "length", direction: 1 }, free).length, 3.1);
  assert.equal(nudge(v, { kind: "length", direction: 1 }, free, true).length, 4);
  assert.equal(nudge({ ...v, length: 0.1 }, { kind: "length", direction: -1 }, free).length, 0.1); // never 0
  assert.equal(nudge(v, { kind: "length", direction: 1 }, free, true).length, 4);
  assert.equal(nudge({ ...v, length: 5.2 }, { kind: "length", direction: 1 }, free).length, 5.25); // the edge: 10 - 4.75
  assert.deepEqual(nudge(v, { kind: "move", dx: 1, dy: 0 }, free), { x: 7.1, y: 4.75, angle: 270, length: 3 });
  assert.deepEqual(keySteps({ ...free, angleSnap: 45, lengthStep: 0.5 }, true), { angle: 45, length: 1, move: 1 });
  assert.deepEqual(firstVector({ x: 7, y: 4.75 }, 90, free), { x: 7, y: 4.75, angle: 90, length: 1 });
  assert.equal(firstVector({ x: 13.5, y: 5 }, 0, free).length, 0.5);
});

test("settings: arrows and answer, with the example as default", () => {
  assert.deepEqual(parseArrows(""), defaultArrows("en"));
  assert.equal(parseArrows("", "nl")[0].label, "F_z");
  assert.deepEqual(parseArrows("not json"), defaultArrows());
  const defs = parseArrows('[{"label":"F_z","start":[3,4]},{"label":"F_n","start":null}]');
  assert.deepEqual(defs, [{ label: "F_z", start: { x: 3, y: 4 }, point: "P" }, { label: "F_n", start: null, point: "" }]);
  assert.deepEqual(parseArrows(serializeArrows(defs)), defs);
  assert.deepEqual(parseAnswer("", "", 1), DEFAULT_ANSWER);
  const answer = parseAnswer('{"vectors":[[3,4,270,2.5],null],"tolerance":{"start":"0,5","angle":10}}', "x", 2);
  assert.deepEqual(answer, { vectors: [{ x: 3, y: 4, angle: 270, length: 2.5 }, null], tolerance: { start: 0.5, angle: 10, length: 0.2 } });
  assert.deepEqual(parseAnswer(serializeAnswer(answer), "x", 2), answer);
  assert.deepEqual(parseAnswer("", "[...]", 2).vectors, [null, null]);
  assert.equal(numberSetting("2,5", 1), 2.5);
  assert.equal(numberSetting("abc", 40, 5), 40);
  assert.equal(numberSetting("1", 40, 5), 5);
});

test("response: four floats per arrow, nothing until something is drawn", () => {
  const defs = parseArrows('[{"label":"F_z","start":[3,4]},{"label":"F_n","start":null}]');
  assert.equal(toResponse([null, null], defs), null);
  const values = toResponse([{ x: 3, y: 4, angle: 270, length: 2.5 }, null], defs);
  assert.deepEqual(values, [3, 4, 270, 2.5, 0, 0, 0, 0]);
  assert.deepEqual(fromResponse(values, 2), [{ x: 3, y: 4, angle: 270, length: 2.5 }, null]);
  assert.deepEqual(fromResponse(["3", "4", "90", "1"], 2), [{ x: 3, y: 4, angle: 90, length: 1 }, null]);
  assert.deepEqual(fromResponse(undefined, 1), [null]);
  assert.deepEqual(correctValues(defaultArrows(), DEFAULT_ANSWER), [7, 4.75, 270, 3]);
  assert.equal(correctValues(defs, parseAnswer("", "x", 2)), undefined);
});

test("scoring as the rubric: point and direction 1 point, length 1 point", () => {
  const correct: Vector = { x: 7, y: 4.75, angle: 270, length: 3 };
  const t = { start: 0.3, angle: 5, length: 0.2 };
  assert.deepEqual(scoreVector({ ...correct }, correct, t), { pointAndDirection: true, length: true });
  assert.deepEqual(scoreVector({ ...correct, angle: 275, length: 3.2 }, correct, t), { pointAndDirection: true, length: true });
  assert.deepEqual(scoreVector({ ...correct, angle: 275.1, length: 3.21 }, correct, t), { pointAndDirection: false, length: false });
  assert.deepEqual(scoreVector({ ...correct, x: 7.2, y: 4.95 }, correct, t), { pointAndDirection: true, length: true }); // 0.28 cm away
  assert.deepEqual(scoreVector({ ...correct, x: 7.3, y: 4.95 }, correct, t), { pointAndDirection: false, length: true }); // 0.36 cm away
  assert.deepEqual(scoreVector({ ...correct, angle: 90 }, correct, t), { pointAndDirection: false, length: true }); // the wrong way
  assert.deepEqual(scoreVector(null, correct, t), { pointAndDirection: false, length: false });
  // across 0°
  assert.equal(scoreVector({ ...correct, angle: 358 }, { ...correct, angle: 2 }, t).pointAndDirection, true);
  assert.deepEqual(score([{ ...correct, length: 2 }], DEFAULT_ANSWER), { score: 1, max: 2 });
  assert.deepEqual(score([null], DEFAULT_ANSWER), { score: 0, max: 2 });
});

test("response processing XML for the answer", () => {
  const xml = responseProcessingXml(DEFAULT_ANSWER);
  assert.match(xml, /<qti-value>2<\/qti-value>/); // MAXSCORE
  assert.match(xml, /<qti-index n="4"><qti-variable identifier="RESPONSE"\/><\/qti-index><qti-base-value base-type="float">3<\/qti-base-value>/);
  assert.match(xml, /tolerance="5"/);
  assert.match(xml, /<qti-base-value base-type="float">0.09<\/qti-base-value>/); // 0.3² for the start
  assert.match(xml, /<qti-base-value base-type="float">-90<\/qti-base-value>/);
  assert.equal((xml.match(/<qti-response-condition>/g) ?? []).length, 2);
  const two = responseProcessingXml({ ...DEFAULT_ANSWER, vectors: [DEFAULT_ANSWER.vectors[0], { x: 1, y: 1, angle: 0, length: 1 }] }, "R");
  assert.match(two, /<qti-index n="8"><qti-variable identifier="R"\/>/);
  assert.match(two, /<qti-value>4<\/qti-value>/);
});

test("numbers and labels", () => {
  assert.equal(formatNumber(2.45, 1, "nl"), "2,5");
  assert.equal(formatNumber(30, 0, "en"), "30");
  assert.equal(formatNumber(3, 1, "en"), "3.0");
  assert.deepEqual(labelParts("F_z"), { main: "F", sub: "z" });
  assert.deepEqual(labelParts("F_{res}"), { main: "F", sub: "res" });
  assert.deepEqual(labelParts("W"), { main: "W", sub: "" });
});
