// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/oatymart/html-template-interaction-pci, © 2024 Martin Nicholson and Open Assessment Technologies SA
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction, { valueOf } from "./interaction";
import Authoring, { authoringProblems } from "./authoring";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import { IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, IMSpciAuthoringFactory, PciAuthoringConfiguration, PciAuthoringInstance } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore } from "./store";
import { DEFAULT_HTML, Field, Template, Value, prepare } from "./template";
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

type RecordEntry = { name: string; base: Record<string, string | boolean> | null };

/** A value from a record entry, as the field's type: "true" from TAO is a boolean too. */
const fromEntry = (field: Field, entry: RecordEntry | undefined): Value => {
  const raw = entry?.base ? Object.values(entry.base)[0] : null;
  if (field.baseType === "boolean") return raw === true || raw === "true";
  return raw === null || raw === undefined || raw === "" ? null : String(raw);
};

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "htmlTemplate";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  /** data-html, sanitised, with its response fields; without it the example fact sheet. */
  template: Template;

  private initialState: StateModel = { values: {} };

  constructor() {
    if (ctx) {
      ctx.register(this);
    }
  }

  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, state: string) => {
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.parseSettings();

    this.store = initStore(this.initialState);
    this.restore(state);

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (response?.record?.length) {
        this.setResponse(response);
      }
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

  /**
   * getState() saves { state, log }; the original saved { response }: both restore. Some hosts hand the state back per
   * response identifier ({ RESPONSE: "<getState()>" }).
   */
  private restore = (saved: string | object) => {
    if (!saved) return;
    try {
      let parsed = typeof saved === "string" ? JSON.parse(saved) : saved;
      const inner = parsed && !parsed.state && !parsed.response ? Object.values(parsed)[0] : undefined;
      if (typeof inner === "string") parsed = JSON.parse(inner);
      if (parsed?.state?.values && typeof parsed.state.values === "object") {
        this.store.restoreState({ values: parsed.state.values }, parsed.log ?? []);
      } else if (parsed?.response?.record) {
        this.store.restoreState({ values: this.valuesFrom(parsed.response) }, []);
      }
    } catch {
      // not a state of this PCI: start with the HTML's own values
    }
  };

  private parseSettings = () => {
    this.template = prepare(this.config.properties.html || DEFAULT_HTML);
  };

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    const status = this.config.status;
    render(
      <Interaction template={this.template} prompt={this.config.properties.prompt} store={this.store}
        texts={textsFor(this.config.properties.language)} readOnly={status === "review" || status === "solution" || status === "closed"} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author writes the HTML next to a live preview; getProperties() gives data-html. Only an authoring
   * system calls this (AUTHORING.md, "Authoring mode"); delivery never does.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    let html = properties.html || DEFAULT_HTML;
    const language = (config.language ?? properties.language ?? "en").slice(0, 2);
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(<Authoring initial={html} language={language} onChange={(next) => { html = next; config.onchange?.(); }} />, host);
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ html }),
      validate: () => authoringProblems(html, language),
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

  /** The values of a record response, per field; a field the record does not mention is empty. */
  private valuesFrom = (response: QtiVariableJSON): Record<string, Value> => {
    const entries = (response?.record ?? []) as RecordEntry[];
    return this.template.fields.reduce((acc, f) => {
      acc[f.name] = fromEntry(f, entries.find((e) => e.name === f.name));
      return acc;
    }, {} as Record<string, Value>);
  };

  /**
   * A record with an entry per field, in the order of the HTML, as the original: a text field or a select gives a
   * string or identifier (or base null when empty), a checkbox a boolean, a radio group the value of the checked one.
   */
  getResponse = () => {
    const { values } = this.store.getState();
    return {
      record: this.template.fields.map((field) => {
        const value = valueOf(field, values);
        return { name: field.name, base: value === null ? null : { [field.baseType]: value } };
      }),
    } as QtiVariableJSON;
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  setResponse = (response: QtiVariableJSON) => {
    if (!response?.record?.length) {
      this.resetResponse();
      return;
    }
    this.store.restoreState({ values: this.valuesFrom(response) }, []);
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
