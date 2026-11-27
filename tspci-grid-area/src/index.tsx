/*
 * A Portable Custom Interaction (PCI) with Preact, Tailwind and a store.
 *
 * The delivery engine (the player) loads this bundle, which registers a factory with qtiCustomInteractionContext.
 * For every interaction in an item the engine calls factory.getInstance(dom, config, state); the instance renders
 * into `dom` and reports its answer through getResponse().
 *
 * This file is the PCI API; interaction.tsx is the UI, gridView.tsx the squared paper, store.ts the state and grid.ts
 * the geometry (area, perimeter, one piece, holes, rectangle), the rules and the response. Area and perimeter on squared
 * paper, by the `task` setting:
 * - draw: the pupil colours squares (and half squares); the response is a record with the area, the perimeter, the
 *   checks and whether the drawing meets the rules of the settings (many drawings are right, so the item scores a field)
 * - measure: the author's shape is shown; the response holds the area and/or perimeter the pupil writes
 * - compare: two shapes; the response is the one the pupil chooses as the larger ("A", "B" or "same")
 * See config.tspci.response in package.json, AUTHORING.md and the README.
 */
import "preact/debug"; // readable warnings in the browser console while developing
import { render } from "preact";
import { Action, IStore, Listener } from "@citolab/preact-store";
import {
  ConfigProperties, IMSpci, IMSpciAuthoringFactory, IMSpciFactory, PciAuthoringConfiguration, PciAuthoringInstance, PciProperties, QtiInteractionChangedDetail, QtiVariableJSON,
} from "@citolab/tspci";
import * as ctx from "qtiCustomInteractionContext"; // provided by the delivery engine at runtime
import configProps from "./config.json"; // the settings; the build passes only their defaults (AUTHORING.md)
import style from "./styles.css"; // Tailwind, compiled to a string, added to the shadow root below
import Interaction from "./interaction";
import { Authoring, authoringProblems, type AuthoringLanguage } from "./authoring";
import { correctFields, fieldsOf, isEmptyShape, parseShape, responseFields, settingsFrom, type Settings } from "./grid";
import { Actions, StateModel, initStore, startState } from "./store";

// Like every data- attribute, each setting arrives as a string.
type PropTypes = PciProperties<typeof configProps>;

/** What getState() saves: the state and the actions that led to it. */
type PciStoredState = { state: StateModel; log: Action<unknown>[] };

const withDefaults = (properties: Partial<PropTypes> = {}) => ({ ...(configProps as unknown as PropTypes), ...properties }) as PropTypes;

/** The correct response for the settings (getCorrectResponse); see grid.ts correctFields. */
function correctResponse(properties: Partial<PropTypes>): QtiVariableJSON | undefined {
  const fields = correctFields(settingsFrom(withDefaults(properties)));
  return fields ? ({ record: fields } as QtiVariableJSON) : undefined;
}

class PciInstance implements IMSpci<PropTypes> {
  typeIdentifier = "gridArea";
  private config: ConfigProperties<PropTypes>;
  private settings: Settings;
  private dom: HTMLElement;
  private shadowdom: ShadowRoot;
  private store: IStore<StateModel, Actions>;
  private customValidity = "";

  constructor(dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString?: string) {
    if (!dom) throw new Error("No DOM Element provided");
    // The item's data- attributes override the defaults from config.json.
    config.properties = withDefaults(config.properties);
    this.dom = dom;
    this.config = config;
    this.settings = settingsFrom(config.properties);
    // A closed shadow root keeps the item's CSS out and ours (Tailwind) in.
    this.shadowdom = dom.attachShadow({ mode: "closed" });

    // 0. An empty grid of the size of the settings.
    const size = this.settings.columns * this.settings.rows;
    this.store = initStore(startState(size));
    // 1. The state from a previous session (whatever getState() returned) wins; one of another grid size is ignored.
    if (stateString) {
      try {
        const { state, log } = JSON.parse(stateString) as PciStoredState;
        if (isState(state, size) && Array.isArray(log)) this.store.restoreState(state, log);
      } catch {
        // not ours: start empty
      }
    }
    // 2. A response the engine binds to the interaction (boundTo) wins over the state.
    const boundTo = config.boundTo ?? {};
    const bound = boundTo[config.responseIdentifier] ?? (Object.keys(boundTo).length === 1 ? Object.values(boundTo)[0] : undefined);
    if (bound) this.setResponse(bound);
    // 3. Status "solution": show the correct response instead (AUTHORING.md, "Correct answers").
    if (config.status === "solution") this.showCorrectResponse();

    // From here on, tell the engine when anything changes.
    this.previousState = JSON.stringify(this.store.getState());
    this.unsubscribe = this.store.subscribe(this.onStoreChange);

    this.render();
    config.onready?.(this, this.getState());
  }

  private previousState: string;
  private unsubscribe = () => {};
  /** Every change of the state is an event (a typed number that is not a number yet changes no response, but is saved). */
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
        <Interaction config={this.config.properties} store={this.store} readOnly={readOnly} />
      </>,
      this.shadowdom
    );
    this.inputs.forEach((input) => input.setCustomValidity(this.customValidity));
  };

  /** The answer boxes of a measuring task. */
  private get inputs() {
    return Array.from(this.shadowdom.querySelectorAll<HTMLInputElement>("input[data-answer]"));
  }

  /**
   * Show a response: the shape of a drawing, the numbers of a measurement, the choice of a comparison. Only a change is
   * an action: that keeps the log (and a replay) clean.
   */
  private show = (fields: Record<string, unknown>) => {
    const state = this.store.getState();
    const { task, columns, rows } = this.settings;
    if (task === "draw" && typeof fields.shape === "string") {
      const cells = parseShape(fields.shape, columns, rows).cells;
      if (cells.some((value, i) => value !== state.cells[i])) this.store.dispatch({ type: "SET_CELLS", payload: { cells } });
    }
    if (task === "measure") {
      for (const field of ["areaAnswer", "perimeterAnswer"] as const) {
        const value = fields[field];
        const text = value === undefined || value === null ? "" : String(value).replace(".", this.config.properties.language === "nl" ? "," : ".");
        if (field in fields && text !== state[field]) this.store.dispatch({ type: "SET_ANSWER", payload: { field, value: text } });
      }
    }
    if (task === "compare" && typeof fields.choice === "string" && fields.choice !== state.choice) {
      this.store.dispatch({ type: "CHOOSE", payload: { choice: fields.choice } });
    }
  };

  /**
   * Show the correct response (status "solution"): the one the item declares, else the one from the settings. A drawing
   * has many right answers: it shows the declared `shape` field if there is one, else the author's example shape (the
   * `shape` setting), else it leaves the grid as it is.
   */
  showCorrectResponse = () => {
    const declared = fieldsOf(this.config.responseDeclaration?.correctResponse?.value);
    if (this.settings.task === "draw") {
      if (typeof declared?.shape === "string") this.show(declared);
      else if (!isEmptyShape(this.settings.shape)) this.show({ shape: this.config.properties.shape });
      return;
    }
    const fields = declared && Object.keys(declared).length ? declared : fieldsOf(correctResponse(this.config.properties));
    if (fields) this.show(fields);
  };

  // ---- the IMS PCI API

  getResponse = (): QtiVariableJSON | undefined => {
    const fields = responseFields(this.settings, this.store.getState());
    return fields ? ({ record: fields } as QtiVariableJSON) : undefined;
  };

  getState = () => JSON.stringify({ state: this.store.getState(), log: this.store.getActions() } satisfies PciStoredState);

  setResponse = (response: QtiVariableJSON) => {
    const fields = fieldsOf(response);
    if (fields) this.show(fields);
  };

  checkValidity = () => this.customValidity === "" && this.inputs.every((input) => input.checkValidity());

  reportValidity = () => this.inputs.every((input) => input.reportValidity()) && this.customValidity === "";

  setCustomValidity = (message: string) => {
    this.customValidity = message ?? "";
    this.inputs.forEach((input) => input.setCustomValidity(this.customValidity));
  };

  getCustomValidity = () => this.customValidity;

  /** The engine is done with this instance: unsubscribe and unmount (which also runs the components' cleanups). */
  oncompleted = () => {
    this.unsubscribe();
    render(null, this.shadowdom);
  };
}

/** A saved state of this version of the PCI, on a grid of this size (another one is ignored: the grid starts empty). */
const isState = (state: Partial<StateModel> | undefined, size: number): state is StateModel =>
  Array.isArray(state?.cells) &&
  state.cells.length === size &&
  state.cells.every((value) => Number.isInteger(value) && value >= 0 && value <= 5) &&
  typeof state.areaAnswer === "string" &&
  typeof state.perimeterAnswer === "string" &&
  typeof state.choice === "string";

const factory: IMSpciAuthoringFactory<PropTypes> = {
  typeIdentifier: "gridArea", // the same as config.tspci.typeIdentifier in package.json
  getInstance: (dom, config, state) => new PciInstance(dom, config, state),
  // measure and compare: the answer follows from the shapes; draw: the fields that must be true (README, "Scoring")
  getCorrectResponse: (properties) => correctResponse(properties),

  /**
   * The authoring mode (AUTHORING.md, section 6): the author draws the shape (draw: an example answer; measure: the shape
   * to measure; compare: shapes A and B) on the grid of the item's settings (authoring.tsx). It writes the settings
   * `shape` and `shapeB`. A player never calls it.
   */
  getAuthoringInstance: (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = withDefaults(config.properties);
    const settings = settingsFrom(properties);
    const language: AuthoringLanguage = (config.language ?? "en").slice(0, 2) === "nl" ? "nl" : "en"; // the author's language
    let shapes = { shape: properties.shape ?? "", shapeB: properties.shapeB ?? "" };
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    render(
      <>
        <style>{style}</style>
        <Authoring
          settings={settings}
          language={language}
          onChange={(next) => {
            shapes = next;
            config.onchange?.();
          }}
        />
      </>,
      shadow
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ ...shapes }),
      validate: () => {
        const { columns, rows } = settings;
        return authoringProblems(settings, parseShape(shapes.shape, columns, rows), parseShape(shapes.shapeB, columns, rows), language);
      },
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
