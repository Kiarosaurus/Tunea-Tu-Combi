import { LEVELS } from '../data/levels';
import { dropoffXForStop } from '../data/transitRoute';

export type RequestKind = 'passenger' | 'roofCargo' | 'scooter';

export interface RideRequest {
  readonly id: string;
  readonly originStop: string;
  readonly destinationStop: string;
  readonly originX: number;
  readonly destinationX: number;
  readonly kind: RequestKind;
  readonly massKg: number;
  readonly requiredCapacity: number;
  readonly baseFare: number;
  readonly distanceFare: number;
  readonly visualVariant: string;
  readonly attendantVariant: string;
  readonly cargoMassKg: number;
}

const PEOPLE_VARIANTS = ['azul', 'rojo', 'verde', 'amarillo'] as const;
const CARGO_VARIANTS = ['cajas', 'canastas', 'sacos'] as const;

export function generateLevelOneRequests(seed: string): readonly RideRequest[] {
  return generateRequests('primer-recorrido', seed);
}

export function generateRequests(levelId: string, seed: string): readonly RideRequest[] {
  if (!seed.trim()) throw new Error('La semilla de solicitudes no puede estar vacía.');
  const random = seededRandom(seed);
  const level = LEVELS.find((candidate) => candidate.id === levelId);
  if (!level) throw new Error(`No hay solicitudes para ${levelId}.`);
  const passenger = (id: string, originStop: string, destinationStop: string,
    originX: number): RideRequest => passengerRequest(id, originStop, destinationStop, originX,
      dropoffXForStop(destinationStop, level.finishX, random()), random);
  const cargo = (id: string, originStop: string, destinationStop: string, originX: number,
    kind: Exclude<RequestKind, 'passenger'>): RideRequest => cargoRequestForRoute(
    id, originStop, destinationStop, originX,
    dropoffXForStop(destinationStop, level.finishX, random()), kind, random);
  if (levelId === 'subida-al-cerro') return [
    passenger('cerro-uno-a', 'Collique', 'Vista Alegre', 4),
    passenger('cerro-uno-b', 'Collique', 'Hospital Collique', 7),
    passenger('cerro-dos-a', 'Vista Alegre', 'Universitaria', 29),
    passenger('cerro-dos-b', 'Vista Alegre', 'Trapiche', 32),
    passenger('cerro-tres-a', 'Universitaria', 'Canta Callao', 54),
    passenger('cerro-tres-b', 'Universitaria', 'Naranjal', 57),
    passenger('cerro-cuatro-a', 'Trapiche', 'Canta Callao', 80),
    passenger('cerro-cuatro-b', 'Trapiche', 'Naranjal', 83),
  ];
  if (levelId === 'dia-de-mercado') return [
    passenger('mercado-uno-a', 'Collique', 'Próceres', 4),
    cargo('mercado-uno-b', 'Collique', 'Hospital Collique', 7, 'roofCargo'),
    passenger('mercado-dos-a', 'Vista Alegre', 'Hospital Collique', 29),
    cargo('mercado-dos-b', 'Vista Alegre', 'Trapiche', 32, 'scooter'),
    cargo('mercado-tres-a', 'Universitaria', 'Trapiche', 55, 'roofCargo'),
    passenger('mercado-tres-b', 'Universitaria', 'Canta Callao', 58),
    cargo('mercado-cuatro-a', 'Trapiche', 'Naranjal', 81, 'scooter'),
    passenger('mercado-cuatro-b', 'Trapiche', 'Canta Callao', 84),
  ];
  if (levelId === 'pista-danada') return [
    passenger('pista-uno-a', 'Collique', 'Próceres', 4),
    cargo('pista-uno-b', 'Collique', 'Hospital Collique', 7, 'roofCargo'),
    cargo('pista-dos-a', 'Vista Alegre', 'Universitaria', 31, 'roofCargo'),
    passenger('pista-dos-b', 'Vista Alegre', 'Hospital Collique', 34),
    passenger('pista-tres-a', 'Universitaria', 'Universitaria', 59),
    cargo('pista-tres-b', 'Universitaria', 'Canta Callao', 62, 'scooter'),
    cargo('pista-cuatro-a', 'Trapiche', 'Naranjal', 86, 'scooter'),
    passenger('pista-cuatro-b', 'Trapiche', 'Canta Callao', 89),
  ];
  if (levelId === 'hora-punta') return [
    passenger('punta-uno-a', 'Collique', 'Próceres', 3),
    cargo('punta-uno-b', 'Collique', 'Hospital Collique', 6, 'roofCargo'),
    cargo('punta-dos-a', 'Próceres', 'Vista Alegre', 25, 'roofCargo'),
    passenger('punta-dos-b', 'Próceres', 'Vista Alegre', 28),
    passenger('punta-tres-a', 'Hospital Collique', 'Hospital Collique', 49),
    cargo('punta-tres-b', 'Hospital Collique', 'Canta Callao', 52, 'scooter'),
    cargo('punta-cuatro-a', 'Universitaria', 'Canta Callao', 73, 'scooter'),
    passenger('punta-cuatro-b', 'Universitaria', 'Trapiche', 76),
    passenger('punta-cinco-a', 'Trapiche', 'Naranjal', 98),
    cargo('punta-cinco-b', 'Trapiche', 'Canta Callao', 101, 'roofCargo'),
  ];
  return [
    passenger('primer-pasajero', 'Collique', 'Próceres', 8),
    passenger('primer-alternativo', 'Collique', 'Hospital Collique', 11),
    passenger('segundo-pasajero', 'Vista Alegre', 'Universitaria', 31),
    cargo('segundo-alternativo', 'Vista Alegre', 'Trapiche', 34, 'roofCargo'),
    passenger('tercer-pasajero', 'Universitaria', 'Trapiche', 58),
    cargo('carga-terminal', 'Universitaria', 'Canta Callao', 61,
      random() < 0.5 ? 'roofCargo' : 'scooter'),
  ];
}

export function requestFare(request: RideRequest): number {
  return request.baseFare + request.distanceFare;
}

function passengerRequest(
  id: string,
  originStop: string,
  destinationStop: string,
  originX: number,
  destinationX: number,
  random: () => number,
): RideRequest {
  const fare = fareForRoute(originX, destinationX);
  const visualVariant = pick(PEOPLE_VARIANTS, random);
  return {
    id, originStop, destinationStop, originX, destinationX,
    kind: 'passenger',
    massKg: 58 + Math.floor(random() * 20),
    requiredCapacity: 1,
    baseFare: 1,
    distanceFare: fare - 1,
    visualVariant,
    attendantVariant: visualVariant,
    cargoMassKg: 0,
  };
}

function cargoRequestForRoute(
  id: string,
  originStop: string,
  destinationStop: string,
  originX: number,
  destinationX: number,
  kind: Exclude<RequestKind, 'passenger'>,
  random: () => number,
): RideRequest {
  const fare = fareForRoute(originX, destinationX);
  const cargoMassKg = 24 + Math.floor(random() * 27);
  const attendantMassKg = 55 + Math.floor(random() * 20);
  return {
    id, originStop, destinationStop, originX, destinationX,
    kind,
    massKg: cargoMassKg + attendantMassKg,
    requiredCapacity: 1,
    baseFare: 1,
    distanceFare: fare - 1,
    visualVariant: pick(CARGO_VARIANTS, random),
    attendantVariant: pick(PEOPLE_VARIANTS, random),
    cargoMassKg,
  };
}

function fareForRoute(originX: number, destinationX: number): number {
  return Math.max(1, Math.min(5, Math.ceil((destinationX - originX) / 3)));
}

function pick<T>(values: readonly T[], random: () => number): T {
  const value = values[Math.floor(random() * values.length)];
  if (value === undefined) throw new Error('El catálogo de variantes está vacío.');
  return value;
}

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const character of seed) {
    state ^= character.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
