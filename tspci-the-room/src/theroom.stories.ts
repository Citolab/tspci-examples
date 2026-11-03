import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { lastChange, mountPci, openPci, remountPci, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "The Room 3D",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Room = {
  exercise: string;
  scene: string | null;
  objects: { id: string; pos: number[]; rot: (number | string)[] }[];
  score?: Record<string, number | null>;
};

/** The response, parsed (it is the JSON text of the original). */
const room = (mounted: MountedPci): Room => JSON.parse(mounted.pci.getResponse()!.base.string);

/** The PCI once the exercise is built (the list of furniture in the room is there). */
const openRoom = async (canvasElement: HTMLElement, name = "Family table 1") => {
  const mounted = await openPci(canvasElement);
  await waitFor(() => expect(mounted.canvas.getByRole("button", { name })).toBeInTheDocument());
  return mounted;
};

/** A key on the room (the view only listens to keys aimed at the room itself). */
const press = (mounted: MountedPci, key: string, options: KeyboardEventInit = {}) =>
  mounted.canvas.getByRole("application").dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }));

/** A response a qti-interaction-changed event carried, parsed. */
const changed = (value: unknown): Room => JSON.parse((value as { base: { string: string } }).base.string);

const announced = (mounted: MountedPci, text: string) =>
  waitFor(() => expect(mounted.root.querySelector("[aria-live]")!.textContent!.replace(/ $/, "")).toBe(text));

const rot = (y: number) => [0, y, 0, "XYZ"];
/** The restaurant's layout at the start (exercise.ts). */
const restaurant = [
  { id: "table", pos: [-1.8, 0, -1.2], rot: rot(0) },
  { id: "table", pos: [-1.8, 0, 1.4], rot: rot(0) },
  { id: "table", pos: [1, 0, -1.2], rot: rot(0) },
  { id: "table", pos: [1, 0, 1.4], rot: rot(0) },
  { id: "tablefortwo", pos: [3.8, 0, -1.2], rot: rot(0) },
  { id: "tablefortwo", pos: [3.8, 0, 1], rot: rot(0) },
  { id: "playcorner", pos: [-4.6, 0, -1], rot: rot(0) },
  { id: "buffet", pos: [3.5, 0, 3.4], rot: rot(0) },
];
/** How the restaurant's own rules score that layout. */
const restaurantScore = {
  playcorner_in_corner: 0,
  no_collisions: 1,
  tables_for_two_at_wall: 0,
  family_tables_near_playcorner: 1,
  buffet_in_zone: 0,
  toilet_free: 1,
  kitchen_free: 1,
  entrance_free: 1,
};
const withFirstTable = (pos: number[], y: number) => [{ id: "table", pos, rot: rot(y) }, ...restaurant.slice(1)];

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openRoom(canvasElement);
    const { canvas, root, pci } = mounted;
    // the restaurant's own instruction, and the room in 3D
    expect(canvas.getByText(/^Furnish the restaurant\. Put the play corner in the corner by the windows/)).toBeInTheDocument();
    expect(canvas.getByRole("application", { name: "Room in 3D" }).querySelector("canvas")).not.toBeNull();
    expect(canvas.queryByText(/cannot show the room in 3D/)).not.toBeInTheDocument();
    // all the furniture is in the room already: nothing left to add
    const add = canvas.getAllByRole("button", { name: /^Add / });
    expect(add.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Add Family table, none left",
      "Add Table for two, none left",
      "Add Play corner, none left",
      "Add Buffet, none left",
    ]);
    for (const button of add) expect(button).toBeDisabled();
    const inRoom = root.querySelector('[aria-labelledby="inroom-heading"]')!;
    expect([...inRoom.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "Family table 1", "Family table 2", "Family table 3", "Family table 4",
      "Table for two 1", "Table for two 2", "Play corner", "Buffet",
    ]);
    expect(canvas.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(canvas.getByRole("button", { name: "Start over" })).toBeDisabled();
    expect(canvas.getByRole("button", { name: "Reset view" })).toBeEnabled();
    // no response until the candidate changes the room
    expect(pci.getResponse()).toBeUndefined();
    expect(mounted.changes).toEqual([]);
  },
};

export const TurnFurniture: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openRoom(canvasElement);
    const { canvas } = mounted;

    await step("a piece selected in the list gets its tools", async () => {
      const table = canvas.getByRole("button", { name: "Family table 1" });
      await userEvent.click(table);
      expect(table).toHaveAttribute("aria-pressed", "true");
      expect(canvas.getByRole("group", { name: "Family table 1" })).toBeInTheDocument();
      await announced(mounted, "Family table 1 selected");
    });

    await step("turn left: a quarter turn, scored with the restaurant's rules", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Turn left" }));
      const expected = { exercise: "restaurant", scene: null, objects: withFirstTable([-1.8, 0, -1.2], 1.570796), score: restaurantScore };
      expect(room(mounted)).toEqual(expected);
      expect(changed(await lastChange(mounted, 1))).toEqual(expected);
      await announced(mounted, "Family table 1 turned to 90°");
    });

    await step("turn right: back again", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Turn right" }));
      expect(room(mounted).objects).toEqual(restaurant);
      await announced(mounted, "Family table 1 turned to 0°");
    });

    await step("deselect", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Deselect" }));
      expect(canvas.queryByRole("group")).not.toBeInTheDocument();
      await announced(mounted, "Nothing selected");
    });
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openRoom(canvasElement);

    await step("N selects the next piece", async () => {
      press(mounted, "n");
      await announced(mounted, "Family table 1 selected");
      expect(mounted.canvas.getByRole("button", { name: "Family table 1" })).toHaveAttribute("aria-pressed", "true");
    });

    await step("the arrow keys move it on the 25 cm grid, away from the camera is up", async () => {
      press(mounted, "ArrowUp");
      // z -1.2 → -1.45 → the grid: -1.5; x -1.8 → the grid: -1.75
      expect(room(mounted).objects).toEqual(withFirstTable([-1.75, 0, -1.5], 0));
      await announced(mounted, "Family table 1 moved");
      press(mounted, "ArrowRight");
      expect(room(mounted).objects).toEqual(withFirstTable([-1.5, 0, -1.5], 0));
      // Shift: 5 cm, off the grid
      press(mounted, "ArrowLeft", { shiftKey: true });
      expect(room(mounted).objects).toEqual(withFirstTable([-1.55, 0, -1.5], 0));
    });

    await step("R turns it clockwise, Shift+R back", async () => {
      press(mounted, "r");
      expect(room(mounted).objects[0].rot).toEqual(rot(4.712389));
      await announced(mounted, "Family table 1 turned to 270°");
      press(mounted, "R", { shiftKey: true });
      expect(room(mounted).objects[0].rot).toEqual(rot(0));
    });

    await step("Ctrl+Z undoes the last change, Escape deselects", async () => {
      press(mounted, "z", { ctrlKey: true });
      await announced(mounted, "Undone");
      expect(room(mounted).objects[0].rot).toEqual(rot(4.712389));
      press(mounted, "Escape");
      await announced(mounted, "Nothing selected");
      expect(mounted.canvas.queryByRole("group")).not.toBeInTheDocument();
      expect(mounted.changes).toHaveLength(6);
    });
  },
};

export const TakeOutAndAdd: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openRoom(canvasElement);
    const { canvas } = mounted;

    await step("take out a table for two: it goes back to the list", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Table for two 1" }));
      await userEvent.click(canvas.getByRole("button", { name: "Take out" }));
      await announced(mounted, "Table for two 1 taken out of the room");
      expect(room(mounted).objects).toEqual([...restaurant.slice(0, 4), ...restaurant.slice(5)]);
      expect(canvas.queryByRole("button", { name: "Table for two 2" })).not.toBeInTheDocument();
      expect(canvas.getByRole("button", { name: "Add Table for two, 1 left" })).toBeEnabled();
    });

    await step("add it again: it lands in a free spot, selected", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Add Table for two, 1 left" }));
      await announced(mounted, "Table for two 2 added");
      expect(canvas.getByRole("button", { name: "Add Table for two, none left" })).toBeDisabled();
      expect(canvas.getByRole("button", { name: "Table for two 2" })).toHaveAttribute("aria-pressed", "true");
      const { objects, score } = room(mounted);
      expect(objects.map((o) => o.id)).toEqual([...restaurant.slice(0, 4), ...restaurant.slice(5)].map((o) => o.id).concat("tablefortwo"));
      // it does not overlap anything
      expect(score!.no_collisions).toBe(1);
      expect(canvas.queryByText(/^Overlaps/)).not.toBeInTheDocument();
    });

    await step("Delete takes out the selected piece", async () => {
      press(mounted, "Delete");
      await waitFor(() => expect(room(mounted).objects).toHaveLength(7));
      expect(canvas.getByRole("button", { name: "Add Table for two, 1 left" })).toBeEnabled();
    });
  },
};

export const UndoAndStartOver: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openRoom(canvasElement);
    const { canvas } = mounted;
    await userEvent.click(canvas.getByRole("button", { name: "Family table 1" }));
    await userEvent.click(canvas.getByRole("button", { name: "Turn left" }));
    await userEvent.click(canvas.getByRole("button", { name: "Turn left" }));
    expect(room(mounted).objects[0].rot).toEqual(rot(3.141593));

    const undo = canvas.getByRole("button", { name: "Undo" });
    await waitFor(() => expect(undo).toBeEnabled());
    await userEvent.click(undo);
    expect(room(mounted).objects[0].rot).toEqual(rot(1.570796));

    const startOver = canvas.getByRole("button", { name: "Start over" });
    await userEvent.click(startOver);
    await announced(mounted, "Back to the layout at the start");
    // the candidate did change the room: the response is the layout at the start, scored
    expect(room(mounted)).toEqual({ exercise: "restaurant", scene: null, objects: restaurant, score: restaurantScore });
    await waitFor(() => expect(startOver).toBeDisabled());
    // start over can be undone too
    await userEvent.click(undo);
    expect(room(mounted).objects[0].rot).toEqual(rot(1.570796));
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl" } },
  play: async ({ canvasElement }) => {
    const mounted = await openRoom(canvasElement, "Gezinstafel 1");
    const { canvas } = mounted;
    expect(canvas.getByText(/^Richt het restaurant in\./)).toBeInTheDocument();
    expect(canvas.getByRole("heading", { name: "Meubels" })).toBeInTheDocument();
    expect(canvas.getByRole("heading", { name: "In de kamer" })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Gezinstafel toevoegen, geen meer" })).toBeDisabled();
    expect(canvas.getByRole("application", { name: "Kamer in 3D" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Tafel voor twee 2" }));
    await userEvent.click(canvas.getByRole("button", { name: "Linksom draaien" }));
    await announced(mounted, "Tafel voor twee 2 gedraaid naar 90°");
    await userEvent.click(canvas.getByRole("button", { name: "Weghalen" }));
    await announced(mounted, "Tafel voor twee 2 uit de kamer gehaald");
    expect(canvas.getByRole("button", { name: "Tafel voor twee toevoegen, nog 1" })).toBeEnabled();
  },
};

export const PromptAndRotationStep: Story = {
  args: { properties: { prompt: "Turn the buffet.", rotationStep: "45" } },
  play: async ({ canvasElement }) => {
    const mounted = await openRoom(canvasElement);
    const { canvas } = mounted;
    // the item's instruction instead of the exercise's
    expect(canvas.getByText("Turn the buffet.")).toBeInTheDocument();
    expect(canvas.queryByText(/^Furnish the restaurant/)).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Buffet" }));
    await userEvent.click(canvas.getByRole("button", { name: "Turn left" }));
    await announced(mounted, "Buffet turned to 45°");
    expect(room(mounted).objects[7].rot).toEqual(rot(0.785398));
  },
};

/** A room of 4 × 4 m with a corner zone, boxes, and one box the author fixed in place. */
const boxes = JSON.stringify({
  id: "boxes",
  prompt: "Put a box in the corner.",
  room: { width: 4, depth: 4, zones: [{ name: "corner_zone", x: -1.5, z: -1.5, width: 1, depth: 1 }] },
  assets: [
    { id: "box", label: "Box", shape: "box", width: 0.5, depth: 0.5, height: 0.5, count: 3, wallSnap: true },
    { id: "crate", label: "Crate", shape: "box", width: 0.5, depth: 0.5, height: 0.5, count: 1 },
  ],
  objects: [{ id: "crate", pos: [1.5, 0, 1.5], static: true }, { id: "box", pos: [0, 0, 0] }],
  rules: [
    { name: "box_in_corner", object: "box", inZone: "corner" },
    { name: "no_overlap", noOverlap: true },
    { name: "boxes_at_wall", object: "box", nearWall: true, value: "count" },
    { name: "three_boxes", object: "^box$", count: "==3" },
    { name: "unknown_zone", inZone: "nowhere" },
  ],
});
const layout = (...objects: { id: string; pos: number[] }[]) => ({
  base: { string: JSON.stringify({ exercise: "boxes", scene: null, objects: objects.map((o) => ({ ...o, rot: rot(0) })) }) },
});
const crate = { id: "crate", pos: [1.5, 0, 1.5] };

export const CustomExercise: Story = {
  args: { properties: { exercise: boxes } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openRoom(canvasElement, "Box 1");
    const { canvas, pci } = mounted;

    await step("the exercise's room, furniture and fixed piece", async () => {
      expect(canvas.getByText("Put a box in the corner.")).toBeInTheDocument();
      expect(canvas.getByRole("button", { name: "Add Box, 2 left" })).toBeEnabled();
      expect(canvas.getByRole("button", { name: "Add Crate, none left" })).toBeDisabled();
      // the fixed crate cannot be selected
      const fixed = canvas.getByRole("button", { name: "Crate (fixed)" });
      expect(fixed).toBeDisabled();
      // N skips it
      press(mounted, "n");
      await announced(mounted, "Box 1 selected");
    });

    await step("a box in the corner, against the wall", async () => {
      pci.setResponse(layout(crate, { id: "box", pos: [-1.5, 0, -1.5] }, { id: "box", pos: [0.5, 0, 0.5] }));
      expect(room(mounted)).toEqual({
        exercise: "boxes",
        scene: null,
        objects: [{ ...crate, rot: rot(0) }, { id: "box", pos: [-1.5, 0, -1.5], rot: rot(0) }, { id: "box", pos: [0.5, 0, 0.5], rot: rot(0) }],
        score: { box_in_corner: 1, no_overlap: 1, boxes_at_wall: 1, three_boxes: 0, unknown_zone: null },
      });
      // the crate of the response is the fixed one of the exercise
      expect(canvas.getByRole("button", { name: "Crate (fixed)" })).toBeDisabled();
    });

    await step("three boxes, two of them overlapping, none in the corner", async () => {
      pci.setResponse(layout(crate, { id: "box", pos: [0, 0, 0] }, { id: "box", pos: [0.2, 0, 0] }, { id: "box", pos: [-1, 0, 1.75] }));
      expect(room(mounted).score).toEqual({ box_in_corner: 0, no_overlap: 0, boxes_at_wall: 0, three_boxes: 1, unknown_zone: null });
    });
  },
};

export const ScoringRulesSetting: Story = {
  args: {
    properties: {
      exercise: boxes,
      scoringRules: JSON.stringify([
        { name: "corner_free", inZone: "corner", count: "==0" },
        { name: "boxes", object: "box", value: "count" },
      ]),
    },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openRoom(canvasElement, "Box 1");
    // the item's rules instead of the exercise's
    mounted.pci.setResponse(layout(crate, { id: "box", pos: [-1.5, 0, -1.5] }, { id: "box", pos: [0, 0, 0] }));
    expect(room(mounted).score).toEqual({ corner_free: 0, boxes: 2 });
    mounted.pci.setResponse(layout(crate, { id: "box", pos: [0, 0, 0] }));
    expect(room(mounted).score).toEqual({ corner_free: 1, boxes: 1 });
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openRoom(canvasElement);
    await userEvent.click(first.canvas.getByRole("button", { name: "Family table 1" }));
    await userEvent.click(first.canvas.getByRole("button", { name: "Turn left" }));
    press(first, "ArrowUp");
    const before = room(first);
    expect(before.objects).toEqual(withFirstTable([-1.75, 0, -1.5], 1.570796));

    const second = await remountPci(canvasElement, pci, { state: first.pci.getState() });
    await waitFor(() => expect(second.canvas.getByRole("button", { name: "Family table 1" })).toBeInTheDocument());
    expect(room(second)).toEqual(before);
    expect(second.changes).toEqual([]);
    // the undo history came along
    const undo = second.canvas.getByRole("button", { name: "Undo" });
    await waitFor(() => expect(undo).toBeEnabled());
    await userEvent.click(undo);
    expect(room(second).objects).toEqual(withFirstTable([-1.8, 0, -1.2], 1.570796));
  },
};

const moved = { exercise: "restaurant", scene: null, objects: [{ id: "buffet", pos: [-0.4, 0, -4.5], rot: rot(0) }] };

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: { base: { string: JSON.stringify(moved) } } } },
  play: async ({ canvasElement }) => {
    const mounted = await openRoom(canvasElement, "Buffet");
    const { canvas, pci, root } = mounted;
    // only the buffet is in the room, in its zone
    const inRoom = root.querySelector('[aria-labelledby="inroom-heading"]')!;
    await waitFor(() => expect([...inRoom.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Buffet"]));
    expect(canvas.getByRole("button", { name: "Add Family table, 4 left" })).toBeEnabled();
    const response = room(mounted);
    expect(response.objects).toEqual(moved.objects);
    expect(response.score!.buffet_in_zone).toBe(1);
    // what the player handed over is no change to tell it about
    expect(mounted.changes).toEqual([]);

    // resetResponse: the exercise's layout, and no response
    pci.resetResponse();
    await waitFor(() => expect(inRoom.querySelectorAll("button")).toHaveLength(8));
    expect(pci.getResponse()).toBeUndefined();
    expect(await lastChange(mounted)).toBeUndefined();
    expect(mounted.changes).toHaveLength(1);
  },
};

export const Solution: Story = {
  args: {
    status: "solution",
    responseDeclaration: { cardinality: "single", baseType: "string", correctResponse: { value: JSON.stringify(moved) } },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openRoom(canvasElement, "Buffet");
    const inRoom = mounted.root.querySelector('[aria-labelledby="inroom-heading"]')!;
    await waitFor(() => expect([...inRoom.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Buffet"]));
    expect(room(mounted).objects).toEqual(moved.objects);
    expect(mounted.changes).toEqual([]);
  },
};
