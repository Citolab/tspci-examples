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
import { MAX_CHECKS, Placement, Planner, evaluate, ownPlacements, parsePlanner, parseSchedule, scheduleJSON, serializePlanner } from "./planner";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("feedback", "planner"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

const isTrue = (value: unknown) => String(value).toLowerCase() === "true";

/** The schedule in a response, a correct response or a saved value: the schedule field of a record, or a JSON string. */
const scheduleText = (value: any): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return /^\s*[[{]/.test(value) ? value : null;
  if (Array.isArray(value?.record)) return scheduleText(value.record.find((f: any) => f?.name === "schedule")?.base?.string);
  if (typeof value?.base?.string === "string") return scheduleText(value.base.string);
  // a correct response from a declaration: { schedule: "…" }, or values with a field identifier
  if (typeof value?.schedule === "string") return value.schedule;
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = v?.fieldIdentifier === "schedule" || v?.name === "schedule" ? scheduleText(v.value ?? v.base?.string ?? v) : scheduleText(v);
      if (found) return found;
    }
  }
  return null;
};

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "weekPlanner";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  /** data-planner: the agenda, tasks and checks the author made; without it the example. */
  planner: Planner;

  private initialState: StateModel = { placements: [] };
  // The correct response the delivery engine handed us at getInstance time, or else the author's example solution.
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
    // some hosts (the dev page) hand over the item's states per response identifier
    if (stateString && typeof stateString === "object") {
      const states = stateString as unknown as Record<string, string>;
      stateString = states[config.responseIdentifier] ?? Object.values(states)[0];
    }
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = typeof stateString === "string" ? JSON.parse(stateString) : stateString;
        if (Array.isArray(saved?.state?.placements)) {
          this.store.restoreState({ placements: ownPlacements(this.planner, saved.state.placements) }, saved.log ?? []);
        }
      } catch {
        // not a state of this PCI: start with an empty agenda
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && scheduleText(response)) {
        this.setResponse(response);
      }
    }

    // The item is in solution status and there is a correct response (from the engine, or the author's example
    // solution): show that on top of whatever was restored above.
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
   * Paints the correct response received at getInstance time (or the author's example solution). A delivery engine
   * calls this when it moves an already running interaction into review.
   */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  private correctResponseFromDeclaration = (
    declaration: ConfigProperties<PropTypes>["responseDeclaration"]
  ): QtiVariableJSON | null => {
    const text = scheduleText(declaration?.correctResponse?.value ?? declaration?.correctResponse);
    const raw = text ? parseSchedule(text) : null;
    return raw ? this.responseFor(ownPlacements(this.planner, raw)) : null;
  };

  private solutionResponse = (): QtiVariableJSON | null => (this.planner.solution ? this.responseFor(this.planner.solution) : null);

  private parseSettings = () => {
    this.planner = parsePlanner(this.config.properties.planner, this.config.properties.language);
  };

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={this.config.properties.prompt} planner={this.planner} store={this.store} texts={textsFor(this.config.properties.language)}
        feedback={isTrue(this.config.properties.feedback)} readOnly={this.config.status === "solution"} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author sets up the agenda, the resources, the fixed blocks, the tasks, the checks and an
   * example solution; getProperties() gives data-planner. Only an authoring system calls this (AUTHORING.md, "Authoring mode").
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    // the example in the item's language when it has one, else in the author's
    let planner = parsePlanner(properties.planner, normalize(config.properties as Record<string, string>).language ?? language);
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={planner} language={language} onChange={(next) => { planner = next; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ planner: serializePlanner(planner) }),
      validate: () => authoringProblems(planner, language),
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
    this.parseSettings();
    // another agenda: keep what still fits
    this.store.restoreState({ placements: ownPlacements(this.planner, this.store.getState().placements) }, []);
    window.requestAnimationFrame(() => this.render());
  };

  /** The record for a schedule: the checks' results and score, and the schedule itself. */
  private responseFor = (placements: Placement[]): QtiVariableJSON => {
    const e = evaluate(this.planner, placements);
    const record: QtiRecordItem[] = [
      { name: "score", base: { integer: e.score } },
      { name: "maxscore", base: { integer: e.maxscore } },
      { name: "correct", base: { integer: e.correct ? 1 : 0 } },
    ];
    for (let i = 0; i < MAX_CHECKS; i++) {
      const r = e.results[i];
      if (r) record.push({ name: `check${i + 1}`, base: { integer: r.passed ? 1 : 0 } });
    }
    record.push({ name: "planned", base: { integer: placements.length } });
    record.push({ name: "schedule", base: { string: scheduleJSON(placements) } });
    return { record };
  };

  /**
   * A record: score and maxscore (the points of the passed and of all checks), correct (every check passed),
   * check1 … (1 or 0 per check), planned (how many tasks) and the schedule as JSON. Nothing while the agenda is empty.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const { placements } = this.store.getState();
    if (!placements.length) return undefined;
    return this.responseFor(placements);
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response (or a schedule as a string) back in the agenda: only its schedule counts, the rest follows from it. */
  setResponse = (response: QtiVariableJSON) => {
    const text = scheduleText(response);
    const raw = text ? parseSchedule(text) : null;
    if (!raw) return;
    this.store.restoreState({ placements: ownPlacements(this.planner, raw) }, []);
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
