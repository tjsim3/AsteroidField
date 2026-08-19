/* =====================================================
   sound.js - tiny retro sound effects via the Web Audio API.
   No audio files: every effect is synthesised on the fly, so
   the game stays fully self-contained (file:// friendly).
   The "Sound Effects" toggle in Settings gates everything.
   ===================================================== */

window.SFX = (function () {
  "use strict";

  let ctx = null;
  let master = null;
  let volume = 0.8;          // 0 = muted, 1 = full blast
  let laserNodes = null;     // live oscillator nodes while the laser beam hums

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume * 1.15;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
      return false;
    }
    return true;
  }

  /* Call on the first user gesture - some browsers only let
     audio start after the player clicks or taps something. */
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume();
  }

  /* 0 = muted, 1 = full. Set by the Sound slider in Settings. */
  function setVolume(v) {
    volume = Math.max(0, Math.min(1, Number(v) || 0));
    if (master) master.gain.setTargetAtTime(volume * 1.15, ctx.currentTime, 0.02);
  }

  /* A short pitch-bended tone (most of the blips/dings). */
  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!ctx || volume <= 0) return;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /* White-noise whoosh (explosions, thuds) shaped by a lowpass filter. */
  function noise(dur, vol, filterFreq, delay) {
    if (!ctx || volume <= 0) return;
    const t0 = ctx.currentTime + (delay || 0);
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = filterFreq || 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
  }

  function shoot() {
    tone(880, 0.09, "square", 0.08, 240);
  }

  /* Pitch depends on the asteroid's size (big = deeper). */
  function boom(size) {
    const min = size === "big" ? 70 : (size === "med" ? 105 : 150);
    const d = size === "big" ? 0.34 : (size === "med" ? 0.26 : 0.18);
    noise(d, 0.34, 700);
    tone(min, d, "triangle", 0.17, 30);
  }

  function hurt() {
    noise(0.3, 0.32, 500);
    tone(180, 0.35, "sawtooth", 0.16, 60);
  }

  function coin() {
    tone(1180, 0.07, "square", 0.08);
    tone(1568, 0.16, "square", 0.08, null, 0.07);
  }

  function power() {
    tone(660, 0.11, "triangle", 0.14, 880);
    tone(880, 0.13, "triangle", 0.12, 1320, 0.08);
  }

  /* Weapon-specific power-up jingles - a super-deep boom for rockets, a
     bright energy sweep for the laser, rat-a-tat for rapid fire, etc. */
  function gunRockets() {
    noise(0.9, 0.55, 200);                 // long, low rumble
    tone(52, 0.85, "sine", 0.32, 20);      // very deep boom
    tone(110, 0.4, "triangle", 0.16, 40, 0.08);
  }

  function gunLaser() {
    tone(1300, 0.15, "sawtooth", 0.13, 3200);   // charging sweep up
    tone(2600, 0.14, "square", 0.1, 900, 0.03); // sharp energy crack
  }

  function gunShotgun() {
    noise(0.13, 0.3, 800);
    noise(0.3, 0.34, 450, 0.09);               // second barrel, deeper
    tone(150, 0.32, "triangle", 0.14, 55);
  }

  function gunRapidfire() {
    tone(960, 0.05, "square", 0.09, 620);
    tone(1040, 0.05, "square", 0.09, 660, 0.05);
    tone(1120, 0.05, "square", 0.09, 700, 0.1);
  }

  function gunShock() {
    tone(2200, 0.09, "sawtooth", 0.12, 600);
    tone(1800, 0.1, "sawtooth", 0.1, 380, 0.05);
    tone(2400, 0.12, "square", 0.09, 500, 0.1);
  }

  /* Per-shot fire sounds for the guns (rapid fire keeps the normal blip).
     These play on trigger; the equip jingles above stay for the pickups. */
  function gunLaserFire() {
    tone(1400, 0.18, "sawtooth", 0.13, 3200);   // beam ignition sweep
    tone(800, 0.25, "square", 0.08, 300, 0.03); // low hum tail
  }

  function gunShotgunFire() {
    noise(0.16, 0.32, 650);
    tone(160, 0.16, "triangle", 0.14, 70);
  }

  function gunRocketsFire() {
    noise(0.35, 0.3, 900);                     // launch whoosh
    tone(180, 0.25, "sawtooth", 0.12, 520);    // rising thrust
  }

  function gunShockFire() {
    tone(2000, 0.09, "sawtooth", 0.11, 500);
    tone(2600, 0.1, "square", 0.08, 800, 0.02);
  }

  /* Continuous hum while the laser beam is held. Call laserHum() when the
     beam turns on and laserHumStop() when it releases - both are safe to
     call repeatedly. A low square sub-oscillator adds body, and an LFO
     wobbles the filter cutoff so it sounds alive. */
  function laserHum() {
    if (!ensure()) return;
    if (volume <= 0 || laserNodes) return;
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = 950;
    sub.type = "square";
    sub.frequency.value = 55;
    lfo.type = "sine";
    lfo.frequency.value = 6;
    lfoG.gain.value = 180;                // wobbles the filter cutoff
    f.type = "lowpass";
    f.frequency.value = 2200;
    f.Q.value = 2;
    g.gain.value = 0;
    lfo.connect(lfoG);
    lfoG.connect(f.frequency);
    osc.connect(f);
    sub.connect(f);
    f.connect(g);
    g.connect(master);
    g.gain.setTargetAtTime(0.05, ctx.currentTime, 0.03);
    osc.start();
    sub.start();
    lfo.start();
    laserNodes = { osc: osc, sub: sub, lfo: lfo, g: g };
  }

  function laserHumStop() {
    if (!laserNodes) return;
    laserNodes.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    const t = ctx.currentTime + 0.4;
    try {
      laserNodes.osc.stop(t);
      laserNodes.sub.stop(t);
      laserNodes.lfo.stop(t);
    } catch (e) {}
    laserNodes = null;
  }

  function heal() {
    tone(520, 0.12, "sine", 0.16, 660);
    tone(660, 0.12, "sine", 0.14, 780, 0.09);
    tone(780, 0.22, "sine", 0.13, 1040, 0.18);
  }

  function slowMo() {
    tone(320, 0.4, "sine", 0.15, 80);
  }

  function zap() {
    tone(1500, 0.08, "sawtooth", 0.1, 300);
    tone(2400, 0.12, "square", 0.08, 600, 0.03);
  }

  function bigBoom() {
    noise(0.6, 0.45, 500);
    tone(90, 0.6, "triangle", 0.24, 28);
  }

  /* A heavier, deeper blast for rocket impacts - the lighter bigBoom stays
     for screen clears. */
  function rocketBoom() {
    noise(0.85, 0.6, 400);
    tone(85, 0.7, "triangle", 0.4, 22);
    tone(58, 0.6, "sine", 0.35, 16, 0.03);
  }

  function over() {
    tone(440, 0.25, "square", 0.13, 220);
    tone(330, 0.25, "square", 0.13, 165, 0.22);
    tone(220, 0.5, "square", 0.12, 110, 0.44);
  }

  function click() {
    tone(620, 0.05, "square", 0.06, 900);
  }

  function unlockFx() {
    tone(784, 0.1, "triangle", 0.12);
    tone(988, 0.1, "triangle", 0.12, null, 0.09);
    tone(1319, 0.25, "triangle", 0.14, null, 0.18);
  }

  return {
    unlock, setVolume, shoot, boom, hurt, coin, power, heal,
    slowMo, zap, bigBoom, rocketBoom, over, click, unlockFx,
    gunLaser, gunShotgun, gunRockets, gunRapidfire, gunShock,
    gunLaserFire, gunShotgunFire, gunRocketsFire, gunShockFire,
    laserHum, laserHumStop
  };
})();