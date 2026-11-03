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
import { MAX_EVENTS, Placed, Timeline, correctPlacements, ownPlacements, parseTimeline, responseFields, samePlacements, serializeTimeline } from "./timeline";
import { languageOf, textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("showvalue"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

/** The value of a QTI base ({ float: 1648 }, { identifier: "t6" }, …). */
const baseValue = (base: any): unknown => (base && typeof base === "object" ? Object.values(base)[0] : base);

/**
 * The fields of a response, a correct response or a saved value, by name: a record ({ record: [{ name, base }] }),
 * values with a field identifier ([{ fieldIdentifier, value }]), an object ({ placements: "…" }) or the placements as
 * a JSON string.
 */
const fieldsOf = (value: any): Record<string, unknown> | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { placements: parsed } : null;
    } catch {
      return null;
    }
  }
  if (Array.isArray(value?.record)) {
    return Object.fromEntries(value.record.filter((f: any) => f?.name).map((f: any) => [f.name, baseValue(f.base)]));
  }
  if (typeof value?.base?.string === "string") return fieldsOf(value.base.string);
  if (Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    for (const v of value) {
      const name = v?.fieldIdentifier ?? v?.name ?? v?.identifier;
      if (name) out[name] = v.value ?? baseValue(v.base);
    }
    return Object.keys(out).length ? out : null;
  }
  if (typeof value === "object") return value;
  return null;
};

/** The placements in the fields of a response: the placements field, or else the year or period fields. */
const placementsOf = (t: Timeline, value: unknown): Placed | null => {
  const fields = fieldsOf(value);
  if (!fields) return null;
  let raw: unknown = fields.placements;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  if (!raw || typeof raw !== "object") {
    const built: Record<string, unknown> = {};
    t.events.forEach((e, i) => {
      const v = t.mode === "period" ? fields[`period${i + 1}`] : fields[`year${i + 1}`];
      if (v !== undefined && v !== null) built[e.id] = v;
    });
    if (!Object.keys(built).length) return null;
    raw = built;
  }
  return ownPlacements(t, raw);
};

const responseOf = (t: Timeline, placed: Placed): QtiVariableJSON => ({
  record: responseFields(t, placed).map(([name, type, value]) => ({ name, base: { [type]: value } }) as QtiRecordItem),
});

let instances = 0;

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "timeline";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  /** data-timeline: the axis, periods, events and answers the author made; without it the example. */
  timeline: Timeline;
  private id = `tl${++instances}`;
  private readOnly = false;

  private initialState: StateModel = { placed: {} };
  // The correct response the delivery engine handed us at getInstance time, or else the author's answers.
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
    this.readOnly = config.status === "solution";
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration) ?? this.settingsResponse();

    this.store = initStore(this.initialState);
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        if (saved?.state?.placed) this.store.restoreState({ placed: ownPlacements(this.timeline, saved.state.placed) }, saved.log ?? []);
      } catch {
        // not a state of this PCI: start with every card in the list
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && placementsOf(this.timeline, response)) {
        this.setResponse(response);
      }
    }

    // The item is in solution status and there is a correct response (from the engine, or the author's answers):
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
   * Puts the cards where the correct response (from the engine, or the author's answers) has them. A delivery engine
   * calls this when it moves an already running interaction into review.
   */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  private correctResponseFromDeclaration = (declaration: ConfigProperties<PropTypes>["responseDeclaration"]): QtiVariableJSON | null => {
    const placed = placementsOf(this.timeline, declaration?.correctResponse?.value ?? declaration?.correctResponse);
    return placed && Object.keys(placed).length ? responseOf(this.timeline, placed) : null;
  };

  private settingsResponse = (): QtiVariableJSON | null => {
    const placed = correctPlacements(this.timeline);
    return placed ? responseOf(this.timeline, placed) : null;
  };

  private parseSettings = () => {
    const p = this.config.properties as unknown as Record<string, string>;
    this.timeline = parseTimeline(p.timeline, languageOf(p.language));
  };

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    const p = this.config.properties as unknown as Record<string, string>;
    const t = textsFor(p.language);
    // the example's instruction in the candidate's language
    const prompt = p.prompt === defaults.prompt && !String(p.timeline ?? "").trim() ? t.examplePrompt : p.prompt;
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={prompt} timeline={this.timeline} store={this.store} texts={t} language={languageOf(p.language)}
        readOnly={this.readOnly} showValue={String(p.showValue).toLowerCase() !== "false"} minHeight={Math.max(0, Number(p.height) || 0)}
        idPrefix={this.id} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author sets the axis, the periods, the events with their answers, the mode and the margin;
   * getProperties() gives data-timeline. Only an authoring system calls this (AUTHORING.md, "Authoring mode").
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) } as unknown as Record<string, string>;
    const language = languageOf(config.language ?? "en"); // the author's language, not the candidate's
    let timeline = parseTimeline(properties.timeline, languageOf(properties.language));
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={timeline} language={language} candidateLanguage={languageOf(properties.language)}
        onChange={(next) => { timeline = next; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ timeline: serializeTimeline({ ...timeline, events: timeline.events.slice(0, MAX_EVENTS) }) }),
      validate: () => authoringProblems(timeline, language),
      oncompleted: () => render(null, host),
    };
    config.onready?.(instance);
    return instance;
  };

  /** The correct response from data-timeline (AUTHORING.md, "The correct response from the settings"). */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const p = { ...defaults, ...normalize(properties as Record<string, string>) } as unknown as Record<string, string>;
    const t = parseTimeline(p.timeline, languageOf(p.language));
    const placed = correctPlacements(t);
    return placed ? responseOf(t, placed) : undefined;
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    window.requestAnimationFrame(() => this.render());
  };

  /**
   * A record: score and maxscore (scored by the PCI from data-timeline), correct, check1 … per event, year1 … (date
   * mode) and period1 … per event, the order and the pairs in the right order (order mode), and the placements as
   * JSON. Nothing until a card is on the timeline.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const { placed } = this.store.getState();
    if (samePlacements(placed, {})) return undefined;
    return responseOf(this.timeline, placed);
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response (or the placements as JSON) back on the timeline: the placements field, or the year / period fields. */
  setResponse = (response: QtiVariableJSON) => {
    const placed = placementsOf(this.timeline, response);
    if (!placed) return;
    this.store.restoreState({ placed }, []);
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
