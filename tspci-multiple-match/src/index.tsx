// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/multiplematch, © Jeppe Bundsgaard, Aarhus University (openPCI)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import { IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore } from "./store";
import { Settings, answersFrom, hasAnswer, makeOrder, parseSettings, responseObject } from "./matrix";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems; the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems: back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

class App implements IMSpci<PropTypes>, TAOpci {
  typeIdentifier = "multipleMatch";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  settings: Settings;

  // The correct response the delivery engine handed us at getInstance time.
  // See https://github.com/1EdTech/qti-project-management/issues/210
  private correctResponse: QtiVariableJSON | null = null;

  constructor() {
    if (ctx) {
      ctx.register(this);
    }
  }

  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string) => {
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration);
    this.settings = parseSettings(this.config.properties as unknown as Record<string, string>);

    // getState() saves { state, log }; the order the candidate saw comes back with it
    let saved: { state?: Partial<StateModel>; log?: any[] } | null = null;
    if (stateString) {
      try {
        saved = JSON.parse(stateString);
      } catch {
        // not a state of this PCI: start fresh
      }
    }
    const order = makeOrder(this.settings, saved?.state?.order);
    this.store = initStore({ answers: {}, order });
    if (saved?.state?.answers) {
      this.store.restoreState({ answers: answersFrom(this.settings, saved.state.answers), order }, saved.log ?? []);
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (this.valueIn(response)) {
        this.setResponse(response);
      }
    }

    // In solution status with a correct response from the engine: show that
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
      dom.dispatchEvent(new CustomEvent("qti-interaction-changed", { detail: event }));
    }, { immediate: false });

    this.config.onready && this.config.onready(this);
    return this;
  };

  /** Paints the correct response received at getInstance time. */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  private correctResponseFromDeclaration = (
    declaration: ConfigProperties<PropTypes>["responseDeclaration"]
  ): QtiVariableJSON | null => {
    const value = declaration?.correctResponse?.value;
    if (value === undefined || value === null || value === "") return null;
    return { base: { string: Array.isArray(value) ? value[0] : value } } as QtiVariableJSON;
  };

  /** The JSON string in a response. */
  private valueIn = (response: QtiVariableJSON): string | null => {
    const value = response?.base?.string;
    return value === undefined || value === null || value === "" ? null : String(value);
  };

  render = () => {
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction settings={this.settings} store={this.store} texts={textsFor(this.config.properties.language)}
        disabled={this.config.status === "solution"} />,
      this.shadowdom
    );
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  /** TAO's creator changes a setting: read the settings again, order them again, keep the answers that still fit. */
  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    this.settings = parseSettings(this.config.properties as unknown as Record<string, string>);
    const { answers } = this.store.getState();
    this.store.restoreState({ answers: answersFrom(this.settings, answers), order: makeOrder(this.settings) }, []);
    this.render();
  };

  /**
   * The response of the original: a JSON string, { "<topic>_<item>": "value" } (or ["value", …] with multiple
   * selections). Nothing (NULL) until the candidate answers something.
   */
  getResponse = () => {
    const { answers, order } = this.store.getState();
    if (!hasAnswer(answers)) return undefined;
    return {
      base: {
        string: JSON.stringify(responseObject(this.settings, order, answers)),
      },
    };
  };

  resetResponse = () => {
    this.store.dispatch({ type: "SET", payload: { answers: {} } });
  };

  setResponse = (response: QtiVariableJSON) => {
    if (!response) return;
    const value = this.valueIn(response);
    this.store.restoreState({ ...this.store.getState(), answers: value ? answersFrom(this.settings, value) : {} }, this.store.getActions());
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.store.getActions(),
    });
}

export default new App();
