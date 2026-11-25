/*
 * A Portable Custom Interaction (PCI) with Preact, Tailwind and a store.
 *
 * The delivery engine (the player) loads this bundle, which registers a factory with qtiCustomInteractionContext.
 * For every interaction in an item the engine calls factory.getInstance(dom, config, state); the instance renders
 * into `dom` and reports its answer through getResponse().
 *
 * This file is the PCI API; interaction.tsx is the UI, store.ts the state. A ratio table: two rows with a label and
 * values, arrows between the columns. The answer is the number in the answer cell (the bottom-right cell, or the one
 * the author marked with "?"), shown again in the read-only answer below the table. The response is a record (see
 * config.tspci.response in package.json and AUTHORING.md), by the `mode` setting:
 * - answer: { answer: 8.4, working: true }; the item's correct response holds the answer
 * - working: also answerCorrect (against the correctAnswer setting) and the checks of the working (working.ts)
 * - tool: no response; the table is scratch paper, never scored (config.tspci.toolWhen)
 * The table itself (labels, cells, arrows) is kept in the state, so a rater can see it.
 */
import "preact/debug"; // readable warnings in the browser console while developing
import { render } from "preact";
import { Action, IStore, Listener } from "@citolab/preact-store";
import { media } from "@citolab/tspci/media";
import { ConfigProperties, IMSpci, IMSpciFactory, PciProperties, QtiInteractionChangedDetail, QtiRecordItem, QtiVariableJSON } from "@citolab/tspci";
import * as ctx from "qtiCustomInteractionContext"; // provided by the delivery engine at runtime
import configProps from "./config.json"; // the settings; the build passes only their defaults (AUTHORING.md)
import style from "./styles.css"; // Tailwind, compiled to a string, added to the shadow root below
import Interaction from "./interaction";
import { Actions, StateModel, answerCell, answerOf, initStore, parseNumber, parseValues, startState } from "./store";
import { checkWorking, sameNumber } from "./working";

// Like every data- attribute, each setting arrives as a string.
type PropTypes = PciProperties<typeof configProps>;

/** What getState() saves: the state and the actions that led to it. */
type PciStoredState = { state: StateModel; log: Action<unknown>[] };

const isTool = (properties: Partial<PropTypes>) => properties.mode === "tool";

/**
 * The response for the table: undefined while the answer cell has no number (nothing answered, nothing reported), and
 * in tool mode. One answer, one response: "8,40", "8.4" and "8.40" all report 8.4, and the checks of the working do
 * not depend on the route the student took.
 */
function toResponse(state: StateModel, properties: Partial<PropTypes>): QtiVariableJSON | undefined {
  const answer = parseNumber(answerOf(state));
  if (isTool(properties) || answer === undefined) return undefined;
  const checks = checkWorking(state);
  const record: QtiRecordItem[] = [
    { name: "answer", base: { float: answer } },
    { name: "working", base: { boolean: checks.working } },
  ];
  if (properties.mode === "working") {
    const correct = parseNumber(properties.correctAnswer ?? "");
    if (correct !== undefined) record.push({ name: "answerCorrect", base: { boolean: sameNumber(answer, correct) } });
    for (const name of ["ratio", "steps", "stepsMatch"] as const) record.push({ name, base: { boolean: checks[name] } });
  }
  return { record };
}

/**
 * The correct response for the settings (getCorrectResponse): only in "working" mode, with a correct answer. Then the
 * answer is that number and every check is true. In "answer" mode the author answers the PCI (AUTHORING.md, section 4).
 */
function correctResponse(properties: Partial<PropTypes>): QtiVariableJSON | undefined {
  const p = { ...(configProps as unknown as PropTypes), ...properties };
  const correct = parseNumber(p.correctAnswer ?? "");
  if (p.mode !== "working" || correct === undefined) return undefined;
  const yes = (name: string): QtiRecordItem => ({ name, base: { boolean: true } });
  return { record: [{ name: "answer", base: { float: correct } }, yes("working"), yes("answerCorrect"), yes("ratio"), yes("steps"), yes("stepsMatch")] };
}

/**
 * The text for the answer cell from a response (setResponse, boundTo) or a correct response (status "solution"): the
 * `answer` field of a record, or a plain number.
 */
function fromResponse(value: unknown): string {
  if (Array.isArray(value)) return fromResponse(value[0]);
  if (value && typeof value === "object") {
    const { record, base } = value as { record?: { name: string }[]; base?: QtiVariableJSON["base"] };
    if (Array.isArray(record)) return fromResponse(record.find((field) => field.name === "answer"));
    return fromResponse(base?.float ?? base?.integer ?? base?.string);
  }
  return value === undefined || value === null ? "" : String(value);
}

class PciInstance implements IMSpci<PropTypes> {
  typeIdentifier = "ratioTable";
  private config: ConfigProperties<PropTypes>;
  private dom: HTMLElement;
  private shadowdom: ShadowRoot;
  private store: IStore<StateModel, Actions>;
  private customValidity = "";

  constructor(dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString?: string) {
    if (!dom) throw new Error("No DOM Element provided");
    // The item's data- attributes override the defaults from config.json.
    config.properties = { ...(configProps as unknown as PropTypes), ...config.properties };
    this.dom = dom;
    this.config = config;
    // A closed shadow root keeps the item's CSS out and ours (Tailwind) in.
    this.shadowdom = dom.attachShadow({ mode: "closed" });
    loadFonts(dom);

    // 0. The table at the start: what the author gives (labels, numbers, columns) in place.
    const p = config.properties;
    this.store = initStore(
      startState({
        columns: Number.parseInt(p.columns, 10) || undefined,
        labels: [p.labelTop, p.labelBottom],
        values: [parseValues(p.valuesTop), parseValues(p.valuesBottom)],
      })
    );
    // 1. The state from a previous session (whatever getState() returned) wins over the settings.
    if (stateString) {
      try {
        const { state, log } = JSON.parse(stateString) as PciStoredState;
        if (isState(state) && Array.isArray(log)) this.store.restoreState(state, log);
      } catch {
        // not ours: start from the settings
      }
    }
    // 2. A response the engine binds to the interaction (boundTo) wins over the state.
    const boundTo = config.boundTo ?? {};
    const bound = boundTo[config.responseIdentifier] ?? (Object.keys(boundTo).length === 1 ? Object.values(boundTo)[0] : undefined);
    if (bound) this.setResponse(bound);
    // 3. Status "solution": show the correct response of the item instead (AUTHORING.md, "Correct answers").
    if (config.status === "solution") this.showCorrectResponse();

    // From here on, tell the engine when anything changes: the response, or only the state (a label, an arrow).
    this.previousState = JSON.stringify(this.store.getState());
    this.unsubscribe = this.store.subscribe(this.onStoreChange);

    this.render();
    config.onready?.(this, this.getState());
  }

  private previousState: string;
  private unsubscribe = () => {};
  /**
   * Every change of the state is an event, also one that leaves the response as it is: an engine (and the preview)
   * then calls getState() again, so the working is saved too.
   */
  private onStoreChange: Listener<StateModel> = (state) => {
    const json = JSON.stringify(state);
    if (json === this.previousState) return; // subscribe() calls us right away, and an action may change nothing
    this.previousState = json;
    // composed lets the event cross the shadow root
    const detail: QtiInteractionChangedDetail = {
      interaction: this,
      responseIdentifier: this.config.responseIdentifier,
      valid: this.checkValidity(),
      value: this.getResponse(),
    };
    this.dom.dispatchEvent(new CustomEvent("qti-interaction-changed", { bubbles: true, composed: true, detail }));
  };

  private render = () => {
    const readOnly = ["review", "solution", "closed"].includes(this.config.status ?? "interacting");
    render(
      <>
        <style>{style}</style>
        <Interaction config={this.config.properties} store={this.store} readOnly={readOnly} />
      </>,
      this.shadowdom
    );
    this.input?.setCustomValidity(this.customValidity);
  };

  /** The input of the answer cell (data-answer in interaction.tsx). */
  private get input() {
    return this.shadowdom.querySelector<HTMLInputElement>("input[data-answer]");
  }

  /** Put a response in the answer cell. Only a change is an action: keeps the log (and a replay) clean. */
  private setValue = (value: string) => {
    const state = this.store.getState();
    if (value !== answerOf(state)) this.store.dispatch({ type: "SET_CELL", payload: { ...answerCell(state), value } });
  };

  /** Show the correct response the item declares (status "solution"); without one, keep what is there. */
  showCorrectResponse = () => {
    const correct = this.config.responseDeclaration?.correctResponse?.value;
    if (correct !== undefined) this.setValue(fromResponse(correct));
  };

  // ---- the IMS PCI API ----

  getResponse = () => toResponse(this.store.getState(), this.config.properties);

  getState = () => JSON.stringify({ state: this.store.getState(), log: this.store.getActions() } satisfies PciStoredState);

  setResponse = (response: QtiVariableJSON) => this.setValue(fromResponse(response));

  checkValidity = () => this.input?.checkValidity() ?? true;

  reportValidity = () => this.input?.reportValidity() ?? true;

  setCustomValidity = (message: string) => {
    this.customValidity = message ?? "";
    this.input?.setCustomValidity(this.customValidity);
  };

  getCustomValidity = () => this.customValidity;

  /** The engine is done with this instance: unsubscribe and unmount (which also runs the components' cleanups). */
  oncompleted = () => {
    this.unsubscribe();
    render(null, this.shadowdom);
  };
}

const factory: IMSpciFactory<PropTypes> = {
  typeIdentifier: "ratioTable", // the same as config.tspci.typeIdentifier in package.json
  getInstance: (dom, config, state) => new PciInstance(dom, config, state),
  // From the settings in "working" mode (the correctAnswer setting); otherwise the author answers the PCI.
  getCorrectResponse: (properties) => correctResponse(properties),
};

/** A saved state of this version of the PCI (an older or foreign one is ignored: the table starts from the settings). */
const isState = (state: Partial<StateModel> | undefined): state is StateModel =>
  typeof state?.columns === "number" &&
  Array.isArray(state.cells) &&
  Array.isArray(state.given) &&
  Array.isArray(state.labelsGiven) &&
  "answerAt" in state;

/**
 * Roboto, the font of the explanation the table follows, bundled (config.tspci.media). Fonts declared in a shadow root
 * are not used, so the faces go to the document, under a name of our own that does not touch the page's fonts.
 */
let fontsLoaded = false; // once per page, also with several tables on it
function loadFonts(dom: HTMLElement) {
  if (fontsLoaded || typeof FontFace === "undefined") return;
  fontsLoaded = true;
  for (const [name, weight] of [["roboto400", "400"], ["roboto500", "500"], ["roboto900", "900"]] as const) {
    const face = new FontFace("RatioTable Roboto", `url(${media(name, dom)})`, { weight });
    face.load().then((loaded) => document.fonts.add(loaded)).catch(() => {}); // the fallback fonts will do
  }
}

// Register with the engine: as an AMD module (qtiCustomInteractionContext), or through the global some engines set.
type Context = { register: (factory: IMSpciFactory<PropTypes>) => void };
const engineContext = [ctx as unknown as Context, (globalThis as { qtiCustomInteractionContext?: Context }).qtiCustomInteractionContext].find(
  (c) => typeof c?.register === "function"
);
engineContext?.register(factory);

export default factory;
