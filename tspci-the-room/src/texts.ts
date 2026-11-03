// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/theroom, © openPCI: Elias J.T. Hansen, Anna Rusmann and
// Jeppe Bundsgaard (Aarhus University and Aalborg University)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The texts of the PCI per language (data-language); the furniture, doors and the task come from the exercise.

const en = {
  roomLabel: "Room in 3D",
  roomDescription:
    "Select furniture and move it with the arrow keys; R turns it, Shift+R turns it back, Delete takes it out. " +
    "Without a selection the arrow keys turn and tilt the view; + and − zoom. N selects the next piece.",
  help: "Drag furniture to move it, drag the round handle to turn it, double-click to turn it. Drag the floor to look around, scroll to zoom.",
  furniture: "Furniture",
  inRoom: "In the room",
  nothingInRoom: "The room is empty.",
  add: (label: string) => `Add ${label}`,
  left: (n: number) => (n === 1 ? "1 left" : `${n} left`),
  none: "none left",
  fixed: "fixed",
  selected: (label: string) => `${label} selected`,
  deselected: "Nothing selected",
  added: (label: string) => `${label} added`,
  removed: (label: string) => `${label} taken out of the room`,
  moved: (label: string) => `${label} moved`,
  turned: (label: string, degrees: number) => `${label} turned to ${degrees}°`,
  snapped: "against the wall",
  overlaps: (n: number) => (n === 1 ? "Overlaps another piece" : `Overlaps ${n} other pieces`),
  rotateLeft: "Turn left",
  rotateRight: "Turn right",
  remove: "Take out",
  undo: "Undo",
  undone: "Undone",
  resetView: "Reset view",
  viewReset: "View reset",
  startOver: "Start over",
  startedOver: "Back to the layout at the start",
  deselect: "Deselect",
  loading: "Loading the room…",
  error: (message: string) => `The room could not be loaded (${message}).`,
  noWebGL: "This browser cannot show the room in 3D. The furniture can still be arranged with the list and the keyboard.",
  piece: (label: string, n: number) => `${label} ${n}`,
};

const nl: typeof en = {
  roomLabel: "Kamer in 3D",
  roomDescription:
    "Selecteer een meubel en verplaats het met de pijltjestoetsen; R draait het, Shift+R draait het terug, Delete haalt het weg. " +
    "Zonder selectie draaien en kantelen de pijltjestoetsen het beeld; + en − zoomen. N selecteert het volgende meubel.",
  help: "Sleep een meubel om het te verplaatsen, sleep aan de ronde greep om het te draaien, dubbelklik om het te draaien. Sleep de vloer om rond te kijken, scroll om te zoomen.",
  furniture: "Meubels",
  inRoom: "In de kamer",
  nothingInRoom: "De kamer is leeg.",
  add: (label: string) => `${label} toevoegen`,
  left: (n: number) => `nog ${n}`,
  none: "geen meer",
  fixed: "vast",
  selected: (label: string) => `${label} geselecteerd`,
  deselected: "Niets geselecteerd",
  added: (label: string) => `${label} toegevoegd`,
  removed: (label: string) => `${label} uit de kamer gehaald`,
  moved: (label: string) => `${label} verplaatst`,
  turned: (label: string, degrees: number) => `${label} gedraaid naar ${degrees}°`,
  snapped: "tegen de muur",
  overlaps: (n: number) => (n === 1 ? "Overlapt een ander meubel" : `Overlapt ${n} andere meubels`),
  rotateLeft: "Linksom draaien",
  rotateRight: "Rechtsom draaien",
  remove: "Weghalen",
  undo: "Ongedaan maken",
  undone: "Ongedaan gemaakt",
  resetView: "Beeld herstellen",
  viewReset: "Beeld hersteld",
  startOver: "Opnieuw beginnen",
  startedOver: "Terug naar de indeling van het begin",
  deselect: "Selectie opheffen",
  loading: "De kamer wordt geladen…",
  error: (message: string) => `De kamer kon niet worden geladen (${message}).`,
  noWebGL: "Deze browser kan de kamer niet in 3D tonen. Je kunt de meubels nog wel ordenen met de lijst en het toetsenbord.",
  piece: (label: string, n: number) => `${label} ${n}`,
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
