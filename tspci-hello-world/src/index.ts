import { Configuration, IMSpci } from "@citolab/tspci";
import * as ctx from "qtiCustomInteractionContext";

class Pci implements IMSpci<{}> {
  typeIdentifier = "HelloWorld";
  shadowdom: ShadowRoot;

  constructor() {
    ctx && ctx.register(this); 
  }

  getInstance = (dom: HTMLElement, config: Configuration<any>, state: string) => {
    this.shadowdom = dom.attachShadow({ mode: "closed" });
    this.render();
    config.onready(this);
  };

  private render = () => {
    this.shadowdom.innerHTML = `<div>Hello-World</div>`;
  };

  getResponse = () => { return null };

  getState = () => null;
}

export default new Pci();
