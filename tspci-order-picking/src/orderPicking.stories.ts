import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import {
  afterPaint, focusedIn, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci,
  type PciArgs,
} from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Order picking",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

// the example order 2041: gloves M (B-05-2) 2, pens blue (A-02-1) 3, batteries AAA (C-02-2) 3, hand soap (B-03-1) 4,
// notebooks (A-05-2) 1, coffee cups (C-01-2) 2
const RIGHT = "cart: A-02-1=3, A-05-2=1, B-03-1=4, B-05-2=2, C-01-2=2, C-02-2=3";
const NAMES: Record<string, string> = {
  "B-05-2": "Gloves, size M", "B-05-3": "Gloves, size L", "A-02-1": "Ballpoint pens, blue", "C-02-2": "Batteries AAA", "B-03-1": "Hand soap 500 ml",
  "A-05-2": "Notebooks A5", "C-01-2": "Coffee cups",
};

type Field = { name: string; base?: { boolean?: boolean; integer?: number; float?: number; string?: string } };
const fields = (response: unknown) => ((response as { record?: Field[] })?.record ?? []);
/** The response as a plain object: { correct: true, lines: 6, picked: "cart: …", … } */
const plain = (response: unknown) =>
  Object.fromEntries(fields(response).map((f) => [f.name, f.base?.boolean ?? f.base?.integer ?? f.base?.float ?? f.base?.string]));
const recordWith = (picked: string) => ({ record: [{ name: "picked", base: { string: picked } }] });

const rack = (m: MountedPci, code: string) => m.canvas.getByRole("button", { name: new RegExp(`^(Rack|Stelling) ${code},`) });
const takeButton = (m: MountedPci, loc: string) => m.canvas.getByRole("button", { name: `Take 1: ${loc} ${NAMES[loc]}` }) as HTMLButtonElement;
const backButton = (m: MountedPci, loc: string) => m.canvas.getByRole("button", { name: `Put 1 back: ${loc} ${NAMES[loc]}` }) as HTMLButtonElement;

/** Walk to the rack of a location and take `count` units, as a pupil does with a mouse. */
async function pick(m: MountedPci, loc: string, count: number) {
  await userEvent.click(rack(m, loc.slice(0, 4)));
  for (let i = 0; i < count; i++) await userEvent.click(takeButton(m, loc));
}
/** A tap of a finger: pointer events of a touch, then the click the browser makes of it. */
async function tap(element: Element) {
  fireEvent.pointerDown(element, { pointerType: "touch", isPrimary: true });
  fireEvent.pointerUp(element, { pointerType: "touch", isPrimary: true });
  fireEvent.click(element);
  await afterPaint();
}
/** A key on an element inside the shadow root (userEvent.keyboard does not reach it). */
async function key(element: Element, name: string) {
  element.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, composed: true, cancelable: true }));
  await afterPaint();
}

/** Order picking to try out yourself (no test runs on it): with a mouse, a touchscreen or the keyboard. */
export const ToTry: Story = {
  name: "Order picking, to try",
  args: { properties: { route: "true", stock: "true" } },
};

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    const { canvas, pci } = m;
    expect(canvas.getByText(/^Pick the order\. Go to each location/)).toBeInTheDocument();
    expect(canvas.getByText("Order 2041")).toBeInTheDocument();
    const rows = canvas.getAllByRole("row");
    expect(rows).toHaveLength(7); // a header and six lines
    expect(within(rows[1]).getByText("B-05-2")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Gloves, size M")).toBeInTheDocument();
    // 3 aisles × 8 racks, with their codes written on them
    expect(canvas.getAllByRole("button", { name: /^Rack [A-C]-0\d,/ })).toHaveLength(24);
    expect(canvas.getByText("Tap a rack on the map to go there and see its shelves.")).toBeInTheDocument();
    // no route or stock: no shortage column, no steps
    expect(canvas.queryByRole("button", { name: /report a shortage/ })).toBeNull();
    expect(canvas.queryByTestId("walked")).toBeNull();
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const Picking: Story = {
  play: async ({ canvasElement, step }) => {
    const m = await openPci(canvasElement);
    const { canvas, pci } = m;

    await step("go to a rack: its shelves, with the location codes", async () => {
      await userEvent.click(rack(m, "B-05"));
      expect(rack(m, "B-05")).toHaveAttribute("aria-current", "location");
      const shelves = canvas.getByTestId("shelves");
      expect(within(shelves).getByRole("heading", { name: "Rack B-05" })).toBeInTheDocument();
      expect(within(shelves).getByText("Aisle B, left side")).toBeInTheDocument();
      expect(within(shelves).getByText("B-05-2")).toBeInTheDocument();
      expect(within(shelves).getByText("Gloves, size L")).toBeInTheDocument();
      expect(within(shelves).getByText("Empty")).toBeInTheDocument(); // B-05-1
      // looking is no answer yet
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("take two, and tick the line", async () => {
      await userEvent.click(takeButton(m, "B-05-2"));
      await userEvent.click(takeButton(m, "B-05-2"));
      expect(within(canvas.getByTestId("cart")).getByText(/Gloves, size M/)).toBeInTheDocument();
      await userEvent.click(canvas.getByRole("checkbox", { name: "Line 1 done" }));
      expect(plain(await lastChange(m))).toMatchObject({ correct: false, lines: 1, linesTotal: 6, wrongItems: 0, quantityErrors: 0, picked: "cart: B-05-2=2" });
    });

    await step("one too many, and put it back", async () => {
      await userEvent.click(takeButton(m, "B-05-2"));
      expect(plain(pci.getResponse())).toMatchObject({ lines: 0, quantityErrors: 1 });
      await userEvent.click(backButton(m, "B-05-2"));
      expect(plain(pci.getResponse())).toMatchObject({ lines: 1, quantityErrors: 0 });
    });

    await step("a wrong article: the gloves L", async () => {
      await userEvent.click(takeButton(m, "B-05-3"));
      expect(plain(pci.getResponse())).toMatchObject({ wrongItems: 1, picked: "cart: B-05-2=2, B-05-3=1" });
      await userEvent.click(backButton(m, "B-05-3"));
    });

    await step("the rest of the order", async () => {
      await pick(m, "A-02-1", 3);
      await pick(m, "C-02-2", 3);
      await pick(m, "B-03-1", 4);
      await pick(m, "A-05-2", 1);
      await pick(m, "C-01-2", 2);
      expect(plain(pci.getResponse())).toEqual({ correct: true, lines: 6, linesTotal: 6, wrongItems: 0, quantityErrors: 0, picked: RIGHT });
    });
  },
};

/** With a finger: a tap on a rack goes there, a tap on + takes one. */
export const Touch: Story = {
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    await tap(rack(m, "A-05"));
    expect(rack(m, "A-05")).toHaveAttribute("aria-current", "location");
    await tap(takeButton(m, "A-05-2"));
    await tap(m.canvas.getByRole("checkbox", { name: "Line 5 done" }));
    expect(plain(m.pci.getResponse())).toMatchObject({ lines: 1, picked: "cart: A-05-2=1" });
    expect(JSON.parse(m.pci.getState()).state.ticked).toEqual([5]);
  },
};

/** Without a mouse: one tab stop for the map, arrow keys between the racks, Enter to go; − moves the focus when it disables itself. */
export const Keyboard: Story = {
  play: async ({ canvasElement, step }) => {
    const m = await openPci(canvasElement);
    const { canvas, root } = m;
    const racks = canvas.getAllByRole("button", { name: /^Rack / });

    await step("one rack is the tab stop", async () => {
      expect(racks.filter((r) => r.getAttribute("tabindex") === "0").map((r) => r.getAttribute("data-rack"))).toEqual(["A-01"]);
    });

    await step("arrow keys walk the focus over the map", async () => {
      const first = rack(m, "A-01") as unknown as HTMLElement;
      first.focus();
      await key(first, "ArrowRight"); // across the aisle: A-02
      expect(focusedIn(root)?.getAttribute("data-rack")).toBe("A-02");
      await key(focusedIn(root)!, "ArrowRight"); // the next aisle: B-01
      await key(focusedIn(root)!, "ArrowUp"); // further from the front: B-03
      await key(focusedIn(root)!, "ArrowUp"); // B-05
      expect(focusedIn(root)?.getAttribute("data-rack")).toBe("B-05");
      expect(focusedIn(root)).toHaveAttribute("tabindex", "0");
    });

    await step("Enter goes there", async () => {
      await key(focusedIn(root)!, "Enter");
      expect(rack(m, "B-05")).toHaveAttribute("aria-current", "location");
      expect(within(canvas.getByTestId("shelves")).getByRole("heading", { name: "Rack B-05" })).toBeInTheDocument();
    });

    await step("− at 0 disables itself: the focus goes to +", async () => {
      takeButton(m, "B-05-2").focus();
      takeButton(m, "B-05-2").click();
      await afterPaint();
      const minus = backButton(m, "B-05-2");
      minus.focus();
      minus.click();
      await waitFor(() => expect(focusedIn(root)).toBe(takeButton(m, "B-05-2")));
      expect(minus).toBeDisabled();
    });
  },
};

/** With stock: the batteries AAA run short (3 asked, 2 on the shelf). */
export const Shortage: Story = {
  args: { properties: { stock: "true" } },
  play: async ({ canvasElement, step }) => {
    const m = await openPci(canvasElement);
    const { canvas, pci } = m;
    expect(canvas.getByText(/Too little on the shelf\? Take what there is and report a shortage\./)).toBeInTheDocument();

    await step("the shelf has two: + stops there", async () => {
      await userEvent.click(rack(m, "C-02"));
      expect(canvas.getByText("On the shelf: 2")).toBeInTheDocument();
      await userEvent.click(takeButton(m, "C-02-2"));
      await userEvent.click(takeButton(m, "C-02-2"));
      expect(canvas.getByText("On the shelf: 0")).toBeInTheDocument();
      expect(takeButton(m, "C-02-2")).toBeDisabled();
      expect(plain(pci.getResponse())).toMatchObject({ lines: 0, quantityErrors: 0, shortagesReported: 0 });
    });

    await step("report the shortage", async () => {
      const report = canvas.getByRole("button", { name: "Line 3: report a shortage" });
      await userEvent.click(report);
      expect(report).toHaveAttribute("aria-pressed", "true");
      expect(plain(pci.getResponse())).toMatchObject({ lines: 1, shortagesReported: 1, picked: "cart: C-02-2=2; short: 3" });
    });

    await step("a shortage that is none: that line is not right", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Line 1: report a shortage" }));
      expect(plain(pci.getResponse())).toMatchObject({ lines: 1, shortagesReported: 1, picked: "cart: C-02-2=2; short: 1, 3" });
    });
  },
};

/** A short route: the walk is drawn, the steps counted, and compared with the shortest route (28 steps). */
export const Route: Story = {
  args: { properties: { route: "true" } },
  play: async ({ canvasElement, step }) => {
    const m = await openPci(canvasElement);
    const { canvas, pci } = m;
    expect(canvas.getByText("You are at dispatch.")).toBeInTheDocument();

    await step("a good route: aisle A up, B down, then C", async () => {
      await pick(m, "A-02-1", 3);
      expect(canvas.getByTestId("walked")).toHaveTextContent("You walked 3 steps. Back to dispatch: 3 more.");
      await pick(m, "A-05-2", 1);
      await pick(m, "B-05-2", 2);
      await pick(m, "B-03-1", 4);
      await pick(m, "C-01-2", 2);
      await pick(m, "C-02-2", 3);
      expect(m.root.querySelector("polyline.walk")).not.toBeNull();
      expect(plain(pci.getResponse())).toEqual({
        correct: true, lines: 6, linesTotal: 6, wrongItems: 0, quantityErrors: 0, routeLength: 28, shortestRoute: 28, picked: RIGHT,
      });
    });

    await step("a detour: every rack you go to counts", async () => {
      await userEvent.click(rack(m, "A-07"));
      expect(plain(pci.getResponse())).toMatchObject({ correct: false, routeLength: 36, shortestRoute: 28 });
    });
  },
};

/** A margin: a route up to 8 steps longer still counts as short. */
export const RouteMargin: Story = {
  args: { properties: { route: "true", routeMargin: "8" } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    for (const loc of ["A-02-1", "A-05-2", "B-05-2", "B-03-1", "C-01-2", "C-02-2"]) await pick(m, loc, { "A-02-1": 3, "A-05-2": 1, "B-05-2": 2, "B-03-1": 4, "C-01-2": 2, "C-02-2": 3 }[loc]!);
    await userEvent.click(rack(m, "A-07"));
    expect(plain(m.pci.getResponse())).toMatchObject({ correct: true, routeLength: 36 });
  },
};

/** The check task: a picked roll cage, and the pupil judges every tote. */
export const Check: Story = {
  args: { properties: { task: "check" } },
  play: async ({ canvasElement, step }) => {
    const m = await openPci(canvasElement);
    const { canvas, pci } = m;
    expect(canvas.getByText(/^Check the roll cage\./)).toBeInTheDocument();
    const totes = canvas.getByTestId("totes");
    expect(within(totes).getByRole("listitem", { name: "Tote 1" })).toHaveTextContent("Gloves, size L");
    expect(within(totes).getByRole("listitem", { name: "Tote 5" })).toHaveTextContent("Empty");
    expect(canvas.queryByRole("group", { name: "Warehouse" })).toBeNull();
    expect(pci.getResponse()).toBeUndefined();
    const choose = (line: number, name: string) => userEvent.click(within(canvas.getByRole("radiogroup", { name: `Line ${line}: your check` })).getByRole("radio", { name }));

    await step("judging, tote by tote", async () => {
      await choose(1, "Wrong number");
      expect(plain(await lastChange(m))).toEqual({ correct: false, lines: 0, linesTotal: 6, wrongItems: 0, quantityErrors: 0, picked: "check: 1=quantity, 2=?, 3=?, 4=?, 5=?, 6=?" });
      await choose(1, "Wrong article");
      await choose(2, "Right");
      await choose(3, "Wrong number");
      await choose(4, "Right");
      await choose(5, "Missing");
      await choose(6, "Right");
      expect(plain(pci.getResponse())).toEqual({
        correct: true, lines: 6, linesTotal: 6, wrongItems: 1, quantityErrors: 1, picked: "check: 1=article, 2=ok, 3=quantity, 4=ok, 5=missing, 6=ok",
      });
    });
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", stock: "true", route: "true", title: "Orderpicken" } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    const { canvas } = m;
    expect(canvas.getByText(/^Pick de order\./)).toBeInTheDocument();
    expect(canvas.getByText("Picklijst")).toBeInTheDocument();
    expect(canvas.getByText("Handschoenen maat M")).toBeInTheDocument();
    expect(canvas.getByText("Je bent bij de expeditie.")).toBeInTheDocument();
    await userEvent.click(rack(m, "C-02"));
    expect(canvas.getByText("In het vak: 2")).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Pak 1: C-02-2 Batterijen AAA" })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Regel 3: tekort melden" })).toBeInTheDocument();
    expect(canvas.getByText("Gang C, rechterkant")).toBeInTheDocument();
  },
};

export const RestoreState: Story = {
  args: { properties: { route: "true" } },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await pick(first, "A-02-1", 2);
    await userEvent.click(rack(first, "B-07"));
    await userEvent.click(first.canvas.getByRole("checkbox", { name: "Line 2 done" }));
    const state = first.pci.getState();
    const response = first.pci.getResponse();

    // the pupil comes back to the item: everything is as they left it, also where they are and the way they walked
    const second = await remountPci(canvasElement, pci, { state, properties: { route: "true" } });
    expect(second.pci.getResponse()).toEqual(response);
    expect(rack(second, "B-07")).toHaveAttribute("aria-current", "location");
    expect(second.canvas.getByRole("checkbox", { name: "Line 2 done" })).toBeChecked();
    expect(second.canvas.getByTestId("walked")).toHaveTextContent("You walked 11 steps.");
  },
};

/** A state of another warehouse or task (the author changed the item), or not of this PCI: start afresh. */
export const ForeignState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await pick(first, "A-02-1", 1);
    const state = first.pci.getState();
    const other = await remountPci(canvasElement, pci, { state, properties: { task: "check" } });
    expect(other.pci.getResponse()).toBeUndefined();
    const foreign = await remountPci(canvasElement, pci, { state: "not a state of this PCI" });
    expect(foreign.pci.getResponse()).toBeUndefined();
  },
};

export const BoundResponse: Story = {
  args: { properties: { stock: "true" }, boundTo: { RESPONSE: recordWith("cart: A-02-1=3, C-02-2=2; short: 3") } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(within(m.canvas.getByTestId("cart")).getByText(/Batteries AAA/)).toBeInTheDocument();
    expect(m.canvas.getByRole("button", { name: "Line 3: report a shortage" })).toHaveAttribute("aria-pressed", "true");
    expect(plain(m.pci.getResponse())).toMatchObject({ lines: 2, shortagesReported: 1, picked: "cart: A-02-1=3, C-02-2=2; short: 3" });
  },
};

/** The correct response of the item, read-only: the roll cage, every line ticked, the shortest route drawn. */
export const Solution: Story = {
  args: {
    status: "solution",
    properties: { route: "true", stock: "true" },
    responseDeclaration: { correctResponse: { value: pci.getCorrectResponse!({ route: "true", stock: "true" } as never) } },
  },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(plain(m.pci.getResponse())).toMatchObject({ correct: true, routeLength: 28, shortestRoute: 28, shortagesReported: 1 });
    for (const box of m.canvas.getAllByRole("checkbox")) {
      expect(box).toBeChecked();
      expect(box).toBeDisabled();
    }
    expect(m.canvas.queryAllByRole("button", { name: /^Rack / })).toHaveLength(0); // the map only shows
    expect(m.root.querySelector("polyline.walk")).not.toBeNull();
  },
};

/** Without a correct response in the item, the PCI shows the right judgement of every tote. */
export const SolutionCheck: Story = {
  args: { status: "solution", properties: { task: "check" } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(plain(m.pci.getResponse())).toMatchObject({ correct: true, lines: 6 });
    expect(within(m.canvas.getByRole("radiogroup", { name: "Line 5: your check" })).getByRole("radio", { name: "Missing" })).toBeChecked();
  },
};

export const Review: Story = {
  args: { status: "review", boundTo: { RESPONSE: recordWith("cart: A-02-1=3, B-05-3=2") } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(within(m.canvas.getByTestId("cart")).getByText(/Gloves, size L/)).toBeInTheDocument();
    expect(plain(m.pci.getResponse())).toMatchObject({ lines: 1, wrongItems: 1 });
    for (const box of m.canvas.getAllByRole("checkbox")) expect(box).toBeDisabled();
  },
};

/** The correct response follows from the settings; set as the response, it gives the same response back. */
export const CorrectResponse: Story = {
  args: { properties: { route: "true", stock: "true" } },
  play: async ({ canvasElement }) => {
    const correct = (properties: Record<string, string>) => plain(pci.getCorrectResponse!(properties as never));
    expect(correct({})).toEqual({ correct: true, lines: 6, linesTotal: 6, wrongItems: 0, quantityErrors: 0, picked: RIGHT });
    expect(correct({ route: "true", stock: "true" })).toEqual({
      correct: true, lines: 6, linesTotal: 6, wrongItems: 0, quantityErrors: 0, shortagesReported: 1, routeLength: 28, shortestRoute: 28,
      picked: "cart: A-02-1=3, A-05-2=1, B-03-1=4, B-05-2=2, C-01-2=2, C-02-2=2; short: 3",
    });
    expect(correct({ task: "check" })).toMatchObject({ correct: true, wrongItems: 1, quantityErrors: 1, picked: "check: 1=article, 2=ok, 3=quantity, 4=ok, 5=missing, 6=ok" });

    const m = await openPci(canvasElement);
    const response = pci.getCorrectResponse!({ route: "true", stock: "true" } as never)!;
    m.pci.setResponse(response);
    await waitFor(() => expect(m.pci.getResponse()).toEqual(response));
  },
};

export const Validity: Story = {
  play: async ({ canvasElement }) => {
    const { pci } = await openPci(canvasElement);
    expect(pci.checkValidity()).toBe(true);
    pci.setCustomValidity("Pick the whole order.");
    expect(pci.getCustomValidity()).toBe("Pick the whole order.");
    expect(pci.checkValidity()).toBe(false);
    pci.setCustomValidity("");
    expect(pci.checkValidity()).toBe(true);
  },
};

/** A pick task and a check task on one page: each keeps its own state and response. */
export const TwoInstances: Story = {
  render: () => {
    const page = document.createElement("div");
    for (const [id, properties] of [["first", {}], ["second", { task: "check", title: "Second" }]] as const) {
      const slot = document.createElement("div");
      slot.dataset.slot = id;
      slot.appendChild(mountPci(pci, { properties }));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=first]")!);
    const second = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=second]")!);
    expect(first.pci).not.toBe(second.pci);
    await pick(first, "A-05-2", 1);
    await userEvent.click(within(second.canvas.getByRole("radiogroup", { name: "Line 2: your check" })).getByRole("radio", { name: "Right" }));
    expect(plain(first.pci.getResponse())).toMatchObject({ lines: 1, picked: "cart: A-05-2=1" });
    expect(plain(second.pci.getResponse())).toMatchObject({ lines: 1, picked: "check: 1=?, 2=ok, 3=?, 4=?, 5=?, 6=?" });
    // the radios of the two have their own names
    expect(within(first.root as unknown as HTMLElement).queryAllByRole("radio")).toHaveLength(0);
  },
};

/** The pick task with route and stock, halfway (example.png). */
export const Example: Story = {
  args: { width: 960, properties: { route: "true", stock: "true", title: "Order picking", language: "en" } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    await pick(m, "A-02-1", 3);
    await userEvent.click(m.canvas.getByRole("checkbox", { name: "Line 2 done" }));
    await pick(m, "A-05-2", 1);
    await userEvent.click(m.canvas.getByRole("checkbox", { name: "Line 5 done" }));
    await pick(m, "B-05-2", 1);
    expect(plain(m.pci.getResponse())).toMatchObject({ lines: 2 });
  },
};

// ---- the authoring mode ----

type Authoring = StoryObj<AuthoringArgs>;
const warehouseOf = (instance: { getProperties: () => Record<string, string> }) => JSON.parse(instance.getProperties().warehouse);

export const AuthoringWarehouse: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);

    await step("starts from the example, ready", async () => {
      expect(canvas.getByRole("heading", { name: "Set up the warehouse and the order" })).toBeInTheDocument();
      expect(instance.validate()).toEqual([]);
      expect(canvas.getByTestId("authoring-status")).toHaveTextContent("Shortest route: 28 steps");
      expect(warehouseOf(instance).order.lines).toHaveLength(6);
    });

    await step("a rack clicked: its shelves to fill", async () => {
      await userEvent.click(canvas.getByRole("button", { name: /^Rack C-08,/ }));
      const editor = canvas.getByTestId("rack-editor");
      expect(within(editor).getByRole("heading", { name: "Shelves of rack C-08" })).toBeInTheDocument();
      await userEvent.click(within(editor).getAllByRole("button", { name: /Add a product/ })[0]); // the top shelf: C-08-3
      await userEvent.type(canvas.getByRole("textbox", { name: "C-08-3: article number" }), "30899");
      await userEvent.type(canvas.getByRole("textbox", { name: "C-08-3: description" }), "Light bulbs");
      await userEvent.type(canvas.getByRole("textbox", { name: "C-08-3: unit" }), "box of 10");
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "C-08-3: picture" }), "box");
      await retype(canvas.getByRole("spinbutton", { name: "C-08-3: stock" }), "5");
      expect(warehouseOf(instance).products).toContainEqual({ loc: "C-08-3", article: "30899", name: "Light bulbs", unit: "box of 10", picture: "box", stock: 5 });
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("a line added for it, and one removed", async () => {
      await userEvent.click(canvas.getByRole("button", { name: /Add a line/ }));
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Line 7: location" }), "C-08-3");
      await retype(canvas.getByRole("spinbutton", { name: "Line 7: number" }), "2");
      expect(warehouseOf(instance).order.lines.at(-1)).toEqual({ loc: "C-08-3", qty: 2 });
      expect(canvas.getByTestId("authoring-status")).toHaveTextContent("Shortest route: 32 steps");
      await userEvent.click(canvas.getByRole("button", { name: "Remove line 1" }));
      expect(warehouseOf(instance).order.lines[0]).toEqual({ loc: "A-02-1", qty: 3 });
      expect(warehouseOf(instance).cart[0]).toEqual({ loc: "A-02-1", qty: 3 }); // the totes move along with their lines
    });

    await step("what keeps Done from finishing", async () => {
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Line 2: location" }), "A-02-1");
      expect(instance.validate()).toEqual(["Line 2: an earlier line has the same article."]);
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Line 2: location" }), "C-02-2");
      expect(instance.validate()).toEqual([]);
      await retype(canvas.getByRole("spinbutton", { name: "Racks on each side of an aisle" }), "2");
      expect(instance.validate()).toContain("8 product(s) are outside the warehouse: make it bigger, or the products are dropped.");
      await retype(canvas.getByRole("spinbutton", { name: "Racks on each side of an aisle" }), "4");
      expect(instance.validate()).toEqual([]);
    });
  },
};

/** The roll cage of the check task: what is in each tote, and what the check of it is. */
export const AuthoringCheck: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { task: "check" } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    const status = canvas.getByTestId("authoring-status");
    // tote 1 holds the gloves L for the gloves M
    expect(canvas.getByRole("combobox", { name: "Tote 1: taken from" })).toHaveValue("B-05-3");
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Tote 1: taken from" }), "B-05-2");
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Tote 3: taken from" }), "");
    expect(warehouseOf(instance).cart.slice(0, 3)).toEqual([{ loc: "B-05-2", qty: 2 }, { loc: "A-02-1", qty: 3 }, null]);
    // a roll cage without mistakes is a note, not a problem
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Tote 3: taken from" }), "C-02-2");
    await retype(canvas.getByRole("spinbutton", { name: "Tote 3: number" }), "3");
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Tote 5: taken from" }), "A-05-2");
    expect(status).toHaveTextContent("the roll cage of the check task has no mistakes");
    expect(instance.validate()).toEqual([]);
  },
};

/** The keyboard in the authoring mode: the map is one tab stop with the arrow keys, here too. */
export const AuthoringKeyboard: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement }) => {
    const { canvas, root } = await openAuthoring(canvasElement);
    const first = canvas.getByRole("button", { name: /^Rack A-01,/ });
    first.focus();
    await key(first, "ArrowUp");
    expect(focusedIn(root)?.getAttribute("data-rack")).toBe("A-03");
    await key(focusedIn(root)!, " ");
    expect(within(canvas.getByTestId("rack-editor")).getByRole("heading", { name: "Shelves of rack A-03" })).toBeInTheDocument();
  },
};

export const AuthoringDutch: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { language: "nl", stock: "true" } },
  play: async ({ canvasElement }) => {
    const { canvas, instance } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("heading", { name: "Magazijn en order instellen" })).toBeInTheDocument();
    expect(canvas.getByTestId("authoring-status")).toHaveTextContent("Regels met te weinig voorraad: 3.");
    expect(warehouseOf(instance).products[0].name).toBe("Kopieerpapier A4");
  },
};

/** An item with the author's own warehouse: two aisles without a back corridor. */
export const OwnWarehouse: Story = {
  args: {
    properties: {
      route: "true",
      warehouse: JSON.stringify({
        aisles: 2, depth: 3, shelves: 2, back: false,
        products: [
          { loc: "A-01-1", article: "501", name: "Hammer", unit: "piece", picture: "box", stock: 4 },
          { loc: "B-06-2", article: "502", name: "Tape measure", unit: "piece", picture: "tape", stock: 9 },
        ],
        order: { number: "77", for: "Workshop", lines: [{ loc: "B-06-2", qty: 1 }, { loc: "A-01-1", qty: 2 }] },
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(m.canvas.getAllByRole("button", { name: /^Rack / })).toHaveLength(12);
    await userEvent.click(rack(m, "A-01"));
    await userEvent.click(m.canvas.getByRole("button", { name: "Take 1: A-01-1 Hammer" }));
    await userEvent.click(m.canvas.getByRole("button", { name: "Take 1: A-01-1 Hammer" }));
    await userEvent.click(rack(m, "B-06"));
    await userEvent.click(m.canvas.getByRole("button", { name: "Take 1: B-06-2 Tape measure" }));
    // no back corridor: A-01 is 3 steps from dispatch, B-06 another 7 (down, across, up), and 8 back
    expect(plain(m.pci.getResponse())).toMatchObject({ correct: true, lines: 2, routeLength: 18, shortestRoute: 18 });
  },
};
