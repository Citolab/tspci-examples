// The texts of the PCI per language (data-language, or the authoring system's language); the item's own texts are
// the prompt and the events.
import type { Problem } from "./timeline";

const en = {
  examplePrompt: "Drag each event to the year in which it happened. Up to 10 years off still counts.",
  timeline: "Timeline",
  tray: "Events to place",
  trayEmpty: "Every event is on the timeline.",
  placedList: "Events on the timeline",
  hint: "Drag the card onto the timeline, or press Enter to put it there and move it with the arrow keys.",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  fit: "Show everything",
  earlier: "Earlier",
  later: "Later",
  showing: (from: string, to: string) => `Showing ${from} to ${to}.`,
  clear: "Start again",
  help: "Help",
  helpText:
    "Drag a card onto the timeline, or click a card and then the timeline. Drag a card on the timeline to move it, or off the timeline to put it back. " +
    "Keyboard: Enter on a card puts it on the timeline; then the arrow keys move it (Page Up and Page Down move it further, Home and End to the ends), " +
    "Delete puts it back. Zoom with the buttons, Ctrl + scroll or + and −; scroll sideways or drag the timeline to move along it.",
  helpOrder: " In this question only the order counts: the arrow keys move a card past its neighbour.",
  chosen: (text: string) => `${text} chosen: click the timeline to place it.`,
  placedAt: (text: string, where: string) => `${text}: ${where}.`,
  placedIn: (text: string, period: string) => `${text}: ${period}.`,
  placedOrder: (text: string, n: number, of: number) => `${text}: place ${n} of ${of}.`,
  returned: (text: string) => `${text} is back in the list.`,
  cleared: "Every card is back in the list.",
  orderValue: (n: number, of: number) => `place ${n} of ${of}`,
  noPeriod: "not in a period",
  outOfView: "outside the view",
  earlierLater: ["earlier", "later"],
  period: "Period",
  periods: "Periods",
  readOnly: "The correct answer",
  // authoring
  tabAxis: "Axis",
  tabPeriods: "Periods",
  tabEvents: "Events",
  tabScoring: "Answer and scoring",
  start: "From",
  end: "To",
  yearHint: "a year; BC as −44 or 44 BC",
  unit: "Unit",
  units: { year: "Years", decade: "Decades", century: "Centuries" },
  snap: "Step (years)",
  mode: "The candidate…",
  modes: { date: "places each event at its date", period: "puts each event in a period", order: "puts the events in order" },
  margin: "Margin (years)",
  scoring: "Score",
  scorings: { each: "1 point per event (per pair in order mode)", all: "1 point when everything is right" },
  presetNone: "No periods",
  presetTijdvakken: "The ten tijdvakken",
  presetOwn: "Own periods",
  addPeriod: "Add a period",
  addEvent: "Add an event",
  remove: "Remove",
  up: "Move up",
  down: "Move down",
  label: "Name",
  text: "Text",
  image: "Picture (URL)",
  alt: "Alternative text",
  year: "Year",
  correctPeriod: "Period",
  byYear: "by the year",
  preview: "The answer on the timeline",
  responseProcessing: "Response processing for the item",
  problemsTitle: "To do",
  noProblems: "Ready: every event has its answer.",
  maxScore: (n: number) => `Maximum score: ${n}`,
  problem: (p: Problem): string => {
    switch (p.code) {
      case "noEvents": return "Add at least one event.";
      case "tooMany": return "At most 12 events.";
      case "range": return "The axis has to end after it starts.";
      case "noText": return `Event ${p.event} has no text.`;
      case "noYear": return `Event ${p.event} has no year.`;
      case "outside": return `The year of event ${p.event} is not on the axis.`;
      case "noPeriod": return `Event ${p.event} has no period on the axis.`;
      case "noPeriods": return "This question needs periods on the axis.";
      case "periodLabel": return `Period ${p.period} has no name.`;
      case "periodRange": return `Period ${p.period} has to end after it starts.`;
      case "periodOutside": return `Period ${p.period} is not on the axis.`;
      case "fewEvents": return "Putting events in order needs at least two.";
      case "allSameYear": return "The events all have the same year: there is no order.";
    }
  },
};
export type Texts = typeof en;

const nl: Texts = {
  examplePrompt: "Sleep elke gebeurtenis naar het jaar waarin die plaatsvond. Tot 10 jaar ernaast telt nog goed.",
  timeline: "Tijdbalk",
  tray: "Gebeurtenissen om te plaatsen",
  trayEmpty: "Alle gebeurtenissen staan op de tijdbalk.",
  placedList: "Gebeurtenissen op de tijdbalk",
  hint: "Sleep de kaart naar de tijdbalk, of druk op Enter om hem erop te zetten en verplaats hem met de pijltjestoetsen.",
  zoomIn: "Inzoomen",
  zoomOut: "Uitzoomen",
  fit: "Alles tonen",
  earlier: "Eerder",
  later: "Later",
  showing: (from, to) => `Van ${from} tot ${to}.`,
  clear: "Opnieuw beginnen",
  help: "Uitleg",
  helpText:
    "Sleep een kaart naar de tijdbalk, of klik op een kaart en dan op de tijdbalk. Sleep een kaart op de tijdbalk om hem te verplaatsen, of van de tijdbalk af om hem terug te leggen. " +
    "Toetsenbord: Enter op een kaart zet hem op de tijdbalk; daarna verplaatsen de pijltjestoetsen hem (Page Up en Page Down verder, Home en End naar de uiteinden), " +
    "Delete legt hem terug. Zoom met de knoppen, Ctrl + scrollen of + en −; scroll opzij of sleep de tijdbalk om erlangs te gaan.",
  helpOrder: " Bij deze vraag telt alleen de volgorde: de pijltjestoetsen zetten een kaart voorbij zijn buurman.",
  chosen: (text) => `${text} gekozen: klik op de tijdbalk om hem te plaatsen.`,
  placedAt: (text, where) => `${text}: ${where}.`,
  placedIn: (text, period) => `${text}: ${period}.`,
  placedOrder: (text, n, of) => `${text}: plaats ${n} van ${of}.`,
  returned: (text) => `${text} ligt weer in de lijst.`,
  cleared: "Alle kaarten liggen weer in de lijst.",
  orderValue: (n, of) => `plaats ${n} van ${of}`,
  noPeriod: "niet in een tijdvak",
  outOfView: "buiten beeld",
  earlierLater: ["eerder", "later"],
  period: "Tijdvak",
  periods: "Tijdvakken",
  readOnly: "Het goede antwoord",
  tabAxis: "As",
  tabPeriods: "Tijdvakken",
  tabEvents: "Gebeurtenissen",
  tabScoring: "Antwoord en score",
  start: "Van",
  end: "Tot",
  yearHint: "een jaar; v.Chr. als −44 of 44 v.Chr.",
  unit: "Eenheid",
  units: { year: "Jaren", decade: "Decennia", century: "Eeuwen" },
  snap: "Stap (jaren)",
  mode: "De kandidaat…",
  modes: { date: "zet elke gebeurtenis bij het jaartal", period: "zet elke gebeurtenis in een tijdvak", order: "zet de gebeurtenissen op volgorde" },
  margin: "Marge (jaren)",
  scoring: "Score",
  scorings: { each: "1 punt per gebeurtenis (per paar bij volgorde)", all: "1 punt als alles goed is" },
  presetNone: "Geen tijdvakken",
  presetTijdvakken: "De tien tijdvakken",
  presetOwn: "Eigen tijdvakken",
  addPeriod: "Tijdvak toevoegen",
  addEvent: "Gebeurtenis toevoegen",
  remove: "Verwijderen",
  up: "Omhoog",
  down: "Omlaag",
  label: "Naam",
  text: "Tekst",
  image: "Afbeelding (URL)",
  alt: "Alternatieve tekst",
  year: "Jaar",
  correctPeriod: "Tijdvak",
  byYear: "volgens het jaar",
  preview: "Het antwoord op de tijdbalk",
  responseProcessing: "Responsverwerking voor het item",
  problemsTitle: "Nog te doen",
  noProblems: "Klaar: elke gebeurtenis heeft een antwoord.",
  maxScore: (n) => `Maximale score: ${n}`,
  problem: (p) => {
    switch (p.code) {
      case "noEvents": return "Voeg minstens één gebeurtenis toe.";
      case "tooMany": return "Hoogstens 12 gebeurtenissen.";
      case "range": return "De as moet later eindigen dan hij begint.";
      case "noText": return `Gebeurtenis ${p.event} heeft geen tekst.`;
      case "noYear": return `Gebeurtenis ${p.event} heeft geen jaar.`;
      case "outside": return `Het jaar van gebeurtenis ${p.event} staat niet op de as.`;
      case "noPeriod": return `Gebeurtenis ${p.event} heeft geen tijdvak op de as.`;
      case "noPeriods": return "Deze vraag heeft tijdvakken op de as nodig.";
      case "periodLabel": return `Tijdvak ${p.period} heeft geen naam.`;
      case "periodRange": return `Tijdvak ${p.period} moet later eindigen dan het begint.`;
      case "periodOutside": return `Tijdvak ${p.period} staat niet op de as.`;
      case "fewEvents": return "Voor een volgorde zijn minstens twee gebeurtenissen nodig.";
      case "allSameYear": return "Alle gebeurtenissen hebben hetzelfde jaar: er is geen volgorde.";
    }
  },
};

const texts: Record<string, Texts> = { en, nl };
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
/** The language code the timeline formats years in. */
export const languageOf = (language: string) => ((language ?? "").slice(0, 2).toLowerCase() === "nl" ? "nl" : "en");
