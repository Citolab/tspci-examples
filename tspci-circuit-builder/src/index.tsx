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
  Circuit, MAX_CHECKS, Placed, boardOf, brokenCells, brokenFromBoard, evaluate, ownParts, parseCircuit, sameParts, serializeBoard, serializeCircuit,
  startParts,
} from "./circuit";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("showopenends"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

const isTrue = (value: unknown) => String(value).toLowerCase() === "true";

/** The board in a response, a correct response or a saved value: the board field of a record, or a string. */
const boardText = (value: any): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value.trim().startsWith("{") ? value : null;
  if (Array.isArray(value?.record)) return boardText(value.record.find((f: any) => f?.name === "board")?.base?.string);
  if (typeof value?.base?.string === "string") return boardText(value.base.string);
  // a correct response from a declaration: { board: "…" }, or values with a field identifier
  if (typeof value?.board === "string") return value.board;
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = v?.fieldIdentifier === "board" || v?.name === "board" ? boardText(v.value ?? v.base?.string ?? v) : boardText(v);
      if (found) return found;
    }
  }
  return null;
};

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "circuitBuilder";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  /** data-circuit: the board, palette, solution and checks the author made; without it the example. */
  circuit: Circuit;

  private initialState: StateModel = { parts: [] };
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
  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App => {
    const instance = new App(false);
    return instance.setup(dom, config, stateString);
  };

  private setup = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App => {
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.parseSettings();
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration) ?? this.solutionResponse();

    this.initialState = { parts: startParts(this.circuit) };
    this.store = initStore(this.initialState);
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        if (Array.isArray(saved?.state?.parts)) {
          const broken = Array.isArray(saved.state.broken) ? saved.state.broken.filter((k: unknown) => typeof k === "string") : [];
          this.store.restoreState({ parts: ownParts(this.circuit, saved.state.parts), ...(broken.length ? { broken } : {}) }, saved.log ?? []);
        }
      } catch {
        // not a state of this PCI: start with the board as the author made it
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && boardText(response)) {
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
   * Paints the correct response received at getInstance time (or the author's solution). A delivery engine
   * calls this when it moves an already running interaction into review.
   */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  private correctResponseFromDeclaration = (
    declaration: ConfigProperties<PropTypes>["responseDeclaration"]
  ): QtiVariableJSON | null => {
    const board = boardText(declaration?.correctResponse?.value ?? declaration?.correctResponse);
    if (!board) return null;
    const parsed = JSON.parse(board);
    return this.responseFor(ownParts(this.circuit, parsed), brokenFromBoard(parsed));
  };

  private solutionResponse = (): QtiVariableJSON | null => (this.circuit.solution ? this.responseFor(this.circuit.solution) : null);

  private parseSettings = () => {
    this.circuit = parseCircuit(this.config.properties.circuit);
  };

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={this.config.properties.prompt} circuit={this.circuit} store={this.store} texts={textsFor(this.config.properties.language)}
        showOpenEnds={isTrue(this.config.properties.showOpenEnds)} showCurrent={isTrue(this.config.properties.showCurrent)}
        lampTool={isTrue(this.config.properties.lampTool)}
        readOnly={this.config.status === "solution"} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author builds the board (locked parts), the solution, the palette and the checks;
   * getProperties() gives data-circuit. Only an authoring system calls this (AUTHORING.md, "Authoring mode").
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    let circuit = parseCircuit(properties.circuit);
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={circuit} language={language} onChange={(next) => { circuit = next; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ circuit: serializeCircuit(circuit) }),
      validate: () => authoringProblems(circuit, language),
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

  /** The record for a board: the checks' results and score, the topology and the board itself (with the broken lamps). */
  private responseFor = (parts: Placed[], broken: string[] = []): QtiVariableJSON => {
    const e = evaluate(this.circuit, parts, broken);
    const record: QtiRecordItem[] = [
      { name: "score", base: { integer: e.score } },
      { name: "maxscore", base: { integer: e.maxscore } },
      { name: "correct", base: { integer: e.correct ? 1 : 0 } },
    ];
    for (let i = 0; i < MAX_CHECKS; i++) {
      const r = e.results[i];
      if (r) record.push({ name: `check${i + 1}`, base: { integer: r.passed ? 1 : 0 } });
    }
    record.push({ name: "topology", base: { string: e.topology } });
    record.push({ name: "board", base: { string: serializeBoard(this.circuit, parts, broken) } });
    return { record };
  };

  /**
   * A record: score and maxscore (the points of the passed and of all checks), correct (every check passed),
   * check1 … (1 or 0 per check), the topology and the board as JSON (broken lamps marked "broken": true). Nothing until
   * the candidate changed the board or broke a lamp.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const { parts, broken = [] } = this.store.getState();
    const out = [...brokenCells(boardOf(this.circuit, parts), broken)];
    if (sameParts(parts, startParts(this.circuit)) && !out.length) return undefined;
    return this.responseFor(parts, out);
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response (or a board as a string) back on the board: only its board counts, the rest follows from it. */
  setResponse = (response: QtiVariableJSON) => {
    const text = boardText(response);
    if (!text) return;
    try {
      const board = JSON.parse(text);
      const broken = brokenFromBoard(board);
      this.store.restoreState({ parts: ownParts(this.circuit, board), ...(broken.length ? { broken } : {}) }, []);
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
