/* PCI with config and tailwind in shadowRoot */

import {
  ConfigProperties,
  IMSpci,
  PciProperties,
  QtiInteractionChangedDetail,
} from "@citolab/tspci"; // importing the interface for an IMSpci
import * as ctx from "qtiCustomInteractionContext"; // the qtiCustomInteractionContext will be dynamicly imported in the player environment
import style from "./assets/style.css"; // import and bundle this style file ( you can use tailwind and nested css )
// Configuration
import configProps from "./config.json"; // the settings, with editor hints for authoring systems (AUTHORING.md)
// the build passes only the defaults; like every data- attribute they arrive as strings
type PropTypes = PciProperties<typeof configProps>;

// implement the lifecycle by implementing IMSpci and pass props as a generic
class App implements IMSpci<PropTypes> {
  typeIdentifier = "HelloWorld"; // typeIdentifier is mandatory for all PCI's
  config: ConfigProperties<PropTypes>; // reference to the interface of the config object which you get when getInstance is called by the player
  state: string; // keep a reference to the state
  shadowdom: ShadowRoot | Element; // Not mandatory, but its wise to create a shadowroot
  dom: HTMLElement;
  // The correct response the delivery engine handed us at getInstance time.
  // See https://github.com/1EdTech/qti-project-management/issues/210
  private correctResponse: string | null = null;
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
    config.properties = { ...(configProps as unknown as PropTypes), ...config.properties }; // defaults, then the item's
    this.config = config;
    this.state = state ? state : "";
    // The engine passes the correct response along when the item declares one, so a
    // PCI can show it itself when the item is in solution status.
    this.correctResponse = (config.responseDeclaration?.correctResponse?.value as string) ?? null;
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

    // The item is in solution status and the engine passed a correct response along:
    // show that instead of the restored state. Both conditions have to hold, so an
    // engine that does not implement this keeps the behaviour it always had.
    if (config.status === "solution" && this.correctResponse !== null) {
      this.showCorrectResponse();
    }

    this.render();

    config.onready(this);
  };

  // Shows the correct response received at getInstance time. A delivery engine calls
  // this when it moves an already running interaction into review.
  showCorrectResponse = () => {
    if (this.correctResponse === null) return;
    // getResponse stringifies the state, so undo that to get the value back
    try {
      this.state = JSON.parse(this.correctResponse);
    } catch {
      this.state = this.correctResponse;
    }
    this.render();
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

  /** The pie: `colored` of `segments` slices in `color`, starting at the top and going round anticlockwise. */
  private pie = () => {
    const p = this.config.properties;
    const segments = Math.min(24, Math.max(2, Number.parseInt(p.segments, 10) || 10));
    const colored = Math.min(segments, Math.max(0, Number.parseInt(p.colored, 10) || 0));
    const size = Math.min(400, Math.max(100, Number.parseInt(p.size, 10) || 200));
    const r = size / 2 - 4;
    const c = size / 2;
    const point = (i: number) => {
      const angle = -Math.PI / 2 - (2 * Math.PI * i) / segments;
      return `${(c + r * Math.cos(angle)).toFixed(2)} ${(c + r * Math.sin(angle)).toFixed(2)}`;
    };
    const slices = Array.from({ length: segments }, (_, i) => {
      const fill = i < colored ? escapeHtml(p.color) : "#eef1f4";
      return `<path class="slice" d="M ${c} ${c} L ${point(i)} A ${r} ${r} 0 0 0 ${point(i + 1)} Z" fill="${fill}"/>`;
    });
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${colored} / ${segments}">${slices.join("")}</svg>`;
  };

  private render = () => {
    const p = this.config.properties;
    const readOnly = this.config.status === "review" || this.config.status === "solution" || this.config.status === "closed";
    this.shadowdom.innerHTML = `<div class="card">
      <h1>${escapeHtml(p.title)}</h1>
      <p class="question" id="question">${escapeHtml(p.question)}</p>
      ${this.pie()}
      <label class="answer">
        <input type="number" inputmode="numeric" min="0" max="100" step="1" aria-labelledby="question"
          value="${escapeHtml(`${this.state ?? ""}`)}" ${readOnly ? "disabled" : ""}>%
      </label>
    </div>`;
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
  };

  trigger = (event: string, value: any) => {
    this.config.properties[event] = value;
    this.render();
  };

  // The answer is a percentage, so it goes out as a number: an item declares base-type="integer" and
  // scores it with match_correct (or a range) instead of matching a quoted string like "\"30\"".
  getResponse = () => {
    const value = Number.parseInt(`${this.state}`, 10);
    return Number.isNaN(value) ? undefined : { base: { integer: value } };
  };

  getState = () => this.state.toString();
}

// A function declaration, so it exists when `new App()` below registers the PCI and a player renders it right away.
function escapeHtml(value: string) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default new App();
