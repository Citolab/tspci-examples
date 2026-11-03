// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/oat-sa/extension-tao-itemqti-pci/tree/develop/views/js/pciCreator/ims/likertScoreInteraction,
// © 2016-2024 Open Assessment Technologies SA
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The texts of the PCI per language (data-language); the item's own texts (question, end labels) are settings.

const en = {
  scale: "Scale",
  /** What a screen reader hears for a choice: "3 of 5". */
  choice: (level: number, levels: number) => `${level} of ${levels}`,
  /** The end labels, read after the first and the last choice. */
  low: (label: string) => `lowest: ${label}`,
  high: (label: string) => `highest: ${label}`,
  thumbDown: "thumb down",
  thumbUp: "thumb up",
};

const nl: typeof en = {
  scale: "Schaal",
  choice: (level: number, levels: number) => `${level} van ${levels}`,
  low: (label: string) => `laagste: ${label}`,
  high: (label: string) => `hoogste: ${label}`,
  thumbDown: "duim omlaag",
  thumbUp: "duim omhoog",
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
