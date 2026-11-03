// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/svgmap, © OpenPCI (Aarhus University and Aalborg University):
// Elias J.T. Hansen, Anna Rusmann and Jeppe Bundsgaard.
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026.

import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction, { ShowPoi } from "./interaction";
import Authoring, { authoringProblems, problemText } from "./authoring";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import { IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, IMSpciAuthoringFactory, PciAuthoringConfiguration, PciAuthoringInstance } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore } from "./store";
import { MapModel, Poi, Scoring, loadMap, parsePoi, parseScoring, routeResult, serializePoi, serializeScoring, startOf, validRoute } from "./map";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems: back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

const parseShowPoi = (value: unknown): ShowPoi => (value === "labels" || value === "none" ? value : "markers");

/** The response is the original's JSON text: { "path": [...], "poi": [...], "score": ... }. */
const routeIn = (response: QtiVariableJSON | undefined): unknown => {
  const text = response?.base?.string;
  if (typeof text !== "string" || !text.trim()) return null;
  try {
    return JSON.parse(text)?.path ?? null;
  } catch {
    return null;
  }
};

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "svgMap";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  map: MapModel;
  poi: Poi;
  scoring: Scoring;
  /** The routes before each step, for Undo. */
  history: number[][] = [];

  private scratch: HTMLDivElement;
  private host: HTMLDivElement;
  // The correct response the delivery engine handed us at getInstance time.
  // See https://github.com/1EdTech/qti-project-management/issues/210
  private correctResponse: QtiVariableJSON | null = null;

  constructor() {
    if (ctx) {
      ctx.register(this);
    }
  }

  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string) => {
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration);

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    // the map is measured in the scratch element before it is shown
    this.scratch = document.createElement("div");
    this.scratch.setAttribute("aria-hidden", "true");
    this.scratch.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none";
    this.host = document.createElement("div");
    this.shadowdom.replaceChildren(css, this.scratch, this.host);
    this.parseSettings();

    this.store = initStore({ path: startOf(this.poi) });
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        const path = validRoute(this.map, saved?.state?.path);
        if (path.length) this.store.restoreState({ path }, saved.log ?? []);
      } catch {
        // not a state of this PCI: start without a route
      }
    }

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (routeIn(response)) {
        this.setResponse(response);
      }
    }

    // The item is in solution status and the engine passed a correct response along: show that.
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

  /** Paints the correct response received at getInstance time. */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  private correctResponseFromDeclaration = (
    declaration: ConfigProperties<PropTypes>["responseDeclaration"]
  ): QtiVariableJSON | null => {
    const value = declaration?.correctResponse?.value;
    if (value === undefined || value === null) return null;
    return { base: { string: String(value) } } as QtiVariableJSON;
  };

  private parseSettings = () => {
    const p = this.config.properties;
    this.map = loadMap(p.backdrop, p.pathlayer, p.dotresolution, this.scratch);
    this.poi = parsePoi(p.poi, this.map);
    this.scoring = parseScoring(p.requiredpoi, p.endpoi, p.shortest);
  };

  render = () => {
    const p = this.config.properties;
    const texts = textsFor(p.language);
    render(
      <Interaction map={this.map} poi={this.poi} store={this.store} texts={texts} prompt={p.prompt}
        showPoi={parseShowPoi(p.showpoi)} history={this.history} problem={problemText(this.map.problem, texts)} />,
      this.host
    );
  };

  /**
   * Authoring mode: the author uploads the map and places the start and the points of interest; getProperties() gives
   * data-backdrop, data-poi, data-requiredpoi and data-endpoi. Only an authoring system calls this; delivery never does.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    const language = (config.language ?? properties.language ?? "en").slice(0, 2);
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    const host = document.createElement("div");
    shadow.replaceChildren(css, host);
    let current: { backdrop: string; poi: Poi; scoring: Scoring; map: MapModel | null } = {
      backdrop: properties.backdrop, poi: {}, scoring: parseScoring(properties.requiredpoi, properties.endpoi, properties.shortest), map: null,
    };
    render(
      <Authoring initial={{ backdrop: properties.backdrop, poi: properties.poi, requiredpoi: properties.requiredpoi, endpoi: properties.endpoi }} layer={properties.pathlayer}
        resolution={properties.dotresolution} language={language}
        onChange={(next) => { current = next; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ backdrop: current.backdrop, poi: serializePoi(current.poi), ...serializeScoring(current.scoring) }),
      validate: () => (current.map ? authoringProblems(current.map, current.poi, current.scoring, language) : []),
      oncompleted: () => render(null, host),
    };
    config.onready?.(instance);
    return instance;
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    this.parseSettings();
    // another map or other points: the route may not fit any more
    const path = validRoute(this.map, this.store.getState().path);
    this.history.length = 0;
    this.store.restoreState({ path: path.length ? path : startOf(this.poi) }, []);
    this.render();
  };

  /** The original's response: JSON text { path, poi, score }; nothing until the candidate drew a route. */
  getResponse = () => {
    const { path } = this.store.getState();
    if (path.length < 2) {
      return undefined;
    }
    return {
      base: {
        string: JSON.stringify(routeResult(this.map, path, this.poi, this.scoring)),
      },
    };
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.history.length = 0;
    this.store.restoreState({ path: startOf(this.poi) }, []);
  };

  setResponse = (response: QtiVariableJSON) => {
    if (!response) return;
    const path = validRoute(this.map, routeIn(response));
    if (path.length) {
      this.history.length = 0;
      this.store.restoreState({ path }, []);
    } else {
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
