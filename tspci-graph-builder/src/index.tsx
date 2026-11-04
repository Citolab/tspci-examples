// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Lentillespci,
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
import { Actions, StateModel, initStore } from "./store";
import { GraphState, Settings, evaluate, initialState, parseSettings, sameState, serializeGraph, serializeTable, solutionState, validState } from "./graph";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems; the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("tablestep"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

/** A field of a record response, from { record: [{ name, base }] } or from a correct response's values. */
const fieldText = (value: any, name: string): string | null => {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value?.record)) {
    const base = value.record.find((f: any) => f?.name === name)?.base;
    return typeof base?.string === "string" ? base.string : null;
  }
  if (typeof value?.[name] === "string") return value[name];
  if (Array.isArray(value)) {
    for (const v of value) {
      if ((v?.fieldIdentifier ?? v?.name) === name) return typeof v.value === "string" ? v.value : v.base?.string ?? null;
    }
  }
  return null;
};

/** The work in a response: the graph field with the table field; null when there is none. */
const stateFromResponse = (value: unknown, s: Settings): GraphState | null => {
  const graph = fieldText(value, "graph");
  if (!graph) return null;
  try {
    const table = fieldText(value, "table");
    return validState({ ...JSON.parse(graph), table: table ? JSON.parse(table) : undefined }, s);
  } catch {
    return null;
  }
};

class App implements IMSpci<PropTypes>, TAOpci {
  typeIdentifier = "graphBuilder";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  settings: Settings;

  private initialState: StateModel;
  // The correct response the delivery engine handed us at getInstance time, or else the finished graph of the data.
  // See https://github.com/1EdTech/qti-project-management/issues/210
  private correctResponse: QtiVariableJSON | null = null;

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
    const declared = config.responseDeclaration?.correctResponse;
    const fromDeclaration = stateFromResponse((declared as any)?.value ?? declared, this.settings);
    this.correctResponse = this.responseFor(fromDeclaration ?? solutionState(this.settings));

    this.initialState = initialState(this.settings);
    this.store = initStore(this.initialState);
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

    // The item is in solution status: show the correct response (the engine's, or the finished graph of the data)
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

  /** Paints the correct response; a delivery engine calls this when it moves a running interaction into review. */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
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

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    window.requestAnimationFrame(() => this.render());
  };

  /** The record for the candidate's work: the score, a field per check, and the graph and the table as JSON. */
  private responseFor = (state: GraphState): QtiVariableJSON => {
    const e = evaluate(this.settings, state);
    const record: QtiRecordItem[] = [
      { name: "score", base: { integer: e.score } },
      { name: "maxscore", base: { integer: e.maxscore } },
      { name: "correct", base: { integer: e.correct ? 1 : 0 } },
      { name: "checkTable", base: { integer: e.results.table ? 1 : 0 } },
      { name: "checkAxes", base: { integer: e.results.axes ? 1 : 0 } },
      { name: "checkScale", base: { integer: e.results.scale ? 1 : 0 } },
      { name: "checkPoints", base: { integer: e.results.points ? 1 : 0 } },
      { name: "checkLine", base: { integer: e.results.line ? 1 : 0 } },
      { name: "tableCells", base: { integer: e.tableCells } },
      { name: "pointsMatched", base: { integer: e.pointsMatched } },
      { name: "graph", base: { string: serializeGraph(state) } },
      { name: "table", base: { string: serializeTable(state) } },
    ];
    return { record };
  };

  /** A record (README): nothing until the candidate changed something. */
  getResponse = (): QtiVariableJSON | undefined => {
    const state = this.store.getState();
    if (sameState(state, this.initialState)) return undefined;
    return this.responseFor(state);
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response back in the PCI: only its graph and table count, the rest follows from them. */
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
