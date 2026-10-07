import type { PartKind } from './parts';

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
}

export const LEVELS: readonly LevelDefinition[] = [
  {
    id: 'primer-recorrido',
    number: 1,
    name: 'Primer recorrido',
    quota: 6, starGoals: [4, 6, 8], buildBudget: 100,
    defaultExtras: [],
    challenge: 'Pista plana y paraderos cercanos',
    durationSeconds: 60, finishX: 48, maxSpeedMps: 3.6, seed: 'primer-recorrido-base',
  },
  {
    id: 'subida-al-cerro',
    number: 2,
    name: 'Subida al cerro',
    quota: 8, starGoals: [6, 8, 9], buildBudget: 100,
    defaultExtras: [],
    challenge: 'Pendiente larga y poco impulso',
    durationSeconds: 60, finishX: 37, maxSpeedMps: 5.5, seed: 'subida-al-cerro-base',
  },
  {
    id: 'dia-de-mercado',
    number: 3,
    name: 'Día de mercado',
    quota: 9, starGoals: [7, 9, 10], buildBudget: 100,
    defaultExtras: [],
    challenge: 'Carga alta y equilibrio',
    durationSeconds: 60, finishX: 37, maxSpeedMps: 5.5, seed: 'dia-de-mercado-base',
  },
  {
    id: 'pista-danada',
    number: 4,
    name: 'Pista dañada',
    quota: 10, starGoals: [8, 10, 11], buildBudget: 140,
    defaultExtras: [],
    challenge: 'Baches, rampa e impactos',
    durationSeconds: 60, finishX: 40, maxSpeedMps: 5.5, seed: 'pista-danada-base',
  },
  {
    id: 'hora-punta',
    number: 5,
    name: 'Hora punta',
    quota: 11, starGoals: [9, 11, 12], buildBudget: 140,
    defaultExtras: [],
    challenge: 'Capacidad y decisiones rápidas',
    durationSeconds: 60, finishX: 42, maxSpeedMps: 5.5, seed: 'hora-punta-base',
  },
];
