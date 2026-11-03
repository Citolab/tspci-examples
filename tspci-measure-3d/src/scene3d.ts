// The 3D view: the author's objects with their edges, the points to measure (labelled A, B, C …), and the
// measurements as dimension lines with labels. Mouse, touch and the keyboard turn and zoom the camera (OrbitControls
// and turn()/zoom()); a click picks a point or a face by raycasting and snaps to the nearest vertex, midpoint or
// centre. It renders on demand, not in a loop. Without WebGL the constructor throws and the lists do the measuring.
import {
  AmbientLight, BufferAttribute, BufferGeometry, Color, CylinderGeometry, DirectionalLight, DoubleSide, GridHelper,
  Group, LineBasicMaterial, LineSegments, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D,
  PerspectiveCamera, Quaternion, Raycaster, Scene, SphereGeometry, Spherical, Vector2, Vector3, WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Built, ObjectType, Point, Vec3, add, cross, length, nearestOnScreen, scale, sub } from "./geometry";

/** What a click picked: a named point, or a point on a face (with the face). */
export type Pick = { point: string } | { face: string; pos: Vec3 };

/** A measurement to draw: its points in scene units, a colour, the label next to it. */
export type Drawn = {
  tool: "tape" | "protractor" | "area";
  points: Vec3[];
  face?: string;
  label: string;
  colour: string;
  /** Tick marks every so many scene units along a tape, or degrees along a protractor's arc. */
  ticks?: number;
  /** The correct measurement in review: dashed look, a lighter label. */
  solution?: boolean;
};

const TYPE_COLOURS: Record<ObjectType, number> = {
  box: 0xe9cfa6,
  ramp: 0xb9d4ea,
  prism: 0xeab9a8,
  cylinder: 0xa9dccb,
  stairs: 0xd6cfe9,
  ladder: 0x9a6a3c,
};
const BACKDROP = 0xe4e7ec;

export type ViewOptions = {
  showPointLabels: boolean;
  /** "area": a click picks a face; otherwise a point. */
  picking: "point" | "face" | "none";
  reducedMotion: boolean;
};

export class MeasureScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(40, 1.6, 0.01, 1000);
  private controls: OrbitControls;
  private world = new Group();
  private measures = new Group();
  private hover = new Group();
  private meshes: Mesh[] = [];
  private built: Built;
  private overlay: HTMLDivElement;
  private pointLabels: { point: Point; el: HTMLSpanElement }[] = [];
  private measureLabels: { at: Vector3; el: HTMLSpanElement }[] = [];
  private options: ViewOptions = { showPointLabels: true, picking: "point", reducedMotion: false };
  private raycaster = new Raycaster();
  private observer: ResizeObserver;
  private frame = 0;
  private down: { x: number; y: number; id: number } | null = null;
  private disposed = false;
  private home = { position: new Vector3(), target: new Vector3() };
  private removers: (() => void)[] = [];

  constructor(private host: HTMLElement, private onPick: (pick: Pick) => void, private onView?: () => void) {
    // throws without WebGL: the caller shows a message and the lists
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.touchAction = "none";
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);
    this.overlay = document.createElement("div");
    this.overlay.className = "m3d-overlay";
    this.overlay.setAttribute("aria-hidden", "true");
    host.appendChild(this.overlay);

    this.scene.add(new AmbientLight(0xffffff, 1.5));
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(4, 9, 6);
    this.scene.add(sun);
    const fill = new DirectionalLight(0xffffff, 0.5);
    fill.position.set(-6, 3, -4);
    this.scene.add(fill);
    this.scene.add(this.world, this.measures, this.hover);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.addEventListener("change", () => this.requestRender());

    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      el.addEventListener(type, fn as EventListener);
      this.removers.push(() => el.removeEventListener(type, fn as EventListener));
    };
    on(canvas, "pointerdown", (e) => (this.down = { x: e.clientX, y: e.clientY, id: e.pointerId }));
    on(canvas, "pointerup", (e) => {
      const d = this.down;
      this.down = null;
      if (!d || d.id !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return; // a drag turns the view
      const pick = this.pickAt(e.clientX, e.clientY);
      if (pick) this.onPick(pick);
    });
    on(canvas, "pointermove", (e) => {
      if (e.buttons) return;
      this.showHover(this.pickAt(e.clientX, e.clientY));
    });
    on(canvas, "pointerleave", () => this.showHover(null));

    this.observer = new ResizeObserver(() => {
      // the page took the PCI away without unmounting it: free the WebGL context
      if (!this.host.isConnected) return this.dispose();
      this.resize();
    });
    this.observer.observe(host);
  }

  /** The renderer's canvas, for tests. */
  get canvas() {
    return this.renderer.domElement;
  }

  setOptions(options: Partial<ViewOptions>) {
    const labels = options.showPointLabels !== undefined && options.showPointLabels !== this.options.showPointLabels;
    this.options = { ...this.options, ...options };
    if (labels && this.built) this.makePointLabels();
    if (options.picking) this.showHover(null);
    this.requestRender();
  }

  /** A new scene: the camera goes back to its start when the size of the scene changed. */
  setScene(built: Built) {
    const first = !this.built;
    const moved = first || Math.abs(built.radius - this.built.radius) > 1e-6 || built.centre.some((v, i) => Math.abs(v - this.built.centre[i]) > 1e-6);
    this.built = built;
    this.clear(this.world);
    this.meshes = [];
    const r = built.radius;

    const grid = new GridHelper(Math.ceil(r * 5), Math.ceil(r * 5) * 2, 0xb6c2d1, 0xdde3ea);
    grid.position.set(built.centre[0], -0.001, built.centre[2]);
    this.world.add(grid);

    for (const m of built.meshes) {
      const o = built.objects.find((x) => x.id === m.object);
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(new Float32Array(m.positions), 3));
      geometry.computeVertexNormals();
      const colour = o.measurable ? TYPE_COLOURS[o.type] : BACKDROP;
      const mesh = new Mesh(geometry, new MeshStandardMaterial({
        color: colour, roughness: 0.85, metalness: 0, side: o.type === "ladder" ? DoubleSide : undefined,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      }));
      mesh.userData = { object: m.object, faceOf: m.faceOf, measurable: o.measurable };
      this.meshes.push(mesh);
      this.world.add(mesh);
    }

    const edgePositions = built.edges.flatMap(([a, b]) => [...a, ...b]);
    const edgeGeometry = new BufferGeometry();
    edgeGeometry.setAttribute("position", new BufferAttribute(new Float32Array(edgePositions), 3));
    this.world.add(new LineSegments(edgeGeometry, new LineBasicMaterial({ color: 0x334155 })));

    // the points: vertices dark, midpoints and centres small and light
    const dot = new SphereGeometry(1, 12, 8);
    const vertexMaterial = new MeshBasicMaterial({ color: 0x1e293b });
    const otherMaterial = new MeshBasicMaterial({ color: 0x64748b });
    for (const p of built.points) {
      const marker = new Mesh(dot, p.kind === "vertex" ? vertexMaterial : otherMaterial);
      marker.scale.setScalar(r * (p.kind === "vertex" ? 0.011 : 0.007));
      marker.position.set(...p.pos);
      marker.raycast = () => {}; // the points are picked on the screen, not by the ray
      this.world.add(marker);
    }
    this.makePointLabels();

    if (moved) this.resetView();
    this.resize();
  }

  /** The measurements to draw, replacing the ones before; the first points of one in progress (pending). */
  setMeasurements(drawn: Drawn[], pending: Vec3[] = [], pendingColour = "#e69f00") {
    this.clear(this.measures);
    this.measureLabels.forEach((l) => l.el.remove());
    this.measureLabels = [];
    for (const d of drawn) this.draw(d);
    if (pending.length) {
      const r = this.built.radius;
      for (const p of pending) this.measures.add(this.ball(p, r * 0.022, pendingColour));
      if (pending.length > 1) for (let i = 1; i < pending.length; i++) this.measures.add(this.tube(pending[i - 1], pending[i], r * 0.004, pendingColour));
    }
    this.requestRender();
  }

  // ---- the camera

  resetView() {
    const { centre, radius } = this.built;
    const target = new Vector3(centre[0], Math.max(0, centre[1] * 0.7), centre[2]);
    const direction = new Vector3(0.75, 0.62, 1.25).normalize();
    this.camera.position.copy(target).addScaledVector(direction, radius * 2.4);
    this.controls.target.copy(target);
    this.controls.minDistance = radius * 0.3;
    this.controls.maxDistance = radius * 8;
    this.camera.near = radius * 0.01;
    this.camera.far = radius * 60;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.home = { position: this.camera.position.clone(), target: target.clone() };
    this.requestRender();
  }

  /** Turns the camera around the middle: degrees to the right, and up. */
  turn(right: number, up: number) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const s = new Spherical().setFromVector3(offset);
    s.theta -= (right * Math.PI) / 180;
    s.phi = Math.min(this.controls.maxPolarAngle, Math.max(0.05, s.phi - (up * Math.PI) / 180));
    offset.setFromSpherical(s);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
  }

  /** Closer (factor < 1) or further away. */
  zoom(factor: number) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const d = Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, offset.length() * factor));
    this.camera.position.copy(this.controls.target).add(offset.setLength(d));
    this.controls.update();
  }

  /** Where the camera is, as azimuth and elevation in degrees, for tests and the screen reader. */
  view() {
    const s = new Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
    return { azimuth: Math.round((s.theta * 180) / Math.PI), elevation: Math.round(90 - (s.phi * 180) / Math.PI), distance: s.radius };
  }

  /** Where a point of the scene is on the screen (client pixels), for tests. */
  screenOf(p: Vec3): { x: number; y: number } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = new Vector3(...p).project(this.camera);
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  // ---- picking

  /** What is under the pointer: the nearest point within 14 pixels (that is not hidden), or else a point on a face. */
  pickAt(clientX: number, clientY: number): Pick | null {
    if (!this.built || this.options.picking === "none") return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.meshes, false)[0];
    const faceAt = () => {
      if (!hit) return -1;
      const faceOf = hit.object.userData.faceOf as number[];
      return faceOf[hit.faceIndex ?? -1] ?? -1;
    };
    if (this.options.picking === "face") {
      const f = faceAt();
      return f >= 0 ? { face: this.built.faces[f].id, pos: hit.point.toArray().map((v) => Math.round(v * 1e4) / 1e4) as Vec3 } : null;
    }
    const visible = this.built.points.filter((p) => this.isVisible(p.pos));
    const screens = visible.map((p) => this.screenOf(p.pos));
    const near = nearestOnScreen(screens, clientX, clientY, 14);
    if (near >= 0) return { point: visible[near].id };
    const f = faceAt();
    if (f >= 0) return { face: this.built.faces[f].id, pos: hit.point.toArray().map((v) => Math.round(v * 1e4) / 1e4) as Vec3 };
    if (hit && hit.object.userData.measurable) {
      // a ladder has no faces: its nearest point
      const own = visible.filter((p) => p.object === hit.object.userData.object);
      const i = nearestOnScreen(own.map((p) => this.screenOf(p.pos)), clientX, clientY, Infinity);
      if (i >= 0) return { point: own[i].id };
    }
    return null;
  }

  /** Nothing of the scene is between the camera and the point. */
  private isVisible(p: Vec3) {
    const target = new Vector3(...p);
    const from = this.camera.position.clone();
    const direction = target.clone().sub(from);
    const d = direction.length();
    this.raycaster.set(from, direction.normalize());
    this.raycaster.far = d;
    const hit = this.raycaster.intersectObjects(this.meshes, false)[0];
    this.raycaster.far = Infinity;
    return !hit || hit.distance >= d - this.built.radius * 0.04;
  }

  private showHover(pick: Pick | null) {
    this.clear(this.hover);
    if (pick && this.built) {
      const r = this.built.radius;
      if ("point" in pick) {
        const p = this.built.points.find((x) => x.id === pick.point);
        if (p) this.hover.add(this.ball(p.pos, r * 0.018, "#e69f00", 0.8));
      } else if (this.options.picking === "face") {
        this.hover.add(this.faceMesh(pick.face, "#009e73", 0.35));
      } else {
        this.hover.add(this.ball(pick.pos, r * 0.012, "#e69f00", 0.8));
      }
    }
    this.renderer.domElement.style.cursor = pick ? "crosshair" : "grab";
    this.requestRender();
  }

  // ---- drawing

  private ball(p: Vec3, radius: number, colour: string, opacity = 1) {
    const m = new Mesh(new SphereGeometry(radius, 16, 12), new MeshBasicMaterial({ color: new Color(colour), transparent: opacity < 1, opacity, depthTest: false }));
    m.position.set(...p);
    m.renderOrder = 10;
    return m;
  }

  private tube(a: Vec3, b: Vec3, radius: number, colour: string, opacity = 1) {
    const d = sub(b, a);
    const len = length(d);
    const m = new Mesh(new CylinderGeometry(radius, radius, Math.max(len, 1e-6), 10, 1), new MeshBasicMaterial({ color: new Color(colour), transparent: opacity < 1, opacity, depthTest: false }));
    m.position.set(...add(a, scale(d, 0.5)));
    if (len > 1e-9) m.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...d).normalize()));
    m.renderOrder = 9;
    return m;
  }

  private lines(points: Vec3[], colour: string) {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(points.flat()), 3));
    const l = new LineSegments(g, new LineBasicMaterial({ color: new Color(colour), depthTest: false }));
    l.renderOrder = 9;
    return l;
  }

  /** The triangles of a face, on top of the object. */
  private faceMesh(faceId: string, colour: string, opacity: number) {
    const index = this.built.faces.findIndex((f) => f.id === faceId);
    const face = this.built.faces[index];
    const source = this.built.meshes.find((m) => m.object === face?.object);
    const positions: number[] = [];
    source?.faceOf.forEach((f, t) => f === index && positions.push(...source.positions.slice(t * 9, t * 9 + 9)));
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    const m = new Mesh(g, new MeshBasicMaterial({
      color: new Color(colour), transparent: true, opacity, side: DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    m.renderOrder = 5;
    m.raycast = () => {};
    return m;
  }

  private label(at: Vec3, text: string, colour: string, solution = false) {
    const el = document.createElement("span");
    el.className = `m3d-measure${solution ? " m3d-solution" : ""}`;
    el.style.setProperty("--c", colour);
    el.textContent = text;
    this.overlay.appendChild(el);
    this.measureLabels.push({ at: new Vector3(...at), el });
  }

  private draw(d: Drawn) {
    const r = this.built.radius;
    const thick = r * (d.solution ? 0.0045 : 0.006);
    const opacity = d.solution ? 0.85 : 1;
    if (d.tool === "area") {
      const face = this.built.faces.find((f) => f.id === d.face);
      if (!face) return;
      this.measures.add(this.faceMesh(face.id, d.colour, d.solution ? 0.3 : 0.45));
      const outline = face.outline;
      for (let i = 0; i < outline.length; i++) this.measures.add(this.tube(outline[i], outline[(i + 1) % outline.length], thick * 0.6, d.colour, opacity));
      this.label(face.centre, d.label, d.colour, d.solution);
      return;
    }
    if (d.tool === "tape") {
      const [a, b] = d.points;
      this.measures.add(this.tube(a, b, thick, d.colour, opacity));
      this.measures.add(this.ball(a, thick * 2.2, d.colour), this.ball(b, thick * 2.2, d.colour));
      const dir = sub(b, a);
      const len = length(dir);
      if (d.ticks && len > 0 && len / d.ticks <= 400) {
        // tick marks across the tape, every tenth and fifth longer, as on a tape measure
        const u = scale(dir, 1 / len);
        let side = cross(u, [0, 1, 0]);
        if (length(side) < 0.2) side = cross(u, [1, 0, 0]);
        side = scale(side, 1 / length(side));
        const segments: Vec3[] = [];
        const n = Math.floor(len / d.ticks + 1e-9);
        for (let i = 0; i <= n; i++) {
          const p = add(a, scale(u, i * d.ticks));
          const half = r * (i % 10 === 0 ? 0.04 : i % 5 === 0 ? 0.028 : 0.017);
          segments.push(add(p, scale(side, -half)), add(p, scale(side, half)));
        }
        this.measures.add(this.lines(segments, d.colour));
      }
      this.label(add(a, scale(dir, 0.5)), d.label, d.colour, d.solution);
      return;
    }
    // protractor: the two arms from the vertex, and an arc between them
    const [a, b, c] = d.points;
    this.measures.add(this.tube(b, a, thick, d.colour, opacity), this.tube(b, c, thick, d.colour, opacity));
    this.measures.add(this.ball(a, thick * 2, d.colour), this.ball(b, thick * 2.4, d.colour), this.ball(c, thick * 2, d.colour));
    const u = sub(a, b), v = sub(c, b);
    const lu = length(u), lv = length(v);
    if (lu < 1e-9 || lv < 1e-9) return;
    const e1 = scale(u, 1 / lu);
    const n = cross(u, v);
    if (length(n) < 1e-9) {
      this.label(b, d.label, d.colour, d.solution);
      return;
    }
    const e2raw = cross(scale(n, 1 / length(n)), e1);
    const e2 = scale(e2raw, 1 / length(e2raw));
    const angle = Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv))));
    const radius = Math.min(lu, lv) * 0.35;
    const at = (t: number, rr = radius): Vec3 => add(b, add(scale(e1, rr * Math.cos(t)), scale(e2, rr * Math.sin(t))));
    const arc: Vec3[] = [];
    const steps = 32;
    for (let i = 0; i < steps; i++) arc.push(at((angle * i) / steps), at((angle * (i + 1)) / steps));
    if (d.ticks) {
      const step = (d.ticks * Math.PI) / 180;
      for (let k = 0, t = 0; t <= angle + 1e-9 && k < 200; k++, t = k * step) arc.push(at(t, radius * 0.88), at(t, radius * (k % 2 ? 1.06 : 1.12)));
    }
    this.measures.add(this.lines(arc, d.colour));
    this.label(at(angle / 2, radius * 1.35), d.label, d.colour, d.solution);
  }

  private makePointLabels() {
    this.pointLabels.forEach((l) => l.el.remove());
    this.pointLabels = [];
    if (!this.options.showPointLabels) return;
    for (const point of this.built.points) {
      if (point.kind !== "vertex" && !point.named) continue;
      const el = document.createElement("span");
      el.className = "m3d-point";
      el.textContent = point.label;
      this.overlay.appendChild(el);
      this.pointLabels.push({ point, el });
    }
  }

  // ---- rendering

  requestRender() {
    if (this.frame || this.disposed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  /** Draws now (also for tests and screenshots). */
  render() {
    if (this.disposed || !this.built) return;
    this.renderer.render(this.scene, this.camera);
    const w = this.renderer.domElement.clientWidth, h = this.renderer.domElement.clientHeight;
    const place = (el: HTMLElement, p: Vector3, dx = 0, dy = 0) => {
      const v = p.clone().project(this.camera);
      if (v.z > 1 || v.z < -1) return (el.style.display = "none");
      el.style.display = "";
      el.style.transform = `translate(${((v.x + 1) / 2) * w + dx}px, ${((1 - v.y) / 2) * h + dy}px) translate(-50%, -50%)`;
    };
    // a point's name sits beside it, away from the middle of the scene; hidden points fade
    const centre = new Vector3(...this.built.centre);
    for (const { point, el } of this.pointLabels) {
      const p = new Vector3(...point.pos);
      const away = p.clone().sub(centre).project(this.camera).sub(centre.clone().project(this.camera));
      const k = Math.hypot(away.x, away.y) || 1;
      place(el, p, (away.x / k) * 12, (-away.y / k) * 12);
      el.style.opacity = this.isVisible(point.pos) ? "1" : "0.35";
    }
    for (const { at, el } of this.measureLabels) place(el, at);
    this.onView?.();
  }

  private resize() {
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  private clear(group: Object3D) {
    for (const child of [...group.children]) {
      group.remove(child);
      child.traverse((o) => {
        const m = o as Mesh;
        // the shared marker geometry and materials go with the world
        m.geometry?.dispose();
        const material = m.material as Material | Material[] | undefined;
        (Array.isArray(material) ? material : material ? [material] : []).forEach((x) => x.dispose());
      });
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.removers.forEach((r) => r());
    this.controls.dispose();
    this.clear(this.world);
    this.clear(this.measures);
    this.clear(this.hover);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.overlay.remove();
  }
}

