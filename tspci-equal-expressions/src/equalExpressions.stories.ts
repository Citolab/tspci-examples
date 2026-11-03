import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, fireEvent, userEvent, waitFor } from "storybook/test";
import { lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, type AuthoringArgs, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Equal expressions",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

/** The table, row by row (tries, then each expression), as the candidate reads it: the header, then every cell. */
const table = (root: ShadowRoot | HTMLElement) =>
  [...root.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent));

/** The expressions' row headers, as a screen reader reads them (the image is read by its alt text). */
const expressionHeaders = (root: ShadowRoot | HTMLElement) =>
  [...root.querySelectorAll("tbody tr th")].slice(1).map((th) =>
    [...th.querySelectorAll("span, img, sup")]
      .filter((e) => !e.querySelector("span, img, sup") && !e.closest('[aria-hidden="true"]'))
      .map((e) => (e.tagName === "IMG" ? `[${e.getAttribute("alt")}]` : e.textContent))
      .join("")
  );

/**
 * Types a number in the input. (Harness limitation: user-event never sees the input in the shadow root get focus, so it
 * does not notice the PCI emptying it after a try and would type after the previous number: "5", then "7" gives "57".
 * So the text is put in the input as the browser does on typing, with an input event.)
 */
const typeNumber = (input: HTMLElement, text: string) => {
  fireEvent.input(input, { target: { value: text } });
};

const tryNumber = async (canvas: Awaited<ReturnType<typeof openPci>>["canvas"], text: string, button = "Calculate") => {
  typeNumber(canvas.getByRole("textbox"), text);
  await userEvent.click(canvas.getByRole("button", { name: button }));
};

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;

    await step("both expressions with the apple for the unknown, an empty table and no response", async () => {
      expect(canvas.getByRole("textbox", { name: "Number for the apple" })).toHaveValue("");
      expect(expressionHeaders(root)).toEqual(["Expression 1: [apple]×12+3", "Expression 2: [apple]×4+59"]);
      await waitFor(() => expect(table(root)).toEqual([["", "", "", ""], ["", "", "", ""], ["", "", "", ""]]));
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("a try is calculated with both expressions", async () => {
      await tryNumber(canvas, "5");
      await waitFor(() => expect(table(root)).toEqual([["5", "", "", ""], ["63", "", "", ""], ["79", "", "", ""]]));
      expect(canvas.getByRole("textbox")).toHaveValue("");
      expect(pci.getResponse()).toEqual({ list: { float: [5] } });
      expect(await lastChange(mounted)).toEqual({ list: { float: [5] } });
    });

    await step("the newest try comes first in the table, the response is oldest first", async () => {
      // Enter in the input calculates too
      typeNumber(canvas.getByRole("textbox"), "7");
      await userEvent.type(canvas.getByRole("textbox"), "{Enter}");
      await waitFor(() => expect(table(root)).toEqual([["7", "5", "", ""], ["87", "63", "", ""], ["87", "79", "", ""]]));
      expect(pci.getResponse()).toEqual({ list: { float: [5, 7] } });
      // not marked as equal: highlightEqual is off by default
      expect(canvas.queryByRole("img", { name: "Same result" })).toBeNull();
    });

    await step("a number tried again moves to the front (once in the table and the response)", async () => {
      await tryNumber(canvas, "5");
      await waitFor(() => expect(table(root)[0]).toEqual(["5", "7", "", ""]));
      expect(pci.getResponse()).toEqual({ list: { float: [7, 5] } });
    });

    await step("more tries than columns add columns", async () => {
      for (const n of ["1", "2", "3"]) await tryNumber(canvas, n);
      await waitFor(() => expect(table(root)[0]).toEqual(["3", "2", "1", "5", "7"]));
      expect(pci.getResponse()).toEqual({ list: { float: [7, 5, 1, 2, 3] } });
    });
  },
};

export const Validation: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci, root } = await openPci(canvasElement);
    const input = canvas.getByRole("textbox");

    await tryNumber(canvas, "abc");
    expect(canvas.getByRole("alert")).toHaveTextContent("Type a number, such as 10.");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(pci.getResponse()).toBeUndefined();
    // typing again takes the message away
    await userEvent.type(input, "{Backspace}");
    expect(canvas.getByRole("alert", { hidden: true })).toHaveTextContent("");
    expect(input).toHaveAttribute("aria-invalid", "false");

    // a decimal comma, a decimal point and a minus sign are numbers
    await tryNumber(canvas, "2,5");
    await tryNumber(canvas, "−1.25");
    expect(pci.getResponse()).toEqual({ list: { float: [2.5, -1.25] } });
    // 12 × −1.25 + 3 = −12, 4 × −1.25 + 59 = 54
    await waitFor(() => expect(table(root)).toEqual([["-1.25", "2.5", "", ""], ["-12", "33", "", ""], ["54", "69", "", ""]]));
  },
};

export const HighlightEqual: Story = {
  args: { properties: { highlightEqual: "true", columns: "2" } },
  play: async ({ canvasElement }) => {
    const { canvas, root } = await openPci(canvasElement);
    await waitFor(() => expect(table(root)[0]).toEqual(["", ""]));
    await tryNumber(canvas, "6");
    await waitFor(() => expect(table(root)[0]).toEqual(["6", ""]));
    expect(canvas.queryByRole("img", { name: "Same result" })).toBeNull();
    await tryNumber(canvas, "7");
    const check = await canvas.findByRole("img", { name: "Same result" });
    // the check is in the cell of 7, not of 6
    expect(check.closest("td")).toHaveTextContent("7");
    expect(canvas.getAllByRole("img", { name: "Same result" })).toHaveLength(1);
  },
};

export const OwnExpressions: Story = {
  args: { properties: { expression1: "2(? - 1)^2", expression2: "12 / ?", image: "pear", columns: "1" } },
  play: async ({ canvasElement }) => {
    const { canvas, root } = await openPci(canvasElement);
    expect(canvas.getByRole("textbox", { name: "Number for the pear" })).toBeInTheDocument();
    // "2(" is 2 × (; the power is shown as a superscript; ÷ for division
    expect(expressionHeaders(root)).toEqual(["Expression 1: 2×([pear]−1)2", "Expression 2: 12÷[pear]"]);
    expect(root.querySelector("sup")).toHaveTextContent("2");
    await tryNumber(canvas, "4");
    await tryNumber(canvas, "0");
    // 12 / 0 has no result
    await waitFor(() => expect(table(root)).toEqual([["0", "4"], ["2", "18"], ["–", "3"]]));
  },
};

export const InvalidExpression: Story = {
  args: { properties: { expression2: "? + * 3" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci, root } = await openPci(canvasElement);
    expect(canvas.getByText("Expression 2 cannot be calculated: unexpected *.")).toBeInTheDocument();
    await tryNumber(canvas, "1");
    await waitFor(() => expect(table(root)).toEqual([["1", "", "", ""], ["15", "", "", ""], ["–", "", "", ""]]));
    // a try still counts
    expect(pci.getResponse()).toEqual({ list: { float: [1] } });
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", image: "iceCream", expression2: "? : 2 + 1" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci, root } = await openPci(canvasElement);
    expect(canvas.getByRole("table", { name: "Jouw pogingen, de nieuwste eerst" })).toBeInTheDocument();
    expect(expressionHeaders(root)).toEqual(["Som 1: [ijsje]×12+3", "Som 2: [ijsje]:2+1"]);
    await tryNumber(canvas, "1,5", "Bereken");
    await waitFor(() => expect(table(root)).toEqual([["1,5", "", "", ""], ["21", "", "", ""], ["1,75", "", "", ""]]));
    expect(pci.getResponse()).toEqual({ list: { float: [1.5] } });
    await tryNumber(canvas, "een", "Bereken");
    expect(canvas.getByRole("alert")).toHaveTextContent("Typ een getal, bijvoorbeeld 10.");
    expect(canvas.getByRole("textbox", { name: "Getal voor de ijsje" })).toBeInTheDocument();
  },
};

const STAR = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5"/></svg>')}`;

export const OwnImage: Story = {
  args: { properties: { customImage: STAR, imageName: "dot", image: "pear" } },
  play: async ({ canvasElement, step }) => {
    const { canvas, root } = await openPci(canvasElement);
    await step("an own image goes before the chosen one, with the name given", async () => {
      expect(canvas.getByRole("textbox", { name: "Number for the dot" })).toBeInTheDocument();
      const images = [...root.querySelectorAll("img")];
      expect(images.length).toBeGreaterThan(0);
      for (const img of images) expect(img).toHaveAttribute("src", STAR);
    });
  },
};

export const ImageInMarkup: Story = {
  // an authoring system with a media bank puts the author's image in qti-interaction-markup
  render: (args) => {
    const host = mountPci(pci, args);
    host.innerHTML = `<img src="${STAR}" alt="the star">`;
    return host;
  },
  args: { properties: { customImage: "data:image/png;base64,AAAA" } },
  play: async ({ canvasElement }) => {
    const { canvas, root } = await openPci(canvasElement);
    expect(canvas.getByRole("textbox", { name: "Number for the the star" })).toBeInTheDocument();
    expect(root.querySelector("img")).toHaveAttribute("src", STAR);
  },
};

export const Review: Story = {
  args: { status: "review", boundTo: { RESPONSE: { list: { float: [3, 7] } } } },
  play: async ({ canvasElement }) => {
    const { canvas, root, pci } = await openPci(canvasElement);
    await waitFor(() => expect(table(root)[0]).toEqual(["7", "3", "", ""]));
    expect(canvas.getByRole("textbox")).toBeDisabled();
    expect(canvas.getByRole("button", { name: "Calculate" })).toBeDisabled();
    expect(pci.getResponse()).toEqual({ list: { float: [3, 7] } });
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: { list: { integer: [2, 4] } } } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { root, pci } = mounted;
    await waitFor(() => expect(table(root)).toEqual([["4", "2", "", ""], ["51", "27", "", ""], ["75", "67", "", ""]]));
    expect(pci.getResponse()).toEqual({ list: { float: [2, 4] } });
    // handing it back is not a change by the candidate
    expect(mounted.changes).toEqual([]);

    pci.setResponse({ list: { float: [10] } });
    await waitFor(() => expect(table(root)[0]).toEqual(["10", "", "", ""]));
    pci.resetResponse();
    await waitFor(() => expect(table(root)[0]).toEqual(["", "", "", ""]));
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await tryNumber(first.canvas, "8");
    await tryNumber(first.canvas, "6");
    const state = first.pci.getState();

    // a state goes before a response the delivery system hands back
    const second = await remountPci(canvasElement, pci, { state, boundTo: { RESPONSE: { list: { float: [1] } } } });
    await waitFor(() => expect(table(second.root)[0]).toEqual(["6", "8", "", ""]));
    expect(second.pci.getResponse()).toEqual({ list: { float: [8, 6] } });
    await tryNumber(second.canvas, "7");
    expect(second.pci.getResponse()).toEqual({ list: { float: [8, 6, 7] } });
  },
};

// ---- Authoring mode: getAuthoringInstance, as an authoring system calls it ----

const DOT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="5"/></svg>';

export const Authoring: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { width: 560 },
  play: async ({ canvasElement, step }) => {
    const { instance, changes, root, canvas } = await openAuthoring(canvasElement);
    const fileInput = root.querySelector<HTMLInputElement>('input[type="file"]')!;

    await step("no own image yet", async () => {
      expect(canvas.getByText(/^No own image: the PCI shows the image chosen in the settings/)).toBeInTheDocument();
      expect(instance.getProperties()).toEqual({ customImage: "" });
      expect(instance.validate()).toEqual([]);
    });

    await step("a file that is not an image is refused", async () => {
      await userEvent.upload(fileInput, new File(["hello"], "notes.txt", { type: "text/plain" }), { applyAccept: false });
      await waitFor(() => expect(canvas.getByRole("alert")).toHaveTextContent("This file is not an image."));
      expect(instance.getProperties()).toEqual({ customImage: "" });
      expect(changes.length).toBe(0);
    });

    await step("a small SVG is stored as it is, and previewed in the first expression", async () => {
      await userEvent.upload(fileInput, new File([DOT_SVG], "dot.svg", { type: "image/svg+xml" }));
      await waitFor(() => expect(canvas.getByText("Stored in the item as SVG, 1 KB.")).toBeInTheDocument());
      const src = `data:image/svg+xml;base64,${btoa(DOT_SVG)}`;
      expect(instance.getProperties()).toEqual({ customImage: src });
      expect(changes.length).toBe(1);
      expect(canvas.queryByRole("alert")).toBeNull();
      expect(canvas.getByText("Preview")).toBeInTheDocument();
      // ? × 12 + 3, with the image for the unknown
      expect(canvas.getAllByRole("img", { name: "unknown number" })[0]).toHaveAttribute("src", src);
      expect(canvas.getByText("12")).toBeInTheDocument();
    });

    await step("removing it goes back to the chosen image", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Remove image" }));
      expect(instance.getProperties()).toEqual({ customImage: "" });
      expect(changes.length).toBe(2);
    });
  },
};

export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { width: 560, language: "nl", properties: { customImage: STAR } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("heading", { name: "Eigen afbeelding" })).toBeInTheDocument();
    expect(canvas.getByText(/^De PCI toont deze afbeelding in plaats van de gekozen/)).toBeInTheDocument();
    expect(instance.getProperties()).toEqual({ customImage: STAR });
    await userEvent.click(canvas.getByRole("button", { name: "Afbeelding verwijderen" }));
    expect(instance.getProperties()).toEqual({ customImage: "" });
  },
};
