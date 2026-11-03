// The response for a plane, and the plane in a response: shared by the interaction and the authoring mode.
import type { QtiRecordItem, QtiVariableJSON } from "@citolab/tspci";
import { Model, PlaneParams, buildModel, sectionOf } from "./geometry";
import { Settings, evaluate, parsePlane, r2 } from "./settings";

export const modelOf = (s: Settings): Model => buildModel({ type: s.solid, dims: s.dims, baseSides: s.baseSides });

/**
 * The plane in a response, a correct response or a saved value: the plane field of a record, a tool's JSON, a
 * correct response from a declaration ({ plane: "…" } or field values), or the plane as text.
 */
export const planeIn = (value: any): PlaneParams | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const text = value.trim();
    if (text.startsWith("{")) {
      try {
        const o = JSON.parse(text);
        if (o?.plane) return planeIn(typeof o.plane === "string" ? o.plane : JSON.stringify(o.plane));
        return parsePlane(text);
      } catch {
        return null;
      }
    }
    return parsePlane(text);
  }
  if (Array.isArray(value?.record)) return planeIn(value.record.find((f: any) => f?.name === "plane")?.base?.string);
  if (typeof value?.base?.string === "string") return planeIn(value.base.string);
  if (typeof value?.plane === "string") return planeIn(value.plane);
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = v?.fieldIdentifier === "plane" || v?.name === "plane" ? planeIn(v.value ?? v.base?.string) : planeIn(v);
      if (found) return found;
    }
  }
  return null;
};

/** The response for a plane: a record in answer mode, a JSON string in tool mode. */
export const responseFor = (s: Settings, model: Model, plane: PlaneParams, found: string[] = []): QtiVariableJSON => {
  const sec = sectionOf(model, plane, s.tolerance);
  const planeJson = JSON.stringify({ offset: r2(plane.offset), tilt: r2(plane.tilt), turn: r2(plane.turn) });
  if (s.mode === "tool") {
    return {
      base: {
        string: JSON.stringify({
          shape: sec.shape, sides: sec.sides, area: r2(sec.area), lengths: sec.measures.map(r2), plane: JSON.parse(planeJson), found,
        }),
      },
    } as QtiVariableJSON;
  }
  const e = evaluate(s.target, sec);
  const check = (name: string) => e.checks.find((c) => c.name === name);
  const record: QtiRecordItem[] = [
    { name: "score", base: { integer: e.score } },
    { name: "maxscore", base: { integer: e.maxscore } },
    { name: "correct", base: { integer: e.correct ? 1 : 0 } },
  ];
  for (const name of ["shape", "lengths", "area"]) {
    const c = check(name);
    if (c) record.push({ name: `${name}Ok`, base: { integer: c.passed ? 1 : 0 } });
  }
  record.push(
    { name: "shape", base: { identifier: sec.shape } } as QtiRecordItem,
    { name: "kinds", base: { string: sec.kinds.join(" ") } },
    { name: "sides", base: { integer: sec.sides } },
    { name: "area", base: { float: r2(sec.area) } },
    { name: "lengths", base: { string: sec.measures.map(r2).join(" ") } },
    { name: "plane", base: { string: planeJson } },
  );
  return { record } as QtiVariableJSON;
};
