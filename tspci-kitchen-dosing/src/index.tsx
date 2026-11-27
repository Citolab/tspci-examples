/*
 * A Portable Custom Interaction (PCI) with Preact, Tailwind and a store: recipe scaling and dosing (recept omrekenen en
 * doseren), for kitchen and cleaning in praktijkonderwijs.
 *
 * The delivery engine (the player) loads this bundle, which registers a factory with qtiCustomInteractionContext.
 * For every interaction in an item the engine calls factory.getInstance(dom, config, state); the instance renders
 * into `dom` and reports its answer through getResponse().
 *
 * This file is the PCI API; interaction.tsx is the UI, tools.tsx the measuring tools (a slider, − and + buttons) and
 * drawings.tsx their drawings, store.ts the state, kitchen.ts the arithmetic and the response, authoring.tsx the
 * authoring mode. The `mode` setting:
 * - recipe: a recipe for N persons made for M persons: the pupil writes the new amounts in the recipe and measures
 *   some of them with a kitchen scale, a measuring jug, spoons or by counting pieces;
 * - dosing: a cleaning task: the pupil chooses the product for the surface, computes the dose for the bucket and pours
 *   it with a dosing cup.
 * The response is a record (config.tspci.response in package.json, README): per-line checks line1 … line10,
 * amountsCorrect, measuredCorrect, product (dosing), correct, and work. Nothing until the pupil answers.
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
import { Model, Settings, correctFor, correctWork, emptyWork, isWork, modelFrom, parseNumber, readResponse, responseFor, workFrom } from "./kitchen";
import { Actions, StateModel, initStore } from "./store";
import { languageOf, textsFor } from "./texts";
import { Authored, Authoring, authoredFrom, authoredProblems, authoredProperties } from "./authoring";

// Like every data- attribute, each setting arrives as a string.
type PropTypes = PciProperties<typeof configProps>;

/** What getState() saves: the state and the actions that led to it. */
type PciStoredState = { state: StateModel; log: Action<unknown>[] };

const withDefaults = (properties: Partial<PropTypes>) => ({ ...(configProps as unknown as PropTypes), ...properties });

class PciInstance implements IMSpci<PropTypes> {
  typeIdentifier = "kitchenDosing";
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

    // 0. The task from the settings: the recipe and the persons, or the cleaning task.
    this.model = modelFrom(config.properties as Settings);
    this.store = initStore(emptyWork(this.model));
    // 1. The state from a previous session (whatever getState() returned) wins over the settings.
    if (stateString) {
      try {
        const { state, log } = JSON.parse(stateString) as PciStoredState;
        if (isWork(state, this.model) && Array.isArray(log)) this.store.restoreState(state, log);
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
    this.syncValidity();
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
    this.syncValidity();
  };

  /** The amount boxes: one that holds something that is not a number ("veel") is invalid, with the reason. */
  private syncValidity = () => {
    const t = textsFor(this.model.language);
    const inputs = this.shadowdom.querySelectorAll<HTMLInputElement>("input[data-amount]");
    inputs.forEach((input, i) => {
      const text = this.store.getState().amounts[Number(input.dataset.amount)] ?? "";
      const notANumber = text.trim() !== "" && parseNumber(text) === null;
      // the engine's message goes on the first box
      input.setCustomValidity((i === 0 && this.customValidity) || (notANumber ? t.notANumber : ""));
    });
  };

  /**
   * Show a response: its `work` field (the amounts, the measured amounts, the product, the pours). A correct response
   * from the settings has no work: then the work of a pupil who did everything right. Only a change is an action.
   */
  private show = (value: unknown) => {
    const fields = readResponse(value);
    const work = workFrom(this.model, fields.work) ?? (fields.correct === true ? correctWork(this.model) : null);
    if (!work) return;
    if (JSON.stringify(work) !== JSON.stringify(this.store.getState())) this.store.dispatch({ type: "SET_WORK", payload: { work } });
  };

  /** Show the correct response the item declares (status "solution"); without one, the one from the settings. */
  showCorrectResponse = () => {
    const declared = this.config.responseDeclaration?.correctResponse?.value;
    this.show(declared ?? correctFor(this.model));
  };

  // ---- the IMS PCI API ----

  getResponse = () => responseFor(this.model, this.store.getState()) as QtiVariableJSON | undefined;

  getState = () => JSON.stringify({ state: this.store.getState(), log: this.store.getActions() } satisfies PciStoredState);

  setResponse = (response: QtiVariableJSON) => this.show(response);

  checkValidity = () => this.customValidity === "" && Array.from(this.shadowdom.querySelectorAll<HTMLInputElement>("input[data-amount]")).every((input) => input.checkValidity());

  reportValidity = () => {
    const invalid = Array.from(this.shadowdom.querySelectorAll<HTMLInputElement>("input[data-amount]")).find((input) => !input.checkValidity());
    return invalid ? invalid.reportValidity() : this.checkValidity();
  };

  setCustomValidity = (message: string) => {
    this.customValidity = message ?? "";
    this.syncValidity();
  };

  getCustomValidity = () => this.customValidity;

  /** The engine is done with this instance: unsubscribe and unmount (which also runs the components' cleanups). */
  oncompleted = () => {
    this.unsubscribe();
    render(null, this.shadowdom);
  };
}

const factory: IMSpciAuthoringFactory<PropTypes> = {
  typeIdentifier: "kitchenDosing", // the same as config.tspci.typeIdentifier in package.json
  getInstance: (dom, config, state) => new PciInstance(dom, config, state),
  // Every check true, and the right product (kitchen.ts correctFor); no `work`, which differs from pupil to pupil.
  getCorrectResponse: (properties) => correctFor(modelFrom(withDefaults(properties) as Settings)) as QtiVariableJSON | undefined,

  /**
   * The authoring mode (AUTHORING.md, section 6): the recipe (a preset or the author's own: ingredients, amounts,
   * units, which are measured), the persons, the bowl on the scale; or the cleaning task (the surface, the bucket, the
   * products, their dosages, the cup); and the margins (authoring.tsx). A player never calls it.
   */
  getAuthoringInstance: (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = withDefaults(config.properties ?? {});
    let authored: Authored = authoredFrom(properties as Settings);
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
