import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import Authoring from "./authoring";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import { IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, IMSpciAuthoringFactory, PciAuthoringConfiguration, PciAuthoringInstance, QtiRecordItem } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, INITIAL_STATE, StateModel, initStore } from "./store";
import { AppletSettings, AppletSource, AppletValues, EMPTY_VALUES, GgbApi, listen, materialIdFrom, parseSettings, readValues } from "./ggb";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("ggbbase64"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

/** Where the item's applet starts: the author's applet, a geogebra.org material, or an empty app. */
const itemSource = (p: Record<string, string>): AppletSource => {
  const base64 = (p.ggbBase64 ?? "").trim();
  if (base64) return { ggbBase64: base64 };
  const id = materialIdFrom(p.materialId);
  return id ? { materialId: id } : null;
};

const isTrue = (value: unknown) => value === true || value === "true";

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "geogebraApplet";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  settings: AppletSettings;
  /** Where the applet starts from; a new one starts a new applet. */
  source: AppletSource;

  /** The running applet; null while it loads, after a failure and after oncompleted. */
  private api: GgbApi | null = null;
  private stopListening = () => { };

  constructor() {
    if (ctx) {
      ctx.register(this);
    }
  }

  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string) => {
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.settings = parseSettings(this.properties(), this.properties().language);

    // The candidate's applet from the state (getState), else from a response the engine hands us, else the item's
    let state: StateModel = INITIAL_STATE;
    if (stateString) {
      try {
        const saved = JSON.parse(stateString);
        if (typeof saved?.applet === "string" && saved.applet) {
          state = { applet: saved.applet, values: { ...EMPTY_VALUES, ...(saved.values ?? {}) } };
        }
      } catch {
        // not a state of this PCI: start with the item's applet
      }
    }
    if (!state.applet && config.boundTo && Object.keys(config.boundTo).length > 0) {
      const response = config.boundTo[Object.keys(config.boundTo)[0]];
      const fromResponse = this.fromRecord(response);
      if (fromResponse) state = fromResponse;
    }
    this.store = initStore(state);
    this.source = state.applet ? { ggbBase64: state.applet } : itemSource(this.properties());

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    this.render();

    // From here on, tell the Delivery System when the applet changes (debounced in ggb.ts listen)
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

  private properties = () => this.config.properties as unknown as Record<string, string>;

  /** The applet is loaded: listen to it. */
  private ready = (api: GgbApi) => {
    this.api = api;
    this.stopListening();
    this.stopListening = listen(api, () => {
      if (this.api !== api) return;
      this.store.dispatch({ type: "CHANGED", payload: { values: readValues(api), applet: this.base64() } });
    });
  };

  private gone = () => {
    this.stopListening();
    this.stopListening = () => { };
    this.api = null;
  };

  /** The applet as it is now (base64 .ggb), or the last one saved. */
  private base64 = (): string | null => {
    if (this.api) {
      try {
        return this.api.getBase64();
      } catch {
        // fall back to the last saved one
      }
    }
    return this.store.getState().applet;
  };

  private values = (): AppletValues => {
    if (this.api) {
      try {
        return readValues(this.api);
      } catch {
        // fall back to the last saved ones
      }
    }
    return this.store.getState().values;
  };

  render = () => {
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction settings={this.settings} source={this.source} texts={textsFor(this.properties().language)}
        onReady={this.ready} onGone={this.gone} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author loads a material or starts empty and builds the applet; getProperties() gives
   * data-ggb-base64. Only an authoring system calls this (AUTHORING.md, "Authoring mode"); delivery never does.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) } as unknown as Record<string, string>;
    const language = (config.language ?? properties.language ?? "en").slice(0, 2);
    const texts = textsFor(language);
    let api: GgbApi | null = null;
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={itemSource(properties)} initialMaterialId={properties.materialId ?? ""}
        settings={parseSettings(properties, language)} language={language}
        onApi={(next) => { api = next; config.onchange?.(); }} onChange={() => config.onchange?.()} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => {
        if (!api) return {};
        try {
          return { ggbBase64: api.getBase64() };
        } catch {
          return {};
        }
      },
      validate: () => (api ? [] : [texts.notReady]),
      oncompleted: () => render(null, host),
    };
    config.onready?.(instance);
    return instance;
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  /** A setting changed (TAO's properties form): a new applet, from the candidate's work unless the source changed. */
  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    this.settings = parseSettings(this.properties(), this.properties().language);
    const current = key === "ggbBase64" || key === "materialId" ? null : this.base64();
    this.source = current ? { ggbBase64: current } : itemSource(this.properties());
    this.render();
  };

  /**
   * A record: correct, candidateResponse, score and maxscore from the applet's objects correct, answer, score and
   * maxscore (null when the applet has no such object), and the applet itself with data-save-applet.
   */
  getResponse = (): QtiVariableJSON => {
    const v = this.values();
    const record: QtiRecordItem[] = [
      { name: "correct", base: v.correct === null ? null : { integer: v.correct } },
      { name: "candidateResponse", base: v.candidateResponse === null ? null : { string: v.candidateResponse } },
      { name: "score", base: v.score === null ? null : { integer: v.score } },
      { name: "maxscore", base: v.maxscore === null ? null : { integer: v.maxscore } },
    ];
    if (isTrue(this.properties().saveApplet)) {
      const applet = this.base64();
      record.push({ name: "applet", base: applet ? { string: applet } : null });
    }
    return { record };
  };

  /** A state from a record response: its values, and the applet when the response has one. */
  private fromRecord = (response: QtiVariableJSON): StateModel | null => {
    const entries = response?.record;
    if (!entries?.length) return null;
    const field = (name: string) => entries.find((e) => e.name === name)?.base ?? null;
    const int = (name: string) => {
      const b = field(name);
      const n = Number(b?.integer ?? b?.string);
      return b && Number.isFinite(n) ? n : null;
    };
    const str = (name: string) => {
      const b = field(name);
      return b?.string === undefined || b?.string === null ? null : String(b.string);
    };
    return {
      values: { correct: int("correct"), candidateResponse: str("candidateResponse"), score: int("score"), maxscore: int("maxscore") },
      applet: str("applet"),
    };
  };

  /** Starts the item's applet again; the candidate's work is gone. */
  resetResponse = () => {
    this.gone(); // the event below reads the response: not from the applet that is about to go
    this.store.dispatch({ type: "CHANGED", payload: { values: EMPTY_VALUES, applet: null } });
    this.source = itemSource(this.properties());
    this.render();
  };

  /** Only a response with the applet in it can be shown again; a response without one keeps the applet as it is. */
  setResponse = (response: QtiVariableJSON) => {
    const state = this.fromRecord(response);
    if (!state?.applet) return;
    this.gone();
    this.store.dispatch({ type: "CHANGED", payload: state });
    this.source = { ggbBase64: state.applet };
    this.render();
  };

  oncompleted = () => {
    // keep the last applet in the state, then let go of GeoGebra
    const applet = this.base64();
    if (applet) this.store.restoreState({ values: this.values(), applet }, []);
    this.store.unsubscribeAll();
    render(null, this.shadowdom);
  };

  /** The candidate's applet (base64 .ggb) and what it reported; always with the applet, so it can be restored. */
  getState = () => JSON.stringify({ applet: this.base64(), values: this.values() });
}

export default new App();
