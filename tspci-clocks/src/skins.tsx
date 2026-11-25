/*
 * The skins of the clocks: how a clock looks, not how it works. The author picks one in the authoring mode
 * (authoring.tsx), which writes the settings typeOfClock and skin. A skin the PCI does not know (an old item, a typo)
 * is the classic one, so delivery never needs the authoring mode.
 */
import type { JSX } from "preact";
import { HANDS, HandName } from "./hands";

export type ClockType = "analog" | "digital";
type Label = { en: string; nl: string };

export const ANALOG_SKINS = [
  { id: "classic", label: { en: "Classic", nl: "Klassiek" } },
  { id: "learning", label: { en: "Learning clock", nl: "Leerklok" } },
  { id: "roman", label: { en: "Roman numerals", nl: "Romeinse cijfers" } },
] as const satisfies readonly { id: string; label: Label }[];

/** A digital skin: the case around the display and the colours of the digits and the arrows. */
export type DigitalSkin = {
  id: string;
  label: Label;
  /** the case and the screen; "classic" is the photo of a clock radio (img/digitalface.png) */
  frame: "image" | string;
  screen: string;
  /** text classes of the hours, the colon and the minutes; `set` while the student sets the clock */
  hour: { ask: string; set: string };
  colon: { ask: string; set: string };
  minute: string;
  /** the dim "88" behind the digits of an LCD screen, or none */
  ghost: string | null;
  /** the colour classes of the arrows of the hours and the minutes */
  hourArrow: string;
  minuteArrow: string;
};

export const DIGITAL_SKINS: readonly DigitalSkin[] = [
  {
    id: "classic",
    label: { en: "Classic", nl: "Klassiek" },
    frame: "image",
    screen: "",
    // blue hours and red minutes while the student sets them, as on the arrows
    hour: { ask: "text-red-500", set: "text-blue-500" },
    colon: { ask: "text-red-500", set: "text-white" },
    minute: "text-red-500",
    ghost: null,
    hourArrow: "text-blue-500 hover:text-blue-800",
    minuteArrow: "text-red-500 hover:text-red-800",
  },
  {
    id: "alarm",
    label: { en: "Alarm clock", nl: "Wekker" },
    frame: "rounded-[1.6em] bg-slate-800 p-[0.9em] shadow-[0_0.4em_0_#0f172a] border-[0.2em] border-slate-600",
    screen: "rounded-[0.8em] bg-black px-[1.2em] py-[0.6em]",
    hour: { ask: "text-emerald-400", set: "text-emerald-400" },
    colon: { ask: "text-emerald-400", set: "text-emerald-400" },
    minute: "text-emerald-400",
    ghost: "text-emerald-400/10",
    hourArrow: "text-emerald-400 hover:text-emerald-200",
    minuteArrow: "text-emerald-400 hover:text-emerald-200",
  },
  {
    id: "lcd",
    label: { en: "LCD screen", nl: "LCD-scherm" },
    frame: "rounded-[1em] bg-slate-300 p-[0.7em] border-[0.15em] border-slate-400",
    screen: "rounded-[0.4em] bg-[#b9c4a0] px-[1.2em] py-[0.5em] shadow-[inset_0_0.15em_0.3em_rgba(0,0,0,0.35)]",
    hour: { ask: "text-slate-900", set: "text-slate-900" },
    colon: { ask: "text-slate-900", set: "text-slate-900" },
    minute: "text-slate-900",
    ghost: "text-slate-900/10",
    hourArrow: "text-slate-700 hover:text-black",
    minuteArrow: "text-slate-700 hover:text-black",
  },
];

export type AnalogSkinId = (typeof ANALOG_SKINS)[number]["id"];

export const clockType = (value: unknown): ClockType => (value === "digital" ? "digital" : "analog");

export const analogSkin = (id: unknown): AnalogSkinId =>
  ANALOG_SKINS.find((s) => s.id === id)?.id ?? "classic";

export const digitalSkin = (id: unknown): DigitalSkin => DIGITAL_SKINS.find((s) => s.id === id) ?? DIGITAL_SKINS[0];

// ---- the drawn analog skins: an SVG of 200 by 200 with the centre at 0,0, so a hand of reach r is r * 200 long
// (the same reach as the hand images, so pickHand grabs them the same way)

const len = (hand: HandName) => HANDS[hand].reach * 200;

/** A point at `angle` degrees clockwise from 12 and `r` from the centre. */
const at = (angle: number, r: number) => {
  const rad = (angle * Math.PI) / 180;
  return { x: r * Math.sin(rad), y: -r * Math.cos(rad) };
};

/** A tick line from radius r1 to r2 at minute m. */
const Tick = ({ m, r1, r2, ...rest }: { m: number; r1: number; r2: number } & JSX.SVGAttributes<SVGLineElement>) => {
  const a = at(m * 6, r1);
  const b = at(m * 6, r2);
  return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...rest} />;
};

const MINUTES = Array.from({ length: 60 }, (_, m) => m);
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const ROMAN = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];

/**
 * A learning clock (leerklok): blue hours with a blue short hand, red minutes (5 to 60) in an outer ring with a red long
 * hand, so a student sees which hand reads which numbers. The same colours as the classic digital clock.
 */
function LearningClock({ angles }: { angles: Record<HandName, number> }) {
  return (
    <>
      <circle r="97" fill="#fff" stroke="#1e293b" stroke-width="4" />
      <circle r="94" fill="#fee2e2" />
      <circle r="76" fill="#fff" />
      {MINUTES.map((m) => (
        <Tick m={m} r1={76} r2={m % 5 ? 72 : 68} stroke={m % 5 ? "#f87171" : "#dc2626"} stroke-width={m % 5 ? 1 : 2} />
      ))}
      {HOURS.map((h) => {
        const p = at(h * 30, 85);
        return (
          <text x={p.x} y={p.y} fill="#dc2626" font-size="10" font-weight="700" text-anchor="middle" dominant-baseline="central">
            {h * 5}
          </text>
        );
      })}
      {HOURS.map((h) => {
        const p = at(h * 30, 54);
        return (
          <text x={p.x} y={p.y} fill="#1d4ed8" font-size="19" font-weight="700" text-anchor="middle" dominant-baseline="central">
            {h}
          </text>
        );
      })}
      <g transform={`rotate(${angles.short})`}>
        <line y1="10" y2={-len("short")} stroke="#1d4ed8" stroke-width="8" stroke-linecap="round" />
      </g>
      <g transform={`rotate(${angles.long})`}>
        <line y1="14" y2={-len("long")} stroke="#dc2626" stroke-width="4.5" stroke-linecap="round" />
      </g>
      <circle r="6" fill="#1e293b" />
    </>
  );
}

/** An old station clock: Roman numerals on cream, dark tapered hands and a brass pivot. */
function RomanClock({ angles }: { angles: Record<HandName, number> }) {
  const s = len("short");
  const l = len("long");
  return (
    <>
      <circle r="97" fill="#3f2d1e" />
      <circle r="91" fill="#fdf6e3" />
      <circle r="86" fill="none" stroke="#3f2d1e" stroke-width="0.8" />
      {MINUTES.map((m) => (
        <Tick m={m} r1={86} r2={m % 5 ? 82 : 76} stroke="#3f2d1e" stroke-width={m % 5 ? 0.8 : 2.4} />
      ))}
      {ROMAN.map((numeral, i) => {
        const p = at(i * 30, 63);
        return (
          <text x={p.x} y={p.y} fill="#3f2d1e" font-size="15" font-family="Georgia, 'Times New Roman', serif" text-anchor="middle" dominant-baseline="central">
            {numeral}
          </text>
        );
      })}
      <polygon transform={`rotate(${angles.short})`} fill="#3f2d1e" points={`-5,12 5,12 2.2,${-s + 7} 0,${-s} -2.2,${-s + 7}`} />
      <polygon transform={`rotate(${angles.long})`} fill="#3f2d1e" points={`-3.5,16 3.5,16 1.4,${-l + 8} 0,${-l} -1.4,${-l + 8}`} />
      <circle r="5.5" fill="#b8860b" stroke="#3f2d1e" stroke-width="1" />
    </>
  );
}

/** A drawn analog skin: face and hands in one SVG, filling the clock's box. */
export function DrawnClock({ skin, angles }: { skin: Exclude<AnalogSkinId, "classic">; angles: Record<HandName, number> }) {
  return (
    <svg className="block w-full h-full select-none" viewBox="-100 -100 200 200" aria-hidden="true">
      {skin === "learning" ? <LearningClock angles={angles} /> : <RomanClock angles={angles} />}
    </svg>
  );
}
