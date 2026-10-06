export type PartKind =
  | 'chassis'
  | 'wheel'
  | 'engine'
  | 'seat'
  | 'roofRack'
  | 'rearCarrier'
  | 'suspension';

export interface PartDefinition {
  readonly kind: PartKind;
  readonly name: string;
  readonly price: number;
  readonly massKg: number;
  readonly function: string;
  readonly effect: string;
  readonly space: string;
  readonly level: number;
}

export const PART_CATALOG: readonly PartDefinition[] = [
  { kind: 'chassis', name: 'Chasis base', price: 0, massKg: 520, level: 1,
    function: 'Sostiene la construcción', effect: 'Base estructural', space: '4 x 3' },
  { kind: 'wheel', name: 'Rueda estándar', price: 20, massKg: 18, level: 1,
    function: 'Contacto y tracción', effect: 'Permite avanzar', space: 'Inferior' },
  { kind: 'engine', name: 'Motor urbano', price: 45, massKg: 130, level: 1,
    function: 'Entrega fuerza motriz', effect: 'Máximo 2200 N', space: 'Interior' },
  { kind: 'seat', name: 'Asiento', price: 15, massKg: 12, level: 1,
    function: 'Transporta una persona', effect: 'Capacidad +1', space: 'Interior' },
  { kind: 'roofRack', name: 'Parrilla de techo', price: 30, massKg: 28, level: 1,
    function: 'Sostiene carga superior', effect: 'Carga de techo +1', space: 'Exterior superior' },
  { kind: 'rearCarrier', name: 'Portacarga posterior', price: 35, massKg: 34, level: 1,
    function: 'Transporta un scooter', effect: 'Scooter +1', space: 'Exterior posterior' },
  { kind: 'suspension', name: 'Suspensión reforzada', price: 35, massKg: 24, level: 1,
    function: 'Absorbe impactos', effect: 'Uniones más resistentes', space: 'Inferior' },
];
