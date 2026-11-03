// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/theroom, © openPCI: Elias J.T. Hansen, Anna Rusmann and
// Jeppe Bundsgaard (Aarhus University and Aalborg University)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

/**
 * The room and the furniture of a built-in or inline exercise, drawn from simple shapes. They follow the naming
 * conventions of the original's glTF models, so snapping and scoring treat both the same way:
 * `snap…` a plane that snaps to a wall, `obj_snap…` one that snaps to other furniture, `…zone…` an invisible box
 * for the scoring rules. A plane snaps in the direction of its local +y.
 */
import * as THREE from "three";
import { AssetDef, FixtureDef, Label, RoomDef, Side, Wall, labelIn } from "./exercise";

export const WALL_THICKNESS = 0.2;

const srgb = (color: string | number, fallback = "#999999") => {
  const c = new THREE.Color();
  try {
    c.set(color as THREE.ColorRepresentation);
  } catch {
    c.set(fallback);
  }
  return c;
};

const mat = (color: string | number, roughness = 0.7, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color: srgb(color), roughness, metalness: 0, ...extra });

const box = (w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0, name = "") => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y + h / 2, z);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

const cylinder = (r: number, h: number, material: THREE.Material, x = 0, y = 0, z = 0, segments = 20) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

const sideDirection: Record<Side, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0, 1),
  back: new THREE.Vector3(0, 0, -1),
  left: new THREE.Vector3(-1, 0, 0),
  right: new THREE.Vector3(1, 0, 0),
};

const snapMaterial = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
const zoneMaterial = new THREE.MeshBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.18, depthWrite: false });

/** A snap plane on one side of a w × h × d box, facing outwards (its +y). */
const snapPlane = (name: string, side: Side, w: number, h: number, d: number) => {
  const along = side === "front" || side === "back" ? w : d;
  const geometry = new THREE.PlaneGeometry(Math.max(0.2, along * 0.6), Math.max(0.2, h * 0.6));
  geometry.rotateX(-Math.PI / 2); // normal +y
  const plane = new THREE.Mesh(geometry, snapMaterial);
  plane.name = name;
  const dir = sideDirection[side];
  plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  plane.position.set((dir.x * w) / 2, Math.max(0.1, h / 2), (dir.z * d) / 2);
  return plane;
};

const chair = (color: string, facing: number) => {
  const g = new THREE.Group();
  const wood = mat(color, 0.6);
  const seat = mat("#e9e2d6", 0.9);
  const s = 0.44;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.04, 0.44, 0.04, wood, (x * s) / 2.3, 0, (z * s) / 2.3));
  g.add(box(s, 0.05, s, seat, 0, 0.44, 0));
  g.add(box(s, 0.45, 0.05, wood, 0, 0.49, -s / 2 + 0.025));
  g.rotation.y = facing;
  return g;
};

const table = (def: AssetDef, w: number, d: number, h: number) => {
  const g = new THREE.Group();
  const wood = mat(def.color ?? "#9a6b43", 0.55);
  g.add(box(w, 0.05, d, wood, 0, h - 0.05, 0));
  const lx = w / 2 - 0.06;
  const lz = d / 2 - 0.06;
  for (const [x, z] of [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]]) g.add(box(0.06, h - 0.05, 0.06, wood, x, 0, z));
  const chairColor = "#3f3f46";
  if (def.seats === 2) {
    // left and right, so the back of a table for two can go against a wall
    const left = chair(chairColor, Math.PI / 2);
    left.position.set(-w / 2 - 0.28, 0, 0);
    const right = chair(chairColor, -Math.PI / 2);
    right.position.set(w / 2 + 0.28, 0, 0);
    g.add(left, right);
  } else if (def.seats === 4) {
    for (const x of [-w / 4, w / 4]) {
      const front = chair(chairColor, Math.PI);
      front.position.set(x, 0, d / 2 + 0.28);
      const back = chair(chairColor, 0);
      back.position.set(x, 0, -d / 2 - 0.28);
      g.add(front, back);
    }
  }
  // a candle and a plate or two, so a table reads as a restaurant table
  g.add(cylinder(0.025, 0.12, mat("#fafaf9", 0.4), 0, h, 0, 10));
  return g;
};

const counter = (def: AssetDef, w: number, d: number, h: number) => {
  const g = new THREE.Group();
  g.add(box(w, h - 0.04, d, mat(def.color ?? "#5b6b7a", 0.6)));
  g.add(box(w + 0.04, 0.04, d + 0.04, mat("#e7e5e4", 0.35), 0, h - 0.04, 0));
  const dishes = ["#f97316", "#84cc16", "#facc15", "#ef4444", "#a3e635"];
  const n = Math.max(1, Math.floor(w / 0.5));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5);
    g.add(cylinder(0.17, 0.05, mat("#fafafa", 0.3), x, h, 0));
    g.add(cylinder(0.12, 0.05, mat(dishes[i % dishes.length], 0.8), x, h + 0.04, 0));
  }
  return g;
};

const playcorner = (def: AssetDef, w: number, d: number) => {
  const g = new THREE.Group();
  g.add(box(w, 0.025, d, mat(def.color ?? "#4f8fd6", 0.95)));
  // a road on the rug, toy blocks and a ball
  g.add(box(w * 0.8, 0.005, 0.18, mat("#52525b", 0.9), 0, 0.025, d * 0.15));
  const colors = ["#ef4444", "#facc15", "#22c55e", "#f97316"];
  colors.forEach((c, i) => g.add(box(0.18, 0.18, 0.18, mat(c, 0.5), -w * 0.3 + i * 0.22, 0.025, -d * 0.25)));
  g.add(box(0.18, 0.18, 0.18, mat("#a855f7", 0.5), -w * 0.3 + 0.11, 0.205, -d * 0.25));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.14, 24, 16), mat("#f43f5e", 0.4));
  ball.position.set(w * 0.28, 0.165, -d * 0.2);
  ball.castShadow = true;
  g.add(ball);
  return g;
};

const rug = (def: AssetDef, w: number, d: number) => {
  const g = new THREE.Group();
  g.add(box(w, 0.02, d, mat(def.color ?? "#b45309", 0.95)));
  return g;
};

const sofa = (def: AssetDef, w: number, d: number, h: number) => {
  const g = new THREE.Group();
  const fabric = mat(def.color ?? "#64748b", 0.9);
  g.add(box(w, 0.42, d, fabric));
  g.add(box(w, h - 0.42, 0.2, fabric, 0, 0.42, -d / 2 + 0.1));
  g.add(box(0.18, 0.22, d, fabric, -w / 2 + 0.09, 0.42, 0));
  g.add(box(0.18, 0.22, d, fabric, w / 2 - 0.09, 0.42, 0));
  return g;
};

const shelf = (def: AssetDef, w: number, d: number, h: number) => {
  const g = new THREE.Group();
  const wood = mat(def.color ?? "#a16207", 0.6);
  g.add(box(0.04, h, d, wood, -w / 2 + 0.02));
  g.add(box(0.04, h, d, wood, w / 2 - 0.02));
  g.add(box(w, h, 0.02, wood, 0, 0, -d / 2 + 0.01));
  const shelves = Math.max(2, Math.round(h / 0.4));
  for (let i = 0; i <= shelves; i++) g.add(box(w, 0.03, d, wood, 0, Math.min(h - 0.03, (h / shelves) * i), 0));
  return g;
};

const bed = (def: AssetDef, w: number, d: number, h: number) => {
  const g = new THREE.Group();
  g.add(box(w, h * 0.6, d, mat("#78716c", 0.6)));
  g.add(box(w - 0.06, h * 0.25, d - 0.1, mat(def.color ?? "#e0e7ff", 0.95), 0, h * 0.6, 0.03));
  g.add(box(w, h * 1.6, 0.08, mat("#78716c", 0.6), 0, 0, -d / 2 + 0.04));
  return g;
};

const plant = (def: AssetDef, w: number, h: number) => {
  const g = new THREE.Group();
  g.add(cylinder(w * 0.3, h * 0.3, mat("#b45309", 0.8)));
  const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(w * 0.5, 1), mat(def.color ?? "#16a34a", 0.8, { flatShading: true }));
  leaves.position.y = h * 0.3 + w * 0.45;
  leaves.castShadow = true;
  g.add(leaves);
  return g;
};

const person = (def: AssetDef, h: number) => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, h * 0.5, 6, 16), mat(def.color ?? "#1e3a8a", 0.7));
  body.position.y = 0.2 + h * 0.25;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), mat("#e5c09f", 0.6));
  head.position.y = h - 0.13;
  head.castShadow = true;
  g.add(body, head);
  return g;
};

const showcase = (def: AssetDef, w: number, d: number, h: number) => {
  const g = new THREE.Group();
  g.add(box(w, h * 0.55, d, mat(def.color ?? "#3f3f46", 0.5)));
  const glass = box(w, h * 0.45, d, mat("#bfdbfe", 0.1, { transparent: true, opacity: 0.3, depthWrite: false }), 0, h * 0.55, 0, "glass");
  glass.castShadow = false;
  g.add(glass);
  return g;
};

/** The furniture of an asset, its front facing +z, standing on y = 0. */
export const buildAsset = (def: AssetDef): THREE.Group => {
  const shape = def.shape ?? "box";
  const defaults: Record<string, [number, number, number]> = {
    table: [1.2, 0.8, 0.75],
    chair: [0.45, 0.45, 0.9],
    sofa: [2, 0.9, 0.85],
    shelf: [1, 0.35, 1.8],
    counter: [2, 0.7, 0.9],
    rug: [2, 1.4, 0.02],
    playcorner: [2.4, 2.4, 0.4],
    plant: [0.5, 0.5, 1.2],
    person: [0.5, 0.4, 1.8],
    showcase: [1.2, 0.6, 1.4],
    bed: [1.6, 2.1, 0.5],
    box: [1, 1, 1],
  };
  const [dw, dd, dh] = defaults[shape] ?? defaults.box;
  const w = def.width ?? dw;
  const d = def.depth ?? dd;
  const h = def.height ?? dh;
  let g: THREE.Group;
  switch (shape) {
    case "table":
      g = table(def, w, d, h);
      break;
    case "chair":
      g = chair(def.color ?? "#3f3f46", 0);
      break;
    case "counter":
      g = counter(def, w, d, h);
      break;
    case "playcorner":
      g = playcorner(def, w, d);
      break;
    case "rug":
      g = rug(def, w, d);
      break;
    case "sofa":
      g = sofa(def, w, d, h);
      break;
    case "shelf":
      g = shelf(def, w, d, h);
      break;
    case "bed":
      g = bed(def, w, d, h);
      break;
    case "plant":
      g = plant(def, w, h);
      break;
    case "person":
      g = person(def, h);
      break;
    case "showcase":
      g = showcase(def, w, d, h);
      break;
    default:
      g = new THREE.Group();
      g.add(box(w, h, d, mat(def.color ?? "#a8a29e", 0.6)));
  }
  if (def.wallSnap) g.add(snapPlane("snap_back", "back", w, Math.min(h, 0.8), d));
  for (const side of def.objectSnap ?? []) g.add(snapPlane(`obj_snap_${side}`, side, w, Math.min(h, 0.8), d));
  for (const zone of def.zones ?? []) {
    const dir = sideDirection[zone.side] ?? sideDirection.front;
    const zw = dir.x ? zone.depth : w;
    const zd = dir.z ? zone.depth : d;
    const z = new THREE.Mesh(new THREE.BoxGeometry(zw, Math.max(0.1, h), zd), zoneMaterial);
    z.name = `${zone.name}_zone`;
    z.visible = false;
    z.position.set((dir.x * (w + zone.depth)) / 2, Math.max(0.1, h) / 2, (dir.z * (d + zone.depth)) / 2);
    g.add(z);
  }
  g.userData.footprint = { width: w, depth: d };
  return g;
};

/** A text on a sprite (a door label). */
export const textSprite = (text: string, color = "#1f2937", background = "rgba(255,255,255,0.88)") => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const font = "600 44px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  let width = 256;
  if (ctx) {
    ctx.font = font;
    width = Math.ceil(ctx.measureText(text).width) + 48;
  }
  canvas.width = width;
  canvas.height = 72;
  if (ctx) {
    ctx.font = font;
    ctx.fillStyle = background;
    ctx.beginPath();
    (ctx as any).roundRect ? (ctx as any).roundRect(0, 0, width, 72, 18) : ctx.rect(0, 0, width, 72);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.fillText(text, 24, 38);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  const h = 0.42;
  sprite.scale.set((h * width) / 72, h, 1);
  sprite.renderOrder = 10;
  return sprite;
};

export type RoomBuild = {
  group: THREE.Group;
  /** where the furniture may stand */
  bounds: THREE.Box3;
  /** per wall the meshes on it (wall, doors, windows, labels) and the direction out of the room */
  walls: { meshes: THREE.Object3D[]; center: THREE.Vector3; outward: THREE.Vector3 }[];
  zoneMeshes: THREE.Mesh[];
};

const wallFrame = (wall: Wall, room: RoomDef) => {
  const hw = room.width / 2;
  const hd = room.depth / 2;
  switch (wall) {
    case "north":
      return { center: new THREE.Vector3(0, 0, -hd), outward: new THREE.Vector3(0, 0, -1), along: new THREE.Vector3(1, 0, 0), length: room.width };
    case "south":
      return { center: new THREE.Vector3(0, 0, hd), outward: new THREE.Vector3(0, 0, 1), along: new THREE.Vector3(1, 0, 0), length: room.width };
    case "west":
      return { center: new THREE.Vector3(-hw, 0, 0), outward: new THREE.Vector3(-1, 0, 0), along: new THREE.Vector3(0, 0, 1), length: room.depth };
    default:
      return { center: new THREE.Vector3(hw, 0, 0), outward: new THREE.Vector3(1, 0, 0), along: new THREE.Vector3(0, 0, 1), length: room.depth };
  }
};

/** The floor, four walls (each its own box, as the original asks of a scene), doors, windows, blocks and zones. */
export const buildRoom = (room: RoomDef, language: string): RoomBuild => {
  const group = new THREE.Group();
  group.name = "room";
  const height = room.height ?? 2.8;
  const t = WALL_THICKNESS;

  const floorTexture = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const base = srgb(room.floorColor ?? "#c9a77c");
    ctx.fillStyle = `#${base.getHexString()}`;
    ctx.fillRect(0, 0, 256, 256);
    // planks
    for (let i = 0; i < 8; i++) {
      const shade = 0.9 + ((i * 37) % 10) / 50;
      const plank = base.clone().multiplyScalar(shade);
      ctx.fillStyle = `#${plank.getHexString()}`;
      ctx.fillRect(0, i * 32 + 1, 256, 30);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(((i * 97) % 200) + 20, i * 32 + 1, 2, 30);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(room.width / 2, room.depth / 2);
    tex.anisotropy = 4;
    return tex;
  })();
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(room.width + 2 * t, 0.1, room.depth + 2 * t),
    new THREE.MeshStandardMaterial({ color: floorTexture ? 0xffffff : srgb(room.floorColor ?? "#c9a77c"), map: floorTexture, roughness: 0.85 })
  );
  floor.name = "floor";
  floor.position.y = -0.05;
  floor.receiveShadow = true;
  group.add(floor);

  const walls: RoomBuild["walls"] = [];
  const wallMeshes: Record<Wall, THREE.Object3D[]> = { north: [], south: [], east: [], west: [] };
  for (const wall of ["north", "south", "west", "east"] as Wall[]) {
    const f = wallFrame(wall, room);
    const long = wall === "north" || wall === "south" ? room.width + 2 * t : room.depth;
    const geometry = wall === "north" || wall === "south" ? new THREE.BoxGeometry(long, height, t) : new THREE.BoxGeometry(t, height, long);
    const mesh = new THREE.Mesh(geometry, mat(room.wallColor ?? "#f1ece4", 0.95, { transparent: true }));
    mesh.name = `wall_${wall}`;
    mesh.position.copy(f.center).addScaledVector(f.outward, t / 2);
    mesh.position.y = height / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    wallMeshes[wall].push(mesh);
    walls.push({ meshes: wallMeshes[wall], center: f.center.clone(), outward: f.outward.clone() });
  }

  for (const fixture of room.fixtures ?? []) addFixture(group, fixture, room, height, wallMeshes, language);

  const zoneMeshes: THREE.Mesh[] = [];
  for (const zone of room.zones ?? []) {
    const name = /zone/.test(zone.name) ? zone.name : `${zone.name}_zone`;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(zone.width, 1, zone.depth), zoneMaterial);
    mesh.name = name;
    mesh.position.set(zone.x, 0.5, zone.z);
    mesh.visible = false;
    mesh.userData.label = labelIn(zone.label as Label, language, zone.name.replace(/_?zone/, ""));
    group.add(mesh);
    zoneMeshes.push(mesh);
  }

  const bounds = new THREE.Box3(new THREE.Vector3(-room.width / 2, 0, -room.depth / 2), new THREE.Vector3(room.width / 2, height, room.depth / 2));
  return { group, bounds, walls, zoneMeshes };
};

const addFixture = (
  group: THREE.Group,
  fixture: FixtureDef,
  room: RoomDef,
  height: number,
  wallMeshes: Record<Wall, THREE.Object3D[]>,
  language: string
) => {
  if (fixture.kind === "block") {
    const w = fixture.width ?? 0.5;
    const d = fixture.depth ?? 0.5;
    const h = fixture.height ?? height;
    const m = box(w, h, d, mat(fixture.color ?? "#d6d3d1", 0.8), fixture.x ?? 0, 0, fixture.z ?? 0, fixture.name ?? "block");
    group.add(m);
    return;
  }
  const wall = fixture.wall ?? "north";
  const f = wallFrame(wall, room);
  const isDoor = fixture.kind === "door";
  const w = fixture.width ?? (isDoor ? 1 : 1.6);
  const h = fixture.height ?? (isDoor ? Math.min(2.1, height - 0.2) : 1.2);
  const y = isDoor ? 0 : Math.min(0.9, height - h - 0.2);
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, 0.04),
    isDoor ? mat(fixture.color ?? "#8b5e3c", 0.6, { transparent: true }) : mat("#bfe3ff", 0.05, { transparent: true, opacity: 0.75, emissive: srgb("#9fd3ff"), emissiveIntensity: 0.25 })
  );
  panel.name = fixture.name ?? `${fixture.kind}_${wall}`;
  // face into the room
  panel.lookAt(f.outward.clone().negate());
  panel.position.copy(f.center).addScaledVector(f.along, fixture.at ?? 0).addScaledVector(f.outward, -0.02);
  panel.position.y = y + h / 2;
  panel.receiveShadow = true;
  group.add(panel);
  wallMeshes[wall].push(panel);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.08, 0.02), mat("#f8fafc", 0.6, { transparent: true }));
  frame.quaternion.copy(panel.quaternion);
  frame.position.copy(panel.position).addScaledVector(f.outward, 0.015);
  group.add(frame);
  wallMeshes[wall].push(frame);
  if (isDoor) {
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), mat("#d4d4d8", 0.3, { metalness: 0.6, transparent: true }));
    handle.position.copy(panel.position).addScaledVector(f.along, w / 2 - 0.12).addScaledVector(f.outward, -0.05);
    handle.position.y = 1.0;
    group.add(handle);
    wallMeshes[wall].push(handle);
  }
  if (fixture.label) {
    const sprite = textSprite(labelIn(fixture.label, language, ""));
    sprite.position.copy(panel.position).addScaledVector(f.outward, -0.15);
    sprite.position.y = y + h + 0.3;
    group.add(sprite);
    wallMeshes[wall].push(sprite);
  }
};
