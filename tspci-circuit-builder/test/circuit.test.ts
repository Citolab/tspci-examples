// npm test: the logic of the circuit builder (src/circuit.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CIRCUIT, MATERIAL_TYPES, analyze, boardOf, brokenFromBoard, buildNetlist, evaluate, move, moveBroken, parseChecks, parseCircuit,
  parsePalette, partType, place, remaining, remove, rotate, serializeBoard, serializeCircuit, terminalsOf, toggleBroken, topology, ownParts,
  type Circuit, type Placed,
} from "../src/circuit.ts";

// A board as text: one line per row, a token per cell. "." is empty; otherwise a short name and the rotation:
// "-" wire, "c" corner, "t" tee, "x" cross, "o" crossover, and the part types themselves (led, switch, …).
const SHORT: Record<string, string> = { "-": "wire", c: "corner", t: "tee", x: "cross", o: "crossover", V: "dcSource", R: "resistor", L: "lamp" };
const grid = (text: string): Placed[] =>
  text.trim().split("\n").flatMap((line, y) =>
    line.trim().split(/\s+/).flatMap((token, x) => {
      if (token === ".") return [];
      const [name, rot = "0"] = token.split("@");
      const type = partType(SHORT[name] ?? name);
      if (!type) throw new Error(`unknown token ${token}`);
      return [{ type, x, y, rotation: Number(rot) as Placed["rotation"] }];
    }));
const circuitWith = (checks: unknown[], extra: Partial<Circuit> = {}): Circuit => ({ ...DEFAULT_CIRCUIT, preset: [], solution: null, ...extra, checks: parseChecks(checks) });
const passes = (checks: unknown[], board: Placed[], extra: Partial<Circuit> = {}, broken: string[] = []) =>
  evaluate(circuitWith(checks, { columns: 16, rows: 16, ...extra }), board, broken).results.map((r) => r.passed);

// A source on the left, a lamp on the right: the simplest loop.
//  ┌ ─ ┐
//  V   L
//  └ ─ ┘
const LOOP = `
c@180 -    c@270
V@90  .    L@90
c@90  -    c@0`;

test("terminals turn clockwise, as in the original interaction", () => {
  const sides = (type: Parameters<typeof terminalsOf>[0], r: 0 | 90 | 180 | 270) => terminalsOf(type, r).map((t) => t.side).join("");
  assert.equal(sides("corner", 0), "WN");
  assert.equal(sides("corner", 90), "NE");
  assert.equal(sides("corner", 180), "ES");
  assert.equal(sides("corner", 270), "SW");
  assert.equal(sides("tee", 180), "EWS");
  assert.equal(sides("tee", 90), "NSE");
  assert.equal(sides("transistor", 0), "WNS");
  assert.deepEqual(terminalsOf("dcSource", 90), [{ name: "plus", side: "N" }, { name: "minus", side: "S" }]);
});

test("part names: ours, the original's Dutch ids and other spellings", () => {
  assert.deepEqual(["LED", "draadT", "draadH", "draad", "gelijkspanningsbron", "zekering", "Resistor", "push-button", "nope"].map(partType),
    ["led", "tee", "corner", "wire", "dcSource", "fuse", "resistor", "pushButton", null]);
});

test("the netlist: wires make nodes, open ends and joints", () => {
  const net = buildNetlist(grid(LOOP));
  assert.equal(net.elements.length, 2);
  assert.equal(net.nodes, 2);
  assert.deepEqual(net.openEnds, []);
  const open = buildNetlist(grid(LOOP.replace("c@90  -    c@0", "c@90  .    c@0")));
  assert.equal(open.openEnds.length, 2);
  assert.deepEqual(open.openEnds.map((e) => `${e.x},${e.y},${e.side}`).sort(), ["0,2,E", "2,2,W"]);
  // a crossover keeps its two wires apart, a cross joins all four: four lamps around the middle cell
  const around = (middle: string) => grid(`
.     L@90     .
L     ${middle} L
.     L@90     .`);
  const o = buildNetlist(around("o"));
  const [top, left, right, bottom] = o.elements; // reading order
  assert.equal(left.nodes.b, right.nodes.a);
  assert.equal(top.nodes.b, bottom.nodes.a);
  assert.notEqual(left.nodes.b, top.nodes.b);
  const x = buildNetlist(around("x"));
  assert.equal(new Set(x.elements.map((e, i) => (i === 0 ? e.nodes.b : i === 1 ? e.nodes.b : i === 2 ? e.nodes.a : e.nodes.a))).size, 1);
  assert.equal(x.openEnds.length, 4);
  assert.equal(x.joints.length, 4);
});

test("a closed loop, an open one and a short circuit", () => {
  assert.deepEqual(passes([{ type: "closed" }], grid(LOOP)), [true]);
  const open = grid(LOOP.replace("c@90  -    c@0", "c@90  .    c@0"));
  assert.deepEqual(passes([{ type: "closed" }], open), [false]);
  // the lamp short-circuited by a wire next to it: no current through the lamp
  const bypass = `
c@180 -    t@180 c@270
V@90  .    L@90  -@90
c@90  -    t@0   c@0`;
  const a = analyze(grid(bypass));
  assert.deepEqual(a.live, [false, false]); // the source in a loop of wires only: shorted
  assert.deepEqual(a.shorted.length, 1);
  assert.deepEqual(passes([{ type: "closed" }], grid(bypass)), [false]);
  // a wire stub sticking out: open ends fail unless allowed
  const stub = grid(LOOP.replace("V@90  .    L@90", "V@90  -    L@90"));
  assert.deepEqual(passes([{ type: "closed" }, { type: "closed", allowOpenEnds: true }], stub), [false, true]);
  // no source, or only a source
  assert.deepEqual(passes([{ type: "closed" }], grid(LOOP.replace("V@90", "R@90"))), [false]);
});

// The default example's solution: a switch in series with the source, an LED and a buzzer parallel.
test("the example: the author's solution passes every check", () => {
  const c = DEFAULT_CIRCUIT;
  const e = evaluate(c, c.solution!);
  assert.deepEqual(e.results.map((r) => r.passed), [true, true, true, true, true]);
  assert.equal(e.score, 5);
  assert.equal(e.maxscore, 5);
  assert.equal(e.correct, true);
  assert.equal(e.topology, "buzzer(1-2) dcSource(1>3) led(2>1) switch(2-3)");
  // nothing placed yet: no points, except what the preset already does (nothing here)
  const empty = evaluate(c, []);
  assert.equal(empty.score, 0);
});

test("the LED the wrong way round: only the polarity check fails", () => {
  const c = DEFAULT_CIRCUIT;
  const turned = c.solution!.map((p) => (p.type === "led" ? { ...p, rotation: 270 as const } : p));
  const e = evaluate(c, turned);
  assert.deepEqual(e.results.map((r) => r.passed), [true, true, true, false, true]);
  assert.equal(e.score, 4);
  assert.notEqual(e.topology, evaluate(c, c.solution!).topology);
});

test("the switch in the LED's branch: not in series with the source", () => {
  const c = DEFAULT_CIRCUIT;
  const moved = c.solution!
    .map((p) => (p.type === "switch" ? { ...p, type: "wire" as const } : p))
    .map((p) => (p.x === 4 && p.y === 1 ? { ...p, type: "switch" as const } : p));
  const e = evaluate(c, moved);
  // the LED (with the switch) is no longer parallel to the buzzer; it still points the right way
  assert.deepEqual(e.results.map((r) => r.passed), [true, false, false, true, true]);
});

test("series and parallel: two resistors", () => {
  // two resistors next to each other on the top wire: in series
  const series = `
c@180 R    R    c@270
V@90  .    .    -@90
c@90  -    -    c@0`;
  assert.deepEqual(passes([{ type: "series", parts: ["resistor", "resistor"] }, { type: "parallel", parts: ["resistor", "resistor"] }, { type: "series", parts: ["resistor", "source"] }], grid(series)), [true, false, true]);
  // two resistors between the same two wires: parallel
  const parallel = `
c@180 -    t@180 c@270
V@90  .    R@90  R@90
c@90  -    t@0   c@0`;
  assert.deepEqual(passes([{ type: "series", parts: ["resistor", "resistor"] }, { type: "parallel", parts: ["resistor", "resistor"] }, { type: "closed" }, { type: "series", parts: ["resistor", "source"] }], grid(parallel)), [false, true, true, false]);
});

test("the topology does not depend on where things are or how the wires run", () => {
  const a = topology(grid(LOOP));
  const elsewhere = `
.     .     .  .     .
.     c@180 -  -     c@270
.     V@90  .  .     -@90
.     -@90  .  .     L@270
.     c@90  -  -     c@0`;
  assert.equal(topology(grid(elsewhere)), a);
  assert.equal(a, "dcSource(1>2) lamp(1-2)");
  // a different source orientation is the same circuit: the lamp has no polarity
  assert.equal(topology(grid(LOOP.replace("V@90", "V@270"))), a);
  // two parallel resistors, drawn in two ways
  const p1 = `
c@180 -    t@180 c@270
V@90  .    R@90  R@90
c@90  -    t@0   c@0`;
  const p2 = `
c@180 t@180 -    c@270
V@90  R@270 .    R@90
c@90  t@0   -    c@0`;
  assert.equal(topology(grid(p1)), topology(grid(p2)));
  assert.equal(topology(grid(p1)), "dcSource(1>2) resistor(1-2) resistor(1-2)");
  // but series is not parallel
  const s = `
c@180 R    R    c@270
V@90  .    .    -@90
c@90  -    -    c@0`;
  assert.notEqual(topology(grid(s)), topology(grid(p1)));
  assert.equal(topology(grid(s)), "dcSource(1>2) resistor(1-3) resistor(2-3)");
});

test("polarity of an LED, a diode and a second battery", () => {
  const loop = (part: string) => `
c@180 ${part} c@270
V@90  .       L@90
c@90  -       c@0`;
  // the DC source at 90 has + at the top: current goes left to right over the top
  const forward = (part: string) => {
    const a = analyze(grid(loop(part)));
    return a.forward(a.net.elements.findIndex((e) => e.type !== "dcSource" && e.type !== "lamp"));
  };
  assert.equal(forward("led"), true);
  assert.equal(forward("led@180"), false);
  assert.equal(forward("diode"), true);
  assert.equal(forward("battery@180"), true); // its − (W after turning) takes the current from the source's +
  assert.equal(forward("battery"), false);
  assert.deepEqual(passes([{ type: "forward", parts: ["led"] }], grid(loop("led"))), [true]);
  assert.deepEqual(passes([{ type: "forward", parts: ["led"] }], grid(loop("led@180"))), [false]);
  assert.deepEqual(passes([{ type: "forward", parts: ["led"] }], grid(loop("-"))), [false]); // no LED at all
  // an LED that is not in a loop: no direction
  const dangling = analyze(grid(`led -`));
  assert.equal(dangling.forward(0), null);
});

test("a transistor switches the lamp: its collector–emitter path is part of the loop", () => {
  //  ┌ ─ L ┐
  //  V   R T(base W, collector N, emitter S)   (the resistor feeds the base from the +)
  const board = `
c@180 t@180 L    c@270
V@90  -@90  .    -@90
-@90  c@90  R    transistor
c@90  -     -    c@0`;
  const a = analyze(grid(board));
  assert.deepEqual(a.live, [true, true, true, true]);
  assert.deepEqual(passes([{ type: "closed" }, { type: "series", parts: ["lamp", "transistor"] }], grid(board)), [true, true]);
});

test("the parts check: at least, or exactly", () => {
  const board = grid(LOOP);
  assert.deepEqual(passes([{ type: "parts", count: { lamp: 1 } }, { type: "parts", count: { lamp: 2 } }, { type: "parts", count: { source: 1, lamp: 1 }, exact: true }], board), [true, false, true]);
  // exact: an extra component the candidate placed fails; a locked one does not count
  const extra = [...board, { type: "buzzer" as const, x: 1, y: 1, rotation: 0 as const }];
  assert.deepEqual(passes([{ type: "parts", count: { lamp: 1 }, exact: true }], extra), [false]);
  const locked = { preset: [{ type: "dcSource" as const, x: 0, y: 1, rotation: 90 as const, locked: true }] };
  assert.deepEqual(passes([{ type: "parts", count: { lamp: 1 }, exact: true }], board.filter((p) => p.type !== "dcSource"), locked), [true]);
  // a short list of types counts each
  assert.deepEqual(parseChecks([{ type: "parts", parts: ["resistor", "resistor", "led"] }]), [{ type: "parts", count: { resistor: 2, led: 1 }, points: 1 }]);
});

test("the solution check compares topologies", () => {
  const solution = grid(LOOP);
  const c = circuitWith([{ type: "solution", points: 2 }], { columns: 8, rows: 8, solution });
  const elsewhere = solution.map((p) => ({ ...p, x: p.x + 3, y: p.y + 2 }));
  assert.equal(evaluate(c, elsewhere).score, 2);
  assert.equal(evaluate(c, elsewhere.filter((p) => p.type !== "lamp")).score, 0);
  assert.equal(evaluate(circuitWith([{ type: "solution" }]), solution).score, 0); // no solution: never passes
});

test("the circuit setting: reading, writing, the original's preset format", () => {
  const c = parseCircuit(serializeCircuit(DEFAULT_CIRCUIT));
  assert.deepEqual(c, DEFAULT_CIRCUIT);
  assert.equal(parseCircuit(""), DEFAULT_CIRCUIT);
  assert.equal(parseCircuit("{nope"), DEFAULT_CIRCUIT);
  const original = parseCircuit(JSON.stringify([{ Preset: [{ gridx: 1, gridy: 0, id: "draadH", rotation: 180 }, { gridx: 1, gridy: 1, id: "zekering", rotation: 90 }, { gridx: 1, gridy: 2, id: "unknown", rotation: 0 }], GridVisible: true }]));
  assert.deepEqual(original.preset, [{ type: "corner", x: 1, y: 0, rotation: 180, locked: true }, { type: "fuse", x: 1, y: 1, rotation: 90, locked: true }]);
  // sizes are kept in range, parts outside the board and on the same cell go
  const small = parseCircuit(JSON.stringify({ columns: 3, rows: 99, preset: [{ type: "lamp", x: 5, y: 0 }, { type: "lamp", x: 0, y: 0, locked: true }, { type: "wire", x: 0, y: 0 }, { type: "wire", x: 1, y: 0 }] }));
  assert.equal(small.rows, 16);
  assert.deepEqual(small.preset, [{ type: "lamp", x: 0, y: 0, rotation: 0, locked: true }, { type: "wire", x: 1, y: 0, rotation: 0 }]);
  // without a palette: every part, without limits
  assert.ok(small.palette.length > 20 && small.palette.every((p) => p.count === null));
  assert.deepEqual(parsePalette("led:1, Switch wire:0 led:3 nope"), [{ type: "led", count: 1 }, { type: "switch", count: null }, { type: "wire", count: 0 }]);
  assert.equal(parseChecks([{ type: "closed" }, { type: "nope" }, ...Array(10).fill({ type: "closed" })]).length, 8);
});

test("placing, moving, turning and removing; limits and locked cells", () => {
  const c = parseCircuit(JSON.stringify({ columns: 3, rows: 2, preset: [{ type: "dcSource", x: 0, y: 0, locked: true }, { type: "lamp", x: 1, y: 1 }], palette: "led:1 wire" }));
  let parts: Placed[] = [{ type: "lamp", x: 1, y: 1, rotation: 0 }];
  assert.equal(place(c, parts, "led", 0, 0), null); // a locked cell
  assert.equal(place(c, parts, "resistor", 1, 0), null); // not in the palette
  parts = place(c, parts, "led", 1, 0)!;
  assert.equal(remaining(c, parts, "led"), 0);
  assert.equal(remaining(c, parts, "wire"), null);
  assert.equal(place(c, parts, "led", 2, 0), null); // none left
  assert.ok(place(c, parts, "led", 1, 0)); // replacing the one on that cell is fine
  parts = move(c, parts, { x: 1, y: 0 }, { x: 2, y: 1 })!;
  assert.deepEqual(parts.map((p) => `${p.type}@${p.x},${p.y}`), ["lamp@1,1", "led@2,1"]);
  parts = move(c, parts, { x: 2, y: 1 }, { x: 1, y: 1 })!; // onto the lamp: they swap
  assert.deepEqual(parts.map((p) => `${p.type}@${p.x},${p.y}`), ["led@1,1", "lamp@2,1"]);
  assert.equal(move(c, parts, { x: 1, y: 1 }, { x: 0, y: 0 }), null);
  parts = rotate(rotate(rotate(rotate(parts, 1, 1)!, 1, 1)!, 1, 1)!, 1, 1)!;
  assert.equal(parts[0].rotation, 0);
  parts = rotate(parts, 1, 1)!;
  assert.equal(parts[0].rotation, 90);
  parts = remove(parts, 2, 1)!;
  assert.equal(parts.length, 1);
  assert.equal(remove(parts, 2, 1), null);
  // the board of the response has the locked parts too; reading it back gives the candidate's parts
  const board = serializeBoard(c, parts);
  assert.deepEqual(JSON.parse(board), { columns: 3, rows: 2, parts: [{ type: "dcSource", x: 0, y: 0, rotation: 0, locked: true }, { type: "led", x: 1, y: 1, rotation: 90 }] });
  assert.deepEqual(ownParts(c, JSON.parse(board)), parts);
  assert.deepEqual(boardOf(c, parts).length, 2);
});

// --- test materials (inspired by the DEPP Circuit PCI): a conductor is a branch like a closed switch, an insulator open

/** The simple loop with a test material in the top wire. */
const withSample = (material: string) => grid(`
c@180 ${material} c@270
V@90  .    L@90
c@90  -    c@0`);

test("test materials: names, and not in the palette of an item without one", () => {
  assert.deepEqual(MATERIAL_TYPES, ["aluminiumFoil", "copper", "ironNail", "graphite", "cotton", "wood", "plastic", "glass", "rubber"]);
  assert.deepEqual(["aluminiumfolie", "Aluminium foil", "koper", "spijker", "potloodstift", "katoen", "hout", "glas", "rubber"].map(partType),
    ["aluminiumFoil", "aluminiumFoil", "copper", "ironNail", "graphite", "cotton", "wood", "glass", "rubber"]);
  const noPalette = parseCircuit(JSON.stringify({ columns: 3, rows: 3 }));
  assert.ok(noPalette.palette.every((p) => !MATERIAL_TYPES.includes(p.type)));
  assert.deepEqual(parsePalette("copper:1 cotton"), [{ type: "copper", count: 1 }, { type: "cotton", count: null }]);
});

test("test materials: a conductor closes the circuit, an insulator keeps it open", () => {
  for (const conductor of ["aluminiumFoil", "copper", "ironNail", "graphite"]) {
    const a = analyze(withSample(conductor));
    assert.deepEqual(a.live, [true, true, true], conductor);
    assert.deepEqual(passes([{ type: "closed" }], withSample(conductor)), [true], conductor);
  }
  for (const insulator of ["cotton", "wood", "plastic", "glass", "rubber"]) {
    const a = analyze(withSample(insulator));
    assert.deepEqual(a.live, [false, false, false], insulator);
    assert.deepEqual(a.open, [true, false, false], insulator);
    assert.deepEqual(passes([{ type: "closed" }], withSample(insulator)), [false], insulator);
  }
  // the structure does not change: the sample is in series with the lamp either way, and in the topology
  assert.deepEqual(passes([{ type: "series", parts: ["cotton", "lamp"] }], withSample("cotton")), [true]);
  assert.equal(topology(withSample("cotton")), "cotton(1-2) dcSource(3>1) lamp(2-3)");
  // an insulator parallel to the lamp: the lamp still has current
  const across = grid(`
c@180 -    t@180  c@270
V@90  .    L@90   wood@90
c@90  -    t@0    c@0`);
  const a = analyze(across);
  assert.deepEqual(a.live, [true, true, false]);
  assert.deepEqual(passes([{ type: "lit", parts: ["lamp"] }, { type: "closed" }], across), [true, false]);
});

test("the lit check: with a material, or off", () => {
  const checks = [
    { type: "lit", parts: ["lamp"] },
    { type: "lit", parts: ["lamp"], material: "aluminiumFoil" },
    { type: "lit", parts: ["lamp"], material: "cotton", off: true },
    { type: "lit", parts: ["lamp"], off: true },
  ];
  assert.deepEqual(passes(checks, withSample("aluminiumFoil")), [true, true, false, false]);
  assert.deepEqual(passes(checks, withSample("cotton")), [false, false, true, true]);
  assert.deepEqual(passes(checks, withSample("copper")), [true, false, false, false]); // not the foil
  // an LED lights only the right way round
  const led = (rot: number) => grid(`
c@180 led@${rot} c@270
V@90  .    L@90
c@90  -    c@0`);
  assert.deepEqual(passes([{ type: "lit", parts: ["led"] }], led(0)), [true]);
  assert.deepEqual(passes([{ type: "lit", parts: ["led"] }], led(180)), [false]);
  // reading: an unknown or non-material material is left out
  assert.deepEqual(parseChecks([{ type: "lit", parts: "lamp", material: "lamp", off: 1 }, { type: "lit", parts: ["lamp"], material: "katoen", broken: true, points: 2 }]),
    [{ type: "lit", parts: ["lamp"], off: true, points: 1 }, { type: "lit", parts: ["lamp"], material: "cotton", broken: true, points: 2 }]);
});

// --- broken lamps (inspired by the DEPP LampeDouble PCI)

const SERIES = `
c@180 L    L    c@270
V@90  .    .    -@90
c@90  -    -    c@0`;
const PARALLEL = `
c@180 -    t@180 c@270
V@90  .    L@90  L@90
c@90  -    t@0   c@0`;

test("a broken lamp: in series the other goes out, in parallel it stays lit", () => {
  const lamps = (board: string, broken: string[]) => {
    const a = analyze(grid(board), broken);
    return a.net.elements.filter((e) => e.type === "lamp").map((e) => a.live[e.index]);
  };
  assert.deepEqual(lamps(SERIES, []), [true, true]);
  assert.deepEqual(lamps(SERIES, ["1,0"]), [false, false]);
  assert.deepEqual(lamps(PARALLEL, ["2,1"]), [false, true]);
  assert.deepEqual(lamps(PARALLEL, ["2,1", "3,1"]), [false, false]);
  assert.deepEqual(lamps(PARALLEL, ["0,0", "9,9"]), [true, true]); // no lamp there: nothing breaks

  const checks = [{ type: "lit", parts: ["lamp"], broken: true }, { type: "lit", parts: ["lamp"], broken: true, off: true }, { type: "closed" }, { type: "lit", parts: ["lamp"] }];
  assert.deepEqual(passes(checks, grid(PARALLEL), {}, ["2,1"]), [true, false, true, true]); // the lamp that is not broken is lit
  assert.deepEqual(passes(checks, grid(SERIES), {}, ["1,0"]), [false, true, true, false]);
  assert.deepEqual(passes(checks, grid(PARALLEL)), [false, false, true, true]); // nothing broken
});

test("broken lamps in the board of the response, toggling and moving", () => {
  const c = circuitWith([], { columns: 4, rows: 3 });
  const parts = grid(PARALLEL);
  const board = JSON.parse(serializeBoard(c, parts, ["2,1", "1,0"]));
  assert.deepEqual(board.parts.filter((p: any) => p.broken).map((p: any) => `${p.type}@${p.x},${p.y}`), ["lamp@2,1"]);
  assert.deepEqual(brokenFromBoard(board), ["2,1"]);
  assert.equal(JSON.stringify(JSON.parse(serializeBoard(c, parts))).includes("broken"), false);
  assert.deepEqual(toggleBroken(parts, [], 2, 1), ["2,1"]);
  assert.deepEqual(toggleBroken(parts, ["2,1"], 2, 1), []);
  assert.equal(toggleBroken(parts, [], 0, 1), null); // the source
  assert.deepEqual(moveBroken(["2,1"], { x: 2, y: 1 }, { x: 3, y: 1 }), ["3,1"]);
  assert.deepEqual(moveBroken(["2,1", "3,1"], { x: 2, y: 1 }, { x: 3, y: 1 }), ["2,1", "3,1"]);
});
