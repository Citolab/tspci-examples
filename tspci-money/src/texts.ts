/** The PCI's own texts (the `language` setting); the title and question come from the item. */
import { Counts, Currency, Kind, PieceDef, Problem, TaskModel, formatAmount, hasMinor, piecesOf } from "./money";

export type Language = "en" | "nl";
export const languageOf = (language?: string): Language => ((language ?? "").slice(0, 2) === "nl" ? "nl" : "en");

/** What the texts need to know of the money: the currency, and whether a value is a coin or a note. */
export type MoneyInfo = { currency: Currency; pieces: PieceDef[] };
export const kindOf = (value: number, pieces: PieceDef[]): Kind => pieces.find((p) => p.value === value)?.kind ?? (value <= 200 ? "coin" : "note");

/**
 * A value as it is said, by its value: "50 cents", "€2" or "25 cents", "$1", "20 pence", "£5" in English; "50 cent",
 * "€ 2", "20 pence" in Dutch; the author's currency "50 øre", "10 kr".
 */
export function valueName(cents: number, currency: Currency, language: string): string {
  if (cents >= 100 || !hasMinor(currency)) return formatAmount(cents, language, currency).replace(/[.,]00(?=\D*$)/, "");
  switch (currency.code) {
    case "eur":
    case "usd":
      return language === "nl" || cents === 1 ? `${cents} cent` : `${cents} cents`;
    case "gbp":
      return cents === 1 ? "1 penny" : `${cents} pence`;
    default:
      return [...currency.minor].length === 1 ? `${cents}${currency.minor}` : `${cents} ${currency.minor}`;
  }
}

function english({ currency, pieces }: MoneyInfo) {
  const name = (cents: number) => valueName(cents, currency, "en");
  const kind = (cents: number, count = 1) => (kindOf(cents, pieces) === "coin" ? (count === 1 ? "coin" : "coins") : count === 1 ? "note" : "notes");
  const example = formatAmount(735, "en", currency);
  return {
    pay: (amount: string) => `Pay exactly ${amount}.`,
    fewest: (amount: string) => `Pay exactly ${amount}, with as few coins and notes as possible.`,
    price: "Price",
    customerGives: "The customer pays with",
    change: "Give the change.",
    changeFewest: "Give the change, with as few coins and notes as possible.",
    count: "How much money is on the counter?",
    answer: "Amount",
    answerHint: hasMinor(currency) ? "e.g. 7.35" : "e.g. 7",
    notAnAmount: `Write an amount, such as ${hasMinor(currency) ? "7.35" : "7"}`,
    counter: "Counter",
    counterEmpty: "Drag coins and notes here, or use the buttons below.",
    total: "Total",
    drawer: "Coins and notes",
    piece: (cents: number) => `${kind(cents)} of ${name(cents)}`,
    pieces: (cents: number, count: number) => `${count} ${kind(cents, count)} of ${name(cents)}`,
    add: (piece: string) => `Add a ${piece}`,
    remove: (piece: string) => `Take a ${piece} off the counter`,
    onCounter: (count: number) => `${count} on the counter`,
    left: (count: number) => `${count} left`,
    none: "nothing",
    counterHolds: (list: string) => `On the counter: ${list}.`,
    problems: {
      noSign: "Give the sign of the currency (e.g. kr).",
      badValue: hasMinor(currency)
        ? "Every coin and note needs a value above 0."
        : `Every coin and note needs a value of whole ${currency.sign || "units"}: this currency has no minor unit.`,
      duplicate: "Two coins or notes have the same value.",
      noPieces: "Offer at least one coin or note to the pupil.",
      unknownPieces: "The money of the task has something that is not one of the coins and notes:",
      noAmount: `Set an amount (e.g. ${example}).`,
      noGiven: "Set what the customer pays with (e.g. 10).",
      givenTooLittle: "The customer pays with less than the price.",
      noCounter: "Set the money on the counter (e.g. 10; 2x 2; 0,50).",
      cannotPay: "This amount can not be made with these coins and notes.",
    } satisfies Record<Problem, string>,
  };
}
export type Texts = ReturnType<typeof english>;

function dutch({ currency, pieces }: MoneyInfo): Texts {
  const name = (cents: number) => valueName(cents, currency, "nl");
  const kind = (cents: number, count = 1) => (kindOf(cents, pieces) === "coin" ? (count === 1 ? "munt" : "munten") : count === 1 ? "biljet" : "biljetten");
  const example = formatAmount(735, "nl", currency);
  return {
    pay: (amount: string) => `Betaal precies ${amount}.`,
    fewest: (amount: string) => `Betaal precies ${amount}, met zo weinig mogelijk munten en biljetten.`,
    price: "Prijs",
    customerGives: "De klant betaalt met",
    change: "Geef het wisselgeld terug.",
    changeFewest: "Geef het wisselgeld terug, met zo weinig mogelijk munten en biljetten.",
    count: "Hoeveel geld ligt er op de toonbank?",
    answer: "Bedrag",
    answerHint: hasMinor(currency) ? "bijv. 7,35" : "bijv. 7",
    notAnAmount: `Schrijf een bedrag, zoals ${hasMinor(currency) ? "7,35" : "7"}`,
    counter: "Toonbank",
    counterEmpty: "Sleep munten en biljetten hierheen, of gebruik de knoppen hieronder.",
    total: "Totaal",
    drawer: "Munten en biljetten",
    piece: (cents: number) => `${kind(cents)} van ${name(cents)}`,
    pieces: (cents: number, count: number) => `${count} ${kind(cents, count)} van ${name(cents)}`,
    add: (piece: string) => `Een ${piece} erbij`,
    remove: (piece: string) => `Een ${piece} van de toonbank halen`,
    onCounter: (count: number) => `${count} op de toonbank`,
    left: (count: number) => `nog ${count}`,
    none: "niets",
    counterHolds: (list: string) => `Op de toonbank: ${list}.`,
    problems: {
      noSign: "Geef het teken van de munteenheid op (bijv. kr).",
      badValue: hasMinor(currency)
        ? "Elke munt en elk biljet heeft een waarde boven 0 nodig."
        : `Elke munt en elk biljet heeft een waarde in hele ${currency.sign || "eenheden"} nodig: deze munteenheid heeft geen kleinere eenheid.`,
      duplicate: "Twee munten of biljetten hebben dezelfde waarde.",
      noPieces: "Bied de leerling minstens één munt of biljet aan.",
      unknownPieces: "In het geld van de opdracht staat iets dat geen van de munten en biljetten is:",
      noAmount: `Geef een bedrag op (bijv. ${example}).`,
      noGiven: "Geef op waarmee de klant betaalt (bijv. 10).",
      givenTooLittle: "De klant betaalt met minder dan de prijs.",
      noCounter: "Geef het geld op de toonbank op (bijv. 10; 2x 2; 0,50).",
      cannotPay: "Dit bedrag kan niet met deze munten en biljetten.",
    },
  };
}

/** The texts in the language, for this currency and these coins and notes. */
export const textsFor = (language: string | undefined, money: MoneyInfo): Texts => (languageOf(language) === "nl" ? dutch(money) : english(money));

/** A problem with the settings as the author reads it: with what is not a coin or note, where that is the problem. */
export function problemText(problem: Problem, t: Texts, model?: Pick<TaskModel, "invalid">): string {
  const text = t.problems[problem];
  return problem === "unknownPieces" && model?.invalid.length ? `${text} ${model.invalid.join("; ")}.` : text;
}

/** What is on the counter, for a screen reader: "2 notes of €10, 1 coin of €2". */
export function describe(counts: Counts, t: Texts) {
  const groups = new Map<number, number>();
  for (const value of piecesOf(counts)) groups.set(value, (groups.get(value) ?? 0) + 1);
  return groups.size ? [...groups.entries()].map(([value, count]) => t.pieces(value, count)).join(", ") : t.none;
}
