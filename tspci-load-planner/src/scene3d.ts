// The 3D view: the cargo space (a van with its cab and wheels, a container or a euro pallet), the boxes with their
// label on the top and the sides, the chosen box outlined, and the centre of gravity as a marker on the floor.
// OrbitControls turns and zooms with the mouse and touch; orbit()/zoom() do it for the keyboard. Picking is a raycast:
// a box, or a point of the floor. Without WebGL the constructor throws and the interaction shows a message; the 2D
// views do everything. The scene only draws when something changed (no animation loop).
import {
  AmbientLight, BoxGeometry, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DirectionalLight, EdgesGeometry, Group,
  LineBasicMaterial, LineSegments, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, Plane,
  PlaneGeometry, Raycaster, Scene, SphereGeometry, SRGBColorSpace, Vector2, Vector3, WebGLRenderer, DoubleSide, Spherical,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Plan, Solid } from "./plan";
import { stopColor, stopInk } from "./colors";

export type Pick = { id: string } | { floor: { x: number; y: number } };

export type SceneData = {
  plan: Plan;
  solids: Solid[];
  selected: string | null;
  /** the centre of gravity, or null to hide the marker */
  cog: { x: number; y: number; z: number } | null;
  /** texts drawn in the scene */
  labels: { door: string; front: string; stop: (n: number) => string };
};

/** The space's coordinates (x to the door, y to the right, z up, cm) in the scene's (x right, y up, z towards the viewer). */
const toScene = (plan: Plan, x: number, y: number, z: number) => new Vector3(x - plan.space.length / 2, z, plan.space.width / 2 - y);

export class LoadScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(38, 2, 1, 20000);
  private controls: OrbitControls;
  private fixed = new Group(); // the cargo space
  private load = new Group(); // the boxes and the marker
  private observer: ResizeObserver;
  private raycaster = new Raycaster();
  private down: { x: number; y: number; id: number } | null = null;
  private frame = 0;
  private disposed = false;
  private data: SceneData | null = null;
  private spaceKey = "";
  private textures = new Map<string, CanvasTexture>();
  private removers: (() => void)[] = [];

  constructor(private host: HTMLElement, private onPick: (pick: Pick) => void) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true }); // throws without WebGL
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.touchAction = "none";
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);

    this.scene.add(new AmbientLight(0xffffff, 1.7));
    const sun = new DirectionalLight(0xffffff, 1.5);
    sun.position.set(300, 800, 500);
    this.scene.add(sun);
    const fill = new DirectionalLight(0xffffff, 0.6);
    fill.position.set(-500, 300, -300);
    this.scene.add(fill);
    this.scene.add(this.fixed, this.load);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.enablePan = false;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.addEventListener("change", () => this.requestRender());

    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      canvas.addEventListener(type, fn as EventListener);
      this.removers.push(() => canvas.removeEventListener(type, fn as EventListener));
    };
    on("pointerdown", (e) => (this.down = { x: e.clientX, y: e.clientY, id: e.pointerId }));
    on("pointerup", (e) => {
      const d = this.down;
      this.down = null;
      if (!d || d.id !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return; // a drag turns the view
      const pick = this.pickAt(e.clientX, e.clientY);
      if (pick) this.onPick(pick);
    });

    this.observer = new ResizeObserver(() => {
      if (!this.host.isConnected) return this.dispose(); // the page took the PCI away without unmounting it
      this.resize();
    });
    this.observer.observe(host);
  }

  get canvas() {
    return this.renderer.domElement;
  }

  update(data: SceneData) {
    const key = JSON.stringify(data.plan.space) + data.labels.door;
    this.data = data;
    if (key !== this.spaceKey) {
      this.spaceKey = key;
      this.buildSpace();
      this.resetCamera();
    }
    this.buildLoad();
    this.requestRender();
  }

  /** The keyboard: turn around the load (radians), or up and down. */
  orbit(azimuth: number, polar: number) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const s = new Spherical().setFromVector3(offset);
    s.theta += azimuth;
    s.phi = Math.min(this.controls.maxPolarAngle, Math.max(0.05, s.phi + polar));
    this.camera.position.copy(this.controls.target).add(new Vector3().setFromSpherical(s));
    this.controls.update();
  }

  zoom(factor: number) {
    const offset = this.camera.position.clone().sub(this.controls.target).multiplyScalar(factor);
    const length = Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, offset.length()));
    this.camera.position.copy(this.controls.target).add(offset.setLength(length));
    this.controls.update();
  }

  resetCamera() {
    if (!this.data) return;
    const { length, width, height } = this.data.plan.space;
    const size = Math.max(length, width * 1.4, height * 1.6);
    this.controls.target.set(0, height * 0.35, 0);
    this.camera.position.set(length * 0.55 + size * 0.45, height * 0.6 + size * 0.75, width * 0.5 + size * 0.95);
    this.controls.minDistance = size * 0.4;
    this.controls.maxDistance = size * 4;
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  private material(color: number | string, extra: Partial<{ opacity: number; transparent: boolean }> = {}) {
    return new MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });
  }

  private buildSpace() {
    this.clear(this.fixed);
    const plan = this.data!.plan;
    const { kind, length: L, width: W, height: H } = plan.space;
    const at = (x: number, y: number, z: number) => toScene(plan, x, y, z);

    if (kind === "pallet") {
      // a euro pallet: three runners of blocks, a deck of slats; the load sits on the deck (z = 0)
      const wood = this.material(0xc8a26b);
      const slats = new Group();
      for (let i = 0; i < 5; i++) {
        const w = i === 2 ? 14.5 : 10;
        const m = new Mesh(new BoxGeometry(L, 2.2, w), wood);
        m.position.copy(at(L / 2, ((W - 10) * i) / 4 + 5, -1.1));
        slats.add(m);
      }
      for (const yy of [5, W / 2, W - 5]) for (const xx of [7.5, L / 2, L - 7.5]) {
        const b = new Mesh(new BoxGeometry(xx === L / 2 ? 14.5 : 14.5, 7.8, 10), wood);
        b.position.copy(at(xx, yy, -2.2 - 3.9 - 2.2));
        slats.add(b);
      }
      for (const yy of [5, W / 2, W - 5]) {
        const m = new Mesh(new BoxGeometry(L, 2.2, 10), wood);
        m.position.copy(at(L / 2, yy, -2.2 - 7.8 - 3.3));
        slats.add(m);
      }
      this.fixed.add(slats);
    } else {
      const floor = new Mesh(new BoxGeometry(L, 4, W), this.material(kind === "van" ? 0x9aa4b1 : 0x8a6a4a));
      floor.position.copy(at(L / 2, W / 2, -2));
      this.fixed.add(floor);
      const wall = (w: number, h: number, pos: Vector3, rotY: number) => {
        const m = new Mesh(new PlaneGeometry(w, h), new MeshStandardMaterial({ color: kind === "van" ? 0xe2e8f0 : 0xb45309, transparent: true, opacity: 0.35, side: DoubleSide, depthWrite: false }));
        m.position.copy(pos);
        m.rotation.y = rotY;
        this.fixed.add(m);
      };
      wall(W, H, at(0, W / 2, H / 2), Math.PI / 2); // the front wall
      wall(L, H, at(L / 2, W, H / 2), 0); // the right wall, far side
    }
    // the outline of the space (for a pallet: the highest the load may come)
    const outline = new LineSegments(new EdgesGeometry(new BoxGeometry(L, H, W)), new LineBasicMaterial({ color: kind === "pallet" ? 0x64748b : 0x334155, transparent: true, opacity: kind === "pallet" ? 0.5 : 0.8 }));
    outline.position.copy(at(L / 2, W / 2, H / 2));
    this.fixed.add(outline);

    if (kind === "van") {
      // the cab in front, and the wheels at the axles
      const cab = new Group();
      const body = this.material(0xf8fafc);
      const cabLength = Math.min(140, Math.max(80, L * 0.4));
      const lower = new Mesh(new BoxGeometry(cabLength, H * 0.55, W + 10), body);
      lower.position.copy(at(-cabLength / 2 - 4, W / 2, H * 0.275 - 4));
      const upper = new Mesh(new BoxGeometry(cabLength * 0.6, H * 0.5, W + 4), body);
      upper.position.copy(at(-cabLength * 0.3 - 4, W / 2, H * 0.55 + H * 0.25 - 4));
      const glass = new Mesh(new PlaneGeometry(H * 0.42, W - 10), new MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.3 }));
      glass.position.copy(at(-cabLength * 0.6 - 4.5, W / 2, H * 0.78));
      glass.rotation.set(0, -Math.PI / 2, Math.PI / 2);
      cab.add(lower, upper, glass);
      const a = plan.space.axles;
      const tyre = this.material(0x1f2937);
      for (const ax of a ? [a.front, a.rear] : [-cabLength * 0.6, L * 0.75]) for (const side of [-6, W + 6]) {
        const wheel = new Mesh(new CylinderGeometry(32, 32, 20, 24), tyre);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.copy(at(ax, side, -22));
        cab.add(wheel);
      }
      this.fixed.add(cab);
    }

    // the door end, and the front, as words on the floor
    const word = (text: string, x: number, rotZ: number) => {
      const tex = this.texture(`word:${text}`, 256, 64, (g) => {
        g.fillStyle = "#0f172a";
        g.font = "bold 40px system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(text, 128, 34);
      });
      const m = new Mesh(new PlaneGeometry(Math.min(W, 120), Math.min(W, 120) / 4), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      m.rotation.set(-Math.PI / 2, 0, rotZ);
      m.position.copy(at(x, W / 2, kind === "pallet" ? -14 : 0.6));
      this.fixed.add(m);
    };
    if (kind !== "pallet") word(this.data!.labels.door, L + 22, Math.PI / 2);
  }

  private texture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
    let t = this.textures.get(key);
    if (t) return t;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d");
    if (g) draw(g);
    t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    this.textures.set(key, t);
    return t;
  }

  /** A face of a box with its id, stop and symbols, drawn at the face's proportions. */
  private faceTexture(s: Solid, w: number, h: number, selected: boolean) {
    const scale = 256 / Math.max(w, h);
    const cw = Math.max(32, Math.round(w * scale)), ch = Math.max(32, Math.round(h * scale));
    const stop = this.data!.labels.stop;
    const key = `face:${s.id}:${s.box.stop}:${s.box.fragile}:${s.box.upright}:${cw}x${ch}:${selected}`;
    return this.texture(key, cw, ch, (g) => {
      g.fillStyle = stopColor(s.box.stop);
      g.fillRect(0, 0, cw, ch);
      g.strokeStyle = selected ? "#0f172a" : "rgba(15,23,42,.35)";
      g.lineWidth = selected ? 10 : 3;
      g.strokeRect(0, 0, cw, ch);
      g.fillStyle = stopInk(s.box.stop);
      g.textAlign = "center";
      g.textBaseline = "middle";
      const size = Math.max(14, Math.min(cw, ch) * 0.34);
      g.font = `bold ${size}px system-ui, sans-serif`;
      const marks = `${s.box.upright ? "↑↑ " : ""}${s.box.fragile ? "⚠" : ""}`.trim();
      const line2 = [s.box.stop !== null ? stop(s.box.stop) : "", marks].filter(Boolean).join("  ");
      g.fillText(s.id, cw / 2, line2 ? ch / 2 - size * 0.35 : ch / 2);
      if (line2) {
        g.font = `${Math.max(11, size * 0.5)}px system-ui, sans-serif`;
        g.fillText(line2, cw / 2, ch / 2 + size * 0.5);
      }
    });
  }

  private buildLoad() {
    this.clear(this.load, false);
    const { plan, solids, selected, cog } = this.data!;
    for (const s of solids) {
      const isSelected = s.id === selected;
      const plain = this.material(stopColor(s.box.stop));
      if (isSelected) plain.emissive = new Color(0x334155);
      const top = new MeshStandardMaterial({ map: this.faceTexture(s, s.dx, s.dy, isSelected), roughness: 0.85 });
      const door = new MeshStandardMaterial({ map: this.faceTexture(s, s.dy, s.dz, isSelected), roughness: 0.85 });
      const left = new MeshStandardMaterial({ map: this.faceTexture(s, s.dx, s.dz, isSelected), roughness: 0.85 });
      // BoxGeometry's faces: +x (door), −x, +y (top), −y, +z (left side), −z
      const mesh = new Mesh(new BoxGeometry(s.dx - 0.4, s.dz - 0.4, s.dy - 0.4), [door, plain, top, plain, left, plain]);
      mesh.position.copy(toScene(plan, s.x + s.dx / 2, s.y + s.dy / 2, s.z + s.dz / 2));
      mesh.userData.id = s.id;
      this.load.add(mesh);
      const edges = new LineSegments(new EdgesGeometry(mesh.geometry), new LineBasicMaterial({ color: isSelected ? 0x0f172a : 0x475569 }));
      edges.position.copy(mesh.position);
      if (isSelected) edges.scale.setScalar(1.01);
      this.load.add(edges);
    }
    if (cog) {
      // the centre of gravity: a ball where it is, a line down and a ring on the floor
      const ink = 0xbe185d;
      const ball = new Mesh(new SphereGeometry(5, 20, 12), new MeshBasicMaterial({ color: ink, depthTest: false }));
      ball.position.copy(toScene(plan, cog.x, cog.y, cog.z));
      ball.renderOrder = 10;
      const line = new LineSegments(new BufferGeometry().setFromPoints([toScene(plan, cog.x, cog.y, cog.z), toScene(plan, cog.x, cog.y, 0.5)]), new LineBasicMaterial({ color: ink, depthTest: false }));
      line.renderOrder = 10;
      const ring = new Mesh(new CylinderGeometry(9, 9, 0.6, 24, 1, true), new MeshBasicMaterial({ color: ink, side: DoubleSide, depthTest: false }));
      ring.position.copy(toScene(plan, cog.x, cog.y, 0.5));
      ring.renderOrder = 10;
      this.load.add(ball, line, ring);
    }
  }

  private pickAt(clientX: number, clientY: number): Pick | null {
    if (!this.data) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.load.children.filter((o) => o.userData.id), false)[0];
    if (hit) return { id: hit.object.userData.id };
    const point = new Vector3();
    if (!this.raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), point)) return null;
    const { length, width } = this.data.plan.space;
    const x = point.x + length / 2, y = width / 2 - point.z;
    if (x < 0 || y < 0 || x > length || y > width) return null;
    return { floor: { x, y } };
  }

  /** Where a point of the space is on the canvas, in client pixels (for tests). */
  screenOf(x: number, y: number, z: number) {
    if (!this.data) return null;
    const v = toScene(this.data.plan, x, y, z).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  private resize() {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
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
    this.renderer.render(this.scene, this.camera);
  }

  private clear(group: Group, textures = true) {
    for (const child of [...group.children]) {
      child.traverse((o: Object3D) => {
        const m = o as Mesh;
        m.geometry?.dispose();
        const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as Material[];
        for (const mat of mats) mat.dispose();
      });
      group.remove(child);
    }
    if (textures) {
      for (const t of this.textures.values()) t.dispose();
      this.textures.clear();
    }
    // the faces of boxes come and go: keep the cache small
    if (!textures && this.textures.size > 400) {
      for (const [k, t] of this.textures) if (k.startsWith("face:")) { t.dispose(); this.textures.delete(k); }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    for (const remove of this.removers) remove();
    this.controls.dispose();
    this.clear(this.fixed);
    this.clear(this.load);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
