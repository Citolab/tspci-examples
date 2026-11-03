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
  EMPTY, MAX_ATOMS, formulaOrderOf, MAX_CHECKS, Molecule, Settings, canonicalKey, canonicalSmiles, evaluate, hillFormula, parseMolecule, parseSettings, parseSmiles,
  serializeMolecule, serializeSettings, solutionOf,
} from "./molecule";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("showformula"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

const isTrue = (value: unknown) => String(value).toLowerCase() !== "false";
const pciScoring = (properties: Partial<PropTypes>) => String(properties.scoring ?? "").toLowerCase() === "pci";
const maxAtomsOf = (value: unknown) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 2 ? Math.min(MAX_ATOMS, n) : 24;
};

/**
 * The molecule in a response, a correct response or a saved value: a record (its molecule field, else its smiles
 * field), "formula:SMILES", a SMILES, or a molecule as JSON.
 */
const moleculeIn = (value: any): Molecule | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    return text.startsWith("{") ? parseMolecule(text) : parseSmiles(text);
  }
  if (Array.isArray(value?.record)) {
    const get = (name: string) => value.record.find((f: any) => f?.name === name)?.base?.string;
    return moleculeIn(get("molecule")) ?? moleculeIn(get("smiles"));
  }
  if (typeof value?.base?.string === "string") return moleculeIn(value.base.string);
  if (Array.isArray(value)) {
    // a record value from a declaration: [{ fieldIdentifier, value }]; or a list with one value
    const byField = (name: string) => value.find((v: any) => v?.fieldIdentifier === name || v?.name === name);
    const f = byField("molecule") ?? byField("smiles");
    if (f) return moleculeIn(f.value ?? f.base?.string);
    for (const v of value) {
      const found = moleculeIn(v);
      if (found) return found;
    }
  }
  if (typeof value?.molecule === "string") return moleculeIn(value.molecule);
  if (typeof value?.smiles === "string") return moleculeIn(value.smiles);
  return null;
};

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "moleculeBuilder";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  /** data-molecule: the palette, the correct molecule and the checks; without it the example (water). */
  settings: Settings;

  private initialState: StateModel = { molecule: EMPTY };
  // The correct response the delivery engine handed us at getInstance time, or else the author's molecule.
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
    this.settings = parseSettings(this.config.properties.molecule);
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration) ?? this.solutionResponse();

    this.store = initStore(this.initialState);
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        const molecule = parseMolecule(saved?.state?.molecule);
        if (molecule) this.store.restoreState({ molecule }, saved.log ?? []);
      } catch {
        // not a state of this PCI: start without atoms
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && moleculeIn(response)) {
        this.setResponse(response);
      }
    }

    // The item is in solution status and there is a correct response (from the engine, or the author's molecule):
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
   * Paints the correct response received at getInstance time (or the author's molecule). A delivery engine calls
   * this when it moves an already running interaction into review.
   */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  private correctResponseFromDeclaration = (
    declaration: ConfigProperties<PropTypes>["responseDeclaration"]
  ): QtiVariableJSON | null => {
    const molecule = moleculeIn(declaration?.correctResponse?.value ?? declaration?.correctResponse);
    return molecule ? this.responseFor(molecule) : null;
  };

  private solutionResponse = (): QtiVariableJSON | null => {
    const solution = solutionOf(this.settings);
    return solution ? this.responseFor(solution) : null;
  };

  /**
   * Not QTI: for an authoring system (config.tspci.correctResponse "settings"). With the item scoring
   * (MATCH_CORRECT): "formula:SMILES" of the author's molecule. With PCI scoring there is nothing to compare: none.
   */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const props = { ...defaults, ...normalize(properties as Record<string, string>) };
    if (pciScoring(props)) return undefined;
    const solution = solutionOf(parseSettings(props.molecule));
    return solution ? { base: { string: canonicalKey(solution) } } : undefined;
  };

  render = () => {
    const p = this.config.properties;
    this.settings = parseSettings(p.molecule); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={p.prompt} store={this.store} texts={textsFor(p.language)} elements={this.settings.elements}
        showFormula={isTrue(p.showFormula)} showValence={isTrue(p.showValence)} view={String(p.view).toLowerCase() === "2d" ? "2d" : "3d"}
        maxAtoms={maxAtomsOf(p.maxAtoms)} formulaOrder={formulaOrderOf(p.formulaOrder)} readOnly={this.config.status === "solution"} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author builds the correct molecule, picks the palette and the checks; getProperties() gives
   * data-molecule. Only an authoring system calls this (AUTHORING.md, "Authoring mode").
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    let settings = parseSettings(properties.molecule);
    const scoring = pciScoring(properties) ? "pci" : "match";
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={settings} language={language} scoring={scoring} formulaOrder={formulaOrderOf(properties.formulaOrder)} onChange={(next) => { settings = next; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ molecule: serializeSettings(settings) }),
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

  /** The response for a molecule: "formula:SMILES", or with PCI scoring the record with the checks. */
  private responseFor = (molecule: Molecule): QtiVariableJSON => {
    if (!pciScoring(this.config.properties)) return { base: { string: canonicalKey(molecule) } };
    const e = evaluate(this.settings, molecule);
    const record: QtiRecordItem[] = [
      { name: "score", base: { integer: e.score } },
      { name: "maxscore", base: { integer: e.maxscore } },
      { name: "correct", base: { integer: e.correct ? 1 : 0 } },
    ];
    for (let i = 0; i < MAX_CHECKS; i++) {
      const r = e.results[i];
      if (r) record.push({ name: `check${i + 1}`, base: { integer: r.passed ? 1 : 0 } });
    }
    record.push({ name: "formula", base: { string: hillFormula(molecule) } });
    record.push({ name: "smiles", base: { string: canonicalSmiles(molecule) } });
    record.push({ name: "molecule", base: { string: serializeMolecule(molecule) } });
    return { record };
  };

  /**
   * "formula:SMILES" (the Hill formula and the canonical SMILES: the same however the molecule was drawn), or with
   * data-scoring="pci" a record: score, maxscore, correct, check1 …, formula, smiles and the molecule as JSON.
   * Nothing while there are no atoms.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const { molecule } = this.store.getState();
    if (!molecule.atoms.length) return undefined;
    return this.responseFor(molecule);
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response back in the builder: the molecule field of a record, else its SMILES; or "formula:SMILES". */
  setResponse = (response: QtiVariableJSON) => {
    const molecule = moleculeIn(response);
    if (!molecule) {
      console.error(`couldn't restore the response: ${JSON.stringify(response)}`);
      return;
    }
    this.store.restoreState({ molecule }, []);
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
    render(null, this.shadowdom); // unmounts the 3D model: frees its WebGL context
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.store.getActions()
    });
}

export default new App();
