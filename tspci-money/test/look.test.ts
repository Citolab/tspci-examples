// npm test: how the coins and notes look (src/look.ts): their sizes, and text that stays readable on any colour.
import { test } from "node:test";
import assert from "node:assert/strict";
import { INK_DARK, INK_LIGHT, coinColors, contrast, inkOn, luminance, noteColors, pieceSize, readableShade } from "../src/look.ts";

test("contrast: the WCAG ratio", () => {
  assert.equal(Math.round(contrast("#000000", "#ffffff")), 21);
  assert.equal(contrast("#777777", "#777777"), 1);
  assert.equal(luminance("#fff"), 1);
  assert.ok(Math.abs(contrast("#767676", "#ffffff") - 4.54) < 0.01);
});

/** Colours an author could pick: the corners and edges of the colour cube, greys, and some random ones. */
function someColors(): string[] {
  const colors: string[] = [];
  for (const r of [0, 64, 128, 192, 255]) for (const g of [0, 64, 128, 192, 255]) for (const b of [0, 64, 128, 192, 255]) colors.push(hex(r, g, b));
  let seed = 11;
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 300; i++) colors.push(hex(random() * 255, random() * 255, random() * 255));
  return colors;
}
const hex = (...c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

test("the value on a coin is readable on any colour (at least 4.5:1)", () => {
  for (const color of [...someColors(), "copper", "gold", "silver", "silverInGold", "goldInSilver"]) {
    const { centre } = coinColors(color);
    assert.ok(contrast(centre.ink, centre.fill) >= 4.5, `${color}: ${centre.ink} on ${centre.fill}`);
  }
  assert.equal(inkOn("#ffffff"), INK_DARK);
  assert.equal(inkOn("#000000"), INK_LIGHT);
  assert.equal(inkOn("#1d4ed8"), INK_LIGHT);
  assert.equal(inkOn("#fde047"), INK_DARK);
});

test("the value on a note is readable on its panel, and its other text on its colour", () => {
  for (const color of someColors()) {
    const note = noteColors(color);
    assert.ok(contrast(note.value, note.panel) >= 4.5, `${color}: value ${note.value} on ${note.panel}`);
    assert.ok(contrast(note.ink, note.fill) >= 4.5, `${color}: ${note.ink} on ${note.fill}`);
  }
  // a shade of the note's own colour where one is readable
  assert.notEqual(readableShade("#5b8fd0", "#ffffff"), INK_DARK);
});

test("sizes: the real proportions for the presets, by value for the rest", () => {
  const coin = (value: number, code: "eur" | "usd" | "gbp" | "custom") => pieceSize({ value, kind: "coin" }, code).width;
  const note = (value: number, code: "eur" | "usd" | "gbp" | "custom") => pieceSize({ value, kind: "note" }, code);
  // the euro: a 10 cent coin is smaller than a 5 cent one, € 2 the largest coin
  assert.ok(coin(10, "eur") < coin(5, "eur"));
  assert.ok(coin(200, "eur") > coin(50, "eur"));
  // the dime is the smallest dollar coin, the half dollar the largest; all dollar notes are the same size
  assert.ok(coin(10, "usd") < coin(1, "usd"));
  assert.ok(coin(50, "usd") > coin(25, "usd"));
  assert.deepEqual(note(100, "usd"), note(10000, "usd"));
  // the pound: 5p the smallest, £2 the largest; a larger note is a larger note
  assert.ok(coin(5, "gbp") < coin(1, "gbp"));
  assert.ok(coin(200, "gbp") >= Math.max(...[1, 2, 5, 10, 20, 50, 100].map((v) => coin(v, "gbp"))));
  assert.ok(note(5000, "gbp").width > note(500, "gbp").width);
  // by value: larger values, larger pieces, within bounds
  const values = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  for (let i = 1; i < values.length; i++) assert.ok(coin(values[i], "custom") >= coin(values[i - 1], "custom"));
  assert.ok(coin(1, "custom") >= 35 && coin(1000000, "custom") <= 80);
  assert.ok(note(500, "custom").width < note(10000, "custom").width);
  assert.ok(note(100000000, "custom").width <= 160);
  // a coin of a preset value made a note (or the other way round) gets a size by value
  assert.equal(note(100, "eur").width, note(100, "custom").width);
});
