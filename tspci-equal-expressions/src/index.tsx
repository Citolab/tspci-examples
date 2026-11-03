import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import { Interaction } from "./interaction";
import Authoring from "./authoring";
import style from "./style.css";
import configProps from "./config.json";
import { textsFor } from "./texts";
import { ImageChoice, chooseImage, imageFromMarkup } from "./images";
import { Actions, StateModel, initStore } from "./store";
import { IStore } from "@citolab/preact-store";
import { TAOpci } from "@citolab/tspci-tao";
import {
  ConfigProperties, IMSpci, IMSpciAuthoringFactory, PciAuthoringConfiguration, PciAuthoringInstance, PciProperties,
  QtiInteractionChangedDetail, QtiVariableJSON,
} from "@citolab/tspci";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("customimage"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "equalExpressions";

  store: IStore<StateModel, Actions>;
  config: ConfigProperties<PropTypes>;
  shadowdom: ShadowRoot;
  /** An <img> the item put in qti-interaction-markup; read before the shadow root hides it. */
  private markupImage: ImageChoice | null = null;
  private initialState: StateModel = { tries: [] };

  constructor() {
    ctx && ctx.register(this);
  }

  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string) => {
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    this.config = config;
    this.markupImage = imageFromMarkup(dom);

    this.store = initStore(this.initialState);
    if (stateString) {
      try {
        const saved = JSON.parse(stateString);
        if (Array.isArray(saved?.state?.tries)) this.store.restoreState({ tries: saved.state.tries }, saved.log ?? []);
      } catch {
        // not a state of this PCI: start empty
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    this.render();

    // A response the delivery system hands back (and no state with it): the tries are the response
    const bound = config.boundTo?.[config.responseIdentifier] ?? Object.values(config.boundTo ?? {})[0];
    if (!stateString && bound) this.setResponse(bound);

    // From here on, tell the delivery system when the interaction changes (not for what it handed us above)
    this.store.subscribe(() => {
      const detail: QtiInteractionChangedDetail = {
        interaction: this,
        responseIdentifier: this.config.responseIdentifier,
        valid: true,
        value: this.getResponse(),
      };
      dom.dispatchEvent(new CustomEvent("qti-interaction-changed", { detail }));
    }, { immediate: false });

    config.onready && config.onready(this);
    return this;
  };

  private get readOnly() {
    const status = this.config.status;
    return status === "review" || status === "solution" || status === "closed";
  }

  render = () => {
    const properties = this.config.properties;
    const t = textsFor(properties.language);
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction config={properties} store={this.store} t={t} readOnly={this.readOnly}
        image={chooseImage(properties, this.markupImage, t)} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author uploads an own image for the unknown number; getProperties() gives data-custom-image.
   * Only an authoring system calls this (AUTHORING.md, "Authoring mode"); delivery never does.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    let customImage = properties.customImage ?? "";
    const shadow = dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={customImage} expression={properties.expression1}
        language={language} t={textsFor(language)}
        onChange={(src) => { customImage = src; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ customImage }),
      validate: () => [],
      oncompleted: () => render(null, host),
    };
    config.onready?.(instance);
    return instance;
  };

  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    window.requestAnimationFrame(() => this.render());
  };

  // the store tells the interaction (and the delivery system) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** The tries, oldest first, as a list of numbers (`ordered` `float`). */
  setResponse = (response: QtiVariableJSON) => {
    const list = response?.list?.float ?? response?.list?.integer;
    const tries = (Array.isArray(list) ? list : []).map(Number).filter((n) => Number.isFinite(n));
    if (tries.length) this.store.restoreState({ tries }, []);
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  /** The numbers the candidate tried, oldest first; nothing until the first try. The full sequence is in the state. */
  getResponse = () => {
    const tries = this.store?.getState()?.tries ?? [];
    return tries.length ? { list: { float: tries } } : undefined;
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.store.getActions(),
    });
}

export default new App();
