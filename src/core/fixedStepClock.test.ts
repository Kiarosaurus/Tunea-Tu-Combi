import { describe, expect, it } from 'vitest';
import { FIXED_STEP_SECONDS, FixedStepClock } from './fixedStepClock';

describe('FixedStepClock', () => {
  it('ejecuta el mismo número de pasos con intervalos de render diferentes', () => {
    const fine = new FixedStepClock();
    const coarse = new FixedStepClock();
    let fineSteps = 0;
    let coarseSteps = 0;
    for (let index = 0; index < 120; index += 1) {
      fine.advance(1 / 120, () => { fineSteps += 1; });
    }
    for (let index = 0; index < 30; index += 1) {
      coarse.advance(1 / 30, () => { coarseSteps += 1; });
    }
    expect(fineSteps).toBe(60);
    expect(coarseSteps).toBe(60);
    expect(FIXED_STEP_SECONDS).toBe(1 / 60);
  });

  it('limita el tiempo acumulado y rechaza valores inválidos', () => {
    const clock = new FixedStepClock();
    expect(clock.advance(10, () => undefined)).toBe(15);
    expect(() => clock.advance(Number.NaN, () => undefined)).toThrow();
    expect(() => clock.advance(-1, () => undefined)).toThrow();
  });
});
