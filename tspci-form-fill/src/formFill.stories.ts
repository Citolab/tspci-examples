import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { afterPaint, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Form fill",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Canvas = MountedPci["canvas"];
type Record = { record: { name: string; base: { integer?: number; string?: string } | null }[] } | undefined;

/** A field of the record response. */
const field = (response: unknown, name: string) => (response as Record)?.record.find((f) => f.name === name)?.base;
const values = (response: unknown) => JSON.parse(field(response, "values")?.string ?? "{}");
const box = (canvas: Canvas, name: string | RegExp) => canvas.getByRole("textbox", { name });
const TRANSFER = { example: "transfer", theme: "web" };

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("form", { name: "Waybill — domestic parcel" })).toHaveAttribute("data-theme", "paper");
    expect(canvas.getByRole("complementary", { name: "Information" })).toHaveTextContent("Sanne de Wit");
    expect(canvas.getByRole("region", { name: "1 Sender" })).toBeInTheDocument();
    expect(canvas.getByRole("region", { name: "2 Recipient" })).toBeInTheDocument();
    expect(canvas.getAllByRole("textbox", { name: "Postcode" })).toHaveLength(2);
    expect(canvas.getByRole("radio", { name: "Express (next day)" })).not.toBeChecked();
    expect(canvas.getByRole("button", { name: "Signature of the sender: not signed, press to sign" })).toHaveAttribute("aria-pressed", "false");
    // a paper form gives no validation
    expect(canvas.queryByRole("button", { name: "Check the form" })).toBeNull();
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const FillInTheWaybill: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("type the recipient: the postcode is normalised", async () => {
      await userEvent.type(box(canvas, "Name"), "Sanne de Wit");
      await userEvent.type(canvas.getAllByRole("textbox", { name: "Postcode" })[1], "9721bg");
      const r = await lastChange(mounted);
      expect(values(r).recipientPostcode).toBe("9721 BG");
      expect(field(r, "score")).toEqual({ integer: 2 });
    });

    await step("choose the service, a weight, the dates", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "Express (next day)" }));
      await userEvent.type(box(canvas, "Weight (kg)"), "4.8");
      await userEvent.type(box(canvas, "Date sent"), "10/11/2026");
      await userEvent.type(box(canvas, "Expected delivery"), "09/11/2026");
      const r = pci.getResponse();
      expect(values(r)).toMatchObject({ service: "express", weight: "4.8", shipDate: "2026-11-10", deliveryDate: "2026-11-09" });
      // check 12: the delivery after the date sent; check 13 its exact date
      expect(field(r, "check12")).toEqual({ integer: 0 });
      expect(field(r, "check13")).toEqual({ integer: 0 });
      await retype(box(canvas, "Expected delivery"), "11/11/2026");
      expect(field(pci.getResponse(), "check12")).toEqual({ integer: 1 });
    });

    await step("sign with a click, the status says so", async () => {
      await userEvent.click(canvas.getByRole("button", { name: /Signature of the sender: not signed/ }));
      expect(canvas.getByRole("status")).toHaveTextContent("Signature of the sender: signed.");
      expect(canvas.getByRole("button", { name: /Signature of the sender: signed/ })).toHaveAttribute("aria-pressed", "true");
      const r = pci.getResponse();
      expect(field(r, "score")).toEqual({ integer: 7 });
      expect(field(r, "maxscore")).toEqual({ integer: 13 });
      expect(field(r, "correct")).toEqual({ integer: 0 });
      expect(field(r, "value8")).toEqual({ string: "9721 BG" });
    });
  },
};

/**
 * The signature box is a toggle button: Enter signs, Space removes the signature. Tab order and the arrow keys in a
 * radio group (user-event cannot walk radios in a shadow root) are checked with Playwright (README).
 */
export const Keyboard: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const express = canvas.getByRole("radio", { name: "Express (next day)" });
    await userEvent.click(express);
    expect(express).toBeChecked();
    const sign = canvas.getByRole("button", { name: /Signature of the sender/ });
    sign.focus();
    await userEvent.keyboard("{Enter}");
    expect(values(pci.getResponse()).signature).toBe("signed");
    await userEvent.keyboard(" ");
    expect(values(pci.getResponse()).signature).toBeUndefined();
    expect(canvas.getByRole("status")).toHaveTextContent("Signature of the sender: signature removed.");
  },
};

export const TransferWithValidation: Story = {
  args: { properties: TRANSFER },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("form", { name: "Make a transfer" })).toHaveAttribute("data-theme", "web");

    await step("a wrong IBAN: an error with an icon and text when leaving the field", async () => {
      const iban = box(canvas, /^IBAN of the payee/);
      await userEvent.type(iban, "NL92 ABNA 0417 1643 00");
      await userEvent.click(box(canvas, /^Name of the payee/));
      expect(iban).toHaveAttribute("aria-invalid", "true");
      expect(iban).toHaveAccessibleDescription(/This IBAN is not valid/);
      expect(canvas.getByRole("status")).toHaveTextContent("IBAN of the payee: This IBAN is not valid: check the number.");
      await retype(iban, "NL91 ABNA 0417 1643 00");
      expect(iban).not.toHaveAttribute("aria-invalid");
    });

    await step("the amounts and the total the candidate calculates", async () => {
      await userEvent.type(box(canvas, /^Invoice 2026-118/), "64.50");
      await userEvent.type(box(canvas, /^Invoice 2026-121/), "24.95");
      await userEvent.type(box(canvas, /^Total to transfer/), "89.54");
      let r = pci.getResponse();
      expect(field(r, "check6")).toEqual({ integer: 0 }); // the sum
      await retype(box(canvas, /^Total to transfer/), "89.45");
      r = pci.getResponse();
      expect(field(r, "check6")).toEqual({ integer: 1 });
      expect(field(r, "check7")).toEqual({ integer: 1 });
      expect(values(r).total).toBe("89.45");
    });

    await step("check the form: the required fields still empty", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Check the form" }));
      expect(canvas.getByRole("status")).toHaveTextContent("3 fields need your attention.");
      expect(box(canvas, /^Name of the payee/)).toHaveAccessibleDescription("Fill in this field.");
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "How often" }), "once");
      await userEvent.click(canvas.getByRole("checkbox", { name: "Save the payee in my address book" }));
      expect(values(pci.getResponse())).toMatchObject({ frequency: "once", save: "true" });
    });
  },
};

export const ValidationOff: Story = {
  args: { properties: { ...TRANSFER, validation: "false", columns: "1" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    const iban = box(canvas, /^IBAN of the payee/);
    await userEvent.type(iban, "NL00");
    await userEvent.click(box(canvas, /^Name of the payee/));
    expect(iban).not.toHaveAttribute("aria-invalid");
    expect(canvas.queryByRole("button", { name: "Check the form" })).toBeNull();
  },
};

export const Dutch: Story = {
  args: { properties: { ...TRANSFER, language: "nl" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("form", { name: "Geld overmaken" })).toBeInTheDocument();
    await userEvent.type(box(canvas, /^Factuur 2026-118/), "64,50");
    await userEvent.type(box(canvas, /^Factuur 2026-121/), "24,95");
    await userEvent.type(box(canvas, /^Totaal over te maken/), "89,45");
    await userEvent.type(box(canvas, /^Datum van betaling/), "16-11-2026");
    expect(box(canvas, /^Datum van betaling/)).toHaveAttribute("placeholder", "dd-mm-jjjj");
    const r = pci.getResponse();
    // the response does not depend on the language
    expect(values(r)).toMatchObject({ line1: "64.50", line2: "24.95", total: "89.45", payDate: "2026-11-16" });
    expect(field(r, "score")).toEqual({ integer: 5 });
    await userEvent.click(canvas.getByRole("button", { name: "Formulier controleren" }));
    expect(canvas.getByRole("status")).toHaveTextContent("3 velden vragen je aandacht.");
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.type(box(first.canvas, "Weight (kg)"), "4.8");
    await userEvent.click(first.canvas.getByRole("radio", { name: "Standard (2–3 days)" }));
    const state = first.pci.getState();
    expect(JSON.parse(state).state).toEqual({ values: { weight: "4.8", service: "standard" } });

    const second = await remountPci(canvasElement, pci, { state });
    expect(box(second.canvas, "Weight (kg)")).toHaveValue("4.8");
    expect(second.canvas.getByRole("radio", { name: "Standard (2–3 days)" })).toBeChecked();
    expect(second.pci.getResponse()).toEqual(first.pci.getResponse());
    expect(second.changes).toHaveLength(0);
  },
};

const bound = { record: [{ name: "values", base: { string: JSON.stringify({ payee: "Fietsherstel Jansen", total: "89.45", payDate: "2026-11-16" }) } }] };

export const BoundResponse: Story = {
  args: { properties: { ...TRANSFER, language: "nl" }, boundTo: { RESPONSE: bound } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("the bound values are in the form, in Dutch notation", async () => {
      expect(box(canvas, /^Naam ontvanger/)).toHaveValue("Fietsherstel Jansen");
      expect(box(canvas, /^Totaal over te maken/)).toHaveValue("89,45");
      expect(box(canvas, /^Datum van betaling/)).toHaveValue("16-11-2026");
      expect(field(pci.getResponse(), "score")).toEqual({ integer: 3 });
    });
    await step("resetResponse: an empty form", async () => {
      pci.resetResponse();
      await waitFor(() => expect(box(canvas, /^Naam ontvanger/)).toHaveValue(""));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: { status: "solution", state: JSON.stringify({ state: { values: { weight: "12" } }, log: [] }) },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the author's solution replaces the candidate's work; nothing to change
    await waitFor(() => expect(box(canvas, "Weight (kg)")).toHaveValue("4.8"));
    expect(box(canvas, "Weight (kg)")).toHaveAttribute("readonly");
    expect(canvas.getByRole("radio", { name: "Express (next day)" })).toBeChecked();
    expect(canvas.getByRole("button", { name: /Signature of the sender: signed/ })).toBeDisabled();
    expect(field(pci.getResponse(), "correct")).toEqual({ integer: 1 });
  },
};

/** Two interactions of this type on one page: each has its own form and response. */
export const TwoInstances: Story = {
  render: (args) => {
    const page = document.createElement("div");
    for (const [id, properties] of [["first", {}], ["second", TRANSFER]] as const) {
      const slot = document.createElement("div");
      slot.dataset.slot = id;
      slot.appendChild(mountPci(pci, { ...args, properties }));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=first]")!);
    const second = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=second]")!);
    expect(first.pci).not.toBe(second.pci);
    await userEvent.type(box(first.canvas, "Weight (kg)"), "3");
    await userEvent.type(box(second.canvas, /^Name of the payee/), "Jansen");
    expect(values(first.pci.getResponse())).toEqual({ weight: "3" });
    expect(values(second.pci.getResponse())).toEqual({ payee: "Jansen" });
    expect(first.changes).toHaveLength(1);
    expect(second.changes).toHaveLength(6);
  },
};

// --- Authoring mode: what an authoring system shows the item author (getAuthoringInstance)

export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);
    const form = () => JSON.parse(instance.getProperties().form!);

    await step("starts from the waybill; its solution scores 13 of 13", async () => {
      expect(canvas.getByTestId("score-summary")).toHaveTextContent("The solution scores 13 of 13.");
      expect(instance.validate()).toEqual([]);
      expect(instance.getProperties()).toMatchObject({ theme: "paper", columns: "2", validation: "true" });
    });

    await step("the look: an online form in one column", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "Online form" }));
      await userEvent.click(canvas.getByRole("radio", { name: "1 column" }));
      expect(instance.getProperties()).toMatchObject({ theme: "web", columns: "1" });
      await retype(canvas.getByTestId("title-nl"), "Vrachtbrief");
      expect(form().title).toEqual({ en: "Waybill — domestic parcel", nl: "Vrachtbrief" });
    });

    await step("a field with an e-mail check", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Fields and checks" }));
      await userEvent.click(canvas.getByTestId("section-0-add-field"));
      await userEvent.selectOptions(canvas.getByTestId("field-field16-type"), "email");
      await userEvent.click(canvas.getByTestId("field-field16-add-check"));
      expect(instance.validate()).toContain("An exact value check on “field16” has no value.");
      await userEvent.selectOptions(canvas.getByTestId("field-field16-check-0-type"), "Format");
      expect(form().sections[0].fields[5]).toMatchObject({ id: "field16", type: "email", checks: [{ type: "format", format: "email" }] });
      expect(instance.validate()).toEqual(["The solution does not pass check 4 (field16)."]);
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("fill in the solution in the preview: every check shows", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Preview and solution" }));
      await userEvent.type(canvas.getByRole("textbox", { name: "New field" }), "info@kok.nl");
      expect(instance.validate()).toEqual([]);
      expect(canvas.getByTestId("checks-field16")).toHaveTextContent("passes: 4. New field: E-mail address (1 pt)");
      expect(canvas.getByTestId("solution-summary")).toHaveTextContent("The solution scores 14 of 14.");
      expect(form().solution.field16).toBe("info@kok.nl");
    });

    await step("load the bank transfer", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Form" }));
      await userEvent.selectOptions(canvas.getByTestId("example"), "transfer");
      await userEvent.click(canvas.getByRole("button", { name: "Load" }));
      expect(form().sections[1].kind).toBe("amounts");
      expect(canvas.getByTestId("score-summary")).toHaveTextContent("The solution scores 8 of 8.");
    });
  },
};

export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { form: JSON.stringify({ title: "x", sections: [{ id: "s", title: "S", fields: [{ id: "keuze", type: "select", label: "Keuze" }] }] }) } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    await afterPaint();
    expect(instance.validate()).toEqual(["Veld “keuze” heeft geen opties.", "Het formulier heeft geen checks: er wordt niets gescoord."]);
    expect(canvas.getByRole("tab", { name: "Velden en checks" })).toBeInTheDocument();
  },
};
