// The texts of the PCI per language (data-language); the item's own texts are settings.

const en = {
  calculate: "Calculate",
  input: (name: string) => `Number for the ${name}`,
  notANumber: "Type a number, such as 10.",
  expression: (n: number) => `Expression ${n}`,
  tries: "Your tries, the newest first",
  tried: "Tried",
  equal: "Same result",
  noResult: "no result",
  invalidExpression: (n: number, reason: string) => `Expression ${n} cannot be calculated: ${reason}.`,
  divide: "÷",
  names: { apple: "apple", pear: "pear", iceCream: "ice cream", custom: "unknown number" },
  // authoring mode
  ownImage: "Own image",
  dropHere: "Drop an image here, or",
  choose: "choose a file",
  remove: "Remove image",
  notAnImage: "This file is not an image.",
  tooBig: (kb: number) => `The image is still ${kb} KB after shrinking it; choose a smaller one.`,
  stored: (w: number, h: number, kb: number) => `Stored in the item: ${w} × ${h} pixels, ${kb} KB.`,
  storedSvg: (kb: number) => `Stored in the item as SVG, ${kb} KB.`,
  replaces: "The PCI shows this image instead of the chosen one. Remove it to go back to that one.",
  preview: "Preview",
  empty: "No own image: the PCI shows the image chosen in the settings (apple, pear or ice cream).",
};

const nl: typeof en = {
  calculate: "Bereken",
  input: (name: string) => `Getal voor de ${name}`,
  notANumber: "Typ een getal, bijvoorbeeld 10.",
  expression: (n: number) => `Som ${n}`,
  tries: "Jouw pogingen, de nieuwste eerst",
  tried: "Geprobeerd",
  equal: "Zelfde uitkomst",
  noResult: "geen uitkomst",
  invalidExpression: (n: number, reason: string) => `Som ${n} kan niet worden berekend: ${reason}.`,
  divide: ":",
  names: { apple: "appel", pear: "peer", iceCream: "ijsje", custom: "onbekende getal" },
  ownImage: "Eigen afbeelding",
  dropHere: "Sleep een afbeelding hierheen, of",
  choose: "kies een bestand",
  remove: "Afbeelding verwijderen",
  notAnImage: "Dit bestand is geen afbeelding.",
  tooBig: (kb: number) => `De afbeelding is na verkleinen nog ${kb} KB; kies een kleinere.`,
  stored: (w: number, h: number, kb: number) => `Opgeslagen in het item: ${w} × ${h} pixels, ${kb} KB.`,
  storedSvg: (kb: number) => `Opgeslagen in het item als SVG, ${kb} KB.`,
  replaces: "De PCI toont deze afbeelding in plaats van de gekozen. Verwijder hem om terug te gaan naar die afbeelding.",
  preview: "Voorbeeld",
  empty: "Geen eigen afbeelding: de PCI toont de afbeelding die bij de instellingen is gekozen (appel, peer of ijsje).",
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
