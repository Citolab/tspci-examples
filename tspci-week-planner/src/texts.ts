// The texts of the PCI per language (data-language, or the authoring system's language); the item's own texts are the
// prompt and the planner (resources, tasks, fixed blocks).
import type { Check, CheckType } from "./planner";

const list = (names: string[], and: string) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} ${and} ${names[names.length - 1]}`);
const num = (n: number, nl: boolean) => (nl ? String(Math.round(n * 100) / 100).replace(".", ",") : String(Math.round(n * 100) / 100));

const en = {
  locale: "en",
  days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  daysShort: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  duration: (minutes: number) => {
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return [h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ") || "0 min";
  },
  hours: (h: number) => `${num(h, false)} ${h === 1 ? "hour" : "hours"}`,
  tasks: "Tasks",
  agenda: "Week agenda",
  time: "Time",
  onlyFor: (name: string) => `only ${name}`,
  between: (a: string, b: string) => `${a} to ${b}`,
  plannedAt: (when: string) => `planned: ${when}`,
  notPlanned: "not planned",
  allPlanned: (n: number, total: number) => `${n} of ${total} planned`,
  cell: (day: string, resource: string, time: string) => (resource ? `${day}, ${resource}, ${time}` : `${day}, ${time}`),
  free: "free",
  closed: "closed",
  fixedBlock: (label: string) => `${label} (fixed)`,
  chosen: "picked",
  remove: "Remove",
  longer: "Longer",
  shorter: "Shorter",
  undo: "Undo",
  clear: "Start again",
  showHelp: "Help",
  help:
    "Drag a task card into the agenda, or pick a card and click a cell. Drag a task to move it, drag its lower edge to make it longer " +
    "or shorter, drag it out of the agenda to remove it. Keyboard: pick a card with Enter, choose a place with the arrow keys and press Enter. " +
    "In the agenda: Enter picks up the task in the cell, Shift + arrow up or down makes it shorter or longer, Delete removes it, Escape drops a picked card.",
  picked: (task: string) => `${task} picked: choose a place with the arrow keys and press Enter, or click a cell.`,
  placed: (task: string, when: string) => `${task} planned: ${when}.`,
  removed: (task: string) => `${task} removed from the agenda.`,
  resized: (task: string, when: string) => `${task}: ${when}.`,
  onlyForStatus: (task: string, name: string) => `${task} can only be planned for ${name}.`,
  dropped: "Nothing picked.",
  undone: "Undone.",
  cleared: "The agenda is empty again.",
  overlaps: (names: string[]) => `Overlaps with ${list(names, "and")}`,
  outside: "Outside opening hours",
  conflicts: "Conflicts",
  noConflicts: "No conflicts",
  opening: (from: string, to: string) => `Open ${from}–${to}`,
  legendClosed: "Closed",
  legendFixed: "Fixed (busy)",
  legendConflict: "Conflict",
  everyone: "everyone",
  // the checks, as a rubric line
  checkName: {
    allPlanned: "Everything planned",
    noOverlap: "No overlaps per resource",
    openingHours: "Within opening hours",
    before: "Task A before task B",
    notOnDay: "Not on a day",
    sameDay: "Same day",
    gap: "Hours in between",
    maxHours: "Hours per day",
    break: "Break after hours of work",
  } as Record<CheckType, string>,
  checkText: (c: Check, task: (id: string) => string, day: (d: string) => string): string => {
    switch (c.type) {
      case "allPlanned": return "Every task is planned";
      case "noOverlap": return "Nothing overlaps for the same resource";
      case "openingHours": return "Every task is within opening hours";
      case "before": return `${task(c.a)} ends before ${task(c.b)} starts`;
      case "notOnDay": return `${c.task ? task(c.task) : "No task"} not on ${day(c.day)}`;
      case "sameDay": return `${task(c.a)} on the same day as ${task(c.b)}`;
      case "gap": return `At least ${num(c.hours, false)} hours between ${task(c.a)} and ${task(c.b)}`;
      case "maxHours": return `At most ${num(c.hours, false)} hours of work per resource per day`;
      case "break": return `A break of at least ${c.minutes} min after ${num(c.hours, false)} hours of work`;
    }
  },
  // authoring mode
  tabAgenda: "Agenda",
  tabResources: "Resources",
  tabFixed: "Fixed blocks",
  tabTasks: "Tasks",
  tabChecks: "Checks",
  tabSolution: "Example solution",
  daysLabel: "Days",
  startTime: "From",
  endTime: "To",
  slot: "Minutes per row",
  openFrom: "Open from",
  openTo: "Open to",
  name: "Name",
  id: "Id",
  label: "Text",
  resource: "Resource",
  anyone: "anyone",
  day: "Day",
  start: "Start",
  end: "End",
  work: "Counts as work",
  durationLabel: "Duration (min)",
  minLabel: "At least (min)",
  maxLabel: "At most (min)",
  notes: "Notes",
  add: "Add",
  delete: "Delete",
  task: "Task",
  allTasks: "every task",
  hoursLabel: "Hours",
  minutesLabel: "Minutes",
  points: "Points",
  addCheck: "Add a check",
  removeCheck: "Remove",
  agendaHint: "The grid of the agenda: the days, the times and the opening hours. Time outside the opening hours is hatched.",
  resourcesHint: "The columns of every day: people, rooms or vehicles. A task can be for one resource only.",
  fixedHint: "Busy time the candidate cannot use: a meeting, a training, a day off. Untick 'counts as work' for a day off.",
  tasksHint: "The task cards. A task can be made longer or shorter between 'at least' and 'at most'.",
  checksHint: "Each check is a rule of the task, with points. The mark shows whether the example solution passes it.",
  solutionHint: "Plan the example solution as a candidate would. It previews the checks and is shown in the solution status.",
  noSolution: "No example solution yet.",
  clearSolution: "Clear the example solution",
  summary: (score: number, max: number) => `The example solution scores ${score} of ${max}.`,
  problemNoTasks: "There are no tasks.",
  problemNoChecks: "There are no checks: nothing is scored.",
  problemTaskMissing: (n: number) => `Check ${n} is about a task that does not exist.`,
  problemCheck: (n: number) => `The example solution does not pass check ${n}.`,
  problemOpen: "The opening hours are empty.",
  problemDuplicate: (id: string) => `The id ${id} is used twice.`,
  problemTooLong: (task: string) => `${task} is longer than the agenda's day.`,
};

export type Texts = typeof en;

const nl: Texts = {
  locale: "nl",
  days: ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"],
  daysShort: ["ma", "di", "wo", "do", "vr", "za", "zo"],
  duration: (minutes: number) => {
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return [h ? `${h} uur` : "", m ? `${m} min` : ""].filter(Boolean).join(" ") || "0 min";
  },
  hours: (h: number) => `${num(h, true)} uur`,
  tasks: "Taken",
  agenda: "Weekagenda",
  time: "Tijd",
  onlyFor: (name: string) => `alleen ${name}`,
  between: (a: string, b: string) => `${a} tot ${b}`,
  plannedAt: (when: string) => `gepland: ${when}`,
  notPlanned: "niet gepland",
  allPlanned: (n: number, total: number) => `${n} van ${total} gepland`,
  cell: (day: string, resource: string, time: string) => (resource ? `${day}, ${resource}, ${time}` : `${day}, ${time}`),
  free: "vrij",
  closed: "gesloten",
  fixedBlock: (label: string) => `${label} (vast)`,
  chosen: "gekozen",
  remove: "Weghalen",
  longer: "Langer",
  shorter: "Korter",
  undo: "Ongedaan maken",
  clear: "Opnieuw beginnen",
  showHelp: "Uitleg",
  help:
    "Sleep een taakkaart naar de agenda, of kies een kaart en klik op een vak. Sleep een taak om hem te verplaatsen, sleep de onderrand om hem " +
    "langer of korter te maken, sleep hem uit de agenda om hem weg te halen. Toetsenbord: kies een kaart met Enter, kies een plek met de pijltjes " +
    "en druk op Enter. In de agenda: Enter pakt de taak in het vak op, Shift + pijl omhoog of omlaag maakt hem korter of langer, Delete haalt hem weg, Escape legt een gekozen kaart terug.",
  picked: (task: string) => `${task} gekozen: kies een plek met de pijltjes en druk op Enter, of klik op een vak.`,
  placed: (task: string, when: string) => `${task} gepland: ${when}.`,
  removed: (task: string) => `${task} uit de agenda gehaald.`,
  resized: (task: string, when: string) => `${task}: ${when}.`,
  onlyForStatus: (task: string, name: string) => `${task} kan alleen voor ${name} gepland worden.`,
  dropped: "Niets gekozen.",
  undone: "Ongedaan gemaakt.",
  cleared: "De agenda is weer leeg.",
  overlaps: (names: string[]) => `Overlapt met ${list(names, "en")}`,
  outside: "Buiten de openingstijden",
  conflicts: "Botsingen",
  noConflicts: "Geen botsingen",
  opening: (from: string, to: string) => `Open ${from}–${to}`,
  legendClosed: "Gesloten",
  legendFixed: "Vast (bezet)",
  legendConflict: "Botsing",
  everyone: "iedereen",
  checkName: {
    allPlanned: "Alles gepland",
    noOverlap: "Geen overlap per uitvoerder",
    openingHours: "Binnen de openingstijden",
    before: "Taak A voor taak B",
    notOnDay: "Niet op een dag",
    sameDay: "Zelfde dag",
    gap: "Uren ertussen",
    maxHours: "Uren per dag",
    break: "Pauze na uren werk",
  },
  checkText: (c: Check, task: (id: string) => string, day: (d: string) => string): string => {
    switch (c.type) {
      case "allPlanned": return "Elke taak is gepland";
      case "noOverlap": return "Niets overlapt bij dezelfde uitvoerder";
      case "openingHours": return "Elke taak valt binnen de openingstijden";
      case "before": return `${task(c.a)} is klaar voordat ${task(c.b)} begint`;
      case "notOnDay": return `${c.task ? task(c.task) : "Geen taak"} niet op ${day(c.day)}`;
      case "sameDay": return `${task(c.a)} op dezelfde dag als ${task(c.b)}`;
      case "gap": return `Minstens ${num(c.hours, true)} uur tussen ${task(c.a)} en ${task(c.b)}`;
      case "maxHours": return `Hoogstens ${num(c.hours, true)} uur werk per uitvoerder per dag`;
      case "break": return `Een pauze van minstens ${c.minutes} min na ${num(c.hours, true)} uur werk`;
    }
  },
  tabAgenda: "Agenda",
  tabResources: "Uitvoerders",
  tabFixed: "Vaste blokken",
  tabTasks: "Taken",
  tabChecks: "Checks",
  tabSolution: "Voorbeeldoplossing",
  daysLabel: "Dagen",
  startTime: "Van",
  endTime: "Tot",
  slot: "Minuten per rij",
  openFrom: "Open vanaf",
  openTo: "Open tot",
  name: "Naam",
  id: "Id",
  label: "Tekst",
  resource: "Uitvoerder",
  anyone: "iedereen",
  day: "Dag",
  start: "Begin",
  end: "Eind",
  work: "Telt als werk",
  durationLabel: "Duur (min)",
  minLabel: "Minstens (min)",
  maxLabel: "Hoogstens (min)",
  notes: "Toelichting",
  add: "Toevoegen",
  delete: "Verwijderen",
  task: "Taak",
  allTasks: "elke taak",
  hoursLabel: "Uren",
  minutesLabel: "Minuten",
  points: "Punten",
  addCheck: "Check toevoegen",
  removeCheck: "Weghalen",
  agendaHint: "Het rooster van de agenda: de dagen, de tijden en de openingstijden. Tijd buiten de openingstijden is gearceerd.",
  resourcesHint: "De kolommen van elke dag: mensen, ruimtes of voertuigen. Een taak kan voor één uitvoerder zijn.",
  fixedHint: "Bezette tijd die de kandidaat niet kan gebruiken: een overleg, een cursus, een vrije dag. Vink 'telt als werk' uit voor een vrije dag.",
  tasksHint: "De taakkaarten. Een taak kan langer of korter gemaakt worden tussen 'minstens' en 'hoogstens'.",
  checksHint: "Elke check is een regel van de opdracht, met punten. Het teken laat zien of de voorbeeldoplossing hem haalt.",
  solutionHint: "Plan de voorbeeldoplossing zoals een kandidaat dat zou doen. Daarmee worden de checks bekeken, en hij is te zien in de oplossingsstatus.",
  noSolution: "Nog geen voorbeeldoplossing.",
  clearSolution: "Voorbeeldoplossing wissen",
  summary: (score: number, max: number) => `De voorbeeldoplossing haalt ${score} van ${max} punten.`,
  problemNoTasks: "Er zijn geen taken.",
  problemNoChecks: "Er zijn geen checks: er wordt niets gescoord.",
  problemTaskMissing: (n: number) => `Check ${n} gaat over een taak die niet bestaat.`,
  problemCheck: (n: number) => `De voorbeeldoplossing haalt check ${n} niet.`,
  problemOpen: "De openingstijden zijn leeg.",
  problemDuplicate: (id: string) => `Het id ${id} komt twee keer voor.`,
  problemTooLong: (task: string) => `${task} is langer dan de dag van de agenda.`,
};

export const textsFor = (language: string = "en"): Texts => (String(language).toLowerCase().startsWith("nl") ? nl : en);
