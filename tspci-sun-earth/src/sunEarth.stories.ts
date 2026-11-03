import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { afterPaint, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Sun, Earth and seasons",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Record = { record: { name: string; base: { integer?: number; float?: number; string?: string; identifier?: string } | null }[] } | undefined;
/** A field of the record response. */
const field = (response: unknown, name: string) => (response as Record)?.record.find((f) => f.name === name)?.base;

/**
 * Sets a range input as the candidate does when they let go (user-event's arrow keys do not move a native range):
 * the value, an input and a change event.
 */
const slide = async (input: HTMLElement, value: number) => {
  (input as HTMLInputElement).value = String(value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await afterPaint();
};

const dateSlider = (canvas: MountedPci["canvas"]) => canvas.getByRole("slider", { name: "Date" });
const timeSlider = (canvas: MountedPci["canvas"], name = "Time (UTC)") => canvas.getByRole("slider", { name });

/** "Set the time when it is noon in Jakarta": only the time moves, scored on the solar time. */
const JAKARTA = JSON.stringify({
  places: ["jakarta"], controls: { day: false, time: true, place: false }, start: { day: 172, minutes: 0, place: "jakarta" }, timeStep: 5,
  targets: [{ field: "solarTime", value: 12, margin: 0.25, points: 1 }], solution: { day: 172, minutes: 295, place: "jakarta" },
});
/** "At which place is the day longest on 21 June?": only the place moves. */
const LONGEST = JSON.stringify({
  places: ["amsterdam", "quito", "oslo", "sydney"], controls: { day: false, time: false, place: true }, start: { day: 172, minutes: 720, place: "quito" },
  targets: [{ field: "place", value: "oslo", points: 1 }], solution: { day: 172, minutes: 720, place: "oslo" },
});

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText(/^Set the date on which the sun is overhead/)).toBeInTheDocument();
    expect(canvas.getByRole("region", { name: "Sun, Earth and seasons" })).toBeInTheDocument();
    expect(canvas.getByRole("application", { name: "3D view: the Earth on its orbit around the Sun" })).toBeInTheDocument();
    expect(canvas.getByTestId("not-to-scale")).toHaveTextContent("Not to scale");
    expect(canvas.getByRole("img", { name: /^The sun's path through the sky in Amsterdam on 21 March/ })).toBeInTheDocument();
    expect(dateSlider(canvas)).toHaveAttribute("aria-valuetext", "21 March (day 80)");
    expect(timeSlider(canvas)).toHaveAttribute("aria-valuetext", "12:00 UTC");
    expect(canvas.getByRole("radio", { name: /Amsterdam/ })).toHaveAttribute("aria-checked", "true");
    expect(canvas.getByTestId("info-length")).toHaveTextContent("12 h 10 min");
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const SetTheDate: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await step("21 June: no score; Amsterdam's longest day", async () => {
      await slide(dateSlider(canvas), 172);
      const r = await lastChange(mounted);
      expect(field(r, "day")).toEqual({ integer: 172 });
      expect(field(r, "score")).toEqual({ integer: 0 });
      expect(field(r, "dayLength")?.float).toBeCloseTo(16.8, 1);
      expect(field(r, "noonElevation")?.float).toBeCloseTo(61.1, 1);
      expect(canvas.getByTestId("info-length")).toHaveTextContent("16 h 48 min");
      expect(canvas.getByTestId("live")).toHaveTextContent("Date: 21 June. Day length 16 h 48 min, the sun at noon 61.1° high.");
    });
    await step("21 December: the sun overhead at the Tropic of Capricorn", async () => {
      await slide(dateSlider(canvas), 355);
      expect(field(pci.getResponse(), "correct")).toEqual({ integer: 1 });
      expect(field(pci.getResponse(), "declination")?.float).toBeCloseTo(-23.4, 0);
      expect(canvas.getByTestId("info-overhead")).toHaveTextContent("23.4° S");
    });
    await step("within the margin of 3 days", async () => {
      await slide(dateSlider(canvas), 358);
      expect(field(pci.getResponse(), "score")).toEqual({ integer: 1 });
      await slide(dateSlider(canvas), 359);
      expect(field(pci.getResponse(), "score")).toEqual({ integer: 0 });
    });
  },
};

export const ButtonsAndKeys: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("− and + move a day and a time step", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Date: later" }));
      expect(field(pci.getResponse(), "day")).toEqual({ integer: 81 });
      await userEvent.click(canvas.getByRole("button", { name: "Time (UTC): earlier" }));
      expect(field(pci.getResponse(), "time")).toEqual({ float: 11.833 });
    });
    await step("the slider's keys: arrows a step, Page Up a week, Home and End the ends", async () => {
      dateSlider(canvas).focus();
      await userEvent.keyboard("{ArrowRight}{PageUp}");
      expect(field(pci.getResponse(), "day")).toEqual({ integer: 89 });
      await userEvent.keyboard("{Home}");
      expect(field(pci.getResponse(), "day")).toEqual({ integer: 1 });
      expect(canvas.getByRole("button", { name: "Date: earlier" })).toBeDisabled();
      timeSlider(canvas).focus();
      await userEvent.keyboard("{PageDown}");
      expect(field(pci.getResponse(), "time")).toEqual({ float: 10.833 });
    });
    await step("the place: click, and arrow keys in the radio group", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: /Oslo/ }));
      expect(field(pci.getResponse(), "place")).toEqual({ identifier: "oslo" });
      await userEvent.keyboard("{ArrowRight}");
      expect(field(pci.getResponse(), "place")).toEqual({ identifier: "sydney" });
      expect(canvas.getByRole("radio", { name: /Sydney/ })).toHaveAttribute("aria-checked", "true");
      expect(canvas.getByRole("img", { name: /in Sydney/ })).toBeInTheDocument();
    });
    await step("the 3D view turns with the keyboard and its buttons, and switches to the Earth", async () => {
      const view = canvas.getByRole("application");
      const scene = (view as any).__sunEarth;
      const start = scene.view.theta;
      view.focus();
      await userEvent.keyboard("{ArrowLeft}");
      expect(scene.view.theta).toBeGreaterThan(start);
      await userEvent.click(canvas.getByRole("button", { name: "Back to the start view" }));
      expect(scene.view.theta).toBe(start);
      await userEvent.click(canvas.getByRole("radio", { name: "Earth" }));
      expect(scene.view.focus).toBe("earth");
      const radius = scene.view.radius;
      await userEvent.click(canvas.getByRole("button", { name: "Zoom in" }));
      expect(scene.view.radius).toBeCloseTo(radius * 0.8, 6);
    });
  },
};

export const NoonInJakarta: Story = {
  args: { properties: { setup: JAKARTA, prompt: "Set the time (UTC) when it is noon in Jakarta on 21 June." } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(dateSlider(canvas)).toBeDisabled();
    expect(canvas.getByTestId("place-fixed")).toHaveTextContent(/Jakarta \(6\.2° S, 106\.[89]° E\)/);
    await slide(timeSlider(canvas), 360);
    expect(field(pci.getResponse(), "correct")).toEqual({ integer: 0 });
    await slide(timeSlider(canvas), 293); // on the step of 5 minutes: 04:55
    const r = pci.getResponse();
    expect(field(r, "time")).toEqual({ float: 4.917 });
    expect(field(r, "solarTime")?.float).toBeCloseTo(12, 0);
    expect(field(r, "correct")).toEqual({ integer: 1 });
  },
};

export const LongestDay: Story = {
  args: { properties: { setup: LONGEST, prompt: "At which place is the day longest on 21 June?", showInfo: "false", view: "2d" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.queryByTestId("info")).toBeNull();
    expect(canvas.getByRole("img", { name: /^The Earth seen from the side on 21 June/ })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("radio", { name: /Amsterdam/ }));
    expect(field(pci.getResponse(), "score")).toEqual({ integer: 0 });
    await userEvent.click(canvas.getByRole("radio", { name: /Oslo/ }));
    expect(field(pci.getResponse(), "place")).toEqual({ identifier: "oslo" });
    expect(field(pci.getResponse(), "score")).toEqual({ integer: 1 });
  },
};

export const LocalTimeAndPolarDay: Story = {
  args: { properties: { timeBase: "local", setup: JSON.stringify({ places: ["longyearbyen", "amsterdam"], start: { day: 172, minutes: 0, place: "longyearbyen" }, targets: [] }), mode: "tool" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(timeSlider(canvas, "Time (local, by longitude)")).toHaveAttribute("aria-valuetext", "01:03 local");
    expect(canvas.getByTestId("polar")).toHaveTextContent("Midnight sun: the sun does not set.");
    await slide(timeSlider(canvas, "Time (local, by longitude)"), 120);
    const r = pci.getResponse();
    expect(field(r, "localTime")).toEqual({ float: 2 });
    expect(field(r, "sunrise")).toBeUndefined();
    expect(field(r, "dayLength")).toEqual({ float: 24 });
  },
};

export const ToolMode: Story = {
  args: { properties: { mode: "tool", prompt: "Explore day and night through the year." } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await slide(dateSlider(canvas), 100);
    await userEvent.click(canvas.getByRole("radio", { name: /Quito/ }));
    const r = pci.getResponse();
    expect(field(r, "score")).toBeUndefined();
    expect(JSON.parse(field(r, "tried")!.string!)).toEqual([
      { day: 100, time: 12, place: "amsterdam" },
      { day: 100, time: 12, place: "quito" },
    ]);
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", prompt: "Stel de datum in waarop de zon loodrecht boven de Steenbokskeerkring staat." } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const slider = canvas.getByRole("slider", { name: "Datum" });
    expect(slider).toHaveAttribute("aria-valuetext", "21 maart (dag 80)");
    expect(canvas.getByRole("region", { name: "Zon, aarde en seizoenen" })).toBeInTheDocument();
    await slide(slider, 172);
    expect(canvas.getByTestId("info-noon")).toHaveTextContent("61,1° om 11:42 UTC");
    expect(canvas.getByTestId("info-length")).toHaveTextContent("16 u 48 min");
    expect(canvas.getByTestId("live")).toHaveTextContent("Datum: 21 juni. Daglengte 16 u 48 min");
    // the response stays language independent
    expect(field(pci.getResponse(), "noonElevation")?.float).toBeCloseTo(61.07, 1);
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await slide(dateSlider(first.canvas), 355);
    await userEvent.click(first.canvas.getByRole("radio", { name: /Sydney/ }));
    const state = first.pci.getState();
    expect(JSON.parse(state).state.setting).toEqual({ day: 355, minutes: 720, place: "sydney" });

    const second = await remountPci(canvasElement, pci, { state });
    expect(dateSlider(second.canvas)).toHaveAttribute("aria-valuetext", "21 December (day 355)");
    expect(second.canvas.getByRole("radio", { name: /Sydney/ })).toHaveAttribute("aria-checked", "true");
    expect(second.pci.getResponse()).toEqual(first.pci.getResponse());
    expect(second.changes).toHaveLength(0);
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: { record: [{ name: "day", base: { integer: 200 } }, { name: "time", base: { float: 6.5 } }, { name: "place", base: { identifier: "oslo" } }, { name: "dayLength", base: { float: 1 } }] } } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("the bound setting is shown; the sun's values follow from it", async () => {
      await waitFor(() => expect(dateSlider(canvas)).toHaveAttribute("aria-valuetext", "19 July (day 200)"));
      expect(timeSlider(canvas)).toHaveAttribute("aria-valuetext", "06:30 UTC");
      expect(field(pci.getResponse(), "dayLength")?.float).toBeGreaterThan(17);
    });
    await step("resetResponse: the start", async () => {
      pci.resetResponse();
      await waitFor(() => expect(dateSlider(canvas)).toHaveAttribute("aria-valuetext", "21 March (day 80)"));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: { status: "solution", state: JSON.stringify({ state: { setting: { day: 100, minutes: 600, place: "oslo" }, moved: true, tried: [] }, log: [] }) },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the author's solution replaces the candidate's setting; nothing to change
    await waitFor(() => expect(dateSlider(canvas)).toHaveAttribute("aria-valuetext", "21 December (day 355)"));
    expect(canvas.getByText("Correct answer")).toBeInTheDocument();
    expect(dateSlider(canvas)).toBeDisabled();
    expect(field(pci.getResponse(), "correct")).toEqual({ integer: 1 });
  },
};

export const SolutionFromTheDeclaration: Story = {
  args: { status: "solution", responseDeclaration: { cardinality: "record", correctResponse: { value: [{ fieldIdentifier: "day", value: "356" }] } } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    await waitFor(() => expect(dateSlider(canvas)).toHaveAttribute("aria-valuetext", "22 December (day 356)"));
  },
};

/** Two interactions of this type on one page: each has its own setting and response. */
export const TwoInstances: Story = {
  render: (args) => {
    const page = document.createElement("div");
    for (const id of ["first", "second"]) {
      const slot = document.createElement("div");
      slot.dataset.slot = id;
      slot.appendChild(mountPci(pci, { ...args, properties: { view: "2d" } }));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=first]")!);
    const second = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=second]")!);
    expect(first.pci).not.toBe(second.pci);
    await slide(dateSlider(first.canvas), 355);
    await slide(dateSlider(second.canvas), 172);
    expect(field(first.pci.getResponse(), "day")).toEqual({ integer: 355 });
    expect(field(second.pci.getResponse(), "day")).toEqual({ integer: 172 });
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
    const setup = () => JSON.parse(instance.getProperties().setup!);

    await step("starts from the example, without problems", async () => {
      expect(instance.validate!()).toEqual([]);
      expect(canvas.getByText("No problems.")).toBeInTheDocument();
    });

    await step("places: add a known one and one of your own", async () => {
      await userEvent.selectOptions(canvas.getByTestId("preset"), "Longyearbyen");
      await userEvent.click(canvas.getByTestId("add-preset"));
      expect(setup().places).toContain("longyearbyen");
      await userEvent.click(canvas.getByTestId("add-place"));
      await retype(canvas.getByTestId("place-6-name"), "Den Helder");
      await retype(canvas.getByTestId("place-6-lat"), "52,96");
      expect(setup().places[6]).toMatchObject({ id: "denhelder", lat: 52.96 });
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("only the place moves: the day target has nothing to depend on", async () => {
      await userEvent.click(canvas.getByTestId("control-day"));
      await userEvent.click(canvas.getByTestId("control-time"));
      expect(instance.validate!()).toContain("Target 1 does not depend on anything the candidate controls.");
    });

    await step("a place target, and the response processing", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Targets" }));
      await userEvent.selectOptions(canvas.getByTestId("target-0-field"), "Place");
      await userEvent.selectOptions(canvas.getByTestId("target-0-place"), "Oslo");
      expect(setup().targets[0]).toEqual({ field: "place", value: "oslo", margin: 0, points: 1 });
      expect(canvas.getByTestId("response-processing")).toHaveTextContent("<qti-base-value base-type=\"identifier\">oslo</qti-base-value>");
      expect(instance.validate!()).toContain("The solution does not meet target 1.");
    });

    await step("the solution tab: choose the place as a candidate would", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Solution" }));
      await userEvent.click(canvas.getByRole("radio", { name: /Oslo/ }));
      expect(setup().solution.place).toBe("oslo");
      expect(canvas.getAllByTestId("summary")[0]).toHaveTextContent("The solution scores 1 of 1.");
      expect(instance.validate!()).toEqual([]);
    });
  },
};

export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { mode: "answer", setup: JSON.stringify({ places: ["oslo"], controls: { day: false, time: false, place: false }, targets: [] }) } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("tab", { name: "Plaatsen en bediening" })).toHaveAttribute("aria-selected", "true");
    expect(instance.validate!()).toEqual([
      "De kandidaat stelt niets in: laat de datum, de tijd of de plaats instellen.",
      "Er zijn geen doelen: voeg er een toe, of gebruik de PCI als gereedschap.",
    ]);
  },
};
