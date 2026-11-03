// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/oatymart/html-template-interaction-pci, © 2024 Martin Nicholson and Open Assessment Technologies SA
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The texts of the PCI per language (data-language, or the authoring system's language); the item's own texts are in
// the author's HTML.

import { Problem } from "./template";

const en = {
  /** The word count of a data-wordcount-for element. */
  words: (n: number) => `${n} ${n === 1 ? "word" : "words"}`,
  interaction: "Interaction",
  // authoring mode
  html: "HTML",
  preview: "Preview",
  hint:
    "Write the HTML of the interaction. Every input, textarea or select with a name and data-response is part of the " +
    "response; data-wordcount-for=\"name\" shows the word count of a text field. Styles and images (as data: URLs) " +
    "may be inline; scripts and event handlers are removed.",
  insert: "Insert",
  snippets: {
    text: "Text field",
    textarea: "Text area",
    select: "Drop-down",
    radio: "Radio buttons",
    checkbox: "Checkbox",
    image: "Image…",
  },
  question: "Question",
  choose: "Choose…",
  option: (n: number) => `Option ${n}`,
  example: "Example template",
  fields: "Response fields",
  field: "Name",
  type: "Type",
  initial: "Value at the start",
  noFields: "None yet.",
  problem: (p: Problem): string => {
    switch (p.type) {
      case "removed": return `Removed: ${p.what}.`;
      case "noName": return `This element has data-response but no name, so it is not part of the response: ${p.element}`;
      case "unsupported": return `This element cannot be part of the response (input type="text|number|email|url|search|checkbox|radio", textarea, select without multiple): ${p.element}`;
      case "duplicate": return `The name "${p.name}" is used for more than one response element (only radio buttons of one group share a name).`;
      case "noLabel": return `"${p.name}" has no label: add a <label>, aria-label or title for screen readers.`;
      case "noResponse": return "There is no response element yet: add data-response and a name to an input, textarea or select.";
    }
  },
};

const nl: typeof en = {
  words: (n: number) => `${n} ${n === 1 ? "woord" : "woorden"}`,
  interaction: "Interactie",
  html: "HTML",
  preview: "Voorbeeld",
  hint:
    "Schrijf de HTML van de interactie. Elk input-, textarea- of select-element met een name en data-response hoort bij " +
    "het antwoord; data-wordcount-for=\"naam\" toont het aantal woorden van een tekstveld. Stijlen en afbeeldingen (als " +
    "data:-URL) mogen inline; scripts en event handlers worden verwijderd.",
  insert: "Invoegen",
  snippets: {
    text: "Tekstveld",
    textarea: "Tekstvak",
    select: "Keuzelijst",
    radio: "Keuzerondjes",
    checkbox: "Selectievakje",
    image: "Afbeelding…",
  },
  question: "Vraag",
  choose: "Kies…",
  option: (n: number) => `Optie ${n}`,
  example: "Voorbeeldsjabloon",
  fields: "Velden van het antwoord",
  field: "Naam",
  type: "Type",
  initial: "Waarde bij de start",
  noFields: "Nog geen.",
  problem: (p: Problem): string => {
    switch (p.type) {
      case "removed": return `Verwijderd: ${p.what}.`;
      case "noName": return `Dit element heeft data-response maar geen name, dus het hoort niet bij het antwoord: ${p.element}`;
      case "unsupported": return `Dit element kan niet bij het antwoord horen (input type="text|number|email|url|search|checkbox|radio", textarea, select zonder multiple): ${p.element}`;
      case "duplicate": return `De naam "${p.name}" staat op meer dan één antwoordelement (alleen keuzerondjes van één groep delen een naam).`;
      case "noLabel": return `"${p.name}" heeft geen label: voeg een <label>, aria-label of title toe voor schermlezers.`;
      case "noResponse": return "Er is nog geen antwoordelement: geef een input, textarea of select een name en data-response.";
    }
  },
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
