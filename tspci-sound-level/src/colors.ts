// The colour of a sound level, the same in the picture and on the meter: quiet teal, then green, amber, orange and
// red from 100 dB (hearing damage). No imports.

export const LEVEL_BANDS: { below: number; color: string }[] = [
  { below: 50, color: "#0d9488" },
  { below: 70, color: "#65a30d" },
  { below: 85, color: "#d97706" },
  { below: 100, color: "#ea580c" },
  { below: Infinity, color: "#dc2626" },
];

export const levelColor = (level: number): string => (LEVEL_BANDS.find((band) => level < band.below) ?? LEVEL_BANDS[LEVEL_BANDS.length - 1]).color;

/** The meter's scale, in dB. */
export const METER_MIN = 0;
export const METER_MAX = 140;
