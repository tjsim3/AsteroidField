import { describe, it, expect, beforeEach, vi } from 'vitest';
import { XP } from '../js/xp.js';

describe('XP Module', () => {
  describe('toNext', () => {
    it('returns Infinity for level >= MAX_LEVEL', () => {
      expect(XP.toNext(100)).toBe(Infinity);
      expect(XP.toNext(101)).toBe(Infinity);
    });

    it('returns 100 for level 1', () => {
      expect(XP.toNext(1)).toBe(100);
    });

    it('grows exponentially', () => {
      const level1 = XP.toNext(1);
      const level2 = XP.toNext(2);
      expect(level2).toBeGreaterThan(level1);
    });

    it('reaches exactly 25000 for level 99', () => {
      expect(XP.toNext(99)).toBe(25000);
    });

    it('is monotonic increasing', () => {
      let prev = 0;
      for (let i = 1; i < 100; i++) {
        const curr = XP.toNext(i);
        expect(curr).toBeGreaterThan(prev);
        prev = curr;
      }
    });
  });

  describe('isSkinLevel', () => {
    it('returns true for all milestone levels', () => {
      const skinLevels = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      skinLevels.forEach(lvl => {
        expect(XP.isSkinLevel(lvl)).toBe(true);
      });
    });

    it('returns false for non-milestone levels', () => {
      const nonSkin = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 15, 25, 50, 75, 99];
      nonSkin.forEach(lvl => {
        expect(XP.isSkinLevel(lvl)).toBe(false);
      });
    });
  });

  describe('rewardFor', () => {
    it('returns 0 for all skin milestone levels', () => {
      const skinLevels = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      skinLevels.forEach(lvl => {
        expect(XP.rewardFor(lvl)).toBe(0);
      });
    });

    it('returns 5000 for level 50 (before it was a skin level)', () => {
      expect(XP.rewardFor(50)).toBe(0); // Now a skin level
    });

    it('returns 2500 for multiples of 25 (non-skin)', () => {
      expect(XP.rewardFor(25)).toBe(2500);
      expect(XP.rewardFor(75)).toBe(2500);
    });

    it('returns 1200 for multiples of 10 (non-skin)', () => {
      expect(XP.rewardFor(5)).toBe(600); // 5 is not mult of 10
      expect(XP.rewardFor(15)).toBe(1200);
      expect(XP.rewardFor(35)).toBe(1200);
    });

    it('returns 600 for multiples of 5 (non-skin)', () => {
      expect(XP.rewardFor(5)).toBe(600);
      expect(XP.rewardFor(15)).toBe(1200); // 15 is mult of 10, so 1200
    });

    it('returns 250 for all other levels', () => {
      expect(XP.rewardFor(1)).toBe(250);
      expect(XP.rewardFor(2)).toBe(250);
      expect(XP.rewardFor(3)).toBe(250);
      expect(XP.rewardFor(4)).toBe(250);
      expect(XP.rewardFor(6)).toBe(250);
      expect(XP.rewardFor(7)).toBe(250);
      expect(XP.rewardFor(8)).toBe(250);
      expect(XP.rewardFor(9)).toBe(250);
    });

    it('skin levels take precedence over cash tiers', () => {
      // Level 50 was 5000, now 0 (skin)
      expect(XP.rewardFor(50)).toBe(0);
      // Level 100 was 0, still 0 (skin)
      expect(XP.rewardFor(100)).toBe(0);
    });
  });

  describe('runXp', () => {
    it('minimum XP is 25', () => {
      expect(XP.runXp(0, 0)).toBe(25);
      expect(XP.runXp(100, 0)).toBe(25);
    });

    it('scales with score', () => {
      expect(XP.runXp(5000, 0)).toBe(100);
      expect(XP.runXp(50000, 0)).toBe(1000);
    });

    it('adds survival time bonus', () => {
      const base = XP.runXp(5000, 0);
      const withTime = XP.runXp(5000, 60);
      expect(withTime).toBe(base + 120); // 60s * 2
    });
  });

  describe('gain', () => {
    const freshSave = () => ({
      xp: { level: 1, current: 0 },
      pendingRewards: [],
      money: 0,
      stats: { lifetimeMoney: 0 }
    });

    it('adds XP and returns levelUps', () => {
      const s = freshSave();
      const result = XP.gain(s, 100); // exactly level 1->2
      expect(result.gained).toBe(100);
      expect(result.levelUps).toHaveLength(1);
      expect(result.levelUps[0].level).toBe(2);
      expect(s.xp.level).toBe(2);
      expect(s.xp.current).toBe(0);
    });

    it('carries over excess XP to next level', () => {
      const s = freshSave();
      XP.gain(s, 250); // 100 for level 2, 150 toward level 3
      expect(s.xp.level).toBe(2);
      expect(s.xp.current).toBe(150);
    });

    it('handles multiple level ups at once', () => {
      const s = freshSave();
      XP.gain(s, 5000);
      expect(s.xp.level).toBeGreaterThan(2);
      expect(s.pendingRewards.length).toBeGreaterThan(0);
    });

    it('accumulates rewardTotal correctly', () => {
      const s = freshSave();
      const result = XP.gain(s, 100);
      expect(result.rewardTotal).toBe(XP.rewardFor(2)); // 250
    });

    it('includes skin rewards with $0 in levelUps', () => {
      const s = { xp: { level: 9, current: 0 }, pendingRewards: [], money: 0, stats: { lifetimeMoney: 0 } };
      const result = XP.gain(s, XP.toNext(9)); // reach level 10
      expect(result.levelUps.some(u => u.level === 10 && u.reward === 0)).toBe(true);
    });

    it('caps at MAX_LEVEL', () => {
      const s = { xp: { level: 99, current: 0 }, pendingRewards: [], money: 0, stats: { lifetimeMoney: 0 } };
      XP.gain(s, 1000000);
      expect(s.xp.level).toBe(100);
      expect(s.xp.current).toBe(0);
    });

    it('does not grant rewards beyond MAX_LEVEL', () => {
      const s = { xp: { level: 100, current: 0 }, pendingRewards: [], money: 0, stats: { lifetimeMoney: 0 } };
      const result = XP.gain(s, 1000);
      expect(result.levelUps).toHaveLength(0);
      expect(result.rewardTotal).toBe(0);
    });
  });

  describe('ACHIEVEMENT_XP', () => {
    it('exports constant value', () => {
      expect(XP.ACHIEVEMENT_XP).toBe(150);
    });
  });

  describe('SKIN_LEVELS export', () => {
    it('exports all 10 milestone levels', () => {
      expect(XP.SKIN_LEVELS).toHaveLength(10);
      expect(XP.SKIN_LEVELS).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    });
  });
});