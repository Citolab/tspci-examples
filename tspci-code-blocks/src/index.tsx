// SPDX-License-Identifier: MIT
// Based on https://github.com/rdncuee/CBP (Code Block Programming Interaction),
// © 2022 The National Center for University Entrance Examinations
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import {
  IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, QtiRecordItem, IMSpciAuthoringFactory,
  PciAuthoringConfiguration, PciAuthoringInstance,
} from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore } from "./store";
import {
  type CodeState, type Node, type Settings, MAX_TESTS, evaluateTests, initialState, parseSettings, programFromCode, programFromResponse,
  programText, responseOf, runProgram, sameState, solutionState, validState,
} from "./blocks";
import { authorTextsFor, textsFor } from "./texts";
import Authoring, { problemText } from "./authoring";
import { type AuthorModel, MANAGED, authorProblems, modelFromSettings, serialize } from "./author";
// config.json carries editor hints for authoring systems; the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("editinputs"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

/** The text in a response or a correct response: the program field of a record, else a single string. */
const responseText = (value: any): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value?.record)) {
    const field = (name: string) => value.record.find((f: any) => f?.name === name)?.base?.string;
    return field("program") ?? field("code") ?? null;
  }
  if (typeof value?.base?.string === "string") return value.base.string;
  if (Array.isArray(value)) {
    // a record value from a declaration: [{ fieldIdentifier, value }]; or a list with one value
    const byField = (name: string) => value.find((v: any) => v?.fieldIdentifier === name || v?.name === name);
    const f = byField("program") ?? byField("code");
    if (f) return responseText(f.value ?? f.base?.string);
    for (const v of value) {
      const found = responseText(v);
      if (found) return found;
    }
  }
  return null;
};

/** The work in a response: the original's JSON, or the program as code; null when there is none. */
const stateFromResponse = (value: unknown, s: Settings): CodeState | null => {
  const text = responseText(value)?.trim();
  if (!text) return null;
  let program: Node[] | null = null;
  let result: string[] | null = null;
  if (text.startsWith("{")) {
    try {
      const json = JSON.parse(text);
      program = programFromResponse(s, json);
      if (Array.isArray(json?.result) && json.result.length) result = json.result.map(String);
    } catch {
      return null;
    }
  } else program = programFromCode(s, text);
  if (!program) return null;
  return validState({ program, inputs: s.inputs, run: result ? { inputs: s.inputs, output: result } : null }, s);
};

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "codeBlocks";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  settings: Settings;

  private initialState: StateModel;
  // The correct response the delivery engine handed us at getInstance time, or else the author's solution.
  // See https://github.com/1EdTech/qti-project-management/issues/210
  private correctState: CodeState | null = null;

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
    this.settings = parseSettings(this.config.properties as Record<string, unknown>);
    if (this.settings.problems.length) console.warn("codeBlocks: settings not understood", this.settings.problems);
    const declared = config.responseDeclaration?.correctResponse;
    this.correctState = stateFromResponse((declared as any)?.value ?? declared, this.settings) ?? solutionState(this.settings);

    this.initialState = initialState(this.settings);
    this.store = initStore(this.initialState, () => this.settings);
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        const state = validState(saved?.state, this.settings);
        if (state) this.store.restoreState(state, saved.log ?? []);
      } catch {
        // not a state of this PCI: start with the author's starting program
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && stateFromResponse(response, this.settings)) {
        this.setResponse(response);
      }
    }

    // The item is in solution status: show the correct response (the engine's, or the author's solution)
    if (this.config.status === "solution" && this.correctState) {
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

  /** Paints the correct response, with the output of a run with the author's input. */
  showCorrectResponse = () => {
    if (!this.correctState) return;
    const state = this.correctState;
    const run = state.run ?? { inputs: this.settings.inputs, ...runProgram(this.settings, state.program, this.settings.inputs) };
    this.store.dispatch({ type: "RESTORE", payload: { ...state, run } });
  };

  render = () => {
    this.settings = parseSettings(this.config.properties as Record<string, unknown>); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    const status = this.config.status;
    render(
      <Interaction s={this.settings} store={this.store} texts={textsFor(this.settings.language)}
        readOnly={status === "review" || status === "solution" || status === "closed"} />,
      this.shadowdom
    );
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    window.requestAnimationFrame(() => this.render());
  };

  /** The response for a state: the original's JSON, the program as code, or with PCI scoring a record. */
  private responseFor = (state: CodeState): QtiVariableJSON => {
    const s = this.settings;
    if (s.scoring === "code") return { base: { string: programText(s, state.program) } };
    const original = JSON.stringify(responseOf(s, state));
    if (s.scoring !== "pci") return { base: { string: original } };
    const e = evaluateTests(s, state.program);
    const record: QtiRecordItem[] = [
      { name: "score", base: { integer: e.score } },
      { name: "maxscore", base: { integer: e.maxscore } },
      { name: "correct", base: { integer: e.correct ? 1 : 0 } },
    ];
    for (let i = 0; i < MAX_TESTS; i++) {
      const r = e.results[i];
      if (r) record.push({ name: `test${i + 1}`, base: { integer: r.passed ? 1 : 0 } });
    }
    record.push({ name: "code", base: { string: programText(s, state.program) } });
    record.push({ name: "program", base: { string: original } });
    return { record };
  };

  /** README: nothing until the candidate changed something (the program, the input) or ran the program. */
  getResponse = (): QtiVariableJSON | undefined => {
    const state = this.store.getState();
    if (sameState(state, this.initialState)) return undefined;
    return this.responseFor(state);
  };

  /**
   * Authoring mode (the original's creator): the author edits the blocks, builds the solution and the starting program,
   * and writes the input and the test cases. getProperties() gives the text settings blocks, program, solution, inputs
   * and tests (config.json: editor "pci"); unchanged, the item keeps its own text. Only an authoring system calls this.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) } as Record<string, unknown>;
    const base = parseSettings(properties);
    const initial = modelFromSettings(base);
    let model: AuthorModel = initial;
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(<Authoring initial={initial} base={base} language={language} onChange={(next) => { model = next; config.onchange?.(); }} />, host);
    const unchanged = JSON.stringify(serialize(initial, base));
    const own = Object.fromEntries(MANAGED.map((key) => [key, String(properties[key] ?? "")]));
    const instance: PciAuthoringInstance = {
      getProperties: () => {
        const written = serialize(model, base);
        return JSON.stringify(written) === unchanged ? own : written;
      },
      validate: () => authorProblems(model, base).filter((p) => p.level === "error").map((p) => problemText(authorTextsFor(language), language, p, model)),
      oncompleted: () => render(null, host),
    };
    config.onready?.(instance);
    return instance;
  };

  /** Not QTI: for an authoring system. With data-scoring="code": the author's solution as code. */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const settings = parseSettings({ ...defaults, ...normalize(properties as Record<string, string>) });
    if (settings.scoring !== "code" || !settings.solution) return undefined;
    return { base: { string: programText(settings, settings.solution) } };
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response back in the PCI: the program (and the output of the original's result). */
  setResponse = (response: QtiVariableJSON) => {
    const state = stateFromResponse(response, this.settings);
    if (!state) {
      console.error("couldn't restore the response", response);
      return;
    }
    this.store.dispatch({ type: "RESTORE", payload: state });
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.store.getActions()
    });

  /** The test cases as the PCI sees them now, for tests and for a rater. */
  evaluation = () => evaluateTests(this.settings, this.store.getState().program);
}

export default new App();
