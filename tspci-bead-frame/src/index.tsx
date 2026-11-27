/*
 * A Portable Custom Interaction (PCI) with Preact, Tailwind and a store.
 *
 * The delivery engine (the player) loads this bundle, which registers a factory with qtiCustomInteractionContext.
 * For every interaction in an item the engine calls factory.getInstance(dom, config, state); the instance renders
 * into `dom` and reports its answer through getResponse().
 *
 * This file is the PCI API; interaction.tsx and frame.tsx are the UI, store.ts the state, beadFrame.ts the logic. A
 * rekenrek (bead frame) of 20 or 100 beads, or a hundred field (honderdveld). The response is a record (see
 * config.tspci.response in package.json and AUTHORING.md), by the `task` setting:
 * - set: { value: 13, structured: true, correct: true }
 * - addition: also first and second (the beads or squares per colour) and viaTen
 * - show: no response; the frame stands in for an image and the item asks for the number (config.tspci.toolWhen)
 * Where the beads and squares are is kept in the state, so a rater can see it.
 */
import "preact/debug"; // readable warnings in the browser console while developing
import { render } from "preact";
import { Action, IStore, Listener } from "@citolab/preact-store";
import {
  ConfigProperties, IMSpci, IMSpciAuthoringFactory, IMSpciFactory, PciAuthoringConfiguration, PciAuthoringInstance, PciProperties, QtiInteractionChangedDetail,
  QtiVariableJSON,
} from "@citolab/tspci";
import * as ctx from "qtiCustomInteractionContext"; // provided by the delivery engine at runtime
import configProps from "./config.json"; // the settings; the build passes only their defaults (AUTHORING.md)
import style from "./styles.css"; // Tailwind, compiled to a string, added to the shadow root below
import Interaction from "./interaction";
import { Authoring, authoringLayout } from "./authoring";
import { Grid, PER_ROW, Settings, correctResponseOf, counts, countsOf, gridFromCounts, parseSettings, responseOf, sameCounts, startGrid } from "./beadFrame";
import { Actions, StateModel, initStore } from "./store";

// Like every data- attribute, each setting arrives as a string.
type PropTypes = PciProperties<typeof configProps>;

/** What getState() saves: the state and the actions that led to it. */
type PciStoredState = { state: StateModel; log: Action<unknown>[] };

class PciInstance implements IMSpci<PropTypes> {
  typeIdentifier = "beadFrame";
  private config: ConfigProperties<PropTypes>;
  private settings: Settings;
  private dom: HTMLElement;
  private shadowdom: ShadowRoot;
  private store: IStore<StateModel, Actions>;
  private customValidity = "";

  constructor(dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString?: string) {
    if (!dom) throw new Error("No DOM Element provided");
    // The item's data- attributes override the defaults from config.json.
    config.properties = { ...(configProps as unknown as PropTypes), ...config.properties };
    this.dom = dom;
    this.config = config;
    this.settings = parseSettings(config.properties);
    // A closed shadow root keeps the item's CSS out and ours (Tailwind) in.
    this.shadowdom = dom.attachShadow({ mode: "closed" });

    // 0. The frame at the start: empty, or the number it shows (task "show").
    this.store = initStore({ grid: startGrid(this.settings) });
    // A frame that only shows a number has no state, response or solution of its own: it always shows the settings.
    if (!this.display) {
      // 1. The state from a previous session (whatever getState() returned) wins over the settings.
      if (stateString) {
        try {
          const { state, log } = JSON.parse(stateString) as PciStoredState;
          if (isGrid(state?.grid, this.settings.rows) && Array.isArray(log)) this.store.restoreState({ grid: state.grid }, log);
        } catch {
          // not ours: start empty
        }
      }
      // 2. A response the engine binds to the interaction (boundTo) wins over the state.
      const boundTo = config.boundTo ?? {};
      const bound = boundTo[config.responseIdentifier] ?? (Object.keys(boundTo).length === 1 ? Object.values(boundTo)[0] : undefined);
      if (bound) this.setResponse(bound);
      // 3. Status "solution": show the correct response of the item (or, without one, of the settings) instead.
      if (config.status === "solution") this.showCorrectResponse();
    }

    // From here on, tell the engine when anything changes: the response, or only the state (where the beads are).
    this.previousState = JSON.stringify(this.store.getState());
    this.unsubscribe = this.store.subscribe(this.onStoreChange);

    this.render();
    config.onready?.(this, this.getState());
  }

  /** The task "show": the frame stands in for an image, the item asks for the number (config.tspci.toolWhen). */
  private get display() {
    return this.settings.task === "show";
  }

  private previousState: string;
  private unsubscribe = () => {};
  /**
   * Every change of the state is an event, also one that leaves the response as it is (3 + 10 instead of 10 + 3
   * changes `structured`, but 5 on another row of a frame without a number to show may not): an engine then calls
   * getState() again, so where the beads are is saved too.
   */
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
        <Interaction config={this.config.properties} settings={this.settings} store={this.store} readOnly={readOnly} />
      </>,
      this.shadowdom
    );
  };

  /**
   * Show a response on the frame, the way the frame is read (a response holds the numbers, not where the beads were).
   * A response with the numbers the frame already shows changes nothing: a restored state keeps its own beads.
   */
  private show = (response: unknown) => {
    const wanted = countsOf(response);
    if (this.display || !wanted || sameCounts(wanted, counts(this.store.getState().grid))) return;
    this.store.dispatch({ type: "SET_GRID", payload: { grid: gridFromCounts(this.settings, wanted) } });
  };

  /** Show the correct response the item declares (status "solution"); without one, the one of the settings. */
  showCorrectResponse = () => {
    const correct = this.config.responseDeclaration?.correctResponse?.value ?? correctResponseOf(this.settings);
    if (correct !== undefined) this.show(correct);
  };

  // ---- the IMS PCI API ----

  getResponse = () => responseOf(this.store.getState().grid, this.settings) as QtiVariableJSON | undefined;

  getState = () => JSON.stringify({ state: this.store.getState(), log: this.store.getActions() } satisfies PciStoredState);

  setResponse = (response: QtiVariableJSON) => this.show(response);

  // The frame has no form field: it is valid unless the engine gave it a message (setCustomValidity).
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

/** A saved grid of this frame: as many rows as the settings give, ten places each, 0, 1 or 2 (else it is ignored). */
const isGrid = (grid: unknown, rows: number): grid is Grid =>
  Array.isArray(grid) &&
  grid.length === rows &&
  grid.every((row) => Array.isArray(row) && row.length === PER_ROW && row.every((fill) => fill === 0 || fill === 1 || fill === 2));

const factory: IMSpciAuthoringFactory<PropTypes> = {
  typeIdentifier: "beadFrame", // the same as config.tspci.typeIdentifier in package.json
  getInstance: (dom, config, state) => new PciInstance(dom, config, state),
  /**
   * From the settings: the number (or the sum) shown the way the frame is read, a sum via ten. Undefined for a frame
   * that only shows a number, and when the number does not fit on the frame.
   */
  getCorrectResponse: (properties) => correctResponseOf(parseSettings({ ...(configProps as unknown as PropTypes), ...properties })) as QtiVariableJSON | undefined,

  /**
   * The authoring mode (AUTHORING.md, section 6): the author arranges the beads or squares a frame that only shows a
   * number shows (authoring.tsx), which gives the setting `layout`. A player never calls it.
   */
  getAuthoringInstance: (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...(configProps as unknown as PropTypes), ...config.properties } as PropTypes;
    const settings = parseSettings(properties);
    const language = (config.language ?? "en").slice(0, 2) === "nl" ? "nl" : "en"; // the author's language
    let grid = startGrid({ ...settings, task: "show" });
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    render(
      <>
        <style>{style}</style>
        <Authoring
          settings={settings}
          initial={grid}
          language={language}
          onChange={(next) => {
            grid = next;
            config.onchange?.();
          }}
        />
      </>,
      shadow
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ layout: authoringLayout(settings, grid) }),
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
