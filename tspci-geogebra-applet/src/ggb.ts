// GeoGebra is not bundled: deployggb.js is loaded from geogebra.org when the PCI starts, and it loads the app itself.
// Written from GeoGebra's public documentation (Apps API, App Parameters, Apps Embedding).

export const DEPLOY_URL = "https://www.geogebra.org/apps/deployggb.js";

/** The part of the GeoGebra Apps API this PCI uses. */
export interface GgbApi {
  getBase64(): string;
  getBase64(callback: (base64: string) => void): void;
  setBase64(base64: string, callback?: () => void): void;
  getValue(name: string): number;
  getValueString(name: string, localized?: boolean): string;
  exists(name: string): boolean;
  getObjectType(name: string): string;
  registerUpdateListener(fn: (...args: unknown[]) => void): void;
  registerAddListener(fn: (...args: unknown[]) => void): void;
  registerRemoveListener(fn: (...args: unknown[]) => void): void;
  registerRenameListener(fn: (...args: unknown[]) => void): void;
  registerClearListener(fn: (...args: unknown[]) => void): void;
  registerStoreUndoListener(fn: (...args: unknown[]) => void): void;
  unregisterUpdateListener(fn: (...args: unknown[]) => void): void;
  unregisterAddListener(fn: (...args: unknown[]) => void): void;
  unregisterRemoveListener(fn: (...args: unknown[]) => void): void;
  unregisterRenameListener(fn: (...args: unknown[]) => void): void;
  unregisterClearListener(fn: (...args: unknown[]) => void): void;
  unregisterStoreUndoListener(fn: (...args: unknown[]) => void): void;
  newConstruction(): void;
  setSize(width: number, height: number): void;
  recalculateEnvironments(): void;
  remove(): void;
}

type GgbAppletCtor = new (parameters: Record<string, unknown>, html5?: boolean) => { inject: (container: HTMLElement | string) => void };
type GgbWindow = Window & { GGBApplet?: GgbAppletCtor };

/** Loads deployggb.js in `win` (the applet's own frame). */
const loadDeployGgb = (win: GgbWindow, timeoutMs: number): Promise<GgbAppletCtor> => {
  if (win.GGBApplet) return Promise.resolve(win.GGBApplet);
  return new Promise<GgbAppletCtor>((resolve, reject) => {
    const script = win.document.createElement("script");
    script.src = DEPLOY_URL;
    script.async = true;
    const fail = (message: string) => {
      clearTimeout(timer);
      script.remove();
      reject(new Error(message));
    };
    const timer = setTimeout(() => fail("timeout"), timeoutMs);
    script.onload = () => {
      clearTimeout(timer);
      if (win.GGBApplet) resolve(win.GGBApplet);
      else fail("GGBApplet missing");
    };
    script.onerror = () => fail("network");
    win.document.head.appendChild(script);
  });
};

/** The settings that shape the applet (config.json), parsed. */
export type AppletSettings = {
  appName: string;
  width: number;
  height: number;
  appLanguage: string;
  showToolBar: boolean;
  showMenuBar: boolean;
  showAlgebraInput: boolean;
  allowStyleBar: boolean;
  enableRightClick: boolean;
  enableUndoRedo: boolean;
  showZoomButtons: boolean;
  enableShiftDragZoom: boolean;
  showFullscreenButton: boolean;
};

/** Where the applet starts from: a .ggb file (base64), a geogebra.org material, or nothing (an empty app). */
export type AppletSource = { ggbBase64: string } | { materialId: string } | null;

const APPS = ["classic", "graphing", "geometry", "3d", "suite", "scientific", "evaluator", "notes"];
const bool = (value: unknown, fallback: boolean) =>
  value === true || value === false ? value : value === "true" ? true : value === "false" ? false : fallback;
const int = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && String(value).trim() !== "" ? Math.min(max, Math.max(min, n)) : fallback;
};

export const parseSettings = (p: Record<string, string>, uiLanguage: string): AppletSettings => ({
  appName: APPS.includes(p.appName) ? p.appName : "classic",
  width: int(p.width, 800, 200, 2000),
  height: int(p.height, 600, 150, 2000),
  appLanguage: /^[a-z]{2}$/i.test((p.appLanguage ?? "").trim()) ? p.appLanguage.trim().toLowerCase() : (uiLanguage || "en").slice(0, 2),
  showToolBar: bool(p.showToolBar, true),
  showMenuBar: bool(p.showMenuBar, false),
  showAlgebraInput: bool(p.showAlgebraInput, true),
  allowStyleBar: bool(p.allowStyleBar, false),
  enableRightClick: bool(p.enableRightClick, true),
  enableUndoRedo: bool(p.enableUndoRedo, true),
  showZoomButtons: bool(p.showZoomButtons, true),
  enableShiftDragZoom: bool(p.enableShiftDragZoom, true),
  showFullscreenButton: bool(p.showFullscreenButton, false),
});

/** A material id from an id or a link (geogebra.org/m/abcd1234, geogebra.org/calculator/abcd1234). */
export const materialIdFrom = (text: string) => {
  const trimmed = (text ?? "").trim();
  const match = trimmed.match(/geogebra\.org\/(?:m|material\/show\/id|calculator|classic|graphing|geometry|3d)\/([A-Za-z0-9]+)/);
  if (match) return match[1];
  return /^[A-Za-z0-9]+$/.test(trimmed) ? trimmed : "";
};

const SCALE_CLASS = "ggb-scale";

/**
 * A frame of its own for the applet. GeoGebra looks its elements up in the document and adds its styles to the
 * document's head, which does not work inside the shadow roots a QTI player puts a PCI in. A srcdoc frame has the
 * page's origin, so the PCI talks to the applet's API directly.
 */
export const createFrame = (title: string) => {
  const frame = document.createElement("iframe");
  frame.title = title;
  frame.setAttribute("allow", "fullscreen");
  frame.style.cssText = "display:block;width:100%;height:0;border:0;";
  frame.srcdoc =
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
    `<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}` +
    `.${SCALE_CLASS}{width:100%}</style></head>` +
    `<body><div class="${SCALE_CLASS}"><div id="ggb"></div></div></body></html>`;
  return frame;
};

/** Waits until the frame's document is there (the frame has to be in the page). */
const frameReady = (frame: HTMLIFrameElement) =>
  new Promise<Window>((resolve, reject) => {
    const ready = () => frame.contentDocument?.getElementById("ggb");
    if (ready()) return resolve(frame.contentWindow);
    const timer = setTimeout(() => reject(new Error("frame")), 10000);
    frame.addEventListener("load", () => {
      clearTimeout(timer);
      ready() ? resolve(frame.contentWindow) : reject(new Error("frame"));
    }, { once: true });
  });

/** Keeps the frame as high as the (scaled) applet in it; returns a function that stops. */
const followHeight = (frame: HTMLIFrameElement, win: Window) => {
  const inner = win.document.querySelector(`.${SCALE_CLASS}`) as HTMLElement;
  const fit = () => {
    const height = Math.ceil(inner.getBoundingClientRect().height);
    if (height > 0) frame.style.height = `${height}px`;
  };
  const RO = (win as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver ?? ResizeObserver;
  const observer = new RO(fit);
  observer.observe(inner);
  fit();
  return () => observer.disconnect();
};

/**
 * Starts an applet in `frame` (createFrame, already in the page). Resolves with the API when the applet is loaded;
 * `stop` ends the frame's height following.
 */
export const injectApplet = async (
  frame: HTMLIFrameElement,
  settings: AppletSettings,
  source: AppletSource,
  timeoutMs = 30000
): Promise<{ api: GgbApi; stop: () => void }> => {
  const win = (await frameReady(frame)) as GgbWindow;
  const GGBApplet = await loadDeployGgb(win, timeoutMs);
  const api = await new Promise<GgbApi>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    const parameters: Record<string, unknown> = {
      id: "ggbApplet",
      appName: settings.appName,
      width: settings.width,
      height: settings.height,
      language: settings.appLanguage,
      showToolBar: settings.showToolBar,
      showMenuBar: settings.showMenuBar,
      showAlgebraInput: settings.showAlgebraInput,
      allowStyleBar: settings.allowStyleBar,
      enableRightClick: settings.enableRightClick,
      enableUndoRedo: settings.enableUndoRedo,
      showZoomButtons: settings.showZoomButtons,
      enableShiftDragZoom: settings.enableShiftDragZoom,
      showFullscreenButton: settings.showFullscreenButton,
      showResetIcon: false,
      enableFileFeatures: false,
      showStartTooltip: false,
      preventFocus: true,
      scaleContainerClass: SCALE_CLASS,
      allowUpscale: false,
      borderColor: "#FFFFFF",
      appletOnLoad: (loaded: GgbApi) => {
        clearTimeout(timer);
        resolve(loaded);
      },
    };
    if (source && "ggbBase64" in source) parameters.ggbBase64 = source.ggbBase64;
    else if (source && "materialId" in source) parameters.material_id = source.materialId;
    try {
      new GGBApplet(parameters, true).inject(win.document.getElementById("ggb"));
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
  return { api, stop: followHeight(frame, win) };
};

/** Calls `onChange` (debounced) after every change in the applet; returns a function that stops listening. */
export const listen = (api: GgbApi, onChange: () => void, delayMs = 400) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, delayMs);
  };
  const kinds = ["Update", "Add", "Remove", "Rename", "Clear", "StoreUndo"] as const;
  for (const kind of kinds) {
    try {
      api[`register${kind}Listener`](changed);
    } catch {
      // an older app without this listener
    }
  }
  return () => {
    clearTimeout(timer);
    for (const kind of kinds) {
      try {
        api[`unregister${kind}Listener`](changed);
      } catch {
        // already gone
      }
    }
  };
};

/** What the applet reports: its objects named correct, answer, score and maxscore (README). */
export type AppletValues = {
  correct: number | null;
  candidateResponse: string | null;
  score: number | null;
  maxscore: number | null;
};

export const EMPTY_VALUES: AppletValues = { correct: null, candidateResponse: null, score: null, maxscore: null };

const number = (api: GgbApi, name: string) => {
  if (!api.exists(name)) return null;
  const value = api.getValue(name);
  return Number.isFinite(value) ? Math.round(value) : null;
};

/** The value of an object as text: a text as it is, anything else without its "answer = " in front. */
const text = (api: GgbApi, name: string) => {
  if (!api.exists(name)) return null;
  const value = String(api.getValueString(name, false) ?? "");
  if (api.getObjectType(name) === "text") return value;
  return value.replace(new RegExp(`^\\s*${name}\\s*(=|:)\\s*`), "");
};

export const readValues = (api: GgbApi): AppletValues => ({
  correct: number(api, "correct"),
  candidateResponse: text(api, "answer"),
  score: number(api, "score"),
  maxscore: number(api, "maxscore"),
});
