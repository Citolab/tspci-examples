// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/svgmap, © OpenPCI (Aarhus University and Aalborg University):
// Elias J.T. Hansen, Anna Rusmann and Jeppe Bundsgaard.
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026.

import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { MapCanvas } from "./canvas";
import { MapModel, MapProblem, Poi, Scoring, loadMap, nearestNode, parsePoi, parseScoring } from "./map";
import { Texts, textsFor } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance), the original's editor: upload the SVG map, click a point of a
// road and make it the start or a point of interest. The result is data-backdrop and data-poi.

export const problemText = (problem: MapProblem | null, t: Texts) =>
  !problem ? null : problem.kind === "invalidSvg" ? t.invalidSvg : problem.kind === "noLayer" ? t.noLayer(problem.layer) : t.noPaths(problem.layer);

const NAME = /^[A-Za-z0-9_-]+$/;

/** What keeps the map from being used (getAuthoringInstance validate()). */
export const authoringProblems = (map: MapModel, poi: Poi, scoring: Scoring, language: string) => {
  const t = textsFor(language);
  const problems: string[] = [];
  const p = problemText(map.problem, t);
  if (p) problems.push(p);
  const unknown = [...scoring.required, ...(scoring.end ? [scoring.end] : [])].filter((name) => poi[name] === undefined);
  return problems
    .concat(Object.keys(poi).filter((name) => !map.nodes[poi[name]]).map((name) => t.unknownPoint(name)))
    .concat(unknown.map((name) => t.unknownPoi(name)));
};

/** Scoring settings that only name points of interest that are there. */
const pruned = (scoring: Scoring, poi: Poi): Scoring => ({
  ...scoring,
  required: scoring.required.filter((name) => poi[name] !== undefined),
  end: scoring.end !== null && poi[scoring.end] !== undefined ? scoring.end : null,
});

const button = "rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-40";

const Authoring = ({ initial, layer, resolution, language, onChange }: {
  initial: { backdrop: string; poi: string; requiredpoi: string; endpoi: string };
  layer: string;
  resolution: string;
  language: string;
  onChange: (value: { backdrop: string; poi: Poi; scoring: Scoring; map: MapModel }) => void;
}) => {
  const t = textsFor(language);
  const scratch = useRef<HTMLDivElement>(null);
  const [backdrop, setBackdrop] = useState(initial.backdrop);
  const [map, setMap] = useState<MapModel | null>(null);
  const [poi, setPoi] = useState<Poi>({});
  const [scoring, setScoring] = useState<Scoring>(parseScoring(initial.requiredpoi, initial.endpoi, "false"));
  const [selected, setSelected] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [hover, setHover] = useState<number | null>(null);

  // the map needs a document to be measured in: load it once the scratch element is there
  useLayoutEffect(() => {
    const loaded = loadMap(backdrop, layer, resolution, scratch.current);
    // a new map: no points of interest (the example map: its own)
    const nextPoi = parsePoi(map === null ? initial.poi : "", loaded);
    const nextScoring = map === null ? scoring : { ...scoring, required: [], end: null };
    setMap(loaded);
    setPoi(nextPoi);
    setScoring(nextScoring);
    setSelected(null);
    onChange({ backdrop, poi: nextPoi, scoring: nextScoring, map: loaded });
  }, [backdrop]);

  const update = (next: Poi, nextScoring: Scoring = scoring) => {
    const s = pruned(nextScoring, next);
    setPoi(next);
    setScoring(s);
    onChange({ backdrop, poi: next, scoring: s, map });
  };

  const upload = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("loadend", () => setBackdrop(String(reader.result ?? "")));
    reader.readAsText(file);
  };

  const nameAt = useMemo(() => {
    const names = new Map<number, string[]>();
    Object.entries(poi).forEach(([n, id]) => names.set(id, [...(names.get(id) ?? []), n]));
    return names;
  }, [poi]);

  const validName = NAME.test(name) && name !== "start";
  const problems = map ? authoringProblems(map, poi, scoring, language) : [];

  return (
    <div className="flex flex-col gap-3 font-sans text-sm text-slate-800">
      <div ref={scratch} aria-hidden="true" className="pointer-events-none invisible absolute size-0 overflow-hidden" />
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${button} cursor-pointer focus-within:outline-2 focus-within:outline-sky-600`}>
          {t.upload}
          <input type="file" accept=".svg,image/svg+xml" className="sr-only" data-testid="upload"
            onChange={(e) => upload((e.target as HTMLInputElement).files?.[0])} />
        </label>
        <button type="button" className={button} onClick={() => setBackdrop("")} disabled={!backdrop} data-testid="example">{t.example}</button>
        {map && !map.problem && (
          <span className="ml-auto text-slate-600" data-testid="summary">{t.summary(map.active.length, map.stops.length)}</span>
        )}
      </div>
      <p className="m-0 text-xs text-slate-500">{t.hint}</p>

      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[280px] flex-[3_1_420px] overflow-hidden rounded-lg border border-slate-200 bg-white">
          {map && (
            <MapCanvas map={map} maxHeight={70} aria-label={t.map} className="mx-auto block h-auto cursor-crosshair touch-none select-none"
              onPointerMove={(e, at, px) => setHover(at ? nearestNode(map, at.x, at.y, 16 * px) : null)}
              onPointerLeave={() => setHover(null)}
              onPointerUp={(e, at, px) => {
                const id = at ? nearestNode(map, at.x, at.y, (e.pointerType === "touch" ? 28 : 16) * px) : null;
                setSelected(id);
                setName(id !== null ? (nameAt.get(id)?.find((n) => n !== "start") ?? "") : "");
              }}
              overlay={(px) => (
                <g pointer-events="none">
                  {map.active.map((id) => (
                    <circle key={id} cx={map.nodes[id].x} cy={map.nodes[id].y} r={(map.nodes[id].endpoint ? 3 : 1.5) * px}
                      fill={map.nodes[id].endpoint ? "#fff" : "#64748b"} stroke="#64748b" stroke-width={map.nodes[id].endpoint ? 1.25 * px : 0} />
                  ))}
                  {Object.entries(poi).map(([n, id]) => (
                    <g key={n}>
                      <circle cx={map.nodes[id]?.x} cy={map.nodes[id]?.y} r={(n === "start" ? 8 : 7) * px}
                        fill={n === "start" ? "#15803d" : "#f59e0b"} stroke="#fff" stroke-width={2.5 * px} />
                      <text x={map.nodes[id]?.x + 11 * px} y={map.nodes[id]?.y + 4 * px} font-size={12 * px} font-weight="600" fill="#1e293b"
                        stroke="#fff" stroke-width={3 * px} paint-order="stroke" font-family="system-ui, sans-serif">{n === "start" ? t.start : n}</text>
                    </g>
                  ))}
                  {hover !== null && <circle cx={map.nodes[hover].x} cy={map.nodes[hover].y} r={9 * px} fill="none" stroke="#0284c7" stroke-width={2 * px} />}
                  {selected !== null && <circle cx={map.nodes[selected].x} cy={map.nodes[selected].y} r={11 * px} fill="none" stroke="#0f172a" stroke-width={2.5 * px} />}
                </g>
              )} />
          )}
        </div>

        <div className="flex min-w-[220px] flex-[1_1_220px] flex-col gap-3">
          <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="selection">
            <p className="m-0 font-semibold">{selected !== null ? t.selected(selected) : t.nothingSelected}</p>
            {selected !== null && (
              <>
                <label className="flex flex-col gap-1">
                  <span>{t.poiName}</span>
                  <input type="text" value={name} data-testid="poi-name" aria-invalid={!!name && !validName}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1"
                    onInput={(e) => setName((e.target as HTMLInputElement).value.trim())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && validName) update({ ...poi, [name]: selected });
                    }} />
                </label>
                {name && !validName && <span className="text-xs text-red-700">{t.invalidName}</span>}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={button} disabled={!validName} data-testid="add-poi"
                    onClick={() => update({ ...poi, [name]: selected })}>{t.addPoi}</button>
                  <button type="button" className={button} disabled={poi.start === selected} data-testid="make-start"
                    onClick={() => update({ ...poi, start: selected })}>{t.makeStart}</button>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <p className="m-0 font-semibold">{t.pois}</p>
            <p className="m-0 text-xs text-slate-500">{t.scoringHint}</p>
            {Object.keys(poi).length === 0 && <p className="m-0 text-slate-500">{t.noPois}</p>}
            <ul className="m-0 flex list-none flex-col gap-1 p-0" data-testid="poi-list">
              {Object.entries(poi).map(([n, id]) => (
                <li key={n} className="flex items-center gap-2">
                  <span className={`size-3 shrink-0 rounded-full ${n === "start" ? "bg-green-700" : "bg-amber-500"}`} />
                  <button type="button" className="truncate text-left hover:underline" onClick={() => { setSelected(id); setName(n === "start" ? "" : n); }}>
                    {n === "start" ? t.start : n}
                  </button>
                  <span className="text-xs text-slate-500 tabular-nums">#{id}</span>
                  {n !== "start" && (
                    <>
                      <label className="ml-auto flex items-center gap-1 text-xs" title={t.mustPassHint}>
                        <input type="checkbox" data-testid={`required-${n}`} checked={scoring.required.includes(n)}
                          onChange={(e) => update(poi, {
                            ...scoring,
                            required: (e.target as HTMLInputElement).checked ? [...scoring.required, n] : scoring.required.filter((r) => r !== n),
                          })} />
                        {t.mustPass}
                      </label>
                      <label className="flex items-center gap-1 text-xs" title={t.endHint}>
                        <input type="checkbox" data-testid={`end-${n}`} checked={scoring.end === n}
                          onChange={(e) => update(poi, { ...scoring, end: (e.target as HTMLInputElement).checked ? n : null })} />
                        {t.end}
                      </label>
                    </>
                  )}
                  <button type="button" aria-label={t.remove(n === "start" ? t.start : n)} title={t.remove(n === "start" ? t.start : n)}
                    className={`${n === "start" ? "ml-auto " : ""}grid size-6 place-items-center rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-800`}
                    onClick={() => {
                      const next = { ...poi };
                      delete next[n];
                      update(next);
                    }}>×</button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {problems.length > 0 && (
        <p className="m-0 text-red-700" data-testid="problems">{problems.join(" ")}</p>
      )}
    </div>
  );
};

export default Authoring;
