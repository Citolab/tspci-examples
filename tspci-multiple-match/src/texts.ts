// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/multiplematch, © Jeppe Bundsgaard, Aarhus University (openPCI)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The texts of the PCI per language (data-language); the item's own texts are the topics, categories and items.

const en = {
  table: "Answer table",
  item: "Item",
  /** The accessible name of a choice group: "Item 1, Group 2". */
  group: (item: string, topic: string) => `${item}, ${topic}`,
  /** One option: "Agree (Item 1, Group 2)". */
  option: (category: string, item: string, topic: string) => `${category} (${item}, ${topic})`,
  chooseOne: "Choose one answer per topic for every item. Choose it again to take it back.",
  chooseMany: "Choose one or more answers per topic for every item.",
  answered: (done: number, total: number) => `${done} of ${total} answered`,
  nothing: "There is nothing to answer: add topics, categories and items.",
};

const nl: typeof en = {
  table: "Antwoordtabel",
  item: "Item",
  group: (item: string, topic: string) => `${item}, ${topic}`,
  option: (category: string, item: string, topic: string) => `${category} (${item}, ${topic})`,
  chooseOne: "Kies per onderwerp één antwoord voor elk item. Kies het nog eens om het terug te nemen.",
  chooseMany: "Kies per onderwerp een of meer antwoorden voor elk item.",
  answered: (done: number, total: number) => `${done} van ${total} beantwoord`,
  nothing: "Er valt niets te beantwoorden: voeg onderwerpen, categorieën en items toe.",
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
