import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import Authoring, { authoringProblems } from "./authoring";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import { IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, IMSpciAuthoringFactory, PciAuthoringConfiguration, PciAuthoringInstance } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore } from "./store";
import { LEGACY_IDS, Partition, assignColors, isDefaultPartition, parsePartition, percentage, regions, serializePartition } from "./partition";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults
type PropTypes = PciProperties<typeof configProps>;


type ResponseType = { color: string; percentage: number };

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "colorProportions";
  store: IStore<StateModel, Actions>;
  dom: HTMLElement;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  /** data-partition: the shape the author drew; without it the shape this PCI always had. */
  partition: Partition;

  private initialState: StateModel = { vlakken: [] };
  // The correct response the delivery engine handed us at getInstance time.
  // See https://github.com/1EdTech/qti-project-management/issues/210
  private correctResponse: QtiVariableJSON | null = null;

  constructor() {
    if (ctx) {
      ctx.register(this);
    }
  }

  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string) => {
    config.properties = { ...(configProps as unknown as PropTypes), ...config.properties }; // defaults, then the item's
    this.config = config;
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration);

    this.partition = parsePartition(config.properties.partition);

    const saved = stateString ? JSON.parse(stateString) : null;
    this.store = initStore(this.initialState);
    if (saved) {
      // getState() saves { state, log }; the parts of the default shape had other ids before it was a partition
      const legacy = isDefaultPartition(this.partition) ? LEGACY_IDS : {};
      const vlakken = (saved.state?.vlakken ?? []).map((v) => ({ ...v, id: legacy[v.id] ?? v.id }));
      this.store.restoreState({ vlakken }, saved.log ?? []);
    }

    this.shadowdom = dom.attachShadow({ mode: "closed" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      // check if any property in response at the lowest level has a value
      // so { base: string: undefined } is not a value
      // but { base: string: "value" } is a value
      const hasValue = !!response && Object.values(response).some((value) => {
        if (value !== null && typeof value === "object") {
          return Object.values(value).some((v) => v !== undefined && v !== null);
        }
        return value !== undefined && value !== null;
      });
      if (hasValue) {
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

  /**
   * Reads the correct response out of the response declaration and shapes it like
   * any other response value, so setResponse can paint it.
   */
  private correctResponseFromDeclaration = (
    declaration: ConfigProperties<PropTypes>["responseDeclaration"]
  ): QtiVariableJSON | null => {
    const value = declaration?.correctResponse?.value;
    if (value === undefined || value === null) return null;
    const baseType = declaration.baseType ?? "string";
    return (
      declaration.cardinality && declaration.cardinality !== "single"
        ? { list: { [baseType]: value } }
        : { base: { [baseType]: value } }
    ) as QtiVariableJSON;
  };

  render = () => {
    this.partition = parsePartition(this.config.properties.partition); // trigger() may have changed it
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(<Interaction config={this.config.properties} partition={this.partition} store={this.store} />, this.shadowdom);
  };

  /**
   * Authoring mode: the author sizes the rectangle and draws the lines that split it; getConfig() gives
   * data-partition. Only an authoring system calls this (AUTHORING.md, "Authoring mode"); delivery never does.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...(configProps as unknown as PropTypes), ...config.properties };
    let partition = parsePartition(properties.partition);
    const language = (config.language ?? "en").slice(0, 2);
    const shadow = dom.attachShadow({ mode: "closed" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={partition} colors={properties.colors} language={language}
        onChange={(next) => { partition = next; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getConfig: () => ({ partition: serializePartition(partition) }),
      validate: () => authoringProblems(partition, language),
      destroy: () => render(null, host),
    };
    config.onready?.(instance);
    return instance;
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  trigger = (event: string, value: any) => {
    this.config.properties[event] = value;
    this.render();
  };

  getResponse = () => {
    // there are different ways to construct the correct answer.
    // Therefor the response is returned as percentages.
    // This way it can be scored with a single correct answer.
    const currentState = this.store.getState();
    const parts = regions(this.partition);
    const cubesPerColor: { color: string; percentage: number }[] = [];
    currentState.vlakken.forEach(({ color, id }) => {
      const part = parts.find((p) => p.id === id);
      if (!part) return;
      const share = percentage(part);
      const matchingColorRow = cubesPerColor.find((c) => c.color.trim().toLowerCase() === color.trim().toLowerCase());
      if (matchingColorRow) {
        matchingColorRow.percentage = matchingColorRow.percentage + share;
      } else {
        cubesPerColor.push({ color, percentage: share });
      }
    });

    const response: ResponseType[] = this.sort(
      cubesPerColor.map(({ color, percentage }) => ({
        color: color.trim().toLowerCase(),
        percentage,
      })),
      (v) => `${v.color}, percentage: ${this.round(v.percentage, 2)}`
    );
    if (!response.find((r) => r.percentage)) {
      return undefined;
    }
    return {
      base: {
        string: JSON.stringify(response),
      },
    };
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  setResponse = (response: QtiVariableJSON) => {
    // construct a state base on the response.
    // this can be different from the state when the author constructed the correct answer because could be
    // serveral ways to come to same: color/percentage.
    if (response) {
      try {
        const stateString = response?.base?.string?.toString();
        if (!stateString) return;
        const parsedResponse = JSON.parse(stateString) as ResponseType[];
        const vlakken = assignColors(regions(this.partition), parsedResponse);
        if (vlakken) {
          this.store.restoreState({ vlakken }, []);
        } else {
          this.resetResponse();
        }
      } catch {
        console.error(`couldn't restore state: ${response}`);
        this.resetResponse();
      }
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

  sort<T, K>(list: T[], getKey: (item: T) => K, desc = false) {
    list.sort((a: T, b: T) => {
      const valueA = getKey(a);
      const valueB = getKey(b);
      if (valueA < valueB) {
        return !desc ? -1 : 1;
      } else if (valueA > valueB) {
        return !desc ? 1 : -1;
      } else {
        return 0;
      }
    });
    return list;
  }
  round(value: any, decimals: number) {
    return parseFloat(parseFloat(value.toString()).toFixed(decimals));
  }
}

export default new App();
