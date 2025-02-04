/* PCI with config and tailwind in shadowRoot */

import {
  ConfigProperties,
  IMSpci,
  QtiInteractionChangedDetail,
} from "@citolab/tspci"; // importing the interface for an IMSpci
import * as ctx from "qtiCustomInteractionContext"; // the qtiCustomInteractionContext will be dynamicly imported in the player environment
import style from "./assets/style.css"; // import and bundle this style file ( you can use tailwind and nested css )
import procenten from "./assets/procenten.png"; // image types are bundled inside the js
// Configuration
import configProps from "./config.json"; // configuration of pci is in simple key value(:string) pairs.
type PropTypes = typeof configProps; // typescript can dynamicly extract the type, for type safety in the rest of your typescript

// implement the lifecycle by implementing IMSpci and pass props as a generic
class App implements IMSpci<PropTypes> {
  typeIdentifier = "HelloWorld"; // typeIdentifier is mandatory for all PCI's
  config: ConfigProperties<PropTypes>; // reference to the interface of the config object which you get when getInstance is called by the player
  state: string; // keep a reference to the state
  shadowdom: ShadowRoot | Element; // Not mandatory, but its wise to create a shadowroot
  dom: HTMLElement;
  constructor() {
    ctx && ctx.register(this); // we assume the qtiCustomInteractionContext is avaible due to the import above
  }

  // First in the lifecycle of a PCI, this method is called with the domElement ( usually qti-interaction-markup ) where we can add our dom tree.
  // config is the configuration object which has an onready
  getInstance = (
    dom: HTMLElement,
    config: ConfigProperties<any>,
    state: string
  ) => {
    config.properties = { ...configProps, ...config.properties }; // merge current props with incoming
    this.config = config;
    this.state = state ? state : "";
    if (!dom) {
      throw new Error("No dom element found");
    }
    this.dom = dom;
    this.shadowdom = dom.attachShadow({ mode: "closed" });

    this.shadowdom.addEventListener("change", (e: Event) => {
      const value = (e.target as HTMLInputElement).value;
      this.state = value;
      this.interactionChanged();
    });

    this.render();

    config.onready(this);
  };

  private interactionChanged = () => {
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
    this.dom.dispatchEvent(interactionChangedEvent);
  };

  private render = () => {
    this.shadowdom.innerHTML = `<div>
    <h1>${this.config.properties.title}</h1>
    <label for="tentacles">${this.config.properties.question}</label>
    <img width="${+this.config.properties.width}" height="${+this.config
      .properties.height}" src="${procenten}" />
    <input type="number" value="${this.state}" min="0" max="100">%
    </div>`;
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
  };

  trigger = (event: string, value: any) => {
    this.config.properties[event] = value;
    this.render();
  };

  getResponse = () => {
    const response = {
      base: { string: this.state ? JSON.stringify(this.state) : undefined },
    };
    return this.state ? response : undefined;
  };

  getState = () => this.state.toString();
}

export default new App();
