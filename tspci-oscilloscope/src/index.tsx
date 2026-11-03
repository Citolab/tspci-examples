import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import Authoring, { Signals, authoringProblems } from "./authoring";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import { IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, IMSpciAuthoringFactory, PciAuthoringConfiguration, PciAuthoringInstance } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore } from "./store";
import { Settings, clamp, parsePair, parseSettings } from "./settings";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("referencefrequency"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

/** The response: [frequency, amplitude] as an ordered list of floats. */
const responseOf = (frequency: number, amplitude: number): QtiVariableJSON => ({ list: { float: [frequency, amplitude] } });

/** [frequency, amplitude] from a response or a correct response, however the engine wrote it. */
const pairOf = (response: QtiVariableJSON | null | undefined): [number, number] | null =>
  parsePair(response?.list?.float ?? response?.list?.string ?? response?.base?.string ?? null);

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "oscilloscope";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  settings: Settings;

  // The correct response the delivery engine handed us at getInstance time.
  // See https://github.com/1EdTech/qti-project-management/issues/210
  private correctResponse: QtiVariableJSON | null = null;

  /** The registered object only makes instances; each instance (register = false) has its own store and settings. */
  private readonly factory: boolean;

  constructor(register = true) {
    this.factory = register;
    if (register && ctx) {
      ctx.register(this);
    }
  }

  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App => {
    // several oscilloscopes in an item (or on a page): every interaction gets an object of its own
    if (this.factory) return new App(false).getInstance(dom, config, stateString);
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration);
    this.settings = parseSettings(this.config.properties);

    // the candidate starts at the start setting; that is not a response yet
    this.store = initStore({ ...this.settings.start, touched: false });
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        const s = saved?.state;
        if (s && Number.isFinite(s.frequency) && Number.isFinite(s.amplitude)) {
          this.store.restoreState({ frequency: s.frequency, amplitude: s.amplitude, touched: !!s.touched }, saved.log ?? []);
        }
      } catch {
        // not a state of this PCI: start as the author set it up
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && pairOf(response)) {
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
    const pair = parsePair(declaration?.correctResponse?.value);
    return pair ? responseOf(pair[0], pair[1]) : null;
  };

  /**
   * Not part of QTI 3: the correct response for these settings (correctFrequency, correctAmplitude), for an
   * authoring system (config.tspci.correctResponse "settings"). Never touches the DOM.
   */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const { correct } = parseSettings({ ...defaults, ...normalize(properties as Record<string, string>) });
    return correct ? responseOf(correct.frequency, correct.amplitude) : undefined;
  };

  render = () => {
    this.settings = parseSettings(this.config.properties); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    const status = this.config.status;
    render(
      <Interaction prompt={this.config.properties.prompt} settings={this.settings} store={this.store}
        texts={textsFor(this.settings.language)} disabled={status === "closed" || status === "review" || status === "solution"} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author sets the reference, the candidate's start and the correct setting with the same
   * screen and knobs; getProperties() gives the six numbers. Only an authoring system calls this (AUTHORING.md,
   * "Authoring mode"); delivery never does.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    const settings = parseSettings(properties);
    let signals: Signals = { reference: settings.reference, start: settings.start, correct: settings.correct };
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring settings={settings} initial={signals} language={language}
        onChange={(next) => { signals = next; config.onchange?.(); }} />,
      host
    );
    const text = (n: number | undefined) => (n === undefined ? "" : String(n));
    const instance: PciAuthoringInstance = {
      getProperties: () => ({
        referenceFrequency: text(signals.reference.frequency),
        referenceAmplitude: text(signals.reference.amplitude),
        startFrequency: text(signals.start.frequency),
        startAmplitude: text(signals.start.amplitude),
        correctFrequency: text(signals.correct?.frequency),
        correctAmplitude: text(signals.correct?.amplitude),
      }),
      validate: () => authoringProblems(settings, signals, language),
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
    window.requestAnimationFrame(() => this.render());
  };

  /** [frequency, amplitude] in the units of the settings, once the candidate turned a knob; before that nothing. */
  getResponse = () => {
    const { frequency, amplitude, touched } = this.store.getState();
    return touched ? responseOf(frequency, amplitude) : undefined;
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** Sets the knobs to a response (within their ranges, not on their steps: a correct response shows as it is). */
  setResponse = (response: QtiVariableJSON) => {
    const pair = pairOf(response);
    if (!pair) return;
    const { frequency, amplitude } = this.settings;
    this.store.restoreState({
      frequency: clamp(pair[0], frequency.min, frequency.max),
      amplitude: clamp(pair[1], amplitude.min, amplitude.max),
      touched: true,
    }, []);
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
