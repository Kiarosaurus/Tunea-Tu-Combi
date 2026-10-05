import { describe, expect, it } from 'vitest';
import { FIXED_STEP_SECONDS } from '../core/fixedStepClock';
import { add, rotate } from '../core/vector2';
import { createDemoWorld } from './demoWorld';
import { PhysicsWorld, type RigidBody } from './world';

const flatGround = [{ start: { x: -10, y: 0 }, end: { x: 10, y: 0 } }];

function testBody(): RigidBody {
  return {
    id: 'test',
    position: { x: 0, y: 3 },
    angleRadians: 0,
    velocity: { x: 0, y: 0 },
    angularVelocity: 0,
    massKg: 100,
    inertiaKgM2: 80,
    force: { x: 0, y: 0 },
    torqueNm: 0,
    wheels: [{ offset: { x: 0, y: 0 }, radius: 0.5 }],
  };
}

describe('PhysicsWorld', () => {
  it('integra gravedad con Euler semiimplícito en unidades SI', () => {
    const world = new PhysicsWorld(testBody(), flatGround);
    world.step(FIXED_STEP_SECONDS);
    const snapshot = world.snapshot();
    expect(snapshot.body.velocity.y).toBeCloseTo(-9.81 / 60, 8);
    expect(snapshot.body.position.y).toBeCloseTo(3 - 9.81 / 3600, 8);
  });

  it('detiene una rueda sobre el terreno sin atravesarlo', () => {
    const world = new PhysicsWorld(testBody(), flatGround);
    for (let index = 0; index < 600; index += 1) world.step(FIXED_STEP_SECONDS);
    const snapshot = world.snapshot();
    expect(snapshot.body.position.y).toBeGreaterThanOrEqual(0.497);
    expect(Math.abs(snapshot.body.velocity.y)).toBeLessThan(0.2);
    expect(snapshot.contacts.length).toBeGreaterThan(0);
  });

  it('aplica fuerza en un punto y genera torque', () => {
    const world = new PhysicsWorld(testBody(), flatGround);
    world.applyForce({ x: 100, y: 0 }, { x: 0, y: 4 });
    world.step(FIXED_STEP_SECONDS);
    expect(world.snapshot().body.velocity.x).toBeGreaterThan(0);
    expect(world.snapshot().body.angularVelocity).toBeLessThan(0);
  });

  it('produce el mismo resultado para las mismas condiciones iniciales', () => {
    const first = createDemoWorld();
    const second = createDemoWorld();
    for (let index = 0; index < 300; index += 1) {
      first.step(FIXED_STEP_SECONDS);
      second.step(FIXED_STEP_SECONDS);
    }
    expect(first.snapshot()).toEqual(second.snapshot());
  });

  it('mantiene ambas ruedas del prototipo sobre el tramo plano', () => {
    const world = createDemoWorld();
    for (let index = 0; index < 120; index += 1) world.step(FIXED_STEP_SECONDS);
    const { body } = world.snapshot();
    for (const wheel of body.wheels) {
      const center = add(body.position, rotate(wheel.offset, body.angleRadians));
      expect(center.y).toBeGreaterThanOrEqual(wheel.radius - 0.01);
    }
  });

  it('rechaza valores no finitos y pasos excesivos', () => {
    expect(() => new PhysicsWorld({ ...testBody(), massKg: Number.NaN }, flatGround)).toThrow();
    const world = new PhysicsWorld(testBody(), flatGround);
    expect(() => world.step(1)).toThrow();
    expect(() => world.applyForce({ x: Number.POSITIVE_INFINITY, y: 0 })).toThrow();
  });
});
