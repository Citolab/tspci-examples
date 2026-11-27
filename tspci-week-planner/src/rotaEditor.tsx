import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  DAY_CODES, Day, Rota, Shift, ShiftIssue, Template, clock, coverageGaps, coverageStaff, dayOf, employeeOf, formatNumber, outsideContract,
  putShift, removeShift, resizeShift, setBreak, shiftIssues, shiftOf, staffAt, weekMinutes,
} from "./rota";
import { RotaTexts } from "./rotaTexts";

// The rota as the candidate makes it (makeRota, hoursAndPay with an own rota) and as the author makes the given rota
// or the example solution. The same mechanics as the week planner's agenda (agenda.tsx), turned on its side: a row
// per employee in every day, time runs to the right in columns of `slot` minutes. A shift card is dragged onto a row
// (it keeps its times), or picked (click or Enter) and placed with a click or the arrow keys and Enter. A shift is
// moved by dragging it, made longer or shorter by dragging its right edge, and its break is set with the toolbar.

const CONFLICT = "#D55E00"; // Okabe-Ito vermillion, as in the agenda
const NAME_W = 92; // px, the column with the names

type Drag = { kind: "card"; template: string } | { kind: "move"; employee: string; day: Day; grab: number } | { kind: "resize"; employee: string; day: Day };
type Pending = { drag: Drag; startX: number; startY: number; moved: boolean; x: number; y: number; touch: boolean };
type Cell = { r: number; c: number };
type Picked = { kind: "card"; template: string } | { kind: "shift"; employee: string; day: Day } | null;

const tool =
  "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 shadow-xs pointer-coarse:min-h-11 " +
  "hover:bg-slate-50 hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600 disabled:opacity-40 disabled:hover:bg-white";
const closedPattern = "repeating-linear-gradient(135deg, #f1f5f9 0 5px, #e2e8f0 5px 7px)";
const unavailablePattern = "repeating-linear-gradient(45deg, #e2e8f0 0 6px, #cbd5e1 6px 8px)";
const conflictPattern = `repeating-linear-gradient(-45deg, color-mix(in oklab, ${CONFLICT} 22%, transparent) 0 4px, transparent 4px 9px)`;

/** The nearest element that scrolls vertically, across shadow roots; the page's own scrolling element at the end. */
const scrollParent = (el: Element | null): Element => {
  let node: Element | null = el;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement ?? ((node.getRootNode() as ShadowRoot).host ?? null);
  }
  return document.scrollingElement ?? document.documentElement;
};

const RotaEditor = ({ rota: r, shifts, onChange, texts: t, feedback = true, readOnly = false, showHours = false, label, testid = "rota" }: {
  rota: Rota;
  shifts: Shift[];
  onChange: (shifts: Shift[]) => void;
  texts: RotaTexts;
  /** live feedback: the author's rules (people at work, days off, length, breaks, rest, weekend) */
  feedback?: boolean;
  readOnly?: boolean;
  /** the hours per employee against the contract (makeRota; not when the candidate has to work them out) */
  showHours?: boolean;
  label?: string;
  testid?: string;
}) => {
  const E = r.employees.length;
  const rows = useMemo(() => r.days.flatMap((d) => r.employees.map((e) => ({ day: d.day, employee: e.id }))), [r]);
  const cols = useMemo(() => {
    const out: number[] = [];
    for (let m = r.start; m < r.end; m += r.slot) out.push(m);
    return out;
  }, [r]);
  const need = coverageStaff(r);
  const showCoverage = feedback && need > 0;
  const H = showCoverage ? 2 : 1; // header rows per day
  const [cursor, setCursor] = useState<Cell>({ r: 0, c: Math.max(0, cols.findIndex((m) => m >= (r.days[0]?.open ?? r.start))) });
  const [picked, setPicked] = useState<Picked>(null);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const history = useRef<Shift[][]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const current = useRef(shifts);
  current.current = shifts;
  const suppressClick = useRef(false);

  const issues = useMemo(() => (feedback ? shiftIssues(r, shifts) : new Map<Shift, ShiftIssue[]>()), [r, shifts, feedback]);
  const gaps = useMemo(() => (showCoverage ? coverageGaps(r, shifts, need) : []), [r, shifts, showCoverage, need]);

  // --- names

  const dayName = (d: Day) => t.days[DAY_CODES.indexOf(d)];
  const dayShort = (d: Day) => t.daysShort[DAY_CODES.indexOf(d)];
  const name = (id: string) => employeeOf(r, id)?.name ?? id;
  const what = (s: { start: number; end: number; break: number }) => t.shiftText(clock(s.start), clock(s.end), s.break);
  const hoursText = (h: number) => t.hours(h);
  const issueText = (i: ShiftIssue, s: Shift) => {
    switch (i.kind) {
      case "unavailable": return t.issueUnavailable(name(s.employee), dayName(s.day));
      case "tooLong": return t.issueTooLong(hoursText(i.hours));
      case "noBreak": return t.issueNoBreak(i.minutes, hoursText(i.hours));
      case "rest": return t.issueRest(t.duration(i.rest), dayName(i.after));
      case "weekend": return t.issueWeekend(i.days);
    }
  };
  const issuesOf = (s: Shift) => (issues.get(s) ?? []).map((i) => issueText(i, s));
  const template = (id: string) => r.templates.find((x) => x.id === id);
  const colOf = (minutes: number) => Math.round((minutes - r.start) / r.slot);
  const rowOf = (x: { employee: string; day: Day }) => r.days.findIndex((d) => d.day === x.day) * E + r.employees.findIndex((e) => e.id === x.employee);
  const gridLine = (ri: number) => 2 + Math.floor(ri / E) * (E + H) + H + (ri % E);

  // --- changes

  const commit = (next: Shift[] | null, message: string) => {
    if (!next) return false;
    history.current.push(current.current);
    if (history.current.length > 200) history.current.shift();
    onChange(next);
    setStatus(message);
    return true;
  };
  const withIssues = (next: Shift[], employee: string, day: Day) => {
    if (!feedback) return "";
    const s = shiftOf(next, employee, day);
    const list = s ? (shiftIssues(r, next).get(s) ?? []).map((i) => issueText(i, s)) : [];
    return list.length ? ` ${list.join(". ")}.` : "";
  };
  /** A card on a row (at its own times), or a picked-up shift moved to a row and a start. */
  const placeAt = (item: Picked, ri: number, c: number) => {
    if (readOnly || !item || !rows[ri]) return;
    const row = rows[ri];
    let shift: Shift, from: { employee: string; day: Day } | undefined;
    if (item.kind === "card") {
      const tpl = template(item.template);
      if (!tpl) return;
      shift = { employee: row.employee, day: row.day, start: tpl.start, end: tpl.end, break: tpl.break };
    } else {
      const s = shiftOf(current.current, item.employee, item.day);
      if (!s) return;
      const start = r.start + c * r.slot;
      shift = { ...s, employee: row.employee, day: row.day, start, end: start + (s.end - s.start) };
      from = { employee: s.employee, day: s.day };
    }
    const result = putShift(r, current.current, shift, from);
    if (!result) return;
    const placed = shiftOf(result.shifts, row.employee, row.day)!;
    commit(result.shifts, t.placed(name(row.employee), dayName(row.day), what(placed)) +
      (result.replaced ? t.replaced(clock(result.replaced.start) + "–" + clock(result.replaced.end)) : "") + withIssues(result.shifts, row.employee, row.day));
    setPicked(null);
    setCursor({ r: ri, c: colOf(placed.start) });
  };
  const resizeTo = (employee: string, day: Day, end: number) => {
    if (readOnly) return;
    const next = resizeShift(r, current.current, employee, day, end);
    if (next) commit(next, t.placed(name(employee), dayName(day), what(shiftOf(next, employee, day)!)) + withIssues(next, employee, day));
  };
  const breakBy = (employee: string, day: Day, step: number, wrap = false) => {
    if (readOnly) return;
    const s = shiftOf(current.current, employee, day);
    if (!s) return;
    let next = setBreak(r, current.current, employee, day, s.break + step);
    if (!next && wrap && step > 0) next = setBreak(r, current.current, employee, day, 0); // B past the longest break: none again
    if (next) commit(next, t.placed(name(employee), dayName(day), what(shiftOf(next, employee, day)!)) + withIssues(next, employee, day));
  };
  const removeAt = (employee: string, day: Day) => {
    if (readOnly || !shiftOf(current.current, employee, day)) return;
    commit(removeShift(current.current, employee, day), t.removed(name(employee), dayName(day)));
    if (picked?.kind === "shift" && picked.employee === employee && picked.day === day) setPicked(null);
  };
  const undo = () => {
    const previous = history.current.pop();
    if (!previous) return;
    onChange(previous);
    setStatus(t.undone);
  };
  const clear = () => commit([], t.cleared);

  const pickCard = (id: string | null, focus = true) => {
    if (!id) {
      setPicked(null);
      return setStatus(t.dropped);
    }
    setPicked({ kind: "card", template: id });
    setStatus(t.pickedCard(template(id)!.label || what(template(id)!)));
    setCursor({ ...cursor, c: colOf(template(id)!.start) });
    if (focus) gridRef.current?.focus();
  };

  // --- what is where

  const selected = rows[cursor.r] ? shiftOf(shifts, rows[cursor.r].employee, rows[cursor.r].day) ?? null : null;
  const isClosed = (day: Day, m: number) => {
    const d = dayOf(r, day);
    return !d || m < d.open || m + r.slot > d.close;
  };
  const cellLabel = (ri: number, c: number) => {
    const row = rows[ri], m = cols[c];
    const where = t.cell(dayName(row.day), name(row.employee), clock(m));
    const s = shiftOf(shifts, row.employee, row.day);
    const parts: string[] = [];
    if (s && s.start <= m && m < s.end) parts.push(what(s), ...issuesOf(s));
    else parts.push(t.notAtWork);
    if (employeeOf(r, row.employee)?.unavailable.includes(row.day)) parts.push(t.notAvailable);
    if (isClosed(row.day, m)) parts.push(t.closed);
    return `${where}: ${parts.join(", ")}`;
  };

  // --- pointer

  const cellFromPoint = (x: number, y: number): Cell | null => {
    const grid = gridRef.current;
    const first = grid?.querySelector(`[data-cell="0-0"]`);
    if (!grid || !first) return null;
    const rect = first.getBoundingClientRect();
    const c = Math.floor((x - rect.left) / rect.width);
    if (c < 0 || c >= cols.length) return null;
    for (let ri = 0; ri < rows.length; ri++) {
      const rr = grid.querySelector(`[data-cell="${ri}-0"]`)!.getBoundingClientRect();
      if (y >= rr.top && y < rr.bottom) return { r: ri, c };
    }
    return null;
  };
  const endFromPoint = (x: number) => {
    const first = gridRef.current?.querySelector(`[data-cell="0-0"]`);
    if (!first) return null;
    const rect = first.getBoundingClientRect();
    return r.start + Math.round((x - rect.left) / rect.width) * r.slot;
  };
  const target = (drag: Drag, x: number, y: number): Cell | null => {
    const cell = cellFromPoint(x, y);
    if (!cell || drag.kind !== "move") return cell;
    return { r: cell.r, c: Math.max(0, cell.c - drag.grab) };
  };
  const drop = useRef<(state: Pending) => void>();
  drop.current = ({ drag, x, y }) => {
    if (drag.kind === "resize") {
      const end = endFromPoint(x);
      if (end !== null) resizeTo(drag.employee, drag.day, end);
      return;
    }
    const cell = target(drag, x, y);
    if (drag.kind === "card") {
      if (cell) placeAt({ kind: "card", template: drag.template }, cell.r, cell.c);
    } else if (cell) placeAt({ kind: "shift", employee: drag.employee, day: drag.day }, cell.r, cell.c);
    else removeAt(drag.employee, drag.day); // dragged out of the rota
  };
  const click = useRef<(state: Pending) => void>();
  click.current = ({ drag, x, y }) => {
    if (drag.kind === "card") return; // the card's own click
    const cell = cellFromPoint(x, y);
    if (!cell) return;
    if (picked) return placeAt(picked, cell.r, cell.c);
    setCursor(cell);
    gridRef.current?.focus();
  };
  /** Listens on the window right away (not in an effect, which could come after a quick pointerup). */
  const startDrag = (e: PointerEvent, drag: Drag) => {
    if (readOnly || e.button > 0 || !e.isPrimary) return; // a second finger is a pinch, never a drag
    e.stopPropagation();
    if (drag.kind !== "card") e.preventDefault(); // no text selection, and the grid keeps the focus
    const touch = e.pointerType !== "mouse";
    let state: Pending = { drag, startX: e.clientX, startY: e.clientY, moved: false, x: e.clientX, y: e.clientY, touch };
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const moved = state.moved || Math.hypot(ev.clientX - state.startX, ev.clientY - state.startY) > (touch ? 10 : 5);
      state = { ...state, moved, x: ev.clientX, y: ev.clientY };
      if (moved) setPending(state);
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setPending(null);
      if (ev.type === "pointercancel") return;
      state = { ...state, x: ev.clientX, y: ev.clientY };
      if (!state.moved) return click.current(state);
      drop.current(state);
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  const clickCell = (ri: number, c: number) => {
    if (suppressClick.current) return;
    if (picked && !readOnly) return placeAt(picked, ri, c);
    setCursor({ r: ri, c });
    gridRef.current?.focus();
  };

  // While dragging near an edge, the rota scrolls: sideways in its own box, up and down in the page (or the
  // player's scrolling box). The finger stands still, so the preview follows what moves under it.
  const dragging = pending?.moved ? pending : null;
  const draggingRef = useRef<Pending | null>(null);
  draggingRef.current = dragging;
  useEffect(() => {
    if (!dragging) return;
    let frame = 0;
    const step = () => {
      const d = draggingRef.current;
      if (!d) return;
      const edge = 48, speed = 12;
      let scrolled = false;
      const box = scroller.current;
      if (box && box.scrollWidth > box.clientWidth) {
        const rect = box.getBoundingClientRect();
        const dx = d.x < rect.left + edge ? -speed : d.x > rect.right - edge ? speed : 0;
        if (dx && d.y >= rect.top && d.y <= rect.bottom) {
          const before = box.scrollLeft;
          box.scrollLeft += dx;
          scrolled ||= box.scrollLeft !== before;
        }
      }
      const page = scrollParent(gridRef.current);
      const top = page === document.scrollingElement || page === document.documentElement ? 0 : page.getBoundingClientRect().top;
      const bottom = page === document.scrollingElement || page === document.documentElement ? window.innerHeight : page.getBoundingClientRect().bottom;
      // only while the rota goes on beyond that edge: the finger stays above the rota, never past its end
      const grid = gridRef.current?.getBoundingClientRect();
      const dy = !grid ? 0 : d.y < top + edge && grid.top < top ? -speed : d.y > bottom - edge && grid.bottom > bottom ? speed : 0;
      if (dy) {
        const before = page.scrollTop;
        page.scrollTop += dy;
        scrolled ||= page.scrollTop !== before;
      }
      if (scrolled) setPending({ ...d }); // the preview under the finger changed
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [!!dragging]);

  // --- keyboard

  const onKeyDown = (e: KeyboardEvent) => {
    const steps: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    const key = e.key;
    const row = rows[cursor.r];
    if (steps[key]) {
      e.preventDefault();
      if (e.shiftKey && !picked && selected && steps[key][1] !== 0) return resizeTo(selected.employee, selected.day, selected.end + steps[key][1] * r.slot);
      setCursor({
        r: Math.min(rows.length - 1, Math.max(0, cursor.r + steps[key][0])),
        c: Math.min(cols.length - 1, Math.max(0, cursor.c + steps[key][1])),
      });
    } else if (key === "Enter" || key === " ") {
      e.preventDefault();
      if (readOnly) return;
      if (picked) placeAt(picked, cursor.r, cursor.c);
      else if (selected) {
        setCursor({ r: cursor.r, c: colOf(selected.start) });
        setPicked({ kind: "shift", employee: selected.employee, day: selected.day });
        setStatus(t.pickedShift(name(selected.employee), dayName(selected.day)));
      }
    } else if (key.toLowerCase() === "b" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (selected) breakBy(selected.employee, selected.day, e.shiftKey ? -15 : 15, !e.shiftKey);
    } else if (key === "Delete" || key === "Backspace") {
      e.preventDefault();
      if (picked?.kind === "shift") removeAt(picked.employee, picked.day);
      else if (row) removeAt(row.employee, row.day);
    } else if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
    } else if (key === "Escape" && picked) {
      e.preventDefault();
      setPicked(null);
      setStatus(t.dropped);
    }
  };

  // --- what the rota shows

  /** The preview of where a picked or dragged card or shift would go. */
  const preview: Shift | null = (() => {
    if (readOnly) return null;
    if (dragging?.drag.kind === "resize") {
      const end = endFromPoint(dragging.x);
      const next = end !== null ? resizeShift(r, shifts, dragging.drag.employee, dragging.drag.day, end) : null;
      return next ? shiftOf(next, dragging.drag.employee, dragging.drag.day)! : null;
    }
    let item: Picked = null, cell: Cell | null = null;
    if (dragging) {
      item = dragging.drag.kind === "card" ? { kind: "card", template: dragging.drag.template } : { kind: "shift", employee: dragging.drag.employee, day: dragging.drag.day };
      cell = target(dragging.drag, dragging.x, dragging.y);
    } else if (picked) {
      item = picked;
      cell = cursor;
    }
    if (!item || !cell || !rows[cell.r]) return null;
    const row = rows[cell.r];
    let s: Shift;
    if (item.kind === "card") {
      const tpl = template(item.template);
      if (!tpl) return null;
      s = { employee: row.employee, day: row.day, start: tpl.start, end: tpl.end, break: tpl.break };
    } else {
      const from = shiftOf(shifts, item.employee, item.day);
      if (!from) return null;
      const start = r.start + cell.c * r.slot;
      s = { ...from, employee: row.employee, day: row.day, start, end: start + from.end - from.start };
    }
    const result = putShift(r, shifts, s, item.kind === "shift" ? { employee: item.employee, day: item.day } : undefined);
    return result ? shiftOf(result.shifts, row.employee, row.day)! : null;
  })();
  const moving = dragging && dragging.drag.kind !== "card" ? { employee: dragging.drag.employee, day: dragging.drag.day } : picked?.kind === "shift" ? picked : null;

  const cellId = (ri: number, c: number) => `${testid}-cell-${ri}-${c}`;
  const span = (s: { start: number; end: number }) => `${2 + colOf(s.start)} / ${2 + colOf(s.end)}`;
  const hourSpan = Math.max(1, Math.round(60 / r.slot));

  const card = (tpl: Template) => {
    const isPicked = picked?.kind === "card" && picked.template === tpl.id;
    const times = what(tpl);
    return (
      <li key={tpl.id}>
        <button type="button" data-testid={`card-${tpl.id}`} aria-pressed={isPicked} disabled={readOnly} aria-label={t.shiftCard(tpl.label || clock(tpl.start), times)}
          className={"flex min-h-11 min-w-[9rem] touch-none select-none flex-col items-start gap-0.5 rounded-lg border border-l-4 border-slate-200 border-l-sky-600 bg-white px-2.5 py-1.5 text-left text-xs text-slate-700 " +
            "hover:border-sky-400 hover:bg-sky-50 aria-pressed:border-sky-600 aria-pressed:bg-sky-50 aria-pressed:ring-2 aria-pressed:ring-sky-200 focus-visible:outline-2 focus-visible:outline-sky-600 " +
            (readOnly ? "" : "cursor-grab")}
          onPointerDown={(e) => startDrag(e, { kind: "card", template: tpl.id })}
          onClick={() => !suppressClick.current && pickCard(isPicked ? null : tpl.id)}>
          <span className="text-[13px] font-medium text-slate-900">{tpl.label || clock(tpl.start)}</span>
          <span className="tabular-nums text-slate-600">{clock(tpl.start)}–{clock(tpl.end)}</span>
          <span className="text-slate-500">{t.breakOf(tpl.break)}</span>
        </button>
      </li>
    );
  };

  // nothing to complain about in an empty rota: the problems start with the first shift
  const problemList: string[] = feedback && shifts.length > 0
    ? [
        ...gaps.map((g) => t.gap(dayName(g.day), clock(g.start), clock(g.end), g.staff, need)),
        ...shifts.flatMap((s) => issuesOf(s).map((x) => `${name(s.employee)}, ${dayShort(s.day)} ${clock(s.start)}–${clock(s.end)}: ${x}`)),
        ...(r.rules.some((x) => x.type === "contractHours")
          ? r.employees.filter((e) => outsideContract(r, shifts, e)).map((e) =>
            `${e.name}: ${t.hoursOf(hoursText(weekMinutes(shifts, e.id) / 60), formatNumber(e.min, t.locale), hoursText(e.max))}, ${t.outsideContract}`)
          : []),
      ]
    : [];

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {!readOnly && r.templates.length > 0 && (
        <section aria-label={t.shifts}>
          <h3 className="m-0 mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">{t.shifts}</h3>
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">{r.templates.map(card)}</ul>
        </section>
      )}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label={t.rota}>
          <button type="button" className={tool} disabled={!selected} onClick={() => selected && removeAt(selected.employee, selected.day)} data-testid="remove">
            <span aria-hidden="true">✕</span>{t.remove}
          </button>
          <button type="button" className={tool} disabled={!selected} data-testid="shorter" onClick={() => selected && resizeTo(selected.employee, selected.day, selected.end - r.slot)}>
            <span aria-hidden="true">−</span>{t.shorter}
          </button>
          <button type="button" className={tool} disabled={!selected} data-testid="longer" onClick={() => selected && resizeTo(selected.employee, selected.day, selected.end + r.slot)}>
            <span aria-hidden="true">+</span>{t.longer}
          </button>
          <button type="button" className={tool} disabled={!selected || selected.break === 0} data-testid="less-break" onClick={() => selected && breakBy(selected.employee, selected.day, -15)}>
            <span aria-hidden="true">☕−</span>{t.lessBreak}
          </button>
          <button type="button" className={tool} disabled={!selected} data-testid="more-break" onClick={() => selected && breakBy(selected.employee, selected.day, 15)}>
            <span aria-hidden="true">☕+</span>{t.moreBreak}
          </button>
          <button type="button" className={tool} onClick={undo} data-testid="undo"><span aria-hidden="true">↶</span>{t.undo}</button>
          <button type="button" className={tool} onClick={clear} data-testid="clear">{t.clear}</button>
          <button type="button" className={`${tool} ml-auto`} aria-expanded={helpOpen} aria-label={t.showHelp} title={t.showHelp}
            onClick={() => setHelpOpen(!helpOpen)} data-testid="help"><span aria-hidden="true">?</span></button>
        </div>
      )}
      {helpOpen && <p className="m-0 max-w-[75ch] rounded-lg bg-sky-50 p-2.5 text-xs text-sky-900">{t.help}</p>}

      <div ref={scroller} className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
        <div ref={gridRef} role="grid" tabIndex={0} aria-label={label ?? t.rota} aria-activedescendant={cellId(cursor.r, cursor.c)} data-testid={testid}
          aria-readonly={readOnly ? "true" : undefined} aria-rowcount={rows.length} aria-colcount={cols.length + 1} onKeyDown={onKeyDown}
          className="group relative grid min-w-[640px] select-none outline-none [--rota-row:34px] pointer-coarse:[--rota-row:44px] focus-visible:ring-2 focus-visible:ring-sky-200 focus-visible:ring-offset-2"
          style={{
            gridTemplateColumns: `${NAME_W}px repeat(${cols.length}, minmax(${r.slot >= 30 ? 22 : 14}px, 1fr))`,
            gridTemplateRows: `auto ${r.days.map(() => `24px ${showCoverage ? "20px " : ""}repeat(${E}, var(--rota-row))`).join(" ")}`,
          }}>
          {/* the time axis */}
          <div aria-hidden="true" className="contents">
            {cols.map((m, c) => (m - r.start) % 60 === 0 || c === 0 ? (
              <div key={m} style={{ gridRow: 1, gridColumn: `${2 + c} / span ${Math.min(hourSpan, cols.length - c)}` }}
                className="border-l border-slate-200 pb-0.5 pl-0.5 text-[11px] leading-none tabular-nums text-slate-500">{clock(m)}</div>
            ) : null)}
          </div>
          {r.days.map((d, di) => {
            const line = 2 + di * (E + H);
            return (
              <div key={d.day} aria-hidden="true" className="contents">
                <div style={{ gridRow: line, gridColumn: "1 / -1" }} data-testid={`${testid}-day-${d.day}`}
                  className="sticky left-0 flex items-end gap-2 border-b border-slate-300 px-1 pb-0.5 text-xs font-semibold text-slate-800">
                  {dayName(d.day)}<span className="font-normal text-slate-500">{d.close > d.open ? t.open(clock(d.open), clock(d.close)) : t.closed}</span>
                </div>
                {showCoverage && (
                  <>
                    <div style={{ gridRow: line + 1, gridColumn: 1 }} className="sticky left-0 z-20 truncate bg-white pr-1 text-[10px] leading-5 text-slate-500">{t.coverage}</div>
                    {cols.map((m, c) => {
                      const closed = isClosed(d.day, m);
                      const n = staffAt(shifts, d.day, m);
                      const low = !closed && n < need;
                      return (
                        <div key={m} style={{ gridRow: line + 1, gridColumn: 2 + c, ...(low ? { backgroundImage: conflictPattern, color: "#9a3f00" } : {}) }}
                          data-testid={low ? `${testid}-low-${d.day}-${clock(m)}` : undefined}
                          className={`text-center text-[10px] leading-5 tabular-nums ${low ? "font-bold" : "text-slate-400"} ${(m - r.start) % 60 === 0 ? "border-l border-slate-200" : ""}`}>
                          {closed ? "" : low ? `${n}!` : n}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            );
          })}
          {rows.map((row, ri) => {
            const unavailable = employeeOf(r, row.employee)?.unavailable.includes(row.day);
            const line = gridLine(ri);
            return (
              <div role="row" key={`${row.day}-${row.employee}`} className="contents">
                <div role="rowheader" style={{ gridRow: line, gridColumn: 1 }} aria-label={`${dayName(row.day)}, ${name(row.employee)}`}
                  className={`sticky left-0 z-20 flex items-center gap-1 truncate border-t border-slate-100 bg-white pr-1 text-xs text-slate-700 ${ri % E === 0 ? "border-t-slate-200" : ""}`}>
                  <span className="truncate">{name(row.employee)}</span>
                </div>
                {unavailable && (
                  <div aria-hidden="true" style={{ gridRow: line, gridColumn: `2 / ${2 + cols.length}` }}
                    className="pointer-events-none relative z-[5] flex items-center pl-2 text-[11px] text-slate-600 italic">
                    <span className="rounded bg-white/85 px-1">{t.notAvailable}</span>
                  </div>
                )}
                {cols.map((m, c) => {
                  const isCursor = cursor.r === ri && cursor.c === c;
                  const closed = isClosed(row.day, m);
                  return (
                    <div role="gridcell" id={cellId(ri, c)} key={m} data-cell={`${ri}-${c}`} data-testid={`cell-${row.day}-${row.employee}-${clock(m)}`}
                      aria-label={cellLabel(ri, c)} aria-selected={isCursor} aria-readonly={readOnly ? "true" : undefined}
                      style={{ gridRow: line, gridColumn: 2 + c, ...(unavailable ? { backgroundImage: unavailablePattern } : closed ? { backgroundImage: closedPattern } : {}) }}
                      className={"relative border-t border-t-slate-100 " + ((m - r.start) % 60 === 0 ? "border-l border-l-slate-200 " : "border-l border-l-slate-50 ") + (picked && !readOnly ? "cursor-copy" : "")}
                      onClick={() => clickCell(ri, c)}>
                      {isCursor && <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-30 hidden rounded-sm ring-2 ring-sky-600 group-focus:block" />}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {shifts.map((s) => {
            const ri = rowOf(s);
            if (ri < 0) return null;
            const list = issuesOf(s);
            const problem = list.length > 0;
            const isSelected = selected === s;
            const isMoving = moving && moving.employee === s.employee && moving.day === s.day;
            return (
              <div key={`${s.employee}-${s.day}`} aria-hidden="true" data-testid={`shift-${s.employee}-${s.day}`} data-problem={problem ? "true" : undefined}
                title={[`${name(s.employee)}, ${dayName(s.day)}: ${what(s)}`, ...list].join("\n")}
                style={{ gridRow: gridLine(ri), gridColumn: span(s), ...(problem ? { backgroundImage: conflictPattern, borderColor: CONFLICT } : {}) }}
                className={"relative z-10 mx-px my-0.5 flex min-w-0 touch-none items-center gap-1.5 overflow-hidden rounded-md border-l-4 pr-7 pl-1 text-[11px] leading-tight shadow-xs " +
                  (problem ? "border-2 border-dashed bg-orange-50 text-slate-900 " : "border-sky-700 bg-sky-100 text-slate-900 ") +
                  (isSelected ? "ring-2 ring-sky-600 " : "") + (isMoving && (dragging || picked) ? "opacity-40 " : "") + (readOnly ? "" : "cursor-grab")}
                onPointerDown={(e) => {
                  const cell = cellFromPoint(e.clientX, e.clientY);
                  startDrag(e, { kind: "move", employee: s.employee, day: s.day, grab: cell ? Math.max(0, cell.c - colOf(s.start)) : 0 });
                }}>
                {problem && <span style={{ color: CONFLICT }} className="font-bold">⚠</span>}
                <span className="shrink-0 font-semibold tabular-nums">{clock(s.start)}–{clock(s.end)}</span>
                {s.break > 0 && <span className="truncate text-slate-600" data-testid={`break-${s.employee}-${s.day}`}><span aria-hidden="true">☕ </span>{t.breakShort(s.break)}</span>}
                {problem && <span className="truncate text-[10px] font-semibold" style={{ color: "#9a3f00" }}>{list[0]}</span>}
                {!readOnly && (
                  // the right edge: 8 px with a mouse, 24 px for a finger
                  <span className="absolute inset-y-0 right-0 flex w-2 cursor-ew-resize items-center justify-center pointer-coarse:w-6" data-testid={`resize-${s.employee}-${s.day}`}
                    onPointerDown={(e) => startDrag(e, { kind: "resize", employee: s.employee, day: s.day })}>
                    <span className="h-4 w-0.5 rounded bg-sky-700/50" />
                  </span>
                )}
              </div>
            );
          })}

          {preview && (
            <div aria-hidden="true" data-testid="preview" style={{ gridRow: gridLine(rowOf(preview)), gridColumn: span(preview) }}
              className="pointer-events-none z-20 mx-px my-0.5 flex items-center gap-1.5 overflow-hidden rounded-md border-2 border-dashed border-sky-600 bg-sky-200/60 px-1 text-[11px] leading-tight text-sky-900">
              <span className="shrink-0 font-semibold tabular-nums">{clock(preview.start)}–{clock(preview.end)}</span>
              {preview.break > 0 && <span className="truncate">{t.breakShort(preview.break)}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500" data-testid="legend">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm border border-slate-300" style={{ backgroundImage: closedPattern }} />{t.legendClosed}</span>
        {r.employees.some((e) => e.unavailable.length) && <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm border border-slate-300" style={{ backgroundImage: unavailablePattern }} />{t.legendUnavailable}</span>}
        {feedback && <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm border-2 border-dashed" style={{ backgroundImage: conflictPattern, borderColor: CONFLICT }} />{t.legendProblem}</span>}
      </div>
      {showHours && feedback && (
        <section aria-label={t.hoursThisWeek} className="text-xs text-slate-700" data-testid="hours">
          <h3 className="m-0 mb-0.5 text-xs font-semibold text-slate-600">{t.hoursThisWeek}</h3>
          <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-0.5 p-0">
            {r.employees.map((e) => {
              const out = shifts.length > 0 && r.rules.some((x) => x.type === "contractHours") && outsideContract(r, shifts, e);
              return (
                <li key={e.id} className="tabular-nums" style={out ? { color: "#9a3f00" } : undefined}>
                  {out && <span aria-hidden="true">⚠ </span>}<strong className="font-medium">{e.name}</strong>{" "}
                  {t.hoursOf(hoursText(weekMinutes(shifts, e.id) / 60), formatNumber(e.min, t.locale), hoursText(e.max))}
                  {out && <span className="sr-only">, {t.outsideContract}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {problemList.length > 0 && (
        <section aria-label={t.problems} className="rounded-lg border border-dashed px-2.5 py-1.5 text-xs" style={{ borderColor: CONFLICT }} data-testid="problems">
          <h3 className="m-0 mb-0.5 text-xs font-semibold" style={{ color: "#9a3f00" }}><span aria-hidden="true">⚠ </span>{t.problems}</h3>
          <ul className="m-0 list-none p-0 text-slate-700">{problemList.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
      )}
      <p role="status" aria-live="polite" className="m-0 min-h-5 text-xs text-slate-600" data-testid="status">{status}</p>

      {dragging && dragging.drag.kind === "card" && (
        <div aria-hidden="true" className="pointer-events-none fixed z-50 rounded-md border border-sky-600 bg-white/90 px-2 py-1 text-xs text-sky-900 shadow-md"
          style={{ left: `${dragging.x + 10}px`, top: `${dragging.y + 6}px` }}>
          {template(dragging.drag.template)?.label}
        </div>
      )}
    </div>
  );
};

export default RotaEditor;
