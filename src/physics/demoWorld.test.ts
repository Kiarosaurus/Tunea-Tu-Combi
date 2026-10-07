import { describe, expect, it } from 'vitest';
import { FIXED_STEP_SECONDS } from '../core/fixedStepClock';
import { add, rotate } from '../core/vector2';
import { buyPart } from '../game/model';
import { createInitialGameModel, gridBuildStats, gridForModel, placeGridPart } from '../game/model';
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

  it('inicia apoyado sin romper soportes con o sin suspensión', () => {
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
    expect(rigid.snapshot().joints[0]?.broken).toBe(false);
    expect(rigid.snapshot().lostPayloadIds).toEqual([]);
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

  it('impide que el chasis atraviese la pista con ruedas desbalanceadas', () => {
    const world = createRideWorld('primer-recorrido', {
      wheelOffsets: [{ x: -1.2, y: -0.55 }, { x: 0.9, y: 0.15 }],
    });
    for (let index = 0; index < 600; index += 1) world.step(FIXED_STEP_SECONDS);
    const { body } = world.snapshot();
    const collider = body.chassisCollider;
    expect(collider).toBeDefined();
    if (!collider) return;
    const lowerCorners = [
      { x: -collider.halfWidth, y: -collider.halfHeight },
      { x: collider.halfWidth, y: -collider.halfHeight },
    ];
    for (const corner of lowerCorners) {
      const position = add(body.position,
        rotate(add(collider.offset, corner), body.angleRadians));
      expect(position.y).toBeGreaterThanOrEqual(-0.01);
    }
  });

  it('mantiene estable la construcción de campaña en la ruta de mercado', () => {
    let model = { ...createInitialGameModel(), wallet: 200 };
    model = buyPart(model, 'seat');
    model = placeGridPart(model, 'seat', 0, 3);
    for (const [kind, column, row] of [
      ['roofRack', 3, 2],
      ['rearCarrier', 8, 4],
      ['suspension', 3, 5],
    ] as const) {
      model = buyPart(model, kind);
      model = placeGridPart(model, kind, column, row);
    }
    const stats = gridBuildStats(gridForModel(model));
    const world = createRideWorld('dia-de-mercado', {
      reinforcedSuspension: true,
      roofRack: true,
      rearCarrier: true,
      bodyMassKg: stats.bodyMassKg,
      centerOfMass: stats.centerOfMass,
      wheelOffsets: stats.wheelOffsets ?? [],
    });
    for (let index = 0; index < 1900; index += 1) {
      world.applyForce({ x: driveForceN(world.snapshot(), { throttle: 1, braking: false }), y: 0 });
      expect(() => world.step(FIXED_STEP_SECONDS)).not.toThrow();
    }
    expect(world.snapshot().body.position.x).toBeGreaterThan(20);
  });
});
