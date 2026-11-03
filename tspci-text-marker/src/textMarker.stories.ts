import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { afterPaint, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Text marker",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Record = { record: { name: string; base: { integer?: number; string?: string } | null }[] } | undefined;

/** A field of the record response. */
const field = (response: unknown, name: string) => (response as Record)?.record.find((f) => f.name === name)?.base;
const marks = (response: unknown) => field(response, "marks")?.string;
/** A word of the text by its index (from 0); words have no role of their own, the text is one application. */
const word = (mounted: MountedPci, index: number) => mounted.root.querySelector<HTMLElement>(`[data-w="${index}"]`)!;

/** Drags over the words with pointer events, as a mouse does. */
const drag = async (from: Element, to: Element) => {
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const at = (r: DOMRect, x: number) => ({ clientX: x, clientY: r.top + r.height / 2, bubbles: true, composed: true, pointerId: 1, button: 0, isPrimary: true, pointerType: "mouse" });
  from.dispatchEvent(new PointerEvent("pointerdown", at(a, a.left + 2)));
  to.dispatchEvent(new PointerEvent("pointermove", at(b, b.left + b.width / 2)));
  to.dispatchEvent(new PointerEvent("pointerup", at(b, b.left + b.width / 2)));
  await afterPaint();
};
/** A tap with a finger. */
const tap = async (el: Element) => {
  const r = el.getBoundingClientRect();
  const o = { clientX: r.left + 2, clientY: r.top + r.height / 2, bubbles: true, composed: true, pointerId: 5, pointerType: "touch", isPrimary: true };
  el.dispatchEvent(new PointerEvent("pointerdown", o));
  el.dispatchEvent(new PointerEvent("pointerup", o));
  await afterPaint();
};

const KEY = "69-69:b 93-110:a 111-111:b 125-125:b";
const marksResponse = (value: string) => ({ record: [{ name: "marks", base: { string: value } }] });

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.getByText(/^Mark the sentence in which/)).toBeInTheDocument();
    expect(canvas.getByRole("application", { name: /^Text to mark: Mark the sentence/ })).toHaveAttribute("aria-roledescription", "text marker");
    expect(canvas.getByRole("radiogroup", { name: "Marker" })).toBeInTheDocument();
    expect(canvas.getByRole("radio", { name: /Main argument/ })).toHaveAttribute("aria-checked", "true");
    expect(canvas.getByRole("radio", { name: /Contrast word/ })).toHaveAttribute("aria-checked", "false");
    expect(canvas.getByRole("button", { name: "Mark" })).toBeDisabled();
    expect(canvas.getByText("No marks yet.")).toBeInTheDocument();
    // the title in bold, words as pieces of their own
    expect(word(mounted, 0)).toHaveTextContent("Should");
    expect(word(mounted, 0)).toHaveClass("font-semibold");
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const MarkWithTheMouse: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("drag over the main argument", async () => {
      await drag(word(mounted, 93), word(mounted, 110));
      expect(marks(await lastChange(mounted))).toBe("93-110:a");
      expect(canvas.getByRole("status")).toHaveTextContent("Marked as Main argument: “I am convinced that schools … learn more”.");
      expect(canvas.getByRole("button", { name: "Mark 1, Main argument: “I am convinced that schools … learn more”" })).toBeInTheDocument();
    });

    await step("choose the other marker, double-click a word", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: /Contrast word/ }));
      expect(canvas.getByRole("status")).toHaveTextContent("Marker: Contrast word.");
      await userEvent.dblClick(word(mounted, 69));
      expect(marks(pci.getResponse())).toBe("69-69:b 93-110:a");
    });

    await step("click, Shift-click and Mark", async () => {
      const user = userEvent.setup(); // keeps Shift down between the calls
      await user.click(word(mounted, 125));
      await user.keyboard("{Shift>}");
      await user.click(word(mounted, 126));
      await user.keyboard("{/Shift}");
      await userEvent.click(canvas.getByRole("button", { name: "Mark" }));
      expect(marks(pci.getResponse())).toBe("69-69:b 93-110:a 125-126:b");
    });

    await step("remove from the list, and with the toolbar", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Remove mark 3: “Nevertheless it”" }));
      expect(marks(pci.getResponse())).toBe("69-69:b 93-110:a");
      await userEvent.click(word(mounted, 69));
      await userEvent.click(canvas.getByRole("button", { name: "Remove mark" }));
      expect(canvas.getByRole("status")).toHaveTextContent("Mark removed: “However”.");
      await userEvent.click(canvas.getByRole("button", { name: "Remove all" }));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;
    const text = canvas.getByRole("application");
    const announce = () => root.querySelector("[data-testid=announce]")!.textContent;

    await step("focus puts the cursor on the first word; arrows move it", async () => {
      text.focus();
      await afterPaint();
      expect(announce()).toBe("“Should”, word 1 of 131");
      await userEvent.keyboard("{Control>}{End}{/Control}");
      expect(announce()).toBe("“try”, word 131 of 131");
      await userEvent.keyboard("{Home}");
      expect(announce()).toBe("“I”, word 94 of 131");
      await userEvent.keyboard("{ArrowLeft}");
      expect(announce()).toBe("“afternoons”, word 93 of 131");
    });

    await step("Shift + arrows select, Enter marks", async () => {
      await userEvent.click(word(mounted, 125));
      await userEvent.keyboard("{ArrowRight}{Shift>}{ArrowRight}{ArrowRight}{/Shift}");
      expect(announce()).toBe("3 words selected: “it is worth”");
      await userEvent.keyboard("{Enter}");
      expect(marks(await lastChange(mounted))).toBe("126-128:a");
    });

    await step("2 chooses the second marker; Enter on a marked word changes its category; Delete removes", async () => {
      await userEvent.keyboard("2{Enter}");
      expect(marks(pci.getResponse())).toBe("126-128:b");
      expect(canvas.getByRole("status")).toHaveTextContent("Now marked as Contrast word: “it is worth”.");
      await userEvent.keyboard("{Delete}");
      expect(pci.getResponse()).toBeUndefined();
      await userEvent.keyboard("{Delete}");
      expect(canvas.getByRole("status")).toHaveTextContent("There is no mark here.");
    });

    await step("Escape cancels a selection; Space marks", async () => {
      await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}{Escape} ");
      expect(marks(pci.getResponse())).toBe("127-127:b");
    });

    await step("help", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Help" }));
      expect(canvas.getByText(/Shift \+ arrow selects, Enter marks/)).toBeVisible();
    });
  },
};

export const Touch: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    await tap(word(mounted, 93));
    await tap(word(mounted, 110));
    expect(mounted.pci.getResponse()).toBeUndefined();
    expect(word(mounted, 100)).toHaveClass("tm-sel");
    await tap(word(mounted, 100));
    expect(marks(mounted.pci.getResponse())).toBe("93-110:a");
  },
};

export const Scoring: Story = {
  args: { properties: { scoring: JSON.stringify({ tolerance: 1, rule: "overlap", minOverlap: 75, points: 2, partial: 1, penalty: 1 }) } },
  play: async ({ canvasElement, step }) => {
    const { pci } = await openPci(canvasElement);
    await step("the key itself: full score", async () => {
      pci.setResponse(marksResponse(KEY));
      const r = pci.getResponse();
      expect(field(r, "score")).toEqual({ integer: 8 });
      expect(field(r, "maxscore")).toEqual({ integer: 8 });
      expect(field(r, "correct")).toEqual({ integer: 1 });
      expect([1, 2, 3, 4].map((i) => field(r, `target${i}`)?.integer)).toEqual([2, 2, 2, 2]);
    });
    await step("one word extra is within the tolerance; half the argument is partly; a wrong category is partly; one extra", async () => {
      pci.setResponse(marksResponse("69-70:b 93-101:a 111-111:a 20-21:b"));
      const r = pci.getResponse();
      expect([1, 2, 3, 4].map((i) => field(r, `target${i}`)?.integer)).toEqual([2, 1, 1, 0]);
      expect(field(r, "extra")).toEqual({ integer: 1 });
      expect(field(r, "score")).toEqual({ integer: 2 + 1 + 1 - 1 });
      expect(field(r, "correct")).toEqual({ integer: 0 });
      expect(field(r, "target5")).toBeUndefined();
    });
  },
};

const OWN = {
  text: "Les élèves *français* commencent tôt. Pourtant, ils dorment peu.\n\nMais le soir, ils lisent encore.",
  textLanguage: "fr",
  categories: "Connecteur | box | green",
  key: "5-5:a 9-9:a",
};

export const SentencesAndLimits: Story = {
  args: { properties: { ...OWN, snap: "sentence", maxmarks: "2", maxlength: "6" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.getByRole("application")).toHaveAttribute("lang", "fr");
    expect(canvas.queryByRole("radiogroup")).toBeNull();
    expect(canvas.getByText("0 of 2 marks · at most 6 words per mark")).toBeInTheDocument();
    await step("a double-click marks the whole sentence", async () => {
      await userEvent.dblClick(word(mounted, 1));
      expect(marks(pci.getResponse())).toBe("0-4:a");
      expect(canvas.getByTestId("text").querySelector(".tm-box")).not.toBeNull();
    });
    await step("two sentences are too long", async () => {
      await drag(word(mounted, 6), word(mounted, 11));
      expect(canvas.getByRole("status")).toHaveTextContent("A mark can be at most 6 words long.");
    });
    await step("a third mark is too many", async () => {
      await userEvent.dblClick(word(mounted, 7));
      await userEvent.dblClick(word(mounted, 12));
      expect(marks(pci.getResponse())).toBe("0-4:a 5-8:a");
      expect(canvas.getByRole("status")).toHaveTextContent("You can make at most 2 marks. Remove a mark first.");
    });
  },
};

export const RightToLeft: Story = {
  args: { properties: { text: "**למה לקרוא?**\n\nקריאה מרחיבה את אוצר המילים. עם זאת, לא כל ספר מתאים.", textLanguage: "he", categories: "ניגוד", prompt: "" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const text = mounted.canvas.getByRole("application");
    expect(text).toHaveAttribute("dir", "rtl");
    expect(mounted.root.querySelectorAll("[data-w]")).toHaveLength(13);
    await userEvent.click(word(mounted, 7));
    await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}{Enter}");
    expect(marks(mounted.pci.getResponse())).toBe("7-8:a");
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", prompt: "Markeer de signaalwoorden.", maxMarks: "5" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.getByRole("application", { name: "Tekst om te markeren: Markeer de signaalwoorden." })).toHaveAttribute("aria-roledescription", "tekstmarkeerder");
    expect(canvas.getByRole("radiogroup", { name: "Markeerstift" })).toBeInTheDocument();
    expect(canvas.getByText("0 van 5 markeringen")).toBeInTheDocument();
    await userEvent.dblClick(word(mounted, 69));
    expect(canvas.getByRole("status")).toHaveTextContent("Gemarkeerd als Main argument: “However”.");
    expect(canvas.getByRole("heading", { name: "Jouw markeringen" })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Markering 1 weghalen: “However”" })).toBeInTheDocument();
    // the response does not depend on the language
    expect(marks(pci.getResponse())).toBe("69-69:a");
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.dblClick(word(first, 30));
    await drag(word(first, 40), word(first, 42));
    const state = first.pci.getState();
    expect(JSON.parse(state).state).toEqual({ marks: [{ start: 30, end: 30, category: "a" }, { start: 40, end: 42, category: "a" }] });

    const second = await remountPci(canvasElement, pci, { state });
    expect(word(second, 41).closest(".tm-m")).not.toBeNull();
    expect(second.pci.getResponse()).toEqual(first.pci.getResponse());
    expect(second.changes).toHaveLength(0);
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: marksResponse("69-69:b 93-110:a") } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    await step("the bound response is in the text", async () => {
      expect(mounted.canvas.getAllByTestId("tag")).toHaveLength(2);
      expect(field(mounted.pci.getResponse(), "score")).toEqual({ integer: 2 });
    });
    await step("resetResponse: no marks", async () => {
      mounted.pci.resetResponse();
      await waitFor(() => expect(mounted.canvas.queryAllByTestId("tag")).toHaveLength(0));
      expect(mounted.pci.getResponse()).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: { status: "solution", state: JSON.stringify({ state: { marks: [{ start: 3, end: 4, category: "a" }] }, log: [] }) },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the author's key replaces the candidate's marks; nothing to change
    await waitFor(() => expect(marks(pci.getResponse())).toBe(KEY));
    expect(canvas.getByRole("heading", { name: "The correct marks" })).toBeInTheDocument();
    expect(canvas.queryByRole("button", { name: "Mark" })).toBeNull();
    expect(canvas.getAllByRole("radio")[0]).toBeDisabled();
    expect(field(pci.getResponse(), "correct")).toEqual({ integer: 1 });
  },
};

export const SolutionFromTheDeclaration: Story = {
  args: {
    status: "solution",
    responseDeclaration: { cardinality: "record", correctResponse: { value: [{ fieldIdentifier: "marks", value: "0-3:a" }] } },
  },
  play: async ({ canvasElement }) => {
    const { pci } = await openPci(canvasElement);
    await waitFor(() => expect(marks(pci.getResponse())).toBe("0-3:a"));
  },
};

/** Two interactions of this type on one page: each has its own marks and response. */
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
    await userEvent.dblClick(word(first, 5));
    await userEvent.dblClick(word(second, 9));
    expect(marks(first.pci.getResponse())).toBe("5-5:a");
    expect(marks(second.pci.getResponse())).toBe("9-9:a");
    expect(first.changes).toHaveLength(1);
    expect(second.changes).toHaveLength(1);
  },
};

// --- Authoring mode: what an authoring system shows the item author (getAuthoringInstance)

export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { maxLength: "12" } },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes, root } = await openAuthoring(canvasElement);
    const config = () => instance.getProperties();

    await step("starts from the example; the argument is longer than the maximum length", async () => {
      expect(config().key).toBe(KEY);
      expect(instance.validate!()).toEqual(["Correct span 2 is longer than the 12 words a candidate can mark."]);
      expect(canvas.getByTestId("summary")).toHaveTextContent("4 correct spans, maximum score 4.");
    });

    await step("the text: a word in front, the key moves with it", async () => {
      const source = canvas.getByRole("textbox", { name: "Source text" }) as HTMLTextAreaElement;
      source.value = "Today: " + source.value;
      source.dispatchEvent(new Event("input", { bubbles: true }));
      await afterPaint();
      expect(config().key).toBe("70-70:b 94-111:a 112-112:b 126-126:b");
      expect(canvas.getByText("132 words")).toBeInTheDocument();
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("the correct marks: remove the long one, mark a shorter one", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Correct marks" }));
      await userEvent.click(canvas.getByRole("button", { name: /^Remove mark 2:/ }));
      const w = (i: number) => root.querySelector<HTMLElement>(`[data-w="${i}"]`)!;
      await drag(w(96), w(103));
      expect(config().key).toBe("70-70:b 96-103:a 112-112:b 126-126:b");
      expect(instance.validate!()).toEqual([]);
    });

    await step("categories: rename, another pattern, a third category", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Categories" }));
      const name = canvas.getByRole("textbox", { name: "Name 1" });
      await userEvent.tripleClick(name);
      await userEvent.keyboard("Claim");
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Pattern 1" }), "Stripes");
      await userEvent.click(canvas.getByRole("button", { name: "+ Add a category" }));
      const categories = JSON.parse(config().categories!);
      expect(categories[0]).toMatchObject({ id: "a", name: "Claim", pattern: "stripes" });
      expect(categories).toHaveLength(3);
      expect(categories[2]).toMatchObject({ id: "c", color: "orange", pattern: "box" });
    });

    await step("scoring rules", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Scoring" }));
      await userEvent.click(canvas.getByRole("radio", { name: "covers all of its words" }));
      expect(canvas.queryByRole("spinbutton", { name: "Minimum overlap (%)" })).toBeNull();
      const points = canvas.getByRole("spinbutton", { name: "Points per correct span" });
      await userEvent.tripleClick(points);
      await userEvent.keyboard("2");
      expect(JSON.parse(config().scoring!)).toEqual({ tolerance: 1, rule: "all", minOverlap: 75, points: 2, partial: 0, penalty: 0 });
      expect(canvas.getByTestId("summary")).toHaveTextContent("4 correct spans, maximum score 8.");
    });
  },
};

export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { text: "Een eigen tekst zonder sleutel." } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("tab", { name: "Goede markeringen" })).toBeInTheDocument();
    expect(instance.validate!()).toEqual(["Er zijn geen goede markeringen: de PCI kan niet scoren."]);
    expect(instance.getProperties().key).toBe("");
  },
};
