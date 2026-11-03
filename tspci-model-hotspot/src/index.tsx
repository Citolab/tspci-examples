import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import Authoring, { AuthoringConfig, authoringProblems } from "./authoring";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import {
  IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, IMSpciAuthoringFactory, PciAuthoringConfiguration,
  PciAuthoringInstance,
} from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore } from "./store";
import { Answer, BasePart, EMPTY_ANSWER, correctAnswer, nameOf, readAnswer, responseOf } from "./hotspot";
import { Resolved, resolve } from "./settings";
import type { ScenePart } from "./scene3d";
import { langOf, textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("maxchoices"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

/** An answer from a saved state, as it was (the parts of a glTF may only be known once the file is in). */
const savedAnswer = (value: any): Answer => ({
  selected: Array.isArray(value?.selected) ? value.selected.filter((x: unknown) => typeof x === "string") : [],
  placed: value?.placed && typeof value.placed === "object"
    ? Object.fromEntries(Object.entries(value.placed).filter(([, v]) => typeof v === "string")) as Record<string, string>
    : {},
});

let instances = 0;

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "modelHotspot";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  /** the model, the parts, the labels and the correct answer, from the settings */
  resolved: Resolved;
  /** a glTF without parts in the setup: the parts the file turned out to have */
  private found: BasePart[] | null = null;
  private idPrefix = `mh${++instances}`;

  private initialState: StateModel = { answer: EMPTY_ANSWER };
  // The correct response the delivery engine handed us at getInstance time, or else the one of the settings.
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

    this.store = initStore(this.initialState);
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        if (saved?.state?.answer) this.store.restoreState({ answer: savedAnswer(saved.state.answer) }, saved.log ?? []);
      } catch {
        // not a state of this PCI: start with nothing chosen
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
   * Paints the correct response received at getInstance time (or the one of the settings). A delivery engine
   * calls this when it moves an already running interaction into review.
   */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  private correctResponseFromDeclaration = (declaration: ConfigProperties<PropTypes>["responseDeclaration"]): QtiVariableJSON | null => {
    const value = (declaration as any)?.correctResponse?.value ?? (declaration as any)?.correctResponse;
    const answer = readAnswer(this.resolved.settings, value);
    return answer ? ((responseOf(this.resolved.settings, answer) as QtiVariableJSON) ?? null) : null;
  };

  private settingsResponse = (): QtiVariableJSON | null => (responseOf(this.resolved.settings, correctAnswer(this.resolved.settings)) as QtiVariableJSON) ?? null;

  private parseSettings = () => {
    this.resolved = resolve(this.config.properties as Record<string, unknown>, this.found);
  };

  /** A glTF loaded without parts in the setup: its named meshes are the parts. */
  private onParts = (parts: ScenePart[]) => {
    if (this.resolved.settings.parts.length || !parts.length) return;
    this.found = parts.map((p) => ({ id: p.id, name: { en: p.name, nl: "" } }));
    this.render();
  };

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    const p = this.config.properties;
    const lang = langOf(p.language);
    const r = this.resolved;
    const prompt = String(p.prompt ?? "").trim() || (r.model ? nameOf(r.model.prompt[r.settings.mode], lang) : "");
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={prompt} settings={r.settings} model={r.model} gltf={r.gltf} showNames={r.showNames} aids={r.aids} store={this.store}
        texts={textsFor(lang)} lang={lang} readOnly={this.config.status === "solution"} idPrefix={this.idPrefix} onParts={this.onParts} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the model, the mode, the parts and their names, the labels and the correct answer; getProperties()
   * gives the data- attributes. Only an authoring system calls this (AUTHORING.md, "Authoring mode"); delivery never does.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) } as unknown as Record<string, unknown>;
    const str = (key: keyof AuthoringConfig) => String(properties[key] ?? "");
    let current: AuthoringConfig = {
      model: str("model") || "eye", gltf: str("gltf"), mode: str("mode") || "click", cardinality: str("cardinality") || "single",
      maxChoices: str("maxChoices") || "0", showNames: str("showNames") || "false", setup: str("setup"),
    };
    let found: BasePart[] | null = null;
    let gltfMode = !!current.gltf.trim();
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={current} language={language} onChange={(next, parts, gltf) => { current = next; found = parts; gltfMode = gltf; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ ...current }),
      validate: () => authoringProblems(current, found, language, gltfMode),
      oncompleted: () => render(null, host),
    };
    config.onready?.(instance);
    return instance;
  };

  /**
   * The correct response that follows from the settings (config.tspci.correctResponse "settings"): the correct parts,
   * or every label on its part. Undefined when the settings have none (a glTF without parts in the setup).
   */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const p = { ...defaults, ...normalize(properties as Record<string, string>) } as unknown as Record<string, unknown>;
    const { settings } = resolve(p);
    return responseOf(settings, correctAnswer(settings)) as QtiVariableJSON | undefined;
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    window.requestAnimationFrame(() => this.render());
  };

  /**
   * Click mode: the chosen part ({ base: { identifier } }), or a list of them with more than one choice, in the order
   * of the parts. Label mode: a list of directed pairs [label, part], in the order of the labels. Nothing until the
   * candidate chose or placed something.
   */
  getResponse = (): QtiVariableJSON | undefined => responseOf(this.resolved.settings, this.store.getState().answer) as QtiVariableJSON | undefined;

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  setResponse = (response: QtiVariableJSON) => {
    const answer = readAnswer(this.resolved.settings, response);
    if (!answer) return;
    this.store.restoreState({ answer }, []);
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
