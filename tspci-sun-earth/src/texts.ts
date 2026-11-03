// The texts of the PCI per language (data-language, and the author's language in the authoring mode).
import type { Field, Problem } from "./setup";
import { formatNumber } from "./format";

const lat = (v: number, l: "en" | "nl") => `${formatNumber(Math.abs(v), 1, l)}° ${v >= 0 ? (l === "nl" ? "NB" : "N") : l === "nl" ? "ZB" : "S"}`;
const lon = (v: number, l: "en" | "nl") => `${formatNumber(Math.abs(v), 1, l)}° ${v >= 0 ? (l === "nl" ? "OL" : "E") : l === "nl" ? "WL" : "W"}`;

const en = {
  language: "en" as "en" | "nl",
  simulation: "Sun, Earth and seasons",
  view3d: "3D view: the Earth on its orbit around the Sun",
  view3dHelp: "Drag to turn. Drag the Earth along its orbit to change the date, click a place to choose it. Keys: arrows turn, + and − zoom, 0 back to the start.",
  notToScale: "Not to scale: the Sun is far bigger and much farther away.",
  noWebgl: "This browser cannot show the 3D view; the drawing shows the same Earth from the side.",
  focus: "View",
  focusOrbit: "Orbit",
  focusEarth: "Earth",
  turnLeft: "Turn left",
  turnRight: "Turn right",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  resetView: "Back to the start view",
  marks: (months: string[]) => [`20 ${months[2]}`, `21 ${months[5]}`, `22 ${months[8]}`, `21 ${months[11]}`] as [string, string, string, string],
  months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  date: (day: number, month: string) => `${day} ${month}`,
  dayOfYear: (n: number) => `day ${n}`,

  diagram: "The Earth seen from the side",
  diagramLabel: (date: string, overhead: string, place: string, side: string) =>
    `The Earth seen from the side on ${date}, the sunlight from the left. The axis leans so that the sun is overhead at ${overhead}. ${place} is on the ${side} side.`,
  daySide: "day",
  nightSide: "night",
  sunlight: "Sunlight",
  day: "Day",
  night: "Night",

  sky: (place: string) => `The sky in ${place}`,
  skyLabel: (place: string, date: string, noon: string, rise: string, set: string) =>
    `The sun's path through the sky in ${place} on ${date}: the highest at noon, ${noon} above the horizon. ${rise} ${set}`,
  horizon: "Horizon",
  directions: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
  belowHorizon: "below the horizon",

  controls: "Settings",
  place: "Place",
  dateLabel: "Date",
  timeLabel: (base: "utc" | "local"): string => (base === "utc" ? "Time (UTC)" : "Time (local, by longitude)"),
  utc: "UTC",
  local: "local",
  less: (what: string) => `${what}: earlier`,
  more: (what: string) => `${what}: later`,
  fixed: (what: string, value: string) => `${what}: ${value}`,
  latLon: (la: number, lo: number, l: "en" | "nl") => `${lat(la, l)}, ${lon(lo, l)}`,
  lat,
  lon,

  info: "What the sun does",
  overhead: "Sun overhead at",
  sunNow: "Sun now",
  sunNowValue: (elevation: string, azimuth: string, dir: string) => `${elevation} high, ${azimuth} (${dir})`,
  sunDown: (elevation: string) => `below the horizon (${elevation})`,
  noon: "Highest, at noon",
  noonValue: (elevation: string, time: string) => `${elevation} at ${time}`,
  sunrise: "Sunrise",
  sunset: "Sunset",
  dayLength: "Day length",
  midnightSun: "Midnight sun: the sun does not set.",
  polarNight: "Polar night: the sun does not rise.",
  none: "none",
  localTimeOf: "Local time (by longitude)",
  utcTime: "UTC",
  hm: (h: number, m: string) => `${h} h ${m} min`,
  dayLine: "The day in 24 hours",

  /** What a screen reader hears after a change. */
  announce: (what: string, value: string, length: string, noon: string) => `${what}: ${value}. Day length ${length}, the sun at noon ${noon} high.`,
  solution: "Correct answer",
  readOnly: "The settings cannot be changed.",

  legendEquator: "Equator",
  legendTropics: "Tropics (23.4°)",
  legendPolar: "Polar circles (66.6°)",
  legendTerminator: "Border of day and night",
  legendSubsolar: "Sun overhead",
  legendPlace: "Chosen place",
  legendPath: "Sun's path, day",
  legendPathNight: "below the horizon",

  field: {
    day: "Day of the year",
    time: "Time, UTC (hours)",
    localTime: "Local time by longitude (hours)",
    solarTime: "Solar time at the place (hours, 12 = noon)",
    declination: "Latitude where the sun is overhead (°)",
    subsolarLongitude: "Longitude where it is noon (°)",
    sunElevation: "Height of the sun now (°)",
    sunAzimuth: "Direction of the sun now (°)",
    noonElevation: "Height of the sun at noon (°)",
    dayLength: "Day length (hours)",
    sunrise: "Sunrise, UTC (hours)",
    sunset: "Sunset, UTC (hours)",
    place: "Place",
  } as Record<Field, string>,

  // the authoring mode
  tabTask: "Places and controls",
  tabTargets: "Targets",
  tabSolution: "Solution",
  places: "Places",
  presets: "Add a known place",
  addPreset: "Add",
  customPlace: "Add a place of your own",
  name: "Name",
  nameNl: "Name (Dutch)",
  latitude: "Latitude (°, north +)",
  longitude: "Longitude (°, east +)",
  removePlace: (name: string) => `Remove ${name}`,
  candidateControls: "What the candidate controls",
  controlDay: "The date",
  controlTime: "The time",
  controlPlace: "The place",
  start: "Start",
  startDay: "Start: day of the year",
  startTime: "Start: time (UTC, hh:mm)",
  startPlace: "Start: place",
  timeStep: "Step of the time slider (minutes)",
  targetsHint: "A target is met when the candidate's value is within the margin; the day and times go round the end of the year and the day.",
  value: "Value",
  margin: "Margin (±)",
  points: "Points",
  addTarget: "Add a target",
  removeTarget: "Remove target",
  solutionValue: "solution",
  met: "met",
  notMet: "not met",
  summary: (score: number, max: number) => `The solution scores ${score} of ${max}.`,
  responseProcessing: "Response processing for the item (margins in QTI)",
  solutionHint: "Set the date, the time and the place as a candidate should. Review shows this setting.",
  problems: "Problems",
  noProblems: "No problems.",
  problem: (p: Problem): string => {
    switch (p.code) {
      case "noPlaces": return "There are no places: add at least one.";
      case "badPlace": return `Place "${p.place}" needs a name.`;
      case "duplicatePlace": return `Two places have the identifier "${p.place}".`;
      case "nothingControls": return "The candidate controls nothing: let them set the date, the time or the place.";
      case "onePlace": return "The candidate chooses the place, but there is only one.";
      case "noTargets": return "There are no targets: add one, or use the PCI as a tool.";
      case "targetPlaceUnknown": return `Target ${p.target} names a place that is not in the list.`;
      case "targetNotControlled": return `Target ${p.target} does not depend on anything the candidate controls.`;
      case "noSolution": return "There is no solution: set one in the Solution tab.";
      case "solutionFails": return `The solution does not meet target ${p.target}.`;
    }
  },
};

export type Texts = typeof en;

const nl: Texts = {
  language: "nl",
  simulation: "Zon, aarde en seizoenen",
  view3d: "3D-weergave: de aarde in haar baan om de zon",
  view3dHelp: "Sleep om te draaien. Sleep de aarde langs haar baan om de datum te veranderen, klik op een plaats om die te kiezen. Toetsen: pijlen draaien, + en − zoomen, 0 terug naar het begin.",
  notToScale: "Niet op schaal: de zon is veel groter en staat veel verder weg.",
  noWebgl: "Deze browser kan de 3D-weergave niet tonen; de tekening toont dezelfde aarde van opzij.",
  focus: "Weergave",
  focusOrbit: "Baan",
  focusEarth: "Aarde",
  turnLeft: "Naar links draaien",
  turnRight: "Naar rechts draaien",
  zoomIn: "Inzoomen",
  zoomOut: "Uitzoomen",
  resetView: "Terug naar het begin",
  marks: (months: string[]) => [`20 ${months[2]}`, `21 ${months[5]}`, `22 ${months[8]}`, `21 ${months[11]}`] as [string, string, string, string],
  months: ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"],
  monthsShort: ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"],
  date: (day: number, month: string) => `${day} ${month}`,
  dayOfYear: (n: number) => `dag ${n}`,

  diagram: "De aarde van opzij",
  diagramLabel: (date: string, overhead: string, place: string, side: string) =>
    `De aarde van opzij op ${date}, het zonlicht komt van links. De as helt zo dat de zon loodrecht staat boven ${overhead}. ${place} ligt aan de ${side}kant.`,
  daySide: "dag",
  nightSide: "nacht",
  sunlight: "Zonlicht",
  day: "Dag",
  night: "Nacht",

  sky: (place: string) => `De hemel in ${place}`,
  skyLabel: (place: string, date: string, noon: string, rise: string, set: string) =>
    `De baan van de zon langs de hemel in ${place} op ${date}: het hoogst 's middags, ${noon} boven de horizon. ${rise} ${set}`,
  horizon: "Horizon",
  directions: ["N", "NO", "O", "ZO", "Z", "ZW", "W", "NW"],
  belowHorizon: "onder de horizon",

  controls: "Instellingen",
  place: "Plaats",
  dateLabel: "Datum",
  timeLabel: (base: "utc" | "local") => (base === "utc" ? "Tijd (UTC)" : "Tijd (plaatselijk, naar lengtegraad)"),
  utc: "UTC",
  local: "plaatselijk",
  less: (what: string) => `${what}: eerder`,
  more: (what: string) => `${what}: later`,
  fixed: (what: string, value: string) => `${what}: ${value}`,
  latLon: (la: number, lo: number, l: "en" | "nl") => `${lat(la, l)}, ${lon(lo, l)}`,
  lat,
  lon,

  info: "Wat de zon doet",
  overhead: "Zon loodrecht boven",
  sunNow: "Zon nu",
  sunNowValue: (elevation: string, azimuth: string, dir: string) => `${elevation} hoog, ${azimuth} (${dir})`,
  sunDown: (elevation: string) => `onder de horizon (${elevation})`,
  noon: "Het hoogst, 's middags",
  noonValue: (elevation: string, time: string) => `${elevation} om ${time}`,
  sunrise: "Zonsopkomst",
  sunset: "Zonsondergang",
  dayLength: "Daglengte",
  midnightSun: "Middernachtzon: de zon gaat niet onder.",
  polarNight: "Poolnacht: de zon komt niet op.",
  none: "geen",
  localTimeOf: "Plaatselijke tijd (naar lengtegraad)",
  utcTime: "UTC",
  hm: (h: number, m: string) => `${h} u ${m} min`,
  dayLine: "De dag in 24 uur",

  announce: (what: string, value: string, length: string, noon: string) => `${what}: ${value}. Daglengte ${length}, de zon 's middags ${noon} hoog.`,
  solution: "Goed antwoord",
  readOnly: "De instellingen kunnen niet veranderd worden.",

  legendEquator: "Evenaar",
  legendTropics: "Keerkringen (23,4°)",
  legendPolar: "Poolcirkels (66,6°)",
  legendTerminator: "Grens van dag en nacht",
  legendSubsolar: "Zon loodrecht",
  legendPlace: "Gekozen plaats",
  legendPath: "Zonnebaan, dag",
  legendPathNight: "onder de horizon",

  field: {
    day: "Dag van het jaar",
    time: "Tijd, UTC (uren)",
    localTime: "Plaatselijke tijd naar lengtegraad (uren)",
    solarTime: "Zonnetijd op de plaats (uren, 12 = middag)",
    declination: "Breedte waar de zon loodrecht staat (°)",
    subsolarLongitude: "Lengtegraad waar het middag is (°)",
    sunElevation: "Zonshoogte nu (°)",
    sunAzimuth: "Richting van de zon nu (°)",
    noonElevation: "Zonshoogte 's middags (°)",
    dayLength: "Daglengte (uren)",
    sunrise: "Zonsopkomst, UTC (uren)",
    sunset: "Zonsondergang, UTC (uren)",
    place: "Plaats",
  },

  tabTask: "Plaatsen en bediening",
  tabTargets: "Doelen",
  tabSolution: "Oplossing",
  places: "Plaatsen",
  presets: "Een bekende plaats toevoegen",
  addPreset: "Toevoegen",
  customPlace: "Een eigen plaats toevoegen",
  name: "Naam",
  nameNl: "Naam (Nederlands)",
  latitude: "Breedte (°, noord +)",
  longitude: "Lengte (°, oost +)",
  removePlace: (name: string) => `${name} verwijderen`,
  candidateControls: "Wat de kandidaat instelt",
  controlDay: "De datum",
  controlTime: "De tijd",
  controlPlace: "De plaats",
  start: "Begin",
  startDay: "Begin: dag van het jaar",
  startTime: "Begin: tijd (UTC, uu:mm)",
  startPlace: "Begin: plaats",
  timeStep: "Stap van de tijdschuif (minuten)",
  targetsHint: "Een doel is gehaald als de waarde van de kandidaat binnen de marge valt; de dag en de tijden lopen door over het eind van het jaar en de dag.",
  value: "Waarde",
  margin: "Marge (±)",
  points: "Punten",
  addTarget: "Doel toevoegen",
  removeTarget: "Doel verwijderen",
  solutionValue: "oplossing",
  met: "gehaald",
  notMet: "niet gehaald",
  summary: (score: number, max: number) => `De oplossing scoort ${score} van ${max}.`,
  responseProcessing: "Response processing voor het item (marges in QTI)",
  solutionHint: "Stel de datum, de tijd en de plaats in zoals een kandidaat dat moet doen. In de review is dit te zien.",
  problems: "Problemen",
  noProblems: "Geen problemen.",
  problem: (p: Problem): string => {
    switch (p.code) {
      case "noPlaces": return "Er zijn geen plaatsen: voeg er minstens één toe.";
      case "badPlace": return `Plaats "${p.place}" heeft een naam nodig.`;
      case "duplicatePlace": return `Twee plaatsen hebben de identifier "${p.place}".`;
      case "nothingControls": return "De kandidaat stelt niets in: laat de datum, de tijd of de plaats instellen.";
      case "onePlace": return "De kandidaat kiest de plaats, maar er is er maar één.";
      case "noTargets": return "Er zijn geen doelen: voeg er een toe, of gebruik de PCI als gereedschap.";
      case "targetPlaceUnknown": return `Doel ${p.target} noemt een plaats die niet in de lijst staat.`;
      case "targetNotControlled": return `Doel ${p.target} hangt van niets af dat de kandidaat instelt.`;
      case "noSolution": return "Er is geen oplossing: stel er een in op het tabblad Oplossing.";
      case "solutionFails": return `De oplossing haalt doel ${p.target} niet.`;
    }
  },
};

export const textsFor = (language: string | undefined): Texts => ((language ?? "").slice(0, 2).toLowerCase() === "nl" ? nl : en);
