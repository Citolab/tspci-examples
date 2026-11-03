// npm test: the 3D layout of the molecule builder (src/geometry.ts) in node.
import { test } from "node:test";
import assert from "node:assert/strict";
import { angle, dihedral, distance, layout3d, type Vec } from "../src/geometry.ts";
import { geometryAtoms, parseSmiles, neighbours, type Molecule } from "../src/molecule.ts";

const shape = (smiles: string) => {
  const m = parseSmiles(smiles)!;
  return { m, p: layout3d(geometryAtoms(m), m.bonds) };
};
/** The angle at an atom between its first two neighbours. */
const angleAt = (m: Molecule, p: Map<number, Vec>, id: number, i = 0, j = 1) => {
  const n = neighbours(m, id);
  return angle(p.get(n[i])!, p.get(id)!, p.get(n[j])!);
};
const near = (actual: number, expected: number, tolerance = 1) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual.toFixed(2)} ≈ ${expected}`);

test("bent water, pyramidal ammonia, tetrahedral methane, linear carbon dioxide", () => {
  const water = shape("O");
  near(angleAt(water.m, water.p, 1), 104.5);
  const ammonia = shape("N");
  near(angleAt(ammonia.m, ammonia.p, 1), 107);
  near(angleAt(ammonia.m, ammonia.p, 1, 1, 2), 107);
  const methane = shape("C");
  for (const [i, j] of [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]) near(angleAt(methane.m, methane.p, 1, i, j), 109.5);
  const co2 = shape("O=C=O");
  near(angleAt(co2.m, co2.p, 2), 180);
  const ethyne = shape("C#C");
  near(angleAt(ethyne.m, ethyne.p, 1), 180);
});

test("bond lengths: shorter for double and triple bonds", () => {
  const { m, p } = shape("CC");
  const ethene = shape("C=C"), ethyne = shape("C#C");
  const single = distance(p.get(1)!, p.get(2)!), double = distance(ethene.p.get(1)!, ethene.p.get(2)!), triple = distance(ethyne.p.get(1)!, ethyne.p.get(2)!);
  near(single, 1.52, 0.05);
  assert.ok(single > double && double > triple);
  assert.equal(m.atoms.length, 8);
});

test("ethene is flat: trigonal carbons, the hydrogens in one plane", () => {
  const { m, p } = shape("C=C");
  near(angleAt(m, p, 1), 120, 2);
  const h1 = neighbours(m, 1).find((id) => id !== 2)!, h2 = neighbours(m, 2).find((id) => id !== 1)!;
  const d = dihedral(p.get(h1)!, p.get(1)!, p.get(2)!, p.get(h2)!);
  assert.ok(d < 10 || d > 170, `dihedral ${d}`);
});

test("the layout is centred, deterministic, and starts from a seed", () => {
  const { m, p } = shape("CCO");
  const centre = [...p.values()].reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]);
  for (const c of centre) near(c, 0, 1e-6);
  const again = layout3d(geometryAtoms(m), m.bonds);
  assert.deepEqual([...again.values()], [...p.values()]);
  // the next step keeps the shape where it was: a new hydrogen does not turn the model
  const seeded = layout3d(geometryAtoms(m), m.bonds, p);
  for (const [id, v] of p) assert.ok(distance(v, seeded.get(id)!) < 0.05);
  // atoms that are not bonded keep apart
  const apart = parseSmiles("O.O")!;
  const q = layout3d(geometryAtoms(apart), apart.bonds);
  assert.ok(distance(q.get(1)!, q.get(2)!) >= 3);
  assert.equal(layout3d([], []).size, 0);
});
