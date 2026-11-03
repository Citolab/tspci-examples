// The texts around the applet per language (data-language, or the authoring system's language). GeoGebra's own texts
// follow data-app-language.

const en = {
  region: "GeoGebra applet",
  loading: "Loading GeoGebra…",
  failed: "GeoGebra could not be loaded. Check the internet connection and try again.",
  tryAgain: "Try again",
  // authoring mode
  materialId: "GeoGebra material id or link",
  materialHint: "For example 'abcd1234' or https://www.geogebra.org/m/abcd1234",
  load: "Load material",
  startEmpty: "Start empty",
  invalidId: "That is not a material id or a geogebra.org link.",
  authoringHint:
    "Build the applet with every tool GeoGebra has; Done saves it in the item as it is now. The candidate gets the " +
    "toolbar, menu and other parts set in the settings. Objects named correct, answer, score and maxscore are " +
    "reported in the response.",
  replaceWarning: "This replaces the applet you are building.",
  found: (names: string[]) => (names.length ? `Reported in the response: ${names.join(", ")}` : "No objects named correct, answer, score or maxscore yet."),
  notReady: "The applet is not loaded yet.",
};

const nl: typeof en = {
  region: "GeoGebra-applet",
  loading: "GeoGebra wordt geladen…",
  failed: "GeoGebra kon niet worden geladen. Controleer de internetverbinding en probeer het opnieuw.",
  tryAgain: "Opnieuw proberen",
  materialId: "Id of link van een GeoGebra-materiaal",
  materialHint: "Bijvoorbeeld 'abcd1234' of https://www.geogebra.org/m/abcd1234",
  load: "Materiaal laden",
  startEmpty: "Leeg beginnen",
  invalidId: "Dat is geen materiaal-id of geogebra.org-link.",
  authoringHint:
    "Maak de applet met alle gereedschappen van GeoGebra; Klaar bewaart hem zoals hij nu is in het item. De " +
    "kandidaat krijgt de gereedschapsbalk, het menu en de andere onderdelen uit de instellingen. Objecten met de naam " +
    "correct, answer, score en maxscore komen in het antwoord.",
  replaceWarning: "Dit vervangt de applet die je aan het maken bent.",
  found: (names: string[]) => (names.length ? `In het antwoord: ${names.join(", ")}` : "Nog geen objecten met de naam correct, answer, score of maxscore."),
  notReady: "De applet is nog niet geladen.",
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
