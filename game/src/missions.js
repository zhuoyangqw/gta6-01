// The story: five missions from Maya and Salvo that take Dana Reyes from a courier with a
// debt to the crew's driver. Each mission is a list of steps — go somewhere, steal a car,
// collect cash, lose the cops, take the guards down — and this module owns the progress,
// the current objective and the rewards. The world asks it every step whether the current
// step is done; side effects (heat, guards) go back through the world.

import { MISSIONS, MONEY } from './config.js';

const NEAR = 70;

export function createMissions() {
  const state = { index: 0, step: 0, finished: false, toast: '' };

  function current() {
    return state.finished ? null : MISSIONS[state.index];
  }

  function currentStep() {
    const mission = current();
    return mission ? mission.steps[state.step] : null;
  }

  /** The marker the HUD and the minimap draw: where to go and what to do there. */
  function objective() {
    const mission = current();
    const step = currentStep();
    if (!mission || !step) return null;
    return { x: step.x, y: step.y, label: step.label, mission: mission.title, giver: mission.giver };
  }

  function near(world, step) {
    const dx = world.player.x - step.x;
    const dy = world.player.y - step.y;
    return dx * dx + dy * dy < NEAR * NEAR;
  }

  function nearCar(world, step, range) {
    if (!world.playerCar) return false;
    const dx = world.playerCar.x - step.x;
    const dy = world.playerCar.y - step.y;
    return dx * dx + dy * dy < range * range;
  }

  /** Side effects when a mission begins: heat for the getaway, guards at the warehouse. */
  function begin(world) {
    const mission = current();
    if (!mission) return;
    state.toast = `${mission.giver}: ${mission.brief}`;
    if (mission.id === 'getaway') world.setWanted(3);
    if (mission.id === 'harbor-job') world.spawnGuards(mission.steps[1].x, mission.steps[1].y, 3);
  }

  /**
   * Check the current step against the world. `interact` is true the frame the player
   * pressed E. Returns 'step', 'mission', 'all' or null; the world adds the reward.
   */
  function check(world, interact) {
    const mission = current();
    const step = currentStep();
    if (!mission || !step) return null;
    let done = false;
    if (step.kind === 'goto') done = near(world, step);
    else if (step.kind === 'steal') done = world.playerCar !== null && world.playerCar.special === 'coupe';
    else if (step.kind === 'deliverCar') done = world.playerCar !== null && world.playerCar.special === 'coupe' && nearCar(world, step, 110);
    else if (step.kind === 'collect') done = interact && near(world, step);
    else if (step.kind === 'grab') done = interact && near(world, step);
    else if (step.kind === 'fight') done = world.guardsDown >= 3;
    else if (step.kind === 'escape') done = world.wanted === 0 || near(world, step);
    if (!done) return null;

    if (step.kind === 'collect') world.addCash(MONEY.shopTake);
    state.step += 1;
    if (state.step < mission.steps.length) {
      state.toast = mission.steps[state.step].label;
      return 'step';
    }
    world.addCash(MONEY.missionReward[state.index]);
    state.index += 1;
    state.step = 0;
    if (state.index >= MISSIONS.length) {
      state.finished = true;
      state.toast = 'All done. Solara Bay is yours, Dana.';
      return 'all';
    }
    begin(world);
    return 'mission';
  }

  function setProgress(index, step) {
    state.index = Math.min(index, MISSIONS.length);
    state.step = step;
    state.finished = state.index >= MISSIONS.length;
  }

  return {
    state,
    current,
    currentStep,
    objective,
    begin,
    check,
    setProgress,
    /** The short story line shown under the title. */
    story: 'Dana Reyes owes the Harbor Crew $2,500. Five jobs. One way out.',
  };
}
