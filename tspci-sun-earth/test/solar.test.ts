// npm test: the sun's position (src/solar.ts) and the task's scoring (src/setup.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  circularDistance, clock, dateOfDay, dayAt, dayOfDate, dayOfOrbitAngle, declination, duration, equationOfTime, localTime,
  orbitAngle, solarNoon, solarTime, subsolarLongitude, sunPath, sunPosition, sunVector, utcOfLocal,
} from "../src/solar.ts";
import {
  DEFAULT_SETUP, PRESETS, controlled, evaluate, identifierOf, meets, parseSetup, responseProcessing, serializeSetup, setupProblems,
  valuesFor, type Setting, type Setup,
} from "../src/setup.ts";
import { formatNumber, parseNumber } from "../src/format.ts";

const near = (actual: number | null, expected: number, eps: number, what = "") =>
  assert.ok(actual !== null && Math.abs(actual - expected) <= eps, `${what} ${actual} is not ${expected} ± ${eps}`);

const AMSTERDAM = { lat: 52.37, lon: 4.9 };
const JUNE_21 = dayOfDate(5, 21); // 172
const DEC_21 = dayOfDate(11, 21); // 355

// what model.ts does, here without the bundler: the values of the response for a setting
const valuesOf = (setup: Setup, setting: Setting) => {
  const s = controlled(setup, setting);
  const place = setup.places.find((p) => p.id === s.place) ?? setup.places[0];
  if (!place) return null;
  return valuesFor(s, place, {
    declination: declination(s.day, s.minutes),
    subsolarLongitude: subsolarLongitude(s.day, s.minutes),
    solarTime: solarTime(s.day, s.minutes, place.lon),
    localTime: localTime(s.minutes, place.lon),
    position: sunPosition(s.day, s.minutes, place.lat, place.lon),
    day: dayAt(s.day, place.lat, place.lon),
  });
};

test("the calendar: day of the year and back", () => {
  assert.equal(JUNE_21, 172);
  assert.equal(DEC_21, 355);
  assert.deepEqual(dateOfDay(1), { month: 0, date: 1 });
  assert.deepEqual(dateOfDay(59), { month: 1, date: 28 });
  assert.deepEqual(dateOfDay(60), { month: 2, date: 1 });
  assert.deepEqual(dateOfDay(365), { month: 11, date: 31 });
  for (let d = 1; d <= 365; d++) assert.equal(dayOfDate(dateOfDay(d).month, dateOfDay(d).date), d);
  assert.equal(clock(270), "04:30");
  assert.equal(clock(1440), "00:00");
  assert.equal(clock(-30), "23:30");
  assert.equal(duration(1008.4), "16 h 48 min");
});

test("declination: about +23.44° at the June solstice, −23.44° at the December one, 0 at the equinoxes", () => {
  near(declination(JUNE_21), 23.44, 0.1, "21 June");
  near(declination(DEC_21), -23.44, 0.1, "21 December");
  near(declination(dayOfDate(2, 20)), 0, 0.5, "20 March");
  near(declination(dayOfDate(8, 23)), 0, 0.5, "23 September");
  // the highest of the year is around 21 June, the lowest around 21 December
  const all = Array.from({ length: 365 }, (_, i) => declination(i + 1));
  const max = all.indexOf(Math.max(...all)) + 1, min = all.indexOf(Math.min(...all)) + 1;
  assert.ok(Math.abs(max - JUNE_21) <= 2, `max on day ${max}`);
  assert.ok(circularDistance(min, DEC_21, 365) <= 2, `min on day ${min}`);
});

test("equation of time: about −14 min mid February, +16 min early November, near 0 mid April and mid June", () => {
  near(equationOfTime(dayOfDate(1, 11)), -14.2, 0.5, "11 February");
  near(equationOfTime(dayOfDate(10, 3)), 16.4, 0.5, "3 November");
  near(equationOfTime(dayOfDate(3, 15)), 0, 1, "15 April");
  near(equationOfTime(dayOfDate(5, 13)), 0, 1, "13 June");
});

test("Amsterdam on 21 June: day length about 16 h 48 min, the sun at noon about 61° high", () => {
  const d = dayAt(JUNE_21, AMSTERDAM.lat, AMSTERDAM.lon);
  near(d.length, 16 * 60 + 48, 3, "day length (min)");
  // 90° − 52.37° + 23.44° = 61.07°
  near(d.noonElevation, 61.07, 0.15, "noon elevation");
  // sunrise 05:18 and sunset 22:06 summer time (UTC + 2), solar noon 13:42
  near(d.sunrise!, 3 * 60 + 18, 3, "sunrise (UTC min)");
  near(d.sunset!, 20 * 60 + 6, 3, "sunset (UTC min)");
  near(d.noon, 11 * 60 + 42, 2, "solar noon (UTC min)");
  assert.equal(d.polar, null);
});

test("Amsterdam in December and at the equinox", () => {
  const dec = dayAt(DEC_21, AMSTERDAM.lat, AMSTERDAM.lon);
  near(dec.length, 7 * 60 + 39, 4, "21 December");
  near(dec.noonElevation, 90 - 52.37 - 23.44, 0.15);
  const equinox = dayAt(dayOfDate(2, 20), AMSTERDAM.lat, AMSTERDAM.lon);
  near(equinox.length, 12 * 60 + 8, 8, "20 March: a little over 12 h (refraction)");
});

test("the day is longest far north in June, shortest in the south; the equator stays near 12 h", () => {
  const len = (id: string, day: number) => {
    const p = PRESETS.find((x) => x.id === id)!;
    return dayAt(day, p.lat, p.lon).length;
  };
  near(len("oslo", JUNE_21), 18 * 60 + 50, 5, "Oslo");
  near(len("quito", JUNE_21), 12 * 60 + 7, 3, "Quito");
  near(len("sydney", JUNE_21), 9 * 60 + 54, 4, "Sydney");
  near(len("quito", DEC_21), 12 * 60 + 8, 3, "Quito in December");
  assert.ok(len("oslo", JUNE_21) > len("amsterdam", JUNE_21));
  assert.ok(len("sydney", DEC_21) > len("sydney", JUNE_21));
});

test("midnight sun and polar night at Longyearbyen", () => {
  const p = PRESETS.find((x) => x.id === "longyearbyen")!;
  const summer = dayAt(JUNE_21, p.lat, p.lon), winter = dayAt(DEC_21, p.lat, p.lon);
  assert.equal(summer.polar, "day");
  assert.equal(summer.length, 1440);
  assert.equal(summer.sunrise, null);
  assert.equal(winter.polar, "night");
  assert.equal(winter.length, 0);
  assert.ok(winter.noonElevation < 0);
});

test("the sun overhead: at the Tropic of Capricorn on 21 December at noon, at the place's solar noon at the equator in March", () => {
  near(declination(DEC_21, solarNoon(DEC_21, 0)), -23.44, 0.1);
  // where the sun is overhead, its elevation is 90°
  const lon = subsolarLongitude(JUNE_21, 600);
  near(sunPosition(JUNE_21, 600, declination(JUNE_21, 600), lon).elevation, 90, 0.01, "subsolar point");
  const [x, y, z] = sunVector(JUNE_21, 600);
  near(Math.hypot(x, y, z), 1, 1e-12);
  near(Math.asin(y) * 180 / Math.PI, declination(JUNE_21, 600), 1e-9);
});

test("solar time: noon in Jakarta is about 04:54 UTC in June; local time by longitude is UTC + lon/15", () => {
  const jakarta = PRESETS.find((x) => x.id === "jakarta")!;
  const noon = solarNoon(JUNE_21, jakarta.lon);
  near(noon, 4 * 60 + 54, 2, "solar noon (UTC min)");
  near(solarTime(JUNE_21, noon, jakarta.lon), 720, 0.2);
  near(localTime(0, 15), 60, 1e-9);
  near(localTime(30, -30), 1440 - 90, 1e-9);
  near(utcOfLocal(localTime(123, 106.85), 106.85), 123, 1e-9);
});

test("sun position: south at noon in Amsterdam, east in the morning, west in the evening", () => {
  const d = dayAt(JUNE_21, AMSTERDAM.lat, AMSTERDAM.lon);
  near(sunPosition(JUNE_21, d.noon, AMSTERDAM.lat, AMSTERDAM.lon).azimuth, 180, 0.5);
  near(sunPosition(JUNE_21, d.noon, AMSTERDAM.lat, AMSTERDAM.lon).hourAngle, 0, 0.1);
  const morning = sunPosition(JUNE_21, d.noon - 240, AMSTERDAM.lat, AMSTERDAM.lon);
  assert.ok(morning.azimuth > 90 && morning.azimuth < 180 && morning.hourAngle < 0);
  const evening = sunPosition(JUNE_21, d.noon + 240, AMSTERDAM.lat, AMSTERDAM.lon);
  assert.ok(evening.azimuth > 180 && evening.azimuth < 270);
  // in Sydney the noon sun is in the north
  const sydney = PRESETS.find((x) => x.id === "sydney")!;
  const azimuth = sunPosition(JUNE_21, solarNoon(JUNE_21, sydney.lon), sydney.lat, sydney.lon).azimuth;
  assert.ok(azimuth < 1 || azimuth > 359, `${azimuth}`);
  // at sunrise the sun is just below the horizon (0.833°)
  near(sunPosition(JUNE_21, d.sunrise!, AMSTERDAM.lat, AMSTERDAM.lon).elevation, -0.833, 0.1);
  assert.equal(sunPath(JUNE_21, AMSTERDAM.lat, AMSTERDAM.lon, 10).length, 145);
});

test("the orbit: the angle grows through the year, a quarter at the solstice, and back to a day", () => {
  near(circularDistance(orbitAngle(dayOfDate(2, 20)), 0, 2 * Math.PI), 0, 0.03);
  near(orbitAngle(JUNE_21), Math.PI / 2, 0.03);
  near(orbitAngle(dayOfDate(8, 22)), Math.PI, 0.03);
  near(orbitAngle(DEC_21), (3 * Math.PI) / 2, 0.03);
  for (const d of [1, 50, 172, 300, 365]) assert.equal(dayOfOrbitAngle(orbitAngle(d)), d);
});

test("an empty or broken data-setup is the example; places by id or in full", () => {
  assert.deepEqual(parseSetup(""), DEFAULT_SETUP);
  assert.deepEqual(parseSetup("{nope"), DEFAULT_SETUP);
  assert.deepEqual(parseSetup(serializeSetup(DEFAULT_SETUP)), DEFAULT_SETUP);
  assert.deepEqual(JSON.parse(serializeSetup(DEFAULT_SETUP)).places, ["amsterdam", "quito", "oslo", "sydney", "jakarta"]);
  const s = parseSetup(JSON.stringify({
    places: ["oslo", { name: "Den Haag", lat: "52,08", lon: 4.3 }, "nowhere", "oslo"],
    controls: { time: false },
    start: { day: 400, minutes: -60, place: "denhaag" },
    targets: [{ field: "place", value: "oslo" }, { field: "nope" }, { field: "dayLength", value: "16,5", margin: "0.2", points: 2 }],
  }));
  assert.deepEqual(s.places.map((p) => [p.id, p.lat]), [["oslo", 59.91], ["denhaag", 52.08]]);
  assert.deepEqual(s.controls, { day: true, time: false, place: true });
  assert.deepEqual(s.start, { day: 35, minutes: 1380, place: "denhaag" });
  assert.deepEqual(s.targets, [{ field: "place", value: "oslo", margin: 0, points: 1 }, { field: "dayLength", value: 16.5, margin: 0.2, points: 2 }]);
  assert.equal(s.solution, null);
  assert.equal(identifierOf("Reykjavík"), "reykjavik");
  assert.equal(identifierOf("1 place"), "p1place");
});

test("margins: within ± margin, round the end of the year and the day", () => {
  assert.ok(meets({ field: "day", value: 355, margin: 3, points: 1 }, 358));
  assert.ok(!meets({ field: "day", value: 355, margin: 3, points: 1 }, 359));
  assert.ok(meets({ field: "day", value: 1, margin: 3, points: 1 }, 363));
  assert.ok(meets({ field: "time", value: 23.9, margin: 0.25, points: 1 }, 0.1));
  assert.ok(!meets({ field: "dayLength", value: 16.8, margin: 0.1, points: 1 }, 16.95));
  assert.ok(meets({ field: "place", value: "oslo", margin: 0, points: 1 }, "oslo"));
  assert.ok(!meets({ field: "place", value: "oslo", margin: 0, points: 1 }, "quito"));
  assert.ok(!meets({ field: "sunrise", value: 3, margin: 1, points: 1 }, null));
});

test("the example: the sun overhead at the Tropic of Capricorn is around 21 December", () => {
  const at = (day: number) => evaluate(DEFAULT_SETUP, valuesOf(DEFAULT_SETUP, { ...DEFAULT_SETUP.start, day })!);
  assert.equal(at(355).correct, true);
  assert.equal(at(353).score, 1);
  assert.equal(at(172).score, 0);
  assert.equal(at(80).maxscore, 1);
  assert.deepEqual(setupProblems(DEFAULT_SETUP, "answer", (s) => valuesOf(DEFAULT_SETUP, s)), []);
});

test("the task 'noon in Jakarta': solar time 12 ± 0.25 h, the candidate sets the UTC time", () => {
  const setup = parseSetup(JSON.stringify({
    places: ["jakarta"], controls: { day: false, time: true, place: false }, start: { day: 172, minutes: 0, place: "jakarta" },
    targets: [{ field: "solarTime", value: 12, margin: 0.25, points: 1 }], solution: { day: 172, minutes: 290, place: "jakarta" },
  }));
  const v = valuesOf(setup, { day: 1, minutes: 290, place: "x" })!; // the day and the place stay as the author set them
  assert.equal(v.day, 172);
  assert.equal(v.place, "jakarta");
  near(v.solarTime!, 12, 0.1);
  assert.equal(evaluate(setup, v).correct, true);
  assert.equal(evaluate(setup, valuesOf(setup, { day: 172, minutes: 360, place: "jakarta" })!).correct, false);
  assert.deepEqual(setupProblems(setup, "answer", (s) => valuesOf(setup, s)), []);
});

test("the task 'where is the day longest on 21 June': the place target", () => {
  const setup = parseSetup(JSON.stringify({
    places: ["amsterdam", "quito", "oslo", "sydney"], controls: { day: false, time: false, place: true }, start: { day: 172, minutes: 720, place: "quito" },
    targets: [{ field: "place", value: "oslo", points: 1 }], solution: { day: 172, minutes: 720, place: "oslo" },
  }));
  const lengths = setup.places.map((p) => valuesOf(setup, { day: 172, minutes: 720, place: p.id })!.dayLength!);
  assert.equal(setup.places[lengths.indexOf(Math.max(...lengths))].id, "oslo");
  assert.equal(evaluate(setup, valuesOf(setup, { day: 172, minutes: 720, place: "oslo" })!).score, 1);
  assert.equal(evaluate(setup, valuesOf(setup, { day: 172, minutes: 720, place: "amsterdam" })!).score, 0);
});

test("the values of the response: rounded, hours as decimals, no sunrise in polar night", () => {
  const v = valuesOf(DEFAULT_SETUP, { day: 172, minutes: 600, place: "amsterdam" })!;
  assert.equal(v.time, 10);
  near(v.localTime!, 10 + 4.9 / 15, 0.001);
  near(v.dayLength!, 16.8, 0.05);
  near(v.noonElevation!, 61.07, 0.15);
  near(v.declination!, 23.44, 0.1);
  assert.equal(v.latitude, 52.37);
  const polar = parseSetup(JSON.stringify({ places: ["longyearbyen"], controls: { day: true }, start: { day: 355, place: "longyearbyen" } }));
  const w = valuesOf(polar, polar.start)!;
  assert.equal(w.sunrise, null);
  assert.equal(w.sunset, null);
  assert.equal(w.dayLength, 0);
});

test("authoring problems", () => {
  const values = (setup: Setup) => (s: Setting) => valuesOf(setup, s);
  const none = parseSetup(JSON.stringify({ places: [], controls: { day: false, time: false, place: false }, targets: [] }));
  assert.deepEqual(setupProblems(none, "answer", values(none)).map((p) => p.code), ["noPlaces", "nothingControls", "noTargets"]);
  assert.deepEqual(setupProblems(none, "tool", values(none)).map((p) => p.code), ["noPlaces", "nothingControls"]);
  const wrong = parseSetup(JSON.stringify({
    places: ["oslo"], controls: { day: true, time: false, place: true },
    targets: [{ field: "place", value: "quito" }, { field: "time", value: 4, margin: 1 }, { field: "day", value: 172, margin: 1 }],
    solution: { day: 100, place: "oslo" },
  }));
  assert.deepEqual(setupProblems(wrong, "answer", values(wrong)), [
    { code: "onePlace" }, { code: "targetPlaceUnknown", target: 1 }, { code: "targetNotControlled", target: 2 },
    { code: "solutionFails", target: 1 }, { code: "solutionFails", target: 2 }, { code: "solutionFails", target: 3 },
  ]);
  const noSolution = parseSetup(JSON.stringify({ targets: [{ field: "day", value: 1, margin: 1 }] }));
  assert.deepEqual(setupProblems(noSolution, "answer", values(noSolution)).map((p) => p.code), ["noSolution"]);
});

test("response processing: qti-equal with the margin for numbers, qti-match for the place", () => {
  const setup = parseSetup(JSON.stringify({ targets: [{ field: "day", value: 355, margin: 3, points: 1 }, { field: "place", value: "oslo", points: 2 }] }));
  const rp = responseProcessing(setup);
  assert.match(rp, /<qti-equal tolerance-mode="absolute" tolerance="3 3">/);
  assert.match(rp, /field-identifier="day"/);
  assert.match(rp, /<qti-base-value base-type="identifier">oslo<\/qti-base-value>/);
  assert.match(rp, /<qti-value>3<\/qti-value>/); // MAXSCORE
});

test("numbers: a decimal comma in Dutch", () => {
  assert.equal(formatNumber(61.07, 1, "nl"), "61,1");
  assert.equal(formatNumber(-23.44, 1, "en"), "−23.4");
  assert.equal(parseNumber("16,5"), 16.5);
});
