// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/wordrank, © OpenPCI, Aarhus University and Aalborg University
// (Elias J.T. Hansen, Anna Rusmann, Jeppe Bundsgaard)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The settings and the response of a Q-sort: the candidate places every statement in a forced, quasi-normal grid of
// columns, from the lowest value ("most disagree") to the highest ("most agree"); optionally after a pre-sort into
// three piles.

export type Statement = { text: string; title: string };

export type Orientation = "horizontal" | "vertical";

export type Layout = {
  /** The number of places in each column, from the lowest value to the highest ("distribution": "1,2,3,4,3,2,1"). */
  columns: number[];
  /** The value of each column, lowest first: -3 … +3. */
  values: number[];
  /** All statements of the item (the Q-set), empty lines left out. */
  statements: Statement[];
  /** horizontal: columns left (lowest) to right (highest); vertical: rows top (highest) to bottom (lowest). */
  orientation: Orientation;
  /** The end of the scale with the lowest values, and with the highest. */
  lowLabel: string;
  highLabel: string;
  /** First sort the statements into three piles (low, neutral, high), then into the grid. */
  presort: boolean;
  presortLabels: [string, string, string];
};

/** "1,2,3,4,3,2,1" → [1, 2, 3, 4, 3, 2, 1]; nothing usable gives one column of one place. */
export const parseDistribution = (distribution: string): number[] => {
  const columns = String(distribution ?? "")
    .split(",")
    .map((c) => parseInt(c.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.min(n, 20));
  return columns.length > 0 ? columns.slice(0, 15) : [1];
};

/** The values of the columns around 0: 7 columns are -3 … +3; an even number skips 0 (-2, -1, +1, +2). */
export const defaultValues = (count: number): number[] => {
  const half = Math.floor(count / 2);
  return Array.from({ length: count }, (_, i) => (count % 2 === 1 ? i - half : i < half ? i - half : i - half + 1));
};

/** "-3,-2,-1,0,1,2,3": numbers, one per column, lowest first; empty or not one per column → the default values. */
export const parseValues = (values: string, count: number): number[] => {
  const parsed = String(values ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v !== "")
    .map(Number);
  return parsed.length === count && parsed.every(Number.isFinite) ? parsed : defaultValues(count);
};

/** +3, 0, −3 as on a Q-sort grid. */
export const formatValue = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${-value}` : "0");

/** One statement per line; "statement:explanation" shows the explanation as a tooltip. */
export const parseStatements = (texts: string): Statement[] =>
  String(texts ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      const colon = line.indexOf(":");
      if (colon < 0) return { text: line, title: line };
      const text = line.slice(0, colon).trim();
      const title = line.slice(colon + 1).trim();
      return { text, title: title || text };
    })
    .filter((s) => s.text !== "");

const parsePresortLabels = (labels: string): [string, string, string] => {
  const [low, neutral, high] = String(labels ?? "").split(",").map((l) => l.trim());
  return [low || "−", neutral || "0", high || "+"];
};

export const parseLayout = (properties: {
  distribution: string;
  values: string;
  statements: string;
  orientation: string;
  lowLabel: string;
  highLabel: string;
  presort: string;
  presortLabels: string;
}): Layout => {
  const columns = parseDistribution(properties.distribution);
  return {
    columns,
    values: parseValues(properties.values, columns.length),
    statements: parseStatements(properties.statements),
    orientation: properties.orientation === "vertical" ? "vertical" : "horizontal",
    lowLabel: String(properties.lowLabel ?? ""),
    highLabel: String(properties.highLabel ?? ""),
    presort: String(properties.presort) === "true",
    presortLabels: parsePresortLabels(properties.presortLabels),
  };
};

export const slotCount = (columns: number[]) => columns.reduce((a, b) => a + b, 0);

/** The column and the place in it (both from 0) of a slot in the flat list of slots. */
export const slotPosition = (columns: number[], slot: number) => {
  let start = 0;
  for (let column = 0; column < columns.length; column++) {
    if (slot < start + columns[column]) return { column, place: slot - start };
    start += columns[column];
  }
  return { column: columns.length - 1, place: columns[columns.length - 1] - 1 };
};

export const slotIndex = (columns: number[], column: number, place: number) =>
  columns.slice(0, column).reduce((a, b) => a + b, 0) + place;

/** The order in which the candidate gets the statements (indexes): shuffled, like a deck of Q-cards, or as authored. */
export const presentStatements = (count: number, randomOrder: boolean, random: () => number = Math.random): number[] => {
  const a = Array.from({ length: count }, (_, i) => i);
  if (!randomOrder) return a;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** The pre-sort piles in the response: low −1, neutral 0, high +1 (the store's piles 1, 2, 3). */
const PILE_VALUES = [-1, 0, 1];

/**
 * The response, as Q analysis uses it, per statement in the order of the statements as authored:
 * - sort: the value of its column in the grid, null for a statement that is not in the grid. Where a statement is
 *   within its column has no meaning in a Q-sort, so it is not in the response;
 * - presort (only with a pre-sort): the pile it was sorted onto, −1 low, 0 neutral, +1 high, null for none.
 */
export type Response = { sort: (number | null)[]; presort?: (number | null)[] };

export const responseValues = (
  statementCount: number,
  columns: number[],
  values: number[],
  slots: (number | null)[]
): (number | null)[] => {
  const result: (number | null)[] = Array(statementCount).fill(null);
  slots.forEach((statement, slot) => {
    if (statement === null || statement === undefined || statement >= statementCount) return;
    result[statement] = values[slotPosition(columns, slot).column];
  });
  return result;
};

/** The piles (1 … 3, 0 not sorted) as −1, 0, +1 or null. */
export const responsePiles = (statementCount: number, piles: number[]): (number | null)[] =>
  Array.from({ length: statementCount }, (_, s) => PILE_VALUES[(piles[s] ?? 0) - 1] ?? null);

/** A response as JSON: { sort, presort } or, as before there was a pre-sort in it, just the sort. */
export const parseResponse = (value: string): Response | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) return { sort: parsed };
  const { sort, presort } = (parsed ?? {}) as Partial<Response>;
  if (!Array.isArray(sort)) return null;
  return Array.isArray(presort) ? { sort, presort } : { sort };
};

/** The sort of a response back to slots: each statement in the first free place of its column. */
export const slotsFromResponse = (
  sort: unknown[],
  columns: number[],
  values: number[],
  statementCount: number
): (number | null)[] => {
  const slots: (number | null)[] = Array(slotCount(columns)).fill(null);
  sort.slice(0, statementCount).forEach((v, statement) => {
    const column = typeof v === "number" ? values.indexOf(v) : -1;
    if (column < 0) return;
    for (let place = 0; place < columns[column]; place++) {
      const slot = slotIndex(columns, column, place);
      if (slots[slot] === null) {
        slots[slot] = statement;
        return;
      }
    }
  });
  return slots;
};

/**
 * The pre-sort of a response back to piles (1 … 3, 0 not sorted). A statement in the grid without a pile (a response
 * without a pre-sort) gets the pile of its side of the grid, so it has one to go back to.
 */
export const pilesFromResponse = (response: Response, columns: number[], values: number[], statementCount: number) =>
  Array.from({ length: statementCount }, (_, s) => {
    const pile = PILE_VALUES.indexOf(response.presort?.[s] as number) + 1;
    if (pile > 0) return pile;
    const column = values.indexOf(response.sort[s] as number);
    if (column < 0) return 0;
    const middle = (columns.length - 1) / 2;
    return column < middle ? 1 : column > middle ? 3 : 2;
  });
