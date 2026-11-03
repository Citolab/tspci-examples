import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  afterPaint, focusedIn, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, type AuthoringArgs, type MountedPci, type PciArgs,
} from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Math entry",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

// The formula is a MathLive <math-field>. It takes the keyboard in a hidden "keyboard sink" in its own shadow root;
// MathLive reads a typed character from the input event of the sink, and keys such as Backspace from keydown. userEvent cannot reach that sink (it is pointer-events: none and nested two shadow roots deep), so `typeMath`
// sends those events to it.
type MathField = HTMLElement & {
  getValue(format?: string): string;
  readOnly: boolean;
  position: number;
  readonly lastOffset: number;
  getPromptRange(id: string): [number, number] | null;
  getPromptValue(id: string, format?: string): string;
  getPrompts(): string[];
};

const fieldOf = (root: MountedPci["root"]) => root.querySelector("math-field") as MathField;

const sinkOf = (mf: MathField) => mf.shadowRoot!.querySelector<HTMLElement>("[part=keyboard-sink]")!;

const keyInit = (key: string) => ({ key, code: key, bubbles: true, composed: true, cancelable: true });

// MathLive takes no new input right after one, and the PCI writes its response back into the field after the next
// paint: input that comes before then is lost. So every input waits a moment first, and every step is confirmed
// (`settled`) before the next one.
const pause = () => new Promise((resolve) => setTimeout(resolve, 100));

/** Waits until `check` passes, and the PCI has rendered what it checks (and so will not overwrite the next input). */
const settled = async (check: () => void) => {
  await waitFor(check);
  await afterPaint();
  check();
};

/** Types text in the field, character by character, as a keyboard does. */
const typeMath = async (mf: MathField, text: string) => {
  mf.focus();
  await pause();
  const sink = sinkOf(mf);
  for (const ch of text) {
    sink.dispatchEvent(new InputEvent("input", { inputType: "insertText", data: ch, bubbles: true, composed: true }));
  }
};

/** Presses a key such as Backspace in the field. */
const pressMath = async (mf: MathField, key: string) => {
  mf.focus();
  await pause();
  sinkOf(mf).dispatchEvent(new KeyboardEvent("keydown", keyInit(key)));
  sinkOf(mf).dispatchEvent(new KeyboardEvent("keyup", keyInit(key)));
};

/** Clicks a tool button, after the moment MathLive needs since the last input. */
const clickTool = async (canvas: MountedPci["canvas"], name: string) => {
  await pause();
  await userEvent.click(canvas.getByRole("button", { name }));
};

const toolNames = (root: MountedPci["root"]) =>
  [...root.querySelectorAll("[data-tool]")].map((b) => b.getAttribute("aria-label"));

const DEFAULT_TOOLS = [
  "Square root", "Fraction", "Exponent", "Left parenthesis", "Right parenthesis", "Pi",
  "Less than or equal to", "Greater than or equal to", "Times", "Divided by", "Plus or minus",
];

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root, pci } = mounted;
    const mf = fieldOf(root);

    await step("the prompt, the toolbar of the author's tools, the keyboard button and an empty field", async () => {
      expect(canvas.getByText("Solve for x: 3x + 5 = 2x − 7. Type your answer.")).toBeInTheDocument();
      expect(canvas.getByRole("toolbar", { name: "Math symbols" })).toBeInTheDocument();
      expect(canvas.getByRole("group", { name: "Functions" })).toBeInTheDocument();
      expect(toolNames(root)).toEqual(DEFAULT_TOOLS);
      expect(canvas.getByRole("button", { name: "Show the on-screen keyboard" })).toHaveAttribute("aria-pressed", "false");
      expect(mf).toHaveAttribute("aria-label", "Math input");
      expect(mf.readOnly).toBe(false);
      expect(mf.getValue("latex")).toBe("");
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("the formula typed is the response, as LaTeX", async () => {
      await typeMath(mf, "x=-12");
      await settled(() => expect(pci.getResponse()).toEqual({ base: { string: "x=-12" } }));
      expect(mf.getValue("latex")).toBe("x=-12");
      expect(await lastChange(mounted)).toEqual({ base: { string: "x=-12" } });
    });

    await step("Backspace takes back a character; an empty field is no response", async () => {
      await pressMath(mf, "Backspace");
      await settled(() => expect(pci.getResponse()).toEqual({ base: { string: "x=-1" } }));
      for (const left of ["x=-", "x=", "x"]) {
        await pressMath(mf, "Backspace");
        await settled(() => expect(pci.getResponse()).toEqual({ base: { string: left } }));
      }
      await pressMath(mf, "Backspace");
      await settled(() => expect(pci.getResponse()).toBeUndefined());
      expect(await lastChange(mounted)).toBeUndefined();
    });
  },
};

export const Tools: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root, pci } = mounted;
    const mf = fieldOf(root);

    await step("a fraction with empty slots: the response leaves them out, as the original's MathQuill", async () => {
      mf.focus();
      await clickTool(canvas, "Fraction");
      expect(await lastChange(mounted)).toEqual({ base: { string: "\\frac{}{}" } });
      await settled(() => expect(mf.getValue("latex")).toBe("\\frac{\\placeholder{}}{\\placeholder{}}"));
      // the caret is in the first slot: typing fills it
      await typeMath(mf, "1");
      await settled(() => expect(pci.getResponse()).toEqual({ base: { string: "\\frac{1}{}" } }));
    });

    await step("the square root takes what is left of the caret; exponents without braces around one character", async () => {
      pci.resetResponse();
      await waitFor(() => expect(mf.getValue("latex")).toBe(""));
      expect(pci.getResponse()).toBeUndefined();
      const response = (latex: string) => settled(() => expect(pci.getResponse()).toEqual({ base: { string: latex } }));
      /** the caret moves out of the square root or the exponent, to the end */
      const rightOut = async () => {
        await pressMath(mf, "ArrowRight");
        await settled(() => expect(mf.position).toBe(mf.lastOffset));
      };
      await typeMath(mf, "9");
      await response("9");
      await clickTool(canvas, "Square root");
      await response("\\sqrt{9}");
      await rightOut();
      await clickTool(canvas, "Times");
      await response("\\sqrt{9}\\times");
      await typeMath(mf, "x");
      await response("\\sqrt{9}\\times x");
      await clickTool(canvas, "Exponent");
      await settled(() => expect(mf.getValue("latex")).toBe("\\sqrt9\\times x^{\\placeholder{}}"));
      await typeMath(mf, "2");
      await response("\\sqrt{9}\\times x^2");
      await rightOut();
      await clickTool(canvas, "Plus or minus");
      await response("\\sqrt{9}\\times x^2\\pm");
      await clickTool(canvas, "Pi");
      await response("\\sqrt{9}\\times x^2\\pm\\pi");
    });
  },
};

export const ToolbarKeyboard: Story = {
  play: async ({ canvasElement }) => {
    const { root } = await openPci(canvasElement);
    const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-tool]")];
    // one tab stop
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, ...Array(buttons.length - 1).fill(-1)]);
    const key = (target: HTMLElement, k: string) => target.dispatchEvent(new KeyboardEvent("keydown", keyInit(k)));
    key(buttons[0], "ArrowRight");
    await waitFor(() => expect(buttons[1].tabIndex).toBe(0));
    expect(buttons[0].tabIndex).toBe(-1);
    expect(focusedIn(root)).toBe(buttons[1]);
    key(buttons[1], "End");
    await waitFor(() => expect(focusedIn(root)).toBe(buttons[buttons.length - 1]));
    // past the end: back to the first
    key(buttons[buttons.length - 1], "ArrowRight");
    await waitFor(() => expect(focusedIn(root)).toBe(buttons[0]));
    key(buttons[0], "ArrowLeft");
    await waitFor(() => expect(focusedIn(root)).toBe(buttons[buttons.length - 1]));
    key(buttons[buttons.length - 1], "Home");
    await waitFor(() => expect(focusedIn(root)).toBe(buttons[0]));
  },
};

export const OnScreenKeyboardButton: Story = {
  play: async ({ canvasElement }) => {
    // MathLive's on-screen keyboard belongs to the top window: in the (framed) test page it is a proxy that shows
    // nothing, so this checks the PCI's own button only
    const { canvas, pci } = await openPci(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Show the on-screen keyboard" }));
    const hide = canvas.getByRole("button", { name: "Hide the on-screen keyboard" });
    expect(hide).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(hide);
    expect(canvas.getByRole("button", { name: "Show the on-screen keyboard" })).toHaveAttribute("aria-pressed", "false");
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const ToolSettings: Story = {
  args: { properties: { tool_sqrt: "false", tool_frac: "false", tool_sin: "true", tool_matrix_2row: "true", tool_lower: "true" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root, pci } = mounted;
    // in the original's groups and order
    expect(toolNames(root)).toEqual([
      "Exponent", "Left parenthesis", "Right parenthesis", "Pi", "Sine", "Less than", "Less than or equal to",
      "Greater than or equal to", "Times", "Divided by", "Plus or minus", "Matrix with 2 rows",
    ]);
    expect(canvas.queryByRole("button", { name: "Fraction" })).toBeNull();
    fieldOf(root).focus();
    await clickTool(canvas, "Matrix with 2 rows");
    await lastChange(mounted);
    await afterPaint();
    await typeMath(fieldOf(root), "1");
    await settled(() => expect(pci.getResponse()).toEqual({ base: { string: "\\begin{matrix}1\\\\ \\end{matrix}" } }));
  },
};

export const WhiteSpace: Story = {
  args: { properties: { authorizeWhiteSpace: "true" } },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await typeMath(fieldOf(first.root), "a b");
    // the space bar types a space
    await settled(() => expect(first.pci.getResponse()).toEqual({ base: { string: "a\\:b" } }));

    // by default it is ignored in math
    const second = await remountPci(canvasElement, pci, {});
    await typeMath(fieldOf(second.root), "a b");
    await settled(() => expect(second.pci.getResponse()).toEqual({ base: { string: "ab" } }));
  },
};

export const NoTools: Story = {
  args: {
    properties: Object.fromEntries(
      ["sqrt", "frac", "exp", "lparen", "rparen", "pi", "lte", "gte", "times", "divide", "plusminus"].map((t) => [`tool_${t}`, "false"])
    ),
  },
  play: async ({ canvasElement }) => {
    const { canvas, root } = await openPci(canvasElement);
    expect(canvas.queryByRole("toolbar")).toBeNull();
    expect(toolNames(root)).toEqual([]);
    // the keyboard button stays
    expect(canvas.getByRole("button", { name: "Show the on-screen keyboard" })).toBeInTheDocument();
  },
};

export const GapMode: Story = {
  args: { properties: { useGapExpression: "true", gapStyle: "math-gap-large" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root, pci } = mounted;
    const mf = fieldOf(root);

    await step("the author's expression, read only, with two gaps", async () => {
      expect(mf).toHaveAttribute("aria-label", "Expression with gaps to fill in");
      expect(mf.readOnly).toBe(true);
      expect(mf.getPrompts()).toEqual(["gap0", "gap1"]);
      expect(root.querySelector("[data-gap-size]")).toHaveAttribute("data-gap-size", "gap-large");
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("a tool goes into the first gap; the response is the gaps as a JSON array", async () => {
      mf.focus();
      await clickTool(canvas, "Pi");
      expect(await lastChange(mounted)).toEqual({ base: { string: '["\\\\pi",""]' } });
      await settled(() => expect(mf.getPromptValue("gap0", "latex")).toBe("\\pi"));
    });

    await step("typing in the second gap", async () => {
      // Tab goes to the next gap
      await pressMath(mf, "Tab");
      await settled(() => {
        const [start, end] = mf.getPromptRange("gap1")!;
        expect(mf.position).toBeGreaterThanOrEqual(start);
        expect(mf.position).toBeLessThanOrEqual(end);
      });
      await typeMath(mf, "15");
      await settled(() => expect(pci.getResponse()).toEqual({ base: { string: '["\\\\pi","15"]' } }));
    });

    await step("a response handed back fills the gaps", async () => {
      pci.setResponse({ base: { string: '["8","15"]' } });
      await waitFor(() => expect(mf.getPromptValue("gap0", "latex")).toBe("8"));
      expect(mf.getPromptValue("gap1", "latex")).toBe("15");
      expect(pci.getResponse()).toEqual({ base: { string: '["8","15"]' } });
    });
  },
};

export const GapModeCommaSeparated: Story = {
  args: {
    properties: { useGapExpression: "true", gapResponseIsJson: "false", gapExpression: "\\taoGap+\\taoGap\\taoBr=\\taoGap" },
    boundTo: { RESPONSE: { base: { string: "1,,3" } } },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const mf = fieldOf(mounted.root);
    // the line break is an array of lines
    expect(mf.getValue("latex")).toMatch(/^\\begin\{array\}\{l\}/);
    expect(mf.getPromptValue("gap0", "latex")).toBe("1");
    expect(mf.getPromptValue("gap1", "latex")).toBe("");
    expect(mf.getPromptValue("gap2", "latex")).toBe("3");
    expect(mounted.pci.getResponse()).toEqual({ base: { string: "1,,3" } });
    expect(mounted.changes).toHaveLength(0);
  },
};

export const GapModeWithoutGaps: Story = {
  args: { properties: { useGapExpression: "true", gapExpression: "x+1" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("note")).toHaveTextContent("This expression has no gaps to fill in.");
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const AmbiguousSymbols: Story = {
  play: async ({ canvasElement }) => {
    const { pci, root } = await openPci(canvasElement);
    // full-width digits and dashes that look like a minus are reported as ASCII
    pci.setResponse({ base: { string: "x=−１２" } });
    expect(pci.getResponse()).toEqual({ base: { string: "x=-12" } });
    await waitFor(() => expect(fieldOf(root).getValue("latex")).not.toBe(""));
    // an empty response clears the field
    pci.setResponse({ base: { string: "" } });
    expect(pci.getResponse()).toBeUndefined();
    await waitFor(() => expect(fieldOf(root).getValue("latex")).toBe(""));
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", prompt: "Los op." } },
  play: async ({ canvasElement }) => {
    const { canvas, root } = await openPci(canvasElement);
    expect(canvas.getByText("Los op.")).toBeInTheDocument();
    expect(canvas.getByRole("toolbar", { name: "Wiskundige symbolen" })).toBeInTheDocument();
    expect(canvas.getByRole("group", { name: "Functies" })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Wortel" })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Breuk" })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Schermtoetsenbord tonen" })).toBeInTheDocument();
    expect(fieldOf(root)).toHaveAttribute("aria-label", "Wiskundige invoer");
  },
};

export const Review: Story = {
  args: { status: "review", boundTo: { RESPONSE: { base: { string: "x=-12" } } } },
  play: async ({ canvasElement }) => {
    const { canvas, root, pci } = await openPci(canvasElement);
    const mf = fieldOf(root);
    expect(canvas.queryByRole("toolbar")).toBeNull();
    expect(canvas.queryByRole("button", { name: "Show the on-screen keyboard" })).toBeNull();
    expect(mf.readOnly).toBe(true);
    expect(root.querySelector(".math-host")).toHaveClass("read-only");
    expect(mf.getValue("latex")).toBe("x=-12");
    // typing does nothing
    await typeMath(mf, "3");
    await pause();
    expect(pci.getResponse()).toEqual({ base: { string: "x=-12" } });
  },
};

export const ReviewModeSetting: Story = {
  args: { properties: { isReviewMode: "true" } },
  play: async ({ canvasElement }) => {
    const { canvas, root } = await openPci(canvasElement);
    expect(canvas.queryByRole("toolbar")).toBeNull();
    expect(fieldOf(root).readOnly).toBe(true);
  },
};

export const Solution: Story = {
  args: {
    status: "solution",
    boundTo: { RESPONSE: { base: { string: "x=5" } } },
    responseDeclaration: { correctResponse: { value: ["x=-12"] } },
  },
  play: async ({ canvasElement }) => {
    const { root, pci, changes } = await openPci(canvasElement);
    // the correct response is shown on top of the candidate's
    expect(pci.getResponse()).toEqual({ base: { string: "x=-12" } });
    await waitFor(() => expect(fieldOf(root).getValue("latex")).toBe("x=-12"));
    expect(fieldOf(root).readOnly).toBe(true);
    expect(changes).toHaveLength(0);
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await typeMath(fieldOf(first.root), "2x+1");
    await settled(() => expect(first.pci.getResponse()).toEqual({ base: { string: "2x+1" } }));
    const state = first.pci.getState();
    expect(JSON.parse(state).state).toEqual({ latex: "2x+1", gaps: [] });

    const second = await remountPci(canvasElement, pci, { state });
    expect(fieldOf(second.root).getValue("latex")).toBe("2x+1");
    expect(second.pci.getResponse()).toEqual({ base: { string: "2x+1" } });
    // the candidate goes on where they were
    await typeMath(fieldOf(second.root), "0");
    await settled(() => expect(second.pci.getResponse()).toEqual({ base: { string: "2x+10" } }));

    // the original's state: { response }
    const third = await remountPci(canvasElement, pci, { state: JSON.stringify({ response: { base: { string: "y=3" } } }) });
    expect(third.pci.getResponse()).toEqual({ base: { string: "y=3" } });
    expect(fieldOf(third.root).getValue("latex")).toBe("y=3");
  },
};

export const ResetResponse: Story = {
  args: { boundTo: { RESPONSE: { base: { string: "a+b" } } } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(fieldOf(mounted.root).getValue("latex")).toBe("a+b");
    expect(mounted.changes).toHaveLength(0);
    mounted.pci.resetResponse();
    expect(mounted.pci.getResponse()).toBeUndefined();
    expect(await lastChange(mounted)).toBeUndefined();
    await waitFor(() => expect(fieldOf(mounted.root).getValue("latex")).toBe(""));
  },
};

// Authoring mode: an authoring system calls getAuthoringInstance instead of getInstance

export const Authoring: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  play: async ({ canvasElement }) => {
    const { instance, root, canvas, changes } = await openAuthoring(canvasElement);
    const mf = fieldOf(root);
    expect(canvas.getByRole("heading", { name: "Expression with gaps" })).toBeInTheDocument();
    expect(mf).toHaveAttribute("aria-label", "Expression with gaps");
    expect(canvas.getByTestId("gap-count")).toHaveTextContent("2 gaps");
    // the candidate does not see the expression while gap mode is off
    expect(canvas.getByRole("note")).toHaveTextContent('Gap mode is off: turn on "Use an expression with gaps"');
    expect(instance.getProperties()).toEqual({ gapExpression: "x^2+\\taoGap x+\\taoGap=(x+3)(x+5)" });
    expect(instance.validate()).toEqual([]);

    // a third gap at the end
    mf.focus();
    await pressMath(mf, "End");
    await settled(() => expect(mf.position).toBe(mf.lastOffset));
    await clickTool(canvas, "Insert gap");
    await waitFor(() => expect(canvas.getByTestId("gap-count")).toHaveTextContent("3 gaps"));
    expect(instance.getProperties().gapExpression.match(/\\taoGap/g)).toHaveLength(3);
    expect(instance.getProperties().gapExpression).toMatch(/^x\^2\+\\taoGap x\+\\taoGap=\(x\+3\)\(x\+5\)\\taoGap/);
    expect(changes.length).toBeGreaterThan(0);
  },
};

export const AuthoringWithoutGaps: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { gapExpression: "x+1", useGapExpression: "true" } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("heading", { name: "Uitdrukking met open plekken" })).toBeInTheDocument();
    expect(canvas.getByTestId("gap-count")).toHaveTextContent("0 open plekken");
    // gap mode is on: no note
    expect(canvas.queryByRole("note")).toBeNull();
    expect(instance.validate()).toEqual(["Zet minstens één open plek in de uitdrukking."]);
    await userEvent.click(canvas.getByRole("button", { name: "Open plek invoegen" }));
    await waitFor(() => expect(canvas.getByTestId("gap-count")).toHaveTextContent("1 open plek"));
    expect(instance.validate()).toEqual([]);
  },
};


