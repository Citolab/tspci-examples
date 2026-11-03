// The 3D relief model: the grid of the map as a block of land with the hypsometric tints, the same contour lines
// draped on it, and the task's points and lines. Vertical exaggeration scales the heights. Turn it with the mouse,
// a finger or the keyboard (the caller's buttons and keys); the pointer is found on the terrain by raycasting. It
// draws only when something changes (no animation loop), so prefers-reduced-motion has nothing to stop. Without
// WebGL the constructor throws and the caller shows a message.
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  CylinderGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  Line,
} from "three";
import { Band, Contour, Grid, Point, bandColor } from "./terrain";

export type Overlay = {
  markers: { p: Point; color: string; size?: number }[];
  lines: { points: Point[]; color: string }[];
};

export type SceneOptions = {
  grid: Grid;
  contours: Contour[];
  bands: Band[];
  tints: boolean;
  height: (x: number, y: number) => number;
  onHover: (p: Point | null) => void;
  onPick: (p: Point) => void;
  /** the camera turned or zoomed: for the live status */
  onView?: () => void;
};

/** The model is SIZE scene units across its longer side. */
const SIZE = 10;

export class ReliefScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(36, 1.5, 0.1, 200);
  private land = new Group();
  private terrain: Mesh<BufferGeometry, MeshStandardMaterial>;
  private overlayLines = new Group();
  private markers = new Group();
  private hoverPin: Group;
  private raycaster = new Raycaster();
  private observer: ResizeObserver;
  private disposed = false;
  private watch: ReturnType<typeof setInterval>;
  private scale: number;
  private floor: number;
  private exaggeration = 3;
  private overlay: Overlay = { markers: [], lines: [] };
  private hover: Point | null = null;
  // the camera on a sphere around the middle of the model
  private theta = -0.5;
  private phi = 0.95;
  private radius = 15;
  private frame = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private dragStart: { x: number; y: number; moved: boolean } | null = null;
  private pinch = 0;

  constructor(private host: HTMLElement, private o: SceneOptions) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.touchAction = "none";
    canvas.setAttribute("aria-hidden", "true");
    canvas.dataset.testid = "relief-canvas";
    host.appendChild(canvas);

    const g = o.grid;
    this.scale = SIZE / Math.max(g.width, g.depth);
    this.floor = g.min - Math.max(10, (g.max - g.min) * 0.25);

    this.scene.add(new AmbientLight(0xffffff, 1.5));
    const sun = new DirectionalLight(0xffffff, 1.9);
    sun.position.set(-6, 10, 4); // light from the north-west, as on a relief map
    this.scene.add(sun);

    this.terrain = this.buildTerrain();
    this.land.add(this.terrain, this.buildSides(), this.buildContours(), this.overlayLines);
    this.scene.add(this.land, this.markers);

    this.hoverPin = new Group();
    const pin = new Mesh(new CylinderGeometry(0.02, 0.02, 0.9, 8), new MeshBasicMaterial({ color: 0x0f172a }));
    pin.position.y = 0.45;
    const head = new Mesh(new SphereGeometry(0.11, 16, 12), new MeshBasicMaterial({ color: 0xffffff }));
    head.position.y = 0.9;
    const ring = new Mesh(new SphereGeometry(0.14, 16, 12), new MeshBasicMaterial({ color: 0x0f172a, side: DoubleSide, wireframe: true }));
    ring.position.y = 0.9;
    this.hoverPin.add(pin, head, ring);
    this.hoverPin.visible = false;
    this.scene.add(this.hoverPin);

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onLeave);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    // the page took the PCI away without unmounting it: free the WebGL context
    this.watch = setInterval(() => {
      if (!this.host.isConnected) this.dispose();
    }, 2000);
    this.resize();
  }

  get canvas() {
    return this.renderer.domElement;
  }

  private sceneX = (x: number) => x * this.scale - (this.o.grid.width * this.scale) / 2;
  private sceneZ = (y: number) => -(y * this.scale - (this.o.grid.depth * this.scale) / 2);
  private sceneY = (h: number) => (h - this.o.grid.min) * this.scale;

  private buildTerrain() {
    const g = this.o.grid;
    const positions = new Float32Array(g.columns * g.rows * 3);
    const colors = new Float32Array(g.columns * g.rows * 3);
    const color = new Color();
    for (let j = 0; j < g.rows; j++) {
      for (let i = 0; i < g.columns; i++) {
        const k = j * g.columns + i;
        const h = g.values[k];
        positions.set([this.sceneX((i / (g.columns - 1)) * g.width), this.sceneY(h), this.sceneZ((j / (g.rows - 1)) * g.depth)], k * 3);
        color.set(this.o.tints ? bandColor(this.o.bands, h) : "#e9e5da");
        color.convertSRGBToLinear();
        colors.set([color.r, color.g, color.b], k * 3);
      }
    }
    const index: number[] = [];
    for (let j = 0; j < g.rows - 1; j++) {
      for (let i = 0; i < g.columns - 1; i++) {
        const a = j * g.columns + i, b = a + 1, c = a + g.columns, d = c + 1;
        index.push(a, b, d, a, d, c);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    return new Mesh(geometry, material);
  }

  /** The four sides of the block, from the edge of the terrain down to the floor. */
  private buildSides() {
    const g = this.o.grid;
    const positions: number[] = [];
    const edge = (points: [number, number][]) => {
      for (let n = 1; n < points.length; n++) {
        const [i1, j1] = points[n - 1], [i2, j2] = points[n];
        const p1 = [this.sceneX((i1 / (g.columns - 1)) * g.width), this.sceneZ((j1 / (g.rows - 1)) * g.depth)];
        const p2 = [this.sceneX((i2 / (g.columns - 1)) * g.width), this.sceneZ((j2 / (g.rows - 1)) * g.depth)];
        const h1 = this.sceneY(g.values[j1 * g.columns + i1]), h2 = this.sceneY(g.values[j2 * g.columns + i2]);
        const f = this.sceneY(this.floor);
        positions.push(p1[0], h1, p1[1], p2[0], h2, p2[1], p2[0], f, p2[1], p1[0], h1, p1[1], p2[0], f, p2[1], p1[0], f, p1[1]);
      }
    };
    const range = (n: number) => Array.from({ length: n }, (_, i) => i);
    edge(range(g.columns).map((i) => [i, 0]));
    edge(range(g.columns).map((i) => [i, g.rows - 1]));
    edge(range(g.rows).map((j) => [0, j]));
    edge(range(g.rows).map((j) => [g.columns - 1, j]));
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    geometry.computeVertexNormals();
    return new Mesh(geometry, new MeshStandardMaterial({ color: 0x8a6f58, roughness: 1, side: DoubleSide }));
  }

  /** The contour lines, a little above the terrain, darker every fifth line. */
  private buildContours() {
    const group = new Group();
    const lift = 0.004;
    const normal: number[] = [], index: number[] = [];
    const intervals = this.o.contours.map((c) => c.level).sort((a, b) => a - b);
    const step = intervals.length > 1 ? Math.min(...intervals.slice(1).map((l, i) => l - intervals[i]).filter((d) => d > 0)) : 10;
    for (const c of this.o.contours) {
      const target = Math.abs(c.level / (step * 5) - Math.round(c.level / (step * 5))) < 1e-6 ? index : normal;
      for (let i = 1; i < c.points.length; i++) {
        const a = c.points[i - 1], b = c.points[i];
        target.push(this.sceneX(a.x), this.sceneY(c.level) + lift, this.sceneZ(a.y), this.sceneX(b.x), this.sceneY(c.level) + lift, this.sceneZ(b.y));
      }
    }
    for (const [list, color, opacity] of [[normal, 0x6b3f1d, 0.7], [index, 0x4a2a12, 1]] as const) {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(new Float32Array(list), 3));
      group.add(new LineSegments(geometry, new LineBasicMaterial({ color, transparent: opacity < 1, opacity })));
    }
    return group;
  }

  setExaggeration(e: number) {
    this.exaggeration = e;
    this.land.scale.y = e;
    this.placeMarkers();
    this.request();
  }

  setOverlay(overlay: Overlay) {
    this.overlay = overlay;
    for (const child of [...this.overlayLines.children]) {
      this.overlayLines.remove(child);
      const line = child as Line;
      line.geometry.dispose();
      (line.material as LineBasicMaterial).dispose();
    }
    for (const l of overlay.lines) {
      if (l.points.length < 2) continue;
      // draped: points every few metres, each at the height of the terrain
      const pts: Vector3[] = [];
      for (let i = 1; i < l.points.length; i++) {
        const a = l.points[i - 1], b = l.points[i];
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (Math.max(this.o.grid.width, this.o.grid.depth) / 150)));
        for (let s = i === 1 ? 0 : 1; s <= n; s++) {
          const x = a.x + ((b.x - a.x) * s) / n, y = a.y + ((b.y - a.y) * s) / n;
          pts.push(new Vector3(this.sceneX(x), this.sceneY(this.o.height(x, y)) + 0.02, this.sceneZ(y)));
        }
      }
      const line = new Line(new BufferGeometry().setFromPoints(pts), new LineBasicMaterial({ color: new Color(l.color), depthTest: false, transparent: true }));
      line.renderOrder = 5;
      this.overlayLines.add(line);
    }
    this.placeMarkers();
    this.request();
  }

  setHover(p: Point | null) {
    this.hover = p;
    this.placeMarkers();
    this.request();
  }

  private placeMarkers() {
    for (const child of [...this.markers.children]) {
      this.markers.remove(child);
      const mesh = child as Mesh;
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    }
    const y = (p: Point) => this.sceneY(this.o.height(p.x, p.y)) * this.exaggeration;
    for (const m of this.overlay.markers) {
      const ball = new Mesh(new SphereGeometry(0.13 * (m.size ?? 1), 20, 14), new MeshBasicMaterial({ color: new Color(m.color), depthTest: false, transparent: true }));
      ball.renderOrder = 6;
      ball.position.set(this.sceneX(m.p.x), y(m.p) + 0.13, this.sceneZ(m.p.y));
      this.markers.add(ball);
    }
    this.hoverPin.visible = !!this.hover;
    if (this.hover) this.hoverPin.position.set(this.sceneX(this.hover.x), y(this.hover), this.sceneZ(this.hover.y));
  }

  /** Turn around the model (radians), and look from higher or lower. */
  rotate(dTheta: number, dPhi: number) {
    this.theta += dTheta;
    this.phi = Math.max(0.2, Math.min(1.45, this.phi + dPhi));
    this.placeCamera();
  }

  zoom(factor: number) {
    this.radius = Math.max(6, Math.min(40, this.radius * factor));
    this.placeCamera();
  }

  reset() {
    this.theta = -0.5;
    this.phi = 0.95;
    this.radius = 15;
    this.placeCamera();
  }

  /** Where the camera looks from: degrees from the south (to the west positive), degrees above the horizon. */
  get view() {
    return { azimuth: Math.round((this.theta * 180) / Math.PI), elevation: Math.round(90 - (this.phi * 180) / Math.PI), radius: this.radius };
  }

  private placeCamera() {
    const middle = (this.sceneY(this.o.grid.max) * this.exaggeration) / 3;
    this.camera.position.set(
      this.radius * Math.sin(this.phi) * Math.sin(this.theta),
      middle + this.radius * Math.cos(this.phi),
      this.radius * Math.sin(this.phi) * Math.cos(this.theta)
    );
    this.camera.lookAt(0, middle, 0);
    this.o.onView?.();
    this.request();
  }

  private resize() {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.placeCamera();
  }

  /** The point of the terrain under a point of the canvas, in metres on the map. */
  pick(clientX: number, clientY: number): Point | null {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const ndc = new Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.terrain, false)[0];
    if (!hit) return null;
    const g = this.o.grid;
    const x = (hit.point.x + (g.width * this.scale) / 2) / this.scale;
    const y = (-hit.point.z + (g.depth * this.scale) / 2) / this.scale;
    return { x: Math.max(0, Math.min(g.width, x)), y: Math.max(0, Math.min(g.depth, y)) };
  }

  private onPointerDown = (e: PointerEvent) => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // synthetic events in tests
    }
    if (this.pointers.size === 1) this.dragStart = { x: e.clientX, y: e.clientY, moved: false };
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.dragStart) this.dragStart.moved = true;
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const last = this.pointers.get(e.pointerId);
    if (!last) {
      this.o.onHover(this.pick(e.clientX, e.clientY));
      return;
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch > 0 && d > 0) this.zoom(this.pinch / d);
      this.pinch = d;
      return;
    }
    if (this.dragStart && Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y) > 4) this.dragStart.moved = true;
    if (this.dragStart?.moved) this.rotate(-(e.clientX - last.x) * 0.01, -(e.clientY - last.y) * 0.008);
  };

  private onPointerUp = (e: PointerEvent) => {
    const start = this.dragStart;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0) {
      this.dragStart = null;
      if (start && !start.moved && e.type === "pointerup") {
        const p = this.pick(e.clientX, e.clientY);
        if (p) this.o.onPick(p);
      }
    }
  };

  private onLeave = () => {
    if (!this.pointers.size) this.o.onHover(null);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1);
  };

  private request() {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  /** Draws now (tests and screenshots don't wait for a frame). */
  draw() {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    clearInterval(this.watch);
    this.observer.disconnect();
    const canvas = this.canvas;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointercancel", this.onPointerUp);
    canvas.removeEventListener("pointerleave", this.onLeave);
    canvas.removeEventListener("wheel", this.onWheel);
    this.scene.traverse((object) => {
      const mesh = object as Mesh;
      mesh.geometry?.dispose();
      (mesh.material as MeshBasicMaterial | undefined)?.dispose?.();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
  }
}
