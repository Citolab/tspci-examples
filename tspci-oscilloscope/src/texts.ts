// The texts of the PCI per language (data-language, or the authoring system's language); the instruction is a setting.

const en = {
  screen: "Oscilloscope screen",
  reference: "Reference signal",
  yours: "Your signal",
  frequency: "Frequency",
  vibrations: "Number of vibrations",
  amplitude: "Amplitude",
  units: { vibrations: "vibrations", hertz: "Hz", divisions: "div", volts: "V" },
  lower: (name: string) => `${name} lower`,
  higher: (name: string) => `${name} higher`,
  reset: "Reset",
  resetHint: "Back to the setting at the start",
  timeBase: "time base",
  voltsPerDiv: "voltage",
  perDiv: "/div",
  /** The value of a knob whose values are hidden: where it is, not what it is. */
  position: (pos: number, of: number) => `position ${pos} of ${of}`,
  grid: (columns: number, rows: number) => `A grid of ${columns} by ${rows} divisions`,
  describe: (name: string, frequency: string, amplitude: string) => `${name}: ${frequency}, amplitude ${amplitude}`,
  shown: (name: string) => `with the ${name.toLowerCase()}`,
  // authoring mode
  setUp: "Set with the knobs",
  start: "Candidate's start",
  correct: "Correct setting",
  noCorrect: "No correct setting",
  addCorrect: "Add a correct setting",
  authoringHint:
    "Choose a signal and set it with the knobs. The reference is grey and dashed; the candidate starts at the start setting; " +
    "the correct setting is the correct response (an authoring system can take it from the settings). The knobs have the ranges of the settings.",
  hiddenReference: "The candidate does not see the reference signal (setting \"Show the reference signal\").",
  correctOutOfRange: "The correct setting is outside the range of the knobs: the candidate cannot reach it.",
};

const nl: typeof en = {
  screen: "Scherm van de oscilloscoop",
  reference: "Referentiesignaal",
  yours: "Jouw signaal",
  frequency: "Frequentie",
  vibrations: "Aantal trillingen",
  amplitude: "Amplitude",
  units: { vibrations: "trillingen", hertz: "Hz", divisions: "hokjes", volts: "V" },
  lower: (name: string) => `${name} lager`,
  higher: (name: string) => `${name} hoger`,
  reset: "Opnieuw",
  resetHint: "Terug naar de instelling van het begin",
  timeBase: "tijdbasis",
  voltsPerDiv: "spanning",
  perDiv: "/hokje",
  position: (pos: number, of: number) => `stand ${pos} van ${of}`,
  grid: (columns: number, rows: number) => `Een raster van ${columns} bij ${rows} hokjes`,
  describe: (name: string, frequency: string, amplitude: string) => `${name}: ${frequency}, amplitude ${amplitude}`,
  shown: (name: string) => `met het ${name.toLowerCase()}`,
  setUp: "Instellen met de knoppen",
  start: "Begin van de kandidaat",
  correct: "Goede instelling",
  noCorrect: "Geen goede instelling",
  addCorrect: "Goede instelling toevoegen",
  authoringHint:
    "Kies een signaal en stel het in met de knoppen. De referentie is grijs en gestippeld; de kandidaat begint bij de begininstelling; " +
    "de goede instelling is het goede antwoord (een auteurssysteem kan het uit de instellingen halen). De knoppen hebben het bereik uit de instellingen.",
  hiddenReference: "De kandidaat ziet het referentiesignaal niet (instelling \"Referentiesignaal tonen\").",
  correctOutOfRange: "De goede instelling ligt buiten het bereik van de knoppen: de kandidaat kan hem niet instellen.",
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
