// npm test: a time as the text of a response and back (src/timeText.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clockString, parseClockString } from "../src/timeText.ts";

test("the response: a time as HH:MM", () => {
  // a 12-hour clock: 01 to 12, morning and afternoon the same
  assert.equal(clockString(7 * 60 + 35), "07:35");
  assert.equal(clockString(19 * 60 + 35), "07:35");
  assert.equal(clockString(10), "12:10");
  assert.equal(clockString(12 * 60 + 10), "12:10");
  assert.equal(clockString(0), "12:00");
  // a 24-hour clock: 00 to 23
  assert.equal(clockString(19 * 60 + 35, true), "19:35");
  assert.equal(clockString(10, true), "00:10");
  assert.equal(clockString(24 * 60 + 5, true), "00:05");
});

test("reading a response back", () => {
  assert.equal(parseClockString("07:35"), 7 * 60 + 35);
  assert.equal(parseClockString("7:35"), 7 * 60 + 35);
  assert.equal(parseClockString(" 19:35 "), 19 * 60 + 35);
  assert.equal(parseClockString("12:10"), 12 * 60 + 10);
  for (const wrong of ["", "455", "24:00", "7:60", "seven", "7:5"]) assert.equal(parseClockString(wrong), null, wrong);
  // every response reads back as itself
  for (let t = 0; t < 1440; t += 7) {
    assert.equal(clockString(parseClockString(clockString(t, true))!, true), clockString(t, true));
    assert.equal(clockString(parseClockString(clockString(t))!), clockString(t));
  }
});

