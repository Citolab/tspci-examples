import { useEffect, useRef, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import NutritionLabel from "./label";
import {
  AmountUnit, DECIMALS, Entry, Mode, Nutrient, Plan, Product, UNIT, addEntry, composition, formatNumber, gramsOf, nutrientsOf,
  parseNumber, percentOf, round, totals,
} from "./nutrition";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";

// The candidate's view: the products with their labels and, in compose and tool mode, the meal with its running
// totals against the reference intakes; in select mode a choice of one product.

export type ViewSettings = {
  mode: Mode;
  amountUnit: AmountUnit;
  showTotals: boolean;
  showBars: boolean;
  showPortion: boolean;
  showExtras: boolean;
  labelsOpen: boolean;
  language: string;
};

const button = "inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-40";
const primary = `${button} border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800`;
const secondary = `${button} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
const field = "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-700/30 aria-[invalid=true]:border-rose-600 aria-[invalid=true]:bg-rose-50";

/** What the candidate may type in an amount: digits, and one decimal point or comma with at most two decimals. */
export const AMOUNT = /^\d{0,4}([.,]\d{0,2})?$/;

const amountText = (amount: number, language: string) => formatNumber(amount, language, 2);

/** Refuses what would not make an amount, before it is in the field. */
const guard = (onRefuse: () => void) => (e: InputEvent) => {
  const input = e.target as HTMLInputElement;
  if (!e.inputType?.startsWith("insert")) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const next = input.value.slice(0, start) + (e.data ?? "") + input.value.slice(end);
  if (!AMOUNT.test(next)) {
    e.preventDefault();
    onRefuse();
  }
};

const GroupChip = ({ product, texts }: { product: Product; texts: Texts }) =>
  product.group ? (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${product.group === "outside" ? "border-dashed border-slate-400 text-slate-600" : "border-emerald-700/40 bg-emerald-50 text-emerald-900"}`}
      title={texts.group[product.group]} data-testid={`group-${product.id}`}>
      <span aria-hidden="true">{product.group === "outside" ? "○" : "●"}</span>
      <span className="sr-only">Schijf van Vijf: </span>{texts.groupShort[product.group]}
    </span>
  ) : null;

const ProductCard = ({ product, plan, settings, texts, uid, open, onToggle, readOnly, selected, onSelect, onAdd, onRefuse }: {
  product: Product;
  plan: Plan;
  settings: ViewSettings;
  texts: Texts;
  uid: string;
  open: boolean;
  onToggle: () => void;
  readOnly: boolean;
  selected: boolean;
  onSelect: () => void;
  onAdd: (entry: Entry) => void;
  onRefuse: (message: string) => void;
}) => {
  const lang = settings.language;
  const canPortion = product.portion > 0 && settings.amountUnit !== "grams";
  const canGrams = settings.amountUnit !== "portions" || !canPortion;
  const [unit, setUnit] = useState<"g" | "portion">(canPortion ? "portion" : "g");
  const [text, setText] = useState(canPortion ? "1" : "100");
  useEffect(() => {
    if (unit === "portion" && !canPortion) { setUnit("g"); setText("100"); }
    if (unit === "g" && !canGrams) { setUnit("portion"); setText("1"); }
  }, [canPortion, canGrams]);
  const amount = parseNumber(text, lang === "nl" ? "," : ".");
  const bad = amount === null || amount <= 0;
  const labelId = `${uid}-label-${product.id}`;
  const nameId = `${uid}-name-${product.id}`;
  const add = () => {
    if (bad) return onRefuse(texts.status.badAmount);
    onAdd({ product: product.id, amount: round(amount!, 2), unit });
  };
  const select = settings.mode === "select";
  return (
    <li className={`flex min-w-0 flex-col gap-2 rounded-xl border bg-white p-3 shadow-sm ${open && !select ? "@lg:col-span-2" : ""} ${select && selected ? "border-sky-700 ring-2 ring-sky-700" : "border-slate-200"}`}
      data-testid={`product-${product.id}`}>
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <h3 id={nameId} className="m-0 mr-auto text-[15px] font-semibold text-slate-900">{product.name}</h3>
        <GroupChip product={product} texts={texts} />
      </div>
      {product.portion > 0 && <p className="m-0 text-xs text-slate-600">{texts.portionOf(product.portionLabel, formatNumber(product.portion, lang, 1))}</p>}
      <button type="button" className="self-start text-sm font-medium text-sky-800 underline decoration-sky-800/40 underline-offset-2 hover:decoration-sky-800"
        aria-label={`${texts.openLabel}: ${product.name}`} aria-expanded={open} aria-controls={labelId} onClick={onToggle} data-testid={`toggle-${product.id}`}>
        <span aria-hidden="true" className="inline-block w-3">{open ? "▾" : "▸"}</span> {open ? texts.hideLabel : texts.openLabel}
      </button>
      {open && (
        <div className="overflow-x-auto">
          <NutritionLabel id={labelId} product={product} nutrients={nutrientsOf([product], settings.showExtras)} reference={plan.reference}
            showPortion={settings.showPortion} language={lang} texts={texts} />
        </div>
      )}
      {select ? (
        <label className={`mt-auto inline-flex cursor-pointer items-center gap-2 self-start rounded-lg border px-3 py-1.5 text-sm font-medium ${selected ? "border-sky-700 bg-sky-50 text-sky-900" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
          <input type="radio" name={`${uid}-choice`} value={product.id} checked={selected} disabled={readOnly} className="size-4 accent-sky-700"
            onChange={onSelect}  data-testid={`choose-${product.id}`} />
          {selected ? <><span aria-hidden="true">✓</span> {texts.chosen}</> : texts.choose}
          <span className="sr-only">{product.name}</span>
        </label>
      ) : !readOnly && (
        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          <input type="text" inputMode="decimal" value={text} className={`${field} w-20 text-right tabular-nums`} aria-label={texts.amountOf(product.name)}
            aria-invalid={bad} data-testid={`amount-${product.id}`}
            onBeforeInput={guard(() => onRefuse(texts.status.onlyNumbers)) as any}
            onInput={(e) => setText((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} />
          {canPortion && canGrams ? (
            <select className={field} value={unit} aria-label={texts.unitOf(product.name)} data-testid={`unit-${product.id}`}
              onChange={(e) => {
                const next = (e.target as HTMLSelectElement).value as "g" | "portion";
                setUnit(next);
                setText(next === "portion" ? "1" : amountText(product.portion, lang));
              }}>
              <option value="g">{texts.gramsLong}</option>
              <option value="portion">{texts.portions(amount ?? 2)}</option>
            </select>
          ) : (
            <span className="text-sm text-slate-600">{unit === "g" ? texts.gramsLong : texts.portions(amount ?? 2)}</span>
          )}
          <button type="button" className={primary} onClick={add} aria-label={texts.addTo(product.name)} data-testid={`add-${product.id}`}>
            <span aria-hidden="true">+</span> {texts.add}
          </button>
        </div>
      )}
    </li>
  );
};

/** A line of the meal: the amount stays editable, in its own unit. */
const MealLine = ({ entry, product, settings, texts, readOnly, onChange, onRemove, onRefuse }: {
  entry: Entry;
  product: Product;
  settings: ViewSettings;
  texts: Texts;
  readOnly: boolean;
  onChange: (entry: Entry) => void;
  onRemove: () => void;
  onRefuse: (message: string) => void;
}) => {
  const lang = settings.language;
  const [text, setText] = useState(amountText(entry.amount, lang));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(amountText(entry.amount, lang));
  }, [entry.amount, entry.unit, lang]);
  const amount = parseNumber(text, lang === "nl" ? "," : ".");
  const bad = amount === null || amount <= 0;
  const grams = gramsOf(entry, product);
  const kj = totals({ [product.id]: grams }, [product]).energyKj ?? 0;
  const canSwitch = product.portion > 0 && settings.amountUnit === "both";
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 border-b border-slate-200 py-2 last:border-b-0" data-testid={`line-${product.id}`}>
      <span className="min-w-0 font-medium text-slate-900">{product.name}</span>
      <span className="text-right text-xs text-slate-600 tabular-nums">{formatNumber(kj, lang, 0)} kJ</span>
      <div className="col-span-2 flex flex-wrap items-center gap-1.5">
        {readOnly ? (
          <span className="tabular-nums" data-testid={`line-amount-${product.id}`}>{amountText(entry.amount, lang)} {entry.unit === "g" ? texts.grams : texts.portions(entry.amount)}</span>
        ) : (
          <>
            <input type="text" inputMode="decimal" value={text} className={`${field} w-20 py-1 text-right tabular-nums`} aria-label={texts.amountInMeal(product.name)}
              aria-invalid={bad} data-testid={`line-amount-${product.id}`}
              onFocus={() => (editing.current = true)}
              onBlur={() => { editing.current = false; setText(amountText(entry.amount, lang)); }}
              onBeforeInput={guard(() => onRefuse(texts.status.onlyNumbers)) as any}
              onInput={(e) => {
                const t = (e.target as HTMLInputElement).value;
                setText(t);
                const n = parseNumber(t, lang === "nl" ? "," : ".");
                if (n !== null && n > 0 && n !== entry.amount) onChange({ ...entry, amount: round(n, 2) });
              }} />
            {canSwitch ? (
              <select className={`${field} py-1`} value={entry.unit} aria-label={texts.unitInMeal(product.name)} data-testid={`line-unit-${product.id}`}
                onChange={(e) => {
                  const unit = (e.target as HTMLSelectElement).value as "g" | "portion";
                  const amount = unit === "g" ? grams : round(grams / product.portion, 2);
                  onChange({ product: product.id, unit, amount: amount > 0 ? amount : 1 });
                }}>
                <option value="g">{texts.gramsLong}</option>
                <option value="portion">{texts.portions(entry.amount)}</option>
              </select>
            ) : (
              <span className="text-sm text-slate-600">{entry.unit === "g" ? texts.gramsLong : texts.portions(entry.amount)}</span>
            )}
          </>
        )}
        {entry.unit === "portion" && <span className="text-xs text-slate-600 tabular-nums">= {formatNumber(grams, lang, 1)} g</span>}
        {!readOnly && (
          <button type="button" className="ml-auto grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-800 focus-visible:outline-2 focus-visible:outline-sky-700"
            aria-label={texts.remove(product.name)} title={texts.remove(product.name)} onClick={onRemove} data-testid={`remove-${product.id}`}>
            <span aria-hidden="true" className="text-lg leading-none">×</span>
          </button>
        )}
      </div>
    </li>
  );
};

/** The totals of the meal as a table, with a bar per nutrient against its reference intake. */
const Totals = ({ plan, sums, settings, texts }: { plan: Plan; sums: Partial<Record<Nutrient, number>>; settings: ViewSettings; texts: Texts }) => {
  const lang = settings.language;
  const ri = plan.reference.values;
  const rows = nutrientsOf(plan.products, settings.showExtras);
  const value = (n: Nutrient) => `${formatNumber(sums[n] ?? 0, lang, DECIMALS[n], false)} ${UNIT[n]}`;
  return (
    <table className="w-full border-collapse text-sm tabular-nums" data-testid="totals">
      <caption className="pb-1 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">{texts.totals}</caption>
      <thead>
        <tr className="border-b border-slate-300 text-xs text-slate-600">
          <th scope="col" className="py-1 pr-2 text-left font-medium"><span className="sr-only">{texts.nutritionInformation}</span></th>
          <th scope="col" className="px-2 py-1 text-right font-medium">{texts.total}</th>
          <th scope="col" className="py-1 pl-2 text-left font-medium"><abbr title={texts.reference} className="no-underline">{texts.percent}</abbr></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((n) => {
          const pct = percentOf(sums[n] ?? 0, n, ri);
          const over = pct !== null && pct > 100;
          return (
            <tr key={n} className="border-b border-slate-100" data-testid={`total-${n}`}>
              <th scope="row" className="py-1 pr-2 text-left font-normal text-slate-700">{texts.nutrientShort[n]}</th>
              <td className="px-2 py-1 text-right whitespace-nowrap text-slate-900">{value(n)}</td>
              <td className="w-1/2 py-1 pl-2">
                {pct === null ? <span className="text-slate-400">–</span> : (
                  <div className="flex items-center gap-2">
                    {settings.showBars && (
                      <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-300 ring-inset" aria-hidden="true">
                        <div className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${over ? "nl-over" : "bg-[#0072B2]"}`}
                          style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    )}
                    <span className={`w-14 shrink-0 text-right whitespace-nowrap ${over ? "font-semibold text-[#A33F00]" : "text-slate-700"}`}>
                      {over && <span aria-hidden="true">▲ </span>}{pct}%{over && <span className="sr-only"> ({texts.above})</span>}
                    </span>
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

let instances = 0;

const Interaction = ({ prompt, plan, settings, store, texts, readOnly }: {
  prompt: string;
  plan: Plan;
  settings: ViewSettings;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  readOnly: boolean;
}) => {
  const { entries, selected } = useStore(store);
  const [uid] = useState(() => `nl${++instances}`);
  const select = settings.mode === "select";
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(plan.products.map((p) => [p.id, settings.labelsOpen || select])));
  const [status, setStatus] = useState("");
  const [hint, setHint] = useState("");
  const lang = settings.language;
  const products = plan.products;
  const comp = composition(entries, products);
  const sums = totals(comp, products);
  const kj = (c: Record<string, number>) => formatNumber(totals(c, products).energyKj ?? 0, lang, 0);
  const amountLabel = (e: Entry) => `${amountText(e.amount, lang)} ${e.unit === "g" ? texts.grams : texts.portions(e.amount)}`;
  const setEntries = (next: Entry[]) => store.dispatch({ type: "SET_ENTRIES", payload: { entries: next } });
  const name = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const refuse = (message: string) => { setHint(message); setStatus(message); };
  const allOpen = products.every((p) => open[p.id]);
  const pctEnergy = percentOf(sums.energyKj ?? 0, "energyKj", plan.reference.values);

  return (
    <div className="@container flex max-w-full flex-col gap-3 font-sans text-slate-800" data-testid="root">
      {prompt && <p className="m-0 max-w-[75ch] text-[15px] text-slate-800" data-testid="prompt">{prompt}</p>}
      <p className="m-0 max-w-[75ch] text-xs text-slate-600">{readOnly ? texts.readOnly : select ? texts.helpSelect : texts.help}</p>
      <div className={`grid items-start gap-4 ${select ? "" : "@3xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]"}`}>
        <section className="flex min-w-0 flex-col gap-2" aria-labelledby={`${uid}-products`}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`${uid}-products`} className="m-0 mr-auto text-sm font-semibold tracking-wide text-slate-600 uppercase">{texts.products}</h2>
            <button type="button" className="text-xs font-medium text-sky-800 underline underline-offset-2" data-testid="toggle-all"
              onClick={() => setOpen(Object.fromEntries(products.map((p) => [p.id, !allOpen])))}>
              {allOpen ? texts.hideAll : texts.openAll}
            </button>
          </div>
          <div role={select ? "radiogroup" : undefined} aria-labelledby={select ? `${uid}-products` : undefined}><ul
            className={`m-0 grid list-none items-start gap-3 p-0 ${select ? "@lg:grid-cols-2 @4xl:grid-cols-3" : "@lg:grid-cols-2"}`}>
            {products.map((p) => (
              <ProductCard key={p.id} product={p} plan={plan} settings={settings} texts={texts} uid={uid} open={!!open[p.id]} readOnly={readOnly}
                onToggle={() => setOpen({ ...open, [p.id]: !open[p.id] })} selected={selected === p.id}
                onSelect={() => { store.dispatch({ type: "SELECT", payload: { product: p.id } }); setStatus(texts.status.chosen(p.name)); }}
                onRefuse={refuse}
                onAdd={(entry) => {
                  const next = addEntry(entries, products, entry);
                  setEntries(next);
                  setHint("");
                  setStatus(texts.status.added(amountLabel(entry), p.name, kj(composition(next, products))));
                }} />
            ))}
          </ul></div>
        </section>

        {!select && (
          <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 @3xl:sticky @3xl:top-2" aria-labelledby={`${uid}-meal`}>
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 id={`${uid}-meal`} className="m-0 mr-auto text-base font-semibold text-slate-900">{texts.meal}</h2>
              <span className="text-xs text-slate-600" data-testid="count">{texts.products1(Object.keys(comp).length)}</span>
            </div>
            {entries.length === 0 ? (
              <p className="m-0 text-sm text-slate-600">{texts.mealEmpty}</p>
            ) : (
              <ul className="m-0 list-none rounded-lg bg-white px-3 p-0 ring-1 ring-slate-200" data-testid="meal">
                {entries.map((e) => {
                  const product = products.find((p) => p.id === e.product);
                  if (!product) return null;
                  return (
                    <MealLine key={e.product} entry={e} product={product} settings={settings} texts={texts} readOnly={readOnly} onRefuse={refuse}
                      onChange={(changed) => {
                        const next = entries.map((x) => (x.product === e.product ? changed : x));
                        setEntries(next);
                        setHint("");
                        setStatus(texts.status.changed(product.name, amountLabel(changed), kj(composition(next, products))));
                      }}
                      onRemove={() => {
                        const next = entries.filter((x) => x.product !== e.product);
                        setEntries(next);
                        setStatus(texts.status.removed(product.name, kj(composition(next, products))));
                      }} />
                  );
                })}
              </ul>
            )}
            {hint && <p className="m-0 text-xs font-medium text-rose-800" data-testid="hint"><span aria-hidden="true">⚠ </span>{hint}</p>}
            {!readOnly && entries.length > 0 && (
              <button type="button" className={`${secondary} self-start`} data-testid="clear"
                onClick={() => { setEntries([]); setStatus(texts.status.cleared); }}>{texts.clear}</button>
            )}
            {settings.showTotals && (
              <>
                <p className="m-0 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200" data-testid="energy">
                  <span className="block text-xs text-slate-600">{texts.nutrient.energyKj}</span>
                  <span className="block text-lg font-semibold text-slate-900 tabular-nums">
                    {formatNumber(sums.energyKj ?? 0, lang, 0)} kJ / {formatNumber(sums.energyKcal ?? 0, lang, 0)} kcal
                  </span>
                  {pctEnergy !== null && <span className="block text-xs text-slate-600">{texts.energyShare(String(pctEnergy))}</span>}
                </p>
                <Totals plan={plan} sums={sums} settings={settings} texts={texts} />
                <p className="m-0 text-[11px] text-slate-600">
                  {texts.riFootnote(texts.target[plan.reference.group], plan.reference.values.energyKj ? formatNumber(plan.reference.values.energyKj, lang, 0) : "",
                    plan.reference.values.energyKcal ? formatNumber(plan.reference.values.energyKcal, lang, 0) : "").replace(/^\*/, "%RI: ")}
                </p>
              </>
            )}
          </section>
        )}
      </div>
      <div role="status" aria-live="polite" className="sr-only" data-testid="status">{status}</div>
    </div>
  );
};

export default Interaction;
