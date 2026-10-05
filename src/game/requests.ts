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
}

const PEOPLE_VARIANTS = ['azul', 'rojo', 'verde', 'amarillo'] as const;
const CARGO_VARIANTS = ['cajas', 'canastas', 'sacos'] as const;

export function generateLevelOneRequests(seed: string): readonly RideRequest[] {
  if (!seed.trim()) throw new Error('La semilla de solicitudes no puede estar vacía.');
  const random = seededRandom(seed);
  return [
    passengerRequest('primer-pasajero', 'Inicio', 'Centro', 5, 12, 10, 5, random),
    passengerRequest('segundo-pasajero', 'Centro', 'Mercado', 15, 22, 10, 5, random),
    cargoRequest(random),
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
  baseFare: number,
  distanceFare: number,
  random: () => number,
): RideRequest {
  return {
    id, originStop, destinationStop, originX, destinationX,
    kind: 'passenger',
    massKg: 58 + Math.floor(random() * 20),
    requiredCapacity: 1,
    baseFare,
    distanceFare,
    visualVariant: pick(PEOPLE_VARIANTS, random),
  };
}

function cargoRequest(random: () => number): RideRequest {
  const kind: RequestKind = random() < 0.5 ? 'roofCargo' : 'scooter';
  return {
    id: 'carga-terminal',
    originStop: 'Mercado',
    destinationStop: 'Terminal',
    originX: 24,
    destinationX: 29,
    kind,
    massKg: 32 + Math.floor(random() * 29),
    requiredCapacity: 1,
    baseFare: 12,
    distanceFare: 8,
    visualVariant: pick(CARGO_VARIANTS, random),
  };
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
