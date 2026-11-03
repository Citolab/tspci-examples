// The 3D view: the solid in two halves clipped by the plane (one can be hidden: it then shows as faint edges), the
// cross-section face hatched, the plane with three handles (an arrow to move it, a ball to tilt it, a block to turn it)
// and the corner letters. Orbit with mouse, touch (one finger turns, two pinch) and keyboard (arrows, + and −, Home).
// Handles and edges are picked by raycasting. Renders on demand. Without WebGL the constructor throws.
import {
  AmbientLight, BoxGeometry, BufferGeometry, CanvasTexture, ConeGeometry, CylinderGeometry, DirectionalLight, DoubleSide,
  Float32BufferAttribute, Group, LineBasicMaterial, LineLoop, LineSegments, Material, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Object3D, PerspectiveCamera, Plane, PlaneGeometry, Raycaster, RepeatWrapping, Scene, SphereGeometry, Sprite,
  SpriteMaterial, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
} from "three";
import type { EdgePoint, Model, PlaneParams, Section, Vec } from "./geometry";
import { add, dot, normalOf, planeAxes, planeOf, scale, sub } from "./geometry";

export type Handle = "move" | "tilt" | "turn";
export type SceneCallbacks = {
  /** a handle is dragged: the plane it gives (live), and done at the end of the drag */
  onPlane: (plane: PlaneParams, done: boolean) => void;
  /** a click on an edge (points mode) */
  onPickEdge: (point: EdgePoint) => void;
};
export type SceneInput = {
  plane: PlaneParams;
  section: Section;
  hide: "none" | "above" | "below";
  handles: boolean;
  pickEdges: boolean;
  labels: boolean;
  points: (Vec | null)[];
};

// Okabe-Ito: blue for the plane, orange for the section, vermillion for the points
const SOLID = 0xcbd5e1;
const PLANE = 0x0072b2;
const SECTION = 0xe69f00;
const POINT = 0xd55e00;
const EDGE = 0x1e293b;

const v3 = (v: Vec) => new Vector3(v[0], v[1], v[2]);

/** Diagonal stripes, so the section does not depend on its colour. */
const hatchTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d");
  if (g) {
    g.fillStyle = "#f5c04a";
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = "#9a5b00";
    g.lineWidth = 6;
    for (let k = -64; k <= 128; k += 21) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k + 64, 64);
      g.stroke();
    }
  }
  const t = new CanvasTexture(canvas);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  return t;
};

const letterSprite = (text: string, color = "#0f172a") => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d");
  if (g) {
    g.font = "bold 44px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 8;
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.strokeText(text, 32, 34);
    g.fillStyle = color;
    g.fillText(text, 32, 34);
  }
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map, depthTest: false, transparent: true }));
  sprite.renderOrder = 10;
  return sprite;
};

type Drag = { kind: "orbit" | Handle; x: number; y: number; moved: boolean; start: PlaneParams; s0: number };

export class CrossSectionScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(35, 4 / 3, 0.1, 1000);
  private raycaster = new Raycaster();
  private model: Model;
  private input: SceneInput | null = null;
  private solid = new Group();
  private sectionGroup = new Group();
  private planeGroup = new Group();
  private handles: Record<Handle, Object3D> = {} as Record<Handle, Object3D>;
  private pickLines: LineSegments | null = null;
  private pointMarks = new Group();
  private clipBelow = new Plane();
  private clipAbove = new Plane();
  private lowerMat: MeshStandardMaterial;
  private upperMat: MeshStandardMaterial;
  private lowerEdges: LineBasicMaterial;
  private upperEdges: LineBasicMaterial;
  private hatch = hatchTexture();
  private yaw = 0.6;
  private pitch = 0.45;
  private distance = 1;
  private frame = 0;
  private observer: ResizeObserver;
  private watch: number;
  private disposed = false;
  private drag: Drag | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;

  constructor(private host: HTMLElement, model: Model, private callbacks: SceneCallbacks) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.localClippingEnabled = true;
    const canvas = this.renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.touchAction = "none";
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);

    this.scene.add(new AmbientLight(0xffffff, 1.4));
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(4, 10, 7);
    this.scene.add(sun);
    const fill = new DirectionalLight(0xffffff, 0.5);
    fill.position.set(-6, 3, -4);
    this.scene.add(fill);

    const solidMat = (opacity: number, plane: Plane) =>
      new MeshStandardMaterial({
        color: SOLID, roughness: 0.75, metalness: 0, side: DoubleSide, clippingPlanes: [plane], transparent: opacity < 1, opacity,
        depthWrite: opacity === 1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      });
    this.lowerMat = solidMat(1, this.clipBelow);
    this.upperMat = solidMat(1, this.clipAbove);
    this.lowerEdges = new LineBasicMaterial({ color: EDGE, clippingPlanes: [this.clipBelow], transparent: true });
    this.upperEdges = new LineBasicMaterial({ color: EDGE, clippingPlanes: [this.clipAbove], transparent: true });
    this.scene.add(this.solid, this.sectionGroup, this.planeGroup, this.pointMarks);

    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.pointerUp);
    canvas.addEventListener("wheel", this.wheel, { passive: false });

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    // the page took the PCI away without unmounting it: free the WebGL context
    this.watch = window.setInterval(() => !canvas.isConnected && this.dispose(), 2000);
    this.setModel(model);
    this.resize();
  }

  get canvas() {
    return this.renderer.domElement;
  }

  setModel(model: Model) {
    this.model = model;
    this.distance = model.radius * 4.4;
    this.clear(this.solid);
    let geometry: BufferGeometry;
    const [a, b] = model.spec.dims;
    if (model.spec.type === "cylinder") geometry = new CylinderGeometry(a, a, b, 96, 1).translate(0, b / 2, 0);
    else if (model.spec.type === "cone") geometry = new ConeGeometry(a, b, 96, 1).translate(0, b / 2, 0);
    else if (model.spec.type === "sphere") geometry = new SphereGeometry(a, 64, 48).translate(0, a, 0);
    else {
      const pos: number[] = [];
      for (const f of model.faces)
        for (let i = 1; i < f.length - 1; i++) for (const k of [f[0], f[i], f[i + 1]]) pos.push(...model.vertices[k]);
      geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(pos, 3));
      geometry.computeVertexNormals();
    }
    this.solid.add(new Mesh(geometry, this.lowerMat), new Mesh(geometry, this.upperMat));

    // edges: the polyhedron's, or the rims of a round solid
    const seg: number[] = [];
    if (model.vertices.length) for (const [i, j] of model.edges) seg.push(...model.vertices[i], ...model.vertices[j]);
    else if (model.spec.type !== "sphere") {
      const rims = model.spec.type === "cylinder" ? [0, b] : [0];
      for (const y of rims)
        for (let k = 0; k < 96; k++) {
          const t0 = (2 * Math.PI * k) / 96, t1 = (2 * Math.PI * (k + 1)) / 96;
          seg.push(a * Math.cos(t0), y, a * Math.sin(t0), a * Math.cos(t1), y, a * Math.sin(t1));
        }
    }
    if (seg.length) {
      const g = new BufferGeometry();
      g.setAttribute("position", new Float32BufferAttribute(seg, 3));
      this.solid.add(new LineSegments(g, this.lowerEdges), new LineSegments(g, this.upperEdges));
    }
    // invisible copy of the edges for picking
    this.pickLines = null;
    if (model.vertices.length) {
      const g = new BufferGeometry();
      g.setAttribute("position", new Float32BufferAttribute(seg, 3));
      this.pickLines = new LineSegments(g, new LineBasicMaterial({ visible: false }));
      this.solid.add(this.pickLines);
    }
    // corner letters, a little outward from the centre
    model.labels.forEach((label, i) => {
      const s = letterSprite(label);
      const v = model.vertices[i];
      const out = sub(v, model.center);
      const len = Math.hypot(...out) || 1;
      s.position.copy(v3(add(v, scale(out, (0.09 * model.radius) / len))));
      s.scale.setScalar(model.radius * 0.16);
      s.name = "label";
      this.solid.add(s);
    });
    this.buildPlane();
    this.resize();
  }

  private buildPlane() {
    this.clear(this.planeGroup);
    const size = this.model.radius * 2.3;
    const quad = new Mesh(new PlaneGeometry(size, size), new MeshBasicMaterial({ color: PLANE, transparent: true, opacity: 0.13, side: DoubleSide, depthWrite: false }));
    quad.renderOrder = 5;
    const h = size / 2;
    const border = new LineLoop(
      new BufferGeometry().setFromPoints([new Vector3(-h, -h, 0), new Vector3(h, -h, 0), new Vector3(h, h, 0), new Vector3(-h, h, 0)]),
      new LineBasicMaterial({ color: PLANE }),
    );
    this.planeGroup.add(quad, border);
    const R = this.model.radius;
    const mat = new MeshStandardMaterial({ color: PLANE, roughness: 0.4 });
    // move: an arrow along the normal (the plane group's z axis)
    const move = new Group();
    const shaft = new Mesh(new CylinderGeometry(R * 0.025, R * 0.025, R * 0.5, 16), mat);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = R * 0.25;
    const tip = new Mesh(new ConeGeometry(R * 0.07, R * 0.18, 24), mat);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = R * 0.58;
    const hitMove = new Mesh(new SphereGeometry(R * 0.16, 12, 8), new MeshBasicMaterial({ visible: false }));
    hitMove.position.z = R * 0.45;
    move.add(shaft, tip, hitMove);
    // tilt: a ball on the upper edge (the plane group's y axis is V); turn: a block on the side edge (x is U, at turn − 90°)
    const tilt = new Mesh(new SphereGeometry(R * 0.075, 24, 16), new MeshStandardMaterial({ color: PLANE, roughness: 0.4 }));
    tilt.position.y = h;
    const turn = new Mesh(new BoxGeometry(R * 0.12, R * 0.12, R * 0.12), new MeshStandardMaterial({ color: PLANE, roughness: 0.4 }));
    turn.position.x = h;
    for (const [name, o] of [["move", move], ["tilt", tilt], ["turn", turn]] as const) {
      o.userData.handle = name;
      o.traverse((c) => (c.userData.handle = name));
      this.handles[name] = o;
      this.planeGroup.add(o);
    }
  }

  update(input: SceneInput) {
    this.input = input;
    const m = this.model;
    const { n, c } = planeOf(m, input.plane);
    const N = v3(n);
    this.clipBelow.set(N.clone().negate(), c); // keeps n·x ≤ c
    this.clipAbove.set(N.clone(), -c); // keeps n·x ≥ c
    // the hidden part: faint edges only; the whole solid: the upper part see-through, so the section shows
    const ghost = (mat: MeshStandardMaterial, edges: LineBasicMaterial, hidden: boolean, translucent: boolean) => {
      mat.visible = !hidden;
      mat.opacity = translucent ? 0.32 : 1;
      mat.transparent = translucent;
      mat.depthWrite = !translucent;
      edges.opacity = hidden ? 0.22 : 1;
      mat.needsUpdate = true;
    };
    ghost(this.upperMat, this.upperEdges, input.hide === "above", input.hide === "none");
    ghost(this.lowerMat, this.lowerEdges, input.hide === "below", false);

    // the section: a hatched face and a dark outline
    this.clear(this.sectionGroup);
    const s = input.section;
    if (s.points3d.length >= 3) {
      const pos: number[] = [];
      const uv: number[] = [];
      const k = 1 / (m.radius * 0.18);
      const centre2 = s.points2d.reduce((acc, p) => [acc[0] + p[0] / s.points2d.length, acc[1] + p[1] / s.points2d.length], [0, 0]);
      const centre3 = s.points3d.reduce((acc, p) => add(acc, scale(p, 1 / s.points3d.length)), [0, 0, 0] as Vec);
      s.points3d.forEach((p, i) => {
        const q = s.points3d[(i + 1) % s.points3d.length];
        const p2 = s.points2d[i], q2 = s.points2d[(i + 1) % s.points2d.length];
        pos.push(...centre3, ...p, ...q);
        uv.push(centre2[0] * k, centre2[1] * k, p2[0] * k, p2[1] * k, q2[0] * k, q2[1] * k);
      });
      const g = new BufferGeometry();
      g.setAttribute("position", new Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
      const face = new Mesh(g, new MeshBasicMaterial({ map: this.hatch, color: 0xffffff, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      face.renderOrder = 6;
      const outline = new LineLoop(new BufferGeometry().setFromPoints(s.points3d.map(v3)), new LineBasicMaterial({ color: 0x7c2d12, depthTest: false }));
      outline.renderOrder = 7;
      this.sectionGroup.add(face, outline);
    }

    // the plane: centred at the point nearest the solid's centre, x = U, y = V, z = n
    const { U, V } = planeAxes(input.plane);
    const O = add(m.center, scale(n, c - dot(n, m.center)));
    this.planeGroup.position.copy(v3(O));
    const basis = [v3(U), v3(V), N];
    this.planeGroup.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(basis[0], basis[1], basis[2]));
    for (const h of Object.values(this.handles)) h.visible = input.handles;

    // the three points
    this.clear(this.pointMarks);
    input.points.forEach((p, i) => {
      if (!p) return;
      const dotMesh = new Mesh(new SphereGeometry(m.radius * 0.045, 16, 12), new MeshStandardMaterial({ color: POINT }));
      dotMesh.position.copy(v3(p));
      const label = letterSprite("PQR"[i], "#9a3412");
      label.position.copy(v3(p)).add(new Vector3(0, m.radius * 0.12, 0));
      label.scale.setScalar(m.radius * 0.15);
      this.pointMarks.add(dotMesh, label);
    });
    this.solid.children.forEach((o) => o.name === "label" && (o.visible = input.labels));
    this.requestRender();
  }

  // --- the camera

  private placeCamera() {
    const C = v3(this.model.center);
    const d = this.distance;
    this.camera.position.set(
      C.x + d * Math.cos(this.pitch) * Math.sin(this.yaw),
      C.y + d * Math.sin(this.pitch),
      C.z + d * Math.cos(this.pitch) * Math.cos(this.yaw),
    );
    this.camera.lookAt(C);
    this.camera.near = d / 50;
    this.camera.far = d * 10;
    this.camera.updateProjectionMatrix();
  }

  orbit(dYaw: number, dPitch: number) {
    this.yaw += dYaw;
    this.pitch = Math.max(-1.2, Math.min(1.45, this.pitch + dPitch));
    this.requestRender();
  }

  zoom(factor: number) {
    const R = this.model.radius;
    this.distance = Math.max(R * 1.6, Math.min(R * 9, this.distance * factor));
    this.requestRender();
  }

  resetView() {
    this.yaw = 0.6;
    this.pitch = 0.45;
    this.distance = this.model.radius * 4.4;
    this.requestRender();
  }

  /** The view, for a screen reader or a test: yaw and pitch in degrees. */
  get view() {
    return { yaw: Math.round((this.yaw * 180) / Math.PI), pitch: Math.round((this.pitch * 180) / Math.PI), distance: this.distance };
  }

  // --- pointer input

  private ray(e: PointerEvent | { clientX: number; clientY: number }) {
    const r = this.canvas.getBoundingClientRect();
    const p = new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.placeCamera();
    this.raycaster.setFromCamera(p, this.camera);
    return this.raycaster.ray;
  }

  private pickHandle(e: PointerEvent): Handle | null {
    if (!this.input?.handles) return null;
    this.ray(e);
    const hit = this.raycaster.intersectObjects(Object.values(this.handles), true)[0];
    return (hit?.object.userData.handle as Handle) ?? null;
  }

  private pickEdge(e: PointerEvent): EdgePoint | null {
    if (!this.pickLines || !this.input?.pickEdges) return null;
    this.ray(e);
    this.raycaster.params.Line = { threshold: this.model.radius * 0.06 };
    const hit = this.raycaster.intersectObject(this.pickLines, false)[0];
    if (!hit || hit.index === undefined) return null;
    const edge = Math.floor(hit.index / 2);
    const [i] = this.model.edges[edge];
    const a = v3(this.model.vertices[i]);
    const p = (hit as any).pointOnLine ?? hit.point;
    return { edge, at: a.distanceTo(p) };
  }

  /** The plane a handle gives for the pointer. */
  private dragPlane(d: Drag, kind: Handle, e: PointerEvent): PlaneParams | null {
    const start = d.start;
    const m = this.model;
    const ray = this.ray(e);
    const C = v3(m.center);
    const n = v3(normalOf(start.tilt, start.turn));
    if (kind === "move") {
      const s = this.alongLine(C, n, ray.origin, ray.direction);
      if (s === null) return null;
      const R = m.radius;
      return { ...start, offset: Math.round(Math.max(-R, Math.min(R, start.offset + s - d.s0)) * 10) / 10 };
    }
    if (kind === "tilt") {
      // in the upright plane through the centre that holds the normal: the angle of the pointer
      const f = (start.turn * Math.PI) / 180;
      const h = new Vector3(Math.cos(f), 0, Math.sin(f));
      const side = new Vector3(-Math.sin(f), 0, Math.cos(f));
      const q = this.onPlane(C, side, ray.origin, ray.direction);
      if (!q) return null;
      const w = q.sub(C);
      const t = (Math.atan2(w.y, -w.dot(h)) * 180) / Math.PI;
      return { ...start, tilt: Math.round(Math.max(0, Math.min(90, t)) * 2) / 2 };
    }
    const q = this.onPlane(C, new Vector3(0, 1, 0), ray.origin, ray.direction);
    if (!q) return null;
    const w = q.sub(C);
    const turn = ((((Math.atan2(w.z, w.x) * 180) / Math.PI + 90) % 360) + 360) % 360;
    return { ...start, turn: (Math.round(turn * 2) / 2) % 360 };
  }

  private alongLine(P: Vector3, D: Vector3, O: Vector3, R: Vector3): number | null {
    const w = P.clone().sub(O);
    const a = D.dot(D), b = D.dot(R), c = R.dot(R), d = D.dot(w), e = R.dot(w);
    const den = a * c - b * b;
    if (Math.abs(den) < 1e-9) return null;
    return (b * e - c * d) / den;
  }

  private onPlane(P: Vector3, N: Vector3, O: Vector3, R: Vector3): Vector3 | null {
    const den = N.dot(R);
    if (Math.abs(den) < 1e-6) return null;
    const t = N.dot(P.clone().sub(O)) / den;
    return O.clone().add(R.clone().multiplyScalar(t));
  }

  private pointerDown = (e: PointerEvent) => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      this.canvas.setPointerCapture?.(e.pointerId);
    } catch {
      // a synthetic pointer (tests): no capture
    }
    if (this.pointers.size === 2) {
      const [p, q] = [...this.pointers.values()];
      this.pinch = Math.hypot(p.x - q.x, p.y - q.y);
      this.drag = null;
      return;
    }
    const handle = this.pickHandle(e);
    const start = this.input?.plane ?? { offset: 0, tilt: 0, turn: 0 };
    let s0 = 0;
    if (handle === "move") {
      const ray = this.ray(e);
      s0 = this.alongLine(v3(this.model.center), v3(normalOf(start.tilt, start.turn)), ray.origin, ray.direction) ?? 0;
    }
    this.drag = { kind: handle ?? "orbit", x: e.clientX, y: e.clientY, moved: false, start, s0 };
    this.canvas.style.cursor = handle ? "grabbing" : "grab";
  };

  private pointerMove = (e: PointerEvent) => {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [p, q] = [...this.pointers.values()];
      const dNow = Math.hypot(p.x - q.x, p.y - q.y);
      if (this.pinch > 0 && dNow > 0) this.zoom(this.pinch / dNow);
      this.pinch = dNow;
      return;
    }
    const d = this.drag;
    if (!d) {
      if (e.pointerType === "mouse") this.canvas.style.cursor = this.pickHandle(e) ? "grab" : "default";
      return;
    }
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
    if (d.kind === "orbit") {
      this.orbit(-(e.clientX - d.x) * 0.01, (e.clientY - d.y) * 0.01);
      d.x = e.clientX;
      d.y = e.clientY;
    } else if (d.moved) {
      const p = this.dragPlane(d, d.kind, e);
      if (p) this.callbacks.onPlane(p, false);
    }
  };

  private pointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    const d = this.drag;
    this.drag = null;
    this.canvas.style.cursor = "default";
    if (!d || e.type === "pointercancel") return;
    if (d.kind !== "orbit") {
      const p = d.moved ? this.dragPlane(d, d.kind, e) : null;
      this.callbacks.onPlane(p ?? this.input?.plane ?? d.start, true);
    } else if (!d.moved) {
      const hit = this.pickEdge(e);
      if (hit) this.callbacks.onPickEdge(hit);
    }
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1);
  };

  /** Where a 3D point lands on the canvas, in client pixels (for tests and for the handles' positions). */
  project(p: Vec | Handle): { x: number; y: number } {
    this.placeCamera();
    this.planeGroup.updateMatrixWorld(true);
    const v = typeof p === "string" ? this.handles[p].getWorldPosition(new Vector3()) : v3(p);
    if (p === "move") v.copy(this.handles.move.children[2].getWorldPosition(new Vector3()));
    v.project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  // --- drawing

  private resize() {
    if (this.disposed) return;
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.requestRender();
  }

  requestRender() {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  draw() {
    if (this.disposed) return;
    this.placeCamera();
    this.renderer.render(this.scene, this.camera);
  }

  private clear(group: Group) {
    for (const child of [...group.children]) {
      group.remove(child);
      child.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as Material | Material[] | undefined;
        for (const mm of Array.isArray(mat) ? mat : mat ? [mat] : []) {
          if (mm === this.lowerMat || mm === this.upperMat || mm === this.lowerEdges || mm === this.upperEdges) continue;
          const map = (mm as MeshBasicMaterial).map;
          if (map && map !== this.hatch) map.dispose();
          mm.dispose();
        }
      });
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    window.clearInterval(this.watch);
    this.observer.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.pointerDown);
    canvas.removeEventListener("pointermove", this.pointerMove);
    canvas.removeEventListener("pointerup", this.pointerUp);
    canvas.removeEventListener("pointercancel", this.pointerUp);
    canvas.removeEventListener("wheel", this.wheel);
    for (const g of [this.solid, this.sectionGroup, this.planeGroup, this.pointMarks]) this.clear(g);
    for (const m of [this.lowerMat, this.upperMat, this.lowerEdges, this.upperEdges]) m.dispose();
    this.hatch.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
  }
}
