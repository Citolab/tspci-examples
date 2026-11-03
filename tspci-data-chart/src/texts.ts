// The texts of the PCI per language (data-language, or the authoring system's language); the item's own texts are
// settings or in the data.

const en = {
  chart: "Chart",
  source: "Source",
  noValue: "no value",
  share: (percent: string) => `${percent} of the total`,
  total: "Total",
  selected: "chosen",
  /** What a segment says to a screen reader: category, series, value. */
  segment: (category: string, series: string, value: string | null) =>
    [category, series, value].filter((x) => x !== null && x !== "").join(", "),
  helpTool: "Point at a part of the chart or tap it, or tab to the chart and use the arrow keys, to see its numbers.",
  helpSelect: (max: number) =>
    "Point at a part of the chart or tap it, or tab to the chart and use the arrow keys, to see its numbers. " +
    (max === 1
      ? "Click it (on a touch screen: tap it again) or press Enter to choose it."
      : "Click parts (on a touch screen: tap them again) or press Enter to choose them; once more undoes a choice."),
  chosen: (items: string[]) => (items.length ? `Your answer: ${items.join("; ")}` : "Nothing chosen yet."),
  maxReached: (max: number) => `You can choose at most ${max}. Click a chosen part to undo it first.`,
  // authoring mode
  category: "Category",
  series: "Series",
  addCategory: "Add category",
  addSeries: "Add series",
  removeCategory: (n: number) => `Remove category ${n}`,
  removeSeries: (n: number) => `Remove series ${n}`,
  moveUp: (n: number) => `Move category ${n} up`,
  moveDown: (n: number) => `Move category ${n} down`,
  seriesName: (n: number) => `Name of series ${n}`,
  categoryLabel: (n: number) => `Label of category ${n}`,
  value: (category: number, series: number) => `Value of category ${category}, series ${series}`,
  color: (name: string) => `Colour of ${name}`,
  customColor: "Other colour",
  example: "Example data",
  empty: "Empty table",
  copy: "Copy as text",
  copied: "Copied: paste it in a spreadsheet.",
  hint:
    "Type the numbers, or paste cells from a spreadsheet: in the top left field a whole table with its headers, " +
    "anywhere else a block of cells from there. Empty: no value.",
  preview: "Preview",
  correctHint: (max: number): string =>
    max === 1
      ? "Click the part of the chart that is the correct answer."
      : "Click the parts of the chart that are the correct answer; click again to undo.",
  correctNone: "No correct answer yet.",
  correctList: (items: string[]) => `Correct: ${items.join("; ")}`,
  summary: (categories: number, series: number) =>
    `${categories} ${categories === 1 ? "category" : "categories"} × ${series} series`,
  noCorrect: "Mark the correct answer: click it in the preview.",
  tooManyCorrect: (max: number) => `More correct parts than the candidate may choose (${max}).`,
  noValues: "The table has no numbers yet.",
  noName: "Give every series a name (the legend shows it).",
  pieNegative: "A pie chart cannot show negative values.",
};

const nl: typeof en = {
  chart: "Grafiek",
  source: "Bron",
  noValue: "geen waarde",
  share: (percent: string) => `${percent} van het totaal`,
  total: "Totaal",
  selected: "gekozen",
  segment: en.segment,
  helpTool: "Wijs een deel van de grafiek aan of tik erop, of ga met Tab naar de grafiek en gebruik de pijltjestoetsen, om de getallen te zien.",
  helpSelect: (max: number) =>
    "Wijs een deel van de grafiek aan of tik erop, of ga met Tab naar de grafiek en gebruik de pijltjestoetsen, om de getallen te zien. " +
    (max === 1
      ? "Klik erop (op een aanraakscherm: tik nog eens) of druk op Enter om het te kiezen."
      : "Klik op delen (op een aanraakscherm: tik nog eens) of druk op Enter om ze te kiezen; nog eens maakt een keuze ongedaan."),
  chosen: (items: string[]) => (items.length ? `Je antwoord: ${items.join("; ")}` : "Nog niets gekozen."),
  maxReached: (max: number) => `Je kunt er hoogstens ${max} kiezen. Klik eerst op een gekozen deel om het ongedaan te maken.`,
  category: "Categorie",
  series: "Reeks",
  addCategory: "Categorie toevoegen",
  addSeries: "Reeks toevoegen",
  removeCategory: (n: number) => `Categorie ${n} verwijderen`,
  removeSeries: (n: number) => `Reeks ${n} verwijderen`,
  moveUp: (n: number) => `Categorie ${n} omhoog`,
  moveDown: (n: number) => `Categorie ${n} omlaag`,
  seriesName: (n: number) => `Naam van reeks ${n}`,
  categoryLabel: (n: number) => `Label van categorie ${n}`,
  value: (category: number, series: number) => `Waarde van categorie ${category}, reeks ${series}`,
  color: (name: string) => `Kleur van ${name}`,
  customColor: "Andere kleur",
  example: "Voorbeeldgegevens",
  empty: "Lege tabel",
  copy: "Kopiëren als tekst",
  copied: "Gekopieerd: plak het in een spreadsheet.",
  hint:
    "Typ de getallen, of plak cellen uit een spreadsheet: in het veld linksboven een hele tabel met de kopjes, " +
    "ergens anders een blok cellen vanaf daar. Leeg: geen waarde.",
  preview: "Voorbeeld",
  correctHint: (max: number): string =>
    max === 1
      ? "Klik op het deel van de grafiek dat het goede antwoord is."
      : "Klik op de delen van de grafiek die het goede antwoord zijn; klik nog eens om het ongedaan te maken.",
  correctNone: "Nog geen goed antwoord.",
  correctList: (items: string[]) => `Goed: ${items.join("; ")}`,
  summary: (categories: number, series: number) =>
    `${categories} ${categories === 1 ? "categorie" : "categorieën"} × ${series} ${series === 1 ? "reeks" : "reeksen"}`,
  noCorrect: "Geef het goede antwoord aan: klik erop in het voorbeeld.",
  tooManyCorrect: (max: number) => `Meer goede delen dan de kandidaat mag kiezen (${max}).`,
  noValues: "De tabel heeft nog geen getallen.",
  noName: "Geef elke reeks een naam (de legenda toont die).",
  pieNegative: "Een cirkeldiagram kan geen negatieve waarden tonen.",
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
