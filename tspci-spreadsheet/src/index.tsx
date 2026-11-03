import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import Authoring, { authoringProblems } from "./authoring";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import { IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, IMSpciAuthoringFactory, PciAuthoringConfiguration, PciAuthoringInstance } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore } from "./store";
import { Locale, evaluateSheet, literalNumber, localeFor, responseText } from "./formula";
import { Mode, Sheet, byPosition, inBounds, inputsOf, parseMode, parseSheet, serializeSheet } from "./sheet";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("showformulabar"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "spreadsheet";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  /** data-sheet: the sheet the author set up; without it the example sheet. */
  sheet: Sheet;
  /** data-mode: the answer goes in the answer cell, or the sheet is a tool. */
  mode: Mode;
  locale: Locale;

  private initialState: StateModel = { cells: {} };
  // The correct response the delivery engine handed us at getInstance time.
  // See https://github.com/1EdTech/qti-project-management/issues/210
  private correctResponse: QtiVariableJSON | null = null;

  constructor() {
    if (ctx) {
      ctx.register(this);
    }
  }

  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string) => {
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration);
    this.parseSettings();

    this.store = initStore(this.initialState);
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        if (saved?.state?.cells && typeof saved.state.cells === "object") this.store.restoreState({ cells: saved.state.cells }, saved.log ?? []);
      } catch {
        // not a state of this PCI: start with the sheet as the author made it
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && response?.base?.string) {
        this.setResponse(response);
      }
    }

    // The item is in solution status and the engine passed a correct response along:
    // show that on top of whatever was restored above. Both conditions have to hold,
    // so an engine that does not implement this keeps the behaviour it always had.
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
   * Paints the correct response received at getInstance time. A delivery engine
   * calls this when it moves an already running interaction into review.
   */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  private correctResponseFromDeclaration = (
    declaration: ConfigProperties<PropTypes>["responseDeclaration"]
  ): QtiVariableJSON | null => {
    const value = declaration?.correctResponse?.value;
    if (value === undefined || value === null) return null;
    return { base: { string: String(value) } } as QtiVariableJSON;
  };

  private parseSettings = () => {
    this.sheet = parseSheet(this.config.properties.sheet);
    this.mode = parseMode(this.config.properties.mode);
    this.locale = localeFor(this.config.properties.language);
  };

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={this.config.properties.prompt} sheet={this.sheet} mode={this.mode}
        showFormulaBar={String(this.config.properties.showFormulaBar) !== "false"} store={this.store}
        locale={this.locale} texts={textsFor(this.config.properties.language)} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author sets up the sheet (size, cells, locked cells, the answer cell); getProperties() gives
   * data-sheet. Only an authoring system calls this (AUTHORING.md, "Authoring mode"); delivery never does.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    let sheet = parseSheet(properties.sheet);
    const mode = parseMode(properties.mode);
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={sheet} mode={mode} locale={localeFor(properties.language)} language={language}
        onChange={(next) => { sheet = next; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ sheet: serializeSheet(sheet) }),
      validate: () => authoringProblems(sheet, mode, language),
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
   * Answer mode: the value of the answer cell, the same in every language (15.1, not 15,1). Tool mode: the cells the
   * candidate changed, with their input and value, as JSON for a rater. Nothing until there is something.
   */
  getResponse = () => {
    const edits = this.store.getState().cells;
    const inputs = inputsOf(this.sheet, edits);
    const values = evaluateSheet(inputs, this.sheet, this.locale);
    if (this.mode === "answer") {
      const text = this.sheet.answer ? responseText(values.get(this.sheet.answer) ?? null) : null;
      return text === null ? undefined : { base: { string: text } };
    }
    const changed = Object.keys(edits).filter((ref) => inBounds(this.sheet, ref) && !this.sheet.cells[ref]?.locked).sort(byPosition);
    if (!changed.length) return undefined;
    const cells = Object.fromEntries(changed.map((ref) => [ref, { input: inputs[ref] ?? "", value: responseText(values.get(ref) ?? null) ?? "" }]));
    return { base: { string: JSON.stringify(cells) } };
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  setResponse = (response: QtiVariableJSON) => {
    const text = response?.base?.string?.toString();
    if (!text) return;
    if (this.mode === "answer") {
      if (!this.sheet.answer) return;
      // a value, not a formula: text that looks like one stays text
      const input = literalNumber(text) !== null || !text.startsWith("=") ? text : `'${text}`;
      this.store.restoreState({ cells: { [this.sheet.answer]: input } }, []);
      return;
    }
    try {
      const cells = JSON.parse(text) as Record<string, { input: string }>;
      this.store.restoreState({ cells: Object.fromEntries(Object.entries(cells).map(([ref, c]) => [ref, String(c?.input ?? "")])) }, []);
    } catch {
      console.error(`couldn't restore the response: ${text}`);
      this.resetResponse();
    }
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
