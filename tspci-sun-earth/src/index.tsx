import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction, { Options } from "./interaction";
import Authoring, { authoringProblems } from "./authoring";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import {
  IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, IMSpciAuthoringFactory, PciAuthoringConfiguration,
  PciAuthoringInstance, QtiRecordItem,
} from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, MAX_TRIED, StateModel, initStore } from "./store";
import { MAX_TARGETS, NUMBER_FIELDS, Setting, Setup, controlled, evaluate, ownSetting, parseSetup, serializeSetup } from "./setup";
import { valuesOf } from "./model";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("timebase"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

const isTrue = (value: unknown) => String(value).toLowerCase() === "true";
const modeOf = (value: unknown): "answer" | "tool" => (String(value).toLowerCase() === "tool" ? "tool" : "answer");
const languageOf = (value: unknown): "en" | "nl" => (String(value ?? "").slice(0, 2).toLowerCase() === "nl" ? "nl" : "en");

/**
 * The fields of a response, a correct response or a saved value, by name: a record ({ record: [{ name, base }] }), the
 * values of a declaration ([{ fieldIdentifier, value }]) or a plain object ({ day: 172 }).
 */
const fieldsIn = (value: any): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (!value) return out;
  if (Array.isArray(value?.record)) return fieldsIn(value.record);
  if (Array.isArray(value)) {
    for (const v of value) {
      const name = v?.name ?? v?.fieldIdentifier ?? v?.identifier;
      if (typeof name !== "string") continue;
      const base = v.base ?? (v.value !== undefined ? v.value : v);
      out[name] = typeof base === "object" && base !== null && !Array.isArray(base) ? base.float ?? base.integer ?? base.identifier ?? base.string ?? null : Array.isArray(base) ? base[0] : base;
    }
    return out;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) out[k] = v;
  }
  return out;
};

/** The setting in a response's fields (day, time in hours UTC, place); null when it has none. */
const settingIn = (setup: Setup, value: any): Setting | null => {
  const f = fieldsIn(value);
  if (f.day === undefined && f.time === undefined && f.place === undefined) return null;
  const hours = f.time === undefined || f.time === null ? NaN : Number(String(f.time).replace(",", "."));
  return controlled(setup, ownSetting(setup, { day: f.day, minutes: isFinite(hours) ? hours * 60 : undefined, place: f.place }, setup.start));
};

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "sunEarth";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  /** data-setup: the places, what the candidate controls, the start, the targets and the solution; without it the example. */
  setup: Setup;

  private initialState: StateModel;
  // The correct response the delivery engine handed us at getInstance time, or else the author's solution.
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
    return instance.mount(dom, config, stateString);
  };

  private mount = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App => {
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.parseSettings();
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration) ?? this.solutionResponse();

    this.initialState = { setting: this.setup.start, moved: false, tried: [] };
    this.store = initStore(this.initialState);
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        const s = saved?.state;
        if (s?.setting) {
          const own = (v: unknown) => controlled(this.setup, ownSetting(this.setup, v, this.setup.start));
          const tried = Array.isArray(s.tried) ? s.tried.slice(-MAX_TRIED).map(own) : [];
          this.store.restoreState({ setting: own(s.setting), moved: !!s.moved, tried }, saved.log ?? []);
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
      if (!stateString && settingIn(this.setup, response)) {
        this.setResponse(response);
      }
    }

    // The item is in solution status and there is a correct response (from the engine, or the author's solution):
    // show that on top of whatever was restored above.
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
   * Paints the correct response received at getInstance time (or the author's solution). A delivery engine
   * calls this when it moves an already running interaction into review.
   */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  private get mode() {
    return modeOf(this.config.properties.mode);
  }

  /** Answer mode only: a tool has no correct response. */
  private correctResponseFromDeclaration = (declaration: ConfigProperties<PropTypes>["responseDeclaration"]): QtiVariableJSON | null => {
    if (this.mode !== "answer") return null;
    const setting = settingIn(this.setup, declaration?.correctResponse?.value ?? declaration?.correctResponse);
    return setting ? App.responseFor(this.setup, "answer", setting, []) : null;
  };

  private solutionResponse = (): QtiVariableJSON | null =>
    this.mode === "answer" && this.setup.solution ? App.responseFor(this.setup, "answer", this.setup.solution, []) : null;

  private parseSettings = () => {
    this.setup = parseSetup(this.config.properties.setup);
  };

  /**
   * Not QTI: for an authoring system (config.tspci.correctResponse "settings"). In answer mode with a solution in
   * data-setup, the record for that solution; otherwise nothing.
   */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const p = { ...defaults, ...normalize(properties as Record<string, string>) };
    const setup = parseSetup(p.setup);
    if (modeOf(p.mode) !== "answer" || !setup.solution) return undefined;
    return App.responseFor(setup, "answer", setup.solution, []);
  };

  private options = (): Options => {
    const p = this.config.properties;
    const solution = this.config.status === "solution" && !!this.correctResponse;
    return {
      mode: this.mode,
      view: String(p.view).toLowerCase() === "2d" ? "2d" : "both",
      timeBase: String(p.timeBase).toLowerCase() === "local" ? "local" : "utc",
      showInfo: isTrue(p.showInfo),
      language: languageOf(p.language),
      readOnly: this.config.status === "solution" || this.config.status === "review",
      solution,
    };
  };

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={this.config.properties.prompt} setup={this.setup} store={this.store}
        texts={textsFor(this.config.properties.language)} options={this.options()} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author picks the places, what the candidate controls, the start, the targets and a
   * solution; getProperties() gives data-setup. Only an authoring system calls this (AUTHORING.md, "Authoring mode").
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    let setup = parseSetup(properties.setup);
    const mode = modeOf(properties.mode);
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    const timeBase = String(properties.timeBase).toLowerCase() === "local" ? "local" : "utc";
    render(
      <Authoring initial={setup} mode={mode} timeBase={timeBase} language={language} onChange={(next) => { setup = next; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ setup: serializeSetup(setup) }),
      validate: () => authoringProblems(setup, mode, language),
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

  /**
   * The record for a setting: in answer mode the targets' score first; then the setting (day, time, place) and what
   * the PCI computes for it; in tool mode the settings tried.
   */
  static responseFor = (setup: Setup, mode: "answer" | "tool", setting: Setting, tried: Setting[]): QtiVariableJSON => {
    const record: QtiRecordItem[] = [];
    const values = valuesOf(setup, setting);
    if (!values) return { record };
    if (mode === "answer" && setup.targets.length) {
      const e = evaluate(setup, values);
      record.push({ name: "score", base: { integer: e.score } });
      record.push({ name: "maxscore", base: { integer: e.maxscore } });
      record.push({ name: "correct", base: { integer: e.correct ? 1 : 0 } });
      e.results.slice(0, MAX_TARGETS).forEach((r, i) => record.push({ name: `check${i + 1}`, base: { integer: r.passed ? 1 : 0 } }));
    }
    record.push({ name: "day", base: { integer: values.day } });
    record.push({ name: "place", base: { identifier: values.place } });
    record.push({ name: "latitude", base: { float: values.latitude } });
    record.push({ name: "longitude", base: { float: values.longitude } });
    for (const field of NUMBER_FIELDS) {
      if (field === "day") continue;
      const v = values[field];
      if (v !== null && v !== undefined) record.push({ name: field, base: { float: v } });
    }
    if (mode === "tool") {
      record.push({ name: "tried", base: { string: JSON.stringify(tried.map((s) => ({ day: s.day, time: Math.round((s.minutes / 60) * 1000) / 1000, place: s.place }))) } });
    }
    return { record };
  };

  /** A record (README): nothing until the candidate changed something. */
  getResponse = (): QtiVariableJSON | undefined => {
    const { setting, moved, tried } = this.store.getState();
    if (!moved) return undefined;
    return App.responseFor(this.setup, this.mode, setting, tried);
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response back in the interaction: only its day, time and place count (and in tool mode the settings tried). */
  setResponse = (response: QtiVariableJSON) => {
    const setting = settingIn(this.setup, response);
    if (!setting) return;
    let tried: Setting[] = [];
    const text = fieldsIn(response).tried;
    if (typeof text === "string") {
      try {
        const list = JSON.parse(text);
        if (Array.isArray(list)) tried = list.slice(-MAX_TRIED).map((p) => settingIn(this.setup, p) ?? this.setup.start);
      } catch {
        // no settings tried
      }
    }
    this.store.restoreState({ setting, moved: true, tried }, []);
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.store.getActions()
    });

  /** The values the PCI computes for the setting now, for tests. */
  values = () => valuesOf(this.setup, this.store.getState().setting);
}

export default new App();
