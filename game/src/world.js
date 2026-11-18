// The simulation: the player on foot or in a car, traffic that follows the roads,
// pedestrians on the pavements, police who chase the wanted level, combat, pickups and
// the mission checks. No drawing and no browser in it: step() advances one fixed step
// and returns what happened as bit flags, so the caller can react without the world
// knowing about screens or sound.

import { buildCity } from './city.js';
import { CAR, MONEY, PEDS, PLAYER, POLICE, ROADS, STEP, TRAFFIC, WORLD } from './config.js';
import { createMissions } from './missions.js';

export const EVENT_HIT = 1;
export const EVENT_CASH = 2;
export const EVENT_STEP = 4;
export const EVENT_MISSION = 8;
export const EVENT_ALL = 16;
export const EVENT_WASTED = 32;
export const EVENT_BUSTED = 64;
export const EVENT_WANTED = 128;
export const EVENT_SHOT = 256;
export const EVENT_PUNCH = 512;
export const EVENT_CRASH = 1024;
export const EVENT_PICKUP = 2048;

const DIRS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function angleTo(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createWorld(random) {
  const city = buildCity(random);
  const missions = createMissions();

  const player = {
    x: 700, y: 500, angle: 0, health: PLAYER.health,
    punchCooldown: 0, pistolCooldown: 0, ammo: 0, armed: false,
    bustTimer: 0, hurtFlash: 0,
  };
  const cars = [];
  const peds = [];
  const pickups = [];
  const effects = [];
  const state = {
    cash: MONEY.start, wanted: 0, wantedTimer: 0, elapsed: 0,
    guardsDown: 0, kills: 0, carsStolen: 0, missionsDone: 0,
  };
  let playerCar = null;
  let over = false;
  let overKind = '';

  function addEffect(x, y, kind) {
    effects.push({ x, y, kind, ttl: kind === 'muzzle' ? 0.08 : 0.5 });
  }

  function spawnTrafficCar(far) {
    let spot = city.randomRoadPoint();
    if (far) {
      let tries = 0;
      while (tries < 12 && dist2(spot, player) < 500 * 500) {
        spot = city.randomRoadPoint();
        tries += 1;
      }
    }
    const vertical = spot.vertical;
    const dir = vertical ? (random.chance(0.5) ? 1 : 3) : (random.chance(0.5) ? 0 : 2);
    cars.push({
      kind: 'traffic', model: random.pick(['sedan', 'hatch', 'van']),
      x: spot.x, y: spot.y, angle: Math.atan2(DIRS[dir].y, DIRS[dir].x),
      dir, speed: TRAFFIC.speed + random.range(-TRAFFIC.speedJitter, TRAFFIC.speedJitter),
      color: random.pick(['#d94f3d', '#e8b04b', '#4f7fd9', '#3fa66a', '#c9c9c9', '#8a5fd0']),
      health: 100, driver: true, turnCooldown: 0, stuck: 0, ramCooldown: 0, dead: false,
    });
  }

  function spawnPed(far) {
    const spot = city.randomRoadPoint();
    const road = city.nearestRoadPoint(spot.x + random.range(-300, 300), spot.y + random.range(-300, 300));
    const ped = {
      kind: 'walker', x: road.x + random.range(-70, 70), y: road.y + random.range(-70, 70),
      angle: random.range(0, Math.PI * 2), speed: PEDS.walkSpeed,
      color: random.pick(['#e8b04b', '#7fb069', '#c77dff', '#4cc9f0', '#f4845f']),
      health: 50, tx: road.x, ty: road.y, flee: 0, down: 0, punchCooldown: 0,
    };
    if (far && dist2(ped, player) < 400 * 400) return;
    peds.push(ped);
  }

  function spawnPoliceCar() {
    let spot = city.randomRoadPoint();
    let tries = 0;
    while (tries < 10 && dist2(spot, player) < 550 * 550) {
      spot = city.randomRoadPoint();
      tries += 1;
    }
    cars.push({
      kind: 'police', model: 'sedan', x: spot.x, y: spot.y, angle: 0,
      dir: 0, speed: 0, color: '#2b4a8f', health: 100, driver: true,
      turnCooldown: 0, stuck: 0, ramCooldown: 0, dead: false, siren: random.range(0, 1),
    });
  }

  function spawnFootCop() {
    const a = random.range(0, Math.PI * 2);
    const x = player.x + Math.cos(a) * random.range(280, 420);
    const y = player.y + Math.sin(a) * random.range(280, 420);
    if (city.hitsSolid(x, y, 12)) return;
    peds.push({
      kind: 'cop', x, y, angle: angleTo({ x, y }, player), speed: 200,
      color: '#2b4a8f', health: 100, tx: x, ty: y, flee: 0, down: 0, punchCooldown: 0,
    });
  }

  function spawnGuards(x, y, n) {
    state.guardsDown = 0;
    for (let i = 0; i < n; i += 1) {
      peds.push({
        kind: 'guard', x: x + random.range(-90, 90), y: y + random.range(-90, 90),
        angle: random.range(0, Math.PI * 2), speed: 175,
        color: '#3a3a3a', health: 100, tx: x, ty: y, flee: 0, down: 0, punchCooldown: 0,
      });
    }
  }

  function setWanted(n) {
    state.wanted = Math.max(0, Math.min(POLICE.maxStars, n));
    state.wantedTimer = 0;
  }

  function raiseWanted(n) {
    const before = state.wanted;
    setWanted(state.wanted + n);
    return state.wanted > before;
  }

  function addCash(n) {
    state.cash += n;
  }

  function reset() {
    player.x = 700;
    player.y = 350;
    player.angle = 0;
    player.health = PLAYER.health;
    player.ammo = 0;
    player.armed = false;
    player.bustTimer = 0;
    player.punchCooldown = 0;
    player.pistolCooldown = 0;
    cars.length = 0;
    peds.length = 0;
    pickups.length = 0;
    effects.length = 0;
    playerCar = null;
    over = false;
    overKind = '';
    state.cash = MONEY.start;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.elapsed = 0;
    state.guardsDown = 0;
    state.kills = 0;
    state.carsStolen = 0;
    state.missionsDone = 0;
    for (const parked of city.parked) {
      cars.push({
        kind: 'parked', model: parked.model, x: parked.x, y: parked.y, angle: parked.angle,
        dir: 0, speed: 0, color: parked.color, health: 100, driver: false,
        turnCooldown: 0, stuck: 0, ramCooldown: 0, dead: false, special: parked.special || null,
      });
    }
    for (let i = 0; i < TRAFFIC.count; i += 1) spawnTrafficCar(false);
    for (let i = 0; i < PEDS.count; i += 1) spawnPed(false);
    pickups.push({ kind: 'pistol', x: city.landmarks.gunStore.x, y: city.landmarks.gunStore.y, taken: false, timer: 0 });
    pickups.push({ kind: 'health', x: city.landmarks.hospital.x, y: city.landmarks.hospital.y, taken: false, timer: 0 });
    missions.setProgress(0, 0);
    missions.begin({ setWanted, spawnGuards });
  }

  function nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const car of cars) {
      if (car.dead) continue;
      const d = dist2(car, player);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function exitCar() {
    if (!playerCar) return;
    const car = playerCar;
    car.speed = 0;
    playerCar = null;
    // Step out beside the car; try both sides, then ahead and behind, and take the
    // first spot that is not inside a building or the water.
    const spots = [];
    for (const side of [1, -1]) {
      spots.push({
        x: car.x + Math.cos(car.angle + Math.PI / 2) * side * 44,
        y: car.y + Math.sin(car.angle + Math.PI / 2) * side * 44,
      });
    }
    for (const along of [60, -60]) {
      spots.push({ x: car.x + Math.cos(car.angle) * along, y: car.y + Math.sin(car.angle) * along });
    }
    for (const spot of spots) {
      if (!city.hitsSolid(spot.x, spot.y, PLAYER.radius)) {
        player.x = spot.x;
        player.y = spot.y;
        player.angle = car.angle;
        return;
      }
    }
    player.x = car.x;
    player.y = car.y;
  }

  function enterCar(car) {
    if (car.kind === 'traffic' && car.driver) {
      car.driver = false;
      state.carsStolen += 1;
      raiseWanted(1);
      const a = random.range(0, Math.PI * 2);
      peds.push({
        kind: 'walker', x: car.x + Math.cos(a) * 40, y: car.y + Math.sin(a) * 40,
        angle: a, speed: PEDS.runSpeed, color: '#e8b04b', health: 50,
        tx: car.x + Math.cos(a) * 300, ty: car.y + Math.sin(a) * 300, flee: 3, down: 0, punchCooldown: 0,
      });
    } else if (car.kind === 'parked') {
      state.carsStolen += 1;
    }
    car.kind = 'player';
    playerCar = car;
    player.x = car.x;
    player.y = car.y;
  }

  function hurtPlayer(damage, events) {
    if (over) return events;
    player.health -= damage;
    player.hurtFlash = 0.35;
    events |= EVENT_HIT;
    if (player.health <= 0) {
      player.health = 0;
      over = true;
      overKind = 'wasted';
      events |= EVENT_WASTED;
    }
    return events;
  }

  function stepTraffic(car, dt) {
    if (car.dead) return;
    car.turnCooldown -= dt;
    const ahead = { x: car.x + Math.cos(car.angle) * 56, y: car.y + Math.sin(car.angle) * 56 };
    let blocked = false;
    for (const other of cars) {
      if (other === car || other.dead) continue;
      const d = dist2(ahead, other);
      if (d < 46 * 46) {
        blocked = true;
        break;
      }
    }
    const speed = blocked ? car.speed * 0.5 : car.speed;
    const nx = car.x + Math.cos(car.angle) * speed * dt;
    const ny = car.y + Math.sin(car.angle) * speed * dt;
    if (!city.hitsSolid(nx, ny, 16)) {
      car.x = nx;
      car.y = ny;
      car.stuck = 0;
    } else {
      car.stuck += dt;
    }
    // At a crossing, turn left, right or straight on — never reverse.
    const nearAvenue = ROADS.avenues.some((a) => Math.abs(car.x - a) < 14);
    const nearStreet = ROADS.streets.some((s) => Math.abs(car.y - s) < 14);
    if (nearAvenue && nearStreet && car.turnCooldown <= 0) {
      const turn = random.pick([-1, 0, 0, 1]);
      car.dir = (car.dir + turn + 4) % 4;
      car.angle = Math.atan2(DIRS[car.dir].y, DIRS[car.dir].x);
      car.turnCooldown = 1.2;
    }
    if (car.stuck > TRAFFIC.stuckSeconds) {
      car.dir = (car.dir + 2) % 4;
      car.angle = Math.atan2(DIRS[car.dir].y, DIRS[car.dir].x);
      car.stuck = 0;
    }
  }

  function stepPoliceCar(car, dt, events) {
    if (car.dead) return events;
    car.siren += dt;
    const d = Math.sqrt(dist2(car, player));
    const target = angleTo(car, player);
    const diff = angleDiff(target, car.angle);
    car.angle += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
    const wantSpeed = d > 90 ? POLICE.carSpeed : POLICE.carSpeed * 0.4;
    car.speed += (wantSpeed - car.speed) * Math.min(1, 2.2 * dt);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    if (!city.hitsSolid(nx, ny, 16)) {
      car.x = nx;
      car.y = ny;
    } else {
      car.speed *= 0.4;
    }
    car.ramCooldown -= dt;
    if (d < 64 && car.ramCooldown <= 0) {
      car.ramCooldown = 0.9;
      if (playerCar) {
        playerCar.health -= POLICE.ramDamage;
        playerCar.speed *= 0.55;
        addEffect(player.x, player.y, 'crash');
        events |= EVENT_CRASH;
        if (playerCar.health <= 0) {
          playerCar.dead = true;
          playerCar.speed = 0;
        }
      } else {
        events = hurtPlayer(POLICE.ramDamage, events);
      }
    }
    return events;
  }

  function stepPlayerCar(car, dt, input, events) {
    if (car.dead) {
      exitCar();
      return events;
    }
    const throttle = input.moveY() * -1; // W/up is forward
    const steer = input.moveX();
    if (throttle > 0) car.speed += CAR.accel * dt;
    else if (throttle < 0) {
      if (car.speed > 10) car.speed -= CAR.brake * dt;
      else car.speed -= CAR.reverseAccel * dt;
    }
    if (input.handbrake()) car.speed *= Math.max(0, 1 - 3 * dt);
    car.speed -= car.speed * 0.55 * dt;
    car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
    const turn = steer * CAR.turnRate * dt * Math.min(1, Math.abs(car.speed) / 140 + 0.15) * (car.speed < 0 ? -1 : 1);
    car.angle += turn * (input.handbrake() ? 1.5 : 1);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    if (!city.hitsSolid(nx, ny, 16)) {
      car.x = nx;
      car.y = ny;
    } else {
      if (Math.abs(car.speed) > 260) {
        car.health -= 8;
        addEffect(nx, ny, 'crash');
        events |= EVENT_CRASH;
        if (car.health <= 0) {
          car.dead = true;
          car.speed = 0;
          exitCar();
        }
      }
      car.speed *= 0.35;
    }
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    // Running a pedestrian over is a crime the whole street sees.
    for (const ped of peds) {
      if (ped.down > 0 || ped.kind === 'guard' || ped.kind === 'cop') continue;
      if (dist2(ped, car) < 34 * 34 && Math.abs(car.speed) > 60) {
        ped.down = 2.5;
        ped.health = 0;
        if (raiseWanted(1)) events |= EVENT_WANTED;
        addEffect(ped.x, ped.y, 'hit');
      }
    }
    return events;
  }

  function stepOnFoot(dt, input, aim, events) {
    const mx = input.moveX();
    const my = input.moveY();
    const len = Math.hypot(mx, my) || 1;
    const speed = (input.running() ? PLAYER.runSpeed : PLAYER.walkSpeed);
    const nx = player.x + (mx / len) * speed * dt;
    const ny = player.y + (my / len) * speed * dt;
    if (!city.hitsSolid(nx, player.y, PLAYER.radius)) player.x = nx;
    if (!city.hitsSolid(player.x, ny, PLAYER.radius)) player.y = ny;
    if (mx !== 0 || my !== 0) player.angle = Math.atan2(my, mx);
    else if (aim) player.angle = angleTo(player, aim);
    player.punchCooldown -= dt;
    player.pistolCooldown -= dt;
    return events;
  }

  function punch(events) {
    if (player.punchCooldown > 0 || playerCar) return events;
    player.punchCooldown = PLAYER.punchCooldown;
    let best = null;
    let bestD = PLAYER.punchRange * PLAYER.punchRange;
    for (const ped of peds) {
      if (ped.down > 0) continue;
      const d = dist2(ped, player);
      if (d < bestD && Math.abs(angleDiff(angleTo(player, ped), player.angle)) < 1.4) {
        bestD = d;
        best = ped;
      }
    }
    events |= EVENT_PUNCH;
    if (!best) return events;
    best.health -= PLAYER.punchDamage;
    addEffect(best.x, best.y, 'hit');
    if (best.kind === 'cop') {
      if (raiseWanted(2)) events |= EVENT_WANTED;
    } else if (best.kind === 'guard') {
      if (best.health <= 0) {
        best.down = 999;
        state.guardsDown += 1;
      }
    } else {
      if (raiseWanted(1)) events |= EVENT_WANTED;
      if (best.health <= 0) best.down = 2.5;
      else {
        best.flee = 3;
        best.tx = best.x + (best.x - player.x);
        best.ty = best.y + (best.y - player.y);
      }
    }
    if (best.kind === 'cop' && best.health <= 0) {
      best.down = 999;
      state.kills += 1;
    }
    return events;
  }

  function shoot(aim, events) {
    if (player.pistolCooldown > 0 || playerCar || !player.armed || player.ammo <= 0) return events;
    player.pistolCooldown = PLAYER.pistolCooldown;
    player.ammo -= 1;
    addEffect(player.x + Math.cos(player.angle) * 26, player.y + Math.sin(player.angle) * 26, 'muzzle');
    events |= EVENT_SHOT;
    // Hits what the player clicked on: the hostile nearest the aim point, if it is
    // in range. Clicking on a moving target stays fair because the aim is the click.
    let best = null;
    let bestD = 42 * 42;
    for (const ped of peds) {
      if (ped.down > 0) continue;
      if (dist2(ped, player) > PLAYER.pistolRange * PLAYER.pistolRange) continue;
      const d = dist2(ped, aim);
      if (d < bestD) {
        bestD = d;
        best = ped;
      }
    }
    if (!best) return events;
    best.health -= PLAYER.pistolDamage;
    addEffect(best.x, best.y, 'hit');
    if (best.kind === 'cop') {
      if (raiseWanted(2)) events |= EVENT_WANTED;
      if (best.health <= 0) {
        best.down = 999;
        state.kills += 1;
      }
    } else if (best.kind === 'guard') {
      if (best.health <= 0) {
        best.down = 999;
        state.guardsDown += 1;
      }
    } else if (best.health <= 0) {
      best.down = 2.5;
      if (raiseWanted(1)) events |= EVENT_WANTED;
    }
    return events;
  }

  function stepPeds(dt, events) {
    for (const ped of peds) {
      if (ped.down > 0) {
        ped.down -= dt;
        if (ped.down <= 0 && ped.kind === 'walker') {
          ped.health = 50;
          ped.flee = 4;
          ped.tx = ped.x + (ped.x - player.x);
          ped.ty = ped.y + (ped.y - player.y);
        }
        continue;
      }
      ped.punchCooldown -= dt;
      const dPlayer = Math.sqrt(dist2(ped, player));
      if (ped.kind === 'guard' || ped.kind === 'cop') {
        // Hostiles chase the player and swing when they reach them.
        if (dPlayer < 900) {
          ped.angle = angleTo(ped, player);
          const speed = ped.kind === 'cop' ? 210 : 175;
          const nx = ped.x + Math.cos(ped.angle) * speed * dt;
          const ny = ped.y + Math.sin(ped.angle) * speed * dt;
          if (!city.hitsSolid(nx, ny, 10)) {
            ped.x = nx;
            ped.y = ny;
          }
          if (dPlayer < 34 && ped.punchCooldown <= 0 && !playerCar) {
            ped.punchCooldown = 0.9;
            events = hurtPlayer(ped.kind === 'cop' ? 7 : 6, events);
          }
          if (ped.kind === 'cop' && dPlayer < 30 && !playerCar) {
            player.bustTimer += dt;
            if (player.bustTimer >= POLICE.bustSeconds && !over) {
              over = true;
              overKind = 'busted';
              events |= EVENT_BUSTED;
            }
          }
          continue;
        }
      } else {
        // Walkers stroll the pavements and run from a speeding car.
        if (playerCar && dPlayer < PEDS.fleeRange && Math.abs(playerCar.speed) > 120) {
          ped.flee = 1.2;
          ped.tx = ped.x + (ped.x - player.x) * 2;
          ped.ty = ped.y + (ped.y - player.y) * 2;
        }
        if (ped.flee > 0) {
          ped.flee -= dt;
          ped.angle = angleTo(ped, { x: ped.tx, y: ped.ty });
          const nx = ped.x + Math.cos(ped.angle) * PEDS.runSpeed * dt;
          const ny = ped.y + Math.sin(ped.angle) * PEDS.runSpeed * dt;
          if (!city.hitsSolid(nx, ny, 10)) {
            ped.x = nx;
            ped.y = ny;
          }
          continue;
        }
      }
      const dTarget = Math.sqrt(dist2(ped, { x: ped.tx, y: ped.ty }));
      if (dTarget < 24) {
        const road = city.nearestRoadPoint(ped.x + random.range(-500, 500), ped.y + random.range(-500, 500));
        ped.tx = road.x + random.range(-80, 80);
        ped.ty = road.y + random.range(-80, 80);
        continue;
      }
      ped.angle = angleTo(ped, { x: ped.tx, y: ped.ty });
      const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
      const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
      if (!city.hitsSolid(nx, ny, 10)) {
        ped.x = nx;
        ped.y = ny;
      } else {
        ped.tx = ped.x + random.range(-200, 200);
        ped.ty = ped.y + random.range(-200, 200);
      }
    }
    if (playerCar || peds.every((p) => p.kind !== 'cop' || dist2(p, player) > 40 * 40)) {
      player.bustTimer = Math.max(0, player.bustTimer - dt * 2);
    }
    return events;
  }

  function stepCars(dt, input, events) {
    for (const car of cars) {
      if (car.kind === 'traffic') stepTraffic(car, dt);
      else if (car.kind === 'police') events = stepPoliceCar(car, dt, events);
      // The player's car is stepped by step() already, before this pass.
    }
    // Car-on-car bumps: push apart, chip the paint.
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        if (a.dead || b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < 52) {
          const push = (52 - d) / 2;
          const ux = dx / d;
          const uy = dy / d;
          // A push never shoves a car into a building or the water.
          if (!city.hitsSolid(a.x - ux * push * 0.5, a.y - uy * push * 0.5, 16)) {
            a.x -= ux * push * 0.5;
            a.y -= uy * push * 0.5;
          }
          if (!city.hitsSolid(b.x + ux * push * 0.5, b.y + uy * push * 0.5, 16)) {
            b.x += ux * push * 0.5;
            b.y += uy * push * 0.5;
          }
          if ((a.kind === 'player' || b.kind === 'player') && Math.abs(a.speed - b.speed) > 180) {
            const pc = a.kind === 'player' ? a : b;
            pc.health -= 4;
            addEffect((a.x + b.x) / 2, (a.y + b.y) / 2, 'crash');
            events |= EVENT_CRASH;
            if (pc.health <= 0) {
              pc.dead = true;
              pc.speed = 0;
            }
          }
        }
      }
    }
    // Traffic that wandered far away comes back near the player.
    for (const car of cars) {
      if (car.kind === 'traffic' && dist2(car, player) > 2200 * 2200) {
        const spot = city.randomRoadPoint();
        car.x = spot.x;
        car.y = spot.y;
        car.dir = spot.vertical ? 1 : 0;
        car.angle = Math.atan2(DIRS[car.dir].y, DIRS[car.dir].x);
      }
    }
    return events;
  }

  function stepPolice(dt) {
    const wantCars = Math.min(state.wanted * POLICE.carsPerStar, 5);
    const haveCars = cars.filter((c) => c.kind === 'police' && !c.dead).length;
    for (let i = haveCars; i < wantCars; i += 1) spawnPoliceCar();
    const wantCops = state.wanted > 0 && !playerCar ? Math.min(state.wanted, 3) : 0;
    const haveCops = peds.filter((p) => p.kind === 'cop' && p.down <= 0).length;
    for (let i = haveCops; i < wantCops; i += 1) spawnFootCop();
    // Wanted cools off when no cop is anywhere near.
    const nearest = Math.min(
      ...cars.filter((c) => c.kind === 'police').map((c) => Math.sqrt(dist2(c, player))),
      ...peds.filter((p) => p.kind === 'cop').map((p) => Math.sqrt(dist2(p, player))),
      Infinity,
    );
    if (state.wanted > 0 && nearest > 700) {
      state.wantedTimer += dt;
      if (state.wantedTimer >= POLICE.decaySeconds) {
        state.wanted -= 1;
        state.wantedTimer = 0;
      }
    } else {
      state.wantedTimer = 0;
    }
  }

  function stepPickups(dt, events) {
    for (const pickup of pickups) {
      if (pickup.taken) {
        pickup.timer -= dt;
        if (pickup.timer <= 0) pickup.taken = false;
        continue;
      }
      if (!playerCar && dist2(pickup, player) < 40 * 40) {
        pickup.taken = true;
        pickup.timer = 30;
        events |= EVENT_PICKUP;
        if (pickup.kind === 'pistol') {
          player.armed = true;
          player.ammo = PLAYER.pistolAmmo;
        } else {
          player.health = Math.min(PLAYER.health, player.health + 50);
        }
      }
    }
    return events;
  }

  /**
   * One fixed step. `input` is the input device (or null for the title backdrop, which
   * runs the city with nobody playing). `aim` is the mouse point in world coordinates.
   * `interact`, `punchNow` and `shootNow` are one-shot flags for this step.
   */
  function step(dt, input, aim, interact, punchNow, shootNow, demo) {
    let events = 0;
    state.elapsed += dt;
    if (player.hurtFlash > 0) player.hurtFlash -= dt;
    for (let i = effects.length - 1; i >= 0; i -= 1) {
      effects[i].ttl -= dt;
      if (effects[i].ttl <= 0) effects.splice(i, 1);
    }

    if (demo) {
      for (const car of cars) if (car.kind === 'traffic') stepTraffic(car, dt);
      events = stepPeds(dt, events);
      return events;
    }
    if (over || !input) return events;

    if (interact) {
      if (playerCar) exitCar();
      else {
        const car = nearestCar(CAR.enterRange);
        if (car) enterCar(car);
      }
    }
    if (playerCar) events = stepPlayerCar(playerCar, dt, input, events);
    else {
      events = stepOnFoot(dt, input, aim, events);
      if (punchNow) events = punch(events);
      if (shootNow) events = shoot(aim, events);
    }
    events = stepCars(dt, input, events);
    events = stepPeds(dt, events);
    stepPolice(dt);
    events = stepPickups(dt, events);

    const missionEvent = missions.check(
      { player, playerCar, wanted: state.wanted, guardsDown: state.guardsDown, addCash, setWanted, spawnGuards },
      interact,
    );
    if (missionEvent === 'step') events |= EVENT_STEP;
    else if (missionEvent === 'mission') {
      events |= EVENT_MISSION;
      state.missionsDone += 1;
    } else if (missionEvent === 'all') {
      events |= EVENT_ALL;
      state.missionsDone += 1;
    }
    if (state.wanted > 0) {
      // The mission check can change the wanted level; flag it once here.
    }
    return events;
  }

  function snapshot() {
    return {
      cash: state.cash,
      health: player.health,
      x: Math.round(player.x),
      y: Math.round(player.y),
      missionIndex: missions.state.index,
      missionStep: missions.state.step,
      wanted: state.wanted,
      ammo: player.ammo,
      armed: player.armed,
      missionsDone: state.missionsDone,
    };
  }

  function loadSnapshot(save) {
    reset();
    state.cash = save.cash ?? MONEY.start;
    player.health = save.health ?? PLAYER.health;
    player.x = save.x ?? 700;
    player.y = save.y ?? 350;
    player.ammo = save.ammo ?? 0;
    player.armed = !!save.armed;
    state.missionsDone = save.missionsDone ?? 0;
    missions.setProgress(save.missionIndex ?? 0, save.missionStep ?? 0);
    missions.begin({ setWanted, spawnGuards });
    setWanted(save.wanted ?? 0);
  }

  reset();
  return {
    city,
    missions,
    player,
    cars,
    peds,
    pickups,
    effects,
    state,
    get playerCar() {
      return playerCar;
    },
    get over() {
      return over;
    },
    get overKind() {
      return overKind;
    },
    reset,
    step,
    spawnGuards,
    setWanted,
    addCash,
    raiseWanted,
    snapshot,
    loadSnapshot,
  };
}
