/* =====================================================
   xp.js - player experience levels and level-up rewards
   =====================================================
   Players earn XP two ways:
     - finishing a run (based on score + time survived)
     - unlocking achievements (+ a chunk each)
   Every level-up pays out a money reward. Reward tiers:
     normal level ....... small
     multiples of 5 ..... higher
     multiples of 10 .... extra
     multiples of 25 .... even more
     multiples of 50 .... even more than that
     level 100 .......... jackpot
   ===================================================== */

window.XP = (function () {

  const MAX_LEVEL = 100;
  const ACHIEVEMENT_XP = 150;   // XP per newly-unlocked achievement

  /* XP needed to advance FROM this level to the next.
     Exponential curve: 100 XP for level 1->2, growing ~5.8%
     per level, ending at exactly 25,000 XP for 99->100. */
  const GROWTH = Math.pow(250, 1 / 98);   // so 100 * GROWTH^98 = 25,000

  function toNext(level) {
    if (level >= MAX_LEVEL) return Infinity;
    return Math.round(100 * Math.pow(GROWTH, level - 1));
  }

  /* Money paid when REACHING this level. */
  function rewardFor(level) {
    if (level >= MAX_LEVEL) return 10000;   // 100: jackpot
    if (level % 50 === 0) return 5000;      // 50: even more
    if (level % 25 === 0) return 2500;      // 25: even more
    if (level % 10 === 0) return 1200;      // 10: extra
    if (level % 5 === 0) return 600;        // 5: higher
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

  return { MAX_LEVEL, ACHIEVEMENT_XP, toNext, rewardFor, runXp, gain };
})();
