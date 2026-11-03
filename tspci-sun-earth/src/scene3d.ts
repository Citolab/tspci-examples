// The 3D view: the Sun in the middle, the Earth on its orbit with its axis tilted 23.44° (always towards the same
// direction in space), lit by the Sun, so the day and night halves follow from the light. Not to scale.
// On the globe: the equator, the tropics and the polar circles, the border of day and night, the places (the chosen
// one marked), and where the sun is overhead, with a ray from the Sun.
// Turn the view by dragging (mouse, touch) or with the keyboard; drag the Earth along its orbit to change the date
// and click a place to choose it (raycasting). Without WebGL the constructor throws and the interaction shows the
// 2D drawing. Renders on demand: no loop.
import {
  AmbientLight, BufferGeometry, CanvasTexture, Float32BufferAttribute, Group, Line, LineBasicMaterial, LineDashedMaterial,
  LineLoop, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, Plane, PointLight, Quaternion,
  Raycaster, Scene, SphereGeometry, Sprite, SpriteMaterial, SRGBColorSpace, TorusGeometry, Vector2, Vector3, WebGLRenderer,
} from "three";
import { TILT, dayOfOrbitAngle, orbitAngle, sunVector } from "./solar";
import type { Place, Setting } from "./setup";

/** The orbit's radius and the sizes, in scene units: nowhere near to scale (the real orbit is 23 000 Earth radii). */
const ORBIT = 12, EARTH = 1, SUN = 1.8;
const RAD = Math.PI / 180;

export type SceneInput = {
  places: Place[];
  setting: Setting;
  /** the four orbit marks (equinoxes and solstices), in the candidate's language */
  marks: [string, string, string, string];
  /** the label of the chosen place */
  placeLabel: string;
  canDrag: boolean;
  canPick: boolean;
};
export type SceneEvents = {
  /** dragging the Earth along its orbit: the day under the pointer, and when the candidate lets go */
  onDay: (day: number, done: boolean) => void;
  onPlace: (id: string) => void;
};
export type Focus = "orbit" | "earth";

/** A point at (lat, lon) on a sphere of radius r, in the Earth's frame (x to 0° E, y north, z to 90° W). */
const onEarth = (lat: number, lon: number, r = EARTH) =>
  new Vector3(r * Math.cos(lat * RAD) * Math.cos(lon * RAD), r * Math.sin(lat * RAD), -r * Math.cos(lat * RAD) * Math.sin(lon * RAD));

/** Rough outlines of the land (lon, lat), drawn by hand for a recognisable globe, not a map. */
const LAND: [number, number][][] = [
  [[-168, 66], [-160, 70], [-140, 70], [-125, 72], [-95, 72], [-80, 73], [-65, 62], [-55, 52], [-66, 45], [-70, 42], [-76, 35], [-81, 31], [-80, 25], [-82, 28], [-84, 30], [-90, 29], [-97, 27], [-97, 22], [-92, 18], [-87, 21], [-88, 16], [-83, 10], [-79, 9], [-81, 8], [-86, 12], [-92, 14], [-105, 20], [-110, 24], [-115, 30], [-118, 34], [-124, 40], [-124, 48], [-130, 55], [-140, 60], [-150, 60], [-158, 57], [-165, 60]],
  [[-55, 60], [-45, 60], [-20, 70], [-20, 82], [-40, 83], [-60, 82], [-72, 78], [-58, 70]],
  [[-80, 9], [-75, 11], [-62, 11], [-52, 5], [-50, 0], [-35, -6], [-38, -13], [-41, -22], [-48, -26], [-53, -34], [-58, -38], [-65, -42], [-66, -50], [-69, -55], [-74, -52], [-74, -42], [-72, -30], [-71, -18], [-76, -14], [-81, -6], [-80, 0], [-78, 7]],
  [[-10, 36], [-9, 43], [-2, 44], [-5, 48], [3, 51], [8, 54], [10, 57], [5, 58], [5, 62], [14, 68], [25, 71], [40, 68], [60, 70], [70, 73], [80, 73], [100, 77], [115, 74], [140, 72], [160, 70], [180, 68], [180, 65], [170, 60], [160, 58], [156, 51], [142, 46], [140, 40], [130, 35], [122, 31], [121, 25], [110, 20], [108, 12], [104, 9], [100, 13], [98, 8], [101, 3], [97, 16], [92, 22], [88, 22], [80, 15], [77, 8], [73, 18], [68, 24], [57, 25], [56, 27], [50, 30], [48, 29], [51, 25], [56, 24], [59, 22], [52, 16], [43, 13], [39, 21], [34, 28], [32, 31], [35, 36], [27, 37], [26, 41], [23, 40], [22, 37], [19, 41], [13, 45], [16, 41], [18, 40], [12, 44], [8, 44], [3, 43], [-1, 37], [-5, 36]],
  [[-17, 21], [-16, 28], [-10, 30], [-6, 35], [10, 37], [11, 33], [20, 31], [32, 31], [34, 28], [39, 21], [43, 12], [51, 12], [48, 5], [40, -3], [40, -10], [35, -20], [33, -26], [27, -34], [20, -35], [18, -32], [12, -18], [13, -10], [9, -1], [9, 4], [-5, 5], [-12, 8], [-17, 14]],
  [[114, -22], [122, -18], [130, -12], [137, -12], [142, -11], [146, -18], [153, -25], [151, -34], [146, -39], [140, -38], [135, -35], [129, -32], [116, -35], [114, -27]],
  [[-6, 50], [2, 51], [0, 54], [-3, 59], [-6, 57], [-5, 54]],
  [[95, 5], [106, -6], [104, -6], [95, 2]],
  [[109, 2], [117, 7], [119, 1], [116, -4], [110, -3]],
  [[105, -6], [115, -8], [106, -7]],
  [[131, -1], [141, -3], [150, -10], [141, -9], [134, -4]],
  [[130, 31], [141, 36], [142, 43], [140, 41], [135, 34]],
  [[44, -16], [50, -15], [47, -25], [44, -22]],
  [[172, -34], [178, -38], [174, -41], [167, -46], [171, -44], [174, -39]],
  [[-24, 64], [-14, 65], [-18, 66.5], [-23, 66]],
];

const globeTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const g = canvas.getContext("2d")!;
  const x = (lon: number) => ((lon + 180) / 360) * canvas.width, y = (lat: number) => ((90 - lat) / 180) * canvas.height;
  g.fillStyle = "#1d4f91";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = "#6f9a4e";
  for (const shape of LAND) {
    g.beginPath();
    shape.forEach(([lon, lat], i) => (i ? g.lineTo(x(lon), y(lat)) : g.moveTo(x(lon), y(lat))));
    g.closePath();
    g.fill();
  }
  g.fillStyle = "#eef2f7"; // Antarctica and the Arctic ice
  g.fillRect(0, y(-70), canvas.width, canvas.height - y(-70));
  g.fillRect(0, 0, canvas.width, y(84));
  // a grid every 30°
  g.strokeStyle = "rgba(255,255,255,0.18)";
  g.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 30) {
    g.beginPath();
    g.moveTo(x(lon), 0);
    g.lineTo(x(lon), canvas.height);
    g.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    g.beginPath();
    g.moveTo(0, y(lat));
    g.lineTo(canvas.width, y(lat));
    g.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

const labelSprite = (text: string, color = "#f8fafc", background = "rgba(15,23,42,0.78)") => {
  const canvas = document.createElement("canvas");
  const g = canvas.getContext("2d")!;
  g.font = "600 30px system-ui, sans-serif";
  const w = Math.ceil(g.measureText(text).width) + 24;
  canvas.width = w;
  canvas.height = 44;
  g.font = "600 30px system-ui, sans-serif";
  g.fillStyle = background;
  g.beginPath();
  g.roundRect(0, 0, w, 44, 10);
  g.fill();
  g.fillStyle = color;
  g.textBaseline = "middle";
  g.fillText(text, 12, 23);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.userData.aspect = w / 44;
  sprite.renderOrder = 10;
  return sprite;
};

const glowTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const g = canvas.getContext("2d")!;
  const gradient = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  gradient.addColorStop(0, "rgba(253,224,71,0.85)");
  gradient.addColorStop(0.4, "rgba(251,191,36,0.3)");
  gradient.addColorStop(1, "rgba(251,191,36,0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, 128, 128);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

/** A circle of latitude on the globe; dashed or dotted lines carry the meaning, not the colour alone. */
const latitudeLine = (lat: number, color: number, dash: [number, number] | null) => {
  const points: number[] = [];
  for (let k = 0; k <= 128; k++) {
    const p = onEarth(lat, (k / 128) * 360 - 180, EARTH * 1.004);
    points.push(p.x, p.y, p.z);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
  const line = new Line(geometry, dash ? new LineDashedMaterial({ color, dashSize: dash[0], gapSize: dash[1] }) : new LineBasicMaterial({ color }));
  if (dash) line.computeLineDistances();
  return line;
};

export class SunEarthScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(40, 1.6, 0.05, 400);
  private earth = new Group(); // at the Earth's place in the orbit
  private globe = new Group(); // turned and tilted: the Earth's own frame
  private globeMesh: Mesh;
  private terminator: Mesh;
  private ray: Line<BufferGeometry, LineBasicMaterial>;
  private subsolar: Mesh;
  private pins = new Group();
  private placeLabel: Sprite | null = null;
  private marks = new Group();
  private input: SceneInput | null = null;
  private placesKey = "";
  private marksKey = "";
  private observer: ResizeObserver;
  private watch: ReturnType<typeof setInterval>;
  private disposed = false;
  private pending = 0;
  private sunDirection = new Vector3(1, 0, 0); // from the Earth to the Sun
  // the camera: around a target, angles in radians; in Earth focus the turn is relative to the sun's direction
  private focusMode: Focus = "orbit";
  private orbit = { theta: 0.5, phi: 0.95, radius: 36 };
  private starts: Record<Focus, { theta: number; phi: number; radius: number }> = {
    orbit: { theta: 0.5, phi: 0.95, radius: 36 },
    earth: { theta: 1.3, phi: 1.22, radius: 5.2 },
  };
  private pointers = new Map<number, { x: number; y: number; startX: number; startY: number }>();
  private drag: { plane: Plane } | null = null;
  private pinch = 0;

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

    this.scene.add(new AmbientLight(0xffffff, 0.16));
    this.scene.add(new PointLight(0xffffff, 3.2, 0, 0));

    const sun = new Mesh(new SphereGeometry(SUN, 48, 24), new MeshBasicMaterial({ color: 0xfbbf24 }));
    const glow = new Sprite(new SpriteMaterial({ map: glowTexture(), depthWrite: false, transparent: true }));
    glow.scale.set(SUN * 5, SUN * 5, 1);
    this.scene.add(sun, glow);

    // the orbit, with a faint disc so the plane of the orbit reads
    const ring: number[] = [];
    for (let k = 0; k < 180; k++) {
      const a = (k / 180) * Math.PI * 2;
      ring.push(ORBIT * Math.cos(a), 0, ORBIT * Math.sin(a));
    }
    const ringGeometry = new BufferGeometry();
    ringGeometry.setAttribute("position", new Float32BufferAttribute(ring, 3));
    this.scene.add(new LineLoop(ringGeometry, new LineBasicMaterial({ color: 0x64748b })));
    this.scene.add(this.marks);

    this.globeMesh = new Mesh(new SphereGeometry(EARTH, 64, 32), new MeshStandardMaterial({ map: globeTexture(), roughness: 1, metalness: 0 }));
    this.globeMesh.name = "globe";
    this.globe.add(this.globeMesh);
    this.globe.add(latitudeLine(0, 0xf8fafc, null));
    for (const lat of [TILT, -TILT]) this.globe.add(latitudeLine(lat, 0xfbbf24, [0.08, 0.05]));
    for (const lat of [90 - TILT, -(90 - TILT)]) this.globe.add(latitudeLine(lat, 0x7dd3fc, [0.02, 0.04]));
    // the axis through the poles, longer than the Earth, with N at the top
    const axis = new BufferGeometry();
    axis.setAttribute("position", new Float32BufferAttribute([0, -1.55 * EARTH, 0, 0, 1.55 * EARTH, 0], 3));
    this.globe.add(new Line(axis, new LineBasicMaterial({ color: 0xe2e8f0 })));
    const north = labelSprite("N");
    north.position.set(0, 1.75 * EARTH, 0);
    north.scale.set(0.18 * north.userData.aspect, 0.18, 1);
    this.globe.add(north, this.pins);
    this.subsolar = new Mesh(new SphereGeometry(0.06, 16, 12), new MeshBasicMaterial({ color: 0xfde047 }));
    this.globe.add(this.subsolar);

    // the border of day and night: a ring at right angles to the sun's direction, around the Earth
    this.terminator = new Mesh(new TorusGeometry(EARTH * 1.006, 0.012, 6, 128), new MeshBasicMaterial({ color: 0xfb923c }));
    this.earth.add(this.globe, this.terminator);
    this.ray = new Line(new BufferGeometry(), new LineBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.7 }));
    this.scene.add(this.earth, this.ray);

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
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
    const { day, minutes } = input.setting;

    // where the Earth is: opposite the sun's ecliptic longitude λ, the orbit in the plane y = 0
    const lambda = orbitAngle(day, minutes);
    this.sunDirection.set(Math.cos(lambda), 0, -Math.sin(lambda));
    this.earth.position.copy(this.sunDirection).multiplyScalar(-ORBIT);
    // in the orbit view the Earth is drawn bigger still, or it would be a dot
    this.earth.scale.setScalar(this.focusMode === "orbit" ? 1.8 : 1);
    this.marks.visible = this.focusMode === "orbit";

    // the axis tilts towards λ = 90° (the June solstice) and always the same way in space
    const axis = new Vector3(0, Math.cos(TILT * RAD), -Math.sin(TILT * RAD));
    // turn the Earth so the subsolar point of solar.ts faces the Sun: frames (north, sun ⟂ north) matched
    const [sx, sy, sz] = sunVector(day, minutes);
    const local = new Vector3(sx, sy, sz);
    const a1 = new Vector3(0, 1, 0), a2 = local.clone().sub(a1.clone().multiplyScalar(local.dot(a1))).normalize(), a3 = a1.clone().cross(a2);
    const b1 = axis.clone(), b2 = this.sunDirection.clone().sub(b1.clone().multiplyScalar(this.sunDirection.dot(b1))).normalize(), b3 = b1.clone().cross(b2);
    const m = new Matrix4().makeBasis(b1, b2, b3).multiply(new Matrix4().makeBasis(a1, a2, a3).transpose());
    this.globe.quaternion.setFromRotationMatrix(m);
    this.subsolar.position.copy(local).multiplyScalar(EARTH * 1.01);
    this.terminator.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), this.sunDirection));
    // the ray from the Sun to where it is overhead
    this.earth.updateMatrixWorld(true);
    const hit = this.subsolar.getWorldPosition(new Vector3());
    this.ray.geometry.dispose();
    this.ray.geometry = new BufferGeometry().setFromPoints([this.earth.position.clone().add(this.sunDirection.clone().multiplyScalar(ORBIT - SUN * 1.05)), hit]);

    this.buildPins(input);
    this.buildMarks(input);
    if (this.focusMode === "earth") this.placeCamera();
    this.draw();
  }

  private buildPins(input: SceneInput) {
    const key = JSON.stringify([input.places, input.setting.place, input.placeLabel]);
    if (key === this.placesKey) return;
    this.placesKey = key;
    this.disposeTree(this.pins);
    this.pins.clear();
    for (const p of input.places) {
      const chosen = p.id === input.setting.place;
      const pin = new Mesh(new SphereGeometry(chosen ? 0.065 : 0.04, 16, 12), new MeshBasicMaterial({ color: chosen ? 0xffffff : 0xe2e8f0 }));
      pin.position.copy(onEarth(p.lat, p.lon, EARTH * 1.012));
      pin.userData = { kind: "place", id: p.id };
      this.pins.add(pin);
      if (chosen) {
        // a ring around the chosen place: shape, not colour alone
        const ring = new Mesh(new TorusGeometry(0.11, 0.014, 6, 32), new MeshBasicMaterial({ color: 0x0f172a }));
        ring.position.copy(onEarth(p.lat, p.lon, EARTH * 1.014));
        ring.lookAt(onEarth(p.lat, p.lon, 2));
        this.pins.add(ring);
        this.placeLabel = labelSprite(input.placeLabel);
        this.placeLabel.scale.set(0.17 * this.placeLabel.userData.aspect, 0.17, 1);
        this.placeLabel.position.copy(onEarth(p.lat, p.lon, EARTH * 1.22));
        this.pins.add(this.placeLabel);
      }
    }
  }

  private buildMarks(input: SceneInput) {
    const key = input.marks.join("|");
    if (key === this.marksKey) return;
    this.marksKey = key;
    this.disposeTree(this.marks);
    this.marks.clear();
    // the equinoxes and solstices: where the Earth is on about 20 March, 21 June, 22 September and 21 December
    [80, 172, 266, 355].forEach((day, i) => {
      const l = orbitAngle(day);
      const at = new Vector3(-Math.cos(l), 0, Math.sin(l)).multiplyScalar(ORBIT);
      const tick = new Mesh(new SphereGeometry(0.14, 12, 8), new MeshBasicMaterial({ color: 0x94a3b8 }));
      tick.position.copy(at);
      const label = labelSprite(input.marks[i], "#e2e8f0", "rgba(30,41,59,0.85)");
      label.scale.set(0.75 * label.userData.aspect, 0.75, 1);
      label.position.copy(at.clone().multiplyScalar(1.17)).add(new Vector3(0, 0.6, 0));
      this.marks.add(tick, label);
    });
  }

  private disposeTree(root: Object3D) {
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (o === root) return;
      mesh.geometry?.dispose();
      const material = mesh.material as MeshBasicMaterial | undefined;
      material?.map?.dispose();
      material?.dispose?.();
    });
  }

  // ------------------------------------------------------------ the camera

  get focus() {
    return this.focusMode;
  }

  setFocus(focus: Focus) {
    if (focus === this.focusMode) return;
    this.starts[this.focusMode] = { ...this.orbit };
    this.focusMode = focus;
    this.orbit = { ...this.starts[focus] };
    if (focus === "earth" && this.orbit.radius > 12) this.orbit = { theta: 1.3, phi: 1.22, radius: 5.2 };
    if (this.input) this.update(this.input);
    this.placeCamera();
    this.draw();
  }

  private placeCamera() {
    const { phi, radius } = this.orbit;
    let theta = this.orbit.theta;
    const target = this.focusMode === "earth" ? this.earth.position : new Vector3();
    if (this.focusMode === "earth") theta += Math.atan2(this.sunDirection.x, this.sunDirection.z); // relative to the Sun
    this.camera.position.set(
      target.x + radius * Math.sin(phi) * Math.sin(theta),
      target.y + radius * Math.cos(phi),
      target.z + radius * Math.sin(phi) * Math.cos(theta)
    );
    this.camera.lookAt(target);
  }

  /** Turn (radians) and zoom (factor); the keyboard and the buttons call this. */
  turn(dTheta: number, dPhi: number, zoom = 1) {
    this.orbit.theta += dTheta;
    this.orbit.phi = Math.max(0.12, Math.min(Math.PI - 0.12, this.orbit.phi + dPhi));
    const [lo, hi] = this.focusMode === "earth" ? [2, 12] : [14, 70];
    this.orbit.radius = Math.max(lo, Math.min(hi, this.orbit.radius * zoom));
    this.placeCamera();
    this.draw();
  }

  resetView() {
    this.orbit = this.focusMode === "earth" ? { theta: 1.3, phi: 1.22, radius: 5.2 } : { theta: 0.5, phi: 0.95, radius: 36 };
    this.placeCamera();
    this.draw();
  }

  /** The camera's angles and the focus, for tests. */
  get view() {
    return { ...this.orbit, focus: this.focusMode };
  }

  // ------------------------------------------------------------ pointer

  private raycaster(e: { clientX: number; clientY: number }) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const caster = new Raycaster();
    caster.setFromCamera(ndc, this.camera);
    return caster;
  }

  private hitsEarth(e: { clientX: number; clientY: number }) {
    return this.raycaster(e).intersectObject(this.globeMesh, false)[0] ?? null;
  }

  /** The place under the pointer (raycasting): a pin, or the place nearest to where the globe was hit (within 20°). */
  pick(e: { clientX: number; clientY: number }): string | null {
    if (!this.input) return null;
    const caster = this.raycaster(e);
    const pin = caster.intersectObjects(this.pins.children.filter((c) => c.userData.kind === "place"), false)[0];
    if (pin) return pin.object.userData.id;
    const hit = caster.intersectObject(this.globeMesh, false)[0];
    if (!hit) return null;
    const local = this.globe.worldToLocal(hit.point.clone()).normalize();
    let best: string | null = null, bestAngle = 20 * RAD;
    for (const p of this.input.places) {
      const angle = local.angleTo(onEarth(p.lat, p.lon));
      if (angle < bestAngle) {
        bestAngle = angle;
        best = p.id;
      }
    }
    return best;
  }

  /** Where a place (or the Earth's centre) is on the page, for tests. */
  screenPoint(id?: string) {
    let v = this.earth.position.clone();
    const place = id && this.input?.places.find((p) => p.id === id);
    if (place) v = this.globe.localToWorld(onEarth(place.lat, place.lon, EARTH * 1.012));
    v.project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  private dayAt(e: { clientX: number; clientY: number }) {
    const point = this.raycaster(e).ray.intersectPlane(this.drag!.plane, new Vector3());
    if (!point) return null;
    // the Earth at λ is at (−cos λ, 0, sin λ) · ORBIT
    return dayOfOrbitAngle(Math.atan2(point.z, -point.x));
  }

  private onPointerDown = (e: PointerEvent) => {
    this.renderer.domElement.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });
    if (this.pointers.size === 2) {
      this.drag = null;
      const [a, b] = [...this.pointers.values()];
      this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      return;
    }
    // in the orbit view the Earth can be dragged along its orbit
    if (this.focusMode === "orbit" && this.input?.canDrag && this.hitsEarth(e)) {
      this.drag = { plane: new Plane(new Vector3(0, 1, 0), 0) };
      this.renderer.domElement.style.cursor = "grabbing";
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const previous = this.pointers.get(e.pointerId);
    if (!previous) {
      const over = (this.input?.canPick && this.pick(e)) || (this.focusMode === "orbit" && this.input?.canDrag && this.hitsEarth(e));
      this.renderer.domElement.style.cursor = over ? "pointer" : "grab";
      return;
    }
    this.pointers.set(e.pointerId, { ...previous, x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch > 0 && d > 0) this.turn(0, 0, this.pinch / d);
      this.pinch = d;
      return;
    }
    if (this.drag) {
      const day = this.dayAt(e);
      if (day !== null && day !== this.input?.setting.day) this.events.onDay(day, false);
      return;
    }
    const r = this.renderer.domElement.getBoundingClientRect();
    this.turn((-(e.clientX - previous.x) / r.width) * Math.PI, (-(e.clientY - previous.y) / r.height) * Math.PI * 0.6);
  };

  private onPointerUp = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = 0;
    const click = p && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < 5;
    if (this.drag) {
      const day = click ? null : this.dayAt({ clientX: e.clientX, clientY: e.clientY }) ?? this.input?.setting.day;
      this.drag = null;
      this.renderer.domElement.style.cursor = "grab";
      if (day) {
        this.events.onDay(day, true);
        return;
      }
    }
    if (click && this.input?.canPick && e.type === "pointerup") {
      const id = this.pick(e);
      if (id && id !== this.input.setting.place) this.events.onPlace(id);
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
    this.placeCamera();
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

  get isDisposed() {
    return this.disposed;
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
    canvas.removeEventListener("wheel", this.onWheel);
    this.disposeTree(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
  }
}
