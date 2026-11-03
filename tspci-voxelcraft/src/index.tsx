// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/voxelcraft, © OpenPCI (Aarhus University and Aalborg
// University: Elias J.T. Hansen, Anna Rusmann, Jeppe Bundsgaard)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import Authoring from "./authoring";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import {
  IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, IMSpciAuthoringFactory,
  PciAuthoringConfiguration, PciAuthoringInstance,
} from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore } from "./store";
import { Scoring, Voxel, hexToInt, parseColors, parseVoxels, responseString, sortVoxels } from "./voxels";
import { textsFor } from "./texts";

// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("targetshape"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

/** The settings as the interaction uses them. */
export const settingsFrom = (p: PropTypes) => {
  const emptyColor = /^#[0-9a-f]{6}$/i.test(String(p.emptyColor ?? "").trim()) ? String(p.emptyColor).trim().toLowerCase() : "";
  const scoring: Scoring = {
    target: parseVoxels(p.targetShape, false),
    useColor: String(p.matchColors).toLowerCase() === "true",
    wsColor: emptyColor ? hexToInt(emptyColor) : -1,
  };
  return {
    colors: parseColors(p.colors),
    preset: parseVoxels(p.scene),
    scoring,
    emptyColor,
    language: String(p.language ?? "en"),
  };
};

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "voxelcraft";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot;
  config: ConfigProperties<PropTypes>;
  settings: ReturnType<typeof settingsFrom>;

  // The correct response the delivery engine handed us at getInstance time.
  // See https://github.com/1EdTech/qti-project-management/issues/210
  private correctResponse: QtiVariableJSON | null = null;

  constructor() {
    if (ctx) {
      ctx.register(this);
    }
  }

  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string) => {
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration);
    this.settings = settingsFrom(this.config.properties);

    this.store = initStore({ voxels: this.settings.preset, changed: false, past: [] });
    if (stateString) {
      try {
        // getState() saves { state: { voxels, changed }, log }
        const saved = JSON.parse(stateString);
        if (Array.isArray(saved?.state?.voxels)) {
          this.store.restoreState({ voxels: parseVoxels(saved.state.voxels), changed: !!saved.state.changed, past: [] }, saved.log ?? []);
        }
      } catch {
        // not a state of this PCI: start with the preset figure
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (this.responseText(response)) {
        this.setResponse(response);
      }
    }

    // The item is in solution status and the engine passed a correct response along: show that.
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
      dom.dispatchEvent(new CustomEvent("qti-interaction-changed", { detail: event }));
    }, { immediate: false });

    this.config.onready && this.config.onready(this);
    return this;
  };

  /** Paints the correct response received at getInstance time (review, solution). */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  private correctResponseFromDeclaration = (
    declaration: ConfigProperties<PropTypes>["responseDeclaration"]
  ): QtiVariableJSON | null => {
    const value = declaration?.correctResponse?.value;
    if (value === undefined || value === null || value === "") return null;
    return { base: { string: Array.isArray(value) ? value[0] : value } } as QtiVariableJSON;
  };

  /** The response string; TAO's empty response is { base: null }. */
  private responseText = (response: QtiVariableJSON): string | null => {
    const value = response?.base?.string;
    return typeof value === "string" && value.trim() ? value : null;
  };

  render = () => {
    this.settings = settingsFrom(this.config.properties); // trigger() may have changed them
    const status = this.config.status;
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction store={this.store} colors={this.settings.colors} preset={this.settings.preset}
        texts={textsFor(this.settings.language)} readOnly={status === "review" || status === "solution" || status === "closed"} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author builds the starting figure and the target shape in the 3D editor; getProperties() gives
   * data-scene and data-target-shape. Only an authoring system calls this; delivery never does.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) } as PropTypes;
    const settings = settingsFrom(properties);
    const figures = { scene: settings.preset, targetShape: settings.scoring.target };
    const language = (config.language ?? settings.language ?? "en").slice(0, 2);
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring scene={settings.preset} targetShape={settings.scoring.target} colors={settings.colors}
        emptyColor={settings.emptyColor} language={language}
        onChange={(which, voxels) => { figures[which] = voxels; config.onchange?.(); }} />,
      host
    );
    const json = (voxels: Voxel[]) => (voxels.length ? JSON.stringify(sortVoxels(voxels)) : "");
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ scene: json(figures.scene), targetShape: json(figures.targetShape) }),
      validate: () => [],
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
    const before = this.settings.preset;
    this.render();
    // a new preset figure shows right away, as long as the candidate (or the author previewing) built nothing
    if (key === "scene" && !this.store.getState().changed && before !== this.settings.preset) {
      this.store.restoreState({ voxels: this.settings.preset, changed: false, past: [] }, []);
    }
  };

  /** The building, the original's format: {"data":[{"p":[x,y,z],"c":rgb},…],"score":1}; nothing before the first action. */
  getResponse = () => {
    const { voxels, changed } = this.store.getState();
    if (!changed) return undefined;
    return {
      base: {
        string: responseString(voxels, this.settings.scoring),
      },
    };
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  setResponse = (response: QtiVariableJSON) => {
    const text = this.responseText(response);
    if (!text) {
      this.resetResponse();
      return;
    }
    this.store.restoreState({ voxels: parseVoxels(text), changed: true, past: [] }, []);
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
  };

  getState = () => {
    const { voxels, changed } = this.store.getState();
    return JSON.stringify({ state: { voxels, changed }, log: this.store.getActions() });
  };
}

export default new App();
