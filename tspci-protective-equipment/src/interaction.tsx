import type { PciProperties } from "@citolab/tspci";
import { useRef, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import configProps from "./config.json";
import { HazardId, ItemId, Job, WORKERS, WorkerId, ZONES, itemOf, itemsOfZone, jobProblems, reasonOptions, workerSetting } from "./equipment";
import { FIGURE_BOX, ItemIcon, ItemShape, LAYER, Sign, Worker, WorkerFace, ZONE_BOXES } from "./drawings";
import { Actions, StateModel } from "./store";
import { Texts, jobText, problemText, textsFor } from "./texts";

type PropTypes = PciProperties<typeof configProps>;

type Props = {
  config: PropTypes;
  job: Job;
  store: IStore<StateModel, Actions>;
  readOnly: boolean; // review, solution, closed: show the answer, but do not change it
};

/** An item being dragged: from the rack onto the worker, or from the worker off it. */
type Drag = { id: ItemId; from: "rack" | "worker"; pointerId: number; startX: number; startY: number; x: number; y: number; moving: boolean; over: boolean };
/** How far a finger or the mouse moves before a press becomes a drag: a real finger moves a little in a tap. */
const DRAG_THRESHOLD = 10;

/** Soft hyphens in the long Dutch words, so a name breaks inside a tile of the rack (the accessible name has none). */
const hyphenate = (name: string) =>
  name.replace(/^(Veiligheids|Valbeveiligings|Chemicaliën|Werk|Gehoor|Koude|Snij|Gelaats|Rubber|Stof)(?=\S{4})/, "$1­").replace(/(hand)(schoenen)/, "$1­$2");

/**
 * The job on a card, the worker and the rack of protective equipment. An item goes on by dragging it onto the worker
 * (it snaps to its place: head, eyes, ears, face, hands, feet, body, fall arrest), by a tap or a click, or with Enter or
 * Space on its button in the rack; it comes off the same way, by dragging it off the worker or a tap on it there. With
 * explain, the pupil chooses for each item worn what it protects against. Read-only: the worker and a list of what is
 * worn, without the rack.
 */
const Interaction = ({ config, job, store, readOnly }: Props) => {
  const state = useStore(store); // re-renders when the store changes
  const t = textsFor(config.language);
  const explain = config.explain === "true";
  const fixedWorker = workerSetting(config.worker);
  const worker: WorkerId = fixedWorker === "choice" ? state.worker : fixedWorker;
  const problems = jobProblems(job, explain, config);
  const worn = state.worn;
  const wearing = t.wearing(worn.map((id) => t.itemsLower[id]));

  const toggle = (id: ItemId) => !readOnly && store.dispatch({ type: "TOGGLE", payload: { id } });

  // ---- dragging: pointer events on the whole PCI, captured once the press has become a drag ----
  const rootRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** After a drag, the click that may follow is not a click on the item. */
  const afterDrag = useRef(false);

  const overFigure = (x: number, y: number) => {
    const box = figureRef.current?.getBoundingClientRect();
    return !!box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  };
  const cancel = () => {
    if (dragRef.current?.moving) {
      afterDrag.current = true;
      setTimeout(() => (afterDrag.current = false), 0);
    }
    dragRef.current = null;
    setDrag(null);
  };
  const press = (e: PointerEvent, id: ItemId, from: Drag["from"]) => {
    if (readOnly || e.button !== 0) return;
    // a second finger: a pinch, never a drag or a tap
    if (dragRef.current && dragRef.current.pointerId !== e.pointerId) return cancel();
    dragRef.current = { id, from, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, moving: false, over: from === "worker" };
  };
  const move = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.moving) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
      d.moving = true;
      try {
        rootRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // a synthetic event without an active pointer: the events still bubble to the root
      }
    }
    e.preventDefault();
    const next = { ...d, x: e.clientX, y: e.clientY, over: overFigure(e.clientX, e.clientY) };
    dragRef.current = next;
    setDrag(next);
  };
  const drop = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    dragRef.current = null;
    if (!d.moving) return; // a tap or a click: the onClick does it
    setDrag(null);
    afterDrag.current = true;
    setTimeout(() => (afterDrag.current = false), 0);
    const over = overFigure(e.clientX, e.clientY);
    if (d.from === "rack" && over) store.dispatch({ type: "PUT_ON", payload: { id: d.id } });
    if (d.from === "worker" && !over) store.dispatch({ type: "TAKE_OFF", payload: { id: d.id } });
  };
  const click = (action: () => void) => () => {
    if (afterDrag.current) return;
    action();
  };

  const dragging = drag?.moving ? drag : null;
  const highlight = dragging?.from === "rack" ? itemOf(dragging.id).zone : null;

  return (
    <div
      ref={rootRef}
      lang={config.language === "nl" ? "nl" : "en"}
      className="pbm font-sans text-ink select-none"
      onPointerMove={(e) => move(e as unknown as PointerEvent)}
      onPointerUp={(e) => drop(e as unknown as PointerEvent)}
      onPointerCancel={cancel}
    >
      {config.title && <h2 className="text-[1.4em] leading-tight font-extrabold">{config.title}</h2>}

      {problems.length > 0 && (
        <p role="alert" className="mt-3 rounded-lg border-2 border-amber-500 bg-amber-50 px-3 py-2 text-amber-900">
          {problems.map((p) => problemText(p, t)).join(" ")}
        </p>
      )}

      <div className="job-card mt-2" data-job={job.preset}>
        <span className="job-label">{t.job}</span>
        <p className="text-[1.1em] leading-snug font-semibold" data-job-text>
          {jobText(job, t)}
        </p>
      </div>
      <p className="mt-2 leading-relaxed">{config.question || t.instruction}</p>

      <div className="layout mt-3">
        <section className="worker-panel" aria-label={t.worker}>
          {fixedWorker === "choice" && !readOnly && <WorkerChoice worker={worker} t={t} onChoose={(w) => store.dispatch({ type: "SET_WORKER", payload: { worker: w } })} />}
          <svg
            ref={figureRef}
            className={`figure ${worn.length && !readOnly ? "touch-none" : ""} ${dragging?.from === "rack" && dragging.over ? "figure-over" : ""}`}
            viewBox={FIGURE_BOX}
            role="img"
            aria-label={wearing}
            data-figure
          >
            <rect x="2" y="2" width="236" height="406" rx="18" className="figure-back" />
            <Worker worker={worker} showFeet={!worn.some((id) => itemOf(id).zone === "feet")} />
            {LAYER.filter((id) => worn.includes(id)).map((id) => (
              <g
                key={id}
                className={`worn-item ${readOnly ? "" : "cursor-pointer"} ${dragging?.id === id && dragging.from === "worker" ? "opacity-40" : ""}`}
                data-worn={id}
                onPointerDown={(e) => press(e as unknown as PointerEvent, id, "worker")}
                onClick={click(() => !readOnly && store.dispatch({ type: "TAKE_OFF", payload: { id } }))}
              >
                <ItemShape id={id} />
              </g>
            ))}
            {highlight &&
              ZONE_BOXES[highlight].map(([x, y, w, h], i) => (
                <rect key={i} x={x} y={y} width={w} height={h} rx="8" className={`zone-box ${dragging?.over ? "zone-box-over" : ""}`} data-zone={highlight} />
              ))}
          </svg>
          {worn.length > 0 && !readOnly && <p className="mt-1 text-center text-[0.85em] text-slate-600">{t.takeOffHint}</p>}
          {/* what the worker wears, for a screen reader: said again after every change */}
          <p className="sr-only" aria-live="polite" data-describe>
            {wearing}
          </p>
        </section>

        {readOnly ? (
          <WornList worn={worn} t={t} />
        ) : (
          <section className="rack" aria-label={t.rack}>
            <h3 className="sr-only">{t.rack}</h3>
            {ZONES.map((zone) => (
              <div key={zone} className="zone" data-rack-zone={zone}>
                <h4 className="zone-name">{t.zones[zone]}</h4>
                <ul className="flex flex-wrap gap-1.5">
                  {itemsOfZone(zone).map((id) => {
                    const on = worn.includes(id);
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          className={`rack-item ${on ? "rack-item-on" : ""}`}
                          aria-pressed={on}
                          aria-label={t.items[id]}
                          data-item={id}
                          onPointerDown={(e) => press(e as unknown as PointerEvent, id, "rack")}
                          onClick={click(() => toggle(id))}
                        >
                          <span className="flex items-start gap-0.5">
                            <span className="rack-pic touch-none">
                              <ItemIcon id={id} size={52} />
                            </span>
                            <Sign id={id} size={28} className="rack-sign" />
                          </span>
                          {on && (
                            <span className="rack-check" aria-hidden="true">
                              ✓
                            </span>
                          )}
                          <span className="rack-name">{hyphenate(t.items[id])}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        )}
      </div>

      {explain && worn.length > 0 && <Why state={state} store={store} t={t} readOnly={readOnly} />}

      {/* the item under the pointer while dragging */}
      {dragging && (
        <div className="drag-ghost" style={{ left: `${dragging.x}px`, top: `${dragging.y}px` }} aria-hidden="true">
          <ItemIcon id={dragging.id} size={64} />
        </div>
      )}
    </div>
  );
};

/** The choice of the worker: three faces, a radio group (arrow keys, Home, End). */
function WorkerChoice({ worker, t, onChoose }: { worker: WorkerId; t: Texts; onChoose: (worker: WorkerId) => void }) {
  const onKeyDown = (e: KeyboardEvent) => {
    const index = WORKERS.indexOf(worker);
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? WORKERS[(index + 1) % WORKERS.length]
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? WORKERS[(index + WORKERS.length - 1) % WORKERS.length]
          : e.key === "Home"
            ? WORKERS[0]
            : e.key === "End"
              ? WORKERS[WORKERS.length - 1]
              : null;
    if (next === null) return;
    e.preventDefault();
    onChoose(next);
    const group = e.currentTarget as HTMLElement;
    setTimeout(() => group.querySelector<HTMLElement>(`[data-worker-choice="${next}"]`)?.focus(), 0);
  };
  return (
    <div role="radiogroup" aria-label={t.chooseWorker} className="mb-2 flex items-center justify-center gap-2" onKeyDown={(e) => onKeyDown(e as unknown as KeyboardEvent)}>
      <span className="text-[0.85em] font-semibold text-slate-600" aria-hidden="true">
        {t.chooseWorker}
      </span>
      {WORKERS.map((w) => (
        <button
          key={w}
          type="button"
          role="radio"
          aria-checked={w === worker}
          aria-label={t.workerName(w)}
          tabIndex={w === worker ? 0 : -1}
          data-worker-choice={w}
          className={`worker-choice ${w === worker ? "worker-choice-on" : ""}`}
          onClick={() => onChoose(w)}
        >
          <WorkerFace worker={w} size={36} />
        </button>
      ))}
    </div>
  );
}

/** Read-only: what the worker wears, as a list with the signs. */
function WornList({ worn, t }: { worn: ItemId[]; t: Texts }) {
  return (
    <section className="worn-list" aria-label={t.wornList}>
      <h3 className="zone-name">{t.wornList}</h3>
      {worn.length === 0 ? (
        <p className="text-slate-600">{t.nothingWorn}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {worn.map((id) => (
            <li key={id} className="flex items-center gap-2" data-worn-item={id}>
              <Sign id={id} size={32} />
              <span>{t.items[id]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Explain: for each item worn, what it protects against (a short choice list). */
function Why({ state, store, t, readOnly }: { state: StateModel; store: IStore<StateModel, Actions>; t: Texts; readOnly: boolean }) {
  return (
    <section className="why mt-4" aria-labelledby="why-heading" data-why>
      <h3 id="why-heading" className="text-[1.1em] font-bold">
        {t.why}
      </h3>
      <p className="text-[0.95em] text-slate-700">{t.whyIntro}</p>
      <ul className="mt-2 grid gap-2">
        {state.worn.map((id) => (
          <li key={id} className="why-row" data-why-item={id}>
            <Sign id={id} size={34} />
            <label htmlFor={`why-${id}`} className="font-semibold">
              {t.whyFor(t.itemsLower[id])}
            </label>
            <select
              id={`why-${id}`}
              className="why-select"
              value={state.reasons[id] ?? ""}
              disabled={readOnly}
              onChange={(e) => store.dispatch({ type: "SET_REASON", payload: { id, reason: e.currentTarget.value as HazardId | "" } })}
            >
              <option value="">{t.choose}</option>
              {reasonOptions(id).map((hazard) => (
                <option key={hazard} value={hazard}>
                  {t.hazards[hazard]}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default Interaction;
