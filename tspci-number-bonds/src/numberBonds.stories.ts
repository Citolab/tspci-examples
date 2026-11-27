import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci, type PciArgs,
} from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Number bonds",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

// no title or question in the settings: the instruction of the model
const INSTRUCTION = "Fill in the split house: the two numbers in a row together make the number in the roof.";
/** The split house (the tree is the default): the stories about the house give it in their settings. */
const HOUSE = { model: "house" };

/** A box by its accessible name ("roof", "row 2, left", "split 1, right leg"). */
const box = (mounted: MountedPci, name: string) => mounted.canvas.getByRole("textbox", { name }) as HTMLInputElement;
/** The boxes the pupil types in. */
const pupilBoxes = (mounted: MountedPci) => Array.from(mounted.root.querySelectorAll<HTMLInputElement>("input[data-box]"));
const allBoxes = (mounted: MountedPci) => Array.from(mounted.root.querySelectorAll<HTMLInputElement>("input.box"));
const shown = (mounted: MountedPci) => allBoxes(mounted).map((input) => input.value);

type Field = { name: string; base?: { boolean?: boolean; integer?: number; string?: string } };
const fields = (response: unknown) => ((response as { record?: Field[] })?.record ?? []);
/** The response as a plain object: { correct: true, correctRows: 2, numbers: "7: 3|4", row1: true, ... } */
const plain = (response: unknown) =>
  Object.fromEntries(fields(response).map((f) => [f.name, f.base?.boolean ?? f.base?.integer ?? f.base?.string]));
const recordWith = (numbers: string) => ({ record: [{ name: "numbers", base: { string: numbers } }] });

/** Types the numbers in the pupil's boxes, in order; "" leaves a box as it is. */
async function fillIn(mounted: MountedPci, numbers: string[]) {
  const inputs = pupilBoxes(mounted);
  for (const [i, number] of numbers.entries()) if (number) await userEvent.type(inputs[i], number);
}

/** The number bonds to try out yourself (no test runs on it): with a mouse, a touchscreen or the keyboard. */
export const ToTry: Story = {
  name: "Number bonds, to try",
};

/** Without settings: the number bond tree of the default layout 47(40|?). */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.canvas.queryByRole("group", { name: "Split house" })).toBeNull();
    expect(shown(mounted)).toEqual(["47", "40", ""]);
    expect(pupilBoxes(mounted)).toHaveLength(1);
    expect(mounted.pci.getResponse()).toBeUndefined();
  },
};

export const House: Story = {
  args: { properties: HOUSE },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.queryByRole("heading")).toBeNull();
    expect(canvas.getByText(INSTRUCTION)).toBeInTheDocument();
    // the house of the default layout 7: 3|?; ?|2; 6|?; ?|?
    expect(canvas.getByRole("group", { name: "Split house" })).toBeInTheDocument();
    expect(shown(mounted)).toEqual(["7", "3", "", "", "2", "6", "", "", ""]);
    expect(box(mounted, "roof")).toHaveAttribute("readonly");
    expect(box(mounted, "row 1, left")).toHaveAttribute("readonly");
    expect(box(mounted, "row 1, right")).not.toHaveAttribute("readonly");
    expect(pupilBoxes(mounted).map((input) => input.getAttribute("aria-label"))).toEqual([
      "row 1, right", "row 2, left", "row 3, right", "row 4, left", "row 4, right",
    ]);
    // nothing answered, nothing reported
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const Answering: Story = {
  args: { properties: HOUSE },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { pci } = mounted;

    await step("a row at a time: the response says which rows add up", async () => {
      await userEvent.type(box(mounted, "row 1, right"), "4");
      expect(plain(await lastChange(mounted))).toEqual({
        correct: false, correctRows: 1, numbers: "7: 3|4; |2; 6|; |", row1: true, row2: false, row3: false, row4: false,
      });
      await userEvent.type(box(mounted, "row 2, left"), "4");
      expect(plain(pci.getResponse())).toMatchObject({ correctRows: 1, row2: false });
      await retype(box(mounted, "row 2, left"), "5");
      expect(plain(pci.getResponse())).toMatchObject({ correctRows: 2, row2: true });
    });

    await step("a row with two empty boxes: any split of 7", async () => {
      await userEvent.type(box(mounted, "row 3, right"), "1");
      await userEvent.type(box(mounted, "row 4, left"), "0");
      await userEvent.type(box(mounted, "row 4, right"), "7");
      expect(plain(pci.getResponse())).toEqual({
        correct: true, correctRows: 4, numbers: "7: 3|4; 5|2; 6|1; 0|7", row1: true, row2: true, row3: true, row4: true,
      });
    });

    await step("not a number: the box is invalid, and counts as empty", async () => {
      await retype(box(mounted, "row 4, right"), "x");
      expect(pci.checkValidity()).toBe(false);
      expect(box(mounted, "row 4, right")).toBeInvalid();
      expect(plain(pci.getResponse())).toMatchObject({ correct: false, correctRows: 3, row4: false });
      await retype(box(mounted, "row 4, right"), "7");
      expect(pci.checkValidity()).toBe(true);
    });
  },
};

/** The whole is missing: the pupil fills in the roof. */
export const MissingWhole: Story = {
  args: { properties: { ...HOUSE, house: "?: 3|4; 5|?" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(box(mounted, "roof")).not.toHaveAttribute("readonly");
    await userEvent.type(box(mounted, "roof"), "7");
    await userEvent.type(box(mounted, "row 2, right"), "2");
    expect(plain(mounted.pci.getResponse())).toMatchObject({ correct: true, correctRows: 2, numbers: "7: 3|4; 5|2" });
  },
};

/** All splits of 5: a row for every split, every row a different one. */
export const AllSplits: Story = {
  args: { properties: { ...HOUSE, task: "allSplits", house: "5", countZero: "true", orderMatters: "true", title: "All splits of 5" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { pci } = mounted;
    expect(pupilBoxes(mounted)).toHaveLength(12); // 0|5 … 5|0: six rows

    await step("in any order; a repeated split adds up, but is not found again", async () => {
      await fillIn(mounted, ["2", "3", "3", "2", "2", "3"]);
      expect(plain(pci.getResponse())).toMatchObject({ correctRows: 2, complete: false, row1: true, row2: true, row3: false });
    });

    await step("every split once: complete, and the numbers sorted", async () => {
      await retype(box(mounted, "row 3, left"), "5");
      await retype(box(mounted, "row 3, right"), "0");
      await fillIn(mounted, ["", "", "", "", "", "", "1", "4", "4", "1", "0", "5"]);
      expect(plain(pci.getResponse())).toMatchObject({
        correct: true, correctRows: 6, complete: true, numbers: "5: 0|5; 1|4; 2|3; 3|2; 4|1; 5|0",
      });
    });
  },
};

/** All splits where 3|4 and 4|3 are the same, and 0 does not count. */
export const AllSplitsOrderDoesNotMatter: Story = {
  args: { properties: { ...HOUSE, task: "allSplits", house: "7: 1|?", countZero: "false", orderMatters: "false" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { pci } = mounted;
    expect(box(mounted, "row 1, left")).toHaveValue("1");
    expect(pupilBoxes(mounted)).toHaveLength(5); // 1|6 (given in part), 2|5, 3|4
    await fillIn(mounted, ["6", "5", "2", "0", "7"]);
    expect(plain(pci.getResponse())).toMatchObject({ correct: true, correctRows: 2, complete: false, row3: false });
    await retype(box(mounted, "row 3, left"), "4");
    await retype(box(mounted, "row 3, right"), "3");
    expect(plain(pci.getResponse())).toMatchObject({ correctRows: 3, complete: true, numbers: "7: 1|6; 2|5; 3|4" });
  },
};

export const Tree: Story = {
  args: { properties: { model: "tree", title: "Splitting 47", question: "Split 47 in tens and ones." } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.canvas.getByRole("group", { name: "Number bond tree" })).toBeInTheDocument();
    expect(box(mounted, "top")).toHaveValue("47");
    expect(box(mounted, "split 1, left leg")).toHaveValue("40");
    await userEvent.type(box(mounted, "split 1, right leg"), "7");
    expect(plain(mounted.pci.getResponse())).toEqual({ correct: true, correctRows: 1, numbers: "47(40|7)", row1: true });
  },
};

/** Via 10: 8 + 5 = 13, as 8 + 2 + 3; a part splits again. */
export const NestedTree: Story = {
  args: { properties: { model: "tree", tree: "5(?|?)", title: "8 + 5", question: "8 + 5: split the 5, so that 8 makes 10 first." } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    await userEvent.type(box(mounted, "split 1, left leg"), "2");
    await userEvent.type(box(mounted, "split 1, right leg"), "3");
    expect(plain(mounted.pci.getResponse())).toMatchObject({ correct: true, numbers: "5(2|3)" });
  },
};

export const TwoLevels: Story = {
  args: { properties: { model: "tree", tree: "?(10|?(2|1))" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(box(mounted, "split 2, left leg")).toHaveValue("2");
    await userEvent.type(box(mounted, "top"), "13");
    await userEvent.type(box(mounted, "split 1, right leg"), "4");
    expect(plain(mounted.pci.getResponse())).toEqual({ correct: false, correctRows: 0, numbers: "13(10|4(2|1))", row1: false, row2: false });
    await retype(box(mounted, "split 1, right leg"), "3");
    expect(plain(mounted.pci.getResponse())).toEqual({ correct: true, correctRows: 2, numbers: "13(10|3(2|1))", row1: true, row2: true });
  },
};

export const ThreeLegs: Story = {
  args: { properties: { model: "tree", tree: "12(?|?|?)" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(pupilBoxes(mounted).map((input) => input.getAttribute("aria-label"))).toEqual([
      "split 1, left leg", "split 1, middle leg", "split 1, right leg",
    ]);
    await fillIn(mounted, ["4", "4", "4"]);
    expect(plain(mounted.pci.getResponse())).toMatchObject({ correct: true, numbers: "12(4|4|4)" });
  },
};

/** For older pupils: 1 in 0,3 and 0,7, in Dutch. */
export const Decimals: Story = {
  args: { properties: { model: "tree", tree: "1(0,3|?)", decimals: "true", language: "nl", title: "Splitsen" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.canvas.getByRole("group", { name: "Splitsboom" })).toBeInTheDocument();
    expect(box(mounted, "splitsing 1, linkerbeen")).toHaveValue("0,3");
    await userEvent.type(box(mounted, "splitsing 1, rechterbeen"), "0,7");
    expect(mounted.pci.checkValidity()).toBe(true);
    expect(plain(mounted.pci.getResponse())).toMatchObject({ correct: true, numbers: "1(0.3|0.7)" });
  },
};

/** Without decimals, 0,7 is no number. */
export const NoDecimals: Story = {
  args: { properties: { model: "tree", tree: "10(3|?)" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    await userEvent.type(box(mounted, "split 1, right leg"), "6,5");
    expect(mounted.pci.checkValidity()).toBe(false);
    expect(plain(mounted.pci.getResponse())).toMatchObject({ correct: false, numbers: "10(3|)" });
  },
};

export const Dutch: Story = {
  args: { properties: { ...HOUSE, language: "nl", title: "Splitsen" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.canvas.getByRole("group", { name: "Splitshuis" })).toBeInTheDocument();
    expect(box(mounted, "dak")).toHaveValue("7");
    expect(box(mounted, "rij 1, rechts")).toBeInTheDocument();
    expect(box(mounted, "rij 1, rechts")).toHaveAttribute("title", "Vul een getal in, zoals 7");
    await remountPci(canvasElement, pci, { properties: { language: "nl", model: "tree" } });
    expect(canvasElement.querySelector(".tspci-host")!.shadowRoot!.textContent).toContain("de getallen op de benen zijn samen het getal erboven");
  },
};

export const RestoreState: Story = {
  args: { properties: HOUSE },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await fillIn(first, ["4", "5", "x"]);
    const state = first.pci.getState();
    const response = first.pci.getResponse();

    // the pupil comes back to the item: everything is as they left it, also what is not a number yet
    const second = await remountPci(canvasElement, pci, { state, properties: HOUSE });
    expect(shown(second)).toEqual(["7", "3", "4", "5", "2", "6", "x", "", ""]);
    expect(second.pci.getResponse()).toEqual(response);
    expect(second.pci.checkValidity()).toBe(false);
  },
};

/** A state of another layout (the author changed the item) or not of this PCI: start from the settings. */
export const ForeignState: Story = {
  args: { properties: HOUSE },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await fillIn(first, ["4"]);
    const state = first.pci.getState();
    const other = await remountPci(canvasElement, pci, { state, properties: { ...HOUSE, house: "8: 3|?" } });
    expect(shown(other)).toEqual(["8", "3", ""]);
    const foreign = await remountPci(canvasElement, pci, { state: "not a state of this PCI", properties: HOUSE });
    expect(foreign.pci.getResponse()).toBeUndefined();
  },
};

export const BoundResponse: Story = {
  args: { properties: HOUSE, boundTo: { RESPONSE: recordWith("7: 3|4; 5|2; 6|1; 1|6") } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(shown(mounted)).toEqual(["7", "3", "4", "5", "2", "6", "1", "1", "6"]);
    expect(plain(mounted.pci.getResponse())).toMatchObject({ correct: true, numbers: "7: 3|4; 5|2; 6|1; 1|6" });
  },
};

/** The correct response of the item, read-only. */
export const Solution: Story = {
  args: {
    status: "solution",
    properties: { ...HOUSE, house: "7: 3|?; ?|2" },
    responseDeclaration: { correctResponse: { value: pci.getCorrectResponse!({ ...HOUSE, house: "7: 3|?; ?|2" } as never) } },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(shown(mounted)).toEqual(["7", "3", "4", "5", "2"]);
    for (const input of allBoxes(mounted)) expect(input).toBeDisabled();
    expect(plain(mounted.pci.getResponse())).toMatchObject({ correct: true });
  },
};

/** Without a correct response with numbers in the item, the PCI shows an answer of its own that adds up. */
export const SolutionOfItsOwn: Story = {
  args: { status: "solution", properties: { model: "tree", tree: "47(?|?)" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(shown(mounted)).toEqual(["47", "40", "7"]);
    expect(plain(mounted.pci.getResponse())).toMatchObject({ correct: true });
  },
};

export const Review: Story = {
  args: { status: "review", properties: HOUSE, boundTo: { RESPONSE: recordWith("7: 3|4; 5|2; 6|; |") } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(shown(mounted)).toEqual(["7", "3", "4", "5", "2", "6", "", "", ""]);
    for (const input of allBoxes(mounted)) expect(input).toBeDisabled();
  },
};

/** The correct response from the settings, only where the layout has one answer. */
export const CorrectResponse: Story = {
  play: async () => {
    const correct = (properties: Record<string, string>) => plain(pci.getCorrectResponse!(properties as never));
    expect(correct({ ...HOUSE, house: "7: 3|?; ?|2" })).toEqual({ correct: true, correctRows: 2, numbers: "7: 3|4; 5|2", row1: true, row2: true });
    expect(correct({ model: "tree", tree: "?(5|3(?|1))" })).toMatchObject({ correct: true, correctRows: 2, numbers: "8(5|3(2|1))" });
    expect(correct({ ...HOUSE, task: "allSplits", house: "3", countZero: "false", orderMatters: "false" })).toEqual({
      correct: true, correctRows: 1, complete: true, numbers: "3: 1|2", row1: true,
    });
    // more than one answer: the author scores with a rule on correct
    expect(pci.getCorrectResponse!({ ...HOUSE, house: "7: ?|?" } as never)).toBeUndefined();
    expect(pci.getCorrectResponse!({ model: "tree", tree: "47(?|?)" } as never)).toBeUndefined();
    // the defaults have a row with two empty boxes
    expect(correct({})).toMatchObject({ correct: true, numbers: "47(40|7)" }); // the default tree: one answer
  },
};

/** The correct response from the settings, set as the response, gives the same response back. */
export const CorrectResponseRoundTrip: Story = {
  args: { properties: { ...HOUSE, task: "allSplits", house: "4: ?|1", countZero: "true", orderMatters: "true" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const correct = pci.getCorrectResponse!({ ...HOUSE, task: "allSplits", house: "4: ?|1", countZero: "true", orderMatters: "true" } as never)!;
    mounted.pci.setResponse(correct);
    await waitFor(() => expect(box(mounted, "row 1, left")).toHaveValue("3"));
    expect(mounted.pci.getResponse()).toEqual(correct);
  },
};

export const Validity: Story = {
  play: async ({ canvasElement }) => {
    const { pci } = await openPci(canvasElement);
    expect(pci.checkValidity()).toBe(true);
    pci.setCustomValidity("Vul alle vakjes in.");
    expect(pci.getCustomValidity()).toBe("Vul alle vakjes in.");
    expect(pci.checkValidity()).toBe(false);
    pci.setCustomValidity("");
    expect(pci.checkValidity()).toBe(true);
  },
};

/** A house and a tree on one page: each keeps its own boxes and response. */
export const TwoInstances: Story = {
  args: { properties: HOUSE },
  render: (args) => {
    const page = document.createElement("div");
    for (const id of ["first", "second"]) {
      const slot = document.createElement("div");
      slot.dataset.slot = id;
      slot.appendChild(mountPci(pci, id === "first" ? args : { ...args, properties: { model: "tree", title: "Second" } }));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=first]")!);
    const second = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=second]")!);
    expect(first.pci).not.toBe(second.pci);
    await userEvent.type(box(first, "row 1, right"), "4");
    await userEvent.type(box(second, "split 1, right leg"), "8");
    expect(plain(first.pci.getResponse())).toMatchObject({ row1: true, numbers: "7: 3|4; |2; 6|; |" });
    expect(plain(second.pci.getResponse())).toMatchObject({ correct: false, numbers: "47(40|8)" });
    expect(first.changes).toHaveLength(1);
    expect(second.changes).toHaveLength(1);
  },
};

/** A number bond tree (the default) and a split house side by side, partly filled in (example.png). */
export const Example: Story = {
  render: () => {
    const page = document.createElement("div");
    page.className = "example-page";
    page.style.cssText = "display:flex;gap:24px;align-items:flex-start;width:960px";
    const items: [string, PciArgs][] = [
      ["tree", { width: 506, properties: { model: "tree", tree: "13(10|?(?|?))", title: "Splitting 13", question: "Split 13 in a ten and ones, and split the ones again." } }],
      ["house", { width: 430, properties: { model: "house", title: "Splitting 7", question: "Fill in the split house." } }],
    ];
    for (const [id, args] of items) {
      const slot = document.createElement("div");
      slot.dataset.slot = id;
      slot.appendChild(mountPci(pci, args));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const house = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=house]")!);
    const tree = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=tree]")!);
    await fillIn(house, ["4", "5", "1"]);
    await fillIn(tree, ["3", "2"]);
    expect(plain(house.pci.getResponse())).toMatchObject({ correctRows: 3 });
    expect(plain(tree.pci.getResponse())).toMatchObject({ correctRows: 1, row1: true, row2: false });
  },
};

// ---- the authoring mode ----

type Authoring = StoryObj<AuthoringArgs>;
const authorBox = (canvas: Awaited<ReturnType<typeof openAuthoring>>["canvas"], name: string) =>
  canvas.getByRole("textbox", { name }) as HTMLInputElement;

export const AuthoringHouse: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { ...HOUSE, house: "7: 3|?; ?|2" } },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);
    const properties = () => instance.getProperties() as Record<string, string>;

    await step("starts from the settings, with one answer", async () => {
      expect(canvas.getByRole("heading", { name: "Set up the number bonds" })).toBeInTheDocument();
      expect(authorBox(canvas, "roof")).toHaveValue("7");
      expect(authorBox(canvas, "row 1, right")).toHaveValue("");
      expect(properties()).toMatchObject({ model: "house", task: "fill", house: "7: 3|?; ?|2" });
      expect(canvas.getByText(/^One answer/)).toBeInTheDocument();
      expect(instance.validate()).toEqual([]);
    });

    await step("a row added, with two empty boxes: more than one answer", async () => {
      await userEvent.click(canvas.getByRole("button", { name: /Add a row/ }));
      expect(properties().house).toBe("7: 3|?; ?|2; ?|?");
      expect(canvas.getByText(/^More than one answer/)).toBeInTheDocument();
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("a given number typed, a row removed", async () => {
      await userEvent.type(authorBox(canvas, "row 3, left"), "6");
      expect(properties().house).toBe("7: 3|?; ?|2; 6|?");
      await userEvent.click(canvas.getByRole("button", { name: "Remove row 2" }));
      expect(properties().house).toBe("7: 3|?; 6|?");
    });

    await step("what does not add up keeps Done from finishing", async () => {
      await userEvent.type(authorBox(canvas, "row 1, right"), "5");
      expect(instance.validate()).toEqual(["The given numbers of a row or split do not add up."]);
      await retype(authorBox(canvas, "row 1, right"), "x");
      expect(instance.validate()).toEqual(["A box holds something that is not a number."]);
    });
  },
};

export const AuthoringAllSplits: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { ...HOUSE, house: "6: 0|6" } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: "All splits of the roof" }));
    expect(canvas.getByText("The house gets 7 rows, one for every split.")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("checkbox", { name: "0 counts (0|7 and 7|0)" }));
    // without 0, the given row 0|6 is no split: the author sees it does not count
    expect(canvas.getByText("The house gets 5 rows, one for every split.")).toBeInTheDocument();
    await retype(authorBox(canvas, "row 1, left"), "1");
    await retype(authorBox(canvas, "row 1, right"), "5");
    expect(instance.getProperties()).toMatchObject({ ...HOUSE, task: "allSplits", house: "6: 1|5", countZero: "false", orderMatters: "true" });
    expect(canvas.getByText(/^One answer/)).toBeInTheDocument();
  },
};

export const AuthoringTree: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { model: "tree", tree: "13(10|?)" } },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    const properties = () => instance.getProperties() as Record<string, string>;

    await step("a part splits again", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Split this part: split 1, right leg" }));
      expect(properties().tree).toBe("13(10|?(?|?))");
      await userEvent.type(authorBox(canvas, "split 2, right leg"), "1");
      expect(properties().tree).toBe("13(10|?(?|1))");
    });

    await step("three legs, and back", async () => {
      const legs = (split: number, name: string) =>
        within(canvas.getByRole("radiogroup", { name: `Legs of split ${split}` })).getByRole("radio", { name });
      await userEvent.click(legs(1, "3 legs"));
      expect(properties().tree).toBe("13(10|?(?|1)|?)");
      await userEvent.click(legs(2, "3 legs"));
      expect(properties().tree).toBe("13(10|?(?|1|?)|?)");
      await userEvent.click(legs(1, "2 legs"));
      await userEvent.click(legs(2, "2 legs"));
      expect(properties().tree).toBe("13(10|?(?|1))");
    });

    await step("the split removed", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Remove split 2" }));
      expect(properties().tree).toBe("13(10|?)");
      expect(canvas.getByText(/^One answer/)).toBeInTheDocument();
    });

    await step("the model is a choice here too", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "Split house" }));
      expect(properties().model).toBe("house");
      expect(canvas.getByRole("group", { name: "Split house" })).toBeInTheDocument();
    });
  },
};

/** The authoring mode of a tree that splits again, as it opens (for the README). */
export const AuthoringNestedTree: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { model: "tree", tree: "13(10|3(?|?))" } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(authorBox(canvas, "split 2, left leg")).toHaveValue("");
    expect(canvas.getByRole("button", { name: "Remove split 2" })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Split this part: split 1, left leg" })).toBeInTheDocument();
    expect(instance.validate()).toEqual([]);
    expect(canvas.getByText(/^More than one answer/)).toBeInTheDocument();
  },
};

export const AuthoringDutch: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { model: "tree" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("heading", { name: "Splitsing instellen" })).toBeInTheDocument();
    expect(canvas.getByRole("radio", { name: "Splitsboom" })).toHaveAttribute("aria-checked", "true");
    expect(authorBox(canvas, "top")).toHaveValue("47");
    await waitFor(() => expect(canvas.getByText(/^Eén antwoord/)).toBeInTheDocument());
  },
};
