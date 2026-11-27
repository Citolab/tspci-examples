/** The PCI's own texts (the `language` setting); the title and the question come from the item. Simple words, short sentences. */
import { Hazard, Language, Problem, Surface, Unit, formatAmount, formatCount, formatNumber } from "./kitchen";

export { languageOf } from "./kitchen";
export type { Language } from "./kitchen";

type UnitNames = { short: string; one: string; many: string };

const UNITS: Record<Language, Record<Unit, UnitNames>> = {
  en: {
    g: { short: "g", one: "gram", many: "grams" },
    kg: { short: "kg", one: "kilogram", many: "kilograms" },
    ml: { short: "ml", one: "millilitre", many: "millilitres" },
    dl: { short: "dl", one: "decilitre", many: "decilitres" },
    l: { short: "l", one: "litre", many: "litres" },
    tbsp: { short: "tablespoons", one: "tablespoon", many: "tablespoons" },
    tsp: { short: "teaspoons", one: "teaspoon", many: "teaspoons" },
    piece: { short: "pieces", one: "piece", many: "pieces" },
  },
  nl: {
    g: { short: "g", one: "gram", many: "gram" },
    kg: { short: "kg", one: "kilo", many: "kilo" },
    ml: { short: "ml", one: "milliliter", many: "milliliter" },
    dl: { short: "dl", one: "deciliter", many: "deciliter" },
    l: { short: "l", one: "liter", many: "liter" },
    tbsp: { short: "eetlepels", one: "eetlepel", many: "eetlepels" },
    tsp: { short: "theelepels", one: "theelepel", many: "theelepels" },
    piece: { short: "stuks", one: "stuk", many: "stuks" },
  },
};

/** The unit after an amount in the recipe: "375 g", "3 eggs" (pieces: the word), "1 tablespoon", "1½ tablespoons". */
export function unitAfter(unit: Unit, amount: number | null, language: Language): string {
  const names = UNITS[language][unit];
  if (names.short !== names.many) return names.short; // g, kg, ml, dl, l
  return amount !== null && amount <= 1 ? names.one : names.many;
}

/** An amount with its unit: "375 g", "1½ tablespoons", "3 pieces". */
export const amountWithUnit = (x: number, unit: Unit, language: Language) => `${formatAmount(x, unit, language)} ${unitAfter(unit, x, language)}`;

/** The full name of a unit, for a screen reader: "grams", "tablespoons". */
export const unitName = (unit: Unit, language: Language) => UNITS[language][unit].many;

const english = {
  recipe: "Recipe",
  forPersons: (n: number) => `For ${n} ${n === 1 ? "person" : "persons"}`,
  makeFor: (n: number) => `Make it for ${n} ${n === 1 ? "person" : "persons"}.`,
  makeForHint: "Write the new amounts in the recipe. Then measure what has a tool below.",
  ingredient: "Ingredient",
  amountFor: (name: string, n: number, unit: string) => `${name}: amount for ${n} ${n === 1 ? "person" : "persons"}, in ${unit}`,
  notANumber: "Write a number, such as 375 or 1,5.",
  measureTitle: "Measure",
  yourAmount: "In your recipe",
  yourDose: "Your amount",
  notWritten: "not written yet",
  // the tools
  scaleTask: (name: string) => `${name}: weigh it on the scale`,
  jugTask: (name: string) => `${name}: pour it into the measuring jug`,
  spoonTask: (name: string, unit: Unit) => `${name}: measure it with a ${unit === "tbsp" ? "tablespoon" : "teaspoon"}`,
  piecesTask: (name: string) => `${name}: count them`,
  scaleSlider: (name: string) => `${name} on the scale`,
  jugSlider: (name: string) => `${name} in the measuring jug`,
  spoonSlider: (name: string, unit: Unit) => `${name}: ${unit === "tbsp" ? "tablespoons" : "teaspoons"}`,
  piecesSlider: (name: string) => `${name}: how many`,
  scaleShows: (display: string) => `The scale shows ${display} g`,
  inJug: (ml: string) => `${ml} ml in the jug`,
  spoons: (count: number, unit: Unit) => `${formatCount(count, "en")} ${unit === "tbsp" ? (count === 1 ? "tablespoon" : "tablespoons") : count === 1 ? "teaspoon" : "teaspoons"}`,
  pieces: (count: number, name: string) => `${name}: ${count}`,
  more: (step: string, name: string) => `Add ${step} of ${name}`,
  less: (step: string, name: string) => `Take ${step} of ${name} away`,
  pourMore: (step: string) => `Pour ${step} more`,
  pourLess: (step: string) => `Pour ${step} back`,
  spoonMore: (step: number, unit: Unit) => `Add ${step === 0.5 ? "half a" : "1"} ${unit === "tbsp" ? "tablespoon" : "teaspoon"}`,
  spoonLess: (step: number, unit: Unit) => `Take ${step === 0.5 ? "half a" : "1"} ${unit === "tbsp" ? "tablespoon" : "teaspoon"} away`,
  pieceMore: (name: string) => `One more: ${name}`,
  pieceLess: (name: string) => `One less: ${name}`,
  tare: "Tare: set to 0",
  tareLabel: "Tare: set the scale to 0",
  bowlNote: "There is a bowl on the scale.",
  tared: "The scale is set to 0.",
  // dosing
  cleanTask: (surface: Surface, volume: number) => `Clean ${SURFACES.en[surface]}. The bucket holds ${formatNumber(volume, "en")} ${volume === 1 ? "litre" : "litres"} of water.`,
  chooseProduct: "1. Choose the right product",
  theProduct: "1. The product",
  products: "Cleaning products",
  chosen: "Chosen",
  computeStep: "2. How much product do you need?",
  computeLabel: (product: string | null) => `${product ?? "Product"} for the bucket, in ml`,
  doseStep: "3. Measure it and pour it into the bucket",
  cup: (size: number): string => (size <= 50 ? "Dosing cap" : "Measuring cup"),
  cupSlider: (size: number) => `Product in the ${size <= 50 ? "dosing cap" : "measuring cup"}`,
  inCup: (ml: string, size: number) => `${ml} ml in the ${size <= 50 ? "cap" : "cup"}`,
  pour: (size: number) => `Pour the ${size <= 50 ? "cap" : "cup"} into the bucket`,
  emptyBucket: "Empty the bucket and start again",
  bucket: "Bucket",
  poured: (n: number) => (n === 0 ? "Nothing poured into the bucket yet." : `You poured into the bucket ${n === 1 ? "once" : `${n} times`}.`),
  bucketHolds: (volume: number, n: number) => `The bucket holds ${formatNumber(volume, "en")} litres of water${n ? `, and product poured in ${n === 1 ? "once" : `${n} times`}` : ""}.`,
  pouredNow: (ml: string) => `Poured ${ml} ml into the bucket.`,
  emptied: "The bucket is empty. It has clean water again.",
  forSurface: "For",
  dosage: "Dosage",
  hazardNames: { flame: "Flammable", corrosive: "Corrosive", exclamation: "Harmful", environment: "Harmful to the environment" } as Record<Hazard, string>,
  noHazards: "No hazard pictogram",
  safety: "Wear gloves. Keep away from children. Never mix with other products.",
  product: "Product",
  problems: {
    badRecipe: "The recipe can not be read: the pancakes are shown.",
    noLines: "The recipe has no ingredients.",
    tooManyLines: "The recipe has more than 10 ingredients: only the first 10 are shown.",
    badLine: "An ingredient can not be read: it needs a name, an amount above 0 and a unit.",
    badPersons: "The number of persons to cook for must be a whole number from 1 to 100.",
    badRecipePersons: "The number of persons of the recipe must be a whole number from 1 to 100.",
    badCleaning: "The cleaning task can not be read: the floor is shown.",
    badVolume: "The bucket must hold more than 0 and at most 100 litres.",
    badDosage: "A dosage can not be read. Write it as 1:100 or 20 ml/l.",
    noProduct: "None of the products is for this surface.",
  } as Record<Problem, string>,
};

export type Texts = typeof english;

const SURFACES: Record<Language, Record<Surface, string>> = {
  en: { floor: "the floor", worktop: "the kitchen worktop", sanitary: "the toilet and the washbasin", window: "the windows" },
  nl: { floor: "de vloer", worktop: "het aanrecht", sanitary: "het toilet en de wastafel", window: "de ramen" },
};
/** What a product is for, on its label: "floors". */
export const SURFACE_LABELS: Record<Language, Record<Surface, string>> = {
  en: { floor: "floors", worktop: "kitchen worktops and tables", sanitary: "toilets and washbasins", window: "windows and mirrors" },
  nl: { floor: "vloeren", worktop: "aanrecht en tafels", sanitary: "toilet en wastafel", window: "ramen en spiegels" },
};
export const surfaceName = (surface: Surface, language: Language) => SURFACES[language][surface];

/** The names of the built-in products: what they are, no brand. */
export const PRODUCT_NAMES: Record<Language, Record<string, string>> = {
  en: { floor: "Floor cleaner", allPurpose: "All-purpose cleaner", sanitary: "Toilet and bathroom cleaner", glass: "Glass cleaner" },
  nl: { floor: "Vloerreiniger", allPurpose: "Allesreiniger", sanitary: "Sanitairreiniger", glass: "Glasreiniger" },
};

const dutch: Texts = {
  recipe: "Recept",
  forPersons: (n) => `Voor ${n} ${n === 1 ? "persoon" : "personen"}`,
  makeFor: (n) => `Maak het voor ${n} ${n === 1 ? "persoon" : "personen"}.`,
  makeForHint: "Schrijf de nieuwe hoeveelheden in het recept. Meet daarna af wat hieronder een hulpmiddel heeft.",
  ingredient: "Ingrediënt",
  amountFor: (name, n, unit) => `${name}: hoeveelheid voor ${n} ${n === 1 ? "persoon" : "personen"}, in ${unit}`,
  notANumber: "Schrijf een getal, zoals 375 of 1,5.",
  measureTitle: "Afmeten",
  yourAmount: "In jouw recept",
  yourDose: "Jouw hoeveelheid",
  notWritten: "nog niet ingevuld",
  scaleTask: (name) => `${name}: afwegen op de weegschaal`,
  jugTask: (name) => `${name}: afmeten in de maatbeker`,
  spoonTask: (name, unit) => `${name}: afmeten met een ${unit === "tbsp" ? "eetlepel" : "theelepel"}`,
  piecesTask: (name) => `${name}: tellen`,
  scaleSlider: (name) => `${name} op de weegschaal`,
  jugSlider: (name) => `${name} in de maatbeker`,
  spoonSlider: (name, unit) => `${name}: ${unit === "tbsp" ? "eetlepels" : "theelepels"}`,
  piecesSlider: (name) => `${name}: hoeveel`,
  scaleShows: (display) => `De weegschaal wijst ${display} g aan`,
  inJug: (ml) => `${ml} ml in de maatbeker`,
  spoons: (count, unit) => `${formatCount(count, "nl")} ${unit === "tbsp" ? (count <= 1 ? "eetlepel" : "eetlepels") : count <= 1 ? "theelepel" : "theelepels"}`,
  pieces: (count, name) => `${name}: ${count}`,
  more: (step, name) => `${step} ${name} erbij`,
  less: (step, name) => `${step} ${name} eraf`,
  pourMore: (step) => `${step} erbij gieten`,
  pourLess: (step) => `${step} teruggieten`,
  spoonMore: (step, unit) => `${step === 0.5 ? "Een halve" : "Eén"} ${unit === "tbsp" ? "eetlepel" : "theelepel"} erbij`,
  spoonLess: (step, unit) => `${step === 0.5 ? "Een halve" : "Eén"} ${unit === "tbsp" ? "eetlepel" : "theelepel"} eraf`,
  pieceMore: (name) => `Eén erbij: ${name}`,
  pieceLess: (name) => `Eén eraf: ${name}`,
  tare: "Tarra: op 0",
  tareLabel: "Tarra: zet de weegschaal op 0",
  bowlNote: "Er staat een kom op de weegschaal.",
  tared: "De weegschaal staat op 0.",
  cleanTask: (surface, volume) => `Maak ${SURFACES.nl[surface]} schoon. In de emmer zit ${formatNumber(volume, "nl")} liter water.`,
  chooseProduct: "1. Kies het goede middel",
  theProduct: "1. Het middel",
  products: "Schoonmaakmiddelen",
  chosen: "Gekozen",
  computeStep: "2. Hoeveel middel heb je nodig?",
  computeLabel: (product) => `${product ?? "Middel"} voor de emmer, in ml`,
  doseStep: "3. Meet het af en giet het in de emmer",
  cup: (size) => (size <= 50 ? "Doseerdop" : "Maatbekertje"),
  cupSlider: (size) => `Middel in ${size <= 50 ? "de doseerdop" : "het maatbekertje"}`,
  inCup: (ml, size) => `${ml} ml in ${size <= 50 ? "de dop" : "het bekertje"}`,
  pour: (size) => `Giet ${size <= 50 ? "de dop" : "het bekertje"} in de emmer`,
  emptyBucket: "Emmer leeggooien en opnieuw beginnen",
  bucket: "Emmer",
  poured: (n) => (n === 0 ? "Je hebt nog niets in de emmer gegoten." : `Je hebt ${n} keer in de emmer gegoten.`),
  bucketHolds: (volume, n) => `In de emmer zit ${formatNumber(volume, "nl")} liter water${n ? `, en je hebt er ${n} keer middel in gegoten` : ""}.`,
  pouredNow: (ml) => `${ml} ml in de emmer gegoten.`,
  emptied: "De emmer is leeg. Er zit weer schoon water in.",
  forSurface: "Voor",
  dosage: "Dosering",
  hazardNames: { flame: "Ontvlambaar", corrosive: "Bijtend", exclamation: "Schadelijk", environment: "Schadelijk voor het milieu" },
  noHazards: "Geen gevarensymbool",
  safety: "Draag handschoenen. Buiten bereik van kinderen. Nooit mengen met andere middelen.",
  product: "Middel",
  problems: {
    badRecipe: "Het recept is niet te lezen: de pannenkoeken staan er.",
    noLines: "Het recept heeft geen ingrediënten.",
    tooManyLines: "Het recept heeft meer dan 10 ingrediënten: alleen de eerste 10 staan er.",
    badLine: "Een ingrediënt is niet te lezen: het heeft een naam nodig, een hoeveelheid boven 0 en een eenheid.",
    badPersons: "Het aantal personen om voor te koken moet een heel getal van 1 tot 100 zijn.",
    badRecipePersons: "Het aantal personen van het recept moet een heel getal van 1 tot 100 zijn.",
    badCleaning: "De schoonmaaktaak is niet te lezen: de vloer staat er.",
    badVolume: "In de emmer moet meer dan 0 en hoogstens 100 liter.",
    badDosage: "Een dosering is niet te lezen. Schrijf hem als 1:100 of 20 ml/l.",
    noProduct: "Geen van de middelen is voor dit oppervlak.",
  },
};

export const textsFor = (language: Language): Texts => (language === "nl" ? dutch : english);

/** A capital first letter: "Flour: weigh it". */
export const capital = (s: string) => (s ? s[0].toLocaleUpperCase() + s.slice(1) : s);
