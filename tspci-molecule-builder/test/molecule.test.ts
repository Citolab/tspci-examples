// npm test: the chemistry of the molecule builder (src/molecule.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS, addAtom, atomInDirection, canonicalKey, canonicalSmiles, cellNear, components, evaluate, freeValence, hillFormula,
  moveAtom, nextOrder, normalizeFormula, parseElements, parseFormula, parseMolecule, parseSettings, parseSmiles, removeAtom, serializeSettings,
  setBond, shapeOf, lonePairs, valencesSatisfied, commonParts, displayParts, formulaText, elementCounts, formulaOrderOf, type ElementSymbol, type Molecule,
} from "../src/molecule.ts";

/** Builds a molecule as a candidate does: each step adds an element to an atom (by id) or on its own. */
const build = (steps: [ElementSymbol, number | null][]): Molecule => {
  let m: Molecule = { atoms: [], bonds: [] };
  for (const [el, parent] of steps) m = addAtom(m, el, parent)!.molecule;
  return m;
};
/** Shuffles atom ids and the order of the atoms and bonds (another drawing of the same molecule). */
const shuffle = (m: Molecule, seed: number): Molecule => {
  const ids = m.atoms.map((a) => a.id);
  const perm = [...ids].sort((a, b) => ((a * seed) % 17) - ((b * seed) % 17) || a - b);
  const map = new Map(ids.map((id, i) => [id, perm[i] + 100]));
  const atoms = m.atoms.map((a) => ({ ...a, id: map.get(a.id)! })).reverse();
  const bonds = m.bonds.map((b) => ({ a: Math.min(map.get(b.a)!, map.get(b.b)!), b: Math.max(map.get(b.a)!, map.get(b.b)!), order: b.order })).reverse();
  return { atoms, bonds };
};

test("building water: O, then two hydrogens bonded to it", () => {
  const water = build([["O", null], ["H", 1], ["H", 1]]);
  assert.equal(water.bonds.length, 2);
  assert.equal(hillFormula(water), "H2O");
  assert.equal(canonicalKey(water), "H2O:O");
  assert.ok(valencesSatisfied(water));
  // a third hydrogen: the oxygen is full, so it comes on its own
  const r = addAtom(water, "H", 1)!;
  assert.equal(r.bonded, false);
  assert.equal(freeValence(r.molecule, r.id), 1);
  assert.equal(components(r.molecule).length, 2);
});

test("canonical SMILES of the vmbo molecules", () => {
  const cases: [string, string][] = [
    ["O", "H2O:O"], ["O=C=O", "CO2:O=C=O"], ["C", "CH4:C"], ["N", "H3N:N"], ["O=O", "O2:O=O"], ["[H][H]", "H2:[H][H]"],
    ["Cl", "ClH:Cl"], ["OCC", "C2H6O:CCO"], ["COC", "C2H6O:COC"], ["C=C", "C2H4:C=C"], ["C#C", "C2H2:C#C"], ["N#N", "N2:N#N"],
    ["OC(C)=O", "C2H4O2:CC(=O)O"], ["ClC(Cl)(Cl)Cl", "CCl4:ClC(Cl)(Cl)Cl"], ["C1CCCCC1", "C6H12:C1CCCCC1"],
  ];
  for (const [smiles, key] of cases) assert.equal(canonicalKey(parseSmiles(smiles)!), key, smiles);
});

test("the canonical string does not depend on the drawing order", () => {
  for (const smiles of ["CCO", "CC(=O)O", "OCC(O)CO", "C1CCOC1", "CC(C)C", "C=CC=C", "NCC(=O)O"]) {
    const m = parseSmiles(smiles)!;
    const key = canonicalKey(m);
    for (const seed of [3, 5, 7, 11, 13]) assert.equal(canonicalKey(shuffle(m, seed)), key, `${smiles} seed ${seed}`);
    // and it reads back as the same molecule
    assert.equal(canonicalKey(parseSmiles(key)!), key);
  }
  // ethanol built by hand, hydrogens first and in another order
  const byHand = build([["H", null], ["O", 1], ["C", 2], ["H", 3], ["H", 3], ["C", 3], ["H", 6], ["H", 6], ["H", 6]]);
  assert.equal(canonicalKey(byHand), "C2H6O:CCO");
});

test("isomers differ, the same molecule does not", () => {
  assert.notEqual(canonicalSmiles(parseSmiles("CCO")!), canonicalSmiles(parseSmiles("COC")!));
  assert.notEqual(canonicalSmiles(parseSmiles("CCCC")!), canonicalSmiles(parseSmiles("CC(C)C")!));
  assert.equal(canonicalSmiles(parseSmiles("C(C)(C)C")!), canonicalSmiles(parseSmiles("CC(C)C")!));
});

test("radicals and missing hydrogens show in brackets", () => {
  const oh = build([["O", null], ["H", 1]]);
  assert.equal(canonicalKey(oh), "HO:[OH]");
  const ch3 = build([["C", null], ["H", 1], ["H", 1], ["H", 1]]);
  assert.equal(canonicalKey(ch3), "CH3:[CH3]");
  assert.equal(canonicalKey(parseSmiles("[CH3]")!), "CH3:[CH3]");
});

test("bonds cycle none, single, double, triple, none", () => {
  let m = build([["O", null], ["C", null], ["O", null]]);
  assert.equal(m.bonds.length, 0);
  for (const expected of [1, 2]) {
    m = setBond(m, 1, 2, nextOrder(m, 1, 2))!;
    assert.equal(m.bonds[0].order, expected);
  }
  m = setBond(m, 2, 3, 2)!;
  assert.equal(canonicalKey(m), "CO2:O=C=O");
  assert.equal(nextOrder(m, 2, 3), 3);
  assert.equal(nextOrder(setBond(m, 2, 3, 3)!, 2, 3), 0);
  assert.equal(setBond(m, 2, 3, 0)!.bonds.length, 1);
  assert.equal(setBond(m, 2, 2, 1), null);
});

test("removing an atom takes its bonds", () => {
  const m = parseSmiles("CCO")!;
  const c = m.atoms.find((a) => a.el === "C")!.id;
  const r = removeAtom(m, c)!;
  assert.equal(r.atoms.length, m.atoms.length - 1);
  assert.ok(r.bonds.every((b) => b.a !== c && b.b !== c));
  assert.equal(removeAtom(m, 999), null);
});

test("Hill order and formulas", () => {
  assert.equal(hillFormula(parseSmiles("N")!), "H3N");
  assert.equal(hillFormula(parseSmiles("CCO")!), "C2H6O");
  assert.equal(hillFormula(parseSmiles("ClC(Cl)Cl")!), "CHCl3");
  assert.equal(hillFormula(parseSmiles("OS(=O)(=O)O")!), "H2O4S");
  assert.deepEqual(parseFormula("CH3CH2OH"), { C: 2, H: 6, O: 1 });
  assert.equal(normalizeFormula("H₂O"), "H2O");
  assert.equal(normalizeFormula("NH3"), "H3N");
  assert.equal(normalizeFormula("Xy2"), null);
  assert.equal(normalizeFormula("co2"), null);
});

test("the structural formula: a chain to the right, hydrogens around it", () => {
  const m = parseSmiles("CCO")!;
  const [c1, c2, o] = m.atoms;
  assert.deepEqual([c1.x, c1.y, c2.x, c2.y, o.x, o.y], [0, 0, 1, 0, 2, 0]);
  const cells = new Set(m.atoms.map((a) => `${a.x},${a.y}`));
  assert.equal(cells.size, m.atoms.length);
  // methane is a cross
  const ch4 = parseSmiles("C")!;
  assert.deepEqual(ch4.atoms.slice(1).map((a) => [a.x, a.y]), [[1, 0], [-1, 0], [0, -1], [0, 1]]);
  assert.deepEqual(cellNear(ch4, 1), { x: 1, y: -1 });
  assert.equal(atomInDirection(ch4, 1, 0, -1), 4);
  assert.equal(atomInDirection(ch4, 1, 1, 0), 2);
  assert.equal(moveAtom(ch4, 2, -1, 0), null); // taken
  assert.deepEqual(moveAtom(ch4, 2, 2, 0)!.atoms[1], { id: 2, el: "H", x: 2, y: 0 });
});

test("VSEPR shapes from the lone pairs", () => {
  const water = parseSmiles("O")!, ammonia = parseSmiles("N")!, methane = parseSmiles("C")!, co2 = parseSmiles("O=C=O")!, ethene = parseSmiles("C=C")!;
  assert.equal(lonePairs(water, 1), 2);
  assert.equal(shapeOf(water, 1), "bent");
  assert.equal(shapeOf(ammonia, 1), "pyramidal");
  assert.equal(shapeOf(methane, 1), "tetrahedral");
  assert.equal(shapeOf(co2, 2), "linear");
  assert.equal(shapeOf(ethene, 1), "trigonal");
});

test("settings: the example, elements, broken JSON", () => {
  assert.deepEqual(parseSettings(""), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings("{not json"), DEFAULT_SETTINGS);
  assert.deepEqual(parseElements("o, h c cl xx"), ["H", "C", "O", "Cl"]);
  const s = parseSettings(JSON.stringify({ elements: "H C O", solution: "OCC", checks: [{ type: "isomer", formula: "CH3CH2OH", different: true }, { type: "bond", order: 2, a: "c", b: "O", points: 2 }, { type: "nope" }] }));
  assert.equal(s.solution, "CCO");
  assert.deepEqual(s.checks, [{ type: "isomer", formula: "C2H6O", different: true, points: 1 }, { type: "bond", order: 2, a: "C", b: "O", count: 1, points: 2 }]);
  assert.deepEqual(parseSettings(serializeSettings(s)), s);
  assert.equal(parseMolecule('{"atoms":[{"id":1,"el":"o","x":0,"y":0},{"id":1,"el":"H"},{"id":2,"el":"Zz"}],"bonds":[{"a":1,"b":5}]}')!.atoms.length, 1);
  assert.equal(parseSmiles("c1ccccc1"), null); // aromatic: not supported
  assert.equal(parseSmiles("C(C"), null);
});

test("checks: formula, valence, molecule, isomer, bond", () => {
  const s = parseSettings(JSON.stringify({
    solution: "CCO",
    checks: [{ type: "formula" }, { type: "valence" }, { type: "molecule", points: 2 }, { type: "isomer", different: true }, { type: "connected" }, { type: "bond", order: 1, a: "O", b: "H" }],
  }));
  const ethanol = evaluate(s, shuffle(parseSmiles("CCO")!, 5));
  assert.deepEqual(ethanol.results.map((r) => r.passed), [true, true, true, false, true, true]);
  assert.deepEqual([ethanol.score, ethanol.maxscore, ethanol.correct], [6, 7, false]);
  const ether = evaluate(s, parseSmiles("COC")!);
  assert.deepEqual(ether.results.map((r) => r.passed), [true, true, false, true, true, false]);
  // two parts with the right atoms: the formula is right, the rest not
  const parts = build([["C", null], ["H", 1], ["H", 1], ["H", 1], ["C", null], ["O", null]]);
  assert.deepEqual(evaluate(s, parts).results.map((r) => r.passed), [false, false, false, false, false, false]);
  assert.equal(evaluate(s, { atoms: [], bonds: [] }).score, 0);
  // the example: water
  assert.deepEqual(evaluate(DEFAULT_SETTINGS, parseSmiles("O")!).score, 3);
});

test("the formula as pupils learn it; the response stays in Hill order", () => {
  const shown = (counts: Record<string, number>) => formulaText(commonParts(counts));
  const cases: [Record<string, number>, string][] = [
    [{ N: 1, H: 3 }, "NH3"], [{ H: 1, Cl: 1 }, "HCl"], [{ H: 2, O: 1 }, "H2O"], [{ C: 1, O: 2 }, "CO2"], [{ Na: 1, Cl: 1 }, "NaCl"],
    [{ H: 2, S: 1, O: 4 }, "H2SO4"], [{ C: 1, H: 4 }, "CH4"], [{ C: 2, H: 6, O: 1 }, "C2H6O"], [{ H: 1, N: 1, O: 3 }, "HNO3"],
    [{ H: 3, P: 1, O: 4 }, "H3PO4"], [{ P: 1, H: 3 }, "PH3"], [{ H: 2, S: 1 }, "H2S"], [{ O: 2 }, "O2"], [{ Na: 1, O: 1, H: 1 }, "NaOH"],
    [{ N: 2, H: 4 }, "N2H4"], [{ H: 2, O: 2 }, "H2O2"], [{ C: 1, H: 1, Cl: 3 }, "CHCl3"],
  ];
  for (const [counts, expected] of cases) assert.equal(shown(counts), expected, expected);
  // from molecules: shown in the common order, the response in Hill order
  for (const [smiles, common, hill] of [["N", "NH3", "H3N"], ["Cl", "HCl", "ClH"], ["OS(=O)(=O)O", "H2SO4", "H2O4S"], ["CCO", "C2H6O", "C2H6O"]]) {
    const m = parseSmiles(smiles)!;
    assert.equal(formulaText(displayParts(elementCounts(m), "common")), common);
    assert.equal(formulaText(displayParts(elementCounts(m), "hill")), hill);
    assert.equal(hillFormula(m), hill);
    assert.ok(canonicalKey(m).startsWith(`${hill}:`));
  }
  assert.equal(formulaOrderOf("HILL"), "hill");
  assert.equal(formulaOrderOf(undefined), "common");
});
