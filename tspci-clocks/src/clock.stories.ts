import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { afterPaint, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Clocks",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

// the defaults of config.json
const TITLE = "Tell the time";
const QUESTION = "What time is it?";

/**
 * The response of a clock the student sets: the time as "HH:MM". On a 12-hour clock (analog, digital without the
 * 24-hour setting) from 01:00 to 12:59, so 16:10 is "04:10"; on the 24-hour digital clock (the default) from 00:00 to
 * 23:59. A clock that only shows the time (askTime, the default) has no response.
 */
const time = (hhmm: string) => ({ base: { string: hhmm } });

// Setting the clock starts at 12:00 (not the default 7:25), so the hands start straight up and the arithmetic stays simple.
const SET_ANALOG = { typeOfQuestion: "setClock", typeOfClock: "analog", initialtime: "12:00" };
const SET_DIGITAL = { typeOfQuestion: "setClock", typeOfClock: "digital", initialtime: "12:00" };
const SHOW_DIGITAL = { typeOfQuestion: "askTime", typeOfClock: "digital" };

// ---- the analog clock: its face takes the pointer, the hands are images rotated from 12 o'clock

const face = (mounted: MountedPci) => mounted.root.querySelector<HTMLElement>(".touch-none")!;
/**
 * The rotation of a hand in degrees. The ornate hands (of the classic skin) are images rotated with CSS, drawn hands
 * (skins.tsx) SVG shapes with a rotate() transform.
 */
const handAngle = (mounted: MountedPci, hand: "short" | "long") => {
  const el = face(mounted).querySelector<HTMLElement | SVGGElement>(`[data-hand=${hand}]`)!;
  const transform = el instanceof HTMLElement ? el.style.transform : el.getAttribute("transform");
  const degrees = Number(/rotate\(([-\d.]+)(deg)?\)/.exec(transform ?? "")?.[1]);
  return degrees % 360; // at 12:00 the short hand is at 360 degrees (720 minutes / 2)
};

/** A pointer event at `angle` degrees clockwise from 12 and `distance` from the centre (a fraction of the face's width). */
const pointerAt = (mounted: MountedPci, type: string, angle: number, distance: number) => {
  const r = face(mounted).getBoundingClientRect();
  const rad = (angle * Math.PI) / 180;
  return new PointerEvent(type, {
    clientX: r.left + r.width / 2 + distance * r.width * Math.sin(rad),
    clientY: r.top + r.height / 2 - distance * r.width * Math.cos(rad),
    bubbles: true,
    composed: true,
    pointerId: 1,
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
    isPrimary: true,
  });
};

/**
 * Drags a hand: grabs it at angle `from` and moves it along `to` (one pointermove per angle). The short hand is grabbed
 * near the centre, the long hand further out (where both point the same way, that decides which one).
 */
async function dragHand(mounted: MountedPci, hand: "short" | "long", from: number, ...to: number[]) {
  const distance = hand === "short" ? 0.15 : 0.35;
  const el = face(mounted);
  el.dispatchEvent(pointerAt(mounted, "pointerdown", from, distance));
  for (const angle of to) {
    el.dispatchEvent(pointerAt(mounted, "pointermove", angle, distance));
    // a move goes on from the time the clock shows: a candidate's pointer is never faster than a paint, a test is
    await afterPaint();
  }
  el.dispatchEvent(pointerAt(mounted, "pointerup", to[to.length - 1] ?? from, distance));
  await waitFor(() => expect(handAngle(mounted, "long")).not.toBeNaN());
}

// ---- the digital clock: the time on the display, and arrows (setClock) to change the hours and minutes

const display = (mounted: MountedPci) =>
  Array.from(mounted.root.querySelectorAll("[data-digits]")) // not the dim "88" of an LCD screen
    .map((span) => span.textContent)
    .join(":");
/**
 * The arrows of the digital clock: hour up, hour down, minute up, minute down. Look them up again for every click: the
 * clock renders new buttons each time the time changes.
 */
const arrows = (mounted: MountedPci) => {
  const [hourUp, hourDown, minuteUp, minuteDown] = Array.from(mounted.root.querySelectorAll<HTMLButtonElement>("button"));
  return { hourUp, hourDown, minuteUp, minuteDown };
};

// ---- a clock that only shows the time (askTime, the default): it stands in for an image, the answer is given elsewhere
// in the item (a qti-text-entry-interaction), so the PCI has no field of its own and no response

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.getByRole("heading", { name: TITLE })).toBeInTheDocument();
    expect(canvas.getByText(QUESTION)).toBeInTheDocument();
    // an analog clock at the initial time (7:25): the long hand on the 5, the short hand just under halfway past the 7
    expect(face(mounted)).toBeInTheDocument();
    expect(handAngle(mounted, "short")).toBe(222.5);
    expect(handAngle(mounted, "long")).toBe(150);
    // nothing to fill in or to press: no text field, no arrows (those are for setting a digital clock)
    expect(canvas.queryByRole("textbox")).toBeNull();
    expect(mounted.root.querySelectorAll("button")).toHaveLength(0);
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const InitialTime: Story = {
  args: { properties: { initialtime: "4:10" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    // 4:10: the long hand on the 2 (60 degrees), the short hand a sixth past the 4 (125 degrees)
    expect(handAngle(mounted, "long")).toBe(60);
    expect(handAngle(mounted, "short")).toBe(125);
  },
};

export const HandsStayPutWhenAsked: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    // the student reads the clock, the hands cannot be moved
    await dragHand(mounted, "long", 150, 240);
    expect(handAngle(mounted, "long")).toBe(150);
    expect(mounted.pci.getResponse()).toBeUndefined();
  },
};

export const ShowDigital: Story = {
  args: { properties: { ...SHOW_DIGITAL, initialtime: "16:10" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    // a digital clock showing the time: no arrows, no text field, no response
    expect(display(mounted)).toBe("16:10");
    expect(mounted.root.querySelectorAll("button")).toHaveLength(0);
    expect(mounted.canvas.queryByRole("textbox")).toBeNull();
    expect(mounted.pci.getResponse()).toBeUndefined();
  },
};

/** Without a title and a question (the item has its own prompt) the clock is all there is. */
export const ClockOnly: Story = {
  args: { properties: { title: "", question: "" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.canvas.queryByRole("heading")).toBeNull();
    expect(mounted.root.querySelector("p")).toBeNull();
    expect(face(mounted)).toBeInTheDocument();
  },
};

/** A response or a correct response the player hands a clock that only shows the time changes nothing. */
export const ShownClockKeepsItsTime: Story = {
  args: { status: "solution", boundTo: { RESPONSE: time("04:10") }, responseDeclaration: { correctResponse: { value: "06:30" } } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    // still the initial time (7:25)
    expect(handAngle(mounted, "short")).toBe(222.5);
    expect(handAngle(mounted, "long")).toBe(150);
    expect(mounted.pci.getResponse()).toBeUndefined();
    mounted.pci.setResponse(time("04:10"));
    await afterPaint();
    expect(handAngle(mounted, "long")).toBe(150);
    expect(mounted.pci.getResponse()).toBeUndefined();
  },
};

// ---- answering by setting the analog clock (setClock)

export const SetAnalogClock: Story = {
  args: { properties: SET_ANALOG },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { pci } = mounted;
    // no text field: the clock is the answer, and an untouched clock is no answer
    expect(mounted.canvas.queryByRole("textbox")).toBeNull();
    expect(pci.getResponse()).toBeUndefined();

    await step("the long hand sets the minutes", async () => {
      await dragHand(mounted, "long", 0, 45, 90);
      expect(handAngle(mounted, "long")).toBe(90);
      expect(pci.getResponse()).toEqual(time("12:15"));
      expect(await lastChange(mounted)).toEqual(time("12:15"));
    });

    await step("past 12 the long hand moves the hour on, as on a real clock", async () => {
      await dragHand(mounted, "long", 90, 180, 270, 345, 30);
      expect(pci.getResponse()).toEqual(time("01:05"));
      expect(handAngle(mounted, "short")).toBe(32.5);
    });

    await step("the short hand sets the whole time, the long hand follows", async () => {
      await dragHand(mounted, "short", 32.5, 90, 120);
      expect(pci.getResponse()).toEqual(time("04:00"));
      expect(handAngle(mounted, "short")).toBe(120);
      expect(handAngle(mounted, "long")).toBe(0);
    });
  },
};

export const MinuteSteps: Story = {
  args: { properties: { ...SET_ANALOG, minutePerJumps: "15" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    // in steps of 15 minutes the long hand snaps to the quarters: 60 degrees (10 minutes) is closest to the 3
    await dragHand(mounted, "long", 0, 60);
    expect(handAngle(mounted, "long")).toBe(90);
    expect(mounted.pci.getResponse()).toEqual(time("12:15"));
  },
};

// ---- answering by setting the digital clock (setClock)

export const SetDigitalClock: Story = {
  args: { properties: SET_DIGITAL },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { pci } = mounted;
    const click = async (arrow: keyof ReturnType<typeof arrows>, times = 1) => {
      for (let i = 0; i < times; i++) await userEvent.click(arrows(mounted)[arrow]);
    };
    expect(display(mounted)).toBe("12:00");
    expect(mounted.canvas.queryByRole("textbox")).toBeNull();
    expect(pci.getResponse()).toBeUndefined();

    await step("the arrows change the hours and the minutes", async () => {
      await click("hourUp");
      expect(display(mounted)).toBe("13:00");
      expect(pci.getResponse()).toEqual(time("13:00")); // the 24-hour clock tells 13:00 from 1:00
      await click("minuteUp", 2);
      expect(display(mounted)).toBe("13:02");
      expect(pci.getResponse()).toEqual(time("13:02"));
    });

    await step("past the last value they start again at the first", async () => {
      await click("minuteDown", 3);
      expect(display(mounted)).toBe("13:59");
      await click("hourDown", 14);
      expect(display(mounted)).toBe("23:59");
      expect(pci.getResponse()).toEqual(time("23:59"));
    });
  },
};

export const DigitalMinuteSteps: Story = {
  args: { properties: { ...SET_DIGITAL, minutePerJumps: "5", initialtime: "8:00" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(display(mounted)).toBe("08:00");
    await userEvent.click(arrows(mounted).minuteUp);
    await userEvent.click(arrows(mounted).minuteUp);
    expect(display(mounted)).toBe("08:10");
    // the hour that was not touched is the one of the initial time
    expect(mounted.pci.getResponse()).toEqual(time("08:10"));
  },
};

export const TwelveHourDisplay: Story = {
  args: { properties: { ...SET_DIGITAL, twentyFourHour: "false", initialtime: "13:05" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(display(mounted)).toBe("01:05");
    await userEvent.click(arrows(mounted).hourDown);
    expect(display(mounted)).toBe("12:05");
    expect(mounted.pci.getResponse()).toEqual(time("12:05")); // a 12-hour clock: 01 to 12
  },
};

/** A response in the evening: the 24-hour digital clock keeps it, the analog clock shows it on 12 hours. */
export const EveningOnTheClocks: Story = {
  render: (args) => {
    const page = document.createElement("div");
    for (const [id, properties] of [["digital", SET_DIGITAL], ["analog", SET_ANALOG]] as const) {
      const slot = document.createElement("div");
      slot.dataset.slot = id;
      slot.appendChild(mountPci(pci, { ...args, properties, boundTo: { RESPONSE: time("19:35") } }));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const digital = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=digital]")!);
    const analog = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=analog]")!);
    expect(display(digital)).toBe("19:35");
    expect(digital.pci.getResponse()).toEqual(time("19:35"));
    expect(handAngle(analog, "long")).toBe(210);
    expect(analog.pci.getResponse()).toEqual(time("07:35"));
  },
};

// ---- what the player hands the PCI: a saved state, a bound response, the status

export const RestoreState: Story = {
  args: { properties: SET_ANALOG },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await dragHand(first, "short", 0, 60, 120);
    expect(first.pci.getResponse()).toEqual(time("04:00"));
    const state = first.pci.getState();

    const second = await remountPci(canvasElement, pci, { properties: SET_ANALOG, state });
    expect(second.pci.getResponse()).toEqual(time("04:00"));
    expect(handAngle(second, "short")).toBe(120);
  },
};

/** The state of a clock that was set is not for a clock that only shows the time. */
export const ShownClockIgnoresState: Story = {
  args: { properties: SET_ANALOG },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await dragHand(first, "short", 0, 60, 120);
    const state = first.pci.getState();

    const second = await remountPci(canvasElement, pci, { properties: { initialtime: "12:00" }, state });
    expect(handAngle(second, "short")).toBe(0);
    expect(second.pci.getResponse()).toBeUndefined();
  },
};

export const ForeignState: Story = {
  args: { properties: SET_ANALOG, state: JSON.stringify({ something: "else" }) },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(handAngle(mounted, "long")).toBe(0);
    expect(mounted.pci.getResponse()).toBeUndefined();
  },
};

export const BoundResponseOnTheClock: Story = {
  args: { properties: SET_DIGITAL, boundTo: { RESPONSE: time("04:10") } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(display(mounted)).toBe("04:10");
    expect(mounted.pci.getResponse()).toEqual(time("04:10"));
  },
};

export const SolutionOnTheClock: Story = {
  args: { status: "solution", properties: SET_ANALOG, responseDeclaration: { correctResponse: { value: "04:10" } } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(handAngle(mounted, "long")).toBe(60);
    expect(handAngle(mounted, "short")).toBe(125);
    expect(mounted.pci.getResponse()).toEqual(time("04:10"));
  },
};

export const Review: Story = {
  args: { status: "review", properties: SET_ANALOG, boundTo: { RESPONSE: time("04:10") } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    // read-only: dragging does not move the hands
    await dragHand(mounted, "long", 60, 90, 120);
    expect(handAngle(mounted, "long")).toBe(60);
    expect(mounted.pci.getResponse()).toEqual(time("04:10"));
  },
};

export const Validity: Story = {
  args: { properties: SET_ANALOG },
  play: async ({ canvasElement }) => {
    const { pci } = await openPci(canvasElement);
    expect(pci.checkValidity()).toBe(true);
    pci.setCustomValidity("Zet de klok op de goede tijd.");
    expect(pci.getCustomValidity()).toBe("Zet de klok op de goede tijd.");
    expect(pci.checkValidity()).toBe(false);
    pci.setCustomValidity("");
    expect(pci.checkValidity()).toBe(true);
  },
};

/** Two clocks on one page: each keeps its own time. */
export const TwoInstances: Story = {
  render: (args) => {
    const page = document.createElement("div");
    for (const id of ["first", "second"]) {
      const slot = document.createElement("div");
      slot.dataset.slot = id;
      slot.appendChild(mountPci(pci, { ...args, properties: id === "first" ? SET_ANALOG : SET_DIGITAL }));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=first]")!);
    const second = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=second]")!);
    expect(first.pci).not.toBe(second.pci);
    await dragHand(first, "long", 0, 45, 90);
    await userEvent.click(arrows(second).hourUp);
    expect(first.pci.getResponse()).toEqual(time("12:15"));
    expect(second.pci.getResponse()).toEqual(time("13:00"));
  },
};

// ---- the look (skins.tsx): the skin, and the colour, hands and font the author picked; the clock works the same in each

/** The stroke or fill of the rim of a drawn analog clock: the first circle of its face. */
const rim = (mounted: MountedPci) => face(mounted).querySelector("svg circle")!;
const numeral = (mounted: MountedPci, text: string) => Array.from(face(mounted).querySelectorAll("svg text")).find((t) => t.textContent === text)!;

export const LearningClock: Story = {
  args: { properties: { ...SET_ANALOG, skin: "learning", initialtime: "4:10" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.root.querySelector("img")).toBeNull(); // drawn, not the images of the classic clock
    expect(handAngle(mounted, "long")).toBe(60);
    expect(handAngle(mounted, "short")).toBe(125);
    await dragHand(mounted, "long", 60, 90);
    expect(mounted.pci.getResponse()).toEqual(time("04:15"));
  },
};

export const RomanNumerals: Story = {
  args: { properties: { ...SET_ANALOG, skin: "roman", initialtime: "12:00" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.canvas.getByText("XII")).toBeInTheDocument();
    await dragHand(mounted, "short", 0, 90);
    expect(mounted.pci.getResponse()).toEqual(time("03:00"));
  },
};

export const LcdScreen: Story = {
  args: { properties: { ...SET_DIGITAL, skin: "lcd", initialtime: "07:25" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.root.querySelector("img")).toBeNull(); // no photo of a clock radio
    expect(display(mounted)).toBe("07:25");
    await userEvent.click(arrows(mounted).minuteUp);
    expect(display(mounted)).toBe("07:26");
    expect(mounted.pci.getResponse()).toEqual(time("07:26"));
  },
};

/** A skin of the other type of clock, or one the PCI does not know: the classic clock. */
export const UnknownSkin: Story = {
  args: { properties: { ...SET_DIGITAL, skin: "roman" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.root.querySelector("img[alt=digital]")).toBeInTheDocument();
  },
};

export const ReviewDigital: Story = {
  args: { status: "review", properties: { ...SET_DIGITAL, skin: "alarm" }, boundTo: { RESPONSE: time("04:10") } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    // read-only: the arrows do nothing
    expect(arrows(mounted).hourUp).toBeDisabled();
    expect(display(mounted)).toBe("04:10");
  },
};

/** As it comes, the classic clock is a picture with its ornate hands: nothing is drawn. */
export const ClassicAsItComes: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(face(mounted).querySelector("svg")).toBeNull();
    expect(face(mounted).querySelectorAll("img")).toHaveLength(3); // the face and two hands
  },
};

export const ColouredClock: Story = {
  args: { properties: { ...SET_ANALOG, color: "#dc2626", initialtime: "4:10" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    // the classic face is drawn now, with a red rim; its own (ornate) hands are still the images
    expect(rim(mounted)).toHaveAttribute("stroke", "#dc2626");
    expect(numeral(mounted, "12")).toBeInTheDocument();
    expect(face(mounted).querySelectorAll("img")).toHaveLength(2);
    expect(handAngle(mounted, "long")).toBe(60);
    await dragHand(mounted, "long", 60, 90);
    expect(mounted.pci.getResponse()).toEqual(time("04:15"));
  },
};

export const ColouredSkins: Story = {
  render: (args) => {
    const page = document.createElement("div");
    for (const skin of ["learning", "roman"]) {
      const slot = document.createElement("div");
      slot.dataset.slot = skin;
      slot.appendChild(mountPci(pci, { ...args, properties: { skin, color: "#16A34A" } }));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const learning = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=learning]")!);
    const roman = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=roman]")!);
    expect(rim(learning)).toHaveAttribute("stroke", "#16a34a");
    expect(rim(roman)).toHaveAttribute("fill", "#16a34a");
  },
};

/** Every style of hands is set the same way: the face takes the pointer, whatever lies on it. */
export const HandStyles: Story = {
  render: (args) => {
    const page = document.createElement("div");
    for (const hands of ["ornate", "straight", "pointed", "arrow"]) {
      const slot = document.createElement("div");
      slot.dataset.slot = hands;
      slot.appendChild(mountPci(pci, { ...args, properties: { ...SET_ANALOG, hands } }));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    for (const hands of ["ornate", "straight", "pointed", "arrow"]) {
      const mounted = await openPci(canvasElement.querySelector<HTMLElement>(`[data-slot=${hands}]`)!);
      // only the hands change: the classic face is still its picture
      expect(face(mounted).querySelectorAll("img")).toHaveLength(hands === "ornate" ? 3 : 1);
      await dragHand(mounted, "long", 0, 45, 90);
      expect(handAngle(mounted, "long")).toBe(90);
      await dragHand(mounted, "short", 7.5, 60, 120);
      expect(mounted.pci.getResponse()).toEqual(time("04:00"));
    }
  },
};

/** A colour for each hand: drawn hands are drawn in it, an ornate hand is its image in that colour. */
export const HandColours: Story = {
  render: (args) => {
    const page = document.createElement("div");
    for (const hands of ["ornate", "straight"]) {
      const slot = document.createElement("div");
      slot.dataset.slot = hands;
      slot.appendChild(mountPci(pci, { ...args, properties: { ...SET_ANALOG, hands, shortHandColor: "#2563eb", longHandColor: "#dc2626" } }));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const open = (hands: string) => openPci(canvasElement.querySelector<HTMLElement>(`[data-slot=${hands}]`)!);
    const hand = (mounted: MountedPci, name: string) => face(mounted).querySelector<HTMLElement>(`[data-hand=${name}]`)!;

    const ornate = await open("ornate");
    expect(face(ornate).querySelectorAll("img")).toHaveLength(1); // only the face: the hands are no images now
    expect(getComputedStyle(hand(ornate, "short")).backgroundColor).toBe("rgb(37, 99, 235)");
    expect(getComputedStyle(hand(ornate, "long")).backgroundColor).toBe("rgb(220, 38, 38)");
    expect(getComputedStyle(hand(ornate, "long")).maskImage).toMatch(/^url\(/);

    const straight = await open("straight");
    expect(hand(straight, "short").querySelector("line")).toHaveAttribute("stroke", "#2563eb");
    expect(hand(straight, "long").querySelector("line")).toHaveAttribute("stroke", "#dc2626");

    // and they are set as any other hands
    for (const mounted of [ornate, straight]) {
      await dragHand(mounted, "long", 0, 45, 90);
      expect(mounted.pci.getResponse()).toEqual(time("12:15"));
    }
  },
};

/** One hand in a colour: the other keeps the colour of its skin. */
export const OneHandColour: Story = {
  args: { properties: { skin: "learning", longHandColor: "#16a34a" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const stroke = (name: string) => face(mounted).querySelector(`[data-hand=${name}] line`)!.getAttribute("stroke");
    expect(stroke("long")).toBe("#16a34a");
    expect(stroke("short")).toBe("#1d4ed8"); // the blue of the learning clock
  },
};

/** The ornate hands of the classic clock on another face. */
export const OrnateHandsOnALearningClock: Story = {
  args: { properties: { ...SET_ANALOG, skin: "learning", hands: "ornate" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(face(mounted).querySelectorAll("img")).toHaveLength(2);
    await dragHand(mounted, "long", 0, 30);
    expect(mounted.pci.getResponse()).toEqual(time("12:05"));
  },
};

export const NumeralFont: Story = {
  render: (args) => {
    const page = document.createElement("div");
    for (const skin of ["classic", "learning", "roman"]) {
      const slot = document.createElement("div");
      slot.dataset.slot = skin;
      slot.appendChild(mountPci(pci, { ...args, properties: { skin, font: "serif" } }));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    for (const skin of ["classic", "learning", "roman"]) {
      const mounted = await openPci(canvasElement.querySelector<HTMLElement>(`[data-slot=${skin}]`)!);
      expect(numeral(mounted, skin === "roman" ? "XII" : "12").getAttribute("font-family")).toMatch(/^'Times New Roman'/);
    }
  },
};

export const ColouredDigitalClocks: Story = {
  render: (args) => {
    const page = document.createElement("div");
    for (const skin of ["classic", "alarm", "lcd"]) {
      const slot = document.createElement("div");
      slot.dataset.slot = skin;
      slot.appendChild(mountPci(pci, { ...args, properties: { ...SET_DIGITAL, skin, color: "#2563eb" } }));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const open = (skin: string) => openPci(canvasElement.querySelector<HTMLElement>(`[data-slot=${skin}]`)!);
    // the clock radio of the classic skin is drawn in the colour, in place of its picture
    const classic = await open("classic");
    expect(classic.root.querySelector("img")).toBeNull();
    expect(classic.root.querySelector("svg rect[width='362']")).toHaveAttribute("fill", "#2563eb");
    // the other skins get the colour on their case
    for (const skin of ["alarm", "lcd"]) {
      const mounted = await open(skin);
      const digits = mounted.root.querySelector<HTMLElement>("[data-digits]")!;
      expect(getComputedStyle(digits.closest<HTMLElement>(".w-fit")!).backgroundColor).toBe("rgb(37, 99, 235)");
    }
    // and all of them still work
    await userEvent.click(arrows(classic).hourUp);
    expect(display(classic)).toBe("13:00");
  },
};

export const DigitFont: Story = {
  args: { properties: { ...SET_DIGITAL, skin: "lcd", font: "mono", initialtime: "07:25" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const digits = mounted.root.querySelector<HTMLElement>("[data-digits]")!;
    expect(getComputedStyle(digits).fontFamily).toMatch(/Courier New/);
    // plain digits have no segments: no dim "88" behind them
    expect(mounted.root.querySelector("[aria-hidden=true]")).toBeNull();
    expect(display(mounted)).toBe("07:25");
    await userEvent.click(arrows(mounted).minuteUp);
    expect(mounted.pci.getResponse()).toEqual(time("07:26"));
  },
};

/** A colour, hands or font the PCI does not know: the clock keeps what belongs to its skin. */
export const UnknownLook: Story = {
  args: { properties: { color: "tomato", hands: "wavy", shortHandColor: "blueish", font: "papyrus" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(face(mounted).querySelector("svg")).toBeNull();
    expect(face(mounted).querySelectorAll("img")).toHaveLength(3);
  },
};

// ---- authoring mode: the author picks the clock, its skin and its colour, hands and font (authoring.tsx)

const OWN_LOOK = { color: "", hands: "", shortHandColor: "", longHandColor: "", font: "" };

export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { initialtime: "4:10" } },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);
    const choice = (name: string) => canvas.getByRole("button", { name });
    const option = (group: string, name: string) =>
      Array.from(canvas.getByRole("radiogroup", { name: group }).querySelectorAll<HTMLElement>("[role=radio]")).find(
        (radio) => radio.getAttribute("aria-label") === name
      )!;

    await step("starts from the settings: the classic analog clock, with what belongs to it", async () => {
      expect(instance.getProperties()).toEqual({ typeOfClock: "analog", skin: "classic", ...OWN_LOOK });
      const [analogClassic, digitalClassic] = canvas.getAllByRole("button", { name: "Classic" });
      expect(analogClassic).toHaveAttribute("aria-pressed", "true");
      expect(digitalClassic).toHaveAttribute("aria-pressed", "false");
      expect(canvas.getAllByRole("button", { pressed: true })).toHaveLength(1);
      expect(canvas.getAllByRole("button")).toHaveLength(6);
      expect(option("Colour", "Of the clock")).toHaveAttribute("aria-checked", "true");
      expect(option("Font", "Of the clock")).toHaveAttribute("aria-checked", "true");
      // the hands of the classic clock are the ornate ones
      expect(option("Hands", "Ornate")).toHaveAttribute("aria-checked", "true");
    });

    await step("a colour, hands and a font", async () => {
      await userEvent.click(option("Colour", "Red"));
      await userEvent.click(option("Hands", "Arrows"));
      await userEvent.click(option("Font", "Serif"));
      expect(instance.getProperties()).toEqual({ ...OWN_LOOK, typeOfClock: "analog", skin: "classic", color: "#dc2626", hands: "arrow", font: "serif" });
      expect(option("Colour", "Red")).toHaveAttribute("aria-checked", "true");
      expect(option("Colour", "Of the clock")).toHaveAttribute("aria-checked", "false");
      expect(option("Hands", "Arrows")).toHaveAttribute("aria-checked", "true");
      expect(changes).toHaveLength(3);
      // the previews show them: no ornate hands left, and the classic face is drawn in red
      expect(canvasElement.querySelector(".tspci-authoring")!.shadowRoot!.querySelectorAll("img.pointer-events-none")).toHaveLength(0);
    });

    await step("back to what belongs to the clock", async () => {
      await userEvent.click(option("Colour", "Of the clock"));
      await userEvent.click(option("Font", "Of the clock"));
      expect(instance.getProperties()).toEqual({ ...OWN_LOOK, typeOfClock: "analog", skin: "classic", hands: "arrow" });
    });

    await step("a colour for each hand", async () => {
      await userEvent.click(option("Short hand", "Blue"));
      await userEvent.click(option("Long hand", "Red"));
      expect(instance.getProperties()).toMatchObject({ shortHandColor: "#2563eb", longHandColor: "#dc2626", color: "" });
      expect(option("Short hand", "Blue")).toHaveAttribute("aria-checked", "true");
      expect(option("Long hand", "Blue")).toHaveAttribute("aria-checked", "false");
      await userEvent.click(option("Long hand", "Of the clock"));
      expect(instance.getProperties()).toMatchObject({ shortHandColor: "#2563eb", longHandColor: "" });
    });

    await step("another skin keeps the look; hands that were not picked follow the skin", async () => {
      await userEvent.click(choice("Roman numerals"));
      expect(instance.getProperties()).toMatchObject({ skin: "roman", hands: "arrow" });
    });

    await step("a digital skin sets both settings, and has no hands", async () => {
      await userEvent.click(choice("Alarm clock"));
      expect(instance.getProperties()).toMatchObject({ typeOfClock: "digital", skin: "alarm" });
      expect(choice("Alarm clock")).toHaveAttribute("aria-pressed", "true");
      expect(option("Hands", "Arrows")).toBeDisabled();
      expect(option("Short hand", "Blue")).toBeDisabled();
      // what was picked for the hands is kept, for when the author goes back to an analog clock
      expect(instance.getProperties()).toMatchObject({ hands: "arrow", shortHandColor: "#2563eb" });
      expect(canvas.getByText("A digital clock has no hands.")).toBeInTheDocument();
    });

    await step("the previews show the item's initial time", async () => {
      expect(canvas.getAllByText("04").length).toBeGreaterThan(0);
    });
  },
};

/** The hands follow the skin until the author picks them. */
export const AuthoringHandsOfTheSkin: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { skin: "learning", color: "#123ABC" } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    const hands = (name: string) => canvas.getByRole("radiogroup", { name: "Hands" }).querySelector(`[aria-label=${name}]`)!;
    expect(hands("Straight")).toHaveAttribute("aria-checked", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Roman numerals" }));
    expect(hands("Pointed")).toHaveAttribute("aria-checked", "true");
    // a colour that is not one of the swatches is kept, and shown in the colour picker
    expect(instance.getProperties()).toEqual({ ...OWN_LOOK, typeOfClock: "analog", skin: "roman", color: "#123abc" });
    expect(canvas.getByLabelText("Colour: Other colour")).toHaveValue("#123abc");
  },
};

export const AuthoringModeDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { typeOfClock: "digital", skin: "lcd", font: "mono" } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("heading", { name: "Klok kiezen" })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "LCD-scherm" })).toHaveAttribute("aria-pressed", "true");
    expect(canvas.getByRole("radio", { name: "Vaste breedte" })).toHaveAttribute("aria-checked", "true");
    expect(canvas.getByRole("radiogroup", { name: "Wijzers" })).toBeInTheDocument();
    expect(instance.getProperties()).toEqual({ ...OWN_LOOK, typeOfClock: "digital", skin: "lcd", font: "mono" });
  },
};
