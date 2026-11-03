// npm test: the logic of the nutrition label PCI (src/nutrition.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXAMPLE_SOLUTION, addEntry, amountOf, composition, entriesFrom, evaluate, examplePlan, extremeProduct, formatNumber, formatValue,
  groupsIn, idFrom, isIdentifier, nutrientsOf, ownEntries, parseCheck, parseGroup, parseNumber, parsePlan, parseProducts, parseReference,
  percentOf, perPortion, serializePlan, toTSV, totals, withEnergy, REFERENCES, type Plan,
} from "../src/nutrition.ts";

const plan = examplePlan("en");

test("numbers: a decimal point or comma, thousands", () => {
  assert.equal(parseNumber("1,5"), 1.5);
  assert.equal(parseNumber("1.5"), 1.5);
  assert.equal(parseNumber(" 2 500 "), 2500);
  assert.equal(parseNumber("1.234,5"), 1234.5);
  assert.equal(parseNumber("1,234.5"), 1234.5);
  assert.equal(parseNumber("1.234", ","), 1234);
  assert.equal(parseNumber("1.234"), 1.234);
  assert.equal(parseNumber("−3"), -3);
  assert.equal(parseNumber("abc"), null);
  assert.equal(parseNumber(""), null);
  assert.equal(formatNumber(1.5, "nl"), "1,5");
  assert.equal(formatNumber(1.5, "en"), "1.5");
  assert.equal(formatNumber(12345, "nl", 0), "12.345");
  assert.equal(formatNumber(8400, "nl", 0), "8400");
  assert.equal(formatNumber(2, "en", 1), "2");
  assert.equal(formatNumber(2, "en", 1, false), "2.0");
  assert.equal(formatValue(0.35, "salt", "nl"), "0,35");
});

test("energy: kcal from kJ and back", () => {
  assert.deepEqual(withEnergy({ energyKcal: 100 }), { energyKcal: 100, energyKj: 418 });
  assert.deepEqual(withEnergy({ energyKj: 1000 }), { energyKj: 1000, energyKcal: 239 });
});

test("the example: products, portions, amounts", () => {
  assert.equal(plan.products.length, 14);
  assert.ok(plan.products.every((p) => isIdentifier(p.id)));
  const bread = plan.products.find((p) => p.id === "bread")!;
  assert.equal(bread.per100.energyKj, 1000);
  assert.equal(perPortion(bread)!.protein, 3.5);
  assert.equal(amountOf(bread, 150).energyKj, 1500);
  assert.equal(examplePlan("nl").products[0].name, "Volkorenbrood");
});

test("a meal: entries, merging, composition and totals", () => {
  let entries = addEntry([], plan.products, { product: "bread", amount: 2, unit: "portion" });
  entries = addEntry(entries, plan.products, { product: "bread", amount: 1, unit: "portion" });
  assert.deepEqual(entries, [{ product: "bread", amount: 3, unit: "portion" }]);
  entries = addEntry(entries, plan.products, { product: "bread", amount: 10, unit: "g" });
  assert.deepEqual(entries, [{ product: "bread", amount: 115, unit: "g" }]);
  entries = addEntry(entries, plan.products, { product: "apple", amount: 1, unit: "portion" });
  assert.deepEqual(composition(entries, plan.products), { apple: 135, bread: 115 });
  // the same meal entered differently: the same composition
  const other = [{ product: "apple" as const, amount: 135, unit: "g" as const }, { product: "bread", amount: 115, unit: "g" as const }];
  assert.deepEqual(composition(other, plan.products), composition(entries, plan.products));
  const sum = totals({ apple: 135, bread: 115 }, plan.products);
  assert.equal(sum.energyKj, 1150 + 294);
  assert.equal(sum.protein, 11.9);
  assert.equal(sum.salt, 1.15);
  assert.equal(sum.vitaminC, 9);
  assert.equal(totals({}, plan.products).energyKj, 0);
  assert.equal(totals({}, plan.products).vitaminC, undefined);
  assert.deepEqual(ownEntries(plan.products, [{ product: "nope", amount: 3, unit: "g" }, { product: "milk", amount: 0, unit: "g" }, { product: "egg", amount: 1, unit: "portion" }, { product: "egg", amount: 1, unit: "portion" }]),
    [{ product: "egg", amount: 2, unit: "portion" }]);
  assert.deepEqual(ownEntries(plan.products, "rubbish"), []);
  assert.deepEqual(entriesFrom({ bread: 70, nope: 3 }, plan.products), [{ product: "bread", amount: 70, unit: "g" }]);
});

test("reference intakes and percentages", () => {
  assert.equal(percentOf(2100, "energyKj", REFERENCES.adult), 25);
  assert.equal(percentOf(3, "salt", REFERENCES.child), 86);
  assert.equal(percentOf(3, "salt", {}), null);
  assert.equal(parseReference({ group: "teen" }).values.energyKj, 10500);
  assert.deepEqual(parseReference({ group: "custom", values: { energyKj: "9000", salt: 5 } }), { group: "custom", values: { energyKj: 9000, salt: 5 } });
  assert.equal(parseReference(null).group, "adult");
});

test("checks: the example solution passes all, a heavy lunch fails some", () => {
  const good = evaluate(plan, EXAMPLE_SOLUTION);
  assert.deepEqual(good.results.map((r) => r.passed), [true, true, true, true]);
  assert.equal(good.score, 4);
  assert.equal(good.maxscore, 4);
  assert.equal(good.correct, true);
  assert.equal(good.totals.energyKj, 1776);
  const heavy = evaluate(plan, { croissant: 90, cola: 500, crisps: 25 });
  assert.deepEqual(heavy.results.map((r) => r.passed), [false, false, true, false]);
  assert.equal(heavy.score, 1);
  assert.equal(heavy.correct, false);
  assert.deepEqual(groupsIn(EXAMPLE_SOLUTION, plan.products), ["fruitVeg", "protein", "starch"]);
});

test("checks: count, required, forbidden, % of the reference intake, points", () => {
  const p: Plan = {
    ...plan,
    checks: [
      { type: "count", min: 2, max: 3, points: 2 },
      { type: "required", products: ["apple", "milk"], points: 1 },
      { type: "forbidden", products: ["cola"], points: 1 },
      { type: "nutrient", nutrient: "energyKj", ri: true, max: 30, points: 1 },
      { type: "required", products: [], points: 1 },
    ],
  };
  const e = evaluate(p, { apple: 135, milk: 250 });
  assert.deepEqual(e.results.map((r) => r.passed), [true, true, true, true, false]);
  assert.equal(e.results[3].value, 9.2);
  assert.equal(e.score, 5);
  assert.equal(e.maxscore, 6);
  const f = evaluate(p, { apple: 135, cola: 250, bread: 35, egg: 55 });
  assert.deepEqual(f.results.map((r) => r.passed), [false, false, false, true, false]);
  assert.equal(parseCheck({ type: "nutrient", nutrient: "nope" }), null);
  assert.equal(parseCheck({ type: "what" }), null);
  assert.deepEqual(parseCheck({ type: "count", min: "2.4" }), { type: "count", min: 2, points: 1 });
});

test("select mode: the product with the most salt per portion is the soup, per 100 g the chicken", () => {
  assert.equal(extremeProduct(plan.products, "salt", "portion"), "soup");
  assert.equal(extremeProduct(plan.products, "salt", "100g"), "chicken");
  assert.equal(extremeProduct(plan.products, "energyKj", "100g", "min"), "tomatoes");
  assert.equal(extremeProduct(plan.products, "salt", "portion", "min"), null); // apple and cola: a tie
});

test("a product table from a spreadsheet: Dutch headers, decimal commas, ids from names", () => {
  const tsv = "Naam\tGroep\tPortie (g)\tPortieomschrijving\tEnergie (kJ)\tVet\tWaarvan verzadigde vetzuren\tKoolhydraten\tWaarvan suikers\tVezels\tEiwitten\tZout\tCalcium (mg)\n" +
    "Volkoren crackers\tbrood\t10\t1 cracker\t1650\t6,5\t1,2\t62\t2\t12\t13\t0,9\t\n" +
    "Kwark\tzuivel\t150\t1 schaaltje\t240\t0,2\t0,1\t4\t4\t0\t9\t0,1\t110\n" +
    "Kwark\t\t\t\t240\t\t\t\t\t\t\t\t\n" +
    "\tx\n";
  const { products, problems } = parseProducts(tsv);
  assert.equal(products.length, 3);
  assert.equal(products[0].id, "volkorenCrackers");
  assert.equal(products[0].group, "starch");
  assert.equal(products[0].per100.fat, 6.5);
  assert.equal(products[0].per100.energyKcal, 394);
  assert.equal(products[1].per100.calcium, 110);
  assert.equal(products[1].portionLabel, "1 schaaltje");
  assert.equal(products[2].id, "kwark2");
  assert.deepEqual(problems.map((p) => p.what), ["duplicateId", "noName"]);
});

test("a product table without headers, in the column order of the copy; problems", () => {
  const tsv = toTSV(plan.products);
  const back = parseProducts(tsv);
  assert.deepEqual(back.problems, []);
  assert.deepEqual(back.products, plan.products);
  const noHeader = parseProducts(tsv.split("\n").slice(1).join("\n"));
  assert.deepEqual(noHeader.products, plan.products);
  const bad = parseProducts("id\tname\tgroup\tportion\tkj\n1x\tThing\tmoon\tabc\tlots\n");
  assert.deepEqual(bad.problems.map((p) => p.what), ["badId", "badNumber", "noEnergy", "badNumber", "badGroup"]);
  assert.equal(parseGroup("Groente en fruit"), "fruitVeg");
  assert.equal(parseGroup("3"), "protein");
  assert.equal(idFrom("Crème fraîche 30+"), "cremeFraiche30");
  assert.equal(idFrom("7up"), "p7up");
});

test("the plan as JSON: round trip, the example when empty or broken, unknown things go", () => {
  const back = parsePlan(serializePlan(plan));
  assert.deepEqual(back, plan);
  assert.deepEqual(parsePlan(""), plan);
  assert.deepEqual(parsePlan("{not json"), plan);
  const odd = parsePlan(JSON.stringify({
    products: [{ id: "a", name: "A", per100: { energyKj: 100 } }, { id: "a", name: "A again", per100: {} }, { name: "" }],
    reference: { group: "child" }, checks: [{ type: "count", min: 1 }, { type: "nope" }], solution: { a: 50, zz: -1 }, answer: "b",
  }));
  assert.equal(odd.products.length, 1);
  assert.equal(odd.products[0].per100.energyKcal, 24);
  assert.equal(odd.reference.values.energyKj, 6700);
  assert.equal(odd.checks.length, 1);
  assert.deepEqual(odd.solution, { a: 50 });
  assert.equal(odd.answer, null);
});

test("the rows: core nutrients always, vitamins and minerals when a product has them", () => {
  assert.deepEqual(nutrientsOf(plan.products), ["energyKj", "energyKcal", "fat", "saturates", "carbs", "sugars", "fibre", "protein", "salt", "vitaminC", "calcium", "iron"]);
  assert.equal(nutrientsOf(plan.products, false).length, 9);
  assert.equal(nutrientsOf([plan.products[2]]).length, 9);
});
