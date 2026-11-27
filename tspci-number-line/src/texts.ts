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
    empty: "Work out 47 + 38 on the empty number line. Start at 47.",
    double: "A coat costs €80. You get 25% off. How many euros is that? Work it out on the percentage strip.",
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
  // the empty number line
  emptyStartName: "Start number",
  emptySize: (n: number) => `Jump ${n}: how big`,
  emptyLanding: (n: number) => `Jump ${n}: lands on`,
  emptySign: (n: number, sign: "+" | "-") => `Jump ${n}: ${sign === "-" ? "back (−)" : "forward (+)"}. Turn it around`,
  emptyTurn: "Turn the jump around",
  emptyForward: "Jump forward",
  emptyBack: "Jump back",
  emptyHint: "Click the line to make a jump, forward (+) or back (−). Write above the arc how big the jump is, and below the line where you land.",
  emptyAddJump: "Make a jump from where you are: forward or back",
  emptyClickHint: "Click: make a jump",
  emptyChoose: "Which way?",
  emptyRemove: (n: number) => `Remove jump ${n}`,
  emptyAnswer: "Answer",
  emptyGivenStart: "The start is given (the candidate starts there)",
  emptyCorrect: "Correct answer",
  emptyAuthorHint:
    "Work it out on the line on the left, as a candidate would: your jumps are shown in review, and your answer is the correct answer. " +
    "Any other route that is a correct working counts too.",
  // the double number line
  doubleTop: (n: number, label: string) => `Mark ${n}: number above${label ? ` (${label})` : ""}`,
  doubleBottom: (n: number, label: string) => `Mark ${n}: number below${label ? ` (${label})` : ""}`,
  doubleGivenTop: (n: number, label: string) => `Given ${n}: number above${label ? ` (${label})` : ""}`,
  doubleGivenBottom: (n: number, label: string) => `Given ${n}: number below${label ? ` (${label})` : ""}`,
  doubleHandle: (n: number) => `Mark ${n}: place on the strip`,
  doublePlace: (position: number, left: string, right: string) => `${position} of 100, between ${left} and ${right}`,
  doubleLeftEnd: "the left end",
  doubleRightEnd: "the right end",
  doubleAdd: "Add a mark",
  doubleRemove: (n: number) => `Remove mark ${n}`,
  doubleAdded: (n: number) => `Mark ${n} added: write the numbers above and below it.`,
  doubleRemoved: (n: number) => `Mark ${n} removed.`,
  doubleNoMore: "No more marks.",
  doubleHint: (strip: boolean) =>
    `Click the ${strip ? "strip" : "line"} to add a mark, and write the numbers that belong together above and below it. Drag a mark, or use the arrow keys, to move it.`,
  doubleAnswer: "Answer",
  doubleScales: "The two scales",
  doubleTopLabel: "Name above",
  doubleBottomLabel: "Name below",
  doubleLabelHint: "Short, such as % and €, or km and min",
  doubleLook: "Look",
  doubleLooks: { strip: "Strip (a bar, shaded up to the question)", line: "Double number line" },
  doubleQuestion: "Question",
  doubleAsk: { bottom: "Given above, ? below", top: "Given below, ? above" },
  doubleQuestionValue: "The question's number",
  doubleGiven: "given",
  doubleGivenName: (pair: string) => `${pair}: given (the candidate sees it)`,
  doubleMarks: "Marks on the strip",
  doubleNoMarks: "No marks yet.",
  doubleAuthorHint:
    "Add the marks on the strip on the left and write their numbers. Tick the given ones (at least two, such as 0 % ↔ 0 and 100 % ↔ 80): " +
    "the candidate sees those. The others are your working, shown in review; any other correct working counts too. Write the answer under the strip.",
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
  mode: (m: Mode) => ({ points: "Place points", interval: "Mark an interval", jumps: "Jumps", read: "Read off", empty: "Empty number line", double: "Double number line" })[m],
  modeHint: "The mode is a setting of the interaction (data-mode).",
  label: "Label",
  addPoint: "Add a point",
  removeItem: "Remove",
  answerHint: {
    points: "Place every point where it belongs, on the line on the left.",
    interval: "Mark the correct interval on the line, with the right ends.",
    jumps: "Place the start and draw the correct jumps.",
    read: "Add the points and boxes the candidate reads off; and type their value.",
    empty: "Work out the sum on the line, with your own jumps, and write the answer.",
    double: "Set up the strip and work out the question on it, as a candidate would.",
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
      case "noEmptyStart": return "Write the start number on the line, or let the candidate write it.";
      case "noEmptyAnswer": return "Write the correct answer under the line.";
      case "noDoublePairs": return "Give at least two pairs: tick \"given\" at two marks with both numbers written.";
      case "doubleNotLinear": return "The given pairs are not in proportion, or not in order on the strip: both scales have to be linear, with the same ratio.";
      case "noDoubleQuestion": return "Write the question's number, above or below.";
      case "noDoubleAnswer": return "Write the correct answer under the strip.";
      case "doubleAnswerOff": return `The answer does not fit the given pairs: that would be ${p.label.replace("-", "−")}.`;
      case "doubleWorking": return "Your working on the strip is not correct: every mark needs two numbers in proportion, in order, and one with the question's number and the answer.";
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
    empty: "Reken 47 + 38 uit op de lege getallenlijn. Begin bij 47.",
    double: "Een jas kost €80. Je krijgt 25% korting. Hoeveel euro is dat? Reken het uit op de procentenstrook.",
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
  emptyStartName: "Begingetal",
  emptySize: (n) => `Sprong ${n}: hoe groot`,
  emptyLanding: (n) => `Sprong ${n}: kom je uit op`,
  emptySign: (n, sign) => `Sprong ${n}: ${sign === "-" ? "terug (−)" : "vooruit (+)"}. Omdraaien`,
  emptyTurn: "Sprong omdraaien",
  emptyForward: "Sprong vooruit",
  emptyBack: "Sprong terug",
  emptyHint: "Klik op de lijn om een sprong te maken, vooruit (+) of terug (−). Schrijf boven de boog hoe groot de sprong is, en onder de lijn waar je uitkomt.",
  emptyAddJump: "Een sprong maken vanaf waar je bent: vooruit of terug",
  emptyClickHint: "Klik: sprong maken",
  emptyChoose: "Welke kant op?",
  emptyRemove: (n) => `Sprong ${n} weghalen`,
  emptyAnswer: "Antwoord",
  emptyGivenStart: "Het begin is gegeven (de kandidaat begint daar)",
  emptyCorrect: "Goed antwoord",
  emptyAuthorHint:
    "Reken het uit op de lijn links, zoals een kandidaat dat doet: je sprongen zie je terug bij het nakijken, en je antwoord is het goede antwoord. " +
    "Elke andere route die klopt, telt ook.",
  doubleTop: (n, label) => `Streepje ${n}: getal boven${label ? ` (${label})` : ""}`,
  doubleBottom: (n, label) => `Streepje ${n}: getal onder${label ? ` (${label})` : ""}`,
  doubleGivenTop: (n, label) => `Gegeven ${n}: getal boven${label ? ` (${label})` : ""}`,
  doubleGivenBottom: (n, label) => `Gegeven ${n}: getal onder${label ? ` (${label})` : ""}`,
  doubleHandle: (n) => `Streepje ${n}: plaats op de strook`,
  doublePlace: (position, left, right) => `${position} van 100, tussen ${left} en ${right}`,
  doubleLeftEnd: "het linkeruiteinde",
  doubleRightEnd: "het rechteruiteinde",
  doubleAdd: "Streepje zetten",
  doubleRemove: (n) => `Streepje ${n} weghalen`,
  doubleAdded: (n) => `Streepje ${n} gezet: schrijf de getallen erboven en eronder.`,
  doubleRemoved: (n) => `Streepje ${n} weggehaald.`,
  doubleNoMore: "Meer streepjes kunnen niet.",
  doubleHint: (strip) =>
    `Klik op de ${strip ? "strook" : "lijn"} om een streepje te zetten, en schrijf de getallen die bij elkaar horen erboven en eronder. Sleep een streepje, of gebruik de pijltjestoetsen, om het te verplaatsen.`,
  doubleAnswer: "Antwoord",
  doubleScales: "De twee schalen",
  doubleTopLabel: "Naam boven",
  doubleBottomLabel: "Naam onder",
  doubleLabelHint: "Kort, zoals % en €, of km en min",
  doubleLook: "Uiterlijk",
  doubleLooks: { strip: "Strook (een balk, gekleurd tot de vraag)", line: "Dubbele getallenlijn" },
  doubleQuestion: "Vraag",
  doubleAsk: { bottom: "Gegeven boven, ? onder", top: "Gegeven onder, ? boven" },
  doubleQuestionValue: "Het getal van de vraag",
  doubleGiven: "gegeven",
  doubleGivenName: (pair) => `${pair}: gegeven (de kandidaat ziet het)`,
  doubleMarks: "Streepjes op de strook",
  doubleNoMarks: "Nog geen streepjes.",
  doubleAuthorHint:
    "Zet de streepjes op de strook links en schrijf hun getallen. Vink de gegeven aan (minstens twee, zoals 0 % ↔ 0 en 100 % ↔ 80): " +
    "die ziet de kandidaat. De andere zijn je eigen uitwerking, te zien bij het nakijken; elke andere uitwerking die klopt, telt ook. Schrijf het antwoord onder de strook.",
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
  mode: (m) => ({ points: "Punten plaatsen", interval: "Interval aangeven", jumps: "Sprongen", read: "Aflezen", empty: "Lege getallenlijn", double: "Dubbele getallenlijn" })[m],
  modeHint: "De modus is een instelling van de interactie (data-mode).",
  label: "Naam",
  addPoint: "Punt toevoegen",
  removeItem: "Weghalen",
  answerHint: {
    points: "Zet elk punt op zijn plaats op de lijn links.",
    interval: "Geef het goede interval aan op de lijn, met de goede grenzen.",
    jumps: "Plaats het begin en teken de goede sprongen.",
    read: "Voeg de punten en hokjes toe die de kandidaat afleest; en typ hun getal.",
    empty: "Reken de som uit op de lijn, met je eigen sprongen, en schrijf het antwoord op.",
    double: "Zet de strook klaar en reken de vraag erop uit, zoals een kandidaat dat doet.",
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
      case "noEmptyStart": return "Schrijf het begingetal op de lijn, of laat de kandidaat het schrijven.";
      case "noEmptyAnswer": return "Schrijf het goede antwoord onder de lijn.";
      case "noDoublePairs": return "Geef minstens twee paren: vink \"gegeven\" aan bij twee streepjes met beide getallen.";
      case "doubleNotLinear": return "De gegeven paren zijn niet in verhouding, of niet op volgorde op de strook: beide schalen moeten lineair zijn, met dezelfde verhouding.";
      case "noDoubleQuestion": return "Schrijf het getal van de vraag, boven of onder.";
      case "noDoubleAnswer": return "Schrijf het goede antwoord onder de strook.";
      case "doubleAnswerOff": return `Het antwoord past niet bij de gegeven paren: dat zou ${p.label.replace(".", ",").replace("-", "−")} zijn.`;
      case "doubleWorking": return "Je uitwerking op de strook klopt niet: elk streepje heeft twee getallen in verhouding nodig, op volgorde, en één met het getal van de vraag en het antwoord.";
      case "noLabel": return `Punt ${p.label} heeft geen naam.`;
      case "noAnswer": return `Zet punt ${p.label} op de lijn.`;
      case "outOfRange": return `${p.label} ligt niet op de lijn.`;
      case "notOnTick": return `Hokje ${p.label} staat niet bij een streepje.`;
      case "outsideGrid": return `${p.label} ligt tussen de klikposities: de kandidaat kan er niet komen. Geef een marge of klik fijner.`;
    }
  },
};

export const textsFor = (language: string | undefined): Texts => (String(language ?? "en").toLowerCase().startsWith("nl") ? nl : en);
