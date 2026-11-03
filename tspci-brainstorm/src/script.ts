// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/brainstorm, © openPCI (Aarhus University and Aalborg
// University): Elias J.T. Hansen, Anna Rusmann & Jeppe Bundsgaard
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The bot script (data-messages) and the response, in the formats of the original openPCI brainstorm.

/** One scripted message: shown `delay` seconds after the start (the clock stops while the candidate types). */
export type BotLine = { index: number; delay: number; name: string; color: string; text: string };

/** One message in the chat; the response holds time, name and text. */
export type Entry = { time: string; name: string; text: string; player: boolean; color?: string };

/**
 * One bot message per line, `seconds;name;colour;message`, as in the original: `10;Anne;darkred;Lots of axes`.
 * Lines that do not fit are skipped; unlike the original, a message may itself contain a semicolon.
 */
export const parseScript = (messages: string): BotLine[] =>
  (messages ?? "")
    .split(/\r?\n/)
    .map((line, index) => {
      const parts = line.split(";");
      if (parts.length < 4) return null;
      const delay = parseInt(parts[0], 10);
      const text = parts.slice(3).join(";").trim();
      if (isNaN(delay) || !text) return null;
      return { index, delay: Math.max(0, delay), name: parts[1].trim(), color: parts[2].trim(), text };
    })
    .filter(Boolean)
    .sort((a, b) => a.delay - b.delay);

/** Seconds as mm:ss, the time stamp of the original. */
export const timestamp = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds - m * 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

/** `;` and `|` separate the parts of the response: keep them out of a name or a message. */
const clean = (text: string) => text.replace(/\|/g, "/").replace(/;/g, ",").replace(/\s+/g, " ").trim();

/** The response of the original: every message as `|mm:ss;name;message`, one after the other. */
export const serializeLog = (log: Entry[]) => log.map((e) => `|${[e.time, clean(e.name), clean(e.text)].join(";")}`).join("");

/** A response back into messages; the candidate's are the ones with the candidate's nickname. */
export const parseLog = (response: string, nickname: string, script: BotLine[]): Entry[] =>
  (response ?? "")
    .split("|")
    .filter((m) => m.trim() !== "")
    .map((m) => {
      const [time = "", name = "", ...rest] = m.split(";");
      const player = name === nickname;
      const color = player ? undefined : script.find((b) => b.name === name)?.color;
      return { time, name, text: rest.join(";"), player, color };
    });
