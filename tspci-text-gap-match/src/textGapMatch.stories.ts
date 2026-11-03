import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

// The defaults: the example plant with four drop zones, five labels, one label per zone
const meta = {
  title: "Text gap match",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

const ZONES = ["dropzone_1", "dropzone_2", "dropzone_3", "dropzone_4"];

/** The response string: every zone, with the texts of the labels in it. */
const response = (placed: Record<string, string[]>, zones = ZONES) => {
  const result: Record<string, string[]> = {};
  for (const zone of zones) result[zone] = placed[zone] ?? [];
  return { base: { string: JSON.stringify(result) } };
};

/** The labels still in the list. */
const list = (mounted: MountedPci) =>
  within(mounted.canvas.getByRole("group", { name: "Labels" })).queryAllByRole("button").map((b) => b.textContent);
/** The labels in a zone, in order. */
const inZone = (mounted: MountedPci, zone: string) =>
  [...mounted.root.querySelectorAll(`[data-dropzone="${zone}"] [data-placed]`)].map((b) => b.textContent);
const live = (mounted: MountedPci) => mounted.root.querySelector('p[aria-live="polite"]')!;

/** The image is loaded: the zones have their size (they are percentages of it). */
const imageLoaded = (mounted: MountedPci) =>
  waitFor(() => {
    const img = mounted.root.querySelector("img")!;
    expect(img.complete && img.naturalWidth > 0).toBe(true);
  });

const middle = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
};

/** A drag with the mouse: the label keeps the pointer (pointerId 1, the mouse, so setPointerCapture accepts it). */
const drag = (from: Element, to: { clientX: number; clientY: number }) => {
  const pointer = { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0 };
  fireEvent.pointerDown(from, { ...pointer, ...middle(from) });
  fireEvent.pointerMove(from, { ...pointer, ...to, buttons: 1 });
  fireEvent.pointerUp(from, { ...pointer, ...to });
};

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("the example image with four drop zones, the labels below it, no response", async () => {
      expect(canvas.getByRole("group", { name: "A plant: a flower on a stem with two leaves, its roots in the soil" })).toBeInTheDocument();
      expect(canvas.getByRole("button", { name: "Drop zone 1 of 4, empty" })).toBeInTheDocument();
      expect(canvas.getByRole("button", { name: "Drop zone 4 of 4, empty" })).toBeInTheDocument();
      expect(list(mounted)).toEqual(["Flower", "Leaf", "Stem", "Root", "Seed"]);
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("click a label, then a drop zone", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Flower" }));
      expect(canvas.getByRole("button", { name: "Flower" })).toHaveAttribute("aria-pressed", "true");
      expect(live(mounted)).toHaveTextContent("Flower picked up. Choose a drop zone, or press Escape.");
      await userEvent.click(canvas.getByRole("button", { name: "Drop zone 1 of 4, empty" }));
      await waitFor(() => expect(inZone(mounted, "dropzone_1")).toEqual(["Flower"]));
      expect(list(mounted)).toEqual(["Leaf", "Stem", "Root", "Seed"]);
      expect(canvas.getByRole("button", { name: "Drop zone 1 of 4, contains Flower, full" })).toBeInTheDocument();
      expect(canvas.getByRole("button", { name: "Flower, in drop zone 1, position 1" })).toBeInTheDocument();
      expect(pci.getResponse()).toEqual(response({ dropzone_1: ["Flower"] }));
      expect(await lastChange(mounted)).toEqual(response({ dropzone_1: ["Flower"] }));
    });

    await step("a full zone does not take another label", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Leaf" }));
      await userEvent.click(canvas.getByRole("button", { name: "Drop zone 1 of 4, contains Flower, full" }));
      await waitFor(() => expect(live(mounted)).toHaveTextContent("Drop zone 1 does not take Leaf."));
      expect(inZone(mounted, "dropzone_1")).toEqual(["Flower"]);
      expect(list(mounted)).toEqual(["Leaf", "Stem", "Root", "Seed"]);
    });

    await step("a placed label moves to another zone", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Flower, in drop zone 1, position 1" }));
      await userEvent.click(canvas.getByRole("button", { name: "Drop zone 3 of 4, empty" }));
      await waitFor(() => expect(inZone(mounted, "dropzone_3")).toEqual(["Flower"]));
      expect(inZone(mounted, "dropzone_1")).toEqual([]);
      expect(pci.getResponse()).toEqual(response({ dropzone_3: ["Flower"] }));
    });

    await step("a label put onto a label in another zone: they change places", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Root" }));
      await userEvent.click(canvas.getByRole("button", { name: "Drop zone 4 of 4, empty" }));
      await userEvent.click(canvas.getByRole("button", { name: "Root, in drop zone 4, position 1" }));
      await userEvent.click(canvas.getByRole("button", { name: "Flower, in drop zone 3, position 1" }));
      await waitFor(() => expect(inZone(mounted, "dropzone_3")).toEqual(["Root"]));
      expect(inZone(mounted, "dropzone_4")).toEqual(["Flower"]);
      expect(pci.getResponse()).toEqual(response({ dropzone_3: ["Root"], dropzone_4: ["Flower"] }));
    });

    await step("Put back returns a picked label to the list", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Root, in drop zone 3, position 1" }));
      await userEvent.click(canvas.getByRole("button", { name: "Put back" }));
      await waitFor(() => expect(list(mounted)).toEqual(["Leaf", "Stem", "Root", "Seed"]));
      expect(live(mounted)).toHaveTextContent("Root put back.");
      expect(canvas.queryByRole("button", { name: "Put back" })).toBeNull();
      expect(pci.getResponse()).toEqual(response({ dropzone_4: ["Flower"] }));
    });
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    // the zones are only in the tab order while a label is picked up
    expect(canvas.getByRole("button", { name: "Drop zone 2 of 4, empty" })).toHaveAttribute("tabindex", "-1");

    canvas.getByRole("button", { name: "Stem" }).focus();
    await userEvent.keyboard("{Enter}");
    const zone = canvas.getByRole("button", { name: "Drop zone 2 of 4, empty" });
    await waitFor(() => expect(zone).toHaveAttribute("tabindex", "0"));
    zone.focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(inZone(mounted, "dropzone_2")).toEqual(["Stem"]));
    expect(live(mounted)).toHaveTextContent("Stem placed in drop zone 2.");
    expect(pci.getResponse()).toEqual(response({ dropzone_2: ["Stem"] }));

    // Escape cancels a pick
    canvas.getByRole("button", { name: "Seed" }).focus();
    await userEvent.keyboard(" ");
    await waitFor(() => expect(canvas.getByRole("button", { name: "Seed" })).toHaveAttribute("aria-pressed", "true"));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(canvas.getByRole("button", { name: "Seed" })).toHaveAttribute("aria-pressed", "false"));
    expect(live(mounted)).toHaveTextContent("Cancelled.");

    // Delete puts a placed label back
    canvas.getByRole("button", { name: "Stem, in drop zone 2, position 1" }).focus();
    await userEvent.keyboard("{Delete}");
    await waitFor(() => expect(inZone(mounted, "dropzone_2")).toEqual([]));
    expect(list(mounted)).toEqual(["Flower", "Leaf", "Stem", "Root", "Seed"]);
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const DragAndDrop: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root, pci } = mounted;
    await imageLoaded(mounted);
    const zone = (id: string) => root.querySelector(`[data-dropzone="${id}"]`)!;

    drag(canvas.getByRole("button", { name: "Leaf" }), middle(zone("dropzone_2")));
    await waitFor(() => expect(inZone(mounted, "dropzone_2")).toEqual(["Leaf"]));
    expect(pci.getResponse()).toEqual(response({ dropzone_2: ["Leaf"] }));

    // from zone to zone
    drag(canvas.getByRole("button", { name: "Leaf, in drop zone 2, position 1" }), middle(zone("dropzone_1")));
    await waitFor(() => expect(inZone(mounted, "dropzone_1")).toEqual(["Leaf"]));
    expect(inZone(mounted, "dropzone_2")).toEqual([]);

    // dropped anywhere but a zone: back to the list
    drag(canvas.getByRole("button", { name: "Leaf, in drop zone 1, position 1" }), middle(canvas.getByRole("group", { name: "Labels" })));
    await waitFor(() => expect(list(mounted)).toEqual(["Flower", "Leaf", "Stem", "Root", "Seed"]));
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const ManyPerZone: Story = {
  args: { properties: { maxDropped: "0", infiniteTexts: "true", numbering: "true", droppedStyle: "color: rgb(185, 28, 28)" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root, pci } = mounted;
    const put = async (label: string, zone: number) => {
      await userEvent.click(canvas.getByRole("button", { name: label }));
      await userEvent.click(canvas.getByRole("button", { name: new RegExp(`^Drop zone ${zone} of 4`) }));
    };
    await put("Seed", 1);
    await put("Root", 1);
    // infinite texts: a label stays in the list and can be used again, but not twice in one zone
    await put("Seed", 2);
    await put("Seed", 1);
    await waitFor(() => expect(inZone(mounted, "dropzone_2")).toEqual(["1.Seed"]));
    expect(inZone(mounted, "dropzone_1")).toEqual(["1.Seed", "2.Root"]);
    expect(live(mounted)).toHaveTextContent("Drop zone 1 does not take Seed.");
    expect(list(mounted)).toEqual(["Flower", "Leaf", "Stem", "Root", "Seed"]);
    expect(canvas.getByRole("button", { name: "Drop zone 1 of 4, contains Seed, Root" })).toBeInTheDocument();
    expect(root.querySelector('[data-dropzone="dropzone_1"] [data-placed]')).toHaveStyle({ color: "rgb(185, 28, 28)" });
    expect(pci.getResponse()).toEqual(response({ dropzone_1: ["Seed", "Root"], dropzone_2: ["Seed"] }));
  },
};

export const OwnZonesAndLabels: Story = {
  args: {
    properties: {
      strings: "North\nSouth\n\nEast",
      // a second zone with the id "a" is left out: the response is keyed by id
      dropzones: JSON.stringify([[0, 0, 40, 30, "a"], [50, 50, 40, 30], [10, 10, 5, 5, "a"]]),
      imageDescription: "A compass",
    },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.getByRole("group", { name: "A compass" })).toBeInTheDocument();
    expect(list(mounted)).toEqual(["North", "South", "East"]);
    expect(canvas.getAllByRole("button", { name: /^Drop zone/ })).toHaveLength(2);
    await userEvent.click(canvas.getByRole("button", { name: "East" }));
    await userEvent.click(canvas.getByRole("button", { name: "Drop zone 2 of 2, empty" }));
    // a zone without an id is dropzone_<its index>
    await waitFor(() => expect(pci.getResponse()).toEqual(response({ dropzone_1: ["East"] }, ["a", "dropzone_1"])));
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByRole("group", { name: "Een plant: een bloem op een stengel met twee bladeren, de wortels in de grond" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Leaf" }));
    await userEvent.click(canvas.getByRole("button", { name: "Plek 2 van 4, leeg" }));
    await waitFor(() => expect(live(mounted)).toHaveTextContent("Leaf op plek 2 gezet."));
    expect(canvas.getByRole("button", { name: "Plek 2 van 4, bevat Leaf, vol" })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Leaf, op plek 2, positie 1" })).toBeInTheDocument();
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement, step }) => {
    await step("getState() → a new session", async () => {
      const first = await openPci(canvasElement);
      await userEvent.click(first.canvas.getByRole("button", { name: "Root" }));
      await userEvent.click(first.canvas.getByRole("button", { name: "Drop zone 4 of 4, empty" }));
      await waitFor(() => expect(inZone(first, "dropzone_4")).toEqual(["Root"]));

      const second = await remountPci(canvasElement, pci, { state: first.pci.getState() });
      expect(inZone(second, "dropzone_4")).toEqual(["Root"]);
      expect(list(second)).toEqual(["Flower", "Leaf", "Stem", "Seed"]);
      expect(second.pci.getResponse()).toEqual(response({ dropzone_4: ["Root"] }));
    });

    await step("the state the original saved: { response: { zone: [texts] } }", async () => {
      const state = JSON.stringify({ response: { dropzone_1: ["Flower"], dropzone_3: ["Leaf", "Stem"], nowhere: ["Seed"] } });
      const third = await remountPci(canvasElement, pci, { state });
      expect(inZone(third, "dropzone_1")).toEqual(["Flower"]);
      // one label per zone: the second is left out
      expect(inZone(third, "dropzone_3")).toEqual(["Leaf"]);
      expect(third.pci.getResponse()).toEqual(response({ dropzone_1: ["Flower"], dropzone_3: ["Leaf"] }));
    });
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: response({ dropzone_2: ["Stem"], dropzone_3: ["Unknown"] }) } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { pci } = mounted;

    await step("the response the player hands back is shown; texts that are no label are dropped", async () => {
      await waitFor(() => expect(inZone(mounted, "dropzone_2")).toEqual(["Stem"]));
      expect(pci.getResponse()).toEqual(response({ dropzone_2: ["Stem"] }));
    });

    await step("setResponse replaces it", async () => {
      pci.setResponse(response({ dropzone_1: ["Seed"], dropzone_4: ["Root"] }));
      await waitFor(() => expect(inZone(mounted, "dropzone_1")).toEqual(["Seed"]));
      expect(inZone(mounted, "dropzone_2")).toEqual([]);
      expect(pci.getResponse()).toEqual(response({ dropzone_1: ["Seed"], dropzone_4: ["Root"] }));
    });

    await step("resetResponse empties every zone, and tells the player", async () => {
      pci.resetResponse();
      await waitFor(() => expect(list(mounted)).toEqual(["Flower", "Leaf", "Stem", "Root", "Seed"]));
      expect(pci.getResponse()).toBeUndefined();
      expect(await lastChange(mounted)).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: {
    status: "solution",
    responseDeclaration: {
      baseType: "string",
      correctResponse: { value: JSON.stringify({ dropzone_1: ["Flower"], dropzone_2: ["Leaf"], dropzone_3: ["Stem"], dropzone_4: ["Root"] }) },
    },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    await waitFor(() => expect(inZone(mounted, "dropzone_4")).toEqual(["Root"]));
    expect(ZONES.map((z) => inZone(mounted, z))).toEqual([["Flower"], ["Leaf"], ["Stem"], ["Root"]]);
    expect(list(mounted)).toEqual(["Seed"]);
    expect(mounted.pci.getResponse()).toEqual(
      response({ dropzone_1: ["Flower"], dropzone_2: ["Leaf"], dropzone_3: ["Stem"], dropzone_4: ["Root"] })
    );
  },
};

/** Authoring mode: an authoring system calls getAuthoringInstance (not getInstance), here with the default settings. */
export const Authoring: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const { canvas, instance, changes, root } = await openAuthoring(canvasElement);

    await step("the example image and its four zones", async () => {
      expect(canvas.getByTestId("summary")).toHaveTextContent("4 drop zones");
      expect(canvas.getByRole("button", { name: "dropzone_1: 6.25%, 17.5%, 23.4375% × 11%" })).toBeInTheDocument();
      expect(instance.getProperties()).toEqual({
        backdrop: "",
        dropzones: JSON.stringify([
          [6.25, 17.5, 23.44, 11, "dropzone_1"],
          [6.25, 47.5, 23.44, 11, "dropzone_2"],
          [70.31, 37.5, 23.44, 11, "dropzone_3"],
          [70.31, 82.5, 23.44, 11, "dropzone_4"],
        ]),
      });
      expect(instance.validate!()).toEqual([]);
    });

    await step("add a zone, move and resize it with the keyboard", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Add drop zone" }));
      await waitFor(() => expect(canvas.getByTestId("summary")).toHaveTextContent("5 drop zones"));
      expect(changes.length).toBe(1);
      const zone = canvas.getByTestId("zone-4");
      expect(zone).toHaveAttribute("aria-pressed", "true");
      zone.focus();
      await userEvent.keyboard("{ArrowRight}{ArrowDown}{Shift>}{ArrowRight}{/Shift}");
      await waitFor(() => expect(canvas.getByTestId("zone-4")).toHaveAccessibleName("dropzone_5: 41%, 46%, 21% × 10%"));
      expect(JSON.parse(instance.getProperties().dropzones)[4]).toEqual([41, 46, 21, 10, "dropzone_5"]);
    });

    await step("an id used twice is a problem", async () => {
      await retype(canvas.getByTestId("zone-id"), "dropzone_1");
      await waitFor(() => expect(instance.validate!()).toEqual(["Two drop zones have the id dropzone_1."]));
      expect(canvas.getByText("Two drop zones have the id dropzone_1.")).toBeInTheDocument();
      await userEvent.click(canvas.getByRole("button", { name: "Remove dropzone_1" }));
      await waitFor(() => expect(canvas.getByTestId("summary")).toHaveTextContent("4 drop zones"));
      expect(instance.validate!()).toEqual([]);
    });

    await step("drag on the image to draw a zone", async () => {
      const img = root.querySelector('[data-testid="canvas"] img')!;
      await waitFor(() => expect((img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0).toBe(true));
      const r = root.querySelector('[data-testid="canvas"]')!.getBoundingClientRect();
      const at = (x: number, y: number) => ({ clientX: r.left + (r.width * x) / 100, clientY: r.top + (r.height * y) / 100 });
      const pointer = { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0 };
      fireEvent.pointerDown(img, { ...pointer, ...at(35, 2) });
      fireEvent.pointerMove(img, { ...pointer, ...at(50, 8), buttons: 1 });
      fireEvent.pointerUp(img, { ...pointer, ...at(60, 12) });
      await waitFor(() => expect(canvas.getByTestId("summary")).toHaveTextContent("5 drop zones"));
      // in % of the image, with the next free id
      expect(JSON.parse(instance.getProperties().dropzones)[4]).toEqual([35, 2, 25, 10, "dropzone_5"]);
    });
  },
};

export const AuthoringWithoutZones: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { dropzones: "[]" } },
  play: async ({ canvasElement }) => {
    const { canvas, instance } = await openAuthoring(canvasElement);
    expect(canvas.getByTestId("summary")).toHaveTextContent("0 plekken");
    expect(instance.validate!()).toEqual(["Teken minstens één plek."]);
    await userEvent.click(canvas.getByRole("button", { name: "Plek toevoegen" }));
    await waitFor(() => expect(instance.validate!()).toEqual([]));
    expect(instance.getProperties().dropzones).toBe(JSON.stringify([[40, 45, 20, 10, "dropzone_1"]]));
  },
};
