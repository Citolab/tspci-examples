// npm test: the settings, rounding and the traces (src/settings.ts, src/signal.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  amplitudeInDivisions, cyclesOnScreen, decimalsOf, formatNumber, makeRange, parseNumber, parsePair, parseSettings, roundTo, snap,
} from "../src/settings.ts";
import { pointAt, tracePath, tracePoints, waveAt } from "../src/signal.ts";

const DEFAULTS = {
  waveform: "sine", gridColumns: "10", gridRows: "8", frequencyUnit: "vibrations", amplitudeUnit: "divisions", timePerDiv: "1",
  voltsPerDiv: "1", showScale: "false", showReference: "true", referenceFrequency: "4.2", referenceAmplitude: "1",
  startFrequency: "2", startAmplitude: "2", correctFrequency: "4.2", correctAmplitude: "3", frequencyMin: "0.5", frequencyMax: "8",
  frequencyStep: "0.1", amplitudeMin: "0.2", amplitudeMax: "4", amplitudeStep: "0.1", showValues: "true", animate: "true", language: "en",
};

test("numbers as authors and candidates write them", () => {
  assert.deepEqual(["4.2", "4,2", " 3 ", "1e3", "", "abc", undefined, 7, NaN].map(parseNumber), [4.2, 4.2, 3, 1000, null, null, null, 7, null]);
});

test("decimals, rounding and snapping", () => {
  assert.deepEqual([0.1, 0.25, 5, 1e-7, 0.05].map(decimalsOf), [1, 2, 0, 6, 2]);
  assert.equal(roundTo(0.1 + 0.2, 1), 0.3);
  assert.equal(roundTo(1.005, 2), 1.01);
  const range = makeRange("0.5", "8", "0.1", { min: 0, max: 1, step: 0.1 });
  assert.deepEqual(range, { min: 0.5, max: 8, step: 0.1, decimals: 1 });
  assert.deepEqual([4.2, 4.24, 4.26, 0, 100, 0.55].map((n) => snap(n, range)), [4.2, 4.2, 4.3, 0.5, 8, 0.6]);
  // knobs in tens: 100..1000 Hz
  const hz = makeRange("100", "1000", "10", { min: 0, max: 1, step: 0.1 });
  assert.deepEqual([523, 99, 1005].map((n) => snap(n, hz)), [520, 100, 1000]);
});

test("a range that cannot be used", () => {
  assert.deepEqual(makeRange("5", "2", "1", { min: 0, max: 4, step: 0.5 }), { min: 0, max: 4, step: 1, decimals: 0 });
  assert.deepEqual(makeRange("0", "10", "0", { min: 0, max: 4, step: 0.5 }), { min: 0, max: 10, step: 0.1, decimals: 1 });
});

test("settings: defaults", () => {
  const s = parseSettings(DEFAULTS);
  assert.equal(s.waveform, "sine");
  assert.equal(s.columns, 10);
  assert.equal(s.rows, 8);
  assert.deepEqual(s.reference, { frequency: 4.2, amplitude: 1 });
  assert.deepEqual(s.start, { frequency: 2, amplitude: 2 });
  assert.deepEqual(s.correct, { frequency: 4.2, amplitude: 3 });
  assert.equal(s.showValues, true);
  assert.equal(s.showScale, false);
  assert.equal(s.language, "en");
});

test("settings: what is wrong or missing falls back", () => {
  const s = parseSettings({ ...DEFAULTS, waveform: "SQUARE", gridColumns: "99", gridRows: "x", correctAmplitude: "", startFrequency: "100",
    language: "nl-NL", showValues: "FALSE", timePerDiv: "-1" });
  assert.equal(s.waveform, "square");
  assert.equal(s.columns, 20);
  assert.equal(s.rows, 8);
  assert.equal(s.correct, null);
  assert.equal(s.start.frequency, 8); // within the knob's range
  assert.equal(s.language, "nl");
  assert.equal(s.showValues, false);
  assert.equal(s.timePerDiv, 1);
});

test("hertz and volts on the screen", () => {
  const s = parseSettings({ ...DEFAULTS, frequencyUnit: "hertz", amplitudeUnit: "volts", timePerDiv: "0.5", voltsPerDiv: "2" });
  assert.equal(cyclesOnScreen(s, 800), 4); // 10 div × 0.5 ms = 5 ms; 800 Hz → 4 vibrations
  assert.equal(amplitudeInDivisions(s, 3), 1.5);
  const v = parseSettings(DEFAULTS);
  assert.equal(cyclesOnScreen(v, 4.2), 4.2);
  assert.equal(amplitudeInDivisions(v, 3), 3);
});

test("numbers for the candidate", () => {
  assert.equal(formatNumber(4.2, 1, "en"), "4.2");
  assert.equal(formatNumber(4.2, 2, "nl"), "4,20");
  assert.equal(formatNumber(500, 0, "nl"), "500");
});

test("a response as a pair", () => {
  assert.deepEqual(parsePair([4.2, 3]), [4.2, 3]);
  assert.deepEqual(parsePair(["4.2", "3"]), [4.2, 3]);
  assert.deepEqual(parsePair("4.2 3"), [4.2, 3]);
  assert.deepEqual(parsePair("4,2; 3"), [4.2, 3]);
  assert.equal(parsePair("4.2"), null);
  assert.equal(parsePair(["a", "3"]), null);
  assert.equal(parsePair(undefined), null);
});

test("waveforms start on the centre line going up", () => {
  for (const w of ["sine", "triangle"] as const) {
    assert.equal(Math.round(waveAt(w, 0) * 1e9), 0);
    assert.equal(Math.round(waveAt(w, 0.25) * 1e9) / 1e9, 1);
    assert.equal(Math.round(waveAt(w, 0.75) * 1e9) / 1e9, -1);
  }
  assert.deepEqual([0, 0.25, 0.5, 0.75, 1].map((p) => waveAt("square", p)), [1, 1, -1, -1, 1]);
});

const trace = { waveform: "sine" as const, cycles: 2, amplitude: 3, columns: 10, rows: 8, division: 40 };

test("a sine trace: the peaks at the right place", () => {
  // 400 × 320 px, centre at 160; 2 vibrations: a peak at x = 50, 3 divisions = 120 px up
  const [x, y] = pointAt(trace, 50);
  assert.equal(x, 50);
  assert.equal(Math.round(y * 1e6) / 1e6, 40);
  const points = tracePoints(trace);
  assert.deepEqual(points[0], [0, 160]);
  assert.equal(points[points.length - 1][0], 400);
  assert.ok(points.length > 96);
  assert.equal(Math.min(...points.map(([, y]) => y)), 40);
  assert.ok(tracePath(trace).startsWith("M0 160L"));
});

test("triangle and square traces: corners and edges", () => {
  const tri = tracePoints({ ...trace, waveform: "triangle", cycles: 1 });
  assert.deepEqual(tri.map(([x, y]) => [Math.round(x), Math.round(y)]), [[0, 160], [100, 40], [200, 160], [300, 280], [400, 160]]);
  const sq = tracePoints({ ...trace, waveform: "square", cycles: 1, amplitude: 1 });
  assert.deepEqual(sq.map(([x, y]) => [Math.round(x), Math.round(y)]), [[0, 160], [0, 120], [200, 120], [200, 200], [400, 200]]);
});

test("a flat line without vibrations or amplitude", () => {
  assert.deepEqual(tracePoints({ ...trace, cycles: 0 }), [[0, 160], [400, 160]]);
  assert.deepEqual(tracePoints({ ...trace, amplitude: 0 }), [[0, 160], [400, 160]]);
});
