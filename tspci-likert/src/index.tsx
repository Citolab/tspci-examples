// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/oat-sa/extension-tao-itemqti-pci/tree/develop/views/js/pciCreator/ims/likertScoreInteraction,
// © 2016-2024 Open Assessment Technologies SA
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
import { Settings, parseLevel, parseSettings } from "./likert";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems; the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/**
 * Some delivery systems hand the attributes over in lower case ("labelmin"), and the original PCI called two of them
 * label-min and label-max: all back to the keys of config.json.
 */
const simple = (key: string) => key.toLowerCase().replace(/[-_]/g, "");
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => simple(k) === simple(key));
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

class App implements IMSpci<PropTypes>, TAOpci {
  typeIdentifier = "likert";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  settings: Settings;

  private initialState: StateModel = { chosen: null };
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
    this.settings = parseSettings(config.properties as Record<string, unknown>);
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration);

    this.store = initStore(this.initialState);
    this.restore(stateString);

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (this.levelIn(response) !== null) {
        this.setResponse(response);
      }
    }

    // In review with a correct response from the engine: show that on top of what was restored above.
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

  /**
   * A saved state: ours ({ state, log }, as text), or the original likertScoreInteraction's ({ response }, as object or
   * text), so a session started with the original can go on.
   */
  private restore = (saved: unknown) => {
    if (!saved) return;
    try {
      const parsed = typeof saved === "string" ? JSON.parse(saved) : saved;
      if (parsed?.state && "chosen" in parsed.state) {
        const level = parseLevel(parsed.state.chosen, this.settings.levels);
        if (level !== null) this.store.restoreState({ chosen: level }, parsed.log ?? []);
      } else if (parsed?.response) {
        const level = this.levelIn(parsed.response);
        if (level !== null) this.store.restoreState({ chosen: level }, []);
      }
    } catch {
      // not a state of this PCI: start without a choice
    }
  };

  /** Paints the correct response received at getInstance time (a delivery engine calls this for review). */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  private correctResponseFromDeclaration = (
    declaration: ConfigProperties<PropTypes>["responseDeclaration"]
  ): QtiVariableJSON | null => {
    const value = declaration?.correctResponse?.value;
    if (value === undefined || value === null) return null;
    return { base: { integer: value } } as unknown as QtiVariableJSON;
  };

  /** The level in a response; TAO and some engines hand it over as a string. 0, like the original's "no answer": null. */
  private levelIn = (response: QtiVariableJSON): number | null => {
    const base = response?.base as Record<string, unknown> | undefined;
    return parseLevel(base?.integer ?? base?.string, this.settings.levels);
  };

  render = () => {
    this.settings = parseSettings(this.config.properties as Record<string, unknown>); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction id={this.config.responseIdentifier ?? "RESPONSE"} prompt={String(this.config.properties.prompt ?? "")}
        settings={this.settings} store={this.store} texts={textsFor(String(this.config.properties.language ?? "en"))} />,
      this.shadowdom
    );
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => simple(k) === simple(event)) ?? event;
    this.config.properties[key] = value;
    this.render();
  };

  /** The chosen level, 1 to the number of levels; nothing until the candidate chooses (or when the scale shrank). */
  getResponse = () => {
    const level = parseLevel(this.store.getState().chosen, this.settings.levels);
    if (level === null) return undefined;
    return { base: { integer: level } };
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  setResponse = (response: QtiVariableJSON) => {
    if (!response) return;
    const level = this.levelIn(response);
    if (level !== null) {
      this.store.restoreState({ chosen: level }, []);
    } else {
      this.resetResponse();
    }
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.store.getActions()
    });
}

export default new App();
