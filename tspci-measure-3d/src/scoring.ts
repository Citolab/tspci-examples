// Scoring an answer: the typed value within the margin of the correct value, and (with data-scoring="pci" and
// data-require-measurement) the right measurement made. Also the response processing the authoring mode shows.
// No imports: `npm test` runs it in node.

/** Within the margin, inclusive (with a little room for rounding: 3.37 is within 0.05 of 3.42). */
export const withinMargin = (value: number | null, correct: number | null, margin: number): boolean =>
  value !== null && correct !== null && Math.abs(value - correct) <= Math.max(0, margin) + 1e-9 * Math.max(1, Math.abs(correct));

export type Score = { score: number; maxscore: number; correct: 0 | 1; measured: 0 | 1 };

/** 1 point for a value within the margin; with requireMeasurement only when the right measurement was made too. */
export const scoreAnswer = (input: { value: number | null; correct: number | null; margin: number; made: boolean; requireMeasurement: boolean }): Score => {
  const correct = withinMargin(input.value, input.correct, input.margin) ? 1 : 0;
  const measured = input.made ? 1 : 0;
  return { score: correct && (measured || !input.requireMeasurement) ? 1 : 0, maxscore: 1, correct, measured };
};

/** A number for XML: no exponent, no trailing zeros. */
export const xmlNumber = (value: number) => String(Math.round(value * 1e6) / 1e6);

const outcomes = `<qti-outcome-declaration identifier="SCORE" cardinality="single" base-type="float">
  <qti-default-value><qti-value>0</qti-value></qti-default-value>
</qti-outcome-declaration>
<qti-outcome-declaration identifier="MAXSCORE" cardinality="single" base-type="float">
  <qti-default-value><qti-value>1</qti-value></qti-default-value>
</qti-outcome-declaration>`;

/**
 * The declarations and response processing for the item. "margin": a float response compared with the correct
 * response, within the margin (qti-equal with an absolute tolerance). "pci": a record, scored by the PCI: SCORE is its
 * score field.
 */
export const responseProcessingXml = (scoring: "margin" | "pci", correct: number | null, margin: number): string => {
  if (scoring === "pci") {
    return `<qti-response-declaration identifier="RESPONSE" cardinality="record"/>
${outcomes}
<qti-response-processing>
  <qti-response-condition>
    <qti-response-if>
      <qti-not><qti-is-null><qti-variable identifier="RESPONSE"/></qti-is-null></qti-not>
      <qti-set-outcome-value identifier="SCORE">
        <qti-field-value field-identifier="score"><qti-variable identifier="RESPONSE"/></qti-field-value>
      </qti-set-outcome-value>
    </qti-response-if>
  </qti-response-condition>
</qti-response-processing>`;
  }
  const value = correct === null ? "" : `
  <qti-correct-response><qti-value>${xmlNumber(correct)}</qti-value></qti-correct-response>
`;
  return `<qti-response-declaration identifier="RESPONSE" cardinality="single" base-type="float">${value}</qti-response-declaration>
${outcomes}
<qti-response-processing>
  <qti-response-condition>
    <qti-response-if>
      <qti-equal tolerance-mode="absolute" tolerance="${xmlNumber(Math.max(0, margin))}">
        <qti-variable identifier="RESPONSE"/>
        <qti-correct identifier="RESPONSE"/>
      </qti-equal>
      <qti-set-outcome-value identifier="SCORE"><qti-base-value base-type="float">1</qti-base-value></qti-set-outcome-value>
    </qti-response-if>
  </qti-response-condition>
</qti-response-processing>`;
};
