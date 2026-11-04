// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Volcanismepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The texts of the PCI per language (data-language); the item's own texts are settings.
import type { Eruption, Language, Outcome, Viscosity } from "./model";

const en = {
  simulation: "Volcano model",
  step1: "Step 1: pour mashed potato into the right branch of the U-tube",
  step1Hint: "Choose how thick the mashed potato is.",
  pour: (what: string) => `Pour ${what}`,
  step2: "Step 2: put in the effervescent tablet and close the tube",
  tabletsLegend: "Number of effervescent tablets",
  tablets: (n: number) => (n === 1 ? "1 tablet" : `${n} tablets`),
  start: (n: number) => (n === 1 ? "Put in the tablet and close" : `Put in ${n} tablets and close`),
  next: "Next step",
  again: "Start again",
  viscosity: { fluid: "runny mashed potato", medium: "thick mashed potato", compact: "stiff mashed potato" } as Record<Viscosity, string>,
  viscosityName: { fluid: "Runny", medium: "Thick", compact: "Stiff" } as Record<Viscosity, string>,
  outcome: { flow: "Lava flow", dome: "Dome", explosion: "Explosion" } as Record<Outcome, string>,
  outcomeLong: {
    flow: "The purée overflows and runs down the sides of the tube.",
    dome: "The purée is pushed out as a thick plug that piles up on the tube.",
    explosion: "The pressure builds up until blobs of purée are thrown out of the tube.",
  } as Record<Outcome, string>,
  eruption: { effusive: "Effusive eruption", explosive: "Explosive eruption" } as Record<Eruption, string>,
  eruptionShort: { effusive: "effusive", explosive: "explosive" } as Record<Eruption, string>,
  reality: {
    effusive: "Fluid lava lets the gas escape easily: it flows out in streams, as on Hawaii (Kīlauea) or at Piton de la Fournaise.",
    explosive: "Viscous lava traps the gas: it piles up as a dome or the pressure blows it out, as at Montagne Pelée (1902) or Mount St Helens (1980).",
  } as Record<Eruption, string>,
  models: "In reality:",
  /** what the screen reader hears per stage */
  narrate: {
    poured: (what: string) => `The ${what} is in the right branch, on top of the water.`,
    tablet: (n: number) => `${n === 1 ? "The tablet drops" : `${n} tablets drop`} into the water of the left branch and the stopper closes the tube.`,
    gas: "Bubbles of gas rise and collect under the stopper: the pressure rises.",
    rise: "The gas pushes the water down on the left, so the purée rises on the right.",
    reset: "The tube is back as at the start: water only.",
  },
  stage: (n: number, of: number) => `Stage ${n} of ${of}`,
  picture: (state: string) => `A U-shaped glass tube with water. ${state}`,
  pictureEmpty: "No purée yet.",
  picturePoured: (what: string) => `The right branch holds ${what}.`,
  pictureDone: (what: string, outcome: string) => `The right branch held ${what}; result: ${outcome.toLowerCase()}.`,
  log: "Your experiments",
  logColumns: { viscosity: "Mashed potato", tablets: "Tablets", outcome: "Result", eruption: "Eruption type" },
  noExperiments: "No experiments yet.",
  task: "Task",
  taskViscosity: "Which mashed potato gives each result?",
  taskEruption: "Which type of eruption does each result model?",
  choose: "Choose…",
  readOnly: "Review: the simulation cannot be changed.",
};
export type Texts = typeof en;

const nl: Texts = {
  simulation: "Vulkaanmodel",
  step1: "Stap 1: giet puree in de rechterbuis van de U-buis",
  step1Hint: "Kies hoe dik de puree is.",
  pour: (what) => `Giet ${what}`,
  step2: "Stap 2: doe het bruistablet erin en sluit de buis af",
  tabletsLegend: "Aantal bruistabletten",
  tablets: (n) => (n === 1 ? "1 tablet" : `${n} tabletten`),
  start: (n) => (n === 1 ? "Tablet erin en afsluiten" : `${n} tabletten erin en afsluiten`),
  next: "Volgende stap",
  again: "Opnieuw beginnen",
  viscosity: { fluid: "dunne puree", medium: "dikke puree", compact: "stevige puree" },
  viscosityName: { fluid: "Dun", medium: "Dik", compact: "Stevig" },
  outcome: { flow: "Lavastroom", dome: "Koepel", explosion: "Explosie" },
  outcomeLong: {
    flow: "De puree loopt over de rand en stroomt langs de buis naar beneden.",
    dome: "De puree wordt als een dikke prop naar buiten geduwd en stapelt zich op de buis op.",
    explosion: "De druk loopt op tot er klodders puree uit de buis worden geslingerd.",
  },
  eruption: { effusive: "Effusieve uitbarsting", explosive: "Explosieve uitbarsting" },
  eruptionShort: { effusive: "effusief", explosive: "explosief" },
  reality: {
    effusive: "Vloeibare lava laat het gas makkelijk ontsnappen: ze stroomt uit in lavastromen, zoals op Hawaï (Kīlauea) of bij de Piton de la Fournaise.",
    explosive: "Taaie lava houdt het gas vast: ze stapelt zich op tot een koepel of de druk blaast haar weg, zoals bij de Montagne Pelée (1902) of Mount St Helens (1980).",
  },
  models: "In werkelijkheid:",
  narrate: {
    poured: (what) => `De ${what} zit in de rechterbuis, boven op het water.`,
    tablet: (n) => `${n === 1 ? "Het tablet valt" : `${n} tabletten vallen`} in het water van de linkerbuis en de stop sluit de buis af.`,
    gas: "Gasbellen stijgen op en verzamelen zich onder de stop: de druk stijgt.",
    rise: "Het gas duwt het water links omlaag, dus de puree stijgt rechts.",
    reset: "De buis is weer als bij het begin: alleen water.",
  },
  stage: (n, of) => `Fase ${n} van ${of}`,
  picture: (state) => `Een U-vormige glazen buis met water. ${state}`,
  pictureEmpty: "Nog geen puree.",
  picturePoured: (what) => `In de rechterbuis zit ${what}.`,
  pictureDone: (what, outcome) => `In de rechterbuis zat ${what}; resultaat: ${outcome.toLowerCase()}.`,
  log: "Je experimenten",
  logColumns: { viscosity: "Puree", tablets: "Tabletten", outcome: "Resultaat", eruption: "Type uitbarsting" },
  noExperiments: "Nog geen experimenten.",
  task: "Opdracht",
  taskViscosity: "Welke puree geeft welk resultaat?",
  taskEruption: "Welk type uitbarsting stelt elk resultaat voor?",
  choose: "Kies…",
  readOnly: "Inzage: de simulatie kan niet veranderd worden.",
};

const fr: Texts = {
  simulation: "Modèle de volcan",
  step1: "Étape 1 : versez de la purée dans la branche droite du tube en U",
  step1Hint: "Choisissez la consistance de la purée.",
  pour: (what) => `Verser la ${what}`,
  step2: "Étape 2 : introduisez le cachet effervescent et bouchez",
  tabletsLegend: "Nombre de cachets effervescents",
  tablets: (n) => (n === 1 ? "1 cachet" : `${n} cachets`),
  start: (n) => (n === 1 ? "Introduire le cachet et boucher" : `Introduire ${n} cachets et boucher`),
  next: "Étape suivante",
  again: "Rétablir les conditions initiales",
  viscosity: { fluid: "purée fluide", medium: "purée épaisse", compact: "purée compacte" },
  viscosityName: { fluid: "Fluide", medium: "Épaisse", compact: "Compacte" },
  outcome: { flow: "Coulée", dome: "Dôme", explosion: "Explosion" },
  outcomeLong: {
    flow: "La purée déborde et s'écoule le long du tube.",
    dome: "La purée est poussée hors du tube en un bouchon épais qui s'accumule.",
    explosion: "La pression monte jusqu'à projeter des morceaux de purée hors du tube.",
  },
  eruption: { effusive: "Éruption effusive", explosive: "Éruption explosive" },
  eruptionShort: { effusive: "effusive", explosive: "explosive" },
  reality: {
    effusive: "Une lave fluide laisse le gaz s'échapper facilement : elle s'écoule en coulées, comme à Hawaï (Kīlauea) ou au Piton de la Fournaise.",
    explosive: "Une lave visqueuse retient le gaz : elle forme un dôme ou la pression la projette, comme à la Montagne Pelée (1902) ou au mont Saint Helens (1980).",
  },
  models: "Dans la réalité :",
  narrate: {
    poured: (what) => `La ${what} est dans la branche droite, au-dessus de l'eau.`,
    tablet: (n) => `${n === 1 ? "Le cachet tombe" : `${n} cachets tombent`} dans l'eau de la branche gauche et le bouchon ferme le tube.`,
    gas: "Des bulles de gaz montent et s'accumulent sous le bouchon : la pression augmente.",
    rise: "Le gaz repousse l'eau vers le bas à gauche, donc la purée monte à droite.",
    reset: "Le tube est revenu aux conditions initiales : de l'eau seulement.",
  },
  stage: (n, of) => `Étape ${n} sur ${of}`,
  picture: (state) => `Un tube en verre en forme de U contenant de l'eau. ${state}`,
  pictureEmpty: "Pas encore de purée.",
  picturePoured: (what) => `La branche droite contient de la ${what}.`,
  pictureDone: (what, outcome) => `La branche droite contenait de la ${what} ; résultat : ${outcome.toLowerCase()}.`,
  log: "Vos expériences",
  logColumns: { viscosity: "Purée", tablets: "Cachets", outcome: "Résultat", eruption: "Type d'éruption" },
  noExperiments: "Pas encore d'expérience.",
  task: "Tâche",
  taskViscosity: "Quelle purée donne chaque résultat ?",
  taskEruption: "Quel type d'éruption chaque résultat modélise-t-il ?",
  choose: "Choisir…",
  readOnly: "Consultation : la simulation ne peut pas être modifiée.",
};

export const textsFor = (language: Language): Texts => (language === "nl" ? nl : language === "fr" ? fr : en);

/** Integers as the candidate reads them (no decimals occur; a score as "2 / 3"). */
export const formatInteger = (value: number, language: Language) =>
  new Intl.NumberFormat(language === "nl" ? "nl-NL" : language === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: 0 }).format(value);
