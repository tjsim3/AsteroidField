/* =====================================================
   save.js - everything to do with saving the player's
   progress in the browser (localStorage)
   ===================================================== */

window.SAVE = (function () {

  const KEY = "asteroid-field-save-v1";

  /* A fresh save: the player starts with $0 and the basic skins. */
  function defaultSave() {
    return {
      money: 0,
      equipment: {
        ship: "ship-0",
        bullet: "bullet-1",
        background: "space",
        boost: "trail-2"
      },
      // Owned customization ids, one list per category. Found via Shop drops.
      owned: {
        ship: ["ship-0"],
        bullet: ["bullet-1"],
        boost: ["trail-2"],
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
        pickups: {               // lifetime pickups found
          money: 0, reload: 0, health: 0, slow: 0, shrink: 0, clear: 0
        }
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