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
  ChartData, Mode, parseBoolean, parseChartType, parseData, parseLayout, parseLegend, parseMaxChoices, parseMode,
  parseOptionalNumber, parseOrientation, parseShowValues, segmentIds, serializeData,
} from "./chart";
import { ChartSettings } from "./view";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("showvalues"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

/** The chart's settings from the item's data- properties (strings). */
const chartSettings = (p: Record<string, string>): ChartSettings => ({
  title: String(p.title ?? ""),
  chartType: parseChartType(p.chartType),
  orientation: parseOrientation(p.orientation),
  layout: parseLayout(p.layout),
  showValues: parseShowValues(p.showValues),
  unit: String(p.unit ?? ""),
  valueAxisLabel: String(p.valueAxisLabel ?? ""),
  categoryAxisLabel: String(p.categoryAxisLabel ?? ""),
  min: parseOptionalNumber(p.min),
  max: parseOptionalNumber(p.max),
  gridlines: parseBoolean(p.gridlines, true),
  legend: parseLegend(p.legend),
  source: String(p.source ?? ""),
  width: Math.round(parseOptionalNumber(p.width) ?? 640),
  language: (String(p.language || "en")).slice(0, 2).toLowerCase() === "nl" ? "nl" : "en",
});

/** The segment ids in a response: one (base) or more (list), as identifier or, from some engines, as string. */
const idsIn = (response: QtiVariableJSON): string[] => {
  const r = response as any;
  const list = r?.list?.identifier ?? r?.list?.string;
  if (Array.isArray(list)) return list.map(String).filter(Boolean);
  const one = r?.base?.identifier ?? r?.base?.string;
  if (one === undefined || one === null || one === "") return [];
  return Array.isArray(one) ? one.map(String) : [String(one)];
};

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "dataChart";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  /** data-data: the author's table; without it the example. */
  data: ChartData;
  /** data-mode: the candidate chooses segments (select), or only looks (tool). */
  mode: Mode;
  /** data-max-choices: 1, more, or 0 for no limit. */
  maxChoices: number;
  settings: ChartSettings;

  private initialState: StateModel = { viewed: {}, selected: [] };
  // The correct response the delivery engine handed us at getInstance time.
  // See https://github.com/1EdTech/qti-project-management/issues/210
  private correctResponse: QtiVariableJSON | null = null;

  constructor(register = true) {
    if (register && ctx) {
      ctx.register(this);
    }
  }

  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App => {
    // a second interaction in the item (or on the page) gets an object of its own, with its own store and settings
    if (this.config) return new App(false).getInstance(dom, config, stateString);
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration);
    this.parseSettings();

    this.store = initStore(this.initialState);
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        const state = saved?.state;
        if (state && typeof state.viewed === "object" && Array.isArray(state.selected)) {
          this.store.restoreState({ viewed: { ...state.viewed }, selected: state.selected.map(String) }, saved.log ?? []);
        }
      } catch {
        // not a state of this PCI: start without looks and choices
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && (idsIn(response).length || response?.base?.string)) {
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
    const baseType = declaration.baseType ?? "identifier";
    if (Array.isArray(value)) return { list: { [baseType]: value.map(String) } } as QtiVariableJSON;
    return { base: { [baseType]: String(value) } } as QtiVariableJSON;
  };

  private parseSettings = () => {
    const p = this.config.properties as unknown as Record<string, string>;
    this.data = parseData(p.data);
    this.mode = parseMode(p.mode);
    this.maxChoices = parseMaxChoices(p.maxChoices);
    this.settings = chartSettings(p);
  };

  /** More than one segment, or the item declares a list: the response is a list. */
  private multiple = () => this.maxChoices !== 1 || this.config?.responseDeclaration?.cardinality === "multiple";

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={this.config.properties.prompt} data={this.data} settings={this.settings} mode={this.mode}
        maxChoices={this.maxChoices} store={this.store} texts={textsFor(this.settings.language)} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author fills the table (categories × series, names, colours) and, in select mode, marks the
   * correct segments in the preview; getProperties() gives data-data. Only an authoring system calls this (AUTHORING.md,
   * "Authoring mode"); delivery never does.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) } as unknown as Record<string, string>;
    let data = parseData(properties.data);
    const mode = parseMode(properties.mode);
    const maxChoices = parseMaxChoices(properties.maxChoices);
    const settings = chartSettings(properties);
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={data} settings={settings} mode={mode} maxChoices={maxChoices} language={language}
        onChange={(next) => { data = next; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ data: serializeData(data) }),
      validate: () => authoringProblems(data, mode, maxChoices, settings.chartType, language),
      oncompleted: () => render(null, host),
    };
    config.onready?.(instance);
    return instance;
  };

  /**
   * The correct response for these settings (config.tspci.correctResponse "settings"): the segments the author marked,
   * as getResponse() reports them. None in tool mode, or when nothing is marked.
   */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const p = { ...defaults, ...normalize(properties as Record<string, string>) } as unknown as Record<string, string>;
    if (parseMode(p.mode) !== "select") return undefined;
    const data = parseData(p.data);
    const correct = data.correct.filter((id) => segmentIds(data).includes(id));
    if (!correct.length) return undefined;
    return parseMaxChoices(p.maxChoices) === 1 ? { base: { identifier: correct[0] } } : { list: { identifier: correct } } as QtiVariableJSON;
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    window.requestAnimationFrame(() => this.render());
  };

  /**
   * Select mode: the chosen segment (c3-s2), or a list of them with more than one choice. Tool mode: how often the
   * candidate looked at each segment, as JSON ({"c3-s2":2,"c1-s1":1}). Nothing until there is something.
   */
  getResponse = () => {
    const { viewed, selected } = this.store.getState();
    const ids = segmentIds(this.data);
    if (this.mode === "select") {
      const chosen = selected.filter((id) => ids.includes(id));
      if (!chosen.length) return undefined;
      return this.multiple() ? { list: { identifier: chosen } } as QtiVariableJSON : { base: { identifier: chosen[0] } };
    }
    const looked = Object.entries(viewed ?? {}).filter(([id]) => ids.includes(id));
    if (!looked.length) return undefined;
    return { base: { string: JSON.stringify(Object.fromEntries(looked)) } };
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  setResponse = (response: QtiVariableJSON) => {
    if (!response) return;
    const ids = segmentIds(this.data);
    if (this.mode === "select") {
      const chosen = idsIn(response).filter((id, i, all) => ids.includes(id) && all.indexOf(id) === i);
      if (!chosen.length) return this.resetResponse();
      const limited = this.maxChoices > 0 ? chosen.slice(0, this.maxChoices) : chosen;
      this.store.restoreState({ ...this.store.getState(), selected: limited }, []);
      return;
    }
    const text = response?.base?.string?.toString();
    if (!text) return;
    try {
      const raw = JSON.parse(text);
      const viewed = Object.fromEntries(Object.entries(raw ?? {}).filter(([id, n]) => ids.includes(id) && Number(n) > 0).map(([id, n]) => [id, Math.round(Number(n))]));
      this.store.restoreState({ ...this.store.getState(), viewed }, []);
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
