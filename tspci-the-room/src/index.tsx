// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/theroom (runtime/theroom.amd.js), © openPCI:
// Elias J.T. Hansen, Anna Rusmann and Jeppe Bundsgaard (Aarhus University and Aalborg University)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import { TAOpci } from "@citolab/tspci-tao";
import { IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";
import { Interaction } from "./interaction";
import style from "./style.css";
import configProps from "./config.json";
import { Actions, StateModel, initStore } from "./store";
import { exerciseSource } from "./exercise";
import { RoomModel } from "./model";
import { textsFor } from "./texts";

// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("scoringfunction"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

const numberIn = (value: unknown, allowed: number[], fallback: number) => {
  const n = parseFloat(String(value));
  return allowed.includes(n) ? n : fallback;
};

class App implements IMSpci<PropTypes>, TAOpci {
  typeIdentifier = "theroom";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  /** the room of the exercise; rebuilt when the exercise, the scoring rules or the language changes */
  model: RoomModel;
  private modelKey = "";

  private initialState: StateModel = { objects: null, past: [], changed: false };
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
    this.ensureModel();

    this.store = initStore(this.initialState);
    if (stateString) {
      try {
        // getState() saves { state, log }; some hosts hand over the parsed object, or the item's { RESPONSE: state }
        let saved: any = typeof stateString === "string" ? JSON.parse(stateString) : stateString;
        if (saved && !saved.state) {
          const inner = Object.values(saved).find((v) => typeof v === "string" && v.includes('"state"'));
          if (typeof inner === "string") saved = JSON.parse(inner);
        }
        const state = saved?.state;
        if (state && (state.objects === null || Array.isArray(state.objects))) {
          this.store.restoreState(
            { objects: state.objects, past: Array.isArray(state.past) ? state.past : [], changed: !!state.changed },
            saved.log ?? []
          );
        }
      } catch {
        // not a state of this PCI: start with the exercise's layout
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    this.render();

    const handOver = () => {
      if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
        const responseIdentifier = Object.keys(this.config.boundTo)[0];
        const response = this.config.boundTo[responseIdentifier];
        if (this.textIn(response)) this.setResponse(response);
      }

      // The item is in solution status and the engine passed a correct response along:
      // show that on top of whatever was restored above. Both conditions have to hold,
      // so an engine that does not implement this keeps the behaviour it always had.
      if (this.config.status === "solution" && this.correctResponse) {
        this.showCorrectResponse();
      }
    };

    // From here on, tell the Delivery System when the interaction changes (not for what it handed us above)
    const listen = () => this.store.subscribe(() => {
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

    // setResponse waits for the exercise (static furniture is recognised from it): so do the events
    if (this.model.status === "loading") {
      this.model.ready.then(() => {
        handOver();
        listen();
      });
    } else {
      handOver();
      listen();
    }

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
    if (value === undefined || value === null || value === "") return null;
    return { base: { string: Array.isArray(value) ? String(value[0]) : String(value) } } as QtiVariableJSON;
  };

  /** The JSON in a response; TAO hands an empty one over as { base: null }. */
  private textIn = (response: QtiVariableJSON): string | null => {
    const value = (response as any)?.base?.string;
    return typeof value === "string" && value.trim() ? value : null;
  };

  private ensureModel = () => {
    const p = this.config.properties;
    const key = JSON.stringify([p.exercise, p.gameurl, p.scoringRules, p.language]);
    if (key === this.modelKey && this.model) return false;
    this.model?.dispose();
    this.modelKey = key;
    this.model = new RoomModel(exerciseSource(String(p.exercise ?? ""), String(p.gameurl ?? "")), {
      scoringRules: String(p.scoringRules ?? ""),
      language: String(p.language ?? "en").slice(0, 2),
    });
    return true;
  };

  render = () => {
    const p = this.config.properties;
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction
        model={this.model}
        store={this.store}
        texts={textsFor(String(p.language))}
        prompt={String(p.prompt ?? "").trim()}
        height={Math.max(280, parseInt(String(p.height), 10) || 480)}
        rotationStep={(numberIn(p.rotationStep, [90, 45, 15, 30], 90) * Math.PI) / 180}
        gridSize={numberIn(p.gridSize, [0, 0.1, 0.25, 0.5, 1], 0.25)}
        showZones={String(p.showZones) === "true"}
      />,
      this.shadowdom
    );
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    // another exercise: start from its layout
    if (this.ensureModel()) this.store.restoreState(this.initialState, []);
    this.render();
  };

  /**
   * As the original: JSON text with the exercise, the scene, every piece of furniture ({ id, pos, rot }) and the
   * score of the scoring rules. Nothing until the candidate changes the room.
   */
  getResponse = () => {
    const state = this.store?.getState();
    if (!state?.changed) return undefined;
    const objects = state.objects ?? (this.model.status === "ready" ? this.model.start : null);
    if (!objects) return undefined;
    return {
      base: {
        string: JSON.stringify(this.model.serialize(objects)),
      },
    };
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  setResponse = (response: QtiVariableJSON) => {
    const text = this.textIn(response);
    if (!text) {
      this.resetResponse();
      return;
    }
    const apply = () => {
      const objects = this.model.parse(text);
      if (objects) this.store.restoreState({ objects, past: [], changed: true }, []);
      else this.resetResponse();
    };
    // static furniture is recognised from the exercise, so wait for it
    if (this.model.status === "loading") this.model.ready.then(apply);
    else apply();
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
