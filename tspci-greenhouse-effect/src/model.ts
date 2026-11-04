// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/EffetDeSerrepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The one-layer atmosphere model (the textbook "single-layer" or "glass-roof" model), in steady state. No imports:
// `npm test` runs it in node.
//
// Per square metre of the Earth, averaged over day and night: the sunlight that comes in is S/4. A share a (the
// albedo) is reflected to space. Of the rest, an author-set share is absorbed by the atmosphere (Fa); the surface
// absorbs the remainder (Fs). The surface radiates infrared σTs⁴. The atmosphere is one layer that absorbs a share ε
// of that infrared (ε: its infrared absorptivity, set by the amount of greenhouse gas) and, as a grey body with the
// same emissivity ε, radiates εσTa⁴ up to space and the same down to the surface.
//
//   surface:     Fs + εσTa⁴ = σTs⁴
//   atmosphere:  Fa + εσTs⁴ = 2εσTa⁴
//   ⇒            σTs⁴ = (Fs + Fa/2) / (1 − ε/2)
//
// With Fa = 0 this is the classic Ts = [S(1−a)/4 / (σ(1−ε/2))]^¼: −18.6 °C without greenhouse gas (ε = 0),
// 15.0 °C at ε = 0.78, 29.6 °C at ε = 1 (S = 1361 W/m², a = 0.30).

/** Stefan–Boltzmann constant, W/(m²·K⁴). */
export const SIGMA = 5.670374419e-8;
export const KELVIN = 273.15;

export type ModelInput = {
  /** Solar constant S, W/m². */
  solarConstant: number;
  /** Albedo a, 0 … 1. */
  albedo: number;
  /** Share of the incoming sunlight the atmosphere absorbs, 0 … 1 − a. */
  atmosphereSolar: number;
};

/** The energy flows, W/m², and the temperatures, K. */
export type Flows = {
  /** Sunlight at the top of the atmosphere, S/4. */
  incoming: number;
  /** Reflected to space by clouds, air and surface. */
  reflected: number;
  /** Sunlight absorbed by the atmosphere. */
  solarAtmosphere: number;
  /** Sunlight absorbed at the surface. */
  solarSurface: number;
  /** Infrared the surface radiates, σTs⁴. */
  surfaceInfrared: number;
  /** The part of that the atmosphere absorbs, εσTs⁴. */
  absorbedInfrared: number;
  /** The part that goes straight through to space, (1−ε)σTs⁴. */
  window: number;
  /** Infrared the atmosphere radiates up to space, εσTa⁴. */
  atmosphereUp: number;
  /** Infrared the atmosphere radiates down to the surface, εσTa⁴: the greenhouse effect. */
  backRadiation: number;
  /** Surface temperature, K. */
  surfaceTemperature: number;
  /** Temperature of the atmosphere layer, K (NaN when ε = 0: a layer that does not radiate has none). */
  atmosphereTemperature: number;
};

/** The steady state for an infrared absorptivity ε (0 … 1). */
export const flows = (m: ModelInput, epsilon: number): Flows => {
  const e = Math.min(1, Math.max(0, epsilon));
  const incoming = m.solarConstant / 4;
  const reflected = m.albedo * incoming;
  const solarAtmosphere = Math.min(m.atmosphereSolar, 1 - m.albedo) * incoming;
  const solarSurface = incoming - reflected - solarAtmosphere;
  const surfaceInfrared = (solarSurface + solarAtmosphere / 2) / (1 - e / 2);
  const absorbedInfrared = e * surfaceInfrared;
  const atmosphereUp = (solarAtmosphere + absorbedInfrared) / 2;
  return {
    incoming,
    reflected,
    solarAtmosphere,
    solarSurface,
    surfaceInfrared,
    absorbedInfrared,
    window: surfaceInfrared - absorbedInfrared,
    atmosphereUp,
    backRadiation: atmosphereUp,
    surfaceTemperature: Math.pow(surfaceInfrared / SIGMA, 0.25),
    atmosphereTemperature: e > 0 ? Math.pow(atmosphereUp / (e * SIGMA), 0.25) : NaN,
  };
};

/** Surface temperature in °C for a greenhouse gas level (0 … 100: ε in percent). */
export const temperatureAt = (m: ModelInput, level: number): number => flows(m, level / 100).surfaceTemperature - KELVIN;

/** A value rounded to a number of decimals (as shown and as in the response). */
export const roundTo = (value: number, decimals: number) => {
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
};

/** The levels the slider can set: min, min + step, … up to 100. */
export const levels = (step: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i * step <= 100 + 1e-9; i++) out.push(roundTo(i * step, 6));
  return out;
};

/** A level on the slider: the nearest step, 0 … 100. */
export const snapLevel = (level: number, step: number): number => {
  const clamped = Math.min(100, Math.max(0, level));
  const snapped = roundTo(Math.round(clamped / step) * step, 6);
  return snapped > 100 ? roundTo(snapped - step, 6) : snapped;
};

/** The level on the slider whose temperature (rounded as shown) is closest to a target in °C. */
export const levelFor = (m: ModelInput, target: number, step: number, decimals: number): number =>
  levels(step).reduce((best, l) =>
    Math.abs(roundTo(temperatureAt(m, l), decimals) - target) < Math.abs(roundTo(temperatureAt(m, best), decimals) - target) ? l : best
  );

/** Is a temperature (as shown) within the tolerance of the target? */
export const onTarget = (temperature: number, target: number, tolerance: number) => Math.abs(temperature - target) <= tolerance + 1e-9;
