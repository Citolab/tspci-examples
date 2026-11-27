/**
 * A time as the text of a response, "HH:MM", and back.
 *
 * No DOM and no imports: `npm test` runs this file in node as it is (test/timeText.test.ts).
 */
const HALF_DAY = 720; // minutes on a 12-hour clock

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The response for a time: "HH:MM", readable for an author. On a 12-hour clock (the analog clock, a digital clock
 * without the 24-hour setting) the hours run from 01 to 12, so 7:35 and 19:35 are both "07:35" and ten past twelve is
 * "12:10". On a 24-hour digital clock they run from 00 to 23: "19:35", "00:10". `time` is in minutes (since 00:00, or
 * since 12:00 for a 12-hour time).
 */
export function clockString(time: number, twentyFourHour = false): string {
  const day = twentyFourHour ? 2 * HALF_DAY : HALF_DAY;
  const total = ((Math.round(time) % day) + day) % day;
  const hour = Math.floor(total / 60);
  return `${pad(twentyFourHour ? hour : hour || 12)}:${pad(total % 60)}`;
}

/**
 * The time in a response or correct response "HH:MM" (also "7:35"), as minutes since 00:00 (0-1439); null when it is
 * not one. "12:10" is 730: on a 12-hour clock that is ten past twelve, as clockString writes it.
 */
export function parseClockString(value: string): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(value);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  return hour > 23 || minute > 59 ? null : hour * 60 + minute;
}
