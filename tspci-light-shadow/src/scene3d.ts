// The 3D view: a floor with a bench ruler, the screen, the lamps and the object. The shadow on the screen is not a
// shadow map: it is the light map of optics.ts (traced from every lamp to every cell of the screen) painted on the
// screen as a texture, with a ruler every 10 cm. The light rays past the object's edges are real 3D lines.
// Turn the room by dragging (mouse, touch) or with the keyboard; a lamp or the object can be dragged (raycasting).
// Without WebGL the constructor throws and the interaction shows the drawing only. Renders on demand: no loop.
import {
  AmbientLight, BoxGeometry, BufferGeometry, CanvasTexture, CircleGeometry, Color, CylinderGeometry, DirectionalLight,
  DoubleSide, Float32BufferAttribute, Group, Line, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Object3D, PerspectiveCamera, Plane, PlaneGeometry, PointLight, Raycaster, Scene, Shape,
  ShapeGeometry, SphereGeometry, Sprite, SpriteMaterial, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
} from "three";
import { FIGURE, Measures, Positions, Scene as Setup } from "./optics";

const M = 0.01; // cm → scene units (m)
/** cm (distance to the screen, height, sideways) → the scene: the screen at x = 0, the lamps at negative x. */
const at = (x: number, y: number, z: number) => new Vector3(-x * M, y * M, z * M);

export type Picked = { kind: "lamp" | "object"; index: number };
export type SceneInput = {
  setup: Setup;
  positions: Positions;
  measures: Measures | null;
  /** the light map: columns × rows values from 0 to 1, row 0 at the top */
  light: { values: Float32Array; columns: number; rows: number };
  showRays: boolean;
  /** what the candidate may drag */
  movable: (p: Picked) => boolean;
};
export type SceneEvents = {
  /** a drag moved an item to (cm); axes: the two the drag plane gives */
  onDrag: (p: Picked, point: { x: number; y: number; z: number }, axes: ("x" | "y" | "z")[]) => void;
  onDragEnd: (p: Picked) => void;
};

const LAMP = 0xfacc15, OBJECT = 0x0f6cbd, ROD = 0x94a3b8, RAY = 0xd97706;

const labelSprite = (text: string) => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#0f172a";
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#fff";
  g.font = "bold 36px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 32, 34);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(0.12, 0.12, 1);
  sprite.renderOrder = 10;
  return sprite;
};

export class LightScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(38, 1.6, 0.05, 60);
  private world = new Group(); // rebuilt when the setup changes
  private rays: LineSegments<BufferGeometry, LineBasicMaterial>;
  private screenTexture: CanvasTexture;
  private screenCanvas = document.createElement("canvas");
  private lightCanvas = document.createElement("canvas");
  private lamps: Group[] = [];
  private object: Group | null = null;
  private input: SceneInput | null = null;
  private setupKey = "";
  private observer: ResizeObserver;
  private disposed = false;
  private pending = 0;
  private watch: ReturnType<typeof setInterval>;
  // the camera: around a target, angles in radians
  private orbit = { theta: -0.75, phi: 1.2, radius: 5.2 };
  private target = new Vector3(-1.4, 0.75, 0);
  private start = { theta: -0.75, phi: 1.2, radius: 5.2 };
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { picked: Picked; plane: Plane; offset: Vector3; axes: ("x" | "y" | "z")[] } | null = null;
  private pinch = 0;
  private hovered: Picked | null = null;

  constructor(private host: HTMLElement, private events: SceneEvents) {
    // throws without WebGL: the caller shows the drawing only
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

    this.scene.add(new AmbientLight(0xffffff, 1.5));
    const sun = new DirectionalLight(0xffffff, 0.9);
    sun.position.set(-2, 5, 4);
    this.scene.add(sun);

    const floor = new Mesh(new PlaneGeometry(30, 30), new MeshStandardMaterial({ color: 0xe7e0d4, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(-5, -0.001, 0);
    this.scene.add(floor);

    this.screenCanvas.width = 4;
    this.screenCanvas.height = 4;
    this.screenTexture = new CanvasTexture(this.screenCanvas);
    this.screenTexture.colorSpace = SRGBColorSpace;
    this.rays = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: RAY, transparent: true, opacity: 0.9 }));
    this.scene.add(this.world, this.rays);

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
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
    this.input = input;
    const key = JSON.stringify({ ...input.setup, solution: null, targets: null });
    if (key !== this.setupKey) {
      this.setupKey = key;
      this.build(input.setup);
    }
    input.positions.lamps.forEach((l, i) => this.lamps[i]?.position.copy(at(l.x, l.y, l.z)));
    this.object?.position.copy(at(input.positions.objectX, 0, 0));
    this.paintScreen(input);
    this.drawRays(input);
    this.highlight();
    this.draw();
  }

  // ------------------------------------------------------------ building

  private clearWorld() {
    this.world.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material as MeshBasicMaterial | undefined;
      if (material && material.map && material.map !== this.screenTexture) material.map.dispose();
      material?.dispose?.();
    });
    this.world.clear();
    this.lamps = [];
    this.object = null;
  }

  private build(setup: Setup) {
    this.clearWorld();
    const { width, height } = setup.screen;
    const far = Math.max(...setup.lamps.map((l) => l.move.x?.[1] ?? l.x)) + 30;

    // the screen on two feet, facing the lamps
    const screen = new Mesh(new PlaneGeometry(width * M, height * M), new MeshBasicMaterial({ map: this.screenTexture, side: DoubleSide }));
    screen.rotation.y = -Math.PI / 2;
    screen.position.set(0.002, (height * M) / 2, 0);
    this.world.add(screen);
    const frame = new Mesh(new BoxGeometry(0.03, height * M + 0.04, width * M + 0.04), new MeshStandardMaterial({ color: 0x334155 }));
    frame.position.set(0.018, (height * M) / 2, 0);
    this.world.add(frame);

    // the bench: a ruler on the floor from the screen to the farthest lamp, a tick every 10 cm
    const bench = new Mesh(new PlaneGeometry(far * M, 0.16), new MeshStandardMaterial({ color: 0xf8fafc, roughness: 1 }));
    bench.rotation.x = -Math.PI / 2;
    bench.position.set((-far * M) / 2, 0.001, 0);
    this.world.add(bench);
    const ticks: number[] = [];
    for (let x = 0; x <= far; x += 10) {
      const half = x % 50 === 0 ? 0.07 : 0.035;
      ticks.push(-x * M, 0.002, -half, -x * M, 0.002, half);
    }
    const tickGeometry = new BufferGeometry();
    tickGeometry.setAttribute("position", new Float32BufferAttribute(ticks, 3));
    this.world.add(new LineSegments(tickGeometry, new LineBasicMaterial({ color: 0x64748b })));

    // the lamps: a bulb on a stand, or a round lamp facing the screen; numbered when there are two
    setup.lamps.forEach((lamp, i) => {
      const g = new Group();
      g.userData = { kind: "lamp", index: i };
      const glow = new MeshBasicMaterial({ color: LAMP });
      if (lamp.size > 0) {
        const disc = new Mesh(new CircleGeometry((lamp.size / 2) * M, 40), glow);
        disc.rotation.y = Math.PI / 2; // facing the screen (+x)
        disc.position.x = 0.001;
        const housing = new Mesh(new CylinderGeometry((lamp.size / 2 + 1.5) * M, (lamp.size / 2 + 3) * M, 0.12, 40, 1, true), new MeshStandardMaterial({ color: 0x475569, side: DoubleSide }));
        housing.rotation.z = Math.PI / 2;
        housing.position.x = -0.06;
        const back = new Mesh(new CircleGeometry((lamp.size / 2 + 3) * M, 40), new MeshStandardMaterial({ color: 0x334155 }));
        back.rotation.y = -Math.PI / 2; // the closed back, away from the screen
        back.position.x = -0.12;
        g.add(disc, housing, back);
      } else {
        g.add(new Mesh(new SphereGeometry(0.035, 24, 16), glow));
      }
      const stand = new Mesh(new CylinderGeometry(0.008, 0.008, 1, 8), new MeshStandardMaterial({ color: ROD }));
      stand.name = "stand";
      g.add(stand);
      const foot = new Mesh(new CylinderGeometry(0.08, 0.09, 0.02, 24), new MeshStandardMaterial({ color: 0x475569 }));
      foot.name = "foot";
      g.add(foot);
      if (setup.lamps.length > 1) {
        const label = labelSprite(String(i + 1));
        label.position.y = (Math.max(lamp.size / 2, 4) + 9) * M;
        g.add(label);
      }
      const light = new PointLight(0xfff3c4, 3, 0, 1);
      g.add(light);
      this.lamps.push(g);
      this.world.add(g);
    });

    // the object on a thin rod
    const o = setup.object;
    const g = new Group();
    g.userData = { kind: "object", index: 0 };
    const material = new MeshStandardMaterial({ color: OBJECT, roughness: 0.55, side: DoubleSide });
    let body: Mesh;
    if (o.type === "ball") {
      body = new Mesh(new SphereGeometry((o.width / 2) * M, 40, 24), material);
      body.position.y = (o.elevation + o.width / 2) * M;
    } else if (o.type === "block") {
      body = new Mesh(new BoxGeometry(o.depth * M, o.height * M, o.width * M), material);
      body.position.y = (o.elevation + o.height / 2) * M;
    } else {
      const shape = new Shape(FIGURE.map(([u, v]) => new Vector2(u * o.width * M, v * o.height * M)));
      body = new Mesh(new ShapeGeometry(shape), material);
      body.rotation.y = -Math.PI / 2; // in the plane of the screen
      body.position.y = o.elevation * M;
    }
    body.name = "body";
    g.add(body);
    if (o.elevation > 0) {
      const rod = new Mesh(new CylinderGeometry(0.006, 0.006, o.elevation * M + (o.type === "ball" ? 0.02 : 0), 8), new MeshStandardMaterial({ color: ROD }));
      rod.position.y = (o.elevation * M) / 2;
      const foot = new Mesh(new CylinderGeometry(0.06, 0.07, 0.015, 24), new MeshStandardMaterial({ color: 0x475569 }));
      g.add(rod, foot);
    }
    this.object = g;
    this.world.add(g);

    // the light map's canvas and the screen's: three pixels per cm, at most 1024
    const scale = Math.min(3, 1024 / Math.max(width, height));
    this.screenCanvas.width = Math.round(width * scale);
    this.screenCanvas.height = Math.round(height * scale);
    this.screenTexture.dispose();
    this.screenTexture = new CanvasTexture(this.screenCanvas);
    this.screenTexture.colorSpace = SRGBColorSpace;
    (screen.material as MeshBasicMaterial).map = this.screenTexture;

    // the camera looks at the middle between the screen and the farthest lamp
    this.target.set((-far * M) / 2, (height * M) / 2, 0);
    const radius = Math.max(3, far * M * 1.25);
    this.start = { theta: -0.8, phi: 1.18, radius };
    this.orbit = { ...this.start };
    this.placeCamera();
  }

  /** The stands of the lamps reach the floor wherever the lamp is. */
  private fitStands(input: SceneInput) {
    input.positions.lamps.forEach((l, i) => {
      const g = this.lamps[i];
      if (!g) return;
      const stand = g.getObjectByName("stand") as Mesh, foot = g.getObjectByName("foot") as Mesh;
      const h = l.y * M;
      stand.scale.y = Math.max(0.001, h);
      stand.position.y = -h / 2;
      stand.position.x = input.setup.lamps[i].size > 0 ? -0.06 : 0;
      foot.position.set(stand.position.x, -h + 0.01, 0);
    });
  }

  private paintScreen(input: SceneInput) {
    this.fitStands(input);
    const { values, columns, rows } = input.light;
    const { width, height } = input.setup.screen;
    // the light, one pixel per cell, scaled up smoothly
    if (this.lightCanvas.width !== columns || this.lightCanvas.height !== rows) {
      this.lightCanvas.width = columns;
      this.lightCanvas.height = rows;
    }
    const small = this.lightCanvas.getContext("2d")!;
    const image = small.createImageData(columns, rows);
    const dark = [51, 65, 85], lit = [255, 252, 240];
    for (let i = 0; i < values.length; i++) {
      const f = values[i];
      image.data[i * 4] = dark[0] + (lit[0] - dark[0]) * f;
      image.data[i * 4 + 1] = dark[1] + (lit[1] - dark[1]) * f;
      image.data[i * 4 + 2] = dark[2] + (lit[2] - dark[2]) * f;
      image.data[i * 4 + 3] = 255;
    }
    small.putImageData(image, 0, 0);
    const g = this.screenCanvas.getContext("2d")!;
    const W = this.screenCanvas.width, H = this.screenCanvas.height;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.lightCanvas, 0, 0, W, H);
    // the ruler: a line every 10 cm, stronger every 50 cm, from the bottom and from the middle
    const px = W / width;
    g.lineWidth = Math.max(1, px * 0.25);
    for (let y = 0; y <= height; y += 10) {
      g.strokeStyle = y % 50 === 0 ? "rgba(30,41,59,0.45)" : "rgba(30,41,59,0.16)";
      g.beginPath();
      g.moveTo(0, H - y * px);
      g.lineTo(W, H - y * px);
      g.stroke();
    }
    for (let z = 0; z <= width / 2; z += 10) {
      for (const s of z === 0 ? [0] : [-z, z]) {
        g.strokeStyle = z % 50 === 0 ? "rgba(30,41,59,0.45)" : "rgba(30,41,59,0.16)";
        g.beginPath();
        g.moveTo(W / 2 + s * px, 0);
        g.lineTo(W / 2 + s * px, H);
        g.stroke();
      }
    }
    this.screenTexture.needsUpdate = true;
  }

  private drawRays(input: SceneInput) {
    const points: number[] = [];
    const m = input.measures;
    if (input.showRays && m) {
      const o = input.setup.object;
      const centreY = o.elevation + o.height / 2;
      m.side.lamps.forEach((lamp, i) => {
        const l = input.positions.lamps[i];
        for (const p of lamp.points) {
          // a ray in the vertical plane through the middle of the object, past its top and bottom edge
          for (let k = 0; k < 2; k++) {
            const [tx, ty] = p.touch[k];
            const hitY = p.interval[k];
            const s = at(l.x, p.source[1], l.z);
            // where the ray meets the screen: through (tx, ty, 0)
            const f = l.x / (l.x - tx);
            const hitZ = l.z + f * (0 - l.z);
            const e = at(0, hitY, hitZ);
            points.push(s.x, s.y, s.z, e.x, e.y, e.z);
          }
        }
      });
      m.top.lamps.forEach((lamp, i) => {
        const l = input.positions.lamps[i];
        for (const p of lamp.points) {
          for (let k = 0; k < 2; k++) {
            const [tx] = p.touch[k];
            const hitZ = p.interval[k];
            const f = l.x / (l.x - tx);
            const hitY = l.y + f * (centreY - l.y);
            const s = at(l.x, l.y, p.source[1]);
            const e = at(0, hitY, hitZ);
            points.push(s.x, s.y, s.z, e.x, e.y, e.z);
          }
        }
      });
    }
    this.rays.geometry.dispose();
    this.rays.geometry = new BufferGeometry();
    this.rays.geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
  }

  private highlight() {
    const glow = (g: Object3D | null | undefined, on: boolean) =>
      g?.traverse((o) => {
        const material = (o as Mesh).material as MeshStandardMaterial | undefined;
        if (material && "emissive" in material && o.name === "body") material.emissive = new Color(on ? 0x1d4ed8 : 0x000000);
      });
    glow(this.object, this.hovered?.kind === "object" || this.drag?.picked.kind === "object");
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
    this.orbit.theta = Math.max(-Math.PI * 0.95, Math.min(Math.PI * 0.3, this.orbit.theta + dTheta));
    this.orbit.phi = Math.max(0.25, Math.min(1.52, this.orbit.phi + dPhi));
    this.orbit.radius = Math.max(1.2, Math.min(16, this.orbit.radius * zoom));
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

  private ray(e: PointerEvent | { clientX: number; clientY: number }) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const caster = new Raycaster();
    caster.setFromCamera(ndc, this.camera);
    return caster;
  }

  /** What is under the pointer: a lamp or the object the candidate may move (raycasting). */
  pick(e: { clientX: number; clientY: number }): Picked | null {
    if (!this.input) return null;
    const hits = this.ray(e).intersectObjects([...this.lamps, ...(this.object ? [this.object] : [])], true);
    for (const hit of hits) {
      let o: Object3D | null = hit.object;
      while (o && !o.userData?.kind) o = o.parent;
      if (o && (o as Sprite).isSprite !== true) {
        const picked = { kind: o.userData.kind, index: o.userData.index } as Picked;
        if (this.input.movable(picked)) return picked;
      }
    }
    return null;
  }

  /** Where on the screen of the page an item is, for tests. */
  screenPoint(p: Picked) {
    const g = p.kind === "lamp" ? this.lamps[p.index] : this.object?.getObjectByName("body");
    if (!g) return null;
    const v = new Vector3();
    g.getWorldPosition(v);
    v.project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  private onPointerDown = (e: PointerEvent) => {
    this.renderer.domElement.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      this.drag = null;
      const [a, b] = [...this.pointers.values()];
      this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      return;
    }
    const picked = this.pick(e);
    if (!picked || !this.input) return;
    const g = picked.kind === "lamp" ? this.lamps[picked.index] : this.object!;
    const position = picked.kind === "lamp" ? g.position.clone() : this.object!.getObjectByName("body")!.getWorldPosition(new Vector3());
    // drag in the vertical plane along the bench (distance and height), unless the camera looks along it
    const dir = new Vector3();
    this.camera.getWorldDirection(dir);
    const vertical = Math.abs(dir.z) > 0.3;
    const plane = vertical ? new Plane(new Vector3(0, 0, 1), -position.z) : new Plane(new Vector3(0, 1, 0), -position.y);
    const hit = this.ray(e).ray.intersectPlane(plane, new Vector3());
    if (!hit) return;
    this.drag = { picked, plane, offset: position.clone().sub(hit), axes: vertical ? ["x", "y"] : ["x", "z"] };
    this.highlight();
    this.draw();
  };

  private onPointerMove = (e: PointerEvent) => {
    const previous = this.pointers.get(e.pointerId);
    if (!previous) {
      // hovering: the cursor shows what can be dragged
      const picked = this.pick(e);
      if (JSON.stringify(picked) !== JSON.stringify(this.hovered)) {
        this.hovered = picked;
        this.renderer.domElement.style.cursor = picked ? "grab" : "default";
        this.highlight();
        this.draw();
      }
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
    if (this.drag) {
      const hit = this.ray(e).ray.intersectPlane(this.drag.plane, new Vector3());
      if (!hit) return;
      const p = hit.add(this.drag.offset);
      this.renderer.domElement.style.cursor = "grabbing";
      this.events.onDrag(this.drag.picked, { x: -p.x / M, y: p.y / M, z: p.z / M }, this.drag.axes);
      return;
    }
    const r = this.renderer.domElement.getBoundingClientRect();
    this.turn((-(e.clientX - previous.x) / r.width) * Math.PI, (-(e.clientY - previous.y) / r.height) * Math.PI * 0.6);
  };

  private onPointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = 0;
    if (this.drag) {
      const picked = this.drag.picked;
      this.drag = null;
      this.renderer.domElement.style.cursor = "grab";
      this.highlight();
      this.events.onDragEnd(picked);
    }
  };

  private onPointerLeave = () => {
    if (this.hovered && !this.drag) {
      this.hovered = null;
      this.highlight();
      this.draw();
    }
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
      if (!this.disposed) this.renderer.render(this.scene, this.camera);
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
    canvas.removeEventListener("pointercancel", this.onPointerUp);
    canvas.removeEventListener("pointerleave", this.onPointerLeave);
    canvas.removeEventListener("wheel", this.onWheel);
    this.clearWorld();
    this.scene.traverse((object) => {
      const mesh = object as Mesh;
      mesh.geometry?.dispose();
      (mesh.material as MeshBasicMaterial | undefined)?.dispose?.();
    });
    this.screenTexture.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
  }
}
