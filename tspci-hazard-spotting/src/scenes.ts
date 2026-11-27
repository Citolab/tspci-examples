/*
 * The four scenes: their spots, where they are in the picture (drawings.tsx draws them) and their texts. No imports, so
 * the tests in node can check them (test/hazards.test.ts).
 *
 * A spot is a hazard or a safe look-alike (a decoy). Of a hazard the picture has two versions: unsafe when it counts,
 * and safe when the author left it out (then it is a look-alike too). Every spot has:
 * - label: a neutral name, read out for the keyboard ("spot 3 of 12: the ladder") and in the list of marks; it never
 *   says what is wrong;
 * - name and why (a hazard): what is unsafe and what should be done, shown after answering;
 * - safe: why the spot is safe (a decoy, or a hazard shown safe), shown after answering when the pupil marked it;
 * - shapes: where it is in the scene (800 × 500), and at: where its marker goes (inside a shape).
 */

export type Text = { en: string; nl: string };
type Shape = { rect: number[] } | { ellipse: number[] } | { poly: number[] };

export type SceneSpot = {
  id: string;
  hazard: boolean;
  label: Text;
  /** a hazard: what is unsafe */
  name?: Text;
  /** a hazard: why it is unsafe and what should be done */
  why?: Text;
  /** why it is safe: a decoy, or a hazard drawn safe */
  safe: Text;
  shapes: Shape[];
  at: [number, number];
};

export type Scene = { id: SceneId; name: Text; spots: SceneSpot[] };

export const SCENE_IDS = ["scaffold", "warehouse", "kitchen", "workshop"] as const;
export type SceneId = (typeof SCENE_IDS)[number];

export const sceneId = (value: unknown): SceneId => (SCENE_IDS.includes(value as SceneId) ? (value as SceneId) : "scaffold");

const scaffold: Scene = {
  id: "scaffold",
  name: { en: "Building site with a mobile scaffold", nl: "Bouwplaats met een rolsteiger" },
  spots: [
    {
      id: "railing",
      hazard: true,
      label: { en: "the top of the scaffold", nl: "de bovenkant van de steiger" },
      name: { en: "No guard rail and no toe board", nl: "Geen leuning en geen kantplank" },
      why: {
        en: "Someone can fall off the platform, and things can fall on people below. Put a guard rail, a knee rail and a toe board around the platform.",
        nl: "Iemand kan van de steiger vallen, en spullen kunnen op mensen eronder vallen. Zet een leuning, een knieleuning en een kantplank rond de werkvloer.",
      },
      safe: { en: "The platform has a guard rail, a knee rail and a toe board.", nl: "De werkvloer heeft een leuning, een knieleuning en een kantplank." },
      shapes: [{ rect: [145, 40, 250, 138] }],
      at: [200, 120],
    },
    {
      id: "materials",
      hazard: true,
      label: { en: "the bricks on the scaffold", nl: "de stenen op de steiger" },
      name: { en: "Materials on the edge", nl: "Materiaal op de rand" },
      why: {
        en: "The bricks can fall on someone's head. Put materials in the middle of the platform, behind the toe board, and not too many.",
        nl: "De stenen kunnen op iemands hoofd vallen. Zet materiaal midden op de werkvloer, achter de kantplank, en niet te veel.",
      },
      safe: { en: "The bricks are stacked low, away from the edge.", nl: "De stenen liggen laag gestapeld, weg van de rand." },
      shapes: [{ rect: [300, 104, 122, 74] }],
      at: [362, 128],
    },
    {
      id: "wheels",
      hazard: true,
      label: { en: "the wheels of the scaffold", nl: "de wielen van de steiger" },
      name: { en: "Wheels not on the brake", nl: "Wielen niet op de rem" },
      why: {
        en: "The scaffold can roll away while someone is on it. Put every wheel on the brake before you climb up.",
        nl: "De steiger kan wegrollen terwijl er iemand op staat. Zet elk wiel op de rem voordat je naar boven gaat.",
      },
      safe: { en: "The brakes of the wheels are on.", nl: "De wielen staan op de rem." },
      shapes: [{ rect: [136, 380, 60, 40] }, { rect: [356, 380, 60, 40] }],
      at: [166, 402],
    },
    {
      id: "ladder",
      hazard: true,
      label: { en: "the ladder", nl: "de ladder" },
      name: { en: "Ladder not secured", nl: "Ladder staat niet vast" },
      why: {
        en: "The ladder stands on a bucket and is not tied. It can slip or fall over. Put it on firm, flat ground and tie the top.",
        nl: "De ladder staat op een emmer en is niet vastgemaakt. Hij kan wegglijden of omvallen. Zet hem op stevige, vlakke grond en maak de bovenkant vast.",
      },
      safe: { en: "The ladder stands on the ground and is tied at the top.", nl: "De ladder staat op de grond en is boven vastgemaakt." },
      shapes: [{ poly: [458, 440, 522, 446, 578, 150, 532, 136] }],
      at: [512, 290],
    },
    {
      id: "helmet",
      hazard: true,
      label: { en: "the person by the wall", nl: "de persoon bij de muur" },
      name: { en: "No helmet", nl: "Geen helm" },
      why: {
        en: "On a building site something can fall from above. Always wear a safety helmet.",
        nl: "Op de bouw kan er iets van boven vallen. Draag altijd een veiligheidshelm.",
      },
      safe: { en: "This worker wears a helmet.", nl: "Deze werknemer draagt een helm." },
      shapes: [{ rect: [646, 334, 70, 146] }],
      at: [681, 410],
    },
    {
      id: "hole",
      hazard: true,
      label: { en: "the hole in the ground", nl: "het gat in de grond" },
      name: { en: "Open hole without a fence", nl: "Open gat zonder hek" },
      why: {
        en: "Someone can fall into the hole. Put a fence around it, or cover it.",
        nl: "Iemand kan in het gat vallen. Zet er een hek omheen of dek het af.",
      },
      safe: { en: "There is a fence around the hole.", nl: "Er staat een hek om het gat." },
      shapes: [{ ellipse: [330, 456, 92, 36] }],
      at: [330, 458],
    },
    {
      id: "sign",
      hazard: false,
      label: { en: "the sign", nl: "het bord" },
      safe: { en: "The sign tells everyone to wear a helmet.", nl: "Het bord zegt dat iedereen een helm moet dragen." },
      shapes: [{ rect: [4, 190, 112, 110] }],
      at: [60, 230],
    },
    {
      id: "wheelbarrow",
      hazard: false,
      label: { en: "the person with the wheelbarrow", nl: "de persoon met de kruiwagen" },
      safe: { en: "This worker wears a helmet, a safety vest and safety shoes.", nl: "Deze werknemer draagt een helm, een veiligheidshesje en werkschoenen." },
      shapes: [{ rect: [30, 330, 160, 160] }],
      at: [62, 400],
    },
    {
      id: "pallet",
      hazard: false,
      label: { en: "the stack of bricks on the ground", nl: "de stapel stenen op de grond" },
      safe: { en: "The bricks are stacked low and straight on a pallet.", nl: "De stenen liggen laag en recht op een pallet." },
      shapes: [{ rect: [722, 400, 74, 82] }],
      at: [758, 436],
    },
  ],
};

const warehouse: Scene = {
  id: "warehouse",
  name: { en: "Warehouse with a forklift", nl: "Magazijn met een heftruck" },
  spots: [
    {
      id: "overloaded",
      hazard: true,
      label: { en: "the boxes on the top shelf, right", nl: "de dozen op de bovenste plank, rechts" },
      name: { en: "Overloaded pallet", nl: "Te zwaar beladen pallet" },
      why: {
        en: "Too many boxes, stacked too high and crooked. They can fall down. Do not stack higher than allowed, and keep the stack straight.",
        nl: "Te veel dozen, te hoog en scheef gestapeld. Ze kunnen naar beneden vallen. Stapel niet hoger dan mag, en houd de stapel recht.",
      },
      safe: { en: "The boxes are stacked low and straight.", nl: "De dozen staan laag en recht gestapeld." },
      shapes: [{ rect: [176, 0, 144, 152] }],
      at: [246, 110],
    },
    {
      id: "underForks",
      hazard: true,
      label: { en: "the forks of the forklift", nl: "de vork van de heftruck" },
      name: { en: "Person under the raised forks", nl: "Persoon onder de opgeheven vork" },
      why: {
        en: "The load can fall on this person. Never stand or walk under a raised load, and keep away from a forklift at work.",
        nl: "De lading kan op deze persoon vallen. Ga nooit onder een hangende last staan of lopen, en blijf uit de buurt van een heftruck die werkt.",
      },
      safe: { en: "The forks are down, and nobody stands under them.", nl: "De vork staat laag en niemand staat eronder." },
      shapes: [{ rect: [358, 130, 102, 272] }],
      at: [410, 300],
    },
    {
      id: "exit",
      hazard: true,
      label: { en: "the door with the green sign", nl: "de deur met het groene bord" },
      name: { en: "Emergency exit blocked", nl: "Nooduitgang geblokkeerd" },
      why: {
        en: "In a fire, people cannot get out fast. Never put anything in front of an emergency exit.",
        nl: "Bij brand kunnen mensen er niet snel uit. Zet nooit iets voor een nooduitgang.",
      },
      safe: { en: "The emergency exit is free.", nl: "De nooduitgang is vrij." },
      shapes: [{ rect: [672, 182, 120, 214] }],
      at: [730, 280],
    },
    {
      id: "spill",
      hazard: true,
      label: { en: "the can on the floor", nl: "het blik op de vloer" },
      name: { en: "Spilled liquid", nl: "Gemorste vloeistof" },
      why: {
        en: "Someone can slip on it, and a forklift can skid. Clean it up straight away, and put a sign by it until it is dry.",
        nl: "Iemand kan erover uitglijden en een heftruck kan slippen. Ruim het meteen op en zet er een bord bij tot het droog is.",
      },
      safe: { en: "The can stands upright in a drip tray. Nothing is spilled.", nl: "Het blik staat rechtop in een lekbak. Er is niets gemorst." },
      shapes: [{ ellipse: [585, 450, 80, 34] }],
      at: [585, 450],
    },
    {
      id: "damagedPallet",
      hazard: true,
      label: { en: "the pallet on the floor, left", nl: "de pallet op de vloer, links" },
      name: { en: "Damaged pallet", nl: "Kapotte pallet" },
      why: {
        en: "A broken pallet can give way, and then the load falls. Do not use damaged pallets: put them aside.",
        nl: "Een kapotte pallet kan inzakken en dan valt de lading. Gebruik geen kapotte pallets: zet ze apart.",
      },
      safe: { en: "The pallet is whole.", nl: "De pallet is heel." },
      shapes: [{ rect: [34, 398, 146, 86] }],
      at: [108, 440],
    },
    {
      id: "topLeft",
      hazard: false,
      label: { en: "the boxes on the top shelf, left", nl: "de dozen op de bovenste plank, links" },
      safe: { en: "Not too many boxes, and they stand straight.", nl: "Niet te veel dozen, en ze staan recht." },
      shapes: [{ rect: [36, 56, 136, 96] }],
      at: [104, 110],
    },
    {
      id: "forklift",
      hazard: false,
      label: { en: "the forklift", nl: "de heftruck" },
      safe: { en: "The driver sits in the seat and wears a seat belt.", nl: "De bestuurder zit op de stoel en draagt een gordel." },
      shapes: [{ rect: [464, 192, 148, 218] }],
      at: [560, 330],
    },
    {
      id: "extinguisher",
      hazard: false,
      label: { en: "the fire extinguisher", nl: "de brandblusser" },
      safe: { en: "It hangs on the wall where everyone can reach it.", nl: "Hij hangt aan de muur, waar iedereen erbij kan." },
      shapes: [{ rect: [618, 250, 50, 96] }],
      at: [642, 300],
    },
    {
      id: "palletTruck",
      hazard: false,
      label: { en: "the pallet truck", nl: "de palletwagen" },
      safe: { en: "It is parked at the side, out of the way.", nl: "Hij staat aan de kant, niet in de weg." },
      shapes: [{ rect: [198, 388, 156, 100] }],
      at: [270, 450],
    },
  ],
};

const kitchen: Scene = {
  id: "kitchen",
  name: { en: "Kitchen", nl: "Keuken" },
  spots: [
    {
      id: "cable",
      hazard: true,
      label: { en: "the sink and the mixer", nl: "de gootsteen en de mixer" },
      name: { en: "Cable over the sink", nl: "Snoer over de gootsteen" },
      why: {
        en: "Water and electricity together are dangerous: you can get an electric shock. Keep cables and appliances away from water.",
        nl: "Water en stroom samen zijn gevaarlijk: je kunt een schok krijgen. Houd snoeren en apparaten uit de buurt van water.",
      },
      safe: { en: "The cable of the mixer is short and far from the water.", nl: "Het snoer van de mixer is kort en ver van het water." },
      shapes: [{ rect: [20, 168, 222, 92] }],
      at: [110, 222],
    },
    {
      id: "knife",
      hazard: true,
      label: { en: "the cutting board", nl: "de snijplank" },
      name: { en: "Knife on the edge", nl: "Mes op de rand" },
      why: {
        en: "The knife can fall and cut someone, or someone bumps into it. Put a knife in the middle of the board or in the knife block.",
        nl: "Het mes kan vallen en iemand snijden, of iemand stoot ertegen. Leg een mes midden op de plank of in het messenblok.",
      },
      safe: { en: "The knife lies flat in the middle of the board.", nl: "Het mes ligt plat midden op de plank." },
      shapes: [{ rect: [244, 200, 134, 76] }],
      at: [300, 226],
    },
    {
      id: "panHandle",
      hazard: true,
      label: { en: "the pan at the front of the stove", nl: "de pan voor op het fornuis" },
      name: { en: "Pan handle sticking out", nl: "Steel van de pan steekt uit" },
      why: {
        en: "Someone can bump into the handle and pull the hot pan down. Turn handles inward.",
        nl: "Iemand kan tegen de steel stoten en de hete pan eraf trekken. Draai stelen naar binnen.",
      },
      safe: { en: "The handle is turned inward.", nl: "De steel is naar binnen gedraaid." },
      shapes: [{ rect: [382, 190, 116, 86] }],
      at: [462, 218],
    },
    {
      id: "oven",
      hazard: true,
      label: { en: "the oven", nl: "de oven" },
      name: { en: "Oven door open", nl: "Ovendeur open" },
      why: {
        en: "Someone can trip over the open door or get burnt on it. Close the oven door straight away.",
        nl: "Iemand kan over de open deur struikelen of zich eraan branden. Doe de ovendeur meteen dicht.",
      },
      safe: { en: "The oven door is closed.", nl: "De ovendeur is dicht." },
      shapes: [{ rect: [404, 278, 192, 122] }],
      at: [500, 330],
    },
    {
      id: "wetFloor",
      hazard: true,
      label: { en: "the floor by the sink", nl: "de vloer bij de gootsteen" },
      name: { en: "Wet floor without a sign", nl: "Natte vloer zonder bord" },
      why: {
        en: "Someone can slip and fall. Mop it up, and put a warning sign by it until the floor is dry.",
        nl: "Iemand kan uitglijden en vallen. Dweil het op en zet er een waarschuwingsbord bij tot de vloer droog is.",
      },
      safe: { en: "There is a warning sign by the wet floor.", nl: "Er staat een waarschuwingsbord bij de natte vloer." },
      shapes: [{ rect: [120, 362, 236, 100] }],
      at: [200, 430],
    },
    {
      id: "cleaner",
      hazard: true,
      label: { en: "the bread and the bottle", nl: "het brood en de fles" },
      name: { en: "Cleaning agent next to food", nl: "Schoonmaakmiddel naast eten" },
      why: {
        en: "Cleaning agent can get into the food, or someone takes the wrong bottle. Keep cleaning agents away from food, in a cupboard of their own.",
        nl: "Schoonmaakmiddel kan in het eten komen, of iemand pakt de verkeerde fles. Bewaar schoonmaakmiddel apart van eten, in een eigen kast.",
      },
      safe: { en: "The bottle next to the bread is oil, for cooking.", nl: "De fles naast het brood is olie, om mee te koken." },
      shapes: [{ rect: [604, 150, 124, 98] }],
      at: [650, 222],
    },
    {
      id: "fireBlanket",
      hazard: false,
      label: { en: "the red box on the wall", nl: "de rode doos aan de muur" },
      safe: { en: "A fire blanket, on the wall where everyone can reach it.", nl: "Een blusdeken, aan de muur waar iedereen erbij kan." },
      shapes: [{ rect: [336, 30, 72, 92] }],
      at: [372, 76],
    },
    {
      id: "pot",
      hazard: false,
      label: { en: "the pot at the back of the stove", nl: "de pan achter op het fornuis" },
      safe: { en: "The handles do not stick out: nobody can bump into them.", nl: "De handvatten steken niet uit: niemand kan ertegen stoten." },
      shapes: [{ rect: [500, 168, 86, 80] }],
      at: [543, 208],
    },
    {
      id: "knifeBlock",
      hazard: false,
      label: { en: "the knife block", nl: "het messenblok" },
      safe: { en: "The knives are put away in the knife block.", nl: "De messen zitten veilig in het messenblok." },
      shapes: [{ rect: [730, 160, 60, 88] }],
      at: [758, 214],
    },
  ],
};

const workshop: Scene = {
  id: "workshop",
  name: { en: "Workshop", nl: "Werkplaats" },
  spots: [
    {
      id: "grinderGuard",
      hazard: true,
      label: { en: "the grinder", nl: "de slijpmachine" },
      name: { en: "Grinder without a guard", nl: "Slijpmachine zonder beschermkap" },
      why: {
        en: "Sparks and bits of the wheel can fly off. A grinder needs a guard over each wheel and a screen.",
        nl: "Vonken en stukjes van de schijf kunnen wegvliegen. Een slijpmachine moet een beschermkap over elke schijf en een scherm hebben.",
      },
      safe: { en: "The wheels have a guard and a screen.", nl: "De schijven hebben een beschermkap en een scherm." },
      shapes: [{ rect: [192, 230, 146, 84] }],
      at: [264, 268],
    },
    {
      id: "goggles",
      hazard: true,
      label: { en: "the person at the grinder", nl: "de persoon bij de slijpmachine" },
      name: { en: "No safety goggles", nl: "Geen veiligheidsbril" },
      why: {
        en: "Sparks and splinters can hit the eyes. Always wear safety goggles when you grind.",
        nl: "Vonken en splinters kunnen in je ogen komen. Draag altijd een veiligheidsbril als je slijpt.",
      },
      safe: { en: "This worker wears safety goggles.", nl: "Deze werknemer draagt een veiligheidsbril." },
      shapes: [{ rect: [104, 200, 86, 202] }],
      at: [146, 320],
    },
    {
      id: "clothing",
      hazard: true,
      label: { en: "the person at the drill", nl: "de persoon bij de boormachine" },
      name: { en: "Loose clothing near a machine", nl: "Losse kleding bij een machine" },
      why: {
        en: "The scarf can get caught in the turning drill and pull the person in. Take off scarves, and wear tight work clothes.",
        nl: "De sjaal kan in de draaiende boor komen en de persoon meetrekken. Doe sjaals af en draag nauwsluitende werkkleding.",
      },
      safe: { en: "This worker wears tight work clothes.", nl: "Deze werknemer draagt nauwsluitende werkkleding." },
      shapes: [{ rect: [530, 200, 86, 202] }],
      at: [576, 330],
    },
    {
      id: "cables",
      hazard: true,
      label: { en: "the floor in the walkway", nl: "de vloer in het looppad" },
      name: { en: "Cables across the walkway", nl: "Snoeren over het looppad" },
      why: {
        en: "Someone can trip over the cables. Run cables along the wall, or cover them with a cable protector.",
        nl: "Iemand kan over de snoeren struikelen. Leg snoeren langs de muur, of dek ze af met een kabelbrug.",
      },
      safe: { en: "The cable lies under a cable protector.", nl: "Het snoer ligt onder een kabelbrug." },
      shapes: [{ rect: [236, 404, 300, 94] }],
      at: [380, 450],
    },
    {
      id: "gasBottle",
      hazard: true,
      label: { en: "the gas bottle on the left", nl: "de gasfles links" },
      name: { en: "Gas bottle not secured", nl: "Gasfles staat niet vast" },
      why: {
        en: "The bottle can fall over, and the valve can break off. Always chain gas bottles to the wall, or put them in a trolley.",
        nl: "De fles kan omvallen en de kraan kan afbreken. Zet gasflessen altijd vast met een ketting aan de muur, of in een karretje.",
      },
      safe: { en: "The bottle is chained to the wall.", nl: "De fles staat met een ketting vast aan de muur." },
      shapes: [{ rect: [644, 196, 70, 200] }],
      at: [680, 320],
    },
    {
      id: "toolBoard",
      hazard: false,
      label: { en: "the tool board", nl: "het gereedschapsbord" },
      safe: { en: "Every tool hangs in its place: nothing lies around.", nl: "Elk gereedschap hangt op zijn plek: er slingert niets rond." },
      shapes: [{ rect: [20, 44, 192, 134] }],
      at: [116, 110],
    },
    {
      id: "firstAid",
      hazard: false,
      label: { en: "the green box on the wall", nl: "de groene doos aan de muur" },
      safe: { en: "A first aid kit, where everyone can find it.", nl: "Een verbanddoos, waar iedereen hem kan vinden." },
      shapes: [{ rect: [566, 76, 88, 78] }],
      at: [610, 112],
    },
    {
      id: "drill",
      hazard: false,
      label: { en: "the drill", nl: "de boormachine" },
      safe: { en: "The drill has a guard around the chuck.", nl: "De boormachine heeft een kap om de boorkop." },
      shapes: [{ rect: [412, 156, 116, 244] }],
      at: [470, 210],
    },
    {
      id: "bottle2",
      hazard: false,
      label: { en: "the gas bottle on the right", nl: "de gasfles rechts" },
      safe: { en: "This bottle is chained to the wall.", nl: "Deze fles staat met een ketting vast aan de muur." },
      shapes: [{ rect: [716, 196, 72, 200] }],
      at: [752, 320],
    },
  ],
};

export const SCENES: Record<SceneId, Scene> = { scaffold, warehouse, kitchen, workshop };

/** The ids of the hazards of a scene, in its order. */
export const hazardIds = (scene: Scene) => scene.spots.filter((spot) => spot.hazard).map((spot) => spot.id);
