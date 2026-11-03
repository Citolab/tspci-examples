import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction, { targetMeasurement } from "./interaction";
import Authoring, { authoringProblems } from "./authoring";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import {
  IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, IMSpciAuthoringFactory, PciAuthoringConfiguration,
  PciAuthoringInstance, QtiRecordItem,
} from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore, validState } from "./store";
import { Settings, correctOf, parseSettings } from "./settings";
import { madeTarget, serializeScene } from "./geometry";
import { formatNumber, parseNumber, roundTo } from "./format";
import { scoreAnswer } from "./scoring";
import { answerUnit, reportOf, withUnit } from "./describe";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("tickstep"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

/** A number from a response or a qti-value: a float, an integer, or text with a point or a comma. */
const numberIn = (value: unknown): number | null => {
  if (Array.isArray(value)) return numberIn(value[0]);
  if (value && typeof value === "object") {
    const v = value as any;
    if (Array.isArray(v.record)) return numberIn(v.record.find((f: any) => f?.name === "value")?.base?.float);
    return numberIn(v.base?.float ?? v.base?.integer ?? v.base?.string ?? v.value);
  }
  return parseNumber(value as string);
};

/** The measurements in a response: the JSON of the tool mode, or the measurements field of a record. */
const measurementsIn = (value: any): unknown[] | null => {
  const text = Array.isArray(value?.record) ? value.record.find((f: any) => f?.name === "measurements")?.base?.string : value?.base?.string;
  if (typeof text !== "string" || !text.trim().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed?.measurements) ? parsed.measurements : null;
  } catch {
    return null;
  }
};

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "measure3d";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  settings: Settings;

  private initialState: StateModel = { measurements: [], answer: "" };
  // The correct response the delivery engine handed us at getInstance time, or the one from the settings.
  // See https://github.com/1EdTech/qti-project-management/issues/210
  private correctResponse: QtiVariableJSON | null = null;
  private showingSolution = false;

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
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration) ?? this.settingsResponse(this.settings);

    this.store = initStore(this.initialState);
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        const state = validState(this.settings.built, saved?.state);
        if (state) this.store.restoreState(state, saved.log ?? []);
      } catch {
        // not a state of this PCI: start empty
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && response && (response.base || (response as any).record)) {
        this.setResponse(response);
      }
    }

    // The item is in solution status and there is a correct response: show it on top of whatever was restored above
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
   * Shows the correct response received at getInstance time (or the one from the settings): the value in the answer
   * field and the measurement of the task in the scene. A delivery engine calls this when it moves an already running
   * interaction into review.
   */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.showingSolution = true;
    this.setResponse(this.correctResponse);
    this.render();
  };

  /** Answer mode only: a tool has no correct response. */
  private correctResponseFromDeclaration = (
    declaration: ConfigProperties<PropTypes>["responseDeclaration"]
  ): QtiVariableJSON | null => {
    if (this.settings.mode !== "answer") return null;
    const value = numberIn(declaration?.correctResponse?.value ?? declaration?.correctResponse);
    return value === null ? null : this.responseFor(this.settings, value, this.settings.scoring === "pci" ? targetList(this.settings) : []);
  };

  /** The correct response that follows from the scene and the task: the value from the geometry. */
  private settingsResponse = (s: Settings): QtiVariableJSON | null => {
    if (s.mode !== "answer") return null;
    const value = correctOf(s);
    return value === null ? null : this.responseFor(s, roundTo(value, 4), targetList(s));
  };

  /**
   * Not QTI: for an authoring system (config.tspci.correctResponse "settings"). In answer mode with a task, the value
   * the geometry gives (4 decimals; the margin is in the response processing); a record with data-scoring="pci".
   */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const s = parseSettings({ ...defaults, ...normalize(properties as Record<string, string>) });
    return this.settingsResponse(s) ?? undefined;
  };

  render = () => {
    this.settings = parseSettings(this.config.properties as Record<string, unknown>); // trigger() may have changed them
    const s = this.settings;
    const t = textsFor(s.language);
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    const correct = this.showingSolution && s.mode === "answer" ? numberIn(this.correctResponse) : null;
    const correctText = correct === null ? null : withUnit(formatNumber(correct, s.decimals, s.language), answerUnit(s, s.target));
    const prompt = s.example && this.config.properties.prompt === defaults.prompt ? t.defaultPrompt : s.prompt;
    render(
      <Interaction prompt={prompt} settings={s} store={this.store} texts={t} readOnly={this.config.status === "solution"} correctText={correctText} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author composes the scene, names the points, chooses the tools and sets the task and the
   * margin; getProperties() gives data-scene, data-target, data-mode, data-tools and data-margin.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) } as Record<string, string>;
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    let current = parseSettings(properties);
    let values: Record<string, string> = {
      scene: serializeScene(current.scene),
      target: current.target ? JSON.stringify(current.target) : "",
      mode: current.mode,
      tools: current.tools.join(","),
      margin: String(current.margin),
    };
    render(
      <Authoring properties={properties} language={language} onChange={(next) => {
        values = next;
        current = parseSettings({ ...properties, ...next });
        config.onchange?.();
      }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ ...values }),
      validate: () => authoringProblems(current, language),
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

  /** The response for a value and measurements: a float, or a record with the PCI's score (data-scoring="pci"). */
  private responseFor = (s: Settings, value: number, measurements: StateModel["measurements"]): QtiVariableJSON => {
    if (s.scoring !== "pci") return { base: { float: value } } as QtiVariableJSON;
    const score = scoreAnswer({ value, correct: correctOf(s), margin: s.margin, made: madeTarget(s.built, s.target, measurements), requireMeasurement: s.requireMeasurement });
    const record: QtiRecordItem[] = [
      { name: "score", base: { integer: score.score } },
      { name: "maxscore", base: { integer: score.maxscore } },
      { name: "correct", base: { integer: score.correct } },
      { name: "measured", base: { integer: score.measured } },
      { name: "value", base: { float: value } },
      { name: "measurements", base: { string: JSON.stringify(reportOf(s, textsFor("en"), measurements)) } },
    ];
    return { record } as QtiVariableJSON;
  };

  /**
   * Answer mode: the typed value as a float (nothing until it is a number); with data-scoring="pci" a record with
   * score, maxscore, correct, measured, value and the measurements. Tool mode: the measurements made, as JSON.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const s = this.settings;
    const state = this.store.getState();
    if (s.mode === "answer") {
      const value = parseNumber(state.answer);
      return value === null ? undefined : this.responseFor(s, value, state.measurements);
    }
    if (!state.measurements.length) return undefined;
    return { base: { string: JSON.stringify(reportOf(s, textsFor("en"), state.measurements)) } };
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response back in the interaction: the value in the answer field, the measurements in the scene. */
  setResponse = (response: QtiVariableJSON) => {
    const s = this.settings;
    const state = this.store.getState();
    const list = measurementsIn(response);
    const measurements = list ? validState(s.built, { measurements: list })!.measurements : state.measurements;
    if (s.mode === "answer") {
      const value = numberIn(response);
      if (value === null && !list) return;
      const answer = value === null ? state.answer : formatNumber(value, 10, s.language).replace(/[.,]?0+$/, "").replace("−", "-");
      this.store.dispatch({ type: "RESTORE", payload: { answer, measurements } });
      return;
    }
    if (!list) {
      console.error(`couldn't restore the response: ${JSON.stringify(response)}`);
      return;
    }
    this.store.dispatch({ type: "RESTORE", payload: { ...state, measurements } });
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
    render(null, this.shadowdom); // frees the WebGL context
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.store.getActions()
    });

  /** The 3D view, for tests: turn, zoom, screenOf, pickAt, render. Null without WebGL. */
  scene3d = () => (this.shadowdom?.querySelector("[data-testid=viewport]") as any)?.measureScene ?? null;
}

/** The task's own measurement, as the correct response of a record shows it. */
const targetList = (s: Settings) => {
  const m = targetMeasurement(s.target);
  return m ? [m] : [];
};

export default new App();
