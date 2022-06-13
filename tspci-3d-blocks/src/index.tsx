import { h, render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import { Interaction } from "./interaction";
import style from "./style.css";
import configProps from "./config.json";
type PropTypes = typeof configProps;

import { Configuration, IMSpci } from "@citolab/tspci"; // interfaces for IMS pci and extended TAO pcis
import { initStore, Store } from "@citolab/preact-store";
import { actions, StateModel } from "./store";
import { TAOpci } from "@citolab/tspci-tao";
import { planeProjection, planesToScene, sort } from "./sort";

export type State = { cubes: { x: number; y: number; z: number }[] };

class App implements IMSpci<PropTypes>, TAOpci {
  typeIdentifier = "3dBlocks";

  store: Store<StateModel>;
  props: PropTypes;
  config: Configuration<PropTypes>;
  shadowdom: ShadowRoot;
  private logActions: { type: string; payload: unknown }[] = []; // optional logActions

  constructor() {
    ctx && ctx.register(this);
  }

  getInstance = (dom: HTMLElement, config: Configuration<PropTypes>, stateString: string) => {
    config.properties = { ...configProps, ...config.properties }; // merge current props with incoming
    this.config = config;

    const initState = stateString ? JSON.parse(stateString).state : { cubes: [] };
    this.logActions = stateString ? JSON.parse(stateString).log : [];
    this.store = initStore<StateModel>(actions, initState, (action) => this.logActions.push(action));

    this.shadowdom = dom.shadowRoot ? dom.shadowRoot : dom.attachShadow({ mode: "open" });

    this.render();

    config.onready && config.onready(this);
  };

  render = () => {
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(<Interaction config={this.config.properties} />, this.shadowdom);
  };

  trigger = (event: string, value: any) => {
    this.config.properties[event] = value;
    this.render();
  };

  resetResponse = () => {
    this.store.cleanup();
    this.store = initStore<StateModel>(actions, { cubes: [] });
    this.render();
  };

  setResponse = (response: any) => {
    let state = [];
    try {
      if (response.base && response.base.string) {
        const planes = JSON.parse(response.base.string);
        state = planesToScene(
          { xPlane: planes.xPlane, yPlane: planes.yPlane, zPlane: planes.zPlane },
          +this.config.properties.cubePixelSize,
          +this.config.properties.gridDivisions
        );
      }
    } catch {
      // ignore
    }
    this.store.cleanup();
    this.store = initStore<StateModel>(actions, { cubes: state });
    this.render();
  };

  off = () => {}; // called when setting correct response in tao
  on = (val) => {};

  getResponse = () => {
    if (this.store?.getState()) {
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
    this.shadowdom.host.innerHTML = ''
    this.store.cleanup();
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.logActions,
    });
}

export default new App();
