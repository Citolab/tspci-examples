// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/EffetDeSerrepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction, { effectiveLevel, shownTemperature } from "./interaction";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import { IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, QtiRecordItem } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore, validState } from "./store";
import { Settings, correctPrediction, parseSettings } from "./settings";
import { levelFor, onTarget, roundTo } from "./model";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems; the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("startlevel"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

/** A field of a record response. */
const field = (response: any, name: string) => (Array.isArray(response?.record) ? response.record.find((f: any) => f?.name === name)?.base : undefined);

class App implements IMSpci<PropTypes>, TAOpci {
  typeIdentifier = "greenhouseEffect";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  settings: Settings;

  private initialState: StateModel = { level: null, tried: [], prediction: null };

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

    this.store = initStore(this.initialState);
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        const state = validState(saved?.state);
        if (state) this.store.restoreState(state, saved.log ?? []);
      } catch {
        // not a state of this PCI: start at the settings
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && response?.record) this.setResponse(response);
    }

    // solution status: show the solution that follows from the settings (a record has no standard correct response)
    if (this.config.status === "solution") this.showCorrectResponse();

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
   * The solution of the settings: the target question's level (the slider step whose temperature is closest to the
   * target) or the direction question's prediction. Without a question there is none.
   */
  showCorrectResponse = () => {
    const s = this.settings;
    const state = this.store.getState();
    if (s.question === "target") {
      const level = levelFor(s, s.targetTemperature, s.levelStep, s.decimals);
      this.store.dispatch({ type: "RESTORE", payload: { ...state, level, tried: [...state.tried, level] } });
    } else if (s.question === "direction") {
      this.store.dispatch({ type: "RESTORE", payload: { ...state, prediction: correctPrediction(s) } });
    }
  };

  render = () => {
    this.settings = parseSettings(this.config.properties as Record<string, unknown>); // trigger() may have changed them
    const status = this.config.status;
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={this.config.properties.prompt} settings={this.settings} store={this.store}
        texts={textsFor(this.settings.language)} readOnly={status === "review" || status === "closed" || status === "solution"} />,
      this.shadowdom
    );
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    window.requestAnimationFrame(() => this.render());
  };

  /**
   * A record: level (the greenhouse gas level, ε in %), epsilon, temperature (°C, rounded as shown), tried (the levels
   * the candidate stopped at with their temperatures, JSON) and, with a question, prediction (direction question),
   * correct and score. Nothing until the candidate set a level or predicted.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const s = this.settings;
    const state = this.store.getState();
    if (!state.tried.length && state.prediction === null) return undefined;
    const level = effectiveLevel(s, state);
    const temperature = shownTemperature(s, level);
    const record: QtiRecordItem[] = [
      { name: "level", base: { float: level } },
      { name: "epsilon", base: { float: roundTo(level / 100, 4) } },
      { name: "temperature", base: { float: temperature } },
      { name: "tried", base: { string: JSON.stringify(state.tried.map((l) => ({ level: l, temperature: shownTemperature(s, l) }))) } },
    ];
    if (s.question === "direction") record.push({ name: "prediction", base: { string: state.prediction ?? "" } });
    if (s.question !== "none") {
      const correct =
        s.question === "target"
          ? state.tried.length > 0 && onTarget(temperature, s.targetTemperature, s.tolerance)
          : state.prediction === correctPrediction(s);
      record.push({ name: "correct", base: { integer: correct ? 1 : 0 } });
      record.push({ name: "score", base: { integer: correct ? 1 : 0 } });
    }
    return { record } as QtiVariableJSON;
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response back in the simulation: its tried levels (the last one is the level) and its prediction. */
  setResponse = (response: QtiVariableJSON) => {
    try {
      const tried = JSON.parse(field(response, "tried")?.string ?? "[]");
      const level = field(response, "level")?.float ?? field(response, "level")?.integer;
      const state = validState({
        level: typeof level === "number" ? level : null,
        tried: Array.isArray(tried) ? tried.map((t: any) => t?.level) : [],
        prediction: field(response, "prediction")?.string,
      });
      if (!state) throw new Error("no state");
      if (state.level !== null && !state.tried.length) state.tried = [state.level];
      this.store.dispatch({ type: "RESTORE", payload: state });
    } catch {
      console.error("couldn't restore the response", response);
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
