import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction, { ViewSettings } from "./interaction";
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
  CORE, Entry, MAX_CHECKS, Mode, Plan, composition, entriesFrom, evaluate, ownEntries, parseAmountUnit, parseBoolean, parseMode, parsePlan,
  serializePlan,
} from "./nutrition";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("amountunit"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

const languageOf = (p: Record<string, string>) => (String(p.language || "en").slice(0, 2).toLowerCase() === "nl" ? "nl" : "en");

const viewSettings = (p: Record<string, string>): ViewSettings => ({
  mode: parseMode(p.mode),
  amountUnit: parseAmountUnit(p.amountUnit),
  showTotals: parseBoolean(p.showTotals, true),
  showBars: parseBoolean(p.showBars, true),
  showPortion: parseBoolean(p.showPortion, true),
  showExtras: parseBoolean(p.showExtras, true),
  labelsOpen: parseBoolean(p.labelsOpen, false),
  language: languageOf(p),
});

/** A composition (product → grams) from a JSON text: the object itself, or { composition: … } (tool mode). */
const compositionFromText = (text: string): Record<string, number> | null => {
  try {
    const raw = JSON.parse(text);
    const comp = raw && typeof raw === "object" && raw.composition && typeof raw.composition === "object" ? raw.composition : raw;
    if (!comp || typeof comp !== "object" || Array.isArray(comp)) return null;
    const out: Record<string, number> = {};
    for (const [id, g] of Object.entries(comp)) if (typeof g === "number" || typeof g === "string") out[id] = Number(g);
    return out;
  } catch {
    return null;
  }
};

/**
 * The composition in a response, a correct response or a saved value: the composition field of a record, a JSON
 * string, or a record value from a response declaration.
 */
const compositionIn = (value: any): Record<string, number> | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value.trim().startsWith("{") ? compositionFromText(value) : null;
  if (Array.isArray(value?.record)) return compositionIn(value.record.find((f: any) => f?.name === "composition")?.base?.string);
  if (typeof value?.base?.string === "string") return compositionIn(value.base.string);
  if (typeof value?.composition === "string") return compositionIn(value.composition);
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = v?.fieldIdentifier === "composition" || v?.name === "composition" ? compositionIn(v.value ?? v.base?.string ?? v) : compositionIn(v);
      if (found) return found;
    }
  }
  return null;
};

/** The product in a select response: an identifier (or a string, from some engines). */
const productIn = (value: any): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value || null;
  const one = value?.base?.identifier ?? value?.base?.string ?? (Array.isArray(value) ? value[0] : undefined);
  return one === undefined || one === null || one === "" ? null : String(one);
};

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "nutritionLabel";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  /** data-plan: the author's products, reference intakes and checks; without it the example. */
  plan: Plan;
  mode: Mode;
  settings: ViewSettings;

  private initialState: StateModel = { entries: [], selected: null };
  // The correct response the delivery engine handed us at getInstance time, or else the author's answer.
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
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration) ?? this.authorResponse();

    this.store = initStore(this.initialState);
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        const state = saved?.state;
        if (state && typeof state === "object") {
          const selected = typeof state.selected === "string" && this.plan.products.some((p) => p.id === state.selected) ? state.selected : null;
          this.store.restoreState({ entries: ownEntries(this.plan.products, state.entries), selected }, saved.log ?? []);
        }
      } catch {
        // not a state of this PCI: start with an empty meal
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && (compositionIn(response) || (this.mode === "select" && productIn(response)))) {
        this.setResponse(response);
      }
    }

    // The item is in solution status and there is a correct response (from the engine, or the author's answer):
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
   * Paints the correct response received at getInstance time (or the author's answer). A delivery engine
   * calls this when it moves an already running interaction into review.
   */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  private correctResponseFromDeclaration = (declaration: ConfigProperties<PropTypes>["responseDeclaration"]): QtiVariableJSON | null => {
    const value = (declaration?.correctResponse as any)?.value ?? declaration?.correctResponse;
    if (value === undefined || value === null) return null;
    if (this.mode === "select") {
      const id = productIn(Array.isArray(value) ? value[0] : value?.value ?? value);
      return id && this.plan.products.some((p) => p.id === id) ? { base: { identifier: id } } : null;
    }
    const comp = compositionIn(value);
    return comp ? this.responseFor(entriesFrom(comp, this.plan.products)) : null;
  };

  /** The author's answer: the select answer, or the model meal. */
  private authorResponse = (): QtiVariableJSON | null => {
    if (this.mode === "select") return this.plan.answer ? { base: { identifier: this.plan.answer } } : null;
    return this.plan.solution ? this.responseFor(entriesFrom(this.plan.solution, this.plan.products)) : null;
  };

  private parseSettings = () => {
    const p = this.config.properties as unknown as Record<string, string>;
    this.settings = viewSettings(p);
    this.mode = this.settings.mode;
    this.plan = parsePlan(p.plan, this.settings.language);
  };

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={this.config.properties.prompt} plan={this.plan} settings={this.settings} store={this.store}
        texts={textsFor(this.settings.language)} readOnly={this.config.status === "solution"} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author pastes the products, chooses the target group, the task and the checks;
   * getProperties() gives data-plan and data-mode. Only an authoring system calls this (AUTHORING.md, "Authoring mode").
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) } as unknown as Record<string, string>;
    const settings = viewSettings(properties);
    let plan = parsePlan(properties.plan, settings.language);
    let mode = settings.mode;
    let lines = 0;
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={plan} mode={mode} settings={settings} language={language}
        onChange={(next, nextMode, problemLines) => { plan = next; mode = nextMode; lines = problemLines; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ plan: serializePlan(plan), mode }),
      validate: () => authoringProblems(plan, mode, settings.amountUnit, lines, language),
      oncompleted: () => render(null, host),
    };
    config.onready?.(instance);
    return instance;
  };

  /**
   * The correct response for these settings (config.tspci.correctResponse "settings"): in select mode the product the
   * author chose. None in compose mode (the checks score it) or tool mode.
   */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const p = { ...defaults, ...normalize(properties as Record<string, string>) } as unknown as Record<string, string>;
    if (parseMode(p.mode) !== "select") return undefined;
    const plan = parsePlan(p.plan, languageOf(p));
    return plan.answer ? { base: { identifier: plan.answer } } : undefined;
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    window.requestAnimationFrame(() => this.render());
  };

  /** The record for a meal: the checks' results and score, the totals and the composition. */
  private responseFor = (entries: Entry[]): QtiVariableJSON => {
    const comp = composition(entries, this.plan.products);
    const e = evaluate(this.plan, comp);
    const record: QtiRecordItem[] = [
      { name: "score", base: { integer: e.score } },
      { name: "maxscore", base: { integer: e.maxscore } },
      { name: "correct", base: { integer: e.correct ? 1 : 0 } },
    ];
    for (let i = 0; i < MAX_CHECKS; i++) {
      const r = e.results[i];
      if (r) record.push({ name: `check${i + 1}`, base: { integer: r.passed ? 1 : 0 } });
    }
    record.push({ name: "items", base: { integer: Object.keys(comp).length } });
    for (const n of CORE) record.push({ name: n, base: { float: e.totals[n] ?? 0 } });
    record.push({ name: "composition", base: { string: JSON.stringify(comp) } });
    record.push({ name: "totals", base: { string: JSON.stringify(e.totals) } });
    return { record };
  };

  /**
   * Compose mode: a record (score, maxscore, correct, check1 …, items, the totals, composition and totals as JSON).
   * Select mode: the chosen product, an identifier. Tool mode: { composition, totals } as a JSON string. Nothing until
   * the candidate added a product or chose one.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const { entries, selected } = this.store.getState();
    if (this.mode === "select") return selected ? { base: { identifier: selected } } : undefined;
    const comp = composition(entries, this.plan.products);
    if (!Object.keys(comp).length) return undefined;
    if (this.mode === "tool") {
      const { totals } = evaluate({ ...this.plan, checks: [] }, comp);
      return { base: { string: JSON.stringify({ composition: comp, totals }) } };
    }
    return this.responseFor(entries);
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response back in the PCI: the chosen product, or the composition (in grams); the rest follows from it. */
  setResponse = (response: QtiVariableJSON) => {
    if (!response) return;
    if (this.mode === "select") {
      const id = productIn(response);
      const selected = id && this.plan.products.some((p) => p.id === id) ? id : null;
      this.store.restoreState({ ...this.store.getState(), selected }, []);
      return;
    }
    const comp = compositionIn(response);
    if (!comp) return;
    this.store.restoreState({ ...this.store.getState(), entries: entriesFrom(comp, this.plan.products) }, []);
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
