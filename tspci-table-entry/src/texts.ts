// The texts of the PCI per language (data-language, or the authoring system's language); the item's own texts are
// settings or in the table.
import type { Problem, Refusal } from "./table";

const en = {
  table: "Table",
  /** The accessible name of an input cell. */
  cell: (row: string, column: string, n: number, total: number) =>
    `${[row, column].filter(Boolean).join(", ") || "Value"} (field ${n} of ${total})`,
  empty: "empty",
  help: "Type a number in each empty field. Tab, Enter and the arrow keys move between the fields.",
  helpText: "Type a value in each empty field. Tab, Enter and the arrow keys move between the fields.",
  refusal: (why: Refusal, max: number, decimals: number | null): string =>
    ({
      character: "Only digits and one decimal point are allowed.",
      separator: "Only one decimal point is allowed.",
      decimals: decimals === 0 ? "Only whole numbers are allowed." : `At most ${decimals} ${decimals === 1 ? "decimal" : "decimals"}.`,
      length: `At most ${max} characters.`,
      negative: "Only digits and one decimal point are allowed.",
    })[why],
  // authoring mode
  headerColumn: "Row headers in the first column",
  headerRow: "Header row on top",
  addRow: "Add row",
  addColumn: "Add column",
  removeRow: (n: number) => `Remove row ${n}`,
  removeColumn: (n: number) => `Remove column ${n}`,
  example: "Example table",
  given: "Given",
  input: "Input",
  makeInput: "Make this an input cell",
  makeGiven: "Make this a given cell",
  givenLabel: (r: number, c: number) => `Text of row ${r}, column ${c}`,
  expectedLabel: (r: number, c: number) => `Expected value of row ${r}, column ${c}`,
  toleranceLabel: (r: number, c: number) => `Tolerance (±) of row ${r}, column ${c}`,
  expected: "expected",
  tolerance: "±",
  authoringHint:
    "Click the switch in a cell to make it a given cell or an input. An input takes the expected value and, for numbers, a margin (±). " +
    "Paste cells from a spreadsheet: [18,8] becomes an input that expects 18,8, [18,8 ± 0,1] one with a margin.",
  summary: (inputs: number) => `${inputs} input ${inputs === 1 ? "cell" : "cells"}`,
  problem: (p: Problem): string => {
    if (p.code === "noInputs") return "Make at least one cell an input.";
    const at = cellsText(p.cells, "row", "column");
    return {
      noExpected: `No expected value: ${at}.`,
      notNumber: `The expected value is not a number: ${at}.`,
      tooLong: `The expected value is longer than the characters allowed: ${at}.`,
      tooManyDecimals: `The expected value has more decimals than allowed: ${at}.`,
      negative: `The expected value is negative, but negative numbers are not allowed: ${at}.`,
      badTolerance: `The margin is not a positive number: ${at}.`,
    }[p.code];
  },
};

/** ["2:3", "2:5"] → "row 2 column 3, row 2 column 5" */
const cellsText = (cells: string[], row: string, column: string) =>
  cells.map((c) => { const [r, k] = c.split(":"); return `${row} ${r} ${column} ${k}`; }).join(", ");

const nl: typeof en = {
  table: "Tabel",
  cell: (row, column, n, total) => `${[row, column].filter(Boolean).join(", ") || "Waarde"} (invulveld ${n} van ${total})`,
  empty: "leeg",
  help: "Typ een getal in elk leeg vakje. Met Tab, Enter en de pijltjestoetsen ga je naar een ander vakje.",
  helpText: "Typ een waarde in elk leeg vakje. Met Tab, Enter en de pijltjestoetsen ga je naar een ander vakje.",
  refusal: (why, max, decimals) =>
    ({
      character: "Je mag alleen cijfers en één komma invoeren.",
      separator: "Je mag maar één komma invoeren.",
      decimals: decimals === 0 ? "Je mag alleen hele getallen invoeren." : `Je mag maximaal ${decimals} ${decimals === 1 ? "decimaal" : "decimalen"} invoeren.`,
      length: `Je mag maximaal ${max} tekens invoeren.`,
      negative: "Je mag alleen cijfers en één komma invoeren.",
    })[why],
  headerColumn: "Rijkoppen in de eerste kolom",
  headerRow: "Koprij bovenaan",
  addRow: "Rij toevoegen",
  addColumn: "Kolom toevoegen",
  removeRow: (n) => `Rij ${n} verwijderen`,
  removeColumn: (n) => `Kolom ${n} verwijderen`,
  example: "Voorbeeldtabel",
  given: "Gegeven",
  input: "Invullen",
  makeInput: "Maak hier een invulvakje van",
  makeGiven: "Maak hier een gegeven vakje van",
  givenLabel: (r, c) => `Tekst van rij ${r}, kolom ${c}`,
  expectedLabel: (r, c) => `Verwachte waarde van rij ${r}, kolom ${c}`,
  toleranceLabel: (r, c) => `Marge (±) van rij ${r}, kolom ${c}`,
  expected: "verwacht",
  tolerance: "±",
  authoringHint:
    "Klik op de schakelaar in een cel om er een gegeven vakje of een invulvakje van te maken. Een invulvakje krijgt de verwachte waarde en, " +
    "bij getallen, een marge (±). Plak cellen uit een spreadsheet: [18,8] wordt een invulvakje dat 18,8 verwacht, [18,8 ± 0,1] een met een marge.",
  summary: (inputs) => `${inputs} ${inputs === 1 ? "invulvakje" : "invulvakjes"}`,
  problem: (p) => {
    if (p.code === "noInputs") return "Maak minstens één cel een invulvakje.";
    const at = cellsText(p.cells, "rij", "kolom");
    return {
      noExpected: `Geen verwachte waarde: ${at}.`,
      notNumber: `De verwachte waarde is geen getal: ${at}.`,
      tooLong: `De verwachte waarde is langer dan het aantal toegestane tekens: ${at}.`,
      tooManyDecimals: `De verwachte waarde heeft meer decimalen dan toegestaan: ${at}.`,
      negative: `De verwachte waarde is negatief, maar negatieve getallen zijn niet toegestaan: ${at}.`,
      badTolerance: `De marge is geen positief getal: ${at}.`,
    }[p.code];
  },
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
