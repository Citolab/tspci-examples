import { Configuration, IMSpci } from "@citolab/tspci";
import { TAOpci } from "@citolab/tspci-tao";
import * as ctx from "qtiCustomInteractionContext";
import configProps from "./config.json";
type PropTypes = typeof configProps;

class Pci implements IMSpci<never>, TAOpci {
  typeIdentifier = "HelloWorld";
  shadowdom: ShadowRoot;
  public config: Configuration<PropTypes>;
  
  constructor() {
    ctx && ctx.register(this); 
  }
  
  on: (value: any) => void;
  off: () => void;
  
  resetResponse = () => {
    // RESET RESPONSE HERE
  };
  setResponse = (response: any) => {
    // SET RESPONSE HERE, USE TO SHOW THE CORRECT ANSWER GIVEN BY THE ITEM-AUTHOR IN TAO CONSTRUCTION
  };
  
  trigger = (event: string, value: any) => {
    this.config.properties[event] = value;
    this.render();
  };

  oncompleted = () => {
    this.shadowdom.host.innerHTML = ''
  };

  getInstance = (dom: HTMLElement, config: Configuration<any>, state: string) => {
    config.properties = { ...configProps, ...config.properties }; // merge current props with incoming
    this.config = config;
    this.shadowdom = dom.attachShadow({ mode: "closed" });
    this.render();
    config.onready(this);
  };

  private render = () => {
    this.shadowdom.innerHTML = `<div>${this.config.properties.text}</div>`;
  };

  getResponse = () => { return null };

  getState = () => null;
}

export default new Pci();
