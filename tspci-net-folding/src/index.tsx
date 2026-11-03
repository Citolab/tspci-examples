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
import { Actions, StateModel, emptyState, initStore } from "./store";
import {
  Face, Puzzle, buildSolution, cleanFaces, correctIds, evaluateBuild, faceId, mainNet, netId, pairIds, paletteFor, parsePairs, parsePuzzle,
  serializePuzzle, sortIds,
} from "./net";
import { languageOf, textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("showfold"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

const isTrue = (value: unknown) => String(value).toLowerCase() === "true";

/** The identifiers in a response, a correct response or a list of values. */
const identifiersIn = (value: any): string[] => {
  if (value === undefined || value === null) return [];
  if (typeof value === "string") return value.split(/[\s,]+/).filter(Boolean);
  if (Array.isArray(value)) return value.flatMap((v) => identifiersIn(typeof v === "object" && v !== null && "value" in v ? v.value : v));
  if (Array.isArray(value?.list?.identifier)) return value.list.identifier;
  if (typeof value?.base?.identifier === "string") return [value.base.identifier];
  if (value?.value !== undefined) return identifiersIn(value.value);
  return [];
};

/** The net in a build response (the net field of the record), a saved value or a correct response. */
const netIn = (value: any): Face[] | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    if (!value.trim().startsWith("[")) return null;
    try { return cleanFaces(JSON.parse(value)); } catch { return null; }
  }
  if (Array.isArray(value?.record)) return netIn(value.record.find((f: any) => f?.name === "net")?.base?.string);
  if (typeof value?.base?.string === "string") return netIn(value.base.string);
  if (typeof value?.net === "string") return netIn(value.net);
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = v?.fieldIdentifier === "net" || v?.name === "net" ? netIn(v.value ?? v.base?.string ?? v) : netIn(v);
      if (found) return found;
    }
  }
  return null;
};

const list = (ids: string[]): QtiVariableJSON => ({ list: { identifier: ids } } as QtiVariableJSON);

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "netFolding";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  /** data-puzzle: the task and the nets the author made; without it: build a net of a cube */
  puzzle: Puzzle;

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
  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App => new App(false).setup(dom, config, stateString);

  private setup = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App => {
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.puzzle = parsePuzzle(this.config.properties.puzzle);
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration) ?? this.solutionResponse();

    this.store = initStore(emptyState());
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        if (saved?.state) this.store.restoreState(this.ownState(saved.state), saved.log ?? []);
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

    // The item is in solution status and there is a correct response: show that on top of what was restored above.
    if (this.config.status === "solution" && this.correctResponse) this.showCorrectResponse();

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

  /** A saved state, without what does not belong to this puzzle. */
  private ownState = (raw: any): StateModel => {
    const p = this.puzzle;
    const faces = cleanFaces(raw?.faces, p.columns, p.rows).map(({ label: _, ...f }) => f);
    const ids = new Set([...mainNet(p).map((_, i) => faceId(i)), ...p.nets.map((_, i) => netId(i))]);
    const chosen = Array.isArray(raw?.chosen) ? sortIds(raw.chosen.filter((c: unknown) => typeof c === "string" && ids.has(c))) : [];
    const palette = paletteFor(p);
    const labels: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw?.labels ?? {})) if (p.blanks.includes(k) && palette.includes(String(v))) labels[k] = String(v);
    return { faces, chosen, labels };
  };

  /** Paints the correct response received at getInstance time (or the one from the settings). */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  private correctResponseFromDeclaration = (declaration: ConfigProperties<PropTypes>["responseDeclaration"]): QtiVariableJSON | null => {
    const value = declaration?.correctResponse?.value ?? declaration?.correctResponse;
    if (value === undefined || value === null) return null;
    if (this.puzzle.mode === "build") {
      const net = netIn(value);
      return net ? this.buildResponse(net) : null;
    }
    const ids = identifiersIn(value);
    return ids.length ? list(ids) : null;
  };

  private solutionResponse = (): QtiVariableJSON | null => {
    if (this.puzzle.mode === "build") return this.buildResponse(buildSolution(this.puzzle));
    const ids = correctIds(this.puzzle);
    return ids ? list(ids) : null;
  };

  render = () => {
    this.puzzle = parsePuzzle(this.config.properties.puzzle); // trigger() may have changed it
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    const language = languageOf(this.config.properties.language);
    render(
      <Interaction puzzle={this.puzzle} store={this.store} t={textsFor(language)} language={language} prompt={this.config.properties.prompt}
        showFold={isTrue(this.config.properties.showFold)} showResult={isTrue(this.config.properties.showResult)}
        readOnly={this.config.status === "solution" || this.config.status === "review"} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author chooses the question type and the solid, draws the net(s), labels the faces and
   * sets what the answer follows from; getProperties() gives data-puzzle. Only an authoring system calls this.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    let puzzle = parsePuzzle(properties.puzzle);
    const language = languageOf(config.language ?? "en"); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(<Authoring initial={puzzle} language={language} onChange={(next) => { puzzle = next; config.onchange?.(); }} />, host);
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ puzzle: serializePuzzle(puzzle) }),
      validate: () => authoringProblems(puzzle, language),
      oncompleted: () => render(null, host),
    };
    config.onready?.(instance);
    return instance;
  };

  /** The correct response from the settings: what getResponse() reports for the answer (not in build mode). */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const p = { ...defaults, ...normalize(properties as Record<string, string>) } as unknown as Record<string, string>;
    const ids = correctIds(parsePuzzle(p.puzzle));
    return ids ? list(ids) : undefined;
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    window.requestAnimationFrame(() => this.render());
  };

  /** The record of the build mode: score, maxscore, correct, closed, overlap, gaps, faces and the net as JSON. */
  private buildResponse = (faces: Face[]): QtiVariableJSON => {
    const e = evaluateBuild(this.puzzle, faces);
    const record: QtiRecordItem[] = [
      { name: "score", base: { integer: e.score } },
      { name: "maxscore", base: { integer: e.maxscore } },
      { name: "correct", base: { integer: e.correct ? 1 : 0 } },
      { name: "closed", base: { integer: e.closed ? 1 : 0 } },
      { name: "overlap", base: { integer: e.overlap ? 1 : 0 } },
      { name: "gaps", base: { integer: e.gaps } },
      { name: "faces", base: { integer: e.faces } },
      { name: "net", base: { string: e.net } },
    ];
    return { record };
  };

  /**
   * Build mode: the record. The other modes: a list of identifiers (faces f1 …, nets n1 …, or face-label pairs
   * f2-A), sorted. Nothing until the candidate did something.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const s = this.store.getState();
    const p = this.puzzle;
    if (p.mode === "build") return s.faces.length ? this.buildResponse(s.faces) : undefined;
    const ids = p.mode === "complete" ? pairIds(s.labels) : sortIds(s.chosen);
    return ids.length ? list(ids) : undefined;
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response back in the interaction: the net of a build record, or the identifiers. */
  setResponse = (response: QtiVariableJSON) => {
    const p = this.puzzle;
    const state = this.store.getState();
    if (p.mode === "build") {
      const faces = netIn(response);
      if (faces) this.store.restoreState(this.ownState({ ...state, faces }), []);
      return;
    }
    const ids = identifiersIn(response);
    const next = p.mode === "complete" ? { ...state, labels: parsePairs(ids) } : { ...state, chosen: p.mode === "opposite" ? ids.slice(0, 1) : ids };
    this.store.restoreState(this.ownState(next), []);
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
    render(null, this.shadowdom); // frees the WebGL context
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.store.getActions(),
    });
}

export default new App();
