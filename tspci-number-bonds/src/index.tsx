/*
 * A Portable Custom Interaction (PCI) with Preact, Tailwind and a store.
 *
 * The delivery engine (the player) loads this bundle, which registers a factory with qtiCustomInteractionContext.
 * For every interaction in an item the engine calls factory.getInstance(dom, config, state); the instance renders
 * into `dom` and reports its answer through getResponse().
 *
 * This file is the PCI API; interaction.tsx is the UI, drawings.tsx the house and the tree, store.ts the state and
 * bonds.ts the logic (the notation, the checks, the response). Number bonds (splitsen): a split house (splitshuis) or a
 * number bond tree (splitsboom) with boxes the author gives and boxes the pupil fills in. The response is a record (see
 * config.tspci.response in package.json and AUTHORING.md): whether everything adds up, how many rows or splits add up,
 * for all splits whether every split is there, the pupil's numbers, and per row or split whether it adds up.
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
import Interaction from "./interaction";
import { Authoring, Authored, authoredFrom, authoredProperties, authoredProblems } from "./authoring";
import {
  Field, Model, answered, exampleSolution, formatNumber, modelFrom, responseFields, serializeHouse, serializeTree, showNumber,
  startValues, textsFromNumbers, treeOf, houseOf, uniqueSolution,
} from "./bonds";
import { Actions, StateModel, initStore } from "./store";
import { languageOf } from "./texts";

// Like every data- attribute, each setting arrives as a string.
type PropTypes = PciProperties<typeof configProps>;

/** What getState() saves: the state and the actions that led to it. */
type PciStoredState = { state: StateModel; log: Action<unknown>[] };

/** The layout a state belongs to: the model, the task and the given boxes. */
const layoutKey = (model: Model) =>
  `${model.kind}/${model.task}/${model.kind === "house" ? serializeHouse(houseOf(model)) : serializeTree(treeOf(model))}`;

const recordItem = ({ name, type, value }: Field): QtiRecordItem => ({ name, base: { [type]: value } as QtiRecordItem["base"] });

/** The correct response for the settings: every check true and the numbers, when the layout has one answer. */
function correctResponse(properties: Partial<PropTypes>): QtiVariableJSON | undefined {
  const model = modelFrom({ ...(configProps as unknown as PropTypes), ...properties });
  const solution = uniqueSolution(model);
  if (!solution) return undefined;
  return { record: responseFields(model, solution.map(formatNumber)).map(recordItem) };
}

/** The `numbers` of a response (setResponse, boundTo) or a correct response (status "solution"): a record, or a string. */
function numbersIn(value: unknown): string | undefined {
  if (Array.isArray(value)) return numbersIn(value[0]);
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const { record, base } = value as { record?: { name: string }[]; base?: QtiVariableJSON["base"] };
    if (Array.isArray(record)) return numbersIn(record.find((field) => field.name === "numbers"));
    if (typeof base?.string === "string") return base.string;
  }
  return undefined;
}

class PciInstance implements IMSpci<PropTypes> {
  typeIdentifier = "numberBonds";
  private config: ConfigProperties<PropTypes>;
  private dom: HTMLElement;
  private shadowdom: ShadowRoot;
  private model: Model;
  private store: IStore<StateModel, Actions>;
  private customValidity = "";

  constructor(dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString?: string) {
    if (!dom) throw new Error("No DOM Element provided");
    // The item's data- attributes override the defaults from config.json.
    config.properties = { ...(configProps as unknown as PropTypes), ...config.properties };
    this.dom = dom;
    this.config = config;
    // A closed shadow root keeps the item's CSS out and ours (Tailwind) in.
    this.shadowdom = dom.attachShadow({ mode: "closed" });

    // 0. The house or tree of the settings: the given boxes filled in and locked, the others empty.
    this.model = modelFrom(config.properties);
    const layout = layoutKey(this.model);
    this.store = initStore({ layout, values: startValues(this.model, this.language), locked: this.model.given.map((value) => value !== null) });
    // 1. The state from a previous session (whatever getState() returned) wins over the settings, if it is of this layout.
    if (stateString) {
      try {
        const { state, log } = JSON.parse(stateString) as PciStoredState;
        if (state?.layout === layout && Array.isArray(state.values) && state.values.length === this.model.given.length && Array.isArray(log)) {
          this.store.restoreState({ ...this.store.getState(), values: state.values.map(String) }, log);
        }
      } catch {
        // not ours: start from the settings
      }
    }
    // 2. A response the engine binds to the interaction (boundTo) wins over the state.
    const boundTo = config.boundTo ?? {};
    const bound = boundTo[config.responseIdentifier] ?? (Object.keys(boundTo).length === 1 ? Object.values(boundTo)[0] : undefined);
    if (bound) this.setResponse(bound);
    // 3. Status "solution": show the correct response of the item instead (AUTHORING.md, "Correct answers").
    if (config.status === "solution") this.showCorrectResponse();

    // From here on, tell the engine when a box changes.
    this.previousState = JSON.stringify(this.store.getState());
    this.unsubscribe = this.store.subscribe(this.onStoreChange);

    this.render();
    config.onready?.(this, this.getState());
  }

  private get language() {
    return languageOf(this.config.properties.language);
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
        <Interaction config={this.config.properties} model={this.model} store={this.store} readOnly={readOnly} />
      </>,
      this.shadowdom
    );
    this.inputs[0]?.setCustomValidity(this.customValidity);
  };

  /** The boxes the pupil types in (data-box in interaction.tsx). */
  private get inputs() {
    return Array.from(this.shadowdom.querySelectorAll<HTMLInputElement>("input[data-box]"));
  }

  /** Put the numbers of a response in the pupil's boxes. Only a change is an action: keeps the log (and a replay) clean. */
  private show = (response: unknown) => {
    const numbers = numbersIn(response);
    const texts = numbers === undefined ? null : textsFromNumbers(this.model, numbers, this.language);
    if (!texts) return;
    if (texts.some((text, i) => text !== this.store.getState().values[i])) this.store.dispatch({ type: "SET_ALL", payload: { values: texts } });
  };

  /**
   * Show the correct response the item declares (status "solution"). Without one, or one without numbers (an item
   * scored with a rule on `correct`), the PCI shows an answer of its own: the only one, or else one that adds up.
   */
  showCorrectResponse = () => {
    const correct = this.config.responseDeclaration?.correctResponse?.value;
    const numbers = numbersIn(correct);
    if (numbers !== undefined && textsFromNumbers(this.model, numbers)) return this.show(numbers);
    const values = exampleSolution(this.model).map((value) => (value === null ? "" : showNumber(value, this.language)));
    this.store.dispatch({ type: "SET_ALL", payload: { values } });
  };

  // ---- the IMS PCI API ----

  /** Undefined until the pupil filled in a box: nothing answered, nothing reported. */
  getResponse = (): QtiVariableJSON | undefined => {
    const { values } = this.store.getState();
    if (!answered(this.model, values)) return undefined;
    return { record: responseFields(this.model, values).map(recordItem) };
  };

  getState = () => JSON.stringify({ state: this.store.getState(), log: this.store.getActions() } satisfies PciStoredState);

  setResponse = (response: QtiVariableJSON) => this.show(response);

  checkValidity = () => this.customValidity === "" && this.inputs.every((input) => input.checkValidity());

  reportValidity = () => this.customValidity === "" && this.inputs.every((input) => input.reportValidity());

  setCustomValidity = (message: string) => {
    this.customValidity = message ?? "";
    this.inputs[0]?.setCustomValidity(this.customValidity);
  };

  getCustomValidity = () => this.customValidity;

  /** The engine is done with this instance: unsubscribe and unmount (which also runs the components' cleanups). */
  oncompleted = () => {
    this.unsubscribe();
    render(null, this.shadowdom);
  };
}

const factory: IMSpciAuthoringFactory<PropTypes> = {
  typeIdentifier: "numberBonds", // the same as config.tspci.typeIdentifier in package.json
  getInstance: (dom, config, state) => new PciInstance(dom, config, state),
  // From the settings when the layout has one answer; otherwise the author scores with a rule on `correct`.
  getCorrectResponse: (properties) => correctResponse(properties),

  /**
   * The authoring mode (AUTHORING.md, section 6): the author picks the house or the tree, types the numbers the pupil
   * gets and leaves the pupil's boxes empty, adds rows or splits (authoring.tsx). It writes the settings model, task,
   * house, tree, countZero, orderMatters and decimals. A player never calls it.
   */
  getAuthoringInstance: (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...(configProps as unknown as PropTypes), ...config.properties } as PropTypes;
    let authored: Authored = authoredFrom(properties);
    const language = languageOf(config.language); // the author's language
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    render(
      <>
        <style>{style}</style>
        <Authoring
          initial={authored}
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
