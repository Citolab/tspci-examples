/** The PCI's own texts (the `language` setting); the title and question come from the item. */
const HALVES_EN = ["", "", "top-left half", "top-right half", "bottom-right half", "bottom-left half"];
const HALVES_NL = ["", "", "halve linksboven", "halve rechtsboven", "halve rechtsonder", "halve linksonder"];

export const TEXTS = {
  en: {
    grid: (columns: number, rows: number) => `Squared paper, ${columns} by ${rows} squares`,
    shapeGrid: (name: string) => `Shape ${name}`,
    cell: (row: number, column: number, value: number) =>
      `Row ${row}, column ${column}: ${value === 0 ? "empty" : value === 1 ? "coloured" : `half coloured, ${HALVES_EN[value]}`}`,
    hint: "Click or drag over the squares to colour them; click a coloured square to remove it. Keyboard: arrow keys and Space.",
    hintHalves:
      "Click or drag over the squares to colour them. Click a coloured square again for a half square, again to turn it, and once more to remove it. Keyboard: arrow keys and Space.",
    clear: "Clear",
    area: "Area",
    perimeter: "Perimeter",
    squares: "squares",
    notANumber: "Enter a number, such as 12 or 7.5",
    compareArea: "Which shape has the larger area?",
    comparePerimeter: "Which shape has the larger perimeter?",
    same: "Both the same",
    shapeName: (name: string) => `Shape ${name}`,
  },
  nl: {
    grid: (columns: number, rows: number) => `Ruitjespapier, ${columns} bij ${rows} hokjes`,
    shapeGrid: (name: string) => `Figuur ${name}`,
    cell: (row: number, column: number, value: number) =>
      `Rij ${row}, kolom ${column}: ${value === 0 ? "leeg" : value === 1 ? "gekleurd" : `half gekleurd, ${HALVES_NL[value]}`}`,
    hint: "Klik of sleep over de hokjes om ze te kleuren; klik op een gekleurd hokje om het weg te halen. Toetsenbord: pijltjestoetsen en spatie.",
    hintHalves:
      "Klik of sleep over de hokjes om ze te kleuren. Klik nog eens op een gekleurd hokje voor een half hokje, nog eens om het te draaien, en nog een keer om het weg te halen. Toetsenbord: pijltjestoetsen en spatie.",
    clear: "Wissen",
    area: "Oppervlakte",
    perimeter: "Omtrek",
    squares: "hokjes",
    notANumber: "Vul een getal in, zoals 12 of 7,5",
    compareArea: "Welke figuur heeft de grootste oppervlakte?",
    comparePerimeter: "Welke figuur heeft de grootste omtrek?",
    same: "Allebei even groot",
    shapeName: (name: string) => `Figuur ${name}`,
  },
};
export type Texts = (typeof TEXTS)["en"];
export const textsFor = (language?: string): Texts => TEXTS[language as keyof typeof TEXTS] ?? TEXTS.en;
