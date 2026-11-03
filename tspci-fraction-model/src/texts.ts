// The texts of the PCI per language (data-language, or the authoring system's language); the item's own text is the
// prompt.
import type { Entry, ModelType, Problem, Task } from "./fraction";

const en = {
  type: { bar: "Bar", circle: "Circle", grid: "Grid", set: "Set" } as Record<ModelType, string>,
  models: "Fraction models",
  model: (type: ModelType, label: string) => `${en.type[type]}${label ? ` ${label}` : ""}`,
  part: (type: ModelType, i: number, n: number, columns: number) =>
    type === "grid" ? `Row ${Math.floor(i / columns) + 1}, column ${(i % columns) + 1}` : `${type === "set" ? "Object" : "Part"} ${i + 1} of ${n}`,
  summary: (n: number, k: number) => `${n} equal ${n === 1 ? "part" : "parts"}, ${k} shaded`,
  setSummary: (n: number, k: number) => `${n} objects, ${k} shaded`,
  given: "the shading is given",
  shaded: (name: string) => `${name} shaded.`,
  unshaded: (name: string) => `${name} not shaded.`,
  count: (model: string, n: number, k: number) => `${model}: ${k} of ${n} shaded.`,
  parts: "Number of parts",
  fewer: "Fewer parts",
  more: "More parts",
  divided: (model: string, n: number, kept: boolean) => `${model} divided into ${n} equal parts${kept ? "" : "; the shading is cleared"}.`,
  clear: "Clear",
  cleared: (model: string) => `${model} cleared.`,
  readout: (k: number, n: number, percent: string) => `${k}/${n} shaded · ${percent}%`,
  fractionOf: (model: string) => `Fraction shaded in ${model}`,
  percentOf: (model: string) => `Percentage shaded in ${model}`,
  numerator: "Numerator",
  denominator: "Denominator",
  digitsOnly: "Only digits.",
  numberOnly: "Only a number, with one decimal point.",
  help: "Click a part to shade it, or drag over parts. Keyboard: the arrow keys go to a part, Space or Enter shades it.",
  solution: "The correct answer.",
  // authoring
  addModel: "Add a model",
  removeModel: "Remove",
  modelType: "Model",
  label: "Label",
  task: "Task",
  taskName: { shade: "The candidate shades", name: "The candidate writes the fraction" } as Record<Task, string>,
  entryName: { fraction: "as a fraction", percent: "as a percentage" } as Record<Entry, string>,
  partsField: "Parts",
  rows: "Rows",
  columns: "Columns",
  divide: "The candidate divides it",
  from: "from",
  to: "to",
  scale: "Percentage scale",
  target: "Answer",
  targetHint: "3/8, 35% or =1 (the same as model 1); empty: not scored",
  requireParts: "Exactly this many parts (PCI scoring; 0: any)",
  simplest: "In lowest terms (PCI scoring)",
  shadingHint: (task: Task): string =>
    task === "name" ? "Click the parts the candidate sees shaded." : "Click parts to shade them at the start (usually none).",
  correct: "Correct response",
  noCorrect: "no correct response: a model without an answer",
  problem: (p: Problem): string => {
    const m = "model" in p ? `Model ${p.model + 1}: ` : "";
    switch (p.code) {
      case "noModels": return "Add a model.";
      case "badTarget": return `${m}the answer is not a fraction or percentage (3/8, 35%).`;
      case "badRef": return `${m}=… must name another model with an answer.`;
      case "notShadable": return `${m}the answer cannot be shaded with these parts.`;
      case "nameNoTarget": return `${m}give the answer (the shaded fraction).`;
      case "nameMismatch": return `${m}the answer is not the fraction that is shaded.`;
      case "partsRange": return `${m}the required number of parts is not possible.`;
      case "partsTarget": return `${m}the answer cannot be shaded with the required number of parts.`;
    }
  },
};

export type Texts = typeof en;

const nl: Texts = {
  type: { bar: "Strook", circle: "Cirkel", grid: "Rooster", set: "Verzameling" },
  models: "Breukmodellen",
  model: (type, label) => `${nl.type[type]}${label ? ` ${label}` : ""}`,
  part: (type, i, n, columns) =>
    type === "grid" ? `Rij ${Math.floor(i / columns) + 1}, kolom ${(i % columns) + 1}` : `${type === "set" ? "Voorwerp" : "Deel"} ${i + 1} van ${n}`,
  summary: (n, k) => `${n} gelijke ${n === 1 ? "deel" : "delen"}, ${k} gekleurd`,
  setSummary: (n, k) => `${n} voorwerpen, ${k} gekleurd`,
  given: "de kleuring is gegeven",
  shaded: (name) => `${name} gekleurd.`,
  unshaded: (name) => `${name} niet gekleurd.`,
  count: (model, n, k) => `${model}: ${k} van ${n} gekleurd.`,
  parts: "Aantal delen",
  fewer: "Minder delen",
  more: "Meer delen",
  divided: (model, n, kept) => `${model} verdeeld in ${n} gelijke delen${kept ? "" : "; de kleuring is gewist"}.`,
  clear: "Wissen",
  cleared: (model) => `${model} gewist.`,
  readout: (k, n, percent) => `${k}/${n} gekleurd · ${percent}%`,
  fractionOf: (model) => `Gekleurd deel van ${model}, als breuk`,
  percentOf: (model) => `Gekleurd deel van ${model}, in procenten`,
  numerator: "Teller",
  denominator: "Noemer",
  digitsOnly: "Alleen cijfers.",
  numberOnly: "Alleen een getal, met één decimale komma.",
  help: "Klik op een deel om het te kleuren, of sleep over de delen. Toetsenbord: met de pijltjestoetsen naar een deel, met spatie of Enter kleuren.",
  solution: "Het goede antwoord.",
  addModel: "Model toevoegen",
  removeModel: "Verwijderen",
  modelType: "Model",
  label: "Naam",
  task: "Opdracht",
  taskName: { shade: "De kandidaat kleurt", name: "De kandidaat schrijft de breuk" },
  entryName: { fraction: "als breuk", percent: "in procenten" },
  partsField: "Delen",
  rows: "Rijen",
  columns: "Kolommen",
  divide: "De kandidaat verdeelt",
  from: "van",
  to: "tot en met",
  scale: "Procentenschaal",
  target: "Antwoord",
  targetHint: "3/8, 35% of =1 (hetzelfde als model 1); leeg: niet gescoord",
  requireParts: "Precies zoveel delen (scoren door de PCI; 0: elk aantal)",
  simplest: "Zo eenvoudig mogelijk (scoren door de PCI)",
  shadingHint: (task) =>
    task === "name" ? "Klik op de delen die de kandidaat gekleurd ziet." : "Klik op delen om ze bij de start te kleuren (meestal geen).",
  correct: "Goed antwoord",
  noCorrect: "geen goed antwoord: een model zonder antwoord",
  problem: (p) => {
    const m = "model" in p ? `Model ${p.model + 1}: ` : "";
    switch (p.code) {
      case "noModels": return "Voeg een model toe.";
      case "badTarget": return `${m}het antwoord is geen breuk of percentage (3/8, 35%).`;
      case "badRef": return `${m}=… moet een ander model met een antwoord noemen.`;
      case "notShadable": return `${m}het antwoord kan niet gekleurd worden met deze delen.`;
      case "nameNoTarget": return `${m}geef het antwoord (de gekleurde breuk).`;
      case "nameMismatch": return `${m}het antwoord is niet de breuk die gekleurd is.`;
      case "partsRange": return `${m}het vereiste aantal delen kan niet.`;
      case "partsTarget": return `${m}het antwoord kan niet gekleurd worden met het vereiste aantal delen.`;
    }
  },
};

export const textsFor = (language: string | undefined): Texts => (String(language ?? "").toLowerCase().startsWith("nl") ? nl : en);
