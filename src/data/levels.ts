export interface LevelDefinition {
  readonly id: string;
  readonly number: number;
  readonly name: string;
  readonly quota: number;
  readonly challenge: string;
}

export const LEVELS: readonly LevelDefinition[] = [
  {
    id: 'primer-recorrido',
    number: 1,
    name: 'Primer recorrido',
    quota: 25,
    challenge: 'Pista plana y paraderos cercanos',
  },
  {
    id: 'subida-al-cerro',
    number: 2,
    name: 'Subida al cerro',
    quota: 40,
    challenge: 'Pendiente larga y poco impulso',
  },
  {
    id: 'dia-de-mercado',
    number: 3,
    name: 'Día de mercado',
    quota: 55,
    challenge: 'Carga alta y equilibrio',
  },
  {
    id: 'pista-danada',
    number: 4,
    name: 'Pista dañada',
    quota: 70,
    challenge: 'Baches, rampa e impactos',
  },
  {
    id: 'hora-punta',
    number: 5,
    name: 'Hora punta',
    quota: 90,
    challenge: 'Capacidad y decisiones rápidas',
  },
];
