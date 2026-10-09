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
    quota: 10, starGoals: [5, 10, 15], buildBudget: 100,
    defaultExtras: [],
    challenge: 'Solicitudes simultáneas y decisiones de capacidad',
    durationSeconds: 60, finishX: 96, maxSpeedMps: 3.6, seed: 'primer-recorrido-base',
  },
  {
    id: 'subida-al-cerro',
    number: 2,
    name: 'Subida al cerro',
    quota: 12, starGoals: [6, 12, 18], buildBudget: 100,
    defaultExtras: [],
    challenge: 'Pendiente larga y poco impulso',
    durationSeconds: 60, finishX: 105, maxSpeedMps: 4.3, seed: 'subida-al-cerro-base',
  },
  {
    id: 'dia-de-mercado',
    number: 3,
    name: 'Día de mercado',
    quota: 14, starGoals: [7, 14, 20], buildBudget: 100,
    defaultExtras: [],
    challenge: 'Carga alta y equilibrio',
    durationSeconds: 60, finishX: 110, maxSpeedMps: 4.6, seed: 'dia-de-mercado-base',
  },
  {
    id: 'pista-danada',
    number: 4,
    name: 'Pista dañada',
    quota: 15, starGoals: [8, 15, 20], buildBudget: 140,
    defaultExtras: [],
    challenge: 'Baches, rampa e impactos',
    durationSeconds: 60, finishX: 115, maxSpeedMps: 4.8, seed: 'pista-danada-base',
  },
  {
    id: 'hora-punta',
    number: 5,
    name: 'Hora punta',
    quota: 18, starGoals: [9, 18, 25], buildBudget: 140,
    defaultExtras: [],
    challenge: 'Capacidad y decisiones rápidas',
    durationSeconds: 60, finishX: 120, maxSpeedMps: 5, seed: 'hora-punta-base',
  },
];
