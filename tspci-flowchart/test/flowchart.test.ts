// npm test: the logic of the flowchart (src/flowchart.ts, src/layout.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS, baseChart, canonical, chartFromCanonical, evaluate, mixed, nodeKey, orderChart, outline, ownChart, parseCanonical,
  parseSettings, sameChart, serializeChart, serializeSettings, solutionChart, type Chart, type Settings,
} from "../src/flowchart.ts";
import { CH, CW, autoLayout, exitSide, gridOf, pathOf, port, route, wrapText } from "../src/layout.ts";

const S = DEFAULT_SETTINGS;
const SOLUTION = "c1,c2,c3,care,contact,end,start|c1>contact;c2>care;c3>end;care>c3;contact>c2:yes;contact>care:no;start>c1";
const filled = (fills: Record<string, string>): Chart => ownChart(S, {
  nodes: baseChart(S).nodes.map((n) => (fills[n.id] ? { ...n, card: fills[n.id] } : n)),
  edges: [],
});

test("the example: complete mode, three slots, its solution scores 3 of 3", () => {
  assert.equal(S.mode, "complete");
  assert.equal(baseChart(S).nodes.filter((n) => n.slot).length, 3);
  const e = evaluate(S, solutionChart(S)!);
  assert.equal(e.graph, SOLUTION);
  assert.deepEqual([e.score, e.maxscore, e.correct], [3, 3, true]);
});

test("the canonical graph does not depend on the layout or on the ids of the candidate's blocks", () => {
  const free = parseSettings(JSON.stringify({ mode: "free", cards: [{ id: "a", text: "A" }, { id: "b", text: "B" }], chart: { nodes: [], edges: [] } }));
  const one: Chart = { nodes: [{ id: "n1", shape: "start", x: 0, y: 0 }, { id: "n2", shape: "step", x: 0, y: 1, card: "a" }, { id: "n3", shape: "step", x: 0, y: 2, card: "b" }],
    edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3" }] };
  const two: Chart = { nodes: [{ id: "x9", shape: "step", x: 2, y: 4, card: "b" }, { id: "x1", shape: "start", x: 1, y: 0 }, { id: "x5", shape: "step", x: 0, y: 3, card: "a" }],
    edges: [{ from: "x5", to: "x9" }, { from: "x1", to: "x5" }] };
  assert.equal(canonical(free, one), "a,b,start|a>b;start>a");
  assert.equal(canonical(free, one), canonical(free, two));
  // a card in another shape than its own says so; typed text in quotes
  assert.equal(nodeKey(free, { id: "n", shape: "decision", x: 0, y: 0, card: "a" }), "a/decision");
  assert.equal(nodeKey(free, { id: "n", shape: "step", x: 0, y: 0, text: '  Wash   "Hands" ' }), '"wash hands"');
  assert.equal(nodeKey(free, { id: "n", shape: "end", x: 0, y: 0 }), "end");
});

test("parseCanonical reads names, shapes and labels back", () => {
  const g = parseCanonical('a/decision,"wash hands",start|a/decision>"wash hands":yes;start>a/decision')!;
  assert.deepEqual(g.nodes.map((n) => [n.ref, n.shape ?? null]), [["a", "decision"], ['"wash hands"', null], ["start", null]]);
  assert.deepEqual(g.edges[0], { from: "a/decision", to: '"wash hands"', label: "yes" });
  assert.equal(parseCanonical("no graph"), null);
});

test("ownChart keeps the locked part, fills the slots, uses a card once, ignores what the mode does not allow", () => {
  const c = ownChart(S, {
    nodes: [{ id: "s1", card: "c2" }, { id: "s2", card: "c2" }, { id: "contact", text: "changed" }, { id: "extra", shape: "step", x: 1, y: 0, card: "c3" }],
    edges: [{ from: "start", to: "end" }],
  });
  assert.equal(c.nodes.find((n) => n.id === "s1")!.card, "c2");
  assert.equal(c.nodes.find((n) => n.id === "s2")!.card, undefined);
  assert.equal(c.nodes.find((n) => n.id === "contact")!.text, "Contact with body fluids possible?");
  assert.equal(c.nodes.length, 7);
  assert.equal(c.edges.length, 7);
  assert.ok(sameChart(ownChart(S, JSON.parse(serializeChart(c))), c));
});

test("checks: before, branch and cards on a wrong answer", () => {
  // the gloves before the hand alcohol
  const wrong = filled({ s1: "c2", s2: "c1", s3: "c3" });
  const e = evaluate(S, wrong);
  assert.deepEqual(e.results.map((r) => r.passed), [false, false, true]);
  assert.equal(e.score, 1);
  const s: Settings = { ...S, checks: [{ type: "cards" }, { type: "cards", exact: true }, { type: "same" }, { type: "branch", decision: "contact", label: "yes", target: "care", direct: false }] };
  assert.deepEqual(evaluate(s, wrong).results.map((r) => r.passed), [true, true, false, true]);
  const distractor = filled({ s1: "c1", s2: "c4", s3: "c3" });
  assert.deepEqual(evaluate(s, distractor).results.map((r) => r.passed), [false, false, false, true]);
  // no checks of its own: the same graph as the solution
  assert.deepEqual(evaluate({ ...S, checks: [] }, solutionChart(S)!).results.map((r) => r.check.type), ["same"]);
});

test("checks: a single start and end, no dead ends, decisions with yes and no", () => {
  const free = parseSettings(JSON.stringify({ mode: "free", cards: [{ id: "a", text: "A" }], chart: { nodes: [], edges: [] }, checks: [{ type: "startEnd" }, { type: "deadEnds" }, { type: "decisions" }] }));
  const chart = (edges: Chart["edges"]): Chart => ({
    nodes: [{ id: "s", shape: "start", x: 0, y: 0 }, { id: "d", shape: "decision", x: 0, y: 1, text: "Ready?" }, { id: "a", shape: "step", x: 1, y: 1, card: "a" }, { id: "e", shape: "end", x: 0, y: 2 }],
    edges,
  });
  const good = chart([{ from: "s", to: "d" }, { from: "d", to: "e", label: "yes" }, { from: "d", to: "a", label: "no" }, { from: "a", to: "d" }]);
  assert.deepEqual(evaluate(free, good).results.map((r) => r.passed), [true, true, true]);
  // a has no way out: a dead end; d has one exit
  const dead = chart([{ from: "s", to: "d" }, { from: "d", to: "e", label: "yes" }, { from: "s", to: "a" }]);
  assert.deepEqual(evaluate(free, dead).results.map((r) => r.passed), [true, false, false]);
  // two ends
  const two = { ...good, nodes: [...good.nodes, { id: "e2", shape: "end" as const, x: 1, y: 2 }] };
  assert.deepEqual(evaluate(free, two).results.map((r) => r.passed), [false, false, true]);
});

test("order mode: a chain of slots, the solution in the cards' order without distractors", () => {
  const s = parseSettings(JSON.stringify({ mode: "order", rows: 4, cards: ["Measure", "Saw", "Sand", { text: "Paint the floor", distractor: true }, "Glue"] }));
  const base = orderChart(s);
  assert.deepEqual(base.nodes.map((n) => `${n.id}@${n.x},${n.y}`), ["start@0,0", "s1@0,1", "s2@0,2", "s3@0,3", "s4@1,0", "end@1,1"]);
  assert.equal(base.edges.length, 5);
  assert.equal(canonical(s, solutionChart(s)!), "c1,c2,c3,c5,end,start|c1>c2;c2>c3;c3>c5;c5>end;start>c1");
  assert.deepEqual(evaluate(s, base).results.map((r) => r.check.type), ["same"]);
  // a MATCH_CORRECT response back on the chart
  const back = chartFromCanonical(s, "c1,c2,c3,c5,end,start|c1>c2;c2>c3;c3>c5;c5>end;start>c1", autoLayout)!;
  assert.deepEqual(back.nodes.filter((n) => n.slot).map((n) => n.card), ["c1", "c2", "c3", "c5"]);
  const swapped = chartFromCanonical(s, "c1,c2,c3,c5,end,start|c1>c3;c2>c5;c3>c2;c5>end;start>c1", autoLayout)!;
  assert.deepEqual(swapped.nodes.filter((n) => n.slot).map((n) => n.card), ["c1", "c3", "c2", "c5"]);
});

test("chartFromCanonical: the example's slots, and free mode places new blocks", () => {
  const back = chartFromCanonical(S, SOLUTION, autoLayout)!;
  assert.equal(canonical(S, back), SOLUTION);
  const free = parseSettings(JSON.stringify({ mode: "free", cards: [{ id: "a", text: "A" }, { id: "b", text: "B", shape: "decision" }], chart: { nodes: [], edges: [] } }));
  const g = "a,b,end,start|a>b;b>a:no;b>end:yes;start>a";
  const c = chartFromCanonical(free, g, autoLayout)!;
  assert.equal(canonical(free, c), g);
  assert.ok(c.nodes.every((n) => n.x >= 0 && n.y >= 0));
});

test("serializeSettings and parseSettings round trip; broken settings give the example", () => {
  assert.deepEqual(parseSettings(serializeSettings(S)), S);
  assert.equal(parseSettings("{oops"), DEFAULT_SETTINGS);
  assert.equal(parseSettings(""), DEFAULT_SETTINGS);
  const s = parseSettings(JSON.stringify({ cards: ["A", "B"] }));
  assert.equal(s.mode, "order");
  assert.deepEqual(s.cards.map((c) => c.id), ["c1", "c2"]);
});

test("the outline reads the flow once, yes before no, and refers back to blocks it read", () => {
  const items = outline(solutionChart(S)!);
  const flat: string[] = [];
  const walk = (list: typeof items, depth: number) => list.forEach((i) => {
    flat.push(`${"  ".repeat(depth)}${i.label ?? ""}${i.ref ? "→" : ""}${i.n}:${i.id}`);
    walk(i.children, depth + 1);
  });
  walk(items, 0);
  assert.deepEqual(flat, ["1:start", "  2:s1", "    3:contact", "      yes4:s2", "        5:care", "          6:s3", "            7:end", "      no→5:care"]);
});

test("the mixed order is the same each time and not the original", () => {
  const cards = S.cards;
  assert.deepEqual(mixed(cards), mixed(cards));
  assert.notDeepEqual(mixed(cards).map((c) => c.id), cards.map((c) => c.id));
  assert.deepEqual([...mixed(cards)].map((c) => c.id).sort(), cards.map((c) => c.id).sort());
});

// --- layout

const at = (x: number, y: number, shape: "step" | "decision" = "step") => ({ x, y, shape });
const none = () => false;

test("routes: straight down, a step aside, a decision's no exit with one bend, a loop back up", () => {
  assert.deepEqual(route(at(0, 0), at(0, 1), "bottom", none), [port(at(0, 0), "bottom"), port(at(0, 1), "top")]);
  // down one row and a column to the right: along the line between the rows
  const aside = route(at(0, 0), at(1, 1), "bottom", none);
  assert.deepEqual(aside.map((p) => p[1]), [port(at(0, 0), "bottom")[1], CH, CH, port(at(1, 1), "top")[1]]);
  // the no exit to the right and down into the next column
  const no = route(at(0, 2, "decision"), at(1, 4), "right", none);
  assert.equal(no.length, 3);
  assert.deepEqual(no[1], [CW * 1.5, CH * 2.5]);
  // the same with a block in the way: along the line between the columns
  const blocked = route(at(0, 2, "decision"), at(1, 4), "right", (x, y) => x === 1 && y === 3);
  assert.equal(blocked[1][0], CW);
  // a loop back up: out at the bottom, up between the columns, into the top
  const loop = route(at(0, 3), at(0, 1), "bottom", none);
  assert.deepEqual(loop.slice(1, 4).map((p) => p[0]), [CW / 2, CW, CW]);
  assert.equal(loop[loop.length - 1][1], port(at(0, 1), "top")[1]);
  // every route is orthogonal
  for (const r of [aside, no, blocked, loop]) for (let i = 1; i < r.length; i++) assert.ok(r[i][0] === r[i - 1][0] || r[i][1] === r[i - 1][1]);
  assert.match(pathOf(loop), /^M.* Q.*L/);
});

test("exit sides", () => {
  assert.equal(exitSide(at(0, 0, "decision"), at(1, 2), "no"), "right");
  assert.equal(exitSide(at(1, 0, "decision"), at(0, 2), "no"), "left");
  assert.equal(exitSide(at(0, 0, "decision"), at(0, 2), "yes"), "bottom");
  assert.equal(exitSide(at(0, 0), at(1, 0)), "right");
  assert.equal(exitSide(at(0, 0), at(0, 3)), "bottom");
});

test("autoLayout: layers from the start, the no exit to the right, loops do not push down, locked blocks stay", () => {
  const chart: Chart = {
    nodes: [
      { id: "e", shape: "end", x: 5, y: 5 }, { id: "d", shape: "decision", x: 3, y: 3 }, { id: "s", shape: "start", x: 4, y: 4 },
      { id: "a", shape: "step", x: 2, y: 2 }, { id: "b", shape: "step", x: 1, y: 1 }, { id: "lone", shape: "step", x: 0, y: 6 },
    ],
    edges: [{ from: "s", to: "a" }, { from: "a", to: "d" }, { from: "d", to: "e", label: "yes" }, { from: "d", to: "b", label: "no" }, { from: "b", to: "a" }],
  };
  const pos = Object.fromEntries(autoLayout(chart).nodes.map((n) => [n.id, `${n.x},${n.y}`]));
  assert.deepEqual(pos, { s: "0,0", a: "0,1", d: "0,2", e: "0,3", b: "1,3", lone: "0,4" });
  const withLocked = autoLayout({ ...chart, nodes: chart.nodes.map((n) => (n.id === "s" ? { ...n, x: 1, y: 0, locked: true } : n)) });
  assert.equal(withLocked.nodes.find((n) => n.id === "s")!.x, 1);
  assert.deepEqual(gridOf(autoLayout(chart), 2, 3), { columns: 2, rows: 5 });
});

test("wrapText", () => {
  assert.deepEqual(wrapText("Clean your hands with hand alcohol", 20, 3), ["Clean your hands", "with hand alcohol"]);
  assert.deepEqual(wrapText("one two three four five six", 7, 2), ["one two", "three…"]);
  assert.deepEqual(wrapText("Desinfectiemiddelen", 8, 3), ["Desinfe-", "ctiemid-", "delen"]);
});
