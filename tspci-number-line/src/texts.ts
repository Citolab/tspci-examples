// The texts of the PCI per language (data-language, or the authoring system's language); the item's own text is the
// prompt.
import type { Mode, Problem } from "./numberline";

const en = {
  line: "Number line",
  examplePrompt: {
    points: "Place point A at 2.75 and point B at −1¼ on the number line.",
    interval: "Mark all numbers x with x ≥ −2 on the number line.",
    jumps: "Start at 2. Draw the jumps for 2 + 4 − 3 on the number line. Where do you land?",
    read: "Which numbers do the points A and B stand for? Which number belongs in the box?",
  } as Record<Mode, string>,
  // points
  tray: "Points to place",
  trayHint: "Drag a point onto the line, or choose it and click the line. Keyboard: Enter on a point puts it on the line.",
  allPlaced: "All points are on the line.",
  pointName: (label: string) => `Point ${label}`,
  notPlaced: "not on the line",
  placed: (label: string, value: string) => `${label} at ${value}.`,
  removed: (label: string) => `${label} is off the line.`,
  chosen: (label: string) => `${label} chosen: click the line to place it.`,
  remove: "Off the line",
  // interval
  fromEnd: "Left end",
  toEnd: "Right end",
  lowEnd: "Lower end",
  highEnd: "Upper end",
  closed: "Closed ● (included)",
  open: "Open ○ (not included)",
  none: "No end (runs on)",
  mark: "Mark an interval",
  markHint: "Drag along the line to mark an interval. Click an end to make it open or closed.",
  intervalIs: (text: string) => `Interval: ${text}.`,
  allNumbers: "all numbers",
  removeInterval: "Remove the interval",
  intervalRemoved: "No interval marked.",
  endName: (which: string) => `${which} of the interval`,
  // jumps
  start: "Start",
  placeStart: "Place the start",
  startAt: (value: string) => `Start at ${value}.`,
  addJump: "Add a jump",
  removeJump: "Remove the last jump",
  jumpsHint: "Click the line to jump there from where you are. Drag a landing point to change a jump.",
  jumpName: (n: number) => `Jump ${n}: landing point`,
  jumped: (n: number, jump: string, from: string, to: string) => `Jump ${n}: ${jump}, from ${from} to ${to}.`,
  jumpRemoved: (n: number) => `Jump ${n} removed.`,
  noMoreJumps: "No more jumps.",
  sum: "Sum",
  // read
  valueOf: (label: string) => `Value of point ${label}`,
  tickBox: (n: number) => `Number in box ${n}`,
  notANumber: "Not a number: write for example 3, −1,5 or 2 3/4.",
  // general
  clear: "Start again",
  cleared: "Everything is off the line.",
  help: "Help",
  helpText:
    "Arrow keys move the chosen point one step, Shift + arrow or Page Up/Down a big step, Home and End go to the ends of the line. " +
    "Delete takes a point off the line. Enter or Space makes an end of an interval open or closed.",
  readOnly: "The correct answer.",
  // authoring
  tabLine: "Line",
  tabAnswer: "Correct answer",
  tabScoring: "Scoring",
  min: "From",
  max: "To",
  tickStep: "Distance between ticks",
  labelStep: "Number at every",
  labelStepHint: "0: only at the ends",
  format: "Numbers as",
  formats: { decimal: "Decimals (2.75)", fraction: "Fractions (11/4)", mixed: "Mixed numbers (2 3/4)" },
  hiddenHint: "Click a number on the line to hide it from the candidate (or show it again).",
  hidden: "Hidden numbers",
  mode: (m: Mode) => ({ points: "Place points", interval: "Mark an interval", jumps: "Jumps", read: "Read off" })[m],
  modeHint: "The mode is a setting of the interaction (data-mode).",
  label: "Label",
  addPoint: "Add a point",
  removeItem: "Remove",
  answerHint: {
    points: "Place every point where it belongs, on the line on the left.",
    interval: "Mark the correct interval on the line, with the right ends.",
    jumps: "Place the start and draw the correct jumps.",
    read: "Add the points and boxes the candidate reads off; and type their value.",
  } as Record<Mode, string>,
  givenStart: "The start is given (the candidate starts there)",
  readPoint: "Point",
  readTick: "Box at a tick",
  value: "Value",
  addReadPoint: "Add a point",
  addReadTick: "Add a box",
  tolerance: "Margin (±)",
  toleranceHint: "How far from the correct value still counts as correct: in the PCI's scoring and the response processing below.",
  maxscore: (n: number) => `Maximum score: ${n}`,
  responseProcessing: "Response processing (QTI)",
  copy: "Copy",
  copied: "Copied",
  problem: (p: Problem): string => {
    switch (p.code) {
      case "range": return "The line needs a start that is smaller than its end.";
      case "tickStep": return "The distance between ticks has to be a number above 0.";
      case "tooManyTicks": return "That many ticks do not fit: use a larger distance between ticks.";
      case "labelStep": return "Numbers have to be at a multiple of the distance between ticks.";
      case "noItems": return "Add at least one point.";
      case "noInterval": return "Mark the correct interval.";
      case "noJumps": return "Draw the correct jumps: a start and at least one jump.";
      case "duplicateLabels": return "Two points have the same label.";
      case "noLabel": return `Point ${p.label} has no label.`;
      case "noAnswer": return `Place point ${p.label} on the line.`;
      case "outOfRange": return `${p.label} is not on the line.`;
      case "notOnTick": return `Box ${p.label} is not at a tick.`;
      case "outsideGrid": return `${p.label} is between the snap positions: the candidate cannot get there. Give a margin or snap finer.`;
    }
  },
};

export type Texts = typeof en;

const nl: Texts = {
  line: "Getallenlijn",
  examplePrompt: {
    points: "Zet punt A bij 2,75 en punt B bij −1¼ op de getallenlijn.",
    interval: "Kleur alle getallen x met x ≥ −2 op de getallenlijn.",
    jumps: "Begin bij 2. Teken de sprongen voor 2 + 4 − 3 op de getallenlijn. Waar kom je uit?",
    read: "Bij welke getallen staan de punten A en B? Welk getal hoort in het hokje?",
  },
  tray: "Punten om te plaatsen",
  trayHint: "Sleep een punt naar de lijn, of kies het en klik op de lijn. Toetsenbord: Enter op een punt zet het op de lijn.",
  allPlaced: "Alle punten staan op de lijn.",
  pointName: (label) => `Punt ${label}`,
  notPlaced: "niet op de lijn",
  placed: (label, value) => `${label} bij ${value}.`,
  removed: (label) => `${label} staat niet meer op de lijn.`,
  chosen: (label) => `${label} gekozen: klik op de lijn om het te plaatsen.`,
  remove: "Van de lijn",
  fromEnd: "Linkergrens",
  toEnd: "Rechtergrens",
  lowEnd: "Ondergrens",
  highEnd: "Bovengrens",
  closed: "Dicht ● (doet mee)",
  open: "Open ○ (doet niet mee)",
  none: "Geen grens (loopt door)",
  mark: "Interval aangeven",
  markHint: "Sleep langs de lijn om een interval aan te geven. Klik op een grens om hem open of dicht te maken.",
  intervalIs: (text) => `Interval: ${text}.`,
  allNumbers: "alle getallen",
  removeInterval: "Interval weghalen",
  intervalRemoved: "Geen interval aangegeven.",
  endName: (which) => `${which} van het interval`,
  start: "Begin",
  placeStart: "Begin plaatsen",
  startAt: (value) => `Begin bij ${value}.`,
  addJump: "Sprong toevoegen",
  removeJump: "Laatste sprong weghalen",
  jumpsHint: "Klik op de lijn om daarheen te springen vanaf waar je bent. Sleep een landingspunt om een sprong te veranderen.",
  jumpName: (n) => `Sprong ${n}: landingspunt`,
  jumped: (n, jump, from, to) => `Sprong ${n}: ${jump}, van ${from} naar ${to}.`,
  jumpRemoved: (n) => `Sprong ${n} weggehaald.`,
  noMoreJumps: "Meer sprongen kunnen niet.",
  sum: "Som",
  valueOf: (label) => `Getal bij punt ${label}`,
  tickBox: (n) => `Getal in hokje ${n}`,
  notANumber: "Geen getal: schrijf bijvoorbeeld 3, −1,5 of 2 3/4.",
  clear: "Opnieuw",
  cleared: "Alles is van de lijn gehaald.",
  help: "Hulp",
  helpText:
    "De pijltjestoetsen zetten het gekozen punt een stap verder, Shift + pijltje of Page Up/Down een grote stap, Home en End gaan naar de uiteinden. " +
    "Delete haalt een punt van de lijn. Enter of spatie maakt een grens van een interval open of dicht.",
  readOnly: "Het goede antwoord.",
  tabLine: "Lijn",
  tabAnswer: "Goed antwoord",
  tabScoring: "Scoren",
  min: "Van",
  max: "Tot",
  tickStep: "Afstand tussen streepjes",
  labelStep: "Getal bij elke",
  labelStepHint: "0: alleen bij de uiteinden",
  format: "Getallen als",
  formats: { decimal: "Kommagetallen (2,75)", fraction: "Breuken (11/4)", mixed: "Gemengde getallen (2 3/4)" },
  hiddenHint: "Klik op een getal op de lijn om het voor de kandidaat te verbergen (of weer te tonen).",
  hidden: "Verborgen getallen",
  mode: (m) => ({ points: "Punten plaatsen", interval: "Interval aangeven", jumps: "Sprongen", read: "Aflezen" })[m],
  modeHint: "De modus is een instelling van de interactie (data-mode).",
  label: "Naam",
  addPoint: "Punt toevoegen",
  removeItem: "Weghalen",
  answerHint: {
    points: "Zet elk punt op zijn plaats op de lijn links.",
    interval: "Geef het goede interval aan op de lijn, met de goede grenzen.",
    jumps: "Plaats het begin en teken de goede sprongen.",
    read: "Voeg de punten en hokjes toe die de kandidaat afleest; en typ hun getal.",
  },
  givenStart: "Het begin is gegeven (de kandidaat begint daar)",
  readPoint: "Punt",
  readTick: "Hokje bij een streepje",
  value: "Getal",
  addReadPoint: "Punt toevoegen",
  addReadTick: "Hokje toevoegen",
  tolerance: "Marge (±)",
  toleranceHint: "Hoe ver van het goede getal nog goed is: in de scoring van de PCI en in de response processing hieronder.",
  maxscore: (n) => `Maximale score: ${n}`,
  responseProcessing: "Response processing (QTI)",
  copy: "Kopiëren",
  copied: "Gekopieerd",
  problem: (p) => {
    switch (p.code) {
      case "range": return "Het begin van de lijn moet kleiner zijn dan het eind.";
      case "tickStep": return "De afstand tussen streepjes moet een getal boven 0 zijn.";
      case "tooManyTicks": return "Zoveel streepjes passen niet: neem een grotere afstand tussen de streepjes.";
      case "labelStep": return "Getallen moeten bij een veelvoud van de afstand tussen streepjes staan.";
      case "noItems": return "Voeg minstens één punt toe.";
      case "noInterval": return "Geef het goede interval aan.";
      case "noJumps": return "Teken de goede sprongen: een begin en minstens één sprong.";
      case "duplicateLabels": return "Twee punten hebben dezelfde naam.";
      case "noLabel": return `Punt ${p.label} heeft geen naam.`;
      case "noAnswer": return `Zet punt ${p.label} op de lijn.`;
      case "outOfRange": return `${p.label} ligt niet op de lijn.`;
      case "notOnTick": return `Hokje ${p.label} staat niet bij een streepje.`;
      case "outsideGrid": return `${p.label} ligt tussen de klikposities: de kandidaat kan er niet komen. Geef een marge of klik fijner.`;
    }
  },
};

export const textsFor = (language: string | undefined): Texts => (String(language ?? "en").toLowerCase().startsWith("nl") ? nl : en);
