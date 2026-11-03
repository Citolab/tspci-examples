// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/oat-sa/extension-tao-itemqti-pci/tree/develop/views/js/pciCreator/ims/mathEntryInteraction,
// © 2016-2022 Open Assessment Technologies SA (Christophe Noël)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// MathLive (MIT, https://mathlive.io) replaces the original's MathQuill: the editable formula, the read-only
// expression with editable gaps, and the on-screen keyboard.
import { MathfieldElement } from "mathlive";
import type { VirtualKeyboardLayout } from "mathlive";
import fonts from "./mathlive-fonts.generated";
import { ToolId, tools } from "./tools";
import { Texts } from "./texts";

export { MathfieldElement };

let prepared = false;

/**
 * Once per page: the KaTeX fonts as @font-face rules in the document (fonts declared inside a shadow root are not
 * used), no loading of fonts or sounds from a directory next to the script (the PCI is one file).
 */
export const prepareMathLive = () => {
  if (prepared) return;
  prepared = true;
  MathfieldElement.fontsDirectory = null;
  MathfieldElement.soundsDirectory = null;
  MathfieldElement.keypressSound = null;
  MathfieldElement.plonkSound = null;
  if (!document.getElementById("tspci-math-entry-fonts")) {
    const style = document.createElement("style");
    style.id = "tspci-math-entry-fonts";
    style.textContent = fonts;
    document.head.appendChild(style);
  }
};

/**
 * A mathfield in `host`, set up like the original's MathQuill field: no menu, the space bar as the author decided.
 * MathLive takes most options only once the field is in the page, so it is mounted first.
 */
export const createMathfield = (host: HTMLElement, options: { whiteSpace: boolean; label: string; id: string }) => {
  prepareMathLive();
  const mf = new MathfieldElement();
  mf.id = options.id;
  mf.setAttribute("aria-label", options.label);
  host.appendChild(mf);
  mf.mathVirtualKeyboardPolicy = "manual"; // the PCI's own button shows it
  mf.menuItems = [];
  mf.popoverPolicy = "off";
  mf.mathModeSpace = options.whiteSpace ? "\\:" : "";
  // a caret in an empty slot (▢, 1em wide) is drawn after it; move it inside the box
  const style = document.createElement("style");
  style.textContent = ".ML__placeholder-selected + .ML__caret::after { left: -0.7em; }";
  mf.shadowRoot?.appendChild(style);
  return mf;
};

/**
 * The on-screen keyboard: numbers and the basic operations, the author's tools (when there are any) and letters.
 * MathLive has one keyboard per page, so a mathfield sets it when it gets the focus.
 */
export const keyboardLayouts = (enabled: ToolId[], texts: Texts): (VirtualKeyboardLayout | "alphabetic")[] => {
  const numbers: VirtualKeyboardLayout = {
    label: "123",
    tooltip: texts.keypad,
    rows: [
      ["x", "y", "[separator-5]", "[7]", "[8]", "[9]", "[/]", "[separator-5]", "[(]", "[)]"],
      ["a", "b", "[separator-5]", "[4]", "[5]", "[6]", "[*]", "[separator-5]", "[left]", "[right]"],
      ["n", "m", "[separator-5]", "[1]", "[2]", "[3]", "[-]", "[separator-5]", { label: "[backspace]", width: 2 }],
      [",", "[separator]", "[separator-5]", "[0]", "[.]", "[=]", "[+]", "[separator-5]", { label: "[hide-keyboard]", width: 2 }],
    ],
  } as unknown as VirtualKeyboardLayout;
  const layouts: (VirtualKeyboardLayout | "alphabetic")[] = [numbers];
  if (enabled.length) {
    const keys = enabled.map((id) => ({ latex: tools[id].keycap, insert: tools[id].insert, tooltip: texts.tools[id] }));
    const rows: (typeof keys)[] = [];
    for (let i = 0; i < keys.length; i += 8) rows.push(keys.slice(i, i + 8));
    layouts.push({ label: "∑√π", tooltip: texts.toolsLayer, rows } as unknown as VirtualKeyboardLayout);
  }
  layouts.push("alphabetic");
  return layouts;
};
