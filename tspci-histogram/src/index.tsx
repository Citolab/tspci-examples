// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/parcc/extension-parcc-tei/tree/master/views/js/pciCreator/dev/histogramInteraction,
// © 2014-2017 Parcc, Inc. (Sam Sipasseuth, Open Assessment Technologies)
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
import { Settings, evaluate, initialState, parseSettings, validHeights, validState } from "./histogram";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems; the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("charttype"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

/** A JSON array of heights as text, or a list of values: an array; else null. */
const arrayIn = (value: unknown): unknown[] | null => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return value.split(/[;\s]+/).filter(Boolean); // "4 9 8" or "4;9;8"
  }
};

/**
 * The heights in a response, in bar order: an ordered list (float, integer or string), a record with a heights field
 * (JSON), or a correct response's values ({ value: [...] } for a list, { value: { heights } } for a record).
 */
const heightsIn = (response: unknown): unknown[] | null => {
  if (response === undefined || response === null) return null;
  const r = response as any;
  const list = r.list?.float ?? r.list?.integer ?? r.list?.string;
  if (Array.isArray(list)) return list;
  if (Array.isArray(r.record)) return arrayIn(r.record.find((f: any) => f?.name === "heights")?.base?.string);
  if ("value" in r) return heightsIn(r.value);
  if (Array.isArray(r)) return r.map((v) => (typeof v === "object" && v !== null ? v.value ?? v.base?.float : v));
  if (typeof r.heights === "string" || Array.isArray(r.heights)) return arrayIn(r.heights);
  return null;
};

class App implements IMSpci<PropTypes>, TAOpci {
  typeIdentifier = "histogram";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  settings: Settings;

  private initialState: StateModel;
  // The correct heights: the response declaration's correct response (the engine's), else the author's / the data's.
  // See https://github.com/1EdTech/qti-project-management/issues/210
  private correctHeights: number[] | null = null;

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
    this.correctHeights = validHeights(heightsIn(declared), this.settings) ?? this.settings.correct;

    this.initialState = initialState(this.settings);
    this.store = initStore(this.initialState);
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        const state = validState(saved?.state, this.settings);
        if (state) this.store.restoreState(state, saved.log ?? []);
      } catch {
        // not a state of this PCI: start at the start heights
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && validHeights(heightsIn(response), this.settings)) {
        this.setResponse(response);
      }
    }

    // The item is in solution status: show the correct heights
    if (this.config.status === "solution") {
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

  /** Paints the correct heights; a delivery engine calls this when it moves a running interaction into review. */
  showCorrectResponse = () => {
    if (!this.correctHeights) return;
    this.store.dispatch({ type: "RESTORE", payload: { heights: this.correctHeights } });
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
        readOnly={status === "review" || status === "solution" || status === "closed"} solution={status === "solution"} />,
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

  /** The response for these heights: an ordered list of floats, or with data-scoring="pci" a record with the score. */
  private responseFor = (s: Settings, heights: number[]): QtiVariableJSON => {
    if (s.scoring !== "pci") return { list: { float: heights } } as QtiVariableJSON;
    const e = evaluate(s, heights);
    const record: QtiRecordItem[] = [
      { name: "score", base: { integer: e.score } },
      { name: "maxscore", base: { integer: e.maxscore } },
      { name: "correct", base: { integer: e.correct ? 1 : 0 } },
      { name: "barsCorrect", base: { integer: e.barsCorrect } },
      { name: "heights", base: { string: JSON.stringify(heights) } },
    ];
    return { record };
  };

  /**
   * The correct response for these properties, for an authoring system (config.tspci.correctResponse "properties"):
   * the correct heights as an ordered list. With PCI scoring the record needs no correct response, so none.
   */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const s = parseSettings({ ...defaults, ...normalize(properties as Record<string, string>) });
    return s.scoring === "pci" || !s.correct ? undefined : this.responseFor(s, s.correct);
  };

  /** Nothing until the candidate changed a height (README). */
  getResponse = (): QtiVariableJSON | undefined => {
    const state = this.store.getState();
    if (!state.touched) return undefined;
    return this.responseFor(this.settings, state.heights);
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response back in the PCI: an ordered list of heights or the record's heights field. */
  setResponse = (response: QtiVariableJSON) => {
    const heights = validHeights(heightsIn(response), this.settings);
    if (!heights) {
      console.error("couldn't restore the response", response);
      return;
    }
    this.store.dispatch({ type: "RESTORE", payload: { heights } });
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.store.getActions()
    });

  /** The comparison with the correct heights as the PCI sees it now, for tests and for a rater. */
  evaluation = () => evaluate({ ...this.settings, correct: this.correctHeights }, this.store.getState().heights);
}

export default new App();
