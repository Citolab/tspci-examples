// The 3D model: balls and sticks (CPK colours, the element's letter on every ball, so colour is never the only cue),
// double and triple bonds as two or three sticks. Drag (mouse, touch, pen) or the arrow keys turn the model; the wheel
// zooms. A click without dragging picks an atom or a bond (raycasting). Renders on demand; a change of shape glides
// (or jumps with prefers-reduced-motion). Without WebGL the constructor throws and the caller shows the structural
// formula. dispose() frees the WebGL context; so does taking the canvas out of the page.
import {
  AmbientLight,
  CanvasTexture,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { ELEMENTS, ElementSymbol, Molecule } from "./molecule";
import type { Vec } from "./geometry";

export type Pick = { atom: number } | { bond: [number, number] } | null;

export type SceneInput = {
  molecule: Molecule;
  positions: Map<number, Vec>;
  selected: number | null;
  connectFrom: number | null;
  reducedMotion: boolean;
};

const ballRadius = (el: ElementSymbol) => 0.26 + 0.28 * ELEMENTS[el].radius;
const UP = new Vector3(0, 1, 0);

const letterTexture = (el: ElementSymbol): Texture => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const g = canvas.getContext("2d");
  if (g) {
    g.font = `bold ${el.length > 1 ? 62 : 78}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 8;
    g.strokeStyle = ELEMENTS[el].color;
    g.strokeText(el, 64, 68);
    g.fillStyle = ELEMENTS[el].text;
    g.fillText(el, 64, 68);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

const ringTexture = (dashed: boolean): Texture => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const g = canvas.getContext("2d");
  if (g) {
    g.lineWidth = 9;
    g.strokeStyle = "#ffffff";
    g.beginPath();
    g.arc(64, 64, 54, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 6;
    g.strokeStyle = dashed ? "#b45309" : "#0369a1";
    if (dashed) g.setLineDash([14, 10]);
    g.beginPath();
    g.arc(64, 64, 54, 0, Math.PI * 2);
    g.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

export class MoleculeScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(35, 1.6, 0.1, 200);
  private model = new Group();
  private labels = new Group();
  private sphere = new SphereGeometry(1, 32, 20);
  private stick = new CylinderGeometry(1, 1, 1, 16);
  private materials = new Map<string, MeshStandardMaterial>();
  private letters = new Map<string, Texture>();
  private rings = { selected: ringTexture(false), connect: ringTexture(true) };
  private input: SceneInput | null = null;
  private shown = new Map<number, Vec>();
  private from = new Map<number, Vec>();
  private animation: { start: number; frame: number } | null = null;
  private zoom = 1;
  private radius = 2;
  private observer: ResizeObserver;
  private disposed = false;
  private drag: { x: number; y: number; moved: boolean; id: number } | null = null;
  private raycaster = new Raycaster();
  onPick: (pick: Pick) => void = () => {};

  constructor(private host: HTMLElement) {
    // throws without WebGL: the caller shows the structural formula
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

    this.scene.add(new AmbientLight(0xffffff, 1.4));
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 6, 8);
    const rim = new DirectionalLight(0xffffff, 0.7);
    rim.position.set(-6, -2, -4);
    this.scene.add(key, rim, this.model, this.labels);
    this.model.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), 0.25);

    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", () => (this.drag = null));
    canvas.addEventListener("wheel", this.wheel, { passive: false });

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }

  get canvas() {
    return this.renderer.domElement;
  }

  private material(color: string) {
    let m = this.materials.get(color);
    if (!m) {
      m = new MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05 });
      this.materials.set(color, m);
    }
    return m;
  }

  private letter(el: ElementSymbol) {
    let t = this.letters.get(el);
    if (!t) this.letters.set(el, (t = letterTexture(el)));
    return t;
  }

  update(input: SceneInput) {
    const before = this.input;
    this.input = input;
    // glide from where the atoms are shown now to the new layout
    const changed = !before || [...input.positions].some(([id, p]) => {
      const q = this.shown.get(id);
      return !q || Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + Math.abs(q[2] - p[2]) > 1e-3;
    });
    if (changed && !input.reducedMotion && before) {
      this.from = new Map(this.shown);
      if (this.animation) cancelAnimationFrame(this.animation.frame);
      this.animation = { start: performance.now(), frame: 0 };
      this.animate();
    } else {
      if (this.animation) cancelAnimationFrame(this.animation.frame);
      this.animation = null;
      this.shown = new Map(input.positions);
      this.build();
    }
    let r = 1.2;
    for (const p of input.positions.values()) r = Math.max(r, Math.hypot(p[0], p[1], p[2]) + 0.6);
    this.radius = r;
    this.place();
  }

  private animate = () => {
    if (this.disposed || !this.animation || !this.input) return;
    if (!this.renderer.domElement.isConnected) return this.dispose();
    const t = Math.min(1, (performance.now() - this.animation.start) / 350);
    const ease = 1 - (1 - t) ** 3;
    this.shown = new Map();
    for (const [id, p] of this.input.positions) {
      const q = this.from.get(id) ?? p;
      this.shown.set(id, [q[0] + (p[0] - q[0]) * ease, q[1] + (p[1] - q[1]) * ease, q[2] + (p[2] - q[2]) * ease]);
    }
    this.build();
    if (t < 1) this.animation.frame = requestAnimationFrame(this.animate);
    else this.animation = null;
  };

  /** The meshes for the molecule as it is shown now (a few dozen atoms: built anew each time). */
  private build() {
    if (this.disposed || !this.input) return;
    const { molecule, selected, connectFrom } = this.input;
    this.model.clear();
    for (const sprite of this.labels.children) ((sprite as Sprite).material as SpriteMaterial).dispose();
    this.labels.clear();
    const at = (id: number) => new Vector3(...(this.shown.get(id) ?? [0, 0, 0]));
    for (const a of molecule.atoms) {
      const r = ballRadius(a.el);
      const ball = new Mesh(this.sphere, this.material(ELEMENTS[a.el].color));
      ball.scale.setScalar(r);
      ball.position.copy(at(a.id));
      ball.userData = { atom: a.id };
      this.model.add(ball);
      const label = new Sprite(new SpriteMaterial({ map: this.letter(a.el), transparent: true, depthWrite: false }));
      label.userData = { atom: a.id, offset: r * 1.02, size: r * 1.35 };
      label.renderOrder = 2;
      this.labels.add(label);
      if (a.id === selected || a.id === connectFrom) {
        const ring = new Sprite(new SpriteMaterial({ map: a.id === connectFrom ? this.rings.connect : this.rings.selected, transparent: true, depthTest: false }));
        ring.userData = { atom: a.id, offset: 0, size: r * 2.7 };
        ring.renderOrder = 3;
        this.labels.add(ring);
      }
    }
    for (const b of molecule.bonds) {
      const p = at(b.a), q = at(b.b);
      const dir = q.clone().sub(p);
      const len = dir.length();
      if (len < 1e-4) continue;
      dir.normalize();
      // the sticks of a double bond lie in the plane of a third atom, if there is one
      const third = molecule.bonds.find((x) => x !== b && (x.a === b.a || x.b === b.a || x.a === b.b || x.b === b.b));
      let side = new Vector3(0, 0, 1);
      if (third) {
        const centre = third.a === b.a || third.b === b.a ? b.a : b.b;
        const o = third.a === centre ? third.b : third.a;
        side = at(o).sub(at(centre));
      }
      let perp = new Vector3().crossVectors(dir, side);
      if (perp.lengthSq() < 1e-6) perp = new Vector3().crossVectors(dir, Math.abs(dir.y) < 0.9 ? UP : new Vector3(1, 0, 0));
      perp.normalize().cross(dir).normalize();
      const radius = b.order === 1 ? 0.11 : 0.075;
      const gap = 0.17;
      const offsets = b.order === 1 ? [0] : b.order === 2 ? [-gap / 2, gap / 2] : [-gap, 0, gap];
      for (const o of offsets) {
        const stick = new Mesh(this.stick, this.material("#a8b3c2"));
        stick.scale.set(radius, len, radius);
        stick.position.copy(p.clone().add(q).multiplyScalar(0.5).add(perp.clone().multiplyScalar(o)));
        stick.quaternion.setFromUnitVectors(UP, dir);
        stick.userData = { bond: [b.a, b.b] };
        this.model.add(stick);
      }
    }
    this.draw();
  }

  /** The camera far enough back for the whole molecule. */
  private place() {
    const fit = this.radius / Math.sin((this.camera.fov * Math.PI) / 360) / Math.min(1, this.camera.aspect);
    this.camera.position.set(0, 0, Math.max(4, fit * 1.05) / this.zoom);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.draw();
  }

  private resize() {
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.place();
  }

  private draw() {
    if (this.disposed) return;
    if (!this.renderer.domElement.isConnected && this.input) return this.dispose();
    this.model.updateMatrixWorld(true);
    const toCamera = this.camera.position.clone().normalize();
    for (const s of this.labels.children) {
      const id = s.userData.atom as number;
      const ball = this.model.children.find((c) => c.userData.atom === id);
      if (!ball) continue;
      s.position.copy(ball.getWorldPosition(new Vector3()).add(toCamera.clone().multiplyScalar(s.userData.offset)));
      s.scale.setScalar(s.userData.size);
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Turns the model about the screen's axes (radians). */
  rotate(dx: number, dy: number) {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), dx).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), dy));
    this.model.quaternion.premultiply(q);
    this.draw();
  }

  zoomBy(factor: number) {
    this.zoom = Math.min(3, Math.max(0.5, this.zoom * factor));
    this.place();
  }

  resetView() {
    this.zoom = 1;
    this.model.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), 0.25);
    this.place();
  }

  /** The model's turn, for tests. */
  get rotation() {
    const q = this.model.quaternion;
    return [q.x, q.y, q.z, q.w];
  }

  /** What is under a point of the canvas (client coordinates). */
  pick(clientX: number, clientY: number): Pick {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const point = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(point, this.camera);
    const hit = this.raycaster.intersectObjects(this.model.children, false)[0];
    if (!hit) return null;
    const data = (hit.object as Object3D).userData;
    return data.atom !== undefined ? { atom: data.atom } : data.bond ? { bond: data.bond } : null;
  }

  /** Where an atom is drawn on the screen (client coordinates), for tests and the help. */
  screenOf(id: number): { x: number; y: number } | null {
    const ball = this.model.children.find((c) => c.userData.atom === id);
    if (!ball) return null;
    const v = ball.getWorldPosition(new Vector3()).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  private pointerDown = (e: PointerEvent) => {
    this.drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
    try {
      this.renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      // a synthetic event without an active pointer
    }
  };

  private pointerMove = (e: PointerEvent) => {
    if (!this.drag || this.drag.id !== e.pointerId) return;
    const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
    if (!this.drag.moved && Math.hypot(dx, dy) < 4) return;
    this.drag.moved = true;
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    this.rotate(dx * 0.01, dy * 0.01);
  };

  private pointerUp = (e: PointerEvent) => {
    const drag = this.drag;
    this.drag = null;
    if (drag && !drag.moved) this.onPick(this.pick(e.clientX, e.clientY));
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.animation) cancelAnimationFrame(this.animation.frame);
    this.observer.disconnect();
    for (const sprite of this.labels.children) ((sprite as Sprite).material as SpriteMaterial).dispose();
    this.sphere.dispose();
    this.stick.dispose();
    this.materials.forEach((m) => m.dispose());
    this.letters.forEach((t) => t.dispose());
    this.rings.selected.dispose();
    this.rings.connect.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
