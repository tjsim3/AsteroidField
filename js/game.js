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
    maxCombo: 0,          // highest combo a single bullet reached this run
    comboTotal: 0,        // combo values added up (a x13 and a x7 = +20)
    comboKills: 0,        // asteroids hit by bullets already on a combo (&ge;2)
    cashBills: 0,        // $ from dollar-bill pickups
    cashWrecks: 0,       // $ from destroyed asteroids
    cashBonus: 0,        // $ from full-health pickups
    scoreSurvival: 0,
    scoreAsteroids: 0,
    pickups: {
      money: 0, reload: 0, health: 0, slow: 0, shrink: 0, clear: 0,
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

  // ---------- timers / status ----------
  let slowT = 0;
  let shrinkT = 0;
  let spawnCd = 1;
  let powerupCd = 2.5;
  let healCd = 30;        // seconds until the next automatic +1 life
  let healsDone = 0;      // completed auto-heals (each one adds 1s to the gap)
  let gunCd = 60;         // seconds until the next gun powerup drifts by
  let gunIndex = 0;       // which gun is next to appear (cycles through them)
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

    runTime = 0;
    score = 0;
    runCash = 0;
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
    gunCd = 60;
    gunIndex = 0;

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
          if (!p.laserOn) p.laserOn = true;
          beamSweep(p);
        }
        if (!firing && p.laserOn) {
          p.laserOn = false;
        }
        if (p.energy <= 0) {
          p.laserOn = false;
          p.gun = null;
          p.gunT = 0;
        }
      } else if (p.laserOn) {
        // gun swapped or expired mid-beam
        p.laserOn = false;
      } else if (p.gun === "rapidfire") {
        p.rapidCd -= dt;
        if (p.rapidCd <= 0) {
          p.rapidCd = 0.09;
          fireGun(p);
        }
      } else if (shoot && p.ammo > 0 && p.fireCd <= 0) {
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

    // ---- gun drops: one weapon pickup flies by every 60s, cycling
    //      through laser, shotgun, rockets, rapid fire, shock ----
    gunCd -= dt;
    if (gunCd <= 0) {
      gunCd = 60;
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
          b.combo = shockChain(b.x, b.y);
          b.comboPop = 0.15;
          if (b.combo > runStats.maxCombo) runStats.maxCombo = b.combo;
          addComboTotal(b.combo);
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
    SFX.bigBoom();
    return killed;
  }

  /* Shock: chain lightning - the bolt eats a rock, then jumps to any rock
     within range of it, and so on. Returns how many rocks it zapped. */
  const SHOCK_RANGE = 140;
  function shockChain(x, y) {
    const rangeOf = function (ax, ay) {
      return function (o) {
        return circleHit(ax, ay, SHOCK_RANGE, o.x, o.y, o.r);
      };
    };
    let pending = asteroids.filter(rangeOf(x, y));
    const hit = [];
    while (pending.length) {
      const a = pending.pop();
      if (hit.indexOf(a) > -1) continue;
      hit.push(a);
      asteroids.forEach(function (o) {
        if (hit.indexOf(o) < 0 && rangeOf(a.x, a.y)(o)) pending.push(o);
      });
      if (hit.length > 1) FX.lightning(a.x, a.y, hit[hit.length - 2].x, hit[hit.length - 2].y);
    }
    hit.forEach(function (a) { destroyAsteroid(a, false); });
    if (hit.length) SFX.zap();
    return hit.length;
  }

  /* Each finished combo (a bullet that punched through rocks) adds its size
   to the lifetime accumulated-combo total; unlocks live when a goal is hit. */
  const COMBO_TOTAL_ACH = [[500, "combos_500"], [1000, "combos_1000"], [5000, "combos_5000"]];
  function addComboTotal(n) {
    runStats.comboTotal += n;
    const cumulative = SAVE.load().stats.comboTotal + runStats.comboTotal;
    COMBO_TOTAL_ACH.forEach(function (c) {
      if (cumulative >= c[0]) UI.unlock(c[1]);
    });
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
    SFX.shoot();
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
    SFX.shoot();
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
    SFX.shoot();
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
        // Fixed spawn instead of randomness: both children sit 1/3 of the
        // width in from the parent's leftmost edge and 1/6 of the height
        // above/below the parent's center. A bullet that hits the top-front
        // or bottom-front of the rock also plows through the matching child.
        const cx = a.x - a.r / 3;
        for (const side of [-1, 1]) {
          // Blend of the old random scatter and the fixed stack: children stay
          // roughly 1/3 of the width in from the left edge and stacked
          // top/bottom, with a little wobble so repeated splits don't look
          // identical. The boost keeps the fragments flinging apart quickly.
          const wob = (Math.random() - 0.5) * child.r * 0.6;
          const vy = side * (70 + child.speed * (0.5 + Math.random() * 0.3));
          asteroids.push({
            x: cx + wob,
            y: a.y + side * (a.r / 3) + wob,
            r: child.r,
            size: child,
            vx: -child.speed * (0.8 + Math.random() * 0.4) * G.asteroidSpeedMul,
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

  /* One gun pickup per minute, cycling laser -> shotgun -> rockets ->
     rapid fire -> shock (then back around). */
  const GUN_ORDER = ["laser", "shotgun", "rockets", "rapidfire", "shock"];
  function spawnGunPickup() {
    const id = GUN_ORDER[gunIndex % GUN_ORDER.length];
    gunIndex++;
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
    pl.ammo = Math.min(G.maxAmmo, pl.ammo + 5);
    const f = PFX[id] || { color: "#ffffff", msg: "" };
    FX.pickupFx(pl.x, pl.y, f.color);
    FX.floatText(pl.x, pl.y - 40, f.msg, f.color, 18);
    SFX.power();
  }

  function spawnPowerup() {
    // Money's spawn weight was cut to a third of what it used to be:
    // it now keeps a steady weight of 1 (about 1-in-8 drops at any
    // point in the run) instead of dominating the early game.
    const t = Math.min(1, runTime / 90);
    const moneyW = Math.max(1, Math.round((4 - t * 3) / 3));
    const pool = [];
    for (let k = 0; k < moneyW; k++) pool.push("money");
    DATA.powerups.forEach(function (p) {
      // guns show up on their own 60-second timer, not in the random pool
      if (p.dur) return;
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
      SFX.coin();
    } else if (pwr.id === "reload") {
      pl.ammo = Math.min(G.maxAmmo, pl.ammo + 3);
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
    save.stats.comboTotal = (save.stats.comboTotal || 0) + runStats.comboTotal;
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
        '<div><span>Best Shot Combo</span><span class="combo-stat">x' + st.maxCombo + '</span></div>' +
        '<div><span>Asteroids in Combos</span><span>' + st.comboKills + '</span></div>' +
      '</div>' +

      '<div class="gameover-section">Collectibles</div>' +
      '<div class="gameover-grid">' +
        '<div><span>Dollar Bills</span><span>' + st.pickups.money + '</span></div>' +
        '<div><span>Reload Packs</span><span>' + st.pickups.reload + '</span></div>' +
        '<div><span>Health Restores</span><span>' + st.pickups.health + '</span></div>' +
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
          drawSprite(ASSETS_SRC(p.ship), p.x, p.y, shipW, shipH, p.pitch + p.wobble);
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
    isInGame: function () { return state === STATE.PLAYING || state === STATE.PAUSED; }
  };
})();