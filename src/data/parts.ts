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
}

export const PART_CATALOG: readonly PartDefinition[] = [
  { kind: 'chassis', name: 'Chasis base', price: 0, massKg: 520 },
  { kind: 'wheel', name: 'Rueda estándar', price: 20, massKg: 18 },
  { kind: 'engine', name: 'Motor urbano', price: 45, massKg: 130 },
  { kind: 'seat', name: 'Asiento', price: 15, massKg: 12 },
  { kind: 'roofRack', name: 'Parrilla de techo', price: 30, massKg: 28 },
  { kind: 'rearCarrier', name: 'Portacarga posterior', price: 35, massKg: 34 },
  { kind: 'suspension', name: 'Suspensión reforzada', price: 40, massKg: 24 },
];
