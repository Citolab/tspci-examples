// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/NouvelleTerrepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction, { effective, shownForce } from "./interaction";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import { IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, QtiRecordItem } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, Values, emptyState, initStore, validMeasurement, validState } from "./store";
import { Settings, keyOf, parseSettings, parseVariables, scoreOf } from "./settings";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems; the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("starmass"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

/** A field of a record response, by name. */
const fieldOf = (response: QtiVariableJSON | undefined, name: string) =>
  (response as any)?.record?.find?.((f: QtiRecordItem) => f?.name === name)?.base;

class App implements IMSpci<PropTypes>, TAOpci {
  typeIdentifier = "gravitation";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  settings: Settings;

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

    this.store = initStore(emptyState());
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

    if (!stateString && this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (response?.record) this.setResponse(response);
    }
    // In solution status: the author's key ticked (the PCI scores the question itself, so the key is in the settings).
    if (this.config.status === "solution") this.showCorrectResponse();
    this.render();

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

  /** With the question on: ticks the author's key (of the variables shown). */
  showCorrectResponse = () => {
    if (this.settings.question !== "influence") return;
    this.store.dispatch({ type: "RESTORE", payload: { ...this.store.getState(), answer: keyOf(this.settings) } });
  };

  private get disabled() {
    return this.config.status === "review" || this.config.status === "solution";
  }

  render = () => {
    this.settings = parseSettings(this.config.properties as Record<string, unknown>); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={this.config.properties.prompt} settings={this.settings} store={this.store}
        texts={textsFor(this.settings.language)} disabled={this.disabled} />,
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
   * A record: the values of the sliders and the force (N, as shown), the variables the candidate changed, the recorded
   * measurements as JSON and their number; with the question on, the ticked variables, correct and score. Nothing
   * until the candidate did something.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const s = this.settings;
    const state = this.store.getState();
    if (!state.changed.length && !state.records.length && !state.answer.length) return undefined;
    const values = effective(s, state);
    const record: QtiRecordItem[] = [
      { name: "distance", base: { float: values.distance } },
      { name: "mass", base: { float: values.mass } },
      { name: "radius", base: { float: values.radius } },
      { name: "force", base: { float: shownForce(s, values) } },
      { name: "changed", base: { string: state.changed.join(";") } },
      { name: "measurements", base: { string: JSON.stringify(state.records) } },
      { name: "measurementCount", base: { integer: state.records.length } },
    ];
    if (s.question === "influence") {
      const score = scoreOf(s, state.answer);
      record.push(
        { name: "answer", base: { string: state.answer.join(";") } },
        { name: "correct", base: { integer: score } },
        { name: "score", base: { integer: score } },
      );
    }
    return { record };
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A record from getResponse back in the PCI: the values, the changed variables, the measurements and the answer. */
  setResponse = (response: QtiVariableJSON) => {
    if (!(response as any)?.record) return;
    const num = (name: string) => {
      const base = fieldOf(response, name);
      const v = Number(base?.float ?? base?.integer);
      return base && isFinite(v) ? v : null;
    };
    let records = [];
    try {
      const parsed = JSON.parse(fieldOf(response, "measurements")?.string ?? "[]");
      records = Array.isArray(parsed) ? parsed.map(validMeasurement).filter((m) => m !== null) : [];
    } catch {
      console.error("couldn't restore the measurements of the response");
    }
    const changed = parseVariables(fieldOf(response, "changed")?.string);
    const values = { distance: num("distance"), mass: num("mass"), radius: num("radius") };
    // only a variable the candidate changed was set by them; the others stay at the setting
    for (const v of Object.keys(values) as (keyof Values)[]) if (!changed.includes(v)) values[v] = null;
    this.store.dispatch({
      type: "RESTORE",
      payload: { values, changed, records, answer: parseVariables(fieldOf(response, "answer")?.string) },
    });
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.store.getActions(),
    });

  /** The values and the force the simulation shows now, for tests. */
  current = () => {
    const values = effective(this.settings, this.store.getState());
    return { ...values, force: shownForce(this.settings, values) };
  };
}

export default new App();
