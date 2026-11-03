// The texts of the PCI per language (data-language, or the authoring system's language); the item's own texts are
// settings (data-prompt, the labels in data-arrows).

const en = {
  drawing: "Drawing",
  examplePrompt:
    "A lamp that weighs 30 N hangs from the ceiling. Draw the force of gravity on the lamp, starting at point P.",
  scale: (cm: string, newton: string) => `Scale: 1 cm ≙ ${newton} N`,
  scaleShort: "1 cm",
  undo: "Undo",
  clear: "Start again",
  ruler: "Ruler",
  showRuler: "Show the ruler",
  notDrawn: "not drawn yet",
  arrow: "force arrow",
  arrowName: (label: string) => `Arrow ${label}`,
  choose: "Arrow to draw",
  value: (newton: string, cm: string) => `${newton} N (${cm} cm)`,
  direction: (angle: string) => `direction ${angle}°`,
  startAt: (x: string, y: string) => `starts at ${x} cm from the left, ${y} cm from the top`,
  pointAt: (name: string) => `point ${name}`,
  help:
    "Drag from the point to draw the arrow; drag the arrow head to change it. With the keyboard: Tab to an arrow, " +
    "← and → turn it, ↑ and ↓ make it longer or shorter, Shift for bigger steps; the first arrow key draws a 1 cm arrow " +
    "in that direction. Delete removes the arrow.",
  helpFree: "Alt with the arrow keys moves the start of the arrow.",
  helpRuler: "The ruler: drag it, or turn it with the round handle. With the keyboard: the arrow keys move it, Page Up and Page Down turn it.",
  showHelp: "How does it work?",
  rulerLabel: "Ruler, at an angle of",
  removed: (label: string) => `${label} removed`,
  cleared: "All arrows removed",
  correct: "correct answer",
  // authoring mode
  arrows: "Arrows",
  label: "Name",
  pointName: "Point",
  fixed: "Give the point of application",
  fixedHint: "The candidate draws from this point; otherwise they choose the start.",
  addArrow: "Add arrow",
  removeArrow: "Remove",
  tolerances: "Tolerances (what still counts as correct)",
  tolStart: "Point of application, within (cm)",
  tolAngle: "Direction, within (°)",
  tolLength: "Length, within (cm)",
  authoringHint:
    "Select an arrow, then drag on the drawing from the point of application to where the correct arrow ends. Drag the head " +
    "to change it, the line to move it; the keyboard works as for the candidate. The shaded area shows what is scored as correct.",
  noCorrect: (label: string) => `Draw the correct arrow for ${label}.`,
  noLabel: "Every arrow needs a name.",
  responseProcessing: "Response processing for the item (QTI 3)",
  copy: "Copy",
  copied: "Copied",
  points: (n: number) => `${n} ${n === 1 ? "point" : "points"}`,
};

const nl: typeof en = {
  drawing: "Tekening",
  examplePrompt: "Aan het plafond hangt een lamp van 30 N. Teken de zwaartekracht op de lamp, vanaf punt P.",
  scale: (cm: string, newton: string) => `Schaal: 1 cm ≙ ${newton} N`,
  scaleShort: "1 cm",
  undo: "Ongedaan maken",
  clear: "Opnieuw",
  ruler: "Meetlat",
  showRuler: "Meetlat tonen",
  notDrawn: "nog niet getekend",
  arrow: "krachtpijl",
  arrowName: (label: string) => `Pijl ${label}`,
  choose: "Pijl om te tekenen",
  value: (newton: string, cm: string) => `${newton} N (${cm} cm)`,
  direction: (angle: string) => `richting ${angle}°`,
  startAt: (x: string, y: string) => `begint ${x} cm van links, ${y} cm van boven`,
  pointAt: (name: string) => `punt ${name}`,
  help:
    "Sleep vanaf het punt om de pijl te tekenen; sleep de punt van de pijl om hem te veranderen. Met het toetsenbord: Tab " +
    "naar een pijl, ← en → draaien hem, ↑ en ↓ maken hem langer of korter, Shift voor grotere stappen; de eerste pijltjestoets " +
    "tekent een pijl van 1 cm in die richting. Delete verwijdert de pijl.",
  helpFree: "Alt met de pijltjestoetsen verplaatst het begin van de pijl.",
  helpRuler: "De meetlat: sleep hem, of draai hem met het ronde handvat. Met het toetsenbord: de pijltjestoetsen verplaatsen hem, Page Up en Page Down draaien hem.",
  showHelp: "Hoe werkt het?",
  rulerLabel: "Meetlat, onder een hoek van",
  removed: (label: string) => `${label} verwijderd`,
  cleared: "Alle pijlen verwijderd",
  correct: "goede antwoord",
  arrows: "Pijlen",
  label: "Naam",
  pointName: "Punt",
  fixed: "Aangrijpingspunt geven",
  fixedHint: "De kandidaat tekent vanaf dit punt; anders kiest de kandidaat het begin.",
  addArrow: "Pijl toevoegen",
  removeArrow: "Verwijderen",
  tolerances: "Marges (wat nog goed gerekend wordt)",
  tolStart: "Aangrijpingspunt, binnen (cm)",
  tolAngle: "Richting, binnen (°)",
  tolLength: "Lengte, binnen (cm)",
  authoringHint:
    "Kies een pijl en sleep op de tekening van het aangrijpingspunt naar het eind van de goede pijl. Sleep de punt om hem te " +
    "veranderen, de lijn om hem te verplaatsen; het toetsenbord werkt als bij de kandidaat. Het gekleurde vlak is wat goed gerekend wordt.",
  noCorrect: (label: string) => `Teken de goede pijl voor ${label}.`,
  noLabel: "Elke pijl heeft een naam nodig.",
  responseProcessing: "Responseverwerking voor het item (QTI 3)",
  copy: "Kopiëren",
  copied: "Gekopieerd",
  points: (n: number) => `${n} ${n === 1 ? "punt" : "punten"}`,
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
