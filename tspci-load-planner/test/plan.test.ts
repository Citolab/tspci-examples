// npm test: the logic of the load planner (src/plan.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXAMPLE_PLAN, blockers, boxId, boxesToTsv, clonePlan, dims, evaluate, freeSpot, layer, metrics, ownPlacement, parseBoxesTsv, parsePlan,
  put, reorient, serializePlacement, serializePlan, settle, shift, slide, solidsOf, supportOf, tipped, turned, unload,
  type Placed, type Plan,
} from "../src/plan.ts";

const plan = (): Plan => clonePlan(EXAMPLE_PLAN);
const at = (placed: Placed[], id: string) => placed.find((p) => p.id === id)!;
const results = (p: Plan, placed: Placed[]) => Object.fromEntries(p.checks.map((c, i) => [c.type, evaluate(p, placed).results[i].passed]));

/** A plan with only the given checks and the "everything loaded" condition off. */
const only = (p: Plan, ...types: Plan["checks"][number]["type"][]): Plan => ({ ...p, requireAll: false, checks: types.map((type) => ({ type, points: 1, x: 40, y: 20 })) });

test("the example's solution passes every check", () => {
  const p = plan();
  const e = evaluate(p, p.solution!);
  assert.equal(e.score, 9);
  assert.equal(e.maxscore, 9);
  assert.equal(e.correct, true);
  assert.equal(e.metrics.loaded, 8);
  assert.equal(e.metrics.weight, 366);
});

test("orientations: R turns, T tips; R and T reach all six", () => {
  assert.equal(turned("lwh"), "wlh");
  assert.equal(tipped("lwh"), "hwl");
  const seen = new Set<string>();
  let o: any = "lwh";
  for (let i = 0; i < 6; i++) {
    seen.add(o);
    o = i % 2 ? tipped(o) : turned(o);
  }
  assert.equal(seen.size, 6);
  const box = EXAMPLE_PLAN.boxes.find((b) => b.id === "C")!;
  assert.deepEqual(dims(box, "lwh"), [130, 20, 80]);
  assert.deepEqual(dims(box, "wlh"), [20, 130, 80]);
  assert.deepEqual(dims(box, "hwl"), [80, 20, 130]);
});

test("put: on the grid, inside the walls, on top of what is there", () => {
  const p = plan();
  let placed = put(p, [], "A", 3, 7);
  assert.deepEqual(at(placed, "A"), { id: "A", x: 0, y: 10, z: 0, o: "lwh" });
  placed = put(p, placed, "B", 290, 500);
  assert.deepEqual(at(placed, "B"), { id: "B", x: 240, y: 110, z: 0, o: "lwh" }); // 300 − 60, 170 − 60
  placed = put(p, placed, "F", 10, 20); // books on the washing machine
  assert.equal(at(placed, "F").z, 90);
  // the washing machine taken away: the books fall to the floor
  placed = unload(p, placed, "A");
  assert.equal(at(placed, "F").z, 0);
  assert.equal(placed.length, 2);
});

test("settle: a stack keeps its order; moving the bottom box lets the top one fall", () => {
  const p = plan();
  let placed = put(p, [], "D", 0, 0);
  placed = put(p, placed, "F", 0, 0);
  assert.equal(at(placed, "F").z, 30);
  placed = shift(p, placed, "D", 10, 0); // D slides 100 cm towards the door, F stays and falls
  assert.equal(at(placed, "D").x, 100);
  assert.equal(at(placed, "F").z, 0);
  // slide F (z 0) under nothing; slide D back onto F's spot: D at its height 0, F at 0 → D is the one that moved, it goes on top
  placed = slide(p, placed, "D", 0, 0);
  assert.equal(at(placed, "D").z, 30);
  assert.equal(at(placed, "F").z, 0);
});

test("layer: PgDn puts a box under the one it rests on, PgUp back on top", () => {
  const p = plan();
  let placed = put(p, put(p, [], "D", 0, 0), "F", 0, 0);
  placed = layer(p, placed, "F", -1);
  assert.equal(at(placed, "F").z, 0);
  assert.equal(at(placed, "D").z, 30);
  assert.equal(layer(p, placed, "F", -1), placed, "already at the bottom");
  placed = layer(p, placed, "F", 1);
  assert.equal(at(placed, "F").z, 30);
  assert.equal(at(placed, "D").z, 0);
});

test("reorient: an upright box does not tip; a turned box stays inside", () => {
  const p = plan();
  let placed = put(p, [], "C", 0, 150); // TV 130 × 20 against the right wall
  assert.equal(reorient(p, placed, "C", "tip"), placed);
  placed = reorient(p, placed, "C", "turn");
  assert.equal(at(placed, "C").o, "wlh");
  assert.equal(at(placed, "C").y, 40); // 170 − 130
  placed = put(p, placed, "D", 100, 0);
  placed = reorient(p, placed, "D", "tip");
  assert.deepEqual(solidsOf(p, placed).find((s) => s.id === "D")!.dz, 60);
});

test("support: 70% of the base needed", () => {
  const p = only(plan(), "stable");
  let placed = put(p, [], "D", 0, 0); // 60 × 40
  placed = put(p, placed, "F", 30, 0); // 40 × 30, half of it over D
  const solids = solidsOf(p, placed);
  const f = solids.find((s) => s.id === "F")!;
  assert.equal(f.z, 30);
  assert.equal(supportOf(f, solids), 0.75); // x 30..60 of 30..70 = 30/40
  assert.equal(results(p, placed).stable, true);
  placed = shift(p, placed, "F", 1, 0);
  assert.equal(results(p, placed).stable, false);
  assert.deepEqual(evaluate(p, placed).results[0].boxes, ["F"]);
});

test("overlap in a placement from outside is caught", () => {
  const p = only(plan(), "stable");
  const raw = [{ id: "D", x: 0, y: 0, z: 0, o: "lwh" }, { id: "F", x: 0, y: 0, z: 0, o: "lwh" }];
  // ownPlacement settles: F ends up on D, no overlap
  const own = ownPlacement(p, raw);
  assert.equal(at(own, "F").z, 30);
  // without settling (a hand-made list), the check sees the overlap
  assert.equal(evaluate(p, raw as Placed[]).results[0].passed, false);
});

test("this side up, fragile, heavy at the bottom", () => {
  const p = only(plan(), "upright", "fragile", "heavyBottom");
  let placed = put(p, [], "D", 0, 0); // tiles 120 kg
  placed = put(p, placed, "F", 0, 0); // books 25 kg on top: fine
  assert.deepEqual(results(p, placed), { upright: true, fragile: true, heavyBottom: true });
  placed = layer(p, placed, "F", -1); // tiles on the books
  assert.equal(results(p, placed).heavyBottom, false);
  placed = put(p, [], "H", 0, 0); // lamps (fragile), books on them
  placed = put(p, placed, "F", 0, 0);
  assert.equal(results(p, placed).fragile, false);
  // an upright box from outside that lies on its side
  const tipped = ownPlacement(p, [{ id: "E", x: 0, y: 0, z: 0, o: "hwl" }]);
  assert.equal(at(tipped, "E").o, "lwh", "the PCI never accepts it");
  assert.equal(evaluate(p, [{ id: "E", x: 0, y: 0, z: 0, o: "hwl" }]).results[0].passed, false);
});

test("unloading order: a later stop in front of an earlier one or on top of it blocks it", () => {
  const p = only(plan(), "unloadOrder");
  let placed = put(p, [], "F", 0, 0); // stop 1 at the front
  placed = put(p, placed, "A", 100, 0); // stop 3 between it and the door
  const solids = solidsOf(p, placed);
  assert.deepEqual(blockers(p, solids.find((s) => s.id === "F")!, solids).map((s) => s.id), ["A"]);
  assert.equal(results(p, placed).unloadOrder, false);
  placed = put(p, placed, "A", 100, 100); // out of the way: an aisle
  assert.equal(results(p, placed).unloadOrder, true);
  placed = put(p, placed, "D", 0, 0); // stop 2 on top of stop 1
  assert.equal(results(p, placed).unloadOrder, false);
  // on a pallet only what is on top counts
  const pallet = only({ ...plan(), space: { ...plan().space, kind: "pallet", length: 120, width: 80, height: 150, axles: null } }, "unloadOrder");
  let pp = put(pallet, [], "F", 0, 0);
  pp = put(pallet, pp, "B", 60, 0);
  assert.equal(results(pallet, pp).unloadOrder, true);
});

test("metrics: volume, weight, centre of gravity, axle loads", () => {
  const p = plan();
  const placed = put(p, [], "D", 0, 0); // 60 × 40 × 30 at the front left
  const m = metrics(p, placed);
  assert.equal(m.loaded, 1);
  assert.equal(Math.round(m.volume * 100) / 100, Math.round((72000 / (300 * 170 * 160)) * 10000) / 100);
  assert.equal(m.weight, 120);
  assert.deepEqual(m.cog, { x: 30, y: 20, z: 15 });
  assert.deepEqual(m.offset, { x: -120, y: -65 });
  // axles at −90 and 210: the load at 30 is 40% of the way, so 40% on the rear axle
  assert.equal(Math.round(m.axles!.rear), 48);
  assert.equal(Math.round(m.axles!.front), 72);
  assert.equal(metrics(p, []).cog, null);
});

test("cog, max weight and axle checks", () => {
  const p = only(plan(), "cog", "maxWeight", "axles");
  let placed = put(p, [], "D", 0, 0);
  assert.deepEqual(results(p, placed), { cog: false, maxWeight: true, axles: true });
  placed = put(p, [], "D", 120, 60); // centre at 150, 80: offset 0, −5
  assert.equal(results(p, placed).cog, true);
  const heavy = { ...p, space: { ...p.space, maxPayload: 100, axles: { ...p.space.axles!, maxRear: 10 } } };
  assert.deepEqual(results(heavy, placed), { cog: true, maxWeight: false, axles: false });
});

test("requireAll: the rules only count with every box loaded; nothing loaded passes nothing", () => {
  const p = plan();
  assert.equal(evaluate(p, []).score, 0);
  const some = put(p, [], "D", 120, 60);
  assert.equal(evaluate(p, some).score, 0);
  assert.equal(evaluate({ ...p, requireAll: false }, some).score > 0, true);
  assert.equal(evaluate({ ...p, requireAll: false }, []).score, 0);
});

test("freeSpot: lowest, deepest place with support; null when full", () => {
  const p = plan();
  assert.deepEqual(freeSpot(p, [], "A"), { id: "A", x: 0, y: 0, z: 0, o: "lwh" });
  const placed = put(p, [], "A", 0, 0);
  assert.deepEqual(freeSpot(p, placed, "B"), { id: "B", x: 0, y: 60, z: 0, o: "lwh" });
  const tiny = { ...p, space: { ...p.space, length: 60, width: 60, height: 100 } };
  assert.equal(freeSpot(tiny, put(tiny, [], "A", 0, 0), "B"), null);
  // nothing on a fragile box
  const lamps = { ...p, space: { ...p.space, length: 50, width: 50, height: 200 } };
  assert.equal(freeSpot(lamps, put(lamps, [], "H", 0, 0), "F"), null);
});

test("parse and serialize a plan; bad input gives the example", () => {
  const p = plan();
  const again = parsePlan(serializePlan(p));
  assert.deepEqual(again, p);
  assert.deepEqual(parsePlan(""), p);
  assert.deepEqual(parsePlan("{oops"), p);
  const odd = parsePlan(JSON.stringify({ space: { kind: "pallet", length: "120", width: 80, height: 5000 }, boxes: [{ id: "X", length: "40,5" }, { id: "X" }], checks: [{ type: "nope" }, { type: "cog" }] }));
  assert.equal(odd.space.kind, "pallet");
  assert.equal(odd.space.height, 1000);
  assert.equal(odd.space.axles, null);
  assert.deepEqual(odd.boxes.map((b) => b.id), ["X", "X2"]);
  assert.equal(odd.boxes[0].length, 41);
  assert.deepEqual(odd.checks, [{ type: "cog", points: 1, x: 40, y: 20 }]);
  assert.equal(odd.solution, null);
});

test("boxes from a spreadsheet (TSV)", () => {
  const text = "Label\tLength\tWidth\tHeight\tWeight\tUp\tFragile\tStop\tCount\nCrate\t60\t40\t30\t12,5\tja\t\t2\t3\nbad\tx\nVase\t30\t30\t50\t2\t\tyes";
  const { boxes, errors } = parseBoxesTsv(text);
  assert.deepEqual(errors, [3]);
  assert.equal(boxes.length, 4);
  assert.deepEqual(boxes.map((b) => b.id), ["A", "B", "C", "D"]);
  assert.deepEqual(boxes[0], { id: "A", label: "Crate", length: 60, width: 40, height: 30, weight: 12.5, upright: true, fragile: false, stop: 2 });
  assert.equal(boxes[3].fragile, true);
  assert.equal(boxes[3].stop, null);
  assert.equal(parseBoxesTsv("a;10;10;10;1").boxes.length, 1);
  const round = parseBoxesTsv(boxesToTsv(EXAMPLE_PLAN.boxes)).boxes;
  assert.deepEqual(round.map(({ id, ...b }) => b), EXAMPLE_PLAN.boxes.map(({ id, ...b }) => b));
  assert.equal(boxId(25), "Z");
  assert.equal(boxId(26), "AA");
});

test("ownPlacement: only known boxes, once, inside; the placement for a rater", () => {
  const p = plan();
  const own = ownPlacement(p, { boxes: [{ id: "A", x: 500, y: -20, z: 40, o: "wlh" }, { id: "A", x: 0, y: 0 }, { id: "?", x: 0, y: 0 }] });
  assert.deepEqual(own, [{ id: "A", x: 240, y: 0, z: 0, o: "wlh" }]);
  assert.deepEqual(JSON.parse(serializePlacement(p, own)), { space: "van", boxes: [{ id: "A", x: 240, y: 0, z: 0, o: "wlh", dx: 60, dy: 60, dz: 90 }] });
  assert.deepEqual(ownPlacement(p, JSON.parse(serializePlacement(p, p.solution!))), settle(p, p.solution!));
});
