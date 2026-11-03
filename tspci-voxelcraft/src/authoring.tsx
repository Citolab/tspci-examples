// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/voxelcraft, © OpenPCI (Aarhus University and Aalborg
// University: Elias J.T. Hansen, Anna Rusmann, Jeppe Bundsgaard)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useEffect, useMemo, useState } from "preact/hooks";
import Interaction from "./interaction";
import { initStore } from "./store";
import { textsFor } from "./texts";
import { Voxel, parseVoxels, sortVoxels } from "./voxels";

// The authoring mode (index.tsx getAuthoringInstance). In the original the author built a figure in the game, copied
// it with Ctrl+C and pasted the JSON into TAO's form; here the author builds the starting figure and the target shape
// in the same 3D editor the candidate uses, and can still copy or paste the JSON.

type Figure = "scene" | "targetShape";

const Authoring = ({ scene, targetShape, colors, emptyColor, language, onChange }: {
  scene: Voxel[];
  targetShape: Voxel[];
  colors: string[];
  emptyColor: string;
  language: string;
  onChange: (which: Figure, voxels: Voxel[]) => void;
}) => {
  const t = textsFor(language);
  const [tab, setTab] = useState<Figure>("scene");
  // a store per figure; "start over" empties it
  const stores = useMemo(() => ({
    scene: initStore({ voxels: scene, changed: false, past: [] }),
    targetShape: initStore({ voxels: targetShape, changed: false, past: [] }),
  }), []);
  const [json, setJson] = useState({ scene: JSON.stringify(scene), targetShape: JSON.stringify(targetShape) });

  useEffect(() => {
    const unsubscribe = (["scene", "targetShape"] as Figure[]).map((which) =>
      stores[which].subscribe((state) => {
        onChange(which, state.voxels);
        setJson((j) => ({ ...j, [which]: JSON.stringify(sortVoxels(state.voxels)) }));
      }, { immediate: false })
    );
    return () => unsubscribe.forEach((u) => u());
  }, []);

  const tabButton = (which: Figure, label: string) => (
    <button type="button" role="tab" id={`tab-${which}`} aria-selected={tab === which} aria-controls={`panel-${which}`}
      data-testid={`tab-${which}`} onClick={() => setTab(which)}
      className={`rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-sky-600 ${tab === which ? "border-sky-600 text-sky-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
      {label}
      <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{stores[which].getState().voxels.length}</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-2 p-1 font-sans text-sm text-slate-800">
      <div role="tablist" className="flex gap-1 border-b border-slate-200"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") setTab(tab === "scene" ? "targetShape" : "scene");
        }}>
        {tabButton("scene", t.preset)}
        {tabButton("targetShape", t.target)}
      </div>
      {(["scene", "targetShape"] as Figure[]).map((which) => (
        tab === which && (
          <div key={which} role="tabpanel" id={`panel-${which}`} aria-labelledby={`tab-${which}`} className="flex flex-col gap-2">
            <p className="m-0 text-xs text-slate-500">{which === "scene" ? t.presetHint : t.targetHint}</p>
            <Interaction store={stores[which]} colors={colors} preset={[]} texts={t}
              emptyColor={which === "targetShape" ? emptyColor || undefined : undefined} />
            <details className="text-xs text-slate-600">
              <summary className="cursor-pointer select-none">JSON</summary>
              <textarea aria-label={t.pasteJson} placeholder={t.pasteJson} rows={3} data-testid={`json-${which}`}
                className="mt-1 w-full rounded-md border border-slate-300 p-2 font-mono text-xs"
                value={json[which]}
                onChange={(e) => {
                  const text = (e.target as HTMLTextAreaElement).value;
                  const voxels = parseVoxels(text);
                  if (voxels.length || /^\s*\[\s*\]\s*$/.test(text) || !text.trim()) {
                    stores[which].dispatch({ type: "RESET", payload: { voxels } });
                  }
                }} />
              <button type="button" className="mt-1 rounded-md border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50"
                onClick={() => navigator.clipboard?.writeText(json[which])}>{t.copyJson}</button>
            </details>
          </div>
        )
      ))}
    </div>
  );
};

export default Authoring;
