import { PhysicsWorld, type RigidBody, type TerrainSegment } from './world';

const DEMO_TERRAIN: readonly TerrainSegment[] = [
  { start: { x: -2, y: 0 }, end: { x: 7, y: 0 } },
  { start: { x: 7, y: 0 }, end: { x: 11, y: 0.45 } },
  { start: { x: 11, y: 0.45 }, end: { x: 17, y: 0.45 } },
];

export function createDemoWorld(): PhysicsWorld {
  const body: RigidBody = {
    id: 'demo-combi',
    position: { x: 3, y: 3.1 },
    angleRadians: 0,
    velocity: { x: 1.3, y: 0 },
    angularVelocity: 0,
    massKg: 700,
    inertiaKgM2: 950,
    force: { x: 0, y: 0 },
    torqueNm: 0,
    wheels: [
      { offset: { x: -1.05, y: -0.55 }, radius: 0.4 },
      { offset: { x: 1.05, y: -0.55 }, radius: 0.4 },
    ],
  };
  return new PhysicsWorld(body, DEMO_TERRAIN);
}
