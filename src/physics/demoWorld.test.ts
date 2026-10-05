import { describe, expect, it } from 'vitest';
import { FIXED_STEP_SECONDS } from '../core/fixedStepClock';
import { createRideWorld } from './demoWorld';
import { driveForceN } from './driveModel';

describe('mundos de la campaña', () => {
  it('desplaza la geometría física respecto del centro de gravedad calculado', () => {
    const centered = createRideWorld('primer-recorrido');
    const offset = { x: 0.2, y: 0.1 };
    const shifted = createRideWorld('primer-recorrido', { centerOfMass: offset });
    const centeredSnapshot = centered.snapshot();
    const shiftedSnapshot = shifted.snapshot();

    expect(shiftedSnapshot.body.centerOfMassOffset).toEqual(offset);
    expect(shiftedSnapshot.body.wheels[0]?.offset.x).toBeCloseTo(
      (centeredSnapshot.body.wheels[0]?.offset.x ?? 0) - offset.x,
    );
    expect(shiftedSnapshot.body.wheels[0]?.offset.y).toBeCloseTo(
      (centeredSnapshot.body.wheels[0]?.offset.y ?? 0) - offset.y,
    );
  });

  it('la suspensión protege una carga del impacto inicial de pista dañada', () => {
    const rigid = createRideWorld('pista-danada', { roofRack: true });
    const suspended = createRideWorld('pista-danada', {
      roofRack: true,
      reinforcedSuspension: true,
    });
    rigid.attachPayload('carga-rigida', 45, { x: 0, y: 0.75 }, 'roofRack');
    suspended.attachPayload('carga-suspendida', 45, { x: 0, y: 0.75 }, 'roofRack');
    for (let index = 0; index < 180; index += 1) {
      rigid.step(FIXED_STEP_SECONDS);
      suspended.step(FIXED_STEP_SECONDS);
    }
    expect(rigid.snapshot().joints[0]?.broken).toBe(true);
    expect(rigid.snapshot().lostPayloadIds).toContain('carga-rigida');
    expect(suspended.snapshot().joints[0]?.broken).toBe(false);
    expect(suspended.snapshot().lostPayloadIds).toEqual([]);
  });

  it('hora punta combina pendientes y baches en un recorrido transitable', () => {
    const world = createRideWorld('hora-punta', { reinforcedSuspension: true });
    for (let index = 0; index < 900; index += 1) {
      world.applyForce({ x: driveForceN(world.snapshot(), { throttle: 1, braking: false }), y: 0 });
      world.step(FIXED_STEP_SECONDS);
    }
    expect(world.snapshot().body.position.x).toBeGreaterThan(30);
    expect(Math.max(...world.snapshot().terrain.map((segment) => segment.end.y))).toBeGreaterThan(1);
  });
});
