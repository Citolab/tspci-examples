// SPDX-License-Identifier: MIT
// Based on https://github.com/rdncuee/CBP (Code Block Programming Interaction),
// © 2022 The National Center for University Entrance Examinations
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  afterPaint, focusedIn, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci,
  type PciArgs,
} from "../../.storybook/tspci";
import { parseSettings, programText } from "./blocks";
import pci from "./index";

const meta = {
  title: "Code blocks",
  render: (args) => mountPci(pci, args),
  args: { width: 960 },
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Canvas = MountedPci["canvas"];
type Record = { record: { name: string; base: { integer?: number; string?: string } | null }[] } | undefined;

/** The original's JSON in a single string response. */
const json = (response: unknown) => JSON.parse((response as { base: { string: string } }).base.string);
const field = (response: unknown, name: string) => (response as Record)?.record.find((f) => f.name === name)?.base;
const integer = (response: unknown, name: string) => field(response, name)?.integer;

/** The program as the candidate sees it: a line per block, indented by its depth. */
const lines = (canvas: Canvas) =>
  within(canvas.getByTestId("program")).queryAllByRole("listitem").map((li) => {
    const depth = li.querySelectorAll(":scope > [data-arm]").length; // the arms of the C-shaped blocks around it
    const label = li.querySelector<HTMLElement>("[data-label]")!;
    const text = [...label.childNodes].map((n) => {
      const el = n as HTMLElement;
      const field = el instanceof HTMLInputElement || el instanceof HTMLSelectElement ? el : el.querySelector?.("select");
      if (field) return field.value || "___";
      return el.textContent ?? "";
    }).filter((x) => x.trim()).join(" ");
    return `${"  ".repeat(depth)}${text}`;
  });

const output = (canvas: Canvas) => within(canvas.getByTestId("output")).queryAllByTestId("output-line").map((l) => l.textContent);
const status = (canvas: Canvas) => canvas.getByRole("status");
const addBlock = (canvas: Canvas, name: string | RegExp) => userEvent.click(canvas.getByRole("button", { name: typeof name === "string" ? `Add block: ${name}` : name }));
const blank = (canvas: Canvas, n: number, line: number) => canvas.getByRole("textbox", { name: `Blank ${n} on line ${line}` });
const handle = (canvas: Canvas, line: number) => canvas.getByRole("button", { name: new RegExp(`^Line ${line}: `) });

/** Builds the example's solution by clicking, typing and the keyboard. */
const buildSum = async (canvas: Canvas) => {
  await addBlock(canvas, "total ← ___");
  await userEvent.type(canvas.getByRole("textbox", { name: "Blank 1 on line 2" }), "0");
  await addBlock(canvas, "for i from ___ to ___");
  await userEvent.type(canvas.getByRole("textbox", { name: "Blank 1 on line 3" }), "1");
  await userEvent.type(canvas.getByRole("textbox", { name: "Blank 2 on line 3" }), "n");
  await addBlock(canvas, "total ← total ___ i"); // below the for: line 4, at the same level
  handle(canvas, 4).focus();
  await userEvent.keyboard("{ArrowRight}"); // into the for
  await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Blank 1 on line 4" }), "+");
  await addBlock(canvas, "print total"); // below the selected block: inside the for
  handle(canvas, 5).focus();
  await userEvent.keyboard("{ArrowLeft}"); // out of the for
};

/** A pointer event at the middle (or the top/bottom quarter) of an element. */
const pointer = (type: string, el: Element, where: "middle" | "top" | "bottom" = "middle") => {
  const r = el.getBoundingClientRect();
  const y = where === "top" ? r.top + r.height * 0.25 : where === "bottom" ? r.top + r.height * 0.75 : r.top + r.height / 2;
  return new PointerEvent(type, { clientX: r.left + Math.min(40, r.width / 2), clientY: y, bubbles: true, composed: true, pointerId: 1, button: 0, isPrimary: true });
};
/** Drags an element (a palette block or a handle) onto another, as with a mouse. */
const dragTo = async (from: Element, to: Element, where: "middle" | "top" | "bottom" = "middle") => {
  from.dispatchEvent(pointer("pointerdown", from));
  await afterPaint();
  window.dispatchEvent(pointer("pointermove", to, where));
  await afterPaint();
  window.dispatchEvent(pointer("pointermove", to, where));
  await afterPaint();
  window.dispatchEvent(pointer("pointerup", to, where));
  await afterPaint();
};

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);

    await step("the example: the prompt, seven blocks, a locked first line", async () => {
      expect(canvas.getByTestId("prompt")).toHaveTextContent(/^Make a program that reads a whole number n/);
      const palette = within(canvas.getByTestId("palette")).getAllByRole("button");
      expect(palette).toHaveLength(7);
      // grouped by category: variables, control, input and output, each with its heading
      expect(palette.map((b) => b.getAttribute("data-block"))).toEqual(["b1", "b3", "b7", "b2", "b6", "b4", "b5"]);
      expect(palette[3]).toHaveAccessibleName("Add block: for i from ___ to ___");
      expect(within(canvas.getByTestId("palette")).getByRole("group", { name: "Control" })).toBeInTheDocument();
      expect(canvas.getByTestId("hat")).toHaveTextContent("when Run is pressed");
      expect(lines(canvas)).toEqual(["read n"]);
      expect(within(canvas.getByTestId("program")).getByText("(locked)")).toBeInTheDocument();
      expect(canvas.queryByRole("button", { name: /^Line 1: / })).toBeNull(); // no handle: it cannot move
      expect(canvas.getByTestId("count")).toHaveTextContent("1 of 30 blocks");
    });

    await step("the input and the output", async () => {
      expect(canvas.getByRole("textbox", { name: "Input" })).toHaveValue("5");
      expect(canvas.getByTestId("output")).toHaveTextContent("Press Run to see what the program prints.");
      expect(canvas.getByRole("button", { name: "Run" })).toBeEnabled();
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const BuildAndRun: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("add blocks by pressing them, fill the blanks, indent with the keyboard", async () => {
      await buildSum(canvas);
      expect(lines(canvas)).toEqual(["read n", "total ← 0", "for i from 1 to n", "  total ← total + i", "print total"]);
      expect(status(canvas)).toHaveTextContent("“print total” is now on line 5.");
      // without reuse a used block is used up
      expect(canvas.getByRole("button", { name: "Add block: print total" })).toBeDisabled();
      expect(canvas.getByRole("button", { name: "Add block: print i" })).toBeEnabled();
    });

    await step("Run: the output, and the response with the result", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Run" }));
      expect(output(canvas)).toEqual(["15"]);
      expect(canvas.getByTestId("output")).toHaveTextContent("The program has finished.");
      expect(status(canvas)).toHaveTextContent("The program ran and printed 1 line.");
      const response = json(await lastChange(mounted));
      expect(response).toEqual({
        result: ["15"],
        code: "read n\ntotal ← 0\nfor i from 1 to n\n    total ← total + i\nprint total",
        codeblock: [
          { id: "p1", type: "input", locked: true },
          { id: "b1", type: "set" },
          { id: "b2", type: "for", nests: [[{ id: "b3", type: "set" }]] },
          { id: "b4", type: "print" },
        ],
        textbox: [{ "b1.2": "0" }, { "b2.2": "1" }, { "b2.3": "n" }],
        dropdown: [{ "b3.3": "+" }],
      });
    });

    await step("another input: the last output goes, Run again", async () => {
      await retype(canvas.getByRole("textbox", { name: "Input" }), "10");
      expect(output(canvas)).toEqual([]);
      expect(json(pci.getResponse()).result).toEqual([]);
      await userEvent.click(canvas.getByRole("button", { name: "Run" }));
      expect(output(canvas)).toEqual(["55"]);
    });
  },
};

export const Keyboard: Story = {
  args: { properties: { reuse: "true" } },
  play: async ({ canvasElement, step }) => {
    const { canvas, root, pci } = await openPci(canvasElement);
    await buildSum(canvas);

    await step("↑ moves a block up through the listing: into the loop, over its body, out of it", async () => {
      handle(canvas, 5).focus();
      await userEvent.keyboard("{ArrowUp}");
      expect(lines(canvas)).toEqual(["read n", "total ← 0", "for i from 1 to n", "  total ← total + i", "  print total"]);
      expect(status(canvas)).toHaveTextContent("“print total” is now on line 5, 1 level in.");
      expect(focusedIn(root)).toBe(handle(canvas, 5)); // the focus stays on the block
      await userEvent.keyboard("{ArrowUp}{ArrowUp}");
      expect(lines(canvas)).toEqual(["read n", "total ← 0", "print total", "for i from 1 to n", "  total ← total + i"]);
    });

    await step("the locked block does not move, the others move past it", async () => {
      await userEvent.keyboard("{ArrowUp}{ArrowUp}");
      expect(lines(canvas)[0]).toBe("print total");
      await userEvent.keyboard("{ArrowUp}");
      expect(status(canvas)).toHaveTextContent("The block cannot go further that way.");
      await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
      expect(lines(canvas)).toEqual(["read n", "total ← 0", "for i from 1 to n", "  total ← total + i", "print total"]);
    });

    await step("the toolbar of the selected block does the same with buttons", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Into the block above" }));
      expect(lines(canvas)[4]).toBe("  print total");
      await userEvent.click(canvas.getByRole("button", { name: "Move up" }));
      expect(lines(canvas)[3]).toBe("  print total");
      await userEvent.click(canvas.getByRole("button", { name: "Out of the block" }));
      expect(lines(canvas)).toEqual(["read n", "total ← 0", "for i from 1 to n", "  total ← total + i", "print total"]);
    });

    await step("Delete removes a block; removing the loop leaves its body in its place", async () => {
      handle(canvas, 3).focus();
      await userEvent.keyboard("{Delete}");
      expect(lines(canvas)).toEqual(["read n", "total ← 0", "total ← total + i", "print total"]);
      expect(status(canvas)).toHaveTextContent("Removed “for i from 1 to n”.");
      expect(focusedIn(root)).toBe(handle(canvas, 3));
      await userEvent.keyboard("{Backspace}");
      expect(lines(canvas)).toEqual(["read n", "total ← 0", "print total"]);
    });

    await step("a block added from the palette goes below the selected block", async () => {
      handle(canvas, 2).focus();
      await addBlock(canvas, "print i");
      expect(lines(canvas)).toEqual(["read n", "total ← 0", "print i", "print total"]);
      expect(status(canvas)).toHaveTextContent("Added “print i” on line 3.");
      expect(pci.getResponse()).toBeDefined();
    });
  },
};

export const DragAndDrop: Story = {
  args: { properties: { reuse: "true" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    const block = (name: string) => canvas.getByRole("button", { name: `Add block: ${name}` });
    const row = (n: number) => canvas.getByTestId(`line-${n}`);

    await step("drag a block from the palette below the last line", async () => {
      await dragTo(block("for i from ___ to ___"), row(1), "bottom");
      expect(lines(canvas)).toEqual(["read n", "for i from ___ to ___"]);
      expect(canvas.queryByTestId("drop-indicator")).toBeNull();
    });

    await step("drop onto the lower half of a loop: into its body; onto the empty program end: at the end", async () => {
      await dragTo(block("total ← total ___ i"), row(2), "bottom");
      expect(lines(canvas)).toEqual(["read n", "for i from ___ to ___", "  total ← total ___ i"]);
      const tail = canvas.getByTestId("program").parentElement!.querySelector("[data-row='tail']")!;
      await dragTo(block("print total"), tail);
      expect(lines(canvas)).toEqual(["read n", "for i from ___ to ___", "  total ← total ___ i", "print total"]);
      await dragTo(block("total ← ___"), row(2), "top");
      expect(lines(canvas)).toEqual(["read n", "total ← ___", "for i from ___ to ___", "  total ← total ___ i", "print total"]);
    });

    await step("drag a block by its handle into the loop, and back out", async () => {
      await dragTo(handle(canvas, 5), row(4), "bottom");
      expect(lines(canvas)).toEqual(["read n", "total ← ___", "for i from ___ to ___", "  total ← total ___ i", "  print total"]);
      await dragTo(handle(canvas, 5), row(1), "bottom");
      expect(lines(canvas)).toEqual(["read n", "print total", "total ← ___", "for i from ___ to ___", "  total ← total ___ i"]);
    });

    await step("drag a block onto the palette to remove it", async () => {
      await dragTo(handle(canvas, 2), canvas.getByTestId("palette"));
      expect(lines(canvas)).toEqual(["read n", "total ← ___", "for i from ___ to ___", "  total ← total ___ i"]);
      expect(status(canvas)).toHaveTextContent("Removed “print total”.");
      expect(json(await lastChange(mounted)).codeblock).toHaveLength(3);
      expect(pci.getResponse()).toBeDefined();
    });
  },
};

export const Errors: Story = {
  args: {
    properties: {
      blocks: "set: {x} ← {}\nwhile: while {}\nprint: print {}",
      reuse: "true",
      inputs: "",
      editInputs: "false",
    },
  },
  play: async ({ canvasElement, step }) => {
    const { canvas } = await openPci(canvasElement);
    const run = () => userEvent.click(canvas.getByRole("button", { name: "Run" }));

    await step("an empty program, an empty blank", async () => {
      expect(canvas.queryByTestId("prompt")).toBeNull(); // no example prompt with the author's own blocks
      expect(canvas.getByRole("textbox", { name: "Input" })).toHaveAttribute("readonly");
      await run();
      expect(canvas.getByTestId("error")).toHaveTextContent("The program is empty: add blocks first.");
      await addBlock(canvas, "x ← ___");
      await run();
      expect(canvas.getByTestId("error")).toHaveTextContent("Error on line 1: fill in every blank.");
      expect(status(canvas)).toHaveTextContent("The program stopped. Error on line 1: fill in every blank.");
    });

    await step("a variable without a value, text that cannot be read", async () => {
      await userEvent.type(blank(canvas, 1, 1), "y + 1");
      await run();
      expect(canvas.getByTestId("error")).toHaveTextContent("Error on line 1: the variable y has no value yet.");
      expect(canvas.getByTestId("line-1").querySelector("[data-error]")).not.toBeNull();
      await retype(blank(canvas, 1, 1), "3 +");
      await run();
      expect(canvas.getByTestId("error")).toHaveTextContent("Error on line 1: “3 +” cannot be read.");
    });

    await step("a loop that never ends is stopped", async () => {
      await retype(blank(canvas, 1, 1), "1");
      await addBlock(canvas, "while ___");
      await userEvent.type(blank(canvas, 1, 2), "x > 0");
      await addBlock(canvas, "print ___");
      handle(canvas, 3).focus();
      await userEvent.keyboard("{ArrowRight}");
      await userEvent.type(blank(canvas, 1, 3), "x");
      await run();
      expect(canvas.getByTestId("error")).toHaveTextContent(/^⚠ Error on line 3: the program printed more than 500 lines/);
      expect(output(canvas)).toHaveLength(500);
      handle(canvas, 3).focus();
      await userEvent.keyboard("{Delete}");
      await run();
      expect(canvas.getByTestId("error")).toHaveTextContent("Error on line 2: the program took more than 10000 steps and was stopped. Does a loop never end?");
    });
  },
};

export const IfElse: Story = {
  args: {
    properties: {
      prompt: "Print whether the number is even or odd.",
      blocks: "input: read {n}\nifelse: if {n} {mod|div} {2} {=|<>} {0} | otherwise\nprint: print {\"even\"|\"odd\"}",
      reuse: "true",
      inputs: "7",
    },
  },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;

    await step("an if/else holds two branches, with the author's else line", async () => {
      await addBlock(canvas, "read n");
      await addBlock(canvas, "if n ___ 2 ___ 0");
      expect(lines(canvas)).toEqual(["read n", "if n ___ 2 ___ 0", "otherwise"]);
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Blank 1 on line 2" }), "mod");
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Blank 2 on line 2" }), "=");
      const empties = canvas.getByTestId("program").parentElement!.querySelectorAll("[data-row$=':empty']");
      expect(empties).toHaveLength(2);
      await dragTo(canvas.getByRole("button", { name: 'Add block: print ___' }), empties[0]);
      await dragTo(canvas.getByRole("button", { name: 'Add block: print ___' }), canvas.getByTestId("line-4"), "bottom");
      expect(lines(canvas)).toEqual(["read n", "if n mod 2 = 0", "  print ___", "otherwise", "  print ___"]);
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Blank 1 on line 3" }), '"even"');
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Blank 1 on line 5" }), '"odd"');
    });

    await step("run with 7 and with 4", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Run" }));
      expect(output(canvas)).toEqual(["odd"]);
      await retype(canvas.getByRole("textbox", { name: "Input" }), "4");
      await userEvent.click(canvas.getByRole("button", { name: "Run" }));
      expect(output(canvas)).toEqual(["even"]);
      expect(json(await lastChange(mounted)).code).toBe('read n\nif n mod 2 = 0\n    print "even"\notherwise\n    print "odd"');
    });
  },
};

export const PciScoring: Story = {
  args: { properties: { scoring: "pci" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("a record: the test cases run on every change, without the candidate's Run", async () => {
      await addBlock(canvas, "total ← ___");
      let response = await lastChange(mounted);
      expect(integer(response, "score")).toBe(0);
      expect(integer(response, "maxscore")).toBe(3);
      expect(integer(response, "test3")).toBe(0);
      expect(field(response, "test4")).toBeUndefined();
      await userEvent.type(canvas.getByRole("textbox", { name: "Blank 1 on line 2" }), "0");
      await addBlock(canvas, "for i from ___ to ___");
      await userEvent.type(canvas.getByRole("textbox", { name: "Blank 1 on line 3" }), "1");
      await userEvent.type(canvas.getByRole("textbox", { name: "Blank 2 on line 3" }), "n");
      await addBlock(canvas, "total ← total ___ i");
      handle(canvas, 4).focus();
      await userEvent.keyboard("{ArrowRight}");
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Blank 1 on line 4" }), "*");
      await addBlock(canvas, "print total");
      handle(canvas, 5).focus();
      await userEvent.keyboard("{ArrowLeft}");
      response = pci.getResponse();
      expect(integer(response, "score")).toBe(0); // 0 × i stays 0
      expect(integer(response, "test2")).toBe(0);
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Blank 1 on line 4" }), "+");
      response = pci.getResponse();
      expect(integer(response, "score")).toBe(3);
      expect(integer(response, "correct")).toBe(1);
      expect(field(response, "code")!.string).toBe("read n\ntotal ← 0\nfor i from 1 to n\n    total ← total + i\nprint total");
      expect(JSON.parse(field(response, "program")!.string!).dropdown).toEqual([{ "b3.3": "+" }]);
      expect(pci.evaluation().results[2]).toEqual({ passed: true, output: ["55"] });
    });
  },
};

export const CodeScoring: Story = {
  args: { properties: { scoring: "code" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await buildSum(canvas);
    expect(pci.getResponse()).toEqual({ base: { string: "read n\ntotal ← 0\nfor i from 1 to n\n    total ← total + i\nprint total" } });
    // the correct response an authoring system gets: the author's solution as code
    expect(pci.getCorrectResponse({ scoring: "code" })).toEqual(pci.getResponse());
    expect(pci.getCorrectResponse({})).toBeUndefined();
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    expect(canvas.getByTestId("prompt")).toHaveTextContent(/^Maak een programma/);
    expect(lines(canvas)).toEqual(["lees n"]);
    await userEvent.click(canvas.getByRole("button", { name: "Blok toevoegen: toon totaal" }));
    expect(canvas.getByRole("status")).toHaveTextContent("“toon totaal” toegevoegd op regel 2.");
    await userEvent.click(canvas.getByRole("button", { name: "Uitvoeren" }));
    expect(canvas.getByTestId("error")).toHaveTextContent("Fout op regel 2: de variabele totaal heeft nog geen waarde.");
  },
};

export const French: Story = {
  args: { properties: { language: "fr" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    expect(lines(canvas)).toEqual(["lire n"]);
    await userEvent.click(canvas.getByRole("button", { name: "Ajouter le bloc : pour i de ___ à ___" }));
    await userEvent.click(canvas.getByRole("button", { name: "Exécuter" }));
    expect(canvas.getByTestId("error")).toHaveTextContent("Erreur à la ligne 2 : remplis tous les trous.");
  },
};

export const RestoreState: Story = {
  play: async ({ canvasElement, step }) => {
    const first = await openPci(canvasElement);
    await buildSum(first.canvas);
    await userEvent.click(first.canvas.getByRole("button", { name: "Run" }));
    const saved = first.pci.getState();
    const response = first.pci.getResponse();

    await step("the state brings back the program, the input and the output", async () => {
      const { canvas, pci: again } = await remountPci(canvasElement, pci, { state: saved });
      expect(lines(canvas)).toEqual(["read n", "total ← 0", "for i from 1 to n", "  total ← total + i", "print total"]);
      expect(output(canvas)).toEqual(["15"]);
      expect(again.getResponse()).toEqual(response);
      const log = JSON.parse(again.getState()).log.map((a: { type: string }) => a.type);
      expect(log).toEqual(expect.arrayContaining(["ADD", "SET_VALUE", "INDENT", "OUTDENT", "RUN"]));
    });

    await step("a response handed back (boundTo) brings back the program and its result", async () => {
      const { canvas, pci: again } = await remountPci(canvasElement, pci, { boundTo: { RESPONSE: response! } });
      await waitFor(() => expect(lines(canvas)).toHaveLength(5));
      expect(output(canvas)).toEqual(["15"]);
      expect(canvas.getByRole("button", { name: "Add block: print total" })).toBeDisabled();
      expect(again.getResponse()).toEqual(response);
    });

    await step("start over: back to the starting program", async () => {
      const { canvas, pci: again } = await remountPci(canvasElement, pci, { state: saved });
      await userEvent.click(canvas.getByRole("button", { name: "Start over" }));
      await userEvent.click(canvas.getByRole("button", { name: "Yes, start over" }));
      expect(lines(canvas)).toEqual(["read n"]);
      expect(again.getResponse()).toBeUndefined();
    });
  },
};

export const Review: Story = {
  args: {
    status: "review",
    boundTo: {
      RESPONSE: { base: { string: JSON.stringify({ result: ["0"], code: "", codeblock: [{ id: "p1", type: "input" }, { id: "b1", type: "set" }, { id: "b4", type: "print" }], textbox: [{ "b1.2": "0" }], dropdown: [] }) } },
    },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(lines(canvas)).toEqual(["read n", "total ← 0", "print total"]);
    expect(output(canvas)).toEqual(["0"]);
    expect(canvas.queryByTestId("palette")).toBeNull();
    expect(canvas.queryByRole("button", { name: "Run" })).toBeNull();
    expect(canvas.queryByRole("button", { name: /^Line \d/ })).toBeNull();
    expect(canvas.getByRole("textbox", { name: "Blank 1 on line 2" })).toBeDisabled();
    expect(canvas.getByRole("textbox", { name: "Input" })).toHaveAttribute("readonly");
    expect(json(pci.getResponse()).textbox).toEqual([{ "b1.2": "0" }]);
  },
};

export const Solution: Story = {
  args: { status: "solution" },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the author's solution, with its output for the author's input
    expect(lines(canvas)).toEqual(["read n", "total ← 0", "for i from 1 to n", "  total ← total + i", "print total"]);
    expect(output(canvas)).toEqual(["15"]);
    expect(json(pci.getResponse()).result).toEqual(["15"]);
  },
};

export const SolutionFromTheDeclaration: Story = {
  args: {
    status: "solution",
    properties: { scoring: "code" },
    responseDeclaration: { correctResponse: { value: ["read n\ntotal ← 0\nfor i from 1 to n\n    total ← total * i\nprint total"] } },
  },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    expect(lines(canvas)).toEqual(["read n", "total ← 0", "for i from 1 to n", "  total ← total * i", "print total"]);
    expect(output(canvas)).toEqual(["0"]);
  },
};

export const Settings: Story = {
  args: {
    width: 420,
    properties: {
      prompt: "Count down from 3.",
      blocks: "set: {k} ← {3}\nwhile: while {k} {>|<} {0}\nprint: print {k}\nset: {k} ← {k - 1}\nrepeat: repeat {} times",
      program: "set: {k} ← {3}\nwhile: while {k} {>|<} {0}\n    print: print {k}",
      solution: "k ← 3\nwhile k > 0\n    print k\n    k ← k - 1",
      inputs: "",
      maxBlocks: "4",
      tests: "=> 3; 2; 1",
      scoring: "pci",
    },
  },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("a starting program, narrow: one column", async () => {
      expect(lines(canvas)).toEqual(["k ← 3", "while k ___ 0", "  print k"]);
      expect(canvas.getByTestId("count")).toHaveTextContent("3 of 4 blocks");
      const palette = canvas.getByTestId("palette").getBoundingClientRect();
      const program = canvas.getByTestId("program").getBoundingClientRect();
      expect(program.top).toBeGreaterThan(palette.bottom - 1);
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("the program is full at four blocks", async () => {
      handle(canvas, 3).focus();
      await addBlock(canvas, "k ← k - 1");
      expect(lines(canvas)).toEqual(["k ← 3", "while k ___ 0", "  print k", "  k ← k - 1"]);
      expect(canvas.getByRole("button", { name: "Add block: repeat ___ times" })).toBeDisabled();
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Blank 1 on line 2" }), ">");
      const response = await lastChange(mounted);
      expect(integer(response, "correct")).toBe(1);
    });
  },
};

// --- Authoring mode: what an authoring system shows the item author (getAuthoringInstance)

type AuthoringStory = StoryObj<AuthoringArgs>;
const tab = (canvas: Canvas, name: string) => userEvent.click(canvas.getByRole("tab", { name }));
const card = (canvas: Canvas, n: number) => within(canvas.getByTestId(`block-${n}`));

export const AuthoringMode: AuthoringStory = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", width: 1000 },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);

    await step("starts from the example: its blocks, which ones are distractors, no problems", async () => {
      expect(instance.validate()).toEqual([]);
      expect(canvas.getByTestId("checks")).toHaveTextContent("No problems found.");
      expect(within(canvas.getByTestId("author-blocks")).getAllByRole("listitem")).toHaveLength(8);
      expect(card(canvas, 1).getByTestId("badge")).toHaveTextContent("in the solution");
      expect(card(canvas, 5).getByTestId("badge")).toHaveTextContent("distractor");
      expect(card(canvas, 8).getByTestId("badge")).toHaveTextContent("not in the palette");
      expect(card(canvas, 3).getByRole("textbox", { name: "Label" })).toHaveValue("{total} ← {total} {+|-|*} {i}");
      expect(card(canvas, 3).getByRole("combobox", { name: "Type of part 3" })).toHaveValue("choice");
      // nothing changed: the item keeps its own (empty) text, so it stays the example
      expect(instance.getProperties()).toEqual({ blocks: "", program: "", solution: "", inputs: "", tests: "" });
    });

    await step("add a print block with a dropdown", async () => {
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Kind of the new block" }), "print");
      await userEvent.click(canvas.getByRole("button", { name: "+ Add block" }));
      expect(canvas.getByTestId("author-status")).toHaveTextContent("Block 9 added.");
      const b9 = card(canvas, 9);
      expect(b9.getByRole("textbox", { name: "Label" })).toHaveValue("print {}");
      await userEvent.selectOptions(b9.getByRole("combobox", { name: "Type of part 1" }), "choice");
      expect(instance.validate()).toEqual(["Block 9, part 1: a dropdown needs at least two choices."]);
      await retype(b9.getByRole("textbox", { name: "Choices of part 1, separated by |" }), '"done"|"ready"');
      expect(b9.getByRole("textbox", { name: "Label" })).toHaveValue('print {"done"|"ready"}');
      expect(b9.getByTestId("badge")).toHaveTextContent("distractor");
      expect(instance.validate()).toEqual([]);
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("put it in the solution, in the candidate's editor: the tests now fail", async () => {
      await tab(canvas, "Solution");
      await userEvent.click(canvas.getByRole("button", { name: "Add block: print ___" }));
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Blank 1 on line 6" }), '"done"');
      expect(within(canvas.getByTestId("solution-output")).getByText("done")).toBeInTheDocument();
      expect(instance.validate()).toEqual([
        "Test 1: the solution does not print the expected output.",
        "Test 2: the solution does not print the expected output.",
        "Test 3: the solution does not print the expected output.",
      ]);
    });

    await step("fill in the tests by running the solution", async () => {
      await tab(canvas, "Input and tests");
      expect(within(canvas.getByTestId("test-1")).getByTestId("test-status")).toHaveTextContent("✗ fails");
      await userEvent.click(canvas.getByRole("button", { name: "Fill in the expected output from the solution" }));
      expect(canvas.getByRole("textbox", { name: "Expected output of test 3, one line per line" })).toHaveValue("55\ndone");
      expect(within(canvas.getByTestId("test-1")).getByTestId("test-status")).toHaveTextContent("✓ passes");
      expect(instance.validate()).toEqual([]);
    });

    await step("the settings written: text, the same the candidate's PCI reads", async () => {
      const written = instance.getProperties();
      expect(written.blocks.split("\n").at(-1)).toBe('print: print {"done"|"ready"}');
      expect(written.program).toBe("* input: read {n}");
      expect(written.solution).toBe('read n\ntotal ← 0\nfor i from 1 to n\n    total ← total + i\nprint total\nprint "done"');
      expect(written.tests).toBe("5 => 15; done\n1 => 1; done\n10 => 55; done");
      const s = parseSettings(written);
      expect(s.problems).toEqual([]);
      expect(programText(s, s.solution!)).toBe('read n\ntotal ← 0\nfor i from 1 to n\n    total ← total + i\nprint total\nprint "done"');
    });
  },
};

const IF_ELSE = {
  blocks: 'input: read {n}\nifelse: if {n mod 2 = 0} | otherwise\nprint: print {"even"|"odd"}\nprint: print {n}',
  program: "* input: read {n}\nifelse: if {n mod 2 = 0} | otherwise\notherwise",
  solution: 'read n\nif n mod 2 = 0\n    print "even"\notherwise\n    print "odd"',
  inputs: "7",
  tests: "4 => even\n7 => odd",
  reuse: "true",
};

export const AuthoringRoundTrip: AuthoringStory = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", width: 900, properties: IF_ELSE },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    const own = { blocks: IF_ELSE.blocks, program: IF_ELSE.program, solution: IF_ELSE.solution, inputs: IF_ELSE.inputs, tests: IF_ELSE.tests };

    await step("the item's text comes back unchanged", async () => {
      expect(instance.validate()).toEqual([]);
      expect(instance.getProperties()).toEqual(own);
      expect(card(canvas, 2).getByRole("textbox", { name: "Else line" })).toHaveValue("otherwise");
      expect(card(canvas, 4).getByTestId("badge")).toHaveTextContent("distractor");
    });

    await step("the starting program: unlock a block, lock another; back to the same text", async () => {
      await tab(canvas, "Starting program");
      const lockRead = canvas.getByRole("checkbox", { name: "Locked: read n" });
      expect(lockRead).toBeChecked();
      await userEvent.click(lockRead);
      await userEvent.click(canvas.getByRole("checkbox", { name: "Locked: if n mod 2 = 0" }));
      expect(instance.getProperties().program).toBe("read n\n* if n mod 2 = 0\notherwise"); // read n is a block of the palette: plain code
      await userEvent.click(canvas.getByRole("checkbox", { name: "Locked: if n mod 2 = 0" }));
      await userEvent.click(canvas.getByRole("checkbox", { name: "Locked: read n" }));
      expect(instance.getProperties()).toEqual(own);
    });

    await step("start from the solution; the text reads back as the same programs", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Start from the solution" }));
      expect(canvas.getByTestId("author-status")).toHaveTextContent("The starting program is now a copy of the solution.");
      const written = instance.getProperties();
      expect(written.program).toBe(IF_ELSE.solution);
      const s = parseSettings({ ...IF_ELSE, ...written });
      expect(programText(s, s.start)).toBe(programText(s, s.solution!));
    });

    await step("the tabs work with the arrow keys", async () => {
      canvas.getByRole("tab", { name: "Starting program" }).focus();
      await userEvent.keyboard("{ArrowRight}");
      await waitFor(() => expect(canvas.getByRole("tab", { name: "Input and tests" })).toHaveAttribute("aria-selected", "true"));
      expect(canvas.getByRole("textbox", { name: "Input at the start" })).toHaveValue("7");
    });
  },
};

export const AuthoringValidation: AuthoringStory = {
  render: (args) => mountAuthoring(pci, args),
  args: {
    language: "nl",
    width: 520,
    properties: { blocks: "set: {x} ← {}\nprint: print {x}", solution: "x ← 2\nprint x", tests: "=> 2", scoring: "pci", maxBlocks: "2" },
  },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);

    await step("Dutch texts; a valid start", async () => {
      expect(canvas.getByRole("tab", { name: "Blokken" })).toHaveAttribute("aria-selected", "true");
      expect(instance.validate()).toEqual([]);
    });

    await step("a kind that needs more parts, a dropdown with one choice, a name that is not a name", async () => {
      await userEvent.selectOptions(card(canvas, 2).getByRole("combobox", { name: "Soort" }), "for");
      expect(instance.validate()).toContain("Blok 2: deze soort blok heeft 3 delen tussen accolades nodig (variabele, van, tot).");
      await userEvent.selectOptions(card(canvas, 2).getByRole("combobox", { name: "Soort" }), "print");
      await userEvent.selectOptions(card(canvas, 1).getByRole("combobox", { name: "Soort van deel 2" }), "choice");
      await retype(card(canvas, 1).getByRole("textbox", { name: "Keuzes van deel 2, gescheiden door |" }), "2|");
      await retype(card(canvas, 1).getByRole("textbox", { name: "Tekst van deel 1" }), "2x");
      expect(instance.validate()).toEqual([
        "Blok 1, deel 2: een keuzelijst heeft minstens twee keuzes nodig.",
        "Blok 1, deel 1: “2x” is geen naam voor een variabele.",
        "Test 1: de oplossing toont niet de verwachte uitvoer.",
      ]);
      expect(within(canvas.getByTestId("errors")).getAllByRole("listitem")).toHaveLength(3);
    });

    await step("too many blocks for the limit, no tests while the PCI scores with tests", async () => {
      await retype(card(canvas, 1).getByRole("textbox", { name: "Tekst van deel 1" }), "x");
      await retype(card(canvas, 1).getByRole("textbox", { name: "Keuzes van deel 2, gescheiden door |" }), "2|3");
      expect(instance.validate()).toEqual([]);
      await tab(canvas, "Oplossing");
      await userEvent.click(canvas.getByRole("button", { name: "Blok toevoegen: print x" }));
      expect(instance.validate()).toEqual(["De oplossing heeft meer dan 2 blokken, het meeste dat een programma mag hebben.", "Test 1: de oplossing toont niet de verwachte uitvoer."]);
      await tab(canvas, "Invoer en tests");
      await userEvent.click(canvas.getByRole("button", { name: "Test 1 verwijderen" }));
      expect(instance.validate()).toContain("Scoren met testgevallen vraagt minstens één test.");
      expect(canvas.getByTestId("checks")).toHaveTextContent("2 problemen op te lossen");
    });
  },
};

export const Nesting: Story = {
  args: {
    properties: {
      prompt: "Blocks inside blocks: an if/else in a for in a repeat, and an empty while.",
      blocks: "repeat: repeat {2} times\nfor: for {i} from {1} to {2}\nifelse: if {i = 1} | else\nprint: print {}\nwhile: while {false}",
      program: [
        "repeat: repeat {2} times",
        "    for: for {i} from {1} to {2}",
        "        ifelse: if {i = 1} | else",
        "            print: print {\"one\"}",
        "        else",
        "            print: print {i}",
        "* while: while {false}",
      ].join("\n"),
      reuse: "true",
      inputs: "",
    },
  },
  play: async ({ canvasElement, step }) => {
    const { canvas } = await openPci(canvasElement);
    const piece = (n: number) => canvas.getByTestId(`line-${n}`).querySelector<HTMLElement>("[data-piece]")!;
    const arms = (n: number) => [...canvas.getByTestId(`line-${n}`).querySelectorAll<HTMLElement>(":scope > [data-arm]")];
    const left = (el: Element) => Math.round(el.getBoundingClientRect().left);

    await step("three levels: each arm lines up under the top piece of its own C", async () => {
      expect(lines(canvas)).toEqual(["repeat 2 times", "  for i from 1 to 2", "    if i = 1", '      print "one"', "    else", "      print i", "while false"]);
      const deepest = arms(4);
      expect(deepest).toHaveLength(3);
      expect(deepest.map(left)).toEqual([left(piece(1)), left(piece(2)), left(piece(3))]);
      // the inner C's arm is inside the outer one's mouth
      expect(left(arms(2)[0])).toBeLessThan(left(piece(2)));
    });

    await step("every C is closed by a bottom bar that nothing covers, also when the block below is selected", async () => {
      const root = canvas.getByTestId("program").getRootNode() as ShadowRoot;
      const bars = [...canvas.getByTestId("program").querySelectorAll<HTMLElement>("[data-end]")];
      expect(bars).toHaveLength(4); // repeat, for, if/else, while
      handle(canvas, 6).focus(); // selected, right above three bottom bars
      await afterPaint();
      for (const bar of bars) {
        const r = bar.getBoundingClientRect();
        expect(r.width).toBeGreaterThan(90);
        expect(root.elementFromPoint(r.left + r.width - 12, r.top + r.height / 2)).toBe(bar);
      }
    });

    await step("the empty C has a mouth to drop a block into; the locked C is striped as a whole", async () => {
      const empty = canvas.getByTestId("program").querySelector("[data-row='n6:body:empty']")!;
      expect(empty).toHaveTextContent("Put a block here");
      expect(piece(7).className).toContain("cb-locked");
      expect(canvas.getByTestId("program").querySelector("[data-row='n6:end'] [data-end]")!.className).toContain("cb-locked");
      expect(empty.querySelector("[data-arm]")!.className).toContain("cb-locked");
      await dragTo(canvas.getByRole("button", { name: "Add block: print ___" }), empty);
      expect(lines(canvas).slice(-2)).toEqual(["while false", "  print ___"]);
    });

    await step("it runs", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Run" }));
      expect(canvas.getByTestId("error")).toHaveTextContent("Error on line 8: fill in every blank.");
    });
  },
};
