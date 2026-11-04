// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/MaraisSalantpci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// npm test: the settings (src/settings.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkContainer, formatNumber, languageOf, parseRange, parseSettings, parseStart, snap } from "../src/settings.ts";

test("defaults", () => {
  const s = parseSettings({});
  assert.equal(s.count, 2);
  assert.equal(s.target, null);
  assert.deepEqual(s.fixed, { temperature: 20, width: 10, wind: false, salt: 35, volume: 200 });
  assert.deepEqual(s.canChange, { temperature: true, area: true, wind: true, salt: false, volume: true });
  assert.deepEqual(s.ranges.width, { min: 5, max: 30, step: 5 });
  assert.equal(s.start.length, 2);
  assert.deepEqual(s.start[1], s.fixed);
  assert.equal(s.duration, 48);
  assert.equal(s.runSeconds, 20);
  assert.equal(s.language, "en");
});

test("target, count and language", () => {
  assert.equal(parseSettings({ target: "Area" }).target, "area");
  assert.equal(parseSettings({ target: "width" }).target, "area");
  assert.equal(parseSettings({ target: "none" }).target, null);
  assert.equal(parseSettings({ count: "3" }).count, 3);
  assert.equal(parseSettings({ count: "7" }).count, 3);
  assert.equal(parseSettings({ count: "1" }).count, 2);
  assert.equal(languageOf("fr-FR"), "fr");
  assert.equal(languageOf("NL"), "nl");
  assert.equal(languageOf("de"), "en");
});

test("ranges and fixed values are checked", () => {
  assert.deepEqual(parseRange("0", "100", "10", { min: 1, max: 2, step: 1 }, 1), { min: 1, max: 100, step: 10 });
  assert.deepEqual(parseRange("50", "40", "5", { min: 10, max: 80, step: 5 }, -20), { min: 50, max: 80, step: 5 });
  assert.deepEqual(parseRange("0", "10", "99", { min: 0, max: 1, step: 1 }, 0), { min: 0, max: 10, step: 1 });
  assert.equal(snap(17, { min: 10, max: 80, step: 5 }), 15);
  assert.equal(snap(1000, { min: 10, max: 80, step: 5 }), 80);
  assert.equal(parseSettings({ temperature: "23" }).fixed.temperature, 25);
  assert.equal(parseSettings({ volume: "1,5e2" }).fixed.volume, 150);
});

test("start values per container, also for what the candidate cannot change", () => {
  assert.deepEqual(parseStart("temperature=60; width=10 | temp: 20"), [{ temperature: "60", width: "10" }, { temperature: "20" }]);
  const s = parseSettings({ changeTemperature: "false", start: "temperature=60 | temperature=20", wind: "true" });
  assert.deepEqual(s.start.map((c) => c.temperature), [60, 20]);
  assert.deepEqual(s.start.map((c) => c.wind), [true, true]);
  // the original's second experiment: a wide and a narrow container
  const w = parseSettings({ start: "area=30 | area=5" });
  assert.deepEqual(w.start.map((c) => c.width), [30, 5]);
});

test("a container from a candidate: on the steps, and fixed where the candidate cannot change", () => {
  const s = parseSettings({ changeVolume: "false" });
  assert.deepEqual(checkContainer({ temperature: 33, width: "12", volume: 450, wind: "true", salt: 100 }, s),
    { temperature: 35, width: 10, wind: true, salt: 35, volume: 200 });
});

test("numbers per language", () => {
  assert.equal(formatNumber(12.5, 1, "en"), "12.5");
  assert.equal(formatNumber(12.5, 1, "nl"), "12,5");
  assert.equal(formatNumber(12.5, 1, "fr"), "12,5");
  assert.equal(formatNumber(-0.01, 1, "en"), "0.0");
});
