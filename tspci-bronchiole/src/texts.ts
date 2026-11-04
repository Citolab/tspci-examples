// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Broncopci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The texts of the PCI per language (data-language); the item's own texts are settings.

const en = {
  simulation: "Pollution and the bronchioles",
  persons: { healthy: "Healthy person", asthmatic: "Person with asthma" } as Record<string, string>,
  /** In a sentence: "the bronchiole of …". */
  whose: { healthy: "the healthy person", asthmatic: "the person with asthma" } as Record<string, string>,
  pollution: "Air pollution",
  less: "Less pollution",
  more: "More pollution",
  level: (level: string, max: string) => `level ${level} of ${max}`,
  instruction: "Move the slider to change the level of air pollution.",
  area: "Air passage (area)",
  flow: "Airflow",
  ofNormal: "of normal",
  flowNote: "Airflow through a narrow tube goes with the radius to the fourth power (Poiseuille's law): half the radius lets through 1/16 of the air.",
  legend: "Legend",
  parts: { air: "Air", mucus: "Mucus", wall: "Bronchiole wall", muscle: "Smooth muscle", alveoli: "Alveoli" } as Record<string, string>,
  picture: (who: string, area: string, flow: string) =>
    `Cross-section of the bronchiole of ${who}: the air passage is ${area} of normal, the airflow ${flow}.`,
  announce: (level: string, parts: string[]) => `Pollution ${level}. ${parts.join(" ")}`,
  announcePerson: (person: string, area: string | null, flow: string | null) =>
    `${person}: ${[area && `air passage ${area}`, flow && `airflow ${flow}`].filter(Boolean).join(", ")}.`,
  quantities: { flow: "the airflow", area: "the air passage" } as Record<string, string>,
  thresholdQuestion: (quantity: string, who: string, percent: string) =>
    `From which pollution level on is ${quantity} in the bronchiole of ${who} less than ${percent} of normal?`,
  ratioQuestion: (level: string) =>
    `At pollution level ${level}, how many times larger is the airflow in the bronchiole of the healthy person than in that of the person with asthma?`,
  answer: "Your answer",
  answerHint: "A number; a decimal point is allowed.",
  correctAnswer: "Correct answer",
};

const nl: typeof en = {
  simulation: "Luchtvervuiling en de bronchiolen",
  persons: { healthy: "Gezonde persoon", asthmatic: "Persoon met astma" },
  whose: { healthy: "de gezonde persoon", asthmatic: "de persoon met astma" },
  pollution: "Luchtvervuiling",
  less: "Minder vervuiling",
  more: "Meer vervuiling",
  level: (level: string, max: string) => `niveau ${level} van ${max}`,
  instruction: "Verschuif de schuifregelaar om de luchtvervuiling te veranderen.",
  area: "Luchtdoorgang (oppervlakte)",
  flow: "Luchtstroom",
  ofNormal: "van normaal",
  flowNote: "De luchtstroom door een nauwe buis gaat met de straal tot de vierde macht (wet van Poiseuille): de halve straal laat 1/16 van de lucht door.",
  legend: "Legenda",
  parts: { air: "Lucht", mucus: "Slijm", wall: "Wand van de bronchiool", muscle: "Glad spierweefsel", alveoli: "Longblaasjes" },
  picture: (who: string, area: string, flow: string) =>
    `Doorsnede van de bronchiool van ${who}: de luchtdoorgang is ${area} van normaal, de luchtstroom ${flow}.`,
  announce: (level: string, parts: string[]) => `Vervuiling ${level}. ${parts.join(" ")}`,
  announcePerson: (person: string, area: string | null, flow: string | null) =>
    `${person}: ${[area && `luchtdoorgang ${area}`, flow && `luchtstroom ${flow}`].filter(Boolean).join(", ")}.`,
  quantities: { flow: "de luchtstroom", area: "de luchtdoorgang" },
  thresholdQuestion: (quantity: string, who: string, percent: string) =>
    `Vanaf welk vervuilingsniveau is ${quantity} in de bronchiool van ${who} minder dan ${percent} van normaal?`,
  ratioQuestion: (level: string) =>
    `Hoeveel keer zo groot is bij vervuilingsniveau ${level} de luchtstroom in de bronchiool van de gezonde persoon als in die van de persoon met astma?`,
  answer: "Je antwoord",
  answerHint: "Een getal; een decimale komma mag.",
  correctAnswer: "Goed antwoord",
};

const fr: typeof en = {
  simulation: "La pollution et les bronchioles",
  persons: { healthy: "Individu en bonne santé", asthmatic: "Individu asthmatique" },
  whose: { healthy: "l'individu en bonne santé", asthmatic: "l'individu asthmatique" },
  pollution: "Pollution de l'air",
  less: "Moins de pollution",
  more: "Plus de pollution",
  level: (level: string, max: string) => `niveau ${level} sur ${max}`,
  instruction: "Déplace le curseur afin de faire varier le niveau de pollution de l'air.",
  area: "Passage de l'air (surface)",
  flow: "Débit d'air",
  ofNormal: "de la normale",
  flowNote: "Le débit d'air dans un tube étroit varie comme le rayon à la puissance quatre (loi de Poiseuille) : un rayon deux fois plus petit laisse passer 1/16 de l'air.",
  legend: "Légende",
  parts: { air: "Air", mucus: "Mucus", wall: "Paroi de la bronchiole", muscle: "Muscle lisse", alveoli: "Alvéoles pulmonaires" },
  picture: (who: string, area: string, flow: string) =>
    `Coupe de la bronchiole de ${who} : le passage de l'air est à ${area} de la normale, le débit d'air à ${flow}.`,
  announce: (level: string, parts: string[]) => `Pollution ${level}. ${parts.join(" ")}`,
  announcePerson: (person: string, area: string | null, flow: string | null) =>
    `${person} : ${[area && `passage de l'air ${area}`, flow && `débit d'air ${flow}`].filter(Boolean).join(", ")}.`,
  quantities: { flow: "le débit d'air", area: "le passage de l'air" },
  thresholdQuestion: (quantity: string, who: string, percent: string) =>
    `À partir de quel niveau de pollution ${quantity} dans la bronchiole de ${who} est-il inférieur à ${percent} de la normale ?`,
  ratioQuestion: (level: string) =>
    `Au niveau de pollution ${level}, combien de fois le débit d'air dans la bronchiole de l'individu en bonne santé est-il plus grand que dans celle de l'individu asthmatique ?`,
  answer: "Ta réponse",
  answerHint: "Un nombre ; une virgule décimale est permise.",
  correctAnswer: "Bonne réponse",
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl, fr };
/** "nl", "fr-FR" → the Dutch or French texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
