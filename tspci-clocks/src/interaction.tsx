import type { PciProperties } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";
import configProps from "./config.json";
import { AnalogClock } from "./analogClock";
import { Actions, StateModel } from "./store";
import { DigitalClock } from "./digitalClock";
// Images are bundled too: `import logo from "./assets/logo.png"` gives a data URL for <img src={logo} />. Larger media
// (video, sound): declare them in config.tspci.media and use `media(name, dom)` from "@citolab/tspci/media" (readme, "Media").

type PropTypes = PciProperties<typeof configProps>;

type Props = {
  config: PropTypes;
  store: IStore<StateModel, Actions>;
  readOnly: boolean; // review, solution, closed: show the answer, but do not change it
};

/** The interaction itself: Tailwind classes only, styles.css just loads Tailwind (into the shadow root). */
const Interaction = ({ config, store, readOnly }: Props) => {
  // typeOfClock (analog / digital) decides which clock; typeOfQuestion what the student does with it: set it (setClock),
  // or only read it (askTime). When it is only read, the answer is given elsewhere in the item, e.g. in a
  // qti-text-entry-interaction: the clock then stands in for an image, without a field of its own.

  return (
    <div>
      {config.title && <h2 className="text-xl font-semibold tracking-tight">{config.title}</h2>}
      {config.question && <p className="text-slate-600">{config.question}</p>}
      {/* A column with its children centred: mx-auto on a div without a width does nothing (it is already full width). */}
      <div className="my-[5em] flex flex-col items-center">
        {config.typeOfClock === "analog"
          ? <AnalogClock config={config} store={store} readOnly={readOnly} />
          : <DigitalClock config={config} store={store} readOnly={readOnly}></DigitalClock>
        }
      </div>
    </div>
  );

};

export default Interaction;
