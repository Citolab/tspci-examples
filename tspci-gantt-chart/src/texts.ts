// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/ganttchart, © OpenPCI (Aarhus University and Aalborg
// University: Elias J.T. Hansen, Anna Rusmann, Jeppe Bundsgaard)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The texts of the PCI per language (data-language); the task names and the instruction are settings.

const en = {
  locale: "en-GB",
  chart: "Gantt chart",
  task: "Task",
  week: "Week",
  notPlanned: "not planned",
  unavailable: "unavailable",
  noTasks: "There are no tasks: add them in the settings, one per line.",
  hint:
    "Drag on a row to plan a task; drag a bar to move it, or its ends to make it shorter or longer. Click a slot to switch it on or off. " +
    "Keys: arrows move between slots, Space switches a slot, Shift+→/← makes the bar longer/shorter, Alt+→/← moves the bar, Delete removes it.",
  /** "Task #1: 2 Mar – 6 Mar, 9 Mar" */
  planned: (task: string, ranges: string) => `${task}: ${ranges}`,
  range: (from: string, to: string) => `${from} to ${to}`,
};

const nl: typeof en = {
  locale: "nl-NL",
  chart: "Gantt-diagram",
  task: "Taak",
  week: "Week",
  notPlanned: "niet gepland",
  unavailable: "niet beschikbaar",
  noTasks: "Er zijn geen taken: voeg ze toe in de instellingen, één per regel.",
  hint:
    "Sleep over een rij om een taak te plannen; sleep een balk om hem te verplaatsen, of de uiteinden om hem korter of langer te maken. Klik op een vak om het aan of uit te zetten. " +
    "Toetsen: pijltjes gaan naar een ander vak, Spatie zet een vak aan of uit, Shift+→/← maakt de balk langer/korter, Alt+→/← verplaatst de balk, Delete verwijdert hem.",
  planned: (task: string, ranges: string) => `${task}: ${ranges}`,
  range: (from: string, to: string) => `${from} tot en met ${to}`,
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
