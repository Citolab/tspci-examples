// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/paint, © Jeppe Bundsgaard, openPCI (Aarhus University and Aalborg University)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction, { Settings } from "./interaction";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import { IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, Operation, StateModel, emptyState, initStore, isEmpty } from "./store";
import { toDataURL } from "./drawing";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems; the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("defaultcolor"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const toColor = (value: string) => {
  const v = String(value ?? "").trim();
  if (HEX.test(v)) return `#${v.replace("#", "").toLowerCase()}`;
  return typeof CSS !== "undefined" && CSS.supports?.("color", v) ? v : null;
};
const integer = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, n)) : fallback;
};

/**
 * The settings as the interaction uses them. The original (TAO) PCI had the colours one per line and the sizes
 * comma separated; both separators work for both.
 */
export const parseSettings = (p: Record<string, string>): Settings => {
  let colors = [...new Set(String(p.colors ?? "").split(/[\n,;]+/).map(toColor).filter(Boolean))];
  if (colors.length === 0) colors = String(defaults.colors).split(",").map(toColor);
  const defaultColor = toColor(p.defaultColor) ?? colors[0];
  if (!colors.includes(defaultColor)) colors = [defaultColor, ...colors];

  let strokes = [...new Set(String(p.strokes ?? "").split(/[\s,;]+/).map(Number).filter((n) => n > 0 && n <= 200))];
  if (strokes.length === 0) strokes = String(defaults.strokes).split(",").map(Number);
  const defaultStroke = Number(p.defaultStroke) > 0 ? Number(p.defaultStroke) : strokes[0];
  if (!strokes.includes(defaultStroke)) strokes = [...strokes, defaultStroke];
  strokes.sort((a, b) => a - b);

  return {
    prompt: p.prompt ?? "",
    colors,
    defaultColor,
    strokes,
    defaultStroke,
    width: integer(p.width, 800, 100, 2000),
    height: integer(p.height, 600, 100, 2000),
  };
};

const isOperation = (o: any): o is Operation =>
  o?.kind === "clear" ||
  (o?.kind === "fill" && typeof o.color === "string" && Number.isFinite(o.x) && Number.isFinite(o.y)) ||
  (o?.kind === "stroke" && Array.isArray(o.points) && typeof o.size === "number" && (o.color === null || typeof o.color === "string"));

class App implements IMSpci<PropTypes>, TAOpci {
  typeIdentifier = "paint";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  settings: Settings;

  constructor() {
    if (ctx) {
      ctx.register(this);
    }
  }

  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string) => {
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.settings = parseSettings(this.config.properties as unknown as Record<string, string>);

    this.store = initStore(emptyState);
    let restored = false;
    if (stateString) {
      try {
        // getState() saves { state }: the operations are the history already
        const saved = JSON.parse(stateString)?.state;
        if (saved && Array.isArray(saved.operations)) {
          this.store.restoreState({
            base: typeof saved.base === "string" && saved.base.startsWith("data:image/") ? saved.base : null,
            operations: saved.operations.filter(isOperation),
            undone: Array.isArray(saved.undone) ? saved.undone.filter(isOperation) : [],
          }, []);
          restored = true;
        }
      } catch {
        // not a state of this PCI: start with an empty canvas
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    // without a state of its own, show the drawing the delivery system hands over as the response
    if (!restored && this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (this.drawingIn(response)) {
        this.setResponse(response);
      }
    }

    // From here on, tell the Delivery System when the interaction changes (not for what it handed us above)
    this.store.subscribe(() => {
      const event: QtiInteractionChangedDetail = {
        interaction: this,
        responseIdentifier: this.config.responseIdentifier,
        valid: true,
        value: this.getResponse(),
      };
      const interactionChangedEvent = new CustomEvent("qti-interaction-changed", {
        detail: event,
      });
      dom.dispatchEvent(interactionChangedEvent);
    }, { immediate: false });

    this.config.onready && this.config.onready(this);
    return this;
  };

  /** The PNG data URL in a response, or null. */
  private drawingIn = (response: QtiVariableJSON): string | null => {
    const value = response?.base?.string;
    return typeof value === "string" && value.startsWith("data:image/") ? value : null;
  };

  render = () => {
    this.settings = parseSettings(this.config.properties as unknown as Record<string, string>); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction settings={this.settings} store={this.store} texts={textsFor(this.config.properties.language)} />,
      this.shadowdom
    );
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  // TAO's cfgChange: a setting changed in the authoring form
  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    this.render();
  };

  /** The drawing as a PNG data URL (as the original PCI); nothing while the canvas is empty. */
  getResponse = () => {
    const state = this.store.getState();
    if (isEmpty(state)) return undefined;
    const value = state.base && state.operations.length === 0
      ? state.base
      : toDataURL(state, this.settings.width, this.settings.height);
    return { base: { string: value } };
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  setResponse = (response: QtiVariableJSON) => {
    if (!response) return;
    const drawing = this.drawingIn(response);
    if (drawing) {
      this.store.restoreState({ base: drawing, operations: [], undone: [] }, []);
    } else {
      this.resetResponse();
    }
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
  };

  getState = () => JSON.stringify({ state: this.store.getState() });
}

export default new App();
