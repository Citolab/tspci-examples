import { JSX } from "preact";
import { PartType, Rotation } from "./circuit";

// The symbols, drawn on a cell of 64 × 64 at rotation 0 (European / IEC, as in Dutch schools). Terminals are in the
// middle of the edges: W (0,32), E (64,32), N (32,0), S (32,64). Letters and signs stay upright when the part turns.

const S = 64;
const C = 32;

/** Text that stays upright: turned back around its own spot. */
const Label = ({ x, y, turn, children, size = 14, weight = 600 }: { x: number; y: number; turn: Rotation; children: string; size?: number; weight?: number }) => (
  <text x={x} y={y} transform={turn ? `rotate(${-turn} ${x} ${y})` : undefined} text-anchor="middle" dominant-baseline="central"
    font-size={size} font-weight={weight} font-family="ui-sans-serif, system-ui, sans-serif" fill="currentColor" stroke="none">{children}</text>
);

const lead = (from: number, to: number) => <path d={`M${from} ${C}H${to}`} />;
const leads = (a: number, b: number) => <>{lead(0, a)}{lead(b, S)}</>;
const arrowHead = (x: number, y: number, angle: number, size = 6) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const p1 = [x - size * Math.cos(r(angle - 25)), y - size * Math.sin(r(angle - 25))];
  const p2 = [x - size * Math.cos(r(angle + 25)), y - size * Math.sin(r(angle + 25))];
  return <path d={`M${p1[0]} ${p1[1]}L${x} ${y}L${p2[0]} ${p2[1]}Z`} fill="currentColor" />;
};
/** An arrow from (x1,y1) to (x2,y2). */
const arrow = (x1: number, y1: number, x2: number, y2: number) => (
  <>
    <path d={`M${x1} ${y1}L${x2} ${y2}`} />
    {arrowHead(x2, y2, (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI)}
  </>
);
const resistorBox = <rect x={16} y={24} width={32} height={16} rx={1} />;
const dot = (x: number, y: number, r = 3.6) => <circle cx={x} cy={y} r={r} fill="currentColor" stroke="none" />;
const diode = (
  <>
    {leads(23, 41)}
    <path className="cb-body" d="M23 21L41 32L23 43Z" fill="currentColor" fill-opacity={0.12} />
    <path d="M41 20V44" />
  </>
);
const meter = (letter: string, turn: Rotation) => (
  <>
    {leads(19, 45)}
    <circle cx={C} cy={C} r={13} />
    <Label x={C} y={C} turn={turn}>{letter}</Label>
  </>
);
/** A test material: a sample between two crocodile clips (the leads end in the clips). */
const sample = (body: JSX.Element) => (
  <>
    {leads(13, 51)}
    <g className="cb-sample" stroke-width={1.6}>{body}</g>
    <path d="M12 28.5H18.5L22.5 32L18.5 35.5H12Z" fill="currentColor" stroke-width={1.4} stroke-linejoin="round" />
    <path d="M52 28.5H45.5L41.5 32L45.5 35.5H52Z" fill="currentColor" stroke-width={1.4} stroke-linejoin="round" />
  </>
);
const lampCircle = (
  <>
    {leads(19, 45)}
    <circle cx={C} cy={C} r={13} />
  </>
);
/** A broken lamp: the cross (the filament) snapped in the middle, a crack in the glass. */
const brokenLamp = (
  <>
    {lampCircle}
    <path d="M22.8 22.8L28.5 28.5M35.5 35.5L41.2 41.2M41.2 22.8L35.5 28.5M28.5 35.5L22.8 41.2" />
    <path d="M38 13L41 17L38.5 19L42 23" stroke-width={1.6} stroke-linejoin="round" />
  </>
);

const plates = (xs: number[]) => xs.map((x, i) => (i % 2 === 0 ? <path d={`M${x} 18V46`} /> : <path d={`M${x} 25V39`} stroke-width={5} />));

const DRAW: Record<PartType, (turn: Rotation) => JSX.Element> = {
  wire: () => lead(0, S),
  corner: () => <path d={`M0 ${C}H${C}V0`} stroke-linejoin="round" />,
  tee: () => <>{lead(0, S)}<path d={`M${C} ${C}V0`} />{dot(C, C)}</>,
  cross: () => <>{lead(0, S)}<path d={`M${C} 0V${S}`} />{dot(C, C)}</>,
  crossover: () => <><path d={`M${C} 0V${S}`} /><path d={`M0 ${C}H23A9 9 0 0 1 41 ${C}H${S}`} /></>,
  resistor: () => <>{leads(16, 48)}{resistorBox}</>,
  variableResistor: () => <>{leads(16, 48)}{resistorBox}{arrow(14, 48, 50, 14)}</>,
  lamp: () => (
    <>
      {lampCircle}
      <path d="M22.8 22.8L41.2 41.2M41.2 22.8L22.8 41.2" />
    </>
  ),
  led: () => <>{diode}{arrow(33, 18, 41, 8)}{arrow(40, 21, 48, 11)}</>,
  diode: () => diode,
  switch: () => (
    <>
      {leads(20, 44)}
      <path d="M20 32L43 19" />
      <circle cx={20} cy={C} r={2.6} fill="white" />
      <circle cx={44} cy={C} r={2.6} fill="white" />
    </>
  ),
  pushButton: () => (
    <>
      {leads(20, 44)}
      <path d="M17 25H47M32 25V13M26 13H38" />
      <circle cx={20} cy={C} r={2.6} fill="white" />
      <circle cx={44} cy={C} r={2.6} fill="white" />
    </>
  ),
  buzzer: () => <>{leads(18, 46)}<path d="M18 36H46A14 14 0 0 0 18 36Z" fill="currentColor" fill-opacity={0.08} /><path d="M18 32V36M46 32V36" /></>,
  motor: (turn) => meter("M", turn),
  ldr: () => <>{leads(16, 48)}{resistorBox}{arrow(10, 4, 20, 19)}{arrow(20, 2, 30, 17)}</>,
  ntc: (turn) => (
    <>
      {leads(16, 48)}
      {resistorBox}
      <path d="M10 50H16L52 14" />
      <Label x={48} y={50} turn={turn} size={10} weight={500}>-t°</Label>
    </>
  ),
  fuse: () => <>{lead(0, S)}<rect x={16} y={26} width={32} height={12} rx={1} /></>,
  voltmeter: (turn) => meter("V", turn),
  ammeter: (turn) => meter("A", turn),
  cell: (turn) => <>{leads(28, 36)}{plates([28, 36])}<Label x={19} y={16} turn={turn} size={13}>+</Label></>,
  battery: (turn) => (
    <>
      {leads(20, 44)}
      {plates([20, 28, 36, 44])}
      <Label x={12} y={16} turn={turn} size={13}>+</Label>
    </>
  ),
  dcSource: (turn) => (
    <>
      {leads(19, 45)}
      <circle cx={C} cy={C} r={13} />
      <g transform={turn ? `rotate(${-turn} ${C} ${C})` : undefined}>
        <path d="M24 28H40" />
        <path d="M24 36H27M30.5 36H33.5M37 36H40" />
      </g>
      <Label x={10} y={20} turn={turn} size={13}>+</Label>
      <Label x={54} y={20} turn={turn} size={13}>−</Label>
    </>
  ),
  acSource: (turn) => (
    <>
      {leads(19, 45)}
      <circle cx={C} cy={C} r={13} />
      <path d="M24 32C26.5 25 29.5 25 32 32S37.5 39 40 32" transform={turn ? `rotate(${-turn} ${C} ${C})` : undefined} />
    </>
  ),
  transistor: () => (
    <>
      <circle cx={30} cy={C} r={17} />
      <path d="M0 32H23M23 22V42M23 27L32 20V0M23 37L32 44V64" stroke-linejoin="round" />
      {arrowHead(31, 43.3, 37.9, 7)}
    </>
  ),
  // the test materials: each sample has its own shape (and colour), so they are told apart without text
  aluminiumFoil: () => sample(<path d="M21 26L25 24L29 27L33 24L37 27L43 25V39L39 41L35 38L31 41L27 38L21 40Z" fill="#cbd5e1" stroke-linejoin="round" />),
  copper: () => sample(<><rect x={21} y={27} width={22} height={10} rx={1} fill="#d97706" fill-opacity={0.75} /><path d="M24 30H40" stroke="#fde68a" /></>),
  ironNail: () => sample(<><path d="M23 25V39" stroke-width={3} /><path d="M24 30H38L43 32L38 34H24Z" fill="#64748b" stroke-linejoin="round" /></>),
  graphite: () => sample(<rect x={21} y={29.5} width={22} height={5} rx={1} fill="#334155" />),
  cotton: () => sample(<path d="M23 38A4 4 0 0 1 23 30A5 5 0 0 1 31 26A5 5 0 0 1 40 28A4.5 4.5 0 0 1 41 38Z" fill="white" stroke-linejoin="round" />),
  wood: () => sample(<><rect x={21} y={25} width={22} height={14} rx={1} fill="#d6a96a" fill-opacity={0.8} /><path d="M23 29.5C28 27.5 34 31.5 41 29.5M23 34.5C28 32.5 34 36.5 41 34.5" stroke-width={1} /></>),
  plastic: () => sample(<rect x={21} y={26} width={22} height={12} rx={5} fill="#38bdf8" fill-opacity={0.45} />),
  glass: () => sample(<><rect x={21} y={25} width={22} height={14} rx={1} fill="#e0f2fe" fill-opacity={0.7} /><path d="M26 36L30 28M31 36L34 30" stroke-width={1.2} /></>),
  rubber: () => sample(<rect x={21} y={27} width={22} height={10} rx={5} fill="#1f2937" fill-opacity={0.85} />),
};

/** A part in a cell: an <svg> of 64 × 64 user units, turned. */
export const PartSymbol = ({ type, rotation, className, title, broken }: { type: PartType; rotation: Rotation; className?: string; title?: string; broken?: boolean }) => (
  <svg viewBox={`0 0 ${S} ${S}`} className={className} aria-hidden={title ? undefined : "true"} role={title ? "img" : undefined} aria-label={title} overflow="visible">
    <g transform={rotation ? `rotate(${rotation} ${C} ${C})` : undefined} fill="none" stroke="currentColor" stroke-width={2.5} stroke-linecap="round">
      {broken && type === "lamp" ? brokenLamp : DRAW[type](rotation)}
    </g>
  </svg>
);

/** Where a terminal on a side of the cell is, in the cell's units. */
export const sidePoint = { N: [C, 0], E: [S, C], S: [C, S], W: [0, C] } as const;
export const CELL_UNITS = S;
