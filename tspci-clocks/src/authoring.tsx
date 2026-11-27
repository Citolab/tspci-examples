/*
 * The authoring mode (index.tsx getAuthoringInstance): the item author picks the clock, analog or digital, its skin,
 * and if they like its colour, its hands and their colours, and its font. Every choice shows the real clock with the item's own settings (initial
 * time, type of question) and the look picked so far, so the author sees what the student will see. It writes the
 * settings typeOfClock, skin, color, hands, shortHandColor, longHandColor and font (skins.tsx).
 */
import type { ComponentChildren, JSX } from "preact";
import type { PciProperties } from "@citolab/tspci";
import { useMemo, useState } from "preact/hooks";
import configProps from "./config.json";
import { AnalogClock } from "./analogClock";
import { DigitalClock } from "./digitalClock";
import { ANALOG_SKINS, COLORS, ClockType, DIGITAL_SKINS, FONTS, HAND_STYLES, analogLook } from "./skins";
import { initStore } from "./store";

type PropTypes = PciProperties<typeof configProps>;

/** What the author picked. All but the clock and its skin are "" for what belongs to the skin. */
export type Choice = {
  typeOfClock: ClockType;
  skin: string;
  color: string;
  hands: string;
  shortHandColor: string;
  longHandColor: string;
  font: string;
};

const TEXTS = {
  en: {
    title: "Choose the clock",
    intro: "Pick the clock the student sees and, if you like, its colour, its hands and their colours, and its font. Every clock shows the initial time of the item.",
    analog: "Analog",
    digital: "Digital",
    color: "Colour",
    hands: "Hands",
    shortHandColor: "Short hand",
    longHandColor: "Long hand",
    font: "Font",
    own: "Of the clock",
    otherColor: "Other colour",
    noHands: "A digital clock has no hands.",
  },
  nl: {
    title: "Klok kiezen",
    intro: "Kies de klok die de leerling ziet en, als je wilt, de kleur, de wijzers met hun kleuren en het lettertype. Elke klok staat op de begintijd van het item.",
    analog: "Analoog",
    digital: "Digitaal",
    color: "Kleur",
    hands: "Wijzers",
    shortHandColor: "Kleine wijzer",
    longHandColor: "Grote wijzer",
    font: "Lettertype",
    own: "Van de klok",
    otherColor: "Andere kleur",
    noHands: "Een digitale klok heeft geen wijzers.",
  },
};

type Props = {
  properties: PropTypes;
  initial: Choice;
  language: "en" | "nl";
  onChange: (choice: Choice) => void;
};

export function Authoring({ properties, initial, language, onChange }: Props) {
  const [choice, setChoice] = useState(initial);
  const t = TEXTS[language];
  const choose = (change: Partial<Choice>) => {
    const next = { ...choice, ...change };
    setChoice(next);
    onChange(next);
  };

  const analog = choice.typeOfClock === "analog";
  const hands = analogLook(choice).hands; // the hands the clock has now: the author's, or those of its skin

  const section = (type: ClockType, skins: readonly { id: string; label: { en: string; nl: string } }[]) => (
    <section className="mt-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t[type]}</h3>
      <div className="mt-2 grid grid-cols-3 gap-3">
        {skins.map((skin) => (
          <SkinCard
            key={`${type}-${skin.id}`}
            properties={properties}
            choice={{ ...choice, typeOfClock: type, skin: skin.id }}
            label={skin.label[language]}
            selected={choice.typeOfClock === type && choice.skin === skin.id}
            onSelect={() => choose({ typeOfClock: type, skin: skin.id })}
          />
        ))}
      </div>
    </section>
  );

  return (
    <div className="p-5 font-sans text-slate-900">
      <h2 className="text-xl font-semibold tracking-tight">{t.title}</h2>
      <p className="text-slate-600">{t.intro}</p>

      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <Colors label={t.color} value={choice.color} onChange={(color) => choose({ color })} t={t} language={language} />
        <Options label={t.hands} note={analog ? undefined : t.noHands}>
          {HAND_STYLES.map((style) => (
            <Option key={style.id} label={style.label[language]} disabled={!analog} checked={analog && hands === style.id} onSelect={() => choose({ hands: style.id })} />
          ))}
        </Options>
        {(["shortHandColor", "longHandColor"] as const).map((hand) => (
          <Colors key={hand} label={t[hand]} value={choice[hand]} onChange={(color) => choose({ [hand]: color })} disabled={!analog} t={t} language={language} />
        ))}
        <Options label={t.font}>
          <Option label={t.own} checked={!choice.font} onSelect={() => choose({ font: "" })} />
          {FONTS.map((font) => (
            <Option key={font.id} label={font.label[language]} checked={choice.font === font.id} onSelect={() => choose({ font: font.id })} style={{ fontFamily: font.family }} />
          ))}
        </Options>
      </div>

      {section("analog", ANALOG_SKINS)}
      {section("digital", DIGITAL_SKINS)}
    </div>
  );
}

/** A row of colours: what belongs to the clock, the swatches, and any other colour with the colour picker of the browser. */
function Colors({ label, value, onChange, disabled, t, language }: {
  label: string;
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  t: (typeof TEXTS)["en"];
  language: "en" | "nl";
}) {
  const other = value !== "" && !COLORS.some((c) => c.value === value); // a colour that is not one of the swatches
  return (
    <Options label={label}>
      <Option label={t.own} disabled={disabled} checked={!disabled && !value} onSelect={() => onChange("")} />
      {COLORS.map((color) => (
        <Option key={color.value} label={color.label[language]} disabled={disabled} checked={!disabled && value === color.value} onSelect={() => onChange(color.value)} swatch>
          <span className="block h-5 w-5 rounded-full" style={{ backgroundColor: color.value }} />
        </Option>
      ))}
      <input
        type="color"
        aria-label={`${label}: ${t.otherColor}`}
        title={t.otherColor}
        disabled={disabled}
        value={value || "#2563eb"}
        onInput={(event) => onChange(event.currentTarget.value)}
        className={`h-8 w-10 cursor-pointer rounded-md border-2 bg-white p-0.5 disabled:cursor-default disabled:opacity-40 ${
          other && !disabled ? "border-blue-600 ring-2 ring-blue-200" : "border-slate-300"
        }`}
      />
    </Options>
  );
}

/** A row of options of which one is picked: a radio group with its name in front. */
function Options({ label, note, children }: { label: string; note?: string; children: ComponentChildren }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="w-[6.5em] shrink-0 text-sm font-semibold text-slate-600" aria-hidden="true">{label}</span>
      {children}
      {note && <span className="text-sm text-slate-500">{note}</span>}
    </div>
  );
}

/** One option of a row: its name, or (a swatch) only a colour, with the name for a screen reader and as a tooltip. */
function Option({ label, checked, onSelect, disabled, swatch, style, children }: {
  label: string;
  checked: boolean;
  onSelect: () => void;
  disabled?: boolean;
  swatch?: boolean;
  style?: JSX.CSSProperties;
  children?: ComponentChildren;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={label}
      title={swatch ? label : undefined}
      disabled={disabled}
      onClick={onSelect}
      style={style}
      className={`cursor-pointer border-2 bg-white text-sm transition-colors disabled:cursor-default disabled:opacity-40 ${
        swatch ? "rounded-full p-0.5" : "rounded-md px-2.5 py-1"
      } ${checked ? "border-blue-600 bg-blue-50 font-semibold text-blue-700 ring-2 ring-blue-200" : "border-slate-300 text-slate-700 hover:border-slate-500"}`}
    >
      {children ?? label}
    </button>
  );
}

/** One clock to pick: the clock in this skin and the look picked so far, scaled down, and the name of the skin. */
function SkinCard({ properties, choice, label, selected, onSelect }: {
  properties: PropTypes;
  choice: Choice;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const store = useMemo(() => initStore(), []); // the clock is not set here: it shows the initial time
  const config = { ...properties, ...choice } as PropTypes;
  const Clock = choice.typeOfClock === "analog" ? AnalogClock : DigitalClock;
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      onClick={onSelect}
      className={`flex flex-col items-center gap-2 rounded-xl border-2 bg-white p-3 cursor-pointer transition-colors ${
        selected ? "border-blue-600 bg-blue-50 ring-2 ring-blue-200" : "border-slate-200 hover:border-slate-400"
      }`}
    >
      {/* inert: the author picks the clock here, and does not set it; zoom scales the images with the em sizes */}
      <div inert aria-hidden="true" className="flex h-[340px] items-center justify-center" style={{ zoom: 0.58 }}>
        <Clock config={config} store={store} readOnly={false} />
      </div>
      <span className={`text-sm ${selected ? "font-semibold text-blue-700" : "text-slate-700"}`}>{label}</span>
    </button>
  );
}
