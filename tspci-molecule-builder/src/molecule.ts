// The molecule builder's chemistry, without imports (tested in node: test/molecule.test.ts): the elements, a molecule
// of atoms and bonds with its 2D grid positions (the structural formula), building steps, the molecular formula in Hill
// order, free valences, a canonical SMILES (canonical labelling by partition refinement and a search over the ties),
// a SMILES parser for the settings and responses, the author's settings and the checks the PCI scores.

export type ElementSymbol = "H" | "C" | "N" | "O" | "F" | "Cl" | "Br" | "I" | "S" | "P";

export type ElementDef = {
  symbol: ElementSymbol;
  /** the number of bonds in school chemistry (the "covalentie") */
  valence: number;
  /** valence electrons: the lone pairs follow from them (VSEPR) */
  electrons: number;
  /** CPK colour of the ball, and a text colour that reads on it */
  color: string;
  text: string;
  /** covalent radius in ångström */
  radius: number;
  /** the key that adds the element in the builder */
  key: string;
};

export const ELEMENTS: Record<ElementSymbol, ElementDef> = {
  H: { symbol: "H", valence: 1, electrons: 1, color: "#f8fafc", text: "#0f172a", radius: 0.31, key: "h" },
  C: { symbol: "C", valence: 4, electrons: 4, color: "#3f3f46", text: "#ffffff", radius: 0.76, key: "c" },
  N: { symbol: "N", valence: 3, electrons: 5, color: "#2f55e8", text: "#ffffff", radius: 0.71, key: "n" },
  O: { symbol: "O", valence: 2, electrons: 6, color: "#e0242b", text: "#ffffff", radius: 0.66, key: "o" },
  F: { symbol: "F", valence: 1, electrons: 7, color: "#90e050", text: "#0f172a", radius: 0.57, key: "f" },
  Cl: { symbol: "Cl", valence: 1, electrons: 7, color: "#2fd12f", text: "#0f172a", radius: 1.02, key: "l" },
  Br: { symbol: "Br", valence: 1, electrons: 7, color: "#a62929", text: "#ffffff", radius: 1.2, key: "b" },
  I: { symbol: "I", valence: 1, electrons: 7, color: "#940094", text: "#ffffff", radius: 1.39, key: "i" },
  S: { symbol: "S", valence: 2, electrons: 6, color: "#f2d21b", text: "#0f172a", radius: 1.05, key: "s" },
  P: { symbol: "P", valence: 3, electrons: 5, color: "#ff8000", text: "#0f172a", radius: 1.07, key: "p" },
};
export const ELEMENT_SYMBOLS = Object.keys(ELEMENTS) as ElementSymbol[];
export const isElement = (value: unknown): value is ElementSymbol => typeof value === "string" && Object.prototype.hasOwnProperty.call(ELEMENTS, value);
/** "cl", "CL" and "Cl" are chlorine. */
export const elementOf = (value: unknown): ElementSymbol | null => {
  if (typeof value !== "string") return null;
  const v = value.trim();
  const s = v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
  return isElement(s) ? s : null;
};

export type BondOrder = 1 | 2 | 3;
export type Atom = { id: number; el: ElementSymbol; x: number; y: number };
export type Bond = { a: number; b: number; order: BondOrder };
export type Molecule = { atoms: Atom[]; bonds: Bond[] };

export const EMPTY: Molecule = { atoms: [], bonds: [] };
export const MAX_ATOMS = 60;

// --- reading and writing a molecule (state, responses)

/** A molecule from JSON (or an object): unknown elements, duplicate ids and bonds to missing atoms are left out. */
export const parseMolecule = (value: unknown): Molecule | null => {
  let v: any = value;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object" || !Array.isArray(v.atoms)) return null;
  const atoms: Atom[] = [];
  const seen = new Set<number>();
  const cells = new Set<string>();
  for (const a of v.atoms) {
    const el = elementOf(a?.el);
    const id = Number(a?.id);
    if (!el || !Number.isInteger(id) || id < 1 || seen.has(id)) continue;
    let x = Math.round(Number(a?.x) || 0), y = Math.round(Number(a?.y) || 0);
    while (cells.has(`${x},${y}`)) x++;
    seen.add(id);
    cells.add(`${x},${y}`);
    atoms.push({ id, el, x, y });
  }
  const bonds: Bond[] = [];
  for (const b of Array.isArray(v.bonds) ? v.bonds : []) {
    const a = Number(b?.a), c = Number(b?.b), order = Number(b?.order ?? 1);
    if (!seen.has(a) || !seen.has(c) || a === c || ![1, 2, 3].includes(order)) continue;
    if (bonds.some((x) => (x.a === a && x.b === c) || (x.a === c && x.b === a))) continue;
    bonds.push({ a: Math.min(a, c), b: Math.max(a, c), order: order as BondOrder });
  }
  const kept = atoms.slice(0, MAX_ATOMS);
  const ids = new Set(kept.map((a) => a.id));
  return { atoms: kept, bonds: bonds.filter((b) => ids.has(b.a) && ids.has(b.b)) };
};

export const serializeMolecule = (m: Molecule) => JSON.stringify({ atoms: m.atoms, bonds: m.bonds });

export const sameMolecule = (a: Molecule, b: Molecule) => serializeMolecule(a) === serializeMolecule(b);

// --- looking things up

export const atomById = (m: Molecule, id: number) => m.atoms.find((a) => a.id === id);
export const bondBetween = (m: Molecule, a: number, b: number) => m.bonds.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
export const bondsOf = (m: Molecule, id: number) => m.bonds.filter((b) => b.a === id || b.b === id);
export const other = (bond: Bond, id: number) => (bond.a === id ? bond.b : bond.a);
export const neighbours = (m: Molecule, id: number) => bondsOf(m, id).map((b) => other(b, id));
export const bondSum = (m: Molecule, id: number) => bondsOf(m, id).reduce((s, b) => s + b.order, 0);
/** Bonds the atom still has free: its valence minus its bonds; below 0 when it has too many. */
export const freeValence = (m: Molecule, id: number) => {
  const atom = atomById(m, id);
  return atom ? ELEMENTS[atom.el].valence - bondSum(m, id) : 0;
};
export const totalFree = (m: Molecule) => m.atoms.reduce((s, a) => s + Math.max(0, freeValence(m, a.id)), 0);
export const overBonded = (m: Molecule) => m.atoms.filter((a) => freeValence(m, a.id) < 0);
export const atomAt = (m: Molecule, x: number, y: number) => m.atoms.find((a) => a.x === x && a.y === y);
const nextId = (m: Molecule) => m.atoms.reduce((n, a) => Math.max(n, a.id), 0) + 1;

/** The connected parts of the molecule, as lists of atom ids (in the order of the atoms). */
export const components = (m: Molecule): number[][] => {
  const seen = new Set<number>();
  const out: number[][] = [];
  for (const start of m.atoms) {
    if (seen.has(start.id)) continue;
    const part: number[] = [];
    const queue = [start.id];
    seen.add(start.id);
    while (queue.length) {
      const id = queue.shift()!;
      part.push(id);
      for (const n of neighbours(m, id)) if (!seen.has(n)) (seen.add(n), queue.push(n));
    }
    out.push(part);
  }
  return out;
};

// --- the structural formula: atoms on a grid

const DIRECTIONS = [[1, 0], [-1, 0], [0, -1], [0, 1]] as const; // E W N S
const DIAGONALS = [[1, -1], [1, 1], [-1, -1], [-1, 1]] as const;

/** A free cell next to an atom: straight on from a neighbour first (a chain), then up, down, and the diagonals. */
export const cellNear = (m: Molecule, id: number): { x: number; y: number } => {
  const atom = atomById(m, id)!;
  const free = (x: number, y: number) => !atomAt(m, x, y);
  const dirs: (readonly [number, number])[] = [];
  for (const n of neighbours(m, id)) {
    const o = atomById(m, n)!;
    const dx = Math.sign(atom.x - o.x), dy = Math.sign(atom.y - o.y);
    if (dx === 0 || dy === 0) dirs.push([dx, dy]);
  }
  for (const d of [...DIRECTIONS.slice(0, 1), [0, -1] as const, [0, 1] as const, [-1, 0] as const, ...DIAGONALS]) dirs.push(d);
  for (const [dx, dy] of dirs) if ((dx || dy) && free(atom.x + dx, atom.y + dy)) return { x: atom.x + dx, y: atom.y + dy };
  // further away: the nearest free cell
  for (let r = 2; r < 40; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && free(atom.x + dx, atom.y + dy)) return { x: atom.x + dx, y: atom.y + dy };
  return { x: atom.x + 40, y: atom.y };
};

/** A cell for an atom on its own: right of everything there is. */
export const freeCell = (m: Molecule) => {
  if (!m.atoms.length) return { x: 0, y: 0 };
  const right = Math.max(...m.atoms.map((a) => a.x));
  const top = Math.min(...m.atoms.map((a) => a.y)), bottom = Math.max(...m.atoms.map((a) => a.y));
  return { x: right + 2, y: Math.round((top + bottom) / 2) };
};

/** New grid positions for every atom: each part from its first heavy atom, the chain first, then the hydrogens. */
export const layout2d = (m: Molecule): Molecule => {
  let out: Molecule = { atoms: [], bonds: m.bonds };
  const placed = new Set<number>();
  const place = (id: number, at: { x: number; y: number }) => {
    const a = atomById(m, id)!;
    out = { ...out, atoms: [...out.atoms, { ...a, x: at.x, y: at.y }] };
    placed.add(id);
  };
  // bonds only between placed atoms count for cellNear
  const view = () => ({ atoms: out.atoms, bonds: m.bonds.filter((b) => placed.has(b.a) && placed.has(b.b)) });
  for (const part of components(m)) {
    const heavy = part.filter((id) => atomById(m, id)!.el !== "H");
    const root = heavy[0] ?? part[0];
    place(root, freeCell(view()));
    // breadth first over the heavy atoms, then the hydrogens of each
    const queue = [root];
    const order: number[] = [];
    const seen = new Set([root]);
    while (queue.length) {
      const id = queue.shift()!;
      order.push(id);
      for (const n of neighbours(m, id)) if (!seen.has(n) && atomById(m, n)!.el !== "H") (seen.add(n), queue.push(n));
    }
    for (const id of order) for (const n of neighbours(m, id)) if (!placed.has(n) && atomById(m, n)!.el !== "H") place(n, cellNear(view(), id));
    for (const id of order) for (const n of neighbours(m, id)) if (!placed.has(n)) place(n, cellNear(view(), id));
    // what is left (hydrogens on hydrogens)
    for (const id of part) if (!placed.has(id)) {
      const n = neighbours(m, id).find((x) => placed.has(x));
      place(id, n ? cellNear(view(), n) : freeCell(view()));
    }
  }
  const byId = new Map(out.atoms.map((a) => [a.id, a]));
  return { atoms: m.atoms.map((a) => byId.get(a.id)!), bonds: m.bonds };
};

// --- building steps; each returns a new molecule, or null when nothing changes

/**
 * Adds an atom. Next to `parent` with a single bond when both have a bond free; otherwise on its own (next to the
 * parent when there is one). Returns the molecule, the new id and whether it is bonded.
 */
export const addAtom = (m: Molecule, el: ElementSymbol, parent: number | null, maxAtoms = MAX_ATOMS) => {
  if (m.atoms.length >= maxAtoms) return null;
  const id = nextId(m);
  const p = parent !== null ? atomById(m, parent) : undefined;
  const at = p ? cellNear(m, p.id) : freeCell(m);
  const bonded = !!p && freeValence(m, p.id) > 0;
  const atoms = [...m.atoms, { id, el, x: at.x, y: at.y }];
  const bonds = bonded ? [...m.bonds, { a: Math.min(p!.id, id), b: Math.max(p!.id, id), order: 1 as BondOrder }] : m.bonds;
  return { molecule: { atoms, bonds }, id, bonded };
};

export const removeAtom = (m: Molecule, id: number): Molecule | null =>
  atomById(m, id) ? { atoms: m.atoms.filter((a) => a.id !== id), bonds: m.bonds.filter((b) => b.a !== id && b.b !== id) } : null;

/** Sets the bond between two atoms: 0 removes it. */
export const setBond = (m: Molecule, a: number, b: number, order: 0 | BondOrder): Molecule | null => {
  if (a === b || !atomById(m, a) || !atomById(m, b)) return null;
  const rest = m.bonds.filter((x) => !((x.a === a && x.b === b) || (x.a === b && x.b === a)));
  return { atoms: m.atoms, bonds: order ? [...rest, { a: Math.min(a, b), b: Math.max(a, b), order }] : rest };
};

/** The next order of a bond as the builder cycles it: none → single → double → triple → none. */
export const nextOrder = (m: Molecule, a: number, b: number): 0 | BondOrder => (((bondBetween(m, a, b)?.order ?? 0) + 1) % 4) as 0 | BondOrder;

export const moveAtom = (m: Molecule, id: number, x: number, y: number): Molecule | null => {
  const atom = atomById(m, id);
  if (!atom || (atom.x === x && atom.y === y) || atomAt(m, x, y)) return null;
  return { atoms: m.atoms.map((a) => (a.id === id ? { ...a, x, y } : a)), bonds: m.bonds };
};

/** The atom nearest to `id` in a direction on the grid (for the arrow keys), within a 45° cone either side. */
export const atomInDirection = (m: Molecule, id: number, dx: number, dy: number): number | null => {
  const from = atomById(m, id);
  if (!from) return null;
  let best: number | null = null, bestScore = Infinity;
  for (const a of m.atoms) {
    if (a.id === id) continue;
    const vx = a.x - from.x, vy = a.y - from.y;
    const along = vx * dx + vy * dy, across = Math.abs(vx * dy - vy * dx);
    if (along <= 0 || across > along) continue;
    const score = along + 2 * across;
    if (score < bestScore) (bestScore = score), (best = a.id);
  }
  return best;
};

// --- the formula

export type FormulaPart = { el: string; count: number };

/** Counts per element. */
export const elementCounts = (m: Molecule): Record<string, number> =>
  m.atoms.reduce((acc, a) => ((acc[a.el] = (acc[a.el] ?? 0) + 1), acc), {} as Record<string, number>);

/** Hill order: carbon, then hydrogen, then the rest alphabetically; without carbon everything alphabetically. */
export const hillParts = (counts: Record<string, number>): FormulaPart[] => {
  const els = Object.keys(counts).filter((e) => counts[e] > 0);
  const hasC = els.includes("C");
  const rest = els.filter((e) => !hasC || (e !== "C" && e !== "H")).sort();
  const first = hasC ? ["C", ...(els.includes("H") ? ["H"] : [])] : [];
  return [...first, ...rest].map((el) => ({ el, count: counts[el] }));
};
/** The element sequence of IUPAC for formulas of binary compounds: the less electronegative element first. */
const SEQUENCE = ["B", "Si", "C", "Sb", "As", "P", "N", "H", "Te", "Se", "S", "At", "I", "Br", "Cl", "O", "F"];

/**
 * The order pupils learn (only for showing the formula; responses and checks keep Hill order): with carbon Hill
 * order (CH4, C2H6O, CO2); without carbon metals first, then the IUPAC sequence (NH3, PH3, HCl, H2O, NaCl), except that
 * an acid writes its hydrogen first (H2SO4, HNO3, H3PO4) and a hydroxide its OH last (NaOH).
 */
export const commonParts = (counts: Record<string, number>): FormulaPart[] => {
  const els = Object.keys(counts).filter((e) => counts[e] > 0);
  if (els.includes("C")) return hillParts(counts);
  const metals = els.filter((e) => !SEQUENCE.includes(e)).sort();
  let rest = els.filter((e) => SEQUENCE.includes(e)).sort((a, b) => SEQUENCE.indexOf(a) - SEQUENCE.indexOf(b));
  if (rest.includes("H") && rest.length >= 3 && !metals.length) rest = ["H", ...rest.filter((e) => e !== "H")]; // an oxoacid
  if (metals.length && rest.includes("H") && rest.includes("O")) rest = [...rest.filter((e) => e !== "H"), "H"]; // a hydroxide
  return [...metals, ...rest].map((el) => ({ el, count: counts[el] }));
};

export type FormulaOrder = "common" | "hill";
export const formulaOrderOf = (value: unknown): FormulaOrder => (String(value ?? "").toLowerCase() === "hill" ? "hill" : "common");
/** The formula as the candidate sees it. */
export const displayParts = (counts: Record<string, number>, order: FormulaOrder) => (order === "hill" ? hillParts(counts) : commonParts(counts));

export const formulaText = (parts: FormulaPart[]) => parts.map((p) => `${p.el}${p.count > 1 ? p.count : ""}`).join("");
export const hillFormula = (m: Molecule) => formulaText(hillParts(elementCounts(m)));

/** A formula as text ("C2H6O", "CH3CH2OH", "H₂O") as counts per element; null when it is not one. */
export const parseFormula = (text: string): Record<string, number> | null => {
  const t = String(text ?? "").replace(/[₀-₉]/g, (d) => String(d.charCodeAt(0) - 0x2080)).replace(/\s+/g, "");
  if (!t) return null;
  const counts: Record<string, number> = {};
  const re = /([A-Z][a-z]?)(\d*)/y;
  let i = 0;
  while (i < t.length) {
    re.lastIndex = i;
    const match = re.exec(t);
    if (!match) return null;
    const el = elementOf(match[1]);
    if (!el || el !== match[1]) return null;
    counts[el] = (counts[el] ?? 0) + (match[2] ? Number(match[2]) : 1);
    i = re.lastIndex;
  }
  return counts;
};
export const normalizeFormula = (text: string) => {
  const counts = parseFormula(text);
  return counts ? formulaText(hillParts(counts)) : null;
};

// --- canonical SMILES

const NORMAL_VALENCES: Record<string, number[]> = { B: [3], C: [4], N: [3, 5], O: [2], P: [3, 5], S: [2, 4, 6], F: [1], Cl: [1], Br: [1], I: [1] };
/** The hydrogens SMILES assumes on an atom outside brackets with these bonds. */
const implicitH = (el: string, sum: number) => {
  const v = (NORMAL_VALENCES[el] ?? []).find((x) => x >= sum);
  return v === undefined ? 0 : v - sum;
};
const BOND_SYMBOL = ["", "", "=", "#"];

type Graph = { el: string[]; h: number[]; adj: { to: number; order: number }[][] };

/**
 * The heavy-atom graph: hydrogens with one single bond to an atom that is not hydrogen become a count on that atom;
 * every other hydrogen (H₂, a hydrogen with two bonds or none) stays an atom of its own.
 */
const heavyGraph = (m: Molecule) => {
  const implicit = new Set<number>();
  for (const a of m.atoms) {
    if (a.el !== "H") continue;
    const bs = bondsOf(m, a.id);
    if (bs.length === 1 && bs[0].order === 1 && atomById(m, other(bs[0], a.id))!.el !== "H") implicit.add(a.id);
  }
  const heavy = m.atoms.filter((a) => !implicit.has(a.id));
  const index = new Map(heavy.map((a, i) => [a.id, i]));
  const g: Graph = { el: heavy.map((a) => a.el), h: heavy.map(() => 0), adj: heavy.map(() => []) };
  for (const b of m.bonds) {
    const i = index.get(b.a), j = index.get(b.b);
    if (i !== undefined && j !== undefined) {
      g.adj[i].push({ to: j, order: b.order });
      g.adj[j].push({ to: i, order: b.order });
    } else if (i !== undefined) g.h[i]++;
    else if (j !== undefined) g.h[j]++;
  }
  return g;
};

const pad = (n: number) => String(n).padStart(4, "0");

/** Ranks from keys: equal keys share a rank, ranks follow the sorted keys. */
const rank = (keys: string[]) => {
  const sorted = [...new Set(keys)].sort();
  return keys.map((k) => sorted.indexOf(k));
};

/** Refines a partition (ranks per atom) until the neighbours' ranks no longer split a class. */
const refine = (g: Graph, nodes: number[], cls: number[]) => {
  let current = cls;
  for (;;) {
    const keys = nodes.map((v, i) => {
      const around = g.adj[v].map((e) => `${e.order}:${pad(current[nodes.indexOf(e.to)])}`).sort().join(",");
      return `${pad(current[i])}|${around}`;
    });
    const next = rank(keys);
    if (new Set(next).size === new Set(current).size) return next;
    current = next;
  }
};

/** SMILES of one connected part, its atoms ranked 0 … n-1 (all different). */
const writeSmiles = (g: Graph, nodes: number[], ranks: number[]) => {
  const local = new Map(nodes.map((v, i) => [v, i]));
  const byRank = (a: number, b: number) => ranks[local.get(a)!] - ranks[local.get(b)!];
  const start = nodes.find((_, i) => ranks[i] === 0)!;
  const order = new Map<number, number>();
  const parent = new Map<number, number>();
  const children = new Map<number, number[]>();
  const opens = new Map<number, number[]>(); // ring bonds opened at an atom, to the atom that closes them
  const closes = new Map<number, number[]>();
  const visit = (v: number) => {
    order.set(v, order.size);
    children.set(v, []);
    for (const n of g.adj[v].map((e) => e.to).sort(byRank)) {
      if (n === parent.get(v)) continue;
      if (!order.has(n)) {
        parent.set(n, v);
        children.get(v)!.push(n);
        visit(n);
      } else if (order.get(n)! < order.get(v)! && !(closes.get(v) ?? []).includes(n)) {
        // a ring bond back to an atom written earlier
        opens.set(n, [...(opens.get(n) ?? []), v]);
        closes.set(v, [...(closes.get(v) ?? []), n]);
      }
    }
  };
  visit(start);
  const orderOf = (a: number, b: number) => g.adj[a].find((e) => e.to === b)!.order;
  const digits = new Map<string, number>();
  const used = new Set<number>();
  const digitText = (d: number) => (d < 10 ? String(d) : `%${d}`);
  const token = (v: number) => {
    const el = g.el[v], h = g.h[v];
    const sum = g.adj[v].reduce((s, e) => s + e.order, 0);
    if (el !== "H" && NORMAL_VALENCES[el] && implicitH(el, sum) === h) return el;
    return `[${el}${h ? `H${h > 1 ? h : ""}` : ""}]`;
  };
  const write = (v: number): string => {
    let s = token(v);
    for (const n of closes.get(v) ?? []) {
      const key = `${n}-${v}`;
      const d = digits.get(key)!;
      used.delete(d);
      s += digitText(d);
    }
    for (const n of (opens.get(v) ?? []).sort((a, b) => order.get(a)! - order.get(b)!)) {
      let d = 1;
      while (used.has(d)) d++;
      used.add(d);
      digits.set(`${v}-${n}`, d);
      s += BOND_SYMBOL[orderOf(v, n)] + digitText(d);
    }
    const kids = children.get(v)!;
    kids.forEach((c, i) => {
      const part = BOND_SYMBOL[orderOf(v, c)] + write(c);
      s += i < kids.length - 1 ? `(${part})` : part;
    });
    return s;
  };
  return write(start);
};

/** The canonical SMILES of one connected part: the smallest over every labelling the search over the ties finds. */
const canonicalPart = (g: Graph, nodes: number[]) => {
  const initial = rank(nodes.map((v) => {
    const orders = g.adj[v].map((e) => e.order).sort().join("");
    // terminal atoms first, so the SMILES starts at an end of the chain ("CCO", "O=C=O")
    return `${g.adj[v].length}|${g.el[v].padEnd(2, " ")}|${g.h[v]}|${orders}`;
  }));
  let budget = 5000; // leaves; beyond it (very symmetric, very large molecules) the first branch only
  let best: string | null = null;
  const search = (cls: number[]) => {
    const refined = refine(g, nodes, cls);
    const sizes = new Map<number, number>();
    refined.forEach((c) => sizes.set(c, (sizes.get(c) ?? 0) + 1));
    const tied = [...sizes.keys()].filter((c) => sizes.get(c)! > 1).sort((a, b) => a - b)[0];
    if (tied === undefined) {
      budget--;
      const s = writeSmiles(g, nodes, refined);
      if (best === null || s.length < best.length || (s.length === best.length && s < best)) best = s;
      return;
    }
    const members = refined.map((c, i) => (c === tied ? i : -1)).filter((i) => i >= 0);
    for (const [k, i] of members.entries()) {
      if (k > 0 && budget <= 0) break;
      // individualize member i: it comes first in its class
      search(refined.map((c, j) => (j === i ? 2 * c : c === tied ? 2 * c + 1 : 2 * c)));
    }
  };
  search(initial);
  return best!;
};

/** The canonical SMILES of the molecule: the same text however and in whatever order it was drawn. Parts joined by ".". */
export const canonicalSmiles = (m: Molecule) => {
  if (!m.atoms.length) return "";
  const g = heavyGraph(m);
  const seen = new Set<number>();
  const parts: string[] = [];
  for (let s = 0; s < g.el.length; s++) {
    if (seen.has(s)) continue;
    const nodes: number[] = [];
    const queue = [s];
    seen.add(s);
    while (queue.length) {
      const v = queue.shift()!;
      nodes.push(v);
      for (const e of g.adj[v]) if (!seen.has(e.to)) (seen.add(e.to), queue.push(e.to));
    }
    parts.push(canonicalPart(g, nodes));
  }
  return parts.sort().join(".");
};

/** The response: "formula:SMILES", the Hill formula and the canonical SMILES ("H2O:O", "C2H6O:CCO"); "" for nothing. */
export const canonicalKey = (m: Molecule) => (m.atoms.length ? `${hillFormula(m)}:${canonicalSmiles(m)}` : "");

/**
 * A molecule from SMILES (the subset the builder writes: B, C, N, O, P, S, F, Cl, Br, I outside brackets, bracket atoms
 * with a hydrogen count, bonds - = #, branches, ring numbers and "."), with its hydrogens as atoms and a structural
 * formula layout. Also reads "formula:SMILES". Null for anything else (aromatic atoms, charges, unknown elements).
 */
export const parseSmiles = (input: string): Molecule | null => {
  let text = String(input ?? "").trim();
  if (text.includes(":")) text = text.slice(text.indexOf(":") + 1).trim();
  if (!text) return null;
  type P = { el: ElementSymbol; h: number | null };
  const atoms: P[] = [];
  const bonds: { a: number; b: number; order: number }[] = [];
  const stack: number[] = [];
  const rings = new Map<number, { atom: number; order: number }>();
  let prev = -1;
  let order = 0;
  let i = 0;
  const addBond = (a: number, b: number, o: number) => {
    if (a === b || bonds.some((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))) return false;
    bonds.push({ a, b, order: o || 1 });
    return true;
  };
  const addAtomP = (el: ElementSymbol, h: number | null) => {
    atoms.push({ el, h });
    const id = atoms.length - 1;
    if (prev >= 0) addBond(prev, id, order);
    prev = id;
    order = 0;
  };
  while (i < text.length) {
    const c = text[i];
    if (c === "(") {
      if (prev < 0) return null;
      stack.push(prev);
      i++;
    } else if (c === ")") {
      if (!stack.length) return null;
      prev = stack.pop()!;
      i++;
    } else if (c === "-" || c === "=" || c === "#") {
      order = c === "-" ? 1 : c === "=" ? 2 : 3;
      i++;
    } else if (c === ".") {
      prev = -1;
      order = 0;
      i++;
    } else if (/[0-9%]/.test(c)) {
      let n: number;
      if (c === "%") {
        n = Number(text.slice(i + 1, i + 3));
        if (!Number.isInteger(n)) return null;
        i += 3;
      } else (n = Number(c)), i++;
      if (prev < 0) return null;
      const open = rings.get(n);
      if (open) {
        if (!addBond(open.atom, prev, order || open.order)) return null;
        rings.delete(n);
      } else rings.set(n, { atom: prev, order });
      order = 0;
    } else if (c === "[") {
      const end = text.indexOf("]", i);
      if (end < 0) return null;
      const match = /^([A-Z][a-z]?)(?:H(\d*))?$/.exec(text.slice(i + 1, end));
      if (!match || !isElement(match[1])) return null;
      const h = match[0].includes("H") && match[1] !== "H" ? (match[2] ? Number(match[2]) : 1) : 0;
      addAtomP(match[1], h);
      i = end + 1;
    } else {
      const two = text.slice(i, i + 2);
      const sym = two === "Cl" || two === "Br" ? two : c;
      if (!isElement(sym) || sym === "H" || !NORMAL_VALENCES[sym]) return null;
      addAtomP(sym, null);
      i += sym.length;
    }
  }
  if (stack.length || rings.size || !atoms.length) return null;
  // the molecule, with every hydrogen as an atom
  const out: Molecule = { atoms: atoms.map((a, k) => ({ id: k + 1, el: a.el, x: 0, y: 0 })), bonds: bonds.map((b) => ({ a: Math.min(b.a, b.b) + 1, b: Math.max(b.a, b.b) + 1, order: b.order as BondOrder })) };
  let id = atoms.length;
  atoms.forEach((a, k) => {
    const sum = bonds.filter((b) => b.a === k || b.b === k).reduce((s, b) => s + b.order, 0);
    const h = a.h ?? implicitH(a.el, sum);
    for (let n = 0; n < h; n++) {
      id++;
      out.atoms.push({ id, el: "H", x: 0, y: 0 });
      out.bonds.push({ a: k + 1, b: id, order: 1 });
    }
  });
  if (out.atoms.length > MAX_ATOMS) return null;
  return layout2d(out);
};

// --- VSEPR input: the lone pairs on each atom

/** Lone pairs: the valence electrons not in a bond, in pairs. */
export const lonePairs = (m: Molecule, id: number) => {
  const atom = atomById(m, id);
  if (!atom || atom.el === "H") return 0;
  return Math.max(0, Math.floor((ELEMENTS[atom.el].electrons - bondSum(m, id)) / 2));
};

/** Electron domains around an atom (bonded atoms and lone pairs) and the shape they give. */
export type Shape = "linear" | "bent" | "trigonal" | "pyramidal" | "tetrahedral" | "single" | "none" | "other";
export const shapeOf = (m: Molecule, id: number): Shape => {
  const n = neighbours(m, id).length;
  const lp = lonePairs(m, id);
  if (n === 0) return "none";
  if (n === 1) return "single";
  const domains = n + lp;
  if (n === 2) return domains === 2 ? "linear" : "bent";
  if (n === 3) return domains === 3 ? "trigonal" : "pyramidal";
  if (n === 4 && domains === 4) return "tetrahedral";
  return "other";
};

// --- the author's settings and the checks

export type Check =
  | { type: "molecule"; points?: number }
  | { type: "formula"; formula?: string; points?: number }
  | { type: "valence"; points?: number }
  | { type: "connected"; points?: number }
  | { type: "isomer"; formula?: string; different?: boolean; points?: number }
  | { type: "bond"; order: BondOrder; a?: ElementSymbol; b?: ElementSymbol; count?: number; points?: number };
export type CheckType = Check["type"];
export const CHECK_TYPES: CheckType[] = ["molecule", "formula", "valence", "connected", "isomer", "bond"];
export const MAX_CHECKS = 8;

export type Settings = {
  /** the elements in the palette */
  elements: ElementSymbol[];
  /** the correct molecule, as SMILES (and parsed) */
  solution: string;
  /** the checks for PCI scoring */
  checks: Check[];
};

export const DEFAULT_SETTINGS: Settings = {
  elements: ["H", "C", "N", "O"],
  solution: "O",
  checks: [{ type: "formula", points: 1 }, { type: "valence", points: 1 }, { type: "molecule", points: 1 }],
};

const parseChecks = (list: unknown): Check[] => {
  if (!Array.isArray(list)) return [];
  const out: Check[] = [];
  for (const c of list) {
    if (!c || typeof c !== "object" || !CHECK_TYPES.includes(c.type)) continue;
    const points = Number.isFinite(Number(c.points)) && c.points !== undefined && c.points !== null ? Math.max(0, Math.round(Number(c.points))) : 1;
    const base = { points };
    switch (c.type as CheckType) {
      case "formula":
      case "isomer": {
        const formula = typeof c.formula === "string" && c.formula.trim() ? normalizeFormula(c.formula) : null;
        const check: any = { type: c.type, ...(formula ? { formula } : {}), ...base };
        if (c.type === "isomer" && c.different) check.different = true;
        out.push(check);
        break;
      }
      case "bond": {
        const order = [1, 2, 3].includes(Number(c.order)) ? (Number(c.order) as BondOrder) : 1;
        const a = elementOf(c.a), b = elementOf(c.b);
        const count = Math.max(1, Math.round(Number(c.count) || 1));
        out.push({ type: "bond", order, ...(a ? { a } : {}), ...(b ? { b } : {}), count, ...base });
        break;
      }
      default:
        out.push({ type: c.type, ...base } as Check);
    }
  }
  return out.slice(0, MAX_CHECKS);
};

/** The elements of a palette setting: "H C O", "H,C,O" or a list. */
export const parseElements = (value: unknown): ElementSymbol[] => {
  const list = Array.isArray(value) ? value : String(value ?? "").split(/[\s,;]+/);
  const out: ElementSymbol[] = [];
  for (const v of list) {
    const el = elementOf(v);
    if (el && !out.includes(el)) out.push(el);
  }
  return ELEMENT_SYMBOLS.filter((e) => out.includes(e));
};

/** data-molecule: JSON from the authoring mode; empty or broken: the example (water). */
export const parseSettings = (text: unknown): Settings => {
  if (typeof text !== "string" || !text.trim()) return DEFAULT_SETTINGS;
  let v: any;
  try {
    v = JSON.parse(text);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (!v || typeof v !== "object") return DEFAULT_SETTINGS;
  const elements = v.elements === undefined ? DEFAULT_SETTINGS.elements : parseElements(v.elements);
  const parsed = typeof v.solution === "string" && v.solution.trim() ? parseSmiles(v.solution) : null;
  return {
    elements: elements.length ? elements : DEFAULT_SETTINGS.elements,
    solution: parsed ? canonicalSmiles(parsed) : "",
    checks: v.checks === undefined ? DEFAULT_SETTINGS.checks : parseChecks(v.checks),
  };
};

export const serializeSettings = (s: Settings) => JSON.stringify({ elements: s.elements.join(" "), solution: s.solution, checks: s.checks });

export const solutionOf = (s: Settings): Molecule | null => (s.solution ? parseSmiles(s.solution) : null);

export type Evaluation = { results: { check: Check; passed: boolean }[]; score: number; maxscore: number; correct: boolean };

const sameCounts = (a: Record<string, number> | null, b: Record<string, number> | null) =>
  !!a && !!b && formulaText(hillParts(a)) === formulaText(hillParts(b));

/** Every atom has exactly its valence. */
export const valencesSatisfied = (m: Molecule) => m.atoms.length > 0 && m.atoms.every((a) => freeValence(m, a.id) === 0);
export const connected = (m: Molecule) => m.atoms.length > 0 && components(m).length === 1;

export const passes = (check: Check, m: Molecule, s: Settings): boolean => {
  if (!m.atoms.length) return false;
  const solution = solutionOf(s);
  const target = (formula?: string) => (formula ? parseFormula(formula) : solution ? elementCounts(solution) : null);
  switch (check.type) {
    case "molecule":
      return !!solution && canonicalSmiles(m) === canonicalSmiles(solution);
    case "formula":
      return sameCounts(elementCounts(m), target(check.formula));
    case "valence":
      return valencesSatisfied(m);
    case "connected":
      return connected(m);
    case "isomer": {
      const ok = sameCounts(elementCounts(m), target(check.formula)) && valencesSatisfied(m) && connected(m);
      return ok && (!check.different || !solution || canonicalSmiles(m) !== canonicalSmiles(solution));
    }
    case "bond": {
      const n = m.bonds.filter((b) => {
        if (b.order !== check.order) return false;
        const x = atomById(m, b.a)!.el, y = atomById(m, b.b)!.el;
        const fits = (p: ElementSymbol | undefined, e: ElementSymbol) => !p || p === e;
        return (fits(check.a, x) && fits(check.b, y)) || (fits(check.a, y) && fits(check.b, x));
      }).length;
      return n >= (check.count ?? 1);
    }
  }
};

export const evaluate = (s: Settings, m: Molecule): Evaluation => {
  const results = s.checks.map((check) => ({ check, passed: passes(check, m, s) }));
  const points = (c: Check) => c.points ?? 1;
  const score = results.reduce((sum, r) => sum + (r.passed ? points(r.check) : 0), 0);
  const maxscore = results.reduce((sum, r) => sum + points(r.check), 0);
  return { results, score, maxscore, correct: results.length > 0 && results.every((r) => r.passed) };
};

/** What the 3D layout (geometry.ts) needs of every atom. */
export const geometryAtoms = (m: Molecule) =>
  m.atoms.map((a) => ({ id: a.id, radius: ELEMENTS[a.el].radius, lonePairs: lonePairs(m, a.id), x: a.x, y: a.y }));
