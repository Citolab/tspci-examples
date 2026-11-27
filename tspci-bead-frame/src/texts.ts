// The PCI's own texts (the `language` setting): the question it asks when the author gives none, the buttons and what
// a screen reader hears. No imports: `npm test` runs it in node as it is.

type Model = "rekenrek" | "hundred";
type Task = "set" | "show" | "addition";

const plural = (n: number, one: string, more: string) => `${n} ${n === 1 ? one : more}`;

export const TEXTS = {
  en: {
    frame: (model: Model): string => (model === "rekenrek" ? "Bead frame" : "Hundred field"),
    question: (model: Model, task: Task, n: string, add: string) => {
      if (task === "show") return ""; // it stands in for an image: the item asks the question
      if (task === "addition")
        return model === "rekenrek"
          ? `Show ${n} + ${add} on the bead frame: first ${n}, then ${add} more with the other colour.`
          : `Show ${n} + ${add} in the hundred field: first ${n} in the first colour, then ${add} in the other colour.`;
      return model === "rekenrek" ? `Show ${n} on the bead frame.` : `Colour ${n} squares in the hundred field.`;
    },
    /** The pens of a sum. */
    pens: "Colour",
    pen: (part: 1 | 2, n: string) => (part === 1 ? `first number${n ? ` (${n})` : ""}` : `second number${n ? ` (${n})` : ""}`),
    reset: (model: Model) => (model === "rekenrek" ? "Push all beads back" : "Clear the field"),
    total: "Total",
    red: "red",
    white: "white",
    /** A row of the rekenrek as a slider: its name, and what it says (aria-valuetext). */
    row: (row: number) => `Row ${row}`,
    rowValue: (pushed: number, red: number, white: number, second: number, total: number, sum: boolean) => {
      const colours = pushed === 0 ? "" : ` (${[red && `${red} red`, white && `${white} white`].filter(Boolean).join(", ")})`;
      const parts = sum && second > 0 ? `, ${second} of them with the second colour` : "";
      return `${plural(pushed, "bead", "beads")} pushed${colours}${parts}. Total ${total}.`;
    },
    sliderHint: "Left arrow: push a bead to the left. Right arrow: push one back.",
    /** A square of the hundred field (a checkbox). */
    square: (row: number, column: number) => `Row ${row}, square ${column}`,
    squareState: (fill: 0 | 1 | 2, sum: boolean) => (fill === 0 ? "" : sum ? (fill === 1 ? "first colour" : "second colour") : "coloured"),
    field: (rows: number) => `Hundred field, ${rows} rows of 10. Arrow keys: move; space: colour or uncolour a square.`,
    status: (model: Model, value: number, first: number, second: number, sum: boolean) =>
      `${plural(value, model === "rekenrek" ? "bead" : "square", model === "rekenrek" ? "beads" : "squares")} ${model === "rekenrek" ? "pushed" : "coloured"}${
        sum && value > 0 ? `: ${first} first colour, ${second} second colour` : ""
      }.`,
    /** A frame that only shows a number, as an image: what it shows, row by row. */
    shows: (model: Model, rows: number[]) => {
      const filled = rows.map((count, r) => [count, r] as const).filter(([count]) => count > 0);
      const what = model === "rekenrek" ? "beads pushed to the left" : "squares coloured";
      if (filled.length === 0) return `${model === "rekenrek" ? "Bead frame" : "Hundred field"}, no ${what}.`;
      return `${model === "rekenrek" ? "Bead frame" : "Hundred field"} with ${what}: ${filled.map(([count, r]) => `row ${r + 1}: ${count}`).join(", ")}.`;
    },
  },
  nl: {
    frame: (model: Model) => (model === "rekenrek" ? "Rekenrek" : "Honderdveld"),
    question: (model: Model, task: Task, n: string, add: string) => {
      if (task === "show") return "";
      if (task === "addition")
        return model === "rekenrek"
          ? `Laat ${n} + ${add} zien op het rekenrek: eerst ${n}, dan nog ${add} met de andere kleur.`
          : `Laat ${n} + ${add} zien in het honderdveld: eerst ${n} in de eerste kleur, dan ${add} in de andere kleur.`;
      return model === "rekenrek" ? `Laat ${n} zien op het rekenrek.` : `Kleur ${n} hokjes in het honderdveld.`;
    },
    pens: "Kleur",
    pen: (part: 1 | 2, n: string) => (part === 1 ? `eerste getal${n ? ` (${n})` : ""}` : `tweede getal${n ? ` (${n})` : ""}`),
    reset: (model: Model) => (model === "rekenrek" ? "Alle kralen terugschuiven" : "Veld leegmaken"),
    total: "Totaal",
    red: "rood",
    white: "wit",
    row: (row: number) => `Rij ${row}`,
    rowValue: (pushed: number, red: number, white: number, second: number, total: number, sum: boolean) => {
      const colours = pushed === 0 ? "" : ` (${[red && `${red} rood`, white && `${white} wit`].filter(Boolean).join(", ")})`;
      const parts = sum && second > 0 ? `, waarvan ${second} met de tweede kleur` : "";
      return `${plural(pushed, "kraal", "kralen")} geschoven${colours}${parts}. Totaal ${total}.`;
    },
    sliderHint: "Pijl naar links: een kraal naar links schuiven. Pijl naar rechts: een kraal terugschuiven.",
    square: (row: number, column: number) => `Rij ${row}, hokje ${column}`,
    squareState: (fill: 0 | 1 | 2, sum: boolean) => (fill === 0 ? "" : sum ? (fill === 1 ? "eerste kleur" : "tweede kleur") : "gekleurd"),
    field: (rows: number) => `Honderdveld, ${rows} rijen van 10. Pijltjestoetsen: verplaatsen; spatie: een hokje kleuren of leegmaken.`,
    status: (model: Model, value: number, first: number, second: number, sum: boolean) =>
      `${plural(value, model === "rekenrek" ? "kraal" : "hokje", model === "rekenrek" ? "kralen" : "hokjes")} ${model === "rekenrek" ? "geschoven" : "gekleurd"}${
        sum && value > 0 ? `: ${first} eerste kleur, ${second} tweede kleur` : ""
      }.`,
    shows: (model: Model, rows: number[]) => {
      const filled = rows.map((count, r) => [count, r] as const).filter(([count]) => count > 0);
      const what = model === "rekenrek" ? "kralen naar links geschoven" : "hokjes gekleurd";
      if (filled.length === 0) return `${model === "rekenrek" ? "Rekenrek" : "Honderdveld"}, geen ${what}.`;
      return `${model === "rekenrek" ? "Rekenrek" : "Honderdveld"} met ${what}: ${filled.map(([count, r]) => `rij ${r + 1}: ${count}`).join(", ")}.`;
    },
  },
};
export type Texts = (typeof TEXTS)["en"];
export const textsFor = (language?: string): Texts => (TEXTS[language as keyof typeof TEXTS] ?? TEXTS.en) as Texts;

/**
 * The question above the frame: the author's, in which {number}, {add} and {sum} are the settings, or else the PCI's
 * own for the task, so the candidate always sees the number asked. A frame that only shows a number asks nothing of its
 * own: the item asks the question.
 */
export function questionText(question: string, t: Texts, model: Model, task: Task, number: number | null, add: number | null): string {
  const n = number === null ? "?" : String(number);
  const a = add === null ? "?" : String(add);
  const sum = number === null || add === null ? "?" : String(number + add);
  const text = question?.trim() ? question : t.question(model, task, n, a);
  return text.replace(/\{number\}/g, n).replace(/\{add\}/g, a).replace(/\{sum\}/g, sum);
}
