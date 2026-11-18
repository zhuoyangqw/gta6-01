// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, game over and the win
// screen. Q saves, M mutes, P pauses, E enters a car or works a mission spot, F punches,
// and a mouse click fires the pistol.
//
// ?seed=N fixes the city and the traffic. ?shot=start|play|chase|mission (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_ALL, EVENT_BUSTED, EVENT_CASH, EVENT_MISSION, EVENT_PICKUP, EVENT_SHOT, EVENT_STEP, EVENT_WASTED } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, ACTION_SAVE, ACTION_SHOOT, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { createAudio } from './audio.js';
import { clearSave, readBest, readSave, writeBest, writeSave } from './save.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, { best: scene.best, toast: '', hasSave: false, muted: false }, 1 / 60);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let hasSave = readSave() !== null;
  let toast = '';
  let toastTimer = 0;
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function showToast(message, seconds) {
    toast = message;
    toastTimer = seconds || 4;
  }

  function saveGame(quiet) {
    const ok = writeSave(world.snapshot());
    if (ok) {
      hasSave = true;
      if (!quiet) showToast('Saved. Your story waits for you.');
    } else if (!quiet) showToast('Could not save in this browser.');
    return ok;
  }

  function startNewGame() {
    clearSave();
    world.reset();
    audio.unlock();
    screen = SCREEN_PLAY;
    showToast(world.missions.current().brief, 6);
    announce('Playing. First job: First Run.');
  }

  function continueGame() {
    const save = readSave();
    if (!save) {
      startNewGame();
      return;
    }
    world.loadSnapshot(save);
    audio.unlock();
    screen = SCREEN_PLAY;
    showToast('Welcome back, Dana.', 4);
    announce('Playing. Continued from your save.');
  }

  function endGame(kind) {
    screen = SCREEN_OVER;
    audio.siren(false);
    audio.engine(0, false);
    if (world.state.cash > best) {
      best = world.state.cash;
      writeBest(best);
    }
    announce(kind === 'busted' ? 'Busted. Game over.' : 'Wasted. Game over.');
  }

  function winGame() {
    screen = SCREEN_WIN;
    audio.siren(false);
    audio.engine(0, false);
    if (world.state.cash > best) {
      best = world.state.cash;
      writeBest(best);
    }
    clearSave();
    announce('All five jobs done. Solara Bay is yours.');
  }

  function handleEvents(events) {
    if (events & EVENT_WASTED) endGame('wasted');
    else if (events & EVENT_BUSTED) endGame('busted');
    else if (events & EVENT_ALL) {
      audio.jingle();
      saveGame(true);
      winGame();
    } else if (events & EVENT_MISSION) {
      audio.jingle();
      showToast(`Job done! +$${world.state.cash.toLocaleString('en-US')} in the pocket.`, 5);
      saveGame(true);
    } else if (events & EVENT_STEP) {
      audio.pickup();
      const objective = world.missions.objective();
      if (objective) showToast(objective.label, 4);
    }
    if (events & EVENT_CASH) audio.pickup();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_SHOT) audio.shot();
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      showToast(muted ? 'Sound off.' : 'Sound on.', 2);
    }
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE) startNewGame();
      else if (screen === SCREEN_OVER || screen === SCREEN_WIN) startNewGame();
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    }
    if (screen === SCREEN_PLAY && actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (screen === SCREEN_PAUSED && (actions & (ACTION_PAUSE | ACTION_CONFIRM))) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    return actions;
  }

  function stepGame(actions) {
    const mouse = input.mouse();
    const aim = renderer.screenToWorld(mouse.x, mouse.y);
    const events = world.step(
      STEP,
      input,
      aim,
      !!(actions & ACTION_ENTER),
      !!(actions & ACTION_PUNCH),
      !!(actions & ACTION_SHOOT),
      false,
    );
    if (actions & ACTION_SAVE) saveGame(false);
    handleEvents(events);
    // Engine and siren follow the drive.
    if (world.playerCar) audio.engine(Math.abs(world.playerCar.speed) / 620, true);
    else audio.engine(0, false);
    const copNear = world.cars.some((c) => c.kind === 'police' && Math.hypot(c.x - world.player.x, c.y - world.player.y) < 800);
    audio.siren(world.state.wanted > 0 && copNear);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    if (toastTimer > 0) toastTimer -= Math.min((now - last) / 1000, MAX_FRAME);
    if (toastTimer <= 0) toast = '';
    if (screen === SCREEN_TITLE) {
      while (accumulator >= STEP) {
        world.step(STEP, null, null, false, false, false, true);
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      // One-shot presses (E, F, click, Q) belong to the first step only.
      let pending = actions;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        stepGame(pending);
        pending = 0;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world, screen, { best, toast, hasSave, muted: audio.isMuted() }, 1 / 60);
  }

  // C on the title screen continues a saved game.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC' && screen === SCREEN_TITLE && hasSave && !event.repeat) {
      continueGame();
    }
  });

  // Leaving the tab pauses a running game rather than letting the cops catch you unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // A hook for play-testing: the state a test reads, nothing the game itself uses.
  window.__solara = {
    world,
    screen() {
      return screen;
    },
    state() {
      return {
        screen,
        x: Math.round(world.player.x),
        y: Math.round(world.player.y),
        cash: world.state.cash,
        wanted: world.state.wanted,
        health: Math.round(world.player.health),
        missionIndex: world.missions.state.index,
        missionStep: world.missions.state.step,
        missionsDone: world.state.missionsDone,
        finished: world.missions.state.finished,
        inCar: world.playerCar !== null,
        carHealth: world.playerCar ? Math.round(world.playerCar.health) : null,
        ammo: world.player.ammo,
        armed: world.player.armed,
        over: world.over,
        overKind: world.overKind,
        cars: world.cars.length,
        peds: world.peds.length,
        policeCars: world.cars.filter((c) => c.kind === 'police').length,
        cops: world.peds.filter((p) => p.kind === 'cop' && p.down <= 0).length,
        guardsDown: world.state.guardsDown,
        camera: { x: Math.round(renderer.camera.x), y: Math.round(renderer.camera.y) },
      };
    },
  };

  announce('Solara Bay. Press Enter to start, C to continue your save.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
