import { PART_CATALOG } from '../data/parts';
import { PhysicsWorld, type JointMount, type RigidBody, type SuspensionParameters, type TerrainSegment } from './world';

const REINFORCED_SUSPENSION: SuspensionParameters = {
  restLengthM: 0.25,
  maxCompressionM: 0.2,
  stiffnessNPerM: 24000,
  dampingNsPerM: 1800,
};

export const MENU_SHOWCASE_SPEED_MPS = 6.2;

const MENU_TERRAINS: readonly (readonly TerrainSegment[])[] = [
  [
    { start: { x: -2, y: 0 }, end: { x: 5, y: 0 } },
    { start: { x: 5, y: 0 }, end: { x: 9, y: 0.75 } },
    { start: { x: 9, y: 0.75 }, end: { x: 18, y: 0.75 } },
  ],
  [
    { start: { x: -2, y: 0 }, end: { x: 4.5, y: 0 } },
    { start: { x: 4.5, y: 0 }, end: { x: 8, y: 1.5 } },
    { start: { x: 8, y: 1.5 }, end: { x: 12, y: 2.1 } },
    { start: { x: 12, y: 2.1 }, end: { x: 18, y: 2.1 } },
  ],
  [
    { start: { x: -2, y: 0 }, end: { x: 4, y: 0 } },
    { start: { x: 4, y: 0 }, end: { x: 5.5, y: 0.55 } },
    { start: { x: 5.5, y: 0.55 }, end: { x: 7, y: 0 } },
    { start: { x: 7, y: 0 }, end: { x: 8.5, y: 0.85 } },
    { start: { x: 8.5, y: 0.85 }, end: { x: 10.5, y: 0 } },
    { start: { x: 10.5, y: 0 }, end: { x: 18, y: 0.35 } },
  ],
  [
    { start: { x: -2, y: 0 }, end: { x: 5, y: 0 } },
    { start: { x: 5, y: 0 }, end: { x: 7, y: 1.05 } },
    { start: { x: 7, y: 1.05 }, end: { x: 10, y: 0.35 } },
    { start: { x: 10, y: 0.35 }, end: { x: 13, y: 1.35 } },
    { start: { x: 13, y: 1.35 }, end: { x: 18, y: 1.35 } },
  ],
];

export function createDemoWorld(): PhysicsWorld {
  return createMenuShowcaseWorld(0);
}

export function createMenuShowcaseWorld(variant: number): PhysicsWorld {
  const terrain = MENU_TERRAINS[((variant % MENU_TERRAINS.length) + MENU_TERRAINS.length) %
    MENU_TERRAINS.length] ?? MENU_TERRAINS[0];
  if (!terrain) throw new Error('La portada requiere al menos un terreno.');
  const positionX = 3;
  const pose = menuRoadPose(terrain, positionX);
  const body: RigidBody = {
    id: 'demo-combi',
    position: { x: positionX, y: pose.y },
    angleRadians: pose.angleRadians,
    velocity: { x: MENU_SHOWCASE_SPEED_MPS, y: 0 },
    angularVelocity: 0,
    massKg: 700,
    inertiaKgM2: 950,
    force: { x: 0, y: 0 },
    torqueNm: 0,
    wheels: [
      { offset: { x: -1.05, y: -0.55 }, radius: 0.4, frictionCoefficient: 0.35 },
      { offset: { x: 1.05, y: -0.55 }, radius: 0.4, frictionCoefficient: 0.35 },
    ],
    chassisCollider: {
      offset: { x: 0, y: 0.405 },
      halfWidth: 1.55,
      halfHeight: 0.625,
      frictionCoefficient: 0.38,
    },
  };
  return new PhysicsWorld(body, terrain);
}

export function advanceMenuShowcaseWorld(world: PhysicsWorld, durationSeconds: number): void {
  const snapshot = world.snapshot();
  const positionX = snapshot.body.position.x + MENU_SHOWCASE_SPEED_MPS * durationSeconds;
  const pose = menuRoadPose(snapshot.terrain, positionX);
  world.setDisplayPose({ x: positionX, y: pose.y }, pose.angleRadians,
    { x: MENU_SHOWCASE_SPEED_MPS, y: 0 });
}

function menuRoadPose(terrain: readonly TerrainSegment[], positionX: number):
  { readonly y: number; readonly angleRadians: number } {
  const rearGroundY = menuTerrainHeightAt(terrain, positionX - 1.05);
  const frontGroundY = menuTerrainHeightAt(terrain, positionX + 1.05);
  const angleRadians = Math.atan2(frontGroundY - rearGroundY, 2.1);
  return {
    y: (rearGroundY + frontGroundY) / 2 + 0.55 * Math.cos(angleRadians) + 0.4,
    angleRadians,
  };
}

function menuTerrainHeightAt(terrain: readonly TerrainSegment[], x: number): number {
  const segment = terrain.find((candidate) => x >= candidate.start.x && x <= candidate.end.x) ??
    terrain[0];
  if (!segment) return 0;
  const length = segment.end.x - segment.start.x;
  if (length === 0) return segment.start.y;
  const progress = Math.max(0, Math.min(1, (x - segment.start.x) / length));
  return segment.start.y + (segment.end.y - segment.start.y) * progress;
}

export interface LevelOneEquipment {
  readonly reinforcedSuspension?: boolean;
  readonly roofRack?: boolean;
  readonly rearCarrier?: boolean;
  readonly bodyMassKg?: number;
  readonly centerOfMass?: { readonly x: number; readonly y: number };
  readonly wheelOffsets?: readonly { readonly x: number; readonly y: number }[];
}

export function createLevelOneWorld(equipment: LevelOneEquipment = {}): PhysicsWorld {
  return createRideWorld('primer-recorrido', equipment);
}

export function createRideWorld(levelId: string, equipment: LevelOneEquipment = {}): PhysicsWorld {
  const terrain = terrainForLevel(levelId);
  const centerOfMass = equipment.centerOfMass ?? { x: 0, y: 0 };
  const configuredWheels = equipment.wheelOffsets;
  const wheelOffsets = configuredWheels === undefined
    ? [{ x: -1.05 - centerOfMass.x, y: -0.55 - centerOfMass.y },
      { x: 1.05 - centerOfMass.x, y: -0.55 - centerOfMass.y }]
    : configuredWheels;
  const chassisBottom = 0.405 - centerOfMass.y - 0.625;
  const lowestLocalPoint = Math.min(chassisBottom,
    ...wheelOffsets.map((offset) => offset.y - 0.4));
  const body: RigidBody = {
    id: `${levelId}-combi`,
    position: { x: 2, y: -lowestLocalPoint + 0.12 },
    angleRadians: 0,
    velocity: { x: 0, y: 0 },
    angularVelocity: 0,
    massKg: equipment.bodyMassKg ?? 700,
    inertiaKgM2: 950,
    force: { x: 0, y: 0 },
    torqueNm: 0,
    centerOfMassOffset: { ...centerOfMass },
    chassisCollider: {
      offset: { x: -centerOfMass.x, y: 0.405 - centerOfMass.y },
      halfWidth: 1.55,
      halfHeight: 0.625,
      frictionCoefficient: 0.38,
    },
    wheels: wheelOffsets.map((offset) => ({
      offset: { ...offset },
      radius: 0.4,
      ...(equipment.reinforcedSuspension ? { suspension: REINFORCED_SUSPENSION } : {}),
    })),
  };
  const joints: JointMount[] = [];
  const threshold = equipment.reinforcedSuspension ? 12000 : 6000;
  if (equipment.roofRack) joints.push({ id: 'roofRack',
    offset: { x: -1.05 - centerOfMass.x, y: 0.75 - centerOfMass.y },
    massKg: partMass('roofRack'), breakImpulseNs: threshold });
  if (equipment.rearCarrier) joints.push({ id: 'rearCarrier',
    offset: { x: -1.7 - centerOfMass.x, y: -centerOfMass.y },
    massKg: partMass('rearCarrier'), breakImpulseNs: threshold });
  return new PhysicsWorld(body, terrain, joints);
}

function terrainForLevel(levelId: string): readonly TerrainSegment[] {
  if (levelId === 'primer-recorrido') return [
    { start: { x: -2, y: 0 }, end: { x: 18, y: 0 } },
    { start: { x: 18, y: 0 }, end: { x: 22, y: 0.25 } },
    { start: { x: 22, y: 0.25 }, end: { x: 34, y: 0.25 } },
    { start: { x: 34, y: 0.25 }, end: { x: 38, y: 0 } },
    { start: { x: 38, y: 0 }, end: { x: 54, y: 0 } },
    { start: { x: 54, y: 0 }, end: { x: 59, y: 0.35 } },
    { start: { x: 59, y: 0.35 }, end: { x: 72, y: 0.35 } },
    { start: { x: 72, y: 0.35 }, end: { x: 77, y: 0 } },
    { start: { x: 77, y: 0 }, end: { x: 100, y: 0 } },
  ];
  if (levelId === 'subida-al-cerro') return [
    { start: { x: -2, y: 0 }, end: { x: 8, y: 0 } },
    { start: { x: 8, y: 0 }, end: { x: 12, y: 1.2 } },
    { start: { x: 12, y: 1.2 }, end: { x: 18, y: 1.2 } },
    { start: { x: 18, y: 1.2 }, end: { x: 22, y: 2.4 } },
    { start: { x: 22, y: 2.4 }, end: { x: 29, y: 2.4 } },
    { start: { x: 29, y: 2.4 }, end: { x: 34, y: 3.8 } },
    { start: { x: 34, y: 3.8 }, end: { x: 46, y: 3.8 } },
    { start: { x: 46, y: 3.8 }, end: { x: 53, y: 2.5 } },
    { start: { x: 53, y: 2.5 }, end: { x: 66, y: 2.5 } },
    { start: { x: 66, y: 2.5 }, end: { x: 73, y: 4.1 } },
    { start: { x: 73, y: 4.1 }, end: { x: 87, y: 4.1 } },
    { start: { x: 87, y: 4.1 }, end: { x: 94, y: 5.2 } },
    { start: { x: 94, y: 5.2 }, end: { x: 109, y: 5.2 } },
  ];
  if (levelId === 'dia-de-mercado') return [
    { start: { x: -2, y: 0 }, end: { x: 9, y: 0 } },
    { start: { x: 9, y: 0 }, end: { x: 14, y: 0.7 } },
    { start: { x: 14, y: 0.7 }, end: { x: 20, y: 0.1 } },
    { start: { x: 20, y: 0.1 }, end: { x: 27, y: 0.9 } },
    { start: { x: 27, y: 0.9 }, end: { x: 40, y: 0 } },
    { start: { x: 40, y: 0 }, end: { x: 50, y: 0.55 } },
    { start: { x: 50, y: 0.55 }, end: { x: 61, y: 0.05 } },
    { start: { x: 61, y: 0.05 }, end: { x: 73, y: 0.8 } },
    { start: { x: 73, y: 0.8 }, end: { x: 84, y: 0.15 } },
    { start: { x: 84, y: 0.15 }, end: { x: 96, y: 0.95 } },
    { start: { x: 96, y: 0.95 }, end: { x: 114, y: 0 } },
  ];
  if (levelId === 'pista-danada') return [
    { start: { x: -2, y: 0 }, end: { x: 8, y: 0 } },
    { start: { x: 8, y: 0 }, end: { x: 11, y: 0.75 } },
    { start: { x: 11, y: 0.75 }, end: { x: 14, y: 0 } },
    { start: { x: 14, y: 0 }, end: { x: 17, y: 1.05 } },
    { start: { x: 17, y: 1.05 }, end: { x: 21, y: 0 } },
    { start: { x: 21, y: 0 }, end: { x: 25, y: 0.55 } },
    { start: { x: 25, y: 0.55 }, end: { x: 29, y: 0 } },
    { start: { x: 29, y: 0 }, end: { x: 33, y: 0.9 } },
    { start: { x: 33, y: 0.9 }, end: { x: 43, y: 0 } },
    { start: { x: 43, y: 0 }, end: { x: 47, y: 0.8 } },
    { start: { x: 47, y: 0.8 }, end: { x: 52, y: 0 } },
    { start: { x: 52, y: 0 }, end: { x: 58, y: 0.35 } },
    { start: { x: 58, y: 0.35 }, end: { x: 63, y: 0 } },
    { start: { x: 63, y: 0 }, end: { x: 68, y: 1.05 } },
    { start: { x: 68, y: 1.05 }, end: { x: 74, y: 0 } },
    { start: { x: 74, y: 0 }, end: { x: 80, y: 0.6 } },
    { start: { x: 80, y: 0.6 }, end: { x: 86, y: 0 } },
    { start: { x: 86, y: 0 }, end: { x: 92, y: 1.15 } },
    { start: { x: 92, y: 1.15 }, end: { x: 98, y: 0 } },
    { start: { x: 98, y: 0 }, end: { x: 103, y: 0.7 } },
    { start: { x: 103, y: 0.7 }, end: { x: 119, y: 0 } },
  ];
  if (levelId === 'hora-punta') return [
    { start: { x: -2, y: 0 }, end: { x: 7, y: 0 } },
    { start: { x: 7, y: 0 }, end: { x: 14, y: 1.4 } },
    { start: { x: 14, y: 1.4 }, end: { x: 18, y: 0.8 } },
    { start: { x: 18, y: 0.8 }, end: { x: 22, y: 1.5 } },
    { start: { x: 22, y: 1.5 }, end: { x: 27, y: 0.5 } },
    { start: { x: 27, y: 0.5 }, end: { x: 31, y: 1.2 } },
    { start: { x: 31, y: 1.2 }, end: { x: 36, y: 0.2 } },
    { start: { x: 36, y: 0.2 }, end: { x: 45, y: 0.2 } },
    { start: { x: 45, y: 0.2 }, end: { x: 53, y: 1.35 } },
    { start: { x: 53, y: 1.35 }, end: { x: 60, y: 0.25 } },
    { start: { x: 60, y: 0.25 }, end: { x: 68, y: 1.55 } },
    { start: { x: 68, y: 1.55 }, end: { x: 76, y: 0.35 } },
    { start: { x: 76, y: 0.35 }, end: { x: 84, y: 1.25 } },
    { start: { x: 84, y: 1.25 }, end: { x: 93, y: 0.15 } },
    { start: { x: 93, y: 0.15 }, end: { x: 101, y: 1.4 } },
    { start: { x: 101, y: 1.4 }, end: { x: 109, y: 0.25 } },
    { start: { x: 109, y: 0.25 }, end: { x: 124, y: 0.25 } },
  ];
  throw new Error(`No hay terreno jugable para ${levelId}.`);
}

function partMass(kind: 'roofRack' | 'rearCarrier'): number {
  const part = PART_CATALOG.find((item) => item.kind === kind);
  if (!part) throw new Error(`Falta la masa de ${kind}.`);
  return part.massKg;
}
