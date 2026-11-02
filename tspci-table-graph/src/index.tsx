import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import { Interaction } from "./interaction";
import style from "./style.css";
import configProps from "./config.json";
import { textsFor } from "./texts";
import { parseNumber } from "./expression";
import { Actions, StateModel, initStore } from "./store";
import { IStore } from "@citolab/preact-store";
import { TAOpci } from "@citolab/tspci-tao";
import { ConfigProperties, IMSpci, PciProperties, QtiInteractionChangedDetail, QtiVariableJSON } from "@citolab/tspci";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("startvalues"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

/** data-start-values: "30, 40, 50", or with semicolons for decimal commas ("2,5; 7,5"); each value once. */
const startValues = (text: string): number[] =>
  (text ?? "")
    .split((text ?? "").includes(";") ? ";" : /[,\s]+/)
    .filter((part) => part.trim())
    .map(parseNumber)
    .filter((n, i, all) => !Number.isNaN(n) && all.indexOf(n) === i);

class App implements IMSpci<PropTypes>, TAOpci {
  typeIdentifier = "tableGraph";

  store: IStore<StateModel, Actions>;
  config: ConfigProperties<PropTypes>;
  shadowdom: ShadowRoot;

  constructor() {
    ctx && ctx.register(this);
  }

  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string) => {
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    this.config = config;

    this.store = initStore({ values: startValues(config.properties.startValues) });
    if (stateString) {
      try {
        const saved = JSON.parse(stateString);
        if (Array.isArray(saved?.state?.values)) this.store.restoreState({ values: saved.state.values }, saved.log ?? []);
      } catch {
        // not a state of this PCI: start with the start values
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    this.render();

    // A response the delivery system hands back (and no state with it): the values are the response
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
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(<Interaction config={properties} store={this.store} t={textsFor(properties.language)} readOnly={this.readOnly} />, this.shadowdom);
  };

  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    // the author changes the start values: show them, as long as the table is untouched
    if (key === "startValues" && this.store.getActions().length === 0) {
      this.store.restoreState({ values: startValues(String(value)) }, []);
    }
    window.requestAnimationFrame(() => this.render());
  };

  // back to the start values; the store tells the interaction (and the delivery system)
  resetResponse = () => {
    this.store.restoreState({ values: startValues(this.config.properties.startValues) }, []);
  };

  /** The values in the table, oldest first, as a list of numbers (`ordered` `float`). */
  setResponse = (response: QtiVariableJSON) => {
    const list = response?.list?.float ?? response?.list?.integer;
    if (!Array.isArray(list)) return;
    this.store.restoreState({ values: list.map(Number).filter((n) => Number.isFinite(n)) }, []);
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  /** The values in the table, oldest first; nothing until the candidate adds or removes one. */
  getResponse = () => {
    if (!this.store || this.store.getActions().length === 0) return undefined;
    return { list: { float: this.store.getState().values } };
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
