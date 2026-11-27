/*
 * A Portable Custom Interaction (PCI) with Preact, Tailwind and a store: personal protective equipment (persoonlijke
 * beschermingsmiddelen, PBM), for VCA safety training and praktijkonderwijs.
 *
 * The delivery engine (the player) loads this bundle, which registers a factory with qtiCustomInteractionContext.
 * For every interaction in an item the engine calls factory.getInstance(dom, config, state); the instance renders
 * into `dom` and reports its answer through getResponse().
 *
 * This file is the PCI API; interaction.tsx is the UI, store.ts the state, equipment.ts the items, the jobs, the
 * response and the correct response (without imports, tested in node), drawings.tsx the worker, the items and the
 * mandatory signs, texts.ts the texts in English and Dutch, authoring.tsx the authoring mode for an own job.
 * The response is a record (config.tspci.response in package.json, AUTHORING.md): required, requiredTotal, wrong,
 * correct and items; with explain also reasons, reasonsRight and reasonsCorrect. Nothing until the worker wears something.
 */
import "preact/debug"; // readable warnings in the browser console while developing
import { render } from "preact";
import { Action, IStore, Listener } from "@citolab/preact-store";
import {
  ConfigProperties, IMSpci, IMSpciAuthoringFactory, IMSpciFactory, PciAuthoringConfiguration, PciAuthoringInstance, PciProperties,
  QtiInteractionChangedDetail, QtiVariableJSON,
} from "@citolab/tspci";
import * as ctx from "qtiCustomInteractionContext"; // provided by the delivery engine at runtime
import configProps from "./config.json"; // the settings; the build passes only their defaults (AUTHORING.md)
import style from "./styles.css"; // Tailwind, compiled to a string, added to the shadow root below
import Interaction from "./interaction";
import { Job, correctDressing, correctFor, jobFrom, readResponse, responseFor, workerSetting } from "./equipment";
import { Actions, StateModel, initStore, isState } from "./store";
import { languageOf } from "./texts";
import { Authored, Authoring, authoredFrom, authoredProblems, authoredProperties } from "./authoring";

// Like every data- attribute, each setting arrives as a string.
type PropTypes = PciProperties<typeof configProps>;

/** What getState() saves: the state and the actions that led to it. */
type PciStoredState = { state: StateModel; log: Action<unknown>[] };

const withDefaults = (properties: Partial<PropTypes>) => ({ ...(configProps as unknown as PropTypes), ...properties });

class PciInstance implements IMSpci<PropTypes> {
  typeIdentifier = "protectiveEquipment";
  private config: ConfigProperties<PropTypes>;
  private dom: HTMLElement;
  private shadowdom: ShadowRoot;
  private job: Job;
  private explain: boolean;
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

    // 0. The job from the settings: a preset or the author's own.
    this.job = jobFrom(config.properties);
    this.explain = config.properties.explain === "true";
    const worker = workerSetting(config.properties.worker);
    this.store = initStore(worker === "choice" ? 1 : worker);
    // 1. The state from a previous session (whatever getState() returned) wins over the settings.
    if (stateString) {
      try {
        const { state, log } = JSON.parse(stateString) as PciStoredState;
        if (isState(state) && Array.isArray(log)) this.store.restoreState(state, log);
      } catch {
        // not ours: start empty
      }
    }
    // 2. A response the engine binds to the interaction (boundTo) wins over the state.
    const boundTo = config.boundTo ?? {};
    const bound = boundTo[config.responseIdentifier] ?? (Object.keys(boundTo).length === 1 ? Object.values(boundTo)[0] : undefined);
    if (bound) this.setResponse(bound);
    // 3. Status "solution": show the correct response of the item instead (AUTHORING.md, "Correct answers").
    if (config.status === "solution") this.showCorrectResponse();

    // From here on, tell the engine when anything changes.
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
    const readOnly = ["review", "solution", "closed"].includes(this.config.status ?? "interacting");
    render(
      <>
        <style>{style}</style>
        <Interaction config={this.config.properties} job={this.job} store={this.store} readOnly={readOnly} />
      </>,
      this.shadowdom
    );
  };

  /** Dress the worker as a response says (the items, and the reasons where it has them). Only a change is an action. */
  private show = (value: unknown) => {
    const read = readResponse(value);
    if (!read) return;
    const state = this.store.getState();
    if (JSON.stringify(read) !== JSON.stringify({ worn: state.worn, reasons: state.reasons }))
      this.store.dispatch({ type: "SET_DRESSING", payload: read });
  };

  /**
   * Show the correct response the item declares (status "solution"). Without one, or one without items (an item
   * scored with a rule on correct): a correct dressing from the settings.
   */
  showCorrectResponse = () => {
    const declared = this.config.responseDeclaration?.correctResponse?.value;
    if (declared !== undefined && readResponse(declared)) return this.show(declared);
    const { worn, reasons } = correctDressing(this.job);
    this.show(responseFor(this.job, worn, reasons, true));
  };

  // ---- the IMS PCI API ----

  getResponse = () => {
    const { worn, reasons } = this.store.getState();
    return responseFor(this.job, worn, reasons, this.explain) as QtiVariableJSON | undefined;
  };

  getState = () => JSON.stringify({ state: this.store.getState(), log: this.store.getActions() } satisfies PciStoredState);

  setResponse = (response: QtiVariableJSON) => this.show(response);

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

const factory: IMSpciAuthoringFactory<PropTypes> = {
  typeIdentifier: "protectiveEquipment", // the same as config.tspci.typeIdentifier in package.json
  getInstance: (dom, config, state) => new PciInstance(dom, config, state),
  // Only when the job has one correct answer: no alternatives, nothing allowed (equipment.ts correctFor).
  getCorrectResponse: (properties) => {
    const settings = withDefaults(properties);
    return correctFor(jobFrom(settings), settings.explain === "true") as QtiVariableJSON | undefined;
  },

  /**
   * The authoring mode (AUTHORING.md, section 6): the author starts from a preset job or writes an own one, and sets
   * per item required, allowed or not needed (authoring.tsx). It writes the settings job and customJob. A player never
   * calls it.
   */
  getAuthoringInstance: (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = withDefaults(config.properties ?? {});
    let authored: Authored = authoredFrom(properties);
    const language = languageOf(config.language); // the author's language
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    render(
      <>
        <style>{style}</style>
        <Authoring
          initial={authored}
          properties={properties}
          language={language}
          onChange={(next) => {
            authored = next;
            config.onchange?.();
          }}
        />
      </>,
      shadow
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => authoredProperties(authored, properties.language),
      validate: () => authoredProblems(authored, properties, language),
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
