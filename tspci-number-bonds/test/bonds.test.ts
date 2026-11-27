// npm test: the notation, the checks, the response and the correct answer of the number bonds (src/bonds.ts) in node,
// without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allSplitsOf, check, exampleSolution, layoutProblems, modelFrom, numbersOf, parseHouse, parseNumber, parseTree, responseFields,
  serializeHouse, serializeTree, startValues, textsFromNumbers, treeLayout, uniqueSolution, valuesOf, answered, type Model,
} from "../src/bonds.ts";

/** The pupil's texts: the given boxes as they are, the others from the list, in box order. */
const fillIn = (model: Model, pupil: string[]) => {
  const texts = startValues(model);
  let k = 0;
  model.given.forEach((given, i) => {
    if (given === null) texts[i] = pupil[k++] ?? "";
  });
  return texts;
};
const field = (model: Model, texts: string[], name: string) => responseFields(model, texts).find((f) => f.name === name)?.value;

test("parseNumber: whole numbers, and decimals with a comma or a point only when they are on", () => {
  assert.equal(parseNumber("7"), 7);
  assert.equal(parseNumber(" 40 "), 40);
  assert.equal(parseNumber("100"), 100);
  assert.equal(parseNumber("0,3"), undefined);
  assert.equal(parseNumber("0,3", true), 0.3);
  assert.equal(parseNumber("0.7", true), 0.7);
  assert.equal(parseNumber(",5", true), 0.5);
  for (const bad of ["", "-2", "3 4", "1/2", "x", "12345", "1,234"]) assert.equal(parseNumber(bad, true), undefined, bad);
});

test("the house in its notation, and back", () => {
  assert.deepEqual(parseHouse("7: 3|?; ?|2"), { roof: 7, rows: [[3, null], [null, 2]] });
  assert.deepEqual(parseHouse("?: 3|4"), { roof: null, rows: [[3, 4]] });
  assert.deepEqual(parseHouse("3|4; 5|"), { roof: null, rows: [[3, 4], [5, null]] });
  assert.deepEqual(parseHouse("10"), { roof: 10, rows: [] });
  assert.deepEqual(parseHouse("1: 0,3|?"), { roof: 1, rows: [[0.3, null]] });
  assert.equal(parseHouse("7: 3|4|5"), null);
  assert.equal(parseHouse("7: a|4"), null);
  assert.equal(serializeHouse({ roof: 7, rows: [[3, null], [null, 2]] }), "7: 3|?; ?|2");
});

test("the tree in its notation, and back", () => {
  assert.deepEqual(parseTree("47(40|7)"), { value: 47, parts: [{ value: 40, parts: [] }, { value: 7, parts: [] }] });
  assert.equal(serializeTree(parseTree(" ?( 5 | 3 (2|?)) ")!), "?(5|3(2|?))");
  assert.equal(serializeTree(parseTree("12(?|?|?)")!), "12(?|?|?)");
  assert.equal(serializeTree(parseTree("1(0,3|?)")!), "1(0.3|?)");
  for (const bad of ["47", "47(40)", "47(1|2|3|4)", "47(40|7", "47(40|7))", "1(1(1(1(1|1)|1)|1)|1)"]) assert.equal(parseTree(bad), null, bad);
});

test("all splits: with or without 0, the order counting or not", () => {
  assert.deepEqual(allSplitsOf(4, true, true), [[0, 4], [1, 3], [2, 2], [3, 1], [4, 0]]);
  assert.deepEqual(allSplitsOf(4, false, true), [[1, 3], [2, 2], [3, 1]]);
  assert.deepEqual(allSplitsOf(5, true, false), [[0, 5], [1, 4], [2, 3]]);
  assert.deepEqual(allSplitsOf(5, false, false), [[1, 4], [2, 3]]);
});

test("the model from the settings: a house, a tree, all splits, and the defaults for a layout that cannot be read", () => {
  const house = modelFrom({ model: "house", house: "7: 3|?; ?|2" });
  assert.deepEqual(house.given, [7, 3, null, null, 2]);
  assert.deepEqual(house.sums, [{ whole: 0, parts: [1, 2] }, { whole: 0, parts: [3, 4] }]);
  const tree = modelFrom({ model: "tree", tree: "13(10|3(2|?))" });
  assert.deepEqual(tree.given, [13, 10, 3, 2, null]);
  assert.deepEqual(tree.sums, [{ whole: 0, parts: [1, 2] }, { whole: 2, parts: [3, 4] }]);
  assert.deepEqual(tree.parent, [-1, 0, 0, 2, 2]);
  const all = modelFrom({ model: "house", task: "allSplits", house: "7: 0|7", countZero: "true", orderMatters: "true" });
  assert.equal(all.task, "allSplits");
  assert.equal(all.sums.length, 8);
  assert.deepEqual(all.given.slice(0, 5), [7, 0, 7, null, null]);
  assert.equal(modelFrom({ model: "house", task: "allSplits", house: "7", orderMatters: "false", countZero: "false" }).sums.length, 3);
  // no whole number in the roof, or more than twelve splits: filling in
  assert.equal(modelFrom({ model: "house", task: "allSplits", house: "?: 3|4" }).task, "fill");
  assert.equal(modelFrom({ model: "house", task: "allSplits", house: "20" }).task, "fill");
  assert.equal(modelFrom({ model: "house", task: "allSplits", house: "20", orderMatters: "false" }).sums.length, 11);
  // a tree is never "all splits"; a layout that cannot be read is the default
  assert.equal(modelFrom({ model: "tree", task: "allSplits" }).task, "fill");
  assert.deepEqual(modelFrom({ model: "tree", tree: "nonsense" }).given, [47, 40, null]);
  assert.deepEqual(modelFrom({ model: "house", house: "nonsense" }).given, [7, 3, null, null, 2, 6, null, null, null]);
});

test("checks of a house: per row, the whole house", () => {
  const model = modelFrom({ model: "house", house: "7: 3|?; ?|2; ?|?" });
  assert.equal(answered(model, startValues(model)), false);
  let texts = fillIn(model, ["4", "5"]);
  assert.equal(answered(model, texts), true);
  assert.deepEqual(check(model, texts).rows, [true, true, false]);
  assert.equal(check(model, texts).correct, false);
  texts = fillIn(model, ["4", "5", "1", "6"]);
  assert.deepEqual(check(model, texts), { correct: true, rows: [true, true, true], correctRows: 3, complete: false, notCounted: [false, false, false] });
  texts = fillIn(model, ["4", "6", "1", "7"]);
  assert.deepEqual(check(model, texts).rows, [true, false, false]);
  assert.equal(check(model, texts).correctRows, 1);
  // not a number is an empty box
  texts = fillIn(model, ["4", "5", "x", "6"]);
  assert.deepEqual(check(model, texts).rows, [true, true, false]);
});

test("checks of a house with the whole missing", () => {
  const model = modelFrom({ model: "house", house: "?: 3|4; 5|?" });
  assert.deepEqual(check(model, fillIn(model, ["7", "2"])).rows, [true, true]);
  assert.deepEqual(check(model, fillIn(model, ["8", "3"])).rows, [false, true]);
});

test("checks of a tree, nested, with three legs, and with decimals", () => {
  const model = modelFrom({ model: "tree", tree: "13(10|3(?|?))" });
  assert.deepEqual(check(model, fillIn(model, ["2", "1"])).rows, [true, true]);
  assert.deepEqual(check(model, fillIn(model, ["2", "2"])).rows, [true, false]);
  const three = modelFrom({ model: "tree", tree: "12(?|?|?)" });
  assert.equal(check(three, fillIn(three, ["4", "4", "4"])).correct, true);
  assert.equal(check(three, fillIn(three, ["4", "4", ""])).correct, false);
  const whole = modelFrom({ model: "tree", tree: "?(5|3)" });
  assert.equal(check(whole, fillIn(whole, ["8"])).correct, true);
  const decimals = modelFrom({ model: "tree", tree: "1(0,3|?)", decimals: "true" });
  assert.equal(check(decimals, fillIn(decimals, ["0,7"])).correct, true);
  assert.equal(check(decimals, fillIn(decimals, ["0.7"])).correct, true);
  assert.equal(check(decimals, fillIn(decimals, ["0,6"])).correct, false);
  // without decimals, 0,7 is not a number
  const whole1 = modelFrom({ model: "tree", tree: "1(0,3|?)" });
  assert.equal(check(whole1, fillIn(whole1, ["0,7"])).correct, false);
  // 0.1 + 0.2 is 0.3
  const tenths = modelFrom({ model: "tree", tree: "0,3(0,1|?)", decimals: "true" });
  assert.equal(check(tenths, fillIn(tenths, ["0,2"])).correct, true);
});

test("all splits: every row a different split; repeats and a 0 that does not count are not found", () => {
  const model = modelFrom({ model: "house", task: "allSplits", house: "4", countZero: "false", orderMatters: "true" });
  assert.equal(model.sums.length, 3);
  let texts = fillIn(model, ["1", "3", "3", "1", "2", "2"]);
  assert.deepEqual(check(model, texts), { correct: true, rows: [true, true, true], correctRows: 3, complete: true, notCounted: [false, false, false] });
  texts = fillIn(model, ["1", "3", "1", "3", "2", "2"]);
  assert.deepEqual(check(model, texts), { correct: true, rows: [true, false, true], correctRows: 2, complete: false, notCounted: [false, true, false] });
  texts = fillIn(model, ["0", "4", "1", "3", "2", "2"]);
  assert.deepEqual(check(model, texts).rows, [false, true, true]);
  assert.equal(check(model, texts).correct, true);
  // when the order does not matter, 1|3 and 3|1 are the same split
  const unordered = modelFrom({ model: "house", task: "allSplits", house: "4", countZero: "true", orderMatters: "false" });
  assert.equal(unordered.sums.length, 3);
  texts = fillIn(unordered, ["3", "1", "1", "3", "4", "0"]);
  assert.deepEqual(check(unordered, texts).rows, [true, false, true]);
  texts = fillIn(unordered, ["3", "1", "2", "2", "4", "0"]);
  assert.equal(check(unordered, texts).complete, true);
});

test("the response: fields, the numbers sorted in all splits", () => {
  const model = modelFrom({ model: "house", house: "7: 3|?; ?|2" });
  const texts = fillIn(model, ["4", "6"]);
  assert.deepEqual(responseFields(model, texts), [
    { name: "correct", type: "boolean", value: false },
    { name: "correctRows", type: "integer", value: 1 },
    { name: "numbers", type: "string", value: "7: 3|4; 6|2" },
    { name: "row1", type: "boolean", value: true },
    { name: "row2", type: "boolean", value: false },
  ]);
  assert.equal(field(model, fillIn(model, ["4"]), "numbers"), "7: 3|4; |2");
  const all = modelFrom({ model: "house", task: "allSplits", house: "3", countZero: "true", orderMatters: "false" });
  assert.equal(field(all, fillIn(all, ["2", "1", "3", "0"]), "numbers"), "3: 0|3; 1|2");
  assert.equal(field(all, fillIn(all, ["2", "1", "3", "0"]), "complete"), true);
  const ordered = modelFrom({ model: "house", task: "allSplits", house: "2", countZero: "true", orderMatters: "true" });
  assert.equal(field(ordered, fillIn(ordered, ["2", "0", "1", "1", "0", "2"]), "numbers"), "2: 0|2; 1|1; 2|0");
  const tree = modelFrom({ model: "tree", tree: "1(0,3|?)", decimals: "true" });
  assert.equal(field(tree, fillIn(tree, ["0,70"]), "numbers"), "1(0.3|0.7)");
});

test("a response back in the boxes: the pupil's boxes only, in all splits a row where its given boxes fit", () => {
  const model = modelFrom({ model: "house", house: "?: 3|?; ?|2" });
  assert.deepEqual(textsFromNumbers(model, "7: 3|4; 5|2"), ["7", "3", "4", "5", "2"]);
  assert.equal(textsFromNumbers(model, "7: 3|4; 5|2; 1|6"), null);
  const all = modelFrom({ model: "house", task: "allSplits", house: "3: ?|?; 3|?", countZero: "true", orderMatters: "true" });
  const texts = textsFromNumbers(all, "3: 0|3; 1|2; 2|1; 3|0")!;
  assert.equal(field(all, texts, "numbers"), "3: 0|3; 1|2; 2|1; 3|0");
  assert.deepEqual(texts.slice(3, 5), ["3", "0"]);
  const tree = modelFrom({ model: "tree", tree: "1(0,3|?)", decimals: "true" });
  assert.deepEqual(textsFromNumbers(tree, "1(0.3|0.7)", "nl"), ["1", "0,3", "0,7"]);
  assert.equal(textsFromNumbers(tree, "1(0.3|0.7(1|2))"), null);
});

test("the unique answer, when there is one", () => {
  assert.deepEqual(uniqueSolution(modelFrom({ model: "house", house: "7: 3|?; ?|2" })), [7, 3, 4, 5, 2]);
  assert.deepEqual(uniqueSolution(modelFrom({ model: "house", house: "?: 3|4; 5|?" })), [7, 3, 4, 5, 2]);
  assert.equal(uniqueSolution(modelFrom({ model: "house", house: "7: 3|?; ?|?" })), null);
  assert.deepEqual(uniqueSolution(modelFrom({ model: "tree", tree: "8(5|3(?|1))" })), [8, 5, 3, 2, 1]);
  assert.deepEqual(uniqueSolution(modelFrom({ model: "tree", tree: "?(?|3(2|1))" })), null);
  assert.deepEqual(uniqueSolution(modelFrom({ model: "tree", tree: "?(5|3(2|1))" })), [8, 5, 3, 2, 1]);
  assert.equal(uniqueSolution(modelFrom({ model: "tree", tree: "47(?|?)" })), null);
  assert.equal(uniqueSolution(modelFrom({ model: "house", house: "3: 5|?" })), null); // a part larger than the whole
  const all = modelFrom({ model: "house", task: "allSplits", house: "3", countZero: "true", orderMatters: "true" });
  assert.equal(numbersOf(all, uniqueSolution(all)!), "3: 0|3; 1|2; 2|1; 3|0");
});

test("an example answer for every layout", () => {
  for (const [settings, holds] of [
    [{ model: "house", house: "7: 3|?; ?|?; ?|?" }, true],
    [{ model: "house", house: "?: ?|?" }, true],
    [{ model: "tree", tree: "47(?|?)" }, true],
    [{ model: "tree", tree: "?(?|?(?|?)|?)" }, true],
    [{ model: "tree", tree: "1(?|?)", decimals: "true" }, true],
  ] as const) {
    const model = modelFrom(settings);
    const values = exampleSolution(model);
    const texts = values.map((v) => (v === null ? "" : String(v).replace(".", ",")));
    assert.equal(check(model, texts).correct, holds, JSON.stringify(settings));
  }
  const tens = modelFrom({ model: "tree", tree: "47(?|?)" });
  assert.deepEqual(exampleSolution(tens), [47, 40, 7]);
  const house = modelFrom({ model: "house", house: "7: ?|?; ?|?" });
  assert.equal(numbersOf(house, exampleSolution(house)), "7: 0|7; 1|6");
});

test("the correct answer reported is what the pupil's boxes give back", () => {
  for (const settings of [
    { model: "house", house: "7: 3|?; ?|2" },
    { model: "tree", tree: "?(5|3(?|1))" },
    { model: "house", task: "allSplits", house: "5: 2|?", countZero: "false", orderMatters: "false" },
  ]) {
    const model = modelFrom(settings);
    const numbers = numbersOf(model, uniqueSolution(model)!);
    const texts = textsFromNumbers(model, numbers)!;
    assert.equal(field(model, texts, "numbers"), numbers);
    assert.equal(field(model, texts, "correct"), true);
    assert.deepEqual(valuesOf(model, texts), uniqueSolution(model));
  }
});

test("problems of a layout for the author", () => {
  assert.deepEqual(layoutProblems(modelFrom({ model: "house", house: "7: 3|4; ?|2" }), "fill"), []);
  assert.deepEqual(layoutProblems(modelFrom({ model: "house", house: "7: 3|5; ?|2" }), "fill"), ["givenSumWrong"]);
  assert.deepEqual(layoutProblems(modelFrom({ model: "house", house: "3: 5|?" }), "fill"), ["negative"]);
  assert.deepEqual(layoutProblems(modelFrom({ model: "house", house: "7: 3|4" }), "fill"), ["allNumbersGiven"]);
  assert.deepEqual(layoutProblems(modelFrom({ model: "house", task: "allSplits", house: "?: ?|?" }), "allSplits"), ["allSplitsRoof"]);
  assert.deepEqual(layoutProblems(modelFrom({ model: "house", house: "1: 0,3|?" }), "fill"), ["decimalsOff"]);
});

test("the drawing of a tree: a box above the middle of its parts", () => {
  const { at, width, height } = treeLayout(modelFrom({ model: "tree", tree: "13(10|3(2|1))" }));
  assert.equal(width, 3);
  assert.equal(height, 3);
  assert.deepEqual(at[1], { x: 0.5, y: 1 });
  assert.deepEqual(at[2], { x: 2, y: 1 });
  assert.deepEqual(at[0], { x: 1.25, y: 0 });
});
