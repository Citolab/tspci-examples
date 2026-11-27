# Agent instructions for tspci-examples

## Porting open-source PCIs: credit the authors and keep their licence

When an example is a port of an existing open-source PCI, or takes ideas from one (its interaction, scenario, model,
response format or scoring), we credit the original authors and take over the original licence. **This applies even
when we rewrote it entirely and use no code or images of the original.** "Written from scratch, so it can stay MIT" is
not a reason to drop the original licence. We do this because it is the fair thing to do towards the people whose work
we build on, not only because the law may require it.

For such an example:

- **`LICENSE`**: the full text of the original licence in the example's folder (copy one from an existing port, e.g.
  `tspci-bee-colony/LICENSE` for GPL-2.0 or `tspci-paint/LICENSE` for GPL-3.0). Use the exact SPDX id, e.g.
  `GPL-2.0-only`, not `GPL-2.0-or-later`, unless the original says "or later".
- **`package.json`**: `"license"` set to that SPDX id, the original authors in `"contributors"` (who, and which original
  PCI), and `"LICENSE"` in `"files"` so it is published.
- **`package-lock.json`**: the root package's `"license"` updated to match.
- **Source files**: no licence header needed in each file; `package.json` and `LICENSE` are enough. (Some older ports
  have SPDX headers in their source files; those can stay.)
- **Example README**: a "Source and licence" section with a link to the original, its authors, its licence and where
  that licence is stated, and what we changed or added.
- **Root `readme.md`**: a row in the table under "Ports of open-source PCIs" (example, original with link, licence), and
  the count of ports in the introduction.

Before porting, check the original's licence (its `LICENSE`, `composer.json`/`package.json` and file headers; when they
disagree, follow the strictest). If it has no licence, or one we cannot take over (e.g. AGPL for a bundled application),
ask before porting. The rest of this repository is MIT (the root `LICENSE`); a licence that differs from it must be
stated in the example's README.

## Building or changing a PCI

What every example has to do, besides what the tspci readme and each example's AUTHORING.md say.

- **2D or 3D**: 2D interactions are SVG and HTML. three.js only for an interaction that is really 3D.
- **Touch**: every action works with a tap or a drag of a finger, on a tablet as well as with a mouse.
  - Hover may add a hint, never an action: a touchscreen has no hover.
  - Pointer events, not mouse events; `touch-action: none` only on what is dragged, so a finger can still scroll the
    page and lists everywhere else. Browsers ignore `touch-action` on elements inside an SVG (a `<rect>`, a `<g>`): put
    it on the `<svg>` itself or on an HTML element.
  - A tap counts when the finger lifts within about 10 px of where it went down and the browser did not cancel it
    (`pointercancel`): a real finger moves a little, and a swipe to scroll must not act. Two fingers down is a pinch,
    never a tap.
  - Do not capture the pointer on a handle when the cells or targets under the finger need `pointerenter` (a fill
    handle, painting): on touch the capture sends every event to the handle.
  - Targets at least 24 × 24 px (WCAG 2.5.8), 44 px for the main actions where it fits.
  - A popover or menu closes on a tap outside it with a `pointerdown` listener, not only on focus loss: Safari on
    iPad and iPhone does not move the focus on a tap.
  - Check it with Playwright's touch emulation, e.g. `browser.newContext({ ...devices["iPad (gen 7)"] })` and
    `page.touchscreen.tap()`.
- **Keyboard**: everything works without a mouse.
  - Tab follows the order a pupil works in (start, first jump, its landing, …), whatever the layout on screen.
  - Something that moves along a scale is a `slider` (arrow keys, Page Up/Down, Home/End).
  - Escape closes a popover and gives the focus back to what opened it. After adding something, the focus goes to
    where the pupil writes next.
  - A button that disables or removes itself (Undo at the first step, Remove, − at the minimum, Start again) moves
    the focus first, to the next sensible control; otherwise it falls to the page. Move it after the key event, or the
    newly focused button also gets the Enter.
- **Screen readers**: an accessible name for every box and control ("Jump 2: lands on"), and a live region for what
  changes out of sight.
- **Colour is never the only cue**: add a dash, pattern, sign or text, and use colour-blind safe colours (the
  Okabe-Ito colours in tspci-number-line).
- **Languages**: English and Dutch texts with a `language` setting; Dutch numbers with a decimal comma.
- **The PCI's duties**:
  - Nothing is reported until the pupil answered.
  - `qti-interaction-changed` on every change.
  - `getState()` and restoring it; `boundTo` and `setResponse`.
  - Status `solution` shows the correct response, read-only.
  - Several instances on one page each have their own state.
  - `getCorrectResponse` when the answer follows from the settings.
- **Scoring Dutch primary maths models** (ratio table, empty and double number line, written calculation): report
  the answer and check the working against the pupil's own numbers, whatever the route. Do not compare with one model
  answer. A mode that only shows something (a clock as an image) is not scored: `config.tspci.toolWhen`.
- **No reproductions of protected designs**, such as real euro coins and banknotes: draw stylised ones.
- **Tests**:
  - The logic in a module without imports, tested with `node --test` (`npm test`).
  - Stories with tests next to the source (`npm run test:stories`), and one story without a play function to try it
    by hand.
  - In a story, `userEvent.keyboard` and `userEvent.tab` do not reach inside the PCI's shadow root: type into the
    element itself, or dispatch the key event on it.
- **A new example**:
  - Its README starts with the "Experimental (alpha)" warning.
  - It gets a row in both tables of the root `readme.md`, and the counts in the introduction and in "Alpha examples"
    go up.
