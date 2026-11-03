import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction, { Prepared } from "./interaction";
import Authoring, { authoringProblems } from "./authoring";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import {
  IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, IMSpciAuthoringFactory, PciAuthoringConfiguration,
  PciAuthoringInstance, QtiRecordItem,
} from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, EMPTY_STATE, StateModel, initStore } from "./store";
import { computeViews, dimensionsOf, parseFeatures, placeDims, segKey, variantsOf } from "./model";
import {
  LETTERS, Line, TaskType, askedOf, canonicalLines, checkDrawing, dimState, formatNumber, missingSegs, optionsOf, parseDrawing, parseLines,
  parseNumber, parseTaskType, scoreValues,
} from "./task";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("showmodel"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

const isTrue = (value: unknown) => String(value).toLowerCase() !== "false";
const isPoint = (p: unknown) => Array.isArray(p) && p.length === 2 && p.every((v) => Number.isFinite(v));
const isLine = (l: any): l is Line => !!l && (l.kind === "visible" || l.kind === "hidden") && isPoint(l.a) && isPoint(l.b);

/** Everything the settings say: the workpiece, its views and dimensions, and what the task asks. */
const prepare = (properties: Partial<PropTypes>): Prepared => {
  const task = parseTaskType(properties.task);
  const drawing = parseDrawing(properties.drawing as string, parseFeatures, task);
  const features = drawing.features;
  const views = computeViews(features);
  const dims = dimensionsOf(features);
  const shown = dims.filter((d) => {
    const s = dimState(drawing, d);
    return s === "show" || (s === "ask" && task === "dimensions");
  });
  const missing = new Set<string>();
  if (task === "complete") {
    const view = views[drawing.complete.view];
    missingSegs(view.segs, drawing.complete.remove, segKey).forEach((s) => missing.add(segKey(s)));
  }
  let options: Prepared["options"] = [];
  if (task === "model") {
    const resolved = drawing.options.length ? drawing : { ...drawing, options: variantsOf(features, 3) };
    options = optionsOf(resolved);
    drawing.correct = Math.min(drawing.correct, options.length - 1);
  }
  return { task, drawing, features, views, placed: placeDims(shown), asked: askedOf(task, drawing, dims), missing, options };
};

/** The values in a response or a correct response: a list of floats, or the values field of a record. */
const valuesIn = (value: any): (number | null)[] | null => {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value?.list?.float)) return value.list.float.map(Number);
  if (Array.isArray(value?.record)) {
    const text = value.record.find((f: any) => f?.name === "values")?.base?.string;
    return typeof text === "string" ? text.split(";").map((v) => (v === "" ? null : Number(v))) : null;
  }
  if (Array.isArray(value)) return value.map((v) => (v === null || v === "" ? null : Number(v?.value ?? v)));
  if (typeof value === "number" || typeof value === "string") return String(value).split(/[;\s]+/).filter(Boolean).map(Number);
  return null;
};
const choiceIn = (value: any): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value?.base?.identifier === "string") return value.base.identifier;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
};
const linesIn = (value: any): Line[] | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return parseLines(value);
  if (Array.isArray(value?.record)) {
    const text = value.record.find((f: any) => f?.name === "lines")?.base?.string;
    return typeof text === "string" ? parseLines(text) : null;
  }
  if (typeof value?.lines === "string") return parseLines(value.lines);
  if (Array.isArray(value)) {
    const field = value.find((v: any) => v?.fieldIdentifier === "lines" || v?.name === "lines");
    if (field) return linesIn(field.value ?? field.base?.string);
  }
  return null;
};

/** The response for a state, for these settings. */
const responseOf = (p: Prepared, state: StateModel, scoring: string, tolerance: number): QtiVariableJSON | undefined => {
  const { task } = p;
  if (task === "dimensions" || task === "read") {
    if (!p.asked.length) return undefined;
    const values = p.asked.map((_, i) => parseNumber(state.values[i] ?? ""));
    if (scoring === "pci") {
      if (values.every((v) => v === null)) return undefined;
      const s = scoreValues(values, p.asked.map((a) => a.dim.value), tolerance);
      const record: QtiRecordItem[] = [
        { name: "score", base: { integer: s.score } },
        { name: "maxscore", base: { integer: s.maxscore } },
        { name: "correct", base: { integer: s.correct ? 1 : 0 } },
      ];
      values.forEach((v, i) => v !== null && i < 8 && record.push({ name: `value${i + 1}`, base: { float: v } }));
      record.push({ name: "values", base: { string: values.map((v) => (v === null ? "" : String(v))).join(";") } });
      return { record };
    }
    // match correct: an ordered list, once every field holds a number
    if (values.some((v) => v === null)) return undefined;
    return { list: { float: values as number[] } };
  }
  if (task === "view" || task === "model") return state.choice ? { base: { identifier: state.choice } } : undefined;
  // complete a view: the PCI's checks
  if (!state.lines.length) return undefined;
  const view = p.views[p.drawing.complete.view];
  const missing = view.segs.filter((s) => p.missing.has(segKey(s)));
  const grid = p.drawing.complete.grid;
  const c = checkDrawing(view.segs, missing, state.lines, grid, p.drawing.complete.points);
  const flag = (b: boolean | null) => (b === false ? 0 : 1);
  return {
    record: [
      { name: "score", base: { integer: c.score } },
      { name: "maxscore", base: { integer: c.maxscore } },
      { name: "correct", base: { integer: c.correct ? 1 : 0 } },
      { name: "visibleOk", base: { integer: flag(c.visibleOk) } },
      { name: "hiddenOk", base: { integer: flag(c.hiddenOk) } },
      { name: "noExtra", base: { integer: c.noExtra ? 1 : 0 } },
      { name: "lines", base: { string: canonicalLines(state.lines, grid) } },
    ],
  };
};

/** The state that shows the correct answer for these settings. */
const correctState = (p: Prepared, language: string): StateModel | null => {
  switch (p.task) {
    case "dimensions":
    case "read":
      return p.asked.length ? { ...EMPTY_STATE, values: p.asked.map((a) => formatNumber(a.dim.value, language)) } : null;
    case "view":
      return { ...EMPTY_STATE, choice: p.drawing.identify.view };
    case "model":
      return p.options.length > 1 ? { ...EMPTY_STATE, choice: LETTERS[p.drawing.correct] } : null;
    case "complete": {
      const view = p.views[p.drawing.complete.view];
      const lines = view.segs.filter((s) => p.missing.has(segKey(s))).map((s) => ({ kind: s.kind, a: s.a, b: s.b }) as Line);
      return lines.length ? { ...EMPTY_STATE, lines } : null;
    }
  }
};

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "technicalDrawing";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  prepared: Prepared;
  private language = "en";

  private initialState: StateModel = EMPTY_STATE;
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
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration) ?? this.getCorrectResponse(config.properties) ?? null;

    this.store = initStore(this.initialState);
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        const s = saved?.state;
        if (s && typeof s === "object") {
          this.store.restoreState({
            values: Array.isArray(s.values) ? s.values.map((v: unknown) => String(v ?? "")) : [],
            lines: Array.isArray(s.lines) ? s.lines.filter(isLine) : [],
            choice: typeof s.choice === "string" ? s.choice : null,
          }, saved.log ?? []);
        }
      } catch {
        // not a state of this PCI: start empty
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && response) this.setResponse(response);
    }

    // The item is in solution status and there is a correct response: show it on top of whatever was restored above.
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
      dom.dispatchEvent(new CustomEvent("qti-interaction-changed", { detail: event }));
    }, { immediate: false });

    this.config.onready && this.config.onready(this);
    return this;
  };

  /** Paints the correct response received at getInstance time (or the one from the settings). */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  private correctResponseFromDeclaration = (declaration: ConfigProperties<PropTypes>["responseDeclaration"]): QtiVariableJSON | null => {
    const value = declaration?.correctResponse?.value as any;
    if (value === undefined || value === null) return null;
    const task = this.prepared.task;
    if (task === "view" || task === "model") {
      const choice = choiceIn(value);
      return choice ? { base: { identifier: choice } } : null;
    }
    if (task === "complete") {
      const lines = linesIn(value);
      return lines ? { record: [{ name: "lines", base: { string: canonicalLines(lines, this.prepared.drawing.complete.grid) } }] } : null;
    }
    const values = valuesIn(value);
    return values ? { list: { float: values.map((v) => v ?? NaN) } } : null;
  };

  private parseSettings = () => {
    this.prepared = prepare(this.config.properties);
    this.language = textsFor(this.config.properties.language) === textsFor("nl") ? "nl" : "en";
  };

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    const p = this.config.properties;
    render(
      <Interaction prompt={p.prompt === defaults.prompt ? textsFor(this.language).defaultPrompt[this.prepared.task] : p.prompt} prepared={this.prepared} store={this.store} texts={textsFor(this.language)} language={this.language}
        showModel={isTrue(p.showModel)} showLabels={isTrue(p.showLabels)} modelView={p.modelView === "2d" ? "2d" : "3d"}
        readOnly={this.config.status === "solution" || this.config.status === "review"} />,
      this.shadowdom
    );
  };

  /**
   * The correct response for these settings (config.tspci.correctResponse "settings"): the asked dimensions, the view
   * shown, the drawn workpiece's letter, or the lines left out. No DOM.
   */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const all = { ...defaults, ...normalize(properties as Record<string, string>) };
    const p = prepare(all);
    const language = String(all.language ?? "en");
    const state = correctState(p, language);
    if (!state) return undefined;
    return responseOf(p, state, String(all.scoring), Number(all.tolerance) || 0);
  };

  /**
   * Authoring mode: the author builds the workpiece from features, chooses the dimensions, the questions, the view to
   * complete or name and the other workpieces; getProperties() gives data-drawing.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    const task: TaskType = parseTaskType(properties.task);
    let drawing = parseDrawing(properties.drawing, parseFeatures, task);
    let chosenTask = task;
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={drawing} task={task} language={language} candidateLanguage={String(properties.language)}
        onChange={(next, nextTask) => { drawing = next; chosenTask = nextTask; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ drawing: JSON.stringify(drawing), task: chosenTask }),
      validate: () => authoringProblems(drawing, chosenTask, language),
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
   * Dimensions and read: the numbers as an ordered list of floats, once every field holds one (data-scoring="pci": a
   * record). View and model: the identifier chosen. Complete: a record with the PCI's checks and the lines.
   */
  getResponse = (): QtiVariableJSON | undefined =>
    responseOf(this.prepared, this.store.getState(), String(this.config.properties.scoring), Number(this.config.properties.tolerance) || 0);

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response back in the interaction: the numbers in the fields, the choice, or the lines on the grid. */
  setResponse = (response: QtiVariableJSON) => {
    const task = this.prepared.task;
    if (task === "view" || task === "model") {
      const choice = choiceIn(response);
      if (choice) this.store.restoreState({ ...EMPTY_STATE, choice }, []);
      return;
    }
    if (task === "complete") {
      const lines = linesIn(response);
      if (lines) this.store.restoreState({ ...EMPTY_STATE, lines }, []);
      return;
    }
    const values = valuesIn(response);
    if (values) this.store.restoreState({ ...EMPTY_STATE, values: values.map((v) => (v === null || !Number.isFinite(v) ? "" : formatNumber(v, this.language))) }, []);
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
  };

  /** Takes the interaction off the page: unmounting frees the WebGL context of the 3D model. */
  destroy = () => {
    this.store.unsubscribeAll();
    render(null, this.shadowdom);
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.store.getActions()
    });
}

export default new App();
