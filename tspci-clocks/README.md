# @citolab/pci-clocks

> [!WARNING]
> **Experimental (alpha). Just for inspiration.** This PCI is a technical showcase, made by software developers without
> much knowledge of the subject it could be used for. Its content, terms and scoring have not been checked by subject
> experts or assessment specialists, and it has never been used in an assessment. It is offered as is, without any
> warranty.

A QTI 3 Portable Custom Interaction (PCI) for telling the time (Dutch: *klok kijken*). The candidate sets an analog or
digital clock to a time, and the response is that time as `HH:MM`. The clock can also only show a time, as an image
would: the item then asks for the answer in an interaction of its own. Made with
[tspci](https://github.com/Citolab/tspci).

<p align="center">
  <img src="https://raw.githubusercontent.com/Citolab/tspci-examples/main/tspci-clocks/example.png" alt="An analog clock showing twenty-five past seven, under the question: What time is it?" width="560">
</p>

## What it does

- **Show the time** (`typeOfQuestion: askTime`): the clock shows the time of the `initialtime` setting and cannot be
  changed. It stands in for an image of a clock, so it has no field for the answer: the item asks for the time in an
  interaction of its own, such as a `qti-text-entry-interaction`, and scores that one. The clock has no response and is
  not scored.
- **Set the clock** (`typeOfQuestion: setClock`): the candidate turns the hands of the analog clock, or sets the hours
  and minutes of the digital one with its arrows, in jumps of 1, 5 or 15 minutes (`minutePerJumps`).
- **Analog or digital**, each with skins: classic, learning clock or Roman numerals (analog); classic, alarm clock or
  LCD screen (digital).
- **Its own look**: on top of the skin the author can give the clock a colour (the rim of an analog clock, the case of
  a digital one), other hands (ornate, straight, pointed or arrows), a colour for each hand, and another font for the
  numerals or digits (sans-serif, serif or monospace).
- The author picks all of this in the PCI's own authoring mode ("Choose the clock…"), where every clock shows the look
  picked so far.
- A digital clock can be a 24-hour or a 12-hour clock (`twentyFourHour`).

## Settings

| setting | editor | what it does |
| --- | --- | --- |
| `title`, `question` | `text`, `textarea` | above the clock; an empty one is left out |
| `typeOfQuestion` | `enum` | `askTime` (default): the clock only shows the time, no response; `setClock`: the candidate sets it |
| `typeOfClock`, `skin` | `pci` | the clock and its skin, chosen in the authoring mode |
| `color` | `pci` | the colour of the rim (analog) or the case (digital), as `#rrggbb`; empty: the skin's own |
| `hands` | `pci` | the hands of an analog clock: `ornate`, `straight`, `pointed` or `arrow`; empty: the skin's own |
| `shortHandColor`, `longHandColor` | `pci` | the colour of each hand of an analog clock, as `#rrggbb`; empty: the skin's own |
| `font` | `pci` | the font of the numerals or digits: `sans`, `serif` or `mono`; empty: the skin's own |
| `twentyFourHour` | `boolean` | 24-hour clock (digital only) |
| `minutePerJumps` | `enum` | `1`, `5` or `15` minutes per jump when setting the clock |
| `initialtime` | `time` | the time the clock shows at the start (`HH:MM`) |

## Response and scoring

- **`setClock`**: `single` `string`, the time the candidate set as `HH:MM`; no response while the clock is untouched.
  An analog clock has no morning or afternoon, so it reports a 12-hour time (`04:10`, also for ten past four in the
  afternoon), and so does a 12-hour digital clock. A 24-hour digital clock reports the 24-hour time (`16:10`). The
  author gives the correct response in the item (`match_correct`), or a human rater scores it (`human`).
- **`askTime`**: no response and no score (`config.tspci.toolWhen`); the item scores the interaction that takes the
  answer. For example, with the clock above a text entry:

  ```xml
  <qti-portable-custom-interaction response-identifier="CLOCK" module="pci" custom-interaction-type-identifier="clocks"
    data-type-of-question="askTime" data-initialtime="07:25" data-title="" data-question="">
    <qti-interaction-markup></qti-interaction-markup>
  </qti-portable-custom-interaction>
  <p>What time is it? <qti-text-entry-interaction response-identifier="RESPONSE" expected-length="5"/></p>
  ```

A colour, hands or font the PCI does not know counts as empty, so a clock always shows. `color` is only the rim or the
case: the numerals and the two colours of the learning clock's face (blue hours, red minutes) stay as they are. The
hands have their own colours (`shortHandColor`, `longHandColor`); an ornate hand in a colour is its image in that
colour.

## Fonts and images

The digital clock uses the DigitTech font ([fontspace](https://www.fontspace.com/digit-tech-font-f106535), public
domain), bundled in the PCI. The fonts an author can pick (`font`) are not bundled: they are fonts every device has
(Arial, Times New Roman, Courier New, or what the device has in their place), so they can differ a little between
devices.

The face and the ornate hands of the classic analog clock and the clock radio of the classic digital clock are Cito's
own images. A picture cannot take a colour or a font, so with one of those the classic clock is drawn (SVG) after its
picture; the other skins are always drawn.

## Development

```bash
npm install
npm run dev           # the dev page, with the settings and the authoring mode
npm test              # the tests of the HH:MM response (node)
npm run test:stories  # the Storybook tests
```
