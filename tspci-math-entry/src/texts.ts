// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/oat-sa/extension-tao-itemqti-pci/tree/develop/views/js/pciCreator/ims/mathEntryInteraction,
// © 2016-2022 Open Assessment Technologies SA (Christophe Noël)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { GroupId, ToolId } from "./tools";

// The texts of the PCI per language (data-language, or the authoring system's language); the item's own text is the
// prompt setting.

const en = {
  field: "Math input",
  gapField: "Expression with gaps to fill in",
  gap: (n: number, total: number) => `Gap ${n} of ${total}`,
  toolbar: "Math symbols",
  keyboard: "Keyboard",
  showKeyboard: "Show the on-screen keyboard",
  hideKeyboard: "Hide the on-screen keyboard",
  keypad: "Numbers",
  toolsLayer: "Symbols",
  letters: "Letters",
  noGaps: "This expression has no gaps to fill in.",
  groups: {
    functions: "Functions", symbols: "Symbols", geometry: "Geometry", trigo: "Trigonometry",
    comparison: "Comparison", operands: "Operators", matrix: "Matrices",
  } as Record<GroupId, string>,
  tools: {
    sqrt: "Square root", frac: "Fraction", exp: "Exponent", subscript: "Subscript", log: "Logarithm", ln: "Natural logarithm",
    limit: "Limit", sum: "Sum", nthroot: "Nth root", e: "Euler's constant", infinity: "Infinity",
    lparen: "Left parenthesis", rparen: "Right parenthesis", lbrace: "Left curly bracket", rbrace: "Right curly bracket",
    lbrack: "Left square bracket", rbrack: "Right square bracket", integral: "Integral", colon: "Colon", to: "Right arrow",
    degree: "Degree", percent: "Percent", angle: "Angle", triangle: "Triangle", similar: "Similar to", paral: "Parallel to",
    perp: "Perpendicular to", vline: "Vertical line, divides", pi: "Pi", sin: "Sine", cos: "Cosine", tan: "Tangent",
    lower: "Less than", greater: "Greater than", lte: "Less than or equal to", gte: "Greater than or equal to",
    approx: "Approximately", equal: "Equals", plus: "Plus", minus: "Minus", times: "Times", timesdot: "Times (dot)",
    divide: "Divided by", plusminus: "Plus or minus", inmem: "Is an element of", ninmem: "Is not an element of",
    union: "Union", intersec: "Intersection", congruent: "Congruent to", subset: "Subset of", superset: "Superset of",
    contains: "Contains as element", matrix_2row: "Matrix with 2 rows", matrix_2row_2col: "Matrix with 2 rows and 2 columns",
  } as Record<ToolId, string>,
  // authoring mode
  authoringTitle: "Expression with gaps",
  authoringHint:
    "Type the expression the candidate completes and put a gap where the candidate types. " +
    "The correct response lists the gaps in this order: after adding or removing a gap, set it again.",
  insertGap: "Insert gap",
  gapCount: (n: number) => (n === 1 ? "1 gap" : `${n} gaps`),
  gapModeOff: "Gap mode is off: turn on \"Use an expression with gaps\" for the candidate to see this expression.",
  needsGap: "Put at least one gap in the expression.",
};

const nl: typeof en = {
  field: "Wiskundige invoer",
  gapField: "Uitdrukking met open plekken om in te vullen",
  gap: (n: number, total: number) => `Open plek ${n} van ${total}`,
  toolbar: "Wiskundige symbolen",
  keyboard: "Toetsenbord",
  showKeyboard: "Schermtoetsenbord tonen",
  hideKeyboard: "Schermtoetsenbord verbergen",
  keypad: "Cijfers",
  toolsLayer: "Symbolen",
  letters: "Letters",
  noGaps: "Deze uitdrukking heeft geen open plekken om in te vullen.",
  groups: {
    functions: "Functies", symbols: "Symbolen", geometry: "Meetkunde", trigo: "Goniometrie",
    comparison: "Vergelijken", operands: "Bewerkingen", matrix: "Matrices",
  },
  tools: {
    sqrt: "Wortel", frac: "Breuk", exp: "Macht", subscript: "Subscript", log: "Logaritme", ln: "Natuurlijke logaritme",
    limit: "Limiet", sum: "Som", nthroot: "N-de machtswortel", e: "Getal van Euler", infinity: "Oneindig",
    lparen: "Haakje openen", rparen: "Haakje sluiten", lbrace: "Accolade openen", rbrace: "Accolade sluiten",
    lbrack: "Blokhaak openen", rbrack: "Blokhaak sluiten", integral: "Integraal", colon: "Dubbele punt", to: "Pijl naar rechts",
    degree: "Graden", percent: "Procent", angle: "Hoek", triangle: "Driehoek", similar: "Gelijkvormig met", paral: "Evenwijdig aan",
    perp: "Loodrecht op", vline: "Verticale streep, is deler van", pi: "Pi", sin: "Sinus", cos: "Cosinus", tan: "Tangens",
    lower: "Kleiner dan", greater: "Groter dan", lte: "Kleiner dan of gelijk aan", gte: "Groter dan of gelijk aan",
    approx: "Ongeveer gelijk aan", equal: "Is gelijk aan", plus: "Plus", minus: "Min", times: "Keer", timesdot: "Keer (punt)",
    divide: "Gedeeld door", plusminus: "Plus of min", inmem: "Is element van", ninmem: "Is geen element van",
    union: "Vereniging", intersec: "Doorsnede", congruent: "Congruent met", subset: "Deelverzameling van", superset: "Bevat als deelverzameling",
    contains: "Bevat als element", matrix_2row: "Matrix met 2 rijen", matrix_2row_2col: "Matrix met 2 rijen en 2 kolommen",
  },
  authoringTitle: "Uitdrukking met open plekken",
  authoringHint:
    "Typ de uitdrukking die de kandidaat aanvult en zet een open plek waar de kandidaat typt. " +
    "Het goede antwoord noemt de open plekken in deze volgorde: stel het opnieuw in na het toevoegen of verwijderen van een open plek.",
  insertGap: "Open plek invoegen",
  gapCount: (n: number) => (n === 1 ? "1 open plek" : `${n} open plekken`),
  gapModeOff: "De modus met open plekken staat uit: zet \"Uitdrukking met open plekken\" aan om deze uitdrukking aan de kandidaat te tonen.",
  needsGap: "Zet minstens één open plek in de uitdrukking.",
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
