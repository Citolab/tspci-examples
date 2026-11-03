import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { afterPaint, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Fraction model",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Canvas = MountedPci["canvas"];
type Record = { record: { name: string; base: { integer?: number; string?: string; float?: number } | null }[] } | undefined;

/** A field of the record response (data-scoring="pci"). */
const field = (response: unknown, name: string) => (response as Record)?.record.find((f) => f.name === name)?.base;
const list = (...values: string[]) => ({ list: { string: values } });
/** A model, by the start of its accessible name ("Bar B"). */
const model = (canvas: Canvas, name: string) => within(canvas.getByRole("group", { name: new RegExp(`^${name}:`) }) as HTMLElement);
const picture = (canvas: Canvas, name: string) => canvas.getByRole("img", { name: new RegExp(`^${name}:`) });
const part = (canvas: Canvas, name: string, part: string) => model(canvas, name).getByRole("checkbox", { name: part });
const shadedOf = (canvas: Canvas, testid: string) => canvas.getByTestId(testid).getAttribute("data-shaded");

/** Drags over parts with pointer events, as a mouse or a finger does. */
const drag = async (from: Element, to: Element) => {
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const at = (r: DOMRect) => ({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, composed: true, pointerId: 1, button: 0, isPrimary: true });
  from.dispatchEvent(new PointerEvent("pointerdown", at(a)));
  for (let k = 1; k <= 4; k++) {
    const r = new DOMRect(a.left + ((b.left - a.left) * k) / 4, a.top + ((b.top - a.top) * k) / 4, a.width, a.height);
    to.dispatchEvent(new PointerEvent("pointermove", at(r)));
  }
  to.dispatchEvent(new PointerEvent("pointerup", at(b)));
  await afterPaint();
};

/** Sets a native number input and fires change, as the candidate typing and pressing Enter. */
const setNumber = async (input: HTMLElement, value: string) => {
  (input as HTMLInputElement).value = value;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await afterPaint();
};

const GRID = JSON.stringify({ models: [{ type: "grid", rows: 10, columns: 10, target: "35%" }] });
const DIVIDE = JSON.stringify({ models: [{ type: "bar", parts: 4, divide: true, min: 1, max: 24, scale: true, target: "5/12", requireParts: 12 }] });
const NAME = JSON.stringify({ models: [
  { type: "set", parts: 12, shaded: [0, 1, 2, 3], task: "name", target: "1/3" },
  { type: "circle", parts: 8, shaded: [0, 1, 2], task: "name", entry: "percent", target: "37.5%" },
] });

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText("Shade 2/3 of circle A and 4/6 of bar B.")).toBeInTheDocument();
    expect(canvas.getByRole("group", { name: "Circle A: 3 equal parts, 0 shaded" })).toBeInTheDocument();
    expect(model(canvas, "Bar B").getAllByRole("checkbox")).toHaveLength(6);
    expect(part(canvas, "Bar B", "Part 1 of 6")).toHaveAttribute("aria-checked", "false");
    expect(canvas.getByRole("status")).toHaveTextContent("");
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const ShadeWithTheMouse: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("a click shades a part, and says so", async () => {
      await userEvent.click(part(canvas, "Circle A", "Part 1 of 3"));
      expect(part(canvas, "Circle A", "Part 1 of 3")).toHaveAttribute("aria-checked", "true");
      expect(canvas.getByRole("status")).toHaveTextContent("Part 1 of 3 shaded. Circle A: 1 of 3 shaded.");
      expect(await lastChange(mounted)).toEqual(list("1/3", "0/1"));
    });

    await step("any two parts are 2/3", async () => {
      await userEvent.click(part(canvas, "Circle A", "Part 3 of 3"));
      expect(shadedOf(canvas, "svg-0")).toBe("0,2");
      expect(pci.getResponse()).toEqual(list("2/3", "0/1"));
    });

    await step("dragging over the bar shades every part it passes", async () => {
      await drag(part(canvas, "Bar B", "Part 2 of 6"), part(canvas, "Bar B", "Part 5 of 6"));
      expect(shadedOf(canvas, "svg-1")).toBe("1,2,3,4");
      expect(canvas.getByRole("status")).toHaveTextContent("Bar B: 4 of 6 shaded.");
      expect(pci.getResponse()).toEqual(list("2/3", "2/3"));
    });

    await step("a drag that starts on a shaded part unshades", async () => {
      await drag(part(canvas, "Bar B", "Part 5 of 6"), part(canvas, "Bar B", "Part 4 of 6"));
      expect(shadedOf(canvas, "svg-1")).toBe("1,2");
    });

    await step("clear one model", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Clear: Circle A" }));
      expect(shadedOf(canvas, "svg-0")).toBe("");
      expect(shadedOf(canvas, "svg-1")).toBe("1,2");
      expect(canvas.getByRole("status")).toHaveTextContent("Circle A cleared.");
    });
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const first = part(canvas, "Bar B", "Part 1 of 6");
    expect(first).toHaveAttribute("tabindex", "0");
    first.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight} {End}{Enter}");
    expect(part(canvas, "Bar B", "Part 3 of 6")).toHaveAttribute("aria-checked", "true");
    expect(part(canvas, "Bar B", "Part 6 of 6")).toHaveAttribute("aria-checked", "true");
    expect(part(canvas, "Bar B", "Part 6 of 6")).toHaveAttribute("tabindex", "0");
    expect(first).toHaveAttribute("tabindex", "-1");
    expect(canvas.getByRole("status")).toHaveTextContent("Part 6 of 6 shaded. Bar B: 2 of 6 shaded.");
    await userEvent.keyboard("{Home} ");
    expect(pci.getResponse()).toEqual(list("0/1", "1/2"));
    await userEvent.keyboard(" ");
    expect(part(canvas, "Bar B", "Part 1 of 6")).toHaveAttribute("aria-checked", "false");
  },
};

export const PercentOnAGrid: Story = {
  args: { properties: { models: GRID, prompt: "Shade 35% of the grid.", scoring: "pci" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const grid = model(canvas, "Grid");
    expect(grid.getAllByRole("checkbox")).toHaveLength(100);
    const cell = grid.getByRole("checkbox", { name: "Row 1, column 1" });
    cell.focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown} ");
    expect(grid.getByRole("checkbox", { name: "Row 3, column 1" })).toHaveAttribute("aria-checked", "true");
    // three rows and five more: 35 cells
    await drag(grid.getByRole("checkbox", { name: "Row 1, column 1" }), grid.getByRole("checkbox", { name: "Row 1, column 10" }));
    await drag(grid.getByRole("checkbox", { name: "Row 2, column 1" }), grid.getByRole("checkbox", { name: "Row 2, column 10" }));
    await drag(grid.getByRole("checkbox", { name: "Row 3, column 2" }), grid.getByRole("checkbox", { name: "Row 3, column 10" }));
    await drag(grid.getByRole("checkbox", { name: "Row 4, column 1" }), grid.getByRole("checkbox", { name: "Row 4, column 5" }));
    const r = pci.getResponse();
    expect(field(r, "fraction1")).toEqual({ string: "35/100" });
    expect(field(r, "value1")).toEqual({ float: 0.35 });
    expect(field(r, "score")).toEqual({ integer: 1 });
    expect(field(r, "correct")).toEqual({ integer: 1 });
  },
};

export const DivideTheBar: Story = {
  args: { properties: { models: DIVIDE, prompt: "Divide the bar so that you can shade 5/12, then shade 5/12.", scoring: "pci", showReadout: "true" } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("+ and − change the number of parts", async () => {
      await userEvent.click(part(canvas, "Bar", "Part 1 of 4"));
      await userEvent.click(canvas.getByRole("button", { name: "More parts: Bar" }));
      expect(model(canvas, "Bar").getAllByRole("checkbox")).toHaveLength(5);
      expect(canvas.getByRole("status")).toHaveTextContent("Bar divided into 5 equal parts; the shading is cleared.");
      await userEvent.click(canvas.getByRole("button", { name: "Fewer parts: Bar" }));
    });
    await step("type 12: 1/4 becomes 3/12, the shading stays", async () => {
      await userEvent.click(part(canvas, "Bar", "Part 1 of 4"));
      await setNumber(canvas.getByRole("spinbutton", { name: "Number of parts: Bar" }), "12");
      expect(model(canvas, "Bar").getAllByRole("checkbox")).toHaveLength(12);
      expect(shadedOf(canvas, "svg-0")).toBe("0,1,2");
      expect(canvas.getByRole("status")).toHaveTextContent("Bar divided into 12 equal parts.");
    });
    await step("two more: 5/12, scored", async () => {
      await userEvent.click(part(canvas, "Bar", "Part 4 of 12"));
      await userEvent.click(part(canvas, "Bar", "Part 9 of 12"));
      expect(canvas.getByTestId("readout-0")).toHaveTextContent("5/12 shaded · 41.67%");
      const r = pci.getResponse();
      expect(field(r, "fraction1")).toEqual({ string: "5/12" });
      expect(field(r, "parts1")).toEqual({ integer: 12 });
      expect(field(r, "check1")).toEqual({ integer: 1 });
    });
    await step("10/24 is 5/12, but not 12 parts (requireParts)", async () => {
      await setNumber(canvas.getByRole("spinbutton", { name: "Number of parts: Bar" }), "24");
      expect(shadedOf(canvas, "svg-0")?.split(",")).toHaveLength(10);
      expect(field(pci.getResponse(), "check1")).toEqual({ integer: 0 });
    });
  },
};

export const NameTheFraction: Story = {
  args: { properties: { models: NAME, prompt: "Which part of each model is shaded?" } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("the shading is given: a picture with a description", async () => {
      expect(picture(canvas, "Set A")).toHaveAccessibleName("Set A: 12 objects, 4 shaded, the shading is given");
      expect(canvas.queryAllByRole("checkbox")).toHaveLength(0);
    });
    await step("4/12 is 1/3; a letter is refused", async () => {
      await userEvent.type(canvas.getByRole("textbox", { name: "Numerator: Set A" }), "4x");
      expect(canvas.getByRole("textbox", { name: "Numerator: Set A" })).toHaveValue("4");
      expect(canvas.getByRole("status")).toHaveTextContent("Only digits.");
      await userEvent.type(canvas.getByRole("textbox", { name: "Denominator: Set A" }), "12");
      expect(pci.getResponse()).toEqual(list("1/3", ""));
    });
    await step("a percentage", async () => {
      await userEvent.type(canvas.getByRole("textbox", { name: "Percentage shaded in Circle B" }), "37.5");
      expect(pci.getResponse()).toEqual(list("1/3", "3/8"));
    });
  },
};

export const Dutch: Story = {
  args: { properties: { models: NAME, language: "nl", scoring: "pci" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(picture(canvas, "Verzameling A")).toHaveAccessibleName("Verzameling A: 12 voorwerpen, 4 gekleurd, de kleuring is gegeven");
    await userEvent.type(canvas.getByRole("textbox", { name: "Teller: Verzameling A" }), "1");
    await userEvent.type(canvas.getByRole("textbox", { name: "Noemer: Verzameling A" }), "3");
    const percent = canvas.getByRole("textbox", { name: "Gekleurd deel van Cirkel B, in procenten" });
    await userEvent.type(percent, "37,5");
    expect(percent).toHaveValue("37,5");
    const r = pci.getResponse();
    expect(field(r, "fraction2")).toEqual({ string: "375/1000" });
    expect(field(r, "score")).toEqual({ integer: 2 });
    expect(field(r, "maxscore")).toEqual({ integer: 2 });
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.click(part(first.canvas, "Circle A", "Part 2 of 3"));
    await userEvent.click(part(first.canvas, "Bar B", "Part 6 of 6"));
    const state = first.pci.getState();
    expect(JSON.parse(state).state.models.map((m: { shaded: number[] }) => m.shaded)).toEqual([[1], [5]]);
    const second = await remountPci(canvasElement, pci, { state });
    expect(part(second.canvas, "Circle A", "Part 2 of 3")).toHaveAttribute("aria-checked", "true");
    expect(part(second.canvas, "Bar B", "Part 6 of 6")).toHaveAttribute("aria-checked", "true");
    expect(second.pci.getResponse()).toEqual(first.pci.getResponse());
    expect(second.changes).toHaveLength(0);
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: list("1/3", "1/2") } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("the bound response is shaded: the first parts", async () => {
      await waitFor(() => expect(shadedOf(canvas, "svg-1")).toBe("0,1,2"));
      expect(shadedOf(canvas, "svg-0")).toBe("0");
      expect(pci.getResponse()).toEqual(list("1/3", "1/2"));
    });
    await step("resetResponse: the models as the item starts", async () => {
      pci.resetResponse();
      await waitFor(() => expect(shadedOf(canvas, "svg-1")).toBe(""));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: { status: "solution", properties: { models: DIVIDE } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await waitFor(() => expect(canvas.getByTestId("svg-0")).toHaveAttribute("data-parts", "12"));
    expect(shadedOf(canvas, "svg-0")).toBe("0,1,2,3,4");
    expect(canvas.getByText("The correct answer.", { exact: false })).toBeInTheDocument();
    expect(canvas.queryAllByRole("checkbox")).toHaveLength(0);
    expect(canvas.queryByRole("button", { name: /parts/ })).toBeNull();
    expect(pci.getResponse()).toEqual(list("5/12"));
  },
};

export const SolutionFromTheDeclaration: Story = {
  args: { status: "solution", properties: { models: NAME }, responseDeclaration: { cardinality: "ordered", baseType: "string", correctResponse: { value: ["1/3", "3/8"] } } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    await waitFor(() => expect(canvas.getByRole("textbox", { name: "Numerator: Set A" })).toHaveValue("1"));
    expect(canvas.getByRole("textbox", { name: "Denominator: Set A" })).toBeDisabled();
    expect(canvas.getByRole("textbox", { name: "Percentage shaded in Circle B" })).toHaveValue("37.5");
  },
};

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
    await userEvent.click(part(first.canvas, "Circle A", "Part 1 of 3"));
    await userEvent.click(part(second.canvas, "Bar B", "Part 1 of 6"));
    expect(part(first.canvas, "Bar B", "Part 1 of 6")).toHaveAttribute("aria-checked", "false");
    expect(first.pci.getResponse()).toEqual(list("1/3", "0/1"));
    expect(second.pci.getResponse()).toEqual(list("0/1", "1/6"));
    expect(first.changes).toHaveLength(1);
    expect(second.changes).toHaveLength(1);
  },
};

export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);
    const models = () => JSON.parse(instance.getProperties().models!).models;
    const editor = (i: number) => within(canvas.getByTestId(`model-editor-${i}`));

    await step("starts from the example, valid, with its correct response", async () => {
      expect(instance.validate()).toEqual([]);
      expect(canvas.getByTestId("correct")).toHaveTextContent("Correct response: 2/3, 2/3");
      expect(models()).toHaveLength(2);
    });

    await step("an answer the bar cannot show is a problem; letting the candidate divide fixes it", async () => {
      const target = editor(1).getByRole("textbox", { name: "Answer" });
      await userEvent.type(target, "{Backspace}{Backspace}{Backspace}5/12");
      expect(instance.validate()).toEqual(["Model 2: the answer cannot be shaded with these parts."]);
      await userEvent.click(editor(1).getByRole("checkbox", { name: "The candidate divides it" }));
      expect(instance.validate()).toEqual([]);
      expect(models()[1]).toMatchObject({ type: "bar", divide: true, target: "5/12" });
    });

    await step("a name task: the author shades the given parts in the preview", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "+ Add a model" }));
      await userEvent.selectOptions(editor(2).getByRole("combobox", { name: "Task" }), "name");
      expect(instance.validate()).toEqual(["Model 3: give the answer (the shaded fraction)."]);
      await userEvent.click(editor(2).getByRole("checkbox", { name: "Part 1 of 4" }));
      await userEvent.type(editor(2).getByRole("textbox", { name: "Answer" }), "25%");
      expect(instance.validate()).toEqual([]);
      expect(models()[2]).toMatchObject({ type: "bar", task: "name", shaded: [0], target: "25%" });
      expect(changes.length).toBeGreaterThan(3);
    });
  },
};

export const AuthoringInDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { models: JSON.stringify({ models: [{ type: "circle", parts: 4, shaded: [0], task: "name", target: "2/4" }] }) } },
  play: async ({ canvasElement }) => {
    const { instance } = await openAuthoring(canvasElement);
    expect(instance.validate()).toEqual(["Model 1: het antwoord is niet de breuk die gekleurd is."]);
  },
};
