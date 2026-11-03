// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/voxelcraft, © OpenPCI (Aarhus University and Aalborg
// University: Elias J.T. Hansen, Anna Rusmann, Jeppe Bundsgaard)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { CUBE, GRID, Vec3, Voxel, inBounds, key, snap } from "./voxels";

// The 3D view (three.js): the ground grid, the cubes, the hover preview of what a click does, the keyboard cursor and
// a line of cubes while Shift + dragging. Drag turns the view (OrbitControls), the wheel zooms, right-drag pans. The
// scene only reports what the candidate does (onAdd, onRemove, onPaint); the store decides and setVoxels() shows it.

export type Tool = "add" | "remove" | "paint";

export type SceneCallbacks = {
  onAdd: (voxels: Voxel[]) => void;
  onRemove: (key: string) => void;
  onPaint: (key: string, c: number) => void;
};

const SIZE = GRID * CUBE;
const DEFAULT_CAMERA = new THREE.Vector3(600, 560, 770);
const TARGET = new THREE.Vector3(0, 60, 0);
const CLICK_DISTANCE = 6; // px: a pointer that moved further dragged the view

export class VoxelScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 1, 20000);
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private ground: THREE.Mesh;
  private cubeGeometry = new RoundedBoxGeometry(CUBE, CUBE, CUBE, 3, 3.5);
  private materials = new Map<number, THREE.MeshStandardMaterial>();
  private cubes = new Map<string, THREE.Mesh>();
  private voxels = new Map<string, Voxel>();
  private preview: THREE.Group;
  private previewFill: THREE.MeshBasicMaterial;
  private previewEdges: THREE.LineBasicMaterial;
  private cursor: THREE.LineSegments;
  private line = new THREE.Group();
  private lineStart: Vec3 | null = null;
  private lineCells: Vec3[] = [];
  private down: { x: number; y: number; button: number } | null = null;
  private resizeObserver: ResizeObserver;
  private frame = 0;
  private listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];

  tool: Tool = "add";
  color = 0xcc0000;
  readOnly = false;

  constructor(private container: HTMLElement, private callbacks: SceneCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true }); // throws without WebGL: the interaction says so
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const canvas = this.renderer.domElement;
    canvas.style.display = "block";
    canvas.style.touchAction = "none";
    container.appendChild(canvas);

    this.scene.background = new THREE.Color(0xeef2f6);
    this.scene.fog = new THREE.Fog(0xeef2f6, 3200, 7000);

    // light: sky and ground fill, and a sun from the front left that casts soft shadows
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb7c0cc, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-600, 1400, 900);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -900, right: 900, top: 900, bottom: -900, near: 100, far: 4000 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    sun.shadow.radius = 3;
    this.scene.add(sun);

    // the ground: a plate of 20 × 20 cells, lines on it, and a shadow catcher around it
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 })
    );
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    const grid = new THREE.GridHelper(SIZE, GRID, 0x94a3b8, 0xcbd5e1);
    grid.position.y = 0.5;
    this.scene.add(grid);
    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(SIZE, 0, SIZE)),
      new THREE.LineBasicMaterial({ color: 0x64748b })
    );
    border.position.y = 0.6;
    this.scene.add(border);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 8, SIZE * 8).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.12 }));
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // what a click would do: a see-through cube with an outline
    this.previewFill = new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.45, depthWrite: false });
    this.previewEdges = new THREE.LineBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.6 });
    const box = new THREE.BoxGeometry(CUBE + 1, CUBE + 1, CUBE + 1);
    this.preview = new THREE.Group();
    this.preview.add(new THREE.Mesh(box, this.previewFill), new THREE.LineSegments(new THREE.EdgesGeometry(box), this.previewEdges));
    this.preview.visible = false;
    this.scene.add(this.preview);

    // the keyboard cursor
    this.cursor = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(CUBE + 4, CUBE + 4, CUBE + 4)),
      new THREE.LineBasicMaterial({ color: 0x0284c7, depthTest: false })
    );
    this.cursor.renderOrder = 10;
    this.cursor.visible = false;
    this.scene.add(this.cursor);
    this.scene.add(this.line);

    this.camera.position.copy(DEFAULT_CAMERA);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.copy(TARGET);
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.minDistance = 300;
    this.controls.maxDistance = 3600;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.04; // not below the ground
    this.controls.addEventListener("change", () => this.render());
    this.controls.update();

    // before OrbitControls (capture): Shift + drag draws a line instead of turning the view
    this.listen(container, "pointerdown", (e: PointerEvent) => this.onPointerDown(e), { capture: true });
    this.listen(canvas, "pointermove", (e: PointerEvent) => this.onPointerMove(e));
    this.listen(window, "pointerup", (e: PointerEvent) => this.onPointerUp(e));
    this.listen(canvas, "pointerleave", () => {
      if (!this.lineStart) this.showPreview(null);
    });
    this.listen(canvas, "contextmenu", (e: Event) => e.preventDefault());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  private listen(target: EventTarget, type: string, fn: (e: any) => void, options?: AddEventListenerOptions) {
    target.addEventListener(type, fn, options);
    this.listeners.push([target, type, fn, options]);
  }

  // --- the building ---------------------------------------------------------------------------------------------

  private material(c: number) {
    let m = this.materials.get(c);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.55, metalness: 0.02 });
      this.materials.set(c, m);
    }
    return m;
  }

  setVoxels(voxels: Voxel[]) {
    const next = new Map(voxels.map((v) => [key(v.p), v]));
    for (const [k, mesh] of this.cubes) {
      if (!next.has(k)) {
        this.scene.remove(mesh);
        this.cubes.delete(k);
      }
    }
    for (const [k, v] of next) {
      let mesh = this.cubes.get(k);
      if (!mesh) {
        mesh = new THREE.Mesh(this.cubeGeometry, this.material(v.c));
        mesh.position.set(v.p[0], v.p[1], v.p[2]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.key = k;
        this.scene.add(mesh);
        this.cubes.set(k, mesh);
      } else if (this.voxels.get(k)?.c !== v.c) {
        mesh.material = this.material(v.c);
      }
    }
    this.voxels = next;
    this.refreshPreview();
    this.render();
  }

  setTool(tool: Tool) {
    this.tool = tool;
    this.refreshPreview();
  }

  setColor(c: number) {
    this.color = c;
    this.refreshPreview();
  }

  setReadOnly(readOnly: boolean) {
    this.readOnly = readOnly;
    this.showPreview(null);
  }

  /** The keyboard cursor (a cell position), or null to hide it. */
  setCursor(p: Vec3 | null) {
    this.cursor.visible = !!p;
    if (p) this.cursor.position.set(p[0], p[1], p[2]);
    this.render();
  }

  // --- the view -------------------------------------------------------------------------------------------------

  /** The direction the camera looks at the ground from, in quarter turns (0 … 3): the arrow keys follow it. */
  quarterTurns() {
    const a = this.controls.getAzimuthalAngle(); // 0: looking from +z
    return ((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4;
  }

  rotate(radians: number) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), radians);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
  }

  zoom(factor: number) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const length = THREE.MathUtils.clamp(offset.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(offset.setLength(length));
    this.controls.update();
  }

  resetView() {
    this.controls.target.copy(TARGET);
    this.camera.position.copy(DEFAULT_CAMERA);
    this.controls.update();
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    // keep the whole plate in view on a narrow screen
    this.camera.fov = this.camera.aspect < 1 ? 42 / Math.max(0.55, this.camera.aspect) : 42;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.render();
  }

  render() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.renderer.render(this.scene, this.camera);
    });
  }

  /** Render right away (not on the next frame). */
  renderNow() {
    this.renderer.render(this.scene, this.camera);
  }

  // --- pointing ---------------------------------------------------------------------------------------------------

  private setPointer(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  /** The cube under the pointer and the empty cell next to the face it points at (or the ground cell). */
  private pick(): { cube: string | null; cell: Vec3 | null } {
    const hits = this.raycaster.intersectObjects([...this.cubes.values(), this.ground], false);
    if (!hits.length) return { cube: null, cell: null };
    const hit = hits[0];
    if (hit.object === this.ground) {
      const cell: Vec3 = [snap(hit.point.x), CUBE / 2, snap(hit.point.z)];
      return { cube: null, cell: inBounds(cell) ? cell : null };
    }
    // the face it points at: the largest component of point - centre (works on the rounded edges too)
    const centre = hit.object.position;
    const d = hit.point.clone().sub(centre);
    const axis = Math.abs(d.x) >= Math.abs(d.y) && Math.abs(d.x) >= Math.abs(d.z) ? 0 : Math.abs(d.y) >= Math.abs(d.z) ? 1 : 2;
    const cell: Vec3 = [centre.x, centre.y, centre.z];
    cell[axis] += Math.sign(d.getComponent(axis)) * CUBE;
    return { cube: hit.object.userData.key, cell: inBounds(cell) && !this.voxels.has(key(cell)) ? cell : null };
  }

  private lastPick: { cube: string | null; cell: Vec3 | null } = { cube: null, cell: null };

  private showPreview(pick: { cube: string | null; cell: Vec3 | null } | null) {
    this.lastPick = pick ?? { cube: null, cell: null };
    const target =
      this.readOnly || !pick
        ? null
        : this.tool === "add"
          ? pick.cell
          : pick.cube
            ? this.voxels.get(pick.cube)?.p ?? null
            : null;
    this.preview.visible = !!target;
    if (target) {
      this.preview.position.set(target[0], target[1], target[2]);
      this.previewFill.color.set(this.tool === "remove" ? 0xef4444 : this.color);
      this.previewFill.opacity = this.tool === "remove" ? 0.55 : this.tool === "paint" ? 0.8 : 0.45;
      this.previewEdges.color.set(this.tool === "remove" ? 0x991b1b : 0x0f172a);
    }
    this.renderer.domElement.style.cursor = target ? "pointer" : "grab";
    this.render();
  }

  private refreshPreview() {
    this.showPreview(this.lastPick);
  }

  private onPointerDown(e: PointerEvent) {
    if (e.target !== this.renderer.domElement) return;
    this.down = { x: e.clientX, y: e.clientY, button: e.button };
    if (this.readOnly || e.button !== 0 || !e.shiftKey || this.tool !== "add") return;
    this.setPointer(e);
    const { cell } = this.pick();
    if (!cell) return;
    // Shift + drag: a line of cubes on this level, as in the original
    this.controls.enabled = false;
    this.lineStart = cell;
    this.updateLine(cell);
    this.preview.visible = false;
  }

  private onPointerMove(e: PointerEvent) {
    this.setPointer(e);
    if (this.lineStart) {
      const level = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(this.lineStart[1] - CUBE / 2));
      const point = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(level, point)) this.updateLine([snap(point.x), this.lineStart[1], snap(point.z)]);
      return;
    }
    const dragging = this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > CLICK_DISTANCE;
    this.showPreview(dragging ? null : this.pick());
  }

  private updateLine(end: Vec3) {
    const start = this.lineStart;
    // Bresenham from start to end over x and z (the original's line())
    const cells: Vec3[] = [];
    let [x0, z0] = [Math.round((start[0] - CUBE / 2) / CUBE), Math.round((start[2] - CUBE / 2) / CUBE)];
    const [x1, z1] = [Math.round((end[0] - CUBE / 2) / CUBE), Math.round((end[2] - CUBE / 2) / CUBE)];
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dz = Math.abs(z1 - z0), sz = z0 < z1 ? 1 : -1;
    let err = (dx > dz ? dx : -dz) / 2;
    for (let guard = 0; guard < GRID * 2 + 2; guard++) {
      const cell: Vec3 = [x0 * CUBE + CUBE / 2, start[1], z0 * CUBE + CUBE / 2];
      if (inBounds(cell) && !this.voxels.has(key(cell))) cells.push(cell);
      if (x0 === x1 && z0 === z1) break;
      const e2 = err;
      if (e2 > -dx) { err -= dz; x0 += sx; }
      if (e2 < dz) { err += dx; z0 += sz; }
    }
    this.lineCells = cells;
    this.line.clear();
    for (const c of cells) {
      const ghost = new THREE.Mesh(this.cubeGeometry, this.previewFill);
      ghost.position.set(c[0], c[1], c[2]);
      this.line.add(ghost);
    }
    this.previewFill.color.set(this.color);
    this.previewFill.opacity = 0.5;
    this.render();
  }

  private onPointerUp(e: PointerEvent) {
    const down = this.down;
    this.down = null;
    if (this.lineStart) {
      const cells = this.lineCells;
      this.lineStart = null;
      this.lineCells = [];
      this.line.clear();
      this.controls.enabled = true;
      if (cells.length) this.callbacks.onAdd(cells.map((p) => ({ p, c: this.color })));
      return;
    }
    // in a shadow root the window sees the host as the target: ask the composed path
    if (!down || this.readOnly || e.composedPath()[0] !== this.renderer.domElement) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_DISTANCE) return; // that turned the view
    this.setPointer(e);
    const { cube, cell } = this.pick();
    // the remove tool, or a right-click with the add tool, removes (as in the original)
    const remove = this.tool === "remove" || (this.tool === "add" && down.button === 2);
    if (remove && down.button !== 1) {
      if (cube) this.callbacks.onRemove(cube);
    } else if (this.tool === "paint" && down.button === 0) {
      if (cube) this.callbacks.onPaint(cube, this.color);
    } else if (this.tool === "add" && down.button === 0) {
      if (cell) this.callbacks.onAdd([{ p: cell, c: this.color }]);
    }
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    for (const [target, type, fn, options] of this.listeners) target.removeEventListener(type, fn, options);
    this.controls.dispose();
    this.cubeGeometry.dispose();
    this.materials.forEach((m) => m.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
