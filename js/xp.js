/* =====================================================
   xp.js - player experience levels and level-up rewards
   =====================================================
   Players earn XP two ways:
     - finishing a run (based on score + time survived)
     - unlocking achievements (+ a chunk each)
   Every level-up pays out a money reward. Reward tiers:
     normal level ....... small
     multiples of 5 ..... higher
     skin levels ........ animated ship skin, no money (see below)
     other multiples of 10 / 25 / 50 ... extra cash
   Skin milestone levels - each unlocks one DATA.rewardShips skin:
     10 Neon Trace, 20 Prism, 30 Circuit Flow, 40 DNA Helix,
     50 Scanline, 60 EKG Monitor, 70 Hex Pulse, 80 Magma Veins,
     90 Portal Swirl, 100 Starfield
    ===================================================== */

window.XP = (function () {

  const MAX_LEVEL = 100;
  const ACHIEVEMENT_XP = 150;   // XP per newly-unlocked achievement

  /* Levels whose reward is an animated ship skin instead of money.
     Must stay in sync with DATA.rewardShips.rewardLevel. */
  const SKIN_LEVELS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  function isSkinLevel(level) {
    return SKIN_LEVELS.indexOf(level) > -1;
  }

  /* XP needed to advance FROM this level to the next.
     Exponential curve: 100 XP for level 1->2, growing ~5.8%
     per level, ending at exactly 25,000 XP for 99->100. */
  const GROWTH = Math.pow(250, 1 / 98);   // so 100 * GROWTH^98 = 25,000

  function toNext(level) {
    if (level >= MAX_LEVEL) return Infinity;
    return Math.round(100 * Math.pow(GROWTH, level - 1));
  }

  /* Money paid when REACHING this level. Skin milestone levels pay no
     money - their reward is the matching ship skin (DATA.rewardShips). */
  function rewardFor(level) {
    if (isSkinLevel(level)) return 0;       // skin level: not cash
    if (level % 50 === 0) return 5000;      // even more
    if (level % 25 === 0) return 2500;      // even more
    if (level % 10 === 0) return 1200;      // extra
    if (level % 5 === 0) return 600;        // higher
    return 250;                             // every other level
  }

  /* XP earned by finishing one run: score does most of the
     talking, survival time adds a little. Never less than 25. */
  function runXp(score, seconds) {
    return Math.max(25, Math.floor(score / 50) + Math.floor(seconds) * 2);
  }

  /* Add XP to a save object. Returns what happened so the UI can
     show it: { gained, levelUps:[{level,reward}], rewardTotal } */
  function gain(s, amount) {
    const x = s.xp;
    x.level = x.level || 1;
    x.current = x.current || 0;
    x.current += amount;
    const levelUps = [];
    let rewardTotal = 0;
    while (x.level < MAX_LEVEL && x.current >= toNext(x.level)) {
      x.current -= toNext(x.level);
      x.level++;
      const reward = rewardFor(x.level);
      rewardTotal += reward;
      levelUps.push({ level: x.level, reward: reward });
    }
    if (x.level >= MAX_LEVEL) x.current = 0;   // maxed out - bar stays full
    return { gained: amount, levelUps: levelUps, rewardTotal: rewardTotal };
  }

  return { MAX_LEVEL, ACHIEVEMENT_XP, SKIN_LEVELS, isSkinLevel, toNext, rewardFor, runXp, gain };
})();
