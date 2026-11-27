/*
 * A Portable Custom Interaction (PCI) with Preact, Tailwind and a store.
 *
 * The delivery engine (the player) loads this bundle, which registers a factory with qtiCustomInteractionContext.
 * For every interaction in an item the engine calls factory.getInstance(dom, config, state); the instance renders
 * into `dom` and reports its answer through getResponse().
 *
 * This file is the PCI API; interaction.tsx is the UI, map.tsx the warehouse from above, pictures.tsx the products,
 * store.ts the state, authoring.tsx the authoring mode and picking.ts the logic (the warehouse, the aisle graph and the
 * shortest route, the checks, the response). Order picking (orderpicken): the pupil picks the order of a pick list into
 * a roll cage, or checks a picked roll cage for mistakes. The response is a record (see config.tspci.response in
 * package.json and the README): how many order lines are right, wrong articles and quantities, shortages reported, the
 * route walked and the shortest one, whether everything is right, and what is in the roll cage.
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
import { Authoring, authoredProblems } from "./authoring";
import {
  Field, PickState, Settings, Warehouse, answered, correctState, emptyState, layoutKey, normalizeWarehouse, parsePicked, responseFields,
  serializePicked, serializeWarehouse, settingsFrom, shortestTour, warehouseFrom,
} from "./picking";
import { Actions, StateModel, initStore } from "./store";
import { languageOf, textsFor } from "./texts";

// Like every data- attribute, each setting arrives as a string.
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** What getState() saves: the state and the actions that led to it. */
type PciStoredState = { state: StateModel; log: Action<unknown>[] };

const recordItem = ({ name, type, value }: Field): QtiRecordItem => ({ name, base: { [type]: value } as QtiRecordItem["base"] });

/** The warehouse and the settings of the item's properties, read the same way for the pupil and getCorrectResponse. */
function itemOf(properties: Partial<PropTypes>): { w: Warehouse; settings: Settings } {
  const all = { ...defaults, ...properties } as PropTypes;
  return { w: warehouseFrom(all.warehouse, languageOf(all.language)), settings: settingsFrom(all) };
}

/** The correct response for the settings: every line right, nothing extra, the shortest route, every tote judged right. */
function correctResponse(properties: Partial<PropTypes>): QtiVariableJSON {
  const { w, settings } = itemOf(properties);
  return { record: responseFields(w, settings, correctState(w, settings)).map(recordItem) };
}

/** The `picked` text of a response (setResponse, boundTo) or a correct response (status "solution"). */
function pickedIn(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = pickedIn(item);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (typeof value === "string") return parsePicked(value) ? value : undefined;
  if (value && typeof value === "object") {
    const { record, base, name, fieldIdentifier, picked } = value as Record<string, any>;
    if (Array.isArray(record)) return pickedIn(record.find((field) => field?.name === "picked"));
    if ((name ?? fieldIdentifier) && (name ?? fieldIdentifier) !== "picked") return undefined;
    if (typeof base?.string === "string") return base.string;
    if (typeof picked === "string") return picked;
  }
  return undefined;
}

class PciInstance implements IMSpci<PropTypes> {
  typeIdentifier = "orderPicking";
  private config: ConfigProperties<PropTypes>;
  private dom: HTMLElement;
  private shadowdom: ShadowRoot;
  private w: Warehouse;
  private settings: Settings;
  private store: IStore<StateModel, Actions>;
  private customValidity = "";

  constructor(dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString?: string) {
    if (!dom) throw new Error("No DOM Element provided");
    // The item's data- attributes override the defaults from config.json.
    config.properties = { ...defaults, ...config.properties };
    this.dom = dom;
    this.config = config;
    // A closed shadow root keeps the item's CSS out and ours (Tailwind) in.
    this.shadowdom = dom.attachShadow({ mode: "closed" });

    // 0. The warehouse of the settings (or the example), nothing picked yet, the pupil at dispatch.
    ({ w: this.w, settings: this.settings } = itemOf(config.properties));
    const key = layoutKey(this.w, this.settings);
    this.store = initStore({ key, ...emptyState(this.w) });
    // 1. The state from a previous session (whatever getState() returned) wins over the settings, if it is of this warehouse.
    if (stateString) {
      try {
        const { state, log } = JSON.parse(stateString) as PciStoredState;
        if (state?.key === key && Array.isArray(state.walk) && Array.isArray(state.verdicts) && Array.isArray(log)) {
          this.store.restoreState({ ...this.store.getState(), ...state }, log);
        }
      } catch {
        // not ours: start from the settings
      }
    }
    // 2. A response the engine binds to the interaction (boundTo) wins over the state.
    const boundTo = config.boundTo ?? {};
    const bound = boundTo[config.responseIdentifier] ?? (Object.keys(boundTo).length === 1 ? Object.values(boundTo)[0] : undefined);
    if (bound) this.setResponse(bound);
    // 3. Status "solution": show the correct response of the item instead.
    if (config.status === "solution") this.showCorrectResponse();

    // From here on, tell the engine about every change.
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
    const { title, question, language } = this.config.properties;
    render(
      <>
        <style>{style}</style>
        <Interaction title={title} question={question} w={this.w} settings={this.settings} store={this.store} readOnly={readOnly} t={textsFor(language)} />
      </>,
      this.shadowdom
    );
  };

  /**
   * Put the answer of a `picked` text in the PCI: the roll cage and the shortages, or the check of every tote. The walk
   * is not in a response: a new roll cage gets the shortest walk along its locations. Only a change is an action.
   */
  private show = (picked: string, complete = false) => {
    const parsed = parsePicked(picked);
    if (!parsed) return;
    const current = this.store.getState();
    const next: Partial<PickState> = {};
    if (this.settings.task === "check" && parsed.verdicts) {
      const verdicts = current.verdicts.map((_, i) => parsed.verdicts![i + 1] ?? "");
      if (JSON.stringify(verdicts) !== JSON.stringify(current.verdicts)) next.verdicts = verdicts;
    }
    if (this.settings.task === "pick" && parsed.cart) {
      const short = (parsed.short ?? []).filter((line) => line <= this.w.order.lines.length);
      if (serializePicked({ cart: parsed.cart, short }) !== serializePicked(current)) {
        next.cart = parsed.cart;
        next.short = short;
        // the shortest walk along what is in the roll cage and the lines reported short (also one with nothing on the shelf)
        const visited = [...Object.keys(parsed.cart), ...short.map((line) => this.w.order.lines[line - 1].loc)];
        next.walk = shortestTour(this.w, visited).order;
      }
      if (complete) next.ticked = this.w.order.lines.map((_, i) => i + 1);
    }
    if (Object.keys(next).length) this.store.dispatch({ type: "SET", payload: next });
  };

  /**
   * Show the correct response the item declares (status "solution"), read-only. Without one, the PCI shows the right
   * answer of its settings: every line picked along the shortest route, or every tote judged right.
   */
  showCorrectResponse = () => {
    const declared = pickedIn(this.config.responseDeclaration?.correctResponse?.value);
    const picked = declared ?? serializeCorrect(this.w, this.settings);
    this.show(picked, true);
  };

  // ---- the IMS PCI API ----

  /** Undefined until the pupil did something that answers: nothing answered, nothing reported. */
  getResponse = (): QtiVariableJSON | undefined => {
    const state = this.store.getState();
    if (!answered(this.settings, state)) return undefined;
    return { record: responseFields(this.w, this.settings, state).map(recordItem) };
  };

  getState = () => JSON.stringify({ state: this.store.getState(), log: this.store.getActions() } satisfies PciStoredState);

  setResponse = (response: QtiVariableJSON) => {
    const picked = pickedIn(response);
    if (picked !== undefined) this.show(picked);
  };

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

const serializeCorrect = (w: Warehouse, settings: Settings) => {
  const field = responseFields(w, settings, correctState(w, settings)).find((f) => f.name === "picked");
  return String(field?.value ?? "");
};

const factory: IMSpciAuthoringFactory<PropTypes> = {
  typeIdentifier: "orderPicking", // the same as config.tspci.typeIdentifier in package.json
  getInstance: (dom, config, state) => new PciInstance(dom, config, state),
  // Always one answer: every line right (a short one: all there is, reported), the shortest route, every tote judged.
  getCorrectResponse: (properties) => correctResponse(properties),

  /**
   * The authoring mode (AUTHORING.md, section 6): the author sets up the warehouse (aisles, racks, shelves), puts
   * products on the shelves, writes the pick list and fills the roll cage of the check task (authoring.tsx). It writes
   * the setting `warehouse`. A player never calls it.
   */
  getAuthoringInstance: (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...config.properties } as PropTypes;
    const language = languageOf(config.language); // the author's language
    const settings = settingsFrom(properties);
    // the author starts from the item's warehouse, or from the example in the language of the PCI
    let authored: Warehouse = warehouseFrom(properties.warehouse, languageOf(properties.language));
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    render(
      <>
        <style>{style}</style>
        <Authoring
          initial={authored}
          settings={settings}
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
      getProperties: () => ({ warehouse: serializeWarehouse(normalizeWarehouse(authored)) }),
      validate: () => authoredProblems(authored, settings, language),
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
