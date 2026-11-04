// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Trainpci and
// https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Relatempci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// npm test: the motion (src/model.ts) and the settings and scoring (src/settings.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Motion } from "../src/model.ts";
import { GEOMETRY, TURN, groundPosition, movesIn, positionIn, shapeIcon, shapeOf, trajectory } from "../src/model.ts";
import {
  answersText, formatNumber, keyAnswers, languageOf, parseAnswers, parseIds, parseQuestions, parseSettings, parseViewed, scoreOf, viewedText,
} from "../src/settings.ts";

const train: Motion = { scene: "train", turns: 2, secondSpeed: 0.5 };
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("a point on the rim draws a cycloid on the ground: on the ground after every turn, at the top halfway", () => {
  const x0 = GEOMETRY.train.tracked;
  for (const turns of [0, 1, 2]) {
    const [x, y] = positionIn("rim", "ground", turns * TURN, train);
    close(y, 0);
    close(x, x0 + turns * TURN); // one turn: the circumference further
  }
  const [x, y] = positionIn("rim", "ground", Math.PI, train);
  close(y, -2);
  close(x, x0 + Math.PI);
});

test("in the vehicle's frame the rim point goes round a circle about the axle, the axle is at rest", () => {
  const hub = positionIn("hub", "vehicle", 0, train);
  for (const t of [0.3, 1, 2.5, 4, 7.7]) {
    const [x, y] = positionIn("rim", "vehicle", t, train);
    close(Math.hypot(x - hub[0], y - hub[1]), 1);
    positionIn("hub", "vehicle", t, train).forEach((v, i) => close(v, hub[i]));
    const passenger = positionIn("passenger", "vehicle", 0, train);
    positionIn("passenger", "vehicle", t, train).forEach((v, i) => close(v, passenger[i]));
  }
});

test("the bystander is at rest on the ground and moves back in the vehicle's frame", () => {
  assert.deepEqual(groundPosition("bystander", 0, train), groundPosition("bystander", 5, train));
  const [x0] = positionIn("bystander", "vehicle", 0, train);
  const [x1] = positionIn("bystander", "vehicle", 3, train);
  close(x1, x0 - 3);
});

test("the shapes of the trajectories", () => {
  assert.equal(shapeOf("rim", "ground", train), "cycloid");
  assert.equal(shapeOf("rim", "vehicle", train), "circle");
  assert.equal(shapeOf("rim", "second", train), "loops"); // the axle moves at 0.5, slower than the rim turns
  assert.equal(shapeOf("rim", "second", { ...train, secondSpeed: -0.5 }), "wave");
  assert.equal(shapeOf("rim", "second", { ...train, secondSpeed: 2 }), "cycloid"); // the other way round
  assert.equal(shapeOf("hub", "ground", train), "line");
  assert.equal(shapeOf("hub", "vehicle", train), "rest");
  assert.equal(shapeOf("passenger", "ground", train), "line");
  assert.equal(shapeOf("passenger", "vehicle", train), "rest");
  assert.equal(shapeOf("bystander", "ground", train), "rest");
  assert.equal(shapeOf("bystander", "vehicle", train), "line");
  assert.equal(shapeOf("second", "second", train), "rest");
  assert.equal(shapeOf("second", "vehicle", { ...train, secondSpeed: 1 }), "rest");
  assert.equal(movesIn("bystander", "vehicle", train), true);
  assert.equal(movesIn("passenger", "vehicle", train), false);
});

test("a trajectory starts where the point was at 0 and ends where it is now", () => {
  const points = trajectory("rim", "ground", TURN, train);
  assert.equal(points.length, 97);
  assert.deepEqual(points[0], positionIn("rim", "ground", 0, train));
  assert.deepEqual(points[points.length - 1], positionIn("rim", "ground", TURN, train));
  assert.equal(trajectory("rim", "ground", 0, train).length, 2);
});

test("the icons of the shapes fit their box", () => {
  for (const shape of ["rest", "line", "circle", "cycloid", "loops", "wave"] as const) {
    for (const [x, y] of shapeIcon(shape)) assert.ok(x >= -1e-9 && x <= 1 + 1e-9 && y >= 0 && y <= 1, `${shape}: ${x},${y}`);
  }
});

test("settings: defaults and checks", () => {
  const s = parseSettings({});
  assert.equal(s.scene, "train");
  assert.deepEqual(s.frames, ["ground", "vehicle"]);
  assert.deepEqual(s.points, ["rim", "hub", "passenger", "bystander"]);
  assert.equal(s.startFrame, "ground");
  assert.equal(s.turns, 2);
  assert.equal(s.secondSpeed, 0.5);
  assert.equal(s.hasSecond, false);
  assert.equal(s.rate, 1);
  assert.equal(s.autoplay, false);
  assert.deepEqual(s.questions, []);
  assert.deepEqual(s.shapeOptions, ["rest", "line", "circle", "cycloid"]);
  assert.equal(s.language, "en");

  const t = parseSettings({ scene: "MOTORBIKE", frames: "vehicle, second, nonsense", startFrame: "second", turns: "9", secondSpeed: "-3", rate: "0.5", language: "fr-FR" });
  assert.equal(t.scene, "motorbike");
  assert.deepEqual(t.frames, ["vehicle", "second"]);
  assert.equal(t.startFrame, "second");
  assert.equal(t.turns, 4);
  assert.equal(t.secondSpeed, -1);
  assert.equal(t.hasSecond, true);
  assert.equal(t.rate, 0.5);
  assert.equal(t.language, "fr");
  assert.equal(parseSettings({ startFrame: "second" }).startFrame, "ground"); // not one of the frames
  assert.deepEqual(parseSettings({ traced: "hub;second" }).traced, ["hub"]); // second is not a point here
  assert.equal(parseSettings({ secondSpeed: "0,25" }).secondSpeed, 0.25);
  assert.deepEqual(parseIds("rim, rim; hub", ["rim", "hub"] as const), ["rim", "hub"]);
  assert.equal(languageOf("NL"), "nl");
  assert.equal(languageOf("de"), "en");
});

test("questions: the key from the motion, or the author's", () => {
  const q = parseQuestions("rim@ground; rim@vehicle=cycloid\nhub@nowhere; rim@ground; rim@ground=square", "trajectory", train);
  assert.deepEqual(q.map((x) => [x.id, x.key]), [["rim@ground", "cycloid"], ["rim@vehicle", "cycloid"]]);
  const m = parseQuestions("passenger@ground;passenger@vehicle;bystander@vehicle=rest", "motion", train);
  assert.deepEqual(m.map((x) => x.key), ["moves", "rest", "rest"]);

  const s = parseSettings({ trajectoryQuestions: "rim@second", motionQuestions: "rim@second", shapeOptions: "line;circle" });
  assert.equal(s.hasSecond, true); // a question about the second observer puts it in the scene
  assert.deepEqual(s.questions.map((x) => x.id), ["rim@second", "rim@second:motion"]);
  assert.deepEqual(s.shapeOptions, ["line", "circle", "loops"]); // the key is always an option
});

test("answers, score and viewed", () => {
  const s = parseSettings({ trajectoryQuestions: "rim@ground;rim@vehicle", motionQuestions: "passenger@vehicle" });
  const answers = { "rim@ground": "cycloid", "rim@vehicle": "line" };
  assert.equal(answersText(s, answers), "rim@ground=cycloid;rim@vehicle=line");
  assert.deepEqual(scoreOf(s, answers), { score: 1, maxscore: 3, correct: false });
  assert.deepEqual(scoreOf(s, keyAnswers(s)), { score: 3, maxscore: 3, correct: true });
  assert.deepEqual(parseAnswers(s, "rim@ground=cycloid;rim@vehicle=line;passenger@vehicle=sideways;x@y=rest"), answers);
  assert.deepEqual(parseAnswers(s, answersText(s, keyAnswers(s))), keyAnswers(s));

  const seen = ["vehicle:", "vehicle:rim", "ground:", "ground:hub", "ground:rim"];
  assert.equal(viewedText(seen), "ground:rim,hub;vehicle:rim");
  assert.equal(viewedText(["second:"]), "second");
  assert.deepEqual(viewedText(parseViewed("ground:rim,hub;vehicle:rim")), "ground:rim,hub;vehicle:rim");
});

test("numbers per language", () => {
  assert.equal(formatNumber(0.5, 1, "en"), "0.5");
  assert.equal(formatNumber(0.5, 1, "nl"), "0,5");
  assert.equal(formatNumber(1.25, 2, "fr"), "1,25");
  assert.equal(formatNumber(-0.5, 1, "en"), "−0.5");
});
