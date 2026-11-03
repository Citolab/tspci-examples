import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { afterPaint, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Nutrition label",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Record = { record: { name: string; base: { integer?: number; float?: number; string?: string } | null }[] } | undefined;
/** A field of the record response. */
const field = (response: unknown, name: string) => (response as Record)?.record.find((f) => f.name === name)?.base;
const comp = (response: unknown) => JSON.parse(field(response, "composition")?.string ?? "{}");
const MODEL = { record: [{ name: "composition", base: { string: '{"apple":135,"bread":70,"cheese":20,"milk":250}' } }] };

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText(/^Make a lunch with at most 2500 kJ/)).toBeInTheDocument();
    expect(canvas.getAllByRole("button", { name: /to the meal$/ })).toHaveLength(14);
    expect(canvas.getByRole("heading", { name: "Your meal" })).toBeInTheDocument();
    expect(canvas.getByText("Nothing yet. Add products with Add.")).toBeInTheDocument();
    expect(canvas.getByRole("row", { name: /^Energy \(kJ\) 0 kJ/ })).toBeInTheDocument();
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const ReadALabel: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas } = await openPci(canvasElement);
    await step("a label opens as a table with headers", async () => {
      const toggle = canvas.getByRole("button", { name: /Show label: Instant tomato soup/ });
      await userEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      const label = canvas.getByRole("table", { name: "Nutrition information: Instant tomato soup (prepared)" });
      const t = within(label);
      expect(t.getByRole("columnheader", { name: "per 1 mug (175 g)" })).toBeInTheDocument();
      expect(t.getByRole("row", { name: /^Salt 0.85 g 1.49 g 25%$/ })).toBeInTheDocument();
      expect(t.getByRole("row", { name: /^of which sugars/ })).toBeInTheDocument();
      expect(t.getByText(/Reference intake of an average adult \(8400 kJ \/ 2000 kcal\)/)).toBeInTheDocument();
    });
    await step("all labels at once", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Show all labels" }));
      expect(canvas.getAllByRole("table", { name: /^Nutrition information/ })).toHaveLength(14);
      await userEvent.click(canvas.getByRole("button", { name: "Hide all labels" }));
      expect(canvas.queryAllByRole("table", { name: /^Nutrition information/ })).toHaveLength(0);
    });
  },
};

export const ComposeALunch: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await step("two slices of bread, cheese in grams, a glass of milk and an apple", async () => {
      await retype(canvas.getByRole("textbox", { name: "Amount of Wholemeal bread" }), "2");
      await userEvent.click(canvas.getByRole("button", { name: "Add Wholemeal bread to the meal" }));
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Unit for Gouda cheese 48+" }), "g");
      await retype(canvas.getByRole("textbox", { name: "Amount of Gouda cheese 48+" }), "20");
      await userEvent.click(canvas.getByRole("button", { name: "Add Gouda cheese 48+ to the meal" }));
      await userEvent.click(canvas.getByRole("button", { name: "Add Semi-skimmed milk to the meal" }));
      await userEvent.click(canvas.getByRole("button", { name: "Add Apple to the meal" }));
      expect(canvas.getByRole("status")).toHaveTextContent("1 portion Apple added. Energy of the meal: 1776 kJ.");
      expect(canvas.getByText("4 products")).toBeInTheDocument();
      expect(canvas.getByRole("row", { name: /^Protein 21.0 g/ })).toBeInTheDocument();
      expect(canvas.getByRole("row", { name: /^Energy \(kJ\) 1776 kJ 21%/ })).toBeInTheDocument();
    });
    await step("the response: every check passes", async () => {
      const response = await lastChange(mounted, 4);
      expect(comp(response)).toEqual({ apple: 135, bread: 70, cheese: 20, milk: 250 });
      expect(field(response, "score")?.integer).toBe(4);
      expect(field(response, "maxscore")?.integer).toBe(4);
      expect(field(response, "correct")?.integer).toBe(1);
      expect(field(response, "energyKj")?.float).toBe(1776);
      expect(field(response, "items")?.integer).toBe(4);
    });
    await step("crisps make it too salty; removing the apple loses a group", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Add Paprika crisps to the meal" }));
      await retype(canvas.getByRole("textbox", { name: "Amount of Paprika crisps" }), "3");
      await userEvent.click(canvas.getByRole("button", { name: "Add Paprika crisps to the meal" }));
      await waitFor(() => expect(canvas.getByTestId("line-amount-crisps")).toHaveValue("4"));
      await userEvent.click(canvas.getByRole("button", { name: "Remove Apple" }));
      const r = pci.getResponse();
      expect(field(r, "check3")?.integer).toBe(0);
      expect(field(r, "score")?.integer).toBeLessThan(4);
    });
    await step("empty the meal: no response", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Empty the meal" }));
      expect(canvas.getByRole("status")).toHaveTextContent("The meal is empty.");
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const OverTheReference: Story = {
  args: { boundTo: { RESPONSE: { record: [{ name: "composition", base: { string: '{"crisps":250,"cola":1000}' } }] } } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    // a total above the reference intake: a ▲ and words, not only a colour
    const fat = canvas.getByRole("row", { name: /^Fat 82.5 g/ });
    expect(fat).toHaveTextContent("▲ 118%");
    expect(fat).toHaveTextContent("above the reference intake");
    expect(canvas.getByRole("row", { name: /^Sugars 113.5 g/ })).toHaveTextContent("126%");
    expect(canvas.getByRole("row", { name: /^Protein/ })).not.toHaveTextContent("▲");
  },
};

export const EditAndKeyboard: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("Enter in the amount adds the product", async () => {
      const amount = canvas.getByRole("textbox", { name: "Amount of Boiled egg" });
      await retype(amount, "2");
      await userEvent.type(amount, "{Enter}");
      expect(comp(pci.getResponse())).toEqual({ egg: 110 });
    });
    await step("letters are refused, with a message", async () => {
      const amount = canvas.getByRole("textbox", { name: "Amount of Apple" });
      await retype(amount, "1a");
      expect(amount).toHaveValue("1");
      expect(canvas.getByTestId("hint")).toHaveTextContent("Only digits and one decimal sign.");
    });
    await step("the amount in the meal and its unit stay editable", async () => {
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Unit of Boiled egg in your meal" }), "g");
      await waitFor(() => expect(canvas.getByTestId("line-amount-egg")).toHaveValue("110"));
      await retype(canvas.getByTestId("line-amount-egg"), "60");
      expect(comp(pci.getResponse())).toEqual({ egg: 60 });
      expect(canvas.getByRole("status")).toHaveTextContent("Boiled egg: 60 g.");
    });
  },
};

export const GramsOnly: Story = {
  args: { properties: { amountUnit: "grams", showBars: "false", showExtras: "false" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.queryByRole("combobox", { name: /^Unit for/ })).toBeNull();
    expect(canvas.getByRole("textbox", { name: "Amount of Apple" })).toHaveValue("100");
    await userEvent.click(canvas.getByRole("button", { name: "Add Apple to the meal" }));
    expect(comp(pci.getResponse())).toEqual({ apple: 100 });
    expect(canvas.queryByRole("row", { name: /^Vitamin C/ })).toBeNull();
  },
};

export const WithoutTotals: Story = {
  args: { properties: { showTotals: "false", prompt: "Calculate the energy of this lunch yourself." } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add Croissant to the meal" }));
    expect(canvas.queryByRole("table", { name: /^Totals/ })).toBeNull();
    expect(canvas.queryByTestId("totals")).toBeNull();
    expect(canvas.getByText("1 product")).toBeInTheDocument();
  },
};

export const ChooseAProduct: Story = {
  args: { properties: { mode: "select", prompt: "Which product contains the most salt per portion?" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.getByRole("radiogroup", { name: "Products" })).toBeInTheDocument();
    expect(canvas.getAllByRole("table", { name: /^Nutrition information/ })).toHaveLength(14);
    expect(canvas.queryByRole("heading", { name: "Your meal" })).toBeNull();
    await userEvent.click(canvas.getByRole("radio", { name: /Instant tomato soup/ }));
    expect(await lastChange(mounted)).toEqual({ base: { identifier: "soup" } });
    expect(canvas.getByRole("status")).toHaveTextContent("Instant tomato soup (prepared) chosen.");
    await userEvent.click(canvas.getByRole("radio", { name: /Croissant/ }));
    expect(pci.getResponse()).toEqual({ base: { identifier: "croissant" } });
    expect(canvas.getByRole("radio", { name: /Instant tomato soup/ })).not.toBeChecked();
    expect(pci.getCorrectResponse({ mode: "select" })).toEqual({ base: { identifier: "soup" } });
  },
};

export const ToolMode: Story = {
  args: { properties: { mode: "tool", prompt: "Use the calculator: how much energy is there in 150 g of wholemeal bread?" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Unit for Wholemeal bread" }), "g");
    await retype(canvas.getByRole("textbox", { name: "Amount of Wholemeal bread" }), "150");
    await userEvent.click(canvas.getByRole("button", { name: "Add Wholemeal bread to the meal" }));
    expect(canvas.getByTestId("energy")).toHaveTextContent("1500 kJ / 359 kcal");
    const r = (await lastChange(mounted)) as { base: { string: string } };
    const json = JSON.parse(r.base.string);
    expect(json.composition).toEqual({ bread: 150 });
    expect(json.totals.energyKj).toBe(1500);
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", prompt: "Stel een lunch samen met hoogstens 2500 kJ." } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("heading", { name: "Jouw maaltijd" })).toBeInTheDocument();
    await retype(canvas.getByRole("textbox", { name: "Hoeveelheid Volkorenbrood" }), "1,5");
    await userEvent.click(canvas.getByRole("button", { name: "Volkorenbrood toevoegen aan de maaltijd" }));
    expect(comp(pci.getResponse())).toEqual({ bread: 52.5 });
    expect(canvas.getByTestId("line-amount-bread")).toHaveValue("1,5");
    expect(canvas.getByRole("row", { name: /^Eiwitten 5,3 g/ })).toBeInTheDocument();
    expect(canvas.getByRole("row", { name: /^Zout 0,53 g/ })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Etiket tonen: Volkorenbrood" }));
    expect(canvas.getByRole("table", { name: "Voedingswaarde: Volkorenbrood" })).toHaveTextContent("waarvan verzadigde vetzuren");
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.click(first.canvas.getByRole("button", { name: "Add Boiled egg to the meal" }));
    await userEvent.click(first.canvas.getByRole("button", { name: "Add Low-fat yoghurt to the meal" }));
    const state = first.pci.getState();
    const second = await remountPci(canvasElement, pci, { state });
    expect(comp(second.pci.getResponse())).toEqual({ egg: 55, yoghurt: 150 });
    expect(second.canvas.getByTestId("line-amount-egg")).toHaveValue("1");
    expect(JSON.parse(second.pci.getState()).log).toHaveLength(2);
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: MODEL } },
  play: async ({ canvasElement }) => {
    const { canvas, pci, changes } = await openPci(canvasElement);
    expect(comp(pci.getResponse())).toEqual({ apple: 135, bread: 70, cheese: 20, milk: 250 });
    expect(canvas.getByText("4 products")).toBeInTheDocument();
    expect(changes).toHaveLength(0);
  },
};

export const Solution: Story = {
  args: { status: "solution" },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(field(pci.getResponse(), "score")?.integer).toBe(4);
    expect(canvas.getByText("This is the answer; you cannot change it.")).toBeInTheDocument();
    expect(canvas.queryByRole("button", { name: /to the meal$/ })).toBeNull();
    expect(canvas.queryByRole("button", { name: /^Remove/ })).toBeNull();
  },
};

export const SolutionFromDeclaration: Story = {
  args: { status: "solution", properties: { mode: "select" }, responseDeclaration: { baseType: "identifier", cardinality: "single", correctResponse: { value: "chicken" } } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(pci.getResponse()).toEqual({ base: { identifier: "chicken" } });
    expect(canvas.getByRole("radio", { name: /Sliced chicken breast/ })).toBeChecked();
    expect(canvas.getByRole("radio", { name: /Sliced chicken breast/ })).toBeDisabled();
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
    await userEvent.click(first.canvas.getByRole("button", { name: "Add Apple to the meal" }));
    await userEvent.click(second.canvas.getByRole("button", { name: "Add Cola to the meal" }));
    expect(comp(first.pci.getResponse())).toEqual({ apple: 135 });
    expect(comp(second.pci.getResponse())).toEqual({ cola: 250 });
    expect(first.changes).toHaveLength(1);
    expect(second.changes).toHaveLength(1);
  },
};

// --- Authoring mode: what an authoring system shows the item author (getAuthoringInstance)

export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);
    const plan = () => JSON.parse(instance.getProperties().plan!);

    await step("starts from the example, without problems", async () => {
      expect(instance.validate()).toEqual([]);
      expect(canvas.getByTestId("parsed")).toHaveTextContent("14 products");
      expect(plan().products).toHaveLength(14);
    });

    await step("a check the model answer fails is a problem", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Checks" }));
      await retype(canvas.getByRole("textbox", { name: "Check 2: at least" }), "40");
      expect(canvas.getByTestId("check-1-result")).toHaveTextContent("fails");
      expect(instance.validate()).toContain("The model answer does not pass check 2.");
      await retype(canvas.getByRole("textbox", { name: "Check 2: at least" }), "15");
      expect(instance.validate()).toEqual([]);
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("a pasted table replaces the products", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Products" }));
      const tsv = canvas.getByRole("textbox", { name: "Product table (tab separated)" });
      (tsv as HTMLTextAreaElement).value = "name\tportion\tkJ\tprotein\tsalt\nQuark\t150\t240\t9\t0,1\nRye bread\t40\t900\t6\t1,2\n";
      tsv.dispatchEvent(new Event("input", { bubbles: true }));
      await afterPaint();
      expect(canvas.getByTestId("parsed")).toHaveTextContent("2 products");
      expect(plan().products.map((p: { id: string }) => p.id)).toEqual(["quark", "ryeBread"]);
      expect(canvas.getByRole("row", { name: /^ryeBread Rye bread/ })).toBeInTheDocument();
    });

    await step("select mode: the helper fills in the answer", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Task" }));
      await userEvent.click(canvas.getByRole("radio", { name: /^Choose a product/ }));
      expect(instance.validate()).toContain("Choose the correct product (tab Task).");
      await userEvent.selectOptions(canvas.getByTestId("helper-nutrient"), "salt");
      await userEvent.click(canvas.getByRole("button", { name: "Fill in" }));
      expect(plan().answer).toBe("ryeBread");
      expect(instance.getProperties().mode).toBe("select");
      expect(instance.validate()).toEqual([]);
    });

    await step("the target group sets the reference intakes", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Reference intakes" }));
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Target group" }), "child");
      expect(plan().reference).toEqual({ group: "child" });
      await waitFor(() => expect(canvas.getByRole("textbox", { name: "Reference intake: Energy (kJ)" })).toHaveValue("6700"));
    });
  },
};

export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { mode: "select", plan: JSON.stringify({ products: [{ id: "a", name: "A", per100: { energyKj: 100 } }] }) } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("tab", { name: "Producten" })).toBeInTheDocument();
    expect(instance.validate()).toEqual(["Kies het goede product (tab Taak)."]);
  },
};
