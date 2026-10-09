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
    passengerRequest('cerro-uno-a', 'Collique', 'Vista Alegre', 4, 22, random),
    passengerRequest('cerro-uno-b', 'Collique', 'Hospital Collique', 7, 27, random),
    passengerRequest('cerro-dos-a', 'Vista Alegre', 'Universitaria', 29, 47, random),
    passengerRequest('cerro-dos-b', 'Vista Alegre', 'Trapiche', 32, 52, random),
    passengerRequest('cerro-tres-a', 'Universitaria', 'Canta Callao', 54, 72, random),
    passengerRequest('cerro-tres-b', 'Universitaria', 'Naranjal', 57, 77, random),
    passengerRequest('cerro-cuatro-a', 'Trapiche', 'Canta Callao', 80, 99, random),
    passengerRequest('cerro-cuatro-b', 'Trapiche', 'Naranjal', 83, 102, random),
  ];
  if (levelId === 'dia-de-mercado') return [
    passengerRequest('mercado-uno-a', 'Collique', 'Próceres', 4, 18, random),
    cargoRequestForRoute('mercado-uno-b', 'Collique', 'Hospital Collique', 7, 24,
      'roofCargo', random),
    passengerRequest('mercado-dos-a', 'Vista Alegre', 'Universitaria', 29, 44, random),
    cargoRequestForRoute('mercado-dos-b', 'Vista Alegre', 'Trapiche', 32, 49,
      'scooter', random),
    cargoRequestForRoute('mercado-tres-a', 'Universitaria', 'Trapiche', 55, 70,
      'roofCargo', random),
    passengerRequest('mercado-tres-b', 'Universitaria', 'Canta Callao', 58, 75, random),
    cargoRequestForRoute('mercado-cuatro-a', 'Trapiche', 'Naranjal', 81, 98,
      'scooter', random),
    passengerRequest('mercado-cuatro-b', 'Trapiche', 'Canta Callao', 84, 104, random),
  ];
  if (levelId === 'pista-danada') return [
    passengerRequest('pista-uno-a', 'Collique', 'Próceres', 4, 19, random),
    cargoRequestForRoute('pista-uno-b', 'Collique', 'Hospital Collique', 7, 24,
      'roofCargo', random),
    cargoRequestForRoute('pista-dos-a', 'Vista Alegre', 'Universitaria', 31, 47,
      'roofCargo', random),
    passengerRequest('pista-dos-b', 'Vista Alegre', 'Trapiche', 34, 52, random),
    passengerRequest('pista-tres-a', 'Universitaria', 'Trapiche', 59, 75, random),
    cargoRequestForRoute('pista-tres-b', 'Universitaria', 'Canta Callao', 62, 80,
      'scooter', random),
    cargoRequestForRoute('pista-cuatro-a', 'Trapiche', 'Naranjal', 86, 103,
      'scooter', random),
    passengerRequest('pista-cuatro-b', 'Trapiche', 'Canta Callao', 89, 109, random),
  ];
  if (levelId === 'hora-punta') return [
    passengerRequest('punta-uno-a', 'Collique', 'Próceres', 3, 18, random),
    cargoRequestForRoute('punta-uno-b', 'Collique', 'Hospital Collique', 6, 23,
      'roofCargo', random),
    cargoRequestForRoute('punta-dos-a', 'Próceres', 'Hospital Collique', 25, 41,
      'roofCargo', random),
    passengerRequest('punta-dos-b', 'Próceres', 'Universitaria', 28, 46, random),
    passengerRequest('punta-tres-a', 'Hospital Collique', 'Trapiche', 49, 65, random),
    cargoRequestForRoute('punta-tres-b', 'Hospital Collique', 'Canta Callao', 52, 70,
      'scooter', random),
    cargoRequestForRoute('punta-cuatro-a', 'Universitaria', 'Canta Callao', 73, 90,
      'scooter', random),
    passengerRequest('punta-cuatro-b', 'Universitaria', 'Naranjal', 76, 95, random),
    passengerRequest('punta-cinco-a', 'Trapiche', 'Naranjal', 98, 114, random),
    cargoRequestForRoute('punta-cinco-b', 'Trapiche', 'Canta Callao', 101, 117,
      'roofCargo', random),
  ];
  if (levelId !== 'primer-recorrido') throw new Error(`No hay solicitudes para ${levelId}.`);
  return [
    passengerRequest('primer-pasajero', 'Collique', 'Próceres', 8, 22, random),
    passengerRequest('primer-alternativo', 'Collique', 'Hospital Collique', 11, 28, random),
    passengerRequest('segundo-pasajero', 'Vista Alegre', 'Universitaria', 31, 45, random),
    cargoRequestForRoute('segundo-alternativo', 'Vista Alegre', 'Trapiche', 34, 52,
      'roofCargo', random),
    passengerRequest('tercer-pasajero', 'Universitaria', 'Trapiche', 58, 72, random),
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
  return cargoRequestForRoute('carga-terminal', 'Universitaria', 'Canta Callao', 61, 82,
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
