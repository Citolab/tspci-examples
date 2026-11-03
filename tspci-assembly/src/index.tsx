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
import { Assembly, correctSequence, evaluate, ownSequence, parseAssembly, sequenceIn, serializeAssembly } from "./assembly";
import { languageOf, textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems: back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

const assemblyOf = (properties: Partial<PropTypes>) => parseAssembly(properties.assembly as string, String(properties.example ?? "cabinet"));

/** The blocked attempts in a record response, when there is a field for them. */
const blockedIn = (value: any): number => {
  const n = Array.isArray(value?.record) ? value.record.find((f: any) => f?.name === "blocked")?.base?.integer : undefined;
  return typeof n === "number" && n >= 0 ? Math.round(n) : 0;
};

/**
 * The response for a sequence of steps, as the author's scoring wants it: an ordered list of the part ids (list), the
 * ids as one string (string), or a record with the PCI's checks and score (pci).
 */
const responseOf = (a: Assembly, sequence: string[], blocked: number): QtiVariableJSON => {
  if (a.scoring === "list") return { list: { identifier: sequence } } as QtiVariableJSON;
  if (a.scoring === "string") return { base: { string: sequence.join(",") } };
  const e = evaluate(a, sequence);
  const record: QtiRecordItem[] = [
    { name: "score", base: { integer: e.score } },
    { name: "maxscore", base: { integer: e.maxscore } },
    { name: "correct", base: { integer: e.correct ? 1 : 0 } },
    { name: "valid", base: { integer: e.valid ? 1 : 0 } },
    { name: "complete", base: { integer: e.complete ? 1 : 0 } },
  ];
  if (e.first !== null) record.push({ name: "first", base: { integer: e.first ? 1 : 0 } });
  record.push(
    { name: "violations", base: { integer: e.violations } },
    { name: "blocked", base: { integer: blocked } },
    { name: "steps", base: { integer: e.steps } },
    { name: "order", base: { string: sequence.join(",") } },
  );
  return { record };
};

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "assembly";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  /** data-assembly: the product, the rules, the task, the feedback and the scoring; without it the example. */
  assembly: Assembly;

  private initialState: StateModel = { sequence: [], blocked: 0 };
  // The correct response the delivery engine handed us at getInstance time, or else the author's correct order.
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

    this.store = initStore(this.initialState);
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        if (Array.isArray(saved?.state?.sequence)) {
          const blocked = Math.max(0, Math.round(Number(saved.state.blocked) || 0));
          this.store.restoreState({ sequence: ownSequence(this.assembly.parts, saved.state.sequence), blocked }, saved.log ?? []);
        }
      } catch {
        // not a state of this PCI: start with every part loose
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && sequenceIn(response)?.length) {
        this.setResponse(response);
      }
    }

    // The item is in solution status and there is a correct response (from the engine, or the author's order):
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
   * Paints the correct response received at getInstance time (or the author's correct order). A delivery engine
   * calls this when it moves an already running interaction into review.
   */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  private correctResponseFromDeclaration = (
    declaration: ConfigProperties<PropTypes>["responseDeclaration"]
  ): QtiVariableJSON | null => {
    const value = (declaration?.correctResponse as any)?.value ?? declaration?.correctResponse;
    const sequence = sequenceIn(value);
    return sequence?.length ? responseOf(this.assembly, ownSequence(this.assembly.parts, sequence), 0) : null;
  };

  private solutionResponse = (): QtiVariableJSON | null => {
    const sequence = correctSequence(this.assembly);
    return sequence ? responseOf(this.assembly, sequence, 0) : null;
  };

  private parseSettings = () => {
    this.assembly = assemblyOf(this.config.properties);
  };

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    const language = languageOf(this.config.properties.language);
    render(
      <Interaction prompt={this.config.properties.prompt} assembly={this.assembly} store={this.store} texts={textsFor(language)} language={language}
        readOnly={this.config.status === "solution"} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author picks an example or makes parts, sets the order rules, the task, the feedback and the
   * scoring, and runs through a valid order; getProperties() gives data-assembly. Only an authoring system calls this.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    let assembly = assemblyOf(properties);
    const language = languageOf(config.language ?? "en"); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={assembly} language={language} candidateLanguage={languageOf(properties.language)}
        onChange={(next) => { assembly = next; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ assembly: serializeAssembly(assembly) }),
      validate: () => authoringProblems(assembly, language),
      oncompleted: () => render(null, host),
    };
    config.onready?.(instance);
    return instance;
  };

  /**
   * The correct response from the settings (AUTHORING.md): the author's order, or the first valid one, for list and
   * string scoring. With PCI scoring there is no response to compare (several orders can be right): none.
   */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const p = { ...defaults, ...normalize(properties as Record<string, string>) } as Partial<PropTypes>;
    const a = assemblyOf(p);
    if (a.scoring === "pci") return undefined;
    const sequence = correctSequence(a);
    return sequence ? responseOf(a, sequence, 0) : undefined;
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    window.requestAnimationFrame(() => this.render());
  };

  /**
   * Scoring pci: a record with score, maxscore, correct, valid, complete, first (with a first part set), violations,
   * blocked, steps and order. Scoring list: the part ids in the order of the steps (ordered identifier); string: the
   * same ids, comma separated. Nothing until the first step.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const { sequence, blocked } = this.store.getState();
    if (!sequence.length) return undefined;
    return responseOf(this.assembly, sequence, blocked);
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response (a list, a string, or a record with an order field) back as the candidate's steps. */
  setResponse = (response: QtiVariableJSON) => {
    const sequence = sequenceIn(response);
    if (!sequence) return;
    this.store.restoreState({ sequence: ownSequence(this.assembly.parts, sequence), blocked: blockedIn(response) }, []);
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
    render(null, this.shadowdom); // unmounts the 3D view: its WebGL context goes
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.store.getActions()
    });
}

export default new App();
