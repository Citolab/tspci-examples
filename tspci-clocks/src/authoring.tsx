/*
 * The authoring mode (index.tsx getAuthoringInstance): the item author picks the clock, analog or digital, and its skin.
 * Every choice shows the real clock with the item's own settings (initial time, type of question), so the author sees
 * what the student will see. It writes the settings typeOfClock and skin.
 */
import type { PciProperties } from "@citolab/tspci";
import { useMemo, useState } from "preact/hooks";
import configProps from "./config.json";
import { AnalogClock } from "./analogClock";
import { DigitalClock } from "./digitalClock";
import { ANALOG_SKINS, ClockType, DIGITAL_SKINS } from "./skins";
import { initStore } from "./store";

type PropTypes = PciProperties<typeof configProps>;

export type Choice = { typeOfClock: ClockType; skin: string };

const TEXTS = {
  en: { title: "Choose the clock", intro: "Pick the clock the student sees. It shows the initial time of the item.", analog: "Analog", digital: "Digital" },
  nl: { title: "Klok kiezen", intro: "Kies de klok die de leerling ziet. Hij staat op de begintijd van het item.", analog: "Analoog", digital: "Digitaal" },
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
  const choose = (next: Choice) => {
    setChoice(next);
    onChange(next);
  };

  const section = (type: ClockType, skins: readonly { id: string; label: { en: string; nl: string } }[]) => (
    <section className="mt-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t[type]}</h3>
      <div className="mt-2 grid grid-cols-3 gap-3">
        {skins.map((skin) => (
          <SkinCard
            key={`${type}-${skin.id}`}
            properties={properties}
            choice={{ typeOfClock: type, skin: skin.id }}
            label={skin.label[language]}
            selected={choice.typeOfClock === type && choice.skin === skin.id}
            onSelect={choose}
          />
        ))}
      </div>
    </section>
  );

  return (
    <div className="p-5 font-sans text-slate-900">
      <h2 className="text-xl font-semibold tracking-tight">{t.title}</h2>
      <p className="text-slate-600">{t.intro}</p>
      {section("analog", ANALOG_SKINS)}
      {section("digital", DIGITAL_SKINS)}
    </div>
  );
}

/** One choice: the clock in this skin, scaled down, and its name. */
function SkinCard({ properties, choice, label, selected, onSelect }: {
  properties: PropTypes;
  choice: Choice;
  label: string;
  selected: boolean;
  onSelect: (choice: Choice) => void;
}) {
  const store = useMemo(() => initStore(), []); // the clock is not set here: it shows the initial time
  const config = { ...properties, ...choice } as PropTypes;
  const Clock = choice.typeOfClock === "analog" ? AnalogClock : DigitalClock;
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      onClick={() => onSelect(choice)}
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
