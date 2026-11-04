// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Trainpci and
// https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Relatempci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The texts of the PCI per language (data-language); the item's own texts (the prompt) are settings.

import type { FrameId, PointId, Scene, Shape } from "./model";

type SceneTexts = {
  /** the points, as they appear in a sentence ("the red ladybird") */
  points: Record<PointId, string>;
  /** the same, as a label for a checkbox ("Red ladybird (on the rim of the wheel)") */
  pointLabels: Record<PointId, string>;
  /** the frames, as a choice ("The Earth's frame: the cow") */
  frames: Record<FrameId, string>;
  /** the observer of each frame, in a sentence ("the cow") */
  observers: Record<FrameId, string>;
  /** what the picture shows */
  picture: string;
};

const en = {
  simulation: "Reference frames simulation",
  pointOfView: "Point of view",
  trace: "Show the trajectory of",
  play: "Play",
  pause: "Pause",
  stepBack: "Step back",
  stepForward: "Step forward",
  reset: "Back to the start",
  speed: "Playback speed",
  time: "Time",
  turns: (value: number, text: string) => `${text} ${value === 1 ? "turn" : "turns"} of the wheel`,
  reducedMotion: "Animations are reduced on this device: use Play or the step buttons.",
  questions: "Questions",
  trajectoryQuestion: (point: string, observer: string) => `What does the trajectory of ${point} look like for ${observer}?`,
  motionQuestion: (point: string, observer: string) => `For ${observer}, ${point}…`,
  moves: "moves",
  rest: "is at rest",
  shapes: {
    rest: "A point (at rest)",
    line: "A straight line",
    circle: "A circle",
    cycloid: "Arches (cycloid)",
    loops: "Loops",
    wave: "A wavy line",
  } as Record<Shape, string>,
  /** What a screen reader hears about the picture. */
  describe: (observer: string, turns: string, traced: string) => `Seen by ${observer}, after ${turns}.${traced ? ` ${traced}` : ""}`,
  traced: (points: string) => `The trajectory of ${points} is drawn.`,
  tracedShape: (point: string, shape: string) => `The trajectory of ${point}: ${shape.toLowerCase()}.`,
  and: "and",
  /** after a change of the point of view or of the traces */
  announceFrame: (frame: string) => `Point of view: ${frame}.`,
  announceEnd: "The end of the run.",
  scenes: {
    train: {
      points: { rim: "the red ladybird", hub: "the blue ladybird", passenger: "the passenger", bystander: "the cow", second: "the car" },
      pointLabels: {
        rim: "Red ladybird (on the rim of the wheel)",
        hub: "Blue ladybird (on the axle)",
        passenger: "Passenger",
        bystander: "Cow",
        second: "Car",
      },
      frames: {
        ground: "The Earth's frame: the cow in the field",
        vehicle: "The train's frame: the passenger",
        second: "The car's frame: the driver",
      },
      observers: { ground: "the cow", vehicle: "the passenger in the train", second: "the driver of the car" },
      picture: "A train passes a cow in a field; two ladybirds sit on a wheel of the train, one on the rim and one on the axle.",
    },
    motorbike: {
      points: { rim: "the valve of the rear wheel", hub: "the rear axle", passenger: "Zoé", bystander: "Marc", second: "the cyclist" },
      pointLabels: {
        rim: "Valve (on the rim of the rear wheel)",
        hub: "Rear axle",
        passenger: "Zoé",
        bystander: "Marc",
        second: "Cyclist",
      },
      frames: {
        ground: "Marc's point of view (on his rock)",
        vehicle: "Zoé's point of view (on the motorbike)",
        second: "The cyclist's point of view",
      },
      observers: { ground: "Marc", vehicle: "Zoé", second: "the cyclist" },
      picture: "Zoé rides a motorbike along a desert road; Marc sits on a rock beside the road.",
    },
  } as Record<Scene, SceneTexts>,
};

export type Texts = typeof en;

const nl: Texts = {
  simulation: "Simulatie van referentiestelsels",
  pointOfView: "Gezien door",
  trace: "Laat de baan zien van",
  play: "Afspelen",
  pause: "Pauzeren",
  stepBack: "Stap terug",
  stepForward: "Stap vooruit",
  reset: "Terug naar het begin",
  speed: "Afspeelsnelheid",
  time: "Tijd",
  turns: (value: number, text: string) => `${text} ${value === 1 ? "omwenteling" : "omwentelingen"} van het wiel`,
  reducedMotion: "Animaties zijn beperkt op dit apparaat: gebruik Afspelen of de stapknoppen.",
  questions: "Vragen",
  trajectoryQuestion: (point: string, observer: string) => `Hoe ziet de baan van ${point} eruit voor ${observer}?`,
  motionQuestion: (point: string, observer: string) => `Voor ${observer} is ${point}…`,
  moves: "in beweging",
  rest: "in rust",
  shapes: {
    rest: "Een punt (in rust)",
    line: "Een rechte lijn",
    circle: "Een cirkel",
    cycloid: "Bogen (cycloïde)",
    loops: "Lussen",
    wave: "Een golvende lijn",
  },
  describe: (observer: string, turns: string, traced: string) => `Gezien door ${observer}, na ${turns}.${traced ? ` ${traced}` : ""}`,
  traced: (points: string) => `De baan van ${points} is getekend.`,
  tracedShape: (point: string, shape: string) => `De baan van ${point}: ${shape.toLowerCase()}.`,
  and: "en",
  announceFrame: (frame: string) => `Gezien door: ${frame}.`,
  announceEnd: "Het einde van de rit.",
  scenes: {
    train: {
      points: { rim: "het rode lieveheersbeestje", hub: "het blauwe lieveheersbeestje", passenger: "de passagier", bystander: "de koe", second: "de auto" },
      pointLabels: {
        rim: "Rood lieveheersbeestje (op de rand van het wiel)",
        hub: "Blauw lieveheersbeestje (op de as)",
        passenger: "Passagier",
        bystander: "Koe",
        second: "Auto",
      },
      frames: {
        ground: "Het stelsel van de aarde: de koe in de wei",
        vehicle: "Het stelsel van de trein: de passagier",
        second: "Het stelsel van de auto: de bestuurder",
      },
      observers: { ground: "de koe", vehicle: "de passagier in de trein", second: "de bestuurder van de auto" },
      picture: "Een trein rijdt langs een koe in de wei; op een wiel van de trein zitten twee lieveheersbeestjes, een op de rand en een op de as.",
    },
    motorbike: {
      points: { rim: "het ventiel van het achterwiel", hub: "de achteras", passenger: "Zoé", bystander: "Marc", second: "de fietser" },
      pointLabels: {
        rim: "Ventiel (op de rand van het achterwiel)",
        hub: "Achteras",
        passenger: "Zoé",
        bystander: "Marc",
        second: "Fietser",
      },
      frames: {
        ground: "Wat Marc ziet (op zijn rots)",
        vehicle: "Wat Zoé ziet (op de motor)",
        second: "Wat de fietser ziet",
      },
      observers: { ground: "Marc", vehicle: "Zoé", second: "de fietser" },
      picture: "Zoé rijdt op een motor over een weg door de woestijn; Marc zit op een rots langs de weg.",
    },
  },
};

const fr: Texts = {
  simulation: "Simulation de référentiels",
  pointOfView: "Point de vue",
  trace: "Montrer la trajectoire de",
  play: "Lecture",
  pause: "Pause",
  stepBack: "Pas en arrière",
  stepForward: "Pas en avant",
  reset: "Remise à zéro",
  speed: "Vitesse de lecture",
  time: "Temps",
  turns: (value: number, text: string) => `${text} ${value >= 2 ? "tours" : "tour"} de roue`,
  reducedMotion: "Les animations sont réduites sur cet appareil : utilisez Lecture ou les boutons pas à pas.",
  questions: "Questions",
  trajectoryQuestion: (point: string, observer: string) => `Quelle est l'allure de la trajectoire de ${point} pour ${observer} ?`,
  motionQuestion: (point: string, observer: string) => `Pour ${observer}, ${point}…`,
  moves: "est en mouvement",
  rest: "est au repos",
  shapes: {
    rest: "Un point (au repos)",
    line: "Une ligne droite",
    circle: "Un cercle",
    cycloid: "Des arches (cycloïde)",
    loops: "Des boucles",
    wave: "Une ligne ondulée",
  },
  describe: (observer: string, turns: string, traced: string) => `Vu par ${observer}, après ${turns}.${traced ? ` ${traced}` : ""}`,
  traced: (points: string) => `La trajectoire de ${points} est tracée.`,
  tracedShape: (point: string, shape: string) => `La trajectoire de ${point} : ${shape.toLowerCase()}.`,
  and: "et",
  announceFrame: (frame: string) => `Point de vue : ${frame}.`,
  announceEnd: "Fin du trajet.",
  scenes: {
    train: {
      points: { rim: "la coccinelle rouge", hub: "la coccinelle bleue", passenger: "le passager", bystander: "la vache", second: "la voiture" },
      pointLabels: {
        rim: "Coccinelle rouge (sur le bord de la roue)",
        hub: "Coccinelle bleue (sur l'axe)",
        passenger: "Passager",
        bystander: "Vache",
        second: "Voiture",
      },
      frames: {
        ground: "Le référentiel terrestre : la vache dans le pré",
        vehicle: "Le référentiel du train : le passager",
        second: "Le référentiel de la voiture : le conducteur",
      },
      observers: { ground: "la vache", vehicle: "le passager du train", second: "le conducteur de la voiture" },
      picture: "Un train passe devant une vache dans un pré ; deux coccinelles sont posées sur une roue du train, l'une sur le bord, l'autre sur l'axe.",
    },
    motorbike: {
      points: { rim: "la valve de la roue arrière", hub: "l'axe arrière", passenger: "Zoé", bystander: "Marc", second: "le cycliste" },
      pointLabels: {
        rim: "Valve (sur le bord de la roue arrière)",
        hub: "Axe arrière",
        passenger: "Zoé",
        bystander: "Marc",
        second: "Cycliste",
      },
      frames: {
        ground: "Le point de vue de Marc (sur son rocher)",
        vehicle: "Le point de vue de Zoé (sur la moto)",
        second: "Le point de vue du cycliste",
      },
      observers: { ground: "Marc", vehicle: "Zoé", second: "le cycliste" },
      picture: "Zoé roule à moto sur une route du désert ; Marc est assis sur un rocher au bord de la route.",
    },
  },
};

const texts: Record<string, Texts> = { en, nl, fr };
/** "nl", "fr-FR" → their texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
