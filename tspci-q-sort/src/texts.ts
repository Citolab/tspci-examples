// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/wordrank, © OpenPCI, Aarhus University and Aalborg University
// (Elias J.T. Hansen, Anna Rusmann, Jeppe Bundsgaard)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The texts of the PCI per language (data-language); the statements, the scale and the pile names are settings.

const en = {
  hint: "Place every statement in the grid. Drag a card, or click it and then click a place. Keyboard: Space picks up a card, the arrow keys choose a place, Space puts it down, Escape cancels.",
  hintPresort: "Step 1 of 2: put every card on one of the three piles. Drag a card, or click it and then click a pile. Keyboard: Space picks up a card, the arrow keys choose a pile, Space puts it down, Escape cancels.",
  hintGrid: (high: string, low: string) =>
    `Step 2 of 2: place every statement in the grid. Start at the ends: the cards you agree with most from the pile ${high}, the ones you disagree with most from the pile ${low}, and work towards the middle. Drag a card, or click it and then click a place. Keyboard: Space picks up a card, the arrow keys choose a place, Space puts it down, Escape cancels.`,
  gridShown: "All cards are on a pile. The grid is shown: now place them in the grid.",
  grid: "Q-sort grid",
  pool: "Statements",
  poolEmpty: "All statements are placed.",
  poolTarget: "the statements",
  unsorted: "To sort",
  unsortedCount: (n: number) => (n === 1 ? "1 card left" : `${n} cards left`),
  pileEmpty: "Empty",
  progress: (placed: number, total: number) => `${placed} of ${total} placed`,
  column: (value: string, label: string) => (label ? `column ${value} (${label})` : `column ${value}`),
  place: (column: string, place: number, of: number) => `${column}, place ${place} of ${of}`,
  emptyPlace: (where: string) => `${where}, empty`,
  occupiedPlace: (where: string, statement: string) => `${where}, holds ${statement}`,
  statementIn: (statement: string, where: string) => `${statement}, in ${where}`,
  pile: (name: string) => `the pile ${name}`,
  pickedUp: (statement: string, where: string) =>
    `${statement} picked up. Now at ${where}. Arrow keys choose a place, Space puts it down, Escape cancels.`,
  over: (where: string) => where,
  dropped: (statement: string, where: string) => `${statement} put in ${where}.`,
  swapped: (statement: string, other: string, where: string) =>
    `${statement} put in ${where}; ${other} took its old place.`,
  returned: (statement: string, where: string) => `${statement} put back on ${where}.`,
  cancelled: (statement: string) => `${statement} put back where it was.`,
};

const nl: typeof en = {
  hint: "Zet elke stelling in het raster. Sleep een kaart, of klik erop en klik dan op een plek. Toetsenbord: Spatie pakt een kaart op, de pijltjestoetsen kiezen een plek, Spatie zet hem neer, Escape annuleert.",
  hintPresort: "Stap 1 van 2: leg elke kaart op een van de drie stapels. Sleep een kaart, of klik erop en klik dan op een stapel. Toetsenbord: Spatie pakt een kaart op, de pijltjestoetsen kiezen een stapel, Spatie zet hem neer, Escape annuleert.",
  hintGrid: (high: string, low: string) =>
    `Stap 2 van 2: zet elke stelling in het raster. Begin bij de uiteinden: de kaarten waarmee je het het meest eens bent van de stapel ${high}, die waarmee je het het meest oneens bent van de stapel ${low}, en werk naar het midden. Sleep een kaart, of klik erop en klik dan op een plek. Toetsenbord: Spatie pakt een kaart op, de pijltjestoetsen kiezen een plek, Spatie zet hem neer, Escape annuleert.`,
  gridShown: "Alle kaarten liggen op een stapel. Het raster staat nu klaar: zet ze in het raster.",
  grid: "Q-sort-raster",
  pool: "Stellingen",
  poolEmpty: "Alle stellingen zijn geplaatst.",
  poolTarget: "de stellingen",
  unsorted: "Te sorteren",
  unsortedCount: (n: number) => (n === 1 ? "nog 1 kaart" : `nog ${n} kaarten`),
  pileEmpty: "Leeg",
  progress: (placed: number, total: number) => `${placed} van ${total} geplaatst`,
  column: (value: string, label: string) => (label ? `kolom ${value} (${label})` : `kolom ${value}`),
  place: (column: string, place: number, of: number) => `${column}, plek ${place} van ${of}`,
  emptyPlace: (where: string) => `${where}, leeg`,
  occupiedPlace: (where: string, statement: string) => `${where}, bevat ${statement}`,
  statementIn: (statement: string, where: string) => `${statement}, in ${where}`,
  pile: (name: string) => `de stapel ${name}`,
  pickedUp: (statement: string, where: string) =>
    `${statement} opgepakt. Nu bij ${where}. Pijltjestoetsen kiezen een plek, Spatie zet hem neer, Escape annuleert.`,
  over: (where: string) => where,
  dropped: (statement: string, where: string) => `${statement} gezet in ${where}.`,
  swapped: (statement: string, other: string, where: string) =>
    `${statement} gezet in ${where}; ${other} staat nu op de oude plek.`,
  returned: (statement: string, where: string) => `${statement} teruggezet op ${where}.`,
  cancelled: (statement: string) => `${statement} teruggezet waar hij stond.`,
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
