// The texts of the PCI per language (data-language); the item's own texts are settings.

const en = {
  add: "Add",
  notANumber: "Type a number, such as 10.",
  outOfRange: (min: string, max: string) => `Type a number from ${min} to ${max}.`,
  already: (x: string) => `${x} is already in the table.`,
  inUnit: (label: string, unit: string) => (unit ? `${label} (${unit})` : label),
  empty: "Add a number: its results appear in the table and in the graph.",
  remove: (x: string) => `Remove ${x}`,
  select: (x: string) => `Show ${x} in the graph`,
  table: "Your numbers and their results, the newest first",
  graph: "Graph of the results",
  invalidFormula: (name: string, reason: string) => `"${name}" cannot be calculated: ${reason}.`,
  noResult: "no result",
};

const nl: typeof en = {
  add: "Voeg toe",
  notANumber: "Typ een getal, bijvoorbeeld 10.",
  outOfRange: (min: string, max: string) => `Typ een getal van ${min} tot en met ${max}.`,
  already: (x: string) => `${x} staat al in de tabel.`,
  inUnit: (label: string, unit: string) => (unit ? `${label} (${unit})` : label),
  empty: "Voeg een getal toe: de uitkomsten komen in de tabel en in de grafiek.",
  remove: (x: string) => `${x} verwijderen`,
  select: (x: string) => `${x} in de grafiek aanwijzen`,
  table: "Jouw getallen en hun uitkomsten, de nieuwste eerst",
  graph: "Grafiek van de uitkomsten",
  invalidFormula: (name: string, reason: string) => `"${name}" kan niet worden berekend: ${reason}.`,
  noResult: "geen uitkomst",
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
