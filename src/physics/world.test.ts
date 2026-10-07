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

  it('limita el deslizamiento tangencial según la fricción de la rueda', () => {
    const sliding = testBody();
    sliding.position = { x: 0, y: 0.49 };
    sliding.velocity = { x: 3, y: 0 };
    const grippy = { ...testBody(), wheels: [
      { offset: { x: 0, y: 0 }, radius: 0.5, frictionCoefficient: 0.8 },
    ] };
    grippy.position = { x: 0, y: 0.49 };
    grippy.velocity = { x: 3, y: 0 };
    const iceWorld = new PhysicsWorld(sliding, flatGround);
    const gripWorld = new PhysicsWorld(grippy, flatGround);
    iceWorld.step(FIXED_STEP_SECONDS);
    gripWorld.step(FIXED_STEP_SECONDS);
    expect(iceWorld.snapshot().body.velocity.x).toBeCloseTo(3, 8);
    expect(gripWorld.snapshot().body.velocity.x).toBeLessThan(3);
    expect(gripWorld.snapshot().body.velocity.x).toBeGreaterThan(2.8);
  });

  it('amortigua la bajada antes de tocar un desnivel', () => {
    const bumpyGround = [{ start: { x: -2, y: 0 }, end: { x: 2, y: 0.15 } }];
    const plain = testBody();
    plain.position = { x: 0, y: 0.72 };
    plain.velocity = { x: 0, y: -2 };
    const springBody: RigidBody = {
      ...testBody(),
      position: { x: 0, y: 0.72 },
      velocity: { x: 0, y: -2 },
      wheels: [{ offset: { x: 0, y: 0 }, radius: 0.5, suspension: {
        restLengthM: 0.25, maxCompressionM: 0.2,
        stiffnessNPerM: 24000, dampingNsPerM: 1800,
      } }],
    };
    const plainWorld = new PhysicsWorld(plain, bumpyGround);
    const springWorld = new PhysicsWorld(springBody, bumpyGround);
    plainWorld.step(FIXED_STEP_SECONDS);
    springWorld.step(FIXED_STEP_SECONDS);
    expect(springWorld.snapshot().body.velocity.y).toBeGreaterThan(
      plainWorld.snapshot().body.velocity.y);
    expect(springWorld.snapshot().body.position.y).toBeGreaterThan(
      plainWorld.snapshot().body.position.y);
  });

  it('conserva una unión bajo impacto leve y la rompe sobre su umbral', () => {
    const gentle = testBody();
    gentle.position = { x: 0, y: 0.49 };
    gentle.velocity = { x: 0, y: -1 };
    const hard = testBody();
    hard.position = { x: 0, y: 0.49 };
    hard.velocity = { x: 0, y: -8 };
    const mount = [{ id: 'carga', offset: { x: 1, y: 0 },
      massKg: 10, breakImpulseNs: 300 }];
    const gentleWorld = new PhysicsWorld(gentle, flatGround, mount);
    const hardWorld = new PhysicsWorld(hard, flatGround, mount);
    gentleWorld.step(FIXED_STEP_SECONDS);
    hardWorld.step(FIXED_STEP_SECONDS);
    expect(gentleWorld.snapshot().joints[0]?.broken).toBe(false);
    expect(gentleWorld.snapshot().body.massKg).toBe(110);
    expect(hardWorld.snapshot().joints[0]?.broken).toBe(true);
    expect(hardWorld.snapshot().body.massKg).toBe(100);
  });

  it('agrega y retira masa transportada con su contribución de inercia', () => {
    const world = new PhysicsWorld(testBody(), flatGround);
    world.attachPayload('pasajero', 60, { x: 1, y: 0 });
    expect(world.snapshot().body.massKg).toBe(160);
    expect(world.snapshot().body.inertiaKgM2).toBe(140);
    expect(world.snapshot().payloadMassKg).toBe(60);
    expect(() => world.attachPayload('pasajero', 60)).toThrow('identificador nuevo');
    world.detachPayload('pasajero');
    expect(world.snapshot().body.massKg).toBe(100);
    expect(world.snapshot().body.inertiaKgM2).toBe(80);
    expect(world.snapshot().payloadMassKg).toBe(0);
  });

  it('la masa de un pasajero fuera del centro genera torque gravitacional', () => {
    const world = new PhysicsWorld(testBody(), flatGround);
    world.attachPayload('pasajero-lateral', 80, { x: 1.4, y: 0.2 });
    world.step(FIXED_STEP_SECONDS);
    expect(world.snapshot().body.angularVelocity).toBeLessThan(0);
  });

  it('pierde una carga cuando se rompe la unión que la sostiene', () => {
    const body = testBody();
    body.position = { x: 0, y: 0.49 };
    body.velocity = { x: 0, y: -8 };
    const world = new PhysicsWorld(body, flatGround, [{
      id: 'roofRack', offset: { x: 0, y: 1 }, massKg: 10, breakImpulseNs: 300,
    }]);
    world.attachPayload('cajas', 25, { x: 0, y: 1 }, 'roofRack');
    world.step(FIXED_STEP_SECONDS);
    expect(world.snapshot().joints[0]?.broken).toBe(true);
    expect(world.snapshot().lostPayloadIds).toContain('cajas');
    expect(world.snapshot().payloadMassKg).toBe(0);
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
    expect(() => new PhysicsWorld({ ...testBody(), wheels: [
      { offset: { x: 0, y: 0 }, radius: 0.5, frictionCoefficient: -0.1 },
    ] }, flatGround)).toThrow();
    expect(() => new PhysicsWorld({ ...testBody(), wheels: [
      { offset: { x: 0, y: 0 }, radius: 0.5, suspension: {
        restLengthM: 0.2, maxCompressionM: 0.3, stiffnessNPerM: 1000, dampingNsPerM: 0,
      } },
    ] }, flatGround)).toThrow();
    const world = new PhysicsWorld(testBody(), flatGround);
    expect(() => world.step(1)).toThrow();
    expect(() => world.applyForce({ x: Number.POSITIVE_INFINITY, y: 0 })).toThrow();
  });
});
