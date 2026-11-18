// All sound is synthesised with WebAudio — no audio files, no network. A low oscillator
// hums for the engine and rises with speed, a two-tone wail runs while the cops are after
// you, and short blips cover punches, shots, pickups and mission jingles. Sound starts on
// the first user gesture, as browsers require, and M mutes it.

export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return;
    started = true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(context.destination);
      engineOsc.start();
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(context.destination);
      sirenOsc.start();
    } catch {
      context = null;
    }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!context || muted) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, context.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + dur);
    gain.gain.setValueAtTime(vol, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + dur);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + dur);
  }

  return {
    /** Call on the first gesture; safe to call any time. */
    unlock() {
      ensure();
      if (context && context.state === 'suspended') context.resume();
    },
    /** Engine hum: speed01 is 0..1, on is false on foot. */
    engine(speed01, on) {
      if (!context || muted) return;
      engineOsc.frequency.value = 48 + speed01 * 130;
      engineGain.gain.value = on ? 0.03 + speed01 * 0.035 : 0;
    },
    /** The police wail, on while wanted and cops are near. */
    siren(on) {
      if (!context || muted) return;
      if (on && !sirenTimer) {
        let high = true;
        sirenTimer = window.setInterval(() => {
          if (!context) return;
          sirenOsc.frequency.value = high ? 950 : 660;
          high = !high;
        }, 420);
        sirenGain.gain.value = 0.028;
      } else if (!on && sirenTimer) {
        window.clearInterval(sirenTimer);
        sirenTimer = null;
        sirenGain.gain.value = 0;
      }
    },
    punch() {
      tone(180, 0.09, 'square', 0.12, 90);
    },
    shot() {
      tone(1400, 0.12, 'square', 0.1, 220);
    },
    crash() {
      tone(90, 0.25, 'sawtooth', 0.16, 45);
    },
    pickup() {
      tone(660, 0.1, 'sine', 0.12);
      window.setTimeout(() => tone(990, 0.14, 'sine', 0.12), 90);
    },
    jingle() {
      [523, 659, 784, 1047].forEach((freq, i) => window.setTimeout(() => tone(freq, 0.18, 'triangle', 0.12), i * 110));
    },
    busted() {
      [392, 330, 262].forEach((freq, i) => window.setTimeout(() => tone(freq, 0.22, 'triangle', 0.12), i * 160));
    },
    toggleMute() {
      muted = !muted;
      if (engineGain) engineGain.gain.value = 0;
      if (sirenGain) sirenGain.gain.value = 0;
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
