// The city of Solara Bay, generated once from a seed: its blocks, buildings, parks, the
// beach and the water, the parked cars along the avenues, and the named places the story
// uses (lockers, cafe, garage, warehouse, hideouts, gun store, hospital). No drawing here —
// this is the map the world and the renderer both read.

import { DISTRICTS, PALETTE, ROADS, WORLD } from './config.js';

const ROAD_HALF = ROADS.width / 2;
const MARGIN = 14;

/** The strips of land between two roads, plus the edges of the map. */
function blockSpans(centres, limit) {
  const spans = [];
  let start = 0;
  for (const centre of centres) {
    spans.push([start, centre - ROAD_HALF - MARGIN]);
    start = centre + ROAD_HALF + MARGIN;
  }
  spans.push([start, limit]);
  return spans.filter(([a, b]) => b - a > 60);
}

function rectHits(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function buildCity(random) {
  const buildings = [];
  const parks = [];
  const xSpans = blockSpans(ROADS.avenues, WORLD.width);
  const ySpans = blockSpans(ROADS.streets, ROADS.beachY);

  for (const [bx0, bx1] of xSpans) {
    for (const [by0, by1] of ySpans) {
      const block = { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 };
      // One block in seven is a park, with trees instead of towers.
      if (random.chance(0.14) && block.w > 140 && block.h > 120) {
        parks.push(block);
        continue;
      }
      // Split a big block into two or four buildings; a small one holds a single shop.
      const cols = block.w > 260 && random.chance(0.6) ? 2 : 1;
      const rows = block.h > 200 && random.chance(0.6) ? 2 : 1;
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          const cell = {
            x: block.x + (block.w / cols) * cx,
            y: block.y + (block.h / rows) * cy,
            w: block.w / cols,
            h: block.h / rows,
          };
          const inset = random.range(8, 22);
          const building = {
            x: cell.x + inset,
            y: cell.y + inset,
            w: Math.max(40, cell.w - inset * 2),
            h: Math.max(40, cell.h - inset * 2),
            color: random.pick(PALETTE.buildingRoof),
            height: random.int(1, 3),
          };
          buildings.push(building);
        }
      }
    }
  }

  // Parked cars along the avenues and streets, nose to the kerb.
  const parked = [];
  const carSpots = 26;
  for (let i = 0; i < carSpots; i += 1) {
    const vertical = random.chance(0.5);
    if (vertical) {
      const road = random.pick(ROADS.avenues);
      const side = random.chance(0.5) ? -1 : 1;
      parked.push({
        x: road + side * (ROAD_HALF - 12),
        y: random.range(120, ROADS.beachY - 120),
        angle: side > 0 ? Math.PI / 2 : -Math.PI / 2,
        color: random.pick(PALETTE.carColors),
        model: random.pick(['sedan', 'hatch', 'van']),
      });
    } else {
      const road = random.pick(ROADS.streets);
      const side = random.chance(0.5) ? -1 : 1;
      parked.push({
        x: random.range(120, WORLD.width - 120),
        y: road + side * (ROAD_HALF - 12),
        angle: side > 0 ? 0 : Math.PI,
        color: random.pick(PALETTE.carColors),
        model: random.pick(['sedan', 'hatch', 'van']),
      });
    }
  }
  // The sunrise-yellow coupe Salvo wants, parked on Palm Row.
  parked.push({ x: 2352, y: 620, angle: Math.PI / 2, color: '#f2c230', model: 'coupe', special: 'coupe' });

  const landmarks = {
    lockers: { x: 300, y: 1750, label: 'Marina lockers' },
    cafe: { x: 1150, y: 560, label: 'Old Town cafe' },
    garage: { x: 620, y: 240, label: 'Northside garage' },
    warehouse: { x: 2820, y: 1830, label: 'Docks warehouse' },
    beachHideout: { x: 1500, y: 2260, label: 'Beach hideout' },
    marinaHideout: { x: 300, y: 2050, label: 'Marina hideout' },
    gunStore: { x: 1450, y: 800, label: 'Gun store' },
    hospital: { x: 950, y: 1600, label: 'Hospital' },
    cornerStore: { x: 950, y: 800, label: 'Corner store' },
    diner: { x: 1950, y: 1200, label: 'Diner' },
    pawnShop: { x: 450, y: 1600, label: 'Pawn shop' },
  };

  /** True when the point is on a road (drivable). */
  function onRoad(x, y) {
    if (y >= ROADS.beachY) return false;
    for (const avenue of ROADS.avenues) if (Math.abs(x - avenue) <= ROAD_HALF) return true;
    for (const street of ROADS.streets) if (Math.abs(y - street) <= ROAD_HALF) return true;
    return false;
  }

  /** True when the point is in the water (not walkable, not drivable). */
  function inWater(x, y) {
    return y >= ROADS.waterY;
  }

  /** True when a circle of radius r at (x, y) touches a building or the map edge. */
  function hitsSolid(x, y, r) {
    if (x - r < 0 || x + r > WORLD.width || y - r < 0 || y + r > WORLD.height) return true;
    if (inWater(x, y)) return true;
    for (const b of buildings) {
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
    }
    return false;
  }

  /** A point on a road at random, for spawning traffic. */
  function randomRoadPoint() {
    if (random.chance(0.5)) {
      const road = random.pick(ROADS.avenues);
      return { x: road + random.range(-ROAD_HALF + 18, ROAD_HALF - 18), y: random.range(80, ROADS.beachY - 80), vertical: true };
    }
    const road = random.pick(ROADS.streets);
    return { x: random.range(80, WORLD.width - 80), y: road + random.range(-ROAD_HALF + 18, ROAD_HALF - 18), vertical: false };
  }

  /** The nearest point on a road to (x, y), for pedestrians finding the pavement. */
  function nearestRoadPoint(x, y) {
    let best = { x: ROADS.avenues[0], y, dist: Infinity };
    for (const avenue of ROADS.avenues) {
      const d = Math.abs(x - avenue);
      if (d < best.dist) best = { x: avenue, y: Math.min(Math.max(y, 60), ROADS.beachY - 60), dist: d };
    }
    for (const street of ROADS.streets) {
      const d = Math.abs(y - street);
      if (d < best.dist) best = { x: Math.min(Math.max(x, 60), WORLD.width - 60), y: street, dist: d };
    }
    return best;
  }

  return {
    buildings,
    parks,
    parked,
    landmarks,
    districts: DISTRICTS,
    onRoad,
    inWater,
    hitsSolid,
    rectHits,
    randomRoadPoint,
    nearestRoadPoint,
  };
}
