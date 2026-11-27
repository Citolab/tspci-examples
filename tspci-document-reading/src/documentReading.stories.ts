import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  afterPaint, focusedIn, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci,
  type PciArgs,
} from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Document reading",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

/** A field of the document by its accessible name ("Net wage: €900.61"), or by the start of it. */
const field = (mounted: MountedPci, name: string | RegExp) =>
  mounted.canvas.getByRole("button", { name: typeof name === "string" ? new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`) : name });
const fieldById = (mounted: MountedPci, id: string) => mounted.root.querySelector<HTMLElement>(`[data-field="${id}"], [data-field-id="${id}"]`)!;
const pressed = (mounted: MountedPci) =>
  Array.from(mounted.root.querySelectorAll<HTMLElement>('button[data-field][aria-pressed="true"]')).map((b) => b.dataset.field);

type Item = { name: string; base?: Record<string, unknown> };
/** The response as a plain object: { correct: true, field: "net" } */
const plain = (response: unknown) =>
  Object.fromEntries(((response as { record?: Item[] })?.record ?? []).map((f) => [f.name, f.base ? Object.values(f.base)[0] : undefined]));
const record = (fields: Record<string, unknown>) => ({
  record: Object.entries(fields).map(([name, value]) => ({
    name,
    base: { [typeof value === "boolean" ? "boolean" : typeof value === "number" ? (Number.isInteger(value) && name !== "answer" ? "integer" : "float") : "identifier"]: value },
  })),
});

/** A finger on the screen: down and up on the same spot, as a tap (pointer events, then the click the browser makes). */
async function tap(el: HTMLElement) {
  await userEvent.pointer([{ keys: "[TouchA>]", target: el }, { keys: "[/TouchA]", target: el }]);
}

/** The document reading to try out yourself (no test runs on it): with a mouse, a touchscreen or the keyboard. */
export const ToTry: Story = {
  name: "Document reading, to try",
  args: { properties: { template: "payslip", task: "check", language: "nl" } },
};

/** Without settings: a payslip, find the net wage. Nothing tapped, nothing reported. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.getByText("Tap your net wage: the money you get in your bank account.")).toBeInTheDocument();
    expect(canvas.getByRole("region", { name: "Payslip" })).toBeInTheDocument();
    expect(field(mounted, "Net wage")).toHaveAccessibleName("Net wage: €900.61");
    expect(pressed(mounted)).toEqual([]);
    expect(pci.getResponse()).toBeUndefined();
    expect(mounted.changes).toHaveLength(0);
  },
};

/** For a screen reader: real tables with a caption, column and row headers; every field named with its place. */
export const ScreenReader: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    const earnings = canvas.getByRole("table", { name: "Earnings" });
    expect(within(earnings).getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Description", "Number", "Rate", "Amount"]);
    expect(within(earnings).getAllByRole("rowheader").map((th) => th.textContent)).toEqual(["Hours worked", "Holiday allowance", "Total gross"]);
    expect(within(earnings).getByRole("button", { name: "Hourly wage: €14.25" })).toBeInTheDocument();
    expect(canvas.getByRole("table", { name: "Deductions" })).toBeInTheDocument();
    expect(canvas.getByRole("table", { name: "Employee" })).toBeInTheDocument();
    expect(field(mounted, "Wage tax")).toHaveAccessibleName("Wage tax: − €61.20");
    // a live region tells what a tap did
    await userEvent.click(field(mounted, "Net wage"));
    await waitFor(() => expect(mounted.root.querySelector("[aria-live]")!.textContent).toBe("Chosen: Net wage"));
  },
};

export const Find: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { pci } = mounted;

    await step("a wrong field, then the right one: one field is chosen at a time", async () => {
      await userEvent.click(field(mounted, "Total gross"));
      expect(plain(await lastChange(mounted))).toEqual({ correct: false, field: "gross" });
      await userEvent.click(field(mounted, "Net wage"));
      expect(plain(await lastChange(mounted, 2))).toEqual({ correct: true, field: "net" });
      expect(pressed(mounted)).toEqual(["net"]);
      expect(field(mounted, "Net wage").querySelector(".mark-icon-chosen")).not.toBeNull(); // a tick, not only a colour
    });

    await step("tapped again: chosen no more, nothing reported", async () => {
      await userEvent.click(field(mounted, "Net wage"));
      await lastChange(mounted, 3);
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

/** Tapping parts of a document with a finger: a tap chooses, a finger that scrolls the page does not. */
export const Touch: Story = {
  args: { properties: { template: "rota", task: "find" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const noor = field(mounted, "Noor, Fri 27 Nov");
    // the finger lands, and the page scrolls under it: the browser cancels the pointer, and no click follows
    const finger = { bubbles: true, composed: true, pointerId: 7, pointerType: "touch", isPrimary: true };
    noor.dispatchEvent(new PointerEvent("pointerdown", finger));
    noor.dispatchEvent(new PointerEvent("pointercancel", finger));
    await afterPaint();
    expect(mounted.pci.getResponse()).toBeUndefined();
    await tap(noor);
    expect(plain(await lastChange(mounted))).toEqual({ correct: true, field: "day5Person2" });
    // the fields are big enough for a finger, and only the page scrolls: no touch-action: none
    const box = noor.getBoundingClientRect();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(getComputedStyle(noor).touchAction).not.toBe("none");
  },
};

/** Without a mouse: Tab to the fields, arrows through them (Up and Down stay in a column), Enter or Space to choose. */
export const Keyboard: Story = {
  args: { properties: { template: "timetable", task: "find" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const key = (key: string) => focusedIn(mounted.root)!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, composed: true }));
    const focused = () => (focusedIn(mounted.root) as HTMLElement).dataset.field;

    await step("every field is a button in the tab order", async () => {
      const buttons = mounted.root.querySelectorAll<HTMLButtonElement>("button[data-field]");
      expect(buttons.length).toBe(34); // line, route, days, 5 stops, 25 times, the note
      for (const button of buttons) expect(button.tabIndex).toBe(0);
    });

    await step("arrows: right is the next field, down the field below", async () => {
      fieldById(mounted, "bus1Stop1").focus();
      key("ArrowRight");
      expect(focused()).toBe("bus2Stop1");
      key("ArrowDown");
      expect(focused()).toBe("bus2Stop2");
      key("ArrowDown");
      key("ArrowDown");
      key("ArrowDown");
      expect(focused()).toBe("bus2Stop5");
      key("ArrowUp");
      expect(focused()).toBe("bus2Stop4");
      key("ArrowLeft");
      expect(focused()).toBe("bus1Stop4");
      key("Home");
      expect(focused()).toBe("line");
      key("End");
      expect(focused()).toBe("note");
    });

    await step("Enter chooses the focused field", async () => {
      const first = fieldById(mounted, "bus1Stop1");
      first.focus();
      await userEvent.type(first, "{Enter}", { skipClick: true });
      expect(plain(await lastChange(mounted))).toEqual({ correct: true, field: "bus1Stop1" });
      await userEvent.type(first, " ", { skipClick: true });
      await lastChange(mounted, 2);
      expect(mounted.pci.getResponse()).toBeUndefined();
    });
  },
};

/** Check: tap every mistake. Found, total, the wrong taps, and per mistake whether it was found. */
export const Check: Story = {
  args: { properties: { template: "payslip", task: "check" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.getByText("This payslip has 2 mistakes. Tap every mistake.")).toBeInTheDocument();
    // the mistakes carry on: the wage is wrong (64 × €14.25 is €912.00), the fields after it follow from it
    expect(field(mounted, "Wage for the hours worked")).toHaveAccessibleName("Wage for the hours worked: €921.00");
    expect(field(mounted, "Holiday allowance")).toHaveAccessibleName("Holiday allowance: €73.68");

    await step("one mistake and one field that is right", async () => {
      await userEvent.click(field(mounted, "Total deductions"));
      await userEvent.click(field(mounted, "Net wage"));
      expect(plain(pci.getResponse())).toEqual({ correct: false, found: 1, total: 2, wrong: 1, mistake1: false, mistake2: true });
      expect(canvas.getByText("You marked 2 places.")).toBeInTheDocument();
      expect(field(mounted, "Total deductions").querySelector(".mark-icon-mistake")).not.toBeNull();
    });

    await step("the wrong tap taken back, the other mistake found", async () => {
      await userEvent.click(field(mounted, "Net wage"));
      await userEvent.click(field(mounted, "Wage for the hours worked"));
      expect(plain(pci.getResponse())).toEqual({ correct: true, found: 2, total: 2, wrong: 0, mistake1: true, mistake2: true });
      expect(mounted.root.querySelector("[aria-live]")!.textContent).toBe("Marked as a mistake: Wage for the hours worked. You marked 2 places.");
    });
  },
};

/** The packing slip next to the delivery: what is on the slip and not in the box. */
export const PackingSlipCheck: Story = {
  args: { properties: { template: "packingSlip", task: "check" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByRole("heading", { name: "What is in the box" })).toBeInTheDocument();
    const box = canvas.getByRole("table", { name: "You counted" });
    expect(within(box).queryByText("Spirit level 60 cm")).toBeNull(); // not in the box
    await userEvent.click(field(mounted, "Spirit level 60 cm, delivered"));
    await userEvent.click(field(mounted, "Wall plugs 6 mm, box, delivered"));
    expect(plain(mounted.pci.getResponse())).toMatchObject({ correct: true, found: 2, total: 2, wrong: 0 });
  },
};

/** Answer: a number, in Dutch, and where it was found. */
export const Answer: Story = {
  args: { properties: { template: "payslip", task: "answer", language: "nl" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    const input = canvas.getByRole("textbox", { name: "Je antwoord (€)" }) as HTMLInputElement;
    expect(canvas.getByText("Hoeveel verdien je per uur?")).toBeInTheDocument();
    expect(canvas.getByText("Je mag ook aantikken waar je het in het document vond.")).toBeInTheDocument();

    await step("a number with a decimal comma", async () => {
      await userEvent.type(input, "14,25");
      expect(plain(pci.getResponse())).toEqual({ correct: true, answer: 14.25 });
    });

    await step("where it was found: one field", async () => {
      await userEvent.click(field(mounted, "Loon voor de gewerkte uren"));
      expect(plain(pci.getResponse())).toEqual({ correct: true, answer: 14.25, source: "wage", sourceCorrect: false });
      await userEvent.click(field(mounted, "Uurloon"));
      expect(plain(pci.getResponse())).toEqual({ correct: true, answer: 14.25, source: "rate", sourceCorrect: true });
      expect(field(mounted, "Uurloon").querySelector(".mark-icon-source")).not.toBeNull();
    });

    await step("text that is no number: invalid, with a message", async () => {
      await retype(input, "veertien");
      expect(pci.checkValidity()).toBe(false);
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(canvas.getByText("Typ een getal, zoals 14,25")).toBeInTheDocument();
      expect(plain(pci.getResponse())).toEqual({ correct: false, source: "rate", sourceCorrect: true });
    });
  },
};

/** Answer without marking: the fields are text, nothing to tap. */
export const AnswerOnly: Story = {
  args: { properties: { template: "timetable", task: "answer", markSource: "false" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.queryAllByRole("button")).toHaveLength(0);
    expect(canvas.queryByText("You may also tap where you found it in the document.")).toBeNull();
    await userEvent.type(canvas.getByRole("textbox", { name: "Your answer (minutes)" }), "29");
    expect(plain(pci.getResponse())).toEqual({ correct: true, answer: 29 });
  },
};

/** The author's own document, target and question. */
export const OwnDocument: Story = {
  args: {
    properties: {
      template: "receipt",
      task: "find",
      title: "At the supermarket",
      question: "You buy 3 packs of pasta. Tap what you pay for them.",
      targets: "item2Amount",
      document: JSON.stringify({ values: { items: "2", item1Name: "Bread", item1Qty: "1", item1Price: "2.49", item2Name: "Pasta", item2Qty: "3", item2Price: "0.89", discount: "0", paid: "10" }, mistakes: {} }),
    },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByRole("heading", { name: "At the supermarket" })).toBeInTheDocument();
    expect(field(mounted, "Pasta, amount")).toHaveAccessibleName("Pasta, amount: €2.67");
    expect(field(mounted, "Change")).toHaveAccessibleName("Change: €4.84");
    expect(field(mounted, "Shop")).toHaveAccessibleName("Shop: Supermarkt De Korenbloem"); // not in the document: the example's
    await userEvent.click(field(mounted, "Pasta, amount"));
    expect(plain(mounted.pci.getResponse())).toEqual({ correct: true, field: "item2Amount" });
  },
};

export const RestoreState: Story = {
  args: { properties: { template: "energyBill", task: "check" } },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.click(field(first, "Usage"));
    await userEvent.click(field(first, "Total costs"));
    const state = first.pci.getState();
    const response = first.pci.getResponse();
    // the pupil comes back to the item: everything is as they left it
    const second = await remountPci(canvasElement, pci, { state, properties: { template: "energyBill", task: "check" } });
    expect(pressed(second)).toEqual(["usage", "total"]);
    expect(second.pci.getResponse()).toEqual(response);
    // a state of another document (the author changed the item) or not of this PCI: start from the settings
    const other = await remountPci(canvasElement, pci, { state, properties: { template: "energyBill", task: "find" } });
    expect(other.pci.getResponse()).toBeUndefined();
    const foreign = await remountPci(canvasElement, pci, { state: "not a state", properties: { template: "energyBill", task: "check" } });
    expect(foreign.pci.getResponse()).toBeUndefined();
  },
};

export const RestoreAnswer: Story = {
  args: { properties: { template: "dosage", task: "answer" } },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.type(first.canvas.getByRole("textbox"), "3");
    await userEvent.click(field(first, "9 to 12 years, tablets a day at most"));
    const second = await remountPci(canvasElement, pci, { state: first.pci.getState(), properties: { template: "dosage", task: "answer" } });
    expect(second.canvas.getByRole("textbox")).toHaveValue("3");
    expect(plain(second.pci.getResponse())).toEqual({ correct: true, answer: 3, source: "perDay2", sourceCorrect: true });
  },
};

export const BoundResponse: Story = {
  args: { properties: { template: "payslip", task: "check" }, boundTo: { RESPONSE: record({ correct: false, found: 1, total: 2, wrong: 0, mistake1: false, mistake2: true }) } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(pressed(mounted)).toEqual(["deductions"]);
    expect(plain(mounted.pci.getResponse())).toMatchObject({ found: 1, mistake2: true });
  },
};

/** The correct response of the item, read-only: the mistakes marked, nothing to tap. */
export const Solution: Story = {
  args: {
    status: "solution",
    properties: { template: "rota", task: "check" },
    responseDeclaration: { correctResponse: { value: pci.getCorrectResponse!({ template: "rota", task: "check" } as never) } },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.canvas.queryAllByRole("button")).toHaveLength(0);
    const marked = Array.from(mounted.root.querySelectorAll<HTMLElement>(".mark-mistake")).map((el) => el.dataset.fieldId);
    expect(marked).toEqual(["total2", "total3"]);
    expect(fieldById(mounted, "total2")).toHaveTextContent("21, marked as a mistake");
    expect(plain(mounted.pci.getResponse())).toMatchObject({ correct: true, found: 2 });
  },
};

/** Without a correct response in the item, the PCI shows the one that follows from the settings. */
export const SolutionOfItsOwn: Story = {
  args: { status: "solution", properties: { template: "timetable", task: "answer", language: "nl" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.canvas.getByRole("textbox")).toHaveValue("29");
    expect(mounted.canvas.getByRole("textbox")).toBeDisabled();
    expect(fieldById(mounted, "bus4Stop2")).toHaveClass("mark-source");
  },
};

export const Review: Story = {
  args: { status: "review", properties: { template: "payslip", task: "find" }, boundTo: { RESPONSE: record({ correct: false, field: "gross" }) } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.canvas.queryAllByRole("button")).toHaveLength(0);
    expect(fieldById(mounted, "gross")).toHaveClass("mark-chosen");
    expect(plain(mounted.pci.getResponse())).toEqual({ correct: false, field: "gross" });
  },
};

/** The correct response from the settings, for every task. */
export const CorrectResponse: Story = {
  play: async () => {
    const correct = (properties: Record<string, string>) => plain(pci.getCorrectResponse!(properties as never));
    expect(correct({})).toEqual({ correct: true, field: "net" });
    expect(correct({ template: "receipt", task: "check" })).toEqual({ correct: true, found: 2, total: 2, wrong: 0, mistake1: true, mistake2: true });
    expect(correct({ template: "timetable", task: "answer" })).toEqual({ correct: true, answer: 29, source: "bus4Stop2", sourceCorrect: true });
    expect(correct({ template: "rota", task: "answer", markSource: "false" })).toEqual({ correct: true, answer: 17.5 });
    expect(correct({ template: "energyBill", task: "answer", targets: "usage" })).toEqual({ correct: true, answer: 2390, source: "usage", sourceCorrect: true });
    // check without mistakes, answer without a number: no correct response
    expect(pci.getCorrectResponse!({ task: "check", document: JSON.stringify({ values: {}, mistakes: {} }) } as never)).toBeUndefined();
    expect(pci.getCorrectResponse!({ template: "timetable", task: "answer", targets: "bus1Stop1" } as never)).toBeUndefined();
  },
};

/** The correct response set as the response gives the same response back. */
export const CorrectResponseRoundTrip: Story = {
  args: { properties: { template: "dosage", task: "check", language: "nl" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const correct = pci.getCorrectResponse!({ template: "dosage", task: "check", language: "nl" } as never)!;
    mounted.pci.setResponse(correct);
    await waitFor(() => expect(pressed(mounted)).toEqual(["mg3", "perDay4"]));
    expect(mounted.pci.getResponse()).toEqual(correct);
  },
};

export const Validity: Story = {
  play: async ({ canvasElement }) => {
    const { pci } = await openPci(canvasElement);
    expect(pci.checkValidity()).toBe(true);
    pci.setCustomValidity("Tik een veld aan.");
    expect(pci.getCustomValidity()).toBe("Tik een veld aan.");
    expect(pci.checkValidity()).toBe(false);
    pci.setCustomValidity("");
    expect(pci.checkValidity()).toBe(true);
  },
};

/** Two documents on one page: each keeps its own marks and response. */
export const TwoInstances: Story = {
  render: () => {
    const page = document.createElement("div");
    for (const [id, properties] of [["first", { template: "payslip" }], ["second", { template: "payslip", task: "answer" }]] as const) {
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
    await userEvent.click(field(first, "Net wage"));
    await userEvent.type(second.canvas.getByRole("textbox"), "14.25");
    expect(plain(first.pci.getResponse())).toEqual({ correct: true, field: "net" });
    expect(plain(second.pci.getResponse())).toEqual({ correct: true, answer: 14.25 });
    expect(pressed(second)).toEqual([]);
    // their own ids: the label of each answer box is its own
    expect(first.root.querySelector("[id]")!.id).not.toBe(second.root.querySelector("[id]")!.id);
  },
};

/** Every document, in English and Dutch: the fields are there and every value can be read. */
export const AllDocuments: Story = {
  play: async ({ canvasElement }) => {
    const names: Record<string, [string, string]> = {
      payslip: ["Payslip", "Loonstrook"], receipt: ["Till receipt", "Kassabon"], packingSlip: ["Packing slip", "Pakbon"], rota: ["Staff rota", "Dienstrooster"],
      timetable: ["Bus timetable", "Dienstregeling"], energyBill: ["Energy bill", "Energierekening"], dosage: ["Medicine leaflet", "Bijsluiter"],
    };
    for (const [template, [en, nl]] of Object.entries(names)) {
      for (const [language, name] of [["en", en], ["nl", nl]]) {
        const mounted = await remountPci(canvasElement, pci, { properties: { template, language } });
        expect(mounted.canvas.getByRole("region", { name })).toBeInTheDocument();
        const buttons = mounted.canvas.getAllByRole("button");
        expect(buttons.length).toBeGreaterThan(12);
        for (const button of buttons) expect(button.textContent).not.toMatch(/NaN|undefined/);
      }
    }
  },
};

// ---- the documents, for the README and to look at

/** The packing slip next to the box, one mistake found (for example.png). */
export const Example: Story = {
  args: { width: 960, properties: { template: "packingSlip", task: "check", title: "Your delivery", question: "Is the packing slip right? Compare it with what is in the box. Tap every mistake." } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    await userEvent.click(field(mounted, "Spirit level 60 cm, delivered"));
    expect(plain(mounted.pci.getResponse())).toMatchObject({ found: 1 });
    (focusedIn(mounted.root) as HTMLElement | null)?.blur(); // the picture without a focus ring
  },
};

export const PayslipFind: Story = { args: { properties: { template: "payslip", task: "find", language: "nl" } } };
export const ReceiptCheck: Story = { args: { properties: { template: "receipt", task: "check", language: "nl" } } };
export const RotaAnswer: Story = { args: { properties: { template: "rota", task: "answer" } } };
export const TimetableAnswer: Story = { args: { properties: { template: "timetable", task: "answer", language: "nl" } } };
export const EnergyBillFind: Story = { args: { properties: { template: "energyBill", task: "find", language: "nl" } } };
export const DosageCheck: Story = { args: { properties: { template: "dosage", task: "check" } } };

/** On a phone: the packing slip and the box under each other, the tables scroll on their own. */
export const Narrow: Story = {
  args: { width: 380, properties: { template: "packingSlip", task: "find" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.host.scrollWidth).toBeLessThanOrEqual(380);
  },
};

// ---- the authoring mode

type Authoring = StoryObj<AuthoringArgs>;
const input = (canvas: Awaited<ReturnType<typeof openAuthoring>>["canvas"], name: string) => canvas.getByRole("textbox", { name }) as HTMLInputElement;

export const AuthoringFind: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { template: "payslip", task: "find" } },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, root, changes } = await openAuthoring(canvasElement);
    const properties = () => instance.getProperties() as Record<string, string>;
    const tapField = (id: string) => userEvent.click(root.querySelector<HTMLElement>(`[data-field="${id}"]`)!);

    await step("starts from the example: the net wage is the right field", async () => {
      expect(canvas.getByRole("heading", { name: "Make the document" })).toBeInTheDocument();
      expect(canvas.getByRole("radio", { name: "Payslip" })).toHaveAttribute("aria-checked", "true");
      expect(properties()).toMatchObject({ template: "payslip", task: "find", targets: "net", language: "en" });
      expect(instance.validate()).toEqual([]);
    });

    await step("a tap in the document picks another field; the question follows it", async () => {
      await tapField("gross");
      expect(properties().targets).toBe("gross");
      expect(canvas.getByRole("textbox", { name: "Question" })).toHaveAttribute("placeholder", "Empty: Tap: Total gross.");
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("more than one right field", async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: /More than one field is right/ }));
      await tapField("net");
      expect(properties().targets).toBe("gross,net");
      await userEvent.click(canvas.getByRole("button", { name: "Remove: Total gross" }));
      expect(properties().targets).toBe("net");
      await userEvent.click(canvas.getByRole("button", { name: "Remove: Net wage" }));
      expect(instance.validate()).toEqual(["Tap the field the pupil has to find."]);
    });

    await step("a value changed: the document computes again", async () => {
      await retype(input(canvas, "Hours worked"), "70");
      expect(root.querySelector('[data-field="wage"]')).toHaveTextContent("€997.50");
      expect(JSON.parse(properties().document).values.hours).toBe("70");
      await retype(input(canvas, "Hourly wage"), "lots");
      expect(input(canvas, "Hourly wage")).toHaveAttribute("aria-invalid", "true");
      expect(instance.validate()).toContain("A value cannot be read: look at the fields marked in red.");
    });
  },
};

export const AuthoringCheck: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { template: "rota", task: "find" } },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, root } = await openAuthoring(canvasElement);
    const properties = () => instance.getProperties() as Record<string, string>;

    await step("check: the example's mistakes", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "Check" }));
      expect(JSON.parse(properties().document).mistakes).toEqual({ total2: "21", total3: "25" });
      expect(properties().targets).toBe("");
      expect(canvas.getByText("Noor, hours this week: 21 (should be 23)")).toBeInTheDocument();
    });

    await step("a tap on a computed field makes it wrong, a second tap right again; other fields cannot be tapped", async () => {
      expect(root.querySelector('[data-field="day1Person1"]')).toBeNull();
      await userEvent.click(root.querySelector<HTMLElement>('[data-field="total1"]')!);
      expect(JSON.parse(properties().document).mistakes.total1).toBe("18.5");
      await userEvent.click(root.querySelector<HTMLElement>('[data-field="total1"]')!);
      expect(JSON.parse(properties().document).mistakes.total1).toBeUndefined();
    });

    await step("a wrong value typed in the form", async () => {
      await retype(input(canvas, "Sam, hours this week: value on the document"), "16");
      expect(JSON.parse(properties().document).mistakes.total1).toBe("16");
      expect(canvas.getByText("Sam, hours this week: 16 (should be 17.5)")).toBeInTheDocument();
      await retype(input(canvas, "Noor, hours this week: value on the document"), "{Backspace}");
      await retype(input(canvas, "Daan, hours this week: value on the document"), "{Backspace}");
      await retype(input(canvas, "Sam, hours this week: value on the document"), "{Backspace}");
      expect(instance.validate()).toEqual(["Make at least one field wrong."]);
    });
  },
};

export const AuthoringAnswer: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { template: "timetable", task: "answer", language: "nl" } },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, root } = await openAuthoring(canvasElement);
    const properties = () => instance.getProperties() as Record<string, string>;

    await step("the example's answer stays, written out", async () => {
      expect(canvas.getByRole("heading", { name: "Document maken" })).toBeInTheDocument();
      expect(properties()).toMatchObject({ task: "answer", targets: "bus4Stop2", answer: "29", language: "nl" });
      expect(instance.validate()).toEqual([]);
    });

    await step("another source: the answer is typed or taken from it", async () => {
      await userEvent.click(root.querySelector<HTMLElement>('[data-field="stop3"]')!);
      expect(properties().targets).toBe("stop3");
      await retype(canvas.getByRole("textbox", { name: "Juiste antwoord" }), "{Backspace}");
      expect(instance.validate()).toEqual(["Typ het juiste antwoord als getal."]);
      await retype(canvas.getByRole("textbox", { name: "Juiste antwoord" }), "4,5");
      expect(properties().answer).toBe("4.5");
      await userEvent.click(canvas.getByRole("checkbox", { name: "De leerling mag aantikken waar het staat" }));
      expect(properties().markSource).toBe("false");
    });
  },
};

export const AuthoringRows: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { template: "receipt", task: "find", targets: "item5Amount" } },
  play: async ({ canvasElement }) => {
    const { instance, canvas, root } = await openAuthoring(canvasElement);
    const properties = () => instance.getProperties() as Record<string, string>;
    const values = () => JSON.parse(properties().document).values;
    await userEvent.click(canvas.getByRole("button", { name: "+ Add a line" }));
    expect(values()).toMatchObject({ items: "6", item6Name: "New item", item6Qty: "1", item6Price: "1.00" });
    expect(root.querySelector('[data-field="item6Amount"]')).toHaveTextContent("€1.00");
    // line 2 out: the lines after it move up, and so does the target
    await userEvent.click(canvas.getByRole("button", { name: "Remove line 2" }));
    expect(values()).toMatchObject({ items: "5", item2Name: "Apples, bag", item5Name: "New item" });
    expect(values().item6Name).toBeUndefined();
    expect(properties().targets).toBe("item4Amount");
  },
};

export const AuthoringSwitch: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: {} },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    const properties = () => instance.getProperties() as Record<string, string>;
    await userEvent.click(canvas.getByRole("radio", { name: "Medicine leaflet" }));
    expect(properties()).toMatchObject({ template: "dosage", targets: "dose2" });
    await userEvent.click(canvas.getByRole("radio", { name: "Dutch" }));
    expect(JSON.parse(properties().document).values.age1).toBe("6 tot 9 jaar");
    await userEvent.click(canvas.getByRole("radio", { name: "Answer" }));
    expect(properties()).toMatchObject({ task: "answer", targets: "perDay2", answer: "3", language: "nl" });
    await userEvent.click(canvas.getByRole("button", { name: "Start again from the example" }));
    expect(instance.validate()).toEqual([]);
  },
};
