// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/theroom (game/js/theroom.js, game/js/lib/*.js), © openPCI:
// Elias J.T. Hansen, Anna Rusmann and Jeppe Bundsgaard (Aarhus University and Aalborg University)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

/**
 * The room as a three.js scene, without a renderer: the room, the furniture of a layout, snapping, and the response
 * with its score. The view (view.ts) draws it; getResponse() uses it on its own, so the score is there even when
 * nothing is drawn.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ExerciseSource, Placed, ProceduralExercise, labelFromPath, labelIn, toPlaced } from "./exercise";
import { buildAsset, buildRoom, RoomBuild } from "./shapes";
import { ScoringApi, ScoringRule, createScoring, objectBox, parseRules, scoreRules } from "./scoring";

export type CatalogueItem = {
  id: string;
  label: string;
  /** how many may be in the room */
  count: number;
  /** a colour for the palette */
  color: string;
  template: THREE.Object3D;
  animations: THREE.AnimationClip[];
};

/** What getResponse() reports, as in the original: the exercise, the scene, every object and the score. */
export type SerializedRoom = {
  exercise: string;
  scene: string | null;
  objects: { id: string; pos: number[]; rot: (number | string)[] }[];
  score?: unknown;
};

const markHelpers = (root: THREE.Object3D, isObject: boolean) => {
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const mesh = o as THREE.Mesh;
    const name = o.name ?? "";
    if (/glass/.test(name)) {
      const m = (mesh.material as THREE.MeshStandardMaterial).clone();
      m.transparent = true;
      m.opacity = 0.5;
      mesh.material = m;
      return;
    }
    if (/zone/.test(name)) {
      o.visible = false;
      if (isObject) o.userData.objectZone = true;
      return;
    }
    if (/snap/.test(name)) {
      const m = (mesh.material as THREE.Material).clone();
      m.visible = false;
      m.side = THREE.DoubleSide;
      mesh.material = m;
      return;
    }
    if (!isObject && mesh.material) (mesh.material as THREE.Material).side = THREE.DoubleSide;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
};

export class RoomModel {
  readonly scene = new THREE.Scene();
  room: THREE.Object3D = new THREE.Group();
  /** where furniture may stand (the original's `boundingbox`) */
  bounds = new THREE.Box3(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
  walls: RoomBuild["walls"] = [];
  zoneMeshes: THREE.Mesh[] = [];
  catalogue: CatalogueItem[] = [];
  /** the layout at the start (the exercise's objects) */
  start: Placed[] = [];
  lightIntensity = 1;
  prompt = "";
  /** procedural rooms: keep a whole piece of furniture inside the walls; glTF: its centre, as the original */
  readonly procedural: boolean;
  status: "loading" | "ready" | "error" = "loading";
  error = "";
  readonly ready: Promise<void>;
  readonly exerciseName: string;
  scenePath: string | null = null;

  private objects = new Map<string, THREE.Object3D>();
  private rules: ScoringRule[] | null = null;
  private scoring: ScoringApi;
  private furniture = new THREE.Group();

  constructor(source: ExerciseSource, options: { scoringRules?: string; language: string }) {
    this.exerciseName = source.name;
    this.procedural = source.kind === "procedural";
    this.furniture.name = "furniture";
    const model = this;
    this.scoring = createScoring({
      scene: this.scene,
      get room() {
        return model.room;
      },
      get moveables() {
        return model.moveables;
      },
    });
    this.ready = (source.kind === "procedural"
      ? Promise.resolve(this.buildProcedural(source.exercise, options.language))
      : this.loadGltf(source.baseUrl, source.name)
    )
      .then(() => {
        this.scene.add(this.room, this.furniture);
        // the item's own rules (data-scoring-rules) before the exercise's
        const own = parseRules(options.scoringRules);
        if (own) this.rules = own;
        this.status = "ready";
      })
      .catch((e) => {
        console.warn("theroom: could not load the exercise", e);
        this.status = "error";
        this.error = String(e?.message ?? e);
      });
  }

  /** the furniture in the room now, as the scoring API sees it */
  get moveables(): THREE.Object3D[] {
    return [...this.objects.values()];
  }

  item = (id: string) => this.catalogue.find((c) => c.id === id);

  private buildProcedural(exercise: ProceduralExercise, language: string) {
    const built = buildRoom(exercise.room, language);
    this.room = built.group;
    this.bounds = built.bounds;
    this.walls = built.walls;
    this.zoneMeshes = built.zoneMeshes;
    this.prompt = labelIn(exercise.prompt, language, "");
    this.catalogue = exercise.assets.map((a) => {
      const template = buildAsset(a);
      markHelpers(template, true);
      return {
        id: a.id,
        label: labelIn(a.label, language, labelFromPath(a.id)),
        count: Math.max(0, a.count ?? 1),
        color: a.color ?? "#a8a29e",
        template,
        animations: [],
      };
    });
    this.start = (exercise.objects ?? []).map(toPlaced).filter((p): p is Placed => !!p && !!this.item(p.id));
    this.rules = parseRules(exercise.rules);
  }

  /** The original's exercises: `<gameurl>/exercises/<exercise>` with a glTF scene and glTF assets. */
  private async loadGltf(baseUrl: string, exercise: string) {
    const base = new URL("exercises/", new URL(baseUrl, document.baseURI)).href;
    const response = await fetch(new URL(exercise, base).href);
    if (!response.ok) throw new Error(`${exercise}: ${response.status}`);
    const json = await response.json();
    const loader = new GLTFLoader();
    const sceneGltf = await loader.loadAsync(new URL(json.scene, base).href);
    this.scenePath = json.scene;
    const room = sceneGltf.scene;
    room.name = "room";
    markHelpers(room, false);
    const bbobj = room.getObjectByName("boundingbox");
    room.updateMatrixWorld(true);
    if (bbobj) {
      this.bounds = new THREE.Box3().setFromObject(bbobj);
      bbobj.parent?.remove(bbobj);
    } else {
      this.bounds = new THREE.Box3().setFromObject(room);
    }
    this.lightIntensity = room.userData.light_intensity || 1;
    room.traverse((o) => {
      if (/zone/.test(o.name ?? "") && (o as THREE.Mesh).isMesh) this.zoneMeshes.push(o as THREE.Mesh);
    });
    this.room = room;
    const palette = ["#2563eb", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0891b2", "#dc2626", "#65a30d"];
    const assets: { model: string; count?: number }[] = Array.isArray(json.assets) ? json.assets : [];
    for (const [i, asset] of assets.entries()) {
      const gltf = await loader.loadAsync(new URL(asset.model, base).href);
      markHelpers(gltf.scene, true);
      this.catalogue.push({
        id: asset.model,
        label: labelFromPath(asset.model),
        count: asset.count || 1,
        color: palette[i % palette.length],
        template: gltf.scene,
        animations: gltf.animations ?? [],
      });
    }
    this.start = (Array.isArray(json.objects) ? json.objects : []).map(toPlaced).filter((p): p is Placed => !!p && !!this.item(p.id));
    // a JavaScript scoringFunction of the original is not run (no author code): only `rules` score
    if (json.scoringFunction) console.info("theroom: the exercise's scoringFunction is ignored; give it `rules` instead");
    this.rules = parseRules(json.rules);
  }

  /** Puts the furniture of a layout in the scene (adds, moves and removes objects). */
  sync(layout: Placed[]) {
    const keep = new Set<string>();
    for (const p of layout) {
      const item = this.item(p.id);
      if (!item) continue;
      keep.add(p.uid);
      let obj = this.objects.get(p.uid);
      if (!obj) {
        obj = item.template.clone(true);
        obj.userData.modelPath = p.id;
        obj.userData.uid = p.uid;
        this.objects.set(p.uid, obj);
        this.furniture.add(obj);
      }
      obj.userData.static = !!p.static;
      obj.position.fromArray(p.pos);
      obj.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
    }
    for (const [uid, obj] of this.objects) {
      if (!keep.has(uid)) {
        this.furniture.remove(obj);
        this.objects.delete(uid);
      }
    }
    this.scene.updateMatrixWorld(true);
  }

  objectFor = (uid: string) => this.objects.get(uid);

  /** How many of each asset the candidate can still add. */
  remaining(layout: Placed[]): Record<string, number> {
    const result: Record<string, number> = {};
    for (const c of this.catalogue) result[c.id] = c.count - layout.filter((p) => p.id === c.id).length;
    return result;
  }

  /** The score of the layout by the scoring rules (undefined without rules). */
  score(layout: Placed[]): unknown {
    if (this.status !== "ready" || !this.rules) return undefined;
    this.sync(layout);
    try {
      return scoreRules(this.scoring, this.rules);
    } catch (e) {
      console.warn("theroom: scoring failed", e);
      return null;
    }
  }

  serialize(layout: Placed[]): SerializedRoom {
    const result: SerializedRoom = {
      exercise: this.exerciseName,
      scene: this.scenePath,
      objects: layout.map((p) => ({ id: p.id, pos: [...p.pos], rot: [p.rot[0], p.rot[1], p.rot[2], "XYZ"] })),
    };
    const score = this.score(layout);
    if (score !== undefined) result.score = score;
    return result;
  }

  /** A response (the JSON of serialize) → a layout; furniture the author fixed in place stays fixed. */
  parse(text: string): Placed[] | null {
    let data: SerializedRoom;
    try {
      data = JSON.parse(text);
    } catch {
      return null;
    }
    if (!data || !Array.isArray(data.objects)) return null;
    const statics = this.start.filter((s) => s.static);
    return data.objects
      .map(toPlaced)
      .filter((p): p is Placed => !!p)
      .map((p) => {
        const fixed = statics.find((s) => s.id === p.id && s.pos.every((v, i) => Math.abs(v - p.pos[i]) < 1e-3));
        return fixed ? { ...p, static: true } : p;
      });
  }

  // ---- moving furniture: the behaviours of the original (WallSnapObject, PointSnapObject) and the room's bounds

  private roomTargets() {
    const targets: THREE.Object3D[] = [];
    this.room.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !/zone/.test(o.name ?? "") && o.name !== "floor") targets.push(o);
    });
    return targets;
  }

  /** Snaps a `snap` plane of the object against the room when it is within 40 cm (WallSnapObject). */
  wallSnap(object: THREE.Object3D): boolean {
    object.updateMatrixWorld(true);
    const snappers: THREE.Object3D[] = [];
    object.traverse((o) => {
      if (/^snap/.test(o.name ?? "")) snappers.push(o);
    });
    if (!snappers.length) return false;
    const targets = this.roomTargets();
    const q = new THREE.Quaternion();
    for (const snapper of snappers) {
      snapper.getWorldQuaternion(q);
      const v = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const pos = snapper.getWorldPosition(new THREE.Vector3());
      const hit = new THREE.Raycaster(pos, v, 0, 0.4).intersectObjects(targets, false)[0];
      if (hit) {
        object.position.sub(pos.sub(hit.point));
        object.updateMatrixWorld(true);
        return true;
      }
    }
    return false;
  }

  /** Snaps an `obj_snap` plane of the object onto one of another object within 1 m (PointSnapObject). */
  pointSnap(object: THREE.Object3D): boolean {
    object.updateMatrixWorld(true);
    const snappers: THREE.Object3D[] = [];
    object.traverse((o) => {
      if (/obj_snap/.test(o.name ?? "")) snappers.push(o);
    });
    if (!snappers.length) return false;
    const others: THREE.Object3D[] = [];
    for (const o of this.objects.values()) {
      if (o === object) continue;
      o.traverse((p) => {
        if (/obj_snap/.test(p.name ?? "")) others.push(p);
      });
    }
    let best: { snapper: THREE.Object3D; other: THREE.Object3D; distance: number } | null = null;
    const q = new THREE.Quaternion();
    for (const snapper of snappers) {
      snapper.getWorldQuaternion(q);
      const v = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const pos = snapper.getWorldPosition(new THREE.Vector3());
      const hit = new THREE.Raycaster(pos, v, 0, 1).intersectObjects(others, false)[0];
      if (hit && (!best || hit.distance < best.distance)) best = { snapper, other: hit.object, distance: hit.distance };
    }
    if (!best) return false;
    const otherPos = best.other.getWorldPosition(new THREE.Vector3());
    const snapperPos = best.snapper.getWorldPosition(new THREE.Vector3());
    object.position.sub(snapperPos.sub(otherPos));
    object.updateMatrixWorld(true);
    return true;
  }

  /** Keeps the object in the room: all of it in a built-in room, its centre in a glTF scene. */
  clamp(object: THREE.Object3D) {
    const b = this.bounds;
    if (this.procedural) {
      const box = objectBox(object);
      if (box.isEmpty()) return;
      for (const axis of ["x", "z"] as const) {
        const size = box.max[axis] - box.min[axis];
        if (size >= b.max[axis] - b.min[axis]) object.position[axis] += (b.min[axis] + b.max[axis]) / 2 - (box.min[axis] + box.max[axis]) / 2;
        else if (box.min[axis] < b.min[axis]) object.position[axis] += b.min[axis] - box.min[axis];
        else if (box.max[axis] > b.max[axis]) object.position[axis] -= box.max[axis] - b.max[axis];
      }
    } else {
      object.position.x = THREE.MathUtils.clamp(object.position.x, b.min.x, b.max.x);
      object.position.z = THREE.MathUtils.clamp(object.position.z, b.min.z, b.max.z);
    }
    object.updateMatrixWorld(true);
  }

  /** The furniture whose box overlaps that of the object. */
  overlapping(object: THREE.Object3D): THREE.Object3D[] {
    const box = objectBox(object).expandByScalar(-0.005);
    return this.moveables.filter((o) => o !== object && objectBox(o).intersectsBox(box));
  }

  dispose() {
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => {
        (x as THREE.MeshStandardMaterial).map?.dispose();
        x.dispose();
      });
    });
  }
}
