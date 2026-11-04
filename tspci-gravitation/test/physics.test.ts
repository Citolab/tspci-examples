// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/NouvelleTerrepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// npm test: the model and the numbers (src/physics.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { forceOf, formatNumber, formatScientific, roundScientific, scientific, scientificParts, superscript } from "../src/physics.ts";
import { ORIGINAL_STAR_MASS } from "../src/settings.ts";

/** The original's lookup table, a sample: [distance (million km), mass (10²³ kg), "mantissa", exponent]. */
const ORIGINAL: [number, number, string, number][] = [
  [50, 1, "2.67", 27], [100, 1, "6.67", 26], [150, 1, "2.96", 26], [550, 1, "2.20", 25],
  [50, 6, "1.60", 28], [300, 6, "4.45", 26], [150, 11, "3.26", 27], [550, 11, "2.43", 26],
  [400, 16, "6.67", 26], [350, 21, "1.14", 27], [450, 26, "8.56", 26], [50, 30, "8.00", 28], [550, 30, "6.61", 26],
];

test("Newton's law with the original star gives the original's table", () => {
  for (const [d, m, mantissa, exponent] of ORIGINAL) {
    const f = forceOf(ORIGINAL_STAR_MASS, m, d);
    assert.equal(formatScientific(f, "en", 3), `${mantissa} × 10${superscript(exponent)}`, `${d} million km, ${m}·10²³ kg`);
  }
});

test("the force: twice the mass twice the force, twice the distance a quarter", () => {
  const f = forceOf(ORIGINAL_STAR_MASS, 10, 200);
  assert.ok(Math.abs(forceOf(ORIGINAL_STAR_MASS, 20, 200) / f - 2) < 1e-12);
  assert.ok(Math.abs(forceOf(ORIGINAL_STAR_MASS, 10, 400) / f - 0.25) < 1e-12);
  // the Sun and the Earth: about 3.5·10²² N
  const earth = forceOf(1.989e30, 59.72, 149.6);
  assert.equal(formatScientific(earth, "en", 2), "3.5 × 10²²");
});

test("scientific notation", () => {
  assert.deepEqual(scientific(6.67e26, 3), { mantissa: 6.67, exponent: 26 });
  assert.deepEqual(scientific(9.996e26, 3), { mantissa: 1, exponent: 27 }); // rounds up into the next power
  assert.deepEqual(scientific(1.23e-5, 2), { mantissa: 1.2, exponent: -5 });
  assert.deepEqual(scientific(0, 3), { mantissa: 0, exponent: 0 });
  assert.equal(roundScientific(6.674e26, 3), 6.67e26);
  assert.equal(roundScientific(1.0011e28, 3), 1e28);
  assert.equal(superscript(-12), "⁻¹²");
});

test("numbers in English, Dutch and French", () => {
  assert.equal(formatScientific(6.674e26, "en", 3), "6.67 × 10²⁶");
  assert.equal(formatScientific(6.674e26, "nl", 3), "6,67 × 10²⁶");
  assert.equal(formatScientific(6.674e26, "fr", 3), "6,67 × 10²⁶");
  assert.equal(formatScientific(1.0011e28, "nl", 3), "1,00 × 10²⁸"); // the trailing zeros stay: 3 significant digits
  assert.equal(formatScientific(1.0011e28, "en", 1), "1 × 10²⁸");
  assert.deepEqual(scientificParts(2.5e-3, "fr", 2), { mantissa: "2,5", exponent: "−3" });
  assert.equal(formatNumber(10000, "en"), "10,000");
  assert.equal(formatNumber(10000, "nl"), "10.000");
  assert.equal(formatNumber(10000, "fr").replace(/\s/g, " "), "10 000");
  assert.equal(formatNumber(2.5, "nl", 1), "2,5");
  assert.equal(formatNumber(-3, "en"), "−3");
});
