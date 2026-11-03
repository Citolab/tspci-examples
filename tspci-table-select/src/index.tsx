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
import { Mode, Table, choices, parseMode, parseTable, serializeTable } from "./table";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("selectionmode"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "tableSelect";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  /** data-table: the table the author built; without it the example timetable. */
  table: Table;
  /** data-selection-mode: the candidate chooses a row or a cell. */
  mode: Mode;

  private initialState: StateModel = { selected: null };
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
        if (typeof saved?.state?.selected === "string") this.store.restoreState({ selected: saved.state.selected }, saved.log ?? []);
      } catch {
        // not a state of this PCI: start without a choice
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (this.chosenIn(response)) {
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
    return { base: { [declaration.baseType ?? "identifier"]: value } } as QtiVariableJSON;
  };

  /** The id in a response; TAO and some engines hand it over as a string. */
  private chosenIn = (response: QtiVariableJSON): string | null => {
    const value = response?.base?.identifier ?? response?.base?.string;
    return value === undefined || value === null || value === "" ? null : String(value);
  };

  private parseSettings = () => {
    this.table = parseTable(this.config.properties.table);
    this.mode = parseMode(this.config.properties.selectionMode);
  };

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={this.config.properties.prompt} table={this.table} mode={this.mode} store={this.store}
        texts={textsFor(this.config.properties.language)} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author builds the table and fills it; getProperties() gives data-table. Only an authoring system
   * calls this (AUTHORING.md, "Authoring mode"); delivery never does.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    let table = parseTable(properties.table);
    const mode = parseMode(properties.selectionMode);
    const language = (config.language ?? "en").slice(0, 2);
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={table} mode={mode} language={language}
        onChange={(next) => { table = next; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ table: serializeTable(table) }),
      validate: () => authoringProblems(table, mode, language),
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
    this.render();
  };

  /** The id of the chosen row (r2) or cell (r2-c3); nothing when the choice is not in the table (any more). */
  getResponse = () => {
    const { selected } = this.store.getState();
    if (!selected || !choices(this.table, this.mode).includes(selected)) {
      return undefined;
    }
    return {
      base: {
        identifier: selected,
      },
    };
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  setResponse = (response: QtiVariableJSON) => {
    if (!response) return;
    const id = this.chosenIn(response);
    if (id && choices(this.table, this.mode).includes(id)) {
      this.store.restoreState({ selected: id }, []);
    } else {
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
