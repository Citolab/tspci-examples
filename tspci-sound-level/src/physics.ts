// The physics of the simulation: a point source that sends its power out evenly in all directions. No imports but a
// type: `npm test` runs it in node.
//
//   intensity  I = P / (4πr²)            W/m², P in W, r in m
//   level      L = 10 · log10(I / I0)    dB
//
// I0 is the threshold of hearing. The standard value is 1·10⁻¹² W/m²; the simulation in the 2025 Dutch vmbo exam used
// 1,2·10⁻¹² W/m², which gives levels 0,8 dB lower (10 · log10(1,2) = 0,79). data-reference-intensity chooses.

// A type import only: node and the build strip it, so the file still runs without its neighbours.
import type { Settings } from "./settings";

/** The standard threshold of hearing, in W/m². */
export const I0_STANDARD = 1e-12;

/** The intensity at distance r (m) from a source of power p (W), in W/m². */
export const intensity = (power: number, distance: number): number => power / (4 * Math.PI * distance * distance);

/** The sound level in dB at distance r (m) from a source of power p (W). -Infinity without power, Infinity at r = 0. */
export const soundLevel = (power: number, distance: number, i0 = I0_STANDARD): number =>
  10 * Math.log10(intensity(power, distance) / i0);

/** The distance (m) at which a source of power p (W) gives the level L (dB). */
export const distanceForLevel = (level: number, power: number, i0 = I0_STANDARD): number =>
  Math.sqrt(power / (4 * Math.PI * i0 * Math.pow(10, level / 10)));

/** The power (W) a source needs to give the level L (dB) at distance r (m). */
export const powerForLevel = (level: number, distance: number, i0 = I0_STANDARD): number =>
  4 * Math.PI * distance * distance * i0 * Math.pow(10, level / 10);

/** The number of decimals of a step: 10 → 0, 0.5 → 1, 0.25 → 2, 1e-3 → 3. */
export const decimalsOf = (step: number): number => {
  if (!isFinite(step) || step <= 0) return 0;
  const text = String(step);
  const exponent = /e-(\d+)$/.exec(text);
  if (exponent) return Number(exponent[1]) + ((text.split("e")[0].split(".")[1] ?? "").length);
  return (text.split(".")[1] ?? "").length;
};

/** v rounded to d decimals, without 0.1 + 0.2 noise. */
export const roundTo = (value: number, decimals: number): number => Number(value.toFixed(Math.max(0, Math.min(20, decimals))));

/** The value of the slider closest to v: min + k·step, within [min, max], rounded to the step's decimals. */
export const snap = (value: number, min: number, max: number, step: number): number => {
  if (!isFinite(value)) return min;
  const k = Math.round((value - min) / step);
  const snapped = Math.min(max, Math.max(min, min + k * step));
  return roundTo(snapped, Math.max(decimalsOf(step), decimalsOf(min)));
};

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * How strong a wave looks where the level is L: 0 at (or below) 0 dB, 1 at 130 dB and above. The rings of the
 * picture fade with it, so they fade as the sound does: by 6 dB for every doubling of the distance.
 */
export const visibility = (level: number): number => (isFinite(level) ? clamp(level / 130, 0, 1) : level > 0 ? 1 : 0);

// ---- the simulation with the item's settings

/** The level in dB for a power and a distance in the units of the settings. */
export const levelOf = (s: Settings, power: number, distance: number): number =>
  soundLevel(power * s.powerFactor, distance * s.distanceFactor, s.referenceIntensity);

/** The slider values the candidate can set: a value of the select, or the slider's grid. */
export const nearestPower = (s: Settings, power: number): number =>
  s.powerInput === "select"
    ? s.powers.reduce((best, v) => (Math.abs(v - power) < Math.abs(best - power) ? v : best), s.powers[0])
    : snap(power, s.powerRange.min, s.powerRange.max, s.powerRange.step);
export const nearestDistance = (s: Settings, distance: number): number =>
  snap(distance, s.distanceRange.min, s.distanceRange.max, s.distanceRange.step);

/**
 * Answer mode with a target level: the value of the answer quantity that gives the target, with the other quantity at
 * its setting, as the candidate can set it (the nearest step of the slider, or the nearest choice of the select).
 * null when there is no target, in tool mode, or when the target lies outside what the candidate can set.
 */
export const correctValue = (s: Settings): number | null => {
  if (s.mode !== "answer" || s.targetLevel === null) return null;
  if (s.answer === "distance") {
    const exact = distanceForLevel(s.targetLevel, s.power * s.powerFactor, s.referenceIntensity) / s.distanceFactor;
    const { min, max, step } = s.distanceRange;
    if (exact < min - step / 2 || exact > max + step / 2) return null;
    return nearestDistance(s, exact);
  }
  const exact = powerForLevel(s.targetLevel, s.distance * s.distanceFactor, s.referenceIntensity) / s.powerFactor;
  const lo = s.powerInput === "select" ? s.powers[0] : s.powerRange.min;
  const hi = s.powerInput === "select" ? s.powers[s.powers.length - 1] : s.powerRange.max;
  if (exact < lo * 0.5 || exact > hi * 1.5) return null;
  return nearestPower(s, exact);
};
