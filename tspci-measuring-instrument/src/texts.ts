// The texts of the PCI per language (data-language, or the authoring system's language); the item's own text is the
// prompt. Numbers come in already formatted (instrument.ts formatNumber).
import type { Kind, Mode, Problem } from "./instrument";

/** The kind of quantity a meter measures, from its unit. */
export const quantityOf = (unit: string): "voltage" | "current" | "other" =>
  /^(m|k|µ|u)?V$/.test(unit.trim()) ? "voltage" : /^(m|µ|u)?A$/.test(unit.trim()) ? "current" : "other";

const en = {
  name: {
    thermometer: "Thermometer", cylinder: "Measuring cylinder", meter: "Meter", scale: "Kitchen scale", ruler: "Ruler",
    caliper: "Vernier caliper", clock: "Clock", stopwatch: "Stopwatch", manometer: "Pressure gauge",
  } as Record<Kind, string>,
  voltmeter: "Voltmeter",
  ammeter: "Ammeter",
  mode: { read: "Read off", set: "Set", range: "Choose the range" } as Record<Mode, string>,
  readPrompt: {
    thermometer: "Read off the thermometer. What is the temperature?",
    cylinder: "Read off the measuring cylinder at the bottom of the meniscus. How much liquid is in it?",
    meter: "Read off the meter. What does it show?",
    scale: "Read off the scale. How heavy is what lies on it?",
    ruler: "How long is the pencil? Read it off the ruler.",
    caliper: "Read off the vernier caliper. How thick is the block?",
    clock: "What time does the clock show?",
    stopwatch: "Read off the stopwatch. How many seconds does it show?",
    manometer: "Read off the tyre pressure gauge. What is the pressure?",
  } as Record<Kind, string>,
  setPrompt: (kind: Kind, value: string) => ({
    thermometer: `Set the thermometer to ${value}: drag the top of the liquid.`,
    cylinder: `Fill the measuring cylinder to ${value}: drag the liquid level.`,
    meter: `Move the needle of the meter to ${value}.`,
    scale: `Move the pointer of the scale to ${value}.`,
    ruler: `Make the pencil ${value} long: drag its point along the ruler.`,
    caliper: `Open the vernier caliper to ${value}: drag the sliding jaw.`,
    clock: `Set the clock to ${value}: drag the minute hand.`,
    stopwatch: `Set the stopwatch to ${value}: drag the second hand.`,
    manometer: `Move the needle of the pressure gauge to ${value}.`,
  })[kind],
  rangePrompt: (quantity: "voltage" | "current" | "other", value: string) =>
    `You expect ${quantity === "voltage" ? "a voltage" : quantity === "current" ? "a current" : "a value"} of about ${value}. Which range of the meter do you choose?`,
  figure: (name: string, from: string, to: string, unit: string) => `${name}, scale from ${from} to ${to}${unit ? ` ${unit}` : ""}`,
  clockFigure: "Clock with an hour hand and a minute hand",
  stopwatchFigure: "Stopwatch: the big dial in seconds, the small dial in minutes",
  answer: "Your reading",
  answerTime: "Your reading (h:mm)",
  rangeGroup: "Range",
  rangeChosen: (range: string) => `Range ${range} chosen.`,
  plugged: (range: string) => `Range: ${range}`,
  notSet: "not set yet",
  setTo: (value: string) => `Set to ${value}.`,
  answered: (value: string) => `Your reading: ${value}.`,
  notANumber: "That is not a number yet.",
  notATime: "Type a time as h:mm, for example 3:45.",
  helpSet: "Drag on the instrument, or use the arrow keys (Page Up and Page Down for bigger steps, Home and End for the ends).",
  helpZoom: "Move the pointer over the instrument to magnify it. With the keyboard: focus the instrument and move the magnifier with the arrow keys.",
  helpRange: "Choose a range with the buttons (or the arrow keys).",
  magnifier: "magnifier",
  correct: "Correct answer",
  slider: (name: string) => name,
  // authoring mode
  instrument: "Instrument",
  modeLabel: "Task",
  min: "Scale from",
  max: "Scale to",
  major: "Labelled every",
  minor: "Divisions between labels",
  unit: "Unit",
  precision: "Reading precision (step)",
  ranges: "Ranges (separated by spaces)",
  range: "Range plugged in",
  vernier: "Vernier divisions",
  zoomLabel: "Magnifier on hover and focus",
  tolerance: "Margin for the score (0: exact)",
  valueRead: "Value the instrument shows",
  valueSet: "Value to set (the correct answer)",
  valueRange: "Value the candidate expects",
  dragHint: "Drag on the instrument, or type the value.",
  correctResponse: "Correct response",
  responseProcessing: "Response processing for the item",
  none: "none",
  problems: "To fix",
  problem: (p: Problem, format: (v: number) => string): string => {
    switch (p.code) {
      case "maxNotAboveMin": return "The end of the scale must be above its start.";
      case "majorDoesNotFit": return "The labelled step does not fit a whole number of times in the scale.";
      case "tooManyTicks": return "The scale has too many divisions (at most 600).";
      case "valueOutside": return `The value must lie between ${format(p.low)} and ${format(p.high)}.`;
      case "valueOffPrecision": return "The value is not a whole number of reading steps: it cannot be set or read exactly.";
      case "rangeOnlyMeter": return "Choosing the range only works with a meter.";
      case "noRangeFits": return "No range is large enough for the value.";
      case "fewRanges": return "Give at least two ranges to choose from.";
      case "vernier": return "The vernier needs 2 to 50 divisions.";
    }
  },
};

export type Texts = typeof en;

const nl: Texts = {
  name: {
    thermometer: "Thermometer", cylinder: "Maatcilinder", meter: "Meter", scale: "Keukenweegschaal", ruler: "Liniaal",
    caliper: "Schuifmaat", clock: "Klok", stopwatch: "Stopwatch", manometer: "Bandenspanningsmeter",
  },
  voltmeter: "Voltmeter",
  ammeter: "Stroommeter",
  mode: { read: "Aflezen", set: "Instellen", range: "Bereik kiezen" },
  readPrompt: {
    thermometer: "Lees de thermometer af. Hoe hoog is de temperatuur?",
    cylinder: "Lees de maatcilinder af aan de onderkant van de meniscus. Hoeveel vloeistof zit erin?",
    meter: "Lees de meter af. Wat geeft hij aan?",
    scale: "Lees de weegschaal af. Hoe zwaar is wat erop ligt?",
    ruler: "Hoe lang is het potlood? Lees het af op de liniaal.",
    caliper: "Lees de schuifmaat af. Hoe dik is het blokje?",
    clock: "Hoe laat is het op de klok?",
    stopwatch: "Lees de stopwatch af. Hoeveel seconden geeft hij aan?",
    manometer: "Lees de bandenspanningsmeter af. Hoe groot is de druk?",
  },
  setPrompt: (kind, value) => ({
    thermometer: `Zet de thermometer op ${value}: sleep de bovenkant van de vloeistof.`,
    cylinder: `Vul de maatcilinder tot ${value}: sleep het vloeistofniveau.`,
    meter: `Zet de wijzer van de meter op ${value}.`,
    scale: `Zet de wijzer van de weegschaal op ${value}.`,
    ruler: `Maak het potlood ${value} lang: sleep de punt langs de liniaal.`,
    caliper: `Zet de schuifmaat open op ${value}: sleep de schuivende bek.`,
    clock: `Zet de klok op ${value}: sleep de grote wijzer.`,
    stopwatch: `Zet de stopwatch op ${value}: sleep de secondewijzer.`,
    manometer: `Zet de wijzer van de bandenspanningsmeter op ${value}.`,
  })[kind],
  rangePrompt: (quantity, value) =>
    `Je verwacht ${quantity === "voltage" ? "een spanning" : quantity === "current" ? "een stroomsterkte" : "een waarde"} van ongeveer ${value}. Welk bereik van de meter kies je?`,
  figure: (name, from, to, unit) => `${name}, schaal van ${from} tot ${to}${unit ? ` ${unit}` : ""}`,
  clockFigure: "Klok met een kleine en een grote wijzer",
  stopwatchFigure: "Stopwatch: de grote wijzerplaat in seconden, de kleine in minuten",
  answer: "Jouw aflezing",
  answerTime: "Jouw aflezing (u:mm)",
  rangeGroup: "Bereik",
  rangeChosen: (range) => `Bereik ${range} gekozen.`,
  plugged: (range) => `Bereik: ${range}`,
  notSet: "nog niet ingesteld",
  setTo: (value) => `Ingesteld op ${value}.`,
  answered: (value) => `Jouw aflezing: ${value}.`,
  notANumber: "Dat is nog geen getal.",
  notATime: "Typ een tijd als u:mm, bijvoorbeeld 3:45.",
  helpSet: "Sleep op het instrument, of gebruik de pijltjestoetsen (Page Up en Page Down voor grotere stappen, Home en End voor de uiteinden).",
  helpZoom: "Beweeg de muis over het instrument om het te vergroten. Met het toetsenbord: zet de focus op het instrument en verplaats het vergrootglas met de pijltjestoetsen.",
  helpRange: "Kies een bereik met de knoppen (of de pijltjestoetsen).",
  magnifier: "vergrootglas",
  correct: "Goede antwoord",
  slider: (name) => name,
  instrument: "Instrument",
  modeLabel: "Opdracht",
  min: "Schaal van",
  max: "Schaal tot",
  major: "Getal bij elke",
  minor: "Verdeling tussen de getallen",
  unit: "Eenheid",
  precision: "Afleesnauwkeurigheid (stap)",
  ranges: "Bereiken (met spaties ertussen)",
  range: "Ingeplugd bereik",
  vernier: "Verdeling van de nonius",
  zoomLabel: "Vergrootglas bij muis en focus",
  tolerance: "Marge voor de score (0: precies)",
  valueRead: "Waarde die het instrument aangeeft",
  valueSet: "In te stellen waarde (het goede antwoord)",
  valueRange: "Waarde die de kandidaat verwacht",
  dragHint: "Sleep op het instrument, of typ de waarde.",
  correctResponse: "Goed antwoord",
  responseProcessing: "Responseverwerking voor het item",
  none: "geen",
  problems: "Nog te doen",
  problem: (p, format) => {
    switch (p.code) {
      case "maxNotAboveMin": return "Het einde van de schaal moet boven het begin liggen.";
      case "majorDoesNotFit": return "De stap tussen de getallen past geen heel aantal keren in de schaal.";
      case "tooManyTicks": return "De schaal heeft te veel streepjes (hoogstens 600).";
      case "valueOutside": return `De waarde moet tussen ${format(p.low)} en ${format(p.high)} liggen.`;
      case "valueOffPrecision": return "De waarde is geen heel aantal afleesstappen: je kunt hem niet precies instellen of aflezen.";
      case "rangeOnlyMeter": return "Een bereik kiezen kan alleen bij een meter.";
      case "noRangeFits": return "Geen enkel bereik is groot genoeg voor de waarde.";
      case "fewRanges": return "Geef minstens twee bereiken om uit te kiezen.";
      case "vernier": return "De nonius heeft 2 tot 50 streepjes nodig.";
    }
  },
};

const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;

/** The name of the instrument: a meter is a voltmeter or an ammeter by its unit. */
export const nameOf = (t: Texts, kind: Kind, unit: string) => {
  if (kind !== "meter") return t.name[kind];
  const q = quantityOf(unit);
  return q === "voltage" ? t.voltmeter : q === "current" ? t.ammeter : t.name.meter;
};
