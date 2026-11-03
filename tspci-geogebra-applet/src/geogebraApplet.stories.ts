import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

// GeoGebra comes from geogebra.org: the PCI loads deployggb.js in a frame of its own and reads window.GGBApplet of that
// frame (ggb.ts). The stories do not use the network: a stand-in GGBApplet is put in the PCI's frame (the srcdoc frame
// with <div id="ggb">) when the PCI looks at its window, so deployggb.js is never loaded. The stand-in applet keeps
// named objects, and the story changes them as the candidate would in GeoGebra.

type Listener = (...args: unknown[]) => void;
type GgbObject = { value: number | string; type: string };

class FakeApi {
  objects = new Map<string, GgbObject>();
  listeners: Record<string, Set<Listener>> = {};
  removed = false;
  constructor(base64?: string) {
    // a "file" of this stand-in: its objects as JSON
    if (base64?.startsWith("ggb:")) {
      for (const [name, o] of Object.entries(JSON.parse(base64.slice(4)) as Record<string, GgbObject>)) this.objects.set(name, o);
    }
  }
  getBase64(callback?: (base64: string) => void) {
    const value = "ggb:" + JSON.stringify(Object.fromEntries(this.objects));
    if (callback) callback(value);
    return value;
  }
  exists = (name: string) => this.objects.has(name);
  getValue = (name: string) => {
    const o = this.objects.get(name);
    return typeof o?.value === "number" ? o.value : NaN;
  };
  getValueString = (name: string) => {
    const o = this.objects.get(name);
    if (!o) return "";
    return o.type === "text" ? String(o.value) : `${name} = ${o.value}`;
  };
  getObjectType = (name: string) => this.objects.get(name)?.type ?? "";
  private on = (kind: string) => (this.listeners[kind] ??= new Set());
  registerUpdateListener = (fn: Listener) => this.on("Update").add(fn);
  registerAddListener = (fn: Listener) => this.on("Add").add(fn);
  registerRemoveListener = (fn: Listener) => this.on("Remove").add(fn);
  registerRenameListener = (fn: Listener) => this.on("Rename").add(fn);
  registerClearListener = (fn: Listener) => this.on("Clear").add(fn);
  registerStoreUndoListener = (fn: Listener) => this.on("StoreUndo").add(fn);
  unregisterUpdateListener = (fn: Listener) => this.on("Update").delete(fn);
  unregisterAddListener = (fn: Listener) => this.on("Add").delete(fn);
  unregisterRemoveListener = (fn: Listener) => this.on("Remove").delete(fn);
  unregisterRenameListener = (fn: Listener) => this.on("Rename").delete(fn);
  unregisterClearListener = (fn: Listener) => this.on("Clear").delete(fn);
  unregisterStoreUndoListener = (fn: Listener) => this.on("StoreUndo").delete(fn);
  setBase64() {}
  newConstruction() {}
  setSize() {}
  recalculateEnvironments() {}
  remove() {
    this.removed = true;
  }
  /** The candidate makes or changes an object in GeoGebra. */
  set(name: string, value: number | string, type = typeof value === "number" ? "numeric" : "text") {
    const added = !this.objects.has(name);
    this.objects.set(name, { value, type });
    this.on(added ? "Add" : "Update").forEach((fn) => fn(name));
  }
  /** How many of the PCI's listeners are registered. */
  listening = () => Object.values(this.listeners).reduce((n, s) => n + s.size, 0);
}

type FakeApplet = { parameters: Record<string, any>; api: FakeApi };
const ggb = {
  mode: "load" as "load" | "fail" | "never" | "hold",
  applets: [] as FakeApplet[],
  /** "hold": the applets wait for release(), so a story can see the PCI while GeoGebra is still loading */
  held: [] as (() => void)[],
  release() {
    ggb.mode = "load";
    ggb.held.splice(0).forEach((load) => load());
  },
};

class FakeGGBApplet {
  constructor(private parameters: Record<string, any>) {}
  inject(container: HTMLElement) {
    if (ggb.mode === "fail") throw new Error("no GeoGebra");
    const applet: FakeApplet = { parameters: this.parameters, api: new FakeApi(this.parameters.ggbBase64) };
    ggb.applets.push(applet);
    if (ggb.mode === "never") return;
    const app = container.ownerDocument.createElement("div");
    app.style.height = `${this.parameters.height}px`;
    container.appendChild(app);
    const load = () => setTimeout(() => this.parameters.appletOnLoad(applet.api), 0);
    if (ggb.mode === "hold") ggb.held.push(load);
    else load();
  }
}

/** Gives the PCI's applet frame the stand-in GGBApplet; returns the function that undoes it. */
const installFakeGeoGebra = () => {
  ggb.mode = "load";
  ggb.applets = [];
  ggb.held = [];
  const original = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow")!;
  Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
    configurable: true,
    get(this: HTMLIFrameElement) {
      const win = original.get!.call(this) as (Window & { GGBApplet?: unknown }) | null;
      if (win && this.srcdoc.includes('<div id="ggb">')) win.GGBApplet = FakeGGBApplet;
      return win;
    },
  });
  return () => {
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", original);
  };
};

const meta = {
  title: "GeoGebra applet",
  render: (args) => mountPci(pci, args),
  beforeEach: installFakeGeoGebra,
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

const loaded = async (root: ParentNode, count = 1) => {
  await waitFor(() => expect(ggb.applets).toHaveLength(count));
  await waitFor(() => expect(root.querySelector('[data-testid="loading"]')).toBeNull());
  return ggb.applets[count - 1];
};

const record = (values: { correct?: number | null; candidateResponse?: string | null; score?: number | null; maxscore?: number | null }) => [
  { name: "correct", base: values.correct == null ? null : { integer: values.correct } },
  { name: "candidateResponse", base: values.candidateResponse == null ? null : { string: values.candidateResponse } },
  { name: "score", base: values.score == null ? null : { integer: values.score } },
  { name: "maxscore", base: values.maxscore == null ? null : { integer: values.maxscore } },
];
const EMPTY = { record: record({}) };

export const Default: Story = {
  beforeEach: () => {
    ggb.mode = "hold";
  },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root, pci } = mounted;

    await step("a loading message until GeoGebra is there", async () => {
      expect(canvas.getByRole("status")).toHaveTextContent("Loading GeoGebra…");
      expect(canvas.getByRole("region", { name: "GeoGebra applet" })).toHaveAttribute("aria-busy", "true");
      ggb.release();
    });

    await step("an empty classic app with the candidate's settings", async () => {
      const applet = await loaded(root);
      expect(canvas.queryByRole("status")).toBeNull();
      expect(canvas.getByRole("region", { name: "GeoGebra applet" })).toHaveAttribute("aria-busy", "false");
      expect(canvas.getByTitle("GeoGebra applet").tagName).toBe("IFRAME");
      expect(applet.parameters).toMatchObject({
        id: "ggbApplet", appName: "classic", width: 800, height: 600, language: "en",
        showToolBar: true, showMenuBar: false, showAlgebraInput: true, allowStyleBar: false, enableRightClick: true,
        enableUndoRedo: true, showZoomButtons: true, enableShiftDragZoom: true, showFullscreenButton: false,
        enableFileFeatures: false, showResetIcon: false,
      });
      expect(applet.parameters).not.toHaveProperty("ggbBase64");
      expect(applet.parameters).not.toHaveProperty("material_id");
      // nothing reported yet
      expect(pci.getResponse()).toEqual(EMPTY);
      expect(mounted.changes).toHaveLength(0);
    });
  },
};

export const ReportsTheApplet: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { api } = await loaded(mounted.root);
    expect(api.listening()).toBe(6);

    await step("objects named correct, answer, score and maxscore are the response", async () => {
      api.set("correct", 1);
      api.set("answer", "(2, 3)", "point");
      api.set("score", 1.6);
      api.set("maxscore", 2);
      // one change, after the applet is quiet for a moment
      const value = await lastChange(mounted);
      expect(mounted.changes).toHaveLength(1);
      const expected = { record: record({ correct: 1, candidateResponse: "(2, 3)", score: 2, maxscore: 2 }) };
      expect(value).toEqual(expected);
      expect(mounted.pci.getResponse()).toEqual(expected);
    });

    await step("a text is reported as it is", async () => {
      api.set("answer", "x = 3", "text");
      api.set("correct", 0);
      await lastChange(mounted, 2);
      expect(mounted.pci.getResponse()).toEqual({ record: record({ correct: 0, candidateResponse: "x = 3", score: 2, maxscore: 2 }) });
    });
  },
};

export const SaveApplet: Story = {
  args: { properties: { saveApplet: "true" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { api } = await loaded(mounted.root);
    api.set("a", 5);
    await lastChange(mounted);
    expect(mounted.pci.getResponse()).toEqual({
      record: [...record({}), { name: "applet", base: { string: 'ggb:{"a":{"value":5,"type":"numeric"}}' } }],
    });
  },
};

export const Settings: Story = {
  args: {
    properties: {
      appName: "geometry", width: "5000", height: "100", appLanguage: "DE", showToolBar: "false", showMenuBar: "true",
      showAlgebraInput: "false", enableUndoRedo: "false", showFullscreenButton: "true",
      materialId: "https://www.geogebra.org/m/abcd1234",
    },
  },
  play: async ({ canvasElement }) => {
    const { root } = await openPci(canvasElement);
    const applet = await loaded(root);
    expect(applet.parameters).toMatchObject({
      appName: "geometry", width: 2000, height: 150, language: "de", showToolBar: false, showMenuBar: true,
      showAlgebraInput: false, enableUndoRedo: false, showFullscreenButton: true, material_id: "abcd1234",
    });
    expect(applet.parameters).not.toHaveProperty("ggbBase64");
  },
};

export const InvalidSettings: Story = {
  args: { properties: { appName: "spreadsheet", width: "wide", height: "", appLanguage: "dutch", materialId: "not an id!" } },
  play: async ({ canvasElement }) => {
    const { root } = await openPci(canvasElement);
    const applet = await loaded(root);
    // unknown app, sizes and language: the defaults; not a material id: an empty app
    expect(applet.parameters).toMatchObject({ appName: "classic", width: 800, height: 600, language: "en" });
    expect(applet.parameters).not.toHaveProperty("material_id");
  },
};

export const AuthoredApplet: Story = {
  args: { properties: { ggbBase64: 'ggb:{"maxscore":{"value":3,"type":"numeric"}}', materialId: "abcd1234", language: "nl" } },
  beforeEach: () => {
    ggb.mode = "hold";
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root } = mounted;
    expect(canvas.getByRole("status")).toHaveTextContent("GeoGebra wordt geladen…");
    ggb.release();
    const applet = await loaded(root);
    // the author's applet goes before a material; GeoGebra's language follows data-language without data-app-language
    expect(applet.parameters).toMatchObject({ ggbBase64: 'ggb:{"maxscore":{"value":3,"type":"numeric"}}', language: "nl" });
    expect(applet.parameters).not.toHaveProperty("material_id");
    expect(canvas.getByRole("region", { name: "GeoGebra-applet" })).toBeInTheDocument();
    // what the applet reports from the start
    expect(mounted.pci.getResponse()).toEqual({ record: record({ maxscore: 3 }) });
  },
};

export const LoadFailsAndRetry: Story = {
  beforeEach: () => {
    ggb.mode = "fail";
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root } = mounted;
    const alert = await canvas.findByRole("alert");
    expect(alert).toHaveTextContent("GeoGebra could not be loaded. Check the internet connection and try again.");
    expect(root.querySelector('[data-testid="applet"]')).not.toBeVisible();
    expect(mounted.pci.getResponse()).toEqual(EMPTY);

    // the connection is back
    ggb.mode = "load";
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    const { api } = await loaded(root);
    expect(canvas.queryByRole("alert")).toBeNull();
    api.set("correct", 1);
    expect(await lastChange(mounted)).toEqual({ record: record({ correct: 1 }) });
  },
};

export const StillLoading: Story = {
  beforeEach: () => {
    ggb.mode = "never";
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await waitFor(() => expect(ggb.applets).toHaveLength(1));
    expect(canvas.getByRole("status")).toHaveTextContent("Loading GeoGebra…");
    // the applet cannot be used until it is there
    expect(canvas.getByTestId("applet")).toHaveClass("pointer-events-none");
    expect(pci.getResponse()).toEqual(EMPTY);
    expect(JSON.parse(pci.getState())).toEqual({ applet: null, values: { correct: null, candidateResponse: null, score: null, maxscore: null } });
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    const { api } = await loaded(first.root);
    api.set("answer", "f(x) = 2x", "text");
    api.set("correct", 1);
    await lastChange(first);
    const state = first.pci.getState();
    const applet = 'ggb:{"answer":{"value":"f(x) = 2x","type":"text"},"correct":{"value":1,"type":"numeric"}}';
    expect(JSON.parse(state)).toEqual({ applet, values: { correct: 1, candidateResponse: "f(x) = 2x", score: null, maxscore: null } });

    const second = await remountPci(canvasElement, pci, { state });
    // the first applet is let go of
    await waitFor(() => expect(api.removed).toBe(true));
    expect(api.listening()).toBe(0);
    // before the applet is there, the saved values
    expect(second.pci.getResponse()).toEqual({ record: record({ correct: 1, candidateResponse: "f(x) = 2x" }) });
    const restored = await loaded(second.root, 2);
    expect(restored.parameters.ggbBase64).toBe(applet);
    expect(second.pci.getResponse()).toEqual({ record: record({ correct: 1, candidateResponse: "f(x) = 2x" }) });
    expect(second.changes).toHaveLength(0);
  },
};

const BOUND_APPLET = 'ggb:{"score":{"value":4,"type":"numeric"}}';

export const BoundResponse: Story = {
  args: {
    properties: { saveApplet: "true", ggbBase64: 'ggb:{"item":{"value":1,"type":"numeric"}}' },
    boundTo: { RESPONSE: { record: [...record({ score: 4 }), { name: "applet", base: { string: BOUND_APPLET } }] } },
  },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { root, pci } = mounted;

    await step("the candidate's applet from the response", async () => {
      const applet = await loaded(root);
      expect(applet.parameters.ggbBase64).toBe(BOUND_APPLET);
      expect(pci.getResponse()).toEqual({ record: [...record({ score: 4 }), { name: "applet", base: { string: BOUND_APPLET } }] });
    });

    await step("setResponse without an applet keeps the applet as it is", async () => {
      pci.setResponse({ record: record({ score: 1 }) });
      expect(ggb.applets).toHaveLength(1);
      expect(pci.getResponse().record[2]).toEqual({ name: "score", base: { integer: 4 } });
    });

    await step("setResponse with an applet starts that one", async () => {
      const other = 'ggb:{"score":{"value":7,"type":"numeric"}}';
      const before = mounted.changes.length;
      pci.setResponse({ record: [...record({ score: 7 }), { name: "applet", base: { string: other } }] });
      // the player is told about the new response, not the applet it replaces
      expect(await lastChange(mounted, before + 1)).toEqual({
        record: [...record({ score: 7 }), { name: "applet", base: { string: other } }],
      });
      const applet = await loaded(root, 2);
      expect(applet.parameters.ggbBase64).toBe(other);
      expect(pci.getResponse().record[2]).toEqual({ name: "score", base: { integer: 7 } });
    });

    await step("resetResponse starts the item's applet again", async () => {
      const before = mounted.changes.length;
      pci.resetResponse();
      // the player is told: no values, and no applet until the item's applet has loaded
      expect(await lastChange(mounted, before + 1)).toEqual({ record: [...record({}), { name: "applet", base: null }] });
      const applet = await loaded(root, 3);
      expect(applet.parameters.ggbBase64).toBe('ggb:{"item":{"value":1,"type":"numeric"}}');
      expect(pci.getResponse()).toEqual({
        record: [...record({}), { name: "applet", base: { string: 'ggb:{"item":{"value":1,"type":"numeric"}}' } }],
      });
    });
  },
};

// Authoring mode: an authoring system calls getAuthoringInstance instead of getInstance
export const Authoring: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { properties: { showToolBar: "false", showMenuBar: "false", appName: "graphing" } },
  beforeEach: () => {
    ggb.mode = "hold";
  },
  play: async ({ canvasElement, step }) => {
    const { instance, root, canvas, changes } = await openAuthoring(canvasElement);

    await step("the author gets every tool, in the app of the item", async () => {
      expect(instance.validate()).toEqual(["The applet is not loaded yet."]);
      expect(instance.getProperties()).toEqual({});
      ggb.release();
      const applet = await loaded(root);
      expect(applet.parameters).toMatchObject({ appName: "graphing", showToolBar: true, showMenuBar: true, allowStyleBar: true });
      expect(instance.validate()).toEqual([]);
      expect(canvas.getByTestId("reported")).toHaveTextContent("No objects named correct, answer, score or maxscore yet.");
    });

    await step("the objects the response reads are listed; getProperties gives the applet", async () => {
      const { api } = ggb.applets[0];
      api.set("correct", 0);
      api.set("answer", "", "text");
      await waitFor(() => expect(canvas.getByTestId("reported")).toHaveTextContent("Reported in the response: correct, answer"));
      expect(instance.getProperties()).toEqual({ ggbBase64: api.getBase64() });
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("a material id is checked, then loaded", async () => {
      const input = canvas.getByRole("textbox", { name: "GeoGebra material id or link" });
      await userEvent.type(input, "no id!");
      await userEvent.click(canvas.getByRole("button", { name: "Load material" }));
      expect(canvas.getByText("That is not a material id or a geogebra.org link.")).toBeInTheDocument();
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(ggb.applets).toHaveLength(1);

      await userEvent.type(input, "{Backspace>6/}https://www.geogebra.org/calculator/xyz789{Enter}");
      const applet = await loaded(root, 2);
      expect(applet.parameters.material_id).toBe("xyz789");
      expect(input).toHaveAttribute("aria-invalid", "false");
      // the earlier applet is let go of
      expect(ggb.applets[0].api.removed).toBe(true);
    });

    await step("start empty", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Start empty" }));
      const applet = await loaded(root, 3);
      expect(applet.parameters).not.toHaveProperty("material_id");
      expect(applet.parameters).not.toHaveProperty("ggbBase64");
    });
  },
};

export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { ggbBase64: 'ggb:{"score":{"value":1,"type":"numeric"}}', materialId: "abcd1234" } },
  play: async ({ canvasElement }) => {
    const { instance, root, canvas } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("textbox", { name: "Id of link van een GeoGebra-materiaal" })).toHaveValue("abcd1234");
    // the applet in the item goes before the material
    const applet = await loaded(root);
    expect(applet.parameters.ggbBase64).toBe('ggb:{"score":{"value":1,"type":"numeric"}}');
    expect(canvas.getByTestId("reported")).toHaveTextContent("In het antwoord: score");
    expect(instance.getProperties()).toEqual({ ggbBase64: 'ggb:{"score":{"value":1,"type":"numeric"}}' });
    expect(canvas.getByRole("button", { name: "Leeg beginnen" })).toBeInTheDocument();
  },
};
