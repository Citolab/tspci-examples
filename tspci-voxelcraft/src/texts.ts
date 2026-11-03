// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/voxelcraft, © OpenPCI (Aarhus University and Aalborg
// University: Elias J.T. Hansen, Anna Rusmann, Jeppe Bundsgaard)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The texts of the PCI per language (data-language, or the authoring system's language).

const en = {
  scene: "Building area",
  sceneDescription:
    "A 3D grid of 20 by 20 cells to build on with cubes. Arrow keys move the cursor over the ground, Page Up and Page Down " +
    "change its height, Enter or Space uses the tool on the cursor cell. Shift with an arrow key turns the view, plus and " +
    "minus zoom, Ctrl+Z undoes.",
  tools: "Tools",
  add: "Add cubes",
  remove: "Remove cubes",
  paint: "Paint cubes",
  colors: "Colour",
  color: (hex: string, n: number) => `Colour ${n} (${hex})`,
  undo: "Undo",
  reset: "Start over",
  resetConfirm: "Remove everything you built and start over?",
  resetYes: "Start over",
  resetNo: "Cancel",
  rotateLeft: "Turn view left",
  rotateRight: "Turn view right",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  resetView: "Reset view",
  fullscreen: "Full screen",
  exitFullscreen: "Leave full screen",
  help: "Click to use the tool, drag to turn the view, scroll to zoom. Shift + drag draws a line of cubes, right-click removes.",
  count: (n: number) => `${n} ${n === 1 ? "cube" : "cubes"}`,
  cursor: (x: number, y: number, z: number, cube: string | null) =>
    `Column ${x + 1}, row ${z + 1}, level ${y + 1}: ${cube ? `a cube, ${cube}` : "empty"}`,
  added: (n: number) => `Cube added. ${n} ${n === 1 ? "cube" : "cubes"}.`,
  removed: (n: number) => `Cube removed. ${n} ${n === 1 ? "cube" : "cubes"}.`,
  painted: "Cube painted.",
  noWebgl: "This browser cannot show 3D graphics (WebGL), so the building area is not available.",
  readOnly: "View only",
  // authoring mode
  preset: "Starting figure",
  presetHint: "What the candidate sees at the start, and gets back with “Start over”.",
  target: "Target shape (scoring)",
  targetHint:
    "The response gets a score of 1 when this shape stands somewhere in the candidate's building (turned or not), " +
    "otherwise 0. Leave it empty for no score. Cubes in the “empty space” colour mark cells that must stay empty.",
  copyJson: "Copy as JSON",
  pasteJson: "Paste JSON here to load a figure",
};

const nl: typeof en = {
  scene: "Bouwvlak",
  sceneDescription:
    "Een 3D-raster van 20 bij 20 vakken om met kubussen op te bouwen. De pijltjestoetsen verplaatsen de cursor over de grond, " +
    "Page Up en Page Down veranderen de hoogte, Enter of spatie gebruikt het gereedschap op het vak van de cursor. Shift met " +
    "een pijltjestoets draait het beeld, plus en min zoomen, Ctrl+Z maakt ongedaan.",
  tools: "Gereedschap",
  add: "Kubussen plaatsen",
  remove: "Kubussen weghalen",
  paint: "Kubussen kleuren",
  colors: "Kleur",
  color: (hex: string, n: number) => `Kleur ${n} (${hex})`,
  undo: "Ongedaan maken",
  reset: "Opnieuw beginnen",
  resetConfirm: "Alles wat je gebouwd hebt weghalen en opnieuw beginnen?",
  resetYes: "Opnieuw beginnen",
  resetNo: "Annuleren",
  rotateLeft: "Beeld naar links draaien",
  rotateRight: "Beeld naar rechts draaien",
  zoomIn: "Inzoomen",
  zoomOut: "Uitzoomen",
  resetView: "Beeld herstellen",
  fullscreen: "Volledig scherm",
  exitFullscreen: "Volledig scherm sluiten",
  help: "Klik om het gereedschap te gebruiken, sleep om het beeld te draaien, scroll om te zoomen. Shift + slepen tekent een rij kubussen, rechtsklik haalt weg.",
  count: (n: number) => `${n} ${n === 1 ? "kubus" : "kubussen"}`,
  cursor: (x: number, y: number, z: number, cube: string | null) =>
    `Kolom ${x + 1}, rij ${z + 1}, laag ${y + 1}: ${cube ? `een kubus, ${cube}` : "leeg"}`,
  added: (n: number) => `Kubus geplaatst. ${n} ${n === 1 ? "kubus" : "kubussen"}.`,
  removed: (n: number) => `Kubus weggehaald. ${n} ${n === 1 ? "kubus" : "kubussen"}.`,
  painted: "Kubus gekleurd.",
  noWebgl: "Deze browser kan geen 3D-beelden (WebGL) tonen, het bouwvlak is niet beschikbaar.",
  readOnly: "Alleen bekijken",
  preset: "Startfiguur",
  presetHint: "Wat de kandidaat aan het begin ziet, en terugkrijgt met ‘Opnieuw beginnen’.",
  target: "Doelvorm (scoren)",
  targetHint:
    "Het antwoord krijgt score 1 als deze vorm ergens in het bouwwerk van de kandidaat staat (gedraaid of niet), " +
    "anders 0. Laat leeg voor geen score. Kubussen in de kleur voor ‘lege ruimte’ markeren vakken die leeg moeten blijven.",
  copyJson: "Kopiëren als JSON",
  pasteJson: "Plak hier JSON om een figuur te laden",
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
