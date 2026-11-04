// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Abeillepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import { IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, QtiRecordItem, ConfigProperties, PciProperties } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, LevelMap, StateModel, emptyState, initStore, validState } from "./store";
import { FACTOR_IDS, Settings, parseSettings } from "./settings";
import { answerKeyOf, isCorrect, levelsFor, populationOf } from "./model";
import { parseAnswer } from "./format";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems; the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("startpopulation"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

/** The field of a record response by name: { name, base } items, or a plain object. */
const fieldOf = (response: any, name: string): any => {
  const items = Array.isArray(response?.record) ? response.record : Array.isArray(response) ? response : null;
  if (items) {
    const item = items.find((f: any) => f?.name === name || f?.fieldIdentifier === name);
    return item?.base ? item.base.integer ?? item.base.float ?? item.base.string ?? item.base.identifier : item?.value;
  }
  return response?.[name];
};

let instances = 0;

class App implements IMSpci<PropTypes>, TAOpci {
  typeIdentifier = "beeColony";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  settings: Settings;
  private uid = `bee${++instances}`;

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
        // not a state of this PCI: start with every factor at 0
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    if (!stateString && this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (response && (response as any).record) this.setResponse(response);
    }

    // review with a question: show the key as the answer
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

  private get readOnly() {
    return ["review", "solution", "closed"].includes(String(this.config.status ?? ""));
  }

  /** In solution status: the key of the question as the answer (the sliders and the table stay the candidate's). */
  showCorrectResponse = () => {
    const key = answerKeyOf(this.settings);
    if (key === null) return;
    this.store.dispatch({ type: "RESTORE", payload: { ...this.store.getState(), answer: key } });
  };

  render = () => {
    this.settings = parseSettings(this.config.properties as Record<string, unknown>); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={this.config.properties.prompt} settings={this.settings} store={this.store}
        texts={textsFor(this.settings.language)} readOnly={this.readOnly} uid={this.uid} />,
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

  /** The answer as it goes in the response: a choice, or the typed number as a plain number ("45000"). */
  private answerOf = (state: StateModel): string => {
    const text = state.answer.trim();
    if (this.settings.question !== "predict" || !text) return text;
    const value = parseAnswer(text, this.settings.language);
    return value === null ? text : String(value);
  };

  /** The levels of the factors that are on, as response fields: { pesticide: 1, hornet: 0 }. */
  private levelFields = (levels: LevelMap) => {
    const own = levelsFor(this.settings, levels);
    return Object.fromEntries(this.settings.factors.map((f) => [f.id, own[f.id]]));
  };

  /**
   * A record: the final level of each factor that is on, the population, the recorded trials and every slider move
   * (JSON), and with a question the answer, correct, score and maxscore. Nothing until the candidate did something.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const s = this.settings;
    const state = this.store.getState();
    if (!state.history.length && !state.trials.length && !state.answer.trim()) return undefined;
    const levels = levelsFor(s, state.levels);
    const record: QtiRecordItem[] = s.factors.map((f) => ({ name: f.id, base: { integer: levels[f.id] } }));
    record.push({ name: "population", base: { integer: populationOf(s, levels) } });
    record.push({
      name: "trials",
      base: { string: JSON.stringify(state.trials.map((t) => ({ ...this.levelFields(t.levels), population: t.population }))) },
    });
    record.push({ name: "history", base: { string: JSON.stringify(state.history.map(this.levelFields)) } });
    const answer = this.answerOf(state);
    const withQuestion = s.question !== "none";
    const correct = withQuestion && isCorrect(s, answer);
    if (withQuestion) record.push({ name: "answer", base: { string: answer } });
    record.push({ name: "correct", base: { integer: correct ? 1 : 0 } });
    record.push({ name: "score", base: { integer: correct ? 1 : 0 } });
    record.push({ name: "maxscore", base: { integer: withQuestion ? 1 : 0 } });
    return { record } as QtiVariableJSON;
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A record from getResponse back in the PCI: levels, trials, moves and answer (the rest follows from them). */
  setResponse = (response: QtiVariableJSON) => {
    try {
      const levels: LevelMap = {};
      for (const id of FACTOR_IDS) {
        const value = Number(fieldOf(response, id));
        if (isFinite(value)) levels[id] = value;
      }
      const json = (name: string) => {
        const text = fieldOf(response, name);
        return typeof text === "string" && text.trim() ? JSON.parse(text) : [];
      };
      const split = (item: any) => {
        const { population, ...rest } = item ?? {};
        return { levels: rest, population };
      };
      const state = validState({
        levels,
        trials: json("trials").map(split),
        history: json("history"),
        answer: String(fieldOf(response, "answer") ?? ""),
      });
      if (!state) throw new Error("not a response of this PCI");
      this.store.restoreState(state, []);
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
