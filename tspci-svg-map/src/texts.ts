// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/svgmap, © OpenPCI (Aarhus University and Aalborg University):
// Elias J.T. Hansen, Anna Rusmann and Jeppe Bundsgaard.
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026.

// The texts of the PCI per language (data-language, or the authoring system's language).

const en = {
  map: "Map",
  instructions:
    "Click or tap a point on a road to draw your route to it, or drag along the roads. Click a point on your route to go back to it.",
  keyboard:
    "Keyboard: the arrow keys move along the roads from crossing to crossing, Enter or Space draws the route to it, Backspace undoes.",
  undo: "Undo",
  clear: "Start over",
  start: "Start",
  point: (n: number) => `Point ${n}`,
  onRoute: "on your route",
  routeEnd: "end of your route",
  roadsTo: (directions: string[]) => (directions.length ? `Roads lead ${directions.join(", ")}.` : "No roads lead from here."),
  directions: ["right", "down and right", "down", "down and left", "left", "up and left", "up", "up and right"],
  noRoad: "There is no road there that does not go back over your route.",
  empty: "No route yet.",
  drawn: "Your route is drawn.",
  passed: (names: string[]) => (names.length ? `It passes: ${names.join(", ")}.` : "It passes no points of interest yet."),
  routeTo: (name: string) => `Route drawn to ${name}.`,
  backTo: (name: string) => `Route taken back to ${name}.`,
  undone: "Last step undone.",
  cleared: "Route cleared.",
  // problems with the map
  invalidSvg: "The map is not a valid SVG image.",
  noLayer: (id: string) => `The map has no layer with id "${id}".`,
  noPaths: (id: string) => `The layer "${id}" has no paths to follow.`,
  // authoring mode
  upload: "Upload SVG map…",
  example: "Use the example map",
  summary: (points: number, crossings: number) => `${points} points, ${crossings} crossings and road ends`,
  hint:
    "Click a point on a road to select it, then make it the start or a point of interest. The response names the points of interest the route passes. " +
    "Changing the path layer or the distance between points renumbers the points: set the points of interest again.",
  selected: (n: number) => `Selected: point ${n}`,
  nothingSelected: "Select a point on the map.",
  poiName: "Name",
  addPoi: "Add point of interest",
  makeStart: "Make this the start",
  remove: (name: string) => `Remove ${name}`,
  pois: "Points of interest",
  noPois: "No points of interest yet.",
  invalidName: "Use letters, digits, - and _ only, and not \"start\".",
  unknownPoint: (name: string) => `${name} refers to a point that is not on the map.`,
  unknownPoi: (name: string) => `The scoring names ${name}, which is not a point of interest.`,
  mustPass: "must pass",
  mustPassHint: "For the score: the route must pass this point",
  end: "end",
  endHint: "For the score: the route must end here",
  scoringHint: "Score 1 when the route passes every \"must pass\" point and ends at the \"end\"; \"shortest\" is a setting of its own.",
};

const nl: typeof en = {
  map: "Kaart",
  instructions:
    "Klik of tik op een punt op een weg om je route ernaartoe te tekenen, of sleep langs de wegen. Klik op een punt van je route om daarnaar terug te gaan.",
  keyboard:
    "Toetsenbord: met de pijltjestoetsen ga je langs de wegen van kruispunt naar kruispunt, Enter of spatie tekent de route ernaartoe, Backspace maakt ongedaan.",
  undo: "Ongedaan maken",
  clear: "Opnieuw beginnen",
  start: "Start",
  point: (n: number) => `Punt ${n}`,
  onRoute: "op je route",
  routeEnd: "einde van je route",
  roadsTo: (directions: string[]) => (directions.length ? `Wegen gaan naar ${directions.join(", ")}.` : "Hier gaan geen wegen verder."),
  directions: ["rechts", "rechtsonder", "beneden", "linksonder", "links", "linksboven", "boven", "rechtsboven"],
  noRoad: "Daar loopt geen weg naartoe die niet terug over je route gaat.",
  empty: "Nog geen route.",
  drawn: "Je route is getekend.",
  passed: (names: string[]) => (names.length ? `Hij komt langs: ${names.join(", ")}.` : "Hij komt nog niet langs een plaats."),
  routeTo: (name: string) => `Route getekend naar ${name}.`,
  backTo: (name: string) => `Route teruggezet naar ${name}.`,
  undone: "Laatste stap ongedaan gemaakt.",
  cleared: "Route gewist.",
  invalidSvg: "De kaart is geen geldige SVG-afbeelding.",
  noLayer: (id: string) => `De kaart heeft geen laag met id "${id}".`,
  noPaths: (id: string) => `De laag "${id}" heeft geen paden om te volgen.`,
  upload: "SVG-kaart uploaden…",
  example: "Voorbeeldkaart gebruiken",
  summary: (points: number, crossings: number) => `${points} punten, ${crossings} kruispunten en wegeinden`,
  hint:
    "Klik op een punt op een weg om het te selecteren, en maak het de start of een plaats. Het antwoord noemt de plaatsen waar de route langs komt. " +
    "Als je de laag met paden of de afstand tussen de punten verandert, worden de punten opnieuw genummerd: stel de plaatsen dan opnieuw in.",
  selected: (n: number) => `Geselecteerd: punt ${n}`,
  nothingSelected: "Selecteer een punt op de kaart.",
  poiName: "Naam",
  addPoi: "Plaats toevoegen",
  makeStart: "Maak dit de start",
  remove: (name: string) => `${name} verwijderen`,
  pois: "Plaatsen",
  noPois: "Nog geen plaatsen.",
  invalidName: "Gebruik alleen letters, cijfers, - en _, en niet \"start\".",
  unknownPoint: (name: string) => `${name} verwijst naar een punt dat niet op de kaart staat.`,
  unknownPoi: (name: string) => `De score noemt ${name}, maar dat is geen plaats.`,
  mustPass: "verplicht",
  mustPassHint: "Voor de score: de route moet langs deze plaats komen",
  end: "einde",
  endHint: "Voor de score: de route moet hier eindigen",
  scoringHint: "Score 1 als de route langs elke verplichte plaats komt en bij het einde eindigt; \"kortste\" is een aparte instelling.",
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
