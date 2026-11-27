// The texts of the staff rota per language (data-language, or the authoring system's language). The item's own texts
// are the prompt and the rota (names, shift cards, the author's question texts).
import type { Question, QuestionKind, Rule, RuleType } from "./rota";

const num = (n: number, nl: boolean) => (nl ? String(Math.round(n * 100) / 100).replace(".", ",") : String(Math.round(n * 100) / 100));
const list = (names: string[], and: string) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} ${and} ${names[names.length - 1]}`);

const en = {
  locale: "en",
  days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  daysShort: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  duration: (minutes: number) => {
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return [h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ") || "0 min";
  },
  hours: (h: number) => `${num(h, false)} h`,
  money: (amount: number) => `€ ${amount.toFixed(2)}`,
  prompts: {
    readRota: "This is the rota of the corner shop from Thursday to Sunday. Answer the questions.",
    makeRota: "Make the rota of the corner shop from Thursday to Sunday. Drag the shifts onto the days of the employees, and keep to the rules.",
    hoursAndPay: "This is the rota of the corner shop. How many hours does everyone work this week, and how much do they earn?",
  },
  ownPrompt: "Make a rota, then work out how many hours everyone works this week and how much they earn.",
  rota: "Rota",
  rotaOf: (prompt: string) => `Rota: ${prompt}`,
  employee: "Employee",
  shifts: "Shifts",
  shiftCard: (label: string, when: string) => `${label}, ${when}`,
  free: "free",
  notAtWork: "not at work",
  notAvailable: "cannot work",
  closed: "closed",
  open: (from: string, to: string) => `open ${from}–${to}`,
  breakOf: (minutes: number) => (minutes ? `break ${minutes} min` : "no break"),
  breakShort: (minutes: number) => `${minutes} min break`,
  shiftText: (from: string, to: string, brk: number) => `${from}–${to}, ${brk ? `break ${brk} min` : "no break"}`,
  cell: (day: string, employee: string, time: string) => `${day}, ${employee}, ${time}`,
  remove: "Remove",
  shorter: "Shorter",
  longer: "Longer",
  lessBreak: "Shorter break",
  moreBreak: "Longer break",
  undo: "Undo",
  clear: "Start again",
  showHelp: "Help",
  help:
    "Drag a shift card onto a day of an employee, or pick a card and click a row. Drag a shift to move it, drag its right edge to make it " +
    "longer or shorter, drag it out of the rota to remove it. The buttons above the rota change the shift of the row you chose, its break as well. " +
    "Keyboard: pick a card with Enter, choose the employee and the day with the arrow keys and press Enter. In the rota: Enter picks up the shift " +
    "in the row (then the arrow keys and Enter move it), Shift + arrow left or right makes it shorter or longer, B makes the break longer and " +
    "Shift + B shorter, Delete removes it, Escape drops a picked card.",
  pickedCard: (label: string) => `${label} picked: choose the employee and the day with the arrow keys and press Enter, or click a row.`,
  pickedShift: (name: string, day: string) => `The shift of ${name} on ${day} picked up: choose a place with the arrow keys and press Enter, or click a cell.`,
  placed: (name: string, day: string, what: string) => `${name}, ${day}: ${what}.`,
  replaced: (what: string) => ` It replaces ${what}.`,
  removed: (name: string, day: string) => `The shift of ${name} on ${day} removed.`,
  dropped: "Nothing picked.",
  undone: "Undone.",
  cleared: "The rota is empty again.",
  // live feedback
  issueUnavailable: (name: string, day: string) => `${name} cannot work on ${day}`,
  issueTooLong: (hours: string) => `Longer than ${hours}`,
  issueNoBreak: (minutes: number, hours: string) => `Needs a break of ${minutes} min (longer than ${hours})`,
  issueRest: (rest: string, day: string) => `Only ${rest} rest after ${day}`,
  issueWeekend: (days: number) => `Works more than ${days} ${days === 1 ? "day" : "days"} in the weekend`,
  gap: (day: string, from: string, to: string, staff: number, need: number) => `${day} ${from}–${to}: ${staff} ${staff === 1 ? "person" : "people"}, at least ${need} needed`,
  coverage: "At work",
  coverageRow: (day: string) => `People at work on ${day}`,
  problems: "Problems",
  hoursThisWeek: "Hours this week",
  hoursOf: (hours: string, min: string, max: string) => `${hours} (contract ${min}–${max})`,
  outsideContract: "outside the contract hours",
  legendClosed: "Closed",
  legendUnavailable: "Cannot work",
  legendProblem: "Problem",
  rules: "Rules",
  employees: "Employees",
  contract: (min: string, max: string) => `${min} to ${max} a week`,
  cannotWorkOn: (days: string[]) => `cannot work on ${list(days, "and")}`,
  // readRota
  questions: "Questions",
  question: (n: number) => `Question ${n}`,
  questionText: (q: Question, name: string, day: string, time: string): string => {
    switch (q.kind) {
      case "shift": return `When does ${name} work on ${day}?`;
      case "hours": return `How many hours does ${name} work this week, without breaks?`;
      case "opens": return `Who opens on ${day}? (Who starts first?)`;
      case "closes": return `Who closes on ${day}? (Who works until the end?)`;
      case "whoAt": return `Who works on ${day} at ${time}?`;
      case "staffAt": return `How many people work on ${day} at ${time}?`;
      case "number": return "";
    }
  },
  from: "from",
  to: "to",
  timePlaceholder: "hh:mm",
  doesNotWork: "Does not work",
  hoursUnit: "hours",
  peopleUnit: "people",
  tapNames: "Tap the names",
  // hoursAndPay
  hourlyWage: "Hourly wage",
  hoursWorked: "Hours worked (without breaks)",
  pay: "Pay this week",
  hoursBox: (name: string) => `Hours worked by ${name}`,
  payBox: (name: string) => `Pay of ${name} in euros`,
  sundayRule: (pct: string) => `On Sunday you earn ${pct}% extra per hour.`,
  eveningRule: (pct: string, from: string) => `From ${from} you earn ${pct}% extra per hour (not on Sunday).`,
  breaksUnpaid: "Breaks are not paid.",
  // the rules, as a rubric line
  ruleName: {
    coverage: "People during opening hours",
    contractHours: "Contract hours",
    available: "Days someone cannot work",
    maxShift: "Longest shift",
    break: "Break in a long shift",
    rest: "Rest between shifts",
    weekend: "Weekend days",
  } as Record<RuleType, string>,
  ruleText: (r: Rule): string => {
    switch (r.type) {
      case "coverage": return `At least ${r.staff} ${r.staff === 1 ? "person" : "people"} at work whenever the shop is open`;
      case "contractHours": return "Everyone works within their contract hours (without breaks)";
      case "available": return "Nobody works on a day they cannot";
      case "maxShift": return `No shift longer than ${num(r.hours, false)} hours (from start to end)`;
      case "break": return `A break of at least ${r.minutes} min in a shift longer than ${num(r.hours, false)} hours`;
      case "rest": return `At least ${num(r.hours, false)} hours of rest between two shifts of the same person`;
      case "weekend": return `Nobody works more than ${r.days} ${r.days === 1 ? "day" : "days"} in the weekend`;
    }
  },
  // authoring mode
  tabShop: "Shop",
  tabEmployees: "Employees",
  tabTemplates: "Shift cards",
  tabRules: "Rules",
  tabQuestions: "Questions",
  tabPay: "Pay",
  tabRota: (mode: string): string => (mode === "makeRota" ? "Example solution" : "Rota"),
  modeHint: (mode: string, own: boolean): string =>
    mode === "readRota" ? "Reading a rota: the candidate answers your questions about the rota you make here."
      : mode === "makeRota" ? "Making a rota: the candidate fills in the rota; the PCI checks your rules."
        : own ? "Hours and pay: the candidate makes a rota, then works out the hours and pay of everyone in it."
          : "Hours and pay: the candidate works out the hours and pay of everyone in the rota you make here.",
  shopHint: "The days the shop is open, with their opening hours, and the time axis of the rota.",
  employeesHint: "The rows of the rota. Contract hours per week (without breaks), the hourly wage and the days someone cannot work.",
  templatesHint: "The cards the candidate drags into the rota. A card keeps its times; the candidate can move it and make it longer or shorter.",
  rulesHint: "Each rule is a line of the rubric, with points. The mark shows whether the example solution passes it.",
  questionsHint: "The answers follow from the rota. Leave the text empty for the question the PCI makes of it.",
  payHint: "Surcharges in percent; 0 is none. The table shows the answers that follow from the rota.",
  rotaHint: (mode: string, own: boolean): string =>
    mode === "makeRota" || own ? "Make the example solution as a candidate would. It previews the rules and is shown in the solution status."
      : "Make the rota the candidate reads. The answers follow from it.",
  ownRota: "The candidate makes the rota (own rota)",
  askPay: "Ask for the pay as well (not only the hours)",
  sunday: "Sunday surcharge (%)",
  evening: "Evening surcharge (%)",
  eveningFrom: "Evening from",
  dayOpen: "Open",
  openFrom: "From",
  openTo: "To",
  axisFrom: "Rota from",
  axisTo: "Rota to",
  slot: "Minutes per column",
  name: "Name",
  minHours: "Contract from (h)",
  maxHours: "to (h)",
  wage: "Hourly wage (€)",
  cannotWork: "Cannot work on",
  label: "Text",
  start: "Start",
  end: "End",
  breakMinutes: "Break (min)",
  add: "Add",
  delete: "Delete",
  points: "Points",
  addRule: "Add a rule",
  addQuestion: "Add a question",
  removeRule: "Remove",
  staff: "People",
  hoursLabel: "Hours",
  minutesLabel: "Minutes",
  daysLabel: "Days",
  kind: "Kind",
  kindName: {
    shift: "When does … work",
    hours: "Hours in the week",
    opens: "Who opens",
    closes: "Who closes",
    whoAt: "Who works at",
    staffAt: "How many people at",
    number: "Own question (a number)",
  } as Record<QuestionKind, string>,
  questionPlaceholder: "Your question",
  answerLabel: "Answer",
  answerIs: (text: string) => `Answer: ${text}`,
  nobody: "nobody",
  time: "Time",
  day: "Day",
  employeeLabel: "Employee",
  noSolution: "No example solution yet.",
  noRota: "No rota yet.",
  clearRota: (mode: string): string => (mode === "makeRota" ? "Clear the example solution" : "Clear the rota"),
  summary: (score: number, max: number) => `The example solution scores ${score} of ${max}.`,
  shiftsInRota: (n: number) => `${n} ${n === 1 ? "shift" : "shifts"} in the rota.`,
  problemNoRules: "There are no rules: nothing is scored.",
  problemNoQuestions: "There are no questions.",
  problemNoRota: "The rota is empty.",
  problemNoTemplates: "There are no shift cards.",
  problemRule: (n: number) => `The example solution does not pass rule ${n}.`,
  problemOpen: (day: string) => `The opening hours of ${day} are empty.`,
  problemNobody: (n: number) => `Question ${n}: nobody fits; the candidate cannot answer it.`,
  problemNumber: (n: number) => `Question ${n} has no text.`,
};

export type RotaTexts = typeof en;

const nl: RotaTexts = {
  locale: "nl",
  days: ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"],
  daysShort: ["ma", "di", "wo", "do", "vr", "za", "zo"],
  duration: (minutes: number) => {
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return [h ? `${h} uur` : "", m ? `${m} min` : ""].filter(Boolean).join(" ") || "0 min";
  },
  hours: (h: number) => `${num(h, true)} uur`,
  money: (amount: number) => `€ ${amount.toFixed(2).replace(".", ",")}`,
  prompts: {
    readRota: "Dit is het rooster van de buurtsuper van donderdag tot en met zondag. Beantwoord de vragen.",
    makeRota: "Maak het rooster van de buurtsuper van donderdag tot en met zondag. Sleep de diensten naar de dagen van de medewerkers, en houd je aan de regels.",
    hoursAndPay: "Dit is het rooster van de buurtsuper. Hoeveel uur werkt iedereen deze week, en hoeveel verdienen ze?",
  },
  ownPrompt: "Maak een rooster en reken dan uit hoeveel uur iedereen deze week werkt en hoeveel ze verdienen.",
  rota: "Rooster",
  rotaOf: (prompt: string) => `Rooster: ${prompt}`,
  employee: "Medewerker",
  shifts: "Diensten",
  shiftCard: (label: string, when: string) => `${label}, ${when}`,
  free: "vrij",
  notAtWork: "niet aan het werk",
  notAvailable: "kan niet",
  closed: "gesloten",
  open: (from: string, to: string) => `open ${from}–${to}`,
  breakOf: (minutes: number) => (minutes ? `pauze ${minutes} min` : "geen pauze"),
  breakShort: (minutes: number) => `${minutes} min pauze`,
  shiftText: (from: string, to: string, brk: number) => `${from}–${to}, ${brk ? `pauze ${brk} min` : "geen pauze"}`,
  cell: (day: string, employee: string, time: string) => `${day}, ${employee}, ${time}`,
  remove: "Weghalen",
  shorter: "Korter",
  longer: "Langer",
  lessBreak: "Kortere pauze",
  moreBreak: "Langere pauze",
  undo: "Ongedaan maken",
  clear: "Opnieuw beginnen",
  showHelp: "Uitleg",
  help:
    "Sleep een dienstkaart naar een dag van een medewerker, of kies een kaart en klik op een rij. Sleep een dienst om hem te verplaatsen, sleep de " +
    "rechterrand om hem langer of korter te maken, sleep hem uit het rooster om hem weg te halen. De knoppen boven het rooster veranderen de dienst " +
    "van de rij die je koos, ook de pauze. Toetsenbord: kies een kaart met Enter, kies de medewerker en de dag met de pijltjes en druk op Enter. " +
    "In het rooster: Enter pakt de dienst in de rij op (de pijltjes en Enter verplaatsen hem dan), Shift + pijl links of rechts maakt hem korter " +
    "of langer, B maakt de pauze langer en Shift + B korter, Delete haalt hem weg, Escape legt een gekozen kaart terug.",
  pickedCard: (label: string) => `${label} gekozen: kies de medewerker en de dag met de pijltjes en druk op Enter, of klik op een rij.`,
  pickedShift: (name: string, day: string) => `De dienst van ${name} op ${day} opgepakt: kies een plek met de pijltjes en druk op Enter, of klik op een vak.`,
  placed: (name: string, day: string, what: string) => `${name}, ${day}: ${what}.`,
  replaced: (what: string) => ` Deze vervangt ${what}.`,
  removed: (name: string, day: string) => `De dienst van ${name} op ${day} weggehaald.`,
  dropped: "Niets gekozen.",
  undone: "Ongedaan gemaakt.",
  cleared: "Het rooster is weer leeg.",
  issueUnavailable: (name: string, day: string) => `${name} kan niet op ${day}`,
  issueTooLong: (hours: string) => `Langer dan ${hours}`,
  issueNoBreak: (minutes: number, hours: string) => `Moet ${minutes} min pauze hebben (langer dan ${hours})`,
  issueRest: (rest: string, day: string) => `Maar ${rest} rust na ${day}`,
  issueWeekend: (days: number) => `Werkt meer dan ${days} ${days === 1 ? "dag" : "dagen"} in het weekend`,
  gap: (day: string, from: string, to: string, staff: number, need: number) => `${day} ${from}–${to}: ${staff} ${staff === 1 ? "persoon" : "mensen"}, minstens ${need} nodig`,
  coverage: "Aan het werk",
  coverageRow: (day: string) => `Mensen aan het werk op ${day}`,
  problems: "Problemen",
  hoursThisWeek: "Uren deze week",
  hoursOf: (hours: string, min: string, max: string) => `${hours} (contract ${min}–${max})`,
  outsideContract: "buiten de contracturen",
  legendClosed: "Gesloten",
  legendUnavailable: "Kan niet",
  legendProblem: "Probleem",
  rules: "Regels",
  employees: "Medewerkers",
  contract: (min: string, max: string) => `${min} tot ${max} per week`,
  cannotWorkOn: (days: string[]) => `kan niet op ${list(days, "en")}`,
  questions: "Vragen",
  question: (n: number) => `Vraag ${n}`,
  questionText: (q: Question, name: string, day: string, time: string): string => {
    switch (q.kind) {
      case "shift": return `Wanneer werkt ${name} op ${day}?`;
      case "hours": return `Hoeveel uur werkt ${name} deze week, zonder pauzes?`;
      case "opens": return `Wie opent op ${day}? (Wie begint het eerst?)`;
      case "closes": return `Wie sluit af op ${day}? (Wie werkt tot het eind?)`;
      case "whoAt": return `Wie werkt er op ${day} om ${time}?`;
      case "staffAt": return `Hoeveel mensen werken er op ${day} om ${time}?`;
      case "number": return "";
    }
  },
  from: "van",
  to: "tot",
  timePlaceholder: "uu:mm",
  doesNotWork: "Werkt niet",
  hoursUnit: "uur",
  peopleUnit: "mensen",
  tapNames: "Tik de namen aan",
  hourlyWage: "Uurloon",
  hoursWorked: "Gewerkte uren (zonder pauzes)",
  pay: "Loon deze week",
  hoursBox: (name: string) => `Gewerkte uren van ${name}`,
  payBox: (name: string) => `Loon van ${name} in euro`,
  sundayRule: (pct: string) => `Op zondag verdien je ${pct}% extra per uur.`,
  eveningRule: (pct: string, from: string) => `Vanaf ${from} verdien je ${pct}% extra per uur (niet op zondag).`,
  breaksUnpaid: "Pauzes worden niet betaald.",
  ruleName: {
    coverage: "Mensen tijdens openingstijden",
    contractHours: "Contracturen",
    available: "Dagen dat iemand niet kan",
    maxShift: "Langste dienst",
    break: "Pauze in een lange dienst",
    rest: "Rust tussen diensten",
    weekend: "Weekenddagen",
  },
  ruleText: (r: Rule): string => {
    switch (r.type) {
      case "coverage": return `Altijd minstens ${r.staff} ${r.staff === 1 ? "persoon" : "mensen"} aan het werk als de winkel open is`;
      case "contractHours": return "Iedereen werkt binnen zijn contracturen (zonder pauzes)";
      case "available": return "Niemand werkt op een dag dat hij niet kan";
      case "maxShift": return `Geen dienst langer dan ${num(r.hours, true)} uur (van begin tot eind)`;
      case "break": return `Een pauze van minstens ${r.minutes} min bij een dienst langer dan ${num(r.hours, true)} uur`;
      case "rest": return `Minstens ${num(r.hours, true)} uur rust tussen twee diensten van dezelfde persoon`;
      case "weekend": return `Niemand werkt meer dan ${r.days} ${r.days === 1 ? "dag" : "dagen"} in het weekend`;
    }
  },
  tabShop: "Winkel",
  tabEmployees: "Medewerkers",
  tabTemplates: "Dienstkaarten",
  tabRules: "Regels",
  tabQuestions: "Vragen",
  tabPay: "Loon",
  tabRota: (mode: string) => (mode === "makeRota" ? "Voorbeeldoplossing" : "Rooster"),
  modeHint: (mode: string, own: boolean) =>
    mode === "readRota" ? "Rooster lezen: de kandidaat beantwoordt je vragen over het rooster dat je hier maakt."
      : mode === "makeRota" ? "Rooster maken: de kandidaat vult het rooster in; de PCI controleert je regels."
        : own ? "Uren en loon: de kandidaat maakt een rooster en rekent dan de uren en het loon van iedereen erin uit."
          : "Uren en loon: de kandidaat rekent de uren en het loon uit van iedereen in het rooster dat je hier maakt.",
  shopHint: "De dagen dat de winkel open is, met de openingstijden, en de tijdas van het rooster.",
  employeesHint: "De rijen van het rooster. Contracturen per week (zonder pauzes), het uurloon en de dagen dat iemand niet kan.",
  templatesHint: "De kaarten die de kandidaat in het rooster sleept. Een kaart houdt zijn tijden; de kandidaat kan hem verplaatsen en langer of korter maken.",
  rulesHint: "Elke regel is een regel van het beoordelingsmodel, met punten. Het teken laat zien of de voorbeeldoplossing hem haalt.",
  questionsHint: "De antwoorden volgen uit het rooster. Laat de tekst leeg voor de vraag die de PCI ervan maakt.",
  payHint: "Toeslagen in procenten; 0 is geen. De tabel laat de antwoorden zien die uit het rooster volgen.",
  rotaHint: (mode: string, own: boolean) =>
    mode === "makeRota" || own ? "Maak de voorbeeldoplossing zoals een kandidaat dat zou doen. Daarmee worden de regels bekeken, en hij is te zien in de oplossingsstatus."
      : "Maak het rooster dat de kandidaat leest. De antwoorden volgen eruit.",
  ownRota: "De kandidaat maakt het rooster (eigen rooster)",
  askPay: "Ook naar het loon vragen (niet alleen de uren)",
  sunday: "Zondagtoeslag (%)",
  evening: "Avondtoeslag (%)",
  eveningFrom: "Avond vanaf",
  dayOpen: "Open",
  openFrom: "Van",
  openTo: "Tot",
  axisFrom: "Rooster van",
  axisTo: "Rooster tot",
  slot: "Minuten per kolom",
  name: "Naam",
  minHours: "Contract van (uur)",
  maxHours: "tot (uur)",
  wage: "Uurloon (€)",
  cannotWork: "Kan niet op",
  label: "Tekst",
  start: "Begin",
  end: "Eind",
  breakMinutes: "Pauze (min)",
  add: "Toevoegen",
  delete: "Verwijderen",
  points: "Punten",
  addRule: "Regel toevoegen",
  addQuestion: "Vraag toevoegen",
  removeRule: "Weghalen",
  staff: "Mensen",
  hoursLabel: "Uren",
  minutesLabel: "Minuten",
  daysLabel: "Dagen",
  kind: "Soort",
  kindName: {
    shift: "Wanneer werkt …",
    hours: "Uren in de week",
    opens: "Wie opent",
    closes: "Wie sluit af",
    whoAt: "Wie werkt er om",
    staffAt: "Hoeveel mensen om",
    number: "Eigen vraag (een getal)",
  },
  questionPlaceholder: "Je vraag",
  answerLabel: "Antwoord",
  answerIs: (text: string) => `Antwoord: ${text}`,
  nobody: "niemand",
  time: "Tijd",
  day: "Dag",
  employeeLabel: "Medewerker",
  noSolution: "Nog geen voorbeeldoplossing.",
  noRota: "Nog geen rooster.",
  clearRota: (mode: string) => (mode === "makeRota" ? "Voorbeeldoplossing wissen" : "Rooster wissen"),
  summary: (score: number, max: number) => `De voorbeeldoplossing haalt ${score} van ${max} punten.`,
  shiftsInRota: (n: number) => `${n} ${n === 1 ? "dienst" : "diensten"} in het rooster.`,
  problemNoRules: "Er zijn geen regels: er wordt niets gescoord.",
  problemNoQuestions: "Er zijn geen vragen.",
  problemNoRota: "Het rooster is leeg.",
  problemNoTemplates: "Er zijn geen dienstkaarten.",
  problemRule: (n: number) => `De voorbeeldoplossing haalt regel ${n} niet.`,
  problemOpen: (day: string) => `De openingstijden van ${day} zijn leeg.`,
  problemNobody: (n: number) => `Vraag ${n}: niemand past; de kandidaat kan hem niet beantwoorden.`,
  problemNumber: (n: number) => `Vraag ${n} heeft geen tekst.`,
};

export const rotaTextsFor = (language: string = "en"): RotaTexts => (String(language).toLowerCase().startsWith("nl") ? nl : en);
