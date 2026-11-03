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
import { MAX_CHECKS, Placed, Plan, evaluate, ownPlacement, parsePlan, round1, serializePlacement, serializePlan } from "./plan";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("showmetrics"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

const isTrue = (value: unknown) => String(value).toLowerCase() === "true";

/** The placement in a response, a correct response or a saved value: the placement field of a record, or a string. */
const placementText = (value: any): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return /^\s*[[{]/.test(value) ? value : null;
  if (Array.isArray(value?.record)) return placementText(value.record.find((f: any) => f?.name === "placement")?.base?.string);
  if (typeof value?.base?.string === "string") return placementText(value.base.string);
  if (typeof value?.placement === "string") return value.placement;
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = v?.fieldIdentifier === "placement" || v?.name === "placement" ? placementText(v.value ?? v.base?.string ?? v) : placementText(v);
      if (found) return found;
    }
  }
  return null;
};

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "loadPlanner";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  /** data-plan: the cargo space, the boxes, the checks and the solution the author made; without it the example. */
  plan: Plan;

  private initialState: StateModel = { placed: [] };
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

    this.store = initStore(this.initialState);
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        if (Array.isArray(saved?.state?.placed)) this.store.restoreState({ placed: ownPlacement(this.plan, saved.state.placed) }, saved.log ?? []);
      } catch {
        // not a state of this PCI: start with an empty cargo space
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && placementText(response)) {
        this.setResponse(response);
      }
    }

    // In solution status with a correct response (from the engine, or the author's solution): show that.
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
      dom.dispatchEvent(new CustomEvent("qti-interaction-changed", { detail: event }));
    }, { immediate: false });

    this.config.onready && this.config.onready(this);
    return this;
  };

  /** Shows the correct response received at getInstance time (or the author's solution). */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  private correctResponseFromDeclaration = (declaration: ConfigProperties<PropTypes>["responseDeclaration"]): QtiVariableJSON | null => {
    const text = placementText(declaration?.correctResponse?.value ?? declaration?.correctResponse);
    if (!text) return null;
    try {
      return this.responseFor(ownPlacement(this.plan, JSON.parse(text)));
    } catch {
      return null;
    }
  };

  private solutionResponse = (): QtiVariableJSON | null => (this.plan.solution ? this.responseFor(this.plan.solution) : null);

  private parseSettings = () => {
    this.plan = parsePlan(this.config.properties.plan);
  };

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    const p = this.config.properties;
    render(
      <Interaction prompt={p.prompt} plan={this.plan} store={this.store} t={textsFor(p.language)} view={p.view === "2d" ? "2d" : "3d"}
        showMetrics={isTrue(p.showMetrics)} showChecks={isTrue(p.showChecks)} readOnly={this.config.status === "solution"} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author sets up the cargo space, the boxes, the checks and an example solution; getProperties()
   * gives data-plan. Only an authoring system calls this (AUTHORING.md, "Authoring mode").
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    let plan = parsePlan(properties.plan);
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(<Authoring initial={plan} language={language} onChange={(next) => { plan = next; config.onchange?.(); }} />, host);
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ plan: serializePlan(plan) }),
      validate: () => authoringProblems(plan, language),
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

  /** The record for a placement: the checks' results and score, the metrics and the placement itself. */
  private responseFor = (placed: Placed[]): QtiVariableJSON => {
    const e = evaluate(this.plan, placed);
    const m = e.metrics;
    const record: QtiRecordItem[] = [
      { name: "score", base: { integer: e.score } },
      { name: "maxscore", base: { integer: e.maxscore } },
      { name: "correct", base: { integer: e.correct ? 1 : 0 } },
    ];
    for (let i = 0; i < MAX_CHECKS; i++) {
      const r = e.results[i];
      if (r) record.push({ name: `check${i + 1}`, base: { integer: r.passed ? 1 : 0 } });
    }
    record.push({ name: "loaded", base: { integer: m.loaded } });
    record.push({ name: "volume", base: { float: round1(m.volume) } });
    record.push({ name: "weight", base: { float: round1(m.weight) } });
    if (m.offset) {
      record.push({ name: "cogx", base: { float: round1(m.offset.x) } });
      record.push({ name: "cogy", base: { float: round1(m.offset.y) } });
    }
    record.push({ name: "placement", base: { string: serializePlacement(this.plan, placed) } });
    return { record };
  };

  /**
   * A record: score and maxscore, correct, check1 … (1 or 0 per check), loaded, volume, weight, cogx, cogy and the
   * placement as JSON. Nothing until the candidate loaded a box.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const { placed } = this.store.getState();
    if (!placed.length) return undefined;
    return this.responseFor(placed);
  };

  resetResponse = () => {
    this.store.reset();
  };

  /** A response (or a placement as a string) back in the cargo space: only its placement counts. */
  setResponse = (response: QtiVariableJSON) => {
    const text = placementText(response);
    if (!text) return;
    try {
      this.store.restoreState({ placed: ownPlacement(this.plan, JSON.parse(text)) }, []);
    } catch {
      console.error(`couldn't restore the response: ${text}`);
      this.resetResponse();
    }
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
    render(null, this.shadowdom); // frees the WebGL context of the 3D view
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.store.getActions(),
    });
}

export default new App();
