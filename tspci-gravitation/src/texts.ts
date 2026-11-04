// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/NouvelleTerrepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The texts of the PCI per language (data-language); the item's own texts are settings.

import type { Language } from "./physics";

const en = {
  simulation: "Gravitation simulation",
  picture: (distance: string, radius: string) => `A star on the left and a planet ${distance} away, with a radius of ${radius}.`,
  force: "Gravitational force",
  forceValue: "Value of the gravitational force",
  /** Read aloud: "6.67 times 10 to the power 26 newtons". */
  spoken: (mantissa: string, exponent: string) => `${mantissa} times 10 to the power ${exponent} newtons`,
  names: { distance: "Distance between planet and star", mass: "Mass of the planet", radius: "Radius of the planet" },
  short: { distance: "Distance", mass: "Mass", radius: "Radius" },
  units: { distance: "million km", mass: "× 10²³ kg", radius: "km" },
  spokenUnits: { distance: "million kilometres", mass: "times 10 to the power 23 kilograms", radius: "kilometres" },
  decrease: (what: string) => `${what} smaller`,
  increase: (what: string) => `${what} larger`,
  announce: (force: string) => `Gravitational force: ${force}.`,
  record: "Record measurement",
  recorded: (count: number) => `Measurement ${count} recorded.`,
  measurements: "Measurements",
  noMeasurements: "No measurements yet. Set the sliders and record a measurement to compare.",
  remove: (row: number) => `Remove measurement ${row}`,
  removed: (row: number) => `Measurement ${row} removed.`,
  full: (max: number) => `The table keeps the last ${max} measurements.`,
  number: "No.",
  question: "Which quantities influence the gravitational force? Tick all that apply.",
  fixed: "fixed",
  star: "Star",
  planet: "Planet",
};
export type Texts = typeof en;

const nl: Texts = {
  simulation: "Simulatie van de gravitatiekracht",
  picture: (distance, radius) => `Een ster links en een planeet op ${distance}, met een straal van ${radius}.`,
  force: "Gravitatiekracht",
  forceValue: "Waarde van de gravitatiekracht",
  spoken: (mantissa, exponent) => `${mantissa} maal 10 tot de macht ${exponent} newton`,
  names: { distance: "Afstand tussen planeet en ster", mass: "Massa van de planeet", radius: "Straal van de planeet" },
  short: { distance: "Afstand", mass: "Massa", radius: "Straal" },
  units: { distance: "miljoen km", mass: "× 10²³ kg", radius: "km" },
  spokenUnits: { distance: "miljoen kilometer", mass: "maal 10 tot de macht 23 kilogram", radius: "kilometer" },
  decrease: (what) => `${what} kleiner`,
  increase: (what) => `${what} groter`,
  announce: (force) => `Gravitatiekracht: ${force}.`,
  record: "Meting vastleggen",
  recorded: (count) => `Meting ${count} vastgelegd.`,
  measurements: "Metingen",
  noMeasurements: "Nog geen metingen. Stel de schuiven in en leg een meting vast om te vergelijken.",
  remove: (row) => `Meting ${row} verwijderen`,
  removed: (row) => `Meting ${row} verwijderd.`,
  full: (max) => `De tabel bewaart de laatste ${max} metingen.`,
  number: "Nr.",
  question: "Welke grootheden hebben invloed op de gravitatiekracht? Vink alle juiste aan.",
  fixed: "vast",
  star: "Ster",
  planet: "Planeet",
};

const fr: Texts = {
  simulation: "Simulation de la force de gravitation",
  picture: (distance, radius) => `Une étoile à gauche et une planète à ${distance}, de rayon ${radius}.`,
  force: "Force de gravitation",
  forceValue: "Valeur de la force de gravitation",
  spoken: (mantissa, exponent) => `${mantissa} fois 10 puissance ${exponent} newtons`,
  names: { distance: "Distance planète / étoile", mass: "Masse de la planète", radius: "Rayon de la planète" },
  short: { distance: "Distance", mass: "Masse", radius: "Rayon" },
  units: { distance: "millions de km", mass: "× 10²³ kg", radius: "km" },
  spokenUnits: { distance: "millions de kilomètres", mass: "fois 10 puissance 23 kilogrammes", radius: "kilomètres" },
  decrease: (what) => `${what} : diminuer`,
  increase: (what) => `${what} : augmenter`,
  announce: (force) => `Force de gravitation : ${force}.`,
  record: "Enregistrer la mesure",
  recorded: (count) => `Mesure ${count} enregistrée.`,
  measurements: "Mesures",
  noMeasurements: "Aucune mesure pour l'instant. Réglez les curseurs et enregistrez une mesure pour comparer.",
  remove: (row) => `Supprimer la mesure ${row}`,
  removed: (row) => `Mesure ${row} supprimée.`,
  full: (max) => `Le tableau garde les ${max} dernières mesures.`,
  number: "N°",
  question: "Quelles grandeurs influencent la force de gravitation ? Cochez toutes les bonnes réponses.",
  fixed: "fixe",
  star: "Étoile",
  planet: "Planète",
};

export const textsFor = (language: Language): Texts => ({ en, nl, fr })[language] ?? en;
