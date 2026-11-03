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
import {
  Chart, MAX_CHECKS, Settings, baseChart, canonical, chartFromCanonical, evaluate, ownChart, parseSettings, sameChart, serializeChart,
  serializeSettings, solutionChart,
} from "./flowchart";
import { autoLayout } from "./layout";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("showoutline"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

const isTrue = (value: unknown) => String(value).toLowerCase() !== "false";
const pciScoring = (properties: Partial<PropTypes>) => String(properties.scoring ?? "").toLowerCase() === "pci";

type Found = { json?: any; graph?: string };
/**
 * The chart in a response, a correct response or a saved value: the chart field of a record (else its graph field),
 * a chart as JSON, or a canonical graph ("c1,c2,…|c1>c2;…").
 */
const chartIn = (value: any): Found | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const text = value.trim();
    if (text.startsWith("{")) {
      try {
        return { json: JSON.parse(text) };
      } catch {
        return null;
      }
    }
    return text.includes("|") ? { graph: text } : null;
  }
  if (Array.isArray(value?.record)) {
    const get = (name: string) => value.record.find((f: any) => f?.name === name)?.base?.string;
    return chartIn(get("chart")) ?? chartIn(get("graph"));
  }
  if (typeof value?.base?.string === "string") return chartIn(value.base.string);
  if (Array.isArray(value)) {
    // a record value from a declaration: [{ fieldIdentifier, value }]; or a list with one value
    const byField = (name: string) => value.find((v: any) => v?.fieldIdentifier === name || v?.name === name);
    const f = byField("chart") ?? byField("graph");
    if (f) return chartIn(f.value ?? f.base?.string);
    for (const v of value) {
      const found = chartIn(v);
      if (found) return found;
    }
  }
  if (typeof value?.chart === "string") return chartIn(value.chart);
  if (typeof value?.graph === "string") return chartIn(value.graph);
  if (Array.isArray(value?.nodes)) return { json: value };
  return null;
};

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "flowchart";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  /** data-flowchart: the task, the cards, the chart, the solution and the checks; without it the example. */
  settings: Settings;

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
  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App =>
    new App(false).setup(dom, config, stateString);

  private setup = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App => {
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.settings = parseSettings(this.config.properties.flowchart);
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration) ?? this.solutionResponse();

    this.store = initStore({ chart: baseChart(this.settings) });
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        if (saved?.state?.chart) this.store.restoreState({ chart: ownChart(this.settings, saved.state.chart) }, saved.log ?? []);
      } catch {
        // not a state of this PCI: start with the chart as the author made it
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && chartIn(response)) {
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
   * Paints the correct response received at getInstance time (or the author's solution). A delivery engine calls
   * this when it moves an already running interaction into review.
   */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  /** A found chart as a chart of this item. */
  private chartOf = (found: Found | null): Chart | null => {
    if (!found) return null;
    if (found.json) return ownChart(this.settings, found.json);
    const chart = found.graph ? chartFromCanonical(this.settings, found.graph, autoLayout) : null;
    return chart ? ownChart(this.settings, chart) : null;
  };

  private correctResponseFromDeclaration = (declaration: ConfigProperties<PropTypes>["responseDeclaration"]): QtiVariableJSON | null => {
    const chart = this.chartOf(chartIn(declaration?.correctResponse?.value ?? declaration?.correctResponse));
    return chart ? this.responseFor(chart) : null;
  };

  private solutionResponse = (): QtiVariableJSON | null => {
    const solution = solutionChart(this.settings);
    return solution ? this.responseFor(solution) : null;
  };

  /**
   * Not QTI: for an authoring system (config.tspci.correctResponse "settings"). With the item scoring
   * (MATCH_CORRECT): the canonical graph of the author's solution. With PCI scoring there is nothing to compare: none.
   */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const props = { ...defaults, ...normalize(properties as Record<string, string>) };
    if (pciScoring(props)) return undefined;
    const settings = parseSettings(props.flowchart);
    const solution = solutionChart(settings);
    return solution ? { base: { string: canonical(settings, solution) } } : undefined;
  };

  render = () => {
    const p = this.config.properties;
    this.settings = parseSettings(p.flowchart); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={p.prompt} settings={this.settings} store={this.store} texts={textsFor(p.language)}
        readOnly={this.config.status === "solution"} showOutline={isTrue(p.showOutline)} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author picks the task, writes the cards, builds the chart and the solution and sets the
   * checks; getProperties() gives data-flowchart. Only an authoring system calls this (AUTHORING.md, "Authoring mode").
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    let settings = parseSettings(properties.flowchart);
    const scoring = pciScoring(properties) ? "pci" : "match";
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={settings} language={language} scoring={scoring} onChange={(next) => { settings = next; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ flowchart: serializeSettings(settings) }),
      validate: () => authoringProblems(settings, scoring, language),
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

  /** The response for a chart: the canonical graph, or with PCI scoring the record with the checks. */
  private responseFor = (chart: Chart): QtiVariableJSON => {
    if (!pciScoring(this.config.properties)) return { base: { string: canonical(this.settings, chart) } };
    const e = evaluate(this.settings, chart);
    const record: QtiRecordItem[] = [
      { name: "score", base: { integer: e.score } },
      { name: "maxscore", base: { integer: e.maxscore } },
      { name: "correct", base: { integer: e.correct ? 1 : 0 } },
    ];
    for (let i = 0; i < MAX_CHECKS; i++) {
      const r = e.results[i];
      if (r) record.push({ name: `check${i + 1}`, base: { integer: r.passed ? 1 : 0 } });
    }
    record.push({ name: "graph", base: { string: e.graph } });
    record.push({ name: "chart", base: { string: serializeChart(chart) } });
    return { record };
  };

  /**
   * The canonical graph (the same for every layout), or with data-scoring="pci" a record: score, maxscore, correct,
   * check1 …, graph and the chart as JSON. Nothing until the candidate changed the chart.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const { chart } = this.store.getState();
    if (sameChart(chart, baseChart(this.settings))) return undefined;
    return this.responseFor(chart);
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response (a record, a graph or a chart as JSON) back on the chart. */
  setResponse = (response: QtiVariableJSON) => {
    const chart = this.chartOf(chartIn(response));
    if (!chart) {
      console.error(`couldn't restore the response: ${JSON.stringify(response)}`);
      return;
    }
    this.store.restoreState({ chart }, []);
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
