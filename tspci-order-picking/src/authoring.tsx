/*
 * The authoring mode (index.tsx getAuthoringInstance): the item author makes the warehouse (aisles, racks on each side,
 * shelves, a corridor at the back), clicks a rack on the map to put products on its shelves, writes the pick list and
 * fills the roll cage of the check task. Below: the shortest route, the lines that run short, the check of every tote,
 * and what keeps Done from finishing. It writes the setting `warehouse`.
 */
import { useState } from "preact/hooks";
import {
  LIMITS, PICTURES, Picture, Product, Settings, Tote, Warehouse, aisleLetter, inLayout, isNote, isShort, normalizeWarehouse, parseRack,
  rackInLayout, rackOf, rackPosition, shortestRoute, toteVerdict, warehouseProblems,
} from "./picking";
import { WarehouseMap } from "./map";
import { ProductPicture } from "./pictures";
import { Language, TEXTS, Texts } from "./texts";

/** The problems of the author's warehouse in their language; the notes (no shortage, no mistake) do not keep Done from finishing. */
export function authoredProblems(w: Warehouse, settings: Settings, language: Language, notes = false): string[] {
  const t = TEXTS[language].problems;
  return warehouseProblems(w, settings)
    .filter((problem) => notes || !isNote(problem))
    .map((problem) => {
      switch (problem.code) {
        case "emptyLocation":
        case "sameArticle":
        case "emptyTote":
          return t[problem.code](problem.line);
        case "noArticle":
          return t.noArticle(problem.loc);
        case "outside":
          return t.outside(problem.count);
        default:
          return t[problem.code]();
      }
    });
}

const PICTURE_NAMES: Record<Language, Record<Picture, string>> = {
  en: {
    paper: "paper", pen: "pen", marker: "marker", glue: "glue stick", notebook: "notebook", binder: "binder", scissors: "scissors", roll: "roll",
    towel: "towels", bottle: "bottle", spray: "spray", gloves: "gloves", bag: "bag", cup: "cup", battery: "battery", tape: "tape", box: "box",
  },
  nl: {
    paper: "papier", pen: "pen", marker: "stift", glue: "lijmstift", notebook: "schrift", binder: "ordner", scissors: "schaar", roll: "rol",
    towel: "handdoekjes", bottle: "fles", spray: "spray", gloves: "handschoenen", bag: "zak", cup: "beker", battery: "batterij", tape: "plakband",
    box: "doos",
  },
};

type Props = { initial: Warehouse; settings: Settings; language: Language; onChange: (w: Warehouse) => void };

export function Authoring({ initial, settings, language, onChange }: Props) {
  const [w, setW] = useState(initial);
  const [rack, setRack] = useState<string | undefined>(undefined);
  const t = TEXTS[language];
  const change = (next: Partial<Warehouse>) => {
    const value = { ...w, ...next };
    setW(value);
    onChange(value);
  };
  const setProduct = (loc: string, product: Partial<Product> | null) => {
    const others = w.products.filter((p) => p.loc !== loc);
    if (!product) return change({ products: others });
    const before = w.products.find((p) => p.loc === loc) ?? { loc, article: "", name: "", unit: "", picture: "box" as Picture, stock: 10 };
    change({ products: [...others, { ...before, ...product }].sort((a, b) => (a.loc < b.loc ? -1 : 1)) });
  };

  const counts: Record<string, number> = {};
  for (const p of w.products) if (inLayout(w, p.loc)) counts[rackOf(p.loc)] = (counts[rackOf(p.loc)] ?? 0) + 1;
  const products = w.products.filter((p) => inLayout(w, p.loc));
  const problems = authoredProblems(w, settings, language, true);
  const sound = normalizeWarehouse(w);
  const selected = rack && rackInLayout(w, rack) ? rack : undefined;

  const setLines = (lines: Warehouse["order"]["lines"], cart = w.cart) => change({ order: { ...w.order, lines }, cart: lines.map((_, i) => cart[i] ?? null) });
  const setTote = (line: number, tote: Tote) => change({ cart: w.order.lines.map((_, i) => (i === line ? tote : (w.cart[i] ?? null))) });

  return (
    <div className="authoring p-5 font-sans text-ink">
      <h2 className="text-xl font-semibold tracking-tight">{t.authoringTitle}</h2>
      <p className="text-slate-600">{t.authoringIntro}</p>

      <fieldset className="panel mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
        <legend className="px-1 text-sm font-semibold tracking-wide text-slate-500 uppercase">{t.layout}</legend>
        <NumberField label={t.aisles} value={w.aisles} min={LIMITS.aisles[0]} max={LIMITS.aisles[1]} onChange={(aisles) => change({ aisles })} />
        <NumberField label={t.depth} value={w.depth} min={LIMITS.depth[0]} max={LIMITS.depth[1]} onChange={(depth) => change({ depth })} />
        <NumberField label={t.shelves} value={w.shelves} min={LIMITS.shelves[0]} max={LIMITS.shelves[1]} onChange={(shelves) => change({ shelves })} />
        <label className="flex min-h-11 cursor-pointer items-center gap-2">
          <input type="checkbox" className="h-5 w-5 accent-accent-strong" checked={w.back} onChange={(e) => change({ back: e.currentTarget.checked })} />
          {t.backCorridor}
        </label>
      </fieldset>

      <div className="mt-4 grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="panel">
          <WarehouseMap layout={w} t={t} at={selected} onGo={setRack} counts={counts} cart={false} />
        </div>
        <RackEditor rack={selected} w={w} t={t} language={language} setProduct={setProduct} />
      </div>

      <section className="panel mt-4" aria-labelledby="lines-title">
        <h3 id="lines-title" className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">
          {t.lines}
        </h3>
        <div className="mb-3 flex flex-wrap gap-4">
          <TextField label={t.orderNumber} value={w.order.number} onChange={(number) => change({ order: { ...w.order, number } })} width="8em" />
          <TextField label={t.orderFor} value={w.order.for} onChange={(name) => change({ order: { ...w.order, for: name } })} width="14em" />
        </div>
        <ol className="flex flex-col gap-2">
          {w.order.lines.map((line, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <span className="w-[4.5em] font-semibold">
                {t.line} {i + 1}
              </span>
              <LocationSelect
                label={t.lineLocation(i + 1)}
                value={line.loc}
                products={products}
                empty={t.chooseLocation}
                onChange={(loc) => setLines(w.order.lines.map((l, k) => (k === i ? { ...l, loc } : l)))}
              />
              <NumberInput
                label={t.lineQuantity(i + 1)}
                value={line.qty}
                min={1}
                max={LIMITS.qty}
                onChange={(qty) => setLines(w.order.lines.map((l, k) => (k === i ? { ...l, qty } : l)))}
              />
              <span className="w-[8em] text-sm text-slate-600">{products.find((p) => p.loc === line.loc)?.unit}</span>
              <button
                type="button"
                className="author-button ml-auto"
                aria-label={t.removeLine(i + 1)}
                title={t.removeLine(i + 1)}
                onClick={(e) => {
                  // the button goes away: the focus goes to the line that takes its place, or to Add a line
                  const list = e.currentTarget.closest("ol");
                  setLines(
                    w.order.lines.filter((_, k) => k !== i),
                    w.cart.filter((_, k) => k !== i)
                  );
                  setTimeout(() => {
                    const buttons = list?.querySelectorAll<HTMLButtonElement>("li button");
                    (buttons?.[i] ?? buttons?.[i - 1] ?? list?.parentElement?.querySelector<HTMLButtonElement>("[data-add-line]"))?.focus();
                  }, 0);
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          data-add-line=""
          className="author-button mt-3"
          disabled={w.order.lines.length >= LIMITS.lines || products.length === 0}
          onClick={() => {
            const used = new Set(w.order.lines.map((l) => l.loc));
            const free = products.find((p) => !used.has(p.loc)) ?? products[0];
            // its tote starts right: the author puts a mistake in it on purpose
            setLines([...w.order.lines, { loc: free.loc, qty: 1 }], [...w.order.lines.map((_, i) => w.cart[i] ?? null), { loc: free.loc, qty: 1 }]);
          }}
        >
          + {t.addLine}
        </button>
      </section>

      <section className="panel mt-4" aria-labelledby="cart-title">
        <h3 id="cart-title" className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
          {t.cartTitle}
        </h3>
        <p className="mb-2 text-sm text-slate-600">{t.cartIntro}</p>
        <ol className="flex flex-col gap-2">
          {w.order.lines.map((line, i) => {
            const tote = w.cart[i] ?? null;
            return (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="w-[4.5em] font-semibold">{t.tote(i + 1)}</span>
                <LocationSelect
                  label={t.toteLocation(i + 1)}
                  value={tote?.loc ?? ""}
                  products={products}
                  empty={t.emptyTote}
                  onChange={(loc) => setTote(i, loc ? { loc, qty: tote?.qty ?? line.qty } : null)}
                />
                {tote && <NumberInput label={t.toteQuantity(i + 1)} value={tote.qty} min={1} max={LIMITS.qty} onChange={(qty) => setTote(i, { ...tote, qty })} />}
                <span className="w-[9em] text-sm text-slate-600">({t.verdict[toteVerdict(w, i)]})</span>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="mt-4 rounded-lg border border-slate-200 p-3 text-sm" role="status" data-testid="authoring-status">
        {sound.order.lines.length > 0 && <p>{t.shortestRoute(shortestRoute(sound))}</p>}
        {settings.stock && settings.task === "pick" && sound.order.lines.some((l) => isShort(sound, settings, l)) && (
          <p>{t.shortLines(sound.order.lines.flatMap((l, i) => (isShort(sound, settings, l) ? [String(i + 1)] : [])).join(", "))}</p>
        )}
        {problems.length ? (
          <ul className="mt-1 list-disc pl-5 text-red-700">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : (
          <p className="text-accent-strong">{t.ready}</p>
        )}
      </div>
    </div>
  );
}

function RackEditor({
  rack, w, t, language, setProduct,
}: { rack?: string; w: Warehouse; t: Texts; language: Language; setProduct: (loc: string, product: Partial<Product> | null) => void }) {
  const r = rack ? parseRack(rack) : undefined;
  if (!rack || !r) {
    return (
      <div className="panel flex items-center justify-center text-center text-slate-600">
        <p className="max-w-[18em]">{t.pickARack}</p>
      </div>
    );
  }
  const shelves = Array.from({ length: w.shelves }, (_, i) => w.shelves - i);
  return (
    <section className="panel" aria-labelledby="rack-editor-title" data-testid="rack-editor">
      <h3 id="rack-editor-title" className="font-bold">
        {t.shelvesOf(rack)}
      </h3>
      <p className="mb-2 text-sm text-slate-600">{t.rackSide(aisleLetter(r.aisle), rackPosition(r.rack).side)}</p>
      <ul className="flex flex-col gap-3">
        {shelves.map((shelf) => {
          const loc = `${rack}-${shelf}`;
          const product = w.products.find((p) => p.loc === loc);
          return (
            <li key={loc} className="rounded-lg border border-slate-200 bg-white p-2">
              <div className="flex items-center gap-2">
                <span className="code">{loc}</span>
                {product ? (
                  <>
                    <ProductPicture picture={product.picture} size={28} />
                    <button type="button" className="author-button ml-auto" aria-label={t.removeProduct(loc)} title={t.removeProduct(loc)} onClick={() => setProduct(loc, null)}>
                      ×
                    </button>
                  </>
                ) : (
                  <button type="button" className="author-button ml-auto" onClick={() => setProduct(loc, {})}>
                    + {t.addProduct}
                  </button>
                )}
              </div>
              {product && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <TextField label={t.article} name={t.articleField(loc)} value={product.article} onChange={(article) => setProduct(loc, { article })} />
                  <TextField label={t.unit} name={t.unitField(loc)} value={product.unit} onChange={(unit) => setProduct(loc, { unit })} />
                  <div className="col-span-2">
                    <TextField label={t.description} name={t.nameField(loc)} value={product.name} onChange={(name) => setProduct(loc, { name })} />
                  </div>
                  <label className="flex flex-col text-sm">
                    <span className="font-semibold text-slate-600">{t.picture}</span>
                    <select
                      className="author-input"
                      aria-label={t.pictureField(loc)}
                      value={product.picture}
                      onChange={(e) => setProduct(loc, { picture: e.currentTarget.value as Picture })}
                    >
                      {PICTURES.map((p) => (
                        <option key={p} value={p}>
                          {PICTURE_NAMES[language][p]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col text-sm">
                    <span className="font-semibold text-slate-600">{t.stock}</span>
                    <NumberInput label={t.stockField(loc)} value={product.stock} min={0} max={LIMITS.stock} onChange={(stock) => setProduct(loc, { stock })} />
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LocationSelect({
  label, value, products, empty, onChange,
}: { label: string; value: string; products: Product[]; empty: string; onChange: (loc: string) => void }) {
  const known = products.some((p) => p.loc === value);
  return (
    <select className="author-input min-w-[16em] flex-1" aria-label={label} value={known ? value : ""} onChange={(e) => onChange(e.currentTarget.value)}>
      <option value="">{empty}</option>
      {products.map((p) => (
        <option key={p.loc} value={p.loc}>
          {`${p.loc} · ${p.article} ${p.name}`}
        </option>
      ))}
    </select>
  );
}

function NumberInput({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <input
      type="number"
      className="author-input w-[5.5em]"
      aria-label={label}
      inputMode="numeric"
      min={min}
      max={max}
      value={value}
      onInput={(e) => {
        const n = Math.round(Number(e.currentTarget.value));
        if (e.currentTarget.value !== "" && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
      }}
    />
  );
}

function NumberField(props: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <label className="flex flex-col text-sm">
      <span className="font-semibold text-slate-600" aria-hidden="true">
        {props.label}
      </span>
      <NumberInput {...props} />
    </label>
  );
}

function TextField({ label, name, value, onChange, width }: { label: string; name?: string; value: string; onChange: (v: string) => void; width?: string }) {
  return (
    <label className="flex flex-col text-sm" style={width ? { width } : undefined}>
      <span className="font-semibold text-slate-600" aria-hidden={name ? "true" : undefined}>
        {label}
      </span>
      <input type="text" className="author-input" aria-label={name ?? label} value={value} onInput={(e) => onChange(e.currentTarget.value)} />
    </label>
  );
}

