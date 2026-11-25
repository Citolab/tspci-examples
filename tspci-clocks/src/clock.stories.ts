import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { afterPaint, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
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
 * The response: the time as "HH:MM". On a 12-hour clock (analog, in words, digital without the 24-hour setting) from
 * 01:00 to 12:59, so 16:10 is "04:10"; on the 24-hour digital clock (the default) from 00:00 to 23:59.
 */
const time = (hhmm: string) => ({ base: { string: hhmm } });

// Setting the clock starts at 12:00 (not the default 7:25), so the hands start straight up and the arithmetic stays simple.
const SET_ANALOG = { typeOfQuestion: "setClock", typeOfClock: "analog", initialtime: "12:00" };
const SET_DIGITAL = { typeOfQuestion: "setClock", typeOfClock: "digital", initialtime: "12:00" };
const ASK_DIGITAL = { typeOfQuestion: "askTime", typeOfClock: "digital" };

// ---- the analog clock: its face takes the pointer, the hands are images rotated from 12 o'clock

const face = (mounted: MountedPci) => mounted.root.querySelector<HTMLElement>(".touch-none")!;
/**
 * The rotation of a hand in degrees: the short hand is the first hand, the long hand the second. In the classic skin
 * the hands are images rotated with CSS, in a drawn skin (skins.tsx) SVG shapes with a rotate() transform.
 */
const handAngle = (mounted: MountedPci, hand: "short" | "long") => {
  const images = Array.from(face(mounted).querySelectorAll<HTMLImageElement>("img.pointer-events-none"));
  const transforms = images.length
    ? images.map((img) => img.style.transform)
    : Array.from(face(mounted).querySelectorAll("svg [transform^=rotate]")).map((el) => el.getAttribute("transform")!);
  const degrees = Number(/rotate\(([-\d.]+)(deg)?\)/.exec(transforms[hand === "short" ? 0 : 1])?.[1]);
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
  Array.from(mounted.root.querySelectorAll(".font-digital:not([aria-hidden])")) // not the dim "88" of an LCD screen
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

const textAnswer = (mounted: MountedPci) => mounted.canvas.getByRole("textbox") as HTMLInputElement;

// ---- answering in words (askTime, the default), with the analog clock

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
    // and an empty text field; no arrows (those are for setting a digital clock)
    expect(textAnswer(mounted)).toHaveValue("");
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

export const AnswerInWords: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { pci } = mounted;

    await step("a time in words is HH:MM on a 12-hour clock", async () => {
      await userEvent.type(textAnswer(mounted), "ten past four");
      expect(pci.getResponse()).toEqual(time("04:10"));
      expect(await lastChange(mounted)).toEqual(time("04:10"));
    });

    await step("every way of writing the same time is the same response", async () => {
      for (const text of ["4:10", "16:10", "four ten", "It's ten past 4 in the afternoon."]) {
        await retype(textAnswer(mounted), text);
        expect(pci.getResponse()).toEqual(time("04:10"));
      }
      await retype(textAnswer(mounted), "half past six");
      expect(pci.getResponse()).toEqual(time("06:30"));
      await retype(textAnswer(mounted), "quarter to twelve");
      expect(pci.getResponse()).toEqual(time("11:45"));
    });

    await step("text that is no time is no response", async () => {
      await retype(textAnswer(mounted), "teatime");
      expect(pci.getResponse()).toBeUndefined();
      await retype(textAnswer(mounted), "{Backspace}");
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const AnswerInDutch: Story = {
  args: { properties: { language: "nl" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { pci } = mounted;
    // "half zeven" is half an hour before seven
    await userEvent.type(textAnswer(mounted), "half zeven");
    expect(pci.getResponse()).toEqual(time("06:30"));
    await retype(textAnswer(mounted), "vijf voor half drie");
    expect(pci.getResponse()).toEqual(time("02:25"));
    await retype(textAnswer(mounted), "kwart over drie");
    expect(pci.getResponse()).toEqual(time("03:15"));
  },
};

export const HandsStayPutWhenAsked: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    // askTime: the student reads the clock, the hands cannot be moved
    await dragHand(mounted, "long", 150, 240);
    expect(handAngle(mounted, "long")).toBe(150);
    expect(mounted.pci.getResponse()).toBeUndefined();
  },
};

export const AskDigital: Story = {
  args: { properties: { ...ASK_DIGITAL, initialtime: "16:10" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    // a digital clock showing the time, no arrows, a text field
    expect(display(mounted)).toBe("16:10");
    expect(mounted.root.querySelectorAll("button")).toHaveLength(0);
    await userEvent.type(textAnswer(mounted), "ten past four");
    expect(mounted.pci.getResponse()).toEqual(time("04:10"));
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

export const RestoreText: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.type(textAnswer(first), "half past six");
    const state = first.pci.getState();

    const second = await remountPci(canvasElement, pci, { state });
    expect(textAnswer(second)).toHaveValue("half past six");
    expect(second.pci.getResponse()).toEqual(time("06:30"));
  },
};

export const ForeignState: Story = {
  args: { state: JSON.stringify({ something: "else" }) },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(textAnswer(mounted)).toHaveValue("");
    expect(mounted.pci.getResponse()).toBeUndefined();
  },
};

export const BoundResponseInWords: Story = {
  args: { boundTo: { RESPONSE: time("04:10") } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(textAnswer(mounted)).toHaveValue("ten past four");
    expect(mounted.pci.getResponse()).toEqual(time("04:10"));
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

export const SolutionInWords: Story = {
  // a correct response from the item's XML is a string
  args: { status: "solution", properties: { language: "nl" }, responseDeclaration: { correctResponse: { value: "06:30" } } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(textAnswer(mounted)).toHaveValue("half zeven");
    expect(textAnswer(mounted)).toHaveAttribute("readonly");
    expect(mounted.pci.getResponse()).toEqual(time("06:30"));
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
  play: async ({ canvasElement }) => {
    const { pci } = await openPci(canvasElement);
    expect(pci.checkValidity()).toBe(true);
    pci.setCustomValidity("Schrijf de tijd op.");
    expect(pci.getCustomValidity()).toBe("Schrijf de tijd op.");
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

// ---- skins (skins.tsx): how the clock looks; it works the same in every skin

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

// ---- authoring mode: the author picks the clock and its skin (authoring.tsx)

export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { initialtime: "4:10" } },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);
    const choice = (name: string) => canvas.getByRole("button", { name });

    await step("starts from the settings: the classic analog clock", async () => {
      expect(instance.getProperties()).toEqual({ typeOfClock: "analog", skin: "classic" });
      const [analogClassic, digitalClassic] = canvas.getAllByRole("button", { name: "Classic" });
      expect(analogClassic).toHaveAttribute("aria-pressed", "true");
      expect(digitalClassic).toHaveAttribute("aria-pressed", "false");
      expect(canvas.getAllByRole("button", { pressed: true })).toHaveLength(1);
      expect(canvas.getAllByRole("button")).toHaveLength(6);
    });

    await step("a digital skin sets both settings", async () => {
      await userEvent.click(choice("Alarm clock"));
      expect(instance.getProperties()).toEqual({ typeOfClock: "digital", skin: "alarm" });
      expect(choice("Alarm clock")).toHaveAttribute("aria-pressed", "true");
      expect(changes).toHaveLength(1);
    });

    await step("the previews show the item's initial time", async () => {
      expect(canvas.getAllByText("04").length).toBeGreaterThan(0);
    });
  },
};

export const AuthoringModeDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { typeOfClock: "digital", skin: "lcd" } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("heading", { name: "Klok kiezen" })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "LCD-scherm" })).toHaveAttribute("aria-pressed", "true");
    expect(instance.getProperties()).toEqual({ typeOfClock: "digital", skin: "lcd" });
  },
};

