// The texts of the PCI per language (data-language, or the authoring system's language). The form's own labels are in
// the form (en/nl per label, form.ts).
import type { AuthoringProblem, Check, CheckType, FieldType, Format, Problem, Relation, SectionKind } from "./form";

const en = {
  information: "Information",
  choose: "— Choose —",
  required: "required",
  requiredNote: "Fields with * are required.",
  inEuros: "in euros",
  datePlaceholder: "dd/mm/yyyy",
  dateHint: "day/month/year",
  sign: "Click to sign",
  signed: "Signed",
  unsign: "Remove signature",
  signatureState: (label: string, signed: boolean) => `${label}: ${signed ? "signed, press to remove the signature" : "not signed, press to sign"}`,
  signedStatus: (label: string) => `${label}: signed.`,
  unsignedStatus: (label: string) => `${label}: signature removed.`,
  checkedStatus: (label: string, on: boolean) => `${label}: ${on ? "ticked" : "not ticked"}.`,
  problem: {
    required: "Fill in this field.",
    number: "Enter a number.",
    amount: "Enter an amount in euros, such as 12.50.",
    date: "Enter a date as day/month/year, such as 10/11/2026.",
    postcode: "Enter a postcode such as 1234 AB.",
    iban: "This IBAN is not valid: check the number.",
    email: "Enter an e-mail address such as name@example.nl.",
    phone: "Enter a phone number such as 0612345678.",
  } as Record<Problem, string>,
  problemStatus: (label: string, message: string) => `${label}: ${message}`,
  checkForm: "Check the form",
  formOk: "The form has no errors.",
  formProblems: (n: number) => (n === 1 ? "1 field needs your attention." : `${n} fields need your attention.`),
  form: "Form",
  // authoring mode
  tabForm: "Form",
  tabFields: "Fields and checks",
  tabSolution: "Preview and solution",
  example: "Start from an example",
  exampleWaybill: "Parcel waybill",
  exampleTransfer: "Bank transfer",
  exampleEmpty: "Empty form",
  load: "Load",
  title: "Title",
  code: "Form code",
  situation: "Situation or letter above the form",
  situationHelp: "Leave empty when the item gives the information itself.",
  english: "English",
  dutch: "Dutch",
  theme: "Look",
  themePaper: "Paper form",
  themeWeb: "Online form",
  columns: "Layout",
  oneColumn: "1 column",
  twoColumns: "2 columns",
  validation: "Validation messages (online form only)",
  section: "Section",
  sectionTitle: "Section title",
  kind: "Kind",
  kinds: { fields: "Fields", address: "Address block", amounts: "Amounts with a total" } as Record<SectionKind, string>,
  halfWidth: "Half the width (two columns)",
  addSection: "+ Add a section",
  addField: "+ Add a field",
  removeSection: "Remove section",
  removeField: "Remove field",
  moveUp: "Move up",
  moveDown: "Move down",
  fieldId: "Id",
  type: "Type",
  types: {
    text: "Text", textarea: "Text (several lines)", number: "Number", amount: "Amount (€)", date: "Date", select: "Drop-down list",
    radio: "Choice (radio buttons)", checkbox: "Checkbox", signature: "Signature", postcode: "Postcode", iban: "IBAN", phone: "Phone number", email: "E-mail",
  } as Record<FieldType, string>,
  label: "Label",
  hint: "Hint",
  options: "Options",
  optionsHelp: "One per line: value = English label | Dutch label",
  requiredField: "Required (*)",
  fullWidth: "Whole width",
  total: "Total line",
  checks: "Checks",
  checkCount: (n: number) => (n === 1 ? "1 check" : `${n} checks`),
  addCheck: "+ Add a check",
  removeCheck: "Remove check",
  checkType: "Check",
  checkTypes: { exact: "Exact value", oneOf: "One of these values", number: "Number within a margin", format: "Format", required: "Filled in", relation: "Consistent with another field" } as Record<CheckType, string>,
  value: "Value",
  valuesSep: "Values (separate with |)",
  margin: "Margin ±",
  points: "Points",
  caseSensitive: "Case counts",
  format: "Format",
  formats: { iban: "Valid IBAN", postcode: "Dutch postcode (1234 AB)", email: "E-mail address", phone: "Phone number", date: "Date", number: "Number", regex: "Regular expression" } as Record<Format, string>,
  pattern: "Pattern (the whole value)",
  relation: "Relation",
  relations: { sum: "= the sum of", product: "= the product of", after: "a date after", before: "a date before", same: "the same as" } as Record<Relation, string>,
  otherFields: "Fields",
  describe: (check: Check, name: (id: string) => string, show: (id: string, v: string) => string, field: string): string => {
    switch (check.type) {
      case "exact": return `${name(field)} is “${show(field, check.value)}”${check.caseSensitive ? " (case counts)" : ""}`;
      case "oneOf": return `${name(field)} is one of ${check.values.map((v) => `“${v}”`).join(", ")}`;
      case "number": return `${name(field)} is ${check.value}${check.margin ? ` ± ${check.margin}` : ""}`;
      case "format": return `${name(field)}: ${check.format === "regex" ? `matches ${check.pattern}` : en.formats[check.format]}`;
      case "required": return `${name(field)} is filled in`;
      case "relation": return `${name(field)} ${en.relations[check.relation]} ${check.fields.map(name).join(", ")}`;
    }
  },
  passed: "passes",
  failed: "fails",
  results: "The checks on this solution",
  summary: (score: number, max: number) => `The solution scores ${score} of ${max}.`,
  solutionHelp: "Fill in the form as a candidate should. This is the solution shown in review, and the checks are tried on it.",
  clearSolution: "Clear the solution",
  responseFields: "Fields in the response",
  problemText: (p: AuthoringProblem): string => {
    switch (p.code) {
      case "noFields": return "The form has no fields.";
      case "duplicateId": return `Two fields have the id “${p.id}”.`;
      case "badId": return `The id “${p.id}” must start with a letter and have only letters, digits, - and _.`;
      case "reservedId": return `The id “${p.id}” is a field of the response: choose another one.`;
      case "noOptions": return `Field “${p.id}” has no options.`;
      case "tooManyChecks": return `The form has ${p.count} checks; the response has room for 24.`;
      case "tooManyFields": return `The form has ${p.count} fields; the response has room for 24 values (values has them all).`;
      case "unknownField": return `A check on “${p.id}” refers to “${p.other}”, which is not a field.`;
      case "badRegex": return `The pattern of a check on “${p.id}” is not a valid regular expression.`;
      case "emptyExact": return `An exact value check on “${p.id}” has no value.`;
      case "solutionFails": return `The solution does not pass check ${p.check} (${p.id}).`;
      case "noChecks": return "The form has no checks: nothing is scored.";
    }
  },
};

export type Texts = typeof en;

const nl: Texts = {
  information: "Gegevens",
  choose: "— Kies —",
  required: "verplicht",
  requiredNote: "Velden met * zijn verplicht.",
  inEuros: "in euro",
  datePlaceholder: "dd-mm-jjjj",
  dateHint: "dag-maand-jaar",
  sign: "Klik om te ondertekenen",
  signed: "Ondertekend",
  unsign: "Handtekening weghalen",
  signatureState: (label, signed) => `${label}: ${signed ? "ondertekend, druk om de handtekening weg te halen" : "niet ondertekend, druk om te ondertekenen"}`,
  signedStatus: (label) => `${label}: ondertekend.`,
  unsignedStatus: (label) => `${label}: handtekening weggehaald.`,
  checkedStatus: (label, on) => `${label}: ${on ? "aangevinkt" : "niet aangevinkt"}.`,
  problem: {
    required: "Vul dit veld in.",
    number: "Vul een getal in.",
    amount: "Vul een bedrag in euro in, zoals 12,50.",
    date: "Vul een datum in als dag-maand-jaar, zoals 10-11-2026.",
    postcode: "Vul een postcode in zoals 1234 AB.",
    iban: "Dit IBAN klopt niet: controleer het nummer.",
    email: "Vul een e-mailadres in zoals naam@voorbeeld.nl.",
    phone: "Vul een telefoonnummer in zoals 0612345678.",
  },
  problemStatus: (label, message) => `${label}: ${message}`,
  checkForm: "Formulier controleren",
  formOk: "Het formulier heeft geen fouten.",
  formProblems: (n) => (n === 1 ? "1 veld vraagt je aandacht." : `${n} velden vragen je aandacht.`),
  form: "Formulier",
  tabForm: "Formulier",
  tabFields: "Velden en checks",
  tabSolution: "Voorbeeld en oplossing",
  example: "Begin met een voorbeeld",
  exampleWaybill: "Vrachtbrief pakket",
  exampleTransfer: "Overboeking",
  exampleEmpty: "Leeg formulier",
  load: "Laden",
  title: "Titel",
  code: "Formuliercode",
  situation: "Situatie of brief boven het formulier",
  situationHelp: "Laat leeg als het item de gegevens zelf geeft.",
  english: "Engels",
  dutch: "Nederlands",
  theme: "Uiterlijk",
  themePaper: "Papieren formulier",
  themeWeb: "Online formulier",
  columns: "Indeling",
  oneColumn: "1 kolom",
  twoColumns: "2 kolommen",
  validation: "Validatiemeldingen (alleen online formulier)",
  section: "Onderdeel",
  sectionTitle: "Titel van het onderdeel",
  kind: "Soort",
  kinds: { fields: "Velden", address: "Adresblok", amounts: "Bedragen met een totaal" },
  halfWidth: "Halve breedte (twee kolommen)",
  addSection: "+ Onderdeel toevoegen",
  addField: "+ Veld toevoegen",
  removeSection: "Onderdeel verwijderen",
  removeField: "Veld verwijderen",
  moveUp: "Omhoog",
  moveDown: "Omlaag",
  fieldId: "Id",
  type: "Type",
  types: {
    text: "Tekst", textarea: "Tekst (meer regels)", number: "Getal", amount: "Bedrag (€)", date: "Datum", select: "Keuzelijst",
    radio: "Keuze (keuzerondjes)", checkbox: "Vinkje", signature: "Handtekening", postcode: "Postcode", iban: "IBAN", phone: "Telefoonnummer", email: "E-mail",
  },
  label: "Label",
  hint: "Hint",
  options: "Opties",
  optionsHelp: "Eén per regel: waarde = Engels label | Nederlands label",
  requiredField: "Verplicht (*)",
  fullWidth: "Hele breedte",
  total: "Totaalregel",
  checks: "Checks",
  checkCount: (n) => (n === 1 ? "1 check" : `${n} checks`),
  addCheck: "+ Check toevoegen",
  removeCheck: "Check verwijderen",
  checkType: "Check",
  checkTypes: { exact: "Precies deze waarde", oneOf: "Een van deze waarden", number: "Getal binnen een marge", format: "Formaat", required: "Ingevuld", relation: "Klopt met een ander veld" },
  value: "Waarde",
  valuesSep: "Waarden (scheid met |)",
  margin: "Marge ±",
  points: "Punten",
  caseSensitive: "Hoofdletters tellen",
  format: "Formaat",
  formats: { iban: "Geldig IBAN", postcode: "Nederlandse postcode (1234 AB)", email: "E-mailadres", phone: "Telefoonnummer", date: "Datum", number: "Getal", regex: "Reguliere expressie" },
  pattern: "Patroon (de hele waarde)",
  relation: "Verband",
  relations: { sum: "= de som van", product: "= het product van", after: "een datum na", before: "een datum voor", same: "hetzelfde als" },
  otherFields: "Velden",
  describe: (check, name, show, field) => {
    switch (check.type) {
      case "exact": return `${name(field)} is “${show(field, check.value)}”${check.caseSensitive ? " (hoofdletters tellen)" : ""}`;
      case "oneOf": return `${name(field)} is een van ${check.values.map((v) => `“${v}”`).join(", ")}`;
      case "number": return `${name(field)} is ${String(check.value).replace(".", ",")}${check.margin ? ` ± ${String(check.margin).replace(".", ",")}` : ""}`;
      case "format": return `${name(field)}: ${check.format === "regex" ? `past op ${check.pattern}` : nl.formats[check.format]}`;
      case "required": return `${name(field)} is ingevuld`;
      case "relation": return `${name(field)} ${nl.relations[check.relation]} ${check.fields.map(name).join(", ")}`;
    }
  },
  passed: "klopt",
  failed: "klopt niet",
  results: "De checks op deze oplossing",
  summary: (score, max) => `De oplossing scoort ${score} van ${max}.`,
  solutionHelp: "Vul het formulier in zoals een kandidaat dat hoort te doen. Dit is de oplossing in de review, en de checks worden erop geprobeerd.",
  clearSolution: "Oplossing wissen",
  responseFields: "Velden in de response",
  problemText: (p) => {
    switch (p.code) {
      case "noFields": return "Het formulier heeft geen velden.";
      case "duplicateId": return `Twee velden hebben de id “${p.id}”.`;
      case "badId": return `De id “${p.id}” moet met een letter beginnen en mag alleen letters, cijfers, - en _ hebben.`;
      case "reservedId": return `De id “${p.id}” is een veld van de response: kies een andere.`;
      case "noOptions": return `Veld “${p.id}” heeft geen opties.`;
      case "tooManyChecks": return `Het formulier heeft ${p.count} checks; de response heeft plaats voor 24.`;
      case "tooManyFields": return `Het formulier heeft ${p.count} velden; de response heeft plaats voor 24 waarden (values heeft ze allemaal).`;
      case "unknownField": return `Een check op “${p.id}” verwijst naar “${p.other}”, maar dat is geen veld.`;
      case "badRegex": return `Het patroon van een check op “${p.id}” is geen geldige reguliere expressie.`;
      case "emptyExact": return `Een check op precies een waarde bij “${p.id}” heeft geen waarde.`;
      case "solutionFails": return `De oplossing voldoet niet aan check ${p.check} (${p.id}).`;
      case "noChecks": return "Het formulier heeft geen checks: er wordt niets gescoord.";
    }
  },
};

const texts: Record<string, Texts> = { en, nl };
/** "nl", "nl-NL" → the Dutch texts; anything else English. */
export const textsFor = (language: string): Texts => texts[(language ?? "").slice(0, 2).toLowerCase()] ?? en;
export const langOf = (language: string): "en" | "nl" => ((language ?? "").slice(0, 2).toLowerCase() === "nl" ? "nl" : "en");
