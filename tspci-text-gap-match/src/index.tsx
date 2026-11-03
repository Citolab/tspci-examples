// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/textgapmatch, © OpenPCI (Aarhus University and Aalborg
// University: Elias J.T. Hansen, Anna Rusmann, Jeppe Bundsgaard)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import Authoring, { authoringProblems } from "./authoring";
import style from "./style.css";
import exampleImage from "./example.svg";
import { TAOpci } from "@citolab/tspci-tao";
import { IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, IMSpciAuthoringFactory, PciAuthoringConfiguration, PciAuthoringInstance } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore } from "./store";
import {
  Placed, Rules, Zone, clean, emptyPlaced, fromResult, isEmpty, isTrue, parseLabels, parseMax, parseStyle, parseZones,
  serializeZones, toResult,
} from "./model";
import { textsFor } from "./texts";
import { slot } from "@citolab/tspci/media";

// config.json carries editor hints for authoring systems; the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("infinitetexts"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

/**
 * The <img> of the image slot in qti-interaction-markup: an authoring system with a media bank puts the author's image
 * there, marked data-pci-slot="image" (the PCI authoring profile); an <img> without the mark, as in an item written by
 * hand, also works.
 */
const imageFromMarkup = (dom: HTMLElement) => {
  const img = (slot("image", dom) as HTMLImageElement | null) ?? dom.querySelector("img");
  return img?.getAttribute("src") ? { src: img.src, alt: img.alt } : null;
};

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "textGapMatch";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  labels: string[] = [];
  zones: Zone[] = [];
  rules: Rules = { infinite: false, max: 0 };
  /** An <img> the item put in qti-interaction-markup; read before the shadow root hides it. */
  private markupImage: { src: string; alt: string } | null = null;

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
    this.markupImage = imageFromMarkup(dom);
    this.parseSettings();

    this.store = initStore({ placed: emptyPlaced(this.zones) }, () => this.rules);
    if (stateString) {
      try {
        const saved = JSON.parse(stateString);
        if (saved?.state?.placed) {
          // getState() saves { state, log }
          this.store.restoreState({ placed: clean(saved.state.placed, this.zones, this.labels, this.rules) }, saved.log ?? []);
        } else if (saved?.response) {
          // the state the original saved: { response: { zone: [texts] } }
          this.store.restoreState({ placed: fromResult(saved.response, this.zones, this.labels, this.rules) }, []);
        }
      } catch {
        // not a state of this PCI: start empty
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      const placed = this.placedIn(response);
      if (placed && !isEmpty(placed)) this.store.restoreState({ placed }, []);
    }

    // The item is in solution status and the engine passed a correct response along: show it.
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

  /** Paints the correct response received at getInstance time (a delivery engine calls this to go into review). */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  private correctResponseFromDeclaration = (
    declaration: ConfigProperties<PropTypes>["responseDeclaration"]
  ): QtiVariableJSON | null => {
    const value = declaration?.correctResponse?.value;
    if (value === undefined || value === null || value === "") return null;
    return { base: { string: String(value) } } as QtiVariableJSON;
  };

  /** The placement in a response: { base: { string: '{"dropzone_1":["Flower"], …}' } }. */
  private placedIn = (response: QtiVariableJSON): Placed | null => {
    const value = response?.base?.string;
    if (value === undefined || value === null || value === "") return null;
    try {
      return fromResult(typeof value === "string" ? JSON.parse(value) : value, this.zones, this.labels, this.rules);
    } catch {
      return null;
    }
  };

  private parseSettings = () => {
    const p = this.config.properties;
    this.labels = parseLabels(p.strings);
    this.zones = parseZones(p.dropzones);
    this.rules = { infinite: isTrue(p.infiniteTexts), max: parseMax(p.maxDropped) };
  };

  private image = () => {
    const p = this.config.properties;
    const t = textsFor(p.language);
    if (this.markupImage) return { src: this.markupImage.src, alt: p.imageDescription?.trim() || this.markupImage.alt };
    const own = String(p.backdrop ?? "").trim();
    if (own) return { src: own, alt: p.imageDescription?.trim() ?? "" };
    return { src: exampleImage, alt: p.imageDescription?.trim() || t.exampleImage };
  };

  render = () => {
    const before = { zones: this.zones, labels: this.labels };
    this.parseSettings(); // trigger() may have changed them
    if (this.store && (before.zones !== this.zones || before.labels !== this.labels)) {
      const placed = clean(this.store.getState().placed, this.zones, this.labels, this.rules);
      if (JSON.stringify(placed) !== JSON.stringify(this.store.getState().placed)) this.store.restoreState({ placed }, []);
    }
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    const p = this.config.properties;
    render(
      <Interaction labels={this.labels} zones={this.zones} image={this.image()} rules={this.rules}
        numbering={isTrue(p.numbering)} droppedStyle={parseStyle(p.droppedStyle)} store={this.store}
        texts={textsFor(p.language)} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author chooses the image and draws the drop zones on it; getProperties() gives data-backdrop and
   * data-dropzones. Only an authoring system calls this; delivery never does.
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    const t = textsFor((config.language ?? "en").slice(0, 2)); // the author's language, not the candidate's
    let backdrop = String(properties.backdrop ?? "").trim();
    let zones = parseZones(properties.dropzones);
    const markupImage = !!imageFromMarkup(dom);
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initialImage={backdrop} exampleImage={exampleImage} initialZones={zones} markupImage={markupImage} t={t}
        onChange={(image, next) => { backdrop = image; zones = next; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ backdrop, dropzones: serializeZones(zones) }),
      validate: () => authoringProblems(zones, t),
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
    this.render();
  };

  /**
   * As the original: a string with JSON, per zone id the texts of the labels in it, in order:
   * {"dropzone_1":["Flower"],"dropzone_2":[]}. Nothing while no label lies in a zone.
   */
  getResponse = () => {
    const { placed } = this.store.getState();
    if (isEmpty(placed)) return undefined;
    return {
      base: {
        string: JSON.stringify(toResult(this.zones, this.labels, placed)),
      },
    };
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.restoreState({ placed: emptyPlaced(this.zones) }, []);
  };

  setResponse = (response: QtiVariableJSON) => {
    if (!response) return;
    const placed = this.placedIn(response);
    if (placed) this.store.restoreState({ placed }, []);
    else this.resetResponse();
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
