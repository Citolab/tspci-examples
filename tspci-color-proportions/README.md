# @citolab/pci-verhoudingen

A QTI 3 Portable Custom Interaction (PCI) in which the candidate colours the parts of a shape, to show proportions.
Made with [tspci](https://github.com/Citolab/tspci).

<p align="center">
  <img src="https://raw.githubusercontent.com/Citolab/tspci-examples/main/tspci-color-proportions/example.png" alt="A rectangle split in parts, coloured red, blue and green" width="240">
</p>

- Colours, instruction, size and the text of the "start over" button can be set; an eraser and "start over"
- Authoring mode: the item author draws the shape (a rectangle split by lines that snap to 1/4, 1/8 or 1/16) in the
  PCI itself (`getAuthoringInstance`), via "Configure…" in an authoring system that supports it. Without it, the PCI
  shows its standard shape
- The response is the proportion per colour: every colouring with the same proportions gives the same response, so the
  item scores with `match_correct`. The item author sets the correct response by colouring it (TAO, qti-construction)

## In the package

| file                                     | what                                                              |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `dist/index.js`                          | the PCI (AMD module, everything bundled: the package has no dependencies) |
| `dist/authoring.json`                    | settings, response, scoring and the authoring mode, for authoring systems |
| `dist/sbom.cdx.json`                     | CycloneDX SBOM of the bundle                                      |
| `dist/tao-pci-colorProportions_<version>.zip` | the PCI for TAO: Settings → Portable Custom Interactions → Add |
| `colorProportions.svg`, `example.png`    | icon and screenshot                                               |

## In a QTI 3 item

```xml
<qti-portable-custom-interaction response-identifier="RESPONSE" module="pci" custom-interaction-type-identifier="colorProportions"
  data-colors="#dc2626, #2563eb">
  <qti-interaction-modules>
    <qti-interaction-module id="pci" primary-path="../resources/pci/index"></qti-interaction-module>
  </qti-interaction-modules>
  <qti-interaction-markup></qti-interaction-markup>
</qti-portable-custom-interaction>
```

with `<qti-response-declaration identifier="RESPONSE" cardinality="single" base-type="string">`.

## Settings

Each one is a `data-` attribute of the interaction, as text.

| attribute          | editor    | default                         |                                                   |
| ------------------ | --------- | ------------------------------- | ------------------------------------------------- |
| `data-instruction` | textarea  | `Colour the shapes with your mouse.` | instruction                                  |
| `data-colors`      | colorList | `#dc2626, #2563eb, #16a34a`     | colours to choose from                            |
| `data-reset-label` | text      | `Start over`                    | text of the reset button                          |
| `data-width`       | integer   | `360` (≥ 200)                   | width (px)                                        |
| `data-height`      | integer   | `500` (≥ 200)                   | height (px)                                       |
| `data-partition`   | pci       | empty: the standard shape       | the shape, as JSON, written by the authoring mode |

Source and the other examples: [Citolab/tspci-examples](https://github.com/Citolab/tspci-examples).
