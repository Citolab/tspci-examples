import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import { Configuration, IMSpci, QtiVariableJSON } from "@citolab/tspci";
import { Action, IStore, Store } from "@citolab/preact-store";

import configProps from "./config.json";
import { StateModel, Vlak, initStore } from "./store";
type PropTypes = typeof configProps;

type ResponseType = { color: string; percentage: number };

class App implements IMSpci<PropTypes>, TAOpci {
  typeIdentifier = "colorProportions";
  store: IStore<StateModel>;
  shadowdom: ShadowRoot; // implementation detail
  config: Configuration<PropTypes>;
  private initialState: StateModel = { vlakken: [] };

  constructor() {
    ctx && ctx.register(this);
  }

  getInstance = (dom: HTMLElement, config: Configuration<PropTypes>, stateString: string) => {
    config.properties = { ...configProps, ...config.properties }; // merge current props with incoming
    this.config = config;

    const restoredState = stateString ? JSON.parse(stateString) : null;
    const logActions = stateString ? JSON.parse(stateString).log : null;
    this.store = initStore(this.initialState);
    if (restoredState || logActions) {
      this.store.restoreState(restoredState, logActions);
    }
    this.shadowdom = dom.attachShadow({ mode: "closed" });
    this.render();

    this.config.onready && this.config.onready(this);
  };

  render = () => {
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(<Interaction config={this.config.properties} dom={this.shadowdom} store={this.store} />, this.shadowdom);
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

    const ids: { id: string; surface: number }[] = [];
    this.shadowdom?.querySelectorAll("rect[data-name]").forEach((el) => {
      ids.push({ id: el.getAttribute("data-name"), surface: this.extractNumber(el.getAttribute("data-name")) });
    });
    // the id contains the number of cubes
    const totalCubes = this.sum(ids, (i) => i.surface);
    const cubesPerColor: { surface: number; color: string; percentage: number }[] = [];
    currentState.vlakken.forEach(({ color, id }) => {
      const surface = this.extractNumber(id);
      const matchingColorRow = cubesPerColor.find((c) => c.color === color);
      const percentage = totalCubes !== 0 ? (surface / totalCubes) * 100 : 0;
      if (matchingColorRow) {
        matchingColorRow.percentage = matchingColorRow.percentage + percentage;
      } else {
        cubesPerColor.push({
          surface,
          color,
          percentage,
        });
      }
    });

    const response: ResponseType[] = this.sort(
      cubesPerColor.map(({ color, percentage }) => ({
        color,
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

  resetResponse = () => {
    this.store.unsubscribeAll();
    this.store.reset();
    this.render();
  };

  setResponse = (response: QtiVariableJSON) => {
    // construct a state base on the response.
    // this can be different from the state when the author constructed the correct answer because could be
    // serveral ways to come to same: color/percentage.

    if (response) {
      try {
        const parsedResponse = JSON.parse(response?.base?.string.toString()) as ResponseType[];
        const ids: { id: string; surface: number }[] = [];
        this.shadowdom?.querySelectorAll("rect[data-name]").forEach((el) => {
          ids.push({ id: el.getAttribute("data-name"), surface: this.extractNumber(el.getAttribute("data-name")) });
        });
        const sortedIds = this.sort(ids, (v) => v.surface, true);
        const emptyVlakken: (Vlak & { surface: number })[] = sortedIds.map(({ id, surface }) => {
          return { color: "", id, surface };
        });
        // now just try all options;
        //const vlakkenWithPercentages =
        const totalCubes = this.sum(ids, (i) => i.surface);
        let possibleSolutions = emptyVlakken.map(() => {
          return {
            surfaceToFill: 0,
            vlakken: emptyVlakken.map(({ id }) => {
              return {
                id,
                color: "",
                surface: this.extractNumber(id),
              };
            }),
          };
        });
        for (const response of parsedResponse) {
          const absoluteSurface = totalCubes * (response.percentage / 100);
          possibleSolutions = this.getPossibleSolutionsForColor(response.color, absoluteSurface, possibleSolutions);
        }
        this.resetResponse();
        if (possibleSolutions.length > 0) {
          this.store.restoreState(possibleSolutions[0], []);
        }
      } catch {
        console.error(`couldn't retore state: ${response}`);
        this.resetResponse();
      }
    }
  };

  getPossibleSolutionsForColor(
    color: string,
    surfaceToFill: number,
    possibleSolutions: { vlakken: (Vlak & { surface: number })[]; surfaceToFill: number }[]
  ) {
    const newPossibleSolutions: { vlakken: (Vlak & { surface: number })[]; surfaceToFill }[] = [];
    for (const previousSolution of possibleSolutions) {
      const possibleNewSolution = { ...previousSolution, surfaceToFill };
      for (const { surface, id } of previousSolution.vlakken.filter(
        (v) => v.surface <= possibleNewSolution.surfaceToFill && !v.color && v.surface <= surfaceToFill
      )) {
        const vlakToPaint = possibleNewSolution.vlakken.find((v) => !v.color && v.id === id && v.surface <= possibleNewSolution.surfaceToFill);
        if (vlakToPaint) {
          vlakToPaint.color = color;
          possibleNewSolution.surfaceToFill -= surface;
        }
      }
      newPossibleSolutions.push(possibleNewSolution);
    }

    return newPossibleSolutions
      .filter((p) => p.vlakken.find((vlak) => vlak.color === color) && p.surfaceToFill === 0)
      .map((vakken) => {
        return vakken;
      });
  }

  oncompleted = () => {
    this.store.unsubscribeAll();
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.store.getActions()
    });

  extractNumber(string: string): number {
    let numArray = string?.split("").map((item) => {
      if (typeof +item === "number" && !isNaN(+item)) return +item;
    });
    return numArray ? +numArray.join("") : 0;
  }

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
  sum<T>(list: T[], getKey: (item: T) => number) {
    return list.map((v) => getKey(v)).reduce((partial_sum, a) => partial_sum + a, 0);
  }

  round(value: any, decimals: number) {
    return parseFloat(parseFloat(value.toString()).toFixed(decimals));
  }
}

export default new App();
