import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import Authoring, { authoringProblems } from "./authoring";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import {
  IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, IMSpciAuthoringFactory, PciAuthoringConfiguration,
  PciAuthoringInstance,
} from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore, validState } from "./store";
import { Model } from "./geometry";
import { Settings, parseSettings } from "./settings";
import { modelOf, planeIn, responseFor } from "./response";
import { textsFor } from "./texts";
import type { CrossSectionScene } from "./scene3d";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = Object.fromEntries(
  Object.entries(configProps).map(([k, v]) => [k, typeof v === "object" && v !== null && "default" in v ? (v as any).default : v]),
) as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("targetshape"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "crossSection";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  settings: Settings;
  model: Model;
  /** the 3D view, for tests (null without WebGL) */
  scene: CrossSectionScene | null = null;

  private initialState: StateModel;
  // The correct response the delivery engine handed us at getInstance time, or else the author's solution plane.
  // See https://github.com/1EdTech/qti-project-management/issues/210
  private correctResponse: QtiVariableJSON | null = null;

  /** Only the module's own object registers; every interaction gets an object of its own (getInstance). */
  constructor(register = true) {
    if (register && ctx) {
      ctx.register(this);
    }
  }

  /** Every interaction on the page gets an object of its own, with its own store and settings. */
  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App =>
    new App(false).setup(dom, config, stateString);

  private setup = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App => {
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.parseSettings();
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration) ?? this.solutionResponse();

    this.initialState = { plane: this.settings.start, changed: false, hide: "none", input: "sliders", points: [null, null, null], found: [] };
    this.store = initStore(this.initialState);
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        const state = validState(saved?.state);
        if (state) this.store.restoreState(state, saved.log ?? []);
      } catch {
        // not a state of this PCI: start at the start plane
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && planeIn(response)) {
        this.setResponse(response);
      }
    }

    // The item is in solution status and there is a correct response (from the engine, or the author's solution):
    // show that on top of whatever was restored above.
    if (this.config.status === "solution" && this.correctResponse) {
      this.showCorrectResponse();
    }

    // From here on, tell the Delivery System when the interaction changes (not for what it handed us above)
    this.store.subscribe(() => {
      const event: QtiInteractionChangedDetail = {
        interaction: this,
        responseIdentifier: this.config.responseIdentifier,
        valid: true,
        value: this.getResponse(),
      };
      // dispatch a custom event to notify the Delivery System that the interaction has changed
      const interactionChangedEvent = new CustomEvent("qti-interaction-changed", {
        detail: event,
      });
      dom.dispatchEvent(interactionChangedEvent);
    }, { immediate: false });

    this.config.onready && this.config.onready(this);
    return this;
  };

  /**
   * Paints the correct response received at getInstance time (or the author's solution plane). A delivery engine
   * calls this when it moves an already running interaction into review.
   */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  private correctResponseFromDeclaration = (declaration: ConfigProperties<PropTypes>["responseDeclaration"]): QtiVariableJSON | null => {
    if (this.settings.mode !== "answer") return null;
    const plane = planeIn(declaration?.correctResponse?.value ?? declaration?.correctResponse);
    return plane ? responseFor(this.settings, this.model, plane) : null;
  };

  private solutionResponse = (): QtiVariableJSON | null =>
    this.settings.mode === "answer" && this.settings.solution ? responseFor(this.settings, this.model, this.settings.solution) : null;

  /**
   * Not QTI: for an authoring system (config.tspci.correctResponse "settings"). In answer mode with a solution plane,
   * the response for that plane; otherwise nothing.
   */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const s = parseSettings({ ...defaults, ...normalize(properties as Record<string, string>) });
    if (s.mode !== "answer" || !s.solution) return undefined;
    return responseFor(s, modelOf(s), s.solution);
  };

  private parseSettings = () => {
    const before = this.model;
    this.settings = parseSettings(this.config.properties as Record<string, unknown>);
    const next = modelOf(this.settings);
    // keep the same model object when the solid did not change: the 3D view then keeps its WebGL context
    this.model = before && JSON.stringify(before.spec) === JSON.stringify(next.spec) ? before : next;
  };

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={this.config.properties.prompt} settings={this.settings} model={this.model} store={this.store}
        texts={textsFor(this.settings.language)} readOnly={this.config.status === "solution"} onScene={(s) => (this.scene = s)} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author picks the solid, the controls and the target, and sets the start and solution planes
   * in a live preview; getProperties() gives the data- attributes. Only an authoring system calls this.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    let properties: Record<string, string> = { ...(defaults as any), ...normalize(config.properties as Record<string, string>) };
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={properties} language={language} onChange={(next) => { properties = next; config.onchange?.(); }} />,
      host
    );
    const keys = Object.keys(defaults).filter((k) => k !== "language");
    const instance: PciAuthoringInstance = {
      getProperties: () => Object.fromEntries(keys.map((k) => [k, String(properties[k] ?? "")])),
      validate: () => authoringProblems(properties, language),
      oncompleted: () => render(null, host),
    };
    config.onready?.(instance);
    return instance;
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    window.requestAnimationFrame(() => this.render());
  };

  /**
   * Answer mode: a record with score, maxscore, correct, shapeOk / lengthsOk / areaOk (the checks there are), shape,
   * kinds, sides, area, lengths and plane. Tool mode: the section and the shapes made, as a JSON string. Nothing until
   * the candidate moved the plane.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const { plane, changed, found } = this.store.getState();
    if (!changed) return undefined;
    return responseFor(this.settings, this.model, plane, found);
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response (or a plane as text) back in the view: only its plane counts, the rest follows from it. */
  setResponse = (response: QtiVariableJSON) => {
    const plane = planeIn(response);
    if (!plane) return;
    const state = this.store.getState();
    let found = state.found;
    try {
      const tool = JSON.parse((response as any)?.base?.string ?? "null");
      if (Array.isArray(tool?.found)) found = tool.found.filter((x: unknown) => typeof x === "string");
    } catch {
      // not a tool's JSON
    }
    this.store.restoreState({ ...state, plane, changed: true, points: [null, null, null], found }, []);
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
    this.scene?.dispose();
    render(null, this.shadowdom);
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.store.getActions()
    });
}

export default new App();
