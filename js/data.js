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
    playerSpeed: 520,      // up/down speed (px/s)
    bulletPierce: 2,       // a bullet can punch through this many EXTRA asteroids
    moneyPerBill: 20,      // value of the dollar bill drop
    moneyPerAsteroid: 2,   // small reward for destroying an asteroid
    chestPrice: 50,        // base price of one Shop drop (escalates with each purchase)
    asteroidSpeedMul: 1.45, // how much faster asteroids fly left
    scorePerSecond: 10     // score gained just for surviving (destroying rocks gives money, not points)
  };

  /* ---------- Ship skins ---------- */
  const shipFiles = [
    "0.svg", "1.svg", "2.svg", "3 (1).svg", "4.svg", "5.svg", "6.svg",
    "7.svg", "8.svg", "9.svg",
    "costume1.svg", "costume2.svg", "costume3.svg", "costume4.svg", "costume5.svg"
  ];

  const ships = shipFiles.map((file, i) => ({
    id: "ship-" + i,
    file: file,
    src: "ShipSkins/" + file,
    name: "Ship " + (i + 1)
  }));

  /* ---------- Bullet skins ---------- */
  // The skins are already drawn as a pair of bullets facing right, so they
  // are never rotated in-game.
  const bullets = [];
  for (let i = 1; i <= 10; i++) {
    bullets.push({
      id: "bullet-" + i,
      file: "costume" + i + ".svg",
      src: "BulletSkins/costume" + i + ".svg",
      name: "Shot " + i,
      rot: 0
    });
  }

  /* ---------- Boost trail skins ---------- */
  const trails = [];
  for (let i = 1; i <= 5; i++) {
    trails.push({
      id: "trail-" + i,
      file: "costume" + i + ".svg",
      src: "PlayerTrailSkins/costume" + i + ".svg",
      name: "Trail " + i
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
    }
  ];

  /* ---------- Power-ups ---------- */
  // All power-ups are active by default (the Shop sells skins, not these).
  const powerups = [
    /* weight makes some drops show up more often than others */
    { id: "reload", name: "Bullet Drop", desc: "The green circle gives you +3 bullets when collected.", icon: "AsteroidsAndPowerups/Reload.svg", weight: 3 },
    { id: "health", name: "Health Drop", desc: "The battery heals +1 life. Full? You get cash instead.", icon: "AsteroidsAndPowerups/Health.svg", weight: 1 },
    { id: "slow", name: "Slow Drop", desc: "Slow-motion! All asteroids move at half speed for 6 seconds.", icon: "AsteroidsAndPowerups/SlowDown.svg", weight: 1 },
    { id: "shrink", name: "Shrink Drop", desc: "Shrink your ship so you are harder to hit, for 6 seconds.", icon: "AsteroidsAndPowerups/Shrink.svg", weight: 1 },
    { id: "clear", name: "Screen Clear", desc: "A mighty blast destroys every asteroid on screen. Ka-boom!", icon: "AsteroidsAndPowerups/ClearScreen2.svg", weight: 1 }
  ];

  /* ---------- Achievements (the images ARE the achievement buttons) ---------- */
  const achievements = [
    { id: "rounds_50",    file: "costume2.svg",  name: "Play 50 Rounds" },
    { id: "destroy_1000", file: "costume3.svg",  name: "Destroy 1000 Asteroids" },
    { id: "destroy_10000",file: "costume4.svg",  name: "Destroy 10000 Asteroids" },
    { id: "buy_all",      file: "costume5.svg",  name: "Buy all the items" },
    { id: "total_1m",     file: "costume6.svg",  name: "Get a total of 1,000,000 points" },
    { id: "round_250",    file: "costume8.svg",  name: "Reach 250 points in one round" },
    { id: "round_750",    file: "costume9.svg",  name: "Reach 750 points in one round" },
    { id: "play_2h",      file: "costume10.svg", name: "Play for 2 hours" },
    { id: "play_10h",     file: "costume11.svg", name: "Play for 10 hours" },
    { id: "rounds_5",     file: "costume12.svg", name: "Play 5 Rounds" }
  ];
  achievements.forEach(function (a) {
    a.src = "Achievements/" + a.file;
    a.desc = a.name;
  });

  /* ---------- Main menu button images ---------- */
  const menuButtons = {
    play: "MenuButtons/costume1.svg",
    store: "MenuButtons/costume2.svg",
    customize: "MenuButtons/costume3.svg",
    achievements: "MenuButtons/costume5.svg"
  };

  /* ---------- Pro tips (black hint bars from the original) ---------- */
  const tips = [
    "costume1.svg",
    "costume2.svg",
    "costume3.svg",
    "costume5.svg",
    "costume6.svg",
    "costume7.svg",
    "costume9.svg",
    "costume10.svg"
  ].map(function (file, i) {
    return { id: "tip-" + (i + 1), src: "ProTips/" + file };
  });

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
  /* Shop drop price goes up the more drops have already been bought. */
  function dropPrice(boughtCount) {
    const n = boughtCount || 0;
    return Math.round(GAME.chestPrice * (1 + 0.5 * n));
  }

  return { GAME, ships, bullets, trails, backgrounds, powerups, achievements, menuButtons, tips, hud, dropIcons, SPREAD, dropPrice };
})();