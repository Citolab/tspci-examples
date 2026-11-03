import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import Authoring, { authoringProblems } from "./authoring";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import {
  IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, IMSpciAuthoringFactory, PciAuthoringConfiguration,
  PciAuthoringInstance, QtiRecordItem,
} from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore } from "./store";
import {
  MAX_MODELS, ModelState, Setup, correctValues, evaluate, format, matchValues, ownStates, parseSetup, sameStates, serializeSetup,
  shadingJson, solutionStates, startStates, statesFor,
} from "./fraction";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("showreadout"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

const isTrue = (value: unknown) => String(value).toLowerCase() === "true";
const pciScoring = (p: Partial<PropTypes>) => String(p.scoring ?? "").toLowerCase() === "pci";
const languageOf = (p: Partial<PropTypes>) => (String(p.language ?? "en").toLowerCase().startsWith("nl") ? "nl" : "en");

/**
 * What a response, a correct response or a boundTo value says about the models: per model the shading (the record's
 * `shading` field, exact) or a fraction per model (the list, the record's fraction fields, a single string).
 */
const readResponse = (value: any): { shading?: unknown[]; values?: unknown[] } | null => {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value?.record)) {
    const field = (name: string) => value.record.find((f: any) => f?.name === name)?.base;
    const shading = field("shading")?.string;
    if (typeof shading === "string") {
      try {
        const parsed = JSON.parse(shading);
        if (Array.isArray(parsed)) return { shading: parsed };
      } catch {
        // fall back on the fractions
      }
    }
    const values = Array.from({ length: MAX_MODELS }, (_, i) => field(`fraction${i + 1}`)?.string);
    return values.some((v) => v !== undefined) ? { values: values.map((v) => v ?? null) } : null;
  }
  const list = value?.list?.string ?? value?.list?.identifier;
  if (Array.isArray(list)) return { values: list };
  if (typeof value?.base?.string === "string") return { values: [value.base.string] };
  if (Array.isArray(value)) return { values: value.map((v) => (typeof v === "object" && v !== null ? v.value ?? v.base?.string ?? null : v)) };
  if (typeof value === "string" || typeof value === "number") return { values: [String(value)] };
  return null;
};

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "fractionModel";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  /** data-models: the models, their parts, tasks and answers; without it the example. */
  setup: Setup;

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
  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App => {
    const instance = new App(false);
    return instance.setup_(dom, config, stateString);
  };

  private setup_ = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App => {
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.parseSettings();
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration);

    this.store = initStore({ models: startStates(this.setup) });
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        if (Array.isArray(saved?.state?.models)) this.store.restoreState({ models: ownStates(this.setup, saved.state.models) }, saved.log ?? []);
      } catch {
        // not a state of this PCI: start with the models as the author made them
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && readResponse(response)) {
        this.setResponse(response);
      }
    }

    // The item is in solution status: show the correct response (the engine's, or the answers in the settings) on top
    // of whatever was restored above.
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
   * Paints the correct response received at getInstance time, or else the answers of the settings. A delivery engine
   * calls this when it moves an already running interaction into review.
   */
  showCorrectResponse = () => {
    if (this.correctResponse) this.setResponse(this.correctResponse);
    else this.store.restoreState({ models: solutionStates(this.setup) }, []);
  };

  private correctResponseFromDeclaration = (
    declaration: ConfigProperties<PropTypes>["responseDeclaration"]
  ): QtiVariableJSON | null => {
    const value = declaration?.correctResponse?.value ?? declaration?.correctResponse;
    if (value === undefined || value === null) return null;
    const values = Array.isArray(value) ? value : [value];
    if (!values.length || values.every((v) => typeof v !== "string" && typeof v !== "number")) return null;
    return { list: { string: values.map((v) => String(v ?? "")) } } as QtiVariableJSON;
  };

  private parseSettings = () => {
    this.setup = parseSetup(this.config.properties.models);
  };

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    const p = this.config.properties;
    const status = this.config.status;
    const language = languageOf(p);
    render(
      <Interaction prompt={p.prompt} setup={this.setup} store={this.store} texts={textsFor(language)} language={language}
        showReadout={isTrue(p.showReadout)} solution={status === "solution"}
        readOnly={status === "review" || status === "closed" || status === "solution"} />,
      this.shadowdom
    );
  };

  /**
   * The correct response for these settings, for an authoring system (config.tspci.correctResponse "settings"): each
   * model's answer in lowest terms. None with PCI scoring, or when a model has no answer.
   */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const p = { ...defaults, ...normalize(properties as Record<string, string>) };
    if (pciScoring(p)) return undefined;
    const values = correctValues(parseSetup(p.models));
    return values ? ({ list: { string: values } } as QtiVariableJSON) : undefined;
  };

  /**
   * Authoring mode: the author chooses the models, their parts, the given shading, the task and the answer;
   * getProperties() gives data-models. Only an authoring system calls this (AUTHORING.md, "Authoring mode").
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    let setup = parseSetup(properties.models);
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={setup} language={language} onChange={(next) => { setup = next; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ models: serializeSetup(setup) }),
      validate: () => authoringProblems(setup, language),
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
    if (key === "models") {
      this.parseSettings();
      this.store.restoreState({ models: ownStates(this.setup, this.store.getState().models) }, []);
    }
    window.requestAnimationFrame(() => this.render());
  };

  /** The record of PCI scoring: score, maxscore, correct, per model its fraction, value and check, and the shading. */
  private recordFor = (states: ModelState[]): QtiVariableJSON => {
    const e = evaluate(this.setup, states);
    const record: QtiRecordItem[] = [
      { name: "score", base: { integer: e.score } },
      { name: "maxscore", base: { integer: e.maxscore } },
      { name: "correct", base: { integer: e.correct ? 1 : 0 } },
    ];
    e.results.forEach((r, i) => {
      record.push({ name: `fraction${i + 1}`, base: { string: format(r.value) } });
      if (r.value) record.push({ name: `value${i + 1}`, base: { float: r.value.n / r.value.d } });
      record.push({ name: `parts${i + 1}`, base: { integer: states[i].parts } });
      if (r.passed !== null) record.push({ name: `check${i + 1}`, base: { integer: r.passed ? 1 : 0 } });
    });
    record.push({ name: "shading", base: { string: shadingJson(this.setup, states) } });
    return { record };
  };

  /**
   * Per model the shaded (or typed) fraction in lowest terms, in model order, as an ordered list of strings ("" for an
   * empty entry); with data-scoring="pci" a record (README). Nothing until the candidate changed something.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const { models } = this.store.getState();
    if (sameStates(models, startStates(this.setup))) return undefined;
    if (pciScoring(this.config.properties)) return this.recordFor(models);
    return { list: { string: matchValues(this.setup, models) } } as QtiVariableJSON;
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response back in the models: the record's shading exactly; fractions as the first parts shaded. */
  setResponse = (response: QtiVariableJSON) => {
    const read = readResponse(response);
    if (!read) {
      this.resetResponse();
      return;
    }
    const models = read.shading ? ownStates(this.setup, read.shading) : statesFor(this.setup, read.values ?? [], startStates(this.setup));
    this.store.restoreState({ models }, []);
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
