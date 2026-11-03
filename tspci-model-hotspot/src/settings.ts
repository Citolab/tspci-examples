// The settings of an interaction (its data- attributes, as strings) as the PCI uses them: the model and the resolved
// parts, labels and correct answer (hotspot.ts). The PCI, the authoring mode and getCorrectResponse share this, so the
// correct answer and what the candidate sees cannot disagree.
import { ModelDef, modelOf } from "./models";
import { BasePart, Settings, parseCardinality, parseMaxChoices, parseMode, parseSetup, resolveSettings } from "./hotspot";

export const isTrue = (value: unknown, fallback = false) => {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "" ? fallback : v === "true";
};

export type Resolved = {
  /** the built-in model; null for a glTF */
  model: ModelDef | null;
  gltf: string;
  settings: Settings;
  showNames: boolean;
  aids: { explode: boolean; cutaway: boolean; visibility: boolean };
};

/** `found`: the parts a loaded glTF has, when the setup lists none. */
export const resolve = (p: Record<string, unknown>, found: BasePart[] | null = null): Resolved => {
  const gltf = String(p.gltf ?? "").trim();
  const model = gltf ? null : modelOf(p.model);
  const setup = parseSetup(p.setup);
  const base: BasePart[] = model ? model.parts.map((part) => ({ id: part.id, name: part.name })) : setup.parts?.length ? [] : found ?? [];
  const settings = resolveSettings({
    base,
    setup,
    mode: parseMode(p.mode),
    cardinality: parseCardinality(p.cardinality),
    maxChoices: parseMaxChoices(p.maxChoices),
    defaultCorrect: model && !setup.parts && !setup.correct ? model.correct : [],
    open: !model,
  });
  return {
    model,
    gltf,
    settings,
    showNames: isTrue(p.showNames),
    aids: { explode: isTrue(p.explode, true), cutaway: isTrue(p.cutaway, true), visibility: isTrue(p.visibility, true) },
  };
};
