// Keyboard and mouse input. Held keys give a steering direction; one-shot presses (enter
// a car, punch, shoot, pause, save, confirm) are queued as bit flags and taken once by the
// loop, so a press between two frames is never lost and never counted twice. The mouse gives
// an aim point in view coordinates, which the world converts to the world.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_SHOOT = 16;
export const ACTION_SAVE = 32;
export const ACTION_MUTE = 64;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const SAVE = new Set(['KeyQ']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  function codeOf(event) {
    return event.code;
  }

  window.addEventListener('keydown', (event) => {
    const code = codeOf(event);
    if (UP.has(code) || DOWN.has(code) || LEFT.has(code) || RIGHT.has(code)) {
      held.add(code);
      event.preventDefault();
    } else if (CONFIRM.has(code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (PAUSE.has(code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (ENTER.has(code)) {
      if (!event.repeat) actions |= ACTION_ENTER;
    } else if (PUNCH.has(code)) {
      if (!event.repeat) actions |= ACTION_PUNCH;
    } else if (SAVE.has(code)) {
      if (!event.repeat) actions |= ACTION_SAVE;
    } else if (MUTE.has(code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(codeOf(event));
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
  });

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseDown = true;
    if (event.button === 0) actions |= ACTION_SHOOT;
    else actions |= ACTION_CONFIRM;
  });
  canvas.addEventListener('pointerup', () => {
    mouseDown = false;
  });

  function axis(neg, pos) {
    return (held.has(pos) ? 1 : 0) - (held.has(neg) ? 1 : 0);
  }

  return {
    /** -1, 0 or 1 on each axis, from WASD or the arrow keys. */
    moveX() {
      return axis('ArrowLeft', 'ArrowRight') || axis('KeyA', 'KeyD');
    },
    moveY() {
      return axis('ArrowUp', 'ArrowDown') || axis('KeyW', 'KeyS');
    },
    /** True while Shift is held (run on foot). */
    running() {
      return held.has('ShiftLeft') || held.has('ShiftRight');
    },
    /** True while Space is held (handbrake in a car). */
    handbrake() {
      return held.has('Space');
    },
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
