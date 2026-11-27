import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  afterPaint, focusedIn, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci,
  type PciArgs,
} from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Kitchen dosing",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

// ---- what the stories look at, inside the PCI's shadow root ----

const $ = <T extends Element = HTMLElement>(m: MountedPci, selector: string) => {
  const found = m.root.querySelector<T>(selector);
  if (!found) throw new Error(`no ${selector} in the PCI`);
  return found;
};
const amount = (m: MountedPci, line: number) => $<HTMLInputElement>(m, `input[data-amount="${line}"]`);
/** The card of a tool: tool-1 … for the lines of the recipe, tool-cup for the dosing cup. */
const tool = (m: MountedPci, id: string | number) => $(m, `[data-testid="tool-${id}"]`);
const slider = (m: MountedPci, id: string | number) => tool(m, id).querySelector<HTMLInputElement>("input[type=range]")!;
const button = (m: MountedPci, id: string | number, step: number) => tool(m, id).querySelector<HTMLButtonElement>(`button[data-step="${step}"]`)!;
const said = (m: MountedPci, id: string | number) => tool(m, id).querySelector("[data-said]")!.textContent;

/** The record as { field: value }, for comparing. */
const fields = (response: unknown) =>
  Object.fromEntries(((response as { record?: { name: string; base: Record<string, unknown> }[] })?.record ?? []).map((f) => [f.name, Object.values(f.base)[0]]));
const work = (response: unknown) => JSON.parse(String(fields(response).work));

/** A key on an element, as the keyboard does it (userEvent.keyboard does not reach into the shadow root). */
async function press(element: HTMLElement, key: string, times = 1) {
  element.focus();
  for (let i = 0; i < times; i++) element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, composed: true }));
  await afterPaint();
}
/** A slider set as a drag of its thumb does it: a new value and an input event. */
async function slide(input: HTMLInputElement, value: number) {
  input.value = String(value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await afterPaint();
}
/** A drag on a drawing (the jug, the cup) from one height to another, in fractions of its height, with a mouse or a finger. */
async function dragOn(element: Element, from: number, to: number, pointerType: "mouse" | "touch" = "mouse") {
  const r = element.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const fire = (type: string, f: number) =>
    element.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, cancelable: true, pointerId: 3, pointerType, isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: r.top + r.height * f }));
  fire("pointerdown", from);
  for (let i = 1; i <= 4; i++) {
    fire("pointermove", from + ((to - from) * i) / 4);
    await afterPaint();
  }
  fire("pointerup", to);
  await afterPaint();
}
/** Writes the amounts of the recipe, line by line. */
async function write(m: MountedPci, ...values: string[]) {
  for (const [i, v] of values.entries()) if (v) await retype(amount(m, i), v);
}

const DOSING = { mode: "dosing", title: "Clean the floor", question: "You clean the floor of the canteen." };
/** The level of a beaker drawing, as it shows it. */
const level = (m: MountedPci, kind: "jug" | "cup") => Number($(m, `[data-drawing="${kind}"]`).getAttribute("data-level"));

// ---- the stories ----

/** The recipe to try out yourself (no test runs on it): with a mouse, a touchscreen or the keyboard. */
export const ToTry: Story = { name: "Kitchen dosing, to try" };

/** The cleaning task to try out yourself (no test runs on it). */
export const DosingToTry: Story = { name: "Dosing, to try", args: { properties: DOSING } };

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    const { canvas, pci } = m;
    expect(canvas.getByRole("heading", { name: "Pancakes for everyone" })).toBeInTheDocument();
    expect($(m, "[data-task]")).toHaveTextContent("Make it for 6 persons.");
    // the recipe: for 4 and for 6 persons, a box per line with its name for a screen reader
    expect(canvas.getByRole("table", { name: "Pancakes" })).toBeInTheDocument();
    expect(canvas.getByRole("columnheader", { name: "For 4 persons" })).toBeInTheDocument();
    expect(canvas.getByRole("columnheader", { name: "For 6 persons" })).toBeInTheDocument();
    expect(canvas.getByRole("row", { name: /Flour 250 g/ })).toBeInTheDocument();
    expect(canvas.getByRole("textbox", { name: "flour: amount for 6 persons, in grams" })).toHaveValue("");
    expect(canvas.getByRole("textbox", { name: "sugar: amount for 6 persons, in tablespoons" })).toBeInTheDocument();
    // four tools: the butter is not measured
    expect(Array.from(m.root.querySelectorAll("[data-tool]")).map((el) => el.getAttribute("data-tool"))).toEqual(["scale", "jug", "pieces", "spoon"]);
    expect(canvas.getByRole("slider", { name: "Flour on the scale" })).toHaveAttribute("aria-valuetext", "The scale shows 150 g");
    expect(canvas.getByRole("slider", { name: "Milk in the measuring jug" })).toHaveAttribute("aria-valuetext", "0 ml in the jug");
    expect(canvas.getByText("There is a bowl on the scale.")).toBeInTheDocument();
    expect(pci.getResponse()).toBeUndefined();
  },
};

/** The amounts: right or wrong, rounding where it makes sense, the decimal comma, something that is not a number. */
export const Amounts: Story = {
  play: async ({ canvasElement, step }) => {
    const m = await openPci(canvasElement);
    await step("the first amount is an answer: the response follows; a measured line is right once it is measured too", async () => {
      await write(m, "375");
      await waitFor(() => expect(work(m.changes[m.changes.length - 1]).amounts[0]).toBe("375"));
      expect(fields(m.pci.getResponse())).toMatchObject({ line1: false, line5: false, amountsCorrect: false, measuredCorrect: false, correct: false });
    });
    await step("all amounts right; the butter is not measured, so its line is right", async () => {
      await write(m, "375", "750", "3", "3", "75");
      expect(fields(m.pci.getResponse())).toMatchObject({ line1: false, line5: true, amountsCorrect: true, measuredCorrect: false });
      expect(amount(m, 3).closest(".amount-box")).toHaveTextContent("tablespoons");
      // the tools show what the pupil wrote
      expect(tool(m, 1).querySelector("[data-own]")).toHaveTextContent("In your recipe: 375 g");
    });
    await step("a decimal comma or point; 3,5 eggs is not a whole egg", async () => {
      await retype(amount(m, 2), "3,5");
      expect(fields(m.pci.getResponse()).amountsCorrect).toBe(false);
      await retype(amount(m, 2), "3");
      await retype(amount(m, 1), "750.0");
      expect(fields(m.pci.getResponse()).amountsCorrect).toBe(true);
    });
    await step("not a number: the box says so, and is invalid", async () => {
      await retype(amount(m, 0), "veel");
      expect(amount(m, 0)).toHaveAttribute("aria-invalid", "true");
      expect(m.canvas.getByText(/Write a number, such as 375 or 1,5./)).toBeInTheDocument();
      expect(m.pci.checkValidity()).toBe(false);
      expect(fields(m.pci.getResponse()).amountsCorrect).toBe(false);
      await retype(amount(m, 0), "375");
      expect(m.pci.checkValidity()).toBe(true);
    });
  },
};

/** The scale with the keyboard: the slider (arrow keys, Page Up), the tare button, a screen reader hears the display. */
export const Weighing: Story = {
  play: async ({ canvasElement, step }) => {
    const m = await openPci(canvasElement);
    await write(m, "375");
    const flour = slider(m, 1);
    await step("without tare the scale shows the bowl too", async () => {
      await press(flour, "PageUp", 7); // 7 × 50 g
      await press(flour, "ArrowRight", 5); // 5 × 5 g
      expect(flour).toHaveAttribute("aria-valuetext", "The scale shows 525 g");
      expect($(m, "[data-testid=tool-1] [data-display]")).toHaveTextContent("525");
      expect(fields(m.pci.getResponse())).toMatchObject({ line1: true }); // the flour is right; the other lines not yet
      expect(work(m.pci.getResponse()).measured[0]).toBe(375);
    });
    await step("tare: the scale shows 0, and adding flour counts from there", async () => {
      await press(flour, "Home");
      const tare = m.canvas.getByRole("button", { name: "Tare: set the scale to 0" });
      await userEvent.click(tare);
      expect(said(m, 1)).toBe("The scale is set to 0.");
      expect(flour).toHaveAttribute("aria-valuetext", "The scale shows 0 g");
      await press(flour, "PageUp", 8);
      expect(flour).toHaveAttribute("aria-valuetext", "The scale shows 400 g");
      // a button: said in the live region
      await userEvent.click(button(m, 1, -5));
      await userEvent.click(button(m, 1, -5));
      expect(said(m, 1)).toBe("The scale shows 390 g");
      expect(work(m.pci.getResponse()).measured[0]).toBe(390); // within 5 % of 375 g
    });
    await step("End and Home", async () => {
      await press(flour, "End");
      expect(flour.value).toBe("1000");
      await press(flour, "Home");
      expect(flour.value).toBe("0");
      expect(button(m, 1, -50)).toBeDisabled();
    });
  },
};

/** The jug: poured by dragging on the drawing, with the slider and with the buttons. */
export const Pouring: Story = {
  play: async ({ canvasElement, step }) => {
    const m = await openPci(canvasElement);
    await write(m, "", "750");
    const jug = $(m, "[data-beaker=jug]");
    await step("a drag on the jug fills it to where the pointer is", async () => {
      await dragOn(jug, 0.85, 0.3);
      const poured = level(m, "jug");
      expect(poured).toBeGreaterThan(700);
      expect(slider(m, 2)).toHaveAttribute("aria-valuetext", `${poured} ml in the jug`);
    });
    await step("the slider and the buttons set it exactly", async () => {
      await slide(slider(m, 2), 700);
      await userEvent.click(button(m, 2, 10));
      await userEvent.click(button(m, 2, 10));
      await userEvent.click(button(m, 2, 10));
      await userEvent.click(button(m, 2, 10));
      await userEvent.click(button(m, 2, 10));
      expect(level(m, "jug")).toBe(750);
      expect(said(m, 2)).toBe("750 ml in the jug");
      expect(work(m.pci.getResponse()).measured[1]).toBe(750);
      expect(fields(m.pci.getResponse()).line2).toBe(true);
    });
  },
};

/** On a tablet: a finger drags on the jug and taps the buttons; the slider's thumb is large. */
export const Touch: Story = {
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    const jug = $(m, "[data-beaker=jug]");
    expect(getComputedStyle(jug).touchAction).toBe("none"); // a finger on the jug pours, it does not scroll
    expect(getComputedStyle(tool(m, 2)).touchAction).not.toBe("none"); // the rest of the card still scrolls the page
    await dragOn(jug, 0.9, 0.55, "touch");
    expect(level(m, "jug")).toBeGreaterThan(200);
    await userEvent.click(button(m, 3, 1));
    await userEvent.click(button(m, 3, 1));
    expect($(m, "[data-testid=tool-3] [data-drawing=pieces]")).toHaveAttribute("data-count", "2");
    // every button is at least 44 × 44 px
    for (const b of Array.from(m.root.querySelectorAll<HTMLElement>("[data-tool] button"))) {
      const r = b.getBoundingClientRect();
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeGreaterThanOrEqual(44);
    }
    expect(slider(m, 1).getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  },
};

/** Spoons in halves and pieces whole; a − that disables itself hands the focus to the + of its tool. */
export const SpoonsAndPieces: Story = {
  play: async ({ canvasElement, step }) => {
    const m = await openPci(canvasElement);
    await write(m, "", "", "3", "3");
    await step("spoons: +1, +½, and the drawing and the text say how many", async () => {
      await userEvent.click(button(m, 4, 1));
      await userEvent.click(button(m, 4, 1));
      await userEvent.click(button(m, 4, 0.5));
      expect($(m, "[data-testid=tool-4] [data-reading]")).toHaveTextContent("2½ tablespoons");
      expect(slider(m, 4)).toHaveAttribute("aria-valuetext", "2½ tablespoons");
      expect(m.root.querySelectorAll("[data-testid=tool-4] [data-spoon]")).toHaveLength(3);
      expect(fields(m.pci.getResponse()).line4).toBe(false);
      await press(slider(m, 4), "ArrowUp");
      expect(fields(m.pci.getResponse()).line4).toBe(true);
    });
    await step("pieces: one at a time; the last one off moves the focus to +1", async () => {
      const plus = button(m, 3, 1);
      const minus = button(m, 3, -1);
      await userEvent.click(plus);
      expect(said(m, 3)).toBe("Eggs: 1");
      minus.focus();
      minus.click();
      await waitFor(() => expect(minus).toBeDisabled());
      await waitFor(() => expect(focusedIn(m.root)).toBe(plus));
      for (let i = 0; i < 3; i++) await userEvent.click(plus);
      expect(fields(m.pci.getResponse()).line3).toBe(true);
    });
  },
};

/** Everything right: the response says so, line by line; and measured against the pupil's own amount. */
export const AllRight: Story = {
  args: { properties: { bowl: "false" } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(m.canvas.queryByRole("button", { name: /Tare/ })).toBeInTheDocument();
    expect(m.canvas.queryByText("There is a bowl on the scale.")).toBeNull();
    await write(m, "375", "750", "3", "3", "75");
    await slide(slider(m, 1), 375);
    await slide(slider(m, 2), 750);
    await slide(slider(m, 3), 3);
    await slide(slider(m, 4), 3);
    expect(fields(m.pci.getResponse())).toEqual({
      line1: true, line2: true, line3: true, line4: true, line5: true, amountsCorrect: true, measuredCorrect: true, correct: true,
      work: JSON.stringify({ amounts: ["375", "750", "3", "3", "75"], measured: [375, 750, 3, 3, null] }),
    });
    // a wrong amount, weighed as written: the weighing is right, the amount is not
    await retype(amount(m, 0), "300");
    await slide(slider(m, 1), 300);
    expect(fields(m.pci.getResponse())).toMatchObject({ line1: false, amountsCorrect: false, measuredCorrect: true, correct: false });
  },
};

/** Dosing: choose the product (a click, the arrow keys), compute the dose, pour it with the cup, two times. */
export const Dosing: Story = {
  args: { properties: DOSING },
  play: async ({ canvasElement, step }) => {
    const m = await openPci(canvasElement);
    const { canvas } = m;
    expect($(m, "[data-task]")).toHaveTextContent("Clean the floor. The bucket holds 5 litres of water.");
    const shelf = canvas.getByRole("radiogroup", { name: "Cleaning products" });
    const radios = within(shelf).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    // a label: what it is for, the dosage, the pictograms with their names
    expect($(m, "[data-product=floor] [data-dosage]")).toHaveTextContent("1 : 100");
    expect($(m, "[data-product=allPurpose] [data-dosage]")).toHaveTextContent("20 ml per litre");
    expect($(m, "[data-product=sanitary] [data-hazards]")).toHaveTextContent("CorrosiveHarmful to the environment");
    expect(m.root.querySelector("[data-product=sanitary] [data-hazard=corrosive]")).not.toBeNull();
    expect(m.pci.getResponse()).toBeUndefined();

    await step("choose: a click, then the arrow keys move the choice", async () => {
      await userEvent.click(radios[1]);
      expect(radios[1]).toHaveAttribute("aria-checked", "true");
      expect($(m, "[data-product=allPurpose] [data-chosen]")).toHaveTextContent("Chosen");
      expect(fields(await lastChange(m))).toMatchObject({ product: "allPurpose", correct: false });
      await press(radios[1], "ArrowLeft");
      expect(radios[0]).toHaveAttribute("aria-checked", "true");
      expect(focusedIn(m.root)).toBe(radios[0]);
      expect(fields(m.pci.getResponse()).product).toBe("floor");
    });
    await step("compute: the box is named after the product", async () => {
      const box = canvas.getByRole("textbox", { name: "Floor cleaner for the bucket, in ml" });
      await userEvent.type(box, "50");
      expect(fields(m.pci.getResponse())).toMatchObject({ amountsCorrect: true, measuredCorrect: false, correct: false });
      expect(tool(m, "cup").querySelector("[data-own]")).toHaveTextContent("Your amount: 50 ml");
    });
    await step("dose: 25 ml two times", async () => {
      const pour = canvas.getByRole("button", { name: "Pour the cup into the bucket" });
      expect(pour).toBeDisabled();
      await press(slider(m, "cup"), "PageUp");
      expect(slider(m, "cup")).toHaveAttribute("aria-valuetext", "25 ml in the cup");
      expect(level(m, "cup")).toBe(25);
      await userEvent.click(pour);
      expect(said(m, "cup")).toBe("Poured 25 ml into the bucket.");
      expect($(m, "[data-poured]")).toHaveTextContent("You poured into the bucket once.");
      // the cup is empty, the button disables itself: the focus goes to the cup's slider
      await waitFor(() => expect(focusedIn(m.root)).toBe(slider(m, "cup")));
      await dragOn($(m, "[data-beaker=cup]"), 0.9, 0.62);
      await slide(slider(m, "cup"), 25);
      await userEvent.click(pour);
      expect($(m, "[data-poured]")).toHaveTextContent("You poured into the bucket 2 times.");
      expect(fields(m.pci.getResponse())).toEqual({
        line1: true, amountsCorrect: true, measuredCorrect: true, product: "floor", correct: true,
        work: JSON.stringify({ amounts: ["50"], measured: [50], product: "floor", pours: [25, 25] }),
      });
    });
    await step("empty the bucket: start again", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Empty the bucket and start again" }));
      expect(said(m, "cup")).toBe("The bucket is empty. It has clean water again.");
      expect(fields(m.pci.getResponse())).toMatchObject({ measuredCorrect: false, correct: false });
      await waitFor(() => expect(focusedIn(m.root)).toBe(slider(m, "cup")));
    });
  },
};

/** Without a choice: only the right product, as a label (no radio), and no product field. */
export const DosingNoChoice: Story = {
  args: { properties: { ...DOSING, cleaning: JSON.stringify({ surface: "sanitary", volume: 4, products: ["floor", "sanitary"], choose: false, cup: 50 }) } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(m.canvas.queryByRole("radiogroup")).toBeNull();
    expect(m.root.querySelectorAll("[data-product]")).toHaveLength(1);
    expect(m.canvas.getByText("1. The product")).toBeInTheDocument();
    expect(m.canvas.getByText("Dosing cap")).toBeInTheDocument();
    await userEvent.type(m.canvas.getByRole("textbox", { name: "Toilet and bathroom cleaner for the bucket, in ml" }), "80");
    expect(fields(m.pci.getResponse())).toMatchObject({ line1: false, amountsCorrect: true, correct: false });
    expect("product" in fields(m.pci.getResponse())).toBe(false);
  },
};

/** Dutch: the texts, a decimal comma, ½. */
export const Dutch: Story = {
  args: { properties: { language: "nl", recipe: "soup", persons: "6", title: "Soep", question: "" } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    const { canvas } = m;
    expect($(m, "[data-task]")).toHaveTextContent("Maak het voor 6 personen.");
    expect(canvas.getByRole("table", { name: "Groentesoep" })).toBeInTheDocument();
    expect(canvas.getByRole("row", { name: /Water 1 l/ })).toBeInTheDocument();
    await write(m, "1,5", "3", "450");
    // the water is not poured yet; the stock cubes are not counted yet
    expect(fields(m.pci.getResponse())).toMatchObject({ line1: false, line2: false, line4: false });
    expect(tool(m, 1).querySelector("[data-own]")).toHaveTextContent("In jouw recept: 1,5 l");
    expect(canvas.getByRole("slider", { name: "Water in de maatbeker" })).toHaveAttribute("aria-valuetext", "0 ml in de maatbeker");
    await slide(slider(m, 1), 1500);
    expect(fields(m.pci.getResponse()).line1).toBe(true);
    expect(canvas.getByRole("button", { name: "Tarra: zet de weegschaal op 0" })).toBeInTheDocument();
    expect(canvas.getByRole("slider", { name: "Soepgroente op de weegschaal" })).toHaveAttribute("aria-valuetext", "De weegschaal wijst 150 g aan");
  },
};

export const DutchDosing: Story = {
  args: { properties: { ...DOSING, language: "nl", cleaning: "worktop" } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect($(m, "[data-task]")).toHaveTextContent("Maak het aanrecht schoon. In de emmer zit 2 liter water.");
    expect($(m, "[data-product=allPurpose] [data-dosage]")).toHaveTextContent("20 ml per liter");
    expect(m.canvas.getByRole("radiogroup", { name: "Schoonmaakmiddelen" })).toBeInTheDocument();
    expect(pci.getCorrectResponse!({ mode: "dosing", cleaning: "worktop" } as never)).toEqual({
      record: [
        { name: "line1", base: { boolean: true } },
        { name: "amountsCorrect", base: { boolean: true } },
        { name: "measuredCorrect", base: { boolean: true } },
        { name: "product", base: { identifier: "allPurpose" } },
        { name: "correct", base: { boolean: true } },
      ],
    });
  },
};

export const SettingsProblem: Story = {
  args: { properties: { persons: "zes", recipe: "{" } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(m.canvas.getByRole("alert")).toHaveTextContent("The recipe can not be read: the pancakes are shown.");
    expect(m.canvas.getByRole("alert")).toHaveTextContent("The number of persons to cook for must be a whole number from 1 to 100.");
    expect(pci.getCorrectResponse!({ persons: "zes" } as never)).toBeUndefined();
  },
};

export const RestoreState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await write(first, "375", "750");
    await userEvent.click(first.canvas.getByRole("button", { name: "Tare: set the scale to 0" }));
    await slide(slider(first, 1), 380);
    const state = first.pci.getState();
    // the pupil comes back to the item: everything is as they left it
    const second = await remountPci(canvasElement, pci, { state });
    expect(amount(second, 0)).toHaveValue("375");
    expect(slider(second, 1)).toHaveAttribute("aria-valuetext", "The scale shows 380 g");
    expect(fields(second.pci.getResponse())).toEqual(fields(first.pci.getResponse()));
  },
};

export const ForeignState: Story = {
  args: { state: JSON.stringify({ state: { amounts: ["1"], content: [], tare: [], product: "", pours: [] }, log: [] }) },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(amount(m, 0)).toHaveValue("");
    expect(m.pci.getResponse()).toBeUndefined();
  },
};

const BOUND_WORK = JSON.stringify({ amounts: ["375", "700", "3", "3", ""], measured: [370, 700, 2, 3, null] });

/** A response handed back: its work fills the recipe and the tools (the scale tared, so it shows what was weighed). */
export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: { record: [{ name: "work", base: { string: BOUND_WORK } }] } } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(amount(m, 1)).toHaveValue("700");
    expect(slider(m, 1)).toHaveAttribute("aria-valuetext", "The scale shows 370 g");
    expect(level(m, "jug")).toBe(700);
    expect(fields(m.pci.getResponse())).toMatchObject({ line1: true, line2: false, line3: false, line4: true, amountsCorrect: false, measuredCorrect: false, work: BOUND_WORK });
    // setResponse does the same
    m.pci.setResponse({ record: [{ name: "work", base: { string: JSON.stringify({ amounts: ["1"], measured: [5] }) } }] });
    await waitFor(() => expect(amount(m, 0)).toHaveValue("1"));
    expect(slider(m, 1)).toHaveAttribute("aria-valuetext", "The scale shows 5 g");
  },
};

/** Status "solution" without a correct response in the item: the correct work from the settings, read-only. */
export const Solution: Story = {
  args: { status: "solution" },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(amount(m, 0)).toHaveValue("375");
    expect(amount(m, 0)).toBeDisabled();
    expect(amount(m, 3)).toHaveValue("3");
    expect($(m, "[data-testid=tool-1] [data-reading]")).toHaveTextContent("The scale shows 375 g");
    expect($(m, "[data-testid=tool-2] [data-reading]")).toHaveTextContent("750 ml in the jug");
    // read-only: no sliders, no buttons
    expect(m.root.querySelectorAll("input[type=range], button")).toHaveLength(0);
    expect(fields(m.pci.getResponse())).toMatchObject(fields(pci.getCorrectResponse!({} as never)));
  },
};

/** Status "solution" with the item's correct response (from getCorrectResponse): the dosing, poured in two caps. */
export const SolutionDosing: Story = {
  args: {
    status: "solution",
    properties: { ...DOSING, cleaning: "sanitary" },
    responseDeclaration: { correctResponse: { value: pci.getCorrectResponse!({ mode: "dosing", cleaning: "sanitary" } as never) } },
  },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(amount(m, 0)).toHaveValue("80");
    expect($(m, "[data-product=sanitary]")).toHaveAttribute("aria-checked", "true");
    expect($(m, "[data-testid=bucket] [data-reading]")).toHaveTextContent("50 ml + 30 ml = 80 ml");
    expect(m.root.querySelectorAll("button:not([role=radio])")).toHaveLength(0);
    // a click on another product does nothing
    await userEvent.click($(m, "[data-product=floor]"));
    expect(fields(m.pci.getResponse()).product).toBe("sanitary");
  },
};

export const Review: Story = {
  args: { status: "review", boundTo: { RESPONSE: { record: [{ name: "work", base: { string: BOUND_WORK } }] } } },
  play: async ({ canvasElement }) => {
    const m = await openPci(canvasElement);
    expect(amount(m, 0)).toBeDisabled();
    expect($(m, "[data-testid=tool-3] [data-reading]")).toHaveTextContent("Eggs: 2");
    expect(m.root.querySelectorAll("button")).toHaveLength(0);
  },
};

/** The correct response from the settings: every check true, no work. */
export const CorrectResponse: Story = {
  play: async () => {
    const correct = (properties: Record<string, string>) => fields(pci.getCorrectResponse!(properties as never));
    expect(correct({})).toEqual({ line1: true, line2: true, line3: true, line4: true, line5: true, amountsCorrect: true, measuredCorrect: true, correct: true });
    expect(correct({ recipe: JSON.stringify({ preset: "pancakes", measure: [] }) })).toEqual({ line1: true, line2: true, line3: true, line4: true, line5: true, amountsCorrect: true, correct: true });
    expect(correct({ mode: "dosing", cleaning: JSON.stringify({ surface: "floor", choose: false }) })).toEqual({ line1: true, amountsCorrect: true, measuredCorrect: true, correct: true });
    expect(pci.getCorrectResponse!({ mode: "dosing", cleaning: JSON.stringify({ surface: "floor", products: ["glass"] }) } as never)).toBeUndefined();
  },
};

export const Validity: Story = {
  play: async ({ canvasElement }) => {
    const { pci } = await openPci(canvasElement);
    expect(pci.checkValidity()).toBe(true);
    pci.setCustomValidity("Vul het recept in.");
    expect(pci.getCustomValidity()).toBe("Vul het recept in.");
    expect(pci.checkValidity()).toBe(false);
    pci.setCustomValidity("");
    expect(pci.checkValidity()).toBe(true);
  },
};

/** Two on one page: each has its own work. */
export const TwoInstances: Story = {
  render: (args) => {
    const page = document.createElement("div");
    for (const id of ["first", "second"]) {
      const slot = document.createElement("div");
      slot.dataset.slot = id;
      slot.appendChild(mountPci(pci, id === "first" ? args : { ...args, properties: { ...DOSING, title: "Second" } }));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=first]")!);
    const second = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=second]")!);
    expect(first.pci).not.toBe(second.pci);
    await write(first, "375");
    await userEvent.type(amount(second, 0), "50");
    expect(work(first.pci.getResponse()).amounts[0]).toBe("375");
    expect(work(second.pci.getResponse()).amounts[0]).toBe("50");
    expect(first.changes.length).toBeGreaterThan(0);
    expect(second.changes.length).toBeGreaterThan(0);
    // the ids of the boxes differ, so each label belongs to its own box
    expect(amount(first, 0).id).not.toBe(amount(second, 0).id);
  },
};

// ---- the authoring mode ----

type Authoring = StoryObj<AuthoringArgs>;
type MountedAuthoring = Awaited<ReturnType<typeof openAuthoring>>;
const written = (m: MountedAuthoring) => m.instance.getProperties() as Record<string, string>;
const radio = (m: MountedAuthoring, name: string) => m.canvas.getByRole("radio", { name: new RegExp(`^(✓ )?${name}$`) }) as HTMLButtonElement;
async function pressKey(element: HTMLElement, key: string) {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  await afterPaint();
}

export const AuthoringToTry: Authoring = { name: "Authoring, to try", render: (args) => mountAuthoring(pci, args) };

/** A preset recipe: another preset, which lines are measured, the persons; the preview of the correct amounts. */
export const AuthoringRecipe: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const m = await openAuthoring(canvasElement);
    const { canvas } = m;
    await step("starts from the settings: the pancakes, for 6 persons", async () => {
      expect(radio(m, "Pancakes")).toHaveAttribute("aria-checked", "true");
      expect(written(m)).toEqual({ recipe: "pancakes", persons: "6", bowl: "true", cleaning: expect.any(String), amountMargin: "0", measureMargin: "5" });
      expect($a(m, "[data-preview]")).toHaveTextContent("Flour: 375 g (measured)");
      expect(m.instance.validate()).toEqual([]);
    });
    await step("the butter measured too: still the preset, with its own measure list", async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: "Measure on the scale: butter for frying" }));
      expect(JSON.parse(written(m).recipe)).toEqual({ preset: "pancakes", measure: [true, true, true, true, true] });
      expect(radio(m, "Pancakes")).toHaveAttribute("aria-checked", "true");
      expect(m.changes.length).toBeGreaterThan(0);
    });
    await step("another preset with the arrow keys; cook for 2", async () => {
      await pressKey(radio(m, "Pancakes"), "ArrowRight");
      expect(radio(m, "Stamppot with kale")).toHaveAttribute("aria-checked", "true");
      expect(focusedIn(m.root)).toBe(radio(m, "Stamppot with kale"));
      expect(written(m).recipe).toBe("stamppot");
      await retype($a<HTMLInputElement>(m, "[data-field=persons]"), "2");
      expect(written(m).persons).toBe("2");
      expect($a(m, "[data-preview]")).toHaveTextContent("Potatoes: 0.5 kg (measured)");
      expect($a(m, "[data-preview]")).toHaveTextContent("Smoked sausage: 1 piece (measured)");
    });
    await step("no bowl on the scale; margins", async () => {
      await userEvent.click($a(m, "[data-bowl]"));
      expect(written(m).bowl).toBe("false");
      await retype($a<HTMLInputElement>(m, "[data-field=measureMargin]"), "10");
      expect(written(m).measureMargin).toBe("10");
    });
  },
};

const $a = <T extends Element = HTMLElement>(m: MountedAuthoring, selector: string) => {
  const found = m.root.querySelector<T>(selector);
  if (!found) throw new Error(`no ${selector} in the authoring mode`);
  return found;
};

/** The author's own recipe: a change makes it one's own; adding and removing ingredients (the focus moves on). */
export const AuthoringOwnRecipe: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { recipe: "fruitSalad", persons: "8" } },
  play: async ({ canvasElement, step }) => {
    const m = await openAuthoring(canvasElement);
    const { canvas } = m;
    await step("a new name: the own recipe, as JSON", async () => {
      await retype($a<HTMLInputElement>(m, "[data-name]"), "Fruit salad for the party");
      expect(radio(m, "Own recipe")).toHaveAttribute("aria-checked", "true");
      const recipe = JSON.parse(written(m).recipe);
      expect(recipe.name).toBe("Fruit salad for the party");
      expect(recipe.persons).toBe(4);
      expect(recipe.lines[0]).toEqual({ name: "apples", amount: 2, unit: "piece", measure: true, icon: "apple" });
    });
    await step("add an ingredient: the focus goes to its name", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "+ Add an ingredient" }));
      const name = canvas.getByRole("textbox", { name: "Ingredient 6" });
      await waitFor(() => expect(focusedIn(m.root)).toBe(name));
      expect(m.instance.validate()).toEqual(["Ingredient 6 needs a name.", "Ingredient 6 needs an amount above 0."]);
      await userEvent.type(name, "kiwis");
      await userEvent.type(canvas.getByRole("textbox", { name: "Amount: kiwis" }), "3");
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Unit: kiwis" }), "piece");
      await userEvent.click(canvas.getByRole("checkbox", { name: "Measure by counting: kiwis" }));
      expect(m.instance.validate()).toEqual([]);
      expect(JSON.parse(written(m).recipe).lines[5]).toEqual({ name: "kiwis", amount: 3, unit: "piece", measure: true, icon: "other" });
      expect($a(m, "[data-preview]")).toHaveTextContent("Kiwis: 6 pieces (measured)");
    });
    await step("remove one: the focus goes to the next row's remove button", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Remove bananas" }));
      await waitFor(() => expect(focusedIn(m.root)).toBe(canvas.getByRole("button", { name: "Remove oranges" })));
      expect(JSON.parse(written(m).recipe).lines.map((l: { name: string }) => l.name)).toEqual(["apples", "oranges", "yoghurt", "honey", "kiwis"]);
    });
    await step("ten at most", async () => {
      const add = canvas.getByRole("button", { name: "+ Add an ingredient" });
      for (let i = 0; i < 5; i++) await userEvent.click(add);
      expect(add).toBeDisabled();
    });
  },
};

/** What keeps Done from finishing. */
export const AuthoringValidate: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { persons: "0", measureMargin: "lots" } },
  play: async ({ canvasElement }) => {
    const m = await openAuthoring(canvasElement);
    expect(m.instance.validate()).toEqual(["A margin must be a number from 0 to 100.", "The number of persons to cook for must be a whole number from 1 to 100."]);
    expect($a(m, "[data-problems]")).toHaveTextContent("A margin must be a number from 0 to 100.");
    await retype(m.canvas.getByRole("textbox", { name: "Amount: flour" }), "0");
    expect(m.instance.validate()).toContain("Ingredient 1 needs an amount above 0.");
  },
};

/** The cleaning task: a preset, the surface and the bucket, the products and a dosage, the cup, the choice. */
export const AuthoringDosing: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { mode: "dosing" } },
  play: async ({ canvasElement, step }) => {
    const m = await openAuthoring(canvasElement);
    const { canvas } = m;
    const cleaning = () => JSON.parse(written(m).cleaning);
    await step("starts from the settings: the floor", async () => {
      expect(canvas.getByRole("heading", { name: "Cleaning task" })).toBeInTheDocument();
      expect(radio(m, "Floor")).toHaveAttribute("aria-checked", "true");
      expect($a(m, "[data-preview]")).toHaveTextContent("The right product: Floor cleaner. The dose: 50 ml.");
      expect(cleaning()).toEqual({ surface: "floor", volume: 5, products: ["floor", "allPurpose", "sanitary"], choose: true, cup: 100, preset: "floor" });
    });
    await step("another task; 8 litres, another dosage, a cap of 50 ml", async () => {
      await userEvent.click(radio(m, "Windows"));
      expect(cleaning()).toMatchObject({ surface: "window", volume: 3, cup: 25 });
      await retype($a<HTMLInputElement>(m, "[data-field=volume]"), "8");
      await retype(canvas.getByRole("textbox", { name: "Dosage: Glass cleaner" }), "12,5 ml/l");
      await userEvent.click(radio(m, "50 ml"));
      expect(cleaning()).toMatchObject({ surface: "window", volume: 8, dosages: { glass: "12.5 ml/l" }, cup: 50 });
      expect($a(m, "[data-preview]")).toHaveTextContent("The right product: Glass cleaner. The dose: 100 ml.");
      expect(radio(m, "Windows")).toHaveAttribute("aria-checked", "false");
    });
    await step("a dosage that can not be read, no product for the surface", async () => {
      await retype(canvas.getByRole("textbox", { name: "Dosage: Glass cleaner" }), "a lot");
      expect(m.instance.validate()).toEqual(["A dosage can not be read. Write it as 1:100 or 20 ml/l."]);
      await retype(canvas.getByRole("textbox", { name: "Dosage: Glass cleaner" }), "1:200");
      await userEvent.click(canvas.getByRole("checkbox", { name: "On the shelf: Glass cleaner" }));
      expect(m.instance.validate()).toEqual(["None of the products is for this surface."]);
      await userEvent.click(canvas.getByRole("checkbox", { name: "On the shelf: Glass cleaner" }));
      await userEvent.click($a(m, "[data-choose]"));
      expect(cleaning().choose).toBe(false);
      expect(m.instance.validate()).toEqual([]);
    });
  },
};

export const AuthoringDutch: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { language: "nl" } },
  play: async ({ canvasElement }) => {
    const m = await openAuthoring(canvasElement);
    expect(m.canvas.getByRole("heading", { name: "Recept" })).toBeInTheDocument();
    expect(radio(m, "Pannenkoeken")).toHaveAttribute("aria-checked", "true");
    // the item is Dutch: the names of the preset are Dutch
    expect(m.canvas.getByRole("textbox", { name: "Ingrediënt 1" })).toHaveValue("bloem");
    expect($a(m, "[data-preview]")).toHaveTextContent("Bloem: 375 g (afmeten)");
    expect(m.canvas.getByText("Klaar.")).toBeInTheDocument();
  },
};
