// The 3D view: every part built from simple geometry (or taken from the author's glTF), at its assembled position
// when it is in the product and at its start position (the exploded view) when not. A step moves the part there in a
// short animation (at once with reduced motion). Turn the view by dragging (mouse, touch) or with the keyboard
// (turn/resetView); a click picks a part by raycasting. Without WebGL the constructor throws and the interaction
// shows the parts list only. Renders on demand: a frame per change, a loop only while a part moves.
import {
  AmbientLight, Box3, BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DirectionalLight, EdgesGeometry, ExtrudeGeometry,
  GridHelper, Group, HemisphereLight, LineBasicMaterial, LineSegments, Material, Mesh, MeshStandardMaterial, Object3D, Path,
  PerspectiveCamera, Raycaster, Scene, Shape as ThreeShape, SphereGeometry, TorusGeometry, Vector2, Vector3, WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { COLORS, Part, Vec, startPositions } from "./assembly";

export type SceneInput = {
  parts: Part[];
  /** the ids of the parts that are in the product now */
  assembled: Set<string>;
  /** the part under the pointer or focused in the list: lit up, with a ghost where it goes */
  highlight: string | null;
  reducedMotion: boolean;
  /** the author's glTF, or "" */
  gltf: string;
  /** clicks pick parts (not in review) */
  interactive: boolean;
};
export type SceneEvents = {
  onPick: (id: string) => void;
  onHover: (id: string | null) => void;
  /** the glTF could not be loaded: the shapes stay */
  onGltfFailed: () => void;
};

const DURATION = 520; // ms per move
const HIGHLIGHT = new Color(0xffffff); // lit up: brighter, whatever its material

type Slot = {
  id: string;
  group: Group;
  ghost: Group;
  at: Vector3;
  start: Vector3;
  from: Vector3;
  to: Vector3;
  t0: number;
  materials: MeshStandardMaterial[];
};

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const toVector = (v: Vec) => new Vector3(v[0], v[1], v[2]);
const DEG = Math.PI / 180;

/** The geometries of one shape, standing along y around the origin. */
const geometriesOf = (part: Part): { geometry: BufferGeometry; offset?: number; edges?: boolean }[] => {
  const [a = 1, b = 1, c = 1] = part.size;
  switch (part.shape) {
    case "box":
      return [{ geometry: new BoxGeometry(a, b, c), edges: true }];
    case "cylinder":
      return [{ geometry: new CylinderGeometry(a, a, b, 32) }];
    case "tube": {
      const outer = new ThreeShape();
      outer.absarc(0, 0, a, 0, Math.PI * 2, false);
      const hole = new Path();
      hole.absarc(0, 0, Math.min(b, a * 0.95), 0, Math.PI * 2, true);
      outer.holes.push(hole);
      const g = new ExtrudeGeometry(outer, { depth: c, bevelEnabled: false, curveSegments: 40 });
      g.rotateX(-Math.PI / 2);
      g.translate(0, -c / 2, 0);
      return [{ geometry: g }];
    }
    case "ring": {
      const g = new TorusGeometry(a, b, 16, 48);
      g.rotateX(Math.PI / 2);
      return [{ geometry: g }];
    }
    case "hex":
      return [{ geometry: new CylinderGeometry(a, a, b, 6), edges: true }];
    case "screw": {
      const head = new CylinderGeometry(a * 2.2, a * 2.2, a * 1.1, 20);
      head.translate(0, b / 2 + a * 0.55, 0);
      return [{ geometry: new CylinderGeometry(a, a * 0.7, b, 12) }, { geometry: head }];
    }
    case "cone":
      return [{ geometry: new ConeGeometry(a, b, 32) }];
    case "sphere":
      return [{ geometry: new SphereGeometry(a, 28, 18) }];
  }
};

export class AssemblyScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(35, 1.6, 0.1, 400);
  private world = new Group();
  private floor: GridHelper | null = null;
  private slots: Slot[] = [];
  private geometries: BufferGeometry[] = [];
  private materials: Material[] = [];
  private ghostMaterial = new MeshStandardMaterial({ color: 0x1d4ed8, transparent: true, opacity: 0.22, depthWrite: false });
  private edgeMaterial = new LineBasicMaterial({ color: 0x1f2937, transparent: true, opacity: 0.35 });
  private input: SceneInput | null = null;
  private key = "";
  private generation = 0;
  private observer: ResizeObserver;
  private watch: ReturnType<typeof setInterval>;
  private disposed = false;
  private pending = 0;
  private orbit = { theta: 0.6, phi: 1.1, radius: 20 };
  private start = { theta: 0.6, phi: 1.1, radius: 20 };
  private target = new Vector3();
  private pointers = new Map<number, { x: number; y: number }>();
  private pressed: { x: number; y: number; moved: boolean } | null = null;
  private pinch = 0;
  private hovered: string | null = null;

  constructor(private host: HTMLElement, private events: SceneEvents) {
    // throws without WebGL: the caller shows the parts list only
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

    this.scene.add(new HemisphereLight(0xffffff, 0xd6cfc4, 1.6));
    this.scene.add(new AmbientLight(0xffffff, 0.35));
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(6, 12, 9);
    this.scene.add(sun);
    const fill = new DirectionalLight(0xffffff, 0.5);
    fill.position.set(-8, 4, -6);
    this.scene.add(fill);
    this.scene.add(this.world);

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerCancel);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    // the page took the PCI away without unmounting it: free the WebGL context
    this.watch = setInterval(() => !this.host.isConnected && this.dispose(), 2000);
    this.resize();
  }

  get canvas() {
    return this.renderer.domElement;
  }

  update(input: SceneInput) {
    if (this.disposed) return;
    const first = !this.input;
    this.input = input;
    const key = JSON.stringify({ parts: input.parts, gltf: input.gltf });
    let rebuilt = false;
    if (key !== this.key) {
      this.key = key;
      this.build(input.parts);
      rebuilt = true;
      if (input.gltf) this.loadGltf(input.gltf, input.parts);
    }
    this.place(input, first || rebuilt || input.reducedMotion);
    this.highlight();
    this.draw();
  }

  // ------------------------------------------------------------ building

  private clearWorld() {
    this.generation++;
    if (this.floor) {
      this.floor.geometry.dispose();
      (this.floor.material as Material).dispose();
    }
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.geometries = [];
    this.materials = [];
    this.world.clear();
    this.slots = [];
    this.floor = null;
  }

  private shapeOf(part: Part, material: Material, withEdges: boolean) {
    const holder = new Group();
    for (const { geometry, edges } of geometriesOf(part)) {
      this.geometries.push(geometry);
      holder.add(new Mesh(geometry, material));
      if (edges && withEdges) {
        const e = new EdgesGeometry(geometry, 30);
        this.geometries.push(e);
        holder.add(new LineSegments(e, this.edgeMaterial));
      }
    }
    if (part.turn) holder.rotation.set(part.turn[0] * DEG, part.turn[1] * DEG, part.turn[2] * DEG);
    return holder;
  }

  private build(parts: Part[]) {
    this.clearWorld();
    const starts = startPositions(parts);
    parts.forEach((part, i) => {
      const material = new MeshStandardMaterial({ color: COLORS[part.color] ?? COLORS.wood, roughness: part.color.includes("teel") || part.color === "brass" ? 0.38 : 0.72, metalness: part.color.includes("teel") || part.color === "brass" ? 0.55 : 0 });
      this.materials.push(material);
      const group = new Group();
      group.userData = { id: part.id };
      const ghost = new Group();
      ghost.visible = false;
      for (const offset of [[0, 0, 0] as Vec, ...(part.copies ?? [])]) {
        const copy = this.shapeOf(part, material, true);
        copy.position.add(toVector(offset));
        group.add(copy);
        const g = this.shapeOf(part, this.ghostMaterial, false);
        g.position.add(toVector(offset));
        ghost.add(g);
      }
      const at = toVector(part.at);
      ghost.position.copy(at);
      this.world.add(group, ghost);
      this.slots.push({ id: part.id, group, ghost, at, start: toVector(starts[i]), from: at.clone(), to: at.clone(), t0: 0, materials: [material] });
    });
    this.frame();
  }

  /** The floor under everything and the camera around it. */
  private frame() {
    const box = new Box3();
    for (const s of this.slots) {
      const b = new Box3().setFromObject(s.group);
      const size = b.isEmpty() ? new Vector3(1, 1, 1) : b.getSize(new Vector3());
      for (const p of [s.at, s.start]) box.expandByPoint(p.clone().addScaledVector(size, 0.5)).expandByPoint(p.clone().addScaledVector(size, -0.5));
    }
    if (box.isEmpty()) box.set(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    const centre = box.getCenter(new Vector3());
    const radius = Math.max(1, box.getSize(new Vector3()).length() / 2);
    if (this.floor) {
      this.world.remove(this.floor);
      this.floor.geometry.dispose();
      (this.floor.material as Material).dispose();
    }
    const span = Math.ceil(radius * 2.4);
    this.floor = new GridHelper(span, Math.max(4, Math.round(span)), 0xc8c1b5, 0xe4ded3);
    this.floor.position.set(centre.x, box.min.y - 0.05, centre.z);
    this.world.add(this.floor);
    this.target.copy(centre);
    const fit = radius / Math.sin((this.camera.fov * DEG) / 2);
    this.start = { theta: 0.55, phi: 1.12, radius: fit * 0.78 };
    this.orbit = { ...this.start };
    this.placeCamera();
  }

  private async loadGltf(url: string, parts: Part[]) {
    const generation = this.generation;
    let gltf: { scene: Group };
    try {
      gltf = await new GLTFLoader().loadAsync(url);
    } catch {
      if (!this.disposed && generation === this.generation) this.events.onGltfFailed();
      return;
    }
    if (this.disposed || generation !== this.generation) return;
    const model = gltf.scene;
    // the file's size and place do not matter: scaled to the size of the shapes' product, on the floor of the view
    const fileBox = new Box3().setFromObject(model);
    const shapesBox = new Box3();
    this.slots.forEach((s) => shapesBox.expandByPoint(s.at));
    const fileSize = fileBox.getSize(new Vector3()).length() || 1;
    const scale = Math.max(4, shapesBox.getSize(new Vector3()).length()) / fileSize;
    const holder = new Group();
    holder.scale.setScalar(scale);
    holder.position.copy(fileBox.getCenter(new Vector3()).multiplyScalar(-scale));
    holder.add(model);
    this.world.add(holder);
    this.world.updateMatrixWorld(true);
    model.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      this.geometries.push(mesh.geometry);
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => this.materials.push(m));
    });
    const ids = new Map(parts.map((p) => [p.id.toLowerCase(), p.id]));
    const found = new Map<string, Mesh[]>();
    model.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      for (let n: Object3D | null = mesh; n && n !== model; n = n.parent) {
        const id = ids.get(n.name.toLowerCase());
        if (id) {
          if (!found.has(id)) found.set(id, []);
          found.get(id)!.push(mesh);
          return;
        }
      }
    });
    if (!found.size) return;
    // a part in the file: its meshes, where the file has them, replace the shape; it moves out from its own middle
    const moved: Part[] = parts.map((p) => ({ ...p }));
    for (const [id, meshes] of found) {
      const slot = this.slots.find((s) => s.id === id)!;
      const box = new Box3();
      meshes.forEach((m) => box.expandByObject(m));
      const centre = box.getCenter(new Vector3());
      slot.group.clear();
      slot.ghost.clear();
      slot.group.position.copy(centre);
      slot.group.updateMatrixWorld(true);
      slot.materials = [];
      for (const mesh of meshes) {
        slot.group.attach(mesh);
        const ghost = new Mesh(mesh.geometry, this.ghostMaterial);
        ghost.applyMatrix4(mesh.matrix);
        slot.ghost.add(ghost);
        // a material of its own, to light it up without lighting up the rest of the file
        const own = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).clone() as MeshStandardMaterial;
        mesh.material = own;
        this.materials.push(own);
        slot.materials.push(own);
      }
      slot.at = centre.clone();
      slot.ghost.position.copy(centre);
      const p = moved.find((x) => x.id === id)!;
      p.at = [centre.x, centre.y, centre.z];
      delete p.start;
    }
    const starts = startPositions(moved);
    this.slots.forEach((s, i) => found.has(s.id) && s.start.copy(toVector(starts[i])));
    this.frame();
    if (this.input) this.place(this.input, true);
    this.highlight();
    this.draw();
  }

  // ------------------------------------------------------------ moving

  private place(input: SceneInput, now: boolean) {
    const t = performance.now();
    for (const s of this.slots) {
      const to = input.assembled.has(s.id) ? s.at : s.start;
      if (now) {
        s.group.position.copy(to);
        s.from.copy(to);
        s.to.copy(to);
        s.t0 = 0;
      } else if (!s.to.equals(to)) {
        s.from.copy(s.group.position);
        s.to.copy(to);
        s.t0 = t;
      }
    }
    if (!now) this.animate();
  }

  /** Whether a part is still on its way. */
  get animating() {
    return this.slots.some((s) => s.t0 > 0);
  }

  private animate = () => {
    if (this.disposed) return;
    const t = performance.now();
    let busy = false;
    for (const s of this.slots) {
      if (!s.t0) continue;
      const f = Math.min(1, (t - s.t0) / DURATION);
      const e = ease(f);
      s.group.position.lerpVectors(s.from, s.to, e);
      // a small arc, so a part goes over the others instead of through them
      s.group.position.y += Math.sin(Math.PI * f) * Math.min(2, s.from.distanceTo(s.to) * 0.18);
      if (f >= 1) {
        s.group.position.copy(s.to);
        s.t0 = 0;
      } else busy = true;
    }
    this.renderNow();
    if (busy) requestAnimationFrame(this.animate);
  };

  private highlight() {
    const id = this.input?.highlight ?? this.hovered;
    for (const s of this.slots) {
      const on = s.id === id;
      s.materials.forEach((m) => "emissive" in m && m.emissive.copy(on ? HIGHLIGHT : new Color(0x000000)).multiplyScalar(on ? 0.22 : 0));
      // the ghost shows where a loose part goes (in a disassembly: where a removed part was)
      s.ghost.visible = on && !!this.input && !this.input.assembled.has(s.id);
    }
  }

  // ------------------------------------------------------------ the camera

  private placeCamera() {
    const { theta, phi, radius } = this.orbit;
    this.camera.position.set(
      this.target.x + radius * Math.sin(phi) * Math.sin(theta),
      this.target.y + radius * Math.cos(phi),
      this.target.z + radius * Math.sin(phi) * Math.cos(theta)
    );
    this.camera.lookAt(this.target);
  }

  /** Turn (radians) and zoom (factor); the keyboard and the buttons call this. */
  turn(dTheta: number, dPhi: number, zoom = 1) {
    this.orbit.theta += dTheta;
    this.orbit.phi = Math.max(0.15, Math.min(Math.PI - 0.15, this.orbit.phi + dPhi));
    this.orbit.radius = Math.max(this.start.radius * 0.3, Math.min(this.start.radius * 3, this.orbit.radius * zoom));
    this.placeCamera();
    this.draw();
  }

  resetView() {
    this.orbit = { ...this.start };
    this.placeCamera();
    this.draw();
  }

  /** The camera's angles, for tests. */
  get view() {
    return { ...this.orbit };
  }

  // ------------------------------------------------------------ pointer

  private ray(e: { clientX: number; clientY: number }) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const caster = new Raycaster();
    caster.setFromCamera(ndc, this.camera);
    return caster;
  }

  /** The part under the pointer (raycasting), or null. */
  pick(e: { clientX: number; clientY: number }): string | null {
    const hits = this.ray(e).intersectObjects(this.slots.map((s) => s.group), true);
    for (const hit of hits) {
      if (!(hit.object as Mesh).isMesh) continue;
      let o: Object3D | null = hit.object;
      while (o && !o.userData?.id) o = o.parent;
      if (o) return o.userData.id as string;
    }
    return null;
  }

  /** Where a part is on the page now (its middle), for tests. */
  screenPoint(id: string) {
    const s = this.slots.find((x) => x.id === id);
    if (!s) return null;
    const box = new Box3().setFromObject(s.group);
    const v = box.getCenter(new Vector3()).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  private setHover(id: string | null) {
    if (id === this.hovered) return;
    this.hovered = id;
    this.renderer.domElement.style.cursor = id && this.input?.interactive ? "pointer" : "grab";
    this.events.onHover(id);
    this.highlight();
    this.draw();
  }

  private onPointerDown = (e: PointerEvent) => {
    this.renderer.domElement.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      this.pressed = null;
      const [a, b] = [...this.pointers.values()];
      this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      return;
    }
    this.pressed = { x: e.clientX, y: e.clientY, moved: false };
  };

  private onPointerMove = (e: PointerEvent) => {
    const previous = this.pointers.get(e.pointerId);
    if (!previous) {
      if (e.pointerType !== "touch") this.setHover(this.pick(e));
      return;
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch > 0 && d > 0) this.turn(0, 0, this.pinch / d);
      this.pinch = d;
      return;
    }
    if (this.pressed && Math.hypot(e.clientX - this.pressed.x, e.clientY - this.pressed.y) > 5) this.pressed.moved = true;
    if (this.pressed?.moved) {
      const r = this.renderer.domElement.getBoundingClientRect();
      this.renderer.domElement.style.cursor = "grabbing";
      this.turn((-(e.clientX - previous.x) / r.width) * Math.PI * 1.4, (-(e.clientY - previous.y) / r.height) * Math.PI * 0.8);
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = 0;
    const pressed = this.pressed;
    this.pressed = null;
    if (pressed && !pressed.moved && this.input?.interactive) {
      const id = this.pick(e);
      if (id) this.events.onPick(id);
    }
    this.renderer.domElement.style.cursor = this.hovered && this.input?.interactive ? "pointer" : "grab";
  };

  private onPointerCancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    this.pressed = null;
    this.pinch = 0;
  };

  private onPointerLeave = () => {
    if (!this.pointers.size) this.setHover(null);
  };

  private onWheel = (e: WheelEvent) => {
    // zoom only with Ctrl (or a pinch on a touchpad): a plain wheel scrolls the page
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    this.turn(0, 0, Math.exp(e.deltaY * 0.002));
  };

  // ------------------------------------------------------------ drawing

  private resize() {
    if (!this.host.isConnected) return this.dispose();
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.draw();
  }

  private draw() {
    if (this.disposed || this.pending) return;
    // one render per frame, however many changes
    this.pending = requestAnimationFrame(() => {
      this.pending = 0;
      this.renderNow();
    });
  }

  /** Renders now (tests, screenshots). */
  renderNow() {
    if (!this.disposed) this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.pending);
    clearInterval(this.watch);
    this.observer.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointercancel", this.onPointerCancel);
    canvas.removeEventListener("pointerleave", this.onPointerLeave);
    canvas.removeEventListener("wheel", this.onWheel);
    this.clearWorld();
    this.ghostMaterial.dispose();
    this.edgeMaterial.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
  }
}
