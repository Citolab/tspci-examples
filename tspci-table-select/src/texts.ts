// The texts of the PCI per language (data-language, or the authoring system's language); the item's own texts are
// settings or in the table.

const en = {
  empty: "empty",
  table: "Table",
  /** A row as a screen reader reads its radio button: "Train: A; Departs: 08:12". */
  row: (parts: string[]) => parts.join("; "),
  /** A cell: "09:47 (Arrives, A)". */
  cell: (text: string, where: string[]) => `${text} (${where.join(", ")})`,
  // authoring mode
  rowHeaders: "First column holds row headers",
  rowHeadersHint: "In cell mode the candidate cannot select them.",
  addRow: "Add row",
  addColumn: "Add column",
  removeRow: (n: number) => `Remove row ${n}`,
  removeColumn: (n: number) => `Remove column ${n}`,
  moveUp: (n: number) => `Move row ${n} up`,
  moveDown: (n: number) => `Move row ${n} down`,
  header: (n: number) => `Header of column ${n}`,
  cellInput: (row: number, column: number) => `Row ${row}, column ${column}`,
  example: "Example table",
  hint:
    "Type in the cells, or paste cells copied from a spreadsheet: the table grows to fit. " +
    "The correct response refers to a row or cell, not to its text: after removing it, set the correct response again.",
  summary: (rows: number, columns: number) => `${rows} ${rows === 1 ? "row" : "rows"}, ${columns} ${columns === 1 ? "column" : "columns"}`,
  nothingToChoose: "There is nothing to select: in cell mode, add a column next to the row headers.",
};

const nl: typeof en = {
  empty: "leeg",
  table: "Tabel",
  row: (parts: string[]) => parts.join("; "),
  cell: (text: string, where: string[]) => `${text} (${where.join(", ")})`,
  rowHeaders: "Eerste kolom bevat rijkoppen",
  rowHeadersHint: "In celmodus kan de kandidaat ze niet selecteren.",
  addRow: "Rij toevoegen",
  addColumn: "Kolom toevoegen",
  removeRow: (n: number) => `Rij ${n} verwijderen`,
  removeColumn: (n: number) => `Kolom ${n} verwijderen`,
  moveUp: (n: number) => `Rij ${n} omhoog`,
  moveDown: (n: number) => `Rij ${n} omlaag`,
  header: (n: number) => `Kop van kolom ${n}`,
  cellInput: (row: number, column: number) => `Rij ${row}, kolom ${column}`,
  example: "Voorbeeldtabel",
  hint:
    "Typ in de cellen, of plak cellen uit een spreadsheet: de tabel groeit mee. " +
    "Het goede antwoord verwijst naar een rij of cel, niet naar de tekst: stel het opnieuw in nadat je die verwijdert.",
  summary: (rows: number, columns: number) => `${rows} ${rows === 1 ? "rij" : "rijen"}, ${columns} ${columns === 1 ? "kolom" : "kolommen"}`,
  nothingToChoose: "Er valt niets te selecteren: voeg in celmodus een kolom naast de rijkoppen toe.",
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
