// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/ForceGravitepci and
// https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Delorpci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The texts of the PCI per language (data-language); the item's own texts are settings.

import type { AnswerField, InstrumentId, Kind, Language, Location, PlaceId } from "./model";

const en = {
  prompt: "Use the instruments to find out the mass, the weight and the volume of the objects.",
  bench: "Lab bench",
  placeGroup: "Where is the lab?",
  places: { earth: "Earth", moon: "Moon", mars: "Mars" } as Record<PlaceId, string>,
  welcome: { earth: "Welcome to Earth", moon: "Welcome to the Moon", mars: "Welcome to Mars" } as Record<PlaceId, string>,
  gravity: (g: string) => `g = ${g} N/kg`,
  instruments: { scale: "Scale", dynamometer: "Dynamometer", cylinder: "Graduated cylinder" } as Record<InstrumentId, string>,
  objects: { statuette: "statuette", meteorite: "meteorite", stone: "stone", cube: "metal cube", custom: "object" } as Record<Kind, string>,
  /** An object in a sentence: "the statuette"; a custom object as the author named it, with "the". */
  the: (kind: Kind, name: string) => `the ${name}`,
  objectsHeading: "Objects",
  dragHint: "Drag an object onto an instrument, or use the buttons.",
  at: {
    table: "on the table", scale: "on the scale", dynamometer: "on the dynamometer", cylinder: "in the cylinder",
  } as Record<Location, string>,
  /** The visible text of a move button. */
  moveShort: { table: "Table", scale: "Scale", dynamometer: "Dynamometer", cylinder: "Cylinder" } as Record<Location, string>,
  /** The accessible name of a move button. */
  moveTo: {
    table: (o: string) => `Put ${o} back on the table`,
    scale: (o: string) => `Put ${o} on the scale`,
    dynamometer: (o: string) => `Hang ${o} on the dynamometer`,
    cylinder: (o: string) => `Put ${o} in the cylinder`,
  } as Record<Location, (o: string) => string>,
  tooBig: (o: string) => `${o} does not fit in the cylinder.`,
  power: "On/Off",
  powerName: "Scale on or off",
  tare: "TARE",
  tareName: "Tare: set the scale to zero",
  water: "Water in the cylinder",
  waterText: (v: string) => `${v} mL poured`,
  reading: "Reading",
  /** Between a label and its value: ": ", in French " : ". */
  colon: ": ",
  off: "off",
  overload: "overload",
  overRange: "beyond the scale of the dynamometer",
  aboveScale: "reading impossible: above the scale",
  overflow: "reading impossible: the cylinder overflows",
  partly: "the object is partly under water",
  empty: "nothing on it",
  /** What a screen reader hears of the picture. */
  figure: (place: string, parts: string) => `Lab bench on ${place}. ${parts}`,
  answersHeading: "Your answers",
  answerLabel: {
    mass: (o: string) => `Mass of ${o}`,
    weight: (o: string, place: string) => `Weight of ${o} on ${place}`,
    volume: (o: string) => `Volume of ${o}`,
    density: (o: string) => `Density of ${o}`,
  } as Record<AnswerField, (o: string, place: string) => string>,
  notANumber: "Type a number.",
  /** Places as they are used after "on": "on the Moon". */
  onPlace: { earth: "Earth", moon: "the Moon", mars: "Mars" } as Record<PlaceId, string>,
};

const nl: typeof en = {
  prompt: "Gebruik de instrumenten om de massa, het gewicht en het volume van de voorwerpen te bepalen.",
  bench: "Practicumtafel",
  placeGroup: "Waar staat het lab?",
  places: { earth: "Aarde", moon: "Maan", mars: "Mars" },
  welcome: { earth: "Welkom op de aarde", moon: "Welkom op de maan", mars: "Welkom op Mars" },
  gravity: (g) => `g = ${g} N/kg`,
  instruments: { scale: "Weegschaal", dynamometer: "Krachtmeter", cylinder: "Maatcilinder" },
  objects: { statuette: "beeldje", meteorite: "meteoriet", stone: "steen", cube: "metalen blokje", custom: "voorwerp" },
  the: (kind, name) => (kind === "custom" ? name : `${kind === "statuette" || kind === "cube" ? "het" : "de"} ${name}`),
  objectsHeading: "Voorwerpen",
  dragHint: "Sleep een voorwerp naar een instrument, of gebruik de knoppen.",
  at: { table: "op tafel", scale: "op de weegschaal", dynamometer: "aan de krachtmeter", cylinder: "in de maatcilinder" },
  moveShort: { table: "Tafel", scale: "Weegschaal", dynamometer: "Krachtmeter", cylinder: "Maatcilinder" },
  moveTo: {
    table: (o) => `Zet ${o} terug op tafel`,
    scale: (o) => `Zet ${o} op de weegschaal`,
    dynamometer: (o) => `Hang ${o} aan de krachtmeter`,
    cylinder: (o) => `Doe ${o} in de maatcilinder`,
  },
  tooBig: (o) => `${o} past niet in de maatcilinder.`,
  power: "Aan/Uit",
  powerName: "Weegschaal aan of uit",
  tare: "TARRA",
  tareName: "Tarra: zet de weegschaal op nul",
  water: "Water in de maatcilinder",
  waterText: (v) => `${v} mL erin gegoten`,
  reading: "Aflezing",
  colon: ": ",
  off: "uit",
  overload: "overbelast",
  overRange: "buiten het bereik van de krachtmeter",
  aboveScale: "aflezen onmogelijk: boven de schaalverdeling",
  overflow: "aflezen onmogelijk: de maatcilinder loopt over",
  partly: "het voorwerp staat maar gedeeltelijk onder water",
  empty: "er hangt of staat niets op",
  figure: (place, parts) => `Practicumtafel op ${place}. ${parts}`,
  answersHeading: "Je antwoorden",
  answerLabel: {
    mass: (o) => `Massa van ${o}`,
    weight: (o, place) => `Gewicht van ${o} op ${place}`,
    volume: (o) => `Volume van ${o}`,
    density: (o) => `Dichtheid van ${o}`,
  },
  notANumber: "Typ een getal.",
  onPlace: { earth: "aarde", moon: "de maan", mars: "Mars" },
};

/** "de le cube" → "du cube" */
const de = (o: string) => `de ${o}`.replace(/^de le /, "du ");

const fr: typeof en = {
  prompt: "Utilise les instruments pour trouver la masse, le poids et le volume des objets.",
  bench: "Paillasse de laboratoire",
  placeGroup: "Où se trouve le laboratoire ?",
  places: { earth: "Terre", moon: "Lune", mars: "Mars" },
  welcome: { earth: "Bienvenue sur la Terre", moon: "Bienvenue sur la Lune", mars: "Bienvenue sur Mars" },
  gravity: (g) => `g = ${g} N/kg`,
  instruments: { scale: "Balance", dynamometer: "Dynamomètre", cylinder: "Éprouvette graduée" },
  objects: { statuette: "statuette", meteorite: "météorite", stone: "pierre", cube: "cube métallique", custom: "objet" },
  the: (kind, name) => (kind === "custom" ? `« ${name} »` : `${kind === "cube" ? "le" : "la"} ${name}`),
  objectsHeading: "Objets",
  dragHint: "Fais glisser un objet sur un instrument, ou utilise les boutons.",
  at: { table: "sur la table", scale: "sur la balance", dynamometer: "au dynamomètre", cylinder: "dans l'éprouvette" },
  moveShort: { table: "Table", scale: "Balance", dynamometer: "Dynamomètre", cylinder: "Éprouvette" },
  moveTo: {
    table: (o) => `Remettre ${o} sur la table`,
    scale: (o) => `Poser ${o} sur la balance`,
    dynamometer: (o) => `Accrocher ${o} au dynamomètre`,
    cylinder: (o) => `Plonger ${o} dans l'éprouvette`,
  },
  tooBig: (o) => `${o} n'entre pas dans l'éprouvette.`,
  power: "Marche/Arrêt",
  powerName: "Allumer ou éteindre la balance",
  tare: "TARE",
  tareName: "Tare : remettre la balance à zéro",
  water: "Eau dans l'éprouvette",
  waterText: (v) => `${v} mL versés`,
  reading: "Lecture",
  colon: " : ",
  off: "éteinte",
  overload: "surcharge",
  overRange: "au-delà de l'échelle du dynamomètre",
  aboveScale: "lecture impossible : au-dessus des graduations",
  overflow: "lecture impossible : l'éprouvette déborde",
  partly: "l'objet n'est que partiellement immergé",
  empty: "rien dessus",
  figure: (place, parts) => `Paillasse sur ${place}. ${parts}`,
  answersHeading: "Tes réponses",
  answerLabel: {
    mass: (o) => `Masse ${de(o)}`,
    weight: (o, place) => `Poids ${de(o)} sur ${place}`,
    volume: (o) => `Volume ${de(o)}`,
    density: (o) => `Masse volumique ${de(o)}`,
  },
  notANumber: "Saisis un nombre.",
  onPlace: { earth: "la Terre", moon: "la Lune", mars: "Mars" },
};

export type Texts = typeof en;
const texts: Record<Language, Texts> = { en, nl, fr };
/** "nl", "fr-FR" → those texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase() as Language] ?? en;
