import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { afterPaint, focusedIn, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Data chart",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

const PROMPT = "Point at the bars to see the percentages. Click the part of a bar that shows 29%.";
const TITLE = "How students travel to school, by age group";
const BUS_16 = "16–17, Bus, tram or train, 29%";

/** The tooltip's text, or null when there is none. */
const tooltip = (canvas: MountedPci["canvas"]) => canvas.queryByTestId("tooltip")?.textContent ?? null;
/** The names of the chosen parts (aria-checked). */
const chosen = (canvas: MountedPci["canvas"]) =>
  [...canvas.queryAllByRole("radio"), ...canvas.queryAllByRole("checkbox")].filter((m) => m.getAttribute("aria-checked") === "true").map((m) => m.getAttribute("aria-label"));
/** The part that has the focus in the PCI's shadow root. */
const focused = (mounted: MountedPci) => focusedIn(mounted.root)?.getAttribute("aria-label");

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText(PROMPT)).toBeInTheDocument();
    // the chart, named by its title, with one radio button per part of a bar
    const chart = canvas.getByRole("radiogroup", { name: TITLE });
    expect(within(chart).getAllByRole("radio")).toHaveLength(16);
    expect(within(chart).getAllByRole("radio")[0]).toHaveAccessibleName("12–13, Bike, 58%");
    expect(canvas.getByTestId("legend")).toHaveTextContent("BikeBus, tram or trainCar (passenger)Walking");
    expect(canvas.getByTestId("source")).toHaveTextContent("Source: made-up data");
    // the numbers are not in the chart: they show on demand
    expect(tooltip(canvas)).toBeNull();
    expect(canvasElement.querySelector(".tspci-host")!.shadowRoot!.querySelectorAll(".dc-values text")).toHaveLength(0);
    expect(canvas.getByTestId("chosen")).toHaveTextContent("Nothing chosen yet.");
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const TooltipOnHover: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("pointing at a part shows its numbers", async () => {
      await userEvent.hover(canvas.getByRole("radio", { name: BUS_16 }));
      await waitFor(() => expect(tooltip(canvas)).toBe("16–17Bus, tram or train29%"));
    });

    await step("a look long enough to read is in the state, not in the response", async () => {
      await waitFor(() => expect(JSON.parse(pci.getState()).state.viewed).toEqual({ "c3-s2": 1 }));
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("another part, another tooltip; away from the chart, none", async () => {
      await userEvent.hover(canvas.getByRole("radio", { name: "18+, Walking, 8%" }));
      await waitFor(() => expect(tooltip(canvas)).toContain("Walking8%"));
      await userEvent.unhover(canvas.getByRole("radio", { name: "18+, Walking, 8%" }));
      await userEvent.unhover(canvas.getByTestId("chart").parentElement!);
      await waitFor(() => expect(tooltip(canvas)).toBeNull());
    });
  },
};

export const TooltipOnKeyboard: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    const radios = canvas.getAllByRole("radio");

    await step("the chart is one tab stop: the first part", async () => {
      expect(radios.filter((r) => r.getAttribute("tabindex") === "0")).toEqual([radios[0]]);
      radios[0].focus();
      await waitFor(() => expect(tooltip(canvas)).toBe("12–13Bike58%"));
    });

    await step("the arrow keys go from part to part as they lie on the screen", async () => {
      await userEvent.keyboard("{ArrowRight}");
      expect(focused(mounted)).toBe("12–13, Bus, tram or train, 9%");
      await userEvent.keyboard("{ArrowDown}{ArrowDown}");
      expect(focused(mounted)).toBe(BUS_16);
      await waitFor(() => expect(tooltip(canvas)).toContain("29%"));
      await userEvent.keyboard("{End}");
      expect(focused(mounted)).toBe("18+, Walking, 8%");
      await userEvent.keyboard("{Home}");
      expect(focused(mounted)).toBe("12–13, Bike, 58%");
    });

    await step("Escape hides the tooltip, Enter chooses", async () => {
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(tooltip(canvas)).toBeNull());
      await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowRight}{Enter}");
      expect(pci.getResponse()).toEqual({ base: { identifier: "c3-s2" } });
      expect(chosen(canvas)).toEqual([BUS_16]);
      expect(await lastChange(mounted)).toEqual({ base: { identifier: "c3-s2" } });
    });
  },
};

export const SelectMode: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("a click chooses a part", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: BUS_16 }));
      expect(pci.getResponse()).toEqual({ base: { identifier: "c3-s2" } });
      expect(await lastChange(mounted)).toEqual({ base: { identifier: "c3-s2" } });
      expect(canvas.getByTestId("chosen")).toHaveTextContent("Your answer: 16–17, Bus, tram or train");
    });

    await step("another click replaces it", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "18+, Bus, tram or train, 47%" }));
      expect(chosen(canvas)).toEqual(["18+, Bus, tram or train, 47%"]);
      expect(pci.getResponse()).toEqual({ base: { identifier: "c4-s2" } });
    });
  },
};

export const MoreChoices: Story = {
  args: { properties: { maxchoices: "2" } }, // as some delivery systems hand it over: in lower case
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.getByRole("group", { name: TITLE })).toBeInTheDocument();

    await step("checkboxes: up to two, as a list", async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: "12–13, Bike, 58%" }));
      await userEvent.click(canvas.getByRole("checkbox", { name: "14–15, Bike, 61%" }));
      expect(pci.getResponse()).toEqual({ list: { identifier: ["c1-s1", "c2-s1"] } });
    });

    await step("a third is refused, with a message", async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: "16–17, Bike, 52%" }));
      expect(canvas.getByTestId("chosen")).toHaveTextContent("You can choose at most 2.");
      expect(pci.getResponse()).toEqual({ list: { identifier: ["c1-s1", "c2-s1"] } });
    });

    await step("a click on a chosen part undoes it", async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: "12–13, Bike, 58%" }));
      expect(chosen(canvas)).toEqual(["14–15, Bike, 61%"]);
      expect(await lastChange(mounted, 3)).toEqual({ list: { identifier: ["c2-s1"] } });
    });
  },
};

export const ToolMode: Story = {
  args: { properties: { mode: "tool" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    // nothing to choose: the parts are images with a name
    expect(canvas.queryAllByRole("radio")).toHaveLength(0);
    expect(canvas.getByRole("group", { name: TITLE })).toBeInTheDocument();
    expect(canvas.queryByTestId("chosen")).toBeNull();

    await step("the parts the candidate looked at are the response", async () => {
      await userEvent.hover(canvas.getByRole("img", { name: BUS_16 }));
      await waitFor(() => expect(pci.getResponse()).toEqual({ base: { string: '{"c3-s2":1}' } }));
      canvas.getByRole("img", { name: "12–13, Bike, 58%" }).focus();
      await waitFor(() => expect(pci.getResponse()).toEqual({ base: { string: '{"c3-s2":1,"c1-s1":1}' } }));
      expect(await lastChange(mounted, 2)).toEqual({ base: { string: '{"c3-s2":1,"c1-s1":1}' } });
    });

    await step("a click chooses nothing", async () => {
      await userEvent.click(canvas.getByRole("img", { name: BUS_16 }));
      expect(JSON.parse(pci.getState()).state.selected).toEqual([]);
    });
  },
};

const energy = JSON.stringify({
  series: [{ id: "s1", name: "Weekday", color: "#0072B2" }, { id: "s2", name: "Weekend", color: "#E69F00" }],
  categories: [
    { id: "c1", label: "Fridge", values: [1.2, 1.3] },
    { id: "c2", label: "Washing machine", values: [0.9, 2.45] },
    { id: "c3", label: "TV", values: [0.5, null] },
  ],
  correct: ["c2-s2"],
});

export const ColumnsWithValues: Story = {
  args: { properties: { data: energy, title: "Energy use per appliance", orientation: "vertical", layout: "grouped", unit: "kWh", showValues: "always", valueAxisLabel: "kWh per day", categoryAxisLabel: "" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the numbers in the chart, as the author wants; a part without a value is not there
    const labels = [...canvasElement.querySelector(".tspci-host")!.shadowRoot!.querySelectorAll(".dc-values text")].map((t) => t.textContent);
    expect(labels).toEqual(["1.20", "1.30", "0.90", "2.45", "0.50"]);
    expect(canvas.getAllByRole("radio")).toHaveLength(5);
    expect(canvas.getByRole("radio", { name: "Washing machine, Weekend, 2.45 kWh" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("radio", { name: "TV, Weekday, 0.50 kWh" }));
    expect(pci.getResponse()).toEqual({ base: { identifier: "c3-s1" } });
  },
};

export const PercentStacked: Story = {
  args: { properties: { data: energy, layout: "percent", unit: "kWh" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    // the value and its share of the bar
    await userEvent.hover(canvas.getByRole("radio", { name: "Washing machine, Weekend, 2.45 kWh (73.1% of the total)" }));
    await waitFor(() => expect(tooltip(canvas)).toContain("73.1% of the total"));
  },
};

export const LineChart: Story = {
  args: { properties: { chartType: "line", legend: "bottom" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    canvas.getByRole("radio", { name: "12–13, Bike, 58%" }).focus();
    // left and right along the line
    await userEvent.keyboard("{ArrowRight}");
    expect(focused(mounted)).toBe("14–15, Bike, 61%");
    await userEvent.keyboard("{Enter}");
    expect(pci.getResponse()).toEqual({ base: { identifier: "c2-s1" } });
  },
};

export const PieChart: Story = {
  args: { properties: { chartType: "pie", legend: "right", showValues: "always" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    // a donut per category, its slices the series
    expect(canvas.getAllByRole("radio")).toHaveLength(16);
    canvas.getByRole("radio", { name: "12–13, Walking, 19%" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(focused(mounted)).toBe("14–15, Bike, 61%");
    await userEvent.click(canvas.getByRole("radio", { name: BUS_16 }));
    expect(pci.getResponse()).toEqual({ base: { identifier: "c3-s2" } });
  },
};

export const ValuesNever: Story = {
  args: { properties: { showValues: "never", prompt: "Which age group cycles most?" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    // the parts are named without their value, the tooltip too
    await userEvent.hover(canvas.getByRole("radio", { name: "16–17, Bus, tram or train" }));
    await waitFor(() => expect(tooltip(canvas)).toBe("16–17Bus, tram or train"));
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", data: energy, unit: "€", title: "", prompt: "" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // without a title or instruction the chart is still named
    expect(canvas.getByRole("radiogroup", { name: "Grafiek" })).toBeInTheDocument();
    await userEvent.hover(canvas.getByRole("radio", { name: "Washing machine, Weekend, € 2,45" }));
    await waitFor(() => expect(canvas.getByTestId("tooltip-value")).toHaveTextContent("€ 2,45"));
    expect(canvas.getByTestId("chosen")).toHaveTextContent("Nog niets gekozen.");
    expect(canvas.getByTestId("source")).toHaveTextContent("Bron: made-up data");
    await userEvent.click(canvas.getByRole("radio", { name: "Fridge, Weekday, € 1,20" }));
    // the response does not depend on the language
    expect(pci.getResponse()).toEqual({ base: { identifier: "c1-s1" } });
  },
};

export const Touch: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const bus = canvas.getByRole("radio", { name: BUS_16 });
    const tap = async (el: Element) => {
      fireEvent.pointerDown(el, { pointerType: "touch" });
      fireEvent.pointerUp(el, { pointerType: "touch" });
      fireEvent.click(el);
      await afterPaint();
    };
    await step("a tap shows the numbers, without choosing", async () => {
      await tap(bus);
      await waitFor(() => expect(tooltip(canvas)).toContain("29%"));
      expect(pci.getResponse()).toBeUndefined();
    });
    await step("a second tap chooses", async () => {
      await tap(bus);
      expect(pci.getResponse()).toEqual({ base: { identifier: "c3-s2" } });
    });
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement, step }) => {
    const first = await openPci(canvasElement);
    await userEvent.hover(first.canvas.getByRole("radio", { name: BUS_16 }));
    await waitFor(() => expect(JSON.parse(first.pci.getState()).state.viewed).toEqual({ "c3-s2": 1 }));
    await userEvent.click(first.canvas.getByRole("radio", { name: BUS_16 }));
    const state = first.pci.getState();
    expect(JSON.parse(state).state).toEqual({ viewed: { "c3-s2": 1 }, selected: ["c3-s2"] });

    await step("the choice comes back, without telling the player about a change", async () => {
      const second = await remountPci(canvasElement, pci, { state });
      await waitFor(() => expect(chosen(second.canvas)).toEqual([BUS_16]));
      expect(second.pci.getResponse()).toEqual({ base: { identifier: "c3-s2" } });
      expect(second.changes).toHaveLength(0);
    });

    await step("in tool mode the same state gives the looks", async () => {
      const third = await remountPci(canvasElement, pci, { state, properties: { mode: "tool" } });
      expect(third.pci.getResponse()).toEqual({ base: { string: '{"c3-s2":1}' } });
    });

    await step("a state of something else: a fresh start", async () => {
      const fourth = await remountPci(canvasElement, pci, { state: "not json" });
      expect(fourth.pci.getResponse()).toBeUndefined();
    });
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: { base: { identifier: "c2-s4" } } } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("the bound response is shown", async () => {
      await waitFor(() => expect(chosen(canvas)).toEqual(["14–15, Walking, 14%"]));
      expect(mounted.changes).toHaveLength(0);
    });

    await step("setResponse takes the id as a string too", async () => {
      pci.setResponse({ base: { string: "c1-s3" } });
      await waitFor(() => expect(chosen(canvas)).toEqual(["12–13, Car (passenger), 14%"]));
      expect(await lastChange(mounted)).toEqual({ base: { identifier: "c1-s3" } });
    });

    await step("an id that is not in the chart clears the choice", async () => {
      pci.setResponse({ base: { identifier: "c9-s1" } });
      await waitFor(() => expect(chosen(canvas)).toEqual([]));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: {
    status: "solution",
    state: JSON.stringify({ state: { viewed: {}, selected: ["c1-s1"] }, log: [] }),
    responseDeclaration: { baseType: "identifier", cardinality: "single", correctResponse: { value: "c3-s2" } },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the correct response replaces the candidate's choice, with a check mark
    await waitFor(() => expect(chosen(canvas)).toEqual([BUS_16]));
    expect(pci.getResponse()).toEqual({ base: { identifier: "c3-s2" } });
    expect(canvasElement.querySelector(".tspci-host")!.shadowRoot!.querySelectorAll(".dc-badge")).toHaveLength(1);
  },
};

/** Two charts in one item: the module's one registered object hands each its own instance. */
export const TwoInstances: Story = {
  render: () => {
    const page = document.createElement("div");
    const make = (id: string, properties: Record<string, string>) => {
      const host = document.createElement("div");
      host.dataset.testid = id;
      page.appendChild(host);
      requestAnimationFrame(() => {
        const instance = pci.getInstance(host, { properties, responseIdentifier: id, boundTo: {}, onready: () => {} } as any, undefined);
        (host as any).pci = instance;
      });
    };
    make("first", {});
    make("second", { mode: "tool" });
    return page;
  },
  play: async ({ canvasElement }) => {
    const host = (id: string) => canvasElement.querySelector<HTMLElement & { pci: any }>(`[data-testid=${id}]`)!;
    await waitFor(() => expect(host("first").pci && host("second").pci).toBeTruthy());
    await afterPaint();
    const first = within(host("first").shadowRoot as unknown as HTMLElement);
    const second = within(host("second").shadowRoot as unknown as HTMLElement);
    expect(host("first").pci).not.toBe(host("second").pci);
    await userEvent.click(first.getByRole("radio", { name: BUS_16 }));
    await userEvent.hover(second.getByRole("img", { name: "18+, Bike, 38%" }));
    await waitFor(() => expect(host("second").pci.getResponse()).toEqual({ base: { string: '{"c4-s1":1}' } }));
    // each keeps its own response
    expect(host("first").pci.getResponse()).toEqual({ base: { identifier: "c3-s2" } });
    expect(JSON.parse(host("second").pci.getState()).state.selected).toEqual([]);
  },
};

// --- Authoring mode: what an authoring system shows the item author (getAuthoringInstance)

/** The authoring mode, as an authoring system shows it after "Edit the chart data…". */
export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", width: 1040 },
  play: async ({ canvasElement, step }) => {
    const { canvas, instance, changes } = await openAuthoring(canvasElement);
    const data = () => JSON.parse(instance.getProperties().data!);

    await step("starts from the example, with its correct answer", async () => {
      expect(canvas.getByTestId("summary")).toHaveTextContent("4 categories × 4 series");
      expect(instance.validate!()).toEqual([]);
      expect(canvas.getByTestId("correct")).toHaveTextContent("Correct: 16–17, Bus, tram or train");
    });

    await step("the author edits a value and a name; the preview follows", async () => {
      await retype(canvas.getByRole("textbox", { name: "Value of category 1, series 1" }), "57.5");
      await retype(canvas.getByRole("textbox", { name: "Name of series 1" }), "Cycling");
      expect(data().categories[0].values[0]).toBe(57.5);
      expect(within(canvas.getByTestId("preview")).getByRole("radio", { name: "12–13, Cycling, 57.5%" })).toBeInTheDocument();
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("a colour from the palette", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Colour of Cycling" }));
      await userEvent.click(canvas.getByRole("button", { name: "Vermillion" }));
      expect(data().series[0].color).toBe("#D55E00");
    });

    await step("removing the series of the correct answer asks for a new one", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Remove series 2" }));
      expect(instance.validate!()).toEqual(["Mark the correct answer: click it in the preview."]);
      await userEvent.click(within(canvas.getByTestId("preview")).getByRole("radio", { name: "18+, Car (passenger), 7.0%" }));
      expect(data().correct).toEqual(["c4-s3"]);
      expect(instance.validate!()).toEqual([]);
    });

    await step("a table pasted from a spreadsheet", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Empty table" }));
      expect(instance.validate!()).toContain("The table has no numbers yet.");
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", "Appliance\tWeekday\tWeekend\nFridge\t1.2\t1.3\nTV\t0.5\t0.8\n");
      canvas.getByRole("textbox", { name: "Category" }).dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
      await afterPaint();
      expect(canvas.getByTestId("summary")).toHaveTextContent("2 categories × 2 series");
      const d = data();
      expect(d.series.map((s: { name: string }) => s.name)).toEqual(["Weekday", "Weekend"]);
      expect(d.categories.map((c: { label: string; values: number[] }) => [c.label, c.values])).toEqual([["Fridge", [1.2, 1.3]], ["TV", [0.5, 0.8]]]);
    });
  },
};

export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", width: 1040, properties: { language: "nl", mode: "tool" } },
  play: async ({ canvasElement }) => {
    const { canvas, instance } = await openAuthoring(canvasElement);
    // the author's texts in Dutch, numbers with a decimal comma; a tool needs no correct answer
    expect(canvas.getByRole("button", { name: "Categorie toevoegen" })).toBeInTheDocument();
    expect(canvas.queryByTestId("correct")).toBeNull();
    await retype(canvas.getByRole("textbox", { name: "Waarde van categorie 2, reeks 1" }), "60,5");
    expect(JSON.parse(instance.getProperties().data!).categories[1].values[0]).toBe(60.5);
    expect(instance.validate!()).toEqual([]);
  },
};
