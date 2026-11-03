// The form, its values and the checks: no imports, so node runs it in the tests (npm test) as it is.
//
// A form (data-form) has sections with fields. The candidate fills in text per field; the PCI keeps what they typed
// (the raw values) and turns it into a normalised value per field type (a postcode "1234 AB", an IBAN without spaces,
// an amount "12.50", a date "2026-11-10"), the same in every language. The author's checks per field look at the
// normalised values and give points.

export type Text = string | { en?: string; nl?: string };

/** The text in a language: a string as it is, or the language's own, or else the other one. */
export const say = (text: Text | undefined, language = "en"): string => {
  if (text === undefined || text === null) return "";
  if (typeof text === "string") return text;
  const lang = language.slice(0, 2).toLowerCase() === "nl" ? "nl" : "en";
  return text[lang] ?? text[lang === "nl" ? "en" : "nl"] ?? "";
};

export const FIELD_TYPES = [
  "text", "textarea", "number", "amount", "date", "select", "radio", "checkbox", "signature", "postcode", "iban", "phone", "email",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export const OPTION_TYPES: FieldType[] = ["select", "radio", "checkbox"];

export type Option = { value: string; label: Text };

export type Field = {
  /** unique in the form: the key in the values and in the response */
  id: string;
  type: FieldType;
  label: Text;
  hint?: Text;
  /** select, radio; checkbox: a group of boxes (without options one box) */
  options?: Option[];
  /** marked with *, and a validation message when empty (web theme) */
  required?: boolean;
  /** in a two-column layout: the whole width */
  span?: 1 | 2;
  /** an amount: the total line (the candidate calculates it) */
  total?: boolean;
  checks?: Check[];
};

export const SECTION_KINDS = ["fields", "address", "amounts"] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];
export type Section = {
  id: string;
  title: Text;
  /** fields: a grid of fields; address: an address block; amounts: lines with euro amounts and a total */
  kind?: SectionKind;
  /** in a two-column layout: 1 takes half the width (two address blocks next to each other) */
  span?: 1 | 2;
  fields: Field[];
};

export type Values = Record<string, string>;

export type Form = {
  title: Text;
  /** a form number or code in the corner ("Form 12-B") */
  code?: Text;
  /** the situation or letter with the information, above the form; the item may give it instead */
  situation?: Text;
  sections: Section[];
  /** the author's answer: normalised values by field id */
  solution?: Values;
};

export const FORMATS = ["iban", "postcode", "email", "phone", "date", "number", "regex"] as const;
export type Format = (typeof FORMATS)[number];
export const RELATIONS = ["sum", "product", "after", "before", "same"] as const;
export type Relation = (typeof RELATIONS)[number];
export const CHECK_TYPES = ["exact", "oneOf", "number", "format", "required", "relation"] as const;
export type CheckType = (typeof CHECK_TYPES)[number];

export type Check =
  | { type: "exact"; value: string; caseSensitive?: boolean; points?: number }
  | { type: "oneOf"; values: string[]; points?: number }
  | { type: "number"; value: number; margin?: number; points?: number }
  | { type: "format"; format: Format; pattern?: string; points?: number }
  | { type: "required"; points?: number }
  | { type: "relation"; relation: Relation; fields: string[]; margin?: number; points?: number };

/** QTI records are declared up front: check1 … check24 and value1 … value24. */
export const MAX_CHECKS = 24;
export const MAX_FIELDS = 24;

// --- numbers and dates

/**
 * A number as the candidate types it: "12,50" and "1.234,50" (Dutch), "12.50" and "1,234.50" (English), with or
 * without € and spaces. A separator followed by exactly three digits that is not the language's decimal sign is a
 * thousands separator; otherwise either sign is a decimal sign (lenient: "12.5" in Dutch is 12.5).
 */
export const parseNumber = (raw: string, language = "en"): number | null => {
  let s = String(raw ?? "").replace(/[€\s ]/g, "").replace(/^EUR/i, "").replace(/,-$/, "").replace(/\.-$/, "");
  if (!s) return null;
  s = s.replace(/^\+/, "").replace(/^−/, "-");
  if (!/^-?[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const decimal = language.slice(0, 2).toLowerCase() === "nl" ? "," : ".";
  const other = decimal === "," ? "." : ",";
  const hasComma = s.includes(","), hasDot = s.includes(".");
  if (hasComma && hasDot) {
    const last = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
    const dec = s[last];
    const thousands = dec === "," ? "." : ",";
    const intPart = s.slice(0, last).split(thousands).join("");
    if (intPart.includes(dec)) return null;
    s = `${intPart}.${s.slice(last + 1)}`;
  } else if (hasComma || hasDot) {
    const sep = hasComma ? "," : ".";
    const parts = s.split(sep);
    if (sep === other && parts.length > 1 && parts.slice(1).every((p) => p.length === 3) && parts[0].replace("-", "").length > 0) {
      s = parts.join(""); // 1.250 in Dutch, 1,250 in English
    } else if (parts.length === 2) {
      s = `${parts[0]}.${parts[1]}`;
    } else return null;
  }
  if (s === "-" || s.endsWith(".") && s.length === 1) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** A number for the candidate: a decimal comma in Dutch; amounts with two decimals. */
export const formatNumber = (n: number, language = "en", decimals?: number): string => {
  const text = decimals === undefined ? String(Math.round(n * 1e9) / 1e9) : n.toFixed(decimals);
  return language.slice(0, 2).toLowerCase() === "nl" ? text.replace(".", ",") : text;
};

const pad = (n: number) => String(n).padStart(2, "0");
const validDate = (y: number, m: number, d: number) => {
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1) return false;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= days;
};

/** A date as "2026-11-10" from "10-11-2026", "10/11/2026", "10.11.2026", "10 11 2026" or "2026-11-10"; else null. */
export const parseDate = (raw: string): string | null => {
  const s = String(raw ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  m = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/.exec(s);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  return null;
};

/** "2026-11-10" for the candidate: 10-11-2026 (Dutch) or 10/11/2026 (English). */
export const formatDate = (iso: string, language = "en"): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return language.slice(0, 2).toLowerCase() === "nl" ? `${m[3]}-${m[2]}-${m[1]}` : `${m[3]}/${m[2]}/${m[1]}`;
};

// --- formats

/** IBAN lengths of the countries a Dutch candidate meets most; other countries: 15 to 34 characters. */
const IBAN_LENGTH: Record<string, number> = { NL: 18, BE: 16, DE: 22, FR: 27, GB: 22, ES: 24, IT: 27, LU: 20, AT: 20, PL: 28, PT: 25, DK: 18 };

/** A valid IBAN: country, two check digits, the account; length per country and the mod-97 checksum. */
export const validIban = (raw: string): boolean => {
  const s = String(raw ?? "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const length = IBAN_LENGTH[s.slice(0, 2)];
  if (length && s.length !== length) return false;
  const moved = s.slice(4) + s.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const code = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of code) rest = (rest * 10 + Number(digit)) % 97;
  }
  return rest === 1;
};

/** A Dutch postcode: four digits (not starting with 0), two letters (not SA, SD or SS), with or without a space. */
export const validPostcode = (raw: string): boolean => {
  const m = /^([1-9]\d{3})\s?([A-Za-z]{2})$/.exec(String(raw ?? "").trim());
  return !!m && !["SA", "SD", "SS"].includes(m[2].toUpperCase());
};

export const validEmail = (raw: string): boolean => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/.test(String(raw ?? "").trim());

/** A phone number: Dutch (0 and nine digits) or international (+ or 00 and 8 to 15 digits). */
export const validPhone = (raw: string): boolean => {
  const s = normalizePhone(raw);
  return /^0\d{9}$/.test(s) || /^\+\d{8,15}$/.test(s);
};

const normalizePhone = (raw: string) => String(raw ?? "").trim().replace(/[\s\-().]/g, "").replace(/^00/, "+");

/** The author's regular expression on the whole value; an invalid expression never passes. */
export const matchesPattern = (raw: string, pattern: string | undefined): boolean => {
  if (!pattern) return false;
  try {
    return new RegExp(`^(?:${pattern})$`, "u").test(String(raw ?? "").trim());
  } catch {
    return false;
  }
};

export const validRegex = (pattern: string | undefined): boolean => {
  try {
    new RegExp(`^(?:${pattern ?? ""})$`, "u");
    return true;
  } catch {
    return false;
  }
};

// --- normalising

/**
 * The value of a field in its own form, the same whatever the language: text trimmed with single spaces; a number
 * "4.8", an amount "12.50"; a date "2026-11-10"; a postcode "1234 AB"; an IBAN without spaces in capitals; a phone
 * number without spaces and dashes; an e-mail address in lower case; a checkbox "true" or "" (a group: the chosen
 * values in option order, comma separated); a signature "signed" or "". Text that does not parse stays as typed
 * (trimmed), so the checks fail on it.
 */
export const normalize = (field: Field, raw: string | undefined, language = "en"): string => {
  const s = String(raw ?? "").trim();
  switch (field.type) {
    case "text":
    case "textarea":
      return s.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n");
    case "number": {
      const n = parseNumber(s, language);
      return n === null ? s : String(Math.round(n * 1e9) / 1e9);
    }
    case "amount": {
      const n = parseNumber(s, language);
      return n === null ? s : n.toFixed(2);
    }
    case "date":
      return parseDate(s) ?? s;
    case "postcode": {
      const t = s.replace(/\s+/g, "").toUpperCase();
      return /^\d{4}[A-Z]{2}$/.test(t) ? `${t.slice(0, 4)} ${t.slice(4)}` : s.toUpperCase();
    }
    case "iban":
      return s.replace(/\s+/g, "").toUpperCase();
    case "phone":
      return normalizePhone(s);
    case "email":
      return s.toLowerCase();
    case "checkbox": {
      if (!field.options?.length) return s === "true" ? "true" : "";
      const chosen = s.split(",").map((v) => v.trim()).filter(Boolean);
      return field.options.map((o) => o.value).filter((v) => chosen.includes(v)).join(",");
    }
    case "signature":
      return s === "signed" ? "signed" : "";
    default:
      return s;
  }
};

/** A normalised value back as the candidate would see it: amounts and numbers with a decimal comma in Dutch, dates as dd-mm-yyyy. */
export const displayValue = (field: Field, value: string | undefined, language = "en"): string => {
  const s = String(value ?? "");
  if (field.type === "amount" && /^-?\d+(\.\d+)?$/.test(s)) return formatNumber(Number(s), language, 2);
  if (field.type === "number" && /^-?\d+(\.\d+)?$/.test(s)) return formatNumber(Number(s), language);
  if (field.type === "date") return formatDate(s, language);
  return s;
};

/** What to compare: case does not count, unless the check says so. */
const key = (field: Field, value: string, caseSensitive = false) => {
  const v = normalize(field, value, "en");
  return caseSensitive ? v : v.toLowerCase();
};

// --- the form

export const allFields = (form: Form): Field[] => form.sections.flatMap((s) => s.fields);
export const fieldById = (form: Form, id: string) => allFields(form).find((f) => f.id === id);

/** Every check of the form, in order (section, field, check): check1 is the first. */
export const allChecks = (form: Form): { field: Field; check: Check }[] =>
  allFields(form).flatMap((field) => (field.checks ?? []).map((check) => ({ field, check })));

/** The normalised values of all fields, from what the candidate typed. */
export const normalizeAll = (form: Form, raw: Values, language = "en"): Values => {
  const out: Values = {};
  for (const f of allFields(form)) out[f.id] = normalize(f, raw[f.id], language);
  return out;
};

const numberOf = (field: Field | undefined, value: string | undefined): number | null => {
  if (!field || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Whether a check passes, on normalised values. */
export const passes = (form: Form, field: Field, check: Check, values: Values): boolean => {
  const v = values[field.id] ?? "";
  switch (check.type) {
    case "required":
      return v !== "";
    case "exact":
      return v !== "" && key(field, v, check.caseSensitive) === key(field, check.value ?? "", check.caseSensitive);
    case "oneOf":
      return v !== "" && (check.values ?? []).some((w) => key(field, v) === key(field, w));
    case "number": {
      const n = parseNumber(v, "en");
      return n !== null && v !== "" && Math.abs(n - Number(check.value)) <= Math.abs(Number(check.margin ?? 0)) + 1e-9;
    }
    case "format":
      if (v === "") return false;
      switch (check.format) {
        case "iban": return validIban(v);
        case "postcode": return validPostcode(v);
        case "email": return validEmail(v);
        case "phone": return validPhone(v);
        case "date": return parseDate(v) !== null;
        case "number": return parseNumber(v, "en") !== null;
        case "regex": return matchesPattern(v, check.pattern);
      }
      return false;
    case "relation": {
      if (v === "") return false;
      const others = (check.fields ?? []).map((id) => ({ f: fieldById(form, id), v: values[id] ?? "" }));
      if (!others.length || others.some((o) => !o.f)) return false;
      switch (check.relation) {
        case "sum":
        case "product": {
          const n = parseNumber(v, "en");
          if (n === null) return false;
          const nums = others.map((o) => (o.v === "" ? (check.relation === "sum" ? 0 : null) : numberOf(o.f, o.v)));
          if (nums.some((x) => x === null)) return false;
          const expected = check.relation === "sum" ? nums.reduce((a, b) => a + b, 0) : nums.reduce((a, b) => a * b, 1);
          return Math.abs(n - expected) <= Math.abs(Number(check.margin ?? 0.005)) + 1e-9;
        }
        case "after":
        case "before": {
          const d = parseDate(v);
          if (!d) return false;
          return others.every((o) => {
            const e = parseDate(o.v);
            return !!e && (check.relation === "after" ? d > e : d < e);
          });
        }
        case "same":
          return others.every((o) => o.v !== "" && key(field, v) === key(o.f!, o.v));
      }
      return false;
    }
  }
  return false;
};

export const pointsOf = (check: Check) => {
  const p = Number(check.points ?? 1);
  return Number.isFinite(p) && p >= 0 ? Math.round(p) : 1;
};

export type CheckResult = { field: string; check: Check; passed: boolean; points: number };
export type Evaluation = { results: CheckResult[]; score: number; maxscore: number; correct: boolean };

/** The checks on normalised values: per check passed or not, the points of the passed and of all checks. */
export const evaluate = (form: Form, values: Values): Evaluation => {
  const results = allChecks(form).map(({ field, check }) => ({ field: field.id, check, passed: passes(form, field, check, values), points: pointsOf(check) }));
  const score = results.reduce((a, r) => a + (r.passed ? r.points : 0), 0);
  const maxscore = results.reduce((a, r) => a + r.points, 0);
  return { results, score, maxscore, correct: results.length > 0 && results.every((r) => r.passed) };
};

// --- validation feedback (web theme)

export type Problem = "required" | "number" | "amount" | "date" | "postcode" | "iban" | "email" | "phone";

/** What a real online form would say about a field: empty and required, or not the format of its type. Not about the answer. */
export const validationProblem = (field: Field, raw: string | undefined, language = "en"): Problem | null => {
  const v = normalize(field, raw, language);
  if (v === "") return field.required ? "required" : null;
  switch (field.type) {
    case "number": return parseNumber(String(raw), language) === null ? "number" : null;
    case "amount": return parseNumber(String(raw), language) === null ? "amount" : null;
    case "date": return parseDate(String(raw)) === null ? "date" : null;
    case "postcode": return validPostcode(v) ? null : "postcode";
    case "iban": return validIban(v) ? null : "iban";
    case "email": return validEmail(v) ? null : "email";
    case "phone": return validPhone(v) ? null : "phone";
  }
  return null;
};

// --- parsing the settings

const isText = (t: unknown): t is Text => typeof t === "string" || (!!t && typeof t === "object" && ("en" in (t as object) || "nl" in (t as object)));
const asText = (t: unknown, fallback: Text = ""): Text => (isText(t) ? t : fallback);
const idOk = (id: unknown) => typeof id === "string" && /^[A-Za-z][\w-]*$/.test(id);

const parseCheck = (c: any): Check | null => {
  if (!c || typeof c !== "object") return null;
  const points = c.points === undefined ? undefined : Number(c.points);
  const p = points === undefined || !Number.isFinite(points) ? {} : { points };
  switch (c.type) {
    case "exact": return { type: "exact", value: String(c.value ?? ""), ...(c.caseSensitive ? { caseSensitive: true } : {}), ...p };
    case "oneOf": return { type: "oneOf", values: (Array.isArray(c.values) ? c.values : String(c.values ?? "").split("|")).map((v: unknown) => String(v)), ...p };
    case "number": return { type: "number", value: Number(c.value) || 0, ...(c.margin !== undefined ? { margin: Number(c.margin) || 0 } : {}), ...p };
    case "format": return FORMATS.includes(c.format) ? { type: "format", format: c.format, ...(c.format === "regex" ? { pattern: String(c.pattern ?? "") } : {}), ...p } : null;
    case "required": return { type: "required", ...p };
    case "relation":
      return RELATIONS.includes(c.relation)
        ? { type: "relation", relation: c.relation, fields: (Array.isArray(c.fields) ? c.fields : [c.fields]).filter((f: unknown) => typeof f === "string"), ...(c.margin !== undefined ? { margin: Number(c.margin) || 0 } : {}), ...p }
        : null;
  }
  return null;
};

const parseField = (f: any, index: number): Field | null => {
  if (!f || typeof f !== "object") return null;
  const type: FieldType = FIELD_TYPES.includes(f.type) ? f.type : "text";
  const field: Field = { id: idOk(f.id) ? f.id : `field${index + 1}`, type, label: asText(f.label, f.id ?? "") };
  if (f.hint !== undefined) field.hint = asText(f.hint);
  if (Array.isArray(f.options))
    field.options = f.options.map((o: any) => (typeof o === "string" ? { value: o, label: o } : { value: String(o?.value ?? ""), label: asText(o?.label, String(o?.value ?? "")) }));
  if (f.required) field.required = true;
  if (f.span === 2 || f.span === "2") field.span = 2;
  if (f.total) field.total = true;
  const checks = (Array.isArray(f.checks) ? f.checks : []).map(parseCheck).filter(Boolean) as Check[];
  if (checks.length) field.checks = checks;
  return field;
};

/** data-form as a form; anything else (empty, not JSON) gives the example. Unknown parts are left out. */
export const parseForm = (text: string | undefined, example = "waybill"): Form => {
  const fallback = example === "transfer" ? TRANSFER : WAYBILL;
  if (!text || !String(text).trim()) return clone(fallback);
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return clone(fallback);
  }
  if (!data || typeof data !== "object" || !Array.isArray(data.sections)) return clone(fallback);
  let n = 0;
  const sections: Section[] = data.sections.map((s: any, i: number) => ({
    id: idOk(s?.id) ? s.id : `section${i + 1}`,
    title: asText(s?.title),
    ...(SECTION_KINDS.includes(s?.kind) && s.kind !== "fields" ? { kind: s.kind } : {}),
    ...(s?.span === 1 || s?.span === "1" ? { span: 1 as const } : {}),
    fields: (Array.isArray(s?.fields) ? s.fields : []).map((f: any) => parseField(f, n++)).filter(Boolean),
  }));
  const form: Form = { title: asText(data.title), sections };
  if (data.code !== undefined) form.code = asText(data.code);
  if (data.situation !== undefined) form.situation = asText(data.situation);
  if (data.solution && typeof data.solution === "object") {
    form.solution = {};
    for (const [k, v] of Object.entries(data.solution)) if (typeof v === "string") form.solution[k] = v;
  }
  return form;
};

export const serializeForm = (form: Form) => JSON.stringify(form);
export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** Only the fields of this form, as text: a saved state or a response of another form loses the rest. */
export const ownValues = (form: Form, values: unknown): Values => {
  const out: Values = {};
  if (!values || typeof values !== "object") return out;
  for (const f of allFields(form)) {
    const v = (values as Record<string, unknown>)[f.id];
    if (typeof v === "string" && v !== "") out[f.id] = v;
    else if (typeof v === "number" || typeof v === "boolean") out[f.id] = String(v);
  }
  return out;
};

/** Normalised values (a response, the solution) as the candidate would have typed them in this language. */
export const rawFromNormalized = (form: Form, values: Values, language = "en"): Values => {
  const out: Values = {};
  for (const f of allFields(form)) if (values[f.id]) out[f.id] = displayValue(f, values[f.id], language);
  return out;
};

export type ResponseField = { name: string; base: { integer?: number; string?: string } };

/**
 * The record: score, maxscore, correct, check1 … (1 or 0 per check, as many as there are), value1 … (the normalised
 * value per field, in form order) and values (all normalised values by field id, as JSON).
 */
export const responseRecord = (form: Form, normalized: Values): ResponseField[] => {
  const e = evaluate(form, normalized);
  const record: ResponseField[] = [
    { name: "score", base: { integer: e.score } },
    { name: "maxscore", base: { integer: e.maxscore } },
    { name: "correct", base: { integer: e.correct ? 1 : 0 } },
  ];
  e.results.slice(0, MAX_CHECKS).forEach((r, i) => record.push({ name: `check${i + 1}`, base: { integer: r.passed ? 1 : 0 } }));
  const fields = allFields(form);
  fields.slice(0, MAX_FIELDS).forEach((f, i) => record.push({ name: `value${i + 1}`, base: { string: normalized[f.id] ?? "" } }));
  const values: Values = {};
  for (const f of fields) if (normalized[f.id]) values[f.id] = normalized[f.id];
  record.push({ name: "values", base: { string: JSON.stringify(values) } });
  return record;
};

/** The values in a response, a correct response or a saved value: the values field of a record, or a JSON string. */
export const valuesFrom = (value: any): Values | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    if (!value.trim().startsWith("{")) return null;
    try {
      const v = JSON.parse(value);
      return v && typeof v === "object" && !Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  }
  if (Array.isArray(value?.record)) return valuesFrom(value.record.find((f: any) => f?.name === "values")?.base?.string);
  if (typeof value?.base?.string === "string") return valuesFrom(value.base.string);
  if (typeof value?.values === "string") return valuesFrom(value.values);
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = v?.fieldIdentifier === "values" || v?.name === "values" ? valuesFrom(v.value ?? v.base?.string ?? v) : null;
      if (found) return found;
    }
  }
  return null;
};

// --- authoring problems (codes; texts.ts words them)

export type AuthoringProblem =
  | { code: "noFields" }
  | { code: "duplicateId"; id: string }
  | { code: "badId"; id: string }
  | { code: "reservedId"; id: string }
  | { code: "noOptions"; id: string }
  | { code: "tooManyChecks"; count: number }
  | { code: "tooManyFields"; count: number }
  | { code: "unknownField"; id: string; other: string }
  | { code: "badRegex"; id: string }
  | { code: "emptyExact"; id: string }
  | { code: "solutionFails"; check: number; id: string }
  | { code: "noChecks" };

export const authoringProblemCodes = (form: Form): AuthoringProblem[] => {
  const problems: AuthoringProblem[] = [];
  const fields = allFields(form);
  if (!fields.length) problems.push({ code: "noFields" });
  const seen = new Set<string>();
  for (const f of fields) {
    if (!idOk(f.id)) problems.push({ code: "badId", id: f.id });
    if (seen.has(f.id)) problems.push({ code: "duplicateId", id: f.id });
    if (/^(score|maxscore|correct|values|check\d+|value\d+)$/.test(f.id)) problems.push({ code: "reservedId", id: f.id });
    seen.add(f.id);
    if ((f.type === "select" || f.type === "radio") && !f.options?.length) problems.push({ code: "noOptions", id: f.id });
    for (const c of f.checks ?? []) {
      if (c.type === "relation") for (const o of c.fields) if (!fields.some((g) => g.id === o)) problems.push({ code: "unknownField", id: f.id, other: o });
      if (c.type === "format" && c.format === "regex" && (!c.pattern || !validRegex(c.pattern))) problems.push({ code: "badRegex", id: f.id });
      if (c.type === "exact" && !String(c.value ?? "").trim()) problems.push({ code: "emptyExact", id: f.id });
    }
  }
  const checks = allChecks(form);
  if (fields.length && !checks.length) problems.push({ code: "noChecks" });
  if (checks.length > MAX_CHECKS) problems.push({ code: "tooManyChecks", count: checks.length });
  if (fields.length > MAX_FIELDS) problems.push({ code: "tooManyFields", count: fields.length });
  if (form.solution && Object.keys(form.solution).length) {
    evaluate(form, form.solution).results.forEach((r, i) => !r.passed && problems.push({ code: "solutionFails", check: i + 1, id: r.field }));
  }
  return problems;
};

// --- the example forms (own content)

/** A parcel waybill (logistics): a paper form, sender and recipient side by side. */
export const WAYBILL: Form = {
  title: { en: "Waybill — domestic parcel", nl: "Vrachtbrief — pakket binnenland" },
  code: "VB-NL 04",
  situation: {
    en:
      "From: Kok Fietsonderdelen (bike parts), Molenweg 12, 7942 KD Meppel, phone 0522 381 905.\n" +
      "Order 5531 goes to Sanne de Wit, Kastanjelaan 3, 9721 BG Groningen. The parcel weighs 4.8 kg.\n" +
      "Send it by express on Tuesday 10 November 2026: it then arrives one day later. Sign the waybill as the sender.",
    nl:
      "Van: Kok Fietsonderdelen, Molenweg 12, 7942 KD Meppel, telefoon 0522 381 905.\n" +
      "Bestelling 5531 gaat naar Sanne de Wit, Kastanjelaan 3, 9721 BG Groningen. Het pakket weegt 4,8 kg.\n" +
      "Verstuur het met spoed op dinsdag 10 november 2026: het komt dan een dag later aan. Onderteken de vrachtbrief als afzender.",
  },
  sections: [
    {
      id: "sender", title: { en: "1 Sender", nl: "1 Afzender" }, kind: "address", span: 1,
      fields: [
        { id: "senderName", type: "text", label: { en: "Name / company", nl: "Naam / bedrijf" }, required: true, checks: [{ type: "exact", value: "Kok Fietsonderdelen" }] },
        { id: "senderStreet", type: "text", label: { en: "Street and number", nl: "Straat en huisnummer" }, required: true },
        { id: "senderPostcode", type: "postcode", label: { en: "Postcode", nl: "Postcode" }, required: true, checks: [{ type: "exact", value: "7942 KD" }] },
        { id: "senderCity", type: "text", label: { en: "Town", nl: "Plaats" }, required: true },
        { id: "senderPhone", type: "phone", label: { en: "Phone", nl: "Telefoon" }, checks: [{ type: "exact", value: "0522381905" }] },
      ],
    },
    {
      id: "recipient", title: { en: "2 Recipient", nl: "2 Geadresseerde" }, kind: "address", span: 1,
      fields: [
        { id: "recipientName", type: "text", label: { en: "Name", nl: "Naam" }, required: true, checks: [{ type: "exact", value: "Sanne de Wit" }] },
        { id: "recipientStreet", type: "text", label: { en: "Street and number", nl: "Straat en huisnummer" }, required: true, checks: [{ type: "exact", value: "Kastanjelaan 3" }] },
        { id: "recipientPostcode", type: "postcode", label: { en: "Postcode", nl: "Postcode" }, required: true, checks: [{ type: "exact", value: "9721 BG" }] },
        { id: "recipientCity", type: "text", label: { en: "Town", nl: "Plaats" }, required: true, checks: [{ type: "exact", value: "Groningen" }] },
      ],
    },
    {
      id: "parcel", title: { en: "3 Parcel and service", nl: "3 Pakket en dienst" },
      fields: [
        { id: "reference", type: "text", label: { en: "Your reference", nl: "Uw referentie" }, hint: { en: "e.g. an order number", nl: "bijv. een bestelnummer" }, checks: [{ type: "oneOf", values: ["5531", "order 5531", "bestelling 5531"] }] },
        { id: "weight", type: "number", label: { en: "Weight (kg)", nl: "Gewicht (kg)" }, required: true, checks: [{ type: "number", value: 4.8, margin: 0.05 }] },
        {
          id: "service", type: "radio", label: { en: "Service", nl: "Dienst" }, span: 2, required: true,
          options: [{ value: "standard", label: { en: "Standard (2–3 days)", nl: "Standaard (2–3 dagen)" } }, { value: "express", label: { en: "Express (next day)", nl: "Spoed (volgende dag)" } }, { value: "evening", label: { en: "Evening delivery", nl: "Avondbezorging" } }],
          checks: [{ type: "exact", value: "express" }],
        },
        { id: "shipDate", type: "date", label: { en: "Date sent", nl: "Verzenddatum" }, required: true, checks: [{ type: "exact", value: "2026-11-10" }] },
        { id: "deliveryDate", type: "date", label: { en: "Expected delivery", nl: "Verwachte bezorging" }, checks: [{ type: "relation", relation: "after", fields: ["shipDate"], points: 0 }, { type: "exact", value: "2026-11-11" }] },
      ],
    },
    {
      id: "sign", title: { en: "4 Signature", nl: "4 Ondertekening" },
      fields: [{ id: "signature", type: "signature", label: { en: "Signature of the sender", nl: "Handtekening afzender" }, required: true, checks: [{ type: "required" }] }],
    },
  ],
  solution: {
    senderName: "Kok Fietsonderdelen", senderStreet: "Molenweg 12", senderPostcode: "7942 KD", senderCity: "Meppel", senderPhone: "0522381905",
    recipientName: "Sanne de Wit", recipientStreet: "Kastanjelaan 3", recipientPostcode: "9721 BG", recipientCity: "Groningen",
    reference: "5531", weight: "4.8", service: "express", shipDate: "2026-11-10", deliveryDate: "2026-11-11", signature: "signed",
  },
};

/** A bank transfer (economics): an online banking form, with two invoice amounts and the total the candidate calculates. */
export const TRANSFER: Form = {
  title: { en: "Make a transfer", nl: "Geld overmaken" },
  code: "Online banking",
  situation: {
    en:
      "Bike repair shop Jansen sent you two invoices: invoice 2026-118 for a repair, € 64.50, and invoice 2026-121 for a lock, € 24.95.\n" +
      "Pay both at once to account NL91 ABNA 0417 1643 00 (name: Fietsherstel Jansen) on 16 November 2026.\n" +
      "Put both invoice numbers in the description.",
    nl:
      "Fietsherstel Jansen stuurde je twee facturen: factuur 2026-118 voor een reparatie, € 64,50, en factuur 2026-121 voor een slot, € 24,95.\n" +
      "Betaal ze samen op 16 november 2026 aan rekening NL91 ABNA 0417 1643 00 (naam: Fietsherstel Jansen).\n" +
      "Zet beide factuurnummers in de omschrijving.",
  },
  sections: [
    {
      id: "to", title: { en: "To", nl: "Naar" },
      fields: [
        { id: "payee", type: "text", label: { en: "Name of the payee", nl: "Naam ontvanger" }, required: true, checks: [{ type: "exact", value: "Fietsherstel Jansen" }] },
        { id: "iban", type: "iban", label: { en: "IBAN of the payee", nl: "IBAN ontvanger" }, hint: { en: "NL00 BANK 0123 4567 89", nl: "NL00 BANK 0123 4567 89" }, required: true, checks: [{ type: "format", format: "iban", points: 0 }, { type: "exact", value: "NL91ABNA0417164300" }] },
      ],
    },
    {
      id: "amounts", title: { en: "Amount", nl: "Bedrag" }, kind: "amounts",
      fields: [
        { id: "line1", type: "amount", label: { en: "Invoice 2026-118", nl: "Factuur 2026-118" }, checks: [{ type: "number", value: 64.5, margin: 0 }] },
        { id: "line2", type: "amount", label: { en: "Invoice 2026-121", nl: "Factuur 2026-121" }, checks: [{ type: "number", value: 24.95, margin: 0 }] },
        { id: "total", type: "amount", label: { en: "Total to transfer", nl: "Totaal over te maken" }, total: true, required: true, checks: [{ type: "relation", relation: "sum", fields: ["line1", "line2"] }, { type: "number", value: 89.45, margin: 0 }] },
      ],
    },
    {
      id: "details", title: { en: "Details", nl: "Gegevens" },
      fields: [
        { id: "description", type: "text", label: { en: "Description", nl: "Omschrijving" }, span: 2, checks: [{ type: "format", format: "regex", pattern: ".*2026-118.*2026-121.*|.*2026-121.*2026-118.*" }] },
        { id: "payDate", type: "date", label: { en: "Date of payment", nl: "Datum van betaling" }, required: true, checks: [{ type: "exact", value: "2026-11-16" }] },
        { id: "frequency", type: "select", label: { en: "How often", nl: "Hoe vaak" }, options: [{ value: "once", label: { en: "Once", nl: "Eenmalig" } }, { value: "monthly", label: { en: "Every month", nl: "Elke maand" } }], checks: [{ type: "exact", value: "once", points: 0 }] },
        { id: "save", type: "checkbox", label: { en: "Save the payee in my address book", nl: "Ontvanger opslaan in mijn adresboek" }, span: 2 },
        { id: "confirm", type: "signature", label: { en: "Confirm the transfer", nl: "Overboeking bevestigen" }, span: 2, required: true, checks: [{ type: "required", points: 0 }] },
      ],
    },
  ],
  solution: {
    payee: "Fietsherstel Jansen", iban: "NL91ABNA0417164300", line1: "64.50", line2: "24.95", total: "89.45",
    description: "Facturen 2026-118 en 2026-121", payDate: "2026-11-16", frequency: "once", confirm: "signed",
  },
};

export const EXAMPLES: Record<string, Form> = { waybill: WAYBILL, transfer: TRANSFER };
