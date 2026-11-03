// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/textgapmatch, © OpenPCI (Aarhus University and Aalborg
// University: Elias J.T. Hansen, Anna Rusmann, Jeppe Bundsgaard)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useRef, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import { Actions, StateModel } from "./store";
import { Rules, Source, Target, Zone, accepts, inList } from "./model";
import { Texts } from "./texts";

// The candidate drags labels onto zones on an image. Every label is a button: drag it (mouse, pen or touch, with
// pointer events), or press it to pick it up and then press a zone (the keyboard way, also a tap-tap on a phone).
// Dropped anywhere but a zone, a label goes back to the list. A label dropped onto a label in another zone changes
// places with it, as in the original.

type Drag = { from: Source; text: string; x: number; y: number; dx: number; dy: number; target: Target | null };

const DRAG_THRESHOLD = 5;

const Interaction = ({ labels, zones, image, rules, numbering, droppedStyle, store, texts: t }: {
  labels: string[];
  zones: Zone[];
  image: { src: string; alt: string };
  rules: Rules;
  numbering: boolean;
  droppedStyle: Record<string, string>;
  store: IStore<StateModel, Actions>;
  texts: Texts;
}) => {
  const { placed } = useStore(store);
  const [picked, setPicked] = useState<Source | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [message, setMessage] = useState("");
  const pointer = useRef<{ id: number; from: Source; startX: number; startY: number; dragging: boolean; el: HTMLElement } | null>(null);
  const suppressClick = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  const zoneNumber = (id: string) => zones.findIndex((z) => z.id === id) + 1;
  const same = (a: Source | null, b: Source) => !!a && a.label === b.label && a.zone === b.zone;

  const doMove = (from: Source, to: Target) => {
    const before = store.getState().placed;
    store.dispatch({ type: "MOVE", payload: { from, to } });
    const changed = store.getState().placed !== before;
    const text = labels[from.label];
    if (to.zone === null) setMessage(changed ? t.returned(text) : "");
    else setMessage(changed ? t.dropped(text, zoneNumber(to.zone)) : t.notAllowed(text, zoneNumber(to.zone)));
    setPicked(null);
    return changed;
  };

  /** What lies under the pointer: a zone (and where in it), or nothing (the list). */
  const targetAt = (el: HTMLElement, x: number, y: number, from: Source): Target => {
    const root = el.getRootNode() as ParentNode;
    const zoneEls = Array.from(root.querySelectorAll<HTMLElement>("[data-dropzone]")).reverse();
    const zoneEl = zoneEls.find((z) => {
      const r = z.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
    if (!zoneEl) {
      // the label lying under the pointer can stick out of its zone
      const labelEl = Array.from(root.querySelectorAll<HTMLElement>("[data-placed]")).find((l) => {
        const r = l.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      });
      if (!labelEl) return { zone: null };
      return targetIn(labelEl.closest<HTMLElement>("[data-dropzone]"), x, y, from);
    }
    return targetIn(zoneEl, x, y, from);
  };

  const targetIn = (zoneEl: HTMLElement | null, x: number, y: number, from: Source): Target => {
    if (!zoneEl) return { zone: null };
    const zone = zoneEl.dataset.dropzone;
    const items = Array.from(zoneEl.querySelectorAll<HTMLElement>("[data-placed]"));
    const onto = items.find((l) => {
      const r = l.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
    if (onto && from.zone !== null && from.zone !== zone) return { zone, onto: Number(onto.dataset.label) };
    // before the first label whose middle lies right of the pointer, on or below its line (as the original)
    let index = items.findIndex((l) => {
      const r = l.getBoundingClientRect();
      return y < r.bottom && (y < r.top || x < r.left + r.width / 2);
    });
    if (index < 0) index = items.length;
    return { zone, index };
  };

  const onPointerDown = (from: Source) => (e: PointerEvent) => {
    suppressClick.current = false;
    if (e.button !== 0 || pointer.current) return;
    const el = e.currentTarget as HTMLElement;
    pointer.current = { id: e.pointerId, from, startX: e.clientX, startY: e.clientY, dragging: false, el };
    el.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    const p = pointer.current;
    if (!p || p.id !== e.pointerId) return;
    if (!p.dragging) {
      if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < DRAG_THRESHOLD) return;
      p.dragging = true;
      setPicked(null);
    }
    e.preventDefault();
    const r = p.el.getBoundingClientRect();
    setDrag((d) => ({
      from: p.from,
      text: labels[p.from.label],
      x: e.clientX,
      y: e.clientY,
      dx: d ? d.dx : p.startX - r.left,
      dy: d ? d.dy : p.startY - r.top,
      target: targetAt(p.el, e.clientX, e.clientY, p.from),
    }));
  };

  const endPointer = (e: PointerEvent, cancelled: boolean) => {
    const p = pointer.current;
    if (!p || p.id !== e.pointerId) return;
    pointer.current = null;
    p.el.releasePointerCapture?.(e.pointerId);
    if (!p.dragging) return; // a click: onClick picks the label
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 0); // no click came (it can come late, so also below)
    setDrag(null);
    if (!cancelled) doMove(p.from, targetAt(p.el, e.clientX, e.clientY, p.from));
  };

  /** Pressing a label: pick it up, put it down again, or put the picked one here. */
  const onLabelClick = (here: Source) => {
    if (suppressClick.current) {
      suppressClick.current = false; // the click that ends a drag
      return;
    }
    if (same(picked, here)) {
      setPicked(null);
      setMessage(t.cancelled);
      return;
    }
    if (picked && here.zone !== null) {
      const list = placed[here.zone];
      const to: Target = picked.zone !== null && picked.zone !== here.zone
        ? { zone: here.zone, onto: here.label }
        : { zone: here.zone, index: list.indexOf(here.label) };
      doMove(picked, to);
      return;
    }
    setPicked(here);
    setMessage(t.picked(labels[here.label]));
  };

  const onZoneClick = (zone: string) => {
    if (!picked) return;
    doMove(picked, { zone });
  };

  const putBack = () => {
    if (!picked || picked.zone === null) return;
    doMove(picked, { zone: null });
    listRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    suppressClick.current = false;
    if (e.key === "Escape" && (picked || drag)) {
      e.preventDefault();
      setPicked(null);
      setMessage(t.cancelled);
    }
  };

  /** While a label is picked up or dragged: the zone it would go to, and whether that zone takes it. */
  const moving = drag?.from ?? picked;
  const zoneState = (zone: string) => {
    if (!moving) return "idle";
    const ok = accepts(placed, rules, moving, zone) || (drag?.target?.zone === zone && drag.target.onto !== undefined);
    if (drag?.target?.zone === zone) return ok ? "over" : "refused";
    return ok ? "open" : "closed";
  };

  const labelButton = (from: Source, position?: number) => {
    const text = labels[from.label];
    const isPicked = same(picked, from);
    const isDragged = !!drag && same(drag.from, from);
    const inZone = from.zone !== null;
    return (
      <button type="button" key={`${from.zone}-${from.label}`}
        data-label={from.label} data-placed={inZone ? "" : undefined} data-testid={inZone ? `placed-${from.zone}-${from.label}` : `label-${from.label}`}
        aria-pressed={isPicked}
        aria-label={t.label(text, inZone ? t.inZone(zoneNumber(from.zone), position + 1) : "")}
        style={inZone ? droppedStyle : undefined}
        className={`relative z-10 inline-flex max-w-full touch-none select-none items-center gap-1 rounded-md border px-2.5 py-1 text-sm font-semibold leading-tight shadow-sm transition-[box-shadow,background-color,opacity] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${
          isPicked ? "border-sky-600 bg-sky-100 text-sky-900 ring-2 ring-sky-600" : "border-slate-300 bg-white text-slate-700 hover:border-sky-500 hover:shadow"
        } ${isDragged ? "opacity-40" : ""} cursor-grab active:cursor-grabbing`}
        onPointerDown={onPointerDown(from)} onPointerMove={onPointerMove}
        onPointerUp={(e) => endPointer(e, false)} onPointerCancel={(e) => endPointer(e, true)}
        onClick={() => onLabelClick(from)}
        onKeyDown={(e) => {
          if (inZone && (e.key === "Delete" || e.key === "Backspace")) {
            e.preventDefault();
            doMove(from, { zone: null });
            listRef.current?.focus();
          }
        }}>
        {inZone && numbering && <span className="font-normal text-slate-500" aria-hidden="true">{position + 1}.</span>}
        <span className="truncate">{text}</span>
      </button>
    );
  };

  const list = inList(labels, placed, rules);
  const zoneClass: Record<string, string> = {
    idle: "border-dashed border-sky-500/70 bg-white/75",
    open: "border-dashed border-sky-600 bg-sky-50/85",
    closed: "border-dashed border-slate-400/60 bg-slate-100/60",
    over: "border-solid border-sky-600 bg-sky-100/90 shadow-[0_0_0_4px_rgba(2,132,199,.25)]",
    refused: "border-solid border-rose-500 bg-rose-50/85",
  };

  return (
    <div className="inline-flex max-w-full flex-col gap-3 font-sans text-slate-800" onKeyDown={onKeyDown}>
      <p className="sr-only">{t.howTo}</p>
      <div className="relative inline-block max-w-full select-none overflow-visible rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_rgba(16,24,40,.06)]"
        data-testid="image" role="group" aria-label={image.alt || t.image}>
        <img src={image.src} alt={image.alt} draggable={false} className="block h-auto max-w-full rounded-xl"
          onDragStart={(e) => e.preventDefault()} />
        {zones.map((z, i) => {
          const state = zoneState(z.id);
          const here = placed[z.id] ?? [];
          const full = rules.max > 0 && here.length >= rules.max;
          const name = `${t.zone(i + 1, zones.length)}, ${t.contains(here.map((l) => labels[l]))}${full ? `, ${t.full}` : ""}`;
          return (
            <div key={z.id} data-dropzone={z.id} data-testid={z.id}
              className={`absolute flex flex-wrap content-start items-start gap-1 rounded-lg border-2 p-1 transition-[background-color,border-color,box-shadow] ${zoneClass[state]}`}
              style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }}>
              <button type="button" aria-label={name} aria-disabled={!picked}
                className="absolute inset-0 z-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
                tabIndex={picked ? 0 : -1}
                onClick={() => onZoneClick(z.id)} />
              {here.map((l, position) => labelButton({ label: l, zone: z.id }, position))}
            </div>
          );
        })}
      </div>

      <div ref={listRef} tabIndex={-1} role="group" aria-label={t.labels} data-testid="labels"
        className={`flex min-h-12 flex-wrap items-center gap-2 rounded-xl border bg-slate-50 p-2.5 outline-none transition-colors ${
          moving && moving.zone !== null ? "border-dashed border-sky-500 bg-sky-50/60" : "border-slate-200"
        }`}>
        {list.map((l) => labelButton({ label: l, zone: null }))}
        {list.length === 0 && <span className="px-1 text-sm text-slate-500">{t.allPlaced}</span>}
        {picked && picked.zone !== null && (
          <button type="button" onClick={putBack} data-testid="put-back"
            className="ml-auto rounded-md border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-sky-600">
            {t.backToList}
          </button>
        )}
      </div>

      <p className="sr-only" aria-live="polite">{message}</p>

      {drag && (
        <div aria-hidden="true"
          className="pointer-events-none fixed z-50 rounded-md border border-sky-600 bg-white px-2.5 py-1 text-sm font-semibold leading-tight text-sky-900 shadow-lg ring-2 ring-sky-600/30"
          style={{ left: `${drag.x - drag.dx}px`, top: `${drag.y - drag.dy}px`, transform: "rotate(-2deg)" }}>
          {drag.text}
        </div>
      )}
    </div>
  );
};

export default Interaction;
