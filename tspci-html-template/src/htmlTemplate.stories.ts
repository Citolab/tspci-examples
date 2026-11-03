import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "HTML template",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Entry = { name: string; base: Record<string, string | boolean> | null };
/** The response of the example fact sheet, with these entries changed. */
const factSheet = (changed: Record<string, Entry["base"]> = {}) => ({
  record: [
    { name: "capital", base: null },
    { name: "sea", base: null },
    { name: "official_language", base: null },
    { name: "border_be", base: { boolean: false } },
    { name: "border_de", base: { boolean: false } },
    { name: "border_fr", base: { boolean: false } },
    { name: "dikes", base: null },
  ].map((e) => (e.name in changed ? { ...e, base: changed[e.name] } : e)),
});

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;

    await step("the example fact sheet; every field empty", async () => {
      expect(canvas.getByText("Complete the fact sheet about the Netherlands.")).toBeInTheDocument();
      expect(canvas.getByRole("group", { name: "Interaction" })).toBeInTheDocument();
      expect(canvas.getByRole("textbox", { name: "1. What is the capital of the Netherlands?" })).toHaveValue("");
      expect(canvas.getByRole("combobox", { name: "2. Which sea lies along the coast?" })).toHaveValue("");
      expect(root.querySelector('[data-wordcount-for="dikes"]')).toHaveTextContent("0 words");
      expect(pci.getResponse()).toEqual(factSheet());
    });

    await step("a text field gives a string", async () => {
      await userEvent.type(canvas.getByRole("textbox", { name: "1. What is the capital of the Netherlands?" }), "Amsterdam");
      expect(pci.getResponse()).toEqual(factSheet({ capital: { string: "Amsterdam" } }));
      expect(await lastChange(mounted)).toEqual(factSheet({ capital: { string: "Amsterdam" } }));
    });

    await step("a drop-down and a radio group give an identifier, checkboxes a boolean", async () => {
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "2. Which sea lies along the coast?" }), "North Sea");
      await userEvent.click(canvas.getByRole("radio", { name: "German" }));
      await userEvent.click(canvas.getByRole("radio", { name: "Dutch" }));
      await userEvent.click(canvas.getByRole("checkbox", { name: "Belgium" }));
      await userEvent.click(canvas.getByRole("checkbox", { name: "Germany" }));
      await userEvent.click(canvas.getByRole("checkbox", { name: "France" }));
      await userEvent.click(canvas.getByRole("checkbox", { name: "France" }));
      expect(pci.getResponse()).toEqual(
        factSheet({
          capital: { string: "Amsterdam" },
          sea: { identifier: "north_sea" },
          official_language: { identifier: "dutch" },
          border_be: { boolean: true },
          border_de: { boolean: true },
        })
      );
    });

    await step("a text area, with its word count", async () => {
      const dikes = canvas.getByRole("textbox", { name: "5. Explain why much of the country is protected by dikes." });
      await userEvent.type(dikes, "Much land lies below sea level.");
      expect(root.querySelector('[data-wordcount-for="dikes"]')).toHaveTextContent("6 words");
      expect((pci.getResponse() as { record: Entry[] }).record[6]).toEqual({ name: "dikes", base: { string: "Much land lies below sea level." } });
      // emptying a text field gives no value (base null) again
      await retype(dikes, "x");
      await userEvent.type(dikes, "{Backspace}");
      expect((pci.getResponse() as { record: Entry[] }).record[6]).toEqual({ name: "dikes", base: null });
      expect(root.querySelector('[data-wordcount-for="dikes"]')).toHaveTextContent("0 words");
    });
  },
};

const OWN_HTML = `<style>body { color: rgb(1, 2, 3); }</style>
<script>window.hacked = true</script>
<p onclick="window.hacked = true">Fill in.</p>
<label>Name <input name="who" value="Ann" data-response></label>
<label>Age <input type="number" name="age" data-response></label>
<label>Colour <select name="colour" data-response><option>Red</option><option selected>Blue green</option></select></label>
<label><input type="radio" name="yesno" value="yes" data-response> Yes</label>
<label><input type="radio" name="yesno" value="no" checked data-response> No</label>
<label><input type="checkbox" name="agree" checked data-response> Agree</label>
<label>Other <input name="who" data-response></label>
<input type="date" name="when" data-response aria-label="When">
<input name="notes" aria-label="Notes">
<a href="https://example.com">Link</a>`;

export const OwnHtml: Story = {
  args: { properties: { html: OWN_HTML, prompt: "About you" } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci, root } = await openPci(canvasElement);

    await step("the prompt names the interaction; what the HTML gives is the starting response", async () => {
      expect(canvas.getByText("About you")).toBeInTheDocument();
      expect(canvas.getByRole("group", { name: "About you" })).toBeInTheDocument();
      // in the order of the HTML; the second "who", the date and the input without data-response are not fields
      expect(pci.getResponse()).toEqual({
        record: [
          { name: "who", base: { string: "Ann" } },
          { name: "age", base: null },
          { name: "colour", base: { identifier: "Blue green" } },
          { name: "yesno", base: { identifier: "no" } },
          { name: "agree", base: { boolean: true } },
        ],
      });
      expect(canvas.getByRole("radio", { name: "No" })).toBeChecked();
    });

    await step("scripts and event handlers are removed, links open elsewhere, body styles apply to the content", async () => {
      expect(root.querySelector("script")).toBeNull();
      expect(canvas.getByText("Fill in.")).not.toHaveAttribute("onclick");
      expect((window as unknown as { hacked?: boolean }).hacked).toBeUndefined();
      expect(canvas.getByRole("link", { name: "Link" })).toHaveAttribute("target", "_blank");
      expect(getComputedStyle(canvas.getByText("Fill in.")).color).toBe("rgb(1, 2, 3)");
    });

    await step("only the first element of a name counts", async () => {
      await userEvent.type(canvas.getByRole("textbox", { name: "Other" }), "Bob");
      await userEvent.type(canvas.getByRole("spinbutton", { name: "Age" }), "12");
      await userEvent.click(canvas.getByRole("radio", { name: "Yes" }));
      await userEvent.click(canvas.getByRole("checkbox", { name: "Agree" }));
      expect(pci.getResponse()).toEqual({
        record: [
          { name: "who", base: { string: "Ann" } },
          { name: "age", base: { string: "12" } },
          { name: "colour", base: { identifier: "Blue green" } },
          { name: "yesno", base: { identifier: "yes" } },
          { name: "agree", base: { boolean: false } },
        ],
      });
    });
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl" } },
  play: async ({ canvasElement }) => {
    const { canvas, root } = await openPci(canvasElement);
    expect(canvas.getByRole("group", { name: "Interactie" })).toBeInTheDocument();
    const count = root.querySelector('[data-wordcount-for="dikes"]');
    expect(count).toHaveTextContent("0 woorden");
    await userEvent.type(canvas.getByRole("textbox", { name: /dikes/ }), "Zee");
    expect(count).toHaveTextContent("1 woord");
  },
};

export const LowerCaseAttributes: Story = {
  // some delivery systems hand the data- attributes over in lower case
  args: { properties: { PROMPT: "Fill in", html: '<input name="a" aria-label="A" data-response>' } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("group", { name: "Fill in" })).toBeInTheDocument();
    expect(pci.getResponse()).toEqual({ record: [{ name: "a", base: null }] });
  },
};

const answered = factSheet({
  capital: { string: "Amsterdam" },
  sea: { identifier: "north_sea" },
  official_language: { identifier: "dutch" },
  border_be: { boolean: true },
});

export const Review: Story = {
  args: { status: "review", boundTo: { RESPONSE: answered } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const capital = canvas.getByRole("textbox", { name: /capital/ });
    await waitFor(() => expect(capital).toHaveValue("Amsterdam"));
    expect(capital).toHaveAttribute("readonly");
    expect(canvas.getByRole("combobox", { name: /sea/ })).toBeDisabled();
    expect(canvas.getByRole("radio", { name: "Dutch" })).toBeDisabled();
    expect(canvas.getByRole("radio", { name: "Dutch" })).toBeChecked();
    expect(canvas.getByRole("checkbox", { name: "Belgium" })).toBeDisabled();
    expect(canvas.getByRole("checkbox", { name: "Belgium" })).toBeChecked();
    await userEvent.type(capital, "x");
    expect(pci.getResponse()).toEqual(answered);
  },
};

export const BoundResponse: Story = {
  // TAO hands a boolean over as "true"; a field the record does not mention is empty
  args: { boundTo: { RESPONSE: { record: [{ name: "border_fr", base: { boolean: "true" } }, { name: "sea", base: { identifier: "baltic_sea" } }] } } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);

    await step("the bound response is shown", async () => {
      await waitFor(() => expect(canvas.getByRole("checkbox", { name: "France" })).toBeChecked());
      expect(canvas.getByRole("combobox", { name: /sea/ })).toHaveValue("baltic_sea");
      expect(pci.getResponse()).toEqual(factSheet({ sea: { identifier: "baltic_sea" }, border_fr: { boolean: true } }));
    });

    await step("setResponse and resetResponse", async () => {
      pci.setResponse({ record: [{ name: "capital", base: { string: "Den Haag" } }] });
      await waitFor(() => expect(canvas.getByRole("textbox", { name: /capital/ })).toHaveValue("Den Haag"));
      expect(canvas.getByRole("checkbox", { name: "France" })).not.toBeChecked();
      pci.resetResponse();
      await waitFor(() => expect(canvas.getByRole("textbox", { name: /capital/ })).toHaveValue(""));
      expect(pci.getResponse()).toEqual(factSheet());
    });
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement, step }) => {
    const first = await openPci(canvasElement);
    await userEvent.type(first.canvas.getByRole("textbox", { name: /capital/ }), "Utrecht");
    await userEvent.click(first.canvas.getByRole("radio", { name: "English" }));
    await userEvent.type(first.canvas.getByRole("textbox", { name: /dikes/ }), "Low land");
    const state = first.pci.getState();
    const expected = factSheet({
      capital: { string: "Utrecht" },
      official_language: { identifier: "english" },
      dikes: { string: "Low land" },
    });

    await step("from getState()", async () => {
      const second = await remountPci(canvasElement, pci, { state });
      await waitFor(() => expect(second.canvas.getByRole("textbox", { name: /capital/ })).toHaveValue("Utrecht"));
      expect(second.canvas.getByRole("radio", { name: "English" })).toBeChecked();
      expect(second.root.querySelector('[data-wordcount-for="dikes"]')).toHaveTextContent("2 words");
      expect(second.pci.getResponse()).toEqual(expected);
    });

    await step("from getState() per response identifier", async () => {
      const third = await remountPci(canvasElement, pci, { state: JSON.stringify({ RESPONSE: state }) });
      expect(third.pci.getResponse()).toEqual(expected);
    });

    await step("from the original's state, { response }", async () => {
      const fourth = await remountPci(canvasElement, pci, { state: JSON.stringify({ response: expected }) });
      await waitFor(() => expect(fourth.canvas.getByRole("textbox", { name: /dikes/ })).toHaveValue("Low land"));
      expect(fourth.pci.getResponse()).toEqual(expected);
    });

    await step("a state of something else is ignored", async () => {
      const fifth = await remountPci(canvasElement, pci, { state: "not json" });
      expect(fifth.pci.getResponse()).toEqual(factSheet());
    });
  },
};

// ---- Authoring mode: getAuthoringInstance, as an authoring system calls it ----

/** The response fields the authoring mode lists: name, type, value at the start. */
const fieldRows = (root: ParentNode) =>
  [...root.querySelectorAll('[data-testid="fields"] tbody tr')].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent));

export const Authoring: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { width: 1100 },
  play: async ({ canvasElement, step }) => {
    const { instance, changes, root, canvas } = await openAuthoring(canvasElement);

    await step("starts with the example template, its fields and a live preview", async () => {
      expect(fieldRows(root)).toEqual([
        ["capital", "string", "—"],
        ["sea", "identifier", "—"],
        ["official_language", "identifier", "—"],
        ["border_be", "boolean", "false"],
        ["border_de", "boolean", "false"],
        ["border_fr", "boolean", "false"],
        ["dikes", "string", "—"],
      ]);
      // the preview renders in a shadow root of its own, once it is mounted
      const previewRoot = await waitFor(() => {
        const shadow = canvas.getByTestId("preview").shadowRoot;
        if (!shadow) throw new Error("no preview yet");
        return shadow;
      });
      const preview = within(previewRoot as unknown as HTMLElement);
      await waitFor(() => expect(preview.getByRole("textbox", { name: /capital/ })).toBeInTheDocument());
      expect(instance.validate()).toEqual([]);
    });

    await step("HTML without a name for its response element cannot be used", async () => {
      await retype(canvas.getByRole("textbox", { name: "HTML" }), '<input data-response title="x"><script>x()</script>');
      await waitFor(() => expect(canvas.getByText("None yet.")).toBeInTheDocument());
      await waitFor(() => expect(canvas.getByTestId("problems")).toHaveTextContent("Removed: <script>."));
      expect(instance.validate()).toEqual([
        'This element has data-response but no name, so it is not part of the response: <input data-response="" title="x">',
        "There is no response element yet: add data-response and a name to an input, textarea or select.",
      ]);
      expect(instance.getProperties().html).toBe('<input data-response title="x"><script>x()</script>');
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("an inserted text field is a response field", async () => {
      await retype(canvas.getByRole("textbox", { name: "HTML" }), "<p>Hi</p>");
      await userEvent.click(canvas.getByRole("button", { name: "Text field" }));
      await waitFor(() => expect(fieldRows(root)).toEqual([["text1", "string", "—"]]));
      expect(instance.getProperties().html).toBe('<p>Hi</p>\n<label for="text1">Question</label>\n<input type="text" id="text1" name="text1" data-response>\n');
      expect(instance.validate()).toEqual([]);
      // the inserted snippet is selected (the next one would replace it): put the cursor at the end first
      const editor = canvas.getByRole("textbox", { name: "HTML" }) as HTMLTextAreaElement;
      await waitFor(() => expect(editor.selectionEnd - editor.selectionStart).toBeGreaterThan(0));
      editor.setSelectionRange(editor.value.length, editor.value.length);
      await userEvent.click(canvas.getByRole("button", { name: "Checkbox" }));
      await waitFor(() => expect(fieldRows(root)).toEqual([["text1", "string", "—"], ["check1", "boolean", "false"]]));
    });

    await step("a duplicate name and a missing label", async () => {
      await retype(canvas.getByRole("textbox", { name: "HTML" }), '<input name="a" data-response><input name="a" title="A" data-response>');
      await waitFor(() => expect(canvas.getByTestId("problems")).toHaveTextContent('"a" has no label: add a <label>, aria-label or title for screen readers.'));
      // a missing label is a warning; a duplicate name keeps the HTML from being used
      expect(instance.validate()).toEqual([
        'The name "a" is used for more than one response element (only radio buttons of one group share a name).',
      ]);
    });

    await step("back to the example template", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Example template" }));
      await waitFor(() => expect(fieldRows(root)).toHaveLength(7));
      expect(instance.validate()).toEqual([]);
    });
  },
};

export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { width: 1100, language: "nl", properties: { html: '<select name="s" data-response multiple aria-label="S"><option>a</option></select>' } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("button", { name: "Keuzelijst" })).toBeInTheDocument();
    expect(canvas.getByText("Nog geen.")).toBeInTheDocument();
    expect(canvas.getByTestId("problems")).toHaveTextContent(
      'Dit element kan niet bij het antwoord horen (input type="text|number|email|url|search|checkbox|radio", textarea, select zonder multiple): <select name="s" data-response="" multiple="" aria-label="S">'
    );
    expect(instance.validate()).toEqual(["Er is nog geen antwoordelement: geef een input, textarea of select een name en data-response."]);
  },
};
