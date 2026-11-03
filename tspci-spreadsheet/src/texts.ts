// The texts of the PCI per language (data-language, or the authoring system's language); the item's own texts are
// settings or in the sheet.

const en = {
  sheet: "Spreadsheet",
  cell: "Cell",
  contents: "Contents of the cell",
  formula: "formula",
  answerCell: "answer cell",
  lockedCell: "locked",
  undo: "Undo",
  redo: "Redo",
  locked: "This cell is locked: you cannot change it.",
  skipped: "Locked cells were left as they were.",
  answerHere: "Your answer goes in this cell.",
  help: (functions: string[]) =>
    `Type a number, text or a formula starting with =, such as =B2*C2. Enter, Tab and the arrow keys move; F2 edits a cell; ` +
    `drag the square of a cell to copy it down or to the right. Functions: ${functions.join(", ")}.`,
  showHelp: "Help",
  // authoring mode
  columns: "Columns",
  rows: "Rows",
  lock: "Lock cell",
  bold: "Bold",
  fill: "Fill colour",
  noFill: "No fill",
  fills: { yellow: "yellow", green: "green", blue: "blue", orange: "orange", purple: "purple", grey: "grey" },
  answer: "Answer cell",
  answerOnlyInAnswerMode: "Only used when the answer goes in a cell (the setting \"Use of the sheet\").",
  lockFilled: "Lock all filled cells",
  unlockAll: "Unlock all cells",
  empty: "Empty sheet",
  example: "Example sheet",
  authoringHint:
    "Type values and formulas as the candidate would. Locked cells (grey, with a mark in the corner) cannot be changed by the candidate; " +
    "the answer cell (amber) holds the response. Drag the edge of a column letter to make the column wider.",
  summary: (filled: number, locked: number) => `${filled} filled ${filled === 1 ? "cell" : "cells"}, ${locked} locked`,
  noAnswer: "Choose the answer cell: select a cell and press \"Answer cell\".",
  answerLocked: "The answer cell is locked: unlock it, or the candidate cannot answer.",
};

const nl: typeof en = {
  sheet: "Werkblad",
  cell: "Cel",
  contents: "Inhoud van de cel",
  formula: "formule",
  answerCell: "antwoordcel",
  lockedCell: "vergrendeld",
  undo: "Ongedaan maken",
  redo: "Opnieuw",
  locked: "Deze cel is vergrendeld: je kunt hem niet veranderen.",
  skipped: "Vergrendelde cellen zijn niet veranderd.",
  answerHere: "Je antwoord komt in deze cel.",
  help: (functions: string[]) =>
    `Typ een getal, tekst of een formule die begint met =, zoals =B2*C2. Enter, Tab en de pijltjestoetsen verplaatsen; ` +
    `F2 bewerkt een cel; sleep het blokje van een cel om hem naar beneden of naar rechts te kopiëren. Functies: ${functions.join(", ")}.`,
  showHelp: "Uitleg",
  columns: "Kolommen",
  rows: "Rijen",
  lock: "Cel vergrendelen",
  bold: "Vet",
  fill: "Opvulkleur",
  noFill: "Geen opvulling",
  fills: { yellow: "geel", green: "groen", blue: "blauw", orange: "oranje", purple: "paars", grey: "grijs" },
  answer: "Antwoordcel",
  answerOnlyInAnswerMode: "Alleen gebruikt als het antwoord in een cel komt (de instelling \"Gebruik van het werkblad\").",
  lockFilled: "Alle gevulde cellen vergrendelen",
  unlockAll: "Alle cellen ontgrendelen",
  empty: "Leeg werkblad",
  example: "Voorbeeldwerkblad",
  authoringHint:
    "Typ waarden en formules zoals de kandidaat dat zou doen. Vergrendelde cellen (grijs, met een hoekje) kan de kandidaat niet veranderen; " +
    "de antwoordcel (oranje) bevat het antwoord. Sleep de rand van een kolomletter om de kolom breder te maken.",
  summary: (filled: number, locked: number) => `${filled} gevulde ${filled === 1 ? "cel" : "cellen"}, ${locked} vergrendeld`,
  noAnswer: "Kies de antwoordcel: selecteer een cel en klik op \"Antwoordcel\".",
  answerLocked: "De antwoordcel is vergrendeld: ontgrendel hem, anders kan de kandidaat niet antwoorden.",
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
