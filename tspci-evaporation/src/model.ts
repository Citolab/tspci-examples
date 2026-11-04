// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/MaraisSalantpci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The evaporation model: a simple, documented model for a school experiment, not a weather model. No imports: `npm test`
// runs it in node.
//
// A container is a rectangular tray, `width` cm wide and DEPTH cm from front to back, so the water surface is
// A = width × DEPTH cm². Water evaporates at a constant rate (mL per hour):
//
//   rate = K × A × f(T) × (wind ? WIND_FACTOR : 1)
//
// f(T) is the saturation vapour pressure of water at T (Magnus formula) relative to that at 20 °C: warm water
// evaporates much faster (f(60 °C) ≈ 8.5). The rate does not depend on the volume, nor on the salt (simplified). The
// salt stays behind: its mass is salt × volume; it crystallizes once the remaining water cannot hold it any more,
// that is when the volume drops under mass / SATURATION (NaCl: about 360 g per litre of water).

/** What the candidate (or the author) sets for one container. */
export type Container = {
  /** °C */
  temperature: number;
  /** cm; the surface is width × DEPTH */
  width: number;
  wind: boolean;
  /** g/L at the start */
  salt: number;
  /** mL at the start */
  volume: number;
};

export const VARIABLES = ["temperature", "area", "wind", "salt", "volume"] as const;
export type Variable = (typeof VARIABLES)[number];

/** cm from the front to the back of every container. */
export const DEPTH = 10;
/** mL per hour per cm² of surface at 20 °C without wind (0.5 mm of water per hour). */
export const K = 0.05;
/** Wind blows the damp air away: this many times faster. */
export const WIND_FACTOR = 2;
/** g of salt (NaCl) a litre of water can hold. */
export const SATURATION = 360;

/** Saturation vapour pressure of water in hPa (Magnus formula, over water). */
export const vapourPressure = (t: number) => 6.112 * Math.exp((17.62 * t) / (243.12 + t));
/** How much faster water evaporates at t °C than at 20 °C. */
export const temperatureFactor = (t: number) => vapourPressure(t) / vapourPressure(20);

export const area = (c: Container) => c.width * DEPTH;
/** mL per hour. */
export const rateOf = (c: Container) => K * area(c) * temperatureFactor(c.temperature) * (c.wind ? WIND_FACTOR : 1);

/** mL of water after t hours. */
export const volumeAt = (c: Container, t: number) => Math.max(0, c.volume - rateOf(c) * Math.max(0, t));
/** Height of the water in cm after t hours. */
export const levelAt = (c: Container, t: number) => volumeAt(c, t) / area(c);
/** Hours until the container is dry. */
export const dryTime = (c: Container) => (c.volume <= 0 ? 0 : c.volume / rateOf(c));
/** g of salt in the container. */
export const saltMass = (c: Container) => (c.salt * c.volume) / 1000;
/** Hours until salt crystals appear; null without salt. */
export const crystalTime = (c: Container): number | null => {
  const mass = saltMass(c);
  if (mass <= 0) return null;
  const saturatedVolume = (mass / SATURATION) * 1000; // mL
  return Math.max(0, (c.volume - saturatedVolume) / rateOf(c));
};
/** g of salt crystals after t hours: what the remaining water cannot hold. */
export const crystalsAt = (c: Container, t: number) => {
  const mass = saltMass(c);
  return Math.max(0, mass - (SATURATION * volumeAt(c, t)) / 1000);
};

/** What a run shows of a container after `t` hours. */
export type Result = {
  /** hours until dry, when within the run; null: still water at the end */
  dryAfter: number | null;
  /** hours until the first salt crystals, when within the run; null: none */
  crystalsFrom: number | null;
  /** mL left after t hours */
  volumeLeft: number;
  /** g of crystals after t hours */
  crystals: number;
};

const round = (value: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};

export const resultAt = (c: Container, t: number): Result => {
  const dry = dryTime(c);
  const crystals = crystalTime(c);
  return {
    dryAfter: dry <= t + 1e-9 ? round(dry, 1) : null,
    crystalsFrom: crystals !== null && crystals <= t + 1e-9 ? round(crystals, 1) : null,
    volumeLeft: round(volumeAt(c, t), 1),
    crystals: round(crystalsAt(c, t), 1),
  };
};

/** Hours until every container is dry. */
export const allDryTime = (containers: Container[]) => Math.max(0, ...containers.map(dryTime));

/** The value of a variable in a container (the area as the width it follows from). */
export const valueOf = (c: Container, v: Variable): number | boolean =>
  v === "area" ? c.width : v === "wind" ? c.wind : c[v];

/** The variables whose value is not the same in every container, in the order of VARIABLES. */
export const variedVariables = (containers: Container[]): Variable[] =>
  VARIABLES.filter((v) => containers.some((c) => valueOf(c, v) !== valueOf(containers[0], v)));

/**
 * A fair test: exactly one variable differs between the containers, and, with a target, that is the target. Every
 * other variable is the same in every container.
 */
export const isFairTest = (containers: Container[], target: Variable | null) => {
  const varied = variedVariables(containers);
  return varied.length === 1 && (target === null || varied[0] === target);
};
