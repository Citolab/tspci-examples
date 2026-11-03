import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction, { effective } from "./interaction";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import { IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore, validState } from "./store";
import { Settings, parseSettings } from "./settings";
import { correctValue, levelOf, nearestDistance, nearestPower, roundTo } from "./physics";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("targetlevel"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

/** A number from a response or a qti-value: a float, an integer, or text with a point or a comma. */
const numberIn = (value: unknown): number | null => {
  if (Array.isArray(value)) return numberIn(value[0]);
  if (typeof value === "number") return isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const n = Number(value.trim().replace(",", "."));
  return isFinite(n) ? n : null;
};

class App implements IMSpci<PropTypes>, TAOpci {
  typeIdentifier = "soundLevel";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  settings: Settings;

  private initialState: StateModel = { power: null, distance: null, tried: [] };
  // The correct response the delivery engine handed us at getInstance time.
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
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration);

    this.store = initStore(this.initialState);
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        const state = validState(saved?.state);
        if (state) this.store.restoreState(state, saved.log ?? []);
      } catch {
        // not a state of this PCI: start at the settings
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && (response?.base?.float !== undefined || response?.base?.string || response?.base?.integer !== undefined)) {
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

  /** Answer mode only: a tool has no correct response. */
  private correctResponseFromDeclaration = (
    declaration: ConfigProperties<PropTypes>["responseDeclaration"]
  ): QtiVariableJSON | null => {
    if (this.settings.mode !== "answer") return null;
    const value = numberIn(declaration?.correctResponse?.value);
    return value === null ? null : ({ base: { float: value } } as QtiVariableJSON);
  };

  /**
   * Not QTI: for an authoring system (config.tspci.correctResponse "settings"). In answer mode with a target level,
   * the distance (or power) that gives that level, as the candidate can set it on the slider; otherwise nothing.
   */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const settings = parseSettings({ ...defaults, ...normalize(properties as Record<string, string>) });
    const value = correctValue(settings);
    return value === null ? undefined : ({ base: { float: value } } as QtiVariableJSON);
  };

  render = () => {
    this.settings = parseSettings(this.config.properties as Record<string, unknown>); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={this.config.properties.prompt} settings={this.settings} store={this.store}
        texts={textsFor(this.settings.language)} />,
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
   * Answer mode: the distance (or power) the candidate set, a float in the unit of the item; nothing until they set
   * it. Tool mode: every setting the candidate stopped at, with its level, as JSON for research; nothing until they
   * changed something.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const s = this.settings;
    const state = this.store.getState();
    if (s.mode === "answer") {
      const value = state[s.answer];
      if (value === null) return undefined;
      return { base: { float: s.answer === "distance" ? nearestDistance(s, value) : nearestPower(s, value) } } as QtiVariableJSON;
    }
    if (!state.tried.length) return undefined;
    const tried = state.tried.map(({ power, distance }) => ({ power, distance, level: roundTo(levelOf(s, power, distance), s.decimals) }));
    return { base: { string: JSON.stringify({ powerUnit: s.powerUnit, distanceUnit: s.distanceUnit, tried }) } };
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  setResponse = (response: QtiVariableJSON) => {
    const s = this.settings;
    const state = this.store.getState();
    if (s.mode === "answer") {
      const value = numberIn(response?.base?.float ?? response?.base?.integer ?? response?.base?.string);
      if (value === null) return;
      const set = s.answer === "distance" ? nearestDistance(s, value) : nearestPower(s, value);
      this.store.dispatch({ type: "RESTORE", payload: { ...state, [s.answer]: set } });
      return;
    }
    const text = response?.base?.string?.toString();
    if (!text) return;
    try {
      const restored = validState({ tried: JSON.parse(text)?.tried });
      const last = restored?.tried[restored.tried.length - 1];
      if (!last) throw new Error("no tries");
      this.store.dispatch({ type: "RESTORE", payload: { power: last.power, distance: last.distance, tried: restored.tried } });
    } catch {
      console.error(`couldn't restore the response: ${text}`);
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

  /** The power and distance the simulation shows now, for tests. */
  current = () => effective(this.settings, this.store.getState());
}

export default new App();
