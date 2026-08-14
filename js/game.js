/* =====================================================
   game.js - the main game engine (canvas)

   Everything that happens INSIDE a run lives here:
   the player ship, the asteroids, the bullets, the
   power-up drops, the scrolling background and the HUD.
   ===================================================== */

window.Game = (function () {

  const G = DATA.GAME;

  // ---------- canvas ----------
  let canvas, ctx;
  let W = 0, H = 0;

  // ---------- state ----------
  const STATE = { MENU: "menu", PLAYING: "playing", PAUSED: "paused", OVER: "over" };
  let state = STATE.MENU;

  let runTime = 0;
  let score = 0;
  let runCash = 0;            // money collected this run
  let damageTaken = 0;

  // ---------- entities ----------
  let player = null;
  let bullets = [];
  let asteroids = [];
  let powerups = [];

  // ---------- timers / status ----------
  let slowT = 0;
  let shrinkT = 0;
  let invulnT = 0;
  let fireCd = 0;
  let spawnCd = 1;
  let powerupCd = 2.5;
  let lastAmmo = -1;      // cached so the HUD only re-renders on change
  let lastScore = -1;

  // player trail ghosts (always visible - makes the ship look like it's moving)
  let trail = [];

  // ---------- background ----------
  let bgStars = [];
  let bgBlobs = [];

  // ---------- input ----------
  function key(keyName) {
    return INPUT.keys[keyName] === true;
  }

  // =====================================================
  //  SETUP
  // =====================================================
  function init() {
    canvas = document.getElementById("game-canvas");
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
  }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * devicePixelRatio;      // crisp on hi-dpi screens
    canvas.height = H * devicePixelRatio;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    buildBackground();
  }

  /* ---------------- MOVING BACKGROUND ---------------- */
  function buildBackground() {
    const save = SAVE.load();
    const bg = DATA.backgrounds.find(function (b) { return b.id === save.equipment.background; }) || DATA.backgrounds[0];

    // Stars: pre-generate with a random x,y + layer speed
    bgStars = [];
    bg.stars.forEach(function (layer) {
      for (let i = 0; i < layer.count; i++) {
        bgStars.push({
          x: Math.random() * W,
          y: Math.random() * H,
          size: layer.size[0] + Math.random() * (layer.size[1] - layer.size[0]),
          speed: layer.speed[0] + Math.random() * (layer.speed[1] - layer.speed[0]),
          baseColor: layer.colors[(Math.random() * layer.colors.length) | 0],
          twinkle: Math.random() * Math.PI * 2
        });
      }
    });

    // Soft nebula blobs drifting behind everything
    bgBlobs = [];
    for (let i = 0; i < 5; i++) {
      bgBlobs.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 120 + Math.random() * 220,
        drift: 15 + Math.random() * 35,
        alpha: 0.06 + Math.random() * 0.09
      });
    }
  }

  function drawBackground(dt) {
    const save = SAVE.load();
    const bg = DATA.backgrounds.find(function (b) { return b.id === save.equipment.background; }) || DATA.backgrounds[0];

    // Sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, bg.skyTop);
    grad.addColorStop(1, bg.skyBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Nébula blobs
    const speedMul = (slowT > 0 ? 0.35 : 1);
    for (const b of bgBlobs) {
      b.x -= b.drift * speedMul * dt;
      if (b.x + b.r < 0) b.x = W + b.r;
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, bg.accent + "33");          // hex + alpha
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.globalAlpha = b.alpha;
      ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
    }
    ctx.globalAlpha = 1;

    // Stars (scrolling left = "moving background")
    for (const s of bgStars) {
      s.x -= s.speed * speedMul * dt;
      if (s.x < -2) {
        s.x = W + 2;
        s.y = Math.random() * H;
      }
      const tw = 0.55 + 0.45 * Math.sin(runTime * 2 + s.twinkle);
      ctx.globalAlpha = tw;
      ctx.fillStyle = s.baseColor;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    ctx.globalAlpha = 1;
  }

  // =====================================================
  //  START / STOP
  // =====================================================
  function startRun() {
    player = {
      x: Math.max(130, W * 0.16),
      y: H / 2,
      r: 20,
      maxHealth: G.maxHealth,
      health: G.maxHealth,
      ammo: G.startAmmo,
      pitch: 0,          // eased ship rotation in degrees (nose up = negative)
      wobble: 0,         // extra chaotic rotation after a hit
      wobbleT: 0,        // seconds of wobble left
      knockVy: 0,        // vertical knockback impulse after a hit
      knockT: 0          // seconds of knockback left
    };

    bullets = [];
    asteroids = [];
    powerups = [];
    trail = [];

    runTime = 0;
    score = 0;
    runCash = 0;
    damageTaken = 0;

    slowT = 0;
    shrinkT = 0;
    invulnT = 0;
    fireCd = 0;
    spawnCd = 1.2;
    powerupCd = 2.5;

    state = STATE.PLAYING;
    document.getElementById("gameover-overlay").classList.add("hidden");
    document.getElementById("pause-overlay").classList.add("hidden");

    buildBackground();
    FX.clear();
    updateHUD();
  }

  function exitToMenu() {
    state = STATE.MENU;
    FX.clear();
    SAVE.save();
  }

  function togglePause() {
    if (state === STATE.PLAYING) {
      state = STATE.PAUSED;
      document.getElementById("pause-overlay").classList.remove("hidden");
    } else if (state === STATE.PAUSED) {
      state = STATE.PLAYING;
      document.getElementById("pause-overlay").classList.add("hidden");
    }
  }

  // =====================================================
  //  GAME LOOP
  // =====================================================
  let last = 0;

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;

    if (state === STATE.PLAYING) {
      update(dt);
    }

    // Effects always tick so explosions fade and the screen stops shaking.
    FX.update(dt);

    if (state === STATE.PLAYING || state === STATE.PAUSED || state === STATE.OVER) {
      render(dt);
    }
  }

  // =====================================================
  //  UPDATE
  // =====================================================
  function update(dt) {
    // Always validate the player's health - if it is ever 0 or below,
    // the run must end right now (no matter how it got there).
    if (!player || player.health <= 0) {
      gameOver();
      return;
    }

    runTime += dt;

    // ---- timers ----
    slowT = Math.max(0, slowT - dt);
    shrinkT = Math.max(0, shrinkT - dt);
    invulnT = Math.max(0, invulnT - dt);
    fireCd = Math.max(0, fireCd - dt);

    // ---- score over time ----
    score += G.scorePerSecond * dt;

    // ---- moving the player ----
    const up = key("arrowup") || key("w");
    const down = key("arrowdown") || key("s");
    const shoot = key(" ");
    const pauseKey = key("escape");

    if (pauseKey && state === STATE.PLAYING) {
      togglePause();
      delete INPUT.keys.escape;   // so holding it doesn't instantly re-pause
    }

    const speed = G.playerSpeed;
    if (up) player.y -= speed * dt;
    if (down) player.y += speed * dt;

    // knockback from a hit - an impulse that eases out
    if (player.knockT > 0) {
      player.knockT -= dt;
      player.y += player.knockVy * dt;
      player.knockVy *= Math.exp(-dt * 6);
    }
    player.y = Math.max(player.r, Math.min(H - player.r, player.y));

    // ---- ship pitch ----
    // The ship tilts ~30deg toward the held direction; the angle eases to the
    // target so the transition reads as smooth instead of a snap.
    const pitchTarget = (up ? -30 : 0) + (down ? 30 : 0);
    player.pitch += (pitchTarget - player.pitch) * (1 - Math.exp(-dt / 0.055));

    // ---- hit wobble ----
    // After a hit the rotation bobs back and forth, decaying to calm.
    if (player.wobbleT > 0) {
      player.wobbleT -= dt;
      player.wobble = Math.sin(runTime * 30) * 55 * Math.max(0, player.wobbleT) / 0.5;
    } else {
      player.wobble = 0;
    }

    // ---- player trail (always on) ----
    // Ghost clones stream off the back of the ship, angled opposite the nose.
    const butt = ((180 + player.pitch + player.wobble) * Math.PI) / 180;
    const trailSpeed = 620;
    trail.push({
      x: player.x + Math.cos(butt) * 22,
      y: player.y + Math.sin(butt) * 22,
      vx: Math.cos(butt) * trailSpeed,
      vy: Math.sin(butt) * trailSpeed,
      rot: (butt * 180) / Math.PI
    });
    if (trail.length > 18) trail.shift();

    const trailMul = (slowT > 0 ? 0.35 : 1);
    for (let i = trail.length - 1; i >= 0; i--) {
      trail[i].x += trail[i].vx * trailMul * dt;
      trail[i].y += trail[i].vy * trailMul * dt;
      if (trail[i].x < -40 || trail[i].y < -60 || trail[i].y > H + 60) trail.splice(i, 1);
    }

    // ---- shooting ----
    if (shoot && player.ammo > 0 && fireCd <= 0) {
      fire();
    }

    // ---- spawning ----
    spawnCd -= dt;
    if (spawnCd <= 0) {
      spawnAsteroid();
      // sometimes a burst of two, so the action feels fast
      if (Math.random() < 0.35) spawnAsteroid();
      const difficulty = Math.max(0.3, 1.0 - runTime * 0.012);
      spawnCd = difficulty * (0.55 + Math.random() * 0.5);
    }

    powerupCd -= dt;
    if (powerupCd <= 0) {
      spawnPowerup();
      powerupCd = 2.8 + Math.random() * 2.2;
    }

    // ---- bullets ----
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt;
      if (b.x > W + 40) {
        bullets.splice(i, 1);
        continue;
      }
      hitsAsteroid(i, b);
    }

    // ---- asteroids ----
    const slowMul = slowT > 0 ? 0.5 : 1;
    for (let i = asteroids.length - 1; i >= 0; i--) {
      const a = asteroids[i];
      a.x += a.vx * slowMul * dt;
      a.y += a.vy * slowMul * dt;
      a.rot += a.rotSpeed * dt;

      // bounce off the top and bottom walls
      if (a.y - a.r < 0) { a.y = a.r; a.vy = Math.abs(a.vy); }
      if (a.y + a.r > H) { a.y = H - a.r; a.vy = -Math.abs(a.vy); }

      if (a.x < -a.r - 10) {
        asteroids.splice(i, 1);
        continue;
      }

      // player collision (only when not invulnerable)
      if (invulnT <= 0 && circleHit(player.x, player.y, playerRadius(), a.x, a.y, a.r)) {
        hitPlayer(i);
      }
    }

    // ---- power-ups ----
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.x += p.vx * slowMul * dt;
      p.t += dt;
      p.y = p.baseY + Math.sin(p.t * 2.4) * 22;   // gentle bobbing

      if (p.x < -50) {
        powerups.splice(i, 1);
        continue;
      }
      if (circleHit(player.x, player.y, playerRadius() + 10, p.x, p.y, 22)) {
        collectPowerup(p);
        powerups.splice(i, 1);
      }
    }

    // ---- achievements tied to time / round score ----
    if (score >= 250) UI.unlock("round_250");
    if (score >= 750) UI.unlock("round_750");

    // lifetime play time (for the 2h / 10h achievements)
    const saveT = SAVE.load();
    saveT.stats.totalTime += dt;
    if (saveT.stats.totalTime >= 7200) UI.unlock("play_2h");
    if (saveT.stats.totalTime >= 36000) UI.unlock("play_10h");
    SAVE.save();

    // ---- HUD ----
    updateHUD();
  }

  function hitsAsteroid(bi, b) {
    for (let ai = 0; ai < asteroids.length; ai++) {
      const a = asteroids[ai];
      if (circleHit(b.x, b.y, b.r, a.x, a.y, a.r)) {
        // bullets punch straight through every rock until they leave the screen
        destroyAsteroid(a, false);
        return;
      }
    }
  }

  // =====================================================
  //  FIRING
  // =====================================================
  function fire() {
    player.ammo--;
    fireCd = G.fireCooldown;

    // Each skin is already drawn as a pair of bullets, so one shot is enough.
    bullets.push({
      x: player.x + 26,
      y: player.y,
      vx: 1050,
      r: 9,
      hits: 0
    });
    FX.muzzleFlash(player.x + 24, player.y);
  }

  // =====================================================
  //  ASTEROIDS
  // =====================================================
  const ASTEROID_SIZES = [
    { key: "big", r: 34, speed: 160, score: 25, money: 3 },
    { key: "med", r: 22, speed: 225, score: 15, money: 2 },
    { key: "small", r: 13, speed: 300, score: 8, money: 1 }
  ];

  function spawnAsteroid() {
    // pick a size - later in the run smaller/faster rocks appear more
    const t = Math.min(1, runTime / 90);
    const roll = Math.random();
    let size;
    if (roll < 0.38) size = ASTEROID_SIZES[0];
    else if (roll < 0.38 + 0.38 * (1 - t * 0.4)) size = ASTEROID_SIZES[1];
    else size = ASTEROID_SIZES[2];

    const yIn = 30 + Math.random() * Math.max(1, H - 60);
    const vy = (Math.random() - 0.5) * 120;

    const vxAsteroid = size.speed * (0.85 + Math.random() * 0.4) * G.asteroidSpeedMul;
    asteroids.push({
      x: W + size.r,
      y: Math.max(size.r, Math.min(H - size.r, yIn)),
      r: size.r,
      size: size,
      vx: -vxAsteroid,
      vy: vy,
      rot: 0,
      rotSpeed: (Math.random() - 0.5) * 2.2
    });
  }

  /* Destroy an asteroid (by bullet or by the screen-clear drop). */
  function destroyAsteroid(a, fromClear) {
    const save = SAVE.load();
    const idx = asteroids.indexOf(a);
    if (idx > -1) asteroids.splice(idx, 1);

    score += a.size.score;
    if (!fromClear) runCash += a.size.money;

    // explosions everywhere
    FX.explosion(a.x, a.y);
    FX.floatText(a.x, a.y - 14, "+" + a.size.score, "#8fd0ff", 15);

    // big rocks break into two mediums, mediums into two smalls
    if (!fromClear) {
      const childKey = a.size.key === "big" ? "med" : (a.size.key === "med" ? "small" : null);
      if (childKey) {
        const child = ASTEROID_SIZES.find(function (s) { return s.key === childKey; });
        for (const side of [-1, 1]) {
          asteroids.push({
            x: a.x + side * child.r,
            y: a.y + (Math.random() - 0.5) * child.r,
            r: child.r,
            size: child,
            vx: -child.speed * (0.8 + Math.random() * 0.4) * G.asteroidSpeedMul,
            vy: side * (30 + Math.random() * 60),
            rot: Math.random() * 6,
            rotSpeed: (Math.random() - 0.5) * 3
          });
        }
      }
    }

    // lifetime stats + achievements
    save.stats.asteroidsDestroyed++;
    if (save.stats.asteroidsDestroyed >= 1000) UI.unlock("destroy_1000");
    if (save.stats.asteroidsDestroyed >= 10000) UI.unlock("destroy_10000");
    SAVE.save();
  }

  // =====================================================
  //  HITTING THE PLAYER
  // =====================================================
  function playerRadius() {
    return player.r * (shrinkT > 0 ? 0.58 : 1);
  }

  function hitPlayer(ai) {
    const a = asteroids[ai];
    asteroids.splice(ai, 1);

    player.health--;
    damageTaken++;
    invulnT = 1.3;
    FX.explosion(player.x, player.y);
    FX.addShake(14);
    FX.floatText(player.x, player.y - 30, "-1", "#ff4d6d", 22);

    if (player.health <= 0) {
      gameOver();
    } else {
      // knock the player in the direction the asteroid was travelling,
      // then let the ship's rotation bob back and forth (looks chaotic)
      const dir = Math.abs(a.vy) > 20 ? (a.vy > 0 ? 1 : -1) : (Math.random() < 0.5 ? -1 : 1);
      player.knockVy = dir * 300;
      player.knockT = 0.45;
      player.wobbleT = 0.5;
    }
  }

  // =====================================================
  //  POWER-UPS
  // =====================================================
  const PFX = {
    reload: { color: "#39ff5a", msg: "+3 Bullets" },
    health: { color: "#ff6a8a", msg: "+1 Life" },
    slow: { color: "#b06bff", msg: "Slow-Mo!" },
    shrink: { color: "#ffe93a", msg: "Shrunk!" },
    clear: { color: "#ff9300", msg: "SCREEN CLEAR!" }
  };

  function spawnPowerup() {
    const pool = ["money"];
    DATA.powerups.forEach(function (p) {
      // weight controls how often a drop spawns (reload shows up more)
      const w = p.weight || 1;
      for (let k = 0; k < w; k++) pool.push(p.id);
    });

    const id = pool[(Math.random() * pool.length) | 0];

    const iconSrc =
      id === "money" ? "AsteroidsAndPowerups/Money.svg" : DATA.dropIcons[id];

    powerups.push({
      id: id,
      icon: iconSrc,
      x: W + 60,
      baseY: 50 + Math.random() * Math.max(1, H - 100),
      y: 0,
      vx: -170 - Math.random() * 60,
      t: Math.random() * 6
    });
  }

  function collectPowerup(p) {
    const save = SAVE.load();
    const f = PFX[p.id] || { color: "#ffffff", msg: "" };

    FX.pickupFx(p.x, p.y, f.color);
    FX.addShake(2);

    if (p.id === "money") {
      const gain = G.moneyPerBill;
      runCash += gain;
      score += gain;
      FX.floatText(p.x, p.y - 16, "+$" + gain, "#ffe93a", 19);
    } else if (p.id === "reload") {
      player.ammo = Math.min(G.maxAmmo, player.ammo + 3);
      FX.floatText(p.x, p.y - 16, f.msg, f.color, 17);
    } else if (p.id === "health") {
      if (player.health < player.maxHealth) {
        player.health++;
        FX.healFx(p.x, p.y);
        FX.floatText(p.x, p.y - 16, f.msg, f.color, 17);
      } else {
        runCash += 10;
        FX.floatText(p.x, p.y - 16, "Full +$10", "#ffe93a", 16);
      }
    } else if (p.id === "slow") {
      slowT = 6;
      FX.floatText(p.x, p.y - 16, f.msg, f.color, 18);
    } else if (p.id === "shrink") {
      shrinkT = 6;
      FX.floatText(p.x, p.y - 16, f.msg, f.color, 18);
    } else if (p.id === "clear") {
      // Wipe every asteroid off the board in one glorious blast
      const remaining = asteroids.slice();
      asteroids.length = 0;
      remaining.forEach(function (a) {
        score += a.size.score;
        FX.explosion(a.x, a.y);
      });
      FX.floatText(p.x, p.y - 16, f.msg, f.color, 22);
      FX.addShake(10);
    }

    // lifetime collection stat
    if (p.id !== "money") {
      save.stats.collector = (save.stats.collector || 0) + 1;
    }
    SAVE.save();
  }

  // =====================================================
  //  GAME OVER
  // =====================================================
  function gameOver() {
    const save = SAVE.load();

    // pay out the cash earned this run
    save.money += runCash;
    save.stats.lifetimeMoney += runCash;
    save.stats.lifetimeScore += Math.round(score);
    save.stats.runsPlayed++;

    if (score > save.stats.bestScore) save.stats.bestScore = Math.round(score);
    if (runTime > save.stats.bestTime) save.stats.bestTime = runTime;

    // round-count and lifetime-score achievements
    if (save.stats.runsPlayed >= 5) UI.unlock("rounds_5");
    if (save.stats.runsPlayed >= 50) UI.unlock("rounds_50");
    if (save.stats.lifetimeScore >= 1000000) UI.unlock("total_1m");
    SAVE.save();

    // show the overlay with this run's numbers
    const newBest = score >= save.stats.bestScore && score > 0;
    document.getElementById("gameover-stats").innerHTML =
      '<div>Time Survived: ' + fmtTime(runTime) + '</div>' +
      '<div>Score: ' + Math.round(score) + '</div>' +
      '<div>Money Earned: <span class="money">' + UI.fmt(runCash) + '</span></div>' +
      '<div>Best Score: ' + save.stats.bestScore + '</div>' +
      (newBest ? '<div class="new-best">NEW BEST SCORE!</div>' : "");

    state = STATE.OVER;
    document.getElementById("gameover-overlay").classList.remove("hidden");
    updateHUD();
  }

  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  // =====================================================
  //  RENDER
  // =====================================================
  function render(dt) {
    const save = SAVE.load();

    // screen shake offset
    const sh = FX.getShake();
    const ox = (Math.random() - 0.5) * sh;
    const oy = (Math.random() - 0.5) * sh;

    ctx.save();
    ctx.translate(ox, oy);

    drawBackground(dt);

    // ---- power-ups ----
    for (const p of powerups) {
      drawSprite(p.icon, p.x, p.y, 34, 34, 0);
    }

    // ---- asteroids ----
    for (const a of asteroids) {
      const w = a.r * 2;
      const h = a.r * 2;
      drawSprite(DATA.SPREAD.asteroid, a.x, a.y, w, h, (a.rot * 180) / Math.PI);
    }

    // ---- bullets ----
    const bulletImg = ASSETS.get(ASSETS_SRC(save.equipment.bullet));
    const bNatW = bulletImg ? bulletImg.width || 30 : 30;
    const bNatH = bulletImg ? bulletImg.height || 30 : 30;
    for (const b of bullets) {
      // Each skin says which rotation makes it point right (see data.js).
      const bDef = DATA.bullets.find(function (x) { return x.id === save.equipment.bullet; });
      const bRot = bDef ? bDef.rot : -90;
      const s = 44 / Math.max(bNatW, bNatH);
      drawImg(bulletImg, b.x, b.y, bNatW * s, bNatH * s, bRot);
    }

    // ---- player trail (always on) ----
    if (trail.length) {
      const trailImg = ASSETS.get(ASSETS_SRC(save.equipment.boost));
      trail.forEach(function (t, i) {
        const alpha = ((i + 1) / trail.length) * 0.5;
        if (trailImg) {
          ctx.globalAlpha = alpha;
          drawImg(trailImg, t.x, t.y, 46, 46, t.rot);
        } else {
          ctx.globalAlpha = alpha;
          ctx.fillStyle = "#ffe93a";
          ctx.beginPath();
          ctx.arc(t.x, t.y, 10, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1;
    }

    // ---- player ship ----
    const shipImg = ASSETS.get(ASSETS_SRC(save.equipment.ship));
    const shipW = 54 * (shrinkT > 0 ? 0.58 : 1);
    const shipH = (shipImg && shipImg.height ? 54 * (shipImg.height / shipImg.width) : 38) * (shrinkT > 0 ? 0.58 : 1);
    const blink = invulnT > 0 && Math.floor(runTime * 12) % 2 === 0;
    if (!blink) {
      drawSprite(ASSETS_SRC(save.equipment.ship), player.x, player.y, shipW, shipH, player.pitch + player.wobble);
    }

    // shrink ring so the player can see their smaller hitbox
    if (shrinkT > 0) {
      ctx.beginPath();
      ctx.arc(player.x, player.y, playerRadius(), 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,233,58,0.7)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // ---- effects on top ----
    FX.draw(ctx);

    ctx.restore();
  }

  /* Resolve the image source for an equipment entry. */
  function ASSETS_SRC(equipId) {
    const all =
      DATA.ships.concat(DATA.bullets).concat(DATA.trails);
    const found = all.find(function (x) { return x.id === equipId; });
    return found ? found.src : "";
  }

  function drawSprite(src, x, y, w, h, rotDeg) {
    const img = ASSETS.get(src);
    if (!img) return;
    ctx.save();
    ctx.translate(x, y);
    if (rotDeg) ctx.rotate((rotDeg * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function drawImg(img, x, y, w, h, rotDeg) {
    if (!img) return;
    ctx.save();
    ctx.translate(x, y);
    if (rotDeg) ctx.rotate((rotDeg * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // =====================================================
  //  HUD
  // =====================================================
  function updateHUD() {
    const heartsEl = document.getElementById("hud-hearts");
    const ammoEl = document.getElementById("hud-ammo");
    const scoreEl = document.getElementById("hud-score");
    const moneyEl = document.getElementById("hud-money");
    const statusEl = document.getElementById("hud-status");

    if (!player) return;

    let hearts = "";
    for (let i = 0; i < player.maxHealth; i++) {
      hearts += i < player.health ? '<span class="on">&#9829;</span>' : '<span class="off">&#9829;</span>';
    }
    heartsEl.innerHTML = hearts;

    // ammo: one bullet image per shell
    const ammoVal = player.ammo;
    if (ammoVal !== lastAmmo) {
      lastAmmo = ammoVal;
      ammoEl.innerHTML = "";
      for (let i = 0; i < G.maxAmmo; i++) {
        const img = document.createElement("img");
        img.src = DATA.hud.bulletDot;
        img.className = "ammo-dot";
        if (i >= ammoVal) img.classList.add("dim");
        ammoEl.appendChild(img);
      }
    }

    // score: one digit image per character
    const scoreVal = Math.round(score);
    if (scoreVal !== lastScore) {
      lastScore = scoreVal;
      scoreEl.innerHTML = "";
      String(scoreVal).split("").forEach(function (d) {
        const img = document.createElement("img");
        img.src = DATA.hud.digitFiles[d] || DATA.hud.digitFiles["0"];
        img.alt = d;
        scoreEl.appendChild(img);
      });
    }

    moneyEl.textContent = "$" + runCash;

    let status = [];
    if (slowT > 0) status.push("SLOW " + slowT.toFixed(1) + "s");
    if (shrinkT > 0) status.push("SHRUNK " + shrinkT.toFixed(1) + "s");
    if (invulnT > 0) status.push("INVULNERABLE");
    statusEl.textContent = status.join("  |  ");
  }

  // =====================================================
  //  HELPERS
  // =====================================================
  function circleHit(x1, y1, r1, x2, y2, r2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    const rr = r1 + r2;
    return dx * dx + dy * dy <= rr * rr;
  }

  return {
    init,
    loop,
    startRun,
    exitToMenu,
    togglePause,
    updateHUD,
    isOver: function () { return state === STATE.OVER; },
    isInGame: function () { return state === STATE.PLAYING || state === STATE.PAUSED; }
  };
})();