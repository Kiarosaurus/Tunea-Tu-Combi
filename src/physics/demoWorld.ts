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
  return createRideWorld('primer-recorrido', equipment);
}

export function createRideWorld(levelId: string, equipment: LevelOneEquipment = {}): PhysicsWorld {
  const terrain = terrainForLevel(levelId);
  const body: RigidBody = {
    id: `${levelId}-combi`,
    position: { x: 2, y: 2.5 },
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

function terrainForLevel(levelId: string): readonly TerrainSegment[] {
  if (levelId === 'primer-recorrido') return [
    { start: { x: -2, y: 0 }, end: { x: 12, y: 0 } },
    { start: { x: 12, y: 0 }, end: { x: 16, y: 0.25 } },
    { start: { x: 16, y: 0.25 }, end: { x: 22, y: 0.25 } },
    { start: { x: 22, y: 0.25 }, end: { x: 26, y: 0 } },
    { start: { x: 26, y: 0 }, end: { x: 35, y: 0 } },
  ];
  if (levelId === 'subida-al-cerro') return [
    { start: { x: -2, y: 0 }, end: { x: 8, y: 0 } },
    { start: { x: 8, y: 0 }, end: { x: 20, y: 3.2 } },
    { start: { x: 20, y: 3.2 }, end: { x: 28, y: 5.2 } },
    { start: { x: 28, y: 5.2 }, end: { x: 40, y: 5.2 } },
  ];
  if (levelId === 'dia-de-mercado') return [
    { start: { x: -2, y: 0 }, end: { x: 9, y: 0 } },
    { start: { x: 9, y: 0 }, end: { x: 14, y: 0.7 } },
    { start: { x: 14, y: 0.7 }, end: { x: 20, y: 0.1 } },
    { start: { x: 20, y: 0.1 }, end: { x: 27, y: 0.9 } },
    { start: { x: 27, y: 0.9 }, end: { x: 40, y: 0 } },
  ];
  throw new Error(`No hay terreno jugable para ${levelId}.`);
}

function partMass(kind: 'roofRack' | 'rearCarrier'): number {
  const part = PART_CATALOG.find((item) => item.kind === kind);
  if (!part) throw new Error(`Falta la masa de ${kind}.`);
  return part.massKg;
}
