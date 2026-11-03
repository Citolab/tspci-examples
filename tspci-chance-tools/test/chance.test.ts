// npm test: the tools, experiments, probabilities and scoring of the chance tools (src/chance.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  distribution, emptyTree, evaluateDesign, evaluateTree, eventProbability, experimentLog, exampleSetup, formatNumber, frequencies,
  isEmptyTree, matches, normalizeEntry, ownDesign, ownTree, parseEntry, parseSetup, probabilityOf, problems, random, rat, readDesign,
  sameDesign, serializeSetup, solutionDesign, solutionTree, startDesign, stepDistribution, treeJson, treePaths, treeSlots, trialAt,
  trialsOf, designJson, MAX_ROWS,
} from "../src/chance.ts";
import type { Setup } from "../src/chance.ts";

const setup = (raw: object, mode: "tool" | "design" | "tree" = "tool") => parseSetup(JSON.stringify(raw), mode);

test("parseEntry reads fractions exactly, decimals and percentages with a point or a comma", () => {
  assert.deepEqual(parseEntry("3/8"), { value: { n: 3, d: 8 }, kind: "fraction" });
  assert.deepEqual(parseEntry(" 6 / 16 "), { value: { n: 3, d: 8 }, kind: "fraction" });
  assert.deepEqual(parseEntry("0,375"), { value: { n: 3, d: 8 }, kind: "decimal" });
  assert.deepEqual(parseEntry(".5"), { value: { n: 1, d: 2 }, kind: "decimal" });
  assert.deepEqual(parseEntry("37,5%"), { value: { n: 3, d: 8 }, kind: "decimal" });
  assert.deepEqual(parseEntry("1"), { value: { n: 1, d: 1 }, kind: "fraction" });
  assert.equal(parseEntry("3/0"), null);
  assert.equal(parseEntry("abc"), null);
  assert.equal(parseEntry(""), null);
  assert.equal(parseEntry("1/2/3"), null);
});

test("matches: equivalent fractions exactly, decimals within the margin", () => {
  const third = rat(1, 3);
  assert.ok(matches(parseEntry("2/6"), third, 0));
  assert.ok(!matches(parseEntry("33/100"), third, 0.01)); // a fraction is exact
  assert.ok(matches(parseEntry("0,33"), third, 0.005));
  assert.ok(!matches(parseEntry("0,3"), third, 0.005));
  assert.ok(matches(parseEntry("33%"), third, 0.005));
  assert.ok(!matches(parseEntry("0.33"), third, 0));
  assert.ok(!matches(null, third, 1));
});

test("normalizeEntry: the same in every language", () => {
  assert.equal(normalizeEntry("6/16"), "3/8");
  assert.equal(normalizeEntry("0,375"), "0.375");
  assert.equal(normalizeEntry("37,5 %"), "37.5%");
  assert.equal(normalizeEntry("??"), "??");
});

test("formatNumber uses a decimal comma in Dutch", () => {
  assert.equal(formatNumber(0.375, "nl"), "0,38");
  assert.equal(formatNumber(0.375, "en", 3), "0.375");
});

test("parseSetup: the example of the mode for what is missing or broken", () => {
  assert.equal(parseSetup("", "tool").tool, "spinner");
  assert.equal(parseSetup("{oops", "tree").tool, "bag");
  assert.equal(parseSetup("", "design").targets.length, 2);
  assert.equal(parseSetup("", "tool", "nl").spinner.sectors[0].label, "rood");
  const s = setup({ tool: "dice", dice: { count: 9, faces: ["A", "B,C", ""], combine: "sum" } });
  assert.equal(s.dice.count, 3);
  assert.deepEqual(s.dice.faces, ["A", "B C"]); // no commas in a label: it is part of an outcome key
  const round = parseSetup(serializeSetup(exampleSetup("tree"), "tree"), "tree");
  assert.deepEqual(round.tree, exampleSetup("tree").tree);
  assert.deepEqual(round.bag, exampleSetup("tree").bag);
});

test("distribution: two dice add up to 2 … 12, 7 most likely", () => {
  const d = distribution(setup({ tool: "dice", dice: { count: 2, combine: "sum" } }));
  assert.deepEqual(d.map((x) => x.key), ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
  assert.deepEqual(d.find((x) => x.key === "7")!.p, { n: 1, d: 6 });
  assert.deepEqual(d.find((x) => x.key === "12")!.p, { n: 1, d: 36 });
});

test("distribution: coins as a sequence or as the number of heads", () => {
  assert.deepEqual(distribution(setup({ tool: "coins", coins: { count: 2, combine: "sequence" } })).map((x) => x.key), ["H,H", "H,T", "T,H", "T,T"]);
  const heads = distribution(setup({ tool: "coins", coins: { count: 3, combine: "sum" } }));
  assert.deepEqual(heads.map((x) => [x.key, `${x.p.n}/${x.p.d}`]), [["0", "1/8"], ["1", "3/8"], ["2", "3/8"], ["3", "1/8"]]);
});

test("a bag without putting back: the second draw depends on the first", () => {
  const s = exampleSetup("tree");
  assert.deepEqual(stepDistribution(s, ["red"]).map((o) => [o.label, o.p]), [["red", { n: 1, d: 2 }], ["blue", { n: 1, d: 2 }]]);
  const d = distribution(s);
  assert.deepEqual(d.find((x) => x.key === "red,red")!.p, { n: 3, d: 10 });
  assert.deepEqual(d.find((x) => x.key === "blue,blue")!.p, { n: 1, d: 10 });
  const one = setup({ tool: "bag", bag: { balls: [{ label: "x", count: 1 }, { label: "y", count: 2 }], draws: 2, replace: false } });
  assert.deepEqual(stepDistribution(one, ["x"]).map((o) => o.label), ["y"]); // the only x is out
});

test("spinner sectors with the same label add up; the probability of a single step", () => {
  const s = setup({ tool: "spinner", spinner: { sectors: [{ label: "a", count: 1 }, { label: "b", count: 2 }, { label: "a", count: 1 }] } });
  assert.deepEqual(probabilityOf(s, "a"), { n: 1, d: 2 });
  assert.deepEqual(probabilityOf(s, "z"), { n: 0, d: 1 });
});

test("random: the same seed, trial and step give the same number, spread evenly", () => {
  assert.equal(random(42, 7, 0), random(42, 7, 0));
  assert.notEqual(random(42, 7, 0), random(42, 8, 0));
  assert.notEqual(random(42, 7, 0), random(43, 7, 0));
  const values = Array.from({ length: 20000 }, (_, i) => random(1, i, 0));
  assert.ok(values.every((v) => v >= 0 && v < 1));
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  assert.ok(Math.abs(mean - 0.5) < 0.01, `mean ${mean}`);
});

test("trials follow the probabilities: 10000 spins of 3/8 red come close", () => {
  const s = exampleSetup("tool");
  const rows = frequencies(s, trialsOf(s, { seed: 2026, start: 0, runs: [10000] }));
  const red = rows.find((r) => r.key === "red")!;
  assert.ok(Math.abs(red.relative - 3 / 8) < 0.02, `${red.relative}`);
  assert.equal(rows.reduce((a, r) => a + r.count, 0), 10000);
});

test("a spinner's angle lands in the sector of its outcome", () => {
  const s = exampleSetup("tool"); // red 3, blue 2, yellow 3 of 8: red 0–135°, blue 135–225°, yellow 225–360°
  for (let i = 0; i < 200; i++) {
    const t = trialAt(s, 9, i);
    const a = t.angles[0];
    assert.equal(t.steps[0], a < 135 ? "red" : a < 225 ? "blue" : "yellow");
  }
});

test("dice give a face per die; without putting back a bag never draws more than it has", () => {
  const dice = setup({ tool: "dice", dice: { count: 3, faces: ["1", "2", "3", "4"], combine: "sequence" } });
  const t = trialAt(dice, 5, 3);
  assert.equal(t.faces.length, 3);
  assert.equal(t.key, t.faces.map((f) => String(f + 1)).join(","));
  const bag = setup({ tool: "bag", bag: { balls: [{ label: "x", count: 1 }, { label: "y", count: 1 }], draws: 2, replace: false } });
  for (let i = 0; i < 100; i++) assert.notEqual(trialAt(bag, 3, i).steps[0], trialAt(bag, 3, i).steps[1]);
});

test("frequencies: every possible outcome, or only those that came up when there are too many", () => {
  const two = setup({ tool: "dice", dice: { count: 2, combine: "sum" } });
  const rows = frequencies(two, trialsOf(two, { seed: 1, start: 0, runs: [10] }));
  assert.equal(rows.length, 11);
  const three = setup({ tool: "dice", dice: { count: 3, faces: ["1", "2", "3", "4", "5", "6"], combine: "sequence" } });
  const few = frequencies(three, trialsOf(three, { seed: 1, start: 0, runs: [5] }));
  assert.ok(few.length <= 5 && few.length < MAX_ROWS);
  assert.ok(few.every((r) => r.count > 0));
});

test("the experiment log: same seed, same history; a new start is a new experiment", () => {
  const s = exampleSetup("tool");
  const e = { seed: 77, start: 0, runs: [1, 10, 100] };
  const log = JSON.parse(experimentLog(s, e));
  assert.equal(log.trials, 111);
  assert.equal(Object.values(log.outcomes as Record<string, number>).reduce((a, b) => a + b, 0), 111);
  assert.equal(experimentLog(s, e), experimentLog(s, { ...e }));
  assert.notEqual(experimentLog(s, e), experimentLog(s, { ...e, start: 111 }));
});

test("design: the example spinner starts with 4 sectors and scores the targets exactly", () => {
  const s = exampleSetup("design");
  const start = startDesign(s);
  assert.deepEqual(start.sectors, ["red", "blue", "yellow", "yellow"]);
  const r0 = evaluateDesign(s, start);
  assert.deepEqual(r0.targets.map((t) => t.passed), [false, true]);
  const good = { sectors: ["red", "red", "red", "blue", "blue", "yellow", "yellow", "yellow"], counts: [] };
  const r = evaluateDesign(s, good);
  assert.equal(r.score, 2);
  assert.equal(r.maxscore, 2);
  assert.ok(r.correct);
  const doubled = { sectors: [...good.sectors, ...good.sectors], counts: [] };
  assert.ok(evaluateDesign(s, doubled).correct); // 6/16 is 3/8
});

test("design: the size check, the bag, and the solution", () => {
  const s = setup({ tool: "bag", bag: { balls: [{ label: "R", count: 0, color: 0 }, { label: "B", count: 1, color: 1 }, { label: "G", count: 0 }] }, targets: [{ outcome: "R", probability: "2/5" }], size: 10 }, "design");
  const solution = solutionDesign(s)!;
  assert.deepEqual(solution.counts, [4, 6, 0]);
  assert.ok(evaluateDesign(s, solution).correct);
  const small = { sectors: [], counts: [2, 3, 0] };
  const r = evaluateDesign(s, small);
  assert.deepEqual([r.targets[0].passed, r.sizePassed, r.score, r.maxscore], [true, false, 1, 2]);
  assert.deepEqual(solutionDesign(exampleSetup("design"))!.sectors, ["red", "red", "red", "blue", "blue", "yellow", "yellow", "yellow"]);
  assert.equal(solutionDesign(setup({ tool: "bag", bag: { balls: [{ label: "R" }] }, targets: [{ outcome: "R", probability: "1/2" }] }, "design")), null);
});

test("design: an empty bag scores nothing; the design round-trips through its JSON", () => {
  const s = setup({ tool: "bag", bag: { balls: [{ label: "R", count: 1 }, { label: "B", count: 1 }] }, targets: [{ outcome: "R", probability: "0" }] }, "design");
  assert.equal(evaluateDesign(s, { sectors: [], counts: [0, 0] }).score, 0);
  const d = { sectors: [], counts: [3, 5] };
  assert.ok(sameDesign(readDesign(s, designJson(s, d))!, d));
  const spinner = exampleSetup("design");
  const sd = { sectors: ["blue", "red"], counts: [] };
  assert.ok(sameDesign(readDesign(spinner, designJson(spinner, sd))!, sd));
  assert.deepEqual(ownDesign(spinner, { sectors: ["purple", "red"] }).sectors, ["red"]); // not in the palette
});

test("tree: the solution scores everything; given labels", () => {
  const s = exampleSetup("tree");
  const sol = solutionTree(s);
  assert.deepEqual(sol.probs, { "0": "3/5", "0.0": "1/2", "0.1": "1/2", "1": "2/5", "1.0": "3/4", "1.1": "1/4" });
  assert.deepEqual(sol.paths, { "0.0": "3/10", "0.1": "3/10", "1.0": "3/10", "1.1": "1/10" });
  assert.equal(sol.answer, "2/5");
  const r = evaluateTree(s, sol);
  assert.deepEqual([r.score, r.maxscore, r.correct], [11, 11, true]); // 6 branches, 4 paths, the event
});

test("tree: equivalent fractions and decimals within the margin count, per branch", () => {
  const s = exampleSetup("tree");
  const entry = { ...emptyTree(), probs: { "0": "0,6", "1": "4/10", "0.0": "2/4", "0.1": "0.4", "1.0": "75%", "1.1": "1/4" }, answer: "0,4" };
  const r = evaluateTree(s, entry);
  assert.deepEqual(r.branches, [true, true, true, false, true, true]);
  assert.deepEqual(r.paths, [false, false, false, false]);
  assert.equal(r.answer, true);
  assert.equal(r.answerValue, 0.4);
  assert.equal(r.score, 6);
});

test("tree: the candidate chooses the outcomes; the order does not matter, duplicates do", () => {
  const s = { ...exampleSetup("tree"), tree: { ...exampleSetup("tree").tree, labels: "choose" as const } };
  const entry = {
    labels: { "0": "blue", "1": "red", "0.0": "red", "0.1": "blue", "1.0": "blue", "1.1": "red" },
    probs: { "0": "2/5", "1": "3/5", "0.0": "3/4", "0.1": "1/4", "1.0": "1/2", "1.1": "1/2" },
    paths: { "0.0": "3/10", "0.1": "1/10", "1.0": "3/10", "1.1": "3/10" },
    answer: "2/5",
  };
  assert.ok(evaluateTree(s, entry).correct);
  const twice = { ...entry, labels: { ...entry.labels, "1": "blue" } };
  const r = evaluateTree(s, twice);
  assert.deepEqual(r.branches.slice(0, 2), [false, false]);
  assert.ok(r.score < r.maxscore);
});

test("tree slots: without putting back, the second stage can be shorter", () => {
  const s = setup({ tool: "bag", bag: { balls: [{ label: "x", count: 1 }, { label: "y", count: 2 }], draws: 2, replace: false }, tree: { labels: "given", paths: false, event: null } }, "tree");
  const slots = treeSlots(s, emptyTree());
  assert.deepEqual(slots.second.map((row) => row.map((x) => x.label)), [["y"], ["x", "y"]]);
  assert.equal(evaluateTree(s, emptyTree()).maxscore, 5);
  assert.deepEqual(treePaths(s), ["x,y", "y,x", "y,y"]);
  assert.equal(eventProbability(s), null);
});

test("tree with coins: two steps and a sequence, whatever the count and combine", () => {
  const s = setup({ tool: "coins", coins: { count: 3, combine: "sum" }, tree: { labels: "given", paths: true, event: { text: "", paths: ["H,T", "T,H"] } } }, "tree");
  assert.deepEqual(eventProbability(s), { n: 1, d: 2 });
  assert.equal(evaluateTree(s, solutionTree(s)).maxscore, 6 + 4 + 1);
});

test("tree entries: empty, restored, as JSON in every language", () => {
  assert.ok(isEmptyTree(emptyTree()));
  assert.ok(!isEmptyTree({ ...emptyTree(), answer: "1/2" }));
  assert.deepEqual(ownTree({ probs: { "0": "1/2", hack: "x" }, answer: 3 }).probs, { "0": "1/2" });
  const s = exampleSetup("tree");
  const json = JSON.parse(treeJson(s, { ...emptyTree(), probs: { "0": "0,6", "1": "" }, answer: "4/10" }));
  assert.deepEqual(json.probs, { "0": "0.6" });
  assert.equal(json.answer, "2/5");
  assert.equal(json.labels["0.1"], "blue");
});

test("problems: what keeps a setup from working, per mode", () => {
  assert.deepEqual(problems(exampleSetup("tool"), "tool"), []);
  assert.deepEqual(problems(exampleSetup("design"), "design"), []);
  assert.deepEqual(problems(exampleSetup("tree"), "tree"), []);
  const types = (s: Setup, mode: "tool" | "design" | "tree") => problems(s, mode).map((p) => p.type);
  assert.deepEqual(types(setup({ tool: "dice" }, "design"), "design"), ["toolForDesign"]);
  assert.deepEqual(types(setup({ tool: "spinner", targets: [] }, "design"), "design"), ["noTargets"]);
  assert.deepEqual(types(setup({ tool: "spinner", targets: [{ outcome: "red", probability: "0.4" }] }, "design"), "design"), ["target"]);
  assert.deepEqual(types(setup({ tool: "spinner", targets: [{ outcome: "purple", probability: "1/2" }] }, "design"), "design"), ["targetOutcome"]);
  assert.deepEqual(types(setup({ tool: "spinner", targets: [{ outcome: "red", probability: "3/4" }, { outcome: "blue", probability: "1/2" }] }, "design"), "design"), ["targetsOverOne"]);
  assert.deepEqual(types(setup({ tool: "spinner", targets: [{ outcome: "red", probability: "1/25" }] }, "design"), "design"), ["noSolution"]);
  assert.deepEqual(types(setup({ tool: "spinner", spinner: { sectors: [{ label: "a", count: 0 }] } }), "tool"), ["empty"]);
  assert.deepEqual(types(setup({ tool: "dice", dice: { faces: ["1", "2", "3", "4", "5", "6"] } }, "tree"), "tree"), ["tooManyBranches"]);
  assert.deepEqual(types(setup({ tool: "coins", tree: { event: { text: "", paths: ["H,X"] } } }, "tree"), "tree"), ["eventPath"]);
});
