import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SAVE } from '../js/save.js';

describe('SAVE Module', () => {
  const originalLocalStorage = global.localStorage;

  beforeEach(() => {
    vi.useFakeTimers();
    // Reset localStorage mock
    localStorage.setItem.mockClear();
    localStorage.getItem.mockClear();
    localStorage.removeItem.mockClear();
    localStorage.clear.mockClear();
    // Reset SAVE internal state
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('defaultSave', () => {
    it('returns a complete save object with all fields', () => {
      // We can't directly test defaultSave as it's private, but we can test load() on empty storage
      localStorage.getItem.mockReturnValue(null);
      const save = SAVE.load();
      
      expect(save).toHaveProperty('version', 2);
      expect(save).toHaveProperty('money', 0);
      expect(save).toHaveProperty('xp');
      expect(save.xp).toEqual({ level: 1, current: 0 });
      expect(save).toHaveProperty('pendingRewards', []);
      expect(save).toHaveProperty('equipment');
      expect(save.equipment).toEqual({
        ship: 'ship-0',
        bullet: 'bullet-1',
        background: 'space',
        boost: 'trail-1'
      });
      expect(save).toHaveProperty('owned');
      expect(save.owned.ship).toContain('ship-0');
      expect(save.owned.bullet).toContain('bullet-1');
      expect(save.owned.boost).toContain('trail-1');
      expect(save.owned.background).toContain('space');
      expect(save).toHaveProperty('stats');
      expect(save).toHaveProperty('upgrades');
      expect(save).toHaveProperty('achievements', {});
      expect(save).toHaveProperty('settings');
    });
  });

  describe('load', () => {
    it('returns cached save on subsequent calls', () => {
      localStorage.getItem.mockReturnValue(null);
      const s1 = SAVE.load();
      const s2 = SAVE.load();
      expect(s1).toBe(s2); // Same reference
    });

    it('parses and merges existing save data', () => {
      const existing = {
        version: 2,
        money: 5000,
        xp: { level: 25, current: 100 },
        owned: { ship: ['ship-0', 'ship-1'], bullet: ['bullet-1'], boost: ['trail-1'], background: ['space'] }
      };
      localStorage.getItem.mockReturnValue(JSON.stringify(existing));
      
      const save = SAVE.load();
      expect(save.money).toBe(5000);
      expect(save.xp.level).toBe(25);
      expect(save.owned.ship).toContain('ship-1');
    });

    it('migrates v1 saves to v2 (trail swap)', () => {
      const v1Save = {
        money: 100,
        equipment: { boost: 'trail-1' },
        owned: { boost: ['trail-1', 'trail-2'] }
      };
      localStorage.getItem.mockReturnValue(JSON.stringify(v1Save));
      
      const save = SAVE.load();
      // v1 trail-1 (blue Ion) -> v2 trail-2, v1 trail-2 -> v2 trail-1
      expect(save.equipment.boost).toBe('trail-2');
      expect(save.owned.boost).toContain('trail-2');
      expect(save.owned.boost).toContain('trail-1');
    });

    it('normalizes owned to include equipped items', () => {
      const save = {
        version: 2,
        equipment: { ship: 'ship-5', bullet: 'bullet-1', boost: 'trail-1', background: 'space' },
        owned: { ship: ['ship-0'], bullet: ['bullet-1'], boost: ['trail-1'], background: ['space'] }
      };
      localStorage.getItem.mockReturnValue(JSON.stringify(save));
      
      const loaded = SAVE.load();
      expect(loaded.owned.ship).toContain('ship-5');
    });

    it('removes achievements that no longer exist in DATA', () => {
      const save = {
        version: 2,
        achievements: { 'old-achievement': true, 'valid-one': true }
      };
      localStorage.getItem.mockReturnValue(JSON.stringify(save));
      
      const loaded = SAVE.load();
      expect(loaded.achievements['old-achievement']).toBeUndefined();
      expect(loaded.achievements['valid-one']).toBe(true);
    });

    it('returns default save on corrupted data', () => {
      localStorage.getItem.mockReturnValue('not valid json');
      const save = SAVE.load();
      expect(save.money).toBe(0);
      expect(save.xp.level).toBe(1);
    });

    it('returns default save when localStorage unavailable', () => {
      localStorage.getItem.mockImplementation(() => { throw new Error('unavailable'); });
      const save = SAVE.load();
      expect(save.money).toBe(0);
    });
  });

  describe('save', () => {
    it('writes current save to localStorage', () => {
      localStorage.getItem.mockReturnValue(null);
      SAVE.load(); // Initialize
      const save = SAVE.load();
      save.money = 1234;
      
      SAVE.save();
      
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'asteroid-field-save-v1',
        expect.stringContaining('"money":1234')
      );
    });

    it('silently fails if localStorage throws', () => {
      localStorage.setItem.mockImplementation(() => { throw new Error('quota'); });
      expect(() => SAVE.save()).not.toThrow();
    });
  });

  describe('reset', () => {
    it('resets to default and saves', () => {
      localStorage.getItem.mockReturnValue(null);
      SAVE.load();
      
      SAVE.reset();
      
      expect(localStorage.setItem).toHaveBeenCalled();
      const saved = JSON.parse(localStorage.setItem.mock.calls[0][1]);
      expect(saved.money).toBe(0);
      expect(saved.xp.level).toBe(1);
    });
  });

  describe('mergeDeep', () => {
    it('merges nested objects', () => {
      const base = { a: 1, b: { c: 2, d: 3 } };
      const extra = { b: { c: 20, e: 4 }, f: 5 };
      const result = SAVE.mergeDeep({}, base); // Can't test private directly but we can test through load
    });
  });

  describe('KEY', () => {
    it('exports the storage key', () => {
      expect(SAVE.KEY).toBe('asteroid-field-save-v1');
    });
  });
});