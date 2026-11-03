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
import { MAX_TARGETS, Positions, Scene, evaluate, fieldsOf, measure, ownPositions, parseScene, serializeScene, startPositions } from "./optics";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("showrays"): back to the keys of config.json. */
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
 * values of a declaration ([{ fieldIdentifier, value }]) or a plain object ({ lamp1Distance: 200 }).
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
      out[name] = typeof base === "object" && base !== null && !Array.isArray(base) ? base.float ?? base.integer ?? base.string ?? null : Array.isArray(base) ? base[0] : base;
    }
    return out;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) out[k] = v;
  }
  return out;
};

/** The positions in a response's fields; null when it has none. */
const positionsIn = (scene: Scene, value: any): Positions | null => {
  const f = fieldsIn(value);
  const has = Object.keys(f).some((k) => /^(lamp[12](Distance|Height|Side)|objectDistance)$/.test(k));
  if (!has) return null;
  return ownPositions(scene, {
    objectX: f.objectDistance,
    lamps: [1, 2].map((i) => ({ x: f[`lamp${i}Distance`], y: f[`lamp${i}Height`], z: f[`lamp${i}Side`] })),
  });
};

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "lightShadow";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  /** data-scene: the screen, lamps, object, what moves, the targets and the solution; without it the example. */
  scene: Scene;

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
    return instance.setup(dom, config, stateString);
  };

  private setup = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App => {
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.parseSettings();
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration) ?? this.solutionResponse();

    this.initialState = { positions: startPositions(this.scene), moved: false, tried: [] };
    this.store = initStore(this.initialState);
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        const s = saved?.state;
        if (s?.positions) {
          const tried = Array.isArray(s.tried) ? s.tried.slice(-MAX_TRIED).map((p: unknown) => ownPositions(this.scene, p)) : [];
          this.store.restoreState({ positions: ownPositions(this.scene, s.positions), moved: !!s.moved, tried }, saved.log ?? []);
        }
      } catch {
        // not a state of this PCI: start with the scene as the author made it
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && positionsIn(this.scene, response)) {
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
    const positions = positionsIn(this.scene, declaration?.correctResponse?.value ?? declaration?.correctResponse);
    return positions ? App.responseFor(this.scene, "answer", positions, []) : null;
  };

  private solutionResponse = (): QtiVariableJSON | null =>
    this.mode === "answer" && this.scene.solution ? App.responseFor(this.scene, "answer", this.scene.solution, []) : null;

  private parseSettings = () => {
    this.scene = parseScene(this.config.properties.scene);
  };

  /**
   * Not QTI: for an authoring system (config.tspci.correctResponse "settings"). In answer mode with a solution in
   * data-scene, the record for that solution; otherwise nothing.
   */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const p = { ...defaults, ...normalize(properties as Record<string, string>) };
    const scene = parseScene(p.scene);
    if (modeOf(p.mode) !== "answer" || !scene.solution) return undefined;
    return App.responseFor(scene, "answer", scene.solution, []);
  };

  private options = (): Options => {
    const p = this.config.properties;
    const view = String(p.view).toLowerCase();
    const solution = this.config.status === "solution" && !!this.correctResponse;
    return {
      mode: this.mode,
      view: view === "3d" || view === "2d" ? view : "both",
      showRays: isTrue(p.showRays),
      showMeasurements: isTrue(p.showMeasurements),
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
      <Interaction prompt={this.config.properties.prompt} scene={this.scene} store={this.store}
        texts={textsFor(this.config.properties.language)} options={this.options()} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author sets up the screen, the lamps, the object, what moves, the targets and a solution;
   * getProperties() gives data-scene. Only an authoring system calls this (AUTHORING.md, "Authoring mode").
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    let scene = parseScene(properties.scene);
    const mode = modeOf(properties.mode);
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={scene} mode={mode} language={language} onChange={(next) => { scene = next; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ scene: serializeScene(scene) }),
      validate: () => authoringProblems(scene, mode, language),
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
   * The record for positions: in answer mode the targets' score first; then the measured shadow and the positions
   * (cm, a float each; the shadow fields are missing when there is no shadow); in tool mode the positions tried.
   */
  static responseFor = (scene: Scene, mode: "answer" | "tool", positions: Positions, tried: Positions[]): QtiVariableJSON => {
    const record: QtiRecordItem[] = [];
    if (mode === "answer" && scene.targets.length) {
      const e = evaluate(scene, positions);
      record.push({ name: "score", base: { integer: e.score } });
      record.push({ name: "maxscore", base: { integer: e.maxscore } });
      record.push({ name: "correct", base: { integer: e.correct ? 1 : 0 } });
      e.results.slice(0, MAX_TARGETS).forEach((r, i) => record.push({ name: `check${i + 1}`, base: { integer: r.passed ? 1 : 0 } }));
    }
    const m = measure(scene, positions);
    const lamp = (i: number, a: "x" | "y" | "z") => Math.round(positions.lamps[i][a] * 10) / 10;
    const position: Record<string, number> = {
      lamp1Distance: lamp(0, "x"), lamp1Height: lamp(0, "y"), lamp1Side: lamp(0, "z"),
      objectDistance: Math.round(positions.objectX * 10) / 10,
    };
    if (scene.lamps.length > 1) Object.assign(position, { lamp2Distance: lamp(1, "x"), lamp2Height: lamp(1, "y"), lamp2Side: lamp(1, "z") });
    for (const field of fieldsOf(scene)) {
      const value = field in position ? position[field] : m?.values[field];
      if (value !== null && value !== undefined) record.push({ name: field, base: { float: value } });
    }
    if (mode === "tool") {
      record.push({ name: "tried", base: { string: JSON.stringify(tried.map((p) => ({ lamps: p.lamps, objectX: p.objectX }))) } });
    }
    return { record };
  };

  /** A record (README): nothing until the candidate moved something. */
  getResponse = (): QtiVariableJSON | undefined => {
    const { positions, moved, tried } = this.store.getState();
    if (!moved) return undefined;
    return App.responseFor(this.scene, this.mode, positions, tried);
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response back in the scene: only its positions count (and in tool mode the positions tried), the rest follows. */
  setResponse = (response: QtiVariableJSON) => {
    const positions = positionsIn(this.scene, response);
    if (!positions) return;
    let tried: Positions[] = [];
    const text = fieldsIn(response).tried;
    if (typeof text === "string") {
      try {
        const list = JSON.parse(text);
        if (Array.isArray(list)) tried = list.slice(-MAX_TRIED).map((p) => ownPositions(this.scene, p));
      } catch {
        // no positions tried
      }
    }
    this.store.restoreState({ positions, moved: true, tried }, []);
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.store.getActions()
    });

  /** The shadow as the PCI measures it now, for tests. */
  measures = () => measure(this.scene, this.store.getState().positions)?.values ?? null;
}

export default new App();
