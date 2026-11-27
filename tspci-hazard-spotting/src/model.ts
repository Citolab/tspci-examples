/*
 * The scene the settings make: which scene, which of its hazards count (and are drawn unsafe), the author's own areas,
 * the spots for hit testing (hazards.ts) and the texts of every spot in the PCI's language.
 */
import { ExtraArea, Spot, buildSpots, countedSpots, extraId, extrasSetting, parseExtras, parseLimit, parseSelection, readingOrder } from "./hazards";
import { SCENES, SceneId, hazardIds, sceneId } from "./scenes";
import { Language, languageOf } from "./texts";

/** What the pupil and the review get to read about a spot. */
export type SpotInfo = {
  /** neutral, before answering too: "the ladder" */
  label: string;
  /** a hazard that counts: what is unsafe, and why and what to do */
  name?: string;
  why?: string;
  /** a spot that is safe: why */
  safe?: string;
};

export type Model = {
  scene: SceneId;
  sceneName: string;
  language: Language;
  /** the spots in the order of the scene, then the author's areas */
  spots: Spot[];
  /** the spots in reading order: the order of the keyboard */
  order: Spot[];
  /** the hazards that count: h1, h2, … */
  counted: Spot[];
  info: Record<string, SpotInfo>;
  /** the scene's hazards that count: drawn unsafe */
  unsafe: Set<string>;
  /** the author's areas that count */
  extras: ExtraArea[];
  limit: number;
  penalty: boolean;
  /** what a saved state belongs to: a state of another layout is not restored */
  layout: string;
};

type Settings = { scene?: string; hazards?: string; extraHazards?: string; maxMarks?: string | number; penalty?: string | boolean; language?: string };

const AREA_LABEL = { en: "a part of the picture", nl: "een deel van de plaat" };
const AREA_NAME = { en: "Hazard", nl: "Gevaar" };

export function modelFrom(settings: Settings, language: Language = languageOf(settings.language)): Model {
  const scene = SCENES[sceneId(settings.scene)];
  const selected = parseSelection(settings.hazards, hazardIds(scene));
  const allExtras = parseExtras(settings.extraHazards);
  const spots = buildSpots(scene.spots, selected, allExtras);
  const extras = allExtras.filter((_, i) => spots.some((spot) => spot.id === extraId(i)));
  const info: Record<string, SpotInfo> = {};
  for (const spot of scene.spots) {
    const counts = spot.hazard && selected.has(spot.id);
    info[spot.id] = counts
      ? { label: spot.label[language], name: spot.name?.[language], why: spot.why?.[language] }
      : { label: spot.label[language], safe: spot.safe[language] };
  }
  extras.forEach((area, i) => {
    info[extraId(i)] = { label: area.label || AREA_LABEL[language], name: area.name || `${AREA_NAME[language]} ${i + 1}`, why: area.why };
  });
  const unsafe = new Set(scene.spots.filter((spot) => spot.hazard && selected.has(spot.id)).map((spot) => spot.id));
  return {
    scene: scene.id,
    sceneName: scene.name[language],
    language,
    spots,
    order: readingOrder(spots),
    counted: countedSpots(spots),
    info,
    unsafe,
    extras,
    limit: parseLimit(settings.maxMarks),
    penalty: String(settings.penalty ?? "true") !== "false",
    layout: `${scene.id}|${[...unsafe].sort().join(",")}|${extrasSetting(extras)}`,
  };
}
