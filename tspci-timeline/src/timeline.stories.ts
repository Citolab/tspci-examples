import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { afterPaint, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Timeline",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Canvas = MountedPci["canvas"];
type Rec = { record: { name: string; base: Record<string, number | string> | null }[] } | undefined;

/** A field of the record response: its value. */
const field = (response: unknown, name: string) => {
  const base = (response as Rec)?.record.find((f) => f.name === name)?.base;
  return base ? Object.values(base)[0] : undefined;
};
const card = (canvas: Canvas, text: RegExp) => canvas.getByRole("button", { name: text });
const slider = (canvas: Canvas, text: RegExp) => canvas.getByRole("slider", { name: text });

/** Drags with pointer events from an element to a point (user-event has no drag with coordinates). */
const dragTo = async (from: Element, x: number, y: number) => {
  const a = from.getBoundingClientRect();
  const at = (cx: number, cy: number) => ({ clientX: cx, clientY: cy, bubbles: true, composed: true, pointerId: 1, button: 0, isPrimary: true });
  from.dispatchEvent(new PointerEvent("pointerdown", at(a.left + a.width / 2, a.top + a.height / 2)));
  from.dispatchEvent(new PointerEvent("pointermove", at(a.left + a.width / 2 + 20, a.top + a.height / 2 + 10)));
  from.dispatchEvent(new PointerEvent("pointermove", at(x, y)));
  from.dispatchEvent(new PointerEvent("pointerup", at(x, y)));
  await afterPaint();
};
/** The x of a year on the example's axis (1500–2000, with 3% room on both sides). */
const xOf = (track: Element, year: number, from = 1485, to = 2015) => {
  const r = track.getBoundingClientRect();
  return r.left + 1 + ((year - from) / (to - from)) * (r.width - 2);
};

const PERIODS = JSON.stringify({
  start: -3000, end: 2000, mode: "period", periods: "tijdvakken",
  events: [{ text: "Julius Caesar is murdered", year: -44 }, { text: "Charlemagne is crowned emperor", year: 800 }, { text: "The Dutch Revolt", period: "t5" }],
});
const ORDER = JSON.stringify({
  start: 1, end: 2000, mode: "order",
  events: [{ text: "The first crusade", year: 1096 }, { text: "Columbus reaches America", year: 1492 }, { text: "The Treaty of Versailles", year: 1919 }],
});

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText(/^Drag each event to the year/)).toBeInTheDocument();
    expect(canvas.getByRole("group", { name: /^Timeline: Drag each event/ })).toBeInTheDocument();
    expect(canvas.getAllByRole("button", { name: /Iconoclastic|Münster|Bastille|railway|Second World War|Moon/ })).toHaveLength(6);
    expect(canvas.queryAllByRole("slider")).toHaveLength(0);
    expect(canvas.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    expect(canvas.getByText("6 · Regents and monarchs")).toBeInTheDocument();
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const PlaceWithTheMouse: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    const track = canvas.getByRole("group", { name: /^Timeline/ });

    await step("drag a card onto the axis", async () => {
      const r = track.getBoundingClientRect();
      await dragTo(card(canvas, /Münster/), xOf(track, 1648), r.top + 40);
      const y = field(await lastChange(mounted), "year2") as number;
      expect(Math.abs(y - 1648)).toBeLessThanOrEqual(3);
      expect(slider(canvas, /Münster/)).toHaveAttribute("aria-valuetext", String(y));
      expect(canvas.getByRole("status")).toHaveTextContent(`Peace of Münster: Spain recognises the Dutch Republic: ${y}.`);
    });

    await step("click a card, then the timeline", async () => {
      await userEvent.click(card(canvas, /Moon/));
      expect(card(canvas, /Moon/)).toHaveAttribute("aria-pressed", "true");
      expect(canvas.getByRole("status")).toHaveTextContent("chosen: click the timeline");
      const r = track.getBoundingClientRect();
      await userEvent.pointer({ keys: "[MouseLeft]", target: track, coords: { clientX: xOf(track, 1969), clientY: r.top + 20 } });
      await waitFor(() => expect(Math.abs((field(pci.getResponse(), "year6") as number) - 1969)).toBeLessThanOrEqual(3));
    });

    await step("drag a card off the timeline: back in the list", async () => {
      await dragTo(slider(canvas, /Moon/), 10, 5);
      expect(canvas.queryByRole("slider", { name: /Moon/ })).toBeNull();
      expect(card(canvas, /Moon/)).toBeInTheDocument();
      expect(field(pci.getResponse(), "year6")).toBeUndefined();
    });

    await step("start again", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Start again" }));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);

    await step("Enter on a card puts it in the middle of the view", async () => {
      card(canvas, /Bastille/).focus();
      await userEvent.keyboard("{Enter}");
      await afterPaint();
      expect(slider(canvas, /Bastille/)).toHaveAttribute("aria-valuenow", "1750");
      expect((canvasElement.querySelector(".tspci-host")!.shadowRoot!.activeElement as HTMLElement).getAttribute("role")).toBe("slider");
    });

    await step("arrow keys a year, Page Up ten, to 1789", async () => {
      await userEvent.keyboard("{PageUp}{PageUp}{PageUp}{PageUp}{ArrowLeft}");
      expect(slider(canvas, /Bastille/)).toHaveAttribute("aria-valuetext", "1789");
      expect(field(pci.getResponse(), "check3")).toBe(1);
      expect(canvas.getByRole("status")).toHaveTextContent("The storming of the Bastille in Paris: 1789.");
    });

    await step("End, Home, Delete", async () => {
      await userEvent.keyboard("{End}");
      expect(field(pci.getResponse(), "year3")).toBe(2000);
      await userEvent.keyboard("{Home}");
      expect(field(pci.getResponse(), "year3")).toBe(1500);
      await userEvent.keyboard("{Delete}");
      expect(pci.getResponse()).toBeUndefined();
      expect(canvas.getByRole("status")).toHaveTextContent("is back in the list");
    });
  },
};

export const ZoomAndPan: Story = {
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Zoom in" }));
    expect(canvas.getByRole("status")).toHaveTextContent(/^Showing 16\d\d to 18\d\d\.$/);
    expect(canvas.getByText("1700")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Zoom in" }));
    await userEvent.click(canvas.getByRole("button", { name: "Later" }));
    expect(canvas.getByRole("status")).toHaveTextContent(/^Showing 17\d\d to 18\d\d\.$/);
    // a card placed by keyboard lands in the middle of the view
    card(canvas, /Bastille/).focus();
    await userEvent.keyboard("{Enter}");
    const v = Number(slider(canvas, /Bastille/).getAttribute("aria-valuenow"));
    expect(v).toBeGreaterThan(1700);
    expect(v).toBeLessThan(1850);
    await userEvent.click(canvas.getByRole("button", { name: "Show everything" }));
    expect(canvas.getByRole("button", { name: "Zoom out" })).toBeDisabled();
  },
};

export const ResponseValues: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    pci.setResponse({ record: [{ name: "placements", base: { string: '{"e1":1570,"e2":1700,"e5":1945}' } }] });
    await waitFor(() => expect(canvas.getAllByRole("slider")).toHaveLength(3));
    const r = pci.getResponse();
    expect(field(r, "score")).toBe(2); // 1570 is 4 years off, 1700 is 52
    expect(field(r, "maxscore")).toBe(6);
    expect(field(r, "correct")).toBe(0);
    expect([1, 2, 3, 4, 5, 6].map((i) => field(r, `check${i}`))).toEqual([1, 0, 0, 0, 1, 0]);
    expect(field(r, "year2")).toBe(1700);
    expect(field(r, "period2")).toBe("t7");
    expect(field(r, "order")).toBe("e1 e2 e5");
    expect(field(r, "placements")).toBe('{"e1":1570,"e2":1700,"e5":1945}');
  },
};

export const PeriodMode: Story = {
  args: { properties: { timeline: PERIODS, prompt: "Put each event in its period." } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText("2000 BC")).toBeInTheDocument();
    await step("Enter, then the arrow keys go from period to period", async () => {
      card(canvas, /Caesar/).focus();
      await userEvent.keyboard("{Enter}");
      await afterPaint();
      await userEvent.keyboard("{Home}");
      expect(slider(canvas, /Caesar/)).toHaveAttribute("aria-valuetext", "Greeks and Romans");
      await userEvent.keyboard("{ArrowRight}");
      expect(slider(canvas, /Caesar/)).toHaveAttribute("aria-valuetext", "Monks and knights");
      await userEvent.keyboard("{ArrowLeft}");
      expect(field(pci.getResponse(), "period1")).toBe("t2");
      expect(field(pci.getResponse(), "check1")).toBe(1);
      expect(field(pci.getResponse(), "year1")).toBeUndefined();
    });
    await step("drop a card in a band", async () => {
      const band = canvasElement.querySelector(".tspci-host")!.shadowRoot!.querySelector("[data-period=t3]")!.getBoundingClientRect();
      await dragTo(card(canvas, /Charlemagne/), band.left + band.width / 2, band.top + 30);
      expect(field(pci.getResponse(), "period2")).toBe("t3");
      expect(field(pci.getResponse(), "score")).toBe(2);
      expect(field(pci.getResponse(), "maxscore")).toBe(3);
    });
  },
};

export const OrderMode: Story = {
  args: { properties: { timeline: ORDER, prompt: "Put the events in order." } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText(/← earlier/)).toBeInTheDocument();
    for (const name of [/Versailles/, /crusade/, /Columbus/]) {
      card(canvas, name).focus();
      await userEvent.keyboard("{Enter}");
      await afterPaint();
    }
    expect(field(pci.getResponse(), "order")).toBe("e3 e1 e2");
    expect(field(pci.getResponse(), "pairs")).toBe(1);
    expect(field(pci.getResponse(), "maxscore")).toBe(3);
    slider(canvas, /Versailles/).focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(slider(canvas, /Versailles/)).toHaveAttribute("aria-valuetext", "place 3 of 3");
    expect(field(pci.getResponse(), "order")).toBe("e1 e2 e3");
    expect(field(pci.getResponse(), "score")).toBe(3);
    expect(field(pci.getResponse(), "correct")).toBe(1);
  },
};

export const CenturiesAllOrNothing: Story = {
  args: {
    properties: {
      timeline: JSON.stringify({ start: -800, end: 1500, unit: "century", margin: 0, scoring: "all", periods: [], events: [{ text: "Rome is founded", year: -753 }, { text: "The fall of Constantinople", year: 1453 }] }),
      prompt: "In which century?",
    },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    card(canvas, /Rome/).focus();
    await userEvent.keyboard("{Enter}");
    await afterPaint();
    await userEvent.keyboard("{Home}");
    expect(slider(canvas, /Rome/)).toHaveAttribute("aria-valuetext", "8th century BC");
    card(canvas, /Constantinople/).focus();
    await userEvent.keyboard("{Enter}");
    await afterPaint();
    await userEvent.keyboard("{End}");
    expect(slider(canvas, /Constantinople/)).toHaveAttribute("aria-valuetext", "16th century AD");
    expect(field(pci.getResponse(), "score")).toBe(0);
    await userEvent.keyboard("{ArrowLeft}");
    expect(slider(canvas, /Constantinople/)).toHaveAttribute("aria-valuetext", "15th century AD");
    expect(field(pci.getResponse(), "year1")).toBe(-800);
    expect(field(pci.getResponse(), "year2")).toBe(1400);
    expect(field(pci.getResponse(), "score")).toBe(1);
    expect(field(pci.getResponse(), "maxscore")).toBe(1);
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText(/^Sleep elke gebeurtenis/)).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Inzoomen" })).toBeEnabled();
    expect(canvas.getByText("6 · Tijd van regenten en vorsten")).toBeInTheDocument();
    card(canvas, /Vrede van Münster/).focus();
    await userEvent.keyboard("{Enter}");
    await afterPaint();
    expect(canvas.getByRole("status")).toHaveTextContent("Vrede van Münster: Spanje erkent de Republiek: 1750.");
    await userEvent.keyboard("{Delete}");
    expect(canvas.getByRole("status")).toHaveTextContent("ligt weer in de lijst");
    card(canvas, /Beeldenstorm/).focus();
    await userEvent.keyboard("{Enter}");
    // the response does not depend on the language
    expect(field(pci.getResponse(), "year1")).toBe(1750);
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    card(first.canvas, /Bastille/).focus();
    await userEvent.keyboard("{Enter}");
    await afterPaint(); // the card gets the focus after the next paint
    await userEvent.keyboard("{ArrowRight}");
    const state = first.pci.getState();
    const second = await remountPci(canvasElement, pci, { state });
    expect(slider(second.canvas, /Bastille/)).toHaveAttribute("aria-valuenow", "1751");
    expect(field(second.pci.getResponse(), "year3")).toBe(1751);
    expect(JSON.parse(second.pci.getState()).log).toHaveLength(2);
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: { record: [{ name: "placements", base: { string: '{"e4":1839,"e6":1969}' } }] } } },
  play: async ({ canvasElement }) => {
    const { canvas, pci, changes } = await openPci(canvasElement);
    expect(slider(canvas, /railway/)).toHaveAttribute("aria-valuetext", "1839");
    expect(slider(canvas, /Moon/)).toHaveAttribute("aria-valuetext", "1969");
    expect(field(pci.getResponse(), "score")).toBe(2);
    expect(changes).toHaveLength(0);
  },
};

export const Solution: Story = {
  args: { status: "solution", properties: { timeline: PERIODS } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.queryByText("Events to place")).toBeNull();
    expect(slider(canvas, /Caesar/)).toHaveAttribute("aria-valuetext", "Greeks and Romans");
    expect(slider(canvas, /Revolt/)).toHaveAttribute("aria-valuetext", "Discoverers and reformers");
    expect(slider(canvas, /Revolt/)).toHaveAttribute("aria-readonly", "true");
    expect(field(pci.getResponse(), "score")).toBe(3);
    expect(canvas.queryByRole("button", { name: "Start again" })).toBeNull();
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
    card(first.canvas, /Bastille/).focus();
    await userEvent.keyboard("{Enter}");
    card(second.canvas, /Moon/).focus();
    await userEvent.keyboard("{Enter}");
    await afterPaint(); // the card gets the focus after the next paint
    await userEvent.keyboard("{ArrowRight}");
    expect(field(first.pci.getResponse(), "placements")).toBe('{"e3":1750}');
    expect(field(second.pci.getResponse(), "placements")).toBe('{"e6":1751}');
    expect(first.changes).toHaveLength(1);
    expect(second.changes).toHaveLength(2);
  },
};

// --- Authoring mode: what an authoring system shows the item author (getAuthoringInstance)

export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);
    const config = () => JSON.parse(instance.getProperties().timeline!);

    await step("starts from the example", async () => {
      expect(instance.validate()).toEqual([]);
      expect(config().events).toHaveLength(6);
      expect(canvas.getByText("Ready: every event has its answer.")).toBeInTheDocument();
      expect(canvas.getAllByRole("slider")).toHaveLength(6);
    });

    await step("add an event: the problems name it", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Add an event" }));
      expect(instance.validate()).toEqual(["Event 7 has no text.", "Event 7 has no year."]);
      await userEvent.type(canvas.getByRole("textbox", { name: "Text 7" }), "The fall of the Berlin Wall");
      await userEvent.type(canvas.getByRole("textbox", { name: "Year 7" }), "1989");
      expect(instance.validate()).toEqual([]);
      expect(config().events[6]).toEqual({ id: "e7", text: "The fall of the Berlin Wall", year: 1989 });
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("a year BC on the axis", async () => {
      await retype(canvas.getByRole("textbox", { name: "Year 1" }), "44 BC");
      expect(instance.validate()).toEqual(["The year of event 1 is not on the axis."]);
      await userEvent.click(canvas.getByRole("tab", { name: "Axis" }));
      await retype(canvas.getByRole("textbox", { name: "From" }), "-100");
      expect(config().start).toBe(-100);
      expect(instance.validate()).toEqual([]);
    });

    await step("the mode, the margin and the response processing", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Answer and scoring" }));
      await retype(canvas.getByRole("spinbutton"), "25");
      expect(config().margin).toBe(25);
      await userEvent.click(canvas.getByText("Response processing for the item"));
      expect(canvas.getByTestId("response-processing")).toHaveTextContent('tolerance="25"');
      await userEvent.click(canvas.getByRole("radio", { name: "puts each event in a period" }));
      expect(config().mode).toBe("period");
      expect(config().margin).toBeUndefined();
      expect(canvas.getByText("Maximum score: 7")).toBeInTheDocument();
    });

    await step("own periods", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Periods" }));
      await userEvent.click(canvas.getByRole("radio", { name: "Own periods" }));
      await retype(canvas.getByRole("textbox", { name: "Name 1" }), "Prehistory");
      expect(Array.isArray(config().periods)).toBe(true);
      expect(config().periods[0].label).toBe("Prehistory");
    });
  },
};

export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { timeline: JSON.stringify({ mode: "order", events: [{ text: "a", year: 1600 }] }) } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(instance.validate()).toEqual(["Voor een volgorde zijn minstens twee gebeurtenissen nodig."]);
    expect(canvas.getByRole("tab", { name: "Gebeurtenissen" })).toHaveAttribute("aria-selected", "true");
  },
};
