// npm test: the logic of the nets (src/net.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXAMPLES, analyze, applyTile, cleanFaces, completeCorrect, completions, cornerOf, corners, correctIds, evaluateBuild, faceAt, fold, foldsInto,
  hinges, pairIds, parsePairs, parsePuzzle, polygon, puzzleProblems, sameShapes, serializePuzzle, sortFaces, standardNet, tilesFor, turnAt, type Face,
  type Puzzle,
} from "../src/net.ts";

/** A net of unit squares from a picture: "#" is a square. */
const grid = (text: string): Face[] =>
  sortFaces(text.trim().split("\n").flatMap((line, y) => [...line.trim()].flatMap((ch, x) => (ch === "#" ? [{ x, y }] : []))));
const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);
const puzzle = (extra: Partial<Puzzle>): Puzzle => ({ ...structuredClone(EXAMPLES.build), ...extra });

test("faces: squares, rectangles and triangles on the grid", () => {
  assert.deepEqual(polygon({ x: 1, y: 2 }), [[1, 2], [2, 2], [2, 3], [1, 3]]);
  assert.deepEqual(polygon({ x: 0, y: 0, w: 2 }), [[0, 0], [2, 0], [2, 1], [0, 1]]);
  const tri = polygon({ x: 0, y: 0, base: "S" });
  assert.deepEqual(tri.slice(0, 2), [[1, 1], [0, 1]]);
  close(tri[2][1], 1 - Math.sqrt(3) / 2);
  // a triangle shares its base with the square below it, nothing else
  const h = hinges(sortFaces([{ x: 0, y: 1 }, { x: 0, y: 0, base: "S" }]));
  assert.equal(h.length, 1);
});

test("hinges: whole shared edges only; a rectangle against half an edge is cut", () => {
  assert.equal(hinges(grid("##\n##")).length, 4);
  assert.equal(hinges(sortFaces([{ x: 0, y: 0, w: 2 }, { x: 0, y: 1 }])).length, 0);
  assert.equal(hinges(sortFaces([{ x: 0, y: 0, w: 2 }, { x: 2, y: 0 }])).length, 1);
});

test("folding: a flat net at 0, the faces turn about their hinges, the printed side ends up outside", () => {
  const cross = grid(".#..\n####\n.#..");
  const flat = fold(cross, "cube", 0);
  flat.points.forEach((poly) => poly.forEach((p) => close(p[2], 0)));
  const folded = fold(cross, "cube", 1);
  // the face with the most neighbours stays put
  assert.equal(folded.parent.filter((p) => p === -1).length, 1);
  assert.equal(folded.parent[2], -1);
  // every face is at z = 0 or z = -1 or upright, inside the unit cube below the root
  for (const poly of folded.points) for (const p of poly) assert.ok(p[2] <= 1e-9 && p[2] >= -1 - 1e-9);
  // the root looks up, the face opposite it down
  close(folded.normals[2][2], 1);
  const a = analyze(cross, "cube");
  assert.equal(a.opposite[2], 4);
  close(folded.normals[4][2], -1);
  // halfway, a face hangs at 45°
  const half = fold(cross, "cube", 0.5);
  close(half.normals[1][2], Math.SQRT1_2);
});

/** Every free hexomino (polyomino of six squares), each once. */
const hexominoes = (): Face[][] => {
  const key = (cells: [number, number][]) => {
    const mx = Math.min(...cells.map((c) => c[0])), my = Math.min(...cells.map((c) => c[1]));
    return cells.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]).map((c) => c.join(",")).join(" ");
  };
  const free = (cells: [number, number][]) => {
    const forms: string[] = [];
    for (let r = 0; r < 4; r++)
      for (const flip of [false, true]) {
        forms.push(key(cells.map(([x, y]) => {
          let [a, b] = flip ? [-x, y] : [x, y];
          for (let k = 0; k < r; k++) [a, b] = [-b, a];
          return [a, b] as [number, number];
        })));
      }
    return forms.sort()[0];
  };
  let level = new Map<string, [number, number][]>([[key([[0, 0]]), [[0, 0]]]]);
  for (let n = 1; n < 6; n++) {
    const next = new Map<string, [number, number][]>();
    for (const cells of level.values())
      for (const [x, y] of cells)
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (cells.some((c) => c[0] === x + dx && c[1] === y + dy)) continue;
          const grown: [number, number][] = [...cells, [x + dx, y + dy]];
          const k = free(grown);
          if (!next.has(k)) next.set(k, grown);
        }
    level = next;
  }
  return [...level.values()].map((cells) => {
    const mx = Math.min(...cells.map((c) => c[0])), my = Math.min(...cells.map((c) => c[1]));
    return sortFaces(cells.map(([x, y]) => ({ x: x - mx, y: y - my })));
  });
};

test("exactly 11 of the 35 hexominoes fold into a cube; the others open up or overlap", () => {
  const all = hexominoes();
  assert.equal(all.length, 35);
  const folding = all.filter((n) => foldsInto(n, "cube", [1, 1, 1]));
  assert.equal(folding.length, 11);
  for (const n of all) {
    const a = analyze(n, "cube");
    if (!a.closed) assert.ok(a.gaps > 0 || a.overlaps > 0);
  }
  // the 2 × 3 block and the row of four with both flaps on one side do not
  assert.equal(foldsInto(grid("###\n###"), "cube", [1, 1, 1]), false);
  assert.equal(foldsInto(grid("##..\n####"), "cube", [1, 1, 1]), false);
  assert.equal(foldsInto(grid("#...\n####\n#..."), "cube", [1, 1, 1]), true);
  assert.equal(foldsInto(grid("######"), "cube", [1, 1, 1]), false);
});

test("nets that fall apart, have five faces or seven do not fold", () => {
  const apart = grid(".#..\n####\n....\n.#..");
  const a = analyze(apart, "cube");
  assert.equal(a.connected, false);
  assert.equal(a.closed, false);
  assert.equal(foldsInto(grid(".#..\n###.\n.#.."), "cube", [1, 1, 1]), false);
  const seven = analyze(grid(".#..\n####\n.##."), "cube");
  assert.equal(seven.closed, false);
  assert.ok(seven.overlaps > 0);
});

test("boxes: the standard net folds for every size; the wrong faces do not make the box", () => {
  for (const box of [[2, 1, 1], [3, 2, 1], [1, 2, 3], [4, 3, 2], [2, 2, 2]] as [number, number, number][]) {
    const net = standardNet("box", box);
    assert.equal(foldsInto(net, "box", box), true, `box ${box}`);
  }
  // a 2 × 1 × 1 box from its net, but a cube's net does not make it
  assert.equal(sameShapes(grid(".#..\n####\n.#.."), "box", [2, 1, 1]), false);
  assert.deepEqual(tilesFor("box", [2, 1, 1]), [{ w: 2, h: 1 }, { w: 1, h: 1 }]);
  assert.deepEqual(tilesFor("box", [2, 2, 2]), [{ w: 2, h: 2 }]);
});

test("a triangular prism and a square pyramid fold with their own angles", () => {
  assert.equal(foldsInto(standardNet("prism", [1, 1, 1]), "prism", [1, 1, 1]), true);
  assert.equal(foldsInto(standardNet("pyramid", [1, 1, 1]), "pyramid", [1, 1, 1]), true);
  // the triangles on two different squares, on opposite sides: still a prism
  const split = sortFaces([{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 0, base: "S" }, { x: 2, y: 2, base: "N" }]);
  assert.equal(foldsInto(split, "prism", [1, 1, 1]), true);
  // both triangles on the same side: they overlap
  const same = sortFaces([{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 0, base: "S" }, { x: 2, y: 0, base: "S" }]);
  const a = analyze(same, "prism");
  assert.equal(a.closed, false);
  assert.ok(a.overlaps > 0);
  // the two triangles of a prism are opposite each other
  const prism = analyze(standardNet("prism", [1, 1, 1]), "prism");
  const tris = standardNet("prism", [1, 1, 1]).map((f, i) => (f.base ? i : -1)).filter((i) => i >= 0);
  assert.equal(prism.opposite[tris[0]], tris[1]);
  // a cube net folded with the prism's angles does not close
  assert.equal(analyze(grid(".#..\n####\n.#.."), "prism").closed, false);
});

test("opposite and adjacent faces of the examples", () => {
  assert.deepEqual(correctIds(EXAMPLES.opposite), ["f4"]); // P opposite S in the staircase
  assert.deepEqual(correctIds(EXAMPLES.adjacent), ["f1", "f3", "f5", "f6"]);
  assert.deepEqual(correctIds({ ...EXAMPLES.adjacent, ask: "f3" }), ["f1", "f2", "f4", "f6"]);
  // a face of a cube touches four faces and is opposite one
  const a = analyze(EXAMPLES.adjacent.nets[0], "cube");
  a.adjacent.forEach((list, i) => {
    assert.equal(list.length, 4);
    assert.ok(!list.includes(a.opposite[i]));
  });
});

test("corners: eight for a cube, each three faces in turning order", () => {
  const a = analyze(EXAMPLES.complete.nets[0], "cube");
  const c = corners(a);
  assert.equal(c.length, 8);
  assert.deepEqual(cornerOf(a, ["f3", "f1", "f2"]), cornerOf(a, ["f1", "f2", "f3"]));
  assert.equal(cornerOf(a, ["f1", "f6", "f2"]), null); // f1 and f6 are opposite
});

test("the complete mode: the die example has one answer, and it matches the corner", () => {
  const p = EXAMPLES.complete;
  assert.deepEqual(completions(p), [{ f2: "4", f3: "2" }]);
  assert.deepEqual(correctIds(p), ["f2-4", "f3-2"]);
  assert.equal(completeCorrect(p, { f2: "4", f3: "2" }), true);
  assert.equal(completeCorrect(p, { f2: "2", f3: "4" }), false); // the mirror image of the corner
  assert.equal(completeCorrect(p, { f2: "4" }), false);
  // a blank that the corner does not show has more than one answer
  const vague = { ...p, blanks: ["f2", "f3", "f6"] };
  assert.equal(correctIds(vague), null);
  assert.deepEqual(puzzleProblems(vague).map((k) => k.key), ["notUnique"]);
});

test("the folds mode: the nets that fold are the answer", () => {
  assert.deepEqual(correctIds(EXAMPLES.folds), ["n1", "n2"]);
  assert.deepEqual(puzzleProblems(EXAMPLES.folds), []);
  assert.deepEqual(puzzleProblems({ ...EXAMPLES.folds, nets: [EXAMPLES.folds.nets[0], EXAMPLES.folds.nets[1]] }).map((k) => k.key), ["allFold"]);
});

test("every example works as it is", () => {
  for (const p of Object.values(EXAMPLES)) assert.deepEqual(puzzleProblems(p), [], p.mode);
  assert.equal(correctIds(EXAMPLES.build), null);
});

test("problems: a net that does not close, no face asked, a face without an opposite", () => {
  const open = { ...EXAMPLES.opposite, nets: [grid("######").map((f) => ({ ...f, label: "A" }))] };
  assert.deepEqual(puzzleProblems(open).map((k) => k.key), ["notClosed"]);
  assert.deepEqual(puzzleProblems({ ...EXAMPLES.opposite, ask: null }).map((k) => k.key), ["noAsk"]);
  const prism = { ...EXAMPLES.opposite, solid: "prism" as const, nets: [standardNet("prism", [1, 1, 1]).map((f, i) => ({ ...f, label: "ABCDE"[i] }))], ask: "f2" };
  const square = prism.nets[0].findIndex((f) => !f.base);
  assert.deepEqual(puzzleProblems({ ...prism, ask: `f${square + 1}` }).map((k) => k.key), ["noOpposite"]);
  assert.deepEqual(puzzleProblems({ ...EXAMPLES.build, nets: [grid("######")] }).map((k) => k.key), ["exampleDoesNotFold"]);
});

test("parsing data-puzzle: the example without it, defaults for what is missing, a round trip", () => {
  assert.deepEqual(parsePuzzle(""), EXAMPLES.build);
  assert.deepEqual(parsePuzzle("not json"), EXAMPLES.build);
  const p = parsePuzzle(JSON.stringify({ mode: "opposite" }));
  assert.deepEqual(p, EXAMPLES.opposite);
  for (const example of Object.values(EXAMPLES)) assert.deepEqual(parsePuzzle(serializePuzzle(example)), example, example.mode);
  const odd = parsePuzzle(JSON.stringify({ mode: "x", solid: "sphere", columns: 99, box: [9, 0, "a"], nets: [[{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0, label: "toolong" }]] }));
  assert.equal(odd.mode, "build");
  assert.equal(odd.solid, "cube");
  assert.equal(odd.columns, 14);
  assert.deepEqual(odd.box, [4, 1, 1]);
  assert.deepEqual(odd.nets[0], [{ x: 0, y: 0 }, { x: 1, y: 0 }]);
  assert.deepEqual(cleanFaces([{ x: 5, y: 0 }], 4, 4), []);
});

test("editing: place, remove, turn; triangles go against a square", () => {
  let faces: Face[] = [];
  let e = applyTile(faces, { w: 1, h: 1 }, false, 1, 1, 5, 5);
  assert.equal(e.result, "placed");
  faces = e.faces;
  assert.equal(applyTile(faces, "tri", false, 3, 3, 5, 5).result, "needsNeighbour");
  e = applyTile(faces, "tri", false, 1, 0, 5, 5);
  assert.deepEqual(e.face, { x: 1, y: 0, base: "S" });
  faces = e.faces;
  e = applyTile(faces, "tri", false, 2, 1, 5, 5, "W");
  assert.deepEqual(e.face, { x: 2, y: 1, base: "W" });
  faces = e.faces;
  assert.equal(applyTile(faces, { w: 2, h: 1 }, false, 4, 4, 5, 5).result, "doesNotFit");
  e = applyTile(faces, { w: 2, h: 1 }, true, 0, 2, 5, 5);
  assert.deepEqual(e.face, { x: 0, y: 2, h: 2 });
  faces = e.faces;
  e = turnAt(faces, 0, 3, 5, 5);
  assert.equal(e.result, "turned");
  assert.deepEqual(e.face, { x: 0, y: 2, w: 2 });
  faces = e.faces;
  assert.equal(faceAt(faces, 1, 2) >= 0, true);
  e = applyTile(faces, { w: 1, h: 1 }, false, 1, 0, 5, 5);
  assert.equal(e.result, "removed");
  assert.equal(e.faces.length, faces.length - 1);
});

test("the build record: correct for a net of the solid, with gaps and overlap when not", () => {
  const p = puzzle({});
  const good = evaluateBuild(p, grid("##..\n.###\n.#.."));
  assert.deepEqual({ ...good, net: undefined }, { score: 1, maxscore: 1, correct: true, closed: true, overlap: false, gaps: 0, faces: 6, net: undefined });
  const bad = evaluateBuild(p, grid("####\n##.."));
  assert.equal(bad.correct, false);
  assert.equal(bad.overlap, true);
  const open = evaluateBuild(p, grid("###"));
  assert.equal(open.gaps, 8);
  assert.equal(JSON.parse(open.net).length, 3);
});

test("pairs of the complete mode as identifiers", () => {
  assert.deepEqual(pairIds({ f10: "B", f2: "A", f3: "" }), ["f2-A", "f10-B"]);
  assert.deepEqual(parsePairs(["f2-A", "f10-blue", "nonsense"]), { f2: "A", f10: "blue" });
});
