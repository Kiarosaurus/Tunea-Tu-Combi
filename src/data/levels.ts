export interface LevelDefinition {
  readonly id: string;
  readonly number: number;
  readonly name: string;
  readonly quota: number;
  readonly challenge: string;
  readonly durationSeconds: number;
  readonly finishX: number;
  readonly seed: string;
}

export const LEVELS: readonly LevelDefinition[] = [
  {
    id: 'primer-recorrido',
    number: 1,
    name: 'Primer recorrido',
    quota: 6,
    challenge: 'Pista plana y paraderos cercanos',
    durationSeconds: 30, finishX: 31, seed: 'primer-recorrido-base',
  },
  {
    id: 'subida-al-cerro',
    number: 2,
    name: 'Subida al cerro',
    quota: 8,
    challenge: 'Pendiente larga y poco impulso',
    durationSeconds: 30, finishX: 37, seed: 'subida-al-cerro-base',
  },
  {
    id: 'dia-de-mercado',
    number: 3,
    name: 'Día de mercado',
    quota: 9,
    challenge: 'Carga alta y equilibrio',
    durationSeconds: 30, finishX: 37, seed: 'dia-de-mercado-base',
  },
  {
    id: 'pista-danada',
    number: 4,
    name: 'Pista dañada',
    quota: 10,
    challenge: 'Baches, rampa e impactos',
    durationSeconds: 30, finishX: 40, seed: 'pista-danada-base',
  },
  {
    id: 'hora-punta',
    number: 5,
    name: 'Hora punta',
    quota: 11,
    challenge: 'Capacidad y decisiones rápidas',
    durationSeconds: 30, finishX: 42, seed: 'hora-punta-base',
  },
];
