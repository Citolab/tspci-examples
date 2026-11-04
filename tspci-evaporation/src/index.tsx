// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/MaraisSalantpci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction, { Clock } from "./interaction";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import { IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, QtiRecordItem } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, Run, StateModel, initStore, initialState, validContainers, validState } from "./store";
import { Settings, parseSettings } from "./settings";
import { isFairTest, variedVariables } from "./model";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems; the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("runseconds"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

/** A field of a record response (or of a saved value). */
const fieldOf = (response: any, name: string) =>
  Array.isArray(response?.record) ? response.record.find((f: any) => f?.name === name)?.base : undefined;

/**
 * The run the score is about: the last completed run that was a fair test, else the last completed run; null when no
 * run was completed.
 */
export const countedRun = (runs: Run[], target: Settings["target"]): Run | null => {
  const completed = runs.filter((r) => r.completed);
  return [...completed].reverse().find((r) => isFairTest(r.containers, target)) ?? completed[completed.length - 1] ?? null;
};

class App implements IMSpci<PropTypes>, TAOpci {
  typeIdentifier = "evaporation";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  settings: Settings;
  /** The hours on the clock while the experiment runs (the store has them at a pause, the end or a reset). */
  clock: Clock = { elapsed: 0 };

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

    this.store = initStore(initialState(this.settings));
    let restored = false;
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        const state = validState(this.settings, saved?.state);
        if (state) {
          this.store.restoreState(state, saved.log ?? []);
          this.clock.elapsed = state.elapsed;
          restored = true;
        }
      } catch {
        // not a state of this PCI: start at the settings
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    this.render();

    if (!restored && this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const response = this.config.boundTo[Object.keys(this.config.boundTo)[0]];
      if (response) this.setResponse(response);
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
    const status = this.config.status;
    return status === "review" || status === "solution" || status === "closed";
  }

  render = () => {
    this.settings = parseSettings(this.config.properties as Record<string, unknown>); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={this.config.properties.prompt} settings={this.settings} store={this.store} clock={this.clock}
        readOnly={this.readOnly} texts={textsFor(this.settings.language)} />,
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
   * A record: score (1 when a completed run was a fair test of the target), fairTest and ran for the counted run (or
   * the current design when no run was completed), varied, runCount, and the containers, results and runs as JSON.
   * Nothing until the candidate changed a setting or started the experiment.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const state = this.store.getState();
    if (!state.touched) return undefined;
    const target = this.settings.target;
    const run = countedRun(state.runs, target);
    const containers = run?.containers ?? state.containers;
    const fair = isFairTest(containers, target);
    const ran = run !== null;
    const record: QtiRecordItem[] = [
      { name: "score", base: { integer: ran && fair ? 1 : 0 } },
      { name: "fairTest", base: { integer: fair ? 1 : 0 } },
      { name: "ran", base: { integer: ran ? 1 : 0 } },
      { name: "varied", base: { string: variedVariables(containers).join(";") } },
      { name: "runCount", base: { integer: state.runs.filter((r) => r.completed).length } },
      { name: "containers", base: { string: JSON.stringify(containers) } },
      { name: "results", base: { string: JSON.stringify(run?.results ?? []) } },
      { name: "runs", base: { string: JSON.stringify(state.runs) } },
    ];
    return { record };
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.clock.elapsed = 0;
    this.store.reset();
  };

  /** A response back: the runs, and the containers of the last run (or of the response) as the current design. */
  setResponse = (response: QtiVariableJSON) => {
    try {
      const runsText = fieldOf(response, "runs")?.string;
      const containersText = fieldOf(response, "containers")?.string;
      if (!runsText && !containersText) return;
      const runs = runsText ? JSON.parse(runsText) : [];
      const last = Array.isArray(runs) && runs.length ? runs[runs.length - 1].containers : null;
      const state = validState(this.settings, {
        containers: last ?? (containersText ? JSON.parse(containersText) : []),
        phase: "setup",
        runs,
        touched: true,
      });
      if (!state) throw new Error("not a response of this PCI");
      this.clock.elapsed = 0;
      this.store.dispatch({ type: "RESTORE", payload: state });
    } catch {
      console.error("couldn't restore the response", response);
      this.resetResponse();
    }
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
  };

  /** The state with the hours on the clock now: a run that is going is saved halfway (and comes back paused). */
  getState = () => {
    const state = this.store.getState();
    const elapsed = state.phase === "running" ? this.clock.elapsed : state.elapsed;
    return JSON.stringify({
      state: { ...state, elapsed },
      log: this.store.getActions(),
    });
  };

  /** The containers as the experiment has them now, for tests. */
  current = () => validContainers(this.settings, this.store.getState().containers);
}

export default new App();
