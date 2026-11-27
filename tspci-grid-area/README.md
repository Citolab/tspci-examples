# @citolab/pci-grid-area

> [!WARNING]
> **Experimental (alpha). Just for inspiration.** This PCI is a technical showcase, made by software developers without
> much knowledge of the subject it could be used for. Its content, terms and scoring have not been checked by subject
> experts or assessment specialists, and it has never been used in an assessment. It is offered as is, without any
> warranty.

A QTI 3 Portable Custom Interaction (PCI) for area and perimeter on squared paper (Dutch: *oppervlakte en omtrek op
ruitjespapier*), as Dutch primary schools teach it. The pupil colours squares on a grid to draw a shape with a given
area or perimeter, writes the area and perimeter of a shape the author drew, or says which of two shapes is larger.
Many drawings can be right, so the PCI does not compare a drawing with an answer: it measures it and checks the rules
of the item. Made with [tspci](https://github.com/Citolab/tspci).

<p align="center">
  <img src="https://raw.githubusercontent.com/Citolab/tspci-examples/main/tspci-grid-area/example.png" alt="Squared paper of 12 by 8 squares with a hatched rectangle of 4 by 3 squares with a dark outline, the question to draw a rectangle with area 12 and perimeter 14, a Clear button and the unit 1 square = 1 cm²" width="560">
</p>

## What it does

- **Squared paper** of 2 to 24 by 2 to 16 squares (12 × 8 by default), drawn as SVG, with an optional unit under it
  ("1 hokje = 1 cm²").
- **Three tasks** (`task`):
  - `draw`: the pupil draws a shape. The item asks for an area, a perimeter or both ("a rectangle with area 12 and
    perimeter 14", "any shape with area 10"), and the PCI checks the rules.
  - `measure`: the author's shape is shown and the pupil writes its area and/or perimeter in boxes.
  - `compare`: the author's shapes A and B side by side, and the pupil chooses the one with the larger area (or
    perimeter), or "both the same".
- **Drawing.** A click on an empty square colours it, a click on a coloured square removes it. A drag from an empty
  square colours every square it passes, a drag from a coloured square erases. **Clear** empties the grid.
- **Half squares** (`halves`): a square cut along a diagonal. A second click on a coloured square makes it a half (the
  top-left triangle), the next clicks turn it clockwise (top right, bottom right, bottom left), and one more empties
  the square. A half counts 0.5 for the area.
- **Keyboard.** The grid is an ARIA grid with one square in the tab order: the arrow keys (and Home, End) move a dashed
  cursor, Space or Enter is a click, Delete or Backspace empties the square. A grid that cannot be drawn on (measure,
  compare, review) can be explored the same way.
- **Not only colour.** Coloured squares are hatched (shape B in a comparison: dotted, in another colour) and the shape
  has a dark outline: the line the perimeter measures. Every square has an accessible name with its row, column and
  what it holds ("Row 3, column 4: half coloured, top-left half"), and is `aria-selected` when coloured.
- **The pupil does not see the measurements**: no counter of squares or edges, as that would give the answer away.
- **Texts** in English or Dutch (`language`): the hint under the grid, the button, the labels and the screen reader
  names.

### What the PCI computes

All of it in [src/grid.ts](./src/grid.ts), without a DOM, tested in node (`npm test`):

| check | what it is |
| --- | --- |
| area | the number of squares; a half counts 0.5 |
| perimeter | the length of the outline in grid units: every grid line with the shape on one side only, so the inside of a ring counts too. **Only along grid lines**: a shape with half squares has slanting sides, which are not a whole number of units (√2 each), and then it has no perimeter (the field is left out of the response, and a target perimeter is never met) |
| connected | one piece: two squares belong together when they share a side; squares that only touch at a corner are two pieces. A half joins a neighbour only along a side it covers |
| holes | empty parts the shape encloses. Squares that touch at a corner close a hole (the corner point is part of the shape); against the edge of the grid nothing is closed, the outside goes on beyond it |
| rectangle | an upright rectangle of whole squares (a square too); a tilted square of halves is not one |
| meets the rules | something is drawn, as one piece without holes, with the area and perimeter of the settings (where given), and a rectangle when that is asked |

## Settings

| setting | editor | what it does |
| --- | --- | --- |
| `title`, `question` | `text`, `textarea` | above the grid; empty: none |
| `task` | `enum` | `draw` (default), `measure` or `compare` |
| `language` | `enum` | `en` or `nl`: the PCI's own texts |
| `columns`, `rows` | `integer` | the squares across (2–24) and down (2–16) |
| `unitLabel` | `text` | the unit under the grid, e.g. `1 hokje = 1 cm²`; empty: none |
| `halves` | `boolean` | half squares |
| `targetArea`, `targetPerimeter` | `number` | draw: the area and perimeter the shape must have; empty: any |
| `mustBeRectangle` | `boolean` | draw: the shape must be a rectangle |
| `ask` | `enum` | measure: `both` (default), `area` or `perimeter` |
| `compareBy` | `enum` | compare: `area` (default) or `perimeter` |
| `shape` | `pci` | draw: an example answer, shown as the solution; measure: the shape to measure; compare: shape A |
| `shapeB` | `pci` | compare: shape B |

The defaults are the example above: draw a rectangle with area 12 and perimeter 14 on a 12 × 8 grid, with a 4 × 3
rectangle as the example answer.

**A shape as text.** `shape`, `shapeB` and the `shape` field of the response are the rows of the grid, top to bottom,
separated by `/`, one character per square: `.` empty, `#` coloured, and the halves `a` (top left), `b` (top right), `c`
(bottom right) and `d` (bottom left), clockwise. Empty squares at the end of a row and empty rows at the end are left
out: `//..####/..####/..####` is a 4 × 3 rectangle from the third column of the third row.

### Authoring mode

`shape` and `shapeB` have `"editor": "pci"`: the authoring system's "Draw the shapes…" button opens the PCI's own editor
(`getAuthoringInstance`), the grid of the item's settings where the author draws the shape (and shape B in a
comparison) as a pupil draws. Next to each shape it shows what the PCI computes of it (area, perimeter, one piece, holes,
rectangle and, for a drawing task, whether it meets the rules) and, in a comparison, the correct answer. `validate()`
keeps Done from finishing, in the author's language, when there is nothing to measure or compare, when a perimeter is
asked of a shape with slanting sides, when the example answer does not meet the rules, or when no shape on the grid can
meet them (a rectangle of 12 with perimeter 15, an odd perimeter, a perimeter too short or too long for the area).
Without the editor the PCI works with the text of the settings, or the defaults.

## Response and scoring

The response is a `record`, with the fields of the task (`when` in `config.tspci.response`). Nothing is reported until
the pupil drew a square, typed a number or chose a shape.

| field | type | task | what it is |
| --- | --- | --- | --- |
| `area` | `float` | draw | the area in squares (`7.5` with halves) |
| `perimeter` | `float` | draw | the perimeter in grid units; **left out** when the shape has slanting sides |
| `connected` | `boolean` | draw | one piece |
| `noHoles` | `boolean` | draw | no holes |
| `rectangle` | `boolean` | draw | an upright rectangle of whole squares |
| `meetsRules` | `boolean` | draw | one piece without holes, with the target area and perimeter, and a rectangle if asked |
| `shape` | `string` | draw | the drawing as text (above), for a rater and to restore it |
| `areaAnswer` | `float` | measure (`ask` area or both) | the number the pupil wrote: `12`, `7,5`, `7.5`, `7½` or `7 1/2`; left out while it is not a number |
| `perimeterAnswer` | `float` | measure (`ask` perimeter or both) | the same, for the perimeter |
| `choice` | `identifier` | compare | `A`, `B` or `same` |

```json
{ "record": [
  { "name": "area", "base": { "float": 12 } }, { "name": "perimeter", "base": { "float": 14 } },
  { "name": "connected", "base": { "boolean": true } }, { "name": "noHoles", "base": { "boolean": true } },
  { "name": "rectangle", "base": { "boolean": true } }, { "name": "meetsRules", "base": { "boolean": true } },
  { "name": "shape", "base": { "string": "//..####/..####/..####" } }
] }
```

`getCorrectResponse` (`"correctResponse": "properties"`) gives the correct response from the settings:

- **measure**: `areaAnswer` and/or `perimeterAnswer` of the author's shape (none without a shape, or when a perimeter is
  asked of a shape with slanting sides). The answer is unique, so `match_correct` works: the pupil's record is the
  correct one when every asked number is right.
- **compare**: `choice`, the larger shape (none when there is no perimeter to compare). `match_correct` works.
- **draw**: many shapes are right, so there is no single response. It gives **only the fields that must be true**:
  `connected`, `noHoles`, `meetsRules`, and `rectangle` when a rectangle is asked. That is not a response a pupil's
  record can match: the pupil's record also holds the area, the perimeter and the shape, which differ from drawing to
  drawing, so `match` on the whole record fails for every pupil. **Score a drawing with `custom`**: response processing
  that tests the fields one by one, for example `meetsRules` alone, or a point per field of the correct response.
  `match_correct` (the author draws one shape in a preview) would only give a point for that one drawing in that one
  place; do not use it for `draw`.

**A drawing (`custom`)**: one point when the drawing meets the rules.

```xml
<qti-response-declaration identifier="RESPONSE" cardinality="record"/>
…
<qti-response-processing>
  <qti-response-condition>
    <qti-response-if>
      <qti-match>
        <qti-field-value field-identifier="meetsRules"><qti-variable identifier="RESPONSE"/></qti-field-value>
        <qti-base-value base-type="boolean">true</qti-base-value>
      </qti-match>
      <qti-set-outcome-value identifier="SCORE"><qti-base-value base-type="float">1</qti-base-value></qti-set-outcome-value>
    </qti-response-if>
  </qti-response-condition>
</qti-response-processing>
```

A rule can also give part of the score, e.g. a point for the right area (`qti-equal` on the `area` field) and a point for
`meetsRules`, or look at `connected` and `noHoles` for feedback. A missing field (no `perimeter` with slanting sides) is
NULL in response processing, so a comparison with it is not true.

**Measuring**: `match_correct` with the correct response from the settings, or, to give a point per number and to stay
clear of comparing floats with `match`, a `custom` rule with `qti-equal` per field:

```xml
<qti-response-condition>
  <qti-response-if>
    <qti-equal tolerance-mode="exact">
      <qti-field-value field-identifier="areaAnswer"><qti-variable identifier="RESPONSE"/></qti-field-value>
      <qti-base-value base-type="float">6</qti-base-value>
    </qti-equal>
    <qti-set-outcome-value identifier="SCORE">
      <qti-sum><qti-variable identifier="SCORE"/><qti-base-value base-type="float">1</qti-base-value></qti-sum>
    </qti-set-outcome-value>
  </qti-response-if>
</qti-response-condition>
```

`human`: the `shape` field and the state hold the drawing, for a rater.

### State, restore and solution

- `getState()` holds the drawing, the typed answers and the choice (and the log of actions). A state of a grid of
  another size is ignored.
- `setResponse` and `boundTo` restore a response: the `shape` field of a drawing, the numbers of a measurement, the
  choice of a comparison. The other fields of a drawing follow from the shape.
- `status: "solution"` shows the correct response, read-only: the declared correct response of the item, or the one from
  the settings. For a drawing: the `shape` field of the declared correct response if it has one, else the author's
  example shape (the `shape` setting), else nothing.
- Every change fires `qti-interaction-changed`, also one that does not change the response (a typed `7,` that is not a
  number yet), so the player saves the state. Several instances on one page each keep their own grid.

## Development

```bash
npm install
npm run dev           # the dev page, with the settings
npm test              # the geometry, rules and response (src/grid.ts) in node
npm run test:stories  # the Storybook tests
```
