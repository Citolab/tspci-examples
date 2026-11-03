// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/theroom (game/js/theroom.js), © openPCI:
// Elias J.T. Hansen, Anna Rusmann and Jeppe Bundsgaard (Aarhus University and Aalborg University)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

/**
 * Draws the room (model.ts) and lets the candidate arrange it: orbit, pan and zoom the camera; drag furniture over
 * the floor (grid, walls and other furniture snap); turn it with the handle on the selection ring, a double click
 * or the keyboard. Changes go to the store through `onCommit`; the store's layout comes back through `setLayout`.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Placed, newUid } from "./exercise";
import { RoomModel } from "./model";
import { objectBox } from "./scoring";
import { textSprite } from "./shapes";

export type CommitType = "ADD" | "MOVE" | "ROTATE" | "REMOVE";

export type ViewOptions = {
  /** radians */
  rotationStep: number;
  /** metres; 0: no grid */
  gridSize: number;
  showZones: boolean;
  onSelect: (uid: string | null) => void;
  onCommit: (type: CommitType, objects: Placed[], uid: string, info?: { snapped?: boolean }) => void;
  onKey?: (action: "remove" | "undo" | "resetView" | "zoom") => void;
};

const ACCENT = 0x2563eb;
const WARN = 0xdc2626;
const TAU = Math.PI * 2;
export const normalizeAngle = (a: number) => ((a % TAU) + TAU) % TAU;

export class RoomView {
  readonly ok: boolean;
  private renderer: THREE.WebGLRenderer | null = null;
  readonly camera: THREE.PerspectiveCamera;
  private controls: OrbitControls | null = null;
  private root = new THREE.Group();
  private gizmo = new THREE.Group();
  private ring: THREE.Mesh;
  private knob: THREE.Mesh;
  private outline: THREE.Box3Helper;
  private layout: Placed[] = [];
  private selected: string | null = null;
  private raycaster = new THREE.Raycaster();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private drag:
    | { kind: "move"; uid: string; offset: THREE.Vector3; moved: boolean; pointerId: number }
    | { kind: "rotate"; uid: string; moved: boolean; pointerId: number }
    | null = null;
  private mixers = new Map<string, THREE.AnimationMixer>();
  private clock = new THREE.Clock();
  private resizeObserver?: ResizeObserver;
  private zoneLabels: THREE.Sprite[] = [];
  private listeners: [EventTarget, string, EventListener, AddEventListenerOptions | boolean][] = [];
  private canvas: HTMLCanvasElement | null = null;
  private home = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  /** the candidate moved the camera: a resize no longer resets it */
  private viewChanged = false;

  constructor(private host: HTMLElement, private model: RoomModel, private options: ViewOptions) {
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 500);
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch (e) {
      console.warn("theroom: no WebGL", e);
      this.renderer = null;
    }
    this.ok = !!this.renderer;

    this.root.name = "view";
    model.scene.add(this.root);
    model.scene.background = new THREE.Color(0xeef2f7);
    this.addLights();

    // selection: a ring on the floor with a handle at the front, and a box around the furniture
    const ringMaterial = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64).rotateX(-Math.PI / 2), ringMaterial);
    this.ring.position.y = 0.015;
    this.ring.renderOrder = 5;
    this.knob = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.3, emissive: new THREE.Color(ACCENT), emissiveIntensity: 0.35 }));
    this.knob.name = "rotate-handle";
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 3).rotateX(Math.PI / 2), ringMaterial);
    arrow.name = "front-arrow";
    this.gizmo.add(this.ring, this.knob, arrow);
    this.gizmo.visible = false;
    this.outline = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(ACCENT));
    (this.outline.material as THREE.LineBasicMaterial).depthTest = false;
    (this.outline.material as THREE.LineBasicMaterial).transparent = true;
    (this.outline.material as THREE.LineBasicMaterial).opacity = 0.7;
    this.outline.renderOrder = 6;
    this.outline.visible = false;
    this.root.add(this.gizmo, this.outline);

    if (options.showZones) {
      for (const zone of model.zoneMeshes) {
        zone.visible = true;
        const label = zone.userData.label;
        if (label) {
          const sprite = textSprite(label, "#5b21b6", "rgba(237,233,254,0.9)");
          sprite.position.copy(zone.getWorldPosition(new THREE.Vector3())).setY(0.3);
          sprite.scale.multiplyScalar(0.8);
          this.root.add(sprite);
          this.zoneLabels.push(sprite);
        }
      }
    }

    this.setupCamera();

    if (this.renderer) {
      const r = this.renderer;
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.05;
      this.canvas = r.domElement;
      this.canvas.style.display = "block";
      this.canvas.style.width = "100%";
      this.canvas.style.height = "100%";
      this.canvas.style.touchAction = "none";
      host.appendChild(this.canvas);

      this.controls = new OrbitControls(this.camera, this.canvas);
      const c = this.controls;
      c.enableDamping = true;
      c.dampingFactor = 0.12;
      c.screenSpacePanning = false;
      c.minPolarAngle = 0.12;
      c.maxPolarAngle = 1.38;
      const size = model.bounds.getSize(new THREE.Vector3());
      c.minDistance = 1.5;
      c.maxDistance = Math.max(size.x, size.z) * 2.5 + 4;
      c.target.copy(this.home.target);
      c.addEventListener("start", () => (this.viewChanged = true));
      c.addEventListener("change", () => {
        // keep looking at the room
        model.bounds.clampPoint(c.target, c.target);
        c.target.y = THREE.MathUtils.clamp(c.target.y, 0, 1.5);
      });
      c.update();

      // pointer handling runs in the capture phase on the host, before OrbitControls sees the event
      this.on(host, "pointerdown", this.onPointerDown as EventListener, true);
      this.on(window, "pointermove", this.onPointerMove as EventListener);
      this.on(window, "pointerup", this.onPointerUp as EventListener);
      this.on(window, "pointercancel", this.onPointerUp as EventListener);
      this.on(this.canvas, "dblclick", this.onDoubleClick as EventListener);
      this.on(this.canvas, "pointermove", this.onHover as EventListener);

      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(host);
      this.resize();
      r.setAnimationLoop(this.frame);
    }
    this.on(host, "keydown", this.onKeyDown as EventListener);
  }

  private on(target: EventTarget, type: string, fn: EventListener, opts: AddEventListenerOptions | boolean = false) {
    target.addEventListener(type, fn, opts);
    this.listeners.push([target, type, fn, opts]);
  }

  private addLights() {
    const i = this.model.lightIntensity;
    const size = this.model.bounds.getSize(new THREE.Vector3());
    const center = this.model.bounds.getCenter(new THREE.Vector3());
    const hemi = new THREE.HemisphereLight(0xffffff, 0xcbb89d, 1.35 * i);
    const ambient = new THREE.AmbientLight(0xffffff, 0.25 * i);
    const sun = new THREE.DirectionalLight(0xfff4e5, 2.1 * i);
    const span = Math.max(size.x, size.z) / 2 + 2;
    sun.position.set(center.x + span * 0.6, Math.max(size.y, 3) * 4, center.z + span * 0.9);
    sun.target.position.copy(center).setY(0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera as THREE.OrthographicCamera;
    cam.left = -span;
    cam.right = span;
    cam.top = span;
    cam.bottom = -span;
    cam.near = 0.5;
    cam.far = Math.max(size.y, 3) * 10 + span * 2;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 3;
    this.root.add(hemi, ambient, sun, sun.target);
  }

  private setupCamera() {
    const center = this.model.bounds.getCenter(new THREE.Vector3()).setY(0);
    this.home.target.copy(center);
    this.fitHome(this.host.clientWidth / Math.max(1, this.host.clientHeight) || 1.4);
    this.camera.position.copy(this.home.position);
    this.camera.lookAt(this.home.target);
  }

  /** A view from above the south-east, close enough that the room fills the frame. */
  private fitHome(aspect: number) {
    const size = this.model.bounds.getSize(new THREE.Vector3());
    const radius = Math.hypot(size.x, size.z) / 2;
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const distance = (radius / Math.tan(Math.min(vfov, hfov) / 2)) * 0.78;
    const dir = new THREE.Vector3(0.18, 0.95, 0.85).normalize();
    this.home.position.copy(this.home.target).addScaledVector(dir, distance);
  }

  resetView() {
    this.camera.position.copy(this.home.position);
    if (this.controls) {
      this.controls.target.copy(this.home.target);
      this.controls.update();
    } else {
      this.camera.lookAt(this.home.target);
    }
  }

  private resize() {
    if (!this.renderer) return;
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fitHome(w / h);
    if (!this.viewChanged) {
      this.camera.position.copy(this.home.position);
      this.controls?.update();
    }
  }

  // ---- the layout

  setLayout(layout: Placed[]) {
    this.layout = layout;
    this.model.sync(layout);
    for (const p of layout) {
      if (this.mixers.has(p.uid)) continue;
      const clips = this.model.item(p.id)?.animations ?? [];
      const obj = this.model.objectFor(p.uid);
      if (clips.length && obj) {
        const mixer = new THREE.AnimationMixer(obj);
        const action = mixer.clipAction(clips[0]);
        action.loop = THREE.LoopRepeat;
        action.play();
        this.mixers.set(p.uid, mixer);
      }
    }
    for (const uid of [...this.mixers.keys()]) if (!layout.some((p) => p.uid === uid)) this.mixers.delete(uid);
    if (this.selected && !layout.some((p) => p.uid === this.selected && !p.static)) this.select(null);
    this.updateGizmo();
  }

  select(uid: string | null, notify = true) {
    if (uid && !this.layout.some((p) => p.uid === uid && !p.static)) uid = null;
    if (uid === this.selected) return;
    this.selected = uid;
    this.updateGizmo();
    if (notify) this.options.onSelect(uid);
  }

  /** The layout with the furniture where its object in the scene is now. */
  private layoutFromScene(): Placed[] {
    return this.layout.map((p) => {
      const obj = this.model.objectFor(p.uid);
      if (!obj || p.static) return p;
      return {
        ...p,
        pos: [round(obj.position.x), round(obj.position.y), round(obj.position.z)],
        rot: [obj.rotation.x, round(normalizeAngle(obj.rotation.y), 6), obj.rotation.z],
      };
    });
  }

  private settle(obj: THREE.Object3D) {
    this.model.clamp(obj);
    const snapped = this.model.wallSnap(obj) || this.model.pointSnap(obj);
    if (snapped) this.model.clamp(obj);
    return snapped;
  }

  private commit(type: CommitType, uid: string, info?: { snapped?: boolean }) {
    const objects = this.layoutFromScene();
    this.layout = objects;
    this.options.onCommit(type, objects, uid, info);
  }

  /** A new piece of an asset in a free spot near the middle of the view; the store gets it with onCommit. */
  add(id: string) {
    const item = this.model.item(id);
    if (!item) return;
    const uid = newUid();
    const start = (this.controls?.target ?? this.home.target).clone().setY(0);
    this.layout = [...this.layout, { uid, id, pos: [start.x, 0, start.z], rot: [0, 0, 0] }];
    this.model.sync(this.layout);
    const obj = this.model.objectFor(uid);
    if (!obj) return;
    // spiral out until nothing overlaps
    const step = 0.4;
    let found = false;
    for (let ring = 0; ring < 30 && !found; ring++) {
      const n = ring === 0 ? 1 : ring * 8;
      for (let k = 0; k < n && !found; k++) {
        const a = (k / n) * TAU;
        obj.position.set(start.x + Math.cos(a) * ring * step, 0, start.z + Math.sin(a) * ring * step);
        this.model.clamp(obj);
        if (!this.model.overlapping(obj).length) found = true;
      }
    }
    if (!found) obj.position.copy(start);
    this.model.clamp(obj);
    this.selected = uid;
    this.updateGizmo();
    this.options.onSelect(uid);
    // last, so the candidate hears that it was added (being selected comes with that)
    this.commit("ADD", uid);
  }

  remove(uid: string) {
    if (!this.layout.some((p) => p.uid === uid && !p.static)) return;
    this.layout = this.layout.filter((p) => p.uid !== uid);
    if (this.selected === uid) this.select(null);
    this.model.sync(this.layout);
    this.options.onCommit("REMOVE", this.layout, uid);
  }

  /** Turns a piece by `steps` rotation steps (positive: anticlockwise seen from above). */
  rotate(uid: string, steps: number) {
    const obj = this.model.objectFor(uid);
    if (!obj || obj.userData.static) return;
    const step = this.options.rotationStep;
    obj.rotation.y = normalizeAngle(Math.round(obj.rotation.y / step) * step + steps * step);
    obj.updateMatrixWorld(true);
    const snapped = this.settle(obj);
    this.commit("ROTATE", uid, { snapped });
  }

  /** Moves a piece one step away from (up), towards (down), left or right as seen from the camera. */
  nudge(uid: string, direction: "up" | "down" | "left" | "right", fine = false) {
    const obj = this.model.objectFor(uid);
    if (!obj || obj.userData.static) return;
    const step = fine ? 0.05 : this.options.gridSize || 0.25;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    // the nearest axis, so the keys move along the walls
    if (Math.abs(forward.x) > Math.abs(forward.z)) forward.set(Math.sign(forward.x), 0, 0);
    else forward.set(0, 0, Math.sign(forward.z) || -1);
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
    const v = { up: forward, down: forward.clone().negate(), right, left: right.clone().negate() }[direction];
    obj.position.addScaledVector(v, step);
    if (this.options.gridSize && !fine) this.toGrid(obj.position);
    const snapped = this.settle(obj);
    this.commit("MOVE", uid, { snapped });
  }

  private toGrid(p: THREE.Vector3) {
    const g = this.options.gridSize;
    if (!g) return;
    p.x = Math.round(p.x / g) * g;
    p.z = Math.round(p.z / g) * g;
  }

  /** Turns (azimuth) or tilts (polar) the view, in radians. */
  orbit(azimuth: number, polar: number) {
    if (!this.controls) return;
    const c = this.controls;
    const offset = this.camera.position.clone().sub(c.target);
    const s = new THREE.Spherical().setFromVector3(offset);
    s.theta += azimuth;
    s.phi = THREE.MathUtils.clamp(s.phi + polar, c.minPolarAngle, c.maxPolarAngle);
    offset.setFromSpherical(s);
    this.camera.position.copy(c.target).add(offset);
    c.update();
  }

  zoom(factor: number) {
    if (!this.controls) return;
    const c = this.controls;
    const offset = this.camera.position.clone().sub(c.target);
    const d = THREE.MathUtils.clamp(offset.length() * factor, c.minDistance, c.maxDistance);
    this.camera.position.copy(c.target).add(offset.setLength(d));
    c.update();
  }

  // ---- drawing

  private updateGizmo() {
    const obj = this.selected ? this.model.objectFor(this.selected) : null;
    if (!obj) {
      this.gizmo.visible = false;
      this.outline.visible = false;
      return;
    }
    const box = objectBox(obj);
    const size = box.getSize(new THREE.Vector3());
    // the ring fits the piece unturned: size from the footprint, not the turned box
    const fp = obj.userData.footprint ?? this.model.item(obj.userData.modelPath)?.template.userData.footprint;
    const radius = Math.max(0.45, fp ? Math.hypot(fp.width, fp.depth) / 2 + 0.25 : Math.hypot(size.x, size.z) / 2 + 0.15);
    this.gizmo.position.set(obj.position.x, 0, obj.position.z);
    this.gizmo.rotation.y = obj.rotation.y;
    this.ring.scale.setScalar(radius);
    const knobR = Math.max(0.09, radius * 0.07);
    this.knob.scale.setScalar(knobR);
    this.knob.position.set(0, knobR + 0.02, radius + knobR * 1.6);
    const arrow = this.gizmo.getObjectByName("front-arrow")!;
    arrow.scale.setScalar(knobR * 0.9);
    arrow.position.set(0, 0.03, radius - knobR * 0.2);
    this.gizmo.visible = true;
    const overlap = this.model.overlapping(obj).length > 0;
    const color = overlap ? WARN : ACCENT;
    (this.ring.material as THREE.MeshBasicMaterial).color.setHex(color);
    (this.knob.material as THREE.MeshStandardMaterial).color.setHex(color);
    (this.knob.material as THREE.MeshStandardMaterial).emissive.setHex(color);
    this.outline.box.copy(box);
    (this.outline.material as THREE.LineBasicMaterial).color.setHex(color);
    this.outline.visible = true;
  }

  private fadeWalls() {
    const cam = this.camera.position;
    for (const wall of this.model.walls) {
      const outside = cam.clone().sub(wall.center).dot(wall.outward) > 0.05;
      for (const m of wall.meshes) {
        const material = (m as THREE.Mesh | THREE.Sprite).material as THREE.MeshStandardMaterial;
        if (!material) continue;
        const base = material.userData.baseOpacity ?? (material.userData.baseOpacity = material.opacity);
        const target = outside ? ((m as THREE.Sprite).isSprite ? 0 : 0.12) : base;
        if (Math.abs(material.opacity - target) > 0.001) {
          material.opacity += (target - material.opacity) * 0.25;
          if (!(m as THREE.Sprite).isSprite) material.depthWrite = material.opacity > 0.9;
        }
        m.castShadow = !outside;
      }
    }
  }

  private frame = () => {
    if (!this.renderer) return;
    const dt = this.clock.getDelta();
    this.mixers.forEach((m) => m.update(dt));
    this.controls?.update();
    this.fadeWalls();
    if (this.selected) this.updateGizmo();
    this.renderer.render(this.model.scene, this.camera);
  };

  // ---- pointer

  private pointer(e: PointerEvent | MouseEvent) {
    const rect = this.canvas!.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  }

  private floorPoint(e: PointerEvent | MouseEvent) {
    this.raycaster.setFromCamera(this.pointer(e), this.camera);
    return this.raycaster.ray.intersectPlane(this.floorPlane, new THREE.Vector3());
  }

  /** The (movable) piece under the pointer. */
  private pick(e: PointerEvent | MouseEvent): string | null {
    this.raycaster.setFromCamera(this.pointer(e), this.camera);
    const hits = this.raycaster.intersectObjects(this.model.moveables, true);
    for (const hit of hits) {
      const o = hit.object as THREE.Mesh;
      const material = o.material as THREE.Material;
      if (!o.visible || material?.visible === false || /zone|snap/.test(o.name ?? "")) continue;
      let top: THREE.Object3D | null = o;
      while (top && !top.userData.uid) top = top.parent;
      if (top && !top.userData.static) return top.userData.uid;
    }
    return null;
  }

  private hitsKnob(e: PointerEvent | MouseEvent) {
    if (!this.gizmo.visible) return false;
    this.raycaster.setFromCamera(this.pointer(e), this.camera);
    const hit = this.raycaster.intersectObject(this.knob, false).length > 0;
    if (hit) return true;
    // a generous target: the screen distance to the knob
    const p = this.knob.getWorldPosition(new THREE.Vector3()).project(this.camera);
    const rect = this.canvas!.getBoundingClientRect();
    const dx = ((p.x - this.pointer(e).x) * rect.width) / 2;
    const dy = ((p.y - this.pointer(e).y) * rect.height) / 2;
    return Math.hypot(dx, dy) < 16;
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.target !== this.canvas || e.button !== 0 || this.drag) return;
    if (this.selected && this.hitsKnob(e)) {
      this.drag = { kind: "rotate", uid: this.selected, moved: false, pointerId: e.pointerId };
    } else {
      const uid = this.pick(e);
      if (!uid) return; // the controls get it: look around
      const obj = this.model.objectFor(uid)!;
      const floor = this.floorPoint(e) ?? obj.position.clone();
      this.select(uid);
      this.drag = { kind: "move", uid, offset: floor.sub(obj.position), moved: false, pointerId: e.pointerId };
    }
    if (this.controls) this.controls.enabled = false;
    this.canvas!.style.cursor = "grabbing";
    e.preventDefault();
    this.host.focus({ preventScroll: true });
  };

  private onPointerMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const obj = this.model.objectFor(d.uid);
    const floor = this.floorPoint(e);
    if (!obj || !floor) return;
    if (d.kind === "move") {
      const p = floor.sub(d.offset);
      p.y = obj.position.y;
      this.toGrid(p);
      if (p.distanceToSquared(obj.position) < 1e-8) return;
      obj.position.copy(p);
      obj.updateMatrixWorld(true);
      this.settle(obj);
    } else {
      const a = Math.atan2(floor.x - obj.position.x, floor.z - obj.position.z);
      const step = e.shiftKey ? Math.PI / 36 : this.options.rotationStep;
      const next = normalizeAngle(Math.round(a / step) * step);
      if (Math.abs(next - normalizeAngle(obj.rotation.y)) < 1e-6) return;
      obj.rotation.y = next;
      obj.updateMatrixWorld(true);
      this.model.clamp(obj);
    }
    d.moved = true;
    this.updateGizmo();
  };

  private onPointerUp = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    this.drag = null;
    if (this.controls) this.controls.enabled = true;
    if (this.canvas) this.canvas.style.cursor = "";
    if (!d.moved) return;
    if (d.kind === "move") {
      const obj = this.model.objectFor(d.uid)!;
      const snapped = this.settle(obj);
      this.commit("MOVE", d.uid, { snapped });
    } else {
      const obj = this.model.objectFor(d.uid)!;
      const snapped = this.settle(obj);
      this.commit("ROTATE", d.uid, { snapped });
    }
  };

  private onDoubleClick = (e: MouseEvent) => {
    const uid = this.pick(e);
    if (uid) this.rotate(uid, 1);
  };

  private onHover = (e: PointerEvent) => {
    if (this.drag || !this.canvas) return;
    this.canvas.style.cursor = this.selected && this.hitsKnob(e) ? "ew-resize" : this.pick(e) ? "grab" : "";
  };

  // ---- keyboard

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target !== this.host) return;
    const uid = this.selected;
    const key = e.key;
    let handled = true;
    if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === "z") this.options.onKey?.("undo");
    else if (key.startsWith("Arrow")) {
      const dir = key.slice(5).toLowerCase() as "up" | "down" | "left" | "right";
      if (uid) this.nudge(uid, dir, e.shiftKey);
      else if (dir === "left" || dir === "right") this.orbit(dir === "left" ? -Math.PI / 12 : Math.PI / 12, 0);
      else this.orbit(0, dir === "up" ? -0.12 : 0.12);
    } else if ((key === "r" || key === "R") && uid) this.rotate(uid, e.shiftKey ? 1 : -1);
    else if ((key === "Delete" || key === "Backspace") && uid) this.options.onKey?.("remove");
    else if (key === "Escape" && uid) this.select(null);
    else if (key === "+" || key === "=") this.zoom(0.85);
    else if (key === "-" || key === "_") this.zoom(1 / 0.85);
    else if (key === "n" || key === "N") {
      const movable = this.layout.filter((p) => !p.static);
      if (movable.length) {
        const i = movable.findIndex((p) => p.uid === uid);
        const next = movable[(i + (e.shiftKey ? -1 : 1) + movable.length) % movable.length];
        this.select(next.uid);
      }
    } else if (key === "0" || key === "Home") this.options.onKey?.("resetView");
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  destroy() {
    this.renderer?.setAnimationLoop(null);
    this.resizeObserver?.disconnect();
    for (const [t, type, fn, opts] of this.listeners) t.removeEventListener(type, fn, opts);
    this.controls?.dispose();
    for (const zone of this.model.zoneMeshes) zone.visible = false;
    this.model.scene.remove(this.root);
    this.root.traverse((o) => {
      (o as THREE.Mesh).geometry?.dispose?.();
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      m?.dispose?.();
    });
    this.renderer?.dispose();
    this.canvas?.remove();
  }
}

const round = (v: number, digits = 4) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};
