// npm test: the built-in models (src/models.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MODELS, MODEL_IDS, modelOf, partIdOf, type Piece, type Vec3 } from "../src/models.ts";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

/** A rough centre of a piece (rods and paths have their own points). */
const centre = (piece: Piece): Vec3 => {
  const s = piece.shape;
  if (s.kind === "rod") return [(s.from[0] + s.to[0]) / 2, (s.from[1] + s.to[1]) / 2, (s.from[2] + s.to[2]) / 2];
  if (s.kind === "path") return s.points.reduce((a, p) => [a[0] + p[0] / s.points.length, a[1] + p[1] / s.points.length, a[2] + p[2] / s.points.length], [0, 0, 0] as Vec3);
  return piece.at ?? [0, 0, 0];
};

test("four models, each with named parts and unique identifiers", () => {
  assert.deepEqual(MODEL_IDS, ["eye", "flower", "cell", "bike"]);
  for (const id of MODEL_IDS) {
    const model = MODELS[id];
    assert.equal(model.id, id);
    assert.ok(model.parts.length >= 6, `${id}: at least 6 parts`);
    const ids = model.parts.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length, `${id}: unique part ids`);
    for (const p of model.parts) {
      assert.match(p.id, IDENTIFIER, `${id}/${p.id}: a QTI identifier`);
      assert.ok(p.name.en && p.name.nl, `${id}/${p.id}: an English and a Dutch name`);
      assert.match(p.color, /^#[0-9a-f]{6}$/i);
      assert.ok(p.pieces.length > 0, `${id}/${p.id}: at least one piece`);
      assert.equal(p.explode.length, 3);
    }
    for (const c of model.correct) assert.ok(ids.includes(c), `${id}: the example answer ${c} is a part`);
    assert.ok(model.prompt.click.en && model.prompt.click.nl && model.prompt.label.en && model.prompt.label.nl);
    assert.equal(Math.hypot(...model.cut), 1, `${id}: the cut direction is a unit vector`);
  }
});

test("the parts the brief asks for are there", () => {
  const ids = (m: keyof typeof MODELS) => MODELS[m].parts.map((p) => p.id);
  for (const p of ["cornea", "iris", "pupil", "lens", "retina", "opticNerve", "vitreous"]) assert.ok(ids("eye").includes(p), p);
  for (const p of ["petal", "sepal", "filament", "anther", "style", "stigma", "ovary"]) assert.ok(ids("flower").includes(p), p);
  for (const p of ["cellWall", "membrane", "nucleus", "vacuole", "chloroplast", "cytoplasm"]) assert.ok(ids("cell").includes(p), p);
  for (const p of ["frame", "frontWheel", "rearWheel", "chain", "pedals", "handlebar", "saddle"]) assert.ok(ids("bike").includes(p), p);
});

test("every piece lies within a few units of the centre (the camera fits the model)", () => {
  for (const id of MODEL_IDS) {
    for (const part of MODELS[id].parts) {
      for (const piece of part.pieces) {
        const c = centre(piece);
        assert.ok(c.every(Number.isFinite), `${id}/${part.id}: finite`);
        assert.ok(Math.hypot(...c) < 2.2, `${id}/${part.id}: within 2.2 (${c.map((v) => v.toFixed(2))})`);
      }
    }
  }
});

test("the eye: the lens sits behind the pupil and in front of the vitreous body; the nerve at the back", () => {
  const eye = MODELS.eye;
  const z = (id: string) => centre(eye.parts.find((p) => p.id === id)!.pieces[0])[2];
  // the cornea is a cap of a sphere of 0.45 around its centre: its top is in front of the pupil
  assert.ok(z("cornea") + 0.45 > z("pupil") && z("pupil") > z("lens") && z("lens") > z("vitreous") && z("opticNerve") < -1);
  // the volume and the see-through parts
  assert.equal(eye.parts.find((p) => p.id === "vitreous")!.volume, true);
  assert.ok(eye.parts.find((p) => p.id === "cornea")!.opacity! < 0.5);
});

test("the flower: five petals, sepals, filaments and anthers; each anther at the tip of its filament", () => {
  const f = (id: string) => MODELS.flower.parts.find((p) => p.id === id)!;
  for (const id of ["petal", "sepal", "filament", "anther"]) assert.equal(f(id).pieces.length, 5, id);
  f("filament").pieces.forEach((piece, i) => {
    const s = piece.shape;
    assert.equal(s.kind, "rod");
    if (s.kind === "rod") assert.deepEqual(f("anther").pieces[i].at, s.to);
  });
});

test("the cell: the organelles lie inside the cytoplasm", () => {
  const cell = MODELS.cell;
  const box = cell.parts.find((p) => p.id === "cytoplasm")!.pieces[0];
  assert.equal(box.shape.kind, "box");
  if (box.shape.kind !== "box") return;
  const [w, h, d] = box.shape.size, [cx, cy, cz] = box.at!;
  for (const id of ["nucleus", "vacuole", "chloroplast", "mitochondrion"]) {
    for (const piece of cell.parts.find((p) => p.id === id)!.pieces) {
      const [x, y, zz] = centre(piece);
      assert.ok(Math.abs(x - cx) < w / 2 && Math.abs(y - cy) < h / 2 && Math.abs(zz - cz) < d / 2, `${id} inside`);
    }
  }
});

test("modelOf: case-insensitive, the eye for anything else", () => {
  assert.equal(modelOf("Flower").id, "flower");
  assert.equal(modelOf(" CELL ").id, "cell");
  assert.equal(modelOf("heart").id, "eye");
  assert.equal(modelOf(undefined).id, "eye");
});

test("partIdOf: a glTF mesh name as a QTI identifier", () => {
  assert.equal(partIdOf("Left ventricle"), "Left_ventricle");
  assert.equal(partIdOf("Aorta.001"), "Aorta.001");
  assert.equal(partIdOf("2nd gear"), "_2nd_gear");
  assert.equal(partIdOf("Pétale"), "Petale");
  assert.equal(partIdOf("  "), "");
});
