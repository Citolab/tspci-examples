// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Trainpci and
// https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Relatempci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The motion, computed: a vehicle rolls to the right without slipping; every point has a position in the ground frame
// at time t, and in a frame that moves with velocity vF it is that position minus vF·t. Units: the wheel radius is 1
// and the vehicle covers 1 per second (so the wheel turns 1 radian per second). y points down (as in SVG): the
// ground is y = 0. No imports: `npm test` runs it in node.

export const SCENES = ["train", "motorbike"] as const;
export type Scene = (typeof SCENES)[number];
/** rim: a point on the rim of the rear wheel; hub: its axle; passenger: in or on the vehicle; bystander: at rest on the ground; second: the second observer. */
export const POINTS = ["rim", "hub", "passenger", "bystander", "second"] as const;
export type PointId = (typeof POINTS)[number];
/** The frames, named after their observer: the ground (the bystander), the vehicle (the passenger), the second observer. */
export const FRAMES = ["ground", "vehicle", "second"] as const;
export type FrameId = (typeof FRAMES)[number];
/** What a trajectory looks like: rest (a point), line, circle, cycloid (arches), loops (a looped trochoid), wave (a wavy line). */
export const SHAPES = ["rest", "line", "circle", "cycloid", "loops", "wave"] as const;
export type Shape = (typeof SHAPES)[number];

export type Vec = [number, number];

/** The vehicle of a scene, in wheel radii: its length and height, the rear wheel (the tracked one), the passenger. */
export type Geometry = {
  length: number;
  height: number;
  wheels: number[];
  /** x of the rear wheel's axle, from the back of the vehicle */
  tracked: number;
  passenger: Vec;
  /** the height of the bystander's (behind the track) and the second observer's (in front of it) tracked point, their head, and their baseline */
  bystanderHead: number;
  bystanderBase: number;
  secondHead: number;
  secondBase: number;
  secondLength: number;
};

export const GEOMETRY: Record<Scene, Geometry> = {
  train: {
    length: 9,
    height: 5.2,
    wheels: [1.6, 7.4],
    tracked: 1.6,
    passenger: [4.5, -3.5],
    bystanderHead: -2.3,
    bystanderBase: -0.9,
    secondHead: 0.65,
    secondBase: 2.3,
    secondLength: 4,
  },
  motorbike: {
    length: 4.6,
    height: 4,
    wheels: [1, 3.6],
    tracked: 1,
    passenger: [2.1, -3.6],
    bystanderHead: -2.9,
    bystanderBase: -0.7,
    secondHead: 0.4,
    secondBase: 2.6,
    secondLength: 2.4,
  },
};

/** One turn of the wheel takes 2π s (at 1×). */
export const TURN = 2 * Math.PI;
/** A step of the step buttons: a sixteenth of a turn. */
export const STEP = TURN / 16;

export type Motion = {
  scene: Scene;
  /** how many turns of the wheel the run lasts */
  turns: number;
  /** the second observer's velocity, as a multiple of the vehicle's (negative: the other way) */
  secondSpeed: number;
};

export const duration = (m: Pick<Motion, "turns">) => m.turns * TURN;

/** The velocity of a frame. */
export const frameVelocity = (frame: FrameId, m: Motion) => (frame === "ground" ? 0 : frame === "vehicle" ? 1 : m.secondSpeed);

/** Where the bystander stands and where the second observer starts: in the middle of the run, so that they stay in view. */
export const bystanderX = (m: Motion) => (duration(m) + GEOMETRY[m.scene].length) / 2;
export const secondStart = (m: Motion) =>
  (duration(m) + GEOMETRY[m.scene].length) / 2 - (m.secondSpeed * duration(m)) / 2 - GEOMETRY[m.scene].secondLength / 2;

/** The back of the vehicle at time t, in the ground frame. */
export const vehicleX = (t: number) => t;
/** The angle the wheels turned (clockwise, radians). */
export const wheelAngle = (t: number) => t;

/** A point's position in the ground frame at time t. The rim point starts at the bottom of the wheel, on the ground. */
export const groundPosition = (point: PointId, t: number, m: Motion): Vec => {
  const g = GEOMETRY[m.scene];
  switch (point) {
    case "rim":
      return [g.tracked + t - Math.sin(t), -1 + Math.cos(t)];
    case "hub":
      return [g.tracked + t, -1];
    case "passenger":
      return [g.passenger[0] + t, g.passenger[1]];
    case "bystander":
      return [bystanderX(m), g.bystanderHead];
    case "second":
      return [secondStart(m) + g.secondLength / 2 + m.secondSpeed * t, g.secondHead];
  }
};

/** A point's position in a frame at time t (the frame's origin is where the ground frame's is at t = 0). */
export const positionIn = (point: PointId, frame: FrameId, t: number, m: Motion): Vec => {
  const [x, y] = groundPosition(point, t, m);
  return [x - frameVelocity(frame, m) * t, y];
};

/** The trajectory of a point in a frame from 0 to t: enough points for a smooth curve (96 per turn). */
export const trajectory = (point: PointId, frame: FrameId, t: number, m: Motion): Vec[] => {
  const n = Math.max(1, Math.ceil((Math.max(0, t) / TURN) * 96));
  return Array.from({ length: n + 1 }, (_, i) => positionIn(point, frame, (i / n) * Math.max(0, t), m));
};

const EPS = 1e-6;

/** The velocity of a point's "carrier" in the ground frame: what it moves with (the rim also turns). */
const carrierVelocity = (point: PointId, m: Motion) =>
  point === "bystander" ? 0 : point === "second" ? m.secondSpeed : 1;

/**
 * The shape of a point's trajectory in a frame. A point that moves with the frame is at rest; any other point but the
 * rim moves in a straight line. The rim turns around the axle at speed 1 while the axle moves at u = 1 − vF: u = 0 a
 * circle, |u| = 1 a cycloid (arches with cusps on the ground), |u| < 1 loops, |u| > 1 a wavy line.
 */
export const shapeOf = (point: PointId, frame: FrameId, m: Motion): Shape => {
  const u = carrierVelocity(point, m) - frameVelocity(frame, m);
  if (point !== "rim") return Math.abs(u) < EPS ? "rest" : "line";
  if (Math.abs(u) < EPS) return "circle";
  if (Math.abs(Math.abs(u) - 1) < EPS) return "cycloid";
  return Math.abs(u) < 1 ? "loops" : "wave";
};

/** Whether a point moves relative to the observer of a frame. */
export const movesIn = (point: PointId, frame: FrameId, m: Motion) => shapeOf(point, frame, m) !== "rest";

/** A small picture of each shape, as points in a box of 0..1 × 0..1 (y down), for the answer options. */
export const shapeIcon = (shape: Shape): Vec[] => {
  const curve = (u: number, turns: number) => {
    const pts: Vec[] = [];
    const n = 120;
    for (let i = 0; i <= n; i++) {
      const s = (i / n) * turns * TURN;
      pts.push([u * s - Math.sin(s), 1 - Math.cos(s)]);
    }
    const xs = pts.map((p) => p[0]);
    const min = Math.min(...xs), max = Math.max(...xs);
    return pts.map(([x, y]) => [(x - min) / (max - min || 1), 0.1 + (y / 2) * 0.8] as Vec);
  };
  switch (shape) {
    case "rest":
      return [[0.5, 0.5]];
    case "line":
      return [[0, 0.5], [1, 0.5]];
    case "circle":
      return Array.from({ length: 65 }, (_, i) => [0.5 + 0.4 * Math.sin((i / 64) * TURN), 0.5 + 0.4 * Math.cos((i / 64) * TURN)] as Vec);
    case "cycloid":
      return curve(1, 2);
    case "loops":
      return curve(0.45, 2);
    case "wave":
      return curve(2.2, 2);
  }
};

/** An SVG path through points. */
export const pathOf = (points: Vec[], scale: Vec = [1, 1], offset: Vec = [0, 0]) =>
  points
    .map(([x, y], i) => `${i ? "L" : "M"}${(offset[0] + x * scale[0]).toFixed(2)} ${(offset[1] + y * scale[1]).toFixed(2)}`)
    .join(" ");
