// npm test: the warehouse, the aisle graph and the shortest route, the checks and the response of order picking
// (src/picking.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answered, correctState, distance, emptyState, exampleWarehouse, graphOf, layoutKey, lineChecks, normalizeWarehouse, parseLocation,
  parsePicked, parseWarehouse, rackPosition, responseFields, serializePicked, serializeWarehouse, settingsFrom, shortestRoute, shortestTour,
  toteVerdict, walkLength, walkPoints, warehouseFrom, warehouseProblems, type Layout, type PickState, type Settings, type Warehouse,
} from "../src/picking.ts";

const W = exampleWarehouse("en");
const PICK: Settings = { task: "pick", route: false, stock: false, routeMargin: 0 };
const ROUTE: Settings = { ...PICK, route: true };
const STOCK: Settings = { ...PICK, stock: true };
const CHECK: Settings = { ...PICK, task: "check" };

const state = (w: Warehouse, s: Partial<PickState>): PickState => ({ ...emptyState(w), ...s });
const fields = (w: Warehouse, settings: Settings, s: Partial<PickState>) =>
  Object.fromEntries(responseFields(w, settings, state(w, s)).map((f) => [f.name, f.value]));
/** The cart of the example order, all right (stock off). */
const RIGHT_CART = { "B-05-2": 2, "A-02-1": 3, "C-02-2": 3, "B-03-1": 4, "A-05-2": 1, "C-01-2": 2 };

test("location codes: aisle, rack, shelf; odd racks on the left, even on the right", () => {
  assert.deepEqual(parseLocation("A-03-2"), { aisle: 0, rack: 3, shelf: 2 });
  assert.deepEqual(parseLocation("c-12-1"), { aisle: 2, rack: 12, shelf: 1 });
  assert.deepEqual(parseLocation("B051"), { aisle: 1, rack: 5, shelf: 1 });
  for (const bad of ["", "A-03", "Z-01-1", "A-00-1", "A-01-0", "A-1-2-3"]) assert.equal(parseLocation(bad), undefined, bad);
  assert.deepEqual(rackPosition(1), { pos: 1, side: "left" });
  assert.deepEqual(rackPosition(2), { pos: 1, side: "right" });
  assert.deepEqual(rackPosition(7), { pos: 4, side: "left" });
});

test("the aisle graph: steps along the aisles and the corridors", () => {
  const g = graphOf(W);
  // dispatch, then per aisle its foot, 4 positions and its head at the back
  assert.equal(g.ids.length, 1 + 3 * 6);
  assert.equal(distance(W, "dispatch", "A-01"), 3); // 2 to the foot of A, 1 up
  assert.equal(distance(W, "A-01", "A-02"), 0); // they face each other
  assert.equal(distance(W, "A-01-1", "A-07-2"), 3);
  assert.equal(distance(W, "dispatch", "B-05"), 8); // 2 + 3 along the front, 3 up
  // the back of A to the back of B: shorter through the back corridor
  assert.equal(distance(W, "A-07", "B-08"), 5);
  const noBack: Layout = { ...W, back: false };
  assert.equal(distance(noBack, "A-07", "B-08"), 11); // down, across, up again
});

test("a walk starts and ends at dispatch; its points follow the aisles", () => {
  assert.equal(walkLength(W, []), 0);
  assert.equal(walkLength(W, ["A-01"]), 6);
  assert.equal(walkLength(W, ["A-01", "A-03", "A-01"]), 3 + 1 + 1 + 3);
  assert.deepEqual(walkPoints(W, ["A-02"]), [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }]);
  assert.deepEqual(walkPoints(W, ["A-02"], true).at(-1), { x: 0, y: 0 });
});

/** Every order of the stops, for the brute-force check of Held–Karp. */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
}

test("the shortest route: Held–Karp equals trying every order", () => {
  const racks = ["A-01", "A-06", "B-03", "B-08", "C-02", "C-07", "A-04"];
  for (const layout of [W, { ...W, back: false }] as Layout[]) {
    for (let n = 1; n <= racks.length; n++) {
      const stops = racks.slice(0, n);
      const brute = Math.min(...permutations(stops).map((order) => walkLength(layout, order)));
      const { length, order } = shortestTour(layout, stops);
      assert.equal(length, brute, `${n} stops, back ${layout.back}`);
      assert.equal(walkLength(layout, order), length);
      assert.deepEqual([...order].sort(), [...stops].sort());
    }
  }
  // two racks that face each other are one stop; nothing to visit is no walk
  assert.deepEqual(shortestTour(W, ["A-01-1", "A-02-3"]), { length: 6, order: ["A-01"] });
  assert.deepEqual(shortestTour(W, []), { length: 0, order: [] });
  assert.equal(shortestRoute(W), 28);
});

test("pick: every line right, nothing extra", () => {
  assert.deepEqual(fields(W, PICK, { cart: RIGHT_CART }), {
    correct: true, lines: 6, linesTotal: 6, wrongItems: 0, quantityErrors: 0, picked: "cart: A-02-1=3, A-05-2=1, B-03-1=4, B-05-2=2, C-01-2=2, C-02-2=3",
  });
});

test("pick: a wrong article, a wrong quantity, a missing line", () => {
  const cart = { ...RIGHT_CART, "B-05-2": 0, "B-05-3": 2, "C-02-2": 2 } as Record<string, number>;
  delete cart["A-05-2"];
  const f = fields(W, PICK, { cart });
  assert.equal(f.lines, 3);
  assert.equal(f.wrongItems, 1); // the gloves L
  assert.equal(f.quantityErrors, 1); // 2 AAA for 3
  assert.equal(f.correct, false);
  // the same article from another location counts for its line
  const twice = normalizeWarehouse({ ...JSON.parse(serializeWarehouse(W)), products: [...W.products, { ...W.products.find((p) => p.loc === "A-02-1"), loc: "C-08-1" }] });
  assert.equal(fields(twice, PICK, { cart: { ...RIGHT_CART, "A-02-1": 1, "C-08-1": 2 } }).lines, 6);
});

test("pick with stock: take all there is of a short line, and report it", () => {
  // the batteries AAA: 3 asked, 2 on the shelf
  const checks = lineChecks(W, STOCK, state(W, { cart: { ...RIGHT_CART, "C-02-2": 2 } }));
  assert.deepEqual(checks[2], { line: 3, qty: 2, right: 2, short: true, reported: false, ok: false });
  assert.deepEqual(fields(W, STOCK, { cart: { ...RIGHT_CART, "C-02-2": 2 }, short: [3] }), {
    correct: true, lines: 6, linesTotal: 6, wrongItems: 0, quantityErrors: 0, shortagesReported: 1,
    picked: "cart: A-02-1=3, A-05-2=1, B-03-1=4, B-05-2=2, C-01-2=2, C-02-2=2; short: 3",
  });
  // a shortage reported where there was enough: that line is not right
  const f = fields(W, STOCK, { cart: { ...RIGHT_CART, "C-02-2": 2 }, short: [1, 3] });
  assert.equal(f.lines, 5);
  assert.equal(f.shortagesReported, 1);
  assert.equal(f.correct, false);
  // without stock, there is plenty: 3 AAA is right
  assert.equal(fields(W, PICK, { cart: RIGHT_CART }).lines, 6);
});

test("pick with a route: the walk against the shortest route, with a margin", () => {
  const best = correctState(W, ROUTE).walk;
  assert.equal(walkLength(W, best), 28);
  assert.deepEqual(fields(W, ROUTE, { cart: RIGHT_CART, walk: best }), {
    correct: true, lines: 6, linesTotal: 6, wrongItems: 0, quantityErrors: 0, routeLength: 28, shortestRoute: 28,
    picked: "cart: A-02-1=3, A-05-2=1, B-03-1=4, B-05-2=2, C-01-2=2, C-02-2=3",
  });
  // in the order of the list: back and forth
  const listOrder = W.order.lines.map((line) => line.loc.slice(0, 4));
  const f = fields(W, ROUTE, { cart: RIGHT_CART, walk: listOrder });
  assert.ok((f.routeLength as number) > 28);
  assert.equal(f.correct, false);
  assert.equal(fields(W, { ...ROUTE, routeMargin: (f.routeLength as number) - 28 }, { cart: RIGHT_CART, walk: listOrder }).correct, true);
});

test("check: the truth of every tote, and what the pupil found", () => {
  assert.deepEqual(W.order.lines.map((_, i) => toteVerdict(W, i)), ["article", "ok", "quantity", "ok", "missing", "ok"]);
  const right = correctState(W, CHECK).verdicts;
  assert.deepEqual(fields(W, CHECK, { verdicts: right }), {
    correct: true, lines: 6, linesTotal: 6, wrongItems: 1, quantityErrors: 1, picked: "check: 1=article, 2=ok, 3=quantity, 4=ok, 5=missing, 6=ok",
  });
  const f = fields(W, CHECK, { verdicts: ["quantity", "ok", "quantity", "", "missing", "ok"] });
  assert.equal(f.lines, 4);
  assert.equal(f.wrongItems, 0);
  assert.equal(f.quantityErrors, 1);
  assert.equal(f.picked, "check: 1=quantity, 2=ok, 3=quantity, 4=?, 5=missing, 6=ok");
});

test("nothing answered, nothing reported", () => {
  assert.equal(answered(PICK, emptyState(W)), false);
  assert.equal(answered(PICK, state(W, { walk: ["A-01"] })), false); // only looking
  assert.equal(answered(PICK, state(W, { cart: { "A-01-1": 1 } })), true);
  assert.equal(answered(PICK, state(W, { ticked: [1] })), true);
  assert.equal(answered(CHECK, state(W, { cart: { "A-01-1": 1 } })), false);
  assert.equal(answered(CHECK, state(W, { verdicts: ["", "ok", "", "", "", ""] })), true);
});

test("picked as text, and back", () => {
  assert.equal(serializePicked({ cart: { "B-01-1": 2, "A-01-1": 1, "C-01-2": 0 }, short: [4, 2] }), "cart: A-01-1=1, B-01-1=2; short: 2, 4");
  assert.deepEqual(parsePicked("cart: A-01-1=1, b-1-1=2; short: 2, 4"), { cart: { "A-01-1": 1, "B-01-1": 2 }, short: [2, 4] });
  assert.deepEqual(parsePicked("cart: "), { cart: {}, short: [] });
  assert.deepEqual(parsePicked("check: 1=article, 2=?, 3=ok"), { verdicts: { 1: "article", 3: "ok" } });
  assert.equal(parsePicked("something else"), undefined);
});

test("the warehouse setting: JSON, made sound, or the example", () => {
  assert.equal(parseWarehouse("not json"), undefined);
  assert.equal(parseWarehouse(JSON.stringify({ aisles: 2, products: [] })), undefined); // no order lines
  const w = parseWarehouse(
    JSON.stringify({
      aisles: 9, depth: 2, shelves: 2, back: false,
      products: [
        { loc: "a-1-1", article: "1", name: "Tea", unit: "box", picture: "teapot", stock: 5 },
        { loc: "A-01-1", article: "2", name: "Twice", unit: "box" },
        { loc: "B-09-1", article: "3", name: "Outside", unit: "box" },
      ],
      order: { number: "7", lines: [{ loc: "A-01-1", qty: 200 }, { loc: "A-02-1", qty: 1 }] },
      cart: [{ loc: "A-01-1", qty: 0 }],
    })
  )!;
  assert.equal(w.aisles, 6);
  assert.deepEqual(w.products, [{ loc: "A-01-1", article: "1", name: "Tea", unit: "box", picture: "box", stock: 5 }]);
  assert.deepEqual(w.order.lines, [{ loc: "A-01-1", qty: 99 }]);
  assert.deepEqual(w.cart, [null]);
  assert.deepEqual(parseWarehouse(serializeWarehouse(W)), W);
  assert.equal(warehouseFrom("", "nl").products[0].name, "Kopieerpapier A4");
  assert.equal(warehouseFrom("{}", "en").order.number, "2041");
});

test("the problems of an author's warehouse", () => {
  assert.deepEqual(warehouseProblems(W, PICK), []);
  assert.deepEqual(warehouseProblems(W, STOCK), []);
  assert.deepEqual(warehouseProblems(W, CHECK), []);
  const raw: Warehouse = {
    ...W,
    depth: 2,
    order: { ...W.order, lines: [{ loc: "A-02-1", qty: 1 }, { loc: "A-01-2", qty: 1 }, { loc: "A-02-1", qty: 2 }, { loc: "A-01-3", qty: 1 }] },
    cart: [{ loc: "A-02-1", qty: 1 }, null, { loc: "A-03-3", qty: 1 }, null],
  };
  assert.deepEqual(
    warehouseProblems(raw, PICK).map((p) => p.code),
    ["outside", "sameArticle", "emptyLocation", "emptyTote"]
  );
  assert.deepEqual(warehouseProblems({ ...W, order: { ...W.order, lines: [] }, cart: [] }, PICK).map((p) => p.code), ["noLines"]);
  // notes: stock on but nothing short; a roll cage without mistakes
  const plenty = { ...W, products: W.products.map((p) => ({ ...p, stock: 99 })) };
  assert.deepEqual(warehouseProblems(plenty, STOCK).map((p) => p.code), ["nothingShort"]);
  const perfect = { ...W, cart: W.order.lines.map((line) => ({ ...line })) };
  assert.deepEqual(warehouseProblems(perfect, CHECK).map((p) => p.code), ["noMistake"]);
});

test("the settings, and a state that belongs to one warehouse and task", () => {
  assert.deepEqual(settingsFrom({}), { task: "pick", route: false, stock: false, routeMargin: 0 });
  assert.deepEqual(settingsFrom({ task: "check", route: "true", stock: "true", routeMargin: "2,5" }), { task: "check", route: true, stock: true, routeMargin: 2.5 });
  assert.equal(layoutKey(W, PICK), layoutKey(exampleWarehouse("en"), PICK));
  assert.notEqual(layoutKey(W, PICK), layoutKey(W, CHECK));
  assert.notEqual(layoutKey(W, PICK), layoutKey(exampleWarehouse("nl"), PICK));
});
