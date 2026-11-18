// Drawing only: the world's state and the current screen in, pixels out. The camera
// follows the player across the 3200x2400 city and shows a 1280x720 window of it, scaled
// to fit the browser window. Then the HUD: cash and health, the wanted stars, the mission
// objective, the minimap with its blips, and the title, pause and game-over panels.

import { FONT, PALETTE, ROADS, VIEW, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const ROAD_HALF = ROADS.width / 2;
const MINIMAP = { width: 208, height: 156, margin: 16 };

const fonts = new Map();
function font(size, bold) {
  const key = `${bold ? '700 ' : ''}${size}`;
  if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
  return fonts.get(key);
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, cssW: 0, cssH: 0 };
  const camera = { x: 640, y: 360 };
  let time = 0;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    canvas.width = Math.round(cssW * ratio);
    canvas.height = Math.round(cssH * ratio);
    view.scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    view.x = (canvas.width - VIEW.width * view.scale) / 2;
    view.y = (canvas.height - VIEW.height * view.scale) / 2;
    view.cssW = cssW;
    view.cssH = cssH;
  }

  function text(value, x, y, size, color, align, bold) {
    context.font = font(size, bold);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function drawGround(world) {
    const { city } = world;
    context.fillStyle = PALETTE.grass;
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    // Mown stripes across the grass, for depth.
    context.fillStyle = PALETTE.grassDark;
    for (let y = 0; y < WORLD.height; y += 160) context.fillRect(0, y, WORLD.width, 80);
    // Beach, then water with slow waves.
    context.fillStyle = PALETTE.sand;
    context.fillRect(0, ROADS.beachY, WORLD.width, ROADS.waterY - ROADS.beachY);
    context.fillStyle = PALETTE.water;
    context.fillRect(0, ROADS.waterY, WORLD.width, WORLD.height - ROADS.waterY);
    context.fillStyle = PALETTE.waterDeep;
    for (let x = 0; x < WORLD.width; x += 260) {
      const wave = Math.sin(time * 1.4 + x * 0.01) * 6;
      context.fillRect(x + 40, ROADS.waterY + 24 + wave, 120, 5);
      context.fillRect(x + 120, ROADS.waterY + 62 - wave, 90, 5);
    }
    // Parks with trees.
    for (const park of city.parks) {
      context.fillStyle = PALETTE.park;
      context.fillRect(park.x, park.y, park.w, park.h);
      context.fillStyle = '#3f7038';
      for (let i = 0; i < Math.floor((park.w * park.h) / 9000); i += 1) {
        const tx = park.x + 20 + ((i * 53) % Math.max(20, park.w - 40));
        const ty = park.y + 20 + ((i * 37) % Math.max(20, park.h - 40));
        context.beginPath();
        context.arc(tx, ty, 12, 0, Math.PI * 2);
        context.fill();
      }
    }
    // Pavements: a pale strip under every road, wider than the asphalt.
    context.fillStyle = PALETTE.sidewalk;
    for (const avenue of ROADS.avenues) context.fillRect(avenue - ROAD_HALF - 12, 0, ROADS.width + 24, ROADS.beachY);
    for (const street of ROADS.streets) context.fillRect(0, street - ROAD_HALF - 12, WORLD.width, ROADS.width + 24);
    // Asphalt and its centre dashes.
    context.fillStyle = PALETTE.road;
    for (const avenue of ROADS.avenues) context.fillRect(avenue - ROAD_HALF, 0, ROADS.width, ROADS.beachY);
    for (const street of ROADS.streets) context.fillRect(0, street - ROAD_HALF, WORLD.width, ROADS.width);
    context.fillStyle = PALETTE.lane;
    for (const avenue of ROADS.avenues) {
      for (let y = 20; y < ROADS.beachY; y += 64) context.fillRect(avenue - 2, y, 4, 30);
    }
    for (const street of ROADS.streets) {
      for (let x = 20; x < WORLD.width; x += 64) context.fillRect(x, street - 2, 30, 4);
    }
  }

  /** District names, painted over the buildings so they stay readable. */
  function drawDistrictLabels(world) {
    context.font = font(26, true);
    context.fillStyle = 'rgba(255, 255, 255, 0.6)';
    context.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    context.lineWidth = 4;
    context.textAlign = 'center';
    for (const district of world.city.districts) {
      context.strokeText(district.name.toUpperCase(), district.x, district.y);
      context.fillText(district.name.toUpperCase(), district.x, district.y);
    }
  }

  function drawBuildings(world) {
    for (const b of world.city.buildings) {
      // A soft shadow, offset by the building's height.
      context.fillStyle = 'rgba(0, 0, 0, 0.25)';
      context.fillRect(b.x + 5 + b.height * 3, b.y + 6 + b.height * 3, b.w, b.h);
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.strokeStyle = PALETTE.buildingEdge;
      context.lineWidth = 2;
      context.strokeRect(b.x, b.y, b.w, b.h);
      // Roof furniture: a vent box and a skylight.
      context.fillStyle = 'rgba(0, 0, 0, 0.18)';
      context.fillRect(b.x + b.w * 0.15, b.y + b.h * 0.18, b.w * 0.22, b.h * 0.2);
      context.fillStyle = 'rgba(255, 255, 255, 0.35)';
      context.fillRect(b.x + b.w * 0.62, b.y + b.h * 0.55, b.w * 0.2, b.h * 0.22);
    }
  }

  function drawCar(car, isPlayer, flash) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    const len = car.model === 'van' ? 76 : 64;
    const wid = car.model === 'van' ? 34 : 30;
    // Wheels.
    context.fillStyle = '#151515';
    context.fillRect(-len / 2 + 6, -wid / 2 - 3, 14, 6);
    context.fillRect(-len / 2 + 6, wid / 2 - 3, 14, 6);
    context.fillRect(len / 2 - 20, -wid / 2 - 3, 14, 6);
    context.fillRect(len / 2 - 20, wid / 2 - 3, 14, 6);
    // Body.
    context.fillStyle = car.dead ? '#55565c' : car.color;
    roundRect(-len / 2, -wid / 2, len, wid, 8);
    context.fill();
    if (car.kind === 'police') {
      context.fillStyle = '#f4f4f4';
      context.fillRect(-len / 2 + 4, -wid / 2, len - 8, wid);
      context.fillStyle = '#2b4a8f';
      context.fillRect(-6, -wid / 2, 12, wid);
    }
    // Windshield and roof.
    context.fillStyle = 'rgba(20, 30, 40, 0.75)';
    context.fillRect(len / 2 - 20, -wid / 2 + 5, 10, wid - 10);
    context.fillStyle = 'rgba(255, 255, 255, 0.22)';
    context.fillRect(-8, -wid / 2 + 5, 18, wid - 10);
    if (car.kind === 'police') {
      // Flashing light bar: red on one beat, blue on the next.
      context.fillStyle = flash ? PALETTE.copLightRed : PALETTE.copLightBlue;
      context.fillRect(-4, -wid / 2 - 2, 8, 6);
      context.fillStyle = flash ? PALETTE.copLightBlue : PALETTE.copLightRed;
      context.fillRect(-4, wid / 2 - 4, 8, 6);
    }
    if (isPlayer) {
      context.strokeStyle = PALETTE.marker;
      context.lineWidth = 3;
      roundRect(-len / 2 - 4, -wid / 2 - 4, len + 8, wid + 8, 10);
      context.stroke();
    }
    context.restore();
    if (car.dead) {
      context.fillStyle = 'rgba(120, 120, 120, 0.5)';
      context.beginPath();
      context.arc(car.x - 10, car.y - 14, 10 + Math.sin(time * 3) * 3, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawPed(ped) {
    context.save();
    context.translate(ped.x, ped.y);
    if (ped.down > 0) {
      // Lying flat, knocked down.
      context.rotate(ped.angle + Math.PI / 2);
      context.fillStyle = ped.color;
      context.beginPath();
      context.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
      return;
    }
    context.rotate(ped.angle);
    context.fillStyle = ped.kind === 'cop' ? '#1d3566' : '#22242a';
    context.beginPath();
    context.arc(0, 0, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = ped.color;
    context.beginPath();
    context.arc(6, 0, 7, 0, Math.PI * 2);
    context.fill();
    if (ped.kind === 'cop') {
      context.fillStyle = '#101c3a';
      context.fillRect(-4, -9, 10, 5);
    }
    if (ped.kind === 'guard') {
      context.fillStyle = '#c0392b';
      context.fillRect(-2, -11, 4, 4);
    }
    context.restore();
  }

  function drawPlayer(world) {
    const player = world.player;
    const car = world.playerCar;
    if (car) return; // The car is drawn in the cars pass.
    context.save();
    context.translate(player.x, player.y);
    context.rotate(player.angle);
    if (player.hurtFlash > 0 && Math.floor(player.hurtFlash * 12) % 2 === 0) context.globalAlpha = 0.35;
    // Body: dark jacket, pale shirt, facing right.
    context.fillStyle = '#232a33';
    context.beginPath();
    context.arc(0, 0, 14, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.playerShirt;
    context.beginPath();
    context.arc(4, 0, 9, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8b04b';
    context.beginPath();
    context.arc(9, 0, 5, 0, Math.PI * 2);
    context.fill();
    if (player.armed) {
      context.fillStyle = '#222';
      context.fillRect(10, -2, 16, 4);
    }
    if (player.punchCooldown > 0.22) {
      context.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      context.lineWidth = 4;
      context.beginPath();
      context.arc(0, 0, 26, -0.7, 0.7);
      context.stroke();
    }
    context.restore();
    // A white ring so the player is findable in a crowd.
    context.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(player.x, player.y, 20, 0, Math.PI * 2);
    context.stroke();
  }

  function drawMarker(world) {
    const objective = world.missions.objective();
    if (!objective) return;
    const pulse = 1 + Math.sin(time * 4) * 0.12;
    context.save();
    context.translate(objective.x, objective.y);
    context.scale(pulse, pulse);
    context.rotate(Math.PI / 4);
    context.fillStyle = PALETTE.marker;
    context.fillRect(-13, -13, 26, 26);
    context.strokeStyle = PALETTE.markerRing;
    context.lineWidth = 3;
    context.strokeRect(-13, -13, 26, 26);
    context.restore();
    // A light beam so the marker reads from far away.
    context.fillStyle = 'rgba(255, 210, 63, 0.14)';
    context.fillRect(objective.x - 4, objective.y - 260, 8, 260);
  }

  function drawEffects(world) {
    for (const effect of world.effects) {
      if (effect.kind === 'muzzle') {
        context.fillStyle = '#ffe27a';
        context.beginPath();
        context.arc(effect.x, effect.y, 12, 0, Math.PI * 2);
        context.fill();
      } else if (effect.kind === 'hit') {
        context.strokeStyle = '#ff5a4e';
        context.lineWidth = 3;
        context.beginPath();
        context.arc(effect.x, effect.y, 12 + (0.5 - effect.ttl) * 20, 0, Math.PI * 2);
        context.stroke();
      } else if (effect.kind === 'crash') {
        context.fillStyle = 'rgba(140, 140, 140, 0.55)';
        context.beginPath();
        context.arc(effect.x, effect.y, 16, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawPickups(world) {
    for (const pickup of world.pickups) {
      if (pickup.taken) continue;
      const bob = Math.sin(time * 3 + pickup.x) * 3;
      context.save();
      context.translate(pickup.x, pickup.y + bob);
      context.fillStyle = pickup.kind === 'pistol' ? '#22242a' : '#e8e8e8';
      context.beginPath();
      context.arc(0, 0, 13, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = PALETTE.marker;
      context.lineWidth = 2;
      context.stroke();
      if (pickup.kind === 'pistol') {
        context.fillStyle = '#ffd23f';
        context.fillRect(-8, -2, 16, 5);
        context.fillRect(2, 2, 5, 7);
      } else {
        context.fillStyle = '#d94f3d';
        context.fillRect(-8, -3, 16, 6);
        context.fillRect(-3, -8, 6, 16);
      }
      context.restore();
    }
    // Landmark signs: gun store and hospital.
    const { landmarks } = world.city;
    context.font = font(13, true);
    context.textAlign = 'center';
    context.fillStyle = '#22242a';
    context.fillRect(landmarks.gunStore.x - 34, landmarks.gunStore.y - 44, 68, 20);
    context.fillStyle = '#ffd23f';
    context.fillText('GUN STORE', landmarks.gunStore.x, landmarks.gunStore.y - 30);
    context.fillStyle = '#e8e8e8';
    context.fillRect(landmarks.hospital.x - 34, landmarks.hospital.y - 44, 68, 20);
    context.fillStyle = '#d94f3d';
    context.fillText('HOSPITAL', landmarks.hospital.x, landmarks.hospital.y - 30);
  }

  function drawOffscreenArrow(world) {
    const objective = world.missions.objective();
    if (!objective) return;
    const left = camera.x - VIEW.width / 2;
    const top = camera.y - VIEW.height / 2;
    if (objective.x > left && objective.x < left + VIEW.width && objective.y > top && objective.y < top + VIEW.height) return;
    const cx = Math.min(Math.max(objective.x, left + 40), left + VIEW.width - 40);
    const cy = Math.min(Math.max(objective.y, top + 40), top + VIEW.height - 40);
    const angle = Math.atan2(objective.y - cy, objective.x - cx);
    context.save();
    context.translate(cx, cy);
    context.rotate(angle);
    context.fillStyle = PALETTE.marker;
    context.beginPath();
    context.moveTo(18, 0);
    context.lineTo(-10, -12);
    context.lineTo(-10, 12);
    context.closePath();
    context.fill();
    context.restore();
  }

  function drawHud(world, ui) {
    context.textBaseline = 'alphabetic';
    // Top-left panel: cash, health, pistol.
    context.fillStyle = PALETTE.hudPanel;
    roundRect(14, 12, 250, 84, 10);
    context.fill();
    text(`$${world.state.cash.toLocaleString('en-US')}`, 28, 44, 26, PALETTE.hudGold, 'left', true);
    context.fillStyle = '#3a4149';
    context.fillRect(28, 56, 180, 12);
    context.fillStyle = world.player.health > 30 ? PALETTE.hudGood : PALETTE.hudBad;
    context.fillRect(28, 56, 180 * (world.player.health / 100), 12);
    text(`${Math.ceil(world.player.health)}`, 216, 68, 16, PALETTE.hudText, 'left', true);
    if (world.player.armed) text(`Pistol  ${world.player.ammo}`, 28, 88, 16, PALETTE.hudText, 'left');
    else text('Unarmed — F to punch', 28, 88, 16, PALETTE.hudMuted, 'left');
    // Wanted stars, top centre.
    const stars = '★'.repeat(world.state.wanted) + '☆'.repeat(5 - world.state.wanted);
    const flash = world.state.wanted > 0 && Math.floor(time * 2.5) % 2 === 0;
    text(stars, VIEW.width / 2, 48, 34, flash ? PALETTE.hudBad : PALETTE.hudGold, 'center', true);
    if (world.state.wanted > 0) text('WANTED', VIEW.width / 2, 74, 14, PALETTE.hudBad, 'center', true);
    // Mission objective, bottom centre.
    const objective = world.missions.objective();
    if (objective) {
      const label = `${objective.mission} — ${objective.label}`;
      context.font = font(18, true);
      const w = context.measureText(label).width + 36;
      context.fillStyle = PALETTE.hudPanel;
      roundRect((VIEW.width - w) / 2, VIEW.height - 52, w, 36, 10);
      context.fill();
      text(label, VIEW.width / 2, VIEW.height - 28, 18, PALETTE.hudText, 'center', true);
    }
    // Toast line above the objective.
    if (ui.toast) {
      context.font = font(17, false);
      const w = context.measureText(ui.toast).width + 36;
      context.fillStyle = 'rgba(12, 18, 26, 0.6)';
      roundRect((VIEW.width - w) / 2, VIEW.height - 96, w, 30, 8);
      context.fill();
      text(ui.toast, VIEW.width / 2, VIEW.height - 76, 17, PALETTE.hudGold, 'center');
    }
    // Speed, bottom right, when driving.
    if (world.playerCar) {
      const mph = Math.round(Math.abs(world.playerCar.speed) * 0.09);
      text(`${mph} mph`, VIEW.width - 24, VIEW.height - 24, 30, PALETTE.hudText, 'right', true);
      const car = world.playerCar;
      context.fillStyle = '#3a4149';
      context.fillRect(VIEW.width - 224, VIEW.height - 56, 200, 10);
      context.fillStyle = car.health > 30 ? PALETTE.hudGood : PALETTE.hudBad;
      context.fillRect(VIEW.width - 224, VIEW.height - 56, 200 * Math.max(0, car.health / 100), 10);
    } else {
      text('WASD move · Shift run · E car · F punch · Click shoot · Q save · P pause', 24, VIEW.height - 24, 14, PALETTE.hudMuted, 'left');
    }
    drawMinimap(world);
    if (ui.muted) text('MUTED', 28, VIEW.height - 24, 14, PALETTE.hudMuted, 'left', true);
  }

  function drawMinimap(world) {
    const x0 = VIEW.width - MINIMAP.width - MINIMAP.margin;
    const y0 = MINIMAP.margin;
    const sx = MINIMAP.width / WORLD.width;
    const sy = MINIMAP.height / WORLD.height;
    context.fillStyle = 'rgba(12, 18, 26, 0.8)';
    roundRect(x0 - 6, y0 - 6, MINIMAP.width + 12, MINIMAP.height + 12, 8);
    context.fill();
    context.save();
    context.beginPath();
    context.rect(x0, y0, MINIMAP.width, MINIMAP.height);
    context.clip();
    context.fillStyle = PALETTE.minimapWater;
    context.fillRect(x0, y0, MINIMAP.width, MINIMAP.height);
    context.fillStyle = PALETTE.grass;
    context.fillRect(x0, y0, MINIMAP.width, (ROADS.beachY / WORLD.height) * MINIMAP.height);
    context.fillStyle = PALETTE.minimapPark;
    for (const park of world.city.parks) {
      context.fillRect(x0 + park.x * sx, y0 + park.y * sy, park.w * sx, park.h * sy);
    }
    context.fillStyle = PALETTE.minimapRoad;
    for (const avenue of ROADS.avenues) context.fillRect(x0 + (avenue - ROAD_HALF) * sx, y0, ROADS.width * sx, (ROADS.beachY / WORLD.height) * MINIMAP.height);
    for (const street of ROADS.streets) context.fillRect(x0, y0 + (street - ROAD_HALF) * sy, MINIMAP.width, ROADS.width * sy);
    const objective = world.missions.objective();
    if (objective) {
      context.fillStyle = PALETTE.minimapBlip;
      context.beginPath();
      context.arc(x0 + objective.x * sx, y0 + objective.y * sy, 5, 0, Math.PI * 2);
      context.fill();
    }
    for (const car of world.cars) {
      if (car.kind === 'police') {
        context.fillStyle = PALETTE.minimapCop;
        context.fillRect(x0 + car.x * sx - 2, y0 + car.y * sy - 2, 4, 4);
      }
    }
    // The camera's view, then the player.
    context.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    context.lineWidth = 1;
    context.strokeRect(x0 + (camera.x - VIEW.width / 2) * sx, y0 + (camera.y - VIEW.height / 2) * sy, VIEW.width * sx, VIEW.height * sy);
    context.fillStyle = PALETTE.minimapPlayer;
    context.beginPath();
    context.arc(x0 + world.player.x * sx, y0 + world.player.y * sy, 4, 0, Math.PI * 2);
    context.fill();
    context.restore();
    text('SOLARA BAY', x0 + MINIMAP.width / 2, y0 + MINIMAP.height + 20, 12, PALETTE.hudMuted, 'center', true);
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 32;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    roundRect(x, y, width, height, 14);
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    roundRect(x, y, width, height, 14);
    context.stroke();
    text(title, VIEW.width / 2, y + 64, 44, accent || PALETTE.title, 'center', true);
    lines.forEach((line, i) => {
      text(line, VIEW.width / 2, y + 112 + i * 32, 19, PALETTE.hudMuted, 'center');
    });
    text(prompt, VIEW.width / 2, y + height - 30, 20, PALETTE.hudGold, 'center', true);
  }

  function drawTitle(world, ui) {
    drawPanel('SOLARA BAY', [
      'A sun-soaked open-world crime story.',
      world.missions.story,
      'Steal cars. Lose the cops. Finish all five jobs.',
      'WASD move · E enter a car · F punch · Click to shoot · Q save',
      ui.hasSave ? `Best haul so far: $${ui.best.toLocaleString('en-US')}` : 'No save yet — a new story starts on the street.',
    ], ui.hasSave ? 'Enter — New game · C — Continue' : 'Press Enter or click to start');
  }

  /** Paint one frame: the world through the camera, then the HUD or a panel. */
  function draw(world, screen, ui, dt) {
    time += dt;
    // The camera eases after the player and stays inside the city.
    const targetX = Math.min(Math.max(world.player.x, VIEW.width / 2), WORLD.width - VIEW.width / 2);
    const targetY = Math.min(Math.max(world.player.y, VIEW.height / 2), WORLD.height - VIEW.height / 2);
    camera.x += (targetX - camera.x) * Math.min(1, dt * 5);
    camera.y += (targetY - camera.y) * Math.min(1, dt * 5);

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    context.save();
    context.translate(VIEW.width / 2 - camera.x, VIEW.height / 2 - camera.y);
    drawGround(world);
    drawBuildings(world);
    drawDistrictLabels(world);
    drawPickups(world);
    drawMarker(world);
    const flash = Math.floor(time * 2.4) % 2 === 0;
    for (const car of world.cars) drawCar(car, car === world.playerCar, flash);
    for (const ped of world.peds) drawPed(ped);
    drawPlayer(world);
    drawEffects(world);
    drawOffscreenArrow(world);
    context.restore();

    if (screen === SCREEN_TITLE) {
      drawTitle(world, ui);
      return;
    }
    drawHud(world, ui);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The city waits for no one — except right now.', 'Q saves your progress. M mutes the sound.'], 'Press P to keep playing');
    } else if (screen === SCREEN_OVER) {
      const busted = world.overKind === 'busted';
      drawPanel(busted ? 'BUSTED' : 'WASTED', [
        busted ? 'The cops dragged Dana out of the car.' : 'Dana did not make it out of Solara Bay.',
        `Cash kept: $${world.state.cash.toLocaleString('en-US')} · Jobs done: ${world.state.missionsDone}`,
        'The crew will not wait forever.',
      ], 'Press Enter to try again');
    } else if (screen === SCREEN_WIN) {
      drawPanel('SOLARA BAY IS YOURS', [
        'All five jobs done. The debt is paid.',
        `Final haul: $${world.state.cash.toLocaleString('en-US')}`,
        'Dana Reyes walks away clean — for now.',
      ], 'Press Enter to play again');
    }
  }

  /** Convert a mouse point in CSS pixels to world coordinates. */
  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const lx = ((clientX - rect.left) / rect.width) * VIEW.width;
    const ly = ((clientY - rect.top) / rect.height) * VIEW.height;
    return { x: lx - VIEW.width / 2 + camera.x, y: ly - VIEW.height / 2 + camera.y };
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToWorld, camera };
}
