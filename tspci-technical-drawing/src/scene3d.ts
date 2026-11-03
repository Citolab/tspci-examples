// The 3D picture: one workpiece (or a row of them to choose from) as a mesh with its edges, an arrow on the ground
// that shows the front, and a camera that turns around it. Without WebGL the constructor throws and the picture in SVG
// (fallback.tsx) takes over. Rendered on demand: nothing moves unless the candidate turns it.
import {
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  RingGeometry,
  Scene,
  Shape,
  ShapeGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { solidPolygons, triangles, creaseEdges } from "./csg";
import { Feature, arrange, boundsOf, inside, primitivesOf } from "./model";

export type Camera = { yaw: number; pitch: number; zoom: number };
export const DEFAULT_CAMERA: Camera = { yaw: -35, pitch: 25, zoom: 1 };

/** Model coordinates (x right, y back, z up) to three.js (y up, z towards the viewer). */
const world = (x: number, y: number, z: number) => new Vector3(x, z, -y);

const labelTexture = (text: string) => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  if (g) {
    g.font = "600 64px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 10;
    g.strokeStyle = "rgba(255,255,255,0.95)";
    g.strokeText(text, 128, 64);
    g.fillStyle = "#0f172a";
    g.fillText(text, 128, 64);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

export class ModelScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(30, 1.6, 1, 5000);
  private models: Mesh[] = [];
  private plates: Mesh[] = [];
  private centre = new Vector3();
  private radius = 50;
  private view: Camera = DEFAULT_CAMERA;
  private observer: ResizeObserver;
  private disposed = false;

  constructor(private host: HTMLElement, workpieces: Feature[][], labels: string[], frontLabel: string) {
    // throws without WebGL: the caller shows the picture in SVG
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
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
    const key = new DirectionalLight(0xffffff, 1.6);
    key.position.set(-0.6, 1.4, 1.0).multiplyScalar(500);
    this.scene.add(key);
    const fill = new DirectionalLight(0xffffff, 0.6);
    fill.position.set(1, 0.4, -0.8).multiplyScalar(500);
    this.scene.add(fill);

    const sizes = workpieces.map((f) => boundsOf(f));
    const span = Math.max(...sizes.map((b) => Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2])));
    const offsets = arrange(sizes);
    const lo = new Vector3(Infinity, Infinity, Infinity), hi = new Vector3(-Infinity, -Infinity, -Infinity);
    workpieces.forEach((features, i) => {
      const b = sizes[i];
      const group = new Group();
      const [ox, oy, oz] = offsets[i];
      group.position.copy(world(ox, oy, oz));
      const prims = primitivesOf(features);
      const polygons = solidPolygons(prims);
      const { positions, normals } = triangles(polygons);
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(positions.flatMap((_, k) => (k % 3 === 0 ? [positions[k], positions[k + 2], -positions[k + 1]] : [])), 3));
      geometry.setAttribute("normal", new Float32BufferAttribute(normals.flatMap((_, k) => (k % 3 === 0 ? [normals[k], normals[k + 2], -normals[k + 1]] : [])), 3));
      const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: 0xd6dde6, roughness: 0.7, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
      mesh.userData.index = i;
      group.add(mesh);
      this.models.push(mesh);
      const edges = creaseEdges(polygons, (p) => inside(prims, p));
      const edgeGeometry = new BufferGeometry();
      edgeGeometry.setAttribute("position", new Float32BufferAttribute(edges.flatMap(([a, c]) => [a[0], a[2], -a[1], c[0], c[2], -c[1]]), 3));
      group.add(new LineSegments(edgeGeometry, new LineBasicMaterial({ color: 0x1e293b })));

      // the front: an arrow on the ground in front of the workpiece, pointing at the viewer of the front view
      const w = b.max[0] - b.min[0], d = b.max[1] - b.min[1];
      const s = span * 0.09;
      const arrow = new Shape();
      arrow.moveTo(-s, 0);
      arrow.lineTo(s, 0);
      arrow.lineTo(0, -1.4 * s);
      arrow.closePath();
      const arrowMesh = new Mesh(new ShapeGeometry(arrow), new MeshBasicMaterial({ color: 0x0f766e }));
      arrowMesh.rotation.x = -Math.PI / 2;
      arrowMesh.position.copy(world(b.min[0] + w / 2, b.min[1] - s * 1.2, b.min[2] + 0.2));
      group.add(arrowMesh);
      const front = new Sprite(new SpriteMaterial({ map: labelTexture(frontLabel), depthTest: false }));
      front.scale.set(s * 4.5, s * 2.25, 1);
      front.position.copy(world(b.min[0] + w / 2, b.min[1] - s * 3.4, b.min[2] + 0.2));
      group.add(front);

      if (labels[i]) {
        const label = new Sprite(new SpriteMaterial({ map: labelTexture(labels[i]), depthTest: false }));
        label.scale.set(span * 0.8, span * 0.4, 1);
        label.position.copy(world(b.min[0] + w / 2, b.min[1] + d / 2, b.max[2] + span * 0.28));
        group.add(label);
        // the chosen one stands on a ring: a shape, not only a colour
        const plate = new Mesh(new RingGeometry(Math.hypot(w, d) * 0.56, Math.hypot(w, d) * 0.62, 64), new MeshBasicMaterial({ color: 0x1d4ed8 }));
        plate.rotation.x = -Math.PI / 2;
        plate.position.copy(world(b.min[0] + w / 2, b.min[1] + d / 2, b.min[2] - 0.3));
        plate.visible = false;
        group.add(plate);
        this.plates.push(plate);
      }
      this.scene.add(group);
      const p0 = world(ox + b.min[0], oy + b.min[1] - span * 0.3, oz + b.min[2]), p1 = world(ox + b.max[0], oy + b.max[1], oz + b.max[2] + (labels[i] ? span * 0.4 : 0));
      lo.min(p0).min(p1);
      hi.max(p0).max(p1);
    });
    this.centre.addVectors(lo, hi).multiplyScalar(0.5);
    this.radius = lo.distanceTo(hi) / 2;

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }

  get canvas() {
    return this.renderer.domElement;
  }

  setCamera(view: Camera) {
    this.view = view;
    this.draw();
  }

  setSelected(index: number | null) {
    this.plates.forEach((p, i) => (p.visible = i === index));
    this.models.forEach((m, i) => ((m.material as MeshStandardMaterial).color = new Color(i === index ? 0xbfd3f2 : 0xd6dde6)));
    this.draw();
  }

  /** The workpiece at a point of the canvas (client coordinates), by casting a ray; null when there is none. */
  pick(clientX: number, clientY: number): number | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObjects(this.models, false)[0];
    return hit ? (hit.object.userData.index as number) : null;
  }

  private resize() {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.draw();
  }

  private draw() {
    if (this.disposed) return;
    if (!this.renderer.domElement.isConnected) return this.dispose(); // the page took it away without unmounting
    const { yaw, pitch, zoom } = this.view;
    const y = (yaw * Math.PI) / 180, p = (Math.min(89.9, Math.max(-89.9, pitch)) * Math.PI) / 180;
    // far enough to see the whole row, in the narrower direction of the picture
    const fov = (this.camera.fov * Math.PI) / 180;
    const fit = this.radius / Math.sin(Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * this.camera.aspect)) / 2);
    const distance = (fit * 0.95) / zoom;
    const dir = world(Math.sin(y) * Math.cos(p), -Math.cos(y) * Math.cos(p), Math.sin(p));
    this.camera.position.copy(this.centre).addScaledVector(dir, distance);
    this.camera.up.set(0, 1, 0);
    if (Math.abs(p) > 1.5) this.camera.up.copy(world(-Math.sin(y), Math.cos(y), 0)); // from the top: the back is up
    this.camera.near = Math.max(0.1, distance - this.radius * 3);
    this.camera.far = distance + this.radius * 3;
    this.camera.lookAt(this.centre);
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    this.scene.traverse((object) => {
      const mesh = object as Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material as MeshBasicMaterial | undefined;
      material?.map?.dispose();
      material?.dispose?.();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
