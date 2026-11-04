// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/EffetDeSerrepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The texts of the PCI per language (data-language); the item's own texts are settings.

export type FlowKey =
  | "incoming"
  | "reflected"
  | "solarAtmosphere"
  | "solarSurface"
  | "surfaceInfrared"
  | "window"
  | "atmosphereUp"
  | "backRadiation";

const en = {
  simulation: "Greenhouse effect simulation",
  space: "Space",
  atmosphere: "Atmosphere",
  surface: "Earth's surface",
  /** Short names on the arrows. */
  flows: {
    incoming: "Sunlight",
    reflected: "Reflected",
    solarAtmosphere: "Absorbed by the air",
    solarSurface: "Absorbed by the surface",
    surfaceInfrared: "Infrared from the surface",
    window: "Straight to space",
    atmosphereUp: "Infrared to space",
    backRadiation: "Back to the surface",
  } as Record<FlowKey, string>,
  /** Longer names in the table. */
  flowNames: {
    incoming: "Sunlight arriving at the top of the atmosphere",
    reflected: "Sunlight reflected to space",
    solarAtmosphere: "Sunlight absorbed by the atmosphere",
    solarSurface: "Sunlight absorbed by the surface",
    surfaceInfrared: "Infrared radiated by the warm surface",
    window: "Surface infrared that escapes straight to space",
    atmosphereUp: "Infrared radiated by the atmosphere to space",
    backRadiation: "Infrared radiated by the atmosphere back to the surface",
  } as Record<FlowKey, string>,
  greenhouseEffect: "greenhouse effect",
  gases: "Greenhouse gases",
  less: "less",
  more: "more",
  lessButton: "Less greenhouse gas",
  moreButton: "More greenhouse gas",
  absorbed: (percent: string) => `The atmosphere absorbs ${percent} of the surface infrared`,
  thermometer: "Surface temperature",
  temperatureHidden: "The temperature is not shown.",
  /** The picture, for a screen reader. */
  picture: (incoming: string, surface: string, back: string) =>
    `Energy flows of the Earth: ${incoming} of sunlight comes in; the surface radiates ${surface} of infrared; the atmosphere sends ${back} back to the surface.`,
  thermometerLabel: (temperature: string) => `Thermometer: ${temperature}`,
  /** What a screen reader hears after a change. */
  announce: (level: string, temperature: string) =>
    temperature ? `Greenhouse gases ${level}: surface temperature ${temperature}.` : `Greenhouse gases ${level}.`,
  table: "Energy flows",
  flow: "Flow",
  share: "% of sunlight",
  target: (temperature: string) => `Target: ${temperature}`,
  targetTask: (temperature: string, tolerance: string) =>
    `Set the amount of greenhouse gas so that the surface temperature is ${temperature} (± ${tolerance}).`,
  question: (more: boolean): string =>
    more
      ? "What happens to the surface temperature when there is more greenhouse gas in the atmosphere?"
      : "What happens to the surface temperature when there is less greenhouse gas in the atmosphere?",
  predictions: { up: "It rises", same: "It stays the same", down: "It falls" } as Record<string, string>,
  predictFirst: "Choose your prediction first; then try it with the slider.",
  predictionFixed: "Your prediction is fixed now.",
};

const nl: typeof en = {
  simulation: "Simulatie van het broeikaseffect",
  space: "Heelal",
  atmosphere: "Atmosfeer",
  surface: "Aardoppervlak",
  flows: {
    incoming: "Zonlicht",
    reflected: "Teruggekaatst",
    solarAtmosphere: "Opgenomen door de lucht",
    solarSurface: "Opgenomen door het oppervlak",
    surfaceInfrared: "Infrarood van het oppervlak",
    window: "Direct naar het heelal",
    atmosphereUp: "Infrarood naar het heelal",
    backRadiation: "Terug naar het oppervlak",
  },
  flowNames: {
    incoming: "Zonlicht dat boven in de atmosfeer aankomt",
    reflected: "Zonlicht dat teruggekaatst wordt naar het heelal",
    solarAtmosphere: "Zonlicht dat de atmosfeer opneemt",
    solarSurface: "Zonlicht dat het aardoppervlak opneemt",
    surfaceInfrared: "Infrarood dat het warme aardoppervlak uitstraalt",
    window: "Infrarood van het oppervlak dat direct naar het heelal gaat",
    atmosphereUp: "Infrarood dat de atmosfeer naar het heelal uitstraalt",
    backRadiation: "Infrarood dat de atmosfeer terugstraalt naar het oppervlak",
  },
  greenhouseEffect: "broeikaseffect",
  gases: "Broeikasgassen",
  less: "minder",
  more: "meer",
  lessButton: "Minder broeikasgas",
  moreButton: "Meer broeikasgas",
  absorbed: (percent: string) => `De atmosfeer neemt ${percent} van het infrarood van het oppervlak op`,
  thermometer: "Temperatuur van het oppervlak",
  temperatureHidden: "De temperatuur wordt niet getoond.",
  picture: (incoming: string, surface: string, back: string) =>
    `Energiestromen van de aarde: er komt ${incoming} zonlicht binnen; het oppervlak straalt ${surface} infrarood uit; de atmosfeer straalt ${back} terug naar het oppervlak.`,
  thermometerLabel: (temperature: string) => `Thermometer: ${temperature}`,
  announce: (level: string, temperature: string) =>
    temperature ? `Broeikasgassen ${level}: temperatuur van het oppervlak ${temperature}.` : `Broeikasgassen ${level}.`,
  table: "Energiestromen",
  flow: "Stroom",
  share: "% van het zonlicht",
  target: (temperature: string) => `Doel: ${temperature}`,
  targetTask: (temperature: string, tolerance: string) =>
    `Stel de hoeveelheid broeikasgas zo in dat de temperatuur van het oppervlak ${temperature} is (± ${tolerance}).`,
  question: (more: boolean): string =>
    more
      ? "Wat gebeurt er met de temperatuur van het oppervlak als er meer broeikasgas in de atmosfeer is?"
      : "Wat gebeurt er met de temperatuur van het oppervlak als er minder broeikasgas in de atmosfeer is?",
  predictions: { up: "Die stijgt", same: "Die blijft gelijk", down: "Die daalt" },
  predictFirst: "Kies eerst je voorspelling; probeer het daarna uit met de schuif.",
  predictionFixed: "Je voorspelling staat nu vast.",
};

const fr: typeof en = {
  simulation: "Simulation de l'effet de serre",
  space: "Espace",
  atmosphere: "Atmosphère",
  surface: "Surface de la Terre",
  flows: {
    incoming: "Rayons solaires",
    reflected: "Renvoyée",
    solarAtmosphere: "Absorbée par l'air",
    solarSurface: "Absorbée par la surface",
    surfaceInfrared: "Infrarouge du sol",
    window: "Directement vers l'espace",
    atmosphereUp: "Infrarouge vers l'espace",
    backRadiation: "Renvoyée vers le sol",
  },
  flowNames: {
    incoming: "Rayons solaires arrivant en haut de l'atmosphère",
    reflected: "Rayons solaires renvoyés vers l'espace",
    solarAtmosphere: "Rayons solaires absorbés par l'atmosphère",
    solarSurface: "Rayons solaires absorbés à la surface",
    surfaceInfrared: "Rayons infrarouges émis par le sol chauffé",
    window: "Infrarouge du sol qui part directement vers l'espace",
    atmosphereUp: "Infrarouge émis par l'atmosphère vers l'espace",
    backRadiation: "Infrarouge émis par l'atmosphère et renvoyé vers le sol",
  },
  greenhouseEffect: "effet de serre",
  gases: "Gaz à effet de serre",
  less: "moins",
  more: "plus",
  lessButton: "Moins de gaz à effet de serre",
  moreButton: "Plus de gaz à effet de serre",
  absorbed: (percent: string) => `L'atmosphère absorbe ${percent} de l'infrarouge du sol`,
  thermometer: "Température de la surface",
  temperatureHidden: "La température n'est pas affichée.",
  picture: (incoming: string, surface: string, back: string) =>
    `Flux d'énergie de la Terre : ${incoming} de rayons solaires arrivent ; le sol émet ${surface} d'infrarouge ; l'atmosphère en renvoie ${back} vers le sol.`,
  thermometerLabel: (temperature: string) => `Thermomètre : ${temperature}`,
  announce: (level: string, temperature: string) =>
    temperature ? `Gaz à effet de serre ${level} : température de la surface ${temperature}.` : `Gaz à effet de serre ${level}.`,
  table: "Flux d'énergie",
  flow: "Flux",
  share: "% des rayons solaires",
  target: (temperature: string) => `Objectif : ${temperature}`,
  targetTask: (temperature: string, tolerance: string) =>
    `Règle la quantité de gaz à effet de serre pour que la température de la surface soit de ${temperature} (± ${tolerance}).`,
  question: (more: boolean): string =>
    more
      ? "Que devient la température de la surface quand il y a plus de gaz à effet de serre dans l'atmosphère ?"
      : "Que devient la température de la surface quand il y a moins de gaz à effet de serre dans l'atmosphère ?",
  predictions: { up: "Elle augmente", same: "Elle reste la même", down: "Elle baisse" },
  predictFirst: "Choisis d'abord ta prévision, puis vérifie-la avec le curseur.",
  predictionFixed: "Ta prévision est maintenant fixée.",
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl, fr };
/** "nl", "fr-FR" → those texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
