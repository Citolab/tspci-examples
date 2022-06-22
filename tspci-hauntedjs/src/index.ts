import { render, html } from 'lit-html';

import * as ctx from "qtiCustomInteractionContext";
import { Interaction } from "./interaction";
import style from "./style.css";
import { actions, StateModel } from "./store";
import configProps from "./config.json";
type PropTypes = typeof configProps;

import { Configuration, IMSpci } from "@citolab/tspci"; // interfaces voor IMS pci en geextende TAO pcis
import { initStore, Store } from "./litstore"; // a pure react store
import { TAOpci } from "@citolab/tspci-tao";
class App implements IMSpci<PropTypes>, TAOpci {
  // interface, so its clear how this should work
  typeIdentifier = "getallenFormule";

  private config: Configuration<PropTypes>;

  private logActions: { type: string; payload: unknown }[] = []; // optional logActions
  shadowdom: ShadowRoot; // implementation detail
  store: Store<StateModel>;

  constructor() {
    ctx && ctx.register(this);
  }

  getInstance = (dom: HTMLElement, config: Configuration<PropTypes>, stateString: string) => {
    config.properties = { ...configProps, ...config.properties }; // merge current props with incoming
    this.config = config;

    const initState = stateString ? JSON.parse(stateString).state : { attempts: [] };
    this.logActions = stateString ? JSON.parse(stateString).log : [];
    this.store = initStore<StateModel>(actions, initState, (action) => this.logActions.push(action));

    this.shadowdom = dom.attachShadow({ mode: "closed" });
    this.render();
    this.config.onready && this.config.onready(this);
  };

  render = () => {
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    render(html`${Interaction({config:this.config.properties})}`, this.shadowdom);
    this.shadowdom.appendChild(css);
  };

  trigger = (event: string, value: any) => {
    this.config.properties[event] = value;
    this.render();
  };

  off = () => {}; // called when setting correct response in tao
  on = (val) => {};
  
  getResponse = () => {
    const response = {
      base: null,
    };
    return response;
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.logActions,
    });

  oncompleted = () => this.store.cleanup();
}

export default new App();
