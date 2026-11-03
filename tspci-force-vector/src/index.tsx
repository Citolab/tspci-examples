import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import Authoring, { Authored, authoringProblems } from "./authoring";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import { IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, IMSpciAuthoringFactory, PciAuthoringConfiguration, PciAuthoringInstance } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore } from "./store";
import { Settings, readSettings } from "./board";
import { textsFor } from "./texts";
import { ArrowDef, Vector, correctValues, fromResponse, parseAnswer, parseArrows, readVector, serializeAnswer, serializeArrows, toResponse } from "./vector";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("pixelspercm"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

/** The values of an ordered float response, from what a delivery system hands back. */
const listOf = (response: QtiVariableJSON): unknown[] | null => {
  const list = (response as any)?.list?.float ?? (response as any)?.list?.double;
  return Array.isArray(list) ? list : null;
};

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "forceVector";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  settings: Settings;
  /** data-arrows: the arrows to draw, with their given points. */
  defs: ArrowDef[];
  /** The correct arrows, dashed, once showCorrectResponse() ran. */
  correct: (Vector | null)[] | null = null;

  // The correct response the delivery engine handed us at getInstance time.
  // See https://github.com/1EdTech/qti-project-management/issues/210
  private correctResponse: QtiVariableJSON | null = null;

  constructor(register = true) {
    if (register && ctx) {
      ctx.register(this);
    }
  }

  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App => {
    // a second interaction in the item (or on the page) gets an object of its own, with its own store and settings
    if (this.config) return new App(false).getInstance(dom, config, stateString);
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.correct = null;
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration);
    this.parseSettings();

    this.store = initStore({ arrows: this.defs.map(() => null), past: [] });
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        if (Array.isArray(saved?.state?.arrows)) {
          const arrowsOf = (list: unknown[]) => this.defs.map((_, i) => {
            const v = readVector(list[i]);
            return v && v.length > 0 ? v : null;
          });
          const arrows = arrowsOf(saved.state.arrows);
          const past = Array.isArray(saved.state.past) ? saved.state.past.filter(Array.isArray).map(arrowsOf) : [];
          this.store.restoreState({ arrows, past }, saved.log ?? []);
        }
      } catch {
        // not a state of this PCI: start with nothing drawn
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && response && listOf(response)) {
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
   * Draws the correct arrows, dashed, next to the candidate's (which stay as they are). A delivery engine calls this
   * when it moves an already running interaction into review.
   */
  showCorrectResponse = () => {
    const values = this.correctResponse ? listOf(this.correctResponse) : null;
    if (!values) return;
    this.correct = fromResponse(values, this.defs.length);
    this.render();
  };

  private correctResponseFromDeclaration = (
    declaration: ConfigProperties<PropTypes>["responseDeclaration"]
  ): QtiVariableJSON | null => {
    const value = declaration?.correctResponse?.value as unknown;
    if (value === undefined || value === null) return null;
    // a list of floats, or the values as one text ("7 4.75 270 3")
    const values = Array.isArray(value) ? value : String(value).trim().split(/[\s,;]+/);
    const numbers = values.map(Number);
    if (!numbers.length || numbers.some((n) => !Number.isFinite(n))) return null;
    return { list: { float: numbers } } as QtiVariableJSON;
  };

  private parseSettings = () => {
    const p = this.config.properties as unknown as Record<string, string>;
    this.settings = readSettings(p);
    this.defs = parseArrows(p.arrows, p.language);
  };

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    const p = this.config.properties as unknown as Record<string, string>;
    const t = textsFor(p.language);
    // the example's instruction in the candidate's language
    const prompt = p.prompt === defaults.prompt && !p.background?.trim() ? t.examplePrompt : p.prompt;
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={prompt} settings={this.settings} defs={this.defs} showScale={String(p.showScale) !== "false"}
        ruler={String(p.ruler) !== "false"} store={this.store} correct={this.correct} texts={t} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author names the arrows, draws the correct ones (which places P) and sets the tolerances;
   * getProperties() gives data-arrows and data-answer. Only an authoring system calls this (AUTHORING.md, "Authoring
   * mode"); delivery never does.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) } as unknown as Record<string, string>;
    const defs = parseArrows(properties.arrows, properties.language);
    let authored: Authored = { defs, answer: parseAnswer(properties.answer, properties.arrows, defs.length) };
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={authored} settings={readSettings(properties)} language={language}
        onChange={(next) => { authored = next; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ arrows: serializeArrows(authored.defs), answer: serializeAnswer(authored.answer) }),
      validate: () => authoringProblems(authored, language),
      oncompleted: () => render(null, host),
    };
    config.onready?.(instance);
    return instance;
  };

  /** The correct response from data-arrows and data-answer (AUTHORING.md, "The correct response from the settings"). */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const p = { ...defaults, ...normalize(properties as Record<string, string>) } as unknown as Record<string, string>;
    const defs = parseArrows(p.arrows, p.language);
    const values = correctValues(defs, parseAnswer(p.answer, p.arrows, defs.length));
    return values ? ({ list: { float: values } } as QtiVariableJSON) : undefined;
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    window.requestAnimationFrame(() => this.render());
  };

  /**
   * Four floats per arrow, in the order of data-arrows: x and y of the start (cm from the top left), the direction
   * (degrees counter-clockwise from the right) and the length (cm). An arrow not drawn is [x, y, 0, 0]. Nothing until
   * something is drawn.
   */
  getResponse = () => {
    const values = toResponse(this.store.getState().arrows, this.defs);
    return values ? ({ list: { float: values } } as QtiVariableJSON) : undefined;
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  setResponse = (response: QtiVariableJSON) => {
    const values = listOf(response);
    if (!values) return;
    this.store.restoreState({ arrows: fromResponse(values, this.defs.length), past: [] }, []);
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
