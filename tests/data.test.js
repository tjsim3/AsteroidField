import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DATA } from '../js/data.js';

describe('DATA Module', () => {
  describe('ships', () => {
    it('has at least 13 base ships (0-12)', () => {
      expect(DATA.ships.length).toBeGreaterThanOrEqual(13);
    });

    it('each ship has required fields', () => {
      DATA.ships.forEach(ship => {
        expect(ship).toHaveProperty('id');
        expect(ship).toHaveProperty('file');
        expect(ship).toHaveProperty('src');
        expect(ship).toHaveProperty('name');
        expect(typeof ship.id).toBe('string');
        expect(typeof ship.name).toBe('string');
      });
    });

    it('ship ids are unique', () => {
      const ids = DATA.ships.map(s => s.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });

    it('ship-0 is the default starter ship', () => {
      const starter = DATA.ships.find(s => s.id === 'ship-0');
      expect(starter).toBeDefined();
    });
  });

  describe('rewardShips', () => {
    it('has exactly 10 reward ships (levels 10-100)', () => {
      expect(DATA.rewardShips.length).toBe(10);
    });

    it('each reward ship has rewardLevel and fx', () => {
      DATA.rewardShips.forEach(rs => {
        expect(rs).toHaveProperty('rewardLevel');
        expect(rs).toHaveProperty('fx');
        expect(typeof rs.rewardLevel).toBe('number');
        expect(typeof rs.fx).toBe('string');
      });
    });

    it('rewardLevels match milestone levels 10-100', () => {
      const levels = DATA.rewardShips.map(rs => rs.rewardLevel).sort((a,b) => a-b);
      expect(levels).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    });

    it('fx keys are unique and match expected', () => {
      const expectedFx = ['neon', 'prism', 'circuit', 'helix', 'scan', 'ekg', 'hex', 'magma', 'portal', 'starfield'];
      const fxs = DATA.rewardShips.map(rs => rs.fx).sort();
      expect(fxs).toEqual(expectedFx.sort());
    });

    it('reward ships are NOT in DATA.ships (excluded from drop pools)', () => {
      const rewardIds = new Set(DATA.rewardShips.map(rs => rs.id));
      const shipIds = new Set(DATA.ships.map(s => s.id));
      const overlap = [...rewardIds].filter(id => shipIds.has(id));
      expect(overlap).toHaveLength(0);
    });
  });

  describe('bullets', () => {
    it('has bullet definitions', () => {
      expect(DATA.bullets.length).toBeGreaterThan(0);
    });

    it('each bullet has id, src, name', () => {
      DATA.bullets.forEach(b => {
        expect(b).toHaveProperty('id');
        expect(b).toHaveProperty('src');
        expect(b).toHaveProperty('name');
      });
    });
  });

  describe('trails', () => {
    it('has trail definitions', () => {
      expect(DATA.trails.length).toBeGreaterThan(0);
    });

    it('each trail has id, src, name', () => {
      DATA.trails.forEach(t => {
        expect(t).toHaveProperty('id');
        expect(t).toHaveProperty('src');
        expect(t).toHaveProperty('name');
      });
    });
  });

  describe('backgrounds', () => {
    it('has background definitions', () => {
      expect(DATA.backgrounds.length).toBeGreaterThan(0);
    });
  });

  describe('powerups', () => {
    it('defines all expected powerup types', () => {
      const expected = ['money', 'reload', 'health', 'slow', 'shrink', 'clear', 'shield', 
                        'laser', 'shotgun', 'rockets', 'rapidfire', 'shock'];
      expected.forEach(id => {
        const pu = DATA.powerups.find(p => p.id === id);
        expect(pu).toBeDefined();
        expect(pu).toHaveProperty('icon');
        expect(pu).toHaveProperty('weight');
      });
    });

    it('gun powerups have duration', () => {
      const guns = ['laser', 'shotgun', 'rockets', 'rapidfire', 'shock'];
      guns.forEach(id => {
        const pu = DATA.powerups.find(p => p.id === id);
        expect(pu).toHaveProperty('dur');
        expect(pu.dur).toBeGreaterThan(0);
      });
    });
  });

  describe('achievements', () => {
    it('has achievement definitions', () => {
      expect(DATA.achievements.length).toBeGreaterThan(0);
    });

    it('each achievement has id, name, desc, group', () => {
      DATA.achievements.forEach(a => {
        expect(a).toHaveProperty('id');
        expect(a).toHaveProperty('name');
        expect(a).toHaveProperty('desc');
        expect(a).toHaveProperty('group');
      });
    });

    it('achievement ids are unique', () => {
      const ids = DATA.achievements.map(a => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('SPREAD', () => {
    it('has asteroid, explosion, healFx sprite paths', () => {
      expect(DATA.SPREAD).toHaveProperty('asteroid');
      expect(DATA.SPREAD).toHaveProperty('explosion');
      expect(DATA.SPREAD).toHaveProperty('healFx');
    });
  });

  describe('dropIcons', () => {
    it('maps all drop types to icon paths', () => {
      expect(DATA.dropIcons).toHaveProperty('random');
      expect(DATA.dropIcons).toHaveProperty('ship');
      expect(DATA.dropIcons).toHaveProperty('bullet');
      expect(DATA.dropIcons).toHaveProperty('boost');
      expect(DATA.dropIcons).toHaveProperty('background');
    });
  });

  describe('dropPrice', () => {
    it('has prices for all drop types', () => {
      expect(typeof DATA.dropPrice.random).toBe('number');
      expect(typeof DATA.dropPrice.ship).toBe('number');
      expect(typeof DATA.dropPrice.bullet).toBe('number');
      expect(typeof DATA.dropPrice.boost).toBe('number');
      expect(typeof DATA.dropPrice.background).toBe('number');
    });
  });

  describe('DROPS', () => {
    it('defines drop pool for each type', () => {
      expect(DATA.DROPS).toHaveProperty('random');
      expect(DATA.DROPS).toHaveProperty('ship');
      expect(DATA.DROPS).toHaveProperty('bullet');
      expect(DATA.DROPS).toHaveProperty('boost');
      expect(DATA.DROPS).toHaveProperty('background');
    });

    it('each drop pool is an array of ids', () => {
      Object.values(DATA.DROPS).forEach(pool => {
        expect(Array.isArray(pool)).toBe(true);
        pool.forEach(id => expect(typeof id).toBe('string'));
      });
    });
  });

  describe('DROP_ORDER', () => {
    it('orders drop types for shop display', () => {
      expect(DATA.DROP_ORDER).toContain('random');
      expect(DATA.DROP_ORDER).toContain('ship');
      expect(DATA.DROP_ORDER).toContain('bullet');
      expect(DATA.DROP_ORDER).toContain('boost');
      expect(DATA.DROP_ORDER).toContain('background');
    });
  });

  describe('UPGRADES', () => {
    it('defines 4 permanent upgrades', () => {
      expect(DATA.UPGRADES).toHaveProperty('hearts');
      expect(DATA.UPGRADES).toHaveProperty('startAmmo');
      expect(DATA.UPGRADES).toHaveProperty('storage');
      expect(DATA.UPGRADES).toHaveProperty('gunDrop');
    });

    it('each upgrade has name, desc, maxLevel', () => {
      Object.values(DATA.UPGRADES).forEach(u => {
        expect(u).toHaveProperty('name');
        expect(u).toHaveProperty('desc');
        expect(u).toHaveProperty('maxLevel');
      });
    });
  });

  describe('UPGRADE_ORDER', () => {
    it('orders upgrades for display', () => {
      expect(DATA.UPGRADE_ORDER.length).toBe(4);
    });
  });

  describe('upgradePrice', () => {
    it('calculates price based on level', () => {
      expect(DATA.upgradePrice(0)).toBeLessThan(DATA.upgradePrice(5));
      expect(DATA.upgradePrice(10)).toBeGreaterThan(DATA.upgradePrice(0));
    });
  });

  describe('hud', () => {
    it('has digitFiles for score display', () => {
      expect(DATA.hud.digitFiles).toBeDefined();
      expect(Object.keys(DATA.hud.digitFiles).length).toBe(10);
    });

    it('has bulletDot and fade sprites', () => {
      expect(DATA.hud.bulletDot).toBeDefined();
      expect(DATA.hud.fade).toBeDefined();
    });
  });

  describe('GUN_COLORS', () => {
    it('defines colors for all gun types', () => {
      const guns = ['laser', 'shotgun', 'rockets', 'rapidfire', 'shock'];
      guns.forEach(g => {
        expect(DATA.GUN_COLORS[g]).toMatch(/^#[0-9a-fA-F]{6}$/);
      });
    });
  });
});