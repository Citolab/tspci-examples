# @citolab/pci-money

> [!WARNING]
> **Experimental (alpha). Just for inspiration.** This PCI is a technical showcase, made by software developers without
> much knowledge of the subject it could be used for. Its content, terms and scoring have not been checked by subject
> experts or assessment specialists, and it has never been used in an assessment. It is offered as is, without any
> warranty.

A QTI 3 Portable Custom Interaction (PCI) for money sums (Dutch: *rekenen met geld*), as Dutch primary schools teach
them. The candidate pays an amount exactly, or with as few coins and notes as possible. Or they give the change, or
count the money on a counter. They drag coins and notes from a supply onto a counter, or click them. The money is in
euros, US dollars, British pounds or a currency of the author's own, and in an authoring mode the author chooses the
coins and notes: which ones, coin or note, their colour and how many. Made with
[tspci](https://github.com/Citolab/tspci).

<p align="center">
  <img src="https://raw.githubusercontent.com/Citolab/tspci-examples/main/tspci-money/example.png" alt="A price tag of €3.65, a customer who pays with a note of €5 and two coins of 50 cent, and on the counter the change: coins of €2, 20, 10 and 5 cent; below it the supply of notes from €50 to €5 and coins from €2 to 5 cent, each with a minus button and the number on the counter" width="560">
</p>

## What it does

- **Five tasks** (the `task` setting):
  - `pay`: pay an amount exactly (€ 7,35), with any coins and notes;
  - `fewest`: pay it with as few coins and notes as possible;
  - `change`: the price and what the customer pays with; give the change (*wisselgeld*), with any coins and notes;
  - `changeFewest`: give the change with as few coins and notes as possible;
  - `count`: the counter holds the author's money; the candidate writes how much it is in an answer box.
- **The task card** shows the amount on a price tag. For change it also shows the price and the customer's money.
  The amount is always visible, because the correct response depends on it.
- **The counter** is where the money goes. Notes lie on the first row and coins on the second, each kind together,
  from large to small, and every piece can be counted. A setting can show the total.
- **The supply** has a compartment for each coin and note:
  - The piece is a button. Drag it onto the counter, click it, or press Enter or Space on it to add one.
  - The **−** button takes one off the counter, and next to it is the number of that piece on the counter.
  - With a limited supply, the compartment also says how many are left.
  - To take a piece off the counter, you can also drag it off or click it.
- **Keyboard and screen reader.** You can do everything with the buttons in the supply. Every button has a name,
  such as "Add a coin of 50 cents" or "Een munt van 50 cent erbij". After every change, a live region says what is
  on the counter, such as "On the counter: 1 note of €5, 1 coin of €2, …". The money in the count task is a list of
  named images.
- **Four currencies** (the `currency` setting): euro, US dollar, British pound, or one of the author's own (its sign,
  before or after the amount, and a minor unit or none). See [Currencies](#currencies).
- **Amounts** are written the way the currency and the language write them: "€ 7,35" in Dutch and "€7.35" in English,
  "$7.35" and "35¢", "£7.35" and "35p", "7,35 kr" or "R$ 7,35". The answer box accepts the currency's forms: `7,35`,
  `7.35`, `€ 7,35`, `7`, `7,-`; `$7.35`, `35¢`; `£7.35`, `35p`; `7,35 kr`, `50 øre`. Something else makes the box
  invalid (`checkValidity()` is false) and is no answer.
- **Read-only** (review, solution): the counter or the answer box, without the supply.
- **The author sees what is wrong** with the settings, above the task: no amount, a customer who pays too little, an
  amount that these coins and notes can not make (€ 7,33 without 1 and 2 cent), money in the task that is not one of
  the coins and notes, or a currency of one's own without a sign.
- **An authoring mode** ("Coins and notes…") for the currency and its coins and notes. See
  [Authoring mode](#authoring-mode).

### The coins and notes are drawings, not the real ones

Reproducing real coins and notes is restricted, so the PCI draws stylised pieces in SVG and uses none of the real
designs: no portraits, buildings, maps, flags or signatures.

- A **coin** is a plain disc with its value and its unit in words (50 CENT, 2 EURO, 25 CENTS, 1 POUND). It is copper,
  gold, silver, two metals (a silver centre in a gold ring, or a gold centre in a silver ring) or any colour the author
  picks. The euro's € 1 is silver in gold and its € 2 gold in silver, as the real ones.
- A **note** is a coloured rectangle with its value and unit in a white panel, the sign of the currency in a pattern of
  rings. The preset colours are close to the real ones: € 5 grey, € 10 red, € 20 blue, € 50 orange, € 100 green,
  € 200 yellow; every dollar note green; £ 5 teal, £ 10 orange, £ 20 purple, £ 50 red.

The sizes keep the proportions of the real coins and notes of the presets, so a coin of 50 cent is larger than one of
5 cent, and a 10 cent coin (or a dime, or a 5p) is smaller than a 5 cent one, as it is in your purse. All dollar notes
are the same size. A coin or note that is not one of a preset (of a currency of one's own, or added by the author) gets
a size by its value: a larger value, a somewhat larger piece.

The value is always written on the piece, so colour is never the only cue, and it stays readable on any colour the
author picks: the PCI chooses dark or white text by contrast (at least 4.5:1, WCAG AA), and the value on a note is a
dark shade of the note's colour on the white panel.

## Settings

| setting | editor | what it does |
| --- | --- | --- |
| `title`, `question` | `text`, `textarea` | above the task |
| `task` | `enum` | `pay` (default), `fewest`, `change`, `changeFewest`, `count` |
| `amount` | `text` | the amount to pay, or the price (change), in the currency: `7,35`, `7.35`, `€ 7,35`, `$7.35`, `35p` |
| `given` | `text` | change: what the customer pays with, coins and notes separated by `;`: `10`, `5; 2x 0,50` |
| `countPieces` | `text` | count: the money on the counter: `10; 2x 2; 0,50; 3x 0,20; 0,05` |
| `currency` | `pci` | `eur` (default), `usd`, `gbp` or `custom` |
| `currencySign` | `pci` | `custom`: the sign, any text: `kr`, `R$`, `₣` |
| `currencyPosition` | `pci` | `custom`: `before` (default, `R$ 7,35`) or `after` (`7,35 kr`) the amount |
| `minorUnit` | `pci` | `custom`: the minor unit (a hundredth) as written after a number: `øre`, `ct`, `¢`; empty: none, only whole amounts |
| `pieces` | `pci` | the coins and notes, as JSON (below). Empty: the usual ones of the currency |
| `showTotal` | `boolean` | show the total on the counter (not in count) |
| `language` | `enum` | `en` or `nl`: the PCI's own texts and how amounts are written |

The `pci` settings are written by the [authoring mode](#authoring-mode). An authoring system without it shows them as
text fields, and the PCI works without them: the euro and its usual coins and notes.

The coins and notes in `given` and `countPieces` must be coins or notes of the currency (offered to the candidate or
not), written as amounts of it: `10; 2x 25¢` in dollars, `50p; 2x £2` in pounds. A coin or note that is not one of them
is left out, and the author sees a warning.

**`pieces`** is a JSON list, one entry per value, small to large:

```json
[
  { "value": 5, "kind": "coin", "color": "copper", "offered": true, "count": null },
  { "value": 200, "kind": "coin", "color": "goldInSilver", "offered": true, "count": 3 },
  { "value": 1000, "kind": "note", "color": "#d9675e", "offered": true, "count": null }
]
```

- `value`: in hundredths of the main unit, a whole number: `5` is 5 cent, `200` is € 2. Also for a currency without a
  minor unit (`500` is 5 kr), so the arithmetic is the same for every currency.
- `kind`: `coin` or `note`.
- `color`: a coin's `copper`, `gold`, `silver`, `silverInGold` or `goldInSilver`, or any colour as `#rrggbb`; a note's
  colour as `#rrggbb`.
- `offered`: the candidate can take it from the supply. One that is not offered can still be the customer's money or
  lie on the counter in the count task.
- `count`: how many the supply has, or `null` for as many as needed.

A field left out gets its default (the preset's kind and colour, offered, as many as needed). This replaces the
`supply` text setting of earlier alphas (`0,05; 0,10; 3x 2`): the package was not published with it.

## Currencies

| `currency` | coins | notes | offered by default |
| --- | --- | --- | --- |
| `eur` (default) | 1, 2, 5, 10, 20, 50 cent, € 1, € 2 | € 5, € 10, € 20, € 50, € 100, € 200 | all but 1 and 2 cent (Dutch practice: amounts are rounded to 5 cent) and € 100, € 200 |
| `usd` | 1¢, 5¢, 10¢, 25¢, 50¢ | $1, $2, $5, $10, $20, $50, $100 | all but 50¢ and $2 |
| `gbp` | 1p, 2p, 5p, 10p, 20p, 50p, £1, £2 | £5, £10, £20, £50 | all |
| `custom` | 1, 2, 5, 10, 20, 50 of the minor unit, 1 and 2 of the main unit | 5 to 100 | all |

The configuration is per value, so the dollar has one $1: a note by default. The author can make it a coin (gold), but
not have a $1 coin and a $1 note at the same time. Without a minor unit, a currency of one's own starts with coins of
1, 2, 5 and 10 and notes of 20 to 200.

How amounts are written:

| currency | English | Dutch | below 1 |
| --- | --- | --- | --- |
| euro | €7.35 | € 7,35 | €0.35, € 0,35 |
| dollar | $7.35 | $ 7,35 | 35¢ |
| pound | £7.35 | £ 7,35 | 35p |
| `custom`, sign after | 7.35 kr | 7,35 kr | 0,35 kr |
| `custom`, sign before | R$7.35 (CHF 7.35: a space after a sign that ends in a letter) | R$ 7,35 | R$ 0,35 |
| `custom`, no minor unit | ₣12 | ₣ 12 | (only whole amounts) |

## Authoring mode

The `pci` settings have an authoring mode ("Coins and notes…", `getAuthoringInstance`), for an authoring system that
supports it (AUTHORING.md, section 6). The author:

- **picks the currency**. A currency starts with its usual coins and notes; choosing another currency and then this one
  again gives back what the author set up for it, as long as the window is open. "Back to the usual coins and notes"
  starts over. For another currency: its sign, before or after the amount (with an example of each), and the minor
  unit.
- **sees every coin and note drawn** as the candidate will see it, and per coin or note sets whether the candidate can
  take it, whether it is a coin or a note, its colour (swatches for the metals or named colours, and the browser's
  colour picker for any other) and how many the supply has (empty: as many as needed);
- **adds** a coin or note of any value (typed as an amount of the currency: `0,25`, `25p`, `50 øre`) and **removes**
  one.

Below the list, what keeps Done from finishing (`validate()`): no coin or note offered (not in the count task), an
amount of the task that can not be paid with what is offered, money in the task (`given`, `countPieces`) that is not one
of the coins and notes, two coins or notes of the same value, a value that is not possible (0, or not whole without a
minor unit), and a currency of one's own without a sign. Every control works with a tap, a mouse or the keyboard: each
row of options is a radio group (arrow keys, Home, End), the colour swatches are buttons with a name, and after a
removal the focus goes to the next row.

## Response and scoring

The PCI reports a `record`, and the item's scoring decides what counts. Nothing is reported while the counter is
empty, or, in the count task, while the answer box does not hold an amount. The fields depend on the task:

| field | type | task | what it is |
| --- | --- | --- | --- |
| `amount` | `float` | pay, fewest, change, changeFewest | the money on the counter, in the main unit (euros, dollars, pounds: `7.35`) |
| `answer` | `float` | count | the amount written, in the main unit |
| `exact` | `boolean` | all | it is the asked amount: the price (pay, fewest), the change (change), the money on the counter (count) |
| `pieces` | `integer` | fewest, changeFewest | the number of coins and notes on the counter |
| `fewest` | `boolean` | fewest, changeFewest | they are as few coins and notes as possible **for the amount on the counter**, with the coins and notes of the supply |

The PCI counts in hundredths (cents, pence; whole numbers), so 0,10 + 0,20 is 0,30 and never 0,30000000000000004.
The response is the same in every currency, so a score rule does not depend on it.

**The fewest pieces** are computed by the PCI with the coins and notes that are offered and their counts. For the full
euro, dollar or pound range, the largest coin or note that fits always gives the fewest. That is not true for every
supply:

- Without 10 cent, 60 cent is three coins of 20 cent.
- With only one coin of € 2, € 4 is € 2 and two coins of € 1.
- Without the 5 cent coin, 30¢ is three dimes, not a quarter and five pennies.

So the PCI searches every combination, largest first, and stops a branch as soon as it can no longer do better.

`fewest` does not depend on `exact`: a wrong amount in the fewest pieces is still `fewest`. A score rule combines the
two (see below). `pay` and `change` report no `pieces`, because the number of pieces is free there, and an exact match
on it would be wrong. The coins and notes themselves are saved in the state, so a rater (`human`) can see them.

- **`match_correct`** (the default): `getCorrectResponse` gives the correct response from the settings: the asked
  amount, `exact` true, and in `fewest` and `changeFewest` the minimum `pieces` and `fewest` true. Any exact payment
  matches in `pay` and `change`, the fewest pieces in `fewest` and `changeFewest`, and the right amount in `count`.
  When the settings ask for an amount that can not be paid (`settingsProblems`), there is no correct response.
- **`custom`**: for part of the score per field. For example, in `fewest` or `changeFewest`, 2 points for exact in
  the fewest pieces, 1 point for exact:

  ```xml
  <qti-response-processing>
    <qti-response-condition>
      <qti-response-if>
        <qti-and>
          <qti-field-value field-identifier="exact"><qti-variable identifier="RESPONSE"/></qti-field-value>
          <qti-field-value field-identifier="fewest"><qti-variable identifier="RESPONSE"/></qti-field-value>
        </qti-and>
        <qti-set-outcome-value identifier="SCORE"><qti-base-value base-type="float">2</qti-base-value></qti-set-outcome-value>
      </qti-response-if>
      <qti-response-else-if>
        <qti-field-value field-identifier="exact"><qti-variable identifier="RESPONSE"/></qti-field-value>
        <qti-set-outcome-value identifier="SCORE"><qti-base-value base-type="float">1</qti-base-value></qti-set-outcome-value>
      </qti-response-else-if>
      <qti-response-else>
        <qti-set-outcome-value identifier="SCORE"><qti-base-value base-type="float">0</qti-base-value></qti-set-outcome-value>
      </qti-response-else>
    </qti-response-condition>
  </qti-response-processing>
  ```

  A rule can also allow one piece too many (`pieces` ≤ the minimum + 1 with `qti-lte`), or give a point for an
  `amount` within a few cents (`tolerance: range`).
- **`human`**: a rater looks at the counter in review.

**A response read back** (`setResponse`, `boundTo`, the correct response in status `solution`) says how much, not
which coins and notes. So the counter gets the fewest coins and notes for that amount from the supply. In status
`solution` without a correct response in the item, the PCI shows the one from the settings.

## Development

```bash
npm install
npm run dev           # the dev page, with the settings
npm test              # the arithmetic and the look in node (test/money.test.ts, test/look.test.ts)
npm run test:stories  # the Storybook tests
```

`src/money.ts` has the arithmetic, without imports: the currencies and their coins and notes, amounts as text and back
per currency, totals, the fewest pieces, the task, the problems of the settings, the response and the correct response.
`src/look.ts` has the sizes and the colours of the coins and notes, and the contrast of their text. The node tests
check the fewest pieces against a brute-force count for 300 random supplies and amounts, and the contrast of the text
for 425 colours. `src/authoring.tsx` is the authoring mode, `src/pieces.tsx` draws the coins and notes.
