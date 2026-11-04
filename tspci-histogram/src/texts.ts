// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/parcc/extension-parcc-tei/tree/master/views/js/pciCreator/dev/histogramInteraction,
// © 2014-2017 Parcc, Inc. (Sam Sipasseuth, Open Assessment Technologies)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The texts of the PCI per language (data-language); the item's own texts (the prompt, the titles) are settings.

const en = {
  data: "Data",
  frequency: "Frequency",
  category: "Class",
  label: "Bar",
  observations: (n: number) => (n === 1 ? "1 observation" : `${n} observations`),
  chart: "Chart",
  /** The accessible name of a bar's slider: "Height of 10–20". */
  barName: (label: string) => `Height of ${label}`,
  locked: "given, cannot be changed",
  chartHelp: "Drag a bar up or down to set its height, or click where its top should be. Keyboard: Tab to a bar, the arrow keys change it (Page Up and Page Down a whole step, Home 0, End the top).",
  heights: "Heights",
  heightsHelp: "Or type the heights:",
  invalid: (max: string) => `A number from 0 to ${max}.`,
  reset: "Back to the start",
  resetDone: "Every bar is back at its start height.",
  set: (label: string, value: string) => `${label}: ${value}.`,
  rounded: (label: string, value: string) => `${label}: ${value} (rounded to the grid).`,
  cannot: (label: string) => `${label} is given and cannot be changed.`,
  solution: "The correct heights.",
};

export type Texts = typeof en;

const nl: Texts = {
  data: "Gegevens",
  frequency: "Frequentie",
  category: "Klasse",
  label: "Staaf",
  observations: (n) => (n === 1 ? "1 waarneming" : `${n} waarnemingen`),
  chart: "Grafiek",
  barName: (label) => `Hoogte van ${label}`,
  locked: "gegeven, kan niet veranderd worden",
  chartHelp: "Sleep een staaf omhoog of omlaag om de hoogte te zetten, of klik waar de bovenkant moet komen. Toetsenbord: Tab naar een staaf, de pijltjestoetsen veranderen hem (Page Up en Page Down een hele stap, Home 0, End de top).",
  heights: "Hoogtes",
  heightsHelp: "Of typ de hoogtes:",
  invalid: (max) => `Een getal van 0 tot ${max}.`,
  reset: "Terug naar het begin",
  resetDone: "Alle staven staan weer op hun beginhoogte.",
  set: (label, value) => `${label}: ${value}.`,
  rounded: (label, value) => `${label}: ${value} (afgerond op het raster).`,
  cannot: (label) => `${label} is gegeven en kan niet veranderd worden.`,
  solution: "De goede hoogtes.",
};

const fr: Texts = {
  data: "Données",
  frequency: "Effectif",
  category: "Classe",
  label: "Barre",
  observations: (n) => (n <= 1 ? `${n} observation` : `${n} observations`),
  chart: "Graphique",
  barName: (label) => `Hauteur de ${label}`,
  locked: "donnée, ne peut pas être changée",
  chartHelp: "Fais glisser une barre vers le haut ou le bas pour régler sa hauteur, ou clique là où doit être son sommet. Clavier : Tab jusqu'à une barre, les flèches la changent (Page préc. et Page suiv. un pas entier, Début 0, Fin le maximum).",
  heights: "Hauteurs",
  heightsHelp: "Ou écris les hauteurs :",
  invalid: (max) => `Un nombre de 0 à ${max}.`,
  reset: "Revenir au départ",
  resetDone: "Toutes les barres sont revenues à leur hauteur de départ.",
  set: (label, value) => `${label} : ${value}.`,
  rounded: (label, value) => `${label} : ${value} (arrondi à la grille).`,
  cannot: (label) => `${label} est donnée et ne peut pas être changée.`,
  solution: "Les hauteurs correctes.",
};

const TEXTS: Record<string, Texts> = { en, nl, fr };

/** "nl", "nl-NL", "fr" … → its texts; anything else English. */
export const textsFor = (language: string | undefined): Texts => TEXTS[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
