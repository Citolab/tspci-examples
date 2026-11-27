/**
 * Stylised coins and notes, drawn in SVG. On purpose NOT the real designs (reproducing real coins and notes is
 * restricted): a coin is a plain disc in copper, gold, silver, two metals or a colour of the author's, with its value
 * on it; a note a coloured rectangle with its value in a white panel and a simple pattern. The sizes keep the
 * proportions of the real ones for the preset currencies (look.ts), and the value is always written on it, in a colour
 * that is readable on the colour of the piece, so colour is never the only cue.
 */
import { Currency, PieceDef, faceValue } from "./money";
import { coinColors, noteColors, pieceSize } from "./look";

type Props = { def: Pick<PieceDef, "value" | "kind" | "color">; currency: Currency; scale?: number; className?: string };

/** A coin or a note. Decorative: the button or list around it names it. */
export const Piece = (props: Props) => (props.def.kind === "coin" ? <Coin {...props} /> : <Note {...props} />);

const FONT = "system-ui, sans-serif";

function Coin({ def, currency, scale = 1, className }: Props) {
  const { width } = pieceSize(def, currency.code);
  const size = width * scale;
  const [value, unit] = faceValue(def.value, currency);
  const { ring, centre, twoMetals } = coinColors(def.color);
  const long = value.length > 2;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false" data-color={def.color}>
      <circle cx="50" cy="50" r="48" fill={ring.fill} stroke={ring.rim} stroke-width="3" />
      {/* a reeded edge, drawn as a dashed ring: clearly a drawing, not a real coin */}
      <circle cx="50" cy="50" r="43.5" fill="none" stroke={ring.rim} stroke-width="1.6" stroke-dasharray="2 3" opacity="0.7" />
      <circle cx="50" cy="50" r={twoMetals ? 33 : 39} fill={centre.fill} stroke={centre.rim} stroke-width={twoMetals ? 2 : 1} />
      <path
        d={`M ${twoMetals ? 27 : 22} 38 A ${twoMetals ? 26 : 32} ${twoMetals ? 26 : 32} 0 0 1 ${twoMetals ? 62 : 66} ${twoMetals ? 24 : 18}`}
        fill="none"
        stroke={centre.shine}
        stroke-width="3"
        stroke-linecap="round"
        opacity="0.8"
      />
      <text x="50" y={long ? 56 : value.length > 1 ? 57 : 59} text-anchor="middle" font-size={long ? 26 : value.length > 1 ? 34 : 40} font-weight="800" fill={centre.ink} font-family={FONT}>
        {value}
      </text>
      <text
        x="50"
        y="75"
        text-anchor="middle"
        font-size={unit.length > 6 ? 9 : 11}
        font-weight="700"
        letter-spacing={unit.length > 6 ? 0.5 : 1}
        fill={centre.ink}
        font-family={FONT}
      >
        {unit}
      </text>
    </svg>
  );
}

function Note({ def, currency, scale = 1, className }: Props) {
  const { width, height } = pieceSize(def, currency.code);
  const colors = noteColors(def.color);
  const [value, unit, sign] = faceValue(def.value, currency);
  // drawn in a box of 160 wide, its height in the proportion of the real note
  const w = 160;
  const h = Math.round((height / width) * w);
  const big = value.length >= 4 ? 24 : value.length === 3 ? 30 : 36;
  const signSize = sign.length > 2 ? 18 : sign.length === 2 ? 24 : 30;
  const withUnit = unit !== sign && unit !== "";
  return (
    <svg className={className} width={width * scale} height={height * scale} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false" data-color={def.color}>
      <rect x="1" y="1" width={w - 2} height={h - 2} rx="6" fill={colors.fill} stroke={colors.frame} stroke-width="2" />
      {/* a plain pattern: rings and lines, no buildings, maps, portraits, flags or signatures */}
      <g fill="none" stroke={colors.ink} stroke-width="1.2" opacity="0.3">
        <circle cx={w - 38} cy={h / 2} r={h * 0.36} />
        <circle cx={w - 38} cy={h / 2} r={h * 0.26} />
        <circle cx={w - 38} cy={h / 2} r={h * 0.16} />
        <path d={`M 8 ${h - 10} H ${w - 8} M 8 10 H ${w - 8}`} />
      </g>
      <rect x="10" y={h / 2 - 23} width="74" height="46" rx="5" fill={colors.panel} />
      {/* the value, and under it the unit in words (DOLLARS, POUNDS); a sign of the author's is in the ring already */}
      <text
        x="47"
        y={withUnit ? h / 2 - 3 : h / 2 + 3}
        text-anchor="middle"
        font-size={withUnit ? big * 0.9 : big}
        font-weight="800"
        fill={colors.value}
        font-family={FONT}
        dominant-baseline="middle"
      >
        {value}
      </text>
      {withUnit && (
        <text x="47" y={h / 2 + 17} text-anchor="middle" font-size="8.5" font-weight="700" letter-spacing="1" fill={colors.value} font-family={FONT}>
          {unit}
        </text>
      )}
      <text x={w - 38} y={h / 2 + 2} text-anchor="middle" font-size={signSize} font-weight="800" fill={colors.ink} font-family={FONT} dominant-baseline="middle">
        {sign}
      </text>
    </svg>
  );
}
