// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/parcc/extension-parcc-tei/tree/master/views/js/pciCreator/dev/graphLineAndPointInteraction,
// © 2014-2017 Parcc, Inc. (Open Assessment Technologies, for Parcc, Inc.)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The texts of the PCI per language (data-language), and of the authoring mode in the author's language. The item's
// own texts (the prompt, the labels of the elements, the axis names) are settings.

import type { ElementType, Problem } from "./model";

const en = {
  graph: "Coordinate grid",
  draw: "Draw",
  types: { point: "point", points: "set of points", line: "line", segment: "line segment", ray: "ray", solutionSet: "solution set" } as Record<ElementType, string>,
  help: "Choose what to draw, then click on the grid. Drag a point to move it, or off the grid to remove it. Keyboard: the arrow keys move the cursor (with Shift a whole grid step), Enter places or selects a point, Delete removes it, Escape lets go.",
  toolHint: {
    point: "Click where the point goes.",
    points: "Click to place the points.",
    line: "Click two points the line goes through.",
    segment: "Click the two end points of the segment.",
    ray: "Click the start point, then a point the ray goes through.",
    solutionSet: "Click an area between the lines to shade it; click again to unshade it.",
  } as Record<ElementType, string>,
  needLine: "Draw a line first.",
  count: (n: number, max: number) => `${n} of ${max}`,
  style: (label: string) => `Line style of ${label}`,
  solid: "Solid",
  dashed: "Dashed",
  yourGraph: "Your graph",
  nothing: "nothing drawn yet",
  through: (a: string, b: string) => `through ${a} and ${b}`,
  from: (a: string, b: string) => `from ${a} to ${b}`,
  rayFrom: (a: string, b: string) => `from ${a} through ${b}`,
  onePoint: (a: string) => `one point: ${a}`,
  areas: (n: number) => (n === 1 ? "1 area shaded" : `${n} areas shaded`),
  area: (n: number, point: string) => `Area ${n}, around ${point}`,
  areasLegend: (label: string) => `Areas of ${label}`,
  noAreas: "Draw a line to divide the grid into areas.",
  clear: (label: string) => `Clear ${label}`,
  deletePoint: (label: string, point: string) => `Delete point ${point} of ${label}`,
  given: "Given points",
  placed: (label: string, point: string) => `${label}: point placed at ${point}.`,
  replaced: (label: string, point: string) => `${label} has all its points: the last one moved to ${point}.`,
  moved: (label: string, point: string) => `${label}: point moved to ${point}.`,
  removed: (label: string, point: string) => `${label}: point ${point} removed.`,
  selected: (label: string, point: string) => `${label}: point ${point} selected. The arrow keys move it, Delete removes it, Escape lets go.`,
  cursor: (point: string) => `Cursor at ${point}.`,
  line: (label: string, equation: string) => `${label}: ${equation}.`,
  samePoint: "A line needs two different points.",
  taken: "There is a point there already.",
  shaded: (n: number) => `Area ${n} shaded.`,
  unshaded: (n: number) => `Area ${n} no longer shaded.`,
  noArea: "There is no area there.",
  styleSet: (label: string, dashed: boolean) => `${label}: ${dashed ? "dashed" : "solid"} line.`,
  cleared: (label: string) => `${label} cleared.`,
  active: (label: string, type: string) => `Drawing ${label} (${type}).`,
  // the authoring mode
  a: {
    intro: "Set up what the candidate can draw. Select an element and draw its correct answer on the grid; the candidate gets the same grid, without the answer.",
    elements: "Elements",
    add: "Add",
    newType: "Type of the new element",
    type: "Type",
    label: "Label",
    color: "Colour",
    max: "Most points",
    connect: "Connect the points from left to right",
    dashed: "Dashed at the start",
    styleToggle: "The candidate chooses solid or dashed",
    score: "Points",
    equation: "Or: right when every point is on y =",
    minPoints: "with at least this many points",
    remove: "Remove",
    up: "Move up",
    down: "Move down",
    drawCorrect: (label: string) => `Correct answer of ${label}`,
    noCorrect: "no correct answer: not scored",
    clearCorrect: "Clear the correct answer",
    correctDashed: "The correct line is dashed",
    problem: (p: Problem) => {
      switch (p.kind) {
        case "noElements": return "Add at least one element.";
        case "noLabel": return `Element ${p.index + 1} has no label.`;
        case "noLine": return `${p.label}: a solution set needs a line to divide the grid.`;
        case "incomplete": return `${p.label}: the correct answer needs two points.`;
        case "equation": return `${p.label}: the equation cannot be read.`;
        case "outside": return `${p.label}: the correct answer is outside the grid.`;
      }
    },
  },
};

export type Texts = typeof en;

const nl: Texts = {
  graph: "Assenstelsel",
  draw: "Tekenen",
  types: { point: "punt", points: "verzameling punten", line: "lijn", segment: "lijnstuk", ray: "halve lijn", solutionSet: "oplossingsgebied" },
  help: "Kies wat je tekent en klik dan op het raster. Sleep een punt om het te verplaatsen, of van het raster af om het weg te halen. Toetsenbord: de pijltjestoetsen verplaatsen de cursor (met Shift een hele rasterstap), Enter zet of kiest een punt, Delete haalt het weg, Escape laat het los.",
  toolHint: {
    point: "Klik waar het punt komt.",
    points: "Klik om de punten te zetten.",
    line: "Klik twee punten waar de lijn door gaat.",
    segment: "Klik de twee eindpunten van het lijnstuk.",
    ray: "Klik het beginpunt en dan een punt waar de halve lijn door gaat.",
    solutionSet: "Klik op een gebied tussen de lijnen om het te kleuren; klik nog eens om de kleur weg te halen.",
  },
  needLine: "Teken eerst een lijn.",
  count: (n, max) => `${n} van ${max}`,
  style: (label) => `Lijnstijl van ${label}`,
  solid: "Doorgetrokken",
  dashed: "Gestippeld",
  yourGraph: "Jouw tekening",
  nothing: "nog niets getekend",
  through: (a, b) => `door ${a} en ${b}`,
  from: (a, b) => `van ${a} tot ${b}`,
  rayFrom: (a, b) => `vanaf ${a} door ${b}`,
  onePoint: (a) => `één punt: ${a}`,
  areas: (n) => (n === 1 ? "1 gebied gekleurd" : `${n} gebieden gekleurd`),
  area: (n, point) => `Gebied ${n}, rond ${point}`,
  areasLegend: (label) => `Gebieden van ${label}`,
  noAreas: "Teken een lijn om het raster in gebieden te verdelen.",
  clear: (label) => `${label} wissen`,
  deletePoint: (label, point) => `Punt ${point} van ${label} weghalen`,
  given: "Gegeven punten",
  placed: (label, point) => `${label}: punt gezet op ${point}.`,
  replaced: (label, point) => `${label} heeft al zijn punten: het laatste is verplaatst naar ${point}.`,
  moved: (label, point) => `${label}: punt verplaatst naar ${point}.`,
  removed: (label, point) => `${label}: punt ${point} weggehaald.`,
  selected: (label, point) => `${label}: punt ${point} gekozen. De pijltjestoetsen verplaatsen het, Delete haalt het weg, Escape laat het los.`,
  cursor: (point) => `Cursor op ${point}.`,
  line: (label, equation) => `${label}: ${equation}.`,
  samePoint: "Een lijn heeft twee verschillende punten nodig.",
  taken: "Daar staat al een punt.",
  shaded: (n) => `Gebied ${n} gekleurd.`,
  unshaded: (n) => `Gebied ${n} niet meer gekleurd.`,
  noArea: "Daar is geen gebied.",
  styleSet: (label, dashed) => `${label}: ${dashed ? "gestippelde" : "doorgetrokken"} lijn.`,
  cleared: (label) => `${label} gewist.`,
  active: (label, type) => `Je tekent ${label} (${type}).`,
  a: {
    intro: "Stel in wat de kandidaat kan tekenen. Kies een element en teken het goede antwoord op het raster; de kandidaat krijgt hetzelfde raster, zonder het antwoord.",
    elements: "Elementen",
    add: "Toevoegen",
    newType: "Soort van het nieuwe element",
    type: "Soort",
    label: "Naam",
    color: "Kleur",
    max: "Hoogstens punten",
    connect: "De punten van links naar rechts verbinden",
    dashed: "Gestippeld bij de start",
    styleToggle: "De kandidaat kiest doorgetrokken of gestippeld",
    score: "Punten",
    equation: "Of: goed als elk punt op y = ligt:",
    minPoints: "met minstens zoveel punten",
    remove: "Weghalen",
    up: "Omhoog",
    down: "Omlaag",
    drawCorrect: (label) => `Goede antwoord van ${label}`,
    noCorrect: "geen goed antwoord: niet gescoord",
    clearCorrect: "Het goede antwoord wissen",
    correctDashed: "De goede lijn is gestippeld",
    problem: (p) => {
      switch (p.kind) {
        case "noElements": return "Voeg minstens één element toe.";
        case "noLabel": return `Element ${p.index + 1} heeft geen naam.`;
        case "noLine": return `${p.label}: een oplossingsgebied heeft een lijn nodig die het raster verdeelt.`;
        case "incomplete": return `${p.label}: het goede antwoord heeft twee punten nodig.`;
        case "equation": return `${p.label}: de vergelijking is niet te lezen.`;
        case "outside": return `${p.label}: het goede antwoord ligt buiten het raster.`;
      }
    },
  },
};

const fr: Texts = {
  graph: "Repère",
  draw: "Tracer",
  types: { point: "point", points: "ensemble de points", line: "droite", segment: "segment", ray: "demi-droite", solutionSet: "ensemble des solutions" },
  help: "Choisis ce que tu traces, puis clique sur la grille. Fais glisser un point pour le déplacer, ou hors de la grille pour le supprimer. Clavier : les flèches déplacent le curseur (avec Maj un pas entier), Entrée place ou choisit un point, Suppr le supprime, Échap le lâche.",
  toolHint: {
    point: "Clique où le point doit aller.",
    points: "Clique pour placer les points.",
    line: "Clique deux points par lesquels passe la droite.",
    segment: "Clique les deux extrémités du segment.",
    ray: "Clique l'origine, puis un point par lequel passe la demi-droite.",
    solutionSet: "Clique une zone entre les droites pour la colorier ; clique encore pour l'effacer.",
  },
  needLine: "Trace d'abord une droite.",
  count: (n, max) => `${n} sur ${max}`,
  style: (label) => `Style de trait de ${label}`,
  solid: "Plein",
  dashed: "Pointillé",
  yourGraph: "Ton tracé",
  nothing: "rien de tracé",
  through: (a, b) => `passant par ${a} et ${b}`,
  from: (a, b) => `de ${a} à ${b}`,
  rayFrom: (a, b) => `d'origine ${a} passant par ${b}`,
  onePoint: (a) => `un point : ${a}`,
  areas: (n) => (n <= 1 ? `${n} zone coloriée` : `${n} zones coloriées`),
  area: (n, point) => `Zone ${n}, autour de ${point}`,
  areasLegend: (label) => `Zones de ${label}`,
  noAreas: "Trace une droite pour diviser la grille en zones.",
  clear: (label) => `Effacer ${label}`,
  deletePoint: (label, point) => `Supprimer le point ${point} de ${label}`,
  given: "Points donnés",
  placed: (label, point) => `${label} : point placé en ${point}.`,
  replaced: (label, point) => `${label} a tous ses points : le dernier est déplacé en ${point}.`,
  moved: (label, point) => `${label} : point déplacé en ${point}.`,
  removed: (label, point) => `${label} : point ${point} supprimé.`,
  selected: (label, point) => `${label} : point ${point} choisi. Les flèches le déplacent, Suppr le supprime, Échap le lâche.`,
  cursor: (point) => `Curseur en ${point}.`,
  line: (label, equation) => `${label} : ${equation}.`,
  samePoint: "Une droite a besoin de deux points différents.",
  taken: "Il y a déjà un point ici.",
  shaded: (n) => `Zone ${n} coloriée.`,
  unshaded: (n) => `Zone ${n} effacée.`,
  noArea: "Il n'y a pas de zone ici.",
  styleSet: (label, dashed) => `${label} : trait ${dashed ? "pointillé" : "plein"}.`,
  cleared: (label) => `${label} effacé.`,
  active: (label, type) => `Tu traces ${label} (${type}).`,
  a: {
    intro: "Indique ce que le candidat peut tracer. Choisis un élément et trace sa bonne réponse sur la grille ; le candidat reçoit la même grille, sans la réponse.",
    elements: "Éléments",
    add: "Ajouter",
    newType: "Type du nouvel élément",
    type: "Type",
    label: "Nom",
    color: "Couleur",
    max: "Points au plus",
    connect: "Relier les points de gauche à droite",
    dashed: "Pointillé au départ",
    styleToggle: "Le candidat choisit plein ou pointillé",
    score: "Points",
    equation: "Ou : juste si chaque point est sur y =",
    minPoints: "avec au moins ce nombre de points",
    remove: "Supprimer",
    up: "Monter",
    down: "Descendre",
    drawCorrect: (label) => `Bonne réponse de ${label}`,
    noCorrect: "pas de bonne réponse : non noté",
    clearCorrect: "Effacer la bonne réponse",
    correctDashed: "La bonne droite est en pointillé",
    problem: (p) => {
      switch (p.kind) {
        case "noElements": return "Ajoute au moins un élément.";
        case "noLabel": return `L'élément ${p.index + 1} n'a pas de nom.`;
        case "noLine": return `${p.label} : un ensemble des solutions a besoin d'une droite qui divise la grille.`;
        case "incomplete": return `${p.label} : la bonne réponse a besoin de deux points.`;
        case "equation": return `${p.label} : l'équation est illisible.`;
        case "outside": return `${p.label} : la bonne réponse est hors de la grille.`;
      }
    },
  },
};

const TEXTS: Record<string, Texts> = { en, nl, fr };

/** "nl", "nl-NL", "fr" … → its texts; anything else English. */
export const textsFor = (language: string | undefined): Texts => TEXTS[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
