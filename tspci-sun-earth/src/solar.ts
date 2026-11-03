// The position of the sun as seen from a place on Earth, after the NOAA solar calculator's general formulas
// (fractional year, equation of time, declination, hour angle; https://gml.noaa.gov/grad/solcalc/solareqns.PDF).
// Accurate to about a minute and a few tenths of a degree, more than enough for school. A year of 365 days.
// No imports: `npm test` runs it in node.

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** The tilt of the Earth's axis (°). */
export const TILT = 23.44;
export const DAYS = 365;
export const MINUTES = 1440;

/** The fractional year γ (radians) on day `day` (1 = 1 January) at `minutes` UTC. */
export const fractionalYear = (day: number, minutes: number) => ((2 * Math.PI) / DAYS) * (day - 1 + (minutes / 60 - 12) / 24);

/** The equation of time (minutes): apparent solar time − mean solar time. */
export const equationOfTime = (day: number, minutes = 720) => {
  const g = fractionalYear(day, minutes);
  return 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
};

/** The sun's declination (°): the latitude where the sun is overhead. */
export const declination = (day: number, minutes = 720) => {
  const g = fractionalYear(day, minutes);
  return DEG * (0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g));
};

/** x mod m, always in [0, m). */
export const wrap = (x: number, m: number) => ((x % m) + m) % m;

/** The shortest distance between a and b on a circle of length m (days of the year, minutes of the day). */
export const circularDistance = (a: number, b: number, m: number) => {
  const d = wrap(a - b, m);
  return Math.min(d, m - d);
};

/** Apparent solar time at longitude `lon` (° east) at `minutes` UTC, in minutes, 720 is solar noon. */
export const solarTime = (day: number, minutes: number, lon: number) => wrap(minutes + equationOfTime(day, minutes) + 4 * lon, MINUTES);

/** Local mean time by longitude: UTC + lon / 15 hours, in minutes. */
export const localTime = (minutes: number, lon: number) => wrap(minutes + 4 * lon, MINUTES);
/** The other way round: the UTC minutes of a local time by longitude. */
export const utcOfLocal = (local: number, lon: number) => wrap(local - 4 * lon, MINUTES);

/** The longitude (° east, −180 to 180) where it is solar noon now. */
export const subsolarLongitude = (day: number, minutes: number) => {
  const lon = -(minutes + equationOfTime(day, minutes) - 720) / 4;
  return wrap(lon + 180, 360) - 180;
};

export type SunPosition = { elevation: number; azimuth: number; hourAngle: number };

/**
 * Where the sun is in the sky at (lat, lon) on `day` at `minutes` UTC: the elevation above the horizon (°, without
 * refraction), the azimuth (° from north, clockwise) and the hour angle (°, 0 at solar noon, negative in the morning).
 */
export const sunPosition = (day: number, minutes: number, lat: number, lon: number): SunPosition => {
  const d = declination(day, minutes) * RAD;
  const h = (solarTime(day, minutes, lon) / 4 - 180);
  const H = h * RAD, phi = lat * RAD;
  const sinEl = Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinEl))) * DEG;
  const azimuth = wrap(Math.atan2(-Math.sin(H) * Math.cos(d), Math.sin(d) * Math.cos(phi) - Math.cos(d) * Math.sin(phi) * Math.cos(H)) * DEG, 360);
  return { elevation, azimuth, hourAngle: h };
};

/** UTC minutes of solar noon at longitude `lon` (one iteration on the equation of time is plenty). */
export const solarNoon = (day: number, lon: number) => {
  let noon = 720 - 4 * lon - equationOfTime(day, 720);
  noon = 720 - 4 * lon - equationOfTime(day, noon);
  return wrap(noon, MINUTES);
};

export type Day = {
  /** UTC minutes of solar noon */
  noon: number;
  /** the sun's elevation at solar noon (°) */
  noonElevation: number;
  /** UTC minutes of sunrise and sunset; null with midnight sun or polar night */
  sunrise: number | null;
  sunset: number | null;
  /** daylight (minutes): 1440 with midnight sun, 0 in polar night */
  length: number;
  polar: "day" | "night" | null;
};

/**
 * The day at a place: solar noon, the noon elevation, sunrise, sunset and the day length. Sunrise and sunset are when
 * the centre of the sun is 0.833° below the horizon (refraction and the sun's radius), as NOAA and almanacs do.
 */
export const dayAt = (day: number, lat: number, lon: number): Day => {
  const noon = solarNoon(day, lon);
  const d = declination(day, noon) * RAD, phi = lat * RAD;
  const noonElevation = sunPosition(day, noon, lat, lon).elevation;
  const cosH = Math.cos(90.833 * RAD) / (Math.cos(phi) * Math.cos(d)) - Math.tan(phi) * Math.tan(d);
  if (cosH <= -1) return { noon, noonElevation, sunrise: null, sunset: null, length: MINUTES, polar: "day" };
  if (cosH >= 1) return { noon, noonElevation, sunrise: null, sunset: null, length: 0, polar: "night" };
  const H = Math.acos(cosH) * DEG; // degrees of hour angle from noon to sunset
  return { noon, noonElevation, sunrise: wrap(noon - 4 * H, MINUTES), sunset: wrap(noon + 4 * H, MINUTES), length: 8 * H, polar: null };
};

/** The sun's path through the sky on a day: a point every `step` minutes from 00:00 to 24:00 UTC. */
export const sunPath = (day: number, lat: number, lon: number, step = 10) => {
  const out: (SunPosition & { minutes: number })[] = [];
  for (let m = 0; m <= MINUTES; m += step) out.push({ minutes: m, ...sunPosition(day, m, lat, lon) });
  return out;
};

/** Where the sun is in the Earth's own frame: the unit vector towards it (x to 0° E on the equator, y to the north pole, z to 90° W). */
export const sunVector = (day: number, minutes: number): [number, number, number] => {
  const d = declination(day, minutes) * RAD, l = subsolarLongitude(day, minutes) * RAD;
  return [Math.cos(d) * Math.cos(l), Math.sin(d), -Math.cos(d) * Math.sin(l)];
};

/**
 * The Earth's place in its orbit: the sun's ecliptic longitude (radians), 0 at the March equinox (about 20 March).
 * The mean longitude plus the equation of centre (the orbit is a slightly flattened ellipse, nearest the sun early January).
 */
export const orbitAngle = (day: number, minutes = 720) => {
  const t = day - 1 + minutes / MINUTES;
  const mean = (2 * Math.PI * (t - 78.9)) / 365.2422;
  const anomaly = (2 * Math.PI * (t - 2.5)) / 365.2422;
  return wrap(mean + 0.0334 * Math.sin(anomaly) + 0.00035 * Math.sin(2 * anomaly) - 0.0334 * Math.sin((2 * Math.PI * (78.9 - 2.5)) / 365.2422), 2 * Math.PI);
};

/** The day of the year for an orbit angle (radians, 0 at the March equinox): the other way round, for dragging. */
export const dayOfOrbitAngle = (angle: number) => {
  let best = 1, bestDistance = Infinity;
  const a = wrap(angle, 2 * Math.PI);
  for (let day = 1; day <= DAYS; day++) {
    const d = Math.abs(wrap(orbitAngle(day) - a + Math.PI, 2 * Math.PI) - Math.PI);
    if (d < bestDistance) {
      bestDistance = d;
      best = day;
    }
  }
  return best;
};

// ---------------------------------------------------------------- the calendar (a year of 365 days)

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Day of the year → month (0 to 11) and the day of the month. */
export const dateOfDay = (day: number): { month: number; date: number } => {
  let d = Math.round(wrap(day - 1, DAYS)) + 1;
  for (let m = 0; m < 12; m++) {
    if (d <= MONTH_DAYS[m]) return { month: m, date: d };
    d -= MONTH_DAYS[m];
  }
  return { month: 11, date: 31 };
};

/** Month (0 to 11) and the day of the month → day of the year. */
export const dayOfDate = (month: number, date: number) => MONTH_DAYS.slice(0, month).reduce((s, n) => s + n, 0) + date;

/** Minutes → "04:30" (rounded to the minute, 24:00 is 00:00). */
export const clock = (minutes: number) => {
  const m = Math.round(wrap(minutes, MINUTES)) % MINUTES;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Minutes of a duration → "16 h 48 min". */
export const duration = (minutes: number) => {
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
};
