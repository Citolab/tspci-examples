// The colour of a box is its delivery stop (Okabe–Ito, safe for colour blindness); the stop number is always written
// on the box as well, so the colour is never the only clue.
const STOPS = ["#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7"];
const NO_STOP = "#C9CED6";

export const stopColor = (stop: number | null) => (stop === null ? NO_STOP : STOPS[(stop - 1) % STOPS.length]);
/** Text on a box: white on the dark blue, else near black. */
export const stopInk = (stop: number | null) => (stop !== null && (stop - 1) % STOPS.length === 4 ? "#ffffff" : "#0f172a");
export const COG_INK = "#be185d";
