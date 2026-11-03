import { IStore, useStore } from "@citolab/preact-store";
import { useMemo, useRef, useState } from "preact/hooks";
import { Answer, Lang, Part, Settings, choosable, labelOn, nameOf, ownAnswer, partById, place, toggle } from "./hotspot";
import type { ModelDef } from "./models";
import type { HotspotScene, ScenePart } from "./scene3d";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";
import View3D, { Marker } from "./view3d";

// The candidate's view: the question, the 3D model with its viewing aids, and the list of parts. The list is the
// accessible alternative to the model: the same parts with the same letters, every choice and label can be made
// there, and hovering or focusing a part in one shows it in the other.

export type InteractionProps = {
  prompt: string;
  settings: Settings;
  model: ModelDef | null;
  gltf: string;
  showNames: boolean;
  aids: { explode: boolean; cutaway: boolean; visibility: boolean };
  store: IStore<StateModel, Actions>;
  texts: Texts;
  lang: Lang;
  readOnly: boolean;
  idPrefix: string;
  onParts?: (parts: ScenePart[]) => void;
};

const Interaction = ({ prompt, settings, model, gltf, showNames, aids, store, texts: t, lang, readOnly, idPrefix, onParts }: InteractionProps) => {
  const { answer: stored } = useStore(store);
  const answer = ownAnswer(settings, stored);
  const parts = choosable(settings);
  const labelMode = settings.mode === "label";
  const [hover, setHover] = useState<string | null>(null);
  /** the hovered part in the model has parts behind it that another click reaches */
  const [behind, setBehind] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [explode, setExplode] = useState(0);
  const [cut, setCut] = useState(0);
  const [letters, setLetters] = useState(true);
  const [status, setStatus] = useState("");
  const [drag, setDrag] = useState<{ label: string; x: number; y: number } | null>(null);
  const sceneRef = useRef<HotspotScene | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const dragged = useRef(false);

  const title = (p: Part) => (showNames && !labelMode ? t.named(p.letter, nameOf(p.name, lang)) : t.part(p.letter));
  const labelText = (id: string) => {
    const l = settings.labels.find((x) => x.id === id);
    return l ? (lang === "nl" ? l.nl || l.en : l.en || l.nl) : id;
  };
  const set = (next: Answer) => store.dispatch({ type: "SET_ANSWER", payload: { answer: next } });

  /** What the last click in the model did, so a click on the same spot can mean the part behind instead. */
  const last = useRef<{ part: string; label?: string } | null>(null);

  const choose = (id: string, revert: string | null = null) => {
    const p = partById(settings, id);
    if (!p || readOnly) return;
    // the click before on this spot chose `revert`: undo that, the candidate meant the part behind it
    const start = revert ? toggle(settings, answer.selected, revert).selected : answer.selected;
    const r = toggle(settings, start, id);
    if (r.refused) {
      if (revert) set({ ...answer, selected: start });
      return setStatus(t.max(settings.maxChoices));
    }
    set({ ...answer, selected: r.selected });
    setStatus(r.selected.includes(id) ? t.selected(title(p)) : t.deselected(title(p)));
  };

  const putLabel = (label: string, id: string | null) => {
    if (readOnly) return;
    const p = id ? partById(settings, id) : null;
    set({ ...answer, placed: place(answer.placed, label, p ? p.id : null) });
    setPicked(null);
    setStatus(p ? t.placed(labelText(label), title(p)) : t.takenOff(labelText(label)));
  };

  /** A part clicked in the model, Enter on the model, or the part's button in the list. */
  /** A part clicked in the model (`previous`: what the click before on the same spot chose), Enter on the model, or the list. */
  const activate = (id: string | null, from: "model" | "list", previous: string | null = null) => {
    if (readOnly) return;
    const before = from === "model" && previous && last.current?.part === previous ? last.current : null;
    last.current = null;
    if (!id) return setStatus(t.noPart);
    const p = partById(settings, id);
    if (!p?.selectable) return;
    setFocus(id);
    if (!labelMode) {
      choose(id, before ? before.part : null);
      if (from === "model") last.current = { part: id };
      return;
    }
    // label mode: a second click on the spot moves the label it just placed to the part behind
    const label = before?.label ?? picked;
    if (label) {
      putLabel(label, id);
      if (from === "model") last.current = { part: id, label };
      return;
    }
    setStatus(t.pickFirst(title(p)));
    if (from === "model") {
      last.current = { part: id };
      listRef.current?.querySelector<HTMLSelectElement>(`select[data-part="${id}"]`)?.focus();
    }
  };

  const visible = parts.filter((p) => !hidden.includes(p.id));
  const step = (by: number) => {
    if (!visible.length) return;
    const at = visible.findIndex((p) => p.id === focus);
    const next = visible[at < 0 ? (by > 0 ? 0 : visible.length - 1) : (at + by + visible.length) % visible.length];
    setFocus(next.id);
    const state = labelMode ? (labelOn(answer.placed, next.id) ? labelText(labelOn(answer.placed, next.id)!) : "") : answer.selected.includes(next.id) ? t.chosen : "";
    setStatus(t.partFocus(title(next), state));
  };

  const markers = useMemo(() => {
    const m: Record<string, Marker> = {};
    for (const p of parts) {
      const on = labelOn(answer.placed, p.id);
      const pointed = p.id === hover || p.id === focus;
      const named = showNames && !labelMode ? `${p.letter} · ${nameOf(p.name, lang)}` : p.letter;
      const hint = p.id === hover && behind ? ` · ${t.behind}` : "";
      if (labelMode && on) m[p.id] = { kind: "label", text: `${p.letter} · ${labelText(on)}${hint}` };
      else if (!labelMode && answer.selected.includes(p.id)) m[p.id] = { kind: "chosen", text: `✓ ${named}${hint}` };
      else if (pointed) m[p.id] = { kind: "pointed", text: p.id === hover && behind ? `${named} · ${t.behind}` : named };
      else if (letters) m[p.id] = { kind: "letter", text: p.letter };
    }
    return m;
  }, [parts.map((p) => p.id).join(" "), JSON.stringify(answer), hover, behind, focus, letters, showNames, lang]);

  // dragging a label: from the bank onto a part in the model or in the list
  const labelDown = (label: string) => (e: PointerEvent) => {
    if (readOnly || e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY };
    dragged.current = false;
    const el = e.currentTarget as HTMLElement;
    const root = el.getRootNode() as ShadowRoot | Document;
    const move = (ev: PointerEvent) => {
      if (!dragged.current && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
      dragged.current = true;
      setDrag({ label, x: ev.clientX, y: ev.clientY });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      if (!dragged.current) return;
      // the click that may follow this pointerup is not a pick; a later click (or Enter) is
      setTimeout(() => (dragged.current = false), 0);
      const target = root.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const row = target?.closest<HTMLElement>("[data-part]");
      if (target?.closest("[data-testid=model]")) {
        const id = sceneRef.current?.pick(ev.clientX, ev.clientY) ?? null;
        if (id) putLabel(label, id);
        else setStatus(t.noPart);
      } else if (row?.dataset.part) putLabel(label, row.dataset.part);
      else if (target?.closest("[data-testid=bank]") && answer.placed[label]) putLabel(label, null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const labelClick = (label: string) => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    if (readOnly) return;
    const next = picked === label ? null : label;
    setPicked(next);
    setStatus(next ? t.picked(labelText(next)) : t.unpicked);
  };

  const toggleHidden = (id: string) => setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));
  const restart = () => {
    set({ selected: [], placed: {} });
    setPicked(null);
    setStatus(t.cleared);
  };

  const keysHelp = labelMode ? t.keys.label : t.keys.click;
  const modelName = model ? nameOf(model.name, lang) : t.model3d;
  const slider = "w-full accent-sky-700";
  const empty = !answer.selected.length && !Object.keys(answer.placed).length;

  return (
    <div className="@container font-sans text-slate-800" data-mode={settings.mode}>
      {prompt && <p className="m-0 mb-3 max-w-[70ch] text-[15px] text-slate-700" data-testid="prompt" id={`${idPrefix}-prompt`}>{prompt}</p>}
      <div className="grid gap-4 @[640px]:grid-cols-[minmax(0,1fr)_minmax(230px,290px)]">
        <div className="flex min-w-0 flex-col gap-3">
          <View3D model={model} gltf={gltf} known={settings.parts.map((p) => p.id)} selectable={parts.map((p) => p.id)} chosen={labelMode ? [] : answer.selected}
            hover={hover} focus={focus} hidden={hidden} explode={explode / 100} cut={cut / 100} markers={markers} texts={t}
            label={prompt ? `${t.modelLabel(modelName)}: ${prompt}` : t.modelLabel(modelName)} keysHelp={keysHelp} idPrefix={idPrefix}
            onPick={(id, previous) => activate(id, "model", previous)} onHover={(id, more) => { setHover(id); setBehind(more); }} onStep={step} onActivate={() => focus && activate(focus, "model")}
            onParts={onParts} sceneRef={sceneRef} />
          {(aids.explode || aids.cutaway) && (
            <fieldset className="m-0 grid gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2 @[480px]:grid-cols-2">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.view}</legend>
              {aids.explode && (
                <label className="flex items-center gap-2 text-sm">
                  <span className="w-28 shrink-0">{t.explode}</span>
                  <input type="range" min={0} max={100} step={5} value={explode} className={slider} aria-valuetext={t.percent(explode)} data-testid="explode"
                    onInput={(e) => setExplode(Number((e.target as HTMLInputElement).value))} />
                  <output className="w-10 text-right tabular-nums text-slate-600">{t.percent(explode)}</output>
                </label>
              )}
              {aids.cutaway && (
                <label className="flex items-center gap-2 text-sm">
                  <span className="w-28 shrink-0">{t.cutaway}</span>
                  <input type="range" min={0} max={100} step={5} value={cut} className={slider} aria-valuetext={t.percent(cut)} data-testid="cutaway"
                    onInput={(e) => setCut(Number((e.target as HTMLInputElement).value))} />
                  <output className="w-10 text-right tabular-nums text-slate-600">{t.percent(cut)}</output>
                </label>
              )}
            </fieldset>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {labelMode && (
            <section aria-labelledby={`${idPrefix}-labels`} className="rounded-xl border border-slate-200 bg-white p-3" data-testid="bank">
              <h3 id={`${idPrefix}-labels`} className="m-0 mb-1 text-sm font-semibold text-slate-900">{t.labels}</h3>
              <p className="m-0 mb-2 text-xs text-slate-600">{t.labelsHelp}</p>
              <div role="group" aria-labelledby={`${idPrefix}-labels`} className="flex flex-wrap gap-1.5">
                {settings.labels.map((l) => {
                  const on = answer.placed[l.id];
                  const where = on ? t.labelOn(partById(settings, on)?.letter ?? "") : "";
                  return (
                    <button key={l.id} type="button" data-label={l.id} aria-pressed={picked === l.id} disabled={readOnly}
                      aria-label={t.labelButton(labelText(l.id), where)}
                      onPointerDown={labelDown(l.id)} onClick={() => labelClick(l.id)}
                      className={`touch-none select-none rounded-lg border px-2 py-1 text-sm transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-700 disabled:cursor-default ${
                        picked === l.id ? "border-slate-900 bg-slate-900 text-white" : on ? "border-dashed border-slate-400 bg-slate-50 text-slate-500" : "border-amber-700 bg-amber-50 text-amber-950 hover:bg-amber-100"
                      }`}>
                      {labelText(l.id)}
                      {where && <span className="ml-1 text-xs">({where})</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section aria-labelledby={`${idPrefix}-parts`} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 id={`${idPrefix}-parts`} className="m-0 text-sm font-semibold text-slate-900">{t.parts}</h3>
              {aids.visibility && hidden.length > 0 && (
                <button type="button" className="text-xs text-sky-800 underline" onClick={() => setHidden([])}>{t.showAll}</button>
              )}
            </div>
            <ul ref={listRef} className="m-0 flex list-none flex-col gap-1 p-0" data-testid="parts">
              {parts.map((p) => {
                const isChosen = answer.selected.includes(p.id);
                const on = labelOn(answer.placed, p.id);
                const pointed = p.id === hover || p.id === focus;
                return (
                  <li key={p.id} data-part={p.id} onMouseEnter={() => (setHover(p.id), setBehind(false))} onMouseLeave={() => setHover(null)}
                    className={`flex items-center gap-2 rounded-lg border px-1.5 py-1 ${pointed ? "border-slate-900 border-dashed" : "border-transparent"} ${isChosen ? "bg-sky-50" : ""}`}>
                    <button type="button" aria-pressed={labelMode ? undefined : isChosen} disabled={readOnly && !labelMode}
                      onClick={() => activate(p.id, "list")} onFocus={() => setFocus(p.id)} onBlur={() => setFocus((f) => (f === p.id ? null : f))}
                      className={`flex min-w-0 ${labelMode ? "" : "flex-1"} items-center gap-2 rounded-md px-1 py-1 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-700 ${isChosen ? "font-semibold text-[#0b4f8a]" : "text-slate-800"}`}>
                      <span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-md border text-xs font-bold ${isChosen ? "border-[#0b4f8a] bg-[#0b4f8a] text-white" : "border-slate-400 bg-white"}`}>
                        {isChosen ? "✓" : p.letter}
                      </span>
                      <span className={labelMode ? "sr-only" : "min-w-0 truncate"}>{title(p)}</span>
                      {hidden.includes(p.id) && <span className="text-xs font-normal text-slate-500">({t.hidden})</span>}
                    </button>
                    {labelMode && (
                      <select data-part={p.id} aria-label={t.labelFor(title(p))} value={on ?? ""} disabled={readOnly} onFocus={() => setFocus(p.id)}
                        onChange={(e) => {
                          const v = (e.target as HTMLSelectElement).value;
                          if (v) putLabel(v, p.id);
                          else if (on) putLabel(on, null);
                        }}
                        className="min-w-0 flex-[2] rounded-md border border-slate-300 bg-white px-1 py-1 text-sm focus-visible:outline-2 focus-visible:outline-sky-700">
                        <option value="">{t.noLabel}</option>
                        {settings.labels.map((l) => <option key={l.id} value={l.id}>{labelText(l.id)}</option>)}
                      </select>
                    )}
                    {aids.visibility && (
                      <label className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-slate-600 hover:bg-slate-100" title={t.show(title(p))}>
                        <input type="checkbox" className="peer sr-only" checked={!hidden.includes(p.id)} aria-label={t.show(title(p))} onChange={() => toggleHidden(p.id)} />
                        <svg viewBox="0 0 24 24" className="size-5 rounded peer-focus-visible:outline-2 peer-focus-visible:outline-sky-700" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                          <circle cx="12" cy="12" r="3" />
                          {hidden.includes(p.id) && <line x1="3" y1="3" x2="21" y2="21" />}
                        </svg>
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-sm">
              {!labelMode && <span className="text-slate-600" data-testid="count">{t.chosenCount(answer.selected.length)}</span>}
              <label className="flex items-center gap-1.5 text-slate-700">
                <input type="checkbox" checked={letters} onChange={() => setLetters((v) => !v)} className="accent-sky-700" />
                {t.letters}
              </label>
              {!readOnly && (
                <button type="button" onClick={restart} disabled={empty}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-sky-700">
                  {t.clear}
                </button>
              )}
            </div>
          </section>
          <p role="status" aria-live="polite" className="m-0 min-h-[1.25rem] text-sm text-slate-600" data-testid="status">{status}</p>
        </div>
      </div>
      {drag && (
        <span aria-hidden="true" className="pointer-events-none fixed z-50 rounded-lg border border-slate-900 bg-slate-900 px-2 py-1 text-sm text-white shadow-lg"
          style={{ left: `${drag.x + 8}px`, top: `${drag.y + 8}px` }}>
          {labelText(drag.label)}
        </span>
      )}
    </div>
  );
};

export default Interaction;
