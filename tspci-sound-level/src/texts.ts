// The texts of the PCI per language (data-language); the item's own texts are settings.

const en = {
  simulation: "Sound level simulation",
  power: "Power",
  distance: "Distance",
  level: "Sound level",
  soundLevelAt: (distance: string) => `Sound level at ${distance}`,
  decrease: (what: string) => `${what} smaller`,
  increase: (what: string) => `${what} larger`,
  /** What a screen reader hears after a change. */
  announce: (level: string, power: string, distance: string) => `${level} at ${distance} from a source of ${power}.`,
  meter: "Sound level meter",
  target: "Target",
  targetLevel: (level: string) => `Target: ${level}`,
  references: "For comparison",
  standardReferences: "Rustling leaves = 20; Whisper = 30; Conversation = 60; Busy traffic = 80; Pneumatic drill = 100; Rock concert = 110; Pain threshold = 120",
  louderThan: (what: string) => `louder than ${what.toLowerCase()}`,
  softerThanAll: (what: string) => `softer than ${what.toLowerCase()}`,
  yourAnswer: "Your answer",
  answerHint: (what: string) => `The ${what.toLowerCase()} you set is your answer.`,
  fixed: "fixed",
  listener: "Listener",
  view3d: "3D picture",
  sources: {
    speaker: "Speaker",
    walrus: "Walrus",
    whale: "Whale",
    bird: "Bird",
    dog: "Dog",
    siren: "Siren",
  } as Record<string, string>,
  picture: (source: string, distance: string) => `${source} and a listener ${distance} away; sound waves spread out from the source.`,
};

const nl: typeof en = {
  simulation: "Simulatie van de geluidssterkte",
  power: "Vermogen",
  distance: "Afstand",
  level: "Geluidssterkte",
  soundLevelAt: (distance: string) => `Geluidssterkte op ${distance}`,
  decrease: (what: string) => `${what} kleiner`,
  increase: (what: string) => `${what} groter`,
  announce: (level: string, power: string, distance: string) => `${level} op ${distance} van een bron van ${power}.`,
  meter: "Geluidsmeter",
  target: "Doel",
  targetLevel: (level: string) => `Doel: ${level}`,
  references: "Ter vergelijking",
  standardReferences: "Ritselende bladeren = 20; Fluisteren = 30; Gesprek = 60; Druk verkeer = 80; Drilboor = 100; Popconcert = 110; Pijngrens = 120",
  louderThan: (what: string) => `harder dan ${what.toLowerCase()}`,
  softerThanAll: (what: string) => `zachter dan ${what.toLowerCase()}`,
  yourAnswer: "Je antwoord",
  answerHint: (what: string) => `De ${what.toLowerCase()} die je instelt, is je antwoord.`,
  fixed: "vast",
  listener: "Luisteraar",
  view3d: "3D-afbeelding",
  sources: {
    speaker: "Luidspreker",
    walrus: "Walrus",
    whale: "Walvis",
    bird: "Vogel",
    dog: "Hond",
    siren: "Sirene",
  },
  picture: (source: string, distance: string) => `${source} en een luisteraar op ${distance}; geluidsgolven gaan van de bron uit.`,
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
