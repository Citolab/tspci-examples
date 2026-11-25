/**
 * A time written by a student ("ten past four", "half zeven", "4:10") to a number, and back.
 *
 * The number is the time as minutes since 12:00, 0-719: the same for the morning and the afternoon, because a time in
 * words ("ten past four") and an analog clock do not tell them apart. So 4:10 and 16:10 are both 250.
 *
 * No DOM and no imports: `npm test` runs this file in node as it is (test/timeText.test.ts).
 */
export type Language = "en" | "nl";

const HALF_DAY = 720; // minutes on a 12-hour clock

const EN_UNITS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen",
  "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const EN_TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50 };
const NL_UNITS = [
  "nul", "een", "twee", "drie", "vier", "vijf", "zes", "zeven", "acht", "negen", "tien", "elf", "twaalf", "dertien", "veertien",
  "vijftien", "zestien", "zeventien", "achttien", "negentien",
];
const NL_TENS: Record<string, number> = { twintig: 20, dertig: 30, veertig: 40, vijftig: 50 };

/** A number from 0 to 59 in words: "twenty-five", "vijfentwintig". */
function numberWord(n: number, language: Language): string {
  const units = language === "nl" ? NL_UNITS : EN_UNITS;
  if (n < 20) return units[n];
  const tens = language === "nl" ? NL_TENS : EN_TENS;
  const ten = Object.keys(tens).find((word) => tens[word] === n - (n % 10));
  if (n % 10 === 0) return ten;
  if (language === "en") return `${ten}-${units[n % 10]}`;
  // Dutch puts the unit first: vierentwintig, and tweeëntwintig after an e.
  const unit = units[n % 10];
  return unit + (unit.endsWith("e") ? "ën" : "en") + ten;
}

/** Every number word of a language (without accents, as the text is compared without them) with its number. */
function numberWords(language: Language): Record<string, number> {
  const words: Record<string, number> = {};
  for (let n = 0; n < 60; n++) words[plain(numberWord(n, language))] = n;
  return words;
}
const WORDS: Record<Language, Record<string, number>> = { en: numberWords("en"), nl: numberWords("nl") };

// Words that do not change the time: "it is a quarter past three in the afternoon", "het is 's middags kwart over drie".
const FILLERS: Record<Language, string[]> = {
  en: ["it", "is", "its", "a", "at", "the", "in", "minute", "minutes", "oh", "am", "pm", "morning", "afternoon", "evening"],
  nl: ["het", "t", "is", "om", "s", "minuut", "minuten", "ochtends", "morgens", "middags", "avonds", "nachts"],
};

/** Lower case and without accents: "Één" and "een" are the same word. */
function plain(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** The text as plain words and numbers with single spaces: "It's Twenty-five past 4." -> "25 past 4". */
function normalize(text: string, language: Language): string {
  const words = plain(text)
    .replace(/(\d)\s*[.:]\s*(?=\d)/g, "$1:") // 4.10 and 4 : 10 -> 4:10
    .replace(/[.'’`]/g, "") // o'clock -> oclock, a.m. -> am, 's -> s
    .replace(/[^a-z0-9:]+/g, " ") // twenty-five -> twenty five
    .replace(/(\d)([a-z])/g, "$1 $2") // 4pm -> 4 pm, 4u10 -> 4 u10
    .replace(/([a-z])(\d)/g, "$1 $2") // u10 -> u 10
    .replace(/\bo clock\b/g, "oclock")
    .trim()
    .split(" ");

  const numbers = WORDS[language];
  const tens = language === "nl" ? NL_TENS : EN_TENS;
  const isUnit = (word: string) => numbers[word] >= 1 && numbers[word] <= 9;
  const result: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (language === "en" && word in tens && isUnit(words[i + 1])) {
      result.push(String(tens[word] + numbers[words[++i]])); // twenty five
    } else if (language === "nl" && isUnit(word) && words[i + 1] === "en" && words[i + 2] in tens) {
      result.push(String(numbers[word] + tens[words[i + 2]])); // vijf en twintig
      i += 2;
    } else if (word in numbers) {
      result.push(String(numbers[word]));
    } else if (language === "nl" && word === "u") {
      result.push("uur"); // 4u10
    } else if (!FILLERS[language].includes(word)) {
      result.push(word);
    }
  }
  return result.join(" ");
}

const wrap = (minutes: number) => ((minutes % HALF_DAY) + HALF_DAY) % HALF_DAY;

/** Minutes since 12:00 for an hour (0-24) and a minute (0-59); null when one of them is not on a clock. */
function at(hour: number, minute: number): number | null {
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59) return null;
  return wrap(hour * 60 + minute);
}

/** `minutes` before or after another time (null stays null). */
function shift(time: number | null, minutes: number): number | null {
  return time === null ? null : wrap(time + minutes);
}

/**
 * The time in a text, as minutes since 12:00 (0-719); null when the text is not a time.
 *
 * English: "4:10", "4.10 pm", "six o'clock", "six", "ten past four", "a quarter to five", "half past six", "half six",
 * "twenty-five to 3", "four ten", "four oh five", "noon", "midnight".
 * Dutch: "4:10", "4u10", "zes uur", "zes", "tien over vier", "kwart voor vijf", "half zeven" (6:30), "vijf voor half
 * zeven" (6:25), "vijf over half zeven" (6:35), "vier uur tien", "middernacht".
 */
export function parseTime(text: string, language: Language = "en"): number | null {
  const s = normalize(text, language);
  let m: RegExpExecArray | null;

  if ((m = /^(\d{1,2}):(\d{2})$/.exec(s))) return at(Number(m[1]), Number(m[2]));

  if (language === "nl") {
    if (s === "middernacht") return 0;
    if ((m = /^(\d{1,2})(?: uur)?$/.exec(s))) return at(Number(m[1]), 0);
    if ((m = /^(\d{1,2}) uur (\d{1,2})$/.exec(s))) return at(Number(m[1]), Number(m[2]));
    // "half zeven" is half an hour before seven
    if ((m = /^half (\d{1,2})$/.exec(s))) return shift(at(Number(m[1]), 0), -30);
    if ((m = /^(\d{1,2}) (over|na|voor) half (\d{1,2})$/.exec(s))) {
      const minutes = Number(m[1]);
      if (minutes < 1 || minutes > 29) return null;
      return shift(at(Number(m[3]), 0), -30 + (m[2] === "voor" ? -minutes : minutes));
    }
    if ((m = /^(\d{1,2}|kwart) (over|na|voor) (\d{1,2})(?: uur)?$/.exec(s))) {
      const minutes = m[1] === "kwart" ? 15 : Number(m[1]);
      if (minutes < 1 || minutes > 59) return null;
      return shift(at(Number(m[3]), 0), m[2] === "voor" ? -minutes : minutes);
    }
    return null;
  }

  if (s === "noon" || s === "midday" || s === "midnight") return 0;
  if ((m = /^(\d{1,2})(?: oclock)?$/.exec(s))) return at(Number(m[1]), 0);
  // "half six" is half past six (and not, as in Dutch, half past five)
  if ((m = /^half (\d{1,2})$/.exec(s))) return shift(at(Number(m[1]), 0), 30);
  if ((m = /^(\d{1,2}|quarter|half) (past|after|to|till|til|before|of) (\d{1,2})(?: oclock)?$/.exec(s))) {
    const after = m[2] === "past" || m[2] === "after";
    if (m[1] === "half" && !after) return null; // nobody says "half to six"
    const minutes = m[1] === "quarter" ? 15 : m[1] === "half" ? 30 : Number(m[1]);
    if (minutes < 1 || minutes > 59) return null;
    return shift(at(Number(m[3]), 0), after ? minutes : -minutes);
  }
  if ((m = /^(\d{1,2}) (\d{1,2})$/.exec(s))) return at(Number(m[1]), Number(m[2])); // four ten
  return null;
}

/**
 * A time (minutes since 12:00) in words, the way parseTime reads it back: "ten past four", "half zeven". Used to show
 * a response or the correct response in the input.
 */
export function formatTime(time: number, language: Language = "en"): string {
  const total = wrap(Math.round(time));
  const minute = total % 60;
  const word = (n: number) => numberWord(n, language);
  const hour = word(Math.floor(total / 60) || 12); // 0 is twelve o'clock
  const nextHour = word((Math.floor(total / 60) + 1) % 12 || 12);

  if (language === "nl") {
    if (minute === 0) return `${hour} uur`;
    if (minute < 15) return `${word(minute)} over ${hour}`;
    if (minute === 15) return `kwart over ${hour}`;
    if (minute < 30) return `${word(30 - minute)} voor half ${nextHour}`;
    if (minute === 30) return `half ${nextHour}`;
    if (minute < 45) return `${word(minute - 30)} over half ${nextHour}`;
    if (minute === 45) return `kwart voor ${nextHour}`;
    return `${word(60 - minute)} voor ${nextHour}`;
  }

  // "ten past", but "seven minutes past": only the five-minute marks go without "minutes".
  const count = (n: number) => (n % 5 === 0 ? word(n) : `${word(n)} ${n === 1 ? "minute" : "minutes"}`);
  if (minute === 0) return `${hour} o'clock`;
  if (minute === 15) return `quarter past ${hour}`;
  if (minute === 30) return `half past ${hour}`;
  if (minute === 45) return `quarter to ${nextHour}`;
  return minute < 30 ? `${count(minute)} past ${hour}` : `${count(60 - minute)} to ${nextHour}`;
}
