// The 3D model: the parts of a built-in model (models.ts, simple shapes) or of the author's glTF, each a group of
// meshes. Drag (mouse, touch, pen) turns the model, two fingers or the wheel zoom; a click without dragging picks the
// part under the pointer (raycasting; a volume such as the vitreous body gives way to the part inside it). Parts the
// candidate hovers, focuses or chose get an outline (a hull of back faces, thicker when chosen), so the highlight is
// a shape and not only a colour. Explode moves the parts apart; the cut-away removes one side of the model (a
// clipping plane that turns with the model). Renders on demand. Without WebGL the constructor throws and the caller
// shows the list only. dispose() frees the WebGL context; so does taking the canvas out of the page.
import {
  AmbientLight,
  BackSide,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Euler,
  Group,
  LatheGeometry,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  Quaternion,
  Raycaster,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ModelDef, Piece, partIdOf } from "./models";

export type ScenePart = { id: string; name: string };

type PartView = {
  id: string;
  group: Group;
  meshes: Mesh[];
  hulls: Mesh[];
  explode: Vector3;
  /** a point of the part in the model's own space, for its marker */
  anchor: Vector3;
  opacity: number;
  volume: boolean;
};

const UP = new Vector3(0, 1, 0);
const COLORS = { hover: new Color("#111827"), chosen: new Color("#0b4f8a") };
const THIN = 0.0045;
const THICK = 0.009;

const outlineMaterial = (color: Color, thickness: number) =>
  new ShaderMaterial({
    uniforms: { color: { value: color }, thickness: { value: thickness } },
    vertexShader: `
      uniform float thickness;
      #include <clipping_planes_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        mvPosition.xyz += n * thickness * max(0.5, -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `
      uniform vec3 color;
      #include <clipping_planes_pars_fragment>
      void main() {
        #include <clipping_planes_fragment>
        gl_FragColor = vec4(color, 1.0);
      }`,
    side: BackSide,
    clipping: true,
  });

const geometryOf = (piece: Piece): BufferGeometry => {
  const s = piece.shape;
  switch (s.kind) {
    case "sphere":
      return new SphereGeometry(s.r, 40, 28, 0, Math.PI * 2, s.theta?.[0] ?? 0, s.theta?.[1] ?? Math.PI);
    case "cylinder":
      return new CylinderGeometry(s.r2 ?? s.r, s.r, s.h, 32);
    case "capsule":
      return new CapsuleGeometry(s.r, s.length, 6, 16);
    case "box":
      return new BoxGeometry(...s.size);
    case "torus":
      return new TorusGeometry(s.r, s.tube, 14, 72);
    case "ring": {
      const h = s.thick / 2;
      return new LatheGeometry([new Vector2(s.inner, -h), new Vector2(s.outer, -h), new Vector2(s.outer, h), new Vector2(s.inner, h), new Vector2(s.inner, -h)], 64);
    }
    case "rod":
      return new CylinderGeometry(s.r, s.r, new Vector3(...s.from).distanceTo(new Vector3(...s.to)), 12);
    case "path":
      return new TubeGeometry(new CatmullRomCurve3(s.points.map((p) => new Vector3(...p)), !!s.closed, "catmullrom", 0.5), s.closed ? 120 : 48, s.r, 8, !!s.closed);
  }
};

const placePiece = (mesh: Mesh, piece: Piece) => {
  const s = piece.shape;
  if (s.kind === "rod") {
    const from = new Vector3(...s.from), to = new Vector3(...s.to);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, to.clone().sub(from).normalize());
    return;
  }
  if (piece.at) mesh.position.set(...piece.at);
  if (piece.turn) mesh.rotation.copy(new Euler(piece.turn[0], piece.turn[1], piece.turn[2], "YXZ"));
  if (piece.scale) mesh.scale.set(...piece.scale);
};

export class HotspotScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(35, 1.6, 0.05, 200);
  /** turned by the candidate */
  private root = new Group();
  /** the model, centred */
  private content = new Group();
  private parts = new Map<string, PartView>();
  private geometries: BufferGeometry[] = [];
  private materials: Material[] = [];
  private hullMaterials = { hover: outlineMaterial(COLORS.hover, THIN), chosen: outlineMaterial(COLORS.chosen, THICK), both: outlineMaterial(COLORS.hover, THICK) };
  private view = new Quaternion();
  private radius = 1.5;
  private zoom = 1;
  private explodeBy = 0;
  private cutBy = 0;
  private cutAxis = new Vector3(1, 0, 0);
  private plane = new Plane(new Vector3(-1, 0, 0), 10);
  private hidden = new Set<string>();
  private selectable: Set<string> | null = null;
  private highlight = { hover: null as string | null, focus: null as string | null, chosen: new Set<string>() };
  private observer: ResizeObserver;
  private disposed = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; moved: boolean; id: number; pinch: number } | null = null;
  private raycaster = new Raycaster();
  private generation = 0;
  /** a click chose a part; `previous` the part the click before on the same spot chose (null for a new spot) */
  onPick: (id: string | null, previous: string | null) => void = () => {};
  /** the part a click there would choose; `behind`: clicking again chooses a part behind it */
  onHover: (id: string | null, behind: boolean) => void = () => {};
  /** after every frame: the markers follow */
  onDraw: () => void = () => {};

  constructor(private host: HTMLElement) {
    // throws without WebGL: the caller shows the list only
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

    this.scene.add(new AmbientLight(0xffffff, 1.3));
    const key = new DirectionalLight(0xffffff, 2.1);
    key.position.set(3, 5, 8);
    const rim = new DirectionalLight(0xffffff, 0.8);
    rim.position.set(-6, -2, -5);
    this.root.add(this.content);
    this.scene.add(key, rim, this.root);

    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.pointerCancel);
    canvas.addEventListener("pointerleave", this.pointerLeave);
    canvas.addEventListener("wheel", this.wheel, { passive: false });

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }

  get canvas() {
    return this.renderer.domElement;
  }

  private clear() {
    this.generation++;
    this.content.clear();
    this.parts.clear();
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.geometries = [];
    this.materials = [];
  }

  private addHulls(view: PartView) {
    for (const mesh of view.meshes) {
      const hull = new Mesh(mesh.geometry, this.hullMaterials.hover);
      hull.visible = false;
      hull.raycast = () => {};
      hull.renderOrder = -1;
      mesh.add(hull);
      view.hulls.push(hull);
    }
  }

  /** The parts of a built-in model, as meshes. */
  setModel(model: ModelDef) {
    this.clear();
    for (const def of model.parts) {
      const group = new Group();
      const opacity = def.opacity ?? 1;
      const material = new MeshStandardMaterial({
        color: def.color, roughness: 0.55, metalness: 0.05, side: DoubleSide, transparent: opacity < 1, opacity, depthWrite: opacity >= 0.6,
      });
      this.materials.push(material);
      const meshes = def.pieces.map((piece) => {
        const geometry = geometryOf(piece);
        this.geometries.push(geometry);
        const mesh = new Mesh(geometry, material);
        placePiece(mesh, piece);
        mesh.userData.part = def.id;
        if (opacity < 1) mesh.renderOrder = 1;
        group.add(mesh);
        return mesh;
      });
      group.updateMatrixWorld(true);
      const anchor = new Box3().setFromObject(meshes[0]).getCenter(new Vector3());
      const view: PartView = { id: def.id, group, meshes, hulls: [], explode: new Vector3(...def.explode), anchor, opacity, volume: !!def.volume };
      this.addHulls(view);
      this.parts.set(def.id, view);
      this.content.add(group);
    }
    this.cutAxis.set(...model.cut);
    this.view.setFromEuler(new Euler(model.view[0], model.view[1], 0, "XYZ"));
    this.fit();
    this.resetView();
  }

  /**
   * The author's glTF: every mesh belongs to the part of its own name, or of the nearest node above it with a name in
   * `known` (when there is such a list). Resolves with the parts found, in the file's order.
   */
  async loadGltf(url: string, known: string[] = []): Promise<ScenePart[]> {
    this.clear();
    const generation = this.generation;
    const gltf = await new GLTFLoader().loadAsync(url);
    if (this.disposed || generation !== this.generation) return [];
    const model = gltf.scene;
    const wanted = new Set(known);
    // the names in the file itself (the loader makes up names such as "mesh_0_instance_3", and turns spaces into _)
    const key = (name: string) => String(name ?? "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    const json = (gltf.parser as any)?.json ?? {};
    const given = new Map<string, string>();
    for (const def of [...(json.nodes ?? []), ...(json.meshes ?? [])]) if (def?.name) given.set(key(def.name), def.name);
    const found = new Map<string, { name: string; meshes: Mesh[] }>();
    model.updateMatrixWorld(true);
    model.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      let node: Object3D | null = mesh, id = "", name = "";
      while (node && node !== model) {
        const original = given.get(key(node.name));
        const candidate = original ? partIdOf(original) : "";
        if (candidate && (!wanted.size || wanted.has(candidate))) {
          id = candidate;
          name = original;
          break;
        }
        node = node.parent;
      }
      if (!id) return;
      if (!found.has(id)) found.set(id, { name, meshes: [] });
      found.get(id)!.meshes.push(mesh);
    });
    // the whole file, centred in the model; the parts' meshes in a group per part (keeping where they are)
    const box = new Box3().setFromObject(model);
    const centre = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3()).length() / 2 || 1;
    const scale = 1.4 / size;
    model.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      this.geometries.push(mesh.geometry);
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        (m as MeshStandardMaterial).side = DoubleSide;
        this.materials.push(m);
      }
    });
    const holder = new Group();
    holder.scale.setScalar(scale);
    holder.position.copy(centre).multiplyScalar(-scale);
    holder.add(model);
    this.content.add(holder);
    const toModel = model.matrixWorld.clone().invert();
    for (const [id, { meshes }] of found) {
      // where the part is, in the file's own space (before its meshes move to a group of their own)
      const partBox = new Box3();
      meshes.forEach((m) => partBox.expandByObject(m));
      const anchor = new Box3().setFromObject(meshes[0]).getCenter(new Vector3()).applyMatrix4(toModel);
      const out = partBox.getCenter(new Vector3()).sub(centre);
      const explode = out.lengthSq() > 1e-9 ? out.normalize().multiplyScalar(size * 0.6) : new Vector3(0, size * 0.6, 0);
      const group = new Group();
      for (const mesh of meshes) {
        const local = toModel.clone().multiply(mesh.matrixWorld);
        group.add(mesh);
        local.decompose(mesh.position, mesh.quaternion, mesh.scale);
        mesh.userData.part = id;
      }
      model.add(group);
      const view: PartView = { id, group, meshes, hulls: [], explode, anchor, opacity: 1, volume: false };
      this.addHulls(view);
      this.parts.set(id, view);
    }
    this.cutAxis.set(1, 0, 0);
    this.view.identity();
    this.fit();
    this.resetView();
    return [...found].map(([id, { name }]) => ({ id, name }));
  }

  /** The parts of the model now, in its order. */
  get partIds() {
    return [...this.parts.keys()];
  }

  private fit() {
    // the size of the model together; exploded it may stick out a little
    for (const p of this.parts.values()) p.group.position.set(0, 0, 0);
    this.content.position.set(0, 0, 0);
    this.content.updateMatrixWorld(true);
    const box = new Box3().setFromObject(this.content);
    const centre = box.isEmpty() ? new Vector3() : box.getCenter(new Vector3());
    this.content.position.copy(centre).negate();
    const spread = Math.max(0, ...[...this.parts.values()].map((p) => p.explode.length()));
    this.radius = box.isEmpty() ? 1.5 : Math.max(0.5, box.getSize(new Vector3()).length() / 2 + spread * 0.15);
    this.applyExplode();
    this.place();
  }

  /** Only these parts can be picked and highlighted (null: all). */
  setSelectable(ids: string[] | null) {
    this.selectable = ids ? new Set(ids) : null;
    this.paint();
  }

  setHighlight(hover: string | null, focus: string | null, chosen: string[]) {
    this.highlight = { hover, focus, chosen: new Set(chosen) };
    this.paint();
  }

  setHidden(ids: string[]) {
    this.resetCycle();
    this.hidden = new Set(ids);
    for (const p of this.parts.values()) p.group.visible = !this.hidden.has(p.id);
    this.draw();
  }

  /** 0: together, 1: fully apart */
  setExplode(t: number) {
    this.resetCycle();
    this.explodeBy = Math.max(0, Math.min(1, t));
    this.applyExplode();
    this.draw();
  }

  /** 0: the whole model, 1: cut to the middle */
  setCut(t: number) {
    this.resetCycle();
    this.cutBy = Math.max(0, Math.min(1, t));
    this.draw();
  }

  private applyExplode() {
    for (const p of this.parts.values()) p.group.position.copy(p.explode).multiplyScalar(this.explodeBy);
  }

  private paint() {
    const { hover, focus, chosen } = this.highlight;
    for (const p of this.parts.values()) {
      const can = !this.selectable || this.selectable.has(p.id);
      const pointed = can && (p.id === hover || p.id === focus);
      const isChosen = can && chosen.has(p.id);
      const material = isChosen ? (pointed ? this.hullMaterials.both : this.hullMaterials.chosen) : this.hullMaterials.hover;
      for (const h of p.hulls) {
        h.visible = pointed || isChosen;
        h.material = material;
      }
      // a see-through part shows its outline better a little less see-through
      if (p.opacity < 1) {
        const m = p.meshes[0].material as MeshStandardMaterial;
        m.opacity = pointed || isChosen ? Math.max(p.opacity, 0.6) : p.opacity;
      }
    }
    this.draw();
  }

  /** The camera far enough back for the whole model. */
  private place() {
    const fit = this.radius / Math.sin((this.camera.fov * Math.PI) / 360) / Math.min(1, this.camera.aspect);
    this.camera.position.set(0, 0, Math.max(1.5, fit * 0.8) / this.zoom);
    this.camera.near = 0.02;
    this.camera.far = 100;
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.draw();
  }

  private resize() {
    // the interaction left the page (a ResizeObserver reports that too): free the WebGL context
    if (!this.host.isConnected) return this.dispose();
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.place();
  }

  /** The cut-away plane, in the world: it turns with the model. */
  private updatePlane() {
    this.root.updateMatrixWorld(true);
    const axis = this.cutAxis.clone().applyQuaternion(this.root.quaternion).normalize();
    const reach = this.radius * 1.05 * (1 - this.cutBy);
    // keep the points p with dot(p, axis) <= reach
    this.plane.set(axis.clone().negate(), reach);
    this.renderer.clippingPlanes = this.cutBy > 0 ? [this.plane] : [];
  }

  private draw() {
    if (this.disposed) return;
    if (!this.renderer.domElement.isConnected && this.parts.size) return this.dispose();
    this.updatePlane();
    this.renderer.render(this.scene, this.camera);
    this.onDraw();
  }

  /** Turns the model about the screen's axes (radians). */
  rotate(dx: number, dy: number) {
    this.resetCycle();
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), dx).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), dy));
    this.root.quaternion.premultiply(q);
    this.draw();
  }

  zoomBy(factor: number) {
    this.resetCycle();
    this.zoom = Math.min(4, Math.max(0.6, this.zoom * factor));
    this.place();
  }

  resetView() {
    this.resetCycle();
    this.zoom = 1;
    this.root.quaternion.copy(this.view);
    this.place();
  }

  /** The model's turn and zoom, for tests. */
  get pose() {
    const q = this.root.quaternion;
    return { rotation: [q.x, q.y, q.z, q.w], zoom: this.zoom };
  }

  private pickable(id: string) {
    return !this.hidden.has(id) && (!this.selectable || this.selectable.has(id));
  }

  /**
   * The parts a click at a point of the canvas (client coordinates) can choose, front to back: every part the ray
   * passes up to and including the first one that is not see-through (nothing behind that can be seen). A volume
   * (the vitreous body, the cytoplasm) comes after the parts inside it. A part that cannot be chosen is skipped, but
   * when it is not see-through it still hides what lies behind it.
   */
  candidates(clientX: number, clientY: number): string[] {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const point = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(point, this.camera);
    this.updatePlane();
    const meshes = [...this.parts.values()].filter((p) => !this.hidden.has(p.id)).flatMap((p) => p.meshes);
    const hits = this.raycaster.intersectObjects(meshes, false).filter((h) => this.cutBy === 0 || this.plane.distanceToPoint(h.point) >= 0);
    const order: { id: string; key: number }[] = [];
    for (let i = 0; i < hits.length; i++) {
      const id = hits[i].object.userData.part as string;
      const part = this.parts.get(id);
      if (!part || order.some((o) => o.id === id)) continue;
      // a volume sorts where the ray leaves it, after the parts inside it
      const exit = part.volume ? hits.find((h, j) => j > i && h.object.userData.part === id) : undefined;
      order.push({ id, key: exit ? exit.distance : hits[i].distance });
      if (!part.volume && part.opacity >= 1) break;
    }
    order.sort((x, y) => x.key - y.key);
    const result: string[] = [];
    for (const { id } of order) {
      const part = this.parts.get(id)!;
      if (this.pickable(id)) result.push(id);
      // what a click can reach ends at the first part that is not see-through
      if (!part.volume && part.opacity >= 1) break;
    }
    return result;
  }

  /** The part a first click at a point chooses (the front one); null when there is none. */
  pick(clientX: number, clientY: number): string | null {
    return this.candidates(clientX, clientY)[0] ?? null;
  }

  /**
   * Clicks on the same spot go through the parts there, front to back (a see-through cornea, then the iris behind
   * it, …). Turning, zooming or changing the view starts again at the front.
   */
  private cycle: { x: number; y: number; ids: string[]; index: number } | null = null;
  private resetCycle() {
    this.cycle = null;
  }
  /** Which part a click at this point chooses, and whether there are parts behind it. */
  private next(clientX: number, clientY: number) {
    const ids = this.candidates(clientX, clientY);
    const c = this.cycle;
    const same = !!c && Math.hypot(c.x - clientX, c.y - clientY) <= 6 && c.ids.join(" ") === ids.join(" ");
    const index = same && ids.length ? (c!.index + 1) % ids.length : 0;
    return { ids, index, same, id: ids[index] ?? null, behind: index < ids.length - 1 };
  }

  /**
   * A click as the candidate makes it (for tests too): the part it chooses, and the part the previous click on the
   * same spot chose (the candidate meant the part behind that one).
   */
  click(clientX: number, clientY: number) {
    const n = this.next(clientX, clientY);
    const previous = n.same && this.cycle ? this.cycle.ids[this.cycle.index] ?? null : null;
    this.cycle = n.ids.length ? { x: clientX, y: clientY, ids: n.ids, index: n.index } : null;
    this.onPick(n.id, previous);
    this.hover(clientX, clientY); // the next click there goes deeper: the hover says which part

  }

  /** Where the marker of a part goes: the host's coordinates (CSS pixels), or null when the part is hidden. */
  markerOf(id: string): { x: number; y: number } | null {
    const p = this.parts.get(id);
    if (!p || this.hidden.has(id)) return null;
    p.group.updateMatrixWorld(true);
    const v = p.anchor.clone().applyMatrix4(p.group.matrixWorld);
    if (this.cutBy > 0 && this.plane.distanceToPoint(v) < 0) return null;
    v.project(this.camera);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * this.host.clientWidth, y: ((1 - v.y) / 2) * this.host.clientHeight };
  }

  /**
   * A point of the canvas (client coordinates) where clicks reach the part, for tests: the spot where the fewest
   * parts lie in front of it, and how many clicks it takes there (1: the first click). Null when there is none.
   */
  pointBehind(id: string): { x: number; y: number; clicks: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    let best: { x: number; y: number; clicks: number } | null = null;
    for (let y = 4; y < rect.height; y += 6) {
      for (let x = 4; x < rect.width; x += 6) {
        const at = this.candidates(rect.left + x, rect.top + y).indexOf(id);
        if (at >= 0 && (!best || at + 1 < best.clicks)) best = { x: rect.left + x, y: rect.top + y, clicks: at + 1 };
      }
    }
    return best;
  }

  /** A point of the canvas (client coordinates) where a click picks the part, for tests: null when there is none. */
  pointOn(id: string): { x: number; y: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const m = this.markerOf(id);
    const tries: [number, number][] = [];
    if (m) tries.push([rect.left + m.x, rect.top + m.y]);
    for (let y = 4; y < rect.height; y += 6) for (let x = 4; x < rect.width; x += 6) tries.push([rect.left + x, rect.top + y]);
    for (const [x, y] of tries) if (this.pick(x, y) === id) return { x, y };
    return null;
  }

  private pointerDown = (e: PointerEvent) => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.drag = { x: e.clientX, y: e.clientY, moved: true, id: e.pointerId, pinch: Math.hypot(a.x - b.x, a.y - b.y) };
    } else this.drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId, pinch: 0 };
    try {
      this.renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      // a synthetic event without an active pointer
    }
  };

  private pointerMove = (e: PointerEvent) => {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!this.drag) {
      if (e.pointerType !== "touch") this.hover(e.clientX, e.clientY);
      return;
    }
    if (this.pointers.size === 2 && this.drag.pinch) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0) this.zoomBy(d / this.drag.pinch);
      this.drag.pinch = d;
      return;
    }
    if (this.drag.id !== e.pointerId) return;
    const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
    if (!this.drag.moved && Math.hypot(dx, dy) < 4) return;
    this.drag.moved = true;
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    this.rotate(dx * 0.01, dy * 0.01);
  };

  private hovered: string | null = null;
  private hoveredBehind = false;
  private hover(clientX: number | null, clientY = 0) {
    const n = clientX === null ? { id: null, behind: false } : this.next(clientX, clientY);
    this.renderer.domElement.style.cursor = n.id ? "pointer" : "grab";
    if (n.id === this.hovered && n.behind === this.hoveredBehind) return;
    this.hovered = n.id;
    this.hoveredBehind = n.behind;
    this.onHover(n.id, n.behind);
  }

  private pointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    const drag = this.drag;
    this.drag = null;
    if (drag && !drag.moved && drag.id === e.pointerId) this.click(e.clientX, e.clientY);
  };

  private pointerCancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    this.drag = null;
  };

  private pointerLeave = () => {
    if (!this.drag) this.hover(null);
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    this.clear();
    Object.values(this.hullMaterials).forEach((m) => m.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
