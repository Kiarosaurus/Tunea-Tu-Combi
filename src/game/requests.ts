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
  if (levelId === 'subida-al-cerro') return [
    passengerRequest('cerro-uno', 'Collique', 'Vista Alegre', 4, 13, random),
    passengerRequest('cerro-dos', 'Vista Alegre', 'Universitaria', 16, 25, random),
    passengerRequest('cerro-tres', 'Universitaria', 'Canta Callao', 27, 34, random),
  ];
  if (levelId === 'dia-de-mercado') return [
    passengerRequest('mercado-persona', 'Collique', 'Próceres', 4, 12, random),
    cargoRequestForRoute('mercado-techo', 'Vista Alegre', 'Universitaria', 14, 24,
      'roofCargo', random),
    cargoRequestForRoute('mercado-scooter', 'Universitaria', 'Canta Callao', 26, 34,
      'scooter', random),
  ];
  if (levelId === 'pista-danada') return [
    passengerRequest('pista-persona', 'Collique', 'Próceres', 4, 12, random),
    cargoRequestForRoute('pista-techo', 'Vista Alegre', 'Universitaria', 14, 25,
      'roofCargo', random),
    cargoRequestForRoute('pista-scooter', 'Universitaria', 'Canta Callao', 27, 37,
      'scooter', random),
  ];
  if (levelId === 'hora-punta') return [
    passengerRequest('punta-uno', 'Collique', 'Próceres', 3, 10, random),
    cargoRequestForRoute('punta-techo', 'Próceres', 'Hospital Collique', 11, 20,
      'roofCargo', random),
    cargoRequestForRoute('punta-scooter', 'Hospital Collique', 'Trapiche', 21, 30,
      'scooter', random),
    passengerRequest('punta-dos', 'Trapiche', 'Canta Callao', 31, 39, random),
  ];
  if (levelId !== 'primer-recorrido') throw new Error(`No hay solicitudes para ${levelId}.`);
  return [
    passengerRequest('primer-pasajero', 'Collique', 'Próceres', 5, 12, random),
    passengerRequest('segundo-pasajero', 'Vista Alegre', 'Hospital Collique', 15, 22, random),
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

function cargoRequest(random: () => number): RideRequest {
  const kind: RequestKind = random() < 0.5 ? 'roofCargo' : 'scooter';
  return cargoRequestForRoute('carga-terminal', 'Universitaria', 'Trapiche', 24, 29,
    kind, random);
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
