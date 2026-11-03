// The 3D view: every face of the net is a flat mesh with its label drawn on a canvas texture. Folding (net.ts) gives
// each face a matrix in net coordinates (x right, y down, the printed side to +z); the scene shows them with y and z
// swapped, so that the flat net seen from above looks like the net on the page and the solid forms below it. The
// camera turns about the solid with the mouse, a finger or the keys (the caller passes keys to rotate/zoom); a click
// without dragging picks a face with a raycaster. Without WebGL the constructor throws and the caller shows a message.
import {
  AmbientLight, BackSide, BufferGeometry, CanvasTexture, DirectionalLight, Float32BufferAttribute, FrontSide, Group, LineBasicMaterial,
  LineLoop, Matrix4, Mesh, MeshLambertMaterial, MeshBasicMaterial, PerspectiveCamera, Raycaster, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
} from "three";
import { COLORS, COLOR_HEX, Face, LabelKind, Solid, centroid, fold, polygon, type P2 } from "./net";

export type FaceLook = {
  label: string;
  kind: LabelKind;
  /** chosen by the candidate, the face asked about, an empty face to fill, or a face that overlaps another */
  state: "plain" | "chosen" | "asked" | "blank" | "overlap";
  /** the colour's name in the candidate's language (colours carry their name, never just the colour) */
  name?: string;
};

const PX = 160; // texture pixels per cell
const PAPER = "#fffdf7";
const INK = "#1e293b";
const CHOSEN = "#1d4ed8";

/** The pips of a die, in a 3 × 3 grid (0..8, row by row). */
const PIPS: Record<string, number[]> = { "1": [4], "2": [2, 6], "3": [2, 4, 6], "4": [0, 2, 6, 8], "5": [0, 2, 4, 6, 8], "6": [0, 2, 3, 5, 6, 8] };

/** A pattern per colour, so that colours differ in more than hue. */
const drawPattern = (g: CanvasRenderingContext2D, index: number, w: number, h: number) => {
  g.save();
  g.strokeStyle = "rgba(15,23,42,0.35)";
  g.fillStyle = "rgba(15,23,42,0.35)";
  g.lineWidth = 4;
  const step = 22;
  const kind = index % 6;
  if (kind === 0) for (let d = -h; d < w; d += step) { g.beginPath(); g.moveTo(d, h); g.lineTo(d + h, 0); g.stroke(); }
  if (kind === 1) for (let y = step / 2; y < h; y += step) for (let x = step / 2; x < w; x += step) { g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill(); }
  if (kind === 2) for (let y = step / 2; y < h; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  if (kind === 3) for (let x = step / 2; x < w; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  if (kind === 4) for (let d = 0; d < w + h; d += step) { g.beginPath(); g.moveTo(d, 0); g.lineTo(d - h, h); g.stroke(); g.beginPath(); g.moveTo(d - h, 0); g.lineTo(d, h); g.stroke(); }
  // kind 5: plain
  g.restore();
};

/** The texture of a face: paper or a colour, the label, and the state as a border. */
const faceTexture = (points: P2[], look: FaceLook) => {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const w = Math.max(1, Math.round((Math.max(...xs) - x0) * PX)), h = Math.max(1, Math.round((Math.max(...ys) - y0) * PX));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (g) {
    const local = points.map(([x, y]) => [(x - x0) * PX, (y - y0) * PX]);
    const [cx, cy] = centroid(local as P2[]);
    const path = () => { g.beginPath(); local.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
    const colorIndex = COLORS.indexOf(look.label as (typeof COLORS)[number]);
    g.fillStyle = look.kind === "colors" && colorIndex >= 0 ? COLOR_HEX[look.label] : look.state === "blank" ? "#f1f5f9" : PAPER;
    g.fillRect(0, 0, w, h);
    if (look.kind === "colors" && colorIndex >= 0) drawPattern(g, colorIndex, w, h);
    const size = Math.min(PX, w, h);
    g.textAlign = "center";
    g.textBaseline = "middle";
    if (look.label && look.kind === "dots" && PIPS[look.label]) {
      g.fillStyle = INK;
      const cell = size * 0.22;
      for (const k of PIPS[look.label]) {
        g.beginPath();
        g.arc(cx + ((k % 3) - 1) * cell, cy + (Math.floor(k / 3) - 1) * cell, size * 0.075, 0, Math.PI * 2);
        g.fill();
      }
    } else if (look.label && look.kind === "colors") {
      const text = look.name ?? look.label;
      g.font = `600 ${Math.round(size * 0.17)}px system-ui, sans-serif`;
      const tw = g.measureText(text).width + 14;
      g.fillStyle = "rgba(255,255,255,0.9)";
      g.fillRect(cx - tw / 2, cy - size * 0.13, tw, size * 0.26);
      g.fillStyle = INK;
      g.fillText(text, cx, cy + 1);
    } else if (look.label) {
      g.fillStyle = INK;
      g.font = `700 ${Math.round(size * 0.5)}px system-ui, sans-serif`;
      g.fillText(look.label, cx, cy + size * 0.03);
    }
    if (look.state === "asked" || look.state === "blank") {
      g.fillStyle = "#475569";
      g.font = `700 ${Math.round(size * 0.3)}px system-ui, sans-serif`;
      if (look.state === "blank" && !look.label) g.fillText("?", cx, cy);
    }
    if (look.state === "chosen") {
      // a check mark, so that a chosen face differs in more than its border colour
      const r = size * 0.14, mx = cx + size * 0.3, my = cy - size * 0.3;
      g.beginPath();
      g.arc(mx, my, r, 0, Math.PI * 2);
      g.fillStyle = CHOSEN;
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = "#fff";
      g.stroke();
      g.beginPath();
      g.moveTo(mx - r * 0.45, my);
      g.lineTo(mx - r * 0.1, my + r * 0.35);
      g.lineTo(mx + r * 0.5, my - r * 0.35);
      g.lineWidth = size * 0.04;
      g.lineCap = "round";
      g.stroke();
    }
    // the border: thick for chosen, dashed for the face asked about
    path();
    g.lineWidth = look.state === "chosen" || look.state === "asked" ? 14 : 4;
    g.strokeStyle = look.state === "chosen" ? CHOSEN : look.state === "overlap" ? "#b91c1c" : INK;
    if (look.state === "asked") g.setLineDash([18, 10]);
    g.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return { texture, x0, y0, w: w / PX, h: h / PX };
};

/** Net coordinates (x, y, z) to the scene (x, z, y): the improper swap the renderer corrects for with the winding. */
const SWAP = new Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);

type FaceMesh = { front: Mesh; back: Mesh; outline: LineLoop };

export class FoldScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(35, 1, 0.1, 500);
  private group = new Group();
  private meshes: FaceMesh[] = [];
  private faces: Face[] = [];
  private solid: Solid = "cube";
  private progress = 0;
  private azimuth = 0.35;
  private elevation = 0.7;
  /** the camera's distance as a factor of the distance that fits the (partly folded) net */
  private zoomFactor = 1;
  private fit = 6;
  private frame = 0;
  private observer: ResizeObserver;
  private watch: ReturnType<typeof setInterval>;
  private disposed = false;
  private down: { x: number; y: number; az: number; el: number; moved: boolean } | null = null;
  private raycaster = new Raycaster();

  constructor(private host: HTMLElement, private onPick: (face: number) => void) {
    // throws without WebGL: the caller shows a message
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

    this.scene.add(new AmbientLight(0xffffff, 1.9));
    const sun = new DirectionalLight(0xffffff, 1.3);
    sun.position.set(4, 10, 7);
    this.scene.add(sun);
    const fill = new DirectionalLight(0xffffff, 0.5);
    fill.position.set(-6, -4, -5);
    this.scene.add(fill);
    this.scene.add(this.group);

    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", () => (this.down = null));
    canvas.addEventListener("wheel", this.wheel, { passive: false });

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    // the page took the PCI away without ending it: free the WebGL context
    this.watch = setInterval(() => !this.renderer.domElement.isConnected && this.dispose(), 2000);
    this.resize();
  }

  get canvas() {
    return this.renderer.domElement;
  }

  /** A new net, or new looks for the faces (labels, chosen …). */
  setFaces(faces: Face[], solid: Solid, looks: FaceLook[]) {
    const same = faces.length === this.faces.length && JSON.stringify(faces) === JSON.stringify(this.faces) && solid === this.solid;
    this.clearMeshes();
    this.faces = faces;
    this.solid = solid;
    faces.forEach((face, i) => {
      const points = polygon(face);
      const look = looks[i] ?? { label: "", kind: "letters", state: "plain" };
      const { texture, x0, y0, w, h } = faceTexture(points, look);
      const geometry = new BufferGeometry();
      // a fan of triangles, counter-clockwise seen from the printed side (+z in net coordinates)
      const ring = signedArea(points) > 0 ? points : [...points].reverse();
      const positions: number[] = [], uvs: number[] = [];
      for (let k = 1; k < ring.length - 1; k++)
        for (const p of [ring[0], ring[k], ring[k + 1]]) {
          positions.push(p[0], p[1], 0);
          uvs.push((p[0] - x0) / w, 1 - (p[1] - y0) / h);
        }
      geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
      geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
      geometry.computeVertexNormals();
      const front = new Mesh(geometry, new MeshLambertMaterial({ map: texture, side: FrontSide, polygonOffset: true, polygonOffsetFactor: -i * 0.2, polygonOffsetUnits: -i }));
      const back = new Mesh(geometry, new MeshLambertMaterial({ color: 0xcbd5e1, side: BackSide }));
      const outlineGeometry = new BufferGeometry().setFromPoints(points.map((p) => new Vector3(p[0], p[1], 0)));
      const outline = new LineLoop(outlineGeometry, new LineBasicMaterial({ color: 0x334155 }));
      for (const object of [front, back, outline]) {
        object.matrixAutoUpdate = false;
        object.userData.face = i;
        this.group.add(object);
      }
      this.meshes.push({ front, back, outline });
    });
    if (!same) this.zoomFactor = 1;
    this.setProgress(this.progress);
  }

  /** How far the net is folded: 0 flat, 1 folded. */
  setProgress(progress: number) {
    this.progress = progress;
    if (!this.faces.length) return this.render();
    const f = fold(this.faces, this.solid, progress);
    const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const poly of f.points) for (const p of poly) {
      const v = new Vector3(p[0], p[2], p[1]);
      min.min(v);
      max.max(v);
    }
    // the camera comes closer as the net folds into a smaller shape
    this.fit = Math.max(2.6, 2.3 * max.distanceTo(min));
    const center = min.add(max).multiplyScalar(0.5);
    this.meshes.forEach((m, i) => {
      const r = f.matrices[i];
      const matrix = new Matrix4().set(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11], 0, 0, 0, 1);
      const placed = new Matrix4().makeTranslation(-center.x, -center.y, -center.z).multiply(SWAP).multiply(matrix);
      for (const object of [m.front, m.back, m.outline]) {
        object.matrix.copy(placed);
        object.matrixWorldNeedsUpdate = true;
      }
    });
    this.render();
  }

  rotate(dAzimuth: number, dElevation: number) {
    this.azimuth += dAzimuth;
    this.elevation = Math.max(-1.45, Math.min(1.45, this.elevation + dElevation));
    this.render();
  }

  zoom(factor: number) {
    this.zoomFactor = Math.max(0.45, Math.min(3, this.zoomFactor * factor));
    this.render();
  }

  resetView() {
    this.azimuth = 0.35;
    this.elevation = 0.7;
    this.zoomFactor = 1;
    this.render();
  }

  get view() {
    return { azimuth: this.azimuth, elevation: this.elevation, distance: this.fit * this.zoomFactor };
  }

  /** The face under a point of the canvas (client coordinates), or -1. */
  pick(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.group.updateMatrixWorld(true);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.meshes.flatMap((m) => [m.front, m.back]), false)[0];
    return hit ? (hit.object.userData.face as number) : -1;
  }

  private pointerDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY, az: this.azimuth, el: this.elevation, moved: false };
    try { this.renderer.domElement.setPointerCapture(e.pointerId); } catch { /* a synthetic event */ }
  };

  private pointerMove = (e: PointerEvent) => {
    if (!this.down) return;
    const dx = e.clientX - this.down.x, dy = e.clientY - this.down.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) this.down.moved = true;
    if (!this.down.moved) return;
    this.azimuth = this.down.az - dx * 0.01;
    this.elevation = Math.max(-1.45, Math.min(1.45, this.down.el + dy * 0.01));
    this.render();
  };

  private pointerUp = (e: PointerEvent) => {
    const down = this.down;
    this.down = null;
    if (down && !down.moved) {
      const face = this.pick(e.clientX, e.clientY);
      if (face >= 0) this.onPick(face);
    }
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1);
  };

  private resize() {
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  /** Draws once, in the next frame. */
  private render() {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  /** Draws now (tests and screenshots). */
  draw() {
    if (this.disposed) return;
    const d = this.fit * this.zoomFactor;
    this.camera.position.set(d * Math.cos(this.elevation) * Math.sin(this.azimuth), d * Math.sin(this.elevation), d * Math.cos(this.elevation) * Math.cos(this.azimuth));
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  private clearMeshes() {
    for (const m of this.meshes) {
      m.front.geometry.dispose();
      (m.front.material as MeshBasicMaterial).map?.dispose();
      (m.front.material as MeshBasicMaterial).dispose();
      (m.back.material as MeshBasicMaterial).dispose();
      m.outline.geometry.dispose();
      (m.outline.material as LineBasicMaterial).dispose();
      this.group.remove(m.front, m.back, m.outline);
    }
    this.meshes = [];
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    clearInterval(this.watch);
    this.observer.disconnect();
    this.clearMeshes();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

const signedArea = (points: P2[]) => points.reduce((s, p, i) => {
  const q = points[(i + 1) % points.length];
  return s + p[0] * q[1] - q[0] * p[1];
}, 0);
