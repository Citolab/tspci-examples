import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction, { View } from "./interaction";
import Authoring, { Authored, authoringProblems } from "./authoring";
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
  Answer, Band, Contour, Grid, Model, Task, allContours, bandsOf, cleanAnswers, correctAnswer, isEmpty, modelOf, parseTasks, parseTerrain,
  responseFields, sampleGrid, serializeTasks, serializeTerrain,
} from "./terrain";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("showheight"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

const isTrue = (value: unknown) => String(value).toLowerCase() === "true";

const viewOf = (p: Record<string, string>): View => {
  const interval = Number(String(p.interval).replace(",", "."));
  const exaggeration = Number(String(p.exaggeration).replace(",", "."));
  return {
    interval: Number.isFinite(interval) && interval > 0 ? interval : 10,
    tints: String(p.tints) !== "false",
    labels: String(p.contourLabels) !== "false",
    show3d: String(p.show3d) !== "false",
    exaggeration: Number.isFinite(exaggeration) ? Math.min(6, Math.max(1, exaggeration)) : 3,
    showHeight: isTrue(p.showHeight),
    language: String(p.language ?? "en").toLowerCase().startsWith("nl") ? "nl" : "en",
  };
};

/** The answers in a response, a correct response or a saved value: the answers field of a record, or the JSON itself. */
const answersText = (value: any): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value.trim().startsWith("[") ? value : null;
  if (Array.isArray(value?.record)) return answersText(value.record.find((f: any) => f?.name === "answers")?.base?.string);
  if (typeof value?.base?.string === "string") return answersText(value.base.string);
  if (typeof value?.answers === "string") return value.answers;
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = v?.fieldIdentifier === "answers" || v?.name === "answers" ? answersText(v.value ?? v.base?.string ?? v) : answersText(v);
      if (found) return found;
    }
  }
  return null;
};

/** The model, the grid and its contour lines for a terrain and an interval: worked out once per setting. */
type MapData = { model: Model; grid: Grid; contours: Contour[]; bands: Band[] };
const maps = new Map<string, MapData>();
const mapFor = (terrainText: string, interval: number): MapData => {
  const key = `${interval}|${terrainText}`;
  if (!maps.has(key)) {
    const model = modelOf(parseTerrain(terrainText));
    const grid = sampleGrid(model.terrain, model.height);
    maps.set(key, { model, grid, contours: allContours(grid, interval), bands: bandsOf(grid.min, grid.max, interval) });
    if (maps.size > 12) maps.delete(maps.keys().next().value);
  }
  return maps.get(key)!;
};

const recordOf = (fields: ReturnType<typeof responseFields>): QtiVariableJSON => ({
  record: fields.map((f): QtiRecordItem => {
    if (f.integer !== undefined) return { name: f.name, base: { integer: f.integer } };
    if (f.float !== undefined) return { name: f.name, base: { float: f.float } } as QtiRecordItem;
    return { name: f.name, base: { string: f.string ?? "" } };
  }),
});

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "contourMap";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  map: MapData;
  tasks: Task[];
  view: View;

  // The correct response the delivery engine handed us at getInstance time, or else the one from the settings.
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
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration) ?? this.settingsResponse();

    this.store = initStore({ answers: cleanAnswers(this.tasks, []) });
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        if (Array.isArray(saved?.state?.answers)) this.store.restoreState({ answers: cleanAnswers(this.tasks, saved.state.answers) }, saved.log ?? []);
      } catch {
        // not a state of this PCI: start without answers
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && answersText(response)) {
        this.setResponse(response);
      }
    }

    // The item is in solution status and there is a correct response (from the engine, or from the settings):
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
   * Shows the correct response received at getInstance time (or the one from the settings), with the correct
   * profile, point and stream drawn. A delivery engine calls this when it moves a running interaction into review.
   */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
    this.render();
  };

  private correctResponseFromDeclaration = (
    declaration: ConfigProperties<PropTypes>["responseDeclaration"]
  ): QtiVariableJSON | null => {
    const text = answersText(declaration?.correctResponse?.value ?? declaration?.correctResponse);
    if (!text) return null;
    try {
      return this.responseFor(cleanAnswers(this.tasks, JSON.parse(text)));
    } catch {
      return null;
    }
  };

  /** The correct answers worked out from the terrain and the tasks. */
  private settingsResponse = (): QtiVariableJSON => this.responseFor(this.tasks.map((t) => correctAnswer(this.map.model, t)));

  private parseSettings = () => {
    const p = this.config.properties as unknown as Record<string, string>;
    this.view = viewOf(p);
    this.map = mapFor(String(p.terrain ?? ""), this.view.interval);
    this.tasks = parseTasks(p.tasks);
  };

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    const p = this.config.properties as unknown as Record<string, string>;
    const t = textsFor(this.view.language);
    const status = this.config.status;
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={p.prompt?.trim() ? p.prompt : p.terrain?.trim() ? "" : t.examplePrompt} model={this.map.model} grid={this.map.grid}
        contours={this.map.contours} bands={this.map.bands} tasks={this.tasks} view={this.view} store={this.store} texts={t}
        readOnly={status === "solution" || status === "review"} showTruth={status === "solution"} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author shapes the terrain (hills by clicking and dragging), sets the map and makes the
   * tasks; getProperties() gives data-terrain, data-tasks and the map settings. Only an authoring system calls this.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) } as unknown as Record<string, string>;
    const view = viewOf(properties);
    let authored: Authored = {
      terrain: parseTerrain(properties.terrain),
      tasks: parseTasks(properties.tasks),
      interval: view.interval,
      tints: view.tints,
      labels: view.labels,
      showHeight: view.showHeight,
    };
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={authored} language={language} candidateLanguage={view.language} onChange={(next) => { authored = next; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({
        terrain: serializeTerrain(authored.terrain),
        tasks: serializeTasks(authored.tasks),
        interval: String(authored.interval),
        tints: String(authored.tints),
        contourLabels: String(authored.labels),
        showHeight: String(authored.showHeight),
      }),
      validate: () => authoringProblems(authored, language),
      oncompleted: () => render(null, host),
    };
    config.onready?.(instance);
    return instance;
  };

  /** The correct response from data-terrain and data-tasks (AUTHORING.md, "The correct response from the settings"). */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const p = { ...defaults, ...normalize(properties as Record<string, string>) } as unknown as Record<string, string>;
    const map = mapFor(String(p.terrain ?? ""), viewOf(p).interval);
    const tasks = parseTasks(p.tasks);
    return recordOf(responseFields(map.model, tasks, tasks.map((t) => correctAnswer(map.model, t))));
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    window.requestAnimationFrame(() => this.render());
  };

  private responseFor = (answers: Answer[]): QtiVariableJSON => recordOf(responseFields(this.map.model, this.tasks, answers));

  /**
   * A record: score and maxscore (the points of the tasks done right and of all tasks), correct (all right), and per
   * task task1 … (its points), task1number (a number response processing can test) and task1value (the answer as
   * text); answers holds everything as JSON. Nothing until the candidate did something.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const { answers } = this.store.getState();
    if (isEmpty(answers)) return undefined;
    return this.responseFor(answers);
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response (or the answers as JSON) back in the interaction: only its answers count, the rest follows from them. */
  setResponse = (response: QtiVariableJSON) => {
    const text = answersText(response);
    if (!text) return;
    try {
      this.store.restoreState({ answers: cleanAnswers(this.tasks, JSON.parse(text)) }, []);
    } catch {
      console.error(`couldn't restore the response: ${text}`);
      this.resetResponse();
    }
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
    render(null, this.shadowdom); // frees the WebGL context of the 3D model
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.store.getActions()
    });
}

export default new App();
