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

  // per-run breakdown for the game-over screen
  let runStats = {
    bulletsFired: 0,
    asteroidsDestroyed: 0,
    asteroidsByBullets: 0,
    cashBills: 0,        // $ from dollar-bill pickups
    cashWrecks: 0,       // $ from destroyed asteroids
    cashBonus: 0,        // $ from full-health pickups
    scoreSurvival: 0,
    scoreAsteroids: 0,
    pickups: { money: 0, reload: 0, health: 0, slow: 0, shrink: 0, clear: 0 }
  };

  // ---------- entities ----------
  let players = [];
  let twoPlayer = false;   // true during a 2-player run (throws extra rocks)
  let bullets = [];
  let asteroids = [];
  let powerups = [];

  // ---------- timers / status ----------
  let slowT = 0;
  let shrinkT = 0;
  let spawnCd = 1;
  let powerupCd = 2.5;
  let lastScore = -1;
  let lastOpts = {};       // the options the current run was started with

  // ---------- background ----------
  let bgStars = [];
  let bgBlobs = [];

  // ---------- input ----------
  function key(keyName) {
    return INPUT.keys[keyName] === true;
  }

  // true if any of the given key names is held down
  function keysDown(names) {
    for (let i = 0; i < names.length; i++) {
      if (INPUT.keys[names[i]] === true) return true;
    }
    return false;
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
  function startRun(opts) {
    if (opts === undefined) opts = lastOpts;   // Play Again keeps the same mode
    lastOpts = opts || {};
    twoPlayer = !!opts.two;
    const save = SAVE.load();

    // skin config picked on the 2P setup screen (falls back to equipped gear)
    const cfg = opts.cfg || {};
    const p1c = cfg.p1 || {};
    const p2c = cfg.p2 || {};

    // Never let a locked skin sneak in - only unlocked skins are allowed.
    const resolveSkin = function (cat, id) {
      if (id && (save.owned[cat] || []).indexOf(id) > -1) return id;
      return save.equipment[cat];
    };

    const mkPlayer = function (ship, boost, bullet, ctrl, name, color, y) {
      return {
        x: Math.max(130, W * 0.16),
        y: y,
        r: 20,
        maxHealth: G.maxHealth,
        health: G.maxHealth,
        ammo: G.startAmmo,
        pitch: 0,          // eased ship rotation in degrees (nose up = negative)
        wobble: 0,         // extra chaotic rotation after a hit
        wobbleT: 0,        // seconds of wobble left
        knockVy: 0,        // vertical knockback impulse after a hit
        knockT: 0,         // seconds of knockback left
        invulnT: 0,        // seconds of invulnerability left
        fireCd: 0,         // seconds before the next shot is allowed
        trail: [],         // ghost clones streaming off the back of the ship
        ctrl: ctrl,        // which keys move / fire this player
        ship: ship,        // this player's ship skin
        boost: boost,      // this player's boost trail skin
        bullet: bullet,    // this player's shot skin
        name: name,        // short tag shown above the ship in 2P
        color: color,      // color of the tag + HUD label
        damageTaken: 0,    // how many times this player got hit (for the end screen)
        diedAt: null,      // runTime (seconds) when this player went down, null if alive
        bulletsFired: 0    // for the end screen
      };
    };

    // P1 lives on the left side of the keyboard (W/S + Shift).
    // In solo they can also use the arrow keys; in 2P the keys are split.
    const p1Up = twoPlayer ? ["w"] : ["w", "arrowup"];
    const p1Down = twoPlayer ? ["s"] : ["s", "arrowdown"];
    const p1Shoot = twoPlayer ? ["shift"] : ["shift", " "];
    const p1Ship = resolveSkin("ship", p1c.ship);
    const p1Boost = resolveSkin("boost", p1c.boost);
    const p1Bullet = resolveSkin("bullet", p1c.bullet);

    players = [
      mkPlayer(p1Ship, p1Boost, p1Bullet, { up: p1Up, down: p1Down, shoot: p1Shoot }, "P1", "#6ea8ff", H * 0.35)
    ];
    if (twoPlayer) {
      players.push(
        mkPlayer(
          resolveSkin("ship", p2c.ship),
          resolveSkin("boost", p2c.boost),
          resolveSkin("bullet", p2c.bullet),
          { up: ["arrowup"], down: ["arrowdown"], shoot: [" "] },
          "P2", "#ff6ac1", H * 0.62
        )
      );
    }

    bullets = [];
    asteroids = [];
    powerups = [];

    runTime = 0;
    score = 0;
    runCash = 0;
    runStats = {
      bulletsFired: 0,
      asteroidsDestroyed: 0,
      asteroidsByBullets: 0,
      cashBills: 0,
      cashWrecks: 0,
      cashBonus: 0,
      scoreSurvival: 0,
      scoreAsteroids: 0,
      pickups: { money: 0, reload: 0, health: 0, slow: 0, shrink: 0, clear: 0 }
    };

    slowT = 0;
    shrinkT = 0;
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
  // A player with 0 health is "down". The run only ends when EVERYONE is down.
  function allPlayersDown() {
    for (let pi = 0; pi < players.length; pi++) {
      if (players[pi].health > 0) return false;
    }
    return true;
  }

  function update(dt) {
    // Always validate - if every ship is out, the run must end right now.
    if (allPlayersDown()) {
      gameOver();
      return;
    }

    runTime += dt;

    // ---- timers (per-player ones tick inside the movement loop) ----
    slowT = Math.max(0, slowT - dt);
    shrinkT = Math.max(0, shrinkT - dt);

    // ---- score over time ----
    score += G.scorePerSecond * dt;
    runStats.scoreSurvival += G.scorePerSecond * dt;

    // ---- moving the players ----
    const pauseKey = key("escape");

    if (pauseKey && state === STATE.PLAYING) {
      togglePause();
      delete INPUT.keys.escape;   // so holding it doesn't instantly re-pause
    }

    const speed = G.playerSpeed;

    for (let pi = 0; pi < players.length; pi++) {
      const p = players[pi];
      if (p.health <= 0) continue;   // downed ships don't move, shoot or glow

      const up = keysDown(p.ctrl.up);
      const down = keysDown(p.ctrl.down);
      const shoot = keysDown(p.ctrl.shoot);

      if (up) p.y -= speed * dt;
      if (down) p.y += speed * dt;

      // knockback from a hit - an impulse that eases out
      if (p.knockT > 0) {
        p.knockT -= dt;
        p.y += p.knockVy * dt;
        p.knockVy *= Math.exp(-dt * 6);
      }
      p.y = Math.max(p.r, Math.min(H - p.r, p.y));

      // per-player status timers
      p.invulnT = Math.max(0, p.invulnT - dt);
      p.fireCd = Math.max(0, p.fireCd - dt);

      // ---- ship pitch ----
      // The ship tilts ~30deg toward the held direction; the angle eases to the
      // target so the transition reads as smooth instead of a snap.
      const pitchTarget = (up ? -30 : 0) + (down ? 30 : 0);
      p.pitch += (pitchTarget - p.pitch) * (1 - Math.exp(-dt / 0.055));

      // ---- hit wobble ----
      // After a hit the rotation bobs back and forth, decaying to calm.
      if (p.wobbleT > 0) {
        p.wobbleT -= dt;
        p.wobble = Math.sin(runTime * 30) * 55 * Math.max(0, p.wobbleT) / 0.5;
      } else {
        p.wobble = 0;
      }

      // ---- player trail (always on) ----
      // Ghost clones stream off the back of the ship, angled opposite the nose.
      const butt = ((180 + p.pitch + p.wobble) * Math.PI) / 180;
      const trailSpeed = 620;
      p.trail.push({
        x: p.x + Math.cos(butt) * 22,
        y: p.y + Math.sin(butt) * 22,
        vx: Math.cos(butt) * trailSpeed,
        vy: Math.sin(butt) * trailSpeed,
        rot: (butt * 180) / Math.PI
      });
      if (p.trail.length > 18) p.trail.shift();

      const trailMul = (slowT > 0 ? 0.35 : 1);
      for (let i = p.trail.length - 1; i >= 0; i--) {
        p.trail[i].x += p.trail[i].vx * trailMul * dt;
        p.trail[i].y += p.trail[i].vy * trailMul * dt;
        if (p.trail[i].x < -40 || p.trail[i].y < -60 || p.trail[i].y > H + 60) p.trail.splice(i, 1);
      }

      // ---- shooting ----
      if (shoot && p.ammo > 0 && p.fireCd <= 0) {
        fire(p);
      }
    }

    // ---- spawning ----
    // Two players put a lot more lead in the air, so throw extra rocks at them.
    spawnCd -= dt;
    if (spawnCd <= 0) {
      spawnAsteroid();
      // sometimes a burst of two, so the action feels fast
      if (Math.random() < (twoPlayer ? 0.55 : 0.35)) spawnAsteroid();
      if (twoPlayer && Math.random() < 0.2) spawnAsteroid();
      const difficulty = Math.max(0.3, 1.0 - runTime * 0.012);
      spawnCd = difficulty * (0.55 + Math.random() * 0.5) * (twoPlayer ? 0.55 : 1);
    }

    powerupCd -= dt;
    if (powerupCd <= 0) {
      spawnPowerup();
      // drops arrive a little faster as the run gets tougher
      const t = Math.min(1, runTime / 90);
      powerupCd = (2.8 + Math.random() * 2.2) * (1 - t * 0.35);
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

      // player collision (only when not invulnerable) - hits ANY alive ship
      for (let pi = 0; pi < players.length; pi++) {
        const pl = players[pi];
        if (pl.health <= 0) continue;   // already down - the wreck can't be hit again
        if (pl.invulnT <= 0 && circleHit(pl.x, pl.y, playerRadius(pl), a.x, a.y, a.r)) {
          hitPlayer(i, pl);
          break;   // the rock is gone, stop checking the other ships
        }
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
      for (let pi = 0; pi < players.length; pi++) {
        const pl = players[pi];
        if (pl.health <= 0) continue;   // only alive ships can grab drops
        if (circleHit(pl.x, pl.y, playerRadius(pl) + 10, p.x, p.y, 22)) {
          collectPowerup(p, pl);
          powerups.splice(i, 1);
          break;
        }
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
  function fire(p) {
    p.ammo--;
    p.fireCd = G.fireCooldown;
    p.bulletsFired++;
    runStats.bulletsFired++;

    // Each skin is already drawn as a pair of bullets, so one shot is enough.
    bullets.push({
      x: p.x + 26,
      y: p.y,
      vx: 1050,
      r: 24,
      hits: 0,
      skin: p.bullet   // this player's chosen shot skin
    });
    FX.muzzleFlash(p.x + 24, p.y);
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
    runStats.asteroidsDestroyed++;
    runStats.scoreAsteroids += a.size.score;
    if (!fromClear) {
      runCash += a.size.money;
      runStats.cashWrecks += a.size.money;
      runStats.asteroidsByBullets++;
    }

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
  function playerRadius(p) {
    return p.r * (shrinkT > 0 ? 0.58 : 1);
  }

  function hitPlayer(ai, p) {
    const a = asteroids[ai];
    asteroids.splice(ai, 1);

    p.health--;
    p.damageTaken++;
    p.invulnT = 1.3;
    FX.explosion(p.x, p.y);
    FX.addShake(14);
    FX.floatText(p.x, p.y - 30, "-1", "#ff4d6d", 22);

    if (p.health <= 0) {
      // Ship is down but survives the run - the game only stops when all are.
      p.diedAt = runTime;
    } else {
      // knock the player in the direction the asteroid was travelling,
      // then let the ship's rotation bob back and forth (looks chaotic)
      const dir = Math.abs(a.vy) > 20 ? (a.vy > 0 ? 1 : -1) : (Math.random() < 0.5 ? -1 : 1);
      p.knockVy = dir * 300;
      p.knockT = 0.45;
      p.wobbleT = 0.5;
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
    // Money is the common drop early on, but fades as the run drags
    // on so the useful power-ups start showing up more late-game.
    const t = Math.min(1, runTime / 90);
    const moneyW = Math.max(1, Math.round(4 - t * 3));
    const pool = [];
    for (let k = 0; k < moneyW; k++) pool.push("money");
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

  function collectPowerup(pwr, pl) {
    const save = SAVE.load();
    const f = PFX[pwr.id] || { color: "#ffffff", msg: "" };

    FX.pickupFx(pwr.x, pwr.y, f.color);
    FX.addShake(2);

    if (pwr.id === "money") {
      const gain = G.moneyPerBill;
      runCash += gain;
      score += gain;
      runStats.cashBills += gain;
      runStats.pickups.money++;
      FX.floatText(pwr.x, pwr.y - 16, "+$" + gain, "#ffe93a", 19);
    } else if (pwr.id === "reload") {
      pl.ammo = Math.min(G.maxAmmo, pl.ammo + 3);
      runStats.pickups.reload++;
      FX.floatText(pwr.x, pwr.y - 16, f.msg, f.color, 17);
    } else if (pwr.id === "health") {
      if (pl.health < pl.maxHealth) {
        pl.health++;
        runStats.pickups.health++;
        FX.healFx(pwr.x, pwr.y);
        FX.floatText(pwr.x, pwr.y - 16, f.msg, f.color, 17);
      } else {
        runCash += 10;
        runStats.cashBonus += 10;
        FX.floatText(pwr.x, pwr.y - 16, "Full +$10", "#ffe93a", 16);
      }
    } else if (pwr.id === "slow") {
      slowT = G.slowMoDuration;
      runStats.pickups.slow++;
      FX.floatText(pwr.x, pwr.y - 16, f.msg, f.color, 18);
    } else if (pwr.id === "shrink") {
      shrinkT = 6;
      runStats.pickups.shrink++;
      FX.floatText(pwr.x, pwr.y - 16, f.msg, f.color, 18);
    } else if (pwr.id === "clear") {
      // Wipe every asteroid off the board in one glorious blast
      const remaining = asteroids.slice();
      asteroids.length = 0;
      remaining.forEach(function (a) {
        score += a.size.score;
        runStats.asteroidsDestroyed++;
        runStats.scoreAsteroids += a.size.score;
        FX.explosion(a.x, a.y);
      });
      runStats.pickups.clear++;
      FX.floatText(pwr.x, pwr.y - 16, f.msg, f.color, 22);
      FX.addShake(10);
    }

    // lifetime collection stat
    if (pwr.id !== "money") {
      save.stats.collector = (save.stats.collector || 0) + 1;
    }
    SAVE.save();
  }

  // =====================================================
  //  GAME OVER
  // =====================================================
  function gameOver() {
    // Guarded so a second hit in the same frame (both ships in 2P) can't
    // pay the run out twice.
    if (state === STATE.OVER) return;
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
    const st = runStats;
    const kps = st.bulletsFired > 0 ? (st.asteroidsByBullets / st.bulletsFired) : 0;

    // one little stat card per player (time up, damage taken, shots fired)
    let playerCards = "";
    players.forEach(function (p) {
      const alive = p.diedAt == null ? runTime : p.diedAt;
      playerCards +=
        '<div class="player-stat">' +
          '<div class="player-stat-head" style="color:' + p.color + '">' + p.name + '</div>' +
          '<div class="player-stat-row"><span>TIME ALIVE</span><span>' + fmtTime(alive) + '</span></div>' +
          '<div class="player-stat-row"><span>SHOTS FIRED</span><span>' + p.bulletsFired + '</span></div>' +
          '<div class="player-stat-row"><span>DAMAGE TAKEN</span><span>' + p.damageTaken + '</span></div>' +
        '</div>';
    });

    document.getElementById("gameover-stats").innerHTML =
      '<div>Time Survived: ' + fmtTime(runTime) + '</div>' +
      '<div>Score: ' + Math.round(score) + '</div>' +
      '<div>Total Money Earned: <span class="money">' + UI.fmt(runCash) + '</span></div>' +
      '<div>Best Score: ' + save.stats.bestScore + '</div>' +
      (newBest ? '<div class="new-best">NEW BEST SCORE!</div>' : "") +

      '<div class="gameover-section">Money Breakdown</div>' +
      '<div class="gameover-grid">' +
        '<div><span>From Dollar Bills</span><span class="money">' + UI.fmt(st.cashBills) + '</span></div>' +
        '<div><span>From Asteroid Wrecks</span><span class="money">' + UI.fmt(st.cashWrecks) + '</span></div>' +
        '<div><span>From Full-Health Bonus</span><span class="money">' + UI.fmt(st.cashBonus) + '</span></div>' +
      '</div>' +

      '<div class="gameover-section">Score Breakdown</div>' +
      '<div class="gameover-grid">' +
        '<div><span>From Survival</span><span>' + Math.round(st.scoreSurvival) + '</span></div>' +
        '<div><span>From Asteroids</span><span>' + Math.round(st.scoreAsteroids) + '</span></div>' +
        '<div><span>From Dollar Bills</span><span>' + st.cashBills + '</span></div>' +
      '</div>' +

      '<div class="gameover-section">Combat</div>' +
      '<div class="gameover-grid">' +
        '<div><span>Shots Fired</span><span>' + st.bulletsFired + '</span></div>' +
        '<div><span>Asteroids Destroyed</span><span>' + st.asteroidsDestroyed + '</span></div>' +
        '<div><span>Blasted by Your Shots</span><span>' + st.asteroidsByBullets + '</span></div>' +
        '<div><span>Kills Per Shot</span><span>' + kps.toFixed(2) + '</span></div>' +
      '</div>' +

      '<div class="gameover-section">Collectibles</div>' +
      '<div class="gameover-grid">' +
        '<div><span>Dollar Bills</span><span>' + st.pickups.money + '</span></div>' +
        '<div><span>Reload Packs</span><span>' + st.pickups.reload + '</span></div>' +
        '<div><span>Health Packs</span><span>' + st.pickups.health + '</span></div>' +
        '<div><span>Slow-Mo</span><span>' + st.pickups.slow + '</span></div>' +
        '<div><span>Shrink</span><span>' + st.pickups.shrink + '</span></div>' +
        '<div><span>Screen Clears</span><span>' + st.pickups.clear + '</span></div>' +
      '</div>' +

      '<div class="gameover-players">' + playerCards + '</div>';

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
    for (const b of bullets) {
      // Each bullet remembers which player fired it, so the skins can differ.
      const bDef = DATA.bullets.find(function (x) { return x.id === b.skin; }) || DATA.bullets[0];
      const bulletImg = ASSETS.get(bDef ? bDef.src : "");
      const bNatW = bulletImg ? bulletImg.width || 30 : 30;
      const bNatH = bulletImg ? bulletImg.height || 30 : 30;
      // Each skin says which rotation makes it point right (see data.js).
      const bRot = bDef ? bDef.rot : -90;
      const bs = 44 / Math.max(bNatW, bNatH);
      drawImg(bulletImg, b.x, b.y, bNatW * bs, bNatH * bs, bRot);
    }

    // ---- player trails (always on) ----
    players.forEach(function (p) {
      if (p.health <= 0) return;   // downed ships leave no trail
      if (!p.trail.length) return;
      const trailImg = ASSETS.get(ASSETS_SRC(p.boost));
      p.trail.forEach(function (t, i) {
        const alpha = ((i + 1) / p.trail.length) * 0.5;
        ctx.globalAlpha = alpha;
        if (trailImg) {
          drawImg(trailImg, t.x, t.y, 46, 46, t.rot);
        } else {
          ctx.fillStyle = "#ffe93a";
          ctx.beginPath();
          ctx.arc(t.x, t.y, 10, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    });
    ctx.globalAlpha = 1;

    // ---- player ships + name tags ----
    players.forEach(function (p) {
      const dead = p.health <= 0;
      const shipImg = ASSETS.get(ASSETS_SRC(p.ship));
      const scale = shrinkT > 0 ? 0.58 : 1;
      const shipW = 54 * scale;
      const shipH = (shipImg && shipImg.height ? 54 * (shipImg.height / shipImg.width) : 38) * scale;

      if (!dead) {
        const blink = p.invulnT > 0 && Math.floor(runTime * 12) % 2 === 0;
        if (!blink) {
          drawSprite(ASSETS_SRC(p.ship), p.x, p.y, shipW, shipH, p.pitch + p.wobble);
        }
      }

      // name tag above the ship (both players in 2P, none in solo)
      if (players.length > 1) {
        ctx.save();
        ctx.textAlign = "center";
        ctx.font = "bold 13px sans-serif";
        ctx.shadowColor = "#000000";
        ctx.shadowBlur = 4;
        ctx.fillStyle = dead ? "#8a8a8a" : p.color;
        ctx.fillText(dead ? p.name + " OUT" : p.name, p.x, p.y - shipH / 2 - 12);
        ctx.restore();
      }

      // shrink ring so the player can see their smaller hitbox
      if (!dead && shrinkT > 0) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, playerRadius(p), 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,233,58,0.7)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

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
    const scoreEl = document.getElementById("hud-score");
    const moneyEl = document.getElementById("hud-money");
    const playersHost = document.getElementById("hud-players");

    if (!players.length) return;

    // Rebuild the roster block only when a health / ammo value actually changed.
    const rosterKey = players.map(function (p) {
      return p.name + "|" + p.health + "|" + p.maxHealth + "|" + p.ammo;
    }).join(";;");
    if (playersHost._key !== rosterKey) {
      playersHost._key = rosterKey;
      let html = "";
      players.forEach(function (p, pi) {
        const dead = p.health <= 0;
        const labelColor = dead ? "#8a8a8a" : p.color;
        const label = p.name + (dead ? " OUT" : "");
        let hearts = "";
        for (let i = 0; i < p.maxHealth; i++) {
          hearts += i < p.health ? '<span class="on">\u2665</span>' : '<span class="off">\u2665</span>';
        }
        let ammo = "";
        for (let i = 0; i < G.maxAmmo; i++) {
          const dim = dead || i >= p.ammo;
          ammo += '<img class="ammo-dot' + (dim ? " dim" : "") + '" src="' + DATA.hud.bulletDot + '">';
        }
        html +=
          '<div class="hud-row">' +
            '<span class="hud-name" style="color:' + labelColor + '">' + label + '</span>' +
            '<span class="hearts">' + hearts + '</span>' +
          '</div>' +
          '<div class="hud-row">' +
            '<span class="hud-name hud-name-blank"></span>' +
            '<span class="ammo">' + ammo + '</span>' +
          '</div>' +
          '<div class="hud-player-status" id="hud-player-status-' + pi + '"></div>';
      });
      playersHost.innerHTML = html;
    }

    // one status bar per player, refreshed every frame
    players.forEach(function (p, pi) {
      const chip = document.getElementById("hud-player-status-" + pi);
      if (!chip) return;
      const bits = [];
      if (p.health <= 0) bits.push("OUT");
      if (p.invulnT > 0) bits.push("INVULNERABLE");
      if (shrinkT > 0) bits.push("SHRUNK " + shrinkT.toFixed(1) + "s");
      if (slowT > 0) bits.push("SLOW " + slowT.toFixed(1) + "s");
      chip.textContent = bits.join("  |  ");
      chip.classList.toggle("out", p.health <= 0);
    });

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