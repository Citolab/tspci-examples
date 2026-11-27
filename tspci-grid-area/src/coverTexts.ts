/** The texts of the floor covering task (the `language` setting); numbers and amounts as the language writes them. */
import { decimal, eurosText, metresText } from "./cover.ts";

const en = {
  plan: "Floor plan",
  material: { carpet: "Carpet", vinyl: "Vinyl" },
  scale: (scale: number) => `1 square = ${decimal(scale, "en")} m`,
  roll: (material: string, width: number) => `${material} comes on a roll ${metresText(width, "en")} wide and is sold per running metre.`,
  door: (width: number) => `door ${metresText(width, "en")}`,
  /** the plan for a screen reader */
  description: (columns: number, rows: number, scale: number, left: number, top: number, wallList: string) =>
    `Floor plan on squared paper of ${columns} by ${rows} squares, 1 square = ${decimal(scale, "en")} m. The room's top-left corner is ${metresText(left, "en")} from the left and ${metresText(top, "en")} from the top of the paper. Its walls, clockwise from the top left: ${wallList}.`,
  wallWithDoor: (wall: string, door: number) => `${wall} with the door (${metresText(door, "en")})`,
  area: {
    heading: "The floor area",
    label: "Floor area",
    invalid: "Enter an area, such as 26 or 17.25",
  },
  strips: {
    heading: "Lay the strips",
    add: "Add a strip",
    none: "No strips yet.",
    name: (n: number) => `Strip ${n}`,
    way: (vertical: boolean): string => (vertical ? "top to bottom" : "left to right"),
    summary: (n: number, vertical: boolean, length: number) => `Strip ${n}: ${vertical ? "top to bottom" : "left to right"}, ${metresText(length, "en")}`,
    describe: (n: number, vertical: boolean, length: number, width: number, left: number, top: number) =>
      `Strip ${n}: ${vertical ? "top to bottom" : "left to right"}, ${metresText(length, "en")} long and ${metresText(width, "en")} wide, ${metresText(left, "en")} from the left and ${metresText(top, "en")} from the top of the paper`,
    length: "Length",
    shorter: (n: number) => `Strip ${n} shorter`,
    longer: (n: number) => `Strip ${n} longer`,
    turn: "Turn",
    turnLabel: (n: number) => `Turn strip ${n}`,
    remove: "Remove",
    removeLabel: (n: number) => `Remove strip ${n}`,
    removed: (n: number) => `Strip ${n} removed.`,
    cannotTurn: "This strip does not fit on the paper the other way round.",
    hint: "Drag a strip to move it; drag its round handle to make it longer or shorter. Keyboard: choose a strip, then the arrow keys move it, + and − change its length, R turns it and Delete removes it.",
    given: "The strips are laid already.",
  },
  bill: {
    heading: "The bill",
    caption: "The bill: fill in the metres, the amounts and the total",
    item: "Item",
    quantity: "Quantity",
    price: "Price",
    amount: "Amount",
    covering: (material: string) => material,
    skirting: "Skirting",
    threshold: "Threshold strip",
    total: "Total",
    perMetre: (cents: number) => `${eurosText(cents, "en")} per m`,
    piece: "1 piece",
    metresLabel: (item: string) => `${item}: metres`,
    amountLabel: (item: string) => `${item}: amount in euros`,
    invalidMetres: "Enter a length, such as 8 or 21.2",
    invalidAmount: "Enter an amount, such as 319.60",
  },
};

export type CoverTexts = typeof en;

const nl: CoverTexts = {
  plan: "Plattegrond",
  material: { carpet: "Tapijt", vinyl: "Vinyl" },
  scale: (scale) => `1 hokje = ${decimal(scale, "nl")} m`,
  roll: (material, width) => `${material} zit op een rol van ${metresText(width, "nl")} breed en wordt per strekkende meter verkocht.`,
  door: (width) => `deur ${metresText(width, "nl")}`,
  description: (columns, rows, scale, left, top, wallList) =>
    `Plattegrond op ruitjespapier van ${columns} bij ${rows} hokjes, 1 hokje = ${decimal(scale, "nl")} m. De linkerbovenhoek van de kamer ligt ${metresText(left, "nl")} van links en ${metresText(top, "nl")} van boven op het papier. De muren, met de klok mee vanaf linksboven: ${wallList}.`,
  wallWithDoor: (wall, door) => `${wall} met de deur (${metresText(door, "nl")})`,
  area: {
    heading: "De oppervlakte van de vloer",
    label: "Oppervlakte vloer",
    invalid: "Vul een oppervlakte in, zoals 26 of 17,25",
  },
  strips: {
    heading: "Leg de banen",
    add: "Baan toevoegen",
    none: "Nog geen banen.",
    name: (n) => `Baan ${n}`,
    way: (vertical) => (vertical ? "van boven naar beneden" : "van links naar rechts"),
    summary: (n, vertical, length) => `Baan ${n}: ${vertical ? "van boven naar beneden" : "van links naar rechts"}, ${metresText(length, "nl")}`,
    describe: (n, vertical, length, width, left, top) =>
      `Baan ${n}: ${vertical ? "van boven naar beneden" : "van links naar rechts"}, ${metresText(length, "nl")} lang en ${metresText(width, "nl")} breed, ${metresText(left, "nl")} van links en ${metresText(top, "nl")} van boven op het papier`,
    length: "Lengte",
    shorter: (n) => `Baan ${n} korter`,
    longer: (n) => `Baan ${n} langer`,
    turn: "Draaien",
    turnLabel: (n) => `Baan ${n} draaien`,
    remove: "Weghalen",
    removeLabel: (n) => `Baan ${n} weghalen`,
    removed: (n) => `Baan ${n} is weggehaald.`,
    cannotTurn: "Deze baan past andersom niet op het papier.",
    hint: "Sleep een baan om haar te verplaatsen; sleep aan het ronde handvat om haar langer of korter te maken. Toetsenbord: kies een baan, dan verplaatsen de pijltjestoetsen haar, maken + en − haar langer of korter, draait R haar en haalt Delete haar weg.",
    given: "De banen liggen er al.",
  },
  bill: {
    heading: "De rekening",
    caption: "De rekening: vul de meters, de bedragen en het totaal in",
    item: "Artikel",
    quantity: "Aantal",
    price: "Prijs",
    amount: "Bedrag",
    covering: (material) => material,
    skirting: "Plinten",
    threshold: "Drempelstrip",
    total: "Totaal",
    perMetre: (cents) => `${eurosText(cents, "nl")} per m`,
    piece: "1 stuk",
    metresLabel: (item) => `${item}: meters`,
    amountLabel: (item) => `${item}: bedrag in euro`,
    invalidMetres: "Vul een lengte in, zoals 8 of 21,2",
    invalidAmount: "Vul een bedrag in, zoals 319,60",
  },
};

export const coverTextsFor = (language?: string): CoverTexts => (language === "nl" ? nl : en);
