import type { PartKind } from './parts';

export interface RoadObstacle {
  readonly id: string;
  readonly x: number;
  readonly kind: 'pothole' | 'debris' | 'speedBump';
  readonly safeSpeedMps: number;
  readonly impactImpulseNs: number;
}

export interface LevelDefinition {
  readonly id: string;
  readonly number: number;
  readonly name: string;
  readonly quota: number;
  readonly starGoals: readonly [number, number, number];
  readonly buildBudget: number;
  readonly defaultExtras: readonly PartKind[];
  readonly challenge: string;
  readonly durationSeconds: number;
  readonly finishX: number;
  readonly maxSpeedMps: number;
  readonly seed: string;
  readonly obstacles: readonly RoadObstacle[];
}

export const LEVELS: readonly LevelDefinition[] = [
  {
    id: 'primer-recorrido',
    number: 1,
    name: 'Primer recorrido',
    quota: 8, starGoals: [4, 8, 11], buildBudget: 30,
    defaultExtras: [],
    challenge: 'Solicitudes simultáneas y decisiones de capacidad',
    durationSeconds: 60, finishX: 96, maxSpeedMps: 3.6, seed: 'primer-recorrido-base',
    obstacles: [
      { id: 'primer-bache', x: 23, kind: 'pothole', safeSpeedMps: 1.8, impactImpulseNs: 8000 },
      { id: 'primer-escombro', x: 74, kind: 'debris', safeSpeedMps: 1.8, impactImpulseNs: 8500 },
    ],
  },
  {
    id: 'subida-al-cerro',
    number: 2,
    name: 'Subida al cerro',
    quota: 12, starGoals: [6, 12, 18], buildBudget: 30,
    defaultExtras: [],
    challenge: 'Pendiente larga y poco impulso',
    durationSeconds: 60, finishX: 105, maxSpeedMps: 4.3, seed: 'subida-al-cerro-base',
    obstacles: [
      { id: 'cerro-bache', x: 41, kind: 'pothole', safeSpeedMps: 1.9, impactImpulseNs: 9000 },
      { id: 'cerro-escombro', x: 82, kind: 'debris', safeSpeedMps: 1.8, impactImpulseNs: 10000 },
    ],
  },
  {
    id: 'dia-de-mercado',
    number: 3,
    name: 'Día de mercado',
    quota: 15, starGoals: [8, 15, 19], buildBudget: 60,
    defaultExtras: [],
    challenge: 'Carga alta y equilibrio',
    durationSeconds: 60, finishX: 110, maxSpeedMps: 4.6, seed: 'dia-de-mercado-base',
    obstacles: [
      { id: 'mercado-bache', x: 19, kind: 'pothole', safeSpeedMps: 1.9, impactImpulseNs: 9500 },
      { id: 'mercado-caja', x: 69, kind: 'debris', safeSpeedMps: 1.8, impactImpulseNs: 10500 },
      { id: 'mercado-rompemuelles', x: 100, kind: 'speedBump', safeSpeedMps: 1.7, impactImpulseNs: 10500 },
    ],
  },
  {
    id: 'pista-danada',
    number: 4,
    name: 'Pista dañada',
    quota: 18, starGoals: [9, 18, 23], buildBudget: 95,
    defaultExtras: [],
    challenge: 'Baches, rampa e impactos',
    durationSeconds: 60, finishX: 115, maxSpeedMps: 4.8, seed: 'pista-danada-base',
    obstacles: [
      { id: 'pista-escombro-uno', x: 23, kind: 'debris', safeSpeedMps: 1.7, impactImpulseNs: 12000 },
      { id: 'pista-bache', x: 51, kind: 'pothole', safeSpeedMps: 1.6, impactImpulseNs: 12500 },
      { id: 'pista-escombro-dos', x: 77, kind: 'debris', safeSpeedMps: 1.7, impactImpulseNs: 13000 },
      { id: 'pista-rompemuelles', x: 106, kind: 'speedBump', safeSpeedMps: 1.5, impactImpulseNs: 13000 },
    ],
  },
  {
    id: 'hora-punta',
    number: 5,
    name: 'Hora punta',
    quota: 24, starGoals: [12, 24, 25], buildBudget: 130,
    defaultExtras: [],
    challenge: 'Capacidad y decisiones rápidas',
    durationSeconds: 60, finishX: 120, maxSpeedMps: 5, seed: 'hora-punta-base',
    obstacles: [
      { id: 'punta-bache-uno', x: 18, kind: 'pothole', safeSpeedMps: 1.8, impactImpulseNs: 11500 },
      { id: 'punta-escombro-uno', x: 40, kind: 'debris', safeSpeedMps: 1.7, impactImpulseNs: 13500 },
      { id: 'punta-rompemuelles', x: 64, kind: 'speedBump', safeSpeedMps: 1.6, impactImpulseNs: 14000 },
      { id: 'punta-bache-dos', x: 89, kind: 'pothole', safeSpeedMps: 1.7, impactImpulseNs: 14000 },
      { id: 'punta-escombro-dos', x: 113, kind: 'debris', safeSpeedMps: 1.6, impactImpulseNs: 14500 },
    ],
  },
];
