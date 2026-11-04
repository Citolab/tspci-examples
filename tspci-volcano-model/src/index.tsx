// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Volcanismepci,
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
import { Actions, StateModel, initStore, initialState, validState } from "./store";
import { OUTCOMES, Settings, answersText, parseAnswers, parseSettings, scoreAnswers, validExperiment } from "./model";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems; the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("maxtablets"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

/** A field of a record response: { record: [{ name, base }] }. */
const field = (response: any, name: string) => {
  const item = Array.isArray(response?.record) ? response.record.find((f: any) => f?.name === name) : undefined;
  return item?.base ? Object.values(item.base)[0] : undefined;
};

class App implements IMSpci<PropTypes>, TAOpci {
  typeIdentifier = "volcanoModel";
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

  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App =>
    new App(false).setup(dom, config, stateString);

  private setup = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App => {
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.settings = parseSettings(this.config.properties as Record<string, unknown>);

    this.store = initStore(initialState());
    let restored = false;
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        const state = validState(saved?.state);
        if (state) {
          this.store.restoreState(state, saved.log ?? []);
          restored = true;
        }
      } catch {
        // not a state of this PCI: start empty
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (!restored && this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (Array.isArray((response as any)?.record)) this.setResponse(response);
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

  render = () => {
    this.settings = parseSettings(this.config.properties as Record<string, unknown>); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={this.config.properties.prompt} settings={this.settings} store={this.store}
        texts={textsFor(this.settings.language)} readOnly={!!this.config.status && this.config.status !== "interacting"} />,
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
   * A record: the experiments (JSON), their number, the outcomes seen, the number of resets and, with a task, the
   * answers with score, maxscore and correct. Nothing until the candidate ran an experiment or answered.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const state = this.store.getState();
    const answered = Object.keys(state.answers).length > 0;
    if (!state.experiments.length && !answered) return undefined;
    const seen = OUTCOMES.filter((o) => state.experiments.some((x) => x.outcome === o));
    const record: QtiRecordItem[] = [
      { name: "experiments", base: { string: JSON.stringify(state.experiments) } },
      { name: "count", base: { integer: state.experiments.length } },
      { name: "outcomes", base: { string: seen.join(";") } },
      { name: "resets", base: { integer: state.resets } },
    ];
    if (this.settings.task !== "none") {
      const { score, maxscore, correct } = scoreAnswers(this.settings, state.answers);
      record.push(
        { name: "answers", base: { string: answersText(state.answers) } },
        { name: "score", base: { integer: score } },
        { name: "maxscore", base: { integer: maxscore } },
        { name: "correct", base: { integer: correct } }
      );
    }
    return { record };
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A record back in the PCI: the experiments and the answers; the tube shows the last experiment. */
  setResponse = (response: QtiVariableJSON) => {
    try {
      const text = field(response, "experiments");
      const experiments = typeof text === "string" && text ? (JSON.parse(text) as unknown[]).map(validExperiment).filter(Boolean) : [];
      const answers = parseAnswers(field(response, "answers"));
      const resets = Number(field(response, "resets")) || 0;
      const last = experiments[experiments.length - 1];
      const state = validState({
        phase: last ? "erupted" : "empty",
        viscosity: last?.viscosity ?? null,
        tablets: last?.tablets ?? 1,
        experiments,
        answers,
        resets,
      });
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
      log: this.store.getActions()
    });
}

export default new App();
