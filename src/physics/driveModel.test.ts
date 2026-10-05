import { describe, expect, it } from 'vitest';
import { FIXED_STEP_SECONDS } from '../core/fixedStepClock';
import { createLevelOneWorld } from './demoWorld';
import { driveForceN, URBAN_ENGINE } from './driveModel';

describe('driveForceN', () => {
  it('no entrega fuerza motriz antes de tocar el terreno', () => {
    const world = createLevelOneWorld();
    expect(driveForceN(world.snapshot(), { throttle: 1, braking: false })).toBe(0);
  });

  it('acelera con contacto y limita la fuerza al agarre disponible', () => {
    const world = createLevelOneWorld();
    for (let index = 0; index < 90; index += 1) world.step(FIXED_STEP_SECONDS);
    const force = driveForceN(world.snapshot(), { throttle: 1, braking: false });
    expect(force).toBeGreaterThan(0);
    const slippery = driveForceN(world.snapshot(), { throttle: 1, braking: false }, {
      ...URBAN_ENGINE, tractionCoefficient: 0.05,
    });
    expect(slippery).toBeGreaterThan(0);
    expect(slippery).toBeLessThan(force);
  });

  it('frena en sentido contrario al movimiento', () => {
    const world = createLevelOneWorld();
    for (let index = 0; index < 90; index += 1) world.step(FIXED_STEP_SECONDS);
    const snapshot = world.snapshot();
    const moving = { ...snapshot, body: { ...snapshot.body, velocity: { x: 4, y: 0 } } };
    expect(driveForceN(moving, { throttle: 0, braking: true })).toBeLessThan(
      driveForceN(moving, { throttle: 0, braking: false }));
  });

  it('usa el apoyo de la suspensión aunque no haya contacto rígido', () => {
    const world = createLevelOneWorld({ reinforcedSuspension: true });
    for (let index = 0; index < 120; index += 1) world.step(FIXED_STEP_SECONDS);
    const snapshot = world.snapshot();
    expect(snapshot.suspensionForces.length).toBeGreaterThan(0);
    expect(driveForceN(snapshot, { throttle: 1, braking: false })).toBeGreaterThan(0);
  });
});
