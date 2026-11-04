// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Broncopci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction, { levelOf } from "./interaction";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import { IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore, validState } from "./store";
import { Settings, parseSettings, PERSONS } from "./settings";
import { airwayAt, correctAnswer, isCorrect, levelsText, parseLevels, roundTo } from "./airway";
import { formatNumber, parseNumber } from "./format";
import { textsFor } from "./texts";

// config.json carries editor hints for authoring systems; the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("pollutionmax"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

type RecordField = { name: string; base: Record<string, number | string> };

/** A field of a record response, by name. */
const fieldOf = (response: any, name: string) =>
  Array.isArray(response?.record) ? response.record.find((f: RecordField) => f?.name === name)?.base ?? null : null;

class App implements IMSpci<PropTypes>, TAOpci {
  typeIdentifier = "bronchiole";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  settings: Settings;

  private initialState: StateModel = { level: null, levels: [], answer: "" };

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

    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && response?.record) this.setResponse(response);
    }

    // In solution status the PCI shows the correct answer, with the slider at the level it is about
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

  /** The correct answer of the settings in the answer field, and the slider at the level of the question. */
  showCorrectResponse = () => {
    const s = this.settings;
    const correct = correctAnswer(s);
    if (correct === null) return;
    const level = s.question === "threshold" ? correct : s.questionLevel;
    const state = this.store.getState();
    const levels = state.levels.length ? state.levels : [s.start];
    this.store.dispatch({
      type: "RESTORE",
      payload: { level, levels: levels[levels.length - 1] === level ? levels : [...levels, level], answer: formatNumber(correct, s.question === "ratio" ? 2 : 0, s.language) },
    });
  };

  render = () => {
    this.settings = parseSettings(this.config.properties as Record<string, unknown>); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    const status = this.config.status;
    render(
      <Interaction prompt={this.config.properties.prompt} settings={this.settings} store={this.store}
        texts={textsFor(this.settings.language)} disabled={status === "review" || status === "solution"} />,
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
   * A record: the pollution level, the area and airflow of each airway shown (% of normal), the levels the candidate
   * stopped at, and with a question the answer, correct, score and maxscore. Nothing until the candidate moved the
   * slider or typed an answer.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const s = this.settings;
    const state = this.store.getState();
    if (state.level === null && !state.answer.trim()) return undefined;
    const level = levelOf(s, state);
    const record: RecordField[] = [{ name: "pollution", base: { integer: level } }];
    for (const person of PERSONS) {
      if (!s.persons.includes(person)) continue;
      const airway = airwayAt(s, person, level);
      record.push({ name: `${person}Area`, base: { float: roundTo(airway.area, 2) } });
      record.push({ name: `${person}Flow`, base: { float: roundTo(airway.flow, 2) } });
    }
    record.push({ name: "levels", base: { string: levelsText(state.levels.length ? state.levels : [level]) } });
    if (s.question !== "none") {
      const answer = parseNumber(state.answer);
      const correct = isCorrect(s, answer);
      if (answer !== null) record.push({ name: "answer", base: { float: answer } });
      record.push({ name: "correct", base: { integer: correct ? 1 : 0 } });
      record.push({ name: "score", base: { integer: correct ? s.points : 0 } });
      record.push({ name: "maxscore", base: { integer: s.points } });
    }
    return { record } as unknown as QtiVariableJSON;
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A record of this PCI back in the simulation: the level, the levels and the answer; the rest follows. */
  setResponse = (response: QtiVariableJSON) => {
    const s = this.settings;
    const pollution = fieldOf(response, "pollution");
    const level = typeof pollution?.integer === "number" ? pollution.integer : parseNumber(pollution?.integer ?? pollution?.float ?? null);
    const levels = parseLevels(fieldOf(response, "levels")?.string).map((l) => Math.round(l));
    const answer = fieldOf(response, "answer")?.float;
    if (level === null && answer === undefined) {
      console.error("couldn't restore the response", response);
      return;
    }
    this.store.dispatch({
      type: "RESTORE",
      payload: {
        level: level === null ? null : Math.min(s.max, Math.max(s.min, Math.round(level))),
        levels,
        answer: typeof answer === "number" ? formatNumber(answer, (String(answer).split(".")[1] ?? "").length, s.language) : "",
      },
    });
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
