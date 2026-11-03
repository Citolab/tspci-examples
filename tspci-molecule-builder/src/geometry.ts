// The 3D shape of a molecule, without imports (tested in node: test/geometry.test.ts): a VSEPR-like layout. Bonds get
// the length of the two covalent radii (shorter for double and triple bonds); around every atom the angle between two
// bonded neighbours follows from the electron domains (bonds and lone pairs): 2 linear (180°), 3 trigonal (120°),
// 4 tetrahedral (109.5°, a little less for every lone pair: NH₃ 107°, H₂O 104.5°). Double bonds keep their
// substituents in one plane. The constraints are met by relaxing distances (position based), from the structural
// formula or from the positions the atoms had before (so the model does not jump while building).

export type Vec = [number, number, number];
export type GeometryAtom = { id: number; radius: number; lonePairs: number; x: number; y: number };
export type GeometryBond = { a: number; b: number; order: number };

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a: Vec) => Math.sqrt(dot(a, a));
export const distance = (a: Vec, b: Vec) => length(sub(a, b));

/** The angle at b between a and c, in degrees. */
export const angle = (a: Vec, b: Vec, c: Vec) => {
  const u = sub(a, b), v = sub(c, b);
  const cos = dot(u, v) / (length(u) * length(v) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
};

/** The dihedral angle a-b-c-d, in degrees (0: cis, 180: trans). */
export const dihedral = (a: Vec, b: Vec, c: Vec, d: Vec) => {
  const b1 = sub(b, a), b2 = sub(c, b), b3 = sub(d, c);
  const n1 = cross(b1, b2), n2 = cross(b2, b3);
  const m = cross(n1, scale(b2, 1 / (length(b2) || 1)));
  return Math.abs((Math.atan2(dot(m, n2), dot(n1, n2)) * 180) / Math.PI);
};

/** Bond length in ångström: the covalent radii, 13% shorter for a double and 22% for a triple bond. */
export const bondLength = (r1: number, r2: number, order: number) => (r1 + r2) * (order === 3 ? 0.78 : order === 2 ? 0.87 : 1);

/** The angle between two bonds at an atom with this many neighbours and lone pairs. */
export const idealAngle = (neighbours: number, lonePairs: number) => {
  const domains = neighbours + lonePairs;
  if (domains <= 2) return 180;
  if (domains === 3) return 120;
  if (domains === 4) return 109.47 - 2.5 * lonePairs;
  return 90; // 5 and 6 domains: repulsion only (see below)
};

type Constraint = { i: number; j: number; d: number; w: number; min?: boolean };

/** Positions in ångström per atom id, centred on the middle of the molecule. */
export const layout3d = (atoms: GeometryAtom[], bonds: GeometryBond[], seed?: Map<number, Vec>, iterations = 600): Map<number, Vec> => {
  const n = atoms.length;
  const out = new Map<number, Vec>();
  if (!n) return out;
  const index = new Map(atoms.map((a, i) => [a.id, i]));
  const adj: { to: number; order: number; length: number }[][] = atoms.map(() => []);
  for (const b of bonds) {
    const i = index.get(b.a), j = index.get(b.b);
    if (i === undefined || j === undefined || i === j) continue;
    const l = bondLength(atoms[i].radius, atoms[j].radius, b.order);
    adj[i].push({ to: j, order: b.order, length: l });
    adj[j].push({ to: i, order: b.order, length: l });
  }

  // the start: the positions before, or else the structural formula with a little depth
  const p: Vec[] = atoms.map((a, i) => {
    const s = seed?.get(a.id);
    if (s) return [...s] as Vec;
    return [a.x * 1.3, -a.y * 1.3, 0.35 * Math.sin(i * 1.7 + 0.5)] as Vec;
  });
  // a new atom next to a seeded neighbour, a little out of line
  if (seed) {
    atoms.forEach((a, i) => {
      if (seed.has(a.id)) return;
      const near = adj[i].find((e) => seed.has(atoms[e.to].id));
      if (near) {
        const q = seed.get(atoms[near.to].id)!;
        const k = a.id * 2.399;
        p[i] = add(q, scale([Math.cos(k), Math.sin(k), 0.6 * Math.sin(k * 1.3)], near.length));
      }
    });
  }

  const constraints: Constraint[] = [];
  const related = new Set<string>();
  const key = (i: number, j: number) => (i < j ? `${i},${j}` : `${j},${i}`);
  for (let i = 0; i < n; i++)
    for (const e of adj[i]) if (i < e.to) (constraints.push({ i, j: e.to, d: e.length, w: 1 }), related.add(key(i, e.to)));
  // 1-3: the angles at each atom
  for (let c = 0; c < n; c++) {
    const list = adj[c];
    const domains = list.length + atoms[c].lonePairs;
    for (let x = 0; x < list.length; x++)
      for (let y = x + 1; y < list.length; y++) {
        const a = list[x], b = list[y];
        if (domains > 4) {
          // 5 or 6 domains: keep them apart (trigonal bipyramid, octahedron)
          constraints.push({ i: a.to, j: b.to, d: Math.SQRT2 * Math.min(a.length, b.length), w: 0.3, min: true });
        } else {
          const t = (idealAngle(list.length, atoms[c].lonePairs) * Math.PI) / 180;
          const d = Math.sqrt(a.length ** 2 + b.length ** 2 - 2 * a.length * b.length * Math.cos(t));
          constraints.push({ i: a.to, j: b.to, d, w: 0.6 });
        }
        related.add(key(a.to, b.to));
      }
  }
  // 1-4 over double bonds: the substituents cis or trans, in one plane (the side is chosen as the layout goes)
  const torsions: { a: number; b: number; c: number; d: number; cis: number; trans: number }[] = [];
  for (let b = 0; b < n; b++)
    for (const e of adj[b]) {
      const c = e.to;
      if (e.order !== 2 || b > c) continue;
      const isLinear = (x: number) => adj[x].length + atoms[x].lonePairs <= 2;
      if (isLinear(b) || isLinear(c)) continue; // an atom with two double bonds is linear: no plane to keep
      for (const ea of adj[b]) {
        if (ea.to === c) continue;
        for (const ed of adj[c]) {
          if (ed.to === b || ed.to === ea.to) continue;
          // sp2: 120° at both ends
          const la = ea.length, l = e.length, ld = ed.length;
          const A: Vec = [-la * Math.cos(Math.PI / 3), la * Math.sin(Math.PI / 3), 0];
          const cis: Vec = [l + ld * Math.cos(Math.PI / 3), ld * Math.sin(Math.PI / 3), 0];
          const trans: Vec = [l + ld * Math.cos(Math.PI / 3), -ld * Math.sin(Math.PI / 3), 0];
          torsions.push({ a: ea.to, b, c, d: ed.to, cis: distance(A, cis), trans: distance(A, trans) });
          related.add(key(ea.to, ed.to));
        }
      }
    }
  // parts of the molecule: atoms of different parts keep more apart
  const part = new Array(n).fill(-1);
  let parts = 0;
  for (let s = 0; s < n; s++) {
    if (part[s] >= 0) continue;
    const queue = [s];
    part[s] = parts;
    while (queue.length) {
      const v = queue.shift()!;
      for (const e of adj[v]) if (part[e.to] < 0) (part[e.to] = parts), queue.push(e.to);
    }
    parts++;
  }

  const apply = (c: Constraint) => {
    const d = sub(p[c.j], p[c.i]);
    let len = length(d);
    if (len < 1e-6) {
      // on top of each other: push apart in a fixed direction
      const k = (c.i * 7 + c.j * 13) * 0.37;
      p[c.j] = add(p[c.j], [Math.cos(k) * 0.05, Math.sin(k) * 0.05, 0.03]);
      return;
    }
    if (c.min && len >= c.d) return;
    const shift = ((len - c.d) / len) * 0.5 * c.w;
    p[c.i] = add(p[c.i], scale(d, shift));
    p[c.j] = sub(p[c.j], scale(d, shift));
  };

  const linear = atoms.map((_, c) => c).filter((c) => adj[c].length === 2 && atoms[c].lonePairs === 0);
  for (let it = 0; it < iterations; it++) {
    for (const c of constraints) apply(c);
    for (const t of torsions) {
      const angleNow = dihedral(p[t.a], p[t.b], p[t.c], p[t.d]);
      apply({ i: t.a, j: t.d, d: angleNow < 90 ? t.cis : t.trans, w: 0.4 });
    }
    // linear atoms: their two neighbours on one line (the distances alone get there slowly)
    for (const c of linear) {
      const [a, b] = adj[c];
      // the atom moves onto the line between its neighbours, they move the other way (the centre stays)
      const target = add(p[a.to], scale(sub(p[b.to], p[a.to]), a.length / (a.length + b.length)));
      const delta = sub(target, p[c]);
      p[c] = add(p[c], scale(delta, 0.5));
      p[a.to] = sub(p[a.to], scale(delta, 0.25));
      p[b.to] = sub(p[b.to], scale(delta, 0.25));
    }
    // atoms that are not bonded and share no neighbour keep a distance
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        if (related.has(key(i, j))) continue;
        const min = part[i] === part[j] ? 2.2 : 3.2;
        apply({ i, j, d: min, w: it < iterations * 0.8 ? 0.15 : 0.05, min: true });
      }
  }

  const centre = scale(p.reduce((s, v) => add(s, v), [0, 0, 0] as Vec), 1 / n);
  atoms.forEach((a, i) => out.set(a.id, sub(p[i], centre)));
  return out;
};
