import { describe, expect, it } from 'vitest';
import { add, cross, dot, rotate, scale, subtract } from './vector2';

describe('Vector2', () => {
  it('mantiene operaciones puras y coherentes', () => {
    const a = { x: 2, y: 3 };
    const b = { x: -4, y: 5 };

    expect(add(a, b)).toEqual({ x: -2, y: 8 });
    expect(subtract(a, b)).toEqual({ x: 6, y: -2 });
    expect(scale(a, 2)).toEqual({ x: 4, y: 6 });
    expect(dot(a, b)).toBe(7);
    expect(cross(a, b)).toBe(22);
    expect(a).toEqual({ x: 2, y: 3 });
  });

  it('rota un vector sin cambiar su longitud', () => {
    const rotated = rotate({ x: 2, y: 0 }, Math.PI / 2);
    expect(rotated.x).toBeCloseTo(0, 10);
    expect(rotated.y).toBeCloseTo(2, 10);
  });
});
