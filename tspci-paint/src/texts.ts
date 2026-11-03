// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/paint, © Jeppe Bundsgaard, openPCI (Aarhus University and Aalborg University)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The texts of the PCI per language (data-language); the instruction is a setting.

const en = {
  toolbar: "Drawing tools",
  colors: "Colour",
  sizes: "Brush size",
  size: (px: number) => `${px} px`,
  eraser: "Eraser",
  undo: "Undo",
  redo: "Redo",
  clear: "Clear",
  canvas: "Drawing canvas",
  empty: "empty",
  strokes: (n: number) => `${n} ${n === 1 ? "stroke" : "strokes"}`,
  keyboardHelp:
    "Draw with the mouse, a pen or a finger. With the keyboard: the arrow keys move the pen (Shift: in small steps), " +
    "Space puts the pen down or lifts it, Escape lifts it. Ctrl+Z undoes, Ctrl+Y redoes.",
  penDown: (x: number, y: number) => `Pen down at ${x}, ${y}`,
  penUp: "Pen lifted",
  erasing: "erasing",
  cleared: "Canvas cleared",
  colorNames: {
    black: "black", darkGrey: "dark grey", grey: "grey", lightGrey: "light grey", white: "white",
    red: "red", orange: "orange", yellow: "yellow", green: "green", teal: "teal", blue: "blue",
    purple: "purple", pink: "pink", brown: "brown",
  },
};

const nl: typeof en = {
  toolbar: "Tekengereedschap",
  colors: "Kleur",
  sizes: "Penseeldikte",
  size: (px: number) => `${px} px`,
  eraser: "Gum",
  undo: "Ongedaan maken",
  redo: "Opnieuw",
  clear: "Wissen",
  canvas: "Tekenvlak",
  empty: "leeg",
  strokes: (n: number) => `${n} ${n === 1 ? "lijn" : "lijnen"}`,
  keyboardHelp:
    "Teken met de muis, een pen of een vinger. Met het toetsenbord: de pijltjestoetsen bewegen de pen (Shift: in kleine stapjes), " +
    "Spatie zet de pen neer of tilt hem op, Escape tilt hem op. Ctrl+Z maakt ongedaan, Ctrl+Y doet opnieuw.",
  penDown: (x: number, y: number) => `Pen neergezet op ${x}, ${y}`,
  penUp: "Pen opgetild",
  erasing: "gummen",
  cleared: "Tekenvlak gewist",
  colorNames: {
    black: "zwart", darkGrey: "donkergrijs", grey: "grijs", lightGrey: "lichtgrijs", white: "wit",
    red: "rood", orange: "oranje", yellow: "geel", green: "groen", teal: "blauwgroen", blue: "blauw",
    purple: "paars", pink: "roze", brown: "bruin",
  },
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
