// Solara Bay — every tuning number, colour and city constant in one place.
// The world is a fixed 3200x2400 top-down city; the camera shows a 1280x720 window of it
// and the renderer scales that window to the browser, so no rule depends on screen size.

export const WORLD = { width: 3200, height: 2400 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** What the camera shows of the world, in world units. */
export const VIEW = { width: 1280, height: 720 };

/** Road centrelines: a grid of avenues (vertical) and streets (horizontal). */
export const ROADS = {
  width: 96,
  lane: 24,
  avenues: [400, 900, 1400, 1900, 2400, 2900],
  streets: [350, 750, 1150, 1550, 1950],
  /** The beach strip along the south edge, and the water past it. */
  beachY: 2220,
  waterY: 2330,
};

/** Districts, for the minimap labels and the mission text. */
export const DISTRICTS = [
  { name: 'Northside', x: 200, y: 120 },
  { name: 'Old Town', x: 1050, y: 480 },
  { name: 'Palm Row', x: 2050, y: 480 },
  { name: 'Marina', x: 250, y: 1700 },
  { name: 'The Docks', x: 2700, y: 1750 },
];

export const PLAYER = {
  radius: 14,
  walkSpeed: 230,
  runSpeed: 340,
  health: 100,
  punchRange: 46,
  punchDamage: 34,
  punchCooldown: 0.38,
  pistolDamage: 40,
  pistolRange: 420,
  pistolCooldown: 0.28,
  pistolAmmo: 24,
};

export const CAR = {
  length: 64,
  width: 30,
  accel: 520,
  brake: 760,
  reverseAccel: 300,
  maxSpeed: 620,
  maxReverse: 180,
  turnRate: 2.6,
  grip: 3.2,
  health: 100,
  /** How close the player must be, on foot, to get in. */
  enterRange: 56,
};

export const TRAFFIC = {
  count: 34,
  speed: 170,
  speedJitter: 60,
  /** A car that has not moved for this long picks a new heading. */
  stuckSeconds: 4,
};

export const PEDS = { count: 56, walkSpeed: 55, runSpeed: 190, fleeRange: 170 };

export const POLICE = {
  /** Cops on the street per wanted star. */
  carsPerStar: 1,
  carSpeed: 560,
  ramDamage: 9,
  /** Seconds a cop must touch the player on foot before the bust lands. */
  bustSeconds: 1.4,
  /** Wanted falls one star after this long with no cop near the player. */
  decaySeconds: 9,
  /** Wanted falls one star after this long with no cop near the player. */
  maxStars: 5,
};

/** Cash: what each crime and each mission pays. */
export const MONEY = {
  start: 120,
  missionReward: [400, 650, 900, 1200, 2500],
  shopTake: 220,
  pedPunchFine: 0,
};

export const MISSIONS = [
  {
    id: 'first-run',
    title: 'First Run',
    giver: 'Maya',
    brief: 'Maya needs a parcel taken from the Marina lockers to the Old Town cafe. No cops, no fuss. Drive there and press E.',
    steps: [
      { kind: 'goto', label: 'Pick up the parcel at the Marina lockers', x: 300, y: 1750 },
      { kind: 'goto', label: 'Deliver it to the Old Town cafe', x: 1150, y: 560 },
    ],
  },
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    giver: 'Salvo',
    brief: 'Salvo wants a sunrise-yellow coupe. There is one parked on Palm Row. Take it and bring it to the garage on Northside.',
    steps: [
      { kind: 'steal', label: 'Steal the yellow coupe on Palm Row', x: 2250, y: 620 },
      { kind: 'deliverCar', label: 'Deliver the coupe to the Northside garage', x: 620, y: 240 },
    ],
  },
  {
    id: 'shakedown',
    title: 'Shakedown',
    giver: 'Salvo',
    brief: 'Three shops on the avenues owe Salvo protection money. Visit each one, press E, and do not take no for an answer.',
    steps: [
      { kind: 'collect', label: 'Collect from the corner store, Old Town', x: 950, y: 800 },
      { kind: 'collect', label: 'Collect from the diner, Palm Row', x: 1950, y: 1200 },
      { kind: 'collect', label: 'Collect from the pawn shop, Marina', x: 450, y: 1600 },
    ],
  },
  {
    id: 'getaway',
    title: 'Getaway',
    giver: 'Maya',
    brief: 'The heat is on: three stars and every cop in Solara Bay wants you. Lose them — stay out of sight until the stars cool off, or reach the hideout on the beach.',
    steps: [
      { kind: 'escape', label: 'Lose the cops: reach the beach hideout or cool off', x: 1500, y: 2260 },
    ],
  },
  {
    id: 'harbor-job',
    title: 'The Harbor Job',
    giver: 'Salvo',
    brief: 'The big one. A stash of cash sits in the Docks warehouse, guarded. Pick up a pistol at the gun store first — three guards, and bare fists will not cut it. Take them down, grab the stash, and get out clean.',
    steps: [
      { kind: 'goto', label: 'Reach the Docks warehouse', x: 2820, y: 1830 },
      { kind: 'fight', label: 'Take down the warehouse guards (3)', x: 2820, y: 1830 },
      { kind: 'grab', label: 'Grab the stash', x: 2820, y: 1830 },
      { kind: 'escape', label: 'Escape to the Marina hideout', x: 300, y: 2050 },
    ],
  },
];

export const PALETTE = {
  backdrop: '#0e1a24',
  grass: '#7fae62',
  grassDark: '#74a258',
  sand: '#e8d39a',
  water: '#2f7fb8',
  waterDeep: '#256b9e',
  road: '#3c3f46',
  roadEdge: '#565a63',
  lane: '#d8c95a',
  sidewalk: '#9aa0a8',
  park: '#5d9150',
  buildingRoof: ['#c96f4a', '#d9a05b', '#e8dcc3', '#7fa8a0', '#b0563f', '#8fa3b8'],
  buildingEdge: '#4a3b33',
  player: '#e84c3d',
  playerShirt: '#f2f2f2',
  cop: '#2b4a8f',
  copLightRed: '#ff3b30',
  copLightBlue: '#3b82ff',
  ped: ['#e8b04b', '#7fb069', '#c77dff', '#4cc9f0', '#f4845f'],
  carColors: ['#d94f3d', '#e8b04b', '#4f7fd9', '#3fa66a', '#c9c9c9', '#8a5fd0', '#e86a9b', '#2f2f38'],
  coupeYellow: '#f2c230',
  marker: '#ffd23f',
  markerRing: '#ffffff',
  hudPanel: 'rgba(12, 18, 26, 0.72)',
  hudText: '#f4f1e8',
  hudMuted: '#b9c0c9',
  hudGood: '#7be495',
  hudBad: '#ff6b5e',
  hudGold: '#ffd23f',
  panel: '#141c26',
  panelEdge: '#2c3a4a',
  title: '#ffd23f',
  minimapWater: '#2f7fb8',
  minimapRoad: '#c9cdd4',
  minimapPark: '#5d9150',
  minimapBlip: '#ffd23f',
  minimapPlayer: '#ffffff',
  minimapCop: '#3b82ff',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save lives between visits (this browser only). */
export const SAVE_KEY = 'solara-bay.save.v1';
export const BEST_KEY = 'solara-bay.best.v1';
