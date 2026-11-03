import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Chance tools",
  render: (args) => mountPci(pci, args),
  args: { properties: { seed: "2026" } },
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Canvas = MountedPci["canvas"];
type Record = { record: { name: string; base: { integer?: number; string?: string; float?: number } | null }[] } | undefined;

/** A field of the record response. */
const field = (response: unknown, name: string) => (response as Record)?.record.find((f) => f.name === name)?.base;
/** The experiment log of tool mode. */
const log = (response: unknown) => JSON.parse((response as { base: { string: string } }).base.string);
const trials = (canvas: Canvas) => canvas.getByTestId("trials").textContent;
/** One sector of the candidate's spinner, as a screen reader names it ("Sector 2 of 8: blue"). */
const sector = (canvas: Canvas, i: number) => canvas.getByRole("button", { name: new RegExp(`^Sector ${i} of`) });
const fill = async (canvas: Canvas, name: string, text: string) => retype(canvas.getByRole("textbox", { name }), text);
const slow = { timeout: 3000 };

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("img", { name: /^Spinner with sectors red, blue, yellow/ })).toBeInTheDocument();
    expect(canvas.getByRole("group", { name: "Do the experiment" })).toBeInTheDocument();
    expect(canvas.getByRole("table")).toHaveTextContent("red");
    expect(trials(canvas)).toBe("Trials: 0");
    expect(pci.getResponse()).toBeUndefined();
  },
};

/** 10 trials: the pointer turns once, then the table and chart show all ten. */
export const RunExperiments: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    await step("10 trials, animated once", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Do the experiment 10 times" }));
      await waitFor(() => expect(trials(canvas)).toBe("Trials: 10"), slow);
      expect(canvas.getByRole("img", { name: "Bar chart of the relative frequencies after 10 trials" })).toBeInTheDocument();
      expect(canvas.getByRole("status")).toHaveTextContent(/^Done 10 times, 10 in total/);
    });
    await step("100 and 1 more; the frequencies add up", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Do the experiment 100 times" }));
      await waitFor(() => expect(trials(canvas)).toBe("Trials: 110"), slow);
      await userEvent.click(canvas.getByRole("button", { name: "Do the experiment once" }));
      await waitFor(() => expect(trials(canvas)).toBe("Trials: 111"), slow);
      const counts = canvas.getAllByRole("row").slice(1).map((r) => Number(r.querySelectorAll("td")[0].textContent));
      expect(counts.reduce((a, b) => a + b, 0)).toBe(111);
    });
    await step("the response: the experiment log", async () => {
      const l = log(await lastChange(mounted, 3));
      expect(l).toMatchObject({ tool: "spinner", trials: 111, runs: [10, 100, 1], seed: 2026, start: 0 });
    });
    await step("start again: a new series with the same seed", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Start again" }));
      expect(trials(canvas)).toBe("Trials: 0");
      expect(mounted.pci.getResponse()).toBeUndefined();
    });
  },
};

/** The same seed gives the same history. */
export const Seeded: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.click(first.canvas.getByRole("button", { name: "Do the experiment 100 times" }));
    await waitFor(() => expect(trials(first.canvas)).toBe("Trials: 100"), slow);
    const table = first.canvas.getByRole("table").textContent;
    const second = await remountPci(canvasElement, pci, { properties: { seed: "2026" } });
    await userEvent.click(second.canvas.getByRole("button", { name: "Do the experiment 100 times" }));
    await waitFor(() => expect(trials(second.canvas)).toBe("Trials: 100"), slow);
    expect(second.canvas.getByRole("table").textContent).toBe(table);
  },
};

export const TwoDiceWithProbabilities: Story = {
  args: { properties: { seed: "7", showTheory: "true", setup: JSON.stringify({ tool: "dice", dice: { count: 2, combine: "sum" } }) } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getAllByRole("row")).toHaveLength(12); // the header and the sums 2 … 12
    expect(canvas.getByRole("columnheader", { name: "Sum" })).toBeInTheDocument();
    expect(canvas.getByRole("rowheader", { name: "7" }).parentElement).toHaveTextContent("1/6");
    await userEvent.click(canvas.getByRole("button", { name: "Do the experiment once" }));
    await waitFor(() => expect(canvas.getByRole("img", { name: /^Die 1: \d/ })).toBeInTheDocument(), slow);
    await waitFor(() => expect(log(pci.getResponse()).trials).toBe(1));
  },
};

export const BagWithoutPuttingBack: Story = {
  args: { properties: { seed: "3", setup: JSON.stringify({ tool: "bag", bag: { balls: [{ label: "red", count: 1, color: 0 }, { label: "blue", count: 1, color: 1 }], draws: 2, replace: false } }) } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("img", { name: "Bag with 1 × red, 1 × blue" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Do the experiment 100 times" }));
    await waitFor(() => expect(trials(canvas)).toBe("Trials: 100"), slow);
    // one of each: never twice the same colour
    expect(Object.keys(log(pci.getResponse()).outcomes).sort()).toEqual(["blue,red", "red,blue"]);
  },
};

/** Design mode: a spinner where red is 3/8 and blue 1/4, with the mouse and the keyboard. */
export const DesignSpinner: Story = {
  args: { properties: { mode: "design", prompt: "Make a spinner where the probability of red is 3/8 and of blue 1/4." } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await step("8 sectors: the new ones in the chosen colour", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "yellow" }));
      for (let i = 0; i < 4; i++) await userEvent.click(canvas.getByRole("button", { name: "One sector more" }));
      expect(canvas.getByTestId("sector-count")).toHaveTextContent("8 sectors");
      expect(canvas.getByRole("status")).toHaveTextContent("The spinner has 8 equal sectors now.");
    });
    await step("the mouse: red on sectors 2 and 5", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "red" }));
      await userEvent.click(sector(canvas, 2));
      await userEvent.click(sector(canvas, 5));
      const r = await lastChange(mounted);
      expect(field(r, "probability1")).toEqual({ string: "3/8" });
      expect(field(r, "target1")).toEqual({ integer: 1 });
      expect(field(r, "score")).toEqual({ integer: 1 });
    });
    await step("the keyboard: blue on sectors 6 and 7", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "blue" }));
      sector(canvas, 5).focus();
      await userEvent.keyboard("{ArrowRight}{Enter}{ArrowRight} ");
      expect(sector(canvas, 7)).toHaveAccessibleName("Sector 7 of 8: blue");
      const r = pci.getResponse();
      expect(field(r, "correct")).toEqual({ integer: 1 });
      expect(field(r, "value2")).toEqual({ float: 0.25 });
      expect(JSON.parse(field(r, "design")!.string!)).toEqual({ tool: "spinner", sectors: ["red", "red", "yellow", "yellow", "red", "blue", "blue", "yellow"] });
    });
    await step("try the design: the trials go in the record", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Do the experiment 10 times" }));
      await waitFor(() => expect(field(pci.getResponse(), "trials")).toEqual({ integer: 10 }), slow);
    });
  },
};

export const DesignBag: Story = {
  args: {
    properties: {
      mode: "design",
      setup: JSON.stringify({ tool: "bag", bag: { balls: [{ label: "red", count: 0, color: 0 }, { label: "blue", count: 1, color: 1 }] }, targets: [{ outcome: "red", probability: "2/5" }], size: 10 }),
    },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    for (let i = 0; i < 4; i++) await userEvent.click(canvas.getByRole("button", { name: "One more: red" }));
    for (let i = 0; i < 5; i++) await userEvent.click(canvas.getByRole("button", { name: "One more: blue" }));
    expect(canvas.getByTestId("ball-count")).toHaveTextContent("10 balls in the bag");
    const r = pci.getResponse();
    expect(field(r, "score")).toEqual({ integer: 2 });
    expect(field(r, "sizeCheck")).toEqual({ integer: 1 });
    await userEvent.click(canvas.getByRole("button", { name: "One less: blue" }));
    expect(field(pci.getResponse(), "score")).toEqual({ integer: 0 }); // 4/9, and not 10 balls
  },
};

/** Tree mode: scored per branch; equivalent fractions and decimals within the margin count. */
export const ProbabilityTree: Story = {
  args: { properties: { mode: "tree", prompt: "A bag has 3 red and 2 blue balls. You take two balls without putting the first back." } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await step("the branches", async () => {
      await fill(canvas, "Probability of red", "6/10");
      await fill(canvas, "Probability of blue", "0.4");
      await fill(canvas, "Probability of red after red", "2/4");
      await fill(canvas, "Probability of blue after red", "1/2");
      await fill(canvas, "Probability of red after blue", "75%");
      await fill(canvas, "Probability of blue after blue", "0.3");
      const r = await lastChange(mounted);
      expect([1, 2, 3, 4, 5, 6].map((i) => field(r, `branch${i}`)?.integer)).toEqual([1, 1, 1, 1, 1, 0]);
    });
    await step("a path and the event", async () => {
      await fill(canvas, "Probability of the path red, red", "3/10");
      await fill(canvas, "Probability of two balls of the same colour", "0.4");
      const r = pci.getResponse();
      expect(field(r, "path1")).toEqual({ integer: 1 });
      expect(field(r, "answerCheck")).toEqual({ integer: 1 });
      expect(field(r, "answerValue")).toEqual({ float: 0.4 });
      expect(field(r, "score")).toEqual({ integer: 7 });
      expect(field(r, "maxscore")).toEqual({ integer: 11 });
    });
    await step("letters are refused", async () => {
      await userEvent.type(canvas.getByRole("textbox", { name: "Probability of blue after blue" }), "x");
      expect(canvas.getByRole("textbox", { name: "Probability of blue after blue" })).toHaveValue("0.3");
    });
  },
};

/** The candidate chooses the outcomes; their order does not matter. */
export const TreeChooseOutcomes: Story = {
  args: { properties: { mode: "tree", setup: JSON.stringify({ tool: "coins", tree: { labels: "choose", paths: false, event: null }, experiments: false }) } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.queryByRole("group", { name: "Do the experiment" })).toBeNull();
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Outcome of branch 1" }), "Tails");
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Outcome of branch 2" }), "Heads");
    await fill(canvas, "Probability of Tails", "1/2");
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Outcome after Tails, branch 1" }), "Heads");
    await fill(canvas, "Probability of Heads after Tails", "0,5");
    const r = pci.getResponse();
    expect(field(r, "branch1")).toEqual({ integer: 1 });
    expect(field(r, "branch3")).toEqual({ integer: 1 });
    expect(field(r, "maxscore")).toEqual({ integer: 6 });
  },
};

export const Dutch: Story = {
  args: { properties: { seed: "1", language: "nl", setup: JSON.stringify({ tool: "coins", coins: { count: 2 } }) } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Het experiment 10 keer uitvoeren" }));
    await waitFor(() => expect(trials(canvas)).toBe("Aantal keer: 10"), slow);
    expect(canvas.getByRole("columnheader", { name: "Relatieve frequentie" })).toBeInTheDocument();
    expect(canvas.getByRole("rowheader", { name: "Kop, Munt" })).toBeInTheDocument();
    for (const row of canvas.getAllByRole("row").slice(1)) expect(row.querySelectorAll("td")[1].textContent).toMatch(/^\d,\d\d$/);
    // the response is the same in every language
    expect(Object.keys(log(pci.getResponse()).outcomes).every((k) => /^[HT],[HT]$/.test(k))).toBe(true);
  },
};

export const DutchTree: Story = {
  args: { properties: { mode: "tree", language: "nl" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("region", { name: "Kansboom" })).toBeInTheDocument();
    await fill(canvas, "Kans op rood", "0,6");
    expect(JSON.parse(field(pci.getResponse(), "tree")!.string!).probs).toEqual({ "0": "0.6" });
    expect(field(pci.getResponse(), "branch1")).toEqual({ integer: 1 });
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.click(first.canvas.getByRole("button", { name: "Do the experiment 10 times" }));
    await waitFor(() => expect(trials(first.canvas)).toBe("Trials: 10"), slow);
    const state = first.pci.getState();
    const table = first.canvas.getByRole("table").textContent;
    // another seed in the settings: the state brings its own
    const second = await remountPci(canvasElement, pci, { state, properties: { seed: "1" } });
    expect(trials(second.canvas)).toBe("Trials: 10");
    expect(second.canvas.getByRole("table").textContent).toBe(table);
    expect(second.pci.getResponse()).toEqual(first.pci.getResponse());
    expect(second.changes).toHaveLength(0);
  },
};

export const BoundResponse: Story = {
  args: {
    properties: { mode: "design" },
    boundTo: { RESPONSE: { record: [{ name: "design", base: { string: JSON.stringify({ tool: "spinner", sectors: ["red", "blue"] }) } }] } },
  },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("the bound design", async () => {
      expect(canvas.getByTestId("sector-count")).toHaveTextContent("2 sectors");
      expect(field(pci.getResponse(), "probability1")).toEqual({ string: "1/2" });
    });
    await step("resetResponse: the spinner the item starts with", async () => {
      pci.resetResponse();
      await waitFor(() => expect(canvas.getByTestId("sector-count")).toHaveTextContent("4 sectors"));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: { status: "solution", properties: { mode: "tree" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText("The correct answer")).toBeInTheDocument();
    expect(canvas.getByRole("textbox", { name: "Probability of red" })).toHaveValue("3/5");
    expect(canvas.getByRole("textbox", { name: "Probability of red" })).toBeDisabled();
    expect(canvas.getByRole("textbox", { name: "Probability of two balls of the same colour" })).toHaveValue("2/5");
    expect(field(pci.getResponse(), "correct")).toEqual({ integer: 1 });
  },
};

export const SolutionDesign: Story = {
  args: { status: "solution", properties: { mode: "design" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByTestId("sector-count")).toHaveTextContent("8 sectors");
    expect(canvas.getByRole("button", { name: "One sector more" })).toBeDisabled();
    expect(field(pci.getResponse(), "correct")).toEqual({ integer: 1 });
  },
};

export const SolutionFromTheDeclaration: Story = {
  args: {
    status: "solution",
    properties: { mode: "design" },
    responseDeclaration: { cardinality: "record", correctResponse: { value: [{ fieldIdentifier: "design", value: JSON.stringify({ tool: "spinner", sectors: ["red", "red", "red", "blue", "blue", "yellow", "yellow", "yellow", "red", "red", "red", "blue", "blue", "yellow", "yellow", "yellow"] }) }] } },
  },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    expect(canvas.getByTestId("sector-count")).toHaveTextContent("16 sectors");
  },
};

/** Two interactions of this type on one page: each has its own experiment and response. */
export const TwoInstances: Story = {
  render: (args) => {
    const page = document.createElement("div");
    for (const id of ["first", "second"]) {
      const slot = document.createElement("div");
      slot.dataset.slot = id;
      slot.appendChild(mountPci(pci, id === "first" ? args : { ...args, properties: { mode: "tree" } }));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=first]")!);
    const second = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=second]")!);
    expect(first.pci).not.toBe(second.pci);
    await userEvent.click(first.canvas.getByRole("button", { name: "Do the experiment once" }));
    await fill(second.canvas, "Probability of red", "3/5");
    await waitFor(() => expect(trials(first.canvas)).toBe("Trials: 1"), slow);
    expect(trials(second.canvas)).toBe("Trials: 0");
    expect(log(first.pci.getResponse()).trials).toBe(1);
    expect(field(second.pci.getResponse(), "branch1")).toEqual({ integer: 1 });
    expect(first.changes).toHaveLength(1);
    expect(second.changes.length).toBeGreaterThan(0);
  },
};

// --- Authoring mode: what an authoring system shows the item author (getAuthoringInstance)

export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { mode: "design" } },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);
    const setup = () => JSON.parse(instance.getProperties().setup!);

    await step("starts from the design example: no problems", async () => {
      expect(instance.getProperties().mode).toBe("design");
      expect(setup().targets).toHaveLength(2);
      expect(instance.validate!()).toEqual([]);
    });

    await step("the tool: a fourth sector", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Add a sector" }));
      expect(setup().spinner.sectors).toHaveLength(4);
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("a target over 1 is a problem", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Task" }));
      await retype(canvas.getByRole("textbox", { name: "Target 1: Probability (a fraction)" }), "7/8");
      expect(instance.validate!()).toEqual(["The target probabilities add up to more than 1."]);
      await retype(canvas.getByRole("textbox", { name: "Target 1: Probability (a fraction)" }), "3/8");
      expect(instance.validate!()).toEqual([]);
      expect(canvas.getByTestId("summary")).toHaveTextContent("The solution scores 2 of 2.");
    });

    await step("a probability tree of the bag, with an event", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Tool" }));
      await userEvent.click(canvas.getByRole("radio", { name: "Bag of balls" }));
      await userEvent.click(canvas.getByRole("tab", { name: "Task" }));
      await userEvent.click(canvas.getByRole("radio", { name: "Fill in the probability tree" }));
      await userEvent.type(canvas.getByRole("textbox", { name: "Description of the event" }), "two red balls");
      await userEvent.click(canvas.getByRole("checkbox", { name: "red, red" }));
      const s = setup();
      expect(instance.getProperties().mode).toBe("tree");
      expect(s.tool).toBe("bag");
      expect(s.tree.event).toEqual({ text: "two red balls", paths: ["red,red"] });
      expect(instance.validate!()).toEqual([]);
    });
  },
};

export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { mode: "design", setup: JSON.stringify({ tool: "dice" }) } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("tab", { name: "Hulpmiddel" })).toBeInTheDocument();
    expect(instance.validate!()).toEqual(["De kandidaat kan alleen een draaischijf of een zak ontwerpen."]);
  },
};
