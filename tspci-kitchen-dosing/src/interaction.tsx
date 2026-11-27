import type { PciProperties } from "@citolab/tspci";
import { useMemo, useRef, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import configProps from "./config.json";
import {
  DosingModel, LineModel, Model, Product, RecipeModel, Unit, Work, dosageText, formatCount, formatNumber, parseNumber, pouredOf, scaleDisplay,
} from "./kitchen";
import { Bottle, Bucket, Pictogram, Pieces, Scale, Spoons } from "./drawings";
import { BeakerDrawing, Step, ToolPanel } from "./tools";
import { Actions, StateModel } from "./store";
import { PRODUCT_NAMES, SURFACE_LABELS, Texts, amountWithUnit, capital, textsFor, unitAfter, unitName } from "./texts";

type PropTypes = PciProperties<typeof configProps>;

type Props = {
  config: PropTypes;
  model: Model;
  store: IStore<StateModel, Actions>;
  readOnly: boolean; // review, solution, closed: show the work, but do not change it
};

let instances = 0;

/**
 * The PCI: a recipe to scale and measure, or a cleaning task to dose. Above it the item's title and question, and the
 * problems of the settings (for the author).
 */
const Interaction = ({ config, model, store, readOnly }: Props) => {
  const work = useStore(store); // re-renders when the store changes
  const uid = useMemo(() => `kd${++instances}`, []);
  const t = textsFor(model.language);
  return (
    <div class="kd @container font-sans text-ink">
      {config.title && <h2 class="text-[1.4em] leading-tight font-extrabold">{config.title}</h2>}
      {config.question && <p class="mt-1 leading-relaxed">{config.question}</p>}
      {model.problems.length > 0 && (
        <p role="alert" class="mt-3 rounded-lg border-2 border-amber-500 bg-amber-50 px-3 py-2 text-amber-900">
          {model.problems.map((p) => t.problems[p]).join(" ")}
        </p>
      )}
      {model.mode === "recipe" ? (
        <RecipeView model={model} work={work} store={store} t={t} uid={uid} readOnly={readOnly} />
      ) : (
        <DosingView model={model} work={work} store={store} t={t} uid={uid} readOnly={readOnly} />
      )}
    </div>
  );
};

type ViewProps<M> = { model: M; work: Work; store: IStore<StateModel, Actions>; t: Texts; uid: string; readOnly: boolean };

// ---- the recipe ----

function RecipeView({ model, work, store, t, uid, readOnly }: ViewProps<RecipeModel>) {
  const { recipe, persons, language } = model;
  const measured = model.lines.map((l, i) => ({ l, i })).filter(({ l }) => l.spec);
  return (
    <>
      <div class="task-card mt-3">
        <p class="text-[1.15em] font-bold" data-task>
          {t.makeFor(persons)}
        </p>
        <p class="mt-0.5 text-muted">{t.makeForHint}</p>
      </div>

      <div class="recipe mt-4">
        <h3 class="recipe-title" id={`${uid}-recipe`}>
          {recipe.name || t.recipe}
        </h3>
        <table class="recipe-table" aria-labelledby={`${uid}-recipe`} data-recipe>
          <thead>
            <tr>
              <th scope="col">{t.ingredient}</th>
              <th scope="col">{t.forPersons(recipe.persons)}</th>
              <th scope="col" class="target-col">
                {t.forPersons(persons)}
              </th>
            </tr>
          </thead>
          <tbody>
            {model.lines.map((l, i) => {
              const id = `${uid}-amount-${i}`;
              const text = work.amounts[i] ?? "";
              const invalid = text.trim() !== "" && parseNumber(text) === null;
              return (
                <tr key={i} data-line={i + 1}>
                  <th scope="row" class="font-semibold">
                    {capital(l.line.name)}
                  </th>
                  <td class="whitespace-nowrap tabular-nums">{amountWithUnit(l.line.amount, l.line.unit, language)}</td>
                  <td class="target-col">
                    <span class="amount-box">
                      <input
                        id={id}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        class="amount"
                        data-amount={i}
                        value={text}
                        disabled={readOnly}
                        aria-label={t.amountFor(l.line.name, persons, unitName(l.line.unit, language))}
                        aria-invalid={invalid ? "true" : undefined}
                        title={invalid ? t.notANumber : undefined}
                        onInput={(e) => store.dispatch({ type: "SET_AMOUNT", payload: { line: i, value: e.currentTarget.value } })}
                      />
                      <span class="unit" aria-hidden="true">
                        {unitAfter(l.line.unit, parseNumber(text), language)}
                      </span>
                    </span>
                    {invalid && (
                      <span class="mt-1 block text-[0.85em] font-semibold text-red-800" data-invalid>
                        ⚠ {t.notANumber}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {measured.length > 0 && (
        <section class="mt-5" aria-labelledby={`${uid}-measure`}>
          <h3 id={`${uid}-measure`} class="text-[1.15em] font-bold">
            {t.measureTitle}
          </h3>
          <div class="mt-2 grid gap-3 @xl:grid-cols-2" data-tools>
            {measured.map(({ l, i }) => (
              <LineTool key={i} index={i} l={l} model={model} work={work} store={store} t={t} uid={`${uid}-t${i}`} readOnly={readOnly} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** "In your recipe: 375 g", or "not written yet". */
function OwnAmount({ text, unit, t, language, label }: { text: string; unit: Unit; t: Texts; language: RecipeModel["language"]; label?: string }) {
  const n = parseNumber(text);
  return (
    <span data-own>
      {label ?? t.yourAmount}: {n === null ? <em>{t.notWritten}</em> : <strong>{amountWithUnit(n, unit, language)}</strong>}
    </span>
  );
}

/** The tool of one line of the recipe: a scale, a jug, spoons or pieces. */
function LineTool({ index, l, model, work, store, t, uid, readOnly }: { index: number; l: LineModel } & ViewProps<RecipeModel>) {
  const spec = l.spec!;
  const { language } = model;
  const name = l.line.name;
  const Name = capital(name);
  const value = work.content[index] ?? 0;
  const set = (v: number) => store.dispatch({ type: "SET_CONTENT", payload: { line: index, value: v } });
  const note = <OwnAmount text={work.amounts[index] ?? ""} unit={l.line.unit} t={t} language={language} />;
  const color = l.line.color ?? "#e8d9bd";
  const [said, setSaid] = useState("");

  switch (spec.tool) {
    case "scale": {
      const display = (v: number) => formatNumber(scaleDisplay(model.bowl, v, work.tare[index] ?? 0), language);
      const g = (n: number) => `${n} g`;
      return (
        <ToolPanel
          uid={uid}
          testid={`tool-${index + 1}`}
          heading={t.scaleTask(Name)}
          note={
            <>
              {note}
              {model.bowl > 0 && <span class="block">{t.bowlNote}</span>}
            </>
          }
          spec={spec}
          value={value}
          describe={(v) => t.scaleShows(display(v))}
          sliderLabel={t.scaleSlider(Name)}
          less={[
            { delta: -spec.big, text: `−${g(spec.big)}`, label: t.less(g(spec.big), name) },
            { delta: -spec.step, text: `−${g(spec.step)}`, label: t.less(g(spec.step), name) },
          ]}
          more={[
            { delta: spec.step, text: `+${g(spec.step)}`, label: t.more(g(spec.step), name) },
            { delta: spec.big, text: `+${g(spec.big)}`, label: t.more(g(spec.big), name) },
          ]}
          readOnly={readOnly}
          onChange={(v) => {
            set(v);
            setSaid("");
          }}
          said={said}
          drawing={
            <div class="w-full max-w-[300px]">
              <Scale content={value} max={spec.max} display={display(value)} bowl={model.bowl > 0} color={color} uid={uid} />
            </div>
          }
          extra={
            <button
              type="button"
              class="tool-button tare"
              aria-label={t.tareLabel}
              data-tare
              onClick={() => {
                store.dispatch({ type: "TARE", payload: { line: index, offset: model.bowl + value } });
                setSaid(t.tared);
              }}
            >
              {t.tare}
            </button>
          }
        />
      );
    }
    case "jug": {
      const ml = (n: number) => `${n} ml`;
      return (
        <ToolPanel
          uid={uid}
          testid={`tool-${index + 1}`}
          heading={t.jugTask(Name)}
          note={note}
          spec={spec}
          value={value}
          describe={(v) => t.inJug(formatNumber(v, language))}
          sliderLabel={t.jugSlider(Name)}
          less={[
            { delta: -spec.big, text: `−${ml(spec.big)}`, label: t.pourLess(ml(spec.big)) },
            { delta: -spec.step, text: `−${ml(spec.step)}`, label: t.pourLess(ml(spec.step)) },
          ]}
          more={[
            { delta: spec.step, text: `+${ml(spec.step)}`, label: t.pourMore(ml(spec.step)) },
            { delta: spec.big, text: `+${ml(spec.big)}`, label: t.pourMore(ml(spec.big)) },
          ]}
          readOnly={readOnly}
          onChange={set}
          drawing={<BeakerDrawing kind="jug" level={value} spec={spec} color={color} uid={uid} readOnly={readOnly} onChange={set} />}
        />
      );
    }
    case "spoon": {
      const unit = l.line.unit as "tbsp" | "tsp";
      const steps = (sign: 1 | -1): Step[] =>
        [1, 0.5].map((d) => ({ delta: sign * d, text: `${sign < 0 ? "−" : "+"}${formatCount(d, language)}`, label: sign < 0 ? t.spoonLess(d, unit) : t.spoonMore(d, unit) }));
      return (
        <ToolPanel
          uid={uid}
          testid={`tool-${index + 1}`}
          heading={t.spoonTask(Name, unit)}
          note={note}
          spec={spec}
          value={value}
          describe={(v) => t.spoons(v, unit)}
          sliderLabel={t.spoonSlider(Name, unit)}
          less={steps(-1)}
          more={steps(1).reverse()}
          readOnly={readOnly}
          showReading
          onChange={set}
          drawing={<Spoons count={value} size={unit} color={color} uid={uid} />}
        />
      );
    }
    default:
      return (
        <ToolPanel
          uid={uid}
          testid={`tool-${index + 1}`}
          heading={t.piecesTask(Name)}
          note={note}
          spec={spec}
          value={value}
          describe={(v) => t.pieces(v, Name)}
          sliderLabel={t.piecesSlider(Name)}
          less={[{ delta: -1, text: "−1", label: t.pieceLess(name) }]}
          more={[{ delta: 1, text: "+1", label: t.pieceMore(name) }]}
          readOnly={readOnly}
          showReading
          onChange={set}
          drawing={<Pieces count={value} icon={l.line.icon ?? "other"} />}
        />
      );
  }
}

// ---- dosing ----

function DosingView({ model, work, store, t, uid, readOnly }: ViewProps<DosingModel>) {
  const { cleaning, shelf, spec, language } = model;
  const chosen = cleaning.choose ? shelf.find((p) => p.id === work.product) ?? null : model.right;
  const name = (p: Product | null) => (p ? PRODUCT_NAMES[language][p.id] : null);
  const text = work.amounts[0] ?? "";
  const invalid = text.trim() !== "" && parseNumber(text) === null;
  const cup = work.content[0] ?? 0;
  const [said, setSaid] = useState("");
  const pourRef = useRef<HTMLButtonElement>(null);
  const color = chosen?.color ?? "#9aa5b1";
  const size = cleaning.cup;

  const pour = () => {
    if (cup <= 0) return;
    store.dispatch({ type: "POUR", payload: {} });
    setSaid(t.pouredNow(formatNumber(cup, language)));
    // the button disables itself: the focus goes to the cup's slider
    const root = pourRef.current?.closest("[data-dose]");
    setTimeout(() => root?.querySelector<HTMLElement>("[data-slider]")?.focus(), 0);
  };
  const empty = (e: Event) => {
    store.dispatch({ type: "EMPTY", payload: {} });
    setSaid(t.emptied);
    const root = (e.currentTarget as HTMLElement).closest("[data-dose]");
    setTimeout(() => root?.querySelector<HTMLElement>("[data-slider]")?.focus(), 0);
  };

  return (
    <>
      <div class="task-card mt-3">
        <p class="text-[1.15em] font-bold" data-task>
          {t.cleanTask(cleaning.surface, cleaning.volume)}
        </p>
      </div>

      <section class="mt-4" aria-labelledby={`${uid}-products`}>
        <h3 id={`${uid}-products`} class="step-title">
          {cleaning.choose ? t.chooseProduct : t.theProduct}
        </h3>
        <ProductShelf shelf={shelf} chosen={work.product} choose={cleaning.choose} readOnly={readOnly} t={t} language={language} label={t.products} onChoose={(id) => store.dispatch({ type: "CHOOSE", payload: { product: id } })} />
      </section>

      <section class="mt-5" aria-labelledby={`${uid}-compute`}>
        <h3 id={`${uid}-compute`} class="step-title">
          {t.computeStep}
        </h3>
        <div class="mt-2 flex flex-wrap items-center gap-3">
          <label for={`${uid}-dose`} class="font-semibold">
            {name(chosen) ?? t.product}
          </label>
          <span class="amount-box">
            <input
              id={`${uid}-dose`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              class="amount"
              data-amount={0}
              value={text}
              disabled={readOnly}
              aria-label={t.computeLabel(name(chosen))}
              aria-invalid={invalid ? "true" : undefined}
              onInput={(e) => store.dispatch({ type: "SET_AMOUNT", payload: { line: 0, value: e.currentTarget.value } })}
            />
            <span class="unit" aria-hidden="true">
              ml
            </span>
          </span>
          {invalid && (
            <span class="text-[0.9em] font-semibold text-red-800" data-invalid>
              ⚠ {t.notANumber}
            </span>
          )}
        </div>
      </section>

      <section class="mt-5" aria-labelledby={`${uid}-dose-h`} data-dose>
        <h3 id={`${uid}-dose-h`} class="step-title">
          {t.doseStep}
        </h3>
        <div class="mt-2 grid gap-3 @xl:grid-cols-2">
          <ToolPanel
            uid={`${uid}-cup`}
            testid="tool-cup"
            heading={t.cup(size)}
            note={<OwnAmount text={text} unit="ml" t={t} language={language} label={t.yourDose} />}
            spec={spec}
            value={cup}
            describe={(v) => t.inCup(formatNumber(v, language), size)}
            sliderLabel={t.cupSlider(size)}
            less={[
              { delta: -spec.big, text: `−${spec.big} ml`, label: t.pourLess(`${spec.big} ml`) },
              { delta: -spec.step, text: `−${spec.step} ml`, label: t.pourLess(`${spec.step} ml`) },
            ]}
            more={[
              { delta: spec.step, text: `+${spec.step} ml`, label: t.pourMore(`${spec.step} ml`) },
              { delta: spec.big, text: `+${spec.big} ml`, label: t.pourMore(`${spec.big} ml`) },
            ]}
            readOnly={readOnly}
            onChange={(v) => {
              store.dispatch({ type: "SET_CONTENT", payload: { line: 0, value: v } });
              setSaid("");
            }}
            said={said}
            drawing={
              <BeakerDrawing kind="cup" level={cup} spec={spec} color={color} uid={`${uid}-cup`} readOnly={readOnly} onChange={(v) => store.dispatch({ type: "SET_CONTENT", payload: { line: 0, value: v } })} />
            }
            extra={
              <button ref={pourRef} type="button" class="tool-button pour" data-pour disabled={cup <= 0} onClick={pour}>
                {t.pour(size)}
              </button>
            }
          />
          <section class="tool-card" aria-labelledby={`${uid}-bucket`} data-testid="bucket">
            <h4 id={`${uid}-bucket`} class="text-[1.05em] font-bold">
              {t.bucket}
            </h4>
            <p class="mt-0.5 text-muted" data-poured>
              {t.poured(work.pours.length)}
            </p>
            <p class="sr-only">{t.bucketHolds(cleaning.volume, work.pours.length)}</p>
            <div class="mt-2 flex flex-1 items-end justify-center">
              <div class="w-full max-w-[240px]">
                <Bucket volume={cleaning.volume} pours={work.pours.length} color={color} uid={`${uid}-bucket`} />
              </div>
            </div>
            {readOnly && work.pours.length > 0 && (
              <p class="mt-1 text-center font-semibold" data-reading>
                {work.pours.map((ml) => `${formatNumber(ml, language)} ml`).join(" + ")} = {formatNumber(pouredOf(work), language)} ml
              </p>
            )}
            {!readOnly && (
              <div class="mt-2 flex justify-center">
                <button type="button" class="tool-button" data-empty disabled={work.pours.length === 0} onClick={(e) => empty(e as unknown as Event)}>
                  {t.emptyBucket}
                </button>
              </div>
            )}
          </section>
        </div>
      </section>
    </>
  );
}

/**
 * The products on the shelf, each as its label: the name, what it is for, the dosage, the hazard pictograms with their
 * names, and the safety sentence. With a choice they are a radio group (the arrow keys move the choice); the chosen one
 * has a thick border, a tick and the word "Chosen".
 */
function ProductShelf(props: {
  shelf: Product[];
  chosen: string;
  choose: boolean;
  readOnly: boolean;
  t: Texts;
  language: DosingModel["language"];
  label: string;
  onChoose: (id: string) => void;
}) {
  const { shelf, chosen, choose, readOnly, t, language } = props;
  const onKeyDown = (e: KeyboardEvent) => {
    if (readOnly) return;
    const radios = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="radio"]'));
    const at = radios.indexOf(e.target as HTMLElement);
    if (at < 0) return;
    const to = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: radios.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const next = radios[(to + radios.length) % radios.length];
    next.click();
    next.focus();
  };
  const label = (p: Product) => {
    const isChosen = choose && chosen === p.id;
    const content = (
      <>
        <span class="product-band" style={{ background: p.color, color: p.ink }}>
          <Bottle color={p.color} />
          <span class="text-[1.1em] leading-tight font-extrabold" data-name>
            {PRODUCT_NAMES[language][p.id]}
          </span>
        </span>
        <span class="block px-3 pt-2 text-left">
          <span class="block">
            <span class="font-semibold">{t.forSurface}:</span> {p.surfaces.map((s) => SURFACE_LABELS[language][s]).join(", ")}
          </span>
          <span class="dosage mt-2" data-dosage>
            <span class="text-[0.8em] font-semibold uppercase">{t.dosage}</span>
            <span class="text-[1.35em] leading-none font-extrabold">{dosageText(p.dosage, language)}</span>
          </span>
          <span class="mt-2 flex flex-wrap gap-2" data-hazards>
            {p.hazards.length === 0 && <span class="text-[0.9em]">{t.noHazards}</span>}
            {p.hazards.map((h) => (
              <span key={h} class="flex w-[5.5em] flex-col items-center text-center text-[0.8em] leading-tight font-semibold">
                <Pictogram hazard={h} size={46} />
                {t.hazardNames[h]}
              </span>
            ))}
          </span>
          <span class="mt-2 block text-[0.85em] text-muted">{t.safety}</span>
          {isChosen && (
            <span class="chosen-badge" data-chosen>
              ✓ {t.chosen}
            </span>
          )}
        </span>
      </>
    );
    if (!choose) return <div class="product-label" data-product={p.id}>{content}</div>;
    const tabbable = chosen === p.id || (!shelf.some((q) => q.id === chosen) && p === shelf[0]);
    return (
      <button
        type="button"
        role="radio"
        aria-checked={isChosen}
        aria-disabled={readOnly ? "true" : undefined}
        tabIndex={readOnly ? -1 : tabbable ? 0 : -1}
        class={`product-label ${isChosen ? "product-chosen" : ""}`}
        data-product={p.id}
        onClick={() => !readOnly && props.onChoose(p.id)}
      >
        {content}
      </button>
    );
  };
  return (
    <div
      class="mt-2 grid gap-3 @xl:grid-cols-2 @3xl:grid-cols-3"
      role={choose ? "radiogroup" : undefined}
      aria-label={choose ? props.label : undefined}
      onKeyDown={onKeyDown as unknown as (e: Event) => void}
      data-shelf
    >
      {shelf.map((p) => (
        <div key={p.id} class="flex">
          {label(p)}
        </div>
      ))}
    </div>
  );
}

export default Interaction;
