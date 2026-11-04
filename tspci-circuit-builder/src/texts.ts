// The texts of the PCI per language (data-language, or the authoring system's language); the item's own text is the
// prompt.
import type { Check, PartRef, PartType } from "./circuit";

const enParts: Record<PartType, string> = {
  wire: "Wire", corner: "Corner wire", tee: "T-junction", cross: "Junction", crossover: "Crossing wires",
  resistor: "Resistor", variableResistor: "Variable resistor", lamp: "Lamp", led: "LED", diode: "Diode",
  switch: "Switch", pushButton: "Push button", buzzer: "Buzzer", motor: "Motor", ldr: "LDR", ntc: "NTC",
  fuse: "Fuse", voltmeter: "Voltmeter", ammeter: "Ammeter", cell: "Cell", battery: "Battery",
  dcSource: "DC source", acSource: "AC source", transistor: "Transistor",
  aluminiumFoil: "Aluminium foil", copper: "Copper", ironNail: "Iron nail", graphite: "Pencil lead (graphite)", cotton: "Cotton",
  wood: "Wood", plastic: "Plastic", glass: "Glass", rubber: "Rubber",
};
const nlParts: Record<PartType, string> = {
  wire: "Draad", corner: "Hoekdraad", tee: "T-splitsing", cross: "Kruising (verbonden)", crossover: "Kruisende draden",
  resistor: "Weerstand", variableResistor: "Regelbare weerstand", lamp: "Lampje", led: "Led", diode: "Diode",
  switch: "Schakelaar", pushButton: "Drukschakelaar", buzzer: "Zoemer", motor: "Motor", ldr: "LDR", ntc: "NTC",
  fuse: "Zekering", voltmeter: "Voltmeter", ammeter: "Ampèremeter", cell: "Cel", battery: "Batterij",
  dcSource: "Gelijkspanningsbron", acSource: "Wisselspanningsbron", transistor: "Transistor",
  aluminiumFoil: "Aluminiumfolie", copper: "Koper", ironNail: "IJzeren spijker", graphite: "Potloodstift (grafiet)", cotton: "Katoen",
  wood: "Hout", plastic: "Plastic", glass: "Glas", rubber: "Rubber",
};

const list = (names: string[], and: string) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} ${and} ${names[names.length - 1]}`);

const en = {
  part: enParts,
  source: "source",
  board: "Circuit board",
  palette: "Parts",
  cell: (row: number, column: number) => `Row ${row}, column ${column}`,
  empty: "empty",
  turned: (deg: number) => (deg ? `turned ${deg}°` : ""),
  locked: "locked",
  openEnd: "open end",
  left: (n: number) => `${n} left`,
  none: "none left",
  rotate: "Rotate",
  remove: "Delete",
  undo: "Undo",
  clear: "Start again",
  help:
    "Drag a part onto the board, or choose a part and then a cell. Rotate with R, the button or a double click; drag a part to move it. " +
    "Keyboard: the arrow keys move over the board, Enter places the chosen part, Shift + arrow moves a part, R rotates, Delete removes.",
  showHelp: "Help",
  placed: (part: string, row: number, column: number) => `${part} placed in row ${row}, column ${column}.`,
  moved: (part: string, row: number, column: number) => `${part} moved to row ${row}, column ${column}.`,
  rotated: (part: string, deg: number) => `${part} turned to ${deg}°.`,
  removed: (part: string) => `${part} removed.`,
  chosen: (part: string) => `${part} chosen: choose a cell, or press Enter on the board.`,
  noneLeft: (part: string) => `${part}: none left.`,
  isLocked: "This part is part of the question: you cannot change it.",
  undone: "Undone.",
  cleared: "The board is as it was at the start.",
  openEnds: (n: number) => (n === 1 ? "1 open end" : `${n} open ends`),
  closedCircuit: "Closed circuit",
  // the lamp tool (data-lamp-tool)
  breakLamp: "Break lamp",
  repairLamp: "Repair lamp",
  broken: "broken",
  lit: "lit",
  lampBroken: (part: string, row: number, column: number) => `${part} in row ${row}, column ${column} is broken: no current goes through it.`,
  lampRepaired: (part: string, row: number, column: number) => `${part} in row ${row}, column ${column} works again.`,
  notALamp: "Choose a lamp on the board to break or repair it.",
  lampHelp: " Break lamp (or B) breaks the chosen lamp, or repairs it.",
  sample: "test material",
  // authoring mode
  tabBoard: "Board",
  tabSolution: "Solution",
  tabPalette: "Palette",
  tabChecks: "Checks",
  columns: "Columns",
  rows: "Rows",
  lock: "Locked",
  lockHint: "Locked parts are part of the question; the candidate can move or delete the others.",
  boardHint: "Build what the candidate sees at the start. New parts are locked; select a part and untick Locked to let the candidate change it.",
  solutionHint: "Complete the circuit as a candidate would: the solution shows in review, and a check \"same circuit as the solution\" compares with it.",
  noSolution: "No solution yet.",
  clearSolution: "Remove the solution",
  paletteHint: "The parts the candidate can use. Leave the number empty for as many as they like.",
  inPalette: "In the palette",
  count: "How many",
  unlimited: "any",
  all: "All parts",
  wiresOnly: "Wires only",
  checksHint: "Each check is worth points; the response has a field per check (check1 …) and the sum (score). Ticks: the solution passes.",
  addCheck: "Add a check",
  points: "Points",
  removeCheck: "Remove",
  exact: "exactly (no other components)",
  allowOpenEnds: "open wire ends allowed",
  topology: "Topology of the solution",
  checkName: {
    parts: "Contains the parts",
    closed: "Closed, working circuit",
    series: "In series",
    parallel: "Parallel",
    forward: "Points the right way",
    solution: "Same circuit as the solution",
    lit: "Has current (lamp lit)",
  } as Record<Check["type"], string>,
  withMaterial: "in series with",
  noMaterial: "any (no material)",
  off: "no current (stays off)",
  brokenOnly: "only with a broken lamp",
  brokenHint: "The solution has no broken lamps: a check \"only with a broken lamp\" is not tried on it.",
  anySource: "Any source",
  describe: (check: Check, name: (r: PartRef) => string): string => {
    switch (check.type) {
      case "parts":
        return `Contains ${list(Object.entries(check.count).map(([r, n]) => `${n}× ${name(r as PartRef)}`), "and")}${check.exact ? " (exactly)" : ""}`;
      case "closed":
        return "Closed, working circuit";
      case "series":
        return `${list(check.parts.map(name), "and")} in series`;
      case "parallel":
        return `${list(check.parts.map(name), "and")} parallel`;
      case "forward":
        return `${list(check.parts.map(name), "and")} the right way round`;
      case "solution":
        return "The same circuit as the solution";
      case "lit":
        return `${list(check.parts.map(name), "and")} ${check.off ? "without current" : "with current"}${check.material ? ` with ${name(check.material).toLowerCase()}` : ""}${check.broken ? ", with a lamp broken" : ""}`;
    }
  },
  problemPalette: "The palette is empty: the candidate has nothing to place.",
  problemCheck: (n: number) => `The solution does not pass check ${n}.`,
  problemNoSolution: "A check compares with the solution, but there is none.",
  problemPaletteShort: (part: string) => `The solution uses more of ${part} than the palette has.`,
  problemNotInPalette: (part: string) => `The solution uses ${part}, which is not in the palette.`,
  summary: (score: number, max: number) => `The solution scores ${score} of ${max}.`,
};

const nl: typeof en = {
  part: nlParts,
  source: "bron",
  board: "Schakelbord",
  palette: "Onderdelen",
  cell: (row: number, column: number) => `Rij ${row}, kolom ${column}`,
  empty: "leeg",
  turned: (deg: number) => (deg ? `${deg}° gedraaid` : ""),
  locked: "vast",
  openEnd: "los eind",
  left: (n: number) => `nog ${n}`,
  none: "op",
  rotate: "Draaien",
  remove: "Verwijderen",
  undo: "Ongedaan maken",
  clear: "Opnieuw beginnen",
  help:
    "Sleep een onderdeel naar het bord, of kies een onderdeel en daarna een vakje. Draai met R, de knop of dubbelklikken; sleep een onderdeel om het te verplaatsen. " +
    "Toetsenbord: de pijltjestoetsen gaan over het bord, Enter plaatst het gekozen onderdeel, Shift + pijltje verplaatst een onderdeel, R draait, Delete verwijdert.",
  showHelp: "Uitleg",
  placed: (part: string, row: number, column: number) => `${part} geplaatst in rij ${row}, kolom ${column}.`,
  moved: (part: string, row: number, column: number) => `${part} verplaatst naar rij ${row}, kolom ${column}.`,
  rotated: (part: string, deg: number) => `${part} gedraaid naar ${deg}°.`,
  removed: (part: string) => `${part} verwijderd.`,
  chosen: (part: string) => `${part} gekozen: kies een vakje, of druk op Enter op het bord.`,
  noneLeft: (part: string) => `${part}: er zijn er geen meer.`,
  isLocked: "Dit onderdeel hoort bij de vraag: je kunt het niet veranderen.",
  undone: "Ongedaan gemaakt.",
  cleared: "Het bord is weer zoals aan het begin.",
  openEnds: (n: number) => (n === 1 ? "1 los eind" : `${n} losse einden`),
  closedCircuit: "Gesloten stroomkring",
  breakLamp: "Lampje kapot",
  repairLamp: "Lampje heel maken",
  broken: "kapot",
  lit: "brandt",
  lampBroken: (part: string, row: number, column: number) => `${part} in rij ${row}, kolom ${column} is kapot: er gaat geen stroom doorheen.`,
  lampRepaired: (part: string, row: number, column: number) => `${part} in rij ${row}, kolom ${column} doet het weer.`,
  notALamp: "Kies een lampje op het bord om het kapot of weer heel te maken.",
  lampHelp: " Lampje kapot (of B) maakt het gekozen lampje kapot, of weer heel.",
  sample: "testmateriaal",
  tabBoard: "Bord",
  tabSolution: "Oplossing",
  tabPalette: "Onderdelen",
  tabChecks: "Checks",
  columns: "Kolommen",
  rows: "Rijen",
  lock: "Vast",
  lockHint: "Vaste onderdelen horen bij de vraag; de andere kan de kandidaat verplaatsen of verwijderen.",
  boardHint: "Bouw wat de kandidaat aan het begin ziet. Nieuwe onderdelen zitten vast; selecteer een onderdeel en vink Vast uit als de kandidaat het mag veranderen.",
  solutionHint: "Maak de schakeling af zoals een kandidaat dat zou doen: de oplossing is te zien bij het nakijken, en een check \"dezelfde schakeling als de oplossing\" vergelijkt ermee.",
  noSolution: "Nog geen oplossing.",
  clearSolution: "Oplossing verwijderen",
  paletteHint: "De onderdelen die de kandidaat kan gebruiken. Laat het aantal leeg voor onbeperkt.",
  inPalette: "In het palet",
  count: "Aantal",
  unlimited: "onbeperkt",
  all: "Alle onderdelen",
  wiresOnly: "Alleen draden",
  checksHint: "Elke check levert punten op; het antwoord heeft een veld per check (check1 …) en de som (score). Vinkjes: de oplossing klopt.",
  addCheck: "Check toevoegen",
  points: "Punten",
  removeCheck: "Verwijderen",
  exact: "precies (geen andere onderdelen)",
  allowOpenEnds: "losse draadeinden toegestaan",
  topology: "Topologie van de oplossing",
  checkName: {
    parts: "Bevat de onderdelen",
    closed: "Gesloten, werkende stroomkring",
    series: "In serie",
    parallel: "Parallel",
    forward: "In de goede richting",
    solution: "Dezelfde schakeling als de oplossing",
    lit: "Er gaat stroom door (lampje brandt)",
  },
  withMaterial: "in serie met",
  noMaterial: "geen (geen materiaal)",
  off: "geen stroom (blijft uit)",
  brokenOnly: "alleen met een kapot lampje",
  brokenHint: "De oplossing heeft geen kapotte lampjes: een check \"alleen met een kapot lampje\" wordt er niet op getest.",
  anySource: "Elke bron",
  describe: (check: Check, name: (r: PartRef) => string): string => {
    switch (check.type) {
      case "parts":
        return `Bevat ${list(Object.entries(check.count).map(([r, n]) => `${n}× ${name(r as PartRef).toLowerCase()}`), "en")}${check.exact ? " (precies)" : ""}`;
      case "closed":
        return "Gesloten, werkende stroomkring";
      case "series":
        return `${list(check.parts.map(name), "en")} in serie`;
      case "parallel":
        return `${list(check.parts.map(name), "en")} parallel`;
      case "forward":
        return `${list(check.parts.map(name), "en")} in de goede richting`;
      case "solution":
        return "Dezelfde schakeling als de oplossing";
      case "lit":
        return `${list(check.parts.map(name), "en")} ${check.off ? "zonder stroom" : "met stroom"}${check.material ? ` met ${name(check.material).toLowerCase()}` : ""}${check.broken ? ", met een kapot lampje" : ""}`;
    }
  },
  problemPalette: "Het palet is leeg: de kandidaat kan niets plaatsen.",
  problemCheck: (n: number) => `De oplossing voldoet niet aan check ${n}.`,
  problemNoSolution: "Een check vergelijkt met de oplossing, maar er is er geen.",
  problemPaletteShort: (part: string) => `De oplossing gebruikt meer van ${part.toLowerCase()} dan het palet heeft.`,
  problemNotInPalette: (part: string) => `De oplossing gebruikt ${part.toLowerCase()}, maar dat staat niet in het palet.`,
  summary: (score: number, max: number) => `De oplossing scoort ${score} van ${max}.`,
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
/** The name of a part in a check: a type, or any source. */
export const refName = (t: Texts) => (r: PartRef) => (r === "source" ? t.anySource : t.part[r]);
