// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/brainstorm, © openPCI (Aarhus University and Aalborg
// University): Elias J.T. Hansen, Anna Rusmann & Jeppe Bundsgaard
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The texts of the PCI per language (data-language); the item's own texts (start, end, nickname, bot messages) are
// settings.

const en = {
  chat: "Brainstorm chat",
  messageLabel: "Your message",
  placeholder: "Type an idea and press Enter",
  send: "Send",
  start: "Start",
  timeLeft: "Time left",
  seconds: (s: number) => `${s} ${s === 1 ? "second" : "seconds"} left`,
  typing: (names: string[]) =>
    names.length === 1 ? `${names[0]} is typing…` : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} are typing…`,
  ended: "The brainstorm has ended.",
  empty: "No messages yet.",
};

const nl: typeof en = {
  chat: "Brainstormchat",
  messageLabel: "Je bericht",
  placeholder: "Typ een idee en druk op Enter",
  send: "Verstuur",
  start: "Start",
  timeLeft: "Resterende tijd",
  seconds: (s: number) => `nog ${s} ${s === 1 ? "seconde" : "seconden"}`,
  typing: (names: string[]) =>
    names.length === 1 ? `${names[0]} is aan het typen…` : `${names.slice(0, -1).join(", ")} en ${names[names.length - 1]} zijn aan het typen…`,
  ended: "De brainstorm is afgelopen.",
  empty: "Nog geen berichten.",
};

export type Texts = typeof en;
const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
