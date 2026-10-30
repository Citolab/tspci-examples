# @citolab/pci-3d-blocks

A QTI 3 Portable Custom Interaction (PCI) in which the candidate builds with toy bricks on a baseplate, to match a
building shown in the item. Made with [tspci](https://github.com/Citolab/tspci).

<p align="center">
  <img src="https://raw.githubusercontent.com/Citolab/tspci-examples/main/tspci-3d-blocks/example.png" alt="Bricks on a baseplate, with the label front" width="320">
</p>

- three.js (rounded bricks with studs, soft shadows, orbit controls), bundled in `dist/index.js`
- The response is the front, side and top view of the build: every build with the same views gives the same response,
  so the item scores with `match_correct`
- The item author sets the correct response by building it (TAO, qti-construction)

## In the package

| file                          | what                                                                        |
| ----------------------------- | --------------------------------------------------------------------------- |
| `dist/index.js`               | the PCI (AMD module, everything bundled: the package has no dependencies)   |
| `dist/authoring.json`         | settings, response and scoring, for authoring systems                       |
| `dist/sbom.cdx.json`          | CycloneDX SBOM of the bundle                                                |
| `dist/tao-pci-blocks_<version>.zip` | the PCI for TAO: Settings → Portable Custom Interactions → Add        |
| `blocks.svg`, `example.png`   | icon and screenshot                                                         |

## In a QTI 3 item

```xml
<qti-portable-custom-interaction response-identifier="RESPONSE" module="pci" custom-interaction-type-identifier="blocks"
  data-grid-divisions="3" data-brick-color-mode="single">
  <qti-interaction-modules>
    <qti-interaction-module id="pci" primary-path="../resources/pci/index"></qti-interaction-module>
  </qti-interaction-modules>
  <qti-interaction-markup></qti-interaction-markup>
</qti-portable-custom-interaction>
```

with `<qti-response-declaration identifier="RESPONSE" cardinality="single" base-type="string">`.

## Settings

Each one is a `data-` attribute of the interaction, as text.

| attribute               | editor    | default                                              |                                   |
| ----------------------- | --------- | ---------------------------------------------------- | --------------------------------- |
| `data-grid-divisions`   | integer   | `2` (1–6)                                            | grid size (cells per side)        |
| `data-cube-pixel-size`  | integer   | `60`                                                 | brick size                        |
| `data-front-label`      | text      | `front`                                              | label at the front                |
| `data-brick-color-mode` | enum      | `mixed`                                              | `mixed` (multiple colours) or `single` |
| `data-brick-colors`     | colorList | `#c91a09, #f2cd37, #0055bf, #237841, #fe8a18, #5aa5dc` | colours (one colour: the first) |
| `data-baseplate-color`  | color     | `#4b9f4a`                                            | baseplate colour                  |
| `data-width`            | integer   | `400`                                                | width (px)                        |
| `data-height`           | integer   | `400`                                                | height (px)                       |

Source and the other examples: [Citolab/tspci-examples](https://github.com/Citolab/tspci-examples).
