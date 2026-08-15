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

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume * 0.85;
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
    if (master) master.gain.setTargetAtTime(volume * 0.85, ctx.currentTime, 0.02);
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
  function noise(dur, vol, filterFreq) {
    if (!ctx || volume <= 0) return;
    const t0 = ctx.currentTime;
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

  function heal() {
    tone(520, 0.12, "sine", 0.16, 660);
    tone(660, 0.12, "sine", 0.14, 780, 0.09);
    tone(780, 0.22, "sine", 0.13, 1040, 0.18);
  }

  function slowMo() {
    tone(320, 0.4, "sine", 0.15, 80);
  }

  function bigBoom() {
    noise(0.6, 0.45, 500);
    tone(90, 0.6, "triangle", 0.24, 28);
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
    slowMo, bigBoom, over, click, unlockFx
  };
})();