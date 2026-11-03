// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/theroom, © openPCI: Elias J.T. Hansen, Anna Rusmann and
// Jeppe Bundsgaard (Aarhus University and Aalborg University)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useEffect, useRef, useState } from "preact/hooks";
import { IStore } from "@citolab/preact-store";
import { Placed } from "./exercise";
import { RoomModel } from "./model";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";
import { CommitType, RoomView, normalizeAngle } from "./view";

type Props = {
  model: RoomModel;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  prompt: string;
  height: number;
  rotationStep: number;
  gridSize: number;
  showZones: boolean;
  disabled?: boolean;
};

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
    stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path d={d} />
  </svg>
);

const icons = {
  undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  view: "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  restart: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  left: "M2.5 2v6h6M2.66 15.57a10 10 0 1 0 .57-8.38",
  right: "M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38",
  remove: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6",
  close: "M18 6 6 18M6 6l12 12",
  plus: "M12 5v14M5 12h14",
};

const button =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium " +
  "text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40";

export const Interaction = (props: Props) => {
  const { model, store, texts } = props;
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<RoomView | null>(null);
  const [status, setStatus] = useState(model.status);
  const [layout, setLayout] = useState<Placed[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [webgl, setWebgl] = useState(true);
  const [announcement, setAnnouncement] = useState({ text: "", n: 0 });
  const layoutRef = useRef<Placed[]>([]);

  // the same message twice still gets read: every other one ends in a no-break space
  const announce = (text: string) => setAnnouncement((a) => ({ text: a.n % 2 ? text : `${text}\u00a0`, n: a.n + 1 }));

  /** "Family table 2": numbered when there can be more than one. */
  const nameOf = (uid: string | null, objects = layoutRef.current) => {
    const p = objects.find((o) => o.uid === uid);
    if (!p) return "";
    const item = model.item(p.id);
    const label = item?.label ?? p.id;
    const same = objects.filter((o) => o.id === p.id);
    return same.length > 1 || (item?.count ?? 1) > 1 ? texts.piece(label, same.indexOf(p) + 1) : label;
  };

  useEffect(() => {
    let alive = true;
    setStatus(model.status);
    model.ready.then(() => alive && setStatus(model.status));
    return () => {
      alive = false;
    };
  }, [model]);

  useEffect(() => {
    if (status !== "ready" || !host.current) return;
    const v = new RoomView(host.current, model, {
      rotationStep: props.rotationStep,
      gridSize: props.gridSize,
      showZones: props.showZones,
      onSelect: (uid) => {
        setSelected(uid);
        announce(uid ? texts.selected(nameOf(uid)) : texts.deselected);
      },
      onCommit: (type: CommitType, objects: Placed[], uid: string, info) => {
        const name = nameOf(uid, type === "REMOVE" ? layoutRef.current : objects);
        store.dispatch({ type, payload: { objects, uid } });
        const p = objects.find((o) => o.uid === uid);
        const snapped = info?.snapped ? `, ${texts.snapped}` : "";
        if (type === "ADD") announce(texts.added(name));
        else if (type === "REMOVE") announce(texts.removed(name));
        else if (type === "ROTATE" && p) announce(texts.turned(name, Math.round((normalizeAngle(p.rot[1]) * 180) / Math.PI) % 360) + snapped);
        else if (type === "MOVE") announce(texts.moved(name) + snapped);
      },
      onKey: (action) => {
        if (action === "undo") undo();
        else if (action === "resetView") resetView();
        else if (action === "remove") removeSelected();
      },
    });
    view.current = v;
    setWebgl(v.ok);
    const unsubscribe = store.subscribe((s) => {
      const objects = s.objects ?? model.start;
      layoutRef.current = objects;
      v.setLayout(objects);
      setLayout(objects);
      setCanUndo(s.past.length > 0);
      setAtStart(s.objects === null);
    });
    return () => {
      unsubscribe();
      v.destroy();
      view.current = null;
    };
  }, [status, model, store, props.rotationStep, props.gridSize, props.showZones]);

  // the view's selection follows the list
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;

  const select = (uid: string | null) => {
    view.current?.select(uid);
  };
  const undo = () => {
    if (!store.getState().past.length) return;
    store.dispatch({ type: "UNDO", payload: null });
    announce(texts.undone);
  };
  const resetView = () => {
    view.current?.resetView();
    announce(texts.viewReset);
  };
  const startOver = () => {
    store.dispatch({ type: "START_OVER", payload: null });
    announce(texts.startedOver);
  };
  const removeSelected = () => {
    const uid = selectedRef.current;
    if (uid) view.current?.remove(uid);
  };

  const remaining = model.status === "ready" ? model.remaining(layout) : {};
  const selectedObject = selected ? model.objectFor(selected) : null;
  const overlaps = selectedObject ? model.overlapping(selectedObject).length : 0;
  const prompt = props.prompt || model.prompt;
  const disabled = !!props.disabled;

  return (
    <div class="the-room font-sans text-slate-800">
      {prompt && <p class="mb-3 text-base leading-relaxed">{prompt}</p>}
      <div class="flex flex-col gap-3 md:flex-row">
        <div class="order-2 flex flex-col gap-3 md:order-1 md:w-60 md:shrink-0">
          <section aria-labelledby="furniture-heading" class="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <h3 id="furniture-heading" class="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{texts.furniture}</h3>
            <ul class="flex flex-col gap-1.5">
              {model.catalogue.map((item) => {
                const left = remaining[item.id] ?? 0;
                return (
                  <li key={item.id}>
                    <button type="button" class={`${button} w-full !items-start text-left`} disabled={disabled || status !== "ready" || left <= 0}
                      aria-label={`${texts.add(item.label)}, ${left > 0 ? texts.left(left) : texts.none}`}
                      onClick={() => view.current?.add(item.id)}>
                      <span class="mt-1 h-3.5 w-3.5 shrink-0 rounded-sm ring-1 ring-black/10" style={{ background: item.color }} aria-hidden="true" />
                      <span class="flex min-w-0 flex-1 flex-col" aria-hidden="true">
                        <span class="truncate">{item.label}</span>
                        <span class="text-xs font-normal text-slate-500">{left > 0 ? texts.left(left) : texts.none}</span>
                      </span>
                      <span class="mt-0.5 text-slate-400" aria-hidden="true"><Icon d={icons.plus} /></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
          <section aria-labelledby="inroom-heading" class="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <h3 id="inroom-heading" class="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{texts.inRoom}</h3>
            {layout.length === 0 ? (
              <p class="text-sm text-slate-500">{texts.nothingInRoom}</p>
            ) : (
              <ul class="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {layout.map((p) => {
                  const item = model.item(p.id);
                  return (
                    <li key={p.uid}>
                      <button type="button" disabled={disabled || p.static} aria-pressed={selected === p.uid}
                        onClick={() => select(selected === p.uid ? null : p.uid)}
                        class={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm focus-visible:outline-2 focus-visible:outline-blue-600 ${
                          selected === p.uid ? "bg-blue-600 text-white" : "hover:bg-slate-100"
                        } disabled:cursor-default disabled:text-slate-400 disabled:hover:bg-transparent`}>
                        <span class="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item?.color ?? "#999" }} aria-hidden="true" />
                        <span class="truncate">{nameOf(p.uid, layout)}</span>
                        {p.static && <span class="ml-auto text-xs">({texts.fixed})</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div class="order-1 min-w-0 flex-1 md:order-2">
          <div class="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm" style={{ height: `${props.height}px` }}>
            <div ref={host} tabIndex={disabled ? -1 : 0} role="application" aria-label={texts.roomLabel} aria-describedby="room-description"
              class="absolute inset-0 outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-blue-500/60"
              style={disabled ? { pointerEvents: "none" } : undefined} />
            <p id="room-description" class="sr-only">{texts.roomDescription}</p>

            {status === "loading" && (
              <div class="absolute inset-0 grid place-items-center text-sm text-slate-500" role="status">{texts.loading}</div>
            )}
            {status === "error" && (
              <div class="absolute inset-0 grid place-items-center p-6 text-center text-sm text-red-700" role="alert">{texts.error(model.error)}</div>
            )}
            {status === "ready" && !webgl && (
              <div class="absolute inset-0 grid place-items-center p-6 text-center text-sm text-slate-600">{texts.noWebGL}</div>
            )}

            {status === "ready" && (
              <div class="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap items-start justify-end gap-1.5">
                <button type="button" class={`${button} pointer-events-auto`} onClick={undo} disabled={disabled || !canUndo}>
                  <Icon d={icons.undo} /><span class="hidden sm:inline">{texts.undo}</span><span class="sr-only sm:hidden">{texts.undo}</span>
                </button>
                <button type="button" class={`${button} pointer-events-auto`} onClick={resetView} disabled={!webgl}>
                  <Icon d={icons.view} /><span class="hidden sm:inline">{texts.resetView}</span><span class="sr-only sm:hidden">{texts.resetView}</span>
                </button>
                <button type="button" class={`${button} pointer-events-auto`} onClick={startOver} disabled={disabled || atStart}>
                  <Icon d={icons.restart} /><span class="hidden sm:inline">{texts.startOver}</span><span class="sr-only sm:hidden">{texts.startOver}</span>
                </button>
              </div>
            )}

            {selected && selectedObject && (
              <div class="absolute inset-x-2 bottom-2 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-md backdrop-blur"
                role="group" aria-label={nameOf(selected)}>
                <span class="px-1 text-sm font-semibold">{nameOf(selected)}</span>
                {overlaps > 0 && (
                  <span class="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200">{texts.overlaps(overlaps)}</span>
                )}
                <span class="ml-auto flex flex-wrap gap-1.5">
                  <button type="button" class={button} onClick={() => view.current?.rotate(selected, 1)} disabled={disabled}>
                    <Icon d={icons.left} /><span class="sr-only sm:not-sr-only">{texts.rotateLeft}</span>
                  </button>
                  <button type="button" class={button} onClick={() => view.current?.rotate(selected, -1)} disabled={disabled}>
                    <Icon d={icons.right} /><span class="sr-only sm:not-sr-only">{texts.rotateRight}</span>
                  </button>
                  <button type="button" class={`${button} text-red-700`} onClick={removeSelected} disabled={disabled}>
                    <Icon d={icons.remove} /><span class="sr-only sm:not-sr-only">{texts.remove}</span>
                  </button>
                  <button type="button" class={button} onClick={() => select(null)} aria-label={texts.deselect} title={texts.deselect}>
                    <Icon d={icons.close} />
                  </button>
                </span>
              </div>
            )}
          </div>
          <p class="mt-1.5 text-xs text-slate-500">{texts.help}</p>
        </div>
      </div>
      <div class="sr-only" aria-live="polite" aria-atomic="true">{announcement.text}</div>
    </div>
  );
};
