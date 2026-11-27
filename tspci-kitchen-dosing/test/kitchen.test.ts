// npm test: scaling a recipe, sensible rounding per unit, the tools and their margins, the dose of a cleaning product,
// the settings, the response and the correct response of the kitchen PCI (src/kitchen.ts), in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRESET_PRODUCTS, PRESET_RECIPES, PRESET_TASKS, amountOk, answered, checksOf, cleaningFrom, cleaningSetting, correctAmount, correctFor, correctWork,
  cupSpec, doseFor, dosageText, emptyWork, formatAmount, formatCount, formatNumber, isWork, measureOk, measureTolerance, modelFrom, niceUp,
  parseDosage, parseNumber, presetRecipe, readResponse, recipeFrom, recipeSetting, responseFor, roundings, scaleDisplay, scaled, sensibleAmounts,
  snap, toolOf, toolSpec, workFrom, workText, type DosingModel, type RecipeModel, type Work,
} from "../src/kitchen.ts";

const fields = (response: unknown) => readResponse(response);

test("parseNumber: numbers as a pupil writes them", () => {
  for (const [text, value] of [["375", 375], ["37,5", 37.5], ["37.5", 37.5], [" 3 ", 3], ["0,75", 0.75], [",5", 0.5], ["½", 0.5], ["1½", 1.5], ["1 ½", 1.5], ["¾", 0.75], ["1 1/2", 1.5], ["3/4", 0.75], ["2 / 4", 0.5]] as const)
    assert.equal(parseNumber(text), value, text);
  for (const bad of ["", "  ", "abc", "-3", "3 g", "1.2.3", "1/0", "3,", "veel"]) assert.equal(parseNumber(bad), null, bad);
});

test("formatNumber and formatCount: a decimal comma in Dutch, halves as ½", () => {
  assert.equal(formatNumber(37.5, "nl"), "37,5");
  assert.equal(formatNumber(37.5, "en"), "37.5");
  assert.equal(formatNumber(1 / 3, "en"), "0.33");
  assert.equal(formatNumber(375, "nl"), "375");
  assert.equal(formatCount(1.5, "en"), "1½");
  assert.equal(formatCount(0.5, "nl"), "½");
  assert.equal(formatCount(0.75, "nl"), "¾");
  assert.equal(formatCount(3, "nl"), "3");
  assert.equal(formatAmount(1.5, "tbsp", "nl"), "1½");
  assert.equal(formatAmount(0.75, "l", "nl"), "0,75");
});

test("scaled: amount × persons asked / persons of the recipe, without floating point noise", () => {
  assert.equal(scaled(250, 4, 6), 375);
  assert.equal(scaled(25, 4, 6), 37.5);
  assert.equal(scaled(1, 4, 6), 1.5);
  assert.equal(scaled(0.1, 3, 9), 0.3);
  assert.equal(scaled(500, 4, 2), 250);
  assert.equal(scaled(100, 3, 1), 33.333333);
});

test("roundings: the nearest step, both neighbours exactly halfway", () => {
  assert.deepEqual(roundings(3, 1), [3]);
  assert.deepEqual(roundings(1.5, 1), [1, 2]);
  assert.deepEqual(roundings(2.25, 1), [2]);
  assert.deepEqual(roundings(2.75, 1), [3]);
  assert.deepEqual(roundings(0.75, 0.5), [0.5, 1]);
  assert.deepEqual(roundings(33.333333, 1), [33]);
  assert.deepEqual(roundings(1.875, 0.01), [1.87, 1.88]);
});

test("sensibleAmounts: pieces whole and never 0, spoons in halves and never 0", () => {
  assert.deepEqual(sensibleAmounts(1.5, "piece"), [1, 2]);
  assert.deepEqual(sensibleAmounts(0.5, "piece"), [1]);
  assert.deepEqual(sensibleAmounts(0.25, "piece"), [1]);
  assert.deepEqual(sensibleAmounts(0.2, "tsp"), [0.5]);
  assert.deepEqual(sensibleAmounts(0.75, "tsp"), [0.5, 1]);
  assert.deepEqual(sensibleAmounts(37.5, "g"), [37, 38]);
});

test("amountOk: exact, a sensible rounding, or within the margin for grams and ml", () => {
  // grams: exact, or rounded to a whole gram
  assert.ok(amountOk(37.5, 37.5, "g"));
  assert.ok(amountOk(38, 37.5, "g"));
  assert.ok(amountOk(37, 37.5, "g"));
  assert.ok(!amountOk(40, 37.5, "g"));
  assert.ok(amountOk(40, 37.5, "g", 10)); // within 10 %
  assert.ok(!amountOk(42, 37.5, "g", 10));
  // pieces: whole numbers only, rounded
  assert.ok(amountOk(3, 3, "piece"));
  assert.ok(!amountOk(2.5, 2.5, "piece"));
  assert.ok(amountOk(2, 2.5, "piece"));
  assert.ok(amountOk(3, 2.5, "piece"));
  assert.ok(!amountOk(4, 3.4, "piece"));
  assert.ok(amountOk(1, 0.5, "piece"));
  assert.ok(!amountOk(0, 0.5, "piece"));
  assert.ok(!amountOk(4, 3.4, "piece", 50)); // no margin for pieces
  // spoons: exact or to half a spoon
  assert.ok(amountOk(0.75, 0.75, "tsp"));
  assert.ok(amountOk(1, 0.75, "tsp"));
  assert.ok(amountOk(0.5, 0.75, "tsp"));
  assert.ok(!amountOk(2, 1.5, "tbsp"));
  // litres: exact or to a hundredth
  assert.ok(amountOk(1.5, 1.5, "l"));
  assert.ok(amountOk(1.88, 1.875, "kg"));
  assert.ok(!amountOk(1.9, 1.875, "kg"));
  // nothing written, nonsense, zero
  assert.ok(!amountOk(null, 3, "g"));
  assert.ok(!amountOk(0, 0.3, "g"));
});

test("correctAmount: the exact amount with at most two decimals, otherwise rounded (the larger when halfway)", () => {
  assert.equal(correctAmount(37.5, "g"), 37.5);
  assert.equal(correctAmount(33.333333, "g"), 33);
  assert.equal(correctAmount(1.5, "piece"), 2);
  assert.equal(correctAmount(3, "piece"), 3);
  assert.equal(correctAmount(0.75, "tsp"), 0.75);
  assert.equal(correctAmount(0.125, "tsp"), 0.5);
});

test("toolOf and toolSpec: the tool for a unit, sized to the amount", () => {
  assert.equal(toolOf("g"), "scale");
  assert.equal(toolOf("kg"), "scale");
  assert.equal(toolOf("dl"), "jug");
  assert.equal(toolOf("tsp"), "spoon");
  assert.equal(toolOf("piece"), "pieces");
  assert.deepEqual(toolSpec("scale", 375), { tool: "scale", max: 1000, step: 5, big: 50 });
  assert.deepEqual(toolSpec("scale", 37.5), { tool: "scale", max: 100, step: 1, big: 10 });
  assert.deepEqual(toolSpec("scale", 1500), { tool: "scale", max: 5000, step: 10, big: 100 });
  assert.equal(toolSpec("jug", 750).max, 1000);
  assert.equal(toolSpec("jug", 900).max, 2000); // a full jug is hard to read: room to spare
  assert.equal(toolSpec("jug", 225).max, 500);
  assert.equal(toolSpec("spoon", 3).max, 10);
  assert.equal(toolSpec("pieces", 9).max, 18);
  assert.equal(niceUp(750), 1000);
  assert.equal(niceUp(200), 200);
  assert.equal(niceUp(201), 250);
  assert.deepEqual(cupSpec(50), { tool: "cup", max: 50, step: 1, big: 10, minor: 5, major: 10 });
  assert.equal(cupSpec(33).max, 50);
  assert.equal(snap(toolSpec("scale", 375), 37.5 * 10 + 1), 375);
  assert.equal(snap(toolSpec("spoon", 1), 1.3), 1.5);
  assert.equal(snap(toolSpec("spoon", 1), 99), 10);
});

test("measureOk: the margin in percent on a scale, in a jug or cup; at least half a step; spoons and pieces exact", () => {
  const scale = toolSpec("scale", 375);
  assert.equal(measureTolerance(375, scale, 5), 18.75);
  assert.ok(measureOk(390, 375, scale, 5));
  assert.ok(!measureOk(400, 375, scale, 5));
  assert.ok(measureOk(375, 375, scale, 0));
  assert.ok(measureOk(40, 37.5, toolSpec("scale", 200), 0)); // steps of 5 g: half a step
  const spoon = toolSpec("spoon", 3);
  assert.ok(measureOk(3, 3, spoon, 50));
  assert.ok(!measureOk(2.5, 3, spoon, 50));
  const pieces = toolSpec("pieces", 3);
  assert.ok(!measureOk(2, 3, pieces, 50));
  assert.ok(!measureOk(3, null, pieces, 5));
});

test("doses: 1 : 100 and ml per litre", () => {
  assert.equal(doseFor({ kind: "ratio", parts: 100 }, 5), 50);
  assert.equal(doseFor({ kind: "ratio", parts: 50 }, 4), 80);
  assert.equal(doseFor({ kind: "ratio", parts: 200 }, 3), 15);
  assert.equal(doseFor({ kind: "perLitre", ml: 20 }, 2), 40);
  assert.equal(doseFor({ kind: "perLitre", ml: 12.5 }, 8), 100);
  assert.deepEqual(parseDosage("1:100"), { kind: "ratio", parts: 100 });
  assert.deepEqual(parseDosage("1 op 50"), { kind: "ratio", parts: 50 });
  assert.deepEqual(parseDosage(" 20 ml/l"), { kind: "perLitre", ml: 20 });
  assert.deepEqual(parseDosage("12,5 ml per liter"), { kind: "perLitre", ml: 12.5 });
  for (const bad of ["", "100", "2:100", "1:0", "20 ml", "ml/l"]) assert.equal(parseDosage(bad), null, bad);
  assert.equal(dosageText({ kind: "ratio", parts: 100 }, "nl"), "1 : 100");
  assert.equal(dosageText({ kind: "perLitre", ml: 12.5 }, "nl"), "12,5 ml per liter");
  assert.equal(dosageText({ kind: "perLitre", ml: 20 }, "en"), "20 ml per litre");
});

test("recipeFrom: a preset, a preset with other lines measured, the author's own, and what can not be read", () => {
  const pancakes = recipeFrom("pancakes", "nl").recipe;
  assert.equal(pancakes.name, "Pannenkoeken");
  assert.equal(pancakes.lines[0].name, "bloem");
  assert.equal(recipeFrom("", "en").recipe.preset, "pancakes");
  const measured = recipeFrom(JSON.stringify({ preset: "soup", measure: [false, true] }), "en").recipe;
  assert.deepEqual(measured.lines.map((l) => l.measure), [false, true, false, false, false, false]);
  const own = recipeFrom(JSON.stringify({ name: "Omelette", persons: 2, lines: [{ name: "eggs", amount: 4, unit: "piece", measure: true, icon: "egg" }, { name: "milk", amount: "50", unit: "ml" }] }), "en");
  assert.deepEqual(own.problems, []);
  assert.equal(own.recipe.persons, 2);
  assert.deepEqual(own.recipe.lines[1], { name: "milk", amount: 50, unit: "ml", measure: false });
  assert.deepEqual(recipeFrom("{nonsense", "en").problems, ["badRecipe"]);
  assert.deepEqual(recipeFrom(JSON.stringify({ persons: 0, lines: [{ name: "x", amount: -1, unit: "g" }] }), "en").problems, ["badLine", "noLines", "badRecipePersons"]);
  const many = recipeFrom(JSON.stringify({ persons: 4, lines: Array.from({ length: 12 }, (_, i) => ({ name: `x${i}`, amount: 1, unit: "g" })) }), "en");
  assert.deepEqual(many.problems, ["tooManyLines"]);
  assert.equal(many.recipe.lines.length, 10);
});

test("recipeSetting: back to the setting, and read again the same", () => {
  assert.equal(recipeSetting(presetRecipe("stamppot", "en")), "stamppot");
  const recipe = presetRecipe("pancakes", "en");
  recipe.lines[4].measure = true;
  assert.equal(recipeSetting(recipe), JSON.stringify({ preset: "pancakes", measure: [true, true, true, true, true] }));
  const own = { preset: null, name: "Tea", persons: 1, lines: [{ name: "water", amount: 250, unit: "ml" as const, measure: true, color: "#cfe8f7" }] };
  assert.deepEqual(recipeFrom(recipeSetting(own), "nl").recipe, own);
});

test("cleaningFrom: a preset, JSON with other products and dosages, and what can not be read", () => {
  const floor = cleaningFrom("floor").cleaning;
  assert.equal(floor.volume, 5);
  assert.deepEqual(floor.products.map((p) => p.id), ["floor", "allPurpose", "sanitary"]);
  const json = cleaningFrom(JSON.stringify({ surface: "window", volume: 8, products: ["glass", "floor", "nope"], dosages: { glass: "12,5 ml/l" }, choose: false, cup: 250 }));
  assert.deepEqual(json.problems, []);
  assert.deepEqual(json.cleaning.products.map((p) => p.id), ["glass", "floor"]);
  assert.deepEqual(json.cleaning.products[0].dosage, { kind: "perLitre", ml: 12.5 });
  assert.equal(json.cleaning.choose, false);
  assert.equal(json.cleaning.cup, 250);
  assert.deepEqual(cleaningFrom(cleaningSetting(json.cleaning)).cleaning, json.cleaning);
  assert.deepEqual(cleaningFrom("[").problems, ["badCleaning"]);
  assert.deepEqual(cleaningFrom(JSON.stringify({ surface: "floor", volume: 0, dosages: { floor: "veel" } })).problems, ["badVolume", "badDosage"]);
  for (const id of Object.keys(PRESET_TASKS)) {
    const model = modelFrom({ mode: "dosing", cleaning: id }) as DosingModel;
    assert.ok(model.right, id);
    assert.ok(model.dose > 0 && model.dose <= 4 * model.spec.max, id);
  }
});

const recipeModel = (settings = {}) => modelFrom({ mode: "recipe", recipe: "pancakes", persons: "6", ...settings }) as RecipeModel;
const dosingModel = (settings = {}) => modelFrom({ mode: "dosing", cleaning: "floor", ...settings }) as DosingModel;

test("modelFrom: the pancakes for 6, the defaults, problems", () => {
  const m = recipeModel();
  assert.deepEqual(m.lines.map((l) => l.exact), [375, 750, 3, 3, 75]);
  assert.deepEqual(m.lines.map((l) => l.spec?.tool ?? null), ["scale", "jug", "pieces", "spoon", null]);
  assert.equal(m.bowl, 150);
  assert.equal(m.measureMargin, 5);
  assert.equal(m.amountMargin, 0);
  assert.equal(recipeModel({ bowl: "false" }).bowl, 0);
  assert.deepEqual(recipeModel({ persons: "nul" }).problems, ["badPersons"]);
  assert.equal(recipeModel({ persons: "nul" }).persons, 6);
  const d = dosingModel();
  assert.equal(d.dose, 50);
  assert.equal(d.right?.id, "floor");
  assert.equal(d.shelf.length, 3);
  assert.equal(dosingModel({ cleaning: JSON.stringify({ surface: "floor", products: ["glass"] }) }).problems.includes("noProduct"), true);
  assert.equal(dosingModel({ cleaning: JSON.stringify({ surface: "floor", choose: false }) }).shelf.length, 1);
});

/** Work with these amounts written and these contents measured. */
const workOf = (m: RecipeModel, amounts: string[], content: number[] = [], tare: number[] = []): Work => {
  const work = emptyWork(m);
  amounts.forEach((a, i) => (work.amounts[i] = a));
  content.forEach((c, i) => (work.content[i] = c));
  tare.forEach((t, i) => (work.tare[i] = t));
  return work;
};

test("responseFor: nothing until answered; per-line checks; measured against the pupil's own amount", () => {
  const m = recipeModel();
  assert.equal(responseFor(m, emptyWork(m)), undefined);
  assert.equal(answered(emptyWork(m)), false);

  // all right: 375 g weighed as 380 g (within 5 %), 750 ml, 3 eggs, 3 spoons
  const right = workOf(m, ["375", "750", "3", "3", "75"], [380, 750, 3, 3]);
  assert.deepEqual(fields(responseFor(m, right)), {
    line1: true, line2: true, line3: true, line4: true, line5: true, amountsCorrect: true, measuredCorrect: true, correct: true,
    work: JSON.stringify({ amounts: ["375", "750", "3", "3", "75"], measured: [380, 750, 3, 3, null] }),
  });

  // a wrong amount, weighed as written: the line and the amounts are wrong, the measuring is right
  const wrong = workOf(m, ["350", "750", "3", "3", "75"], [350, 750, 3, 3]);
  const f = fields(responseFor(m, wrong));
  assert.equal(f.line1, false);
  assert.equal(f.amountsCorrect, false);
  assert.equal(f.measuredCorrect, true);
  assert.equal(f.correct, false);

  // right amounts, one egg short
  const short = fields(responseFor(m, workOf(m, ["375", "750", "3", "3", "75"], [375, 750, 2, 3])));
  assert.deepEqual([short.line3, short.amountsCorrect, short.measuredCorrect, short.correct], [false, true, false, false]);

  // a measured line without an amount written: not measured right
  assert.equal(checksOf(m, workOf(m, ["", "750", "3", "3", "75"], [375, 750, 3, 3])).measuredCorrect, false);

  // no measured lines: no measuredCorrect
  const none = recipeModel({ recipe: JSON.stringify({ preset: "pancakes", measure: [] }) });
  assert.equal("measuredCorrect" in fields(responseFor(none, workOf(none, ["375"]))), false);
});

test("the scale: the display is bowl + content − tare", () => {
  assert.equal(scaleDisplay(150, 0, 0), 150);
  assert.equal(scaleDisplay(150, 375, 150), 375);
  assert.equal(scaleDisplay(150, 375, 0), 525);
  assert.equal(scaleDisplay(150, 100, 200), 50);
});

test("dosing: the product, the amount and the pours", () => {
  const m = dosingModel();
  const work = emptyWork(m);
  work.product = "floor";
  work.amounts[0] = "50";
  work.pours = [30, 20];
  assert.deepEqual(fields(responseFor(m, work)), {
    line1: true, amountsCorrect: true, measuredCorrect: true, product: "floor", correct: true,
    work: JSON.stringify({ amounts: ["50"], measured: [50], product: "floor", pours: [30, 20] }),
  });
  work.product = "sanitary";
  assert.deepEqual([fields(responseFor(m, work)).product, fields(responseFor(m, work)).correct], ["sanitary", false]);
  // only a product chosen: an answer, but the amount is not
  const chosen = emptyWork(m);
  chosen.product = "floor";
  assert.deepEqual(fields(responseFor(m, chosen)).amountsCorrect, false);
  // without a choice: no product field
  const only = dosingModel({ cleaning: JSON.stringify({ surface: "floor", choose: false }) });
  const w = emptyWork(only);
  w.amounts[0] = "50";
  assert.equal("product" in fields(responseFor(only, w)), false);
});

test("correctFor and correctWork: every check true; the correct work gives the correct response", () => {
  for (const preset of Object.keys(PRESET_RECIPES))
    for (const persons of ["1", "2", "3", "5", "6", "8", "10", "15"]) {
      for (const language of ["en", "nl"]) {
        const m = modelFrom({ mode: "recipe", recipe: preset, persons, language }) as RecipeModel;
        const correct = fields(correctFor(m));
        assert.equal(correct.correct, true, `${preset} ${persons}`);
        const response = fields(responseFor(m, correctWork(m)));
        delete response.work;
        assert.deepEqual(response, correct, `${preset} ${persons} ${language}`);
      }
    }
  for (const task of Object.keys(PRESET_TASKS))
    for (const cup of [25, 50, 100, 250])
      for (const volume of [1, 2.5, 5, 7, 10]) {
        const m = modelFrom({ mode: "dosing", cleaning: JSON.stringify({ preset: task, surface: PRESET_TASKS[task].surface, volume, cup }) }) as DosingModel;
        const response = fields(responseFor(m, correctWork(m)));
        delete response.work;
        assert.deepEqual(response, fields(correctFor(m)), `${task} ${cup} ${volume}`);
        assert.equal(response.correct, true);
      }
  const sanitary = modelFrom({ mode: "dosing", cleaning: "sanitary" }) as DosingModel;
  assert.deepEqual(correctWork(sanitary).pours, [50, 30]);
  assert.equal(correctFor(recipeModel({ recipe: "{" })), undefined);
});

test("workText and workFrom: the work field restores the work", () => {
  const m = recipeModel({ recipe: "soup", language: "nl" });
  const work = workOf(m, ["1,5", "3", "450", "", "", ""], [1500, 3, 450], [0, 0, 150]);
  const text = workText(m, work);
  assert.equal(text, JSON.stringify({ amounts: ["1,5", "3", "450", "", "", ""], measured: [1.5, 3, 450, null, null, null] }));
  const back = workFrom(m, text)!;
  assert.deepEqual(back.amounts, work.amounts);
  assert.deepEqual(back.content, [1500, 3, 450, 0, 0, 0]);
  assert.deepEqual(back.tare, [0, 0, 150, 0, 0, 0]); // the scale tared: it shows what was weighed
  assert.ok(isWork(back, m));
  assert.equal(workFrom(m, "nope"), null);
  assert.equal(workFrom(m, 3), null);
  const d = dosingModel();
  const dw = workFrom(d, JSON.stringify({ amounts: ["50"], measured: [50], product: "floor", pours: [50] }))!;
  assert.deepEqual(dw.pours, [50]);
  assert.equal(dw.product, "floor");
  assert.ok(!isWork({ ...dw, amounts: ["1", "2"] }, d));
});

test("the products are no brands: stylised names only, and each preset task has its product", () => {
  for (const [id, task] of Object.entries(PRESET_TASKS)) {
    const right = task.products.map((p) => PRESET_PRODUCTS[p]).find((p) => p.surfaces.includes(task.surface));
    assert.ok(right, id);
  }
});
