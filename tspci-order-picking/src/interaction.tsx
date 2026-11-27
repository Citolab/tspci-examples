/*
 * What the pupil sees. The pick task: the pick list, the warehouse from above (map.tsx) next to the shelves of the rack
 * they are at, and the roll cage. They go to a rack, take units from a shelf with + (and put them back with −), tick
 * the line, and with stock on report a shortage. The check task: a picked roll cage with a tote for every line, and the
 * pick list on which the pupil judges every tote: right, wrong article, wrong number, or missing.
 */
import { useMemo, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import {
  DISPATCH,
  OrderLine,
  Product,
  Settings,
  VERDICTS,
  Verdict,
  Warehouse,
  aisleLetter,
  distance,
  parseRack,
  productAt,
  rackPosition,
  stockOf,
  walkLength,
  walkPoints,
} from "./picking";
import { WarehouseMap } from "./map";
import { ProductBox, ProductPicture } from "./pictures";
import { Actions, StateModel } from "./store";
import type { Texts } from "./texts";

type Props = {
  title?: string;
  question?: string;
  w: Warehouse;
  settings: Settings;
  store: IStore<StateModel, Actions>;
  readOnly: boolean; // review, solution, closed: show the answer, but do not change it
  t: Texts;
};

let instances = 0;

/** A button that disables itself moves the focus to its partner first (AGENTS.md), after the key event. */
const focusLater = (element: Element | null | undefined) => setTimeout(() => (element as HTMLElement | null)?.focus(), 0);

const Interaction = ({ title, question, w, settings, store, readOnly, t }: Props) => {
  const state = useStore(store); // re-renders when the store changes
  const [message, setMessage] = useState("");
  const id = useMemo(() => `picking-${++instances}`, []);
  const instruction =
    settings.task === "check"
      ? t.instruction.check
      : [t.instruction.pick, settings.route && t.instruction.route, settings.stock && t.instruction.stock].filter(Boolean).join(" ");

  return (
    <div className="picking @container font-sans text-ink">
      {title?.trim() && <h2 className="text-[1.5em] leading-tight font-bold">{title}</h2>}
      <p className="mt-1 mb-3 leading-relaxed">{question?.trim() || instruction}</p>
      {settings.task === "check" ? (
        <CheckView w={w} state={state} store={store} readOnly={readOnly} t={t} id={id} say={setMessage} />
      ) : (
        <PickView w={w} settings={settings} state={state} store={store} readOnly={readOnly} t={t} say={setMessage} />
      )}
      <p className="sr-only" aria-live="polite" role="status">
        {message}
      </p>
    </div>
  );
};

export default Interaction;

type ViewProps = { w: Warehouse; state: StateModel; store: IStore<StateModel, Actions>; readOnly: boolean; t: Texts; say: (message: string) => void };

// ---- the pick task ----

function PickView({ w, settings, state, store, readOnly, t, say }: ViewProps & { settings: Settings }) {
  const at = state.walk[state.walk.length - 1];
  const go = (rack: string) => {
    store.dispatch({ type: "GO", payload: { rack } });
    say(t.wentTo(rack));
  };
  const walked = walkLength(w, state.walk);
  const back = at ? distance(w, at, DISPATCH) : 0;

  return (
    <div className="flex flex-col gap-4">
      <PickList w={w} settings={settings} state={state} store={store} readOnly={readOnly} t={t} say={say} />
      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="panel" aria-label={t.warehouse}>
          <WarehouseMap layout={w} t={t} at={at} path={settings.route ? walkPoints(w, state.walk) : undefined} onGo={readOnly ? undefined : go} />
          <p className="mt-1 text-sm text-slate-600">{readOnly ? "" : t.mapHint}</p>
          {settings.route && (
            <p className="mt-1 font-semibold" data-testid="walked">
              {at ? t.walked(walked - back, back) : t.atDispatch}
            </p>
          )}
        </section>
        <ShelfView w={w} settings={settings} at={at} state={state} store={store} readOnly={readOnly} t={t} say={say} />
      </div>
      <CartView w={w} state={state} t={t} />
    </div>
  );
}

const lineProduct = (w: Warehouse, line: OrderLine) => productAt(w, line.loc);

function PickList({ w, settings, state, store, readOnly, t, say }: ViewProps & { settings: Settings }) {
  return (
    <section className="panel @container" aria-labelledby="pick-list-title">
      <OrderHeader w={w} t={t} />
      <div className="overflow-x-auto">
        <table className="pick-list w-full">
          <thead>
            <tr>
              <th scope="col">{t.done}</th>
              <th scope="col" className="hidden @xl:table-cell">
                {t.line}
              </th>
              <th scope="col">{t.location}</th>
              <th scope="col" className="hidden @xl:table-cell">
                {t.article}
              </th>
              <th scope="col">{t.description}</th>
              <th scope="col" className="hidden text-right @xl:table-cell">
                {t.quantity}
              </th>
              <th scope="col" className="hidden @xl:table-cell">
                {t.unit}
              </th>
              {settings.stock && <th scope="col">{t.shortage}</th>}
            </tr>
          </thead>
          <tbody>
            {w.order.lines.map((line, i) => {
              const n = i + 1;
              const product = lineProduct(w, line);
              const ticked = state.ticked.includes(n);
              const short = state.short.includes(n);
              return (
                <tr key={n} className={ticked ? "ticked" : ""}>
                  <td className="w-12">
                    <label className="tick">
                      <input
                        type="checkbox"
                        checked={ticked}
                        disabled={readOnly}
                        aria-label={t.tick(n)}
                        onChange={(e) => {
                          const on = e.currentTarget.checked;
                          store.dispatch({ type: "TICK", payload: { line: n, on } });
                          say(t.ticked(n, on));
                        }}
                      />
                    </label>
                  </td>
                  <td className="hidden @xl:table-cell">{n}</td>
                  <td>
                    <span className="code">{line.loc}</span>
                  </td>
                  <td className="hidden tabular-nums @xl:table-cell">{product?.article}</td>
                  <td>
                    <span className="line-name">{product?.name}</span>
                    {/* narrow: the line, the number, the unit and the article number under the description */}
                    <span className="block text-sm text-slate-600 @xl:hidden">
                      {t.line} {n} · <strong className="text-base text-ink tabular-nums">{line.qty}</strong> × {product?.unit} · {product?.article}
                    </span>
                  </td>
                  <td className="hidden text-right text-[1.15em] font-bold tabular-nums @xl:table-cell">{line.qty}</td>
                  <td className="hidden @xl:table-cell">{product?.unit}</td>
                  {settings.stock && (
                    <td>
                      <button
                        type="button"
                        className={`short-button ${short ? "on" : ""}`}
                        aria-pressed={short}
                        aria-label={t.reportShort(n)}
                        disabled={readOnly}
                        onClick={() => {
                          store.dispatch({ type: "SHORT", payload: { line: n, on: !short } });
                          say(t.reported(n, !short));
                        }}
                      >
                        <span aria-hidden="true">{short ? "! " : ""}</span>
                        {t.short}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OrderHeader({ w, t }: { w: Warehouse; t: Texts }) {
  return (
    <h3 id="pick-list-title" className="mb-2 flex flex-wrap items-baseline gap-x-3 text-[1.15em] font-bold">
      <span>{t.pickList}</span>
      {w.order.number && <span className="font-semibold text-slate-600">{t.order(w.order.number)}</span>}
      {w.order.for && <span className="font-normal text-slate-600">{t.forWhom(w.order.for)}</span>}
    </h3>
  );
}

function ShelfView({ w, settings, at, state, store, readOnly, t, say }: ViewProps & { settings: Settings; at?: string }) {
  const rack = at ? parseRack(at) : undefined;
  if (!at || !rack) {
    return (
      <section className="panel flex items-center justify-center text-center text-slate-600" data-testid="shelves">
        <p className="max-w-[18em]">{t.noRack}</p>
      </section>
    );
  }
  const side = rackPosition(rack.rack).side;
  const shelves = Array.from({ length: w.shelves }, (_, i) => w.shelves - i); // the top shelf on top
  return (
    <section className="panel" aria-labelledby="rack-title" data-testid="shelves">
      <h3 id="rack-title" className="text-[1.15em] font-bold">
        {t.rack(at)}
      </h3>
      <p className="mb-2 text-sm text-slate-600">{t.rackSide(aisleLetter(rack.aisle), side)}</p>
      <ul className="rack-front">
        {shelves.map((shelf) => {
          const loc = `${at}-${shelf}`;
          const product = productAt(w, loc);
          return (
            <li key={loc} className="shelf" data-loc={loc}>
              {product ? (
                <ShelfProduct product={product} settings={settings} taken={state.cart[loc] ?? 0} store={store} readOnly={readOnly} t={t} say={say} />
              ) : (
                <>
                  <span className="code">{loc}</span>
                  <span className="text-slate-500 italic">{t.empty}</span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ShelfProduct({
  product,
  settings,
  taken,
  store,
  readOnly,
  t,
  say,
}: {
  product: Product;
  settings: Settings;
  taken: number;
  store: IStore<StateModel, Actions>;
  readOnly: boolean;
  t: Texts;
  say: (m: string) => void;
}) {
  const max = stockOf(settings, product);
  const what = `${product.loc} ${product.name}`;
  const take = (delta: 1 | -1, button: HTMLButtonElement) => {
    const next = Math.max(0, Math.min(max, taken + delta));
    if (next === taken) return;
    store.dispatch({ type: "TAKE", payload: { loc: product.loc, delta, max } });
    say(t.took(next, product.name));
    // − at 0 and + at the stock disable themselves: the focus goes to the other one
    const stepper = button.closest(".stepper");
    if (delta === -1 && next === 0) focusLater(stepper?.querySelector("[data-take]"));
    if (delta === 1 && next === max) focusLater(stepper?.querySelector("[data-put-back]"));
  };
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <ProductBox picture={product.picture} article={product.article} size={60} />
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-[8em] flex-1">
          <span className="code">{product.loc}</span>
          <p className="mt-1 leading-tight font-bold">{product.name}</p>
          <p className="text-sm text-slate-600">
            {product.article} · {product.unit}
          </p>
          {settings.stock && <p className="text-sm font-semibold">{t.onShelf(product.stock - taken)}</p>}
        </div>
        <div className="stepper" role="group" aria-label={`${t.inCart}: ${what}`}>
          <button
            type="button"
            className="step"
            data-put-back=""
            aria-label={t.putBack(what)}
            disabled={readOnly || taken === 0}
            onClick={(e) => take(-1, e.currentTarget)}
          >
            −
          </button>
          <output className="count" aria-label={`${t.inCart}: ${taken}`}>
            {taken}
          </output>
          <button
            type="button"
            className="step"
            data-take=""
            aria-label={t.take(what)}
            disabled={readOnly || taken >= max}
            onClick={(e) => take(1, e.currentTarget)}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

function CartView({ w, state, t }: { w: Warehouse; state: StateModel; t: Texts }) {
  const items = Object.entries(state.cart)
    .filter(([, qty]) => qty > 0)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return (
    <section className="panel cart" aria-labelledby="cart-title" data-testid="cart">
      <h3 id="cart-title" className="mb-2 flex items-center gap-2 text-[1.15em] font-bold">
        <CageIcon />
        {t.cart}
      </h3>
      {items.length === 0 ? (
        <p className="text-slate-600">{t.cartEmpty}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {items.map(([loc, qty]) => {
            const product = productAt(w, loc);
            return (
              <li key={loc} className="cart-item">
                {product && <ProductPicture picture={product.picture} size={30} />}
                <span>
                  <strong className="tabular-nums">{qty} ×</strong> {product?.name}{" "}
                  <span className="text-sm text-slate-600">
                    ({product?.unit}) · {product?.article} · {t.from(loc)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const CageIcon = () => (
  <svg viewBox="0 0 26 28" width="26" height="28" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="24" height="20" rx="2" fill="#e5e7eb" stroke="#374151" stroke-width="2" />
    <path d="M1 8h24M1 14h24M9 1v20M17 1v20" stroke="#374151" stroke-width="1.2" />
    <circle cx="6" cy="24.5" r="2.5" fill="#374151" />
    <circle cx="20" cy="24.5" r="2.5" fill="#374151" />
  </svg>
);

// ---- the check task ----

const VERDICT_SIGN: Record<Verdict, string> = { ok: "✓", article: "≠", quantity: "#", missing: "∅" };

function CheckView({ w, state, store, readOnly, t, id, say }: ViewProps & { id: string }) {
  return (
    <div className="flex flex-col gap-4">
      <section className="panel" aria-label={t.totes} data-testid="totes">
        <h3 className="mb-2 flex items-center gap-2 text-[1.15em] font-bold">
          <CageIcon />
          {t.cart}
        </h3>
        <ul className="cage">
          {w.order.lines.map((_, i) => {
            const tote = w.cart[i];
            const product = tote ? productAt(w, tote.loc) : undefined;
            return (
              <li key={i} className={`tote ${product ? "" : "tote-empty"}`} aria-label={t.tote(i + 1)}>
                <span className="tote-number">{t.tote(i + 1)}</span>
                {tote && product ? (
                  <div className="flex items-center gap-2">
                    <ProductBox picture={product.picture} article={product.article} size={48} />
                    <div className="min-w-0">
                      <p className="leading-tight font-bold">{product.name}</p>
                      <p className="text-sm text-slate-600">{product.article}</p>
                      <p>
                        <strong className="text-[1.15em] tabular-nums">{tote.qty}</strong> × {product.unit}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500 italic">{t.toteEmpty}</p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel" aria-labelledby="pick-list-title">
        <OrderHeader w={w} t={t} />
        <ol className="flex flex-col gap-2">
          {w.order.lines.map((line, i) => {
            const n = i + 1;
            const product = lineProduct(w, line);
            const verdict = state.verdicts[i] ?? "";
            return (
              <li key={n} className="check-line">
                <p className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-bold">
                    {t.line} {n}
                  </span>
                  <span className="code">{line.loc}</span>
                  <span className="tabular-nums">{product?.article}</span>
                  <span className="font-semibold">{product?.name}</span>
                  <span>
                    <strong className="text-[1.15em] tabular-nums">{line.qty}</strong> × {product?.unit}
                  </span>
                </p>
                <div role="radiogroup" aria-label={t.yourCheck(n)} className="mt-2 flex flex-wrap gap-2">
                  {VERDICTS.map((v) => (
                    <label key={v} className={`verdict ${verdict === v ? "chosen" : ""} ${readOnly ? "read-only" : ""}`}>
                      <input
                        type="radio"
                        name={`${id}-line-${n}`}
                        value={v}
                        checked={verdict === v}
                        disabled={readOnly}
                        onChange={() => {
                          store.dispatch({ type: "VERDICT", payload: { line: n, verdict: v } });
                          say(`${t.line} ${n}: ${t.verdict[v]}`);
                        }}
                      />
                      <span aria-hidden="true" className="verdict-sign">
                        {VERDICT_SIGN[v]}
                      </span>
                      {t.verdict[v]}
                    </label>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
