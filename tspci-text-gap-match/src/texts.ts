// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/textgapmatch, © OpenPCI (Aarhus University and Aalborg
// University: Elias J.T. Hansen, Anna Rusmann, Jeppe Bundsgaard)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The texts of the PCI per language (data-language, or the authoring system's language); the item's own texts are
// settings.

const en = {
  labels: "Labels",
  image: "Image",
  exampleImage: "A plant: a flower on a stem with two leaves, its roots in the soil",
  zone: (n: number, count: number) => `Drop zone ${n} of ${count}`,
  contains: (texts: string[]) => (texts.length ? `contains ${texts.join(", ")}` : "empty"),
  full: "full",
  allPlaced: "All labels have been placed.",
  backToList: "Put back",
  howTo:
    "Drag a label onto a drop zone. Or use the keyboard: choose a label with Enter or Space, then choose a drop zone.",
  picked: (text: string) => `${text} picked up. Choose a drop zone, or press Escape.`,
  dropped: (text: string, n: number) => `${text} placed in drop zone ${n}.`,
  returned: (text: string) => `${text} put back.`,
  notAllowed: (text: string, n: number) => `Drop zone ${n} does not take ${text}.`,
  cancelled: "Cancelled.",
  label: (text: string, where: string) => `${text}${where ? `, ${where}` : ""}`,
  inZone: (n: number, position: number) => `in drop zone ${n}, position ${position}`,
  // authoring mode
  uploadImage: "Upload image…",
  imageUrl: "Image URL",
  exampleButton: "Example image",
  markupImageUsed: "The item has an image of its own in the markup: that one is shown instead.",
  notAnImage: "That file is not an image.",
  tooBig: (kb: number) => `The image is ${kb} kB, too big to store in the item. Use a smaller one, or an image URL.`,
  drawHint:
    "Drag on the image to draw a drop zone. Click a zone to select it; the arrow keys move it (with Shift: resize), Delete removes it.",
  addZone: "Add drop zone",
  removeZone: (id: string) => `Remove ${id}`,
  zoneId: "Id (key in the response)",
  zoneFields: { x: "Left (%)", y: "Top (%)", w: "Width (%)", h: "Height (%)" },
  zones: (n: number) => `${n} ${n === 1 ? "drop zone" : "drop zones"}`,
  noZones: "Draw at least one drop zone.",
  duplicateId: (id: string) => `Two drop zones have the id ${id}.`,
  emptyId: "A drop zone has no id.",
  idHint: "The response refers to the id of a zone and the text of a label: after changing one, set the correct response again.",
};

const nl: typeof en = {
  labels: "Labels",
  image: "Afbeelding",
  exampleImage: "Een plant: een bloem op een stengel met twee bladeren, de wortels in de grond",
  zone: (n: number, count: number) => `Plek ${n} van ${count}`,
  contains: (texts: string[]) => (texts.length ? `bevat ${texts.join(", ")}` : "leeg"),
  full: "vol",
  allPlaced: "Alle labels zijn geplaatst.",
  backToList: "Terugleggen",
  howTo:
    "Sleep een label naar een plek. Of gebruik het toetsenbord: kies een label met Enter of spatie en kies daarna een plek.",
  picked: (text: string) => `${text} opgepakt. Kies een plek, of druk op Escape.`,
  dropped: (text: string, n: number) => `${text} op plek ${n} gezet.`,
  returned: (text: string) => `${text} teruggelegd.`,
  notAllowed: (text: string, n: number) => `Plek ${n} neemt ${text} niet aan.`,
  cancelled: "Geannuleerd.",
  label: (text: string, where: string) => `${text}${where ? `, ${where}` : ""}`,
  inZone: (n: number, position: number) => `op plek ${n}, positie ${position}`,
  uploadImage: "Afbeelding uploaden…",
  imageUrl: "URL van de afbeelding",
  exampleButton: "Voorbeeldafbeelding",
  markupImageUsed: "Het item heeft een eigen afbeelding in de markup: die wordt in plaats hiervan getoond.",
  notAnImage: "Dat bestand is geen afbeelding.",
  tooBig: (kb: number) => `De afbeelding is ${kb} kB, te groot om in het item op te slaan. Gebruik een kleinere, of een URL.`,
  drawHint:
    "Sleep over de afbeelding om een plek te tekenen. Klik op een plek om hem te selecteren; de pijltjestoetsen verplaatsen hem (met Shift: groter of kleiner), Delete verwijdert hem.",
  addZone: "Plek toevoegen",
  removeZone: (id: string) => `${id} verwijderen`,
  zoneId: "Id (sleutel in het antwoord)",
  zoneFields: { x: "Links (%)", y: "Boven (%)", w: "Breedte (%)", h: "Hoogte (%)" },
  zones: (n: number) => `${n} ${n === 1 ? "plek" : "plekken"}`,
  noZones: "Teken minstens één plek.",
  duplicateId: (id: string) => `Twee plekken hebben het id ${id}.`,
  emptyId: "Een plek heeft geen id.",
  idHint: "Het antwoord verwijst naar het id van een plek en de tekst van een label: stel na een wijziging het goede antwoord opnieuw in.",
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
