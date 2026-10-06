import { describe, expect, it } from 'vitest';
import { loosePartPose } from './canvasRenderer';

describe('loosePartPose', () => {
  it('hace caer una pieza suelta al piso interior sin sacarla de la combi', () => {
    const start = loosePartPose('engine-2', 40, 12, 24, 20,
      10, 8, 180, 70, 0, 0, 0, false);
    const settled = loosePartPose('engine-2', 40, 12, 24, 20,
      10, 8, 180, 70, 2, 0.2, 3, false);
    expect(start).toMatchObject({ x: 40, y: 12, rotation: 0 });
    expect(settled.y).toBeGreaterThan(start.y);
    expect(settled.x).toBeGreaterThanOrEqual(10);
    expect(settled.x + 24).toBeLessThanOrEqual(190);
    expect(settled.y + 20).toBeLessThanOrEqual(78);
    expect(Math.abs(settled.rotation)).toBeGreaterThan(0);
  });

  it('mantiene una disposición determinista con movimiento reducido', () => {
    const first = loosePartPose('seat-3', 20, 10, 18, 22,
      5, 5, 150, 60, 1, -0.1, 4, true);
    const second = loosePartPose('seat-3', 20, 10, 18, 22,
      5, 5, 150, 60, 1, -0.1, 4, true);
    expect(second).toEqual(first);
  });
});
