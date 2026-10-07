import { describe, expect, it } from 'vitest';
import { calculateEngineDamage } from './engineDamage';

describe('calculateEngineDamage', () => {
  it('quita 25 por ciento al iniciar un choque fuerte de carrocería', () => {
    const result = calculateEngineDamage({
      health: 1, durationSeconds: 1 / 60, chassisContact: true,
      contactStarted: true, maximumNormalImpulseNs: 500, speedMps: 2,
    });
    expect(result.impactApplied).toBe(true);
    expect(result.health).toBeCloseTo(0.75 - 0.08 / 60);
  });

  it('degrada de forma continua al arrastrar sin repetir el golpe', () => {
    const result = calculateEngineDamage({
      health: 0.75, durationSeconds: 1, chassisContact: true,
      contactStarted: false, maximumNormalImpulseNs: 40, speedMps: 1,
    });
    expect(result.impactApplied).toBe(false);
    expect(result.dragging).toBe(true);
    expect(result.health).toBeCloseTo(0.67);
  });

  it('continúa dañando al arrastrar aunque la combi quede casi inmóvil', () => {
    const result = calculateEngineDamage({
      health: 0.75, durationSeconds: 1, chassisContact: true,
      contactStarted: false, maximumNormalImpulseNs: 0, speedMps: 0.02,
      driveDemand: true,
    });
    expect(result.dragging).toBe(true);
    expect(result.health).toBeCloseTo(0.67);
  });

  it('no daña el motor por apoyo suave o contacto de llantas', () => {
    expect(calculateEngineDamage({
      health: 1, durationSeconds: 1, chassisContact: false,
      contactStarted: true, maximumNormalImpulseNs: 900, speedMps: 4,
    }).health).toBe(1);
    expect(calculateEngineDamage({
      health: 1, durationSeconds: 1, chassisContact: true,
      contactStarted: true, maximumNormalImpulseNs: 20, speedMps: 0,
    }).health).toBe(1);
  });
});
