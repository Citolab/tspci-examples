/**
 * The cash register (task `register`), drawn in HTML and SVG: the shopping on the counter (each item a button: a tap
 * rings it up), the customer's money, the till (a display and a keypad) and the receipt that prints when the customer
 * has paid. What the keys do is in till.ts; the change is given with the counter and the drawer of interaction.tsx.
 * The items are plain drawings, with their name, price and deal always written next to them.
 */
import type { JSX } from "preact";
import { Look, TaskModel, formatAmount, piecesOf } from "./money";
import { DIGITS, Key, TillState, itemByCode, linesValue, phaseOf, receiptRows, rungUp, tillContext } from "./till";
import { Texts } from "./texts";

type RegisterTexts = Texts["register"];
type Common = { model: TaskModel; till: TillState; t: Texts; language: string };

/** An item as a plain drawing: no brands, no real packaging. Decorative: the button around it names it. */
export function ItemPicture({ look, size = 52 }: { look: Look; size?: number }) {
  const line = { stroke: "#374151", "stroke-width": 2.5, "stroke-linejoin": "round" as const };
  const shapes: Record<Look, JSX.Element> = {
    box: (
      <>
        <rect x="12" y="10" width="40" height="46" rx="3" fill="#f2c14e" {...line} />
        <rect x="12" y="26" width="40" height="14" fill="#fff6d8" {...line} />
      </>
    ),
    carton: (
      <>
        <path d="M18 22 L24 8 H40 L46 22 V58 H18 Z" fill="#eef5fc" {...line} />
        <path d="M18 22 H46" fill="none" {...line} />
        <rect x="18" y="34" width="28" height="12" fill="#5b8fd0" {...line} />
      </>
    ),
    bottle: (
      <>
        <path d="M27 6 H37 V16 C37 20 44 22 44 30 V56 C44 58 42 60 40 60 H24 C22 60 20 58 20 56 V30 C20 22 27 20 27 16 Z" fill="#62b07c" {...line} />
        <rect x="20" y="36" width="24" height="12" fill="#e9f6ee" {...line} />
      </>
    ),
    can: (
      <>
        <path d="M16 14 V52 C16 56 48 56 48 52 V14" fill="#d9675e" {...line} />
        <ellipse cx="32" cy="14" rx="16" ry="5" fill="#e8a29c" {...line} />
        <rect x="16" y="28" width="32" height="12" fill="#fbe9e7" {...line} />
      </>
    ),
    jar: (
      <>
        <rect x="18" y="8" width="28" height="10" rx="2" fill="#8f979e" {...line} />
        <path d="M16 20 C16 18 48 18 48 20 V54 C48 58 46 60 42 60 H22 C18 60 16 58 16 54 Z" fill="#c9853f" {...line} />
        <rect x="16" y="32" width="32" height="12" fill="#fbeedd" {...line} />
      </>
    ),
    bag: (
      <>
        <path d="M14 14 L18 8 H46 L50 14 L46 58 H18 Z" fill="#eea35a" {...line} />
        <path d="M14 14 H50" fill="none" {...line} />
        <circle cx="32" cy="36" r="9" fill="#fff3e2" {...line} />
      </>
    ),
    bread: (
      <>
        <path d="M8 38 C8 22 20 16 32 16 C44 16 56 22 56 38 V50 C56 52 54 54 52 54 H12 C10 54 8 52 8 50 Z" fill="#c98b4a" {...line} />
        <path d="M22 24 L26 34 M32 22 L34 33 M42 24 L40 34" fill="none" stroke="#6b4423" stroke-width="2.5" stroke-linecap="round" />
      </>
    ),
    fruit: (
      <>
        <path d="M32 20 C26 14 10 16 10 34 C10 48 20 58 27 58 C30 58 31 56 32 56 C33 56 34 58 37 58 C44 58 54 48 54 34 C54 16 38 14 32 20 Z" fill="#d64545" {...line} />
        <path d="M32 20 C32 14 34 10 37 7" fill="none" {...line} />
        <path d="M35 12 C40 6 48 8 49 10 C44 15 38 14 35 12 Z" fill="#3f8f4a" stroke="#374151" stroke-width="1.5" />
      </>
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" data-look={look}>
      {shapes[look]}
    </svg>
  );
}

/**
 * The shopping on the counter, and the customer's money. Each item is a button: a tap, a click, Enter or Space rings it
 * up (with the quantity of the × key). Its name says what it does ("Ring up Milk"), its description the rest: the
 * price, the deal, how many the customer buys, its code and how many are rung up.
 */
export function Shopping({ model, till, t, language, readOnly, onRing, pieceOf }: Common & { readOnly: boolean; onRing: (code: string) => void; pieceOf: (value: number, scale?: number) => JSX.Element }) {
  const r = t.register;
  const fmt = (cents: number) => formatAmount(cents, language, model.currency);
  const items = model.register?.items ?? [];
  return (
    <section aria-label={r.shopping} className="shopping rounded-2xl border-2 px-4 pt-2 pb-3" data-shopping>
      <h3 className="text-[0.85em] font-bold tracking-wide text-counter-ink uppercase">{r.shopping}</h3>
      <ul className="mt-2 flex flex-wrap gap-3">
        {items.map((item) => {
          const count = rungUp(till, item.code);
          const describedBy = `item-${item.code}`;
          const content = (
            <>
              <span className="absolute top-1 right-1 rounded-full bg-ink px-2 py-0.5 text-[0.85em] font-extrabold text-white" aria-hidden="true" data-buys>
                {r.buys(item.quantity)}
              </span>
              <ItemPicture look={item.look} />
              <span className="font-bold leading-tight">{item.name}</span>
              <span className="item-price" aria-hidden="true">
                {fmt(item.price)}
              </span>
              {item.deal && (
                <span className="deal-tag" aria-hidden="true" data-deal>
                  {r.deal(item.deal)}
                </span>
              )}
            </>
          );
          return (
            <li key={item.code} className="flex flex-col items-center gap-1" data-item={item.code}>
              {readOnly ? (
                <div className="shop-item flex-1" role="img" aria-label={item.name} aria-describedby={describedBy}>
                  {content}
                </div>
              ) : (
                <button type="button" className="shop-item flex-1" aria-label={r.ringUp(item.name)} aria-describedby={describedBy} onClick={() => onRing(item.code)}>
                  {content}
                </button>
              )}
              <span className="text-[0.8em] text-counter-ink" aria-hidden="true">
                {r.code(item.code)} · <span data-rung-up>{r.rungUp(count)}</span>
              </span>
              <span id={describedBy} className="sr-only">
                {[r.each(fmt(item.price)), item.deal ? r.dealLong(item.deal) : "", r.buysLong(item.quantity), r.code(item.code), r.rungUp(count)].filter(Boolean).join(", ")}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t-2 border-dashed border-counter-line pt-2">
        <span className="font-semibold">{t.customerGives}</span>
        <ul className="flex flex-wrap items-center gap-2" aria-label={t.customerGives} data-given>
          {piecesOf(model.given).map((value, i) => (
            <li key={i} aria-label={t.piece(value)}>
              {pieceOf(value, 0.8)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** What the display of the till shows: a line on top (the last item, or what the till says) and an amount below. */
export function displayOf(model: TaskModel, till: TillState, r: RegisterTexts, language: string): { top: string; label: string; amount: string } {
  const ctx = tillContext(model);
  const fmt = (cents: number) => formatAmount(cents, language, model.currency);
  const phase = phaseOf(till);
  let top = r.ready;
  const last = till.lines[till.lines.length - 1];
  if (till.note) {
    const { key, detail } = till.note;
    top = key === "tooLittle" ? r.notes.tooLittle(fmt(Number(detail))) : (r.notes[key] as (d: string) => string)(String(detail ?? ""));
  } else if (phase === "paid") top = ctx.tillCalculates ? `${r.paid} ${fmt(till.paid!)} · ${r.drawerOpen}` : r.drawerOpen;
  else if (phase === "total" && ctx.tillCalculates && linesValue(till.lines, ctx.items) !== till.total) top = r.rounded(fmt(linesValue(till.lines, ctx.items)));
  else if (last) top = r.line(itemByCode(ctx.items, last.code)?.name ?? r.open, last.quantity, fmt(last.price));

  if (till.entry !== "" || till.times !== null) {
    const entry = till.entry.replace(".", r.keys.sep);
    return { top, label: r.typing, amount: `${till.times !== null ? `${till.times} × ` : ""}${entry}` };
  }
  if (phase === "paid") return ctx.tillCalculates ? { top, label: r.change, amount: fmt(till.paid! - till.total!) } : { top, label: r.paid, amount: fmt(till.paid!) };
  if (phase === "total") return { top, label: ctx.tillCalculates ? r.total : r.totalTyped, amount: fmt(till.total!) };
  if (ctx.tillCalculates && till.lines.length) return { top, label: r.subtotal, amount: fmt(linesValue(till.lines, ctx.items)) };
  return { top, label: "", amount: "" };
}

/** The keys, in rows of four: [key, columns]. The decimal separator only for a currency with a minor unit. */
const keyRows = (minor: boolean): [Key, number][][] => [
  [["7", 1], ["8", 1], ["9", 1], ["clear", 1]],
  [["4", 1], ["5", 1], ["6", 1], ["times", 1]],
  [["1", 1], ["2", 1], ["3", 1], ["code", 1]],
  minor ? [["0", 1], ["sep", 1], ["back", 1], ["price", 1]] : [["0", 2], ["back", 1], ["price", 1]],
  [["void", 2], ["total", 2]],
  [["cash", 4]],
];

/** Keys of the keyboard that type on the till while the focus is in it: digits, the decimal separator, Backspace, Escape, *. */
const KEYBOARD: Record<string, Key> = { ",": "sep", ".": "sep", Backspace: "back", Escape: "clear", "*": "times", x: "times", X: "times" };

/**
 * The till: a display (read out by a screen reader after every key: a live region) and a keypad. The keypad's keys
 * are buttons; with the focus on one, the keyboard's digits, comma or point, Backspace, Escape (C) and * (×) type too.
 */
export function Till({ model, till, t, language, readOnly, onKey }: Common & { readOnly: boolean; onKey: (key: Key, byKeyboard: boolean) => void }) {
  const r = t.register;
  const display = displayOf(model, till, r, language);
  const onKeyDown = (e: KeyboardEvent) => {
    const key = DIGITS.includes(e.key as Key) ? (e.key as Key) : KEYBOARD[e.key];
    if (!key || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    onKey(key, true);
  };
  return (
    <section aria-label={r.till} className="till w-[17em] shrink-0 rounded-2xl p-3" data-till>
      <h3 className="sr-only">{r.till}</h3>
      <div className="till-display" role="status" aria-live="polite" aria-atomic="true" aria-label={r.display} data-display>
        <p className="min-h-[1.4em] truncate text-[0.85em]" data-display-top title={display.top}>
          {display.top}
        </p>
        <p className="flex items-baseline justify-between gap-2">
          <span className="text-[0.8em] uppercase" data-display-label>
            {display.label}
          </span>
          <span className="text-[1.5em] leading-tight font-bold tabular-nums" data-display-amount>
            {display.amount || " "}
          </span>
        </p>
      </div>
      {!readOnly && (
        <div role="group" aria-label={r.keypad} className="mt-3 grid grid-cols-4 gap-1.5" onKeyDown={onKeyDown} data-keypad>
          {keyRows(model.currency.minor !== "").flat().map(([key, span]) => {
            const digit = DIGITS.includes(key);
            return (
              <button
                key={key}
                type="button"
                className={`key ${digit ? "key-digit" : key === "cash" || key === "total" ? "key-main" : "key-function"}`}
                style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
                aria-label={digit ? undefined : r.keyNames[key]}
                data-key={key}
                onClick={(e) => onKey(key, (e as MouseEvent).detail === 0)}
              >
                {digit ? key : r.keys[key]}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * The receipt: it prints when the customer has paid (Cash). Each item with all its lines together, its deal and the
 * discount, the number of items, the total, the payment and the change. When the pupil calculates (tillCalculates
 * off), the till does not calculate either: no amounts per item and no change, only what the pupil keyed in.
 */
export function Receipt({ model, till, t, language }: Common) {
  const r = t.register;
  const ctx = tillContext(model);
  const fmt = (cents: number) => formatAmount(cents, language, model.currency);
  const printed = phaseOf(till) === "paid";
  const rows = receiptRows(till.lines, ctx.items);
  const value = linesValue(till.lines, ctx.items);
  const count = till.lines.reduce((sum, line) => sum + line.quantity, 0);
  const row = (label: string, amount: string, props: Record<string, unknown> = {}) => (
    <li className="flex justify-between gap-2" {...props}>
      <span>{label}</span>
      <span className="shrink-0 whitespace-nowrap tabular-nums">{amount}</span>
    </li>
  );
  return (
    <section aria-label={r.receipt} className="receipt-slot w-[15em] shrink-0" data-receipt>
      <h3 className="text-[0.85em] font-bold tracking-wide text-slate-600 uppercase">{r.receipt}</h3>
      <div aria-live="polite">
        {printed ? (
          <div className="receipt" data-printed>
            <p className="sr-only">{r.receiptPrinted}</p>
            <ul className="flex flex-col gap-0.5">
              {rows.map((line, i) => (
                <li key={i} className="flex flex-col" data-receipt-row>
                  <span className="flex justify-between gap-2">
                    <span className="truncate">{line.name ?? r.open}</span>
                    {ctx.tillCalculates && <span className="shrink-0 whitespace-nowrap tabular-nums">{fmt(line.amount)}</span>}
                  </span>
                  <span className="pl-2 text-[0.9em] text-slate-600">
                    {line.quantity} × {fmt(line.price)}
                  </span>
                  {line.deal && (
                    <span className="flex justify-between gap-2 pl-2 text-[0.9em]">
                      {/* the deal in short ("2 for €2.00", "−25%"); a screen reader hears it with "deal:" */}
                      <span aria-hidden="true">{r.deal(line.deal)}</span>
                      <span className="sr-only">{r.dealLong(line.deal)}</span>
                      {ctx.tillCalculates && line.value !== line.amount && <span className="shrink-0 whitespace-nowrap tabular-nums">−{fmt(line.amount - line.value)}</span>}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <ul className="mt-2 flex flex-col gap-0.5 border-t border-dashed border-slate-400 pt-1">
              {row(r.items(count), "")}
              {ctx.tillCalculates && value !== till.total && row(r.subtotal, fmt(value))}
              {row(ctx.tillCalculates ? r.total : r.totalTyped, fmt(till.total!), { className: "flex justify-between gap-2 font-bold", "data-receipt-total": true })}
              {row(r.paid, fmt(till.paid!), { className: "flex justify-between gap-2", "data-receipt-paid": true })}
              {ctx.tillCalculates && row(r.change, fmt(till.paid! - till.total!), { className: "flex justify-between gap-2 font-bold", "data-receipt-change": true })}
            </ul>
          </div>
        ) : (
          <p className="receipt-waiting">{r.receiptWaiting}</p>
        )}
      </div>
    </section>
  );
}
