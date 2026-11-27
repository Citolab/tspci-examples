/** The PCI's own texts (the `language` setting for the pupil, the authoring system's language for the author). */
import type { PictureTexts } from "./drawings";

export type Language = "en" | "nl";
export const languageOf = (value: unknown): Language => (String(value ?? "").slice(0, 2).toLowerCase() === "nl" ? "nl" : "en");

const PLACES_EN = [
  ["top left", "top", "top right"],
  ["left", "middle", "right"],
  ["bottom left", "bottom", "bottom right"],
];
const PLACES_NL = [
  ["linksboven", "bovenaan", "rechtsboven"],
  ["links", "in het midden", "rechts"],
  ["linksonder", "onderaan", "rechtsonder"],
];

export const TEXTS = {
  en: {
    picture: { helmetSign: "HELMET ON", exit: "EXIT", wetFloor: ["WET", "FLOOR"], oil: "OIL", fireBlanket: ["FIRE", "BLANKET"], firstAid: "FIRST AID" } as PictureTexts,
    instruction: (limit: number) =>
      limit > 0
        ? `Look carefully at the picture. Find ${limit} unsafe ${limit === 1 ? "situation" : "situations"}, and tap ${limit === 1 ? "it" : "them"}.`
        : "Look carefully at the picture. Tap every unsafe situation.",
    penalty: "Careful: a mark on a safe spot costs a point.",
    howTo: "Tap a spot to mark it. Tap a mark again to remove it.",
    keyboard: "Keyboard: the arrow keys go from spot to spot, Space marks a spot or removes its mark.",
    pictureLabel: (scene: string) => `Picture: ${scene}`,
    spot: (i: number, n: number, label: string) => `Spot ${i} of ${n}: ${label}.`,
    markedAs: (n: number) => `Marked, mark ${n}.`,
    notMarked: "Not marked.",
    placed: (n: number, label: string) => `Mark ${n} placed: ${label}.`,
    removed: (label: string) => `Mark removed: ${label}.`,
    full: (n: number) => `You have used all ${n} marks. Remove a mark first.`,
    somewhere: (row: number, col: number) => `a spot at the ${PLACES_EN[row][col]}`.replace("at the middle", "in the middle"),
    yourMarks: "Your marks",
    noMarks: "No marks yet.",
    count: (n: number, limit: number) => (limit > 0 ? `${n} of ${limit} marks` : `${n} ${n === 1 ? "mark" : "marks"}`),
    remove: "Remove",
    removeMark: (n: number, label: string) => `Remove mark ${n}: ${label}`,
    // after answering
    hazards: "The hazards",
    summary: (found: number, total: number) => `You found ${found} of the ${total} ${total === 1 ? "hazard" : "hazards"}.`,
    summaryWrong: (wrong: number) => (wrong === 1 ? "1 mark is on a safe spot." : `${wrong} marks are on a safe spot.`),
    solution: (total: number) => `The ${total} ${total === 1 ? "hazard" : "hazards"} in the picture:`,
    found: "found",
    missed: "not found",
    safeMarks: "Marks on a safe spot",
    safeHere: "This is safe.",
    nothingHere: "There is no hazard here.",
    legendFound: "found",
    legendMissed: "not found",
    legendWrong: "safe spot",
    hazardNumber: (n: number) => `Hazard ${n}`,
    yourMark: (n: number) => `Mark ${n}`,
  },
  nl: {
    picture: { helmetSign: "HELM OP", exit: "NOODUITGANG", wetFloor: ["NATTE", "VLOER"], oil: "OLIE", fireBlanket: ["BLUS-", "DEKEN"], firstAid: "EHBO" } as PictureTexts,
    instruction: (limit: number) =>
      limit > 0
        ? `Kijk goed naar de plaat. Zoek ${limit} ${limit === 1 ? "onveilige situatie" : "onveilige situaties"} en tik ${limit === 1 ? "hem" : "ze"} aan.`
        : "Kijk goed naar de plaat. Tik elke onveilige situatie aan.",
    penalty: "Let op: een markering op een veilige plek kost een punt.",
    howTo: "Tik een plek aan om hem te markeren. Tik nog een keer op een markering om hem weg te halen.",
    keyboard: "Toetsenbord: met de pijltjestoetsen ga je van plek naar plek, met de spatiebalk markeer je een plek of haal je de markering weg.",
    pictureLabel: (scene: string) => `Plaat: ${scene}`,
    spot: (i: number, n: number, label: string) => `Plek ${i} van ${n}: ${label}.`,
    markedAs: (n: number) => `Gemarkeerd, markering ${n}.`,
    notMarked: "Niet gemarkeerd.",
    placed: (n: number, label: string) => `Markering ${n} gezet: ${label}.`,
    removed: (label: string) => `Markering weggehaald: ${label}.`,
    full: (n: number) => `Je hebt alle ${n} markeringen gebruikt. Haal eerst een markering weg.`,
    somewhere: (row: number, col: number) => `een plek ${PLACES_NL[row][col]}`,
    yourMarks: "Jouw markeringen",
    noMarks: "Nog geen markeringen.",
    count: (n: number, limit: number) => (limit > 0 ? `${n} van ${limit} markeringen` : `${n} ${n === 1 ? "markering" : "markeringen"}`),
    remove: "Weghalen",
    removeMark: (n: number, label: string) => `Markering ${n} weghalen: ${label}`,
    hazards: "De gevaren",
    summary: (found: number, total: number) => `Je hebt ${found} van de ${total} ${total === 1 ? "gevaar" : "gevaren"} gevonden.`,
    summaryWrong: (wrong: number) => (wrong === 1 ? "1 markering staat op een veilige plek." : `${wrong} markeringen staan op een veilige plek.`),
    solution: (total: number) => `De ${total} ${total === 1 ? "gevaar" : "gevaren"} op de plaat:`,
    found: "gevonden",
    missed: "niet gevonden",
    safeMarks: "Markeringen op een veilige plek",
    safeHere: "Dit is veilig.",
    nothingHere: "Hier is geen gevaar.",
    legendFound: "gevonden",
    legendMissed: "niet gevonden",
    legendWrong: "veilige plek",
    hazardNumber: (n: number) => `Gevaar ${n}`,
    yourMark: (n: number) => `Markering ${n}`,
  },
};

export type Texts = (typeof TEXTS)["en"];
export const textsFor = (language: unknown): Texts => TEXTS[languageOf(language)];
