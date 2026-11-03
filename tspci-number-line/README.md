# @citolab/pci-number-line

> [!WARNING]
> **Experimental (alpha). Just for inspiration.** This PCI is a technical showcase, made by software developers without
> much knowledge of the subject it could be used for. Its content, terms and scoring have not been checked by subject
> experts or assessment specialists, and it has never been used in an assessment. It is offered as is, without any
> warranty.

A QTI 3 Portable Custom Interaction (PCI) with a number line (Dutch: *getallenlijn*) for arithmetic. The candidate
places points on the line, marks an interval, draws jumps for addition and subtraction, or reads off values and fills
in missing numbers. The numbers can be integers, decimals, fractions or negatives. The item author sets up the line
and the correct answer in the PCI itself. The response is the values, which a QTI response processing scores with a
margin, or a record with a score from the PCI. Made with [tspci](https://github.com/Citolab/tspci).

<p align="center">
  <img src="https://raw.githubusercontent.com/Citolab/tspci-examples/main/tspci-number-line/example.png" alt="Three number lines from −3 to 8 in quarters: points A at 2 3/4 and B at −1 1/4; jumps from 2, +4 to 6 and −3 to 3, with the sum 2 + 4 − 3 = 3; and the interval 3 < x ≤ 6 with an open and a closed end" width="560">
</p>

## What it does

- **The line**: horizontal, or vertical like a thermometer (`data-orientation`). Ticks every `data-tick-step` (`1`,
  `0.1`, `1/4`, `1/3`). A number at every `data-label-step`, shown as decimals (`2.75`), fractions (`11/4`) or mixed
  numbers (`2 3/4`), with the fractions stacked. Negatives use a real minus sign. Arrows at both ends show that the
  line runs on. `data-hidden-labels` hides numbers that the candidate has to work out.
- **Place points** (`data-mode="points"`): the points (A, B, …) wait in a tray above the line. The candidate drags one
  onto the line, or chooses one and clicks the line (a click with nothing chosen places the next one). A placed point
  can be dragged along the line, or dragged away from it to take it off. Points snap to the ticks, to half ticks, or
  to a tenth of a tick, which is nearly free (`data-snap`).
- **Mark an interval** (`data-mode="interval"`): the candidate drags along the line. A click on an end, or the radio
  buttons, makes that end closed (● included), open (○ not included) or unbounded, so that it runs on with an arrow.
  This covers "x ≥ −2", "between 3 and 5" and "x < 4".
- **Jumps** (`data-mode="jumps"`): from the start (given, or placed by the candidate), every click on the line is a
  jump from where the candidate is. Additions are solid arcs, subtractions dashed ones. Both have an arrowhead and a
  label (`+4`, `−3`), so colour is never the only cue. A landing point can be dragged to change its jump.
- **Read off** (`data-mode="read"`): the line shows labelled points, and the candidate types their values in the
  boxes below. A box can also sit in place of a tick's number. Input accepts `3`, `−1,5`, `2.75`, `2 3/4`, `2¾` and
  `11/4`. Letters are refused while typing, and an input that is not a number gets a message.
- **Keyboard**: every point, interval end, start and landing point is a `slider`. The arrow keys move it one snap
  step. Shift + arrow, or Page Up/Down, moves it a labelled step (coarse). Home and End go to the ends of the line.
  Delete takes a point off the line, or removes the last jump. Enter or Space makes an interval end open or closed.
  Enter on a point in the tray puts it in the middle of the line. A live status line says what changed ("A at 2 3/4.",
  "Jump 2: −3, from 6 to 3.", "Interval: x ≥ −2.").
- **Values shown** (`data-show-values`, off by default because it gives the answer away): the value on each point's
  tag, the interval as an inequality, and the jumps as a sum ("2 + 4 − 3 = 3"). For accessibility, a screen reader
  always hears the value of a slider.
- **Language**: `data-language` `en` or `nl` sets the texts and how numbers look (`2,75` in Dutch). The response never
  depends on the language.
- **Authoring mode**: the item author sets up the line (from, to, tick distance, numbers at every, format) and clicks
  numbers on the line to hide them. The author places the correct points, interval or jumps on the same line the
  candidate gets, or lists the points and boxes to read off with their values. The author also sets the margin, and
  gets the response processing for it. `validate()` reports, in the author's language: a broken range or tick
  distance, too many ticks, numbers that are not on a multiple of the tick distance, a point without a label, place or
  room on the line, a duplicate label, a box not at a tick, a correct value the candidate cannot snap to, or a
  missing interval or jumps.
- **Delivery**: the candidate's answer is saved as the item's state (every change in the log) and restored. In review
  (`status: "solution"`) the PCI shows, read-only, the correct response from the response declaration, or else the
  one from the settings. Several interactions of this type on one page each get their own object.
- **Logic** (`src/numberline.ts`, no imports, tested in node with `npm test`): parsing and formatting numbers,
  fractions by continued fractions, ticks, snapping, intervals, jumps, the response, the PCI's scoring, the authoring
  checks and the response processing.

## What can be configured

Every setting is a `data-` attribute of the interaction, as text. `dist/authoring.json` describes them for authoring
systems. The settings marked *(pci)* are written by the authoring mode.

| setting                     | attribute                 | default                 | what                                                                           |
| --------------------------- | ------------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| Instruction                 | `data-prompt`             | the example's question  | also part of the line's accessible name; the example's text follows the mode   |
| What the candidate does     | `data-mode`               | `points`                | `points`, `interval`, `jumps` or `read`                                        |
| Start / end of the line     | `data-min`, `data-max`    | `-3`, `8`               | *(pci)* numbers, fractions allowed                                             |
| Distance between ticks      | `data-tick-step`          | `1/4`                   | *(pci)* at most 400 ticks                                                      |
| A number at every           | `data-label-step`         | `1`                     | *(pci)* a multiple of the tick distance; `0`: only at the ends                 |
| Numbers as                  | `data-number-format`      | `mixed`                 | *(pci)* `decimal`, `fraction` or `mixed`                                       |
| Hidden numbers              | `data-hidden-labels`      | empty                   | *(pci)* separated by semicolons: `2; 5 1/2` (a comma can be a decimal comma)   |
| Task and correct answer     | `data-task`               | empty: the example      | *(pci)* JSON, below                                                            |
| Points snap to              | `data-snap`               | `tick`                  | `tick`, `half` or `tenth` (of a tick); also the arrow keys' fine step          |
| Direction                   | `data-orientation`        | `horizontal`            | or `vertical`                                                                  |
| Length of the line          | `data-length`             | `640`                   | px, 240 to 1200                                                                |
| Show the values             | `data-show-values`        | `false`                 | gives the answer away                                                          |
| Scoring                     | `data-scoring`            | `qti`                   | `qti`: the values; `pci`: a record with the score (below)                      |
| Language                    | `data-language`           | `en`                    | `en` or `nl`: texts and numbers                                                |

```json
{
  "points": [{ "label": "A", "answer": 2.75 }, { "label": "B", "answer": -1.25 }],
  "interval": { "from": -2, "to": 8, "fromEnd": "closed", "toEnd": "none" },
  "jumps": { "givenStart": true, "answer": [2, 6, 3] },
  "read": [{ "kind": "point", "label": "A", "value": 4.5 }, { "kind": "tick", "label": "", "value": 6 }],
  "tolerance": 0
}
```

- Only the section of the item's mode counts. There are at most 8 points or read items.
- `interval`: an end is `closed`, `open` or `none` (unbounded, with no value). The text form `"[-2,inf)"` also works.
- `jumps.answer`: the start and every landing, at most 7 jumps. With `givenStart` the candidate starts at the first
  value, and that start is not scored.
- `read`: a `point` is drawn with its label and has an input box below the line. A `tick` hides that tick's number
  and puts an input box in its place.
- `tolerance`: the margin, absolute, for the PCI's scoring and the generated response processing.

## Scoring

`authoring.json`: `"scoring": ["match_correct", "custom", "human"]`, `"correctResponse": "properties"`.
`getCorrectResponse(properties)` gives the correct response from `data-task`.

**`data-scoring="qti"` (default): the values.** The response is reported once the answer is complete. Until then
`getResponse()` gives nothing, and `qti-interaction-changed` has `valid: false`.

| mode       | response                                                  | example                  |
| ---------- | --------------------------------------------------------- | ------------------------ |
| `points`   | `ordered` `float`: one per point, in the order of the task, once every point is placed | `[2.75, -1.25]` |
| `read`     | `ordered` `float`: one per read item, once every box holds a number | `[4.5, -1.75, 6]`  |
| `jumps`    | `ordered` `float`: the start and every landing             | `[2, 6, 3]`              |
| `interval` | `single` `string`: `[` / `(` for a closed / open end, `-inf` / `inf` for no end | `"[-2,inf)"`, `"(3,5]"` |

The numbers have a point and up to 9 decimals (a third is `0.333333333`), whatever the language.

- `match_correct` works when the points snap to the correct values (the default `data-snap="tick"`).
- **Margins and partial scores**: one point per value within the margin. The authoring mode writes this response
  processing (and copies it). For the example:

```xml
<qti-response-declaration identifier="RESPONSE" cardinality="ordered" base-type="float"/>
<qti-outcome-declaration identifier="SCORE" cardinality="single" base-type="float">
  <qti-default-value><qti-value>0</qti-value></qti-default-value>
</qti-outcome-declaration>
<qti-outcome-declaration identifier="MAXSCORE" cardinality="single" base-type="float">
  <qti-default-value><qti-value>2</qti-value></qti-default-value>
</qti-outcome-declaration>
…
<qti-response-processing>
  <!-- point A: 2.75 (± 0.25) -->
  <qti-response-condition>
    <qti-response-if>
      <qti-equal tolerance-mode="absolute" tolerance="0.25"><qti-index n="1"><qti-variable identifier="RESPONSE"/></qti-index><qti-base-value base-type="float">2.75</qti-base-value></qti-equal>
      <qti-set-outcome-value identifier="SCORE">
        <qti-sum><qti-variable identifier="SCORE"/><qti-base-value base-type="float">1</qti-base-value></qti-sum>
      </qti-set-outcome-value>
    </qti-response-if>
  </qti-response-condition>
  <!-- point B: -1.25 (± 0.25): the same with qti-index n="2" -->
</qti-response-processing>
```

  For jumps, each landing is one condition (and the start too, when the candidate places it). To check only where
  the candidate lands, compare the last index. For an interval, use a `<qti-match>` against the string. A margin on
  an interval needs `data-scoring="pci"`.

**`data-scoring="pci"`: a record (`custom`).** The PCI scores with the task's correct answer and margin. It reports as
soon as the candidate does anything, so a half-finished answer still gets partial credit. Declare
`cardinality="record"`.

| field               | type      | what                                                                                 |
| ------------------- | --------- | ------------------------------------------------------------------------------------ |
| `score`             | `integer` | the checks that pass                                                                 |
| `maxscore`          | `integer` | the number of checks                                                                 |
| `correct`           | `integer` | 1 when every check passes (jumps: also no jump more or less than the correct route)  |
| `check1` … `check8` | `integer` | 1 or 0: per point / read item; per end of the interval (the kind and, unless it has no end, the value); per position of the route (without a given start) |
| `answer`            | `string`  | the answer as text: `"2.75 ?"` (`?` not placed), `"[-2,inf)"`, `"2 6 3"`             |

Copy `score` to `SCORE` as in [tspci-circuit-builder](../tspci-circuit-builder/README.md#scoring), or test single
fields with `<qti-field-value field-identifier="check2">`. `human`: use the PCI without automatic scoring, for example for
practice.

**State and response.** `getState()` holds the candidate's answer (and the log). `setResponse` (and `boundTo` without
a state) reads an ordered float list, an interval string, values as one text (`"2.75 -1.25"`), or the `answer` field
of a record. In `status: "solution"` the declared correct response is shown, in any of those forms. Without one, the
PCI shows the correct answer from `data-task`.

## Using it

```sh
npm install @citolab/pci-number-line
```

| file                                       | what                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `dist/index.js`                            | the PCI (AMD module, everything bundled: the package has no dependencies) |
| `dist/authoring.json`                      | settings, response, scoring and the authoring mode, for authoring systems |
| `dist/sbom.cdx.json`                       | CycloneDX SBOM of the bundle                                              |
| `dist/tao-pci-numberLine_<version>.zip`    | the PCI for TAO: Settings → Portable Custom Interactions → Add            |
| `numberLine.svg`, `example.png`            | icon and screenshot                                                       |

In a QTI 3 item, with `index.js` at `resources/pci/index.js` of the package:

```xml
<qti-response-declaration identifier="RESPONSE" cardinality="ordered" base-type="float"/>
…
<qti-portable-custom-interaction response-identifier="RESPONSE" module="pci" custom-interaction-type-identifier="numberLine"
  data-language="nl" data-mode="points" data-min="-3" data-max="8" data-tick-step="1/4" data-label-step="1" data-number-format="mixed"
  data-prompt="Zet punt A bij 2,75 en punt B bij −1¼." data-task="{&quot;points&quot;:[{&quot;label&quot;:&quot;A&quot;,&quot;answer&quot;:2.75},{&quot;label&quot;:&quot;B&quot;,&quot;answer&quot;:-1.25}]}">
  <qti-interaction-modules>
    <qti-interaction-module id="pci" primary-path="../resources/pci/index"></qti-interaction-module>
  </qti-interaction-modules>
  <qti-interaction-markup></qti-interaction-markup>
</qti-portable-custom-interaction>
```

Source and the other examples: [Citolab/tspci-examples](https://github.com/Citolab/tspci-examples).
