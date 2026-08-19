/* =====================================================
   effects.js - particle explosions, floating text and
   screen shake for a bit of extra juice.
   ===================================================== */

window.FX = (function () {

  const particles = [];   // {x,y,vx,vy,life,maxLife,size,color}
  const texts = [];       // floating text: {x,y,vy,life,text,color,size}
  const bolts = [];       // shock-chain lightning: {pts, life, maxLife}
  let shake = 0;          // remaining screen-shake strength
  let shakeEnabled = true;
  let fxEnabled = true;

  function setShake(on) {
    shakeEnabled = on;
    if (!on) shake = 0;
  }

  function setFx(on) {
    fxEnabled = on;
    if (!on) particles.length = 0;
  }

  function addShake(amount) {
    if (!shakeEnabled) return;
    shake = Math.min(shake + amount, 24);
  }

  function getShake() {
    return shakeEnabled ? shake : 0;
  }

  /* Spawn a burst of square/round particles. */
  function burst(x, y, count, colors, speedMin, speedMax, sizeMin, sizeMax) {
    if (!fxEnabled) return;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      const life = 0.4 + Math.random() * 0.6;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: life,
        maxLife: life,
        size: sizeMin + Math.random() * (sizeMax - sizeMin),
        color: colors[(Math.random() * colors.length) | 0]
      });
    }
  }

  /* A star-shaped sparkle (uses the explosion image if available). */
  function explosion(x, y) {
    if (!fxEnabled) return;
    burst(x, y, 26, ["#ffe93a", "#ff9300", "#ffffff", "#ff4d4d", "#e0ff00"],
      40, 260, 3, 7);
    // Bigger debris chunks
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 140;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5,
        maxLife: 0.5,
        size: 4 + Math.random() * 6,
        color: "#7a7a7a"
      });
    }
    addShake(6);
  }

  function healFx(x, y) {
    burst(x, y, 14, ["#39ff5a", "#c9ffe9", "#ffffff"], 30, 150, 2, 5);
  }

  /* Big firey blast for a rocket impact. */
  function rocketExplode(x, y) {
    if (!fxEnabled) return;
    burst(x, y, 56, ["#ff9300", "#ff4d4d", "#ffe93a", "#ffd700", "#ffffff"], 50, 430, 4, 11);
    burst(x, y, 26, ["#ffffff", "#ffd28a"], 20, 200, 2, 7);
    addShake(13);
  }

  /* Jagged chain-lightning bolt between two points. */
  function lightning(x1, y1, x2, y2) {
    const pts = [{ x: x1, y: y1 }];
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / len, ny = dx / len;
    const seg = 6;
    for (let i = 1; i < seg; i++) {
      const t = i / seg;
      pts.push({
        x: x1 + dx * t + nx * (Math.random() - 0.5) * 16,
        y: y1 + dy * t + ny * (Math.random() - 0.5) * 16
      });
    }
    pts.push({ x: x2, y: y2 });
    bolts.push({ pts, life: 0.3, maxLife: 0.3 });
  }

  function pickupFx(x, y, color) {
    burst(x, y, 12, [color, "#ffffff"], 30, 160, 2, 5);
  }

  function muzzleFlash(x, y) {
    burst(x, y, 4, ["#fff6c9", "#ffb347"], 20, 80, 2, 4);
  }

  /* Text that pops up and drifts upward ("+$20", "+1 Life"...). */
  function floatText(x, y, text, color, size) {
    texts.push({
      x, y,
      vy: -55,
      life: 1.1,
      maxLife: 1.1,
      text: text,
      color: color || "#ffffff",
      size: size || 18
    });
  }

  /* Advance every effect's lifetime. */
  function update(dt) {
    if (fxEnabled) {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= (1 - 1.6 * dt);
        p.vy *= (1 - 1.6 * dt);
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
      }
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.y += t.vy * dt;
      t.vy *= (1 - 1.2 * dt);
      t.life -= dt;
      if (t.life <= 0) texts.splice(i, 1);
    }
    for (let i = bolts.length - 1; i >= 0; i--) {
      bolts[i].life -= dt;
      if (bolts[i].life <= 0) bolts.splice(i, 1);
    }
    if (shake > 0) shake = Math.max(0, shake - 40 * dt);
  }

  /* Draw all particles and floating text onto the context. */
  function draw(ctx) {
    if (fxEnabled) {
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        // square bits read better on screen than circles
        const s = p.size * (0.5 + 0.5 * p.life / p.maxLife);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    }

    for (const t of texts) {
      const alpha = Math.max(0, t.life / t.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = t.color;
      ctx.font = "900 " + t.size + "px Segoe UI, Arial, sans-serif";
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.lineWidth = 4;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;

    // chain-lightning bolts
    for (const bl of bolts) {
      const a = Math.max(0, bl.life / bl.maxLife);
      ctx.globalAlpha = a;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#6ff0ff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(bl.pts[0].x, bl.pts[0].y);
      for (let i = 1; i < bl.pts.length; i++) ctx.lineTo(bl.pts[i].x, bl.pts[i].y);
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(bl.pts[0].x, bl.pts[0].y);
      for (let i = 1; i < bl.pts.length; i++) ctx.lineTo(bl.pts[i].x, bl.pts[i].y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function clear() {
    particles.length = 0;
    texts.length = 0;
    bolts.length = 0;
    shake = 0;
  }

  return {
    burst, explosion, healFx, pickupFx, muzzleFlash, floatText,
    lightning, rocketExplode,
    update, draw, clear, addShake, getShake, setShake, setFx
  };
})();