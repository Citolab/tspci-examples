// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/oat-sa/extension-tao-itemqti-pci/tree/develop/views/js/pciCreator/ims/mathEntryInteraction,
// © 2016-2022 Open Assessment Technologies SA (Christophe Noël)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import Authoring, { authoringProblems } from "./authoring";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import { IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, IMSpciAuthoringFactory, PciAuthoringConfiguration, PciAuthoringInstance } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore } from "./store";
import { Settings, convertAmbiguousSymbols, countGaps, gapsToString, parseSettings, stringToGaps } from "./math";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("usegapexpression"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

let instances = 0;

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "mathEntry";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  settings: Settings;
  private uid = "";

  private initialState: StateModel = { latex: "", gaps: [] };
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
    this.uid = `math-entry-${++instances}`;
    this.settings = parseSettings(this.config.properties);
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration);

    this.store = initStore(this.initialState);
    if (stateString) {
      try {
        const saved = typeof stateString === "string" ? JSON.parse(stateString) : stateString;
        if (saved?.state && (typeof saved.state.latex === "string" || Array.isArray(saved.state.gaps))) {
          // getState() saves { state, log }
          this.store.restoreState({ latex: saved.state.latex ?? "", gaps: saved.state.gaps ?? [] }, saved.log ?? []);
        } else if (saved?.response) {
          // the original's state: { response: { base: { string } } }
          this.setResponse(saved.response);
        }
      } catch {
        // not a state of this PCI: start empty
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (this.stringIn(response)) {
        this.setResponse(response);
      }
    }
    this.render();

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
        valid: true,
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
    return { base: { string: Array.isArray(value) ? value[0] : value } } as QtiVariableJSON;
  };

  /** The string in a response; null when there is none. */
  private stringIn = (response: QtiVariableJSON): string | null => {
    const value = response?.base?.string;
    return value === undefined || value === null || value === "" ? null : String(value);
  };

  private readOnly = () =>
    this.settings.reviewMode || this.config.status === "review" || this.config.status === "solution" || this.config.status === "closed";

  render = () => {
    this.settings = parseSettings(this.config.properties); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction settings={this.settings} store={this.store} texts={textsFor(this.settings.language)}
        readOnly={this.readOnly()} uid={this.uid} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author writes the expression with gaps; getProperties() gives data-gap-expression. Only an
   * authoring system calls this (AUTHORING.md, "Authoring mode"); delivery never does.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    const settings = parseSettings(properties);
    let expression = settings.gapExpression;
    const language = (config.language ?? settings.language ?? "en").slice(0, 2);
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={expression} settings={settings} language={language}
        onChange={(next) => { expression = next; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ gapExpression: expression }),
      validate: () => authoringProblems(expression, language),
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
    this.render();
  };

  /**
   * The formula as LaTeX, or in gap mode the gaps as a JSON array of LaTeX strings ('["2","15"]'), as the original;
   * nothing until the candidate typed something.
   */
  getResponse = () => {
    const { latex, gaps } = this.store.getState();
    let value: string;
    if (this.settings.gapMode) {
      const total = countGaps(this.settings.gapExpression);
      const filled = Array.from({ length: total }, (_, i) => convertAmbiguousSymbols(gaps[i] ?? ""));
      value = gapsToString(filled, this.settings.gapResponseIsJson);
    } else {
      value = convertAmbiguousSymbols(latex ?? "");
    }
    if (!value) return undefined;
    return {
      base: {
        string: value,
      },
    };
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  setResponse = (response: QtiVariableJSON) => {
    if (!response) return;
    const value = this.stringIn(response);
    if (value === null) {
      this.resetResponse();
    } else if (this.settings.gapMode) {
      this.store.restoreState({ latex: "", gaps: stringToGaps(value, this.settings.gapResponseIsJson) }, []);
    } else {
      this.store.restoreState({ latex: value, gaps: [] }, []);
    }
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
    (window as any).mathVirtualKeyboard?.hide?.();
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.store.getActions()
    });
}

export default new App();
