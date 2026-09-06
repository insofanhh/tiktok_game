import { describe, expect, it } from 'vitest';
import { fitArena } from '../../../frontend/lib/arena-layout';
describe('adaptive arena packing', () => {
  it.each([1, 8, 16, 40, 100, 200, 400, 1000])('fits all %i participants in a narrow mobile team area', count => {
    const layout = fitArena(count, 148, 432);
    expect(layout.columns * layout.rows).toBeGreaterThanOrEqual(count);
    expect(layout.scale).toBeGreaterThan(0);
    expect(layout.columns * layout.cardWidth + (layout.columns - 1) * layout.gap).toBeLessThanOrEqual(148.00001);
    expect(layout.rows * layout.cardHeight + (layout.rows - 1) * layout.gap).toBeLessThanOrEqual(432.00001);
  });
  it('shrinks avatars as the crowd grows and grows them on a wider viewport', () => {
    expect(fitArena(100,148,432).scale).toBeLessThan(fitArena(8,148,432).scale);
    expect(fitArena(100,520,600).scale).toBeGreaterThan(fitArena(100,148,432).scale);
  });
  it('handles an empty team or an unmeasured container', () => {
    expect(fitArena(0,148,432).rows).toBe(0);
    expect(fitArena(10,0,0).scale).toBe(0);
  });
});
