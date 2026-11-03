// npm test: the rules of the assembly PCI (src/assembly.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXAMPLES, EXAMPLE_IDS, ID, assembledAfter, assemblyOrder, blockersOfTakeBack, checkStep, correctSequence, countOrders, dependents,
  evaluate, exampleAssembly, findCycle, firstValidOrder, nameOf, ownSequence, parseAssembly, requiredBefore, sequenceIn, serializeAssembly,
  startPositions, violationsOf, type Assembly, type Part,
} from "../src/assembly.ts";

const part = (id: string, after: string[] = []): Part => ({ id, name: id, shape: "box", size: [1, 1, 1], color: "wood", at: [0, 0, 0], after });
const chain = (): Assembly => ({ ...exampleAssembly("cabinet"), example: "", parts: [part("a"), part("b", ["a"]), part("c", ["b"])], first: "" });

test("the examples: valid ids, prerequisites that exist, no cycle, Dutch and English names", () => {
  for (const id of EXAMPLE_IDS) {
    const parts = EXAMPLES[id].parts;
    assert.ok(parts.length >= 8, id);
    for (const x of parts) {
      assert.match(x.id, ID);
      for (const a of x.after) assert.ok(parts.some((y) => y.id === a), `${id}: ${x.id} after ${a}`);
      assert.notEqual(nameOf(x, "nl"), nameOf(x, "en"), `${id}: ${x.id} has a Dutch name`);
    }
    assert.equal(findCycle(parts), null, id);
    assert.ok(countOrders(parts) > 1, `${id} has several valid orders`);
  }
});

test("the cabinet: the screws after the door, the door after the hinges", () => {
  const a = exampleAssembly("cabinet");
  assert.deepEqual(requiredBefore(a.parts, "screws", "assemble"), ["door"]);
  assert.deepEqual(checkStep(a.parts, "assemble", ["base", "sideRight"], "door"), { allowed: false, missing: ["hinges"] });
  assert.deepEqual(checkStep(a.parts, "assemble", ["base", "sideRight", "hinges"], "door"), { allowed: true, missing: [] });
  assert.deepEqual(checkStep(a.parts, "assemble", [], "base"), { allowed: true, missing: [] });
  assert.deepEqual(dependents(a.parts, "door"), ["screws", "knob"]);
});

test("disassembly turns the rules round: a part comes off when nothing that needs it is on", () => {
  const a = exampleAssembly("cabinet");
  assert.deepEqual(checkStep(a.parts, "disassemble", [], "door"), { allowed: false, missing: ["screws", "knob"] });
  assert.deepEqual(checkStep(a.parts, "disassemble", ["knob", "screws"], "door"), { allowed: true, missing: [] });
  assert.equal(checkStep(a.parts, "disassemble", [], "knob").allowed, true);
  assert.deepEqual([...assembledAfter(a.parts, "disassemble", ["knob"])].length, a.parts.length - 1);
});

test("taking a step back is blocked while a later step stands on it", () => {
  const a = exampleAssembly("cabinet");
  assert.deepEqual(blockersOfTakeBack(a.parts, "assemble", ["base", "sideLeft", "sideRight"], "base"), ["sideLeft", "sideRight"]);
  assert.deepEqual(blockersOfTakeBack(a.parts, "assemble", ["base", "sideLeft", "sideRight"], "sideLeft"), []);
  assert.deepEqual(blockersOfTakeBack(a.parts, "disassemble", ["knob", "screws"], "knob"), []);
  assert.deepEqual(blockersOfTakeBack(a.parts, "disassemble", ["knob", "screws", "door"], "screws"), ["door"]);
});

test("violations: per step, every required part that came later or not at all", () => {
  const a = chain();
  assert.deepEqual(violationsOf(a.parts, "assemble", ["a", "b", "c"]), []);
  assert.deepEqual(violationsOf(a.parts, "assemble", ["c", "b", "a"]), [{ id: "c", missing: ["b"] }, { id: "b", missing: ["a"] }]);
  assert.deepEqual(violationsOf(a.parts, "disassemble", ["a", "b", "c"]), [{ id: "a", missing: ["b"] }, { id: "b", missing: ["c"] }]);
});

test("cycles, the first valid order and the number of orders", () => {
  assert.deepEqual(findCycle([part("a", ["c"]), part("b", ["a"]), part("c", ["b"])])?.length, 4);
  assert.equal(firstValidOrder([part("a", ["b"]), part("b", ["a"])]), null);
  assert.equal(countOrders([part("a", ["b"]), part("b", ["a"])]), 0);
  assert.deepEqual(firstValidOrder([part("x", ["y"]), part("y")]), ["y", "x"]);
  assert.equal(countOrders(chain().parts), 1);
  assert.equal(countOrders([part("a"), part("b"), part("c")]), 6);
  assert.equal(countOrders([part("a"), part("b", ["a"]), part("c", ["a"]), part("d", ["b", "c"])]), 2);
  // more than 20 parts: counted by trying, up to the limit
  const many = Array.from({ length: 22 }, (_, i) => part(`p${i}`, i ? [`p${i - 1}`] : []));
  assert.equal(countOrders(many), 1);
  assert.equal(countOrders(Array.from({ length: 22 }, (_, i) => part(`q${i}`)), 500), 500);
  // the cabinet: base, then the sides in either order, ...
  assert.ok(countOrders(EXAMPLES.cabinet.parts) > 20);
});

test("the correct sequence: the author's order when valid, else the first valid one; reversed for a disassembly", () => {
  const a = chain();
  assert.deepEqual(correctSequence(a), ["a", "b", "c"]);
  assert.deepEqual(correctSequence({ ...a, order: ["c", "b", "a"] }), ["a", "b", "c"]);
  assert.deepEqual(correctSequence({ ...a, task: "disassemble" }), ["c", "b", "a"]);
  const cabinet = exampleAssembly("cabinet");
  const own = ["base", "sideRight", "hinges", "sideLeft", "back", "top", "shelf", "door", "knob", "screws"];
  assert.deepEqual(assemblyOrder({ ...cabinet, order: own }), own);
  assert.equal(correctSequence({ ...a, parts: [part("a", ["b"]), part("b", ["a"])] }), null);
});

test("evaluate: valid, complete, first, violations, penalty", () => {
  const a = { ...chain(), points: { valid: 2, complete: 1, first: 1, penalty: 0 } };
  assert.deepEqual(evaluate(a, ["a", "b", "c"]), { score: 3, maxscore: 3, correct: true, valid: true, complete: true, first: null, violations: 0, steps: 3 });
  assert.deepEqual(evaluate(a, ["a", "c", "b"]), { score: 1, maxscore: 3, correct: false, valid: false, complete: true, first: null, violations: 1, steps: 3 });
  assert.deepEqual(evaluate(a, ["a", "b"]), { score: 0, maxscore: 3, correct: false, valid: false, complete: false, first: null, violations: 0, steps: 2 });
  const withFirst = { ...a, first: "b" };
  assert.equal(evaluate(withFirst, ["a", "b", "c"]).maxscore, 4);
  assert.equal(evaluate(withFirst, ["a", "b", "c"]).score, 3);
  assert.equal(evaluate(withFirst, ["a", "b", "c"]).correct, false);
  const penalty = { ...a, points: { valid: 2, complete: 3, first: 0, penalty: 1 } };
  assert.equal(evaluate(penalty, ["c", "b", "a"]).score, 1); // complete 3, two violations
  assert.equal(evaluate(penalty, ["c", "a"]).score, 0); // never below 0
  // unknown ids and doubles do not count
  assert.equal(evaluate(a, ["a", "a", "zz", "b", "c"]).score, 3);
});

test("parseAssembly: defaults, the example, unknown prerequisites and doubles dropped, round trip", () => {
  assert.equal(parseAssembly("").example, "cabinet");
  assert.equal(parseAssembly("", "hub").parts[0].id, "shell");
  assert.equal(parseAssembly("{oops", "plug").example, "plug");
  assert.equal(parseAssembly(JSON.stringify({ example: "hub", task: "Disassemble" })).task, "disassemble");
  const a = parseAssembly(JSON.stringify({
    parts: [{ id: "a", shape: "cylinder", size: ["0,5", 2] }, { id: "b", after: ["a", "nope", "b"] }, { id: "a" }],
    feedback: "record", scoring: "list", first: "b", order: ["b", "x", "a"], points: { valid: "3", penalty: -2 },
  }));
  assert.equal(a.parts.length, 2);
  assert.deepEqual(a.parts[0].size, [0.5, 2]);
  assert.deepEqual(a.parts[1].after, ["a"]);
  assert.equal(a.feedback, "record");
  assert.equal(a.scoring, "list");
  assert.equal(a.first, "b");
  assert.deepEqual(a.order, ["b", "a"]);
  assert.deepEqual(a.points, { valid: 3, complete: 1, first: 1, penalty: 0 });
  assert.deepEqual(parseAssembly(serializeAssembly(a)), a);
  const hub = exampleAssembly("hub");
  assert.deepEqual(parseAssembly(serializeAssembly(hub)), hub);
});

test("sequenceIn: a list, a string, a record, a declaration's field values", () => {
  assert.deepEqual(sequenceIn({ list: { identifier: ["a", "b"] } }), ["a", "b"]);
  assert.deepEqual(sequenceIn({ base: { string: "a,b, c" } }), ["a", "b", "c"]);
  assert.deepEqual(sequenceIn({ record: [{ name: "score", base: { integer: 1 } }, { name: "order", base: { string: "c,a" } }] }), ["c", "a"]);
  assert.deepEqual(sequenceIn([{ fieldIdentifier: "order", value: "b,a" }]), ["b", "a"]);
  assert.deepEqual(sequenceIn(["x", "y"]), ["x", "y"]);
  assert.deepEqual(sequenceIn('["p","q"]'), ["p", "q"]);
  assert.equal(sequenceIn(null), null);
  assert.deepEqual(ownSequence([part("a"), part("b")], ["b", "zz", "b", "a"]), ["b", "a"]);
});

test("start positions: the author's, or pushed out from the middle", () => {
  const parts = [{ ...part("l"), at: [-2, 0, 0] as [number, number, number] }, { ...part("r"), at: [2, 0, 0] as [number, number, number] }, { ...part("m"), start: [0, 5, 0] as [number, number, number] }];
  const s = startPositions(parts);
  assert.ok(s[0][0] < -2 && s[1][0] > 2);
  assert.deepEqual(s[2], [0, 5, 0]);
  const centre = startPositions([part("only")]);
  assert.ok(centre[0][1] > 0, "a part in the middle goes up");
});
