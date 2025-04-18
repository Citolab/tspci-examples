import { h, render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import { Interaction } from "./interaction";
import style from "./style.css";
import configProps from "./config.json";
type PropTypes = typeof configProps;

import { ConfigProperties, IMSpci, QtiInteractionChangedDetail, QtiVariableJSON } from "@citolab/tspci"; // interfaces for IMS pci and extended TAO pcis
import { IStore } from "@citolab/preact-store";
import { initStore, StateModel } from "./store";
import { TAOpci } from "@citolab/tspci-tao";
import { Cube, planeProjection, planesToScene, sort } from "./utils";

export type State = { cubes: Cube[] };

class App implements IMSpci<PropTypes>, TAOpci {
  typeIdentifier = "blocks";

  store: IStore<StateModel>;
  props: PropTypes;
  config: ConfigProperties<PropTypes>;
  shadowdom: ShadowRoot;
  private initialState: StateModel = { cubes: [] };

  constructor() {
    ctx && ctx.register(this);
  }

  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string) => {
    config.properties = { ...configProps, ...config.properties }; // merge current props with incoming
    this.config = config;

    const restoredState = stateString ? JSON.parse(stateString) : null;
    const logActions = stateString ? JSON.parse(stateString).log : null;
    this.store = initStore(this.initialState);
    if (restoredState || logActions) {
      this.store.restoreState(restoredState.state, logActions);
    }

    this.shadowdom = dom.shadowRoot ? dom.shadowRoot : dom.attachShadow({ mode: "open" });

    this.render();
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
    });
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      // check if any property in response at the lowest level has a value
      // so { base: string: undefined } is not a value
      // but { base: string: "value" } is a value
      const hasValue = Object.values(response).some((value) => {
        if (typeof value === "object") {
          return Object.values(value).some((v) => v !== undefined);
        }
        return value !== undefined;
      });
      if (hasValue) {
        this.setResponse(response);
      }
    }
    config.onready && config.onready(this);
  };

  render = () => {
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(<Interaction config={this.config.properties} store={this.store} />, this.shadowdom);
  };

  trigger = (event: string, value: any) => {
    this.config.properties[event] = value;
    window.requestAnimationFrame(() => this.render());
  };

  resetResponse = () => {
    this.store.unsubscribeAll();
    this.store.reset();
    this.render();
  };

  setResponse = (response: QtiVariableJSON) => {
    try {
      if (response.base && response.base.string) {
        const planes = JSON.parse(response.base.string.toString());
        const cubes = planesToScene(
          { xPlane: planes.xPlane, yPlane: planes.yPlane, zPlane: planes.zPlane },
          +this.config.properties.cubePixelSize,
          +this.config.properties.gridDivisions
        );
        this.resetResponse();
        this.store.restoreState({ cubes }, []);
      }
    } catch {
      // ignore
      this.resetResponse();
    }

  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  getResponse = () => {
    if (this.store?.getState() && this.store?.getState() !== this.initialState) {
      const size = +this.config.properties.cubePixelSize;
      const grid = +this.config.properties.gridDivisions;
      const cubes: { x: number; y: number; z: number }[] = this.store?.getState()?.cubes || [];
      const yPlane = planeProjection(cubes, "y", size, grid);
      const xPlane = planeProjection(cubes, "x", size, grid);
      const zPlane = planeProjection(cubes, "z", size, grid);
      return {
        base: {
          string: JSON.stringify({ xPlane, yPlane, zPlane }),
        },
      };
    } else {
      return undefined;
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
