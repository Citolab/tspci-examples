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
import {
  Rules, Separator, Table, displayValue, expectedValues, inputCells, normalizeValue, parseRules, parseTable, scoreValues, separatorFor, serializeTable,
} from "./table";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("maxcharacters"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

const pciScoring = (properties: Partial<PropTypes>) => String(properties.scoring ?? "").toLowerCase() === "pci";
const whole = (value: string, fallback: number) => {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** The values in a response, in response order: an ordered list, a record with a values field, or a JSON array as text. */
const valuesIn = (response: QtiVariableJSON | undefined | null): string[] | null => {
  if (!response) return null;
  const r = response as any;
  const list = r.list?.string ?? r.list?.float ?? r.list?.integer;
  if (Array.isArray(list)) return list.map((v) => (v === null || v === undefined ? "" : String(v)));
  const field = Array.isArray(r.record) ? r.record.find((f) => f?.name === "values")?.base?.string : undefined;
  const text = field ?? r.base?.string;
  if (typeof text !== "string" || text === "") return null;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map((v) => (v === null || v === undefined ? "" : String(v)));
  } catch {
    // one value
  }
  return [text];
};

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "tableEntry";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  /** data-table: the table the author built; without it the example table. */
  table: Table;
  /** data-input-mode, data-max-characters, data-decimals, data-allow-negative */
  rules: Rules;
  separator: Separator;

  private initialState: StateModel = { values: {} };
  // The correct response the delivery engine handed us at getInstance time.
  // See https://github.com/1EdTech/qti-project-management/issues/210
  private correctResponse: QtiVariableJSON | null = null;

  /** The registered object only makes instances: each interaction on the page gets its own store and settings. */
  private readonly registered: boolean;

  constructor(register = true) {
    this.registered = register;
    if (register && ctx) {
      ctx.register(this);
    }
  }

  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App => {
    if (this.registered) return new App(false).getInstance(dom, config, stateString);
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration);
    this.parseSettings();

    this.store = initStore(this.initialState);
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        if (saved?.state?.values && typeof saved.state.values === "object") this.store.restoreState({ values: saved.state.values }, saved.log ?? []);
      } catch {
        // not a state of this PCI: start with an empty table
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && valuesIn(response)) {
        this.setResponse(response);
      }
    }

    // The item is in solution status: show the correct response on top of whatever was restored above. The one the
    // engine passed along, or else the expected values of the table (PCI scoring has no list to pass).
    if (this.config.status === "solution") {
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
   * Paints the correct response received at getInstance time, or the expected values of the table. A delivery engine
   * calls this when it moves an already running interaction into review.
   */
  showCorrectResponse = () => {
    this.setResponse(this.correctResponse ?? { list: { string: expectedValues(this.table, this.rules) } } as QtiVariableJSON);
  };

  private correctResponseFromDeclaration = (
    declaration: ConfigProperties<PropTypes>["responseDeclaration"]
  ): QtiVariableJSON | null => {
    const value = declaration?.correctResponse?.value;
    if (value === undefined || value === null) return null;
    const values = Array.isArray(value) ? value : [value];
    return { list: { string: values.map((v) => String(v ?? "")) } } as QtiVariableJSON;
  };

  private parseSettings = () => {
    this.table = parseTable(this.config.properties.table);
    this.rules = parseRules(this.config.properties);
    this.separator = separatorFor(this.config.properties.language);
  };

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    const status = this.config.status;
    render(
      <Interaction prompt={this.config.properties.prompt} table={this.table} rules={this.rules} separator={this.separator}
        store={this.store} texts={textsFor(this.config.properties.language)}
        readOnly={status === "review" || status === "closed" || status === "solution"} solution={status === "solution"} />,
      this.shadowdom
    );
  };

  /**
   * The correct response for these settings, for an authoring system (config.tspci.correctResponse "settings"): the
   * expected values in response order. With PCI scoring there is no list to compare, so none.
   */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const p = { ...defaults, ...normalize(properties as Record<string, string>) };
    if (pciScoring(p)) return undefined;
    const values = expectedValues(parseTable(p.table), parseRules(p));
    return values.length && values.every((v) => v !== "") ? ({ list: { string: values } } as QtiVariableJSON) : undefined;
  };

  /**
   * Authoring mode: the author builds the table, with given cells and input cells with their expected values;
   * getProperties() gives data-table. Only an authoring system calls this (AUTHORING.md, "Authoring mode"); delivery never does.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    let table = parseTable(properties.table);
    const rules = parseRules(properties);
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={table} rules={rules} language={language}
        onChange={(next) => { table = next; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ table: serializeTable(table) }),
      validate: () => authoringProblems(table, rules, language),
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

  /** The normalized value of every input cell, in reading order ("" for an empty one). */
  private values = () => {
    const { values } = this.store.getState();
    return inputCells(this.table).map((c) => normalizeValue(values[c.id] ?? "", this.rules));
  };

  /**
   * One value per input cell in reading order, normalized (3,50 → 3.5), as an ordered list of strings; with
   * data-scoring="pci" a record with the values and the PCI's score. Nothing until a cell has a value.
   */
  getResponse = () => {
    const values = this.values();
    if (values.every((v) => v === "")) return undefined;
    if (!pciScoring(this.config.properties)) return { list: { string: values } } as QtiVariableJSON;
    const p = this.config.properties;
    const s = scoreValues(values, this.table, this.rules, whole(p.maxScore, 2), whole(p.penalty, 1));
    return {
      record: [
        { name: "values", base: { string: JSON.stringify(values) } },
        { name: "correct", base: { integer: s.correct } },
        { name: "errors", base: { integer: s.errors } },
        { name: "score", base: { integer: s.score } },
        { name: "maxscore", base: { integer: s.maxscore } },
      ],
    } as unknown as QtiVariableJSON;
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  setResponse = (response: QtiVariableJSON) => {
    const values = valuesIn(response);
    if (!values) {
      this.resetResponse();
      return;
    }
    const cells = inputCells(this.table);
    const shown = Object.fromEntries(cells.map((c, i) => [c.id, displayValue(normalizeValue(values[i] ?? "", this.rules), this.rules, this.separator)]));
    this.store.restoreState({ values: shown }, []);
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
