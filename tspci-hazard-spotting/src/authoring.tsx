/*
 * The authoring mode (index.tsx getAuthoringInstance): the item author picks the scene, ticks the hazards that count
 * (a hazard that does not count is drawn safe, and becomes a look-alike), and may draw areas of their own that count as
 * a hazard, each with a name, a neutral description and an explanation. The picture shows it all as the pupil will see
 * it, with the hazards outlined and numbered as in the response (h1, h2, …). It writes the settings scene, hazards and
 * extraHazards.
 */
import { useRef, useState } from "preact/hooks";
import { INK, ScenePicture } from "./drawings";
import {
  ExtraArea, MAX_HAZARDS, SCENE_H, SCENE_W, buildSpots, countedSpots, extraId, extrasSetting, fitArea, parseExtras, parseSelection, selectionSetting,
  badgeAt, spotAt,
} from "./hazards";
import { COLORS, SpotShapes } from "./interaction";
import { SCENES, SCENE_IDS, SceneId, hazardIds, sceneId } from "./scenes";
import { Language, TEXTS as PUPIL_TEXTS } from "./texts";

/** What the author chose. */
export type Authored = { scene: SceneId; selected: string[]; extras: ExtraArea[] };

export const authoredFrom = (properties: { scene?: string; hazards?: string; extraHazards?: string }): Authored => {
  const scene = sceneId(properties.scene);
  return { scene, selected: [...parseSelection(properties.hazards, hazardIds(SCENES[scene]))], extras: parseExtras(properties.extraHazards) };
};

export const authoredProperties = (a: Authored): Record<string, string> => ({
  scene: a.scene,
  hazards: selectionSetting(new Set(a.selected), hazardIds(SCENES[a.scene])),
  extraHazards: extrasSetting(a.extras),
});

const countOf = (a: Authored) => a.selected.length + a.extras.length;

/** What keeps Done from finishing. */
export function authoredProblems(a: Authored, language: Language): string[] {
  const t = TEXTS[language];
  const problems: string[] = [];
  if (countOf(a) === 0) problems.push(t.noHazard);
  if (countOf(a) > MAX_HAZARDS) problems.push(t.tooMany(countOf(a)));
  if (a.extras.some((area) => !area.name.trim())) problems.push(t.noName);
  return problems;
}

const TEXTS = {
  en: {
    title: "Choose the scene and the hazards",
    intro: "Pick a picture, and tick the hazards the pupil has to find. A hazard you leave out is drawn safe: then it is a look-alike. You can also draw areas of your own.",
    scene: "Scene",
    hazards: "Hazards in this picture",
    hazardsHint: "Tap a hazard in the picture, or tick it here. The numbers are those of the response: h1, h2, …",
    lookAlikes: "Safe look-alikes (always in the picture)",
    areas: "Areas of your own",
    areasHint: "An area counts as a hazard. Draw it on the picture, or type where it is (the picture is 800 × 500).",
    addArea: "Add an area",
    area: (n: number) => `Area ${n}`,
    name: "Name (shown after answering)",
    label: "Description read to the pupil (neutral, e.g. “the bucket”)",
    why: "Why is it unsafe, and what should be done? (shown after answering)",
    x: "Left",
    y: "Top",
    w: "Width",
    h: "Height",
    draw: "Draw on the picture",
    drawing: (n: number) => `Drag on the picture to draw area ${n}. Escape stops.`,
    stopDrawing: "Stop drawing",
    remove: "Remove",
    removeArea: (n: number) => `Remove area ${n}`,
    counts: (n: number) => `${n} ${n === 1 ? "hazard counts" : "hazards count"} (at most ${MAX_HAZARDS}).`,
    limit: (limit: number, n: number) =>
      limit === n ? `The pupil may place ${limit} marks: as many as there are hazards.` : `Note: the pupil may place ${limit} marks, and ${n} ${n === 1 ? "hazard counts" : "hazards count"}.`,
    noHazard: "Choose at least one hazard, or draw an area.",
    tooMany: (n: number) => `At most ${MAX_HAZARDS} hazards can count, now ${n}: leave one out.`,
    noName: "Give every area a name.",
    preview: "The picture as the pupil sees it, with the hazards outlined",
    notCounted: "drawn safe",
  },
  nl: {
    title: "Plaat en gevaren kiezen",
    intro: "Kies een plaat en vink de gevaren aan die de leerling moet vinden. Een gevaar dat je weglaat, staat veilig op de plaat: dan is het een look-alike. Je kunt ook zelf gebieden tekenen.",
    scene: "Plaat",
    hazards: "Gevaren op deze plaat",
    hazardsHint: "Tik een gevaar aan op de plaat, of vink het hier aan. De nummers zijn die van het antwoord: h1, h2, …",
    lookAlikes: "Veilige look-alikes (altijd op de plaat)",
    areas: "Eigen gebieden",
    areasHint: "Een gebied telt als gevaar. Teken het op de plaat, of typ waar het is (de plaat is 800 × 500).",
    addArea: "Gebied toevoegen",
    area: (n: number) => `Gebied ${n}`,
    name: "Naam (na het antwoorden te zien)",
    label: "Omschrijving die de leerling hoort (neutraal, bijv. „de emmer”)",
    why: "Waarom is het onveilig, en wat moet er gebeuren? (na het antwoorden te zien)",
    x: "Links",
    y: "Boven",
    w: "Breedte",
    h: "Hoogte",
    draw: "Op de plaat tekenen",
    drawing: (n: number) => `Sleep over de plaat om gebied ${n} te tekenen. Escape stopt.`,
    stopDrawing: "Stoppen met tekenen",
    remove: "Verwijderen",
    removeArea: (n: number) => `Gebied ${n} verwijderen`,
    counts: (n: number) => `${n} ${n === 1 ? "gevaar telt" : "gevaren tellen"} mee (hoogstens ${MAX_HAZARDS}).`,
    limit: (limit: number, n: number) =>
      limit === n ? `De leerling mag ${limit} markeringen zetten: evenveel als er gevaren zijn.` : `Let op: de leerling mag ${limit} markeringen zetten, en er ${n === 1 ? "telt 1 gevaar" : `tellen ${n} gevaren`} mee.`,
    noHazard: "Kies minstens één gevaar, of teken een gebied.",
    tooMany: (n: number) => `Hoogstens ${MAX_HAZARDS} gevaren kunnen meetellen, nu ${n}: laat er een weg.`,
    noName: "Geef elk gebied een naam.",
    preview: "De plaat zoals de leerling hem ziet, met de gevaren omlijnd",
    notCounted: "veilig getekend",
  },
};

type Props = {
  initial: Authored;
  language: Language;
  /** the language of the PCI's texts: the texts in the picture */
  pupilLanguage: Language;
  maxMarks?: string;
  onChange: (authored: Authored) => void;
};

export function Authoring({ initial, language, pupilLanguage, maxMarks, onChange }: Props) {
  const [authored, setAuthored] = useState(initial);
  const [drawingArea, setDrawingArea] = useState<number | null>(null);
  const t = TEXTS[language];
  const scene = SCENES[authored.scene];
  const selected = new Set(authored.selected);
  const spots = buildSpots(scene.spots, selected, authored.extras);
  const counted = countedSpots(spots);
  const number = (id: string) => counted.findIndex((spot) => spot.id === id) + 1; // h-number, 0: does not count
  const limit = Number.parseInt(String(maxMarks ?? "0"), 10) || 0;
  const problems = authoredProblems(authored, language);
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; sx: number; sy: number; moved: boolean } | null>(null);

  const change = (next: Authored) => {
    setAuthored(next);
    onChange(next);
  };
  const toggleHazard = (id: string) =>
    change({ ...authored, selected: hazardIds(scene).filter((h) => (h === id ? !selected.has(h) : selected.has(h))) });
  const changeArea = (index: number, area: Partial<ExtraArea>, fit = true) =>
    change({ ...authored, extras: authored.extras.map((a, i) => (i === index ? (fit ? fitArea({ ...a, ...area }) : { ...a, ...area }) : a)) });

  const addArea = () => {
    const index = authored.extras.length;
    change({ ...authored, extras: [...authored.extras, { name: "", label: "", why: "", x: 340, y: 210, w: 120, h: 80 }] });
    setDrawingArea(index);
  };
  const removeArea = (index: number, button: HTMLElement) => {
    const root = button.getRootNode() as ParentNode;
    change({ ...authored, extras: authored.extras.filter((_, i) => i !== index) });
    if (drawingArea !== null) setDrawingArea(null);
    // the button is gone: the focus goes to the button that adds an area
    setTimeout(() => root.querySelector<HTMLButtonElement>("button[data-add-area]")?.focus());
  };

  // ---- the picture: a tap ticks a hazard; in draw mode a drag draws the area ----

  const scenePoint = (e: PointerEvent) => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: Math.min(SCENE_W, Math.max(0, p.x)), y: Math.min(SCENE_H, Math.max(0, p.y)) };
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const p = scenePoint(e);
    if (!p) return;
    if (drawingArea !== null) {
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId); // the drag goes on outside the picture
      } catch {
        // not an active pointer (a synthetic event): the drag works without
      }
    }
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: p.x, sy: p.y, moved: false };
  };
  const onPointerMove = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId || drawingArea === null) return;
    const p = scenePoint(e);
    if (!p || (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 6)) return;
    g.moved = true;
    changeArea(drawingArea, { x: Math.min(g.sx, p.x), y: Math.min(g.sy, p.y), w: Math.abs(p.x - g.sx), h: Math.abs(p.y - g.sy) });
  };
  const onPointerUp = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (drawingArea !== null) {
      if (g.moved) setDrawingArea(null);
      return;
    }
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 10) return;
    const id = spotAt(spots, g.sx, g.sy, e.pointerType === "touch" ? 10 : 2);
    if (id && hazardIds(scene).includes(id)) toggleHazard(id);
  };

  return (
    <div className="flex flex-col gap-4 p-5 font-sans text-ink" onKeyDown={(e) => e.key === "Escape" && drawingArea !== null && setDrawingArea(null)}>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{t.title}</h2>
        <p className="mt-1 text-slate-600">{t.intro}</p>
      </div>

      <div role="radiogroup" aria-label={t.scene} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SCENE_IDS.map((id) => {
          const checked = id === authored.scene;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => {
                if (checked) return;
                setDrawingArea(null);
                change({ ...authored, scene: id, selected: hazardIds(SCENES[id]) });
              }}
              className={`flex cursor-pointer flex-col gap-1.5 rounded-xl border-2 bg-white p-2 text-left text-sm transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-mark ${
                checked ? "border-mark font-semibold text-mark ring-2 ring-sky-200" : "border-slate-200 text-slate-700 hover:border-slate-400"
              }`}
            >
              <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} className="block h-auto w-full rounded-md border border-slate-200" aria-hidden="true">
                <ScenePicture scene={id} unsafe={new Set(hazardIds(SCENES[id]))} t={PUPIL_TEXTS[pupilLanguage].picture} />
              </svg>
              {SCENES[id].name[language]}
            </button>
          );
        })}
      </div>

      <div className="scene-frame">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}
          className="scene"
          style={drawingArea !== null ? { touchAction: "none", cursor: "crosshair" } : undefined}
          role="img"
          aria-label={t.preview}
          data-testid="author-scene"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (gesture.current = null)}
        >
          <ScenePicture scene={scene.id} unsafe={selected} t={PUPIL_TEXTS[pupilLanguage].picture} />
          {spots.map((spot) => {
            const n = number(spot.id);
            const extra = spot.id.startsWith("extra");
            const [bx, by] = badgeAt(spot);
            const badge = { x: bx, y: by };
            const isHazard = extra || scene.spots.find((s) => s.id === spot.id)?.hazard;
            return (
              <g key={spot.id} pointer-events="none" data-testid="author-spot" data-spot={spot.id} data-counts={n > 0}>
                <SpotShapes spot={spot} fill={n ? "rgba(0,114,178,0.12)" : "none"} stroke="#fff" stroke-width="6" />
                <SpotShapes
                  spot={spot}
                  fill="none"
                  stroke={n ? COLORS.mark : "#64748b"}
                  stroke-width={n ? 4 : 2.5}
                  stroke-dasharray={n ? undefined : isHazard ? "10 6" : "3 5"}
                />
                {n > 0 && (
                  <>
                    <rect x={badge.x - 15} y={badge.y - 15} width="30" height="30" rx="6" fill={COLORS.mark} stroke={INK} stroke-width="2" />
                    <text x={badge.x} y={badge.y + 6} text-anchor="middle" font-size="17" font-weight="700" fill="#fff" font-family="system-ui, sans-serif">
                      {n}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {drawingArea !== null && (
        <p className="-mt-2 flex flex-wrap items-center gap-3 font-semibold text-mark" role="status">
          {t.drawing(drawingArea + 1)}
          <button type="button" className="author-button" onClick={() => setDrawingArea(null)}>
            {t.stopDrawing}
          </button>
        </p>
      )}

      <section>
        <h3 className="font-semibold">{t.hazards}</h3>
        <p className="text-sm text-slate-600">{t.hazardsHint}</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {scene.spots
            .filter((spot) => spot.hazard)
            .map((spot) => {
              const n = number(spot.id);
              return (
                <li key={spot.id}>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-white p-2 hover:border-slate-400">
                    <input type="checkbox" className="mt-0.5 h-6 w-6 shrink-0 accent-[#0072b2]" checked={selected.has(spot.id)} onChange={() => toggleHazard(spot.id)} />
                    <span className="min-w-0">
                      <span className="font-semibold">{spot.name![language]}</span>
                      <span className="ml-2 text-sm text-slate-500">
                        {n ? `h${n}` : t.notCounted} · <code>{spot.id}</code>
                      </span>
                      <span className="block text-sm text-slate-600">{spot.why![language]}</span>
                    </span>
                  </label>
                </li>
              );
            })}
        </ul>
        <p className="mt-2 text-sm text-slate-600">
          <span className="font-semibold">{t.lookAlikes}:</span> {scene.spots.filter((spot) => !spot.hazard).map((spot) => spot.label[language]).join(", ")}.
        </p>
      </section>

      <section>
        <h3 className="font-semibold">{t.areas}</h3>
        <p className="text-sm text-slate-600">{t.areasHint}</p>
        {authored.extras.map((area, i) => {
          const n = number(extraId(i));
          return (
            <fieldset key={i} className="mt-2 flex flex-col gap-2 rounded-lg border border-slate-300 bg-white p-3" data-testid="area">
              <legend className="px-1 font-semibold">
                {t.area(i + 1)} {n ? `(h${n})` : ""}
              </legend>
              {(["name", "label", "why"] as const).map((field) => (
                <label key={field} className="flex flex-col gap-1 text-sm">
                  {t[field]}
                  {field === "why" ? (
                    <textarea className="author-input" rows={2} value={area[field]} onInput={(e) => changeArea(i, { [field]: e.currentTarget.value }, false)} />
                  ) : (
                    <input type="text" className="author-input" value={area[field]} onInput={(e) => changeArea(i, { [field]: e.currentTarget.value }, false)} />
                  )}
                </label>
              ))}
              <div className="flex flex-wrap items-end gap-2">
                {(["x", "y", "w", "h"] as const).map((field) => (
                  <label key={field} className="flex flex-col gap-1 text-sm">
                    {t[field]}
                    <input
                      type="number"
                      className="author-input w-24"
                      value={area[field]}
                      min={0}
                      max={field === "x" || field === "w" ? SCENE_W : SCENE_H}
                      onInput={(e) => {
                        const text = e.currentTarget.value;
                        if (text !== "" && Number.isFinite(Number(text))) changeArea(i, { [field]: Number(text) }, false);
                      }}
                      onBlur={() => changeArea(i, {})}
                    />
                  </label>
                ))}
                <button type="button" className="author-button" aria-pressed={drawingArea === i} onClick={() => setDrawingArea(drawingArea === i ? null : i)}>
                  {t.draw}
                </button>
                <button type="button" className="author-button" aria-label={t.removeArea(i + 1)} onClick={(e) => removeArea(i, e.currentTarget)}>
                  {t.remove}
                </button>
              </div>
            </fieldset>
          );
        })}
        <button type="button" data-add-area="" className="author-button mt-2" disabled={countOf(authored) >= MAX_HAZARDS} onClick={addArea}>
          + {t.addArea}
        </button>
      </section>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="author-summary">
        <p>{t.counts(countOf(authored))}</p>
        {limit > 0 && <p>{t.limit(limit, countOf(authored))}</p>}
        {problems.length > 0 && (
          <ul className="mt-1 list-disc pl-5 font-semibold text-[#a14400]">
            {problems.map((problem) => <li key={problem}>{problem}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

