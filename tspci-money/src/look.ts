// How a coin or note looks, without a screen: its size (the real proportions for the presets, a size by its value for
// the author's own), the colours of the metals and of a colour the author picks, and text that stays readable on any of
// them (WCAG AA: 4.5:1). No imports but types: `npm test` runs it in node as it is.
import type { CurrencyCode, PieceDef } from "./money";

// ---- sizes ----

/** Diameter in millimetres of the real coins, for their proportions. */
const COIN_MM: Partial<Record<CurrencyCode, Record<number, number>>> = {
  eur: { 1: 16.25, 2: 18.75, 5: 21.25, 10: 19.75, 20: 22.25, 50: 24.25, 100: 23.25, 200: 25.75 },
  usd: { 1: 19.05, 5: 21.21, 10: 17.91, 25: 24.26, 50: 30.61, 100: 26.49 },
  gbp: { 1: 20.3, 2: 25.9, 5: 18.0, 10: 24.5, 20: 21.4, 50: 27.3, 100: 23.43, 200: 28.4 },
};
/** Width × height in millimetres of the real notes, for their proportions. */
const NOTE_MM: Partial<Record<CurrencyCode, Record<number, [number, number]>>> = {
  eur: { 500: [120, 62], 1000: [127, 67], 2000: [133, 72], 5000: [140, 77], 10000: [147, 77], 20000: [153, 77] },
  usd: { 100: [156, 66], 200: [156, 66], 500: [156, 66], 1000: [156, 66], 2000: [156, 66], 5000: [156, 66], 10000: [156, 66] },
  gbp: { 500: [125, 65], 1000: [132, 69], 2000: [139, 73], 5000: [146, 77] },
};
/** Pixels per millimetre: coins drawn larger than life, notes smaller, so both fit on a screen. */
const COIN_PX = 2.5;
const NOTE_PX = 0.95;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * The size a coin or note is drawn at (scale 1), in pixels. A coin or note of a preset currency has the proportions of
 * the real one (a 10 cent coin is smaller than a 5 cent one, as in your purse); any other gets a size by its value: a
 * larger value, a somewhat larger coin or note.
 */
export function pieceSize(def: Pick<PieceDef, "value" | "kind">, code: CurrencyCode): { width: number; height: number } {
  const { value, kind } = def;
  if (kind === "coin") {
    const mm = COIN_MM[code]?.[value] ?? clamp(16 + 3.2 * Math.log10(value), 15, 30);
    const d = Math.round(mm * COIN_PX);
    return { width: d, height: d };
  }
  const real = NOTE_MM[code]?.[value];
  const w = real?.[0] ?? clamp(120 + 9 * Math.log10(value / 100), 112, 165);
  const h = real?.[1] ?? w * 0.52;
  return { width: Math.round(w * NOTE_PX), height: Math.round(h * NOTE_PX) };
}

// ---- colours ----

/** "#rgb" or "#rrggbb" as [r, g, b], 0 to 255. Anything else: grey. */
export function rgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (/^[0-9a-f]{3}$/i.test(h)) h = [...h].map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return [128, 128, 128];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
const hex = ([r, g, b]: number[]) => "#" + [r, g, b].map((c) => Math.round(clamp(c, 0, 255)).toString(16).padStart(2, "0")).join("");

/** The relative luminance of a colour (WCAG 2). */
export function luminance(color: string): number {
  const [r, g, b] = rgb(color).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** The contrast ratio of two colours (WCAG 2): 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** A colour mixed with black (amount 0 to 1). */
export const darken = (color: string, amount: number) => hex(rgb(color).map((c) => c * (1 - amount)));
/** A colour mixed with white (amount 0 to 1). */
export const lighten = (color: string, amount: number) => hex(rgb(color).map((c) => c + (255 - c) * amount));
/** `top` at `alpha` over `bottom`. */
export const blend = (top: string, bottom: string, alpha: number) => {
  const t = rgb(top);
  const b = rgb(bottom);
  return hex(t.map((c, i) => c * alpha + b[i] * (1 - alpha)));
};

export const INK_DARK = "#14181d";
export const INK_LIGHT = "#ffffff";
/**
 * Text on a background: dark or white, whichever contrasts most, and black where neither reaches 4.5:1 (a mid blue such
 * as #0080c0). Black or white always does: at least 4.58:1.
 */
export function inkOn(background: string): string {
  const ink = contrast(INK_DARK, background) >= contrast(INK_LIGHT, background) ? INK_DARK : INK_LIGHT;
  return contrast(ink, background) >= 4.5 ? ink : "#000000";
}

/** A dark shade of `color` that is readable on `background` (at least `min`:1), or the dark ink when none is. */
export function readableShade(color: string, background: string, min = 4.5): string {
  for (let amount = 0.45; amount <= 0.95; amount += 0.05) {
    const shade = darken(color, amount);
    if (contrast(shade, background) >= min) return shade;
  }
  return INK_DARK;
}

/** The colours of a coin, a metal or one plain colour: the face, its rim, a shine, and the text on it. */
export type CoinColors = { fill: string; rim: string; shine: string; ink: string };
const METAL_COLORS: Record<string, CoinColors> = {
  copper: { fill: "#c8804e", rim: "#8d4f26", shine: "#e2a77c", ink: "#2d1405" },
  gold: { fill: "#e3bf55", rim: "#a5822b", shine: "#f3dc94", ink: "#2e2203" },
  silver: { fill: "#d5dade", rim: "#8f979e", shine: "#eef1f3", ink: "#1d2328" },
};
/** The swatch an author sees for each metal: the face (a two-metal coin: ring and centre). */
export const METAL_SWATCH: Record<string, [string, string]> = {
  copper: [METAL_COLORS.copper.fill, METAL_COLORS.copper.fill],
  gold: [METAL_COLORS.gold.fill, METAL_COLORS.gold.fill],
  silver: [METAL_COLORS.silver.fill, METAL_COLORS.silver.fill],
  silverInGold: [METAL_COLORS.gold.fill, METAL_COLORS.silver.fill],
  goldInSilver: [METAL_COLORS.silver.fill, METAL_COLORS.gold.fill],
};

/** A coin of one colour the author picked: a darker rim, a lighter shine, and dark or white text. */
export const plainCoin = (color: string): CoinColors => ({ fill: color, rim: darken(color, 0.35), shine: lighten(color, 0.4), ink: inkOn(color) });

/** The ring and the centre of a coin: the same for one metal or colour, two for silverInGold and goldInSilver. */
export function coinColors(color: string): { ring: CoinColors; centre: CoinColors; twoMetals: boolean } {
  if (color === "silverInGold") return { ring: METAL_COLORS.gold, centre: METAL_COLORS.silver, twoMetals: true };
  if (color === "goldInSilver") return { ring: METAL_COLORS.silver, centre: METAL_COLORS.gold, twoMetals: true };
  const one = METAL_COLORS[color] ?? plainCoin(color);
  return { ring: one, centre: one, twoMetals: false };
}

/**
 * The colours of a note: its colour, a darker frame, the white panel with the value (in a dark shade of the colour, at
 * least 4.5:1 on the panel) and the text on the colour itself (dark or white).
 */
export function noteColors(color: string) {
  const panel = blend("#ffffff", color, 0.92);
  return { fill: color, frame: darken(color, 0.35), panel, value: readableShade(color, panel), ink: inkOn(color) };
}
