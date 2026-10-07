import { describe, expect, it } from 'vitest';
import { updateEngineLoad } from './engineLoad';

describe('updateEngineLoad', () => {
  it('acumula esfuerzo y se enfría al soltar el acelerador', () => {
    expect(updateEngineLoad(0, true, 1).load).toBeCloseTo(0.2);
    expect(updateEngineLoad(0.65, false, 1).load).toBe(0);
  });

  it('quita dos puntos de vida por cada segundo completo en el tope', () => {
    const result = updateEngineLoad(1, true, 1);
    expect(result.load).toBe(1);
    expect(result.damage).toBeCloseTo(0.02);
    expect(result.overloaded).toBe(true);
  });

  it('sólo cobra el tramo del paso que realmente estuvo en el tope', () => {
    const result = updateEngineLoad(0.9, true, 1);
    expect(result.damage).toBeCloseTo(0.5 * 0.02);
  });
});
