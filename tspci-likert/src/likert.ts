// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/oat-sa/extension-tao-itemqti-pci/tree/develop/views/js/pciCreator/ims/likertScoreInteraction,
// © 2016-2024 Open Assessment Technologies SA
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The settings as the PCI uses them. They arrive as text ("5", "true"), from TAO also as booleans.

export type Settings = { levels: number; labelMin: string; labelMax: string; icons: boolean; numbers: boolean; style: Style };

/** How a level looks; underneath every style is the same radio button. */
export const STYLES = ["radio", "stars", "smileys", "buttons"] as const;
export type Style = (typeof STYLES)[number];
export const parseStyle = (value: unknown): Style => {
  const v = String(value ?? "").toLowerCase();
  return (STYLES as readonly string[]).includes(v) ? (v as Style) : "radio";
};

export const MIN_LEVELS = 2;
export const MAX_LEVELS = 10;

/** The number of levels: 2 to 10 (the original's choice of scale sizes), 5 when it is not a number. */
export const parseLevels = (value: unknown): number => {
  const n = parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return 5;
  return Math.min(MAX_LEVELS, Math.max(MIN_LEVELS, n));
};

export const parseBoolean = (value: unknown): boolean => value === true || String(value).toLowerCase() === "true";

export const parseSettings = (p: Record<string, unknown>): Settings => ({
  levels: parseLevels(p.level),
  labelMin: String(p.labelMin ?? ""),
  labelMax: String(p.labelMax ?? ""),
  icons: parseBoolean(p.icons),
  numbers: parseBoolean(p.numbers),
  style: parseStyle(p.style),
});

/** A level in a response or a saved state ("3" or 3); null when it is no level of this scale (0 = no answer). */
export const parseLevel = (value: unknown, levels: number): number | null => {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isInteger(n) && n >= 1 && n <= levels ? n : null;
};
