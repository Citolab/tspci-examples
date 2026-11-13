import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { lastChange, mountPci, openPci, remountPci, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Paint",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Point = [number, number];

const canvasOf = (root: MountedPci["root"]) => root.querySelector<HTMLCanvasElement>("canvas")!;

/** Drags the mouse over the canvas through the given points, in canvas pixels. */
const draw = (canvas: HTMLCanvasElement, points: Point[]) => {
  const rect = canvas.getBoundingClientRect();
  const at = ([x, y]: Point) => ({
    clientX: rect.left + (x * rect.width) / canvas.width,
    clientY: rect.top + (y * rect.height) / canvas.height,
  });
  const fire = (type: string, p: Point) =>
    canvas.dispatchEvent(
      new PointerEvent(type, { ...at(p), pointerId: 1, pointerType: "mouse", button: 0, buttons: type === "pointerup" ? 0 : 1, bubbles: true, cancelable: true, composed: true })
    );
  fire("pointerdown", points[0]);
  points.slice(1).forEach((p) => fire("pointermove", p));
  fire("pointerup", points[points.length - 1]);
};

/** The colour of a pixel of a PNG data URL (the response), as [r, g, b, a]. */
const pixelOf = async (dataUrl: string, x: number, y: number) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return [...ctx.getImageData(x, y, 1, 1).data];
};

const sizeOf = async (dataUrl: string) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  return [img.naturalWidth, img.naturalHeight];
};

const responseUrl = (m: MountedPci) => m.pci.getResponse()?.base?.string as string;
const operations = (m: MountedPci) => JSON.parse(m.pci.getState()).state.operations;

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;

    await step("the prompt, the toolbar and an empty canvas; no response", async () => {
      expect(canvas.getByText("Make a drawing.")).toBeInTheDocument();
      expect(canvas.getByRole("toolbar", { name: "Drawing tools" })).toBeInTheDocument();
      expect(canvas.getAllByRole("radio", { name: /./ }).filter((r) => r.getAttribute("name") === "color")).toHaveLength(13);
      expect(canvas.getByRole("radio", { name: "black" })).toBeChecked();
      expect(canvas.getByRole("radio", { name: "2 px" })).toBeChecked();
      expect(canvas.getByRole("application")).toHaveAttribute("aria-label", "Make a drawing. (empty)");
      expect(canvas.getByRole("button", { name: "Undo" })).toBeDisabled();
      expect(canvas.getByRole("button", { name: "Redo" })).toBeDisabled();
      expect(canvas.getByRole("button", { name: "Clear" })).toBeDisabled();
      expect(canvasOf(root)).toHaveAttribute("width", "800");
      expect(canvasOf(root)).toHaveAttribute("height", "600");
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("a red, thick stroke is the response: a PNG of the canvas with the line on it", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "red" }));
      await userEvent.click(canvas.getByRole("radio", { name: "16 px" }));
      draw(canvasOf(root), [[100, 100], [200, 100], [300, 100]]);
      const change = (await lastChange(mounted)) as { base: { string: string } };
      expect(change.base.string).toMatch(/^data:image\/png;base64,/);
      expect(responseUrl(mounted)).toBe(change.base.string);
      expect(await sizeOf(responseUrl(mounted))).toEqual([800, 600]);
      expect(await pixelOf(responseUrl(mounted), 200, 100)).toEqual([220, 53, 69, 255]); // #dc3545
      expect(await pixelOf(responseUrl(mounted), 200, 140)).toEqual([0, 0, 0, 0]);
      expect(operations(mounted)).toEqual([
        { kind: "stroke", color: "#dc3545", size: 16, points: [100, 100, 0.5, 200, 100, 0.5, 300, 100, 0.5] },
      ]);
      expect(canvas.getByRole("application")).toHaveAttribute("aria-label", "Make a drawing. (1 stroke)");
    });

    await step("the eraser takes away what is under it, not the rest", async () => {
      const eraser = canvas.getByRole("button", { name: "Eraser" });
      await userEvent.click(eraser);
      expect(eraser).toHaveAttribute("aria-pressed", "true");
      // no colour is selected while erasing
      expect(canvas.getByRole("radio", { name: "red" })).not.toBeChecked();
      await userEvent.click(canvas.getByRole("radio", { name: "24 px" }));
      draw(canvasOf(root), [[200, 60], [200, 140]]);
      await lastChange(mounted, 2);
      expect(await pixelOf(responseUrl(mounted), 200, 100)).toEqual([0, 0, 0, 0]);
      expect(await pixelOf(responseUrl(mounted), 120, 100)).toEqual([220, 53, 69, 255]);
      expect(operations(mounted)[1]).toMatchObject({ kind: "stroke", color: null, size: 24 });
      // an eraser stroke is not counted as a line
      expect(canvas.getByRole("application")).toHaveAttribute("aria-label", "Make a drawing. (1 stroke)");
    });
  },
};

export const Fill: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root } = mounted;
    const fill = canvas.getByRole("button", { name: "Fill" });
    const eraser = canvas.getByRole("button", { name: "Eraser" });
    // a closed black shape: a square from (100, 100) to (300, 300), its corners rounded by the smoothing
    draw(canvasOf(root), [[100, 100], [300, 100], [300, 300], [100, 300], [100, 100]]);
    await lastChange(mounted);

    await step("fill and eraser are toggles that turn each other off", async () => {
      await userEvent.click(eraser);
      await userEvent.click(fill);
      expect(fill).toHaveAttribute("aria-pressed", "true");
      expect(eraser).toHaveAttribute("aria-pressed", "false");
    });

    await step("a click fills the area inside the lines, not outside, and the line stays", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "blue" }));
      expect(fill).toHaveAttribute("aria-pressed", "true");
      draw(canvasOf(root), [[200, 200]]);
      await lastChange(mounted, 2);
      expect(operations(mounted)[1]).toEqual({ kind: "fill", color: "#007bff", x: 200, y: 200 });
      const inside = await pixelOf(responseUrl(mounted), 200, 200);
      expect(inside).toEqual([0, 123, 255, 255]);
      expect(await pixelOf(responseUrl(mounted), 140, 200)).toEqual([0, 123, 255, 255]);
      expect(await pixelOf(responseUrl(mounted), 400, 400)).toEqual([0, 0, 0, 0]);
      expect((await pixelOf(responseUrl(mounted), 200, 100)).slice(0, 3)).toEqual([0, 0, 0]);
      expect(canvas.getByRole("application")).toHaveAttribute("aria-label", "Make a drawing. (1 stroke, 1 fill)");
      expect(root.querySelector('[aria-live="polite"]')).toHaveTextContent("Filled with blue at 200, 200");
    });

    await step("Space fills at the keyboard cursor; undo takes a fill back", async () => {
      canvas.getByRole("application").focus();
      await userEvent.keyboard(" "); // the cursor starts at (400, 300): outside the square
      await lastChange(mounted, 3);
      expect(await pixelOf(responseUrl(mounted), 600, 500)).toEqual([0, 123, 255, 255]);
      await userEvent.click(canvas.getByRole("button", { name: "Undo" }));
      expect(await pixelOf(responseUrl(mounted), 600, 500)).toEqual([0, 0, 0, 0]);
    });
  },
};

export const UndoRedoClear: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;
    const undo = canvas.getByRole("button", { name: "Undo" });
    const redo = canvas.getByRole("button", { name: "Redo" });
    const clear = canvas.getByRole("button", { name: "Clear" });

    draw(canvasOf(root), [[10, 10], [50, 50]]);
    draw(canvasOf(root), [[100, 10], [150, 60]]);
    await lastChange(mounted, 2);
    const twoStrokes = responseUrl(mounted);

    await step("undo takes back the last stroke, redo brings it back", async () => {
      await userEvent.click(undo);
      expect(operations(mounted)).toHaveLength(1);
      expect(redo).toBeEnabled();
      expect(canvas.getByRole("application")).toHaveAttribute("aria-label", "Make a drawing. (1 stroke)");
      await userEvent.click(redo);
      expect(operations(mounted)).toHaveLength(2);
      expect(redo).toBeDisabled();
      expect(responseUrl(mounted)).toBe(twoStrokes);
    });

    await step("Ctrl+Z and Ctrl+Y do the same", async () => {
      canvas.getByRole("application").focus();
      await userEvent.keyboard("{Control>}z{/Control}");
      expect(operations(mounted)).toHaveLength(1);
      await userEvent.keyboard("{Control>}y{/Control}");
      expect(operations(mounted)).toHaveLength(2);
    });

    await step("clear empties the canvas: no response, and it can be undone", async () => {
      await userEvent.click(clear);
      expect(pci.getResponse()).toBeUndefined();
      expect(await lastChange(mounted)).toBeUndefined();
      expect(clear).toBeDisabled();
      expect(canvas.getByRole("application")).toHaveAttribute("aria-label", "Make a drawing. (empty)");
      expect(root.querySelector('[aria-live="polite"]')).toHaveTextContent("Canvas cleared");
      await userEvent.click(undo);
      expect(responseUrl(mounted)).toBe(twoStrokes);
    });

    await step("a new stroke after undo drops what could be redone", async () => {
      await userEvent.click(undo);
      expect(redo).toBeEnabled();
      draw(canvasOf(root), [[300, 300], [320, 320]]);
      await waitFor(() => expect(redo).toBeDisabled());
      expect(operations(mounted)).toHaveLength(2);
    });
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root } = mounted;
    const area = canvas.getByRole("application");
    expect(area).toHaveAccessibleDescription(/the arrow keys move the pen/);
    area.focus();
    // the pen starts in the middle (400, 300): down, 3 steps right (10 px each), 1 small step down (Shift: 2 px), up
    await userEvent.keyboard(" ");
    expect(root.querySelector('[aria-live="polite"]')).toHaveTextContent("Pen down at 400, 300");
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{Shift>}{ArrowDown}{/Shift}");
    await userEvent.keyboard(" ");
    expect(root.querySelector('[aria-live="polite"]')).toHaveTextContent("Pen lifted");
    expect(operations(mounted)).toEqual([
      { kind: "stroke", color: "#000000", size: 2, points: [400, 300, 0.5, 410, 300, 0.5, 420, 300, 0.5, 430, 300, 0.5, 430, 302, 0.5] },
    ]);
    expect(await lastChange(mounted)).toEqual({ base: { string: responseUrl(mounted) } });
    expect(await pixelOf(responseUrl(mounted), 415, 300)).toEqual([0, 0, 0, 255]);

    // moving with the pen up draws nothing; Escape lifts the pen too
    await userEvent.keyboard("{ArrowUp}{ArrowUp} {ArrowLeft}{Escape}");
    expect(operations(mounted)).toHaveLength(2);
    expect(operations(mounted)[1].points).toEqual([430, 282, 0.5, 420, 282, 0.5]);
  },
};

export const Settings: Story = {
  args: {
    properties: { prompt: "Draw a tree.", colors: "red; #00F\nnot-a-colour", defaultColor: "#00FF00", strokes: "3, 3, 500, 0, 10", defaultStroke: "7", width: "50", height: "abc" },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root } = mounted;
    expect(canvas.getByText("Draw a tree.")).toBeInTheDocument();
    // the colour at the start is added in front; invalid colours are left out
    const colors = [...root.querySelectorAll<HTMLInputElement>('input[name="color"]')].map((r) => r.getAttribute("aria-label"));
    expect(colors).toEqual(["green", "red", "blue"]);
    expect(canvas.getByRole("radio", { name: "green" })).toBeChecked();
    // sizes: duplicates, 0 and over 200 left out, the size at the start added, sorted
    const sizes = [...root.querySelectorAll<HTMLInputElement>('input[name="size"]')].map((r) => r.getAttribute("aria-label"));
    expect(sizes).toEqual(["3 px", "7 px", "10 px"]);
    expect(canvas.getByRole("radio", { name: "7 px" })).toBeChecked();
    // a width below 100 is 100; a height that is no number the default
    expect(canvasOf(root)).toHaveAttribute("width", "100");
    expect(canvasOf(root)).toHaveAttribute("height", "600");

    draw(canvasOf(root), [[20, 20], [80, 20]]);
    await lastChange(mounted);
    expect(operations(mounted)[0]).toMatchObject({ color: "#00ff00", size: 7 });
    expect(await sizeOf(responseUrl(mounted))).toEqual([100, 600]);
    expect(await pixelOf(responseUrl(mounted), 50, 20)).toEqual([0, 255, 0, 255]);
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", prompt: "" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    expect(canvas.getByRole("toolbar", { name: "Tekengereedschap" })).toBeInTheDocument();
    expect(canvas.getByRole("radio", { name: "zwart" })).toBeChecked();
    expect(canvas.getByRole("radio", { name: "rood" })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Gum" })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Ongedaan maken" })).toBeDisabled();
    expect(canvas.getByRole("button", { name: "Opnieuw" })).toBeDisabled();
    expect(canvas.getByRole("button", { name: "Wissen" })).toBeDisabled();
    // without a prompt the canvas is named after itself
    expect(canvas.getByRole("application")).toHaveAttribute("aria-label", "Tekenvlak (leeg)");
    expect(canvas.getByText(/Teken met de muis/)).toBeInTheDocument();
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    draw(canvasOf(first.root), [[100, 100], [200, 200]]);
    draw(canvasOf(first.root), [[300, 100], [400, 200]]);
    await userEvent.click(first.canvas.getByRole("button", { name: "Undo" }));
    const state = first.pci.getState();
    const response = responseUrl(first);

    const second = await remountPci(canvasElement, pci, { state });
    expect(second.pci.getState()).toBe(state);
    expect(responseUrl(second)).toBe(response);
    // the history came along: the undone stroke can be redone
    expect(second.canvas.getByRole("button", { name: "Redo" })).toBeEnabled();
    await userEvent.click(second.canvas.getByRole("button", { name: "Redo" }));
    expect(operations(second)).toHaveLength(2);
    expect(await pixelOf(responseUrl(second), 350, 150)).toEqual([0, 0, 0, 255]);
    // restoring is not a change of the candidate's
    expect(second.changes).toHaveLength(1);

    // a state of something else: an empty canvas
    const third = await remountPci(canvasElement, pci, { state: '{"foo":1}' });
    expect(third.pci.getResponse()).toBeUndefined();
  },
};

/** A 800×600 PNG with a blue square at the top left, as a response a player hands back. */
const bluePng = () => {
  const c = document.createElement("canvas");
  c.width = 800;
  c.height = 600;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0000ff";
  ctx.fillRect(0, 0, 100, 100);
  return c.toDataURL("image/png");
};
const BLUE = bluePng();

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: { base: { string: BLUE } } } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;

    await step("the drawing handed over is the response as it is, and is shown", async () => {
      expect(pci.getResponse()).toEqual({ base: { string: BLUE } });
      expect(mounted.changes).toHaveLength(0);
      expect(canvas.getByRole("button", { name: "Clear" })).toBeEnabled();
      await waitFor(() => expect([...canvasOf(root).getContext("2d")!.getImageData(50, 50, 1, 1).data]).toEqual([0, 0, 255, 255]));
    });

    await step("a stroke is drawn on top of it", async () => {
      draw(canvasOf(root), [[300, 300], [400, 300]]);
      await lastChange(mounted);
      expect(await pixelOf(responseUrl(mounted), 50, 50)).toEqual([0, 0, 255, 255]);
      expect(await pixelOf(responseUrl(mounted), 350, 300)).toEqual([0, 0, 0, 255]);
    });

    await step("setResponse with something that is no drawing empties the canvas; resetResponse too", async () => {
      pci.setResponse({ base: { string: BLUE } });
      expect(pci.getResponse()).toEqual({ base: { string: BLUE } });
      expect(operations(mounted)).toEqual([]);
      pci.setResponse({ base: { string: "hello" } });
      expect(pci.getResponse()).toBeUndefined();
      pci.setResponse({ base: { string: BLUE } });
      pci.resetResponse();
      expect(pci.getResponse()).toBeUndefined();
      expect(await lastChange(mounted)).toBeUndefined();
    });
  },
};
