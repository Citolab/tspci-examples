// The sun for a setting of the task: solar.ts's formulas for the place the setting names. The two tested files stay
// import-free; this one joins them for the interaction.
import { dayAt, declination, localTime, solarTime, subsolarLongitude, sunPosition } from "./solar";
import { Setting, Setup, Values, controlled, placeById, valuesFor } from "./setup";

export const sunAt = (s: Setting, lat: number, lon: number) => ({
  declination: declination(s.day, s.minutes),
  subsolarLongitude: subsolarLongitude(s.day, s.minutes),
  solarTime: solarTime(s.day, s.minutes, lon),
  localTime: localTime(s.minutes, lon),
  position: sunPosition(s.day, s.minutes, lat, lon),
  day: dayAt(s.day, lat, lon),
});

/** The response's values for a setting; what the candidate does not control comes from the start. */
export const valuesOf = (setup: Setup, setting: Setting): Values | null => {
  const s = controlled(setup, setting);
  const place = placeById(setup, s.place);
  if (!place) return null;
  return valuesFor({ ...s, place: place.id }, place, sunAt(s, place.lat, place.lon));
};
