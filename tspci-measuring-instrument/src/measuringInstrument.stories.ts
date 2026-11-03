import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { afterPaint, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Measuring instrument",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Root = ShadowRoot | HTMLElement;
const float = (m: { pci: MountedPci["pci"] }) => m.pci.getResponse()?.base?.float;
const figure = (root: Root) => root.querySelector<SVGSVGElement>('[data-testid="instrument"]')!;

/** A drag on the instrument, between points in the coordinates of its drawing (its viewBox), as pointer events. */
const drag = async (root: Root, from: [number, number], to: [number, number]) => {
  const svg = figure(root);
  const [, , w, h] = svg.getAttribute("viewBox")!.split(" ").map(Number);
  const r = svg.getBoundingClientRect();
  const at = ([x, y]: [number, number]) => ({ clientX: r.left + (x * r.width) / w, clientY: r.top + (y * r.height) / h });
  const pointer = { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0 };
  fireEvent.pointerDown(svg, { ...pointer, ...at(from) });
  await afterPaint();
  for (let i = 1; i <= 4; i++) {
    fireEvent.pointerMove(svg, { ...pointer, buttons: 1, ...at([from[0] + ((to[0] - from[0]) * i) / 4, from[1] + ((to[1] - from[1]) * i) / 4]) });
    await afterPaint();
  }
  fireEvent.pointerUp(svg, { ...pointer, ...at(to) });
  await afterPaint();
};
/** Keys on a focused element of the instrument (the slider, the drawing, a range button). */
const press = async (element: Element, ...keys: string[]) => {
  (element as HTMLElement).focus();
  for (const key of keys) await userEvent.keyboard(key);
  await afterPaint();
};
/** Thermometer: the y of a temperature on the drawing (−10 °C at 450, 50 °C at 70). */
const thermoY = (c: number) => 450 - ((c + 10) / 60) * 380;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText("Read off the thermometer. What is the temperature?")).toBeInTheDocument();
    // the drawing has a name, but not its value
    expect(canvas.getByRole("img", { name: "Thermometer, scale from −10 to 50 °C" })).toBeInTheDocument();
    expect(canvas.getByRole("textbox", { name: "Your reading (°C)" })).toHaveValue("");
    expect(canvas.getByTestId("unit")).toHaveTextContent("°C");
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const ReadOff: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const field = mounted.canvas.getByRole("textbox", { name: "Your reading (°C)" });
    await step("type the reading: a comma becomes a point in English, letters are refused", async () => {
      await userEvent.type(field, "18,0x");
      expect(field).toHaveValue("18.0");
      expect(float(mounted)).toBe(18);
      expect(await lastChange(mounted)).toEqual({ base: { float: 18 } });
    });
    await step("on leaving the field, the reading is announced", async () => {
      fireEvent.blur(field);
      await afterPaint();
      expect(mounted.canvas.getByTestId("announce")).toHaveTextContent("Your reading: 18.0 °C.");
    });
    await step("half a number gets a hint", async () => {
      await retype(field, "-");
      fireEvent.blur(field);
      await afterPaint();
      expect(mounted.pci.getResponse()).toBeUndefined();
      expect(mounted.canvas.getByTestId("hint")).toHaveTextContent("That is not a number yet.");
    });
  },
};

export const Magnifier: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, root } = await openPci(canvasElement);
    const svg = figure(root);
    await step("on hover, around the pointer", async () => {
      const r = svg.getBoundingClientRect();
      fireEvent.pointerMove(svg, { pointerType: "mouse", clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
      await afterPaint();
      expect(canvas.getByTestId("lens")).toBeInTheDocument();
      fireEvent.pointerLeave(svg);
      await afterPaint();
      expect(canvas.queryByTestId("lens")).toBeNull();
    });
    await step("on focus, at the reading point; the arrow keys move it", async () => {
      await press(canvas.getByRole("img"));
      const lens = () => canvas.getByTestId("lens").querySelector("circle")!;
      expect(Number(lens().getAttribute("cy"))).toBeCloseTo(thermoY(18), 0);
      await press(canvas.getByRole("img"), "{ArrowUp}");
      expect(Number(lens().getAttribute("cy"))).toBeCloseTo(thermoY(18) - 10, 0);
    });
  },
};

export const SetWithPointer: Story = {
  args: { properties: { mode: "set", value: "25" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root } = mounted;
    expect(canvas.getByText("Set the thermometer to 25 °C: drag the top of the liquid.")).toBeInTheDocument();
    const slider = canvas.getByRole("slider", { name: "Thermometer" });
    expect(slider).toHaveAttribute("aria-valuetext", "not set yet");
    expect(mounted.pci.getResponse()).toBeUndefined();
    await drag(root, [80, 400], [80, thermoY(25)]);
    // one change, when the drag ends
    expect(await lastChange(mounted)).toEqual({ base: { float: 25 } });
    expect(mounted.changes).toHaveLength(1);
    expect(slider).toHaveAttribute("aria-valuetext", "25 °C");
    expect(canvas.getByTestId("announce")).toHaveTextContent("Set to 25 °C.");
  },
};

export const SetWithKeyboard: Story = {
  args: { properties: { instrument: "cylinder", mode: "set", value: "12" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const slider = mounted.canvas.getByRole("slider", { name: "Measuring cylinder" });
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "50");
    await press(slider, "{PageUp}", "{ArrowUp}", "{ArrowUp}");
    expect(float(mounted)).toBe(12);
    await press(slider, "{End}");
    expect(float(mounted)).toBe(50);
    await press(slider, "{Home}");
    expect(float(mounted)).toBe(0);
    expect(slider).toHaveAttribute("aria-valuetext", "0 mL");
  },
};

export const SetTheClock: Story = {
  args: { properties: { instrument: "clock", mode: "set", value: "195" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.canvas.getByText("Set the clock to 3:15: drag the minute hand.")).toBeInTheDocument();
    const slider = mounted.canvas.getByRole("slider", { name: "Clock" });
    // from 12:00, 3 hours on and the minute hand to 3 (a quarter past)
    await press(slider, "{PageUp}", "{PageUp}", "{PageUp}");
    await drag(mounted.root, [180, 40], [320, 180]);
    expect(float(mounted)).toBe(195);
    expect(slider).toHaveAttribute("aria-valuetext", "3:15");
  },
};

export const ChooseTheRange: Story = {
  args: { properties: { instrument: "meter", mode: "range", value: "4.5", ranges: "3 15 30" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByText("You expect a voltage of about 4.5 V. Which range of the meter do you choose?")).toBeInTheDocument();
    const group = canvas.getByRole("radiogroup", { name: "Range" });
    expect(within(group as HTMLElement).getAllByRole("radio")).toHaveLength(3);
    await step("click a range, the lead goes into its socket", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "○ 30 V" }));
      expect(float(mounted)).toBe(30);
      expect(canvas.getByRole("radio", { name: "● 30 V" })).toHaveAttribute("aria-checked", "true");
      expect(canvas.getAllByTestId("socket-30")[0]).toHaveAttribute("data-plugged", "true");
    });
    await step("the arrow keys choose too", async () => {
      await press(canvas.getByRole("radio", { name: "● 30 V" }), "{ArrowLeft}");
      expect(float(mounted)).toBe(15);
      expect(canvas.getByTestId("announce")).toHaveTextContent("Range 15 V chosen.");
    });
    expect(pci.getCorrectResponse!({ instrument: "meter", mode: "range", value: "4.5", ranges: "3 15 30" } as any)).toEqual({ base: { float: 15 } });
  },
};

export const MeterDutch: Story = {
  args: { properties: { instrument: "meter", unit: "A", value: "0.62", ranges: "1 5", language: "nl" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByRole("img", { name: "Stroommeter, schaal van 0 tot 1 A" })).toBeInTheDocument();
    expect(canvas.getByTestId("plugged")).toHaveTextContent("Bereik: 1 A");
    const field = canvas.getByRole("textbox", { name: "Jouw aflezing (A)" });
    await userEvent.type(field, "0.62");
    expect(field).toHaveValue("0,62");
    expect(float(mounted)).toBe(0.62);
  },
};

export const Dutch: Story = {
  args: { properties: { instrument: "cylinder", language: "nl" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByText("Lees de maatcilinder af aan de onderkant van de meniscus. Hoeveel vloeistof zit erin?")).toBeInTheDocument();
    expect(canvas.getByRole("img", { name: "Maatcilinder, schaal van 0 tot 50 mL" })).toBeInTheDocument();
    await userEvent.type(canvas.getByRole("textbox", { name: "Jouw aflezing (mL)" }), "37.5");
    expect(canvas.getByRole("textbox", { name: "Jouw aflezing (mL)" })).toHaveValue("37,5");
    // the response is the same in every language
    expect(float(mounted)).toBe(37.5);
  },
};

export const CaliperFineVernier: Story = {
  args: { properties: { instrument: "caliper", vernier: "20", value: "31.65", zoom: "false" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root } = mounted;
    expect(canvas.getByText("Read off the vernier caliper. How thick is the block?")).toBeInTheDocument();
    // without the magnifier, the drawing takes no focus and shows no lens
    expect(canvas.getByRole("img")).not.toHaveAttribute("tabindex");
    const r = figure(root).getBoundingClientRect();
    fireEvent.pointerMove(figure(root), { pointerType: "mouse", clientX: r.left + 100, clientY: r.top + 150 });
    await afterPaint();
    expect(canvas.queryByTestId("lens")).toBeNull();
    await userEvent.type(canvas.getByRole("textbox", { name: "Your reading (mm)" }), "31.65");
    expect(float(mounted)).toBe(31.65);
  },
};

export const ReadTheClock: Story = {
  args: { properties: { instrument: "clock" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const field = mounted.canvas.getByRole("textbox", { name: "Your reading (h:mm)" });
    await userEvent.type(field, "10.35");
    expect(field).toHaveValue("10:35");
    // minutes after 12 o'clock
    expect(float(mounted)).toBe(635);
  },
};

export const RestoresState: Story = {
  args: { properties: { mode: "set" } },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await press(first.canvas.getByRole("slider"), "{ArrowUp}", "{ArrowUp}");
    const state = first.pci.getState();
    expect(JSON.parse(state).state).toEqual({ text: "", value: -8, range: null });

    const second = await remountPci(canvasElement, pci, { properties: { mode: "set" }, state });
    expect(float(second)).toBe(-8);
    expect(second.canvas.getByRole("slider")).toHaveAttribute("aria-valuetext", "−8 °C");
    expect(second.changes).toHaveLength(0);
  },
};

export const BoundResponse: Story = {
  args: { properties: { instrument: "ruler", language: "nl" }, boundTo: { RESPONSE: { base: { float: 7.3 } } } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const field = mounted.canvas.getByRole("textbox", { name: "Jouw aflezing (cm)" });
    expect(field).toHaveValue("7,3");
    expect(float(mounted)).toBe(7.3);
    expect(mounted.changes).toHaveLength(0);
    // setResponse later, as a player does
    mounted.pci.setResponse({ base: { float: 7.4 } });
    await waitFor(() => expect(field).toHaveValue("7,4"));
  },
};

export const Solution: Story = {
  args: {
    status: "solution",
    properties: { instrument: "manometer", mode: "set" },
    state: JSON.stringify({ state: { text: "", value: 1.5, range: null }, log: [] }),
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    // no correct response declared: the one from the settings (2.3 bar), read-only
    const slider = mounted.canvas.getByRole("slider", { name: "Pressure gauge" });
    expect(slider).toHaveAttribute("aria-valuetext", "2.3 bar");
    expect(slider).toHaveAttribute("aria-readonly", "true");
    await press(slider, "{ArrowUp}");
    expect(float(mounted)).toBe(2.3);
  },
};

export const SolutionFromDeclaration: Story = {
  args: {
    status: "solution",
    properties: { instrument: "stopwatch" },
    responseDeclaration: { cardinality: "single", baseType: "float", correctResponse: { value: ["83.4"] } },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const field = mounted.canvas.getByRole("textbox", { name: "Your reading (s)" });
    expect(field).toHaveValue("83.4");
    expect(field).toHaveAttribute("readonly");
  },
};

/** Two interactions of this type in one item: the registered object hands each its own instance. */
export const TwoInstances: Story = {
  render: () => {
    const page = document.createElement("div");
    page.innerHTML = `<div data-testid="first" style="width:600px"></div><div data-testid="second" style="width:600px"></div>`;
    return page;
  },
  play: async ({ canvasElement }) => {
    const hosts = ["first", "second"].map((id) => canvasElement.querySelector<HTMLElement>(`[data-testid="${id}"]`)!);
    const changes: unknown[][] = [[], []];
    const instances = hosts.map((host, i) => {
      host.addEventListener("qti-interaction-changed", (e) => changes[i].push((e as CustomEvent).detail.value));
      const properties = i === 0 ? { mode: "set" } : { mode: "set", instrument: "scale", language: "nl" };
      return pci.getInstance(host, { properties, responseIdentifier: `RESPONSE${i + 1}`, boundTo: {}, onready: () => {} } as any, undefined) as any;
    });
    await afterPaint();
    expect(instances[0]).not.toBe(instances[1]);
    const [one, two] = hosts.map((h) => within(h.shadowRoot as unknown as HTMLElement));

    await press(one.getByRole("slider", { name: "Thermometer" }), "{ArrowUp}");
    await press(two.getByRole("slider", { name: "Keukenweegschaal" }), "{PageUp}");
    expect(instances[0].getResponse()).toEqual({ base: { float: -9 } });
    expect(instances[1].getResponse()).toEqual({ base: { float: 100 } });
    expect(changes).toEqual([[{ base: { float: -9 } }], [{ base: { float: 100 } }]]);
    instances[0].resetResponse();
    expect(instances[0].getResponse()).toBeUndefined();
    expect(instances[1].getResponse()).toEqual({ base: { float: 100 } });
    instances.forEach((x) => x.oncompleted());
  },
};

export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, root, changes } = await openAuthoring(canvasElement);
    const config = () => instance.getProperties();

    await step("starts from the thermometer, without problems", async () => {
      expect(config()).toMatchObject({ instrument: "thermometer", mode: "read", min: "-10", max: "50", value: "18", precision: "1" });
      expect(instance.validate!()).toEqual([]);
      expect(canvas.getByTestId("correct")).toHaveTextContent("18 °C");
    });

    await step("pick another instrument: its own scale", async () => {
      await userEvent.selectOptions(canvas.getByTestId("field-instrument"), "ruler");
      expect(config()).toMatchObject({ instrument: "ruler", min: "0", max: "15", unit: "cm", value: "7.3", precision: "0.1" });
    });

    await step("drag the value on the live preview", async () => {
      // the ruler: 0 cm at x 40, 15 cm at 640
      const svg = root.querySelector<SVGSVGElement>('[data-testid="preview"]')!;
      const r = svg.getBoundingClientRect();
      const x = r.left + ((40 + (10.5 / 15) * 600) * r.width) / 680;
      fireEvent.pointerDown(svg, { pointerId: 1, button: 0, clientX: x, clientY: r.top + r.height / 2 });
      fireEvent.pointerUp(svg, { pointerId: 1, button: 0, clientX: x, clientY: r.top + r.height / 2 });
      await afterPaint();
      expect(config().value).toBe("10.5");
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("a value between reading steps is a problem", async () => {
      const value = canvas.getByTestId("field-value") as HTMLInputElement;
      value.value = "10.55";
      fireEvent.change(value);
      await afterPaint();
      expect(instance.validate!()).toEqual(["The value is not a whole number of reading steps: it cannot be set or read exactly."]);
    });

    await step("set mode with a margin: the response processing", async () => {
      await userEvent.selectOptions(canvas.getByTestId("field-mode"), "set");
      const precision = canvas.getByTestId("field-precision") as HTMLInputElement;
      precision.value = "0.05";
      fireEvent.change(precision);
      const tolerance = canvas.getByTestId("field-tolerance") as HTMLInputElement;
      tolerance.value = "0.1";
      fireEvent.change(tolerance);
      await afterPaint();
      expect(instance.validate!()).toEqual([]);
      expect(canvas.getByTestId("xml")).toHaveTextContent('<qti-equal tolerance-mode="absolute" tolerance="0.1">');
      expect(pci.getCorrectResponse!(config() as any)).toEqual({ base: { float: 10.55 } });
    });
  },
};

export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { instrument: "meter", mode: "range", ranges: "3", value: "40" } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(instance.validate!()).toEqual(["Geef minstens twee bereiken om uit te kiezen.", "Geen enkel bereik is groot genoeg voor de waarde."]);
    expect(canvas.getByText("Waarde die de kandidaat verwacht")).toBeInTheDocument();
    const ranges = canvas.getByTestId("field-ranges") as HTMLInputElement;
    ranges.value = "3 15 60";
    fireEvent.change(ranges);
    await afterPaint();
    expect(instance.validate!()).toEqual([]);
    expect(instance.getProperties()).toMatchObject({ instrument: "meter", mode: "range", ranges: "3 15 60", value: "40" });
    expect(canvas.getByTestId("correct")).toHaveTextContent("60 V");
  },
};
