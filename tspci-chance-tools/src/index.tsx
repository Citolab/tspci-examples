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
  Experiment, MAX_TARGETS, MAX_TRIALS, Mode, Setup, designJson, emptyTree, evaluateDesign, evaluateTree, experimentLog, formatRat,
  isEmptyTree, newSeed, normalizeEntry, ownDesign, ownTree, parseMode, parseSetup, readDesign, sameDesign, serializeSetup, solutionDesign,
  solutionTree, startDesign, trialCount, treeJson, valueOf,
} from "./chance";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("showtheory"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

const isTrue = (value: unknown) => String(value).toLowerCase() === "true";
const languageOf = (p: Partial<PropTypes>) => (String(p.language ?? "en").toLowerCase().startsWith("nl") ? "nl" : "en");

/** A field of a record response, or of a correct response from a declaration ({ fieldIdentifier, value }). */
const fieldOf = (value: any, name: string): any => {
  if (!value) return undefined;
  if (Array.isArray(value?.record)) {
    const base = value.record.find((f: any) => f?.name === name)?.base;
    return base ? Object.values(base)[0] : undefined;
  }
  if (Array.isArray(value)) {
    const f = value.find((v: any) => v?.fieldIdentifier === name || v?.name === name);
    return f ? f.value ?? f.base?.string : undefined;
  }
  if (typeof value === "object" && name in value) return value[name];
  return undefined;
};

/** The experiment in a tool-mode response (the log as JSON), or null. */
const experimentFrom = (value: any): Experiment | null => {
  const text = typeof value === "string" ? value : value?.base?.string;
  if (typeof text !== "string") return null;
  try {
    const log = JSON.parse(text);
    if (!Array.isArray(log?.runs) || !Number.isFinite(Number(log.seed))) return null;
    const runs = log.runs.map(Number).filter((n: number) => Number.isInteger(n) && n > 0);
    let room = MAX_TRIALS;
    return { seed: Number(log.seed) >>> 0, start: Math.max(0, Math.round(Number(log.start) || 0)), runs: runs.map((n: number) => { const k = Math.min(n, room); room -= k; return k; }).filter(Boolean) };
  } catch {
    return null;
  }
};

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "chanceTools";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  mode: Mode;
  /** data-setup: the tool, the targets and the tree options; without it the example of the mode */
  settings: Setup;

  // The correct response the delivery engine handed us at getInstance time.
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
    // a correct response in the declaration: a record value with the field design or tree
    const declared: any = config.responseDeclaration?.correctResponse;
    const correct = declared?.value ?? declared;
    const fields = ["design", "tree"].filter((f) => typeof fieldOf(correct, f) === "string");
    this.correctResponse = fields.length ? ({ record: fields.map((f) => ({ name: f, base: { string: fieldOf(correct, f) } })) } as QtiVariableJSON) : null;

    // the seed of this session: data-seed (for a fixed series), or a new one; a restored state brings its own
    const seed = Number(config.properties.seed);
    const initial: StateModel = {
      experiment: { seed: String(config.properties.seed ?? "").trim() && Number.isFinite(seed) ? seed >>> 0 : newSeed(), start: 0, runs: [] },
      design: startDesign(this.settings),
      tree: emptyTree(),
    };
    this.store = initStore(initial);
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        const s = saved?.state;
        if (s?.experiment) {
          const e = experimentFrom(JSON.stringify(s.experiment)) ?? initial.experiment;
          this.store.restoreState({ experiment: e, design: ownDesign(this.settings, s.design), tree: ownTree(s.tree) }, saved.log ?? []);
        }
      } catch {
        // not a state of this PCI: start as the item does
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && response) {
        this.setResponse(response);
      }
    }

    // The item is in solution status: show the correct response (the engine's, or the one that follows from the
    // settings) on top of whatever was restored above.
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
   * Paints the correct response received at getInstance time, or else the solution of the settings (the design that
   * meets the targets, the tree filled in). A tool has none. A delivery engine calls this when it moves an already
   * running interaction into review.
   */
  showCorrectResponse = () => {
    if (this.correctResponse) return this.setResponse(this.correctResponse);
    const state = this.store.getState();
    if (this.mode === "design") {
      const d = solutionDesign(this.settings);
      if (d) this.store.restoreState({ ...state, design: d }, []);
    }
    if (this.mode === "tree") this.store.restoreState({ ...state, tree: solutionTree(this.settings) }, []);
  };

  private parseSettings = () => {
    const p = this.config.properties;
    this.mode = parseMode(p.mode);
    this.settings = parseSetup(p.setup, this.mode, languageOf(p));
  };

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    const p = this.config.properties;
    const status = this.config.status;
    const language = languageOf(p);
    render(
      <Interaction prompt={p.prompt} mode={this.mode} setup={this.settings} store={this.store} t={textsFor(language)} language={language}
        showTheory={isTrue(p.showTheory)} solution={status === "solution"}
        readOnly={status === "review" || status === "closed" || status === "solution"} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author picks the tool and sets it up, the task (mode), the targets or the tree, and the margin;
   * getProperties() gives data-mode and data-setup. Only an authoring system calls this (AUTHORING.md, "Authoring mode").
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    let mode = parseMode(properties.mode);
    let setup = parseSetup(properties.setup, mode, languageOf(properties));
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={setup} initialMode={mode} language={language} itemLanguage={languageOf(properties)}
        onChange={(next, nextMode) => { setup = next; mode = nextMode; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ mode, setup: serializeSetup(setup, mode) }),
      validate: () => authoringProblems(setup, mode, language),
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
    if (key === "mode" || key === "setup") {
      this.parseSettings();
      const s = this.store.getState();
      this.store.restoreState({ ...s, design: ownDesign(this.settings, s.design) }, []);
    }
    window.requestAnimationFrame(() => this.render());
  };

  private designRecord = (state: StateModel): QtiRecordItem[] => {
    const e = evaluateDesign(this.settings, state.design);
    const record: QtiRecordItem[] = [
      { name: "score", base: { integer: e.score } },
      { name: "maxscore", base: { integer: e.maxscore } },
      { name: "correct", base: { integer: e.correct ? 1 : 0 } },
    ];
    e.targets.slice(0, MAX_TARGETS).forEach((r, i) => {
      record.push({ name: `target${i + 1}`, base: { integer: r.passed ? 1 : 0 } });
      record.push({ name: `probability${i + 1}`, base: { string: formatRat(r.p) } });
      record.push({ name: `value${i + 1}`, base: { float: valueOf(r.p) } });
    });
    record.push({ name: "size", base: { integer: e.size } });
    if (e.sizePassed !== null) record.push({ name: "sizeCheck", base: { integer: e.sizePassed ? 1 : 0 } });
    record.push({ name: "trials", base: { integer: trialCount(state.experiment) } });
    record.push({ name: "design", base: { string: designJson(this.settings, state.design) } });
    return record;
  };

  private treeRecord = (state: StateModel): QtiRecordItem[] => {
    const e = evaluateTree(this.settings, state.tree);
    const record: QtiRecordItem[] = [
      { name: "score", base: { integer: e.score } },
      { name: "maxscore", base: { integer: e.maxscore } },
      { name: "correct", base: { integer: e.correct ? 1 : 0 } },
    ];
    e.branches.slice(0, 20).forEach((ok, i) => record.push({ name: `branch${i + 1}`, base: { integer: ok ? 1 : 0 } }));
    e.paths.slice(0, 16).forEach((ok, i) => record.push({ name: `path${i + 1}`, base: { integer: ok ? 1 : 0 } }));
    if (e.answer !== null) {
      record.push({ name: "answer", base: { string: normalizeEntry(state.tree.answer) } });
      if (e.answerValue !== null) record.push({ name: "answerValue", base: { float: e.answerValue } });
      record.push({ name: "answerCheck", base: { integer: e.answer ? 1 : 0 } });
    }
    record.push({ name: "trials", base: { integer: trialCount(state.experiment) } });
    record.push({ name: "tree", base: { string: treeJson(this.settings, state.tree) } });
    return record;
  };

  /**
   * Tool mode: the experiment log as a JSON string. Design mode: a record with the checks of the targets, the
   * probabilities of the design and the design. Tree mode: a record with a check per branch and path, the event's
   * answer and the tree (README). Nothing until the candidate did something.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const state = this.store.getState();
    if (this.mode === "tool") {
      return trialCount(state.experiment) ? { base: { string: experimentLog(this.settings, state.experiment) } } : undefined;
    }
    if (this.mode === "design") {
      return sameDesign(state.design, startDesign(this.settings)) ? undefined : { record: this.designRecord(state) };
    }
    return isEmptyTree(state.tree) ? undefined : { record: this.treeRecord(state) };
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response back: the experiment of a log, the `design` field, or the `tree` field; the rest follows from it. */
  setResponse = (response: QtiVariableJSON) => {
    const state = this.store.getState();
    const design = fieldOf(response, "design");
    const tree = fieldOf(response, "tree");
    if (typeof design === "string") {
      const d = readDesign(this.settings, design);
      if (d) return this.store.restoreState({ ...state, design: d }, []);
    }
    if (typeof tree === "string") {
      try {
        return this.store.restoreState({ ...state, tree: ownTree(JSON.parse(tree)) }, []);
      } catch {
        // not a tree
      }
    }
    const e = experimentFrom(response);
    if (e) return this.store.restoreState({ ...state, experiment: e }, []);
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
