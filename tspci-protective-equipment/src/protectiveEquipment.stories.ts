import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  afterPaint, focusedIn, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, type AuthoringArgs, type MountedPci, type PciArgs,
} from "../../.storybook/tspci";
import pci from "./index";
import { ITEM_IDS, serializeCustomJob, type ItemId } from "./equipment";

const meta = {
  title: "Protective equipment",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

// ---- what the stories look at, inside the PCI's shadow root ----

const $ = <T extends Element = HTMLElement>(mounted: MountedPci, selector: string) => {
  const found = mounted.root.querySelector<T>(selector);
  if (!found) throw new Error(`no ${selector} in the PCI`);
  return found;
};
/** The toggle button of an item in the rack. */
const rackItem = (mounted: MountedPci, id: ItemId) => $<HTMLButtonElement>(mounted, `.rack-item[data-item="${id}"]`);
const figure = (mounted: MountedPci) => $<SVGSVGElement>(mounted, "svg[data-figure]");
/** What the worker wears, as drawn on the figure, in drawing order. */
const onWorker = (mounted: MountedPci) => Array.from(figure(mounted).querySelectorAll<SVGGElement>("[data-worn]")).map((g) => g.dataset.worn);
const wornItem = (mounted: MountedPci, id: ItemId) => $<SVGGElement>(mounted, `[data-worn="${id}"]`);

/** Puts items on (or takes them off) by a click on them in the rack. */
async function tap(mounted: MountedPci, ...ids: ItemId[]) {
  for (const id of ids) await userEvent.click(rackItem(mounted, id));
}

type Field = { name: string; base?: Record<string, unknown> };
/** The record as { field: value }, for comparing. */
const fields = (response: unknown) => Object.fromEntries(((response as { record?: Field[] })?.record ?? []).map((f) => [f.name, Object.values(f.base ?? {})[0]]));
const itemsRecord = (items: string, reasons?: string) => ({
  record: [{ name: "items", base: { string: items } }, ...(reasons === undefined ? [] : [{ name: "reasons", base: { string: reasons } }])],
});

/** Pointer events as a mouse or a finger makes them: press on `from`, move in a few steps to `to`, release. */
async function dragTo(from: Element, to: { x: number; y: number }, pointerType = "mouse", pointerId = 7) {
  const start = from.getBoundingClientRect();
  const x0 = start.left + start.width / 2;
  const y0 = start.top + start.height / 2;
  const fire = (type: string, x: number, y: number) =>
    from.dispatchEvent(
      new PointerEvent(type, { bubbles: true, composed: true, cancelable: true, pointerId, pointerType, button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: y, isPrimary: true })
    );
  fire("pointerdown", x0, y0);
  for (let i = 1; i <= 5; i++) {
    fire("pointermove", x0 + ((to.x - x0) * i) / 5, y0 + ((to.y - y0) * i) / 5);
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  fire("pointerup", to.x, to.y);
  // a browser sends a click after pointerup on the same element: it must not undo the drag
  from.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, cancelable: true, clientX: to.x, clientY: to.y }));
  await afterPaint();
}
const middleOf = (element: Element) => {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
};
const touchAction = (element: Element) => getComputedStyle(element).touchAction;

// ---- the stories ----

/** The PCI to try out yourself (no test runs on it): with a mouse, a touchscreen or the keyboard. */
export const ToTry: Story = {
  name: "Protective equipment, to try",
  args: { properties: { explain: "true" } },
};

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    // the job on a card, and the instruction
    expect($(mounted, "[data-job-text]")).toHaveTextContent("You grind the rough edges off a steel beam with an angle grinder, in the workshop.");
    expect(canvas.getByText(/^Dress the worker with the protective equipment this job needs, and no more\./)).toBeInTheDocument();
    // the rack: every item a toggle button, by zone, each with its mandatory sign
    expect(canvas.getByRole("region", { name: "Protective equipment" })).toBeInTheDocument();
    const buttons = Array.from(mounted.root.querySelectorAll<HTMLButtonElement>(".rack-item"));
    expect(buttons.map((b) => b.dataset.item)).toEqual(ITEM_IDS);
    for (const button of buttons) {
      expect(button).toHaveAttribute("aria-pressed", "false");
      expect(button.querySelector("svg[data-sign]")).not.toBeNull();
    }
    expect(canvas.getByRole("button", { name: "Safety goggles", pressed: false })).toBeInTheDocument();
    expect(canvas.getByRole("heading", { name: "Fall arrest" })).toBeInTheDocument();
    // the worker wears nothing yet: nothing answered
    expect(canvas.getByRole("img", { name: "The worker wears no protective equipment yet." })).toBeInTheDocument();
    expect(onWorker(mounted)).toEqual([]);
    expect(pci.getResponse()).toBeUndefined();
    // no explain question
    expect(mounted.root.querySelector("[data-why]")).toBeNull();
  },
};

/** Tapping or clicking items in the rack: on, off, and the response after every change. */
export const Tapping: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { pci, canvas } = mounted;

    await step("a tap puts an item on: pressed in the rack, drawn on the worker, said for a screen reader", async () => {
      await tap(mounted, "goggles");
      expect(rackItem(mounted, "goggles")).toHaveAttribute("aria-pressed", "true");
      expect(onWorker(mounted)).toEqual(["goggles"]);
      expect($(mounted, "[data-describe]")).toHaveTextContent("The worker wears: safety goggles.");
      expect(fields(pci.getResponse())).toEqual({ required: 1, requiredTotal: 4, wrong: 0, correct: false, items: "goggles" });
      expect(fields(await lastChange(mounted))).toEqual({ required: 1, requiredTotal: 4, wrong: 0, correct: false, items: "goggles" });
    });

    await step("everything the job needs: correct", async () => {
      await tap(mounted, "earMuffs", "workGloves", "safetyShoes");
      expect(fields(pci.getResponse())).toEqual({ required: 4, requiredTotal: 4, wrong: 0, correct: true, items: "goggles,earMuffs,workGloves,safetyShoes" });
      expect(canvas.getByRole("img", { name: "The worker wears: safety goggles, ear muffs, work gloves and safety shoes (S3)." })).toBeInTheDocument();
      // trainers off, safety shoes on
      expect(onWorker(mounted)).toEqual(["safetyShoes", "workGloves", "earMuffs", "goggles"]);
    });

    await step("one pair of gloves: cut-resistant gloves replace the work gloves", async () => {
      await tap(mounted, "cutGloves");
      expect(rackItem(mounted, "workGloves")).toHaveAttribute("aria-pressed", "false");
      expect(rackItem(mounted, "cutGloves")).toHaveAttribute("aria-pressed", "true");
      expect(fields(pci.getResponse())).toMatchObject({ correct: true, items: "goggles,earMuffs,cutGloves,safetyShoes" });
    });

    await step("more than needed: a helmet is wrong here; a tap takes it off again", async () => {
      await tap(mounted, "helmet");
      expect(fields(pci.getResponse())).toMatchObject({ required: 4, wrong: 1, correct: false });
      await tap(mounted, "helmet");
      expect(fields(pci.getResponse())).toMatchObject({ wrong: 0, correct: true });
    });

    await step("a tap on an item on the worker takes it off; nothing worn is no answer", async () => {
      await userEvent.click(wornItem(mounted, "goggles"));
      expect(rackItem(mounted, "goggles")).toHaveAttribute("aria-pressed", "false");
      expect(fields(pci.getResponse())).toMatchObject({ required: 3, correct: false });
      for (const id of ["earMuffs", "cutGloves", "safetyShoes"] as ItemId[]) await tap(mounted, id);
      expect(onWorker(mounted)).toEqual([]);
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

/** Dragging with a mouse: from the rack onto the worker (it snaps to its zone), and off the worker. */
export const Dragging: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);

    await step("ear muffs dragged onto the worker, anywhere on it: on the ears", async () => {
      const fig = figure(mounted).getBoundingClientRect();
      await dragTo(rackItem(mounted, "earMuffs"), { x: fig.left + fig.width / 2, y: fig.bottom - 40 });
      await waitFor(() => expect(onWorker(mounted)).toEqual(["earMuffs"]));
      // the click after the drag did not take them off again
      expect(rackItem(mounted, "earMuffs")).toHaveAttribute("aria-pressed", "true");
    });

    await step("while dragging, the zone of the item is outlined on the worker", async () => {
      const from = rackItem(mounted, "safetyShoes");
      const start = middleOf(from);
      const to = middleOf(figure(mounted));
      const fire = (type: string, x: number, y: number) =>
        from.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, cancelable: true, pointerId: 8, button: 0, buttons: 1, clientX: x, clientY: y, isPrimary: true }));
      fire("pointerdown", start.x, start.y);
      fire("pointermove", (start.x + to.x) / 2, (start.y + to.y) / 2);
      fire("pointermove", to.x, to.y);
      await afterPaint();
      expect(mounted.root.querySelector('.zone-box[data-zone="feet"]')).not.toBeNull();
      expect(mounted.root.querySelector(".drag-ghost svg[data-icon=safetyShoes]")).not.toBeNull();
      fire("pointerup", to.x, to.y);
      await afterPaint();
      expect(mounted.root.querySelector(".zone-box")).toBeNull();
      expect(onWorker(mounted)).toEqual(["safetyShoes", "earMuffs"]);
    });

    await step("dropped next to the worker, nothing happens", async () => {
      await dragTo(rackItem(mounted, "helmet"), middleOf(rackItem(mounted, "harness")));
      expect(onWorker(mounted)).toEqual(["safetyShoes", "earMuffs"]);
    });

    await step("dragged off the worker, it comes off", async () => {
      await dragTo(wornItem(mounted, "earMuffs"), middleOf(rackItem(mounted, "harness")));
      await waitFor(() => expect(onWorker(mounted)).toEqual(["safetyShoes"]));
      // dragged and dropped on the worker itself: it stays on
      await dragTo(wornItem(mounted, "safetyShoes"), middleOf(figure(mounted)));
      expect(onWorker(mounted)).toEqual(["safetyShoes"]);
    });
  },
};

/** A finger: a tap that moves a little is a tap, a drag is a drag, a pinch is neither; the page scrolls outside the pictures. */
export const Touch: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const finger = (target: Element, type: string, x: number, y: number, pointerId = 21) =>
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, cancelable: true, pointerId, pointerType: "touch", button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: y, isPrimary: pointerId === 21 }));

    await step("only the picture of an item stops the page from scrolling; the figure only once the worker wears something", async () => {
      expect(touchAction($(mounted, `.rack-item[data-item="goggles"] .rack-pic`))).toBe("none");
      expect(touchAction(rackItem(mounted, "goggles"))).not.toBe("none");
      expect(touchAction(figure(mounted))).not.toBe("none");
      // targets of at least 44 px
      const box = rackItem(mounted, "goggles").getBoundingClientRect();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    });

    await step("a tap whose finger moves 6 px is a tap", async () => {
      const button = rackItem(mounted, "goggles");
      const { x, y } = middleOf(button);
      finger(button, "pointerdown", x, y);
      finger(button, "pointermove", x + 4, y + 4);
      finger(button, "pointerup", x + 4, y + 4);
      button.click(); // the browser's click after the tap
      await afterPaint();
      expect(onWorker(mounted)).toEqual(["goggles"]);
      expect(touchAction(figure(mounted))).toBe("none");
    });

    await step("a drag of a finger onto the worker", async () => {
      await dragTo(rackItem(mounted, "hiVis"), middleOf(figure(mounted)), "touch", 22);
      await waitFor(() => expect(onWorker(mounted)).toEqual(["hiVis", "goggles"]));
    });

    await step("a second finger makes it a pinch: nothing is dragged", async () => {
      const button = rackItem(mounted, "harness");
      const { x, y } = middleOf(button);
      const to = middleOf(figure(mounted));
      finger(button, "pointerdown", x, y, 21);
      finger(button, "pointerdown", x + 30, y, 23);
      finger(button, "pointermove", to.x, to.y, 21);
      finger(button, "pointerup", to.x, to.y, 21);
      await afterPaint();
      expect(onWorker(mounted)).toEqual(["hiVis", "goggles"]);
    });

    await step("a scroll the browser takes over (pointercancel) does nothing", async () => {
      const button = rackItem(mounted, "harness");
      const { x, y } = middleOf(button);
      finger(button, "pointerdown", x, y);
      finger(button, "pointermove", x, y - 40);
      finger(button, "pointercancel", x, y - 40);
      await afterPaint();
      expect(onWorker(mounted)).toEqual(["hiVis", "goggles"]);
      expect(mounted.root.querySelector(".drag-ghost")).toBeNull();
    });
  },
};

/** Keyboard: every item in the rack is a toggle button (Enter or Space); the focus stays on it. */
export const Keyboard: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    for (const id of ITEM_IDS) {
      expect(rackItem(mounted, id).tagName).toBe("BUTTON");
      expect(rackItem(mounted, id).tabIndex).toBe(0);
    }
    // the worker choice comes first, then the rack in the order of the body
    const tabbables = Array.from(mounted.root.querySelectorAll<HTMLElement>("button")).filter((b) => b.tabIndex === 0);
    expect(tabbables[0]).toHaveAttribute("role", "radio");
    expect(tabbables[1]).toBe(rackItem(mounted, "helmet"));
    // Enter on a button is a click (userEvent.keyboard does not reach into the shadow root)
    rackItem(mounted, "faceShield").focus();
    rackItem(mounted, "faceShield").click();
    await waitFor(() => expect(rackItem(mounted, "faceShield")).toHaveAttribute("aria-pressed", "true"));
    expect(focusedIn(mounted.root)).toBe(rackItem(mounted, "faceShield"));
    rackItem(mounted, "faceShield").click();
    await waitFor(() => expect(rackItem(mounted, "faceShield")).toHaveAttribute("aria-pressed", "false"));
    expect(focusedIn(mounted.root)).toBe(rackItem(mounted, "faceShield"));
  },
};

/** The pupil chooses one of three workers (arrow keys too); the choice is kept in the state, not in the response. */
export const WorkerChoice: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByRole("radiogroup", { name: "Worker" })).toBeInTheDocument();
    expect(canvas.getByRole("radio", { name: "Worker 1" })).toHaveAttribute("aria-checked", "true");
    expect(figure(mounted).querySelector("[data-worker='1']")).not.toBeNull();
    await userEvent.click(canvas.getByRole("radio", { name: "Worker 3" }));
    expect(figure(mounted).querySelector("[data-worker='3']")).not.toBeNull();
    // ArrowRight wraps to the first one, and the focus follows
    const third = canvas.getByRole("radio", { name: "Worker 3" });
    third.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    await waitFor(() => expect(canvas.getByRole("radio", { name: "Worker 1" })).toHaveAttribute("aria-checked", "true"));
    await waitFor(() => expect(focusedIn(mounted.root)).toBe(canvas.getByRole("radio", { name: "Worker 1" })));
    expect(mounted.pci.getResponse()).toBeUndefined();
    await userEvent.click(canvas.getByRole("radio", { name: "Worker 2" }));
    const again = await remountPci(canvasElement, pci, { state: mounted.pci.getState() });
    expect(figure(again).querySelector("[data-worker='2']")).not.toBeNull();
  },
};

/** The author fixes the worker: no choice. */
export const FixedWorker: Story = {
  args: { properties: { worker: "2" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.canvas.queryByRole("radiogroup")).toBeNull();
    expect(figure(mounted).querySelector("[data-worker='2']")).not.toBeNull();
  },
};

/** Explain: for each item worn the pupil chooses why; the reasons are reported too. */
export const Explain: Story = {
  args: { properties: { job: "cleaning", explain: "true" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("a choice list for each item worn", async () => {
      await tap(mounted, "goggles", "chemicalGloves", "rubberBoots", "chemicalApron");
      expect(canvas.getByRole("heading", { name: "Why?" })).toBeInTheDocument();
      const select = canvas.getByRole("combobox", { name: "Why the safety goggles?" }) as HTMLSelectElement;
      expect(Array.from(select.options).map((o) => o.value)).toEqual(["", "particles", "splashes", "noise", "vapours", "cold"]);
      expect(fields(pci.getResponse())).toEqual({
        required: 4, requiredTotal: 4, wrong: 0, correct: true, items: "goggles,chemicalGloves,rubberBoots,chemicalApron", reasons: "", reasonsRight: 0, reasonsCorrect: false,
      });
    });

    await step("the reasons: right when they fit the job", async () => {
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Why the safety goggles?" }), "splashes");
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Why the chemical-resistant gloves?" }), "splashes");
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Why the rubber boots?" }), "wet");
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Why the chemical apron?" }), "cold");
      expect(fields(pci.getResponse())).toMatchObject({
        reasons: "goggles:splashes,chemicalGloves:splashes,rubberBoots:wet,chemicalApron:cold", reasonsRight: 3, reasonsCorrect: false,
      });
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Why the chemical apron?" }), "splashes");
      expect(fields(pci.getResponse())).toMatchObject({ reasonsRight: 4, reasonsCorrect: true });
    });

    await step("an item taken off loses its reason; put on again, it is asked again", async () => {
      await tap(mounted, "rubberBoots", "rubberBoots");
      expect((canvas.getByRole("combobox", { name: "Why the rubber boots?" }) as HTMLSelectElement).value).toBe("");
      expect(fields(pci.getResponse())).toMatchObject({ reasonsRight: 3, reasonsCorrect: false });
    });
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", job: "roof", explain: "true" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect($(mounted, "[data-job-text]")).toHaveTextContent("Je vervangt dakpannen op een schuin dak van 8 meter hoog, zonder randbeveiliging.");
    expect(canvas.getByText(/^Geef de werker de beschermingsmiddelen/)).toBeInTheDocument();
    expect(canvas.getByRole("region", { name: "Persoonlijke beschermingsmiddelen" })).toBeInTheDocument();
    expect(canvas.getByRole("heading", { name: "Valbeveiliging" })).toBeInTheDocument();
    await tap(mounted, "harness", "helmet");
    expect($(mounted, "[data-describe]")).toHaveTextContent("De werker draagt: veiligheidshelm en valbeveiligingsharnas.");
    expect(canvas.getByRole("combobox", { name: "Waarom de valbeveiligingsharnas?" })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Valbeveiligingsharnas", pressed: true })).toBeInTheDocument();
    expect(canvas.getByRole("radio", { name: "Werker 1" })).toBeInTheDocument();
  },
};

/** The author's own job (written by the authoring mode). */
export const OwnJob: Story = {
  args: {
    properties: {
      job: "custom",
      customJob: serializeCustomJob({ text: "You weld two steel pipes together.", required: ["faceShield", "workGloves"], allowed: ["coverall"], hazards: ["particles", "rough"] }),
    },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect($(mounted, "[data-job-text]")).toHaveTextContent("You weld two steel pipes together.");
    await tap(mounted, "faceShield", "workGloves", "coverall");
    expect(fields(mounted.pci.getResponse())).toEqual({ required: 2, requiredTotal: 2, wrong: 0, correct: true, items: "faceShield,workGloves,coverall" });
  },
};

/** An own job that can not be read: the default job, and the author sees why. */
export const SettingsProblem: Story = {
  args: { properties: { job: "custom", customJob: "{oops" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.canvas.getByRole("alert")).toHaveTextContent("The own job can not be read: the default job is shown.");
    expect($(mounted, "[data-job-text]")).toHaveTextContent(/angle grinder/);
  },
};

export const RestoreState: Story = {
  args: { properties: { explain: "true" } },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await tap(first, "goggles", "earPlugs");
    await userEvent.selectOptions(first.canvas.getByRole("combobox", { name: "Why the ear plugs?" }), "noise");
    const state = first.pci.getState();

    // the pupil comes back to the item: everything is as they left it
    const second = await remountPci(canvasElement, pci, { properties: { explain: "true" }, state });
    expect(onWorker(second)).toEqual(["earPlugs", "goggles"]);
    expect(rackItem(second, "earPlugs")).toHaveAttribute("aria-pressed", "true");
    expect((second.canvas.getByRole("combobox", { name: "Why the ear plugs?" }) as HTMLSelectElement).value).toBe("noise");
    expect(fields(second.pci.getResponse())).toMatchObject({ items: "goggles,earPlugs", reasons: "earPlugs:noise", reasonsRight: 1 });
  },
};

export const ForeignState: Story = {
  args: { state: JSON.stringify({ state: { worn: ["goggles", "jetpack"], reasons: {}, worker: 1 }, log: [] }) },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(onWorker(mounted)).toEqual([]);
    expect(mounted.pci.getResponse()).toBeUndefined();
  },
};

/** A response handed back (boundTo, setResponse): the worker wears its items, with its reasons. */
export const BoundResponse: Story = {
  args: { properties: { explain: "true" }, boundTo: { RESPONSE: itemsRecord("goggles,earMuffs,cutGloves,safetyShoes", "goggles:particles,cutGloves:cuts") } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(onWorker(mounted)).toEqual(["safetyShoes", "cutGloves", "earMuffs", "goggles"]);
    expect(fields(mounted.pci.getResponse())).toMatchObject({ correct: true, reasons: "goggles:particles,cutGloves:cuts", reasonsRight: 2 });
    mounted.pci.setResponse(itemsRecord("helmet,harness"));
    await waitFor(() => expect(onWorker(mounted)).toEqual(["harness", "helmet"]));
  },
};

/** Status "solution" without a correct response in the item: a correct dressing from the settings, read-only. */
export const Solution: Story = {
  args: { status: "solution", properties: { job: "roadside", explain: "true" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(onWorker(mounted)).toEqual(["safetyShoes", "workGloves", "hiVis"]);
    expect(fields(mounted.pci.getResponse())).toMatchObject({ correct: true, reasonsCorrect: true });
    // read-only: no rack, a list of what is worn; the reasons shown, not changeable; nothing comes off
    expect(mounted.root.querySelector(".rack")).toBeNull();
    expect(Array.from(mounted.root.querySelectorAll<HTMLElement>("[data-worn-item]")).map((li) => li.dataset.wornItem)).toEqual(["workGloves", "safetyShoes", "hiVis"]);
    expect(mounted.canvas.getByRole("combobox", { name: "Why the high-visibility vest?" })).toBeDisabled();
    expect((mounted.canvas.getByRole("combobox", { name: "Why the high-visibility vest?" }) as HTMLSelectElement).value).toBe("traffic");
    await userEvent.click(wornItem(mounted, "hiVis"));
    expect(onWorker(mounted)).toEqual(["safetyShoes", "workGloves", "hiVis"]);
    expect(mounted.root.querySelectorAll("button")).toHaveLength(0);
  },
};

/** Status "solution" with the item's correct response. */
export const SolutionDeclared: Story = {
  args: { status: "solution", properties: { job: "kitchen" }, responseDeclaration: { correctResponse: { value: itemsRecord("hairnet,cutGloves") } } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(onWorker(mounted)).toEqual(["cutGloves", "hairnet"]);
  },
};

export const Review: Story = {
  args: { status: "review", state: JSON.stringify({ state: { worn: ["helmet", "goggles"], reasons: {}, worker: 3 }, log: [] }) },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(onWorker(mounted)).toEqual(["helmet", "goggles"]);
    expect(figure(mounted).querySelector("[data-worker='3']")).not.toBeNull();
    expect(mounted.root.querySelector(".rack")).toBeNull();
    expect(mounted.canvas.queryByRole("radiogroup")).toBeNull();
    expect(mounted.canvas.getByRole("region", { name: "Worn" })).toHaveTextContent("Safety helmet");
  },
};

/** The correct response from the settings: only when the job has one correct answer. */
export const CorrectResponse: Story = {
  play: async () => {
    const correct = (properties: Record<string, string>) => pci.getCorrectResponse!(properties as never);
    // the presets have alternatives or allowed items: a rule on correct scores them
    expect(correct({})).toBeUndefined();
    expect(correct({ job: "kitchen" })).toBeUndefined();
    const own = serializeCustomJob({ text: "Work at height", required: ["harness", "helmet"], allowed: [], hazards: ["height", "falling"] });
    expect(fields(correct({ job: "custom", customJob: own }))).toEqual({ required: 2, requiredTotal: 2, wrong: 0, correct: true, items: "helmet,harness" });
    expect(fields(correct({ job: "custom", customJob: own, explain: "true" }))).toMatchObject({ reasons: "helmet:falling,harness:height", reasonsCorrect: true });
  },
};

/** The correct response from the settings, shown: setResponse(getCorrectResponse(p)) gives the same response. */
export const CorrectResponseShown: Story = {
  args: { properties: { job: "custom", customJob: serializeCustomJob({ text: "Work at height", required: ["harness", "helmet"], allowed: [], hazards: ["height", "falling"] }) } },
  play: async ({ canvasElement, args }) => {
    const mounted = await openPci(canvasElement);
    const correct = pci.getCorrectResponse!(args.properties as never)!;
    mounted.pci.setResponse(correct);
    await waitFor(() => expect(mounted.pci.getResponse()).toEqual(correct));
  },
};

export const Validity: Story = {
  play: async ({ canvasElement }) => {
    const { pci } = await openPci(canvasElement);
    expect(pci.checkValidity()).toBe(true);
    pci.setCustomValidity("Kies minstens één beschermingsmiddel.");
    expect(pci.getCustomValidity()).toBe("Kies minstens één beschermingsmiddel.");
    expect(pci.checkValidity()).toBe(false);
    pci.setCustomValidity("");
    expect(pci.checkValidity()).toBe(true);
  },
};

/** Two on one page: each has its own worker. */
export const TwoInstances: Story = {
  render: (args) => {
    const page = document.createElement("div");
    for (const id of ["first", "second"]) {
      const slot = document.createElement("div");
      slot.dataset.slot = id;
      slot.appendChild(mountPci(pci, id === "first" ? args : { ...args, properties: { job: "kitchen", explain: "true" } }));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=first]")!);
    const second = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=second]")!);
    expect(first.pci).not.toBe(second.pci);
    await tap(first, "goggles");
    await tap(second, "hairnet");
    expect(fields(first.pci.getResponse())).toMatchObject({ items: "goggles", requiredTotal: 4 });
    expect(fields(second.pci.getResponse())).toMatchObject({ items: "hairnet", correct: true, reasons: "" });
    expect(onWorker(first)).toEqual(["goggles"]);
    expect(onWorker(second)).toEqual(["hairnet"]);
  },
};

/** Every preset job, in English and Dutch: its text is shown, and a correct dressing scores correct. */
export const EveryJob: Story = {
  play: async ({ canvasElement }) => {
    for (const job of ["grinding", "cleaning", "roof", "coldStore", "circularSaw", "kitchen", "roadside"]) {
      for (const language of ["en", "nl"]) {
        const mounted = await remountPci(canvasElement, pci, { status: "solution", properties: { job, language } });
        expect($(mounted, "[data-job-text]").textContent!.length).toBeGreaterThan(20);
        expect(fields(mounted.pci.getResponse())).toMatchObject({ correct: true, wrong: 0 });
      }
    }
  },
};

// ---- the authoring mode ----

type Authoring = StoryObj<AuthoringArgs>;
type MountedAuthoring = Awaited<ReturnType<typeof openAuthoring>>;
const written = (m: MountedAuthoring) => m.instance.getProperties() as Record<string, string>;
const statusRadio = (m: MountedAuthoring, id: ItemId, status: string) =>
  within(m.root.querySelector<HTMLElement>(`li[data-item="${id}"]`)!).getByRole("radio", { name: status }) as HTMLButtonElement;
const startFrom = (m: MountedAuthoring) => m.root.querySelector<HTMLSelectElement>("select[data-start]")!;
const jobTextArea = (m: MountedAuthoring) => m.root.querySelector<HTMLTextAreaElement>("textarea[data-job-text]")!;
async function press(element: HTMLElement, key: string) {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  await afterPaint();
}

/** Starting from a preset: it is written by its id; another preset replaces everything. */
export const AuthoringPreset: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const m = await openAuthoring(canvasElement);
    const { canvas } = m;

    await step("starts from the settings: the grinding job", async () => {
      expect(canvas.getByRole("heading", { name: "Job and equipment" })).toBeInTheDocument();
      expect(startFrom(m).value).toBe("grinding");
      expect(jobTextArea(m).value).toMatch(/angle grinder/);
      expect(statusRadio(m, "goggles", "Required")).toHaveAttribute("aria-checked", "true");
      expect(statusRadio(m, "faceShield", "Allowed")).toHaveAttribute("aria-checked", "true");
      expect(statusRadio(m, "harness", "Not needed")).toHaveAttribute("aria-checked", "true");
      expect(m.root.querySelector("[data-summary]")).toHaveTextContent(
        "The pupil must wear: safety goggles; ear plugs or ear muffs; work gloves or cut-resistant gloves; safety shoes (S3)"
      );
      expect(m.root.querySelector("[data-one-answer]")).toHaveAttribute("data-one-answer", "false");
      expect(written(m)).toEqual({ job: "grinding", customJob: "" });
      expect(m.instance.validate()).toEqual([]);
    });

    await step("another preset", async () => {
      await userEvent.selectOptions(startFrom(m), "kitchen");
      expect(jobTextArea(m).value).toBe("You prepare food in a professional kitchen.");
      expect(statusRadio(m, "hairnet", "Required")).toHaveAttribute("aria-checked", "true");
      expect(written(m)).toEqual({ job: "kitchen", customJob: "" });
      expect(m.changes.length).toBeGreaterThan(0);
    });

    await step("an own job that equals a preset is still written as an own job", async () => {
      await userEvent.selectOptions(startFrom(m), "custom");
      expect(written(m).job).toBe("custom");
      expect(JSON.parse(written(m).customJob)).toMatchObject({ text: "You prepare food in a professional kitchen.", required: ["hairnet"] });
    });
  },
};

/** Editing: the text, a status per item (click and arrow keys), the hazards; written as an own job. */
export const AuthoringOwnJob: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { job: "roof" } },
  play: async ({ canvasElement, step }) => {
    const m = await openAuthoring(canvasElement);
    const { canvas } = m;

    await step("a new text makes it an own job", async () => {
      jobTextArea(m).value = "You paint a window frame on the first floor, from a ladder.";
      jobTextArea(m).dispatchEvent(new Event("input", { bubbles: true }));
      await afterPaint();
      expect(startFrom(m).value).toBe("custom");
      expect(written(m).job).toBe("custom");
    });

    await step("statuses: a click, and the arrow keys in the row", async () => {
      await userEvent.click(statusRadio(m, "safetyShoes", "Allowed"));
      await press(statusRadio(m, "helmet", "Required"), "ArrowRight");
      expect(statusRadio(m, "helmet", "Allowed")).toHaveAttribute("aria-checked", "true");
      await waitFor(() => expect(focusedIn(m.root)).toBe(statusRadio(m, "helmet", "Allowed")));
      await press(statusRadio(m, "helmet", "Allowed"), "End");
      expect(statusRadio(m, "helmet", "Not needed")).toHaveAttribute("aria-checked", "true");
      const job = JSON.parse(written(m).customJob);
      expect(job.required).toEqual(["harness"]);
      expect(job.allowed).toEqual(["goggles", "workGloves", "cutGloves", "safetyShoes", "coverall"]);
      expect(m.root.querySelector("[data-one-answer]")).toHaveAttribute("data-one-answer", "false");
    });

    await step("only the harness, nothing allowed: one correct answer", async () => {
      for (const id of ["goggles", "workGloves", "cutGloves", "safetyShoes", "coverall"] as ItemId[]) await userEvent.click(statusRadio(m, id, "Not needed"));
      expect(m.root.querySelector("[data-one-answer]")).toHaveAttribute("data-one-answer", "true");
      expect(canvas.getByText("One correct answer: match_correct can score it.")).toBeInTheDocument();
    });

    await step("hazards", async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: "Cold" }));
      await userEvent.click(canvas.getByRole("checkbox", { name: "Falling from a height" }));
      const job = JSON.parse(written(m).customJob);
      expect(job.hazards).toContain("cold");
      expect(job.hazards).not.toContain("height");
      expect(job).toMatchObject({ text: "You paint a window frame on the first floor, from a ladder.", required: ["harness"], allowed: [] });
    });
  },
};

/** What keeps Done from finishing: no text, nothing required; with explain, an item without a reason. */
export const AuthoringValidate: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { job: "kitchen", explain: "true" } },
  play: async ({ canvasElement }) => {
    const m = await openAuthoring(canvasElement);
    expect(m.instance.validate()).toEqual([]);
    jobTextArea(m).value = " ";
    jobTextArea(m).dispatchEvent(new Event("input", { bubbles: true }));
    await userEvent.click(statusRadio(m, "hairnet", "Not needed"));
    await userEvent.click(statusRadio(m, "harness", "Allowed"));
    expect(m.instance.validate()).toEqual([
      "Describe the job.",
      "Mark at least one piece of equipment as required.",
      "For these items none of the ticked hazards is a reason the pupil can give: fall-arrest harness.",
    ]);
    expect(m.root.querySelector("[data-problems]")).toHaveTextContent("Describe the job.");
  },
};

/** In Dutch, for an item in Dutch: the preset text in the item's language. */
export const AuthoringDutch: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { language: "nl", job: "coldStore" } },
  play: async ({ canvasElement }) => {
    const m = await openAuthoring(canvasElement);
    expect(m.canvas.getByRole("heading", { name: "Werk en beschermingsmiddelen" })).toBeInTheDocument();
    expect(jobTextArea(m).value).toMatch(/^Je rijdt op een heftruck in een vrieshuis/);
    expect(statusRadio(m, "coldClothing", "Verplicht")).toHaveAttribute("aria-checked", "true");
    expect(written(m)).toEqual({ job: "coldStore", customJob: "" });
  },
};
