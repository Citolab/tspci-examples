// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/ganttchart, © OpenPCI (Aarhus University and Aalborg
// University: Elias J.T. Hansen, Anna Rusmann, Jeppe Bundsgaard)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026
import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import { IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore } from "./store";
import { Selection, Settings, Timeline, clean, parseResponseString, parseSettings, responseString, timeline } from "./gantt";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("startdate"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

class App implements IMSpci<PropTypes>, TAOpci {
  typeIdentifier = "ganttChart";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  settings: Settings;
  timeline: Timeline;

  private initialState: StateModel = { selection: [] };
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
    this.parseSettings();

    this.store = initStore(this.initialState);
    // some hosts (the dev page) hand over the item's states per response identifier
    if (stateString && typeof stateString === "object") {
      const states = stateString as unknown as Record<string, string>;
      stateString = states[config.responseIdentifier] ?? Object.values(states)[0];
    }
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = typeof stateString === "string" ? JSON.parse(stateString) : stateString;
        if (Array.isArray(saved?.state?.selection)) {
          this.store.restoreState({ selection: this.valid(saved.state.selection) }, saved.log ?? []);
        }
      } catch {
        // not a state of this PCI: start with an empty chart
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (this.selectionIn(response)) {
        this.setResponse(response);
      }
    }

    // The item is in solution status and the engine passed a correct response along:
    // show that on top of whatever was restored above. Both conditions have to hold,
    // so an engine that does not implement this keeps the behaviour it always had.
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
   * Paints the correct response received at getInstance time. A delivery engine
   * calls this when it moves an already running interaction into review.
   */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  private correctResponseFromDeclaration = (
    declaration: ConfigProperties<PropTypes>["responseDeclaration"]
  ): QtiVariableJSON | null => {
    const value = declaration?.correctResponse?.value;
    if (value === undefined || value === null) return null;
    return { base: { [declaration.baseType ?? "string"]: value } } as QtiVariableJSON;
  };

  /** The selection in a response ({ base: { string } }); null when it is empty or not a response of this PCI. */
  private selectionIn = (response: QtiVariableJSON): Selection | null => {
    const value = response?.base?.string;
    if (value === undefined || value === null || value === "") return null;
    return parseResponseString(String(value), this.settings, this.timeline.slots);
  };

  /** Only slots that exist and can be planned, one list per task. */
  private valid = (selection: unknown[]): Selection =>
    this.settings.tasks.map((_, t) => clean(Array.isArray(selection[t]) ? (selection[t] as number[]) : [], this.timeline.slots));

  private parseSettings = () => {
    const texts = textsFor(this.config.properties.language);
    this.settings = parseSettings(this.config.properties as Record<string, unknown>);
    this.timeline = timeline(this.settings, texts.locale, texts.week);
  };

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={this.config.properties.prompt} settings={this.settings} timeline={this.timeline} store={this.store}
        texts={textsFor(this.config.properties.language)} />,
      this.shadowdom
    );
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    this.parseSettings();
    // other settings, other slots: keep what still fits
    this.store.restoreState({ selection: this.valid(this.store.getState().selection) }, []);
    this.render();
  };

  /**
   * The original's response string, {'response':'2/3 - 6/3;9/3;','state':[[1,2,3,4,5],[8],[]]}; nothing as long as
   * no slot is planned.
   */
  getResponse = () => {
    const selection = this.valid(this.store.getState().selection);
    if (!selection.some((s) => s.length)) {
      return undefined;
    }
    return {
      base: {
        string: responseString(selection, this.settings, this.timeline.slots),
      },
    };
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  setResponse = (response: QtiVariableJSON) => {
    if (!response) return;
    const selection = this.selectionIn(response);
    if (selection) {
      this.store.restoreState({ selection }, []);
    } else {
      this.resetResponse();
    }
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
