/* =====================================================
   game.js - the main game engine (canvas)

   Everything that happens INSIDE a run lives here:
   the player ship, the asteroids, the bullets, the
   power-up drops, the scrolling background and the HUD.
   ===================================================== */

window.Game = (function () {

  const G = DATA.GAME;

  // ---------- permanent shop upgrades (effective values this run) ----------
  let eff = {
    maxHealth: G.maxHealth,
    startAmmo: G.startAmmo,
    maxAmmo: G.maxAmmo,
    gunDropInterval: 60
  };

  /* Re-read the save's purchased upgrades into `eff`. Called at the top of
     every startRun so a mid-session purchase applies from the next run on. */
  function refreshUpgrades() {
    const u = SAVE.load().upgrades || {};
    const maxAmmo = DATA.UPGRADES.storage.value(u.storage || 0);
    eff.maxHealth = DATA.UPGRADES.hearts.value(u.hearts || 0);
    eff.startAmmo = Math.min(maxAmmo, DATA.UPGRADES.startAmmo.value(u.startAmmo || 0));
    eff.maxAmmo = maxAmmo;
    eff.gunDropInterval = DATA.UPGRADES.gunDrop.value(u.gunDrop || 0);
  }

  // ---------- canvas ----------
  let canvas, ctx;
  let W = 0, H = 0;

  // ---------- state ----------
  const STATE = { MENU: "menu", PLAYING: "playing", PAUSED: "paused", OVER: "over" };
  let state = STATE.MENU;

  let runTime = 0;
  let score = 0;
  let runCash = 0;            // money collected this run
  let runStartAchCount = null; // achievements owned when this run began (for XP)

  // per-run breakdown for the game-over screen
  let runStats = {
    bulletsFired: 0,
    asteroidsDestroyed: 0,
    asteroidsByBullets: 0,
    maxCombo: 0,          // highest combo a single bullet reached this run
    comboTotal: 0,        // combo values added up (a x13 and a x7 = +20)
    comboKills: 0,        // asteroids hit by bullets already on a combo (&ge;2)
    cashBills: 0,        // $ from dollar-bill pickups
    cashWrecks: 0,       // $ from destroyed asteroids
    cashBonus: 0,        // $ from full-health pickups
    scoreSurvival: 0,
    scoreAsteroids: 0,
    pickups: {
      money: 0, reload: 0, health: 0, slow: 0, shrink: 0, clear: 0, shield: 0,
      laser: 0, shotgun: 0, rockets: 0, rapidfire: 0, shock: 0
    }
  };

  // ---------- entities ----------
  let players = [];
  let twoPlayer = false;   // true during a 2-player run (throws extra rocks)
  let bullets = [];
  let asteroids = [];
  let powerups = [];
  let comboGhosts = [];    // faded combo labels that outlive their bullet (3s)
  let shockChains = [];    // active chain-lightning: hops rock to rock with tiny pauses

  // ---------- timers / status ----------
  let slowT = 0;
  let shrinkT = 0;
  let spawnCd = 1;
  let powerupCd = 2.5;
  let healCd = 30;        // seconds until the next automatic +1 life
  let healsDone = 0;      // completed auto-heals (each one adds 1s to the gap)
  let gunCd = 60;         // seconds until the next gun powerup drifts by
  let lastScore = -1;
  let lastOpts = {};       // the options the current run was started with
  let bulletId = 0;        // stable id per bullet (drives combo list keys & pulse)

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
    wireXpCheat();
  }

  /* ---------------- XP CHEAT: type "expe" on the level screen ----------------
     Fills the XP bar all the way to level 100 (queueing every level reward),
     so the reward track / skins can be tested without grinding. */
  let cheatBuf = "";
  function wireXpCheat() {
    document.addEventListener("keydown", function (e) {
      const ov = document.getElementById("rewards-overlay");
      if (!ov || ov.classList.contains("hidden")) { cheatBuf = ""; return; }
      if (/^[a-z]$/i.test(e.key)) {
        cheatBuf = (cheatBuf + e.key.toLowerCase()).slice(-4);
        if (cheatBuf === "expe") {
          cheatBuf = "";
          fillXpCheat();
        }
      }
    });
  }

  function fillXpCheat() {
    const s = SAVE.load();
    s.xp = s.xp || { level: 1, current: 0 };
    if (s.xp.level >= XP.MAX_LEVEL) return;
    let total = XP.toNext(s.xp.level) - (s.xp.current || 0);
    for (let l = s.xp.level + 1; l < XP.MAX_LEVEL; l++) total += XP.toNext(l);
    const res = XP.gain(s, total);
    s.pendingRewards = s.pendingRewards || [];
    res.levelUps.forEach(function (u) {
      const at = s.pendingRewards.findIndex(function (p) { return p.level === u.level; });
      if (at >= 0) s.pendingRewards[at].reward += u.reward;
      else s.pendingRewards.push({ level: u.level, reward: u.reward });
    });
    SAVE.save();
    buildRewardsScreen();
    if (window.UI && UI.notify) UI.notify("Cheat: all XP filled - Level " + s.xp.level + " reached!");
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
    refreshUpgrades();

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
        maxHealth: eff.maxHealth,
        health: eff.maxHealth,
        shield: 0,          // temporary shield HP (0 none, 2 full, 1 cracked)
        ammo: eff.startAmmo,
        pitch: 0,          // eased ship rotation in degrees (nose up = negative)
        wobble: 0,         // extra chaotic rotation after a hit
        wobbleT: 0,        // seconds of wobble left
        knockVy: 0,        // vertical knockback impulse after a hit
        knockT: 0,         // seconds of knockback left
        invulnT: 0,        // seconds of invulnerability left
        fireCd: 0,         // seconds before the next shot is allowed
        laserCd: 0,        // cooldown after the laser burns out (blocks waste-fire)
        trail: [],         // ghost clones streaming off the back of the ship
        ctrl: ctrl,        // which keys move / fire this player
        ship: ship,        // this player's ship skin
        boost: boost,      // this player's boost trail skin
        bullet: bullet,    // this player's shot skin
        name: name,        // short tag shown above the ship in 2P
        color: color,      // color of the tag + HUD label
        gun: null,         // active gun powerup id (laser/shotgun/rockets/rapidfire/shock)
        gunT: 0,           // seconds left on the current gun powerup
        rapidCd: 0,        // auto-fire interval clock while rapid fire is active
        energy: 100,       // laser-only battery; drains while the beam is held
        laserOn: false,    // whether the laser beam is firing right now
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
    comboGhosts = [];
    shockChains = [];

    runTime = 0;
    score = 0;
    runCash = 0;
    runStartAchCount = Object.keys(SAVE.load().achievements).length;
    runStats = {
      bulletsFired: 0,
      asteroidsDestroyed: 0,
      asteroidsByBullets: 0,
      maxCombo: 0,
      comboKills: 0,
      cashBills: 0,
      cashWrecks: 0,
      cashBonus: 0,
      scoreSurvival: 0,
      scoreAsteroids: 0,
      pickups: {
        money: 0, reload: 0, health: 0, slow: 0, shrink: 0, clear: 0,
        laser: 0, shotgun: 0, rockets: 0, rapidfire: 0, shock: 0
      }
    };

    slowT = 0;
    shrinkT = 0;
    spawnCd = 1.2;
    powerupCd = 2.5;
    healCd = 30;
    healsDone = 0;
    gunCd = eff.gunDropInterval;

    state = STATE.PLAYING;
    document.getElementById("gameover-overlay").classList.add("hidden");
    document.getElementById("rewards-overlay").classList.add("hidden");
    document.getElementById("pause-overlay").classList.add("hidden");

    buildBackground();
    FX.clear();
    updateHUD();
  }

  function exitToMenu() {
    document.getElementById("rewards-overlay").classList.add("hidden");
    // Roll this run's combo totals into the lifetime stats so the "total
    // combos" achievements keep progressing even when a run is quit from
    // the pause menu. On the death path gameOver() already paid the run
    // out, so only do this for live runs (state is PAUSED or PLAYING).
    const wasLiveRun = state === STATE.PLAYING || state === STATE.PAUSED;
    state = STATE.MENU;
    SFX.laserHumStop();
    FX.clear();
    if (wasLiveRun) {
      const s = SAVE.load();
      s.stats.bestCombo = Math.max(s.stats.bestCombo || 0, runStats.maxCombo);
    }
    SAVE.save();

    // Nudge the player toward the level screen if rewards are waiting.
    const pending = (SAVE.load().pendingRewards || []).length;
    if (pending > 0 && window.UI && UI.notify) {
      UI.notify("You have " + pending + " unclaimed level reward" +
        (pending > 1 ? "s" : "") + "! Click the level bar to collect.");
    }
  }

  function togglePause() {
    if (state === STATE.PLAYING) {
      state = STATE.PAUSED;
      SFX.laserHumStop();
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
      return;   // skip the rest of this frame so the hum isn't restarted
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
      p.laserCd = Math.max(0, p.laserCd - dt);

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
      // Gun powerups override the normal shots. Rapid fire is the odd one
      // out: it auto-fires for free and locks out your own ammo for a while.
      if (p.gunT > 0) p.gunT = Math.max(0, p.gunT - dt);
      if (p.gunT <= 0 && p.gun) { p.gun = null; }

      if (p.gun === "laser") {
        // Sustained beam: no bullets, no ammo - a full-width line that
        // incinerates everything in range while the trigger is held. The
        // battery drains for as long as the beam is on; at zero it's spent.
        const firing = shoot && p.gunT > 0 && p.energy > 0;
        if (firing) {
          p.energy = Math.max(0, p.energy - 12 * dt);
          if (!p.laserOn) {
            p.laserOn = true;
            SFX.gunLaserFire();
          }
          SFX.laserHum();   // idempotent - restarts itself after a pause
          beamSweep(p);
        }
        if (!firing && p.laserOn) {
          p.laserOn = false;
          SFX.laserHumStop();
        }
        if (p.energy <= 0) {
          p.laserOn = false;
          SFX.laserHumStop();
          p.gun = null;
          p.gunT = 0;
          p.laserCd = 0.8;   // brief cooldown so holding fire doesn't waste bullets
        }
      } else if (p.laserOn) {
        // gun swapped or expired mid-beam
        p.laserOn = false;
        SFX.laserHumStop();
      } else if (p.gun === "rapidfire") {
        p.rapidCd -= dt;
        if (p.rapidCd <= 0) {
          p.rapidCd = 0.09;
          fireGun(p);
        }
      } else if (shoot && p.ammo > 0 && p.fireCd <= 0 && p.laserCd <= 0) {
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
      // Mean rocks/sec = 1.6875 / difficulty (1P) and 3 / difficulty (2P).
      // The 2P interval factor 0.7291667 makes 1.75 rocks/event land exactly
      // on the 3/difficulty rate (1.75 / (0.8 * 0.7291667) = 3).
      const interval = (0.55 + Math.random() * 0.5) * (twoPlayer ? 0.7291667 : 1);
      spawnCd = difficulty() * interval;
    }

    powerupCd -= dt;
    if (powerupCd <= 0) {
      spawnPowerup();
      // drops arrive a little faster as the run gets tougher
      const t = Math.min(1, runTime / 90);
      powerupCd = (5.6 + Math.random() * 4.4) * (1 - t * 0.35);
    }

    // ---- health drop: a +1-life pickup flies by every 30s, and each drop
    //      adds one more second before the next one (30, then 31, then 32...) ----
    healCd -= dt;
    if (healCd <= 0) {
      healCd = 30 + healsDone;
      healsDone++;
      spawnHealthPickup();
    }

    // ---- gun drops: one random weapon pickup flies by every 60s ----
    gunCd -= dt;
    if (gunCd <= 0) {
      gunCd = eff.gunDropInterval;
      spawnGunPickup();
    }

    // ---- bullets ----
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt;
      if (b.vy) b.y += b.vy * dt;
      b.comboPop = Math.max(0, b.comboPop - dt);
      if (b.x > W + 40 || b.y < -80 || b.y > H + 80) {
        // keep its combo badge on screen for a slow 3-second fade-out;
        // clamp x inside the edge so the label is actually visible
        if (b.combo >= 2) {
          addComboTotal(b.combo);
          comboGhosts.push({
            x: Math.min(b.x, W - 72),
            y: b.y,
            combo: b.combo,
            t: 3,
            bid: b.bid
          });
        }
        bullets.splice(i, 1);
        continue;
      }
      hitsAsteroid(i, b);
    }

    // ---- combo ghosts: linger then fade ----
    for (let i = comboGhosts.length - 1; i >= 0; i--) {
      const g = comboGhosts[i];
      g.t -= dt;
      g.y -= 14 * dt;        // drift up a touch while it fades
      if (g.t <= 0) comboGhosts.splice(i, 1);
    }

    // ---- shock chains: hop another rock after each short buffer ----
    updateShockChains(dt);

    // ---- asteroids ----
    const slowMul = slowT > 0 ? 0.5 : 1;
    for (let i = asteroids.length - 1; i >= 0; i--) {
      const a = asteroids[i];
      a.x += a.vx * slowMul * dt;
      a.y += a.vy * slowMul * dt;
      a.rot += a.rotSpeed * dt;

      // small/medium fragments sail off the edge instead of bouncing
      if (a.size.key !== "big") {
        if (a.y < -a.r || a.y > H + a.r) {
          asteroids.splice(i, 1);
          continue;
        }
      } else {
        // big rocks bounce off the top and bottom walls
        if (a.y - a.r < 0) { a.y = a.r; a.vy = Math.abs(a.vy); }
        if (a.y + a.r > H) { a.y = H - a.r; a.vy = -Math.abs(a.vy); }
      }

      if (a.x < -a.r - 10 || a.x > W + a.r + 10) {
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
    const ROUND_ACH = [
      [500, "round_500"], [2000, "round_2000"], [5000, "round_5000"],
      [10000, "round_10000"], [25000, "round_25000"]
    ];
    ROUND_ACH.forEach(function (r) { if (score >= r[0]) UI.unlock(r[1]); });

    // lifetime play time (for the 1h / 5h achievements)
    const saveT = SAVE.load();
    saveT.stats.totalTime += dt;
    if (saveT.stats.totalTime >= 3600) UI.unlock("play_1h");
    if (saveT.stats.totalTime >= 18000) UI.unlock("play_5h");
    SAVE.save();

    // ---- HUD ----
    updateHUD();
  }

  function hitsAsteroid(bi, b) {
    for (let ai = 0; ai < asteroids.length; ai++) {
      const a = asteroids[ai];
      if (circleHit(b.x, b.y, b.r, a.x, a.y, a.r)) {
        // rockets and shock bolts detonate on the first rock they touch
        if (b.gun === "rockets") {
          b.combo = rocketBlast(b.x, b.y);
          b.comboPop = 0.15;
          if (b.combo > runStats.maxCombo) runStats.maxCombo = b.combo;
          addComboTotal(b.combo);
          bullets.splice(bi, 1);
          return;
        }
        if (b.gun === "shock") {
          startShockChain(b.x, b.y);
          bullets.splice(bi, 1);
          return;
        }
        // bullets (and laser / shotgun pellets) punch straight through
        // every rock until they leave the screen
        b.combo++;
        b.comboPop = 0.15;   // pop the combo label on the next frame
        if (b.combo > runStats.maxCombo) runStats.maxCombo = b.combo;
        if (b.combo >= 2) runStats.comboKills++;
        if (b.combo >= 2) UI.unlock("long_" + b.combo);
        destroyAsteroid(a, false);
        return;
      }
    }
  }

  /* Rocket: a big firey blast in a 300px radius around the impact. It keeps
     re-sweeping so freshly-split child asteroids inside the blast all burn
     too. Returns how many rocks it torched. */
  const ROCKET_RANGE = 300;
  function rocketBlast(x, y) {
    let killed = 0;
    for (let pass = 0; pass < 5; pass++) {
      const targets = asteroids.filter(function (a) {
        return circleHit(x, y, ROCKET_RANGE, a.x, a.y, a.r);
      });
      if (!targets.length) break;
      targets.forEach(function (a) { destroyAsteroid(a, false); });
      killed += targets.length;
    }
    FX.rocketExplode(x, y);
    FX.radiusRing(x, y, ROCKET_RANGE, "#ff7b4d");
    SFX.rocketBoom();
    return killed;
  }

  /* Shock: chain lightning. The bolt eats a rock, then - with no buffer at
   all - every rock within range of ANY struck rock is struck too. Because
   the chain branches (two rocks in range are BOTH struck, and each becomes
   a new end that reaches further), a dense screen gets hit all at once.
   Children spawn instantly when a rock is smashed, so they sit in the arena
   in time for the very next hop.
   Runs asynchronously: a chain ticks one hop per frame. */
const SHOCK_RANGE = 140;
const SHOCK_PAUSE = 0;       // no buffer: hop every frame, so children are caught ASAP
const SHOCK_MAX_HITS = 1000; // generous safety cap: with ~7 smashes per rock family
                             // (rock + 2 children + 4 grand-children) the OLD 60
                             // cap clipped mid-wave and left split-off rocks alive

function startShockChain(x, y) {
  shockChains.push({
    tips: [{ x: x, y: y }],  // frontier points; every rock in range of any tip is struck
    hit: [],                 // the asteroid objects this chain has destroyed
    delay: 0                 // countdown until the next hop
  });
}

/* Advance every active chain one tick. When a hop's buffer runs out, strike
   EVERY untapped rock in range of any tip (so the chain branches), then the
   struck rocks become the new tips - their freshly-spawned children are
   within range and get eaten on the next hop. */
function updateShockChains(dt) {
  for (let i = shockChains.length - 1; i >= 0; i--) {
    const ch = shockChains[i];
    ch.delay -= dt;
    if (ch.delay > 0) continue;

    // gather every (tip, rock) pair in range; a rock counts once even if
    // several tips can reach it
    const targets = [];
    const seen = new Set();
    for (let ti = 0; ti < ch.tips.length; ti++) {
      const tip = ch.tips[ti];
      for (let ai = 0; ai < asteroids.length; ai++) {
        const a = asteroids[ai];
        if (ch.hit.indexOf(a) > -1 || seen.has(a)) continue;
        const d = Math.hypot(a.x - tip.x, a.y - tip.y);
        if (d <= SHOCK_RANGE + a.r) {
          seen.add(a);
          targets.push({ a: a, from: tip });
        }
      }
    }

    if (!targets.length || ch.hit.length >= SHOCK_MAX_HITS) {
      finishShockChain(ch, i);
      continue;
    }

    // strike them all this hop (up to the safety cap): one bolt per rock,
    // each struck rock becomes a new tip for the next hop
    const newTips = [];
    for (let ti = 0; ti < targets.length && ch.hit.length < SHOCK_MAX_HITS; ti++) {
      const t = targets[ti];
      FX.lightning(t.from.x, t.from.y, t.a.x, t.a.y);
      SFX.zap();
      ch.hit.push(t.a);
      destroyAsteroid(t.a, false);
      newTips.push({ x: t.a.x, y: t.a.y });
    }
    ch.tips = newTips;
    ch.delay = SHOCK_PAUSE;
  }
}

/* The chain's hop counter is its combo: cash it into run stats and the
   lifetime accumulated-combo total exactly like a bullet's combo would. */
function finishShockChain(ch, i) {
  const k = ch.hit.length;
  if (k > runStats.maxCombo) runStats.maxCombo = k;
  addComboTotal(k);
  shockChains.splice(i, 1);
}

  /* Each finished combo (a bullet that punched through rocks) adds its size
   to the lifetime accumulated-combo total; unlocks live when a goal is hit. */
  const COMBO_TOTAL_ACH = [[500, "combos_500"], [1000, "combos_1000"], [5000, "combos_5000"]];
  function addComboTotal(n) {
    runStats.comboTotal += n;
    // persist straight to the lifetime total so it tracks live while the
    // game runs (and survives quitting mid-run); unlocks from that same value
    const s = SAVE.load();
    s.stats.comboTotal = (s.stats.comboTotal || 0) + n;
    COMBO_TOTAL_ACH.forEach(function (c) {
      if (s.stats.comboTotal >= c[0]) UI.unlock(c[1]);
    });
    SAVE.save();
  }

  /* Difficulty driver for asteroid spawn cadence.
   Falls linearly 1 - 0.012t until 58.3 s (value 0.3), then keeps
   declining at a slow linear rate instead of clamping to a floor,
   so the rate keeps creeping up for very long runs. */
  function difficulty() {
    const t = runTime;
    if (t <= 58.3333) return 1 - t * 0.012;
    return Math.max(0.05, 0.3 - 0.001 * (t - 58.3333));
  }

  /* Returns the *mean* asteroid rate in rocks/sec for the current mode. */
  function asteroidRate() {
    return (twoPlayer ? 3 : 1.6875) / difficulty();
  }

  /* Returns the *mean* power-up drop rate in drops/sec (same 1P / 2P).
   Mean interval 7.8 s - power-up drops run at half their old rate. */
  function dropRate() {
    const t = Math.min(1, runTime / 90);
    return 1 / (7.8 * (1 - 0.35 * t));
  }

  // =====================================================
  //  FIRING
  // =====================================================
  function fire(p) {
    p.ammo--;
    p.fireCd = G.fireCooldown;
    p.bulletsFired++;
    runStats.bulletsFired++;
    if (p.gun === "laser") fireLaser(p);
    else if (p.gun === "shotgun") fireShotgun(p);
    else if (p.gun === "rockets") fireRocket(p);
    else if (p.gun === "shock") fireShock(p);
    else fireBullet(p);
  }

  /* Rapid fire has no trigger and never touches your ammo - it just spams
     normal bullets on its own clock. */
  function fireGun(p) {
    p.bulletsFired++;
    runStats.bulletsFired++;
    fireBullet(p);
  }

  function fireBullet(p) {
    // Each skin is already drawn as a pair of bullets, so one shot is enough.
    bullets.push({
      x: p.x + 26,
      y: p.y,
      vx: 1050,
      r: 24,
      hits: 0,
      bid: ++bulletId,
      combo: 0,        // how many asteroids THIS bullet has punched through
      comboPop: 0,     // seconds since the last combo bump (drives the pop)
      gun: null,       // normal shot
      skin: p.bullet   // this player's chosen shot skin
    });
    FX.muzzleFlash(p.x + 24, p.y);
    SFX.shoot();
  }

  /* Laser does NOT fire bullets - the sustained beam (handled in the player
     update) replaces shots entirely, so there's no projectile for it. */
  function fireLaser(p) { fireBullet(p); }

  /* Shotgun: nine pellets spread evenly across a 60-degree fan
     (-30 to +30, in 7.5 steps). Each pellet acts like a normal
     falling bullet (combo and all). */
  function fireShotgun(p) {
    for (let i = 0; i < 9; i++) {
      const deg = -30 + i * 7.5;
      bullets.push({
        x: p.x + 26,
        y: p.y,
        vx: 1050 * Math.cos((deg * Math.PI) / 180),
        vy: 1050 * Math.sin((deg * Math.PI) / 180),
        r: 11,
        hits: 0,
        bid: ++bulletId,
        combo: 0,
        comboPop: 0,
gun: "shotgun",
        skin: p.bullet
      });
    }
    FX.muzzleFlash(p.x + 24, p.y);
    SFX.gunShotgunFire();
  }

  /* Rockets: one rocket per trigger pull; it blows up on the first rock it
     touches, torching every asteroid within 100px. */
  function fireRocket(p) {
    bullets.push({
      x: p.x + 30,
      y: p.y,
      vx: 950,
      r: 24,
      hits: 0,
      bid: ++bulletId,
      combo: 0,
      comboPop: 0,
      gun: "rockets",
      skin: p.bullet
    });
    FX.muzzleFlash(p.x + 24, p.y);
    SFX.gunRocketsFire();
  }

  /* Shock: a bolt that jumps from asteroid to asteroid within range. */
  function fireShock(p) {
    bullets.push({
      x: p.x + 30,
      y: p.y,
      vx: 1050,
      r: 26,
      hits: 0,
      bid: ++bulletId,
      combo: 0,
      comboPop: 0,
      gun: "shock",
      skin: p.bullet
    });
    FX.muzzleFlash(p.x + 24, p.y);
    SFX.gunShockFire();
  }

  /* The laser's kill zone: a horizontal band that runs from the ship's nose
     to the far edge of the screen. Anything overlapping it while the beam is
     held is destroyed - but only IN FRONT of the player, never behind them.
     Each kill just scores; the laser never collects combos. */
  function beamSweep(p) {
    const band = 22;
    const x1 = p.x + 22;   // where the beam leaves the nose
    for (let i = asteroids.length - 1; i >= 0; i--) {
      const a = asteroids[i];
      if (Math.abs(a.y - p.y) <= band + a.r &&
          a.x + a.r >= x1 && a.x <= W) {
        destroyAsteroid(a, false);
      }
    }
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
    SFX.boom(a.size.key);

    // big rocks break into two mediums, mediums into two smalls
    if (!fromClear) {
      const childKey = a.size.key === "big" ? "med" : (a.size.key === "med" ? "small" : null);
      if (childKey) {
        const child = ASTEROID_SIZES.find(function (s) { return s.key === childKey; });
        // Children stack at the rock's center on the x-axis, split 1/6 of the
        // height above/below the parent's center, and fling out at half speed
        // so the split reads as a gentle crack instead of a violent burst.
        // A point-blank shoot-out must not blow up in the shooter's face, so
        // fresh fragments are spawned clear of the ships - and if a ship is
        // right on top of the split, the fragments dart AWAY from it.
        let sx = a.x;
        for (let pi = 0; pi < players.length; pi++) {
          const pl = players[pi];
          if (pl.health <= 0) continue;
          const need = pl.x + playerRadius(pl) + child.r + 8;
          if (sx < need) sx = need;
        }
        // default: fragments drift with the asteroid flow (leftward). Near a
        // ship they reverse out, so a point-blank kill can't sandbag you.
        let vxDir = -1;
        for (let pi = 0; pi < players.length; pi++) {
          const pl = players[pi];
          if (pl.health <= 0) continue;
          if (Math.abs(sx - pl.x) < 160) {
            vxDir = sx >= pl.x ? 1 : -1;   // away from the ship along x
            break;
          }
        }
        for (const side of [-1, 1]) {
          // Half-speed fragments: a little wobble so repeated splits don't
          // look identical, but they stay near the parent for easier cleanup.
          const wob = (Math.random() - 0.5) * child.r * 0.6;
          const vy = side * (35 + child.speed * (0.25 + Math.random() * 0.15));
          asteroids.push({
            x: sx + wob,
            y: a.y + side * (a.r / 3) + wob,
            r: child.r,
            size: child,
            vx: vxDir * child.speed * (0.4 + Math.random() * 0.2) * G.asteroidSpeedMul,
            vy: vy,
            rot: Math.random() * 6,
            rotSpeed: (Math.random() - 0.5) * 3
          });
        }
      }
    }

    // lifetime stats + achievements
    save.stats.asteroidsDestroyed++;
    const DESTROY_ACH = [
      [100, "destroy_100"], [1000, "destroy_1000"],
      [10000, "destroy_10000"], [25000, "destroy_25000"]
    ];
    DESTROY_ACH.forEach(function (d) {
      if (save.stats.asteroidsDestroyed >= d[0]) UI.unlock(d[1]);
    });
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

    if (p.shield > 0) {
      // the shield eats the hit: full bubble (2 HP) -> cracked bubble (1 HP)
      p.shield--;
      FX.ring(p.x, p.y, 60, 20, 0.5, "#5cd8ff", "rgba(92,216,255,0.3)");
      FX.addShake(7);
      FX.floatText(p.x, p.y - 30, p.shield > 0 ? "SHIELD" : "SHIELD DOWN", "#5cd8ff", 18);
      SFX.zap();
      const dir = Math.abs(a.vy) > 20 ? (a.vy > 0 ? 1 : -1) : (Math.random() < 0.5 ? -1 : 1);
      p.knockVy = dir * 240;
      p.knockT = 0.3;
      p.wobbleT = 0.4;
      p.invulnT = 1;   // brief mercy window after the shield absorbs a hit
      return;
    }

    p.health--;
    p.damageTaken++;
    p.invulnT = 1.3;
    FX.explosion(p.x, p.y);
    FX.addShake(14);
    FX.floatText(p.x, p.y - 30, "-1", "#ff4d6d", 22);
    SFX.hurt();

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
    slow: { color: "#b06bff", msg: "Slow-Mo!" },
    shrink: { color: "#ffe93a", msg: "Shrunk!" },
    clear: { color: "#ff9300", msg: "SCREEN CLEAR!" },
    shield: { color: "#5cd8ff", msg: "SHIELD UP!" },
    health: { color: "#ff5c6c", msg: "+1 Life" },
    laser: { color: "#6ff0ff", msg: "LASER!" },
    shotgun: { color: "#ffa94d", msg: "SHOTGUN!" },
    rockets: { color: "#ff7b4d", msg: "ROCKETS!" },
    rapidfire: { color: "#ffe93a", msg: "RAPID FIRE!" },
    shock: { color: "#9ee6ff", msg: "SHOCK!" }
  };

  const GUN_LABELS = {
    laser: "LASER", shotgun: "SHOTGUN", rockets: "ROCKETS",
    rapidfire: "RAPID FIRE", shock: "SHOCK"
  };

  const GUN_COLORS = {
    laser: "#6ff0ff", shotgun: "#ffa94d", rockets: "#ff7b4d",
    rapidfire: "#ffe93a", shock: "#9ee6ff"
  };

  /* Each gun power-up has its own pickup jingle (deep boom for rockets,
     energy sweep for the laser, rat-a-tat for rapid fire...). */
  const GUN_SFX = {
    laser: SFX.gunLaser,
    shotgun: SFX.gunShotgun,
    rockets: SFX.gunRockets,
    rapidfire: SFX.gunRapidfire,
    shock: SFX.gunShock
  };

  /* Timer-driven health drop: flies across the screen every 30s (then 31s,
   32s...) so you have to spot it and grab it. */
  function spawnHealthPickup() {
    powerups.push({
      id: "health",
      icon: "AsteroidsAndPowerups/Health.svg",
      x: W + 60,
      baseY: 50 + Math.random() * Math.max(1, H - 100),
      y: 0,
      vx: -160 - Math.random() * 40,   // a touch slower than other drops so it's easier to catch
      t: Math.random() * 6
    });
  }

  /* One gun pickup every 60 seconds, picking a random weapon each time
   (laser, shotgun, rockets, rapid fire or shock - all equally likely). */
  const GUN_ORDER = ["laser", "shotgun", "rockets", "rapidfire", "shock"];
  let lastGunPickup = null;   // the last gun that drifted by (never spawn it twice in a row)
  function spawnGunPickup() {
    let id;
    do {
      id = GUN_ORDER[(Math.random() * GUN_ORDER.length) | 0];
    } while (id === lastGunPickup && GUN_ORDER.length > 1);
    lastGunPickup = id;
    powerups.push({
      id: id,
      icon: DATA.dropIcons[id],
      x: W + 60,
      baseY: 50 + Math.random() * Math.max(1, H - 100),
      y: 0,
      vx: -160 - Math.random() * 40,
      t: Math.random() * 6
    });
  }

  /* Equip a gun on a player: swaps their shots for dur seconds, tops up
     their ammo by 5, and flashes the pickup effect. Also used by cheats. */
  function applyGun(pl, id) {
    const def = DATA.powerups.find(function (d) { return d.id === id; });
    pl.gun = id;
    pl.gunT = def ? def.dur : 30;
    pl.rapidCd = 0;
    pl.energy = 100;
    pl.laserOn = false;
    SFX.laserHumStop();
    pl.laserCd = 0;
    pl.ammo = Math.min(eff.maxAmmo, pl.ammo + 5);
    const f = PFX[id] || { color: "#ffffff", msg: "" };
    FX.pickupFx(pl.x, pl.y, f.color);
    FX.floatText(pl.x, pl.y - 40, f.msg, f.color, 18);
    const gunSfx = GUN_SFX[id];
    if (gunSfx) gunSfx(); else SFX.power();
  }

  function spawnPowerup() {
    // Pool is built x4 so fractional drop weights stay exact: shield (0.25)
    // lands ~1/4 as often as shrink (1), while every existing ratio holds.
    const SCALE = 4;
    const t = Math.min(1, runTime / 90);
    const moneyW = Math.max(1, Math.round((4 - t * 3) / 3));
    const pool = [];
    for (let k = 0; k < moneyW * SCALE; k++) pool.push("money");
    DATA.powerups.forEach(function (p) {
      // guns show up on their own 60-second timer, not in the random pool
      if (p.dur) return;
      const w = Math.round((p.weight || 1) * SCALE);
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
      SFX.coin();
    } else if (pwr.id === "reload") {
      pl.ammo = Math.min(eff.maxAmmo, pl.ammo + 3);
      runStats.pickups.reload++;
      FX.floatText(pwr.x, pwr.y - 16, f.msg, f.color, 17);
      SFX.power();
    } else if (pwr.id === "health") {
      if (pl.health < pl.maxHealth) {
        pl.health++;
        runStats.pickups.health++;
        FX.healFx(pwr.x, pwr.y);
        FX.floatText(pwr.x, pwr.y - 16, f.msg, f.color, 17);
        SFX.heal();
      } else {
        runCash += 10;
        runStats.cashBonus += 10;
        FX.floatText(pwr.x, pwr.y - 16, "Full +$10", "#ffe93a", 16);
        SFX.click();
      }
    } else if (pwr.id === "slow") {
      slowT = G.slowMoDuration;
      runStats.pickups.slow++;
      FX.floatText(pwr.x, pwr.y - 16, f.msg, f.color, 18);
      SFX.slowMo();
    } else if (pwr.id === "shrink") {
      shrinkT = 6;
      runStats.pickups.shrink++;
      FX.floatText(pwr.x, pwr.y - 16, f.msg, f.color, 18);
      SFX.power();
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
      SFX.bigBoom();
    } else if (pwr.id === "shield") {
      if (!(pl.shield > 0)) {
        pl.shield = 2;   // one shield, 2 HP, never stacks
        runStats.pickups.shield++;
        FX.ring(p.x, p.y, 70, 24, 0.6, "#5cd8ff", "rgba(92,216,255,0.25)");
        FX.floatText(pwr.x, pwr.y - 16, f.msg, f.color, 18);
        SFX.power();
      } else {
        FX.floatText(pwr.x, pwr.y - 16, "Already Shielded", "#5cd8ff", 15);
        SFX.click();
      }
    } else if (pwr.id === "laser" || pwr.id === "shotgun" || pwr.id === "rockets" ||
               pwr.id === "rapidfire" || pwr.id === "shock") {
      // gun powerup: swap this player's shots for a while (+5 bullets)
      runStats.pickups[pwr.id]++;
      applyGun(pl, pwr.id);
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
    SFX.over();
    SFX.laserHumStop();
    const save = SAVE.load();

    // pay out the cash earned this run
    save.money += runCash;
    save.stats.lifetimeMoney += runCash;
    save.stats.lifetimeScore += Math.round(score);
    save.stats.runsPlayed++;

    if (score > save.stats.bestScore) save.stats.bestScore = Math.round(score);
    if (runTime > save.stats.bestTime) save.stats.bestTime = runTime;

    // roll this run's other numbers into the lifetime stats
    save.stats.bulletsFired = (save.stats.bulletsFired || 0) + runStats.bulletsFired;
    save.stats.asteroidsByBullets = (save.stats.asteroidsByBullets || 0) + runStats.asteroidsByBullets;
    save.stats.timesDowned = (save.stats.timesDowned || 0) +
      players.reduce(function (sum, p) { return sum + p.damageTaken; }, 0);
    save.stats.bestCombo = Math.max(save.stats.bestCombo || 0, runStats.maxCombo);
    const pk = save.stats.pickups = save.stats.pickups || {};
    ["money", "reload", "health", "slow", "shrink", "clear",
     "laser", "shotgun", "rockets", "rapidfire", "shock"].forEach(function (k) {
      pk[k] = (pk[k] || 0) + runStats.pickups[k];
    });

    // round-count and lifetime-score achievements
    const ROUNDS_ACH = [[5, "rounds_5"], [10, "rounds_10"], [50, "rounds_50"],
                        [100, "rounds_100"], [250, "rounds_250"]];
    ROUNDS_ACH.forEach(function (r) {
      if (save.stats.runsPlayed >= r[0]) UI.unlock(r[1]);
    });
    const TOTAL_ACH = [[10000, "total_10k"], [100000, "total_100k"], [1000000, "total_1m"]];
    TOTAL_ACH.forEach(function (t) {
      if (save.stats.lifetimeScore >= t[0]) UI.unlock(t[1]);
    });

    // ---- Experience: run performance + achievements unlocked this run ----
    const achNow = Object.keys(save.achievements).length;
    const newAch = Math.max(0, achNow - (runStartAchCount != null ? runStartAchCount : achNow));
    const gainedXp = XP.runXp(score, runTime) + newAch * XP.ACHIEVEMENT_XP;
    const xpResult = XP.gain(save, gainedXp);
    // Stash level-up rewards as uncollected - the player must go to the
    // main menu, open the level screen and collect them there themselves.
    save.pendingRewards = save.pendingRewards || [];
    xpResult.levelUps.forEach(function (u) {
      const at = save.pendingRewards.findIndex(function (p) { return p.level === u.level; });
      if (at >= 0) save.pendingRewards[at].reward += u.reward;
      else save.pendingRewards.push({ level: u.level, reward: u.reward });
    });
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

      // ---- experience earned this run ----
      '<div class="gameover-section">Experience</div>' +
      '<div class="xp-line">+' + gainedXp + ' XP' +
        (newAch ? ' <span class="xp-ach">(' + newAch + ' new achievement' + (newAch > 1 ? 's' : '') + ')</span>' : '') +
      '</div>' +
      '<div class="xp-bar"><div class="xp-fill" style="width:' +
        (save.xp.level >= XP.MAX_LEVEL ? 100 : Math.min(100, Math.round(100 * save.xp.current / XP.toNext(save.xp.level)))) +
        '%"></div></div>' +
      '<div class="xp-level">Level ' + save.xp.level +
        (save.xp.level >= XP.MAX_LEVEL
          ? ' - MAX LEVEL!'
          : ' <span class="xp-tnx">(' + save.xp.current + '/' + XP.toNext(save.xp.level) + ' XP to next)</span>') +
      '</div>' +
      xpResult.levelUps.map(function (u) {
        const rs = rewardShipAt(u.level);
        if (rs) {
          return '<div>Level ' + u.level + ' reward: <b>' + rs.name + '</b> skin!</div>';
        }
        return '<div>Level ' + u.level + ' reward: <span class="money">' + UI.fmt(u.reward) + '</span></div>';
      }).join("") +

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
        '<div><span>Best Shot Combo</span><span class="combo-stat">x' + st.maxCombo + '</span></div>' +
        '<div><span>Asteroids in Combos</span><span>' + st.comboKills + '</span></div>' +
      '</div>' +

      '<div class="gameover-section">Collectibles</div>' +
      '<div class="gameover-grid">' +
        '<div><span>Dollar Bills</span><span>' + st.pickups.money + '</span></div>' +
        '<div><span>Reload Packs</span><span>' + st.pickups.reload + '</span></div>' +
        '<div><span>Health Restores</span><span>' + st.pickups.health + '</span></div>' +
        '<div><span>Shields</span><span>' + (st.pickups.shield || 0) + '</span></div>' +
        '<div><span>Slow-Mo</span><span>' + st.pickups.slow + '</span></div>' +
        '<div><span>Shrink</span><span>' + st.pickups.shrink + '</span></div>' +
        '<div><span>Laser</span><span>' + (st.pickups.laser || 0) + '</span></div>' +
        '<div><span>Shotgun</span><span>' + (st.pickups.shotgun || 0) + '</span></div>' +
        '<div><span>Rockets</span><span>' + (st.pickups.rockets || 0) + '</span></div>' +
        '<div><span>Rapid Fire</span><span>' + (st.pickups.rapidfire || 0) + '</span></div>' +
        '<div><span>Shock</span><span>' + (st.pickups.shock || 0) + '</span></div>' +
        '<div><span>Screen Clears</span><span>' + st.pickups.clear + '</span></div>' +
      '</div>' +

      '<div class="gameover-players">' + playerCards + '</div>';

    state = STATE.OVER;
    document.getElementById("gameover-overlay").classList.remove("hidden");

    updateHUD();
  }

  /* =====================================================
     LEVEL REWARDS SCREEN - a horizontal, Clash-Royale-style
     reward track. Claimable levels glow gold; the player
     taps them (or CLAIM ALL) to bank the money.
     ===================================================== */
  function buildRewardsScreen() {
    const save = SAVE.load();
    const lvl = save.xp.level || 1;
    const pending = save.pendingRewards || [];
    const track = document.getElementById("rewards-track");
    const sub = document.getElementById("rewards-sub");

    const claimSet = {};
    pending.forEach(function (u) { claimSet[u.level] = u.reward; });

    // Show the whole 1..100 pass track, but never past a little
    // window beyond the player's current level.
    const maxShow = Math.min(XP.MAX_LEVEL,
      Math.max(lvl + 6, pending.length ? pending[pending.length - 1].level : lvl));

    let html = "";
    for (let i = 1; i <= maxShow; i++) {
      const milestone = (i % 25 === 0) ? " milestone" : "";
      const skinDef = rewardShipAt(i);   // skin milestone levels show their ship
      if (claimSet[i] !== undefined) {   // hasOwnProperty-style: LVL100 reward is $0
        html += '<div class="rw-node claim' + milestone + '" data-level="' + i + '">' +
          '<div class="rw-lvl">LVL ' + i + '</div>' +
          (skinDef
            ? '<div class="rw-icon"><img class="rw-ship" src="' + skinDef.src + '" alt=""></div>' +
              '<div class="rw-amt">' + skinDef.name.toUpperCase() + '</div>'
            : '<div class="rw-icon">$</div>' +
              '<div class="rw-amt">' + UI.fmt(claimSet[i]) + '</div>') +
          '<div class="rw-tag">TAP TO CLAIM</div></div>';
      } else if (i <= lvl) {
        html += '<div class="rw-node done' + milestone + '">' +
          '<div class="rw-lvl">LVL ' + i + '</div>' +
          '<div class="rw-icon">&#10003;</div>' +
          '<div class="rw-amt">' + (skinDef ? 'SKIN COLLECTED' : 'COLLECTED') + '</div></div>';
      } else {
        html += '<div class="rw-node locked' + milestone + '">' +
          '<div class="rw-lvl">LVL ' + i + '</div>' +
          (skinDef
            ? '<div class="rw-icon"><img class="rw-ship dim" src="' + skinDef.src + '" alt=""></div>' +
              '<div class="rw-amt">' + skinDef.name.toUpperCase() + ' SKIN</div>'
            : '<div class="rw-icon">$</div>' +
              '<div class="rw-amt">' + UI.fmt(XP.rewardFor(i)) + '</div>') +
          '</div>';
      }
    }
    track.innerHTML = html;

    sub.textContent = pending.length > 0
      ? "You reached Level " + lvl + "! Tap the glowing rewards to collect them."
      : "Reach new levels to earn money rewards!";

    // large detailed XP readout at the top of the screen
    const cur = save.xp.current || 0;
    const maxed = lvl >= XP.MAX_LEVEL;
    const need = maxed ? 0 : XP.toNext(lvl);
    const pct = maxed ? 100 : Math.min(100, Math.round(100 * cur / need));
    const nextReward = maxed ? 0 : XP.rewardFor(lvl + 1);
    document.getElementById("rewards-xp").innerHTML =
      '<div class="rw-xp-badge"><span class="rw-xp-lvl">LVL</span>' +
        '<span class="rw-xp-num">' + lvl + '</span></div>' +
      '<div class="rw-xp-mid">' +
        '<div class="rw-xp-bar">' +
          '<div class="rw-xp-fill' + (maxed ? ' maxed' : '') + '" style="width:' + pct + '%"></div>' +
          '<span class="rw-xp-pct">' + pct + '%</span>' +
        '</div>' +
        '<div class="rw-xp-row">' +
          '<span class="rw-xp-have">' +
            (maxed ? 'Maximum level reached!'
                   : cur.toLocaleString() + ' / ' + need.toLocaleString() + ' XP') +
          '</span>' +
          '<span class="rw-xp-next">' +
            (maxed ? '' : 'Next: LVL ' + (lvl + 1) + ' &rarr; ' +
              (rewardShipAt(lvl + 1)
                ? rewardShipAt(lvl + 1).name + ' skin'
                : UI.fmt(nextReward) + ' reward')) +
          '</span>' +
        '</div>' +
      '</div>';

    // wire each claimable node
    Array.prototype.forEach.call(track.querySelectorAll(".rw-node.claim"), function (el) {
      el.addEventListener("click", function () {
        claimRewardNode(parseInt(el.getAttribute("data-level"), 10), el);
      });
    });

    updateClaimAllButton();

    // scroll the track so the first claimable node sits front and center
    const first = track.querySelector(".rw-node.claim");
    const wrap = document.getElementById("rewards-track-wrap");
    if (first && wrap) {
      wrap.scrollLeft = first.offsetLeft - wrap.clientWidth / 2 + first.offsetWidth / 2;
    }
  }

  function claimRewardNode(level, el) {
    const s = SAVE.load();
    s.pendingRewards = s.pendingRewards || [];
    const idx = s.pendingRewards.findIndex(function (p) { return p.level === level; });
    if (idx < 0) return;
    const u = s.pendingRewards.splice(idx, 1)[0];
    el.classList.remove("claim");
    el.classList.add("done", "pop");
    el.querySelector(".rw-icon").innerHTML = "&#10003;";
    const tag = el.querySelector(".rw-tag");
    if (tag) tag.remove();

    const item = rewardShipAt(level);
    if (item) {
      // skin milestone levels unlock a ship skin instead of paying cash
      s.owned.ship = s.owned.ship || [];
      if (s.owned.ship.indexOf(item.id) < 0) s.owned.ship.push(item.id);
      el.querySelector(".rw-amt").textContent = "SKIN UNLOCKED";
      SAVE.save();
      if (window.SFX) SFX.unlockFx();
      if (window.UI && UI.notify) UI.notify("Level " + level + " reward unlocked: " + item.name + "!", item.src);
    } else {
      s.money += u.reward;
      s.stats.lifetimeMoney += u.reward;
      el.querySelector(".rw-amt").textContent = "COLLECTED";
      SAVE.save();
      if (window.SFX) SFX.coin();
    }
    updateClaimAllButton();
    if (s.pendingRewards.length === 0) {
      document.getElementById("rewards-sub").textContent = "All rewards collected!";
    }
  }

  function claimAllRewards() {
    const s = SAVE.load();
    s.pendingRewards = s.pendingRewards || [];
    if (!s.pendingRewards.length) return;
    let skinItems = null;
    s.pendingRewards.forEach(function (u) {
      const item = rewardShipAt(u.level);
      if (item) {
        skinItems = skinItems || [];
        if (!skinItems.some(function (x) { return x.id === item.id; })) skinItems.push(item);
        s.owned.ship = s.owned.ship || [];
        if (s.owned.ship.indexOf(item.id) < 0) s.owned.ship.push(item.id);
      } else {
        s.money += u.reward;
        s.stats.lifetimeMoney += u.reward;
      }
    });
    s.pendingRewards = [];
    SAVE.save();
    if (skinItems && window.UI && UI.notify) {
      UI.notify(
        skinItems.length === 1
          ? "Level " + skinItems[0].rewardLevel + " reward unlocked: " + skinItems[0].name + "!"
          : skinItems.length + " skins unlocked: " +
            skinItems.map(function (x) { return x.name; }).join(", ") + "!",
        skinItems[skinItems.length - 1].src
      );
    }
    if (window.SFX) SFX.unlockFx();
    buildRewardsScreen();
    document.getElementById("rewards-sub").textContent = "All rewards collected!";
  }

  function closeRewards() {
    document.getElementById("rewards-overlay").classList.add("hidden");
    // refresh the menu XP bar so its unclaimed badge stays accurate
    if (window.UI && UI.updateMenuStats) UI.updateMenuStats();
  }

  /* Open the rewards track on demand (e.g. clicking the menu XP bar). */
  function openRewards() {
    buildRewardsScreen();
    document.getElementById("rewards-overlay").classList.remove("hidden");
  }

  function updateClaimAllButton() {
    const btn = document.getElementById("btn-claim-all");
    if (btn) btn.disabled = (SAVE.load().pendingRewards || []).length === 0;
  }

  function unclaimedCount() {
    return (SAVE.load().pendingRewards || []).length;
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
      if (p.id === "health") {
        // floating spotlight with the battery centered inside it - the
        // battery is what you actually fly into to grab a life
        const pulse = 0.5 + 0.5 * Math.sin(p.t * 5);
        ctx.globalAlpha = 0.28 + 0.22 * pulse;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 31 + 9 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = "#ff5c6c";
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 31, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = 2;
        ctx.stroke();
        drawSprite(p.icon, p.x, p.y, 46, 46, 0);
      } else if (p.id === "laser" || p.id === "shotgun" || p.id === "rockets" ||
                 p.id === "rapidfire" || p.id === "shock") {
        // gun drop: glowing ring in the weapon's color so it pops
        const gcol = GUN_COLORS[p.id] || "#ffffff";
        const pulse = 0.5 + 0.5 * Math.sin(p.t * 5);
        ctx.save();
        ctx.globalAlpha = 0.3 + 0.22 * pulse;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 32 + 8 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = gcol;
        ctx.fill();
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 30, 0, Math.PI * 2);
        ctx.strokeStyle = gcol;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
        drawSprite(p.icon, p.x, p.y, 40, 40, 0);
      } else {
        drawSprite(p.icon, p.x, p.y, 34, 34, 0);
      }
    }

    // ---- asteroids ----
    for (const a of asteroids) {
      const w = a.r * 2;
      const h = a.r * 2;
      drawSprite(DATA.SPREAD.asteroid, a.x, a.y, w, h, (a.rot * 180) / Math.PI);
    }

    // ---- bullets ----
    for (const b of bullets) {
      drawGunProjectile(b);

      // per-bullet combo badge: floats above the bullet, pops on each hit
      if (b.combo >= 2) {
        const label = "x" + b.combo;
        const size = 20 + Math.min(10, b.combo);
        const color = b.combo >= 6 ? "#ff4d4d" : b.combo >= 4 ? "#ff9300" : "#ffe93a";

        // pop: overshoot to ~1.9x then settle, with a little wobble + kick up
        const k = Math.min(1, b.comboPop / 0.15);
        const pop = k > 0
          ? 1 + 0.9 * k * k
          : 1 + 0.06 * Math.sin(runTime * 6 + b.bid);   // idle breathing
        const kick = k > 0 ? -12 * k : 0;
        const wob = k > 0 ? Math.sin(k * Math.PI * 2.5) * 6 * k : 0;
        const lw = 3 + size * 0.12;

        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.scale(pop, pop);
        ctx.rotate((wob * Math.PI) / 180);
        ctx.translate(0, kick - 32);
        ctx.textAlign = "center";
        ctx.font = "900 " + size + "px Segoe UI, Arial, sans-serif";
        ctx.strokeStyle = "rgba(0,0,0,0.75)";
        ctx.lineWidth = lw;
        ctx.lineJoin = "round";
        ctx.strokeText(label, 0, 0);
        ctx.fillStyle = color;
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
    }

    // ---- combo ghosts: the bullet is gone, the badge fades out slowly ----
    for (const g of comboGhosts) {
      const k = Math.max(0, g.t / 3);          // 1 -> 0 over 3 seconds
      const alpha = Math.pow(k, 1.6);          // holds bright, eases out near the end
      const label = "x" + g.combo;
      const size = (20 + Math.min(10, g.combo)) * (0.8 + 0.2 * k);
      const color = g.combo >= 6 ? "#ff4d4d" : g.combo >= 4 ? "#ff9300" : "#ffe93a";
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(g.x, g.y);
      ctx.textAlign = "center";
      ctx.font = "900 " + size + "px Segoe UI, Arial, sans-serif";
      ctx.strokeStyle = "rgba(0,0,0,0.75)";
      ctx.lineWidth = 3 + size * 0.12;
      ctx.lineJoin = "round";
      ctx.strokeText(label, 0, -32);
      ctx.fillStyle = color;
      ctx.fillText(label, 0, -32);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

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
          // vibrant gun aura: a pulsing ring + orbiting sparks in the
          // weapon's color while a gun powerup is active
          if (p.gunT > 0) {
            const gcol = GUN_COLORS[p.gun] || GUN_COLORS.laser;
            const pulse = 0.5 + 0.5 * Math.sin(runTime * 5 + p.name.charCodeAt(0));
            ctx.save();
            ctx.globalAlpha = 0.4 + 0.3 * pulse;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 40, 0, Math.PI * 2);
            ctx.strokeStyle = gcol;
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.globalAlpha = 0.9;
            for (let s = 0; s < 3; s++) {
              const ang = runTime * 3.2 + s * ((Math.PI * 2) / 3);
              ctx.fillStyle = gcol;
              ctx.beginPath();
              ctx.arc(p.x + Math.cos(ang) * 46, p.y + Math.sin(ang) * 46, 2.6, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }
          const shipItem = skinItem(p.ship);
          const hasFx = shipItem && shipItem.fx;
          if (!hasFx) {
            drawSprite(ASSETS_SRC(p.ship), p.x, p.y, shipW, shipH, p.pitch + p.wobble);
          }
          drawShipFx(p.ship, p.x, p.y, shipW, shipH, p.pitch + p.wobble, hasFx);
        }
      }

      // laser: the sustained beam that spans the whole screen while firing
      if (!dead && p.gun === "laser" && p.laserOn) {
        drawLaserBeam(p);
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

      // shield bubble: a bright pulsing dome around the ship. Cyan at full
      // (2 HP), orange with a cross seam once it's been cracked (1 HP).
      if (!dead && p.shield > 0) {
        const sCol = p.shield >= 2 ? "#5cd8ff" : "#ff9a5c";
        const pulse = 0.5 + 0.5 * Math.sin(runTime * 6 + p.name.charCodeAt(0));
        const rad = playerRadius(p) + 15;
        ctx.save();
        ctx.globalAlpha = 0.14 + 0.08 * pulse;
        ctx.fillStyle = sCol;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.5 + 0.25 * pulse;
        ctx.strokeStyle = sCol;
        ctx.shadowColor = sCol;
        ctx.shadowBlur = 18;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
        ctx.stroke();
        if (p.shield <= 1) {
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = "#ffc9a3";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x - rad, p.y);
          ctx.lineTo(p.x + rad, p.y);
          ctx.moveTo(p.x, p.y - rad);
          ctx.lineTo(p.x, p.y + rad);
          ctx.stroke();
        }
        ctx.restore();
      }
    });

    // ---- effects on top ----
    FX.draw(ctx);

    ctx.restore();
  }

  /* Resolve the image source for an equipment entry. */
  function ASSETS_SRC(equipId) {
    const all =
      DATA.ships.concat(DATA.rewardShips || []).concat(DATA.bullets).concat(DATA.trails);
    const found = all.find(function (x) { return x.id === equipId; });
    return found ? found.src : "";
  }

  /* Draw one shot. Normal bullets use the player's bullet skin; each gun
     powerup has its own look. */
  function drawGunProjectile(b) {
    if (b.gun === "shotgun") {
      // hot pellet
      ctx.save();
      ctx.beginPath();
      ctx.arc(b.x, b.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,169,77,0.4)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(b.x, b.y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ffa94d";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#fff3d6";
      ctx.fill();
      ctx.restore();
      return;
    }
    if (b.gun === "rockets") {
      drawSprite("AsteroidsAndPowerups/RocketBullet.svg", b.x, b.y, 80, 44, 0);
      // exhaust glow behind the nose
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#ffb347";
      ctx.fillRect(b.x - 90, b.y - 8, 30, 16);
      ctx.globalAlpha = 1;
      ctx.restore();
      return;
    }
    if (b.gun === "shock") {
      drawSprite("AsteroidsAndPowerups/ShockBullet.svg", b.x, b.y, 34, 34, 90);
      return;
    }
    // normal bullet / rapid fire: the player's chosen skin
    const bDef = DATA.bullets.find(function (x) { return x.id === b.skin; }) || DATA.bullets[0];
    const bulletImg = ASSETS.get(bDef ? bDef.src : "");
    const bNatW = bulletImg ? bulletImg.width || 30 : 30;
    const bNatH = bulletImg ? bulletImg.height || 30 : 30;
    const bRot = bDef ? bDef.rot : -90;
    const bs = 44 / Math.max(bNatW, bNatH);
    drawImg(bulletImg, b.x, b.y, bNatW * bs, bNatH * bs, bRot);
  }

  /* Modern clean laser beam: a white-hot core wrapped in cyan glow,
     spanning from the ship's nose to the far edge of the screen. */
  function drawLaserBeam(p) {
    const x1 = p.x + 22;
    const y = p.y;
    const gradMid = ctx.createLinearGradient(x1, 0, W, 0);
    gradMid.addColorStop(0, "rgba(80,225,255,0.95)");
    gradMid.addColorStop(0.6, "rgba(130,240,255,0.85)");
    gradMid.addColorStop(1, "rgba(180,250,255,0.95)");
    ctx.save();
    ctx.shadowColor = "#37e0ff";
    ctx.shadowBlur = 24;
    // wide soft halo
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = "#1fd0ff";
    ctx.fillRect(x1, y - 26, Math.max(0, W - x1), 52);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#4deaff";
    ctx.fillRect(x1, y - 16, Math.max(0, W - x1), 32);
    // body gradient
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = gradMid;
    ctx.fillRect(x1, y - 9, Math.max(0, W - x1), 18);
    // white-hot core
    ctx.shadowBlur = 14;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x1, y - 3, Math.max(0, W - x1), 6);
    ctx.restore();
  }

  /* ---------- Animated-skin canvas effects ----------
     Menus/shop render skins as real <img> tags, so SMIL animation plays
     there. The game canvas paints preloaded Image objects with drawImage(),
     which freezes an SVG at one frame - so skins flagged fx:"name" get
     their interior effects redrawn live here instead, clipped to the exact
     hull silhouette (Path2D accepts SVG path data directly). */
  const SCOUT_HULL_D =
    "M240.40845,184.18663l-8.27113,10.51761h-3.67606v-11.43662h-2.75704l-4.7993," +
    "4.7993h-2.65493v-16.89965h2.39965l4.85035,4.85035h3.16549v-10.82395l2.96127," +
    "-0.10211l8.88381,10.41549l21.23944,4.28873z";
  let scoutHullPath = null;
  // design space of the source art (viewBox minus its translate)
  const FX_DW = 43.50001, FX_DH = 30.22535, FX_OX = -218.24999, FX_OY = -164.88734;
  // cockpit glass ellipse (FX must not paint over it)
  const FX_GLASS = { x: 247.91, y: 179.81, rx: 5.3, ry: 2.55 };
  // twinkling round stars: [x, y, r, color, lo, hi, dur, begin]
  const FX_STARS = [
    [223, 172, .5, "#ffffff", .2, 1, 1.8, 0],
    [227, 186, .4, "#cfe0ff", .15, 1, 2.4, 0],
    [231, 177, .45, "#ffffff", .3, 1, 2.1, .5],
    [238, 183, .4, "#ffe9b0", .2, .9, 1.6, .9],
    [249, 177, .5, "#ffffff", .25, 1, 2.7, 1.2],
    [252, 181, .4, "#cfe0ff", .2, 1, 1.9, .3],
    [228, 190, .4, "#ffffff", .3, .95, 2.3, 1.5],
    [235, 169, .35, "#cfe0ff", .15, .85, 2, .7],
    [245, 187, .35, "#ffffff", .2, .9, 2.6, 1.1],
    [255, 180, .3, "#ffe9b0", .2, .8, 1.7, .4],
    [222, 176, .4, "#cfe0ff", .25, 1, 2.2, .2],
    [220, 181, .35, "#ffffff", .25, .9, 1.9, 1.4],
    [224, 182, .45, "#ffe9b0", .3, 1, 2.5, .8],
    [226, 168, .35, "#ffffff", .2, .85, 2, 1.7],
    [230, 172, .4, "#cfe0ff", .2, .95, 2.8, .6],
    [229, 181, .3, "#ffffff", .15, .75, 1.5, 1.1],
    [233, 186, .4, "#ffffff", .3, 1, 2.4, 1.9],
    [237, 178, .35, "#cfe0ff", .2, .9, 2.1, .35],
    [241, 180, .3, "#ffe9b0", .2, .85, 1.6, 1.3],
    [244, 178, .35, "#ffffff", .25, .8, 2.6, .9]
  ];
  // 4-point sparkle flares: [x, y, size, scaleLo, scaleHi, dur, begin, color]
  const FX_SPARKLES = [
    [234, 173, 1.6, .5, 1.2, 3.2, 0, "#ffffff"],
    [247, 183, 1.3, .45, 1.1, 4.1, 1.3, "#cfe0ff"],
    [229, 186, 1.2, .45, 1, 3.7, 2.1, "#ffe9b0"],
    [242, 177, 1.1, .4, 1, 4.5, .7, "#ffffff"]
  ];
  // shooting stars were removed at the player's request - the sky stays calm
  const FX_NEBULAS = [
    { x: 236, y: 176, r: 12, color: "58,79,154", lo: .28, hi: .48, dur: 9, begin: 0 },
    { x: 248, y: 184, r: 9, color: "106,58,138", lo: .18, hi: .36, dur: 11, begin: 0 },
    { x: 226, y: 182, r: 7, color: "42,106,138", lo: .18, hi: .34, dur: 7, begin: 2 }
  ];

  function skinItem(id) {
    return DATA.ships.concat(DATA.rewardShips || []).find(function (x) { return x.id === id; });
  }

  /* The reward ship unlocked at this track level, or null if it's a cash level. */
  function rewardShipAt(level) {
    return (DATA.rewardShips || []).find(function (r) { return r.rewardLevel === level; }) || null;
  }

  // 0 -> 1 -> 0 triangle wave, phase-shifted, matching SMIL value loops
  function fxPulse(t, dur, begin) {
    return .5 - .5 * Math.cos((((t - begin) / dur) % 1) * Math.PI * 2);
  }

  function drawStarfieldFx(t) {
    // nebula wisps: soft radial-gradient clouds breathing slowly
    FX_NEBULAS.forEach(function (n) {
      const a = n.lo + (n.hi - n.lo) * fxPulse(t, n.dur, n.begin);
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      g.addColorStop(0, "rgba(" + n.color + "," + a.toFixed(3) + ")");
      g.addColorStop(1, "rgba(" + n.color + ",0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // everything below drifts slowly for parallax depth (26s loop)
    const dp = (t % 26) / 26, dk = 1 - Math.abs(1 - 2 * dp);
    ctx.save();
    ctx.translate(.9 * dk, -.5 * dk);

    // distant planet with crescent shading
    ctx.globalAlpha = .85 + .15 * fxPulse(t, 5, 0);
    ctx.fillStyle = "#e8c98a";
    ctx.beginPath(); ctx.arc(243, 171.5, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = .55;
    ctx.fillStyle = "#101a3a";
    ctx.beginPath(); ctx.arc(243.6, 171, 1.6, 0, Math.PI * 2); ctx.fill();

    // twinkling round stars (kept clear of the cockpit glass)
    FX_STARS.forEach(function (st) {
      if (Math.pow((st[0] - FX_GLASS.x) / FX_GLASS.rx, 2) +
          Math.pow((st[1] - FX_GLASS.y) / FX_GLASS.ry, 2) < 1) return;
      ctx.globalAlpha = st[4] + (st[5] - st[4]) * fxPulse(t, st[6], st[7]);
      ctx.fillStyle = st[3];
      ctx.beginPath();
      ctx.arc(st[0], st[1], st[2], 0, Math.PI * 2);
      ctx.fill();
    });

    // sparkle flares: 4-point diamonds that scale-twinkle
    FX_SPARKLES.forEach(function (sp) {
      const s = sp[2] * (sp[3] + (sp[4] - sp[3]) * fxPulse(t, sp[5], sp[6]));
      const w = s * .22;
      ctx.globalAlpha = .4 + .6 * fxPulse(t, sp[5], sp[6]);
      ctx.fillStyle = sp[7];
      ctx.beginPath();
      ctx.moveTo(sp[0], sp[1] - s);
      ctx.lineTo(sp[0] + w, sp[1] - w);
      ctx.lineTo(sp[0] + s, sp[1]);
      ctx.lineTo(sp[0] + w, sp[1] + w);
      ctx.lineTo(sp[0], sp[1] + s);
      ctx.lineTo(sp[0] - w, sp[1] + w);
      ctx.lineTo(sp[0] - s, sp[1]);
      ctx.lineTo(sp[0] - w, sp[1] - w);
      ctx.closePath();
      ctx.fill();
    });

    // shooting stars removed - sky stays calm
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* ---------- Generic animated-skin engine ----------
     Each reward skin's SVG carries a few SMIL effects. The tables below
     mirror exactly those effects so the same animation plays on the game
     canvas (menus/shop show the real SVG). Coordinates are design space;
     the caller clips everything to the hull, then re-paints the cockpit
     glass and nozzles on top to match the SVG layering. */
  const FX_GLASS_D =
    "M243.11444,179.81017c0,-1.11996 2.14872,-2.02787 4.7993,-2.02787c2.65058,0 " +
    "4.7993,0.90791 4.7993,2.02787c0,1.11996 -2.14872,2.02787 -4.7993,2.02787c-2.65058,0 " +
    "-4.7993,-0.90791 -4.7993,-2.02787z";
  const FX_NOZZLE_D =
    "M231.98415,195.11269c-1.91744,0 -3.47183,-0.22859 -3.47183,-0.51056c0,-0.28198 1.55439," +
    "-0.51056 3.47183,-0.51056c1.91744,0 3.47183,0.22859 3.47183,0.51056c0,0.28198 -1.55439," +
    "0.51056 -3.47183,0.51056z" +
    "M232.08627,165.90846c-1.91744,0 -3.47183,-0.22859 -3.47183,-0.51056c0,-0.28198 1.55439," +
    "-0.51056 3.47183,-0.51056c1.91744,0 3.47183,0.22859 3.47183,0.51056c0,0.28198 -1.55439," +
    "0.51056 -3.47183,0.51056z" +
    "M235.45599,191.02818c-1.91744,0 -3.47183,-0.22859 -3.47183,-0.51056c0,-0.28198 1.55439," +
    "-0.51056 3.47183,-0.51056c1.91744,0 3.47183,0.22859 3.47183,0.51056c0,0.28198 -1.55439," +
    "0.51056 -3.47183,0.51056z" +
    "M235.25176,170.40142c-1.91744,0 -3.47183,-0.22859 -3.47183,-0.51056c0,-0.28198 1.55439," +
    "-0.51056 3.47183,-0.51056c1.91744,0 3.47183,0.22859 3.47183,0.51056c0,0.28198 -1.55439," +
    "0.51056 -3.47183,0.51056z";
  // per-skin cockpit glass tint (most share the standard pale glass)
  const SKIN_GLASS = {
    neon: "#e4e7ff", prism: "#e4e7ff", circuit: "#e4e7ff", helix: "#e4e7ff",
    scan: "#e4e7ff", ekg: "#c8ffe8", hex: "#e4e7ff", magma: "#ffd9a0", portal: "#e4e7ff"
  };

  /* Static parts for each animated skin (hull + shade colors from their SVGs).
     When drawing the full ship procedurally, we paint these first, then effects,
     then glass + nozzles on top. */
  const SKIN_STATIC = {
    neon:   { hull: "#00ff15", shade: "#00920c" },
    prism:  { hull: null, shade: null },  // hull/shade are repainted by "cycle" effects
    circuit:{ hull: "#0d4f2b", shade: "#093a1f" },
    helix:  { hull: "#101828", shade: "#0a1120" },
    scan:   { hull: "#0e5e66", shade: "#09454c" },
    ekg:    { hull: "#0a1a14", shade: "#07120e" },
    hex:    { hull: "#3a2a6e", shade: "#2a1d52" },
    magma:  { hull: "#1c1b22", shade: "#131218" },
    portal: { hull: "#141032", shade: "#0d0a22" }
  };

  const EKG_TRACE_D = "M222,180 L230,180 L233,177 L236,183 L238,172 L240,188 L242,178 L244,180 L256,180";
  const HELIX_A_D = "M206,180 q4,-6 8,0 q4,6 8,0 q4,-6 8,0 q4,6 8,0 q4,-6 8,0 q4,6 8,0 q4,-6 8,0 q4,6 8,0";
  const HELIX_B_D = "M206,180 q4,6 8,0 q4,-6 8,0 q4,6 8,0 q4,-6 8,0 q4,6 8,0 q4,-6 8,0 q4,6 8,0 q4,-6 8,0";

  const SKIN_FX = {
    /* chasing dashed outline around the hull silhouette */
    neon: [
      { k: "dash", d: SCOUT_HULL_D, w: 1.1, dash: [5, 4], off: [18, 0], dur: 1.2,
        cols: ["#eaffea", "#7dffb0", "#eaffea"], cdur: 1.2, cap: "round" }
    ],
    /* hull + shade repaint themselves through a looping color cycle */
    prism: [
      { k: "cycle", d: SCOUT_HULL_D, stops: ["#00ff15", "#00cfff", "#ff44d9", "#ffb03a"], dur: 8 },
      { k: "cycle", d: "M239.6033,183.53019l-7.47508,8.90777h-3.52648v-9.27767l-3.00226,0.10211l-3.62261,3.55415h-2.39941v-14.31297h2.1687l3.77086,3.6995h3.26929v-8.75877l2.88049,-0.08648l8.02879,8.82129l19.19527,3.63229z",
        stops: ["#00920c", "#0076a3", "#a3008f", "#c96f00"], dur: 8 }
    ],
    /* light pulses riding circuit traces */
    circuit: [
      { k: "ride", pts: [[222, 172], [232, 172], [238, 178], [252, 178]], r: 1.1, fill: "#7dffb0", dur: 2.2 },
      { k: "ride", pts: [[222, 188], [232, 188], [238, 182], [252, 182]], r: 1.1, fill: "#7dffb0", dur: 2.2, begin: .7 },
      { k: "ride", pts: [[228, 166], [228, 174], [236, 182]], r: .9, fill: "#c9ffd4", dur: 2.2, begin: 1.4,
        keys: [0, 1, 1, 0], kt: [0, .1, .9, 1] }
    ],
    /* double helix scrolling sideways every period */
    helix: [
      { k: "scroll", dx: 16, dur: 3, els: [
        { p: HELIX_A_D, c: "#2fd0c0", w: 1 },
        { p: HELIX_B_D, c: "#ff4aa0", w: 1 },
        { l: [210, 175.5, 210, 184.5], c: "#8ab0ff", w: .6, a: .85 },
        { l: [214, 177.8, 214, 182.2], c: "#8ab0ff", w: .6, a: .85 },
        { l: [226, 175.5, 226, 184.5], c: "#8ab0ff", w: .6, a: .85 },
        { l: [230, 177.8, 230, 182.2], c: "#8ab0ff", w: .6, a: .85 },
        { l: [242, 175.5, 242, 184.5], c: "#8ab0ff", w: .6, a: .85 },
        { l: [246, 177.8, 246, 182.2], c: "#8ab0ff", w: .6, a: .85 },
        { l: [258, 175.5, 258, 184.5], c: "#8ab0ff", w: .6, a: .85 },
        { l: [262, 177.8, 262, 182.2], c: "#8ab0ff", w: .6, a: .85 },
        { x: 210, y: 180, r: .55, c: "#cfe0ff" },
        { x: 226, y: 180, r: .55, c: "#cfe0ff" },
        { x: 242, y: 180, r: .55, c: "#cfe0ff" },
        { x: 258, y: 180, r: .55, c: "#cfe0ff" }
      ] }
    ],
    /* bright bar sweeping across the hull and back */
    scan: [
      { k: "sweep", x0: 214, x1: 264, y: 160, w: 3, h: 40, fill: "#bfffff", op: .85, dur: 3 },
      { k: "sweep", x0: 211, x1: 261, y: 160, w: 6, h: 40, fill: "#5ce8e0", op: .3, dur: 3 }
    ],
    /* heartbeat trace with a drawing head + traveling dot + spike flare */
    ekg: [
      { k: "dash", d: EKG_TRACE_D, col: "#4affaf", w: 1, dash: [12, 60], off: [72, -60], dur: 2.4, join: "round" },
      { k: "ride", pts: [[222, 180], [230, 180], [233, 177], [236, 183], [238, 172], [240, 188], [242, 178], [244, 180], [256, 180]],
        r: 1, fill: "#c8ffe0", dur: 2.4 },
      { k: "dot", x: 239, y: 180, r: 3, fill: "#4affaf", keys: [0, 0, .35, 0, 0], kt: [0, .42, .5, .58, 1], dur: 2.4 },
      { k: "dot", x: 224.6, y: 172.2, r: .55, fill: "#ff5a5a", keys: [1, .2, 1], dur: 1.2 }
    ],
    /* honeycomb cells lighting up in a nose-ward wave */
    hex: [
      { k: "poly", fill: "#b79bff", keys: [0, .9, 0], dur: 2.4, begin: 0,
        pts: [[226, 168], [228.5, 169.4], [228.5, 172.2], [226, 173.6], [223.5, 172.2], [223.5, 169.4]] },
      { k: "poly", fill: "#b79bff", keys: [0, .9, 0], dur: 2.4, begin: .3,
        pts: [[232, 172], [234.5, 173.4], [234.5, 176.2], [232, 177.6], [229.5, 176.2], [229.5, 173.4]] },
      { k: "poly", fill: "#b79bff", keys: [0, .9, 0], dur: 2.4, begin: .6,
        pts: [[238, 170], [240.5, 171.4], [240.5, 174.2], [238, 175.6], [235.5, 174.2], [235.5, 171.4]] },
      { k: "poly", fill: "#b79bff", keys: [0, .9, 0], dur: 2.4, begin: .9,
        pts: [[244, 172], [246.5, 173.4], [246.5, 176.2], [244, 177.6], [241.5, 176.2], [241.5, 173.4]] },
      { k: "poly", fill: "#b79bff", keys: [0, .9, 0], dur: 2.4, begin: 1.2,
        pts: [[250, 174], [252.5, 175.4], [252.5, 178.2], [250, 179.6], [247.5, 178.2], [247.5, 175.4]] },
      { k: "poly", fill: "#8f7bff", keys: [0, .7, 0], dur: 2.4, begin: .45,
        pts: [[236, 186], [238.5, 187.4], [238.5, 190.2], [236, 191.6], [233.5, 190.2], [233.5, 187.4]] },
      { k: "poly", fill: "#8f7bff", keys: [0, .7, 0], dur: 2.4, begin: .15,
        pts: [[230, 188], [232.5, 189.4], [232.5, 192.2], [230, 193.6], [227.5, 192.2], [227.5, 189.4]] }
    ],
    /* molten cracks flickering on their own rhythms */
    magma: [
      { k: "stroke", pts: [[222, 170], [230, 176], [236, 174], [246, 180], [256, 178]], col: "#ff5a1e", w: 1.2, keys: [.5, 1, .7, 1, .5], dur: 2.6 },
      { k: "stroke", pts: [[222, 190], [231, 184], [238, 186], [250, 181]], col: "#ff8a1e", w: 1, keys: [1, .55, .9, .6, 1], dur: 3.1 },
      { k: "stroke", pts: [[228, 166], [232, 173], [230, 180]], col: "#ffb03a", w: .9, keys: [.7, 1, .5, .8, .7], dur: 2.2 },
      { k: "stroke", pts: [[228, 194], [233, 187], [231, 181]], col: "#ffb03a", w: .9, keys: [.9, .5, 1, .6, .9], dur: 2.8 },
      { k: "dot", x: 246, y: 180, rKeys: [1.2, .7, 1.2], rdur: 2.1, fill: "#ffe14d" }
    ],
    /* counter-rotating portal arms around a pulsing core */
    portal: [
      { k: "rot", cx: 240, cy: 180, dur: 4, paths: [
        { p: "M240,170 Q250,174 248,183 Q246,190 238,189", c: "#7a5aff", w: 1.6, a: .9 },
        { p: "M240,190 Q230,186 232,177 Q234,170 242,171", c: "#7a5aff", w: 1.6, a: .9 },
        { p: "M251,178 Q252,186 244,190", c: "#b08aff", w: 1, a: .6 },
        { p: "M229,182 Q228,174 236,170", c: "#b08aff", w: 1, a: .6 }
      ] },
      { k: "rot", cx: 240, cy: 180, dur: 2.6, ccw: true, paths: [
        { p: "M240,175 Q245,178 243,183 Q241,187 237,185", c: "#4affdf", w: 1.1, a: .85 },
        { p: "M240,185 Q235,182 237,177 Q239,173 243,175", c: "#4affdf", w: 1.1, a: .85 }
      ] },
      { k: "dot", x: 240, y: 180, rKeys: [2.2, 3.1, 2.2], rdur: 1.4, fill: "#e0d0ff" },
      { k: "rot", cx: 240, cy: 180, dur: 1.8, dots: [{ x: 240, y: 172, r: .8, c: "#ffffff" }] }
    ]
  };

  const fxPathCache = {};
  function fxPath(d) {
    return fxPathCache[d] || (fxPathCache[d] = new Path2D(d));
  }

  function fxLerpCol(a, b, f) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * f);
    const g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * f);
    const bl = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * f);
    return "rgb(" + r + "," + g + "," + bl + ")";
  }

  /* loop through color stops; the last stop equals the first for a seamless wrap */
  function fxCycle(stops, f) {
    const n = stops.length - 1;
    const x = (((f % 1) + 1) % 1) * n;
    const i = Math.min(n - 1, Math.floor(x));
    return fxLerpCol(stops[i], stops[i + 1], x - i);
  }

  /* multi-key interpolation with optional keyTimes (mirrors SMIL values/keyTimes) */
  function fxKeys(keys, kt, dur, begin, t) {
    const tl = t - begin;
    if (tl < 0) return keys[0];
    const f = (tl % dur) / dur;
    if (!kt) {
      const n = keys.length - 1;
      const x = f * n;
      const i = Math.min(n - 1, Math.floor(x));
      return keys[i] + (keys[i + 1] - keys[i]) * (x - i);
    }
    for (let i = 0; i < kt.length - 1; i++) {
      if (f <= kt[i + 1]) {
        const span = kt[i + 1] - kt[i];
        const g = span > 0 ? (f - kt[i]) / span : 1;
        return keys[i] + (keys[i + 1] - keys[i]) * Math.min(1, Math.max(0, g));
      }
    }
    return keys[keys.length - 1];
  }

  /* position at fraction u along a polyline at constant speed (SMIL "paced") */
  function fxPaced(pts, u) {
    let total = 0;
    const lens = [];
    for (let i = 1; i < pts.length; i++) {
      const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      lens.push(len);
      total += len;
    }
    let d = u * total;
    for (let i = 0; i < lens.length; i++) {
      if (d <= lens[i] || i === lens.length - 1) {
        const k = lens[i] > 0 ? d / lens[i] : 0;
        return [
          pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k,
          pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k
        ];
      }
      d -= lens[i];
    }
    return pts[pts.length - 1];
  }

  function fxSmooth(f) { return f * f * (3 - 2 * f); }   // soft ease-in-out

  function drawTableFx(fxKey, t) {
    const els = SKIN_FX[fxKey];
    if (!els) return;
    for (const el of els) {
      switch (el.k) {
        case "cycle":   // base shape repainted through a color cycle (Prism)
          ctx.fillStyle = fxCycle(el.stops, t / el.dur);
          ctx.fill(fxPath(el.d));
          break;
        case "dash": {  // marching dashed stroke (Neon chase, EKG head)
          const f = ((t / el.dur) % 1 + 1) % 1;
          ctx.setLineDash(el.dash);
          ctx.lineDashOffset = el.off[0] + (el.off[1] - el.off[0]) * f;
          ctx.lineWidth = el.w;
          ctx.lineJoin = el.join || "miter";
          ctx.lineCap = el.cap || "butt";
          ctx.strokeStyle = el.cols ? fxCycle(el.cols, t / el.cdur) : el.col;
          ctx.stroke(fxPath(el.d));
          ctx.setLineDash([]);
          break;
        }
        case "stroke": {  // polyline flickering through opacity keys (Magma)
          ctx.globalAlpha = Math.min(1, Math.max(0, fxKeys(el.keys, null, el.dur, el.begin || 0, t)));
          ctx.strokeStyle = el.col;
          ctx.lineWidth = el.w;
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(el.pts[0][0], el.pts[0][1]);
          for (let i = 1; i < el.pts.length; i++) ctx.lineTo(el.pts[i][0], el.pts[i][1]);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case "poly": {  // filled polygon pulsing through opacity keys (Hex cells)
          ctx.globalAlpha = Math.min(1, Math.max(0, fxKeys(el.keys, null, el.dur, el.begin || 0, t)));
          ctx.fillStyle = el.fill;
          ctx.beginPath();
          ctx.moveTo(el.pts[0][0], el.pts[0][1]);
          for (let i = 1; i < el.pts.length; i++) ctx.lineTo(el.pts[i][0], el.pts[i][1]);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case "dot": {  // circle with optional radius/opacity key animation
          let r = el.r;
          if (el.rKeys) r = fxKeys(el.rKeys, null, el.rdur, el.rbegin || 0, t);
          if (el.keys) {
            ctx.globalAlpha = Math.min(1, Math.max(0, fxKeys(el.keys, el.kt, el.dur, el.begin || 0, t)));
          }
          ctx.fillStyle = el.fill;
          ctx.beginPath();
          ctx.arc(el.x, el.y, Math.max(.01, r), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case "ride": {  // dot riding a polyline at constant speed (Circuit, EKG)
          const tl = t - (el.begin || 0);
          if (tl < 0) break;
          const pos = fxPaced(el.pts, (tl % el.dur) / el.dur);
          if (el.kt) {
            ctx.globalAlpha = Math.min(1, Math.max(0, fxKeys(el.keys, el.kt, el.dur, el.begin || 0, t)));
          }
          ctx.fillStyle = el.fill;
          ctx.beginPath();
          ctx.arc(pos[0], pos[1], el.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case "sweep": {  // bar sweeping right then back with soft easing (Scanline)
          const f = ((t / el.dur) % 1 + 1) % 1;
          const u = f < .5 ? fxSmooth(f * 2) : 1 - fxSmooth((f - .5) * 2);
          ctx.globalAlpha = el.op;
          ctx.fillStyle = el.fill;
          ctx.fillRect(el.x0 + (el.x1 - el.x0) * u, el.y, el.w, el.h);
          ctx.globalAlpha = 1;
          break;
        }
        case "scroll": {  // group sliding left one period per loop (Helix)
          const f = ((t / el.dur) % 1 + 1) % 1;
          ctx.save();
          ctx.translate(-el.dx * f, 0);
          for (const s of el.els) {
            if (s.p) {
              ctx.strokeStyle = s.c;
              ctx.lineWidth = s.w;
              ctx.stroke(fxPath(s.p));
            } else if (s.l) {
              ctx.globalAlpha = s.a != null ? s.a : 1;
              ctx.strokeStyle = s.c;
              ctx.lineWidth = s.w;
              ctx.beginPath();
              ctx.moveTo(s.l[0], s.l[1]);
              ctx.lineTo(s.l[2], s.l[3]);
              ctx.stroke();
              ctx.globalAlpha = 1;
            } else {
              ctx.fillStyle = s.c;
              ctx.beginPath();
              ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.restore();
          break;
        }
        case "rot": {  // group rotating around a point (Portal arms + spark)
          const dir = el.ccw ? -1 : 1;
          const ang = dir * (((t / el.dur) % 1 + 1) % 1) * Math.PI * 2;
          ctx.save();
          ctx.translate(el.cx, el.cy);
          ctx.rotate(ang);
          ctx.translate(-el.cx, -el.cy);
          if (el.paths) {
            ctx.lineCap = "round";
            for (const sp of el.paths) {
              ctx.globalAlpha = sp.a != null ? sp.a : 1;
              ctx.strokeStyle = sp.c;
              ctx.lineWidth = sp.w;
              ctx.stroke(fxPath(sp.p));
            }
            ctx.globalAlpha = 1;
          }
          if (el.dots) {
            for (const d of el.dots) {
              ctx.fillStyle = d.c;
              ctx.beginPath();
              ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.restore();
          break;
        }
      }
    }
  }

  function drawShipFx(itemId, x, y, w, h, rotDeg, hasFx) {
    const item = skinItem(itemId);
    if (!item || !item.fx) return;
    if (!scoutHullPath) scoutHullPath = new Path2D(SCOUT_HULL_D);
    const t = performance.now() / 1000;
    ctx.save();
    ctx.translate(x, y);
    if (rotDeg) ctx.rotate((rotDeg * Math.PI) / 180);
    // match drawSprite: image spans -w/2..w/2 around the ship center
    ctx.translate(-w / 2, -h / 2);
    ctx.scale(w / FX_DW, h / FX_DH);
    ctx.translate(FX_OX, FX_OY);
    ctx.clip(scoutHullPath);

    if (item.fx === "starfield") {
      drawStarfieldFx(t);
    } else {
      // For animated skins: draw complete ship procedurally (hull, shade, effects, glass, nozzles)
      // so there's no double-image from the static base SVG frame.
      if (hasFx) {
        const st = SKIN_STATIC[item.fx];
        if (st && st.hull) {
          ctx.fillStyle = st.hull;
          ctx.fill(fxPath(SCOUT_HULL_D));
        }
        if (st && st.shade) {
          ctx.fillStyle = st.shade;
          ctx.fill(fxPath("M239.6033,183.53019l-7.47508,8.90777h-3.52648v-9.27767l-3.00226,0.10211l-3.62261,3.55415h-2.39941v-14.31297h2.1687l3.77086,3.6995h3.26929v-8.75877l2.88049,-0.08648l8.02879,8.82129l19.19527,3.63229z"));
        }
      }
      drawTableFx(item.fx, t);
      // glass and nozzles on top (matches SVG layering)
      ctx.fillStyle = SKIN_GLASS[item.fx] || "#e4e7ff";
      ctx.fill(fxPath(FX_GLASS_D));
      ctx.fillStyle = "#3b4069";
      ctx.fill(fxPath(FX_NOZZLE_D));
    }
    ctx.restore();
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
      return p.name + "|" + p.health + "|" + p.maxHealth + "|" + p.ammo + "|" + eff.maxAmmo;
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
        for (let i = 0; i < eff.maxAmmo; i++) {
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
            '<span class="ammo" id="hud-ammo-' + pi + '">' + ammo + '</span>' +
            '<div class="hud-laser-energy" id="hud-laser-energy-' + pi + '"><i class="fill"></i></div>' +
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
      if (p.gun) bits.push(GUN_LABELS[p.gun] + " " + Math.ceil(p.gunT) + "s");
      if (p.invulnT > 0) bits.push("INVULNERABLE");
      if (p.shield > 0) bits.push("SHIELD " + p.shield);
      if (shrinkT > 0) bits.push("SHRUNK " + shrinkT.toFixed(1) + "s");
      if (slowT > 0) bits.push("SLOW " + slowT.toFixed(1) + "s");
      chip.textContent = bits.join("  |  ");
      chip.classList.toggle("out", p.health <= 0);
      chip.classList.toggle("gun-on", !!p.gun);

      // laser swaps the bullet counter for an energy bar
      const ebar = document.getElementById("hud-laser-energy-" + pi);
      const ammoEl = document.getElementById("hud-ammo-" + pi);
      const isLaser = !!p.gun && p.gun === "laser";
      if (ebar) {
        ebar.classList.toggle("on", isLaser);
        if (isLaser) {
          const fill = ebar.querySelector(".fill");
          fill.style.width = Math.max(0, Math.min(100, p.energy)) + "%";
          fill.classList.toggle("low", p.energy < 25);
        }
      }
      if (ammoEl) ammoEl.style.display = isLaser ? "none" : "";
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
    updateComboList();
  }

  /* Bottom-left list of every active bullet's combo, biggest first.
   Only rewrites the DOM when something actually changed. */
  function updateComboList() {
    const host = document.getElementById("hud-combos");
    if (!host) return;
    const rows = bullets
      .filter(function (b) { return b.combo >= 2; })
      .map(function (b) { return { bid: b.bid, combo: b.combo }; })
      .concat(comboGhosts.map(function (g) { return { bid: g.bid, combo: g.combo }; }))
      .sort(function (a, b) { return b.combo - a.combo || a.bid - b.bid; });
    const key = rows.map(function (r) { return r.bid + ":" + r.combo; }).join(",");
    if (host._key === key) return;
    host._key = key;
    let html = "";
    rows.forEach(function (r) {
      const cls = r.combo >= 6 ? "c-hot" : r.combo >= 4 ? "c-warm" : "";
      html += '<div class="combo-chip ' + cls + '">COMBO x' + r.combo + '</div>';
    });
    host.innerHTML = html;
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
    // Cheat helper: equip a gun on P1 (active run required).
    grantGun: function (id) {
      const pl = players[0];
      if (!pl) return false;
      applyGun(pl, id);
      return true;
    },
    isOver: function () { return state === STATE.OVER; },
    isInGame: function () { return state === STATE.PLAYING || state === STATE.PAUSED; },
    claimAllRewards,
    closeRewards,
    openRewards,
    unclaimedCount
  };
})();