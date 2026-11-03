import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Assembly order",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Canvas = MountedPci["canvas"];
type Rec = { record: { name: string; base: { integer?: number; string?: string } }[] } | undefined;

/** A field of the record response. */
const field = (response: unknown, name: string) => (response as Rec)?.record.find((f) => f.name === name)?.base;
/** The button of a part in the list, by what it does ("Place", "Take off", …) and the part's name. */
const action = (canvas: Canvas, verb: string, part: string) => canvas.getByRole("button", { name: `${verb}: ${part}` });
const place = (canvas: Canvas, part: string) => userEvent.click(action(canvas, "Place", part));
const state = (canvas: Canvas, id: string) => canvas.getByTestId(`state-${id}`).textContent;
const status = (canvas: Canvas) => canvas.getByRole("status").textContent;

/** A valid order of the cabinet, by the names in the list. */
const CABINET = ["Base", "Left side", "Right side", "Back panel", "Top", "Shelf", "Hinges", "Door", "Knob", "Hinge screws"];
const CABINET_IDS = "base,sideLeft,sideRight,back,top,shelf,hinges,door,knob,screws";

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText(/^Choose the parts one by one/)).toBeInTheDocument();
    expect(canvas.getByRole("heading", { name: "Assemble: Small cabinet" })).toBeInTheDocument();
    expect(canvas.getByRole("list", { name: "Parts" }).querySelectorAll("li")).toHaveLength(10);
    expect(canvas.getByTestId("progress")).toHaveTextContent("0 of 10 parts placed");
    // the 3D view, or (without WebGL) a note that the list does it all
    expect(canvas.queryByRole("application", { name: "3D view of the product" }) ?? canvas.getByTestId("no-webgl")).toBeInTheDocument();
    expect(state(canvas, "door")).toBe("not placed");
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const BlockWrongSteps: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await step("the door cannot go first: the PCI says what must come first", async () => {
      await place(canvas, "Door");
      expect(status(canvas)).toBe("Door cannot be placed yet: first Hinges.");
      expect(state(canvas, "door")).toBe("not placed");
      expect(pci.getResponse()).toBeUndefined();
    });
    await step("the base can", async () => {
      await place(canvas, "Base");
      expect(state(canvas, "base")).toBe("placed, step 1");
      expect(status(canvas)).toBe("Base placed (step 1).");
      expect(field(await lastChange(mounted), "blocked")).toEqual({ integer: 1 });
    });
    await step("the base cannot come off while a side stands on it", async () => {
      await place(canvas, "Left side");
      await userEvent.click(action(canvas, "Take off", "Base"));
      expect(status(canvas)).toBe("Base cannot come off: Left side stands on it. Take that off first.");
      await userEvent.click(action(canvas, "Take off", "Left side"));
      expect(state(canvas, "sideLeft")).toBe("not placed");
    });
    await step("undo and start again", async () => {
      await place(canvas, "Right side");
      await userEvent.click(canvas.getByRole("button", { name: "Undo" }));
      expect(state(canvas, "sideRight")).toBe("not placed");
      expect(status(canvas)).toBe("Undone. Right side taken off again.");
      await userEvent.click(canvas.getByRole("button", { name: "Start again" }));
      expect(state(canvas, "base")).toBe("not placed");
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const ValidOrderScores: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    for (const part of CABINET) await place(canvas, part);
    expect(status(canvas)).toBe("Hinge screws placed (step 10). Every part is placed.");
    expect(canvas.getByRole("list", { name: "Your order:" }).querySelectorAll("li")).toHaveLength(10);
    const r = pci.getResponse();
    expect(field(r, "score")).toEqual({ integer: 3 });
    expect(field(r, "maxscore")).toEqual({ integer: 3 });
    expect(field(r, "correct")).toEqual({ integer: 1 });
    expect(field(r, "violations")).toEqual({ integer: 0 });
    expect(field(r, "order")).toEqual({ string: CABINET_IDS });
    expect(field(await lastChange(mounted), "steps")).toEqual({ integer: 10 });
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    action(canvas, "Place", "Base").focus();
    await userEvent.keyboard("{Enter}");
    expect(state(canvas, "base")).toBe("placed, step 1");
    action(canvas, "Place", "Right side").focus();
    await userEvent.keyboard(" ");
    expect(state(canvas, "sideRight")).toBe("placed, step 2");
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(state(canvas, "sideRight")).toBe("not placed");
    await userEvent.click(canvas.getByRole("button", { name: "Help" }));
    expect(canvas.getByText(/Ctrl \+ Z also undoes/)).toBeInTheDocument();
    // the 3D view turns with the arrow keys (when there is WebGL)
    const view = canvas.queryByRole("application");
    if (view) {
      const scene = (view as any).__assemblyScene;
      const before = scene.view.theta;
      view.focus();
      await userEvent.keyboard("{ArrowRight}{ArrowRight}");
      expect(scene.view.theta).toBeCloseTo(before + Math.PI / 6);
      await userEvent.keyboard("0");
      expect(scene.view.theta).toBeCloseTo(before);
    }
  },
};

/** The hub, record feedback (allowed, marked and counted), a list response for MATCH_CORRECT. */
const hubRecord = JSON.stringify({ example: "hub", feedback: "record", scoring: "list" });

export const RecordViolations: Story = {
  args: { properties: { assembly: hubRecord } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await place(canvas, "Hub shell");
    await place(canvas, "Axle");
    expect(status(canvas)).toBe("Axle placed (step 2), but it was not allowed yet: first Left bearing and Right bearing.");
    expect(state(canvas, "axle")).toContain("not allowed yet");
    expect(pci.getResponse()).toEqual({ list: { identifier: ["shell", "axle"] } });
  },
};

export const PciScoringWithPenalty: Story = {
  args: {
    properties: {
      assembly: JSON.stringify({ example: "hub", feedback: "none", first: "shell", points: { valid: 2, complete: 1, first: 1, penalty: 1 } }),
    },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the right bearing before the shell: one violation, no feedback
    for (const part of ["Right bearing", "Hub shell", "Left bearing", "Axle", "Left cone", "Right cone", "Left washer", "Right washer", "Left lock nut", "Right lock nut"]) {
      await place(canvas, part);
    }
    expect(status(canvas)).toBe("Right lock nut placed (step 10). Every part is placed.");
    expect(state(canvas, "bearingRight")).toBe("placed, step 1");
    const r = pci.getResponse();
    expect(field(r, "violations")).toEqual({ integer: 1 });
    expect(field(r, "valid")).toEqual({ integer: 0 });
    expect(field(r, "first")).toEqual({ integer: 0 });
    // complete (1) minus one violation
    expect(field(r, "score")).toEqual({ integer: 0 });
    expect(field(r, "maxscore")).toEqual({ integer: 4 });
  },
};

export const Disassembly: Story = {
  args: { properties: { assembly: JSON.stringify({ example: "plug", task: "disassemble", scoring: "string" }) } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("heading", { name: "Take apart: Mains plug" })).toBeInTheDocument();
    expect(state(canvas, "cover")).toBe("in the product");
    await userEvent.click(action(canvas, "Remove", "Cover"));
    expect(status(canvas)).toBe("Cover cannot be removed yet: first Cover screw.");
    await userEvent.click(action(canvas, "Remove", "Cover screw"));
    await userEvent.click(action(canvas, "Remove", "Cover"));
    expect(pci.getResponse()).toEqual({ base: { string: "coverScrew,cover" } });
    await userEvent.click(action(canvas, "Put back", "Cover"));
    expect(state(canvas, "cover")).toBe("in the product");
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", prompt: "Zet het kastje in elkaar." } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("heading", { name: "Monteren: Kastje" })).toBeInTheDocument();
    await userEvent.click(action(canvas, "Plaatsen", "Deur"));
    expect(status(canvas)).toBe("Deur kan nog niet geplaatst worden: eerst Scharnieren.");
    await userEvent.click(action(canvas, "Plaatsen", "Bodem"));
    expect(state(canvas, "base")).toBe("geplaatst, stap 1");
    expect(canvas.getByRole("button", { name: "Ongedaan maken" })).toBeEnabled();
    // the response does not depend on the language
    expect(field(pci.getResponse(), "order")).toEqual({ string: "base" });
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await place(first.canvas, "Door");
    await place(first.canvas, "Base");
    await place(first.canvas, "Right side");
    const saved = first.pci.getState();
    const parsed = JSON.parse(saved);
    expect(parsed.state).toEqual({ sequence: ["base", "sideRight"], blocked: 1 });
    // the log keeps every attempt, also the blocked one
    expect(parsed.log.map((a: { type: string }) => a.type)).toEqual(["BLOCKED", "STEP", "STEP"]);

    const second = await remountPci(canvasElement, pci, { state: saved });
    expect(state(second.canvas, "sideRight")).toBe("placed, step 2");
    expect(second.pci.getResponse()).toEqual(first.pci.getResponse());
    expect(second.changes).toHaveLength(0);
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: { record: [{ name: "order", base: { string: "base,sideLeft" } }, { name: "blocked", base: { integer: 2 } }] } } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("the bound response is in the list", async () => {
      await waitFor(() => expect(state(canvas, "sideLeft")).toBe("placed, step 2"));
      expect(field(pci.getResponse(), "blocked")).toEqual({ integer: 2 });
    });
    await step("resetResponse: every part loose", async () => {
      pci.resetResponse();
      await waitFor(() => expect(state(canvas, "base")).toBe("not placed"));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: { status: "solution", state: JSON.stringify({ state: { sequence: ["base"], blocked: 0 }, log: [] }) },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the first valid order replaces the candidate's; nothing to change
    await waitFor(() => expect(state(canvas, "knob")).toBe("placed, step 10"));
    expect(canvas.queryByRole("button", { name: /^Take off/ })).toBeNull();
    expect(canvas.getByText("The correct order.")).toBeInTheDocument();
    expect(field(pci.getResponse(), "valid")).toEqual({ integer: 1 });
  },
};

export const SolutionFromTheDeclaration: Story = {
  args: {
    status: "solution",
    properties: { assembly: JSON.stringify({ example: "cabinet", scoring: "list" }) },
    responseDeclaration: { cardinality: "ordered", baseType: "identifier", correctResponse: { value: ["base", "sideRight", "hinges"] } },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await waitFor(() => expect(state(canvas, "hinges")).toBe("placed, step 3"));
    expect(state(canvas, "door")).toBe("not placed");
    expect(pci.getResponse()).toEqual({ list: { identifier: ["base", "sideRight", "hinges"] } });
  },
};

/** Two interactions of this type on one page: each has its own parts and response. */
export const TwoInstances: Story = {
  render: (args) => {
    const page = document.createElement("div");
    for (const id of ["first", "second"]) {
      const slot = document.createElement("div");
      slot.dataset.slot = id;
      slot.appendChild(mountPci(pci, args));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=first]")!);
    const second = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=second]")!);
    expect(first.pci).not.toBe(second.pci);
    await place(first.canvas, "Base");
    await place(second.canvas, "Base");
    await place(second.canvas, "Left side");
    expect(field(first.pci.getResponse(), "order")).toEqual({ string: "base" });
    expect(field(second.pci.getResponse(), "order")).toEqual({ string: "base,sideLeft" });
    expect(first.changes).toHaveLength(1);
    expect(second.changes).toHaveLength(2);
  },
};

// --- Authoring mode: what an authoring system shows the item author (getAuthoringInstance)

export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);
    const config = () => JSON.parse(instance.getProperties().assembly!);

    await step("starts from the cabinet; the first valid order scores 3 of 3", async () => {
      expect(canvas.getByTestId("summary")).toHaveTextContent("The correct order scores 3 of 3.");
      expect(instance.validate()).toEqual([]);
      expect(config().parts).toHaveLength(10);
    });

    await step("the rules: a rule that goes round is a problem", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Order rules" }));
      const baseRules = canvas.getByRole("group", { name: "Base comes after:" });
      const knob = [...baseRules.querySelectorAll("button")].find((b) => b.textContent?.endsWith("Knob"))!;
      await userEvent.click(knob);
      expect(knob).toHaveAttribute("aria-pressed", "true");
      expect(instance.validate()[0]).toMatch(/^The order rules go round in a circle/);
      await userEvent.click(knob);
      expect(instance.validate()).toEqual([]);
      // in the graph: the knob, then the shelf: the knob comes after the shelf
      await userEvent.click(canvas.getByTestId("node-knob"));
      expect(canvas.getByText("Knob chosen: now click the part that must come before it.")).toBeInTheDocument();
      await userEvent.click(canvas.getByTestId("node-shelf"));
      expect(config().parts.find((x: { id: string }) => x.id === "knob").after).toEqual(["door", "shelf"]);
    });

    await step("task and scoring: an exact match warns when several orders are right", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Task and scoring" }));
      await userEvent.click(canvas.getByRole("radio", { name: /ordered list of ids/ }));
      expect(canvas.getByTestId("many-orders")).toBeInTheDocument();
      await userEvent.click(canvas.getByRole("radio", { name: /^Take apart/ }));
      expect(config()).toMatchObject({ scoring: "list", task: "disassemble" });
      expect(canvas.getByTestId("correct-order")).toHaveTextContent(/^1\. Knob 2\. Hinge screws/);
    });

    await step("try it: a run through becomes the correct order", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: /^Assemble/ }));
      await userEvent.click(canvas.getByRole("tab", { name: "Try it" }));
      const run = ["Base", "Right side", "Hinges", "Left side", "Back panel", "Top", "Shelf", "Door", "Knob", "Hinge screws"];
      for (const part of run) await place(canvas, part);
      await userEvent.click(canvas.getByRole("button", { name: "Use this order as the correct order" }));
      expect(config().order).toEqual(["base", "sideRight", "hinges", "sideLeft", "back", "top", "shelf", "door", "knob", "screws"]);
    });

    await step("the product: another example, a part of its own", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Product" }));
      await userEvent.click(canvas.getByRole("button", { name: "Bicycle wheel hub" }));
      expect(config().parts[0].id).toBe("shell");
      await userEvent.click(canvas.getByRole("button", { name: "+ Add a part" }));
      expect(config().parts).toHaveLength(11);
      expect(config().example).toBeUndefined();
      expect(changes.length).toBeGreaterThan(5);
    });
  },
};

export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { example: "plug" } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("tab", { name: "Volgorderegels" })).toBeInTheDocument();
    const size = canvas.getByTestId("part-0-size-0") as HTMLInputElement;
    expect(size.value).toBe("3");
    await userEvent.type(size, "2,5{Enter}", { initialSelectionStart: 0, initialSelectionEnd: size.value.length });
    size.dispatchEvent(new Event("change", { bubbles: true }));
    await waitFor(() => expect(JSON.parse(instance.getProperties().assembly!).parts[0].size[0]).toBe(2.5));
    expect(size.value).toBe("2,5");
    await userEvent.clear(canvas.getByTestId("part-1-id")).catch(() => undefined);
    const id = canvas.getByTestId("part-1-id") as HTMLInputElement;
    id.value = "1cable";
    id.dispatchEvent(new Event("change", { bubbles: true }));
    await waitFor(() => expect(instance.validate()[0]).toMatch(/^"1cable" is geen geldige id/));
  },
};
