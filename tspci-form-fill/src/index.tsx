import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import Authoring, { authoringProblems, AuthoringSettings } from "./authoring";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import {
  IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, IMSpciAuthoringFactory, PciAuthoringConfiguration,
  PciAuthoringInstance,
} from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore } from "./store";
import { Form, Values, normalizeAll, ownValues, parseForm, rawFromNormalized, responseRecord, serializeForm, valuesFrom } from "./form";
import { langOf, textsFor } from "./texts";
import { Theme } from "./formView";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("validation"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

const isTrue = (value: unknown) => String(value).toLowerCase() === "true";
const themeOf = (value: unknown): Theme => (String(value).toLowerCase() === "web" ? "web" : "paper");
const columnsOf = (value: unknown): 1 | 2 => (String(value) === "1" ? 1 : 2);
const formOf = (p: Partial<PropTypes>) => parseForm(p.form, p.example);

/** The record for normalised values: score, maxscore, correct, check1 …, value1 … and values (form.ts). */
const responseFor = (form: Form, normalized: Values): QtiVariableJSON => ({ record: responseRecord(form, normalized) } as QtiVariableJSON);

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "formFill";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  /** data-form: the form the author built; without it the example (data-example). */
  form: Form;
  private language = "en";

  private initialState: StateModel = { values: {} };
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
        if (saved?.state?.values && typeof saved.state.values === "object") this.store.restoreState({ values: ownValues(this.form, saved.state.values) }, saved.log ?? []);
      } catch {
        // not a state of this PCI: start with an empty form
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && valuesFrom(response)) {
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

  private correctResponseFromDeclaration = (declaration: ConfigProperties<PropTypes>["responseDeclaration"]): QtiVariableJSON | null => {
    const values = valuesFrom(declaration?.correctResponse?.value ?? declaration?.correctResponse);
    return values ? responseFor(this.form, ownValues(this.form, values)) : null;
  };

  private solutionResponse = (): QtiVariableJSON | null =>
    this.form.solution && Object.keys(this.form.solution).length ? responseFor(this.form, ownValues(this.form, this.form.solution)) : null;

  /** The response the author's solution gives (an authoring system fills the correct response with it). No DOM. */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const p = { ...defaults, ...normalize(properties as Record<string, string>) };
    const form = formOf(p);
    return form.solution && Object.keys(form.solution).length ? responseFor(form, ownValues(form, form.solution)) : undefined;
  };

  private parseSettings = () => {
    this.form = formOf(this.config.properties);
    this.language = langOf(this.config.properties.language);
  };

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    const p = this.config.properties;
    render(
      <Interaction prompt={p.prompt} form={this.form} store={this.store} texts={textsFor(this.language)} language={this.language}
        theme={themeOf(p.theme)} columns={columnsOf(p.columns)} validation={isTrue(p.validation)} readOnly={this.config.status === "solution"} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author builds the form (sections, fields, labels, checks), chooses the look and fills in the
   * solution; getProperties() gives data-form, data-theme, data-columns and data-validation.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    let settings: AuthoringSettings = {
      form: formOf(properties), theme: themeOf(properties.theme), columns: columnsOf(properties.columns), validation: isTrue(properties.validation),
    };
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(<Authoring initial={settings} language={language} onChange={(next) => { settings = next; config.onchange?.(); }} />, host);
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ form: serializeForm(settings.form), theme: settings.theme, columns: String(settings.columns), validation: String(settings.validation) }),
      validate: () => authoringProblems(settings.form, language),
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
   * A record: score and maxscore (the points of the passed and of all checks), correct (every check passed),
   * check1 … (1 or 0 per check), value1 … (the normalised value per field) and values (JSON). Nothing until the
   * candidate filled in a field.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const { values } = this.store.getState();
    if (!Object.values(values).some((v) => String(v).trim() !== "")) return undefined;
    return responseFor(this.form, normalizeAll(this.form, values, this.language));
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response (or values as a JSON string) back in the form: only its values count, the rest follows from them. */
  setResponse = (response: QtiVariableJSON) => {
    const values = valuesFrom(response);
    if (!values) return;
    this.store.restoreState({ values: rawFromNormalized(this.form, ownValues(this.form, values), this.language) }, []);
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
