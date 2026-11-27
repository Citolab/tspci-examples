/*
 * A measuring tool on screen: its drawing, a slider for the amount (the arrow keys, Page Up/Down, Home/End, a drag
 * with a finger or a mouse) and large − and + buttons. A jug and a cup can also be filled by dragging (or tapping) on
 * the drawing. What the tool shows is the slider's aria-valuetext, and is said again after a button (a live region).
 */
import type { ComponentChildren, JSX } from "preact";
import { useRef, useState } from "preact/hooks";
import { ToolSpec, clean, snap } from "./kitchen";
import { CUP, Cup, JUG, Jug, levelAt } from "./drawings";

export type Step = { delta: number; text: string; label: string };

type PanelProps = {
  uid: string;
  heading: string;
  /** What the pupil wrote for this amount, as a line under the heading ("In your recipe: 375 g"). */
  note?: ComponentChildren;
  spec: ToolSpec;
  value: number;
  /** The tool's reading for a screen reader (and as text in review): "The scale shows 375 g". */
  describe: (value: number) => string;
  sliderLabel: string;
  /** The buttons: small and large steps down and up. */
  less: Step[];
  more: Step[];
  readOnly: boolean;
  /** Show the reading as text under the drawing (spoons, pieces; every tool in review). */
  showReading?: boolean;
  onChange: (value: number) => void;
  drawing: ComponentChildren;
  /** More buttons after − and + (the tare button, pour into the bucket). */
  extra?: ComponentChildren;
  /** Something to say after an extra button. */
  said?: string;
  testid?: string;
};

/** Key → new value of a slider, or null for a key it does not use. */
export function keyValue(spec: ToolSpec, value: number, key: string): number | null {
  const steps: Record<string, number> = { ArrowRight: spec.step, ArrowUp: spec.step, ArrowLeft: -spec.step, ArrowDown: -spec.step, PageUp: spec.big, PageDown: -spec.big };
  if (key === "Home") return 0;
  if (key === "End") return spec.max;
  if (steps[key] === undefined) return null;
  return snap(spec, value + steps[key]);
}

/**
 * A button that disables itself (− at 0, + at the top) would drop the focus: it goes to the first button of the other
 * side, after the key event.
 */
function keepFocus(button: HTMLElement, other: string) {
  setTimeout(() => {
    if (!(button as HTMLButtonElement).disabled) return;
    const root = button.getRootNode() as ShadowRoot | Document;
    if (root.activeElement && root.activeElement !== button && root.activeElement !== document.body) return;
    button.closest("[data-tool]")?.querySelector<HTMLElement>(`${other}:not([disabled])`)?.focus();
  }, 0);
}

export function ToolPanel(p: PanelProps) {
  const [said, setSaid] = useState("");
  // the value as last set: keys repeat (or are pressed) faster than the PCI renders
  const latest = useRef(p.value);
  const shown = useRef(p.value);
  if (shown.current !== p.value) latest.current = shown.current = p.value;
  const set = (value: number) => {
    const next = snap(p.spec, value);
    if (next === latest.current) return;
    latest.current = next;
    p.onChange(next);
  };
  const press = (delta: number, e: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
    const next = snap(p.spec, latest.current + delta);
    set(next);
    setSaid(p.describe(next));
    keepFocus(e.currentTarget, delta < 0 ? "[data-more]" : "[data-less]");
  };
  const reading = p.describe(p.value);
  const button = (step: Step, kind: "less" | "more") => (
    <button
      type="button"
      key={`${kind}${step.delta}`}
      class="tool-button"
      data-less={kind === "less" ? "" : undefined}
      data-more={kind === "more" ? "" : undefined}
      data-step={step.delta}
      aria-label={step.label}
      title={step.label}
      disabled={kind === "less" ? p.value <= 0 : p.value >= p.spec.max}
      onClick={(e) => press(step.delta, e)}
    >
      {step.text}
    </button>
  );
  return (
    <section class="tool-card" aria-labelledby={`${p.uid}-h`} data-tool={p.spec.tool} data-testid={p.testid}>
      <h4 id={`${p.uid}-h`} class="text-[1.05em] font-bold">
        {p.heading}
      </h4>
      {p.note && <p class="mt-0.5 text-[0.95em] text-muted">{p.note}</p>}
      <div class="mt-2 flex flex-1 flex-col items-center justify-end">{p.drawing}</div>
      {(p.showReading || p.readOnly) && (
        <p class="mt-1 text-center font-semibold" data-reading>
          {reading}
        </p>
      )}
      {!p.readOnly && (
        <div class="mt-2 flex flex-col gap-2">
          <input
            type="range"
            class="tool-slider"
            min={0}
            max={p.spec.max}
            step={p.spec.step}
            value={p.value}
            aria-label={p.sliderLabel}
            aria-valuetext={reading}
            data-slider
            onInput={(e) => set(Number(e.currentTarget.value))}
            onKeyDown={(e) => {
              const next = keyValue(p.spec, latest.current, e.key);
              if (next === null) return;
              e.preventDefault();
              set(next);
            }}
          />
          <div class="flex flex-wrap items-center justify-center gap-2">
            {p.less.map((step) => button(step, "less"))}
            {p.more.map((step) => button(step, "more"))}
            {p.extra}
          </div>
        </div>
      )}
      <p class="sr-only" aria-live="polite" data-said>
        {p.said || said}
      </p>
    </section>
  );
}

/**
 * The drawing of a jug or a cup in its SVG, which a drag (or a tap) fills to where the pointer is. While dragging only
 * the drawing changes; the level is set when the pointer lifts.
 */
export function BeakerDrawing(props: { kind: "jug" | "cup"; level: number; spec: ToolSpec; color: string; uid: string; readOnly: boolean; onChange: (level: number) => void }) {
  const { kind, spec, readOnly } = props;
  const b = kind === "jug" ? JUG : CUP;
  const [w, h] = kind === "jug" ? [240, 292] : [176, 200];
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? props.level;
  const at = (e: PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const y = ((e.clientY - r.top) * h) / r.height;
    return snap(spec, levelAt(b, y, spec.max));
  };
  const down = (e: PointerEvent) => {
    if (readOnly || e.button !== 0) return;
    e.preventDefault();
    try {
      svg.current?.setPointerCapture(e.pointerId);
    } catch {
      // a synthetic pointer: the moves still arrive on the drawing
    }
    dragging.current = at(e);
    setDrag(dragging.current);
  };
  const move = (e: PointerEvent) => {
    if (dragging.current === null) return;
    dragging.current = at(e);
    setDrag(dragging.current);
  };
  const up = () => {
    if (dragging.current === null) return;
    const level = clean(dragging.current);
    dragging.current = null;
    setDrag(null);
    if (level !== props.level) props.onChange(level);
  };
  const cancel = () => {
    dragging.current = null;
    setDrag(null);
  };
  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${w} ${h}`}
      class={`block h-auto w-full ${readOnly ? "" : "cursor-ns-resize touch-none"}`}
      style={{ maxWidth: `${w}px` }}
      aria-hidden="true"
      data-beaker={kind}
      onPointerDown={(e) => down(e as unknown as PointerEvent)}
      onPointerMove={(e) => move(e as unknown as PointerEvent)}
      onPointerUp={up}
      onPointerCancel={cancel}
      onLostPointerCapture={up}
    >
      {kind === "jug" ? <Jug level={shown} spec={spec} color={props.color} uid={props.uid} /> : <Cup level={shown} spec={spec} color={props.color} />}
    </svg>
  );
}
