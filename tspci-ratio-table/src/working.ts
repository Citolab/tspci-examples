import { ROWS, StateModel, answerCell, parseNumber } from "./store";

/**
 * Is the student's working correct? Checked against the student's own numbers, not against a model table: the
 * explanation the table follows says everyone's table may be different (20 → 4 → 12, or 20 → 1 → 12). Any route
 * passes when it is a correct ratio table:
 *
 * - ratio: every filled column has the same ratio (bottom ÷ top), with at least two of them, and no column is half
 *   filled (one row only, or text that is not a number). Empty columns are left out.
 * - steps: every arrow between two filled columns has × or : and a number, and that step is right, above and below
 *   (20 : 5 = 4, 50 : 5 = 10).
 * - stepsMatch: the step below is the step above ("what you do above, you do below").
 * - working: all three, and the answer cell is a number in a filled column.
 *
 * Numbers the author gives (valuesTop, valuesBottom) are in the table, so the ratio check also checks that the student
 * worked with the numbers of the question. Without them, a table that is correct in itself but starts from a misread
 * number passes this check; the answer is then wrong (answerCorrect).
 */
export type WorkingChecks = { ratio: boolean; steps: boolean; stepsMatch: boolean; working: boolean };

/** Equal up to rounding: 0,5 × 7 must be 3,5, and 1,20 × 7 must be 8,40. */
export const sameNumber = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

const apply = (operator: string, a: number, n: number) => (operator === "multiply" ? a * n : operator === "divide" && n !== 0 ? a / n : NaN);

export function checkWorking(state: StateModel): WorkingChecks {
  const numbers = state.cells.map((row) => row.map(parseNumber));
  const filled = (column: number) => numbers.every((row) => row[column] !== undefined);
  const empty = (column: number) => state.cells.every((row) => row[column].trim() === "");
  const columns = Array.from({ length: state.columns }, (_, column) => column);

  // ratio: the filled columns all have the same ratio, cross-multiplied (no division by a zero on top)
  const full = columns.filter(filled);
  const halfFilled = columns.some((column) => !filled(column) && !empty(column));
  const [first] = full;
  const ratio =
    !halfFilled &&
    full.length >= 2 &&
    full.every((column) => sameNumber(numbers[1][column] * numbers[0][first], numbers[0][column] * numbers[1][first]));

  // steps: every arrow between two filled neighbours is filled in and right, above and below
  const pairs = columns.slice(0, -1).filter((column) => filled(column) && filled(column + 1));
  const step = (side: "top" | "bottom", i: number) => ({
    operator: (side === "top" ? state.operatorsTop : state.operatorsBottom)[i],
    n: parseNumber((side === "top" ? state.arrowsTop : state.arrowsBottom)[i] ?? ""),
  });
  const right = (side: "top" | "bottom", row: number, i: number) => {
    const { operator, n } = step(side, i);
    return n !== undefined && sameNumber(apply(operator, numbers[row][i], n), numbers[row][i + 1]);
  };
  const steps = pairs.length > 0 && pairs.every((i) => right("top", 0, i) && right("bottom", ROWS - 1, i));
  const stepsMatch =
    pairs.length > 0 &&
    pairs.every((i) => {
      const [top, bottom] = [step("top", i), step("bottom", i)];
      return top.operator !== "" && top.n !== undefined && top.operator === bottom.operator && bottom.n !== undefined && sameNumber(top.n, bottom.n);
    });

  const answer = answerCell(state);
  const answered = filled(answer.column);
  return { ratio, steps, stepsMatch, working: ratio && steps && stepsMatch && answered };
}
