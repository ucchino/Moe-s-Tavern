import { describe, expect, it } from 'vitest';
import { bumpTier, maxTier, planSizeFloor, resolveLaunch } from './routing.js';

const steps = (n: number, filesEach: number) =>
  Array.from({ length: n }, (_, i) => ({
    affectedFiles: Array.from({ length: filesEach }, (_, j) => `f${i}-${j}.ts`),
  }));

describe('routing tiers', () => {
  it('floors light / standard / heavy from plan size', () => {
    expect(planSizeFloor(steps(3, 0).map((s, i) => ({ ...s, affectedFiles: i < 2 ? ['a.ts'] : ['b.ts'] })))).toBe('light');
    expect(planSizeFloor(steps(4, 1))).toBe('standard');
    expect(planSizeFloor(steps(9, 1))).toBe('heavy');
    expect(planSizeFloor(steps(2, 2))).toBe('standard');
    expect(planSizeFloor(steps(2, 3))).toBe('heavy');
    // newFiles count toward size
    expect(planSizeFloor([{ affectedFiles: ['a.ts'], newFiles: ['b.ts', 'c.ts'] }])).toBe('standard');
    // warn thresholds come from settings.taskSizing
    expect(planSizeFloor(steps(4, 1), { taskSizing: { warnSteps: 3 } })).toBe('heavy');
  });

  it('bumps and maxes in order, capped at heavy', () => {
    expect(bumpTier('light')).toBe('standard');
    expect(bumpTier('heavy')).toBe('heavy');
    expect(maxTier('light', 'heavy')).toBe('heavy');
    expect(maxTier('standard', undefined)).toBe('standard');
    expect(maxTier('heavy', 'light')).toBe('heavy');
  });

  it('resolves launch with defaults, overrides, and ignores bad config', () => {
    expect(resolveLaunch({ tier: 'light', status: 'WORKING' })).toEqual({ tier: 'light', effort: 'medium' });
    expect(resolveLaunch({ tier: 'heavy', status: 'REVIEW' })).toEqual({ tier: 'heavy', effort: 'max' });
    expect(
      resolveLaunch({ tier: 'light', status: 'WORKING' }, { routing: { light: { model: 'claude-sonnet-5', effort: 'low' } } })
    ).toEqual({ tier: 'light', effort: 'low', model: 'claude-sonnet-5' });
    const bad = { routing: { standard: { model: 42, effort: 'turbo' } } } as never;
    expect(resolveLaunch({ tier: 'standard', status: 'WORKING' }, bad)).toEqual({ tier: 'standard', effort: 'high' });
    expect(resolveLaunch({ tier: 'light', status: 'WORKING' }, { routing: { enabled: false } })).toBeUndefined();
    expect(resolveLaunch({ status: 'WORKING' })).toBeUndefined();
    expect(resolveLaunch({ tier: 'heavy', status: 'PLANNING' })).toBeUndefined();
  });
});
