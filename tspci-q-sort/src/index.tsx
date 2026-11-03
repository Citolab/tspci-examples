// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/wordrank, © OpenPCI, Aarhus University and Aalborg University
// (Elias J.T. Hansen, Anna Rusmann, Jeppe Bundsgaard)
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
import { Actions, StateModel, UNSORTED, fitState, initStore } from "./store";
import {
  Layout,
  Response,
  parseLayout,
  parseResponse,
  pilesFromResponse,
  presentStatements,
  responsePiles,
  responseValues,
  slotCount,
  slotsFromResponse,
} from "./qsort";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("randomorder"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

class App implements IMSpci<PropTypes>, TAOpci {
  typeIdentifier = "qSort";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  /** The grid, the statements and the scale, from data-distribution, data-statements, data-values and the labels. */
  layout: Layout;

  // The correct response the delivery engine handed us at getInstance time.
  // See https://github.com/1EdTech/qti-project-management/issues/210
  private correctResponse: QtiVariableJSON | null = null;

  constructor() {
    if (ctx) {
      ctx.register(this);
    }
  }

  /** The cards for this candidate: an order, shuffled once and kept in the state. */
  private freshState = (): StateModel => ({
    presented: presentStatements(this.layout.statements.length, String(this.config.properties.randomOrder) === "true"),
    slots: Array(slotCount(this.layout.columns)).fill(null),
    piles: this.layout.statements.map(() => UNSORTED),
  });

  /** The state fitted to the statements and the grid there are now. */
  private fit = (state: Partial<StateModel> | undefined) =>
    fitState(state, this.layout.statements.length, slotCount(this.layout.columns));

  /** Every statement is in the grid (or the grid is full). */
  private complete = () => {
    const { slots, presented } = this.store.getState();
    const placed = slots.filter((s) => s !== null).length;
    return placed >= Math.min(slots.length, presented.length);
  };

  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string) => {
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration);
    this.layout = parseLayout(this.config.properties);

    // getState() saves { state, log }: the order of the cards the candidate got and where they are
    let restored: StateModel | null = null;
    let log = [];
    if (stateString) {
      try {
        const saved = JSON.parse(stateString);
        restored = this.fit(saved?.state);
        log = saved?.log ?? [];
      } catch {
        // not a state of this PCI: start afresh
      }
    }
    // a reset puts every card back on the stack but keeps the order the candidate got
    this.store = initStore(
      restored
        ? { ...restored, slots: restored.slots.map(() => null), piles: restored.piles.map(() => UNSORTED) }
        : this.freshState()
    );
    if (restored) this.store.restoreState(restored, log);

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (this.valueIn(response)) {
        this.setResponse(response);
      }
    }

    // The item is in solution status and the engine passed a correct response along:
    // show that on top of whatever was restored above. Both conditions have to hold,
    // so an engine that does not implement this keeps the behaviour it always had.
    if (this.config.status === "solution" && this.correctResponse) {
      this.showCorrectResponse();
    }

    // From here on, tell the Delivery System when the interaction changes (not for what it handed us above)
    this.store.subscribe(() => {
      const event: QtiInteractionChangedDetail = {
        interaction: this,
        responseIdentifier: this.config.responseIdentifier,
        valid: this.complete(),
        value: this.getResponse(),
      };
      // dispatch a custom event to notify the Delivery System that the interaction has changed
      const interactionChangedEvent = new CustomEvent("qti-interaction-changed", {
        detail: event,
      });
      dom.dispatchEvent(interactionChangedEvent);
    }, { immediate: false });

    this.config.onready && this.config.onready(this);
    return this;
  };

  /**
   * Paints the correct response received at getInstance time. A delivery engine
   * calls this when it moves an already running interaction into review.
   */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  private correctResponseFromDeclaration = (
    declaration: ConfigProperties<PropTypes>["responseDeclaration"]
  ): QtiVariableJSON | null => {
    const value = declaration?.correctResponse?.value;
    if (value === undefined || value === null) return null;
    return { base: { [declaration.baseType ?? "string"]: value } } as QtiVariableJSON;
  };

  /** The JSON in a response. */
  private valueIn = (response: QtiVariableJSON): string | null => {
    const value = response?.base?.string;
    return value === undefined || value === null || value === "" ? null : String(value);
  };

  render = () => {
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction layout={this.layout} store={this.store} texts={textsFor(this.config.properties.language)} />,
      this.shadowdom
    );
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  /** An authoring system changed a setting: the statements or their order shuffle again, the rest keeps what fits. */
  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    this.layout = parseLayout(this.config.properties);
    const state = key === "statements" || key === "randomOrder" ? this.freshState() : this.fit(this.store.getState());
    this.store.restoreState(state, []);
    this.render();
  };

  /**
   * The Q-sort: JSON of { sort, presort }, per statement in the authored order of the statements: the value of its
   * column in the grid and (with a pre-sort) its pile, −1, 0 or +1; null for one that is not in the grid or on a pile.
   * Nothing until the candidate placed a card.
   */
  getResponse = () => {
    const { slots, piles } = this.store.getState();
    const { statements, columns, values, presort } = this.layout;
    if (!slots.some((w) => w !== null) && !(presort && piles.some((p) => p !== UNSORTED))) {
      return undefined;
    }
    const response: Response = { sort: responseValues(statements.length, columns, values, slots) };
    if (presort) response.presort = responsePiles(statements.length, piles);
    return { base: { string: JSON.stringify(response) } };
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  setResponse = (response: QtiVariableJSON) => {
    if (!response) return;
    const value = this.valueIn(response);
    const { columns, values, statements } = this.layout;
    const parsed = value ? parseResponse(value) : null;
    if (!parsed) {
      this.resetResponse();
      return;
    }
    this.store.restoreState(
      {
        ...this.store.getState(),
        slots: slotsFromResponse(parsed.sort, columns, values, statements.length),
        piles: pilesFromResponse(parsed, columns, values, statements.length),
      },
      []
    );
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
