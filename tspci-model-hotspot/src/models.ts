// The built-in models, as data and without imports (tested in node: test/models.test.ts). Every model is schematic:
// simple shapes (spheres, cylinders, boxes, rings, tubes) that scene3d.ts turns into meshes. Every part has an
// identifier (the response), a name in English and Dutch, a colour, and the direction it moves when the model is
// exploded. One part may have several pieces (five petals are one part "petal").

export type Vec3 = [number, number, number];
export type Text2 = { en: string; nl: string };

/** The shapes; `at`, `turn` (Euler angles, order YXZ, radians) and `scale` of the piece place them, except a rod and a path. */
export type Shape =
  /** a sphere around its centre; `theta` [start, length] cuts a cap or band off around the y axis (the pole is +y) */
  | { kind: "sphere"; r: number; theta?: [number, number] }
  /** a cylinder along y, centred; `r2` the radius of the top (a cone or a truncated cone) */
  | { kind: "cylinder"; r: number; r2?: number; h: number }
  | { kind: "capsule"; r: number; length: number }
  | { kind: "box"; size: Vec3 }
  /** a torus in the xy plane (axis z) */
  | { kind: "torus"; r: number; tube: number }
  /** a flat ring (washer) around the y axis */
  | { kind: "ring"; inner: number; outer: number; thick: number }
  /** a cylinder from one point to another */
  | { kind: "rod"; from: Vec3; to: Vec3; r: number }
  /** a tube through points (a smooth curve) */
  | { kind: "path"; points: Vec3[]; r: number; closed?: boolean };

export type Piece = { shape: Shape; at?: Vec3; turn?: Vec3; scale?: Vec3 };

export type PartDef = {
  id: string;
  name: Text2;
  color: string;
  pieces: Piece[];
  /** where the part goes when the model is fully exploded */
  explode: Vec3;
  /** below 1: see-through */
  opacity?: number;
  /** a volume with other parts inside (the vitreous body, the cytoplasm): a click goes to the part inside it */
  volume?: boolean;
};

export type ModelId = "eye" | "flower" | "cell" | "bike";

export type ModelDef = {
  id: ModelId;
  name: Text2;
  parts: PartDef[];
  /** the side the cut-away removes: points with dot(p, cut) above the cut are not drawn */
  cut: Vec3;
  /** the first turn of the model (Euler x, y, order YXZ), so the interesting side faces the candidate */
  view: [number, number];
  /** the example question per mode, and its correct part (click mode) */
  prompt: { click: Text2; label: Text2 };
  correct: string[];
};

export const MODEL_IDS: ModelId[] = ["eye", "flower", "cell", "bike"];

const PI = Math.PI;
const FRONT: Vec3 = [PI / 2, 0, 0]; // turns the y axis of a shape to +z (towards the candidate)

/** n copies of a piece around the y axis: `make(angle)` gives the piece for one angle (radians). */
const around = (n: number, offset: number, make: (a: number) => Piece): Piece[] =>
  Array.from({ length: n }, (_, i) => make(offset + (i * 2 * PI) / n));
/** a point at distance r from the y axis in the direction of angle a, at height y */
const radial = (a: number, r: number, y: number): Vec3 => [Math.sin(a) * r, y, Math.cos(a) * r];

/** a box with an open top: the bottom and four walls, their inner faces at ±hx, -hy, ±hz, up to height top */
const openBox = (hx: number, hy: number, hz: number, t: number, top: number): Piece[] => {
  const h = top + hy + t, cy = (top - hy - t) / 2;
  return [
    { shape: { kind: "box", size: [2 * (hx + t), t, 2 * (hz + t)] }, at: [0, -hy - t / 2, 0] },
    { shape: { kind: "box", size: [t, h, 2 * (hz + t)] }, at: [-hx - t / 2, cy, 0] },
    { shape: { kind: "box", size: [t, h, 2 * (hz + t)] }, at: [hx + t / 2, cy, 0] },
    { shape: { kind: "box", size: [2 * hx, h, t] }, at: [0, cy, -hz - t / 2] },
    { shape: { kind: "box", size: [2 * hx, h, t] }, at: [0, cy, hz + t / 2] },
  ];
};

// ---------------------------------------------------------------------------------------------------------------- eye

const EYE: ModelDef = {
  id: "eye",
  name: { en: "Eye", nl: "Oog" },
  cut: [-1, 0, 0],
  view: [0.15, 0.75],
  prompt: {
    click: {
      en: "Which part of the eye changes shape to focus on things near by or far away? Click that part.",
      nl: "Welk deel van het oog verandert van vorm om scherp te stellen op iets dichtbij of veraf? Klik dat deel aan.",
    },
    label: { en: "Put the names on the right parts of the eye.", nl: "Zet de namen bij de juiste delen van het oog." },
  },
  correct: ["lens"],
  parts: [
    {
      id: "cornea", name: { en: "Cornea", nl: "Hoornvlies" }, color: "#9fd3ee", opacity: 0.35, explode: [0, 0, 1.1],
      pieces: [{ shape: { kind: "sphere", r: 0.45, theta: [0, 0.9] }, at: [0, 0, 0.656], turn: FRONT }],
    },
    {
      id: "iris", name: { en: "Iris", nl: "Regenboogvlies (iris)" }, color: "#3f7fbf", explode: [0, 0, 0.7],
      pieces: [{ shape: { kind: "ring", inner: 0.13, outer: 0.36, thick: 0.02 }, at: [0, 0, 0.88], turn: FRONT }],
    },
    {
      // the pupil is the opening in the iris: dark, but the lens can be seen (and clicked) through it
      id: "pupil", name: { en: "Pupil", nl: "Pupil" }, color: "#101010", opacity: 0.75, explode: [0, 0, 0.85],
      pieces: [{ shape: { kind: "cylinder", r: 0.13, h: 0.012 }, at: [0, 0, 0.88], turn: FRONT }],
    },
    {
      id: "lens", name: { en: "Lens", nl: "Ooglens" }, color: "#f2dc8c", opacity: 0.9, explode: [0, 0, 0.45],
      pieces: [{ shape: { kind: "sphere", r: 0.32 }, at: [0, 0, 0.7], scale: [1, 1, 0.5] }],
    },
    {
      id: "vitreous", name: { en: "Vitreous body", nl: "Glasachtig lichaam" }, color: "#8fc9e6", opacity: 0.28, volume: true, explode: [0, 0, 0],
      pieces: [{ shape: { kind: "sphere", r: 0.9 }, at: [0, 0, -0.15], scale: [1, 1, 0.78] }],
    },
    {
      id: "retina", name: { en: "Retina", nl: "Netvlies" }, color: "#df7a62", explode: [0, 0, -0.25],
      pieces: [{ shape: { kind: "sphere", r: 0.955, theta: [1.05, PI - 1.05] }, turn: FRONT }],
    },
    {
      id: "sclera", name: { en: "Sclera", nl: "Harde oogrok" }, color: "#f1ece2", explode: [0, 0, -0.5],
      pieces: [{ shape: { kind: "sphere", r: 1, theta: [0.36, PI - 0.36] }, turn: FRONT }],
    },
    {
      id: "opticNerve", name: { en: "Optic nerve", nl: "Oogzenuw" }, color: "#f0b35e", explode: [0, 0, -0.9],
      pieces: [{ shape: { kind: "cylinder", r: 0.15, h: 0.8 }, at: [0.15, 0, -1.28], turn: FRONT }],
    },
  ],
};

// ------------------------------------------------------------------------------------------------------------- flower

const FILAMENT_TILT = 0.32;
const FILAMENT_LENGTH = 0.55;
const filamentBase = (a: number) => radial(a, 0.08, 0.08);
const filamentTip = (a: number): Vec3 => {
  const b = filamentBase(a);
  return [b[0] + Math.sin(a) * Math.sin(FILAMENT_TILT) * FILAMENT_LENGTH, b[1] + Math.cos(FILAMENT_TILT) * FILAMENT_LENGTH, b[2] + Math.cos(a) * Math.sin(FILAMENT_TILT) * FILAMENT_LENGTH];
};

const FLOWER: ModelDef = {
  id: "flower",
  name: { en: "Flower", nl: "Bloem" },
  cut: [1, 0, 0],
  view: [0.55, 0.3],
  prompt: {
    click: { en: "In which part of the flower is pollen made? Click that part.", nl: "In welk deel van de bloem wordt stuifmeel gemaakt? Klik dat deel aan." },
    label: { en: "Put the names on the right parts of the flower.", nl: "Zet de namen bij de juiste delen van de bloem." },
  },
  correct: ["anther"],
  parts: [
    {
      id: "petal", name: { en: "Petal", nl: "Kroonblad" }, color: "#e8608f", explode: [0, -0.15, 0],
      pieces: around(5, PI / 5, (a) => ({ shape: { kind: "sphere", r: 0.5 }, at: radial(a, 0.52, 0.12), turn: [-0.35, a, 0], scale: [0.55, 0.06, 1] })),
    },
    {
      id: "sepal", name: { en: "Sepal", nl: "Kelkblad" }, color: "#3d8b3d", explode: [0, -0.45, 0],
      pieces: around(5, 0, (a) => ({ shape: { kind: "sphere", r: 0.34 }, at: radial(a, 0.3, -0.02), turn: [0.45, a, 0], scale: [0.42, 0.05, 1] })),
    },
    {
      id: "filament", name: { en: "Filament", nl: "Helmdraad" }, color: "#e9e1b0", explode: [0, 0.25, 0],
      pieces: around(5, PI / 5, (a) => ({ shape: { kind: "rod", from: filamentBase(a), to: filamentTip(a), r: 0.016 } })),
    },
    {
      id: "anther", name: { en: "Anther", nl: "Helmknop" }, color: "#f2c230", explode: [0, 0.4, 0],
      pieces: around(5, PI / 5, (a) => ({ shape: { kind: "sphere", r: 0.06 }, at: filamentTip(a), turn: [FILAMENT_TILT, a, 0], scale: [0.75, 1.5, 0.75] })),
    },
    {
      id: "stigma", name: { en: "Stigma", nl: "Stempel" }, color: "#a8572b", explode: [0, 0.85, 0],
      pieces: [{ shape: { kind: "sphere", r: 0.07 }, at: [0, 0.74, 0], scale: [1.3, 0.6, 1.3] }],
    },
    {
      id: "style", name: { en: "Style", nl: "Stijl" }, color: "#c9de7d", explode: [0, 0.65, 0],
      pieces: [{ shape: { kind: "cylinder", r: 0.026, h: 0.46 }, at: [0, 0.48, 0] }],
    },
    {
      id: "ovary", name: { en: "Ovary", nl: "Vruchtbeginsel" }, color: "#8dbb3c", explode: [0, 0.45, 0],
      pieces: [{ shape: { kind: "sphere", r: 0.14 }, at: [0, 0.16, 0], scale: [1, 1.2, 1] }],
    },
    {
      id: "receptacle", name: { en: "Receptacle", nl: "Bloembodem" }, color: "#5f9e45", explode: [0, -0.3, 0],
      pieces: [{ shape: { kind: "sphere", r: 0.18 }, scale: [1, 0.55, 1] }],
    },
    {
      id: "stem", name: { en: "Stem", nl: "Steel" }, color: "#4a8a35", explode: [0, -0.6, 0],
      pieces: [{ shape: { kind: "cylinder", r: 0.055, h: 1.5 }, at: [0, -0.8, 0] }],
    },
  ],
};

// ---------------------------------------------------------------------------------------------------------- plant cell

const CELL: ModelDef = {
  id: "cell",
  name: { en: "Plant cell", nl: "Plantencel" },
  cut: [0, 0, 1],
  view: [0.6, -0.4],
  prompt: {
    click: {
      en: "In which part of the plant cell does photosynthesis take place? Click that part.",
      nl: "In welk deel van de plantencel vindt fotosynthese plaats? Klik dat deel aan.",
    },
    label: { en: "Put the names on the right parts of the plant cell.", nl: "Zet de namen bij de juiste delen van de plantencel." },
  },
  correct: ["chloroplast"],
  parts: [
    { id: "cellWall", name: { en: "Cell wall", nl: "Celwand" }, color: "#7d9a3a", explode: [0, -0.7, 0], pieces: openBox(1.1, 0.47, 0.7, 0.08, 0.35) },
    { id: "membrane", name: { en: "Cell membrane", nl: "Celmembraan" }, color: "#e9b949", explode: [0, -0.35, 0], pieces: openBox(1.07, 0.44, 0.67, 0.025, 0.33) },
    {
      id: "cytoplasm", name: { en: "Cytoplasm", nl: "Cytoplasma" }, color: "#a9dcb8", opacity: 0.22, volume: true, explode: [0, 0, 0],
      pieces: [{ shape: { kind: "box", size: [2.12, 0.74, 1.32] }, at: [0, -0.07, 0] }],
    },
    {
      id: "vacuole", name: { en: "Vacuole", nl: "Vacuole" }, color: "#6fb0e6", opacity: 0.8, explode: [0.2, 0.55, 0],
      pieces: [{ shape: { kind: "sphere", r: 0.5 }, at: [0.35, -0.1, 0], scale: [1.25, 0.6, 0.88] }],
    },
    {
      id: "nucleus", name: { en: "Nucleus", nl: "Celkern" }, color: "#8a5cc7", explode: [-0.3, 0.7, 0],
      pieces: [{ shape: { kind: "sphere", r: 0.24 }, at: [-0.68, -0.05, 0.18] }],
    },
    {
      id: "chloroplast", name: { en: "Chloroplast", nl: "Bladgroenkorrel" }, color: "#2f8f3f", explode: [0, 0.9, 0],
      pieces: ([[-0.85, -0.2, -0.42], [-0.45, 0.1, -0.5], [0.1, -0.25, 0.56], [0.62, 0.08, 0.56], [0.78, -0.28, -0.55], [-0.3, -0.3, 0.42]] as Vec3[]).map(
        (at, i) => ({ shape: { kind: "sphere", r: 0.1 }, at, turn: [0, i * 0.9, 0.2], scale: [1.7, 0.6, 1] })
      ),
    },
    {
      id: "mitochondrion", name: { en: "Mitochondrion", nl: "Mitochondrion" }, color: "#e07b39", explode: [0, 1.1, 0],
      pieces: ([[-0.95, 0.14, 0.42], [-0.05, 0.16, -0.5], [0.95, 0.15, 0.05]] as Vec3[]).map((at, i) => ({ shape: { kind: "capsule", r: 0.05, length: 0.14 }, at, turn: [PI / 2, i * 1.2, 0] })),
    },
  ],
};

// ------------------------------------------------------------------------------------------------------------- bicycle

const REAR: Vec3 = [-1.02, 0, 0];
const FRONT_HUB: Vec3 = [1.05, 0, 0];
const BB: Vec3 = [0, -0.05, 0];
const SEAT_TOP: Vec3 = [-0.22, 0.78, 0];
const HEAD_TOP: Vec3 = [0.82, 0.82, 0];
const HEAD_BOTTOM: Vec3 = [0.88, 0.6, 0];
const z = (p: Vec3, dz: number): Vec3 => [p[0], p[1], p[2] + dz];
const wheel = (hub: Vec3): Piece[] => [
  { shape: { kind: "torus", r: 0.62, tube: 0.045 }, at: hub },
  { shape: { kind: "cylinder", r: 0.04, h: 0.16 }, at: hub, turn: FRONT },
  ...Array.from({ length: 12 }, (_, i): Piece => {
    const a = (i * PI) / 6, side = i % 2 ? 0.05 : -0.05;
    return { shape: { kind: "rod", from: z(hub, side), to: [hub[0] + Math.cos(a) * 0.59, hub[1] + Math.sin(a) * 0.59, 0], r: 0.007 } };
  }),
];
const CHAIN_Z = 0.1;
const chainPath = (): Vec3[] => {
  // around the chain ring (r 0.2 at the bottom bracket) and the sprocket (r 0.09 at the rear hub)
  const ring = Array.from({ length: 9 }, (_, i): Vec3 => { const a = -PI / 2 + (i * PI) / 8; return [BB[0] + Math.cos(a) * 0.205, BB[1] + Math.sin(a) * 0.205, CHAIN_Z]; });
  const sprocket = Array.from({ length: 7 }, (_, i): Vec3 => { const a = PI / 2 + (i * PI) / 6; return [REAR[0] + Math.cos(a) * 0.095, REAR[1] + Math.sin(a) * 0.095, CHAIN_Z]; });
  return [...ring, ...sprocket];
};

const BIKE: ModelDef = {
  id: "bike",
  name: { en: "Bicycle", nl: "Fiets" },
  cut: [0, 0, 1],
  view: [0.12, -0.45],
  prompt: {
    click: { en: "Which part of the bicycle passes the force of the pedals on to the rear wheel? Click that part.", nl: "Welk deel van de fiets brengt de kracht van de trappers over op het achterwiel? Klik dat deel aan." },
    label: { en: "Put the names on the right parts of the bicycle.", nl: "Zet de namen bij de juiste delen van de fiets." },
  },
  correct: ["chain"],
  parts: [
    {
      id: "frame", name: { en: "Frame", nl: "Frame" }, color: "#1f5aa6", explode: [0, 0, 0],
      pieces: [
        { shape: { kind: "rod", from: BB, to: SEAT_TOP, r: 0.032 } },
        { shape: { kind: "rod", from: SEAT_TOP, to: HEAD_TOP, r: 0.03 } },
        { shape: { kind: "rod", from: BB, to: HEAD_BOTTOM, r: 0.036 } },
        { shape: { kind: "rod", from: HEAD_TOP, to: HEAD_BOTTOM, r: 0.04 } },
        { shape: { kind: "rod", from: z(BB, 0.05), to: z(REAR, 0.06), r: 0.02 } },
        { shape: { kind: "rod", from: z(BB, -0.05), to: z(REAR, -0.06), r: 0.02 } },
        { shape: { kind: "rod", from: z(SEAT_TOP, 0.03), to: z(REAR, 0.06), r: 0.018 } },
        { shape: { kind: "rod", from: z(SEAT_TOP, -0.03), to: z(REAR, -0.06), r: 0.018 } },
      ],
    },
    { id: "frontWheel", name: { en: "Front wheel", nl: "Voorwiel" }, color: "#2b2b2b", explode: [0.75, 0, 0], pieces: wheel(FRONT_HUB) },
    { id: "rearWheel", name: { en: "Rear wheel", nl: "Achterwiel" }, color: "#2b2b2b", explode: [-0.75, 0, 0], pieces: wheel(REAR) },
    {
      id: "fork", name: { en: "Front fork", nl: "Voorvork" }, color: "#6d7f99", explode: [0.4, 0.15, 0],
      pieces: [
        { shape: { kind: "rod", from: z(HEAD_BOTTOM, 0.04), to: z(FRONT_HUB, 0.07), r: 0.02 } },
        { shape: { kind: "rod", from: z(HEAD_BOTTOM, -0.04), to: z(FRONT_HUB, -0.07), r: 0.02 } },
      ],
    },
    {
      id: "handlebar", name: { en: "Handlebar", nl: "Stuur" }, color: "#9a9a9a", explode: [0.35, 0.45, 0],
      pieces: [
        { shape: { kind: "rod", from: HEAD_TOP, to: [0.76, 1.0, 0], r: 0.022 } },
        { shape: { kind: "path", points: [[0.66, 1.02, -0.34], [0.74, 1.0, -0.18], [0.76, 1.0, 0], [0.74, 1.0, 0.18], [0.66, 1.02, 0.34]], r: 0.02 } },
        { shape: { kind: "cylinder", r: 0.03, h: 0.12 }, at: [0.66, 1.02, -0.36], turn: FRONT },
        { shape: { kind: "cylinder", r: 0.03, h: 0.12 }, at: [0.66, 1.02, 0.36], turn: FRONT },
      ],
    },
    {
      id: "saddle", name: { en: "Saddle", nl: "Zadel" }, color: "#3a3a3a", explode: [-0.1, 0.5, 0],
      pieces: [
        { shape: { kind: "rod", from: SEAT_TOP, to: [-0.26, 0.93, 0], r: 0.018 } },
        { shape: { kind: "sphere", r: 0.2 }, at: [-0.27, 0.96, 0], scale: [1.1, 0.25, 0.5] },
      ],
    },
    {
      id: "pedals", name: { en: "Pedals and cranks", nl: "Trappers en cranks" }, color: "#7a7a7a", explode: [0, -0.35, 0.55],
      pieces: [
        { shape: { kind: "rod", from: z(BB, 0.14), to: [0.08, -0.29, 0.14], r: 0.018 } },
        { shape: { kind: "rod", from: z(BB, -0.14), to: [-0.08, 0.19, -0.14], r: 0.018 } },
        { shape: { kind: "box", size: [0.14, 0.03, 0.1] }, at: [0.08, -0.29, 0.21] },
        { shape: { kind: "box", size: [0.14, 0.03, 0.1] }, at: [-0.08, 0.19, -0.21] },
        { shape: { kind: "cylinder", r: 0.03, h: 0.3 }, at: BB, turn: FRONT },
      ],
    },
    {
      id: "chainring", name: { en: "Chainring", nl: "Kettingblad" }, color: "#b8b8b8", explode: [0, 0, 0.45],
      pieces: [{ shape: { kind: "torus", r: 0.19, tube: 0.022 }, at: z(BB, CHAIN_Z) }, { shape: { kind: "cylinder", r: 0.17, h: 0.008 }, at: z(BB, CHAIN_Z), turn: FRONT }],
    },
    {
      id: "chain", name: { en: "Chain", nl: "Ketting" }, color: "#565656", explode: [0, 0, 0.7],
      pieces: [{ shape: { kind: "path", points: chainPath(), r: 0.012, closed: true } }],
    },
    {
      id: "sprocket", name: { en: "Rear sprocket", nl: "Achtertandwiel" }, color: "#c9a227", explode: [-0.75, 0, 0.45],
      pieces: [{ shape: { kind: "cylinder", r: 0.085, h: 0.025 }, at: z(REAR, CHAIN_Z), turn: FRONT }],
    },
  ],
};

export const MODELS: Record<ModelId, ModelDef> = { eye: EYE, flower: FLOWER, cell: CELL, bike: BIKE };

export const modelOf = (id: unknown): ModelDef =>
  MODELS[MODEL_IDS.find((m) => m.toLowerCase() === String(id ?? "").trim().toLowerCase()) ?? "eye"];

/** A part identifier for a glTF mesh name: a QTI identifier (a letter or _ first; letters, digits, _ - . after). */
export const partIdOf = (name: string): string => {
  const clean = String(name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "");
  if (!clean) return "";
  return /^[A-Za-z_]/.test(clean) ? clean : `_${clean}`;
};
