import type { PciProperties } from "@citolab/tspci";
import { IStore, useStore } from "@citolab/preact-store";
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
  // typeOfClock (analog / digital) decides which clock; typeOfQuestion (askTime / setClock) what the student does.

  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">{config.title}</h2>
      <p className="text-slate-600">{config.question}</p>
      {/* A column with its children centred: mx-auto on a div without a width does nothing (it is already full width). */}
      <div className="my-[5em] flex flex-col items-center">
        {config.typeOfClock === "analog"
          ? <AnalogClock config={config} store={store} readOnly={readOnly} />
          : <DigitalClock config={config} store={store} readOnly={readOnly}></DigitalClock>
        }
        <TextAnswer config={config} store={store} readOnly={readOnly}></TextAnswer>
      </div>
    </div>
  );

};

const TextAnswer = ({ config, store, readOnly }: Props) => {
  // The text in the store (re-renders when it changes), so a restored session shows the answer again.
  const state = useStore(store);
  if (config.typeOfQuestion !== "askTime") return null;
  return (
    // Students write the answer in words: "ten past four", "six o'clock" (in Dutch: "half zeven", "kwart over drie").
    // onInput and not onKeyUp: it also fires on paste, drag and drop, and the suggestions of a touch keyboard.
    <input
      type="text"
      value={state.value}
      readOnly={readOnly}
      onInput={(event) => store.dispatch({ type: "SET_VALUE", payload: { value: event.currentTarget.value } })}
      className="border-1 w-[20em] mt-[2em]"
    />
  );
};

export default Interaction;
