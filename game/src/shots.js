// The screenshot scenes behind ?shot=start|play|chase|mission. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot — walk to a car, steal it, drive to the mission marker, run from the cops —
// so the frame is what real play looks like and the same seed always gives the same frame.

import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 24;
const CHASE_SECONDS = 10;
const MISSION_SECONDS = 12;

/** A fake input device the autopilot steers with: it answers like a held key. */
function autopilotInput(world, target, driving) {
  let steer = 0;
  let throttle = 0;
  if (driving) {
    const car = world.playerCar;
    const want = Math.atan2(target.y - car.y, target.x - car.x);
    let diff = want - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    steer = diff > 0.15 ? 1 : diff < -0.15 ? -1 : 0;
    throttle = -1;
  } else {
    const dx = target.x - world.player.x;
    const dy = target.y - world.player.y;
    steer = Math.abs(dx) > 12 ? Math.sign(dx) : 0;
    throttle = Math.abs(dy) > 12 ? Math.sign(dy) : 0;
  }
  return {
    moveX() {
      return steer;
    },
    moveY() {
      return throttle;
    },
    running() {
      return true;
    },
    handbrake() {
      return false;
    },
  };
}

function nearestCar(world) {
  let best = null;
  let bestD = Infinity;
  for (const car of world.cars) {
    if (car.dead) continue;
    const dx = car.x - world.player.x;
    const dy = car.y - world.player.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

/** Drive (or walk) toward `target` for `seconds`, stealing a car on the way if on foot. */
function driveTo(world, target, seconds) {
  let lastX = world.player.x;
  let lastY = world.player.y;
  let stuckCheck = 0;
  let reverseTimer = 0;
  // Once the player steps out near the target, they stay on foot to finish the job.
  let onFootForGood = false;
  for (let i = 0; i < seconds / STEP; i += 1) {
    if (world.over) break;
    let interact = false;
    let goal = target;
    if (!world.playerCar && !onFootForGood) {
      const car = nearestCar(world);
      if (car) {
        goal = car;
        const dx = car.x - world.player.x;
        const dy = car.y - world.player.y;
        if (dx * dx + dy * dy < 50 * 50) interact = true;
      }
    } else if (world.playerCar) {
      // Close enough to walk in: park and finish on foot.
      const dx = target.x - world.player.x;
      const dy = target.y - world.player.y;
      if (dx * dx + dy * dy < 160 * 160) {
        interact = true;
        onFootForGood = true;
      }
    }
    const input = autopilotInput(world, goal, !!world.playerCar);
    if (reverseTimer > 0) {
      reverseTimer -= 1;
      const backing = {
        moveX() {
          return -input.moveX();
        },
        moveY() {
          return 1;
        },
        running() {
          return false;
        },
        handbrake() {
          return false;
        },
      };
      world.step(STEP, backing, { x: world.player.x + 100, y: world.player.y }, interact, false, false, false);
    } else {
      world.step(STEP, input, { x: world.player.x + 100, y: world.player.y }, interact, false, false, false);
    }
    // Stuck against a building? Back up for a second, then try again.
    stuckCheck += 1;
    if (stuckCheck >= 90) {
      stuckCheck = 0;
      const moved = Math.hypot(world.player.x - lastX, world.player.y - lastY);
      lastX = world.player.x;
      lastY = world.player.y;
      if (world.playerCar && moved < 25) reverseTimer = 60;
    }
  }
}

/**
 * Set `world` to the named scene (start, play, chase or mission; any other name is start)
 * and return the screen to draw over it and the best haul to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'chase' && name !== 'mission') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, null, null, false, false, false, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'chase') {
    world.setWanted(3);
    driveTo(world, world.city.landmarks.beachHideout, CHASE_SECONDS);
    return { screen: SCREEN_PLAY, best: world.state.cash };
  }
  if (name === 'mission') {
    world.missions.setProgress(2, 0);
    world.missions.begin(world);
    const objective = world.missions.objective();
    driveTo(world, objective, MISSION_SECONDS);
    return { screen: SCREEN_PLAY, best: world.state.cash };
  }
  const objective = world.missions.objective();
  driveTo(world, objective, PLAY_SECONDS);
  return { screen: SCREEN_PLAY, best: world.state.cash };
}
