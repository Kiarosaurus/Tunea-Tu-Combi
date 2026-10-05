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
  return generateRequests('primer-recorrido', seed);
}

export function generateRequests(levelId: string, seed: string): readonly RideRequest[] {
  if (!seed.trim()) throw new Error('La semilla de solicitudes no puede estar vacía.');
  const random = seededRandom(seed);
  if (levelId === 'subida-al-cerro') return [
    passengerRequest('cerro-uno', 'Entrada', 'Mirador', 4, 13, 12, 6, random),
    passengerRequest('cerro-dos', 'Mirador', 'Curva alta', 16, 25, 14, 7, random),
    passengerRequest('cerro-tres', 'Curva alta', 'Cumbre', 27, 34, 14, 7, random),
  ];
  if (levelId === 'dia-de-mercado') return [
    passengerRequest('mercado-persona', 'Barrio', 'Mercado', 4, 12, 12, 6, random),
    cargoRequestForRoute('mercado-techo', 'Mercado', 'Mayorista', 14, 24,
      'roofCargo', 18, 9, random),
    cargoRequestForRoute('mercado-scooter', 'Mayorista', 'Terminal', 26, 34,
      'scooter', 18, 9, random),
  ];
  if (levelId !== 'primer-recorrido') throw new Error(`No hay solicitudes para ${levelId}.`);
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
  return cargoRequestForRoute('carga-terminal', 'Mercado', 'Terminal', 24, 29,
    kind, 12, 8, random);
}

function cargoRequestForRoute(
  id: string,
  originStop: string,
  destinationStop: string,
  originX: number,
  destinationX: number,
  kind: Exclude<RequestKind, 'passenger'>,
  baseFare: number,
  distanceFare: number,
  random: () => number,
): RideRequest {
  return {
    id, originStop, destinationStop, originX, destinationX,
    kind,
    massKg: 32 + Math.floor(random() * 29),
    requiredCapacity: 1,
    baseFare,
    distanceFare,
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
