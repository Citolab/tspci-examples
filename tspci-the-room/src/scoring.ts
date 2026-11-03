// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/theroom (game/js/scoringapi.js), © openPCI:
// Elias J.T. Hansen, Anna Rusmann and Jeppe Bundsgaard (Aarhus University and Aalborg University)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

/**
 * Scoring by rules. The original scored with a JavaScript function of the author's that called its Scoring API; this
 * port runs no author code (no eval, CSP-safe): the checks of that API are plain TypeScript here, and an exercise lists
 * declarative rules that use them (scoreRules). Object types are regular expressions tested against the asset id (the
 * original's model path); zones against the names of the zones. The checks behave as in the original, with one
 * difference: the box of a piece of furniture leaves out its snap planes and object zones (those are not furniture).
 */
import * as THREE from "three";

export type ScoringWorld = {
  scene: THREE.Scene;
  room: THREE.Object3D;
  moveables: THREE.Object3D[];
};

const isHelper = (o: THREE.Object3D) => /zone|snap/.test(o.name ?? "");

/** The box around the visible furniture of an object (without snap planes and zones). */
export const objectBox = (object: THREE.Object3D, target = new THREE.Box3()) => {
  target.makeEmpty();
  object.updateWorldMatrix(true, true);
  const tmp = new THREE.Box3();
  object.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh || isHelper(o)) return;
    let hidden = false;
    for (let p: THREE.Object3D | null = o; p && p !== object.parent; p = p.parent) if (isHelper(p)) hidden = true;
    if (hidden) return;
    const mesh = o as THREE.Mesh;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    tmp.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
    target.union(tmp);
  });
  return target;
};

export const createScoring = (world: ScoringWorld) => {
  const { scene } = world;

  const findByType = (type: string): THREE.Object3D[] => {
    const regex = new RegExp(type || "", "i");
    return world.moveables.filter((obj) => regex.test(obj.userData.modelPath));
  };

  const findByArea = (area: string, objType: string) => {
    const result: THREE.Object3D[] = [];
    const areaObjs: THREE.Object3D[] = [];
    const reg = new RegExp(area, "i");
    scene.traverse((o) => {
      if (o.name && reg.test(o.name) && /zone/.test(o.name) && !o.userData.objectZone) areaObjs.push(o);
    });
    if (!areaObjs.length) throw new Error(`Area ${area} not found!`);
    const objs = findByType(objType);
    areaObjs.forEach((areaObj) => {
      const areaBB = new THREE.Box3().setFromObject(areaObj);
      for (const obj of objs) if (areaBB.intersectsBox(objectBox(obj))) result.push(obj);
    });
    return result;
  };

  const roomMeshes = () => {
    const targets: THREE.Object3D[] = [];
    world.room.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !/zone/.test(o.name ?? "")) targets.push(o);
    });
    return targets;
  };

  const snappersOf = (object: THREE.Object3D, test: RegExp) => {
    const result: THREE.Object3D[] = [];
    object.traverse((o) => {
      if (test.test(o.name ?? "")) result.push(o);
    });
    return result;
  };

  /** 1 when one of the snap planes of the object touches the room (a wall) within 1 m. */
  const wallSnapObjectTest = (object: THREE.Object3D) => {
    const targets = roomMeshes();
    const rotation = new THREE.Quaternion();
    for (const snapper of snappersOf(object, /^snap/)) {
      snapper.getWorldQuaternion(rotation);
      const v = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
      const pos = snapper.getWorldPosition(new THREE.Vector3());
      if (new THREE.Raycaster(pos, v, 0, 1).intersectObjects(targets, false).length) return 1;
    }
    return 0;
  };

  const otherSnapPlanes = (object: THREE.Object3D) => {
    const result: THREE.Object3D[] = [];
    world.moveables.forEach((o) => {
      if (o === object) return;
      o.traverse((p) => {
        if (/snap/.test(p.name ?? "")) result.push(p);
      });
    });
    return result;
  };

  /** 1 when one of the snap planes of the object meets one of another object, within 1 m, in either direction. */
  const pointSnapObjectTest = (object: THREE.Object3D) => {
    const others = otherSnapPlanes(object);
    for (const snapper of snappersOf(object, /snap/)) {
      for (const dir of [1, -1]) {
        const q = snapper.getWorldQuaternion(new THREE.Quaternion());
        const v = new THREE.Vector3(0, dir, 0).applyQuaternion(q);
        const pos = snapper.getWorldPosition(new THREE.Vector3());
        if (new THREE.Raycaster(pos, v, 0, 1).intersectObjects(others, false).length) return 1;
      }
    }
    return 0;
  };

  /** The number of object-snap planes of the object without another object's snap plane within 1 m. */
  const countUnSnapped = (object: THREE.Object3D) => {
    object.updateMatrixWorld();
    const others = world.moveables
      .filter((o) => o !== object)
      .reduce((all, o) => all.concat(snappersOf(o, /obj_snap/)), [] as THREE.Object3D[]);
    let unsnapped = 0;
    snappersOf(object, /snap/).forEach((snapper) => {
      const pos = new THREE.Vector3().setFromMatrixPosition(snapper.matrixWorld);
      const snapped = others.some((other) => pos.distanceTo(new THREE.Vector3().setFromMatrixPosition(other.matrixWorld)) < 1);
      if (!snapped) unsnapped++;
    });
    return unsnapped;
  };

  const Scoring = {
    /** 1 when the closest piece of type A (not the target) is at most as close to the (first) target as the closest
     * piece of type `than` that is not of type A (the original's ACloserThanB and closerThanOthers). */
    closerThan: (objTypeA: string, targetType: string, objTypeB: string) => {
      const target = findByType(targetType)[0];
      const as = findByType(objTypeA).filter((o) => o !== target);
      if (!target || !as.length) return 0;
      const bs = findByType(objTypeB).filter((o) => o !== target && !as.includes(o));
      const closest = (objs: THREE.Object3D[]) => objs.reduce((d, o) => Math.min(d, target.position.distanceTo(o.position)), Infinity);
      return closest(as) <= closest(bs) ? 1 : 0;
    },
    /** The objects whose type matches `name` (a regex). */
    find: findByType,
    /** The objects of `objType` that intersect the zone `area`. */
    findByArea,
    /** The number of objects of `objType` in the zone `area`. */
    areaTest: (area: string, objType?: string) => findByArea(area, objType ?? "").length,
    /** The number of collisions between objects of type A and type B. */
    collisionTest: (objType1: string, objType2: string) => {
      const collided: THREE.Object3D[] = [];
      let collisions = 0;
      const objs2 = findByType(objType2);
      findByType(objType1).forEach((o1) => {
        if (collided.includes(o1)) return;
        const bb1 = objectBox(o1);
        objs2.forEach((o2) => {
          if (o1 === o2) return;
          if (bb1.intersectsBox(objectBox(o2))) {
            collisions++;
            collided.push(o2);
          }
        });
      });
      return collisions;
    },
    /** The number of object-snap planes that are not snapped, over all objects of `objType`. */
    noSnap: (objType?: string) => findByType(objType || "").reduce((sum, o) => sum + countUnSnapped(o), 0),
    /** The number of objects of `objType` against a wall (with `pointTest` also those snapped to other objects). */
    wallSnapTest: (objType: string, pointTest?: boolean) =>
      findByType(objType).filter((o) => wallSnapObjectTest(o) || (pointTest && pointSnapObjectTest(o))).length,
    /** The number of objects of `objType` snapped to another object. */
    objectSnapTest: (objType: string) => findByType(objType).filter((o) => pointSnapObjectTest(o)).length,
    /** The number of objects of `objType` whose object zone `area` intersects an object of `otherType` (or the room). */
    objZoneTest: (objType: string, area: string, otherType: string, useRoom?: boolean) => {
      let collisions = 0;
      const others: THREE.Object3D[] = [];
      if (useRoom) {
        world.room.traverse((o) => {
          if ((o as THREE.Mesh).isMesh && !/zone/.test(o.name ?? "") && !/^floor$/.test(o.name ?? "")) others.push(o);
        });
      }
      findByType(otherType).forEach((o) => others.push(o));
      findByType(objType).forEach((object) => {
        const zones: THREE.Object3D[] = [];
        object.traverse((o) => {
          if (o.name && o.name.includes("zone") && o.name.includes(area)) zones.push(o);
        });
        const hit = zones.some((zone) => {
          const zoneBox = new THREE.Box3().setFromObject(zone);
          return others.some((other) => {
            if (other === object) return false;
            const otherBox = other.userData.modelPath ? objectBox(other) : new THREE.Box3().setFromObject(other);
            return otherBox.intersectsBox(zoneBox);
          });
        });
        if (hit) collisions++;
      });
      return collisions;
    },
  };
  return Scoring;
};

export type ScoringApi = ReturnType<typeof createScoring>;

/**
 * A scoring rule: `name` (the key in the score), `object` (a type, default every piece) and one check.
 * Every check counts pieces (n) and compares n with `count`; the score is 1 or 0, or n with `"value": "count"`.
 */
export type ScoringRule = {
  name: string;
  object?: string;
  /** n = pieces in the zone; default count ">=1". `"count": "==0"` keeps a zone free. */
  inZone?: string;
  /** n = pieces against a wall; default count "all" */
  nearWall?: boolean;
  /** n = pieces against a wall or snapped to another piece; default count "all" */
  snapped?: boolean;
  /** 1 when no two pieces (of the type) overlap */
  noOverlap?: boolean;
  /** 1 when no object-snap side of the pieces is left open (a closed track) */
  connected?: boolean;
  /** 1 when the closest piece of the type is at least as close to this target as any piece of `than` */
  closerTo?: string;
  than?: string;
  /** n = pieces whose object zone of this name has something in it (other pieces, `others`, or the room); default count "==0" */
  zoneClear?: string;
  others?: string;
  /** ">=3", "==0", "<2", "3", "all"; alone (no check): compares the number of pieces of the type */
  count?: string | number;
  value?: "count";
};

const compare = (n: number, total: number, count: string | number | undefined, fallback: string) => {
  const text = String(count ?? fallback).trim();
  if (text === "all") return n === total;
  const m = /^(>=|<=|==|=|>|<|!=)?\s*(\d+(?:\.\d+)?)$/.exec(text);
  if (!m) return false;
  const v = parseFloat(m[2]);
  switch (m[1]) {
    case ">=": return n >= v;
    case "<=": return n <= v;
    case ">": return n > v;
    case "<": return n < v;
    case "!=": return n !== v;
    default: return n === v;
  }
};

/** The rules of an exercise or a setting (JSON text or an array) → the rules; anything else: none. */
export const parseRules = (rules: unknown): ScoringRule[] | null => {
  let value = rules;
  if (typeof value === "string") {
    if (!value.trim()) return null;
    try {
      value = JSON.parse(value);
    } catch {
      console.warn("theroom: the scoring rules are not JSON");
      return null;
    }
  }
  if (!Array.isArray(value)) return null;
  return value.filter((r): r is ScoringRule => !!r && typeof r === "object" && typeof r.name === "string");
};

/** The score: per rule its name and 1/0 (or a count); null for a rule that cannot be checked (an unknown zone). */
export const scoreRules = (scoring: ScoringApi, rules: ScoringRule[]): Record<string, number | null> => {
  const result: Record<string, number | null> = {};
  for (const rule of rules) {
    const type = rule.object ?? ".";
    try {
      const total = scoring.find(type).length;
      let n: number;
      let ok: boolean;
      if (rule.inZone !== undefined) {
        n = scoring.areaTest(rule.inZone, type);
        ok = compare(n, total, rule.count, ">=1");
      } else if (rule.nearWall) {
        n = scoring.wallSnapTest(type);
        ok = compare(n, total, rule.count, "all");
      } else if (rule.snapped) {
        n = scoring.wallSnapTest(type, true);
        ok = compare(n, total, rule.count, "all");
      } else if (rule.noOverlap) {
        n = scoring.collisionTest(type, type);
        ok = n === 0;
      } else if (rule.connected) {
        n = scoring.noSnap(type);
        ok = n === 0;
      } else if (rule.closerTo !== undefined) {
        n = scoring.closerThan(type, rule.closerTo, rule.than ?? ".");
        ok = n === 1;
      } else if (rule.zoneClear !== undefined) {
        n = scoring.objZoneTest(type, rule.zoneClear, rule.others ?? ".", true);
        ok = compare(n, total, rule.count, "==0");
      } else {
        n = total;
        ok = compare(n, total, rule.count, ">=1");
      }
      result[rule.name] = rule.value === "count" ? n : ok ? 1 : 0;
    } catch (e) {
      console.warn(`theroom: scoring rule ${rule.name}:`, e);
      result[rule.name] = null;
    }
  }
  return result;
};

