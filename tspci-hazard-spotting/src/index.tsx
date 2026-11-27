/*
 * A Portable Custom Interaction (PCI) with Preact, Tailwind and a store.
 *
 * The delivery engine (the player) loads this bundle, which registers a factory with qtiCustomInteractionContext.
 * For every interaction in an item the engine calls factory.getInstance(dom, config, state); the instance renders
 * into `dom` and reports its answer through getResponse().
 *
 * This file is the PCI API; interaction.tsx is the UI, drawings.tsx the pictures, scenes.ts their spots and texts,
 * model.ts what the settings make of them, store.ts the state and hazards.ts the logic (hit testing, the marks, the
 * response). Hazard spotting (gevaren herkennen): the pupil taps every unsafe situation in a drawn workplace. The
 * response is a record (see config.tspci.response in package.json and AUTHORING.md): how many hazards were found, how
 * many there are, the marks on a safe spot, whether all were found without such marks, per hazard whether it was found,
 * and the marks.
 */
import "preact/debug"; // readable warnings in the browser console while developing
import { render } from "preact";
import { Action, IStore, Listener } from "@citolab/preact-store";
import {
  ConfigProperties, IMSpci, IMSpciAuthoringFactory, IMSpciFactory, PciAuthoringConfiguration, PciAuthoringInstance, PciProperties,
  QtiInteractionChangedDetail, QtiRecordItem, QtiVariableJSON,
} from "@citolab/tspci";
import * as ctx from "qtiCustomInteractionContext"; // provided by the delivery engine at runtime
import configProps from "./config.json"; // the settings; the build passes only their defaults (AUTHORING.md)
import style from "./styles.css"; // Tailwind, compiled to a string, added to the shadow root below
import Interaction, { Status } from "./interaction";
import { Authoring, Authored, authoredFrom, authoredProblems, authoredProperties } from "./authoring";
import { Field, Mark, correctMarks, marksIn, parseMarks, responseFields } from "./hazards";
import { Model, modelFrom } from "./model";
import { Actions, StateModel, initStore } from "./store";
import { languageOf } from "./texts";

// Like every data- attribute, each setting arrives as a string.
type PropTypes = PciProperties<typeof configProps>;

/** What getState() saves: the state and the actions that led to it. */
type PciStoredState = { state: StateModel; log: Action<unknown>[] };

const recordItem = ({ name, type, value }: Field): QtiRecordItem => ({ name, base: { [type]: value } as QtiRecordItem["base"] });

const withDefaults = (properties: Partial<PropTypes>) => ({ ...(configProps as unknown as PropTypes), ...properties });

/** The correct response for the settings: every hazard that counts marked, no mark on a safe spot. */
function correctResponse(properties: Partial<PropTypes>): QtiVariableJSON | undefined {
  const model = modelFrom(withDefaults(properties));
  if (!model.counted.length) return undefined; // nothing to find
  return { record: responseFields(correctMarks(model.spots), model.spots, model.penalty).map(recordItem) };
}

const sameMarks = (a: Mark[], b: Mark[]) => a.length === b.length && a.every((mark, i) => mark.x === b[i].x && mark.y === b[i].y && mark.on === b[i].on);

class PciInstance implements IMSpci<PropTypes> {
  typeIdentifier = "hazardSpotting";
  private config: ConfigProperties<PropTypes>;
  private dom: HTMLElement;
  private shadowdom: ShadowRoot;
  private model: Model;
  private store: IStore<StateModel, Actions>;
  private customValidity = "";

  constructor(dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString?: string) {
    if (!dom) throw new Error("No DOM Element provided");
    // The item's data- attributes override the defaults from config.json.
    config.properties = withDefaults(config.properties);
    this.dom = dom;
    this.config = config;
    // A closed shadow root keeps the item's CSS out and ours (Tailwind) in.
    this.shadowdom = dom.attachShadow({ mode: "closed" });

    // 0. The scene of the settings, no marks yet.
    this.model = modelFrom(config.properties);
    this.store = initStore({ layout: this.model.layout, marks: [] });
    // 1. The state from a previous session (whatever getState() returned) wins over the settings, if it is of this layout.
    if (stateString) {
      try {
        const { state, log } = JSON.parse(stateString) as PciStoredState;
        if (state?.layout === this.model.layout && Array.isArray(state.marks) && Array.isArray(log)) {
          const marks = state.marks.filter(isMark);
          this.store.restoreState({ layout: this.model.layout, marks }, log);
        }
      } catch {
        // not ours: start without marks
      }
    }
    // 2. A response the engine binds to the interaction (boundTo) wins over the state.
    const boundTo = config.boundTo ?? {};
    const bound = boundTo[config.responseIdentifier] ?? (Object.keys(boundTo).length === 1 ? Object.values(boundTo)[0] : undefined);
    if (bound) this.setResponse(bound);
    // 3. Status "solution": show the correct response of the item instead (AUTHORING.md, "Correct answers").
    if (config.status === "solution") this.showCorrectResponse();

    // From here on, tell the engine when the marks change.
    this.previousState = JSON.stringify(this.store.getState());
    this.unsubscribe = this.store.subscribe(this.onStoreChange);

    this.render();
    config.onready?.(this, this.getState());
  }

  private previousState: string;
  private unsubscribe = () => {};
  private onStoreChange: Listener<StateModel> = (state) => {
    const json = JSON.stringify(state);
    if (json === this.previousState) return; // subscribe() calls us right away, and an action may change nothing
    this.previousState = json;
    // composed lets the event cross the shadow root
    const detail: QtiInteractionChangedDetail = {
      interaction: this,
      responseIdentifier: this.config.responseIdentifier,
      valid: this.checkValidity(),
      value: this.getResponse(),
    };
    this.dom.dispatchEvent(new CustomEvent("qti-interaction-changed", { bubbles: true, composed: true, detail }));
  };

  private render = () => {
    const status = (["review", "solution", "closed"].includes(this.config.status ?? "") ? this.config.status : "interacting") as Status;
    const { title, question } = this.config.properties;
    render(
      <>
        <style>{style}</style>
        <Interaction model={this.model} store={this.store} status={status} title={title} question={question} />
      </>,
      this.shadowdom
    );
  };

  /** Put the marks of a response on the picture. Only a change is an action: keeps the log (and a replay) clean. */
  private show = (response: unknown) => {
    const text = marksIn(response);
    if (text === undefined) return;
    const marks = parseMarks(text, this.model.spots);
    if (!sameMarks(marks, this.store.getState().marks)) this.store.dispatch({ type: "SET_MARKS", payload: { marks } });
  };

  /**
   * Show the correct response the item declares (status "solution"). Without one, or one without marks (an item scored
   * with a rule on `found`), the PCI shows its own: a mark on every hazard that counts.
   */
  showCorrectResponse = () => {
    const correct = this.config.responseDeclaration?.correctResponse?.value;
    const text = marksIn(correct);
    if (text !== undefined && parseMarks(text, this.model.spots).length) return this.show(text);
    const marks = correctMarks(this.model.spots);
    if (!sameMarks(marks, this.store.getState().marks)) this.store.dispatch({ type: "SET_MARKS", payload: { marks } });
  };

  // ---- the IMS PCI API ----

  /** Undefined until the pupil placed a mark: nothing answered, nothing reported. */
  getResponse = (): QtiVariableJSON | undefined => {
    const { marks } = this.store.getState();
    if (!marks.length) return undefined;
    return { record: responseFields(marks, this.model.spots, this.model.penalty).map(recordItem) };
  };

  getState = () => JSON.stringify({ state: this.store.getState(), log: this.store.getActions() } satisfies PciStoredState);

  setResponse = (response: QtiVariableJSON) => this.show(response);

  // The picture has no form field: it is valid unless the engine gave it a message (setCustomValidity).
  checkValidity = () => this.customValidity === "";

  reportValidity = () => this.checkValidity();

  setCustomValidity = (message: string) => {
    this.customValidity = message ?? "";
  };

  getCustomValidity = () => this.customValidity;

  /** The engine is done with this instance: unsubscribe and unmount (which also runs the components' cleanups). */
  oncompleted = () => {
    this.unsubscribe();
    render(null, this.shadowdom);
  };
}

/** A mark of a saved state. */
const isMark = (mark: unknown): mark is Mark => {
  const m = mark as Mark;
  return !!m && Number.isFinite(m.x) && Number.isFinite(m.y) && (m.on === null || typeof m.on === "string");
};

const factory: IMSpciAuthoringFactory<PropTypes> = {
  typeIdentifier: "hazardSpotting", // the same as config.tspci.typeIdentifier in package.json
  getInstance: (dom, config, state) => new PciInstance(dom, config, state),
  // From the settings: every hazard that counts marked, no mark on a safe spot.
  getCorrectResponse: (properties) => correctResponse(properties),

  /**
   * The authoring mode (AUTHORING.md, section 6): the author picks the scene, which of its hazards count, and draws
   * areas of their own (authoring.tsx). It writes the settings scene, hazards and extraHazards. A player never calls it.
   */
  getAuthoringInstance: (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = withDefaults(config.properties) as PropTypes;
    let authored: Authored = authoredFrom(properties);
    const language = languageOf(config.language); // the author's language
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    render(
      <>
        <style>{style}</style>
        <Authoring
          initial={authored}
          language={language}
          pupilLanguage={languageOf(properties.language)}
          maxMarks={properties.maxMarks}
          onChange={(next) => {
            authored = next;
            config.onchange?.();
          }}
        />
      </>,
      shadow
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => authoredProperties(authored),
      validate: () => authoredProblems(authored, language),
      oncompleted: () => render(null, shadow),
    };
    config.onready?.(instance);
    return instance;
  },
};

// Register with the engine: as an AMD module (qtiCustomInteractionContext), or through the global some engines set.
type Context = { register: (factory: IMSpciFactory<PropTypes>) => void };
const engineContext = [ctx as unknown as Context, (globalThis as { qtiCustomInteractionContext?: Context }).qtiCustomInteractionContext].find(
  (c) => typeof c?.register === "function"
);
engineContext?.register(factory);

export default factory;
