import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import Authoring, { authoringProblems, AuthoringConfig } from "./authoring";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import {
  IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, IMSpciAuthoringFactory, PciAuthoringConfiguration,
  PciAuthoringInstance, QtiRecordItem,
} from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore } from "./store";
import { MAX_TARGETS, Mark, Setup, Snap, detectDirection, evaluate, ownMarks, parseMarks, resolveSetup, serializeCategories, serializeMarks, serializeScoring } from "./marker";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("maxmarks"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

const isTrue = (value: unknown) => String(value).toLowerCase() === "true";
const count = (value: unknown) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const MARKS = /^\s*\d+(-\d+)?(:[a-z][a-z0-9]*)?(\s+\d+(-\d+)?(:[a-z][a-z0-9]*)?)*\s*$/;

/** The marks in a response, a correct response or a saved value: the marks field of a record, or a string. */
const marksText = (value: any): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return MARKS.test(value) || value.trim() === "" ? value : null;
  if (Array.isArray(value?.record)) return marksText(value.record.find((f: any) => f?.name === "marks")?.base?.string ?? "");
  if (typeof value?.base?.string === "string") return marksText(value.base.string);
  if (typeof value?.marks === "string") return marksText(value.marks);
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = v?.fieldIdentifier === "marks" || v?.name === "marks" ? marksText(v.value ?? v.base?.string ?? "") : marksText(v);
      if (found !== null) return found;
    }
  }
  return null;
};

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "textMarker";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  /** The text with its words, the categories, the key and the scoring rules from the settings. */
  setupData: Setup;

  private initialState: StateModel = { marks: [] };
  // The correct response the delivery engine handed us at getInstance time, or else the author's key.
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
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration) ?? this.keyResponse();

    this.store = initStore(this.initialState);
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        if (Array.isArray(saved?.state?.marks)) this.store.restoreState({ marks: this.own(saved.state.marks) }, saved.log ?? []);
      } catch {
        // not a state of this PCI: start without marks
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && marksText(response)) {
        this.setResponse(response);
      }
    }

    // The item is in solution status and there is a correct response (from the engine, or the author's key):
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
   * Paints the correct response received at getInstance time (or the author's key). A delivery engine calls this when
   * it moves an already running interaction into review.
   */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  private own = (marks: unknown): Mark[] => ownMarks(marks, this.setupData.doc.words.length, this.setupData.categories);

  private correctResponseFromDeclaration = (
    declaration: ConfigProperties<PropTypes>["responseDeclaration"]
  ): QtiVariableJSON | null => {
    const text = marksText(declaration?.correctResponse?.value ?? declaration?.correctResponse);
    if (!text) return null;
    const marks = this.own(parseMarks(text, this.setupData.categories[0].id));
    return marks.length ? this.responseFor(marks) : null;
  };

  private keyResponse = (): QtiVariableJSON | null => (this.setupData.key.length ? this.responseFor(this.setupData.key) : null);

  private textLanguage = () => (this.config.properties.textLanguage || this.config.properties.language || "").trim();

  private parseSettings = () => {
    this.setupData = resolveSetup(this.config.properties, this.textLanguage());
  };

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    const p = this.config.properties;
    const status = this.config.status as string;
    const direction = p.direction === "rtl" || p.direction === "ltr" ? p.direction : detectDirection(this.setupData.doc.paragraphs.map((x) => x.text).join(" "));
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={p.prompt} doc={this.setupData.doc} categories={this.setupData.categories} store={this.store}
        texts={textsFor(p.language)} limits={{ maxMarks: count(p.maxMarks), maxLength: count(p.maxLength) }}
        snap={(p.snap === "sentence" ? "sentence" : "word") as Snap} direction={direction} textLanguage={this.textLanguage()}
        showLabels={isTrue(p.showLabels)} maxHeight={count(p.height)}
        readOnly={status === "solution" || status === "review" || status === "closed"} solution={status === "solution"} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author writes the text, defines the categories, marks the correct spans and sets the scoring
   * rules; getProperties() gives data-text, data-categories, data-key and data-scoring (AUTHORING.md, "Authoring mode").
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const textLanguage = (properties.textLanguage || properties.language || "").trim();
    const setup = resolveSetup(properties, textLanguage);
    let current: AuthoringConfig = {
      text: (properties.text ?? "").trim() ? properties.text : setup.text,
      categories: setup.categories,
      key: setup.key,
      scoring: setup.scoring,
    };
    const item = {
      snap: (properties.snap === "sentence" ? "sentence" : "word") as Snap,
      maxMarks: count(properties.maxMarks),
      maxLength: count(properties.maxLength),
      textLanguage,
      direction: properties.direction,
      showLabels: isTrue(properties.showLabels),
    };
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={current} item={item} language={language} onChange={(next) => { current = next; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({
        text: current.text,
        categories: serializeCategories(current.categories),
        key: serializeMarks(current.key),
        scoring: serializeScoring(current.scoring),
      }),
      validate: () => authoringProblems(current, item, language),
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
    window.requestAnimationFrame(() => {
      this.render();
      // marks that no longer fit the text or the categories go
      const marks = this.store.getState().marks;
      const own = this.own(marks);
      if (own.length !== marks.length) this.store.restoreState({ marks: own }, this.store.getActions());
    });
  };

  /** The record for the marks: the score against the key, per target 2/1/0, the extra marks and the marks themselves. */
  private responseFor = (marks: Mark[]): QtiVariableJSON => {
    const { key, scoring } = this.setupData;
    const e = evaluate(key, marks, scoring);
    const record: QtiRecordItem[] = [
      { name: "score", base: { integer: e.score } },
      { name: "maxscore", base: { integer: e.maxscore } },
      { name: "correct", base: { integer: e.correct ? 1 : 0 } },
      { name: "extra", base: { integer: e.extra } },
    ];
    for (let i = 0; i < Math.min(MAX_TARGETS, key.length); i++) record.push({ name: `target${i + 1}`, base: { integer: e.hits[i] } });
    record.push({ name: "marks", base: { string: serializeMarks(marks) } });
    return { record };
  };

  /**
   * A record: score and maxscore, correct (every target right and no extra marks), extra (marks that belong to no
   * target), target1 … (2 correct, 1 partly, 0 missed) and marks ("12-18:a 40-44:b"). Nothing without marks.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const { marks } = this.store.getState();
    if (!marks.length) return undefined;
    return this.responseFor(marks);
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response (or the marks as a string) back in the text: only its marks count, the rest follows from them. */
  setResponse = (response: QtiVariableJSON) => {
    const text = marksText(response);
    if (text === null) return;
    this.store.restoreState({ marks: this.own(parseMarks(text, this.setupData.categories[0].id)) }, []);
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
