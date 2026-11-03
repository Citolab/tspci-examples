import { useMemo, useRef, useState } from "preact/hooks";
import { BasePart, Label, Setup, SetupPart, declarationXml, nameOf, parseSetup, problemsOf, serializeSetup } from "./hotspot";
import { MODELS, MODEL_IDS } from "./models";
import type { ScenePart } from "./scene3d";
import { resolve } from "./settings";
import { Texts, textsFor } from "./texts";
import View3D, { Marker } from "./view3d";

// The authoring mode: the author picks a built-in model or a glTF file, what the candidate does, which parts can be
// chosen and their names, the labels, and the correct answer; clicking a part in the 3D preview marks it correct
// (click mode) or finds it in the list. getProperties() gives the data- attributes; validate() what still has to be done.

export type AuthoringConfig = {
  model: string;
  gltf: string;
  mode: string;
  cardinality: string;
  maxChoices: string;
  showNames: string;
  setup: string;
};

export const authoringProblems = (config: AuthoringConfig, found: BasePart[] | null, language: string, gltfMode = !!config.gltf.trim()) => {
  const t = textsFor(language);
  const r = resolve(config, found);
  const name = (id: string) => {
    const p = r.settings.parts.find((x) => x.id === id);
    return p ? `${p.letter} (${nameOf(p.name, language)})` : id;
  };
  return problemsOf(r.settings, { gltf: gltfMode, url: config.gltf }).map((p) => t.problem(p, name));
};

const field = "w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-sky-700";
const small = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-sky-700";

const Authoring = ({ initial, language, onChange }: { initial: AuthoringConfig; language: string; onChange: (config: AuthoringConfig, found: BasePart[] | null, gltfMode: boolean) => void }) => {
  const t: Texts = textsFor(language);
  const lang = language === "nl" ? "nl" : "en";
  const [config, setConfig] = useState<AuthoringConfig>(initial);
  const [found, setFound] = useState<BasePart[] | null>(null);
  const [useGltf, setUseGltf] = useState(!!initial.gltf.trim());
  const [url, setUrl] = useState(initial.gltf);
  const [focus, setFocus] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const table = useRef<HTMLTableElement>(null);

  const r = useMemo(() => resolve(config, found), [JSON.stringify(config), found]);
  const { settings } = r;
  const setup = parseSetup(config.setup);
  const labelMode = settings.mode === "label";
  const base = r.model ? new Map(r.model.parts.map((p) => [p.id, p.name])) : null;

  const update = (patch: Partial<AuthoringConfig>, nextFound = found, gltfMode = useGltf) => {
    const next = { ...config, ...patch };
    setConfig(next);
    onChange(next, nextFound, gltfMode);
  };
  const writeSetup = (next: Setup) => update({ setup: serializeSetup(next) });

  /** The parts as they are now, as entries of the setup (names only where they differ from the model's). */
  const entries = (): SetupPart[] =>
    settings.parts.map((p) => {
      const own = base?.get(p.id);
      const e: SetupPart = { id: p.id };
      if (!own || p.name.en !== own.en) e.en = p.name.en;
      if (!own || p.name.nl !== own.nl) if (p.name.nl) e.nl = p.name.nl;
      if (!p.selectable) e.selectable = false;
      return e;
    });
  const current = (): Setup => ({ ...setup, parts: entries(), correct: settings.correct, ...(setup.labels ? { labels: settings.labels } : {}) });

  const updatePart = (id: string, patch: Partial<SetupPart>) => {
    const s = current();
    s.parts = s.parts!.map((p) => (p.id === id ? { ...p, ...patch } : p));
    for (const p of s.parts) {
      if (p.en === "") delete p.en;
      if (p.nl === "") delete p.nl;
      if (p.selectable !== false) delete p.selectable;
    }
    if (patch.selectable === false) s.correct = s.correct!.filter((c) => c !== id);
    writeSetup(s);
  };
  /** `revert`: a click on the same spot in the model meant the part behind: the previous click's part flips back first. */
  const toggleCorrect = (id: string, revert: string | null = null) => {
    const s = current();
    const flip = (list: string[], x: string) => (list.includes(x) ? list.filter((c) => c !== x) : settings.cardinality === "single" ? [x] : [...list, x]);
    let list = revert ? flip(settings.correct, revert) : settings.correct;
    const on = list.includes(id);
    list = flip(list, id);
    s.correct = list;
    s.parts = s.parts!.map((p) => (p.id === id && !on ? { id: p.id, ...(p.en ? { en: p.en } : {}), ...(p.nl ? { nl: p.nl } : {}) } : p));
    writeSetup(s);
  };
  const setLabels = (labels: Label[] | null) => {
    const s = current();
    if (labels) s.labels = labels;
    else delete s.labels;
    writeSetup(s);
  };
  const updateLabel = (id: string, patch: Partial<Label>) => setLabels(settings.labels.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLabel = () => {
    let n = settings.labels.length + 1;
    while (settings.labels.some((l) => l.id === `L${n}`)) n++;
    setLabels([...settings.labels, { id: `L${n}`, en: "", nl: "", part: null }]);
  };

  const chooseModel = (value: string) => {
    if (value === "gltf") {
      setUseGltf(true);
      update({ setup: "", gltf: url }, found, true);
      return;
    }
    setUseGltf(false);
    setFound(null);
    update({ model: value, gltf: "", setup: "" }, null, false);
  };
  const loadUrl = () => {
    setFound(null);
    update({ gltf: url.trim(), setup: url.trim() === config.gltf ? config.setup : "" }, null);
  };
  /** The parts in the loaded file: new ones join the setup, ones that are gone leave it. */
  const onParts = (parts: ScenePart[]) => {
    const list: BasePart[] = parts.map((p) => ({ id: p.id, name: { en: p.name, nl: "" } }));
    setFound(list);
    const old = new Map((setup.parts ?? []).map((p) => [p.id, p]));
    const next: Setup = { ...setup, parts: list.map((p) => old.get(p.id) ?? { id: p.id, en: p.name.en }) };
    next.correct = (setup.correct ?? []).filter((id) => list.some((p) => p.id === id));
    update({ setup: serializeSetup(next) }, list);
  };

  const lastPick = useRef<string | null>(null);
  const pick = (id: string | null, previous: string | null = null, fromModel = true) => {
    if (!id) return;
    if (!labelMode) toggleCorrect(id, previous && previous === lastPick.current ? previous : null);
    lastPick.current = fromModel ? id : null;
    setFocus(id);
    table.current?.querySelector<HTMLElement>(`tr[data-part="${id}"] input`)?.focus();
  };

  const markers = useMemo(() => {
    const m: Record<string, Marker> = {};
    for (const p of settings.parts) {
      if (!p.selectable) continue;
      const label = settings.labels.find((l) => l.part === p.id);
      if (labelMode && label) m[p.id] = { kind: "label", text: `${p.letter} · ${lang === "nl" ? label.nl || label.en : label.en || label.nl}` };
      else if (!labelMode && settings.correct.includes(p.id)) m[p.id] = { kind: "chosen", text: `✓ ${p.letter}` };
      else m[p.id] = { kind: p.id === hover || p.id === focus ? "pointed" : "letter", text: p.letter };
    }
    return m;
  }, [JSON.stringify(settings), hover, focus, lang]);

  const problems = authoringProblems(config, found, language, useGltf);
  const gltfMode = useGltf;

  return (
    <div className="@container font-sans text-slate-800" data-testid="authoring">
      <div className="grid gap-4 @[860px]:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <fieldset className="m-0 grid gap-2 rounded-xl border border-slate-200 p-3">
            <legend className="px-1 text-sm font-semibold">{t.aModel}</legend>
            <label className="grid gap-1 text-sm">
              <span>{t.aModel}</span>
              <select className={field} value={gltfMode ? "gltf" : r.model?.id ?? "eye"} onChange={(e) => chooseModel((e.target as HTMLSelectElement).value)}>
                <optgroup label={t.aBuiltIn}>
                  {MODEL_IDS.map((id) => <option key={id} value={id}>{nameOf(MODELS[id].name, lang)}</option>)}
                </optgroup>
                <option value="gltf">{t.aGltf}</option>
              </select>
            </label>
            {gltfMode && (
              <div className="grid gap-1 text-sm">
                <label className="grid gap-1">
                  <span>{t.aUrl}</span>
                  <span className="flex gap-2">
                    <input type="url" className={field} value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && loadUrl()} />
                    <button type="button" className={small} onClick={loadUrl}>{t.aLoad}</button>
                  </span>
                </label>
                <span className="text-xs text-slate-600">{t.aUrlHelp}</span>
                {found && <span className="text-xs text-slate-700" role="status">{t.aFound(found.length)}</span>}
              </div>
            )}
            <div className="grid gap-2 @[420px]:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span>{t.aMode}</span>
                <select className={field} value={settings.mode} onChange={(e) => update({ mode: (e.target as HTMLSelectElement).value })}>
                  <option value="click">{t.aClick}</option>
                  <option value="label">{t.aLabel}</option>
                </select>
              </label>
              {!labelMode && (
                <label className="grid gap-1 text-sm">
                  <span>{t.aCardinality}</span>
                  <select className={field} value={settings.cardinality} onChange={(e) => {
                    const cardinality = (e.target as HTMLSelectElement).value;
                    update({ cardinality, ...(cardinality === "single" ? { setup: serializeSetup({ ...current(), correct: settings.correct.slice(0, 1) }) } : {}) });
                  }}>
                    <option value="single">{t.aSingle}</option>
                    <option value="multiple">{t.aMultiple}</option>
                  </select>
                </label>
              )}
              {!labelMode && settings.cardinality === "multiple" && (
                <label className="grid gap-1 text-sm">
                  <span>{t.aMax}</span>
                  <input type="number" min={0} max={40} className={field} value={config.maxChoices || "0"} onInput={(e) => update({ maxChoices: (e.target as HTMLInputElement).value })} />
                </label>
              )}
              {!labelMode && (
                <label className="flex items-center gap-2 self-end text-sm">
                  <input type="checkbox" checked={r.showNames} onChange={() => update({ showNames: r.showNames ? "false" : "true" })} />
                  {t.aShowNames}
                </label>
              )}
            </div>
          </fieldset>
          <View3D model={gltfMode ? null : r.model} gltf={gltfMode ? config.gltf : ""} known={gltfMode && !found ? (setup.parts ?? []).map((p) => p.id) : []}
            selectable={settings.parts.map((p) => p.id)} chosen={labelMode ? [] : settings.correct} hover={hover} focus={focus} hidden={[]} explode={0} cut={0}
            markers={markers} texts={t} label={t.modelLabel(r.model ? nameOf(r.model.name, lang) : t.model3d)} keysHelp={t.keys.click} idPrefix="authoring"
            onPick={(id, previous) => pick(id, previous)} onHover={(id) => setHover(id)} onStep={(by) => {
              const ids = settings.parts.map((p) => p.id);
              if (!ids.length) return;
              const at = ids.indexOf(focus ?? "");
              setFocus(ids[at < 0 ? 0 : (at + by + ids.length) % ids.length]);
            }} onActivate={() => focus && pick(focus, null, false)} onParts={gltfMode ? onParts : undefined} height={340} />
          <section className="rounded-xl border border-slate-200 p-3">
            <h3 className="m-0 mb-1 text-sm font-semibold">{t.aDeclaration}</h3>
            <p className="m-0 mb-2 text-xs text-slate-600">{t.aDeclarationHelp}</p>
            <pre className="m-0 max-h-48 overflow-auto rounded-md bg-slate-900 p-2 text-xs text-slate-100" data-testid="declaration">{declarationXml(settings)}</pre>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <section className="rounded-xl border border-slate-200 p-3">
            <h3 className="m-0 mb-1 text-sm font-semibold">{t.aParts}</h3>
            <p className="m-0 mb-2 text-xs text-slate-600">{labelMode ? t.aPartsHelpLabel : t.aPartsHelpClick}</p>
            {!settings.parts.length ? (
              <p className="m-0 text-sm text-slate-600">{t.aNone}</p>
            ) : (
              <div className="overflow-x-auto">
                <table ref={table} className="w-full border-collapse text-sm" data-testid="parts-table">
                  <thead>
                    <tr className="text-left text-xs text-slate-600">
                      <th className="p-1 font-medium" />
                      <th className="p-1 font-medium">{t.aSelectable}</th>
                      <th className="p-1 font-medium">{t.aNameEn}</th>
                      <th className="p-1 font-medium">{t.aNameNl}</th>
                      {!labelMode && <th className="p-1 font-medium">{t.aCorrect}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {settings.parts.map((p) => (
                      <tr key={p.id} data-part={p.id} onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)}
                        className={`border-t border-slate-100 ${p.id === focus ? "bg-sky-50" : ""}`}>
                        <td className="p-1 font-mono text-xs text-slate-600" title={`${t.aId}: ${p.id}`}>{p.letter || "–"}</td>
                        <td className="p-1 text-center">
                          <input type="checkbox" checked={p.selectable} aria-label={`${t.aSelectable}: ${p.id}`} onFocus={() => setFocus(p.id)}
                            onChange={() => updatePart(p.id, { selectable: !p.selectable })} />
                        </td>
                        <td className="p-1"><input className={field} value={p.name.en} aria-label={`${t.aNameEn}: ${p.id}`} onFocus={() => setFocus(p.id)} onInput={(e) => updatePart(p.id, { en: (e.target as HTMLInputElement).value })} /></td>
                        <td className="p-1"><input className={field} value={p.name.nl} aria-label={`${t.aNameNl}: ${p.id}`} onFocus={() => setFocus(p.id)} onInput={(e) => updatePart(p.id, { nl: (e.target as HTMLInputElement).value })} /></td>
                        {!labelMode && (
                          <td className="p-1 text-center">
                            <input type={settings.cardinality === "single" ? "radio" : "checkbox"} name="authoring-correct" checked={settings.correct.includes(p.id)}
                              aria-label={`${t.aCorrect}: ${p.id}`} onFocus={() => setFocus(p.id)} onChange={() => toggleCorrect(p.id)}
                              onClick={(e) => settings.cardinality === "single" && settings.correct.includes(p.id) && (e.preventDefault(), toggleCorrect(p.id))} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {labelMode && (
            <section className="rounded-xl border border-slate-200 p-3" data-testid="labels-table">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="m-0 text-sm font-semibold">{t.aLabels}</h3>
                <span className="flex gap-2">
                  <button type="button" className={small} onClick={() => setLabels(null)}>{t.aFromParts}</button>
                  <button type="button" className={small} onClick={addLabel}>{t.aAddLabel}</button>
                </span>
              </div>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-600">
                    <th className="p-1 font-medium">{t.aLabelEn}</th>
                    <th className="p-1 font-medium">{t.aLabelNl}</th>
                    <th className="p-1 font-medium">{t.aBelongs}</th>
                    <th className="p-1" />
                  </tr>
                </thead>
                <tbody>
                  {settings.labels.map((l) => (
                    <tr key={l.id} data-label={l.id} className="border-t border-slate-100">
                      <td className="p-1"><input className={field} value={l.en} aria-label={`${t.aLabelEn}: ${l.id}`} onInput={(e) => updateLabel(l.id, { en: (e.target as HTMLInputElement).value })} /></td>
                      <td className="p-1"><input className={field} value={l.nl} aria-label={`${t.aLabelNl}: ${l.id}`} onInput={(e) => updateLabel(l.id, { nl: (e.target as HTMLInputElement).value })} /></td>
                      <td className="p-1">
                        <select className={field} value={l.part ?? ""} aria-label={`${t.aBelongs}: ${l.id}`} onChange={(e) => updateLabel(l.id, { part: (e.target as HTMLSelectElement).value || null })}>
                          <option value="">{t.aDistractor}</option>
                          {settings.parts.filter((p) => p.selectable).map((p) => <option key={p.id} value={p.id}>{`${p.letter} · ${nameOf(p.name, lang)}`}</option>)}
                        </select>
                      </td>
                      <td className="p-1 text-right">
                        <button type="button" className="rounded px-1 text-slate-600 hover:bg-slate-100" aria-label={t.aRemove(l.en || l.nl || l.id)}
                          onClick={() => setLabels(settings.labels.filter((x) => x.id !== l.id))}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className={`rounded-xl border p-3 ${problems.length ? "border-amber-300 bg-amber-50" : "border-emerald-300 bg-emerald-50"}`} data-testid="problems" aria-live="polite">
            <h3 className="m-0 mb-1 text-sm font-semibold">{t.aProblems}</h3>
            {problems.length ? (
              <ul className="m-0 list-disc pl-5 text-sm">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
            ) : (
              <p className="m-0 text-sm">✓ {t.aNoProblems}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default Authoring;
