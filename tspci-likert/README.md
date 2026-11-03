# @citolab/pci-likert

A QTI 3 Portable Custom Interaction (PCI) with a Likert scale: the candidate picks one of 2 to 10 levels between two
labels ("Strongly disagree" … "Strongly agree"). A port of TAO's `likertScoreInteraction`, the PCI used to certify IMS
PCI support. Made with [tspci](https://github.com/Citolab/tspci).

<p align="center">
  <img src="https://raw.githubusercontent.com/Citolab/tspci-examples/main/tspci-likert/example.png" alt="A 7-point scale from Strongly disagree to Strongly agree with thumb icons and numbers, level 5 chosen" width="560">
</p>

## Source and licence

This PCI is a derivative work of
[`likertScoreInteraction`](https://github.com/oat-sa/extension-tao-itemqti-pci/tree/develop/views/js/pciCreator/ims/likertScoreInteraction)
in [oat-sa/extension-tao-itemqti-pci](https://github.com/oat-sa/extension-tao-itemqti-pci), © 2016-2024
Open Assessment Technologies SA. That extension is licensed under the GNU General Public License version 2 only
(`GPL-2.0-only`, as stated in its `composer.json` and in the headers of its files), so this PCI is too: see
[LICENSE](LICENSE). This differs from the MIT licence of the other examples in this repository.

What changed, by Stichting Cito Instituut voor Toetsontwikkeling (2026):

- Ported from TAO's AMD modules to an IMS PCI v1.0 module built with tspci (Preact, Tailwind, shadow DOM).
- A new UI: a fieldset of real radio buttons with the question as the legend, large touch targets, a layout that
  puts the end labels above the scale on narrow screens, and screen-reader texts in English and Dutch.
- The settings are described in `src/config.json`, so TAO (via `npm run package-tao`) and other authoring systems
  build the properties form from them; the TAO-only creator code was not ported.
- The thumb icons are redrawn; the original's response format, settings and state are kept (see below).

## What it does

- **Choose**: click or tap a level, or Tab into the scale and use the arrow keys. A screen reader hears the question,
  then "3 of 7", and at the ends "1 of 7, lowest: Strongly disagree".
- **Styles**: radio buttons (the default), stars (a rating: every star up to the chosen one fills), smileys (from a
  frown to a smile, red to green when chosen) or numbered buttons. Underneath each style are the same radio buttons,
  so keyboard use and screen-reader texts do not change.
- **Icons and numbers**: optionally a thumb down and up at the ends, and the level numbers above the choices.
- **Delivery**: the choice is saved as the item's state and restored; a state saved by the original PCI
  (`{ response: { base: { integer } } }`) is restored as well. In review (`status: "solution"`) the PCI shows the
  correct response when the delivery system passes it.

## What can be configured

Every setting is a `data-` attribute of the interaction, as text. `dist/authoring.json` describes them for authoring
systems.

| setting                        | attribute         | default                                      | what                                                |
| ------------------------------ | ----------------- | -------------------------------------------- | --------------------------------------------------- |
| Question above the scale       | `data-prompt`     | `How much do you agree with this statement?` | also the accessible name of the scale               |
| Number of levels               | `data-level`      | `5`                                          | 2 to 10, like the original                          |
| Label at the low end           | `data-label-min`  | `min`                                        | the original's `label-min` (also read as `labelMin`) |
| Label at the high end          | `data-label-max`  | `max`                                        | the original's `label-max` (also read as `labelMax`) |
| Style of the choices           | `data-style`      | `radio`                                      | `radio`, `stars`, `smileys` or `buttons`            |
| Show icons at each end         | `data-icons`      | `false`                                      | thumb down at the low end, thumb up at the high end |
| Show numbers above the choices | `data-numbers`    | `false`                                      |                                                     |
| Language                       | `data-language`   | `en`                                         | `en` or `nl`: the texts for screen readers          |

## Scoring

The PCI is made for a scale that is not scored, like the original (`authoring.json`: `"scoring": ["human", "custom"]`;
the original sets `NONE` on creation and offers `custom`).

**The response** is an integer (`cardinality="single" base-type="integer"`): the chosen level, `1` (the low end) to the
number of levels (the high end).

- **No response**: until the candidate chooses, `getResponse()` reports nothing. The original reported `0`; a `0`
  handed to the PCI is still read as "no answer".
- `custom`: write your own response processing, for instance to sum the levels of several items or to map them
  (reverse-scored statements: `level + 1 - value`).
- Changing the number of levels makes a chosen level above the new maximum invalid.

## Using it

```sh
npm install @citolab/pci-likert
```

| file                                   | what                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `dist/index.js`                        | the PCI (AMD module, everything bundled: the package has no dependencies) |
| `dist/authoring.json`                  | settings, response and scoring, for authoring systems                     |
| `dist/sbom.cdx.json`                   | CycloneDX SBOM of the bundle                                              |
| `dist/tao-pci-likert_<version>.zip`    | the PCI for TAO: Settings → Portable Custom Interactions → Add            |
| `likert.svg`, `example.png`            | icon and screenshot                                                       |

In a QTI 3 item, with `index.js` at `resources/pci/index.js` of the package:

```xml
<qti-response-declaration identifier="RESPONSE" cardinality="single" base-type="integer"/>
…
<qti-portable-custom-interaction response-identifier="RESPONSE" module="pci" custom-interaction-type-identifier="likert"
  data-prompt="I enjoy solving maths problems." data-level="7"
  data-label-min="Strongly disagree" data-label-max="Strongly agree" data-icons="true" data-numbers="true">
  <qti-interaction-modules>
    <qti-interaction-module id="pci" primary-path="../resources/pci/index"></qti-interaction-module>
  </qti-interaction-modules>
  <qti-interaction-markup></qti-interaction-markup>
</qti-portable-custom-interaction>
```

The type identifier is `likert`, not `likertScoreInteraction`, so it can sit next to TAO's own Likert PCI.

Source and the other examples: [Citolab/tspci-examples](https://github.com/Citolab/tspci-examples).
