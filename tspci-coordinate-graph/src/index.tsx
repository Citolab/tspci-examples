// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/parcc/extension-parcc-tei/tree/master/views/js/pciCreator/dev/graphLineAndPointInteraction
// (Thibault Milan, Sam Sipasseuth) and .../graphPointLineGraphInteraction (Sam Sipasseuth, Christophe Noël),
// © 2014-2017 Parcc, Inc. (Open Assessment Technologies, for Parcc, Inc.)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import Authoring, { authoringProblems } from "./authoring";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import {
  IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, IMSpciAuthoringFactory,
  PciAuthoringConfiguration, PciAuthoringInstance,
} from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore } from "./store";
import {
  ElementDef, GraphState, Settings, evaluate, initialState, parseSettings, responseRecord, sameState, serializeElements, solutionState,
  stateFromResponse, validState,
} from "./model";
import { textsFor } from "./texts";

// config.json carries editor hints for authoring systems; the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("xmin"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "coordinateGraph";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  settings: Settings;

  private initialState: StateModel;
  // The correct response the delivery engine handed us at getInstance time, or else the author's correct elements.
  // See https://github.com/1EdTech/qti-project-management/issues/210
  private correctState: GraphState | null = null;

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
    this.settings = parseSettings(this.config.properties as Record<string, unknown>);
    const declared = config.responseDeclaration?.correctResponse as any;
    this.correctState = stateFromResponse(declared?.value ?? declared, this.settings) ?? solutionState(this.settings);

    this.initialState = initialState(this.settings);
    this.store = initStore(this.initialState, () => this.settings);
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        const state = validState(saved?.state, this.settings);
        if (state) this.store.restoreState(state, saved.log ?? []);
      } catch {
        // not a state of this PCI: start empty
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && stateFromResponse(response, this.settings)) {
        this.setResponse(response);
      }
    }

    // The item is in solution status: show the correct response (the engine's, or the author's correct elements)
    if (this.config.status === "solution" && this.correctState) {
      this.showCorrectResponse();
    }

    // From here on, tell the Delivery System when the interaction changes (not for what it handed us above)
    this.store.subscribe(() => {
      const value = this.getResponse();
      const event: QtiInteractionChangedDetail = {
        interaction: this,
        responseIdentifier: this.config.responseIdentifier,
        valid: value !== undefined,
        value,
      };
      dom.dispatchEvent(new CustomEvent("qti-interaction-changed", { detail: event }));
    }, { immediate: false });

    this.config.onready && this.config.onready(this);
    return this;
  };

  /** Paints the correct response; a delivery engine calls this when it moves a running interaction into review. */
  showCorrectResponse = () => {
    if (!this.correctState) return;
    this.store.restoreState(this.correctState, []);
  };

  render = () => {
    this.settings = parseSettings(this.config.properties as Record<string, unknown>); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    const status = this.config.status;
    render(
      <Interaction s={this.settings} store={this.store} texts={textsFor(this.settings.language)}
        readOnly={status === "review" || status === "solution" || status === "closed"} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author makes the list of elements the candidate can draw and draws the correct answer of
   * each on the grid of the item's settings; getProperties() gives data-elements. Only an authoring system calls this.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) } as unknown as Record<string, unknown>;
    const settings = parseSettings(properties);
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    let elements: ElementDef[] = settings.elements;
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring settings={settings} initial={elements} language={language}
        onChange={(next) => { elements = next; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ elements: serializeElements(elements) }),
      validate: () => authoringProblems({ ...settings, elements }, elements, language),
      oncompleted: () => render(null, host),
    };
    config.onready?.(instance);
    return instance;
  };

  /** The correct response from the settings: the record of the author's correct elements. */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const s = parseSettings({ ...defaults, ...normalize(properties as Record<string, string>) } as unknown as Record<string, unknown>);
    const state = solutionState(s);
    return state ? ({ record: responseRecord(s, state) } as QtiVariableJSON) : undefined;
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    window.requestAnimationFrame(() => {
      this.render();
      // other elements or another grid: the drawing has to fit them
      const fitted = validState(this.store.getState(), this.settings) ?? initialState(this.settings);
      this.initialState = initialState(this.settings);
      if (!sameState(fitted, this.store.getState())) this.store.restoreState(fitted, []);
    });
  };

  /** A record (README): nothing until the candidate drew something. */
  getResponse = (): QtiVariableJSON | undefined => {
    const state = this.store.getState();
    if (sameState(state, this.initialState)) return undefined;
    return { record: responseRecord(this.settings, state) } as QtiVariableJSON;
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response back in the PCI: ours, the original's record, or Point Graph's list of "x y" (model.ts stateFromResponse). */
  setResponse = (response: QtiVariableJSON) => {
    const state = stateFromResponse(response, this.settings);
    if (!state) {
      console.error("couldn't restore the response", response);
      return;
    }
    this.store.dispatch({ type: "RESTORE", payload: state });
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.store.getActions()
    });

  /** The checks as the PCI sees them now, for tests and for a rater. */
  evaluation = () => evaluate(this.settings, this.store.getState());
}

export default new App();
