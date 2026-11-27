/*
 * The authoring mode (index.tsx getAuthoringInstance). For the mode of the item:
 * - recipe: a preset recipe or one of the author's own (its name, its persons, its ingredients: name, amount, unit, and
 *   whether the pupil measures it), the persons the pupil cooks for, and a bowl on the scale (tare);
 * - dosing: a preset task or one of the author's own (the surface, the litres in the bucket, the products on the shelf
 *   and their dosages, whether the pupil chooses, the dosing cup);
 * and the two margins. Below it a preview of the correct amounts, and what keeps Done from finishing. It writes the
 * settings recipe, persons, bowl, cleaning, amountMargin and measureMargin.
 */
import type { ComponentChildren } from "preact";
import { useRef, useState } from "preact/hooks";
import {
  CUP_SIZES, Cleaning, ICONS, Icon, Language, MAX_LINES, PRESET_PRODUCTS, PRODUCT_IDS, RECIPE_PRESETS, SURFACES, Settings, Surface, TASK_PRESETS,
  UNITS, Unit, cleaningFrom, cleaningSetting, dosageSetting, formatNumber, languageOf, modelFrom, parseDosage, parseNumber, presetCleaning, presetRecipe,
  recipeFrom, recipeSetting, toolOf,
} from "./kitchen";
import { PRODUCT_NAMES, amountWithUnit, capital, surfaceName, textsFor } from "./texts";

/** An ingredient in the editor: the amount as typed, an id of its own. */
export type Row = { id: number; name: string; amount: string; unit: Unit; measure: boolean; icon?: Icon; color?: string };
/** A product in the editor: on the shelf or not, its dosage as typed. */
export type ShelfRow = { id: string; on: boolean; dosage: string };

/** What the author makes. */
export type Authored = {
  mode: "recipe" | "dosing";
  /** The item's language: the names of a preset recipe. */
  language: Language;
  /** The preset recipe, or null for the author's own (any change but which lines are measured). */
  preset: string | null;
  name: string;
  /** The persons of the recipe, as typed. */
  from: string;
  rows: Row[];
  /** The persons to cook for, as typed. */
  persons: string;
  bowl: boolean;
  task: string | null;
  surface: Surface;
  volume: string;
  shelf: ShelfRow[];
  choose: boolean;
  cup: number;
  amountMargin: string;
  measureMargin: string;
};

let nextId = 1;
const rowsOf = (lines: { name: string; amount: number; unit: Unit; measure: boolean; icon?: Icon; color?: string }[], language: Language): Row[] =>
  lines.map((l) => ({ ...l, id: nextId++, amount: formatNumber(l.amount, language) }));

/** The products on the shelf first (in their order), then the others. */
function shelfOf(cleaning: Cleaning): ShelfRow[] {
  const on = cleaning.products.map((p) => ({ id: p.id, on: true, dosage: dosageSetting(p.dosage) }));
  const off = PRODUCT_IDS.filter((id) => !on.some((r) => r.id === id)).map((id) => ({ id, on: false, dosage: dosageSetting(PRESET_PRODUCTS[id].dosage) }));
  return [...on, ...off];
}

/** The authoring mode starts from the settings. */
export function authoredFrom(settings: Settings): Authored {
  const language = languageOf(settings.language);
  const { recipe } = recipeFrom(settings.recipe, language);
  const { cleaning } = cleaningFrom(settings.cleaning);
  return {
    mode: settings.mode === "dosing" ? "dosing" : "recipe",
    language,
    preset: recipe.preset,
    name: recipe.name,
    from: String(recipe.persons),
    rows: rowsOf(recipe.lines, language),
    persons: String(settings.persons ?? "6"),
    bowl: settings.bowl !== "false",
    task: cleaning.preset,
    surface: cleaning.surface,
    volume: String(cleaning.volume).replace(".", ","),
    shelf: shelfOf(cleaning),
    choose: cleaning.choose,
    cup: cleaning.cup,
    amountMargin: String(settings.amountMargin ?? "0"),
    measureMargin: String(settings.measureMargin ?? "5"),
  };
}

/** The recipe setting: the preset (with other lines measured), or the author's own as JSON. */
function recipeText(a: Authored): string {
  if (a.preset) return recipeSetting({ ...presetRecipe(a.preset, a.language), lines: presetRecipe(a.preset, a.language).lines.map((l, i) => ({ ...l, measure: a.rows[i]?.measure ?? l.measure })) });
  return JSON.stringify({
    name: a.name.trim(),
    persons: parseNumber(a.from) ?? a.from,
    lines: a.rows.map((r) => {
      const line: Record<string, unknown> = { name: r.name.trim(), amount: parseNumber(r.amount) ?? r.amount, unit: r.unit, measure: r.measure };
      if (r.unit === "piece") line.icon = r.icon ?? "other";
      if (r.color) line.color = r.color;
      return line;
    }),
  });
}

function cleaningText(a: Authored): string {
  const volume = parseNumber(a.volume);
  const json = JSON.parse(
    cleaningSetting({
      preset: a.task,
      surface: a.surface,
      volume: volume ?? 0,
      products: a.shelf.filter((r) => r.on).map((r) => ({ ...PRESET_PRODUCTS[r.id], dosage: parseDosage(r.dosage) ?? PRESET_PRODUCTS[r.id].dosage })),
      choose: a.choose,
      cup: a.cup,
    })
  );
  // a dosage that can not be read is written as it is, so the PCI and Done both report it
  for (const r of a.shelf) if (r.on && !parseDosage(r.dosage)) json.dosages = { ...(json.dosages ?? {}), [r.id]: r.dosage };
  if (volume === null) json.volume = a.volume;
  return JSON.stringify(json);
}

/** The settings the authoring mode writes, as strings. */
export const authoredProperties = (a: Authored): Record<string, string> => ({
  recipe: recipeText(a),
  persons: a.persons.trim(),
  bowl: String(a.bowl),
  cleaning: cleaningText(a),
  amountMargin: a.amountMargin.trim(),
  measureMargin: a.measureMargin.trim(),
});

const settingsOf = (a: Authored): Settings => ({ mode: a.mode, language: a.language, ...authoredProperties(a) });

const TEXTS = {
  en: {
    recipeTitle: "Recipe",
    recipeIntro: "Choose a recipe or make your own. The pupil writes the amounts for the new number of persons, and measures the ingredients you tick.",
    dosingTitle: "Cleaning task",
    dosingIntro: "Choose a task or make your own. The pupil chooses the product, computes the dose for the bucket and pours it with the cup.",
    modeNote: (mode: string) => `Mode: ${mode}. You set the mode in the item's settings.`,
    modes: { recipe: "recipe", dosing: "dosing" },
    preset: "Recipe",
    presets: { pancakes: "Pancakes", stamppot: "Stamppot with kale", soup: "Vegetable soup", fruitSalad: "Fruit salad" } as Record<string, string>,
    own: "Own recipe",
    ownNote: "Changing a name, an amount, a unit or the persons makes it your own recipe.",
    name: "Name of the recipe",
    from: "The recipe is for",
    to: "The pupil makes it for",
    personsWord: "persons",
    ingredients: "Ingredients",
    ingredient: "Ingredient",
    amount: "Amount",
    unit: "Unit",
    measure: "Measure",
    tools: { scale: "on the scale", jug: "in the jug", spoon: "with spoons", pieces: "by counting" } as Record<string, string>,
    icon: "Looks like",
    icons: { egg: "Egg", onion: "Onion", apple: "Apple", orange: "Orange", banana: "Banana", cube: "Stock cube", sausage: "Sausage", other: "Round" } as Record<Icon, string>,
    units: { g: "g", kg: "kg", ml: "ml", dl: "dl", l: "l", tbsp: "tablespoon", tsp: "teaspoon", piece: "piece" } as Record<Unit, string>,
    remove: (name: string) => `Remove ${name || "this ingredient"}`,
    add: "Add an ingredient",
    bowl: "A bowl on the scale: the pupil uses the tare button",
    margins: "Margins",
    amountMargin: "Computed amounts in g or ml may be off by",
    amountMarginHint: "besides rounding to a whole gram or ml",
    measureMargin: "Weighing and pouring may be off by",
    measureMarginHint: "spoons and pieces are counted exactly",
    percent: "%",
    preview: (n: string) => `The correct amounts for ${n} persons`,
    measured: "measured",
    task: "Task",
    tasks: { floor: "Floor", worktop: "Kitchen worktop", sanitary: "Toilet and washbasin", window: "Windows" } as Record<string, string>,
    surface: "Surface",
    volume: "Water in the bucket",
    litres: "litres",
    cup: "Dosing cup",
    choose: "The pupil chooses the product",
    shelf: "Products on the shelf",
    shelfHint: "The dosage as 1:100 (1 part to 100 parts water) or 20 ml/l.",
    dosage: "Dosage",
    onShelf: (name: string) => `On the shelf: ${name}`,
    right: (name: string, dose: string) => `The right product: ${name}. The dose: ${dose} ml.`,
    ready: "Ready.",
    problems: {
      noName: (n: number) => `Ingredient ${n} needs a name.`,
      badAmount: (n: number) => `Ingredient ${n} needs an amount above 0.`,
      badFrom: "The persons of the recipe must be a whole number from 1 to 100.",
      noShelf: "Put at least one product on the shelf.",
      badMargin: "A margin must be a number from 0 to 100.",
    },
  },
  nl: {
    recipeTitle: "Recept",
    recipeIntro: "Kies een recept of maak een eigen recept. De leerling schrijft de hoeveelheden voor het nieuwe aantal personen op, en meet de ingrediënten af die je aanvinkt.",
    dosingTitle: "Schoonmaaktaak",
    dosingIntro: "Kies een taak of maak een eigen taak. De leerling kiest het middel, rekent de dosis voor de emmer uit en giet die af met het bekertje.",
    modeNote: (mode: string) => `Soort opdracht: ${mode}. Die stel je in bij de instellingen van het item.`,
    modes: { recipe: "recept", dosing: "doseren" },
    preset: "Recept",
    presets: { pancakes: "Pannenkoeken", stamppot: "Boerenkoolstamppot", soup: "Groentesoep", fruitSalad: "Fruitsalade" } as Record<string, string>,
    own: "Eigen recept",
    ownNote: "Verander je een naam, een hoeveelheid, een eenheid of de personen, dan wordt het je eigen recept.",
    name: "Naam van het recept",
    from: "Het recept is voor",
    to: "De leerling maakt het voor",
    personsWord: "personen",
    ingredients: "Ingrediënten",
    ingredient: "Ingrediënt",
    amount: "Hoeveelheid",
    unit: "Eenheid",
    measure: "Afmeten",
    tools: { scale: "op de weegschaal", jug: "in de maatbeker", spoon: "met lepels", pieces: "door te tellen" } as Record<string, string>,
    icon: "Ziet eruit als",
    icons: { egg: "Ei", onion: "Ui", apple: "Appel", orange: "Sinaasappel", banana: "Banaan", cube: "Bouillonblokje", sausage: "Worst", other: "Rond" } as Record<Icon, string>,
    units: { g: "g", kg: "kg", ml: "ml", dl: "dl", l: "l", tbsp: "eetlepel", tsp: "theelepel", piece: "stuk" } as Record<Unit, string>,
    remove: (name: string) => `${name || "Dit ingrediënt"} verwijderen`,
    add: "Een ingrediënt toevoegen",
    bowl: "Een kom op de weegschaal: de leerling gebruikt de tarraknop",
    margins: "Marges",
    amountMargin: "Berekende hoeveelheden in g of ml mogen afwijken met",
    amountMarginHint: "naast afronden op een hele gram of ml",
    measureMargin: "Afwegen en afmeten mag afwijken met",
    measureMarginHint: "lepels en stuks worden precies geteld",
    percent: "%",
    preview: (n: string) => `De goede hoeveelheden voor ${n} personen`,
    measured: "afmeten",
    task: "Taak",
    tasks: { floor: "Vloer", worktop: "Aanrecht", sanitary: "Toilet en wastafel", window: "Ramen" } as Record<string, string>,
    surface: "Oppervlak",
    volume: "Water in de emmer",
    litres: "liter",
    cup: "Doseerbekertje",
    choose: "De leerling kiest het middel",
    shelf: "Middelen op de plank",
    shelfHint: "De dosering als 1:100 (1 deel op 100 delen water) of 20 ml/l.",
    dosage: "Dosering",
    onShelf: (name: string) => `Op de plank: ${name}`,
    right: (name: string, dose: string) => `Het goede middel: ${name}. De dosis: ${dose} ml.`,
    ready: "Klaar.",
    problems: {
      noName: (n: number) => `Ingrediënt ${n} heeft een naam nodig.`,
      badAmount: (n: number) => `Ingrediënt ${n} heeft een hoeveelheid boven 0 nodig.`,
      badFrom: "Het aantal personen van het recept moet een heel getal van 1 tot 100 zijn.",
      noShelf: "Zet minstens één middel op de plank.",
      badMargin: "Een marge moet een getal van 0 tot 100 zijn.",
    },
  },
};

/** What keeps Done from finishing, in the author's language. */
export function authoredProblems(a: Authored, language: Language): string[] {
  const t = TEXTS[language];
  const problems: string[] = [];
  const margin = (text: string) => {
    const n = parseNumber(text);
    return n !== null && n <= 100;
  };
  if (!margin(a.amountMargin) || !margin(a.measureMargin)) problems.push(t.problems.badMargin);
  if (a.mode === "recipe") {
    a.rows.forEach((r, i) => {
      if (!r.name.trim()) problems.push(t.problems.noName(i + 1));
      const n = parseNumber(r.amount);
      if (n === null || n <= 0) problems.push(t.problems.badAmount(i + 1));
    });
  } else if (!a.shelf.some((r) => r.on)) problems.push(t.problems.noShelf);
  const pt = textsFor(language);
  for (const p of modelFrom(settingsOf(a)).problems) {
    if (p === "badLine" && problems.length) continue; // said per ingredient above
    if (p === "badRecipePersons") problems.push(t.problems.badFrom);
    else if (p === "noLines" && a.rows.length) continue;
    else problems.push(pt.problems[p]);
  }
  return [...new Set(problems)];
}

type Props = { initial: Authored; language: Language; onChange: (authored: Authored) => void };

export function Authoring({ initial, language, onChange }: Props) {
  const [a, setA] = useState(initial);
  const t = TEXTS[language];
  const change = (next: Partial<Authored>) => {
    const value = { ...a, ...next };
    setA(value);
    onChange(value);
  };
  const problems = authoredProblems(a, language);
  return (
    <div class="p-5 font-sans text-ink">
      <h2 class="text-xl font-semibold tracking-tight">{a.mode === "recipe" ? t.recipeTitle : t.dosingTitle}</h2>
      <p class="text-muted">{a.mode === "recipe" ? t.recipeIntro : t.dosingIntro}</p>
      <p class="mt-1 text-sm text-muted" data-mode-note>
        {t.modeNote(t.modes[a.mode])}
      </p>
      {a.mode === "recipe" ? <RecipeEditor a={a} t={t} change={change} /> : <DosingEditor a={a} t={t} change={change} />}

      <fieldset class="mt-4 rounded-xl border border-slate-200 p-3">
        <legend class="px-1 text-sm font-semibold tracking-wide text-muted uppercase">{t.margins}</legend>
        <div class="flex flex-col gap-2">
          {a.mode === "recipe" && (
            <NumberField label={t.amountMargin} hint={t.amountMarginHint} unit={t.percent} value={a.amountMargin} name="amountMargin" onInput={(v) => change({ amountMargin: v })} />
          )}
          <NumberField label={t.measureMargin} hint={t.measureMarginHint} unit={t.percent} value={a.measureMargin} name="measureMargin" onInput={(v) => change({ measureMargin: v })} />
        </div>
      </fieldset>

      <div class="mt-4 rounded-lg border border-slate-200 p-3 text-sm" role="status" data-problems>
        {problems.length ? (
          <ul class="list-disc pl-5 text-red-800">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : (
          <p class="font-semibold text-accent">{t.ready}</p>
        )}
      </div>
    </div>
  );
}

type AuthorTexts = (typeof TEXTS)["en"];
type EditorProps = { a: Authored; t: AuthorTexts; change: (next: Partial<Authored>) => void };

function RecipeEditor({ a, t, change }: EditorProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const own = (next: Partial<Authored>) => change({ ...next, preset: null });
  const setRow = (id: number, next: Partial<Row>, keepPreset = false) => {
    const rows = a.rows.map((r) => (r.id === id ? { ...r, ...next } : r));
    keepPreset ? change({ rows }) : own({ rows });
  };
  const choosePreset = (id: string) => {
    if (id === a.preset) return;
    if (id === "own") return change({ preset: null });
    const recipe = presetRecipe(id, a.language);
    change({ preset: id, name: recipe.name, from: String(recipe.persons), rows: rowsOf(recipe.lines, a.language) });
  };
  const remove = (id: number) => {
    const index = a.rows.findIndex((r) => r.id === id);
    const rows = a.rows.filter((r) => r.id !== id);
    own({ rows });
    const target = rows[index] ?? rows[index - 1];
    setTimeout(() => {
      const next = target && listRef.current?.querySelector<HTMLElement>(`[data-row="${target.id}"] [data-remove]`);
      (next ?? addRef.current)?.focus();
    }, 0);
  };
  const add = () => {
    const row: Row = { id: nextId++, name: "", amount: "", unit: "g", measure: false };
    own({ rows: [...a.rows, row] });
    setTimeout(() => listRef.current?.querySelector<HTMLElement>(`[data-row="${row.id}"] input`)?.focus(), 0);
  };

  // the preview: the correct amounts from the settings as they are now
  const model = modelFrom(settingsOf(a));
  const pt = textsFor(a.language);
  return (
    <>
      <div class="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <Options label={t.preset} name="preset">
          {[...RECIPE_PRESETS, "own"].map((id) => (
            <Option key={id} label={id === "own" ? t.own : t.presets[id]} checked={(a.preset ?? "own") === id} onSelect={() => choosePreset(id)} />
          ))}
        </Options>
        <p class="pl-[7.5em] text-sm text-muted">{t.ownNote}</p>
        <label class="flex flex-wrap items-center gap-2">
          <span class="w-[10em] shrink-0 text-sm font-semibold text-muted">{t.name}</span>
          <input type="text" class="author-input w-[22em] max-w-full" value={a.name} data-name onInput={(e) => own({ name: e.currentTarget.value })} />
        </label>
        <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
          <NumberField label={t.from} unit={t.personsWord} value={a.from} name="from" onInput={(v) => own({ from: v })} />
          <NumberField label={t.to} unit={t.personsWord} value={a.persons} name="persons" onInput={(v) => change({ persons: v })} />
        </div>
      </div>

      <h3 class="mt-5 text-sm font-semibold tracking-wide text-muted uppercase">{t.ingredients}</h3>
      <div ref={listRef} class="mt-2 flex flex-col gap-2" role="list" aria-label={t.ingredients}>
        {a.rows.map((r, i) => {
          const n = parseNumber(r.amount);
          const label = r.name.trim() || `${t.ingredient} ${i + 1}`;
          return (
            <div key={r.id} role="listitem" class="author-line" data-row={r.id}>
              <input type="text" class="author-input min-w-0" aria-label={`${t.ingredient} ${i + 1}`} placeholder={t.ingredient} value={r.name} aria-invalid={!r.name.trim()} onInput={(e) => setRow(r.id, { name: e.currentTarget.value })} />
              <input
                type="text"
                inputMode="decimal"
                class="author-input min-w-0"
                aria-label={`${t.amount}: ${label}`}
                placeholder={t.amount}
                value={r.amount}
                aria-invalid={n === null || n <= 0}
                onInput={(e) => setRow(r.id, { amount: e.currentTarget.value })}
              />
              <select class="author-input" aria-label={`${t.unit}: ${label}`} value={r.unit} onChange={(e) => setRow(r.id, { unit: e.currentTarget.value as Unit })}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {t.units[u]}
                  </option>
                ))}
              </select>
              {r.unit === "piece" ? (
                <select class="author-input" aria-label={`${t.icon}: ${label}`} value={r.icon ?? "other"} onChange={(e) => setRow(r.id, { icon: e.currentTarget.value as Icon })}>
                  {ICONS.map((icon) => (
                    <option key={icon} value={icon}>
                      {t.icons[icon]}
                    </option>
                  ))}
                </select>
              ) : (
                <span />
              )}
              <label class="flex min-h-8 cursor-pointer items-center gap-1.5 text-sm">
                <input type="checkbox" class="h-5 w-5 accent-accent" checked={r.measure} aria-label={`${t.measure} ${t.tools[toolOf(r.unit)]}: ${label}`} onChange={(e) => setRow(r.id, { measure: e.currentTarget.checked }, true)} />
                <span aria-hidden="true">
                  {t.measure} {t.tools[toolOf(r.unit)]}
                </span>
              </label>
              <button type="button" data-remove class="author-button h-8 w-8 p-0 text-lg leading-none" aria-label={t.remove(r.name.trim())} title={t.remove(r.name.trim())} onClick={() => remove(r.id)}>
                ×
              </button>
            </div>
          );
        })}
      </div>
      <button ref={addRef} type="button" class="author-button mt-2 px-3 font-semibold" disabled={a.rows.length >= MAX_LINES} onClick={add} data-add>
        + {t.add}
      </button>

      <label class="mt-4 flex min-h-8 cursor-pointer items-center gap-2">
        <input type="checkbox" class="h-5 w-5 accent-accent" checked={a.bowl} onChange={(e) => change({ bowl: e.currentTarget.checked })} data-bowl />
        <span>{t.bowl}</span>
      </label>

      {model.mode === "recipe" && model.problems.length === 0 && (
        <div class="mt-4 rounded-xl border border-slate-200 p-3" data-preview>
          <h3 class="text-sm font-semibold tracking-wide text-muted uppercase">{t.preview(a.persons)}</h3>
          <ul class="mt-1 grid gap-x-6 sm:grid-cols-2">
            {model.lines.map((l, i) => (
              <li key={i}>
                {capital(l.line.name)}: <strong>{amountWithUnit(l.correct, l.line.unit, a.language)}</strong>
                {l.spec && <span class="text-muted"> ({t.measured})</span>}
              </li>
            ))}
          </ul>
          <p class="sr-only">{pt.makeFor(model.persons)}</p>
        </div>
      )}
    </>
  );
}

function DosingEditor({ a, t, change }: EditorProps) {
  const own = (next: Partial<Authored>) => change({ ...next, task: null });
  const chooseTask = (id: string) => {
    const c = presetCleaning(id);
    change({ task: id, surface: c.surface, volume: String(c.volume), shelf: shelfOf(c), cup: c.cup });
  };
  const setShelf = (id: string, next: Partial<ShelfRow>) => own({ shelf: a.shelf.map((r) => (r.id === id ? { ...r, ...next } : r)) });
  const model = modelFrom(settingsOf(a));
  return (
    <>
      <div class="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <Options label={t.task} name="task">
          {TASK_PRESETS.map((id) => (
            <Option key={id} label={t.tasks[id]} checked={a.task === id} tabbable={a.task === null && id === TASK_PRESETS[0]} onSelect={() => chooseTask(id)} />
          ))}
        </Options>
        <label class="flex flex-wrap items-center gap-2">
          <span class="w-[7em] shrink-0 text-sm font-semibold text-muted">{t.surface}</span>
          <select class="author-input" value={a.surface} data-surface onChange={(e) => own({ surface: e.currentTarget.value as Surface })}>
            {SURFACES.map((s) => (
              <option key={s} value={s}>
                {capital(surfaceName(s, a.language))}
              </option>
            ))}
          </select>
        </label>
        <NumberField label={t.volume} unit={t.litres} value={a.volume} name="volume" onInput={(v) => own({ volume: v })} />
        <Options label={t.cup} name="cup">
          {CUP_SIZES.map((size) => (
            <Option key={size} label={`${size} ml`} checked={a.cup === size} onSelect={() => own({ cup: size })} />
          ))}
        </Options>
        <label class="flex min-h-8 cursor-pointer items-center gap-2">
          <input type="checkbox" class="h-5 w-5 accent-accent" checked={a.choose} onChange={(e) => own({ choose: e.currentTarget.checked })} data-choose />
          <span>{t.choose}</span>
        </label>
      </div>

      <h3 class="mt-5 text-sm font-semibold tracking-wide text-muted uppercase">{t.shelf}</h3>
      <p class="text-sm text-muted">{t.shelfHint}</p>
      <div class="mt-2 flex flex-col gap-2" role="list" aria-label={t.shelf}>
        {a.shelf.map((r) => {
          const name = PRODUCT_NAMES[a.language][r.id];
          return (
            <div key={r.id} role="listitem" class={`author-row ${r.on ? "" : "bg-slate-50"}`} data-shelf-row={r.id}>
              <label class="flex min-h-8 min-w-[16em] cursor-pointer items-center gap-2">
                <input type="checkbox" class="h-5 w-5 accent-accent" checked={r.on} aria-label={t.onShelf(name)} onChange={(e) => setShelf(r.id, { on: e.currentTarget.checked })} />
                <span class="font-semibold" aria-hidden="true">
                  {name}
                </span>
                <span class="text-sm text-muted" aria-hidden="true">
                  ({PRESET_PRODUCTS[r.id].surfaces.map((s) => surfaceName(s, a.language)).join(", ")})
                </span>
              </label>
              <label class="ml-auto flex items-center gap-1.5 text-sm">
                <span>{t.dosage}</span>
                <input type="text" class="author-input w-[8em]" aria-label={`${t.dosage}: ${name}`} value={r.dosage} aria-invalid={!parseDosage(r.dosage)} onInput={(e) => setShelf(r.id, { dosage: e.currentTarget.value })} />
              </label>
            </div>
          );
        })}
      </div>
      {model.mode === "dosing" && model.right && (
        <p class="mt-3 rounded-lg bg-accent-soft px-3 py-2 font-semibold" data-preview>
          {t.right(PRODUCT_NAMES[a.language][model.right.id], formatNumber(model.correct, a.language))}
        </p>
      )}
    </>
  );
}

/** A number field with its label in front and its unit after it. */
function NumberField({ label, hint, unit, value, name, onInput }: { label: string; hint?: string; unit: string; value: string; name: string; onInput: (value: string) => void }) {
  const n = parseNumber(value);
  return (
    <label class="flex flex-wrap items-center gap-2">
      <span class="text-sm font-semibold text-muted">{label}</span>
      <input type="text" inputMode="decimal" class="author-input w-[5em]" value={value} data-field={name} aria-invalid={n === null} onInput={(e) => onInput(e.currentTarget.value)} />
      <span class="text-sm">{unit}</span>
      {hint && <span class="text-sm text-muted">({hint})</span>}
    </label>
  );
}

/**
 * A row of options of which one is picked: a radio group (ARIA pattern) with its name in front. Only the picked one is
 * in the tab order; the arrow keys move the choice, Home and End go to the first and last.
 */
function Options({ label, name, children }: { label: string; name: string; children: ComponentChildren }) {
  const onKeyDown = (e: KeyboardEvent) => {
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
  return (
    <div role="radiogroup" aria-label={label} data-group={name} class="flex flex-wrap items-center gap-1.5" onKeyDown={onKeyDown as unknown as (e: Event) => void}>
      <span class="w-[7em] shrink-0 text-sm font-semibold text-muted" aria-hidden="true">
        {label}
      </span>
      {children}
    </div>
  );
}

function Option({ label, checked, tabbable, onSelect }: { label: string; checked: boolean; tabbable?: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      tabIndex={checked || tabbable ? 0 : -1}
      onClick={onSelect}
      class={`min-h-8 cursor-pointer rounded-md border-2 bg-white px-2.5 py-1 text-sm transition-colors ${
        checked ? "border-accent bg-accent-soft font-semibold text-accent ring-2 ring-accent-soft" : "border-slate-300 text-slate-700 hover:border-slate-500"
      }`}
    >
      {checked && <span aria-hidden="true">✓ </span>}
      {label}
    </button>
  );
}
