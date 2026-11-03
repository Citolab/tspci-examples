// The 3D picture: the source and the listener on a strip of ground, and sound waves that spread from the source as
// half spheres with a ring on the ground. A wave fades and changes colour as the level drops where it is, so the
// picture shows the 6 dB less for every doubling of the distance. Without WebGL, create() throws and the 2D picture
// takes over; with prefers-reduced-motion the waves stand still.
import {
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  RingGeometry,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  AmbientLight,
  DirectionalLight,
  CircleGeometry,
  Texture,
  Fog,
} from "three";
import { levelColor } from "./colors";
import { visibility } from "./physics";

/** The length of the strip, in scene units, from the source to the largest distance. */
const LENGTH = 20;
const WAVES = 7;
/** Seconds a wave takes to reach the end of the strip. */
const PERIOD = 6;

export type SceneInput = {
  /** The listener's distance as a fraction of the largest distance (0..1). */
  fraction: number;
  /** The level in dB at a fraction of the largest distance. */
  levelAt: (fraction: number) => number;
  reducedMotion: boolean;
};

const textureOf = (svgUrl: string, onLoad: () => void): Texture => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const image = new Image();
  image.onload = () => {
    canvas.getContext("2d")?.drawImage(image, 0, 0, 256, 256);
    texture.needsUpdate = true;
    onLoad();
  };
  image.src = svgUrl;
  return texture;
};

export class SoundScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(32, 2, 0.1, 200);
  private waves: { shell: Mesh<SphereGeometry, MeshBasicMaterial>; ring: Mesh<RingGeometry, MeshBasicMaterial> }[] = [];
  private listener: Sprite;
  private listenerSpot: Mesh<CircleGeometry, MeshBasicMaterial>;
  private path: Line<BufferGeometry, LineDashedMaterial>;
  private input: SceneInput = { fraction: 0.5, levelAt: () => 60, reducedMotion: false };
  private frame = 0;
  private start = performance.now();
  private observer: ResizeObserver;
  private disposed = false;

  constructor(private host: HTMLElement, sourceSvg: string, listenerSvg: string) {
    // throws without WebGL: the caller shows the 2D picture
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);

    this.scene.add(new AmbientLight(0xffffff, 1.6));
    const sun = new DirectionalLight(0xffffff, 1.2);
    sun.position.set(5, 12, 8);
    this.scene.add(sun);

    // the ground to the horizon, fading into the sky; a ruler along the strip with a tick every tenth
    this.scene.fog = new Fog(0xf3f8fc, 28, 60);
    const ground = new Mesh(new PlaneGeometry(160, 120), new MeshStandardMaterial({ color: 0xe8edf2, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(LENGTH / 2, -0.02, -40);
    this.scene.add(ground);
    const ruler = new Mesh(new PlaneGeometry(LENGTH + 1.6, 1.6), new MeshStandardMaterial({ color: 0xf8fafc, roughness: 1 }));
    ruler.rotation.x = -Math.PI / 2;
    ruler.position.set(LENGTH / 2, -0.01, 2.2);
    this.scene.add(ruler);
    const ticks = new Group();
    const tickMaterial = new LineBasicMaterial({ color: 0x94a3b8 });
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * LENGTH;
      const half = i % 5 === 0 ? 0.6 : 0.3;
      ticks.add(new Line(new BufferGeometry().setFromPoints([new Vector3(x, 0.005, 2.2 - half), new Vector3(x, 0.005, 2.2 + half)]), tickMaterial));
    }
    ticks.add(new Line(new BufferGeometry().setFromPoints([new Vector3(0, 0.005, 2.2), new Vector3(LENGTH, 0.005, 2.2)]), tickMaterial));
    this.scene.add(ticks);

    // the waves: the shells faint, the rings on the ground clear
    const shellGeometry = new SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const ringGeometry = new RingGeometry(0.985, 1, 128);
    for (let i = 0; i < WAVES; i++) {
      const shell = new Mesh(shellGeometry, new MeshBasicMaterial({ transparent: true, side: DoubleSide, depthWrite: false }));
      const ring = new Mesh(ringGeometry, new MeshBasicMaterial({ transparent: true, side: DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.01;
      shell.renderOrder = 1;
      ring.renderOrder = 2;
      this.scene.add(shell, ring);
      this.waves.push({ shell, ring });
    }

    const redraw = () => this.draw();
    const source = new Sprite(new SpriteMaterial({ map: textureOf(sourceSvg, redraw), transparent: true }));
    source.center.set(0.5, 0);
    source.scale.set(4.2, 4.2, 1);
    source.position.set(0, 0, 0);
    source.renderOrder = 3;
    this.scene.add(source);

    this.listener = new Sprite(new SpriteMaterial({ map: textureOf(listenerSvg, redraw), transparent: true }));
    this.listener.center.set(0.5, 0);
    this.listener.scale.set(3.4, 3.4, 1);
    this.listener.renderOrder = 3;
    this.scene.add(this.listener);
    this.listenerSpot = new Mesh(new CircleGeometry(1.1, 48), new MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false }));
    this.listenerSpot.rotation.x = -Math.PI / 2;
    this.listenerSpot.position.y = 0.02;
    this.scene.add(this.listenerSpot);

    this.path = new Line(new BufferGeometry(), new LineDashedMaterial({ color: 0x0f766e, dashSize: 0.35, gapSize: 0.25 }));
    this.path.position.set(0, 0.03, 2.2);
    this.scene.add(this.path);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }

  /** The renderer's canvas, for tests. */
  get canvas() {
    return this.renderer.domElement;
  }

  update(input: SceneInput) {
    this.input = input;
    const x = Math.max(1.4, input.fraction * LENGTH);
    this.listener.position.set(x, 0, 0);
    this.listenerSpot.position.x = x;
    this.listenerSpot.material.color = new Color(levelColor(input.levelAt(input.fraction)));
    this.path.geometry.dispose();
    this.path.geometry = new BufferGeometry().setFromPoints([new Vector3(0, 0, 0), new Vector3(x, 0, 0)]);
    this.path.computeLineDistances();
    if (input.reducedMotion) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.draw();
    } else if (!this.frame) {
      this.loop();
    }
  }

  private loop = () => {
    if (this.disposed) return;
    // the page took the PCI away without unmounting it: free the WebGL context
    if (!this.renderer.domElement.isConnected) return this.dispose();
    this.draw();
    this.frame = requestAnimationFrame(this.loop);
  };

  private resize() {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // a narrow picture: step back, so the whole strip stays in view
    const back = Math.max(1, 2.6 / this.camera.aspect);
    this.camera.position.set(LENGTH / 2, 6.5 * back, 19 * back);
    this.camera.lookAt(LENGTH / 2 - 1.2, 1.9, -1);
    this.camera.updateProjectionMatrix();
    this.draw();
  }

  private draw() {
    if (this.disposed) return;
    const t = this.input.reducedMotion ? 0.5 : (performance.now() - this.start) / 1000 / PERIOD;
    this.waves.forEach(({ shell, ring }, i) => {
      // evenly spaced waves moving out; a still picture when the motion is reduced
      const phase = (((t + i / WAVES) % 1) + 1) % 1;
      const radius = 0.4 + phase * (LENGTH + 1.5);
      const fraction = radius / LENGTH;
      const level = this.input.levelAt(fraction);
      const strength = visibility(level);
      // fade in near the source and out past the end of the strip
      const edge = Math.min(1, phase * 8, (1 - phase) * 6);
      const color = new Color(levelColor(level));
      shell.scale.setScalar(radius);
      shell.material.color = color;
      shell.material.opacity = 0.045 * strength * edge;
      ring.scale.setScalar(radius);
      ring.material.color = color;
      ring.material.opacity = Math.min(1, 1.2 * strength) * edge;
    });
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
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
