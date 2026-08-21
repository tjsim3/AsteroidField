/* =====================================================
   save.js - everything to do with saving the player's
   progress in the browser (localStorage)
   ===================================================== */

window.SAVE = (function () {

  const KEY = "asteroid-field-save-v1";

  /* A fresh save: the player starts with $0 and the basic skins. */
  function defaultSave() {
    return {
      version: 2,            // saved-data schema; bumped when skins swap slots
      money: 0,
      xp: {                  // experience levels (see xp.js)
        level: 1,            // current level (1-100)
        current: 0           // xp earned toward the next level
      },
      pendingRewards: [],    // level-up rewards waiting to be collected: [{level, reward}]
      equipment: {
        ship: "ship-0",
        bullet: "bullet-1",
        background: "space",
        boost: "trail-1"
      },
      // Owned customization ids, one list per category. Found via Shop drops.
      owned: {
        ship: ["ship-0"],
        bullet: ["bullet-1"],
        boost: ["trail-1"],
        background: ["space"]
      },
      stats: {
        lifetimeMoney: 0,        // total cash collected from playing
        lifetimeSpent: 0,        // total cash spent in the store
        dropsBought: 0,          // how many Shop drops have been opened (any type)
        dropCounts: {             // drops opened, per type (drives each price)
          random: 0, ship: 0, bullet: 0, boost: 0, background: 0
        },
        lifetimeScore: 0,        // total points ever scored
        asteroidsDestroyed: 0,   // lifetime
        runsPlayed: 0,
        bestScore: 0,
        bestTime: 0,             // longest single run, in seconds
        totalTime: 0,            // total playing time, in seconds
        bulletsFired: 0,         // lifetime shots fired
        asteroidsByBullets: 0,   // lifetime asteroids blasted by your shots
        timesDowned: 0,          // lifetime damage hits taken
        bestCombo: 0,            // highest combo a single bullet ever reached
        comboTotal: 0,           // total combo value accumulated (each finished combo adds its size)
        pickups: {               // lifetime pickups found
          money: 0, reload: 0, health: 0, slow: 0, shrink: 0, clear: 0, shield: 0,
          laser: 0, shotgun: 0, rockets: 0, rapidfire: 0, shock: 0
        }
      },
      // Permanent shop upgrades (each bought once per level).
      upgrades: {
        hearts: 0,     // +1 max heart per level (cap 12 total)
        startAmmo: 0,  // +3 starting bullets per level (capped by storage)
        storage: 0,    // +3 max bullet storage per level (cap 39)
        gunDrop: 0     // gun powerups arrive 2s sooner per level (min 50s)
      },
      achievements: {},          // { id: true } when unlocked
      settings: {
        shake: true,             // screen shake on impacts
        fx: true,                // particle / special effects
        sound: 80               // sound volume (0 = off, 100 = max)
      }
    };
  }

  let current = null;

  function load() {
    if (current) return current;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // v1 -> v2: the first two boost trails swapped slots (the blue "Ion"
        // moved from trail-2 to trail-1). Rebake legacy references so every
        // stored gear choice keeps pointing at the same trail art.
        if (!parsed.version) {
          swapTrailNumbers(parsed);
          parsed.version = 2;
        }
        // Merge over the defaults so new fields never break old saves.
        const base = defaultSave();
        current = mergeDeep(base, parsed);
        // Old saves had power-up drop counts instead of owned skins -
        // make sure whatever is equipped is owned, otherwise it'd look locked.
        normalizeOwned(current);
      } else {
        current = defaultSave();
      }
    } catch (e) {
      current = defaultSave();
    }
    return current;
  }

  /* Make sure the equipped items are always marked as owned. */
  function normalizeOwned(s) {
    ["ship", "bullet", "boost", "background"].forEach(function (cat) {
      const id = s.equipment[cat];
      if (id && s.owned[cat].indexOf(id) < 0) s.owned[cat].push(id);
    });
    // Drop achievements that no longer exist, so legacy saves don't show
    // phantom unlocks in the totals.
    if (s.achievements) {
      Object.keys(s.achievements).forEach(function (id) {
        const def = DATA.achievements.find(function (a) { return a.id === id; });
        if (!def) delete s.achievements[id];
      });
    }
  }

  /* v1 saves stored the original blue boost as trail-2; in v2 it's trail-1.
     Flip any "trail-1"/"trail-2" references so a stored gear choice keeps
     pointing at the same art instead of silently changing trails. */
  function swapTrailNumbers(s) {
    const flip = function (id) {
      if (id === "trail-1") return "trail-2";
      if (id === "trail-2") return "trail-1";
      return id;
    };
    if (s.equipment && s.equipment.boost) s.equipment.boost = flip(s.equipment.boost);
    if (s.owned && Array.isArray(s.owned.boost)) {
      s.owned.boost = s.owned.boost.map(function (id) { return flip(id); });
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(current));
    } catch (e) {
      // storage may be unavailable (private browsing) - just ignore
    }
  }

  function reset() {
    current = defaultSave();
    save();
  }

  /* Deep-ish merge: fills in any missing keys from the defaults. */
  function mergeDeep(base, extra) {
    for (const key of Object.keys(extra)) {
      if (extra[key] && typeof extra[key] === "object" && !Array.isArray(extra[key])) {
        if (!base[key] || typeof base[key] !== "object") base[key] = {};
        mergeDeep(base[key], extra[key]);
      } else {
        base[key] = extra[key];
      }
    }
    return base;
  }

  return { load, save, reset, KEY };
})();