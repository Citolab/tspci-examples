/*
 * What the pupil sees: the question, the picture with their numbered marks, the list of marks (each can be removed),
 * and after answering (status review or solution) which hazards were found, which were not, the marks on a safe spot,
 * and for every hazard why it is unsafe and what should be done.
 *
 * - Tap or click: a tap on a marker, or on a spot that has a mark, removes that mark; a tap anywhere else places one.
 *   A tap is a finger that lifts within 10 px of where it went down; a swipe scrolls the page, two fingers are a pinch.
 * - Keyboard: Tab to the picture; the arrow keys go from spot to spot in reading order (hazards and look-alikes, never
 *   saying which is which); Space or Enter marks the spot or removes its mark; Delete removes it.
 * - Screen reader: a spot is read as "Spot 3 of 12: the ladder. Not marked."; what a tap or a key did is said in a
 *   live region.
 */
import type { ComponentChildren } from "preact";
import { IStore, useStore } from "@citolab/preact-store";
import { useEffect, useRef, useState } from "preact/hooks";
import { INK, ScenePicture } from "./drawings";
import { MARKER_RADIUS, Mark, SCENE_H, SCENE_W, Spot, TapResult, badgeAt, markIsHit, placeOf, score, tap, toggle } from "./hazards";
import type { Model } from "./model";
import { Actions, StateModel } from "./store";
import { Texts, textsFor } from "./texts";

/** A finger that moves further than this (CSS px) is a swipe, not a tap. */
const TAP_SLOP = 10;
/** How far next to a spot a tap still counts as on it (CSS px): a finger is less precise than a mouse. */
const REACH = { touch: 12, pen: 6, mouse: 3 } as Record<string, number>;

/** A marker is at least this big on the screen (CSS px across), also in a narrow item: a target for a finger. */
const MIN_MARKER_PX = 26;

/** Colour-blind safe colours (Okabe-Ito), always with a sign as well. */
export const COLORS = { mark: "#0072B2", found: "#009E73", missed: "#E69F00", wrong: "#D55E00" };

export type Status = "interacting" | "review" | "solution" | "closed";

type Props = {
  model: Model;
  store: IStore<StateModel, Actions>;
  status: Status;
  title?: string;
  question?: string;
};

/** The shapes of a spot, with the given look. */
export function SpotShapes({ spot, ...look }: { spot: Spot } & Record<string, unknown>) {
  return (
    <>
      {spot.shapes.map((shape, i) =>
        "rect" in shape ? (
          <rect key={i} x={shape.rect[0]} y={shape.rect[1]} width={shape.rect[2]} height={shape.rect[3]} rx="8" {...look} />
        ) : "ellipse" in shape ? (
          <ellipse key={i} cx={shape.ellipse[0]} cy={shape.ellipse[1]} rx={shape.ellipse[2]} ry={shape.ellipse[3]} {...look} />
        ) : (
          <polygon key={i} points={shape.poly.join(" ")} {...look} />
        )
      )}
    </>
  );
}

/** A check mark, a cross or an exclamation mark, centred on (x, y). */
export const Sign = ({ kind, x, y, size = 1, color = "#fff" }: { kind: "found" | "wrong" | "missed"; x: number; y: number; size?: number; color?: string }) =>
  kind === "found" ? (
    <path d={`M${x - 7 * size} ${y} l${5 * size} ${5.5 * size} l${9 * size} ${-11 * size}`} fill="none" stroke={color} stroke-width={3.5 * size} stroke-linecap="round" stroke-linejoin="round" />
  ) : kind === "wrong" ? (
    <path d={`M${x - 6 * size} ${y - 6 * size} l${12 * size} ${12 * size} M${x + 6 * size} ${y - 6 * size} l${-12 * size} ${12 * size}`} fill="none" stroke={color} stroke-width={3.5 * size} stroke-linecap="round" />
  ) : (
    <path d={`M${x} ${y - 8 * size} v${10 * size} M${x} ${y + 7 * size} v0.5`} fill="none" stroke={color} stroke-width={3.5 * size} stroke-linecap="round" />
  );

/** A small icon of a sign, for the legend and the lists. */
export const SignIcon = ({ kind }: { kind: "found" | "wrong" | "missed" }) => (
  <svg viewBox="-12 -12 24 24" className="inline-block h-6 w-6 shrink-0 align-middle" aria-hidden="true">
    {kind === "missed" ? <rect x="-11" y="-11" width="22" height="22" rx="5" fill={COLORS.missed} /> : <circle r="11" fill={kind === "found" ? COLORS.found : COLORS.wrong} />}
    <Sign kind={kind} x={0} y={0} size={0.8} color={kind === "missed" ? INK : "#fff"} />
  </svg>
);

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const Interaction = ({ model, store, status, title, question }: Props) => {
  const { marks } = useStore(store);
  const t = textsFor(model.language);
  const readOnly = status !== "interacting";
  const feedback = status === "review" || status === "solution";
  const svgRef = useRef<SVGSVGElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  // where the keyboard is: in a ref too, for keys that come faster than a render
  const [cursor, setCursor] = useState<number | null>(null);
  const cursorRef = useRef<number | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const pointers = useRef(new Set<number>());
  const tapStart = useRef<{ id: number; x: number; y: number } | null>(null);

  // scene units per CSS pixel: a narrow item gets bigger markers (in scene units), so they stay easy to tap
  const [unitsPerPx, setUnitsPerPx] = useState(800 / 900);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const width = svg.getBoundingClientRect().width;
      if (width > 0) setUnitsPerPx(SCENE_W / width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);
  const markerRadius = Math.max(MARKER_RADIUS, (MIN_MARKER_PX / 2) * unitsPerPx);

  const labelOf = (mark: Mark) => (mark.on && model.info[mark.on] ? model.info[mark.on].label : t.somewhere(...placeOf(mark.x, mark.y)));

  const apply = (result: TapResult) => {
    if (result.kind === "full") {
      setNotice(t.full(model.limit));
      setMessage(t.full(model.limit));
      return;
    }
    setNotice("");
    if (result.kind === "add") {
      store.dispatch({ type: "ADD_MARK", payload: { mark: result.mark } });
      setMessage(t.placed(store.getState().marks.length, labelOf(result.mark)));
    } else {
      const removed = store.getState().marks[result.index];
      store.dispatch({ type: "REMOVE_MARK", payload: { index: result.index } });
      setMessage(t.removed(labelOf(removed)));
    }
  };

  // ---- pointer: taps ----

  const onPointerDown = (e: PointerEvent) => {
    if (readOnly || (e.pointerType === "mouse" && e.button !== 0)) return;
    pointers.current.add(e.pointerId);
    setKeyboard(false);
    // a second finger makes it a pinch: no tap
    tapStart.current = pointers.current.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
  };

  const onPointerUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const start = tapStart.current;
    if (!start || start.id !== e.pointerId) return;
    tapStart.current = null;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP) return;
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return;
    const at = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const unit = 1 / (ctm.a || 1); // scene units per CSS pixel
    const reach = REACH[e.pointerType] ?? REACH.mouse;
    apply(tap(store.getState().marks, model.spots, at.x, at.y, { limit: model.limit, tolerance: reach * unit, radius: Math.max(MARKER_RADIUS, (MIN_MARKER_PX / 2) * unit) + reach * unit }));
  };

  const forget = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (tapStart.current?.id === e.pointerId) tapStart.current = null;
  };

  // ---- keyboard: from spot to spot ----

  const describe = (index: number) => {
    const spot = model.order[index];
    const markIndex = store.getState().marks.findIndex((mark) => mark.on === spot.id);
    return `${t.spot(index + 1, model.order.length, model.info[spot.id].label)} ${markIndex >= 0 ? t.markedAs(markIndex + 1) : t.notMarked}`;
  };

  const goTo = (index: number) => {
    cursorRef.current = index;
    setCursor(index);
    setKeyboard(true);
    setMessage(describe(index));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (readOnly || !model.order.length) return;
    const n = model.order.length;
    const here = cursorRef.current ?? 0;
    // before the first key: forward is the first spot, back the last
    const [next, previous] = cursorRef.current === null ? [0, n - 1] : [here + 1, here - 1];
    const go: Record<string, number> = { ArrowRight: next, ArrowDown: next, ArrowLeft: previous, ArrowUp: previous, Home: 0, End: n - 1 };
    if (e.key in go) {
      e.preventDefault();
      goTo((go[e.key] + n) % n);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      cursorRef.current = here;
      setCursor(here);
      setKeyboard(true);
      apply(toggle(store.getState().marks, model.order[here], model.limit));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      const index = store.getState().marks.findIndex((mark) => mark.on === model.order[here].id);
      if (index < 0) return;
      e.preventDefault();
      apply({ kind: "remove", index });
    }
  };

  const onFocus = () => {
    const visible = svgRef.current?.matches(":focus-visible") ?? true;
    if (!visible) return; // a click or a tap: no cursor
    goTo(cursorRef.current ?? 0);
  };

  /** Remove a mark with its button; the focus goes to the next button, or back to the picture when none is left. */
  const removeWith = (index: number) => {
    apply({ kind: "remove", index });
    setTimeout(() => {
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-remove]") ?? [];
      (buttons[index] ?? buttons[index - 1] ?? svgRef.current)?.focus();
    });
  };

  const { found, foundCount, total, wrong } = score(marks, model.spots);
  const cursorSpot = keyboard && cursor !== null && !readOnly ? model.order[cursor] : null;
  const instruction = question?.trim() || t.instruction(model.limit);

  return (
    <div className="font-sans text-ink">
      {title?.trim() && <h2 className="text-[1.5em] leading-tight font-bold">{title}</h2>}
      <p className="mt-2 text-[1.125em] leading-relaxed">{instruction}</p>
      {model.penalty && <p className="mt-1 font-semibold">{t.penalty}</p>}

      <div className="scene-frame mt-3">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}
          className={`scene ${readOnly ? "" : "cursor-crosshair"}`}
          data-testid="scene"
          role={readOnly ? "img" : "application"}
          tabindex={readOnly ? undefined : 0}
          aria-label={t.pictureLabel(model.sceneName)}
          aria-describedby={readOnly ? undefined : "help keyboard-help"}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={forget}
          onPointerLeave={forget}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={() => setKeyboard(false)}
        >
          <ScenePicture scene={model.scene} unsafe={model.unsafe} t={t.picture} />
          {cursorSpot && (
            <g pointer-events="none" data-testid="cursor" data-spot={cursorSpot.id}>
              <SpotShapes spot={cursorSpot} fill="none" stroke="#fff" stroke-width="8" />
              <SpotShapes spot={cursorSpot} fill="none" stroke={INK} stroke-width="3.5" stroke-dasharray="10 6" />
            </g>
          )}
          {feedback && <HazardOverlay model={model} found={found} />}
          {marks.map((mark, i) => (
            <Marker key={`${i}-${mark.x}-${mark.y}`} mark={mark} n={i + 1} r={markerRadius} kind={feedback ? (markIsHit(mark, model.spots) ? "found" : "wrong") : null} />
          ))}
        </svg>
      </div>

      {feedback ? (
        <Review model={model} marks={marks} found={found} foundCount={foundCount} total={total} wrong={wrong} solution={status === "solution"} t={t} />
      ) : (
        <div className="mt-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h3 className="text-[1em] font-bold">{t.yourMarks}</h3>
            <span className="text-slate-600" data-testid="count">{t.count(marks.length, model.limit)}</span>
            {notice && <span className="font-semibold text-[#a14400]" data-testid="notice">{notice}</span>}
          </div>
          {cursorSpot && (
            <p className="mt-1 text-slate-700" data-testid="cursor-text">
              {describe(cursor!)}
            </p>
          )}
          {marks.length === 0 ? (
            <p className="mt-1 text-slate-600">{t.noMarks}</p>
          ) : (
            <ol ref={listRef} className="mt-2 flex flex-col gap-1.5" data-testid="marks">
              {marks.map((mark, i) => (
                <li key={`${i}-${mark.x}-${mark.y}`} className="flex items-center gap-2">
                  <span className="mark-badge" aria-hidden="true">{i + 1}</span>
                  <span className="min-w-0 flex-1">{capitalize(labelOf(mark))}</span>
                  {!readOnly && (
                    <button type="button" data-remove="" className="remove-button" aria-label={t.removeMark(i + 1, labelOf(mark))} onClick={() => removeWith(i)}>
                      {t.remove}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
          {!readOnly && (
            <>
              <p id="help" className="mt-3 text-sm text-slate-600">{t.howTo}</p>
              <p id="keyboard-help" className="text-sm text-slate-600">{t.keyboard}</p>
            </>
          )}
        </div>
      )}
      <p className="sr-only" aria-live="polite" data-testid="live">{message}</p>
    </div>
  );
};

/** A numbered marker where the pupil tapped; after answering a check mark (on a hazard) or a cross (on a safe spot). */
function Marker({ mark, n, kind, r = MARKER_RADIUS }: { mark: Mark; n: number; kind: "found" | "wrong" | null; r?: number }) {
  const k = r / MARKER_RADIUS;
  const fill = kind === "found" ? COLORS.found : kind === "wrong" ? COLORS.wrong : COLORS.mark;
  return (
    <g pointer-events="none" data-testid="marker" data-kind={kind ?? "mark"} data-on={mark.on ?? ""}>
      <circle cx={mark.x} cy={mark.y} r={r + 2 * k} fill={INK} />
      <circle cx={mark.x} cy={mark.y} r={r} fill={fill} stroke="#fff" stroke-width={3 * k} />
      {kind ? (
        <Sign kind={kind} x={mark.x} y={mark.y} size={k} />
      ) : (
        <text x={mark.x} y={mark.y + 6.5 * k} text-anchor="middle" font-size={19 * k} font-weight="700" fill="#fff" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif">
          {n}
        </text>
      )}
    </g>
  );
}

/** After answering: every hazard that counts outlined, with its number: solid when found, dashed when not. */
function HazardOverlay({ model, found }: { model: Model; found: boolean[] }) {
  return (
    <g pointer-events="none" data-testid="hazards">
      {model.counted.map((spot, i) => {
        const color = found[i] ? COLORS.found : COLORS.missed;
        const [bx, by] = badgeAt(spot);
        const badge = { x: bx, y: by };
        return (
          <g key={spot.id} data-testid="hazard" data-spot={spot.id} data-found={found[i]}>
            <SpotShapes spot={spot} fill="none" stroke="#fff" stroke-width="7" />
            <SpotShapes spot={spot} fill="none" stroke={color} stroke-width="4" stroke-dasharray={found[i] ? undefined : "12 7"} />
            <rect x={badge.x - 15} y={badge.y - 15} width="30" height="30" rx="6" fill={color} stroke={INK} stroke-width="2" />
            <text x={badge.x} y={badge.y + 6} text-anchor="middle" font-size="17" font-weight="700" fill={found[i] ? "#fff" : INK} font-family="system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif">
              {i + 1}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** After answering: a summary, a legend, every hazard with why it is unsafe, and the marks on a safe spot. */
function Review({ model, marks, found, foundCount, total, wrong, solution, t }: {
  model: Model;
  marks: Mark[];
  found: boolean[];
  foundCount: number;
  total: number;
  wrong: number;
  solution: boolean;
  t: Texts;
}) {
  const wrongMarks = marks.filter((mark) => !markIsHit(mark, model.spots));
  const Legend = ({ kind, children }: { kind: "found" | "wrong" | "missed"; children: ComponentChildren }) => (
    <span className="inline-flex items-center gap-1.5">
      <SignIcon kind={kind} />
      {children}
    </span>
  );
  return (
    <div className="mt-3" data-testid="review">
      <p className="font-semibold" data-testid="summary">
        {solution ? t.solution(total) : `${t.summary(foundCount, total)}${wrong ? ` ${t.summaryWrong(wrong)}` : ""}`}
      </p>
      {!solution && (
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
          <Legend kind="found">{t.legendFound}</Legend>
          <Legend kind="missed">{t.legendMissed}</Legend>
          <Legend kind="wrong">{t.legendWrong}</Legend>
        </p>
      )}
      {!solution && <h3 className="mt-3 text-[1em] font-bold">{t.hazards}</h3>}
      <ol className="mt-1 flex flex-col gap-2">
        {model.counted.map((spot, i) => (
          <li key={spot.id} className="flex gap-2.5" data-testid="hazard-item" data-found={found[i]}>
            <span className={`hazard-badge ${found[i] ? "is-found" : "is-missed"}`} aria-hidden="true">{i + 1}</span>
            <div className="min-w-0">
              <p className="flex min-h-7 flex-wrap items-center gap-x-2">
                <span className="sr-only">{t.hazardNumber(i + 1)}: </span>
                <strong>{model.info[spot.id].name}</strong>
                {!solution && (
                  <span className="inline-flex items-center gap-1 text-sm">
                    <SignIcon kind={found[i] ? "found" : "missed"} />
                    {found[i] ? t.found : t.missed}
                  </span>
                )}
              </p>
              {model.info[spot.id].why && <p className="text-slate-700">{model.info[spot.id].why}</p>}
            </div>
          </li>
        ))}
      </ol>
      {wrongMarks.length > 0 && (
        <>
          <h3 className="mt-3 text-[1em] font-bold">{t.safeMarks}</h3>
          <ul className="mt-1 flex flex-col gap-2">
            {wrongMarks.map((mark, i) => {
              const info = mark.on ? model.info[mark.on] : undefined;
              return (
                <li key={i} className="flex gap-2.5" data-testid="wrong-item">
                  <SignIcon kind="wrong" />
                  <div className="min-w-0">
                    <p className="flex min-h-6 items-center">
                      <strong>{capitalize(info ? info.label : t.somewhere(...placeOf(mark.x, mark.y)))}</strong>
                    </p>
                    <p className="text-slate-700">{info?.safe ? `${t.safeHere} ${info.safe}` : t.nothingHere}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

export default Interaction;
