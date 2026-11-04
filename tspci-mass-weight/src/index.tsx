// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/ForceGravitepci and
// https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Delorpci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import { IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, QtiRecordItem } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore, initialState } from "./store";
import {
  ANSWER_FIELDS, AnswerField, Settings, formatNumber, num, parseSettings, readingsOf, scoreAnswers, usedOf, validBench, validReadings,
} from "./model";
import { textsFor } from "./texts";

// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("scaleonoff"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

/** A state from getState() or a response, checked against the settings. */
const validState = (s: Settings, value: any): StateModel | null => {
  const bench = validBench(s, value);
  if (!bench) return null;
  const answers: Partial<Record<AnswerField, string>> = {};
  for (const field of ANSWER_FIELDS) {
    const text = value?.answers?.[field];
    if (typeof text === "string") answers[field] = text;
  }
  return { ...bench, answers, readings: validReadings(value?.readings) };
};

let instances = 0;

class App implements IMSpci<PropTypes>, TAOpci {
  typeIdentifier = "massWeight";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  settings: Settings;
  private uid = `mw-${++instances}`;

  /** Only the module's own object registers; every interaction gets an object of its own (getInstance). */
  constructor(register = true) {
    if (register && ctx) {
      ctx.register(this);
    }
  }

  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App =>
    new App(false).setup(dom, config, stateString);

  private setup = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App => {
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.settings = parseSettings(this.config.properties as Record<string, unknown>);

    this.store = initStore(initialState(this.settings), () => this.settings);
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        const state = validState(this.settings, saved?.state);
        if (state) this.store.restoreState(state, Array.isArray(saved.log) ? saved.log : []);
      } catch {
        // not a state of this PCI: start with an empty bench
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    this.render();

    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && response?.record) this.setResponse(response);
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

  private get readOnly() {
    return ["solution", "review", "closed"].includes(String(this.config.status ?? ""));
  }

  render = () => {
    this.settings = parseSettings(this.config.properties as Record<string, unknown>); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={this.config.properties.prompt} s={this.settings} store={this.store} t={textsFor(this.settings.language)}
        readOnly={this.readOnly} uid={this.uid} />,
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

  /** Nothing done yet: no readings, no answers, everything on the table. */
  private pristine = (state: StateModel) =>
    !state.readings.length && !Object.keys(state.placements).length && state.water === 0 && state.place === this.settings.places[0].id &&
    !Object.values(state.answers).some((a) => (a ?? "").trim() !== "");

  /**
   * A record: with answer fields score, maxscore and correct, and the numbers the candidate typed (mass, weight,
   * volume, density); always used ("earth:scale moon:dynamometer"), readings (every reading, JSON) and bench (where
   * everything is at the end, JSON). Nothing until the candidate did something.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const s = this.settings;
    const state = this.store.getState();
    if (this.pristine(state)) return undefined;
    const record: QtiRecordItem[] = [];
    if (s.answers.length) {
      const score = scoreAnswers(s, state.answers);
      record.push({ name: "score", base: { integer: score.score } });
      record.push({ name: "maxscore", base: { integer: score.maxscore } });
      record.push({ name: "correct", base: { integer: score.score === score.maxscore ? 1 : 0 } });
      for (const field of s.answers) {
        if (score.values[field] !== undefined) record.push({ name: field, base: { float: score.values[field] } });
      }
    }
    const { readings, answers: _answers, ...bench } = state;
    record.push({ name: "used", base: { string: usedOf(readings) } });
    record.push({ name: "readings", base: { string: JSON.stringify(readings) } });
    record.push({ name: "bench", base: { string: JSON.stringify(bench) } });
    return { record };
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A record from getResponse(): the bench, the readings and the answers come back. */
  setResponse = (response: QtiVariableJSON) => {
    const s = this.settings;
    const fields = Array.isArray(response?.record) ? response.record : [];
    const field = (name: string) => fields.find((f) => f?.name === name)?.base;
    try {
      const bench = JSON.parse(String(field("bench")?.string ?? "{}"));
      const readings = JSON.parse(String(field("readings")?.string ?? "[]"));
      const answers: Partial<Record<AnswerField, string>> = {};
      for (const name of s.answers) {
        const value = num(field(name)?.float ?? field(name)?.integer ?? field(name)?.string);
        if (value !== null) answers[name] = formatNumber(value, s.language, 6);
      }
      const state = validState(s, { ...bench, readings, answers });
      if (state) this.store.dispatch({ type: "RESTORE", payload: state });
    } catch {
      console.error("couldn't restore the response", response);
    }
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.store.getActions(),
    });

  /** What each instrument shows now, for tests. */
  current = () => readingsOf(this.settings, this.store.getState());
}

export default new App();
