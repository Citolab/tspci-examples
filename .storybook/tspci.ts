import { userEvent, waitFor, within, type queries } from "storybook/test";

// What the harness uses of a PCI; the full types are in @citolab/tspci of each example
type QtiVariableJSON = Record<string, any>;
type IMSpci = {
  getInstance: (dom: HTMLElement, config: any, state?: string) => unknown;
  getResponse: () => QtiVariableJSON | undefined;
  getState: () => string;
  oncompleted?: () => void;
};

/**
 * The delivery system for the stories: it mounts a PCI the way a QTI player does (getInstance with a config, and
 * a state from an earlier session) and hands a play function what a player sees of it.
 *
 *   const meta = { render: (args) => mountPci(pci, args) } satisfies Meta<PciArgs>;
 *   play: async ({ canvasElement }) => {
 *     const { canvas, pci, changes } = await openPci(canvasElement);
 *     await userEvent.click(canvas.getByRole("button", { name: "Add" }));
 *     expect(pci.getResponse()).toEqual(...);
 *   }
 */

/** The arguments of a story: what the item hands the PCI. */
export type PciArgs = {
  /** data- attributes of the interaction (camelCase, as strings), on top of the defaults of config.json */
  properties?: Record<string, string>;
  /** "interacting" (default), "review", "solution" or "closed" */
  status?: "interacting" | "review" | "solution" | "closed";
  /** a state from getState() of an earlier session */
  state?: string;
  /** the response the player hands back, by response identifier */
  boundTo?: Record<string, QtiVariableJSON>;
  /** the response declaration, with its correct response */
  responseDeclaration?: Record<string, unknown>;
  /** width of the item the PCI sits in, in pixels (default 900) */
  width?: number;
};

export type MountedPci = {
  /** the instance onready handed the player */
  pci: IMSpci & Record<string, any>;
  /** the element the PCI was mounted on (qti-interaction-markup in a player) */
  host: HTMLElement;
  /** the shadow root the PCI renders in, or the host when the PCI has none */
  root: ShadowRoot | HTMLElement;
  /** testing-library queries within the PCI */
  canvas: ReturnType<typeof within<typeof queries>>;
  /** the value of every qti-interaction-changed event, oldest first */
  changes: unknown[];
};

const RESPONSE = "RESPONSE";
const mounted = new WeakMap<HTMLElement, Promise<MountedPci>>();
const running = new Set<MountedPci>();

/**
 * Mounts a new instance of the PCI (the module's default export registers one; each story gets its own) and returns
 * its element. The PCI gets its getInstance once the element is in the page, as in a player.
 */
export function mountPci(registered: IMSpci, args: PciArgs = {}): HTMLElement {
  const host = document.createElement("div");
  host.className = "tspci-host";
  host.style.width = `${args.width ?? 900}px`;
  host.style.maxWidth = "100%";
  // A closed shadow root (tspci-vanilla-js) is the PCI's own business in a player, but would hide it from the tests
  const attachShadow = host.attachShadow.bind(host);
  host.attachShadow = (init: ShadowRootInit) => attachShadow({ ...init, mode: "open" });

  const changes: unknown[] = [];
  host.addEventListener("qti-interaction-changed", (e: Event) => {
    changes.push((e as CustomEvent<{ value: unknown }>).detail?.value);
  });

  mounted.set(
    host,
    new Promise<MountedPci>((resolve, reject) => {
      const start = () => {
        if (!host.isConnected) return requestAnimationFrame(start);
        // the PCIs of earlier stories are gone from the page: end them as a player would
        for (const other of running) {
          if (!other.host.isConnected) {
            other.pci.oncompleted?.();
            running.delete(other);
          }
        }
        const instance = new (registered.constructor as new () => IMSpci)();
        const config = {
          properties: { ...(args.properties ?? {}) },
          responseIdentifier: RESPONSE,
          boundTo: args.boundTo ?? {},
          status: args.status ?? "interacting",
          responseDeclaration: args.responseDeclaration,
          onready: (ready?: IMSpci) => {
            const pci = (ready ?? instance) as MountedPci["pci"];
            const root = host.shadowRoot ?? host;
            const record = { pci, host, root, canvas: within(root as unknown as HTMLElement), changes };
            running.add(record);
            resolve(record);
          },
        };
        try {
          instance.getInstance(host, config, args.state);
        } catch (error) {
          reject(error);
        }
      };
      start();
    })
  );
  return host;
}

/** The PCI a story mounted in this canvas, once it is ready (onready). */
export async function openPci(canvasElement: HTMLElement, timeout = 10000): Promise<MountedPci> {
  const host = await waitFor(
    () => {
      const found = canvasElement.querySelector<HTMLElement>(".tspci-host");
      if (!found || !mounted.has(found)) throw new Error("no PCI mounted in this story");
      return found;
    },
    { timeout }
  );
  let timer: ReturnType<typeof setTimeout>;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`the PCI did not call onready within ${timeout} ms`)), timeout);
  });
  const ready = await Promise.race([mounted.get(host)!, late]).finally(() => clearTimeout(timer));
  await afterPaint();
  return ready;
}

/**
 * Preact runs effects (such as useStore's subscription to the store) after the next paint: a click before that changes
 * the store, but not what the candidate sees. A candidate is never that fast; a test is.
 */
/**
 * The element with the focus in a PCI: in its shadow root, or, for a PCI without one, in the document. (testing-library's
 * toHaveFocus looks at document.activeElement, which is the host when the focus is in a shadow root.)
 */
export const focusedIn = (root: ShadowRoot | HTMLElement): Element | null =>
  root instanceof ShadowRoot ? root.activeElement : root.ownerDocument.activeElement;

export const afterPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

/**
 * Ends the PCI in this canvas and mounts a new one with the given args, as a player does when the candidate comes
 * back to the item: `await remountPci(canvasElement, pci, { state: first.pci.getState() })`.
 */
export async function remountPci(canvasElement: HTMLElement, registered: IMSpci, args: PciArgs = {}) {
  const previous = canvasElement.querySelector<HTMLElement>(".tspci-host");
  previous?.remove();
  canvasElement.appendChild(mountPci(registered, args));
  return openPci(canvasElement);
}

/**
 * Replaces the text of an input or textarea, as the candidate selecting it and typing. (userEvent.clear does not work
 * in a shadow root: it looks for the focus in document.activeElement, which is the host.)
 */
export async function retype(input: HTMLElement, text: string) {
  const length = (input as HTMLInputElement).value?.length ?? 0;
  await userEvent.type(input, text, { initialSelectionStart: 0, initialSelectionEnd: length });
}

/** Waits until the PCI has told the player about a change, and returns the value of the last one. */
export async function lastChange(mountedPci: MountedPci, count = 1) {
  await waitFor(() => {
    if (mountedPci.changes.length < count) throw new Error(`expected ${count} qti-interaction-changed event(s), got ${mountedPci.changes.length}`);
  });
  return mountedPci.changes[mountedPci.changes.length - 1];
}

/** The arguments of an authoring story: what an authoring system hands getAuthoringInstance. */
export type AuthoringArgs = {
  /** the item's settings (data- attributes), on top of the defaults of config.json */
  properties?: Record<string, string>;
  /** language of the authoring system ("en", "nl") */
  language?: string;
  /** width of the authoring panel, in pixels (default 900) */
  width?: number;
};

export type MountedAuthoring = {
  /** the authoring instance onready handed the authoring system: getConfig, validate, destroy */
  instance: { getConfig: () => Record<string, string>; validate: () => string[]; destroy?: () => void } & Record<string, any>;
  host: HTMLElement;
  root: ShadowRoot | HTMLElement;
  canvas: ReturnType<typeof within<typeof queries>>;
  /** what the PCI passed onchange, oldest first */
  changes: unknown[];
};

const authoring = new WeakMap<HTMLElement, Promise<MountedAuthoring>>();

/** Mounts the authoring mode of a new instance of the PCI (getAuthoringInstance), as an authoring system does. */
export function mountAuthoring(registered: IMSpci, args: AuthoringArgs = {}): HTMLElement {
  const host = document.createElement("div");
  host.className = "tspci-authoring";
  host.style.width = `${args.width ?? 900}px`;
  host.style.maxWidth = "100%";
  const attachShadow = host.attachShadow.bind(host);
  host.attachShadow = (init: ShadowRootInit) => attachShadow({ ...init, mode: "open" });

  const changes: unknown[] = [];
  authoring.set(
    host,
    new Promise<MountedAuthoring>((resolve, reject) => {
      const start = () => {
        if (!host.isConnected) return requestAnimationFrame(start);
        const instance = new (registered.constructor as new () => IMSpci & Record<string, any>)();
        if (!instance.getAuthoringInstance) return reject(new Error("this PCI has no authoring mode (getAuthoringInstance)"));
        try {
          instance.getAuthoringInstance(host, {
            properties: { ...(args.properties ?? {}) },
            language: args.language,
            onchange: (value: unknown) => changes.push(value),
            onready: (ready: MountedAuthoring["instance"]) => {
              const root = host.shadowRoot ?? host;
              resolve({ instance: ready, host, root, canvas: within(root as unknown as HTMLElement), changes });
            },
          });
        } catch (error) {
          reject(error);
        }
      };
      start();
    })
  );
  return host;
}

/** The authoring mode a story mounted in this canvas, once it is ready (onready) and painted. */
export async function openAuthoring(canvasElement: HTMLElement, timeout = 10000): Promise<MountedAuthoring> {
  const host = await waitFor(
    () => {
      const found = canvasElement.querySelector<HTMLElement>(".tspci-authoring");
      if (!found || !authoring.has(found)) throw new Error("no authoring mode mounted in this story");
      return found;
    },
    { timeout }
  );
  const ready = await authoring.get(host)!;
  await afterPaint();
  return ready;
}
