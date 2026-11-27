/*
 * The looks of the clocks: how a clock looks, not how it works. The author picks them in the authoring mode
 * (authoring.tsx), which writes the settings typeOfClock, skin, color, hands, shortHandColor, longHandColor and font:
 *
 * - skin: the design of the clock (its face, or the case of a digital clock)
 * - color: the colour of the rim of an analog clock, or of the case of a digital one
 * - hands: the shape of the hands of an analog clock
 * - shortHandColor, longHandColor: the colour of each of them
 * - font: the font of the numerals on the face, or of the digits on the display
 *
 * All but the skin are empty by default: the clock then has what belongs to its skin. A value the PCI does not
 * know (an old item, a typo) counts as empty, and an unknown skin is the classic one, so delivery never needs the
 * authoring mode.
 */
import type { JSX } from "preact";
import { HANDS, HandName } from "./hands";

export type ClockType = "analog" | "digital";
type Label = { en: string; nl: string };

// ---- colour

/** A colour the author picked, as "#rrggbb"; null for anything else (the clock keeps the colours of its skin). */
export function clockColor(value: unknown): string | null {
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value ?? "").trim())?.[1].toLowerCase();
  if (!hex) return null;
  return "#" + (hex.length === 3 ? hex.replace(/./g, "$&$&") : hex);
}

/** `color` mixed with `other` ("#rrggbb" both): amount 0 is the colour itself, 1 the other. For shadows and borders. */
export function mix(color: string, other: string, amount: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  const mixed = [0, 1, 2].map((i) => Math.round(channel(color, i) * (1 - amount) + channel(other, i) * amount));
  return "#" + mixed.map((c) => c.toString(16).padStart(2, "0")).join("");
}

/** The colours the authoring mode offers; the author can also pick any other one. */
export const COLORS = [
  { value: "#dc2626", label: { en: "Red", nl: "Rood" } },
  { value: "#ea580c", label: { en: "Orange", nl: "Oranje" } },
  { value: "#eab308", label: { en: "Yellow", nl: "Geel" } },
  { value: "#16a34a", label: { en: "Green", nl: "Groen" } },
  { value: "#2563eb", label: { en: "Blue", nl: "Blauw" } },
  { value: "#7c3aed", label: { en: "Purple", nl: "Paars" } },
  { value: "#db2777", label: { en: "Pink", nl: "Roze" } },
  { value: "#111827", label: { en: "Black", nl: "Zwart" } },
] as const satisfies readonly { value: string; label: Label }[];

// ---- font: fonts every device has, so the PCI does not have to bring them along (they differ a little per device).
// Times and not Georgia for the serif: the digits of Georgia are not of one height, which reads badly on a clock.

export const FONTS = [
  { id: "sans", label: { en: "Sans-serif", nl: "Schreefloos" }, family: "Arial, Helvetica, sans-serif" },
  { id: "serif", label: { en: "Serif", nl: "Met schreef" }, family: "'Times New Roman', Times, serif" },
  { id: "mono", label: { en: "Monospace", nl: "Vaste breedte" }, family: "'Courier New', Courier, monospace" },
] as const satisfies readonly { id: string; label: Label; family: string }[];

export type FontId = (typeof FONTS)[number]["id"];

/** The font the author picked; null for the font of the skin. */
export const fontId = (id: unknown): FontId | null => FONTS.find((f) => f.id === id)?.id ?? null;

/** Its font family. */
export const clockFont = (id: unknown): string | null => FONTS.find((f) => f.id === id)?.family ?? null;

// ---- the hands of an analog clock

export const HAND_STYLES = [
  { id: "ornate", label: { en: "Ornate", nl: "Sierlijk" } }, // the images of the classic clock (hands.tsx)
  { id: "straight", label: { en: "Straight", nl: "Recht" } },
  { id: "pointed", label: { en: "Pointed", nl: "Puntig" } },
  { id: "arrow", label: { en: "Arrows", nl: "Pijlen" } },
] as const satisfies readonly { id: string; label: Label }[];

export type HandStyle = (typeof HAND_STYLES)[number]["id"];

/** The hands the author picked; null for the hands of the skin. */
export const handStyle = (id: unknown): HandStyle | null => HAND_STYLES.find((h) => h.id === id)?.id ?? null;

// ---- the skins

/** An analog skin: its face is drawn in this file (Face), these are its own hands. */
type AnalogSkin = {
  id: string;
  label: Label;
  hands: HandStyle;
  /** the colours of drawn hands (the ornate hands are images, with their own colour, unless the author picks one) */
  handColors: Record<HandName, string>;
};

export const ANALOG_SKINS = [
  { id: "classic", label: { en: "Classic", nl: "Klassiek" }, hands: "ornate", handColors: { short: "#3b3b3d", long: "#3b3b3d" } },
  // blue hours and red minutes, on the face and on the hands
  { id: "learning", label: { en: "Learning clock", nl: "Leerklok" }, hands: "straight", handColors: { short: "#1d4ed8", long: "#dc2626" } },
  { id: "roman", label: { en: "Roman numerals", nl: "Romeinse cijfers" }, hands: "pointed", handColors: { short: "#3f2d1e", long: "#3f2d1e" } },
] as const satisfies readonly AnalogSkin[];

/** A digital skin: the case around the display and the colours of the digits and the arrows. */
export type DigitalSkin = {
  id: string;
  label: Label;
  /** the case and the screen; "classic" is a picture of a clock radio (img/digitalface.png, or ClockRadio in a colour) */
  frame: "image" | string;
  screen: string;
  /** the styles that give the case the colour the author picked (not for the picture, which is drawn in that colour) */
  tint?: (color: string) => JSX.CSSProperties;
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
    tint: (color) => ({
      backgroundColor: color,
      borderColor: mix(color, "#ffffff", 0.35),
      boxShadow: `0 0.4em 0 ${mix(color, "#000000", 0.45)}`,
    }),
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
    tint: (color) => ({ backgroundColor: color, borderColor: mix(color, "#000000", 0.25) }),
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

/** The settings that decide how a clock looks; each arrives as a string, or not at all. */
export type LookSettings = {
  skin?: unknown;
  color?: unknown;
  hands?: unknown;
  shortHandColor?: unknown;
  longHandColor?: unknown;
  font?: unknown;
};

/**
 * How an analog clock looks, from its settings. `picture`: the classic clock as it comes is a picture (img/clockface.png);
 * in a colour or a font of the author's it is drawn instead, as the other skins always are. `handColors`: the colour of
 * each hand, the author's or the skin's; `ownHandColors`: only the author's (null: an ornate hand stays its image).
 */
export function analogLook(settings: LookSettings) {
  const skin = ANALOG_SKINS.find((s) => s.id === settings.skin) ?? ANALOG_SKINS[0];
  const color = clockColor(settings.color);
  const font = clockFont(settings.font);
  const ownHandColors = { short: clockColor(settings.shortHandColor), long: clockColor(settings.longHandColor) };
  return {
    skin: skin.id as AnalogSkinId,
    color,
    font,
    hands: handStyle(settings.hands) ?? skin.hands,
    handColors: { short: ownHandColors.short ?? skin.handColors.short, long: ownHandColors.long ?? skin.handColors.long },
    ownHandColors,
    picture: skin.id === "classic" && !color && !font,
  };
}

// ---- the drawn analog clock: an SVG of 200 by 200 with the centre at 0,0, so a hand of reach r is r * 200 long
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

/** What the author may change on a face: the colour of its rim and the font of its numerals (null: the skin's own). */
type FaceProps = { color: string | null; font: string | null };

/** A numeral on the face, centred on its point. */
const Numeral = ({ p, children, ...rest }: { p: { x: number; y: number }; children: string | number } & JSX.SVGAttributes<SVGTextElement>) => (
  <text x={p.x} y={p.y} text-anchor="middle" dominant-baseline="central" {...rest}>
    {children}
  </text>
);

/**
 * The classic clock, drawn after its picture (img/clockface.png): a heavy black rim, a tick for every minute and bold,
 * narrow numerals. Used when the author gave it a colour or a font, which a picture cannot take.
 */
function ClassicFace({ color, font }: FaceProps) {
  return (
    <>
      <circle r="95.6" fill="#fff" stroke={color ?? "#000"} stroke-width="8.8" />
      {MINUTES.map((m) =>
        m % 5 ? (
          <Tick m={m} r1={90.4} r2={87.6} stroke="#000" stroke-width="0.8" />
        ) : (
          <Tick m={m} r1={91.4} r2={86.6} stroke="#000" stroke-width={m % 15 ? 2.4 : 3.4} />
        )
      )}
      {HOURS.map((h) => (
        <Numeral
          p={at(h * 30, 78.5)}
          fill="#000"
          font-size="17.5"
          font-weight="700"
          font-family={font ?? "'Arial Narrow', 'Roboto Condensed', 'Liberation Sans Narrow', Arial, sans-serif"}
          font-stretch={font ? undefined : "condensed"}
        >
          {h}
        </Numeral>
      ))}
      <circle r="4.3" fill="#000" />
    </>
  );
}

/**
 * A learning clock (leerklok): blue hours with a blue short hand, red minutes (5 to 60) in an outer ring with a red long
 * hand, so a student sees which hand reads which numbers. The same colours as the classic digital clock.
 */
function LearningFace({ color, font }: FaceProps) {
  return (
    <>
      <circle r="97" fill="#fff" stroke={color ?? "#1e293b"} stroke-width="4" />
      <circle r="94" fill="#fee2e2" />
      <circle r="76" fill="#fff" />
      {MINUTES.map((m) => (
        <Tick m={m} r1={76} r2={m % 5 ? 72 : 68} stroke={m % 5 ? "#f87171" : "#dc2626"} stroke-width={m % 5 ? 1 : 2} />
      ))}
      {HOURS.map((h) => (
        <Numeral p={at(h * 30, 85)} fill="#dc2626" font-size="10" font-weight="700" font-family={font ?? undefined}>
          {h * 5}
        </Numeral>
      ))}
      {HOURS.map((h) => (
        <Numeral p={at(h * 30, 54)} fill="#1d4ed8" font-size="19" font-weight="700" font-family={font ?? undefined}>
          {h}
        </Numeral>
      ))}
    </>
  );
}

/** An old station clock: Roman numerals on cream, in a dark wooden rim. */
function RomanFace({ color, font }: FaceProps) {
  return (
    <>
      <circle r="97" fill={color ?? "#3f2d1e"} />
      <circle r="91" fill="#fdf6e3" />
      <circle r="86" fill="none" stroke="#3f2d1e" stroke-width="0.8" />
      {MINUTES.map((m) => (
        <Tick m={m} r1={86} r2={m % 5 ? 82 : 76} stroke="#3f2d1e" stroke-width={m % 5 ? 0.8 : 2.4} />
      ))}
      {ROMAN.map((numeral, i) => (
        <Numeral p={at(i * 30, 63)} fill="#3f2d1e" font-size="15" font-family={font ?? "Georgia, 'Times New Roman', serif"}>
          {numeral}
        </Numeral>
      ))}
    </>
  );
}

const FACES: Record<AnalogSkinId, (props: FaceProps) => JSX.Element> = { classic: ClassicFace, learning: LearningFace, roman: RomanFace };

/** The face of an analog clock, drawn: it fills the clock's box. The hands lie over it (DrawnHands, or the images). */
export function DrawnFace({ skin, color, font }: { skin: AnalogSkinId } & FaceProps) {
  const Face = FACES[skin];
  return (
    <svg className="block w-full h-full select-none" viewBox="-100 -100 200 200" aria-hidden="true">
      <Face color={color} font={font} />
    </svg>
  );
}

/** One drawn hand, pointing up (to 12); the short hand is the heavier one. Each has a short tail past the centre. */
function DrawnHand({ name, style, color }: { name: HandName; style: Exclude<HandStyle, "ornate">; color: string }) {
  const l = len(name);
  const short = name === "short";
  const tail = short ? 10 : 14;
  if (style === "straight") {
    return <line y1={tail} y2={-l} stroke={color} stroke-width={short ? 8 : 4.5} stroke-linecap="round" />;
  }
  if (style === "pointed") {
    const [w, tip, base] = short ? [5, 2.2, 7] : [3.5, 1.4, 8]; // half the width at the tail and where the point starts
    return <polygon fill={color} points={`${-w},${tail + 2} ${w},${tail + 2} ${tip},${-l + base} 0,${-l} ${-tip},${-l + base}`} />;
  }
  const [width, head, headLength] = short ? [6, 8, 14] : [3.6, 6, 13]; // the shaft, and half the width and the length of the head
  return (
    <>
      <line y1={tail} y2={-l + headLength - 1} stroke={color} stroke-width={width} stroke-linecap="round" />
      <polygon fill={color} points={`0,${-l} ${head},${-l + headLength} ${-head},${-l + headLength}`} />
    </>
  );
}

/** The pivot that holds drawn hands, in the style of the skin. */
function Pivot({ skin }: { skin: AnalogSkinId }) {
  if (skin === "roman") return <circle r="5.5" fill="#b8860b" stroke="#3f2d1e" stroke-width="1" />; // brass
  return <circle r={skin === "learning" ? 6 : 5} fill={skin === "learning" ? "#1e293b" : "#1f1f21"} />;
}

/**
 * Drawn hands over the face of an analog clock: the short hand first, then the long one, each rotated from 12 o'clock.
 * They do not take the pointer: the face does (analogClock.tsx).
 */
export function DrawnHands({ skin, style, colors, angles }: {
  skin: AnalogSkinId;
  style: Exclude<HandStyle, "ornate">;
  colors: Record<HandName, string>;
  angles: Record<HandName, number>;
}) {
  return (
    <svg className="absolute inset-0 block w-full h-full pointer-events-none select-none" viewBox="-100 -100 200 200" aria-hidden="true">
      {(["short", "long"] as const).map((name) => (
        <g data-hand={name} transform={`rotate(${angles[name]})`}>
          <DrawnHand name={name} style={style} color={colors[name]} />
        </g>
      ))}
      <Pivot skin={skin} />
    </svg>
  );
}

/**
 * The classic digital clock in a colour of the author's: the clock radio of the picture (img/digitalface.png, the same
 * size), drawn, with its case in that colour.
 */
export function ClockRadio({ color }: { color: string }) {
  const dark = mix(color, "#000000", 0.25);
  return (
    <svg className="block" width="424" height="235" viewBox="0 0 424 235" aria-hidden="true">
      <rect x="303" y="23" width="34" height="10" rx="2" fill={dark} />
      <rect x="70" y="186" width="63" height="12" rx="2" fill={dark} />
      <rect x="290" y="186" width="62" height="12" rx="2" fill={dark} />
      <rect x="30" y="28" width="362" height="160" rx="14" fill={color} />
      <rect x="37" y="35" width="348" height="146" rx="10" fill="#0b0b0b" />
    </svg>
  );
}
