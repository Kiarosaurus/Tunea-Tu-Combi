import { LEVELS } from '../data/levels';
import { emptyInventory, type GameModel, type VehicleCapacity } from './model';
import { generateLevelOneRequests, requestFare, type RideRequest } from './requests';

export type { RideRequest } from './requests';

export const RIDE_DURATION_SECONDS = 30;
export const LEVEL_ONE_FINISH_X = 31;
export const STOP_RADIUS_METERS = 2.5;

export type RequestStatus = 'waiting' | 'onboard' | 'delivered' | 'missed';

export interface RequestProgress {
  readonly request: RideRequest;
  readonly status: RequestStatus;
}

export interface RideSnapshot {
  readonly remainingSeconds: number;
  readonly deliveredRevenue: number;
  readonly deliveredCount: number;
  readonly maximumPayloadMassKg: number;
  readonly requests: readonly RequestProgress[];
  readonly seed: string;
  readonly finished: boolean;
}

export const LEVEL_ONE_REQUESTS = generateLevelOneRequests('primer-recorrido-base');

export class RideSession {
  #remainingSeconds = RIDE_DURATION_SECONDS;
  #deliveredRevenue = 0;
  #deliveredCount = 0;
  #maximumPayloadMassKg = 0;
  #requests: RequestProgress[];
  readonly #seed: string;
  readonly #finishX: number;
  #finished = false;

  constructor(seed = 'primer-recorrido-base', requests = generateLevelOneRequests(seed),
    durationSeconds = RIDE_DURATION_SECONDS, finishX = LEVEL_ONE_FINISH_X) {
    if (!(durationSeconds > 0) || !(finishX > 0)) throw new Error('El intento requiere duración y meta válidas.');
    this.#seed = seed;
    this.#remainingSeconds = durationSeconds;
    this.#finishX = finishX;
    this.#requests = requests.map((request) => ({ request, status: 'waiting' }));
  }

  get snapshot(): RideSnapshot {
    return {
      remainingSeconds: this.#remainingSeconds,
      deliveredRevenue: this.#deliveredRevenue,
      deliveredCount: this.#deliveredCount,
      maximumPayloadMassKg: this.#maximumPayloadMassKg,
      requests: this.#requests.map((progress) => ({ ...progress })),
      seed: this.#seed,
      finished: this.#finished,
    };
  }

  advance(durationSeconds: number, vehicleX: number): void {
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0 || !Number.isFinite(vehicleX)) {
      throw new Error('Tiempo o posición inválidos.');
    }
    if (this.#finished) return;
    this.#remainingSeconds = Math.max(0, this.#remainingSeconds - durationSeconds);
    this.#requests = this.#requests.map((progress) =>
      progress.status === 'waiting' && vehicleX > progress.request.originX + STOP_RADIUS_METERS
        ? { ...progress, status: 'missed' }
        : progress,
    );
    if (this.#remainingSeconds === 0 || vehicleX >= this.#finishX) this.#finished = true;
  }

  collect(requestId: string, vehicleX: number, capacity: VehicleCapacity): void {
    if (this.#finished) throw new Error('El recorrido ya terminó.');
    const progress = this.#requests.find((item) => item.request.id === requestId);
    if (!progress || progress.status !== 'waiting') throw new Error('La solicitud ya no está disponible.');
    if (Math.abs(vehicleX - progress.request.originX) > STOP_RADIUS_METERS) {
      throw new Error('Acércate al paradero de origen.');
    }
    const availableCapacity = capacity[progress.request.kind];
    const onboardCount = this.#requests.filter((item) =>
      item.status === 'onboard' && item.request.kind === progress.request.kind).length;
    if (availableCapacity < progress.request.requiredCapacity || onboardCount >= availableCapacity) {
      throw new Error(capacityError(progress.request.kind));
    }
    this.#setStatus(requestId, 'onboard');
    const payloadMass = this.#requests.filter((item) => item.status === 'onboard')
      .reduce((total, item) => total + item.request.massKg, 0);
    this.#maximumPayloadMassKg = Math.max(this.#maximumPayloadMassKg, payloadMass);
  }

  deliver(vehicleX: number): number {
    if (this.#finished) throw new Error('El recorrido ya terminó.');
    const progress = this.#requests.find((item) => item.status === 'onboard' &&
      Math.abs(vehicleX - item.request.destinationX) <= STOP_RADIUS_METERS);
    if (!progress) throw new Error('No hay un destino de pasajero cercano.');
    const fare = requestFare(progress.request);
    this.#setStatus(progress.request.id, 'delivered');
    this.#deliveredRevenue += fare;
    this.#deliveredCount += 1;
    return fare;
  }

  lose(requestId: string): boolean {
    const progress = this.#requests.find((item) => item.request.id === requestId);
    if (!progress || progress.status !== 'onboard') return false;
    this.#setStatus(requestId, 'missed');
    return true;
  }

  #setStatus(requestId: string, status: RequestStatus): void {
    this.#requests = this.#requests.map((progress) =>
      progress.request.id === requestId ? { ...progress, status } : progress,
    );
  }
}

function capacityError(kind: RideRequest['kind']): string {
  if (kind === 'passenger') return 'Falta un asiento libre para este pasajero.';
  if (kind === 'roofCargo') return 'Falta una parrilla libre para esta carga.';
  return 'Falta un portacarga posterior libre para esta carga.';
}

export function applyRideResult(
  model: GameModel,
  ride: RideSnapshot,
  levelId: string,
): { readonly model: GameModel; readonly won: boolean } {
  if (!ride.finished) throw new Error('El recorrido todavía no terminó.');
  const level = LEVELS.find((candidate) => candidate.id === levelId);
  if (!level) throw new Error('Nivel desconocido.');
  const won = ride.deliveredRevenue >= level.quota;
  const previous = model.completedLevels[levelId];
  const completedLevels = won ? {
    ...model.completedLevels,
    [levelId]: {
      bestRevenue: Math.max(previous?.bestRevenue ?? 0, ride.deliveredRevenue),
      bestDelivered: Math.max(previous?.bestDelivered ?? 0, ride.deliveredCount),
      bestSeed: ride.seed,
    },
  } : model.completedLevels;
  return {
    won,
    model: {
      ...model,
      wallet: model.wallet + (won ? ride.deliveredRevenue : 0),
      pendingPurchases: emptyInventory(),
      unlockedLevel: won ? Math.max(model.unlockedLevel, Math.min(level.number + 1, LEVELS.length)) : model.unlockedLevel,
      completedLevels,
    },
  };
}
