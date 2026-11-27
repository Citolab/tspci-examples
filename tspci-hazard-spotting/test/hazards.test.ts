// npm test: hit testing, tapping, the settings, the marks notation and the response of hazard spotting (src/hazards.ts),
// and the spots of the four scenes (src/scenes.ts), in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_HAZARDS, SCENE_H, SCENE_W, badgeAt, buildSpots, correctMarks, countedSpots, extrasSetting, fitArea, markerAt, marksIn, marksString, parseExtras,
  parseLimit, parseMarks, parseSelection, placeOf, readingOrder, responseFields, score, selectionSetting, shapeArea, shapeContains, shapeDistance,
  spotAt, spotBox, tap, toggle, type Mark, type Spot,
} from "../src/hazards.ts";
import { SCENES, SCENE_IDS, hazardIds, sceneId } from "../src/scenes.ts";

const spot = (id: string, shapes: Spot["shapes"], at: [number, number], counts = true): Spot => ({ id, shapes, at, counts });
/** A small scene: a big forklift with a person in front of it, a ladder, and a safe sign. */
const SPOTS: Spot[] = [
  spot("forklift", [{ rect: [100, 100, 200, 200] }], [250, 250], false),
  spot("person", [{ rect: [120, 150, 40, 100] }], [140, 200]),
  spot("ladder", [{ poly: [400, 100, 440, 100, 470, 300, 430, 300] }], [435, 200]),
  spot("sign", [{ ellipse: [600, 100, 50, 30] }], [600, 100], false),
  spot("wheels", [{ rect: [600, 400, 30, 30] }, { rect: [700, 400, 30, 30] }], [615, 415]),
];
const plain = (marks: Mark[], spots = SPOTS, penalty = true) => Object.fromEntries(responseFields(marks, spots, penalty).map((f) => [f.name, f.value]));

test("shapes: inside, area and distance of a rectangle, an ellipse and a polygon", () => {
  assert.equal(shapeContains({ rect: [10, 10, 20, 10] }, 15, 15), true);
  assert.equal(shapeContains({ rect: [10, 10, 20, 10] }, 35, 15), false);
  assert.equal(shapeArea({ rect: [10, 10, 20, 10] }), 200);
  assert.equal(shapeDistance({ rect: [10, 10, 20, 10] }, 35, 15), 5);
  assert.equal(shapeContains({ ellipse: [0, 0, 10, 5] }, 9, 0), true);
  assert.equal(shapeContains({ ellipse: [0, 0, 10, 5] }, 9, 4), false);
  assert.ok(Math.abs(shapeArea({ ellipse: [0, 0, 10, 5] }) - Math.PI * 50) < 1e-9);
  assert.ok(Math.abs(shapeDistance({ ellipse: [0, 0, 10, 5] }, 0, 8) - 3) < 0.01);
  const triangle = { poly: [0, 0, 10, 0, 0, 10] };
  assert.equal(shapeContains(triangle, 2, 2), true);
  assert.equal(shapeContains(triangle, 8, 8), false);
  assert.equal(shapeArea(triangle), 50);
  assert.equal(shapeDistance(triangle, 5, -3), 3);
  assert.deepEqual(spotBox(SPOTS[4]), [600, 400, 130, 30]);
});

test("spotAt: the smallest spot under the point, else the nearest within the tolerance", () => {
  assert.equal(spotAt(SPOTS, 140, 200), "person"); // in front of the forklift
  assert.equal(spotAt(SPOTS, 250, 250), "forklift");
  assert.equal(spotAt(SPOTS, 435, 200), "ladder");
  assert.equal(spotAt(SPOTS, 715, 415), "wheels"); // the second shape of a spot
  assert.equal(spotAt(SPOTS, 350, 450), null);
  assert.equal(spotAt(SPOTS, 307, 250), null);
  assert.equal(spotAt(SPOTS, 307, 250, 10), "forklift"); // a finger next to it
});

test("badgeAt: on the outline, away from the marker, never cut off by the edge", () => {
  assert.deepEqual(badgeAt(SPOTS[0]), [100, 100]); // the top left corner of a rectangle
  assert.deepEqual(badgeAt(SPOTS[2]), [400, 100]); // the top of a polygon
  assert.deepEqual(badgeAt(SPOTS[3]), [550, 100]); // the left of an ellipse
  assert.deepEqual(badgeAt(spot("edge", [{ rect: [0, 0, 50, 50] }], [25, 25])), [18, 18]);
});

test("readingOrder: in bands from top to bottom, left to right", () => {
  assert.deepEqual(readingOrder(SPOTS).map((s) => s.id), ["sign", "person", "forklift", "ladder", "wheels"]);
  assert.deepEqual(placeOf(10, 10), [0, 0]);
  assert.deepEqual(placeOf(400, 250), [1, 1]);
  assert.deepEqual(placeOf(SCENE_W, SCENE_H), [2, 2]);
});

test("tap: places a mark, on a spot or on no spot; a tap on a marker or a marked spot removes it", () => {
  assert.deepEqual(tap([], SPOTS, 140.4, 200.6), { kind: "add", mark: { x: 140, y: 201, on: "person" } });
  assert.deepEqual(tap([], SPOTS, 350, 450), { kind: "add", mark: { x: 350, y: 450, on: null } });
  const marks: Mark[] = [{ x: 130, y: 160, on: "person" }, { x: 350, y: 450, on: null }];
  assert.deepEqual(tap(marks, SPOTS, 355, 455), { kind: "remove", index: 1 }); // on its marker
  assert.deepEqual(tap(marks, SPOTS, 150, 240), { kind: "remove", index: 0 }); // elsewhere on the marked spot
  assert.deepEqual(tap(marks, SPOTS, 435, 200, { limit: 2 }), { kind: "full" });
  assert.deepEqual(tap(marks, SPOTS, 150, 240, { limit: 2 }), { kind: "remove", index: 0 }); // removing still works
  assert.equal(markerAt(marks, 360, 450), 1);
  assert.equal(markerAt(marks, 380, 450), -1);
});

test("toggle (the keyboard): a mark where the spot's marker goes, or the mark removed", () => {
  assert.deepEqual(toggle([], SPOTS[2]), { kind: "add", mark: { x: 435, y: 200, on: "ladder" } });
  assert.deepEqual(toggle([{ x: 1, y: 1, on: null }, { x: 440, y: 150, on: "ladder" }], SPOTS[2]), { kind: "remove", index: 1 });
  assert.deepEqual(toggle([{ x: 1, y: 1, on: null }], SPOTS[2], 1), { kind: "full" });
});

test("the settings: the limit, which hazards count, the author's areas", () => {
  assert.equal(parseLimit("0"), 0);
  assert.equal(parseLimit(""), 0);
  assert.equal(parseLimit("5"), 5);
  assert.equal(parseLimit("-2"), 0);
  const ids = ["a", "b", "c"];
  assert.deepEqual([...parseSelection("all", ids)], ids);
  assert.deepEqual([...parseSelection("", ids)], ids);
  assert.deepEqual([...parseSelection("none", ids)], []);
  assert.deepEqual([...parseSelection("c, a", ids)], ["c", "a"]);
  assert.deepEqual([...parseSelection("x, y", ids)], ids); // made for another scene
  assert.equal(selectionSetting(new Set(["c", "a"]), ids), "a, c");
  assert.equal(selectionSetting(new Set(ids), ids), "all");
  assert.equal(selectionSetting(new Set(), ids), "none");

  assert.deepEqual(parseExtras(""), []);
  assert.deepEqual(parseExtras("not json"), []);
  assert.deepEqual(parseExtras('{"x":1}'), []);
  const areas = parseExtras('[{"name":" Bucket ","label":"the bucket","why":"It can fall.","x":790,"y":-5,"w":40.4,"h":2}, {"name":"no place"}]');
  assert.deepEqual(areas, [{ name: "Bucket", label: "the bucket", why: "It can fall.", x: 760, y: 0, w: 40, h: 10 }]);
  assert.deepEqual(parseExtras(extrasSetting(areas)), areas);
  assert.equal(extrasSetting([]), "");
  assert.deepEqual(fitArea({ name: "", label: "", why: "", x: 0, y: 0, w: 2000, h: 3 }), { name: "", label: "", why: "", x: 0, y: 0, w: SCENE_W, h: 10 });
});

test("buildSpots: the scene's hazards that are selected count, then the areas, at most 8 in all", () => {
  const scene = [
    { id: "h1", hazard: true, shapes: [{ rect: [0, 0, 10, 10] }], at: [5, 5] as [number, number] },
    { id: "h2", hazard: true, shapes: [{ rect: [20, 0, 10, 10] }], at: [25, 5] as [number, number] },
    { id: "d1", hazard: false, shapes: [{ rect: [40, 0, 10, 10] }], at: [45, 5] as [number, number] },
  ];
  const area = { name: "A", label: "", why: "", x: 100, y: 100, w: 20, h: 10 };
  const spots = buildSpots(scene, new Set(["h2"]), [area]);
  assert.deepEqual(spots.map((s) => [s.id, s.counts]), [["h1", false], ["h2", true], ["d1", false], ["extra1", true]]);
  assert.deepEqual(spots[3].at, [110, 105]);
  assert.deepEqual(countedSpots(spots).map((s) => s.id), ["h2", "extra1"]);
  const many = buildSpots(scene, new Set(["h1", "h2"]), Array.from({ length: 9 }, () => area));
  assert.equal(countedSpots(many).length, MAX_HAZARDS);
  assert.equal(many.length, 3 + MAX_HAZARDS - 2);
});

test("marksString: the same for the same answer, whatever the order of tapping; parseMarks reads it back", () => {
  const a: Mark[] = [{ x: 440, y: 150, on: "ladder" }, { x: 351, y: 450, on: null }, { x: 130, y: 160, on: "person" }, { x: 20, y: 30, on: null }];
  const b: Mark[] = [a[3], a[2], a[1], a[0]];
  assert.equal(marksString(a, SPOTS), "person; ladder; 20,30; 351,450");
  assert.equal(marksString(b, SPOTS), marksString(a, SPOTS));
  assert.equal(marksString([], SPOTS), "");
  assert.deepEqual(parseMarks("person; ladder; 20,30; 351,450", SPOTS), [
    { x: 140, y: 200, on: "person" },
    { x: 435, y: 200, on: "ladder" },
    { x: 20, y: 30, on: null },
    { x: 351, y: 450, on: null },
  ]);
  // a point on a spot is a mark on that spot; unknown ids, points outside the scene and repeats are left out
  assert.deepEqual(parseMarks("250,250; ghost; 900,10; person; person; 130,160", SPOTS), [{ x: 250, y: 250, on: "forklift" }, { x: 140, y: 200, on: "person" }]);
  assert.equal(marksString(parseMarks("ladder; 20,30; person", SPOTS), SPOTS), "person; ladder; 20,30");
});

test("the response: found, total, wrong, correct, a field per hazard, and the marks", () => {
  assert.deepEqual(plain([{ x: 130, y: 160, on: "person" }, { x: 250, y: 250, on: "forklift" }, { x: 10, y: 10, on: null }]), {
    found: 1, total: 3, wrong: 2, correct: false, h1: true, h2: false, h3: false, marks: "person; forklift; 10,10",
  });
  const all = correctMarks(SPOTS);
  assert.deepEqual(plain(all), { found: 3, total: 3, wrong: 0, correct: true, h1: true, h2: true, h3: true, marks: "person; ladder; wheels" });
  // a mark on a safe spot: not correct, unless it costs nothing (penalty off)
  const extra = [...all, { x: 600, y: 100, on: "sign" }];
  assert.equal(plain(extra).correct, false);
  assert.equal(plain(extra, SPOTS, false).correct, true);
  assert.equal(plain(extra, SPOTS, false).wrong, 1);
  assert.deepEqual(score(extra, SPOTS).found, [true, true, true]);
  // nothing counts: never correct
  assert.equal(plain([], SPOTS.map((s) => ({ ...s, counts: false }))).correct, false);
});

test("marksIn: the marks of a record, a string, or a list of either", () => {
  const record = { record: [{ name: "found", base: { integer: 1 } }, { name: "marks", base: { string: "person" } }] };
  assert.equal(marksIn(record), "person");
  assert.equal(marksIn({ base: { string: "ladder" } }), "ladder");
  assert.equal(marksIn("sign"), "sign");
  assert.equal(marksIn([record]), "person");
  assert.equal(marksIn({ record: [] }), undefined);
  assert.equal(marksIn(undefined), undefined);
});

test("the scenes: 5 to 8 hazards and some look-alikes, every spot in the picture and found where its marker goes", () => {
  assert.equal(sceneId("kitchen"), "kitchen");
  assert.equal(sceneId("moon"), "scaffold");
  for (const id of SCENE_IDS) {
    const scene = SCENES[id];
    const hazards = hazardIds(scene);
    assert.ok(hazards.length >= 5 && hazards.length <= MAX_HAZARDS, `${id}: ${hazards.length} hazards`);
    assert.ok(scene.spots.length - hazards.length >= 3, `${id}: look-alikes`);
    assert.equal(new Set(scene.spots.map((s) => s.id)).size, scene.spots.length, `${id}: unique ids`);
    // every hazard counts, and every hazard drawn safe: the spot where its marker goes is that spot
    for (const selected of [new Set(hazards), new Set<string>()]) {
      const spots = buildSpots(scene.spots, selected, []);
      for (const s of spots) {
        assert.equal(spotAt(spots, s.at[0], s.at[1]), s.id, `${id}: the marker of ${s.id}`);
        const [x, y, w, h] = spotBox(s);
        assert.ok(x >= 0 && y >= 0 && x + w <= SCENE_W && y + h <= SCENE_H, `${id}: ${s.id} in the picture`);
      }
    }
    for (const s of scene.spots) {
      for (const language of ["en", "nl"] as const) {
        assert.ok(s.label[language] && s.safe[language], `${id}: texts of ${s.id}`);
        if (s.hazard) assert.ok(s.name?.[language] && s.why?.[language], `${id}: name and why of ${s.id}`);
        assert.ok(!/[A-Z]/.test(s.label[language][0]), `${id}: a label reads in a sentence: ${s.label[language]}`);
      }
    }
  }
});
