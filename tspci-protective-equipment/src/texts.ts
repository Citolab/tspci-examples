/** The PCI's own texts (the `language` setting): items, zones, hazards, the preset jobs, the interface. */
import { HazardId, ItemId, Job, PresetId, Problem, ZoneId } from "./equipment";

export type Language = "en" | "nl";
export const languageOf = (language?: string): Language => ((language ?? "").slice(0, 2) === "nl" ? "nl" : "en");

type Words = {
  items: Record<ItemId, string>;
  /** The item after "the", lower case, for "Why the …?" and lists. */
  itemsLower: Record<ItemId, string>;
  zones: Record<ZoneId, string>;
  hazards: Record<HazardId, string>;
  jobs: Record<PresetId, { title: string; text: string }>;
};

const ENGLISH_WORDS: Words = {
  items: {
    helmet: "Safety helmet",
    bumpCap: "Bump cap",
    hairnet: "Hairnet",
    goggles: "Safety goggles",
    earPlugs: "Ear plugs",
    earMuffs: "Ear muffs",
    faceShield: "Face shield",
    dustMask: "Dust mask (FFP2)",
    respirator: "Respirator with filters",
    workGloves: "Work gloves",
    chemicalGloves: "Chemical-resistant gloves",
    cutGloves: "Cut-resistant gloves",
    safetyShoes: "Safety shoes (S3)",
    rubberBoots: "Rubber boots",
    hiVis: "High-visibility vest",
    coverall: "Coverall",
    chemicalApron: "Chemical apron",
    coldClothing: "Cold-store clothing",
    harness: "Fall-arrest harness",
  },
  itemsLower: {
    helmet: "safety helmet",
    bumpCap: "bump cap",
    hairnet: "hairnet",
    goggles: "safety goggles",
    earPlugs: "ear plugs",
    earMuffs: "ear muffs",
    faceShield: "face shield",
    dustMask: "dust mask (FFP2)",
    respirator: "respirator with filters",
    workGloves: "work gloves",
    chemicalGloves: "chemical-resistant gloves",
    cutGloves: "cut-resistant gloves",
    safetyShoes: "safety shoes (S3)",
    rubberBoots: "rubber boots",
    hiVis: "high-visibility vest",
    coverall: "coverall",
    chemicalApron: "chemical apron",
    coldClothing: "cold-store clothing",
    harness: "fall-arrest harness",
  },
  zones: { head: "Head", eyes: "Eyes", ears: "Ears", face: "Face", hands: "Hands", feet: "Feet", body: "Body", fallArrest: "Fall arrest" },
  hazards: {
    particles: "Flying particles and sparks",
    splashes: "Splashes of chemicals",
    noise: "Loud noise",
    dust: "Dust in the air you breathe",
    vapours: "Harmful vapours",
    falling: "Objects falling on your head",
    bumping: "Bumping your head",
    cuts: "Sharp edges and blades",
    rough: "Rough materials, splinters and dirt",
    crushing: "Heavy objects on your feet, nails",
    wet: "Water and wet floors",
    traffic: "Not being seen by traffic",
    cold: "Cold",
    height: "Falling from a height",
    hygiene: "Hair in the food",
  },
  jobs: {
    grinding: { title: "Grinding steel", text: "You grind the rough edges off a steel beam with an angle grinder, in the workshop." },
    cleaning: { title: "Cleaning", text: "You clean a factory floor with a strong, corrosive cleaning agent." },
    roof: { title: "On a roof", text: "You replace roof tiles on a sloping roof, 8 metres high, without a guard rail." },
    coldStore: { title: "Cold store", text: "You drive a forklift truck in a cold store at −25 °C, where colleagues walk between the racks." },
    circularSaw: { title: "Sawing wood", text: "You saw planks with a circular saw." },
    kitchen: { title: "Kitchen", text: "You prepare food in a professional kitchen." },
    roadside: { title: "Next to the road", text: "You repair a pavement next to a busy road." },
  },
};

const DUTCH_WORDS: Words = {
  items: {
    helmet: "Veiligheidshelm",
    bumpCap: "Stootpet",
    hairnet: "Haarnetje",
    goggles: "Veiligheidsbril",
    earPlugs: "Oordoppen",
    earMuffs: "Gehoorkappen",
    faceShield: "Gelaatsscherm",
    dustMask: "Stofmasker (FFP2)",
    respirator: "Masker met filters",
    workGloves: "Werkhandschoenen",
    chemicalGloves: "Chemicaliënbestendige handschoenen",
    cutGloves: "Snijbestendige handschoenen",
    safetyShoes: "Veiligheidsschoenen (S3)",
    rubberBoots: "Rubberlaarzen",
    hiVis: "Veiligheidshesje",
    coverall: "Overall",
    chemicalApron: "Chemicaliënschort",
    coldClothing: "Koudewerende kleding",
    harness: "Valbeveiligingsharnas",
  },
  itemsLower: {
    helmet: "veiligheidshelm",
    bumpCap: "stootpet",
    hairnet: "haarnetje",
    goggles: "veiligheidsbril",
    earPlugs: "oordoppen",
    earMuffs: "gehoorkappen",
    faceShield: "gelaatsscherm",
    dustMask: "stofmasker (FFP2)",
    respirator: "masker met filters",
    workGloves: "werkhandschoenen",
    chemicalGloves: "chemicaliënbestendige handschoenen",
    cutGloves: "snijbestendige handschoenen",
    safetyShoes: "veiligheidsschoenen (S3)",
    rubberBoots: "rubberlaarzen",
    hiVis: "veiligheidshesje",
    coverall: "overall",
    chemicalApron: "chemicaliënschort",
    coldClothing: "koudewerende kleding",
    harness: "valbeveiligingsharnas",
  },
  zones: { head: "Hoofd", eyes: "Ogen", ears: "Oren", face: "Gezicht", hands: "Handen", feet: "Voeten", body: "Lichaam", fallArrest: "Valbeveiliging" },
  hazards: {
    particles: "Rondvliegende deeltjes en vonken",
    splashes: "Spatten van chemicaliën",
    noise: "Hard geluid",
    dust: "Stof in de lucht die je inademt",
    vapours: "Schadelijke dampen",
    falling: "Vallende voorwerpen op je hoofd",
    bumping: "Je hoofd stoten",
    cuts: "Scherpe randen en messen",
    rough: "Ruwe materialen, splinters en vuil",
    crushing: "Zware voorwerpen op je voeten, spijkers",
    wet: "Water en natte vloeren",
    traffic: "Niet gezien worden door verkeer",
    cold: "Kou",
    height: "Vallen van hoogte",
    hygiene: "Haren in het eten",
  },
  jobs: {
    grinding: { title: "Staal slijpen", text: "Je slijpt de ruwe randen van een stalen balk met een haakse slijper, in de werkplaats." },
    cleaning: { title: "Schoonmaken", text: "Je maakt een fabrieksvloer schoon met een sterk, bijtend schoonmaakmiddel." },
    roof: { title: "Op het dak", text: "Je vervangt dakpannen op een schuin dak van 8 meter hoog, zonder randbeveiliging." },
    coldStore: { title: "Vrieshuis", text: "Je rijdt op een heftruck in een vrieshuis van −25 °C, waar collega's tussen de stellingen lopen." },
    circularSaw: { title: "Hout zagen", text: "Je zaagt planken met een cirkelzaag." },
    kitchen: { title: "Keuken", text: "Je maakt eten klaar in een professionele keuken." },
    roadside: { title: "Langs de weg", text: "Je herstelt een stoep langs een drukke weg." },
  },
};

/** A list as it is said: "a, b and c". */
export const listOf = (parts: string[], and: string) => (parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} ${and} ${parts[parts.length - 1]}`);

function english() {
  const w = ENGLISH_WORDS;
  return {
    ...w,
    job: "The job",
    instruction: "Dress the worker with the protective equipment this job needs, and no more. Drag it onto the worker, or tap it.",
    rack: "Protective equipment",
    worker: "The worker",
    chooseWorker: "Worker",
    workerName: (n: number) => `Worker ${n}`,
    wearing: (names: string[]) => (names.length ? `The worker wears: ${listOf(names, "and")}.` : "The worker wears no protective equipment yet."),
    worn: "worn",
    notWorn: "not worn",
    takeOffHint: "Tap equipment on the worker to take it off.",
    sign: (name: string) => `Mandatory sign: ${name.toLowerCase()}`,
    why: "Why?",
    whyIntro: "Choose for each piece of equipment what it protects you against.",
    whyFor: (item: string) => `Why the ${item}?`,
    choose: "Choose…",
    wornList: "Worn",
    nothingWorn: "Nothing",
    problems: {
      unreadableJob: "The own job can not be read: the default job is shown.",
      noText: "Describe the job.",
      noRequired: "Mark at least one piece of equipment as required.",
      noReason: "For these items none of the ticked hazards is a reason the pupil can give:",
    } satisfies Record<Problem, string>,
  };
}
export type Texts = ReturnType<typeof english>;

function dutch(): Texts {
  const w = DUTCH_WORDS;
  return {
    ...w,
    job: "Het werk",
    instruction: "Geef de werker de beschermingsmiddelen die dit werk nodig heeft, en niet meer. Sleep ze naar de werker, of tik erop.",
    rack: "Persoonlijke beschermingsmiddelen",
    worker: "De werker",
    chooseWorker: "Werker",
    workerName: (n: number) => `Werker ${n}`,
    wearing: (names: string[]) => (names.length ? `De werker draagt: ${listOf(names, "en")}.` : "De werker draagt nog geen beschermingsmiddelen."),
    worn: "aan",
    notWorn: "niet aan",
    takeOffHint: "Tik op een beschermingsmiddel op de werker om het uit te doen.",
    sign: (name: string) => `Gebodsbord: ${name.toLowerCase()}`,
    why: "Waarom?",
    whyIntro: "Kies bij elk beschermingsmiddel waartegen het je beschermt.",
    whyFor: (item: string) => `Waarom de ${item}?`,
    choose: "Kies…",
    wornList: "Aan",
    nothingWorn: "Niets",
    problems: {
      unreadableJob: "Het eigen werk is niet te lezen: het standaardwerk staat er.",
      noText: "Beschrijf het werk.",
      noRequired: "Maak minstens één beschermingsmiddel verplicht.",
      noReason: "Voor deze middelen is geen van de aangevinkte gevaren een reden die de leerling kan geven:",
    },
  };
}

export const textsFor = (language: string | undefined): Texts => (languageOf(language) === "nl" ? dutch() : english());

/** The text of the job: the author's own, or the preset's in the language. */
export const jobText = (job: Job, t: Texts) => (job.preset === "custom" ? (job.text ?? "") : t.jobs[job.preset].text);

/** A problem with the settings as the author reads it, with the items where that is the problem. */
export const problemText = (p: { problem: Problem; items?: ItemId[] }, t: Texts) =>
  p.items?.length ? `${t.problems[p.problem]} ${p.items.map((id) => t.itemsLower[id]).join(", ")}.` : t.problems[p.problem];
