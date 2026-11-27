/** The PCI's own texts (the `language` setting for the pupil, the authoring system's language for the author). */
const LEGS_EN = ["left leg", "right leg"];
const LEGS3_EN = ["left leg", "middle leg", "right leg"];
const LEGS_NL = ["linkerbeen", "rechterbeen"];
const LEGS3_NL = ["linkerbeen", "middelste been", "rechterbeen"];

export const TEXTS = {
  en: {
    house: "Split house",
    tree: "Number bond tree",
    roof: "roof",
    rowBox: (row: number, side: number) => `row ${row}, ${side === 0 ? "left" : "right"}`,
    top: "top",
    leg: (split: number, leg: number, legs: number) => `split ${split}, ${(legs === 3 ? LEGS3_EN : LEGS_EN)[leg]}`,
    notANumber: "Enter a number, such as 7",
    notADecimal: "Enter a number, such as 7 or 0,3",
    instruction: {
      house: "Fill in the split house: the two numbers in a row together make the number in the roof.",
      allSplits: "Fill in every split of the number in the roof, each row a different one.",
      tree: "Fill in the number bond tree: the numbers on the legs together make the number above them.",
    },

    // the authoring mode
    authoringTitle: "Set up the number bonds",
    authoringIntro: "Type the numbers the pupil gets. A box you leave empty is one the pupil fills in.",
    model: "Model",
    task: "Task",
    fill: "Fill in the empty boxes",
    allSplits: "All splits of the roof",
    countZero: "0 counts (0|7 and 7|0)",
    orderMatters: "3|4 and 4|3 are different",
    decimals: "Decimals (0,3 and 0,7)",
    addRow: "Add a row",
    removeRow: (row: number) => `Remove row ${row}`,
    split: "Split",
    splitPart: (name: string) => `Split this part: ${name}`,
    unsplit: (split: number) => `Remove split ${split}`,
    legs: (split: number) => `Legs of split ${split}`,
    twoLegs: "2 legs",
    threeLegs: "3 legs",
    splits: "Splits",
    unique: "One answer: an authoring system can fill in the correct response, and match_correct scores it.",
    notUnique: "More than one answer: score with a rule on correct or correctRows (custom).",
    allSplitsRows: (rows: number) => `The house gets ${rows} rows, one for every split.`,
    problems: {
      noRows: "Add at least one row.",
      givenSumWrong: "The given numbers of a row or split do not add up.",
      negative: "A box would have to be negative: a part is larger than its whole.",
      allSplitsRoof: "All splits needs a whole number in the roof, with at most 12 splits.",
      allNumbersGiven: "Every box is given: leave at least one empty for the pupil.",
      decimalsOff: "A given number has decimals: switch on decimals.",
      notANumber: "A box holds something that is not a number.",
    },
  },
  nl: {
    house: "Splitshuis",
    tree: "Splitsboom",
    roof: "dak",
    rowBox: (row: number, side: number) => `rij ${row}, ${side === 0 ? "links" : "rechts"}`,
    top: "top",
    leg: (split: number, leg: number, legs: number) => `splitsing ${split}, ${(legs === 3 ? LEGS3_NL : LEGS_NL)[leg]}`,
    notANumber: "Vul een getal in, zoals 7",
    notADecimal: "Vul een getal in, zoals 7 of 0,3",
    instruction: {
      house: "Vul het splitshuis in: de twee getallen in een rij zijn samen het getal in het dak.",
      allSplits: "Vul alle splitsingen van het getal in het dak in, elke rij een andere.",
      tree: "Vul de splitsboom in: de getallen op de benen zijn samen het getal erboven.",
    },

    authoringTitle: "Splitsing instellen",
    authoringIntro: "Typ de getallen die de leerling krijgt. Een vakje dat je leeg laat, vult de leerling in.",
    model: "Model",
    task: "Opdracht",
    fill: "De lege vakjes invullen",
    allSplits: "Alle splitsingen van het dak",
    countZero: "0 telt mee (0|7 en 7|0)",
    orderMatters: "3|4 en 4|3 zijn verschillend",
    decimals: "Kommagetallen (0,3 en 0,7)",
    addRow: "Rij toevoegen",
    removeRow: (row: number) => `Rij ${row} verwijderen`,
    split: "Splitsen",
    splitPart: (name: string) => `Dit deel splitsen: ${name}`,
    unsplit: (split: number) => `Splitsing ${split} verwijderen`,
    legs: (split: number) => `Benen van splitsing ${split}`,
    twoLegs: "2 benen",
    threeLegs: "3 benen",
    splits: "Splitsingen",
    unique: "Eén antwoord: een auteursomgeving kan het goede antwoord invullen, en match_correct scoort het.",
    notUnique: "Meer dan één antwoord: scoor met een regel op correct of correctRows (custom).",
    allSplitsRows: (rows: number) => `Het huis krijgt ${rows} rijen, één per splitsing.`,
    problems: {
      noRows: "Voeg minstens één rij toe.",
      givenSumWrong: "De gegeven getallen van een rij of splitsing kloppen niet.",
      negative: "Een vakje zou negatief worden: een deel is groter dan zijn geheel.",
      allSplitsRoof: "Alle splitsingen heeft een heel getal in het dak nodig, met hoogstens 12 splitsingen.",
      allNumbersGiven: "Elk vakje is gegeven: laat er minstens één leeg voor de leerling.",
      decimalsOff: "Een gegeven getal is een kommagetal: zet kommagetallen aan.",
      notANumber: "In een vakje staat iets dat geen getal is.",
    },
  },
};
export type Texts = (typeof TEXTS)["en"];
export type Language = keyof typeof TEXTS;
export const languageOf = (language?: string): Language => ((language ?? "").slice(0, 2) === "nl" ? "nl" : "en");
export const textsFor = (language?: string): Texts => TEXTS[languageOf(language)];
