import { useMemo, useState } from "preact/hooks";
import {
  DIMENSIONS, OBJECT_TYPES, ObjectType, Scene, SceneObject, TARGET_KINDS, TOOLS, Target, Tool, correctValue,
  faceById, parseObject, pointById, serializeScene, toolOfTarget, volumeOf,
} from "./geometry";
import { formatNumber, parseNumber } from "./format";
import { Settings, parseSettings } from "./settings";
import { responseProcessingXml } from "./scoring";
import { authoringTextsFor, textsFor } from "./texts";
import { answerUnit, faceName, pointName, withUnit } from "./describe";
import { drawnOf, targetMeasurement } from "./interaction";
import { Viewport, usePrefersReducedMotion } from "./viewport";

// The authoring mode (index.tsx getAuthoringInstance): the objects of the scene, the names of the points, and the
// task: the mode, the tools, what the candidate measures and the margin. A preview shows the scene with the task.

/** What keeps the item from working (getAuthoringInstance validate()), in the author's language. */
export const authoringProblems = (s: Settings, language: string): string[] => {
  const t = authoringTextsFor(language);
  const problems: string[] = [];
  if (!s.scene.objects.some((o) => o.measurable)) problems.push(t.problemNoObjects);
  const seen = new Set<string>();
  for (const p of s.built.points.filter((x) => x.kind === "vertex")) {
    if (seen.has(p.label)) {
      problems.push(t.problemNames(p.label));
      break;
    }
    seen.add(p.label);
  }
  const target = s.target;
  if (s.mode === "answer" && !target) problems.push(t.problemNoTarget);
  if (target) {
    if (target.kind === "volume") {
      const o = s.scene.objects.find((x) => x.id === target.object);
      if (!o) problems.push(t.problemTarget);
      else if (volumeOf(o) === null) problems.push(t.problemVolume);
    } else if (target.kind === "area" ? !faceById(s.built, target.face) : target.points.some((id) => !pointById(s.built, id))) {
      problems.push(t.problemTarget);
    } else if (target.kind !== "area" && new Set(target.points).size < 2) {
      problems.push(t.problemSame);
    }
    const tool = toolOfTarget(target);
    if (s.scoring === "pci" && s.requireMeasurement && tool && !s.tools.includes(tool)) problems.push(t.problemTool(textsFor(language).tool[tool].toLowerCase()));
  }
  return problems;
};

const field = "h-8 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-700";
const button = "h-8 cursor-pointer rounded-md border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-sky-700 disabled:opacity-40";
type Tab = "scene" | "names" | "task";

const NumberField = ({ label, value, onChange, testid, width = "w-20" }: { label: string; value: number; onChange: (n: number) => void; testid?: string; width?: string }) => (
  <label className="flex flex-col gap-0.5 text-xs text-slate-600">
    {label}
    <input type="text" inputMode="decimal" className={`${field} ${width} text-right tabular-nums`} defaultValue={String(value)} data-testid={testid}
      onChange={(e) => {
        const n = parseNumber((e.target as HTMLInputElement).value);
        if (n !== null) onChange(n);
      }} />
  </label>
);

const newId = (scene: Scene, type: ObjectType) => {
  let i = 1;
  while (scene.objects.some((o) => o.id === `${type}${i}`)) i++;
  return `${type}${i}`;
};

const Authoring = ({ properties, language, onChange }: {
  properties: Record<string, string>;
  language: string;
  onChange: (values: Record<string, string>) => void;
}) => {
  const a = authoringTextsFor(language);
  const t = textsFor(language);
  const initial = useMemo(() => parseSettings(properties), []);
  const [scene, setScene] = useState<Scene>(initial.scene);
  const [target, setTarget] = useState<Target | null>(initial.target);
  const [mode, setMode] = useState(initial.mode);
  const [tools, setTools] = useState<Tool[]>(initial.tools);
  const [margin, setMargin] = useState(initial.margin);
  const [tab, setTab] = useState<Tab>("scene");
  const [newType, setNewType] = useState<ObjectType>("box");
  const [pickAt, setPickAt] = useState(0);
  const [version, setVersion] = useState(0); // remounts the number fields of the objects after a remove
  const reducedMotion = usePrefersReducedMotion();

  const commit = (next: { scene?: Scene; target?: Target | null; mode?: "answer" | "tool"; tools?: Tool[]; margin?: number }) => {
    const sc = next.scene ?? scene, tg = next.target !== undefined ? next.target : target;
    const md = next.mode ?? mode, tl = next.tools ?? tools, mg = next.margin ?? margin;
    if (next.scene) setScene(sc);
    if (next.target !== undefined) setTarget(tg);
    if (next.mode) setMode(md);
    if (next.tools) setTools(tl);
    if (next.margin !== undefined) setMargin(mg);
    onChange({ scene: serializeScene(sc), target: tg ? JSON.stringify(tg) : "", mode: md, tools: tl.join(","), margin: String(mg) });
  };

  const settings = useMemo(
    () => parseSettings({ ...properties, scene: serializeScene(scene), target: target ? JSON.stringify(target) : "", mode, tools: tools.join(","), margin: String(margin), language }),
    [scene, target, mode, tools, margin]
  );
  const built = settings.built;
  const correct = correctValue(built, target, settings.scale);
  const unit = answerUnit(settings, target);
  const correctText = correct === null ? null : withUnit(formatNumber(correct, Math.max(2, settings.decimals), settings.language), unit);

  const setObject = (i: number, change: Partial<SceneObject>) =>
    commit({ scene: { ...scene, objects: scene.objects.map((o, k) => (k === i ? { ...o, ...change } : o)) } });

  const drawn = useMemo(() => {
    const m = targetMeasurement(target);
    const d = m ? drawnOf(settings, t, m, `✓ ${correctText ?? ""}`, true) : null;
    return d ? [d] : [];
  }, [settings, correctText]);

  const onPick = (pick: { point: string } | { face: string; pos: number[] }) => {
    if (tab !== "task" || !target) return;
    if (target.kind === "area" && "face" in pick) return commit({ target: { kind: "area", face: pick.face } });
    if ((target.kind === "length" || target.kind === "angle") && "point" in pick) {
      const n = target.kind === "length" ? 2 : 3;
      const points = [...target.points] as string[];
      points[pickAt % n] = pick.point;
      setPickAt((pickAt + 1) % n);
      commit({ target: { kind: target.kind, points } as Target });
    }
  };

  const newTarget = (kind: string): Target | null => {
    const ids = built.points.filter((p) => p.kind === "vertex").map((p) => p.id);
    if (kind === "length") return { kind, points: [ids[0] ?? "", ids[1] ?? ""] };
    if (kind === "angle") return { kind, points: [ids[0] ?? "", ids[1] ?? "", ids[2] ?? ""] };
    if (kind === "area") return { kind, face: built.faces[0]?.id ?? "" };
    if (kind === "volume") return { kind, object: scene.objects.find((o) => o.measurable && volumeOf(o) !== null)?.id ?? "" };
    return null;
  };

  const PointSelect = ({ value, onSelect, label, testid }: { value: string; onSelect: (id: string) => void; label: string; testid: string }) => (
    <label className="flex flex-col gap-0.5 text-xs text-slate-600">
      {label}
      <select className={field} value={value} data-testid={testid} onChange={(e) => onSelect((e.target as HTMLSelectElement).value)}>
        {!pointById(built, value) && <option value={value}>–</option>}
        {(["vertex", "mid", "centre"] as const).map((kind) => (
          <optgroup key={kind} label={t.groups[kind]}>
            {built.points.filter((p) => p.kind === kind).map((p) => <option key={p.id} value={p.id}>{pointName(t, built, p)}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );

  const pointLabels = target?.kind === "length" ? [t.from, t.to] : [t.armA, t.vertex, t.armB];

  return (
    <div className="measure-3d-authoring grid gap-4 p-3 font-sans text-slate-800 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex flex-col gap-2">
        <h2 className="m-0 text-sm font-semibold text-slate-700">{a.preview}</h2>
        <Viewport built={built} drawn={drawn} pending={[]} picking={tab !== "task" || !target ? "none" : target.kind === "area" ? "face" : target.kind === "volume" ? "none" : "point"}
          showPointLabels={true} height={460} texts={t} onPick={onPick as any} label={`${t.scene}. ${a.previewHelp}`} reducedMotion={reducedMotion} />
        <p className="m-0 text-xs text-slate-500">{a.previewHelp}</p>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div role="tablist" aria-label={a.preview} className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {(["scene", "names", "task"] as Tab[]).map((x) => (
            <button key={x} type="button" role="tab" aria-selected={tab === x} onClick={() => setTab(x)}
              className={`h-8 flex-1 cursor-pointer rounded-lg text-sm font-medium focus-visible:outline-2 focus-visible:outline-sky-700 ${tab === x ? "bg-white shadow-sm ring-1 ring-slate-200" : "text-slate-600"}`}>
              {a.tabs[x]}
            </button>
          ))}
        </div>

        {tab === "scene" && (
          <div role="tabpanel" aria-label={a.tabs.scene} className="flex flex-col gap-2">
            <div className="flex items-end gap-2">
              <label className="flex flex-col gap-0.5 text-xs text-slate-600">
                {a.newObject}
                <select className={field} value={newType} data-testid="new-type" onChange={(e) => setNewType((e.target as HTMLSelectElement).value as ObjectType)}>
                  {OBJECT_TYPES.map((x) => <option key={x} value={x}>{t.types[x]}</option>)}
                </select>
              </label>
              <button type="button" className={button} data-testid="add-object" onClick={() => {
                const size = Object.fromEntries(DIMENSIONS[newType].map((d) => [d.key, d.default]));
                const object = parseObject({ id: newId(scene, newType), type: newType, size, position: [0, 0, 0] }, scene.objects.length)!;
                commit({ scene: { ...scene, objects: [...scene.objects, object] } });
              }}>{a.add}</button>
            </div>
            <ul className="m-0 flex max-h-[560px] list-none flex-col gap-2 overflow-auto p-0" key={version}>
              {scene.objects.map((o, i) => (
                <li key={`${o.id}-${i}`} data-testid={`object-${o.id}`} className="flex flex-col gap-2 rounded-xl p-3 ring-1 ring-slate-200">
                  <div className="flex flex-wrap items-end gap-2">
                    <span className="h-8 content-center text-sm font-semibold">{t.types[o.type]}</span>
                    <label className="flex flex-col gap-0.5 text-xs text-slate-600">
                      {a.id}
                      <input className={`${field} w-24`} defaultValue={o.id} onChange={(e) => {
                        const id = (e.target as HTMLInputElement).value.trim();
                        if (/^[A-Za-z][\w-]*$/.test(id) && !scene.objects.some((x, k) => k !== i && x.id === id)) setObject(i, { id });
                      }} />
                    </label>
                    <label className="flex flex-col gap-0.5 text-xs text-slate-600">
                      {a.name}
                      <input className={`${field} w-32`} defaultValue={o.name} placeholder={t.types[o.type]} onChange={(e) => setObject(i, { name: (e.target as HTMLInputElement).value })} />
                    </label>
                    <button type="button" className={`${button} ml-auto`} aria-label={`${a.remove}: ${o.name || o.id}`} onClick={() => {
                      commit({ scene: { ...scene, objects: scene.objects.filter((_, k) => k !== i) } });
                      setVersion(version + 1);
                    }}>{a.remove}</button>
                  </div>
                  <div className="flex flex-wrap gap-2" aria-label={a.size} role="group">
                    {DIMENSIONS[o.type].map((d) => (
                      <NumberField key={d.key} label={a.dimension[d.key] ?? d.key} value={o.size[d.key]} testid={`${o.id}-${d.key}`}
                        onChange={(n) => n > 0 && setObject(i, { size: { ...o.size, [d.key]: d.integer ? Math.max(1, Math.min(20, Math.round(n))) : n } })} />
                    ))}
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    {["x", "y", "z"].map((axis, k) => (
                      <NumberField key={axis} label={`${axis}`} value={o.position[k]} width="w-16" testid={`${o.id}-${axis}`}
                        onChange={(n) => setObject(i, { position: o.position.map((v, j) => (j === k ? n : v)) as SceneObject["position"] })} />
                    ))}
                    <NumberField label={a.rotation} value={o.rotation} width="w-16" onChange={(n) => setObject(i, { rotation: n })} />
                    <label className="flex h-8 items-center gap-1.5 text-xs text-slate-600">
                      <input type="checkbox" checked={o.measurable} onChange={(e) => setObject(i, { measurable: (e.target as HTMLInputElement).checked })} />
                      {a.measurable}
                    </label>
                  </div>
                  <p className="m-0 text-xs text-slate-400">{a.position}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "names" && (
          <div role="tabpanel" aria-label={a.tabs.names} className="flex flex-col gap-2">
            <p className="m-0 text-xs text-slate-600">{a.namesHelp}</p>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500"><th className="py-1 font-medium">{a.object}</th><th className="py-1 font-medium">{a.point}</th><th className="py-1 font-medium">{a.name}</th></tr>
              </thead>
              <tbody>
                {built.points.filter((p) => p.kind === "vertex").map((p) => {
                  const o = scene.objects.find((x) => x.id === p.object);
                  return (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="py-1 text-slate-600">{o?.name || t.types[o?.type ?? "box"]}</td>
                      <td className="py-1 font-mono text-xs text-slate-500">{p.id}</td>
                      <td className="py-1">
                        <input className={`${field} w-20`} aria-label={`${a.name} ${p.id}`} data-testid={`name-${p.id}`} value={scene.names[p.id] ?? ""} placeholder={p.label}
                          onInput={(e) => {
                            const value = (e.target as HTMLInputElement).value.trim();
                            const names = { ...scene.names };
                            if (value) names[p.id] = value.slice(0, 12);
                            else delete names[p.id];
                            commit({ scene: { ...scene, names } });
                          }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === "task" && (
          <div role="tabpanel" aria-label={a.tabs.task} className="flex flex-col gap-3">
            <fieldset className="m-0 flex flex-col gap-1 rounded-xl border border-slate-200 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{a.mode}</legend>
              {(["answer", "tool"] as const).map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="mode" checked={mode === m} data-testid={`mode-${m}`} onChange={() => commit({ mode: m })} />
                  {a.modes[m]}
                </label>
              ))}
            </fieldset>
            <fieldset className="m-0 flex flex-wrap gap-3 rounded-xl border border-slate-200 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{a.toolsUsed}</legend>
              {TOOLS.map((x) => (
                <label key={x} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={tools.includes(x)} data-testid={`tool-${x}`} disabled={tools.length === 1 && tools.includes(x)}
                    onChange={(e) => commit({ tools: TOOLS.filter((y) => (y === x ? (e.target as HTMLInputElement).checked : tools.includes(y))) })} />
                  {t.tool[x]}
                </label>
              ))}
            </fieldset>
            <fieldset className="m-0 flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{a.target}</legend>
              <select className={field} value={target?.kind ?? ""} data-testid="target-kind" onChange={(e) => { setPickAt(0); commit({ target: newTarget((e.target as HTMLSelectElement).value) }); }}>
                <option value="">–</option>
                {TARGET_KINDS.map((k) => <option key={k} value={k}>{a.kinds[k]}</option>)}
              </select>
              {(target?.kind === "length" || target?.kind === "angle") && (
                <div className="flex flex-wrap gap-2">
                  {target.points.map((id, k) => (
                    <PointSelect key={k} value={id} label={pointLabels[k]} testid={`target-${k}`}
                      onSelect={(v) => commit({ target: { kind: target.kind, points: target.points.map((x, j) => (j === k ? v : x)) } as Target })} />
                  ))}
                </div>
              )}
              {target?.kind === "area" && (
                <select className={field} value={target.face} data-testid="target-face" aria-label={t.face} onChange={(e) => commit({ target: { kind: "area", face: (e.target as HTMLSelectElement).value } })}>
                  {built.faces.map((f) => <option key={f.id} value={f.id}>{faceName(t, built, f)}</option>)}
                </select>
              )}
              {target?.kind === "volume" && (
                <select className={field} value={target.object} data-testid="target-object" aria-label={a.object} onChange={(e) => commit({ target: { kind: "volume", object: (e.target as HTMLSelectElement).value } })}>
                  {scene.objects.filter((o) => volumeOf(o) !== null).map((o) => <option key={o.id} value={o.id}>{o.name || t.types[o.type]} ({o.id})</option>)}
                </select>
              )}
              <p className="m-0 text-sm font-medium" data-testid="authoring-correct">{target ? (correctText ? a.correct(correctText) : a.noCorrect) : ""}</p>
              <NumberField label={`${a.margin}: ${unit}`} value={margin} testid="margin" onChange={(n) => n >= 0 && commit({ margin: n })} />
            </fieldset>
            <details className="rounded-xl border border-slate-200 p-3 text-sm">
              <summary className="cursor-pointer select-none font-medium">{a.responseProcessing}</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-snug text-slate-100" data-testid="response-processing">
                {responseProcessingXml(settings.scoring, correct === null ? null : Math.round(correct * 1e4) / 1e4, margin)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
};

export default Authoring;
