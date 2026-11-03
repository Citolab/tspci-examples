import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import Authoring, { Settings, authoredConfig, authoringProblems } from "./authoring";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import { IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, IMSpciAuthoringFactory, PciAuthoringConfiguration, PciAuthoringInstance } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, EMPTY, StateModel, initStore } from "./store";
import { Model, correctValue, parseReading, readModel, readingText } from "./instrument";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("instrument", "precision"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

/** The number in a response, a correct response or a saved value: a float, a double, an integer or a numeric string. */
const numberOf = (value: any): number | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value.trim().replace(",", "."));
    return value.trim() !== "" && Number.isFinite(n) ? n : null;
  }
  if (Array.isArray(value)) return numberOf(value[0]);
  if (value.base) return numberOf(value.base.float ?? value.base.double ?? value.base.integer ?? value.base.string);
  if (value.value !== undefined) return numberOf(value.value);
  return null;
};

let instances = 0;

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "measuringInstrument";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  model: Model;
  private uid = `mi-${++instances}`;

  // The correct response the delivery engine handed us at getInstance time, or else the one from the settings.
  // See https://github.com/1EdTech/qti-project-management/issues/210
  private correctResponse: QtiVariableJSON | null = null;

  /** Only the module's own object registers; every interaction gets an object of its own (getInstance). */
  constructor(register = true) {
    if (register && ctx) {
      ctx.register(this);
    }
  }

  /** Every interaction on the page gets an object of its own, with its own store and settings. */
  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App => {
    const instance = new App(false);
    return instance.setup(dom, config, stateString);
  };

  private setup = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App => {
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.parseSettings();
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration) ?? this.getCorrectResponse(config.properties) ?? null;

    this.store = initStore({ ...EMPTY });
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        const s = saved?.state;
        if (s && typeof s === "object") {
          this.store.restoreState({
            text: typeof s.text === "string" ? s.text : "",
            value: typeof s.value === "number" && Number.isFinite(s.value) ? s.value : null,
            range: typeof s.range === "number" && this.model.ranges.includes(s.range) ? s.range : null,
          }, saved.log ?? []);
        }
      } catch {
        // not a state of this PCI: start without an answer
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && numberOf(response) !== null) {
        this.setResponse(response);
      }
    }

    // The item is in solution status: show the correct response on top of whatever was restored above.
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
   * Shows the correct response received at getInstance time (or the one from the settings). A delivery engine calls
   * this when it moves an already running interaction into review.
   */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  private correctResponseFromDeclaration = (
    declaration: ConfigProperties<PropTypes>["responseDeclaration"]
  ): QtiVariableJSON | null => {
    const v = numberOf((declaration as any)?.correctResponse?.value ?? (declaration as any)?.correctResponse);
    return v === null ? null : ({ base: { float: v } } as QtiVariableJSON);
  };

  private parseSettings = () => {
    this.model = readModel(this.config.properties as unknown as Record<string, string>);
  };

  private get readOnly() {
    return ["solution", "review", "closed"].includes(String(this.config.status ?? ""));
  }

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={this.config.properties.prompt} m={this.model} store={this.store} t={textsFor(this.model.language)}
        readOnly={this.readOnly} uid={this.uid} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author picks the instrument and the task, sets up the scale and drags the value on a live
   * preview; getProperties() gives the settings. Only an authoring system calls this (AUTHORING.md, "Authoring mode").
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) } as unknown as Settings;
    let settings = authoredConfig(properties);
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={properties} language={language} onChange={(next) => { settings = next; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => authoredConfig(settings),
      validate: () => authoringProblems(settings, language),
      oncompleted: () => render(null, host),
    };
    config.onready?.(instance);
    return instance;
  };

  /** The correct response from the settings (AUTHORING.md, "The correct response from the settings"). */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const p = { ...defaults, ...normalize(properties as Record<string, string>) } as unknown as Record<string, string>;
    const v = correctValue(readModel(p));
    return v === null ? undefined : ({ base: { float: v } } as QtiVariableJSON);
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    window.requestAnimationFrame(() => this.render());
  };

  /**
   * A float in the unit of the instrument, the same in every language: what the candidate typed (read), the value
   * they set (set) or the range they chose (range). A clock: minutes after 12 o'clock. Nothing until there is one.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const { text, value, range } = this.store.getState();
    const v = this.model.mode === "read" ? parseReading(this.model.kind, text) : this.model.mode === "set" ? value : range;
    return v === null || v === undefined ? undefined : ({ base: { float: v } } as QtiVariableJSON);
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  setResponse = (response: QtiVariableJSON) => {
    const v = numberOf(response);
    if (v === null) return;
    const m = this.model;
    if (m.mode === "read") this.store.restoreState({ ...EMPTY, text: readingText(m.kind, v, m.language) }, []);
    else if (m.mode === "set") this.store.restoreState({ ...EMPTY, value: Math.max(m.low, Math.min(m.high, v)) }, []);
    else if (m.ranges.includes(v)) this.store.restoreState({ ...EMPTY, range: v }, []);
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
