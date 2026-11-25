// npm test: reading and writing a time in words (src/timeText.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTime, parseTime } from "../src/timeText.ts";

const at = (hour: number, minute: number) => (hour % 12) * 60 + minute;

test("English times", () => {
  const cases: [string, number][] = [
    ["4:10", at(4, 10)],
    ["16:10", at(4, 10)],
    ["4.10 pm", at(4, 10)],
    ["04:05", at(4, 5)],
    ["six o'clock", at(6, 0)],
    ["Six o clock.", at(6, 0)],
    ["6", at(6, 0)],
    ["twelve", 0],
    ["Ten past four", at(4, 10)],
    ["10 past 4", at(4, 10)],
    ["It's a quarter past three", at(3, 15)],
    ["quarter to five", at(4, 45)],
    ["half past six", at(6, 30)],
    ["half six", at(6, 30)],
    ["twenty-five to 3", at(2, 35)],
    ["twenty five past twelve", at(0, 25)],
    ["seven minutes past four", at(4, 7)],
    ["five to one", at(12, 55)],
    ["ten after four", at(4, 10)],
    ["four ten", at(4, 10)],
    ["four oh five", at(4, 5)],
    ["six thirty", at(6, 30)],
    ["noon", 0],
    ["midnight", 0],
  ];
  for (const [text, expected] of cases) assert.equal(parseTime(text, "en"), expected, text);
});

test("Dutch times", () => {
  const cases: [string, number][] = [
    ["4:10", at(4, 10)],
    ["4u10", at(4, 10)],
    ["vier uur tien", at(4, 10)],
    ["zes uur", at(6, 0)],
    ["Zes", at(6, 0)],
    ["Half zeven", at(6, 30)],
    ["half 1", at(12, 30)],
    ["kwart over drie", at(3, 15)],
    ["kwart voor vier", at(3, 45)],
    ["tien over vier", at(4, 10)],
    ["10 voor 5", at(4, 50)],
    ["vijf voor half zeven", at(6, 25)],
    ["vijf over half zeven", at(6, 35)],
    ["Het is 's middags tien over één", at(1, 10)],
    ["tweeëntwintig over drie", at(3, 22)],
    ["vijf en twintig over drie", at(3, 25)],
    ["middernacht", 0],
  ];
  for (const [text, expected] of cases) assert.equal(parseTime(text, "nl"), expected, text);
});

test("what is not a time", () => {
  for (const text of ["", "  ", "hello", "30", "25:00", "4:60", "half to six", "ten past", "past four", "70 past 4", "4:10:30"]) {
    assert.equal(parseTime(text, "en"), null, text);
  }
  for (const text of ["", "hallo", "30", "kwart voor half zeven", "dertig over half zeven", "tien over"]) {
    assert.equal(parseTime(text, "nl"), null, text);
  }
});

test("each language reads its own half", () => {
  assert.equal(parseTime("half 7", "en"), at(7, 30));
  assert.equal(parseTime("half 7", "nl"), at(6, 30));
});

test("every time in words is read back as the same time", () => {
  for (const language of ["en", "nl"] as const) {
    for (let time = 0; time < 720; time++) {
      const text = formatTime(time, language);
      assert.equal(parseTime(text, language), time, `${language}: ${text}`);
    }
  }
});

test("times in words", () => {
  assert.equal(formatTime(at(4, 10), "en"), "ten past four");
  assert.equal(formatTime(at(4, 7), "en"), "seven minutes past four");
  assert.equal(formatTime(at(2, 35), "en"), "twenty-five to three");
  assert.equal(formatTime(0, "en"), "twelve o'clock");
  assert.equal(formatTime(at(6, 30), "nl"), "half zeven");
  assert.equal(formatTime(at(6, 25), "nl"), "vijf voor half zeven");
  assert.equal(formatTime(at(12, 45), "nl"), "kwart voor een");
  assert.equal(formatTime(at(3, 8), "nl"), "acht over drie");
});
