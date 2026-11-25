# tspci-ratio-table

> [!WARNING]
> **Experimental (alpha). Just for inspiration.** This PCI is a technical showcase, made by software developers without
> much knowledge of the subject it could be used for. Its content, terms and scoring have not been checked by subject
> experts or assessment specialists, and it has never been used in an assessment. It is offered as is, without any
> warranty.

A QTI 3 Portable Custom Interaction (PCI) with a ratio table (Dutch: *verhoudingstabel*), as Dutch primary schools
teach it. The candidate fills in the table on screen as on paper: a label in front of each row, the numbers they know,
an arrow from one column to the next with × or : and a number, and what they do above, they do below. The number in
the answer cell (bottom right) is the answer, and shows again under the table. Made with [tspci](https://github.com/Citolab/tspci).

The table follows the 8-step method of
[Verhoudingstabellen: uitleg én een handig 8-stappenplan](https://wijzeroverdebasisschool.nl/uitleg/verhoudingstabellen)
(Wijzer over de Basisschool), and takes its look from that page: Roboto, the lines of a table drawn on paper, curved
arrows with the step on them.

## What it does

- **Two rows**, each with a label the candidate writes ("aantal kilometers", "aantal minuten"), or one the author gives.
- **Two to five columns.** A round **+** on the line between two columns inserts a column there: the explanation's tip
  to leave room for a step in between (20 km → 4 km → 12 km). The **+** at the end adds one at the end. The bin under a
  column removes it. A column with a number the author gave stays.
- **Arrows** from every column to the next, above and below the table, each with a step such as ":5" or "×3". Nothing
  is chosen at the start, so the candidate decides: the arrow shows the two buttons **×** and **:**. After a click only
  the chosen operator stays, next to its number, so the step reads as on paper, and the focus moves on to the number.
  A small undo button next to it brings the two buttons back.
- **Numbers** as a candidate writes them: `14`, `0,5`, `1,20` or `8.40`, and `?` for the unknown.
- **The answer cell** has a dashed teal outline and a `?` until it is filled in. It is the bottom-right cell, as in
  the worked examples (the question's unknown in the bottom row, last column). An author who puts `?` in a given row
  chooses another cell; that one moves with its column when columns are inserted or added. Its number is the response.
  A decimal comma or point both work. Text that is not a number (`14 min`) is no answer, and the cell is invalid until
  it is fixed.
- **The answer** under the table is read-only: it shows the answer cell, with a label that is a setting (`Answer` or
  `Antwoord` by default).
- The table, the arrows and the labels are the candidate's working: they are saved in the state (and restored), not
  scored. The explanation says it plainly: everyone's table can be different, the answer is the same.

## Settings

| setting | editor | what it does |
| --- | --- | --- |
| `title`, `question` | `text`, `textarea` | above the table |
| `mode` | `enum` | `answer` (default): score the answer; `working`: score the answer and the working; `tool`: scratch paper, not scored, no answer under the table |
| `correctAnswer` | `text` | the correct answer, for `working` (`14`, `8,40`) |
| `language` | `enum` | `en` or `nl`: the table's own texts (placeholders, buttons, screen reader labels) |
| `answerLabel` | `text` | the label of the answer under the table; empty: `Answer` or `Antwoord`, by the language |
| `columns` | `integer` (2–5) | columns at the start |
| `labelTop`, `labelBottom` | `text` | a label the author gives (locked); empty: the candidate writes it |
| `valuesTop`, `valuesBottom` | `text` | numbers the author gives (locked), separated by `;`, e.g. `20; 12` and `50; ?`; the first `?` is the answer cell |

## Response and scoring

The PCI does not score: it reports a `record`, and the item's scoring decides what counts. Nothing is reported until
the answer cell holds a number.

| field | type | mode | what it is |
| --- | --- | --- | --- |
| `answer` | `float` | `answer`, `working` | the number in the answer cell (`8,40` is reported as `8.4`) |
| `working` | `boolean` | `answer`, `working` | the working is correct: `ratio`, `steps` and `stepsMatch`, and the answer cell is in a filled column |
| `answerCorrect` | `boolean` | `working` | the answer is the `correctAnswer` setting |
| `ratio` | `boolean` | `working` | every filled column has the same ratio (at least two, none half filled) |
| `steps` | `boolean` | `working` | every arrow between two filled columns has × or : and a number, and the step is right, above and below |
| `stepsMatch` | `boolean` | `working` | the step below is the step above |

**The working is checked against the student's own numbers**, not against a model table, because everyone's table may
be different (20 → 4 → 12, or 20 → 1 → 12): any route passes when it is a correct ratio table. So `working` can be true
while the answer is wrong, when the student started from a misread number. Numbers the author gives (`valuesTop`,
`valuesBottom`) are in the table, and then the ratio check also checks that the student used the question's numbers.

- **`answer` mode**: the author answers the PCI in a preview to set the correct response, and scores the `answer` field
  (within a margin if needed). `working` is there for a rule that also wants a correct working, or for reports.
- **`working` mode**: `getCorrectResponse` gives the correct response from `correctAnswer` (every check true), so
  `match_correct` means "right answer, correct working". A `custom` rule can give part of the score per field, e.g.
  1 point for `answerCorrect` and 1 for `working`.
- **`tool` mode**: no response; the item asks for the answer elsewhere (`config.tspci.toolWhen`).

The table itself (labels, numbers, arrows) is saved in the state, so a human rater (`human`) can look at it.

## Fonts

Roboto (400, 500 and 900, Latin) is bundled from [Fontsource](https://fontsource.org/fonts/roboto), under the SIL Open
Font License 1.1 ([src/fonts/OFL.txt](./src/fonts/OFL.txt)). The PCI adds it to the page under its own name, so it does
not change the fonts of the item around it.

## Development

```bash
npm install
npm run dev           # the dev page, with the settings
npm run test:stories  # the Storybook tests
```
