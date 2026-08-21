/* =====================================================
   data.js - all of the game's data / configuration
   (skins, power-up drops, backgrounds, achievements)
   ===================================================== */

window.DATA = (function () {

  /* ---------- In-game balance constants ---------- */
  const GAME = {
    startHealth: 6,        // lives at the start of a run
    maxHealth: 6,          // lives cap
    startAmmo: 12,         // bullets at the start
    maxAmmo: 24,           // bullet cap
    fireCooldown: 0.16,    // seconds between shots (hold Space to auto-fire)
    slowMoDuration: 12,    // seconds the Slow-Mo power-up lasts
    playerSpeed: 520,      // up/down speed (px/s)
    bulletPierce: 2,       // a bullet can punch through this many EXTRA asteroids
    moneyPerBill: 50,      // value of the dollar bill drop
    moneyPerAsteroid: 2,   // small reward for destroying an asteroid
    asteroidSpeedMul: 1.45, // how much faster asteroids fly left
    scorePerSecond: 10     // score gained just for surviving (destroying rocks gives money, not points)
  };

  /* ---------- Ship skins ---------- */
  const shipFiles = [
    "0.svg", "1.svg", "2.svg", "3 (1).svg", "4.svg", "5.svg", "6.svg",
    "7.svg", "8.svg", "9.svg",
    "costume1.svg", "costume2.svg", "costume3.svg", "costume4.svg", "costume5.svg",
    "costume6.svg", "costume7.svg", "costume8.svg", "costume9.svg",
    "costume10.svg", "costume11.svg", "costume12.svg"
  ];

  const SHIP_NAMES = [
    "Scout", "Striker", "Falcon", "Viper", "Sunray", "Ranger", "Wraith",
    "Spectre", "Mantis", "Barracuda", "Nova", "Comet", "Phantom", "Pulsar", "Eclipse",
    "Azure", "Plasma", "Cinder", "Rose",
    "Cobalt", "Rosegold", "Fusion"
  ];

  const ships = shipFiles.map((file, i) => ({
    id: "ship-" + i,
    file: file,
    src: "ShipSkins/" + file,
    name: SHIP_NAMES[i]
  }));

  /* ---------- Level-reward ships ---------- */
  // Earned on the XP track (never sold in shop drops). rewardLevel is the
  // level whose claim unlocks the skin; XP.rewardFor pays $0 on those levels.
  // fx names the canvas-side animator in game.js - drawImage() can't play
  // SMIL animation on the game canvas, so each animated skin's moving parts
  // are redrawn live from these tables.
  const rewardShips = [
    { id: "ship-neon",      file: "costume14.svg", src: "ShipSkins/costume14.svg", name: "Neon Trace",   rewardLevel: 10,  fx: "neon" },
    { id: "ship-prism",     file: "costume15.svg", src: "ShipSkins/costume15.svg", name: "Prism",        rewardLevel: 20,  fx: "prism" },
    { id: "ship-circuit",   file: "costume16.svg", src: "ShipSkins/costume16.svg", name: "Circuit Flow", rewardLevel: 30,  fx: "circuit" },
    { id: "ship-helix",     file: "costume17.svg", src: "ShipSkins/costume17.svg", name: "DNA Helix",    rewardLevel: 40,  fx: "helix" },
    { id: "ship-scanline",  file: "costume18.svg", src: "ShipSkins/costume18.svg", name: "Scanline",     rewardLevel: 50,  fx: "scan" },
    { id: "ship-ekg",       file: "costume19.svg", src: "ShipSkins/costume19.svg", name: "EKG Monitor",  rewardLevel: 60,  fx: "ekg" },
    { id: "ship-hexpulse",  file: "costume20.svg", src: "ShipSkins/costume20.svg", name: "Hex Pulse",    rewardLevel: 70,  fx: "hex" },
    { id: "ship-magma",     file: "costume21.svg", src: "ShipSkins/costume21.svg", name: "Magma Veins",  rewardLevel: 80,  fx: "magma" },
    { id: "ship-portal",    file: "costume22.svg", src: "ShipSkins/costume22.svg", name: "Portal Swirl", rewardLevel: 90,  fx: "portal" },
    { id: "ship-starfield", file: "costume13.svg", src: "ShipSkins/costume13.svg", name: "Starfield",    rewardLevel: 100, fx: "starfield" }
  ];

  /* ---------- Bullet skins ---------- */
  // The skins are already drawn as a pair of bullets facing right, so they
  // are never rotated in-game.
  const BULLET_NAMES = [
    "Basic", "Laser", "Rockets", "Fang", "Wobble", "Slug", "Arrows",
    "Photon", "Pulse", "Ultra Rockets", "Spikes", "Halo", "Meteor", "Shard"
  ];

  const bullets = [];
  for (let i = 0; i < 14; i++) {
    bullets.push({
      id: "bullet-" + (i + 1),
      file: "costume" + (i + 1) + ".svg",
      src: "BulletSkins/costume" + (i + 1) + ".svg",
      name: BULLET_NAMES[i],
      rot: 0
    });
  }

  /* ---------- Boost trail skins ---------- */
  // The first one (Ion, blue) is the player's original boost: it's listed
  // first, drops first, and new players start equipped with it.
  const TRAILS = [
    { file: "costume2.svg", name: "Ion" },
    { file: "costume1.svg", name: "Ember" },
    { file: "costume3.svg", name: "Stardust" },
    { file: "costume4.svg", name: "BOOST" },
    { file: "costume5.svg", name: "Aurora" },
    { file: "costume6.svg", name: "Frost" },
    { file: "costume7.svg", name: "Phantom" }
  ];
  const trails = [];
  for (let i = 0; i < TRAILS.length; i++) {
    trails.push({
      id: "trail-" + (i + 1),
      file: TRAILS[i].file,
      src: "PlayerTrailSkins/" + TRAILS[i].file,
      name: TRAILS[i].name
    });
  }

  /* ---------- Backgrounds (procedurally drawn, moving) ---------- */
  // Each background lists the colours used to draw a scrolling star-field.
  const backgrounds = [
    {
      id: "space",
      name: "Space",
      skyTop: "#04071a", skyBottom: "#0a1338",
      stars: [
        { count: 70, size: [1, 2], speed: [30, 90], colors: ["#ffffff", "#bcd6ff"] },
        { count: 30, size: [2, 3], speed: [90, 170], colors: ["#ffffff", "#8fd0ff"] }
      ],
      accent: "#6ea8ff"
    },
    {
      id: "nebula",
      name: "Nebula",
      skyTop: "#190b2e", skyBottom: "#3a1140",
      stars: [
        { count: 70, size: [1, 2], speed: [30, 90], colors: ["#ffd3f7", "#c9b6ff"] },
        { count: 30, size: [2, 3], speed: [90, 170], colors: ["#ffffff", "#ff8ac2"] }
      ],
      accent: "#ff6ac1"
    },
    {
      id: "aurora",
      name: "Aurora",
      skyTop: "#041512", skyBottom: "#083f37",
      stars: [
        { count: 70, size: [1, 2], speed: [30, 90], colors: ["#c9ffe9", "#ffffff"] },
        { count: 30, size: [2, 3], speed: [90, 170], colors: ["#8fffc2", "#5ee6ff"] }
      ],
      accent: "#3affa1"
    },
    {
      id: "sunset",
      name: "Sunset",
      skyTop: "#2b0a2e", skyBottom: "#7a2a12",
      stars: [
        { count: 70, size: [1, 2], speed: [30, 90], colors: ["#ffcf9a", "#ff9aa8"] },
        { count: 30, size: [2, 3], speed: [90, 170], colors: ["#fff2c0", "#ffb347"] }
      ],
      accent: "#ff9a3c"
    },
    {
      id: "void",
      name: "Void",
      skyTop: "#020202", skyBottom: "#101018",
      stars: [
        { count: 90, size: [1, 2], speed: [30, 90], colors: ["#888888", "#ffffff"] },
        { count: 40, size: [2, 3], speed: [90, 170], colors: ["#bbbbbb", "#ffffff"] }
      ],
      accent: "#9a9ab0"
    },
    {
      id: "candy",
      name: "Candy",
      skyTop: "#33062e", skyBottom: "#0b0f3d",
      stars: [
        { count: 70, size: [1, 2], speed: [30, 90], colors: ["#ffb6e0", "#b6dcff"] },
        { count: 30, size: [2, 3], speed: [90, 170], colors: ["#ff6ef0", "#6ea8ff"] }
      ],
      accent: "#ff6ec7"
    },
    {
      id: "solarflare",
      name: "Solar Flare",
      skyTop: "#2a0a13", skyBottom: "#83210e",
      stars: [
        { count: 70, size: [1, 2], speed: [30, 90], colors: ["#ffd9a0", "#ffb066"] },
        { count: 30, size: [2, 3], speed: [90, 170], colors: ["#ffe27a", "#ff8a4d"] }
      ],
      accent: "#ffb347"
    },
    {
      id: "deepvoid",
      name: "Deep Void",
      skyTop: "#01030a", skyBottom: "#0a1130",
      stars: [
        { count: 70, size: [1, 2], speed: [30, 90], colors: ["#6ea8ff", "#9bc4ff"] },
        { count: 30, size: [2, 3], speed: [90, 170], colors: ["#bcd6ff", "#ffffff"] }
      ],
      accent: "#7aa8ff"
    },
    {
      id: "crimsonbelt",
      name: "Crimson Belt",
      skyTop: "#1a072e", skyBottom: "#5c0d17",
      stars: [
        { count: 70, size: [1, 2], speed: [30, 90], colors: ["#ff8a8a", "#ffb0b0"] },
        { count: 30, size: [2, 3], speed: [90, 170], colors: ["#ff6a6a", "#ffd3d3"] }
      ],
      accent: "#ff6a6a"
    },
    {
      id: "icefield",
      name: "Ice Field",
      skyTop: "#e8fbff", skyBottom: "#1b4d6b",
      stars: [
        { count: 70, size: [1, 2], speed: [30, 90], colors: ["#ffffff", "#dff6ff"] },
        { count: 30, size: [2, 3], speed: [90, 170], colors: ["#ffffff", "#b7ecff"] }
      ],
      accent: "#7fb6e6"
    }
  ];

  /* ---------- Power-ups ---------- */
  // All power-ups are active by default (the Shop sells skins, not these).
  const powerups = [
    /* weight makes some drops show up more often than others */
    { id: "reload", name: "Bullet Drop", desc: "The green circle gives you +3 bullets when collected.", icon: "AsteroidsAndPowerups/Reload.svg", weight: 3 },
    { id: "slow", name: "Slow Drop", desc: "Slow-motion! All asteroids move at half speed for 6 seconds.", icon: "AsteroidsAndPowerups/SlowDown.svg", weight: 1 },
    { id: "shrink", name: "Shrink Drop", desc: "Shrink your ship so you are harder to hit, for 6 seconds.", icon: "AsteroidsAndPowerups/Shrink.svg", weight: 1 },
    { id: "clear", name: "Screen Clear", desc: "A mighty blast destroys every asteroid on screen. Ka-boom!", icon: "AsteroidsAndPowerups/ClearScreen2.svg", weight: 1 },
    { id: "shield", name: "Shield", desc: "One temporary shield with 2 HP that absorbs hits.", icon: "AsteroidsAndPowerups/Shield.svg", weight: 0.25 },
    // gun powerups - they override your shots for a while (dur = seconds)
    { id: "laser", name: "Laser", desc: "Your shots become a blazing energy beam for 30 seconds.", icon: "AsteroidsAndPowerups/Laser.svg", weight: 1, dur: 30 },
    { id: "shotgun", name: "Shotgun", desc: "Blast 9 pellets in a spread for 30 seconds.", icon: "AsteroidsAndPowerups/Shotgun.svg", weight: 1, dur: 30 },
    { id: "rockets", name: "Rockets", desc: "Fire rockets that explode in a firey blast on impact, for 30 seconds.", icon: "AsteroidsAndPowerups/Rockets.svg", weight: 1, dur: 30 },
    { id: "rapidfire", name: "Rapid Fire", desc: "Auto-fire for 10 seconds without using any bullets.", icon: "AsteroidsAndPowerups/RapidFire.svg", weight: 1, dur: 10 },
    { id: "shock", name: "Shock", desc: "Chain lightning that leaps between nearby asteroids, for 30 seconds.", icon: "AsteroidsAndPowerups/Shock.svg", weight: 1, dur: 30 }
  ];

  /* ---------- Achievements (the images ARE the achievement buttons) ---------- */
  // Progressive chains are grouped together; "track" names the save stat (or
  // "buyall") that drives the progress shown on the Achievements screen, and
  // "goal" is that stat's target value.
  const achievements = [
    // Points in one round (tracked by best single-run score)
    { id: "round_500",    file: "a-round-500.svg",    name: "Reach 500 Points",     group: "Points in One Round",    track: "bestScore", goal: 500 },
    { id: "round_2000",   file: "a-round-2000.svg",   name: "Reach 2000 Points",    group: "Points in One Round",    track: "bestScore", goal: 2000 },
    { id: "round_5000",   file: "a-round-5000.svg",   name: "Reach 5000 Points",    group: "Points in One Round",    track: "bestScore", goal: 5000 },
    { id: "round_10000",  file: "a-round-10000.svg",  name: "Reach 10000 Points",   group: "Points in One Round",    track: "bestScore", goal: 10000 },
    { id: "round_25000",  file: "a-round-25000.svg",  name: "Reach 25000 Points",   group: "Points in One Round",    track: "bestScore", goal: 25000 },

    // Time played
    { id: "play_1h", file: "a-play-1h.svg", name: "Play for 1 Hour",  group: "Time Played", track: "totalTime", goal: 3600 },
    { id: "play_5h", file: "a-play-5h.svg", name: "Play for 5 Hours", group: "Time Played", track: "totalTime", goal: 18000 },

    // Total points
    { id: "total_10k",  file: "a-total-10k.svg",  name: "10,000 Total Points",     group: "Total Points", track: "lifetimeScore", goal: 10000 },
    { id: "total_100k", file: "a-total-100k.svg", name: "100,000 Total Points",    group: "Total Points", track: "lifetimeScore", goal: 100000 },
    { id: "total_1m",   file: "a-total-1m.svg",   name: "1,000,000 Total Points",  group: "Total Points", track: "lifetimeScore", goal: 1000000 },

    // Rounds played
    { id: "rounds_5",   file: "a-rounds-5.svg",   name: "Play 5 Rounds",   group: "Rounds Played", track: "runsPlayed", goal: 5 },
    { id: "rounds_10",  file: "a-rounds-10.svg",  name: "Play 10 Rounds",  group: "Rounds Played", track: "runsPlayed", goal: 10 },
    { id: "rounds_50",  file: "a-rounds-50.svg",  name: "Play 50 Rounds",  group: "Rounds Played", track: "runsPlayed", goal: 50 },
    { id: "rounds_100", file: "a-rounds-100.svg", name: "Play 100 Rounds", group: "Rounds Played", track: "runsPlayed", goal: 100 },
    { id: "rounds_250", file: "a-rounds-250.svg", name: "Play 250 Rounds", group: "Rounds Played", track: "runsPlayed", goal: 250 },

    // Asteroids destroyed
    { id: "destroy_100",   file: "a-destroy-100.svg",   name: "Destroy 100 Asteroids",   group: "Asteroids Destroyed", track: "asteroidsDestroyed", goal: 100 },
    { id: "destroy_1000",  file: "a-destroy-1000.svg",  name: "Destroy 1000 Asteroids",  group: "Asteroids Destroyed", track: "asteroidsDestroyed", goal: 1000 },
    { id: "destroy_10000", file: "a-destroy-10000.svg", name: "Destroy 10000 Asteroids", group: "Asteroids Destroyed", track: "asteroidsDestroyed", goal: 10000 },
    { id: "destroy_25000", file: "a-destroy-25000.svg", name: "Destroy 25000 Asteroids", group: "Asteroids Destroyed", track: "asteroidsDestroyed", goal: 25000 },

    // Total combos, accumulated (a x13 and a x7 add 20) - tracked live
    { id: "combos_500",  file: "a-combos-500.svg",  name: "500 Total Combos",  group: "Total Combos", track: "comboTotal", goal: 500 },
    { id: "combos_1000", file: "a-combos-1000.svg", name: "1,000 Total Combos", group: "Total Combos", track: "comboTotal", goal: 1000 },
    { id: "combos_5000", file: "a-combos-5000.svg", name: "5,000 Total Combos", group: "Total Combos", track: "comboTotal", goal: 5000 },

    // Longest single-bullet combo
    { id: "long_10", file: "a-long-10.svg", name: "Longest Combo 10x", group: "Longest Combo", track: "bestCombo", goal: 10 },
    { id: "long_20", file: "a-long-20.svg", name: "Longest Combo 20x", group: "Longest Combo", track: "bestCombo", goal: 20 },
    { id: "long_30", file: "a-long-30.svg", name: "Longest Combo 30x", group: "Longest Combo", track: "bestCombo", goal: 30 },
    { id: "long_40", file: "a-long-40.svg", name: "Longest Combo 40x", group: "Longest Combo", track: "bestCombo", goal: 40 },

    // Staples
    { id: "buy_all", file: "a-buy-all.svg", name: "Buy All the Items", group: "Staples", track: "buyall", goal: 1 }
  ];
  achievements.forEach(function (a) {
    a.src = "Achievements/" + a.file;
    a.desc = a.name;
  });

  /* ---------- Pro tips (shown as text on the main menu) ---------- */
  const tips = [
    "Your bullets are worth using - every rock they hit adds score.",
    "Don't grab a bullet or health pack when you're full - it's wasted.",
    "Big rocks split twice, small rocks don't split.",
    "Bullets punch straight through every rock they hit.",
    "Shoot where you plan to fly to clear your path.",
    "Big wrecks pay $3, mediums $2, smalls pay $1.",
    "A health pack flies by every 30 seconds - grab it to heal +1 (each pack arrives a second later than the last).",
    "Dollar bills are worth $50 and raise your score.",
    "Survival scores too: 10 points each second alive.",
    "Slow-Mo slows the rocks, not you - cross now.",
    "Bills fade late in a run - power-ups take over.",
    "Save your bullets for when you need them most.",
    "Screen Clear pays points but holds back the cash.",
    "Dead-center hits destroy the pieces that split off.",
    "Bullets that chain rocks keep a combo going - chase the x2, x3...",
    "Use your second of recovery to get out of the way.",
    "Grab every dollar bill you can - it banks to real cash.",
    "Power-ups usually show up in groups - look for a second.",
    "A gun drop (laser, shotgun, rockets, rapid fire, shock) flies by roughly every minute - grab it to swap your shots and reload +5 bullets.",
    "You can squeeze through small gaps if you keep moving."
  ];

  /* ---------- HUD images (score digits + bullet dots + fade effect) ---------- */
  const hud = {
    digitFiles: {
      "0": "ScoreDigits/costume10.svg",
      "1": "ScoreDigits/costume1.svg",
      "2": "ScoreDigits/costume2.svg",
      "3": "ScoreDigits/costume3.svg",
      "4": "ScoreDigits/costume4.svg",
      "5": "ScoreDigits/costume5.svg",
      "6": "ScoreDigits/costume6.svg",
      "7": "ScoreDigits/costume7.svg",
      "8": "ScoreDigits/costume8.svg",
      "9": "ScoreDigits/costume9.svg"
    },
    bulletDot: "BulletCounter/costume1.svg",
    fade: "SpecialFadingScreenEffects/costume1.png"
  };

  /* ---------- Shared spread of the power-up icons used by the HUD ---------- */
  const dropIcons = {};
  powerups.forEach(function (p) { dropIcons[p.id] = p.icon; });

  const SPREAD = {
    asteroid: "AsteroidsAndPowerups/Asteroid.svg",
    explosion: "AsteroidsAndPowerups/EntityEffects/AsteroidDestroyed.svg",
    healFx: "AsteroidsAndPowerups/EntityEffects/GainedHealth.svg"
  };

  /* ---------- Helpers ---------- */
  /* Shop drop types: each has its own base price and a price rise per drop
     opened of that type. "random" pulls from any category. */
  const DROPS = {
    random:     { name: "Random Drop",      base: 200, inc: 50 },
    ship:       { name: "Ship Drop",        base: 250, inc: 60 },
    bullet:     { name: "Bullet Drop",      base: 300, inc: 75 },
    boost:      { name: "Boost Drop",       base: 400, inc: 100 },
    background: { name: "Background Drop",  base: 400, inc: 100 }
  };
  const DROP_ORDER = ["random", "ship", "bullet", "boost", "background"];

  function dropPrice(type, count) {
    const d = DROPS[type];
    return d.base + d.inc * (count || 0);
  }

  /* ---------- Permanent Shop upgrades ---------- */
  // Each upgrade is bought one level at a time with money earned in-game.
  // `value(lv)` returns the effective stat at that purchased level. The
  // gameplay code reads these (via DATA) so the effect is always current.
  const UPGRADES = {
    hearts: {
      name: "Extra Hearts",
      icon: "AsteroidsAndPowerups/EntityEffects/GainedHealth.svg",
      max: 6,                    // base 6 hearts -> cap 12 total
      base: 2000, inc: 2000,
      desc: "Permanently +1 heart each level. Caps at 12 hearts.",
      value: function (lv) { return Math.min(12, GAME.maxHealth + lv); }
    },
    startAmmo: {
      name: "Start With More Bullets",
      icon: "AsteroidsAndPowerups/Reload.svg",
      max: null,                 // bounded by your bullet storage instead
      base: 1200, inc: 1200,
      desc: "Start every run with +3 bullets. Never more than your bullet storage.",
      value: function (lv) { return GAME.startAmmo + lv * 3; }
    },
    storage: {
      name: "More Bullet Storage",
      icon: "BulletSkins/costume1.svg",
      max: 5,                    // base 24 bullets -> cap 39
      base: 1600, inc: 1600,
      desc: "Permanently +3 bullet capacity each level. Caps at 39 bullets.",
      value: function (lv) { return Math.min(39, GAME.maxAmmo + lv * 3); }
    },
    gunDrop: {
      name: "Gun Drop Frequency",
      icon: "AsteroidsAndPowerups/RapidFire.svg",
      max: 5,                    // base 60s -> floor 50s
      base: 1500, inc: 1500,
      desc: "Gun powerups drift by 2 seconds sooner each level. Minimum 50 seconds.",
      value: function (lv) { return Math.max(50, 60 - lv * 2); }
    }
  };
  const UPGRADE_ORDER = ["hearts", "startAmmo", "storage", "gunDrop"];

  function upgradePrice(id, level) {
    const u = UPGRADES[id];
    return u.base + u.inc * (level || 0);
  }

  return { GAME, ships, rewardShips, bullets, trails, backgrounds, powerups, achievements, tips, hud, dropIcons, SPREAD, dropPrice, DROPS, DROP_ORDER, UPGRADES, UPGRADE_ORDER, upgradePrice };
})();