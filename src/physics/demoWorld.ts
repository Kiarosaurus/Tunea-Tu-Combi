import { PART_CATALOG } from '../data/parts';
import { PhysicsWorld, type JointMount, type RigidBody, type SuspensionParameters, type TerrainSegment } from './world';

const REINFORCED_SUSPENSION: SuspensionParameters = {
  restLengthM: 0.25,
  maxCompressionM: 0.2,
  stiffnessNPerM: 24000,
  dampingNsPerM: 1800,
};

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
      { offset: { x: -1.05, y: -0.55 }, radius: 0.4, frictionCoefficient: 0.35 },
      { offset: { x: 1.05, y: -0.55 }, radius: 0.4, frictionCoefficient: 0.35 },
    ],
  };
  return new PhysicsWorld(body, DEMO_TERRAIN);
}

export interface LevelOneEquipment {
  readonly reinforcedSuspension?: boolean;
  readonly roofRack?: boolean;
  readonly rearCarrier?: boolean;
}

export function createLevelOneWorld(equipment: LevelOneEquipment = {}): PhysicsWorld {
  const terrain: readonly TerrainSegment[] = [
    { start: { x: -2, y: 0 }, end: { x: 12, y: 0 } },
    { start: { x: 12, y: 0 }, end: { x: 16, y: 0.25 } },
    { start: { x: 16, y: 0.25 }, end: { x: 22, y: 0.25 } },
    { start: { x: 22, y: 0.25 }, end: { x: 26, y: 0 } },
    { start: { x: 26, y: 0 }, end: { x: 35, y: 0 } },
  ];
  const body: RigidBody = {
    id: 'level-one-combi',
    position: { x: 2, y: 2 },
    angleRadians: 0,
    velocity: { x: 0, y: 0 },
    angularVelocity: 0,
    massKg: 700,
    inertiaKgM2: 950,
    force: { x: 0, y: 0 },
    torqueNm: 0,
    wheels: [
      { offset: { x: -1.05, y: -0.55 }, radius: 0.4,
        ...(equipment.reinforcedSuspension ? { suspension: REINFORCED_SUSPENSION } : {}) },
      { offset: { x: 1.05, y: -0.55 }, radius: 0.4,
        ...(equipment.reinforcedSuspension ? { suspension: REINFORCED_SUSPENSION } : {}) },
    ],
  };
  const joints: JointMount[] = [];
  const threshold = equipment.reinforcedSuspension ? 3000 : 2200;
  if (equipment.roofRack) joints.push({ id: 'roofRack', offset: { x: 0, y: 0.75 },
    massKg: partMass('roofRack'), breakImpulseNs: threshold });
  if (equipment.rearCarrier) joints.push({ id: 'rearCarrier', offset: { x: -1.7, y: 0 },
    massKg: partMass('rearCarrier'), breakImpulseNs: threshold });
  return new PhysicsWorld(body, terrain, joints);
}

function partMass(kind: 'roofRack' | 'rearCarrier'): number {
  const part = PART_CATALOG.find((item) => item.kind === kind);
  if (!part) throw new Error(`Falta la masa de ${kind}.`);
  return part.massKg;
}
