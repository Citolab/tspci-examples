import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import Authoring, { authoringProblems } from "./authoring";
import RotaAuthoring, { rotaProblems } from "./rotaAuthoring";
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
import {
  ROTA_MODES, Rota, RotaMode, RotaState, correctState, exampleState, ownShifts, parseRota, rotaResponse, serializeRota,
  stateFromFields,
} from "./rota";
import { rotaTextsFor } from "./rotaTexts";
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
type Mode = "plan" | RotaMode;
const modeOf = (value: unknown): Mode => ((ROTA_MODES as readonly string[]).includes(String(value)) ? (value as RotaMode) : "plan");

/**
 * The fields of a record response, a correct response or a saved value, by name: { record: [...] }, a declaration's
 * values with field identifiers, or an object of fields. A string is a rota (JSON).
 */
const recordFields = (value: any): Record<string, unknown> | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return /^\s*[[{]/.test(value) ? { rota: value } : null;
  const valueOf = (base: any) => (base && typeof base === "object" ? Object.values(base)[0] : base);
  if (Array.isArray(value?.record)) return Object.fromEntries(value.record.map((f: any) => [f?.name, valueOf(f?.base)]));
  const list = Array.isArray(value) ? value : Array.isArray(value?.value) ? value.value : null;
  if (list) {
    const named = list.filter((v: any) => v?.fieldIdentifier || v?.name);
    if (named.length) return Object.fromEntries(named.map((v: any) => [v.fieldIdentifier ?? v.name, v.value ?? valueOf(v.base)]));
    return list.length ? recordFields(list[0]) : null;
  }
  if (typeof value === "object") return value;
  return null;
};

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
  /** data-mode: the week planner ("plan") or a rota mode */
  mode: Mode = "plan";
  /** data-rota: the shop, employees, shift cards, rota, rules, questions and pay of the rota modes; without it the example. */
  rota: Rota;

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
          this.store.restoreState({ ...this.ownRotaState(saved.state), placements: ownPlacements(this.planner, saved.state.placements) }, saved.log ?? []);
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
      if (!stateString && (this.mode === "plan" ? scheduleText(response) : recordFields(response))) {
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
    if (this.mode !== "plan") {
      const fields = recordFields(declaration?.correctResponse?.value ?? declaration?.correctResponse);
      const state = fields ? stateFromFields(this.rota, this.mode, fields, this.language()) : null;
      return state ? this.rotaResponseFor(state) : null;
    }
    const text = scheduleText(declaration?.correctResponse?.value ?? declaration?.correctResponse);
    const raw = text ? parseSchedule(text) : null;
    return raw ? this.responseFor(ownPlacements(this.planner, raw)) : null;
  };

  private solutionResponse = (): QtiVariableJSON | null => {
    if (this.mode === "plan") return this.planner.solution ? this.responseFor(this.planner.solution) : null;
    const state = exampleState(this.rota, this.mode, this.language());
    return state ? this.rotaResponseFor(state) : null;
  };

  private language = () => (String(this.config.properties.language ?? "en").toLowerCase().startsWith("nl") ? "nl" : "en");

  private parseSettings = () => {
    this.mode = modeOf(this.config.properties.mode);
    this.planner = parsePlanner(this.config.properties.planner, this.config.properties.language);
    this.rota = parseRota(this.config.properties.rota, this.language());
  };

  /** The rota parts of a saved state, fitted to the rota (unknown employees and days left out). */
  private ownRotaState = (saved: any): Partial<StateModel> => {
    const out: Partial<StateModel> = {};
    if (Array.isArray(saved?.shifts)) out.shifts = ownShifts(this.rota, saved.shifts);
    if (Array.isArray(saved?.answers)) out.answers = saved.answers.slice(0, this.rota.questions.length);
    const strings = (v: unknown) => (Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : "")).slice(0, this.rota.employees.length) : undefined);
    if (strings(saved?.hours)) out.hours = strings(saved.hours);
    if (strings(saved?.pay)) out.pay = strings(saved.pay);
    return out;
  };

  /** The instruction: the author's; with the default one in a rota mode, the example's (or none for an own rota). */
  private prompt = () => {
    const prompt = this.config.properties.prompt;
    if (this.mode === "plan" || prompt !== defaults.prompt) return prompt;
    const t = rotaTextsFor(this.language());
    if (!String(this.config.properties.rota ?? "").trim()) return t.prompts[this.mode];
    return this.mode === "hoursAndPay" && this.rota.own ? t.ownPrompt : "";
  };

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={this.prompt()} mode={this.mode} planner={this.planner} rota={this.rota} store={this.store}
        texts={textsFor(this.config.properties.language)} rotaTexts={rotaTextsFor(this.language())}
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
    const exampleLanguage = normalize(config.properties as Record<string, string>).language ?? language;
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    const mode = modeOf(properties.mode);
    if (mode !== "plan") {
      // a rota mode: the author makes data-rota
      let rota = parseRota(properties.rota, String(exampleLanguage).startsWith("nl") ? "nl" : "en");
      render(<RotaAuthoring initial={rota} mode={mode} language={language} onChange={(next) => { rota = next; config.onchange?.(); }} />, host);
      const instance: PciAuthoringInstance = {
        getProperties: () => ({ rota: serializeRota(rota) }),
        validate: () => rotaProblems(rota, mode, language),
        oncompleted: () => render(null, host),
      };
      config.onready?.(instance);
      return instance;
    }
    let planner = parsePlanner(properties.planner, exampleLanguage);
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
    // another agenda or rota: keep what still fits
    const state = this.store.getState();
    this.store.restoreState({ ...state, ...this.ownRotaState(state), placements: ownPlacements(this.planner, state.placements) }, []);
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
    if (this.mode !== "plan") {
      const fields = rotaResponse(this.rota, this.mode, this.rotaState());
      return fields ? ({ record: fields } as QtiVariableJSON) : undefined;
    }
    const { placements } = this.store.getState();
    if (!placements.length) return undefined;
    return this.responseFor(placements);
  };

  private rotaState = (): RotaState => {
    const s = this.store.getState();
    return { shifts: s.shifts ?? [], answers: s.answers ?? [], hours: s.hours ?? [], pay: s.pay ?? [] };
  };

  /** The record of a rota mode for a state (rota.ts rotaResponse); a state that answers nothing gives the empty fields. */
  private rotaResponseFor = (state: RotaState): QtiVariableJSON | null => {
    const fields = rotaResponse(this.rota, this.mode as RotaMode, state);
    return fields ? ({ record: fields } as QtiVariableJSON) : null;
  };

  /**
   * The correct response for these settings (getCorrectResponse, AUTHORING.md section 4): readRota, and hoursAndPay
   * with a given rota, where the answers follow from the rota. undefined for the week planner, makeRota and an own
   * rota: many answers are right. It needs no instance and no DOM.
   */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const p = { ...defaults, ...normalize(properties as Record<string, string>) };
    const mode = modeOf(p.mode);
    if (mode === "plan") return undefined;
    const language = String(p.language ?? "en").toLowerCase().startsWith("nl") ? "nl" : "en";
    const rota = parseRota(p.rota, language);
    const state = correctState(rota, mode, language);
    const fields = state ? rotaResponse(rota, mode, state) : undefined;
    return fields ? ({ record: fields } as QtiVariableJSON) : undefined;
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response (or a schedule as a string) back in the agenda: only its schedule counts, the rest follows from it. */
  setResponse = (response: QtiVariableJSON) => {
    if (this.mode !== "plan") {
      const fields = recordFields(response);
      const state = fields ? stateFromFields(this.rota, this.mode, fields, this.language()) : null;
      if (state) this.store.restoreState({ ...this.store.getState(), ...state }, []);
      return;
    }
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
